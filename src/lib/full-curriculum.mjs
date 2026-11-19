const documents = import.meta.glob('../../docs/curriculum/*.md', {
  eager: true,
  query: '?raw',
  import: 'default',
});

const subjects = [
  ['cpp', '现代 C++'],
  ['engineering', '工程工具链'],
  ['algorithms', '数据结构与算法'],
  ['machine', '计算机组成'],
  ['os', '操作系统'],
  ['linux', 'Linux 实践'],
  ['network', '计算机网络'],
  ['concurrency', '并发与性能'],
  ['storage', '存储与数据库'],
  ['tracks', '方向选修'],
];

// The curriculum Markdown owns the hierarchy. The sidebar reads only headings,
// status, and the numbered list following each chapter's 小节 label.
function readSubject(source, title) {
  const parts = [];
  let part, module, lesson, readingTopics = false;
  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^(#{2,4}) (.+)$/);
    if (heading) {
      readingTopics = false;
      const [, level, label] = heading;
      if (level === '##') {
        part = { title: label, modules: [] };
        parts.push(part);
      } else if (level === '###') {
        module = { title: label, lessons: [] };
        part.modules.push(module);
      } else {
        const [id, ...words] = label.split(' ');
        lesson = { id, title: words.join(' '), status: '', topics: [], readings: [] };
        module.lessons.push(lesson);
      }
      continue;
    }
    if (line.startsWith('- 状态：')) {
      const status = line.slice('- 状态：'.length);
      lesson.status = status.startsWith('已有')
        ? (status.includes('/labs/') ? '已有实验' : '已有正文')
        : status.startsWith('部分覆盖') ? '部分覆盖' : '待编写';
      const seen = new Set();
      for (const [, label, ref] of status.matchAll(/\[([^\]]+)\]\(\.\.\/\.\.\/src\/content\/((?:handbook|labs|notes)\/[a-z0-9-]+)\.md\)/g)) {
        if (seen.has(ref)) continue;
        lesson.readings.push({ label, ref });
        seen.add(ref);
      }
    }
    if (line.startsWith('- ')) readingTopics = line.startsWith('- 小节');
    const topic = readingTopics && line.match(/^\s+\d+\. (.+)$/);
    if (topic) lesson.topics.push(topic[1].replaceAll('`', ''));
  }
  return { title, parts: parts.filter(part => part.modules.length) };
}

export const fullCurriculum = subjects.map(([slug, title]) =>
  readSubject(documents[`../../docs/curriculum/${slug}.md`], title)
);
