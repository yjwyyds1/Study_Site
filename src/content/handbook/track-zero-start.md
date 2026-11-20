---
title: "第 0 课（零基础）：C++ 岗位全景、能力画像与 LogScan 作品集包装"
description: "覆盖 TRK-01 至 TRK-08：用一张全景图看懂服务端、基础设施与存储、低延迟性能、桌面图形客户端、嵌入式与机器人五大细分画像，学会把真实招聘 JD 拆解为 Study_Site 学习模块，并把 LogScan 演进路线打造成高含金量求职作品集。"
order: 119
category: "方向选修"
tags: ["零基础", "求职方向", "职业规划", "JD拆解", "作品集", "C++工程"]
related: ["handbook/track-server-perf", "handbook/track-infra-storage", "handbook/track-client-embedded", "handbook/track-interview-craft", "labs/logscan-service"]
sources: []
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：本课岗位全景与 JD 拆解随时可读，帮你明确“学完公共底座后往哪个方向深潜”。
> - **落地方向实战前建议先打通**：[LogScan v0 ~ v3 工程主线](../../labs/logscan-service/) 与 [Socket/epoll + 并发队列底座](../network-tcp/)。
>
> <details><summary>📚 本科已为你融合的全球 TOP 5 经典精华（无需再买书/翻英文站）</summary>
>
> 1. **陈硕《muduo》+ gRPC 工程实践**：One-Loop-Per-Thread、时间轮、异步日志与限流熔断
> 2. **Qt 6 官方文档 (Threads & Model/View)**：GUI 线程铁律、`QueuedConnection` 与大文件代次取消
> 3. **Mastering FreeRTOS + Making Embedded Systems**：交叉编译、链接脚本内存预算、ISR 与环形缓冲
> 4. **《Software Engineering at Google》**：Code Review 准则、ADR 架构决策记录与 Post-mortem 复盘
> 5. **《重构》+ C++ 求职作品集指南**：用 QPS/P99/ASan/TSan 实测证据包装 `LogScan v0~v3` 简历
>
> </details>

## 本课只解决这 1 个问题

很多学 C++ 的同学打完语法和基础工程后都会卡在同一个路口：**“C++ 在行业里到底有哪些方向？为什么有人天天写 `epoll` 和分布式存储，有人在抠 L1 Cache 纳秒耗时，有人在写 Qt 界面和游戏引擎，还有人在给芯片写寄存器驱动？我该怎么看懂招聘 JD，又该怎么把自己做完的 `LogScan` 变成面试官抢着追问的项目？”**

本课对应方向选修 `TRK-01` 至 `TRK-08`，帮你把“学完语法之后往哪走”彻底拆成可对照、可落地的路线图。**建议先完成 `LogScan v0 ~ v3` 公共工程主线，再对照本课选定你的深潜方向。**

### 零基础黑话翻译表

| 行业黑话 | 通俗人话 | 一句话抓住核心差异 |
| --- | --- | --- |
| **高并发后端（QPS / 吞吐）** | **火车站多窗口检票** | 同时连着上万个用户，要防止一个慢客人把整条队伍堵死 |
| **基础设施 / 存储引擎（WAL / LSM）** | **银行金库账本管理员** | 哪怕瞬间断电，已经盖章确认的账目绝对不能丢、不能乱 |
| **低延迟 / 量化（P99 / Cache-line）** | **F1 赛车进站换胎** | 平均快没用，100 次里有 1 次卡顿 1 毫秒就会错失整笔交易 |
| **客户端 / 图形（60fps / ABI）** | **电影院放映机与插件接口** | 每 16.6 毫秒必须画出下一帧画面，界面线程卡住用户就点不动 |
| **嵌入式 / RTOS（MMIO / ISR）** | **汽车安全气囊控制器** | 只有几十 KB 内存，不能动态找操作系统要地盘，撞击毫秒级必触发 |
| **JD（Job Description）** | **招聘方的考纲说明书** | 每一句“熟悉 XXX”背后都对应一道面试必问的底层原理题 |

---

## 一、C++ 四大主流岗位方向全景对比 (TRK-01)

C++ 之所以被称为“系统级语言之王”，是因为只要涉及到**资源受限、高吞吐、低延迟或贴近硬件**的场景，几乎都由 C++ 坐镇。工业界通常把 C++ 岗位收敛为**四大主流方向**（其中服务端与性能方向内部又细分出业务网络、存储基建与极致低延迟三个专业画像）：

```text
                         ┌── 1. 服务端与网络方向 ──▶ 网关 / RPC / 微服务 (TRK-09 ~ TRK-22)
                         │       └─ 延伸：基础设施、存储引擎与分布式中间件 (TRK-23 ~ TRK-32)
                         │
  [ C++ 公共工程基石 ] ──┼── 2. 性能与低延迟方向 ──▶ 量化交易 / 撮合 / 底层性能调优 (TRK-04, TRK-19 ~ TRK-21)
  (RAII / CMake / OS /   │
   网络 / 并发 / 算法)   ├── 3. 桌面与图形客户端   ──▶ Qt 上位机 / 音视频 / 游戏引擎 ECS (TRK-33 ~ TRK-38)
                         │
                         └── 4. 嵌入式与机器人     ──▶ MCU 固件 / FreeRTOS / 自动驾驶感知控制 (TRK-39 ~ TRK-42)
```

| 方向主线 | 核心关注点 | 内存分配态度 | 典型代表产品 | Study_Site 对应主线 |
| --- | --- | --- | --- | --- |
| **Linux 网络服务端** | 高并发连接、背压防雪崩、超时断连、优雅重启 | 允许对象池与常规堆分配，严控泄漏与无界队列 | Nginx、Envoy、游戏后端网关 | `NET` + `CON` + `TRK-09..22` |
| **基础设施与存储内核** | 落盘持久性、读写放大、锁粒度、分布式一致性 | 大量自研 Arena/Slab/BufferPool 绕开通用分配器 | RocksDB、ClickHouse、TiKV | `DB` + `OS` + `TRK-23..32` |
| **低延迟 / 量化性能** | 单次请求极值延迟（P99/P99.9）、CPU 缓存命中 | **关键路径零堆分配**，预分配静态环与内存对齐 | 交易所撮合内核、高频行情网关 | `MACH` + `CON` + `TRK-04/19..21` |
| **桌面 / 图形 / 嵌入式** | 60fps 帧预算或微秒级硬实时、跨平台 ABI / 硬件总线 | 桌面端严控 UI 线程拷贝；**嵌入式严禁 `malloc/new`** | Qt 工业软件、UE/自研引擎、飞控 | `TRK-33..42` + `MACH` |

**80% 的核心内功是完全相通的**：
- **RAII 与对象生命周期**：服务端防 `fd` 泄漏、Qt 防悬空信号接收者、嵌入式管静态外设句柄全靠它；
- **有界生产者-消费者缓冲**：服务端叫并发队列（`LogScan v3`），嵌入式叫串口环形缓冲（`track-ringbuffer.cpp`），音视频叫无锁 SPSC 队列；
- **CMake 与自动化测试**：无论写哪一行工业代码，可复现构建与回归测试都是交付底线。

---

## 二、Linux 服务端与网络微服务岗位画像 (TRK-02)

### 1. 日常工作在写什么？

如果你入职互联网公司后台架构组、云厂商网关团队、音视频信令服务器或游戏服务端，每天面对的不是“写一个 `while(true) accept()`”，而是让成千上万台客户端在**弱网、断网、突发流量**下依然保持服务可用：
- 用 `epoll` / `io_uring` 维护成千上万条非阻塞 TCP 连接的读写状态机；
- 解决 TCP 字节流拆包/粘包、心跳保活与僵尸连接时间轮踢出；
- 封装 RPC 框架、线程池、异步日志库，接入 Prometheus 监控指标与 OpenTelemetry 链路追踪；
- 处理上游流量暴增时的限流熔断，以及发布新版本时的 `SIGTERM` 优雅排空。

### 2. 服务端工程师的核心指标卡

```text
[客户端流量] ──▶ [接入层 Reactor] ──▶ [有界队列 / 业务线程池] ──▶ [下游 DB / RPC]
                     │                         │                         │
   关注指标:     C10K/C100K 并发连接数      队列深度 / 拒绝率(503)      超时传播 / 幂等落库
                 TIME_WAIT 与句柄上限       P95 / P99 处理延迟          优雅重启零丢包
```

### 3. 岗位入门小模式：非阻塞连接生命周期骨架

```cpp
#include <chrono>
#include <cstdint>

struct ConnBudget {
    int fd = -1;
    std::size_t in_bytes = 0;
    std::chrono::steady_clock::time_point deadline{};

    bool is_expired(std::chrono::steady_clock::time_point now) const noexcept {
        return now >= deadline;
    }
    bool exceeds_quota(std::size_t max_bytes) const noexcept {
        return in_bytes > max_bytes;
    }
};
```

> **面试官视角**：服务端面试几乎必考“一个慢客户端发半条请求卡住怎么办？”——核心答案永远是 **非阻塞 I/O + 状态机 + 有界缓冲 + `steady_clock` 截止时间**。

---

## 三、基础设施、存储引擎与分布式中间件画像 (TRK-03)

### 1. 为什么巨头最愿意用 C++ 招基础架构工程师？

数据库（MySQL/ClickHouse/OceanBase）、KV 存储（RocksDB/Redis 替代内核）、消息队列与分布式文件系统，是互联网和云计算的“地基”。这类系统对 **GC 停顿零容忍**，且需要精细控制每一页内存与每一次磁盘 `fsync`：
- **内存自己管**：操作系统 `malloc` 在高并发小对象下有锁竞争和碎片，基建团队常手写 Arena、Slab 或 Buffer Pool 缓冲池；
- **磁盘自己排**：机械盘怕随机写，NVMe 怕写放大（Write Amplification），于是演化出 **B+Tree（就地更新）** 与 **LSM-Tree（追加写 + Compaction）** 两大阵营；
- **多机要一致**：单机总会断电或坏盘，必须用 **WAL 预写日志**保证单机不丢，再用 **Raft / Paxos** 保证三副本或五副本选主与同步。

### 2. 存储引擎核心读写路径直觉

```text
写入请求 (Put k, v)
   ├── 1. 先顺序追加写 WAL (磁盘顺序写 + Group Commit 成组刷盘，断电可恢复)
   └── 2. 再写入内存结构 (B+Tree BufferPool 脏页 / LSM-Tree MemTable 跳表)
            └── 满阈值后后台刷成只读 SSTable，定期 Compaction 清理旧版本与墓碑
```

> **关键认知**：做业务 CRUD 看重“功能快交付”；做存储与中间件，**“断电重启后数据校验少 1 字节就是 P0 级事故”**。

---

## 四、低延迟与量化性能工程岗位画像 (TRK-04)

### 1. 什么是“低延迟 / 性能工程”？

在高频量化交易（行情解码、策略执行、报盘网关）、广告实时竞价（RTB）或内核级网络转发（DPDK）领域，工程师追求的不是“平均 1 毫秒”，而是**P99 稳定在几个微秒（µs）甚至几百纳秒（ns）以内**。

在这个领域，常规开发习以为常的做法几乎全成了“性能毒药”：
- **禁用热路径堆分配**：一次 `new`/`std::string` 动态扩容触发的锁或系统调用 `brk`/`mmap`，就能瞬间飙出 10~50 微秒的尾延迟毛刺；
- **绕开内核协议栈或锁调度**：用 `SO_REUSEPORT`、CPU 绑核（`sched_setaffinity`）、无锁 SPSC 环形缓冲替代内核线程上下文切换；
- **面向 CPU Cache 编程**：利用 `alignas(64)` 消除多核缓存行伪共享（False Sharing），用 SoA（Structure of Arrays）布局配合 SIMD 指令一次算 8 个浮点数。

### 2. 纳秒级代价对照表（建立硬件直觉）

| 操作行为 | 典型耗时数量级 | 对低延迟热路径意味着什么？ |
| --- | ---: | --- |
| L1 Cache 命中读取 | ~1 ns | 几乎免费，数据应尽量紧凑放在同一缓存行内 |
| 跨核缓存一致性失效（伪共享） | ~40–100 ns | 两个核同时写相邻 `atomic`，吞吐暴跌 10 倍 |
| 一次用户态无锁 SPSC 入队 | ~5–15 ns | 跨线程通信的黄金标准 |
| `std::mutex` 发生竞争触发内核休眠 | ~2,000–20,000 ns | **20 微秒毛刺！** 低延迟热路径严禁阻塞锁 |
| 系统调用 / 缺页中断（Page Fault） | ~1,000–10,000 ns | 启动时必须用 `mlockall` 锁定内存并预热页面 |

### 3. 低延迟代码规范示例：热路径零分配与缓存行隔离

```cpp
#include <atomic>
#include <cstdint>
#include <new>

// C++17 硬件破坏性干扰大小（通常为 64 字节）
#ifdef __cpp_lib_hardware_interference_size
using std::hardware_destructive_interference_size;
#else
constexpr std::size_t hardware_destructive_interference_size = 64;
#endif

struct alignas(hardware_destructive_interference_size) ProducerSlot {
    std::atomic<std::uint64_t> tail{0}; // 独占一个 64B 缓存行，不与 head 互相踩踏
};

struct alignas(hardware_destructive_interference_size) ConsumerSlot {
    std::atomic<std::uint64_t> head{0};
};
```

---

## 五、桌面客户端、音视频与图形游戏引擎画像 (TRK-05)

### 1. 为什么桌面和游戏也死守 C++？

无论是工业上位机（医学影像、CAD、示波器软件）、跨平台音视频剪辑器（OBS/FFmpeg 内核），还是 3A 游戏引擎（Unreal/Unity 底层），共同特征都是：**既要直接操控显卡/声卡算力，又要给用户 60fps（16.6ms 一帧）甚至 120fps 的顺滑交互**。

这支队伍每天解决三大难题：
- **主线程（UI/Render Thread）绝不阻塞**：文件解析、网络下载、解码计算全丢进后台线程池，再通过事件循环（Qt `QueuedConnection`）或双缓冲队列安全交回主线程；
- **跨平台 C ABI 与插件化**：C++ 编译器之间的名称修饰（Name Mangling）和 `std::string` 内存布局互不兼容，工业客户端和引擎必须用 `extern "C"` + 不透明句柄暴露 SDK 接口给动态插件（`.dll`/`.so`）；
- **数据导向设计（DOD / ECS）**：游戏里同时更新 10 万个粒子或怪物坐标，传统面向对象虚函数继承会导致大量缓存未命中（Cache Miss），ECS 把同类组件连续排在数组里批处理。

---

## 六、嵌入式 MCU、RTOS 与自动驾驶机器人画像 (TRK-06)

### 1. 芯片上写 C++ 和电脑上写 C++ 有什么本质区别？

当你从 PC 转战 STM32 单片机、无人机飞控、汽车 ECU 或机器人运动控制（ROS 2）时，最大的冲击来自**物理资源边界与实时性约束**：
- **没有“虚拟内存”兜底**：RAM 可能只有 `64 KB`~`512 KB`，栈溢出会悄无声息地踩烂相邻全局变量；堆碎片化会导致运行 3 天后突然分配失败；因此普遍采用**静态预分配 + `-fno-exceptions -fno-rtti`**；
- **直接和硬件引脚/总线对话**：通过 `volatile` 读写内存映射寄存器（MMIO），配置 `UART`、`SPI`、`I2C`、`CAN` 与 `DMA` 控制器；
- **中断（ISR）与实时操作系统（RTOS）**：硬件脉冲随时打断主程序，ISR 必须在几微秒内收走字节并退出，绝不能在中断里调 `printf` 或拿阻塞锁；多任务靠 FreeRTOS 优先级抢占调度。

---

## 七、把真实 C++ 招聘 JD 拆解成 Study_Site 学习模块 (TRK-07)

很多同学投简历吃亏，是因为**看不懂 JD 里的“行话翻译”**。下面直接拿两份典型的真实校招/社招 JD，手把手拆成你在 Study_Site 可以逐课勾选的清单：

### 案例 A：后端 / 基础架构开发工程师 JD 拆解

| JD 原文要求 | 面试官真正想考什么？ | 对应 Study_Site 章节 |
| --- | --- | --- |
| “扎实的 C++17/20 基础，深入理解内存管理与 STL” | 移动语义、完美转发、`vector` 扩容与迭代器失效、`shared_ptr` 线程安全边界 | `CPP-09..15`、`TRK-48` |
| “熟悉 Linux 网络编程，掌握 `epoll` 与高并发架构” | Reactor 模型、水平/边缘触发、`TIME_WAIT`、半包粘包状态机与零拷贝 | `NET`、`OS`、`TRK-09..12` |
| “熟练使用多线程、无锁队列与常见性能剖析工具” | 死锁防线、条件变量虚假唤醒、`acquire/release` 内存序、`perf` 火焰图 | `CON`、`TRK-20..21` |
| “了解常见存储系统（Redis/RocksDB）或分布式基础” | B+Tree vs LSM-Tree、WAL 持久化、一致性哈希、Raft 选主与缓存防雪崩 | `DB`、`TRK-23..31` |

### 案例 B：客户端 / 嵌入式 / 机器人开发 JD 拆解

| JD 原文要求 | 面试官真正想考什么？ | 对应 Study_Site 章节 |
| --- | --- | --- |
| “精通 Qt 6 或跨平台 C++ SDK 开发，理解线程模型” | 主线程事件循环、跨线程 `QueuedConnection`、任务取消代次、`extern "C"` ABI | `TRK-33..36` |
| “熟悉交叉编译、Linux/RTOS 下的内存布局与调试” | `.text/.data/.bss` 节分布、链接脚本、栈预算、`gdb` Core Dump 排查 | `MACH`、`TRK-39..41`、`TRK-44` |
| “具备硬件通信协议与高可靠环形缓冲开发经验” | SPSC 无锁环形队列、字节流滑窗重同步、`volatile` 与 ISR/DMA 边界 | `TRK-38`、`TRK-40..42` |

---

## 八、把 `LogScan` 打造成面试王牌作品集证据 (TRK-08)

简历上写“实现了一个日志分析工具”毫无竞争力；但如果你把 `LogScan v0 ~ v3` 加上方向延伸，讲成**“一个经过定量压测、具备背压保护、可故障恢复的有界并发系统”**，面试官的眼神会立刻不一样。

### 1. 简历 STAR 法则改造对比

- **弱写法（流水账）**：“用 C++ 写了一个日志解析器，用了多线程和 SQLite 存数据，还支持 TCP 连接。”
- **强写法（工程证据链）**：
  > **LogScan —— 高可靠有界日志接入与归档服务（C++20 / Linux epoll / SQLite WAL）**
  > - **架构与背压**：基于 Reactor 状态机处理非阻塞 TCP 长度前缀帧，配合 `steady_clock` 帧级超时防 Slowloris 慢连接；设计有界 MPSC 阻塞队列实施 503 过载拒绝，消除上游突发流量导致的 OOM 风险。
  > - **可靠性与恢复**：结合 `SIGTERM` 五步排空机制与 SQLite `batch_id` 唯一键幂等写入，实现进程崩溃重启后的“已确认不丢、未确认重试不重”。
  > - **性能优化**：通过 `perf` 火焰图定位单条 `fsync` 占耗 68% 瓶颈，引入 `batch=64` 成组提交与 WAL 模式，在校验输出完全一致前提下吞吐从 `18.4k` 提升至 `39.2k rows/s`（**2.13×**），并建立多轮中位数性能回归门禁。

### 2. 面试前必须准备好的“4 件套作品集证据”

```text
[你的 GitHub 仓库 / 本地演示包]
  ├── 1. 一键复现脚本 (build_and_test.sh / CMakePresets.json)
  ├── 2. 架构与状态机图 (手画或 ASCII 讲清数据流、边界容量与异常退出路径)
  ├── 3. 量化对照表 (例如 batch=16 vs 64 的吞吐、P99、RSS 内存与正确性哈希)
  └── 4. 至少 1 个失败演练日志 (如杀进程重启对账 / 队列打满触发 503 / 慢客户端超时断连)
```

---

## 排障与避坑速查表

| 常见误区 | 1 行反例 / 症状 | 正确做法 |
| --- | --- | --- |
| 盲目同时投四个完全无关的方向 | 简历同时堆砌 STM32 寄存器、Qt 界面、Raft 一致性和游戏渲染 | **主修 1 条主线 + 辅修通用工程底座**，用对应分支的 `LogScan` 延伸作证 |
| 把玩具代码当项目写进简历 | 面试官问“队列满了怎么办”“怎么测的 QPS”，当场卡壳 | 每个项目必须补齐：**容量上限、失败处理、实测数据**三要素 |
| 背八股不看真实 JD 权重 | 投嵌入式岗位却狂背 HTTP 状态码，忽略 `.bss`/中断/MMIO | 先拆 5 份目标岗位 JD 统计高频词，再按映射表补齐短板 |

## 4 个微练习

### 练习 1（`TRK-01` & `TRK-04` 方向特征辨析）

某高频行情网关要求收到交易所 UDP 包后 `2 µs` 内完成解析并写入策略环形缓冲。下面哪项设计**最容易**直接破坏这个延迟预算？
A. 预分配固定长度 `std::array` 缓冲区
B. 每收到一个包 `std::make_shared<Tick>()` 并在解析完打印一条同步 `std::cout` 日志
C. 将生产者与消费者的原子索引放在不同 `64B` 缓存行

<details>
<summary>提示与参考答案</summary>

选 **B**。`std::make_shared` 触发堆分配与原子引用计数维护，而同步 `std::cout` 涉及全局流锁与 `write` 系统调用，单次即可轻松引入几十微秒的尾延迟毛刺，彻底击穿 `2 µs` 预算。

</details>

### 练习 2（`TRK-02` & `TRK-03` 服务端与存储侧重点）

做 **Linux 网络网关** 和做 **LSM-Tree 存储引擎** 都会用队列和缓冲，但两者面对“突发洪峰”时的第一防线有什么不同？

<details>
<summary>提示与参考答案</summary>

- **网络网关**优先保护**连接可用性与尾延迟**：通过有界队列 + 快速失败（`503` 限流/熔断）防止雪崩，丢弃超限新请求以保住存量已受理请求的延迟。
- **存储引擎**除了背压限速（如 RocksDB Write Stall），首要铁律是**持久性不丢（WAL 先行）**：任何已经返回成功给客户端的写入必须先顺序落盘并经过校验，决不允许为了快而在确认后丢失。

</details>

### 练习 3（`TRK-07` JD 关键词反向映射）

某自动驾驶公司 C++ 岗 JD 写着：“熟悉 Linux 下多进程/多线程通信、无锁环形队列；具备 `gdb` 排查 Core Dump 及 `ASan`/`TSan` 定位内存与竞态问题经验。”请写出它对应的 Study_Site 学习模块组合。

<details>
<summary>提示与参考答案</summary>

1. 多进程/多线程通信与无锁队列 → `OS`（进程/线程/IPC）、`CON`（`CON-25..35` SPSC 无锁环）、`TRK-38`（低抖动 SPSC）。
2. `gdb` Core Dump 与 Sanitizer → `ENG`（工程工具链与 Sanitizers）、`TRK-44`（生产环境崩溃事后复盘：`gdb`/符号表/`ASan`/`TSan`）。

</details>

### 练习 4（`TRK-08` 作品集证据自检）

对照你目前手中的 `LogScan` 代码，试着回答面试官的三个连环追问：① 你的连接输入缓冲上限是多少字节？超过会怎样？② 你的并发队列容量是多少？满时选阻塞等待还是拒绝？③ 如果服务写入 SQLite 一半被 `kill`，重启后如何保证数据一致性？

<details>
<summary>提示与参考答案</summary>

这 3 个问题正是区分“写过 Demo”和“做过工程系统”的分水岭：
- ① 参考 `TRK-11`：`kMaxInBuf = 64 KiB`、`kMaxFrame = 4096 B`，超限主动 `close_conn()` 防止慢客户端/畸形帧耗尽内存；
- ② 参考 `TRK-16`：显式有界队列，如容量 64，可对比“503 快速拒绝保护 P99”与“摘除 `EPOLLIN` 暂停读取反压”；
- ③ 参考 `TRK-17`：SQLite WAL 事务保障单批原子性（要么全写要么回滚），`batch_id TEXT PRIMARY KEY` + `ON CONFLICT DO NOTHING` 保障客户端重试幂等不重。

</details>
