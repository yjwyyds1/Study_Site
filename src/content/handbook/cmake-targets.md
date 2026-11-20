---
title: "现代 CMake 目标化工程：多文件库、依赖传播、构建类型与外部依赖"
description: "从零掌握源码外构建、CMakeLists.txt 核心指令、静态库与动态库、target_* 现代属性、PUBLIC/PRIVATE/INTERFACE 传播、多目录 add_subdirectory、Debug/Release 与单多配置生成器、生成器表达式、FetchContent 与 find_package。"
order: 50
tags: ["CMake", "C++20", "静态库", "动态库", "FetchContent", "find_package", "生成器表达式"]
related: ["handbook/toolchain", "handbook/eng-git-mastery", "handbook/cli-testing", "labs/logscan-build"]
sources: []
---

## 本课解决的核心工程问题（ENG-29 ~ ENG-38）

当 C++ 项目从 1 个 `.cpp` 长到 20 个 `.cpp`、还要引第三方库（如 `fmt`、`GoogleTest`、`SQLite3`）时，手敲一长串 `g++ a.cpp b.cpp c.cpp ...` 会彻底崩溃：改一行代码全量重编、Windows/Linux 命令不通用、头文件和链接库到处漏。

**CMake 不是编译器，也不是直接干活的构建工具——它是“元构建系统（Meta-build System）”**：负责读取跨平台的 `CMakeLists.txt`，为 Ninja、Make 或 Visual Studio 生成各自对应的底层构建脚本。

本课对应 **ENG-29 ~ ENG-38**，用现代目标化 CMake（Modern CMake）彻底打通多文件工程体系。

先修：[编译与链接基础（ENG-06 ~ ENG-07）](../eng-zero-start/)、[Git 进阶全书](../eng-git-mastery/)。

---

## 一、源码外构建（Out-of-Source Build）与四阶段流程 (ENG-29)

刚学 CMake 最容易犯的灾难性错误，就是在源码根目录直接敲 `cmake .`——瞬间把 `CMakeCache.txt`、`CMakeFiles/`、`build.ninja` 和可执行文件全拉在 `.cpp` 旁边，污染 Git 状态不说，换个编译器想清理都不知道删哪些文件。

现代 CMake 铁律：**永远使用源码外构建（Out-of-Source Build）**，用 `-S` 指定源码目录，用 `-B` 指定独立的构建目录：

```bash
cmake -S . -B build -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build
```

想彻底清零重来？直接 `rm -rf build`（Windows 用 `Remove-Item -Recurse -Force build`），源码树干干净净一根头发都不掉！

### 分清 CMake 的四个工作阶段

| 阶段 | 执行命令 | 干了什么？ | 失败时先看哪里？ |
| --- | --- | --- | --- |
| **1. 配置（Configure）** | `cmake -S . -B build` | 读取 `CMakeLists.txt`、探测编译器 ABI、查找依赖包，写入 `CMakeCache.txt` | `-S`/`-B` 路径、编译器 `PATH`、`find_package` 报错 |
| **2. 生成（Generate）** | （同上一步末尾自动完成） | 根据目标依赖图写出底层构建文件（如 `build.ninja` 或 `.sln`） | 目标名拼写、循环依赖 |
| **3. 构建（Build）** | `cmake --build build` | 实际调用 `ninja`/`msbuild`，先编译 `.cpp → .o`，再链接库和可执行文件 | 首条编译诊断（缺头文件/语法）或链接诊断（`undefined reference`） |
| **4. 运行 / 测试** | `./build/app` 或 `ctest` | 运行产物、检查工作目录和参数契约 | 当前工作目录 `cwd`、运行时动态库路径 |

> **1 行反例提醒**：`CMakeCache.txt` 会缓存你第一次选定的编译器和选项。如果你想切换编译器（比如从 `g++` 换成 `clang++`），**千万不要在同一个旧 `build/` 目录里硬改 `-DCMAKE_CXX_COMPILER=clang++`**——请直接新建一个新目录 `-B build-clang`！

---

## 二、`CMakeLists.txt` 核心命令与最小双文件工程 (ENG-30)

先亲手建一个独立的 `prefix-demo` 练习目录验证最小双文件工程：

```text
prefix-demo/
  CMakeLists.txt
  include/
    prefix.hpp
  prefix.cpp
  main.cpp
```

`include/prefix.hpp`：

```cpp
#ifndef PREFIX_DEMO_PREFIX_HPP
#define PREFIX_DEMO_PREFIX_HPP
#include <string_view>

bool is_info(std::string_view line);
#endif
```

`prefix.cpp`：

```cpp
#include "prefix.hpp"

bool is_info(std::string_view line) {
    return line.starts_with("INFO ");
}
```

`main.cpp`：

```cpp
#include "prefix.hpp"
#include <iostream>

int main() {
    std::cout << std::boolalpha << is_info("INFO ready") << '\n';
}
```

`CMakeLists.txt`：

```cmake
cmake_minimum_required(VERSION 3.20)
project(prefix_demo VERSION 0.1.0 LANGUAGES CXX)

add_library(prefix_core STATIC prefix.cpp)
target_include_directories(prefix_core PUBLIC include)
target_compile_features(prefix_core PUBLIC cxx_std_20)

add_executable(prefix_demo main.cpp)
target_link_libraries(prefix_demo PRIVATE prefix_core)
set_target_properties(prefix_core prefix_demo PROPERTIES CXX_EXTENSIONS OFF)
```

### 逐行理解核心命令

- **`cmake_minimum_required(VERSION 3.20)`**：必须写在第一行！它不仅检查 CMake 版本下限，还会同步启用该版本对应的所有现代策略（Policies）。
- **`project(prefix_demo VERSION 0.1.0 LANGUAGES CXX)`**：命名项目并自动设置 `PROJECT_VERSION` 等变量；写上 `LANGUAGES CXX` 表示纯 C++ 工程，跳过无用的 C 编译器探测，配置速度更快。
- **`add_library(...)` / `add_executable(...)`**：在 CMake 中创建**目标（Target）**——你可以把目标理解为面向对象编程里的“对象”，所有包含路径、编译宏、语言标准都应该绑定在具体目标上。
- **远离上古写法**：旧教程里满屏的 `include_directories(...)`、`add_definitions(...)`、`set(CMAKE_CXX_FLAGS ...)` 会把设置全局污染给项目里的每一个库（甚至第三方库！）。现代 CMake **一律使用 `target_*` 系列命令**。

```bash
# 从源码目录配置、构建与运行
cmake -S . -B build-cli -G Ninja -DCMAKE_CXX_COMPILER=g++ -DCMAKE_BUILD_TYPE=Debug
cmake --build build-cli --target prefix_demo
./build-cli/prefix_demo      # Windows PowerShell 用 .\build-cli\prefix_demo.exe
```

### 故意制造一次“编得过但链接失败”的对照实验

把上面 `CMakeLists.txt` 中的 `target_link_libraries(prefix_demo PRIVATE prefix_core)` 注释掉，单独给 `prefix_demo` 补上 `target_include_directories(prefix_demo PRIVATE include)` 和 `target_compile_features(prefix_demo PRIVATE cxx_std_20)` 后重跑：

```bash
cmake -S . -B build-missing-link -G Ninja -DCMAKE_BUILD_TYPE=Debug
cmake --build build-missing-link --target prefix_demo --verbose
```

你会看到：`main.cpp` **顺利编译**生成了 `main.cpp.obj`（因为看到了 `prefix.hpp` 里的声明），但随后链接阶段报错 **`undefined reference to is_info(...)`**——这正是把“声明与头文件”和“定义与库链接”分清的最直观证明。

---

## 三、静态库 vs 动态库：`STATIC` / `SHARED` / `INTERFACE` (ENG-31)

| 库类型 | CMake 写法 | 生成文件（Linux / Windows） | 代码何时拼进程序？ | 工程优缺点与注意事项 |
| --- | --- | --- | --- | --- |
| **静态库（Static）** | `add_library(core STATIC ...)` | `libcore.a` / `core.lib` | **编译链接期**直接打包进最终 `.exe` | 部署只需发单个可执行文件，无缺失 DLL 烦恼；但多个程序都链它时磁盘和内存各存一份 |
| **动态库 / 共享库（Shared）** | `add_library(core SHARED ...)` | `libcore.so` / `core.dll` + 导入库 `core.lib` | **程序启动或运行时**由系统加载器动态装载 | 多个程序共享一份内存映射，升级只需换 `.so`/`.dll`；但发布时必须处理 RPATH 或把 `.dll` 放进同目录 |
| **接口库（Interface）** | `add_library(hdr INTERFACE)` | 不生成任何二进制文件 | 无独立编译产物 | 专门用于**纯头文件库（Header-only）**或统一打包传递一组编译选项/宏 |

**工程最佳实践**：除非业务明确要求插件热加载或分发 SDK 动态库，否则优先写 `add_library(core ...)` **省略 `STATIC`/`SHARED` 关键字**，让用户通过标准开关 `-DBUILD_SHARED_LIBS=ON/OFF`（默认静态）在配置时自由切换！

> **Windows 动态库坑**：在 Linux 上 `SHARED` 库默认导出所有全局符号；但在 **Windows MSVC** 下，`SHARED` 库默认**不导出任何符号**！如果不写 `__declspec(dllexport)`（或使用 CMake `GenerateExportHeader` / 设置 `CMAKE_WINDOWS_EXPORT_ALL_SYMBOLS ON`），MSVC 甚至根本不会生成配套的导入库 `.lib`，导致可执行文件链接失败。

---

## 四、现代目标属性大全：`target_*` 命令详解 (ENG-32)

| 命令 | 管什么 | 典型写法 |
| --- | --- | --- |
| `target_include_directories` | 头文件搜索路径（`-I`） | `target_include_directories(core PUBLIC include)` |
| `target_compile_features` | 最低 C++ 标准（`cxx_std_20` 等） | `target_compile_features(core PUBLIC cxx_std_20)` |
| `target_compile_options` | 警告、优化、Sanitizer 等编译参数 | `target_compile_options(core PRIVATE -Wall -Wextra -Wpedantic)` |
| `target_compile_definitions` | 预处理器宏（`-DNAME=VAL`） | `target_compile_definitions(core PRIVATE LOGSCAN_ENABLE_COLOR=1)` |
| `target_link_libraries` | 链接依赖的其他目标或系统库 | `target_link_libraries(app PRIVATE core)` |
| `target_link_options` | 链接器参数（如 Sanitizer 运行时） | `target_link_options(app PRIVATE -fsanitize=address)` |
| `set_target_properties` | 杂项属性（禁用 GNU 扩展、改输出名） | `set_target_properties(core PROPERTIES CXX_EXTENSIONS OFF)` |

为什么要加 `CXX_EXTENSIONS OFF`？如果不关掉它，GCC 默认使用 `-std=gnu++20` 而不是严格标准 `-std=c++20`，容易在代码里不小心用到 Linux 专属 GNU 扩展，切到 MSVC 或 Clang 时直接编译失败。

---

## 五、`PUBLIC` / `PRIVATE` / `INTERFACE` 依赖传播法则 (ENG-33)

这是现代 CMake 最核心也最优雅的机制——**使用要求（Usage Requirements）传播图**：

```text
假设：库 A 依赖库 B，可执行程序 App 依赖库 A。

  [App] ──(links)──▶ [Lib A] ──(links)──▶ [Lib B]
```

当你给目标 `A` 写任何 `target_*` 命令时，三个可见性关键字决定两件事：**① `A` 自己编的时候用不用？ ② 链接 `A` 的调用方（`App`）需不需要跟着继承？**

| 关键字 | `A` 自己编译时是否生效？ | 调用方 `App` 链接 `A` 时是否自动继承？ | 一句话判断标准 |
| --- | --- | --- | --- |
| **`PRIVATE`** | **是** | **否** | **仅内部实现使用**（如 `.cpp` 里 `#include` 的私有头文件、自己的 `-Wall` 警告参数） |
| **`PUBLIC`** | **是** | **是** | **既自己用，又出现在公开头文件中**（如 `include/` 目录、`prefix.hpp` 依赖的 `cxx_std_20` 或第三方类型） |
| **`INTERFACE`** | **否** | **是** | **自己不编，只给调用方用**（如纯头文件 `INTERFACE` 库、或安装接口路径） |

### 真实场景如何一眼选对？

- `target_compile_options(prefix_core PRIVATE -Wall -Wextra)`：用 **`PRIVATE`**！不要把你的严格警告强加给调用你的其他目标（万一别人链了第三方库呢）。
- `target_include_directories(prefix_core PUBLIC include)`：用 **`PUBLIC`**！因为 `prefix.cpp` 自己要找 `prefix.hpp`，而链接它的 `prefix_demo` 的 `main.cpp` 也要找 `prefix.hpp`。
- 如果 `storage_sqlite.cpp` 在内部 `#include <sqlite3.h>`，而 `storage_sqlite.hpp` 对外只暴露 `std::string` 和 `int`，那么 `target_link_libraries(logscan_storage PRIVATE SQLite::SQLite3)` 写 **`PRIVATE`**，把 SQLite 实现细节彻底封装在库内部！

---

## 六、多目录工程组织：`add_subdirectory` 与别名目标 (ENG-34)

真实中型工程绝不会把所有源码堆在根目录，标准布局按职责拆分目录：

```text
logscan/
  CMakeLists.txt          ← 顶层总控：项目声明、选项开关、依赖发现、CTest 启用
  include/logscan/
    core.hpp              ← 对外公共头文件（调用方写 #include "logscan/core.hpp"）
  src/
    CMakeLists.txt        ← 定义 logscan_core 库与 logscan CLI 可执行程序
    core.cpp
    main.cpp
  tests/
    CMakeLists.txt        ← 定义 unit_tests 可执行程序并注册 CTest
    unit.cpp
```

顶层 `CMakeLists.txt` 用 `add_subdirectory(src)` 和 `add_subdirectory(tests)` 串起子目录。编写多目录和可复用库时有三条黄金习惯：

1. **创建带命名空间的 `ALIAS` 目标**：在 `src/CMakeLists.txt` 定义完库后紧接着写：
   ```cmake
   add_library(logscan_core STATIC core.cpp)
   add_library(logscan::core ALIAS logscan_core)
   ```
   这样无论是本工程内部测试还是将来别人通过 `find_package` 或 `FetchContent` 引入你的库，统一全写 `target_link_libraries(... PRIVATE logscan::core)`！而且一旦拼错名字（比如漏写了字母），CMake 会在配置期直接报错“找不到目标”，而不是当成一个普通 `-llogscan_cor` 留到链接期才炸。
2. **用 `${CMAKE_CURRENT_SOURCE_DIR}`，别乱用 `${CMAKE_SOURCE_DIR}`**：前者永远指向“当前这层 `CMakeLists.txt` 所在目录”；后者永远指向“最外层总工程根目录”——一旦别人用 `FetchContent` 把你的仓库嵌套进他的大工程里，`${CMAKE_SOURCE_DIR}` 就会指向别人的根目录导致路径全错！
3. **测试受 `BUILD_TESTING` 控制**：顶层 `include(CTest)` 会自动提供 `BUILD_TESTING` 开关（默认 `ON`），用 `if(BUILD_TESTING) add_subdirectory(tests) endif()` 包起来，让不想跑测试的下游用户一键 `-DBUILD_TESTING=OFF` 跳过。

---

## 七、Build Types 与单配置 vs 多配置生成器 (ENG-35)

### 四大标准 Build Type

| Build Type | GCC/Clang 典型底层参数 | 用途与特征 |
| --- | --- | --- |
| **`Debug`** | `-O0 -g` | 关优化、带完整调试符号，断点绝不乱跳，配合 Sanitizer 开发主力 |
| **`Release`** | `-O3 -DNDEBUG` | 最高优化、**定义 `NDEBUG` 禁用 `<cassert>`**，线上交付与性能压测 |
| **`RelWithDebInfo`** | `-O2 -g -DNDEBUG` | **生产排障神器！** 既有接近 Release 的高速运行性能，又保留调试符号用于解析崩溃栈/Flamegraph |
| **`MinSizeRel`** | `-Os -DNDEBUG` | 最小体积优化，常见于嵌入式 MCU / 空间受限环境 |

### 致命认知差异：单配置生成器 vs 多配置生成器

为什么很多人切换了 Debug 后运行程序却还在跑旧的 Release？因为没分清生成器类型：

| 对比维度 | 单配置生成器（`Ninja` / `Unix Makefiles`） | 多配置生成器（`Visual Studio` / `Ninja Multi-Config`） |
| --- | --- | --- |
| **何时决定 Debug/Release？** | **配置阶段**：`cmake -S . -B build/debug -DCMAKE_BUILD_TYPE=Debug` | **构建与测试阶段**：`cmake --build build --config Debug` |
| **多版本怎么放？** | 必须用不同 `-B` 目录（`build/debug` 与 `build/release`） | 同一个 `build/` 目录下自动分 `Debug/`、`Release/` 子目录 |
| **`CMAKE_BUILD_TYPE` 变量** | 有值（`Debug` 等） | **完全为空且被忽略！** 传了 `-DCMAKE_BUILD_TYPE=Debug` 也没用 |
| **运行 CTest** | `ctest --test-dir build/debug --output-on-failure` | `ctest --test-dir build -C Debug --output-on-failure` |

---

## 八、生成器表达式（Generator Expressions：`$ <...>`） (ENG-36)

理解了多配置生成器（配置阶段还不知道等会儿 `--build` 时到底编 `Debug` 还是 `Release`），你就瞬间明白了为什么 CMake 不能只用普通的 `if(CMAKE_BUILD_TYPE STREQUAL "Debug")`——**因为在多配置生成器里，配置阶段的 `CMAKE_BUILD_TYPE` 根本是空的！**

**生成器表达式 `$<...>`** 把条件求值推迟到**生成/构建阶段**，对单配置和多配置生成器100%通用：

```cmake
# 1. 按编译器家族精准分配警告开关（跨 GCC / Clang / MSVC）
target_compile_options(logscan_core PRIVATE
  $<$<CXX_COMPILER_ID:GNU,Clang,AppleClang>:-Wall -Wextra -Wpedantic -Wconversion>
  $<$<CXX_COMPILER_ID:MSVC>:/W4 /permissive->
)

# 2. 仅在 Debug 配置启用额外调试宏（无论 Ninja 还是 Visual Studio 都生效！）
target_compile_definitions(logscan_core PRIVATE
  $<$<CONFIG:Debug>:LOGSCAN_DEBUG_CHECKS=1>
)

# 3. 布尔开关表达式：仅当 LOGSCAN_WERROR=ON 时追加 -Werror
option(LOGSCAN_WERROR "Treat warnings as errors" OFF)
target_compile_options(logscan_core PRIVATE
  $<$<AND:$<BOOL:${LOGSCAN_WERROR}>,$<CXX_COMPILER_ID:GNU,Clang,AppleClang>>:-Werror>
)

# 4. 区分“本地构建头文件路径”与“安装发布后头文件路径”（库发布必备）
target_include_directories(logscan_core PUBLIC
  $<BUILD_INTERFACE:${CMAKE_CURRENT_SOURCE_DIR}/include>
  $<INSTALL_INTERFACE:include>
)
```

---

## 九、用 `FetchContent` 拉取外部开源依赖 (ENG-37)

C++ 以前最被人诟病的就是“引个第三方库比写业务代码还难”。从 CMake 3.14+ 开始，官方内置的 **`FetchContent`** 模块能自动在配置阶段从 Git 仓库或压缩包下载依赖源码，并无缝纳入你当前工程一起编译：

```cmake
include(FetchContent)

# 示例：引入现代格式化库 fmt（也可以是 GoogleTest / doctest / Catch2）
FetchContent_Declare(
  fmt
  GIT_REPOSITORY https://github.com/fmtlib/fmt.git
  GIT_TAG        11.0.2          # ⚠️ 永远锁死具体 Tag 或 Commit Hash，绝不要写 main！
  GIT_SHALLOW    TRUE            # 浅克隆只拉该 Tag，极大加快下载速度
)

# 下载并自动调用对方的 CMakeLists.txt，把 fmt::fmt 目标暴露给当前工程
FetchContent_MakeAvailable(fmt)

target_link_libraries(logscan_core PRIVATE fmt::fmt)
```

### 工程实战注意事项
1. **锁死精确版本**：`GIT_TAG` 绝对不要填 `main` 或 `master`，否则今天能编过、半年后上游发了破坏性更新你的老项目突然编译不过！
2. **离线/内网构建兜底**：如果构建机无法联网，只需把提前下好的源码放到本地目录，配置时传入 `-DFETCHCONTENT_SOURCE_DIR_FMT=/path/to/local/fmt`，CMake 就会跳过网络下载直接使用本地源码。
3. **重型依赖不建议每次从源码拉**：像 OpenSSL、Qt、Boost、SQLite3 这类体积庞大或与系统紧密耦合的库，通常优先用下一节的 `find_package` 或包管理器（`vcpkg` / `Conan`）接入预编译包。

---

## 十、`find_package` 与系统库发现（以 `SQLite3` / `Threads` 为例） (ENG-38)

当依赖库已经安装到操作系统或包管理器（apt / Homebrew / vcpkg）中时，使用 **`find_package`** 发现它并链接标准导入目标（Imported Target）：

```cmake
# 1. 现代 C++ 多线程标准库封装（Linux 上自动补上 -pthread，Windows 自动忽略）
find_package(Threads REQUIRED)
target_link_libraries(logscan_service PRIVATE Threads::Threads)

# 2. 发现系统级 SQLite3，并锁定最低版本 3.35
find_package(SQLite3 3.35 REQUIRED)
target_link_libraries(logscan_storage PRIVATE SQLite::SQLite3)
```

### 为什么终端里 `sqlite3` 命令能跑，`find_package(SQLite3)` 却报错？

Linux 发行版把软件拆成了两半：
- **运行时包（`sqlite3` / `libsqlite3-0`）**：只装了命令行工具和运行时 `.so.0` 动态库，**没有头文件**！
- **开发包（`libsqlite3-dev`）**：才包含编译期必需的 **`sqlite3.h` 头文件** 和供链接器找的 `libsqlite3.so` 符号链接。

在 Ubuntu / WSL2 遇到 `Could NOT find SQLite3 (missing: SQLite3_INCLUDE_DIR SQLite3_LIBRARY)`，补装开发包即可：

```bash
sudo apt update && sudo apt install -y libsqlite3-dev
```

### Module 模式 vs Config 模式与 `CMAKE_PREFIX_PATH`

- **Module 模式**（如 `FindSQLite3.cmake`、`FindThreads.cmake`）：CMake 自己内置的查找脚本，去系统默认目录搜头文件和库。
- **Config 模式**（如现代库自己安装生成的 `fmtConfig.cmake`、`GTestConfig.cmake`）：由库作者随包安装时附带，精确记录了所有目标属性与传递依赖。
- **装在非标准目录（比如 `~/local` 或 vcpkg 目录）找不到怎么办？** 配置时加上 `-DCMAKE_PREFIX_PATH=/path/to/installed/prefix`，`find_package` 就会优先去那里搜索！

---

## 十一、把目标关系带到 LogScan 与动手微练习

完成上述 10 节后，立刻打开 [LogScan v0.1 构建实验](../../labs/logscan-build/)，对照它的 `CMakeLists.txt` 找出 `logscan_core`、`logscan` 和 `logscan_unit_tests` 三个目标，画出完整的依赖传播图。

### 练习 1：把重复设置交给库目标（`PUBLIC` vs `PRIVATE`，ENG-32 / ENG-33）

在第二节的 `prefix-demo` 工程中，新增第二个程序 `probe.cpp` 和可执行目标 `prefix_probe`，只写：

```cmake
add_executable(prefix_probe probe.cpp)
target_link_libraries(prefix_probe PRIVATE prefix_core)
```

验证 `prefix_probe` 不写一行 `target_include_directories` 和 `target_compile_features`，依然能直接通过 `PUBLIC` 传播拿到 `include/` 和 C++20 特性。在 `probe.cpp` 依次打印 `is_info("INFO")`、`is_info("XINFO ready")`、`is_info("INFO ready")`（预期输出 `false`、`false`、`true`）。

<details><summary>提示与参考答案</summary>

在 `probe.cpp` 中 `#include "prefix.hpp"` 和 `<iostream>`，在 `main` 中逐行输出 `std::boolalpha << is_info(...) << '\n'`。第一行少了空格、第二行 `INFO ` 不在开头，所以输出为 `false`、`false`、`true`。

</details>

### 练习 2：验证多目录 `add_subdirectory` 与生成器表达式（ENG-34 / ENG-35 / ENG-36）

把 `prefix-demo` 拆成 `include/prefix.hpp`、`src/CMakeLists.txt`（定义 `prefix::core` 别名）、顶层 `CMakeLists.txt`，并用生成器表达式给 `prefix_core` 加上仅在 `Debug` 下生效的宏 `PREFIX_VERBOSE=1`。分别在 `build/debug` 与 `build/release` 两个目录构建运行验证。

<details><summary>参考配置片段</summary>

```cmake
# src/CMakeLists.txt
add_library(prefix_core STATIC prefix.cpp)
add_library(prefix::core ALIAS prefix_core)
target_include_directories(prefix_core PUBLIC $<BUILD_INTERFACE:${PROJECT_SOURCE_DIR}/include>)
target_compile_features(prefix_core PUBLIC cxx_std_20)
target_compile_definitions(prefix_core PRIVATE $<$<CONFIG:Debug>:PREFIX_VERBOSE=1>)
```

</details>

### 练习 3：识别单配置与多配置测试命令（ENG-35 / ENG-38）

如果一个工程同时在 Ubuntu（用 `Ninja`）和 Windows（用 `Visual Studio 17 2022`）上构建，为什么 Ubuntu 上的 `ctest --test-dir build` 在 Windows Visual Studio 构建目录里会提示找不到测试可执行文件？应补上什么参数？

<details><summary>核对答案</summary>

Visual Studio 是**多配置生成器**，构建出的程序位于 `build/Debug/` 或 `build/Release/` 子目录，执行 CTest 时必须显式指定配置参数：**`ctest --test-dir build -C Debug --output-on-failure`**（与 `--build --config` 保持一致）。

</details>

---

参考：[CMake 官方教程](https://cmake.org/cmake/help/latest/guide/tutorial/index.html)、[target_include_directories](https://cmake.org/cmake/help/latest/command/target_include_directories.html)、[Generator Expressions](https://cmake.org/cmake/help/latest/manual/cmake-generator-expressions.7.html)、[FetchContent](https://cmake.org/cmake/help/latest/module/FetchContent.html)。下一篇：[测试、CTest、GDB/LLDB 调试与回归固化（ENG-39 ~ ENG-44）](../cli-testing/)。
