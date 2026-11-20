import {
  emptyState,
  loadState,
  saveState,
  applyStudyProgress,
  localDateKey,
  replaceState
} from '../lib/state.mjs';

export const storage = () => window.localStorage;
export const isBrowserOnly = () => document.body?.dataset.storageMode === 'browser';
let timer;
let dbSynced = false;
let inFlightSync = null;

function apiEndpoint(path) {
  const base = document.body?.dataset.base ?? '/';
  const normalized = base.endsWith('/') ? base : base + '/';
  return normalized + path.replace(/^\//, '');
}

function emitChange(data, source = 'local') {
  window.dispatchEvent(new CustomEvent('study-state:change', { detail: { state: data, source } }));
}

function hasMeaningfulData(data) {
  if (!data) return false;
  if (data.current) return true;
  if (Object.keys(data.lessonProgress || {}).length > 0) return true;
  if (Object.keys(data.records || {}).length > 0) return true;
  if ((data.notes || []).length > 0) return true;
  return Object.values(data.profile || {}).some(v => typeof v === 'string' && v.trim() !== '');
}

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

export function isDbConnected() {
  return dbSynced;
}

export async function pushStateToServer(data) {
  if (isBrowserOnly()) return false;
  try {
    const res = await fetch(apiEndpoint('api/state'), {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state: data }),
      keepalive: true
    });
    if (res.ok) dbSynced = true;
    return res.ok;
  } catch {
    return false;
  }
}

export function update(edit) {
  try {
    const data = loadState(storage());
    edit(data);
    saveState(storage(), data);
    emitChange(data, 'local');
    if (dbSynced) {
      void pushStateToServer(data);
    } else {
      void syncFromServer().then(res => {
        if (!res.synced) return;
        const fresh = loadState(storage());
        edit(fresh);
        saveState(storage(), fresh);
        emitChange(fresh, 'db');
        return pushStateToServer(fresh);
      });
    }
    return data;
  } catch (error) {
    message('没有保存。' + (error.name === 'QuotaExceededError' ? ' 浏览器存储空间不足，请导出备份并减少数据。' : ' ' + error.message));
    return null;
  }
}

export async function setStudyProgress({ lessonIds = [], articleId = '', learned = true }) {
  const studyDate = localDateKey();
  const now = new Date().toISOString();
  let nextData;
  try {
    const data = loadState(storage());
    applyStudyProgress(data, { lessonIds, articleId, learned, studyDate, now });
    saveState(storage(), data);
    nextData = data;
    emitChange(nextData, 'local');
  } catch (error) {
    message('保存失败：' + error.message);
    return { ok: false, state: null, syncedDb: false };
  }

  let syncedDb = false;
  if (isBrowserOnly()) return { ok: true, state: nextData, syncedDb };
  try {
    const res = await fetch(apiEndpoint('api/progress'), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ lessonIds, articleId, learned, studyDate }),
      keepalive: true
    });
    if (res.ok) {
      const payload = await res.json();
      if (payload?.ok && payload.state) {
        saveState(storage(), payload.state);
        nextData = payload.state;
        dbSynced = true;
        syncedDb = true;
        emitChange(nextData, 'db');
      }
    }
  } catch {}
  return { ok: true, state: nextData, syncedDb };
}

export async function replaceAndSync(next) {
  const clean = replaceState(storage(), next);
  emitChange(clean, 'local');
  const ok = await pushStateToServer(clean);
  return { state: clean, syncedDb: ok };
}

export function syncFromServer() {
  if (isBrowserOnly()) return Promise.resolve({ synced: false, state: state() });
  if (inFlightSync) return inFlightSync;
  inFlightSync = (async () => {
    try {
      const res = await fetch(apiEndpoint('api/state'), { cache: 'no-store' });
      if (!res.ok) return { synced: false, state: state() };
      const payload = await res.json();
      if (!payload?.ok || !payload.state) return { synced: false, state: state() };
      dbSynced = true;
      const local = state();
      if (hasMeaningfulData(payload.state)) {
        saveState(storage(), payload.state);
        emitChange(payload.state, 'db');
        return { synced: true, state: payload.state, meta: payload.meta };
      }
      if (hasMeaningfulData(local)) {
        await pushStateToServer(local);
        emitChange(local, 'db');
        return { synced: true, state: local, meta: payload.meta };
      }
      emitChange(payload.state, 'db');
      return { synced: true, state: payload.state, meta: payload.meta };
    } catch {
      return { synced: false, state: state() };
    } finally {
      inFlightSync = null;
    }
  })();
  return inFlightSync;
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
