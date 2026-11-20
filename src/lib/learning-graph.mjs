// Build graph data from curriculum chapters, without merging chapter IDs.
export const graphColors = ['#79b5dd', '#b0a2d6', '#d6a1af', '#d0b078', '#acbf8d', '#78b6a4', '#7bbfc5', '#d69d88', '#99a6db', '#b7ada0'];

export const learningStages = [
  { id: 'start', title: '写出第一个工具', tag: 'v0', project: 'labs/logscan', description: '环境、语法、文件与资源，交付单文件统计。',
    lessons: ['CPP-01', 'ENG-01', 'ENG-02', 'ENG-03', 'ENG-04', 'ENG-05', 'ENG-06', 'ENG-07', 'CPP-02', 'CPP-03', 'CPP-04', 'CPP-05', 'CPP-06', 'CPP-07', 'CPP-08', 'CPP-09', 'CPP-10', 'CPP-11', 'CPP-12'] },
  { id: 'build', title: '拆分与回归测试', tag: 'v0.1', project: 'labs/logscan-build', description: '把一个程序拆成库、入口和可重跑的测试。',
    lessons: ['ENG-09', 'ENG-11', 'ENG-12', 'ENG-13', 'ENG-15', 'ENG-29', 'ENG-30', 'ENG-32', 'ENG-33', 'ENG-39', 'ENG-40', 'ENG-41', 'ENG-43', 'ENG-44'] },
  { id: 'aggregate', title: '多文件聚合', tag: 'v1', project: 'labs/logscan-v1', description: '设计值类型、错误边界与确定顺序的报告。',
    lessons: ['CPP-13', 'CPP-14', 'CPP-16', 'ENG-35', 'ENG-45', 'ENG-49'] },
  { id: 'store', title: 'Linux 与可查询归档', tag: 'v2', project: 'labs/logscan-v2', description: '观察进程与文件，把解析结果放进 SQLite。',
    lessons: ['OS-01', 'OS-41', 'LNX-01', 'LNX-02', 'LNX-11', 'LNX-24', 'LNX-27', 'LNX-42', 'LNX-43', 'LNX-50', 'ENG-38', 'DB-01', 'DB-07', 'DB-18', 'DB-22', 'DB-23', 'DB-24', 'DB-25', 'DB-36', 'DB-40'] },
  { id: 'serve', title: '有界 TCP 服务', tag: 'v3', project: 'labs/logscan-service', description: '字节流、任务队列与持久化在这里汇合。',
    lessons: ['MACH-01', 'MACH-04', 'NET-01', 'NET-19', 'NET-31', 'NET-33', 'NET-34', 'NET-37', 'NET-40', 'CON-04', 'CON-05', 'CON-10', 'CON-15', 'CON-19', 'CON-21', 'CON-28'] },
  { id: 'track', title: '选择方向作品', tag: '方向', description: '服务端、性能、桌面或嵌入式，选择一条延伸。',
    lessons: ['TRK-01', 'TRK-02', 'TRK-03', 'TRK-05', 'TRK-06'] },
];

export function lessonTarget(lesson, article) {
  if (!article) return undefined;
  const pattern = new RegExp(`(?:^|[^A-Z0-9-])${lesson.id}(?:$|[^A-Z0-9-])`);
  const heading = article.headings.find(h => pattern.test(h.text));
  const anchor = heading?.slug ?? 'lesson-' + lesson.id.toLowerCase();
  return article.url + '#' + encodeURIComponent(anchor);
}

export function buildLearningGraph(curriculum, articles) {
  const articleMap = new Map(articles.map(article => [article.id, article]));
  const nodes = [];
  const groups = curriculum.map((subject, groupIndex) => {
    let index = 0;
    for (const part of subject.parts) for (const mod of part.modules) for (const lesson of mod.lessons) {
      const article = articleMap.get(lesson.readings[0]?.ref);
      nodes.push({
        id: lesson.id, title: lesson.title.replaceAll('`', ''), group: subject.slug,
        groupIndex, index: index++, part: part.title, module: mod.title,
        requires: lesson.requires ?? [], topics: lesson.topics,
        question: lesson.question, ability: lesson.ability, status: lesson.status,
        articleId: article?.id, url: lessonTarget(lesson, article),
      });
    }
    return { id: subject.slug, title: subject.title, color: graphColors[groupIndex], count: index };
  });
  const byId = new Map(nodes.map(node => [node.id, node]));
  const stages = learningStages.map((stage, index) => ({
    ...stage, index, url: articleMap.get(stage.project)?.url,
    lessons: stage.lessons.filter(id => byId.has(id)),
  }));
  // Expand each milestone's real prerequisites, preserving the earliest stage
  // for shared foundations. Electives remain in their subject.
  const assigned = new Map();
  function assign(id, stage, trail = new Set()) {
    if (assigned.has(id) || trail.has(id) || !byId.has(id)) return;
    trail.add(id);
    for (const prerequisite of byId.get(id).requires) assign(prerequisite, stage, trail);
    trail.delete(id);
    assigned.set(id, stage);
  }
  for (const stage of stages) for (const id of stage.lessons) assign(id, stage.index);
  const route = [...assigned.keys()];
  for (const node of nodes) node.stage = assigned.get(node.id) ?? -1;
  const edges = nodes.flatMap(node => node.requires.filter(id => byId.has(id) && id !== node.id)
    .map(id => ({ source: id, target: node.id, kind: 'prerequisite' })));
  const routeEdges = route.slice(1).map((id, index) => ({ source: route[index], target: id, kind: 'route' }));
  const missing = nodes.flatMap(node => node.requires.filter(id => !byId.has(id)).map(id => `${node.id} → ${id}`));
  return { nodes, groups, edges, routeEdges, route, stages, missing };
}

const taskLabels = {
  environment: ['环境与终端', '先跑通编译、路径、标准流和退出码。'],
  program: ['语法、函数与文件', '把一行输入变成可以验证的统计结果。'],
  resources: ['借用、生命周期与 RAII', '解释谁拥有资源，以及借用何时失效。'],
  cli: ['独立写出日志统计器', '串起输入、分类、错误处理和验收。'],
  git: ['Git 基本工作流', '用差异和提交保存一份可以回退的进展。'],
  cmake: ['CMake 多文件构建', '把解析库、命令行入口和依赖分开。'],
  testing: ['自动测试与 CLI 契约', '把正常输入和失败路径变成回归测试。'],
  debug: ['调试、定位与修复', '从失败测试找到原因，修复后再跑一次。'],
  interface: ['值语义与错误边界', '约定复制、移动和整批失败的行为。'],
  stl: ['容器与聚合报告', '选择容器，产生顺序确定的结果。'],
  collaboration: ['分支、协作与合并', '练习小步变更、冲突处理和协作。'],
  quality: ['构建配置与 CI', '让同一份工程在干净环境自动构建和测试。'],
  shell: ['Linux 命令行操作', '在练习目录观察文件、权限和进程。'],
  system: ['字节、进程与文件 I/O', '把硬件表示、内核机制与系统接口对起来。'],
  diagnosis: ['跟踪一次系统调用', '从打开失败、返回值和错误码还原现场。'],
  sql: ['SQL 与表结构', '从数据约束走到查询与参数绑定。'],
  sqlite: ['C++ 接入 SQLite', '管理句柄与语句，导入日志并验证回滚。'],
  indexes: ['索引与查询计划', '补齐树结构，解释扫描、索引与事务的取舍。'],
  network: ['网络与 TCP 基础', '理解端点、连接、可靠传输和字节流。'],
  sockets: ['Socket、分帧与超时', '处理短读写、消息边界和异常连接。'],
  threads: ['线程、共享状态与互斥', '确定线程寿命，识别竞争并保护共享状态。'],
  queue: ['有界队列与背压', '实现等待、停止接收和排空退出。'],
  orientation: ['先选一个作品方向', '根据兴趣和已有证据，选定这次的交付范围。'],
  server: ['Linux 服务端作品', '从本机服务走向连接管理、部署与恢复。'],
  infrastructure: ['基础设施与存储作品', '以可复现的容量、延迟和恢复证据交付。'],
  desktop: ['桌面与客户端作品', '补齐对象接口，再进入 Qt 与客户端交付。'],
  embedded: ['嵌入式作品', '补齐机器层，验证固定容量和目标约束。'],
};

function taskBucket(node) {
  const number = Number(node.id.split('-')[1]);
  if (node.stage === 0) return node.group === 'engineering' || number <= 2 ? 'environment' : number <= 7 ? 'program' : number <= 10 ? 'resources' : 'cli';
  if (node.stage === 1) return number <= 15 ? 'git' : number <= 35 ? 'cmake' : number <= 42 ? 'testing' : 'debug';
  if (node.stage === 2) return node.group === 'cpp' ? number <= 14 ? 'interface' : 'stl' : number <= 27 ? 'collaboration' : 'quality';
  if (node.stage === 3) {
    if (node.group === 'linux') return number <= 27 ? 'shell' : number === 50 ? 'diagnosis' : 'system';
    if (node.group === 'machine' || node.group === 'os') return 'system';
    if (node.group === 'algorithms') return 'indexes';
    if (node.group === 'engineering') return 'sqlite';
    return number <= 18 ? 'sql' : number <= 29 ? 'sqlite' : 'indexes';
  }
  if (node.stage === 4) return node.group === 'network' ? number <= 21 ? 'network' : 'sockets' : number <= 15 ? 'threads' : 'queue';
  if (node.group === 'cpp') return 'desktop';
  if (node.group === 'machine') return 'embedded';
  return ({ 1: 'orientation', 2: 'server', 3: 'infrastructure', 5: 'desktop', 6: 'embedded' })[number] ?? 'orientation';
}

// The overview contracts real chapter dependencies into a small task DAG.
// Same-row tasks are independent. Each chapter still has its own reading URL.
export function buildLearningPlan(graph) {
  const routeOrder = new Map(graph.route.map((id, index) => [id, index]));
  const tasks = [];
  const taskByLesson = new Map();
  const buckets = new Map();
  for (const node of graph.nodes.filter(node => node.stage >= 0)) {
    const bucket = taskBucket(node), key = node.stage + '-' + bucket;
    if (!buckets.has(key)) {
      const [title, description] = taskLabels[bucket];
      const task = { id: key, stage: node.stage, bucket, title, description, lessons: [], requires: [], row: 0 };
      tasks.push(task); buckets.set(key, task);
    }
    buckets.get(key).lessons.push(node.id);
    taskByLesson.set(node.id, key);
  }
  for (const task of tasks) {
    task.lessons.sort((a, b) => routeOrder.get(a) - routeOrder.get(b));
    const requirements = new Set();
    for (const id of task.lessons) {
      const node = graph.nodes.find(node => node.id === id);
      for (const prerequisite of node.requires) {
        const other = taskByLesson.get(prerequisite);
        if (other && other !== task.id) requirements.add(other);
      }
    }
    task.requires = [...requirements];
  }
  const byId = new Map(tasks.map(task => [task.id, task]));
  const visiting = new Set(), visited = new Set();
  function rank(task) {
    if (visiting.has(task.id)) throw new Error('Learning task dependency cycle: ' + task.id);
    if (visited.has(task.id)) return task.row;
    visiting.add(task.id);
    const sameStage = task.requires.map(id => byId.get(id)).filter(other => other.stage === task.stage);
    task.row = sameStage.length ? Math.max(...sameStage.map(other => rank(other))) + 1 : 0;
    visiting.delete(task.id); visited.add(task.id);
    return task.row;
  }
  tasks.forEach(rank);
  function dependsOn(task, id, visited = new Set()) {
    if (visited.has(task.id)) return false;
    visited.add(task.id);
    return task.requires.includes(id) || task.requires.some(key => dependsOn(byId.get(key), id, visited));
  }
  for (const task of tasks) task.flowRequires = task.requires.filter(id => byId.get(id).stage === task.stage)
    .filter(id => !task.requires.some(other => other !== id && dependsOn(byId.get(other), id)));
  return {
    tasks,
    stages: graph.stages.map(stage => ({ ...stage, tasks: tasks.filter(task => task.stage === stage.index).map(task => task.id) })),
    supplementary: graph.nodes.filter(node => node.stage < 0).map(node => node.id),
    taskByLesson: Object.fromEntries(taskByLesson),
  };
}
