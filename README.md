# C++ 研习手册

供个人在 Windows 本地使用的中文 C++ 手册、实验室与学习记录。起步围绕一条主线：从终端和 CLion 构建、调试开始，学会判断对象和借用何时有效，用 RAII 管理资源，最后独立交付一个 LogScan 命令行工具。

[完整分级课程大纲](docs/course-outline.md) · [后续课程建设顺序](docs/course-release-plan.md)

## 运行

装好 [Node.js 24 LTS](https://nodejs.org/en/download/)。网站本身不需要编译器、WSL、服务器账号或 AI API Key。打开 PowerShell：

```powershell
Set-Location -LiteralPath 'D:\Summary_of_Notes\Study_Site'
node --version
npm.cmd ci
npm.cmd run dev
```

第一次下载依赖需要联网。以后直接运行 `npm.cmd run dev`，打开 [127.0.0.1:4321](http://127.0.0.1:4321/)。使用同一个日常浏览器、用户配置和地址。终端保持打开；结束时在终端按 **Ctrl+C**。如果提示 4321 已被占用，先检查这个地址是否已经打开本站，或停止自己之前启动的实例。不要随意更换主机名或端口，浏览器会把它视为另一套数据。

更新课程 Markdown 时，开发服务通常会自动刷新；增删文件、改配置后如未更新，停止再启动。后续用 Git 更新源代码前先导出备份；拉取自己的仓库并运行 `npm.cmd ci`，然后重启。也可用 `npm.cmd run build` 生成 `dist/`；停掉开发服务再运行 `npm.cmd run preview`，用相同端口预览静态版本。

## 第一天

1. 打开 [第一课](http://127.0.0.1:4321/handbook/toolchain/)。下载 `hello.cpp`，猜输出，用现有工具链构建并运行。
2. 做一次编译错误和一次链接错误。再用 CLion 手动设断点，故意改错前缀，单步检查变量，修正后再运行。今天先掌握判断方法，不要求先会 GDB 命令行。
3. 在章末保存输出、变量值和故障原因。接着沿左栏“现在可学”，自己写小程序，完成对象生命周期与 RAII 的练习，再做 LogScan v0。做完 v0 可以从 [CMake 拆分](http://127.0.0.1:4321/handbook/cmake-targets/)进入 [LogScan v0.1](http://127.0.0.1:4321/labs/logscan-build/)。遇到卡点先保存“练过”和待复习标记。
4. 本机如有 `private/first-profile.json`，在 **学习记录 → 学习档案 → 载入档案草稿** 选择文件，检查后保存。草稿只填档案，不会更改练习。每周试排 10–14 个专注小时，首周按真实投入和完成证据校准。

C++ 练习需要支持 C++20 的工具链：可继续使用 CLion 自带的 MinGW 和调试器，或按首课选择 MSVC。若终端找不到 `g++`，用 CLion 直接配置 CMake 项目，或按工具链说明让当前终端找到编译器。进入 Linux 系统课后再准备 WSL：按 [Microsoft 安装指南](https://learn.microsoft.com/windows/wsl/install/) 在管理员 PowerShell 中运行 `wsl --install`；按提示重启与初始化 Ubuntu，在 Ubuntu 终端执行 `sudo apt update`、`sudo apt install build-essential gdb cmake git`。Windows 与 WSL 各用各的构建目录。

## 数据、笔记与复盘

- **私人笔记：**在 **学习记录 → 笔记与博客 → 我的私人笔记** 导入 UTF-8 Markdown，填标签并关联课程或实验。保留原件文件名与文本；不改写源文件。相同正文会提示已导入。原件建议放在 `private/notes/`，并单独备份。浏览器副本最多 40 篇，每篇 24,000 字符，整份数据上限 1.25 MB。预览不加载笔记中的远程图片。
- **进度与迁移：**数据保存在浏览器当前配置文件内，属于 `http://127.0.0.1:4321`，用 `cpp-study.state.v1` 作为 localStorage 主键。刷新、关闭浏览器或重启站点都会保留。换配置、端口或电脑前，在 **学习记录 → 备份与恢复** 导出 JSON；在新浏览器打开本站，选择备份，核对条数后确认替换。误替换可预览并恢复上一份快照。原始 Markdown 和下载的备份仍需另存，主题设置不在备份中。
- **向 AI 复盘：**学习记录里勾选要分析的练习和卡点，可选包含档案，生成 Markdown 后检查、编辑再复制。私人笔记正文不自动加入材料。把建议和依据写回档案的“本周任务”“计划和调整依据”。当前没有模型请求、账户或计费；可选导师设计见 [架构说明](docs/architecture.md)。

## 更新内容

| 位置 | 用途 |
| --- | --- |
| `src/content/handbook/` | 已发布课程 Markdown |
| `src/content/labs/` | 已发布的实验与折叠提示 |
| `src/content/notes/` | 经过主动整理、同意公开的文章 |
| `src/data/curriculum.mjs` | 完整知识地图、先修、验收、路线和后续实验 |
| `public/examples/` | 公开的示例源码及合成输入 |
| `private/` | 本地档案草稿、私人笔记原件及练习目录，Git 忽略 |

添加一篇与现有文件相似的 Markdown，文件名用小写字母、数字和短横线。必填 `title`、`description`；可加 `order`、`minutes`、`tags`、`related`、`category`、`series`、`sources`。例如关联填 `handbook/lifetime`、`labs/logscan`；右栏会从二、三级标题生成，全站索引自动包含新文章。在知识地图对应条目填该文件的 `id`（实验可用 `ref`）后，左栏、首页进度和上下篇按地图顺序收录；未写正文的条目只留在课程大纲。已发布的文件名尽量不改，它也是本地记录的编号。

可运行示例放在 `public/examples/`，正文独立一行写 `{{example:hello.cpp}}` 引用同一份代码；`sources` 列出允许下载的文件。不希望透题的内容放入默认闭合的 `<details>`，总结标签后和结束标签前留空行。公式用 KaTeX（行内 `$...$`）；代码、外链和示例命令按实际版本复核。

## 验收与可选发布

```powershell
npm.cmd test
npm.cmd run build
npm.cmd run test:browser
powershell.exe -NoProfile -File .\tests\logscan.ps1
```

浏览器测试默认用已安装的 Microsoft Edge，另用 Chrome 可将 `STUDY_BROWSER` 环境变量设为 `chrome`；测试使用隔离上下文，不使用日常浏览器的数据。PowerShell 验收脚本需要 `g++`，也可用 `-Source` 指向自己的实现。见 [课程安排与阶段验收](docs/course-method.md)。

这里位于一个更大的笔记仓库。以后要公开时，**在独立项目中只复制本站已审阅的源文件**，把 `.gitignore` 和锁文件一起带上；检查 Git 待提交文件和静态产物。不要把整个父仓库、`private/`、备份、复盘导出或任何凭证公开。目前没有远程部署。如果以后选 GitHub Pages，按 [Astro 的 GitHub Pages 指南](https://docs.astro.build/en/guides/deploy/github/)配置；项目站构建时设置 `STUDY_BASE_PATH` 为 `/仓库名`，用户站保持默认 `/`。浏览器数据不会随源代码或发布迁移，可手动导入备份。
