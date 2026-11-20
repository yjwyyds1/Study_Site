import { test } from 'node:test';
import assert from 'node:assert/strict';
import os from 'node:os';
import path from 'node:path';
import { rmSync } from 'node:fs';
import { emptyState, loadState, saveState, parseBackup, replaceState, restorePrevious, reviewText, applyStudyProgress } from '../src/lib/state.mjs';
import { readDbState, writeDbState, updateDbProgress, getDbStats, resetDbForTests } from '../src/lib/db.mjs';

const memory = () => {
  const data = new Map();
  return { getItem: k => data.get(k) ?? null, setItem: (k, v) => data.set(k, v), removeItem: k => data.delete(k) };
};
const filled = () => {
  const state = emptyState();
  state.current = { id: 'handbook/lifetime', anchor: '观察' };
  state.profile.weeklyFocus = '先实测';
  state.records['handbook/lifetime'] = {
    status: 'practiced', review: true, evidence: '运行了两种追加情况', blocker: '解释失效',
    updatedAt: '2026-11-17T03:00:00.000Z', reviewedAt: ''
  };
  state.notes.push({ id: 'note-1', title: '记录', source: 'example.md', body: '# 保留原文', tags: ['RAII'], related: 'handbook/lifetime', addedAt: '2026-11-17T03:00:00.000Z' });
  return state;
};

test('a reload and a backup round trip keep the reading location, practice evidence and note', () => {
  const storage = memory();
  const state = filled();
  saveState(storage, state);
  assert.deepEqual(loadState(storage), state);
  assert.deepEqual(parseBackup(JSON.stringify(state)), state);
});
test('unknown versions, malformed statuses, path injection and empty passed evidence are rejected', () => {
  const state = filled();
  assert.throws(() => parseBackup(JSON.stringify({ ...state, version: 2 })), /版本/);
  assert.throws(() => parseBackup('not json'), /JSON/);
  assert.throws(() => parseBackup(JSON.stringify({ ...state, current: { id: '//evil.net', anchor: '' } })), /章节/);
  state.records['handbook/lifetime'].status = 'absolutely-mastered';
  assert.throws(() => parseBackup(JSON.stringify(state)), /状态/);
  state.records['handbook/lifetime'].status = 'passed';
  state.records['handbook/lifetime'].evidence = ' ';
  assert.throws(() => parseBackup(JSON.stringify(state)), /验收依据/);
});
test('replace keeps the preceding backup and can restore it', () => {
  const storage = memory();
  const state = filled();
  saveState(storage, state);
  assert.throws(() => replaceState(storage, { version: 2 }), /版本/);
  assert.deepEqual(loadState(storage), state);
  replaceState(storage, emptyState());
  assert.deepEqual(loadState(storage), emptyState());
  assert.deepEqual(restorePrevious(storage), state);
  assert.deepEqual(loadState(storage), state);
});
test('a review export only includes selected evidence and omits private notes', () => {
  const state = filled();
  assert.doesNotMatch(reviewText(state, [], false), /两种追加情况|保留原文|先实测/);
  assert.match(reviewText(state, [{ id: 'handbook/lifetime', title: '对象生命周期' }], true), /对象生命周期[\s\S]*两种追加情况/);
  assert.doesNotMatch(reviewText(state, [], true), /保留原文/);
});

test('sqlite database persists learned/unlearned progress and daily activity counts', () => {
  const tempDb = path.join(os.tmpdir(), `study-test-${Date.now()}.db`);
  try {
    resetDbForTests();
    const s = emptyState();
    applyStudyProgress(s, { lessonIds: ['CPP-01', 'CPP-02'], articleId: 'handbook/cpp-setup', learned: true, studyDate: '2026-11-20' });
    writeDbState(s, tempDb);

    resetDbForTests();
    const loaded = readDbState(tempDb);
    assert.equal(loaded.lessonProgress['CPP-01'].learned, true);
    assert.equal(loaded.lessonProgress['CPP-02'].studyDate, '2026-11-20');
    assert.equal(loaded.dailyLog['2026-11-20'], 2);

    const updated = updateDbProgress({ lessonIds: ['CPP-02'], articleId: '', learned: false }, tempDb);
    assert.equal(updated.lessonProgress['CPP-02'].learned, false);
    assert.equal(updated.dailyLog['2026-11-20'], 1);

    const stats = getDbStats(tempDb);
    assert.equal(stats.learnedCount, 1);
    assert.deepEqual(stats.daily, [{ date: '2026-11-20', count: 1 }]);
  } finally {
    resetDbForTests();
    for (const suffix of ['', '-wal', '-shm']) {
      try { rmSync(tempDb + suffix, { force: true }); } catch {}
    }
  }
});
