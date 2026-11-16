import { emptyState, loadState, saveState } from '../lib/state.mjs';
export const storage = () => window.localStorage;
let timer;
export function message(text) {
  const output = document.getElementById('site-message');
  if (!output) return;
  output.textContent = text;
  output.hidden = false;
  clearTimeout(timer);
  timer = setTimeout(() => { output.hidden = true; }, 4400);
}
export function state() {
  try { return loadState(storage()); }
  catch { return emptyState(); }
}
export function update(edit) {
  try {
    const data = loadState(storage());
    edit(data);
    saveState(storage(), data);
    return data;
  } catch (error) {
    message('没有保存。' + (error.name === 'QuotaExceededError' ? ' 浏览器存储空间不足，请导出备份并减少数据。' : ' ' + error.message));
    return null;
  }
}
export function download(name, text, type) {
  const file = URL.createObjectURL(new Blob([text], { type }));
  const link = Object.assign(document.createElement('a'), { href: file, download: name });
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(file), 1000);
}
export async function copy(text, field) {
  try { await navigator.clipboard.writeText(text); return true; }
  catch {
    field?.focus();
    field?.select();
    return false;
  }
}
