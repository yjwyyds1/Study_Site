---
title: "第 2 课：分支、循环与输入流陷阱"
description: "用 if/else、while 和 for 让程序做判断与重复，彻底搞懂 = 与 ==、else if 互斥、以及 cin 与 getline 混用吞行的经典坑。"
order: 2
tags: ["C++20", "零基础", "分支", "循环", "cin"]
related: ["handbook/cpp-basics", "handbook/cpp-functions"]
sources: ["cpp-control.cpp"]
---

## 本课只解决这 1 个问题

真实程序需要根据不同情况走不同分支（**条件判断**），并能反复处理多条数据直到结束（**循环**）。学完本课，你能写出带循环和分类统计的命令行程序，并且不会在键盘/文件输入时掉进 C++ 最常见的三个逻辑陷阱。

前置要求：完成[第 1 课](../cpp-basics/)，会用变量和 `std::cout`。

## 心智模型：岔路口与传送带

1. **`if / else if / else`（互斥岔路口）**：从上往下逐个检查条件，**只要命中其中一条，做完就立刻离开整组分支**，后面的条件看都不看。
2. **`while (条件)`（条件传送带）**：不知道要重复多少次时用它（比如“一直读到用户输入 `quit` 为止”）。
3. **`for (起点; 条件; 步进)`（计数传送带）**：明确知道要跑几次时用它（比如“从 1 数到 5”）。

## 最小可运行代码：从 10 行搭到统计器

先看 `cpp-control.cpp`：它不断读取日志级别，遇到 `"quit"` 停下，否则分别统计 `INFO` 和 `ERROR` 的数量：

{{example:cpp-control.cpp}}

在 WSL / Linux 终端或 Windows PowerShell 编译，并用管道一次性喂给它 4 个词：

```bash
# WSL / Linux Bash（推荐）
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-control.cpp -o cpp-control
printf "INFO\nERROR\nDEBUG\nquit\n" | ./cpp-control
```

```powershell
# Windows PowerShell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-control.cpp -o cpp-control.exe
"INFO`nERROR`nDEBUG`nquit" | .\cpp-control.exe
```

顺着输入把循环每一步的状态在纸上走一遍：

| 第几轮 | `std::cin >> level` 读到什么 | 命中哪条分支 | `info_count` / `error_count` | 动作 |
| --- | --- | --- | --- | --- |
| 1 | `"INFO"` | `level == "INFO"` | `1 / 0` | 计数加 1 |
| 2 | `"ERROR"` | `level == "ERROR"` | `1 / 1` | 计数加 1 |
| 3 | `"DEBUG"` | `else` | `1 / 1` | 打印 `未知级别：DEBUG` |
| 4 | `"quit"` | `level == "quit"` | `1 / 1` | 执行 `break;`，跳出 `while` 循环 |

## 新手必踩的 3 个逻辑陷阱

### 陷阱 1：把比较 `==` 写成了赋值 `=`！

```cpp
int code = 0;
if (code = 1) { // 错！这是把 1 放进 code，整个条件永远为真！
    std::cout << "出错了\n";
}
```

**记忆口诀**：判断相等必须写**两个等号 `==`**；一个等号 `=` 是“把右边放进左边”。开启 `-Wall` 编译时，GCC 会主动提醒你 `suggest parentheses around assignment used as truth value`。

### 陷阱 2：把 `else if` 拆成两个独立的 `if`

把 `cpp-control.cpp` 里的 `else if (level == "ERROR")` 删掉 `else`：

```cpp
if (level == "INFO") {
    ++info_count;
}
if (level == "ERROR") {   // 独立的新分支！
    ++error_count;
} else {                  // 这个 else 只配对上面的 ERROR！
    std::cout << "未知级别：" << level << '\n';
}
```

输入 `"INFO`nquit"` 时，程序既会把 `info_count` 加 1，又会因为 `"INFO" != "ERROR"` 而掉进第二个 `else`，打印出荒谬的 `未知级别：INFO`。**多选一的条件必须用 `else if` 串起来。**

### 陷阱 3：`std::cin >>` 后面直接接 `std::getline`，第二行被“吞掉”了！

这是 C++ 初学者**中招率最高**的输入坑：

```cpp
int count = 0;
std::cin >> count;          // 假设用户输入 3 然后按回车
std::string line;
std::getline(std::cin, line); // 糟糕！它立刻读到了刚才留下的回车符，line 是空的！
```

**为什么？** 因为 `std::cin >> count` 只拿走了数字 `3`，把你敲的**回车符 `\n` 留在了输入缓冲区里**。紧接着 `std::getline` 一看缓冲区开头正好有个 `\n`，以为你直接敲了一行空行就结束了！

**怎么修？** 如果混用 `>>` 和 `getline`，中间加一句 `std::cin.ignore(...)` 清掉残留换行，或者**干脆统一全部用 `std::getline` 读整行**（后面的 `LogScan` 全部统一用 `getline`，彻底避开这个问题）。

## 4 个梯度微练习

### 练习 1（读代码写输出）

不要运行，写出输出：

```cpp
int sum = 0;
for (int i = 1; i <= 5; ++i) {
    if (i % 2 == 0) {
        continue; // 跳过偶数
    }
    sum = sum + i;
}
std::cout << sum << '\n';
```

<details>
<summary>核对答案</summary>

`1 % 2`、`3 % 2`、`5 % 2` 余数都是 1（奇数），`2` 和 `4` 被 `continue` 跳过。所以 `sum = 1 + 3 + 5 = 9`。

</details>

### 练习 2（找 Bug 并修复）

下面代码想找出 `1` 到 `10` 里所有能被 `3` 整除的数，但只打印了 `1` 个数字就结束了，找出原因：

```cpp
for (int i = 1; i <= 10; ++i) {
    if (i % 3 == 0) {
        std::cout << i << '\n';
        break;
    }
}
```

<details>
<summary>提示与答案</summary>

循环体里写了 `break;`，导致找到第一个能被 3 整除的 `3` 之后就立刻退出了整个 `for` 循环，漏掉了 `6` 和 `9`。删掉 `break;` 即可。

</details>

### 练习 3（手写循环表）

在练习 2 修好后，写出当 `i` 从 `1` 走到 `10` 时，屏幕依次打印出的所有数字。

<details>
<summary>核对答案</summary>

依次打印 `3`、`6`、`9`（各占一行）。

</details>

### 练习 4（独立手写）

写一个程序，用 `while (std::getline(std::cin, line))` 逐行读取输入，统计一共有多少行、其中包含多少个空行（`line.empty()`），遇到 `"END"` 时停止并输出统计结果。用 PowerShell 管道测试：`"a`n`nb`nEND" | .\你的程序.exe`。

<details>
<summary>参考写法</summary>

```cpp
#include <iostream>
#include <string>

int main() {
    int total = 0;
    int empty_lines = 0;
    std::string line;

    while (std::getline(std::cin, line)) {
        if (line == "END") {
            break;
        }
        ++total;
        if (line.empty()) {
            ++empty_lines;
        }
    }

    std::cout << "total=" << total << ", empty=" << empty_lines << '\n';
    return 0;
}
```

输入 `"a\n\nb\nEND"` 时输出 `total=3, empty=1`。

</details>
