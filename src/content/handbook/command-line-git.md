---
title: "在 PowerShell 复现构建，用 Git 记录一次改动"
description: "先确认工作目录和退出码，再在独立的本地仓库里用 status、diff 和 log 证明一次行为变化。"
order: 40
tags: ["PowerShell", "Git", "命令行", "复现"]
related: ["handbook/toolchain", "handbook/blank-program", "handbook/cmake-targets"]
sources: []
---

## 先隔离练习仓库

给分类器输入一行 `not a level`。现在它显示 `OTHER`，你要改为 `UNKNOWN`，并留下能复查的提交。先学过[逐行分类器](../../handbook/blank-program/)，能在 Windows PowerShell 用支持 C++20 的 MinGW `g++` 编译它，并装好 Git。

**当前工作目录**是命令查找相对路径的起点；**源码目录**是保存 `classify.cpp` 的地方。下面让它们一开始重合，稍后故意分开。**仓库**保存 Git 的记录；这次在系统临时目录新建练习仓库，不设远程。即使从 CLion 的 Terminal 开始，也先进入这个目录。

```powershell
Get-Command git, g++ -ErrorAction Stop
$practice = Join-Path ([IO.Path]::GetTempPath()) ('cpp-git-' + [guid]::NewGuid().ToString('N'))
$repo = Join-Path $practice 'repo'
New-Item -ItemType Directory -Path $practice -ErrorAction Stop | Out-Null
New-Item -ItemType Directory -Path $repo -ErrorAction Stop | Out-Null
Set-Location -LiteralPath $repo -ErrorAction Stop
Get-Location
git -C "$repo" init
if ($LASTEXITCODE -ne 0) { throw 'git init failed' }
git -C "$repo" rev-parse --show-toplevel
```

最后一行应显示刚建的 `cpp-git-…/repo`，Windows 上可能显示正斜杠。若它不是这个新目录，先停下核对。把下载的 [classify.cpp](../../examples/classify.cpp) 保存到这里。后面的 `git -C "$repo"` 让 **Git** 在练习仓库执行；PowerShell 自己的目录仍由 `Get-Location` 显示。

## 复现一次构建和运行

先预测：首行会显示什么，`lines` 会是多少？对照下载源码，`std::getline` 读到的 `line` 为 `not a level`。它非空，也不以 `INFO `、`WARN ` 或 `ERROR ` 开头，所以 `classify_line` 走到最后的 `return "OTHER";`。随后 `classify_stream` 把 `lines` 从 0 加到 1，读到输入结束后才输出总数。

在 `$repo` 运行下面的命令。`|` 把给定的一行送到程序的**标准输入**，即程序从管道接收文本的通道；调用运算符 `&` 执行变量中存放的程序路径。`$LASTEXITCODE` 表示上一个外部程序的退出码，紧跟着读取。构建失败就停，免得误跑旧文件。

```powershell
Get-Location
if (-not (Test-Path -LiteralPath '.\classify.cpp' -PathType Leaf)) { throw '找不到 classify.cpp' }
$exe = Join-Path $practice 'classify.exe'
g++ -std=c++20 -Wall -Wextra -Wpedantic '.\classify.cpp' -o "$exe"
$buildCode = $LASTEXITCODE
if ($buildCode -ne 0) { throw "Build failed ($buildCode)" }
'not a level' | & "$exe"
$runCode = $LASTEXITCODE
$runCode
```

可执行文件在仓库外。预期程序向**标准输出**（正常结果的通道）依次写 `OTHER` 和 `lines: 1`，运行退出码为 `0`；末尾的 `0` 是 PowerShell 显示的退出码。

再试一次 `& "$exe" 'missing.txt'` 后立刻查看 `$LASTEXITCODE`。在这个新目录里，它应向标准错误打印 `cannot open: missing.txt`，退出码为 `1`。此时编译已经成功，失败的是程序运行时打开相对路径的那一步。若从 CLion 的运行配置复现，核对其中的工作目录、参数、输入来源和所用编译器；运行目录可以和源码目录不同。

## 给原版和改版各留一个提交

**工作区**是编辑器正在改的文件；**暂存区**（index）是 Git 为下一次提交准备的文件版本；**提交**是 Git 写进本地历史的快照，`HEAD` 在这里指最近一次提交。普通 `git diff` 比较「暂存区 → 工作区」，`git diff --cached` 比较「HEAD → 暂存区」。

先为原版留快照。成功提交后，三处的 `return` 都是 `OTHER`，`status --short` 没有输出。

```powershell
git -C "$repo" config --local user.name "Practice Student"
git -C "$repo" config --local user.email "student@example.invalid"
git -C "$repo" status --short
git -C "$repo" add -- classify.cpp
git -C "$repo" --no-pager diff --cached -- classify.cpp
git -C "$repo" commit -m "Add line classifier baseline"
```

`status --short` 初次应显示 `?? classify.cpp`；首次暂存的差异会显示整份新文件。确认暂存的是这一份源码再提交。如果这里的任意命令失败，先修复再继续。

用 CLion 或文本编辑器打开练习副本，只把函数最后的 `return "OTHER";` 改为 `return "UNKNOWN";` 并保存。先预测：如果 `add` 后再把这一行改成 `return "FALLBACK";`，不再 `add` 就执行 `commit`，哪一个会进历史？

表中只跟踪最后一个 `return` 的字符串。`status --short` 的两列分别表示暂存区相对 HEAD、工作区相对暂存区有没有变化；用 `·` 标记实际显示的空格。

| 动作 | 工作区 | 暂存区 | HEAD | 状态两列 |
| --- | --- | --- | --- | --- |
| 提交原版 | `OTHER` | `OTHER` | `OTHER` | 无输出 |
| 保存改版 | `UNKNOWN` | `OTHER` | `OTHER` | `·M` |
| `git add -- classify.cpp` | `UNKNOWN` | `UNKNOWN` | `OTHER` | `M·` |
| 再编辑并保存 | `FALLBACK` | `UNKNOWN` | `OTHER` | `MM` |
| 直接提交 | `FALLBACK` | `UNKNOWN` | `UNKNOWN` | `·M` |

先对 `UNKNOWN` 重跑构建：`not a level` 应输出 `UNKNOWN`、`lines: 1`，退出码为 `0`；`'INFO start' | & "$exe"` 应输出 `INFO`、`lines: 1`。然后暂存：

```powershell
git -C "$repo" status --short
git -C "$repo" --no-pager diff -- classify.cpp
git -C "$repo" add -- classify.cpp
git -C "$repo" status --short
git -C "$repo" --no-pager diff --cached -- classify.cpp
```

现在只把 `UNKNOWN` 改为 `FALLBACK` 并保存，**不要再 add**。运行下列命令：第一份 diff 应是 `UNKNOWN → FALLBACK`，第二份仍是 `OTHER → UNKNOWN`。普通 `commit` 会把第二份变化写进历史。

```powershell
git -C "$repo" status --short
git -C "$repo" --no-pager diff -- classify.cpp
git -C "$repo" --no-pager diff --cached -- classify.cpp
git -C "$repo" commit -m "Rename fallback label to UNKNOWN"
git -C "$repo" status --short
git -C "$repo" --no-pager show HEAD -- classify.cpp
git -C "$repo" --no-pager log -2 --oneline
```

看到 `show` 里的 `UNKNOWN` 和仍在的 ` M classify.cpp`，就解释了这个反例：`add` 复制的是当时的内容，保存文件不会刷新暂存区。把练习副本里的 `FALLBACK` 手动改回 `UNKNOWN` 并保存，`status --short` 应没有输出。

## 故意跑错一次，再定位

把位置移到练习仓库的上一级 `Set-Location -LiteralPath $practice`，再运行构建步骤的 `g++` 那一行。它应该报告找不到 `classify.cpp`。记录当前目录、出错命令和非零退出码，用 `Get-Location` 与 `Test-Path` 确认原因。回到 `$repo` 后重跑，恢复 `UNKNOWN` 的输出；这个故障不需要修改源码。

如果 `git diff` 没有变化，先确认编辑器保存的是练习副本，再看 `status --short` 和 `diff --cached`。如果提交提示身份未知，核对上面的 `config --local` 是否成功。最后留一条可以复查的记录：构建命令、输入、改前与改后输出、退出码，以及 `git -C "$repo" --no-pager show HEAD -- classify.cpp` 中的那一行差异。

### 独立变式：改一条分支的输出

从干净的 `$repo` 出发，让 `INFO start` 的标签变成 `NOTICE`。保留 `not a level` 的 `UNKNOWN`，两次运行都打印 `lines: 1` 并退出 `0`。提交前用暂存差异证明只改了一个返回值；提交后用 `git show HEAD -- classify.cpp` 核对改动，并确认 `status --short` 为空。

<details><summary>提示与参考答案</summary>

在 `line.starts_with("INFO ")` 的分支只改 `return "INFO";`，换成 `return "NOTICE";`。匹配条件继续用 `INFO `；否则旧输入到不了这一分支。先重建，用两条输入分别验证，再暂存、检查和提交。

</details>

参考：[Git 的 add](https://git-scm.com/docs/git-add)、[status](https://git-scm.com/docs/git-status)、[diff](https://git-scm.com/docs/git-diff)、[PowerShell 的退出码](https://learn.microsoft.com/en-us/powershell/module/microsoft.powershell.core/about/about_automatic_variables#lastexitcode)、[N4861 的前缀匹配](https://timsong-cpp.github.io/cppwp/n4861/string.starts.with)。
