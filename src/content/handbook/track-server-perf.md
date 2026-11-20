---
title: "方向篇（上）：高并发服务端架构、RPC、限流观测与 P99 性能调优"
description: "覆盖 TRK-09 至 TRK-22：Reactor vs Proactor (io_uring)、One-Loop-Per-Thread、非阻塞缓冲与时间轮、双缓冲异步日志、Protobuf/FlatBuffers 序列化、RPC 与限流熔断、优雅退出幂等与回滚、Prometheus/OTel 可观测性、SO_REUSEPORT、perf 剖析与自动化回归门禁。"
order: 120
category: "方向选修"
tags: ["Linux", "epoll", "io_uring", "RPC", "性能剖析", "perf", "systemd", "C++20", "方向课"]
related: ["handbook/network-tcp", "handbook/concurrency-queue", "handbook/storage-sqlite", "handbook/linux-process-io", "labs/logscan-service"]
sources: []
---

## 本课只解决这 1 类问题

写通单个 Socket 收发只是玩具，工业级高并发服务端必须扛住：**慢客户端占死连接、百万长连接内存爆炸、序列化与异步日志拖慢主循环、下游雪崩引发级联超时、收到 `SIGTERM` 如何不丢不重优雅重启、上线后 P99 飙高怎么靠 `perf` 定责而不是猜。**

本篇覆盖 **`TRK-09` ~ `TRK-22`**，在完整保留 [LogScan v3 服务端](../../labs/logscan-service/) 状态机、容量与 `perf` 验证代码的同时，帮你建立完整的高并发后端系统架构视野。

---

## 第一部分：事件循环与服务端网络骨架（`TRK-09` ~ `TRK-12`）

### 1. Reactor vs Proactor（`io_uring`）事件驱动模型（`TRK-09`）

| 模型 | 谁完成真正的 `read/write` 数据拷贝？ | Linux 代表实现 | 适用场景 |
| --- | --- | --- | --- |
| **Reactor（反应堆）** | 内核只通知“可读/可写就绪”，**用户态线程自己调用 `recv/send` 拷贝** | `epoll`（Nginx、Redis、Muduo、Netty） | 工业网络服务绝对主流，稳定成熟 |
| **Proactor（前摄器）** | 用户提交读写请求及目标缓冲后先返回，**内核直接异步搬完数据再通知已完成** | Linux **`io_uring`**、Windows IOCP | 超高频磁盘异步 I/O 与极低系统调用开销服务端 |

### 2. 多进程 vs 多线程与 `One-Loop-Per-Thread`（`TRK-10`）

C++ 网络框架（以经典 `muduo` 为代表）黄金并发范式是 **One-Loop-Per-Thread + ThreadPool**：
- **Main Reactor 线程**：只专心 `accept` 新连接，按轮询（Round-Robin）把新 `fd` 分发给固定的 IO Sub-Reactor；
- **IO Sub-Reactor 线程组**（数量 $\approx$ CPU 核数）：每条连接终身固定只归属其中 1 个事件循环线程读写分帧，**连接的接收/发送缓冲零锁竞争！**
- **业务 / 落盘线程池**：遇到重 CPU 计算或阻塞磁盘/SQLite 操作时扔进有界队列，算完再发回原 IO 线程发送响应。

### 3. `epoll` 连接状态机、非阻塞 `out_buf` 与截止时间（`TRK-11`）

`poll()` 每次都要把所有描述符数组从用户态拷进内核并线性扫描；`epoll` 通过内核红黑树维护关注集合，只把**真正就绪**的连接放进就绪链表，单线程事件循环即可轻松支撑上万条并发连接，再由后端 `BoundedQueue` + 工作线程做解析与 SQLite 落盘：

```text
           [epoll_wait(100ms)] ── 就绪事件 ──▶ 查 ConnTable[fd]
                  ▲                                   │
                  │                       ┌───────────┴───────────┐
           超时扫描器 (100ms)             ▼                       ▼
     now >= frame_deadline 或        EPOLLIN (读半包/粘包)    EPOLLOUT (发 ACK)
     now >= idle_deadline?                │                       │
       └─ 是 → 服务端主动 close_conn()    ▼                       ▼
               并 active_conns--     in_buf 追加并拆帧       写空 out_buf 后
                                      ├─ 半帧: 更新进度      取消关注 EPOLLOUT
                                      └─ 整帧: push 队列
```

每个非阻塞连接（`O_NONBLOCK`）必须把**状态、缓冲区和两类截止时间**收拢进独立结构体，绝不能在 `recv()` 返回 `EAGAIN` 时卡住等下一半：

```cpp
#include <chrono>
#include <cstdint>
#include <vector>

using Clock = std::chrono::steady_clock;

enum class ConnPhase { ReadingHeader, ReadingBody, Queued, WritingAck, Closing };

struct Connection {
    int fd = -1;
    ConnPhase phase = ConnPhase::ReadingHeader;
    std::vector<std::uint8_t> in_buf;
    std::vector<std::uint8_t> out_buf;
    std::size_t out_sent = 0;

    Clock::time_point idle_deadline{};   // 长时间无任何字节到达 → 踢掉空闲连接
    Clock::time_point frame_deadline{};  // 收到第1字节后必须在 1s 内收完本帧
    bool frame_in_progress = false;

    static constexpr std::size_t kMaxInBuf = 64 * 1024;
    static constexpr std::size_t kMaxFrame = 4096;
};
```

**谁负责关闭连接？** 只要发生以下任一条件，一律由**服务端事件循环**主动调用 `epoll_ctl(EPOLL_CTL_DEL)` + `close(fd)` 并把 `active_conns` 减 1：
1. `recv()` 返回 `0`（对端正常关闭写端）或不可恢复错误（排除 `EINTR`/`EAGAIN`）；
2. `in_buf.size() > Connection::kMaxInBuf` 或解析出的帧头 `len > Connection::kMaxFrame`（防内存打爆）；
3. `Clock::now() >= conn.frame_deadline`（慢客户端只发半帧）或 `Clock::now() >= conn.idle_deadline`；
4. 若使用边缘触发 `EPOLLET`，必须在 `EPOLLIN` 回调中**循环 `read()` 直到返回 `-1 && errno == EAGAIN`**，否则内核不会再次提醒缓冲区剩余字节。

#### 双客户端交互追踪表（`TRK-11` 验收情景）

| 时刻 `t` | 客户端 A（慢连接） | 客户端 B（正常连接） | 服务端状态与 `active_conns` |
| --- | --- | --- | --- |
| `0ms` | 建立连接，仅发 `00 00 00 0A`（声明 10B，停在半帧） | — | A 进入 `ReadingBody`，设 `frame_deadline = 1000ms`，`active=1` |
| `120ms` | 无新字节 | 连接并发送完整 14B 帧 `"INFO ready"` | B 立刻拆出整帧入队，入库后回发 ACK，**B 零阻塞**，`active=2` |
| `1050ms` | 仍未补齐后 10B | 已收到 ACK 并正常断开（`active=1`） | `epoll_wait` 返回后定时扫描命中 `now >= A.frame_deadline` |
| `1051ms` | 收到 TCP `FIN`/连接断开 | — | 记录 `timeout_closed++`，清理 `ConnTable[A.fd]`，**`active=0`** |

### 4. 时间轮（Timing Wheel）清理空闲长连接（`TRK-12`）

如果有 10 万条长连接，每秒全表扫一遍 `idle_deadline` 太慢，维护最小堆又有 $\mathcal{O}(\log N)$ 调整成本。工业级方案用**时间轮（环形槽数组，比如 60 个槽代表 60 秒）**：每个槽挂一个哈希集合或双向链表，指针每秒往前走 1 格；连接一旦有新报文就挪到“当前指针 + 59”的新槽里；指针走到的旧槽里还没挪走的连接**全部一键踢断**，插入、续期和淘汰全部严格 **$\mathcal{O}(1)$**！

---

## 第二部分：日志、协议序列化与治理（`TRK-13` ~ `TRK-19`）

### 5. 高吞吐双缓冲异步日志设计（`TRK-13`）

热路径线程如果直接调 `fprintf`/`write` 打日志，磁盘一次卡顿就会把所有工作线程冻住。**双缓冲异步日志（如 `muduo::AsyncLogging` / `spdlog`）**：前端工作线程只用几十纳秒向内存缓冲 `current_buf` 追加字节；写满后与备用缓冲 `next_buf` 原子/微锁指针交换并唤醒后端写盘线程批量 `fwrite` 刷盘，前端永不碰磁盘 I/O！

### 6. 序列化选型：JSON vs Protobuf vs FlatBuffers（`TRK-14`）

| 协议格式 | 人类可读性 | 编码后体积 & 编解码速度 | 典型场景 |
| --- | --- | --- | --- |
| **JSON** | 极佳 | 较冗余（带重复字段名），解析开销高 | 公网 REST API、配置文件 |
| **Protobuf** | 二进制不可读 | 紧凑（Varint + Tag），C++/Go/Rust 强类型生态极佳 | 微服务内部 **gRPC** 事实标准 |
| **FlatBuffers / Cap'n Proto** | 二进制不可读 | **零反序列化（Zero-copy Parse）**，收到字节直接按偏移读字段 | 游戏高频帧同步、共享内存 IPC |

### 7. RPC 框架核心剖析与超时传播（`TRK-15`）

一次远程调用 `UserService.GetProfile(req)` 在底层等于：**客户端 Stub 打包序列化请求（附带唯一 `request_id` 与剩余 `deadline_ms`） → 连接池发往负载均衡选出的节点 → 服务端拆帧反序列化路由到具体方法 → 写回带同 `request_id` 的响应**。务必传递**剩余截止时间（Deadline Propagation）**：上游如果只剩 50ms，下游调用就绝不能再设默认 3 秒超时白白浪费算力！

### 8. 过载策略、令牌桶限流与熔断器（`TRK-16`）

- **令牌桶（Token Bucket）**：按固定速率往桶里放令牌，请求先拿令牌才放行，允许短时突发流量同时锁死长期平均 QPS；**漏桶（Leaky Bucket）**则强行把突发拉平为绝对匀速出水。
- **熔断器三态（Closed → Open → Half-Open）**：当调用下游错误率超过 50%，熔断器直接跳闸进入 `Open` 快速拒绝（避免雪崩）；冷却 10 秒后放 1 个探针请求试探（`Half-Open`），成功才恢复供电。
- 下面看当后端队列满时的两种过载拒绝与反压实现（配合 `systemd` 托管）：

当 SQLite 写入变慢、容量为 `N` 的 `BoundedQueue` 被占满时，工程上只有两种**显式有界策略**（严禁无限扩容）：

| 过载策略 | 触发条件 | 对调用方表现 | 适用场景与代价 |
| --- | --- | --- | --- |
| **策略 A：显式快速拒绝** | `queue.size() >= cap` 或 `active_conns >= max_conns` | 立刻回发 `503 / ERR_OVERLOAD` 帧并记 `rejected++`，连接可复用或关闭 | 保护尾延迟，客户端立刻感知并退避重试 |
| **策略 B：暂停读取反压** | `inflight_bytes >= byte_budget` | `epoll_ctl(MOD)` 暂移除 `EPOLLIN`，内核接收窗口缩为 0 倒逼客户端慢下来 | 适合可靠流控，但慢连接会长期占用 fd 配额 |

**观测必须靠无锁原子计数 + Prometheus/OpenTelemetry 可观测三支柱（`TRK-18`）**：
- **Metrics（指标）**：Counter 累计请求数/拒绝数、Histogram 统计 P50/P95/P99 耗时分桶；
- **Logs（日志）**：携带 `trace_id` 的结构化日志（`kv` 对），切忌在热点路径打锁同步写盘；
- **Traces（链路追踪）**：记录跨微服务每一跳耗时瀑布图。

下面用无锁原子指标记录服务端健康状态（配合 `systemd` 托管）：

```cpp
#include <atomic>
#include <cstdint>

struct ServerMetrics {
    std::atomic<std::uint64_t> accepted{0};
    std::atomic<std::uint64_t> rejected{0};
    std::atomic<std::uint64_t> committed{0};
    std::atomic<std::uint64_t> timeout_closed{0};
    std::atomic<std::uint64_t> commit_failed{0};
    std::atomic<std::int64_t>  inflight_bytes{0};
};
// 后台观测线程每 5s 输出一行结构化日志：
// ts=2026-11-19T14:30:00Z ver=v3.1.0 q_depth=2 accepted=1024 rejected=17 committed=1007 p99_ms=4.8
```

用 `systemd` 托管服务进程，才能保证崩溃自启、文件句柄配额和统一日志检索（`journalctl -u logscan -f`）：

```ini
# /etc/systemd/system/logscan.service
[Unit]
Description=LogScan v3 Bounded TCP Service
After=network.target

[Service]
Type=simple
User=logscan
WorkingDirectory=/opt/logscan/current
ExecStart=/opt/logscan/current/bin/logscan_server --port 9090 --db /var/lib/logscan/logs.db --queue-cap 64
Restart=on-failure
RestartSec=2s
TimeoutStopSec=15s
LimitNOFILE=65536
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
```

---

### 9. 优雅退出、幂等对账与版本回滚（`TRK-17`）

收到 `SIGTERM` 时（`systemctl stop logscan`），服务不能立刻 `exit(0)`，必须按严格次序完成**5 步排空承诺**：

```text
SIGTERM ──▶ 1. 设 stop_requested=true 并 close(listen_fd)（拒绝新连接）
        ──▶ 2. 对已接入完整帧继续入队；超过 drain_deadline (如 10s) 的半帧直接断开
        ──▶ 3. queue.close()，工作线程把队列内已接受任务全部 COMMIT 并回发 ACK
        ──▶ 4. 若超时仍未排空，把内存残留未确认 batch_id 写入 stderr/journald 告警
        ──▶ 5. 执行 sqlite3_wal_checkpoint_v2(..., TRUNCATE) 后关闭数据库并退出
```

**为什么“已确认批次不丢，未确认重试不重”？** 因为网络 ACK 可能刚好在服务端 `COMMIT` 之后、客户端收到之前因进程退出而丢失！客户端重启重发同一批 `B` 时，数据库层必须靠**唯一键幂等**：

```sql
CREATE TABLE IF NOT EXISTS log_batches (
    batch_id TEXT PRIMARY KEY,   -- 客户端生成的幂等键（如 UUID 或 client_id:seq）
    payload_count INTEGER NOT NULL,
    created_at TEXT NOT NULL
);
-- 重试写入时使用：INSERT INTO log_batches(...) VALUES(...) ON CONFLICT(batch_id) DO NOTHING;
```

**零停机 / 秒级符号链接回滚演练**：永远不要直接覆盖运行中的二进制，而是用版本目录 + 原子软链接切换：

```bash
# 发布新版本 v3.2.0 前先核对数据库兼容规则：只允许 ADD COLUMN / 新增表，严禁删改旧列
ls -l /opt/logscan/current   # -> /opt/logscan/releases/v3.1.0
ln -sfn /opt/logscan/releases/v3.2.0 /opt/logscan/current
sudo systemctl restart logscan

# 若发现异常，1 秒回滚到 v3.1.0 并验证旧程序对同一 SQLite 库查询结果一致
ln -sfn /opt/logscan/releases/v3.1.0 /opt/logscan/current
sudo systemctl restart logscan
sqlite3 /var/lib/logscan/logs.db "PRAGMA user_version; SELECT COUNT(*) FROM log_batches;"
```

---

### 10. `SO_REUSEPORT` 多核扩展与 CPU 绑核策略（`TRK-19`）

当单线程 `accept` 成为每秒数万新连接的瓶颈时，Linux 支持给多个工作进程/线程同时绑定同一个端口开启 **`SO_REUSEPORT`**：由内核在底层直接根据五元组哈希把新连接均匀派发到各 Worker 独立的监听队列，彻底消除单锁惊群与跨核迁移开销；配合 `pthread_setaffinity_np` 将 IO 线程绑到固定物理核可极大减少 L1/L2 缓存失效。

---

## 第三部分：容量预算、火焰图剖析与压测实战（`TRK-20` ~ `TRK-22`）

### 11. 管线拆分与容量预算模型（`TRK-20`）

并发拉高时不要盲目改代码，先把整条链路拆成独立阶段测算吞吐天花板（利特尔法则 $L = \lambda W$）：

```text
[ 负载生成器 ] ── λ (req/s) ──▶ [ Stage 1: 网络拆帧 ] ──▶ [ BoundedQueue ] ──▶ [ Stage 2: logscan_core ] ──▶ [ Stage 3: SQLite 事务 ]
                                  ~200k msg/s (CPU)       高水位监控             ~120k line/s (CPU)           单条fsync: ~300 tx/s (瓶颈!)
                                                                                                               64条批量WAL: ~40k row/s
```

压测台必须强制验证**请求守恒定律**与负载类型隔离：
- **负载矩阵**：固定随机种子生成 4 类可重放负载——小文件高频、长行（>2KB）、平稳速率 $\lambda$、脉冲突发（2 倍峰值持续 2s）。
- **端到端守恒等式**：排空结束后必须严格满足：
  $$\text{TotalSent} = \text{Acked} + \text{Rejected}_{503} + \text{ExplicitFailed}$$
  且任意时刻观测到的 `queue_high_watermark <= queue_capacity`。只要不等式两边差 1 条，就说明存在静默丢包或计数漏加。

---

### 12. `perf` 剖析热点与 P99 尾延迟单因素诊断（`TRK-21`）

尾延迟飙升时，先用证据区分三类根因（CPU 算力 / 锁等待 / 刷盘 I/O），严禁靠猜做优化：

```bash
# 1. 宏观体检：看 IPC（每周期指令数）、上下文切换与系统态占比
perf stat -d ./logscan_bench --seed 42 --rate 5000 --batch 16

# 2. 采样热点函数调用栈并生成火焰图（需编译加 -g -fno-omit-frame-pointer）
perf record -F 99 -g --call-graph dwarf -- ./logscan_bench --seed 42 --rate 5000 --batch 16
perf report --stdio --no-children | head -n 30
# 若装有 FlameGraph 脚本：perf script | stackcollapse-perf.pl | flamegraph.pl > flame.svg
```

**单因素控制变量实验（`batch=16` vs `batch=64`）**：保持随机种子、`synchronous=NORMAL`、WAL 模式完全一致，**先校验落库总行数与内容哈希完全一致**，再对比性能代价：

| 变量配置 | 正确性校验 | SQLite `COMMIT` 次数 | 吞吐 (rows/s) | p99 延迟 (ms) | 峰值 RSS (MB) | 结论与权衡 |
| --- | --- | --- | --- | --- | --- | --- |
| 基线 `batch=16` | 100,000 行一致 | 6,250 | 18,400 | 12.6 | 14.2 | 火焰图显示 `sqlite3WalFrames` + `fdatasync` 占 68% |
| 变体 `batch=64` | 100,000 行一致 | 1,563（降 4 倍） | 39,200 | 16.8（略升） | 15.1 | 吞吐翻倍，但凑批等待抬高轻载 p99，需配合 max_wait_ms 上限 |

---

### 13. 压测工具（`wrk`/`hey`）、自动回归门禁与 LogScan v3 规模化（`TRK-22`）

压测 HTTP/自定义服务不要把压测客户端和服务端跑在同一个忙核上，且必须警惕 **Coordinated Omission（协同遗漏）** 假象——固定并发线程阻塞等响应会在服务端卡顿时自动放慢发包频率，掩盖真实的排队尾延迟！因此真实压测（如 `wrk2` / 自研固定速率生成器）必须按恒定发送时刻表发射并从“计划发送时刻”算真实延迟，再按下面 4 步自动化回归门禁判定通过：

单次跑分受 CPU 睿频、后台进程与页缓存冷热影响极大。可靠的自动化性能实验台必须按下面流程执行：

1. **固定环境**：关闭多余后台任务、统一构造临时磁盘目录、开启固定工作负载种子；
2. **正确性前置**：任何性能变体必须**先通过功能与数据校验**（退出码 0 且 SQLite 输出与单线程参照完全一致），失败直接标红阻断；
3. **预热 + 多次测量**：至少 `3` 次预热（消除冷页缓存和代码页缺页抖动）+ `5` 次正式采样，用**中位数（Median）**代表集中趋势，用 **IQR（四分位距）或变异系数 CV** 衡量机器抖动；
4. **回归阈值与自动复测**：设基线 p99 中位数为 $B$，历史波动为 $\sigma_{\text{iqr}}$，若变体超过 $\max(10\%, 3 \cdot \sigma_{\text{iqr}})$ 则自动复测一轮确认，仍超限则脚本返回非 0 退出码并保存原始 CSV 样本归档。

---

## 排障剧本（Troubleshooting Playbook）

| 故障现象 | 首查命令 / 指标 | 常见根因 | 修复动作 |
| --- | --- | --- | --- |
| 服务端 CPU 100% 空转 | `strace -c -p $(pidof logscan)` | `EPOLLET` 下忘记处理完或写了阻塞监听导致 `epoll_wait` 死循环 | 检查 `EPOLLOUT` 是否在 `out_buf` 发空后及时摘除 |
| 连接数泄漏、`accept` 报 `EMFILE` | `ls /proc/$(pidof logscan)/fd \| wc -l` | 慢客户端超时逻辑漏调 `close(fd)` 或 `LimitNOFILE` 过小 | 为每条连接强制绑定 `frame_deadline`，unit 配 `LimitNOFILE=65536` |
| 回滚旧版本后启动直接报错 | `journalctl -u logscan -n 50` | 新版改了 SQLite 表结构且未保留向后兼容 | 用 `PRAGMA user_version` 校验并坚持“只增不改”迁移策略 |
| 基准测试波动超过 30% | `cat /sys/devices/system/cpu/cpu0/cpufreq/scaling_governor` | 笔记本 `powersave` 调频或未先做预热 | 固定为 `performance` 调频策略并增加 3 轮预热 |

## 1 行反例坑点速查表

| 常见误区 | 1 行反例 / 症状 | 正确做法 |
| --- | --- | --- |
| 在 `epoll` 事件线程直接同步写 SQLite | 一次 `fsync` 卡住 15ms，全服所有连接心跳与收包一起冻结 | `epoll` 线程只做非阻塞 I/O 与分帧，重活进有界队列交给工作线程 |
| `steady_clock` 换成 `system_clock` 算超时 | NTP 校时把系统时间往回拨 2 秒，慢连接 deadline 瞬间多等 2 秒 | 超时与耗时永远用单调递增的 `std::chrono::steady_clock` |
| 优化后只报平均延迟（Mean） | `avg=1.2ms` 掩盖了 `batch=64` 凑批导致的 `p99=45ms` 毛刺 | 必须同时汇报 `p50`、`p95`、`p99`、峰值 RSS 与守恒总量 |
| 忽略 `SIGPIPE` 信号 | 向已断开的慢客户端写 `503` 帧时内核直接杀死整个服务端进程 | 启动时 `signal(SIGPIPE, SIG_IGN)` 或使用 `send(..., MSG_NOSIGNAL)` |

## 4 个微练习

### 练习 1（`TRK-01` 超时截止时间判断）

假设 `frame_deadline` 为 `1000ms`，某客户端在 `t=0ms` 发来 2 字节、`t=900ms` 又发来 1 字节，但完整帧头要求 4 字节。此时应该把 `frame_deadline` 顺延到 `1900ms` 还是维持 `1000ms`？为什么？

<details>
<summary>提示与参考答案</summary>

必须维持 `frame_deadline = 1000ms` 不变（只有**每收到完整一帧**后才重置下一帧的 `frame_deadline`）。如果每收 1 个字节就顺延截止时间，攻击者只需每 900ms 发 1 字节（Slowloris 慢速攻击）就能永久占死连接配额。`idle_deadline` 可以按字节活跃续期，但单帧总限时 `frame_deadline` 必须封顶。

</details>

### 练习 2（`TRK-02` 容量 2 队列的过载验证）

在容量为 `2` 的队列后端冻结工作线程，连续发入 3 条带唯一 ID（`M1`、`M2`、`M3`）的帧。分别说明“暂停读取”与“显式返回 `503`”下，`M3` 的去向、队列深度最大值和解冻后落库结果。

<details>
<summary>提示与参考答案</summary>

1. 队列深度最大值在两种策略下都严格为 **`2`**（`M1`、`M2` 在队列中）。
2. 若选**显式拒绝**：`M3` 立刻收到 `503 / ERR_OVERLOAD`，`rejected` 加 1，解冻后仅 `M1`、`M2` 入库（共 2 条）。
3. 若选**暂停读取**：移除 `EPOLLIN` 后 `M3` 停在内核 TCP 接收缓冲区或客户端发送端等待；解冻后 `M1`、`M2` 落库出队，`EPOLLIN` 恢复，`M3` 入队并至多落库 1 次（共 3 条）。

</details>

### 练习 3（`TRK-03` 排空与幂等去重）

服务端对批次 `B` 已执行完 `SQLite COMMIT`，但在调用 `send(ACK)` 前瞬间被 `kill -9` 强杀。重启服务后客户端重试发送同一个 `batch_id = B`，数据库里会有几条 `B`？如果表上没建 `PRIMARY KEY`/`UNIQUE` 会发生什么？

<details>
<summary>提示与参考答案</summary>

配合 `batch_id TEXT PRIMARY KEY` 和 `ON CONFLICT(batch_id) DO NOTHING`，重启后重试插入被静默忽略，服务端直接回发 ACK，数据库里**严格只有 1 条 `B`**。如果没建唯一约束，每次网络超时重试都会多插一条重复记录，导致聚合统计完全失真。

</details>

### 练习 4（`TRK-05` & `TRK-06` 性能退化判定）

某次提交后，正确性测试通过，5 轮 `p99` 为 `[11.2, 11.4, 11.3, 11.5, 11.3]` ms；而基线 5 轮 `p99` 为 `[9.8, 10.1, 10.0, 9.9, 10.2]` ms。请计算两者的中位数与涨幅比例，并判断若回归门禁阈值为 `10%`，门禁应该放行还是拦截？

<details>
<summary>提示与参考答案</summary>

- 基线排序后中位数 = `10.0 ms`（IQR = `10.1 - 9.9 = 0.2 ms`）。
- 变体排序后中位数 = `11.3 ms`。
- 涨幅 = `(11.3 - 10.0) / 10.0 = +13.0%`，既大于 `10%` 阈值，也远超基线波动 `3 * 0.2 = 0.6 ms`（6%）。因此不是机器抖动，门禁应触发复测确认并**拦截失败（非 0 退出）**。

</details>
