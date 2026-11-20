import http from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { createStudyApiMiddleware } from '../src/lib/api-handler.mjs';
import { resolveDbPath } from '../src/lib/db.mjs';

const distDir = path.resolve(process.cwd(), 'dist');
const port = Number(process.env.PORT || 4321);
const host = process.env.HOST || '127.0.0.1';
const base = process.env.STUDY_BASE_PATH || '/';
const apiMiddleware = createStudyApiMiddleware(base);

const mimeTypes = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.cpp': 'text/plain; charset=utf-8',
  '.log': 'text/plain; charset=utf-8',
  '.txt': 'text/plain; charset=utf-8',
};

async function resolveStaticFile(urlPath) {
  let rel = decodeURIComponent(urlPath.split('?')[0]);
  const basePrefix = base.replace(/\/$/, '');
  if (basePrefix && rel.startsWith(basePrefix)) rel = rel.slice(basePrefix.length) || '/';
  const safeRel = path.normalize(rel).replace(/^(\.\.(\/|\\|$))+/, '');
  const candidate = path.join(distDir, safeRel);
  if (!candidate.startsWith(distDir)) return null;

  for (const target of [candidate, path.join(candidate, 'index.html')]) {
    try {
      const info = await stat(target);
      if (info.isFile()) return target;
    } catch {}
  }
  return null;
}

const server = http.createServer((req, res) => {
  apiMiddleware(req, res, async () => {
    const file = await resolveStaticFile(req.url || '/');
    if (!file) {
      res.statusCode = 404;
      res.setHeader('Content-Type', 'text/plain; charset=utf-8');
      res.end('404 Not Found');
      return;
    }
    const ext = path.extname(file).toLowerCase();
    res.setHeader('Content-Type', mimeTypes[ext] || 'application/octet-stream');
    res.end(await readFile(file));
  });
});

server.listen(port, host, () => {
  console.log(`Study_Site server listening at http://${host}:${port}${base}`);
  console.log(`SQLite progress DB: ${resolveDbPath()}`);
});
