# 方向选修与工程实战精进 (TRK)

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

完成公共工程主线后，按岗位需求系统深潜，全面覆盖 **后端/网络服务、基础设施/存储引擎、低延迟性能、桌面图形/游戏客户端、嵌入式/RTOS 以及工程方法论与核心面试**，共计 **50 节（TRK-01 ~ TRK-50）**。

## 第一篇 岗位全景与作品集路径（TRK-01 ~ TRK-08）

### 认识方向、拆解 JD 与简历包装

<a id="trk-01"></a>

#### TRK-01 C++ 四大主流岗位方向全景对比

- 先修：[CPP-01](cpp.md#cpp-01)
- 状态：已有[第 0 课：C++ 岗位全景、能力画像与 LogScan 作品集包装](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 服务端、存储基建、低延迟性能、客户端与嵌入式差异
  2. 对内存分配态度（常规池 / Arena / 零分配 / 禁堆）
  3. 八成相通核心内功（RAII、有界队列、CMake/CTest）

<a id="trk-02"></a>

#### TRK-02 Linux 服务端与网络微服务岗位画像

- 先修：[TRK-01](#trk-01)、[NET-38](network.md#net-38)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 网关、RPC、微服务日常核心开发内容
  2. C10K/C100K、背压保护、P99 延迟与句柄指标卡
  3. 非阻塞连接生命期配额原型

<a id="trk-03"></a>

#### TRK-03 基础设施、存储引擎与分布式中间件画像

- 先修：[TRK-01](#trk-01)、[DB-30](storage.md#db-30)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 为什么数据库和中间件死守 C++/Rust
  2. WAL 落盘、LSM 写路径与 Buffer Pool 读写直觉
  3. 写放大、读放大与空间放大权衡

<a id="trk-04"></a>

#### TRK-04 低延迟与量化性能工程岗位画像

- 先修：[TRK-01](#trk-01)、[MACH-47](machine.md#mach-47)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 纳秒级硬件代价表（L1 Cache vs 互斥锁 vs 系统调用）
  2. P99 / P99.9 极值延迟优先于平均耗时
  3. 热路径零堆分配与 `alignas(64)` 缓存行隔离示例

<a id="trk-05"></a>

#### TRK-05 桌面客户端、音视频与游戏引擎画像

- 先修：[TRK-01](#trk-01)、[CPP-34](cpp.md#cpp-34)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 界面主线程与 60fps 帧率预算压迫感
  2. 跨平台编译、插件 ABI 稳定与硬件渲染对接
  3. 音视频低抖动同步挑战

<a id="trk-06"></a>

#### TRK-06 嵌入式 MCU、RTOS 与自动驾驶机器人画像

- 先修：[TRK-01](#trk-01)、[MACH-15](machine.md#mach-15)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 几十 KB SRAM 无虚拟内存的极简约束
  2. `-fno-exceptions -fno-rtti` 与静态池替代 `malloc`
  3. 硬件寄存器 MMIO 与毫秒级中断响应

<a id="trk-07"></a>

#### TRK-07 把真实 C++ 招聘 JD 拆解成学习路线

- 先修：[TRK-01](#trk-01)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)。
- 小节
  1. 逐句把招聘 JD 黑话翻译成 Study_Site 模块号
  2. 区分必备核心技能与加分项
  3. 按目标方向筛选对应专题精读

<a id="trk-08"></a>

#### TRK-08 把 LogScan 打造成面试王牌作品集证据

- 先修：[TRK-07](#trk-07)
- 状态：已有[第 0 课：C++ 岗位全景与画像](../../src/content/handbook/track-zero-start.md)与[LogScan v3 实验](../../src/content/labs/logscan-service.md)。
- 小节
  1. STAR 法则改造普通项目描述为量化工程成果
  2. 面试必带四件套证据（代码、测试/Sanitizer、压测对比表、排障笔记）
  3. 从 v0 到 v3 的演进讲述主线

## 第二篇 高并发服务端架构、RPC 与 P99 性能调优（TRK-09 ~ TRK-22）

### 工业级网络后端核心建筑块

<a id="trk-09"></a>

#### TRK-09 Reactor vs Proactor（io_uring）事件驱动模型

- 先修：[NET-38](network.md#net-38)
- 状态：已有[方向篇（上）：高并发服务端架构、RPC、限流观测与 P99 性能调优](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. `epoll` 就绪通知 Reactor 模式边界
  2. Linux `io_uring` 与 Windows IOCP 异步完成 Proactor 机制
  3. 磁盘异步与超高系统调用吞吐适用选型

<a id="trk-10"></a>

#### TRK-10 多进程 vs 多线程与 One-Loop-Per-Thread

- 先修：[TRK-09](#trk-09)、[CON-19](concurrency.md#con-19)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. Main Reactor 分发 `fd` 与 IO Sub-Reactor 独占连接
  2. 每条连接缓冲零锁竞争原理
  3. 慢磁盘/CPU 重活卸载至后端有界线程池

<a id="trk-11"></a>

#### TRK-11 epoll 连接状态机、非阻塞 out_buf 与超时扫描

- 先修：[TRK-10](#trk-10)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. `ConnPhase` 状态流转与双截止时间（帧限时 vs 空闲超时）
  2. 防 Slowloris 慢攻击不顺延 `frame_deadline` 铁律
  3. 双客户端慢/快并发对照验收

<a id="trk-12"></a>

#### TRK-12 时间轮（Timing Wheel）O(1) 踢出空闲长连接

- 先修：[TRK-11](#trk-11)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 全表扫描与最小堆 O(log N) 调整在十万连接下的开销
  2. 60 槽环形数组推进指针 O(1) 续期与批量清理
  3. 多层时间轮扩展更长超时跨度思路

<a id="trk-13"></a>

#### TRK-13 高吞吐双缓冲异步日志设计

- 先修：[CON-20](concurrency.md#con-20)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 热路径同步写盘阻塞全服连接灾难
  2. 前端双内存缓冲满后指针交换零阻塞交接
  3. 后端批量落盘与崩溃时尽量保留尾巴日志

<a id="trk-14"></a>

#### TRK-14 序列化选型：JSON vs Protobuf vs FlatBuffers

- 先修：[MACH-36](machine.md#mach-36)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 文本可读 JSON vs 紧凑 Varint 二进制 Protobuf
  2. FlatBuffers/Cap'n Proto 零反序列化直接按偏移读取
  3. 前后端网关与内部高并发游戏引擎选型准则

<a id="trk-15"></a>

#### TRK-15 RPC 框架核心剖析与剩余截止时间传播

- 先修：[TRK-14](#trk-14)、[NET-46](network.md#net-46)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. Stub 代理打包、`request_id` 多路复用与路由分发
  2. 服务发现与连接池健康摘除
  3. Deadline Propagation 级联超时传播避免做无用功

<a id="trk-16"></a>

#### TRK-16 过载策略、令牌桶限流、熔断器与 systemd 托管

- 先修：[TRK-11](#trk-11)、[LNX-31](linux.md#lnx-31)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 队列满快速拒绝 503 vs 摘 `EPOLLIN` TCP 反压
  2. 令牌桶限突发、漏桶匀速与熔断器三态切换
  3. `systemd.service` 句柄数与崩溃自启配置

<a id="trk-17"></a>

#### TRK-17 优雅退出（SIGTERM）、幂等对账与原子回滚

- 先修：[TRK-16](#trk-16)、[DB-40](storage.md#db-40)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 5 步排空停机契约（停 accept → 收完完整帧 → 排空入库 → checkpoint）
  2. `batch_id PRIMARY KEY` + `ON CONFLICT DO NOTHING` 防重试重复
  3. 软链接原子切换与数据库只增不改秒级回滚

<a id="trk-18"></a>

#### TRK-18 Prometheus / OpenTelemetry 三支柱可观测性

- 先修：[TRK-16](#trk-16)、[CON-31](concurrency.md#con-31)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 无锁 `std::atomic` 导出 QPS Counter 与 Histogram 分位延迟
  2. 带 `trace_id` 结构化日志检索
  3. 跨节点 Trace 瀑布流定位慢跳

<a id="trk-19"></a>

#### TRK-19 SO_REUSEPORT 多核扩展与 CPU 绑核策略

- 先修：[TRK-10](#trk-10)、[MACH-47](machine.md#mach-47)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 内核按五元组哈希分发至多组独立监听队列
  2. 消除单 `accept` 锁竞争与惊群
  3. `pthread_setaffinity_np` 绑核降跨核缓存切换

<a id="trk-20"></a>

#### TRK-20 管线拆分、利特尔法则与容量预算模型

- 先修：[TRK-10](#trk-10)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 拆解网络拆帧、有界队列、解析与 SQLite 各阶段吞吐上限
  2. 用 $L = \lambda W$ 预判率先打满的瓶颈点
  3. 端到端请求守恒校验公式防静默丢包

<a id="trk-21"></a>

#### TRK-21 perf 火焰图剖析热点与 P99 尾延迟单因素实证

- 先修：[TRK-20](#trk-20)、[LNX-52](linux.md#lnx-52)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. `perf stat -d` 与 `perf record -F 99 -g --call-graph dwarf`
  2. 从火焰图平顶识别锁等待、刷盘或拷贝热点
  3. `batch=16` vs `batch=64` 控制变量吞吐与 P99 权衡实证

<a id="trk-22"></a>

#### TRK-22 压测协同遗漏避坑、自动回归门禁与 LogScan 规模化

- 先修：[TRK-21](#trk-21)
- 状态：已有[方向篇（上）正文](../../src/content/handbook/track-server-perf.md)。
- 小节
  1. 识别固定并发压测掩盖排队延迟的 Coordinated Omission 错觉
  2. 正确性前置 + 3 次预热 + 中位数/IQR 自动门禁
  3. 汇总多 Worker 无共享架构支撑万级接入

## 第三篇 基础架构、存储引擎与分布式系统（TRK-23 ~ TRK-32）

### 自己造数据库与分布式中间件底座

<a id="trk-23"></a>

#### TRK-23 基础架构与存储中间件研发核心挑战

- 先修：[TRK-03](#trk-03)
- 状态：已有[方向篇（中）：基础架构、自研内存分配器、存储引擎与分布式中间件](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 极高崩溃持久化承诺 vs 绕开系统通用缓存黑盒
  2. 写放大、读放大、空间放大三角不可能同时全优
  3. 单机多核并发到多副本分布式一致性跨越

<a id="trk-24"></a>

#### TRK-24 自研高性能分配器：Arena、Slab 与 Buddy

- 先修：[CON-45](concurrency.md#con-45)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. Arena 指针步进 1 条指令分配整块统一释放
  2. Slab 按固定槽位尺寸串空闲链表灭绝外碎片
  3. Buddy 按 $2^k$ 拆分合并管理连续大页

<a id="trk-25"></a>

#### TRK-25 Buffer Pool 缓冲池管理与 Clock / LRU-K 淘汰

- 先修：[DB-30](storage.md#db-30)、[OS-34](os.md#os-34)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. Pin / Unpin 引用计数防正在读取的页被中途踢出
  2. 为何全表扫描瞬间毒化普通 LRU 缓存热页
  3. LRU-K 与 Clock-Sweep 隔绝单次冷扫描保护索引热页

<a id="trk-26"></a>

#### TRK-26 WAL 预写日志、顺序刷盘与 Group Commit 组提交

- 先修：[DB-47](storage.md#db-47)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 先写顺序日志再改内存页的崩溃安全底线
  2. 机械盘与 SSD 随机写 vs 顺序追加吞吐鸿沟
  3. 多事务合并共用 1 次 `fsync` 的 Group Commit 性能飞跃

<a id="trk-27"></a>

#### TRK-27 KV 存储引擎两大家族：Bitcask vs LSM-Tree

- 先修：[TRK-26](#trk-26)、[DB-38](storage.md#db-38)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. Bitcask 全内存哈希索引 + 顺序追加日志（受限于 Key 内存总容量与范围查）
  2. LSM-Tree（MemTable 跳表 + WAL → 多层只读 SSTable）写高吞吐与范围查
  3. 按读写工作负载选型存储引擎结构

<a id="trk-28"></a>

#### TRK-28 SSTable Compaction 合并与布隆过滤器数学直觉

- 先修：[TRK-27](#trk-27)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 删除墓碑 Tombstone 与后台多路归并清理旧版本
  2. Size-Tiered（省写）vs Leveled（RocksDB 默认控空间）Compaction
  3. 布隆过滤器 O(1) 判定“100% 不存在”砍掉无效磁盘读取

<a id="trk-29"></a>

#### TRK-29 分布式共识 Raft：领导选举与多数派日志复制

- 先修：[TRK-26](#trk-26)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 任期 Term 与随机化超时打破选举平票僵局
  2. 多数派（$N/2 + 1$）确认提交确保少数故障绝不丢已确认日志
  3. 仅拥有完整已提交日志的节点才有资格胜选新主

<a id="trk-30"></a>

#### TRK-30 一致性哈希（Consistent Hashing）与虚拟节点扩缩容

- 先修：[DB-49](storage.md#db-49)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 简单取模 `hash % N` 扩容触发全网 75% 迁移风暴危机
  2. 哈希环把扩容影响隔离在相邻 $1/(N+1)$ 切片
  3. 虚拟节点打散各物理机落点均衡负载倾斜

<a id="trk-31"></a>

#### TRK-31 分布式缓存三大灾难（穿透/击穿/雪崩）防线

- 先修：[TRK-28](#trk-28)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 穿透（不存在 ID）：布隆过滤器拦截 + 短期空缓存
  2. 击穿（单热点过期）：Singleflight 互斥回源 + 逻辑异步续期
  3. 雪崩（大批同过期/宕机）：随机抖动 TTL + 多级缓存 + 熔断降级

<a id="trk-32"></a>

#### TRK-32 可靠异步任务与事务发件箱（Transactional Outbox）

- 先修：[TRK-17](#trk-17)
- 状态：已有[方向篇（中）正文](../../src/content/handbook/track-infra-storage.md)。
- 小节
  1. 本地写库后发 MQ 前崩溃引起的跨系统双写不一致
  2. 同一事务写业务表与 `outbox_events` 待发事件表
  3. 后台投递至少一次 + 下游幂等去重闭环

## 第四篇 桌面客户端、跨平台 ABI 与嵌入式实时系统（TRK-33 ~ TRK-42）

### 界面客户端、插件边界与单片机硬件实战

<a id="trk-33"></a>

#### TRK-33 Qt 事件循环、信号槽连接与线程归属

- 先修：[TRK-05](#trk-05)、[CPP-11](cpp.md#cpp-11)
- 状态：已有[方向篇（下）：Qt 桌面客户端、跨平台 ABI/插件、游戏帧预算与嵌入式 RTOS](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. GUI 主线程串行绘制规则与禁止后台直接改控件
  2. `DirectConnection` vs 跨线程按值投递 `QueuedConnection`
  3. `QObject` 父子对象树自动析构与禁止套用 `unique_ptr`

<a id="trk-34"></a>

#### TRK-34 大文件增量模型视图、任务代次取消与打包冒烟

- 先修：[TRK-33](#trk-33)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. `QAbstractTableModel` 分批 500 行增量刷新保持流畅
  2. 单调递增 `gen` 代次彻底过滤已入队旧文件晚到批次
  3. `windeployqt`/`linuxdeploy` 独立发布与干净虚拟机 3 项冒烟清单

<a id="trk-35"></a>

#### TRK-35 跨平台 C ABI 二进制边界与不透明指针设计

- 先修：[MACH-28](machine.md#mach-28)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. 绝不跨越 `.dll/.so` 边界传递 `std::string`/`std::vector` 与 C++ 异常
  2. `extern "C"` 导出函数配合不透明句柄 `typedef struct LogEngine LogEngine`
  3. 结构体首成员 `struct_size` / `api_version` 向后兼容扩展

<a id="trk-36"></a>

#### TRK-36 运行期动态插件加载（dlopen / LoadLibrary）

- 先修：[TRK-35](#trk-35)、[LNX-48](linux.md#lnx-48)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. POSIX `dlopen`/`dlsym`/`dlclose` vs Windows `LoadLibrary`/`GetProcAddress`
  2. 解析导出符号指针与安全卸载顺序防代码页卸载崩溃
  3. 主程序与插件间内存谁申请谁释放铁律

<a id="trk-37"></a>

#### TRK-37 游戏/图形 60fps 帧预算与 ECS 数据导向设计

- 先修：[MACH-33](machine.md#mach-33)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. 60Hz 16.67ms / 120Hz 8.33ms 严苛每帧全流程预算
  2. 固定物理步长与可变渲染插值解耦帧率波动
  3. ECS 将连续组件平铺 SoA 数组吃满 L1 缓存避开 OOP 虚表

<a id="trk-38"></a>

#### TRK-38 音视频与 UI 控制：无锁 SPSC 队列零抖动交付

- 先修：[CON-28](concurrency.md#con-28)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. 实时音频回调内禁止互斥锁防优先级反转与破音爆音
  2. 编译期定长 SPSC 环配合 `acquire`/`release` 原子下标交付
  3. 可预测最坏执行时间与零堆碎片保证

<a id="trk-39"></a>

#### TRK-39 嵌入式裸机 vs RTOS 与交叉编译 ELF 内存预算

- 先修：[TRK-06](#trk-06)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. 超级大循环 vs FreeRTOS 抢占多任务与固定栈分配
  2. `arm-none-eabi-g++` 交叉编译与 `-fno-exceptions -fno-rtti`
  3. 用 `size` / `nm --size-sort` 与 `.map` 严格守死 `.data + .bss` SRAM 门禁

<a id="trk-40"></a>

#### TRK-40 嵌入式定长环形缓冲与坏帧 1B 滑动重同步

- 先修：[TRK-39](#trk-39)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)（含[环形回放示例](../../public/examples/track-ringbuffer.cpp)）。
- 小节
  1. 禁用 `vector`/`string` 避免碎片与长期运行 OOM
  2. `0xAA 0x55` 魔数头 + 最大载荷上界检查防卡死
  3. 遇到畸形包逐字节 `discard(1)` 重同步下一合法帧

<a id="trk-41"></a>

#### TRK-41 MMIO 硬件寄存器（volatile）与 ISR 中断隔离境界

- 先修：[TRK-40](#trk-40)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. 为什么必须用 `volatile` 读写硬件寄存器状态位
  2. ISR 严禁 `malloc`/`printf`/阻塞，仅用 `FromISR` 或 SPSC 入环快进快出
  3. `volatile`（防硬件寄存器优化）与 `std::atomic`（共享同步）彻底区分

<a id="trk-42"></a>

#### TRK-42 外设通信总线（UART/I2C/SPI/CAN/DMA）与看门狗 OTA

- 先修：[TRK-41](#trk-41)、[MACH-50](machine.md#mach-50)
- 状态：已有[方向篇（下）正文](../../src/content/handbook/track-client-embedded.md)。
- 小节
  1. UART 异步、I2C 半双工寻址、SPI 高速四线与车规 CAN 差分仲裁对比
  2. DMA + IDLE 中断零 CPU 搬运收不定长串口包
  3. 硬件看门狗救死机与 A/B 双分区 CRC 校验不死变砖 OTA

## 第五篇 工程匠艺、线上救火与核心面试通关（TRK-43 ~ TRK-50）

### 从会写代码到值得托付生产系统

<a id="trk-43"></a>

#### TRK-43 工业级 Code Review 六维核对检查单

- 先修：[ENG-40](engineering.md#eng-40)
- 状态：已有[方向篇（收官）：工程 Code Review、线上排障、技术写作与核心面试深潜](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 格式琐事交工具自动化，人眼紧盯所有权、错误路径与边界安全
  2. 识别持锁做 I/O、无界增长容器与条件变量 `if` 隐患
  3. 审查变更范围最小化与失败分支测试覆盖

<a id="trk-44"></a>

#### TRK-44 线上生产崩溃 Post-mortem（验尸排查与复盘）

- 先修：[LNX-52](linux.md#lnx-52)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 保留 `coredump`、`gcore` 与 `perf` 现场再重启止损
  2. 符号表下用 `gdb bt` / `thread apply all bt` 锁定现场
  3. 剥离最小复现 + Sanitizer 验证并产出对事不对人复盘

<a id="trk-45"></a>

#### TRK-45 编写架构决策记录（ADR）与技术方案文档

- 先修：[TRK-43](#trk-43)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 动工前花 2 小时对齐方案免去写完推翻返工
  2. 背景约束、至少 2 组备选对比、Non-goals 边界与回滚预案
  3. 用量化 SLO 与可观测指标验证方案达标

<a id="trk-46"></a>

#### TRK-46 干净的微基准测试：避开“骗自己的假快”

- 先修：[MACH-29](machine.md#mach-29)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 死代码消除 DCE 与编译期常量折叠导致的 0ns 幻觉
  2. `DoNotOptimize` 与运行时动态输入制造
  3. 热身、控制变量及报告中位数与 P99 分布

<a id="trk-47"></a>

#### TRK-47 开源 C++ 宝藏仓库源码精读路线（fmt/spdlog/asio/rocksdb）

- 先修：[TRK-43](#trk-43)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. `fmt` 编译期检查与类型擦除控膨胀之美
  2. `spdlog` 与 `asio`/`muduo` 异步架构拆解
  3. 从 2 万行 `leveldb` 切入理解 LSM-Tree 工程实现

<a id="trk-48"></a>

#### TRK-48 高频底层面试“零含糊”标准讲法全攻略

- 先修：[TRK-47](#trk-47)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 讲清 `vector` 24B 布局、`noexcept` 移动与失效规则
  2. 讲清 `shared_ptr` 控制块、原子计数与对象读写不安全边界
  3. 讲透 `epoll` LT/ET、B+ 树矮胖范围查与内存序 ABA

<a id="trk-49"></a>

#### TRK-49 系统设计面试实战：高并发分布式日志平台设计

- 先修：[TRK-22](#trk-22)、[TRK-32](#trk-32)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 5 分钟容量估算（QPS/带宽/每日存储 TB）定框架
  2. 端到端流水线 `Agent → 网关 → Kafka → 列存/检索`
  3. 深挖突发限流背压与 `batch_id` 端到端幂等不重不漏

<a id="trk-50"></a>

#### TRK-50 90 天旗帜项目冲刺路线：从 LogScan 到核心竞争力

- 先修：[TRK-08](#trk-08)、[TRK-49](#trk-49)
- 状态：已有[方向篇（收官）正文](../../src/content/handbook/track-interview-craft.md)。
- 小节
  1. 第 1~30 天：CMake + CTest + Git PR + ASan/UBSan 全绿工程闭环
  2. 第 31~60 天：Linux/WSL2 上跑通 SQLite WAL 事务与 epoll 有界服务
  3. 第 61~90 天：补齐方向专题特性、perf 数据对照与开源级 README 文档
