/* Vercel 서버리스 함수 — 서비스 제목·태그로 짧은 설명 1줄을 AI로 생성.
   ─────────────────────────────────────────────────────────────
   · API 키는 Vercel 환경변수 ANTHROPIC_API_KEY 에만 둔다(클라이언트에 절대 노출 안 됨).
     Vercel > 프로젝트 > Settings > Environment Variables 에 추가 후 재배포.
   · 키가 없으면 503을 돌려주고, 어드민은 조용히 넘어간다(설명칸 그대로 빈칸).
   · 가벼운 남용 방지: 자기 도메인(Origin)에서 온 POST만 처리 + 출력 토큰 제한(비용 최소). */
export default async function handler(req, res){
  if (req.method !== 'POST'){ res.status(405).json({ error:'method' }); return; }
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key){ res.status(503).json({ error:'no-key' }); return; }

  // 자기 사이트에서 온 요청만(외부 curl 남용 완화). Origin 없으면(동일출처 일부 브라우저) 통과.
  const origin = req.headers.origin || '';
  const host = req.headers.host || '';
  if (origin && host && origin.replace(/^https?:\/\//,'').indexOf(host) !== 0){ res.status(403).json({ error:'origin' }); return; }

  try {
    let body = req.body;
    if (typeof body === 'string'){ try { body = JSON.parse(body); } catch(e){ body = {}; } }
    body = body || {};
    const title = String(body.title || '').slice(0, 80).trim();
    const tags = Array.isArray(body.tags) ? body.tags.join(', ').slice(0, 120) : String(body.tags || '').slice(0, 120);
    if (!title){ res.status(400).json({ error:'no-title' }); return; }

    const prompt =
      '너는 한국 마케팅 회사 "실행연구소"의 서비스 소개 문안 작성자다.\n' +
      '서비스 제목: "' + title + '"\n' +
      (tags ? ('태그: ' + tags + '\n') : '') +
      '이 서비스를 소개하는 한국어 설명을 딱 한 문장(45자 이내)으로 써라. ' +
      '고객이 얻는 이득 중심으로, 담백하고 신뢰감 있게. ' +
      '따옴표·이모지·머리말·군더더기 없이 완성된 문장만 출력.';

    const r = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: { 'x-api-key': key, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 150,
        messages: [{ role: 'user', content: prompt }]
      })
    });
    if (!r.ok){ const t = await r.text(); res.status(502).json({ error:'api', detail: t.slice(0, 300) }); return; }
    const j = await r.json();
    let desc = (j && j.content && j.content[0] && j.content[0].text || '').trim();
    desc = desc.replace(/^["'\s]+|["'\s]+$/g, '').split('\n')[0].trim();   // 첫 문장·따옴표 제거
    res.status(200).json({ desc });
  } catch(e){
    res.status(500).json({ error: String(e && e.message || e) });
  }
}
