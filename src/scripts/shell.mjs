import { state, message, copy, update } from './browser-state.mjs';

function revealHashTarget() {
  let id;
  try { id = decodeURIComponent(location.hash.slice(1)); } catch { return; }
  const target = document.getElementById(id);
  let disclosure = target?.closest('details[data-hash-reveal]');
  let opened = false;
  while (disclosure) {
    if (!disclosure.open) {
      disclosure.open = true;
      opened = true;
    }
    disclosure = disclosure.parentElement.closest('details[data-hash-reveal]');
  }
  if (opened) target.scrollIntoView({ block: 'start' });
}
revealHashTarget();
window.addEventListener('hashchange', revealHashTarget);

const theme = document.querySelector('#theme-toggle');
function syncTheme() {
  const dark = document.documentElement.dataset.theme === 'dark';
  theme.setAttribute('aria-label', dark ? '切换浅色模式' : '切换深色模式');
  theme.title = theme.getAttribute('aria-label');
}
syncTheme();
theme.addEventListener('click', () => {
  const usingDark = document.documentElement.dataset.theme === 'dark';
  document.documentElement.dataset.theme = usingDark ? 'light' : 'dark';
  try { localStorage.setItem('cpp-study.theme', usingDark ? 'light' : 'dark'); } catch {}
  syncTheme();
});

const navToggle = document.querySelector('#nav-toggle');
function toggleNav(open, returnFocus = false) {
  document.body.classList.toggle('nav-open', open);
  navToggle.setAttribute('aria-expanded', String(open));
  navToggle.setAttribute('aria-label', open ? '收起主菜单' : '展开主菜单');
  if (returnFocus) navToggle.focus();
}
navToggle.addEventListener('click', () => toggleNav(!document.body.classList.contains('nav-open')));
document.querySelector('#main').addEventListener('click', () => toggleNav(false));
document.querySelector('#sidebar').addEventListener('click', e => {
  if (e.target.closest('a')) toggleNav(false);
});

const dialog = document.querySelector('#search-dialog');
const query = document.querySelector('#query');
const result = document.querySelector('#search-result');
let indexPromise;
let revision = 0;
const index = () => indexPromise ??= fetch(document.body.dataset.search).then(r => {
  if (!r.ok) throw new Error('index');
  return r.json();
}).catch(e => { indexPromise = undefined; throw e; });

function openSearch() {
  if (dialog.open) return;
  query.value = '';
  result.textContent = '输入关键词，例如「生命周期」「RAII」「日志」。';
  dialog.showModal();
  query.focus();
}
document.querySelector('#search-open').addEventListener('click', openSearch);
document.querySelector('#search-close').addEventListener('click', () => dialog.close());
dialog.addEventListener('click', e => { if (e.target === dialog) dialog.close(); });
document.addEventListener('keydown', e => {
  if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'k') { e.preventDefault(); openSearch(); }
  if (e.key === 'Escape' && !dialog.open && document.body.classList.contains('nav-open')) toggleNav(false, true);
});

const normalize = s => s.normalize('NFKC').toLowerCase();
function matchScore(item, terms) {
  const title = normalize(item.title);
  const meta = normalize(item.description + ' ' + item.tags.join(' '));
  const body = normalize(item.body);
  const scores = terms.map(term => title.includes(term) ? 12 : meta.includes(term) ? 5 : body.includes(term) ? 1 : 0);
  return scores.every(Boolean) ? scores.reduce((sum, n) => sum + n, 0) : 0;
}
query.addEventListener('keydown', e => {
  if (e.key === 'ArrowDown') { e.preventDefault(); result.querySelector('a')?.focus(); }
  if (e.key === 'Enter') result.querySelector('a')?.click();
});
result.addEventListener('keydown', e => {
  if (!['ArrowDown', 'ArrowUp'].includes(e.key)) return;
  e.preventDefault();
  const links = [...result.querySelectorAll('a')];
  links[links.indexOf(document.activeElement) + (e.key === 'ArrowDown' ? 1 : -1)]?.focus();
  if (e.key === 'ArrowUp' && document.activeElement === links[0] && e.target === links[0]) query.focus();
});
query.addEventListener('input', async () => {
  const turn = ++revision;
  const terms = normalize(query.value).trim().split(/\s+/).filter(Boolean).slice(0, 8);
  if (!terms.length) { result.textContent = '输入关键词以搜索。'; return; }
  result.textContent = '正在查找…';
  try {
    const publicIndex = await index();
    if (turn !== revision || !dialog.open) return;
    // Search private notes only in this browser.
    const notes = state().notes.map(n => ({ ...n, description: '来源：' + n.source, group: '我的笔记', url: new URL('notes/#private-' + n.id, new URL(document.body.dataset.search, location.href)).href }));
    const matches = [...publicIndex, ...notes].map(item => ({ item, score: matchScore(item, terms) })).filter(x => x.score > 0).sort((a, b) => b.score - a.score).slice(0, 12);
    result.replaceChildren();
    if (!matches.length) { result.textContent = '没有找到。试试去掉一个词，或搜索术语的英文名。'; return; }
    for (const { item } of matches) {
      const a = Object.assign(document.createElement('a'), { href: item.url, className: 'result-link' });
      const group = Object.assign(document.createElement('small'), { textContent: item.group });
      const title = Object.assign(document.createElement('strong'), { textContent: item.title });
      const description = Object.assign(document.createElement('span'), { textContent: item.description });
      a.append(group, title, description);
      a.addEventListener('click', () => dialog.close());
      result.append(a);
    }
  } catch { if (turn === revision) result.textContent = '搜索索引加载失败。确认本地站点仍在运行后重试。'; }
});

for (const pre of document.querySelectorAll('.prose pre')) {
  const code = pre.querySelector('code');
  if (!code) continue;
  const wrapper = document.createElement('div');
  wrapper.className = 'code-block';
  const bar = document.createElement('div');
  bar.className = 'code-bar';
  const language = document.createElement('span');
  language.textContent = ({ cpp: 'C++', powershell: 'PowerShell', bash: 'Shell', text: '示例输出' })[pre.dataset.language] ?? pre.dataset.language ?? '代码';
  const button = Object.assign(document.createElement('button'), { type: 'button', textContent: '复制代码' });
  button.addEventListener('click', async () => {
    if (await copy(code.textContent)) {
      button.textContent = '已复制';
      setTimeout(() => { button.textContent = '复制代码'; }, 1300);
    } else message('无法访问剪贴板，请选中代码手动复制。');
  });
  bar.append(language, button);
  pre.before(wrapper);
  wrapper.append(bar, pre);
}

const article = document.querySelector('[data-track-article]');
if (article) {
  const id = article.dataset.trackArticle;
  function remember(anchor) {
    const current = state().current;
    if (current?.id === id && current.anchor === anchor) return;
    update(s => { s.current = { id, anchor }; });
  }
  const hash = () => { try { return decodeURIComponent(location.hash.slice(1)); } catch { return ''; } };
  const headings = [...article.querySelectorAll('.prose h2[id], .prose h3[id], #vector-lab, #practice-record')];
  const outline = [...document.querySelectorAll('[data-outline] a')];
  function highlight(anchor) {
    outline.forEach(link => {
      const active = decodeURIComponent(link.hash.slice(1)) === anchor;
      if (active) link.setAttribute('aria-current', 'location');
      else link.removeAttribute('aria-current');
    });
  }
  remember(hash().slice(0, 240));
  highlight(hash());
  let scrollTimer;
  window.addEventListener('scroll', () => {
    clearTimeout(scrollTimer);
    scrollTimer = setTimeout(() => {
      const anchor = headings.findLast(h => h.getBoundingClientRect().top <= 135)?.id ?? '';
      highlight(anchor);
      remember(anchor.slice(0, 240));
    }, 220);
  }, { passive: true });
  window.addEventListener('hashchange', () => remember(hash().slice(0, 240)));
}
