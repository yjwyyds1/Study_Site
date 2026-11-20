---
title: "LogScan CLI：读日志、做统计"
description: "从命令行参数开始，用 C++20 逐行扫描日志，练习借用、RAII 和可重复的边界测试。"
order: 1
tags: ["C++20", "CLI", "RAII", "流式读取"]
related:
  - handbook/toolchain
  - handbook/lifetime
  - handbook/raii
  - labs/logscan-build
  - notes/lab-notebook
sources:
  - sample.log
---

## 你要做什么

服务刚重启，你拿到下面四行值班日志，要给同事一份级别统计。把它做成 Windows 命令行程序 `logscan <file>`：只给一个文件路径，程序读完后交出四项计数。先修：按[工具链](../../handbook/toolchain/)用 `g++` 编译运行过程序，会用[逐行分类器](../../handbook/blank-program/)里的 `while (std::getline(...))`。遇到文件归属和首词视图时，可以回看 [RAII](../../handbook/raii/)和[生命周期](../../handbook/lifetime/)。

```text
INFO ready
  ERROR
ERROR:

```

第四行为空，确切内容是 `"INFO ready\n  ERROR\nERROR:\n\n"`，下文会原样生成。先猜：旧分类器用 `starts_with("ERROR ")` 从行首查固定前缀，会认哪条为错误？如果先跳过行首空白，再比较第一个完整的词，哪一条改变分类？

## 输入和输出约定

**首词**指跳过开头空白后，到下一处空白或行尾为止的一段字符。空白只认 ASCII 的 `" \t\n\r\v\f"`：空格、制表、换行、回车、垂直制表和换页。首词恰好是 `INFO`、`WARN` 或 `ERROR` 才认得；区分大小写，余下的消息不参与判断。仅有级别也算一条，空行和纯空白行跳过。其他首词（如 `DEBUG`、`info`、`ERROR:`、`[INFO]`）都计入 `UNKNOWN`。

文件按 LF（`\n`）分行，也接收 Windows 的 CRLF（`\r\n`）；有内容的最后一行即使没有换行也处理。本版不剥除 BOM（有些编辑器加在文件开头的编码标记），也不把非 ASCII 空白当分隔符。实验用 ASCII 或不带 BOM 的 UTF-8。

**标准输出**（stdout，`std::cout`）交正常结果；**标准错误**（stderr，`std::cerr`）交诊断。终端可能同时显示两者，调用方却可以分别接收。**退出码**是程序结束时交给调用方的整数。

| 情况 | 退出码 | 标准输出 | 标准错误 |
| --- | ---: | --- | --- |
| 正常读完，包括空文件或有未知级别 | 0 | 四行，依次为 `INFO`、`WARN`、`ERROR`、`UNKNOWN`；每行是标签、一个空格、十进制计数和换行；零也打印 | 空 |
| 无法打开文件 | 1 | 空 | `logscan: cannot open '路径'` 加换行 |
| 打开后读取失败 | 1 | 空 | `logscan: cannot read '路径'` 加换行 |
| 路径参数不是一个 | 2 | 空 | `Usage: logscan <file>` 加换行 |

## 空白页五步破题法（写代码前先过这五步）

拿到一份新需求对着空白 `.cpp` 无从下手时，按这五步把问题拆开，每步只管一件事：

1. **先抄契约表**：在草稿纸上写死 `argc` 条件、正常退出码 `0`、失败退出码 `1/2`，以及 `stdout` 与 `stderr` 各自归谁，防止后续把诊断错写进标准输出。
2. **再定数据与函数签名**：把核心状态收进一个结构体（如 `Counts`），把纯计算函数签名定为只接收 `std::istream&` / `std::string_view`，彻底剥离文件路径和终端打印。
3. **先建最小可编译骨架**：只写 `main` 的参数检查与空分支，立刻用 `g++ -std=c++20 -Wall -Wextra -Wpedantic` 编过并测退出码 `2`。
4. **先跑通最短正常样例，再补流状态**：先在循环里用 `getline` 数行数，再接入单行分类；最后补全 `if (input.bad() || !input.eof())` 防止把正常 EOF 当读错误。
5. **逐条对表 + 构造反例**：用空文件、CRLF、末行无换行、前缀陷阱（`ERROR:`）和缺失路径分别对照验收表，全部一致才算完成。

## 分四步实现

### 1. 编译一个会检查参数的 main

在 Windows PowerShell 进入任意临时练习目录并创建示例日志 `sample.log`（内容如下，也可直接复制）：

{{example:sample.log}}

若本机已拉取本学习站仓库，也可以直接引用 `.\public\examples\sample.log`；否则在当前练习目录保存上面的 `sample.log`，把第二行的路径换成 `.\sample.log`：

```powershell
Get-Command g++
$sample = (Resolve-Path -LiteralPath '.\public\examples\sample.log').Path
$work = (New-Item -ItemType Directory -Path (Join-Path ([IO.Path]::GetTempPath()) "LogScan v0 $([guid]::NewGuid())")).FullName
$source = Join-Path $work 'logscan.cpp'
$exe = Join-Path $work 'logscan.exe'
$ascii = [System.Text.Encoding]::ASCII
$fixture = Join-Path $work 'shift log.txt'
$missing = Join-Path $work 'missing.log'  # 不创建此文件
[IO.File]::WriteAllText($fixture, "INFO ready`n  ERROR`nERROR:`n`n", $ascii)
```

在 `$source` 保存代码。先用 `int main(int argc, char* argv[])` 写入口。`argc` 是参数个数，包含程序名；`argv` 按位置提供参数文字。无参数时 `argc == 1`，给一个路径时 `argc == 2`；先排除 `argc != 2`，再取 `argv[1]`。失败用 `std::cerr` 写用法并返回 `2`；这一步的正常分支先返回 `0`。引入 `<iostream>`。

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic -g -O0 $source -o $exe
if ($LASTEXITCODE -ne 0) { throw '构建失败：先看上面的第一条诊断。' }
& $exe
$LASTEXITCODE
```

以后每改一次源码，都先用这条 `g++` 命令重建。`-g -O0` 方便单步看变量。成功构建会生成 `$exe`；接下来应只显示用法，最后一条 PowerShell 命令另外显示刚结束的进程的退出码 `2`。找不到 `g++` 时回查工具链；找不到源码时检查 `$source` 的实际路径和扩展名。

### 2. 打开文件，逐行读取

在 `main` 用 `std::ifstream input(argv[1], std::ios::binary);` 打开文件，包含 `<fstream>`。**输入流**供程序依次读取字符；这里它还负责管理打开的文件，离开 `main` 时自动关闭。二进制模式使 CR 留在输入里，交给第 3 步的空白规则。刚构造完若 `!input` 为真，先输出 `cannot open` 的完整诊断，返回 `1`。

接着用 `while (std::getline(input, line))` 读取 `std::string line`，先临时数一下成功读到的行。这个文件应进循环四次：第 4 次只取到一个 LF，仍是一条成功读到的空行。LF 被取走但不放进字符串；第 5 次没有任何字符可取，循环结束。

| 停止时的状态 | `main` 怎么处理 |
| --- | --- |
| `eof()` 真、`bad()` 假 | 正常到达文件末尾（EOF），可打印摘要。若末行有字符但没有 LF，那一行先进入循环，下一次读才停 |
| `bad()` 真，或停止时 `eof()` 假 | 读失败，向 stderr 报告 `cannot read` 并返回 `1`，此前累计的数字也不输出 |

因此循环后用 `input.bad() || !input.eof()`。正常到 EOF 的最后一次尝试也会设置 `failbit`（这里表示没能读出下一行），此时改用 `!input` 会把正常结束误报成错误。参见 N4861 的 [`getline`](https://timsong-cpp.github.io/cppwp/n4861/string.io)、[流状态](https://timsong-cpp.github.io/cppwp/n4861/iostate.flags)与[读前检查](https://timsong-cpp.github.io/cppwp/n4861/istream.sentry)。

### 3. 分离单行分类和计数

用 `Counts` 结构体把四个从零开始的计数装在一起。让 `scan` 只管读和累计，`count_line` 只判当前一行；`main` 管路径、流状态和输出。

```cpp
Counts scan(std::istream& input);
void count_line(std::string_view line, Counts& counts);
```

`std::istream&` 让 `scan` 使用调用方的流。循环里的 `std::string` 持有本轮字符；传给 `count_line` 的 `std::string_view` 是只读的窗口，只圈出已有字符的一段。`remove_prefix(first)` 只挪动窗口的起点，不改原字符串；`substr(0, end)` 再圈出首词。`Counts&` 让函数直接更新 `scan` 手上的计数。函数返回后只留下数字，下一次 `getline` 就能覆盖原字符串。

拿你的预测对照下表。下标从 0 起；`first` 是 `find_first_not_of(whitespace)` 的结果，`end` 在挪过行首空白后通过 `find_first_of(whitespace)` 得到。`npos` 表示没找到：用于 `first` 时跳过整行，用于 `end` 时 `substr` 取到行尾。

| 轮次 | `getline` 后的字符串 | 旧分类器的行首前缀法 | `first` → `end` → `token` | 更新后 INFO / WARN / ERROR / UNKNOWN |
| --- | --- | --- | --- | --- |
| 1 | `"INFO ready"` | INFO | `0 → 4 → INFO` | 1 / 0 / 0 / 0 |
| 2 | `"  ERROR"` | OTHER | `2 → npos → ERROR` | 1 / 0 / 1 / 0 |
| 3 | `"ERROR:"` | OTHER | `0 → npos → ERROR:` | 1 / 0 / 1 / 1 |
| 4 | `""` | EMPTY | `npos`，直接返回 | 1 / 0 / 1 / 1 |
| 5 | 已到 EOF，未读到新行 | 不分类 | 循环体不执行 | 1 / 0 / 1 / 1 |

第 2 行靠跳过空白认出 `ERROR`。只去掉该行开头两格，变成独占一行的 `ERROR`，旧规则依然判 OTHER：它要找的第六个字符（空格）不存在。新规则取到行尾，仍计入 ERROR。第 3 行的冒号属于词，`token == "ERROR"` 要求整个词相等。参见 N4861 的[视图操作](https://timsong-cpp.github.io/cppwp/n4861/string.view.ops)和[视图比较](https://timsong-cpp.github.io/cppwp/n4861/string.view.comparison)。

### 4. 固定输出，再验收

让 `main` 在确认正常结束后才调用 `print_summary(std::ostream&, const Counts&)` 或等价代码。移除临时行数输出，重建，再运行。用 [`Start-Process`](https://learn.microsoft.com/powershell/module/microsoft.powershell.management/start-process) 把两条流分别存进文件；大小为零表示该侧没有文字。

```powershell
function Show-Scan([string]$logPath) {
    $outFile = Join-Path $work 'stdout.txt'
    $errFile = Join-Path $work 'stderr.txt'
    $p = Start-Process -FilePath $exe -ArgumentList ('"{0}"' -f $logPath) `
        -RedirectStandardOutput $outFile -RedirectStandardError $errFile `
        -WindowStyle Hidden -Wait -PassThru
    "stdout ($((Get-Item -LiteralPath $outFile).Length) bytes):"
    Get-Content -LiteralPath $outFile
    "stderr ($((Get-Item -LiteralPath $errFile).Length) bytes):"
    Get-Content -LiteralPath $errFile
    "exit: $($p.ExitCode)"
}
Show-Scan $fixture
Show-Scan $missing
```

第一条在 stdout 得到下面的摘要，stderr 是 0 字节，退出码是 `0`。第二条只换成不存在的路径，`main` 在打开文件后立即返回，没进入 `scan`：stdout 是 0 字节，stderr 显示 `logscan: cannot open '实际路径'` 一行，退出码是 `1`。

```text
INFO 1
WARN 0
ERROR 1
UNKNOWN 1
```

## 验收用例

在刚才的 PowerShell 会话生成更多边界输入。用 `WriteAllText` 控制换行和编码。

```powershell
$empty = Join-Path $work 'empty.log'
$mixed = Join-Path $work 'mixed.log'
$windows = Join-Path $work 'windows.log'
[IO.File]::WriteAllText($empty, '', $ascii)
[IO.File]::WriteAllText($mixed, "  INFO startup`n`tDEBUG WARN`nWARN`tbackoff`n`n`t `ninfo lower-case`nERROR: punctuation`n[INFO] decorated`nERROR", $ascii)
[IO.File]::WriteAllText($windows, "INFO`r`n`tWARN`r`n`r`nERROR`r`n", $ascii)
```

每次用 `&` 启动程序后，立刻读 `$LASTEXITCODE`。下表把四行计数简写为 INFO / WARN / ERROR / UNKNOWN。

| 运行方式 | 退出码 | 预期结果 |
| --- | ---: | --- |
| `& $exe $sample` | 0 | `3 / 1 / 1 / 0` |
| `& $exe $empty` | 0 | `0 / 0 / 0 / 0` |
| `& $exe $mixed` | 0 | `1 / 1 / 1 / 4`；末行 `ERROR` 无换行也计数 |
| `& $exe $windows` | 0 | `1 / 1 / 1 / 0`；行尾 CR 没有并入首词 |
| `& $exe $missing` | 1 | 只有打开失败的诊断 |
| `& $exe` 或 `& $exe $sample $empty` | 2 | 只有用法提示 |

在学习站项目根目录，可用下面的脚本重新编译，独立比较退出码、stdout 和 stderr，也检查垂直制表符和换页符。成功最后显示 `All 8 LogScan cases passed.`；失败会显示哪项与预期不符。省略 `-Source` 则编译参考实现。脚本没有模拟打开后才发生的设备读错误。

```powershell
powershell.exe -NoProfile -File .\tests\logscan.ps1 -Source $source
```

## 调试：为什么 ERROR 没被计数？

只改一个比较条件：在练习副本把 `token == "ERROR"` 临时换成 `token.starts_with("ERROR")`。预测第 3 行的分词是否变了，再重建，运行 `Show-Scan $fixture`。两次的 `token` 都是六个字符的 `ERROR:`。前缀比较只看头五个字符，导致摘要变成 `1 / 0 / 2 / 0`，stderr 仍空，退出码仍是 `0`。这是分类错了，进程本身顺利读完。恢复 `==`，重建并重跑。

如果遇到相反的现象——CRLF 文件里的 `ERROR` 进了 `UNKNOWN`——把输入缩到单独一行，只把行尾从 LF 换成 CRLF。用 `Format-Hex -LiteralPath $windows` 可看到 CRLF 是 `0D 0A`。在判断处观察 `token.size()`：正确长度是 5；若为 6 且末字节是 `0D`，检查空白集合是否漏掉 `\r`。修完后重跑 CRLF 和 `ERROR:`，前者认出 `ERROR`，后者仍进 UNKNOWN。

## 改一个需求，再写复盘

保留通过验收的 v0，在练习副本独立增加 `logscan --strict <file>`。严格模式只有**成功读完且至少有一条 UNKNOWN** 才额外返回 `3`，仍输出四行。普通模式沿用 v0，路径和参数失败沿用原诊断。先写自己的判断位置，再按下表检查。

| 输入 | 普通模式退出码 | 严格模式退出码 | 两个模式都要检查 |
| --- | ---: | ---: | --- |
| 页首样例 | 0 | 0 | `3 / 1 / 1 / 0`，stderr 空 |
| 四行值班日志 | 0 | 3 | `1 / 0 / 1 / 1`，stderr 空 |
| 缺失的文件 | 1 | 1 | stdout 空，stderr 只有打开失败诊断 |

照[实验笔记](../../notes/lab-notebook/)记下实际命令、输入和输出，再补两句：第三行为什么只改一个条件就被误计？如果要跨多轮读取保留首词，谁负责保存那些字符？带干净的 v0 结果去做 [v0.1 构建实验](../logscan-build/)。

<details><summary>变式提示与答案</summary>

参数检查时区分旧的两个 `argv` 项和新的三个项。仅在 `argc == 3` 且 `argv[1]` 的文字等于 `"--strict"` 时接受第二种，路径取 `argv[2]`；旧模式仍取 `argv[1]`。沿用打开、读取的提前返回。成功打印四行后再执行 `return strict && counts.unknown != 0 ? 3 : 0;`。

</details>

### 可选扩展

<details><summary>进阶：在不同边界改一处</summary>

- 让 `-` 表示标准输入：入口选择 `std::cin` 或文件流，两种都交给 `scan`。分别留下退出码和输出测试。
- 为 UNKNOWN 记录前 N 个诊断样本：用拥有字符的 `std::string` 保存首词副本。旧视图可能因下一次 `getline` 改写而改变含义，也可能因存储被替换而失效。若用 `vector` 存副本，也别保存跨扩容的元素引用。
- 记总输入字节数为 B、最长一行为 L。按处理字符计费、忽略 I/O 等待，扫描工作量随 B 线性增长，只需保留一行和四个数字。若想限制不可信输入的内存用量，试做有界读取；完整 `getline` 之后才检查长度已经太晚。

</details>

## 分级提示和参考

<details><summary>提示 1：先找分类起点</summary>

用 `find_first_not_of` 找首个非空白字符。整行找不到就返回，不增加 UNKNOWN。

</details>

<details><summary>提示 2：截取恰好一个词</summary>

先用 `remove_prefix(first)` 把视图移到词的首字符，再找下一处空白。把查到的下标给 `substr(0, end)`；若 `end == npos`，它会取到行尾。

</details>

<details><summary>提示 3：把读文件和计数分开</summary>

`scan` 每成功读一行就调 `count_line`，最后把 `Counts` 按值交给 `main`。能拿到数字不代表读成功；先判流状态，再打印。

</details>

<details><summary>完整参考实现：logscan.cpp</summary>

将下面的完整参考实现直接复制到 `$source` 指向的文件 `logscan.cpp`：

{{example:logscan.cpp}}

</details>

## 脱拐杖横向迁移挑战：CsvSum v0

> **规则（15–30 分钟独立迁移）**：不看 `logscan.cpp` 源码、只带上面的「空白页五步破题法」，新建一个独立文件 `csvsum.cpp` 从零写完。本节只给规格与预期输出，**不提供参考代码**。

### 规格说明

实现命令行程序 `csvsum <file>`，按行读取单个文本文件（二进制模式打开，兼容 LF 与 CRLF，末行无换行照常处理）：

1. **空行处理**：空行及只含 ASCII 空白 `" \t\r\n\v\f"` 的行跳过，既不计入合法行，也不计入异常行。
2. **字段切分与校验**：每行有且仅有一个英文逗号 `,`。分别裁掉逗号左右两端的 ASCII 空白得到 `item` 与 `amount`：
   - **合法行（`VALID`）**：`item` 非空，且 `amount` 为纯 ASCII 数字（`0`–`9` 组成、无正负号）并可无溢出解析为 `std::uint64_t`；同时把该数值累加到 `TOTAL`。
   - **异常行（`MALFORMED`）**：缺少逗号、多于一个逗号、`item` 为空、`amount` 为空/含非数字（如负数、小数、字母）或整数溢出，均计入 `MALFORMED`。
3. **退出码与输出流契约**：
   - 正常读至 EOF（含空文件或含 `MALFORMED` 行）：退出码 `0`，`stderr` 为空（0 字节），`stdout` 依次输出三行：`VALID <n>`、`MALFORMED <n>`、`TOTAL <sum>`（零也打印）。
   - 无法打开文件或中途读取失败（`bad() || !eof()`）：退出码 `1`，`stdout` 为空（0 字节），`stderr` 输出 `csvsum: cannot open '<路径>'` 或 `csvsum: cannot read '<路径>'` 加换行。
   - 参数不是一个（`argc != 2`）：退出码 `2`，`stdout` 为空（0 字节），`stderr` 输出 `Usage: csvsum <file>` 加换行。

### 自测夹具与预期结果

构造夹具 `orders.csv`（ASCII，第 3 行为纯空白 `"   \r\n"`）：

```text
apple,12
  banana , 8 
   
bad_row
orange,-3
pear,5,extra
```

| 测试输入 | 退出码 | 预期 `stdout` | 预期 `stderr` |
| --- | ---: | --- | --- |
| `csvsum orders.csv` | 0 | `VALID 2` / `MALFORMED 3` / `TOTAL 20` | 空（0 字节） |
| `csvsum empty.csv`（0 字节） | 0 | `VALID 0` / `MALFORMED 0` / `TOTAL 0` | 空（0 字节） |
| `csvsum missing.csv` | 1 | 空（0 字节） | `csvsum: cannot open 'missing.csv'` |
| `csvsum`（无参数） | 2 | 空（0 字节） | `Usage: csvsum <file>` |

> 自检提示：用 `std::from_chars` 解析 `amount` 时，务必确认 `ptr == end`（整个 `amount` 片段都被消费且 `ec == std::errc{}`），否则 `"12abc"` 会被部分解析而误判为合法！

**参考依据：** N4861 [程序入口](https://timsong-cpp.github.io/cppwp/n4861/basic.start.main) · [标准流](https://timsong-cpp.github.io/cppwp/n4861/narrow.stream.objects) · [文件流构造](https://timsong-cpp.github.io/cppwp/n4861/ifstream.cons) · [文件缓冲区析构](https://timsong-cpp.github.io/cppwp/n4861/filebuf.cons) · [视图修改](https://timsong-cpp.github.io/cppwp/n4861/string.view.modifiers)；[GCC 语言版本选项](https://gcc.gnu.org/onlinedocs/gcc-13.1.0/gcc/Standards.html)。
