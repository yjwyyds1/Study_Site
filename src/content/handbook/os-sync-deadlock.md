---
title: "并发同步原语、经典同步问题与死锁防治"
description: "从丢失更新与临界区三准则出发，拆解硬件原子指令 TAS/CAS/LL-SC、自旋锁 vs futex 睡眠锁、C++20 信号量、Mesa 语义条件变量、三大经典同步模型及 Coffman 死锁四条件、银行家算法直觉与等待图环检测。"
order: 73
category: "操作系统"
tags: ["操作系统", "并发同步", "CAS", "自旋锁", "信号量", "条件变量", "死锁", "银行家算法"]
related: ["handbook/os-process-sched", "handbook/concurrency-queue", "handbook/con-zero-start", "handbook/os-process-vmem"]
sources: []
---

## 本篇解决的核心问题 (OS-19 ~ OS-27)

同一间厨房里的两位厨师共用一本记账黑板：两人都看到余额 `100`，各自加 `1` 后写回 `101`——最后黑板上居然不是 `102`，而是 **`101`**！更可怕的是，厨师 A 攥着盐罐等酱油，厨师 B 攥着酱油等盐罐，整间厨房瞬间僵死。

本篇覆盖 **`OS-19` 至 `OS-27`**，带你从一条汇编指令的分裂交错一路走到硬件原子锁、信号量、管程与死锁防线。

---

## 一、并发为何会出错：竞态条件、丢失更新与指令重排 (OS-19)

在 C++ 里写下 `counter++;` 看似只有一行，但在 CPU 眼里，它被拆成了**三条非原子的机器指令**（读-改-写，Read-Modify-Write）：

```text
  线程 A (核 1 / 或分时抢占)               线程 B (核 2 / 或接替运行)
  ──────────────────────────────         ──────────────────────────────
  1. mov eax, [counter]  (读入 100)
  ──▶ [时钟中断抢占！保存 eax=100] ──▶
                                         1. mov eax, [counter]  (也读入 100!)
                                         2. add eax, 1          (eax = 101)
                                         3. mov [counter], eax  (写回 101)
  ◀── [切回线程 A，恢复 eax=100] ◀──
  2. add eax, 1          (eax = 101)
  3. mov [counter], eax  (写回 101 —— 把线程 B 的 +1 彻底覆盖丢失！)
```

这就是**丢失更新（Lost Update）**与**竞态条件（Race Condition）**：最终结果竟然取决于操作系统调度器切走指令的随机时序！

> [!CAUTION]
> **新手高频误区：`volatile` 不是原子锁！**  
> 在 C++ 里，`volatile` 只告诉编译器“别把内存读写优化进寄存器”（用于硬件 MMIO 寄存器或信号处理），它**既不保证读-改-写原子性，也不禁止多核 CPU 乱序重排可见性**。多线程共享计数必须用 `std::atomic` 或互斥锁！

### 可运行 C++20 实验：亲眼见证 100 万次加法算丢账

```cpp
// 编译: g++ -O2 -std=c++20 -pthread race_demo.cpp -o race_demo
#include <atomic>
#include <iostream>
#include <thread>

int g_broken = 0;                 // 非同步共享变量：未定义行为 (Data Race)
std::atomic<int> g_atomic{0};     // 硬件锁总线/缓存一致性原子指令

int main() {
    constexpr int N = 500'000;
    auto work = [&] {
        for (int i = 0; i < N; ++i) {
            ++g_broken;
            g_atomic.fetch_add(1, std::memory_order_relaxed);
        }
    };
    {
        std::jthread t1(work);
        std::jthread t2(work);
    }
    std::cout << "预期总和:   " << 2 * N << '\n';
    std::cout << "普通 int:   " << g_broken << " (通常大幅少于预期！)\n";
    std::cout << "atomic<int>: " << g_atomic.load() << " (严格精确)\n";
    return 0;
}
```

---

## 二、临界区设计三准则：互斥、前进与有限等待 (OS-20)

任何访问共享可变状态的那段代码被称为**临界区（Critical Section）**。操作系统教材对一个合格的同步协议提出**三条硬性数学准则**：

| 准则 | 通俗含义 | 违背后会出什么事？ |
| --- | --- | --- |
| **1. 互斥（Mutual Exclusion）** | 任意时刻最多只有 **1 个**执行流处于临界区内 | 发生竞态条件、数据损坏、算错账 |
| **2. 前进 / 空闲让进（Progress）** | 如果临界区无人占用，想进的人必须能在有限步内选出一人进去，外部无关线程不能拦着 | 锁明明空闲却大家一起傻等（活锁 / 死锁） |
| **3. 有限等待（Bounded Waiting）** | 一个线程提出进入请求后，在它获准进入前，别的线程插队进入的次数必须有上界 | 某个倒霉线程永远抢不到锁（**饥饿 Starvation**） |

### 软件层面的经典尝试：Peterson 算法（以及为何现代 CPU 需要内存屏障）

1981 年 Gary Peterson 仅靠两个普通布尔标记 `flag[2]` 和一个谦让变量 `turn` 就完美满足了双线程三准则：

```cpp
// 编译: g++ -O2 -std=c++20 -pthread peterson.cpp -o peterson
#include <atomic>
#include <iostream>
#include <thread>

// 若用普通 bool/int，现代 CPU Store Buffer 乱序会把写 flag 和读对方 flag 重排，破坏互斥！
// 使用 std::atomic (默认 seq_cst) 自动插入硬件内存屏障。
struct PetersonLock {
    std::atomic<bool> flag[2]{{false}, {false}};
    std::atomic<int> turn{0};

    void lock(int id) {
        int other = 1 - id;
        flag[id].store(true, std::memory_order_seq_cst);
        turn.store(other, std::memory_order_seq_cst); // 礼貌谦让：你先请
        while (flag[other].load(std::memory_order_seq_cst) &&
               turn.load(std::memory_order_seq_cst) == other) {
            // 忙等对方退出或把 turn 让回来
        }
    }
    void unlock(int id) {
        flag[id].store(false, std::memory_order_seq_cst);
    }
};

int main() {
    PetersonLock lk;
    int shared = 0;
    auto run = [&](int id) {
        for (int i = 0; i < 200'000; ++i) {
            lk.lock(id);
            ++shared;
            lk.unlock(id);
        }
    };
    {
        std::jthread t0(run, 0);
        std::jthread t1(run, 1);
    }
    std::cout << "Peterson 保护结果: " << shared << " (预期 400000)\n";
    return 0;
}
```

---

## 三、硬件原子原语与锁实现：TAS、CAS、LL/SC、自旋锁与睡眠锁 (OS-21)

纯软件协议只能管 2 个线程且依赖沉重的内存屏障；现代 OS 的锁全靠 **CPU 硅芯片直接提供“单条不可打断的读-改-写指令”**：

1. **Test-And-Set（`TAS` / x86 `xchg`）**：原子地把内存设为 `1` 并返回旧值。只有拿到旧值 `0` 的线程抢锁成功。
2. **Compare-And-Swap（`CAS` / x86 `lock cmpxchg` / C++ `compare_exchange_weak`）**：如果 `*addr == expected`，原子替换为 `desired` 并返回 `true`，否则把真实值写回 `expected` 返回 `false`。它是所有无锁队列（Lock-Free）的基石（注意经典 **ABA 问题**：值从 A 改成 B 又改回 A，CAS 误以为没变，工程上常配版本号打包解决）。
3. **Load-Linked / Store-Conditional（`LL/SC`，ARM / RISC-V 常用）**：`LL` 读值并做缓存行监视，`SC` 只在期间无人修改该地址时才写入成功；天然避免部分 ABA 场景。

### 自旋锁（Spinlock）vs 公平票据锁（Ticket Lock）vs 睡眠互斥锁（`futex`）

```text
  [自旋锁 Spinlock]                         [睡眠互斥锁 Mutex (Linux futex)]
   抢不到锁？──▶ 原地 while 死循环空转！     抢不到锁？──▶ 进内核挂入等待队列 (Blocked 休眠)
   • 不进内核、无上下文切换 (~几十 ns)       • 释放 CPU 给别人跑，不烧电
   • 适用: 临界区极短 (几百 ns) 且多核场景   • 适用: 临界区较长 / 涉及 I/O / 单核环境
   • 陷阱: 单核用自旋锁直接死锁自己！        • 优化: futex 无竞争时纯用户态原子操作，零系统调用！
```

- **为什么简单 `TAS` 自旋锁扩展性差？** 每次空转都执行写指令 `xchg`，导致所有核心的 CPU Cache 一致性总线疯狂互相作废缓存行（Cache Coherency Storm）。改进版 **TTAS（Test-and-Test-and-Set）** 先用只读 `load` 窥探直到锁变 `0` 再去抢；而 **Ticket Lock（银行叫号机）** 则完美补上了**有限等待（FIFO 公平性）**。

### 可运行 C++20 实现：公平叫号自旋锁（Ticket Spinlock）

```cpp
// 编译: g++ -O2 -std=c++20 -pthread ticket_spinlock.cpp -o ticket_spinlock
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

class TicketSpinlock {
    std::atomic<unsigned> next_ticket_{0};
    std::atomic<unsigned> now_serving_{0};
public:
    void lock() {
        unsigned my = next_ticket_.fetch_add(1, std::memory_order_relaxed);
        while (now_serving_.load(std::memory_order_acquire) != my) {
            // 在现代 x86 上可加 _mm_pause() 提示超线程让出流水线
        }
    }
    void unlock() {
        now_serving_.fetch_add(1, std::memory_order_release);
    }
};

int main() {
    TicketSpinlock spin;
    int total = 0;
    std::vector<std::jthread> workers;
    for (int i = 0; i < 4; ++i) {
        workers.emplace_back([&] {
            for (int k = 0; k < 100'000; ++k) {
                spin.lock();
                ++total;
                spin.unlock();
            }
        });
    }
    workers.clear();
    std::cout << "TicketSpinlock 最终结果: " << total << " (预期 400000)\n";
    return 0;
}
```

---

## 四、信号量（Semaphore）：计数信号量、二值信号量与 `wait/post` (OS-22)

1965 年 Dijkstra 发明的**信号量（Semaphore）**就像停车场入口的**剩余车位电子牌**：里面是一个整数计数器 `S` 加一条等待队列，只支持两个原子操作：

- **`P()` / `wait()` / C++ `acquire()`**：车进门，`S--`。若减去前已是 `0`（没空位了），当前线程**阻塞休眠**直到别人叫醒它。
- **`V()` / `post()` / C++ `release()`**：车出门，`S++`。若有车在门口阻塞等待，顺便唤醒其中一辆。

| 类型 | 初值 | 常见用途 | 与 `std::mutex` 的核心区别 |
| --- | :---: | --- | --- |
| **计数信号量** (`std::counting_semaphore`) | `N > 1` | 控制最大并发数（如数据库连接池最多同时开 `N` 个连接、有界队列槽位计数） | 互斥锁只有 0/1；信号量可表达任意资源配额 |
| **二值信号量（锁用法）** (`std::binary_semaphore`) | `1` | 简化互斥访问 | **无所有权概念**：线程 A `acquire` 后，居然允许线程 B 调用 `release`！而 `mutex` 必须谁加锁谁解锁（从而支持优先级继承） |
| **二值信号量（信号用法）** | **`0`** | **执行顺序同步（Ordering）**：线程 A 先完成初始化后 `release()`，线程 B 在 `acquire()` 等到事件再起步 | 极其优雅！哪怕先 `release()` 再 `acquire()` 也不会丢信号（计数变为 1） |

### 可运行 C++20 代码：用 `<semaphore>` 做事件顺序同步与并发限流

```cpp
// 编译: g++ -std=c++20 -pthread semaphore_demo.cpp -o semaphore_demo
#include <chrono>
#include <iostream>
#include <semaphore>
#include <thread>
#include <vector>

int main() {
    // 1. 初值为 0：用于线程间“准备就绪”事件接力
    std::binary_semaphore ready_sig{0};
    int payload = 0;

    std::jthread producer([&] {
        payload = 2026;
        ready_sig.release(); // 通知消费者数据已准备好
    });
    std::jthread consumer([&] {
        ready_sig.acquire(); // 等到信号才读 payload
        std::cout << "接力收到 payload=" << payload << '\n';
    });
    producer.join();
    consumer.join();

    // 2. 计数信号量：允许最多 2 个线程同时进入“停车场”
    std::counting_semaphore<2> parking_lot{2};
    std::vector<std::jthread> cars;
    for (int i = 1; i <= 5; ++i) {
        cars.emplace_back([&, i] {
            parking_lot.acquire();
            std::cout << "车辆 " << i << " 停入车位\n";
            std::this_thread::sleep_for(std::chrono::milliseconds(30));
            parking_lot.release();
        });
    }
    return 0;
}
```

---

## 五、条件变量与管程（Monitor）：为什么 Mesa 语义必须用 `while` 重检 (OS-23)

信号量虽然强大，但在表达复杂条件（如“队列非空 **且** 未关闭”）时容易绕晕。**管程（Monitor）**把“共享数据 + 保护它的互斥锁 + 唤醒等待的条件变量”封装成一个安全模块。

使用 `std::condition_variable` 时，**为什么书上铁律要求永远写 `while (!ready) cv.wait(lk);`（或等价 `cv.wait(lk, [&]{ return ready; });`），绝不能写成 `if (!ready) cv.wait(lk);`？**

```text
  Mesa 语义时序陷阱（现代 Linux / C++ / Java / POSIX 全部采用 Mesa 语义！）：
  t1: 生产者入队 1 个元素，调用 notify_one() 唤醒消费者 C1，释放锁
  t2: 【关键窗口】在 C1 醒来并重新抢锁之前，刚路过的插队者 C2 先抢到锁把元素吃掉了！
  t3: C1 终于抢回锁从 wait() 返回 ──▶ 此时队列其实又是空的！！
      • 如果你写了 if (empty) wait()：C1 直接去 pop() 空队列 ──▶ 当场崩溃！
      • 如果你写了 while (empty) wait()：C1 再检查一次发现 empty==true，乖乖继续睡！
```

此外，底层 `futex` / 信号中断还允许**虚假唤醒（Spurious Wakeup）**——没有任何人调 `notify` 也可能偶尔醒来。因此：**谓词 `while` 循环重检永远不可省略**，且修改条件变量谓词时必须**全程持有锁**（否则可能发生信号丢失 Lost Wakeup）。

---

## 六、三大经典同步问题：有界缓冲、读写者与哲学家就餐 (OS-24)

### 1. 有界生产者-消费者问题（Bounded Producer-Consumer）
既要防止满队列时生产者写入（需 `not_full`），又要防止空队列时消费者读取（需 `not_empty`），还要支持优雅关闭（`close()` 后 `notify_all()` 让剩余消费者排空退出）。

### 2. 读写者问题（Readers-Writers）与写者饥饿
多个读者可同时读，但写者必须独占（C++17 `std::shared_mutex`）。**经典坑**：如果策略单纯偏袒读者（只要还有读者在读，新来的读者就能直接插队进去），源源不断的读请求会把等待写入的**写者活活饿死**！工程解决方式是加一道**公平闸门（Turnstile）**或采用写者优先队列，一旦有写者排队，后续新读者也必须站到写者后面排队。

### 3. 哲学家就餐问题（Dining Philosophers）
5 位哲学家围圆桌而坐，每人左右各 1 根筷子。如果 5 人同时先拿左手筷子再等右手筷子——**全部卡死**！
**最简优雅破局法**：打破对称性！规定前 4 位哲学家先拿左手再拿右手，**第 5 位哲学家（或所有奇数号）反过来先拿右手再拿左手**（本质上等同于给所有筷子编号 `0..4`，规定永远先拿编号小的再拿编号大的）。

### 可运行 C++20 代码：可优雅关闭的有界队列 + 无死锁哲学家就餐

```cpp
// 编译: g++ -std=c++20 -pthread classic_sync.cpp -o classic_sync
#include <condition_variable>
#include <deque>
#include <iostream>
#include <mutex>
#include <optional>
#include <thread>
#include <vector>

template <typename T>
class BoundedQueue {
    std::mutex mu_;
    std::condition_variable not_full_, not_empty_;
    std::deque<T> buf_;
    std::size_t cap_;
    bool closed_ = false;
public:
    explicit BoundedQueue(std::size_t cap) : cap_(cap) {}

    bool push(T val) {
        std::unique_lock lk(mu_);
        not_full_.wait(lk, [&] { return closed_ || buf_.size() < cap_; });
        if (closed_) return false;
        buf_.push_back(std::move(val));
        not_empty_.notify_one();
        return true;
    }

    std::optional<T> pop() {
        std::unique_lock lk(mu_);
        not_empty_.wait(lk, [&] { return closed_ || !buf_.empty(); });
        if (buf_.empty()) return std::nullopt; // 已关闭且排空
        T val = std::move(buf_.front());
        buf_.pop_front();
        not_full_.notify_one();
        return val;
    }

    void close() {
        { std::lock_guard lk(mu_); closed_ = true; }
        not_full_.notify_all();
        not_empty_.notify_all();
    }
};

int main() {
    BoundedQueue<int> q(2);
    std::jthread prod([&] {
        for (int i = 1; i <= 5; ++i) q.push(i);
        q.close();
    });
    std::jthread cons([&] {
        while (auto v = q.pop()) std::cout << "消费: " << *v << '\n';
    });
    prod.join();
    cons.join();

    // 哲学家就餐：通过编号序 (min, max) 彻底消灭环形等待
    std::mutex forks[5];
    std::vector<std::jthread> phils;
    for (int i = 0; i < 5; ++i) {
        phils.emplace_back([&, i] {
            int left = i, right = (i + 1) % 5;
            int first = std::min(left, right);
            int second = std::max(left, right);
            for (int meal = 0; meal < 10; ++meal) {
                std::lock_guard g1(forks[first]);
                std::lock_guard g2(forks[second]);
            }
        });
    }
    phils.clear();
    std::cout << "5 位哲学家全部安全就餐完毕，零死锁！\n";
    return 0;
}
```

---

## 七、死锁本质：Coffman 四条件与资源分配图 (OS-25)

当一组线程中的每一个都在等待组内另一个线程手里的资源时，系统进入**死锁（Deadlock）**。1971 年 Coffman 证明，死锁发生**必须同时满足以下四个条件**：

1. **互斥（Mutual Exclusion）**：资源同一时间只能归一个线程专属使用。
2. **持有并等待（Hold and Wait）**：已攥着资源 A 不放，同时申请资源 B。
3. **不可剥夺（No Preemption）**：别人不能强行夺走你已持有的锁，只能等你自己放。
4. **循环等待（Circular Wait）**：存在一条闭环等待链：$T_1 \to T_2 \to \dots \to T_k \to T_1$。

```text
  资源分配图 (RAG) 与等待图 (Wait-For Graph)：
    锁 L1 ──(被持有)──▶ 线程 T1 ──(请求等待)──▶ 锁 L2
      ▲                                          │
      └──────(请求等待)── 线程 T2 ◀──(被持有)─────┘
  注：当每种资源只有 1 个实例时，“图中存在有向环” ⇔ “必然发生死锁”！
      若某种资源有多个实例，环只是死锁的必要非充分条件。
```

---

## 八、死锁预防与避免：锁序偏序、`trylock` 与银行家算法直觉 (OS-26)

面对 Coffman 四条件，工程上有**预防（破坏四条件之一）**与**避免（动态安全预测）**两条路：

### 1. 死锁预防（Deadlock Prevention）

| 目标破除的条件 | 工程解法 | 实践示例 |
| --- | --- | --- |
| **破除互斥** | 尽量用无锁原子操作 `std::atomic`（CAS）替代锁 | 无锁计数、RCU 读多写少 |
| **破除持有并等待** | 一次性原子拿全所有锁，拿不全不进场 | 事务启动前声明全集 |
| **破除不可剥夺** | 用 `try_lock()` 尝试拿第二把锁，失败就**主动释放手里的第一把锁**稍后重试 | `std::unique_lock` + `try_lock` 退避 |
| **破除循环等待（最常用！）** | **全局锁序（Global Lock Ordering）** | 给全系统所有锁规定严格顺序（如按地址 `std::less<std::mutex*>{}(&a, &b)`），或直接用 C++20 **`std::scoped_lock(m1, m2)`** |

### 2. 死锁避免（Deadlock Avoidance）：银行家算法直觉

Dijkstra 提出的**银行家算法**好比谨慎的银行行长：手头只有 `10 万元`现金，客户 A/B/C 各自声明过自己的“最高授信额度”。每当有人申请再借一笔钱时，行长先**沙盘推演**一次：“如果把这笔钱借出去，我剩下的现金还能不能顺着某个顺序，先凑够某一位客户的最大需求、等他赚完钱全额还清后，再挨个满足剩下所有人？”
- 能找到这样一条**安全序列（Safe Sequence）**：系统处于**安全状态**，批准借款！
- 找不到任何安全序列：哪怕现在手里还剩钱，也拒绝先让它阻塞等待，防止未来陷入死锁！

### 可运行 C++20 代码：全局地址锁序 vs `std::scoped_lock`

```cpp
// 编译: g++ -std=c++20 -pthread lock_ordering.cpp -o lock_ordering
#include <functional>
#include <iostream>
#include <mutex>
#include <thread>

struct Account {
    std::mutex mu;
    int balance = 100;
};

void transfer_ordered(Account& from, Account& to, int amount) {
    if (&from == &to) return;
    // 方法 1：显式按内存地址全序加锁，彻底消除反向环
    Account* first  = std::less<Account*>{}(&from, &to) ? &from : &to;
    Account* second = (first == &from) ? &to : &from;
    std::lock_guard g1(first->mu);
    std::lock_guard g2(second->mu);
    from.balance -= amount;
    to.balance += amount;
}

void transfer_scoped(Account& from, Account& to, int amount) {
    if (&from == &to) return;
    // 方法 2：C++17/20 std::scoped_lock 内置无死锁 try-lock 回退算法
    std::scoped_lock guard(from.mu, to.mu);
    from.balance -= amount;
    to.balance += amount;
}

int main() {
    Account a, b;
    std::jthread t1([&] { for (int i = 0; i < 50000; ++i) transfer_ordered(a, b, 1); });
    std::jthread t2([&] { for (int i = 0; i < 50000; ++i) transfer_scoped(b, a, 1); });
    t1.join();
    t2.join();
    std::cout << "安全转账后: a=" << a.balance << ", b=" << b.balance << '\n';
    return 0;
}
```

---

## 九、死锁检测与恢复：等待图环检测与抢占回滚 (OS-27)

有些大型系统（如数据库行级锁、分布式事务）为了追求极高并发度，**既不提前锁序，也不跑昂贵的银行家检查**，而是允许放手去加锁，同时在后台运行**死锁检测器**：

1. **周期性等待图环检测（Wait-For Graph DFS）**：把线程当顶点，把“$T_i$ 正在等 $T_j$ 持有的锁”当有向边，用 DFS 找三色环（白=未访、灰=递归栈中、黑=已确认无环）。一旦碰到**灰色节点**，立刻实锤抓到死锁环！Linux 内核调试神器 **`lockdep`** 和用户态 **`ThreadSanitizer (-fsanitize=thread)`** 正是通过监控“加锁顺序反转图”在真正死锁前就提前报警的。
2. **死锁恢复（Recovery）**：
   - **数据库常用**：挑选一个代价最小（已写入日志最少/事务最年轻）的受害者事务 **回滚（Abort & Rollback）**，强行剥夺并释放它持有的锁。
   - **OS 进程级**：直接终止环中的一个或多个进程，或提供人工介入信号/看门狗重启。

### 可运行 C++20 工具：等待图 DFS 环检测器

```cpp
// 编译: g++ -std=c++20 deadlock_detect.cpp -o deadlock_detect
#include <iostream>
#include <vector>

bool dfs_cycle(int u, const std::vector<std::vector<int>>& adj,
               std::vector<int>& color, std::vector<int>& path) {
    color[u] = 1; // 灰色：正在当前递归栈中
    path.push_back(u);
    for (int v : adj[u]) {
        if (color[v] == 1) {
            std::cout << "检测到死锁等待环: ";
            for (int x : path) std::cout << "T" << x << " -> ";
            std::cout << "T" << v << '\n';
            return true;
        }
        if (color[v] == 0 && dfs_cycle(v, adj, color, path)) return true;
    }
    path.pop_back();
    color[u] = 2; // 黑色：安全
    return false;
}

int main() {
    // T0 等 T1, T1 等 T2, T2 反过来等 T0
    std::vector<std::vector<int>> wait_for = {
        {1}, // T0 -> T1
        {2}, // T1 -> T2
        {0}, // T2 -> T0 (闭环!)
        {1}  // T3 -> T1 (仅挂载在环外)
    };
    std::vector<int> color(wait_for.size(), 0), path;
    bool has_deadlock = false;
    for (int i = 0; i < static_cast<int>(wait_for.size()); ++i) {
        if (color[i] == 0 && dfs_cycle(i, wait_for, color, path)) {
            has_deadlock = true;
            break;
        }
    }
    if (!has_deadlock) std::cout << "系统无死锁环\n";
    return 0;
}
```

---

## 本课微练习 (OS-19 ~ OS-27)

### 练习 1（`spinlock` vs `mutex` 选型）
在**单核 CPU** 上运行两个线程，线程 A 拿到自旋锁后因为时间片耗尽被线程 B 抢占，线程 B 也去申请同一把自旋锁。会发生什么严重后果？用基于 `futex` 的睡眠互斥锁呢？

<details>
<summary>核对答案</summary>

在单核 CPU 上，线程 B 拿到 CPU 后死循环自旋空转，一直把自己的整轮时间片烧完，浪费大量 CPU；虽然最终时钟中断会切回 A 让 A 解锁，但只要临界区里包含阻塞操作或不可抢占自旋锁（禁用抢占），**单核自旋锁会直接把整颗核永久死锁**！而 `mutex` 抢不到锁会立刻阻塞休眠让出 CPU，不会空转。

</details>

### 练习 2（Mesa 语义条件变量）
为什么说 `std::condition_variable::wait()` 在进入阻塞前**必须原子地释放互斥锁**，并在被唤醒返回前**重新获取这把锁**？

<details>
<summary>核对答案</summary>

1. 如果带着锁入睡，生产者根本拿不到锁来修改共享状态并调 `notify`，双方直接永久死锁。
2. 释放与入睡必须是原子的，否则如果在“释放锁后、入睡前”被生产者插进来发了 `notify`，这次唤醒就永久丢失了（Lost Wakeup）。
3. 醒来重新拿锁后才能安全检查并消费共享状态，并用 `while` 循环重检谓词以抵御插队和虚假唤醒。

</details>

### 练习 3（银行家算法安全序列心算）
系统共有 **10 个**同类型资源。现有 3 个进程：`P0(已占2, 最大需求5)`、`P1(已占4, 最大需求7)`、`P2(已占2, 最大需求9)`。当前系统还剩 `2` 个空闲资源。请判断现在是否处于**安全状态**；如果 `P2` 此刻立刻申请再借 `1` 个资源，银行家应该批准还是拒绝？

<details>
<summary>核对答案</summary>

- **当前状态**：剩余 `2` 个，不足以满足 `P0(还需3)`、`P1(还需3)`、`P2(还需7)` 中的任何一方！因此当前已经处于**不安全状态**（如果大家都不肯释放，极易死锁）。
- 如果再把仅有的 `2` 个中的 `1` 个借给 `P2`，剩余变成 `1`，同样没有任何进程能凑齐最大需求完成并归还，**银行家必须拒绝 `P2` 的申请**！

</details>

### 练习 4（二值信号量 vs 互斥锁）
写一个简短的例子说明：为什么“初值为 `0` 的 `std::binary_semaphore`”适合做线程 A→B 的单向完成通知，而 `std::mutex` 却做不到？

<details>
<summary>核对答案</summary>

`std::mutex` 严格要求**“谁加锁、谁解锁”**（所有权语义），如果线程 B 想在锁上等线程 A 干完活解锁，会触发未定义行为。而初值为 `0` 的 `binary_semaphore` 没有所有权限制：线程 B 先 `acquire()` 阻塞，线程 A 干完活调 `release()` 放行（哪怕 A 先跑完调了 `release()` 把信号变成 `1`，后到的 B `acquire()` 也能直接通过，不会丢信号）。

</details>
