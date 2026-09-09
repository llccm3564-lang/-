/* =========================================================================
   실행연구소 편집기 오버레이 (_editor.js) — 8878 편집 서버에서만 주입됨.
   · 원본 index.html은 절대 수정 안 함. 편집값은 8878 오리진 localStorage에 저장.
   · 텍스트 모드 / 이미지 모드 분리. 오버레이 관통 편집(elementsFromPoint).
   · 좌하단 메모(고정핀 지원). 8878은 스무스스크롤·트랜지션 제거로 가볍게.
   ========================================================================= */
(function(){
  'use strict';
  if (window.__sileEditor) return; window.__sileEditor = true;

  var LS = 'silhaeng_editor_v1';
  var Z = 2147483000;
  var state = { texts:{}, images:{}, memos:[], mode:'off' };   // mode: 'off'|'text'|'img'
  try { var raw = localStorage.getItem(LS); if (raw) state = Object.assign(state, JSON.parse(raw)); } catch(e){}
  if(state.mode!=='text'&&state.mode!=='img') state.mode='off';
  var saveTimer=null;
  function save(){ try { localStorage.setItem(LS, JSON.stringify(state)); } catch(e){} clearTimeout(saveTimer); saveTimer=setTimeout(pushServer,400); }
  function pushServer(){ try{ fetch('/_editor_state',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(state)}); }catch(e){} }
  function hasData(s){ return !!(s && ((s.texts&&Object.keys(s.texts).length)||(s.images&&Object.keys(s.images).length)||(s.memos&&s.memos.length))); }
  function getScroll(){ return window.scrollY || document.documentElement.scrollTop || 0; }

  /* ---- DOM 경로 키(재접속 시 같은 요소 찾기) ---- */
  function pathOf(el){
    if(!el || el===document.body) return 'body';
    var parts=[];
    while(el && el!==document.body && el.nodeType===1){
      var tag=el.tagName.toLowerCase(), i=1, sib=el;
      while((sib=sib.previousElementSibling)){ if(sib.tagName===el.tagName) i++; }
      parts.unshift(tag+':'+i); el=el.parentElement;
    }
    return 'body>'+parts.join('>');
  }
  function elByPath(path){
    if(path==='body') return document.body;
    var parts=path.replace(/^body>/,'').split('>'), el=document.body;
    for(var k=0;k<parts.length;k++){
      var seg=parts[k].split(':'), tag=seg[0], n=parseInt(seg[1],10), cnt=0, found=null, ch=el.children;
      for(var j=0;j<ch.length;j++){ if(ch[j].tagName.toLowerCase()===tag){ cnt++; if(cnt===n){found=ch[j];break;} } }
      if(!found) return null; el=found;
    }
    return el;
  }

  /* ---- 저장값 재적용 ---- */
  function applyAll(){
    Object.keys(state.texts).forEach(function(p){ var el=elByPath(p); if(el) el.innerHTML=state.texts[p].val; });
    Object.keys(state.images).forEach(function(p){ var el=elByPath(p); if(el) styleImg(el, state.images[p]); });
  }
  function styleImg(el,r){
    el.style.transform='translate('+(r.tx||0)+'px,'+(r.ty||0)+'px) scale('+(r.scale||1)+')';
    if(r.w){ el.style.width=r.w+'px'; el.style.height='auto'; el.style.maxWidth='none'; }
  }

  /* ================= 텍스트 인라인 편집 ================= */
  var TEXT_TAGS={h1:1,h2:1,h3:1,h4:1,h5:1,h6:1,p:1,span:1,a:1,button:1,li:1,em:1,strong:1,small:1,label:1,blockquote:1,figcaption:1,td:1,th:1,dt:1,dd:1};
  function textLeaf(t){
    var cur=t;
    while(cur && cur!==document.body){
      if(cur.closest && cur.closest('.sile-ui')) return null;
      var tag=cur.tagName && cur.tagName.toLowerCase();
      if(tag && TEXT_TAGS[tag] && (cur.textContent||'').trim().length) return cur;
      if(tag==='div' && cur.children.length===0 && (cur.textContent||'').trim().length) return cur;
      cur=cur.parentElement;
    }
    return null;
  }
  // 오버레이 관통: 클릭 지점의 요소를 위→아래로 훑어 첫 편집 대상 찾기
  function pickText(x,y){
    var stack=document.elementsFromPoint(x,y);
    for(var i=0;i<stack.length;i++){
      if(stack[i].closest && stack[i].closest('.sile-ui')) continue;
      var leaf=textLeaf(stack[i]);
      if(leaf) return leaf;
    }
    return null;
  }
  function pickImg(x,y){
    var stack=document.elementsFromPoint(x,y);
    for(var i=0;i<stack.length;i++){ if(stack[i].tagName==='IMG' && !(stack[i].closest&&stack[i].closest('.sile-ui'))) return stack[i]; }
    return null;
  }
  function editText(el){
    var key=pathOf(el);
    var orig = state.texts[key] ? state.texts[key].orig : el.innerHTML;
    el.setAttribute('contenteditable','true'); el.classList.add('sile-editing'); el.focus();
    // 커서를 클릭 위치로
    function done(){
      el.removeEventListener('blur',done);
      el.removeAttribute('contenteditable'); el.classList.remove('sile-editing');
      var now=el.innerHTML;
      if(now!==orig){ state.texts[key]={orig:orig, val:now}; } else { delete state.texts[key]; }
      save();
    }
    el.addEventListener('blur',done);
  }

  /* ================= 이미지 위치/크기 ================= */
  var selImg=null, imgPanel;
  function selectImg(el){
    clearImgSel(); selImg=el; el.classList.add('sile-img-sel');
    var key=pathOf(el), r=state.images[key]||{tx:0,ty:0,scale:1,w:''};
    imgPanel.style.display='block';
    setVal('sile-w', r.w||''); setVal('sile-tx', r.tx||0); setVal('sile-ty', r.ty||0); setVal('sile-sc', r.scale||1);
    imgPanel._key=key; imgPanel._el=el;
  }
  function clearImgSel(){ if(selImg){ selImg.classList.remove('sile-img-sel'); selImg=null; } if(imgPanel) imgPanel.style.display='none'; }
  function readImgPanel(){
    var el=imgPanel._el, key=imgPanel._key; if(!el) return;
    var r={ w:parseFloat(getVal('sile-w'))||'', tx:parseFloat(getVal('sile-tx'))||0, ty:parseFloat(getVal('sile-ty'))||0, scale:parseFloat(getVal('sile-sc'))||1 };
    styleImg(el,r);
    if(!r.w && !r.tx && !r.ty && r.scale===1){ delete state.images[key]; } else { state.images[key]=r; }
    save();
  }

  /* ================= 메모(좌하단, 고정핀 지원) ================= */
  function makeMemo(m){
    var d=document.createElement('div'); d.className='sile-memo sile-ui';
    d.style.position = m.pinned ? 'absolute' : 'fixed';
    d.style.left=m.x+'px'; d.style.top=m.y+'px';
    d.innerHTML='<div class="sile-memo-bar"><span>메모</span><span class="sile-memo-btns"><button class="sile-memo-pin'+(m.pinned?' on':'')+'" title="현재 위치에 고정(스크롤 따라오지 않음)">📌</button><button class="sile-memo-del" title="삭제">×</button></span></div>'+
      '<textarea class="sile-memo-ta" placeholder="여기에 메모...">'+(m.text||'').replace(/</g,'&lt;')+'</textarea>';
    document.body.appendChild(d);
    var ta=d.querySelector('.sile-memo-ta'), bar=d.querySelector('.sile-memo-bar'), pin=d.querySelector('.sile-memo-pin');
    ta.addEventListener('input',function(){ m.text=ta.value; save(); });
    d.querySelector('.sile-memo-del').addEventListener('click',function(){ d.remove(); state.memos=state.memos.filter(function(x){return x.id!==m.id;}); save(); });
    // 고정 토글: fixed(화면고정)↔absolute(문서고정=스크롤 따라 흘러감), 화면상 위치는 유지
    pin.addEventListener('click',function(){
      var sc=getScroll();
      if(!m.pinned){ m.pinned=true; m.y=parseFloat(d.style.top)+sc; d.style.position='absolute'; d.style.top=m.y+'px'; pin.classList.add('on'); }
      else { m.pinned=false; m.y=parseFloat(d.style.top)-sc; d.style.position='fixed'; d.style.top=m.y+'px'; pin.classList.remove('on'); }
      save();
    });
    // 드래그
    bar.addEventListener('pointerdown',function(e){
      if(e.target.closest('.sile-memo-btns')) return;
      e.preventDefault(); var sx=e.clientX, sy=e.clientY, ox=parseFloat(d.style.left), oy=parseFloat(d.style.top);
      bar.setPointerCapture(e.pointerId);
      function mv(ev){ d.style.left=(ox+ev.clientX-sx)+'px'; d.style.top=(oy+ev.clientY-sy)+'px'; }
      function up(){ bar.removeEventListener('pointermove',mv); bar.removeEventListener('pointerup',up); m.x=parseFloat(d.style.left); m.y=parseFloat(d.style.top); save(); }
      bar.addEventListener('pointermove',mv); bar.addEventListener('pointerup',up);
    });
    return d;
  }
  function addMemo(){
    var m={ id:Date.now(), x:20, y:Math.max(70, window.innerHeight-300), text:'', pinned:false };
    state.memos.push(m); save(); var d=makeMemo(m); d.querySelector('.sile-memo-ta').focus();
  }
  function renderMemos(){ state.memos.forEach(makeMemo); }

  /* ================= UI ================= */
  function setVal(id,v){ var e=document.getElementById(id); if(e) e.value=v; }
  function getVal(id){ var e=document.getElementById(id); return e?e.value:''; }
  function esc(s){ return (s||'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }
  function strip(html){ var d=document.createElement('div'); d.innerHTML=html; return (d.textContent||'').trim(); }
  function shortLoc(path){ var el=elByPath(path); if(!el) return path; var tag=el.tagName.toLowerCase(); var cls=(typeof el.className==='string'&&el.className)?('.'+el.className.trim().split(/\s+/).slice(0,2).join('.')):''; return tag+cls; }

  function buildUI(){
    var css=document.createElement('style'); css.textContent=
    '.sile-ui,.sile-ui *{box-sizing:border-box;font-family:Pretendard,system-ui,sans-serif}'+
    '#sile-bar{position:fixed;top:14px;right:14px;z-index:'+Z+';display:flex;gap:6px;align-items:center;background:#14181d;color:#fff;padding:8px 10px;border-radius:12px;box-shadow:0 10px 30px rgba(0,0,0,.35);font-size:13px}'+
    '#sile-bar button{cursor:pointer;border:0;border-radius:8px;padding:7px 11px;font-size:13px;font-weight:600;color:#fff;background:#2b3138;transition:background .12s ease}'+
    '#sile-bar button:hover{background:#3a424b}'+
    '#sile-mode-text.on{background:#12b886}#sile-mode-img.on{background:#ff922b}'+
    '#sile-tag{font-weight:700;opacity:.85;padding-right:2px}'+
    '#sile-hint{position:fixed;top:60px;right:14px;z-index:'+Z+';color:#04231a;font-size:12px;font-weight:600;padding:7px 11px;border-radius:9px;box-shadow:0 6px 18px rgba(0,0,0,.25);display:none}'+
    '#sile-hint.text{background:rgba(18,184,134,.95);display:block}#sile-hint.img{background:rgba(255,146,43,.95);display:block}'+
    'html.sile-flat.sile-text-on *{cursor:auto}'+
    '.sile-editing{outline:2px solid #12b886 !important;outline-offset:2px;background:rgba(18,184,134,.06)}'+
    '.sile-img-sel{outline:3px solid #ff922b !important;outline-offset:2px}'+
    '#sile-img{position:fixed;right:14px;bottom:14px;z-index:'+Z+';display:none;background:#14181d;color:#fff;padding:12px;border-radius:12px;box-shadow:0 12px 34px rgba(0,0,0,.4);width:220px}'+
    '#sile-img h4{margin:0 0 8px;font-size:12px;color:#ff922b;font-weight:700}'+
    '#sile-img label{display:flex;justify-content:space-between;align-items:center;font-size:12px;margin:6px 0;color:#c8ced4}'+
    '#sile-img input{width:96px;padding:5px 7px;border-radius:6px;border:1px solid #333b44;background:#0d1013;color:#fff;font-size:12px}'+
    '#sile-img .row{display:flex;gap:6px;margin-top:8px}'+
    '#sile-img .row button{flex:1;cursor:pointer;border:0;border-radius:7px;padding:7px;font-size:12px;font-weight:600;color:#fff;background:#2b3138}'+
    '#sile-img .row button:hover{background:#3a424b}'+
    '#sile-memobtn{position:fixed;left:14px;bottom:14px;z-index:'+Z+';background:#14181d;color:#fff;border:0;border-radius:12px;padding:10px 14px;font-size:13px;font-weight:700;cursor:pointer;box-shadow:0 10px 30px rgba(0,0,0,.35)}'+
    '#sile-memobtn:hover{background:#232a31}'+
    '.sile-memo{width:230px;background:#fff7d6;border:1px solid #e9d98a;border-radius:10px;box-shadow:0 8px 22px rgba(0,0,0,.25);overflow:hidden;z-index:'+(Z-1)+'}'+
    '.sile-memo-bar{display:flex;justify-content:space-between;align-items:center;background:#f2e39b;padding:4px 6px 4px 9px;cursor:grab;font-size:12px;font-weight:700;color:#6b5b13}'+
    '.sile-memo-btns{display:flex;gap:2px}'+
    '.sile-memo-pin,.sile-memo-del{border:0;background:transparent;cursor:pointer;color:#6b5b13;border-radius:6px;padding:2px 5px;font-size:13px;line-height:1}'+
    '.sile-memo-pin:hover,.sile-memo-del:hover{background:rgba(0,0,0,.08)}'+
    '.sile-memo-pin.on{background:#6b5b13;color:#fff7d6}'+
    '.sile-memo-del{font-size:16px}'+
    '.sile-memo-ta{width:100%;border:0;background:transparent;padding:8px;font-size:13px;color:#3d3410;resize:vertical;min-height:80px;outline:none;font-family:Pretendard,sans-serif}'+
    '#sile-modal{position:fixed;inset:0;z-index:'+(Z+10)+';display:none;background:rgba(0,0,0,.5);align-items:center;justify-content:center}'+
    '#sile-modal .box{width:min(720px,92vw);max-height:82vh;overflow:auto;background:#14181d;color:#e8edf2;border-radius:14px;padding:20px;box-shadow:0 24px 60px rgba(0,0,0,.5)}'+
    '#sile-modal h3{margin:0 0 4px;font-size:16px}#sile-modal .sub{font-size:12px;color:#8b939b;margin-bottom:14px}'+
    '#sile-modal .grp{margin:14px 0}#sile-modal .grp h4{margin:0 0 8px;font-size:13px;color:#12b886}'+
    '#sile-modal .it{background:#0e1114;border:1px solid #232a31;border-radius:8px;padding:9px 11px;margin:7px 0;font-size:12px;line-height:1.5}'+
    '#sile-modal .loc{color:#ff922b;font-weight:700}#sile-modal .old{color:#e0666f}#sile-modal .new{color:#63d29c}'+
    '#sile-modal .foot{display:flex;gap:8px;justify-content:flex-end;margin-top:16px}'+
    '#sile-modal .foot button{cursor:pointer;border:0;border-radius:8px;padding:9px 14px;font-size:13px;font-weight:600;color:#fff;background:#2b3138}'+
    '#sile-modal .foot button:hover{background:#3a424b}#sile-modal .foot .cp{background:#12b886}'+
    '#sile-modal .empty{color:#6b7078;font-size:12px}';
    document.head.appendChild(css);

    var bar=document.createElement('div'); bar.id='sile-bar'; bar.className='sile-ui';
    bar.innerHTML='<span id="sile-tag">편집기</span>'+
      '<button id="sile-mode-text">텍스트</button>'+
      '<button id="sile-mode-img">이미지</button>'+
      '<button id="sile-view">변경값 보기</button>'+
      '<button id="sile-reset">초기화</button>';
    document.body.appendChild(bar);

    var hint=document.createElement('div'); hint.id='sile-hint'; hint.className='sile-ui'; document.body.appendChild(hint);

    imgPanel=document.createElement('div'); imgPanel.id='sile-img'; imgPanel.className='sile-ui';
    imgPanel.innerHTML='<h4>이미지 조절</h4>'+
      '<label>가로(px)<input id="sile-w" type="number" step="1" placeholder="자동"></label>'+
      '<label>이동 X(px)<input id="sile-tx" type="number" step="1" value="0"></label>'+
      '<label>이동 Y(px)<input id="sile-ty" type="number" step="1" value="0"></label>'+
      '<label>배율<input id="sile-sc" type="number" step="0.05" value="1"></label>'+
      '<div class="row"><button id="sile-img-reset">이 이미지 초기화</button><button id="sile-img-close">닫기</button></div>';
    document.body.appendChild(imgPanel);

    var mbtn=document.createElement('button'); mbtn.id='sile-memobtn'; mbtn.className='sile-ui'; mbtn.textContent='＋ 메모'; document.body.appendChild(mbtn);

    var modal=document.createElement('div'); modal.id='sile-modal'; modal.className='sile-ui';
    modal.innerHTML='<div class="box"><h3>변경값</h3><div class="sub">아래 값을 보고 원본 index.html에 반영하면 됨. (이 편집본은 8878에만 저장됨)</div><div id="sile-modal-body"></div><div class="foot"><button class="cp" id="sile-copy">전체 복사</button><button id="sile-close">닫기</button></div></div>';
    document.body.appendChild(modal);

    document.getElementById('sile-mode-text').addEventListener('click',function(){ setMode(state.mode==='text'?'off':'text'); });
    document.getElementById('sile-mode-img').addEventListener('click',function(){ setMode(state.mode==='img'?'off':'img'); });
    document.getElementById('sile-view').addEventListener('click',openView);
    document.getElementById('sile-reset').addEventListener('click',function(){
      if(confirm('편집한 내용(텍스트·이미지·메모)을 전부 지울까요? 원본은 영향 없습니다.')){ state={texts:{},images:{},memos:[],mode:state.mode}; save(); location.reload(); }
    });
    ['sile-w','sile-tx','sile-ty','sile-sc'].forEach(function(id){ document.getElementById(id).addEventListener('input',readImgPanel); });
    document.getElementById('sile-img-reset').addEventListener('click',function(){
      var el=imgPanel._el,key=imgPanel._key; if(el){ el.style.transform=''; el.style.width=''; el.style.height=''; el.style.maxWidth=''; } delete state.images[key]; save(); clearImgSel();
    });
    document.getElementById('sile-img-close').addEventListener('click',clearImgSel);
    mbtn.addEventListener('click',addMemo);
    document.getElementById('sile-close').addEventListener('click',function(){ modal.style.display='none'; });
    document.getElementById('sile-copy').addEventListener('click',copyView);
    modal.addEventListener('click',function(e){ if(e.target===modal) modal.style.display='none'; });
  }

  function setMode(mode){
    state.mode=mode; save();
    var bt=document.getElementById('sile-mode-text'), bi=document.getElementById('sile-mode-img'), hint=document.getElementById('sile-hint');
    bt.classList.toggle('on',mode==='text'); bi.classList.toggle('on',mode==='img');
    document.documentElement.classList.toggle('sile-text-on',mode==='text');
    hint.className='sile-ui'+(mode==='text'?' text':mode==='img'?' img':'');
    hint.textContent = mode==='text' ? '텍스트 클릭 = 그 자리에서 수정 (오버레이 밑 글자도 됨)' : mode==='img' ? '이미지 클릭 = 위치/크기 조절 · 드래그로 이동' : '';
    if(mode!=='img') clearImgSel();
  }

  function onClick(e){
    if(state.mode==='off') return;
    if(e.target.closest && e.target.closest('.sile-ui')) return;
    if(state.mode==='img'){ var im=pickImg(e.clientX,e.clientY); if(im){ e.preventDefault(); e.stopPropagation(); selectImg(im); } return; }
    // text
    var leaf=pickText(e.clientX,e.clientY);
    if(leaf){ e.preventDefault(); e.stopPropagation(); clearImgSel(); editText(leaf); }
  }
  function onPointerDown(e){
    if(state.mode!=='img' || !selImg || e.target!==selImg) return;
    e.preventDefault();
    var otx=parseFloat(getVal('sile-tx'))||0, oty=parseFloat(getVal('sile-ty'))||0, sx=e.clientX, sy=e.clientY;
    function mv(ev){ setVal('sile-tx',Math.round(otx+ev.clientX-sx)); setVal('sile-ty',Math.round(oty+ev.clientY-sy)); readImgPanel(); }
    function up(){ window.removeEventListener('pointermove',mv); window.removeEventListener('pointerup',up); }
    window.addEventListener('pointermove',mv); window.addEventListener('pointerup',up);
  }

  /* 변경값 보기 */
  function viewText(){
    var t=Object.keys(state.texts).map(function(p){ var r=state.texts[p]; return '<div class="it"><div class="loc">'+esc(shortLoc(p))+'</div><div class="old">이전: '+esc(strip(r.orig))+'</div><div class="new">변경: '+esc(strip(r.val))+'</div></div>'; });
    var im=Object.keys(state.images).map(function(p){ var r=state.images[p]; return '<div class="it"><div class="loc">'+esc(shortLoc(p))+'</div><div class="new">가로:'+(r.w||'자동')+'px · 이동:('+(r.tx||0)+','+(r.ty||0)+') · 배율:'+(r.scale||1)+'</div></div>'; });
    var me=state.memos.filter(function(m){return (m.text||'').trim();}).map(function(m){ return '<div class="it"><div class="new">'+esc(m.text)+'</div></div>'; });
    return '<div class="grp"><h4>텍스트 ('+t.length+')</h4>'+(t.length?t.join(''):'<div class="empty">없음</div>')+'</div>'+
           '<div class="grp"><h4>이미지 ('+im.length+')</h4>'+(im.length?im.join(''):'<div class="empty">없음</div>')+'</div>'+
           '<div class="grp"><h4>메모 ('+me.length+')</h4>'+(me.length?me.join(''):'<div class="empty">없음</div>')+'</div>';
  }
  function openView(){ document.getElementById('sile-modal-body').innerHTML=viewText(); document.getElementById('sile-modal').style.display='flex'; }
  function copyView(){
    var lines=['[텍스트 변경]'];
    Object.keys(state.texts).forEach(function(p){ var r=state.texts[p]; lines.push('· '+shortLoc(p)+'\n  이전: '+strip(r.orig)+'\n  변경: '+strip(r.val)); });
    lines.push('','[이미지 변경]');
    Object.keys(state.images).forEach(function(p){ var r=state.images[p]; lines.push('· '+shortLoc(p)+' → 가로:'+(r.w||'자동')+'px 이동:('+(r.tx||0)+','+(r.ty||0)+') 배율:'+(r.scale||1)); });
    lines.push('','[메모]');
    state.memos.forEach(function(m){ if((m.text||'').trim()) lines.push('· '+m.text); });
    if(navigator.clipboard){ navigator.clipboard.writeText(lines.join('\n')).then(function(){ var b=document.getElementById('sile-copy'); b.textContent='복사됨!'; setTimeout(function(){b.textContent='전체 복사';},1200); }); }
  }

  /* ================= 플래튼: 스무스스크롤/트랜지션 제거로 가볍게 ================= */
  function flatten(){
    try{ if(window.__lenis){ window.__lenis.destroy(); window.__lenis=null; } }catch(e){}
    document.documentElement.style.scrollBehavior='auto';
    document.documentElement.classList.add('sile-flat');
    // 자동재생 동영상 정지(명백한 모션 + 부하 제거)
    try{ document.querySelectorAll('video').forEach(function(v){ v.pause(); v.autoplay=false; v.removeAttribute('autoplay'); v.loop=false; }); }catch(e){}
    // 커스텀 커서(.cur-dot) 끄고 네이티브 커서 복구 → 메모/편집기 위에서도 커서 보임
    try{ document.body.classList.remove('has-cur'); }catch(e){}
    var fs=document.createElement('style'); fs.id='sile-flat-css'; fs.textContent=
      'html.sile-flat, html.sile-flat body{scroll-behavior:auto !important}'+
      'html.sile-flat *,html.sile-flat *::before,html.sile-flat *::after{transition-duration:.001ms !important;transition-delay:0s !important;animation-duration:.001ms !important;animation-delay:0s !important}'+
      // 모든 요소를 클릭 가능하게 강제 → pointer-events:none 텍스트/이미지(동영상 밑 등)도 히트 스택에 잡혀 편집 가능
      'html.sile-flat *{pointer-events:auto !important}'+
      // 커스텀 커서 숨김 + has-cur 재적용돼도 네이티브 커서 유지
      'html.sile-flat #curDot,html.sile-flat .cur-dot{display:none !important}'+
      'html.sile-flat body.has-cur, html.sile-flat body.has-cur *{cursor:auto !important}';
    document.head.appendChild(fs);
  }

  /* ---- 부팅 ---- */
  function startUI(){
    buildUI();
    renderMemos();
    setMode(state.mode);
    applyAll(); setTimeout(applyAll,600); setTimeout(applyAll,1600);
    setTimeout(flatten,400);   // 콘텐츠 빌드 후 플래튼(Lenis 종료·트랜지션 제거·커서 복구)
    document.addEventListener('click',onClick,true);
    document.addEventListener('pointerdown',onPointerDown,true);
  }
  function boot(){
    // 공용 편집 상태(서버) 우선 로드 → 같은 네트워크 사람도 같은 편집본을 봄
    fetch('/_editor_state').then(function(r){return r.json();}).then(function(srv){
      var keepMode=state.mode;   // 편집모드는 각자 로컬(공유 안 함)
      if(hasData(srv)){ state=Object.assign({texts:{},images:{},memos:[]}, srv); }
      else if(hasData(state)){ pushServer(); }   // 로컬에만 있던 편집분을 서버에 시드
      state.mode=(keepMode==='text'||keepMode==='img')?keepMode:'off';
    }).catch(function(){}).then(startUI);
  }
  if(document.readyState==='loading') document.addEventListener('DOMContentLoaded',boot); else boot();
})();
