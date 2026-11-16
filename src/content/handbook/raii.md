---
title: "第三课：用 RAII 表达资源的所有权"
description: "让文件流负责关闭文件，用 unique_ptr 观察独占所有权的转移，并区分自动清理与操作成功。"
order: 3
minutes: 30
tags: ["C++20", "RAII", "所有权", "异常安全"]
related: ["handbook/lifetime", "labs/logscan", "notes/lab-notebook"]
sources: ["raii.cpp"]
---

## 谁来关文件？

试写一个只读首行的日志预览器。它可能顺利读到一行，也可能遇到空文件、打开失败或读取错误。如果每条退出路径都要记得单独关闭文件，日后加一个提前返回就可能漏掉。可以把责任交给持有文件的对象：资源跟着对象走，当持有者析构时，由它完成清理。这就是 RAII 在这里的用法。

下面的 `std::ifstream` 在构造时尝试打开文件，打开失败时会置失败状态，程序用 `if (!file)` 检查。打开成功后，文件流持有文件；`print_preview(std::istream& input)` 只是借用这个流，不负责关闭。正常离开作用域、提前 `return`，或者抛出异常并向外展开栈时，已经构造好的局部持有者都会被销毁。文件流的缓冲对象会在析构时调用关闭操作。

## 看一次独占所有权转移

预览函数用 `std::make_unique<std::string>()` 创建字符串，先由 `draft` 独占。普通局部 `std::string` 就足以存储一行，这里特地把它放到独占指针里，好观察交接。读成功后，`auto preview = std::move(draft);` 让 `preview` 移动构造。真正接手资源的是移动构造函数；`std::move` 让编译器可以选择它。转移后原字符串没有被移动或复制，`draft` 变空，`preview` 成为字符串的新主人，最后由它释放。

`std::unique_ptr<T>` 可以移动，不能复制。若函数只需看内容，优先传 `const T&`；若要允许没有对象的情况，可以用不拥有对象的 `const T*`，先检查是否为空。用 `.get()` 得到的是借用，不能用它再构造另一个拥有同一资源的独占指针。只有函数确实要接手所有权时，才考虑按值接收 `std::unique_ptr<T>`。

{{example:raii.cpp}}

## 自动清理也有边界

构造函数抛出异常时，尚未构造完成的整个对象不会执行自己的析构函数，但已经构造完成的成员和基类会按规则销毁。写资源类时，尽早把拿到的资源交给能自动清理的成员，再做可能失败的下一步。别指望析构函数把异常传给调用者；如果析构在栈展开期间又抛出异常并让它逃逸，程序会调用 `std::terminate`。

自动关文件只解决资源清理，不会撤销已经写出的数据。比如将来要生成报告，不能用「文件流已析构」判断写盘成功；需要报告关闭失败时，应在正常流程中显式调用 `close()` 并检查流状态（使用异常掩码时也要处理可能抛出的异常）。如果业务还要求“失败时保留原报告”，那需要另外设计写入与提交的步骤。

## 观察与练习

先预测：默认运行时 `draft` 还非空吗？文件为空与文件打不开，是否应该给同样的退出状态？在源码目录构建后，可以先用内置文本，再试自备的日志文件。下面用 `preview.txt` 做文件名示例；请把它换成自己的文件名。

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic raii.cpp -o raii.exe
if ($LASTEXITCODE -eq 0) { .\raii.exe }
# 确认上一步成功后，再用文件参数运行：
.\raii.exe ".\preview.txt"
$LASTEXITCODE
```

默认输出应为 `draft empty: true` 和 `first line: INFO ready`。再用真正的空文件、以空白行开头的文件和不存在的路径各试一次。最后在练习副本中，把 `throw std::runtime_error("preview failed");` 加在移动构造之后、打印语句之前，使用一个存在的非空文件运行。猜一猜哪个对象先清理，哪个后清理，`catch` 何时才开始执行。

<details>
<summary>提示 1：先分清空行和没读到行</summary>

空行也有分隔符，`getline` 消耗了它；一个字节也没有的文件则在第一次读取时就遇到文件末尾。

</details>

<details>
<summary>提示 2：沿调用路径往外退</summary>

异常从 `print_preview` 抛出。先退出这个函数，再退出 `main` 里创建文件流的代码块。分别找出两个作用域里的所有者。

</details>

<details>
<summary>参考答案与验收</summary>

空文件打印 `empty input`、退出码为 `0`；首行为空时仍会打印 `first line:`，只是其后无正文。文件打不开则向标准错误输出 `cannot open: ...` 并返回 `1`。首行没有末尾换行但含有文本时，仍能读到并打印该行。

注入异常后，先销毁 `preview` 并释放字符串，再销毁已空的 `draft`，最后销毁调用处的 `file` 并关闭文件，然后 `catch` 输出 `preview failed`，返回 `1`。撤掉这一行再跑一次，确认恢复正常预览。

</details>

## 下一步：LogScan

把同样的分工带到 LogScan：入口打开文件并决定退出码，扫描函数借用输入流，一行一行处理；要留到下一轮读取之后的文本，保存到自己拥有的字符串里。

## 参考资料

- [C++ Core Guidelines R.1：用 RAII 管理资源](https://isocpp.github.io/CppCoreGuidelines/CppCoreGuidelines#Rr-raii)
- C++20 工作草案 N4861：[独占指针的移动构造](https://timsong-cpp.github.io/cppwp/n4861/unique.ptr.single.ctor) · [栈展开与构造失败](https://timsong-cpp.github.io/cppwp/n4861/except.ctor) · [何时调用 `std::terminate`](https://timsong-cpp.github.io/cppwp/n4861/except.terminate)
- C++20 工作草案 N4861：[文件流构造](https://timsong-cpp.github.io/cppwp/n4861/ifstream.cons) · [文件缓冲析构](https://timsong-cpp.github.io/cppwp/n4861/filebuf.cons) · [显式关闭输出流](https://timsong-cpp.github.io/cppwp/n4861/ofstream.members) · [`getline` 的行为](https://timsong-cpp.github.io/cppwp/n4861/string.io)
