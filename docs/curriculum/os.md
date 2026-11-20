# 操作系统 (OS)

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

以 C++20 与 Linux/POSIX 小程序验证操作系统模型，共 **50 讲（`OS-01` 至 `OS-50`）**，系统贯通特权边界、进程线程与 CPU 调度、并发同步与死锁、虚拟内存与写时复制、I/O 持久化文件系统及 Linux 容器底层机制。Linux 命令和接口实操可跨读 [Linux 课程](linux.md)。

## 第一篇 操作系统全景与特权边界

### 内核角色、启动与系统调用

- 入口：能构建基础 C++20 程序并在终端运行。
- 能力：理解 OS 两大抽象角色、开机引导链路、Ring 0/Ring 3 权限边界、`syscall` 机制与模式切换耗时。
- 检验：实测普通函数、`vDSO` 与真实 `syscall` 延迟差异，并用 `time` 区分 `real`/`user`/`sys`。

<a id="os-01"></a>

#### OS-01 什么是操作系统：资源管理器与抽象机器

- 先修：[CPP-02](cpp.md#cpp-02)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)（含[破冰示例](../../public/examples/os-zero.cpp)）。
- 问题：操作系统如何同时扮演硬件资源大管家与软件抽象机器？
- 小节
  1. 硬件资源分时复用与空间隔离
  2. 统一系统调用抽象机器
  3. 虚拟化、并发与持久化三大支柱
- 能力：能区分程序、进程与线程，并用 `os-zero.cpp` 验证虚拟地址与文件系统查询。
- 练习与预期：在练习目录编译运行 `os-zero.cpp`，核对相邻局部变量虚拟地址差 4 字节且目录存在性查询退出 0。

<a id="os-02"></a>

#### OS-02 系统启动全景：BIOS/UEFI 到用户态 Init

- 先修：[OS-01](#os-01)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：通电瞬间内存空白，是谁把操作系统内核装进内存并启动第一个用户进程的？
- 小节
  1. Reset Vector 与 BIOS/UEFI 加电自检
  2. Bootloader 加载内核与 initramfs
  3. start_kernel 初始化与 PID 1 接管
- 能力：能理清 `MBR/EFI -> GRUB -> vmlinuz/initramfs -> systemd` 的启动链条与 `initramfs` 的必要性。
- 练习与预期：在 Linux/WSL2 读取 `/proc/cmdline`、`/proc/1/comm` 与 `/proc/uptime`，记录引导参数与 1 号进程名。

<a id="os-03"></a>

#### OS-03 CPU 特权级环：Ring 3 用户态与 Ring 0 内核态

- 先修：[OS-01](#os-01)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：为什么普通程序不能直接读写硬盘或任意物理内存，必须靠 CPU 硬件隔离？
- 小节
  1. Ring 3 与 Ring 0 硬件权限边界
  2. 特权指令拦截与 MMU U/S 检查
  3. 越权访问的 SIGSEGV 与 EACCES 反馈
- 能力：能解释为何特权隔离必须由 CPU 硬件（CPL）强制执行而非仅靠编译器检查。
- 练习与预期：解释解引用 `nullptr` 触发 `SIGSEGV` 与普通用户打开受限设备返回 `EACCES` 的硬件与内核路径。

<a id="os-04"></a>

#### OS-04 系统调用机制：syscall 陷阱与库封装

- 先修：[OS-03](#os-03)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：调用 `printf` 和直接执行 `syscall` 陷入内核有何区别？`errno` 为何必须立刻保存？
- 小节
  1. glibc 用户态缓冲封装 vs 原始系统调用
  2. RAX 系统调用号、syscall 指令与 sysretq 返回
  3. 负错误码映射 errno 与常见错误码速查
- 能力：能区分库函数与系统调用，并在系统调用失败后第一时间保存 `errno`。
- 练习与预期：运行 `syscall_vs_libc.cpp`，用 `strace` 对照 `SYS_write` 与 `openat` 返回 `-1` 时的 `ENOENT`。

<a id="os-05"></a>

#### OS-05 内核架构流派：宏内核、微内核与混合内核

- 先修：[OS-04](#os-04)
- 层级：进阶专题（方向进阶）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：为什么 Linux 把驱动和文件系统全塞进内核态，而微内核却坚持把它们留在用户态？
- 小节
  1. 宏内核（Linux）函数直调高吞吐模型
  2. 微内核（seL4/QNX）IPC 隔离与崩溃容错
  3. 混合内核（NT/XNU）与 eBPF/FUSE 演进
- 能力：能权衡内核空间调用性能与驱动故障爆炸半径之间的架构取舍。
- 练习与预期：对比宏内核一次 `read` 与微内核跨服务 IPC 读文件的模式切换次数差异。

<a id="os-06"></a>

#### OS-06 模式切换与上下文切换开销（含 vDSO）

- 先修：[OS-04](#os-04)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：为什么一次 `getpid()` 系统调用比普通函数调用慢几十上百倍？`clock_gettime` 为何能绕开内核？
- 小节
  1. 普通调用 vs 模式切换 vs 上下文切换
  2. 内核栈切换与安全缓解（KPTI/IBPB）开销
  3. vDSO 用户态共享只读时间页优化
- 能力：能定量区分三种切换量级，并用批量化思维减少无谓系统调用。
- 练习与预期：运行 `syscall_bench.cpp` 百万次循环，对比 `user_add`、`steady_clock`（vDSO）与 `SYS_getpid` 纳秒级延迟。

<a id="os-07"></a>

#### OS-07 中断、陷阱与异常对照表

- 先修：[OS-03](#os-03)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：硬件中断、系统调用陷阱和缺页故障处理完后，各自回到哪一条指令继续运行？
- 小节
  1. 异步硬件中断（IRQ）与中断描述符表 IDT
  2. 同步主动陷阱（syscall / 调试断点 int 3）
  3. 可恢复故障（Page Fault 重试指令）与不可恢复中止
- 能力：能依据同步性与返回指令地址精准分类各类 CPU 控制流转移事件。
- 练习与预期：对照三类事件表，说明为何缺页故障修复后必须重跑同一条访存指令。

<a id="os-08"></a>

#### OS-08 内核时间实验：用 time 测量 user 与 sys

- 先修：[OS-06](#os-06)
- 层级：入门（核心基础）
- 状态：已有[操作系统全景与特权边界正文](../../src/content/handbook/os-zero-start.md)。
- 问题：如何从终端的 `real`、`user`、`sys` 三列数据一眼诊断程序是在算、在跑系统调用还是在睡觉？
- 小节
  1. 墙钟时间 real 与 CPU 核时 user/sys 的含义
  2. 密算型、高频 syscall 型与阻塞睡眠型对照
  3. 多核并行下 user 大于 real 的现象解释
- 能力：能使用 `time` 命令定位程序瓶颈属于用户态计算、内核态切换还是阻塞等待。
- 练习与预期：用 `/usr/bin/time -p` 分别运行 `time_lab` 的 `cpu`/`sys`/`sleep` 三模式并核对三列比值。

## 第二篇 执行实体、上下文切换与 CPU 调度

### 进程、线程与上下文切换

- 入口：已掌握用户态/内核态边界与系统调用机制。
- 能力：追踪进程生命周期、`fork`/`execve`/`waitpid`、线程模型与协程差异及上下文切换现场。
- 检验：跑通命令启动器回收子进程，观察 `std::thread` TLS 与 `C++20` 协程状态机。

<a id="os-09"></a>

#### OS-09 进程抽象：PCB / task_struct 与内存分段

- 先修：[OS-01](#os-01)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：内核用什么数据结构记住一个活着的进程？进程虚拟内存里有哪些固定分段？
- 小节
  1. PCB / Linux task_struct 核心字段
  2. Text / Data / BSS / Heap / mmap / Stack 分段布局
  3. 从 /proc/self/status 与 /proc/self/maps 观测进程档案
- 能力：能画出 `task_struct` 核心指针关系及标准进程地址空间布局。
- 练习与预期：运行 `inspect_pcb.cpp`，对照 `/proc/self/maps` 标出代码段、堆与栈区间。

<a id="os-10"></a>

#### OS-10 进程状态转换与僵尸/孤儿回收

- 先修：[OS-09](#os-09)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：为什么处于 `D` 状态的进程连 `kill -9` 都杀不死？僵尸进程到底占用了什么资源？
- 小节
  1. 六态生命周期：New/Ready/Running/Blocked/Zombie/Terminated
  2. Linux TASK_RUNNING / S / D / T / Z 状态映射
  3. 僵尸进程危害与 PID 1 收养孤儿进程
- 能力：能读懂 `ps` 状态码并解释为何父进程必须及时回收已退出子进程。
- 练习与预期：分析子进程先退出而父进程休眠时 `Z` 状态的成因，并核对父进程先退时 `PPID` 变为 `1` 的现象。

<a id="os-11"></a>

#### OS-11 fork() 写时复制与 execve() 映像替换

- 先修：[OS-10](#os-10)
- 层级：核心应用（项目主线）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：为什么 Linux 启动新程序要刻意拆成 `fork` 和 `execve` 两步？`fork` 为何返回两次？
- 小节
  1. fork 返回父子双分支与写时复制页表共享
  2. execve 彻底替换映像却保留 PID 与未设 CLOEXEC 的 fd
  3. waitpid 宏解码与失败路径 _exit(127) 防双倍缓冲刷出
- 能力：能编写安全的 POSIX `fork` + `execve` + `waitpid` 启动器并正确解码退出码。
- 练习与预期：运行 `fork_exec_demo.cpp`，子进程执行 `exit 7`，父进程断言 `WIFEXITED` 为真且 `WEXITSTATUS` 等于 `7`。

<a id="os-12"></a>

#### OS-12 线程模型全景：1:1 / N:1 / M:N 与 C++20 协程

- 先修：[OS-09](#os-09)、[CPP-09](cpp.md#cpp-09)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：同进程多线程共享什么、私有什么？内核线程与用户态纤程、C++20 无栈协程有何本质差异？
- 小节
  1. 共享地址空间与 fd 表 vs 私有栈/寄存器/TLS
  2. 1:1（Linux NPTL）、N:1 与 M:N（Go Goroutine）调度模型
  3. 有栈纤程 vs C++20 无栈协程状态机帧
- 能力：能解释线程安全共享边界，并分辨内核线程切换与用户态协程挂起的代价差异。
- 练习与预期：运行 `thread_vs_coro.cpp`，核对两个线程各自的 `thread_local` 独立为 1 而共享原子变量为 2，同时单线程内完成协程产出。

<a id="os-13"></a>

#### OS-13 上下文切换解剖：保存寄存器、内核栈与 CR3

- 先修：[OS-06](#os-06)、[OS-12](#os-12)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：一次上下文切换究竟保存了哪些硬件状态？为什么同进程切线程比跨进程切换更快？
- 小节
  1. 时钟中断入内核栈与 switch_to 栈指针切换
  2. 跨进程切换 CR3 页表基址与 TLB 刷新代价
  3. 自愿/非自愿切换计数与 L1/L2 Cache 变冷间接损耗
- 能力：能完整复述内核切换两个执行流的寄存器与栈切换步骤。
- 练习与预期：在 `/proc/self/status` 中区分 `voluntary_ctxt_switches` 与 `nonvoluntary_ctxt_switches` 的触发来源。

### CPU 调度算法与多核挑战

- 入口：已理解进程状态与上下文切换代价。
- 能力：评估调度指标权衡，分析经典算法、MLFQ、Linux CFS 红黑树及多核优先级反转。
- 检验：运行调度模拟器对比平均周转/响应时间，并在 Linux 验证 CPU 亲和性设置。

<a id="os-14"></a>

#### OS-14 CPU 调度核心指标：吞吐量、周转、响应与公平

- 先修：[OS-13](#os-13)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：为什么“让所有任务总体最快做完”和“让用户点击立刻得到反应”往往互相冲突？
- 小节
  1. 周转时间与响应时间的数学定义
  2. 吞吐量与上下文切换频率的权衡
  3. 公平性与防饥饿底线
- 能力：能根据业务场景（批处理 vs 交互服务）选择首要优化的调度目标。
- 练习与预期：给定任务到达/首次运行/完成时刻，手工算出各任务的周转时间与响应时间。

<a id="os-15"></a>

#### OS-15 经典调度策略：FIFO、SJF、STCF 与 Round-Robin

- 先修：[OS-14](#os-14)
- 层级：入门（核心基础）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：FIFO 为何会产生护航效应？时间片轮转（RR）的时间片设太大或太小各有何后果？
- 小节
  1. FIFO 护航效应（Convoy Effect）
  2. 非抢占 SJF 与最优平均周转时间 STCF
  3. Round-Robin 时间片大小对响应与切换开销的权衡
- 能力：能手工推演并编程模拟四种经典策略下的甘特图与平均指标。
- 练习与预期：运行 `sched_sim.cpp` 对比 `A(100ms), B(10ms), C(10ms)` 在 FIFO、STCF 与 RR(`q=10`) 下的周转与响应时间。

<a id="os-16"></a>

#### OS-16 多级反馈队列（MLFQ）：无需预知时长的自适应调度

- 先修：[OS-15](#os-15)
- 层级：核心应用（项目主线）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：OS 无法预知程序未来要跑多久，MLFQ 如何仅凭过去历史就自动区分交互任务与计算长任务？
- 小节
  1. 优先级分层队列与新任务高优试探
  2. 累计配额降级（防故意 yield 作弊）
  3. 周期性全员提升（Priority Boost）防饥饿
- 能力：能完整陈述 MLFQ 五大法则及每一条对应的漏洞修补动机。
- 练习与预期：解释为何若按“单次让出前耗时”而非“累计耗时”降级，流氓程序可以长期霸占最高优先级。

<a id="os-17"></a>

#### OS-17 Linux CFS（完全公平调度器）与实时调度

- 先修：[OS-16](#os-16)
- 层级：核心应用（项目主线）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：Linux CFS 的 `vruntime` 与红黑树如何做到交互进程自然插队且 $O(1)$ 选人？
- 小节
  1. 理想公平 CPU、vruntime 记账与 nice 权重比例
  2. 红黑树最左节点缓存（及 EEVDF 延迟演进）
  3. SCHED_FIFO / SCHED_RR 硬实时抢占与 95% 安全阀
- 能力：能解释 `nice` 值如何通过加权 `vruntime` 倾斜分配 CPU 份额。
- 练习与预期：运行 `cfs_sim.cpp`，观察 `nice=-5 / 0 / +5` 三个任务在 400ms 后的真实 CPU 分配比例与最终 `vruntime` 收敛情况。

<a id="os-18"></a>

#### OS-18 多核调度、CPU 亲和性、优先级反转与饥饿

- 先修：[OS-17](#os-17)
- 层级：进阶专题（方向进阶）
- 状态：已有[进程、线程与 CPU 调度正文](../../src/content/handbook/os-process-sched.md)。
- 问题：为什么低优先级线程持锁居然能卡死最高优先级线程？多核下为何要尽量让线程留在原来的核心？
- 小节
  1. SQMS vs MQMS 每核队列与工作窃取
  2. CPU 亲和性（sched_setaffinity）与 Cache/NUMA 局部性
  3. 优先级反转成因与优先级继承协议（火星探路者案例）
- 能力：能诊断优先级反转并合理使用绑核与优先级继承避免延迟灾难。
- 练习与预期：在 Linux/WSL2 编译运行 `affinity_demo.cpp` 验证绑核到 CPU 0；画图复盘低/中/高三优先级线程反转时序。

## 第三篇 并发同步、经典问题与死锁防治

### 原子原语、锁与管程

- 入口：已掌握多线程共享地址空间与调度抢占模型。
- 能力：解释竞态根因、硬件原子指令、互斥/信号量/条件变量与三大经典并发问题。
- 检验：实现可优雅关闭的有界队列、公平票据锁及无死锁哲学家就餐。

<a id="os-19"></a>

#### OS-19 并发为何会出错：竞态条件、丢失更新与重排

- 先修：[OS-12](#os-12)
- 层级：入门（核心基础）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：一句简单的 `counter++` 为什么在双线程下会算少？`volatile` 为何救不了多线程？
- 小节
  1. 读-改-写指令拆解与抢占交错时序
  2. 丢失更新与竞态条件定义
  3. 编译器与 CPU 乱序重排及 volatile 误区
- 能力：能识别非原子共享写导致的数据竞争，并杜绝误用 `volatile` 代替原子类型。
- 练习与预期：运行 `race_demo.cpp`，对比普通 `int` 算丢账与 `std::atomic<int>` 精确到达 `1000000`。

<a id="os-20"></a>

#### OS-20 临界区三准则：互斥、前进与有限等待

- 先修：[OS-19](#os-19)
- 层级：入门（核心基础）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：一个严谨的临界区同步协议必须同时满足哪三条数学性质？纯软件 Peterson 算法为何需要内存屏障？
- 小节
  1. 互斥（Mutual Exclusion）与前进（Progress）
  2. 有限等待（Bounded Waiting）防饥饿
  3. Peterson 双线程协议与 Store Buffer 内存屏障
- 能力：能逐条检验给定互斥算法是否违背三准则之一。
- 练习与预期：运行 `peterson.cpp`，验证基于 `std::atomic` 顺序一致内存序的软件互斥结果严格等于 `400000`。

<a id="os-21"></a>

#### OS-21 硬件原子原语与锁实现：TAS、CAS、LL/SC 与锁选型

- 先修：[OS-20](#os-20)
- 层级：核心应用（项目主线）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：CPU 如何用单条硬件指令实现锁？自旋锁和 Linux `futex` 睡眠锁各自在什么场景会彻底踩坑？
- 小节
  1. TAS、CAS（及 ABA 问题）与 ARM/RISC-V LL/SC
  2. TTAS 优化与公平叫号 Ticket Spinlock
  3. 自旋忙等 vs futex 用户态快速路径+内核睡眠队列
- 能力：能手写自旋锁并依据临界区长度与核心数在自旋锁和睡眠互斥锁间正确选型。
- 练习与预期：运行 `ticket_spinlock.cpp` 验证 4 线程累加 `400000`，并解释单核机器用自旋锁的风险。

<a id="os-22"></a>

#### OS-22 信号量（Semaphore）：计数、二值与 wait/post

- 先修：[OS-21](#os-21)
- 层级：核心应用（项目主线）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：计数信号量如何控制并发容量？初值为 0 的二值信号量与互斥锁有何本质区别？
- 小节
  1. Dijkstra P(acquire) / V(release) 原子语义
  2. 计数信号量限流 vs 初值 0 事件接力同步
  3. 无所有权限制 vs std::mutex 谁锁谁解
- 能力：能使用 C++20 `<semaphore>` 完成事件顺序接力与资源池并发限流。
- 练习与预期：运行 `semaphore_demo.cpp`，核对“准备就绪”信号接力与最多 2 辆车同时停入的顺序输出。

<a id="os-23"></a>

#### OS-23 条件变量与管程：为什么 Mesa 语义必须用 while 重检

- 先修：[OS-21](#os-21)、[CPP-10](cpp.md#cpp-10)
- 层级：核心应用（项目主线）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)与[有界队列正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：如果把 `cv.wait` 外面的 `while` 改成 `if` 会发生什么？为什么修改谓词必须先持有锁？
- 小节
  1. 管程 Monitor = 共享状态 + 互斥锁 + 条件变量
  2. wait 原子放锁入睡与醒来重抢锁过程
  3. Mesa 语义插队偷走、虚假唤醒与 Lost Wakeup
- 能力：能规范写出带谓词循环的条件等待，杜绝信号丢失与空队列越界。
- 练习与预期：绘制 Mesa 语义下消费者 C1 被唤醒后、C2 抢先消费导致 C1 重新抢锁时条件已失效的 3 步时序图。

<a id="os-24"></a>

#### OS-24 三大经典同步问题：有界缓冲、读写者与哲学家就餐

- 先修：[OS-22](#os-22)、[OS-23](#os-23)
- 层级：核心应用（项目主线）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)与[有界队列正文](../../src/content/handbook/concurrency-queue.md)。
- 问题：如何让有界队列在关闭时排空退出？读者不断涌入为何会饿死写者？哲学家怎样打破圆桌对称僵局？
- 小节
  1. 双条件变量有界队列与 close() 广播排空
  2. 读写锁（std::shared_mutex）与写者饥饿公平闸门
  3. 哲学家就餐对称死锁与资源编号有序获取
- 能力：能独立实现可优雅关闭的生产者-消费者队列并化解读写饥饿与就餐僵局。
- 练习与预期：运行 `classic_sync.cpp`，确认有界队列消费完 `1..5` 后正常退出且 5 位哲学家无死锁完成就餐。

### 死锁理论与防线

- 入口：已能使用互斥锁与条件变量编写并发模块。
- 能力：运用 Coffman 四条件建模死锁，掌握锁序/银行家算法防线及等待图环检测。
- 检验：实现全局锁序转账及基于 DFS 的等待图环检测工具。

<a id="os-25"></a>

#### OS-25 死锁本质：Coffman 四条件与资源分配图

- 先修：[OS-24](#os-24)
- 层级：核心应用（项目主线）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：死锁发生必须同时具备哪四个条件？资源分配图出现环就一定死锁吗？
- 小节
  1. 互斥、持有并等待、不可剥夺与循环等待
  2. 资源分配图（RAG）与等待图（Wait-For Graph）
  3. 单实例资源成环充要性 vs 多实例资源成环必要性
- 能力：能把代码中的锁请求关系绘制成等待图并识别潜在循环等待环。
- 练习与预期：举例说明某种资源有 2 个实例时，资源分配图成环但并未死锁的场景。

<a id="os-26"></a>

#### OS-26 死锁预防与避免：锁序、trylock 与银行家算法

- 先修：[OS-25](#os-25)
- 层级：进阶专题（方向进阶）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：如何在工程里低成本彻底消灭死锁？银行家算法是如何用“安全序列”预测未来的？
- 小节
  1. 破除四条件：全局锁序（地址序）与 try_lock 退避
  2. C++20 std::scoped_lock 无死锁多锁获取
  3. 银行家算法安全状态推演直觉
- 能力：能用全局锁序或 `std::scoped_lock` 彻底消除反向加锁死锁，并完成银行家安全序列心算。
- 练习与预期：运行 `lock_ordering.cpp` 验证双向高并发转账无死锁；完成教材练习 3 的银行家安全状态判定。

<a id="os-27"></a>

#### OS-27 死锁检测与恢复：等待图环检测与事务回滚

- 先修：[OS-26](#os-26)
- 层级：进阶专题（方向进阶）
- 状态：已有[并发同步与死锁正文](../../src/content/handbook/os-sync-deadlock.md)。
- 问题：数据库等系统如果不提前禁止反向加锁，运行时怎样抓出死锁环并安全恢复？
- 小节
  1. 等待图三色 DFS 环检测算法
  2. 内核 lockdep 与 ThreadSanitizer 锁序逆转告警
  3. 死锁恢复：受害者挑选、资源剥夺与事务回滚
- 能力：能编写等待图 DFS 检测器并理解生产级工具排查锁序隐患的机制。
- 练习与预期：运行 `deadlock_detect.cpp`，核对检测器准确输出 `T0 -> T1 -> T2 -> T0` 死锁等待环。

## 第四篇 虚拟内存与地址映射

### 分页、TLB 与页面置换

- 入口：已理解进程与 `mm_struct` 抽象。
- 能力：贯通虚存地址布局、分页与 PTE、TLB/ASID、四级页表、按需分页及页面置换与抖动。
- 检验：通过 `VmRSS`/缺页计数实验与 Belady 异常模拟器验证核心模型。

<a id="os-28"></a>

#### OS-28 进程地址空间抽象：Text/Data/BSS/Heap/mmap/Stack

- 先修：[OS-09](#os-09)
- 层级：入门（核心基础）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：为什么两个同时运行的程序打印出相同的指针地址却互不干扰？各内存段如何排布？
- 小节
  1. 64 位虚拟地址空间标准全景图
  2. Text / Data / BSS / Heap / mmap / Stack 职责与增长方向
  3. ASLR 随机化与零页空指针保护区
- 能力：能通过指针地址大小判断变量属于代码段、静态区、堆区还是栈区。
- 练习与预期：运行 `addr_layout.cpp`，观察并记录 `Text < Data < BSS < Heap << Stack` 的递增地址序列。

<a id="os-29"></a>

#### OS-29 早期地址转换：基址加界限与分段机制局限

- 先修：[OS-28](#os-28)
- 层级：入门（核心基础）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：早期的 Base & Bounds 和分段机制为什么最终被现代操作系统淘汰了？
- 小节
  1. 动态重定位（Base + Bounds）及其空间浪费
  2. 独立分段与越界段错误检查
  3. 可变大小分配引起的外部碎片困境
- 能力：能解释外部碎片的成因以及为何定长块划分能根治外部碎片。
- 练习与预期：绘制“总空闲 40MB 却无法放入 25MB 连续段”的外部碎片内存示意图。

<a id="os-30"></a>

#### OS-30 分页机制与页表项（PTE）：VPN、Offset 与权限位

- 先修：[OS-29](#os-29)
- 层级：入门（核心基础）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：4KB 虚拟地址是如何拆成页号和偏移的？页表项 PTE 除了物理页框号还存了哪些关键安检位？
- 小节
  1. 定长 4KB 页框与 VPN + Offset 地址切分
  2. PTE 关键位：Present / R/W / U/S / Accessed / Dirty / NX
  3. 仅余轻微内部碎片而彻底消除外部碎片
- 能力：能手工完成 64 位虚拟地址与 PTE 位域的编码和解码计算。
- 练习与预期：运行 `pte_decode.cpp`，核对 `VA=0x7fff12345abc` 解出 `Offset=0xabc` 及 `P/RW/US/NX` 权限标志。

<a id="os-31"></a>

#### OS-31 TLB（快表）与上下文切换刷新：ASID/PCID

- 先修：[OS-30](#os-30)
- 层级：核心应用（项目主线）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：为什么顺序遍历数组比链表跳转快得多？切换进程 `CR3` 为什么会导致 TLB 性能雪崩？
- 小节
  1. MMU 快表 TLB 命中与未命中走页表代价
  2. 空间局部性与每页 1024 个 int 的访问优势
  3. 切换 CR3 刷新 TLB、ASID/PCID 标签与多核 TLB Shootdown
- 能力：能从 TLB 命中率角度优化数据结构布局，并理解 PCID 对进程切换的加速作用。
- 练习与预期：对比按行遍历与按列跳跃遍历 `4096x4096` 矩阵的耗时差异并归因到 TLB/Cache 命中率。

<a id="os-32"></a>

#### OS-32 多级页表：x86-64 四级/五级页表结构

- 先修：[OS-30](#os-30)
- 层级：核心应用（项目主线）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：单级扁平页表光一个 `Hello World` 就要吃掉 512GB 内存，x86-64 是怎样把页表压缩到几 KB 的？
- 小节
  1. 扁平页表 512GB 内存爆炸算账
  2. 4 级稀疏树（PGD/PUD/PMD/PT: 9+9+9+9+12）与 5 级 LA57
  3. 2MB / 1GB 大页（Huge Pages）减少页表层级与 TLB 压力
- 能力：能切分 48 位虚拟地址的各级页表索引，并算清多级页表节省空间的原理。
- 练习与预期：完成练习 1 的 32 位两级页表地址 `0x00403028` 三段位索引手工切分。

<a id="os-33"></a>

#### OS-33 按需分页（Demand Paging）与主次缺页中断

- 先修：[OS-32](#os-32)
- 层级：入门（核心基础）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)（含[核心验证源码](../../public/examples/os-process-vmem.cpp)）。
- 问题：为什么 `mmap(256MB)` 刚返回时物理内存 `VmRSS` 几乎没涨？次缺页和主缺页慢多少倍？
- 小节
  1. 延迟分配 VMA 登记与按需触页流程
  2. 内核 do_page_fault 校验、分配与指令重执行
  3. 微秒级次缺页（Minor）vs 毫秒级磁盘主缺页（Major）
- 能力：能区分虚拟内存预留量（VSS）与实际物理驻留集（RSS），并用 `getrusage` 观测缺页增量。
- 练习与预期：运行 `os-process-vmem.cpp` 与 `demand_paging.cpp`，核对按页触碰 256MB 后 `VmRSS` 增长约 256MB 且 `minflt` 增长约 `65536`。

<a id="os-34"></a>

#### OS-34 页面置换算法：OPT、FIFO(Belady 异常)、LRU 与 Clock

- 先修：[OS-33](#os-33)
- 层级：核心应用（项目主线）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：内存满时为什么给 FIFO 多分一格页框缺页反而变多？现代 OS 如何用 Clock 低成本逼近 LRU？
- 小节
  1. 理论最优 OPT 与 FIFO 的 Belady 异常
  2. LRU 栈包含性与硬件记录时间开销
  3. Clock / 二次机会算法（基于 Accessed/Dirty 位）
- 能力：能手算并编程对比 FIFO、LRU、Clock 在给定访存序列下的缺页次数。
- 练习与预期：运行 `page_replace_sim.cpp`，复现 Belady 序列在 3 帧缺页 9 次而 4 帧缺页 10 次的反直觉现象。

<a id="os-35"></a>

#### OS-35 抖动（Thrashing）与工作集模型

- 先修：[OS-34](#os-34)
- 层级：进阶专题（方向进阶）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：为什么机器内存快满时不是慢慢变卡，而是 CPU 利用率突然暴跌到接近 0%？OOM Killer 何时出手？
- 小节
  1. 活跃工作集之和超出物理内存引发换入换出风暴
  2. Denning 工作集模型与 PFF 缺页频率控制
  3. Linux Swap 抖动排查与 OOM Killer 击杀机制
- 能力：能识别系统抖动症状并理解工作集准入与 OOM 保护的工程意义。
- 练习与预期：绘制“并发进程数 vs CPU 利用率”的抖动断崖曲线并说明拐点物理含义。

### 内存映射、共享内存与写时复制

- 入口：已理解页表权限与缺页机制。
- 能力：区分 `brk` 与 `mmap` 分配策略，运用 `shm_open` 共享内存并精准追踪 CoW 写时复制开销。
- 检验：完成 `MAP_PRIVATE` vs `MAP_SHARED` 父子进程读值对比实验。

<a id="os-36"></a>

#### OS-36 堆与映射系统调用：brk/sbrk 与 mmap

- 先修：[OS-33](#os-33)
- 层级：核心应用（项目主线）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：`malloc` 申请 64 字节和申请 1MB 在底层分别调了什么系统调用？为什么小块 `free` 后未必立刻还给 OS？
- 小节
  1. brk/sbrk 推进堆顶与空闲链表空洞滞留
  2. mmap 匿名大块分配与 munmap 瞬时归还
  3. 文件映射 mmap 与 mprotect 警戒页/JIT 权限切换
- 能力：能解释用户态内存分配器协同 `brk` 与 `mmap` 工作的策略。
- 练习与预期：使用 `strace -e trace=brk,mmap,munmap` 观察程序分别 `malloc(100)` 与 `malloc(10*1024*1024)` 时的系统调用差异。

<a id="os-37"></a>

#### OS-37 进程间共享内存：shm_open 与 MAP_SHARED

- 先修：[OS-36](#os-36)
- 层级：核心应用（项目主线）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：不同进程的虚拟页表如何指向同一块物理内存条？共享内存为何必须自己配同步原语？
- 小节
  1. MAP_SHARED 共享物理页框与修改立即可见性
  2. POSIX shm_open + ftruncate + mmap 跨无亲缘进程共享
  3. 跨进程共享互斥锁与原子状态同步约束
- 能力：能对比 `MAP_PRIVATE` 与 `MAP_SHARED` 的页表映射差异并安全搭建共享内存通道。
- 练习与预期：运行 `fork_mmap_compare.cpp`，确认父进程 `wait` 后读到 `*priv == 1` 与 `*shar == 2`。

<a id="os-38"></a>

#### OS-38 写时复制（Copy-on-Write）深度追踪与工程影响

- 先修：[OS-11](#os-11)、[OS-37](#os-37)
- 层级：进阶专题（方向进阶）
- 状态：已有[虚拟内存深潜正文](../../src/content/handbook/os-process-vmem.md)。
- 问题：`fork()` 后父子页表是如何靠“临时标只读 + 引用计数”实现 CoW 的？为何 Redis 要关闭透明大页 THP？
- 小节
  1. fork 时刻清零 R/W 位与物理页 refcount 递增
  2. 写入触发写保护 Page Fault、拷贝新页与恢复可写
  3. 2MB 透明大页 THP 在 CoW 下 512 倍写放大延迟毛刺
- 能力：能逐帧追踪 CoW 页表与引用计数变化，并诊断 `fork` 快照期间的内存暴涨问题。
- 练习与预期：完整推演“100MB 匿名内存 `fork` 后子进程只读 vs 每页写 1 字节”的物理内存增量差异。

## 第五篇 I/O、持久化文件系统与容器隔离

### 设备 I/O、VFS 与文件结构

- 入口：已理解系统调用、页表与进程打开文件。
- 能力：解释外设 I/O、VFS 抽象、fd 三层模型、目录与 inode 结构及 WAL/CoW/FTL 一致性。
- 检验：跑通 `dup` 共享偏移实验，完成 inode 最大文件容量计算。

<a id="os-39"></a>

#### OS-39 I/O 设备交互：轮询、硬件中断与 DMA

- 先修：[OS-07](#os-07)
- 层级：入门（核心基础）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：CPU 如何从慢速磁盘和万兆网卡收发数据而不用死循环空等或逐字节亲自搬运？
- 小节
  1. 轮询（Polling）与高负载 NAPI 混合收包
  2. 硬件中断（IRQ）释放算力与中断风暴困境
  3. DMA 控制器直接内存搬运（仅完成发 1 次中断）
- 能力：能绘制 DMA 传输数据流图并比较三种设备交互方式的 CPU 占用。
- 练习与预期：对比拷贝 1MB 磁盘块时 PIO 逐字搬运与 DMA 搬运对 CPU 中断及指令周期消耗的差异。

<a id="os-40"></a>

#### OS-40 块设备、字符设备与 VFS 虚拟文件系统

- 先修：[OS-39](#os-39)
- 层级：入门（核心基础）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：为什么同一套 `open/read/write` 接口能同时操作 ext4 硬盘文件、`/dev/null` 和 `/proc` 内存状态？
- 小节
  1. 随机块设备 vs 顺序字节流字符设备
  2. VFS 四大对象：super_block / inode / dentry / file
  3. file_operations 函数指针表内核态多态分发
- 能力：能说明 Linux “一切皆文件”背后的 VFS 虚表架构原理。
- 练习与预期：在 Linux 查看 `ls -l /dev/null /dev/nvme0n1` 首字母 `c` 与 `b`，解释二者随机 `lseek` 支持差异。

<a id="os-41"></a>

#### OS-41 文件描述符三层模型：fd 表、打开文件描述与 inode

- 先修：[OS-40](#os-40)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)与 [Linux 正文](../../src/content/handbook/linux-process-io.md)。
- 问题：为什么 `dup` 复制出来的两个整数会互相推动读写偏移，而重新 `open` 两次却互不干扰？
- 小节
  1. 每进程 fd 表（含 FD_CLOEXEC 标志）
  2. 系统级打开文件描述 struct file（offset 与 flags）
  3. 系统级 inode 实体与引用计数释放时机
- 能力：能画出任意 `open` / `dup` / `fork` 组合后的三层表连接图并准确预测读取字符。
- 练习与预期：运行 `fd_3layer.cpp` 对 `"ABC"` 文件连续读取，核对输出 `fd1=A, fd2(dup)=B, fd3(re-open)=A`。

<a id="os-42"></a>

#### OS-42 目录、硬链接、软链接与 dentry 缓存

- 先修：[OS-41](#os-41)
- 层级：入门（核心基础）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：文件被改名或 `rm` 删除后，为什么正在运行的程序依然能继续读？软链接和硬链接本质差在哪？
- 小节
  1. 目录项映射（文件名 → inode 编号）
  2. 硬链接（共享 inode、nlink++）vs 软链接（独立路径文本文件）
  3. 日志轮转与 dcache（含负目录项缓存）加速路径解析
- 能力：能精准诊断“删掉大日志后 `df` 空间未释放”的未关闭 fd 根因。
- 练习与预期：模拟打开文件后执行 `mv` 改名，验证旧 `fd` 仍能读取原数据而按旧路径新 `open` 报 `ENOENT`。

<a id="os-43"></a>

#### OS-43 ext4/UNIX inode 结构：直接块、间接块与 Extent

- 先修：[OS-42](#os-42)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：inode 体积固定只有一百多字节，如何索引小到 10 字节、大到几 TB 的文件数据块？
- 小节
  1. ext4 块组布局（Superblock/Bitmap/Inode Table/Data）
  2. UNIX 12 直接块 + 一/二/三级间接指针索引
  3. 现代 ext4/XFS Extent 连续区间树高效压缩元数据
- 能力：能估算多级间接索引支持的最大文件容量，并解释 Extent 对连续大文件的性能收益。
- 练习与预期：完成练习 2（4KB 块、4B 指针、启到二级间接指针）的容量估算，核对结果约 `4GB + 4MB + 48KB`。

<a id="os-44"></a>

#### OS-44 崩溃一致性：fsck 与日志文件系统（Journaling/WAL）

- 先修：[OS-43](#os-43)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：追加写入数据时突然拔掉电源，磁盘为什么会烂掉？ext4 默认 `data=ordered` 日志怎么避免“幽灵指针”？
- 小节
  1. 写新块涉及位图/inode/数据三处更新的撕裂风险
  2. 全盘 fsck 耗时瓶颈 vs WAL 预写日志两阶段提交
  3. data=journal / data=ordered / data=writeback 三模式权衡
- 能力：能对比三种日志模式的性能与断电安全边界。
- 练习与预期：解释为什么 `data=ordered` 规定必须先写正式数据块落盘，再提交元数据事务日志。

<a id="os-45"></a>

#### OS-45 Copy-on-Write 文件系统（Btrfs/ZFS）与 SSD FTL

- 先修：[OS-44](#os-44)
- 层级：进阶专题（方向进阶）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：Btrfs/ZFS 为何能做到零拷贝秒级快照？SSD 为什么非要内置 FTL 闪存转换层，且删除文件后需要 `TRIM`？
- 小节
  1. CoW 文件系统异地写入、根指针原子切换与秒级快照
  2. NAND 闪存“页写块擦（先擦后写）”物理限制
  3. SSD FTL 映射、写放大 GC、磨损均衡与 TRIM 命令
- 能力：能解释 CoW 文件系统优势以及 SSD 写放大与空间预留的内在机理。
- 练习与预期：说明为什么如果 OS 不向 SSD 发送 `TRIM` 通知，删除大量文件后 SSD 的写入性能仍会逐渐退化。

### 页缓存、零拷贝、异步 I/O 与容器

- 入口：已理解 VFS、fd 三层模型与磁盘持久化基础。
- 能力：划清 Page Cache 与 `fsync` 持久界线，掌握零拷贝、多路复用完成模型及 Linux 容器隔离原理。
- 检验：跑通 `sendfile` 零拷贝传输并观测进程 Namespaces/Cgroups 内核标识。

<a id="os-46"></a>

#### OS-46 页缓存（Page Cache）、fsync 与 O_DIRECT 边界

- 先修：[OS-41](#os-41)、[OS-33](#os-33)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)与 [SQLite 正文](../../src/content/handbook/storage-sqlite.md)。
- 问题：`write()` 返回成功时数据到底躺在内存还是硬盘？数据库为何常用 `fdatasync` 与 `O_DIRECT`？
- 小节
  1. 用户态流缓冲 vs 内核 Page Cache 脏页 vs 磁盘介质
  2. fsync 与 fdatasync 的元数据冲刷开销差异
  3. O_DIRECT 绕过双份缓存与原子替换五步曲（含 fsync 父目录）
- 能力：能设计断电不丢、不损坏的持久化落盘与配置原子替换流程。
- 练习与预期：完成练习 3，写出原子替换 `cfg.json` 时为何必须对临时文件与父目录分别调 `fsync` 的完整理由。

<a id="os-47"></a>

#### OS-47 块设备 I/O 调度器：mq-deadline、BFQ 与 NVMe 多队列

- 先修：[OS-46](#os-46)
- 层级：进阶专题（方向进阶）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：为什么机械硬盘时代的电梯调度到 NVMe SSD 时代反而成了瓶颈？Linux `blk-mq` 是如何解开全局锁的？
- 小节
  1. HDD 磁头寻道电梯算法（SCAN/C-SCAN）
  2. blk-mq 每核软件队列直通 NVMe 硬件多队列
  3. none / mq-deadline / bfq 调度器选型对照
- 能力：能根据存储介质（NVMe vs SATA/HDD）和负载类型合理理解或选择块调度器。
- 练习与预期：在 Linux 查看 `/sys/block/*/queue/scheduler` 并对比 `mq-deadline` 与 `bfq` 的设计目标。

<a id="os-48"></a>

#### OS-48 零拷贝 I/O：sendfile、splice 与 mmap

- 先修：[OS-46](#os-46)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：传统 `read` + `write` 发送文件到底经过了几次拷贝与切换？`sendfile` 如何把 CPU 拷贝降为零？
- 小节
  1. read+write 的 4 次切换与 4 次数据拷贝剖析
  2. sendfile（配 Scatter-Gather DMA）零 CPU 拷贝直传网卡
  3. mmap+write 与 splice 内核管道零拷贝桥接
- 能力：能绘制零拷贝路径对比图并在文件/网络转发中正确运用 `sendfile`/`splice`。
- 练习与预期：编译运行 `sendfile_demo.cpp`，核对在用户态未分配缓冲区的情况下成功复制 36 字节载荷。

<a id="os-49"></a>

#### OS-49 异步与多路复用 I/O：`epoll` 就绪与 `io_uring` 完成队列

- 先修：[OS-48](#os-48)、[OS-13](#os-13)
- 层级：核心应用（项目主线）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)、[Linux 正文](../../src/content/handbook/linux-process-io.md)与 [TCP 正文](../../src/content/handbook/network-tcp.md)。
- 问题：`epoll` 通知“可读”是否意味着整条应用消息已到达？`io_uring` 如何靠共享环形队列彻底压榨 I/O 极限？
- 小节
  1. 阻塞/非阻塞（EAGAIN）与 select/poll/epoll 就绪通知
  2. epoll 半包粘包分帧契约（LT vs ET）
  3. io_uring SQ/CQ 异步完成队列与提交缓冲区寿命铁律
- 能力：能区分 Readiness 与 Completion 两代模型的系统调用频率与缓冲区寿命责任。
- 练习与预期：说明 `io_uring` 异步读请求提交后、在 CQ 收到完成通知前为何严禁释放对应用户态 buffer。

<a id="os-50"></a>

#### OS-50 容器的操作系统真相：Namespaces 隔离与 Cgroups 限额

- 先修：[OS-11](#os-11)、[OS-42](#os-42)
- 层级：进阶专题（方向进阶）
- 状态：已有[I/O、文件系统与容器正文](../../src/content/handbook/os-fs-io.md)。
- 问题：Docker 容器没有独立操作系统内核，仅靠普通 Linux 进程是怎样变出独立主机、IP、目录和资源上限的？
- 小节
  1. Linux Namespaces 视野隔离（PID/NET/MNT/UTS/IPC/USER）
  2. Cgroups v2 资源配额控制（cpu.max/memory.max/pids.max）
  3. 共用宿主机内核下的安全边界与局部 OOM 机制
- 能力：能从内核机制拆解容器本质，区分容器进程隔离与硬件虚拟化 VM 的核心差别。
- 练习与预期：在 Linux/WSL2 运行 `container_probe.cpp`，观察 `/proc/self/ns` 下各 Namespace 符号链接编号与 `/proc/self/cgroup` 归属路径。
