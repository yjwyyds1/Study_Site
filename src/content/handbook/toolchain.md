---
title: "分清编译错误、链接错误与运行时调试"
description: "拆开 g++ 的预处理、编译、汇编与链接四步，理解头文件保护与单一定义规则（ODR），用 nm -C 看符号表，并在 CLion/GDB 用断点定位 Bug。"
order: 10
tags: ["C++20", "工具链", "编译与链接", "ODR", "调试"]
related: ["handbook/cpp-struct-file", "handbook/blank-program", "handbook/cmake-targets"]
sources: ["hello-minimal.cpp"]
---

## 本课只解决这 1 个问题

写 C++ 时经常遇到三类截然不同的失败：**代码写错了编不过**、**符号找不到或重复拼不成程序**、**程序能跑但算错了结果**。本课把 `g++` 背后的四道工序彻底拆开，看清头文件保护、**单一定义规则（ODR）**与符号表，再用断点直接抓出算错的那一行。

前置要求：已经跑通单文件程序（至少会用 `g++` 编译运行一个 `.cpp`）。

## 心智模型：四道工序才出一个可执行文件

你在终端敲 `g++ main.cpp -o main.exe` 时，工具链其实依次走了四步：

```text
源码 (.cpp + #include 的头文件)
   │  ① 预处理 (-E)：展开 #include、替换宏、处理 #ifndef → 得到纯净翻译单元 (.ii)
   ▼
   │  ② 编译 (-S)：词法/语法/类型检查，生成汇编文本 (.s)
   ▼
   │  ③ 汇编 (-c)：把汇编转成机器指令，打包成目标文件 (.o) ← 允许“只声明、未实现”
   ▼
   │  ④ 链接 (无额外阶段参数)：把多个 .o 与库拼起来，配对 U 与 T 符号 → 可执行文件 (.exe)
```

记住这张图，排错效率直接翻倍：
- **第 ①② 步失败（编译错误）**：拼写错、漏分号、类型不匹配、忘了 `#include`，此时连 `.o` 都不会生成。
- **第 ④ 步失败（链接错误）**：每个 `.cpp` 各自都能编成 `.o`，但最后拼装时要么**找不到定义**（`undefined reference to ...`），要么**定义了两份**（`multiple definition of ...`）。
- **四步全过，输出不对（逻辑 Bug）**：程序合法但思路有误，必须进调试器下断点看现场。

## 动手拆开四道工序与 `nm -C` 符号表

在练习目录（例如 `D:\cpp-study`）新建 `hello-minimal.cpp` 并写入下面的代码：

{{example:hello-minimal.cpp}}

按四步逐个观察中间产物：

```powershell
cd D:\cpp-study
g++ -std=c++20 -E hello-minimal.cpp -o hello-minimal.ii   # 1. 预处理：文件会膨胀到上万行
g++ -std=c++20 -S hello-minimal.ii -o hello-minimal.s     # 2. 编译：生成人类可读的汇编指令
g++ -std=c++20 -Wall -Wextra -Wpedantic -c hello-minimal.s -o hello-minimal.o  # 3. 汇编成 .o
g++ hello-minimal.o -o hello-minimal.exe                  # 4. 链接成可执行程序
.\hello-minimal.exe
```

平时开发用 `-c` 停在第三步，再统一链接即可；而 `-E` 是排查“宏展开到底长什么样、头文件有没有被真正包含”的终极手段。

### 用 `nm -C` 看穿 `.o` 里的符号账本

在 Linux 或 Git Bash / MSYS2 环境下，运行 `nm -C` 可以反修饰（demangle）并列出目标文件里的**符号表**（Windows PowerShell 若有 MinGW 的 `nm` 也可直接运行）：

```bash
nm -C link-demo.o
```

最常看的是这两类字母标记：

| 符号类型 | 含义 | 链接器在做什么 |
| --- | --- | --- |
| `T` | **Defined in Text section**：本 `.o` **自带函数体定义**（如 `main`） | 把这份实现提供给其他 `.o` 使用 |
| `U` | **Undefined**：本 `.o` **调用了但没看到定义**（如 `check_log()`） | 必须在其他 `.o` 或库里找到对应的 `T` |

## 只改一处的对比实验：亲手造“缺定义”与“违背 ODR”

### 实验 A：只声明不定义（`undefined reference`）

复制 `hello-minimal.cpp` 为 `link-demo.cpp`，在 `main` 上面加一行只有声明没有函数体的函数并调用它：

```cpp
#include <iostream>

void check_log(); // 只声明：告诉编译器“别慌，这个函数存在”

int main() {
    check_log();  // 产生一个 U (Undefined) 符号引用
    std::cout << "LogScan ready\n";
    return 0;
}
```

分两步执行：

```powershell
g++ -std=c++20 -c link-demo.cpp -o link-demo.o
g++ link-demo.o -o link-demo.exe
```

第 1 步 `-c` 安静通过；第 2 步链接报错 `undefined reference to 'check_log()'`。用 `nm -C link-demo.o` 会看到 `U check_log()` 无人认领。把顶部改成 `void check_log() {}` 补上函数体，`U` 就会变成 `T`，链接立刻成功。

### 实验 B：头文件保护 vs 单一定义规则（ODR）

很多初学者分不清**头文件保护**和 **ODR（One Definition Rule）**：
- **头文件保护（`#ifndef` vs `#pragma once`）**：只防**同一个 `.cpp`** 因间接 `#include` 把同一个头文件展开两次。`#ifndef MY_HPP` / `#define MY_HPP` / `#endif` 是 C++ 标准预处理器指令，任何编译器与符号链接下都 100% 可靠；`#pragma once` 写法简洁但属于非标准扩展，在硬链接/网络挂载同文件不同路径时偶有失效风险。
- **ODR（单一定义规则）**：整个程序链接在一起时，非内联的普通函数或全局变量**只能有一份定义**！

试着把一个**非 `inline`** 函数体直接写进 `helper.hpp`，并让 `a.cpp` 和 `b.cpp` 同时 `#include "helper.hpp"`：

```cpp
// helper.hpp（错误示范：非 inline 函数体放进头文件）
#pragma once
int double_it(int x) { return x * 2; }
```

**`a.cpp`：**

```cpp
// a.cpp
#include "helper.hpp"
int call_a() { return double_it(3); }
```

**`b.cpp`：**

```cpp
// b.cpp
#include "helper.hpp"
int call_a();
int main() { return call_a() + double_it(4); }
```

此时分别运行 `g++ -c a.cpp` 和 `g++ -c b.cpp` **都能通过**（因为 `#pragma once` 保护了各自单次展开），但执行 `g++ a.o b.o -o app.exe` 会在链接阶段炸出 **`multiple definition of 'double_it(int)'`**。用 `nm -C` 一眼就能看穿原因：

| 方案 | `nm -C a.o` 里的 `double_it` | `nm -C b.o` 里的 `double_it` | `nm -C helper.o` | 链接结果 |
| --- | --- | --- | --- | --- |
| 错误：函数体放 `.hpp` 无 `inline` | `T double_it(int)` | `T double_it(int)` | — | **失败：`multiple definition`** |
| 修复 1：声明留 `.hpp`，实现放 `helper.cpp` | `U double_it(int)` | `U double_it(int)` | `T double_it(int)` | **成功**（两处 `U` 配对唯一 `T`） |
| 修复 2：`inline int double_it(int x)` | `W double_it(int)`（弱/合并符号） | `W double_it(int)` | — | **成功**（链接器合并为一份） |

**两条正道修复方案总结**：
1. **声明与定义分离（工程首选）**：`helper.hpp` 只写 `int double_it(int x);`，建一个 `helper.cpp` 写函数体，编译成 `helper.o` 一起链接。
2. **头文件内联（适合短小工具函数）**：在函数前加 **`inline`**（`inline int double_it(int x) { return x * 2; }`）。`inline` 告诉链接器：“允许多个 `.o` 里出现完全相同的该定义，链接时合并为一份即可。”（C++17 起头文件里的共享常量也应使用 `inline constexpr`。）

## 工具链常见误区速查表

| 常见误区 | 典型症状 / 反例 | 正确做法 |
| --- | --- | --- |
| 以为 `#pragma once` 能防 ODR 冲突 | 两个 `.cpp` 都包含同一非 `inline` 头文件函数，链接报 `multiple definition` | 头文件保护只管单个翻译单元，跨 `.cpp` 共享实现必须拆 `.cpp` 或加 `inline` |
| 把头文件 `.hpp` 直接丢给 `g++` 编译 | 生成 `.hpp.gch` 预编译头，后续修改头文件后行为诡异 | 只把 `.cpp` 传给 `g++`；头文件靠 `#include` 参与编译 |
| 只编译一个 `main.cpp` 忘了链接其他 `.o` | `undefined reference` 指向你自己写的另一个 `.cpp` 里的函数 | 把所有 `.o` 一起链接，或在 `CMakeLists.txt` 中把目标源码列全 |
| 头文件里写 `int g_limit = 10;` | 和非 `inline` 函数一样在多文件包含时触发 `multiple definition` | 只读常量写 `inline constexpr int kLimit = 10;`，可变全局尽量避免 |

## 在 CLion / GDB 里用断点抓出逻辑 Bug

程序能编译能链接，但算错了数。不要满屏加 `cout`，用一份调试检查清单 1 分钟定位现场：

1. **普通断点与运行**：在 CLion 打开目录，在可疑行号旁左键单击点亮红点，点击右上角虫子图标 **Debug** 启动。
2. **条件断点（Conditional Breakpoint）**：如果循环要跑 1000 次而第 873 次才出错，右键红点填入条件（如 `i == 872` 或 `token == "ERROR:"`），程序会直接高速跳过前 872 次，精准停在案发现场。
3. **单步三件套**：
   - **Step Over (`F8`)**：把当前行（含函数调用）当作一步直接走完。
   - **Step Into (`F7`)**：钻进当前行调用的自己写的函数内部。
   - **Step Out (`Shift+F8`)**：从当前函数一口气跑完并返回上一层调用者。
4. **Variables 与 Watches（监视窗）**：在下方 **Variables** 看当前局部变量；对复杂表达式（如 `vec.size()`、`*ptr`），在 **Watches** 里点击 `+` 持续盯住它的变化。
5. **Call Stack / Frames（调用栈）**：左侧栈帧列表记录了“谁调用了谁”。点击上一帧可以立刻检查调用方传进来的参数是不是从源头就错了。

## 4 个微练习

### 练习 1（读报错判阶段）

遇到下面三条报错时，先判断它卡在“预处理/编译阶段”还是“链接阶段”：
1. `error: expected ';' before 'return'`
2. `undefined reference to 'parse_line(std::string const&)'`
3. `multiple definition of 'format_tag(int)'`

<details>
<summary>提示与参考答案</summary>

1. **编译阶段**：语法错误（`return` 前一行漏了分号 `;`）。
2. **链接阶段**：找不到函数体实现（忘了写定义，或漏了把定义所在的 `.o` 传给链接器）。
3. **链接阶段（违反 ODR）**：大概率是把非 `inline` 的 `format_tag` 函数体写在了被多个 `.cpp` 包含的头文件里。

</details>

### 练习 2（单文件声明缺失定位）

下面代码想打印 `3`，它会在 `-c` 编译阶段挂掉，还是在链接阶段挂掉？`nm -C` 会怎么标记 `add`？

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

它能通过 `-c` 编译（语法与类型完全合法），但会在**链接阶段**失败！用 `nm -C` 检查它的 `.o` 文件会看到 `U add(int, int)`。补上 `int add(int a, int b) { return a + b; }` 后再编译链接即可变成 `T` 并成功生成程序。

</details>

### 练习 3（亲手制造并修复 ODR 冲突）

新建临时文件夹，写 `math.hpp`（里面直接写 `int sq(int x) { return x * x; }`，**不加 `inline`**），再写 `f.cpp` 和 `main.cpp` 同时 `#include "math.hpp"`。先分别用 `g++ -c` 验证两者都能生成 `.o`，再合起来链接观察报错；最后用加 `inline` 和拆出 `math.cpp` 两种方式各修复一次。

<details>
<summary>参考命令与预期观察</summary>

```powershell
g++ -std=c++20 -c f.cpp -o f.o
g++ -std=c++20 -c main.cpp -o main.o
g++ f.o main.o -o app.exe   # 预期报错：multiple definition of `sq(int)'
```

在 `math.hpp` 加上 `inline int sq(int x)` 后重新编译链接即可通过；或者把 `math.hpp` 改为 `int sq(int x);` 并将函数体移到 `math.cpp`，链接时带上 `math.o`。

</details>

### 练习 4（独立操作四阶段）

用 `-E`、`-S`、`-c` 和链接四条独立命令把你自己写的 `cpp-struct-file.cpp` 走完一遍，打开 `.ii` 看一下文件行数，再在 CLion 中给结构体构造后设一个断点观察成员初始值。

<details>
<summary>参考命令</summary>

```powershell
g++ -std=c++20 -E cpp-struct-file.cpp -o struct-file.ii
g++ -std=c++20 -S struct-file.ii -o struct-file.s
g++ -std=c++20 -Wall -Wextra -Wpedantic -c struct-file.s -o struct-file.o
g++ struct-file.o -o struct-file.exe
.\struct-file.exe
```

</details>
