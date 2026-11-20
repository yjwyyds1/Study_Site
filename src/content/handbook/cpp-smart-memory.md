---
title: "内存模型与智能指针进阶：存储期、控制块与自定义分配器"
description: "深入剖析栈/堆/静态存储期与跨单元初始化顺序陷阱、make_unique/make_shared 异常安全与控制块优化、unique_ptr 零开销 C 句柄删除器、shared_ptr 线程安全边界、weak_ptr 破环、enable_shared_from_this 陷阱，以及 Arena 内存池与 placement new。"
order: 24
category: "现代 C++"
tags: ["C++20", "智能指针", "shared_ptr", "weak_ptr", "内存管理", "placement new", "Arena"]
related: ["handbook/raii", "handbook/lifetime", "handbook/pointers-const", "handbook/machine-data-layout"]
---

## 本课解决的工程问题（先抓 `make_unique` / `make_shared` / `weak_ptr`）

> **【工程高频必会 vs 选读扩展】**
> - **工程高频必会（95% 真实工程）**：首选 `std::make_unique` / `std::make_shared` 构造智能指针、用 `std::weak_ptr` + `.lock()` 打破双向循环引用、用 `unique_ptr` 自定义删除器安全托管 `FILE*` 等 C 资源句柄。
> - **低频/底层扩展（已收进第 7 节折叠框）**：`placement new`、手写 Arena 内存池与 `<memory_resource>` (PMR) 只在引擎/高频底座中出现，日常项目直接用标准容器即可。

本篇完整覆盖课程大纲 **`CPP-38` 至 `CPP-44`**。

---

## 1. 四大存储期与静态初始化顺序陷阱（CPP-38）

### 内存分区与四类存储期（Storage Duration）

| 存储期 | 典型变量 | 分配位置与成本 | 生命期边界 |
| --- | --- | --- | --- |
| **自动（Automatic）** | 局部变量、形参 | 线程栈（仅移动栈指针，纳秒级；典型上限 1–8 MB） | 进大括号构造，出作用域逆序析构 |
| **动态（Dynamic）** | `new`、`make_unique`、`vector` 内部缓冲 | 堆/自由存储（需查空闲链表/锁，几十纳秒，可能碎片化） | 从创建到所有权对象析构释放 |
| **静态（Static）** | 全局变量、命名空间变量、类静态成员、局部 `static` | 二进制 `.data` / `.bss` 段（程序全程存在） | 启动时/首次触达构造，`main` 返回后逆序析构 |
| **线程局部（Thread）** | `thread_local` 变量 | 每条线程独立 TLS 段 | 线程启动/首次使用构造，线程退出析构 |

### 静态初始化顺序灾难（Static Initialization Order Fiasco, SIOF）

如果 `a.cpp` 定义全局对象 `Logger g_logger;`（动态初始化），而 `b.cpp` 定义全局对象 `App g_app(g_logger);`——C++ 标准**完全不保证不同翻译单元之间动态全局变量的初始化顺序**！`b.cpp` 极可能先于 `a.cpp` 执行构造，拿到一个**尚未构造的 `g_logger`** 并当场崩溃！

**两大标准解法**：
1. **函数内局部 `static`（Meyers 单例 / Magic Statics）**：把全局变量放进函数里：`Logger& get_logger() { static Logger instance; return instance; }`。C++11 起标准保证：**局部静态变量在第一次执行到该声明时才初始化，且多线程并发首次访问时由编译器加锁保证线程安全，绝不重复初始化！**
2. **C++20 `constinit`**：如果对象可以编译期求值，加上 `constinit` 强制它在静态初始化阶段（`main` 之前、任何动态初始化开始之前）直接填进可执行文件镜像，从根源消除跨单元顺序依赖。

---

## 2. `make_unique` / `make_shared` 的异常安全与单块优化（CPP-39）

### 为什么总是首选 `std::make_unique` 和 `std::make_shared`？

1. **封堵参数求值交错内存泄漏（C++17 前尤为致命）**：
   考虑 `process(std::shared_ptr<A>(new A), may_throw());`。在 C++17 之前，编译器有权按 `new A` → `may_throw()` → 构造 `shared_ptr` 的顺序求值；一旦 `may_throw()` 抛异常，刚 `new` 出来的 `A` 还没来得及交给 `shared_ptr` 就永远泄漏了！改用 `std::make_shared<A>()` 后，分配与接管在同一个函数原子完成，彻底消灭裸 `new`。
2. **`make_shared` 的“一次分配”内存合并优势**：
   - `std::shared_ptr<T>(new T())` 需要**两次堆分配**：1 次给 `T` 对象，1 次给控制块（Control Block）；
   - `std::make_shared<T>()` 将 **`T` 与控制块合并在同一个连续堆块中一次分配**！堆分配次数减半、缓存局部性更好。

```text
new T + shared_ptr:       [ T 对象 ]   <--- 分散两次 malloc --->   [ 控制块: use=1, weak=1 ]
std::make_shared<T>():    [ T 对象 | 控制块: use=1, weak=1 ]       ← 单次连续内存分配！
```

### `make_shared` 仅有的两个局限

- **无法指定自定义删除器**（需要自定义 deleter 时只能直接构造 `std::shared_ptr<T>(ptr, deleter)`）。
- **`weak_ptr` 会延迟整块物理内存释放**：因为 `T` 和控制块住在同一块堆内存里，即使所有 `shared_ptr` 归零调用了 `~T()` 析构对象，只要还有哪怕一个 `weak_ptr` 活着，整块（含已析构对象占用的大体积空间）就无法 `free`，直到最后一个 `weak_ptr` 也销毁。如果 `T` 极大（如几十 MB 缓存）且外部长期持有 `weak_ptr`，改用独立 `new` + `shared_ptr` 反而能早点释放对象主体内存。

---

## 3. `unique_ptr` 自定义删除器封装 C 资源句柄（CPP-40）

遇到 C 语言库（`FILE*`、`fopen`/`fclose`、`malloc`/`free`、POSIX `int fd`、SQLite `sqlite3*`）时，绝不要手写 `fclose` 到处堵 `return`——用 `std::unique_ptr` 配合自定义删除器，**零额外运行期开销**自动 RAII 清理：

```cpp
#include <cstdio>
#include <memory>

// 方式 A：无状态仿函数结构体（推荐！借助 EBO 空基类优化，sizeof(FilePtr) == sizeof(FILE*) == 8 字节）
struct FileCloser {
    void operator()(std::FILE* fp) const noexcept {
        if (fp) std::fclose(fp);
    }
};
using FilePtr = std::unique_ptr<std::FILE, FileCloser>;

// 方式 B：用函数指针（如 decltype(&std::fclose)）
// 缺点：unique_ptr 内部必须额外存一个函数指针，体积翻倍成 16 字节！
using FilePtrFat = std::unique_ptr<std::FILE, int(*)(std::FILE*)>;

FilePtr open_readonly(const char* path) {
    return FilePtr(std::fopen(path, "rb")); // 若 fopen 返回 nullptr，unique_ptr 安全什么也不做
}
```
注意：`unique_ptr` 释放时默认会先检查 `if (ptr != nullptr)` 才调用删除器，因此 `fopen` 失败返回 `nullptr` 也不会误调 `fclose(nullptr)`！如果封装的是非指针整数句柄（如 Linux 文件描述符 `int fd`，非法值为 `-1`），还可以在删除器结构体里嵌套 `struct pointer { int fd = -1; ... };` 或单独写轻量 10 行 RAII 包装类 `UniqueFd`。

---

## 4. `shared_ptr` 控制块机制与线程安全精确边界（CPP-41）

### 控制块里到底存了什么？

每个 `std::shared_ptr<T>` 对象本身通常占 **2 个指针（16 字节）**：
1. 指向受管对象 `T*`（支持别名构造 aliasing constructor 指向子成员）；
2. 指向堆上**控制块（Control Block）**的指针。

控制块内部包含：**强引用计数（`use_count`，原子整数）**、**弱引用计数（`weak_count`，原子整数）**、自定义删除器（类型擦除后存储）以及分配器。

> **千万级大坑——禁止用同一个裸指针构造两个独立 `shared_ptr`**：
> ```cpp
> int* raw = new int(42);
> std::shared_ptr<int> p1(raw); // 创建控制块 #1 (use=1)
> std::shared_ptr<int> p2(raw); // 创建控制块 #2 (use=1)！离开作用域各自 delete raw -> Double-Free 崩溃！
> ```
> 永远从现有 `shared_ptr` 拷贝/移动，或只通过 `make_shared` 创建。

### `shared_ptr` 线程安全的“三层真实边界”

面试与生产高频误区——**`std::shared_ptr` 并不是全自动线程安全的**！精确规则如下：

1. **同一控制块的引用计数增减是线程安全的（原子操作）**：线程 A 拷贝一份自己的 `p_a`、线程 B 析构另一份指向同对象的 `p_b`，绝对安全无数据竞争。
2. **多个线程同时读写“同一个 `shared_ptr` 变量本身”不是线程安全的**：如果线程 A 正在读全局变量 `g_ptr`，线程 B 同时执行 `g_ptr = new_ptr;`，会撕裂 `g_ptr` 内部的两个指针引发崩溃！必须用互斥锁保护，或使用 C++20 **`std::atomic<std::shared_ptr<T>>`**。
3. **被指对象 `*p` 内部数据的并发读写完全不归 `shared_ptr` 管**：`shared_ptr` 只保护计数器，多线程修改 `*p` 的成员仍必须加 `std::mutex` 或使用原子字段。

---

## 5. `weak_ptr` 打破循环引用与原子 `.lock()`（CPP-42）

### 双向循环引用泄漏图解

```text
Node A (heap)                              Node B (heap)
┌──────────────────────┐                  ┌──────────────────────┐
│ shared_ptr<Node> next┼─────────────────►│ use_count = 2        │
│ use_count = 2        │◄─────────────────┼shared_ptr<Node> prev │
└──────────────────────┘                  └──────────────────────┘
外部指针离开作用域后，A 和 B 的 use_count 各减 1 变成 1 —— 互相锁死，永远不会归零释放！
```

当存在**双向指向**或**观察者缓存**时，从属方（或回指指针如 `prev` / `parent`）必须改用 **`std::weak_ptr<T>`**：
- `weak_ptr` 只增加控制块的 `weak_count`，**不增加强引用 `use_count`**。
- 当所有 `shared_ptr` 销毁时，`use_count` 归零，对象 `T` 立即正常析构（只是控制块本身暂留到最后一个 `weak_ptr` 销毁才释放）。

### 为什么必须用 `.lock()` 而不是先判 `expired()` 再使用？

`weak_ptr` **没有 `operator*` 和 `operator->`**，因为它指向的对象随时可能被别的线程释放。错误做法：
```cpp
// 危险 TOCTOU 竞态！
if (!wp.expired()) {
    // 就在这一瞬间，另一个线程析构了最后一个 shared_ptr！
    // 下面如果强行构造 shared_ptr 会直接抛出 bad_weak_ptr 或访问已销毁对象！
}
```
**唯一安全模式：用原子方法 `.lock()` 提升为局部 `shared_ptr` 并判空**：
```cpp
if (auto sp = wp.lock()) {
    // 在这个 if 作用域内，sp 保证 use_count >= 1，对象绝对活着且线程安全！
    sp->do_work();
} else {
    // 对象已失效，走安全降级分支
}
```

---

## 6. `enable_shared_from_this` 与两大使用禁区（CPP-43）

当一个由 `shared_ptr` 托管的对象，需要在自己的**成员函数里把指向自身的 `shared_ptr` 传给异步回调或注册表**时：
- **绝对禁止写 `return std::shared_ptr<Widget>(this);`**——这会凭空新建第二份控制块，导致 Double-Free！
- **正确做法**：让类 `public` 继承 `std::enable_shared_from_this<Widget>`，然后调用 `shared_from_this()`（或 `weak_from_this()`）：

```cpp
class Session : public std::enable_shared_from_this<Session> {
public:
    static std::shared_ptr<Session> create() {
        return std::shared_ptr<Session>(new Session()); // 或配合私有构造钥匙用 make_shared
    }
    void start_async() {
        // 安全！复用当前对象既有的控制块，use_count 安全 +1
        auto self = shared_from_this();
        enqueue_task([self]() { self->on_tick(); });
    }
private:
    Session() = default;
    void on_tick() {}
};
```

`enable_shared_from_this` 的底层原理其实只是在基类里藏了一个 **`mutable std::weak_ptr<T> weak_this_`**；当外部构造 `std::shared_ptr<Session>` 时，构造函数自动探测到该基类并悄悄把控制块填进 `weak_this_`。由此引出**两大绝对禁区**：
1. **禁区一：构造函数内绝不能调用 `shared_from_this()`**——此时 `Session` 还在构造，`shared_ptr` 尚未接管，`weak_this_` 仍为空，调用会立刻抛出 `std::bad_weak_ptr`！应改用静态工厂 `create()` 两段初始化。
2. **禁区二：对象必须真由堆上 `shared_ptr` 托管**——若在栈上写 `Session s; s.start_async();` 或用 `unique_ptr<Session>` 持有它，`weak_this_` 同样为空，调 `shared_from_this()` 直接抛 `std::bad_weak_ptr` 崩溃！因此建议把构造函数设为 `private` 并仅暴露返回 `shared_ptr` 的工厂方法。

---

## 7. Arena / 内存池分配器与 `placement new`（CPP-44）

> **日常工程提示**：95% 的应用代码直接使用 `std::make_unique`、`std::make_shared` 与标准容器即可，无需手写内存池或 `placement new`。下面这部分主要服务于高频交易、游戏引擎或自研底层组件场景，初学可先折叠跳过。

<details><summary>选读扩展（低频 / 底层库开发）：placement new、线性 Arena 与 &lt;memory_resource&gt;</summary>

### `placement new`：把“给内存”与“构造对象”拆开

普通 `new T(args)` 同时做了两件事：① 调 `::operator new` 向堆申请字节；② 在那块地址上运行 `T` 的构造函数。当你提前预留好了一整块原始缓冲区（例如高频网络帧、ECS 实体或 Arena 线性分配器），你可以直接用 **`placement new`** 在指定地址原地构造对象：

```cpp
#include <new> // 必须包含 <new>

alignas(Widget) std::byte raw_slot[sizeof(Widget)]; // 保证大小与对齐！
Widget* w = new (raw_slot) Widget("demo");          // placement new：不分配堆内存，只调用构造函数！

// 使用 w ...

w->~Widget(); // 铁律：必须显式手动调用析构函数！绝不能写 delete w;（内存不是堆分配的！）
```

### 线性 Arena（Bump Allocator）与 C++17 `<memory_resource>`

高频小对象每次 `malloc/free` 不仅慢，而且销毁时要遍历释放几万个节点。**Arena（区域线性分配器）**的核心思想极简单：预先批发一大块连续字节 buffer，每次分配只是把指针 `offset` 向上对齐并往前推（O(1) 几条指令！）；等整批请求/帧处理结束后，**一次性重置偏移或整块归还**。

C++17 标准库 `<memory_resource>`（PMR）已经内置了这套能力，无需重造轮子：

```cpp
#include <array>
#include <memory_resource>
#include <vector>

std::array<std::byte, 4096> stack_buf;
std::pmr::monotonic_buffer_resource arena{stack_buf.data(), stack_buf.size()};
std::pmr::vector<int> fast_vec{&arena}; // 前 4096 字节全程在栈缓冲区线性推进，零堆分配！
```
> **注意**：`monotonic_buffer_resource` 在生命周期内**不会逐个回收单个已释放元素**（它只增不减，直到资源整体析构才统一释放上游内存块），非常适合“短生命周期、批量处理完一锅端”的解析器与每帧计算场景；若要支持单个对象频繁复用回收，则应使用 `std::pmr::unsynchronized_pool_resource`（定长池）或自定义 Free-List 对象池。

</details>

---

## 综合可运行 C++20 示例

```cpp
#include <array>
#include <cstddef>
#include <cstdio>
#include <iostream>
#include <memory>
#include <memory_resource>
#include <new>
#include <string>
#include <vector>

// CPP-38: Meyers 单例消除跨翻译单元 SIOF
struct MetricsRegistry {
    int events{0};
    static MetricsRegistry& instance() {
        static MetricsRegistry inst; // C++11 起保证线程安全懒加载
        return inst;
    }
private:
    MetricsRegistry() = default;
};

// CPP-40: 无状态删除器零成本封装 C 资源
struct CFileCloser {
    void operator()(std::FILE* fp) const noexcept {
        if (fp) std::fclose(fp);
    }
};
using UniqueFile = std::unique_ptr<std::FILE, CFileCloser>;
static_assert(sizeof(UniqueFile) == sizeof(std::FILE*), "EBO zero overhead");

// CPP-42 & CPP-43: weak_ptr 破环 + enable_shared_from_this 安全自共享
struct Node : std::enable_shared_from_this<Node> {
    std::string name;
    std::shared_ptr<Node> child; // 向下强拥有
    std::weak_ptr<Node> parent;  // 向上弱观察，打破循环引用！

    static std::shared_ptr<Node> create(std::string n) {
        return std::shared_ptr<Node>(new Node(std::move(n)));
    }
    void attach_child(const std::shared_ptr<Node>& c) {
        child = c;
        c->parent = weak_from_this(); // C++17：直接从自身控制块生成 weak_ptr
    }
    ~Node() { std::cout << "~Node(" << name << ")\n"; }
private:
    explicit Node(std::string n) : name(std::move(n)) {}
};

// CPP-44: 极简 Arena + placement new 演示
struct Item {
    int id;
    explicit Item(int i) : id{i} {}
    ~Item() { std::cout << "~Item(" << id << ")\n"; }
};

int main() {
    MetricsRegistry::instance().events += 1;

    // CPP-39 & CPP-42 & CPP-43
    {
        auto root = Node::create("root");
        auto leaf = Node::create("leaf");
        root->attach_child(leaf);
        if (auto p = leaf->parent.lock()) {
            std::cout << "leaf parent=" << p->name
                      << ", root use_count=" << p.use_count() << '\n';
        }
    } // 离开作用域时 leaf 与 root 的 use_count 均正确归零析构！

    // CPP-44: placement new + 显式析构
    alignas(Item) std::byte slot[sizeof(Item)];
    Item* item = new (slot) Item(99);
    std::cout << "placement Item id=" << item->id << '\n';
    item->~Item(); // 必须显式析构，严禁 delete item

    // CPP-44: C++17 pmr monotonic_buffer_resource 零堆分配容器
    std::array<std::byte, 512> buf{};
    std::pmr::monotonic_buffer_resource arena{buf.data(), buf.size(), std::pmr::null_memory_resource()};
    std::pmr::vector<int> nums{&arena};
    nums.push_back(10);
    nums.push_back(20);
    std::cout << "pmr size=" << nums.size() << ", events=" << MetricsRegistry::instance().events << '\n';
    return 0;
}
```

---

## 常见误区速查表

| 章节 | 1 行反例 | 真实风险 | 正确做法 |
| --- | --- | --- | --- |
| CPP-38 | `App g_app(g_logger);`（跨 `.cpp`） | 全局构造顺序未定义，拿到未初始化对象崩溃 | 用函数内 `static`（Meyers 单例）或 `constinit` |
| CPP-40 | `unique_ptr<FILE, decltype(&fclose)>` | 内部多存一个函数指针，体积翻倍 | 写无状态 `struct Closer { void operator()(FILE*) const; };` |
| CPP-41 | `shared_ptr<T> a(raw); shared_ptr<T> b(raw);` | 两个独立控制块各自释放一次 `raw`，Double-Free | 仅用 `make_shared`，拷贝已有 `shared_ptr` |
| CPP-41 | 多线程同时读写同一全局 `shared_ptr` | 撕裂指针与控制块读写，数据竞争 UB | 加锁或用 C++20 `std::atomic<std::shared_ptr<T>>` |
| CPP-42 | `if (!wp.expired()) { wp.lock()->f(); }` | 检查与使用之间可能被他线程释放，返回空指针崩溃 | 直接 `if (auto sp = wp.lock()) { sp->f(); }` |
| CPP-43 | 在构造函数里调 `shared_from_this()` | 控制块尚未绑定，抛出 `std::bad_weak_ptr` | 私有化构造函数 + `static create()` 工厂 |
| CPP-44 | 对 `placement new` 对象执行 `delete ptr;` | 试图用堆释放器释放栈/Arena 地址，堆破坏崩溃 | 显式调用 `ptr->~T();` |

---

## 4 个巩固微练习

### 练习 1（识别双控制块陷阱）

指出下面代码哪一行隐藏着 Double-Free 崩溃风险，并说明用 `enable_shared_from_this` 如何修正：
```cpp
struct Worker {
    std::shared_ptr<Worker> self_ref() { return std::shared_ptr<Worker>(this); }
};
auto w = std::make_shared<Worker>();
auto w2 = w->self_ref();
```

<details>
<summary>提示与参考答案</summary>

`std::shared_ptr<Worker>(this)` 会为同一个 `this` 指针创建第二个控制块！当 `w2` 和 `w` 相继析构时，会两次 `delete` 同一个 `Worker` 对象导致堆崩溃。修正：让 `Worker` 公开继承 `std::enable_shared_from_this<Worker>`，并将 `self_ref()` 改为 `return shared_from_this();`。

</details>

### 练习 2（`make_shared` 与 `weak_ptr` 的内存释放时机）

假设一个 `BigTexture` 占用 100 MB 内存。用 `auto p = std::make_shared<BigTexture>();` 创建后，又保存了一个 `std::weak_ptr<BigTexture> wp = p;`。当 `p.reset()` 执行完、`wp` 依然存活时，这 100 MB 内存是否已经归还给操作系统/堆管理器？

<details>
<summary>提示与参考答案</summary>

对象 `BigTexture` 的**析构函数确实已经运行**（内部持有的其他独立堆资源会被释放），但 `BigTexture` 自身占用的这 100 MB 对象外壳与控制块处于**同一块连续分配**中，必须等到最后一个 `weak_ptr` 也销毁时整块内存才会被 `free`。若此类超大对象会被 `weak_ptr` 长期观察，改用 `std::shared_ptr<BigTexture>(new BigTexture())` 分离分配可让主体 100 MB 立即归还。

</details>

### 练习 3（`unique_ptr` 删除器体积测试）

为什么 `std::unique_ptr<int, void(*)(int*)>` 的 `sizeof` 在 64 位平台是 `16` 字节，而传入自定义空结构体删除器时 `sizeof` 保持 `8` 字节？

<details>
<summary>提示与参考答案</summary>

函数指针本身是一个运行期可变状态（指针变量，占 8 字节），因此 `unique_ptr` 必须把它存为成员字段，总大小为 16 字节。而无状态结构体/无捕获 Lambda 没有任何数据成员，标准库内部的压缩对（`[[no_unique_address]]` 或 EBO 空基类优化）能把空删除器压缩到 0 字节占用。

</details>

### 练习 4（`placement new` 与对齐）

如果用 `char raw[sizeof(double)];` 在上面做 `new (raw) double(3.14);`，有什么潜在硬件/语言风险？应该怎么写？

<details>
<summary>提示与参考答案</summary>

普通 `char raw[8]` 的默认对齐要求只有 `1` 字节，如果编译器把它放在奇数地址（如 `0x1001`），在其上构造要求 8 字节对齐的 `double` 违反了对齐要求（未定义行为，在 ARM/严格 SIMD 指令上可能直接总线错误 `SIGBUS`）。正确写法必须显式指定对齐：`alignas(double) std::byte raw[sizeof(double)];`。

</details>
