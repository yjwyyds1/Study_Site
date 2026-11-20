---
title: "LogScan v1：多文件聚合与确定顺序报告"
description: "将单文件 LogScan 升级为多文件批量聚合工具，落实整批失败契约、确定顺序报告、流 badbit 故障验证与跨平台回归测试。"
order: 2
tags: ["LogScan", "C++20", "CLI", "多文件聚合", "流状态"]
related:
  - labs/logscan
  - labs/logscan-build
  - handbook/cli-testing
  - handbook/cmake-targets
  - labs/logscan-v2
sources:
  - logscan-v1.cpp
  - sample.log
---

## 本实验解决什么问题

在 [LogScan v0](../logscan/) 和 [LogScan v0.1](../logscan-build/) 里，程序只接受**恰好一个**文件路径，多传一个参数就会退出 `2`。可现实中日志常按小时或实例切分成多个文件（如 `shift.log`、`warn.log`、`empty.log`），值班同学希望一条命令就能拿到合并后的总览：

```text
logscan <file> [file ...]
```

这次升级只增加一个能力——**多文件聚合**——但必须同时守住两条工程底线：
1. **确定顺序报告**：无论文件参数以什么顺序传入，输出永远是固定的四行 `INFO / WARN / ERROR / UNKNOWN`，且结果满足加法交换律。
2. **整批失败契约**：只要批次中任意一个文件打不开或中途读失败（`badbit`），整次调用必须失败退出 `1`，**标准输出保持 0 字节**，绝不把前几个文件的半成品统计漏给下游脚本。

先修：完成 [LogScan v0.1](../logscan-build/)，熟悉 [CLI 测试](../../handbook/cli-testing/) 与 [CMake 目标](../../handbook/cmake-targets/)。

## 输入与输出契约（E1）

沿用 v0 的首词分类规则：只认 ASCII 空白 `" \t\n\r\v\f"`，二进制模式读入以兼容 LF（`\n`）和 Windows CRLF（`\r\n`），空行与纯空白行跳过，末行无换行照常计入。首词严格区分大小写匹配 `INFO`、`WARN`、`ERROR`，其余归入 `UNKNOWN`。

| 情况 | 退出码 | 标准输出（stdout） | 标准错误（stderr） |
| --- | ---: | --- | --- |
| 1 个或多个文件全部读完（含空文件） | 0 | 固定四行 `INFO / WARN / ERROR / UNKNOWN`，零也打印 | 空 |
| 任意文件无法打开 | 1 | **空（0 字节）** | `logscan: cannot open '<路径>'` + `\n` |
| 任意文件读取中途失败（`badbit` 或未到 EOF） | 1 | **空（0 字节）** | `logscan: cannot read '<路径>'` + `\n` |
| 0 个文件路径参数（`argc < 2`） | 2 | **空（0 字节）** | `Usage: logscan <file> [file ...]` + `\n` |

> **与 v0.1 的契约变化**：原 v0.1 中「多参数退出 2」的 `cli_extra_args` 用例在 v1 中转为**多文件成功用例**；无参数仍退出 `2`。

## 心智模型：整批失败 vs 逐文件提交

多文件处理有两种完全不同的失败策略，区别在于**何时向 `stdout` 写出结果**：

```text
[argv[1], argv[2], ..., argv[argc-1]]
       │
       ▼  逐个文件打开 -> scan(input) -> 检查 bad()/!eof()
  ┌──────────────────────────┐
  │ 内存聚合器 Counts total  │  ← 任一文件失败：立即写 stderr 并 return 1
  └──────────────────────────┘     (stdout 从未被触碰，保持 0 字节！)
       │  全部文件干净读到 EOF
       ▼
  print_summary(std::cout, total)  → 一次性提交确定顺序报告，return 0
```

| 维度 | 整批失败（Whole-batch failure，v1 采用） | 逐文件提交（Per-file commit） |
| --- | --- | --- |
| 第 2 个文件缺失时 `stdout` | 0 字节（干净无脏输出） | 已写出第 1 个文件的局部统计 |
| 下游管道 `logscan a b > report.txt` | 文件为空且 `$? == 1`，脚本可安全中止 | `report.txt` 混入残缺数据，极易被误当成完整报表 |
| 内存代价 | 仅多存一个 32 字节的 `Counts total` | 几乎相同，却牺牲了输出原子性 |
| 适用场景 | 批处理聚合、CI 门禁、财务/运维汇总 | 流式长连接、允许局部成功并单独标注失败项的采集器 |

## 五步破题脚手架（从零写出多文件聚合工具）

1. **先改契约边界**：把参数条件从 `argc != 2` 放宽为 `argc < 2`，把「任一文件失败即 `stdout` 零字节退出 `1`」写进需求清单。
2. **给结果结构加聚合运算**：为计数结构体实现 `operator+=`，确保多文件累加满足交换律且顺序无关。
3. **把流检查收拢到核心辅助函数**：写 `scan_stream_strict(istream&, Total&)`，只有 `!bad() && eof()` 时才把局部结果加回 `Total`。
4. **把 `stdout` 打印推迟到循环外**：整个 `for (int i = 1; i < argc; ++i)` 全部成功后才调用 `print_summary(std::cout, total)`。
5. **用四组边界验收**：交换参数顺序、混入空文件、末尾拼一个缺失文件（测 `stdout` 为 0 字节）、单测流注入 `badbit`。

## 完整可运行代码（C++20）

完整参考实现如下（在临时练习目录新建 `logscan-v1.cpp` 并写入下面代码）：

{{example:logscan-v1.cpp}}

### 逐文件执行追踪表

假设 `shift.log` 内容为 `"INFO ready\n  ERROR\nERROR:\n\n"`，`warn.log` 内容为 `"WARN slow\n"`，`empty.log` 为空文件，`absent.log` 不存在：

| 调用序列 | 文件步骤 | 局部 `partial` | 流状态检查 | 聚合后 `total` | 最终行为 |
| --- | --- | --- | --- | --- | --- |
| `shift.log empty.log warn.log` | 1. `shift.log` | `1/0/1/1` | `eof=1, bad=0` | `1/0/1/1` | 继续下一个文件 |
| （同上） | 2. `empty.log` | `0/0/0/0` | `eof=1, bad=0` | `1/0/1/1` | 空文件不报错，继续 |
| （同上） | 3. `warn.log` | `0/1/0/0` | `eof=1, bad=0` | `1/1/1/1` | 循环结束，写 `stdout` 并退出 `0` |
| `shift.log absent.log` | 1. `shift.log` | `1/0/1/1` | `eof=1, bad=0` | `1/0/1/1` | 仅存于内存，`stdout` 仍空 |
| （同上） | 2. `absent.log` | 未执行 | `!input` 为真 | 丢弃 | 写 `stderr` 含路径，退出 `1`，`stdout` 为空 |
| 第 2 个流置 `badbit`（单测） | 2. 测试流 | 读首行后置 `badbit` | `bad()==true` | 丢弃 | `scan_stream_strict` 返回 `false`，走同契约退出 `1` |

## 跨平台构建与测试命令

### Windows PowerShell（MinGW g++）

```powershell
$work = Join-Path ([IO.Path]::GetTempPath()) "logscan-v1-$([guid]::NewGuid())"
New-Item -ItemType Directory -Path $work | Out-Null
$exe = Join-Path $work 'logscan.exe'
g++ -std=c++20 -Wall -Wextra -Wpedantic .\public\examples\logscan-v1.cpp -o $exe

$ascii = [Text.Encoding]::ASCII
$f1 = Join-Path $work 'shift.log'
$f2 = Join-Path $work 'warn.log'
$empty = Join-Path $work 'empty.log'
$crlf = Join-Path $work 'crlf.log'
$absent = Join-Path $work 'absent.log'  # 故意不创建

[IO.File]::WriteAllText($f1, "INFO ready`n  ERROR`nERROR:`n`n", $ascii)
[IO.File]::WriteAllText($f2, "WARN slow`n", $ascii)
[IO.File]::WriteAllText($empty, "", $ascii)
[IO.File]::WriteAllText($crlf, "INFO ok`r`nWARN retry`r`nERROR fail`r`n", $ascii)

& $exe $f1 $f2; "exit=$LASTEXITCODE"
& $exe $f2 $f1; "exit=$LASTEXITCODE"
& $exe $f1 $empty $f2; "exit=$LASTEXITCODE"
& $exe $crlf; "exit=$LASTEXITCODE"
& $exe $f1 $absent; "exit=$LASTEXITCODE"
& $exe; "exit=$LASTEXITCODE"
```

### Linux / WSL2（bash + CMake/CTest）

```bash
WORK=$(mktemp -d)
g++ -std=c++20 -Wall -Wextra -Wpedantic public/examples/logscan-v1.cpp -o "$WORK/logscan"
printf 'INFO ready\n  ERROR\nERROR:\n\n' > "$WORK/shift.log"
printf 'WARN slow\n' > "$WORK/warn.log"
: > "$WORK/empty.log"
printf 'INFO ok\r\nWARN retry\r\nERROR fail\r\n' > "$WORK/crlf.log"

"$WORK/logscan" "$WORK/shift.log" "$WORK/warn.log"
"$WORK/logscan" "$WORK/warn.log" "$WORK/shift.log"
"$WORK/logscan" "$WORK/shift.log" "$WORK/empty.log" "$WORK/warn.log"
"$WORK/logscan" "$WORK/shift.log" "$WORK/absent.log" >"$WORK/out.txt" 2>"$WORK/err.txt"; echo "exit=$?"
wc -c "$WORK/out.txt" && cat "$WORK/err.txt"
"$WORK/logscan" >"$WORK/noarg.out" 2>"$WORK/noarg.err"; echo "exit=$?"
rm -rf "$WORK"
```

若基于 v0.1 的 CMake 工程改造，请在干净目录运行完整构建与测试：

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
ctest --test-dir build --output-on-failure
```

## 验收对照表

| 用例名称 | 输入参数 | 预期退出码 | 预期 `stdout` | 预期 `stderr` |
| --- | --- | ---: | --- | --- |
| 两文件聚合 | `shift.log warn.log` | 0 | `INFO 1` / `WARN 1` / `ERROR 1` / `UNKNOWN 1` | 空 |
| 交换路径顺序 | `warn.log shift.log` | 0 | 与上一条逐字节完全一致（`1/1/1/1`） | 空 |
| 混入空文件 | `shift.log empty.log warn.log` | 0 | 计数保持不变（`1/1/1/1`） | 空 |
| CRLF 换行 | `crlf.log` | 0 | `INFO 1` / `WARN 1` / `ERROR 1` / `UNKNOWN 0` | 空 |
| 批次中缺文件 | `shift.log absent.log` | 1 | **空（0 字节）** | `logscan: cannot open '...absent.log'` |
| 0 个参数 | （无参数） | 2 | **空（0 字节）** | `Usage: logscan <file> [file ...]` |
| 第 2 流 `badbit` 注入 | 单测流读出首条后置 `badbit` | 1（或 `false`） | **空（0 字节）** | `logscan: cannot read '<路径>'` |

## 3 个一行就会踩中的反例坑

1. **在 `for` 循环里直接打印**：`for (...) { ... print_summary(std::cout, partial); }` —— 反例：传入 `shift.log absent.log` 时，`stdout` 会先吐出第 1 个文件的计数再退出 `1`，破坏整批失败契约。
2. **用 `if (!input)` 判断读错误**：`while (getline(...)) {} if (!input) return 1;` —— 反例：正常读到 EOF 也会同时设置 `failbit`，导致所有正常文件都被误判为 `cannot read`；必须写成 `if (input.bad() || !input.eof())`。
3. **忘记把 `argc != 2` 改成 `argc < 2`**：沿用 v0 的判断会让 `logscan a.log b.log` 直接触发用法错误退出 `2`。

## 4 个循序渐进的微练习

### 练习 1（基础）：解释交换顺序不变性
为什么传入 `shift.log warn.log` 与 `warn.log shift.log` 得到的输出逐字节相同？如果需求变成「为每个文件单独打印一行小计」，交换顺序后输出还会一样吗？

<details><summary>提示与参考答案</summary>

`Counts::operator+=` 执行整数加法，满足交换律；`print_summary` 的输出顺序写死为 `INFO -> WARN -> ERROR -> UNKNOWN`，不依赖文件名顺序。若按文件分别输出小计，除非先对路径排序，否则输出会随参数顺序变化。

</details>

### 练习 2（边界）：重复传入同一个文件路径
执行 `logscan shift.log shift.log` 时，程序应该报错还是把计数翻倍为 `2 / 0 / 2 / 2`？

<details><summary>提示与参考答案</summary>

按 E1 契约，CLI 按参数列表逐个扫描并累加，**不去重路径**，因此结果为 `2 / 0 / 2 / 2`、退出 `0`（与 Unix `wc -l a.log a.log` 的直觉一致）。每次循环的 `std::ifstream` 独立打开并在本轮末尾由 RAII 自动关闭，不会发生句柄泄漏。

</details>

### 练习 3（故障注入）：用测试流模拟第 2 个文件的 `badbit` 读取失败
真实磁盘很少在测试时刚好坏道，请写一段 C++20 单元测试代码，模拟「第 1 个流正常读完，第 2 个流读出首行后被置 `std::ios::badbit`」，验证 `scan_stream_strict` 返回 `false` 且不污染已累计的总数。

<details><summary>提示与参考答案</summary>

自定义一个轻量 `std::streambuf` 或在单测里先读一行再调用 `second.setstate(std::ios::badbit)`：

```cpp
#include <cassert>
#include <sstream>

void test_second_stream_badbit() {
    Counts total{};
    std::istringstream first("INFO ok\n");
    assert(scan_stream_strict(first, total) == true);
    assert(total.info == 1);

    std::istringstream second("WARN half\nERROR lost\n");
    std::string line;
    assert(static_cast<bool>(std::getline(second, line)));  // 先读出首行
    second.setstate(std::ios::badbit);                      // 注入硬件/IO 错误
    const Counts before = total;
    assert(scan_stream_strict(second, total) == false);
    assert(total.info == before.info && total.warn == before.warn);
}
```

如果被测函数把 `partial` 提前加进 `total`，最后一条断言会立刻抓出回归。

</details>

### 练习 4（进阶拓展）：确定顺序的 Top-K 未知词统计
在 `docs/curriculum/logscan.md` 的可选拓展里，要求统计 `UNKNOWN` 首词的 Top-K：按**词频降序**排列，频率相同时按**词典序升序**排列。请写出比较器 Lambda，并说明如何用「全量排序」做小规模正确性对照。

<details><summary>提示与参考答案</summary>

```cpp
using WordCount = std::pair<std::string, std::uint64_t>;
auto cmp = [](const WordCount& a, const WordCount& b) {
    if (a.second != b.second) return a.second > b.second;  // 词频降序
    return a.first < b.first;                              // 同频词典序升序
};
```

小规模对照法：把 `std::unordered_map<std::string, std::uint64_t>` 全部拷进 `std::vector<WordCount>`，用 `std::sort(..., cmp)` 全量排序后取前 `K` 项；将其输出与 `std::partial_sort` 或大小为 `K` 的小顶堆结果逐项比对，确保同频打平规则完全一致。

</details>

## 折叠参考说明：为什么把核心拆成 `scan_stream_strict`？

<details><summary>展开查看设计动机</summary>

在 `logscan-v1.cpp` 中，我们故意把流读取与流状态检查封装成 `bool scan_stream_strict(std::istream& input, Counts& total)`，而不是全部塞进 `main`：
1. **可测试性**：`std::istream&` 既能接 `std::ifstream`（真实文件），也能接 `std::istringstream`（内存单测和 `badbit` 故障注入）。
2. **原子累加**：先算出 `const Counts partial = scan(input);`，确认 `!input.bad() && input.eof()` 后才执行 `total += partial;`，确保失败时不会留下半截增量。
3. **面向 v2 演进**：下一站 [LogScan v2](../logscan-v2/) 会复用同样的解析核心，把结果写入 Linux 上的 SQLite 数据库，并用事务把“整批失败”从内存延伸到磁盘持久化。

</details>

## 脱拐杖横向迁移挑战：CsvSum v1

> **规则（15–30 分钟独立迁移）**：把你的 `CsvSum v0.1` 升级为多文件批量聚合工具 `csvsum <file> [file ...]`，独立落地整批失败契约，不给现成源码。

### 契约与要求

1. **命令行参数**：`argc < 2` 时向 `stderr` 输出 `Usage: csvsum <file> [file ...]` 并退出 `2`，`stdout` 为 0 字节。
2. **多文件聚合与顺序无关**：依次扫描 `argv[1] ... argv[argc-1]` 并累加 `VALID`、`MALFORMED`、`TOTAL`；若所有文件都干净读完（含空文件、重复路径），退出码 `0`，`stdout` 输出汇总三行，`stderr` 为空。
3. **整批失败（零脏输出）**：只要批次中任意文件无法打开或中途读取失败（`bad() || !eof()`），立即向 `stderr` 输出 `csvsum: cannot open/read '<路径>'` 并退出 `1`，**`stdout` 必须保持 0 字节**。
4. **单测故障注入**：在 `tests/unit.cpp` 新增测试，先正常读完一个 `istringstream`，再对第二个 `istringstream` 读出首行后调用 `setstate(std::ios::badbit)`，断言严谨版扫描函数返回 `false` 且不污染已累计的 `VALID / MALFORMED / TOTAL`。

### 预期验收表

假设 `a.csv` 为 `"apple,10\nbad_line\n"`，`b.csv` 为 `"pear,5\n"`，`empty.csv` 为空文件，`absent.csv` 不存在：

| 命令 | 退出码 | 预期 `stdout` | 预期 `stderr` |
| --- | ---: | --- | --- |
| `csvsum a.csv b.csv` | 0 | `VALID 2` / `MALFORMED 1` / `TOTAL 15` | 空 |
| `csvsum b.csv a.csv` | 0 | 与上一条逐字节一致（`2 / 1 / 15`） | 空 |
| `csvsum a.csv empty.csv a.csv` | 0 | `VALID 2` / `MALFORMED 2` / `TOTAL 20` | 空 |
| `csvsum a.csv absent.csv` | 1 | **空（0 字节）** | `csvsum: cannot open '...absent.csv'` |
| `csvsum` | 2 | **空（0 字节）** | `Usage: csvsum <file> [file ...]` |
