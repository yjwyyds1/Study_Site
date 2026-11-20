---
title: "Git 核心基础：对象模型、配置鉴权、三棵树与历史审计"
description: "从零彻底掌握 Git 快照模型与文件对比、git config 与 SSH/HTTPS 鉴权、init/clone 仓库结构、三棵树工作流、规范提交习惯、.gitignore 与 .gitattributes、三树 diff 及 log/show/blame 审计。"
order: 40
tags: ["Git", "版本控制", "三棵树", "gitignore", "gitattributes", "diff", "blame"]
related: ["handbook/eng-zero-start", "handbook/eng-git-mastery", "handbook/cmake-targets"]
sources: []
---

## 本课解决的核心问题（ENG-09 ~ ENG-16）

学会编译单个文件后，工程里每天都会冒出更现实的麻烦：改坏了代码想退回昨天下午的版本怎么办？文件明明保存了，`git commit` 却提交了旧内容？Windows 和 Linux 队友互相拉代码时，为什么什么都没改却整页都是换行符冲突？

本课对应 **ENG-09 ~ ENG-16**，把 Git 最底层的快照思想、配置鉴权、三棵树流转、忽略与换行符规范、精确 diff 与历史追责彻底讲透。分支、合并、冲突、Rebase、后悔药与 `bisect` 进阶内容请紧接着学习[Git 进阶全书（ENG-17 ~ ENG-28）](../eng-git-mastery/)。

先修：[第 0 课：终端、Shell 与编译排错](../eng-zero-start/)，并准备下面第五节给出的 `classify.cpp` 与 `sample.log` 用于本地隔离仓库演练。

---

## 一、为什么用 Git：快照模型 vs 增量补丁 (ENG-09)

在没有版本控制时，新手常把文件夹复制成 `logscan_v1`、`logscan_v2_final`、`logscan_v2_final_fix2`——占满硬盘、分不清改了哪行、更无法多人合并。

早期集中式版本控制系统（如 CVS、SVN）把历史存成**“初始文件 + 每次改动补丁（Delta Diff）”**：每次切分支或查旧版本都要从第 1 天开始一步步拼补丁，而且断网就无法提交。

**Git 采用截然不同的分布式快照（Snapshot）模型**：

```text
传统增量模型 (SVN)：  Version 1  ──(+Δ1)──▶  Version 2  ──(+Δ2)──▶  Version 3
Git 快照模型 (Git)：   Commit 1   ────────▶   Commit 2   ────────▶   Commit 3
                       │                      │                      │
                    [树快照]               [树快照]               [树快照]
                   A  B  C               A1  B  C1             A1  B1  C1
                   (未改的 B 直接复用旧对象指针，零重复拷贝！)
```

每次 `git commit`，Git 都像按下一次相机快门，记录整个项目在那一刻的完整目录树快照；**如果某个文件没有修改，Git 只保存一个指向之前已存文件对象的指针**，既保证了“切换分支/回退版本”是瞬时 O(1) 级别，又不会浪费磁盘空间。

### 为什么 Git 被称为“内容寻址文件系统”？

Git 底层把所有数据存成 4 种不可变对象（Object），并用内容本身的 **SHA-1（或 SHA-256）校验和**作为唯一文件名：
1. **`blob`**：保存单个文件的纯粹字节内容（不含文件名）。
2. **`tree`**：保存目录结构（文件名 → 权限 → 指向 `blob` 或子 `tree` 的哈希）。
3. **`commit`**：保存指向根 `tree` 的哈希、父提交哈希（Parent）、作者、时间戳与提交说明。
4. **`tag`（附注标签）**：保存指向某个 `commit` 的永久签名/说明。

因为提交哈希由**文件内容 + 目录结构 + 父提交哈希**共同算出，只要历史上任何一个字节被偷偷篡改，从那以后所有提交的哈希都会立刻连锁失效——**历史不可篡改，断网也能在本地完整提交、查日志、开分支**。

---

## 二、`git config` 配置体系与 SSH / HTTPS 鉴权 (ENG-10)

安装完 Git 后，第一件事是配置你的身份签名和跨平台基线。Git 配置分三层，优先级**从低到高**依次覆盖：

| 层级 | 命令参数 | 配置文件位置 | 适用范围 |
| --- | --- | --- | --- |
| **系统级** | `git config --system` | Git 安装目录 `/etc/gitconfig` | 整台电脑所有用户（极少改） |
| **全局级** | `git config --global` | `~/.gitconfig` | 当前系统用户的**所有仓库**（日常主用） |
| **仓库级** | `git config --local` | 当前仓库 `.git/config` | **仅限当前仓库**（优先级最高，如公司邮箱 vs 个人邮箱） |

### 推荐的 C++ 工程首次全局配置

```bash
git config --global user.name "Your Name"
git config --global user.email "you@example.com"
git config --global init.defaultBranch main        # 统一新仓库默认分支名为 main
git config --global pull.rebase true               # pull 时默认变基，避免无意义的 Merge 提交
git config --global core.editor "code --wait"      # 指定默认编辑器（可选 vim / nano）
git config --global merge.conflictstyle zdiff3     # 冲突时同时显示共同祖先（极实用！）
```

关于换行符 `core.autocrlf`：
- **Windows**：建议 `git config --global core.autocrlf input`（若团队已配备 `.gitattributes` 统一控制）或 `true`（检出转 CRLF、入库转 LF）。
- **Linux / macOS**：建议 `git config --global core.autocrlf input`（入库时把误混入的 CRLF 自动转成 LF，检出不乱动）。
- 查所有生效配置及来源文件：`git config --list --show-origin`。

### 远程鉴权：HTTPS vs SSH

连接 GitHub / GitLab 等远程仓库时，有两种身份认证方式（**密码登录已彻底淘汰**）：

| 方式 | 远程地址格式 | 鉴权凭据 | 优缺点与推荐度 |
| --- | --- | --- | --- |
| **SSH（推荐）** | `git@github.com:user/repo.git` | 本机非对称密钥对（Ed25519） | 配置一次永久免密，不弹网页；个别严格公司内网防火墙可能屏蔽 22 端口（可走 443） |
| **HTTPS** | `https://github.com/user/repo.git` | Personal Access Token (PAT) + 凭据管理器 | 防火墙穿透好；需安装 Git Credential Manager 或 `gh auth login` 托管 Token |

生成现代高强度 **Ed25519 SSH 密钥**并测试连通性：

```bash
# 1. 生成密钥对（一路回车即可，也可设 passphrase 密码保护）
ssh-keygen -t ed25519 -C "you@example.com"

# 2. 查看公钥内容并复制整行，粘贴到 GitHub -> Settings -> SSH and GPG keys
cat ~/.ssh/id_ed25519.pub

# 3. 验证握手是否成功（看到 "You've successfully authenticated" 即成功）
ssh -T git@github.com
```

---

## 三、`git init` 与 `git clone`：揭开 `.git/` 目录的秘密 (ENG-11)

获取一个 Git 仓库只有两条路：**从零本地初始化（`git init`）** 或 **从远端完整克隆（`git clone`）**。

```bash
# 方式 A：把现有本地目录变成 Git 仓库（务必先 cd 到项目根目录）
mkdir -p ~/cpp-practice && cd ~/cpp-practice
git init -b main

# 方式 B：从远端克隆完整仓库（自动创建目录、下载全部分支与历史、设置 origin 远程别名）
git clone git@github.com:user/logscan.git

# 只要最近 1 次提交用于快速编译，不要全部历史（浅克隆，大幅省时省流量）
git clone --depth 1 https://github.com/fmtlib/fmt.git
```

### 打开 `.git/` 黑盒：仓库里到底有什么？

你在工程根目录看到的源码只是“工作区”，真正的 Git 仓库全藏在隐藏文件夹 **`.git/`** 里（删掉 `.git/`，这个目录就变回普通文件夹，所有历史瞬间蒸发）：

```text
.git/
 ├── HEAD         ← 文本指针，通常写着 "ref: refs/heads/main"（你现在站在哪个分支）
 ├── config       ← 本仓库局部配置（包括 remote "origin" 的 URL）
 ├── index        ← 二进制文件，即“暂存区 / 索引”
 ├── objects/     ← 所有 blob、tree、commit 压缩对象的仓库
 ├── refs/
 │    ├── heads/  ← 本地分支指针文件（如 refs/heads/main 里只存 40 位提交哈希）
 │    ├── remotes/← 远程跟踪分支缓存（如 refs/remotes/origin/main）
 │    └── tags/   ← 本地标签
 └── hooks/       ← 本地客户端钩子脚本示例（pre-commit 等）
```

> **1 行反例提醒**：千万不要在仓库子目录里再套娃执行一次 `git init`！在主仓库里面藏一个嵌套的 `.git/` 会导致外层仓库把内层整个文件夹识别成坏掉的“gitlink/子模块”，文件改动无法被外层正常追踪。

---

## 四、Git 的核心心智模型：三棵树 (ENG-12)

理解 Git 所有命令的钥匙，是把 Git 看成**三棵树**（参考 *Pro Git* 第 7.7 节）之间的数据流转：

```text
+-----------------------+     git add      +-----------------------+    git commit    +-----------------------+
|   Working Directory   | ---------------> |  Staging Area (Index) | ---------------> |   Repository (HEAD)   |
|   工作区（硬盘文件）   |                  |   暂存区（下次快照）   |                  |   本地历史最新快照    |
+-----------------------+                  +-----------------------+                  +-----------------------+
           ^                                          ^                                          |
           |          git diff (工作区 vs 暂存区)      |      git diff --cached (暂存区 vs HEAD)  |
           |<---------------------------------------->|<---------------------------------------->|
           |<--------------------------- git diff HEAD (工作区 vs HEAD) ------------------------->|
           |                                                                                     |
           +---- git restore <file> (丢弃工作区改动) <---- git restore --staged <file> (撤回暂存)-+
```

- **Working Directory（工作区）**：你在硬盘上能打开编辑的真实文件（相当于“草稿纸”）。
- **Staging Area / Index（暂存区）**：存放在 `.git/index` 中的清单，精确决定**下一次 `git commit` 要拍进照片的究竟是哪些文件的哪个版本**（相当于“摆上摄影台准备拍照的道具”）。
- **Repository（`HEAD` 指向的最新提交）**：已经安全写入本地 `.git/objects/` 数据库的最近一次历史快照（相当于“已冲洗入册的照片”）。

### 读懂 `git status --short` 的两列状态码

运行 `git status -s`（或 `--short`）时，每个文件前面有两个字符：**左列**对比 `HEAD → 暂存区`，**右列**对比 `暂存区 → 工作区`（下表用 `·` 标出空格）：

| 状态码 | 左列（HEAD vs 暂存） | 右列（暂存 vs 工作区） | 真实含义 |
| --- | --- | --- | --- |
| `??` | 未跟踪 | 未跟踪 | 硬盘新建了文件，从未 `git add` 过（Git 不管它） |
| `A·` | 新增（Added） | 无变动 | 首次 `git add` 进了暂存区，等待提交 |
| `·M` | 无变动 | 已修改（Modified） | 硬盘文件改过并保存了，但**还没 `git add`** |
| `M·` | 已修改 | 无变动 | 修改已经放进暂存区，随时可以 `commit` |
| **`MM`** | **已修改** | **又被修改** | **高频陷阱！** `git add` 后又改了同一个文件但没重新 `add` |
| `D·` / `·D` | 已删除 | 已删除 | 从暂存区或工作区删除 |
| `R·` | 已重命名 | 无变动 | 文件改名或移动并已暂存 |
| `UU` | 未合并 | 未合并 | 合并冲突（Both Modified），两个分支改了同一处 |

---

## 五、`git status` / `git add` / `git commit` 与优秀提交习惯 (ENG-13)

很多人习惯一路 `git add . && git commit -m "update"`，结果不仅把临时调试日志、二进制产物全塞进历史，还会把三个互不相干的改动混成一个无法拆分的巨型提交。

### 动手追踪致命陷阱：`OTHER` → `UNKNOWN` → `FALLBACK`

在独立练习目录初始化 Git 仓库，新建 `classify.cpp`（默认末尾返回 `"OTHER"`）和 `sample.log`：

<details><summary>练习用源码：classify.cpp 与 sample.log（点开直接复制）</summary>

**`classify.cpp`：**

{{example:classify.cpp}}

**`sample.log`：**

{{example:sample.log}}

</details>

```bash
git init -b main
git config --local user.name "Practice Student"
git config --local user.email "student@example.invalid"
git add -- classify.cpp
git commit -m "feat: add line classifier baseline"
```

接下来按表依次操作，**亲眼观察保存后不 `add` 就直接 `commit` 会发生什么**：

| 步骤 | 工作区 | 暂存区（Index） | HEAD | `status -s` | `git diff`（工作 vs 暂存） | `git diff --cached`（暂存 vs HEAD） |
| --- | --- | --- | --- | --- | --- | --- |
| 1. 提交原版后 | `OTHER` | `OTHER` | `OTHER` | 无输出 | 无输出 | 无输出 |
| 2. 改为 `UNKNOWN` 并保存 | `UNKNOWN` | `OTHER` | `OTHER` | `·M` | `OTHER → UNKNOWN` | 无输出 |
| 3. `git add classify.cpp` | `UNKNOWN` | `UNKNOWN` | `OTHER` | `M·` | 无输出 | `OTHER → UNKNOWN` |
| 4. 再改为 `FALLBACK` 并保存 | `FALLBACK` | `UNKNOWN` | `OTHER` | `MM` | `UNKNOWN → FALLBACK` | `OTHER → UNKNOWN` |
| 5. **不 add 直接 commit** | `FALLBACK` | `UNKNOWN` | `UNKNOWN` | `·M` | `UNKNOWN → FALLBACK` | 无输出 |

> **1 行反例提醒**：`git commit` **只读取暂存区，绝不自动读取工作区**！第 5 步写进历史的只有 `UNKNOWN`，你刚改的 `FALLBACK` 根本没入库。养成在 `commit` 前瞄一眼 `git status -s` 和 `git diff --cached` 的习惯。

### 工程级提交规范

1. **原子提交（Atomic Commit）**：一个提交只干一件独立的事（例如“修复空行计数”与“重构 CLI 参数解析”分成两个提交）。好处是将来某个功能出 Bug 时，一条 `git revert` 就能精准摘掉而不误伤其他代码。
2. **用 `git add -p` 逐块暂存（Patch Mode）**：如果你在一个文件里同时改了两个不相关的函数，用 `git add -p classify.cpp` 可以逐个代码块按 `y`（暂存）或 `n`（跳过），把混在一起的改动拆成两个干净提交！
3. **写清“改了什么 + 为什么改”**：推荐 Conventional Commits 标题格式：`<type>: <祈使句简述>`（50 字符内）：
   - `feat:` 新增功能、`fix:` 修复缺陷、`refactor:` 重构（不改行为）、`test:` 补测试、`docs:` 文档、`build:` 构建/CMake、`chore:` 杂项。
   - 正文（空一行后写）不要重复描述代码怎么写的，而要写**为什么这么改**以及**边界影响**。
4. **提交完发现漏了一个字？**：如果**还没 `push`**，补完改动后执行 `git add <file> && git commit --amend --no-edit`，就能直接并入上一次提交而不产生“fix typo”废话记录。

---

## 六、`.gitignore` 与 `.gitattributes`：守住构建边界与换行符一致 (ENG-14)

### 1. `.gitignore` 规则与误提交清理

C++ 工程绝不能把编译产物（`.exe`、`.o`、`build/`）和个人 IDE 状态（`.vscode/`、`.idea/`、`compile_commands.json`）提交进仓库——二进制每次重编都整包变化，个人路径一合并就冲突。

在仓库根目录创建 `.gitignore`：

```text
# 构建目录与编译中间产物
build/
out/
cmake-build-*/
*.o
*.obj
*.a
*.lib
*.so
*.dll
*.exe
*.out
*.pdb
*.ilk
compile_commands.json

# IDE、编辑器与操作系统垃圾文件
.idea/
.vscode/
*.swp
.DS_Store
Thumbs.db
```

常用匹配语法：`build/` 匹配名为 `build` 的目录；`*.o` 匹配任意位置的 `.o` 文件；`/TODO.txt` 只匹配根目录的 `TODO.txt`；`!important.log` 对前面被忽略的模式取反放行。

> **1 行反例提醒**：往 `.gitignore` 里补写 `build/` **不会自动取消跟踪已经提交进历史的文件**！Git 对已跟踪文件的优先级永远高于 `.gitignore`。

若已经误把 `build/` 或 `a.exe` 交进暂存区或历史，必须用 `--cached` **仅从 Git 索引移除，保留硬盘文件**：

```bash
git rm --cached classify.exe
git rm -r --cached build/
git check-ignore -v build/CMakeCache.txt   # 查验某路径到底命中了 .gitignore 哪一行
git add .gitignore
git commit -m "build: ignore build artifacts and untrack binaries"
```

### 2. `.gitattributes`：终结 CRLF vs LF 跨平台噩梦

仅靠每个人本机设 `core.autocrlf` 很容易翻车（总有队友忘配）。在仓库根目录放一份 **`.gitattributes`** 并提交入库，就能把换行符规则**强制写入仓库契约**，覆盖所有人的本地配置：

```ini
# 默认所有文本文件自动检测，并在仓库内部统一存储为 LF
* text=auto eol=lf

# C++ 源码、头文件、CMake 与脚本强制以 LF 检出和入库（防止 CRLF 破坏 Linux bash 脚本）
*.cpp text eol=lf
*.hpp text eol=lf
*.h text eol=lf
*.cmake text eol=lf
CMakeLists.txt text eol=lf
*.sh text eol=lf

# Windows 批处理和 PowerShell 脚本必须保留 CRLF 才能兼容 cmd.exe
*.bat text eol=crlf
*.ps1 text eol=crlf

# 二进制文件显式声明 binary，禁止 Git 做任何换行符转换或文本合并
*.png binary
*.zip binary
*.exe binary
*.sqlite binary
```

如果老仓库已经混入了大量 CRLF，加上 `.gitattributes` 后执行 `git add --renormalize .` 并提交，即可一次性规范化全仓换行符。

---

## 七、跨越三棵树的精确比对：`git diff` 全家桶 (ENG-15)

很多同学只会敲 `git diff`，看到没输出就以为文件没改——其实只是因为改动已经 `git add` 进了暂存区！记住这四条公式，三棵树任意两棵之间的差异全能看清：

```text
  Working Directory  ◀── git diff ──▶  Staging Area (Index)  ◀── git diff --cached ──▶  HEAD
           ▲                                                                             ▲
           └─────────────────────────── git diff HEAD ───────────────────────────────────┘
```

| 命令 | 对比的是哪两棵树？ | 典型使用场景 |
| --- | --- | --- |
| `git diff` | **工作区** vs **暂存区** | 检查“刚刚写但还没 `git add` 的改动” |
| `git diff --cached`（同 `--staged`） | **暂存区** vs **`HEAD`** | **提交前必看！** 确认马上要 `commit` 的快照到底改了啥 |
| `git diff HEAD` | **工作区** vs **`HEAD`** | 忽略暂存状态，查看“自上次提交以来本地一共改了多少” |
| `git diff <c1> <c2>` / `main..feat` | **任意两个提交/分支** | 比较两个版本或分支之间的全量差异 |

### 读懂 Unified Diff 语法与高阶选项

```diff
--- a/classify.cpp
+++ b/classify.cpp
@@ -11,5 +11,5 @@ std::string_view classify(std::string_view line) {
     if (line.starts_with("WARN ")) return "WARN";
     if (line.starts_with("ERROR ")) return "ERROR";
-    return "OTHER";
+    return "UNKNOWN";
 }
```

- `@@ -11,5 +11,5 @@`：表示旧文件（`-`）从第 11 行起共展示 5 行上下文，新文件（`+`）从第 11 行起共展示 5 行上下文；末尾还贴心地标出了所在函数名。
- 实用参数：
  - `git diff --stat`：只看每个文件增删了多少行（不展开源码，快速概览改动规模）。
  - `git diff --name-only` / `--name-status`：只列出变动的文件名与状态（`M`/`A`/`D`），非常适合写进脚本。
  - `git diff --word-diff`：按单词标出同一行里的细微修改（写文档或长字符串时一眼定位改了哪个词）。

---

## 八、历史洞察与追责三件套：`git log` / `git show` / `git blame` (ENG-16)

代码仓库是工程的“黑匣子”。当线上出现一个莫名其妙的逻辑时，高级工程师不会瞎猜，而是用历史审计命令在 30 秒内还原当年现场。

### 1. `git log`：优雅查看并检索提交历史

```bash
# 最常用的拓扑全景图：单行 + ASCII 分支树 + 分支/标签名 + 所有分支
git log --oneline --graph --decorate --all -n 20

# 查看某个文件的完整演进历史（--follow 可穿透文件重命名！）
git log -p --follow -- src/logscan_core.cpp

# 按作者、日期或提交信息筛选
git log --author="Alice" --since="2 weeks ago" --oneline
git log --grep="CRLF" --oneline

# 终极杀器（Pickaxe 考古）：找出历史上是谁新增或删除了某段代码/函数名！
git log -S "starts_with" -p            # 统计 "starts_with" 出现次数发生变化的提交
git log -G "ERROR|WARN" --oneline      # 按正则表达式搜索改动内容（diff）
```

### 2. `git show`：显微镜下看任意一次提交或文件快照

```bash
git show HEAD                          # 查看最近一次提交的元数据 + 完整 diff
git show a1b2c3d --stat                # 只看提交 a1b2c3d 改了哪些文件
git show main~2:include/prefix.hpp     # 不切换分支，直接把“2 个提交前”的某个文件内容打印出来！
```

### 3. `git blame`：逐行定位最后修改者与背景故事

`git blame` 的目的不是“甩锅”，而是**找到当时改这行代码的提交号，然后用 `git show <hash>` 看懂当年的上下文与需求背景**，防止你修掉一个“看似多余、实则绕过某个平台 Bug”的保护判断：

```bash
# 只检查第 10~25 行；-w 忽略纯空白/缩进改动；-M/-C 追踪同文件或跨文件代码搬运
git blame -L 10,25 -w -M -C classify.cpp
```

输出格式：`^a1b2c3d (Alice 2026-11-18 14:20:05 +0800 13)     return "UNKNOWN";`——拿着 `a1b2c3d` 再敲 `git show a1b2c3d`，当年的提交理由一目了然。

---

## 九、动手微练习（含参考答案）

### 练习 1：建立隔离仓库并复现 `MM` 陷阱（ENG-11 / ENG-12 / ENG-13 / ENG-15）

在临时目录初始化一个 Git 仓库，放入 `classify.cpp` 并提交基线；接着：
1. 把末尾 `"OTHER"` 改成 `"UNKNOWN"` 并 `git add classify.cpp`。
2. 不提交，再把 `"UNKNOWN"` 改成 `"FALLBACK"` 并保存。
3. 分别执行 `git status -s`、`git diff`、`git diff --cached` 和 `git diff HEAD`，写下每条输出的区别。
4. 直接执行 `git commit -m "test MM"`（不加 `-a`），再用 `git show HEAD -- classify.cpp` 检查到底提交了哪一版！

<details><summary>参考答案</summary>

1. 第 2 步后 `git status -s` 输出 **`MM classify.cpp`**。
2. `git diff`（工作区 vs 暂存区）：`- return "UNKNOWN";` `+ return "FALLBACK";`。
3. `git diff --cached`（暂存区 vs HEAD）：`- return "OTHER";` `+ return "UNKNOWN";`。
4. `git diff HEAD`（工作区 vs HEAD）：`- return "OTHER";` `+ return "FALLBACK";`。
5. 不再 `add` 直接 `git commit` 后，`git show HEAD -- classify.cpp` 证明**写入历史的只有 `"UNKNOWN"`**，`"FALLBACK"` 仍留在工作区显示为 `·M`。

</details>

### 练习 2：`.gitignore` 亡羊补牢（ENG-14）

故意编译生成一个 `classify.exe` 并用 `git add -f classify.exe` 强制提交进仓库，随后在 `.gitignore` 里加上 `*.exe`。你会发现 `classify.exe` 依然被 Git 跟踪着！用正确命令将其从仓库索引移除但**保留硬盘上的 `classify.exe`**，并用 `git check-ignore -v` 验证忽略规则生效。

<details><summary>参考命令</summary>

```bash
git rm --cached classify.exe
echo "*.exe" >> .gitignore
git check-ignore -v classify.exe       # 应输出命中 .gitignore 的对应行号
git add .gitignore
git commit -m "chore: stop tracking classify.exe and ignore executables"
ls -l classify.exe                     # 硬盘文件依然完好存在
```

</details>

### 练习 3：用 Pickaxe 与 `blame` 考古（ENG-16）

在练习仓库连续提交 3 次改动，其中第 2 次把某个函数/字符串从 `"OTHER"` 改成了 `"UNKNOWN"`，第 3 次改了缩进格式。不用肉眼翻所有提交，用一条 `git log -S` 命令直接定位到第 2 次提交，并用 `git blame -w` 验证第 3 次纯空白改动不会掩盖真正的逻辑修改者。

<details><summary>参考命令</summary>

```bash
git log -S "UNKNOWN" --oneline -p
git blame -w classify.cpp
```

</details>

---

参考：[Pro Git 中文版](https://git-scm.com/book/zh/v2)、[Git 官方文档：git-diff](https://git-scm.com/docs/git-diff)、[gitattributes 文档](https://git-scm.com/docs/gitattributes)。下一篇：[Git 进阶全书：分支 internals、合并冲突、Rebase、后悔药与团队协作（ENG-17 ~ ENG-28）](../eng-git-mastery/)。
