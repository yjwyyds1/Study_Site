---
title: "LogScan v2：多线程并发与持久化服务原型"
description: "综合运用 CMake 多文件工程、有界任务队列、长度前缀分帧与 SQLite 事务归档，交付可写进简历、经得起面试深挖的综合项目。"
order: 3
tags: ["C++20", "综合项目", "CMake", "并发", "网络", "SQLite"]
related: ["labs/logscan-build", "handbook/concurrency-queue", "handbook/network-tcp", "handbook/storage-sqlite"]
sources: []
---

## 项目定位与目标

在 `LogScan v0.1` 中，你已经把单文件工具拆成了带 CTest 单元测试的 `logscan_core` 库。现在我们要把它演进为一个**通用 C++ 工程综合项目 `LogScan v2`**：

```text
[ 模拟/真实字节流输入 ]
          │  1. 长度前缀分帧解码 (try_decode_frame)
          ▼
[ 有界任务队列 BoundedQueue ]  ← 2. 背压限流 + 优雅关闭排空
          │  3. 多工作线程消费 (std::thread)
          ▼
[ logscan_core 解析计数 ] ──→ [ SQLite 事务批量归档 ]
```

先修要求：完成 [LogScan v0.1](../logscan-build/)，并学完第 3 阶段的 [Linux 与进程 I/O](../../handbook/linux-process-io/)、[并发有界队列](../../handbook/concurrency-queue/)、[TCP 协议分帧](../../handbook/network-tcp/) 和 [SQLite 持久化](../../handbook/storage-sqlite/)。

## 一、推荐工程目录结构

在 WSL2 Ubuntu 的 `~/cpp-work/logscan-v2/` 下按如下结构组织代码（职责清晰，方便继续扩展或放进 GitHub）：

```text
logscan-v2/
  CMakeLists.txt
  include/
    logscan_core.hpp
    bounded_queue.hpp
    framing.hpp
    log_store.hpp
  src/
    logscan_core.cpp
    framing.cpp
    log_store.cpp
    main.cpp
  tests/
    pipeline_test.cpp
```

## 二、CMakeLists.txt 编写要点

使用 CMake 标准查找方式同时接入系统线程库和 SQLite3：

```cmake
cmake_minimum_required(VERSION 3.20)
project(logscan_v2 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_CXX_EXTENSIONS OFF)

find_package(Threads REQUIRED)
find_package(SQLite3 REQUIRED)

add_library(logscan_engine
  src/logscan_core.cpp
  src/framing.cpp
  src/log_store.cpp
)
target_include_directories(logscan_engine PUBLIC include)
target_link_libraries(logscan_engine PUBLIC Threads::Threads SQLite::SQLite3)

add_executable(logscan_service src/main.cpp)
target_link_libraries(logscan_service PRIVATE logscan_engine)

enable_testing()
add_executable(pipeline_test tests/pipeline_test.cpp)
target_link_libraries(pipeline_test PRIVATE logscan_engine)
add_test(NAME pipeline_test COMMAND pipeline_test)
```

## 三、分三步里程碑实现与验收

### 里程碑 1：打通“分帧解码 + 有界队列 + 多线程消费”

1. **封装 `include/bounded_queue.hpp`**：把 [并发队列课](../../handbook/concurrency-queue/) 的 `BoundedQueue` 做成模板类 `BoundedQueue<T>`（或者先固定存 `std::string`）。
2. **封装 `framing.hpp / framing.cpp`**：把 [网络课](../../handbook/network-tcp/) 的 `encode_frame` 与带 `64KB` 上限检查的 `try_decode_frame` 放进去。
3. **在 `main.cpp` 串联流水线**：
   - 主线程把 500 条日志编码成字节流，故意切成不规则大小的碎片喂给 `try_decode_frame`，把拆出来的完整日志 `push` 进容量为 `16` 的 `BoundedQueue`。
   - 启动 `2` 个工作线程循环 `pop()`，各自统计局部 `Counts`；收到 `close()` 并排空退出后，主线程 `join()` 并汇总打印总数。
4. **验收标准**：无论输入怎么切分（1 字节一喂、或者 10 条粘成一包），汇总的 `INFO / WARN / ERROR / UNKNOWN` 四项总和必须与单线程 `logscan_core` 100% 一致，且程序每次都能干净退出不卡死。

### 里程碑 2：接入 `LogStore`（SQLite 批量归档 + 失败回滚）

1. **编写 `log_store.hpp / log_store.cpp`**：
   - 构造函数打开指定 `.db` 文件（使用 `std::unique_ptr<sqlite3, DbCloser>` 保证 RAII 释放），并自动执行 `CREATE TABLE IF NOT EXISTS` 与 `CREATE INDEX`。
   - 提供 `save_batch(int batch_id, const std::vector<LogRecord>& batch)`：内部开启 `BEGIN;` 事务，用 `sqlite3_prepare_v2` + `sqlite3_bind_*` 批量写入，成功则 `COMMIT;`，遇到任何异常或空消息则 `ROLLBACK;`。
2. **并发写入注意点**：SQLite 默认单文件同时只适合一个写连接，或者由工作线程把解析好的结构发回一个专用存储线程/在 `LogStore` 内部加互斥锁保护写入。
3. **验收标准**：正常导入 1000 条日志耗时在百毫秒级；故意注入一条非法空消息触发 `ROLLBACK` 后，用 `sqlite3` 命令行查询该 `batch_id` 的行数必须为 `0`。

### 里程碑 3：编写自动化回归测试（`tests/pipeline_test.cpp`）

在 `pipeline_test.cpp` 里至少覆盖以下 4 个自动断言用例（使用 `ctest --output-on-failure` 运行）：

| 测试用例 | 输入 / 场景 | 必须验证的断言 |
| --- | --- | --- |
| `framing_sticky_and_partial` | 2 条粘包消息 + 每次只喂 3 字节 | 最终准确拆出 2 条原消息，缓冲区剩余 0 字节 |
| `framing_reject_oversize` | 构造长度头为 `100000`（>64KB）的恶意包 | 标记 `bad_frame == true`，拒绝分配超大内存 |
| `queue_drain_on_close` | 容量 `2`，推入 `10` 条后立刻 `close()` | 2 个工作线程处理总数恰好等于 `10` |
| `store_rollback_on_error` | 临时数据库插入含非法记录的一批数据 | 抛出异常后，库中该批次记录数为 `0` |

## 四、构建、运行与故障演练命令

在 WSL2 Ubuntu 的 `~/cpp-work/logscan-v2/` 执行：

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
./build/logscan_service
```

进阶排查演练：把工作线程数改成 `4`，加上编译选项 `-fsanitize=thread`（ThreadSanitizer）重新构建并运行 `ctest`，确认没有任何数据竞争告警。

## 五、面试讲解自检清单（整理进简历前必答）

1. **为什么队列要设容量上限？**
   - 做背压控制，防止网络/磁盘读取远快于解析写库时内存无限增长导致 OOM。
2. **退出时怎么保证队列里已接收的日志不丢？**
   - 停止接收新数据并调用 `queue.close()` 置位 `closed_` + `notify_all()`；工作线程在 `closed_ && queue_.empty()` 时才返回 `std::nullopt` 退出；主线程 `join()` 等所有工作线程收尾后再关闭数据库连接。
3. **为什么 TCP 分帧要限制最大包长度？**
   - 防止恶意或损坏的长度头诱导服务端无限制向 `recv_buf` 囤积字节引发内存耗尽。
4. **为什么批量入库要用事务和参数绑定？**
   - 参数绑定杜绝 SQL 注入与特殊字符报错；事务把成百上千次磁盘 `fsync` 合并为一次，提升吞吐量并保证批次失败时原子回滚。
