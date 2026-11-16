import { modules } from '../data/curriculum.mjs';

const files = import.meta.glob('../content/*/*.md', { eager: true });
export const href = path => import.meta.env.BASE_URL.replace(/\/$/, '') + '/' + path.replace(/^\//, '');
const groups = { handbook: '知识手册', labs: '项目实验室', notes: '笔记与博客' };
export const articles = Object.entries(files).map(([file, page]) => {
  const id = file.split('/').slice(-2).join('/').slice(0, -3);
  const [section, slug] = id.split('/');
  const meta = page.frontmatter;
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) || !groups[section] || !meta.title || !meta.description) {
    throw new Error('Invalid article metadata: ' + file);
  }
  return { id, section, slug, group: groups[section], meta, page, url: href(id + '/') };
}).sort((a, b) => (a.meta.order ?? 999) - (b.meta.order ?? 999) || a.id.localeCompare(b.id));
export const byId = new Map(articles.map(item => [item.id, item]));
export const published = section => articles.filter(item => item.section === section);
export const findModule = slug => modules.find(module => module.chapters.some(chapter => chapter.id === slug));
export const chapterArticle = chapter => byId.get(chapter.ref ?? 'handbook/' + chapter.id);
export const itemList = () => articles.map(item => ({ id: item.id, title: item.meta.title, url: item.url, group: item.group, trackable: item.section !== 'notes' }));
