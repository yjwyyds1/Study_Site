import { readDbState, writeDbState, updateDbProgress, getDbStats } from './db.mjs';

function sendJson(res, status, data) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(data));
}

function readBody(req, limit = 1_600_000) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', chunk => {
      size += chunk.length;
      if (size > limit) {
        reject(new Error('请求体过大'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    req.on('error', reject);
  });
}

export function createStudyApiMiddleware(base = '/') {
  const prefix = base.replace(/\/$/, '');
  const statePath = `${prefix}/api/state`;
  const progressPath = `${prefix}/api/progress`;
  const healthPath = `${prefix}/api/health`;

  return async function studyApiMiddleware(req, res, next) {
    const rawUrl = (req.url || '/').split('?')[0];
    const urlPath = rawUrl.length > 1 ? rawUrl.replace(/\/$/, '') : rawUrl;
    if (urlPath !== statePath && urlPath !== progressPath && urlPath !== healthPath) {
      return next();
    }

    try {
      if (urlPath === healthPath && req.method === 'GET') {
        return sendJson(res, 200, { ok: true, engine: 'node:sqlite', ...getDbStats() });
      }
      if (urlPath === statePath && req.method === 'GET') {
        const state = readDbState();
        return sendJson(res, 200, { ok: true, state, meta: getDbStats() });
      }
      if (urlPath === statePath && (req.method === 'PUT' || req.method === 'POST')) {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const nextState = body && typeof body === 'object' && 'state' in body ? body.state : body;
        const saved = writeDbState(nextState);
        return sendJson(res, 200, { ok: true, state: saved, meta: getDbStats() });
      }
      if (urlPath === progressPath && req.method === 'POST') {
        const raw = await readBody(req);
        const body = JSON.parse(raw || '{}');
        const saved = updateDbProgress({
          lessonIds: Array.isArray(body.lessonIds) ? body.lessonIds : [],
          articleId: typeof body.articleId === 'string' ? body.articleId : '',
          learned: Boolean(body.learned),
          studyDate: typeof body.studyDate === 'string' && body.studyDate ? body.studyDate : undefined
        });
        return sendJson(res, 200, { ok: true, state: saved, meta: getDbStats() });
      }
      return sendJson(res, 405, { ok: false, error: 'Method Not Allowed' });
    } catch (err) {
      return sendJson(res, 400, { ok: false, error: err?.message || '请求处理失败' });
    }
  };
}
