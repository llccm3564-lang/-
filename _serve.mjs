import http from 'node:http';
import { stat } from 'node:fs/promises';
import { createReadStream } from 'node:fs';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8877;
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.mp4':'video/mp4', '.webm':'video/webm',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ico':'image/x-icon'
};

http.createServer(async (req, res) => {
  try {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const type = TYPES[extname(file).toLowerCase()] || 'application/octet-stream';
    const size = (await stat(file)).size;
    const range = req.headers.range;

    // Range 미지원이면 브라우저가 영상 탐색(currentTime)을 못 해 0으로 튕긴다.
    // Vercel은 지원하므로, 로컬 미리보기가 실제와 같게 보이도록 여기서도 처리한다.
    if (range) {
      const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
      if (m) {
        let start = m[1] === '' ? null : parseInt(m[1], 10);
        let end   = m[2] === '' ? null : parseInt(m[2], 10);
        if (start === null) { start = Math.max(0, size - (end || 0)); end = size - 1; }   // bytes=-N
        if (end === null || end >= size) end = size - 1;
        if (!(start >= 0 && start <= end)) {
          res.writeHead(416, { 'Content-Range': 'bytes */' + size });
          return res.end();
        }
        res.writeHead(206, {
          'Content-Type': type,
          'Content-Length': end - start + 1,
          'Content-Range': 'bytes ' + start + '-' + end + '/' + size,
          'Accept-Ranges': 'bytes',
          'Cache-Control': 'no-cache'
        });
        return createReadStream(file, { start, end }).pipe(res);
      }
    }
    res.writeHead(200, {
      'Content-Type': type, 'Content-Length': size,
      'Accept-Ranges': 'bytes', 'Cache-Control': 'no-cache'
    });
    createReadStream(file).pipe(res);
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('serving on:');
  console.log('  http://localhost:'+PORT+'   (이 컴퓨터)');
  const ifs = os.networkInterfaces();
  for (const name of Object.keys(ifs)) for (const ni of ifs[name]||[])
    if (ni.family === 'IPv4' && !ni.internal) console.log('  http://'+ni.address+':'+PORT+'   (같은 와이파이에서 접속 — 폰/다른 PC)');
});
