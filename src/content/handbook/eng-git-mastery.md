---
title: "Git 进阶全书：分支原理、合并冲突、Rebase、后悔药与团队协作"
description: "系统掌握 Git 分支与 HEAD 指针底层原理、switch/branch 规范、Fast-forward 与三路合并、冲突裁决、Rebase 与交互式整理、stash 与 worktree、restore/reset/revert/reflog 急救、cherry-pick 与 bisect、远程 PR 工作流及语义化标签与钩子。"
order: 40
category: "工程工具链"
tags: ["Git", "分支原理", "merge", "rebase", "reflog", "bisect", "worktree", "Pull Request"]
related: ["handbook/command-line-git", "handbook/cmake-targets", "handbook/cli-testing"]
sources: []
---

## 本书覆盖的核心工程能力（ENG-17 ~ ENG-28）

学会了单个分支上的 `add` 和 `commit`，还只能算“会用 Git 当高级网盘”。真正进入多人协作或复杂项目开发后，你会立刻遭遇真正的工程难题：

- 分支到底是什么？为什么切换分支只需要零点几秒？（**ENG-17**）
- 团队协作时分支怎么建、怎么命名才不会乱？（**ENG-18**）
- 什么时候会直接 Fast-forward，什么时候会产生合并提交？（**ENG-19**）
- 遇到 `<<<<<<< HEAD` 冲突标红，怎么做到改完不留隐患？（**ENG-20**）
- `git rebase` 到底在干嘛？为什么老工程师严禁对公共分支 rebase？（**ENG-21**）
- 本地写了 8 个凌乱的 `"wip"` 小提交，发 PR 前如何整理成 2 个优雅提交？（**ENG-22**）
- 代码写到一半要修紧急 Bug，如何不破坏当前 CMake 构建缓存？（**ENG-23**）
- 敲错命令想反悔，什么时候用 `restore`、`reset`、`revert`？（**ENG-24**）
- 误敲 `git reset --hard` 或删错了分支，如何从死神手里抢回代码？（**ENG-25**）
- 200 个提交里不知哪一次引入了崩溃，如何用二分法 8 步抓出凶手？（**ENG-26**）
- `fetch`、`pull --rebase`、`--force-with-lease` 与规范 PR 流程怎么跑？（**ENG-27**）
- 如何打语义化发布标签、自动拦截未格式化代码、理解子模块边界？（**ENG-28**）

先修：[Git 核心基础（ENG-09 ~ ENG-16）](../command-line-git/)。建议在临时目录里跟着每一节敲命令实操。

---

## 一、分支与 `HEAD` 指针的底层原理 (ENG-17)

很多教程喜欢把 Git 分支画成“从树干上长出的一根很粗的树枝”，仿佛建分支需要把整个项目拷贝一份。**完全错误！** 在 Git 眼里，分支根本不是目录拷贝，它只是**一个 41 字节的小文本文件**（40 个十六进制字符的提交哈希 + 1 个换行符）！

打开你仓库里的 `.git/` 一看便知：

```text
历史提交有向无环图（DAG）：
  [C1] ◀─── [C2] ◀─── [C3] ◀─── [C4]
                        ▲         ▲
        refs/heads/feat ┘         └─ refs/heads/main
                                         ▲
                                        HEAD  ("ref: refs/heads/main")
```

- **每个提交（Commit）** 内部保存着指向**父提交（Parent）**的指针，因此整个仓库历史构成一张**有向无环图（DAG）**。
- **分支指针（`refs/heads/<name>`）** 是一个可移动的便利贴，永远贴在某条开发线最新的那个提交上。新建分支只需要写一个 41 字节的文件，O(1) 瞬间完成！
- **`HEAD` 指针（`.git/HEAD`）** 代表“**你当前正在哪个分支或哪个提交上工作**”：
  - **正常附着状态（Attached）**：`.git/HEAD` 内容是符号引用 `ref: refs/heads/main`。当你执行 `git commit` 时，Git 先创建新提交 `C5`，再把 `HEAD` 指向的 `main` 指针自动往前挪到 `C5`。
  - **游离指针状态（Detached HEAD）**：当你直接检出某个历史哈希（`git switch --detach C2`）或标签时，`.git/HEAD` 直接写死成 `C2` 的 40 位哈希，不再指向任何分支名！

> **1 行反例提醒**：在 **Detached HEAD** 状态下继续 `git commit` 也能成功，但一旦你切回 `main`，这些新提交没有任何分支名指着它们，随时可能变成“孤儿提交”被后台垃圾回收！如果真在游离状态写了有用代码，立刻用 `git switch -c rescue-branch` 给它绑个分支名。

### 祖先相对引用语法：`~` 与 `^`

不用每次都复制 40 位哈希，Git 支持从任意引用向后推算：
- `HEAD~1`（简写 `HEAD~`）：当前提交的父提交；`HEAD~3` 则是往前推 3 代的祖先。
- `M^1` / `M^2`：当 `M` 是一个合并提交（有多个父提交）时，`^1` 表示合并时所在的当前分支父节点，`^2` 表示被合并进来的分支父节点。

---

## 二、`git switch` / `git branch` 与分支命名规范 (ENG-18)

过去 Git 把“切换分支”和“丢弃文件改动”全塞进了 `git checkout` 一个命令里，新手极易误操作把修改全抹掉。从 Git 2.23 起，官方拆出了语义清晰的 **`git switch`**（专门管分支）和 **`git restore`**（专门管文件）。

```bash
# 创建并立刻切换到新分支（等价于老命令 git checkout -b）
git switch -c feat/cli-json-output

# 从某个特定历史提交或标签切出分支
git switch -c fix/empty-file v1.0.0

# 在最近两个分支之间快速来回跳（类似 cd -）
git switch -

# 查看分支清单：-v 看最新提交，-vv 同时看本地分支跟踪了哪个远程分支，-a 看含远程全部分支
git branch -vv
git branch -a

# 重命名当前分支
git branch -m feat/better-name

# 删除已合并完成的分支（安全检查：若还有未合并提交会拒绝删除）
git branch -d feat/cli-json-output

# 强制删除确定废弃的实验分支（即使未合并）
git branch -D exp/dead-idea
```

### 团队工程分支命名规范

永远不要起 `test`、`mybranch`、`fix123` 这种三天后连自己都看不懂的分支名。推荐统一采用 **`<类型>/<简短小写短横线描述>`**（或附带 Issue 编号）：

| 前缀 | 用途 | 示例 |
| --- | --- | --- |
| `main` | 永远保持可构建、可测试通过的集成分支 | `main` |
| `feat/` | 新增业务功能或新命令选项 | `feat/v1-multi-file-summary` |
| `fix/` | 修复普通缺陷 | `fix/crlf-trailing-space` |
| `hotfix/` | 线上紧急故障热修（常直接从发布 Tag 切出） | `hotfix/null-deref-v1.0.1` |
| `refactor/` | 重构内部结构但不改变外部契约 | `refactor/split-parser-header` |
| `docs/` / `chore/` | 文档、构建脚本、CI 配置调整 | `chore/ci-ubuntu-24` |

---

## 三、`git merge`：快进合并 vs 三路合并 (ENG-19)

当特性分支测试通过，要合回 `main` 时，`git merge` 会根据两边的历史拓扑走两条完全不同的路径：

### 情况 A：Fast-forward（快进合并）

如果你切出 `feat` 之后，`main` 分支**没有任何别人提交过新内容**，那么 `main` 就是 `feat` 的直接祖先：

```text
合并前：
  C1 ─── C2 (main) ─── C3 ─── C4 (feat)

在 main 上执行 git merge feat 后（没有新提交，main 指针直接向前快进）：
  C1 ─── C2 ─── C3 ─── C4 (main, feat)
```

- **优点**：历史干干净净一条直线，零多余合并节点。
- **如果想强行留下一条合并记录**（保留曾经开过特性分支的痕迹），可以传 `git merge --no-ff feat`，Git 会强制生成一个合并提交。
- **如果你只想允许快进，绝不自动产生合并节点**：用 `git merge --ff-only feat`（若分叉了会直接报错退出，非常适合 `git pull --ff-only`）。

### 情况 B：3-Way Merge（三路合并）

如果 `feat` 开发期间，队友也往 `main` 合进了新提交 `C5`，两条线已经**分叉（Diverged）**：

```text
合并前（Merge Base = C2）：
            ┌─── C3 ─── C4 (feat)
  C1 ─── C2 ┤
            └─── C5 (main)

在 main 上执行 git merge feat 后（生成拥有两个父节点的 Merge Commit M）：
            ┌─── C3 ─── C4 (feat) ─┐
  C1 ─── C2 ┤                      ▼
            └─── C5 ────────────── M (main)
```

Git 会自动向上寻找两者的**最近共同祖先（Merge Base，即 `C2`，可用 `git merge-base main feat` 查出）**，然后把 **`C2 → C4`** 与 **`C2 → C5`** 两份差异合并到一起，生成一个拥有两个父提交（`C5` 和 `C4`）的合并提交 `M`。

只要两边的改动不在同一文件的同一区域，Git 就能全自动完成三路合并！

---

## 四、手把手解决合并冲突（Merge Conflict）(ENG-20)

如果 `main` 和 `feat` **同时修改了同一个文件的同一行（或紧邻行）**，Git 拒绝猜测谁对谁错，会暂停合并并把裁决权交给你：

```text
Auto-merging src/classify.cpp
CONFLICT (content): Merge conflict in src/classify.cpp
Automatic merge failed; fix conflicts and then commit the result.
```

### 6 步零失误解冲突流程

1. **先用 `git status -s` 列出所有冲突文件**：凡是标记为 **`UU`**（Both Modified）的文件都需要手工处理。万一此刻吓慌了想反悔退回合并前状态，随时敲一句 **`git merge --abort`** 即可原封不动撤销！
2. **打开冲突文件，看懂冲突分隔符**（强烈建议配过 `git config --global merge.conflictstyle zdiff3`）：

```cpp
    if (line.starts_with("INFO ")) {
<<<<<<< HEAD
        return "LOG_INFO";
||||||| merged common ancestors
        return "INFO";
=======
        return "NOTICE";
>>>>>>> feat/notice-label
    }
```

- `<<<<<<< HEAD` 到 `|||||||`：当前所在分支（`main`）改成的版本。
- `|||||||` 到 `=======`（启用 `zdiff3` 才有）：**分叉前共同祖先原本的样子**——对照它你瞬间就能看懂双方各自改了什么意图！
- `=======` 到 `>>>>>>> feat/notice-label`：被合并分支改成的版本。

3. **结合业务意图人工裁决**：可能是留左边、留右边，也可能是**把两边逻辑融合**。改完后**彻底删掉所有 `<<<<<<<`、`|||||||`、`=======`、`>>>>>>>` 标记行**。
4. **必须重新编译并跑全量测试！**：这是解冲突最容易酿成生产事故的环节——哪怕括号没漏、编译过了，两段逻辑拼在一起也完全可能出错！

```bash
cmake --build build && ctest --test-dir build --output-on-failure
```

5. **暂存标记为已解决**：`git add src/classify.cpp`（告诉 Git 冲突已裁决完毕）。
6. **完成合并提交**：直接敲 `git commit`（Git 会自动生成 `Merge branch 'feat/notice-label'` 提交信息，确认保存退出即可）。

---

## 五、`git rebase`：线性历史心智模型与黄金法则 (ENG-21)

很多人怕用 `git rebase`（变基），觉得它是黑魔法。其实它的原理只有一句话：**“把我在旧基座上写的一串提交，逐个摘下来，重新按顺序搬到新基座的顶端。”**

```text
Rebase 前：
            ┌─── C3 ─── C4 (feat)
  C1 ─── C2 ┤
            └─── C5 (main)

在 feat 上执行 git rebase main 后：
  C1 ─── C2 ─── C5 (main) ─── C3' ─── C4' (feat)
```

看清细节：**`C3'` 和 `C4'` 虽然代码改动一模一样，但因为父提交变成了 `C5`，它们的 SHA-1 提交哈希是全新的！** 原本的 `C3` 和 `C4` 从 `feat` 历史线上消失了。

- **何时用 `merge`**：当你把特性分支合回 `main`、或从公开分支拉取多人协作代码想忠实保留时间交织拓扑时。
- **何时用 `rebase`**：当你在自己的本地特性分支开发了一半，`main` 已经往前推进了好几个版本，你想让自己的分支提前吃上 `main` 的最新代码，同时**保持一条干净笔直的历史**（不产生一堆无意义的 `"Merge branch 'main' into feat"` 噪音）。

> **Rebase 黄金法则（Golden Rule）**：**永远不要对已经 `git push` 到公共/共享分支（如 `main` 或多人共用的 `dev`）的提交执行 `git rebase`！**
> 原因：一旦你改写了公共提交的哈希，队友电脑上还留着旧的 `C3/C4`，下次拉代码就会出现重复提交甚至彻底撕裂历史。**只对你自己的私有分支执行 rebase**。

### 高阶剪枝：`git rebase --onto`

假设你本来基于 `feat-A` 切出了 `feat-B`，后来发现 `feat-B` 其实不依赖 `feat-A`，只想把 `feat-B` 独有的提交直接嫁接到 `main` 上：

```bash
# 语义：把“从 feat-A 分叉之后到 feat-B 为止”的提交，嫁接到 main 之上
git rebase --onto main feat-A feat-B
```

---

## 六、交互式变基 `git rebase -i`：发 PR 前的历史美容术 (ENG-22)

写代码时你经常会提交 `"wip"`、`"fix typo"`、`"忘了加头文件"` 这类过程垃圾。直接在 PR 里贴 10 个这种提交会让 Code Reviewer 极其痛苦。发 PR 前，用 **`git rebase -i`（Interactive Rebase）** 把最近 N 个未推送提交整理成大师级作品：

```bash
# 整理最近 4 个提交（也可以写 git rebase -i main，整理当前分支相对 main 的所有提交）
git rebase -i HEAD~4
```

编辑器会弹出待办清单（注意：**从上到下是从旧到新**）：

```text
pick 1a2b3c4 feat: add JSON formatter skeleton
pick 5d6e7f8 wip: handle escaping
pick 9a0b1c2 fix typo in header guard
pick 3e4f5a6 test: add JSON escaping unit tests
```

把每行开头的 `pick` 改成下列指令之一，保存关闭即可：

| 指令 | 简写 | 作用 |
| --- | --- | --- |
| `pick` | `p` | 保留该提交原样 |
| `reword` | `r` | 保留代码改动，但停下来让你**修改提交信息** |
| `edit` | `e` | 停在该提交，让你**补充/拆分代码改动**，改完再 `git rebase --continue` |
| `squash` | `s` | 把该提交**合并进前一个提交**，并把两者的提交信息拼在一起让你编辑 |
| `fixup` | `f` | 把该提交**静默融进前一个提交**，直接丢弃这个临时提交的垃圾信息（最常用！） |
| `drop` | `d` | 彻底删除这个提交（如临时调试打印提交） |

把上面清单改成：

```text
pick   1a2b3c4 feat: add JSON formatter skeleton
fixup  5d6e7f8 wip: handle escaping
fixup  9a0b1c2 fix typo in header guard
pick   3e4f5a6 test: add JSON escaping unit tests
```

保存后，原本 4 个乱糟糟的提交就瞬间浓缩成了 2 个清爽的原子提交：`feat` 和 `test`！如果过程中遇到冲突或不想改了，随时 **`git rebase --abort`** 一键还原。

---

## 七、双线救火神器：`git stash` 与 `git worktree` (ENG-23)

场景：你正在 `feat/parser` 上改了 5 个文件还没写完（编译都过不了，不想随便 commit），突然线上 `main` 报了个十万火急的 Bug 要你立刻切过去修！你有两种武器：

### 武器 1：`git stash`（暂存栈——适合轻量、短暂切换）

```bash
# 1. 把工作区 + 暂存区 + 未跟踪的新文件(-u) 一起压进临时栈，并写备注(-m)
git stash push -u -m "wip: unfinished parser refactor"

# 2. 此时工作区彻底干净！切去 main 修完 Bug 并提交
git switch main
# ... 修复并提交 ...

# 3. 切回 feat/parser，查看栈列表并弹出恢复现场
git switch feat/parser
git stash list
git stash pop          # 恢复栈顶改动并从栈中删除（git stash apply 则保留栈备份）
```

### 武器 2：`git worktree`（多工作树——C++ 工程救命神技！）

对大型 C++ 项目来说，`git switch` 来回切分支有个极其痛苦的副作用：**头文件改动会导致时间戳全变，CMake + Ninja 动辄触发几分钟的全量重新编译！**

用 **`git worktree`**，你可以在**不重新克隆仓库、共享同一个 `.git` 对象库**的前提下，直接在旁边文件夹同时检出第二个分支，各自拥有独立的 `build/` 目录：

```bash
# 在当前仓库目录执行：把 main 分支同时检出到上一级的 logscan-hotfix 文件夹
git worktree add ../logscan-hotfix main

# 列出当前所有挂载的工作树
git worktree list

# 修完紧急 Bug 并推送后，回到主目录清理掉临时工作树
git worktree remove ../logscan-hotfix
```

从此左边窗口编译着 10 分钟的 `feat/`，右边窗口在 `../logscan-hotfix` 秒级构建并测试 `main`，互不干扰、不丢一行缓存！注意：Git 禁止两个 worktree 同时检出**同一个**分支名（防止状态冲突）。

---

## 八、后悔药全图鉴：`restore` / `reset` / `revert` (ENG-24)

干工程不怕改错，关键是**按破坏半径选对撤销工具**。记住一条铁律：**本地未推送的提交可用 `reset`；已经 `push` 给队友的公开提交，只能用 `revert`！**

| 你的处境 | 正确命令 | 影响哪几棵树？ | 是否改写历史？ |
| --- | --- | --- | --- |
| 工作区改乱了，想丢弃未暂存修改 | `git restore <file>` | 仅工作区（**未暂存改动永久丢失！**） | 否 |
| 手滑 `git add` 了不该提交的文件 | `git restore --staged <file>` | 仅暂存区（工作区代码安全保留） | 否 |
| 刚 commit 就想改写或重排最后 1 次提交 | `git reset --soft HEAD~1` | **仅移动 `HEAD`**（代码仍留在暂存区） | 是（仅限未 push） |
| 撤销提交并撤出暂存，回工作区继续改 | `git reset --mixed HEAD~1`（默认） | `HEAD` + 暂存区（工作区代码保留） | 是（仅限未 push） |
| 彻底作废最后 1 次本地提交与一切改动 | `git reset --hard HEAD~1` | **三棵树全重置**（高危！） | 是（仅限未 push） |
| **已经 `git push` 的提交写错了** | **`git revert <hash>`** | **新增一条反向提交**抵消旧改动 | **否！团队协作安全** |

### `git revert` 撤销合并提交的小心机

如果要撤销一个普通的单父提交，直接 `git revert a1b2c3d` 即可。但如果要撤销一个**合并提交 `M`**，由于它有两个父节点，必须用 `-m 1` 明确告诉 Git“以 `main` 主线（第 1 个父节点）为准撤销进来的那条分支”：

```bash
git revert -m 1 <merge_commit_hash>
```

---

## 九、终极抢救：`git reflog` 找回“已丢失”的提交 (ENG-25)

假设你不小心敲了高危的 **`git reset --hard HEAD~2`**，或者手滑 **`git branch -D feat/hard-work`** 把整条还没合并的分支删掉了——代码是不是彻底没了？

**只要那些改动曾经 `git commit` 过，就几乎都能救回来！**

因为你的分支指针虽然挪走了，但那些提交对象依然静静躺在 `.git/objects/` 里（Git 默认会保留至少 30 天才运行垃圾回收 `gc`），并且 Git 一直在本地悄悄记着一本账——**`git reflog`**（引用日志，记录本机 `HEAD` 每一次移动的轨迹）：

```bash
# 1. 惨剧发生：误把最近 2 个提交硬重置抹掉了
git reset --hard HEAD~2

# 2. 打开 HEAD 移动黑匣子日志
git reflog -n 10
# 输出示例：
# 4e5f6a7 (HEAD -> main) HEAD@{0}: reset: moving to HEAD~2
# e4f5a6b HEAD@{1}: commit: feat: add SQLite rollback guard   ← 它还活着！
# 9c8d7e6 HEAD@{2}: commit: refactor: extract connection pool

# 3. 两种方式无损复活：
git switch -c rescue-work e4f5a6b    # 方案 A：在丢失哈希上建个抢救分支先检查（最稳妥！）
# 或
git reset --hard e4f5a6b             # 方案 B：直接把 main 指针重置回 e4f5a6b
```

**唯一救不回来的东西**：从未 `git commit`（甚至从未 `git add`）的纯工作区本地修改，如果被 `git restore` 或 `git reset --hard` 覆盖了，Git 没有为它们建过对象快照，也就无法通过 `reflog` 找回。所以**写完阶段性代码勤 `commit`**，就是最好的保险。

---

## 十、精准移植与二分抓虫：`cherry-pick` 与 `git bisect` (ENG-26)

### 1. `git cherry-pick`：跨分支摘取单个救命提交

假设团队在 `feat/v2` 分支顺手修了一个崩溃 Bug（提交哈希 `7b8c9d0`），`feat/v2` 还要下周才能整体上线，但线上稳定分支 `main` 今天就急需这一个 Bug 修复：

```bash
git switch main
git cherry-pick -x 7b8c9d0    # 把 7b8c9d0 的改动复制成一个新提交放到 main；-x 会在说明里自动注明来源哈希
```

### 2. `git bisect`：用二分法 7 步抓出 100 个提交里的罪魁

昨天还能跑通的测试，今天一口气合进了 128 个提交后突然挂了——千万别一个个肉眼翻！**`git bisect` 用二分查找（$\log_2 128 = 7$ 步）就能精准命中第一个把代码改坏的提交（First Bad Commit）**：

```bash
# 手动交互式二分
git bisect start
git bisect bad                    # 当前 HEAD 是坏的
git bisect good v1.0.0            # 历史上确定正常的标签或哈希

# Git 会自动切到正中间的提交；你编译并运行测试：
cmake --build build && ctest --test-dir build --output-on-failure
# 如果这次测试过了就敲：git bisect good
# 如果复现了 Bug 就敲：git bisect bad
# 遇到某个提交根本编译不过、无法判断该 Bug？敲：git bisect skip

# 几轮后 Git 打印：<hash> is the first bad commit
# ⚠️ 排错结束务必退出 bisect 模式，回到原本的 HEAD！
git bisect reset
```

更爽的是**全自动无人值守二分**（`git bisect run`）：只要你写一条命令或脚本（返回 **`0`** 表示 good，返回 **`1..124` / `126..127`** 表示 bad，返回 **`125`** 表示编译失败跳过该提交），Git 会全自动跑完所有步骤直接把凶手打印在你面前：

```bash
git bisect start HEAD v1.0.0
git bisect run sh -c 'g++ -std=c++20 classify.cpp -o /tmp/c || exit 125; echo "ERROR:" | /tmp/c | grep -qx "OTHER"'
git bisect reset
```

---

## 十一、远程协作、`fetch`/`pull --rebase` 与 Pull Request 工作流 (ENG-27)

理解远程仓库的关键，是区分**本地分支 `main`** 与**远程跟踪分支 `origin/main`**：`origin/main` 只是你电脑上的一份“上次和远程服务器通信时拍下来的远程 `main` 只读快照”。

| 命令 | 动作本质 | 安全习惯 |
| --- | --- | --- |
| `git fetch origin` | 只把远程最新提交下载更新到 `origin/*`，**绝不动你的工作区和本地分支** | **最安全！** 先 `fetch` 再 `git diff main origin/main` 看清别人改了什么 |
| `git pull --rebase origin main` | 等价于 `git fetch` + `git rebase origin/main` | 保持本地提交走在最新远程之上，不产生垃圾 Merge 提交 |
| `git pull --ff-only` | 等价于 `git fetch` + 只允许快进合并 | 如果本地和远程都各自提交了（分叉），直接报错提醒你决定怎么合 |
| `git push -u origin feat/xxx` | 首次推送本地分支到远端并建立跟踪关联 | 之后同一分支只需敲 `git push` |
| `git push --force-with-lease` | **当你对自己的 PR 分支做了 `rebase -i` 后强推更新 PR** | **绝不用裸 `--force`！** `--force-with-lease` 会先核对远端没被别人偷推过新代码，防误覆盖队友工作 |

### 工业界标准 Pull Request（PR）协作闭环

1. **同步主干**：`git switch main && git pull --ff-only`
2. **切出特性分支**：`git switch -c feat/my-feature`
3. **本地开发 + 原子提交 + 跑通 CTest/Sanitizer**
4. **同步最新主干并整理历史**：`git fetch origin && git rebase origin/main`（必要时 `rebase -i` 清理 `"wip"`）
5. **推送并提 PR**：`git push -u origin feat/my-feature` → 在 GitHub 创建 Pull Request，写清改动动机、测试命令和实测输出。
6. **响应 Review 修改并更新 PR**：继续补充提交（或 `fixup` 后 `git push --force-with-lease`），等待 CI 全绿 + 团队 Approve → **Squash & Merge**（或 Rebase Merge）合入 `main` → 删除已合入的远端与本地特性分支。

---

## 十二、语义化标签（Tag）、Hooks 钩子与 Submodule 概览 (ENG-28)

### 1. 语义化版本标签（`git tag` + SemVer）

当软件要对外发布一个稳定里程碑时，光靠随机哈希太难记，应使用**语义化版本号（SemVer：`vMAJOR.MINOR.PATCH`）**：
- **MAJOR（主版本）**：不兼容的 API / CLI 契约破坏性变更（如 `v2.0.0`）。
- **MINOR（次版本）**：向后兼容的新增功能（如 `v1.1.0`）。
- **PATCH（修订号）**：向后兼容的 Bug 修复（如 `v1.0.1`）。

Git 标签分两种：**轻量标签**（只是一个不会动的分支便利贴）和工程推荐的**附注标签（Annotated Tag，`-a`，作为完整对象记录打包者、时间、发行说明与可选 GPG 签名）**：

```bash
git tag -a v1.0.0 -m "Release LogScan v1.0.0: multi-file aggregation"
git push origin v1.0.0          # ⚠️ 默认 git push 不会推送 tag，必须显式指定 tag 名或 --tags
git describe --tags --always    # 自动生成人类可读版本串，如 v1.0.0-4-g8a1b2c3（常写入 CMake 版本号）
```

### 2. Git Hooks（客户端自动门卫）

每个仓库的 `.git/hooks/` 下都有一批钩子脚本。最常用的是 **`pre-commit`**（在 `git commit` 真正落盘前自动运行）：只要脚本退出非 `0`，本次提交就会被拦截！

例如新建 `.git/hooks/pre-commit` 并 `chmod +x`（Linux/macOS），防止把未格式化或明显编译不过的代码交进仓库：

```bash
#!/bin/sh
# 提交前自动检查暂存区是否有残余冲突标记（<<<<<<<）
if git diff --cached --check; then
  exit 0
else
  echo "提交被拦截：存在空白错误或未清理的冲突标记！"
  exit 1
fi
```

### 3. Git Submodule（子模块）速览与 C++ 取舍

`git submodule add <url> third_party/fmt` 允许在一个 Git 仓库里嵌套另一个外部 Git 仓库（主仓库只记录子模块精确的 Commit Hash）。

- 克隆带子模块的仓库必须加递归参数：`git clone --recursive <url>`（或事后执行 `git submodule update --init --recursive`）。
- **C++ 工程真实建议**：`git submodule` 切换分支时经常忘记同步子模块指针，对新手极易踩坑。现代 C++ 工程更推荐优先用 **CMake `FetchContent`** 或包管理器（`vcpkg` / `Conan` / 系统 `find_package`），把依赖管理统一收口进构建系统（下一章 ENG-37 / ENG-38 详讲）。

---

## 十三、实战总演练（含参考答案）

### 演练 1：完整走通“分支冲突 + `zdiff3` 裁决 + `rebase -i` 整理”（ENG-18 ~ ENG-22）

1. 在临时 Git 仓库 `main` 上提交一版 `classify.cpp`；切出 `feat/label` 分支连续做 3 个提交（第 1 个改 `"INFO "` 返回 `"NOTICE"`，第 2 个故意写 `"wip typo"`，第 3 个补注释）。
2. 先切回 `main`，把同一行 `"INFO "` 改成 `"LOG_INFO"` 并提交。
3. 切回 `feat/label`，用 `git rebase -i main` 把那 3 个提交压成 1 个干净提交，并在过程中按 `zdiff3` 冲突提示解决与 `main` 的冲突（最终采纳 `"NOTICE"`）。

<details><summary>参考命令步骤</summary>

```bash
git config --local merge.conflictstyle zdiff3
git switch feat/label
git rebase -i main
# 在编辑器里把第 1 个设为 pick，第 2、3 个改为 fixup，保存关闭
# 触发冲突后编辑 classify.cpp 保留 return "NOTICE"; 并删光冲突标记
g++ -std=c++20 classify.cpp -o /tmp/c && echo "INFO ok" | /tmp/c
git add classify.cpp
git rebase --continue
git log --oneline --graph --all
```

最终历史应呈现为一条完美的直线，`feat/label` 领先 `main` 恰好 1 个干净提交。

</details>

### 演练 2：故意 `reset --hard` 销毁提交并用 `reflog` 救回（ENG-24 / ENG-25）

在练习分支故意执行 `git reset --hard HEAD~1` 抹掉刚做的提交，用 `git reflog` 找到消失前的提交哈希并建 `rescue` 分支无损恢复。

<details><summary>参考命令</summary>

```bash
git reset --hard HEAD~1
git reflog -5
# 找到 reset 前一条记录的哈希，例如 HEAD@{1}
git switch -c rescue HEAD@{1}
```

</details>

### 演练 3：用 `git bisect run` 自动抓虫（ENG-26）

在一个临时仓库连续构造 8 个提交，第 5 个提交把 `"ERROR "` 误改成了 `"ERROR"`（导致 `"ERROR:"` 被误判为 `ERROR` 而不是 `OTHER`）。写一条 `git bisect run` 命令全自动揪出第 5 个提交并安全退出 bisect 模式。

<details><summary>参考命令</summary>

```bash
git bisect start HEAD <第1个正常提交哈希>
git bisect run sh -c 'g++ -std=c++20 classify.cpp -o /tmp/c || exit 125; test "$(echo "ERROR:" | /tmp/c)" = "OTHER"'
git bisect reset
```

</details>

---

参考：[Pro Git 中文版 第 3 章（分支）与第 7 章（高级工具）](https://git-scm.com/book/zh/v2)、[Git 官方文档：git-rebase](https://git-scm.com/docs/git-rebase)、[git-worktree](https://git-scm.com/docs/git-worktree)、[Semantic Versioning 2.0.0](https://semver.org/lang/zh-CN/)。下一篇：[现代 CMake 目标化工程体系（ENG-29 ~ ENG-38）](../cmake-targets/)。
