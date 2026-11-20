---
title: "互斥锁、死锁防线与线程同步原语"
description: "彻底分清 Data Race 与逻辑竞态条件，掌握 mutex、unique_lock、scoped_lock 与锁层次、shared_mutex 读写锁与饥饿陷阱、call_once、条件变量虚假唤醒防线，以及 C++20 latch/barrier/semaphore 与线程安全容器设计。"
order: 80
category: "并发与性能"
tags: ["C++20", "mutex", "死锁", "条件变量", "shared_mutex", "latch", "barrier", "semaphore"]
related: ["handbook/con-zero-start", "handbook/concurrency-queue", "handbook/raii"]
---

## 本课只解决这 1 个问题

请出多个线程只是第一步，真正的难点在于**协作与秩序**：
- 怎么保证多字段共享状态每次被修改或读取时都严丝合缝？
- 需要同时锁两个对象时，为什么会互相卡死（死锁），怎样从根源消灭它？
- 当线程等待某个事件发生时，怎样让它优雅睡眠、醒来不出错，并在 C++20 里用更轻量的同步门完成协同？

本课覆盖课程 `CON-09`–`CON-18`，打通 C++20 互斥与同步原语的完整兵器库。

---

## 数据竞争 (UB) vs 逻辑竞态条件 (CON-09)

初学者最容易把 **Data Race（数据竞争）** 和 **Race Condition（竞态条件）** 当成同一件事，但在 C++ 标准与系统排错中，两者的性质天差地别：

| 维度 | 数据竞争（Data Race） | 逻辑竞态条件（Race Condition） |
| --- | --- | --- |
| **定义** | 两个及以上线程**无同步**并发访问同一内存位置，且至少一个为非原子写 | **没有未定义行为**，但程序正确性依赖线程调度的先后顺序 |
| **后果** | **C++ 未定义行为（UB）**！读出撕裂值、编译器优化删掉循环、直接崩溃 | 逻辑错误（比如余额变负、数组越界、重复扣款），但每次单步操作是合法的 |
| **加了 `mutex` 就没了吗？** | 用同一把锁保护所有读写即可**彻底消除 Data Race** | **依然可能发生！** 常见于“先查后用（Check-Then-Act）”把一步拆成了两把锁 |
| **检测工具** | ThreadSanitizer (`-fsanitize=thread`) 可**精准报出具体代码行** | TSan **测不出来**！必须靠代码审查、不变式断言和交错压力测试 |

### 典型“加了锁却依然出错”的逻辑竞态（TOCTOU）

```cpp
// 反面教材：Check-Then-Act 竞态条件！
// 虽然 empty() 和 pop() 各自内部都加了 mutex，没有 Data Race，但组合起来依然崩溃！
if (!safe_stack.empty()) {      // T1 线程 A 锁内查完发现有 1 个元素，解锁
                                // T2 线程 B 抢先一步把这唯一 1 个元素 pop 走了！
    auto val = safe_stack.pop(); // T3 线程 A 再次加锁去 pop() —— 栈已空，直接异常或 UB！
}
```

**核心心法**：锁保护的不是“单次函数调用”，而是**必须同时成立的跨字段/跨步骤业务不变量（Invariant）**。`empty()` 检查和 `pop()` 弹出必须合并在**同一个临界区**里原子完成。

---

## 互斥锁基础：`std::mutex` 与 RAII `std::lock_guard` (CON-10)

`std::mutex` 是最基础的排他互斥锁（不可拷贝、不可移动、不可在同一线程重入递归加锁）。

### 为什么严禁手写 `mu.lock()` / `mu.unlock()`？

想象你在持锁期间写了一个 `if (bad_data) return;` 或者调用了可能抛异常的函数——一旦中途离开作用域却漏了 `mu.unlock()`，**这把锁将永远锁死**，全程序所有等待它的线程集体陪葬！

C++ 标准库用 **RAII**（资源获取即初始化）把加锁和解锁绑死在对象构造与析构上：

```cpp
#include <iostream>
#include <mutex>
#include <vector>

class SafeLogStats {
public:
    void add_record(int level, std::size_t bytes) {
        std::lock_guard<std::mutex> lock(mu_); // 构造即加锁；C++17 起可省略模板参数写成 std::lock_guard lock(mu_);
        total_lines_ += 1;
        total_bytes_ += bytes;
        if (level == 2) {
            error_lines_ += 1;
        }
        // 无论正常结束还是前面抛出异常，离开花括号时 ~lock_guard() 必解锁！
    }

    // 打包返回快照，保证三个字段在同一个瞬间一致
    struct Snapshot {
        std::size_t lines, bytes, errors;
    };

    Snapshot snapshot() const {
        std::lock_guard lock(mu_);
        return {total_lines_, total_bytes_, error_lines_};
    }

private:
    mutable std::mutex mu_; // mutable 允许在 const 成员函数（如 snapshot()）里加锁！
    std::size_t total_lines_ = 0;
    std::size_t total_bytes_ = 0;
    std::size_t error_lines_ = 0;
};
```

> **临界区两条铁律**：
> 1. **只读函数也要加同一把锁**（因此 `mu_` 常声明为 `mutable`）：如果写线程正在更新 `total_lines_` 和 `total_bytes_`，只读线程不加锁去读，照样构成 Data Race UB！
> 2. **临界区越短越好**：绝不在持锁期间写磁盘、发网络包或调用外部用户回调。

---

## 灵活的钥匙：`std::unique_lock` 全特性详解 (CON-11)

`std::lock_guard` 极简高效（零额外内存开销），但它**既不能中途手动解锁，也不能移动所有权**。当你遇到下面 4 种场景时，请换成更强大的 **`std::unique_lock<std::mutex>`**：

1. **配合 `std::condition_variable` 等待**（条件变量睡眠前必须临时解锁，醒来后重新加锁）。
2. **持锁提取数据后，中途提前 `unlock()` 再做耗时计算/I/O**。
3. **延迟加锁（`std::defer_lock`）或尝试加锁（`std::try_to_lock`）**。
4. **把锁的所有权像 `unique_ptr` 一样 `std::move` 返回给调用者**。

```cpp
#include <iostream>
#include <mutex>
#include <string>
#include <thread>

std::mutex g_mu;
std::string g_shared_buf = "raw log payload";

// 特性 A：返回锁的所有权（锁住状态随 unique_lock 一起移交给调用方）
std::unique_lock<std::mutex> acquire_buffer_lock() {
    std::unique_lock<std::mutex> lk(g_mu);
    // 可以在这里先做一些准备工作...
    return lk; // 移动构造（NRVO/move）
}

void process_with_flexible_lock() {
    // 特性 B：std::defer_lock 构造时不立刻加锁，稍后按需加锁
    std::unique_lock<std::mutex> lk(g_mu, std::defer_lock);
    std::string local_prep = "prepare something heavy";

    lk.lock(); // 现在才真正上锁
    std::string data = g_shared_buf;
    lk.unlock(); // 拿到局部拷贝后立刻释放锁，绝不阻塞其他线程！

    // 在完全无锁的状态下做耗时解析或 I/O
    std::cout << "无锁处理中: " << data << " / " << local_prep << '\n';

    // 特性 C：std::try_to_lock 非阻塞试探
    std::unique_lock<std::mutex> try_lk(g_mu, std::try_to_lock);
    if (try_lk.owns_lock()) {
        g_shared_buf += " [updated]";
    }
}

void adopt_example() {
    g_mu.lock(); // 假设底层 C API 或 std::lock 已经把 g_mu 锁住了
    // 特性 D：std::adopt_lock 接管“已经上锁”的 mutex，析构时负责解锁
    std::unique_lock<std::mutex> lk(g_mu, std::adopt_lock);
    g_shared_buf += " [adopted]";
}
```

**代价对照**：`unique_lock` 内部多存了一个 `bool owns_` 标志位，析构时需多判断一次 `if (owns_)`；平时不需要中途解锁或配合条件变量时，优先用轻量的 `std::lock_guard` 或 `std::scoped_lock`。

---

## 死锁的四大条件、`std::scoped_lock` 与锁层次 (CON-12)

### 1. 死锁产生的 Coffman 4 个必要条件（缺一不可）

1. **互斥（Mutual Exclusion）**：资源同一时刻只能由一个线程持有。
2. **占有并等待（Hold and Wait）**：线程手里拿着锁 A，同时在等锁 B。
3. **不可抢占（No Preemption）**：没人能强行把线程手里的锁抢走，只能等它自己释放。
4. **循环等待（Circular Wait）**：线程 1 等线程 2 的锁，线程 2 等线程 1 的锁（形成闭环）。

```text
线程 1:  已锁 A ──等待 B──▶ ┌────┐
                            │ 死 │
线程 2:  已锁 B ──等待 A──▶ │ 锁 │
                            └────┘
```

### 2. 解法一：用 `std::scoped_lock` 一次性原子锁多把锁（打破“占有并等待”与“循环等待”）

C++17 引入的 **`std::scoped_lock`** 内部使用防死锁算法（类似 `std::lock` 的尝试与回退机制），无论你把 `from.mu` 和 `to.mu` 按什么顺序传进去，**永远不会发生 AB-BA 锁序反转死锁**：

```cpp
#include <iostream>
#include <mutex>
#include <thread>

struct Account {
    std::mutex mu;
    int balance = 1000;
};

void transfer(Account& from, Account& to, int amount) {
    if (&from == &to) return; // 防范自己给自己转账时的自死锁！
    std::scoped_lock lock(from.mu, to.mu); // C++17+ 首选：支持任意数量不同类型互斥锁
    if (from.balance >= amount) {
        from.balance -= amount;
        to.balance += amount;
    }
}

int main() {
    Account a, b;
    std::jthread t1([&] { for (int i = 0; i < 10000; ++i) transfer(a, b, 1); });
    std::jthread t2([&] { for (int i = 0; i < 10000; ++i) transfer(b, a, 1); });
    t1.join();
    t2.join();
    std::cout << "a=" << a.balance << ", b=" << b.balance
              << ", sum=" << (a.balance + b.balance) << '\n'; // 恒等于 2000！
    return 0;
}
```

### 3. 解法二：全局固定锁顺序 & 锁层次（Lock Hierarchy）

如果两把锁不能在同一个函数调用里一起传给 `scoped_lock`（比如跨越了多层函数调用：先在外层函数锁模块 A，再在内层函数锁模块 B），就必须人为规定**全局锁序**：
- **按地址/ID 排序**：`if (&from < &to)` 先锁 `from`，否则先锁 `to`。
- **按层次编号（Hierarchical Mutex）**：给每把锁分配层级编号（例如网络层 = 10000，队列层 = 5000，存储层 = 1000）。规定**线程只能从高编号向低编号加锁**，每个线程用 `thread_local unsigned long current_level` 记录当前持有的最低层级，若试图反序加锁直接在调试期抛异常抓出 Bug！

> **自死锁（Self-Deadlock）提示**：同一线程连续两次调用 `mu.lock()` 会立刻卡死自己！虽然标准库有 `std::recursive_mutex` 允许同线程重入加锁，但它往往掩盖了糟糕的接口边界设计（持锁调用公开方法），**工程最佳实践是把公共加锁入口和私有无锁实现 `*_unlocked()` 拆开**，只在入口锁一次。

---

## 读多写少：`std::shared_mutex` 与写者饥饿陷阱 (CON-13)

很多场景下（如配置中心、路由表、内存缓存），**99% 的操作是只读查询，只有 1% 是更新写入**。如果用普通 `std::mutex`，100 个只读线程也得排成一队一个一个看，太冤枉了！

C++17 的 **`std::shared_mutex`**（读者-写者锁）把锁拆成两种角色：
- **共享锁（`std::shared_lock<std::shared_mutex>`）**：多个**读线程**可以**同时持有**，互不阻塞！
- **独占锁（`std::unique_lock<std::shared_mutex>`）**：**写线程**必须排他独占（等所有正在读的线程退出，且同时拦住新读线程和其它写线程）。

```cpp
#include <iostream>
#include <mutex>
#include <shared_mutex>
#include <string>
#include <unordered_map>

class RouteTable {
public:
    std::string lookup(const std::string& host) const {
        std::shared_lock<std::shared_mutex> rlock(mu_); // 多个线程可同时进入！
        auto it = routes_.find(host);
        return (it != routes_.end()) ? it->second : "default";
    }

    void update(const std::string& host, std::string backend) {
        std::unique_lock<std::shared_mutex> wlock(mu_); // 独占排他写入
        routes_[host] = std::move(backend);
    }

private:
    mutable std::shared_mutex mu_;
    std::unordered_map<std::string, std::string> routes_;
};
```

### 使用 `std::shared_mutex` 必须警惕的 3 个陷阱

1. **锁本身的原子维护开销比 `std::mutex` 更大**：每次读线程加/解 `shared_lock`，依然要对共享锁内部的原子读者计数器做写操作（RMW），如果每次读临界区只有几十纳秒（比如查一个极小的数组），大量核同时改读者计数器照样引发缓存行弹跳，实测可能比普通 `std::mutex` 还慢！只有**读比例极高（>90%）且读操作本身耗时较长**时才划算。
2. **写者饥饿（Writer Starvation）**：在某些平台实现里，只要源源不断的读线程一直在交叉进入共享锁，等待写入的写线程可能迟迟抢不到独占权，导致写请求尾延迟飙升（或相反，写优先导致读延迟飙升）。
3. **严禁持 `shared_lock` 时直接升级成 `unique_lock`**：如果你拿着读锁不放又去申请同一把 `shared_mutex` 的写锁，**100% 死锁**（写锁在等你自己释放读锁）！必须先释放读锁，再拿写锁并重新校验条件。

---

## 单次初始化：`std::call_once` 与 Meyers 线程安全单例 (CON-14)

如何在多线程环境下保证某个全局资源（例如连接池、正则引擎、全局配置）**只初始化一次**？

### 1. 为什么手写“双重检查锁（DCLP）”曾经是臭名昭著的坑？

```cpp
// C++11 之前经典错误写法（即使加了锁也可能是 UB！）：
if (ptr == nullptr) {            // 1. 无锁读取 ptr —— Data Race！
    std::lock_guard lk(mu);
    if (ptr == nullptr) {
        ptr = new ExpensiveObj(); // 2. 编译器/CPU 可能先赋值 ptr，后调构造函数！
    }                             // 线程 B 看到 ptr != nullptr 直接拿着未构造完的对象崩溃！
}
```

### 2. 现代 C++ 唯二正确的写法

**方案 A：Meyers 单例（C++11+ 局部静态变量线程安全保证）**
C++11 标准强制保证：**函数内部的局部 `static` 变量首次初始化是天然线程安全的**——如果多个线程同时冲进这个函数，只有一个线程会执行构造函数，其余线程会自动阻塞等到初始化彻底完成；如果构造函数抛了异常，下一个线程进来还会重试！

```cpp
class ConfigCenter {
public:
    static ConfigCenter& instance() {
        static ConfigCenter inst; // C++11+ 魔术静态变量（Magic Statics），天然线程安全且零锁读取！
        return inst;
    }
    ConfigCenter(const ConfigCenter&) = delete;
    ConfigCenter& operator=(const ConfigCenter&) = delete;
private:
    ConfigCenter() = default;
};
```

**方案 B：`std::once_flag` + `std::call_once`**
当需要把延迟初始化放在**类的成员变量**（而不是全局静态对象，避免全局析构顺序灾难）或者需要传动态参数时，用 `std::call_once`：

```cpp
#include <memory>
#include <mutex>

class LazyConnection {
public:
    void send(const std::string& msg) {
        std::call_once(init_flag_, [this] {
            conn_ = open_connection(); // 仅执行一次；若抛异常则标志不置位，下次可重试
        });
        // 使用 conn_ 发送 msg...
        (void)msg;
    }
private:
    std::shared_ptr<int> open_connection() { return std::make_shared<int>(1); }
    std::once_flag init_flag_;
    std::shared_ptr<int> conn_;
};
```

---

## 条件变量：`wait`/`notify` 与虚假唤醒铁律 (CON-15)

如果线程 A 要等线程 B 把数据准备好：
- **千万别写死循环轮询** `while (!ready) {}`——这叫**忙等待（Busy Wait）**，会把一颗 CPU 核心烤到 100%，还抢占生产者的运行时间。
- 正确工具是 **`std::condition_variable`**（餐厅震动取餐牌）：条件不满足时，线程交出锁并**在操作系统内核里真正睡着（0% CPU 占用）**；条件满足时，生产者按铃唤醒它。

### 完整时序：为什么 `wait` 必须与 `mutex` + 谓词配对？

```text
消费者 (Consumer)                           生产者 (Producer)
──────────────────                         ──────────────────
1. std::unique_lock lk(mu);
2. 检查谓词：data_ready == false
3. 调用 cv.wait(lk, pred)：
   ├─ 原子地释放 mu 并进入内核睡眠！          4. std::lock_guard lk(mu);
   │                                       5. data_ready = true;
   │                                       6. cv.notify_one();
   ├─ 被唤醒，尝试重新抢回 mu
   ├─ 抢回 mu 后，再次自动检查 pred！
   └─ pred() == true，wait() 返回，继续干活
```

### 为什么必须传谓词（或用 `while` 包住 `wait`）？

1. **防止丢失唤醒（Lost Wakeup）**：万一生产者在消费者还没进 `wait` 时就已经先 `notify` 了怎么办？只要先改了共享状态 `data_ready = true` 并锁住检查，消费者在进睡眠前会先跑一次谓词检查，发现已经 `true` 就直接不睡了，绝对不会错过通知！
2. **抵御虚假唤醒（Spurious Wakeup）**：POSIX/Windows 操作系统内核允许条件变量在**没有任何线程调 `notify`** 的情况下偶尔把线程唤醒。
3. **抵御被截胡唤醒（Stolen Wakeup）**：生产者只放入 1 条任务并唤醒等待者，线程 A 刚被叫醒但还没抢到锁，线程 C 半路插队拿走了那 1 条任务；等线程 A 终于抢到锁时，队列已经又空了！

```cpp
// 错误：裸 wait + if 检查，遇到虚假唤醒或被截胡直接越界崩溃！
if (!ready) {
    cv.wait(lk);
}

// 唯一标准写法：传入 Lambda 谓词（内部等价于 while (!pred()) wait(lk);）
cv.wait(lk, [&] { return ready || stopped; });
```

> **`notify_one()` 在锁内还是锁外？**
> 两种做法在正确性上都成立，但有性能差异：如果在持锁状态下调用 `notify_one()`，消费者可能立刻被调度醒来、一头撞在还没释放的 `mu` 上再次睡眠（称为 *Hurry up and wait*）。因此工程里常见的微优化是：**在锁内修改状态，先 `lk.unlock()`，再调用 `cv.notify_one()`**（前提是能确保条件变量本身不会在 `unlock` 后被立刻销毁！）。

---

## 通用条件变量与协作取消：`condition_variable_any` 与 `stop_token` (CON-16)

`std::condition_variable` 为了极致性能，强绑定了 `std::unique_lock<std::mutex>`。如果你：
- 想配合 `std::shared_lock<std::shared_mutex>` 或自定义锁类一起等待；或者
- 想直接在 C++20 里把 **`std::stop_token`** 接进 `wait()`，不用手写一个布尔停止标志 + 手动 `notify_all()`：

请使用 **`std::condition_variable_any`**！它的 C++20 重载 `wait(lock, stop_token, pred)` 会在内部自动注册一个 `std::stop_callback`，一旦外部调用 `jthread.request_stop()`，条件变量**自动唤醒**等待线程并返回 `false`：

```cpp
#include <condition_variable>
#include <iostream>
#include <mutex>
#include <queue>
#include <stop_token>
#include <thread>

int main() {
    std::mutex mu;
    std::condition_variable_any cv;
    std::queue<int> tasks;

    std::jthread worker([&](std::stop_token st) {
        while (true) {
            std::unique_lock lk(mu);
            // 只要收到 stop_token 或 tasks 非空就会醒；
            // 返回 false 表示“因停止请求醒来且 tasks 仍为空”
            if (!cv.wait(lk, st, [&] { return !tasks.empty(); })) {
                std::cout << "收到停止信号，worker 退出\n";
                break;
            }
            int task = tasks.front();
            tasks.pop();
            lk.unlock();
            std::cout << "处理任务: " << task << '\n';
        }
    });

    {
        std::lock_guard lk(mu);
        tasks.push(101);
        tasks.push(102);
    }
    cv.notify_one();

    std::this_thread::sleep_for(std::chrono::milliseconds(20));
    worker.request_stop(); // 不需要额外向队列发哨兵值，直接唤醒睡在 cv 上的 worker！
    return 0;
}
```

---

## C++20 同步三剑客：`std::latch`、`std::barrier` 与 `std::counting_semaphore` (CON-17)

很多时候我们并不想手写 `mutex + condition_variable + counter`，C++20 `<latch>`、`<barrier>`、`<semaphore>` 直接提供了开箱即用的轻量级协调原语：

| 原语 | 核心比喻 | 能否重复使用 | 核心能力与典型场景 |
| --- | --- | --- | --- |
| **`std::latch`** | **一次性发令枪 / 倒计时门栓** | **一次性**（归零后永久放行） | 主线程等 N 个工作线程全就绪；或 N 个线程等主线程同时起跑（写确定性并发测试神器！） |
| **`std::barrier`** | **可循环集合点（驿站）** | **可多轮复用** | 每一轮迭代结束所有线程对齐一次，归零时自动执行一次单线程收尾回调（Phase Completion），然后开启下一轮 |
| **`std::counting_semaphore<N>`** | **停车场空车位牌（计数信号量）** | **持续放行/归还** | 限制最多 $M$ 个并发访问数据库连接池；**没有锁所有权概念**，A 线程 `acquire()` 可以由 B 线程 `release()` |

### 1. 用 `std::latch` 与 `std::barrier` 编排多线程起跑与多阶段同步

```cpp
#include <barrier>
#include <iostream>
#include <latch>
#include <mutex>
#include <semaphore>
#include <thread>
#include <vector>

int main() {
    constexpr int kWorkers = 3;
    std::latch ready_latch(kWorkers);   // 等 3 个工人初始化好
    std::latch start_gate(1);           // 主线程一声令下同时起跑

    int phase = 0;
    std::barrier phase_barrier(kWorkers, [&]() noexcept {
        ++phase; // 每轮全员到达后，仅由其中一个到达线程安全执行一次！
        std::cout << "--- 第 " << phase << " 阶段全员同步完成 ---\n";
    });

    // 二元信号量（等价于 std::binary_semaphore）或计数信号量限制同时只能 2 个线程访问“慢资源”
    std::counting_semaphore<2> db_permits(2);
    std::mutex io_mu;

    std::vector<std::jthread> workers;
    for (int id = 0; id < kWorkers; ++id) {
        workers.emplace_back([&, id] {
            ready_latch.count_down();   // 报告我已就位（不阻塞）
            start_gate.wait();          // 等待总发令枪

            for (int round = 0; round < 2; ++round) {
                db_permits.acquire();   // 抢占一个并发名额（最多 2 人同时进）
                {
                    std::lock_guard lk(io_mu);
                    std::cout << "Worker " << id << " 第 " << round + 1 << " 轮工作中\n";
                }
                db_permits.release();   // 归还名额
                phase_barrier.arrive_and_wait(); // 等所有队友完成本轮，再一起进下一轮
            }
        });
    }

    ready_latch.wait(); // 确保全部线程已进入等待状态
    std::cout << "全员就位，发令起跑！\n";
    start_gate.count_down();
    return 0;
}
```

> **信号量 vs 互斥锁的关键区别**：`std::mutex` 必须“谁加锁谁解锁”，用于保护共享数据的排他性；而 `std::binary_semaphore`（`counting_semaphore<1>`）**没有线程所有权**，特别适合**线程间事件发信**（生产者线程调用 `sem.release()` 通知等待在 `sem.acquire()` 的消费者线程），有时比条件变量更轻量！

---

## 线程安全容器设计：接口竞态消除与锁粒度权衡 (CON-18)

### 1. 为什么不能把 `std::stack` 简单套个 `mutex` 就宣布线程安全？

回想 `CON-09`：标准库 `std::stack` 把 `top()`（查看栈顶）和 `pop()`（弹出元素）拆成了两个函数，因为“返回值拷贝如果抛异常，元素不能丢”。但放到多线程里，这恰恰制造了 Check-Then-Act 竞态！

正确改造方式是**把查看和弹出合并为一个原子接口**，同时保证异常安全：

```cpp
#include <exception>
#include <memory>
#include <mutex>
#include <optional>
#include <stack>

struct EmptyStackError : std::exception {
    const char* what() const noexcept override { return "stack is empty"; }
};

template <typename T>
class ThreadSafeStack {
public:
    ThreadSafeStack() = default;
    ThreadSafeStack(const ThreadSafeStack& other) {
        std::lock_guard lk(other.mu_);
        data_ = other.data_;
    }
    ThreadSafeStack& operator=(const ThreadSafeStack&) = delete;

    void push(T value) {
        std::lock_guard lk(mu_);
        data_.push(std::move(value));
    }

    // 方案 1：返回 shared_ptr（在弹出前构造指针，即使 T 拷贝构造抛异常也不破坏栈状态）
    std::shared_ptr<T> try_pop() {
        std::lock_guard lk(mu_);
        if (data_.empty()) return nullptr;
        auto res = std::make_shared<T>(std::move(data_.top()));
        data_.pop();
        return res;
    }

    // 方案 2：通过引用输出（C++17+ 更常用 std::optional<T> try_pop()）
    bool try_pop(T& out) {
        std::lock_guard lk(mu_);
        if (data_.empty()) return false;
        out = std::move(data_.top());
        data_.pop();
        return true;
    }

    bool empty() const {
        std::lock_guard lk(mu_);
        return data_.empty();
    }

private:
    mutable std::mutex mu_;
    std::stack<T> data_;
};
```

### 2. 锁粒度的三级权衡（Coarse vs Fine vs Lock Striping）

设计线程安全数据结构时，锁该管多大范围？

| 方案 | 原理 | 优点 | 缺点 |
| --- | --- | --- | --- |
| **粗粒度锁（Coarse-grained）** | 整个容器就 1 把大 `mutex` | 实现极其简单、无死锁风险、单线程/低并发开销最低 | 高并发下所有核排队，受 Amdahl 定律限制吞吐上不去 |
| **细粒度锁（Fine-grained）** | 每个链表节点各自配 1 把锁（手递手锁 Hand-over-hand） | 不同位置的节点可真正并行操作 | 锁对象内存爆炸、频繁加解锁开销大、极易死锁 |
| **分段锁 / 锁条带化（Lock Striping）** | 把容器切成 $K$ 个桶（例如 64 个分片），每个分片 1 把锁：`bucket = hash(key) % K` | **工程黄金甜点！** 锁开销固定、碰撞概率降为 $1/K$、几乎不复杂 | 全局 `size()` 或跨桶扩容需要按顺序锁住所有分片 |

---

## 本课微练习与核对

### 练习 1（死锁定位与修复）
下面代码在两个线程并发调用 `swap_data(a, b)` 与 `swap_data(b, a)` 时为何可能卡死？请用至少两种方法修复。

```cpp
struct Box { std::mutex mu; int v; };
void swap_data(Box& x, Box& y) {
    std::lock_guard l1(x.mu);
    std::lock_guard l2(y.mu);
    std::swap(x.v, y.v);
}
```

<details>
<summary>核对答案</summary>

线程 1 持 `a.mu` 等 `b.mu`，线程 2 持 `b.mu` 等 `a.mu`，发生**锁序反转死锁**；另外当 `&x == &y` 时还会**自死锁**。
- **修复 A**：加自反判断 `if (&x == &y) return;`，然后改用 `std::scoped_lock lk(x.mu, y.mu);`。
- **修复 B**：按对象地址强制统一顺序加锁：`Box* first = &x; Box* second = &y; if (first > second) std::swap(first, second);`，再依次锁 `first->mu` 和 `second->mu`。

</details>

### 练习 2（条件变量为何不能用 `if`）
假设有 1 个生产者放进 1 个元素并调用 `notify_all()`，唤醒了 2 个都在等 `not_empty` 的消费者线程 A 和 B。为什么其中 1 个消费者必须在醒来后用 `while` 重查条件？

<details>
<summary>核对答案</summary>

虽然两个线程都被唤醒，但**互斥锁一次只放进 1 个线程**。假设线程 A 先抢到锁取走了唯一的数据；等线程 A 解锁后，线程 B 终于拿到锁继续往下执行时，队列**其实已经再次变空**！如果没有 `while` 重查条件（即 `wait(lk, pred)` 里的谓词循环），线程 B 就会对空队列执行 `front()`/`pop()` 导致未定义行为。

</details>

### 下一步怎么走
掌握了互斥锁、条件变量与同步门后，我们来搭建多线程系统最核心的“大动脉”——进入下一课 [并发队列、Future、线程池与无锁环形缓冲区](../concurrency-queue/)！
