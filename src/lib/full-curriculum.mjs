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

export const subjectEntryMap = {
  cpp: 'handbook/cpp-setup',
  engineering: 'handbook/eng-zero-start',
  algorithms: 'handbook/algo-zero-start',
  machine: 'handbook/mach-zero-start',
  os: 'handbook/os-zero-start',
  linux: 'handbook/linux-zero-start',
  network: 'handbook/net-zero-start',
  concurrency: 'handbook/con-zero-start',
  storage: 'handbook/db-zero-start',
  tracks: 'handbook/track-zero-start',
};

// The curriculum Markdown owns the hierarchy, reading links and prerequisites.
// Numbered items following 小节 supply each chapter's learning topics.
function readSubject(source, slug, title) {
  const parts = [];
  let part, module, lesson, readingTopics = false;
  for (const line of source.split(/\r?\n/)) {
    const heading = line.match(/^(#{2,4}) (.+)$/);
    if (heading) {
      readingTopics = false;
      const [, level, label] = heading;
      if (level === '##') {
        lesson = undefined;
        part = { title: label, modules: [] };
        parts.push(part);
      } else if (level === '###') {
        lesson = undefined;
        module = { title: label, lessons: [] };
        part.modules.push(module);
      } else {
        const [id, ...words] = label.split(' ');
        lesson = { id, title: words.join(' '), status: '', topics: [], readings: [], requires: [], question: '', ability: '' };
        module.lessons.push(lesson);
      }
      continue;
    }
    if (lesson && line.startsWith('- 先修：')) lesson.requires = [...new Set(line.match(/[A-Z]{2,5}-\d{2}/g) ?? [])];
    if (lesson && line.startsWith('- 问题：')) lesson.question = line.slice('- 问题：'.length);
    if (lesson && line.startsWith('- 能力：')) lesson.ability = line.slice('- 能力：'.length);
    if (line.startsWith('- 状态：')) {
      const status = line.slice('- 状态：'.length);
      lesson.status = status.startsWith('已有')
        ? (status.includes('/labs/') ? '已有实验' : '已有正文')
        : status.startsWith('部分覆盖') ? '部分覆盖' : '待编写';
      const seen = new Set();
      for (const [, label, ref] of status.matchAll(/\[([^\]]+)\]\(\.\.\/\.\.\/src\/content\/((?:handbook|labs|notes)\/[a-z0-9-]+)\.md(?:#[^)]*)?\)/g)) {
        if (seen.has(ref)) continue;
        lesson.readings.push({ label, ref });
        seen.add(ref);
      }
    }
    if (line.startsWith('- ')) readingTopics = line.startsWith('- 小节');
    const topic = readingTopics && line.match(/^\s+\d+\. (.+)$/);
    if (topic) lesson.topics.push(topic[1].replaceAll('`', ''));
  }
  return { slug, title, entryRef: subjectEntryMap[slug], parts: parts.filter(part => part.modules.length) };
}

export const fullCurriculum = subjects.map(([slug, title]) =>
  readSubject(documents[`../../docs/curriculum/${slug}.md`], slug, title)
);

export function findSubjectForArticle(articleId) {
  if (!articleId) return undefined;
  const primary = fullCurriculum.find(subject =>
    subject.parts.some(part => part.modules.some(mod => mod.lessons.some(lesson => lesson.readings[0]?.ref === articleId)))
  );
  if (primary) return primary;
  return fullCurriculum.find(subject =>
    subject.parts.some(part => part.modules.some(mod => mod.lessons.some(lesson => lesson.readings.some(r => r.ref === articleId))))
  );
}
