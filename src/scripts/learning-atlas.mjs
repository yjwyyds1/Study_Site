import { state } from './browser-state.mjs';

const root = document.getElementById('study-route');
const data = JSON.parse(document.getElementById('route-data').textContent);
const byId = new Map(data.nodes.map(node => [node.id, node]));
const tasks = new Map(data.tasks.map(task => [task.id, task]));
const el = id => document.getElementById('route-' + id);
const drawer = el('drawer');
let learned = new Set(), activeStage = 0, activeTask = null, library = false;
let lastWidth = 0, positions = [], currentTasks = [];
let choseStage = false;
const gates = [
  '能独立重建程序，验证正常、空文件、坏行与缺文件的行为。',
  '从干净目录构建，测试通过，并保留一次失败、定位和修复的记录。',
  '多输入聚合结果确定；任一输入失败时，整批错误契约可以复现。',
  '提交参数化查询、索引前后对照，以及坏批次整体回滚的证据。',
  '验证分帧、队列满、超时、断连与停止排空，留下集成测试结果。',
  '四条方向选一条，交付正常与失败用例、构建说明和可复现的作品。',
];
function complete(task) { return task.lessons.every(id => learned.has(id)); }
function missingTasks(task) { return task.requires.map(id => tasks.get(id)).filter(other => !complete(other)); }
function stageComplete(index) {
  const stageTasks = data.stages[index].tasks.map(id => tasks.get(id));
  if (index === 5) return stageTasks.some(task => task.bucket !== 'orientation' && complete(task));
  return stageTasks.every(complete);
}
function nextChapter(ids, seen = new Set()) {
  for (const id of ids) {
    if (learned.has(id) || seen.has(id)) continue;
    seen.add(id);
    const node = byId.get(id);
    const prerequisites = node.requires.filter(code => byId.has(code) && !learned.has(code));
    if (prerequisites.length) {
      const prior = nextChapter(prerequisites, seen);
      if (prior) return prior;
    }
    return node;
  }
}
function orderedTasks(index) {
  return data.stages[index].tasks.map(id => tasks.get(id)).sort((a, b) => a.row - b.row || data.nodes.findIndex(n => n.id === a.lessons[0]) - data.nodes.findIndex(n => n.id === b.lessons[0]));
}
function updateRecommendation() {
  const finished = data.stages.every(stage => stageComplete(stage.index));
  const current = data.stages.find(stage => !stageComplete(stage.index)) ?? data.stages[5];
  const candidates = orderedTasks(current.index).filter(task => !complete(task));
  const task = finished ? undefined : candidates.find(task => !missingTasks(task).length) ?? candidates[0];
  const chapter = task ? nextChapter(task.lessons) : byId.get('TRK-01');
  el('next-label').textContent = finished ? '主线课程已学完，准备验证方向作品' : current.index === 5 ? '选定一个方向后继续作品实践' : '现在先学 · 阶段 ' + String(current.index + 1).padStart(2, '0') + ' / ' + current.tag;
  el('next-title').textContent = chapter.id + ' ' + chapter.title;
  el('next-read').href = chapter.url;
  el('next-reason').textContent = task ? task.title + ' · ' + (task.row === 0 ? '从这组任务开始。' : '完成前一组后，再进入这里。') : '先完成已选方向的作品验收，再按需要回查其他章节。';
  root.querySelectorAll('[data-route-stage]').forEach(button => {
    const index = Number(button.dataset.routeStage), stageTasks = orderedTasks(index);
    const count = stageTasks.filter(complete).length;
    root.querySelector(`[data-stage-count="${index}"]`).textContent = index === 5 ? '四条方向，选择一条' : count + ' / ' + stageTasks.length + ' 项任务';
    root.querySelector(`[data-stage-state="${index}"]`).textContent = stageComplete(index) ? '✓' : index === current.index ? '现在' : '';
  });
}
function renderStage(index) {
  activeStage = index;
  const stage = data.stages[index];
  currentTasks = orderedTasks(index);
  root.querySelectorAll('[data-route-stage]').forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.routeStage) === index)));
  el('stage-kicker').textContent = '阶段 ' + String(index + 1).padStart(2, '0') + ' · ' + stage.tag;
  el('stage-title').textContent = stage.title;
  el('stage-description').textContent = stage.description + (index === 5 ? ' 四条分支选一条即可。' : ' 先完成箭头起点；并列任务可任选先后。');
  const external = [...new Set(currentTasks.flatMap(task => task.requires))].map(id => tasks.get(id)).filter(task => task.stage < index && !complete(task));
  el('stage-gate').hidden = !external.length;
  el('stage-gate').textContent = external.length ? '预览此阶段。开始前先补齐 ' + [...new Set(external.map(task => task.stage))].sort((a, b) => a - b).map(index => '阶段 ' + String(index + 1).padStart(2, '0')).join('、') + ' 的先修；点任务框可查看具体章节。' : '';
  if (index === 5) {
    el('stage-gate').hidden = false;
    el('stage-gate').textContent = '先选一条方向。各分支的先修单独列在任务里，完成其中一条作品即可。';
  }
  el('milestone-title').textContent = index === 5 ? '完成一个方向作品' : 'LogScan ' + stage.tag + ' · ' + stage.title;
  el('milestone-hint').textContent = gates[index];
  el('project').hidden = !stage.url;
  if (stage.url) el('project').href = stage.url;
  el('stage-summary').textContent = index === 5 ? '作品范围选定后，沿选中的分支继续。' : currentTasks.length + ' 项主线任务 · ' + currentTasks.reduce((count, task) => count + task.lessons.length, 0) + ' 章 · 点任务框查看阅读顺序';
  el('next-stage').hidden = index === 5;
  const pane = el('task-nodes'); pane.replaceChildren();
  for (const task of currentTasks) {
    const button = Object.assign(document.createElement('button'), { type: 'button', className: 'route-task' });
    button.dataset.task = task.id;
    const done = complete(task), blocked = missingTasks(task).length > 0;
    button.dataset.status = done ? 'done' : blocked ? 'later' : 'ready';
    const head = document.createElement('span'); head.className = 'route-task-head';
    head.append(Object.assign(document.createElement('small'), { textContent: activeStage === 5 && task.bucket !== 'orientation' ? '四选一' : done ? '已完成' : blocked ? '先补前置' : '现在可学' }));
    head.append(Object.assign(document.createElement('span'), { textContent: task.lessons.filter(id => learned.has(id)).length + ' / ' + task.lessons.length + ' 章' }));
    const title = Object.assign(document.createElement('strong'), { textContent: task.title });
    const foot = Object.assign(document.createElement('span'), { className: 'route-task-foot', textContent: '查看章节顺序 ↗' });
    button.append(head, title, foot);
    button.addEventListener('click', () => openTask(task.id));
    pane.append(button);
  }
  layout();
}
function svgPath(d, end = true) {
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', d);
  if (end) path.setAttribute('marker-end', 'url(#route-arrowhead)');
  return path;
}
function layout() {
  const width = el('diagram').clientWidth;
  if (!width) return;
  lastWidth = width;
  const horizontal = width >= 800;
  const rows = Array.from({ length: Math.max(...currentTasks.map(task => task.row)) + 1 }, (_, row) => currentTasks.filter(task => task.row === row));
  const columns = rows.length, cardHeight = 106, gap = 44, padding = 22;
  const cardWidth = horizontal ? Math.min(230, (width - padding * 2 - gap * (columns - 1)) / columns) : Math.min(360, width - 40);
  const maxAcross = Math.max(...rows.map(row => row.length));
  const height = horizontal ? Math.max(190, maxAcross * (cardHeight + 22) + 54) : currentTasks.length * (cardHeight + 18) + rows.length * 46 + 10;
  const pane = el('task-nodes');
  pane.querySelectorAll('.route-parallel-label').forEach(label => label.remove());
  positions = [];
  let yCursor = 0;
  const totalWidth = horizontal ? cardWidth * columns + gap * (columns - 1) : cardWidth;
  for (let row = 0; row < rows.length; row++) {
    const items = rows[row], label = document.createElement('span');
    label.className = 'route-parallel-label' + (items.length > 1 ? ' is-parallel' : '');
    label.textContent = items.length > 1 ? activeStage === 5 && row > 0 ? '选择一条方向' : '这一组可并行 · ' + items.length + ' 项' : row === 0 ? '从这里开始' : '然后继续';
    label.style.left = (horizontal ? (width - totalWidth) / 2 + row * (cardWidth + gap) : 20) + 'px';
    label.style.top = (horizontal ? 8 : yCursor + 5) + 'px';
    label.style.width = cardWidth + 'px';
    pane.append(label);
    if (!horizontal) yCursor += 36;
    items.forEach((task, itemIndex) => {
      const x = horizontal ? (width - totalWidth) / 2 + row * (cardWidth + gap) : (width - cardWidth) / 2;
      const y = horizontal ? 45 + (height - 60 - items.length * (cardHeight + 22)) / 2 + itemIndex * (cardHeight + 22) : yCursor;
      positions.push({ id: task.id, x, y, width: cardWidth, height: cardHeight });
      const button = pane.querySelector(`[data-task="${task.id}"]`);
      Object.assign(button.style, { left: x + 'px', top: y + 'px', width: cardWidth + 'px', height: cardHeight + 'px' });
      if (!horizontal) yCursor += cardHeight + 18;
    });
    if (!horizontal) yCursor += 10;
  }
  el('diagram').style.height = height + 'px';
  el('arrows').setAttribute('viewBox', `0 0 ${width} ${height}`);
  const lines = el('arrow-lines'); lines.replaceChildren();
  const pos = new Map(positions.map(position => [position.id, position]));
  for (const task of currentTasks) for (const id of task.flowRequires) {
    const from = pos.get(id), to = pos.get(task.id);
    if (!from || !to) continue;
    if (horizontal) {
      const sx = from.x + from.width, sy = from.y + from.height / 2, tx = to.x - 3, ty = to.y + to.height / 2;
      const mx = (sx + tx) / 2;
      lines.append(svgPath(`M${sx},${sy} H${mx} V${ty} H${tx}`));
    } else {
      const sx = from.x + from.width / 2, sy = from.y + from.height, tx = to.x + to.width / 2, ty = to.y - 3;
      const side = 9;
      lines.append(svgPath(rows[tasks.get(id).row].length === 1 && rows[task.row].length === 1
        ? `M${sx},${sy} V${ty}`
        : `M${sx},${sy} V${sy + 8} H${side} V${ty - 8} H${tx} V${ty}`));
    }
  }
}
function showDrawer() {
  if (!drawer.open) drawer.showModal();
}
function openTask(id) {
  const task = tasks.get(id);
  if (!task) return;
  activeTask = id; library = false;
  el('library-tools').hidden = true;
  el('drawer-kicker').textContent = '阶段 ' + String(task.stage + 1).padStart(2, '0') + ' · ' + data.stages[task.stage].tag;
  el('drawer-title').textContent = task.title;
  el('drawer-description').textContent = task.description;
  const pane = el('prerequisites'); pane.replaceChildren();
  if (task.requires.length) {
    pane.append(Object.assign(document.createElement('p'), { className: 'route-drawer-prior-label', textContent: '先完成这些任务；已会的章节可以直接打卡跳过。' }));
    for (const key of task.requires) {
      const prior = tasks.get(key), button = Object.assign(document.createElement('button'), { type: 'button', className: 'route-prior-task', textContent: (complete(prior) ? '✓ ' : '↗ ') + prior.title });
      button.addEventListener('click', () => openTask(key)); pane.append(button);
    }
  }
  el('list-caption').textContent = '按下面顺序阅读 · ' + task.lessons.length + ' 章';
  renderChapters(task.lessons.map(id => byId.get(id)));
  showDrawer();
  history.replaceState(null, '', '#task-' + id);
  drawer.scrollTop = 0;
}
function renderChapters(nodes) {
  const list = el('lesson-list'); list.replaceChildren();
  const fragment = document.createDocumentFragment();
  for (const node of nodes) {
    const li = document.createElement('li'); li.dataset.lesson = node.id;
    const link = Object.assign(document.createElement('a'), { href: node.url });
    const code = Object.assign(document.createElement('small'), { textContent: node.id + ' · ' + (learned.has(node.id) ? '已学习' : data.groups[node.groupIndex].title) });
    const title = Object.assign(document.createElement('strong'), { textContent: node.title });
    link.append(code, title);
    li.append(link);
    const unmet = node.requires.filter(id => !learned.has(id) && byId.has(id));
    if (unmet.length) {
      const prior = Object.assign(document.createElement('p'), { className: 'route-lesson-prereqs', textContent: '先修 ' });
      for (const id of unmet) {
        prior.append(Object.assign(document.createElement('a'), { href: byId.get(id).url, textContent: id }));
      }
      li.append(prior);
    }
    fragment.append(li);
  }
  list.append(fragment);
}
function renderLibrary() {
  const query = el('search').value.trim().toLowerCase(), group = el('subject-filter').value;
  const matches = data.nodes.filter(node => (!group || node.group === group) && (!query || (node.id + ' ' + node.title + ' ' + node.topics.join(' ')).toLowerCase().includes(query)));
  el('list-caption').textContent = '找到 ' + matches.length + ' / ' + data.nodes.length + ' 章 · 主线之外按需补修';
  renderChapters(matches);
}
function openLibrary(group = '') {
  library = true; activeTask = null;
  el('drawer-kicker').textContent = '主线与拓展 · 完整索引';
  el('drawer-title').textContent = '全部 ' + data.nodes.length + ' 个章节';
  el('drawer-description').textContent = '按编号、主题或学科查找。每一章保留正文跳转和具体先修。';
  el('prerequisites').replaceChildren();
  el('library-tools').hidden = false;
  el('search').value = ''; el('subject-filter').value = group;
  renderLibrary(); showDrawer(); drawer.scrollTop = 0;
}
function sync() {
  const saved = state();
  const updated = new Set(data.nodes.filter(node => saved.lessonProgress?.[node.id]?.learned).map(node => node.id));
  if (root.dataset.ready === 'true' && updated.size === learned.size && [...updated].every(id => learned.has(id))) return;
  learned = updated;
  if (!choseStage) activeStage = data.stages.find(stage => !stageComplete(stage.index))?.index ?? 5;
  updateRecommendation(); renderStage(activeStage);
  if (drawer.open) { if (library) renderLibrary(); else if (activeTask) openTask(activeTask); }
}
root.querySelectorAll('[data-route-stage]').forEach(button => button.addEventListener('click', () => {
  choseStage = true;
  renderStage(Number(button.dataset.routeStage));
  history.replaceState(null, '', '#stage-' + activeStage);
}));
el('next-stage').addEventListener('click', () => {
  choseStage = true;
  renderStage(Math.min(5, activeStage + 1));
  history.replaceState(null, '', '#stage-' + activeStage);
  el('stage-title').scrollIntoView({ block: 'center' });
});
el('library-open').addEventListener('click', () => openLibrary());
root.querySelectorAll('[data-library-group]').forEach(button => button.addEventListener('click', () => openLibrary(button.dataset.libraryGroup)));
el('drawer-close').addEventListener('click', () => drawer.close());
drawer.addEventListener('click', event => {
  const rect = drawer.getBoundingClientRect();
  if (event.target === drawer && (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom)) drawer.close();
});
el('search').addEventListener('input', renderLibrary);
el('subject-filter').addEventListener('change', renderLibrary);
new ResizeObserver(entries => {
  const width = entries[0].contentRect.width;
  if (Math.abs(width - lastWidth) > 1) layout();
}).observe(el('diagram'));
window.addEventListener('study-state:change', sync);
window.addEventListener('pageshow', sync);
sync();
const hash = location.hash.slice(1);
if (/^stage-[0-5]$/.test(hash)) { choseStage = true; renderStage(Number(hash.slice(-1))); }
else if (hash.startsWith('task-') && tasks.has(hash.slice(5))) {
  choseStage = true;
  renderStage(tasks.get(hash.slice(5)).stage); openTask(hash.slice(5));
} else if (byId.has(hash)) {
  choseStage = true;
  const task = data.taskByLesson[hash];
  if (task) { renderStage(tasks.get(task).stage); openTask(task); }
  else { openLibrary(); el('search').value = hash; renderLibrary(); }
}
root.dataset.ready = 'true';
