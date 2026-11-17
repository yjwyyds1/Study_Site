---
title: "分清编译错误、链接错误与运行时调试"
description: "拆开 g++ 的编译和链接两步，亲手复现常见报错，并在 CLion 里用断点检查变量。"
order: 10
tags: ["C++20", "工具链", "编译与链接", "调试"]
related: ["handbook/cpp-struct-file", "handbook/blank-program", "handbook/cmake-targets"]
sources: ["hello-minimal.cpp"]
---

## 本课只解决这 1 个问题

写代码时经常遇到三种完全不同的失败：**代码写错了编不过**、**函数找不到拼不成程序**、**程序能跑但算错了结果**。本课学会一眼分清这三件事，并用断点找出算错的那一行。

前置要求：已经跑通第 1 阶段前的单文件程序（至少会用 `g++` 编译运行一个 `.cpp`）。

## 心智模型：两道关卡才出一个 `.exe`

你敲 `g++ main.cpp -o main.exe` 时，工具链其实默默做了两件大事：

```text
源码 (.cpp + #include 的头文件)
   │  ① 编译（-c）：检查语法和类型，把每个 .cpp 翻译成机器指令碎片
   ▼
目标文件 (.o)   ← 此时允许“只声明、还没看到函数体”
   │  ② 链接：把所有 .o 拼起来，把调用和函数体真正接上
   ▼
可执行文件 (.exe)  ← 到这一步才能运行
```

记住这个区别，排错效率直接翻倍：
- **第 ① 步失败（编译错误）**：通常是拼写错、漏分号、类型不匹配、忘了 `#include`。
- **第 ② 步失败（链接错误）**：代码语法全对，但你调用了一个**只写了声明、没写实现（函数体）**的函数，常见提示是 `undefined reference to ...`。
- **前两步都过，结果不对（逻辑 Bug）**：需要用调试器打断点，一行行看变量值。

## 动手拆开“编译”和“链接”

把 `hello-minimal.cpp` 下载到练习目录，在 PowerShell 里故意用 `-c` 停在第一步：

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic -c hello-minimal.cpp -o hello-minimal.o
g++ hello-minimal.o -o hello-minimal.exe
.\hello-minimal.exe
```

第 1 条命令只做编译，生成 `hello-minimal.o`（此时还不能运行）；第 2 条命令把 `.o` 链接成 `.exe`；第 3 条运行它，屏幕打印 `LogScan ready`。

## 只改一处的对比实验：亲手造一次“编译过、链接挂”

复制一份 `hello-minimal.cpp` 改名为 `link-demo.cpp`，在 `main` 上面加一行**只有声明没有函数体**的函数，并在 `main` 里调用它：

```cpp
#include <iostream>

void check_log(); // 只声明：告诉编译器“有这个函数”

int main() {
    check_log();  // 调用它
    std::cout << "LogScan ready\n";
    return 0;
}
```

分两步执行：

```powershell
g++ -std=c++20 -c link-demo.cpp -o link-demo.o
g++ link-demo.o -o link-demo.exe
```

你会看到：**第 1 步（`-c` 编译）安静通过，生成了 `link-demo.o`**；但**第 2 步（链接）报错 `undefined reference to check_log()`**。因为编译器只负责检查“调用写法对不对”，链接器才负责去找 `check_log` 的函数体到底在哪。

把顶部的 `void check_log();` 改成 `void check_log() {}`（补上空函数体作为定义），再跑这两条命令，链接立刻成功。

<details>
<summary>深入一步：预处理与汇编（平时排错很少需要手动停在这里）</summary>

在 `-c` 内部其实还细分为：预处理（展开 `#include`）→ 编译（生成汇编文本）→ 汇编（生成 `.o` 目标文件）。在 CMake 多文件课程里，你会看到把多个 `.cpp` 各自编成 `.o` 再统一链接的工程做法。

</details>

## 在 CLion 里用断点抓出逻辑 Bug

假设程序能编译能链接，但输出不对。不要靠猜，用 CLion 调试器停下来看现场：

1. 在 CLion 打开你的练习目录（只要目录里有 `hello-minimal.cpp`，哪怕暂时没有 `CMakeLists.txt`，也可以用 **Open** 打开并在文件左侧绿色箭头运行）。
2. 在 `main` 里的某一行行号旁边**单击鼠标左键**，出现一个红点，这就是**断点**（程序跑到这一行之前会暂停）。
3. 点击右上角的虫子图标 **Debug** 启动。
4. 程序停住后，看下方 **Variables** 窗口里的当前变量值，按 **Step Over（F8）** 往下走一行，观察变量在执行前后怎么变化。

## 3 个微练习

### 练习 1（读报错归类）

遇到下面两条报错时，先判断它卡在“编译阶段”还是“链接阶段”：
1. `error: expected ';' before 'return'`
2. `undefined reference to 'parse_line(std::string const&)'`

<details>
<summary>核对答案</summary>

1. **编译阶段**：语法错误（`return` 前面那行漏了分号 `;`）。
2. **链接阶段**：找不到 `parse_line` 的函数体实现（可能是忘了写函数体，或多文件时漏了把对应 `.cpp` 一起编译链接）。

</details>

### 练习 2（找 Bug 并修复）

下面代码想打印 `3`，为什么连编译都过不了？

```cpp
#include <iostream>

int add(int a, int b);

int main() {
    std::cout << add(1, 2) << '\n';
    return 0;
}
```

<details>
<summary>提示与答案</summary>

它能过编译（`-c` 会成功），但会在**链接阶段**失败！因为 `add` 只写了声明，没有写函数体。补上 `int add(int a, int b) { return a + b; }` 即可。

</details>

### 练习 3（独立操作）

用 `g++ -c` 把你自己写的第 5 课 `cpp-struct-file.cpp` 先编成 `struct-file.o`，再链接成 `struct-file.exe` 并运行，确认输出和单条命令时完全一致。

<details>
<summary>参考命令</summary>

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic -c cpp-struct-file.cpp -o struct-file.o
g++ struct-file.o -o struct-file.exe
.\struct-file.exe
```

</details>
