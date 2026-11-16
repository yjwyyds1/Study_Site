import { articles, href, chapterArticle } from '../lib/catalog.mjs';
import { modules } from '../data/curriculum.mjs';

export function GET() {
  const entries = articles.map(({ id, url, group, page, meta }) => ({
    id, url, group, title: meta.title, description: meta.description, tags: meta.tags ?? [],
    body: page.rawContent().replace(/<details[\s\S]*?<\/details>/gi, '').replace(/\{\{example:[^}]*\}\}/g, '').slice(0, 18000)
  }));
  for (const module of modules) {
    for (const chapter of module.chapters.filter(ch => !chapterArticle(ch))) {
      entries.push({ id: module.id + ':' + chapter.title, url: href('handbook/#' + module.id), group: '知识地图 · 待编写', title: chapter.title, description: chapter.description, tags: [module.title], body: '' });
    }
  }
  return Response.json(entries);
}
