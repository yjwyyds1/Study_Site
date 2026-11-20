export const storageKey = 'cpp-study.state.v1';
export const previousKey = 'cpp-study.previous.v1';
export const statusLabels = { unread: '未开始', read: '读过', practiced: '练过', passed: '通过验收' };
export const profileFields = {
  cpp: 'C++ 与算法', projects: '项目与调试', systems: '计算机基础',
  track: '方向', budget: '每周投入', deadline: '投递安排',
  weeklyFocus: '本周任务', planReason: '计划和调整依据', reflection: '阶段复盘'
};
const topicId = /^(handbook|labs|notes)\/[a-z0-9]+(?:-[a-z0-9]+)*$/;
const lessonCode = /^[A-Z]{2,6}-\d{2,3}$/;
const dayKey = /^\d{4}-\d{2}-\d{2}$/;
const object = x => x !== null && typeof x === 'object' && !Array.isArray(x);
const maxBytes = 1_500_000;
const short = (value, max, label) => {
  if (typeof value !== 'string' || value.length > max) throw new Error(label + '的格式或长度不正确。');
  return value;
};
function topic(value) {
  if (typeof value !== 'string' || !topicId.test(value) || value.length > 100) throw new Error('备份包含无效的章节编号。');
  return value;
}
function date(value) {
  if (value !== '' && (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT/.test(value) || !Number.isFinite(Date.parse(value)))) {
    throw new Error('记录的时间格式不正确。');
  }
  return value;
}
export function localDateKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}
export const emptyState = () => ({
  version: 1, current: null, records: {}, notes: [],
  profile: Object.fromEntries(Object.keys(profileFields).map(key => [key, ''])),
  lessonProgress: {},
  dailyLog: {}
});
export function recomputeDailyLog(lessonProgress) {
  const counts = {};
  for (const entry of Object.values(lessonProgress || {})) {
    if (entry?.learned && dayKey.test(entry.studyDate || '')) {
      counts[entry.studyDate] = (counts[entry.studyDate] || 0) + 1;
    }
  }
  return counts;
}
function validate(input) {
  if (!object(input) || input.version !== 1) throw new Error('不支持该备份版本。此版本需要版本 1 的 JSON 备份。');
  if (!object(input.profile) || !object(input.records) || !Array.isArray(input.notes)) throw new Error('备份缺少档案、记录或笔记。');
  const clean = emptyState();
  if (input.current !== null) {
    if (!object(input.current)) throw new Error('备份的阅读位置不正确。');
    clean.current = { id: topic(input.current.id), anchor: short(input.current.anchor, 240, '阅读位置') };
  }
  for (const key of Object.keys(profileFields)) clean.profile[key] = short(input.profile[key], 1800, profileFields[key]);
  if (Object.keys(input.records).length > 1000) throw new Error('备份包含太多记录。');
  for (const [key, item] of Object.entries(input.records)) {
    topic(key);
    if (!object(item) || !Object.hasOwn(statusLabels, item.status) || typeof item.review !== 'boolean') throw new Error('学习状态不正确。');
    const evidence = short(item.evidence, 3000, '验收依据');
    if (item.status === 'passed' && !evidence.trim()) throw new Error('通过验收需要填写验收依据。');
    clean.records[key] = {
      status: item.status, review: item.review, evidence, blocker: short(item.blocker, 1800, '卡点'),
      updatedAt: date(item.updatedAt), reviewedAt: date(item.reviewedAt)
    };
  }
  if (input.lessonProgress !== undefined) {
    if (!object(input.lessonProgress)) throw new Error('课程进度格式不正确。');
    if (Object.keys(input.lessonProgress).length > 1500) throw new Error('课程进度记录过多。');
    for (const [lid, entry] of Object.entries(input.lessonProgress)) {
      if (!lessonCode.test(lid) || !object(entry) || typeof entry.learned !== 'boolean') {
        throw new Error('课程进度项格式不正确。');
      }
      const studyDate = typeof entry.studyDate === 'string' && (entry.studyDate === '' || dayKey.test(entry.studyDate)) ? entry.studyDate : '';
      const articleId = typeof entry.articleId === 'string' && (entry.articleId === '' || topicId.test(entry.articleId)) ? entry.articleId : '';
      clean.lessonProgress[lid] = {
        learned: entry.learned,
        studyDate: entry.learned ? (studyDate || localDateKey()) : '',
        updatedAt: date(typeof entry.updatedAt === 'string' ? entry.updatedAt : ''),
        articleId
      };
    }
  }
  clean.dailyLog = recomputeDailyLog(clean.lessonProgress);
  if (input.dailyLog !== undefined && object(input.dailyLog)) {
    for (const [day, count] of Object.entries(input.dailyLog)) {
      if (dayKey.test(day) && Number.isInteger(count) && count >= 0 && count <= 2000 && !Object.hasOwn(clean.dailyLog, day) && count > 0) {
        clean.dailyLog[day] = count;
      }
    }
  }
  if (input.notes.length > 40) throw new Error('最多保存 40 篇本地笔记。');
  const ids = new Set();
  for (const note of input.notes) {
    if (!object(note) || typeof note.id !== 'string' || !/^[a-z0-9-]{1,64}$/.test(note.id) || ids.has(note.id)) throw new Error('笔记编号无效或重复。');
    if (!Array.isArray(note.tags) || note.tags.length > 10) throw new Error('每篇笔记最多 10 个标签。');
    ids.add(note.id);
    clean.notes.push({
      id: note.id, title: short(note.title, 120, '笔记标题'), source: short(note.source, 240, '笔记来源'),
      body: short(note.body, 24000, '笔记正文'), tags: note.tags.map(value => short(value, 32, '笔记标签')),
      related: note.related === '' ? '' : topic(note.related), addedAt: date(note.addedAt)
    });
  }
  return clean;
}
export function parseBackup(raw) {
  if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('备份超过 1.5 MB，请减少笔记或记录体积。');
  let input;
  try { input = JSON.parse(raw.replace(/^\uFEFF/, '')); } catch { throw new Error('无法读取 JSON 备份。'); }
  return validate(input);
}
export function loadState(storage) {
  const raw = storage.getItem(storageKey);
  return raw === null ? emptyState() : parseBackup(raw);
}
export function saveState(storage, state) {
  const raw = JSON.stringify(validate(state));
  if (new TextEncoder().encode(raw).length > maxBytes) throw new Error('数据超过 1.5 MB，请先导出备份，再减少保存的数据。');
  storage.setItem(storageKey, raw);
}
export function replaceState(storage, next) {
  const clean = parseBackup(JSON.stringify(next));
  const current = storage.getItem(storageKey);
  storage.setItem(previousKey, current ?? JSON.stringify(emptyState()));
  saveState(storage, clean);
  return clean;
}
export function restorePrevious(storage) {
  const raw = storage.getItem(previousKey);
  if (raw === null) throw new Error('没有替换前的快照。');
  // A previous corrupt record stays preserved until a verified import succeeds.
  return replaceState(storage, parseBackup(raw));
}
export function applyStudyProgress(state, { lessonIds = [], articleId = '', learned = true, studyDate = localDateKey(), now = new Date().toISOString() }) {
  for (const lid of lessonIds) {
    if (!lessonCode.test(lid)) continue;
    state.lessonProgress[lid] = {
      learned: Boolean(learned),
      studyDate: learned ? studyDate : '',
      updatedAt: now,
      articleId: articleId && topicId.test(articleId) ? articleId : (state.lessonProgress[lid]?.articleId || '')
    };
  }
  if (articleId && topicId.test(articleId)) {
    state.records[articleId] = {
      status: learned ? 'passed' : 'unread',
      review: false,
      evidence: learned ? '已学习' : '',
      blocker: '',
      updatedAt: now,
      reviewedAt: learned ? now : ''
    };
  }
  state.dailyLog = recomputeDailyLog(state.lessonProgress);
  return state;
}
export function reviewText(state, chosen, withProfile) {
  const lines = ['# C++ 学习复盘', '', '请根据证据区分读过、动手和通过验收。指出最值得动手补强的一项，给出验收步骤和调整原因。'];
  if (withProfile) {
    lines.push('', '## 学习档案');
    for (const [key, label] of Object.entries(profileFields)) if (state.profile[key].trim()) lines.push(`- ${label}：${state.profile[key]}`);
  }
  if (chosen.length) lines.push('', '## 已选记录');
  for (const { id, title } of chosen) {
    const item = state.records[id];
    if (!item) continue;
    lines.push('', `### ${title}`, `- 状态：${statusLabels[item.status]}${item.review ? ' · 需要复习' : ''}`);
    if (item.evidence) lines.push(`- 依据：${item.evidence}`);
    if (item.blocker) lines.push(`- 卡点：${item.blocker}`);
    if (item.reviewedAt) lines.push(`- 上次复习：${item.reviewedAt.slice(0, 10)}`);
  }
  return lines.join('\n') + '\n';
}
