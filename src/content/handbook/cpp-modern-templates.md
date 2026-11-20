---
title: "现代模板、代数类型与 C++20 工程设施"
description: "掌握可变参数模板与折叠表达式、SFINAE/if constexpr/requires 演进、类型萃取与 decltype(auto)、optional/variant/visit/any/expected 错误建模，以及 filesystem 跨平台路径、random 随机数架构与 C++20 Modules/source_location。"
order: 33
category: "现代 C++"
tags: ["C++20", "模板", "折叠表达式", "variant", "expected", "filesystem", "random", "Modules"]
related: ["handbook/stl-generics", "handbook/error-handling", "handbook/cpp-headers-modules", "handbook/cpp-lambda-chrono"]
---

## 本课解决的工程问题（先抓 `optional`/`variant`/`filesystem`，元编程与 Modules 收为选读）

> **【工程高频必会 vs 选读扩展】**
> - **工程高频必会（日常项目天天用）**：**`std::optional`** 表达“可能查不到”、**`std::variant` + `std::visit`** 安全状态机、**`<filesystem>` 目录扫描与自动建目录**、`<random>` 随机数与 `std::source_location`。
> - **低频/底层扩展（已收进折叠框）**：SFINAE（`std::enable_if_t`）、`<type_traits>` 模板元编程、`decltype((var))`、`std::any` 与 C++20 Modules 目前在 95% 的日常 CMake 工程里并不直接手写，初学可先折叠跳过。

本篇完整覆盖课程大纲 **`CPP-45` 至 `CPP-52`**。

---

## 1. 可变参数模板与 C++17 折叠表达式（CPP-45）

### 参数包（Parameter Pack）与展开位置

在 C++11 中，接受任意个数、任意类型实参的函数依赖**模板参数包 `typename... Args`** 与**函数形参包 `Args... args`**：
- `sizeof...(Args)` 在编译期直接返回参数个数（不求值任何表达式）。
- 要把实参原封不动往下传（保持左值/右值属性），用万能引用 `Args&&... args` 配合完美转发 `std::forward<Args>(args)...`——注意省略号 `...` 放在**整个模式的外侧**，表示对该模式逐项展开。

### 折叠表达式（Fold Expressions）：告别递归模板终止函数

C++11 写求和或打印必须写一个“空参数终止重载 + 递归拆包重载”，代码啰嗦且生成大量中间实例化。C++17 **折叠表达式**只需一行：

```cpp
// 1. 一元右折 / 左折：(pack op ...) 或 (... op pack)
template <typename... Ts>
constexpr auto sum_all(Ts... args) {
    return (args + ... + 0); // 二元右折：空包时优雅返回 0，不会编译报错！
}

// 2. 逗号折叠：按参数顺序依次执行副作用（如打印任意个参数）
template <typename... Ts>
void log_line(const Ts&... args) {
    ((std::cout << args << ' '), ...); // 展开为 ((cout << a0 << ' '), (cout << a1 << ' '), ...)
    std::cout << '\n';
}
```

| 折叠形式 | 展开等价形式（以 `+` 为例） | 空参数包行为 |
| --- | --- | --- |
| `(args + ...)`（一元右折） | `a1 + (a2 + a3)` | 仅 `&&`/`||`/`,` 有默认空值，其余**报错** |
| `(... + args)`（一元左折） | `(a1 + a2) + a3` | 同上 |
| `(args + ... + init)`（二元右折） | `a1 + (a2 + (a3 + init))` | 安全返回 `init` |
| `(init + ... + args)`（二元左折） | `((init + a1) + a2) + a3` | 安全返回 `init`（流输出 `(std::cout << ... << args)` 必备！） |

---

## 2. 编译期分支：`if constexpr` 与 `requires`（CPP-46）

日常写泛型函数只需要优先掌握 **`if constexpr`**（C++17）和 **`requires`**（C++20）：

```cpp
template <typename T>
std::string describe_value(const T& v) {
    if constexpr (std::is_arithmetic_v<T>) {
        return std::to_string(v);          // 当 T 是 std::string 时，这行被整段丢弃，绝不报错！
    } else {
        return std::string(v);             // 当 T 是 int 时，这行被整段丢弃！
    }
}
```

```cpp
template <typename T>
requires std::integral<T>
void dispatch(T x) { /* 整数专用路径 */ }

template <typename T>
requires std::floating_point<T>
void dispatch(T x) { /* 浮点专用路径 */ }
```

## 3. 类型推导与萃取 `<type_traits>`（CPP-47）

日常编码只需记住 **`auto` 会丢引用/顶层 `const`**（需要引用时写 `const auto&` 或 `auto&`）。至于旧式 SFINAE、`_v`/`_t` 萃取、以及 `decltype((var))` 双括号等底层库编写技巧，收在下方按需查阅：

<details><summary>选读扩展（低频 / 底层库开发）：SFINAE（enable_if_t）、&lt;type_traits&gt; 与 decltype((var))</summary>

1. **第一代（C++11/14）SFINAE + `std::enable_if_t`**：利用“替换失败并非错误”踢出不匹配重载；现代 C++20 工程中已被 `if constexpr` 与 `requires` 彻底取代。
2. **`<type_traits>` 常用后缀**：查布尔属性用 **`_v`**（如 `std::is_same_v<A, B>`）；做类型变换用 **`_t`**（如 `std::decay_t<T>`、`std::remove_cvref_t<T>`、`std::underlying_type_t<E>`）。
3. **`decltype(expr)` 与 `decltype((var))`**：`decltype(var)` 返回声明类型，但多加一对括号 **`decltype((var))`** 因 `(var)` 是左值表达式会变成 **`T&` 引用**；透传包装函数返回值可用 `decltype(auto)`。

```cpp
template <typename Fn, typename... Args>
decltype(auto) trace_call(Fn&& fn, Args&&... args) {
    return std::forward<Fn>(fn)(std::forward<Args>(args)...);
}
```

</details>

---

## 4. 代数和类型：`optional`、`variant` 与 `std::visit`（CPP-48）

传统 C 代码习惯用 `-1`/`nullptr` 当缺值哨兵，用裸 `union` + 手动 `enum tag` 表达多种状态（极易读错活跃字段引发 UB）。现代 C++ 用标准库**类型安全代数类型**：

- **`std::optional<T>`（0 或 1 个 `T`）**：用 `std::nullopt` 表达“无值”，用 `.has_value()` / `if (opt)` 判空，`.value_or(default_val)` 安全取默认值。**注意**：C++20 标准不支持 `std::optional<T&>` 引用特化（需用指针 `T*` 或 `std::optional<std::reference_wrapper<T>>`）。
- **`std::variant<Ts...>`（类型安全的互斥联合体）**：同一时刻恰好保存 `Ts...` 中的某一个类型。
  - 若第一个备选类型没有默认构造函数，可以在首位放 **`std::monostate`** 让 `variant` 支持空默认构造。
  - 安全检查与读取：`std::holds_alternative<T>(v)`、`std::get_if<T>(&v)`（返回指针，不匹配时为 `nullptr`，比 `std::get<T>` 抛 `bad_variant_access` 更轻量）。
- **`std::visit` + `overloaded` 模式匹配**：编译器强制检查你**是否处理了 `variant` 中的每一种类型**，日后新增一种状态而漏写分支时会直接编译报错！

```cpp
template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>; // C++17 类模板推导指引（GCC 13+ 甚至可省略）

using Packet = std::variant<std::monostate, int, std::string>;
void handle(const Packet& pkt) {
    std::visit(overloaded{
        [](std::monostate) { std::cout << "empty\n"; },
        [](int code)       { std::cout << "code=" << code << '\n'; },
        [](const std::string& s) { std::cout << "text=" << s << '\n'; }
    }, pkt);
}
```

---

## 5. `expected` 风格错误处理与日常排错三板斧（CPP-49）

日常 C++ 项目里，处理错误最实用的三板斧是：
1. **`assert()`**：开发测试阶段抓“绝对不该发生的内部逻辑错误”（如空指针、下标契约违背）。
2. **`std::optional<T>` / `Result<T, E>`（`expected` 风格）**：高频可预期解析失败（如坏日志行、配置项缺失）。
3. **`try / catch (const std::exception& e)`**：兜底外围系统 I/O 或 `std::stoi` 等抛出的异常，避免整进程直接 crash。

> **为什么选 `std::variant` 而不是 `std::any`？** `std::variant` 栈上分配、零堆开销且编译期强制覆盖全部分支，覆盖 95% 需求；开放类型擦除 `std::any`（`<any>`）仅极少数插件字典场景会用到，初学可忽略。

<details><summary>选读扩展（低频）：std::any 与 expected&lt;T, E&gt; 设计对照</summary>

- **`std::any`（C++17 `<any>`）**：可装入任意可拷贝类型（通过 `std::any_cast<T>(&a)` 安全取指针），但存入大对象会堆分配且失去编译期穷举检查。
- **何时选异常 vs `Result/expected`**：构造函数失败或跨多层调用兜底用异常；高频解析失败或 `-fno-exceptions` 场景用 `Result<T, E>`。

</details>

---

## 6. `<filesystem>` 跨平台路径、创建目录与日志扫描实战（CPP-50）

手写字符串拼接 `"dir/" + name` 在 Windows `\` 与 Linux `/` 之间极易拼出路径错误。C++17 **`<filesystem>`**（习惯简写 `namespace fs = std::filesystem;`）彻底统一了跨平台目录与文件操作：

- **路径拼接用 `operator/`**：`fs::path p = base / "logs" / "app.log";`
- **路径拆解零手写切片**：`.parent_path()`、`.filename()`、`.stem()`、`.extension()`。
- **自动建多级目录**：`fs::create_directories("out/2026/logs", ec);`（等价 `mkdir -p`）。
- **遍历文件夹筛选 `.log`**：`fs::directory_iterator` 配合 `entry.path().extension() == ".log"`。

```cpp
#include <filesystem>
#include <iostream>
namespace fs = std::filesystem;

void scan_log_dir(const fs::path& dir) {
    std::error_code ec;
    fs::create_directories(dir, ec); // 不存在则自动创建多级目录
    if (!fs::exists(dir, ec) || !fs::is_directory(dir, ec)) return;

    for (const auto& entry : fs::directory_iterator(dir, ec)) {
        if (entry.is_regular_file(ec) && entry.path().extension() == ".log") {
            std::cout << entry.path().filename().string()
                      << " (" << entry.file_size(ec) << " bytes)\n";
        }
    }
}
```
> **工程小技巧**：写关键配置文件时，先写入同目录临时文件 `config.tmp`，刷新落盘后再调用 `fs::rename(tmp, target, ec)` 原子替换，防止写到一半断电把原配置写坏！

---

## 7. `<random>` 随机数架构：引擎与分布分离（CPP-51）

### 为什么现代 C++ 严禁 `std::rand() % N`？

1. **取模偏差（Modulo Bias）**：若 `RAND_MAX = 32767`，对 `100` 取模会让 `0..67` 比 `68..99` 出现概率更高；
2. **低位随机性极差**且 `RAND_MAX` 过小（Windows MSVC 只有 32767）；
3. 全局隐藏状态，**多线程调用存在数据竞争或锁争用**。

### `<random>` 标准两步法：引擎（Engine）+ 分布（Distribution）

`<random>` 把“产生均匀原始比特流”和“映射为目标数学分布”彻底拆开：
1. **播种器 `std::random_device rd;`**（仅用于启动时取硬件/系统熵种子，不要拿它当主循环生成器；单元测试时可用固定种子如 `42u` 实现 100% 可复现！）。
2. **伪随机引擎 `std::mt19937`**（32 位梅森旋转）或 **`std::mt19937_64`**（64 位）——**每个线程/模块独立持有，绝不每次进函数现建一次 `mt19937`！**（创建一次 `mt19937` 状态数组需约 2.5 KB 且初始化耗时）。
3. **分布器**：`std::uniform_int_distribution<int>{1, 6}`（**闭区间 `[1, 6]`**！）、`std::uniform_real_distribution<double>{0.0, 1.0}`（半开 `[0, 1)`）、`std::normal_distribution<double>{mean, stddev}`。
4. **洗牌**：用 `<algorithm>` 的 `std::shuffle(vec.begin(), vec.end(), rng);`（C++17 已彻底移除旧版 `std::random_shuffle`）。

---

## 8. `std::source_location` 与 C++20 Modules 现状（CPP-52）

### `std::source_location`（C++20 `<source_location>`）：告别 `__FILE__` 宏

以前写日志/断言宏不得不写 `#define LOG(msg) log_impl(__FILE__, __LINE__, __func__, msg)`，既污染命名空间又无法配合模板与命名空间。C++20 标准库直接把调用点信息做进了类型安全的**默认参数**：

```cpp
#include <source_location>

void log_info(std::string_view msg,
              const std::source_location loc = std::source_location::current()) {
    // 注意：current() 写在默认参数里，求值时机在【调用方代码那一行】！
    std::cout << loc.file_name() << ':' << loc.line()
              << " (" << loc.function_name() << ") " << msg << '\n';
}
```
只要调用 `log_info("started");`，编译器自动捕获调用点真实的文件名、行号和函数签名——零宏定义、完全受命名空间保护！

<details><summary>选读扩展（低频 / 生态演进中）：C++20 Modules 概览</summary>

传统 `#include` 本质是预处理器把头文件源码复制进每个 `.cpp`。**C++20 Modules** 引入二元编译产物 BMI（Built Module Interface），以 `export module` / `import` 替代文本包含：

```cpp
// math_utils.cppm（模块接口单元）
module;
#include <cstdint>
export module math_utils;

export constexpr int add_clamp(int a, int b) noexcept {
    return a + b;
}
```
> **工程现实提示**：目前 99% 的跨平台 C++ 开源库与企业 CMake 工程仍然以 `.hpp` + `.cpp` 为绝对主流（详见[头文件与包管理正文](../cpp-headers-modules/)），日常开发先用好 `.hpp`/`.cpp` 即可。

</details>

---

## 综合可运行 C++20 示例

```cpp
#include <algorithm>
#include <filesystem>
#include <iostream>
#include <optional>
#include <random>
#include <source_location>
#include <string>
#include <string_view>
#include <type_traits>
#include <variant>
#include <vector>

namespace fs = std::filesystem;

// CPP-45: 折叠表达式求和与多参数日志
template <typename... Args>
constexpr auto sum_fold(Args... args) noexcept {
    return (args + ... + 0);
}

template <typename... Args>
void print_fold(const Args&... args) {
    ((std::cout << args << ' '), ...);
    std::cout << '\n';
}

// CPP-46 & CPP-47: if constexpr + type_traits + decltype(auto)
template <typename T>
std::string to_label(T&& v) {
    using Raw = std::remove_cvref_t<T>;
    if constexpr (std::is_arithmetic_v<Raw>) {
        return "num:" + std::to_string(v);
    } else {
        return "str:" + std::string(std::forward<T>(v));
    }
}

template <typename Container>
decltype(auto) first_elem(Container& c) {
    return c.at(0); // 返回引用而不是拷贝
}

// CPP-48 & CPP-49: variant + visit + expected 风格 Result
template <class... Ts> struct overloaded : Ts... { using Ts::operator()...; };
template <class... Ts> overloaded(Ts...) -> overloaded<Ts...>;

struct ParseErr { std::string reason; };

template <typename T, typename E>
struct Result {
    std::variant<T, E> storage;
    bool has_value() const noexcept { return std::holds_alternative<T>(storage); }
    const T& value() const { return std::get<T>(storage); }
    const E& error() const { return std::get<E>(storage); }
};

Result<int, ParseErr> parse_port(std::string_view sv) {
    if (sv == "8080") return {8080};
    return {ParseErr{"unsupported port: " + std::string(sv)}};
}

// CPP-52: std::source_location 无宏捕获调用点
void diag(std::string_view msg,
          std::source_location loc = std::source_location::current()) {
    std::cout << "[" << fs::path(loc.file_name()).filename().string()
              << ":" << loc.line() << "] " << msg << '\n';
}

int main() {
    print_fold("sum =", sum_fold(1, 2, 3, 4), "|", to_label(42), to_label("ok"));

    std::vector<int> nums{10, 20, 30, 40};
    first_elem(nums) = 99; // decltype(auto) 保留了 int& 引用！

    // CPP-48: std::visit
    std::variant<int, std::string> payload{"ready"};
    std::visit(overloaded{
        [](int n) { std::cout << "int=" << n << '\n'; },
        [](const std::string& s) { std::cout << "text=" << s << '\n'; }
    }, payload);

    // CPP-49: Result
    auto r = parse_port("9999");
    if (!r.has_value()) {
        diag(r.error().reason);
    }

    // CPP-50: filesystem 路径拼接与拆解
    fs::path p = fs::path("var") / "log" / "scan.txt";
    std::cout << "stem=" << p.stem().string() << " ext=" << p.extension().string() << '\n';

    // CPP-51: <random> 引擎与分布分离（固定种子可复现）
    std::mt19937 rng{42u};
    std::uniform_int_distribution<int> dice{1, 6};
    std::shuffle(nums.begin(), nums.end(), rng);
    std::cout << "dice=" << dice(rng) << " shuffled_first=" << nums[0] << '\n';
    return 0;
}
```

---

## 常见误区速查表

| 章节 | 1 行反例 | 症状与隐患 | 正确做法 |
| --- | --- | --- | --- |
| CPP-45 | `(args + ...)` 处理空包 | 空参数包一元折叠直接编译失败 | 改用二元折叠 `(args + ... + 0)` |
| CPP-46 | 普通 `if (is_arithmetic_v<T>)` | 两个分支都会实例化，不兼容类型报错 | 用编译期分支 `if constexpr (...)` |
| CPP-47 | `decltype((x)) y = x;` | 多了一层括号变引用，不再是值拷贝 | 不加多余括号，或明确写 `std::remove_cvref_t<decltype(x)>` |
| CPP-48 | `std::get<T>(v)` 不判类型 | 不匹配时直接抛 `std::bad_variant_access` | 用 `std::get_if<T>(&v)` 或 `std::visit` |
| CPP-50 | `fs::file_size(p)` 不传 `ec` | 文件缺失或权限不足时直接抛异常中断 | 业务常见分支传入 `std::error_code ec` |
| CPP-51 | 每次调函数都新建 `std::mt19937{rd()}` | 重复播种开销大且短时间内种子可能撞车 | 将 `mt19937` 设为长寿命成员或 `thread_local` |
| CPP-52 | `void log(source_location loc = current())` 写进外层封装再转发 | 打印出的行号永远指着中间封装函数，而非真正调用点 | 只在最外层公开函数签名保留默认参数并透传 `loc` |

---

## 4 个巩固微练习

### 练习 1（折叠表达式实战）

写一个函数模板 `template <typename... Args> bool all_true(Args... args)`，使用 C++17 折叠表达式判断所有参数是否都为真，要求空参数调用 `all_true()` 时返回 `true`。

<details>
<summary>提示与参考答案</summary>

```cpp
template <typename... Args>
constexpr bool all_true(Args... args) noexcept {
    return (static_cast<bool>(args) && ...);
}
```
在 C++17 折叠表达式规则中，`&&` 的一元折叠空参数包默认求值为 **`true`**（`||` 默认为 `false`，`,` 默认为 `void()`）。

</details>

### 练习 2（`if constexpr` 与运行期 `if` 对比）

为什么下面函数用普通 `if` 会编译报错，改成 `if constexpr` 就能直接通过？
```cpp
template <typename T>
std::size_t byte_or_len(const T& x) {
    if (std::is_same_v<T, std::string>) {
        return x.size();
    }
    return sizeof(x);
}
```

<details>
<summary>提示与参考答案</summary>

用普通 `if` 时，哪怕传入 `T = int`，编译器依然必须检查并实例化 `x.size()`，于是报错 `request for member 'size' in 'x', which is of non-class type 'const int'`。改成 `if constexpr (std::is_same_v<T, std::string>)` 后，当 `T = int` 时该分支在实例化期被直接裁剪丢弃。

</details>

### 练习 3（`std::variant` 默认构造陷阱）

如果定义 `struct A { A(int) {} };`（无默认构造函数）和 `struct B {};`，那么 `std::variant<A, B> v;` 能否通过编译？该如何解决？

<details>
<summary>提示与参考答案</summary>

不能通过编译。`std::variant` 的默认构造函数会尝试默认构造**第 0 个备选类型**（这里是 `A`），而 `A` 没有默认构造。解法：把有默认构造的 `B` 放在第 0 位（`std::variant<B, A>`），或者在首位放入标准空占位符 **`std::monostate`**（`std::variant<std::monostate, A, B>`）。

</details>

### 练习 4（`<random>` 分布区间边界）

`std::uniform_int_distribution<int>{0, 10}` 与 `std::uniform_real_distribution<double>{0.0, 10.0}` 各自能生成 `10` 吗？为什么两者区间的开闭约定不同？

<details>
<summary>提示与参考答案</summary>

- `uniform_int_distribution<int>{0, 10}` 是**全闭区间 `[0, 10]`**，包含 `10`（方便表达骰子 `1..6` 或数组末下标 `0..size-1`）。
- `uniform_real_distribution<double>{0.0, 10.0}` 在标准中定义为**半开区间 `[0.0, 10.0)`**，数学上不包含上界 `10.0`（方便缩放概率与直方图分桶，仅极端舍入下可能逼近上界）。

</details>
