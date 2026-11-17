---
title: "第 0 课：在 Windows 上搭好 C++20 环境"
description: "检查或安装 MinGW g++ 编译器、解决终端找不到命令和中文乱码，跑通人生第一行 C++ 代码。"
order: 0
tags: ["C++20", "零基础", "环境搭建", "PowerShell"]
related: ["handbook/cpp-basics", "handbook/toolchain"]
sources: ["cpp-setup.cpp"]
---

## 本课只解决这 1 个问题

写代码前最劝退的一步，不是语法，而是“打开电脑不知道去哪写、按了运行没反应、或者终端一片中文乱码”。本课只做一件事：**在你的 Windows 电脑上确认编译器可用、解决中文乱码，并亲手编译运行出第一行文字。**

本课不需要任何编程基础。

## 第一步：确认你电脑上有没有 `g++` 编译器

C++ 代码是给人看的文本，电脑 CPU 不能直接运行，必须先由**编译器**（我们用 `g++`）把它翻译成 `.exe` 可执行文件。

打开 Windows **PowerShell**（按 `Win` 键，输入 `PowerShell` 回车），输入下面这行命令检查：

```powershell
g++ --version
```

会出现两种情况：
- **情况 A**：打印出了版本号（例如 `g++ (x86_64-posix-seh...) 13.x.x`）。说明你已经装好了，直接跳到[第二步](#第二步建立干净的练习目录)。
- **情况 B**：提示 `g++ : 无法将“g++”项识别为 cmdlet、函数、脚本文件或可运行程序的名称`。

如果你是**情况 B**，最快有两种方式拿到 `g++`：
1. **如果你已经装了 CLion**：CLion 自带了 MinGW，通常在 `D:\CLion\bin\mingw\bin` 或 `C:\Program Files\JetBrains\CLion ...\bin\mingw\bin`。你可以在 PowerShell 里先临时测试它是否存在，或把它加进系统环境变量 `Path`：
   - 按 `Win` 键搜索“编辑系统环境变量” → 点“环境变量” → 在“用户变量”里找到 `Path` 点编辑 → 点“新建”，把包含 `g++.exe` 的 `...\mingw\bin` 路径贴进去 → 一路确定，**然后重开一个 PowerShell 窗口**再试 `g++ --version`。
2. **如果你还没装任何工具**：推荐直接安装 **CLion**（自带编译器、调试器和 CMake，后面工程课也会用到），或者用 Windows 包管理器一行安装 MinGW：`winget install -e --id BrechtSanders.WinLibs.POSIX.UCRT`（装完后同样需要重开 PowerShell）。

## 第二步：建立干净的练习目录

不要把代码直接丢在桌面或中文路径很深的目录里，容易遇到路径空格或编码麻烦。在 `D:` 盘建一个专门的英文练习文件夹，并把页首的 `cpp-setup.cpp` 下载放进去：

```powershell
New-Item -ItemType Directory -Path D:\cpp-study -Force
cd D:\cpp-study
dir
```

执行 `dir` 后，你应该能看到 `cpp-setup.cpp`。**特别注意一个新手高频坑**：如果你是用记事本新建的文件，Windows 默认会隐藏已知扩展名，你可能以为存成了 `cpp-setup.cpp`，实际文件名是 `cpp-setup.cpp.txt`！在 `dir` 的输出里一眼就能看出来。

## 第三步：编译、运行，并解决中文乱码

先看看 `cpp-setup.cpp` 里的内容，一共只有 7 行：

{{example:cpp-setup.cpp}}

| 代码 | 它在干嘛 |
| --- | --- |
| `#include <iostream>` | 引入标准输入输出工具（没有它就用不了 `std::cout`） |
| `int main() {` | 程序入口，电脑启动 `.exe` 时固定从这里开始往下执行 |
| `std::cout << "...\n";` | 把引号里的文字送到屏幕；`\n` 代表换行 |
| `return 0;` | 告诉系统“程序正常结束了” |

在 PowerShell（确保你当前在 `D:\cpp-study`）运行下面两条命令：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-setup.cpp -o cpp-setup.exe
.\cpp-setup.exe
```

这串参数的意思：
- `-std=c++20`：使用现代 C++20 标准。
- `-Wall -Wextra -Wpedantic`：打开严格警告，代码有隐患时提前提醒你。
- `-o cpp-setup.exe`：指定生成的程序文件名。

**如果屏幕第二行打印的中文变成了乱码（例如 ``）**：
这是因为你的源码文件是 UTF-8 编码，而 Windows 旧版终端默认用 GBK 编码显示。在当前 PowerShell 窗口先执行一次切换 UTF-8 代码页的命令，再重跑程序即可：

```powershell
chcp 65001
.\cpp-setup.exe
```

正常输出应为：

```text
Hello, C++20!
环境已就绪，可以开始写代码了。
```

## 常见卡点自查表

| 现象 | 最常见原因 | 怎么修 |
| --- | --- | --- |
| `g++: No such file or directory` | 终端当前目录不在 `D:\cpp-study`，或文件名存成了 `.cpp.txt` | 运行 `pwd` 看当前目录，运行 `dir` 看真实文件名 |
| 运行时提示 `无法将 cpp-setup.exe 识别为...` | 漏掉了前面的 `.\` | PowerShell 运行当前目录程序必须写 `.\cpp-setup.exe` |
| 改了代码再运行，输出却没变 | 忘了重新执行 `g++ ...` 编译，跑的还是上次的旧 `.exe` | 每次改完 `.cpp` 必须先重新编译再运行 |

## 2 个热身练习

### 练习 1（改文字并验证重编译）

把 `cpp-setup.cpp` 里的 `"Hello, C++20!\n"` 改成你的名字和今天的日期，保存后**只运行 `.\cpp-setup.exe`** 看输出变没变；然后再执行 `g++` 重新编译并运行，体会“源码必须重新编译才能生效”。

### 练习 2（故意制造一次编译报错）

把 `return 0;` 末尾的分号 `;` 删掉，重新执行 `g++` 命令，仔细看终端打印的红色错误信息（`error: expected ';' before '}' token`）。认识编译报错长什么样，以后就不会慌。
