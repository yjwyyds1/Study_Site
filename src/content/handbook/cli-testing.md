---
title: "工程质量体系：测试金字塔、CTest、单元测试框架与 GDB/LLDB 调试"
description: "掌握测试金字塔与确定性测试设计、assert vs 异常 vs CTest、CLI 黑盒契约测试与边界矩阵、doctest/Catch2/GoogleTest 模式与夹具、GDB/LLDB 断点/观察点/调用栈调试，以及最小复现回归闭环。"
order: 60
tags: ["C++20", "CTest", "CLI", "单元测试", "doctest", "GoogleTest", "GDB", "LLDB", "调试"]
related:
  - handbook/cmake-targets
  - handbook/eng-git-mastery
  - handbook/cmake-ci-release
  - labs/logscan-build
sources: []
---

## 本课解决的核心工程问题（ENG-39 ~ ENG-44）

程序“拿着样本跑通一次”绝对不叫完成。真正可靠的 C++ 工程必须回答六个质量问题：

1. 测试应该全写成启动 `.exe` 的黑盒测试，还是全写成内存函数测试？为什么有时“本地能过、CI 偶尔失败”？（**ENG-39**）
2. 为什么不能只写 `assert(x == y)`？`CTest` 到底怎么自动发现并调度所有测试？（**ENG-40**）
3. 怎么用黑盒测试同时锁住命令行参数、`stdout`、`stderr` 和退出码？（**ENG-41**）
4. 真实工业项目里的 `doctest` / `Catch2` / `GoogleTest` 和测试夹具（Fixture）长什么样？（**ENG-42**）
5. 代码跑出错误结果或直接崩溃时，怎么用 **GDB / LLDB** 断点、观察点和调用栈秒抓真凶？（**ENG-43**）
6. 修好一个 Bug 后，如何保证下个月重构绝对不会再犯同一个错误？（**ENG-44**）

先修：[现代 CMake 目标化工程（ENG-29 ~ ENG-38）](../cmake-targets/)，并配合 [LogScan v0.1 实验](../../labs/logscan-build/)实操。

---

## 一、测试金字塔与确定性测试（Deterministic Tests） (ENG-39)

面对一个命令行工具（如 `logscan`），新手常走向两个极端：要么只用 `main()` 手测几个样例，要么所有逻辑全靠脚本反复启动进程测试（又慢又难测内存流错误）。

工程界经典的**测试金字塔**告诉你如何合理分层：

```text
           /\
          /  \      端到端 / 系统测试（少量：真实数据库、完整服务链路，最慢）
         /----\
        /      \    CLI / 集成测试（适量：启动真实进程，验证参数、cwd、stdout/stderr/退出码）
       /--------\
      /          \  单元测试（大量：内存调用解析函数，std::istringstream 零磁盘 I/O，毫秒级）
     /------------\
```

| 维度 | 单元测试（Unit Test） | CLI 集成测试（Integration Test） |
| --- | --- | --- |
| **测什么** | 纯核心逻辑（分词、规则分类、CRLF 处理、边界数值） | 命令行参数解析、真实文件读写、权限/缺失路径、退出码 |
| **如何喂输入** | 用 `std::istringstream` 构造内存流，零磁盘 I/O | 用独立进程启动真程序，在隔离工作目录读写临时文件 |
| **速度与颗粒度** | 微秒～毫秒级，可跑上千条 | 几十毫秒～秒级，聚焦外部进程契约 |

### 什么是“确定性（Deterministic）与隔离性（Hermetic）”？

如果一个测试“周一能过、周二偶尔失败”（俗称 **Flaky Test**），它不仅没用，还会摧毁团队对 CI 的信任。写出 100% 可复现测试的四条铁律：
1. **不依赖真实系统时钟**：不要在测试里读 `std::chrono::system_clock::now()` 对比当前年份，而应把时间戳或时钟函数作为参数注入。
2. **不依赖随机种子**：需要随机数据做模糊测试时，必须显式固定种子（如 `std::mt19937 rng{42}`），失败时把种子打出来。
3. **每个测试使用独立临时文件/目录**：绝不把测试数据硬写死在 `/tmp/test.log` 并期望并行运行时不互相覆盖（`ctest -j8` 会并发跑测试！）。
4. **预期必须从规则推导，不能从当前输出反抄**：否则你只是把现存 Bug 固化成了测试！

> **经典反例（从规则推导预期）**：给 LogScan 两份输入 `"ERROR"` 和 `"ERROR:"`（均无末尾换行）。按词法规则，首词（token）截取到空白符为止，标点保留在词内——所以 `"ERROR:"` 必须计入 **`UNKNOWN`（`0/0/0/1`）**，绝不能因为当前代码误用了 `starts_with("ERROR")` 吐出 `0/0/1/0` 就把预期改成 `ERROR`。

---

## 二、`assert` vs 抛异常 vs `CTest` 调度器 (ENG-40)

### 1. 为什么绝对不能用标准库 `<cassert>` 写测试？

很多同学习惯写 `assert(scan("ERROR:") == expected);`。这是非常危险的习惯：
- **Release 构建直接消失**：CMake 在 `Release` / `RelWithDebInfo` 下会自动给编译器加上 **`-DNDEBUG`** 宏，导致标准库 `<cassert>` 把所有 `assert(...)` 宏展开成空语句 `(void)0`——**测试跑完直接绿灯，实际一行校验都没执行！**
- **遇到第一条失败就 `abort()` 暴毙**：后面还有 20 条测试用例，你根本看不到哪些一起挂了。

因此，自建极简测试框架时应编写 Release 下依然生效的 `CHECK` 宏，并累计失败次数：

```cpp
#include <iostream>

#define CHECK(expr)                                                            \
    do {                                                                       \
        if (!(expr)) {                                                         \
            std::cerr << __FILE__ << ':' << __LINE__                           \
                      << ": CHECK failed: " #expr "\n";                        \
            ++failures;                                                        \
        }                                                                      \
    } while (false)
```

而在参考工程的 `tests/unit.cpp` 中，更进一步封装了 `check_scan` 辅助函数，失败时把预期和实际的四项计数同时打到 `stderr`，最后 `main()` 执行 `return failures == 0 ? 0 : 1;`：

<details><summary>完整代码：tests/unit.cpp</summary>

{{example:logscan-build/tests/unit.cpp}}

</details>

### 2. 在 CMake 中接入 `CTest`

**CTest** 是 CMake 自带的跨平台测试调度器，它只看一件事：**被调度的命令退出码是不是 `0`**（`0` = PASS，非 `0` = FAIL）。

```cmake
# 顶层 CMakeLists.txt
include(CTest)    # 自动定义 BUILD_TESTING 选项（默认 ON）并开启 enable_testing()

if(BUILD_TESTING)
  add_executable(logscan_unit_tests tests/unit.cpp)
  target_link_libraries(logscan_unit_tests PRIVATE logscan_core)

  # 注册第 1 个 CTest 用例（直接跑单元测试可执行文件）
  add_test(NAME unit_scan COMMAND logscan_unit_tests)

  # 注册第 2 个 CTest 用例（用 CMake 脚本模式运行 CLI 黑盒测试，传进真实程序路径）
  add_test(
    NAME cli_missing_file
    COMMAND ${CMAKE_COMMAND}
      -DLOGSCAN_BIN=$<TARGET_FILE:logscan>
      -DCASE=missing_file
      -P ${CMAKE_CURRENT_SOURCE_DIR}/tests/cli.cmake
  )
endif()
```

常用 CTest 四连招（**记住：CTest 不会自动重新编译，改完代码必须先 `cmake --build`！**）：

```bash
cmake --build build                                      # 1. 先构建最新代码
ctest --test-dir build -N                                # 2. 只列出注册了哪些测试，不运行
ctest --test-dir build --output-on-failure               # 3. 运行全套（成功保持简洁，失败才展开日志）
ctest --test-dir build -R '^(unit_scan|cli_missing)$' -V # 4. -R 正则只跑指定用例，-V 打印完整细节
```

---

## 三、编写 CLI 黑盒契约测试（参数 / `stdout` / `stderr` / 退出码） (ENG-41)

命令行程序的外部契约由四样东西构成：**输入参数与工作目录 + 退出码 + `stdout` + `stderr`**。哪怕计数全对，只要把 `"cannot open file"` 错打印进了 `stdout`（污染了下游管道），契约测试也必须判定失败！

在跨平台 CMake 工程中（见下面的完整 `tests/cli.cmake`），使用 `execute_process` 启动真实子进程并把四个结果全抓进变量校验：

<details><summary>完整代码：tests/cli.cmake</summary>

{{example:logscan-build/tests/cli.cmake}}

</details>

```cmake
execute_process(
  COMMAND "${LOGSCAN_BIN}" "missing file.log"
  WORKING_DIRECTORY "${CASE_DIR}"
  RESULT_VARIABLE exit_code
  OUTPUT_VARIABLE stdout_text
  ERROR_VARIABLE stderr_text
)

if(NOT exit_code EQUAL 1)
  message(FATAL_ERROR "Expected exit code 1, got ${exit_code}")
endif()
if(NOT stdout_text STREQUAL "")
  message(FATAL_ERROR "Expected empty stdout, got: ${stdout_text}")
endif()
if(NOT stderr_text MATCHES "cannot open")
  message(FATAL_ERROR "Expected diagnostic on stderr, got: ${stderr_text}")
endif()
```

### 上线前必查的 6 类“刁钻输入”边界矩阵

| 边界类别 | 典型输入 / 场景 | 测在哪一层 | 预期行为与防坑点 |
| --- | --- | --- | --- |
| **空输入 / 纯空白** | `""` 或 `"\n \t\r\n"` | 单元测试 | 计数全 0，**不得越界访问 `line[0]`** |
| **CRLF vs LF** | `"INFO\r\n\tWARN\r\n"` | 单元测试 | `\r` 必须被当空白剔除，不能粘成 `"INFO\r"` |
| **无末尾换行** | `"ERROR"`（末尾无 `\n`） | 单元测试 | `getline` 遇到 EOF 前读到了字符，最后一行必须统计 |
| **含空格文件名** | `"sample input.log"` | CLI 测试 | 参数必须整体传给 `argv[1]`，不能被拆断 |
| **缺失文件 / 参数错误** | `missing.log` 或无参数 | CLI 测试 | 退出码 `1` 或 `2`，`stdout` **必须为空**，`stderr` 给诊断 |
| **流错误注入** | `iss.setstate(std::ios::badbit)` | 单元测试 | 不真拔硬盘也能验证 I/O 读取故障分支 |

```cpp
// 用内存流注入 badbit，模拟底层文件读到一半突然磁盘出错
std::istringstream broken{"INFO ok\n"};
broken.setstate(std::ios::badbit);
// 传给核心读取函数并 CHECK 返回了读取失败错误码
```

---

## 四、现代单元测试框架（`doctest` / `Catch2` / `GoogleTest`）与 Fixture 夹具 (ENG-42)

手写 `CHECK` 宏适合几百行的小项目。当工程扩大到几十个模块、需要按标签筛选测试、对比结构体差异、测试抛异常或做共享环境准备（Fixture）时，工业界会引入成熟测试框架：

| 框架 | 接入难度 | 核心风格 | 适用场景 |
| --- | --- | --- | --- |
| **`doctest`** | 极轻量（单头文件，编译极快） | `TEST_CASE` + `SUBCASE` | 中小型 C++20 项目首选，几乎零编译负担 |
| **`Catch2` (v3)** | CMake `FetchContent` 引入 | `TEST_CASE` + `SECTION` | BDD 风格描述能力强，社区生态极佳 |
| **`GoogleTest` (GTest)** | CMake `FetchContent` 引入 | `TEST` + `TEST_F` 夹具类 | 大型企业/开源项目标准，Mock（GMock）支持完善 |

### 模式 A：`doctest` / `Catch2` 的树形 `SUBCASE` 模式（无需手写类）

```cpp
#define DOCTEST_CONFIG_IMPLEMENT_WITH_MAIN
#include <doctest/doctest.h>

TEST_CASE("logscan classifies tokens and strips whitespace") {
    // 公共前置准备（Setup）：每次进入一个 SUBCASE 都会重新执行一遍！
    logscan::Scanner scanner;

    SUBCASE("trailing colon stays part of token") {
        auto res = scanner.scan_text("ERROR:\n");
        CHECK(res.error == 0);
        CHECK(res.unknown == 1);
    }

    SUBCASE("CRLF line endings are handled cleanly") {
        auto res = scanner.scan_text("INFO ok\r\nWARN low\r\n");
        REQUIRE(res.info == 1);   // REQUIRE 失败立即中止当前用例；CHECK 失败继续跑完本用例
        CHECK(res.warn == 1);
    }
}
```

### 模式 B：`GoogleTest` 的 `TEST_F` 测试夹具（Test Fixture）模式

当多个测试需要共享复杂的临时目录、数据库连接或网络服务端环境时，用继承 `::testing::Test` 的夹具类把 **Setup（构造/`SetUp`）** 和 **Teardown（析构/`TearDown`）** 收口在一起——配合 RAII 保证即使测试中途失败也能清理临时目录：

```cpp
#include <gtest/gtest.h>
#include <filesystem>

class TempDirFixture : public ::testing::Test {
protected:
    std::filesystem::path dir;

    void SetUp() override {
        dir = std::filesystem::temp_directory_path() / "logscan_gtest_case";
        std::filesystem::create_directories(dir);
    }

    void TearDown() override {
        std::filesystem::remove_all(dir);
    }
};

TEST_F(TempDirFixture, RejectsMissingInputFile) {
    auto missing = dir / "nope.log";
    EXPECT_FALSE(std::filesystem::exists(missing));
    // ... 调用文件打开逻辑并断言返回失败 ...
}
```

同时还可以用 **`ctest` 发现宏**（如 `gtest_discover_tests(unit_tests)`），让 CTest 自动把每个 `TEST(...)` 注册成一条独立的测试进度项！

---

## 五、用 GDB / LLDB 断点、观察点与调用栈抓现场 (ENG-43)

当测试报错说“预期 `0/0/0/1` 但实际得到 `0/0/1/0`”，或者程序直接 `Segmentation fault (core dumped)` 时，**不要靠在代码里到处插 `std::cout` 盲猜！** 调试器能让你在程序暂停的瞬间看清内存、变量和每一层函数调用。

### 前提：必须用 Debug 模式（`-g -O0`）编译！

如果不加 `-g`，调试器看不到源码行号和变量名；如果开了 `-O2`，编译器会把局部变量优化进寄存器甚至内联函数导致断点乱跳（提示 `<optimized out>`）。

```bash
cmake -S . -B build/debug -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build/debug
```

### GDB 与 LLDB 高频指令对照表

| 调试动作 | GDB（Linux / MinGW） | LLDB（macOS / Clang） | 用途 |
| --- | --- | --- | --- |
| 带参数启动调试 | `gdb --args ./logscan sample.log` | `lldb -- ./logscan sample.log` | 装载程序和命令行参数 |
| 设普通断点 | `b logscan_core.cpp:28` 或 `b scan` | `b -f logscan_core.cpp -l 28` | 让程序跑到指定行/函数停下 |
| **设条件断点** | `b 28 if token == "ERROR:"` | `br s -l 28 -c 'token == "ERROR:"'` | 跑 10 万行日志时只在出事那一行停下！ |
| **设观察点（Watchpoint）** | `watch counts.error` | `watch set variable counts.error` | **内存被谁偷偷改了？** 一旦该变量值改变立刻停住！ |
| 开始运行 / 继续 | `run`（`r`）/ `continue`（`c`） | `r` / `c` | 启动或跑到下一个断点 |
| 单步跳过 / 单步进入 / 跳出 | `next`（`n`）/ `step`（`s`）/ `finish` | `n` / `s` / `finish` | `s` 钻进子函数；`n` 一行行往下走 |
| **查看调用栈与切换栈帧** | `bt` / `frame 2` | `bt` / `f 2` | 崩溃时查是从哪个函数一层层调过来的 |
| 查看局部变量与表达式 | `info locals` / `p token` | `fr v` / `p token` | 核对变量的真实字节内容 |

### 事后尸检：Core Dump 调试

如果程序在 Linux 服务器偶发段错误退出了，先开启 core 文件转储再复现：

```bash
ulimit -c unlimited         # 允许生成 core 转储文件
./logscan bad_input.log     # 触发 Segmentation fault (core dumped)
gdb ./logscan core          # 加载事后内存快照，直接敲 bt 即可看到崩溃时的完整调用栈！
```

---

## 六、最小复现与回归固化闭环 (ENG-44)

工程里修一个 Bug 必须走完下面这 **5 步闭环**，少走一步都可能下个月重蹈覆辙：

```text
① 测试/用户报红 → ② 剥离最小失败输入 → ③ 调试器断点验证根因 → ④ 修复并全量跑通 → ⑤ 把最小输入永久留在测试里
```

### 实战演练一遍这个闭环

假设在练习副本中，有人不小心把 `logscan_core.cpp` 里的 `token == "ERROR"` 改成了 `token.starts_with("ERROR")`：

1. **① 测试报红**：运行 `ctest --test-dir build --output-on-failure`，`unit_scan` 立刻报 `punctuation is part of the token: expected 0/0/0/1, got 0/0/1/0`。
2. **② 剥离最小复现（Delta Debugging）**：原始日志有 10,000 行，我们不断删减无关行，直到发现**只需要 1 行 6 个字节 `"ERROR:"`** 就稳定复现 Bug！
3. **③ 调试器验证根因**：用 `gdb --args ./build/logscan_unit_tests` 在分类函数加条件断点（或用 `b count_line` 单步），`p token` 看到分词结果确实是 `"ERROR:"`（说明分词没错），再 `n` 单步看到它直接走进了 `if (token.starts_with("ERROR")) ++counts.error;`（**证据确凿：分支条件写错了**）。
4. **④ 修复并全量回归**：改回 `token == "ERROR"`，先编译，再 `-R` 复跑失败项，最后去掉 `-R` 跑全套 CTest 确认 100% 通过。
5. **⑤ 永久固化护栏**：如果之前单元测试里还没有 `"ERROR:"` 这个用例，**必须立刻补进 `unit.cpp` 并随修复提交一起 `git commit`**——让这个 Bug 永远失去复活的机会！

---

## 七、动手微练习（含参考答案）

### 练习 1：为什么 `<cassert>` 不够格？（ENG-40）

新建一个单文件 `test_assert.cpp`，里面写 `assert(1 == 2); return 0;`。分别用无优化 Debug 和开启 `-O2 -DNDEBUG` 的 Release 编译运行，观察退出码差异。

<details><summary>参考命令与结论</summary>

```bash
g++ -std=c++20 test_assert.cpp -o debug_app && ./debug_app; echo "debug=$?"
g++ -std=c++20 -O2 -DNDEBUG test_assert.cpp -o rel_app && ./rel_app; echo "release=$?"
```

Debug 版触发 `Aborted` 非零退出；Release 版因为 `-DNDEBUG` 把 `assert` 展开成了空语句，**静默返回退出码 `0`！**

</details>

### 练习 2：新增 CRLF 与标点边界单元测试（ENG-39 / ENG-41）

在 [LogScan v0.1 参考工程](../../labs/logscan-build/) 的 `tests/unit.cpp` 末尾加一条用例 `warn punctuation and CRLF`，输入字节为 `"\tWARN:\r\nWARN\tERROR\r\n \t\r\n"`。先手算四项预期计数，再加入 `check_scan` 编译并通过 CTest。

<details><summary>提示与参考答案</summary>

第 1 行首词 `"WARN:"` → `unknown=1`；第 2 行首词制表符前的 `"WARN"` → `warn=1`；第 3 行纯空白忽略。加入：

```cpp
failures += !check_scan("warn punctuation and CRLF",
                        "\tWARN:\r\nWARN\tERROR\r\n \t\r\n",
                        {.warn = 1, .unknown = 1});
```

</details>

### 练习 3：破坏通道契约与 GDB 单步抓现场（ENG-41 / ENG-43 / ENG-44）

1. 把 `main.cpp` 中打不开文件分支的 `std::cerr` 临时改成 `std::cout`，跑 `ctest --test-dir build --output-on-failure`，观察退出码和报错信息，随后恢复。
2. 用 `gdb --args ./build/logscan_unit_tests` 在 `check_scan` 设断点并执行 `bt` 与 `info locals`，确认你能看到完整的调用栈与局部变量名。

<details><summary>核对答案</summary>

`cli_missing_file` 退出码依然是 `1`，但 `cli.cmake` 会立刻在对比 `stdout` 时报 `stdout mismatch`（正常通道混进了诊断文本）。在 GDB 里 `bt` 应能看到 `main` → `check_scan` → `scan` 的完整源码行号。

</details>

---

参考：[CTest 官方手册](https://cmake.org/cmake/help/latest/manual/ctest.1.html)、[doctest 文档](https://github.com/doctest/doctest)、[GoogleTest Primer](https://google.github.io/googletest/primer.html)、[GDB 官方手册](https://sourceware.org/gdb/current/onlinedocs/gdb/)。下一篇：[工程化进阶：Presets、静态分析、Sanitizer、安装 RPATH、CI 与发布打包（ENG-45 ~ ENG-50）](../cmake-ci-release/)。
