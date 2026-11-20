---
title: "第 1 课：变量、基本类型与常见运算坑"
description: "从 5 行代码起步，掌握 int、double、bool、std::string，避开未初始化、整数除法与等号混淆三大新手坑。"
order: 1
tags: ["C++20", "零基础", "变量", "类型"]
related: ["handbook/cpp-setup", "handbook/cpp-control"]
sources: ["cpp-basics.cpp"]
---

## 本课只解决这 1 个问题

程序要处理数据（比如统计日志条数、记录平均耗时、判断有没有报错），就必须把数据先存进内存再做计算。学完本课，你能用 C++ 的四种核心基本类型存放数据，做四则运算和布尔判断，并避开新手最容易算错的三个陷阱。

前置要求：已完成[第 0 课](../cpp-setup/)，能用 `g++` 编译运行单文件。

## 心智模型：变量就是贴了标签的专用盒子

在 C++ 里定义一个变量，等于向电脑申请一个**有固定形状的盒子**：
- **类型**：决定了盒子里能装什么（整数？小数？文字？）、占多大地方、支持什么操作。
- **名字**：贴在盒子上的标签，方便后面找到它。
- **初始化**：造出盒子时顺便放进去的第一个值（**好习惯：永远在定义时就给初始值**）。

```text
int log_count = 3;         ──→  [  3  ]   标签: log_count（只能装整数）
log_count = log_count + 1; ──→  [  4  ]   同一个盒子，里面的数被改成了 4
```

最常用的 4 种基础类型：

| 类型 | 存什么 | 示例 | 需要什么头文件 |
| --- | --- | --- | --- |
| `int` | 整数（正数、负数、0） | `int count = 0;` | 不需要 |
| `double` | 带小数点的数 | `double avg_ms = 12.5;` | 不需要 |
| `bool` | 真或假（`true` / `false`） | `bool has_error = false;` | 不需要 |
| `std::string` | 一串文字（字符串） | `std::string name = "LogScan";` | `#include <string>` |

## 从 5 行搭到完整程序

### 第一步：先在屏幕打出两个数

新建 `basics-step1.cpp`，只写 6 行：

```cpp
#include <iostream>

int main() {
    int a = 10;
    int b = 3;
    std::cout << a + b << '\n';
    return 0;
}
```

编译运行，输出 `13`。注意 `<<` 可以连续拼接多个要打印的东西，例如 `std::cout << "sum = " << a + b << '\n';`。

### 第二步：加入四种类型与修改操作

在 `D:\cpp-study` 新建 `cpp-basics.cpp` 并写入下面的完整示例：

{{example:cpp-basics.cpp}}

在 WSL / Linux 终端或 Windows PowerShell 编译并运行（也可直接点上方代码块右上角「复制 WSL 一键运行」）：

```bash
# WSL / Linux Bash（推荐）
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-basics.cpp -o cpp-basics && ./cpp-basics
```

```powershell
# Windows PowerShell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-basics.cpp -o cpp-basics.exe
.\cpp-basics.exe
```

逐行追踪执行过程：

| 执行到哪行 | 盒子里的变化 | 屏幕输出 |
| --- | --- | --- |
| `int log_count = 3;` | `log_count` = `3` | 无 |
| `double avg_ms = 12.5;` | `avg_ms` = `12.5` | 无 |
| `bool has_error = false;` | `has_error` = `false` | 无 |
| `std::string service = "LogScan";` | `service` = `"LogScan"` | 无 |
| `log_count = log_count + 1;` | 先算出右边 `3 + 1 = 4`，再放回 `log_count` | 无 |
| `has_error = true;` | `has_error` 变成 `true` | 无 |
| 四行 `std::cout << ...` | 读取四个盒子的当前值 | 依次打印 4 行 |

注意第 4 行输出是 `has_error: 1` 而不是 `true`。如果想让 `bool` 打印成英文 `true/false`，可以在打印前加上 `std::boolalpha`：`std::cout << std::boolalpha << has_error << '\n';`。

## 新手必踩的 3 个坑（对比实验）

### 坑 1：整数除法会直接丢掉小数部分！

```cpp
int total = 5;
int count = 2;
std::cout << total / count << '\n';      // 输出 2，不是 2.5！
std::cout << 5.0 / count << '\n';        // 输出 2.5（只要有一边是小数即可）
```

**原因**：`int` 除以 `int`，C++ 规定结果依然是 `int`，小数部分直接砍掉（不是四舍五入）。如果希望算出小数平均耗时，至少要把其中一个数转成 `double`：`static_cast<double>(total) / count`。

### 坑 2：忘记初始化，盒子里装的是随机垃圾值

```cpp
int x;                  // 危险！没有给初始值
std::cout << x << '\n'; // 可能是 0，也可能是 32767 或任意乱码（未定义行为）
```

**铁律**：定义局部变量时，顺手写上 `= 0` 或 `= false`，比如 `int error_count = 0;`。开启 `-Wall` 编译参数时，编译器也会警告你使用了未初始化变量。

### 坑 3：类型不匹配，把文字塞进数字盒子

把 `int log_count = 3;` 改成 `int log_count = "3";` 重新编译。编译器会直接报错拒绝生成 `.exe`——`"3"` 是字符串，不能放进 `int` 盒子里。C++ 的强类型检查能帮你在运行前提前拦住这类低级错误。

## 4 个梯度微练习

### 练习 1（读代码写结果）

不要运行，写出下面代码的完整输出：

```cpp
int x = 7;
int y = x;
x = 20;
std::cout << x << " " << y << " " << (x / 3) << '\n';
```

<details>
<summary>核对答案</summary>

输出：`20 7 6`。`int y = x;` 把当时的 `7` 复制一份放进 `y`；后面改 `x = 20` 不影响 `y`；整数 `20 / 3` 截断小数后等于 `6`。

</details>

### 练习 2（计算真实平均值）

下面代码想算 `3` 条日志总耗时 `10` 毫秒的平均值，但打印出来是 `3` 而不是 `3.33333`，修好它：

```cpp
int total_ms = 10;
int count = 3;
double avg = total_ms / count;
std::cout << avg << '\n';
```

<details>
<summary>提示与答案</summary>

虽然 `avg` 是 `double`，但右边 `total_ms / count` 两个都是 `int`，先做完整数除法得到 `3`，再放进 `avg` 变成 `3.0`。应改为 `double avg = static_cast<double>(total_ms) / count;`。

</details>

### 练习 3（找编译错误）

下面程序编译不过，找出全部 2 处错误：

```cpp
#include <iostream>

int main() {
    std::string app = "LogScan";
    int port = "8080";
    std::cout << app << ":" << port << '\n';
    return 0;
}
```

<details>
<summary>核对答案</summary>

1. 用了 `std::string` 但顶部少了 `#include <string>`。
2. `int port = "8080";` 把字符串赋给了 `int`，应去掉双引号写成 `int port = 8080;`。

</details>

### 练习 4（独立手写）

新建 `calc.cpp`，定义变量保存：总请求数 `total = 15`、失败数 `failed = 4`。计算成功率（百分比，例如 `73.3333%`），并按 `total=15, failed=4, fail_rate=26.6667%` 的格式打印出来。

<details>
<summary>参考答案</summary>

```cpp
#include <iostream>

int main() {
    int total = 15;
    int failed = 4;
    double fail_rate = static_cast<double>(failed) / total * 100.0;

    std::cout << "total=" << total
              << ", failed=" << failed
              << ", fail_rate=" << fail_rate << "%\n";
    return 0;
}
```

</details>
