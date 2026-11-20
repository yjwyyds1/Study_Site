---
title: "模板、类型推导与 C++20 Concepts"
description: "追踪函数模板的类型推导与实例化时机，理解模板定义为何写在头文件，并用 C++20 requires 与 Concepts 在编译期约束输入类型。"
order: 32
tags: ["C++20", "模板", "Concepts", "泛型"]
related: ["handbook/cpp-functions", "handbook/cmake-targets", "handbook/stl-containers-algos"]
sources: ["stl-generics.cpp"]
---

## 本课只解决这 1 个问题

写日志或数据统计工具时，我们常常需要“对一串元素按条件计数”：有时数据放在 `std::vector<int>` 里，有时放在定长 `std::array<int, 4>` 里，有时又换成了 `std::vector<std::string>`。怎样只写一份函数就兼容这些序列，同时在误传非法类型（比如传了一个普通整数 `42`）时，让编译器在**调用处**第一行就指出违反了哪条约束？

前置要求：会写函数与引用传递（[第 3 课](../cpp-functions/)），并了解头文件与源文件的编译链接关系（[CMake 多文件工程](../cmake-targets/)）。

## 心智模型：蓝图实例化 + 编译期安检门

**函数模板本身不是一段已经编译好的机器码，而是一张“代码生成蓝图”。** 每次你用具体类型调用它，编译器会先通过 **Concepts 安检门** 检查类型是否合格，再按蓝图生成一份真正的函数（这一步叫**实例化**）：

```text
源码蓝图:  template <typename R, typename Pred> requires CountableRange<R, Pred>
           std::size_t count_matching(const R& range, Pred pred)

调用点 1: count_matching(vec, is_positive)    ──► 安检通过 ──► 实例化 count_matching<vector<int>, IsPositive>
调用点 2: count_matching(arr, is_positive)    ──► 安检通过 ──► 实例化 count_matching<array<int,4>, IsPositive>
调用点 3: count_matching(42,  is_positive)    ──► 安检拦截 ✕  int 不满足 std::ranges::input_range
```

### 为什么模板定义通常必须写在头文件（`.hpp`）里？

普通函数可以在 `.hpp` 里只放声明、把实现藏进 `.cpp`，因为链接器最后会把单个函数地址拼起来；但**模板只有在看见具体实参类型的那一刻才能实例化**。如果 `main.cpp` 只 `#include` 了模板声明却看不见函数体，编译器在编译 `main.cpp` 时就无法凭空生成 `count_matching<vector<int>, ...>` 的机器码，最终会在链接阶段报 `undefined reference`。因此，通用模板的定义必须对调用方可见——直接写在头文件里。

### 静态约束 vs 运行时业务验证

不要把所有检查都塞进模板约束里，分清边界才不会设计失衡：

| 检查时机 | 负责什么 | 工具 |
| --- | --- | --- |
| **编译期（静态约束）** | 类型能力：`R` 能不能遍历？`Pred` 能不能接受元素并返回 `bool`？ | `concept`、`requires`、`static_assert` |
| **运行期（业务验证）** | 数据状态：序列是不是空的？数值是不是大于 `0`？文件能不能打开？ | `if`、`std::optional`、错误返回/异常 |

## 最小可运行代码与分步追踪

将 `stl-generics.cpp` 保存到本地并编译运行：

{{example:stl-generics.cpp}}

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic stl-generics.cpp -o stl-generics.exe
.\stl-generics.exe
```

预期输出：

```text
pick_max(3, 7) = 7
pick_max<double>(3, 4.5) = 4.5
vector positive count = 2
array positive count  = 2
non-empty log count   = 2
```

对照执行与编译阶段，逐行追踪编译器和运行时各自做了什么：

| 代码位置 | 阶段 | 发生的事情 | 结果 |
| --- | --- | --- | --- |
| `static_assert(CountableRange<vector<int>, IsPositive>)` | 编译期 | 检查 `vector<int>` 是 `input_range` 且 `IsPositive(const int&)` 返回 `bool` | 通过 |
| `static_assert(!CountableRange<int, IsPositive>)` | 编译期 | `int` 没有 `begin()/end()`，不满足 `input_range`，取反为真 | 通过（确认拒绝） |
| `pick_max(3, 7)` | 编译期 → 运行期 | 推导 `T = int`，检查 `totally_ordered<int>`，实例化并比较 | 返回 `7` |
| `pick_max<double>(3, 4.5)` | 编译期 → 运行期 | 显式锁定 `T = double`，将 `3` 隐式转为 `3.0` 后比较 | 返回 `4.5` |
| `count_matching(vec, is_positive)` | 编译期 → 运行期 | 实例化 `vector<int>` 版本，遍历 `{-1, 0, 2, 5}`，命中 `2, 5` | 返回 `2` |
| `count_matching(arr, is_positive)` | 编译期 → 运行期 | 实例化 `array<int, 4>` 版本，遍历 `{-1, 0, 2, 5}`，命中 `2, 5` | 返回 `2` |

如果你取消 `main()` 末尾 `count_matching(42, is_positive);` 的注释再编译，GCC 20+ 会直接把诊断停在调用处，第一条核心原因就是：

```text
note: constraints not satisfied
note: required for the satisfaction of 'CountableRange<R, Pred>' [with R = int; Pred = IsPositive]
note: required for the satisfaction of 'input_range<R>' [with R = int]
```

相比 C++20 之前动辄上百行深入模板内部的“天书报错”，Concepts 能直接指出**哪个类型（`R = int`）违反了哪条约束（`input_range`）**。

## 3 个一针见血的反例陷阱

### 坑 1：混合类型实参导致推导冲突

```cpp
// 错！a 是 int，b 是 double，模板参数 T 无法同时推导成两个不同类型（模板推导不做隐式转换）
auto m = pick_max(3, 4.5);
```

**避坑写法**：要么显式指定模板实参 `pick_max<double>(3, 4.5)`，要么改成双模板参数 `template <typename A, typename B>` 并用 `std::common_type_t<A, B>` 返回公共类型。

### 坑 2：把模板实现拆到 `.cpp` 里引发链接失败

```cpp
// math_utils.hpp 里只写了 declaration: template <typename T> T pick_max(const T&, const T&);
// math_utils.cpp 里写了定义，但 main.cpp 调用 pick_max(3, 7) -> 链接报错 undefined reference!
```

**避坑写法**：函数模板和类模板的完整定义放在 `.hpp` 头文件里，让所有包含它的 `.cpp` 在编译期都能完成实例化。

### 坑 3：约束漏写元素类型匹配，导致报错重新掉进函数体内

```cpp
// 不够严格！只写了 std::ranges::input_range<R>，没检查 Pred 能否接受 R 的元素类型
template <std::ranges::input_range R, typename Pred>
std::size_t loose_count(const R& r, Pred p); // 传入 vector<string> + IsPositive 会深入函数体报错
```

**避坑写法**：用 `std::predicate<Pred, std::ranges::range_reference_t<R>>` 把范围的元素类型与谓词参数绑定校验，不匹配时在调用处立刻拦截。

## 4 个梯度微练习

### 练习 1（读代码判断编译成败）

以下四行代码分别能否通过编译？如果失败，指出原因：

```cpp
pick_max(10, 20);
pick_max(10, 20.5);
pick_max<double>(10, 20.5);
count_matching(std::array<int, 3>{-2, 4, 6}, IsPositive{});
```

<details>
<summary>核对答案</summary>

1. `pick_max(10, 20)`：通过，推导 `T = int`。
2. `pick_max(10, 20.5)`：**失败**，`10` 推导出 `int`，`20.5` 推导出 `double`，发生混合类型推导冲突。
3. `pick_max<double>(10, 20.5)`：通过，显式固定 `T = double` 后允许 `10` 隐式转换为 `double`。
4. `count_matching(std::array<int, 3>{-2, 4, 6}, IsPositive{})`：通过，实例化 `array<int, 3>` 版本，运行返回 `2`。

</details>

### 练习 2（补全 Concept 与 `static_assert`）

把下面 `NumericRange` 补全，使其只接受“元素为整数或浮点数（`std::integral` 或 `std::floating_point`）的 `input_range`”，并写出两条 `static_assert`：一条接受 `std::vector<double>`，一条拒绝 `std::vector<std::string>`。

```cpp
template <typename R>
concept NumericRange = /* 请补全 */;
```

<details>
<summary>参考写法</summary>

```cpp
#include <concepts>
#include <ranges>
#include <string>
#include <vector>

template <typename R>
concept NumericRange =
    std::ranges::input_range<R> &&
    (std::integral<std::ranges::range_value_t<R>> ||
     std::floating_point<std::ranges::range_value_t<R>>);

static_assert(NumericRange<std::vector<double>>);
static_assert(!NumericRange<std::vector<std::string>>);
```

注意这里用的是 `std::ranges::range_value_t<R>`（去掉引用和 `const` 后的值类型），因为 `std::integral<const int&>` 为 `false`。

</details>

### 练习 3（解读编译器诊断并修复）

假设你写了 `count_matching(std::vector<std::string>{"a", "b"}, IsPositive{});`，编译器提示 `CountableRange` 未满足。请说出具体是 `input_range<R>` 失败了，还是 `std::predicate<...>` 失败了，并给出一种正确调用方式。

<details>
<summary>提示与答案</summary>

- `std::vector<std::string>` 是合法的 `input_range`，所以第一条通过。
- 失败的是第二条：`std::predicate<IsPositive, std::string&>` 不满足，因为 `IsPositive::operator()(int)` 无法接收 `std::string`。
- 修复方式：传入匹配 `std::string` 的谓词，例如 `[](const std::string& s) { return s.size() == 1; }`。

</details>

### 练习 4（独立手写：带投影的泛型计数）

写一个受约束的函数模板 `count_projected(const R& range, Pred pred, Proj proj)`：遍历 `range` 中每个元素 `x`，先调用 `proj(x)` 取出字段，再用 `pred(proj(x))` 判断是否为真并计数。用 `struct LogItem { std::string level; int latency_ms; };` 测试统计 `latency_ms > 100` 的条数，并用 `static_assert` 验证非法调用被拒绝。

<details>
<summary>参考写法</summary>

```cpp
#include <concepts>
#include <cstddef>
#include <functional>
#include <iostream>
#include <ranges>
#include <string>
#include <vector>

template <typename R, typename Pred, typename Proj>
concept ProjectedCountable =
    std::ranges::input_range<R> &&
    std::invocable<Proj, std::ranges::range_reference_t<R>> &&
    std::predicate<Pred, std::invoke_result_t<Proj, std::ranges::range_reference_t<R>>>;

template <typename R, typename Pred, typename Proj>
    requires ProjectedCountable<R, Pred, Proj>
std::size_t count_projected(const R& range, Pred pred, Proj proj) {
    std::size_t total = 0;
    for (const auto& item : range) {
        if (std::invoke(pred, std::invoke(proj, item))) {
            ++total;
        }
    }
    return total;
}

struct LogItem {
    std::string level;
    int latency_ms;
};

int main() {
    const std::vector<LogItem> items{{"INFO", 40}, {"WARN", 150}, {"ERROR", 220}};
    const auto slow = [](int ms) { return ms > 100; };
    static_assert(ProjectedCountable<std::vector<LogItem>, decltype(slow), decltype(&LogItem::latency_ms)>);
    static_assert(!ProjectedCountable<int, decltype(slow), decltype(&LogItem::latency_ms)>);
    std::cout << count_projected(items, slow, &LogItem::latency_ms) << '\n'; // 输出 2
}
```

使用 `std::invoke` 的好处是 `proj` 既可以是普通 lambda，也可以直接传成员指针 `&LogItem::latency_ms`。

</details>
