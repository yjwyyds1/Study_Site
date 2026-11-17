import { articles } from '../lib/catalog.mjs';

export function GET() {
  const entries = articles.map(({ id, url, group, page, meta }) => ({
    id, url, group, title: meta.title, description: meta.description, tags: meta.tags ?? [],
    body: page.rawContent().replace(/<details[\s\S]*?<\/details>/gi, '').replace(/\{\{example:[^}]*\}\}/g, '').slice(0, 18000)
  }));
  return Response.json(entries);
}
