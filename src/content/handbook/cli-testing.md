---
title: "写测试和定位错误"
description: "用 LogScan 练习写可重复的单元与 CLI 测试，从失败输出缩小问题，再用 CLion 验证猜测。"
order: 60
tags: ["C++20", "CTest", "CLI", "调试"]
related:
  - handbook/cmake-targets
  - handbook/command-line-git
  - labs/logscan-build
  - notes/lab-notebook
sources: []
---

## 从一个容易漏掉的输入开始

给 LogScan 两份各只有一行的输入：`ERROR` 和 `ERROR:`，都不加末尾换行。任务是让测试在误把第二行算进 `ERROR` 时指出差异。先修：[CMake 目标](../../handbook/cmake-targets/)的配置与构建，以及 [LogScan v0.1 实验](../../labs/logscan-build/)的输入输出约定。本课用实验页的参考工程，从该页下载并解压到独立练习目录。

LogScan 把第一段连续的非空白字符叫作**首词**，源码里记作 `token`。它跳过开头空白，保留词内标点；纯空白行不计数。先按约定预测两份输入分别会增加哪个计数，再对照 [`logscan_core.cpp`](../../examples/logscan-build/logscan_core.cpp) 走一遍。每次 `scan` 的四项计数都从零开始：

| 输入 | `getline` 交给 `count_line` | 截取首词后走哪条分支 | INFO / WARN / ERROR / UNKNOWN |
| --- | --- | --- | --- |
| `ERROR` | `ERROR` | 截到末尾，`token == "ERROR"` 为真，`++counts.error` | `0 / 0 / 1 / 0` |
| `ERROR:` | `ERROR:` | 冒号留在词内，三次相等比较均失败，`++counts.unknown` | `0 / 0 / 0 / 1` |

`getline` 到输入末尾之前已经读到了字符，所以即使没有末尾换行，这一行也会进入循环。预期要从规则推出；如果把错误程序的当前输出填进预期，测试就会把错误保留下来。

## 选择在哪一层检查

| 想检查什么 | 怎么调用 | 比较什么 |
| --- | --- | --- |
| 分类和计数 | **单元测试**直接调用 `scan`，用 `std::istringstream` 把内存中的字符串当输入流 | 返回的四个计数 |
| 路径、文件和对外行为 | **CLI 测试**启动真实的命令行程序，传文件路径或故意传错参数 | 退出码、标准输出、标准错误 |

`stdout`（标准输出）是正常结果的通道，`stderr`（标准错误）是诊断的通道；**退出码**是进程结束时交给调用方的数字。计数都正确，诊断仍有可能走错通道。

## 写下预期，再写断言

打开练习副本的 [`tests/unit.cpp`](../../examples/logscan-build/tests/unit.cpp)。以下是它的测试函数签名，以及 `main` 里现成的调用，不必另建程序：

```cpp
// name 是失败时显示的用例名，text 是输入，expected 是四项预期计数。
bool check_scan(const char* name, const char* text, logscan::Counts expected);

// 检查失败时，给失败数加 1。
failures += !check_scan("punctuation is part of the token", "ERROR:", {.unknown = 1});
```

`check_scan` 用 `text` 构造输入流，调用头文件声明的 `logscan::Counts scan(std::istream& input)`。此例只指定 `expected.unknown` 为 1，其余字段按 `Counts` 的默认值为 0。比较 `actual == expected` 时，四项相等就返回 `true`，外面的 `!` 把结果翻成 `false`，失败数加 0；不等就向标准错误打印用例名、预期和实际值，返回 `false`，失败数加 1。最后 `main` 按失败数返回 0 或 1，Release 构建也会执行这些比较。

再开 [`tests/cli.cmake`](../../examples/logscan-build/tests/cli.cmake)。脚本通过 `execute_process` 启动 `logscan`，用 `RESULT_VARIABLE`、`OUTPUT_VARIABLE`、`ERROR_VARIABLE` 分别接住退出码、标准输出和标准错误。脚本为每个用例准备独立工作目录；成功用例在那里创建 `sample input.log`，并把带空格的文件名作为一个参数传入。

| CTest 名称与参数 | 退出码 | stdout | stderr |
| --- | ---: | --- | --- |
| `cli_success`，`"sample input.log"` | 0 | `INFO 1`、`WARN 1`、`ERROR 1`、`UNKNOWN 1`，各占一行 | 空 |
| `cli_missing_file`，`missing.log` 不存在 | 1 | 空 | `logscan: cannot open 'missing.log'` |
| `cli_no_args`，无参数 | 2 | 空 | `Usage: logscan <file>` |
| `cli_extra_args`，`first.log second.log` | 2 | 空 | `Usage: logscan <file>` |

成功用例的输入是 `"  INFO start\n\tWARN\n\nERROR:\nERROR"`。从全零开始，先加 INFO，再加 WARN，跳过空行，`ERROR:` 加 UNKNOWN，末尾的 `ERROR` 加 ERROR。确认读取成功后，程序按表中固定顺序打印。脚本只把 CRLF 统一成 LF；所有非空输出的末尾换行、空格和行顺序也要匹配。

### 在 CTest 里跑基线

在 PowerShell 进入解压后**含 `CMakeLists.txt`** 的目录。下面用 CMake 3.20+（含 `ctest`）、Ninja、支持 C++20 的 MinGW `g++`。若终端找不到工具，参考 [LogScan 构建实验](../../labs/logscan-build/)用 CLion 随附程序的完整路径。

```powershell
Get-Command cmake, ctest, ninja, g++ -ErrorAction Stop
cmake -S . -B build-tests -G Ninja -DCMAKE_CXX_COMPILER=g++ -DCMAKE_BUILD_TYPE=Debug -DBUILD_TESTING=ON
if ($LASTEXITCODE -ne 0) { throw 'Configure failed' }
cmake --build build-tests
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
ctest --test-dir build-tests -N
ctest --test-dir build-tests --output-on-failure
$LASTEXITCODE
```

工程用 `add_test(NAME unit_scan COMMAND logscan_unit_tests)` 注册单元测试，CMake 会找到该目标所生成的程序。另四项各运行一次 CLI 脚本。CTest 的 `-N` 只列测试，预期共 **5 项**；正式运行应为 **5 项通过**，CTest 自身退出码为 `0`。`unit_scan` 只算一项，其中调用了七次 `check_scan`。若显示零项，核对构建目录、`BUILD_TESTING` 和配置结果；若找不到程序，先完整构建，CTest 不会代为编译。

## CTest 报红后，先找第一个不一致

只在练习副本中把 `logscan_core.cpp` 里的 `token == "ERROR"` 改成 `token.starts_with("ERROR")`。先预测：`ERROR:` 的首词会变吗？接着在同一源码目录运行：

```powershell
cmake --build build-tests
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
ctest --test-dir build-tests -R '^(unit_scan|cli_success)$' --output-on-failure
$LASTEXITCODE
```

构建仍成功，选中的两项应失败，CTest 退出非零。先从 `unit_scan` 找到最小输入：`punctuation is part of the token` 报出 `expected 0/0/0/1, got 0/0/1/0`。再看 `cli_success` 的 `success: stdout mismatch`：ERROR 从 1 变成 2，UNKNOWN 从 1 变成 0。首词仍为 `ERROR:`，只是现在通过了前缀判断，走进 `++counts.error`。

可在 CLion 的 Debug 配置里验证：将工作目录设为 `build-tests/cli-fixtures/success` 的绝对路径，参数填 `"sample input.log"`。在改动行设断点，继续到 `token` 为 `ERROR:` 的那次，单步看 `counts.error` 从 0 变 1。若看到的首词已经截成 `ERROR`，就该先查分词；这次冒号仍在，问题出在比较条件。

改回完整首词比较，重建后先重跑这两项，再去掉 `-R` 跑全套。记录用例名、预期、实际值和恢复后的五项结果；如果做了断点观察，再记下当时的 `token`。

## 练习：先预测失败落在哪一层

在练习副本的 `tests/unit.cpp` 新增 `warn punctuation and CRLF` 用例。第一行字节是 `"\tWARN:\r\n"`，第二行是 `"WARN\tERROR\r\n"`，第三行是 `" \t\r\n"`。先预测四项计数，再用现成的 `check_scan` 检查。

验收：新用例加在 `unit_scan` 内，基线仍是 CTest 五项通过。只把 `token == "WARN"` 换成前缀匹配，重建并跑全套；应只有 `unit_scan` 失败，日志须含新用例名、预期和实际计数。恢复比较并重跑五项。

<details><summary>提示与参考答案</summary>

首行的首词保留冒号，第二行只取制表符前的 `WARN`，第三行不计数。在现有 `main` 的最后一条 `check_scan` 之后、`return` 之前加入：

```cpp
// 第一行是未知首词，第二行才是 WARN，第三行跳过。
failures += !check_scan("warn punctuation and CRLF",
                        "\tWARN:\r\nWARN\tERROR\r\n \t\r\n",
                        {.warn = 1, .unknown = 1});
```

误用前缀判断后，实际计数应从 `0/1/0/1` 变成 `0/2/0/0`。现有 CLI 成功用例只有完整的 `WARN`，所以仍然通过。

</details>

<details><summary>进阶：退出码相同，契约也会坏吗？</summary>

在练习副本的 `main.cpp` 中，只把「打不开文件」分支的 `std::cerr` 改成 `std::cout`。预计 `cli_missing_file` 先报 `stdout mismatch`，因为标准输出多了诊断。标准错误也成了空，只是脚本在第一处差异就停了。退出码仍是 1，`unit_scan` 不经过入口，仍会通过。试完改回 `std::cerr`。

</details>

参考：[N4861 的 getline 规则](https://timsong-cpp.github.io/cppwp/n4861/string.io)、[字符串视图的前缀检查](https://timsong-cpp.github.io/cppwp/n4861/string.view.ops)、[CMake 的 add_test](https://cmake.org/cmake/help/v3.20/command/add_test.html)、[execute_process](https://cmake.org/cmake/help/v3.20/command/execute_process.html)及 [CTest 命令手册](https://cmake.org/cmake/help/v3.20/manual/ctest.1.html)。
