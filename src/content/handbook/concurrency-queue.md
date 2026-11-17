---
title: "多线程并发与有界任务队列"
description: "用 std::thread、mutex 和 condition_variable 写出线程安全、可优雅关闭的有界队列，彻底搞懂锁、条件变量与线程交错执行。"
order: 80
tags: ["C++20", "并发", "mutex", "条件变量", "线程池"]
related: ["handbook/raii", "handbook/linux-process-io", "labs/logscan-service"]
sources: ["concurrency-queue.cpp"]
---

## 本课只解决这 1 个问题

单线程扫描几十个大日志文件时，磁盘读取和 CPU 解析全挤在一条线上。工程里标准做法是**生产者-消费者模型**：主线程（或网络线程）把读到的日志塞进任务队列，多个工作线程同时从队列取任务处理。本课手把手带你写出一个**线程安全、容量有上限、能优雅排空退出**的 `BoundedQueue`。

前置要求：理解 RAII（离开作用域自动释放）和 `std::optional`。

## 心智模型：餐厅出餐口（门锁 + 容量上限 + 门铃）

两个线程同时对同一个 `std::queue` 调用 `push` 和 `pop`，内部指针会互相踩踏（**数据竞争，未定义行为**）。安全并发靠三件套协同工作：

1. **`std::mutex`（门锁）** + **`std::lock_guard` / `std::unique_lock`（RAII 自动钥匙）**：任何线程想碰 `queue_`，必须先拿到门锁；离开花括号时自动还锁，就算中途 `return` 或抛异常也不会死锁。
2. **`capacity_`（有界容量 / 背压）**：如果队列不设上限，生产者读得飞快、工作线程处理慢，队列会无限膨胀直到内存耗尽（OOM）。设了上限后，队列满时生产者会暂停等待。
3. **`std::condition_variable`（门铃）**：队列空了，工作线程不要用 `while (true)` 空转烧 100% CPU，而是调用 `wait` **主动让出锁并睡着**；等生产者放进新任务后按一下门铃（`notify_one`）唤醒它。

```text
生产者线程 ── push("ERROR ...") ──→ [ BoundedQueue (容量 2) ] ── pop() ──→ 工作线程 1, 2
              满时等 not_full_      ↑ 所有读写受 mu_ 保护      空时等 not_empty_
```

## 最小可运行代码：逐行吃透 `BoundedQueue`

把页首的 `concurrency-queue.cpp` 下载到练习目录：

{{example:concurrency-queue.cpp}}

在 PowerShell 编译并运行（Windows MinGW 与 Linux `g++` 均支持）：

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic concurrency-queue.cpp -o concurrency-queue.exe
.\concurrency-queue.exe
```

输出：

```text
worker 处理: INFO start
worker 处理: WARN high memory
worker 处理: ERROR disk full
worker 收到关闭信号并排空，退出
```

### 关键细节：两个线程交错执行时到底发生了什么？

把容量设为 `2`、按时间线追踪 `main`（生产者）和 `worker`（消费者）的每一步：

| 时刻 | `main` 线程（生产者） | `worker` 线程（消费者） | `queue_` 里的内容 |
| --- | --- | --- | --- |
| T1 | 还在准备数据 | 调用 `pop()`，拿到 `mu_` 发现队列空 | `[]` |
| T2 | 准备调用 `push("INFO start")` | 进入 `not_empty_.wait()`：**自动释放 `mu_`** 并睡眠 | `[]` |
| T3 | 拿到 `mu_`，放进 `"INFO start"`，按门铃 `not_empty_.notify_one()`，释放 `mu_` | 被门铃唤醒，**重新抢回 `mu_`**，条件 `!queue_.empty()` 为真 | `["INFO start"]` |
| T4 | 连续 `push` 塞满 2 条，第 3 条满时在 `not_full_.wait()` 睡眠 | 取出 `"INFO start"`，按 `not_full_.notify_one()`，释放 `mu_` | `["WARN...", "ERROR..."]` |
| T5 | 调用 `close()`：设 `closed_ = true`，调用 `notify_all()` | 继续循环 `pop()` 把剩下 2 条全部处理完 | `[]` |
| T6 | 调用 `worker.join()` 等待工作线程收尾 | 再次 `pop()` 发现 `closed_ && queue_.empty()`，返回 `std::nullopt` 退出循环 | `[]` |

## 并发最容易踩的 3 个致命坑（对比实验）

### 坑 1：忘了调 `q.close()`，程序永远卡死不退出！

把 `main` 里的 `q.close();` 注释掉再编译运行。你会发现屏幕打印完 3 条日志后**光标一直闪着不结束**！因为 `worker` 死等第 4 条数据，`main` 在 `worker.join()` 死等 `worker` 下班，形成永久僵局。

### 坑 2：`wait` 不写第二个参数（谓词 Lambda），遭遇“虚假唤醒”崩溃

```cpp
// 危险写法！
if (queue_.empty() && !closed_) {
    not_empty_.wait(lock); // 醒来后不重查条件，直接往下执行 queue_.front()！
}
```

操作系统允许条件变量在没人 `notify` 时偶尔**虚假唤醒**；此外当有 2 个工作线程同时被唤醒时，线程 A 先抢到锁拿走了唯一一条数据，线程 B 紧接着醒来时队列已经又是空的了！如果不用 `wait(lock, [&] { return closed_ || !queue_.empty(); });`（等价于自动套了一层 `while (!条件) wait(lock);`），线程 B 就会对空队列调用 `front()` 直接崩溃。

### 坑 3：`close()` 里写了 `notify_one()` 而不是 `notify_all()`

如果线程池有 4 个工作线程都在等任务，`close()` 只调 `notify_one()` 就只会叫醒 1 个线程，另外 3 个工作线程会永远睡死在 `pop()` 里，`join()` 永远等不到它们。

## 扩展：用 `std::vector<std::thread>` 启动真正的多工作线程池

在真实项目里，只需要把单线程 `worker` 换成几行循环就能变成多核线程池：

```cpp
std::vector<std::thread> workers;
for (int i = 0; i < 4; ++i) {
    workers.emplace_back([&, i] {
        while (auto line = q.pop()) {
            // 4 个线程并发处理不同的日志行
        }
    });
}
// 生产者推完所有任务后：
q.close();
for (auto& w : workers) {
    w.join();
}
```

（C++20 还提供了 `std::jthread`，析构时会自动帮你 `join()`，防止中途抛异常忘了 `join()` 导致程序直接 `std::terminate`。）

## 4 个微练习

### 练习 1（区分锁类型）

为什么 `push` 和 `pop` 用 `std::unique_lock<std::mutex>`，而 `close` 用 `std::lock_guard<std::mutex>`？

<details>
<summary>核对答案</summary>

`condition_variable::wait` 必须在睡眠前临时解锁、醒来后重新加锁，只有 `std::unique_lock` 支持中途手动/自动解锁再加锁；`close` 只需要简单加锁改状态、离开作用域自动解锁，用更轻量的 `std::lock_guard` 即可。

</details>

### 练习 2（分析关闭顺序）

下面两行如果写反了顺序（先 `worker.join();` 再 `q.close();`），会发生什么？

<details>
<summary>核对答案</summary>

**死锁（永久挂起）**。`main` 卡在 `worker.join()` 等 `worker` 退出，而 `worker` 卡在 `q.pop()` 等 `main` 调用 `q.close()`。必须先 `q.close()`，再 `join()`。

</details>

### 练习 3（为什么 `push` 返回 `bool`？）

如果在 `push` 里 `wait` 醒来后发现 `closed_ == true`（说明队列已经关闭了），为什么必须直接 `return false;` 而不能继续 `queue_.push(...)`？

<details>
<summary>核对答案</summary>

队列一旦关闭就不再接收新任务，如果强行塞进去，已经下班退出的消费者永远不会再来取它，导致任务丢失。返回 `false` 可以明确告诉调用方“已关闭，拒绝接收”。

</details>

### 练习 4（独立改造）

修改 `concurrency-queue.cpp`，启动 **3 个工作线程**（把工作线程编号 `id = 0, 1, 2` 打印出来），生产者循环 `push` 20 条 `"log-0"` 到 `"log-19"`，然后 `close()` 并 `join()` 所有线程。注意思考：如果 3 个线程同时往 `std::cout` 打印，文字会不会偶尔串行交错？如何用一把额外的 `std::mutex cout_mu` 保护打印？
