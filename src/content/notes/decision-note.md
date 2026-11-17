---
title: "接口取舍小记：借用一行，还是保存一份"
description: "用 LogScan 的短期解析和长期存档对比 string_view 与 string。"
category: "设计取舍"
series: "工程笔记"
order: 2
tags: ["生命周期", "string_view", "LogScan"]
related: ["handbook/lifetime", "labs/logscan", "notes/lab-notebook"]
sources: ["borrow-or-copy.cpp"]
---

## 同一段字符，两种用途

假设 LogScan 先读到 `ERROR:`，下一行读到 `INFO ready`。现在有两个需求：立刻数出坏行；等到整份文件读完后，再把坏行的首词写进报告。能否用同一种方式保存？前置是知道 [`string_view` 借字符的规则](../../handbook/lifetime/)。这次要亲手区分“一份访问窗口”和“一份内容副本”。

{{example:borrow-or-copy.cpp}}

先写出三行预测。用下面的图跟着代码看：箭头表示读取已有内容；框表示拥有内容的对象。

```text
初始： token ──读取──> [line: ERROR:]
复制以后：            [saved: ERROR:]   独立的一份
下一轮：             [line: INFO ready]  [saved: ERROR:]
                     不再沿 token 读取
```

第一行打印时，`line` 还没被修改，`token` 能访问原字节。`std::string saved{token}` 读的是这些字符，再由 `saved` 拥有另一份内容。赋值可能替换 `line` 的字符存储，即使没有更换存储，也不应把旧视图当成历史快照。这里不执行对旧视图的读取，也不给那种反例指定输出。[C++20 草案的 string_view 说明](https://timsong-cpp.github.io/cppwp/n4861/string.view)。

在 Windows PowerShell 进入下载目录，用 MinGW 和 C++20 构建：

```powershell
g++ -std=c++20 -Wall -Wextra -Wpedantic borrow-or-copy.cpp -o borrow-or-copy.exe
if ($LASTEXITCODE -ne 0) { throw '先确认目录、源码和编译器。' }
.\borrow-or-copy.exe
```

顺序得到 `current token: ERROR:`、`next line: INFO ready`、`saved token: ERROR:`。如果第三行变成了新输入，先核对它打印的是否是 `saved`。

## 记录决定和成立条件

基本版 LogScan 只需立刻用首词更新计数。计数是独立的整数，下一次读取改写行缓冲时，上一轮不再需要首词视图。如果现在要把坏行留给结束后的报告，保存一份拥有内容的字符串；除非调用方能保证借来的字符仍有效，且内容保持不变。

**独立变式：**只把 `saved` 的初始化改为从 `token.substr(0, 5)` 复制。先算三行，再编译。验收：前两行不变，最后一行应为 `saved token: ERROR`（没有冒号）。追加一行解释：为什么可以在复制前调整窗口范围，却不能在下一轮才拿旧窗口来复制？

<details>
<summary>提示与核对</summary>

`substr(0, 5)` 在源内容没改时选中前五个字符，本身仍是读取窗口；紧接着构造的 `std::string` 才有自己的五个字符。

</details>
