---
title: "第 0 课（零基础）：并发基石、线程创建与生命周期"
description: "用单咖啡师与双咖啡师看懂并发与并行，用阿姆达尔与古斯塔夫森定律估算加速上限，拆解 count++ 三步竞态，全面掌握 std::thread、join/detach 陷阱、std::ref、C++20 std::jthread 协作取消与 thread_local。"
order: 79
category: "并发与性能"
tags: ["零基础", "并发", "std::thread", "jthread", "stop_token", "thread_local"]
related: ["handbook/con-locks-sync", "handbook/concurrency-queue", "handbook/os-zero-start"]
sources: ["con-zero.cpp"]
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：本课并发 vs 并行概念、`++count` 竞态与 `std::thread` 体验可轻松看懂！
> - **写线程池与锁之前去隔壁拿的 3 把钥匙**：① [现代 C++：引用生命周期与 RAII（CPP-09~10）](../lifetime/)；② [Lambda 闭包捕获生命期](../cpp-lambda-chrono/)；③ [操作系统：进程 vs 线程共享内存（OS-09）](../os-process-sched/)。
>
> <details><summary>📚 本科已为你融合的全球 TOP 5 经典精华（无需再买书/翻英文站）</summary>
>
> 1. **《C++ 并发编程实战 (2nd Ed)》**：`thread`/`jthread`、`scoped_lock`、条件变量谓词、`future` 与线程池
> 2. **Preshing on Programming**：Data Race vs Race Condition、Store Buffer 与 `acquire-release` 图解
> 3. **《JCIP》&《Art of Multiprocessor Programming》**：状态封闭、有界队列背压与优雅停机排空设计
> 4. **Mechanical Sympathy (LMAX Disruptor)**：`alignas(64)` 消除伪共享、SPSC 环形缓冲与批处理吞吐
> 5. **《Systems Performance》+ Modern CPUs Tuning**：P50/P99 尾延迟、Amdahl 定律、防 DCE 与 `perf` 火焰图
>
> </details>

## 本课只解决这 1 个问题

以前我们写的程序都是从 `main` 第一行开始，像**单车道**一样一行一行往下跑。现代电脑动辄拥有 8 核、16 核 CPU，如果同时只有一条道干活，其余核心都在围观发呆。

本课带你从零建立**并发与多核并行的完整地基**（对应课程 `CON-01`–`CON-08`）：不仅用 10 行代码请出第二个帮手（线程）一起干活、亲眼看懂为什么 `++count` 会算错账，还要彻底掌握 `std::thread` 生命周期边界、参数传递坑、C++20 `std::jthread` 协作取消，以及线程局部存储 `thread_local`。

### 零基础黑话翻译表

| 黑话 | 生活比喻 | 一句话说清本质 |
| --- | --- | --- |
| **并发（Concurrency）** | **1 位全能咖啡师轮流做 3 杯咖啡** | 逻辑上同时处理多件事（交替推进），单核也能并发 |
| **并行（Parallelism）** | **2 位咖啡师用 2 台咖啡机同时萃取** | 物理上同一瞬间同时执行多条指令流，必须靠多核硬件 |
| **`std::thread`** | **雇一个新厨师开始干活** | `std::thread t(任务);` 一写完，新线程立刻开始独立跑 |
| **`t.join()`** | **等所有厨师收工洗完手，店长再锁门下班** | 主线程停在这里等 `t` 跑完；**不写 `join()` 且不 `detach()` 会直接崩溃！** |
| **数据竞争（Data Race）** | **两个收银员同时看到余额 100，各自加 1 写成 101** | 多线程无同步同时读写同一块非原子内存（至少一写），属于未定义行为 |
| **互斥锁（`std::mutex`）** | **卫生间门钥匙（同一时刻只放 1 个人进去）** | 想改共享变量前必须先拿到锁，用完还锁，其他人排队等 |
| **`std::jthread`（C++20）** | **自带对讲机且下班自动等人的高级员工** | 析构时自动发停止信号并 `join()`，彻底告别漏写 `join()` 的崩溃 |

---

## 并发 vs 并行：单咖啡师与双咖啡师 (CON-01)

新手最常把**并发（Concurrency）**和**并行（Parallelism）**混为一谈。用 Rob Pike 的经典区分来说：
- **并发**是**结构设计**（Dealing with lots of things at once）：把一个大任务拆成多个可独立推进的执行流。
- **并行**是**物理执行**（Doing lots of things at once）：在同一纳秒里，真的有多个 CPU 核心同时在算不同的指令。

想象一家咖啡店：
1. **单咖啡师（1 核并发，无并行）**：店里只有 1 位咖啡师和 1 台机器。他先按下磨豆机，在等待咖啡粉落下的 2 秒里转身打奶泡；等牛奶加热时再去收银台点单。**同一瞬间他只做一件事**，但通过**交替切换**，3 位客人的订单都在向前推进——这就是**并发**。
2. **双咖啡师（2 核既并发又并行）**：店里请了 2 位咖啡师、配了 2 台咖啡机。同一秒内，咖啡师 A 在拉花，咖啡师 B 在萃取浓缩——这就是**并行**。

```text
单核并发（时间片交替，Concurrent but NOT Parallel）：
Core 0: [任务 A 算 2ms]──[任务 B 算 2ms]──[任务 A 算 2ms]──[任务 B 算 2ms]──▶ 时间

双核并行（真正同时执行，Concurrent AND Parallel）：
Core 0: [任务 A 持续计算 4ms ──────────────────────────]──▶ 时间
Core 1: [任务 B 持续计算 4ms ──────────────────────────]──▶ 时间
```

**关键结论**：
- **即使只有 1 个 CPU 核心，并发依然有用**：比如线程 A 在等磁盘读文件或等网络数据包（阻塞挂起）时，CPU 可以立刻切去跑线程 B 的计算，不让核心空转。
- **反过来，就算有 16 核 CPU，如果你的程序是单线程串行结构，也绝不可能获得并行加速**——并发架构是并行的前提。

---

## 加速比天花板：Amdahl 定律与 Gustafson 定律 (CON-02)

花钱把服务器从 1 核升级到 16 核，LogScan 扫描日志是不是就能快 16 倍？**绝对不是！** 决定加速上限的是两张截然不同的数学视角。

### 1. Amdahl 定律（固定总工作量下的悲观上限）

假设一个任务原本在单核上跑完需要 100 秒，其中有比例 $p$（比如 80%）可以完全并行，剩下的 $1 - p$（20%，比如打开文件、解析参数、最终汇总排序）**必须串行执行**。现在投入 $s$ 个 CPU 核心，总耗时变成 $(1 - p) + \frac{p}{s}$，加速比 $S_{\text{latency}}(s)$ 为：

$$S_{\text{latency}}(s) = \frac{1}{(1 - p) + \frac{p}{s}}$$

就算你有**无穷多核**（$s \to \infty$），$\frac{p}{s} \to 0$，极限加速比也被串行部分死死锁死在：

$$\lim_{s \to \infty} S_{\text{latency}}(s) = \frac{1}{1 - p}$$

套入真实工程数字感受一下：

| 串行比例 $1 - p$ | 4 核加速比 | 16 核加速比 | 64 核加速比 | 无穷核极限 |
| --- | --- | --- | --- | --- |
| **50%**（一半没法并行） | 1.60× | 1.88× | 1.97× | **2.00×** |
| **10%**（看似很少了） | 3.08× | 6.40× | 8.77× | **10.00×** |
| **5%** | 3.48× | 9.14× | 15.42× | **20.00×** |
| **1%** | 3.88× | 13.91× | 39.26× | **100.00×** |

> **Amdahl 的工程警示**：如果程序里有 10% 的时间花在争抢同一把全局互斥锁上，你买 64 核机器最多也只能快 **8.77 倍**，另外 55 个核的钱几乎全打水漂了。**性能优化的第一刀永远是压低串行比例 $1 - p$！**

### 2. Gustafson 定律（扩大问题规模下的现实乐观）

Amdahl 假设**问题规模固定不变**（比如永远只扫 100 MB 日志）。但现实里有了 16 核集群后，我们不会满足于把 100 MB 缩短到几毫秒，而是用同样的 10 秒预算去扫描 **16 倍大的日志量**（强扩展 vs 弱扩展）。

在 Gustafson 定律中，串行工作耗时固定为 $1 - p$（归一化到并行机时间），并行部分随核心数 $s$ 同步放大工作量，于是**按规模缩放的加速比（Scaled Speedup）**为：

$$S_{\text{scaled}}(s) = (1 - p) + s \cdot p = s - (1 - p)(s - 1)$$

只要把数据量做大，并行占比会自然压倒固定的启动/汇总开销，多核就能持续带来接近线性的吞吐提升。**两定律并不矛盾**：Amdahl 告诉你**单个请求能压到多快**，Gustafson 告诉你**系统总吞吐能撑到多大**。

---

## 为什么线程共享内存 & `count++` 三步竞态演示 (CON-03)

在操作系统里，**进程**像一栋栋独立的厨房（各自有独立的虚拟地址空间，互不干扰），而同一个进程里的多个**线程**，就像**共用同一间大厨房的多位厨师**：
- **共享区域**：全局变量（`.data`/`.bss`）、堆内存（`new`/`malloc`/`std::vector` 底层缓冲区）、打开的文件描述符表（fd）。通信极快（直接传指针或引用），但也极易踩踏！
- **线程私有区域**：每个线程独立的**调用栈（Stack）**、CPU 寄存器现场（程序计数器 PC、栈指针 SP），以及 `thread_local` 变量。

在练习目录新建 `con-zero.cpp` 并写入下面这段破冰源码，看看最简多线程如何协作与加锁：

{{example:con-zero.cpp}}

编译并运行（Windows MinGW / Linux `g++`）：

```bash
# Linux / WSL2 需要加 -pthread（Windows MinGW g++ 通常内置或自动链接）
g++ -std=c++20 -Wall -Wextra -Wpedantic -pthread con-zero.cpp -o con-zero
./con-zero
```

输出示例（两个帮手打印先后顺序每次可能不同，因为调度器并发运行）：

```text
[帮手 2] 正在并行扫描后半段日志
[帮手 1] 正在并行扫描前半段日志
存钱罐最终余额 (预期 200000): 200000
```

### 亲眼见证竞态：为什么 `++count` 会丢数据？

如果把 `con-zero.cpp` 里的 `bank_mu` 锁删掉，让两个线程直接对普通 `int count = 0` 各加 100,000 次，跑出来往往是 `134892`、`162019` 之类每次都不一样的错账！

原因在于，高级语言里看起来只有一行的 `++count;`，编译成 CPU 机器指令后其实是**可被打断的 3 个独立步骤**（Load → Add → Store）：

```text
时刻   线程 A (想加 1)             线程 B (想加 1)             内存里的 count
T1     ① Load: 从内存读出 100     —                           100
T2     —                         ① Load: 也读出 100（撞车！）  100
T3     ② Add:  寄存器算出 101     ② Add:  寄存器算出 101       100
T4     ③ Store: 把 101 写回内存   —                           101
T5     —                         ③ Store: 把 101 写回内存！    101 ← A 的那 1 次被覆盖蒸发了！
```

下面这段可运行代码特意对比**无锁竞态**、**互斥锁保护**与**零竞争局部归并**三种写法（注意：无锁版存在数据竞争 UB，仅用于课堂反面观察，实际工程严禁这么写）：

```cpp
#include <iostream>
#include <mutex>
#include <thread>

int main() {
    constexpr int kIters = 200000;

    // 1. 反面教材：无同步共享写（数据竞争 UB，结果往往远小于 400000）
    int broken_count = 0;
    {
        std::thread t1([&] { for (int i = 0; i < kIters; ++i) ++broken_count; });
        std::thread t2([&] { for (int i = 0; i < kIters; ++i) ++broken_count; });
        t1.join();
        t2.join();
    }

    // 2. 正确但有锁开销：每次用 mutex 保护临界区
    int locked_count = 0;
    std::mutex mu;
    {
        std::thread t1([&] {
            for (int i = 0; i < kIters; ++i) {
                std::lock_guard<std::mutex> lk(mu);
                ++locked_count;
            }
        });
        std::thread t2([&] {
            for (int i = 0; i < kIters; ++i) {
                std::lock_guard<std::mutex> lk(mu);
                ++locked_count;
            }
        });
        t1.join();
        t2.join();
    }

    // 3. 工程最优：各自用栈上局部变量累加，join 后再汇总（零锁竞争）
    int local1 = 0, local2 = 0;
    {
        std::thread t1([&] { for (int i = 0; i < kIters; ++i) ++local1; });
        std::thread t2([&] { for (int i = 0; i < kIters; ++i) ++local2; });
        t1.join();
        t2.join();
    }

    std::cout << "无锁错误结果: " << broken_count << " (预期 400000)\n";
    std::cout << "加锁正确结果: " << locked_count << '\n';
    std::cout << "局部归并结果: " << (local1 + local2) << '\n';
    return 0;
}
```

---

## 创建你的第一个线程：`std::thread` 与可调用对象 (CON-04)

`<thread>` 里的 `std::thread` 接收**任何可调用对象（Callable）**及其参数，一旦构造完成，操作系统线程**立即启动**（不需要额外调用 `start()`）。常见有 3 种写法：

```cpp
#include <chrono>
#include <iostream>
#include <thread>
#include <vector>

void free_func(int id) {
    std::cout << "普通函数线程 id=" << id << '\n';
}

struct FunctorTask {
    void operator()(int n) const {
        std::cout << "仿函数线程 n=" << n << '\n';
    }
};

int main() {
    // 1. 普通函数
    std::thread t1(free_func, 1);

    // 2. 仿函数对象（注意避开 Most Vexing Parse：用花括号或额外括号）
    std::thread t2{FunctorTask{}, 2};

    // 3. Lambda 表达式（日常最常用）
    std::thread t3([] {
        std::cout << "Lambda 线程 TID=" << std::this_thread::get_id() << '\n';
        std::this_thread::sleep_for(std::chrono::milliseconds(10));
    });

    t1.join();
    t2.join();
    t3.join();

    // 4. std::thread 不可拷贝，但可以 move 进容器统一管理
    std::vector<std::thread> pool;
    for (int i = 0; i < 3; ++i) {
        pool.emplace_back([i] {
            std::cout << "批量线程 #" << i << '\n';
        });
    }
    for (auto& t : pool) {
        t.join();
    }
    return 0;
}
```

> **C++ 经典语法坑（Most Vexing Parse）**：如果你写 `std::thread t(FunctorTask());`，编译器会把它解析成**一个函数声明**（函数名叫 `t`，参数是一个返回 `FunctorTask` 的函数指针）！请养成用大括号 `std::thread t{FunctorTask{}};` 或 Lambda 的习惯。

---

## 生命周期死刑陷阱：`join()` vs `detach()` (CON-05)

每一个刚刚创建出来的 `std::thread` 都处于 **joinable（可汇合）** 状态（`t.joinable() == true`）。在 `t` 这个 C++ 对象被销毁前，你**必须**二选一表态，否则 `~thread()` 会直接调用 `std::terminate()` 强杀整个进程：

```text
std::thread t(fn);  ──→  t.joinable() == true
                              │
         ┌────────────────────┴────────────────────┐
         ▼                                         ▼
   调用 t.join()                              调用 t.detach()
  (阻塞等待线程跑完)                         (断绝父子关系，后台孤儿运行)
         │                                         │
         ▼                                         ▼
  t.joinable() == false                     t.joinable() == false
  所有局部变量已安全收尾                    main 退出时 OS 强行杀死它！
```

### 陷阱 1：中间抛异常或提前 `return`，漏掉 `join()`

```cpp
void dangerous_spawn() {
    std::thread t([] { /* 耗时任务 */ });
    if (true /* 某种错误条件 */) {
        return; // 惨案！离开作用域销毁 t 时仍是 joinable，立刻 std::terminate() 崩溃！
    }
    t.join();
}
```

在 C++20 之前，必须手写 **RAII 守卫类** 来保证异常安全：

```cpp
class ThreadGuard {
public:
    explicit ThreadGuard(std::thread& t) : t_(t) {}
    ~ThreadGuard() {
        if (t_.joinable()) {
            t_.join();
        }
    }
    ThreadGuard(const ThreadGuard&) = delete;
    ThreadGuard& operator=(const ThreadGuard&) = delete;
private:
    std::thread& t_;
};
```

### 陷阱 2：滥用 `detach()` 导致悬空引用（Use-After-Free）

`detach()` 会让线程在后台独立运行，C++ 对象不再管理它。新手最容易犯的致命错误是**按引用捕获局部变量后 `detach()`**：

```cpp
void catastrophic_detach() {
    int local_data = 42;
    std::thread t([&local_data] {
        std::this_thread::sleep_for(std::chrono::milliseconds(50));
        // 50ms 后外层函数早已返回，local_data 的栈内存已经被覆盖或回收！
        std::cout << local_data << '\n'; // 未定义行为（UB）：读到垃圾值或段错误！
    });
    t.detach();
} // local_data 在此处销毁！
```

**工程铁律**：
1. 后台线程如果需要访问外部数据，**要么按值拷贝/移动所有权进线程，要么用 `std::shared_ptr` 共同续命**。
2. 除非你明确需要进程级守护线程且能承受它随时被 `main` 退出强杀，否则**几乎永远不要用 `detach()`**——使用 `join()` 或 C++20 `std::jthread`！

---

## 参数传递陷阱：值传递、`std::ref` 与成员函数 (CON-06)

`std::thread` 构造函数的内部机制**总是先把实参 decay（退化）拷贝或移动**到新线程专属的内部存储区，再从内部存储区把参数转发给目标函数。这会带来三个意想不到的坑：

### 坑 1：函数要引用 `int&`，为什么传了变量却没改动（或直接编译报错）？

```cpp
#include <functional>
#include <iostream>
#include <thread>

void add_ten(int& x) { x += 10; }

int main() {
    int val = 5;
    // std::thread t_err(add_ten, val); // 编译失败！内部转发的是右值副本，绑不到非 const 左值 int&！

    // 必须用 std::ref 显式打包成 reference_wrapper 传递！
    std::thread t_ok(add_ten, std::ref(val));
    t_ok.join();
    std::cout << "val = " << val << '\n'; // 输出 15
    return 0;
}
```

### 坑 2：隐式类型转换发生在“新线程里”导致悬空指针！

```cpp
void print_msg(int id, const std::string& s) {
    std::cout << id << ": " << s << '\n';
}

void subtle_dangling(int id) {
    char buf[64] = "hello log";
    // 危险！std::thread 拷贝的是 const char* 指针，而非 std::string！
    // 若 subtle_dangling 在新线程把 buf 转成 std::string 之前就返回了，buf 已经销毁！
    // std::thread t(print_msg, id, buf);

    // 正确做法：在主线程当场显式构造出 std::string 再移交进去
    std::thread t(print_msg, id, std::string(buf));
    t.join();
}
```

### 坑 3：传递只可移动对象（`std::unique_ptr`）与成员函数指针

```cpp
#include <iostream>
#include <memory>
#include <string>
#include <thread>

struct LogWorker {
    void process(int shard, std::unique_ptr<std::string> payload) {
        std::cout << "分片 " << shard << " 处理: " << *payload << '\n';
    }
};

int main() {
    LogWorker worker;
    auto msg = std::make_unique<std::string>("ERROR disk full");

    // 成员函数语法：&类名::方法名, 对象指针(或 shared_ptr), 后续参数...
    // unique_ptr 不能拷贝，必须 std::move 移交所有权
    std::thread t(&LogWorker::process, &worker, 3, std::move(msg));
    t.join(); // 务必保证 worker 活到 join() 之后！
    return 0;
}
```

---

## C++20 救星：`std::jthread` 与 `std::stop_token` 协作取消 (CON-07)

既然手动写 `ThreadGuard` 繁琐、手动用 `std::atomic<bool> stop` 又唤醒不了睡着的线程，C++20 一次性带来了完美的解决方案：**`std::jthread`**（Joining Thread）+ **`std::stop_token`**。

`std::jthread` 比 `std::thread` 多做两件核心大事：
1. **析构自动收尾**：`~jthread()` 内部先自动调用 `request_stop()`，再自动 `join()`。无论前面有没有抛异常或提前 `return`，绝不发生 `std::terminate()`！
2. **标准化的协作取消协议**：如果任务函数的**第一个参数**接收 `std::stop_token`，`jthread` 会自动把内置的取消令牌传给它；主线程（或析构函数）通过 `request_stop()` 优雅发信号。

```cpp
#include <chrono>
#include <iostream>
#include <stop_token>
#include <thread>

int main() {
    // 接收 std::stop_token 作为第一个参数
    std::jthread worker([](std::stop_token st) {
        // 还可以注册“一旦收到取消信号立刻触发”的回调函数
        std::stop_callback cb(st, [] {
            std::cout << "[回调] 收到停止请求，准备清理连接...\n";
        });

        int tick = 0;
        while (!st.stop_requested()) {
            std::cout << "工作中... tick=" << ++tick << '\n';
            std::this_thread::sleep_for(std::chrono::milliseconds(40));
        }
        std::cout << "worker 优雅收尾退出！\n";
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(130));
    std::cout << "主线程通知停止\n";
    worker.request_stop(); // 可显式请求停止；即使不写，离开作用域析构时也会自动调用并 join！
    return 0;
}
```

> **为什么叫“协作式”取消，而不是直接 `TerminateThread` / `pthread_cancel`？**
> 因为暴力强杀一个正在干活的线程，会导致它手里拿着的 `std::mutex` 永远没机会解锁、堆内存和文件句柄来不及释放，整个进程直接陷入死锁或状态损坏。**只有让工作线程自己在安全点检查 `stop_token` 主动收尾，才能保住资源不变量。**

---

## 线程局部存储 `thread_local` 与硬件并发度 (CON-08)

### 1. `thread_local`：给每位厨师发一把自己的计算器

有些数据你不想在线程间共享，但又想在线程内部跨多个函数调用复用（比如每个线程独立的错误缓冲、随机数生成器 `std::mt19937`、或每线程局部计数器），这时用 **`thread_local`** 修饰变量：
- 每个线程在首次使用（或启动）时拥有一份**完全独立、互不干扰的实例**。
- 线程退出时自动析构。
- **零锁、零原子开销、零伪共享（通常各自在线程 TLS 区域）**。

```cpp
#include <iostream>
#include <mutex>
#include <thread>

thread_local int tls_hits = 0; // 每个线程各自有一份 tls_hits，互不踩踏！
std::mutex io_mu;

void record_hit(const char* name) {
    ++tls_hits; // 不需要加任何锁
    std::lock_guard<std::mutex> lk(io_mu);
    std::cout << name << " 本线程累计命中: " << tls_hits << '\n';
}

int main() {
    std::jthread t1([] { record_hit("T1"); record_hit("T1"); });
    std::jthread t2([] { record_hit("T2"); });
    t1.join();
    t2.join();
    std::cout << "main 线程命中: " << tls_hits << '\n'; // 依然是 0！
    return 0;
}
```

### 2. `std::thread::hardware_concurrency()`：到底该开多少个线程？

线程并不是越多越好！每个线程都要吃掉大约 1–8 MB 虚拟栈空间，线程数远超 CPU 核心数时，频繁的上下文切换和缓存抖动反而会让吞吐暴跌。

C++ 提供了硬件并发度提示函数：

```cpp
unsigned int hw = std::thread::hardware_concurrency();
unsigned int num_threads = (hw == 0) ? 4 : hw; // 标准允许无法探测时返回 0，务必兜底！
```

**工程选型经验法则**：
- **纯 CPU 密集型**（日志正则解析、压缩、矩阵计算）：线程数 $\approx N_{\text{cores}}$（或考虑超线程后的 `hardware_concurrency()`，再按实测调优）。
- **I/O 密集型**（阻塞读盘、同步 RPC）：若单个请求有大量时间在阻塞等待，线程数通常需要大于核数（理想情况下改用 `epoll`/`io_uring`/协程等异步 I/O，少量线程即可支撑数万并发）。

---

## 本课常见坑与微练习

### 3 个高频踩坑自检
1. **忘了在 Linux 编译加 `-pthread`**：出现 `undefined reference to 'pthread_create'` → 编译命令加 `-pthread`（CMake 链接 `Threads::Threads`）。
2. **`std::thread` 传引用漏写 `std::ref`**：编译报错或改的是副本，原变量纹丝不动。
3. **析构未 `join` / 未 `detach` 的 `std::thread`**：程序直接 `Aborted (core dumped)` → 统一首选 `std::jthread`。

### 练习 1（分段并行求和，核对生命期）
编写一个 C++20 程序，用 2 个 `std::jthread` 分别计算 `1..10` 和 `11..20` 的整数和，把结果写进各自独立的输出槽位（使用 `std::ref` 或指针），汇合后断言两段和分别等于 `55` 和 `155`，总和等于 `210`。

<details>
<summary>核对答案</summary>

```cpp
#include <cassert>
#include <iostream>
#include <thread>

void sum_range(int lo, int hi, int& out) {
    int acc = 0;
    for (int i = lo; i <= hi; ++i) acc += i;
    out = acc;
}

int main() {
    int r1 = 0, r2 = 0;
    {
        std::jthread t1(sum_range, 1, 10, std::ref(r1));
        std::jthread t2(sum_range, 11, 20, std::ref(r2));
    } // 离开作用域自动 join，保证 r1 和 r2 写完且线程已退出
    assert(r1 == 55 && r2 == 155);
    std::cout << "total = " << (r1 + r2) << '\n';
    return 0;
}
```
注意：`r1` 和 `r2` 必须定义在 `jthread` 作用域**外层**，这样才会**先销毁并 join 线程，后销毁 `r1`/`r2`**！

</details>

### 练习 2（Amdahl 估算）
某程序单核耗时 100 秒，其中 25 秒为无法并行的串行初始化与汇总。请问投入 8 核和无穷核时，理论极限加速比分别是多少？

<details>
<summary>核对答案</summary>

$1 - p = 0.25$，$p = 0.75$：
- 8 核：$S(8) = \frac{1}{0.25 + 0.75 / 8} = \frac{1}{0.34375} \approx 2.91\times$
- 无穷核：$\lim_{s \to \infty} S(s) = \frac{1}{0.25} = 4.00\times$

</details>

### 下一步怎么走
现在你已经能让多线程安全启动并按时收尾，但只要它们开始碰**同一份共享数据**，光靠 `std::lock_guard` 还远远不够——多把锁会死锁，等待状态会空转烧 CPU。进入下一课 [互斥锁、死锁防线与线程同步原语](../con-locks-sync/)！
