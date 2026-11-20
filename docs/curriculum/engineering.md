# C++20／工程工具链（ENG）

[课程总览](../course-outline.md) · [默认路线](route.md) · [实验与验收](logscan.md)

本学科覆盖从零基础打开终端、Git 版本控制全栈、现代目标化 CMake 构建、CTest／单元测试与 GDB/LLDB 调试，直到静态分析、Sanitizer、GitHub Actions CI 与 CPack 打包发布的完整 **50 课工程工具链（ENG-01 ~ ENG-50）**。起步可沿用 Windows PowerShell／CLion，Linux 练习与 Sanitizer／RPATH 验收在原生 Linux 或 WSL2 Ubuntu 内运行。

| 里程碑 | 课堂产物与证据 |
| --- | --- |
| v0 单文件统计 · 已发布 | [实验](../../src/content/labs/logscan.md)与[单文件源码](../../public/examples/logscan.cpp)。Windows 实测 8/8。 |
| v0.1 多文件工程 · 已发布 | [实验](../../src/content/labs/logscan-build.md)与[参考工程下载](../../public/examples/logscan-build/reference.zip)。Windows 实测 CTest 5/5，且与 v0 的八个场景契约一致。 |
| [v1 多文件聚合 · 已发布](../../src/content/labs/logscan-v1.md) | 复用解析核心与用例，测试固定报告顺序、空文件与整批失败，再接 CI。 |
| [v2 本地归档 · 已发布](../../src/content/labs/logscan-v2.md) | 引入 SQLite，验收导入、查询、回滚与 Linux 安装复跑。 |
| [v3 TCP 服务 · 已发布](../../src/content/labs/logscan-service.md) | 从 v2 归档继续扩展并发队列、分帧解码与跨线程 ACK；[分帧](../../public/examples/network-framing.cpp)与[队列](../../public/examples/concurrency-queue.cpp)提供单项示例。 |

仓库的[历史实测记录](../example-verification.md)注明了 Windows 工具版本和验证边界。以下练习中的结果是验收预期，Linux／WSL 结果与后续项目产物由学员在相应环境实测。

## 第一篇 终端、Shell 与编译入门

### 模块一 终端、路径与进程通道

- 入口：零起点，能启动终端即可。
- 能力：分清 Terminal 与 Shell、理解工作目录与环境变量 `PATH`、能分离 `stdout`/`stderr` 并捕获退出码。
- 检验：在带空格目录下完成重定向分离与 `&&` 短路验证。

<a id="eng-01"></a>

#### ENG-01 Terminal vs Shell（PowerShell 与 Bash）

- 先修：零起点
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：终端窗口和 Shell 解释器有什么区别？为什么含空格的路径不加引号就会报错？
- 小节
  1. 区分 Terminal Emulator（界面层）与 Shell（命令解析与子进程调度层）。
  2. 对比 PowerShell 与 Bash 的单双引号展开、转义符及内建别名差异。
  3. 掌握带空格路径的引号包裹与 `-LiteralPath` 安全写法。
- 能力：能解释命令行分词规则，并在 PowerShell 与 Bash 中正确传递含空格参数。
- 练习与结果：创建带空格目录 `my logs`，对比加引号与不加引号读取 `./my logs/sample.log` 的差异。

<a id="eng-02"></a>

#### ENG-02 当前工作目录与绝对／相对路径

- 先修：[ENG-01](#eng-01)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：为何 IDE 点运行能打开文件，换到终端却报找不到路径？
- 小节
  1. 区分当前工作目录（`cwd`）、源码目录与可执行文件目录。
  2. 掌握 `.`、`..`、`~` 以及绝对路径与相对路径的解析起点。
  3. 识别斜杠 `/` 与 `\`、Windows NTFS 与 Linux ext4 大小写敏感性差异。
- 能力：能通过 `pwd` 与路径检查定位“站错房间”导致的文件缺失错误。
- 练习与结果：在 `my logs` 内与退回父目录 `..` 后分别用 `./sample.log` 读取，验证失败后用完整相对/绝对路径恢复。

<a id="eng-03"></a>

#### ENG-03 环境变量与 `PATH` 搜索机制

- 先修：[ENG-01](#eng-01)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：明明装了 `g++` 或 `cmake`，为什么终端还是报 `command not found`？
- 小节
  1. 理解进程环境变量表及其父子进程继承边界。
  2. 掌握 `PATH` 从左到右搜索顺序与 Linux 默认不含 `.` 的安全规则。
  3. 用 `Get-Command -All` 与 `which -a` 排查命令缺失与多版本遮蔽。
- 能力：能在终端临时设置环境变量并快速诊断编译器版本冲突。
- 练习与结果：分行打印本机 `PATH` 并用 `which -a g++` / `Get-Command g++ -All` 核对当前生效的编译器路径。

<a id="eng-04"></a>

#### ENG-04 标准流（`stdin` / `stdout` / `stderr`）与重定向

- 先修：[ENG-02](#eng-02)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：为什么程序正常输出能重定向存盘，报错信息却依然留在屏幕上？
- 小节
  1. 分清文件描述符 `0`（`stdin`）、`1`（`stdout`）、`2`（`stderr`）与缓冲差异。
  2. 掌握 `>`、`>>`、`2>`、`> file 2>&1`、`<` 与管道 `|` 的流向控制。
  3. 遵守 CLI 通道纪律：结构化结果走 `stdout`，错误诊断走 `stderr`。
- 能力：能独立分离与合并两路输出流，避免诊断文本污染下游管道。
- 练习与结果：运行程序时分别用 `1> out.txt 2> err.txt` 分离正常文本与诊断，并实验 `2>&1 > all.log` 的常见顺序反例。

<a id="eng-05"></a>

#### ENG-05 退出码与条件短路链 `&&` / `||`

- 先修：[ENG-04](#eng-04)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：为什么 PowerShell 的 `$?` 不能用来读 `.exe` 的具体失败数字？
- 小节
  1. 理解 `0` 与非零退出码约定（`1` 运行失败、`2` 用法错误、`127`/`128+N`）。
  2. 区分 Bash 的 `$?`、PowerShell 的 `$LASTEXITCODE` 及覆盖陷阱。
  3. 用 `&&`、`||` 与 `set -euo pipefail` 编排安全命令链。
- 能力：能在外部程序结束时第一时间捕获退出码并阻断失败后续命令。
- 练习与结果：将程序改为 `return 7;`，验证 `&& echo "skip"` 不会触发，并读取到退出码 `7`。

### 模块二 编译器驱动、排错与编辑器联动

- 入口：能在终端跑通单文件程序并查看退出码。
- 能力：读懂编译器驱动参数与前 6 类高频错误，打通编辑器与构建系统的配置同步。
- 检验：故意触发未定义符号与 ODR 冲突并用 `-c` 区分阶段；生成 `compile_commands.json`。

<a id="eng-06"></a>

#### ENG-06 调用编译器（`g++`/`clang++`/`cl`）与警告参数

- 先修：[ENG-03](#eng-03)、[ENG-05](#eng-05)、[CPP-01](cpp.md#cpp-01)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：`-std=c++20 -Wall -Wextra -Wpedantic -g -c` 各自究竟在控制编译器的哪一步？
- 小节
  1. 理解预处理 `-E`、汇编 `-S`、目标文件 `-c` 与链接四阶段。
  2. 对照 `g++`、`clang++` 与 MSVC `cl.exe` 的标准、告警与优化参数。
  3. 合理使用 `-I`、`-D`、`-g`、`-O0`/`-O2` 与 `-o` 产物命名。
- 能力：能脱离 IDE 手动用严谨的 C++20 告警基线参数编译单文件与多文件程序。
- 练习与结果：使用 `-std=c++20 -Wall -Wextra -Wpedantic -g` 编译 [hello-minimal.cpp](../../public/examples/hello-minimal.cpp) 并运行确认返回 `0`。

<a id="eng-07"></a>

#### ENG-07 解码前 6 类高频编译与链接报错

- 先修：[ENG-06](#eng-06)、[CPP-02](cpp.md#cpp-02)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：为什么单个 `.cpp` 能编过 `-c`，最终却提示 `undefined reference` 或 `multiple definition`？
- 小节
  1. 遵循“从第一条 `error:` 看起”原则，识别文件、行号、列号与 `^` 定位。
  2. 快速定位语法漏分号、未声明标识符、缺头文件/不完整类型与类型/const 违背。
  3. 区分链接器 `ld`/`LNK2019` 漏定义与 `LNK2005` ODR 重复定义。
- 能力：能在 10 秒内将报错归类到语法期、类型期还是链接期并精准修复。
- 练习与结果：用双文件工程分别复现 `-c` 成功但链接报 `undefined reference`，以及头文件写函数体触发 `multiple definition`。

<a id="eng-08"></a>

#### ENG-08 编辑器工作流：`compile_commands.json` 与 `.editorconfig`

- 先修：[ENG-06](#eng-06)
- 层级：入门（起步主线）
- 状态：已有[第 0 课：终端、Shell、编译排错与编辑器工作流](../../src/content/handbook/eng-zero-start.md)。
- 问题：为什么命令行明明能编译通过，VS Code / clangd 却满屏画红波浪线？
- 小节
  1. 理解编译器与 IDE 语言服务器（`clangd`）各自独立解析参数的原因。
  2. 用 `-DCMAKE_EXPORT_COMPILE_COMMANDS=ON` 生成 `compile_commands.json` 消除假报错。
  3. 配置 `.editorconfig` 统一 UTF-8、LF 换行符与缩进风格并纳入 Git 追踪。
- 能力：能同步构建参数给编辑器并保障跨编辑器团队代码格式基础一致。
- 练习与结果：在工程根目录创建 `.editorconfig`，导出 `compile_commands.json` 并核对其中包含 `-std=c++20` 条目。

## 第二篇 Git 版本控制核心基础

### 模块三 对象模型、配置与仓库初始化

- 入口：熟悉终端目录切换与基础命令操作。
- 能力：理解 Git 分布式快照思想、完成身份与 SSH 鉴权配置并看懂 `.git/` 内部结构。
- 检验：完成本地全局配置与仓库初始化，核对 `.git/` 目录关键文件。

<a id="eng-09"></a>

#### ENG-09 为什么用 Git：快照模型 vs 增量补丁

- 先修：[ENG-01](#eng-01)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：Git 和早期 SVN 到底差在哪？为什么切分支不需要复制整个目录？
- 小节
  1. 对比传统增量补丁模型（SVN）与 Git 分布式全量快照模型。
  2. 认识内容寻址文件系统与四类底层对象：`blob`、`tree`、`commit`、`tag`。
  3. 理解 SHA 哈希链条带来的不可篡改与断网本地提交能力。
- 能力：能用对象与指针的心智模型解释 Git 为什么既省空间又极快。
- 练习与结果：用 `git log` 与 `git cat-file -t`（或画图）说明未修改文件如何在连续提交中被安全复用。

<a id="eng-10"></a>

#### ENG-10 `git config` 配置体系与 SSH / HTTPS 鉴权

- 先修：[ENG-09](#eng-09)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：全局邮箱和项目专用邮箱冲突怎么办？SSH 密钥和 HTTPS Token 怎么选？
- 小节
  1. 区分 `--system`、`--global`、`--local` 三层配置覆盖顺序。
  2. 配置 `init.defaultBranch main`、`pull.rebase`、`core.autocrlf` 与 `merge.conflictstyle zdiff3`。
  3. 生成 Ed25519 SSH 密钥对并通过 `ssh -T git@github.com` 验证握手。
- 能力：能为个人与团队环境安全配置 Git 身份与免密远程鉴权。
- 练习与结果：用 `git config --list --show-origin` 检查所有生效配置及其来源文件。

<a id="eng-11"></a>

#### ENG-11 `git init` 与 `git clone`：揭开 `.git/` 目录的秘密

- 先修：[ENG-10](#eng-10)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：初始化一个仓库时到底生成了什么？浅克隆 `--depth 1` 适合什么场景？
- 小节
  1. 掌握 `git init -b main` 本地建库与 `git clone` / `--depth 1` 浅克隆。
  2. 解剖 `.git/` 内部关键文件：`HEAD`、`config`、`index`、`objects/`、`refs/`。
  3. 避免在子目录误执行 `git init` 造成嵌套 gitlink 故障。
- 能力：能独立创建隔离练习仓库并清晰分辨工作区与 `.git` 元数据目录。
- 练习与结果：在临时目录初始化 `-b main` 仓库，查看 `.git/HEAD` 初始内容并配置 `--local` 练习用户身份。

### 模块四 三棵树、规范与历史审计

- 入口：已初始化隔离练习仓库。
- 能力：熟练驾驭三棵树流转、编写 `.gitignore`/`.gitattributes`、执行多维度 diff 与历史追责。
- 检验：在隔离仓库复现 `MM` 状态陷阱、清理误追踪二进制并完成 Pickaxe 考古检索。

<a id="eng-12"></a>

#### ENG-12 Git 的核心心智模型：三棵树

- 先修：[ENG-11](#eng-11)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：工作区、暂存区（Index）与 `HEAD` 之间是如何流转数据的？
- 小节
  1. 建立 Working Directory → Staging Area (Index) → Repository (`HEAD`) 三棵树心智模型。
  2. 读懂 `git status --short` 两列状态码（`??`、`A·`、`·M`、`M·`、`MM`、`UU`）。
  3. 识别“修改已暂存但工作区再次改写”的 `MM` 常见状态。
- 能力：能只看 `git status -s` 输出就说出文件在三棵树中哪两棵不一致。
- 练习与结果：对 [classify.cpp](../../public/examples/classify.cpp) 制造出 `MM` 状态并截图或记录状态码含义。

<a id="eng-13"></a>

#### ENG-13 `git status` / `git add` / `git commit` 与优秀提交习惯

- 先修：[ENG-12](#eng-12)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：为什么保存了新代码后直接 `git commit`，提交进历史的却是旧内容？
- 小节
  1. 实战验证 `OTHER → UNKNOWN → FALLBACK` 三树演练，破除“commit 会自动读工作区”的误解。
  2. 用 `git add -p` 逐块拆分无关修改，践行原子提交（Atomic Commit）。
  3. 撰写 Conventional Commits 规范标题，并用 `--amend` 修正未推送的最近提交。
- 能力：能把混杂修改拆成职责单一、信息清晰的原子提交。
- 练习与结果：完成 `OTHER → UNKNOWN → FALLBACK` 演练后不 `add` 直接 `commit`，用 `git show HEAD` 验证写入的是 `UNKNOWN`。

<a id="eng-14"></a>

#### ENG-14 `.gitignore` 与 `.gitattributes`（CRLF vs LF）

- 先修：[ENG-13](#eng-13)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：为什么把 `build/` 加进 `.gitignore` 后，之前提交进去的文件还是继续产生变更？
- 小节
  1. 编写适用于 C++ 工程的 `.gitignore`，屏蔽构建产物与个人 IDE 配置。
  2. 用 `git rm --cached` 安全取消跟踪误入库文件，并用 `git check-ignore -v` 核验规则。
  3. 用 `.gitattributes` 统一跨平台文本 LF、脚本 CRLF 与二进制文件保护策略。
- 能力：能阻止二进制与构建缓存污染仓库，并彻底消灭跨平台换行符冲突。
- 练习与结果：故意提交一次 `.exe` 后补写 `.gitignore`，用 `git rm --cached` 将其从索引移除并保留本地文件。

<a id="eng-15"></a>

#### ENG-15 跨越三棵树的精确比对：`git diff` 全家桶

- 先修：[ENG-12](#eng-12)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：明明改了文件，为什么敲 `git diff` 却什么都没有输出？
- 小节
  1. 区分 `git diff`（工作 vs 暂存）、`git diff --cached`（暂存 vs `HEAD`）与 `git diff HEAD`。
  2. 对比任意两提交/分支（`main..feat`），使用 `--stat`、`--name-only` 与 `--word-diff`。
  3. 读懂 Unified Diff 区块头 `@@ -11,5 +11,5 @@` 与上下行变化标记。
- 能力：能在提交前精确审计即将入库的每一行差异。
- 练习与结果：在 `MM` 状态下依次执行三种 `diff`，对照验证每条命令吐出的改动片段。

<a id="eng-16"></a>

#### ENG-16 历史洞察与追责三件套：`git log` / `git show` / `git blame`

- 先修：[ENG-15](#eng-15)
- 层级：入门（起步主线）
- 状态：已有[Git 核心基础正文](../../src/content/handbook/command-line-git.md)。
- 问题：线上发现一行可疑代码，如何 30 秒查清当年是谁在什么背景下改的？
- 小节
  1. 用 `git log --oneline --graph --decorate --all` 与 `--follow` 看清拓扑与文件沿革。
  2. 使用 Pickaxe 搜索（`-S` / `-G`）精准定位某个符号或字符串何时被增删。
  3. 用 `git show <hash>:<path>` 与 `git blame -L -w -M -C` 追溯上下文而不被纯缩进改动误导。
- 能力：能不靠肉眼翻页快速审计大型仓库中的任何历史变更背景。
- 练习与结果：连续提交 3 次（含一次纯缩进调整），用 `git log -S` 与 `git blame -w` 定位真正修改逻辑的提交。

## 第三篇 Git 进阶与团队协作全书

### 模块五 分支原理、合并与冲突裁决

- 入口：已熟练掌握单分支三棵树工作流。
- 能力：理解分支指针底层结构、规范建分支并零失误完成 Fast-forward、三路合并及冲突裁决。
- 检验：制造一次同一行修改冲突，启用 `zdiff3` 解决后编译测试通过并提交。

<a id="eng-17"></a>

#### ENG-17 分支与 `HEAD` 指针的底层原理

- 先修：[ENG-11](#eng-11)、[ENG-16](#eng-16)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：分支在硬盘上到底占多少字节？什么是游离状态（Detached HEAD）？
- 小节
  1. 理解提交有向无环图（DAG）与 41 字节分支引用文件 `refs/heads/*`。
  2. 区分附着态 `HEAD` 与游离态 `Detached HEAD`，防止游离提交被垃圾回收。
  3. 掌握相对祖先语法 `HEAD~N` 与合并父节点索引 `M^1` / `M^2`。
- 能力：能看懂分支指针移动本质，在意外进入游离态时安全救出新提交。
- 练习与结果：用 `git switch --detach HEAD~1` 做一次实验提交，再用 `git switch -c rescue-detached` 挽救该提交。

<a id="eng-18"></a>

#### ENG-18 `git switch` / `git branch` 与分支命名规范

- 先修：[ENG-17](#eng-17)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：为什么现代 Git 推荐用 `switch` 取代 `checkout`？团队分支该如何命名？
- 小节
  1. 用 `git switch -c`、`git switch -` 替代语义过载的 `git checkout`。
  2. 用 `git branch -vv` 查看上游跟踪关系，区分安全删除 `-d` 与强制删除 `-D`。
  3. 采用 `feat/`、`fix/`、`hotfix/`、`refactor/`、`chore/` 团队前缀规范。
- 能力：能按职责规范隔离开发线，并在多分支间安全切换与清理。
- 练习与结果：从指定历史提交切出 `fix/` 分支并验证 `git branch -vv` 输出。

<a id="eng-19"></a>

#### ENG-19 `git merge`：Fast-forward vs 三路合并

- 先修：[ENG-18](#eng-18)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：为什么有时合并只是指针前移，有时却多出一个两个父节点的 Merge Commit？
- 小节
  1. 对比 Fast-forward（快进）与 3-Way Merge（三路合并）的拓扑触发条件。
  2. 理解共同祖先 `git merge-base` 的计算角色。
  3. 合理选用 `--no-ff`（保留分支历史）与 `--ff-only`（禁止隐式合并提交）。
- 能力：能预判每次 `git merge` 将产生的提交图形态并按团队策略选择参数。
- 练习与结果：分别演示一次 Fast-forward 与一次分叉后的三路合并，用 `git log --graph` 对照两者差异。

<a id="eng-20"></a>

#### ENG-20 合并冲突的 6 步零失误裁决

- 先修：[ENG-19](#eng-19)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：遇到 `<<<<<<< HEAD` 和 `>>>>>>>` 冲突标记时，如何确保修完不仅语法过、逻辑也没坏？
- 小节
  1. 识别 `UU` 状态文件，掌握 `git merge --abort` 随时止损撤退。
  2. 启用 `zdiff3` 读懂 `HEAD`、共同祖先 `|||||||` 与来自分支三段内容。
  3. 执行手工裁决、删净冲突标记、**重编并跑通测试**、再 `git add` 与 `git commit`。
- 能力：能冷静拆解复杂冲突并在验证测试全绿后再完成合并提交。
- 练习与结果：在 `main` 与 `feat/notice` 改坏同一行制造冲突，用 `zdiff3` 裁决后重编并测试通过。

### 模块六 Rebase、多工作树与安全撤销

- 入口：会开分支并解决常规合并冲突。
- 能力：掌握线性变基与交互式历史整理、双线抢修技巧及精准破坏半径的撤销急救手段。
- 检验：完成一次 `rebase -i` 压缩提交，并演练 `reset --hard` 后用 `reflog` 无损恢复。

<a id="eng-21"></a>

#### ENG-21 `git rebase` 线性历史与 Rebase 黄金法则

- 先修：[ENG-20](#eng-20)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：为什么 `rebase` 后提交哈希全变了？为什么绝对不能对已 `push` 的公共分支 rebase？
- 小节
  1. 理解重放提交（生成全新 SHA 哈希）与线性历史的优势。
  2. 牢记 **Rebase 黄金法则**：绝不改写已推送给团队共享的公开历史。
  3. 掌握 `git rebase --onto` 精准剪枝移植子分支的用法。
- 能力：能在私有开发分支安全变基以保持主干整洁，且不破坏队友仓库。
- 练习与结果：在本地特性分支执行 `git rebase main`，比对变基前后提交哈希的变化。

<a id="eng-22"></a>

#### ENG-22 交互式变基 `git rebase -i` 整理提交历史

- 先修：[ENG-21](#eng-21)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：本地攒了一堆 `"wip"` 和 `"fix typo"` 碎提交，提 PR 前如何整成清晰提交？
- 小节
  1. 读懂交互式待办列表的时间顺序（从旧到新）。
  2. 熟练使用 `pick`、`reword`、`edit`、`squash`、`fixup` 与 `drop`。
  3. 遇到冲突时配合 `git rebase --continue` / `--abort` 安全收尾。
- 能力：能在发起 Code Review 前把凌乱草稿整理成高信噪比的原子提交序列。
- 练习与结果：把 3 个包含 `"wip typo"` 的本地提交通过 `rebase -i` 的 `fixup` 压缩为 1 个干净提交。

<a id="eng-23"></a>

#### ENG-23 双线救火：`git stash` 与 `git worktree`

- 先修：[ENG-18](#eng-18)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：写到一半的 C++ 代码不想提交，切分支又怕把庞大的 CMake 构建缓存全弄失效怎么办？
- 小节
  1. 用 `git stash push -u -m`、`list`、`pop`/`apply` 暂存与恢复半成品现场。
  2. 用 `git worktree add/list/remove` 在旁路目录同时检出第二个分支。
  3. 为大型 C++ 工程保留独立构建目录，消除切分支触发的全量重编耗时。
- 能力：能在不打断当前工作流与构建缓存的前提下并行处理紧急缺陷。
- 练习与结果：用 `git worktree add ../hotfix main` 并行开出第二个工作树，检查 `git worktree list` 后再安全移除。

<a id="eng-24"></a>

#### ENG-24 安全撤销：`restore` / `reset` / `revert` 破坏半径对比

- 先修：[ENG-12](#eng-12)、[ENG-21](#eng-21)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：改错了文件或提错了历史，到底该用 `restore`、`reset` 还是 `revert`？
- 小节
  1. 区分只改工作区（`restore`）、只撤暂存区（`restore --staged`）的安全操作。
  2. 对比 `reset --soft`、`--mixed`、`--hard` 对三棵树的影响半径。
  3. 用 `git revert`（及针对合并提交的 `-m 1`）安全撤销已推送到远端的错误提交。
- 能力：能根据“是否已推送到远端”与“需保留哪些改动”零失误选对撤销工具。
- 练习与结果：演练一次对未推送提交 `reset --soft HEAD~1` 重写，以及对已合并主干的提交执行 `git revert`。

<a id="eng-25"></a>

#### ENG-25 终极抢救：用 `git reflog` 找回丢失提交

- 先修：[ENG-24](#eng-24)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：手滑敲了 `git reset --hard` 或 `branch -D` 删错了分支，提交过的代码还有救吗？
- 小节
  1. 理解 `.git/objects/` 垃圾回收保留期与本机 `HEAD` 移动日记 `git reflog`。
  2. 用 `git reflog` 查找事故前一刻的 `HEAD@{n}` 与提交哈希。
  3. 通过新建 `rescue` 分支无损复活已“消失”的历史提交。
- 能力：能在常见误重置、误删分支事故发生后第一时间自主抢救代码。
- 练习与结果：故意执行 `git reset --hard HEAD~1`，再通过 `git reflog` 建 `rescue` 分支完整恢复该提交。

### 模块七 协作工作流、二分抓虫与版本交付

- 入口：掌握本地分支、变基与恢复操作。
- 能力：用 `bisect` 高效定位回归提交、熟练运行远端同步与 PR 流程、规范发布语义化版本标签。
- 检验：用 `git bisect run` 自动定位一次注入的回归提交。

<a id="eng-26"></a>

#### ENG-26 精确移植与二分排错：`cherry-pick` 与 `git bisect`

- 先修：[ENG-21](#eng-21)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：如何只把另一个分支的单个修复搬过来？上百个提交里怎么快速定位唯一引入 Bug 的那次？
- 小节
  1. 用 `git cherry-pick -x` 跨分支精准移植单个缺陷修复提交。
  2. 用 `git bisect start/bad/good/skip/reset` 手动二分缩小故障范围（$O(\log N)$）。
  3. 编写判据脚本配合 `git bisect run`（返回 `125` 跳过无法编译版本）全自动抓虫。
- 能力：能在几百次提交的庞大历史中于几分钟内精确命中首个破坏测试的提交。
- 练习与结果：在 8 次提交的练习仓中故意在第 5 次破坏分类规则，用 `git bisect run` 自动抓出该提交并执行 `git bisect reset`。

<a id="eng-27"></a>

#### ENG-27 远程协作（`fetch` / `pull --rebase` / `push`）与 PR 流程

- 先修：[ENG-10](#eng-10)、[ENG-21](#eng-21)
- 层级：核心应用（项目主线）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：`git fetch` 和 `git pull` 有何本质不同？什么时候必须用 `--force-with-lease`？
- 小节
  1. 分清本地分支与远程跟踪分支 `origin/*` 的只读快照本质。
  2. 用 `git fetch` + `git pull --rebase` / `--ff-only` 保持本地分支与主干干净同步。
  3. 走通工业标准 Pull Request 闭环，并用 `--force-with-lease` 安全更新重排后的 PR 分支。
- 能力：能在团队远端协作中避免覆盖队友提交并交付高质量可评审 PR。
- 练习与结果：使用本地裸仓库或 GitHub 远端模拟一次同步主干、变基推送与 PR 合并清理全过程。

<a id="eng-28"></a>

#### ENG-28 语义化标签（Tag）、Git Hooks 与 Submodule 概览

- 先修：[ENG-27](#eng-27)
- 层级：进阶专题（项目进阶）
- 状态：已有[Git 进阶全书正文](../../src/content/handbook/eng-git-mastery.md)。
- 问题：发布软件版本怎么打 Tag？如何在提交前自动拦截冲突标记或未格式化代码？
- 小节
  1. 掌握 SemVer（`vMAJOR.MINOR.PATCH`）规范与附注标签 `git tag -a`、`git push origin <tag>`。
  2. 编写客户端 `.git/hooks/pre-commit` 在提交落盘前自动校验空白与冲突残留。
  3. 了解 `git submodule` 机制及现代 C++ 项目中与 `FetchContent`/包管理器的取舍。
- 能力：能规范标记可追溯的里程碑版本并设立基础的本地提交门禁。
- 练习与结果：打一个附注标签 `v0.1.0`，运行 `git describe --tags --always` 核对版本串，并测试一次 `pre-commit` 拦截残留冲突标记。

## 第四篇 现代 CMake 目标化构建体系

### 模块八 目标、库拆分与依赖传播

- 入口：具备多文件编译与链接概念（ENG-07）。
- 能力：使用现代目标化 CMake 拆出库与可执行文件、控制可见性传播并组织多目录工程。
- 检验：完成 `prefix-demo` 工程及 `logscan_core`/`logscan` 多目录拆分。

<a id="eng-29"></a>

#### ENG-29 源码外构建（`-S . -B build`）与四阶段流程

- 先修：[ENG-06](#eng-06)
- 层级：入门（起步主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：为什么不能在源码目录直接敲 `cmake .`？配置、生成、构建各自在干什么？
- 小节
  1. 坚持 `-S <源码> -B <构建目录>` 源码外构建，保持源码与 Git 状态绝对干净。
  2. 区分 Configure（写 `CMakeCache.txt`）、Generate（写 `build.ninja`/`.sln`）、Build 与 Run 四阶段。
  3. 理解为什么切换编译器必须另建全新构建目录而不是覆写旧缓存。
- 能力：能从任意空目录一键复现配置与构建，并快速定位故障发生在哪个阶段。
- 练习与结果：分别在 `build-cli` 与 `build-repro` 两个干净目录配置构建 `prefix_demo`，验证产物完全一致。

<a id="eng-30"></a>

#### ENG-30 `CMakeLists.txt` 核心指令与最小双文件工程

- 先修：[ENG-29](#eng-29)、[CPP-06](cpp.md#cpp-06)
- 层级：入门（起步主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：为什么能包含头文件，如果漏掉 `target_link_libraries` 还是会在最后一步失败？
- 小节
  1. 掌握 `cmake_minimum_required`、`project(... LANGUAGES CXX)`、`add_library` 与 `add_executable`。
  2. 远离全局 `include_directories()` / `CMAKE_CXX_FLAGS` 等上古污染写法。
  3. 对照注释 `target_link_libraries` 后的 `--verbose` 构建日志验证编译与链接分离。
- 能力：能独立编写清晰的目标式 `CMakeLists.txt` 并诊断漏链接故障。
- 练习与结果：复现 `prefix-demo` 漏链接实验，观察 `main.cpp.obj` 生成后链接器报 `undefined reference`。

<a id="eng-31"></a>

#### ENG-31 静态库（`STATIC`）vs 动态库（`SHARED`）vs 接口库

- 先修：[ENG-30](#eng-30)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：`.a`/`.lib` 静态库和 `.so`/`.dll` 动态库在链接和运行时有什么根本区别？
- 小节
  1. 对比 `STATIC`（归档入二进制）、`SHARED`（运行时装载）与 `INTERFACE`（纯头文件库）。
  2. 掌握通过省略关键字配合 `-DBUILD_SHARED_LIBS=ON/OFF` 让调用方灵活选择库形态。
  3. 了解 Windows MSVC 动态库默认不导出符号（`__declspec(dllexport)` / `CMAKE_WINDOWS_EXPORT_ALL_SYMBOLS`）的坑。
- 能力：能根据部署方式合理选择静态库、共享库或纯头文件接口库。
- 练习与结果：尝试把 `prefix_core` 切换为动态构建或检查 `.a`/`.lib` 产物路径差异。

<a id="eng-32"></a>

#### ENG-32 现代目标属性：`target_*` 系列命令详解

- 先修：[ENG-30](#eng-30)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：如何在目标上声明 C++20 标准、禁用非标扩展并隔离编译告警？
- 小节
  1. 熟练运用 `target_include_directories`、`target_compile_features(... cxx_std_20)`。
  2. 掌握 `target_compile_options`、`target_compile_definitions` 与 `target_link_options`。
  3. 通过 `set_target_properties(... PROPERTIES CXX_EXTENSIONS OFF)` 防止隐式依赖 GNU 扩展。
- 能力：能把所有编译与链接要求精准封装进各自所属的 CMake 目标对象上。
- 练习与结果：为 `prefix_core` 开启严格 C++20（关闭扩展）并确认不支持 GNU 专属扩展语法。

<a id="eng-33"></a>

#### ENG-33 `PUBLIC` / `PRIVATE` / `INTERFACE` 依赖传播法则

- 先修：[ENG-32](#eng-32)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：什么时候头文件和依赖库该写 `PUBLIC`，什么时候必须收紧成 `PRIVATE`？
- 小节
  1. 理解“自己编译时需不需要”与“调用方链接时需不需要继承”二维判断表。
  2. 用 `PUBLIC` 自动向 `prefix_demo` 与 `prefix_probe` 传递公共头文件和 `cxx_std_20`。
  3. 用 `PRIVATE` 把内部告警开关与私有第三方实现细节（如内部 SQLite 封装）隐藏在库内。
- 能力：能沿目标依赖图画出使用要求传播边界，避免头文件和编译选项泄露。
- 练习与结果：新增 `prefix_probe` 只写 `target_link_libraries(prefix_probe PRIVATE prefix_core)`，验证它自动继承包含目录与 C++20 要求。

<a id="eng-34"></a>

#### ENG-34 多目录工程：`add_subdirectory` 与别名目标

- 先修：[ENG-33](#eng-33)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：中型项目拆成 `include/`、`src/`、`tests/` 多层目录后，路径和目标名如何不写乱？
- 小节
  1. 用 `add_subdirectory` 组织模块化子工程目录与 `include(CTest)` 的 `BUILD_TESTING` 开关。
  2. 始终使用 `add_library(ns::core ALIAS ...)` 别名目标，配置期抓出拼写错误。
  3. 区分 `CMAKE_CURRENT_SOURCE_DIR`、`PROJECT_SOURCE_DIR` 与 `CMAKE_SOURCE_DIR`，确保工程可嵌套复用。
- 能力：能搭建结构清晰、可被其他项目作为子目录安全引入的多层 CMake 仓库。
- 练习与结果：将练习工程拆分为 `include/`、`src/`、`tests/` 三目录并用 `prefix::core` 别名链接通过。

### 模块九 构建类型、生成器表达式与外部依赖

- 入口：能使用多目录与 `PUBLIC`/`PRIVATE` 组织本地库。
- 能力：驾驭多配置生成器与生成器表达式，并规范接入 `FetchContent` 与 `find_package` 依赖。
- 检验：写出跨平台条件编译表达式，并在缺开发包环境诊断 `find_package` 报错阶段。

<a id="eng-35"></a>

#### ENG-35 构建类型（`Debug`/`Release`）与单配置／多配置生成器

- 先修：[ENG-29](#eng-29)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：为什么在 Visual Studio 生成器下传 `-DCMAKE_BUILD_TYPE=Debug` 不起作用，切完配置还运行到旧程序？
- 小节
  1. 对比 `Debug`、`Release`、`RelWithDebInfo`（生产排障主力）与 `MinSizeRel` 的底层差异。
  2. 彻底分清 Ninja/Make 单配置生成器（配置时定 `-DCMAKE_BUILD_TYPE`）与 VS/Multi-Config 多配置生成器（构建/测试时传 `--config` / `-C`）。
  3. 为不同构建类型规划互不覆盖的构建目录与产物路径核对习惯。
- 能力：能在 Linux Ninja 与 Windows Visual Studio 间准确无误地构建并运行对应配置。
- 练习与结果：在两份新目录分别构建 `Debug` 与 `Release`，记录各自的可执行文件目录及 `ctest` 命令差异。

<a id="eng-36"></a>

#### ENG-36 生成器表达式（`$<...>`）跨配置条件求值

- 先修：[ENG-35](#eng-35)
- 层级：核心应用（项目主线）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：多配置生成器在配置阶段并不知道最终是 Debug 还是 Release，怎么按配置写条件选项？
- 小节
  1. 理解配置期 `if()` 与生成期求值 `$<...>` 的时机差异。
  2. 熟练编写 `$<CONFIG:Debug>`、`$<CXX_COMPILER_ID:GNU,Clang,AppleClang>` 与 `$<BOOL:...>` 组合表达式。
  3. 使用 `$<BUILD_INTERFACE:...>` 与 `$<INSTALL_INTERFACE:...>` 隔离本地源码路径与安装接口路径。
- 能力：能写出 100% 兼容单配置与多配置、跨 GCC/Clang/MSVC 的条件目标配置。
- 练习与结果：用生成器表达式仅在 `Debug` 配置为目标定义 `PREFIX_VERBOSE=1` 并在 Debug/Release 下验证行为差异。

<a id="eng-37"></a>

#### ENG-37 用 `FetchContent` 拉取并锁定外部依赖

- 先修：[ENG-34](#eng-34)
- 层级：进阶专题（项目进阶）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：不想手动拷第三方源码，怎么用纯 CMake 自动拉取 `fmt` 或 `GoogleTest` 并锁死版本？
- 小节
  1. 掌握 `include(FetchContent)`、`FetchContent_Declare` 与 `FetchContent_MakeAvailable` 三步接入。
  2. 永远锁定精确 `GIT_TAG`（Tag 或 Commit Hash）与 `GIT_SHALLOW TRUE`，禁止写浮动 `main`。
  3. 使用 `FETCHCONTENT_SOURCE_DIR_<NAME>` 实现内网/离线环境下的无缝本地源码替换。
- 能力：能为中小型 C++ 项目零门槛接入轻量级开源库并保证构建长期可复现。
- 练习与结果：用 `FetchContent` 引入指定 Tag 的 `fmt` 或 `doctest` 到独立沙盒工程并编译通过。

<a id="eng-38"></a>

#### ENG-38 `find_package` 与系统库发现（`SQLite3` / `Threads`）

- 先修：[ENG-35](#eng-35)、[ENG-37](#eng-37)
- 层级：进阶专题（项目进阶）
- 状态：已有[现代 CMake 目标化工程正文](../../src/content/handbook/cmake-targets.md)。
- 问题：为什么系统上明明能运行 `sqlite3` 命令，CMake `find_package(SQLite3)` 却报找不到？
- 小节
  1. 区分运行时软件包（如 `libsqlite3-0`）与开发包（`-dev` 含 `.h` 头文件与链接库）。
  2. 理解 Module 模式（`Find*.cmake`）与 Config 模式（`*Config.cmake`）及 `CMAKE_PREFIX_PATH`。
  3. 链接标准导入目标 `SQLite::SQLite3` 与 `Threads::Threads`，并按接口暴露决定 `PRIVATE`/`PUBLIC`。
- 能力：能诊断依赖缺失停在配置期的根因，并写出可复现的系统依赖安装说明。
- 练习与结果：核对 `find_package(SQLite3 3.35 REQUIRED)` 在缺少与补齐 `libsqlite3-dev` 时的配置成败表现。

## 第五篇 自动化测试、调试与工程质量

### 模块十 分层测试、CTest 与测试框架

- 入口：已掌握 CMake 多文件目标拆分与 `v0.1` 基线构建。
- 能力：设计确定性分层测试、编写 CTest 单元测试与 CLI 契约测试并掌握主流测试框架模式。
- 检验：跑通 CTest 全套基线，新增边界用例并验证 Release 下依然生效。

<a id="eng-39"></a>

#### ENG-39 测试金字塔与确定性测试设计

- 先修：[ENG-34](#eng-34)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：该写多少单元测试、多少进程黑盒测试？为什么有的测试会“偶尔挂一下”？
- 小节
  1. 按测试金字塔合理分配内存单元测试、CLI 集成测试与端到端测试比重。
  2. 消除 Flaky Test：禁止依赖墙上时钟、未固定随机种子或共享易冲突临时路径。
  3. 坚持“从规则推导预期”，绝不从当前有 Bug 的程序输出反抄预期值。
- 能力：能独立把文本解析逻辑与进程 I/O 解耦，规划快速且 100% 可复现的测试集。
- 练习与结果：根据词法规则提前推导出 `"ERROR"` 与 `"ERROR:"`（无末尾换行）的预期计数并解释原因。

<a id="eng-40"></a>

#### ENG-40 `assert` vs 抛异常 vs `CTest` 调度器

- 先修：[ENG-39](#eng-39)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：为什么千万不能直接用 `<cassert>` 的 `assert()` 来写项目测试？
- 小节
  1. 实验验证 Release 构建下 `-DNDEBUG` 导致 `assert()` 被彻底编译消失的隐患。
  2. 编写跨 Debug/Release 均生效的 `CHECK` 宏与失败计数累计模式。
  3. 用 `include(CTest)`、`add_test()` 与 `ctest -N`、`--output-on-failure`、`-R`、`-V` 精准调度。
- 能力：能构建 Release 下依然有效的测试入口并熟练用 CTest 筛选排查用例。
- 练习与结果：用 `-O2 -DNDEBUG` 编译 `assert(1 == 2)` 观察其静默退出 `0`，对照 `CHECK` 宏非零退出。

<a id="eng-41"></a>

#### ENG-41 CLI 黑盒契约测试与 6 类边界输入矩阵

- 先修：[ENG-40](#eng-40)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：为何计数准确、退出码也正确，CLI 测试依然报红？
- 小节
  1. 用 CMake `execute_process` 同时锁定命令行参数、退出码、`stdout` 与 `stderr`。
  2. 逐项覆盖 6 类边界矩阵：空输入、CRLF/LF、无末尾换行、含空格路径、缺失文件与流 `badbit` 注入。
  3. 在隔离目录演练错误把诊断写进 `stdout` 导致的契约破坏。
- 能力：能为任意 CLI 工具编写覆盖完备的黑盒契约脚本。
- 练习与结果：把缺文件诊断临时从 `std::cerr` 改成 `std::cout`，预测并实测 `cli_missing_file` 报错细节后恢复。

<a id="eng-42"></a>

#### ENG-42 单元测试框架（`doctest` / `Catch2` / `GoogleTest`）与 Fixture 夹具

- 先修：[ENG-40](#eng-40)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：真实中型工程里是如何组织成百上千条测试、共享临时目录夹具与致命/非致命断言的？
- 小节
  1. 对比 `doctest`（极简单头）、`Catch2`（BDD 风格）与 `GoogleTest`（`TEST_F` + GMock）选型定位。
  2. 掌握 `TEST_CASE`/`SUBCASE` 自动重置环境与 `GoogleTest` `SetUp`/`TearDown` + RAII 夹具模式。
  3. 区分 `REQUIRE`/`ASSERT_*`（致命中止当前用例）与 `CHECK`/`EXPECT_*`（失败继续跑完）。
- 能力：能读懂并编写主流 C++ 测试框架的标准用例与资源隔离夹具。
- 练习与结果：设计一个使用 `std::filesystem::temp_directory_path()` 自动创建与清理隔离目录的 `TempDirFixture` 用例。

### 模块十一 调试器定位与回归固化

- 入口：已会用 CTest 复现测试失败。
- 能力：熟练操纵 GDB/LLDB 抓现场，并走完从故障报红到永久回归测试的 5 步工程闭环。
- 检验：保存一次失败测试、条件断点栈帧现场与永久化回归测试记录。

<a id="eng-43"></a>

#### ENG-43 用 GDB / LLDB 断点、观察点与调用栈抓现场

- 先修：[ENG-35](#eng-35)、[ENG-41](#eng-41)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：不用满屏插 `std::cout`，怎么在 10 万行循环或崩溃瞬间停在出事那一行？
- 小节
  1. 务必使用带 `-g -O0` 的 Debug 构建，避免 `<optimized out>` 与断点乱跳。
  2. 对照掌握 GDB 与 LLDB 的带参启动、行断点、**条件断点**与**内存观察点（`watch`）**。
  3. 运用 `bt`、`frame N`、`info locals`、`p` 与事后 `ulimit -c unlimited` Core Dump 定位崩溃根因。
- 能力：能根据症状选对条件断点或观察点，用内存与调用栈证据验证假设。
- 练习与结果：用 `gdb --args` 启动单元测试并在 `check_scan` 设断点，执行 `bt` 与 `info locals` 记录现场。

<a id="eng-44"></a>

#### ENG-44 最小复现闭环与回归测试固化

- 先修：[ENG-42](#eng-42)、[ENG-43](#eng-43)
- 层级：核心应用（项目主线）
- 状态：已有[工程质量体系正文](../../src/content/handbook/cli-testing.md)。
- 问题：怎么防止今天辛苦修好的 Bug，下个月重构代码时悄悄卷土重来？
- 小节
  1. 严格执行 5 步工程闭环：测试报红 → 剥离最小输入 → 调试器确认根因 → 修复回归 → 永久入库。
  2. 通过 Delta 缩减把万行日志浓缩为触发故障的最短字节序列（如 `"ERROR:"`）。
  3. 联合 `git commit` 把最小失败输入与修复代码打包成不可分割的保护护栏。
- 能力：能将每一次线上或开发期缺陷转化为永久的自动化防护资产。
- 练习与结果：在练习工程故意把 `token == "ERROR"` 改成前缀匹配，完整走通 5 步闭环并补入 CRLF 标点回归用例。

## 第六篇 工程化进阶：Presets、Sanitizer、CI 与发布打包

### 模块十二 规范预设、静态分析与动态插桩

- 入口：已通过 CTest 全部功能测试并掌握调试器基本定位。
- 能力：用 `CMakePresets.json` 统一构建指令、接入格式化与静态分析并在运行期用 Sanitizer 揪出内存与并发隐患。
- 检验：在 `linux-asan` 预设下成功捕获一次悬垂 `string_view` Use-After-Free 并完成值拥有修复。

<a id="eng-45"></a>

#### ENG-45 `CMakePresets.json` 跨平台统一预设

- 先修：[ENG-35](#eng-35)、[ENG-36](#eng-36)
- 层级：核心应用（项目主线）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：怎么把不同平台长长的 `-G`、`-D` 参数收敛成全团队和 CI 一致的 `cmake --preset`？
- 小节
  1. 编写 `CMakePresets.json` 的 `configurePresets`、`buildPresets` 与 `testPresets`。
  2. 利用 `hidden`、`inherits` 与 `condition` 分别覆盖 Linux Debug/ASan/Release 与 Windows MSVC。
  3. 划清 `CMakePresets.json`（入库共享）与 `CMakeUserPresets.json`（加入 `.gitignore` 本地覆盖）的边界。
- 能力：能为跨平台项目设计一键化标准化构建与测试入口。
- 练习与结果：编写包含 `linux-debug` 与 `linux-release` 的预设文件，验证 `cmake --list-presets` 与独立构建目录分离。

<a id="eng-46"></a>

#### ENG-46 `clang-format` 与 `clang-tidy` 静态分析

- 先修：[ENG-08](#eng-08)、[ENG-45](#eng-45)
- 层级：进阶专题（项目进阶）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：如何在测试跑不到的角落里，提前发现潜在窄化、空解引用与现代 C++ 反模式？
- 小节
  1. 用 `.clang-format` 与 `--dry-run --Werror` 在本地和 CI 强制统一格式。
  2. 配合 `compile_commands.json` 运行 `clang-tidy`，启用 `bugprone-*`、`modernize-*`、`performance-*` 检查。
  3. 区分编译告警与静态分析，通过 `LOGSCAN_WERROR` 在 CI 严格拦阻并规范使用 `NOLINTNEXTLINE`。
- 能力：能建立零告警、零格式争议的静态防线并合理处理确认安全的误报。
- 练习与结果：故意加入未使用局部变量开启 `-DLOGSCAN_WERROR=ON` 触发编译失败，随后清理恢复全绿。

<a id="eng-47"></a>

#### ENG-47 运行时动态诊断：ASan / UBSan / TSan

- 先修：[ENG-43](#eng-43)、[CPP-09](cpp.md#cpp-09)
- 层级：进阶专题（项目进阶）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：为何单元测试全绿，程序仍会在特定条件下出现悬垂访问或数据竞争？
- 小节
  1. 认识 ASan（越界/UAF/泄漏）、UBSan（未定义行为）与 TSan（数据竞争）的适用边界与互斥铁律。
  2. 在 CMake 中成对添加 `target_compile_options` 与 `target_link_options` 插桩选项。
  3. 从上往下精读 ASan 报告的“访问现场 / 释放栈 / 分配栈”三段栈并完成所有权修复。
- 能力：能使用独立 Sanitizer 构建配置抓出隐蔽内存与并发缺陷。
- 练习与结果：在 WSL2/Linux 运行悬垂 `string_view` 故障程序记录 ASan `heap-use-after-free` 栈，再用 `std::string` 修复通过。

### 模块十三 安装、跨平台 CI 与发行打包

- 入口：已配备 `CMakePresets.json` 与完善的 CTest / Sanitizer 验证集。
- 能力：制定标准安装布局与相对 RPATH、搭建 GitHub Actions 跨平台矩阵并产出可校验发行归档。
- 检验：在全新空目录核对 SHA-256 校验值、解包运行冒烟并验证外部依赖无缺失。

<a id="eng-48"></a>

#### ENG-48 `install()` 安装规则与可重定位 RPATH

- 先修：[ENG-31](#eng-31)、[ENG-38](#eng-38)
- 层级：进阶专题（项目进阶）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：为什么构建目录里能直接跑的程序，拷去另一台机器或安装目录却找不到样本与 `.so` 动态库？
- 小节
  1. 用 `GNUInstallDirs` 编写 `install(TARGETS / DIRECTORY / FILES ...)` 规范交付布局。
  2. 配置 `$ORIGIN/../lib`（Linux）与 `@executable_path/../lib`（macOS）可重定位相对 RPATH。
  3. 用 `cmake --install --prefix` 安装到临时暂存区，并通过 `ldd`/`otool -L`/`dumpbin` 核查动态库依赖。
- 能力：能交付不依赖原构建机绝对路径的可重定位安装目录。
- 练习与结果：执行 `cmake --install` 到临时前缀目录，用 `ldd` 确认无 `not found` 动态库条目。

<a id="eng-49"></a>

#### ENG-49 GitHub Actions 跨平台 CI 构建矩阵

- 先修：[ENG-27](#eng-27)、[ENG-45](#eng-45)、[ENG-47](#eng-47)
- 层级：核心应用（项目主线）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：怎样防止本机缓存或路径大小写差异在别人检出构建时突然爆雷？
- 小节
  1. 编写 `.github/workflows/ci.yml` 定义 Linux / Windows / macOS 与 Debug / Release / ASan 矩阵。
  2. 拆分 Configure / Build / Test 独立步骤并设置 `fail-fast: false`。
  3. 配置 `if: failure()` 上传 `Testing/Temporary/` 失败现场日志用于远程复盘。
- 能力：能搭建跨平台自动门禁并在 CI 失败时根据上传日志快速定位根因。
- 练习与结果：在练习分支故意破坏一条分类规则触发 CI Test 阶段红灯，修复后确认矩阵全绿。

<a id="eng-50"></a>

#### ENG-50 CPack 发行打包、调试符号分离与校验验收

- 先修：[ENG-48](#eng-48)、[ENG-49](#eng-49)
- 层级：进阶专题（项目进阶）
- 状态：已有[工程化进阶正文](../../src/content/handbook/cmake-ci-release.md)。
- 问题：如何生成带版本号、体积小巧、附带校验和的正式发布包，同时保留线上崩溃查栈能力？
- 小节
  1. 配置 `CPack` 生成 `.tar.gz` / `.zip` 正式发行归档，严禁混入构建缓存、数据库快照或私有日志。
  2. 掌握 `RelWithDebInfo` 下使用 `objcopy --only-keep-debug` / `.pdb` / `.dSYM` 分离并归档调试符号。
  3. 生成 `.sha256` 校验文件并在全新空目录执行校验、解包与 `sample.log`/缺失文件冒烟验收。
- 能力：能独立完成从构建到干净环境冒烟签收的完整软件发布流程。
- 练习与结果：用 `cpack` 打包并生成 `.sha256`，在干净临时目录验证 `sha256sum -c` 通过后运行 `sample.log`（退出 `0`）与 `missing.log`（退出 `1`）。
