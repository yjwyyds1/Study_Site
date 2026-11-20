import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { readFileSync } from 'node:fs';
import { createStudyApiMiddleware } from './src/lib/api-handler.mjs';

function remarkLocalExamples() {
  const langMap = {
    cpp: 'cpp', hpp: 'cpp', h: 'cpp', c: 'c',
    cmake: 'cmake', log: 'text', txt: 'text', md: 'markdown'
  };
  function walk(node) {
    if (!Array.isArray(node.children)) return;
    node.children = node.children.map(child => {
      if (child.type === 'paragraph' && child.children.length === 1 && child.children[0].type === 'text') {
        const match = /^\{\{example:([a-z0-9_./-]+\.(cpp|hpp|h|c|log|txt|cmake|md))\}\}$/i.exec(child.children[0].value.trim());
        if (match && !match[1].includes('..')) {
          const ext = match[2].toLowerCase();
          const lang = ext === 'txt' && match[1].endsWith('CMakeLists.txt') ? 'cmake' : (langMap[ext] ?? 'text');
          return { type: 'code', lang, value: readFileSync(new URL('./public/examples/' + match[1], import.meta.url), 'utf8').trimEnd() };
        }
      }
      walk(child);
      return child;
    });
  }
  return walk;
}

export default defineConfig({
  base: process.env.STUDY_BASE_PATH || '/',
  trailingSlash: 'always',
  devToolbar: { enabled: false },
  build: { format: 'directory' },
  vite: {
    plugins: [
      {
        name: 'study-sqlite-api',
        enforce: 'post',
        configureServer(server) {
          const handler = createStudyApiMiddleware(process.env.STUDY_BASE_PATH || '/');
          return () => {
            server.middlewares.stack.unshift({ route: '', handle: handler });
          };
        },
        configurePreviewServer(server) {
          const handler = createStudyApiMiddleware(process.env.STUDY_BASE_PATH || '/');
          return () => {
            server.middlewares.stack.unshift({ route: '', handle: handler });
          };
        }
      }
    ],
    server: {
      fs: {
        deny: [
          '.env', '.env.*', '*.{crt,pem,key,p12,pfx,cer,der}', '.npmrc', '.yarnrc.yml', '**/.git/**',
          '**/private/**', '**/backups/**', '**/study-backup*.json', '**/study-review*.md'
        ]
      }
    }
  },
  markdown: {
    processor: unified({ remarkPlugins: [remarkMath, remarkLocalExamples], rehypePlugins: [rehypeKatex] }),
    shikiConfig: { themes: { light: 'github-light', dark: 'github-dark' }, defaultColor: false }
  }
});
