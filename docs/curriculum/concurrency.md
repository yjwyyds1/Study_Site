# 并发与性能（CON）

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

以 C++20 和 Linux（含 WSL2）为实验环境。线程实验用支持线程的工具链，Linux 单文件构建加 `-pthread`，CMake 工程使用 `Threads::Threads`。练习列出预期与核对法，实测保留环境、命令、原始输出和差异。[已有验证记录](../example-verification.md)记录基线构建状态。

本学科共 **58 节核心课程（`CON-01`–`CON-58`）**，系统组织为六大正文篇章：
1. [第 0 课：并发基石、线程创建与生命周期](../../src/content/handbook/con-zero-start.md)（`CON-01`–`CON-08`，含[破冰示例](../../public/examples/con-zero.cpp)）
2. [互斥锁、死锁防线与线程同步原语](../../src/content/handbook/con-locks-sync.md)（`CON-09`–`CON-18`）
3. [并发队列、Future、线程池与无锁环形缓冲区](../../src/content/handbook/concurrency-queue.md)（`CON-19`–`CON-28`，含[队列源码](../../public/examples/concurrency-queue.cpp)）
4. [硬件内存模型、原子操作、无锁数据结构与 C++20 协程](../../src/content/handbook/con-atomics-lockfree.md)（`CON-29`–`CON-39`）
5. [并发性能工程、微基准测试与端到端调优实战](../../src/content/handbook/con-perf-tuning.md)（`CON-40`–`CON-50`）
6. [《C++ Concurrency in Action (2e)》全书精讲：从线程管控、并发数据结构、无锁内存回收到工作窃取线程池](../../src/content/handbook/con-ccia-mastery.md)（`CON-51`–`CON-58`）

工程主线最终汇聚于 [LogScan v3 有界 TCP 日志服务](../../src/content/labs/logscan-service.md)。

---

## 第一篇 并发基石与线程生命周期

### 模块一 并发模型与线程入门

- 入口：能写 C++20 函数并理解栈/堆对象作用域（[CPP-01](cpp.md#cpp-01)、[CPP-09](cpp.md#cpp-09)、[CPP-10](cpp.md#cpp-10)）。
- 能力：区分并发与并行、估算多核加速上限，并安全创建、传参及协作停止 C++20 线程。
- 检验：完成分段并行求和、竞态复现与 `std::jthread` 协作取消练习。

<a id="con-01"></a>

#### CON-01 并发 vs 并行：单咖啡师与双咖啡师

- 先修：[CPP-01](cpp.md#cpp-01)、[OS-03](os.md#os-03)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：只有 1 个 CPU 核心时，多线程程序还有意义吗？
- 小节
  1. 用单咖啡师与双咖啡师区分并发结构与物理并行
  2. 画出单核时间片交替与多核同时执行时序
  3. 识别 I/O 密集并发与 CPU 密集并行的硬件条件
- 能力：能准确区分并发（Concurrency）与并行（Parallelism）并解释单核并发的价值。
- 练习与预期：在纸上标出两个线程在单核阻塞 I/O 与双核纯计算下的执行时间线，核对总墙钟时间差异。
- 项目或独立实验：为自己的机器查询逻辑核数，对比单线程与双线程扫描模拟任务的执行特点。

<a id="con-02"></a>

#### CON-02 Amdahl 定律与 Gustafson 定律

- 先修：[CON-01](#con-01)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：为什么把 1 核换成 16 核，程序并不一定快 16 倍？
- 小节
  1. 推导固定工作量下的 Amdahl 加速比公式与串行瓶颈上限
  2. 理解扩展问题规模时的 Gustafson 定律（强扩展 vs 弱扩展）
  3. 用两定律估算日志处理流水线的多核投入收益
- 能力：能根据串行占比 $1 - p$ 计算 $N$ 核及无穷核下的理论加速天花板。
- 练习与预期：给定串行占比 25%，计算 8 核与无穷核加速比，预期分别为约 2.91× 与 4.00×。
- 项目或独立实验：列出 LogScan 流程中的串行环节与可并行环节，估算理论最大加速比。

<a id="con-03"></a>

#### CON-03 共享内存机制与 count++ 三步竞态演示

- 先修：[CON-01](#con-01)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)（含[破冰示例](../../public/examples/con-zero.cpp)）。
- 问题：为什么只有一行的 `++count` 在两个线程同时跑时会算少？
- 小节
  1. 区分进程/线程间共享的地址空间（堆、全局区）与私有栈/寄存器
  2. 拆解 `++count` 的 Load → Add → Store 三步机器指令交错
  3. 对比无锁竞态、互斥锁保护与零共享局部归并结果
- 能力：能画出两个线程对同一计数器的指令交错失真过程，并用局部累加替代高频共享写。
- 练习与预期：运行 `con-zero.cpp` 验证加锁余额恒等于 200000；去除锁做反面对比观察丢失更新，再改用局部变量汇总至 400000。
- 项目或独立实验：将 1 到 10000 求和拆为 4 分片局部累加并核对总和等于 50005000。

<a id="con-04"></a>

#### CON-04 创建线程：std::thread 与可调用对象

- 先修：[CON-03](#con-03)、[CPP-06](cpp.md#cpp-06)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：如何用普通函数、仿函数与 Lambda 批量创建并管理多个线程？
- 小节
  1. 使用函数指针、仿函数与 Lambda 启动 `std::thread`
  2. 避开 Most Vexing Parse 语法解析陷阱
  3. 用 `std::move` 与 `std::vector<std::thread>` 批量管理线程组
- 能力：能正确构造和移动 `std::thread`，使用 `std::this_thread::get_id()` 与 `sleep_for`。
- 练习与预期：在 `vector<std::thread>` 中启动 4 个带编号的 Lambda 线程并全部 `join()`，核对 4 个编号均输出。
- 项目或独立实验：编写多线程打印线程 ID 的独立实验（用互斥锁防止行交叉）。

<a id="con-05"></a>

#### CON-05 生命周期死刑陷阱：join() vs detach()

- 先修：[CON-04](#con-04)、[CPP-09](cpp.md#cpp-09)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：为什么提前 `return` 漏写 `join()` 会直接崩溃，而 `detach()` 捕获局部变量更危险？
- 小节
  1. 追踪 `joinable()` 状态机与 `std::terminate()` 触发条件
  2. 用 RAII `ThreadGuard` 保证异常退出路径必汇合
  3. 分析 `detach()` 守护线程导致的栈悬空引用（UAF）灾难
- 能力：能判断线程可汇合状态，确保被引用对象寿命长于线程实际执行期。
- 练习与预期：分别用值捕获与 RAII 守卫改写含提前返回路径的函数，核对无 `std::terminate()` 异常退出。
- 项目或独立实验：画出局部栈变量销毁顺序与线程汇合点的时间轴对比图。

<a id="con-06"></a>

#### CON-06 参数传递陷阱：值传递、std::ref 与成员函数

- 先修：[CON-05](#con-05)
- 层级：入门（基础）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：线程函数明明接收引用参数 `int&`，为什么直接传变量会编译失败或改不到原值？
- 小节
  1. 理解 `std::thread` 构造时内部 decay 拷贝转发机制与 `std::ref`
  2. 避开 `const char*` 隐式转 `std::string` 延迟到新线程引起的悬空指针
  3. 掌握类成员函数指针传参及 `std::unique_ptr` 所有权移动
- 能力：能安全地向线程传递引用、只可移动对象和成员方法，避免隐式类型转换陷阱。
- 练习与预期：两线程分别用 `std::ref` 写入独立输出槽位求和 `1..10` 与 `11..20`，汇合断言得 `55` 与 `155`。
- 项目或独立实验：编写一个接收 `std::unique_ptr<std::string>` 并调用类成员方法处理的独立线程示例。

<a id="con-07"></a>

#### CON-07 C++20 协作取消：std::jthread 与 std::stop_token

- 先修：[CON-06](#con-06)
- 层级：核心应用（主线）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：为什么不能强杀线程，而要使用 `std::jthread` 与 `std::stop_token` 协作停止？
- 小节
  1. 掌握 `std::jthread` 析构自动 `request_stop()` 与 `join()` 的 RAII 机制
  2. 用 `std::stop_token::stop_requested()` 与 `std::stop_callback` 响应取消
  3. 理解强杀线程为何破坏锁和资源不变量
- 能力：能使用 `std::jthread` 和 `std::stop_token` 写出异常安全、可随时优雅中止的工作循环。
- 练习与预期：启动周期打印心跳的 `std::jthread`，主线程休眠 100 ms 后调用 `request_stop()`，预期触发 `stop_callback` 并干净退出返回 0。
- 项目或独立实验：将旧 `std::thread` 示例重构为 `std::jthread`，验证提前返回路径不再崩溃。

<a id="con-08"></a>

#### CON-08 线程局部存储 thread_local 与硬件并发度

- 先修：[CON-07](#con-07)
- 层级：核心应用（主线）
- 状态：已有[并发基石与线程生命周期正文](../../src/content/handbook/con-zero-start.md)。
- 问题：如何让每个线程拥有专属统计槽位，以及程序究竟该开多少个线程？
- 小节
  1. 掌握 `thread_local` 变量每线程独立实例的生命期与零锁优势
  2. 用 `std::thread::hardware_concurrency()` 获取核数并处理返回 0 的兜底
  3. 区分 CPU 密集与 I/O 密集场景下的线程数量预算
- 能力：能使用 `thread_local` 消除线程局部状态共享，并合理配置线程池默认大小。
- 练习与预期：两线程各自对 `thread_local int hits` 累加不同次数并打印，主线程自身 `hits` 仍为 0。
- 项目或独立实验：用 `thread_local` 实现每线程独立错误日志缓存并做最终合并。

---

## 第二篇 互斥锁、死锁防线与同步原语

### 模块二 互斥与锁防线

- 入口：已能安全启动并汇合多线程（`CON-08`）。
- 能力：分清数据竞争与逻辑竞态，熟练运用 `mutex`、`unique_lock`、`scoped_lock` 与 `shared_mutex` 守护共享不变量。
- 检验：完成双账户防死锁并发转账测试、读写锁缓存实验与线程安全容器改造。

<a id="con-09"></a>

#### CON-09 数据竞争 (UB) vs 逻辑竞态条件

- 先修：[CON-03](#con-03)、[CPP-16](cpp.md#cpp-16)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：为什么每个方法单独加了锁，组合调用依然会出错？
- 小节
  1. 严格区分 C++ 标准定义的数据竞争（UB）与逻辑竞态条件
  2. 剖析 Check-Then-Act（TOCTOU）跨步竞态缺陷
  3. 确立“以业务不变量为边界”的临界区划分原则
- 能力：能识别加了锁仍存在的复合接口竞态，解释为何 TSan 能抓 Data Race 却抓不住所有逻辑竞态。
- 练习与预期：对比先 `empty()` 后 `pop()` 的双线程崩溃用例与合并加锁后的稳定运行用例。
- 项目或独立实验：审查并列出共享结构体跨字段不变量的合法访问边界。

<a id="con-10"></a>

#### CON-10 std::mutex 与 RAII std::lock_guard

- 先修：[CON-09](#con-09)、[CPP-10](cpp.md#cpp-10)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：如何用最少的代码开销保证异常和提前返回时锁绝对不会漏解？
- 小节
  1. 理解 `std::mutex` 排他、不可移动及“谁锁谁解”契约
  2. 使用 `std::lock_guard` 封装原子级临界区更新与 `mutable mutex` 只读快照
  3. 牢记绝不持锁做阻塞 I/O 或调用外部回调铁律
- 能力：能用 `std::lock_guard` 保护多字段状态，设计短小紧凑的临界区。
- 练习与预期：编写含 `total_lines` 与 `error_lines` 的 `SafeLogStats`，多线程写入后验证快照内部字段严格自洽。
- 项目或独立实验：在持锁路径插入异常抛出测试，验证 `lock_guard` 析构后另一线程仍可成功取锁。

<a id="con-11"></a>

#### CON-11 std::unique_lock 全特性详解

- 先修：[CON-10](#con-10)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：需要在离开作用域前提前解锁、延迟加锁或把锁移交出去时怎么办？
- 小节
  1. 对比 `std::defer_lock`、`std::try_to_lock` 与 `std::adopt_lock`
  2. 持锁提取局部数据后手动 `unlock()` 再做耗时处理
  3. 通过返回值移动转移 `unique_lock` 所有权并对比性能代价
- 能力：能在需要灵活控制锁生命周期时正确选用 `std::unique_lock`，并在不需要时退回 `lock_guard`。
- 练习与预期：实现一个先取锁拷贝数据、中途解锁再打印、随后 `try_to_lock` 更新状态的演示函数。
- 项目或独立实验：编写一个返回已加锁 `std::unique_lock` 的受保护资源访问器函数。

<a id="con-12"></a>

#### CON-12 死锁原因、std::scoped_lock 与锁层次

- 先修：[CON-11](#con-11)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：同时锁住两个账户做并发转账时，为什么程序会突然一动不动？
- 小节
  1. 掌握死锁 Coffman 四个必要条件与 AB-BA 锁序反转模型
  2. 使用 C++17 `std::scoped_lock` 一次性原子安全锁多把锁
  3. 跨函数场景下建立全局锁顺序与运行时锁层次检查（及自死锁防范）
- 能力：能消除多锁交互中的循环等待和自死锁，并能用锁顺序图证明无死锁。
- 练习与预期：两线程相反方向并发执行 10000 次 `transfer(a, b, 1)` 与 `transfer(b, a, 1)`，验证在 1 秒内结束且余额之和恒为 2000。
- 项目或独立实验：为包含自反检查的 `swap_data` 绘制锁顺序图并提交测试证据。

<a id="con-13"></a>

#### CON-13 读写锁 std::shared_mutex 与写者饥饿陷阱

- 先修：[CON-12](#con-12)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：读操作占 99% 时，如何让多个读线程同时放行而写线程互斥？
- 小节
  1. 配合 `std::shared_lock`（多读并发）与 `std::unique_lock`（单写独占）
  2. 权衡原子读者计数带来的缓存行开销与适用阈值
  3. 警惕写者饥饿陷阱与“持读锁直接升级写锁必死锁”禁忌
- 能力：能为读多写少场景正确选型 `std::shared_mutex`，并规避锁升级死锁。
- 练习与预期：实现支持并发 `lookup` 与独占 `update` 的 `RouteTable`，用 4 读 1 写线程验证无数据竞争。
- 项目或独立实验：实测短临界区下 `std::mutex` 与 `std::shared_mutex` 在不同读写比下的吞吐拐点。

<a id="con-14"></a>

#### CON-14 单次初始化：std::call_once 与 Meyers 单例

- 先修：[CON-10](#con-10)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：为什么曾经手写的“双重检查锁（DCLP）”在多线程下会读到半初始化对象？
- 小节
  1. 剖析旧式 DCLP 指针发布缺失同步的崩溃根因
  2. 掌握 C++11+ 局部静态变量（Meyers 单例）线程安全初始化保证
  3. 使用 `std::once_flag` 与 `std::call_once` 处理成员延迟初始化与异常重试
- 能力：能写出异常安全且零数据竞争的单次延迟初始化逻辑。
- 练习与预期：8 个线程同时调用带计数器统计的 `std::call_once` 初始化块，断言初始化回调严格只执行 1 次。
- 项目或独立实验：验证 `std::call_once` 第一次调用抛异常后，第二次调用仍能成功重试初始化。

---

### 模块三 等待协调与同步原语

- 入口：已掌握互斥锁和死锁预防（`CON-14`）。
- 能力：用条件变量、协作取消和 C++20 同步门（Latch/Barrier/Semaphore）构建无忙等的多线程协调协议。
- 检验：完成虚假唤醒对照实验、可控起跑门栓和线程安全栈接口改造。

<a id="con-15"></a>

#### CON-15 条件变量 wait/notify 与虚假唤醒铁律

- 先修：[CON-11](#con-11)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：为什么等待某条件成立时绝不能写 `while (!ready) {}` 忙轮询，且 `wait()` 必须带谓词？
- 小节
  1. 追踪 `cv.wait` 原子释放锁、休眠、被唤醒并重新抢锁的完整时序
  2. 预防丢失唤醒（Lost Wakeup）、虚假唤醒（Spurious）与被截胡唤醒（Stolen）
  3. 对比 `notify_one` / `notify_all` 及锁外通知微优化
- 能力：能用“同一把锁 + 共享谓词 + `wait(lk, pred)`”写出免疫虚假唤醒的等待协议。
- 练习与预期：用双消费者抢 1 条消息复现 `if` 写法越界风险，改用谓词 Lambda 断言零错误。
- 项目或独立实验：记录锁内通知与先 `unlock()` 再通知的行为一致性测试。

<a id="con-16"></a>

#### CON-16 condition_variable_any 与 stop_token 集成

- 先修：[CON-07](#con-07)、[CON-15](#con-15)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：如果工作线程正睡在条件变量上，外部 `jthread::request_stop()` 怎么立刻叫醒它？
- 小节
  1. 对比 `condition_variable` 与通用型 `condition_variable_any`
  2. 使用 C++20 `wait(lock, stop_token, pred)` 返回值判定退出原因
  3. 理解内部自动注册 `stop_callback` 唤醒的底层机制
- 能力：能结合 `std::jthread` 与 `std::condition_variable_any` 实现无需额外标志位的可取消等待循环。
- 练习与预期：运行 `CON-16` 协作取消示例，在未推入新任务时调用 `request_stop()`，验证工作线程立即醒来退出。
- 项目或独立实验：用 `condition_variable_any` 配合 `std::shared_lock` 实现一次条件等待测试。

<a id="con-17"></a>

#### CON-17 C++20 同步三剑客：latch、barrier 与 counting_semaphore

- 先修：[CON-15](#con-15)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：如何让多个线程严格“同时起跑”、分轮次对齐，或限制最多只有 $M$ 个并发名额？
- 小节
  1. 用一次性倒计时门栓 `std::latch` 编排并发测试起跑线
  2. 用可复用多阶段屏障 `std::barrier` 与 Phase Completion 回调
  3. 用 `std::counting_semaphore` / `binary_semaphore` 做资源限流与无所有权发信
- 能力：能分辨互斥锁与信号量的所有权差异，并用 C++20 标准门栓取代手写计数条件变量。
- 练习与预期：使用 `std::latch(1)` 精确编排“先写后等”与“先等后写”两种时序；再用 `counting_semaphore<2>` 限制 4 线程最多 2 个同时进入临界段。
- 项目或独立实验：使用 `std::barrier` 实现 3 线程 3 轮阶段迭代同步并核对每轮汇总计数。

<a id="con-18"></a>

#### CON-18 线程安全容器设计：接口竞态与锁粒度权衡

- 先修：[CON-09](#con-09)、[CON-10](#con-10)
- 层级：核心应用（主线）
- 状态：已有[互斥锁、死锁防线与线程同步原语正文](../../src/content/handbook/con-locks-sync.md)。
- 问题：怎样设计安全的 `ThreadSafeStack` 接口，并在粗粒度锁、细粒度锁和分段锁之间做取舍？
- 小节
  1. 合并 `top()` 与 `pop()` 消除接口级 Check-Then-Act 竞态
  2. 兼顾弹出拷贝时的强异常安全（`shared_ptr` 返回 vs 引用/optional 输出）
  3. 对比粗粒度锁、细粒度手递手锁与分段锁（Lock Striping）的吞吐与复杂度
- 能力：能设计无接口竞态且异常安全的并发容器，并针对竞争热点选择分段锁粒度。
- 练习与预期：实现 `ThreadSafeStack<int>` 的两种 `try_pop` 重载，4 线程并发压入弹出 10000 项核对总数守恒。
- 项目或独立实验：对比 1 把大锁与 16 分段锁在多核插入查询下的吞吐变化。

---

## 第三篇 并发队列、线程池与无锁环形缓冲区

### 模块四 阻塞队列与背压流水线

- 入口：已能使用条件变量和同步原语编写线程安全状态机（`CON-18`）。
- 能力：构建可优雅排空关闭的 `BoundedQueue`、防惊群双条件变量及基于利特尔法则的背压模型。
- 检验：通过 `concurrency-queue.cpp` 满等/空等/关闭验收，并完成多消费者压测校验。

<a id="con-19"></a>

#### CON-19 生产者-消费者模型与 BoundedQueue 架构

- 先修：[CON-15](#con-15)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)（含[队列源码](../../public/examples/concurrency-queue.cpp)）。
- 问题：为什么生产-消费流水线必须限制队列容量上限？
- 小节
  1. 建立有界容量、FIFO 顺序和互斥保护不变量
  2. 逐拍追踪生产者与消费者在满/空边界的交错状态转换
  3. 区分队列出队顺序（FIFO）与多工人并行完成顺序
- 能力：能写出支持容量上限和多线程并发读写的 `BoundedQueue`，识别 OOM 风险。
- 练习与预期：运行 `concurrency-queue.cpp` 验证单消费者按 FIFO 打印 3 条日志后排空退出；扩充 3 消费者处理 0–19 核对集合无遗漏不重复。
- 项目或独立实验：在容量 1 下测试生产者满等与消费者空等行为。

<a id="con-20"></a>

#### CON-20 单条件变量 vs 双条件变量与惊群效应

- 先修：[CON-19](#con-19)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：为什么生产者和消费者绝对不能偷懒共用同一个 `condition_variable` 配合 `notify_one()`？
- 小节
  1. 剖析单条件变量下 `notify_one()` 错叫同侧线程引起的永久死锁
  2. 剖析被迫用 `notify_all()` 导致的惊群效应（Thundering Herd）与无效唤醒
  3. 用 `not_full_` 与 `not_empty_` 双条件变量实现精准单点唤醒
- 能力：能解释双条件变量如何消除惊群并保证活锁/死锁免疫。
- 练习与预期：画出 2 生产者 + 2 消费者在单条件变量 `notify_one` 下的唤醒错配卡死场景图。
- 项目或独立实验：统计高并发下 `notify_all` 与双条件变量 `notify_one` 的上下文切换次数差异。

<a id="con-21"></a>

#### CON-21 优雅关闭与队列排空契约

- 先修：[CON-20](#con-20)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：收到停机信号时，如何确保已经入队的存量日志不丢失，且阻塞在两端的线程都能醒来？
- 小节
  1. 对比排空（Drain）、立即丢弃（Discard）与超时排空三种停机策略
  2. 建立 `close()` 幂等性、拒收新任务与双侧 `notify_all()` 契约
  3. 牢记“先 `close()` 后 `join()`”的防卡死停机次序
- 能力：能设计清晰的停止接入与存量排空协议，排查程序挂起不退出 Bug。
- 练习与预期：安排空队列消费者与满队列生产者同时阻塞后调用 `close()`，验证双方均醒来、已入队记录全消费完且重复 `close()` 安全。
- 项目或独立实验：复现先 `join()` 后 `close()` 导致的死锁并用 `gdb thread apply all bt` 观察栈帧。

---

### 模块五 异步任务、线程池与无锁工程队列

- 入口：已掌握 `BoundedQueue` 的同步与退出契约（`CON-21`）。
- 能力：运用 `future`/`promise`/`packaged_task`、线程池、工作窃取、SPSC 无锁环形队列与分片并发哈希表。
- 检验：交付支持任意返回值与异常透传的 `ThreadPool`，以及可编译校验的无锁 `SPSCRingBuffer`。

<a id="con-22"></a>

#### CON-22 跨线程结果与异常传递：std::future 与 std::promise

- 先修：[CON-19](#con-19)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：子线程算出的结果或中途抛出的异常，怎样安全地跨线程传回主线程？
- 小节
  1. 理解 `promise`（写端）与 `future`（读端）之间的一次性共享状态
  2. 用 `set_exception(std::current_exception())` 实现异常跨线程重抛
  3. 区分单次 `future` 与可多次广播的 `std::shared_future` 及 `broken_promise`
- 能力：能使用 `promise`/`future` 完成一次性的结果与错误跨线程交付。
- 练习与预期：运行含正常除数与除数 0 的双任务示例，验证正常值返回 20 且除 0 异常在主线程 `get()` 被捕获。
- 项目或独立实验：测试 `promise` 未设值直接析构时 `future::get()` 抛出的 `std::future_error`。

<a id="con-23"></a>

#### CON-23 任务包装与异步启动：packaged_task 与 std::async 陷阱

- 先修：[CON-22](#con-22)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：为什么直接写 `std::async(fn);` 不接返回值反而变成了同步串行执行？
- 小节
  1. 用 `std::packaged_task` 将任意可调用对象与 `future` 解耦打包
  2. 识破 `std::async` 默认策略（允许 `launch::deferred` 延迟到 `get()` 才跑）陷阱
  3. 避开 `std::async` 临时 `future` 析构阻塞等任务完成的隐藏串行坑
- 能力：能辨别 `std::async` 的两大陷阱，并理解 `packaged_task` 在线程池封装中的关键地位。
- 练习与预期：对比忘记接住 `async` 返回值与用 `std::vector<std::future<void>>` 接住时的总墙钟耗时差异。
- 项目或独立实验：测试 `std::launch::deferred` 下执行 `get()` 前后的线程 ID 是否与主线程相同。

<a id="con-24"></a>

#### CON-24 打造生产级线程池：任务提交、返回值与安全停机

- 先修：[CON-21](#con-21)、[CON-23](#con-23)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：如何实现一个支持任意函数签名、返回 `future` 且析构自动排空的安全 `ThreadPool`？
- 小节
  1. 用 `packaged_task` + `shared_ptr` + `std::apply` 擦除任意任务类型入队
  2. 设计成员变量声明顺序（`workers_` 置尾）保证析构先后安全
  3. 规避“池内任务相互 `.get()` 等待同池子任务”的线程池饥饿死锁
- 能力：能从零编写支持有界队列背压、泛化 `submit` 和优雅 `shutdown` 的线程池。
- 练习与预期：向 4 线程 `ThreadPool` 提交 `1..8` 平方计算任务并汇总 `future.get()`，断言结果等于 204。
- 项目或独立实验：测试满队列提交阻塞及在池内向任务抛异常时主线程能否正常捕获。

<a id="con-25"></a>

#### CON-25 工作窃取队列与 Fork-Join 并行模式

- 先修：[CON-24](#con-24)
- 层级：进阶专题（进阶）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：16 核机器上处理海量微任务时，所有线程抢同一个全局队列锁成了瓶颈怎么办？
- 小节
  1. 理解每线程本地双端队列（Deque）架构：自己端 LIFO 缓存友好，小偷端 FIFO 偷大块
  2. 对比中央共享队列与 Work-Stealing 在高核数微任务下的竞争差异
  3. 掌握 Fork-Join 递归分治与工作线程 *Helping* 机制如何免除池内饥饿死锁
- 能力：能解释工作窃取队列两端并发操作的设计动机与适用负载特征。
- 练习与预期：画出 2 个 Worker 在递归拆分子任务时本地 Push/Pop 与跨线程 Steal 的双端指针演化图。
- 项目或独立实验：实现一个基于阈值切分的并行归并排序并与单线程对比加速比。

<a id="con-26"></a>

#### CON-26 无锁 SPSC 环形缓冲区：单生产者单消费者原子实现

- 先修：[CON-19](#con-19)、[CON-34](#con-34)
- 层级：进阶专题（进阶）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：为什么单生产者对单消费者（SPSC）环形队列既不用互斥锁也不用 CAS 循环？
- 小节
  1. 用 2 的幂容量位掩码取代取模，并区分满/空状态边界
  2. 隔离 `head_`（消费者独占写）与 `tail_`（生产者独占写）及 `alignas(64)` 防伪共享
  3. 用 `acquire`/`release` 内存序保护环形槽位元素发布的可见性
- 能力：能写出真正 Wait-Free（无等待）的定长 SPSC 环形缓冲区并证明其线程安全。
- 练习与预期：运行 `SPSCRingBuffer` 连续传递 `1..100000`，核对消费端校验和严格等于 `5000050000`。
- 项目或独立实验：为 `SPSCRingBuffer` 加上本地缓存下标优化（减少跨核原子读），实测吞吐提升。

<a id="con-27"></a>

#### CON-27 并发哈希表设计：分段锁桶 vs 无锁方案与危险点

- 先修：[CON-13](#con-13)、[CON-18](#con-18)
- 层级：进阶专题（进阶）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：为什么不能直接给 `std::unordered_map` 读写全放开，分片锁与无锁哈希表如何取舍？
- 小节
  1. 剖析 Rehash 扩容对并发迭代器和引用的毁灭性失效
  2. 实现 `ShardedHashMap`（分片 `shared_mutex` + `alignas(64)` 隔离伪共享）
  3. 识别无锁哈希表在并发扩容（Resizing）与安全内存回收上的工程高门槛
- 能力：能独立实现生产可用的分片并发哈希表，说明为何大多数业务应首选分片锁。
- 练习与预期：用 8 个线程并发对 64 分片 `ShardedHashMap` 插入和查询 10 万个键值，TSan 下零告警通过。
- 项目或独立实验：为 `ShardedHashMap` 增加全局 `total_size()` 方法并确保加锁顺序不死锁。

<a id="con-28"></a>

#### CON-28 背压、有界延迟与队列容量建模 (Little's Law)

- 先修：[CON-21](#con-21)
- 层级：核心应用（主线）
- 状态：已有[并发队列、Future、线程池与无锁环形缓冲区正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：为什么随手把队列容量设成 10 万反而会把服务拖入灾难，队列到底该设多大？
- 小节
  1. 对比阻塞 `push`、限时 `push_for` 与即时拒绝 `try_push` 三种背压策略
  2. 应用 Little's Law（$L = \lambda \cdot W$）根据吞吐率与最大容忍排队时间反推容量上限
  3. 识别 Bufferbloat（缓冲膨胀）对服务端尾延迟与上游超时的恶性放大
- 能力：能根据 SLA 排队延迟预算与服务处理速率科学计算队列容量与字节上限，并实施过载快速拒绝。
- 练习与预期：已知 4 工人满载吞吐 $\lambda = 800\text{ req/s}$，要求排队耗时 $W_{\max} \le 50\text{ ms}$，核对队列容量上限应设为 $\le 40$；并用 `try_push` 在容量 2 满时验证即时拒绝。
- 项目或独立实验：集成到 LogScan v3，记录不同容量上限下的接收数、拒绝数与 P99 延迟曲线。

---

## 第四篇 硬件内存模型、无锁与 C++20 协程

### 模块六 硬件乱序与 C++ 内存模型

- 入口：已理解数据竞争和基础原子计数（`CON-09`、`CON-26`）。
- 能力：解释硬件 Store Buffer / Invalidation Queue 乱序根因，准确运用 `seq_cst`、`acquire`/`release` 与 `relaxed`。
- 检验：画出 `happens-before` 传递证明，纠正 `volatile` 误用与 `memory_order` 误配。

<a id="con-29"></a>

#### CON-29 硬件内存层次：Store Buffer 与 Invalidation Queue

- 先修：[MACH-04](machine.md#mach-04)、[CON-03](#con-03)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：即便有 MESI 缓存一致性协议，CPU 为什么依然会出现反直觉的读写乱序？
- 小节
  1. 画出带 Store Buffer 和 Invalidation Queue 的多核 L1/MESI 硬件架构图
  2. 剖析 Store Buffer 造成的 Store-Load 重排（`r1 == 0 && r2 == 0` 现象）
  3. 对比强内存模型（x86 TSO）与弱内存模型（ARM64 / RISC-V）的屏障需求差异
- 能力：能从 CPU 微架构缓冲解释跨核可见性延迟与乱序本质。
- 练习与预期：画出 Core 0 执行 `x=1; r1=y` 与 Core 1 执行 `y=1; r2=x` 时 Store Buffer 如何导致双双读出 0 的时序步骤。
- 项目或独立实验：在多核主机上编写 Litmus 测试循环验证（无屏障 vs `seq_cst`）出现 `(0,0)` 的频次。

<a id="con-30"></a>

#### CON-30 编译器重排 vs CPU 重排：volatile 的误区

- 先修：[CON-29](#con-29)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：为什么把共享标志位写成 `volatile bool ready = false;` 依然会导致多线程崩溃或死循环？
- 小节
  1. 区分编译期指令重排/寄存器缓存优化与运行期 CPU 硬件乱序
  2. 明确 `volatile` 的真正用途（MMIO/信号处理）与它缺失的三大并发保障
  3. 对比 `volatile` 与 `std::atomic` 生成的汇编屏障差异
- 能力：能彻底杜绝用 `volatile` 做线程同步，并向他人解释清楚其三大缺陷（无原子性、无硬件屏障、仍是 Data Race UB）。
- 练习与预期：用 `g++ -O2 -S` 观察普通 `bool` 轮询、`volatile bool` 与 `std::atomic<bool>` 在汇编层面的寄存器缓存与屏障指令差异。
- 项目或独立实验：用 TSan 验证多线程共享写 `volatile int` 依然触发 Data Race 报错。

<a id="con-31"></a>

#### CON-31 std::atomic<T> 与无锁判定：is_always_lock_free

- 先修：[CON-30](#con-30)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：用了 `std::atomic<BigStruct>` 就一定不会加锁阻塞吗？
- 小节
  1. 理解 `std::atomic<T>` 对 `T` 必须 Trivially Copyable 的约束
  2. 用 `is_lock_free()` 与编译期 `static_assert(is_always_lock_free)` 检验真无锁
  3. 认识全平台标准保证无锁的 `std::atomic_flag`
- 能力：能验证自定义类型的原子操作是否真正由硬件无锁指令实现，避免隐式退化为互斥锁。
- 练习与预期：运行 `is_always_lock_free` 检查程序，对比 `int`、8 字节结构体与 24 字节结构体的返回值差异。
- 项目或独立实验：测试 `std::atomic_flag` 实现一个最小测试用自旋锁（Test-and-Set）。

<a id="con-32"></a>

#### CON-32 原子读改写：fetch_add、exchange 与 CAS (weak vs strong)

- 先修：[CON-31](#con-31)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：为什么 `x.store(x.load() + 1)` 还是会算少，以及 `compare_exchange_weak` 与 `strong` 该如何选？
- 小节
  1. 区分独立 `load`/`store` 与不可分割的 RMW（`fetch_add`、`exchange`）
  2. 掌握 CAS 失败时自动刷新 `expected` 变量的语义与循环重试写法
  3. 理解 LL/SC 架构上的虚假失败，确立“循环用 `weak`、单次用 `strong`”准则
- 能力：能编写无 BUG 的 CAS 循环（如原子最大值更新），避免 `expected` 未重置或多余读的错误。
- 练习与预期：4 线程并发调用 `atomic_update_max` 投递随机整数，汇合断言最终结果严格等于所有输入的最大值。
- 项目或独立实验：构造双线程 `std::barrier` 同步触发 `store(load() + 1)` 漏加一的确定性复现。

<a id="con-33"></a>

#### CON-33 C++ 内存序：顺序一致 (memory_order_seq_cst)

- 先修：[CON-32](#con-32)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：默认内存序 `seq_cst` 提供了什么全局一致性保证，为何它在写多读少时有额外代价？
- 小节
  1. 理解单条全局一致修改序（Total Modification Order）模型
  2. 解释为什么 Store-Load 测试必须依靠 `seq_cst` 排空 Store Buffer
  3. 认识 `seq_cst` 在 x86（`LOCK XCHG`/`mfence`）与 ARM 上的硬件屏障代价
- 能力：能判断何时必须保留 `seq_cst`（涉及多变量全序共识），何时可下调为 `acquire`/`release`。
- 练习与预期：分析 Dekker 算法中若把两个原子变量降级为 `acquire`/`release`，为何仍可能出现双方同时进入临界区。
- 项目或独立实验：对比 `seq_cst` 与 `relaxed` 在高频单变量自增微基准中的性能差距。

<a id="con-34"></a>

#### CON-34 获取-释放语义：Acquire-Release 与 happens-before 配对

- 先修：[CON-33](#con-33)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：用原子标志位发布一大包普通结构体数据时，为什么 `release` + `acquire` 能保证不读到半截旧值？
- 小节
  1. 推导 `sequenced-before`、`synchronizes-with` 与 `happens-before` 传递链
  2. 掌握 `release`（禁上溢出）与 `acquire`（禁下偷跑）单向栅栏规则
  3. 运用 `memory_order_acq_rel` 处理既读又写的 RMW（如引用计数减一）
- 能力：能绘制跨线程消息发布同步图，正确配置 `acquire`/`release`/`acq_rel` 消除普通共享数据竞争。
- 练习与预期：编写生产者填好结构体后 `release` 置标志、消费者 `acquire` 读到后断言字段完整，在 TSan 下零告警通过。
- 项目或独立实验：对照解释引用计数 `fetch_add` 可用 `relaxed` 而 `fetch_sub` 必须用 `acq_rel` 的原因。

<a id="con-35"></a>

#### CON-35 宽松序 (relaxed) 计数器与 memory_order_consume 现状

- 先修：[CON-34](#con-34)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：什么场景下使用 `memory_order_relaxed` 既绝对安全又性能最高，为何标准已不推荐使用 `consume`？
- 小节
  1. 界定 `relaxed` 的能力边界（仅保证单变量原子性与单变量修改序，不跨变量同步）
  2. 将 `relaxed` 安全用于独立监控指标累加与 `join()` 汇合读取
  3. 了解 `memory_order_consume` 依赖追踪难点与主流编译器退化为 `acquire` 的现状
- 能力：能严谨区分“独立指标累加”与“数据发布”，杜绝误用 `relaxed` 发布指针或状态标志。
- 练习与预期：解释为何用 `relaxed` 发布指向初始化完毕对象的指针在 ARM 上会崩溃。
- 项目或独立实验：用 `relaxed` 实现多线程字节吞吐计数器并在 `join()` 后与精确总和核对一致。

---

### 模块七 无锁数据结构、内存回收与 C++20 协程

- 入口：已理解 CAS 与 `acquire`/`release` 内存序（`CON-35`）。
- 能力：实现无锁栈入栈逻辑、分析 ABA 与三大内存回收方案，并掌握 C++20 无栈协程与结构化并发。
- 检验：跑通 Treiber 入栈、`atomic_ref` / `atomic::wait` 与 C++20 `Generator` 协程示例。

<a id="con-36"></a>

#### CON-36 无锁栈实战：Treiber Stack 与 CAS 循环

- 先修：[CON-32](#con-32)、[CON-34](#con-34)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：不用 `std::mutex`，如何让多个线程同时向同一个链表栈顶压入新节点？
- 小节
  1. 实现 Treiber Stack 的 `push` CAS 自旋入栈与内存序配置
  2. 区分 Wait-Free、Lock-Free 与 Obstruction-Free 三级进度保证
  3. 揭示并发 `pop` 在无 GC 的 C++ 中直接 `delete` 节点的致命危险
- 能力：能手写无锁 `push` 循环，并解释系统整体前进保证（Lock-Free）与单线程无饥饿（Wait-Free）的区别。
- 练习与预期：4 个线程各向 `TreiberStackPushOnly` 压入 10000 项，单线程 `drain_count()` 核对总节点数严格等于 40000。
- 项目或独立实验：在 TSan 下验证 `TreiberStackPushOnly` 并发 `push` 零数据竞争。

<a id="con-37"></a>

#### CON-37 ABA 问题与对策：Tagged Pointer、Hazard Pointers 与 RCU

- 先修：[CON-36](#con-36)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：为什么地址复用了两次，CAS 以为栈顶没变却把整个无锁链表搞坏了？
- 小节
  1. 逐帧重演无锁栈 `pop` 中的 ABA 漏洞与 Use-After-Free 崩溃
  2. 掌握带版本号指针（Tagged / Versioned Pointer）打破地址复用假象
  3. 理解 Hazard Pointers（风险指针）与 RCU（读-拷贝-更新）宽限期回收直觉
- 能力：能清晰演示 ABA 发生时序，并说明 Tagged Pointer、Hazard Pointers 与 RCU 各自的适用权衡。
- 练习与预期：画出 3 节点链表中线程 1 暂停在 CAS 前、线程 2 弹出两个节点又复用地址 A 压回导致破坏链表的完整过程。
- 项目或独立实验：用单调递增 64 位版本号实现一个简单的 TaggedIndex 结构练习 CAS 更新。

<a id="con-38"></a>

#### CON-38 内存回收策略与 C++20 atomic_ref / atomic::wait

- 先修：[CON-37](#con-37)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：不想把普通数组改成 `std::atomic` 数组，或者想不用条件变量直接睡在原子值上怎么办？
- 小节
  1. 比较 Epoch-Based Reclamation (EBR) 与 Hazard Pointers 的吞吐/延迟权衡
  2. 使用 C++20 `std::atomic_ref<T>` 在局部并发阶段临时原子化普通对象（及对齐契约）
  3. 使用 C++20 `atomic::wait()` / `notify_one()` 取代自旋忙等
- 能力：能安全使用 `std::atomic_ref` 和 `atomic::wait`，严格遵守禁止混用非原子访问的生命周期规则。
- 练习与预期：两线程用 `std::atomic_ref<int>` 并发累加同一普通 `vector<int>` 槽位各 10000 次，join 后验证结果等于 20000；另用 `ready.wait(false)` 验证零忙等唤醒。
- 项目或独立实验：核对平台 `std::atomic_ref<double>::required_alignment` 对齐要求。

<a id="con-39"></a>

#### CON-39 C++20 协程与异步运行时 / 结构化并发模式

- 先修：[CON-23](#con-23)、[NET-08](network.md#net-08)
- 层级：进阶专题（进阶）
- 状态：已有[硬件内存模型、原子操作、无锁数据结构与 C++20 协程正文](../../src/content/handbook/con-atomics-lockfree.md)。
- 问题：C++20 无栈协程怎么实现“函数运行一半暂停让出线程，I/O 好了再从断点接着跑”？
- 小节
  1. 理解无栈协程状态机与 `co_yield`、`co_await`、`co_return` 关键字语义
  2. 逐行剖解 `promise_type`、`coroutine_handle<>` 与实现可运行 `Generator<T>`
  3. 掌握 Reactor 异步运行时调度及结构化并发（父作用域管子任务寿命）原则
- 能力：能写出最小可运行的 C++20 `Generator` 协程，并解释 `await_ready/suspend/resume` 与结构化并发如何避免孤儿任务。
- 练习与预期：运行 `fibonacci(6)` 协程生成器，预期依次吐出 `0 1 1 2 3 5` 后 cleanly `destroy()` 帧不泄漏。
- 项目或独立实验：为 `Generator` 统计构造与销毁次数，确认无内存泄漏。

---

## 第五篇 并发性能工程与端到端调优实战

### 模块八 科学基准测试与微观架构调优

- 入口：已能写出正确的并发程序并理解硬件缓存模型（`CON-29`、`CON-35`）。
- 能力：建立防 DCE 与尾延迟压测基线，消除伪共享、冷热混杂、分支误判与堆锁竞争。
- 检验：提交伪共享前后耗时对比、SoA vs AoS 扫描对比与无分支基准数据。

<a id="con-40"></a>

#### CON-40 性能测量方法论：预热、方差、尾延迟与防 DCE

- 先修：[CON-28](#con-28)、[ENG-04](engineering.md#eng-04)
- 层级：核心应用（主线）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：为什么在 Debug 模式测或者只看平均延迟，会做出完全错误的架构决策？
- 小节
  1. 规范 `-O2` 编译、Warmup 预热与多轮样本中位数/方差报告
  2. 识别并防止编译器死代码消除（DCE）与压测协调遗漏（Coordinated Omission）
  3. 用最近秩法统计 P50 / P95 / P99 尾延迟
- 能力：能设计可重复、抗噪音的并发性能基准，报告完整的吞吐离散度与尾延迟分位数。
- 练习与预期：对 `1..100 ms` 样本计算最近秩百分位，验证 `p50=50`、`p95=95`、`p99=99`；另验证有/无校验和输出下 `-O2` 耗时差异（抓出 DCE）。
- 项目或独立实验：为自己的微基准加入至少 5 轮独立测试与中位数/最大值输出。

<a id="con-41"></a>

#### CON-41 steady_clock 微基准与 Google Benchmark 模式

- 先修：[CON-40](#con-40)、[CPP-14](cpp.md#cpp-14)
- 层级：核心应用（主线）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：怎样在纳秒级函数测准耗时而不受系统时钟回拨或编译器优化干扰？
- 小节
  1. 严格区分单调时钟 `steady_clock` 与可跳变挂钟 `system_clock`
  2. 手写 `do_not_optimize` 与 `clobber_memory` 栅栏夹具
  3. 理解 Google Benchmark 自动倍增迭代次数摊薄计时器分辨率的设计
- 能力：能编写防编译器优化欺骗的 C++20 `steady_clock` 微基准夹具。
- 练习与预期：运行 `bench_ns("std::accumulate(1024)", ...)`，确认关闭 `do_not_optimize` 与开启时生成的汇编和耗时差异。
- 项目或独立实验：将待测容器初始化挪出计时循环外，单独测量查询路径的纳秒延迟。

<a id="con-42"></a>

#### CON-42 缓存行伪共享 (False Sharing) 实验与消除实证

- 先修：[CON-41](#con-41)、[MACH-07](machine.md#mach-07)
- 层级：核心应用（主线）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：线程之间明明各写各的数组元素、没有任何共享逻辑，为什么 4 线程反而慢了 5 倍？
- 小节
  1. 剖析 64 字节 CPU 缓存行与 MESI 乒乓失效机制
  2. 使用 `alignas(64)` / `std::hardware_destructive_interference_size` 对齐隔离
  3. 实测“紧挨数组” vs “缓存行填充” vs “栈局部累加”的性能鸿沟
- 能力：能在结构体与数组设计中一眼识破伪共享隐患，并用局部累加或缓存行对齐消除它。
- 练习与预期：在 `-O2` 下跑通 4 线程 2000 万次对比实验，记录并验证 `Padded` 版本大幅快于 `Unpadded` 版本，局部累加版更快。
- 项目或独立实验：检查多线程统计结构 `WorkerStat` 大小并补齐缓存行对齐。

<a id="con-43"></a>

#### CON-43 面向数据设计：SoA vs AoS 与冷热分离

- 先修：[CON-42](#con-42)、[MACH-05](machine.md#mach-05)
- 层级：进阶专题（进阶）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：只统计日志里的级别和字节数，为什么要把长字符串 `message` 从主结构体里拆出去？
- 小节
  1. 对比 AoS（结构体数组）与 SoA（数组结构体）的缓存行有效载荷利用率
  2. 实施热字段（级别、时间戳、大小）与冷字段（原文文本、详情）分离
  3. 理解紧凑数组布局如何顺带激活编译器自动 SIMD 向量化
- 能力：能用冷热分离和 SoA 改造高频扫描数据布局，显著降低 L1/L2 Cache Miss。
- 练习与预期：构造 100 万条含 128 字节冗余消息的记录，对比 AoS 扫描与分离热字段数组扫描的耗时差距。
- 项目或独立实验：用 `perf stat -e cache-misses` 验证 SoA 布局的缓存失效率下降。

<a id="con-44"></a>

#### CON-44 分支预测失败与无分支编程 (Branchless)

- 先修：[CON-43](#con-43)
- 层级：进阶专题（进阶）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：为什么同样一段 `if (x >= 128)` 循环，输入有序时飞快、随机打乱后却慢了好几倍？
- 小节
  1. 理解深流水线 CPU 分支预测器与预测失败清空流水线的 15+ 周期惩罚
  2. 用位掩码/算术与 `CMOV` 实现无分支累加并释放 SIMD 潜力
  3. 明确无分支编程的适用边界（随机分布受益，高度可预测分支切勿滥用）
- 能力：能通过数据特性判断分支预测瓶颈，并用 `perf stat -e branch-misses` 验证无分支改造效果。
- 练习与预期：运行 200 万随机整数过滤求和对比实验，验证无分支算术版明显快于 `if` 版本且两者结果完全一致。
- 项目或独立实验：把同一个程序输入先 `std::sort` 后再跑有分支版本，对比有序与无序的耗时差异。

<a id="con-45"></a>

#### CON-45 减少 malloc 锁竞争：Arena、Slab 与对象池

- 先修：[CON-41](#con-41)、[CON-18](#con-18)
- 层级：进阶专题（进阶）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：多线程里每处理一条日志就 `std::string` / `new` 一次，为什么 CPU 全卡在系统堆分配里？
- 小节
  1. 剖析通用堆分配器在多线程高并发小对象分配下的竞争与碎片开销
  2. 掌握 Arena（线性 Bump 分配、整批 $O(1)$ 释放）与固定大小 Slab 对象池
  3. 实战标准库 C++17/20 `std::pmr::monotonic_buffer_resource` 零堆分配批处理
- 能力：能为每线程或单次请求构造栈上/池化 Arena 分配器，消除高频 `malloc`/`free` 热路径。
- 练习与预期：用 `std::pmr::monotonic_buffer_resource` 配 64KB 栈缓冲区完成 500 条 `pmr::string` 解析且全程零全局 `malloc`。
- 项目或独立实验：对比多线程每轮 `new/delete` 节点与线程局部自由链表（Slab Pool）的吞吐差。

<a id="con-46"></a>

#### CON-46 现代多线程分配器：jemalloc、tcmalloc 与 mimalloc

- 先修：[CON-45](#con-45)
- 层级：进阶专题（进阶）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：在不重构现有第三方库内存代码的前提下，如何靠替换分配器直接降低多线程堆锁竞争？
- 小节
  1. 理解 Thread-Local Cache (tcache) → 分级 Size Classes → 中央 Arena 分层架构
  2. 对比 glibc `ptmalloc2` 与 `jemalloc` / `tcmalloc` / `mimalloc` 对跨线程释放的处理
  3. 掌握 Linux `LD_PRELOAD` 与 CMake 链接替换分配器并核对前后指标
- 能力：能解释现代多线程分配器线程缓存原理，并通过链接或预加载验证跨线程分配收益。
- 练习与预期：在 Linux 下编写多线程交叉生产-消费 `std::string` 压测，对比默认 glibc malloc 与 `LD_PRELOAD=libmimalloc.so`（或 jemalloc）耗时与 RSS。
- 项目或独立实验：观察并记录 `MALLOC_ARENA_MAX` 对多核 glibc 程序虚拟内存占用（VIRT）的影响。

---

### 模块九 剖析、排错工具与端到端实战

- 入口：已掌握并发微基准测试与常见微架构瓶颈（`CON-46`）。
- 能力：熟练驾驭 `perf`、火焰图、Off-CPU 定位与 ThreadSanitizer，并完成 LogScan 端到端系统级提速。
- 检验：提交 TSan 零竞争报告、`perf` 剖析证据与 LogScan 四轮单变量优化前后吞吐与 P99 对照表。

<a id="con-47"></a>

#### CON-47 CPU 热点剖析 (perf、火焰图) 与 Off-CPU 分析

- 先修：[CON-40](#con-40)、[OS-04](os.md#os-04)
- 层级：核心应用（主线）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：为什么有时候 `perf` 火焰图抓不到热点，程序却跑了很久（线程其实在睡觉）？
- 小节
  1. 用 `perf stat` 体检 IPC、Cache Miss 与每秒上下文切换次数
  2. 用 `perf record -F 99 -g` 与 `perf report`/FlameGraph 定位 On-CPU 平顶山热点
  3. 识破 Off-CPU 盲区，用 `gdb thread apply all bt`、分阶段计时或 eBPF `offcputime` 抓锁与 I/O 等待
- 能力：能严格区分 On-CPU 计算热点与 Off-CPU 阻塞等待，并用真实工具证据定位第一瓶颈。
- 练习与预期：用 `perf stat` 与 `perf record -g` 剖析一个含故意 CPU 忙算与锁等待的双阶段程序，准确指出热点函数与高 `context-switches` 阶段（WSL2 若 PMU 受限则用分阶段计时 + gdb 堆栈补证）。
- 项目或独立实验：为你构建的线程池压测生成一份 `perf report --stdio` 摘要或阶段耗时拆解表。

<a id="con-48"></a>

#### CON-48 数据竞争猎手：ThreadSanitizer 与 Helgrind/DRD

- 先修：[CON-09](#con-09)、[ENG-08](engineering.md#eng-08)
- 层级：核心应用（主线）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：为什么“跑了 100 次结果都对”的多线程代码，上线后还是会突然数据错乱？
- 小节
  1. 理解 TSan 影子内存与向量时钟原理及 `-fsanitize=thread -g -O1` 编译用法
  2. 读懂 TSan 竞争报告的两侧写/读调用栈并精准修复
  3. 对比 TSan 与 Valgrind Helgrind/DRD 的开销及适用范围
- 能力：能在日常开发和 CI 中启用 ThreadSanitizer 捕获潜在 Data Race 与锁顺序错误。
- 练习与预期：故意编写一个极隐蔽的竞态程序并用 `-fsanitize=thread` 抓出 `WARNING: ThreadSanitizer: data race`，修复后再验证退出码 0 且无告警。
- 项目或独立实验：将 `-fsanitize=thread` 接入 CMake 测试 Preset，作为并发组件必过门禁。

<a id="con-49"></a>

#### CON-49 锁竞争剖析与无锁方案的真实权衡

- 先修：[CON-36](#con-36)、[CON-47](#con-47)
- 层级：进阶专题（进阶）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)。
- 问题：什么时候应该咬牙上无锁结构，什么时候老老实实用“批量 + 分片锁”反而吊打无锁？
- 小节
  1. 剖析高核数下的 CAS 重试风暴与总线缓存行饱和
  2. 理解无竞争时 `std::mutex` 用户态快路径与高竞争时的自适应休眠优势
  3. 建立四层并发架构选型天梯（Shared-Nothing > Batching+分段锁 > SPSC > MPMC 无锁）
- 能力：能通过对比压测判断锁竞争是否真的成为瓶颈，避免“为无锁而无锁”的负优化。
- 练习与预期：基准对比“每条加锁”、“128 条一批加锁”与“多写者 CAS 栈”在 8 线程下的吞吐，验证批量加锁往往以极低复杂度胜出。
- 项目或独立实验：根据选型天梯重构一处高竞争共享计数器为局部归并或分片结构。

<a id="con-50"></a>

#### CON-50 端到端实战案例：LogScan 并发吞吐全面优化

- 先修：[CON-28](#con-28)、[CON-45](#con-45)、[CON-47](#con-47)、[CON-48](#con-48)
- 层级：核心应用（综合实战）
- 状态：已有[并发性能工程、微基准测试与端到端调优实战正文](../../src/content/handbook/con-perf-tuning.md)与 [LogScan v3 实验](../../src/content/labs/logscan-service.md)。
- 问题：面对一条看似已经用上线程池和队列的日志分析流水线，如何做四轮单变量系统优化把吞吐推向硬件极限？
- 小节
  1. 剖析初版多线程流水线的四大热点（单条锁频、每行 malloc、全局 map 锁、regex 开销）
  2. 执行四轮单变量迭代：128 行批量入队 → 整块零拷贝 `string_view` → 轻量前缀扫描与冷热对齐 → 线程局部统计归并
  3. 执行端到端三项验收：与串行输出字节一致、TSan 零竞争、5 轮稳态吞吐与 P99 回归报告
- 能力：能独立主导一个完整并发系统的性能剖析、假设提出、单变量实验与正确性/安全回归验收。
- 练习与预期：在固定大日志样本上逐步实施至少 2 项优化（如批量入队 + 线程局部归并），记录每轮吞吐（MB/s）、P99 批处理延迟与与单线程参照完全一致的统计结果。
- 项目或独立实验：将优化后的有界批量队列、背压策略与 TSan/基准证据整合进 [LogScan v3](../../src/content/labs/logscan-service.md) 交付报告。

---

### 模块十 《C++ Concurrency in Action》全书并发容器、内存序与工作窃取线程池精讲

- 入口：已掌握互斥锁、条件变量、原子内存序与线程池基础（`CON-50`）。
- 能力：融会贯通 Anthony Williams《C++ 并发编程实战（第 2 版）》全书 10 章标志性工程构件：从 `scoped_thread`、`parallel_accumulate`、`threadsafe_stack`、`hierarchical_mutex`、函数式并发快排、释放序列，到虚拟尾节点双锁队列、分桶并发哈希表、无锁栈三大内存回收（待删计数 / Hazard Pointers / 分离引用计数）与工业级工作窃取（Work-Stealing）线程池。
- 检验：独立编译并跑通全书核心组件一站式验证套件（`CON-51`–`CON-58`）。

<a id="con-51"></a>

#### CON-51 Ch1~Ch2 线程管控工程模式：scoped_thread、所有权转移与 hardware_concurrency 并行 accumulate

- 先修：[CON-05](#con-05)、[CON-08](#con-08)
- 层级：核心应用（主线）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：为什么仅保存引用的 `thread_guard` 不如直接移动接管所有权的 `scoped_thread` 安全，以及如何根据元素规模和 `hardware_concurrency()` 动态计算最优线程数？
- 小节
  1. 对比 `thread_guard` 与直接按值移动接管 `std::thread` 的 `scoped_thread`
  2. 处理 `std::thread::hardware_concurrency()` 返回 0 兜底与最小分块阈值 `min_per_thread`
  3. 完整实现主线程参与最后分块计算且异常安全的 `parallel_accumulate`
- 能力：能使用 `scoped_thread` 杜绝外部句柄干扰，并编写自适应硬件核数的分块并行归约算法。
- 练习与预期：运行 `parallel_accumulate` 对 `1..10000` 求和，核对输出恒为 `50005000`。
- 项目或独立实验：测试当输入长度为 0、小于 `min_per_thread` 及 100 万元素时 `parallel_accumulate` 实际启动的线程数量。

<a id="con-52"></a>

#### CON-52 Ch3 共享数据保护进阶：消除接口固有竞态的 threadsafe_stack、层级锁 hierarchical_mutex 与延迟初始化

- 先修：[CON-12](#con-12)、[CON-18](#con-18)
- 层级：核心应用（主线）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：为什么每个方法内部都加了锁的 `empty()` + `top()` + `pop()` 依然会丢数据，以及如何在运行期自动拦截锁顺序反转死锁？
- 小节
  1. 剖析 `top()` 与 `pop()` 分离引起的接口固有竞态与 Tom Cargill 异常安全难题
  2. 实现合并 `pop(T&)` 与 `shared_ptr<T> pop()` 的 `threadsafe_stack<T>`
  3. 用 `thread_local` 层级值完整实现遵循 Lockable 概念的 `hierarchical_mutex`
- 能力：能设计无接口竞态的并发栈，并用 `hierarchical_mutex` 在测试期捕获潜在死锁。
- 练习与预期：验证 `hierarchical_mutex` 按 `10000 -> 5000` 加锁通过、按 `5000 -> 10000` 逆序加锁立即抛出 `std::logic_error`。
- 项目或独立实验：结合 `std::shared_mutex` 实现原书的 `dns_cache` 并对比读写并发吞吐。

<a id="con-53"></a>

#### CON-53 Ch4 同步并发与异步任务传递：future / packaged_task / promise / shared_future 与函数式并发快速排序

- 先修：[CON-22](#con-22)、[CON-23](#con-23)
- 层级：核心应用（主线）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：如何在零共享可变状态、零显式互斥锁的前提下，用函数式风格和 `std::async` 实现多核快速排序？
- 小节
  1. 全面对比 `async`、`packaged_task`、`promise` 与每线程持独立副本的 `shared_future`
  2. 掌握 `std::list::splice` 常数时间切分与 `std::partition` 原地划分
  3. 完整实现零锁函数式并发快速排序 `parallel_quick_sort`
- 能力：能在 GUI 投递、Reactor 回调与多读广播中精准选型 Future 家族构件，并运用函数式不可变思想消除锁竞争。
- 练习与预期：使用 `parallel_quick_sort` 对乱序 `std::list<int>` 排序并断言 `std::is_sorted` 成立。
- 项目或独立实验：为 `parallel_quick_sort` 添加递归深度或链表长度阈值，对比纯串行 `std::list::sort` 的耗时拐点。

<a id="con-54"></a>

#### CON-54 Ch5 C++ 内存模型与原子操作深潜：Modification Order、6 种 memory_order 与释放序列

- 先修：[CON-33](#con-33)、[CON-34](#con-34)、[CON-35](#con-35)
- 层级：进阶专题（进阶）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：当多个消费者对同一个原子计数器连续执行 `fetch_sub` 时，后来的消费者为何仍能与最初生产者的 `store(release)` 构成同步关系？
- 小节
  1. 形式化定义 Modification Order、Sequenced-Before、Synchronizes-With 与 Happens-Before
  2. 对比 `seq_cst`、`acquire`/`release`/`acq_rel` 与 `relaxed` 的重排边界
  3. 推导释放序列（Release Sequence）、`std::atomic_thread_fence` 与 `atomic_flag` 自旋锁
- 能力：能利用释放序列证明一写多读原子队列的跨线程内存可见性，并手写标准 `spinlock_mutex`。
- 练习与预期：运行 `populate_queue` 与双消费者 `fetch_sub(1, memory_order_acquire)` 示例，核对所有元素总和无遗漏且 TSan 零告警。
- 项目或独立实验：将原书清单 5.5 的 `relaxed` 读写替换为 `atomic_thread_fence(release/acquire)`，验证断言恒成立。

<a id="con-55"></a>

#### CON-55 Ch6 基于锁的高并发数据结构设计：虚拟头节点双锁并发队列与分桶并发哈希表

- 先修：[CON-18](#con-18)、[CON-27](#con-27)
- 层级：进阶专题（进阶）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：如何让队列的 `push()` 和 `pop()` 各自持独立互斥锁真正同时并行，以及如何无死锁地导出分桶并发哈希表的全量快照？
- 小节
  1. 引入预分配虚拟尾节点（Dummy Node）彻底解耦 `head_mutex` 与 `tail_mutex`
  2. 将 `make_shared<T>` 与新节点堆分配移出 `tail_mutex` 临界区实现极速 `push`
  3. 实现质数分桶 `shared_mutex` 并发查找表 `threadsafe_lookup_table` 及固定锁序 `get_map()`
- 能力：能手写细粒度双锁并发队列与分桶读写锁哈希表，将临界区压缩至寥寥数条指针赋值。
- 练习与预期：多线程并发向 `threadsafe_lookup_table` 写入 100 个键值并调用 `get_map()` 导出快照，断言元素个数与键值 100% 匹配。
- 项目或独立实验：对比单锁队列与虚拟尾节点双锁队列在双线程一生产一消费下的吞吐差距。

<a id="con-56"></a>

#### CON-56 Ch7 无锁并发数据结构与三大内存回收难题：待删计数、风险指针（Hazard Pointers）与分离引用计数

- 先修：[CON-36](#con-36)、[CON-37](#con-37)
- 层级：进阶专题（进阶）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：在无 GC 的 C++ 中，无锁栈 `pop()` 摘下头节点后如何在绝不触发 Use-After-Free 的前提下安全 `delete` 内存？
- 小节
  1. 实现基于 `threads_in_pop` 原子计数与 `to_be_deleted` 待删链表的延迟回收
  2. 掌握 Maged Michael 风险指针（Hazard Pointers）的登记、二次重读校验与扫描回收协议
  3. 剖析内外分离双引用计数（`external_count` + `internal_count`）如何消解读指针与增计数的竞态
- 能力：能完整实现带内存回收的无锁 Treiber 栈，并评估三种回收方案在高负载下的内存上限与硬件依赖。
- 练习与预期：4 线程并发对带 `try_reclaim` 的 `lock_free_stack` 压入并弹出 10000 个节点，使用 ASan/TSan 验证零内存泄漏且零 Use-After-Free。
- 项目或独立实验：测试 `std::atomic<counted_node_ptr>::is_always_lock_free` 在当前平台上的返回值。

<a id="con-57"></a>

#### CON-57 Ch8 并发算法与代码设计准则：异常安全、伪共享消除与 parallel_for_each / parallel_find

- 先修：[CON-42](#con-42)、[CON-51](#con-51)
- 层级：核心应用（主线）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：如何在并行搜索算法中让任一线程找到目标的瞬间通知其余所有线程立即短路退出，且保证异常安全？
- 小节
  1. 识别高竞争原子带来的乒乓缓存（Cache Ping-Pong）与缓存行伪共享
  2. 用 `join_threads` 守卫与 `std::async` 实现递归分治 `parallel_for_each`
  3. 用 `std::atomic<bool> done_flag`、`exchange(true)` 与 `std::promise` 实现短路退出的 `parallel_find`
- 能力：能编写支持异常跨线程传播和原子短路退出的并行算法。
- 练习与预期：在 100 万元素的数组中用 `parallel_find` 搜索目标值与不存在值，核对返回迭代器与 `std::find` 完全一致。
- 项目或独立实验：在 `parallel_find` 的元素比较中故意抛出自定义异常，验证主线程 `get_future().get()` 能安全捕获且无未 join 线程崩溃。

<a id="con-58"></a>

#### CON-58 Ch9~Ch10 高级线程管理：可等待任务、线程本地队列与工作窃取（Work-Stealing）线程池完整实现

- 先修：[CON-24](#con-24)、[CON-25](#con-25)、[CON-55](#con-55)
- 层级：进阶专题（综合实战）
- 状态：已有[《C++ Concurrency in Action (2e)》全书精讲正文](../../src/content/handbook/con-ccia-mastery.md)。
- 问题：如何突破 `std::function` 无法包装 `packaged_task` 的限制，并构建支持 `run_pending_task()` 防死锁帮工与双端队列工作窃取（Work-Stealing）的工业级线程池？
- 小节
  1. 手写类型擦除 `function_wrapper` 支持只可移动（Move-Only）的 `std::packaged_task`
  2. 实现 `work_stealing_queue`（本线程队头 LIFO `push`/`try_pop` 保热缓存，空闲线程队尾 FIFO `try_steal` 偷大任务）
  3. 组合本地双端队列、全局队列与 `run_pending_task()` 主动帮工机制，驱动无死锁分治并发快排
- 能力：能从零独立构建支持返回值、防嵌套等待死锁且具备 Work-Stealing 负载均衡的工业级线程池。
- 练习与预期：编译并运行 `ccia_mastery_all_in_one.cpp` 综合验证程序，核对 `hierarchical_mutex`、`threadsafe_stack`、`threadsafe_lookup_table` 与工作窃取并发快排全部 `[PASS]`。
- 项目或独立实验：统计工作窃取线程池在执行 10 万元素并发快排期间，本地队列 `try_pop` 与跨线程 `try_steal` 各自的触发次数占比。

