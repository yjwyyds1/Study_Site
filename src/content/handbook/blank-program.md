---
title: "从空白文件写一个逐行分类器"
description: "把读入、分类和计数拆开，用样例、空输入和错误路径验证一个自己的 C++20 程序。"
order: 15
tags: ["C++20", "输入输出", "循环", "函数"]
related: ["handbook/toolchain", "handbook/command-line-git", "labs/logscan"]
sources: ["classify.cpp"]
---

## 先写清楚一行怎么算

你拿到四行日志：`INFO start`、一个空行、`WARN retry`、`ERROR`。写一个程序，每读到一行就打印一个标签，读完再打印总行数。开工前，确认你能用[工具链一课](../../handbook/toolchain/)的命令在 PowerShell 编译并运行一个 C++20 源文件。

**分类规则**只看开头。前缀就是从第一个字符起连续匹配的一段文本，这里连级别后面的普通空格也算进去。程序区分大小写，不去掉任何空格。

| 输入的一行 | 标签 | 理由 |
| --- | --- | --- |
| `INFO start`、`WARN retry`、`ERROR disk` | 分别是 `INFO`、`WARN`、`ERROR` | 级别后有普通空格 |
| 空行 | `EMPTY` | 这一行没有字符 |
| `INFO`、`ERROR`、`info start`、只含空格的行 | `OTHER` | 非空，但不匹配任何前缀 |

这里单独的 `ERROR` 是 `OTHER`。后面的 [LogScan v0](../../labs/logscan/) 取的是每行的第一个词，单独的 `ERROR` 会计入 `ERROR`。两份程序按各自的规则验收。

## 把需求翻成三个小步骤

### 1. 用一个固定字符串调用函数

在自己的练习目录新建 `classify.cpp`。**函数**是一段能按名字调用的代码：这里把一条输入交给 `classify_line`，它用 `return` 把标签交回来。`const std::string& line` 让函数读原来的字符串，省去复制，也不能经由 `line` 修改它。`std::` 表示名字来自标准库，`#include` 引入本步用到的声明。

```cpp
#include <iostream>
#include <string>
#include <string_view>

std::string_view classify_line(const std::string& line) {
    if (line.empty()) {
        return "EMPTY";
    }
    if (line.starts_with("INFO ")) {
        return "INFO";
    }
    if (line.starts_with("WARN ")) {
        return "WARN";
    }
    if (line.starts_with("ERROR ")) {
        return "ERROR";
    }
    return "OTHER";
}

int main() {
    const std::string line = "INFO start";
    std::cout << classify_line(line) << '\n';
}
```

先预测程序会走到哪个 `return`。从 `main` 开始：`line` 有内容，`empty()` 为假；`starts_with("INFO ")` 为真，函数返回 `"INFO"`，后面的条件不再执行。`std::cout` 把标签写到标准输出，`'\n'` 换行。返回类型 `std::string_view` 可以理解为只读的文本窗口；这里它看的是程序里写死的标签，例如 `"INFO"`。下一次输入覆盖 `line` 时，这些标签仍然有效。

用[下方的构建命令](#在-powershell-验证)编译，再运行 `.\classify.exe`，预期只输出 `INFO`，退出码为 `0`。只把 `"INFO start"` 改成 `"INFO"` 再编译运行：这次输出 `OTHER`。少掉的不只是消息，还有前缀要求的那个空格。

### 2. 让 while 一次取一行

保留头文件和函数，只把 `main` 换成下面这段。**输入流**可以看作一段按顺序读取的文本；`std::cin` 是标准输入，终端管道可以往里送数据。`std::getline` 把一行写进 `line`，读掉分隔用的换行符，保留其他字符。它返回输入流，`while` 把流当前的状态当条件：能交付本行才执行循环体，然后回到条件处读下一行。

```cpp
int main() {
    std::string line;
    while (std::getline(std::cin, line)) {
        std::cout << classify_line(line) << '\n';
    }
}
```

先写下四个标签，再用同一条构建命令重新编译，运行这条 PowerShell 命令：

```powershell
@('INFO start', '', 'WARN retry', 'ERROR') | .\classify.exe
$LASTEXITCODE
```

输出依次是 `INFO`、`EMPTY`、`WARN`、`OTHER`，退出码为 `0`。第二次调用读到了换行符，虽没往 `line` 放字符，仍然成功交付了空行。读完最后一行之后再试一次，才因没有下一行退出循环。这个版本还没有区分读完和读取出错。

### 3. 给成功进入循环的次数计数

文件开头再加 `#include <cstddef>`，把 `main` 换成下面这段。`std::size_t` 是这里存放非负行数的整数类型，`++lines` 在原值上加一。把增加计数的代码放在循环里，让每一条已处理的行只贡献一次。

```cpp
int main() {
    std::string line;
    std::size_t lines = 0;
    while (std::getline(std::cin, line)) {
        const std::string_view label = classify_line(line);
        std::cout << label << '\n';
        ++lines;
    }
    if (std::cin.bad() || !std::cin.eof()) {
        std::cerr << "cannot read input\n";
        return 1;
    }
    std::cout << "lines: " << lines << '\n';
    return 0;
}
```

沿着同一份输入对照循环，重点看第二次和第五次：

| 调用 `getline` 的次数 | 本次交付的 `line` | 进入循环？ | 输出 | `lines` |
| --- | --- | --- | --- | --- |
| 1 | `INFO start` | 是 | `INFO` | 0 → 1 |
| 2 | 空字符串 | 是 | `EMPTY` | 1 → 2 |
| 3 | `WARN retry` | 是 | `WARN` | 2 → 3 |
| 4 | `ERROR` | 是 | `OTHER` | 3 → 4 |
| 5 | 没有下一行 | 否 | 循环后打印 `lines: 4` | 仍为 4 |

**EOF** 是输入末尾。循环停下后，`eof()` 检查流是否遇到了末尾，`bad()` 检查流是否标记了严重的输入故障。这里把 `bad()` 为真或未到 EOF 就停止视为读取失败，向标准错误 `std::cerr` 报告并返回 `1`。**退出码**是程序交给调用者的整数；本例用 `0` 表示成功，PowerShell 用 `$LASTEXITCODE` 查看它。重新编译并重跑刚才的管道，应多出一行 `lines: 4`，退出码仍为 `0`。

### 把三步接到文件输入

把上一步的 `main` 改成 `int classify_stream(std::istream& input)`，函数体里的 `std::cin` 全换成 `input`。`std::istream&` 表示借用一个可读取的流，`getline` 可以推进它的读入位置。再引入 `<fstream>`，另写一个 `main` 负责选择输入。

`argc` 是命令行传给程序的参数个数，常规调用时连程序名一起数；`argv` 按下标取参数，`argv[1]` 是第一个额外参数。没有额外参数就传 `std::cin`；有一个就用 `std::ifstream` 尝试打开该路径；有两个或更多就报用法。`if (!input)` 紧跟在打开之后，失败就返回；打开失败的文件不会交给分类循环。

{{example:classify.cpp}}

## 在 PowerShell 验证

在 CLion 的 Terminal 或独立 PowerShell 中进入练习目录，确认 `Get-Location` 显示的目录里有 `classify.cpp`。每次修改后用 MinGW 的 `g++` 重新构建：

```powershell
Get-Location
g++ -std=c++20 -Wall -Wextra -Wpedantic classify.cpp -o classify.exe
$LASTEXITCODE
```

构建退出码为 `0` 才运行。找不到 `g++` 时先查[工具链一课](../../handbook/toolchain/)；出现编译诊断时先修第一处错误，避免误跑上一轮留下的程序。

在同一目录准备文件。`WriteAllText` 写入给定的内容，不会额外补换行；这里最后一行 `ERROR` 后没有换行。运行前确认该目录里没有 `missing.txt`。

```powershell
$dir = (Get-Location).Path
[IO.File]::WriteAllText((Join-Path $dir 'sample input.txt'), "INFO start`n`nWARN retry`nERROR")
[IO.File]::WriteAllText((Join-Path $dir 'empty.txt'), '')

.\classify.exe '.\sample input.txt'
$LASTEXITCODE
.\classify.exe '.\empty.txt'
$LASTEXITCODE
.\classify.exe 'missing.txt'
$LASTEXITCODE
.\classify.exe first.txt second.txt
$LASTEXITCODE
```

| 调用 | 按程序追踪 | 预期结果 |
| --- | --- | --- |
| `'.\sample input.txt'` | `argc == 2` → 打开成功 → 第四次读取虽遇到 EOF，仍交出 `ERROR` → 下一次读取停止 | 标准输出依次是 `INFO`、`EMPTY`、`WARN`、`OTHER`、`lines: 4`；退出 `0` |
| `'.\empty.txt'` | `argc == 2` → 打开成功 → 第一次读取遇到 EOF，没读到字符也没读到分隔符 → 循环执行零次 | 标准输出只有 `lines: 0`；退出 `0` |
| `'missing.txt'` | `argc == 2` → 打开失败 → 从 `main` 提前返回 | 标准错误是 `cannot open: missing.txt`；没有标准输出；退出 `1` |
| `first.txt second.txt` | `argc == 3` → 检查用法时返回 | 标准错误是 `usage: classify [file]`；没有标准输出；退出 `2` |

做一次只改输入的对照：把创建空文件那条命令的 `''` 改为单个换行符，在 PowerShell 双引号里用反引号加 `n` 表示。重写文件后重跑同一条命令，此时先输出 `EMPTY`，再输出 `lines: 1`，仍退出 `0`。零字节意味着连一行都读不到；一个换行符足够结束一条空行。再把文件恢复为零字节，留给下面的练习。

## 独立改一处

在练习副本里加上 `warnings: N`，放在 `lines: N` 的下一行。它只统计分类结果为 `WARN` 的行，原来的标签和失败行为都要保留。

- 上面的文件样例应多出 `warnings: 1`；零字节文件应多出 `warnings: 0`。
- 文件内容为 `WARN retry`、`WARN` 后接一个普通空格、单独的 `WARN` 这三行时，标签应为 `WARN`、`WARN`、`OTHER`，总数为 `3`，警告数为 `2`。
- 把同一组文本经管道传入，结果应相同。文件打不开仍退出 `1`，标准输出为空。

<details>
<summary>卡住时看提示</summary>

计数依据是本轮已经算出的 `label`。与 `lines` 一样，计数器要放在循环外，汇总要放在读取状态检查之后。

</details>

<details>
<summary>参考答案</summary>

在 `classify_stream` 的 `lines` 声明下加 `std::size_t warnings = 0;`。循环内给 `lines` 加一后执行 `if (label == "WARN") { ++warnings; }`。正常汇总时在输出 `lines` 的那一行后加 `std::cout << "warnings: " << warnings << '\n';`，错误分支的 `return` 保持原位。

</details>

<details>
<summary>进阶：为什么读到 EOF 的那次仍可能进循环？</summary>

`getline` 读到文件末尾会设置 `eofbit`，完全没取到字符（分隔符也算取到）时才另外设置 `failbit`。流转成布尔值等价于 `!fail()`，单独的 `eofbit` 不会让它变假。所以没有末尾换行的 `ERROR` 那一行可以正常交付；再请求一行时，流已经在末尾，读取失败，循环才停。[N4861：逐行读取](https://timsong-cpp.github.io/cppwp/n4861/string.io) · [流状态](https://timsong-cpp.github.io/cppwp/n4861/iostate.flags)

</details>

[LogScan v0 实验](../../labs/logscan/)会沿用读入、分类、统计的分工。开始前先读它的输入和输出约定，再决定哪些代码能带过去。

参考 C++20 工作草案 N4861：[字符串前缀](https://timsong-cpp.github.io/cppwp/n4861/string.starts.with) · [标签字面量](https://timsong-cpp.github.io/cppwp/n4861/lex.string) · [逐行读取](https://timsong-cpp.github.io/cppwp/n4861/string.io) · [文件流打开](https://timsong-cpp.github.io/cppwp/n4861/ifstream.cons) · [程序入口与参数](https://timsong-cpp.github.io/cppwp/n4861/basic.start.main)
