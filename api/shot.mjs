/* Vercel 서버리스 함수 — 사이트 스크린샷(mShots)을 같은 출처로 프록시.
   ─────────────────────────────────────────────────────────────
   브라우저에서 mShots를 직접 캔버스에 구우면 CORS로 막힌다(크롭 저장 불가).
   서버가 대신 받아 이미지 바이트를 그대로 돌려주면 어드민에서 같은 출처로 로드→크롭·저장 가능.
   사용: /api/shot?url=https%3A%2F%2F인사이트맵.실행연구소.com  (자기 사이트에서 온 요청만) */
export default async function handler(req, res){
  const url = (req.query && (req.query.url || req.query.u)) || '';
  if (!/^https?:\/\//.test(url)){ res.status(400).json({ error:'url' }); return; }
  const origin = req.headers.origin || '', host = req.headers.host || '';
  if (origin && host && origin.replace(/^https?:\/\//,'').indexOf(host) !== 0){ res.status(403).json({ error:'origin' }); return; }
  try {
    const shot = 'https://s.wordpress.com/mshots/v1/' + encodeURIComponent(url) + '?w=1200&h=900';
    const r = await fetch(shot, { headers: { 'user-agent':'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36' } });
    if (!r.ok){ res.status(502).json({ error:'shot', status:r.status }); return; }
    const ct = r.headers.get('content-type') || 'image/jpeg';
    const buf = Buffer.from(await r.arrayBuffer());
    res.setHeader('Content-Type', ct);
    res.setHeader('Cache-Control', 'public, max-age=86400');   // 하루 캐시(mShots 재생성 부담↓)
    res.status(200).send(buf);
  } catch(e){ res.status(500).json({ error: String(e && e.message || e) }); }
}
