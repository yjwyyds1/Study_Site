---
title: "怎么写一篇别人能复现的实验笔记"
description: "用一次日志前缀判断错误示范：留下输入、观察和修复后的证据。"
category: "实验记录"
series: "工程笔记"
order: 1
tags: ["调试", "写作", "LogScan"]
related: ["handbook/toolchain", "labs/logscan", "notes/decision-note"]
---

> 这是一篇配套写作示例。下文是供练习的复现场景，不是学习者的实践记录。

## 先写现象，再写解释

假设原先要识别 `INFO `（末尾有空格），改了一行之后，熟悉的 `INFO ready` 被判成了 `false`。这一页用[工具链课](../../handbook/toolchain/)的 `hello.cpp` 示范怎样记下可重复的证据。你需要会在 PowerShell 构建它；第一次用断点时，按工具链课的 CLion 小节操作。学完试着只给另一位读者你的记录，看他能不能复现。

### 复现时，每次只动一件事

把 `hello.cpp` 下载到自己的练习目录，在 Windows PowerShell 进入该目录，先用 MinGW 的 `g++` 建立基线：

```powershell
Get-Location
g++ -std=c++20 -g -O0 -Wall -Wextra -Wpedantic hello.cpp -o hello.exe
if ($LASTEXITCODE -ne 0) { throw '先修复构建错误。' }
.\hello.exe
$LASTEXITCODE
```

`-g` 给调试器准备源码行与变量信息，`-O0` 减少优化对单步观察的干扰。第一次应打印 `starts with INFO: true`，状态是 0。如果连文件或编译器都找不到，先回到当前目录和工具链检查；不拿旧产物继续试。

只将 `line.starts_with("INFO ")` 的参数换成 `"WARN "`，保持固定输入 `INFO ready`。**先预测：**第一个比较字符从哪对哪？文字输出和退出码分别会变吗？重建后应看到文字变成 `false`，退出码仍为 0。程序完成了运行，所以状态仍是成功；算错的是业务判断。

### 把观察和推断分开

| 要留的证据 | 这个场景的例子 |
| --- | --- |
| 最小输入 | 程序里的字面量 `INFO ready`，两次构建都不动它 |
| 预测 | 按需求，起始五个字符是 `INFO `，应得到 `true` |
| 观察 | 在 `is_info` 初始化所在行暂停，先读 `line`。单步越过该行，在输出前看到 `is_info` 为 `false` |
| 推断及验证 | 字符没有读错，错误出在比较：把输入首字符 `I` 和规则首字符 `W` 比。只把比较串恢复为 `INFO `，重跑变回 `true` |
| 保留反例 | 输入改为 `INFORMATION ready`，比较第 5 个字符 `R` 和空格，预期 `false`。修好正例后它仍不应被认作 INFO |

## 记下下一次实验

**独立变式：**把输入改成 `INFOX ready`。在练习副本移除比较串中的空格，再恢复它。交出输入、两次构建命令和运行结果，说明为何这个输入能找到原来样例漏掉的问题。验收：带空格的规则应输出 `false`；你的记录能让别人从相同的源码和目录重做。

<details>
<summary>提示与核对</summary>

前四个字符相同；没有空格的规则只比较四个字符，得到 `true`，有空格的规则还会比较第 5 个字符 `X`，得到 `false`。两个版本的程序都正常退出。记录“单步看到的值”，不要把它和猜测写成同一句。

</details>

做完可以把同样的记录方法用在 [LogScan v0.1 的回归练习](../../labs/logscan-build/)：这次需要留下哪一个测试首先发现了问题，而不只截一张报错图。
