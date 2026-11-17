// 章节 id 只分配给已有手册正文的章节；无正文的章节标为「计划」。
const planned = (title, description) => ({ title, description: `计划：${description}` });
const published = (id, title, description, navTitle = title) => ({ id, title, description: `已发布 · 手册：${description}`, navTitle });

export const stages = [
  {
    id: 'basics',
    title: '第 0 阶段：C++ 入门与写代码手感',
    description: '不碰构建工具和复杂脚本，只用单文件把变量、分支循环、函数、容器和读文件练熟。',
    hours: '8–12 小时（约 1 周）',
    outcome: '关掉网页也能用 30 行以内的 C++20 代码读入一个文本文件、按条件筛选并统计行数。',
  },
  {
    id: 'start',
    title: '第 1 阶段：工程入门与核心机制',
    description: '分清编译与链接、学会断点调试，建立对象生命周期与 RAII 心智模型，交付单文件 LogScan v0。',
    hours: '12–16 小时（约 1–2 周）',
    outcome: '独立跑通 LogScan v0；能用断点查变量，解释借用何时失效，并用 RAII 安全管理文件资源。',
  },
  {
    id: 'foundation',
    title: '第 2 阶段：多文件工程与自动测试',
    description: '用 Git 管理改动，用 CMake 把单文件拆成核心库与命令行入口，并用 CTest 锁住回归。',
    hours: '16–24 小时（约 2 周）',
    outcome: '交付 LogScan v0.1：拆出核心解析库、CLI 入口和单元测试，从干净构建目录一键构建并测试通过。',
  },
  {
    id: 'systems',
    title: '第 3 阶段：项目进阶与系统实战',
    description: '围绕通用 C++ 项目工程能力展开：Linux 排错、多线程并发队列、TCP 协议分帧与 SQLite 持久化，最终交付 LogScan v2。',
    hours: '24–36 小时（约 2–3 周）',
    outcome: '将 LogScan 演进为支持并发队列、分帧解码与事务归档的综合系统，积累可讲解、可复现的求职项目证据。',
  },
];

export const modules = [
  {
    id: 'cpp-intro',
    title: '零基础入门：写出能跑的小程序',
    stage: 'basics',
    tier: 'core',
    why: '先建立变量、循环、函数和容器的直觉与手感，再谈工程和底层机制。',
    exit: '完成 5 课全部微练习，能不看提示写出一个读取 sample.log 并统计指定前缀的小程序。',
    requires: [],
    chapters: [
      published('cpp-setup', '第 0 课：在 Windows 上搭好 C++20 环境', '确认 g++ 编译器、解决终端中文乱码，跑通人生第一行代码。', '环境搭建与乱码'),
      published('cpp-basics', '第 1 课：变量、基本类型与常见运算坑', '掌握 int/double/bool/string，避开未初始化与整数除法陷阱。', '变量与类型'),
      published('cpp-control', '第 2 课：分支、循环与输入流陷阱', '用 if/else、while/for 处理输入，避开 = 与 == 及 cin/getline 坑。', '分支与循环'),
      published('cpp-functions', '第 3 课：函数、返回值与值/引用传递', '分清传复印件（值）和传原件快捷方式（引用）的区别。', '函数与引用'),
      published('cpp-containers', '第 4 课：std::string 与 std::vector 实战及越界陷阱', '掌握动态数组与字符串高频操作，避开修改漏写 & 与下溢坑。', 'string 与 vector'),
      published('cpp-struct-file', '第 5 课：用 struct 打包数据并从文件读取', '用结构体整理数据，并用 ifstream 逐行读取本地文件。', 'struct 与文件'),
    ],
  },
  {
    id: 'tools',
    title: '工程入口：编译、链接与调试',
    stage: 'start',
    tier: 'core',
    why: '跑得出、读得懂错误、能定位失败，后续做大项目才有稳定反馈。',
    exit: '用 -c 区分编译错误与链接错误，并在 CLion 断点处检查变量值。',
    requires: ['cpp-intro'],
    chapters: [
      published('toolchain', '分清编译错误、链接错误与运行时调试', '拆开编译和链接两步，亲手复现常见报错，并用断点抓逻辑 Bug。', '编译、链接与调试'),
    ],
  },
  {
    id: 'cpp',
    title: '现代 C++：对象生命周期与 RAII',
    stage: 'start',
    tier: 'core',
    why: '清楚数据归谁、借用能活多久、资源由谁释放，才能写出不崩溃的 C++ 程序。',
    exit: '修复一次悬空引用/视图，用 RAII 管理文件流并独立交付 LogScan v0。',
    requires: ['tools'],
    chapters: [
      published('blank-program', '从空白文件写一个逐行分类器', '把读入、分类和计数拆成小步骤，验证空行与错误路径。', '逐行分类器'),
      published('lifetime', '对象何时失效？从引用悬空到 vector 扩容', '看懂拥有者与借条的区别，追踪 vector 扩容时的引用失效。', '生命周期与失效'),
      published('raii', '用 RAII 表达资源的所有权', '让文件流和 unique_ptr 在正常返回与异常时自动清理资源。', 'RAII 与所有权'),
      { ref: 'labs/logscan', title: '实验：LogScan v0 单文件日志统计', navTitle: 'LogScan v0：单文件项目', description: '已发布 · 实验：按约定扫描日志并统计级别、坏行和退出码。' },
    ],
  },
  {
    id: 'build',
    title: '工具链：Git 与 CMake 多文件工程',
    stage: 'foundation',
    tier: 'core',
    why: '代码超过一个文件后，需要版本控制和标准构建工具才能团队协作与复现。',
    exit: '用 Git 记录一次修改，并用 CMake 将程序拆分为库目标与可执行目标。',
    requires: ['cpp'],
    chapters: [
      published('command-line-git', '在 PowerShell 复现构建，用 Git 记录一次改动', '理清工作目录与退出码，在本地仓库留下可回看的提交。', '命令行与 Git'),
      published('cmake-targets', '用 CMake 目标组织多文件 C++ 工程', '拆清头文件、静态库与可执行目标，理解链接依赖。', 'CMake 多文件工程'),
    ],
  },
  {
    id: 'testing',
    title: '质量：单元测试、CLI 测试与排错',
    stage: 'foundation',
    tier: 'core',
    why: '让边界用例有自动化测试兜底，改代码时才敢大步重构。',
    exit: '为 LogScan v0.1 编写单元测试与 CLI 测试，跑通 CTest 并定位修复一次回归。',
    requires: ['build'],
    chapters: [
      published('cli-testing', '写测试和定位错误', '用单元测试验证解析函数，用 CLI 测试检查退出码与标准输出/错误。', '自动测试与排错'),
      { ref: 'labs/logscan-build', title: '实验：LogScan v0.1 多文件工程', navTitle: 'LogScan v0.1：多文件项目', description: '已发布 · 实验：拆分解析库与命令行程序，用 CTest 锁住原行为。' },
    ],
  },
  {
    id: 'linux',
    title: 'Linux 环境与进程 I/O',
    stage: 'systems',
    tier: 'core',
    why: 'C++ 工程项目最终多运行在 Linux 上，需要看懂进程、文件描述符与常用排错命令。',
    exit: '在 WSL2 Ubuntu 编译运行程序，并用 strace 和 gdb 定位一次文件打开或崩溃问题。',
    requires: ['testing'],
    chapters: [
      published('linux-process-io', 'Linux 环境、进程与文件 I/O 基础', '搭好 WSL2 环境，理解文件描述符与缓冲 I/O，会用 ps/strace/gdb 排错。', 'Linux 与进程 I/O'),
    ],
  },
  {
    id: 'concurrency',
    title: '多线程并发与任务队列',
    stage: 'systems',
    tier: 'core',
    why: '高吞吐项目离不开生产者-消费者模型，必须保证线程安全与优雅退出。',
    exit: '实现带容量上限和关闭排空机制的 BoundedQueue，并用多线程跑通测试。',
    requires: ['linux', 'raii'],
    chapters: [
      published('concurrency-queue', '多线程并发与有界任务队列', '用 mutex 与 condition_variable 写出线程安全、可优雅关闭的有界队列。', '并发与有界队列'),
    ],
  },
  {
    id: 'network',
    title: '网络编程与协议分帧',
    stage: 'systems',
    tier: 'core',
    why: 'TCP 是无边界字节流，服务端必须自己解决粘包、半包与超长包保护。',
    exit: '实现 4 字节长度前缀编解码器，并在拆包测试中通过粘包、半包与超长包边界用例。',
    requires: ['concurrency'],
    chapters: [
      published('network-tcp', '网络编程：TCP 通信与消息分帧', '看懂 TCP 粘包与拆包原因，写出可复用的长度前缀分帧解码器。', 'TCP 协议分帧'),
    ],
  },
  {
    id: 'storage',
    title: '数据持久化与综合项目交付',
    stage: 'systems',
    tier: 'core',
    why: '让日志数据可索引查询、批量高速写入，并在失败时保持事务一致。',
    exit: '完成 SQLite 索引与事务回滚实验，并将队列、分帧与持久化集成到 LogScan v2。',
    requires: ['network'],
    chapters: [
      published('storage-sqlite', '数据持久化：SQL、索引与事务回滚', '设计日志表结构，掌握参数绑定防注入、复合索引与事务提交回滚。', 'SQLite 持久化'),
      { ref: 'labs/logscan-service', title: '实验：LogScan v2 多线程与持久化服务原型', navTitle: 'LogScan v2：综合实战', description: '已发布 · 实验：将有界队列、协议分帧与 SQLite 归档集成到 CMake 工程。' },
    ],
  },
];

export const tracks = [];

export const projects = [
  {
    id: 'logscan',
    title: 'LogScan v0 · 单文件统计',
    stage: 'start',
    status: 'published',
    follows: [],
    requires: ['cpp'],
    outcome: '从命令行扫描一份日志，区分正常、坏行、用法错误与 I/O 失败。',
  },
  {
    id: 'logscan-build',
    title: 'LogScan v0.1 · 多文件工程',
    stage: 'foundation',
    status: 'published',
    follows: ['logscan'],
    requires: ['build', 'testing'],
    outcome: '将 v0 拆成解析库、CLI 和 CTest 测试，从干净目录一键构建并回归验证。',
  },
  {
    id: 'logscan-service',
    title: 'LogScan v2/v3 · 服务与归档',
    stage: 'next',
    status: 'planned',
    follows: ['logscan-build'],
    requires: ['linux', 'systems'],
    outcome: '加入 SQLite 归档、并发处理与 TCP 网络接收，形成可写进简历的完整项目。',
  },
];
