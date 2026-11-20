---
title: "现代 C++ 核心语法深水区：类型转换、借用视图与编译期计算"
description: "系统掌握 C++20 字面量后缀、隐式转换与窄化防护、优先级与逗号陷阱、enum class、结构化绑定、std::array、string_view 与 span 寿命法则、constexpr/consteval/constinit，以及 std::format 与 iomanip。"
order: 6
category: "现代 C++"
tags: ["C++20", "类型转换", "enum class", "string_view", "std::span", "constexpr", "std::format"]
related: ["handbook/cpp-basics", "handbook/cpp-control", "handbook/lifetime", "handbook/cpp20-ranges-ub"]
---

## 本课解决的工程问题（先抓高频，偏门可折叠选读）

> **【工程高频必会 vs 选读扩展】**
> - **工程高频必会（80% 日常编码）**：`enum class` 强类型枚举、`if/switch` 初始化语句与结构化绑定、**`std::string_view`（第 7 节）**、**`std::span`（第 8 节）**、基础 **`constexpr`** 常量，以及 **C++20 `std::format`（第 10 节）**。
> - **低频/底层扩展（已收进折叠框）**：`consteval`、`constinit`、`std::is_constant_evaluated()` 属于标准库或框架底层才用到的特性，初学无需强记。

本篇完整覆盖课程大纲 **`CPP-19` 至 `CPP-28`**，建立严谨的 C++20 核心语法心智模型。

---

## 1. 字面量、数字分隔符与后缀推导（CPP-19）

### 进制前缀与数字分隔符

C++14 起支持二进制字面量 `0b` 和单引号数字分隔符 `'`（编译器忽略 `'`，仅用于提升可读性）：

```cpp
int dec = 1'000'000;          // 十进制：1000000
int hex = 0xFF'EC'00'10;       // 十六进制（常用于掩码/颜色）
int oct = 0755;                // 八进制（前导 0！切勿给十进制数随便加前导 0）
int bin = 0b1010'0110;         // 二进制（C++14）
```

> **经典误区**：`int zip = 012;` 不是十进制 `12`，而是八进制的 `10`；`int bad = 089;` 会直接编译报错（`8` 和 `9` 不是合法八进制数字）。

### 后缀如何决定类型

没有后缀时，整数字面量默认至少是 `int`（放不下才升级为 `long` / `long long`），浮点字面量默认是 **`double`**（不是 `float`）。当使用 `auto` 推导、位运算移位或避免意外溢出时，后缀至关重要：

| 字面量写法 | 推导类型 | 典型用途与坑点 |
| --- | --- | --- |
| `42` | `int` | `1 << 31` 若 `int` 为 32 位则有符号左移溢出（UB） |
| `42u` / `42U` | `unsigned int` | 位掩码基准应写成 `1u << 31` 或 `1ull << 40` |
| `42ll` / `42ull` | `long long` / `unsigned long long` | 明确 64 位宽度（Windows/Linux 均至少 64 位） |
| `3.14f` | `float` | 传给 `float` 图形/DSP 接口，避免 `double` 隐式截断警告 |
| `3.14` / `3.14L` | `double` / `long double` | 默认浮点精度为 `double` |
| `'A'` / `"hi"` | `char` / `const char[3]` | `auto s = "hi";` 推导出 **`const char*`**，不是 `std::string`！ |
| `u8"hi"` | `const char8_t[3]`（C++20） | C++20 新增独立字符类型 `char8_t`，不能直接赋给 `const char*` |
| `R"(C:\a\b)"` | `const char[7]` | 原始字符串字面量，免写 `\\` 转义；正文中含 `)"` 时可自定义界定符 `R"raw(...)raw"` |

### 标准库用户自定义字面量（UDL）

引入对应字面量命名空间后，可以直接写出强类型常量（推荐在函数内部或 `.cpp` 局部 `using namespace`，严禁放进 `.hpp` 顶层）：

```cpp
using namespace std::string_literals;       // 提供 "..."s
using namespace std::string_view_literals;  // 提供 "..."sv
using namespace std::chrono_literals;       // 提供 10ms, 2s

auto name = "logscan"s;    // std::string（包含内嵌 '\0' 也能保留完整长度）
auto tag  = "INFO\0raw"sv; // std::string_view（编译期确定长度 8，零堆分配）
auto wait = 250ms;         // std::chrono::milliseconds
```

---

## 2. 隐式转换、整数提升与 `{}` 窄化防护（CPP-20）

### 整数提升与常规算术转换

在 C++ 中，小于 `int` 宽度的整数类型（`bool`、`char`、`signed/unsigned char`、`short`、`uint8_t`、`uint16_t`）**几乎不直接参与算术运算**——它们会先被**整数提升（Integer Promotion）**为 `int`（若 `int` 装不下再升 `unsigned int`）：

```cpp
std::uint8_t a = 200;
std::uint8_t b = 100;
auto sum = a + b; // sum 的类型是 int，值为 300，而不是 uint8_t 回绕成 44！
```

当两个操作数一个是**有符号**、另一个是**无符号**且宽度不小于 `int` 时，C++ 的**常规算术转换（Usual Arithmetic Conversions）**会把有符号数强行转成无符号数：

```cpp
int x = -1;
unsigned int y = 1;
bool cmp_trap = (x < y); // 竟然是 false！因为 -1 转成了 4294967295u
```

**C++20 安全解法（`<utility>`）**：永远不要手写混合符号比较或靠强转赌范围，使用 `std::cmp_less` 系列与 `std::in_range`：

```cpp
#include <utility>

bool ok   = std::cmp_less(-1, 1u);             // true！按真实数学大小比较
bool fits = std::in_range<std::uint8_t>(300);  // false！运行期安全判定是否越界
```

### `=` 静默截断 vs `{}` 禁用窄化转换

使用 `=` 拷贝初始化时，编译器对丢失精度的**窄化转换（Narrowing Conversion）**往往只给警告甚至保持沉默；而 C++11 起**花括号列表初始化 `{}` 将窄化直接视为编译错误**：

| 写法 | 语义 | 结果 |
| --- | --- | --- |
| `int a = 3.9;` | 浮点向零截断为 `3` | 静默丢小数，可能仅触发警告 |
| `int a{3.9};` | `double` → `int` 属于窄化 | **编译报错**（拦截精度丢失） |
| `std::uint8_t c = 300;` | 模 256 截断为 `44` | 危险的静默溢出 |
| `std::uint8_t c{300};` | 常量值超出 `uint8_t` 范围 | **编译报错** |
| `int n = 42; double d{n};` | 非常量 `int` → `double`（在部分平台 64 位整数转 double 可能丢精度） | `int` → `double` 在 32 位 int 场景部分编译器仍视为可能窄化；应显式 `static_cast<double>(n)` |

---

## 3. 运算符优先级、短路求值与逗号陷阱（CPP-21）

### 必须背熟的四组“反直觉”优先级坑

C++ 运算符优先级有 17 个层级，实际工程 90% 的优先级 Bug 集中在以下 4 组（牢记**拿不准就加括号**）：

| 错误写法 | 编译器实际解析 | 正确写法 |
| --- | --- | --- |
| `if (flags & MASK == 0)` | `flags & (MASK == 0)`（`==` 优先级高于 `&`！） | `if ((flags & MASK) == 0)` |
| `std::cout << a + b;` vs `1 << 2 + 1` | `1 << (2 + 1)` 即 `8`（`+` 高于 `<<`！） | `(1 << 2) + 1` |
| `std::cout << ok ? "Y" : "N";` | `(std::cout << ok) ? "Y" : "N"`（`<<` 高于 `?:`！） | `std::cout << (ok ? "Y" : "N");` |
| `*p++` vs `(*p)++` | `*(p++)`（后缀 `++` 高于前缀 `*`） | 明确写 `*(p++)` 或 `(*p)++` |

### 短路求值与参数求值顺序误区

1. **`&&` 与 `||` 保证短路且从左到右求值**：`ptr != nullptr && ptr->valid()` 是安全的——左侧为 `false` 时右侧绝不求值，且两侧之间有严格的序列点（Sequenced-before）。
2. **函数实参之间依然“无序（Unsequenced / Indeterminately Sequenced）”**：即便在 C++17 规定了 `a.b`、`a[b]`、`a << b` 从左到右求值，**函数调用 `foo(g(), h())` 中 `g()` 和 `h()` 谁先执行仍是未指定的**！永远不要在一个函数调用的多个参数里同时修改同一个变量（如 `f(i++, i)`）。

### 逗号运算符 `,` 的两副面孔

- 在函数参数列表 `f(a, b)` 中，`,` 是**分隔符**；
- 在表达式 `(a, b)` 中，`,` 是**逗号运算符**：先求值 `a`（并丢弃结果），再求值 `b` 并把 `b` 作为整条表达式的值。

典型踩坑场景：在 C++23 引入多维下标 `operator[]` 之前，新手误写 `matrix[i, j]` 不会报错，而是等价于 **`matrix[j]`**（逗号表达式丢弃了 `i`）！GCC/Clang 开启 `-Wcomma-subscript`（包含在 C++20 常见警告中）会直接标红提醒。

---

## 4. `enum` vs 强类型 `enum class`（CPP-22）

传统 C 风格非限定作用域 `enum` 存在两大历史缺陷：
1. **名字泄漏**：枚举成员直接暴露在外层作用域，两个不同枚举不能有同名成员（如 `Color::Red` 与 `Alert::Red` 冲突）。
2. **隐式转整数**：`enum Color { Red }; enum Fruit { Apple };` 中 `Red == Apple` 竟然能编译通过且为 `true`！

**现代 C++ 一律首选 `enum class`（限定作用域枚举）**：

```cpp
#include <cstdint>
#include <type_traits>

enum class LogLevel : std::uint8_t {  // 显式指定底层类型为 1 字节无符号整数
    Info = 1,
    Warn = 2,
    Error = 3,
};

// 需要底层整数值时的标准转换 helper（等价于 C++23 std::to_underlying）
template <typename E>
constexpr auto to_underlying(E e) noexcept {
    return static_cast<std::underlying_type_t<E>>(e);
}
```

C++20 还新增了 **`using enum`**，在局部作用域或 `switch` 内免去重复前缀，同时不污染外部作用域：

```cpp
std::string_view level_name(LogLevel lv) {
    switch (lv) {
        using enum LogLevel; // C++20：仅在本 switch 块内展开枚举名
        case Info:  return "INFO";
        case Warn:  return "WARN";
        case Error: return "ERROR";
    }
    return "UNKNOWN";
}
```

---

## 5. `switch` 贯穿、`if/switch` 初始化与结构化绑定（CPP-23）

### `switch` 隐式贯穿与 `[[fallthrough]]`

C++ 的 `switch` 匹配到一个 `case` 后默认**向下贯穿（Fallthrough）**执行下一个 `case`，忘记写 `break` 是极高发的 Bug。如果业务确实需要合并分支，使用 C++17 属性 **`[[fallthrough]];`** 明确告诉编译器和读代码的人“我是故意的”，避免 `-Wimplicit-fallthrough` 警告：

```cpp
switch (status_code) {
    case 200:
    case 201:
        handle_created();
        [[fallthrough]]; // 显式声明：故意继续向下走 204 的通用收尾逻辑
    case 204:
        finalize_response();
        break;
    default:
        handle_error();
        break;
}
```

> **作用域坑**：在某一个 `case` 分支里定义带初始化的局部变量（如 `case 1: int x = 5; break;`）会报错 `jump bypasses variable initialization`，因为后面的 `case 2:` 处于同一作用域却跳过了 `x` 的初始化。解决办法是给该分支加上大括号 `case 1: { int x = 5; ... break; }`。

### C++17 `if`/`switch` 初始化语句与结构化绑定

把临时变量的作用域严格锁在 `if`/`switch` 语句内，配合 C++17 **结构化绑定（Structured Bindings）**拆解 `std::pair`、`std::tuple`、简单聚合 `struct` 和定长数组：

```cpp
std::map<std::string, int> counts{{"INFO", 12}, {"WARN", 3}};

// 1. if 带初始化语句，缩小迭代器作用域
if (auto [it, inserted] = counts.try_emplace("ERROR", 1); !inserted) {
    it->second += 1;
}

// 2. 范围 for 中用 const auto& 结构化绑定，零拷贝读取键值
for (const auto& [level, count] : counts) {
    // level 绑定到 const std::string&，count 绑定到 const int&
}
```

**寿命注意**：结构化绑定 `auto [a, b] = get_pair();` 会生成一个隐藏的匿名临时对象持有返回值，`a` 和 `b` 只是该匿名对象的成员别名；而 `auto& [a, b] = vec[i];` 则直接引用容器元素——容器扩容后同样会悬空。

---

## 6. 原生多维数组 vs `std::array`（CPP-24）

### C 风格数组的三大痛点

原生数组 `int a[4]` 与多维数组 `int m[2][3]` 在内存中按**行优先（Row-Major）**连续排列，但一旦传进函数就会**退化（Array-to-Pointer Decay）**为首元素指针（`int*` 或 `int (*)[3]`）：
- 丢失长度信息，必须额外传 `size`；
- 不能用 `=` 整体赋值、不能用 `==` 比较内容、不能作为函数按值返回类型。

### 现代定长数组首选：`std::array<T, N>`

`<array>` 提供的 `std::array<T, N>` 是对内置定长数组的**零开销（Zero-Overhead）聚合包装**：内存布局与 `T[N]` 完全一致、分配在栈上（无堆分配），却拥有标准容器完整接口：

| 特性 | 原生数组 `int a[3][4]` | `std::array<std::array<int, 4>, 3>` | 工程平铺 `std::vector<int>` (`rows * cols`) |
| --- | --- | --- | --- |
| 传参是否丢失长度 | 是（退化为指针） | **否**（`N` 是类型一部分） | **否**（携带 `.size()`） |
| 整体复制与 `==` 比较 | 不支持 | **支持**（值语义） | **支持**（值语义） |
| 运行期可变尺寸 | 不支持 | 不支持（`N` 必须编译期常量） | **支持** |
| 内存连续性与缓存 | 完全连续 | 完全连续（栈上，注意勿超几百 KB 防爆栈） | 堆上单一连续块（大矩阵推荐！） |

> **大矩阵工程选型**：若尺寸编译期已知且较小（如 4×4 变换矩阵），用 `std::array<std::array<double, 4>, 4>`；若尺寸运行期决定或体积较大（如 1000×1000 图像），不要用 `std::vector<std::vector<T>>`（每行一次独立堆分配、缓存跳转碎裂），而是用**一维平铺 `std::vector<T>(rows * cols)`** 配合 `at(r, c) -> data[r * cols + c]`！

---

## 7. `std::string_view` 非拥有字符串视图与寿命法则（CPP-25）

### 内部构造与传参优势

`std::string_view`（C++17 `<string_view>`）本质只有两个字段：**`const char* ptr` + `std::size_t len`**（在 64 位系统共 16 字节）。
- 当函数只需要**只读查看**一段文本时，传 `std::string_view` **直接按值传递**（放进两个 CPU 寄存器，比传 `const std::string&` 少一次间接指针解引用），并且对字面量 `"INFO"`、`std::string`、`char[]` 全部**零堆分配、零拷贝**统一兼容！

### 五大致命寿命陷阱（悬空与无 `\0` 边界）

`std::string_view` **不拥有字符内存**，它只是一张“借条”：

```text
危险：临时 string 销毁后，sv 变成悬垂指针！
  std::string_view sv = std::string("log_") + "err";
                        └────────── 临时对象在本行分号处立即析构！ ─────────┘
  std::cout << sv;  // 读已释放内存 -> 未定义行为 (UB)！
```

1. **禁止绑定到临时拼接结果**：`std::string_view sv = s1 + s2;` 分号结束即悬空。
2. **谨慎从函数返回 `string_view`**：除非它指向静态字符串字面量（如 `"INFO"sv`），或是直接切片自按引用/视图传入的参数（即便如此也要警惕调用方传临时 `std::string` 给函数参数再接收返回的切片！）。
3. **宿主 `string` 一旦扩容或修改即失效**：`s.push_back(...)` 触发重新分配后，之前取出的 `string_view` 全部失效。
4. **不能作为类成员变量长期保存**（除非明确宿主生命周期严格长于当前类，否则类成员存字符串一律用拥有型的 `std::string`）。
5. **不保证以 `'\0'` 结尾**！做完 `.substr(0, 4)` 或 `"INFO\0"sv` 后，绝对不能把 `sv.data()` 直接传给期待 C 风格空终止字符串的 `fopen` / `printf("%s")` / `std::atoi`——必须先显式构造 `std::string(sv)`。

---

## 8. `std::span` 非拥有连续切片视图（CPP-26）

如果说 `std::string_view` 是只读字符序列的统一视图，那么 C++20 `<span >` 中的 **`std::span<T>`** 就是**任意连续内存（`std::vector`、`std::array`、C 数组、指针+长度）的统一可读写或只读切片视图**：

```cpp
#include <span>
#include <numeric>

// 只需读取数据时用 std::span<const int>；需要原地修改元素时用 std::span<int>
long long sum_slice(std::span<const int> window) {
    return std::accumulate(window.begin(), window.end(), 0LL);
}

void zero_tail(std::span<int> buf, std::size_t count) {
    for (int& v : buf.last(std::min(count, buf.size()))) {
        v = 0;
    }
}
```

- **动态范围 `std::span<T>`**（默认 `Extent = std::dynamic_extent`）：占用 2 个指针大小（`T* + size_t`），可接纳任何长度的连续容器。
- **静态范围 `std::span<T, 4>`**：长度编译期固定为 4，只占用 **1 个指针**大小（`T*`），传错长度会在编译期被拦下。
- **常用零拷贝切片方法**：`.first(n)`、`.last(n)`、`.subspan(offset, count)`。
- **与 `string_view` 相同的铁律**：`span` 不拥有内存，一旦底层的 `std::vector` 发生扩容或销毁，所有 `span` 立即悬空；且 `span` 仅支持连续内存，不能绑定 `std::list` 或 `std::deque`。

---

## 9. `constexpr` 编译期常量与 `const` 区分（CPP-27）

日常工程里 **99% 的场景只需要用好 `const` 与 `constexpr`**：
- **`const`**：运行期只读契约（运行期算出的值也可放进 `const`，之后不可通过该名字修改）。
- **`constexpr`**：编译期就能确定下来的常量或轻量函数（比老式 `#define` 安全得多，有明确类型和作用域，例如 `constexpr int kMaxRetries = 3;`）。

<details><summary>选读扩展（低频 / 底层库开发）：consteval、constinit 与 is_constant_evaluated</summary>

C++20 还补充了两个主要面向库作者的关键字，常规业务代码极少直接写：

| 关键字 | 核心含义 | 约束与特点 |
| --- | --- | --- |
| `consteval` (C++20) | **立即函数（Immediate Function）** | **强制必须在编译期求值**，传入运行期变量直接编译报错 |
| `constinit` (C++20) | **强制静态变量编译期初始化** | 消除静态初始化顺序灾难（SIOF），初始化完成后**变量仍可读写修改** |

```cpp
constexpr int square(int n) { return n * n; }            // 编译期或运行期皆可
consteval int must_compile_time(int n) { return n * n; } // 仅限编译期
constinit int g_boot_counter = square(4);                // 编译期填进 .data 段，运行期仍可修改
```

> **提示**：C++20 可用 `<type_traits>` 中的 `if (std::is_constant_evaluated())` 区分编译期/运行期路径；切勿写成 `if constexpr (std::is_constant_evaluated())`（否则恒为 `true`）。

</details>

---

## 10. C++20 `std::format` / `<print>` 与 `<iomanip>`（CPP-28）

### `<iomanip>` 的流状态粘滞坑

传统 `<iomanip>`（`std::cout << std::hex << 255`）会**永久修改 `std::cout` 的内部状态标志**：之后打印的每一个整数都会意外变成十六进制！更麻烦的是不同操纵符行为并不一致：
- **粘滞（需手动复位）**：`std::hex` / `std::dec`、`std::setprecision(n)`、`std::fixed`、`std::setfill('0')`、`std::boolalpha`。
- **仅对下一次输出生效**：`std::setw(n)`（每次都要重写！）。

### 现代 C++20 `std::format` 与 C++23 `std::print`

C++20 `<format>` 借鉴 Python 格式串语法，具有**编译期格式串类型检查**、**无流状态污染**与**高性能**三大优势：

```cpp
// 格式语法：{[索引]:[填充对齐][符号][#进制前缀][0][宽度][.精度][类型]}
std::string s1 = std::format("{:>6} | {:#06x} | {:.2f}", "OK", 255, 3.14159);
// 结果："    OK | 0x00ff | 3.14"
```

- **C++23 `<print>` Preview**：C++23 进一步补齐了 `std::print("{}\n", x)` 与 `std::println("{}", x)`，直接向标准输出/文件流格式化打印，无需先构造临时 `std::string`。
- **老编译器兼容写法**：在 Ubuntu 22.04 默认 GCC 11/12 等尚未包含 `<format>` 的环境中，可以用特征宏 `#if defined(__cpp_lib_format)` 做编译期探测（或通过 CMake `FetchContent` 引入 `fmt` 库），回退到 `std::ostringstream`。

---

## 综合可运行 C++20 示例

将下面代码保存为 `cpp_core_deep.cpp`，在终端用 GCC 13+ / Clang 17+ / MSVC 编译运行：

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp_core_deep.cpp -o cpp_core_deep
./cpp_core_deep
```

```cpp
#include <array>
#include <cstdint>
#include <iomanip>
#include <iostream>
#include <map>
#include <numeric>
#include <span>
#include <sstream>
#include <string>
#include <string_view>
#include <type_traits>
#include <utility>

#if defined(__cpp_lib_format) && __cpp_lib_format >= 201907L
#include <format>
#endif

// CPP-22: 强类型枚举 + 显式底层类型
enum class Level : std::uint8_t { Info = 1, Warn = 2, Error = 3 };

constexpr std::string_view to_name(Level lv) noexcept {
    switch (lv) {
        using enum Level; // C++20
        case Info:  return "INFO";
        case Warn:  return "WARN";
        case Error: return "ERROR";
    }
    return "UNKNOWN";
}

// CPP-27: constexpr + consteval + constinit
constexpr int calc_bucket(int x) noexcept {
    if (std::is_constant_evaluated()) {
        return x * 2;
    }
    return x * 2 + 1;
}

consteval int static_table_size(int base) noexcept {
    return base * 4;
}

constinit int g_total_checks = calc_bucket(5); // 编译期初始化为 10，运行期可修改

// CPP-25 / CPP-26: 非拥有视图按值传递
long long sum_window(std::span<const int> nums) noexcept {
    return std::accumulate(nums.begin(), nums.end(), 0LL);
}

void tag_and_print(std::string_view label, Level lv, int value) {
#if defined(__cpp_lib_format) && __cpp_lib_format >= 201907L
    std::cout << std::format("[{:>5}] {:<6} val={:#06x} ({})\n",
                             to_name(lv), label, static_cast<unsigned>(value), value);
#else
    std::ostringstream oss;
    oss << "[" << std::setw(5) << to_name(lv) << "] "
        << std::left << std::setw(6) << label << std::right
        << " val=0x" << std::hex << std::setfill('0') << std::setw(4) << value
        << std::dec << std::setfill(' ') << " (" << value << ")\n";
    std::cout << oss.str();
#endif
}

int main() {
    using namespace std::string_view_literals;

    // CPP-19 & CPP-20: 分隔符、后缀与安全符号比较
    constexpr auto kMask = 0b1010'0110u;
    constexpr int kSigned = -1;
    constexpr unsigned kUnsigned = 1u;
    static_assert(std::cmp_less(kSigned, kUnsigned));
    static_assert(!std::in_range<std::uint8_t>(300));

    // CPP-23: 结构化绑定与 if 初始化
    std::map<std::string, int> counters{{"ok", 10}};
    if (auto [it, ok] = counters.try_emplace("err", 2); ok) {
        g_total_checks += it->second;
    }

    // CPP-24 & CPP-26: std::array 与 std::span 切片
    std::array<int, static_table_size(1)> slots{10, 20, 30, 40};
    auto mid_sum = sum_window(std::span{slots}.subspan(1, 2)); // 20 + 30 = 50

    // CPP-21: 显式括号规避 & 与 == 优先级坑
    bool bit_set = ((kMask & 0x02u) != 0u);

    tag_and_print("slice"sv, Level::Info, static_cast<int>(mid_sum));
    tag_and_print("check"sv, bit_set ? Level::Warn : Level::Error, g_total_checks);
    return 0;
}
```

---

## 常见误区速查表

| 章节 | 1 行反例 | 后果 | 正确做法 |
| --- | --- | --- | --- |
| CPP-19 | `int code = 012;` | 八进制解析为 `10` 而非 `12` | 十进制严禁前导 `0`；二进制用 `0b`，十六进制用 `0x` |
| CPP-20 | `if (-1 < vec.size())` | `-1` 升为无符号极大值，结果恒为 `false` | 用 `std::cmp_less(-1, vec.size())` 或统一有符号类型 |
| CPP-21 | `if (mask & 0x04 == 0)` | 等价 `mask & (0x04 == 0)` 即 `mask & 0` | 始终加括号：`if ((mask & 0x04) == 0)` |
| CPP-22 | `enum A { OK }; enum B { OK };` | 重定义编译失败且会隐式转 `int` | 统一用 `enum class A : uint8_t { OK };` |
| CPP-23 | `case 1: int v = 0; break;` | 后续 `case` 跳过变量初始化报错 | 用 `{ int v = 0; ... }` 包住分支作用域 |
| CPP-25 | `string_view sv = s1 + s2;` | 临时字符串销毁，使用 `sv` 触发 UB | 先存进 `std::string` 拥有者，或直接传给同步函数 |
| CPP-27 | `constinit int x = runtime_fn();` | 非编译期常量初始化直接编译报错 | `constinit` 必须配常量表达式初始化器 |
| CPP-28 | `cout << hex << n;` | 后续所有数字都被粘滞为十六进制 | 用 `std::format` 或局部分离的 `ostringstream` |

---

## 4 个巩固微练习

### 练习 1（符号比较与窄化拦截）

以下两行代码分别有什么问题？如何用 C++20 标准库与初始化语法修复？
```cpp
int idx = -1;
std::vector<int> v{10, 20};
if (idx < v.size()) { /* ... */ }
std::uint8_t byte_val = 256;
```

<details>
<summary>提示与参考答案</summary>

1. `idx < v.size()` 把 `int(-1)` 转为 `size_t` 的最大值，条件为 `false`。应改用 `<utility>` 的 `if (std::cmp_less(idx, v.size()))`。
2. `std::uint8_t byte_val = 256;` 发生静默截断变成 `0`。改用花括号 `std::uint8_t byte_val{256};` 会在编译期直接报错拦截，若数据来自运行期变量则先用 `std::in_range<std::uint8_t>(val)` 校验。

</details>

### 练习 2（识别 `string_view` 悬空点）

下面这个函数返回类型安全吗？为什么？
```cpp
std::string_view make_tag(std::string prefix) {
    return prefix + "_v1";
}
```

<details>
<summary>提示与参考答案</summary>

完全不安全，属于严重的 Use-After-Return 未定义行为。`prefix + "_v1"` 产生一个局部临时 `std::string`，在 `return` 语句结束、函数返回前就会析构，返回的 `std::string_view` 指向已经被释放的栈/堆内存。只要函数需要构造新文本，返回类型必须用拥有型的 `std::string`。

</details>

### 练习 3（`constexpr` / `consteval` / `constinit` 辨析）

如果需要一个“必须在编译期算完哈希表的校验魔数，同时运行期绝不被修改”的函数，应该用 `constexpr` 还是 `consteval`？如果希望一个全局计数器在程序启动前就填好初值 `100` 且运行期还能自增，应该用哪个关键字？

<details>
<summary>提示与参考答案</summary>

1. 要求“必须在编译期算完，传入运行期参数必须报错”时，函数标记为 `consteval`，接收结果的变量标记为 `constexpr`。
2. 全局计数器既要保证静态初始化（零启动竞态）又要运行期可自增，应声明为 `constinit int g_counter = 100;`（注意 `constinit` 不等于 `const`，允许运行期修改）。

</details>

### 练习 4（`std::span` 切片与 `std::format` 组合）

写一个函数 `void dump_hex(std::span<const std::uint8_t> bytes)`，用 `std::format`（或兼容回退）按每字节两位大写十六进制、空格分隔的格式打印前 8 字节（不足 8 字节则全打印）。

<details>
<summary>提示与参考答案</summary>

```cpp
void dump_hex(std::span<const std::uint8_t> bytes) {
    auto head = bytes.first(std::min<std::size_t>(bytes.size(), 8));
    for (std::size_t i = 0; i < head.size(); ++i) {
        if (i > 0) std::cout << ' ';
        std::cout << std::format("{:02X}", head[i]);
    }
    std::cout << '\n';
}
```
用 `bytes.first(...)` 安全取前缀切片，彻底避免手写下标越界。

</details>
