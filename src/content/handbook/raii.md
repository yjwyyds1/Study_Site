---
title: "用 RAII 表达资源的所有权"
description: "让文件流负责关闭文件，用 unique_ptr 观察独占所有权的转移，并区分自动清理与操作成功。"
order: 3
tags: ["C++20", "RAII", "所有权", "异常安全"]
related: ["handbook/lifetime", "labs/logscan", "notes/lab-notebook"]
sources: ["raii.cpp"]
---

## 谁来关文件？

手边有一份 `preview.txt`，第一行是 `INFO ready`，第二行是 `WARN retry`。工具只打印首行；如果已经决定跳过预览，就提前返回；如果预览过程中抛出错误，就让外层报告。文件已经打开，这三条路上分别由谁关它？先确认你能编译单个 C++20 源文件，并能从[生命周期一课](../../handbook/lifetime/)找出局部对象在哪个代码块里创建。

打开文件会占用系统资源，关文件是归还这份资源，磁盘上的文件仍在。**所有权**就是负责最后清理的责任。`std::ifstream` 是输入文件流：它的**构造**建立一个流并尝试打开文件，它的**析构**会销毁内部的文件缓冲对象，由缓冲对象调用关闭操作。把资源的清理交给对象的析构，这就是 **RAII**（Resource Acquisition Is Initialization，资源获取即初始化）在这里的用法。文件流对象构造完成也可能没打开文件，所以打开后仍要检查 `if (!file)`。[N4861：文件流构造](https://timsong-cpp.github.io/cppwp/n4861/ifstream.cons) · [文件缓冲析构](https://timsong-cpp.github.io/cppwp/n4861/filebuf.cons)

先只看文件，不引入指针。**作用域**在这里就是局部名字所在的代码块；离开这个块时，已构造的局部对象会按规则析构。代码用 `throw` 模拟业务中途失败；它把控制交给外层匹配的 `catch`。到达处理处之前，沿途需要退出的局部对象先被销毁，这段过程叫**栈展开**。[N4861：离开作用域](https://timsong-cpp.github.io/cppwp/n4861/stmt.jump) · [栈展开](https://timsong-cpp.github.io/cppwp/n4861/except.ctor)

把下面这段存成 `raii-trace.cpp`。先猜三次调用是否都会打印 `after file scope`，以及第三次会先打印它还是 `caught: preview failed`。

```cpp
#include <cstdio>
#include <fstream>
#include <iostream>
#include <stdexcept>
#include <string>
#include <string_view>

struct ScopeNote {
    ~ScopeNote() {
        std::puts("after file scope");
    }
};

void preview_file(const char* path, std::string_view mode) {
    ScopeNote note;                 // 先构造，所以比 file 晚析构。
    std::ifstream file{path};
    if (!file) {
        throw std::runtime_error(std::string{"cannot open: "} + path);
    }
    std::cout << "opened: " << mode << '\n';
    if (mode == "early") {
        return;
    }
    if (mode == "throw") {
        throw std::runtime_error("preview failed");
    }
    std::string line;
    if (std::getline(file, line)) {
        std::cout << "first line: " << line << '\n';
    }
}

int main(int argc, char* argv[]) {
    if (argc != 2) {
        std::cerr << "usage: raii-trace [file]\n";
        return 2;
    }
    try {
        preview_file(argv[1], "normal");
        preview_file(argv[1], "early");
        preview_file(argv[1], "throw");
    } catch (const std::runtime_error& error) {
        std::cout << "caught: " << error.what() << '\n';
        return 1;
    }
}
```

| `mode` | `preview_file` 执行到哪儿 | 离开时按什么顺序走 |
| --- | --- | --- |
| `normal` | `getline` 读到首行，打印后走到末尾的 `}` | `line` 析构 → `file` 析构，执行关闭 → `note` 析构，打印标记 |
| `early` | 执行 `return`，没创建 `line` | `file` 析构，执行关闭 → `note` 打印标记 → 回到 `main` |
| `throw` | 执行 `throw`，没创建 `line` | `file` 析构，执行关闭 → `note` 打印标记 → `catch` 打印异常 |

在练习目录打开 PowerShell，用 MinGW 的 `g++` 创建输入并编译。构建退出码是 `0` 才运行；找不到编译器时参照[工具链一课](../../handbook/toolchain/)，出现编译错误时先修第一条诊断。这个观察程序要用刚创建的非空文件运行。

```powershell
Get-Location
$dir = (Get-Location).Path
[IO.File]::WriteAllText((Join-Path $dir 'preview.txt'), "INFO ready`nWARN retry`n")
g++ -std=c++20 -Wall -Wextra -Wpedantic raii-trace.cpp -o raii-trace.exe
$LASTEXITCODE
.\raii-trace.exe '.\preview.txt'
$LASTEXITCODE
```

```text
opened: normal
first line: INFO ready
after file scope
opened: early
after file scope
opened: throw
after file scope
caught: preview failed
```

构建的退出码是 `0`，运行的退出码是 `1`，因为 `catch` 报告了我们主动抛出的失败。换成不存在的路径，第一次调用就在打开检查处抛出异常，预期先打印 `after file scope`，再打印 `caught: cannot open: ...`，同样退出 `1`。`ScopeNote` 的析构函数 `~ScopeNote()` 只打印一句；它的位置能说明 `file` 已先析构，不能证明底层关闭成功。

## 看一次独占所有权转移

正式的预览示例用 `print_preview(std::istream& input)` **借用**流。借用表示可以读这个对象，但不用接管它的清理。文件由调用处的 `file` 持有，读取函数负责决定给读者看哪一行。
如果读取失败并抛出异常，先清理函数内的局部对象，再清理调用处的 `file`，最后进入 `main` 的 `catch`。

读首行只需要一个局部 `std::string`。这里特地换成 `std::make_unique<std::string>()` 创建一份动态管理的字符串，让我们观察它怎样换所有者。`std::unique_ptr<std::string>` 是管理这一份字符串的**独占指针**：指针对象存着地址并负责销毁字符串。`auto` 在此推导出这个指针类型。表达式 `*draft` 叫**解引用**，取得指针指向的字符串本身；`getline(input, *draft)` 因而能把文字写进它。解引用前指针必须非空。[N4861：独占指针观察操作](https://timsong-cpp.github.io/cppwp/n4861/unique.ptr.single.observers)

先猜 `draft empty:` 会打印 `true` 还是 `false`。用 `S` 表示同一个字符串对象，不预设它的地址是多少：

| 执行点 | `draft` | `preview` | 字符串 `S` |
| --- | --- | --- | --- |
| `auto draft = std::make_unique<std::string>();` | 拥有 `S` | 还未创建 | 内容为空 |
| `getline(input, *draft)` 读到首行 | 仍拥有 `S` | 还未创建 | 内容是 `INFO ready` |
| `auto preview = std::move(draft);` | 仍在作用域内，已变空 | 接过 `S` | 同一个对象，内容没变 |
| `print_preview` 正常结束 | 后析构，不删除字符串 | 先析构，删除 `S` | 不再存活 |

`std::move(draft)` 把表达式转换成允许调用移动操作的形式。真正转交责任的是新指针 `preview` 的**移动构造**：它拿到原地址，`draft` 变为空指针。移动的是所有权，字符串没有换地址。[N4861：`std::move`](https://timsong-cpp.github.io/cppwp/n4861/forward) · [`unique_ptr` 移动构造](https://timsong-cpp.github.io/cppwp/n4861/unique.ptr.single.ctor)

{{example:raii.cpp}}

## 自动清理也有边界

清理资源和完成业务是两件事。比如报告写到一半出错，输出流析构会收尾，已经写出的文本不会因此撤回。若需要把关闭失败报告给调用者，在正常流程里显式 `close()` 并检查流状态；如果开启了流的异常掩码，还要处理异常。若要求失败时保留原报告，要单独设计何时替换它。[N4861：输出流的 `close()`](https://timsong-cpp.github.io/cppwp/n4861/ofstream.members)

<details>
<summary>进阶：构造到一半失败，谁来清理？</summary>

普通非委托构造在构造途中抛出异常时，整个对象没有完成构造，不运行它自己的析构函数；已经构造完成的相应成员和基类会按规则逆序清理。所以有多个资源时，可以逐个交给能自行清理的成员，再做下一步。异常正在栈展开时，如果又有异常从析构函数逃出，程序会调用 `std::terminate`，不能指望和这里有外层匹配 `catch` 的演示一样清理。[N4861：异常中的构造与析构](https://timsong-cpp.github.io/cppwp/n4861/except.ctor) · [终止处理](https://timsong-cpp.github.io/cppwp/n4861/except.terminate)

</details>

<details>
<summary>进阶：什么时候让另一个函数接手？</summary>

只需要显示字符串，可以用 `const std::string&` 借用它；允许没有对象时，可以用 `const std::string*` 并检查空值。`.get()` 只取出地址，用它重新构造另一个独占指针会让两个管理者都试图删除同一对象。只有接口确实要接手销毁责任时，才按值接收 `std::unique_ptr<std::string>` 并由调用方移动传入。[C++ Core Guidelines：智能指针参数](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#rr-smartptrparam)

</details>

## 观察与练习

把 `raii.cpp` 放到同一个练习目录，在 PowerShell 用 MinGW 的 `g++` 构建。先看构建退出码，成功才运行这些用例；运行前确认目录里没有 `missing.txt`。

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic raii.cpp -o raii.exe
$LASTEXITCODE
```

```powershell
[IO.File]::WriteAllText((Join-Path $dir 'empty.txt'), '')
[IO.File]::WriteAllText((Join-Path $dir 'blank-first.txt'), "`nINFO ready")
.\raii.exe
$LASTEXITCODE
.\raii.exe '.\preview.txt'
$LASTEXITCODE
.\raii.exe '.\empty.txt'
$LASTEXITCODE
.\raii.exe '.\blank-first.txt'
$LASTEXITCODE
.\raii.exe 'missing.txt'
$LASTEXITCODE
```

| 输入 | 标准输出或错误 | 退出码 |
| --- | --- | --- |
| 无参数，使用内置文本；或 `'.\preview.txt'` | 两行：`draft empty: true`、`first line: INFO ready` | 0 |
| 零字节文件 `'.\empty.txt'` | `empty input`；提前返回时 `draft` 仍拥有字符串 | 0 |
| `'.\blank-first.txt'` | 两行：`draft empty: true`、`first line:` 后没有正文；空行也被成功读到 | 0 |
| `'missing.txt'` | 标准错误为 `cannot open: missing.txt`，没有预览 | 1 |

做一次只改一行的对照：在练习副本把 `auto preview = std::move(draft);` 改为 `auto preview = draft;`，再编译。预期编译失败，诊断会提到被删除的复制构造函数：它不能从 `draft` 复制出第二份独占所有权。还原后重新构建，确认正常输出。移动后也别通过 `*draft` 访问原字符串，它此时已空。

**独立变式：预览第一条非空行。** 在练习副本中跳过长度为零的行；只含空格的行照常预览。如果所有行都跳过，输出 `empty input`；打开和读取错误仍走各自原有的错误分支。用以下输入验收：

- `blank-first.txt`：打印 `draft empty: true` 和 `first line: INFO ready`，退出 `0`，确认没有末尾换行的正文仍能读到。
- 只有两个换行符的文件与零字节文件：都只打印 `empty input`，退出 `0`。
- 首行为一个普通空格、第二行为 `INFO ready`：预览的是首行的一个空格，不打印第二行。缺失文件仍向标准错误报错并退出 `1`。

<details>
<summary>卡住时看提示</summary>

重复读取时先看 `getline` 是否成功，再看字符串是不是空的。只有找到要展示的那一行才执行移动构造；读完和读取失败仍要分别处理。

</details>

<details>
<summary>参考答案与验收</summary>

在原来的 `if (!std::getline(input, *draft))` 前读到第一条合格的文本，再通过流状态进入原来的分支。正常打印和 `main` 都不用改。具体做法是把原来的 `if` 开头替换为：

```cpp
while (std::getline(input, *draft)) {
    if (!draft->empty()) {
        break;
    }
}
if (!input) {
```

`draft->empty()` 等价于 `(*draft).empty()`，检查的是字符串。循环因非空行而 `break` 时，流仍可作为真值，继续移动和打印。循环因读取失败而结束时，原来判断 `bad()` 与 `eof()` 的分支继续负责区分读取错误和没有可预览的行。

</details>

## 下一步：LogScan

把这个分工带到 [LogScan v0](../../labs/logscan/)：入口管理打开的文件，扫描函数借用输入流。需要在下一次读取之后继续用的文本，再保存到自己拥有的字符串里。

## 参考资料

- [C++ Core Guidelines R.1：用 RAII 管理资源](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rr-raii)
- C++20 工作草案 N4861：[栈展开](https://timsong-cpp.github.io/cppwp/n4861/except.ctor) · [文件缓冲析构](https://timsong-cpp.github.io/cppwp/n4861/filebuf.cons) · [独占指针的移动构造](https://timsong-cpp.github.io/cppwp/n4861/unique.ptr.single.ctor) · [逐行读取](https://timsong-cpp.github.io/cppwp/n4861/string.io)
