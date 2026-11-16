---
title: "LogScan CLI：读日志、做统计"
description: "从命令行参数开始，用 C++20 逐行扫描日志，练习借用、RAII 和可重复的边界测试。"
order: 1
minutes: 60
tags: ["C++20", "CLI", "RAII", "流式读取"]
related:
  - handbook/toolchain
  - handbook/lifetime
  - handbook/raii
  - notes/lab-notebook
sources:
  - sample.log
---

## 你要做什么

写一个本地命令行程序：给它一个日志文件路径，它读完后报告各级别的行数。用工具链一课的命令编译和复现问题；用生命周期一课的思路判断什么时候可以借用一行字符；用 RAII 一课的思路管理打开的文件。

先自己写一个能通过样例的版本。遇到卡点，依次展开末尾的提示。

## 输入和输出约定

- 只接收一个文件路径。日志按 LF（`\n`）分行，接受 Windows CRLF（`\r\n`）。最后一行即使没有换行符也要处理。
- 每行跳过开头的 ASCII 空白，再取到下一个空白或行尾为止的**第一个词**。空白的集合是 `" \t\n\r\v\f"`。级别区分大小写，仅完整匹配 `INFO`、`WARN`、`ERROR`；后面的消息不参与分类，只有级别也算有效行。
- 空行、纯空白行直接跳过。其他行如果首词无法识别，统一计入 `UNKNOWN`，例如 `DEBUG WARN`、`info`、`ERROR:`、`[INFO]`。基本版不剥除 BOM，也不把非 ASCII 空白当分隔符；复现用的文件用 ASCII 或无 BOM 的 UTF-8 保存。
- 成功时向标准输出写四行，顺序固定为 `INFO`、`WARN`、`ERROR`、`UNKNOWN`，每行格式是“标签、一个空格、十进制计数、换行”。计数为零也要输出。

| 情况 | 退出码 | 输出约定 |
| --- | --- | --- |
| 成功读完，包括空文件或有未知级别 | `0` | 标准输出写摘要，标准错误为空 |
| 无法打开文件或读取中途失败 | `1` | 标准输出为空；标准错误写 `logscan: cannot open '路径'` 或 `logscan: cannot read '路径'`，末尾换行 |
| 参数个数错误 | `2` | 标准输出为空；标准错误写 `Usage: logscan <file>`，末尾换行 |

## 分四步实现

### 1. 编译一个会检查参数的 main

在 PowerShell 里准备自己的练习目录。下面的相对路径以学习站项目根目录为起点；如果你只从网页下载了样例，把 `sample.log` 放到练习目录，并令 `$sample = Join-Path $work 'sample.log'`。

```powershell
$work = (New-Item -ItemType Directory -Force -Path '.\private\practice\LogScan').FullName
$source = Join-Path $work 'logscan.cpp'
$exe = Join-Path $work 'logscan.exe'
$sample = (Resolve-Path -LiteralPath '.\public\examples\sample.log').Path
g++ --version
```

把你的代码保存到 `$source` 指向的文件。先只做参数检查：`argc` 包括程序名，所以先判断它是否等于 2，再访问 `argv[1]`。每次改完，用同一条命令重新编译。`-g -O0` 方便单步查看变量。

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic -g -O0 $source -o $exe
if ($LASTEXITCODE -ne 0) { throw '请修复编译错误，再运行程序。' }
& $exe
$LASTEXITCODE
```

这一阶段先验证无参数时的用法提示和退出码 `2`。GCC 用 [`-std=c++20` 选择 C++20 模式](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Standards.html)。

### 2. 打开文件，逐行读取

让 `main` 在自己的作用域内创建 `std::ifstream`，以 `std::ios::binary` 打开路径，把 CR 字节留给分类规则处理。构造后立即检查流；打开失败就返回 `1`。文件由流对象持有，离开作用域时自动关闭。

用 `while (std::getline(input, line))` 驱动扫描，先临时数一下成功读到的行：样例有五行。循环结束后检查 `input.bad() || !input.eof()`；发生读取错误时报告错误，不打印半份摘要。正常到达文件尾也可能设置 `failbit`，因此这里不能仅用 `!input` 判错。参见 WG21 C++20 工作草案的 [`getline` 行为](https://timsong-cpp.github.io/cppwp/n4861/string.io)、[流状态](https://timsong-cpp.github.io/cppwp/n4861/iostate.flags)、[输入文件流构造](https://timsong-cpp.github.io/cppwp/n4861/ifstream.cons)和[文件缓冲区析构](https://timsong-cpp.github.io/cppwp/n4861/filebuf.cons)。

### 3. 分离单行分类和计数

用一个 `Counts` 结构体保存四个从零开始的计数。把“读完一个输入流”和“给一行分类”拆成两个函数，接口可以这样写：

```cpp
Counts scan(std::istream& input);
void count_line(std::string_view line, Counts& counts);
```

`scan` 借用输入流，复用一个 `std::string`，最后按值返回计数。`count_line` 可以先用 `const std::string&` 接收一行，再用 `substr` 得到一份独立的首词；也可以像参考实现那样用 [`std::string_view` 借用字符](https://timsong-cpp.github.io/cppwp/n4861/string.view)。视图只在本次调用中使用。下一次 `getline` 会改写字符串，其中的内容可能变掉，字符存储也可能被替换。像生命周期一课审查 `vector` 的元素借用一样，先找出谁持有数据，再找出哪些操作会让借用失效。

从工作量看，记总输入字节数为 $B$，最长一行字节数为 $L$。每个字节参与逐行读取，分类又至多扫描一次该行首部。在按字节计费、忽略系统 I/O 等待的算法模型下，扫描时间为 $O(B)$；保留的数据是一行文本和四个计数，辅助空间随最长行增长，可记作 $O(L+1)$，不计运行库缓冲。这个模型不预测吞吐，也不解释具体平台的字符串容量增长。

### 4. 固定输出，再验收

把格式化放进 `print_summary(std::ostream&, const Counts&)` 或等价的函数。让 `main` 在确认读完后才调用它。移除临时诊断，再运行样例，并紧接着查看退出码：

```powershell
& $exe $sample
$LASTEXITCODE
```

```text
INFO 3
WARN 1
ERROR 1
UNKNOWN 0
```

退出码应为 `0`。把样例和空文件的输出并排看：相同的是四行格式，变化的只有计数。

## 验收用例

在刚才的 PowerShell 会话里生成边界输入。用 `WriteAllText` 明确控制换行和编码，避免编辑器自动换行或添加 BOM。

```powershell
$ascii = [System.Text.Encoding]::ASCII
$empty = Join-Path $work 'empty.log'
$mixed = Join-Path $work 'mixed.log'
$windows = Join-Path $work 'windows.log'
$missing = Join-Path $work 'missing.log'  # 这个路径不创建
[IO.File]::WriteAllText($empty, '', $ascii)
[IO.File]::WriteAllText($mixed, "  INFO startup`n`tDEBUG WARN`nWARN`tbackoff`n`n`t `ninfo lower-case`nERROR: punctuation`n[INFO] decorated`nERROR", $ascii)
[IO.File]::WriteAllText($windows, "INFO`r`n`tWARN`r`n`r`nERROR`r`n", $ascii)
```

每次运行后立即查看 `$LASTEXITCODE`。表里的数字按 `INFO / WARN / ERROR / UNKNOWN` 排列。

| 运行方式 | 退出码 | 预期结果 |
| --- | ---: | --- |
| `& $exe $sample` | 0 | `3 / 1 / 1 / 0` |
| `& $exe $empty` | 0 | `0 / 0 / 0 / 0` |
| `& $exe $mixed` | 0 | `1 / 1 / 1 / 4`；两条空白行跳过，最后的 `ERROR` 没有换行也计数 |
| `& $exe $windows` | 0 | `1 / 1 / 1 / 0`；仅含级别的行不会被行尾 CR 干扰 |
| `& $exe $missing` | 1 | 没有摘要，错误信息包含无法打开的路径 |
| `& $exe` 或 `& $exe $sample $empty` | 2 | 没有摘要，只有用法提示 |

如果有项目文件，在项目根目录用脚本验收自己的实现：

```powershell
powershell.exe -NoProfile -File .\tests\logscan.ps1 -Source $source
```

脚本会重新编译源文件，独立比对标准输出、标准错误和退出码，还会检查垂直制表符与换页符。全部通过时会显示 `All 8 LogScan cases passed.`。省略 `-Source` 则编译参考实现。脚本覆盖了打开失败；没有模拟文件打开后才发生的设备读取错误。

## 调试：为什么 ERROR 没被计数？

先找一个小输入，把猜测变成可验证的结果。若 `windows.log` 的 `ERROR` 被记到 `UNKNOWN`，比较同一词在 LF 与 CRLF 下的行为：

```powershell
$probe = Join-Path $work 'probe.log'
foreach ($ending in @("`n", "`r`n")) {
    [IO.File]::WriteAllText($probe, "ERROR$ending", $ascii)
    Format-Hex -LiteralPath $probe
    & $exe $probe
    $LASTEXITCODE
}
```

两次的预期都为 `0 / 0 / 1 / 0`，退出码为 `0`。文件末尾分别是 `0A` 和 `0D 0A`。读取一行时，默认分隔符 `\n` 不进入字符串；以二进制模式打开时，`\r` 仍在字符串里。单步或临时向 `std::cerr` 输出首词长度：若得到 6，检查空白集合；正确的 `ERROR` 长度是 5。修正后重跑 CRLF 和混合输入，确认认识 `ERROR` 的同时没有误收 `ERROR:`。最后移除诊断。

## 改一个需求，再写复盘

基础版本通过后，在自己的练习副本里增加 `logscan --strict <file>`：成功读取且存在未知级别时，照常输出四行，但返回 `3`；其他规则沿用基本版。先为样例和混合输入分别写下普通模式与严格模式的预期。修改后重跑：普通模式仍返回 `0`，严格模式下样例返回 `0`、混合输入返回 `3`，两种模式的摘要相同。

把下面三样留在实验笔记里，方便下次照着重跑：

- 编译器版本、完整编译命令，以及一个输入文件的内容、实际输出和退出码。
- 一次调试记录：最小复现、原先的猜测、观察到的证据、修正后的结果。
- 一段所有权说明：谁持有文件，谁借用流，谁拥有一行字符；如果将来要跨多行保留首词，你会存什么类型，为什么？

### 可选扩展

- 支持 `-` 代表标准输入。复用 `scan(std::istream&)`，在 `main` 里决定借用 `std::cin` 还是自己创建的文件流，给两条输入路径各留一条测试。
- 为未知行保留前 N 个诊断样本，带行号和首词副本。试用 `std::vector<std::string>` 保存字符，检查是否还持有会被 `getline` 改写的视图，或会被 `vector` 扩容失效的元素引用。
- 为不可信输入增加行长上限。先约定超长时的退出码和诊断，再实现有界读取；完整 `getline` 之后才检查长度，不能限制读取这一行时使用的内存。

## 分级提示和参考

<details><summary>提示 1：先找分类起点</summary>

把 ASCII 空白写成固定集合，用 `find_first_not_of` 定位首个非空白字符。返回 `npos` 表示整行没有词，直接跳过。

</details>

<details><summary>提示 2：截取恰好一个词</summary>

从首个非空白字符开始，用 `find_first_of` 找下一个空白。找不到时取到行尾。如果用视图，把它向前裁掉起点之前的部分，再调用 `substr(0, end)`；当 `end` 是 `npos` 时，`substr` 会取到结尾。

</details>

<details><summary>提示 3：把读文件和计数分开</summary>

让 `main` 决定退出码。`scan` 用 `getline` 读到一行就调用 `count_line`；后者只更新计数。即使 `scan` 返回了已经累计的数值，`main` 也要确认输入正常结束，再输出摘要。

</details>

<details><summary>完整参考实现：logscan.cpp</summary>

{{example:logscan.cpp}}

</details>
