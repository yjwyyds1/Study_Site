---
title: "第 3 课：函数、返回值与值/引用传递"
description: "学会把代码拆成小函数，彻底分清 void 与返回值、值传递（复印件）和引用传递（原件快捷方式），避开返回局部引用的崩溃陷阱。"
order: 3
tags: ["C++20", "零基础", "函数", "引用", "返回值"]
related: ["handbook/cpp-control", "handbook/cpp-containers", "handbook/lifetime"]
sources: ["cpp-functions.cpp"]
---

## 本课只解决这 1 个问题

当程序超过 30 行时，把所有代码全塞在 `main` 里会非常难读、也无法复用。**函数**就是把一段有明确任务的代码打包起个名字。学完本课，你能自己设计函数签名，并准确判断参数该传值、传引用还是传 `const &`。

前置要求：完成[第 2 课](../cpp-control/)，会用变量、分支和循环。

## 心智模型：点菜窗口 vs 上门修理

先分清函数的两个核心部分：**返回值**和**参数**。

1. **返回值**：函数做完事后交给调用方的结果（比如 `bool is_error(...)` 交回 `true` 或 `false`）；如果函数只负责打印或修改参数、不需要交回结果，返回类型写 `void`。
2. **参数传递的三种方式**：

| 写法 | 形象比喻 | 函数里能改外面的原变量吗？ | 会复制整份数据吗？ | 什么时候用 |
| --- | --- | --- | --- | --- |
| `int x` | **传复印件（值传递）** | 不能，改的是复印件 | 会复制 | `int`、`double`、`bool` 等小类型 |
| `int& x` | **传原件快捷方式（引用传递）** | **能**，改 `x` 就是改原件 | 不复制 | 需要函数顺便修改外部变量时 |
| `const std::string& s` | **带玻璃罩的原件（只读引用）** | 不能（编译器会拦住） | **不复制** | 传 `std::string`、`std::vector` 等大对象只读 |

## 最小可运行代码：逐行追踪传值 vs 传引用

在 `D:\cpp-study` 新建 `cpp-functions.cpp` 并写入下面的代码：

{{example:cpp-functions.cpp}}

在 WSL / Linux 终端或 Windows PowerShell 编译运行：

```bash
# WSL / Linux Bash（推荐）
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-functions.cpp -o cpp-functions && ./cpp-functions
```

```powershell
# Windows PowerShell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-functions.cpp -o cpp-functions.exe
.\cpp-functions.exe
```

对照内存变化看为什么第一次不变、第二次变了：

```text
调用前:             main::count ──→ [ 10 ]

① add_one_copy(count):
   新建参数复印件 x ──→ [ 10 ] → 加 1 变成 [ 11 ]
   函数结束，x 销毁！main::count 依然是 [ 10 ]

② add_one_ref(count):
   参数 x& 绑到原件 ──→ main::count [ 10 ] → 加 1 变成 [ 11 ]
   函数结束，main::count 真正变成了 [ 11 ]
```

**工程习惯**：以后写函数接收 `std::string` 或 `std::vector` 参数，只要不打算修改它，**默认一律写 `const 类型&`**（例如 `const std::string& line`）。既快，又安全。

## 新手必踩的 3 个函数坑（对比实验）

### 坑 1：有返回值的函数，漏写了 `return`！

```cpp
bool is_positive(int n) {
    if (n > 0) {
        return true;
    }
    // 糟糕！n <= 0 时没有 return！
}
```

开启 `-Wall` 编译时，编译器会警告 `control reaches end of non-void function`。运行时如果走到漏掉 `return` 的路径，结果是未定义行为！**只要函数返回类型不是 `void`，每一条分支路径都必须有明确的 `return`。**

### 坑 2：函数定义放在 `main` 后面，编译器不认识！

C++ 编译器是**从上往下**读文件的。如果你把 `void hello() { ... }` 写在 `main()` 下方，在 `main()` 里调用 `hello()` 时编译器还没见过它，就会报错 `error: 'hello' was not declared in this scope`。
- 做法 A：把小函数写在 `main` 上面（单文件最省事）。
- 做法 B：在 `main` 上面先写一行**函数声明** `void hello();`，把函数体写在 `main` 下面（多文件工程就是这样干的）。

### 坑 3：千万不要返回局部变量的引用！

```cpp
// 致命错误（只分析，不要这样写）：
const std::string& bad_func() {
    std::string local = "ERROR";
    return local; // local 在函数结束时立刻销毁，返回出去的引用指向了空气！
}
```

如果函数要产生一个新的字符串交给外面，直接按值返回 `std::string` 就好（现代 C++ 编译器会自动优化掉多余拷贝）。

## 4 个梯度微练习

### 练习 1（读代码写输出）

不要运行，写出程序的完整输出：

```cpp
int double_val(int x) {
    return x * 2;
}

void double_in_place(int& x) {
    x = x * 2;
}

int main() {
    int a = 3;
    int b = double_val(a);
    double_in_place(a);
    std::cout << a << " " << b << '\n';
}
```

<details>
<summary>核对答案</summary>

输出：`6 6`。`double_val(a)` 没改 `a`，把算出的 `6` 交给了 `b`；随后 `double_in_place(a)` 通过引用把 `a` 本身改成了 `6`。

</details>

### 练习 2（找 Bug 并修复）

下面代码想写一个“如果遇到 `ERROR`，就把错误数加 1 并返回是否是错误”的函数，但编译/逻辑都有问题，修好它：

```cpp
void count_if_error(std::string line, int error_count) {
    if (line.starts_with("ERROR")) {
        ++error_count;
        return true;
    }
    return false;
}
```

<details>
<summary>提示与答案</summary>

有三处要改：
1. 返回了 `true/false`，所以返回类型不能是 `void`，应改成 `bool`。
2. `line` 只读不改，建议写成 `const std::string& line` 避免每次复制。
3. `error_count` 需要把修改带回调用方，必须写成引用 `int& error_count`。

</details>

### 练习 3（补全函数声明）

如果你非要把函数体写在 `main` 下面，在 `main` 上面应该补哪一行声明？

```cpp
// 在这里补一行声明：
int main() {
    std::cout << add(2, 3) << '\n';
    return 0;
}

int add(int a, int b) {
    return a + b;
}
```

<details>
<summary>核对答案</summary>

在 `main` 上面加上：`int add(int a, int b);`（注意末尾必须有分号 `;`）。

</details>

### 练习 4（独立手写）

写一个函数 `std::string format_level(const std::string& level, int count)`，把级别和数量拼成 `"INFO: 3"` 这样的字符串返回（提示：`std::to_string(count)` 可以把整数转成 `std::string`，然后用 `+` 拼接）。在 `main` 里调用并打印 `"ERROR: 5"`。

<details>
<summary>参考写法</summary>

```cpp
#include <iostream>
#include <string>

std::string format_level(const std::string& level, int count) {
    return level + ": " + std::to_string(count);
}

int main() {
    std::cout << format_level("ERROR", 5) << '\n';
    return 0;
}
```

</details>
