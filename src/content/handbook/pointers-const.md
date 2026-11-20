---
title: "指针、引用与 const：表达可选借用与只读边界"
description: "对照取地址 &、解引用 *、nullptr 检查与引用绑定，分清 const T*、T* const 与 const T* const，学会为函数参数选值、引用或指针。"
order: 18
tags: ["C++20", "指针", "引用", "const", "借用"]
related: ["handbook/cpp-functions", "handbook/lifetime", "handbook/raii"]
sources: ["pointers-const.cpp"]
---

## 本课只解决这 1 个问题

在[函数与引用一课](../cpp-functions/)中，我们学会了用 `const T&` 只读借用、用 `T&` 可修改借用。但如果调用方**有时根本没有对象可传**（例如“可选配置项”或“可能查不到的记录”），引用就表达不了“缺省”了——因为引用必须始终绑定到一个存活对象。本课解决的核心问题是：**一个函数参数怎样精确表达可选借用、可修改借用与只读借用，以及 `const` 放在不同位置到底锁住了什么？**

前置要求：熟悉[函数与值/引用传递](../cpp-functions/)和变量作用域基础。

## 心智模型：永久别名 vs 可改写的地址便签

把**引用**和**指针**放进同一张图里对比，差异立刻一目了然：

```text
对象内存：   a = [ 10 ] (地址 0x100)      b = [ 20 ] (地址 0x200)

引用 ref：   ref ═══永久绑定═══▶ a [ 10 ]
             (必须初始化，不能为“空”，不能改绑到 b；写 ref = b 只会改写 a 的值！)

指针 p：     p [ 0x100 ] ─────▶ a [ 10 ]
             p = &b 后：
             p [ 0x200 ] ─────▶ b [ 20 ]
             p = nullptr 后：
             p [ 0x000 ] ─────▶ (空，无目标，解引用前必须检查)
```

记住两个成对运算符，不要和声明里的类型符号混淆：
- **取地址 `&a`**（表达式里）：拿到对象 `a` 的地址，类型是 `int*`。
- **解引用 `*p`**（表达式里）：顺着指针 `p` 存的地址找到目标对象本身。**前提是 `p != nullptr` 且目标对象仍存活。**

### 两层 `const`：以 `*` 为界，从右往左读

指针本身是一个变量（存着地址），它指向的对象是另一个变量，所以 `const` 可以分别锁住其中一层，或两层全锁：

| 声明写法 | 从右往左读 | 能否改目标值 `*p = ...` | 能否换指向 `p = &b` | 常见用途 |
| --- | --- | --- | --- | --- |
| `const int* p` | 指向 `const int` 的指针 | **不能**（编译器拦住） | 可以 | **只读可选借用（最常用）** |
| `int* const p` | 指向 `int` 的常量指针 | 可以 | **不能**（编译器拦住） | 固定地址的可写句柄（较少直接作参数） |
| `const int* const p` | 指向 `const int` 的常量指针 | **不能** | **不能** | 地址与内容均只读的固定观察点 |

> 小技巧：`const int* p` 和 `int const* p` 完全等价，只要 `const` 在 `*` 的**左边**，锁的就是“指向的对象”；在 `*` 的**右边**，锁的就是“指针自己”。

### 参数选型决策表（附有效性契约）

设计函数参数时，按“是否必须存在 + 是否修改 + 复制成本”五选一：

| 你的意图 | 推荐参数类型 | 允许空目标？ | 能否修改原对象？ | 生命周期契约 |
| --- | --- | --- | --- | --- |
| 接收小值独立运算 | `int` / `double` | 否（总有值） | 否（操作副本） | 独立拥有副本 |
| 必选、只读借用大对象 | `const std::string&` | 否 | 否 | 实参须在调用期间存活 |
| 必选、原地修改对象 | `int&` / `Counts&` | 否 | 是 | 实参须在调用期间存活 |
| **可选、只读借用** | `const int*` | **是（`nullptr`）** | 否 | 非空时目标须在调用期间存活 |
| **可选、可修改借用** | `int*` | **是（`nullptr`）** | 是 | 非空时目标须在调用期间存活 |

## 最小可运行代码与逐行追踪

将 `pointers-const.cpp` 保存到本地，它依次演示了只读探针（`7` 与 `nullptr`）、两对象对照（指针换指向 vs 引用赋值）、三层 `const` 以及可写可选借用：

{{example:pointers-const.cpp}}

编译并运行：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic pointers-const.cpp -o pointers-const.exe
.\pointers-const.exe
```

核对输出：

```text
7
missing
after rebind vs ref-assign: a=25, b=30, ref=25
const demo: *ro_ptr=30, *fixed_ptr=42, *locked_ptr=30
after bump: a=50
```

按步骤追踪最容易看错的“指针换指向 vs 引用赋值”段落：

| 执行语句 | `a` 的值 | `b` 的值 | `p` 指向谁 | `ref` 绑定谁 | 关键结论 |
| --- | --- | --- | --- | --- | --- |
| `int a = 10, b = 20;` | `10` | `20` | — | — | 两个独立存活对象 |
| `int* p = &a; p = &b; *p = 25;` | `10` | `25` | `b` | — | `p` 改指 `b` 后写入，只改了 `b` |
| `int& ref = a;` | `10` | `25` | `b` | `a` | `ref` 成为 `a` 的永久别名 |
| `ref = b;` | **`25`** | `25` | `b` | 仍是 `a` | 给引用赋值不会换绑，而是把 `25` 写进 `a` |
| `b = 30;` | `25` | `30` | `b` | 仍是 `a` | `ref` 读出来仍是 `25`，彻底证实没换绑 |
| `*fixed_ptr = 42;` | **`42`** | `30` | `b` | 仍是 `a` | `int* const` 允许修改所指对象 `a` |
| `bump_if_present(&a, 8);` | **`50`** | `30` | `b` | 仍是 `a` | 非空指针安全加 8；传 `nullptr` 时直接跳过 |

## 1 行反例坑点（千万别踩）

### 坑 1：通过 `const int*` 写入目标

```cpp
const int* ro_ptr = &a;
*ro_ptr = 99; // 编译错误：assignment of read-only location '* ro_ptr'
```

即使 `a` 本身不是 `const`，只要你通过 `const int*` 这个只读窗口看它，编译器就会拒绝写入。这正是 `const` 接口保护调用方数据的核心机制。

### 坑 2：试图让 `int* const` 指向别的对象

```cpp
int* const fixed_ptr = &a;
fixed_ptr = &b; // 编译错误：assignment of read-only variable 'fixed_ptr'
```

`const` 在 `*` 右边，锁死了指针里保存的地址；允许 `*fixed_ptr = 42`，禁止改写 `fixed_ptr` 本身。

### 坑 3：不判空直接解引用指针

```cpp
void bad_print(const int* p) {
    std::cout << *p << '\n'; // 反例：传入 nullptr 时触发未定义行为（通常直接崩溃）
}
```

只要参数类型是指针，就等于在接口上承诺“调用方可能传 `nullptr`”。解引用前必须先检查 `if (p == nullptr)`（或 `if (!p)`）；如果业务上不允许空目标，直接改成引用 `const int&`！

### 坑 4：把 `const` 指针误当成“目标永远不变”

`const int* ro_ptr = &a;` 只保证**不能通过 `ro_ptr` 修改 `a`**，并不阻止别人通过 `a = 99;` 或非 `const` 指针修改 `a`。下一课[生命周期](../lifetime/)会继续探讨更危险的问题：如果 `a` 先销毁了，`ro_ptr` 就会变成悬垂指针。

## 4 个梯度微练习

### 练习 1（读代码写输出）

不运行程序，写出最后一行打印的 `x` 和 `y`：

```cpp
int x = 5;
int y = 9;
int* ptr = &x;
int& alias = y;
*ptr = 12;
ptr = &y;
alias = x;
*ptr += 1;
std::cout << x << ' ' << y << '\n';
```

<details>
<summary>核对答案</summary>

输出：`12 13`。
追踪过程：
1. `*ptr = 12` 把 `x` 改成 `12`。
2. `ptr = &y` 让 `ptr` 改指向 `y`。
3. `alias = x` 等价于 `y = x`，把 `y` 改成 `12`（`alias` 仍绑着 `y`）。
4. `*ptr += 1` 通过 `ptr` 把 `y` 改成 `13`。最终 `x = 12, y = 13`。

</details>

### 练习 2（翻译 `const` 声明并找错）

判断下面 4 行语句中哪两行会触发编译错误，并用“从右往左读”说明理由：

```cpp
int m = 1, n = 2;
const int* p1 = &m;
int* const p2 = &m;
p1 = &n;       // (A)
*p1 = 10;      // (B)
*p2 = 20;      // (C)
p2 = &n;       // (D)
```

<details>
<summary>提示与答案</summary>

**(B)** 和 **(D)** 会编译报错：
- `p1` 是“指向 `const int` 的指针”，不能改目标值 `*p1`，所以 **(B)** 报错，**(A)** 合法。
- `p2` 是“指向 `int` 的常量指针”，不能改指针本身的地址 `p2`，所以 **(D)** 报错，**(C)** 合法。

</details>

### 练习 3（给接口选最合适的参数类型）

为下面 3 个需求选出最恰当的参数声明：
1. 计算一个大 `std::vector<int>` 的总和，必选输入且不修改。
2. 给日志计数器 `Counts` 增加一条 `WARN` 计数，必选输入且原地修改。
3. 查询“当前用户设置的超时秒数”，调用方可能没传覆盖值（用默认值 `30` 代替），传了也只读取不修改。

<details>
<summary>核对答案</summary>

1. `const std::vector<int>& values`（必选、只读、避免拷贝大容器）。
2. `Counts& counts`（必选、原地修改）。
3. `const int* override_seconds`（可选只读借用；调用方传 `nullptr` 时函数内部使用默认值 `30`；在 C++17/20 中对于小值也可以考虑 `std::optional<int>`）。

</details>

### 练习 4（独立实验：带默认值的只读探针）

自己新建一个源文件，编写函数 `int read_or_default(const int* target, int fallback)`：当 `target` 非空时返回 `*target`，为空时返回 `fallback`。在 `main` 中分别用整数 `7` 的地址和 `nullptr` 调用（`fallback` 设为 `-1`），验证输出 `7` 和 `-1`；再取消注释一行 `*target = 0;` 亲眼看一次 `g++` 的只读诊断信息。

<details>
<summary>参考写法</summary>

```cpp
#include <iostream>

int read_or_default(const int* target, int fallback) {
    if (target == nullptr) {
        return fallback;
    }
    // *target = 0; // 取消注释可验证编译诊断：assignment of read-only location
    return *target;
}

int main() {
    int value = 7;
    std::cout << read_or_default(&value, -1) << '\n';
    std::cout << read_or_default(nullptr, -1) << '\n';
    return 0;
}
```

</details>
