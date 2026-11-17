---
title: "用 CMake 目标组织多文件 C++ 工程"
description: "从空构建目录生成程序，拆清头文件、库与可执行目标，再故意漏掉一条链接依赖。"
order: 50
tags: ["CMake", "C++20", "CLion", "编译与链接"]
related: ["handbook/toolchain", "handbook/command-line-git", "labs/logscan-build"]
sources: []
---

## 先弄清每一步在做什么

给程序一个固定输入 `"INFO ready"`，让它打印 `true`。判断函数放在 `prefix.cpp`，调用放在 `main.cpp`。先修：[工具链一课](../../handbook/toolchain/)的编译和链接，以及[命令行一课](../../handbook/command-line-git/)的工作目录与退出码。先猜：`main.cpp` 找得到头文件，是否就能生成可执行程序？

**目标**是这次要构建的东西，比如库 `prefix_core` 或程序 `prefix_demo`。**静态库**在这里是装着目标文件的归档，链接程序时从里面取所需的实现。CMake 先读 `CMakeLists.txt`，在构建目录生成 Ninja 能读的规则；构建（Build）时，Ninja 才按规则调用编译器和链接器。

| 阶段 | 得到什么 | 失败时先看哪里 |
| --- | --- | --- |
| 配置与生成 | 读取 `CMakeLists.txt`、选定工具链，写出 `CMakeCache.txt` 和 `build.ninja` | 看 `-S`、生成器和编译器 |
| 构建：编译 | `main.cpp` 和 `prefix.cpp` 各得到一个目标文件 | 看首条编译诊断与头文件搜索路径 |
| 构建：链接 | 把调用和函数实现接起来，生成 `prefix_demo.exe` | 看缺少哪个函数及实现所在库是否参与链接 |
| 运行 | `is_info("INFO ready")` 得到 `true`，写到屏幕 | 看运行路径、输入和程序逻辑 |

## 用四个文件做一个小工程

建一个独立的 `prefix-demo` 练习目录，按下面的名字保存四段代码。**声明**让编译器知道函数叫什么、接收什么、返回什么；**定义**在这里还给出具体的函数体。每个 `.cpp` 连同它经预处理包含的内容，是编译器分别处理的一份**翻译单元**。两个 `.cpp` 都包含同一个头文件，编译器就能用同一份声明检查调用和定义。

```text
prefix-demo/
  CMakeLists.txt
  include/
    prefix.hpp
  prefix.cpp
  main.cpp
```

`include/prefix.hpp`

```cpp
#ifndef PREFIX_DEMO_PREFIX_HPP
#define PREFIX_DEMO_PREFIX_HPP
#include <string_view>

// 只写声明：参数是字符串视图，结果是布尔值。
bool is_info(std::string_view line);
#endif
```

`prefix.cpp`

```cpp
#include "prefix.hpp"

bool is_info(std::string_view line) {
    return line.starts_with("INFO ");  // 末尾空格也属于前缀。
}
```

`main.cpp`

```cpp
#include "prefix.hpp"
#include <iostream>

int main() {
    // boolalpha 让布尔值打印成 true 或 false。
    std::cout << std::boolalpha << is_info("INFO ready") << '\n';
}
```

`CMakeLists.txt`

```cmake
cmake_minimum_required(VERSION 3.20)
project(prefix_demo LANGUAGES CXX)

add_library(prefix_core STATIC prefix.cpp)
target_include_directories(prefix_core PRIVATE include)
target_compile_features(prefix_core PRIVATE cxx_std_20)

add_executable(prefix_demo main.cpp)
target_include_directories(prefix_demo PRIVATE include)
target_compile_features(prefix_demo PRIVATE cxx_std_20)
target_link_libraries(prefix_demo PRIVATE prefix_core)
set_target_properties(prefix_core prefix_demo PROPERTIES CXX_EXTENSIONS OFF)
```

逐行读：`cmake_minimum_required` 要求 CMake 3.20 或以上，并设置与该版本对应的策略；`project` 命名项目，只启用 C++。其余几行把要求写到具体目标上：

| 这一行 | 在本例里做什么 |
| --- | --- |
| `add_library(prefix_core STATIC prefix.cpp)` | 编译 `prefix.cpp` 并把它的目标文件装进静态库 |
| 库的 `target_include_directories` | 让 `prefix.cpp` 在 `include/` 找到 `prefix.hpp` |
| 库的 `target_compile_features` | 要求库按至少 C++20 构建，以便使用 `starts_with` |
| `add_executable(prefix_demo main.cpp)` | 用 `main.cpp` 建立可执行目标 |
| 程序的 `target_include_directories` | 也让 `main.cpp` 在 `include/` 找头文件 |
| 程序的 `target_compile_features` | 为程序单独指定至少 C++20，以便两边用同一个教学基线 |
| `target_link_libraries` | 把 `prefix_core` 接到 `prefix_demo` 的链接步骤 |
| `set_target_properties` | 两个目标都请求关闭编译器语言扩展模式 |

对着代码走一遍：`main.cpp` 从头文件看到声明，编译后留下对 `is_info` 的引用；`prefix.cpp` 的目标文件带着函数体进入库；链接时把这两边接上。程序跑起来后，`starts_with` 比较开头 5 个字符，`"INFO ready"` 的开头正好是 `"INFO "`，所以 `std::cout` 写出 `true` 和换行。

## 从源码目录配置、构建和重建

在 PowerShell 进入刚建的 `prefix-demo` 源码目录（含 `CMakeLists.txt`）。下面用 **CMake 3.20+、Ninja、支持 C++20 的 MinGW g++**。若 `Get-Command` 找不到工具，把已安装工具的目录加到本次 PowerShell 的 `PATH`；使用 CLion 随附工具时，也可以参照 [LogScan 构建实验](../../labs/logscan-build/) 用完整路径调用。

```powershell
Get-Location
Get-Command cmake, ninja, g++ -ErrorAction Stop
cmake -S . -B build-cli -G Ninja -DCMAKE_CXX_COMPILER=g++ -DCMAKE_BUILD_TYPE=Debug
if ($LASTEXITCODE -ne 0) { throw 'Configure failed' }
cmake --build build-cli --target prefix_demo
if ($LASTEXITCODE -ne 0) { throw 'Build failed' }
.\build-cli\prefix_demo.exe
$LASTEXITCODE
```

`-S .` 用当前目录作为源码目录，`-B build-cli` 把构建规则和产物放进 `build-cli`。构建 `prefix_demo` 也会构建依赖的库。预期屏幕先打印 `true`，PowerShell 再显示退出码 `0`。把命令中的目录全部换成从未配置过的 `build-repro`，应得到同样的结果。

也可在 CLion 打开该源码目录，选好工具链和 Debug 配置，加载后运行 `prefix_demo`。IDE 和终端使用各自的构建目录；若结果不同，先对照生成器、编译器和首条诊断。

## 练习：让编译通过，但链接失败

只注释掉一行：`target_link_libraries(prefix_demo PRIVATE prefix_core)`。先预测哪一步会失败。程序仍有自己的头文件目录和 C++20 设置；编译 `main.cpp` 只需看到声明，链接程序时却没有传入定义所在的库。

```powershell
cmake -S . -B build-missing-link -G Ninja -DCMAKE_CXX_COMPILER=g++ -DCMAKE_BUILD_TYPE=Debug
if ($LASTEXITCODE -ne 0) { throw 'Configure failed' }
cmake --build build-missing-link --target prefix_demo --verbose
$LASTEXITCODE
```

仍从 `prefix-demo` 运行。配置应成功，详细日志先出现编译命令和 `main.cpp.obj`，随后链接命令报告关于 `is_info` 的 `undefined reference`，构建退出码非零。在这次构建中，日志从编译推进到链接，是翻译单元已成功生成目标文件的证据。若先报找不到 `prefix.hpp`，检查刚才有没有误删程序自己的包含路径。

恢复链接行，用上节的配置、构建和运行命令，把构建目录换成 `build-missing-link`。`prefix.cpp` 中的定义重新进了链接，程序恢复输出 `true`。同一个函数可以在头文件里被声明，在整个程序中提供一份定义；这里缺了定义，MinGW 在链接时报告了它。标准没有规定必须出现这一条诊断。

### 把重复设置交给库目标

到这里两个目标都能跑了，再整理重复的头文件目录与 C++20 设置。把库上这两条的 `PRIVATE` 改为 `PUBLIC`，删掉程序上对应的两条；保留 `target_link_libraries(prefix_demo PRIVATE prefix_core)`。

```cmake
target_include_directories(prefix_core PUBLIC include)
target_compile_features(prefix_core PUBLIC cxx_std_20)
```

对头文件目录和语言特性，`PRIVATE` 表示只给当前目标用，`PUBLIC` 表示当前目标要用，链接它的使用者也会收到这些**使用要求**。`prefix_demo` 的链接行写 `PRIVATE`，它仍然会收到库公开的要求；这个链接关系本身没有声明为程序对外的接口。把正常构建命令的 `build-cli` 换成新的 `build-public` 重跑，结果仍应是 `true` 和退出码 `0`。

### 独立变式：让第二个程序复用同一库

在练习目录新增 `probe.cpp` 和可执行目标 `prefix_probe`。复用 `is_info`，依次检查 `"INFO"`、`"XINFO ready"`、`"INFO ready"`。在新的 `build-probe` 里构建目标 `prefix_probe`，验收是三行 `false`、`false`、`true`，退出码为 `0`。新目标只通过链接库取得包含目录和 C++20 要求，`prefix.cpp` 仍只属于库目标。

<details><summary>提示与参考答案</summary>

在 `probe.cpp` 照 `main.cpp` 引入 `prefix.hpp` 和 `<iostream>`，在 `main` 中逐次输出三个结果，每个结果后加 `'\n'`。第一条少了前缀里的空格，第二条的 `INFO ` 不在开头。

```cmake
add_executable(prefix_probe probe.cpp)
target_link_libraries(prefix_probe PRIVATE prefix_core)
set_target_properties(prefix_probe PROPERTIES CXX_EXTENSIONS OFF)
```

用上节命令配置 `build-probe`，把构建目标换成 `prefix_probe`，运行 `.\build-probe\prefix_probe.exe`。

</details>

<details><summary>进阶：换生成器或清理构建</summary>

有 `mingw32-make` 时可在新目录用 `-G "MinGW Makefiles"`。若改用已安装的 Visual Studio 生成器，在另一个目录配置并省略 `-DCMAKE_CXX_COMPILER=g++`；构建时加 `--config Debug`，此例的程序通常在构建目录的 `Debug` 子目录。对现有的 Ninja 目录运行 `cmake --build build-cli --target clean` 会清理构建产物，配置缓存仍在。

</details>

## 把目标关系带到 LogScan

接着做 [LogScan 构建实验](../../labs/logscan-build/)。在实验工程的 `CMakeLists.txt` 里找出 `logscan_core`、`logscan` 和 `logscan_unit_tests` 三个目标：前者装核心逻辑，后两者分别是命令行程序和单元测试程序。先画出两个程序与库的依赖，再按实验说明用新目录配置和构建。用 Ninja 单配置构建时，在实验源码目录执行 `ctest --test-dir build-logscan --output-on-failure`，其中 `build-logscan` 换成你的构建目录；多配置构建还需传 `-C Debug`，与构建所选配置一致。验收时同时记录构建结果和 CTest 实际跑了多少测试。

参考：[N4861 的声明和定义](https://timsong-cpp.github.io/cppwp/n4861/basic.def)、[单一定义规则](https://timsong-cpp.github.io/cppwp/n4861/basic.def.odr)、[字符串视图的前缀比较](https://timsong-cpp.github.io/cppwp/n4861/string.view.ops)、[CMake 命令行](https://cmake.org/cmake/help/v3.20/manual/cmake.1.html)、[头文件目录](https://cmake.org/cmake/help/v3.20/command/target_include_directories.html)、[编译特性](https://cmake.org/cmake/help/v3.20/command/target_compile_features.html)和[目标链接](https://cmake.org/cmake/help/v3.20/command/target_link_libraries.html)。
