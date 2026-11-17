---
title: "LogScan v0.1：拆分、构建与测试"
description: "把单文件 LogScan 拆成 CMake 目标，重跑 v0 契约，并在 CLion 定位一次真实的分类回归。"
order: 70
tags: ["LogScan", "C++20", "CMake", "CTest", "CLion"]
related:
  - labs/logscan
  - handbook/cmake-targets
  - handbook/command-line-git
  - handbook/cli-testing
  - notes/lab-notebook
sources: ["sample.log"]
---

## 交付目标

把 [v0](../../labs/logscan/) 的四行值班日志交给拆分后的程序：`"INFO ready\n  ERROR\nERROR:\n\n"`。同事仍应收到同一份摘要；你还要证明：从空构建目录能做出可执行文件，改错一次比较条件时测试会指出哪一层变了。

先修：做过 v0、能按 [CMake 目标](../../handbook/cmake-targets/)一课链接库、能按 [CLI 测试](../../handbook/cli-testing/)一课分别写下退出码和两条输出的预期。用[命令行与 Git](../../handbook/command-line-git/)里的 `git diff` 审视单行修改也可以；这次只实现 v0 的基本契约。

## 1. 固定拆分前的基线

先在纸上写四行日志中哪一行不计、哪一行进 UNKNOWN，再跑 v0。接下来的命令都用 Windows PowerShell。进入新的 `LogScan-v01` 练习源码目录，把 `$v0` 的值改成你的 v0 程序的绝对路径。

```powershell
$v0 = 'D:\MyCpp\LogScan-v0\logscan.exe'
$src = (Get-Location).Path
$fixture = Join-Path $src 'shift log.txt'
[IO.File]::WriteAllText($fixture, "INFO ready`n  ERROR`nERROR:`n`n", [Text.Encoding]::ASCII)
& $v0 $fixture
$LASTEXITCODE
```

基线是 `INFO 1`、`WARN 0`、`ERROR 1`、`UNKNOWN 1` 各占一行，stderr 为空，退出码为 `0`。也可跑页首的 `sample.log`，应得到 `3 / 1 / 1 / 0`。确认目录里没有 `missing.log`，把同一个命令的路径换成 `missing.log`：stdout 应空，stderr 是 `logscan: cannot open 'missing.log'`，退出码是 `1`。无参数时只有用法提示，退出码 `2`。记下这几项，拆分后用同一把尺子验收。

## 2. 拆两处职责，先构建程序

**核心**是给定输入流就能计算计数的代码；**CLI 入口**是负责与命令行调用方交接的代码。让 `scan` 只借用流，`main` 才知道文件名。这样测试能直接给核心一段内存文本，生产入口则给它一个已打开的文件流。

| 文件 | 职责 |
| --- | --- |
| `logscan_core.hpp` | 让调用方看到 `logscan::Counts` 和 `logscan::scan(std::istream&)` 的声明 |
| `logscan_core.cpp` | 定义 `scan` 和它专用的 `count_line`；不依赖路径，也不打印 |
| `main.cpp` | 检查参数，打开文件，调用 `scan`，检查结束状态后再格式化输出 |

**目标**是 CMake 用名字管理的一个构建产物。把扫描实现编入静态库 `logscan_core`，也就是一包待链接的目标代码。先把 `main.cpp` 链接到这份库；写测试后，再把单元测试程序接到同一份库。

```text
main.cpp       → logscan             ──链接──┐
tests/unit.cpp → logscan_unit_tests  ──链接──┴→ logscan_core ← logscan_core.cpp
```

```cmake
cmake_minimum_required(VERSION 3.20)
project(logscan_build LANGUAGES CXX)
set(CMAKE_CXX_EXTENSIONS OFF)
add_library(logscan_core STATIC logscan_core.cpp)
target_compile_features(logscan_core PUBLIC cxx_std_20)
target_include_directories(logscan_core PUBLIC "${CMAKE_CURRENT_SOURCE_DIR}")
add_executable(logscan main.cpp)
target_link_libraries(logscan PRIVATE logscan_core)
```

头文件让调用通过编译；链接关系才把定义接进程序。库上 `PUBLIC` 的 C++20 和头文件目录要求既用于库自身，也随链接交给两边的调用方。依据：[指定编译要求](https://cmake.org/cmake/help/v3.20/command/target_compile_features.html)与[传递目标要求](https://cmake.org/cmake/help/v3.20/command/target_link_libraries.html)。

### 在 CLion 或 PowerShell 构建

终端方式：在**含 `CMakeLists.txt` 的练习源码目录**执行。需要 CMake/CTest 3.20 或更高版本、Ninja 和支持 C++20 的 MinGW。下面以 CLion 随附工具为例，修改 `$clion` 为实际安装位置。给每次干净构建配一个从未配置过的目录。

```powershell
$clion = 'D:\CLion'
$cmake = Join-Path $clion 'bin\cmake\win\x64\bin\cmake.exe'
$ctest = Join-Path $clion 'bin\cmake\win\x64\bin\ctest.exe'
$ninja = Join-Path $clion 'bin\ninja\win\x64\ninja.exe'
$gxx = Join-Path $clion 'bin\mingw\bin\g++.exe'
$env:Path = "$(Split-Path -Parent $gxx);$env:Path"
$src = (Get-Location).Path
$build = Join-Path ([IO.Path]::GetTempPath()) "logscan-v01-$([guid]::NewGuid())"
& $cmake -S $src -B $build -G Ninja "-DCMAKE_MAKE_PROGRAM=$ninja" "-DCMAKE_CXX_COMPILER=$gxx" -DCMAKE_BUILD_TYPE=Debug
if ($LASTEXITCODE -ne 0) { throw '配置失败：先查目录、生成器和工具链。' }
& $cmake --build $build --target logscan
if ($LASTEXITCODE -ne 0) { throw '构建失败：先找第一条编译或链接诊断。' }
```

构建返回 `0` 后，`$build` 内应有 `logscan.exe`。如果出错找不到头文件，查文件名和包含路径；若编译通过但链接找不到 `logscan::scan`，查实现是否编进核心库、入口是否链接它。构建失败时先修复，别运行旧产物。

CLion 方式：用 **File → Open** 打开含 `CMakeLists.txt` 的目录。到 **Settings → Build, Execution, Deployment → Toolchains** 选择 MinGW；在同组的 **CMake** 页面确认 Debug 使用这套工具，构建 `logscan`。在 **Run → Edit Configurations** 的 **Program arguments** 填 `shift log.txt` 的绝对路径，带空格时加双引号。IDE 构建目录与终端的 `$build` 各自独立；改完源码，要重建本次实际要跑的那份产物。

### 跟进同一个输入：入口 → 核心 → 入口

`main` 先查到 `argc == 2`，再用 `argv[1]` 打开文件。`scan` 从第一行开始把计数置于 `0 / 0 / 0 / 0`，并复用同一个持有字符的 `std::string`。`count_line` 只在本轮借用这些字符。拿 v0 的纸面预测核对搬过来的循环：

| `getline` 得到 | `count_line` 的判断 | 累计 INFO / WARN / ERROR / UNKNOWN |
| --- | --- | --- |
| `"INFO ready"` | 首词 `INFO`，从下标 0 到空格前 | 1 / 0 / 0 / 0 |
| `"  ERROR"` | 跳过下标 0 和 1 的空格，首词取到行尾 | 1 / 0 / 1 / 0 |
| `"ERROR:"` | 首词含冒号，整词与 `ERROR` 不等 | 1 / 0 / 1 / 1 |
| `""` | 没有首词，跳过 | 1 / 0 / 1 / 1 |

下一次读取到 EOF，循环退出。`scan` 把四个数按值交回 `main`；`main` 检查 `bad()` 为假、`eof()` 为真，才向 stdout 写出上述四行并返回 `0`。如果打开失败，根本不调核心；若读到一半失败（`input.bad() || !input.eof()`），即使核心已经累加了前几行，入口也只写 stderr 的 `cannot read` 诊断，返回 `1`。这些是 [v0 对文件流和输出的约定](../../labs/logscan/)。

```powershell
& (Join-Path $build 'logscan.exe') $fixture
$LASTEXITCODE
& (Join-Path $build 'logscan.exe') 'missing.log'
$LASTEXITCODE
```

在同一源码目录执行，先确认其中没有 `missing.log`。第一条核对 `1 / 0 / 1 / 1` 和退出码 `0`；第二条核对只有打开失败的诊断和退出码 `1`。

## 3. 注册测试，先把预期写全

先用同一份四行文本走两条测试路径。**单元测试**直接检查一个函数的结果，**CLI 测试**启动真实程序，检查调用方能看到什么。**CTest** 负责找到并执行 CMake 已注册的测试；比较哪些值由测试程序或脚本决定。

| 层次 | 准备 → 执行 → 比对 |
| --- | --- |
| 核心 | 用 `std::istringstream`（从内存字符串读的输入流）装入 `"INFO ready\n  ERROR\nERROR:\n\n"` → 调 `logscan::scan(input)` → 比较返回值与根据上表写下的 `logscan::Counts{1, 0, 1, 1}` |
| CLI | 用 `shift log.txt` 的路径启动程序 → 分开收到 stdout、stderr、退出码 → 分别比较 `"INFO 1\nWARN 0\nERROR 1\nUNKNOWN 1\n"`、空字符串、`0` |
| CLI 失败 | 换成不存在的 `missing.log` → 打开失败，核心未运行 → 分别比较空字符串、`"logscan: cannot open 'missing.log'\n"`、`1` |

想把纸上的核心推导直接跑一次，可在练习副本的 `tests/unit.cpp` 中，把这行加到 `main` 的 `return` 之前。`check_scan` 把执行与比较封装成一次调用，失败时 `!` 将 `false` 变为 `true`，给 `failures` 加 1。

```cpp
failures += !check_scan("shift log", "INFO ready\n  ERROR\nERROR:\n\n", {1, 0, 1, 1});
```

把参考项目中的既有测试保留下来：

1. `tests/unit.cpp` 用短输入分开验证规则。例如只给 `"ERROR:"`，`expected` 是 `{.unknown = 1}`，其他成员初始为零；比错就打印用例名、期望和实际计数，测试程序返回非零。再覆盖空输入、纯空白、CRLF、最后一行无换行等。
2. `tests/cli.cmake` 用 [`execute_process`](https://cmake.org/cmake/help/v3.20/command/execute_process.html) 启动编好的程序，分别保存三个实际值。现有成功用例的 `sample input.log` 内容是 `"  INFO start\n\tWARN\n\nERROR:\nERROR"`，只有最后一行没有换行。它把同一套分类规则用于更多边界：INFO、WARN、ERROR、UNKNOWN 各一条；带空格的文件名仍是一个参数。比较输出时只把 CRLF 统一成 LF；空格、行顺序和末尾换行都要保留。
3. 在 `CMakeLists.txt` 用 `include(CTest)`，在 `if(BUILD_TESTING)` 中创建并链接 `logscan_unit_tests`，用 [`add_test`](https://cmake.org/cmake/help/v3.20/command/add_test.html) 注册该目标和四个脚本调用。脚本参数 `-DPROGRAM=$<TARGET_FILE:logscan>` 提供当前配置实际生成的程序路径。

| CTest 名称 | 输入 | 退出码 | 标准输出 | 标准错误 |
| --- | --- | ---: | --- | --- |
| `cli_success` | `"sample input.log"` | 0 | `INFO 1`、`WARN 1`、`ERROR 1`、`UNKNOWN 1` 各一行 | 空 |
| `cli_missing_file` | `missing.log`（不创建） | 1 | 空 | `logscan: cannot open 'missing.log'` |
| `cli_no_args` | 无参数 | 2 | 空 | `Usage: logscan <file>` |
| `cli_extra_args` | `first.log second.log` | 2 | 空 | `Usage: logscan <file>` |

非空输出都要带最后的换行。文件错误用例覆盖的是打开失败，本实验没有模拟打开后才发生的设备读错误。

```powershell
& $cmake --build $build
if ($LASTEXITCODE -ne 0) { throw '构建失败，先修复诊断。' }
& $ctest --test-dir $build --output-on-failure
$LASTEXITCODE
```

预期是 `100% tests passed, 0 tests failed out of 5`，最后显示退出码 `0`。`unit_scan` 虽含多条内存输入，在 CTest 中只算一个测试项。若看见零项，先确认 `$build` 和 `BUILD_TESTING`；若找不到测试程序，先构建全部目标。CTest 的 [`--output-on-failure`](https://cmake.org/cmake/help/v3.20/manual/ctest.1.html) 会显示失败项留下的诊断。

## 4. 故意改坏一行，定位并修复

只在练习副本把 `logscan_core.cpp` 的 `token == "ERROR"` 改成 `token.starts_with("ERROR")`。先预测：四行日志中哪一次加错？CLI 返回码会变吗？然后重建并跑四行日志和最相关的两项：

```powershell
& $cmake --build $build
if ($LASTEXITCODE -ne 0) { throw '这一步应当构建成功。' }
& (Join-Path $build 'logscan.exe') $fixture
$LASTEXITCODE
& $ctest --test-dir $build -R '^(unit_scan|cli_success)$' --output-on-failure
```

- 四行日志的 `ERROR:` 进入 ERROR，摘要变为 `1 / 0 / 2 / 0`，进程仍返回 `0`。
- `unit_scan` 的最短反例就是 `ERROR:`：预期 `0/0/0/1`，实际 `0/0/1/0`。
- `cli_success` 中也有 `ERROR:`，因此脚本报 `success: stdout mismatch`：预期 `ERROR 1`、`UNKNOWN 1`，实际 `ERROR 2`、`UNKNOWN 0`。程序的退出码仍符合预期，结束状态这项比较通过了。

在 CLion 的 Debug 配置中用四行日志复现：入口参数选 `"$fixture 的实际绝对路径"`，在 ERROR 比较行设断点。第一次停住时 `token` 是 `ERROR`，继续到第二次，`token` 是 `ERROR:`（视图长度是 6）。用 **Step Over** 越过比较和增量，`counts.error` 从 1 增到 2。分词仍有冒号，错的是比较条件。

改回 `==`。重建，再用上面的 `-R` 命令确认这两项转为通过；去掉 `-R` 跑全五项。最后重新执行第 2 步的配置和构建代码（它会产生新 `$build`），再完整构建并跑 CTest，确认结果不依赖上次的缓存。

### 独立变式：让冒号成为消息

在自己的练习副本，取四行日志，只在 `ERROR:` 的 `:` 前插入一个制表符，让第三行变成 `"ERROR\t:"`。给 `unit_scan` 加一条内存用例，并用这个新文件跑 CLI。验收：`INFO 1`、`WARN 0`、`ERROR 2`、`UNKNOWN 0` 各占一行，stderr 空，退出码 `0`；原有五个 CTest 测试项仍通过。记录新增输入、预测、实际结果，以及上面那次失败到通过的证据。

<details><summary>变式提示与答案</summary>

首词在制表符处结束，`:` 成了消息的一部分。给现有的 `check_scan` 传 `"INFO ready\n  ERROR\nERROR\t:\n\n"` 和 `{1, 0, 2, 0}`，把它的结果累加到 `failures`。文件可用 `WriteAllText` 另存；在 PowerShell 的双引号字符串里用 `` `t `` 写制表符，用 `` `n `` 写换行。

</details>

## 卡住时再展开

<details><summary>提示 1：每行只借用一次</summary>

`main` 持有二进制文件流，`scan` 用 `getline` 复用字符串。`count_line` 的视图不跨轮次；传回的是计数。`main` 看过读入状态才输出，核心没有把诊断写到 stdout 的机会。

</details>

<details><summary>提示 2：测试去哪里找程序？</summary>

用 `add_test(NAME unit_scan COMMAND logscan_unit_tests)` 直接注册测试目标。CLI 用例可让 `add_test` 启动 `"${CMAKE_COMMAND}"`，向它传 `"-DPROGRAM=$<TARGET_FILE:logscan>"`、`"-DCASE=..."`、`"-DTEST_DIR=..."` 和 `-P` 后的脚本路径。用不同的测试目录放临时文件，测试脚本就不用猜可执行文件位置，也不依赖源码目录里的日志。

</details>

<details><summary>参考答案：下载完整的 CMake 项目</summary>

[下载 reference.zip](../../examples/logscan-build/reference.zip)。压缩包有六个文件：`CMakeLists.txt`、核心头文件、核心和入口的两份 `.cpp`，以及 `tests/` 下的两个测试文件。解压到新的练习目录，在含 `CMakeLists.txt` 的目录按第 1 步创建四行文件（已有 v0 程序才需要运行基线命令），按第 2 步配置，再按第 3 步构建并运行 CTest。手动跑原样例时，把页首下载的 `sample.log` 放进去。

</details>
