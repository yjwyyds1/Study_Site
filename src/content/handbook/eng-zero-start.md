---
title: "第 0 课（零基础）：终端、Shell、编译排错与编辑器工作流"
description: "零基础彻底打通终端与 Shell、工作目录与路径解析、环境变量 PATH、标准流与重定向、退出码短路链、g++/clang++/cl 编译参数、前 6 类高频编译链接报错拆解，以及 compile_commands.json 与 .editorconfig。"
order: 38
tags: ["零基础", "终端", "PowerShell", "Bash", "PATH", "编译与链接", "compile_commands.json"]
related: ["handbook/cpp-setup", "handbook/toolchain", "handbook/command-line-git"]
sources: ["hello-minimal.cpp", "sample.log"]
---

> **🔑 跨学科前置钥匙卡**（[查看完整跨学科路线图](../../roadmap/)）
> - **零门槛直入范围**：本课（终端、工作目录、`PATH`、重定向、编译参数与报错拆解）及 `Git` 基础**完全零前置**，随时开看！
> - **进阶去隔壁拿的钥匙**：拆 CMake 多文件库时，需先了解 [现代 C++：头文件、命名空间与 ODR（CPP-11）](../cpp-headers-modules/)。
>
> <details><summary>📚 本科已为你融合的全球 TOP 5 经典精华（无需再买书/翻英文站）</summary>
>
> 1. **MIT Missing Semester**：Shell 终端效率、`PATH` 环境变量、标准流重定向与排错思维
> 2. **《Pro Git》+ Learn Git Branching**：三棵树快照模型、分支指针、冲突三步拆解与 `reflog` 后悔药
> 3. **Modern CMake +《Professional CMake》**：Target 目标化与 `PUBLIC/PRIVATE/INTERFACE` 属性传播
> 4. **Beej's GDB Guide + Sanitizers 文档**：WSL 下 GDB 5 分钟核心命令与 ASan/UBSan/TSan 栈读法
> 5. **GoogleTest Primer + CTest 实战指南**：单测夹具隔离与 CLI 退出码/`stdout`/`stderr` 回归锁死
>
> </details>

## 本篇解决的核心问题（ENG-01 ~ ENG-08）

刚入门 C++ 时，绝大多数卡顿并不在语法本身，而在于操作系统和工具链的“黑盒”：

1. 黑窗口到底是什么？PowerShell 和 Bash 为什么语法不一样？（**ENG-01**）
2. 明明文件就在硬盘上，为什么程序说找不到？（**ENG-02**）
3. 明明装了 `g++` 或 `cmake`，为什么终端还是提示“找不到命令”？（**ENG-03**）
4. 为什么程序输出能存进文件，报错却还是打在屏幕上？（**ENG-04**）
5. 怎么让多条命令按成败自动串起来跑？（**ENG-05**）
6. `g++`、`clang++`、`cl` 的 `-std=c++20 -Wall -Wextra -Wpedantic` 各自在管什么？（**ENG-06**）
7. 满屏英文红字报错怎么从第一行抓出真正原因？（**ENG-07**）
8. 为什么编译器能编过，VS Code / CLion 却满屏画红波浪线？（**ENG-08**）

---

## 一、Terminal vs Shell：看清“窗口”和“翻译官” (ENG-01)

新手常把“黑窗口”统称为终端，其实里面住着两个完全不同的程序：

```text
+-------------------------------------------------------------------+
|  Terminal Emulator（终端模拟器：负责画窗口、显示文字、接收键盘鼠标）   |
|  例如：Windows Terminal / macOS Terminal / GNOME Terminal / VSCode |
|                                                                   |
|    +-----------------------------------------------------------+  |
|    |  Shell（命令行解释器：真正读懂你的命令并启动进程的大管家）     |  |
|    |  例如：PowerShell (pwsh) / Bash (/bin/bash) / Zsh         |  |
|    +-----------------------------------------------------------+  |
+-------------------------------------------------------------------+
```

- **Terminal（终端模拟器）**：只负责“门面”——字体、配色、复制粘贴、分屏，并把按键字节传给里面运行的 Shell，再把 Shell 的输出画成字符。它**不懂** `cd`、`ls`、`g++` 是什么意思。
- **Shell（命令解释器）**：才是真正干活的大脑。当你敲下一行命令按回车时，Shell 依次完成四件事：
  1. **分词（Tokenization）**：按空白字符把一行字切成“命令名 + 参数列表（`argv`）”。
  2. **引号与转义处理**：决定哪些空格属于路径内部，哪些变量需要替换。
  3. **查找命令**：判断它是 Shell 内建命令（如 `cd`）、函数/别名，还是磁盘上的外部可执行程序（如 `g++`）。
  4. **创建子进程并等待退出**：把整理好的 `argv` 数组交给操作系统启动程序，并在程序结束时收回退出码。

### PowerShell vs Bash 核心差异速查

| 对比项 | PowerShell（Windows 默认） | Bash（Linux / WSL2 / Git Bash） | 常见踩坑 |
| --- | --- | --- | --- |
| 注释符号 | `# 注释` | `# 注释` | 无 |
| 原样字符串（不展开变量） | `'C:\path\to\file'` | `'/path/to/file'` | 单引号里不要指望 `$var` 会替换 |
| 可展开变量的字符串 | `"Hello $env:USER"` | `"Hello $USER"` | 路径含空格时**必须加引号** |
| 转义字符 | 反引号 `` ` ``（因为 `\` 是路径分隔符！） | 反斜杠 `\` | 在 PowerShell 写 `\n` 不代表换行，`` `n `` 才是 |
| 查看变量 / 环境变量 | `$var` / `$env:PATH` | `$var` / `$PATH` | PowerShell 不写 `$env:` 就读普通变量 |
| 命令历史与清屏 | `Clear-Host`（别名 `cls`） | `clear`（或 `Ctrl+L`） | 无 |
| 别名陷阱 | `ls`、`cat`、`curl` 其实是 PowerShell Cmdlet 别名 | `ls`、`cat`、`curl` 是独立 GNU 工具 | PowerShell 里 `cat` 是 `Get-Content`，参数完全不同！ |

> **1 行反例提醒**：在终端里写 `cat my logs/sample.log` 而不加引号，Shell 会按空格把它切碎成两个参数 `argv[1] = "my"` 和 `argv[2] = "logs/sample.log"`，结果两条路径全报错。**凡是包含空格或可能含空格的路径，一律用引号包住！**

---

## 二、当前工作目录与绝对／相对路径 (ENG-02)

每个运行中的程序（包括终端本身和你编译出来的 C++ 程序）都有一个内部属性，叫**当前工作目录（Current Working Directory，简称 `cwd`）**。你可以把它理解成“你此刻站在哪间屋子里”。

- **源码目录**：`.cpp` 文件躺在硬盘上的位置。
- **可执行文件目录**：`.exe`（或 Linux 无后缀二进制）躺在硬盘上的位置。
- **当前工作目录（`cwd`）**：你敲运行命令时“人站的位置”。

**致命误区**：很多人以为 `./sample.log` 是“相对于源码文件”找文件，或者“相对于 `.exe` 所在目录”找文件。**全错！** 操作系统解析任何相对路径（如 `sample.log`、`./data/a.txt`、`../build`），起点永远是进程的 **`cwd`**！

### 绝对路径 vs 相对路径

| 路径类型 | 写法示例（Windows / Linux） | 解析起点 | 特点 |
| --- | --- | --- | --- |
| **绝对路径** | `D:\cpp-study\sample.log` / `/home/alice/cpp/sample.log` | 磁盘盘符或根目录 `/` | 无论 `cwd` 在哪，指向同一份文件 |
| **相对路径 `.`** | `./sample.log` 或 `.\sample.log` | 当前工作目录 `cwd` | `.` 代表“当前目录” |
| **相对路径 `..`** | `../include/foo.hpp` | `cwd` 的上一级父目录 | `..` 代表“往上一层” |
| **家目录缩写 `~`** | `~/cpp-study` | 当前用户的 Home 目录 | 由 **Shell** 展开；写进 C++ `ifstream("~/a.txt")` 不会展开！ |

### 跨平台路径踩坑清单

1. **斜杠方向**：Linux 只认正斜杠 `/`；Windows API 与 PowerShell 绝大部分时候同时接受 `/` 和 `\`，但在 C++ 代码字符串里 `\` 是转义符（`"C:\new\test.txt"` 会把 `\n` 当换行、`\t` 当制表符！），因此 C++ 代码和 CMake 里推荐统一写正斜杠 `/` 或原始字符串 `R"(D:\new\test.txt)"`。
2. **大小写敏感性**：Windows NTFS 默认**不区分**大小写，`#include "Sample.hpp"` 能找到 `sample.hpp`；Linux ext4 **严格区分**大小写，同一段代码放到 Linux 或 GitHub Actions CI 上会直接报错 `No such file or directory`。
3. **PowerShell 通配符 `[` `]` 坑**：在 PowerShell 中如果文件夹名带方括号（如 `test[1]`），`cd '.\test[1]'` 会把 `[1]` 当成通配符而失败，必须使用 `-LiteralPath`：

```powershell
# PowerShell 查看与切换目录
Get-Location                              # 别名 pwd，查看当前站在哪个目录
Set-Location -LiteralPath 'D:\cpp study'  # 别名 cd，-LiteralPath 防止方括号被当通配符
Get-ChildItem                             # 别名 ls / dir，列出当前目录内容
```

```bash
# Linux / WSL2 Bash 查看与切换目录
pwd
cd '/mnt/d/cpp study'    # WSL2 中 Windows 的 D: 盘挂载在 /mnt/d/ 下
ls -la                   # 列出所有文件（含以 . 开头的隐藏文件）
```

---

## 三、环境变量与 `PATH` 搜索机制 (ENG-03)

**环境变量（Environment Variables）** 是操作系统在启动每个进程时附带的一张 `KEY=VALUE` 字符串配置表。子进程默认会继承父进程（Shell）的环境变量，但子进程修改自己的变量**不会反向影响**父进程。

其中最重要的一条环境变量叫 **`PATH`**——它本质上是一份“程序通讯录”，由多个文件夹路径拼成：
- Windows 用分号 `;` 分隔：`C:\msys64\ucrt64\bin;C:\Program Files\Git\cmd;...`
- Linux / macOS 用冒号 `:` 分隔：`/usr/local/bin:/usr/bin:/bin`

当你在终端输入 `g++` 并按回车时，Shell 的查找顺序是：
1. 若输入带了路径分隔符（如 `./hello` 或 `D:\tools\g++.exe`），**直接去该路径找**，不查 `PATH`。
2. 若输入只是一个名字（如 `g++`），按 `PATH` 从左到右依次扫描每个文件夹，**找到第一个匹配的就停下来执行**；全扫完都没有，就报 `command not found`（或 PowerShell 的“无法将 `g++` 项识别为 cmdlet、函数、脚本文件或可运行程序的名称”）。

> **重点**：Linux / macOS 的 `PATH` 默认**不包含当前目录 `.`**（出于安全考量，防止你在他人目录下运行 `ls` 时误触发恶意同名程序），因此编译出 `hello` 后，必须写 `./hello` 才能运行！

### 常用环境变量诊断命令

```powershell
# PowerShell
$env:PATH -split ';'                         # 把 PATH 按分号分行打印，看清所有目录顺序
Get-Command g++ -All                         # 查出 PATH 里所有叫 g++ 的程序（第 1 个会被优先执行）
$env:MY_FLAG = "1"                           # 仅在当前终端会话临时设置环境变量
```

```bash
# Bash
echo "$PATH" | tr ':' '\n'                   # 把 PATH 按冒号分行打印
which -a g++                                 # 列出 PATH 中所有 g++（确认没被旧版本遮蔽）
export MY_FLAG=1                             # 设置并导出给后续启动的子进程（如 cmake / g++）
env | grep MY_FLAG                           # 检查是否已在环境中生效
```

**典型遮蔽（Shadowing）事故**：电脑上同时装了 Strawberry Perl 自带的旧版 `g++` 和 MSYS2 的新版 `g++ 14`，如果旧版目录排在 `PATH` 更靠前的位置，终端每次调用的都是旧版！用 `Get-Command g++ -All` / `which -a g++` 一眼就能抓出来。

---

## 四、标准流（`stdin` / `stdout` / `stderr`）与重定向 (ENG-04)

每个启动起来的操作系统进程，都会自动打开三条编号固定的字节通道（文件描述符 File Descriptor）：

| 编号（fd） | 名称 | C++ 对应对象 | 默认去向 | 工程职责 | 缓冲行为 |
| --- | --- | --- | --- | --- | --- |
| `0` | **标准输入（`stdin`）** | `std::cin` | 键盘 | 接收待处理的文本/数据 | 行缓冲/交互 |
| `1` | **标准输出（`stdout`）** | `std::cout` | 终端屏幕 | 输出正常结构化结果 | 接终端时行缓冲；重定向到文件时**全缓冲** |
| `2` | **标准错误（`stderr`）** | `std::cerr` | 终端屏幕 | 输出报错、告警、进度诊断 | **无缓冲**（立刻打印，崩溃前也能看见） |

为什么必须把正常结果（`stdout`）和报错信息（`stderr`）彻底分开？因为命令行程序经常被串联成流水线：一旦你把 `"cannot open file"` 错误打进 `std::cout`，下游脚本就会把它当成正常数据去解析！

### 重定向（Redirection）与管道（Pipe）实战

```bash
# 1. 只把正常结果写入 out.txt（覆盖），报错依然留在屏幕上
./logscan sample.log > out.txt          # 等价于 1> out.txt

# 2. 追加写入（>>），不清空原文件
./logscan sample.log >> out.txt

# 3. 分离两个通道：正常进 out.txt，报错进 err.txt
./logscan missing.log 1> out.txt 2> err.txt

# 4. 把 stderr 合并到 stdout 后一起存盘（注意顺序：先改 1 再让 2 指向 1！）
./logscan sample.log > all.log 2>&1

# 5. 丢弃不需要的输出（黑洞文件）
./logscan missing.log 2> /dev/null      # PowerShell 用 2> $null

# 6. 从文件喂给标准输入（<），或用管道把前一个程序的 stdout 接给后一个的 stdin（|）
./classify < sample.log
echo "ERROR disk full" | ./classify
```

> **1 行反例提醒**：在 Bash 里写 `./app 2>&1 > all.log` 是**错的**！Shell 从左到右解析重定向：`2>&1` 先把 `2` 绑到了“当时的屏幕”，随后 `> all.log` 才把 `1` 改去文件，导致报错依然打在屏幕上。正确写法永远是 **`> all.log 2>&1`**（或 Bash 4+ 简写 `&> all.log`）。

---

## 五、退出码（Exit Code）与条件短路链 `&&` / `||` (ENG-05)

程序结束运行时，会通过 `main()` 的 `return` 值（或 `std::exit(code)`）向父进程交回一个 `0 ~ 255` 的整数，称为**退出码（Exit Code）**：

- **`0`**：一切成功（Success）。
- **非 `0`**：失败（Failure）。常见约定：`1` 为一般运行错误（如文件打不开），`2` 为命令行参数用法错误，`126` 权限不足无法执行，`127` 找不到命令，`128 + N` 被信号 `N` 杀死（如 `139 = 128 + 11` 代表 `SIGSEGV` 段错误）。

> **PowerShell 致命陷阱**：在 Bash 中 `$?` 是上一条命令的整数退出码（`0`/`1`...）。但在 **PowerShell** 中，`$?` 只是一个布尔值（`True`/`False`），真正保存外部程序（`g++`、`cmake`、`.\app.exe`）数字退出码的自动变量是 **`$LASTEXITCODE`**！而且只要紧接着多敲一行别的命令，`$LASTEXITCODE` 就可能被覆盖，所以**必须立刻读取或保存**。

### 用 `&&` 和 `||` 编排命令链

在自动化脚本和 CI 里，你绝不希望“编译都报错了，还继续运行旧的 `.exe` 假装测试通过”：

- **`A && B`（逻辑与，短路成功）**：只有当 `A` 返回 `0` 时，才执行 `B`。只要 `A` 失败，整条链立刻停下并把非零退出码传出来。
- **`A || B`（逻辑或，短路失败）**：只有当 `A` 返回**非 `0`** 时，才执行兜底命令 `B`。

```bash
# Bash（PowerShell 7+ 也同样支持 && 和 ||）
g++ -std=c++20 -Wall -Wextra -Wpedantic hello-minimal.cpp -o hello && ./hello
# 编译失败时，后面的 ./hello 绝不会执行！

./check_env || echo "环境检查失败，请检查 PATH"
```

如果是 Windows 自带的老版本 PowerShell 5.1（不支持 `&&`），应使用显式检查：

```powershell
g++ -std=c++20 hello-minimal.cpp -o hello.exe
if ($LASTEXITCODE -ne 0) { throw "Build failed with exit code $LASTEXITCODE" }
.\hello.exe
```

> **Bash 管道坑**：执行 `cmd1 | cmd2` 时，默认整条管道的退出码取决于**最后一条命令 `cmd2`**，即使 `cmd1` 崩溃了也可能返回 `0`。写 Bash 自动化脚本时务必在开头加上 `set -euo pipefail`。

---

## 六、调用编译器（`g++`/`clang++`/`cl`）与核心告警参数 (ENG-06)

把 `.cpp` 变成可执行文件，需要经过**预处理（`-E`）→ 编译为汇编（`-S`）→ 汇编为目标文件（`-c`）→ 链接（Link）**四个阶段。日常一条 `g++ main.cpp -o app` 其实是“编译器驱动（Driver）”帮你连续跑完了全部四步。

在独立练习目录新建 `hello-minimal.cpp`，写入下面的示例源码：

{{example:hello-minimal.cpp}}

### 三大编译器等价参数对照表

| 作用 | GCC (`g++`) / Clang (`clang++`) | MSVC (`cl.exe`，Windows VS 开发者命令行) | 为什么要加？ |
| --- | --- | --- | --- |
| 指定语言标准 | `-std=c++20` | `/std:c++20` | 启用 `starts_with`、`std::span`、Concepts 等 C++20 特性 |
| 开启基础与扩展告警 | `-Wall -Wextra -Wpedantic` | `/W4 /permissive-` | 抓出未初始化、有符号/无符号混比、非标准扩展、无用变量 |
| 隐式窄化告警 | `-Wconversion` | `/W4`（部分覆盖） | 防止 `double` 或 `size_t` 悄悄截断塞进 `int` |
| 将告警视为编译失败 | `-Werror` | `/WX` | **仅推荐在 CI 中开启**，逼团队清零所有警告 |
| 生成调试符号 | `-g` | `/Zi`（配合 `/DEBUG` 链接） | 让 GDB/LLDB 能显示源码行号与局部变量名 |
| 优化等级 | `-O0`（调试）/ `-O2`（发布） | `/Od`（调试）/ `/O2`（发布） | 调试用 `-O0` 防变量被优化消失；上线用 `-O2` |
| 只编译不链接 | `-c`（输出 `.o`） | `/c`（输出 `.obj`） | 拆分多文件工程时先各自编译，再统一链接 |
| 指定输出文件名 | `-o app` | `/Fe:app.exe` | 不加 `-o` 时 GCC/Clang 会生成让人摸不着头脑的 `a.out` / `a.exe` |
| 添加头文件搜索目录 | `-I./include` | `/I include` | 让 `#include "prefix.hpp"` 能找到子目录里的头文件 |

```bash
# 推荐的个人日常单文件编译基线（Linux / WSL2 / MinGW）
g++ -std=c++20 -Wall -Wextra -Wpedantic -g hello-minimal.cpp -o hello-minimal
./hello-minimal
echo $?
```

> **1 行反例提醒**：永远不要裸跑 `g++ main.cpp` 而不加 `-std=c++20 -Wall -Wextra -Wpedantic`！许多老版本 GCC 默认还停留在 C++14/C++17，且默认不报 `if (a = 1)`、漏 `return` 语句等致命隐患。

---

## 七、解码你的前 6 类高频编译与链接报错 (ENG-07)

看报错的铁律：**从第一条 `error:` 看起，永远不要从最后一条倒着看！** 第一处语法缺失（如漏分号）常会把编译器后续解析完全带偏，引发几十行“雪崩式连带报错”。

每条标准 GCC/Clang 诊断由四部分组成：`文件:行号:列号: 级别(error/warning): 原因描述` + 源码定位波浪线 `^~~~`。

| 编号 | 报错阶段 | 典型报错关键词 | 真实病因 | 10 秒修复法 |
| --- | --- | --- | --- | --- |
| **1** | 编译（语法） | `error: expected ';' before ...` 或 `expected '}'` | **上一行**末尾漏写分号 `;`，或大括号/圆括号没配对 | 往报错行**上面一两行**找漏掉的 `;` 或 `}` |
| **2** | 编译（名字查找） | `error: '...' was not declared in this scope` | 拼写错误、变量定义在使用之后、或漏写了 `std::` | 核对大小写、`std::` 前缀，确认作用域 `{}` 是否提前结束 |
| **3** | 预处理/编译 | `fatal error: ...: No such file or directory` 或 `incomplete type` | 头文件名拼错、缺 `-I` 搜索路径，或只做了前置声明未 `#include` | 检查拼写与大小写，补 `#include <...>` 或 `-I include` |
| **4** | 编译（类型系统） | `error: cannot convert ...` / `discards qualifiers` | 类型不匹配，或把 `const` 对象传给了非 `const` 引用参数 | 核对函数签名；只读参数一律改为 `const T&` 或 `std::string_view` |
| **5** | **链接（缺定义）** | `undefined reference to 'foo()'` / `LNK2019` | 头文件里有声明所以 `-c` 编译过了，但**链接时没传实现所在的 `.cpp`/`.o`/库** | 补齐函数体，或把第二个 `.cpp` / 库加进编译和链接命令 |
| **6** | **链接（重复定义）** | `multiple definition of 'foo()'` / `LNK2005` | 违反单一定义规则（ODR）：把非 `inline` 函数体直接写进了被多个 `.cpp` 包含的 `.hpp` | 只把声明留 `.hpp`，函数体移去 `.cpp`（或标为 `inline`） |

### 现场拆解最容易把新手搞晕的第 5 类与第 6 类报错

假设 `main.cpp` 调用了 `greet()`，而 `greet()` 写在 `helper.cpp` 里：

```bash
# ❌ 只编译了 main.cpp 去生成可执行文件：
g++ -std=c++20 main.cpp -o app
# 报错：
# /usr/bin/ld: /tmp/ccXYZ.o: in function `main':
# main.cpp:(.text+0x12): undefined reference to `greet()'
# collect2: error: ld returned 1 exit status
```

注意报错进程名不再是 `g++` 的语法前端，而是 **`/usr/bin/ld`（链接器）** 和 `collect2`！看到 `ld` 或 `LNK2019`，立刻反应过来：**语法全对，不要再死盯 `main.cpp` 第几行语法了，问题出在没把 `helper.cpp`（或对应的库）一起交给链接器！**

```bash
# ✅ 把两个翻译单元一起编译并链接：
g++ -std=c++20 -Wall -Wextra -Wpedantic main.cpp helper.cpp -o app
```

---

## 八、编辑器与 IDE 工作流：`compile_commands.json` 与 `.editorconfig` (ENG-08)

很多新手会遇到一个极度分裂的现象：**在终端敲 `g++` 或 `cmake --build` 明明顺利通过，可 VS Code / clangd / CLion 却满屏画红波浪线，提示找不到头文件或 `starts_with` 不存在。**

原因很简单：编译器（`g++`）和编辑器里的代码补全引擎（`clangd` / IntelliSense）是**两套独立程序**。如果你不告诉编辑器你究竟传了哪些 `-I` 头文件路径、`-D` 宏和 `-std=c++20`，编辑器就只能按默认 C++14 瞎猜！

### 1. 用 `compile_commands.json` 统一编译器与编辑器的认知

**`compile_commands.json`**（编译数据库）是一份标准 JSON 清单，精确记录工程里**每一个 `.cpp` 文件**被编译时的工作目录与完整编译命令行：

```json
[
  {
    "directory": "/home/alice/logscan/build",
    "command": "/usr/bin/g++ -I/home/alice/logscan/include -std=c++20 -Wall -Wextra -o main.cpp.o -c /home/alice/logscan/src/main.cpp",
    "file": "/home/alice/logscan/src/main.cpp"
  }
]
```

只要在构建目录里生成了这份文件，VS Code（安装 `clangd` 插件）、CLion、Neovim 都能直接读取它，瞬间消除假报错并获得精确跳转与静态检查：

```bash
# 使用 CMake 时只需加上 -DCMAKE_EXPORT_COMPILE_COMMANDS=ON（支持 Ninja / Makefile）
cmake -S . -B build -G Ninja -DCMAKE_EXPORT_COMPILE_COMMANDS=ON

# 若用 VS Code + clangd，把编译数据库链接或指向构建目录（在 .clangd 文件写入）：
# CompileFlags:
#   CompilationDatabase: build
```

注意：**`compile_commands.json` 包含本机绝对路径，绝对不要提交进 Git**（记得放进 `.gitignore`）。

### 2. 用 `.editorconfig` 统一全团队的缩进与换行符

多人用不同编辑器（VS Code、CLion、Visual Studio、Vim）协作时，最怕有人把 4 空格改成了 Tab，或者把 LF 改成了 CRLF，导致 `git diff` 整页全红。在仓库根目录放置一份 **`.editorconfig`**，主流 IDE 都会自动读取并遵守（**这份文件必须提交进 Git**）：

```ini
# 仓库根目录 .editorconfig
root = true

[*]
charset = utf-8
end_of_line = lf
insert_final_newline = true
trim_trailing_whitespace = true
indent_style = space
indent_size = 4

[*.{yml,yaml,json,cmake}]
indent_size = 2

[CMakeLists.txt]
indent_size = 2
```

---

## 九、动手微练习（含参考答案）

### 练习 1（站对房间与空格引号，ENG-01 / ENG-02）

在临时练习目录下新建一个带空格的文件夹 `my logs`，在里面新建 `sample.log` 并写入以下测试日志：

{{example:sample.log}}

先进入 `my logs` 读取 `./sample.log`；再 `cd ..` 退回父目录用相同的 `./sample.log` 观察失败原因，最后用带引号的路径恢复读取，并尝试不加引号看看报错有什么不同。

<details><summary>参考命令（PowerShell 与 Bash）</summary>

```powershell
# PowerShell
mkdir "my logs" -Force
cd "my logs"
Get-Content -LiteralPath './sample.log'
cd ..
Get-Content -LiteralPath './sample.log'           # 失败：当前工作目录在父目录
Get-Content -LiteralPath './my logs/sample.log'   # 成功
Get-Content ./my logs/sample.log                  # 失败：空格把路径拆成了两个参数
```

```bash
# Bash
mkdir -p 'my logs'
cd 'my logs' && cat './sample.log'
cd .. && cat './sample.log'                       # 失败：No such file or directory
cat './my logs/sample.log'                        # 成功
```

</details>

### 练习 2（重定向分离与退出码短路，ENG-03 / ENG-04 / ENG-05）

编译 `hello-minimal.cpp` 时故意把 `return 0;` 改成 `return 7;` 并往 `std::cerr` 打印一句 `"diag: test stderr\n"`。运行程序时把 `stdout` 重定向到 `out.txt`，把 `stderr` 重定向到 `err.txt`，再用 `&& echo "should not print"` 验证退出码为 `7` 时后半句不会执行。

<details><summary>参考答案与验证命令</summary>

```bash
g++ -std=c++20 -Wall -Wextra -Wpedantic hello-minimal.cpp -o hello && ./hello 1> out.txt 2> err.txt && echo "should not print"
echo "exit=$?"
cat out.txt   # 内容：LogScan ready
cat err.txt   # 内容：diag: test stderr
```

因为 `./hello` 返回退出码 `7`（非 `0`），`&&` 触发短路，`"should not print"` 不会输出；两条通道各自干净分离。

</details>

### 练习 3（诊断前 6 类报错，ENG-06 / ENG-07）

新建一个双文件小程序 `main.cpp` + `math_util.cpp` + `math_util.hpp`：
1. 先故意把 `math_util.hpp` 里声明的 `int add(int a, int b);` 只写 `main.cpp` 调用而不一起编译 `math_util.cpp`，观察 `-c` 和链接哪一步报错？
2. 再把函数体 `int add(int a, int b) { return a + b; }` 直接写进 `math_util.hpp`（不加 `inline`），两个 `.cpp` 都 `#include "math_util.hpp"` 后一起编译，观察报错关键词是什么？

<details><summary>参考答案</summary>

1. `g++ -std=c++20 -c main.cpp` 会**成功**生成 `main.o`（返回 `0`），因为编译单文件只需要声明；但紧接着链接 `g++ main.o -o app` 会报 **`undefined reference to 'add(int, int)'`**（第 5 类：漏链接定义）。
2. 把非 `inline` 函数体放进头文件被两个翻译单元包含后，各自编译 `.o` 都成功，链接时会报 **`multiple definition of 'add(int, int)'`**（第 6 类：违反 ODR 重复定义）。

</details>

### 练习 4（配置编辑器标准，ENG-08）

在练习目录根路径创建一份 `.editorconfig`（设置 `utf-8`、`lf`、4 空格缩进），并在使用 CMake 时加上 `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON`，确认 `build/compile_commands.json` 已经生成。

<details><summary>核对要点</summary>

打开 `build/compile_commands.json`，应能看到数组里的每一项都包含 `"directory"`、`"command"`（里面能找到 `-std=c++20`）和 `"file"` 三个字段。

</details>
