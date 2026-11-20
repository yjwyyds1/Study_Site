---
title: "类接口、值语义与复制移动"
description: "用构造函数和 const 成员函数守住类不变量，用零法则写出深拷贝值类型，区分 std::move 与实际转移，并对比纯虚接口与对象切片。"
order: 28
tags: ["C++20", "值语义", "移动语义", "零法则", "多态"]
related: ["handbook/raii", "labs/logscan-build", "handbook/error-handling"]
sources: ["value-move.cpp"]
---

## 本课只解决这 1 个问题

写单文件工具时，`struct Counts` 只有四个公开整数，直接读写很方便。但进入多文件工程后，对象开始持有字符串、动态数组甚至独占资源（如输出端或文件句柄）。这时你必须回答三个接口问题：**怎么保证对象内部状态永远合法？调用者复制一份报告再修改时，原报告会不会跟着变？什么时候该禁止复制、只允许移动，又什么时候该用虚函数接口？**

前置要求：完成[RAII 与独占所有权](../raii/)和[LogScan v0 实验](../../labs/logscan/)，能看懂 `std::unique_ptr` 与 `std::vector`。

## 心智模型：不变量、零法则与“只做强转”的 `std::move`

### 1. 用构造函数与 `const` 成员函数守住类不变量

**类不变量（class invariant）**是对象从构造完成到析构前始终成立的规则。例如日志报告 `ScanReport` 约定三条不变量：
1. 来源名 `source_` 不能为空；
2. 列表 `entries_` 里不存放空记录；
3. `size()` 始终等于已存入记录条数。

如果把成员变量设为 `private`，只在**构造函数**和**公开修改方法**（如 `add_entry`）里校验，外部就无法把对象改坏；而所有只读查询（`source()`、`size()`、`empty()`）都标上 **`const`**，这样即使拿到 `const ScanReport&` 也能安全查询，编译器同时禁止你在查询函数里意外修改成员。

### 2. 零法则（Rule of Zero）：值类型 vs 只移动资源持有者

现代 C++ 最重要的类设计原则叫**零法则**：**不要手写析构函数、复制构造/赋值和移动构造/赋值，而是把资源包装成标准库拥有型成员（`std::string`、`std::vector`、`std::unique_ptr`）**，让编译器自动生成正确且高效的特殊成员函数！

- 成员全是值语义拥有者（如 `ScanReport` 含 `std::string` 和 `std::vector<std::string>`）→ 编译器自动生成**深拷贝**（副本独立）和**移动**（接管内部缓冲区）。
- 只要包含一个只移动成员（如 `Pipeline` 含 `std::unique_ptr<ReportSink>`）→ 编译器自动**删除复制构造与复制赋值**，只保留移动，天然防止两个对象误删同一份资源！

### 3. 深拷贝 vs 移动：`std::move` 本身什么也不搬！

```text
【深拷贝】 ScanReport copied = original;
  original.entries_ ──▶ [ "INFO boot" ]                  (独立堆内存 A)
  copied.entries_   ──▶ [ "INFO boot", "WARN retry" ]    (独立堆内存 B，互不影响)

【移动】   ScanReport moved = std::move(copied);
  1) std::move(copied) 只把 copied 强转成右值引用 ScanReport&&（此时内存纹丝未动！）
  2) ScanReport 的移动构造函数接管内部指针：
     moved.entries_  ──▶ [ "INFO boot", "WARN retry" ]   (直接接管堆内存 B，零逐项复制)
     copied.entries_ ──▶ (有效但空/未指定状态，可安全 clear() 或重新赋值)
```

三个容易混淆的细节一次说清：
- **初始化 vs 赋值**：`ScanReport b = a;` 是**复制初始化**（调用复制构造函数，创建新对象）；已存在的对象执行 `b = a;` 才是**复制赋值**。
- **移后源对象（moved-from）**：对标准库类型（如 `std::vector`、`std::string`），移后对象处于“有效但状态未指定”——不能假设里面还有原内容，但可以安全析构、重新赋值或调用无前置条件的方法（如 `clear()`、`empty()`）；而 `std::unique_ptr` 标准明确保证移后变为 `nullptr`。
- **复制消除（Copy Elision）**：C++17/20 规定，函数按值返回一个纯右值（如 `return ScanReport{"app.log"};`）时，编译器保证直接在调用方目标位置构造，**零拷贝、零移动**——千万别画蛇添足写成 `return std::move(local);`，反而会破坏优化！

### 4. 具体值类型 vs 运行时多态接口（`ReportSink`）

当输出端需要按运行时配置切换（例如正式运行写文件，单元测试写内存计数器 `MemorySink`），才需要定义抽象基类 `ReportSink`：
- 用**纯虚函数** `virtual void write(const ScanReport& report) = 0;` 约定接口契约；
- 必须提供 **`virtual ~ReportSink() = default;`**，否则通过 `std::unique_ptr<ReportSink>` 销毁派生对象时不会调用 `~MemorySink()`，属于**未定义行为**；
- 固定单一格式输出（如 LogScan v1 的文本汇总）不需要虚函数，直接用具体值类型更简单、更快、无堆分配。

## 最小可运行代码与逐行追踪

新建 `value-move.cpp` 并写入下面的代码，编译运行一次验证值语义深拷贝、移动构造与移后复用、`unique_ptr` 只移动类型，以及通过基类接口触发派生虚析构：

{{example:value-move.cpp}}

编译并运行：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic value-move.cpp -o value-move.exe
.\value-move.exe
```

核对输出：

```text
after copy-and-append: original.size=1, copied.size=2
after move: moved.size=2, moved-from copied.empty=true
after reuse of moved-from: copied.size=1
pipeline moved: p1.has_sink=false, p2.has_sink=true
sink received: source=app.log, entries=2
MemorySink destroyed (received=1)
```

逐步追踪关键状态变化：

| 执行步骤 | `original.size()` | `copied.size()` | `moved.size()` | 堆资源 / 多态观察 |
| --- | --- | --- | --- | --- |
| 构造 `original` 并加 1 条 | `1` | — | — | `original` 独占 1 条记录 |
| `ScanReport copied = original;` 并加 1 条 | **`1`** | **`2`** | — | 深拷贝：改 `copied` 完全不影响 `original` |
| `ScanReport moved = std::move(copied);` | `1` | `0`（已空） | **`2`** | 缓冲区所有权从 `copied` 转给 `moved` |
| `copied.clear_entries(); copied.add_entry(...);` | `1` | **`1`** | `2` | 移后源对象有效，清空后可安全复用 |
| `Pipeline p2 = std::move(p1); p2.emit(moved);` | `1` | `1` | `2` | `p1.has_sink()==false`，`MemorySink` 收到 1 条 |
| 内层 `{ ... }` 结束 | `1` | `1` | `2` | `~ReportSink()` 虚分发调用 `~MemorySink()` 打印 `received=1` |

## 1 行反例坑点（千万别踩）

### 坑 1：试图复制含 `std::unique_ptr` 的只移动类型

```cpp
Pipeline p2 = p1; // 编译错误：use of deleted function 'Pipeline::Pipeline(const Pipeline&)'
```

因为 `Pipeline` 持有 `std::unique_ptr<ReportSink>`，复制被编译器自动禁用；必须显式表达所有权转移：`Pipeline p2 = std::move(p1);`。

### 坑 2：对 `const` 对象调用 `std::move`（静默退化成拷贝！）

```cpp
const ScanReport frozen{"app.log"};
ScanReport dst = std::move(frozen); // 不报错！但 std::move(frozen) 是 const ScanReport&&，只能匹配复制构造！
```

`const` 对象的资源不允许被掏空，所以移动构造 `ScanReport(ScanReport&&)` 无法绑定它，编译器会静默回退到复制构造 `ScanReport(const ScanReport&)`。打算移动的对象不要声明成 `const`。

### 坑 3：按值传递基类导致“对象切片（Object Slicing）”

```cpp
struct Base { int a = 1; virtual ~Base() = default; };
struct Derived : Base { int b = 2; };
Base sliced = Derived{}; // 危险切片：Derived 特有的成员 b 和多态动态类型全部被切掉！
```

多态对象必须通过**指针或引用**（如 `ReportSink&`、`const ReportSink&`、`std::unique_ptr<ReportSink>`）使用，绝不能按值存进基类变量或 `std::vector<Base>`。

### 坑 4：多态基类忘写 `virtual` 析构函数

```cpp
class BadSink { public: ~BadSink() = default; /* 漏了 virtual！*/ };
std::unique_ptr<BadSink> ptr = std::make_unique<MemorySink>(); // 离开作用域时未定义行为！
```

只要类打算作为多态基类并允许通过基类指针删除，析构函数必须是 `public virtual`（或 `protected` 非虚以禁止经基类删除）。

## 4 个梯度微练习

### 练习 1（读代码判断调用了哪个函数）

下面四行代码分别触发了哪一个特殊成员函数？（构造 / 复制构造 / 复制赋值 / 移动构造）

```cpp
ScanReport a{"a.log"};       // (1)
ScanReport b = a;            // (2)
ScanReport c = std::move(a); // (3)
b = c;                       // (4)
```

<details>
<summary>核对答案</summary>

- `(1)` 带参构造函数 `ScanReport(std::string)`；
- `(2)` **复制构造**（注意：尽管写了 `=`，但 `b` 是刚诞生的新对象，不是赋值！）；
- `(3)` **移动构造**；
- `(4)` **复制赋值**运算符 `operator=`（`b` 早已存在）。

</details>

### 练习 2（找 Bug 并修复：`const` 成员函数缺失）

下面辅助函数无法通过编译，原因是什么？应该改哪里？

```cpp
class Counter {
public:
    void inc() { ++n_; }
    int value() { return n_; }
private:
    int n_{0};
};

void print(const Counter& c) {
    std::cout << c.value() << '\n'; // 编译错误！
}
```

<details>
<summary>提示与答案</summary>

`print` 拿到的是 `const Counter&`，只能调用标了 `const` 的成员函数；但 `value()` 漏写了 `const`。把 `int value()` 改成 `int value() const noexcept { return n_; }` 即可通过编译。

</details>

### 练习 3（辨析移动后的不变量）

在 `value-move.cpp` 里，把 `copied` 移动到 `moved` 之后，如果此时调用 `copied.source()` 会得到什么？对照我们在 `ScanReport` 开头写下的不变量（`source_` 非空），这说明什么？

<details>
<summary>核对答案</summary>

`ScanReport` 使用了编译器默认生成的移动构造，会把 `copied.source_`（`std::string`）一起移走，移后 `copied.source_` 很可能是空字符串 `""`——也就是说**移后对象只保证能安全销毁或重新赋值，不一定维持业务层的“非空来源名”不变量**。如果业务要求移后源对象连 `source()` 也仍可读，要么在类型契约里明确规定“移后仅允许销毁或整体重新赋值”，要么自定义移动构造把源对象的 `source_` 置为哨兵值如 `"<moved>"`。

</details>

### 练习 4（独立实验：为 `ReportSink` 新增一个只统计总条数的派生端）

在 `value-move.cpp` 的基础上新增派生类 `TotalEntrySink final : public ReportSink`，在 `write(const ScanReport& report)` 中把 `report.size()` 累加到私有成员 `total_entries_`，并在 `~TotalEntrySink()` 打印累计总数。在 `main` 中用 `std::unique_ptr<ReportSink>` 持有它，分别写入 `original` 和 `moved`，核对析构时打印的累计值是否为 `3` 且只析构一次。

<details>
<summary>参考写法</summary>

```cpp
class TotalEntrySink final : public ReportSink {
public:
    ~TotalEntrySink() override {
        std::cout << "TotalEntrySink destroyed (total_entries=" << total_entries_ << ")\n";
    }
    void write(const ScanReport& report) override {
        total_entries_ += report.size();
    }
private:
    std::size_t total_entries_{0};
};

// main 中调用：
{
    std::unique_ptr<ReportSink> sink = std::make_unique<TotalEntrySink>();
    sink->write(original); // +1
    sink->write(moved);    // +2
} // 离开作用域自动打印：TotalEntrySink destroyed (total_entries=3)
```

</details>
