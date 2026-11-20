---
title: "面向对象与多态深解：类不变量、继承切片、虚表与类型转换"
description: "深入拆解类不变量与成员初始化列表、explicit 与三路比较重载、三五零法则与 copy-and-swap、继承切片风险、virtual/override/final 与 vtable 机制、虚析构必要性、纯虚接口与 CRTP 静态多态，以及四大 C++ 强制转换与 RTTI。"
order: 16
category: "现代 C++"
tags: ["C++20", "面向对象", "多态", "虚函数", "vtable", "CRTP", "类型转换"]
related: ["handbook/cpp-struct-file", "handbook/value-move", "handbook/raii", "handbook/pointers-const"]
---

## 本课解决的工程问题（先练熟日常 `class`，再看虚表与选读扩展）

> **【工程高频必会 vs 选读扩展】**
> - **工程高频必会（90% 项目代码）**：`private` 成员变量 + 构造函数初始化列表 + `const` 成员函数 + `Rule of Zero`（尽量用 `std::string`/`vector`/`unique_ptr` 管理资源）+ 多态基类 `virtual ~Base() = default;` 与 `override`。
> - **低频/底层扩展（已收进折叠框）**：CRTP 静态多态属于高性能模板库作者优化技巧，初学只需先掌握虚函数接口。

本篇完整覆盖课程大纲 **`CPP-29` 至 `CPP-37`**，打通封装、资源法则、运行时多态与接口设计契约。

---

## 1. 类不变量、访问控制与构造函数契约（CPP-29）

### `struct` vs `class`：唯一差别与语义分工

在 C++ 语言规则上，`struct` 与 `class` 的**唯一区别仅在默认权限**：
- `struct` 默认成员与继承为 **`public`**（适合纯粹的数据聚合体 POD / 值记录，如 `LogEntry`）。
- `class` 默认成员与继承为 **`private`**（适合需要维护内部状态的封装类型）。

### 什么是类不变量（Class Invariant）？

**类不变量**是指“在任何构造函数成功返回后，以及任何公开成员函数调用前后，对象内部必须始终满足的合法条件”。例如：
- `DateRange` 必须始终满足 `start <= end`；
- `Fraction` 的分母必须始终满足 `denom != 0`；
- `Buffer` 的 `size <= capacity`。

把字段设为 `private`，再由**构造函数在诞生那一刻建立不变量**，并在所有变更方法（Setter / Mutator）入口守住它：一旦参数违反不变量，构造函数应**直接抛出异常**（如 `std::invalid_argument`），绝不构造出一个“半合法的僵尸对象”再靠外部记着调用 `is_valid()`！

- **`= default`**：当定义了带参构造函数导致编译器不再自动生成默认构造函数时，显式写 `Foo() = default;` 恢复零开销的默认生成行为。
- **`= delete`**：显式禁止某种构造或拷贝（例如禁用 `double` 隐式转入或禁止拷贝独占句柄），错误会在调用点直接给出清晰诊断。

---

## 2. 成员初始化列表与委托构造函数（CPP-30）

### 为什么优先用成员初始化列表，而不是在 `{}` 函数体里赋值？

```cpp
class Config {
    const int port_;
    std::string host_;
public:
    // 正确：直接一步原地构造 port_ 与 host_
    Config(int port, std::string host)
        : port_{port}, host_{std::move(host)} {}
};
```

如果不写初始化列表而在构造函数体 `{ host_ = ...; }` 内赋值，成员会先被**默认构造**一次，然后再执行一次**拷贝/移动赋值**——白白多做一次无用功。更关键的是，以下三类成员**必须**放在初始化列表中（无法在函数体内赋值）：
1. `const` 成员变量；
2. 引用成员变量 `T&`；
3. 没有默认构造函数的成员类类型或基类子对象。

### 致命陷阱：初始化顺序只由“类内声明顺序”决定！

> **铁律**：成员的初始化顺序**永远严格等于它们在 `class` 体内的声明顺序**，与你在构造函数冒号后面写的排列顺序无关！

```cpp
class BadOrder {
    int cap_;
    std::vector<int> buf_; // 如果 buf_ 声明在 cap_ 前面，下面就会读到未初始化的 cap_！
public:
    // 若类内声明顺序是 buf_ 在前、cap_ 在后，这里先写 cap_(n) 依然会先初始化 buf_(cap_) -> UB！
    BadOrder(int n) : cap_(n), buf_(cap_) {}
};
```
开启 `-Wall`（GCC/Clang 的 `-Wreorder`）会在你写反初始化列表顺序时立刻告警。

### 类内默认初始化（NSDMI）与委托构造

- **类内默认成员初始化器（NSDMI）**：直接在字段声明处写 `int retries_ = 3;`。若某构造函数初始化列表未显式覆盖它，编译器会自动采用该默认值。
- **委托构造函数（C++11）**：一个构造函数把初始化工作委托给同一个类的另一个“主构造函数”，消除多重载间的重复校验逻辑：

```cpp
class PortRange {
    int lo_, hi_;
public:
    PortRange(int lo, int hi) : lo_{lo}, hi_{hi} {
        if (lo_ > hi_) throw std::invalid_argument("invalid range");
    }
    explicit PortRange(int single) : PortRange(single, single) {} // 委托主构造并复用校验！
};
```
注意：委托构造的初始化列表里**不能**再同时初始化其他成员，且**禁止**两个构造函数互相委托形成死循环。

---

## 3. `explicit` 关键字与运算符重载设计（CPP-31）

### 用 `explicit` 拦截意外隐式转换

任何**可用单个实参调用**的构造函数（含多参数但其余参数有默认值），都会被编译器当作**隐式转换通道**：

```cpp
class Buffer {
public:
    explicit Buffer(std::size_t bytes); // 不加 explicit，fn(1024) 就会悄悄临时造出一个 Buffer！
};
```
**经验法则**：除了极少数明确设计为“值等价隐式包装”的类型（如 `std::string_view` 接收 `const char*`），**几乎所有单参构造函数都应该加上 `explicit`**！C++11 起 `explicit` 同样拦截 `Buffer b = 1024;` 和花括号隐式传参 `fn({1024})`；C++20 更支持条件显式 `explicit(condition)`。

### 运算符重载黄金准则与 C++20 三路比较 `<=>`

- **保持自然语义**：不要用 `+` 做减法或日志拼接以外的诡异操作；若不需要特殊语义，用普通命名函数比重载晦涩符号更清晰。
- **成员 vs 非成员（友元）**：
  - 改变左操作数自身状态（`+=`、`[]`、`()`、`=`）设为**成员函数**；
  - 对称二元运算符（`+`、`==`、`<`）与左操作数不是当前类的流输出 `operator<<` 设为**非成员（或类内 `friend`）**，这样 `10 + obj` 才能与 `obj + 10` 一样享受左侧隐式转换。
- **C++20 三路比较运算符（Spaceship `<=>`）**：只需写两行，编译器自动合成 `==`、`!=`、`<`、`<=`、`>`、`>=` 全部六个运算符！

```cpp
#include <compare>

struct Version {
    int major, minor, patch;
    // 默认逐成员按字典序比较，并自动生成 ==, !=, <, <=, >, >=
    auto operator<=>(const Version&) const = default;
};
```

---

## 4. 三/五/零法则与 Copy-and-Swap 惯用法（CPP-32）

### 编译器特殊成员函数生成表

当你的类没有手动管理裸指针或 C 句柄时，直接组合 `std::string`、`std::vector`、`std::unique_ptr`——这就是**零法则（Rule of Zero）**，五个特殊成员函数全交给编译器自动生成最安全。

一旦你的类**亲自管理资源**（例如直接持有裸指针 `T*` 或 `FILE*`），就必须遵守**三/五法则**：自定义了析构函数、拷贝构造、拷贝赋值中的任意一个，通常三者都要一起管；若希望支持高效移动，则五个一起显式定义（且移动构造与移动赋值务必标记 **`noexcept`**，否则 `std::vector` 扩容时为保证强异常安全会退回慢速拷贝！）：

| 你显式声明了什么 | 析构 | 拷贝构造 | 拷贝赋值 | 移动构造 | 移动赋值 |
| --- | --- | --- | --- | --- | --- |
| 什么都没写（零法则） | 自动生成 | 自动生成 | 自动生成 | 自动生成 | 自动生成 |
| 自定义了析构 / 拷贝构造 / 拷贝赋值 | 按你的 / 自动 | **已弃用兼容生成** | **已弃用兼容生成** | **不生成（抑制）** | **不生成（抑制）** |
| 自定义了移动构造或移动赋值 | 自动生成 | **`= delete`** | **`= delete`** | 按你的 / 不生成 | 按你的 / 不生成 |

### Copy-and-Swap 惯用法：一行代码兼顾自赋值与强异常安全

手写拷贝赋值 `operator=` 最容易犯两个错：忘记 `if (this == &other)` 自赋值检查导致先把自身内存 `delete` 掉，或者 `new` 抛异常时把对象留在半销毁状态。**Copy-and-Swap** 彻底根治这两个问题：

```cpp
class DynamicArray {
    std::size_t size_{0};
    int* data_{nullptr};
public:
    explicit DynamicArray(std::size_t n) : size_{n}, data_{n ? new int[n]{} : nullptr} {}
    ~DynamicArray() { delete[] data_; }

    DynamicArray(const DynamicArray& other)
        : size_{other.size_}, data_{other.size_ ? new int[other.size_] : nullptr} {
        std::copy(other.data_, other.data_ + size_, data_);
    }

    DynamicArray(DynamicArray&& other) noexcept
        : size_{std::exchange(other.size_, 0)}, data_{std::exchange(other.data_, nullptr)} {}

    friend void swap(DynamicArray& a, DynamicArray& b) noexcept {
        using std::swap;
        swap(a.size_, b.size_);
        swap(a.data_, b.data_);
    }

    // 关键：参数按值接收 rhs（自动调用拷贝或移动构造），函数体内仅做 noexcept 交换！
    DynamicArray& operator=(DynamicArray rhs) noexcept {
        swap(*this, rhs);
        return *this;
    } // 离开作用域时，旧资源随 rhs 自动析构释放！
};
```
即使 `new` 在构造参数 `rhs` 时抛出 `std::bad_alloc`，`*this` 毫发无伤（强异常保证）；即使写 `a = a;`，也是先拷贝一份再交换，完全安全。

---

## 5. 继承、里氏替换与对象切片风险（CPP-33）

### `public` 继承表达的是 `is-a` 行为契约

- `public` 继承：派生类是一个（`is-a`）基类，任何期望基类引用/指针的地方都可以安全传入派生类对象（里氏替换原则 LSP）。
- `private` / `protected` 继承：表达“根据基类实现（implemented-in-terms-of）”，外部看不到继承关系，现代工程绝大多数情况**优先用组合（把成员放进类里）替代私有继承**。

### 对象切片（Object Slicing）：静默裁掉派生类灵魂

```text
Derived d 对象内存:  [ vptr (Derived) | Base 字段 | Derived 新增字段 ]
                                  │
       按值传递 void log(Base b)   │  只拷贝 Base 大小的部分！
                                  ▼
局部 Base b 对象内存: [ vptr (Base)    | Base 字段 ]   ← Derived 新增字段和派生虚表全丢了！
```

当把派生类对象**按值**赋给基类变量、传给按值接收基类的函数 `void f(Base b)`、或塞进 `std::vector<Base>` 时，就会发生**对象切片**：只复制基类子对象，派生类独有成员被切掉，连虚表指针 `vptr` 都会被重置成 `Base` 的虚表！

**解法**：多态基类按**引用 `const Base&` / 指针 `Base*` / 智能指针 `std::unique_ptr<Base>`** 传递和存储，并建议将多态基类的拷贝操作设为 `protected` 或 `= delete` 以从源头禁止意外切片。

> **构造/析构期间的虚函数 traps**：在基类构造函数（或析构函数）内部调用虚函数时，**不会**动态分发到派生类重写版本！因为基类构造时派生类成员尚未初始化（析构时已销毁），C++ 规定此时对象的动态类型就是当前正在构造/析构的基类自身。

---

## 6. `virtual`、`override`、`final` 与虚表分发机制（CPP-34）

### `vptr` 与 `vtable` 底层布局

一旦一个类拥有至少一个 `virtual` 函数，编译器就会在后台做两件事：
1. 为该**类**生成一张静态只读函数指针表——**虚函数表（`vtable`）**，存放各虚函数在本类中的实际入口地址；
2. 在该类的**每个对象实例**内存头部（典型 ABI）悄悄插入一个隐藏指针——**虚表指针（`vptr`）**，在构造函数里将 `vptr` 指向本类的 `vtable`。

```text
Base* p = &derived_obj;
p->speak();

derived_obj 内存:                Derived 的 vtable (静态只读区):
┌──────────────────────┐        ┌───────────────────────────────┐
│ vptr ────────────────┼───────►│ [0] &Derived::speak()         │
├──────────────────────┤        │ [1] &Derived::~Derived()      │
│ Base 成员            │        └───────────────────────────────┘
├──────────────────────┤
│ Derived 成员         │        执行路径：读 p->vptr → 查表索引 [0] → 间接调用！
└──────────────────────┘
```

代价很清晰：每个对象多 1 个指针（8 字节）、每次多态调用多 1 次内存查表 + 间接跳转（且可能阻断编译器内联）。因此，**不要把非多态的值类型随手加上 `virtual`**；需要多态时它的开销又完全可接受（几纳秒级）。

### 永远用 `override` 与合理使用 `final`

- **`override`（C++11）**：贴在派生类重写函数末尾。如果你手滑写错了参数类型（`int` 写成 `long`）、漏写了尾部的 `const` 或函数名拼错，编译器会**直接报错拒绝**，绝不会悄悄变成一个无关的新函数！
- **`final`（C++11）**：加在虚函数上禁止孙子类继续重写；加在类上（`class FastSink final : public Sink`）禁止任何类再继承它。好处不仅是设计约束，更能帮助编译器在通过已知 `final` 类型指针调用时执行**去虚化（Devirtualization）**并直接内联！

---

## 7. 为什么多态基类必须有虚析构函数？（CPP-35）

设想下面这行看似极其普通的代码：

```cpp
std::unique_ptr<Base> p = std::make_unique<Derived>();
// 离开作用域时，unique_ptr<Base> 内部执行 delete raw_base_ptr;
```

- 如果 `~Base()` **不是 `virtual`**：`delete p` 时编译器只能静态看到指针类型是 `Base*`，于是**只调用 `~Base()`**，根本不调用 `~Derived()`！在 C++ 标准中，通过基类指针删除没有虚析构函数的派生类对象直接构成**未定义行为（UB）**——轻则派生类里的 `std::string`/`std::vector` 内存泄漏，重则堆损坏崩溃！
- 如果 `~Base()` **是 `virtual`**：`delete` 会先走 `vptr` 查虚表找到 `~Derived()` 执行派生类清理，然后再自动逐层调用 `~Base()` 清理基类。

**基类析构黄金二选一准则**（C++ Core Guidelines C.35）：
1. **允许通过基类指针多态销毁**：声明 `public: virtual ~Base() = default;`（注意：一旦显式声明了析构函数，编译器会抑制默认移动操作；若需要移动，需按需处理，多态基类通常禁用拷贝/移动以防切片）。
2. **绝不通过基类指针销毁**（如某些接口混入 Mixin / CRTP 基类）：将析构函数设为 **`protected: ~Base() = default;`**，这样外部连 `delete base_ptr;` 都无法通过编译，省去虚表开销。

---

## 8. 纯虚接口与 CRTP 静态多态（CPP-36）

### 抽象接口类（Abstract Interface）

当基类无法给出合理默认实现时，用 `= 0` 声明**纯虚函数**：

```cpp
class ILogSink {
public:
    virtual ~ILogSink() = default;
    virtual void write(std::string_view line) = 0; // 纯虚函数，强制派生类必须实现

    ILogSink(const ILogSink&) = delete;            // 禁用基类拷贝，彻底封堵对象切片
    ILogSink& operator=(const ILogSink&) = delete;
protected:
    ILogSink() = default;
};
```
包含至少一个纯虚函数的类叫**抽象类**，不能直接实例化，只能作为指针/引用的接口契约。

### 选读扩展：CRTP 静态多态

<details><summary>选读扩展（低频 / 底层库开发）：CRTP 奇异递归模板模式（零虚表开销静态多态）</summary>

在极少数超高频热路径（如每秒调用千万次的矩阵库或网络包解析器）里，虚函数间接调用无法内联时，底层库作者会使用 **CRTP（Curiously Recurring Template Pattern）**：

```cpp
template <typename Derived>
class FormatterBase {
public:
    std::string format_line(std::string_view msg) const {
        // 编译期直接静态绑定到 Derived::prefix()，可被完全内联！
        return std::string(static_cast<const Derived*>(this)->prefix()) + ": " + std::string(msg);
    }
};

class JsonFormatter final : public FormatterBase<JsonFormatter> {
public:
    std::string_view prefix() const noexcept { return "JSON"; }
};
```

| 维度 | 动态多态（`virtual` 虚表） | 静态多态（CRTP / `std::variant`） |
| --- | --- | --- |
| 分发时机 | 运行期（查 `vptr` / `vtable`） | 编译期（模板直接实例化内联） |
| 异构容器存储 | **支持**（`std::vector<std::unique_ptr<Base>>`） | 不同派生类属于不同基类模板实例，需借助 `std::variant` |
| 对象体积与内联 | 多 8 字节 `vptr`，较难内联 | **零额外字节**，编译器可彻底内联优化 |

</details>

---

## 9. 四大 C++ 强制类型转换与 RTTI（CPP-37）

C 风格强转 `(Target)expr` 之所以危险，是因为它把“丢弃 `const`”、“无关指针硬转”和“数值截断”全混成同一个语法，代码审查时连搜索都搜不出来。现代 C++ 必须按职责拆成**四大具名转换**：

| 转换操作符 | 唯一合法职责 | 运行期开销 | 典型安全用法与禁区 |
| --- | --- | --- | --- |
| `static_cast<T>(x)` | 良构的相关类型转换（如 `int`→`double`、派生→基类、`void*` 还原、**确定类型前提下**的基类→派生） | 零 | 基类→派生**不做运行期类型检查**，转错类型就是 UB |
| `const_cast<T>(x)` | 仅用于增删 `const`/`volatile` 修饰符（多用于对接老旧非 `const` C API） | 零 | **通过 `const_cast` 修改本来就是 `const` 定义的对象，属于 UB！** |
| `reinterpret_cast<T>(x)` | 底层无关联指针或整数与指针之间的位模式重解释（如 `uintptr_t` ↔ 指针） | 零 | 严禁用它把 `char*` 缓冲直接转成 `Header*` 读写（违反 Strict Aliasing + 对齐 UB，应用 `std::memcpy` / C++20 `std::bit_cast`） |
| `dynamic_cast<T>(x)` | 依赖 **RTTI**（运行期类型信息）的安全多态向下转型或交叉转型 | 有（查虚表 RTTI 树） | 要求源类型至少有一个虚函数；`dynamic_cast<Derived*>(p)` 失败返回 **`nullptr`**；`dynamic_cast<Derived&>(r)` 失败抛出 **`std::bad_cast`** |

> **工程准则**：需要频繁用 `dynamic_cast` 或 `typeid(*p)` 判断真实派生类型时，往往是面向对象设计出现“坏味道”的信号——优先考虑把行为抽象成虚函数或使用 `std::variant` + `std::visit`。另外，嵌入式/游戏引擎若编译开启 `-fno-rtti`，`dynamic_cast` 与 `typeid` 将不可用。

---

## 综合可运行 C++20 示例

```cpp
#include <compare>
#include <iostream>
#include <memory>
#include <stdexcept>
#include <string>
#include <string_view>
#include <utility>
#include <vector>

// CPP-29, CPP-30, CPP-31: 不变量、初始化列表、委托构造、explicit 与 <=>
class PortRange {
    int lo_;
    int hi_;
public:
    PortRange(int lo, int hi) : lo_{lo}, hi_{hi} {
        if (lo_ < 1 || hi_ > 65535 || lo_ > hi_) {
            throw std::invalid_argument("PortRange invariant violated");
        }
    }
    explicit PortRange(int single) : PortRange(single, single) {}
    auto operator<=>(const PortRange&) const = default;
    int low() const noexcept { return lo_; }
    int high() const noexcept { return hi_; }
};

// CPP-32: 演示五法则 + Copy-and-Swap
class OwnedBuffer {
    std::size_t len_{0};
    char* data_{nullptr};
public:
    explicit OwnedBuffer(std::size_t n) : len_{n}, data_{n ? new char[n]{} : nullptr} {}
    ~OwnedBuffer() { delete[] data_; }
    OwnedBuffer(const OwnedBuffer& rhs)
        : len_{rhs.len_}, data_{rhs.len_ ? new char[rhs.len_] : nullptr} {
        std::copy(rhs.data_, rhs.data_ + len_, data_);
    }
    OwnedBuffer(OwnedBuffer&& rhs) noexcept
        : len_{std::exchange(rhs.len_, 0)}, data_{std::exchange(rhs.data_, nullptr)} {}
    friend void swap(OwnedBuffer& a, OwnedBuffer& b) noexcept {
        using std::swap;
        swap(a.len_, b.len_);
        swap(a.data_, b.data_);
    }
    OwnedBuffer& operator=(OwnedBuffer rhs) noexcept {
        swap(*this, rhs);
        return *this;
    }
    std::size_t size() const noexcept { return len_; }
};

// CPP-33, CPP-34, CPP-35, CPP-36, CPP-37: 纯虚接口、override/final、虚析构、dynamic_cast
class ISink {
public:
    virtual ~ISink() = default; // 虚析构保证通过基类指针安全销毁
    virtual void emit(std::string_view msg) = 0;
    ISink(const ISink&) = delete;
    ISink& operator=(const ISink&) = delete;
protected:
    ISink() = default;
};

class ConsoleSink final : public ISink {
    int count_{0};
public:
    void emit(std::string_view msg) override {
        ++count_;
        std::cout << "[Console #" << count_ << "] " << msg << '\n';
    }
    int emitted() const noexcept { return count_; }
};

// CPP-36: CRTP 静态多态（零虚表开销）
template <typename Derived>
class MetricBase {
public:
    std::string report() const {
        return std::string(static_cast<const Derived*>(this)->metric_name()) + "=ok";
    }
};

class CpuMetric final : public MetricBase<CpuMetric> {
public:
    std::string_view metric_name() const noexcept { return "cpu"; }
};

int main() {
    PortRange p1{8080};
    PortRange p2{8000, 9000};
    std::cout << "p1 < p2: " << std::boolalpha << (p1 < p2) << '\n';

    OwnedBuffer b1{16};
    OwnedBuffer b2{4};
    b2 = b1; // Copy-and-Swap
    std::cout << "b2 size=" << b2.size() << '\n';

    std::vector<std::unique_ptr<ISink>> sinks;
    sinks.push_back(std::make_unique<ConsoleSink>());
    sinks[0]->emit("service started");

    if (auto* cs = dynamic_cast<ConsoleSink*>(sinks[0].get())) {
        std::cout << "RTTI emitted=" << cs->emitted() << '\n';
    }

    CpuMetric cpu;
    std::cout << "CRTP: " << cpu.report() << '\n';
    return 0;
}
```

---

## 4 个巩固微练习

### 练习 1（初始化顺序陷阱排查）

下面类构造 `Table tbl(10);` 时为什么会发生未定义行为？该如何修复？
```cpp
class Table {
    std::vector<int> rows_;
    std::size_t width_;
public:
    Table(std::size_t w) : width_{w}, rows_(width_, 0) {}
};
```

<details>
<summary>提示与参考答案</summary>

`rows_` 在类内声明于 `width_` 之前，因此会**先**初始化 `rows_(width_, 0)`，此时 `width_` 还是未初始化的垃圾值！修复方式：把 `std::size_t width_;` 声明移到 `rows_` 之前，或者直接用形参 `rows_(w, 0)`。

</details>

### 练习 2（为什么禁用拷贝可以防对象切片）

给多态基类 `ISink` 加上 `ISink(const ISink&) = delete;` 后，下面哪种写法会在编译期被直接拦截？
A. `void f(const ISink& s);`
B. `void f(ISink s);`
C. `std::vector<std::unique_ptr<ISink>> v;`

<details>
<summary>提示与参考答案</summary>

选项 **B** 会直接编译报错拦截（按值传递 `ISink` 需要拷贝构造，且抽象基类也无法实例化），从而彻底防止调用方不小心把 `Derived` 按值传进导致对象切片；A（常引用）与 C（智能指针）均可正常通过多态调用。

</details>

### 练习 3（虚析构与移动生成交互）

如果基类 `Shape` 显式写了 `virtual ~Shape() = default;`，编译器还会为 `Shape` 自动生成默认移动构造函数吗？这会给普通派生类带来什么影响？

<details>
<summary>提示与参考答案</summary>

不会。只要用户显式声明了析构函数（即便是 `= default`），编译器就会抑制默认移动构造和移动赋值的生成，拷贝操作也会被标记为弃用兼容生成。对多态基类而言这反而是好事（防止按值移动/拷贝切片）；若某个带资源句柄的非多态类需要移动语义，需显式写齐五法则或遵循零法则。

</details>

### 练习 4（四大类型转换选型）

为以下 3 个需求选出最恰当的 C++ 转换运算符：
1. 把 `int count` 转为 `double` 计算平均值；
2. 已知 `Base* p` 可能指向 `DerivedA` 或 `DerivedB`，安全检测它是不是 `DerivedB`；
3. 把 `std::uint32_t` 的 4 字节位模式原样解释成一个 `float`（不用 `reinterpret_cast`）。

<details>
<summary>提示与参考答案</summary>

1. `static_cast<double>(count)`；
2. `dynamic_cast<DerivedB*>(p)`（判空 `nullptr`）；
3. 使用 C++20 `<bit>` 提供的 **`std::bit_cast<float>(u32_val)`**（编译期/零开销位拷贝，完全规避 `reinterpret_cast` 的 Strict Aliasing 未定义行为）。

</details>
