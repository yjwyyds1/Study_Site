---
title: "第 5 课：用 struct 打包数据并从文件读取"
description: "用结构体整理复杂状态，用 std::ifstream 读取本地日志文件，彻底分清当前工作目录、打开失败与文件末尾。"
order: 5
tags: ["C++20", "零基础", "struct", "ifstream", "文件读取"]
related: ["handbook/cpp-containers", "handbook/toolchain", "handbook/blank-program"]
sources: ["cpp-struct-file.cpp", "sample.log"]
---

## 本课只解决这 1 个问题

写日志统计器时，统计结果不止一个数字，有总行数、正常数、警告数、错误数；同时数据也不再靠键盘敲，而是保存在硬盘的 `.log` 文件里。本课学会用 `struct` 把相关数据打成一包，并用 `std::ifstream` 稳妥地把文件一行行读出来。

前置要求：完成[第 4 课](../cpp-containers/)，会用 `std::string`、`std::vector` 和函数。

## 心智模型：结构体 = 自定义表单，ifstream = 磁盘只读管道

1. **`struct`（结构体）**：把原本分散的几个变量装进同一张表单里。传参时只需传一个 `Summary& s`，代码瞬间干净。
   - **铁律**：`struct Name { ... };` 的右花括号后面**必须加分号 `;`**！
2. **`std::ifstream`（输入文件流）**：就像一根插进硬盘文件的吸管。构造它时传入文件路径，然后像用 `std::cin` 一样用 `std::getline(file, line)` 每次吸出一整行。

## 最小可运行代码

把页首的 `cpp-struct-file.cpp` 和 `sample.log` 下载到**同一个目录** `D:\cpp-study` 下：

{{example:cpp-struct-file.cpp}}

在 PowerShell 编译运行：

```powershell
cd D:\cpp-study
g++ -std=c++20 -Wall -Wextra -Wpedantic cpp-struct-file.cpp -o cpp-struct-file.exe
.\cpp-struct-file.exe
```

输出：

```text
总行数：5
ERROR 行数：1
```

## 新手必踩的 3 个文件与结构体坑

### 坑 1：“文件明明在文件夹里，程序却说打不开！”

`std::ifstream file("sample.log");` 用的是**相对路径**。程序找文件时，看的是**你运行 `.exe` 时终端所在的“当前工作目录”**，而不是 `.cpp` 源码所在的目录！

如果你在 `D:\` 目录下敲 `.\cpp-study\cpp-struct-file.exe`，程序就会去 `D:\sample.log` 找文件，当然打不开。排错时先在终端敲 `pwd`（或 `Get-Location`）确认当前目录里到底有没有 `sample.log`。

### 坑 2：忘了检查 `if (!file)`，把“文件没打开”当成“空文件”

把第 12 行改成 `"not-exist.log"` 再跑一次：
- 有 `if (!file)` 时，程序立刻向 `std::cerr` 报错并返回退出码 `1`，让你马上知道是路径不对。
- 如果删掉 `if (!file)`，后面的 `while (std::getline(file, line))` 直接一次都不执行，最后打印 `总行数：0`——你完全不知道文件根本没打开！

### 坑 3：文件最后一行没有回车换行符，会被漏掉吗？

不会！`std::getline(file, line)` 只要在遇到文件末尾前读到了哪怕 1 个字符，就会把那一行成功交给 `line` 并进入循环；等到**下一轮**再读时发现已经没有任何字符了，才退出循环。

## 4 个梯度微练习

### 练习 1（读代码写结果）

不要运行，写出输出：

```cpp
struct Stats {
    int total = 0;
    int warn = 0;
};

void record_warn(Stats& s) {
    ++s.total;
    ++s.warn;
}

int main() {
    Stats st;
    record_warn(st);
    record_warn(st);
    std::cout << st.total << " " << st.warn << '\n';
}
```

<details>
<summary>核对答案</summary>

输出：`2 2`。`record_warn` 接收的是 `Stats&` 引用，两次调用都直接修改了 `main` 里的 `st`。

</details>

### 练习 2（找 Bug 并修复）

下面代码想把统计结构体传给打印函数，有 2 处错误，找出来并修好：

```cpp
struct LogStats {
    int info = 0;
    int error = 0;
}

void print_stats(LogStats s) {
    std::cout << s.info << " " << s.error << '\n';
}
```

<details>
<summary>提示与答案</summary>

1. `struct LogStats { ... }` 结尾**漏了分号 `;`**（这是 C++ 最经典的报错之一，编译器往往会在下一行才报错）。
2. 如果结构体以后字段变多，建议参数写成只读引用 `const LogStats& s` 避免无谓复制。

</details>

### 练习 3（把读到的日志存进 vector）

在 `cpp-struct-file.cpp` 里，如果我想把所有以 `"ERROR"` 开头的**完整日志行**保存下来最后一起打印，应该在 `Summary` 结构体里加一个什么类型的成员？

<details>
<summary>核对答案</summary>

在 `Summary` 里加一个 `std::vector<std::string> error_lines;`（顶部别忘了 `#include <vector>`），遇到 `ERROR` 时执行 `s.error_lines.push_back(line);`。

</details>

### 练习 4（独立手写阶段小验收）

不看 `cpp-struct-file.cpp`，新建一个 `my_scan.cpp`：
1. 定义 `struct Report`，包含 `int info = 0; int warn = 0; int error = 0;`。
2. 写一个函数 `void update_report(Report& r, const std::string& line)`，用 `starts_with` 统计 `INFO`、`WARN`、`ERROR`。
3. 在 `main` 里打开 `sample.log`（打不开要报错并返回 `1`），逐行调用 `update_report`，最后打印三项计数。

<details>
<summary>参考写法</summary>

```cpp
#include <fstream>
#include <iostream>
#include <string>

struct Report {
    int info = 0;
    int warn = 0;
    int error = 0;
};

void update_report(Report& r, const std::string& line) {
    if (line.starts_with("INFO")) {
        ++r.info;
    } else if (line.starts_with("WARN")) {
        ++r.warn;
    } else if (line.starts_with("ERROR")) {
        ++r.error;
    }
}

int main() {
    std::ifstream file("sample.log");
    if (!file) {
        std::cerr << "cannot open sample.log\n";
        return 1;
    }

    Report r;
    std::string line;
    while (std::getline(file, line)) {
        update_report(r, line);
    }

    std::cout << "INFO=" << r.info
              << " WARN=" << r.warn
              << " ERROR=" << r.error << '\n';
    return 0;
}
```

对 `sample.log` 运行应输出 `INFO=3 WARN=1 ERROR=1`。

</details>
