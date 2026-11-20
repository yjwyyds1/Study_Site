---
title: "LogScan v3：有界 TCP 日志服务与持久化原型"
description: "在 LogScan v2 归档能力之上集成 127.0.0.1 TCP 分帧接入、容量有界队列背压、SQLite 事务确认、优雅排空退出与 E3a–E3e 集成压测。"
order: 4
tags: ["LogScan", "C++20", "综合项目", "CMake", "并发", "网络", "SQLite"]
related:
  - labs/logscan-v2
  - labs/logscan-build
  - handbook/concurrency-queue
  - handbook/network-tcp
  - handbook/storage-sqlite
sources: []
---

## 项目定位与目标

在 [LogScan v0.1](../logscan-build/) 和 [LogScan v1](../logscan-v1/) 里，你完成了可单测的 `logscan_core` 与多文件整批聚合；在 [LogScan v2](../logscan-v2/) 里，你打通了 Linux/WSL2 下的 SQLite 归档、索引计划与主键冲突回滚。

现在我们把整条链路收束为**综合集成项目 `LogScan v3（E3）`**——一个绑定本地回环地址 `127.0.0.1` 的**有界 TCP 日志服务**：

```text
[ TCP 客户端 (127.0.0.1) ]  ── 唯一消息 ID + 4 字节大端长度前缀帧 ──┐
                                                                     ▼
[ 网络接入层 (SO_RCVTIMEO=1s) ] ── try_decode_frame (上限 4096B / 可配 64KB)
                                                                     │
  背压限流 (容量 2) ──→ [ BoundedQueue<Message> ] ── 队列事件记录「已接受 ID」
                                                                     │
                                                                     ▼
[ 工作线程 (std::thread) ] ──→ [ logscan_core 解析 ] ──→ [ SQLite 事务 COMMIT ]
                                                                     │
[ 客户端计入成功 ] ◄─────────────── 落盘提交后才回发 ACK ─────────────┘
```

先修要求：完成 [LogScan v2](../logscan-v2/)，并学完第 3 阶段的 [Linux 与进程 I/O](../../handbook/linux-process-io/)、[多线程有界队列](../../handbook/concurrency-queue/)、[TCP 协议分帧](../../handbook/network-tcp/) 和 [SQLite 持久化](../../handbook/storage-sqlite/)。

## 一、书面协议与运行约束（必须先定清再写代码）

在动工之前，把所有边界参数与交付语义写成明确契约（写入项目 README 与配置头）：

| 约束项 | E3 练习默认取值 | 说明与生产可配范围 |
| --- | --- | --- |
| 监听地址 | `127.0.0.1` | 仅绑定本地回环，配合临时目录 SQLite 文件做可重复集成测试 |
| 帧头格式 | 4 字节无符号大端整数（`uint32_t`） | 网络字节序（`htonl` / `ntohl`），紧跟正文负载 |
| 最大帧长度 | **`4096` 字节**（练习回归） | 生产可配上限 `65536`（64KB）；练习中发 `4097` 字节即触发超长拒绝 |
| 队列容量 | **`2`**（背压与排空测试） | 压测时可配置更大容量，但必须有界以防 OOM |
| 读超时 | **`1` 秒**（`SO_RCVTIMEO`） | 半帧长时间不补齐时超时断连，避免慢连接占死工作句柄 |
| 「已接受」定义 | 成功 `push` 进有界队列 | 每条测试消息带唯一 ID，由队列事件记录已接受的 ID |
| 「成功」定义 | **SQLite `COMMIT` 后才发 ACK** | 客户端只有在收到服务端 ACK 后才计入成功 |
| 过载策略（背压） | 队列满时入口暂停等待或按约定拒绝 | 二选一写明并在 E3b 给出实证，严禁无限缓存 |
| 关闭顺序（排空） | 停接入 → `queue.close()` → 排空提交 → `join()` → 关库 | 确保所有已接受任务全部落盘后再退出 |

## 二、推荐工程目录结构与 `CMakeLists.txt`

在 WSL2 / Linux 的 `~/cpp-work/logscan-v3/` 下组织源码（职责分层，便于先用内存切块测分帧，再上真实 Socket）：

```text
logscan-v3/
  CMakeLists.txt
  include/
    logscan_core.hpp
    bounded_queue.hpp
    framing.hpp
    log_store.hpp
    tcp_server.hpp
  src/
    logscan_core.cpp
    framing.cpp
    log_store.cpp
    tcp_server.cpp
    main.cpp
  tests/
    pipeline_test.cpp
    bench_client.cpp
```

```cmake
cmake_minimum_required(VERSION 3.20)
project(logscan_v3 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Threads REQUIRED)
find_package(SQLite3 REQUIRED)

add_library(logscan_engine
  src/logscan_core.cpp
  src/framing.cpp
  src/log_store.cpp
  src/tcp_server.cpp
)
target_include_directories(logscan_engine PUBLIC include)
target_link_libraries(logscan_engine PUBLIC Threads::Threads SQLite::SQLite3)
target_compile_options(logscan_engine PRIVATE -Wall -Wextra -Wpedantic)

add_executable(logscan_service src/main.cpp)
target_link_libraries(logscan_service PRIVATE logscan_engine)

add_executable(bench_client tests/bench_client.cpp)
target_link_libraries(bench_client PRIVATE logscan_engine)

enable_testing()
add_executable(pipeline_test tests/pipeline_test.cpp)
target_link_libraries(pipeline_test PRIVATE logscan_engine)
add_test(NAME pipeline_test COMMAND pipeline_test)
```

## 跨线程回执与 Socket 归属架构

多连接服务端最容易踩出的隐蔽 Bug，是把原始 `int client_fd` 或连接对象指针直接塞进任务队列，让后台 SQLite 落盘线程在 `COMMIT` 后去调用 `send(client_fd, ...)`。这会同时制造三类致命问题：

1. **双线程竞态写同一个 `client_fd`**：连接线程可能因超时或客户端断连正在关闭 `client_fd`，而工作线程同时往同一描述符 `send`，导致字节交错、`EBADF` 或未定义行为。
2. **文件描述符复用误发（FD Reuse）**：连接线程刚 `close(fd=7)`，OS 立刻把 `fd=7` 分配给新连进来的客户端 B；此时工作线程慢半拍向 `fd=7` 发回执，客户端 B 就会收到不属于自己的 ACK。
3. **悬空指针（Dangling Pointer）**：若队列里存连接对象的裸指针，客户端超时断连并销毁对象后，工作线程就会踩中 Use-After-Free。

### 解法：Socket 单线程独享 + `std::promise<bool>` 回执

守住一条铁律：**每个 `client_fd` 从 `accept()` 到 `close()` 只归它的连接处理线程独享；DB 工作线程永远不碰任何 `client_fd`，只通过任务自带的 `std::promise<bool>` 回传落盘结果。**

```text
[ 连接处理线程 (独享 client_fd) ]              [ DB 工作线程 (独享 sqlite3*) ]
   │                                              │
   ├─ 1. recv + try_decode_frame                  │
   ├─ 2. 构造 LogTask + 取出 future:              │
   │     fut = task.committed.get_future()        │
   ├─ 3. queue.push(std::move(task)) ──[有界队列]─┼─► 4. queue.pop()
   │                                              │   5. logscan_core 解析
   ├─ 6. 等待 fut.wait_for(超时/结果)             │   6. SQLite BEGIN..COMMIT
   │     ├─ 收到 true  → send_ack(client_fd)      │   7. committed.set_value(true)
   │     ├─ 收到 false → 写错误诊断并 close(fd)   │      (异常/回滚则 set_value(false))
   │     └─ 客户端已断连/超时 → 直接 close(fd)    │
   │        (heap 上的 promise 共享状态自动保活， │
   │         worker 后续 set_value 零悬空指针！)  │
```

下面的 C++20 模式展示了核心数据结构与跨线程交接方式（`std::promise` 与 `std::future` 共享堆上控制块，连接线程即使提前退出，工作线程调用 `set_value` 依然安全）：

```cpp
#include <chrono>
#include <cstdint>
#include <future>
#include <string>

struct LogTask {
    std::uint64_t id;
    std::string line;
    std::promise<bool> committed;
};

// 连接处理线程侧：先取 future，再 move 任务入队
bool submit_and_wait_ack(BoundedQueue<LogTask>& queue,
                         std::uint64_t msg_id,
                         std::string payload,
                         std::chrono::milliseconds timeout) {
    LogTask task{msg_id, std::move(payload), std::promise<bool>{}};
    std::future<bool> fut = task.committed.get_future();

    if (!queue.push(std::move(task))) {
        return false;  // 服务正在关闭，拒绝新任务
    }
    if (fut.wait_for(timeout) != std::future_status::ready) {
        return false;  // 超时后连接线程自行 close(client_fd)，无悬空指针
    }
    try {
        return fut.get();  // 仅在 SQLite COMMIT 后返回 true，再由本线程写 ACK
    } catch (const std::future_error&) {
        return false;  // worker 异常退出未设值（broken_promise）
    }
}

// DB 工作线程侧：只操作 sqlite3*，严禁触碰任何 client_fd
void db_worker_step(LogTask& task, LogStore& store) {
    bool ok = false;
    try {
        ok = store.commit_log_line(task.id, task.line);
    } catch (...) {
        ok = false;
    }
    task.committed.set_value(ok);
}
```

> **若需要单连接流水线（Pipelining）扩展**：后续若想允许单个连接连续发送多条帧而不每条阻塞等待，可把“每连接一个待确认队列”或“eventfd/通知管道唤醒连接线程的发送循环”封装在同一个连接线程内，**依然保持只有连接线程能向 `client_fd` 调用 `send`/`close`**。

## 三、分步可验证微里程碑（Step 1 ~ Step 4 Checkpoints）

不要一口气把 TCP、线程和 SQLite 全写完再调。严格按下面 4 个可独立编译验证的小步推进，每步写完立刻用最小输入过关再进下一步：

### Step 1：纯内存分帧（`framing.hpp/.cpp` → 对应 E3a）
- **写哪几个函数**：`encode_frame(uint64_t id, std::string_view body)`（或 4 字节大端长度头 + 负载）、`try_decode_frame(std::string& recv_buf, std::size_t max_frame_bytes)`（返回值区分「需要更多字节 / 完整帧 / 长度越界」）。
- **用什么最小输入测**：在 `pipeline_test.cpp` 不开任何 socket，手动把第 1 帧切成 `2 字节半头`、`半截正文`、`剩余字节` 三段依次 `append` 进 `recv_buf`；再把第 2、3 帧粘进同一块内存；最后塞一个长度头为 `4097` 的头。
- **看到什么输出才过关**：凑齐第 1 帧前交付计数为 `0`；3 帧全喂完后按原序恰好吐出 `3` 条且 `recv_buf.empty() == true`；`4097` 帧立刻返回超限错误而非申请 4KB+ 内存。

### Step 2：有界队列与测试同步点（`bounded_queue.hpp` → 对应 E3b）
- **写哪几个函数**：`BoundedQueue<LogTask>` 的 `push`、`pop`、`close`、`peak_depth()`，以及给消费线程预留的可选条件变量闸门 `TestGate`（`pause()` / `resume()` / `wait_until_accepted(n)`）。
- **用什么最小输入测**：把队列容量设为 `2`，开启 `TestGate::pause()` 冻住消费者线程；主线程连续提交 `3` 条带唯一 ID 的 `LogTask`（第 3 条在独立线程提交或采用非阻塞尝试模式），随后调用 `resume()`。
- **看到什么输出才过关**：观测到 `peak_depth() <= 2`，第 3 条在解堵前被阻塞（或按策略拒绝），`resume()` 后 3 条任务按 FIFO 全部消费并触发 `committed.set_value(true)`，无死锁。

### Step 3：127.0.0.1 TCP 接入与故障隔离（`tcp_server.cpp` → 对应 E3c）
- **写哪几个函数**：`FdGuard`（RAII 关闭 `fd`）、`start_listen("127.0.0.1", port)`（设 `SO_REUSEADDR`）、`handle_client(int client_fd)`（设 `SO_RCVTIMEO = 1s`，逐块 `recv` 调 `try_decode_frame` 再走 `submit_and_wait_ack`）。**本步先用返回 `true` 的内存桩替代真实 SQLite**。
- **用什么最小输入测**：同时发起 1 条健康连接 + 3 条故障连接：① 发半帧后 `close`；② 发长度头 `4097`；③ 发 `2 字节` 半头后静默 `1.2s` 触发超时。
- **看到什么输出才过关**：`stderr` 打印出 3 条**可区分原因**的诊断日志（`truncated_frame` / `frame_too_large` / `recv_timeout`），`0` 条故障消息入队；与此同时健康连接正常收到 ACK。

### Step 4：接通 SQLite `LogStore` 落盘与优雅排空（`log_store.cpp` + `main.cpp` → 对应 E3d / E3e）
- **写哪几个函数**：`LogStore::commit_log_line(id, line)`（延续 v2 的 `DbPtr`/`StmtPtr` + `BEGIN..INSERT..COMMIT` 事务）以及按序收尾的 `shutdown_sequence()`（停 `accept` → 关监听 `fd` → `queue.close()` → 工作线程排空提交 → `join()` → 关库）。
- **用什么最小输入测**：用 `TestGate` 暂停消费者，等到 `2` 个指定 ID 成功 `push`（记为「已接受」），立刻触发 `shutdown_sequence()` 并放开消费者；通过后用 `TSan` 编译重跑全部用例，再用 `bench_client` 跑 3 轮固定压测。
- **看到什么输出才过关**：重启并重开临时 SQLite 库后恰好查到那 `2` 个 ID；`build-tsan` 下 `ctest` 零数据竞争；3 轮压测每轮满足 `success + rejected + timeout + disconnect + other_errors == total_attempts`。

### E3a–E3e 自动化验收对照表

在 `tests/pipeline_test.cpp` 与 `tests/bench_client.cpp` 完整覆盖下表 5 项验收实验：

| 实验编号 | 输入与操作 | 必须保存的预期证据 |
| --- | --- | --- |
| **E3a 分帧** | 把第 1 帧拆成**半头（2B）+ 半体 + 剩余字节**依次喂入；下一批把第 2、3 帧粘在一起连送 | 未凑齐完整帧时交付数为 `0`；完整后按原顺序恰好交付 `3` 条，缓冲区归零 |
| **E3b 防止积压** | 用同步点暂停消费者；向容量为 `2` 的队列提交 `3` 条带唯一 ID 的消息；随后解除暂停 | 观测到队列深度上限 `<= 2`，第 3 条触发背压暂停或按约定拒绝；解堵后全部正常处理 |
| **E3c 错误连接** | 分别发起 3 类故障：① 传一半断开；② 长度头 `4097`（`> 4096`）；③ 发半帧后静默超过 `1s` 超时；同时跑 1 条健康连接 | 3 条异常输入均 `0` 入库，stderr/日志有可区分的 3 种诊断，健康连接正常收到 ACK 并入库 |
| **E3d 退出恢复** | 消费者暂停时，等到 `2` 个指定 ID 已成功入队（已接受）；随后发出停止请求并放开消费者 | 服务停止接收新帧，排空并 `COMMIT` 这 `2` 条任务，所有线程 `join()` 退出；重启重开数据库查到**恰好这 2 个 ID** |
| **E3e 固定负载** | 固定夹具、并发连接数、预热时间与持续时间，独立运行 **3 轮** | 保存每轮：发送尝试数、成功/拒绝/超时/断连/其他失败明细（总和严格等于发送尝试数）、成功吞吐（msg/s）、客户端侧端到端 `p95/p99` 延迟、峰值队列深度与进程 RSS，并注明采样口径 |

> **E3e 计时与核对口径**：每条请求的延迟必须从**客户端首次 `send` 帧字节**开始计时，到**收到服务端 `COMMIT` 后的 ACK** 结束；3 轮各自独立计算百分位（不要把 3 轮混成一个大数组掩盖抖动），并强制断言 `success + rejected + timeout + disconnect + other_errors == total_attempts`。

## 四、构建、运行、TSan 与压测命令

在 WSL2 / Linux 的 `~/cpp-work/logscan-v3/` 执行：

```bash
# 1. Debug 构建并运行 E3a–E3d 自动化集成测试
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure

# 2. 用 ThreadSanitizer 检查多线程并发数据竞争
cmake -S . -B build-tsan -G Ninja -DCMAKE_BUILD_TYPE=Debug \
  -DCMAKE_CXX_FLAGS="-fsanitize=thread -g -O1"
cmake --build build-tsan
ctest --test-dir build-tsan --output-on-failure

# 3. E3e 固定负载三轮基线（临时库，每轮独立统计并采集 RSS）
for round in 1 2 3; do
  DB=$(mktemp -d)/bench-r${round}.db
  ./build/logscan_service --bind 127.0.0.1 --port 19090 --db "$DB" --max-frame 4096 --queue-cap 64 &
  SRV_PID=$!
  sleep 0.2
  ./build/bench_client --host 127.0.0.1 --port 19090 --conns 4 --warmup 2s --duration 10s
  grep -E 'VmHWM|VmRSS' "/proc/${SRV_PID}/status"
  kill -TERM "$SRV_PID" && wait "$SRV_PID"
done
```

## 五、面试讲解自检清单（整理进简历前必答）

1. **为什么队列要设容量上限（背压）？**
   - 当网络接收远快于磁盘 SQLite 写入时，有界队列把上游压力挡在边界（阻塞或拒绝），防止内存无限膨胀导致 OOM，同时让延迟与队列深度可预测。
2. **「已接受」和「成功」为什么要分开定义？**
   - 成功入队仅代表服务端接管了任务（用于验证排空契约）；只有 SQLite `COMMIT` 落盘后再回发 ACK，客户端才记为成功，避免进程崩溃时出现“客户端以为成功、数据库实际丢数据”的假成功。
3. **退出时如何保证队列里已接受的日志零丢失？**
   - 严格按「停接入 → `queue.close()` 唤醒所有线程 → 消费者排空剩余任务并提交事务 → `join()` 汇合全部线程 → 关闭数据库连接」顺序收尾。
4. **为什么 TCP 分帧必须同时做最大帧长限制和读超时？**
   - 最大帧长（如 `4096` / `65536`）防御恶意超大长度头撑爆 `recv_buf`；读超时（`SO_RCVTIMEO`）防御慢速半包攻击（Slowloris）长期占死连接与文件描述符。
5. **压测报告里为什么要同时记录 `p95/p99`、峰值队列深度和 RSS，还要核对结果守恒？**
   - 平均延迟会掩盖 SQLite `fsync` 引发的长尾抖动；队列峰值和 RSS 证明背压确实生效；而 `成功 + 各类失败 == 发送尝试数` 防止压测脚本漏计超时或静默断连导致数据失真。

## 脱拐杖横向迁移挑战：MiniKV TCP 服务

> **规则（15–30 分钟独立迁移）**：在全新的目录 `~/cpp-work/minikv-service/` 里，沿用「有界队列 + 单线程 Socket 归属 + `std::promise` 回执 + SQLite 持久化 + 优雅排空」架构，从零实现一个本地回环 TCP 键值存储服务 `minikv_service`，**不提供参考源码**。

### 协议与架构规格

1. **传输与安全边界**：监听 `127.0.0.1`，沿用 4 字节大端长度前缀帧（`max_frame = 4096`）、每连接 `SO_RCVTIMEO = 1s`、`BoundedQueue<KvTask>` 容量默认 `4`。连接线程独享 `client_fd`，通过 `std::promise<std::string>` 等待 DB 工作线程执行 SQLite 操作后再回发长度前缀响应帧。
2. **数据表与文本命令协议**（帧正文为单行 UTF-8 文本，操作 `kv(k TEXT PRIMARY KEY, v TEXT NOT NULL)`）：
   - `SET <key> <value>`（`key`、`value` 不含空格）：工作线程在事务中执行 `INSERT INTO kv(k, v) VALUES(?, ?) ON CONFLICT(k) DO UPDATE SET v = excluded.v;` 并 `COMMIT`，随后回发响应帧 `OK`。
   - `GET <key>`：工作线程参数化查询 `SELECT v FROM kv WHERE k = ?;`，命中返回 `VAL <value>`，未命中返回 `NOT_FOUND`。
   - `DEL <key>`：工作线程在事务中执行 `DELETE FROM kv WHERE k = ?;` 并 `COMMIT`，按 `sqlite3_changes(db)` 返回 `DELETED 1` 或 `DELETED 0`。
   - 语法错误或未知命令：不触碰 SQLite，直接回发 `ERR invalid_command`。
3. **优雅退出**：收到 `SIGTERM` / `SIGINT` 后按「停接入 → `queue.close()` → 排空已入队写请求并 `COMMIT` → `join()` → 关库」收尾。

### 必须通过的三项验收输出

| 验收场景 | 输入操作 | 预期可观测结果 |
| --- | --- | --- |
| **1. 拆包与粘包** | 客户端把 `SET a 1` 拆成两次 `write` 发送；紧接着把 `SET b 2` 与 `GET a` 粘在同一缓冲区一次发完 | 服务端依次回发 `OK`、`OK`、`VAL 1`，无丢帧或粘包错乱 |
| **2. 排空与落盘重启** | 暂停 DB 工作线程，待 `SET k1 v1` 与 `SET k2 v2` 入队后立刻向服务端发 `SIGTERM`；进程退出后用同一 `--db` 重启并查询 `GET k1` / `GET k2` | 原进程无丢任务退出；新进程返回 `VAL v1` 与 `VAL v2` |
| **3. 故障隔离与 TSan** | 同时发起 `4097B` 超长帧、发半帧静默 `1.2s` 超时连接，以及一条健康连接执行 `SET x 42` + `GET x` | 两条故障连接断开且 stderr 留下不同原因诊断；健康连接收到 `OK` / `VAL 42`；`-fsanitize=thread` 下全套 `ctest` 零竞争报警 |
