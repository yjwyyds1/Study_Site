---
title: "硬件内存模型、原子操作、无锁数据结构与 C++20 协程"
description: "从 Store Buffer 与 Invalidation Queue 看懂 CPU 为何乱序，彻底分清编译器重排与硬件重排、volatile 误区、std::atomic 与 CAS、seq_cst / acquire-release / relaxed 内存序、Treiber 无锁栈与 ABA/Hazard Pointer/RCU，以及 C++20 协程与结构化并发。"
order: 82
category: "并发与性能"
tags: ["C++20", "atomic", "内存序", "CAS", "无锁", "ABA", "Hazard Pointer", "协程"]
related: ["handbook/concurrency-queue", "handbook/con-perf-tuning", "handbook/machine-asm-cache"]
---

## 本课只解决这 1 个问题

为什么线程 A 明明先写了 `x = 1` 再读 `y`，线程 B 先写了 `y = 1` 再读 `x`，两个线程最后竟然能**同时读到 `0`**？
为什么 `volatile` 在多线程里毫无用处？为什么无锁栈会触发诡异的 **ABA 内存炸弹**？

本课对应课程 `CON-29`–`CON-39`，从现代 CPU 微架构的 **Store Buffer / Invalidation Queue** 出发，自底向上打通 **C++ 内存模型（Memory Model）**、**无锁数据结构与内存回收**，并带你实战 **C++20 无栈协程与结构化并发**。

---

## 硬件内存层次：Store Buffer、Invalidation Queue 与 CPU 为何乱序 (CON-29)

很多程序员以为：只要所有 CPU 核遵循 MESI 缓存一致性协议，内存里的世界就一定是按代码顺序严格同步的。**错！** MESI 虽然保证缓存最终一致，但如果写操作每次都傻等所有其他核回复“我把旧缓存行作废了（Invalidate Ack）”，CPU 流水线早就卡死了。

为了压榨性能，硬件架构师在 **CPU 核心** 和 **L1 Cache** 之间塞进了两个异步缓冲队列：

```text
┌──────────────┐                     ┌──────────────┐
│    Core 0    │                     │    Core 1    │
└──────┬───────┘                     └──────┬───────┘
       │ 写先扔进这里不等 ack！              │
       ▼                                    │ 写操作
┌──────────────┐                            ▼
│ Store Buffer │                     ┌──────────────┐
└──────┬───────┘                     │ Store Buffer │
       │                             └──────┬───────┘
       ▼                                    ▼
┌──────────────┐  Invalidate 消息    ┌──────────────┐
│   L1 Cache   │ ◀─────────────────▶ │   L1 Cache   │
└──────┬───────┘                     └──────┬───────┘
       ▲                                    ▲
┌──────┴───────────┐                 ┌──────┴───────────┐
│ Invalidation Que │                 │ Invalidation Que │
└──────────────────┘                 └──────────────────┘
(收到作废通知先暂存这，先回复 Ack，待会儿再真正删 L1 旧值！)
```

### 这两个缓冲队列制造了什么“魔法乱序”？

1. **Store Buffer 引发“写-读乱序（Store-Load Reordering）”**：
   - Core 0 执行 `x = 1; r1 = y;`。由于 `x` 当前不在 Core 0 独占缓存里，Core 0 不想等别的核回应，先把 `x = 1` **扔进自己的 Store Buffer**，然后**立刻往下读 `y`**（此时从 Core 0 视角，`x = 1` 还没刷进全局缓存，别的核根本看不见！）。
   - 同时 Core 1 执行 `y = 1; r2 = x;`，把 `y = 1` 扔进自己的 Store Buffer 后立刻读 `x`。
   - 结果：**`r1 == 0 && r2 == 0` 在真实的 x86 和 ARM 机器上都会高频出现！**
2. **Invalidation Queue 引发“读-读陈旧值”**：
   - Core 1 收到“作废旧缓存行”的消息时，为了赶紧回 Ack，先把作废任务塞进 Invalidation Queue。结果 Core 1 接下来读变量时，**直接从 L1 里读到了还没来得及作废的陈旧数据**！

| CPU 架构 | 内存模型强弱 | 允许的硬件重排 | 常见屏障指令 |
| --- | --- | --- | --- |
| **x86 / x86-64** | **TSO（强模型）** | 只允许 **Store → Load** 乱序（Store Buffer 导致），天然保证 Load-Load / Store-Store / Load-Store 有序 | `mfence` / `LOCK` 前缀指令 |
| **ARM64 / RISC-V** | **弱内存模型（Weak）** | **4 种读写组合全都可以乱序**！在 x86 侥幸能跑的“无屏障代码”，换到苹果 M 芯片或手机 ARM 上直接崩！ | `dmb ish` / `ldar` / `stlr` |

---

## 编译器重排 vs CPU 重排：为什么 `volatile` 不是给多线程用的 (CON-30)

从你写下 C++ 源码到变量真正变成电压变化，中间经过**两道重排关卡**：

```text
C++ 源码 ──(1. 编译器优化重排)──▶ 汇编机器码 ──(2. CPU 乱序执行 + Store Buffer)──▶ 内存可见结果
```

### 1. 编译器会怎样重排你的代码？

只要在**单线程视角下等价**，`-O2`/`-O3` 下的编译器几乎可以任意调整指令顺序、把内存变量直接缓存在寄存器里、甚至删掉“看起来没用的循环”：

```cpp
// 反面教材：普通 bool 在多线程里等待
bool ready = false;
void wait_loop() {
    while (!ready) { } // -O2 编译器发现循环体没改 ready，直接优化成：
                       // if (!ready) while (true) {} —— 死循环到天荒地老！
}
```

### 2. 为什么 `volatile` **绝不能**用于线程同步？

许多从单片机/C 转过来的同学喜欢写 `volatile bool ready = false;`。这是 C++ 并发里**最经典的错误**：
1. **`volatile` 只阻止编译器优化（告诉编译器每次老老实实从内存读，别放寄存器），对 CPU 的 Store Buffer 和乱序执行没有任何约束！** 它一条内存屏障指令也不会生成。
2. **`volatile` 不保证原子性**：在 32 位 CPU 上写一个 64 位 `volatile int64_t` 依然会被撕裂成两次 32 位写。
3. **在 C++ 标准里，多线程无同步读写 `volatile` 变量依然是 Data Race 未定义行为（UB）**！

**铁律**：`volatile` 唯一合法用途是**硬件内存映射 I/O（MMIO）、`sig_atomic_t` 信号处理函数、或 `setjmp`/`longjmp`**；线程间通信**一律用 `std::atomic<T>` 或 `std::mutex`**！

---

## `std::atomic<T>` 与无锁判定：`is_always_lock_free` (CON-31)

`std::atomic<T>` 是 C++ 并发的基石，它同时给你三项承诺：
1. **操作不可分割（Atomicity）**：绝不会读到写了一半的撕裂值（Torn Read/Write）。
2. **消除 Data Race UB**：多线程同时读写同一个 `std::atomic<T>` 是合法且定义良好的。
3. **跨线程可见性顺序（Memory Ordering）**：编译期阻止违规优化 + 运行期生成对应架构的内存屏障指令。

### 大坑：`std::atomic<MyStruct>` 一定是“无锁”的吗？

不一定！`T` 必须是 **Trivially Copyable（可平凡拷贝）** 类型，且硬件一般只支持 1、2、4、8 字节（部分 x86 支持 16 字节 `cmpxchg16b`）的原生原子指令。如果你定义了一个 24 字节的结构体并放进 `std::atomic<BigStruct>`，编译器依然能编译通过——但它在底层**悄悄塞了一把全局互斥锁**！

```cpp
#include <atomic>
#include <cstdint>
#include <iostream>

struct SmallPair { std::uint32_t a, b; };          // 8 字节
struct BigBundle { std::uint64_t a, b, c; };       // 24 字节

int main() {
    std::cout << std::boolalpha;
    std::cout << "atomic<int> 恒无锁: "
              << std::atomic<int>::is_always_lock_free << '\n';        // true
    std::cout << "atomic<SmallPair> 运行期无锁: "
              << std::atomic<SmallPair>{}.is_lock_free() << '\n';       // 常见为 true
    std::cout << "atomic<BigBundle> 恒无锁: "
              << std::atomic<BigBundle>::is_always_lock_free << '\n';  // false（底层加锁模拟！）
    // 唯一由 C++ 标准保证在所有平台上 100% 无锁的是 std::atomic_flag
    std::atomic_flag flag = ATOMIC_FLAG_INIT;
    (void)flag;
    return 0;
}
```

> 提示：在 Linux 上用 `std::atomic<16字节结构>` 时，GCC 有时需要链接 `-latomic`（或者使用 `-mcx16` 开启 16 字节硬件 CAS）。工程里可以用 `static_assert(std::atomic<T>::is_always_lock_free)` 在编译期守住“真无锁”底线！

---

## 原子读改写 (RMW)：`fetch_add`、`exchange` 与 CAS (`weak` vs `strong`) (CON-32)

不要把原子读写拆成两步：

```cpp
// 经典错误！虽然 load 和 store 各自原子，合起来不是原子！
counter.store(counter.load() + 1); // 两线程同时读到 10，都会写回 11，漏加 1 次！
```

真正的读-改-写（Read-Modify-Write, RMW）必须一条原语完成：
- **`fetch_add(n)` / `fetch_sub(n)`**：原子加减，返回**修改前的旧值**（`++counter` 返回新值，等价于 `fetch_add(1) + 1`）。
- **`exchange(new_val)`**：原子替换成新值并返回旧值（常用于实现极简 Spinlock 或原子交接指针）。
- **`compare_exchange_weak(expected, desired)` / `compare_exchange_strong(...)`（CAS，比较并交换）**：所有无锁算法的万金油！

### 吃透 CAS 的工作逻辑与两大致命细节

CAS 的语义等价于下面这步**原子执行**的逻辑：
```text
如果 (*this == expected):
    *this = desired;
    return true;
否则:
    expected = *this;  // <--- 注意！失败时 CAS 会自动把 expected 刷新成当前最新值！
    return false;
```

**`weak` vs `strong` 该选谁？**
- **`compare_exchange_weak`**：允许**虚假失败（Spurious Failure）**——即使 `*this == expected`，在 ARM/PowerPC 等使用 LL/SC（Load-Linked / Store-Conditional）指令的 CPU 上，如果中途发生中断或同缓存行抖动，也可能返回 `false`。**只要本身就包在 `while` 循环里重试，一律用 `weak`**（在 ARM 上性能更好；x86 上两者生成的指令通常相同）。
- **`compare_exchange_strong`**：绝不虚假失败。当你只试一次、不想套 `while` 循环时（例如只抢一次初始化权），必须用 `strong`。

```cpp
#include <atomic>
#include <iostream>

// 用 CAS 实现线程安全的“原子取最大值”
void atomic_update_max(std::atomic<int>& max_val, int candidate) {
    int prev = max_val.load(std::memory_order_relaxed);
    // 若 max_val 已被别的核改得 >= candidate 就不用更新；否则循环 CAS 尝试换上 candidate
    // 失败时 prev 会被 CAS 自动更新为最新的 max_val！
    while (prev < candidate &&
           !max_val.compare_exchange_weak(prev, candidate,
                                          std::memory_order_release,
                                          std::memory_order_relaxed)) {
    }
}
```

---

## C++ 内存序：顺序一致 (`memory_order_seq_cst`) (CON-33)

C++ 提供了 6 种 `std::memory_order`，但最常用、最核心的其实只有三档：**`seq_cst`**、**`acquire`/`release`**、**`relaxed`**。

**`memory_order_seq_cst`（顺序一致，所有 `std::atomic` 操作的默认参数）** 是最强、最符合人类直觉的保障：
- 所有线程观察到的全部 `seq_cst` 操作，都能排成**唯一一条全局一致的时间线（Total Modification Order）**。
- 你可以把它想象成：所有核都乖乖连在同一个全局开关上，每次只有一个核能往前走一步，绝不会出现“Core 0 看到 A 在 B 前，Core 1 看到 B 在 A 前”的分裂现实。

回到本课开头的 Store Buffer 经典测试（Dekker/Litmus test）：

```cpp
std::atomic<int> x{0}, y{0};
int r1 = 0, r2 = 0;

// Thread 1: x.store(1, std::memory_order_seq_cst); r1 = y.load(std::memory_order_seq_cst);
// Thread 2: y.store(1, std::memory_order_seq_cst); r2 = x.load(std::memory_order_seq_cst);
```
- 如果用默认的 **`seq_cst`**：编译器会在 `store` 和 `load` 之间插入全屏障（如 x86 的 `LOCK XCHG` 或 `mfence`），强行排空 Store Buffer，因此 **`r1 == 0 && r2 == 0` 绝不可能发生**！
- 如果你换成 `acquire`/`release` 或 `relaxed`：**`r1 == 0 && r2 == 0` 依然可能发生！**（因为 `acquire`/`release` 只约束单方向同步，并不禁止独立的 Store-Load 互换！）。

**代价**：`seq_cst` 在高频写入场景下开销较大（需要全内存屏障或强顺序指令），因此在明确只需要“发布-订阅”一对一同步时，工程界更偏爱下一节的 **`acquire`/`release`**。

---

## 获取-释放语义：Acquire-Release 与 `happens-before` 配对 (CON-34)

`acquire` 和 `release` 就像是一对**单向同步拉链**：用来实现“线程 A 把一大包普通非原子数据填好，再通过一个原子信号发布给线程 B 安全读取”。

```text
线程 A (发布者)                                线程 B (订阅者)
  msg.text = "ERROR disk full";  (普通写)
  msg.code = 500;                (普通写)
       │
       │  sequenced-before（单线程内代码顺序）
       ▼
  ready.store(true,              ── synchronizes-with ──▶  while (!ready.load(
    std::memory_order_release)                               std::memory_order_acquire)) {}
                                                                  │
                                                                  │ sequenced-before
                                                                  ▼
                                                           assert(msg.code == 500); // 100% 成立！
```

### 为什么这套拉链绝不会漏？记住两条单向通行禁令

1. **`release`（释放写）像一扇“只进不出”的上方单向闸门**：所有排在 `release` **之前**的普通读写（`msg.text`, `msg.code`），**绝不允许被重排到 `release` 之后**（它们必须在发布信号前全部刷出可见！）。
2. **`acquire`（获取读）像一扇“只出不进”的下方单向闸门**：所有排在 `acquire` **之后**的普通读写（`assert(msg.code == 500)`），**绝不允许被提前到 `acquire` 之前**（绝不能偷跑提前去读 `msg`！）。
3. 当线程 B 的 `acquire` 读到了线程 A `release` 写入的那个值，C++ 标准就确立了跨线程的 **`synchronizes-with`** 关系，并结合线程内部的 `sequenced-before` 传递推导出 **`happens-before`**——这就意味着 `msg` 的全部普通写严格先发生于线程 B 的读取，**彻底消除数据竞争！**

### 读改写（RMW）用什么？`memory_order_acq_rel`

如果一个操作既要读出别人发布的内容（`acquire`）、又要向后发布自己的改动（`release`），比如 `std::shared_ptr` 引用计数减一并检查是否归零：
- 引用计数**加一**：可以用 `fetch_add(1, std::memory_order_relaxed)`（只是增加存活引用，不需要同步新状态）。
- 引用计数**减一**：必须用 **`fetch_sub(1, std::memory_order_acq_rel)`**（释放自己之前对该对象的所有修改，并且最后一个归零释放 `delete` 的线程必须 `acquire` 到之前所有线程的修改，否则析构对象时会读到旧数据！）。

---

## 宽松序 (`relaxed`) 计数器与 `memory_order_consume` 现状 (CON-35)

### 1. `memory_order_relaxed`：只管自身原子，不管其他任何变量的顺序

`relaxed` 只保证两件事：**该原子变量自身的操作不可分割** + **所有线程对该单个原子变量的修改顺序一致**。它**不建立任何 `synchronizes-with` 关系**。

**安全用法**：
- 多线程独立上报监控指标：`bytes_processed.fetch_add(n, std::memory_order_relaxed);`，最后等所有线程 `join()`（`join()` 本身提供全同步！）之后再统一读取汇总结果。
- 永远**不要**用 `relaxed` 去发布“数据已准备好”的标志位或指针！

### 2. `memory_order_consume`：已被主流弃用的设计

理论上 `consume` 比 `acquire` 更弱（只保证有“数据依赖”的指针解引用有序，如 `p = ptr.load(consume); use(*p);`，在 ARM 上省一条 `dmb` 屏障）。但现实中**编译器极难在各种优化后精准追踪跨函数的数据依赖链**，因此 GCC/Clang/MSVC 多年来全都直接**把 `memory_order_consume` 当成 `memory_order_acquire` 处理**，C++17/20 已明确不鼓励使用，请忘掉它，安心用 `acquire`。

---

## 无锁栈实战：Treiber Stack 与 CAS 循环 (CON-36)

1986 年 R. Kent Treiber 发明了最经典的无锁数据结构——**Treiber Stack**。下面我们先实现它的 **`push`（CAS 自旋入栈）**，理解无锁算法的典型形态：

```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

template <typename T>
class TreiberStackPushOnly {
    struct Node {
        T data;
        Node* next;
        explicit Node(T val) : data(std::move(val)), next(nullptr) {}
    };

public:
    ~TreiberStackPushOnly() {
        Node* cur = head_.load(std::memory_order_relaxed);
        while (cur) {
            Node* nxt = cur->next;
            delete cur;
            cur = nxt;
        }
    }

    void push(T val) {
        Node* new_node = new Node(std::move(val));
        // 先读出当前栈顶（relaxed 即可，下面 CAS 成功时的 release 会发布 new_node->data/next）
        new_node->next = head_.load(std::memory_order_relaxed);
        // 如果这期间别的线程抢先改了 head_，CAS 失败并自动更新 new_node->next 为最新 head_，继续重试！
        while (!head_.compare_exchange_weak(
            new_node->next, new_node,
            std::memory_order_release,
            std::memory_order_relaxed)) {
        }
    }

    std::size_t drain_count() {
        std::size_t n = 0;
        Node* cur = head_.exchange(nullptr, std::memory_order_acquire);
        while (cur) {
            Node* nxt = cur->next;
            delete cur;
            cur = nxt;
            ++n;
        }
        return n;
    }

private:
    std::atomic<Node*> head_{nullptr};
};
```

### 无锁算法的三重进度保证（Progress Guarantees）

| 层级 | 定义 | 代表例子 |
| --- | --- | --- |
| **Wait-Free（无等待）** | **每一个**线程都在有限步内必然完成操作，绝对不会饿死 | `SPSC RingBuffer`、单次 `atomic::fetch_add` |
| **Lock-Free（无锁）** | 系统整体必然前进——**至少有一个**线程在有限步内能完成（哪怕个别线程 CAS 失败重试几次，绝不因为某线程被 OS 挂起而全盘卡死） | Treiber Stack、Michael-Scott Queue |
| **Obstruction-Free（无障碍）** | 只有当其他线程暂停干扰时，单个线程才能在有限步内完成 | 乐观事务内存 |

> **为什么上面的示例只写了 `push` 和单线程 `drain_count`，没直接写并发 `pop`？**
> 因为 C++ 没有垃圾回收器（GC）！如果你贸然在并发 `pop()` 里 `delete old_head;`，马上就会撞上并发编程最恐怖的幽灵——**Use-After-Free 与 ABA 问题**！

---

## ABA 问题与对策：Tagged Pointer、Hazard Pointers 与 RCU 直觉 (CON-37)

假设我们在上面 Treiber Stack 里天真地写了一个并发 `pop()`：
```cpp
Node* old_head = head_.load(std::memory_order_acquire);
while (old_head && !head_.compare_exchange_weak(old_head, old_head->next)) {}
```
看看两个线程如何把它玩坏：

```text
初始栈：head ──▶ [A] ──▶ [B] ──▶ [C]

1. 线程 1 执行 pop：读到 old_head = A，并提前读好了 old_head->next = B！
   ── 此时线程 1 在执行 CAS 之前被操作系统切走暂停！──

2. 线程 2 飞速执行：
   - pop() 弹出 A，并且 delete A；
   - pop() 弹出 B，并且 delete B（B 已被释放！）；
   - push() 新建一个节点，分配器恰好复用了刚才释放的地址 A！
   当前栈变为：head ──▶ [A(新)] ──▶ [C]

3. 线程 1 醒来执行 CAS(head, expected=A, desired=B)：
   它只检查 head 是不是等于地址 A —— 是的（地址巧合还是 A）！
   CAS 居然成功了！！于是 head 被改成了早已被 delete 的野指针 [B]！！
```

这就是臭名昭著的 **ABA 问题**：值（或地址）从 **A 变成 B 又变回 A**，CAS 误以为期间什么都没发生过！并且注意：就算没有 ABA，线程 1 在步骤 1 读 `old_head->next` 那一瞬间，如果线程 2 已经 `delete A`，这里本身就已经触发了 **Use-After-Free 崩溃**！

### 解决无锁内存回收与 ABA 的三大经典武器

1. **Tagged / Versioned Pointer（带版本号指针）**：
   把指针和 64 位单调递增版本号打包成 128 位结构 `struct TaggedPtr { Node* ptr; uint64_t tag; }`（或利用 64 位系统高 16 位未用地址位做指针压缩），每次修改 `head` 时 `tag + 1`。即使地址复用回 A，版本号已经从 `(A, 1)` 变成 `(A, 3)`，线程 1 的 CAS 必定失败！
2. **Hazard Pointers（风险指针，已纳入 C++26 `<hazard_pointer>`）**：
   每个线程把“我正在解引用、千万别删”的指针写进全局可见的**风险指针槽位**。释放线程不能立刻 `delete`，而是把待删节点放进自己的退休列表（Retire List），等列表积攒到阈值时扫一遍所有线程的风险指针，**只要没人指着它，才真正 `delete`**！
3. **RCU（Read-Copy-Update，已纳入 C++26 `<rcu>`，Linux 内核核心机制）**：
   - **读者**：进入只读区几乎**零开销**（无需锁、甚至无需原子写！），顺着指针读旧版本数据。
   - **写者**：拷贝一份新数据改好，用一次原子指针替换把新版本挂上去；**旧版本不立刻删**，等所有“在替换前就已经开始读的旧读者”全部离开临界区（称为一个 **Grace Period 宽限期**）后，再安全回收旧内存！

---

## 内存回收策略与 C++20 `std::atomic_ref` / `atomic::wait` (CON-38)

除了 Hazard Pointers 和 RCU，工业界还广泛采用 **EBR（Epoch-Based Reclamation，基于纪元的内存回收，如 Rust `crossbeam-epoch`）**：把时间分成全局纪元 `0, 1, 2...`，线程进入无锁操作前先声明自己处于当前纪元，等所有活跃线程都推进到新纪元后，批量回收两个纪元前的垃圾节点（比 Hazard Pointer 少很多每步内存屏障开销，但若某线程被长期阻塞会拖住回收）。

同时，C++20 为日常开发者带来了两个极其实用的新原子能力：

### 1. `std::atomic_ref<T>`：把普通内存“临时原子化”

有时候你的底层数组（比如科学计算大数组、内存映射共享缓冲区）平时单线程构造初始化，**只有某一个并行阶段需要多线程原子更新它**，如果一开始就声明成 `std::atomic<double>[]`，不仅初始化慢，还不能直接传给要求普通 `double*` 的 C/SIMD 库。C++20 的 **`std::atomic_ref<T>`** 让你在不改变原有对象类型的前提下，对该对象提供**局部作用域内的原子操作**：

```cpp
#include <atomic>
#include <iostream>
#include <thread>
#include <vector>

int main() {
    std::vector<int> buckets(4, 0); // 普通 vector<int>！

    {
        std::jthread t1([&] {
            std::atomic_ref<int> ref(buckets[0]);
            for (int i = 0; i < 10000; ++i) ref.fetch_add(1, std::memory_order_relaxed);
        });
        std::jthread t2([&] {
            std::atomic_ref<int> ref(buckets[0]);
            for (int i = 0; i < 10000; ++i) ref.fetch_add(1, std::memory_order_relaxed);
        });
    } // 离开作用域，所有线程退出后 buckets[0] 恢复为普通变量安全读取

    std::cout << "buckets[0] = " << buckets[0] << '\n'; // 20000
    return 0;
}
```
> **严格契约**：在任意 `std::atomic_ref` 存活期间，**严禁**对该同一内存位置进行任何**非原子**读写（包括 `buckets[0]` 直接读）！且对象地址必须满足 `std::atomic_ref<T>::required_alignment`。

### 2. C++20 `atomic::wait()` / `notify_one()` / `notify_all()`

以前想等待一个原子状态变成 `true`，要么写自旋循环烧 CPU，要么被迫额外配一把 `std::mutex` + `std::condition_variable`。现在 C++20 的 `std::atomic` 直接内置了底层 **futex** 风格等待原语：

```cpp
#include <atomic>
#include <iostream>
#include <thread>

int main() {
    std::atomic<bool> ready{false};

    std::jthread waiter([&] {
        // 如果当前值还是 false，就挂起睡眠（不占 CPU！）；被 notify 唤醒后会重新检查是否 != false
        ready.wait(false);
        std::cout << "Waiter 醒来，收到信号！\n";
    });

    std::this_thread::sleep_for(std::chrono::milliseconds(30));
    ready.store(true);
    ready.notify_one(); // 精准唤醒睡在 ready 上的线程
    return 0;
}
```

---

## C++20 协程与异步运行时 / 结构化并发模式 (CON-39)

高并发网络服务动辄要同时维持 10 万条 TCP 连接。如果每条连接配 1 个 OS 线程，光是线程栈（假设 2MB）就要吃掉 200GB 内存！于是有了 **事件循环 + 回调地狱**，以及现代的终极解法——**C++20 无栈协程（Stackless Coroutines）**。

### 1. 协程的核心直觉：可以“暂停（Suspend）”和“恢复（Resume）”的函数

普通函数一旦 `return` 就彻底销毁了局部栈帧；而协程函数只要体内出现下面 3 个关键字之一，编译器就会自动把它改造成一个**状态机**（局部变量存在编译器分配的协程帧里，常可被 HALO 优化消除堆分配）：
- **`co_yield expr`**：产出一个值并**暂停**，把控制权交还调用者（做惰性序列生成器）。
- **`co_await expr`**：等待一个异步操作（比如等 socket 可读）；如果还没就绪就**原地暂停让出线程**，等 `epoll`/`io_uring` 回调时再从断点恢复往下跑，代码却像同步一样直白！
- **`co_return expr`**：协程彻底结束并返回最终结果。

下面是一个**零外部依赖、可直接编译运行的 C++20 `Generator<int>` 协程示例**，带你直观摸到 `promise_type` 与 `coroutine_handle` 的骨架：

```cpp
#include <coroutine>
#include <iostream>
#include <optional>

template <typename T>
struct Generator {
    struct promise_type {
        T current_value{};
        Generator get_return_object() {
            return Generator{std::coroutine_handle<promise_type>::from_promise(*this)};
        }
        std::suspend_always initial_suspend() noexcept { return {}; } // 创建后先暂停，等调用者拉取
        std::suspend_always final_suspend() noexcept { return {}; }   // 结束时暂停，由 ~Generator 销毁
        std::suspend_always yield_value(T value) noexcept {
            current_value = std::move(value);
            return {};
        }
        void return_void() noexcept {}
        void unhandled_exception() { std::terminate(); }
    };

    using Handle = std::coroutine_handle<promise_type>;
    explicit Generator(Handle h) : handle_(h) {}
    ~Generator() { if (handle_) handle_.destroy(); }
    Generator(const Generator&) = delete;
    Generator(Generator&& other) noexcept : handle_(other.handle_) { other.handle_ = nullptr; }

    std::optional<T> next() {
        if (!handle_ || handle_.done()) return std::nullopt;
        handle_.resume(); // 恢复执行直到下一个 co_yield 或 co_return
        if (handle_.done()) return std::nullopt;
        return handle_.promise().current_value;
    }

private:
    Handle handle_;
};

Generator<int> fibonacci(int limit) {
    int a = 0, b = 1;
    for (int i = 0; i < limit; ++i) {
        co_yield a; // 吐出当前值并暂停在这里！
        int nxt = a + b;
        a = b;
        b = nxt;
    }
}

int main() {
    auto gen = fibonacci(6);
    while (auto v = gen.next()) {
        std::cout << *v << ' '; // 输出: 0 1 1 2 3 5
    }
    std::cout << '\n';
    return 0;
}
```

### 2. 异步运行时与结构化并发（Structured Concurrency）

理解了 `co_yield`，工业级异步框架（如 `asio::awaitable`、`libunifex`、`folly::coro`、C++26 `std::execution`）的 `Task<T>` + `co_await` 原理也一脉相承：
- **Awaiter 三件套**：`await_ready()`（已经就绪就不暂停，直接走快路径）、`await_suspend(caller_handle)`（把当前协程句柄塞给 I/O 事件循环或线程池，异步完成后调 `caller_handle.resume()`）、`await_resume()`（恢复后取回结果或重抛异常）。
- **结构化并发铁律**：千万不要把异步任务像 `detach()` 一样“发后即忘（Fire-and-forget）”，那样一旦父请求超时取消，孤儿协程还在后台访问已销毁的局部上下文！**结构化并发要求每个异步子任务必须被包在父作用域（TaskGroup / `when_all`）内，父作用域在退出前保证所有子任务要么取消、要么全部汇合完毕，并且错误沿任务树向上传播。**

---

## 本课常见坑与微练习

### 练习 1（内存序辨析：为何这组代码会断言失败？）
下面这段代码在 ARM64 服务器上偶尔触发 `assert` 失败，请指出原因并修复：

```cpp
int data = 0;
std::atomic<bool> ready{false};
// 线程 1：
data = 123;
ready.store(true, std::memory_order_relaxed);
// 线程 2：
while (!ready.load(std::memory_order_relaxed)) {}
assert(data == 123);
```

<details>
<summary>核对答案</summary>

`memory_order_relaxed` 不提供任何跨变量排序约束。编译器和 ARM CPU 完全可能把 `ready.store(true)` 重排到 `data = 123` 之前，或者线程 2 在线程 1 刷出 `data` 之前就读到了 `ready == true`，构成对 `data` 的数据竞争（UB）。
**修复**：线程 1 改为 `ready.store(true, std::memory_order_release);`，线程 2 改为 `while (!ready.load(std::memory_order_acquire)) {}`，建立 `synchronizes-with` → `happens-before` 保障。

</details>

### 练习 2（CAS 循环经典坑）
为什么下面这段 CAS 循环会陷入死循环或算错？
```cpp
int expected = x.load();
while (!x.compare_exchange_weak(expected, expected + 1)) {
    expected = x.load(); // <--- 注意这一行！有没有问题？
}
```
（再思考：如果写成 `int expected = 0; while (!x.compare_exchange_weak(expected, expected + 1)) {}` 对吗？）

<details>
<summary>核对答案</summary>

1. 第一段其实多做了一次多余的 `x.load()`（因为 `compare_exchange_weak` 失败时自己就已经把最新的 `x` 写回 `expected` 了），虽然语义上仍能工作但白多一次原子读且可能错过瞬时状态。
2. 反过来，如果某些场景你想用 CAS 持续等待“直到 `x` 等于特定值 0 再把它改成 1”，绝对不能直接复用 `expected` 而不重置它！因为第一次 CAS 失败后 `expected` 会被改成非 0 值，下一轮循环就变成拿非 0 值去 CAS 了！所以每次用完要搞清楚：我是要“基于最新值递增”（不重置 `expected`），还是要“抢占固定标志位 0→1”（每轮重试前必须重设 `expected = 0`）。

</details>

### 下一步怎么走
无锁和原子操作只是工具，绝不是“写了无锁就一定更快”。到底什么时候互斥锁吊打无锁、为什么伪共享会让 8 核比 1 核还慢、如何用 `perf` 火焰图和 `ThreadSanitizer` 科学定位瓶颈？进入最后一课 [并发性能工程、微基准测试与端到端调优实战](../con-perf-tuning/)！
