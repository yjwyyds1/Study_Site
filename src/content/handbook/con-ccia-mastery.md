---
title: "《C++ Concurrency in Action (2e)》全书精讲：从线程管控、并发数据结构、无锁内存回收到工作窃取线程池"
description: "完整融合 Anthony Williams《C++ 并发编程实战（第 2 版）》全书 10 章核心设计与代码实现：scoped_thread 与并行 accumulate、消除接口竞态的 threadsafe_stack 与层级锁 hierarchical_mutex、future/promise/packaged_task 与函数式并发快排、6 种 memory_order 与栅栏形式化推演、细粒度双锁队列与分桶并发哈希表、无锁栈与 Hazard Pointers/引用计数内存回收、异常安全并行算法及支持 Work-Stealing 的工业级线程池。"
order: 84
category: "并发与性能"
tags: ["C++ Concurrency in Action", "并发数据结构", "内存序", "无锁编程", "Hazard Pointers", "工作窃取线程池", "future/promise"]
related: ["handbook/con-zero-start", "handbook/con-locks-sync", "handbook/concurrency-queue", "handbook/con-atomics-lockfree"]
sources: []
---

## 本课解决什么核心问题

作为 C++ 标准委员会并发工作组核心成员、C++11/14/17/20 `<thread>` 与 `<atomic>` 提案的主要起草人之一，Anthony Williams 在其传世名著 **《C++ Concurrency in Action (2nd Edition)》**（以下简称 CCIA 2e）中，不仅系统阐释了 C++ 并发标准库的 API 语义，更重要的是给出了**工业级并发基础设施的十套标准工程蓝图**。

很多开发者虽然背熟了 `std::thread`、`std::mutex` 和 `std::atomic` 的语法，却依然在真实项目里写出隐藏着接口级竞态（Interface Race Condition）、锁顺序反转死锁、Use-After-Free 内存回收崩溃或线程池嵌套等待死锁的代码。本篇以 CCIA 2e 全书 10 章为主线（对应课程 `CON-51` ~ `CON-58`），带你逐行拆解并落地原书所有标志性并发构件与无锁算法。

---

## 一、Ch1~Ch2 线程管控工程模式：scoped_thread、所有权转移与 hardware_concurrency 并行 accumulate (CON-51)

在 CCIA 第 1~2 章中，Anthony Williams 直指 `std::thread` 生命周期管理的第一大悬崖：**任何一个 `joinable() == true` 的 `std::thread` 对象在析构时，如果既没有调用 `join()` 也没有调用 `detach()`，C++ 运行时库会无条件调用 `std::terminate()` 强行杀死整个进程**。

### 1. 为什么 `scoped_thread` 比普通 `thread_guard` 更安全？

为了防止函数在 `t.join()` 之前因为异常抛出或提前 `return` 而触发 `std::terminate()`，常见的一种入门写法是 `thread_guard`——在内部保存一个 `std::thread&` 引用，在析构函数里检查 `if (t.joinable()) t.join();`。

然而，`thread_guard` 有两个明显的工程隐患：
1. **外部仍持有原 `std::thread` 对象的访问权**：在 `thread_guard` 存活期间，外部代码依然可以不小心对原变量 `t` 调用 `t.detach()` 或 `t = std::move(other)`，破坏守卫预期。
2. **错误暴露太晚**：如果传入了一个从一开始就已经无效（`!joinable()`）的空线程，直到离开作用域析构时才发现毫无意义。

借用 `std::thread` **只可移动（Move-Only）、不可拷贝**的所有权转移特性，原书第 2 章提出了直接接管所有权的 **`scoped_thread`**：

```text
thread_guard (仅借用引用)             scoped_thread (直接移动夺取所有权)
┌────────────────────┐               ┌──────────────────────────────┐
│ std::thread t(...);│               │ scoped_thread g(             │
│ thread_guard g(t); │               │     std::thread(worker, 42)  │
│ // 隐患：外部仍能  │               │ );                           │
│ // 直接篡改变量 t  │               │ // 构造即校验 joinable()！   │
└────────────────────┘               │ // 外部再无任何句柄可干扰它  │
                                     └──────────────────────────────┘
```

```cpp
// 文件名：ccia_ch2_scoped_thread.cpp
#include <iostream>
#include <stdexcept>
#include <thread>
#include <utility>

class scoped_thread {
    std::thread t_;
public:
    // 直接按值接收（或右值移动接收）std::thread，彻底夺取线程所有权
    explicit scoped_thread(std::thread t) : t_(std::move(t)) {
        if (!t_.joinable()) {
            throw std::logic_error("No thread: scoped_thread requires a joinable thread");
        }
    }

    ~scoped_thread() {
        // 因为构造时已经确保 joinable() 为 true，且外部无法接触 t_，这里直接安全 join()
        t_.join();
    }

    scoped_thread(const scoped_thread&) = delete;
    scoped_thread& operator=(const scoped_thread&) = delete;
};
```

> **与 C++20 `std::jthread` 的演进关系**：CCIA 2e 第 2 章同时介绍了 `joining_thread`（支持移动赋值的自动汇合线程包装），这正是 C++20 标准库正式采纳为 **`std::jthread`** 的直接原型！

### 2. 原书招牌案例：动态分块与异常安全的 `parallel_accumulate`

如何把 `std::accumulate(first, last, init)` 改造成工业级的多核并行算法？原书第 2.4 节给出的 `parallel_accumulate` 堪称并发分块计算的教科书典范，它同时解决了**四个关键工程细节**：

1. **最小任务粒度保护（`min_per_thread = 25`）**：创建操作系统内核线程至少需要数万个 CPU 周期。如果只有 10 个元素却开 8 个线程，线程启动和切换开销会比实际加法计算慢百倍。因此必须规定每个线程至少处理 `min_per_thread` 个元素，得出上限 `max_threads = (length + min_per_thread - 1) / min_per_thread`。
2. **`hardware_concurrency()` 返回 `0` 的防御兜底**：标准规定当硬件平台无法探测逻辑核数时，`std::thread::hardware_concurrency()` 允许返回 `0`。若不兜底成 `2`，直接拿 `0` 当线程数会导致除零崩溃！
3. **跨线程返回结果且零锁竞争**：`std::thread` 的入口函数无法直接接收函数返回值。原书预先分配 `std::vector<T> results(num_threads)`，让第 $i$ 个工作线程通过引用参数 `T& result` 把局部总和写进专属槽位 `results[i]`。
4. **最后一个分块由主线程亲自计算 + 天然异常安全**：如果需要 `num_threads` 个执行流，我们只需创建 `num_threads - 1` 个新线程，**主线程自己负责算最后一块 `[block_start, last)`**，最后汇合 `results` 数组。

```cpp
// 文件名：ccia_ch2_parallel_accumulate.cpp
#include <algorithm>
#include <cassert>
#include <functional>
#include <iostream>
#include <iterator>
#include <numeric>
#include <thread>
#include <vector>

template <typename Iterator, typename T>
struct accumulate_block {
    void operator()(Iterator first, Iterator last, T& result) {
        result = std::accumulate(first, last, result);
    }
};

template <typename Iterator, typename T>
T parallel_accumulate(Iterator first, Iterator last, T init) {
    const unsigned long length = static_cast<unsigned long>(std::distance(first, last));
    if (length == 0) {
        return init;
    }

    const unsigned long min_per_thread = 25;
    const unsigned long max_threads = (length + min_per_thread - 1) / min_per_thread;
    const unsigned long hardware_threads = std::thread::hardware_concurrency();

    // 关键兜底：hardware_concurrency() 返回 0 时默认按 2 核计，并在硬件核数与任务上限间取较小值
    const unsigned long num_threads = std::min(
        hardware_threads != 0 ? hardware_threads : 2UL,
        max_threads
    );

    const unsigned long block_size = length / num_threads;

    std::vector<T> results(num_threads);
    // 注意：只开 num_threads - 1 个工作线程，因为主线程自己本身就是第 num_threads 个执行流！
    std::vector<std::thread> threads(num_threads - 1);

    Iterator block_start = first;
    for (unsigned long i = 0; i < (num_threads - 1); ++i) {
        Iterator block_end = block_start;
        std::advance(block_end, block_size);
        threads[i] = std::thread(
            accumulate_block<Iterator, T>(),
            block_start,
            block_end,
            std::ref(results[i])
        );
        block_start = block_end;
    }

    // 主线程亲自计算余下的最后一个数据块 [block_start, last)
    accumulate_block<Iterator, T>()(block_start, last, results[num_threads - 1]);

    // 汇合所有工作线程
    for (auto& entry : threads) {
        entry.join();
    }

    // 归并各块局部和（注意：浮点数加法不满足结合律，并行浮点求和与串行可能有微小舍入差异）
    return std::accumulate(results.begin(), results.end(), init);
}

int main() {
    std::vector<long long> data(10000);
    std::iota(data.begin(), data.end(), 1LL); // 1 .. 10000
    long long sum = parallel_accumulate(data.begin(), data.end(), 0LL);
    assert(sum == 50005000LL);
    std::cout << "[CON-51] parallel_accumulate(1..10000) = " << sum << "\n";
    return 0;
}
```

---

## 二、Ch3 共享数据保护进阶：消除接口固有竞态的 threadsafe_stack、层级锁 hierarchical_mutex 与延迟初始化 (CON-52)

很多初学者认为：“要写一个线程安全的栈，只要在 `std::stack` 外面包一层，给 `empty()`、`top()`、`pop()`、`push()` 每个成员函数内部都加上 `std::lock_guard<std::mutex>` 不就万事大吉了吗？”

Anthony Williams 在第 3.2 节一针见血地指出：**即便每个成员函数内部都加了锁，模仿 STL `std::stack` 拆分开的 `empty()` + `top()` + `pop()` 接口依然存在致命的“接口固有条件竞争（Interface-Inherent Race Condition）”！**

### 1. 剖析 `empty()` + `top()` + `pop()` 的双线程踩踏与异常安全死结

假设栈里当前有 2 个元素 `[10, 20]`（`20` 在栈顶），即使 `empty()`、`top()`、`pop()` 各自内部都加锁，看两个线程交错执行时会发生什么：

```text
时间轴    线程 A                              线程 B                              底层栈状态
──────   ────────────────────────────────   ────────────────────────────────   ─────────────
 t1      if (!s.empty()) // true                                               [10, 20]
 t2                                         if (!s.empty()) // 也是 true！      [10, 20]
 t3      int v1 = s.top(); // 拿到 20                                          [10, 20]
 t4                                         int v2 = s.top(); // 也拿到 20！   [10, 20]
 t5      s.pop(); // 弹出 20                                                   [10]
 t6                                         s.pop(); // 弹出 10！               []
结果：元素 20 被两个线程重复处理了两次，而元素 10 连看都没被看一眼就被静默丢弃了！
```

更隐蔽的问题是：**为什么标准库 `std::stack::pop()` 当初不设计成直接返回弹出值 `T pop()`，而要拆成 `T& top()` 和 `void pop()`？**
这是当年汤姆·卡吉尔（Tom Cargill）著名的异常安全难题：如果 `T pop()` 先把元素从底层容器里删掉，再按值返回 `T`，万一在拷贝/移动构造返回值 `T` 给调用方时**抛出了内存不足等异常**，那个已经出栈的元素就会**永远从宇宙中消失（既不在栈里，也没传给调用者）**！

在单线程里拆成 `top()` 和 `pop()` 可以保证强异常安全；但在多线程下，拆分两步必出竞态！原书第 3 章是如何完美破解这个两难死结的？

- **重载 1：`void pop(T& value)`**——调用方在栈上预先构造好一个变量 `value`，按引用传进 `pop(value)`。在锁的保护下先执行 `value = data.top();`（若此处赋值抛异常，栈本身丝毫未动！），赋值成功后再调用 `data.pop();`。
- **重载 2：`std::shared_ptr<T> pop()`**——在锁内直接用 `std::make_shared<T>(data.top())` 分配智能指针（若分配失败抛异常，栈依然未动！），成功后再执行 `data.pop()` 并返回 `std::shared_ptr<T>`（智能指针的拷贝/返回是 `noexcept` 决不抛异常的！）。

### 2. 原书完整实现：无接口竞态的 `threadsafe_stack<T>`

```cpp
// 文件名：ccia_ch3_threadsafe_stack.hpp
#include <exception>
#include <memory>
#include <mutex>
#include <stack>

struct empty_stack : std::exception {
    const char* what() const noexcept override {
        return "empty_stack: cannot pop from an empty threadsafe_stack";
    }
};

template <typename T>
class threadsafe_stack {
private:
    std::stack<T> data_;
    mutable std::mutex m_;

public:
    threadsafe_stack() = default;

    // 支持线程安全的拷贝构造：锁住源对象的互斥量后再拷贝底层容器
    threadsafe_stack(const threadsafe_stack& other) {
        std::lock_guard<std::mutex> lock(other.m_);
        data_ = other.data_;
    }

    threadsafe_stack& operator=(const threadsafe_stack&) = delete;

    void push(T new_value) {
        std::lock_guard<std::mutex> lock(m_);
        data_.push(std::move(new_value));
    }

    // 重载 1：返回 std::shared_ptr<T>，拷贝智能指针绝不抛异常
    std::shared_ptr<T> pop() {
        std::lock_guard<std::mutex> lock(m_);
        if (data_.empty()) {
            throw empty_stack();
        }
        // 在修改栈之前先分配 shared_ptr；若 make_shared 抛异常，data_ 完好无损
        std::shared_ptr<T> const res(std::make_shared<T>(std::move(data_.top())));
        data_.pop();
        return res;
    }

    // 重载 2：接收输出引用 T& value，赋值成功后再 pop
    void pop(T& value) {
        std::lock_guard<std::mutex> lock(m_);
        if (data_.empty()) {
            throw empty_stack();
        }
        value = std::move(data_.top());
        data_.pop();
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(m_);
        return data_.empty();
    }
};
```

### 3. 原书完整实现：运行期死锁检测利器——层级互斥锁 `hierarchical_mutex`

当两个互斥量需要在同一个函数里同时加锁时，我们可以用 C++17 `std::scoped_lock(m1, m2)`（底层采用死锁避免算法 `std::lock`）。但如果是**跨多个函数调用层层加锁**（例如上层业务函数先锁了 `high_level_mutex`，调用底层日志模块时又去锁 `low_level_mutex`），`std::scoped_lock` 就无能为力了。

为了把“违反加锁顺序导致的潜在死锁”在开发测试期立即揪出来，Anthony Williams 在第 3.2.5 节设计了遵循 `Lockable` 概念（可直接塞进 `std::lock_guard<hierarchical_mutex>`）的 **层级互斥锁 `hierarchical_mutex`**：
- 给每把锁在构造时赋予一个层级编号 `hierarchy_value_`（例如顶层 UI 锁 `10000`，中层业务锁 `6000`，底层存储锁 `1000`）。
- 用线程局部存储 `thread_local unsigned long this_thread_hierarchy_value(ULONG_MAX)` 记录**当前线程目前已经持有的最低层级锁编号**。
- **硬性铁律**：当前线程想要加新锁时，新锁的 `hierarchy_value_` 必须 **严格小于** `this_thread_hierarchy_value`（只允许从高层级向低层级单向加锁）。一旦有人企图持有 `1000` 的底层锁再去反向加 `6000` 的中层锁（或重复加同级锁），`check_for_hierarchy_violation()` 立即抛出 `std::logic_error`！

```cpp
// 文件名：ccia_ch3_hierarchical_mutex.hpp
#include <climits>
#include <mutex>
#include <stdexcept>

class hierarchical_mutex {
    std::mutex internal_mutex_;
    unsigned long const hierarchy_value_;
    unsigned long previous_hierarchy_value_;
    // 每个线程独立维护当前已持有的锁层级（初始为 ULONG_MAX，代表尚未持有任何层级锁）
    static inline thread_local unsigned long this_thread_hierarchy_value_{ULONG_MAX};

    void check_for_hierarchy_violation() {
        if (this_thread_hierarchy_value_ <= hierarchy_value_) {
            throw std::logic_error("mutex hierarchy violated: potential deadlock detected!");
        }
    }

    void update_hierarchy_value() {
        previous_hierarchy_value_ = this_thread_hierarchy_value_;
        this_thread_hierarchy_value_ = hierarchy_value_;
    }

public:
    explicit hierarchical_mutex(unsigned long value)
        : hierarchy_value_(value), previous_hierarchy_value_(0) {}

    void lock() {
        check_for_hierarchy_violation();
        internal_mutex_.lock();
        update_hierarchy_value();
    }

    void unlock() {
        if (this_thread_hierarchy_value_ != hierarchy_value_) {
            throw std::logic_error("mutex hierarchy violated: unlock out of order!");
        }
        // 解锁时恢复到加此锁之前的上一层层级值
        this_thread_hierarchy_value_ = previous_hierarchy_value_;
        internal_mutex_.unlock();
    }

    bool try_lock() {
        check_for_hierarchy_violation();
        if (!internal_mutex_.try_lock()) {
            return false;
        }
        update_hierarchy_value();
        return true;
    }
};
```

### 4. 保护极少更新的数据：延迟初始化（`std::call_once` / Meyers Singleton）与读写锁 `dns_cache`

在 CCIA 第 3.3 节中，作者对比了三种不需要每次都用排他锁拼抢的特殊保护模式：

| 并发保护场景 | CCIA 2e 推荐标准写法 | 核心机制与避坑要点 |
| --- | --- | --- |
| **全局/局部静态单例初始化** | C++11 局部 `static` 变量（Meyers Singleton） | C++11 标准强制保证局部 `static` 变量的初始化是线程安全的，只有第一个到达的线程执行构造，其余线程阻塞等待其完成，彻底淘汰充满 UB 的手写双重检查锁（DCLP）。 |
| **类成员变量延迟初始化** | `std::once_flag` + `std::call_once(flag, fn)` | 每个对象实例可拥有自己的 `std::once_flag` 成员（不可拷贝/移动）；若初始化函数抛异常，本次不算成功，下一个线程会继续重试。 |
| **读占 99%、写占 1% 的路由/DNS 表** | C++17 `std::shared_mutex`（或 C++14 `std::shared_timed_mutex`） | 读操作 `find_entry()` 使用 `std::shared_lock<std::shared_mutex>` 允许多线程完全并行读取；写操作 `update_or_add_entry()` 使用 `std::lock_guard<std::shared_mutex>` 排他独占。 |

---

## 三、Ch4 同步并发与异步任务传递：future / packaged_task / promise / shared_future 与函数式并发快速排序 (CON-53)

如果说条件变量 `std::condition_variable` 是为了等待**可重复发生的持续条件**（比如队列不断有新消息到达），那么 C++11 引入的 **Future 家族** 就是专门用来等待**一次性事件（One-Off Event）并跨线程安全传递返回值或异常**的利器。

### 1. 四大异步构件全景对比：`async`、`packaged_task`、`promise` 与 `shared_future`

```text
                  ┌─── 1. std::async(policy, fn, args...) ──┐
                  │    (自动创建或延迟调度，直接返回 future)  │
                  │                                         ▼
生产者/写端 ──────┼─── 2. std::packaged_task<R(Args...)> ──▶ [ 共享状态 Shared State ]
(设置值或异常)     │    (包装可调用对象，被调用时自动填结果)   │  (存储 R 或 exception_ptr)
                  │                                         ▲
                  └─── 3. std::promise<R> ──────────────────┘
                       (显式调用 set_value / set_exception)
                                                            │
                                      ┌─────────────────────┴─────────────────────┐
                                      ▼                                           ▼
消费者/读端                 std::future<R> (独占只移动)              std::shared_future<R> (可拷贝)
(阻塞等待或取结果)          仅允许 1 个消费者调 .get()               允许多个工作线程各自持副本并发 .get()
```

| 异步构件 | 核心职责与原书典型应用场景 | 关键陷阱与注意事项 |
| --- | --- | --- |
| **`std::async`** | 快速启动异步计算任务。支持 `std::launch::async`（必开独立线程）与 `std::launch::deferred`（惰性求值，直到调 `wait()`/`get()` 时才在当前线程同步执行）。 | 默认策略是 `async \| deferred`，系统负载高时可能退化为串行；且 `std::async` 返回的 `future` 若不赋给变量保存，其**临时对象在语句末尾析构时会死等任务完成**，导致伪异步变串行！ |
| **`std::packaged_task<Sig>`** | 将任意函数/Lambda 绑定到一个异步共享状态上。通过 `.get_future()` 拿到凭据，再把 `packaged_task` 移动进**GUI 主线程消息队列**或**自定义线程池工作队列**。 | `packaged_task` 是**只可移动（Move-Only）**对象；这使得标准 `std::function<void()>`（要求可拷贝）无法直接容纳它，必须手写第 9 章的 `function_wrapper`。 |
| **`std::promise<T>`** | 无需绑定函数，直接在任意时刻手动调用 `set_value(v)` 或 `set_exception(std::current_exception())` 兑现承诺。极度适合**单线程网络 I/O 事件循环（Reactor / epoll）解耦请求与响应回调**。 | 若 `promise` 在销毁前既没调 `set_value` 也没调 `set_exception`，等待方调用 `fut.get()` 会捕获到 `std::future_errc::broken_promise` 异常。 |
| **`std::shared_future<T>`** | 由 `std::future::share()` 转移而来。普通 `future::get()` 会移动走内部数据导致二次调用 UB；而 `shared_future::get()` 返回 `const T&`（或副本），支持**一写多读广播通知**。 | **极其重要**：虽然多个线程可以通过 `shared_future` 读同一个共享状态，但如果多个线程**同时读写同一个 `shared_future` 对象实例**仍有数据竞争！正确做法是**给每个线程传一份 `shared_future` 的拷贝副本**。 |

### 2. 原书第 4 章点睛之作：函数式并发快速排序 `parallel_quick_sort`

传统的面向对象并发编程总是围绕“共享状态 + 加哪把锁”打转。Anthony Williams 在第 4.4 节展示了如何用 **函数式编程（Functional Programming, FP）范式** 写出**零共享可变状态、零互斥锁、天然无数据竞争**的并行快速排序 `parallel_quick_sort`：

1. 输入一个 `std::list<T> input`（按值接收，纯函数风格，绝不修改外部状态），若为空则直接返回。
2. 用 `result.splice(result.begin(), input, input.begin())` 切下链表头节点作为基准值 **`pivot`**（`std::list::splice` 只改链表指针，常数时间 $O(1)$ 且不拷贝元素）。
3. 用 `std::partition` 将剩余节点原地划分为“严格小于 `pivot` 的左半区”和“大于等于 `pivot` 的右半区”，再用 `splice` 把左半区整段切到局部链表 `lower_part`。
4. **核心并行点**：通过 `std::async(&parallel_quick_sort<T>, std::move(lower_part))` 把左半区扔给异步任务去递归排序，同时**当前线程自己直接递归调用 `parallel_quick_sort(std::move(input))` 排序右半区**！
5. 最后两次 `splice` 把排好序的右半区与 `new_lower.get()` 拼接到 `pivot` 两侧返回。

```cpp
// 文件名：ccia_ch4_parallel_quick_sort.cpp
#include <algorithm>
#include <cassert>
#include <future>
#include <iostream>
#include <list>
#include <utility>

template <typename T>
std::list<T> parallel_quick_sort(std::list<T> input) {
    if (input.empty()) {
        return input;
    }

    std::list<T> result;
    // 1. 取首元素作为 pivot 移入 result
    result.splice(result.begin(), input, input.begin());
    T const& pivot = *result.begin();

    // 2. 按 pivot 原地划分 input，返回第一个 >= pivot 的迭代器 divide_point
    auto divide_point = std::partition(
        input.begin(), input.end(),
        [&](T const& t) { return t < pivot; }
    );

    // 3. 将 < pivot 的前半段整段切入 lower_part
    std::list<T> lower_part;
    lower_part.splice(lower_part.end(), input, input.begin(), divide_point);

    // 4. 左半段交给 std::async 异步递归（运行时可自动根据负载决定开新线程或 deferred），
    //    当前线程直接递归排右半段 input
    std::future<std::list<T>> new_lower(
        std::async(&parallel_quick_sort<T>, std::move(lower_part))
    );
    auto new_higher(parallel_quick_sort(std::move(input)));

    // 5. 拼接：[new_lower] + [pivot] + [new_higher]
    result.splice(result.end(), new_higher);
    result.splice(result.begin(), new_lower.get());
    return result;
}
```

---

## 四、Ch5 C++ 内存模型与原子操作深潜：Modification Order、6 种 memory_order 与释放序列 (CON-54)

第 5 章是全书理论最深邃、也是面试与无锁编程最核心的一章。要真正读懂 C++11 内存模型，必须先分清原书定义的**四个形式化关系**。

### 1. 四大基石：修改顺序、Sequenced-Before、Synchronizes-With 与 Happens-Before

1. **修改顺序（Modification Order）**：
   对于程序中的**每一个单独的原子变量**，所有线程对它执行的所有写操作（Store / RMW），在全系统内都存在一个**所有线程达成共识的单一全序（Total Order）**。
   - 这意味着：哪怕使用最弱的 `memory_order_relaxed`，一旦某个线程观测到了原子变量 `a` 的新值 $V_2$，该线程后续对**同一个变量 `a`** 的读取，就**绝对不可能时光倒流**再读回排在 $V_2$ 之前的旧值 $V_1$！
   - 但是！在非 `seq_cst` 内存序下，**不同原子变量各自的修改顺序之间没有全局相对顺序共识**（线程 A 可以认为 `x` 先变、`y` 后变，而线程 B 同时看到 `y` 先变、`x` 后变）。
2. **按序先行（Sequenced-Before）**：**单线程内部**的求值先后顺序。如果语句 $A$ 在同一个线程里排在语句 $B$ 前面，则 $A$ is sequenced-before $B$。
3. **同步关系（Synchronizes-With）**：**跨线程原子操作之间**的配对桥梁。最典型的配对是：线程 A 对原子变量 `M` 执行带 **Release（释放）** 语义的写操作 $W$，线程 B 对**同一个原子变量 `M`** 执行带 **Acquire（获取）** 语义的读操作 $R$，且 $R$ 读到了 $W$ 写入的值（或由 $W$ 引领的**释放序列 Release Sequence** 中的值），那么写操作 $W$ **synchronizes-with** 读操作 $R$。
4. **先行发生（Happens-Before / Inter-thread Happens-Before）**：决定“一个线程写的普通非原子内存，另一个线程能不能保证看见”的终极裁判法则，具有**传递性**：

```text
线程 A (生产者)                                   线程 B (消费者)
──────────────────────────────                   ──────────────────────────────
[1] data = 42; (普通非原子写)
       │
       │ Sequenced-Before (单线程内先后)
       ▼
[2] ready.store(true, memory_order_release); ══▶ [3] while (!ready.load(memory_order_acquire));
                               Synchronizes-With        │
                               (跨线程 Release-Acquire) │ Sequenced-Before (单线程内先后)
                                                        ▼
                                                 [4] assert(data == 42); // 必然成立！
```

由传递链 `[1] Sequenced-Before [2]` + `[2] Synchronizes-With [3]` + `[3] Sequenced-Before [4]`，推导出 **`[1] Happens-Before [4]`**，因此 `[4]` 读取普通变量 `data` 既没有 Data Race UB，又必定读到 `42`！

### 2. 三大内存序模型与 6 种 `std::memory_order` 代码级对比

C++ 标准在 `<atomic>` 中定义了 6 个枚举值，原书将其归纳为**三套一致性模型**：

| 一致性模型 | 包含的枚举值 | 跨线程同步与重排约束 | 典型底层指令（x86-64 vs ARM64） |
| --- | --- | --- | --- |
| **1. 顺序一致模型** | `memory_order_seq_cst`（默认） | 在满足 Acquire-Release 的基础上，额外保证**所有线程对所有 `seq_cst` 操作看到同一条全局总时间线（Single Total Order）**。 | x86 Store: `xchg` (含隐式 `LOCK`) 或 `mov + mfence`<br/>ARM64: `stlr` + `ldar` |
| **2. 获取-释放模型** | `memory_order_acquire`（读）<br/>`memory_order_release`（写）<br/>`memory_order_acq_rel`（读改写）<br/>`memory_order_consume`（依赖读，不建议用） | **成对建立 Synchronizes-With**：`release` 禁止此前的任何读写越过它往下重排；`acquire` 禁止此后的任何读写越过它往上重排。不保证不相关原子变量间的全局总序。 | x86: TSO 天然满足，普通 `mov`（仅禁编译器重排）<br/>ARM64: `ldar` (Acquire) / `stlr` (Release) |
| **3. 松散模型** | `memory_order_relaxed` | **无任何跨变量同步关系**！只保证当前单个原子变量自身的不可撕裂性与自身修改顺序（Modification Order）。 | x86 / ARM64: 普通单条寄存器加载/存储指令 `mov` / `ldr` / `str` |

#### 经典对照实验：为什么 `relaxed` 会让 `y == 1` 先被看见，而 `x` 还是 `0`？

在原书第 5.3.3 节清单 5.5 中，如果线程 1 先后用 `relaxed` 写入 `x = true` 和 `y = true`，线程 2 用 `relaxed` 循环等待 `y` 变为 `true` 后立刻读取 `x`：
- 在 `memory_order_relaxed` 下，编译器和弱内存序 CPU（如 ARM）完全可以把对不同变量 `x` 和 `y` 的写入重排，或者由于 Store Buffer / Invalidation Queue 延迟，导致线程 2 **已经看到了后写的 `y == true`，却依然读到先写的 `x == false`（触发断言失败）**！
- 一旦把对 `y` 的写改为 `memory_order_release`、对 `y` 的读改为 `memory_order_acquire`，`y` 的写与读就构成了 **Synchronizes-With** 关系，从而强制保证了在 `y.store` 之前的 `x.store(true, relaxed)` **Happens-Before** `y.load` 之后的 `x.load(relaxed)`，断言 `assert(x.load() == true)` 就 100% 永不失败！

### 3. 什么是释放序列（Release Sequence）与内存栅栏（`std::atomic_thread_fence`）？

很多读者会有疑问：**如果生产者线程 `store(count, release)` 放入了任务数 `10`，随后多个消费者线程纷纷对 `count` 执行 `fetch_sub(1, relaxed)`，后面的消费者读到的明明不是生产者当初写的 `10`，而是被别的消费者改过后的 `9`、`8`、`7`，还能和最初的生产者构成 `Synchronizes-With` 吗？**

答案是：**能！这就是 C++ 内存模型中精妙的“释放序列（Release Sequence）”规则**：
> 当一个线程对原子变量 $M$ 执行了 `release` 写操作 $W$ 后，后续**任意线程**对 $M$ 执行的一连串**原子读-改-写操作（RMW，如 `fetch_sub`、`compare_exchange_weak`）**——**哪怕这些 RMW 操作使用的是 `memory_order_relaxed`**——它们写入的新值都会延续由 $W$ 开启的释放序列！任何带有 `acquire` 的读操作只要读到了这个链条上的任意一个值，依然与最初的 `release` 写操作 $W$ 建立完整的 **Synchronizes-With** 同步关系！

此外，原书第 5.3.6 节与第 5.2.2 节还展示了脱离具体原子变量的独立**内存栅栏 `std::atomic_thread_fence`**，以及全标准唯一保证 100% 无锁的 **`std::atomic_flag` 自旋锁 `spinlock_mutex`**：

```cpp
// 文件名：ccia_ch5_memory_order_and_spinlock.cpp
#include <atomic>
#include <cassert>
#include <iostream>
#include <thread>
#include <vector>

// 1. 原书清单 5.1：基于 std::atomic_flag 的标准自旋互斥锁
class spinlock_mutex {
    std::atomic_flag flag_ = ATOMIC_FLAG_INIT;
public:
    void lock() {
        // test_and_set 使用 acquire 语义：若此前为 false 则置为 true 并返回 false（成功抢到锁）；
        // 若此前已为 true 则一直自旋等待
        while (flag_.test_and_set(std::memory_order_acquire)) {
            // C++20 可配合 flag_.wait(true, std::memory_order_relaxed) 降低 CPU 空转功耗
        }
    }
    void unlock() {
        // clear 使用 release 语义：将 flag_ 重置为 false，并发布临界区内的所有内存修改
        flag_.clear(std::memory_order_release);
    }
};

// 2. 原书清单 5.11：演示 Release Sequence（释放序列）在一写多读队列中的威力
std::vector<int> queue_data;
std::atomic<int> count{0};

void populate_queue() {
    unsigned const number_of_items = 20;
    queue_data.clear();
    for (unsigned i = 0; i < number_of_items; ++i) {
        queue_data.push_back(static_cast<int>(i * 10));
    }
    // The Initial Store: 开启释放序列
    count.store(number_of_items, std::memory_order_release);
}

void consume_queue_items(std::atomic<int>& total_consumed) {
    while (true) {
        int item_index = 0;
        // fetch_sub 是原子读-改-写（RMW），它既延续了 populate_queue 的释放序列，
        // 又通过 acquire 与最初的 count.store(..., release) 建立 Synchronizes-With！
        if ((item_index = count.fetch_sub(1, std::memory_order_acquire)) <= 0) {
            break;
        }
        // 安全读取非原子 vector 中的元素，绝无 Data Race！
        int val = queue_data[item_index - 1];
        total_consumed.fetch_add(val, std::memory_order_relaxed);
    }
}
```

---

## 五、Ch6 基于锁的高并发数据结构设计：虚拟头节点双锁并发队列与分桶并发哈希表 (CON-55)

如何让基于锁的并发容器逼近甚至超越复杂无锁结构的吞吐量？Anthony Williams 在第 6 章给出了两条黄金设计准则：**第一，将大锁拆分为保护不同结构部位的细粒度锁（Fine-Grained Locking）；第二，将内存分配等昂贵操作全部移到互斥锁临界区之外！**

### 1. 为什么单把 `std::mutex` 保护队列时，`push()` 和 `pop()` 会互相卡脖子？

在传统的单锁队列（底层包装 `std::queue<T>`）中，整条队列只有一把 `mut`。当生产者调用 `push()` 往队尾塞数据时，消费者哪怕只是想从队头 `pop()` 取数据，也必须干等着这把唯一的锁。

更糟糕的是，如果直接手写一个普通单链表队列（`head` 指向队头，`tail` 指向队尾），想用 `head_mutex` 保护 `head`、用 `tail_mutex` 保护 `tail`，你会撞上一堵墙：**当队列里只有 1 个节点（甚至为空）时，`head` 和 `tail` 指向的是同一个节点！** 此时 `push()` 修改 `tail->next` 与 `pop()` 读取 `head->next` 访问的是同一块内存，依然被迫同时锁住两把锁！

### 2. 原书神来之笔：引入虚拟尾节点（Dummy Node）的细粒度双锁队列 `threadsafe_queue<T>`

为了彻底切断 `head` 和 `tail` 之间的耦合，Anthony Williams 在第 6.2.3 节引入了一个**永远存在于队尾的空壳虚拟节点（Dummy Node）**：

```text
初始空队列状态（head 与 tail 均指向预先分配的 Dummy Node，但此时不可 pop）：
  head ──┐
         ▼
       [ Dummy (data=nullptr, next=nullptr) ]
         ▲
  tail ──┘

执行 push(42) 时（在锁外先分配好新数据 ptr 和新 Dummy 节点，再加 tail_mutex 改两个指针）：
  head ────────────────┐
                       ▼
       [ Node (data=42, next) ] ──▶ [ New Dummy (data=nullptr, next=nullptr) ]
                                      ▲
  tail ───────────────────────────────┘
```

看看这个设计有多么精妙：
1. **队列永远至少包含 1 个虚拟节点**：只要队列非空（`head.get() != get_tail()`），`head` 指向的真数据节点与 `tail` 指向的虚拟尾节点**绝对不是同一个节点**！
2. **`push()` 锁外预分配 + 极短临界区**：生产者在加 `tail_mutex` **之前**，就已经在堆上分配好了 `std::make_shared<T>(std::move(new_value))` 和新的虚拟节点 `std::unique_ptr<node> p(new node)`。进入 `tail_mutex` 后，**仅仅执行两句指针赋值**就立即释放锁！
3. **`pop_head()` 与 `push()` 完全并发**：消费者加 `head_mutex` 时，只需要极短暂地调一次 `get_tail()` 读取当前 `tail` 指针做相等比较，随后立即释放 `tail_mutex`。**`pop` 摘除旧头节点与 `push` 挂载新尾节点真正做到了同时并行执行、互不阻塞**！

```cpp
// 文件名：ccia_ch6_fine_grained_queue.hpp
#include <condition_variable>
#include <memory>
#include <mutex>

template <typename T>
class threadsafe_queue {
private:
    struct node {
        std::shared_ptr<T> data;
        std::unique_ptr<node> next;
    };

    std::mutex head_mutex_;
    std::unique_ptr<node> head_;
    std::mutex tail_mutex_;
    node* tail_;
    std::condition_variable data_cond_;

    node* get_tail() {
        std::lock_guard<std::mutex> tail_lock(tail_mutex_);
        return tail_;
    }

    std::unique_ptr<node> pop_head() {
        std::unique_ptr<node> old_head = std::move(head_);
        head_ = std::move(old_head->next);
        return old_head;
    }

    std::unique_lock<std::mutex> wait_for_data() {
        std::unique_lock<std::mutex> head_lock(head_mutex_);
        data_cond_.wait(head_lock, [&] { return head_.get() != get_tail(); });
        return head_lock;
    }

    std::unique_ptr<node> wait_pop_head() {
        std::unique_lock<std::mutex> head_lock(wait_for_data());
        return pop_head();
    }

    std::unique_ptr<node> wait_pop_head(T& value) {
        std::unique_lock<std::mutex> head_lock(wait_for_data());
        value = std::move(*head_->data);
        return pop_head();
    }

    std::unique_ptr<node> try_pop_head() {
        std::lock_guard<std::mutex> head_lock(head_mutex_);
        if (head_.get() == get_tail()) {
            return std::unique_ptr<node>();
        }
        return pop_head();
    }

    std::unique_ptr<node> try_pop_head(T& value) {
        std::lock_guard<std::mutex> head_lock(head_mutex_);
        if (head_.get() == get_tail()) {
            return std::unique_ptr<node>();
        }
        value = std::move(*head_->data);
        return pop_head();
    }

public:
    threadsafe_queue() : head_(new node), tail_(head_.get()) {}
    threadsafe_queue(const threadsafe_queue&) = delete;
    threadsafe_queue& operator=(const threadsafe_queue&) = delete;

    void push(T new_value) {
        // 关键优化：两次堆内存分配全部在锁外完成！
        std::shared_ptr<T> new_data(std::make_shared<T>(std::move(new_value)));
        std::unique_ptr<node> p(new node);
        {
            std::lock_guard<std::mutex> tail_lock(tail_mutex_);
            tail_->data = new_data;
            node* const new_tail = p.get();
            tail_->next = std::move(p);
            tail_ = new_tail;
        }
        data_cond_.notify_one();
    }

    std::shared_ptr<T> wait_and_pop() {
        std::unique_ptr<node> const old_head = wait_pop_head();
        return old_head->data;
    }

    void wait_and_pop(T& value) {
        std::unique_ptr<node> const old_head = wait_pop_head(value);
    }

    std::shared_ptr<T> try_pop() {
        std::unique_ptr<node> const old_head = try_pop_head();
        return old_head ? old_head->data : std::shared_ptr<T>();
    }

    bool try_pop(T& value) {
        std::unique_ptr<node> const old_head = try_pop_head(value);
        return static_cast<bool>(old_head);
    }

    bool empty() {
        std::lock_guard<std::mutex> head_lock(head_mutex_);
        return (head_.get() == get_tail());
    }
};
```

### 3. 原书完整实现：分桶读写锁并发哈希表 `threadsafe_lookup_table`

在第 6.3.1 节中，Anthony Williams 设计了一个支持高并发读写的键值查找表 `threadsafe_lookup_table<Key, Value, Hash>`：
- **分桶隔离（Lock Striping）**：哈希表由固定数量（默认为质数 `19`，质数桶能使简单取模哈希分布更均匀）的 `bucket_type` 桶组成。因为桶的数量在构造后固定不变，所以 `get_bucket(key)` **根本不需要加任何锁**！
- **每桶独立读写锁**：每个 `bucket_type` 内部维护一条 `std::list<bucket_value>` 链表和一把独立的 `mutable std::shared_mutex`。**不同桶的读写完全并行；同一个桶内的多线程查询（`value_for`）共享读锁并行，只有落入同一个桶的写操作（`add_or_update_mapping` / `remove_mapping`）才排他互斥**。
- **无死锁全局快照 `get_map()`**：当需要导出整张表的 `std::map<Key, Value>` 一致性快照时，严格按照**桶下标从 `0` 到 `buckets_.size() - 1` 的固定递增顺序**依次给所有桶加上 `std::unique_lock<std::shared_mutex>`，由于所有调 `get_map()` 的线程都遵循相同的下标加锁序，绝无死锁可能！

```cpp
// 文件名：ccia_ch6_threadsafe_lookup_table.hpp
#include <algorithm>
#include <functional>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <shared_mutex>
#include <utility>
#include <vector>

template <typename Key, typename Value, typename Hash = std::hash<Key>>
class threadsafe_lookup_table {
private:
    class bucket_type {
    private:
        using bucket_value = std::pair<Key, Value>;
        using bucket_data = std::list<bucket_value>;
        using bucket_iterator = typename bucket_data::iterator;
        using const_bucket_iterator = typename bucket_data::const_iterator;

        bucket_data data_;
        mutable std::shared_mutex mutex_;

        bucket_iterator find_entry_for(Key const& key) {
            return std::find_if(data_.begin(), data_.end(),
                [&](bucket_value const& item) { return item.first == key; });
        }

        const_bucket_iterator find_entry_for(Key const& key) const {
            return std::find_if(data_.cbegin(), data_.cend(),
                [&](bucket_value const& item) { return item.first == key; });
        }

    public:
        Value value_for(Key const& key, Value const& default_value) const {
            std::shared_lock<std::shared_mutex> lock(mutex_);
            const_bucket_iterator const found_entry = find_entry_for(key);
            return (found_entry == data_.cend()) ? default_value : found_entry->second;
        }

        void add_or_update_mapping(Key const& key, Value const& value) {
            std::unique_lock<std::shared_mutex> lock(mutex_);
            bucket_iterator const found_entry = find_entry_for(key);
            if (found_entry == data_.end()) {
                data_.push_back(bucket_value(key, value));
            } else {
                found_entry->second = value;
            }
        }

        void remove_mapping(Key const& key) {
            std::unique_lock<std::shared_mutex> lock(mutex_);
            bucket_iterator const found_entry = find_entry_for(key);
            if (found_entry != data_.end()) {
                data_.erase(found_entry);
            }
        }

        // 供 get_map() 导出快照使用
        std::shared_mutex& get_mutex() const { return mutex_; }
        const bucket_data& get_data() const { return data_; }
    };

    std::vector<std::unique_ptr<bucket_type>> buckets_;
    Hash hasher_;

    bucket_type& get_bucket(Key const& key) const {
        std::size_t const bucket_index = hasher_(key) % buckets_.size();
        return *buckets_[bucket_index];
    }

public:
    threadsafe_lookup_table(
        unsigned num_buckets = 19, Hash const& hasher = Hash())
        : buckets_(num_buckets), hasher_(hasher) {
        for (unsigned i = 0; i < num_buckets; ++i) {
            buckets_[i].reset(new bucket_type);
        }
    }

    threadsafe_lookup_table(threadsafe_lookup_table const&) = delete;
    threadsafe_lookup_table& operator=(threadsafe_lookup_table const&) = delete;

    Value value_for(Key const& key, Value const& default_value = Value()) const {
        return get_bucket(key).value_for(key, default_value);
    }

    void add_or_update_mapping(Key const& key, Value const& value) {
        get_bucket(key).add_or_update_mapping(key, value);
    }

    void remove_mapping(Key const& key) {
        get_bucket(key).remove_mapping(key);
    }

    // 按固定下标顺序 0 .. N-1 锁住所有桶，获取一致性全量快照，杜绝死锁
    std::map<Key, Value> get_map() const {
        std::vector<std::unique_lock<std::shared_mutex>> locks;
        locks.reserve(buckets_.size());
        for (unsigned i = 0; i < buckets_.size(); ++i) {
            locks.push_back(
                std::unique_lock<std::shared_mutex>(buckets_[i]->get_mutex())
            );
        }
        std::map<Key, Value> res;
        for (unsigned i = 0; i < buckets_.size(); ++i) {
            for (auto const& item : buckets_[i]->get_data()) {
                res.insert(item);
            }
        }
        return res;
    }
};
```

---

## 六、Ch7 无锁并发数据结构与三大内存回收难题：待删计数、风险指针（Hazard Pointers）与分离引用计数 (CON-56)

很多人以为写无锁栈（Lock-Free Treiber Stack）只要三行 `compare_exchange_weak` 就够了。Anthony Williams 在第 7 章用整整 50 页篇幅揭示了一个残酷真相：**在没有垃圾回收器（GC）的 C++ 里，无锁 `push` 很容易，但无锁 `pop` 的内存安全回收（Memory Reclamation）是并发编程皇冠上最荆棘的难题！**

### 1. 为什么无锁栈 `pop()` 直接 `delete old_head` 会引发 Use-After-Free 崩溃？

看最朴素的无锁 `pop` 伪代码：
```cpp
node* old_head = head.load();
while (old_head && !head.compare_exchange_weak(old_head, old_head->next));
// 如果在这里直接 delete old_head 会发生什么？
```
假设此时栈顶节点是 $A$，**线程 1** 和 **线程 2** 同时进入 `pop()`，都执行了 `old_head = head.load()`，此时两者的局部变量 `old_head` 都指向节点 $A$：
1. **线程 1** 动作极快，瞬间执行完 `head.compare_exchange_weak(old_head, old_head->next)` 把栈顶改成了 $A\to\text{next}$，然后立刻执行 **`delete old_head`** 把节点 $A$ 的内存归还给了操作系统或堆分配器！
2. 紧接着，刚刚被挂起的 **线程 2** 恢复运行，它准备评估 `while` 循环条件里的 **`old_head->next`**——**砰！线程 2 正在解引用一块已经被线程 1 销毁甚至被别的线程重新拿去写了别的数据的内存（Use-After-Free）**！

为了在不加锁的前提下安全 `delete` 弹出的节点，CCIA 第 7.2 节由浅入深实现了**三大无锁内存回收方案**：

### 2. 三大无锁内存回收方案全景拆解与代码实现

| 回收方案 | 核心原理（CCIA 第 7.2 节） | 优点 | 局限性 |
| --- | --- | --- | --- |
| **方案 1：待删链表 + `threads_in_pop` 原子计数** | 用 `std::atomic<unsigned> threads_in_pop` 统计当前正在执行 `pop()` 的线程总数。只有当 `threads_in_pop == 1`（说明此刻全世界只有我一个线程在 `pop`，绝无别人持有 `old_head`）时才直接 `delete` 并顺带清理历史待删链表 `to_be_deleted`；否则把 `old_head` 挂入待删链表。 | 实现简单、无外部表格开销，低并发下立刻释放内存。 | **高负载饥饿风险**：如果一直有线程进出 `pop()` 导致 `threads_in_pop` 永远不降到 `1`，待删链表会无限膨胀耗尽内存！ |
| **方案 2：风险指针（Hazard Pointers，Maged Michael 算法）** | 每个读线程在解引用 `old_head->next` **之前**，先把 `old_head` 登记到自己的全局槽位 `hp.store(old_head)`（贴上“生人勿删”告示），再**二次核对 `head.load() == old_head`**。弹出成功准备释放 `old_head` 时，扫描全局表 `outstanding_hazard_pointers_for(old_head)`：若无人登记则**立即 `delete`**；若有人登记则放入延迟回收表 `nodes_to_reclaim`。 | **内存占用严格有界**！最多只有 `max_hazard_pointers` 个节点被延迟释放，即使高并发也不会内存泄漏。 | 每次 `pop` 需要带 `seq_cst` 写风险指针并二次重读 `head`，且扫描全局风险指针数组有常数遍历开销（且该技术曾有 IBM 专利历史，现已过期）。 |
| **方案 3：内外分离双引用计数（Split Reference Counting）** | 为什么单个原子引用计数做不到无锁？因为“读指针”和“给目标节点内部引用计数 `+1`”是两步，中间节点可能已被删！原书将计数拆为两部分：与指针紧绑在一起的 **`external_count`（每次读指针时用双字 CAS 原子 `+1`）** 和节点内部的 **`internal_count`（读完后原子 `-1`）**。当节点出栈且内外计数总和归零时立即 `delete`！ | 完全自治，无需全局风险指针表或线程局部注册。 | 需要硬件支持双字原子 CAS（16 字节 `cmpxchg16b` / `counted_node_ptr`）；若不支持则会退化为内部互斥锁。 |

#### 方案 1 完整实现：带 `threads_in_pop` 原子计数与待删链表的 `lock_free_stack_ref_pop`

```cpp
// 文件名：ccia_ch7_lock_free_stack_reclaim.hpp
#include <atomic>
#include <memory>

template <typename T>
class lock_free_stack {
private:
    struct node {
        std::shared_ptr<T> data;
        node* next;
        explicit node(T const& data_)
            : data(std::make_shared<T>(data_)), next(nullptr) {}
    };

    std::atomic<node*> head_{nullptr};
    std::atomic<unsigned> threads_in_pop_{0};
    std::atomic<node*> to_be_deleted_{nullptr};

    static void delete_nodes(node* nodes) {
        while (nodes) {
            node* next = nodes->next;
            delete nodes;
            nodes = next;
        }
    }

    void chain_pending_nodes(node* nodes) {
        node* last = nodes;
        while (node* const next = last->next) {
            last = next;
        }
        chain_pending_nodes(nodes, last);
    }

    void chain_pending_nodes(node* first, node* last) {
        last->next = to_be_deleted_.load();
        while (!to_be_deleted_.compare_exchange_weak(last->next, first));
    }

    void chain_pending_node(node* n) {
        chain_pending_nodes(n, n);
    }

    void try_reclaim(node* old_head) {
        if (threads_in_pop_.load() == 1) {
            // 此时我是唯一在 pop() 里的线程，尝试把积压的待删链表一次性摘下来
            node* nodes_to_delete = to_be_deleted_.exchange(nullptr);
            // 双重校验：在刚才摘取待删链表的瞬间，有没有新线程闯入 pop()？
            if (!--threads_in_pop_) {
                // 依然没有其他线程进入过 pop()，积压链表里的所有节点绝对无人引用，安全全删！
                delete_nodes(nodes_to_delete);
            } else if (nodes_to_delete) {
                // 有新线程进入了 pop()，它可能拿到了当时栈顶的引用，把待删链表挂回去稍后再删
                chain_pending_nodes(nodes_to_delete);
            }
            // 而当前线程刚亲手从 head_ 摘下的 old_head，由于进入 try_reclaim 时 threads_in_pop_ == 1，
            // 晚来的线程根本不可能在 head_ 上看到过 old_head，因此 old_head 本身总是可以立即安全 delete！
            delete old_head;
        } else {
            // 有其他线程也在 pop() 中，old_head 可能正被别人握在手里，先挂入待删链表
            chain_pending_node(old_head);
            --threads_in_pop_;
        }
    }

public:
    ~lock_free_stack() {
        delete_nodes(head_.load());
        delete_nodes(to_be_deleted_.load());
    }

    void push(T const& data) {
        node* const new_node = new node(data);
        new_node->next = head_.load(std::memory_order_relaxed);
        while (!head_.compare_exchange_weak(
            new_node->next, new_node,
            std::memory_order_release, std::memory_order_relaxed));
    }

    std::shared_ptr<T> pop() {
        ++threads_in_pop_;
        node* old_head = head_.load(std::memory_order_acquire);
        while (old_head && !head_.compare_exchange_weak(
            old_head, old_head->next,
            std::memory_order_acquire, std::memory_order_relaxed));
        std::shared_ptr<T> res;
        if (old_head) {
            // 立即移走业务数据的 shared_ptr，让节点壳子减小体积
            res.swap(old_head->data);
        }
        try_reclaim(old_head);
        return res;
    }
};
```

#### 方案 2 核心机制：风险指针（Hazard Pointers）的二次校验协议

为什么风险指针必须写成一个 **`do-while` 双重内嵌循环**？看原书第 7.2.3 节的核心代码逻辑：

```cpp
// Hazard Pointer 读取保护的核心二重校验协议（CCIA 清单 7.6 精髓）
std::atomic<void*>& hp = get_hazard_pointer_for_current_thread();
node* old_head = head.load();
do {
    node* temp;
    do {
        temp = old_head;
        // 第 1 步：先把我准备解引用的指针 old_head 写入全局风险指针表
        hp.store(old_head);
        // 第 2 步：再次读取 head！为什么必须重读？
        // 因为在上方 old_head = head.load() 与 hp.store(old_head) 之间的微小空隙里，
        // 别的线程可能已经把 old_head 弹出并看到当时 hp 里还没它，从而已经把 old_head delete 了！
        old_head = head.load();
    } while (old_head != temp); // 若 head 已经变了，说明刚才登记晚了一步，重试！
} while (old_head && !head.compare_exchange_strong(old_head, old_head->next));
// 成功弹出后，清空本线程的风险指针槽位
hp.store(nullptr);
```

一旦通过了内层 `while (old_head != temp)`，就证明：**在 `hp.store(old_head)` 生效的那一刻，`old_head` 确实还稳稳当当地坐在栈顶 `head` 上没被任何人弹出**！因此后续哪怕别的线程抢先把它弹出，扫描风险指针表时也一定会看到 `hp == old_head`，绝不会在当前线程读 `old_head->next` 时将它 `delete`！

---

## 七、Ch8 并发算法与代码设计准则：异常安全、伪共享消除与 parallel_for_each / parallel_find (CON-57)

在第 8 章中，Anthony Williams 将并发程序设计提炼为**三大性能与正确性铁律**，并手把手实现了三个标准并行算法的工业级样板。

### 1. 并发代码设计的三大微架构与工程指标

1. **远离乒乓缓存（Cache Ping-Pong）与伪共享（False Sharing）**：
   - **高竞争原子变量引发乒乓缓存**：如果多个核在紧密循环里拼命对同一个 `std::atomic<unsigned long> counter` 执行 `fetch_add`，存放 `counter` 的那条 64 字节缓存行（Cache Line）会在各个 CPU 核心的 L1 Cache 之间来回传递所有权（MESI Exclusive/Modified 失效转移），多核甚至比单核慢十倍！
   - **独立变量挤在同一缓存行引发伪共享**：哪怕线程 0 只写 `data[0]`、线程 1 只写 `data[1]`，只要它们位于同一个 64 字节缓存行内，硬件依然会以整条缓存行为单位来回作废。原书建议使用 `alignas(std::hardware_destructive_interference_size)`（或 `alignas(64)`）对齐线程私有槽位。
2. **在异常面前确保所有已启动线程必被 `join()`**：
   在手写并行算法时，如果在启动了前 3 个 `std::thread` 后，创建第 4 个线程或 `std::promise` 时抛出了异常，前 3 个未汇合的线程在栈展开（Stack Unwinding）析构时会直接触发 `std::terminate()`！因此必须配备一个 **`join_threads` RAII 守卫**（接收 `std::vector<std::thread>&`，析构时自动遍历 `if (t.joinable()) t.join();`）。
3. **跨线程提前短路退出（Early Exit）**：
   对于 `std::find` 这类搜索算法，串行版一旦在第 5 个元素找到目标就会立刻停止后续 1000 万个元素的遍历；同理，并行版 `parallel_find` 也必须通过一个共享的 **`std::atomic<bool> done_flag(false)`** 让找到目标的那个线程第一时间通知所有其他兄弟线程“别找了，立即收工”！

### 2. 原书完整实现：分治 `parallel_for_each` 与原子短路退出的 `parallel_find`

```cpp
// 文件名：ccia_ch8_parallel_algorithms.hpp
#include <algorithm>
#include <atomic>
#include <exception>
#include <future>
#include <iterator>
#include <thread>
#include <vector>

// 原书清单 8.4：确保 vector<std::thread> 在任何异常路径下都能安全全部 join 的 RAII 守卫
class join_threads {
    std::vector<std::thread>& threads_;
public:
    explicit join_threads(std::vector<std::thread>& threads) : threads_(threads) {}
    ~join_threads() {
        for (unsigned long i = 0; i < threads_.size(); ++i) {
            if (threads_[i].joinable()) {
                threads_[i].join();
            }
        }
    }
};

// 1. 原书清单 8.8：基于 std::async 递归二分分治的异常安全 parallel_for_each
template <typename Iterator, typename Func>
void parallel_for_each(Iterator first, Iterator last, Func f) {
    unsigned long const length = static_cast<unsigned long>(std::distance(first, last));
    if (!length) {
        return;
    }
    unsigned long const min_per_thread = 25;
    if (length < (2 * min_per_thread)) {
        std::for_each(first, last, f);
    } else {
        Iterator const mid_point = first + length / 2;
        // 前半段交给 std::async 异步递归
        std::future<void> first_half = std::async(
            &parallel_for_each<Iterator, Func>, first, mid_point, f
        );
        // 当前线程直接递归处理后半段；若后半段抛异常，first_half 的析构函数会自动等待异步任务结束！
        parallel_for_each(mid_point, last, f);
        // propagate 前半段可能捕获的异常
        first_half.get();
    }
}

// 2. 原书清单 8.9：带 std::atomic<bool> 短路标志与 std::promise 结果交付的 parallel_find
template <typename Iterator, typename MatchType>
Iterator parallel_find(Iterator first, Iterator last, MatchType match) {
    struct find_element {
        void operator()(Iterator begin, Iterator end, MatchType match_val,
                        std::promise<Iterator>* result,
                        std::atomic<bool>* done_flag) {
            try {
                // 每步循环都用 relaxed/load 检查兄弟线程是否已经找到目标，实现毫秒级短路退出！
                for (; (begin != end) && !done_flag->load(); ++begin) {
                    if (*begin == match_val) {
                        // exchange(true) 保证哪怕两个线程同时找到，也只有唯一一个赢家去调用 set_value！
                        if (!done_flag->exchange(true)) {
                            result->set_value(begin);
                        }
                        return;
                    }
                }
            } catch (...) {
                // 若元素比较 operator== 抛出异常，同样通过 exchange(true) 抢占唯一权并将异常转发给主线程
                try {
                    if (!done_flag->exchange(true)) {
                        result->set_exception(std::current_exception());
                    }
                } catch (...) {}
            }
        }
    };

    unsigned long const length = static_cast<unsigned long>(std::distance(first, last));
    if (!length) {
        return last;
    }

    unsigned long const min_per_thread = 25;
    unsigned long const max_threads = (length + min_per_thread - 1) / min_per_thread;
    unsigned long const hardware_threads = std::thread::hardware_concurrency();
    unsigned long const num_threads = std::min(
        hardware_threads != 0 ? hardware_threads : 2UL, max_threads
    );
    unsigned long const block_size = length / num_threads;

    std::promise<Iterator> result;
    std::atomic<bool> done_flag(false);
    std::vector<std::thread> threads(num_threads - 1);
    {
        // 作用域内放置 join_threads 守卫：一旦所有线程汇合完毕，主线程即可立即检查 done_flag
        join_threads joiner(threads);
        Iterator block_start = first;
        for (unsigned long i = 0; i < (num_threads - 1); ++i) {
            Iterator block_end = block_start;
            std::advance(block_end, block_size);
            threads[i] = std::thread(
                find_element(), block_start, block_end, match, &result, &done_flag
            );
            block_start = block_end;
        }
        // 主线程亲自搜索最后一个分块
        find_element()(block_start, last, match, &result, &done_flag);
    }

    // 走出上方作用域时，join_threads 析构已确保所有工作线程 100% 汇合完毕
    if (!done_flag.load()) {
        return last;
    }
    return result.get_future().get();
}
```

---

## 八、Ch9~Ch10 高级线程管理：可等待任务、线程本地队列与工作窃取（Work-Stealing）线程池完整实现 (CON-58)

在全书压轴的第 9 章（高级线程管理）和第 10 章（并发测试与调试）中，Anthony Williams 一步步将最简陋的固定线程池演进为**工业级工作窃取线程池（Work-Stealing Thread Pool）**。

### 1. 为什么普通全局队列线程池在工程中会遭遇“锁瓶颈”与“嵌套死锁”？

初级线程池（所有 Worker 线程共同争抢同一个 `threadsafe_queue<std::function<void()>> work_queue`）在面对复杂分治任务（比如用线程池跑快速排序）时，会立刻暴露出**三大致命伤**：

1. **`std::function<void()>` 不支持只移动类型 `std::packaged_task`**：
   为了从线程池 `submit(f)` 拿到返回值 `std::future<ResultType>`，我们必须把 `f` 包装进 `std::packaged_task<ResultType()>`。然而 **`std::packaged_task` 是不可拷贝、只可移动（Move-Only）的**，而 C++11/14/17/20 的 `std::function` 强制要求被包装的目标对象必须可拷贝构造（CopyConstructible）！因此原书第 9.1.2 节专门手写了基于类型擦除的 **`function_wrapper`**。
2. **嵌套等待导致线程池饥饿死锁（Thread Pool Starvation Deadlock）**：
   假设线程池只有 4 个工作线程，4 个外层任务在池中执行时各自又向线程池 `submit()` 了子任务，并在原地调用 `child_future.get()` 阻塞等待子任务完成——此时 4 个工作线程全部被卡在 `.get()` 上，池子里根本没有空闲线程去跑队列里的子任务，**整个线程池瞬间永久死锁**！
   - **原书解法（`run_pending_task()` 主动帮工 Helping 机制）**：当一个任务需要等待子任务 `fut` 完成时，不要干睡在 `fut.wait()` 上，而是写 `while (fut.wait_for(0s) == future_status::timeout) { pool.run_pending_task(); }`——在等待期间**主动从线程池取出待办子任务并在当前线程帮着执行**，彻底消灭饥饿死锁！
3. **全局单队列的锁竞争与缓存颠簸**：
   当所有核心都在高频入队/出队微任务时，全局队列 `pool_work_queue` 的互斥锁会成为全系统的单点瓶颈。

### 2. 两级队列 + 工作窃取（Work-Stealing）架构原理

原书第 9.1.5 节最终成型的工作窃取线程池采用了**“每线程专属双端队列 `work_stealing_queue` + 全局兜底队列 `pool_work_queue`”**的两级架构：

```text
                       [ 外部线程 submit(task) ]
                                  │
                                  ▼
                  ┌───────────────────────────────┐
                  │ 全局队列 pool_work_queue       │
                  └───────────────────────────────┘
                         │                 │
         ┌───────────────┘                 └───────────────┐
         ▼                                                 ▼
┌─────────────────────────────────┐               ┌─────────────────────────────────┐
│ Worker 0 的 work_stealing_queue │               │ Worker 1 的 work_stealing_queue │
│  [队头 Front] ◀═══ [队尾 Back]   │               │  [队头 Front] ◀═══ [队尾 Back]   │
└───────┬──────────────────▲──────┘               └───────┬─────────────────────────┘
        │                  │                              │
  1. 本线程 push /          │                        2. 当 Worker 1 自己队列空、
     try_pop 都走队头       └────────────────────────── 全局队列也空时，跨线程从
     (LIFO：刚生成的子任务                              Worker 0 的【队尾 Back】
      数据还在 L1 热缓存里！)                           执行 try_steal() (FIFO)！
```

为什么要把 `work_stealing_queue` 设计为**本线程从队头 `push_front` / `pop_front`（LIFO 后进先出），而小偷线程从队尾 `pop_back`（FIFO 先进先出）**？
1. **最大化 CPU Cache 局部性**：当前线程刚刚拆解出来的子任务，其关联的数据此时正热乎乎地躺在该 CPU 核心的 L1/L2 Cache 里。本线程按 **LIFO（栈顺序）** 立刻从队头拿刚放进去的任务执行，缓存命中率极高！
2. **减少锁冲突并偷走“大块头”任务**：在分治算法（如快排）中，越早放进队列（位于**队尾**）的任务，往往对应分治树上层**粒度更大**的子树。小偷线程从**队尾（FIFO）**偷走一个大任务，就能自己忙活很久，大幅减少偷窃频次与队头/队尾的竞争！

---

## 九、全书核心组件一站式可编译验证工程（C++20 一键运行）

下面提供一份完整自包含、零外部依赖的 C++20 综合验证源码。它完整集成了原书 **Ch2 `scoped_thread` & `parallel_accumulate`**、**Ch3 `threadsafe_stack` & `hierarchical_mutex`**、**Ch6 虚拟节点双锁队列 `threadsafe_queue` & 分桶读写锁哈希表 `threadsafe_lookup_table`**、**Ch8 原子短路 `parallel_find`**，以及 **Ch9 类型擦除 `function_wrapper` + 双端队列 `work_stealing_queue` + 工业级工作窃取线程池 `thread_pool`（并用该工作窃取线程池驱动并发快速排序！）**。

你可以直接点击右上角「复制」或「WSL 一键运行」编译验证：

```cpp
// 文件名：ccia_mastery_all_in_one.cpp
// 编译命令：g++ -std=c++20 -O2 -pthread ccia_mastery_all_in_one.cpp -o ccia_mastery && ./ccia_mastery
#include <algorithm>
#include <atomic>
#include <cassert>
#include <chrono>
#include <climits>
#include <condition_variable>
#include <deque>
#include <exception>
#include <functional>
#include <future>
#include <iostream>
#include <iterator>
#include <list>
#include <map>
#include <memory>
#include <mutex>
#include <numeric>
#include <shared_mutex>
#include <stack>
#include <stdexcept>
#include <string>
#include <thread>
#include <type_traits>
#include <utility>
#include <vector>

namespace ccia {

// ============================================================================
// [CON-51] Ch2: scoped_thread 与 join_threads RAII 守卫
// ============================================================================
class scoped_thread {
    std::thread t_;
public:
    explicit scoped_thread(std::thread t) : t_(std::move(t)) {
        if (!t_.joinable()) {
            throw std::logic_error("No thread");
        }
    }
    ~scoped_thread() {
        t_.join();
    }
    scoped_thread(scoped_thread const&) = delete;
    scoped_thread& operator=(scoped_thread const&) = delete;
};

class join_threads {
    std::vector<std::thread>& threads_;
public:
    explicit join_threads(std::vector<std::thread>& threads) : threads_(threads) {}
    ~join_threads() {
        for (auto& t : threads_) {
            if (t.joinable()) {
                t.join();
            }
        }
    }
};

// ============================================================================
// [CON-52] Ch3: 消除接口竞态的 threadsafe_stack 与层级锁 hierarchical_mutex
// ============================================================================
struct empty_stack : std::exception {
    const char* what() const noexcept override { return "empty_stack"; }
};

template <typename T>
class threadsafe_stack {
    std::stack<T> data_;
    mutable std::mutex m_;
public:
    threadsafe_stack() = default;
    threadsafe_stack(const threadsafe_stack& other) {
        std::lock_guard<std::mutex> lock(other.m_);
        data_ = other.data_;
    }
    threadsafe_stack& operator=(const threadsafe_stack&) = delete;

    void push(T new_value) {
        std::lock_guard<std::mutex> lock(m_);
        data_.push(std::move(new_value));
    }

    std::shared_ptr<T> pop() {
        std::lock_guard<std::mutex> lock(m_);
        if (data_.empty()) throw empty_stack();
        std::shared_ptr<T> const res(std::make_shared<T>(std::move(data_.top())));
        data_.pop();
        return res;
    }

    void pop(T& value) {
        std::lock_guard<std::mutex> lock(m_);
        if (data_.empty()) throw empty_stack();
        value = std::move(data_.top());
        data_.pop();
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(m_);
        return data_.empty();
    }
};

class hierarchical_mutex {
    std::mutex internal_mutex_;
    unsigned long const hierarchy_value_;
    unsigned long previous_hierarchy_value_;
    static inline thread_local unsigned long this_thread_hierarchy_value_{ULONG_MAX};

    void check_for_hierarchy_violation() {
        if (this_thread_hierarchy_value_ <= hierarchy_value_) {
            throw std::logic_error("mutex hierarchy violated");
        }
    }
    void update_hierarchy_value() {
        previous_hierarchy_value_ = this_thread_hierarchy_value_;
        this_thread_hierarchy_value_ = hierarchy_value_;
    }
public:
    explicit hierarchical_mutex(unsigned long value)
        : hierarchy_value_(value), previous_hierarchy_value_(0) {}

    void lock() {
        check_for_hierarchy_violation();
        internal_mutex_.lock();
        update_hierarchy_value();
    }
    void unlock() {
        if (this_thread_hierarchy_value_ != hierarchy_value_) {
            throw std::logic_error("mutex hierarchy violated on unlock");
        }
        this_thread_hierarchy_value_ = previous_hierarchy_value_;
        internal_mutex_.unlock();
    }
    bool try_lock() {
        check_for_hierarchy_violation();
        if (!internal_mutex_.try_lock()) return false;
        update_hierarchy_value();
        return true;
    }
};

// ============================================================================
// [CON-55] Ch6: 虚拟尾节点细粒度双锁队列 threadsafe_queue 与分桶并发哈希表
// ============================================================================
template <typename T>
class threadsafe_queue {
private:
    struct node {
        std::shared_ptr<T> data;
        std::unique_ptr<node> next;
    };
    std::mutex head_mutex_;
    std::unique_ptr<node> head_;
    std::mutex tail_mutex_;
    node* tail_;
    std::condition_variable data_cond_;

    node* get_tail() {
        std::lock_guard<std::mutex> tail_lock(tail_mutex_);
        return tail_;
    }
    std::unique_ptr<node> pop_head() {
        std::unique_ptr<node> old_head = std::move(head_);
        head_ = std::move(old_head->next);
        return old_head;
    }
    std::unique_ptr<node> try_pop_head(T& value) {
        std::lock_guard<std::mutex> head_lock(head_mutex_);
        if (head_.get() == get_tail()) {
            return std::unique_ptr<node>();
        }
        value = std::move(*head_->data);
        return pop_head();
    }
public:
    threadsafe_queue() : head_(new node), tail_(head_.get()) {}
    threadsafe_queue(const threadsafe_queue&) = delete;
    threadsafe_queue& operator=(const threadsafe_queue&) = delete;

    void push(T new_value) {
        std::shared_ptr<T> new_data(std::make_shared<T>(std::move(new_value)));
        std::unique_ptr<node> p(new node);
        {
            std::lock_guard<std::mutex> tail_lock(tail_mutex_);
            tail_->data = new_data;
            node* const new_tail = p.get();
            tail_->next = std::move(p);
            tail_ = new_tail;
        }
        data_cond_.notify_one();
    }

    bool try_pop(T& value) {
        std::unique_ptr<node> const old_head = try_pop_head(value);
        return static_cast<bool>(old_head);
    }

    bool empty() {
        std::lock_guard<std::mutex> head_lock(head_mutex_);
        return (head_.get() == get_tail());
    }
};

template <typename Key, typename Value, typename Hash = std::hash<Key>>
class threadsafe_lookup_table {
private:
    class bucket_type {
        using bucket_value = std::pair<Key, Value>;
        using bucket_data = std::list<bucket_value>;
        bucket_data data_;
        mutable std::shared_mutex mutex_;
    public:
        Value value_for(Key const& key, Value const& default_value) const {
            std::shared_lock<std::shared_mutex> lock(mutex_);
            auto it = std::find_if(data_.cbegin(), data_.cend(),
                [&](auto const& item) { return item.first == key; });
            return (it == data_.cend()) ? default_value : it->second;
        }
        void add_or_update_mapping(Key const& key, Value const& value) {
            std::unique_lock<std::shared_mutex> lock(mutex_);
            auto it = std::find_if(data_.begin(), data_.end(),
                [&](auto const& item) { return item.first == key; });
            if (it == data_.end()) data_.emplace_back(key, value);
            else it->second = value;
        }
        std::shared_mutex& get_mutex() const { return mutex_; }
        bucket_data const& get_data() const { return data_; }
    };

    std::vector<std::unique_ptr<bucket_type>> buckets_;
    Hash hasher_;

    bucket_type& get_bucket(Key const& key) const {
        return *buckets_[hasher_(key) % buckets_.size()];
    }
public:
    explicit threadsafe_lookup_table(unsigned num_buckets = 19, Hash const& hasher = Hash())
        : buckets_(num_buckets), hasher_(hasher) {
        for (unsigned i = 0; i < num_buckets; ++i) {
            buckets_[i] = std::make_unique<bucket_type>();
        }
    }
    Value value_for(Key const& key, Value const& default_value = Value()) const {
        return get_bucket(key).value_for(key, default_value);
    }
    void add_or_update_mapping(Key const& key, Value const& value) {
        get_bucket(key).add_or_update_mapping(key, value);
    }
    std::map<Key, Value> get_map() const {
        std::vector<std::unique_lock<std::shared_mutex>> locks;
        locks.reserve(buckets_.size());
        for (auto const& b : buckets_) {
            locks.emplace_back(b->get_mutex());
        }
        std::map<Key, Value> res;
        for (auto const& b : buckets_) {
            for (auto const& item : b->get_data()) {
                res.insert(item);
            }
        }
        return res;
    }
};

// ============================================================================
// [CON-58] Ch9: 支持 Move-Only 任务的 function_wrapper、work_stealing_queue 与工作窃取线程池
// ============================================================================
class function_wrapper {
    struct impl_base {
        virtual void call() = 0;
        virtual ~impl_base() = default;
    };
    std::unique_ptr<impl_base> impl_;

    template <typename F>
    struct impl_type : impl_base {
        F f_;
        explicit impl_type(F&& f) : f_(std::move(f)) {}
        void call() override { f_(); }
    };
public:
    template <typename F>
    // 禁用对 function_wrapper 自身的重载劫持
    requires (!std::is_same_v<std::decay_t<F>, function_wrapper>)
    function_wrapper(F&& f) : impl_(new impl_type<std::decay_t<F>>(std::forward<F>(f))) {}

    void operator()() { impl_->call(); }

    function_wrapper() = default;
    function_wrapper(function_wrapper&& other) noexcept : impl_(std::move(other.impl_)) {}
    function_wrapper& operator=(function_wrapper&& other) noexcept {
        impl_ = std::move(other.impl_);
        return *this;
    }
    function_wrapper(const function_wrapper&) = delete;
    function_wrapper& operator=(const function_wrapper&) = delete;
};

class work_stealing_queue {
private:
    using data_type = function_wrapper;
    std::deque<data_type> the_queue_;
    mutable std::mutex the_mutex_;

public:
    work_stealing_queue() = default;
    work_stealing_queue(const work_stealing_queue&) = delete;
    work_stealing_queue& operator=(const work_stealing_queue&) = delete;

    // 本线程向队头压入最新子任务 (LIFO 热缓存)
    void push(data_type data) {
        std::lock_guard<std::mutex> lock(the_mutex_);
        the_queue_.push_front(std::move(data));
    }

    bool empty() const {
        std::lock_guard<std::mutex> lock(the_mutex_);
        return the_queue_.empty();
    }

    // 本线程从队头弹出最新任务 (LIFO)
    bool try_pop(data_type& res) {
        std::lock_guard<std::mutex> lock(the_mutex_);
        if (the_queue_.empty()) {
            return false;
        }
        res = std::move(the_queue_.front());
        the_queue_.pop_front();
        return true;
    }

    // 其他空闲线程从队尾窃取最老的大粒度任务 (FIFO)
    bool try_steal(data_type& res) {
        std::lock_guard<std::mutex> lock(the_mutex_);
        if (the_queue_.empty()) {
            return false;
        }
        res = std::move(the_queue_.back());
        the_queue_.pop_back();
        return true;
    }
};

class work_stealing_thread_pool {
private:
    using task_type = function_wrapper;

    std::atomic<bool> done_;
    threadsafe_queue<task_type> pool_work_queue_;
    std::vector<std::unique_ptr<work_stealing_queue>> queues_;
    std::vector<std::thread> threads_;
    join_threads joiner_;

    static inline thread_local work_stealing_queue* local_work_queue_{nullptr};
    static inline thread_local unsigned my_index_{0};

    void worker_thread(unsigned my_index) {
        my_index_ = my_index;
        local_work_queue_ = queues_[my_index_].get();
        while (!done_.load(std::memory_order_acquire)) {
            run_pending_task();
        }
    }

    bool pop_task_from_local_queue(task_type& task) {
        return local_work_queue_ && local_work_queue_->try_pop(task);
    }

    bool pop_task_from_pool_queue(task_type& task) {
        return pool_work_queue_.try_pop(task);
    }

    bool pop_task_from_other_thread_queue(task_type& task) {
        // 轮询其他工作线程的双端队列队尾执行 try_steal
        for (unsigned i = 0; i < queues_.size(); ++i) {
            unsigned const index = (my_index_ + i + 1) % queues_.size();
            if (queues_[index]->try_steal(task)) {
                return true;
            }
        }
        return false;
    }

public:
    work_stealing_thread_pool() : done_(false), joiner_(threads_) {
        unsigned const thread_count = std::max(2u, std::thread::hardware_concurrency());
        try {
            for (unsigned i = 0; i < thread_count; ++i) {
                queues_.push_back(std::make_unique<work_stealing_queue>());
            }
            for (unsigned i = 0; i < thread_count; ++i) {
                threads_.emplace_back(&work_stealing_thread_pool::worker_thread, this, i);
            }
        } catch (...) {
            done_ = true;
            throw;
        }
    }

    ~work_stealing_thread_pool() {
        done_.store(true, std::memory_order_release);
    }

    template <typename FunctionType>
    std::future<std::invoke_result_t<FunctionType>> submit(FunctionType f) {
        using result_type = std::invoke_result_t<FunctionType>;
        std::packaged_task<result_type()> task(std::move(f));
        std::future<result_type> res(task.get_future());
        if (local_work_queue_) {
            // 若提交者本身就是池内工作线程，直接压入自己的线程本地双端队列（零全局锁竞争！）
            local_work_queue_->push(std::move(task));
        } else {
            // 若提交者是外部主线程，压入全局工作队列
            pool_work_queue_.push(std::move(task));
        }
        return res;
    }

    // 主动执行一件待办任务：1. 先看本地队列 -> 2. 再看全局队列 -> 3. 最后去别的线程队尾偷任务！
    void run_pending_task() {
        task_type task;
        if (pop_task_from_local_queue(task) ||
            pop_task_from_pool_queue(task) ||
            pop_task_from_other_thread_queue(task)) {
            task();
        } else {
            std::this_thread::yield();
        }
    }
};

// 原书清单 9.5：使用工作窃取线程池 + run_pending_task() 帮工机制实现的无死锁并发快排
template <typename T>
struct sorter {
    work_stealing_thread_pool pool;

    std::list<T> do_sort(std::list<T>& chunk_data) {
        if (chunk_data.empty()) {
            return chunk_data;
        }
        std::list<T> result;
        result.splice(result.begin(), chunk_data, chunk_data.begin());
        T const& partition_val = *result.begin();

        typename std::list<T>::iterator divide_point = std::partition(
            chunk_data.begin(), chunk_data.end(),
            [&](T const& val) { return val < partition_val; }
        );

        std::list<T> new_lower_chunk;
        new_lower_chunk.splice(
            new_lower_chunk.end(), chunk_data, chunk_data.begin(), divide_point
        );

        // 将左半段提交到当前工作线程的本地双端队列（可被空闲线程从队尾窃取！）
        std::future<std::list<T>> new_lower = pool.submit(
            std::bind(&sorter::do_sort, this, std::move(new_lower_chunk))
        );

        // 当前线程直接递归排右半段
        std::list<T> new_higher(do_sort(chunk_data));
        result.splice(result.end(), new_higher);

        // 等待左半段完成期间，绝不干睡死锁，而是主动调用 run_pending_task() 帮忙执行任务！
        while (new_lower.wait_for(std::chrono::seconds(0)) == std::future_status::timeout) {
            pool.run_pending_task();
        }

        result.splice(result.begin(), new_lower.get());
        return result;
    }
};

} // namespace ccia

int main() {
    using namespace ccia;

    // 1. 验证 [CON-52] hierarchical_mutex 层级锁死锁拦截
    hierarchical_mutex high_level(10000);
    hierarchical_mutex low_level(5000);
    {
        std::lock_guard<hierarchical_mutex> lk1(high_level);
        std::lock_guard<hierarchical_mutex> lk2(low_level); // 高 -> 低：合法
    }
    bool caught_hierarchy_violation = false;
    try {
        std::lock_guard<hierarchical_mutex> lk1(low_level);
        std::lock_guard<hierarchical_mutex> lk2(high_level); // 低 -> 高：必抛异常！
    } catch (std::logic_error const&) {
        caught_hierarchy_violation = true;
    }
    assert(caught_hierarchy_violation);
    std::cout << "[PASS] CON-52 hierarchical_mutex caught lock-order reversal at runtime.\n";

    // 2. 验证 [CON-52] threadsafe_stack 并发压栈与出栈
    threadsafe_stack<int> safe_stack;
    for (int i = 1; i <= 100; ++i) safe_stack.push(i);
    int stack_sum = 0;
    while (!safe_stack.empty()) {
        int val = 0;
        safe_stack.pop(val);
        stack_sum += val;
    }
    assert(stack_sum == 5050);
    std::cout << "[PASS] CON-52 threadsafe_stack sum(1..100) = " << stack_sum << "\n";

    // 3. 验证 [CON-55] 虚拟尾节点细粒度双锁队列 + 分桶并发哈希表
    threadsafe_lookup_table<std::string, int> lookup_table;
    {
        scoped_thread writer1(std::thread([&] {
            for (int i = 0; i < 50; ++i) {
                lookup_table.add_or_update_mapping("k" + std::to_string(i), i * 10);
            }
        }));
        scoped_thread writer2(std::thread([&] {
            for (int i = 50; i < 100; ++i) {
                lookup_table.add_or_update_mapping("k" + std::to_string(i), i * 10);
            }
        }));
    }
    auto snapshot = lookup_table.get_map();
    assert(snapshot.size() == 100 && lookup_table.value_for("k42", -1) == 420);
    std::cout << "[PASS] CON-55 threadsafe_lookup_table entries = " << snapshot.size()
              << ", k42 = " << lookup_table.value_for("k42") << "\n";

    // 4. 验证 [CON-58] 工作窃取线程池驱动的分治并发快速排序
    std::list<int> unsorted = {42, 7, 19, 3, 99, 1, 88, 25, 64, 12, 5, 73, 31, 50, 2};
    sorter<int> parallel_sorter;
    std::list<int> sorted = parallel_sorter.do_sort(unsorted);
    assert(std::is_sorted(sorted.begin(), sorted.end()));
    std::cout << "[PASS] CON-58 Work-Stealing ThreadPool quick_sort result: ";
    for (int x : sorted) std::cout << x << " ";
    std::cout << "\nAll CCIA 2e core components verified successfully!\n";
    return 0;
}
```
