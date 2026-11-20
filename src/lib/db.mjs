import { DatabaseSync } from 'node:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { emptyState, parseBackup, applyStudyProgress, recomputeDailyLog } from './state.mjs';

let cachedDb;
let cachedPath;

export function resolveDbPath() {
  return process.env.STUDY_DB_PATH || path.join(process.cwd(), 'data', 'study-progress.db');
}

export function getDb(dbPath = resolveDbPath()) {
  if (cachedDb && cachedPath === dbPath) return cachedDb;
  if (dbPath !== ':memory:') {
    mkdirSync(path.dirname(dbPath), { recursive: true });
  }
  const db = new DatabaseSync(dbPath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA synchronous = NORMAL;
    CREATE TABLE IF NOT EXISTS kv_state (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS lesson_progress (
      lesson_id TEXT PRIMARY KEY,
      article_id TEXT NOT NULL DEFAULT '',
      learned INTEGER NOT NULL DEFAULT 0,
      study_date TEXT NOT NULL DEFAULT '',
      updated_at TEXT NOT NULL
    );
    CREATE TABLE IF NOT EXISTS daily_activity (
      study_date TEXT PRIMARY KEY,
      learned_count INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL
    );
  `);
  cachedDb = db;
  cachedPath = dbPath;
  return db;
}

export function resetDbForTests() {
  if (cachedDb) {
    try { cachedDb.close(); } catch {}
  }
  cachedDb = undefined;
  cachedPath = undefined;
}

function syncRelationalTables(db, state, now) {
  db.exec('DELETE FROM lesson_progress; DELETE FROM daily_activity;');
  const insertLesson = db.prepare(`
    INSERT INTO lesson_progress (lesson_id, article_id, learned, study_date, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `);
  for (const [lessonId, entry] of Object.entries(state.lessonProgress || {})) {
    insertLesson.run(
      lessonId,
      entry.articleId || '',
      entry.learned ? 1 : 0,
      entry.studyDate || '',
      entry.updatedAt || now
    );
  }
  const insertDaily = db.prepare(`
    INSERT INTO daily_activity (study_date, learned_count, updated_at)
    VALUES (?, ?, ?)
  `);
  const counts = recomputeDailyLog(state.lessonProgress);
  for (const [day, count] of Object.entries(counts)) {
    insertDaily.run(day, count, now);
  }
}

export function readDbState(dbPath = resolveDbPath()) {
  const db = getDb(dbPath);
  const row = db.prepare('SELECT value FROM kv_state WHERE key = ?').get('main');
  if (!row) return emptyState();
  try {
    return parseBackup(row.value);
  } catch {
    return emptyState();
  }
}

export function writeDbState(nextState, dbPath = resolveDbPath()) {
  const db = getDb(dbPath);
  const clean = parseBackup(JSON.stringify(nextState));
  const now = new Date().toISOString();
  const raw = JSON.stringify(clean);
  db.exec('BEGIN');
  try {
    db.prepare(`
      INSERT INTO kv_state (key, value, updated_at)
      VALUES (?, ?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at
    `).run('main', raw, now);
    syncRelationalTables(db, clean, now);
    db.exec('COMMIT');
  } catch (err) {
    try { db.exec('ROLLBACK'); } catch {}
    throw err;
  }
  return clean;
}

export function updateDbProgress(payload, dbPath = resolveDbPath()) {
  const current = readDbState(dbPath);
  applyStudyProgress(current, payload);
  return writeDbState(current, dbPath);
}

export function getDbStats(dbPath = resolveDbPath()) {
  const db = getDb(dbPath);
  const learnedRow = db.prepare('SELECT COUNT(*) AS cnt FROM lesson_progress WHERE learned = 1').get();
  const dailyRows = db.prepare('SELECT study_date, learned_count FROM daily_activity ORDER BY study_date ASC').all();
  return {
    dbPath,
    learnedCount: learnedRow?.cnt ?? 0,
    daily: dailyRows.map(r => ({ date: r.study_date, count: r.learned_count }))
  };
}
