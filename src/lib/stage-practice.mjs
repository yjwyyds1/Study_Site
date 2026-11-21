const exercises = [
  { stage: 'aggregate', lesson: 'CPP-57', title: '用智能指针表达所有权', outcome: '对照独占和共享两种写法，解释对象何时销毁。' },
  { stage: 'store', lesson: 'LNX-56', title: '打包与恢复一份实验归档', outcome: '打包日志夹具与运行记录，在空目录解包后核对内容。' },
  { stage: 'serve', lesson: 'NET-54', title: '在本机跑通 Socket 通信', outcome: '在两个终端观察 TCP 与 UDP 的收发行为，再接入 LogScan。' },
  { stage: 'serve', lesson: 'CON-51', title: '练习线程的归属与回收', outcome: '比较线程封装与并行累加，核对退出前所有工作线程都已汇合。' },
  { stage: 'track', lesson: 'MACH-55', title: '观察缓存命中与访问顺序', outcome: '对照两种矩阵遍历方式，记录缓存模拟的命中和缺失。' },
  { stage: 'track', lesson: 'OS-51', title: '观察 RISC-V 内核启动', outcome: '在 QEMU 中观察 OpenSBI 的引导输出，说明固件和内核如何衔接。' },
];

export function stagePractice(graph) {
  const byId = new Map(graph.nodes.map(node => [node.id, node]));
  return exercises.flatMap(exercise => {
    const lesson = byId.get(exercise.lesson);
    const stage = graph.stages.find(stage => stage.id === exercise.stage);
    if (!lesson?.url || !stage) return [];
    const prerequisites = lesson.requires.map(id => byId.get(id)).filter(node => node?.url);
    return [{ ...exercise, url: lesson.url, stage, prerequisites }];
  });
}
