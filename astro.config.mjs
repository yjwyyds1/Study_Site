import { defineConfig } from 'astro/config';
import { unified } from '@astrojs/markdown-remark';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { readFileSync } from 'node:fs';

function remarkLocalExamples() {
  function walk(node) {
    if (!Array.isArray(node.children)) return;
    node.children = node.children.map(child => {
      if (child.type === 'paragraph' && child.children.length === 1 && child.children[0].type === 'text') {
        const match = /^\{\{example:([a-z0-9-]+\.cpp)\}\}$/.exec(child.children[0].value);
        if (match) return { type: 'code', lang: 'cpp', value: readFileSync(new URL('./public/examples/' + match[1], import.meta.url), 'utf8').trimEnd() };
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
