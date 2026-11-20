import { articles, href } from '../lib/catalog.mjs';
import { fullCurriculum } from '../lib/full-curriculum.mjs';

export async function GET() {
  const articleMap = new Map();
  const headingEntries = new Map();
  const firstHeadingMap = new Map();

  for (const item of articles) {
    articleMap.set(item.id, item);
    try {
      const headings = await item.page.getHeadings();
      const idSlugMap = new Map();
      for (const h of headings) {
        for (const m of h.text.matchAll(/\b([A-Z]{2,5}-\d{2})\b/g)) {
          if (!idSlugMap.has(m[1])) idSlugMap.set(m[1], h.slug);
        }
      }
      headingEntries.set(item.id, idSlugMap);
      const firstH = headings.find(h => h.depth === 2) ?? headings[0];
      if (firstH?.slug) firstHeadingMap.set(item.id, firstH.slug);
    } catch {
      headingEntries.set(item.id, new Map());
    }
  }

  const pageEntries = articles.map(({ id, url, group, page, meta }) => ({
    id,
    url,
    group,
    title: meta.title,
    description: meta.description,
    tags: meta.tags ?? [],
    body: page.rawContent().replace(/<details[\s\S]*?<\/details>/gi, '').replace(/\{\{example:[^}]*\}\}/g, '')
  }));

  const lessonEntries = [];
  for (const subject of fullCurriculum) {
    for (const part of subject.parts) {
      for (const mod of part.modules) {
        for (const lesson of mod.lessons) {
          const primaryRef = lesson.readings[0]?.ref;
          const article = primaryRef ? articleMap.get(primaryRef) : undefined;
          const baseUrl = article?.url ?? href('handbook/');
          const slug = primaryRef
            ? (headingEntries.get(primaryRef)?.get(lesson.id) ?? firstHeadingMap.get(primaryRef))
            : undefined;
          const url = slug ? `${baseUrl}#${encodeURIComponent(slug)}` : baseUrl;
          lessonEntries.push({
            id: `lesson:${lesson.id}`,
            url,
            group: `${subject.title} · 小节直达`,
            title: `${lesson.id} ${lesson.title}`,
            description: lesson.topics.slice(0, 3).join(' · ') || `${subject.title} · ${mod.title}`,
            tags: [lesson.id, subject.title, mod.title],
            body: lesson.topics.join(' ')
          });
        }
      }
    }
  }

  return Response.json([...pageEntries, ...lessonEntries]);
}
