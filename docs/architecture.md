# C++ 研习手册：架构与运行方式

站点支持 GitHub Pages 在线阅读与本地运行。按学习首页、路线、手册、实验、笔记和学习记录组织；阅读页使用章节树、正文和页内目录。小屏将章节树收起，页内目录保持可访问。

- Astro 静态输出。Markdown 正文在构建阶段渲染，示例由同一份 C++ 源文件嵌入；搜索用按需加载的本地文本索引。VitePress 适合纯文档，但此站常用的个人复盘、私有笔记和仪表板需要定制布局。纯 SPA 要自行承担较多文档渲染和路由工作。
- 课程目录来自 `docs/curriculum/` 的稳定编号、先修和阅读映射，由 `src/lib/full-curriculum.mjs` 解析。552 个编号章节映射到专题讲义的锚点，已有文章路径继续用于阅读记录。
- 学习路线由 `src/lib/learning-graph.mjs` 组织为六阶段、27 个任务，包含 146 个主线章节。其余 406 章在全部课程面板中按学科查阅。任务位置固定，用 SVG 箭头连接先修，滚动使用浏览器原生行为。
- 项目实验页和路线共用阶段验收标准。`src/lib/stage-practice.mjs` 按章节编号选出可配合各阶段的练习，正文锚点和直接先修来自课程目录。选练独立于主线完成度。
- 浏览器状态采用版本化 JSON，明确区分访问位置、掌握阶段和复习标记。备份通过格式校验、预览和明确替换；保留替换前快照。私人 Markdown 由浏览器读取，原件另存，始终不加入构建产物。
- 默认路线从环境与最小程序进入语法、文件读取和资源管理，再按 LogScan v0、v0.1、v1、v2、v3 与方向作品推进。失败样例、执行命令与修改需求一起保留为学习证据。
- 可选 AI 放在以后：目前只导出用户勾选的复盘材料。后续如有需要，使用绑定 loopback 的独立服务代理，密钥通过服务环境变量读取，模型费用由使用者自己的账户承担；发送代码前显式选择提交范围。

## 学习数据

`src/scripts/browser-state.mjs` 先将编辑保存到浏览器，再按运行方式决定是否同步：

| 运行方式 | 状态流向 |
| --- | --- |
| 在线版（`PUBLIC_STUDY_STATIC=true`） | 仅 localStorage，不请求 `/api/state` 或 `/api/progress` |
| 本地开发与预览 | localStorage + Node.js SQLite API，默认写入 `data/study-progress.db` |

Shell 将存储模式写入 `body[data-storage-mode]`。在线版的首页、阅读页和仪表盘显示浏览器保存；本地版显示 SQLite 的实际连接状态。API 不可用时保留浏览器中的编辑，用户仍可导出 JSON。

本地服务通过 `src/lib/api-handler.mjs` 与 `src/lib/db.mjs` 处理状态、进度与数据库统计。可用 `STUDY_DB_PATH` 指定独立数据库，便于测试。完整备份由用户主动导出、预览和恢复，在线与本地之间通过备份迁移；两个环境不会自动同步。

## 构建与发布

`.github/workflows/deploy-pages.yml` 在推送 `main` 或手动触发时，使用 Node.js 24 安装锁定依赖、运行单元测试并构建。工作流设置 `STUDY_BASE_PATH=/<仓库名>` 与 `PUBLIC_STUDY_STATIC=true`，只上传 `dist/` 到 GitHub Pages。

日常本地开发运行 `npm run dev`；生产预览运行 `npm run build`、`npm run preview`。本地默认路径为 `/`，端口为 4321。不要将在线构建的环境变量保留在日常开发终端中，否则路径与存储模式也会随之改变。

数据库、私人 Markdown 和导出的备份不参与构建。截图存放在 `docs/screenshots/`，使用隔离浏览器上下文拍摄。公开介绍、安装步骤与页面预览统一维护在 [README](../README.md)。
