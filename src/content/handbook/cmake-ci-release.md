---
title: "工程化进阶：Presets、静态分析、Sanitizer、安装 RPATH、CI 与发布打包"
description: "全面掌握 CMakePresets.json 跨平台预设、clang-format 与 clang-tidy 静态分析、ASan/UBSan/TSan 动态插桩、install() 与可重定位 RPATH、GitHub Actions 三平台 CI 矩阵，以及 CPack 打包、调试符号分离与校验发布。"
order: 65
tags: ["CMakePresets", "clang-format", "clang-tidy", "Sanitizer", "RPATH", "GitHub Actions", "CPack", "发布打包"]
related: ["handbook/cmake-targets", "handbook/cli-testing", "handbook/storage-sqlite", "labs/logscan-build"]
sources: []
---

## 本课解决的工程化断层（ENG-45 ~ ENG-50）

本地编译通过、CTest 全绿，距离“团队跨平台零摩擦协作、代码零低级隐患、产物可安全交付用户”还有最后六道工业级关卡：

1. 每个人敲一长串 `-G Ninja -DCMAKE_BUILD_TYPE=... -D...` 容易出错，Windows 与 Linux 参数又不同，如何一键标准化？（**`CMakePresets.json`，ENG-45**）
2. 怎么在代码运行前自动统一全团队缩进风格，并抓出未覆盖路径里的潜在 Bug？（**`clang-format` 与 `clang-tidy`，ENG-46**）
3. 单元测试全过，为什么上线后仍发生偶发越界崩溃或多线程数据竞争？（**ASan / UBSan / TSan 动态插桩，ENG-47**）
4. 构建目录能跑，把程序和自己写的动态库打包移到另一个目录或别人电脑，为什么找不到文件或 `.so`？（**`install()` 规则与可重定位 RPATH，ENG-48**）
5. 本机缓存掩盖了漏提交的头文件或大小写拼错，如何让每次提交自动在三平台干净容器里验明正身？（**GitHub Actions CI 矩阵，ENG-49**）
6. 如何生成带版本号和 SHA-256 校验值的正式发行压缩包，同时剥离并妥善保管调试符号？（**CPack、调试符号与冒烟验收，ENG-50**）

先修：[现代 CMake 目标化工程（ENG-29 ~ ENG-38）](../cmake-targets/) 与 [工程质量体系（ENG-39 ~ ENG-44）](../cli-testing/)。

---

## 一、`CMakePresets.json` 跨平台统一预设 (ENG-45)

团队开发时，最怕 README 里写着 200 字符的 `cmake -S . -B ...` 命令——新人少打一个 `-D`、CI 多打一个空格，结果本机和 CI 编出来的完全不是一回事。

从 CMake 3.21+ 起，直接在仓库根目录放置 **`CMakePresets.json`**，即可把配置、构建、测试全部收敛成简短的预设名：

```json
{
  "version": 3,
  "configurePresets": [
    {
      "name": "base",
      "hidden": true,
      "generator": "Ninja",
      "binaryDir": "${sourceDir}/build/${presetName}",
      "cacheVariables": {
        "CMAKE_EXPORT_COMPILE_COMMANDS": "ON"
      }
    },
    {
      "name": "linux-debug",
      "inherits": "base",
      "condition": { "type": "equals", "lhs": "${hostSystemName}", "rhs": "Linux" },
      "cacheVariables": { "CMAKE_BUILD_TYPE": "Debug" }
    },
    {
      "name": "linux-asan",
      "inherits": "linux-debug",
      "cacheVariables": {
        "LOGSCAN_ENABLE_ASAN": "ON",
        "LOGSCAN_WERROR": "ON"
      }
    },
    {
      "name": "linux-release",
      "inherits": "base",
      "condition": { "type": "equals", "lhs": "${hostSystemName}", "rhs": "Linux" },
      "cacheVariables": {
        "CMAKE_BUILD_TYPE": "Release",
        "LOGSCAN_WERROR": "ON"
      }
    },
    {
      "name": "win-msvc-release",
      "generator": "Visual Studio 17 2022",
      "binaryDir": "${sourceDir}/build/${presetName}",
      "condition": { "type": "equals", "lhs": "${hostSystemName}", "rhs": "Windows" },
      "cacheVariables": { "LOGSCAN_WERROR": "ON" }
    }
  ],
  "buildPresets": [
    { "name": "linux-debug", "configurePreset": "linux-debug" },
    { "name": "linux-asan", "configurePreset": "linux-asan" },
    { "name": "linux-release", "configurePreset": "linux-release" },
    { "name": "win-msvc-release", "configurePreset": "win-msvc-release", "configuration": "Release" }
  ],
  "testPresets": [
    {
      "name": "linux-debug",
      "configurePreset": "linux-debug",
      "output": { "outputOnFailure": true }
    },
    {
      "name": "linux-asan",
      "configurePreset": "linux-asan",
      "output": { "outputOnFailure": true }
    }
  ]
}
```

从此无论是本机开发、CLion / VS Code 自动识别，还是 CI 流水线，只需统一敲三条命令：

```bash
cmake --list-presets                   # 查看当前平台可用的所有预设
cmake --preset linux-asan              # 配置
cmake --build --preset linux-asan      # 构建
ctest --preset linux-asan              # 测试
```

> **团队协作边界**：`CMakePresets.json` **必须提交进 Git**；如果你自己本机需要指定私人路径（比如本地特殊的编译器路径），写在 **`CMakeUserPresets.json`** 中（可 `inherits` 团队预设），并把 `CMakeUserPresets.json` 放进 **`.gitignore`**！

---

## 二、`clang-format` 与 `clang-tidy` 静态分析 (ENG-46)

### 1. 用 `clang-format` 终结代码风格争论

永远不要在 Code Review 里浪费口水争论“大括号换不换行”、“指针 `*` 靠左还是靠右”。在仓库根目录放一份 **`.clang-format`**，用工具自动格式化并让 CI 卡死格式一致：

```yaml
# .clang-format
BasedOnStyle: LLVM
IndentWidth: 4
ColumnLimit: 100
PointerAlignment: Left
AllowShortFunctionsOnASingleLine: Empty
SortIncludes: CaseSensitive
```

```bash
# 本地自动格式化文件
clang-format -i src/*.cpp include/logscan/*.hpp

# CI 里检查格式（不改动文件，有任何未格式化行直接返回非 0 退出码！）
clang-format --dry-run --Werror src/*.cpp include/logscan/*.hpp
```

### 2. 用 `clang-tidy` 配合编译数据库做深度静态分析

**编译器告警**检查局部语法与类型隐患（如 `-Wall -Wextra -Wpedantic -Wconversion`）；**静态分析器（`clang-tidy`）** 则沿着整棵抽象语法树（AST）和控制流路径做深层扫描——抓出悬垂指针风险、冗余拷贝、`std::move` 误用、现代 C++20 改写建议。

在仓库根目录放一份 **`.clang-tidy`**：

```yaml
Checks: >
  bugprone-*,
  modernize-*,
  performance-*,
  readability-*,
  -modernize-use-trailing-return-type,
  -readability-magic-numbers
WarningsAsErrors: ''
```

运行 `clang-tidy` 时，它**必须读到真实的编译参数**（`-I`、`-std=c++20`、宏定义），所以把配置时开启 `CMAKE_EXPORT_COMPILE_COMMANDS=ON` 生成的构建目录传给 `-p`：

```bash
cmake --preset linux-debug
clang-tidy -p build/linux-debug src/logscan_core.cpp
```

想在构建时自动联动检查？可按需加开关 `-DCMAKE_CXX_CLANG_TIDY="clang-tidy"`（建议作为独立的 CI Lint 任务，避免拖慢本地调试编辑速度）。如果某条分析属于**确认安全的误报**，绝不能直接关掉整条全局规则，而要用**行级抑制并写明技术理由**：

```cpp
// NOLINTNEXTLINE(bugprone-easily-swappable-parameters): CLI 约定先路径后级别过滤，已由参数结构体校验
void run_scan(std::string_view file_path, std::string_view level_filter);
```

> **1 行反例提醒**：本地调试阶段不要死写 `-Werror`！随手留个临时变量测试就会编译报错打断思路。正确做法是通过 `LOGSCAN_WERROR` 选项只在 **CI 和 Release/Sanitizer 预设中打开 `-Werror`**。

---

## 三、运行时动态诊断：ASan / UBSan / TSan (ENG-47)

静态分析看不出运行时的动态内存关系。很多致命 Bug 在常规构建中**不会立刻崩溃**：数组越界读 1 字节可能正好落在对齐填充区，释放后使用（Use-After-Free）在堆块尚未被重分配前也能“幸运地”读出旧字符串。

**Sanitizer** 在编译期往指令里插入影子内存（Shadow Memory）和运行时检查代码，一旦程序在运行中踩线，**第一现场立刻急停并打印精确调用栈**！

| 工具 | 编译/链接开关 | 能抓什么致命 Bug？ | 使用铁律与注意事项 |
| --- | --- | --- | --- |
| **ASan** | `-fsanitize=address` | 堆/栈/全局缓冲区越界、Use-After-Free、双重释放、内存泄漏（LSan） | **与 TSan 绝对互斥**；会增加 ~2x 内存与耗时 |
| **UBSan** | `-fsanitize=undefined` | 有符号整数溢出、空指针解引用、移位越界、对齐错误 | 开销极小，强烈建议**与 ASan 联用** |
| **TSan** | `-fsanitize=thread` | 多线程数据竞争（Data Race）、死锁锁序风险 | **必须单独建构建目录**；开销约 5x~15x |

### 1. 在 `CMakeLists.txt` 中成对接入 Sanitizer

```cmake
option(LOGSCAN_ENABLE_ASAN "Enable AddressSanitizer + UBSan" OFF)
option(LOGSCAN_ENABLE_TSAN "Enable ThreadSanitizer" OFF)

if(LOGSCAN_ENABLE_ASAN AND LOGSCAN_ENABLE_TSAN)
  message(FATAL_ERROR "ASan and TSan are mutually exclusive; choose separate build directories.")
endif()

function(apply_sanitizers target_name)
  if(CMAKE_CXX_COMPILER_ID MATCHES "GNU|Clang|AppleClang")
    if(LOGSCAN_ENABLE_ASAN)
      target_compile_options(${target_name} PRIVATE -fsanitize=address,undefined -fno-omit-frame-pointer -g)
      target_link_options(${target_name} PRIVATE -fsanitize=address,undefined)
    elseif(LOGSCAN_ENABLE_TSAN)
      target_compile_options(${target_name} PRIVATE -fsanitize=thread -fno-omit-frame-pointer -g)
      target_link_options(${target_name} PRIVATE -fsanitize=thread)
    endif()
  endif()
endfunction()
```

**两个高频坑**：
1. `target_compile_options` 和 `target_link_options` **必须成对添加**，否则链接时报错找不到 `__asan_init` 等运行时符号。
2. Windows MinGW 对 ASan/TSan 支持不完整，建议在 **Linux / WSL2 Ubuntu（GCC 或 Clang）** 中运行全套 Sanitizer 验收。

### 2. 最小故障对照：悬垂 `std::string_view` 与读懂三段栈

```cpp
// ❌ 故障版：ASan 立刻触发 ERROR: AddressSanitizer: heap-use-after-free
#include <iostream>
#include <memory>
#include <string>
#include <string_view>

int main() {
    auto ptr = std::make_unique<std::string>("ERROR disk full");
    std::string_view view = *ptr; // view 借用堆上 string 的内部指针
    ptr.reset();                  // 堆对象释放，view 瞬间变成悬垂视图！
    std::cout << view << '\n';    // 💣 ASan 在此行报错：READ of size 15
    return 0;
}
```

ASan 报告永远给你三把手术刀（从上往下读）：
1. **错误现场栈（`READ of size 15`）**：崩溃发生时试图非法读写的源码行；
2. **释放栈（`freed by thread T0`）**：这块内存是在哪一行被 `ptr.reset()` 释放掉的；
3. **分配栈（`previously allocated by thread T0`）**：这块内存最初是在哪一行 `make_unique` 申请出来的。

修复方案：只要对象生命期跨越了原所有者的作用域，借用视图（`std::string_view`）必须转为**值拥有（`std::string owned = *ptr;`）**。

---

## 四、`install()` 安装规则与可重定位 RPATH (ENG-48)

把 `build/linux-release/logscan` 直接压缩发给别人非常粗糙：测试用的中间文件混在一起、示例文档没带、如果你还链了自己编译的共享库 `liblogscan_core.so`，拿到另一台机器或换个目录立刻报错 `error while loading shared libraries: liblogscan_core.so: cannot open shared object file`！

### 1. 用 `GNUInstallDirs` 编写标准 `install()` 规则

```cmake
include(GNUInstallDirs)

install(TARGETS logscan logscan_core
  RUNTIME DESTINATION ${CMAKE_INSTALL_BINDIR}   # bin/logscan(.exe) 及 Windows .dll
  LIBRARY DESTINATION ${CMAKE_INSTALL_LIBDIR}   # lib/liblogscan_core.so
  ARCHIVE DESTINATION ${CMAKE_INSTALL_LIBDIR}   # lib/liblogscan_core.a
)

install(DIRECTORY include/
  DESTINATION ${CMAKE_INSTALL_INCLUDEDIR}       # include/logscan/*.hpp
)

install(FILES README.md sample.log
  DESTINATION ${CMAKE_INSTALL_DOCDIR}           # share/doc/logscan/
)
```

### 2. 为什么需要相对 RPATH（`$ORIGIN` / `@executable_path`）？

如果 `bin/logscan` 动态链接了 `lib/liblogscan_core.so`，构建时 CMake 往二进制里写的默认 RPATH 是你本机的绝对路径 `/home/alice/logscan/build/src`！一旦解包到用户机器的 `/opt/logscan/` 就彻底失灵。

配置**可重定位的相对安装 RPATH**，让二进制永远去自己所在位置旁边的 `../lib` 找动态库：

```cmake
if(APPLE)
  set(CMAKE_INSTALL_RPATH "@executable_path/../${CMAKE_INSTALL_LIBDIR}")
elseif(UNIX)
  set(CMAKE_INSTALL_RPATH "$ORIGIN/../${CMAKE_INSTALL_LIBDIR}")
endif()
set(CMAKE_INSTALL_RPATH_USE_LINK_PATH TRUE)
```

- **Windows 怎么处理动态库？** Windows 没有 RPATH 机制，它最优先从**与 `.exe` 相同的目录（`bin/`）**加载 `.dll`——把 `SHARED` 库的 `RUNTIME DESTINATION` 一样设为 `${CMAKE_INSTALL_BINDIR}` 即可自动落在一起！
- **安装后核验运行时依赖**：
  - Linux：`ldd ./bin/logscan`（确认没有 `not found`）
  - macOS：`otool -L ./bin/logscan`
  - Windows：`dumpbin /dependents .\bin\logscan.exe`（或检查仅依赖系统标准 DLL）

```bash
# 安装到临时暂存目录（绝不要用 sudo 直接装进系统目录污染环境）
cmake --install build/linux-release --prefix /tmp/stage-logscan
```

---

## 五、GitHub Actions 跨平台 CI 构建矩阵 (ENG-49)

本机绿了的代码，队友一拉下来就编不过，通常有三种原因：本地 `build/` 缓存了旧选项、忘了 `git add` 新建的头文件、或在 Windows 下写错了头文件大小写（`#include "Core.hpp"` 在 Linux 直接爆炸）。

在仓库新建 **`.github/workflows/ci.yml`**，每次 `push` 和 `pull_request` 都在**全新干净容器**里跑完三平台构建矩阵：

```yaml
name: CI Matrix

on:
  push:
    branches: [ main ]
  pull_request:
    branches: [ main ]

jobs:
  build-and-test:
    strategy:
      fail-fast: false
      matrix:
        include:
          - os: ubuntu-latest
            build_type: Debug
            extra_flags: "-DLOGSCAN_ENABLE_ASAN=ON -DLOGSCAN_WERROR=ON"
          - os: ubuntu-latest
            build_type: Release
            extra_flags: "-DLOGSCAN_WERROR=ON"
          - os: windows-latest
            build_type: Release
            extra_flags: "-DLOGSCAN_WERROR=ON"
          - os: macos-latest
            build_type: Debug
            extra_flags: "-DLOGSCAN_WERROR=ON"

    runs-on: ${{ matrix.os }}

    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Install Linux dependencies
        if: runner.os == 'Linux'
        run: sudo apt-get update && sudo apt-get install -y ninja-build libsqlite3-dev

      - name: Configure
        run: >
          cmake -S . -B build
          -DCMAKE_BUILD_TYPE=${{ matrix.build_type }}
          ${{ matrix.extra_flags }}

      - name: Build
        run: cmake --build build --config ${{ matrix.build_type }} --parallel

      - name: Test
        run: ctest --test-dir build -C ${{ matrix.build_type }} --output-on-failure

      - name: Upload CTest failure logs
        if: failure()
        uses: actions/upload-artifact@v4
        with:
          name: ctest-logs-${{ matrix.os }}-${{ matrix.build_type }}
          path: build/Testing/Temporary/
```

设计高质量 CI 流水线的四个细节：
1. **`fail-fast: false`**：Ubuntu 挂了不要立刻掐断 Windows 和 macOS 任务，一次性看清究竟是单平台 Bug 还是全平台问题。
2. **拆开 Configure / Build / Test 三个 Step**：一眼定位到底挂在配置、编译还是测试阶段。
3. **`if: failure()` 上传日志产物**：正常全绿时干干净净；一旦某组失败，可直接下载 `Testing/Temporary/LastTest.log` 复现现场。
4. **加速构建**：引入大依赖时可加 `actions/cache@v4` 缓存构建目录或开启 `ccache` / `sccache`。

---

## 六、发行打包（`CPack`）、调试符号分离与校验验收 (ENG-50)

安装规则写好后，CMake 自带的 **`CPack`** 工具可以直接把 `install()` 产物打包成标准的 `.tar.gz`、`.zip`、甚至 `.deb` / `.msi` 安装包。

在顶层 `CMakeLists.txt` 末尾加上：

```cmake
set(CPACK_PACKAGE_NAME "logscan")
set(CPACK_PACKAGE_VERSION "${PROJECT_VERSION}")
set(CPACK_PACKAGE_DESCRIPTION_SUMMARY "LogScan C++20 CLI log analyzer")
set(CPACK_GENERATOR "TGZ;ZIP")    # Linux/macOS 常用 TGZ，Windows 常用 ZIP
include(CPack)
```

### 1. 调试符号分离：既要线上体积小，又要崩溃能查栈！

正式发行的 `Release`（推荐 **`RelWithDebInfo`**）包如果保留完整 DWARF 调试符号，体积可能膨胀 5~10 倍；但如果直接 `strip` 删光符号，线上用户一旦崩溃只给你一份 `core dump`，你对着一堆十六进制地址根本没法看调用栈！

**工业标准做法——剥离并单独归档调试符号**：

```bash
# Linux (objcopy)：把调试符号抽到单独的 .debug 文件归档留存，原程序瘦身并挂上 debuglink
objcopy --only-keep-debug ./bin/logscan ./logscan.debug
strip --strip-debug --strip-unneeded ./bin/logscan
objcopy --add-gnu-debuglink=./logscan.debug ./bin/logscan
```

- **Windows MSVC**：`/Zi` + `/DEBUG` 天然就会把符号分离进独立 `.pdb` 文件，只需把 `.pdb` 存进内部符号服务器而不塞进用户压缩包即可。
- **macOS**：使用 `dsymutil ./bin/logscan -o logscan.dSYM` 导出调试符号包后再 `strip -S`。

### 2. 生成压缩包、SHA-256 校验值与干净环境冒烟测试

```bash
# 1. 构建并运行 CPack 生成发行归档（如 logscan-0.1.0-Linux.tar.gz）
cmake --build build/linux-release --parallel
cpack --config build/linux-release/CPackConfig.cmake -B dist

# 2. 生成防篡改校验文件
cd dist
sha256sum logscan-0.1.0-Linux.tar.gz > logscan-0.1.0-Linux.tar.gz.sha256
# Windows PowerShell 等价命令：Get-FileHash .\logscan-0.1.0-win64.zip -Algorithm SHA256

# 3. 模拟真实用户：在全新空目录校验哈希、解包并跑通冒烟测试！
mkdir -p /tmp/clean-smoke && cd /tmp/clean-smoke
sha256sum -c /path/to/dist/logscan-0.1.0-Linux.tar.gz.sha256
tar -xzf /path/to/dist/logscan-0.1.0-Linux.tar.gz
./logscan-0.1.0-Linux/bin/logscan ./logscan-0.1.0-Linux/share/doc/logscan/sample.log
echo "smoke_exit=$?"
./logscan-0.1.0-Linux/bin/logscan missing.log; echo "missing_exit=$?"
```

**发布前最后检查清单**：归档内**严禁**包含 `.git/`、本地 `build/`、开发机绝对路径、SQLite 测试数据库快照或私有测试日志！

---

## 七、动手微练习（含参考答案）

### 练习 1：编译告警与 `clang-tidy` 实操（ENG-45 / ENG-46）

在 [LogScan v0.1 参考工程](../../labs/logscan-build/) 的 `logscan_core.cpp` 中故意留一个未使用的局部变量 `int unused_counter = 0;`，用预设或命令行开启 `-Wall -Wextra -Wpedantic` 及 `-DLOGSCAN_WERROR=ON` 构建，记录诊断输出；删除该变量后重跑恢复。

<details><summary>参考答案</summary>

开启 `-DLOGSCAN_WERROR=ON` 后，编译器在 `unused_counter` 所在行报错 `error: unused variable 'unused_counter' [-Werror=unused-variable]` 并以非零退出。删掉该变量重跑构建与 `ctest --output-on-failure`，告警清零且全量测试通过。

</details>

### 练习 2：ASan 抓出悬垂视图（ENG-47）

在 WSL2 / Linux 用 `g++ -std=c++20 -fsanitize=address,undefined -fno-omit-frame-pointer -g` 分别编译第三节中的「故障版」和「修复版」，对照输出和退出码。

<details><summary>参考答案</summary>

故障版编译正常通过，运行时被 ASan 立即拦截，打印 `ERROR: AddressSanitizer: heap-use-after-free`，精确列出读异常现场、先前的 `ptr.reset()` 释放栈和最初的 `make_unique` 分配栈，进程非零退出；修复版改用 `std::string owned = *ptr;`，输出 `ERROR disk full` 且退出码为 `0`。

</details>

### 练习 3：安装、CPack 打包与干净目录冒烟验收（ENG-48 / ENG-50）

为练习工程补上 `install()` 与 `include(CPack)`，用 `cpack` 打出压缩包并生成 `.sha256` 文件；随后在全新的 `/tmp/clean-smoke` 空目录验证校验和、解包并分别用随包自带的 `sample.log` 和不存在的 `missing.log` 做冒烟运行。

<details><summary>参考验收结果</summary>

`sha256sum -c` 输出 `OK`；解包扫描自带 `sample.log` 输出 `INFO 3` / `WARN 1` / `ERROR 1` / `UNKNOWN 0`（退出码 `0`）；传入 `missing.log` 向 `stderr` 报错并退出 `1`。

</details>

---

参考：[CMake Presets 手册](https://cmake.org/cmake/help/latest/manual/cmake-presets.7.html)、[CMake install 命令](https://cmake.org/cmake/help/latest/command/install.html)、[CPack 手册](https://cmake.org/cmake/help/latest/module/CPack.html)、[Google Sanitizers Wiki](https://github.com/google/sanitizers/wiki)、[GitHub Actions 文档](https://docs.github.com/en/actions)。
