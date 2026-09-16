// 실행연구소 개선안 서버 — 포트 8878
//
// 이 폴더에는 고친 index.html 만 둔다.
// 이미지·영상·폰트 같은 자산은 원본 폴더(실행연구소_홈페이지)에서 **읽기만** 한다.
// 그래서 원본과 라이브는 전혀 건드리지 않고, 디스크도 532MB 를 다시 쓰지 않는다.
//
//   찾는 순서:  실행연구소_개선안/  →  없으면  실행연구소_홈페이지/
//
//   node _serve.mjs        # http://localhost:8878

import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = fileURLToPath(new URL('.', import.meta.url));
const ORIGIN = fileURLToPath(new URL('../실행연구소_홈페이지/', import.meta.url));
const PORT = 8878;

const TYPES = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8', '.svg': 'image/svg+xml',
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp',
  '.gif': 'image/gif', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.woff': 'font/woff', '.woff2': 'font/woff2', '.ico': 'image/x-icon'
};

async function pick(rel) {
  for (const root of [HERE, ORIGIN]) {
    const file = normalize(join(root, rel));
    if (!file.startsWith(root)) continue;          // 폴더 밖 접근 차단
    try {
      return { data: await readFile(file), file };
    } catch { /* 다음 폴더에서 찾는다 */ }
  }
  return null;
}

http.createServer(async (req, res) => {
  let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  if (p === '/' || p.endsWith('/')) p += 'index.html';
  const hit = await pick(p);
  if (!hit) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('404');
  }
  res.writeHead(200, {
    'Content-Type': TYPES[extname(hit.file).toLowerCase()] || 'application/octet-stream',
    'Cache-Control': 'no-cache'
  });
  res.end(hit.data);
}).listen(PORT, () => {
  console.log('개선안  http://localhost:' + PORT);
  console.log('  고친 파일 :', HERE);
  console.log('  자산 원본 :', ORIGIN, '(읽기만 함)');
});
