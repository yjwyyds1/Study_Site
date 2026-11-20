---
title: "进程、线程、上下文切换与 CPU 调度策略"
description: "深入 PCB/task_struct、6 态转换与僵尸孤儿回收、fork CoW 与 execve、1:1/N:1/M:N 线程模型与 C++20 协程、上下文切换 CR3 解剖，以及 FIFO/SJF/STCF/RR/MLFQ/Linux CFS 红黑树调度、CPU 亲和性与优先级反转。"
order: 72
category: "操作系统"
tags: ["操作系统", "进程", "线程", "上下文切换", "CFS", "MLFQ", "CPU调度"]
related: ["handbook/os-zero-start", "handbook/os-sync-deadlock", "handbook/os-process-vmem", "handbook/linux-process-io"]
sources: []
---

## 本篇解决的核心问题 (OS-09 ~ OS-18)

你在电脑上同时开着编译器、浏览器和音乐播放器，CPU 却可能只有 4 个或 8 个物理核心。**内核靠什么记住每个程序跑到哪一行、打开了哪些文件？`fork()` 为什么能在一毫秒内复制出整个程序？调度器怎样在“高吞吐”和“打字不卡顿”之间走钢丝？**

本篇覆盖 **`OS-09` 至 `OS-18`**，拆解操作系统三大支柱之一——**CPU 虚拟化（执行实体与调度算法）**。

---

## 一、进程抽象：PCB / `task_struct` 与内存分段 (OS-09)

操作系统为了把“菜谱（可执行文件）”变成一间“活着的独立厨房（进程）”，必须在内核里为它建一份**电子档案袋**——这就是**进程控制块（PCB, Process Control Block）**，在 Linux 内核源码中对应巨大的结构体 `struct task_struct`。

```text
  Linux 内核中的进程档案: struct task_struct (PCB)
  ┌─────────────────────────────────────────────────────────────────┐
  │ • 身份标识: pid (线程ID), tgid (进程ID), ppid (父进程), cred(UID) │
  │ • 执行状态: state (RUNNING / INTERRUPTIBLE / UNINTERRUPTIBLE...)  │
  │ • 硬件现场: thread_struct (RSP, RIP, 通用寄存器, FPU/SIMD 寄存器) │
  │ • 内存指针: mm_struct ──▶ 指向本进程独立的页表根 (CR3) 与 VMA 链表 │
  │ • 文件清单: files_struct ──▶ fd[0]=stdin, fd[1]=stdout, fd[3]... │
  │ • 调度账本: sched_entity (vruntime, 优先级, 亲和性 cpumask)       │
  └─────────────────────────────────────────────────────────────────┘
```

同时，每个进程的虚拟地址空间被标准划分为几个职责分明的段（可通过查看 `/proc/self/maps` 验证）：

```text
  高地址 0x7fff... ┌───────────────────────────┐
                  │  Stack (调用栈，向下增长)   │  局部变量、返回地址
                  ├───────────────────────────┤
                  │            ▼              │
                  │       (未分配空洞)         │
                  │            ▲              │
                  ├───────────────────────────┤
                  │  mmap 映射区 (.so / 大内存) │  动态库、匿名大块内存
                  ├───────────────────────────┤
                  │            ▲              │
                  │  Heap (堆，brk 向上增长)    │  new / malloc / vector
                  ├───────────────────────────┤
                  │  BSS 段 (未初始化全局变量)  │  默认填 0，可执行文件中不占空间
                  ├───────────────────────────┤
                  │  Data 段 (已初始化全局变量) │  int g_x = 42;
                  ├───────────────────────────┤
  低地址 0x400000 │  Text 段 (机器指令，只读)   │  main() 与函数机器码
                  └───────────────────────────┘
```

### 实验（Linux / WSL2）：用 C++20 窥探当前进程的 `PCB` 摘要与内存段

```cpp
// Linux / WSL2 编译: g++ -std=c++20 inspect_pcb.cpp -o inspect_pcb
#include <fstream>
#include <iostream>
#include <string>
#include <unistd.h>

int main() {
    std::cout << "当前 PID=" << ::getpid() << ", PPID=" << ::getppid() << "\n\n";

    std::ifstream status("/proc/self/status");
    std::string line;
    std::cout << "--- /proc/self/status 核心字段 ---\n";
    while (std::getline(status, line)) {
        if (line.rfind("Name:", 0) == 0 || line.rfind("State:", 0) == 0 ||
            line.rfind("Tgid:", 0) == 0 || line.rfind("Pid:", 0) == 0 ||
            line.rfind("VmRSS:", 0) == 0 || line.rfind("Threads:", 0) == 0) {
            std::cout << line << '\n';
        }
    }

    std::ifstream maps("/proc/self/maps");
    std::cout << "\n--- /proc/self/maps 前 8 条虚拟段 ---\n";
    for (int i = 0; i < 8 && std::getline(maps, line); ++i) {
        std::cout << line << '\n';
    }
    return 0;
}
```

---

## 二、进程状态转换：New / Ready / Running / Blocked / Terminated / Zombie (OS-10)

一个进程从诞生到销毁，不会永远霸占 CPU，而是在几种离散状态间流转：

```text
                       调度器派发 (dispatch)
  [New] ──加载完毕──▶ [Ready 就绪] ◀═══════════════ [Running 运行]
   创建态              ▲   (在运行队列排队)    时间片到/被抢占   │  │
                       │                                        │  │ exit()
                       │  I/O 完成 / 锁释放 / 信号唤醒            │  ▼
                       └────────── [Blocked 阻塞] ◀─────────────┘  [Zombie 僵尸 (Z)]
                                     (移出运行队列休眠)             │  父进程 waitpid()
                                                                   ▼
                                                              [Terminated 彻底释放]
```

### Linux `ps` / `/proc` 真实状态码对照

| 逻辑状态 | Linux 内核状态码 | `ps` 字母 | 关键特性与踩坑提示 |
| --- | --- | :---: | --- |
| **Ready / Running** | `TASK_RUNNING` | `R` | Linux 把“正在 CPU 上跑”和“在就绪队列排队”合称为 `R` |
| **Blocked（可中断）** | `TASK_INTERRUPTIBLE` | `S` | 等管道数据、`sleep`、等网络包；收到信号（如 `Ctrl+C`）可立即唤醒 |
| **Blocked（不可中断）** | `TASK_UNINTERRUPTIBLE` | **`D`** | 多在等待底层磁盘/NFS 驱动响应；**连 `kill -9` 都杀不死**，必须等硬件 I/O 返回或超时 |
| **Stopped** | `TASK_STOPPED` | `T` | 收到 `SIGSTOP` / `Ctrl+Z` 或被 GDB 断点暂停 |
| **Zombie（僵尸）** | `EXIT_ZOMBIE` | **`Z`** | 内存与 fd 已全部释放，**仅保留 `task_struct` 里的退出码等父进程 `waitpid` 收尸** |

- **僵尸进程 vs 孤儿进程**：
  - **僵尸进程**：子进程死了，父进程还活着却不调 `waitpid()`，导致 `Z` 条目长期占用 PID。
  - **孤儿进程**：父进程先挂了，活着的子进程会被 **`PID 1`（`init` / `systemd`）收养**，等它结束时由 `PID 1` 自动 `wait`，不会变僵尸。

---

## 三、`fork()` 写时复制与 `execve()` 映像替换 (OS-11)

为什么 Linux 启动一个新命令（比如 Shell 执行 `ls -l > out.txt`）要拆成 **`fork()` + `execve()`** 两步，而不是直接一个 `CreateProcess()`？

**绝妙的设计动机**：在 `fork()` 之后、`execve()` 之前的**短短几行代码窗口期**，子进程还跑着 Shell 的代码，此时它可以从容地关掉不需要的 fd、用 `dup2` 把标准输出重定向到 `out.txt` 或管道，然后再调 `execve("/bin/ls", ...)` 彻底变身！

```text
  父进程 Shell (PID=100)
     │
     ├── fork() ──▶ 1. 复制 task_struct 与页表 (仅复制页表目录，物理页共享 + 标只读 CoW!)
     │ (返回 101)   2. 子进程 (PID=101, 返回 0)
     ▼                    │
  waitpid(101, ...)       ├── open("out.txt") + dup2(fd, 1)  ◀── 完美完成重定向！
                          ├── execve("/bin/ls", argv, envp)
                          │     • PID 依然是 101！
                          │     • 代码/数据/堆/栈全部替换为 /bin/ls
                          │     • 保留未设 FD_CLOEXEC 的 fd (包括重定向后的 fd 1)
                          ▼
                      ls 运行完毕 _exit(7) ──▶ 变僵尸 (Z) 等父进程 waitpid 解码退出码
```

> [!WARNING]
> **`execve` 失败后为什么必须调 `_exit(127)` 而不是 `exit(127)`？**  
> 因为 `fork()` 复制了父进程的用户态 `stdio`（`printf`/`cout`）缓冲区。如果子进程在 `execve` 失败后调用标准库 `exit()`，它会把缓冲区里**父进程还没来得及刷出的内容也冲刷打印一遍**，导致输出莫名其妙重复两份！用 `_exit()` 则直接系统调用退出，不冲刷用户态缓冲。

### 可运行 POSIX/C++20 实验：最小命令启动器与 `waitpid` 状态解码

```cpp
// Linux / WSL2 编译: g++ -std=c++20 fork_exec_demo.cpp -o fork_exec_demo
#include <iostream>
#include <sys/wait.h>
#include <unistd.h>

extern char** environ;

int main() {
    pid_t pid = ::fork();
    if (pid < 0) {
        std::perror("fork");
        return 1;
    }

    if (pid == 0) {
        // 子进程分支：fork 返回 0
        char* const argv[] = {
            const_cast<char*>("/bin/sh"),
            const_cast<char*>("-c"),
            const_cast<char*>("exit 7"),
            nullptr
        };
        ::execve("/bin/sh", argv, environ);
        // 只有 execve 失败才会执行到这里
        ::_exit(127);
    }

    // 父进程分支：fork 返回子进程 PID (> 0)
    int status = 0;
    if (::waitpid(pid, &status, 0) == pid) {
        if (WIFEXITED(status)) {
            std::cout << "子进程 PID=" << pid
                      << " 正常退出, status原始值=" << status
                      << ", WEXITSTATUS=" << WEXITSTATUS(status) << '\n';
        } else if (WIFSIGNALED(status)) {
            std::cout << "子进程被信号终止, sig=" << WTERMSIG(status) << '\n';
        }
    }
    return 0;
}
```

---

## 四、线程模型全景：内核线程、1:1 / N:1 / M:N 与 C++20 协程 (OS-12)

如果说多进程是**开多间独立厨房**，那么多线程就是**同一间厨房里雇多个厨师**：

| 资源类别 | 多进程（`fork` 后） | 同进程多线程（`std::thread`） |
| --- | --- | --- |
| **虚拟地址空间（代码/全局/堆）** | 各自隔离（不同 `mm_struct`） | **完全共享**（同一份堆与全局变量，必须同步） |
| **文件描述符表（fd table）** | 克隆独立副本 | **共享**（线程 A `close(3)` 会影响线程 B） |
| **调用栈（Stack）与寄存器** | 各自私有 | **每线程私有**（局部变量互不干扰） |
| **`errno` 与 `thread_local`** | 各自私有 | **每线程私有（TLS）** |

### 用户态线程 vs 内核态线程：三大映射模型

```text
  [ N:1 用户态线程 ]          [ 1:1 内核态线程 (Linux/C++) ]     [ M:N 混合模型 (Go/Tokio) ]
   T1   T2   T3  (用户库)       T1     T2     T3  (std::thread)    G1  G2  G3  G4  (协程)
    \   |   /                   │      │      │                      \  |  /  /
   [用户态调度器]               │      │      │                     [M:N 用户调度器]
        │                       ▼      ▼      ▼                       │       │
   [1 个内核线程]              [K1]   [K2]   [K3] (task_struct)      [K1]    [K2]
   缺点: 任一阻塞 syscall      优点: 真多核并行, 一阻塞不影响他      优点: 百万级轻并发,
         卡死全进程！                缺点: 创建/切换需进内核             切换仅几十 ns
```

- **1:1 模型（Linux NPTL `pthread` / C++ `std::thread`）**：每个 `std::thread` 在内核里都是一个独立的轻量级进程（通过 `clone(CLONE_VM | CLONE_FS | CLONE_FILES | CLONE_SIGHAND | CLONE_THREAD)` 创建，拥有独立 `task_struct` 和唯一 `PID/TID`，共享同一 `TGID` 和 `mm_struct`）。能真正吃满多核 CPU，单个线程阻塞不会连累其他线程。
- **有栈纤程（Fiber） vs C++20 无栈协程（Stackless Coroutine）**：
  - **纤程 / Goroutine（有栈）**：每个协程自带一块几 KB 到几 MB 的独立调用栈，在用户态保存/恢复少数寄存器切换，可跨多层函数任意挂起。
  - **C++20 协程（无栈）**：编译器把函数拆成状态机，仅把挂起跨越的局部变量打包进堆上的一个小巧 **Coroutine Frame（几十字节）**，执行 `co_await` 挂起和恢复只需一次普通函数跳转（`~10 ns`），**零内核切换、零独立栈内存浪费**！

### 可运行 C++20 代码：验证 `std::thread` 的共享 vs `thread_local` + 极简无栈协程生成器

```cpp
// 编译: g++ -std=c++20 -pthread thread_vs_coro.cpp -o thread_vs_coro
#include <atomic>
#include <coroutine>
#include <iostream>
#include <thread>

std::atomic<int> g_shared_counter{0};
thread_local int tls_local = 0;

struct SimpleTask {
    struct promise_type {
        int current = 0;
        SimpleTask get_return_object() {
            return SimpleTask{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; }
        std::suspend_always final_suspend() noexcept { return {}; }
        std::suspend_always yield_value(int v) noexcept { current = v; return {}; }
        void return_void() noexcept {}
        void unhandled_exception() { std::terminate(); }
    };
    std::coroutine_handle<promise_type> h;
    ~SimpleTask() { if (h) h.destroy(); }
    bool next() {
        if (!h.done()) h.resume();
        return !h.done();
    }
    int value() const { return h.promise().current; }
};

SimpleTask count_three() {
    for (int i = 1; i <= 3; ++i) co_yield i * 10;
}

int main() {
    auto worker = [](int id) {
        g_shared_counter.fetch_add(1, std::memory_order_relaxed);
        ++tls_local; // 每个 OS 线程各自拥有一份独立副本
        std::cout << "线程 " << id << ": tls_local=" << tls_local << '\n';
    };
    std::jthread t1(worker, 1);
    std::jthread t2(worker, 2);
    t1.join();
    t2.join();
    std::cout << "共享计数 g_shared_counter=" << g_shared_counter.load() << '\n';

    // 同一个 OS 线程内零内核切换运行 C++20 协程
    auto task = count_three();
    std::cout << "C++20 协程产出:";
    while (task.next()) std::cout << ' ' << task.value();
    std::cout << '\n';
    return 0;
}
```

---

## 五、上下文切换解剖：保存寄存器、内核栈与 `CR3` (OS-13)

一次**完整的上下文切换（Context Switch）**到底在硬件和汇编层面干了什么？

假设线程 A 正在运行，突然时钟中断到达，调度器决定把 CPU 让给线程 B：

```text
  [1. 线程 A 在用户态跑] ──时钟中断/系统调用──▶ 硬件自动把线程 A 的 RIP, RSP, RFLAGS
                                                压入【线程 A 的内核栈 (Kernel Stack A)】
  [2. 内核保存剩余用户态通用寄存器到 Kernel Stack A]
  [3. 调度器调用 switch_to(A, B)]:
        • 把被调用者保存寄存器 + 当前 RSP 保存进 A->thread_struct
        • 若 B 属于另一个进程 (A->mm != B->mm):
              修改页表基址寄存器 mov %cr3, B_pgd   ◀── 跨进程切换最痛的一步！
        • 把 CPU 的 RSP 寄存器切换成 B->thread_struct.sp (指向 Kernel Stack B！)
  [4. 从 Kernel Stack B 弹出 B 的寄存器，执行 iretq / sysretq] ──▶ [5. 线程 B 恢复用户态运行]
```

### 为什么上下文切换比表面数字更贵？

- **直接开销**：保存/恢复寄存器 + 调度器选人，大约 **`1–3 μs`**。
- **间接开销（真正的大头，可达数十微秒）**：
  1. **L1 / L2 / L3 CPU Cache 变冷**：线程 A 刚把自己的热点数组预热进 L1 Cache（32KB），切换后线程 B 跑一圈把 Cache 全刷成了 B 的数据；等 A 回来时，全部 Cache Miss！
  2. **TLB 刷新（跨进程切换）**：切换 `CR3` 后，如果不启用 PCID/ASID，MMU 里的地址翻译快表（TLB）几乎失效，刚切过去的前几千次访存都要慢吞吞重走多级页表。

在 Linux 中，你可以查看 `/proc/self/status` 里的两个关键计数器：
- `voluntary_ctxt_switches`：**自愿切换**（主动调 `sleep`、`read` 等阻塞、等 `mutex` 让出 CPU）。
- `nonvoluntary_ctxt_switches`：**非自愿切换**（时间片用完或被更高优先级线程强行抢占）。

---

## 六、CPU 调度核心指标：吞吐量、周转时间、响应时间与公平性 (OS-14)

调度器每天都在做一道无解的多目标平衡题。先定义衡量好坏的四把尺子：

1. **周转时间（Turnaround Time）**：批处理作业最关心的指标——“从提交任务到彻底干完一共等了多久？”
   $$T_{\text{turnaround}} = T_{\text{completion}} - T_{\text{arrival}}$$
2. **响应时间（Response Time）**：交互式软件（打字、点击鼠标、Web 请求）最关心的指标——“从按下回车到第一次得到 CPU 响应有多久？”
   $$T_{\text{response}} = T_{\text{first\_run}} - T_{\text{arrival}}$$
3. **吞吐量（Throughput）**：单位时间内完成的总任务数（切换太频繁会白白浪费 CPU 在 `switch_to` 上，拉低吞吐）。
4. **公平性（Fairness）**：不能让某些低优先级或长任务永远饿死（Starvation）。

> [!IMPORTANT]
> **根本冲突**：想让**平均周转时间最短**，往往要把短任务一口气全做完再做长任务（不抢占少切换，吞吐最高）；想让**响应时间极快**，就必须高频切片轮流跑（切换变多，吞吐下降、长任务周转拉长）。几乎所有现代调度器都在这两极之间折中。

---

## 七、经典调度策略：FIFO、SJF、STCF 与时间片轮转 (OS-15)

假设有三个同时到达（$t=0$）的任务：`A` 需要 100ms，`B` 需要 10ms，`C` 需要 10ms。看四种经典策略的戏剧性差距：

1. **FIFO（先进先出 / FCFS）**：先跑完 A (0→100)，再跑 B (100→110)，再跑 C (110→120)。
   - 平均周转时间：$(100 + 110 + 120) / 3 = \mathbf{110\text{ ms}}$！
   - 致命缺陷：**护航效应（Convoy Effect）**——一辆重型大卡车堵在前面，后面几辆轻便小跑车全部跟着干等。
2. **SJF（最短作业优先，非抢占）**：先跑 B (0→10)，再跑 C (10→20)，最后跑 A (20→120)。
   - 平均周转时间：$(10 + 20 + 120) / 3 = \mathbf{50\text{ ms}}$（直降一半多！）。
   - 漏洞：如果 A 在 $t=0$ 先到并已经开跑，B/C 在 $t=5$ 才到，非抢占 SJF 依然只能傻等 A 跑完。
3. **STCF（最短剩余时间优先，抢占式 SJF）**：每当新任务到达，比较“新任务耗时”与“当前任务剩余耗时”，更短就立刻抢占。
   - 理论证明：**在已知各任务总时长的前提下，STCF 能达到全局最小平均周转时间**。
   - 现实短板：第一，OS 根本**无法预知**一个新进程未来要跑几毫秒；第二，响应时间极差（若一直有短任务进来，长任务响应无穷大）。
4. **Round-Robin（时间片轮转 RR）**：设定固定时间片 $q$（如 `10 ms`），每个任务轮流跑 $q$ 毫秒就放回队尾。
   - **响应时间极佳**：如果系统里有 $N$ 个就绪任务，任何新任务最多等 $(N-1)q$ 就能跑上第一口。
   - **时间片 $q$ 的权衡**：$q$ 太小（如 0.1ms），上下文切换开销吃掉大半 CPU；$q$ 太大（如 1s），退化成卡顿的 FIFO。

### 可运行 C++20 模拟器：对比 FIFO / SJF / STCF / RR 的真实指标

```cpp
// 编译: g++ -std=c++20 sched_sim.cpp -o sched_sim
#include <algorithm>
#include <iomanip>
#include <iostream>
#include <queue>
#include <string>
#include <vector>

struct Job {
    std::string name;
    int arrival = 0;
    int burst = 0;
    int remaining = 0;
    int first_run = -1;
    int finish = 0;
};

void report(const char* title, const std::vector<Job>& jobs) {
    double sum_turn = 0, sum_resp = 0;
    for (const auto& j : jobs) {
        sum_turn += (j.finish - j.arrival);
        sum_resp += (j.first_run - j.arrival);
    }
    std::cout << std::left << std::setw(10) << title
              << " | 平均周转=" << std::fixed << std::setprecision(1) << sum_turn / jobs.size()
              << " ms | 平均响应=" << sum_resp / jobs.size() << " ms\n";
}

void sim_fifo(std::vector<Job> jobs) {
    int t = 0;
    for (auto& j : jobs) {
        t = std::max(t, j.arrival);
        j.first_run = t;
        t += j.burst;
        j.finish = t;
    }
    report("FIFO", jobs);
}

void sim_stcf(std::vector<Job> jobs) {
    for (auto& j : jobs) j.remaining = j.burst;
    int t = 0, done = 0, n = static_cast<int>(jobs.size());
    while (done < n) {
        int best = -1;
        for (int i = 0; i < n; ++i) {
            if (jobs[i].arrival <= t && jobs[i].remaining > 0) {
                if (best == -1 || jobs[i].remaining < jobs[best].remaining) best = i;
            }
        }
        if (best == -1) { ++t; continue; }
        if (jobs[best].first_run == -1) jobs[best].first_run = t;
        --jobs[best].remaining;
        ++t;
        if (jobs[best].remaining == 0) { jobs[best].finish = t; ++done; }
    }
    report("STCF", jobs);
}

void sim_rr(std::vector<Job> jobs, int quantum) {
    for (auto& j : jobs) j.remaining = j.burst;
    std::queue<int> q;
    int t = 0, next_idx = 0, done = 0, n = static_cast<int>(jobs.size());
    auto enqueue_arrived = [&] {
        while (next_idx < n && jobs[next_idx].arrival <= t) q.push(next_idx++);
    };
    enqueue_arrived();
    while (done < n) {
        if (q.empty()) { t = jobs[next_idx].arrival; enqueue_arrived(); continue; }
        int id = q.front(); q.pop();
        if (jobs[id].first_run == -1) jobs[id].first_run = t;
        int run = std::min(quantum, jobs[id].remaining);
        jobs[id].remaining -= run;
        t += run;
        enqueue_arrived();
        if (jobs[id].remaining > 0) q.push(id);
        else { jobs[id].finish = t; ++done; }
    }
    report("RR(q=10)", jobs);
}

int main() {
    // A(长任务先到) vs B/C(短任务后到)
    std::vector<Job> workload{{"A", 0, 100}, {"B", 5, 10}, {"C", 5, 10}};
    sim_fifo(workload);
    sim_stcf(workload);
    sim_rr(workload, 10);
    return 0;
}
```

---

## 八、多级反馈队列（MLFQ）：无需预知运行时间的自适应调度 (OS-16)

既然操作系统**不知道**一个任务未来要跑多久，那怎么兼顾“短任务/交互任务周转快、响应快”和“长计算任务不饿死”？

*OSTEP* 推崇的经典答案是**多级反馈队列（MLFQ, Multi-Level Feedback Queue）**——**用过去的行为预测未来**！就像机场安检的多条通道：

```text
  优先级高  Q2: [ 交互任务 T3 ] ──▶ 时间片 10ms，用完配额降级到 Q1
  优先级中  Q1: [ 刚降级 T2 ]   ──▶ 时间片 20ms，用完配额降级到 Q0
  优先级低  Q0: [ 长计算 T1 ]   ──▶ 时间片 40ms，每过 S ms 全员重置回 Q2 防饿死！
```

### MLFQ 黄金五法则

1. **法则 1**：若优先级 `P(A) > P(B)`，先跑 `A`（不跑 `B`）。
2. **法则 2**：若 `P(A) == P(B)`，同一队列内按 Round-Robin 轮流跑。
3. **法则 3（新兵优待）**：任务刚进入系统时，放在**最高优先级队列**（假定它可能是个交互短任务）。
4. **法则 4（反作弊降级）**：一旦某任务在该优先级队列**累计耗尽时间配额**（注意：**累计**，防止程序故意在 9.9ms 时主动 `yield` 或做假 I/O 赖在高优先级不走！），就降一级；如果没耗尽就因为等待键盘/网络 I/O 主动阻塞了，醒来后**保持原高优先级**。
5. **法则 5（定期提升 Priority Boost）**：每隔一段较长时间 $S$（如 1 秒），把系统里所有任务**全部重新抬回最高优先级队列**。一举解决两大难题：**防止长任务饿死** + 如果批处理任务后来变成交互型也能重新享受高响应！

---

## 九、Linux CFS（完全公平调度器）与实时调度 (OS-17)

现代 Linux 桌面与服务器普通进程（`SCHED_OTHER`）使用的不是固定多级队列，而是 **CFS（Completely Fair Scheduler，完全公平调度器）**（注：Linux 6.6 起正进一步演进为增强型公平延迟调度器 **EEVDF**，核心思想一脉相承）。

### 1. CFS 的极简之美：`vruntime` 与红黑树

CFS 试图在现实硬件上模拟一个“**理想多任务 CPU**”：如果有 $N$ 个同等权重的进程，每个进程在任意瞬间都应该分到 $1/N$ 的 CPU 算力。

为了度量“谁吃得最少”，CFS 给每个线程记一本账——**虚拟运行时间 `vruntime`**（其中 $w_i$ 为该进程优先级对应的权重，基准权重为 `1024`）：

$$\Delta \text{vruntime} = \Delta t_{\text{real}} \times \frac{1024}{w_i}$$

- **`nice` 值（`-20` 到 `+19`，默认 `0`）**：`nice` 越低，权重 $w_i$ 越大（每差 1 级约相差 `1.25` 倍 CPU 份额），`vruntime` 涨得越慢，于是就能分到更多真实 CPU 时间！
- **I/O 交互进程天然优先**：刚睡醒的线程之前没怎么跑，`vruntime` 远远落后于一直疯狂算数的 CPU 密集线程，醒来一进队列就自然排在最前面！

CFS 把所有可运行任务按 `vruntime` 从小到大挂在一棵**红黑树（Red-Black Tree）**上：

```text
               [ vruntime = 50 ]
                /             \
      [ vruntime = 30 ]     [ vruntime = 80 ]
        /
  [ vruntime = 12 ]  ◀── 最左节点 (rb_leftmost) 已用指针缓存！O(1) 选中！
```

每次调度器只需 **$O(1)$** 直接挑走缓存的最左节点（`vruntime` 最小的人）去跑；跑完一个时间片更新它的 `vruntime` 后，再 **$O(\log N)$** 插回红黑树。

### 2. 实时调度类：`SCHED_FIFO` 与 `SCHED_RR`

除了普通 `SCHED_OTHER`，Linux 还提供**硬性插队**的实时调度类（静态优先级 `1`–`99`，**只要有任何一个可运行的实时线程，它永远 100% 抢占所有普通 CFS 线程**）：
- **`SCHED_FIFO`**：先来先服务，一直跑到主动阻塞、让出或被更高静态优先级抢占（如果写出死循环，默认每秒最多只给跑 `0.95s`，靠内核 `sched_rt_runtime_us` 留 `5%` 防止彻底锁死系统）。
- **`SCHED_RR`**：同等静态优先级的实时线程之间按固定时间片轮转。

### 可运行 C++20 模拟：用 `std::set` 直观演绎 CFS `vruntime` 调度

```cpp
// 编译: g++ -std=c++20 cfs_sim.cpp -o cfs_sim
#include <iostream>
#include <set>
#include <string>

struct CfsTask {
    double vruntime;
    int id;
    std::string name;
    int weight; // nice 0 = 1024; nice -5 ≈ 3121; nice +5 ≈ 335
    double real_ms = 0;

    bool operator<(const CfsTask& o) const {
        if (vruntime != o.vruntime) return vruntime < o.vruntime;
        return id < o.id;
    }
};

int main() {
    std::set<CfsTask> rbtree; // C++ std::set 底层正是红黑树！
    rbtree.insert({0.0, 1, "高优渲染(nice=-5)", 3121});
    rbtree.insert({0.0, 2, "普通日志(nice=0)",  1024});
    rbtree.insert({0.0, 3, "后台压缩(nice=+5)", 335});

    // 模拟 100 次 4ms 调度片
    for (int step = 0; step < 100; ++step) {
        auto it = rbtree.begin(); // O(1) 取最左节点 (最小 vruntime)
        CfsTask cur = *it;
        rbtree.erase(it);

        constexpr double slice = 4.0;
        cur.real_ms += slice;
        cur.vruntime += slice * (1024.0 / cur.weight);
        rbtree.insert(cur); // O(log N) 插回红黑树
    }

    for (const auto& t : rbtree) {
        std::cout << t.name << " -> 获配真实 CPU=" << t.real_ms
                  << " ms, vruntime=" << t.vruntime << '\n';
    }
    return 0;
}
```

---

## 十、多核调度、CPU 亲和性、优先级反转与饥饿 (OS-18)

在多核 CPU 上，调度又多了三个高频工程现象：

1. **单队列 SQMS vs 多队列 MQMS**：如果 64 颗核抢同一把全局就绪队列锁，锁竞争会把系统卡死；因此 Linux 给**每颗 CPU 核心配一条独立运行队列（per-CPU Runqueue）**，尽量让线程黏在刚才跑过的核心上（利用 **Cache Affinity**），只当某核闲着没事干时才从忙碌核**工作窃取（Work Stealing / Load Balance）**。
2. **CPU 亲和性（CPU Affinity）**：高频交易或低延迟服务常用 `sched_setaffinity()` / `pthread_setaffinity_np()` 把关键线程**绑死在特定物理核（绑核）**，彻底消灭跨核迁移带来的 L1/L2 Cache 失效和 NUMA 跨节点访存惩罚。
3. **优先级反转（Priority Inversion）**——经典的**火星探路者号故障**元凶：
   ```text
   • 低优先级 L 拿着互斥锁 M 正在执行
   • 高优先级 H 醒来想要锁 M ──▶ 被迫阻塞等待 L 放锁
   • 此时中优先级 M_mid 就绪（不要锁 M）──▶ 抢占了 L！
   结果: M_mid 一直跑，L 拿不到 CPU 放不出锁，导致最高优的 H 无限饿死！
   ```
   **解法**：**优先级继承（Priority Inheritance, `PTHREAD_PRIO_INHERIT`）**——当 H 等在 L 持有的锁上时，内核临时把 L 的优先级**抬升到与 H 一样高**，让 L 不被 M_mid 抢占、赶快干完释放锁，然后恢复 L 原优先级。
4. **饥饿（Starvation） vs 死锁（Deadlock）**：死锁是彼此互等、谁也动不了；**饥饿**是线程本身可运行，但因为优先级太低或调度策略不公，长期排不上 CPU。

### 可运行（Linux / WSL2）：查看/设置当前线程 CPU 亲和性

```cpp
// Linux / WSL2 编译: g++ -std=c++20 affinity_demo.cpp -o affinity_demo
#include <iostream>
#include <sched.h>
#include <unistd.h>

int main() {
    cpu_set_t mask;
    CPU_ZERO(&mask);
    CPU_SET(0, &mask); // 尝试绑定到逻辑核心 CPU 0

    if (::sched_setaffinity(0, sizeof(mask), &mask) == 0) {
        std::cout << "成功绑核到 CPU 0, 当前运行核编号: " << ::sched_getcpu() << '\n';
    } else {
        std::perror("sched_setaffinity");
    }
    return 0;
}
```

---

## 本课微练习 (OS-09 ~ OS-18)

### 练习 1（进程状态与僵尸）
父进程 `fork()` 后进入 `sleep(60)` 而不调用 `waitpid()`，子进程立刻 `return 0;` 退出。在这 60 秒内用 `ps -eo pid,ppid,stat,comm` 观察该子进程处于什么状态？为什么它内存已经释放了却还占着进程表项？

<details>
<summary>核对答案</summary>

子进程处于 **`Z`（`EXIT_ZOMBIE` 僵尸状态）**。因为父进程必须通过 `waitpid()` 读取它的退出码（或终止信号），内核在确认父进程取走这最后的遗言之前，不能回收它的 PID 和 `task_struct` 退出信息。

</details>

### 练习 2（STCF vs RR 算术验证）
假设有 3 个任务在 $t=0$ 同时到达：`J1(10ms)`、`J2(10ms)`、`J3(10ms)`。请分别计算在 **FIFO** 和 **RR（时间片 `q=1ms`）** 下的**平均周转时间**和**平均响应时间**（忽略上下文切换耗时）。

<details>
<summary>核对答案</summary>

- **FIFO**：完成时刻分别为 `10, 20, 30` → 平均周转 `(10+20+30)/3 = 20 ms`；首次运行时刻分别为 `0, 10, 20` → 平均响应 `(0+10+20)/3 = 10 ms`。
- **RR (`q=1ms`)**：三者轮流跑到最后分别在 `28, 29, 30` 完成 → 平均周转 `(28+29+30)/3 = 29 ms`（变差了！）；但首次运行时刻为 `0, 1, 2` → 平均响应 `(0+1+2)/3 = 1 ms`（快了 10 倍！）。

</details>

### 练习 3（MLFQ 防作弊法则）
在早期未修正的 MLFQ 中，有流氓程序在时间片刚用到 `90%` 时故意调一次 `write()` 马上返回，从而一直停留在最高优先级队列霸占 90% CPU。现代 MLFQ 是怎么堵住这个漏洞的？

<details>
<summary>核对答案</summary>

现代 MLFQ 改用**法则 4（累计配额核算）**：内核在每个优先级层记录该任务**累计消耗的 CPU 时间总和**，而不是看它单次主动放弃前用了多久。一旦累计用完该层配额，无论中途主动让出过多少次，照样降级。

</details>

### 练习 4（Linux CFS `vruntime` 与优先级反转）
1. 在 Linux CFS 中，一个一直等待键盘输入的编辑器线程和一个持续做视频编码的线程同时就绪时，谁的 `vruntime` 更小？谁会被先调度？
2. 火星探路者号遇到的优先级反转中，中优先级线程为什么能间接卡死高优先级线程？

<details>
<summary>核对答案</summary>

1. 编辑器线程之前长期在睡眠，它的 **`vruntime` 明显更小**，醒来后会立刻排在红黑树最左端，被 CFS 第一时间优先调度，从而保证桌面交互响应极快。
2. 因为高优先级线程 H 正在等低优先级线程 L 释放一把互斥锁，而中优先级线程 M 不需要那把锁却能随时抢占 L 的 CPU，导致 L 迟迟无法运行完临界区并解锁，H 便被间接无限拖延。通过**优先级继承**临时拔高 L 的优先级即可破局。

</details>
