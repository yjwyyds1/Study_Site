---
title: "并发性能工程、微基准测试与端到端调优实战"
description: "掌握科学基准测试方法论与 P50/P95/P99 尾延迟、steady_clock 微基准与防 DCE、False Sharing 伪共享实证、SoA/AoS 面向数据设计、无分支编程、Arena/Slab 内存池与 jemalloc/mimalloc、perf 火焰图与 Off-CPU 分析、TSan 数据竞争排查，以及 LogScan 端到端吞吐优化。"
order: 83
category: "并发与性能"
tags: ["C++20", "性能优化", "基准测试", "伪共享", "TSan", "perf", "火焰图", "LogScan"]
related: ["handbook/con-atomics-lockfree", "handbook/machine-asm-cache", "labs/logscan-service"]
---

## 本课只解决这 1 个问题

写完并发代码后，凭感觉猜“无锁一定比加锁快”、“开 16 个线程一定快 16 倍”，是性能工程最危险的盲区。真实生产环境下，伪共享、分支预测失败、全局 `malloc` 锁竞争和协调遗漏（Coordinated Omission）随时能让你的多线程程序**比单线程还慢**。

本课对应课程 `CON-40`–`CON-50`，给你一套**先测量、再定位、单变量验证**的完整性能工程兵器库，并在最后一节带你把 `LogScan` 流水线从端到端做一次实战极限优化。

---

## 性能测量方法论：预热、方差、尾延迟与防死代码消除 (CON-40)

### 新手微基准测试的 5 大致命错误

1. **在 Debug 模式（`-O0`）下测性能**：测出来的全是未内联栈帧和调试检查的耗时，毫无参考价值。性能测试必须至少开启 **`-O2`**（并与线上发布构建保持一致的 `-march` 与标准库）。
2. **忘记预热（Warmup）**：程序刚启动时，操作系统还没把代码页和堆内存物理页分配进 TLB（缺页中断）、CPU 还在节能低频档、指令缓存（I-Cache）还是冰冷的。**正式计时前必须先跑 1–3 轮预热**。
3. **只测 1 次就下结论，忽略方差（Variance）**：后台杀毒软件、浏览器或调度抢占会让单次测量剧烈抖动。**至少跑 5–10 轮**，同时报告**中位数（Median）**、**标准差 / IQR（四分位距）**与全轮原始样本。
4. **被编译器死代码消除（DCE）骗出“0 纳秒神迹”**：如果循环里算出的结果你既没累加校验、也没打印或交给汇点，`-O2` 优化器会直接把整个计算循环**整块删掉**！
5. **只看平均延迟（Mean），不看尾延迟（P50 / P95 / P99）**：99 个请求耗时 1 ms，第 100 个请求遇到队列积压卡了 1000 ms，平均延迟看似只有 11 ms，但 **P99 已经爆到 1000 ms**（高并发微服务下，一次请求调 10 个下游，只要有 1 个踩中 P99，整体慢概率接近 10%！）。

### 最近秩法（Nearest-Rank）统计 P50 / P95 / P99

```cpp
#include <algorithm>
#include <cmath>
#include <vector>

double percentile_ms(std::vector<double> samples_ms, double p) {
    if (samples_ms.empty()) return 0.0;
    std::sort(samples_ms.begin(), samples_ms.end());
    std::size_t rank = static_cast<std::size_t>(std::ceil((p / 100.0) * samples_ms.size()));
    rank = std::clamp<std::size_t>(rank, 1, samples_ms.size());
    return samples_ms[rank - 1]; // 1..100ms 样本下：p50=50, p95=95, p99=99
}
```

> **压测警惕：协调遗漏（Coordinated Omission）**：如果你的压测客户端是**闭环（Closed-Loop）**——等上一条请求返回才发下一条——当服务端卡顿 500 ms 时，客户端自动跟着降速停发了，测出的延迟曲线会显得“风平浪静”。要真实还原排队堆积，服务端压测必须使用**开环定速（Open-Loop，按固定到达率定时投递，记录“计划发送时间”与“实际完成时间”之差）**！

---

## `steady_clock` 微基准测试与 Google Benchmark 模式 (CON-41)

### 1. 为什么计时一律用 `std::chrono::steady_clock`？

- `system_clock` 是挂钟时间，会受到 NTP 网络校时回拨或夏令时跳变影响，两次相减甚至可能得出**负数**！
- **`steady_clock` 是单调递增时钟**，专用于测量时间间隔。

### 2. 纯 C++20 编写防优化微基准夹具（模仿 Google Benchmark）

Google Benchmark 的核心秘密在于三件事：
1. **`DoNotOptimize(val)`**：用内联汇编或 `volatile` 汇点逼迫编译器认为“结果被外部读走了”，绝不能删掉计算。
2. **`ClobberMemory()`**：插入编译器内存屏障，逼迫编译器把所有挂在寄存器里的写操作真正刷回内存。
3. **`for (auto _ : state)` 自动倍增迭代次数**：如果单次函数只跑 5 ns，计时器精度根本抓不到；框架会自动把迭代次数拉长到至少几百毫秒再除以总次数，摊薄计时器本身误差。

```cpp
#include <chrono>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <vector>

template <typename T>
inline void do_not_optimize(const T& val) {
#if defined(__GNUC__) || defined(__clang__)
    asm volatile("" : : "r,m"(val) : "memory");
#else
    volatile auto sink = &val;
    (void)sink;
#endif
}

template <typename Fn>
double bench_ns(const char* name, std::size_t iters, Fn&& fn) {
    for (std::size_t i = 0; i < iters / 10 + 1; ++i) fn(); // 预热

    auto t0 = std::chrono::steady_clock::now();
    for (std::size_t i = 0; i < iters; ++i) {
        fn();
    }
    auto t1 = std::chrono::steady_clock::now();
    double ns_per_op = std::chrono::duration<double, std::nano>(t1 - t0).count() / iters;
    std::cout << name << ": " << ns_per_op << " ns/op\n";
    return ns_per_op;
}

int main() {
    std::vector<int> v(1024, 1);
    bench_ns("std::accumulate(1024)", 50000, [&] {
        int s = std::accumulate(v.begin(), v.end(), 0);
        do_not_optimize(s); // 防止 -O2 把整个 accumulate 删掉！
    });
    return 0;
}
```

---

## 缓存行伪共享 (False Sharing) 实验与消除实证 (CON-42)

CPU 并不是按字节从内存取数，而是以 **缓存行（Cache Line，现代 x86/ARM 常见为 64 字节）** 为最小单位搬运和同步。

即使线程 0 只写 `counters[0]`、线程 1 只写 `counters[1]`（逻辑上八竿子打不着！），只要这两个 8 字节计数器紧挨着落在**同一条 64 字节缓存行**里：
- Core 0 写入 `counters[0]` 时，MESI 协议必须把 Core 1 缓存里的**整条 64 字节缓存行置为失效（Invalid）**；
- 紧接着 Core 1 写入 `counters[1]` 时，又得通过总线/互联把整条缓存行抢回来、把 Core 0 作废！
- 两个核心把 90% 的时间全耗在“互相踢掉对方缓存行”的 **缓存行乒乓效应（Cache Line Ping-Pong）** 上，多核性能暴跌 5–10 倍！

```text
糟糕布局（False Sharing，同处一条 64B 缓存行）：
[ counters[0] (8B) | counters[1] (8B) | ... 48B ... ]  ◀── Core 0 和 Core 1 疯狂互相作废！

修复布局（alignas(64) 隔离）：
[ counters[0] (8B) + 56B 填充 ]   [ counters[1] (8B) + 56B 填充 ]
   ▲ Core 0 独占这条 64B 缓存行！    ▲ Core 1 独占这条 64B 缓存行！
```

### 亲手跑通对比实验（`g++ -O2 -std=c++20 -pthread`）

C++17 引入了 `std::hardware_destructive_interference_size`（在 GCC 12+ 上直接用它有时会触发 `-Winterference-size` 警告，因此工程常配合 `ifdef` 或固定 `64` 对齐）：

```cpp
#include <atomic>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <new>
#include <thread>
#include <vector>

#ifdef __cpp_lib_hardware_interference_size
constexpr std::size_t kCacheLine = std::hardware_destructive_interference_size;
#else
constexpr std::size_t kCacheLine = 64;
#endif

struct Unpadded { std::atomic<std::uint64_t> val{0}; };
struct alignas(kCacheLine) Padded { std::atomic<std::uint64_t> val{0}; };

template <typename CounterT>
double run_test(int n_threads, std::uint64_t iters) {
    std::vector<CounterT> counters(n_threads);
    auto t0 = std::chrono::steady_clock::now();
    {
        std::vector<std::jthread> ts;
        for (int i = 0; i < n_threads; ++i) {
            ts.emplace_back([&, i] {
                for (std::uint64_t k = 0; k < iters; ++k) {
                    counters[i].val.fetch_add(1, std::memory_order_relaxed);
                }
            });
        }
    }
    auto t1 = std::chrono::steady_clock::now();
    return std::chrono::duration<double, std::milli>(t1 - t0).count();
}

int main() {
    constexpr std::uint64_t kIters = 20'000'000;
    std::cout << "未填充 (False Sharing) 4 线程耗时: " << run_test<Unpadded>(4, kIters) << " ms\n";
    std::cout << "alignas(" << kCacheLine << ") 4 线程耗时: " << run_test<Padded>(4, kIters) << " ms\n";
    return 0;
}
```
> 注：实战里如果单线程只需高频累加本地计数，**先用普通局部变量 `uint64_t local = 0;` 在寄存器里跑完循环，最后只写一次 `counters[i]`** 甚至比 `alignas(64) atomic` 还要快 10 倍以上！

---

## 缓存友好的面向数据设计：SoA vs AoS 与冷热分离 (CON-43)

把“每个对象打包成一个大 `struct` 放进 `std::vector`”叫 **AoS（Array of Structures）**；把每个字段单独拆成平行数组放进结构体里叫 **SoA（Structure of Arrays）**。

```text
AoS (Array of Structures):
[ ts | level | bytes | 128B msg ... ][ ts | level | bytes | 128B msg ... ]
  ▲ 扫描只需要统计 level==ERROR 的字节总数，每次读 64B 缓存行却夹带大量无用 msg！

SoA (Structure of Arrays) + 冷热分离:
levels: [ lvl0 | lvl1 | lvl2 | ... ]  ◀── 1 条 64B 缓存行塞满 64 条日志级别，SIMD 自动向量化飞起！
bytes:  [ b0   | b1   | b2   | ... ]
msgs:   [ msg0 | msg1 | msg2 | ... ]  ◀── 只有命中告警时才按下标去冷数据数组取详单！
```

**冷热分离（Hot/Cold Splitting）原则**：把高频扫描/判断的热字段（如 `timestamp`、`level`、`status`、`hash`）紧凑排在一起（尽量塞进 1 条缓存行），把只有出错或输出详情才用的冷字段（长字符串 `message`、调用栈、扩展属性 `map`）拆到冷表或独立指针后面，**CPU 缓存命中率与 SIMD 向量化吞吐往往能直接翻倍**。

---

## 分支预测失败与无分支编程 (CON-44)

现代 CPU 流水线深度可达 15–20 级。遇到 `if (x > 128)` 时，CPU 的**分支预测器（Branch Predictor）**会提前猜一个方向往下预取指令执行。
- 如果数据是有序或高度规律的：预测准确率 > 99%，`if` 几乎零成本！
- 如果数据是**50/50 随机打乱**的（例如日志级别随机分布）：预测器一半时间全猜错，每次猜错都要**清空整条流水线倒掉重算**，白白浪费 15–20 个时钟周期！

**无分支编程（Branchless）**利用条件传送指令（x86 `CMOV`）或算术/位运算消灭分支跳转：

```cpp
#include <algorithm>
#include <chrono>
#include <cstdint>
#include <iostream>
#include <numeric>
#include <random>
#include <vector>

int main() {
    constexpr std::size_t N = 2'000'000;
    std::vector<int> data(N);
    std::mt19937 rng(42);
    std::uniform_int_distribution<int> dist(0, 255);
    for (auto& x : data) x = dist(rng); // 随机分布，分支预测噩梦

    auto bench = [&](const char* label, auto fn) {
        auto t0 = std::chrono::steady_clock::now();
        std::uint64_t ans = fn();
        auto t1 = std::chrono::steady_clock::now();
        std::cout << label << ": "
                  << std::chrono::duration<double, std::milli>(t1 - t0).count()
                  << " ms (sum=" << ans << ")\n";
    };

    bench("随机数据 有分支 if", [&] {
        std::uint64_t sum = 0;
        for (int x : data) {
            if (x >= 128) sum += x;
        }
        return sum;
    });

    bench("随机数据 无分支算术", [&] {
        std::uint64_t sum = 0;
        for (int x : data) {
            // (x >= 128) 求值为 0 或 1，乘法或位掩码无跳转直接累加（易触发自动 SIMD！）
            int mask = -(x >= 128); // 全 1 (0xFFFFFFFF) 或全 0
            sum += (x & mask);
        }
        return sum;
    });
    return 0;
}
```
> **警告**：无分支写法两条路都要算，如果分支原本高度可预测（比如 99.9% 的日志都不是 `FATAL`），老老实实写 `if`（甚至 C++20 `[[unlikely]]` 属性）反而更快！

---

## 减少 `malloc` 锁竞争：Arena、Slab 与对象池分配器 (CON-45)

在多线程并发解析日志或处理 HTTP 请求时，如果每个工作线程每秒钟做几百万次 `std::string` / `new Node` 小内存分配：
1. 频繁进出通用堆分配器可能触发内部 arena 锁竞争或跨核释放争用。
2. 堆内存碎片化、局部性差，缓存未命中率飙升。

### 三大高频自定义分配器策略

| 策略 | 工作方式 | 释放方式 | 适用场景 |
| --- | --- | --- | --- |
| **Arena / Monotonic Bump Allocator** | 预先申请一大块缓冲区，每次分配只做 `ptr += size`（1 条加法指令！） | **不能单独释放某个对象**，整批请求结束时把游标一键重置归零（$O(1)$ 释放一万个对象！） | 单次请求/单批日志解析临时对象（如 `std::pmr::monotonic_buffer_resource`） |
| **Slab / Fixed-Size Object Pool** | 把大块内存切成等大槽位串成单向空闲链表（Free List） | 归还对象直接头插回本线程 Free List（$O(1)$ 且**零碎片**） | 固定大小连接上下文、任务节点、AST 节点 |
| **Thread-Local `std::pmr` 组合** | `monotonic_buffer_resource` 叠加 `unsynchronized_pool_resource`（每线程独占，无锁！） | 随作用域自动析构释放整块底池 | C++17/20 标准库零外部依赖实战神器 |

```cpp
#include <array>
#include <cstddef>
#include <iostream>
#include <memory_resource>
#include <string>
#include <vector>

void parse_batch_with_arena() {
    // 栈上预先开好 64KB 缓冲，整批日志解析全程 0 次系统 malloc！
    std::array<std::byte, 64 * 1024> stack_buf{};
    std::pmr::monotonic_buffer_resource arena(stack_buf.data(), stack_buf.size());
    std::pmr::vector<std::pmr::string> lines(&arena);

    for (int i = 0; i < 500; ++i) {
        lines.emplace_back("INFO request handled cleanly", &arena);
    }
    std::cout << "Arena 处理条数 = " << lines.size() << '\n';
} // 离开作用域整块释放，零逐个 delete 开销！
```

---

## 现代多线程分配器：`jemalloc`、`tcmalloc` 与 `mimalloc` 线程缓存 (CON-46)

如果代码里大量使用第三方库，没办法全都手动改成 `std::pmr`，最立竿见影的提速手段之一就是**直接替换系统默认 `malloc`**！

默认 glibc `ptmalloc2` 在某些高并发分配/跨线程释放场景下容易出现锁争用与虚拟内存膨胀（Arena 膨胀）。现代高性能分配器（**jemalloc**、Google **tcmalloc**、微软 **mimalloc**）的核心设计如出一辙：

```text
线程 0 ──▶ [ Thread-Local Cache (tcache) ] ──(无锁分配/本地释放!)
                    │ 批不足/溢出时才找中央堆
                    ▼
           [ Size Classes / Central Arenas (按大小分级分片) ]
                    │
                    ▼
           [ OS Page Allocator (mmap / VirtualAlloc) ]
```

- **Thread-Local Cache（线程本地缓存）**：95% 的小对象分配和释放直接从本线程私有的分级链表（8B、16B、32B...）拿取，**全程无锁、无原子指令**！
- **跨线程释放优化**：例如线程 A `new` 了一个任务节点放进队列，线程 B 消费完 `delete` 它——`mimalloc` 按内存页分片自由链表，即使跨线程释放也极少互相卡锁。
- **零改代码切换方式（Linux）**：安装对应库后，在命令行一行注入即可测出对比收益：`LD_PRELOAD=/usr/lib/x86_64-linux-gnu/libmimalloc.so ./your_app`（或直接在 CMake 里 `target_link_libraries` 链接 `jemalloc` / `mimalloc`）。

---

## CPU 热点剖析 (`perf record/report`、火焰图) 与 Off-CPU 分析 (CON-47)

**没有测量证据的优化都是盲人摸象。** 在 Linux 上定位并发性能瓶颈，工具必须分清 **On-CPU（正在跑着烧核）** 还是 **Off-CPU（卡在锁、I/O 或条件变量上睡着了）**！

### 1. On-CPU 剖析三板斧（`perf` + FlameGraph）

```bash
# 第一步：全局硬件计数器体检（看 IPC 每周期指令数、缓存失效率、上下文切换次数）
perf stat ./bench_app

# 第二步：按 99Hz 采样调用栈（务必编译带 -g 保留符号表，且用 -O2！）
perf record -F 99 -g -- ./bench_app
perf report --stdio   # 交互式或文本查看热点函数占比

# 第三步：生成 SVG 火焰图（FlameGraph）
perf script | stackcollapse-perf.pl | flamegraph.pl > cpu_flame.svg
```
- **怎么看火焰图？**：**纵轴**是函数调用栈深度，**横轴宽度**代表该函数（含子函数）在采样期间占用的 **CPU 时间比例**（注意：横轴顺序按字母排，不代表时间先后！）。哪一块出现宽大的“平顶山（Plateau）”，哪里就是 CPU 热点！

### 2. Off-CPU 盲区：为什么 `perf record` 一片空白，程序却跑得巨慢？

如果 8 个工作线程全卡在 `std::mutex::lock()` 或 `BoundedQueue::pop()` 里睡觉，**它们根本不在 CPU 上运行**！`perf record`（默认按 `cycles` 采样）采集到的样本数为零——你盯着火焰图什么都找不到！

**定位 Off-CPU 阻塞的三大手段**：
1. **`perf stat` 看 `context-switches`**：如果每秒上下文切换飙到几十万次且 CPU 利用率很低，八成是锁竞争或过度通知唤醒。
2. **`gdb` 快速抓所有线程卡点**：在卡慢瞬间执行 `gdb -p <PID> -batch -ex "thread apply all bt"`，立刻看到 8 个线程是不是全堵在同一个 `pthread_mutex_lock` 或 `read()` 上。
3. **分阶段墙钟计时 / eBPF `offcputime`**：在关键阶段（读盘、排队等待、纯解析、锁获取）打 `steady_clock` 耗时统计，或用 BCC/bpftrace `offcputime` 工具直接画出 **Off-CPU 阻塞火焰图**！

---

## 数据竞争猎手：ThreadSanitizer (`-fsanitize=thread`) 与 Helgrind/DRD (CON-48)

并发 Bug 最可怕的地方在于“本地跑 100 次全对，上线凌晨 3 点崩一次”。**ThreadSanitizer（TSan）** 能帮你把潜伏的数据竞争当场抓现行！

### 1. TSan 实战用法（GCC / Clang 内置）

```bash
# 编译：打开 -fsanitize=thread 与 -g（建议至少 -O1，保留行号且运行不至于太慢）
g++ -std=c++20 -fsanitize=thread -g -O1 -pthread race_demo.cpp -o race_demo_tsan
./race_demo_tsan
```
一旦哪怕有一次**无同步并发读写**（即使那次运行侥幸算出了正确数值！），TSan 会利用影子内存（Shadow Memory）与向量时钟直接打印精确警报：
- 哪一行代码做了 `Write of size 4 at 0x7ffd... by thread T2`；
- 之前哪一行代码做了 `Previous write of size 4 at 0x7ffd... by thread T1`；
- 两者的调用栈与对象创建位置。

### 2. TSan vs Valgrind Helgrind / DRD 对比

| 工具 | 原理与用法 | 开销 | 适用场景 |
| --- | --- | --- | --- |
| **ThreadSanitizer (TSan)** | 编译期插桩，需要重新用 `-fsanitize=thread` 编译 | CPU 约 2–15×，内存约 5–10× | **日常 CI 与本地开发首选！** 速度较快，准确率极高（注意不能与 ASan `-fsanitize=address` 同时开启） |
| **Valgrind Helgrind / DRD** | 二进制动态插桩（`valgrind --tool=helgrind ./app`），无需源码重编 | CPU 约 20–50× | 排查没有源码的第三方闭源 `.so` 库，或检测特定 POSIX 锁顺序问题 |

> **WSL2 / 新版 Linux ASLR 注意**：如果在极少数内核上跑 TSan 报 `FATAL: ThreadSanitizer: unexpected memory mapping`，可能是内核开启了高随机化地址空间（ASLR mmap rnd bits），可在容器/主机调整或升级编译器解决。

---

## 锁竞争剖析与无锁方案的真实权衡 (CON-49)

很多同学学完无锁编程后，恨不得把项目里所有 `std::mutex` 全换成 CAS 无锁结构。但在真实基准压测里，**盲目换无锁往往更慢**！

原因有三：
1. **高竞争下的 CAS 重试风暴（CAS Retry Storm）**：16 个核同时用 CAS 抢修改同一个 `head_` 指针，只有 1 个核成功，其余 15 个核的缓存行全被作废、被迫重拉缓存行再重试一次——总线流量按 $O(N^2)$ 爆炸，而带有内核休眠机制的自适应互斥锁反而能稳住总线！
2. **现代 `std::mutex` 在无竞争/低竞争时极快**：用户态只需要 1 次成功的原子 CAS（约 10–15 ns），根本不进内核系统调用！
3. **无锁的工程复杂度与内存回收代价**：Hazard Pointers 每次读都要刷屏障写风险槽，在读多写少场景可能还不如简单局部拷贝或 `shared_mutex` / 分片锁。

### 并发数据结构选型黄金天梯（从最推荐到最后不得已）

1. **第一层：Shared-Nothing（零共享 + 局部归并）** —— 最快、零 bug、线性扩展！
2. **第二层：Batching（批量化）+ 分片锁（Lock Striping）** —— 把每 1 条抢一次锁改成每 128 条抢一次锁，99% 的业务场景到这里性能已经溢出。
3. **第三层：SPSC 无锁环形队列** —— 单写单读场景几乎零开销且无 ABA 困扰。
4. **第四层：通用 MPMC 无锁数据结构** —— 仅在极端低延迟、实时系统（绝不能有调度抖动或优先反转）且经权威库（如 `folly`/`moodycamel::ConcurrentQueue`）充分验证后才引入。

---

## 端到端实战案例：LogScan 并发吞吐全面优化 (CON-50)

现在把本系列 50 节的全部内功，集中打在一个真实项目——**`LogScan` 高吞吐并发日志分析服务**上，看一个看似“已经用了线程池和队列”的版本，如何通过 4 轮单变量实测实现数量级飞跃：

### 初始基线（Baseline）为什么跑不动？

假设初版多线程 `LogScan` 是这样写的：
- 主线程 `std::getline` 逐行读文件，**每读 1 行**就调用 `BoundedQueue::push(std::string line)`。
- 8 个工作线程每次 `pop()` 1 行，用 `std::regex` 解析，命中错误时去抢一把全局 `stats_mu` 给 `std::map<std::string, int> counts` 加一。

`perf stat` 与分阶段计时一测，立刻露出 4 大瓶颈：
1. **锁与条件变量频率爆炸**：1000 万行日志 = 1000 万次 `push` + 1000 万次 `pop` = **4000 万次加解锁与条件变量唤醒**！线程全堵在 `BoundedQueue::mu_` 上（Off-CPU 抖动严重）。
2. **每行一次 `malloc`/`free`**：1000 万次 `std::string` 堆分配释放，把内存分配器砸成热点。
3. **统计阶段锁争用 + 红黑树查找**：所有工人每条日志都抢同一把 `stats_mu` 更新 `std::map`。
4. **结果汇总未做局部归并 / 伪共享**。

### 4 轮单变量系统优化路线

| 轮次 | 单变量改动内容 | 核心原理（对应章节） | 预期收益 |
| --- | --- | --- | --- |
| **第 1 轮：批量入队（Batching）** | 把 `BoundedQueue<std::string>` 改成 `BoundedQueue<std::vector<std::string>>`，每攒够 **128 行**（或遇到 EOF）才 `push` 一次 | 锁、条件变量与队列竞争直接**降为原来的 1/128**（CON-19, CON-49） | 吞吐通常直接暴涨 **3–8×**，context-switches 断崖下跌 |
| **第 2 轮：零拷贝视图 + 块缓冲** | 主线程直接按 **4 MB 整块（Chunk）**读入缓冲区（双缓冲复用），切分出 `std::string_view` 交给工作线程（或配每线程 `std::pmr::monotonic_buffer_resource`） | 消灭千万次 `std::string` 小内存 `malloc`/`free` 与拷贝开销（CON-45） | 彻底抹平 `malloc`/`memcpy` 火焰图平顶山 |
| **第 3 轮：用前缀/手写扫描替代 `std::regex` + 冷热分离** | 去掉极慢的 `std::regex`，用 `std::string_view::starts_with` / SIMD 扫描找换行符，统计结构按 `alignas(64)` 与热字段紧凑排列 | 消灭重型分支与动态引擎状态机（CON-43, CON-44） | 单核解析吞吐提升 **5–20×** |
| **第 4 轮：线程局部统计 + 退出一次性归并** | 每个工作线程只在自己栈上局部变量 `LocalStats` 累加 `ERROR/WARN/bytes`，队列排空退出后，主线程花 < 1ms 合并 $N$ 份结果 | Shared-Nothing 零共享（CON-03, CON-08, CON-42） | 多核扩展逼近 Amdahl / 磁盘带宽物理极限！ |

### 端到端验收核对清单（每一轮改动必跑）
1. **正确性回归**：对比“单线程原版输出”与“4 轮优化后多线程输出”，`ERROR/WARN/INFO` 条数与校验和 **100% 字节一致**。
2. **并发安全体检**：用 `-fsanitize=thread -g -O1` 跑通满载压测用例，**0 条 Data Race 告警**。
3. **性能对照记录**：固定相同 500 MB 日志样本、`-O2` 编译、预热 1 轮后连测 5 轮，记录每轮**吞吐量（MB/s 与 lines/s）**、**P50 / P95 / P99 批次延迟**及 `perf stat` 对比截图或原始输出。

---

## 本课常见报错急救室与微练习

| 现象 / 关键字 | 一句话根因 | 精准排查 / 修复动作 |
| --- | --- | --- |
| `-O2` 跑微基准耗时显示 `0.000 ns` | 计算结果没用 `do_not_optimize` 或累加输出，被编译器死代码消除整段删掉。 | 用 `do_not_optimize(res)` 固定结果，或把最终校验和打印出来。 |
| 开了 8 线程，运行时间反而比 1 线程慢 5 倍 | 极大概率踩中**伪共享（False Sharing）**或所有线程高频争抢同一把全局锁。 | 用 `alignas(64)` 隔离每线程写槽位；改为局部变量累加；把逐条入队改成 `128` 条一批入队。 |
| `perf report` 里只看到零星几条样本，但程序跑了 10 秒 | 线程 99% 的时间睡在锁或条件变量上（Off-CPU），不在 CPU 上跑。 | 用 `perf stat` 看 `context-switches`，用 `gdb -p <PID> -batch -ex "thread apply all bt"` 看阻塞点。 |

### 练习 1（识别伪共享）
观察下面结构体数组 `std::vector<WorkerStat> stats(8);`，当 8 个线程分别只更新自己的 `stats[tid]` 时，会发生伪共享吗？为什么？怎么修？

```cpp
struct WorkerStat {
    std::uint64_t ok_count = 0;
    std::uint64_t err_count = 0;
};
```

<details>
<summary>核对答案</summary>

**会！** `sizeof(WorkerStat)` 只有 16 字节，而一条 CPU 缓存行是 64 字节——这意味着 `stats[0]`、`stats[1]`、`stats[2]`、`stats[3]` **全挤在同一条 64 字节缓存行里**！线程 0 改 `stats[0].ok_count` 会不断把线程 1/2/3 的缓存行作废。
**修复**：在结构体定义加上 `struct alignas(64) WorkerStat { ... };`（或者更彻底：循环里用普通栈上局部变量 `uint64_t ok = 0, err = 0;` 跑完后再一次性写回 `stats[tid]`）。

</details>

### 练习 2（计算尾延迟与 Little's Law 综合实战）
设计一个 5 轮可重复微基准程序：对比 `std::vector<std::atomic<uint64_t>>`（未对齐）与 `alignas(64)` 对齐版本在 4 线程各累加 1000 万次下的耗时中位数与最大值；并用 `-fsanitize=thread` 跑一遍你的 `ThreadPool` + `BoundedQueue` 确认零竞争。

<details>
<summary>参考验证命令</summary>

```bash
# 1. 性能实测（必须 -O2！）
g++ -std=c++20 -O2 -pthread false_sharing_bench.cpp -o bench && ./bench

# 2. TSan 竞争检测（必须去掉 -O2 换成 -O1 -g -fsanitize=thread）
g++ -std=c++20 -fsanitize=thread -g -O1 -pthread pool_test.cpp -o pool_tsan && ./pool_tsan
```

</details>

---

**恭喜通关《并发与性能》全部 50 节核心体系！** 接下来你可以直接进入 [LogScan v3：有界 TCP 日志服务与持久化原型](../../labs/logscan-service/)，把有界队列、背压控制、优雅停机和端到端压测真正落地到一个完整的可写进简历的工程项目里。
