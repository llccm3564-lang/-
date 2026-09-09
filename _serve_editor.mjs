import http from 'node:http';
import { readFile, writeFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import os from 'node:os';

// 편집용 서버(8878). 원본 index.html은 절대 수정하지 않고,
// 서빙할 때만 편집기 스크립트(_editor.js)를 </body> 앞에 주입한다.
// 편집값은 _editor_state.json(공용)에 저장 → 같은 네트워크(LAN) 사람도 같은 편집본을 봄.
const ROOT = fileURLToPath(new URL('.', import.meta.url));
const PORT = 8878;
const STATE_FILE = join(ROOT, '_editor_state.json');
const TYPES = {
  '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8',
  '.mjs':'text/javascript; charset=utf-8', '.css':'text/css; charset=utf-8',
  '.json':'application/json; charset=utf-8', '.svg':'image/svg+xml',
  '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp',
  '.gif':'image/gif', '.mp4':'video/mp4', '.webm':'video/webm',
  '.woff':'font/woff', '.woff2':'font/woff2', '.ico':'image/x-icon'
};

function readBody(req){
  return new Promise((resolve)=>{ let b=''; req.on('data',c=>{ b+=c; if(b.length>5e6) req.destroy(); }); req.on('end',()=>resolve(b)); });
}
function lanIPs(){
  const out=[]; const ifs=os.networkInterfaces();
  for(const name of Object.keys(ifs)) for(const ni of ifs[name]||[]) if(ni.family==='IPv4' && !ni.internal) out.push(ni.address);
  return out;
}

http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://x');
    // ---- 공용 편집 상태 API ----
    if (url.pathname === '/_editor_state') {
      if (req.method === 'GET') {
        let data = '{}';
        try { data = (await readFile(STATE_FILE)).toString('utf-8') || '{}'; } catch {}
        res.writeHead(200, { 'Content-Type':'application/json; charset=utf-8', 'Cache-Control':'no-cache' });
        return res.end(data);
      }
      if (req.method === 'POST') {
        const body = await readBody(req);
        try { JSON.parse(body); await writeFile(STATE_FILE, body, 'utf-8'); res.writeHead(200); return res.end('ok'); }
        catch { res.writeHead(400); return res.end('bad json'); }
      }
      res.writeHead(405); return res.end('method');
    }
    // ---- 정적 파일(+ index.html 편집기 주입) ----
    let p = decodeURIComponent(url.pathname);
    if (p === '/' || p.endsWith('/')) p += 'index.html';
    const file = normalize(join(ROOT, p));
    if (!file.startsWith(ROOT)) { res.writeHead(403); return res.end('forbidden'); }
    const ext = extname(file).toLowerCase();
    let data = await readFile(file);
    if (ext === '.html') {
      let html = data.toString('utf-8');
      const tag = '<script src="/_editor.js?v=' + Date.now() + '"></script>';
      html = html.includes('</body>') ? html.replace('</body>', tag + '\n</body>') : html + tag;
      data = Buffer.from(html, 'utf-8');
    }
    res.writeHead(200, { 'Content-Type': TYPES[ext] || 'application/octet-stream', 'Cache-Control':'no-cache' });
    res.end(data);
  } catch {
    res.writeHead(404, { 'Content-Type':'text/plain; charset=utf-8' });
    res.end('404');
  }
}).listen(PORT, '0.0.0.0', () => {
  console.log('EDITOR serving on:');
  console.log('  http://localhost:'+PORT+'   (이 컴퓨터)');
  lanIPs().forEach(ip => console.log('  http://'+ip+':'+PORT+'   (같은 네트워크에서 접속 → 공유용)'));
});
