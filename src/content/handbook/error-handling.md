---
title: "用返回值和异常表达失败：错误边界与异常保证"
description: "分清 std::optional 缺值与带标签结果结构体的结构化错误，分离 EOF、打开失败与 badbit 读错误，并用临时提交实现强异常保证。"
order: 30
tags: ["C++20", "错误处理", "optional", "异常安全", "状态流"]
related: ["handbook/raii", "handbook/value-move", "labs/logscan"]
sources: ["error-handling.cpp"]
---

## 本课只解决这 1 个问题

写一个多文件日志扫描器时，你会同时遇到四种情况：某一行是纯空白、某一行写着未知首词 `ERROR:`、某个文件打不开或读到一半发生硬件故障、或者内部构造违反不变量抛出异常。如果把这四种情况全混成 `bool` 返回值或者全靠 `throw`，调用方根本分不清该跳过、该计数还是该中止程序。本课解决的核心问题是：**在 C++20 中如何准确选择 `std::optional`、带标签结果结构体与异常，把流状态错误翻译成 CLI 退出码，并用“临时对象 + 成功再提交”守住强异常保证？**

前置要求：完成[RAII 与独占所有权](../raii/)和[类接口、值语义与复制移动](../value-move/)。

## 心智模型：把四类“非正常路径”分到四条轨道

不要把所有问题都叫做“错误”。先按性质分清四条轨道：

| 场景 | 属于错误吗？ | C++20 推荐表达 | 示例 |
| --- | --- | --- | --- |
| 未知日志首词（如 `ERROR:`） | **不是**（合法输入数据） | 普通业务计数字段 | `++counts.unknown` |
| 空白行没有日志级别 / 查无此项 | **不是**（正常缺值） | `std::optional<T>` | 返回 `std::nullopt` |
| 文件打不开、流 `badbit` 读故障 | **是**（预期内外部失败） | **带标签结果结构体** `ScanResult` | `ErrorCode::read_failed` |
| 构造函数参数违约、内存耗尽 | **是**（罕见异常路径） | `throw` 异常 + RAII 栈展开 | `std::invalid_argument` |

> 说明：C++23 标准库新增了 `std::expected<T, E>`；在 **C++20** 工程中，定义一个轻量结构体 `struct ScanResult { Counts counts; ErrorCode error; std::string message; bool ok() const noexcept; };` 是最直观、零额外依赖的标准做法。

### 1. 分离三类流状态，并在 CLI 入口边界做翻译

`while (std::getline(input, line))` 退出循环**并不一定代表正常读到文件尾（EOF）**！先看清 C++ 输入流内部的四个状态标志：

| 状态方法 | 含义 | 在日志扫描里怎么处理 |
| --- | --- | --- |
| `input.good()` | 尚未遇到 EOF，也无任何错误位 | 正常继续读下一行 |
| `input.eof()` | 已经到达输入末尾 | 若没有 `bad()`，属于**正常结束**（`ErrorCode::none`） |
| `input.fail()` | 逻辑提取失败（或 EOF 导致 `getline` 未读到字符） | 必须结合 `!input.eof()` 判断：伴随 EOF 是正常的，否则是故障 |
| `input.bad()` | 底层 I/O 硬件/缓冲区故障（不可恢复） | 必然返回 `ErrorCode::read_failed` |

因此必须把三件事彻底拆开：
- **打开失败**：构造 `std::ifstream file{path};` 后 `!file` 为真 → `ErrorCode::open_failed`。
- **正常结束（含空文件）**：循环退出后 `input.eof() && !input.bad()` → `ErrorCode::none`，计数全为 `0` 也是合法成功！
- **读取故障**：`input.bad()` 或未到 EOF 却 `input.fail()` → `ErrorCode::read_failed`。

同时守住**分层边界**：库层函数（`parse_level`、`scan_stream`）只负责返回结构化结果，绝不在库里私自打印 `std::cerr` 或调用 `std::exit`；由最外层入口统一翻译成诊断和退出码：

```text
库层（可单独单元测试）                        CLI 入口层（main）
  parse_level(line) ──▶ std::optional<Level>
  scan_stream(in)   ──▶ ScanResult{counts, error, msg}
                                │
                                ▼  to_exit_code(error)
                       ErrorCode::none        ──▶ 写 stdout，退出码 0
                       open_failed/read_failed──▶ 写 stderr，退出码 1
                       命令行参数数量错误      ──▶ 写 stderr，退出码 2
```

### 2. 基本保证 vs 强保证：“先算进临时对象，成功再提交”

当多文件聚合中途失败（或操作抛异常）时，外部总计 `total` 会留下什么状态？C++ 工程用两个等级来精确描述：

- **基本保证（Basic Guarantee）**：依托 RAII 绝不泄漏文件或内存，对象仍处于有效状态（可析构、可复用），但**可能已被改到一半**。例如边读 `file2` 边直接 `++total.info`，读到第 50 行时发生 `badbit`，`total` 里就永远混进了 `file2` 的半截脏计数。
- **强保证（Strong Guarantee，提交或回滚）**：要么整体成功，要么**调用方状态纹丝不动**。写法极其简单：

```text
【弱/基本做法】直接修改 total：
  total (file1 已有数据) ◀── file2 第 1 行写入 ──▶ 第 2 行 badbit 失败！
  结果：total 被污染，无法回退！

【强保证做法】先写临时对象 temp，成功后再 commit：
  temp = scan_stream(file2) ──▶ 发生 badbit 失败！直接丢弃 temp，返回错误码
  结果：total 完整保留 file1 的计数，file2 的半成品一丝未混入！
```

<details>
<summary>深入一步：为什么提交步骤最好标成 <code>noexcept</code>？</summary>

强保证的核心结构是“**可能失败/抛异常的工作全在临时对象里做完 + 最后一步绝不失败地提交**”。
- 在 `error-handling.cpp` 中，`Counts::add(const Counts&) noexcept` 只做四次整数加法，绝不会抛异常；
- 对于持堆内存的容器（如 `std::vector`、`std::string`），提交步骤通常用 `noexcept` 的 `std::swap` 或移动赋值完成（经典 **copy-and-swap** 手法），从而在异常路径下也严格守住强保证。

</details>

## 最小可运行代码与逐行追踪

在练习目录新建 `error-handling.cpp` 并写入下面的代码，编译运行即可一次验证空流正常 EOF、预置 `badbit` 读失败、`file1` 正常提交 + `file2` 注入失败后的强保证，以及缺失文件的 `open_failed`：

{{example:error-handling.cpp}}

编译并运行：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic error-handling.cpp -o error-handling.exe
.\error-handling.exe
```

核对输出：

```text
empty ok=true exit=0
empty: INFO=0 WARN=0 ERROR=0 UNKNOWN=0
bad ok=false exit=1 msg=stream already bad: broken.log
merge file1 exit=0
total after file1: INFO=1 WARN=1 ERROR=0 UNKNOWN=1
merge file2 exit=1 diag=stream already bad: file2.log
total after file2: INFO=1 WARN=1 ERROR=0 UNKNOWN=1
missing file open_failed=true exit=1
```

对照执行表检查每一条边界路径：

| 场景 | 输入特征 | `parse_level` / 流状态 | 返回 `ErrorCode` | `to_exit_code` | `total` 状态变化 |
| --- | --- | --- | --- | --- | --- |
| 1. 空正常流 | `""` | `getline` 首次即遇正常 EOF | `none` | `0` | 零计数且 `ok()==true` |
| 2. 预置故障流 | 设 `badbit` | 入口立即检测到 `input.bad()` | `read_failed` | `1` | 暴露诊断，计数清零 |
| 3. 聚合 `file1` | 首行前导空格 + 空行 + `ERROR:` + `WARN` | 空行返 `nullopt` 跳过；`ERROR:` 记 `unknown` | `none` | `0` | 提交为 `1 / 1 / 0 / 1` |
| 4. 聚合 `file2` | 设 `badbit` | `temp` 失败，未进入 `total.add(...)` | `read_failed` | `1` | **保持 `1 / 1 / 0 / 1` 不变** |
| 5. 缺文件 | 不存在路径 | `std::ifstream` 为假（`!missing_file`） | `open_failed` | `1` | 明确区分为打开失败 |

## 1 行反例坑点（千万别踩）

### 坑 1：未判空就解引用 `std::optional`

```cpp
auto level = parse_level("   ");
Level v = *level; // 致命反例：level 为 std::nullopt 时直接解引用是未定义行为！
```

取 `std::optional` 里的值之前，要么先用 `if (level.has_value())` / `if (level)` 检查，要么用带默认值的 `level.value_or(Level::unknown)`，或者在愿意接受异常时调用 `level.value()`（为空时会抛出 `std::bad_optional_access`）。

### 坑 2：把 `getline` 返回假一律当成正常读完

```cpp
while (std::getline(input, line)) { /* ... */ }
return result; // 反例：漏查 input.bad()！硬盘/管道读错误被悄悄当成“正常读完 0 行”！
```

循环结束后必须检查 `input.bad() || (!input.eof() && input.fail())`，才能把真正的 I/O 故障和正常 EOF 区分开。

### 坑 3：边解析边直接修改外部累计状态

```cpp
// 反例：破坏强保证
while (std::getline(input, line)) {
    ++total.info; // 若后续行触发 badbit，前面累加的脏计数已经收不回来了！
}
```

先把单文件读进局部 `ScanResult temp`，确认 `temp.ok()` 后再一次性合并进 `total`。这一模式不仅防错误码失败，也天然防异常（哪怕 `std::string` 分配抛 `std::bad_alloc`，`total` 同样毫发无损）。

### 坑 4：在库函数里直接 `std::exit(1)`

```cpp
if (!file) { std::exit(1); } // 反例：直接跳过栈展开（局部 RAII 对象不会析构），且无法做单元测试！
```

库函数应该返回 `ErrorCode`（或抛异常）把决策权交还调用方；只有 `main` 负责返回进程退出码。

## 4 个梯度微练习

### 练习 1（读代码判边界）

如果向 `scan_stream` 传入包含两行内容 `"   \t\r\n\n"`（全是空白字符）的正常 `std::istringstream`，返回值 `r.ok()`、`r.counts` 的四个字段以及 `to_exit_code(r.error)` 分别是什么？

<details>
<summary>核对答案</summary>

- `r.ok()` 为 `true`；
- `r.counts` 四个字段全为 `0`（两行空白都被 `parse_level` 返回 `std::nullopt` 跳过，**不会**计入 `unknown`）；
- `to_exit_code(r.error)` 为 `0`。

</details>

### 练习 2（找 Bug 并修复：`optional` 安全取值）

下面函数想把日志行转成标签文本，空白行返回 `"EMPTY"`，但存在未定义行为风险，请用两种安全方式修复它：

```cpp
std::string_view label_of(std::string_view line) {
    auto lvl = parse_level(line);
    if (*lvl == Level::info) return "INFO"; // Bug！
    return "OTHER";
}
```

<details>
<summary>提示与答案</summary>

当 `line` 是空白行时，`lvl` 是 `std::nullopt`，`*lvl` 直接触发未定义行为。
- 修复方式 A（显式判空）：
```cpp
if (!lvl.has_value()) return "EMPTY";
if (*lvl == Level::info) return "INFO";
```
- 修复方式 B（若只需区分 `INFO` 与非 `INFO`，可用 `lvl.value_or(...)` 或 `lvl == Level::info`——注意 C++17 起 `std::optional<T>` 支持直接与 `T` 做 `==` 比较，空 `optional` 与任何 `T` 比较都安全返回 `false`）。

</details>

### 练习 3（对比两种多文件聚合策略）

在 `error-handling.cpp` 中，`merge_stream_strong` 实现了**按文件提交**（`file1` 成功保留，`file2` 失败不提交）。如果某项目要求**整批原子提交**（只要列表里任意一个文件失败，最终总计 `total` 必须保持调用前原样，一个文件的计数都不提交），你该如何基于 `scan_stream` 写出 `merge_batch_atomic`？

<details>
<summary>参考思路</summary>

再套一层批级临时对象即可：先在函数内创建 `Counts batch_temp{};`，遍历所有输入流调用 `scan_stream`；只要任意一份 `!res.ok()` 就直接返回该错误（外层的 `total` 根本没动过）；只有循环全部成功后，在函数最后一行执行 `total.add(batch_temp);`。

</details>

### 练习 4（独立实验：模拟“读完一行后中途故障”验证强保证）

在 `error-handling.cpp` 中，把 `file2` 改成先正常读出一行 `"INFO half-done\n"` 后、再在自定义辅助函数中手动触发 `badbit`（或者在 `scan_stream` 循环读到第 2 行前人为设置故障分支），验证两点：
1. 若采用强保证（临时 `ScanResult`），失败后 `total.info` **没有**增加那条 `"INFO half-done"`；
2. 诊断消息 `diag` 准确包含失败来源名 `"file2.log"` 且 `to_exit_code` 为 `1`。

<details>
<summary>参考提示</summary>

可以写一个带注入开关的辅助函数 `scan_stream_with_fault(std::istream& input, std::string_view label, bool fail_after_first_line)`：在循环读完第一行并递增 `result.counts` 后，若 `fail_after_first_line` 为真则调用 `input.setstate(std::ios::badbit)` 并 `break;`。随后循环外的 `if (input.bad() ...)` 会清空 `result.counts` 并置 `ErrorCode::read_failed`，`merge_stream_strong` 不会把半截计数提交到 `total`。

</details>
