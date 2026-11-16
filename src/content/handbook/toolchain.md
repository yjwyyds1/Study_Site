---
title: "第一课：在 Windows 上构建和调试 C++20"
description: "从一个日志前缀判断出发，分清编译、链接和运行，再用 CLion 追踪一次判断出错的过程。"
order: 1
minutes: 35
tags: ["C++20", "工具链", "CMake", "CLion"]
related: ["handbook/lifetime", "labs/logscan", "notes/lab-notebook"]
sources: ["hello.cpp"]
---

## 先做成一件小事

目标是让程序认出一行日志的 `INFO ` 前缀。下载 `hello.cpp`，放进一个新的本地练习目录。读代码时先猜：这条日志会让程序打印 `true` 还是 `false`？留意前缀末尾的空格，它把级别和后面的正文分开。`std::string_view::starts_with` 是 C++20 提供的成员函数，这里正好用它验证工具链能编译本单元需要的代码。

{{example:hello.cpp}}

## 用终端构建并运行

在 PowerShell 中进入源码所在目录。下面两套命令任选一套：MinGW 用 `g++`；MSVC 用 `cl`，请在装好 C++ 工具后从开始菜单打开 **Developer PowerShell for VS**，再进入练习目录。

```powershell
g++ --version
g++ -std=c++20 -Wall -Wextra -Wpedantic hello.cpp -o hello.exe
if ($LASTEXITCODE -eq 0) { .\hello.exe }
```

```powershell
Get-Command cl
cl /nologo /std:c++20 /EHsc /W4 hello.cpp /Fe:hello-msvc.exe
if ($LASTEXITCODE -eq 0) { .\hello-msvc.exe }
```

预期输出是 `starts with INFO: true`。`.\` 指明运行当前目录里的程序；`$LASTEXITCODE` 是上一条外部程序的退出码，这里用它避免构建失败后误运行上一次留下的可执行文件。找不到命令时，先查当前终端能否找到编译器；找不到 `hello.cpp` 时，用 `Get-Location` 和 `Get-ChildItem` 确认目录与文件名。带空格的路径用引号括起来。

## 编译和链接各检查什么

从源码到程序，工具链先处理头文件等预处理指令，再编译、汇编得到目标文件，最后由链接器把目标文件和所需的库组成可执行文件。源文件里的声明能告诉编译器怎么调用一个函数；链接时还得找到那个函数的定义。用 `-c` 可以在目标文件处停下来：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic -c hello.cpp -o hello.o
if ($LASTEXITCODE -eq 0) { g++ hello.o -o hello-split.exe }
if ($LASTEXITCODE -eq 0) { .\hello-split.exe }
```

在练习目录把源码另存为 `diagnose.cpp`，用相同的两步命令，把输入、输出的文件名分别换成 `diagnose.cpp`、`diagnose.o`、`diagnose.exe`。先去掉 `is_info` 声明后的分号：`-c` 这一步就会报错，诊断可能指向它的下一行。补回分号，再在 `main` 前加上声明 `void logscan_marker();`，在 `main` 开头加一句 `logscan_marker();`，只留声明和调用。现在 `-c` 应成功，链接则会报 `undefined reference`。两种故障都可以只看构建输出，无须运行失败的产物。

## 观察与练习：在 CLion 里找错

假设需求仍是识别 `INFO `，但程序能正常构建，结果却变成了 `false`。你要在输出前找到第一个算错的值。把干净的 `hello.cpp` 复制到另一个练习目录，在旁边保存以下 `CMakeLists.txt`：

```cmake
cmake_minimum_required(VERSION 3.20)
project(logscan_warmup LANGUAGES CXX)
add_executable(hello hello.cpp)
target_compile_features(hello PRIVATE cxx_std_20)
set_target_properties(hello PROPERTIES CXX_EXTENSIONS OFF)
```

CMake 根据这份文件生成构建规则。`add_executable` 指定目标名和源码，`cxx_std_20` 要求该目标至少使用 C++20。实际编译和链接仍由所选工具链完成。

1. 在 CLion 用 **File → Open** 打开该目录。在 **Settings → Build, Execution, Deployment → Toolchains** 选择可用的 MinGW 工具链（可以用 CLion 随附的版本），确认构建工具、CMake、C++ 编译器和调试器均已识别。到同组的 **CMake** 页面确认或启用 **Debug** 构建配置，并让它使用所选工具链。
2. 只改练习副本，把 `starts_with("INFO ")` 写成 `starts_with("WARN ")`。先选中 Debug 配置下的 `hello` 目标，普通运行一次，记下实际输出。
3. 在 `const bool is_info = ...` 的行号旁单击设断点，点 **Debug**。暂停后先看 **Variables** 里的 `line`。用 **Step Over** 执行判断，在下一行检查 `is_info`。记下停住的行、两个变量的值、你认为该修哪处。继续执行，修复后重跑验证。

<details>
<summary>提示 1：确认你停在哪里</summary>

箭头指向的是接下来要执行的那行。在判断所在行停住时，先检查已经初始化的 `line`。

</details>

<details>
<summary>提示 2：缩小到一个表达式</summary>

单步后看 `is_info`。如果输入没变，比较代码传给 `starts_with` 的前缀和题目要求的前缀。

</details>

<details>
<summary>参考答案与验收</summary>

断点处应看到 `line` 为 `INFO ready`；单步后 `is_info` 为 `false`。判断检查的是 `WARN `，所以编译成功也会给出错误的业务结果。把参数改回 `"INFO "` 后，单步应看到 `true`，继续执行也应打印 `starts with INFO: true`。若断点没停，先确认本次构建成功、目标是 `hello`，并用 Debug 启动。

</details>

## 下一课

给自己留三条记录：一条编译诊断、一条链接诊断，以及断点处哪一个值偏离预期。下一课会把一行变成一组日志，追踪容器改动前后，同一个引用还能不能用。

## 参考资料

- [GCC 手册：构建阶段与 `-c`](https://gcc.gnu.org/onlinedocs/gcc/Overall-Options.html)
- [GCC 手册：`-std=` 语言版本](https://gcc.gnu.org/onlinedocs/gcc/C-Dialect-Options.html)
- [Microsoft：命令行编译 C++ 程序](https://learn.microsoft.com/en-us/cpp/build/walkthrough-compiling-a-native-cpp-program-on-the-command-line?view=msvc-170) · [Developer PowerShell](https://learn.microsoft.com/en-us/visualstudio/ide/reference/command-prompt-powershell?view=visualstudio) · [`/std:c++20` 选项](https://learn.microsoft.com/en-us/cpp/build/reference/std-specify-language-standard-version?view=msvc-170)
- [CMake：目标所需的编译特性](https://cmake.org/cmake/help/latest/command/target_compile_features.html)
- [JetBrains：工具链](https://www.jetbrains.com/help/clion/how-to-create-toolchain-in-clion.html) · [CMake 配置](https://www.jetbrains.com/help/clion/cmake-profile.html) · [启动调试和单步执行](https://www.jetbrains.com/help/clion/debugging-code.html)
- [C++20 工作草案 N4861：`string_view::starts_with`](https://timsong-cpp.github.io/cppwp/n4861/string.view.ops)
