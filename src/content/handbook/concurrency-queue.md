---
title: "并发队列、Future、线程池与无锁环形缓冲区"
description: "从经典有界阻塞队列、双条件变量防惊群与优雅排空，到 future/promise 异常传播、async 陷阱、生产级线程池、工作窃取、无锁 SPSC 环形缓冲区、分片并发哈希表与利特尔法则背压建模。"
order: 81
category: "并发与性能"
tags: ["C++20", "BoundedQueue", "ThreadPool", "future", "SPSC", "工作窃取", "背压", "Little's Law"]
related: ["handbook/con-locks-sync", "handbook/con-atomics-lockfree", "labs/logscan-service"]
sources: ["concurrency-queue.cpp"]
---

## 本课只解决这 1 个问题

单线程扫描几十个大日志文件、处理成千上万条 TCP 日志帧时，磁盘/网络 I/O 和 CPU 解析全挤在一条线上。工程里的标准解法是**用并发队列把生产与消费彻底解耦**：接入线程负责收数据，工作线程池负责并行计算。

本课对应课程 `CON-19`–`CON-28`，保留并吃透经典的 `BoundedQueue` 源码，再一路向上构建 `future`/`promise`、生产级 `ThreadPool`、工作窃取（Work Stealing）、极速无锁 SPSC 环形缓冲区、分片并发哈希表，最后用 **Little's Law（利特尔法则）** 给队列容量与背压定下科学数学边界。

---

## 生产者-消费者模型与 `BoundedQueue` 架构 (CON-19)

把并发流水线想象成**餐厅出餐口**：
1. **`std::mutex`（门锁）**：任何线程想碰底层容器 `queue_`，必须先拿到门锁。
2. **`capacity_`（出餐台大小上限）**：如果队列**无界**，一旦生产者比消费者快，队列会在几分钟内吃光内存触发 OOM 崩溃；设了有界容量，满时就能反向逼生产者降速。
3. **`std::condition_variable`（门铃）**：队列空了，消费者睡在门铃前；生产者放入数据后按门铃唤醒它。

```text
生产者线程 ── push("ERROR ...") ──→ [ BoundedQueue (容量 2) ] ── pop() ──→ 工作线程 1, 2
              满时等 not_full_      ↑ 所有读写受 mu_ 保护      空时等 not_empty_
```

在练习目录新建 `concurrency-queue.cpp` 并写入下面这份可运行源码：

{{example:concurrency-queue.cpp}}

在终端编译并运行：

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic -pthread concurrency-queue.cpp -o concurrency-queue
./concurrency-queue
```

输出：

```text
worker 处理: INFO start
worker 处理: WARN high memory
worker 处理: ERROR disk full
worker 收到关闭信号并排空，退出
```

### 逐拍追踪：两个线程交错执行时到底发生了什么？

把容量设为 `2`、按时间线追踪 `main`（生产者）和 `worker`（消费者）的每一步：

| 时刻 | `main` 线程（生产者） | `worker` 线程（消费者） | `queue_` 里的内容 |
| --- | --- | --- | --- |
| T1 | 还在准备数据 | 调用 `pop()`，拿到 `mu_` 发现队列空 | `[]` |
| T2 | 准备调用 `push("INFO start")` | 进入 `not_empty_.wait()`：**自动释放 `mu_`** 并睡眠 | `[]` |
| T3 | 拿到 `mu_`，放进 `"INFO start"`，通知 `not_empty_.notify_one()`，释放 `mu_` | 被唤醒并**重新抢回 `mu_`**，条件 `!queue_.empty()` 为真，取出处理 | `[]` |
| T4 | 连续 `push` 塞满 2 条，第 3 条满时在 `not_full_.wait()` 睡眠 | 取出 1 条并 `not_full_.notify_one()` | `["WARN...", "ERROR..."]` |
| T5 | 调用 `close()`：设 `closed_ = true`，对两个条件变量 `notify_all()` | 继续循环 `pop()` 把剩下 2 条全部处理完 | `[]` |
| T6 | 调用 `worker.join()` 等待收尾 | 再次 `pop()` 发现 `closed_ && queue_.empty()`，返回 `std::nullopt` 退出 | `[]` |

---

## 单条件变量 vs 双条件变量 (`not_full` / `not_empty`) 与惊群效应 (CON-20)

新手写阻塞队列常图省事：**只定义一个 `std::condition_variable cv_`**，生产者和消费者全睡在同一个 `cv_` 上。这会引发严重的工程隐患：

1. **假唤醒卡死 Bug**：假设队列已满，生产者 A 和 B 都睡在 `cv_` 上；消费者取走 1 条后调用 `cv_.notify_one()`，结果操作系统挑中了同样刚进来排队的**另一个消费者**，真正的生产者 A 压根没被叫醒——整条流水线**永久死锁**！
2. **被迫 `notify_all()` 导致惊群效应（Thundering Herd）**：为了不死锁，单条件变量版被迫把所有 `notify_one()` 全改成 `notify_all()`。一旦队列从满变成空出 1 个位置，所有 32 个等待的生产者和消费者全被内核拉起来抢同一把 `mu_`，结果只有 1 个能干活，其余 31 个白白上下文切换一次又睡回去，**CPU 全烧在调度上**！

**双条件变量精确制导**：
- 生产者满时只睡 `not_full_`，消费者消费后只精准叫醒 `not_full_.notify_one()`。
- 消费者空时只睡 `not_empty_`，生产者入队后只精准叫醒 `not_empty_.notify_one()`。
- **只有 `close()` 关闭时**才对两边同时 `notify_all()`，确保全员安全撤离。

---

## 优雅关闭与队列排空契约 (CON-21)

生产系统收到 `Ctrl+C`（`SIGINT`/`SIGTERM`）停机时，队列里往往还积压着几百条已承诺接收的日志。停机契约必须明确回答三个问题：

| 策略 | 做法 | 适用场景 |
| --- | --- | --- |
| **停止接入 + 排空（Drain）** | `close()` 后拒绝新 `push`（返回 `false`），消费者把已在队列里的存量**全部处理完**才返回 `nullopt` 退出 | **默认推荐**（`LogScan` 落盘归档，不丢已接收消息） |
| **立即丢弃（Discard）** | `close()` 后消费者立刻退出或清空队列 | 实时音视频帧、过期无效探测请求 |
| **带超时排空（Bounded Drain）** | 先 `close()` 排空，若超过 5 秒仍未排完再强制中止 | 防止慢下游把服务重启拖超时 |

### 关闭流程绝对不可颠倒的 3 个铁律

1. **`close()` 必须幂等**：多次调用 `q.close()` 结果一致（只设 `closed_ = true` 并广播）。
2. **`close()` 必须用 `notify_all()` 唤醒双侧**：否则多个消费者里只有 1 个醒来，其余永远睡死在 `pop()` 里。
3. **主线程必须先调 `q.close()`，再调 `worker.join()`**：顺序写反必定永久死锁！

---

## 跨线程结果与异常传递：`std::future` 与 `std::promise` (CON-22)

`BoundedQueue` 擅长“扔进去一堆任务”，但很多时候我们需要**把子线程算出来的返回值——甚至子线程抛出的异常——安全传回调用者**。

C++ 标准库提供了一对**一次性单向传值通道**：
- **`std::promise<T>`**（承诺者，写端）：子线程算完后调用 `p.set_value(result)`，或者遇到错误调用 `p.set_exception(std::current_exception())`。
- **`std::future<T>`**（期值，读端）：主线程拿着与之绑定的 `f = p.get_future()`，调用 `f.get()` 阻塞等结果。**注意：`future::get()` 只能调用一次**（它会把值移动出来）；如果多个线程都要等同一个结果，可以调用 `f.share()` 转成 `std::shared_future<T>`（可拷贝、可多次 `get()`）。

```cpp
#include <exception>
#include <future>
#include <iostream>
#include <stdexcept>
#include <thread>

void compute_task(std::promise<int> prom, int divisor) {
    try {
        if (divisor == 0) {
            throw std::invalid_argument("除数不能为 0！");
        }
        prom.set_value(100 / divisor);
    } catch (...) {
        // 神奇之处：把子线程里的异常打包进共享状态，跨线程传给 future::get()！
        prom.set_exception(std::current_exception());
    }
}

int main() {
    std::promise<int> p1, p2;
    auto f1 = p1.get_future();
    auto f2 = p2.get_future();

    std::jthread t1(compute_task, std::move(p1), 5);
    std::jthread t2(compute_task, std::move(p2), 0);

    std::cout << "f1 结果 = " << f1.get() << '\n'; // 输出 20
    try {
        std::cout << "f2 结果 = " << f2.get() << '\n';
    } catch (const std::exception& e) {
        // 如果不捕获，子线程里的异常直接就在这里优雅重抛出来！
        std::cout << "主线程捕获到子线程异常: " << e.what() << '\n';
    }
    return 0;
}
```

> **如果 `promise` 销毁前既没 `set_value` 也没 `set_exception` 会怎样？**
> 析构函数会自动往共享状态里塞入一个 `std::future_error(std::future_errc::broken_promise)` 异常，保证等待在 `f.get()` 的线程**不会无限死等**，而是立即收到异常并醒来！

---

## 任务包装与异步启动：`std::packaged_task` 与 `std::async` 陷阱 (CON-23)

### 1. `std::packaged_task`：线程池最喜欢的“带票据任务盒”

手动在函数里接 `std::promise` 再 `try/catch` 太啰嗦。`std::packaged_task<R(Args...)>` 把**任意普通函数**和 **`promise` 自动打包到一起**：调用它时，返回值和抛出的异常会自动填进关联的 `std::future<R>`！而且它**自己不创建线程**，方便放进线程池队列里由工作线程执行：

```cpp
#include <future>
#include <iostream>

int heavy_parse(int x) { return x * x; }

int main() {
    std::packaged_task<int(int)> task(heavy_parse);
    std::future<int> fut = task.get_future();
    task(12); // 可以交给任何线程执行（注意 packaged_task 仅可移动，不可拷贝）
    std::cout << "结果 = " << fut.get() << '\n'; // 144
    return 0;
}
```

### 2. `std::async` 的两大臭名昭著陷阱

`std::async` 看起来像一行启动异步任务的神器，但新手如果不注意下面两个陷阱，写出来的其实是“假并行”：

1. **默认启动策略陷阱（`launch::async | launch::deferred`）**：不传第一个参数直接写 `std::async(fn)` 时，标准库**有权选择惰性延迟执行（`launch::deferred`）**——也就是说它根本没开新线程，而是等到你调 `fut.get()` 时才在**当前线程同步跑完**！因此如果真的要异步并行，**必须显式写 `std::async(std::launch::async, fn)`**。
2. **匿名 `future` 析构阻塞陷阱**：`std::async(std::launch::async, ...)` 返回的临时 `std::future` 拥有一项特殊行为——**它的析构函数会阻塞等待后台任务执行完毕**！

```cpp
// 陷阱演示：看似并发，实际完全串行！
std::async(std::launch::async, task_a); // 没接住返回值！临时 future 在分号处立刻析构，死等 task_a 跑完！
std::async(std::launch::async, task_b); // task_a 跑完才轮到 task_b！

// 正确写法：用变量接住两个 future
auto fa = std::async(std::launch::async, task_a);
auto fb = std::async(std::launch::async, task_b);
```

> **工程建议**：`std::async` 每次都可能新建/销毁系统线程（无容量限制，高并发下会爆线程数）。服务端高并发请统一用固定线程数的 **ThreadPool**！

---

## 打造生产级线程池：任务提交、返回值与安全停机 (CON-24)

把前面学的 `BoundedQueue`、`std::packaged_task`、`std::future` 和 `std::jthread` 组装起来，就能写出一个支持**任意返回类型、异常透传、有界背压且析构绝对安全**的工业级 `ThreadPool`：

```cpp
#include <condition_variable>
#include <functional>
#include <future>
#include <iostream>
#include <memory>
#include <mutex>
#include <queue>
#include <stdexcept>
#include <thread>
#include <type_traits>
#include <vector>

class ThreadPool {
public:
    explicit ThreadPool(std::size_t num_threads, std::size_t max_queue = 1024)
        : max_queue_(max_queue) {
        if (num_threads == 0) num_threads = 1;
        workers_.reserve(num_threads);
        for (std::size_t i = 0; i < num_threads; ++i) {
            workers_.emplace_back([this] { worker_loop(); });
        }
    }

    ~ThreadPool() { shutdown(); }

    ThreadPool(const ThreadPool&) = delete;
    ThreadPool& operator=(const ThreadPool&) = delete;

    // 提交任意函数和参数，返回 std::future<返回值类型>
    template <typename F, typename... Args>
    auto submit(F&& f, Args&&... args)
        -> std::future<std::invoke_result_t<F, Args...>> {
        using ReturnT = std::invoke_result_t<F, Args...>;

        // packaged_task 仅可移动，包进 shared_ptr 以便放进 std::function<void()>
        auto task = std::make_shared<std::packaged_task<ReturnT()>>(
            [func = std::forward<F>(f),
             tup = std::make_tuple(std::forward<Args>(args)...)]() mutable -> ReturnT {
                return std::apply(std::move(func), std::move(tup));
            });

        std::future<ReturnT> res = task->get_future();
        {
            std::unique_lock<std::mutex> lock(mu_);
            not_full_.wait(lock, [this] {
                return stopped_ || tasks_.size() < max_queue_;
            });
            if (stopped_) {
                throw std::runtime_error("ThreadPool 已关闭，拒绝提交新任务");
            }
            tasks_.emplace([task] { (*task)(); });
        }
        not_empty_.notify_one();
        return res;
    }

    void shutdown() {
        {
            std::lock_guard<std::mutex> lock(mu_);
            if (stopped_) return;
            stopped_ = true;
        }
        not_empty_.notify_all();
        not_full_.notify_all();
        for (auto& w : workers_) {
            if (w.joinable()) w.join(); // 等所有已入队任务排空执行完毕
        }
    }

private:
    void worker_loop() {
        while (true) {
            std::function<void()> task;
            {
                std::unique_lock<std::mutex> lock(mu_);
                not_empty_.wait(lock, [this] {
                    return stopped_ || !tasks_.empty();
                });
                if (stopped_ && tasks_.empty()) {
                    return; // 排空后优雅退出
                }
                task = std::move(tasks_.front());
                tasks_.pop();
            }
            not_full_.notify_one();
            task(); // 绝不在持锁状态下执行任务！
        }
    }

    // 声明顺序极其重要！workers_ 放最后（最先析构或先 join），确保销毁队列时线程已全部退出
    std::size_t max_queue_;
    std::mutex mu_;
    std::condition_variable not_empty_;
    std::condition_variable not_full_;
    std::queue<std::function<void()>> tasks_;
    bool stopped_ = false;
    std::vector<std::thread> workers_;
};

int main() {
    ThreadPool pool(4);
    std::vector<std::future<int>> futures;
    for (int i = 1; i <= 8; ++i) {
        futures.push_back(pool.submit([i] { return i * i; }));
    }
    int sum = 0;
    for (auto& f : futures) sum += f.get();
    std::cout << "1..8 平方和 = " << sum << '\n'; // 204
    return 0;
}
```

> **线程池隐藏死锁警报**：**永远不要让线程池里的任务 A 去 `.get()` 等待同池里的另一个任务 B！** 假如池里有 4 个线程，同时来了 4 个父任务全卡在 `child_future.get()` 上，而所有子任务全堵在任务队列里没人领——**线程池饥饿死锁**瞬间达成！

---

## 工作窃取队列与 Fork-Join 并行模式 (CON-25)

当 CPU 有 16~64 核、且每个任务非常细碎（例如几微秒的递归分治或协程恢复）时，上面那种**所有核抢同一个 `mu_` 的全局队列**就会变成瓶颈。

**工作窃取（Work-Stealing）**（如 Go 调度器、Rust `rayon`、Intel TBB、Java `ForkJoinPool`）彻底改变了架构：
1. **每个 Worker 线程拥有自己专属的双端队列（Deque）**。
2. **自己生产、自己消费走“底端”（LIFO，后进先出）**：刚拆出来的子任务就在眼前，CPU L1 缓存还热乎，且**平时几乎零竞争**！
3. **闲着没事的 Worker（小偷）去别人的“顶端”偷任务（FIFO，先进先出）**：顶端往往是刚拆出来的**大块任务**，偷一次够吃半天，而且小偷在顶端、失主在底端，两者冲突极少。

```text
Worker 0 本地队列 (Deque)               Worker 1 (空闲小偷)
顶端 (Top) ◀── 小偷从这里 Steal 大块任务 ──  Worker 1 偷走 Task 1
   [ Task 1 ]
   [ Task 2 ]
   [ Task 3 ]  ← 刚 split 出的热任务
底端 (Bottom) ◀── Worker 0 自己 Push / Pop (LIFO，缓存友好！)
```

**Fork-Join 并行核心注意**：在支持工作窃取的框架里，父任务等待子任务时，工作线程**不会傻睡在系统锁上**，而是先帮着执行自己本地队列里的其它子任务或去窃取任务（*Helping*），从而完全免疫前面提到的线程池饥饿死锁。

---

## 无锁 SPSC 环形缓冲区：单生产者单消费者原子实现 (CON-26)

如果流水线正好是 **1 个生产者线程 → 1 个消费者线程**（Single-Producer Single-Consumer，比如音频采样、高频日志采集线程转给写盘线程、网络收包转解码），我们根本不需要 `std::mutex`，甚至**连 CAS 循环都不需要**——用普通原子读写就能做到**真正的 Wait-Free（无等待）极致吞吐**！

核心原理：
- 底层是一块固定长度（2 的幂次，便于 `& mask_` 取代慢速取模 `%`）的数组 `buffer_`。
- **`tail_`（写指针）只有生产者会修改**，消费者只读。
- **`head_`（读指针）只有消费者会修改**，生产者只读。
- 因为每个指针**只有一个写入者**，完全不会发生“两个线程同时写同一个下标”的竞争！只需用 **`acquire`/`release`** 保证数据写入完毕再更新指针即可（注意加 `alignas(64)` 隔离 `head_` 与 `tail_`，防止伪共享！）。

```cpp
#include <array>
#include <atomic>
#include <cstddef>
#include <iostream>
#include <optional>
#include <thread>

template <typename T, std::size_t CapacityPow2>
class SPSCRingBuffer {
    static_assert((CapacityPow2 & (CapacityPow2 - 1)) == 0 && CapacityPow2 >= 2,
                  "CapacityPow2 必须是 >= 2 的 2 的幂");
    static constexpr std::size_t kMask = CapacityPow2 - 1;
    static constexpr std::size_t kCacheLine = 64;

public:
    bool try_push(const T& item) {
        const std::size_t tail = tail_.load(std::memory_order_relaxed);
        const std::size_t next_tail = (tail + 1) & kMask;
        // 留 1 个空槽区分“满”与“空”：next_tail == head 表示满
        if (next_tail == head_.load(std::memory_order_acquire)) {
            return false; // 满
        }
        buffer_[tail] = item; // 普通写，受下方 release 保护
        tail_.store(next_tail, std::memory_order_release); // 发布新元素给消费者
        return true;
    }

    std::optional<T> try_pop() {
        const std::size_t head = head_.load(std::memory_order_relaxed);
        if (head == tail_.load(std::memory_order_acquire)) { // 获取生产者已发布的数据
            return std::nullopt; // 空
        }
        T item = std::move(buffer_[head]);
        head_.store((head + 1) & kMask, std::memory_order_release); // 归还槽位给生产者
        return item;
    }

private:
    alignas(kCacheLine) std::atomic<std::size_t> head_{0}; // 消费者独占写
    alignas(kCacheLine) std::atomic<std::size_t> tail_{0}; // 生产者独占写
    alignas(kCacheLine) std::array<T, CapacityPow2> buffer_{};
};

int main() {
    SPSCRingBuffer<int, 1024> rb;
    constexpr int kCount = 100000;

    std::jthread producer([&] {
        for (int i = 1; i <= kCount; ++i) {
            while (!rb.try_push(i)) {
                std::this_thread::yield(); // 满时短暂退让（真实低延迟场景可自旋或 backoff）
            }
        }
    });

    long long sum = 0;
    std::jthread consumer([&] {
        int received = 0;
        while (received < kCount) {
            if (auto val = rb.try_pop()) {
                sum += *val;
                ++received;
            }
        }
    });
    producer.join();
    consumer.join();
    std::cout << "SPSC 校验和 = " << sum << " (预期 5000050000)\n";
    return 0;
}
```

---

## 并发哈希表设计：分段锁桶 vs 无锁方案与危险点 (CON-27)

标准库的 `std::unordered_map` **不是线程安全的**——即使所有操作只是“向不同 key 插入”，一旦触发 Rehash 扩容，整张桶数组重新分配，正在读写的其他线程立刻悬空崩溃！

### 方案 1：分片并发哈希表（Sharded / Striped Hash Map —— 95% 场景首选）

把哈希表切分成 $K$ 个独立分片（通常取 64 或 256 个 `Shard`），每个分片有自己的 `std::shared_mutex` 和 `std::unordered_map`（记得每个 `Shard` 用 `alignas(64)` 隔离避免相邻分片锁伪共享！）：

```cpp
#include <array>
#include <functional>
#include <mutex>
#include <optional>
#include <shared_mutex>
#include <unordered_map>

template <typename Key, typename Value, std::size_t NumShards = 64>
class ShardedHashMap {
public:
    void insert_or_assign(const Key& k, Value v) {
        auto& shard = get_shard(k);
        std::unique_lock lk(shard.mu);
        shard.map.insert_or_assign(k, std::move(v));
    }

    std::optional<Value> find(const Key& k) const {
        const auto& shard = get_shard(k);
        std::shared_lock lk(shard.mu);
        auto it = shard.map.find(k);
        if (it == shard.map.end()) return std::nullopt;
        return it->second;
    }

private:
    struct alignas(64) Shard {
        mutable std::shared_mutex mu;
        std::unordered_map<Key, Value> map;
    };

    Shard& get_shard(const Key& k) {
        return shards_[std::hash<Key>{}(k) % NumShards];
    }
    const Shard& get_shard(const Key& k) const {
        return shards_[std::hash<Key>{}(k) % NumShards];
    }

    std::array<Shard, NumShards> shards_;
};
```

### 方案 2：为什么“无锁哈希表”极难写出且充满危险？

工业级无锁哈希表（如 Michael's Lock-Free Hash Table 或 Split-Ordered Lists）面临两大硬骨头：
1. **并发扩容（Lock-Free Resizing）**：正在把旧桶节点搬迁到新双倍桶数组时，另一线程同时插入或删除怎么办？通常需要协作迁移状态机。
2. **安全内存回收（Memory Reclamation）**：读者刚顺着链表指针摸到节点 `N`，写者已经删除并 `free(N)` 了怎么办？必须引入下一章要讲的 **Hazard Pointers / Epoch-Based Reclamation (EBR)**，而且不能随便把容器内部引用直接暴露给调用者（必须按值拷贝或受保护指针返回）。

---

## 背压、有界延迟与队列容量建模 (CON-28)

### 1. 队列满时的三种背压策略

| 策略 | 方法签名 | 队列满时行为 | 适用场景 |
| --- | --- | --- | --- |
| **阻塞背压** | `push(item)` | 死等直到有空位或关闭 | 离线批处理（如扫本地日志文件） |
| **限时等待** | `push_for(item, timeout)` | 用 `wait_for` 最多等 `timeout`，超时返回 `false` | 微服务下游保护，防上游线程永久阻塞 |
| **即时拒绝 / 降载** | `try_push(item)` | 发现满立刻返回 `false` | TCP 接入层快速拒绝（返回 429/503 或暂停读 `POLLIN`） |

### 2. 用 Little's Law（利特尔法则）科学定容量，拒绝“拍脑袋设 100,000”！

很多工程师怕丢数据，随手把队列容量写成 `100000`——这在网络服务里是一场灾难（**Bufferbloat 缓冲膨胀**）：队列塞满 10 万个旧请求时，每个新来的请求即使最终能被处理，也要先在队列里白等几十秒，客户端早就超时重试了，**白白浪费算力处理“僵尸请求”**！

用排队论核心公式 **Little's Law（利特尔法则）** 计算合理容量上限：

$$L = \lambda \cdot W$$

- $L$：系统（队列）里平均积压的请求数
- $\lambda$：平均到达速率（Requests/sec）
- $W$：请求在队列里的平均停留时间（Waiting + Service time，秒）

**实战算例（`LogScan v3` 队列定容）**：
- 假设你有 4 个工作线程，每条日志平均解析+入库耗时 5 ms，系统最大稳定吞吐是 $\mu = \frac{4}{0.005} = 800\text{ req/s}$。
- 业务 SLA 要求 P99 排队等待不超过 $W_{\max} = 50\text{ ms} = 0.05\text{ s}$。
- 在满载 $\lambda = 800\text{ req/s}$ 下，队列容量上限应设为：

$$L_{\max} = \lambda \cdot W_{\max} = 800 \times 0.05 = 40\text{ 条}$$

**结论**：容量设在 `32`–`64` 之间（或按字节预算上限），一旦超载立刻通过 `try_push`/`push_for` 触发背压反推上游，才能保住 P99 尾延迟不雪崩！

---

## 本课常见报错急救室与微练习

| 报错现象 / 关键字 | 一句话根因 | 精准修复方案 |
| --- | --- | --- |
| 程序打印完日志后**永久卡死不退出**（CPU 0%） | 忘了调用 `q.close()`，或 `close()` 里只写了 `notify_one()` 导致其余工作线程睡死。 | 退出前先 `q.close()`（内部用 `notify_all()`）再 `join()`；死锁时用 `gdb -p <PID> -batch -ex "thread apply all bt"` 看线程卡在哪行。 |
| `std::future_error: Broken promise` | 持有 `std::promise` 的线程提前退出或抛异常没 `catch`，未设值就销毁了 `promise`。 | 在工作线程外层包 `try/catch(...)` 并调用 `prom.set_exception(std::current_exception())`。 |
| 写了两个 `std::async` 却耗时相加、毫无并行 | 忘了用变量接住 `future`，临时 `future` 析构阻塞；或未指定 `std::launch::async` 被延迟到 `get()` 才跑。 | 显式写 `auto f1 = std::async(std::launch::async, ...);` 或直接改用 `ThreadPool`。 |

### 练习 1（为什么 `ThreadPool` 里 `workers_` 要放在类成员声明的最后？）
观察 `CON-24` 的 `ThreadPool` 私有成员变量顺序，如果把 `std::vector<std::thread> workers_;` 放在 `std::mutex mu_;` 和 `std::queue tasks_;` 的**最前面**，析构时会出什么灾难？

<details>
<summary>核对答案</summary>

C++ 类析构顺序与成员变量声明顺序**严格相反**（先声明的后析构）。如果忘了手动调 `shutdown()`（虽然我们在 `~ThreadPool()` 调了），或者如果有人用 `std::jthread` 依赖成员析构自动 `join()`：把 `workers_` 放在最前面意味着**会先销毁 `mu_`、`not_empty_` 和 `tasks_`，后 `join()` 线程**——正在循环里读取 `tasks_` 的工作线程瞬间踩踏已销毁内存（UAF 崩溃）！把 `workers_` 放最后能保证线程先安全收尾销毁，再清理队列与锁。

</details>

### 练习 2（动手扩展：给 `BoundedQueue` 加上 `try_push` 与排空核对）
修改 `concurrency-queue.cpp`：
1. 增加 `bool try_push(std::string item)`（队列满或已关闭时立刻返回 `false`）。
2. 启动 3 个 `std::jthread` 工作线程，推入 `0–19` 共 20 条记录后调用 `close()`，核对各线程局部变量汇总后的总处理条数严格等于成功入队数。

<details>
<summary>参考提示</summary>

`try_push` 只需要 `std::lock_guard<std::mutex> lock(mu_);`，检查 `if (closed_ || queue_.size() >= capacity_) return false;`，放入后 `not_empty_.notify_one(); return true;`。注意 3 个线程离开作用域自动 `join()` 前必须先显式调用 `q.close()`！

</details>

### 下一步怎么走
有界队列与线程池已经能撑起绝大多数业务并发；但如果你想理解 **SPSC 无锁队列里 `acquire`/`release` 到底骗过了 CPU 的什么硬件部件**、如何手写无锁栈并消灭 ABA 漏洞，以及 C++20 协程如何用单线程扛住十万异步连接，进入下一课 [硬件内存模型、原子操作、无锁数据结构与 C++20 协程](../con-atomics-lockfree/)！
