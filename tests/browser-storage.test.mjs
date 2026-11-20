import { test } from 'node:test';
import assert from 'node:assert/strict';
import { state, update, setStudyProgress, syncFromServer, replaceAndSync, pushStateToServer } from '../src/scripts/browser-state.mjs';

test('the public site keeps progress and restored backups in the browser without API requests', async () => {
  const values = new Map();
  const localStorage = { getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value) };
  const window = new EventTarget();
  window.localStorage = localStorage;
  let requests = 0;
  const originals = { window: globalThis.window, document: globalThis.document, fetch: globalThis.fetch };
  globalThis.window = window;
  globalThis.document = { body: { dataset: { base: '/Study_Site/', storageMode: 'browser' } } };
  globalThis.fetch = async () => { requests++; return { ok: false }; };
  try {
    assert.equal((await syncFromServer()).synced, false);
    update(data => { data.profile.weeklyFocus = '完成第一个程序'; });
    assert.equal((await setStudyProgress({ lessonIds: ['CPP-01'], articleId: 'handbook/cpp-setup' })).ok, true);
    assert.equal(state().lessonProgress['CPP-01'].learned, true);
    const backup = state();
    await setStudyProgress({ lessonIds: ['CPP-01'], learned: false });
    await replaceAndSync(backup);
    assert.equal(state().lessonProgress['CPP-01'].learned, true);
    assert.equal(state().profile.weeklyFocus, '完成第一个程序');
    assert.equal(await pushStateToServer(state()), false);
    assert.equal(requests, 0);
  } finally {
    Object.assign(globalThis, originals);
  }
});
