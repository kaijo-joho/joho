/* 投影専用ウィンドウ。作品の編集機能・ノート・手元用の非表示表示は持たない。 */
(function (root) {
  'use strict';
  const channel = 'illustslide-presentation-1', token = location.hash.slice(1), parent = root.opener;
  const viewport = document.getElementById('audience-viewport'), paper = document.getElementById('audience-paper');
  const message = document.getElementById('audience-message'), fullscreenButton = document.getElementById('audience-fullscreen');
  const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
  let documentValue = null, player = null, pageId = null, sequence = -1, ended = false, swipe = null, suppressClick = false;
  function send(kind, payload = {}) {
    if (!parent || parent.closed) return;
    parent.postMessage({channel,token,kind,...payload},targetOrigin);
  }
  function fit() {
    const svg = paper.querySelector('svg'); if (!svg) return;
    const box = svg.viewBox.baseVal, ratio = box.width / box.height || 1;
    const width = Math.max(1,Math.min(viewport.clientWidth,viewport.clientHeight*ratio));
    paper.style.width = width+'px'; paper.style.height = width/ratio+'px';
  }
  function end(text = '発表が終了しました。このウィンドウを閉じてください。') {
    ended = true; player?.destroy(); player = null; documentValue = null; paper.replaceChildren();
    clearInterval(timer); observer.disconnect(); root.removeEventListener('message',receive);
    message.textContent = text; message.hidden = false; fullscreenButton.disabled = true;
  }
  function receive(event) {
    const value = event.data;
    if (ended || !parent || event.source !== parent || event.origin !== location.origin || !value || value.channel !== channel || value.token !== token) return;
    try {
      if (value.kind === 'init') {
        // 受け手も発表用へ限定し、ノート等をDOMへ渡さない。
        documentValue = root.IlapoPresentationData.outputDocument(value.document);
        player?.destroy(); player = null; pageId = null; sequence = -1; message.hidden = true;
        send('ack');
      } else if (value.kind === 'state' && documentValue) {
        if (!Number.isSafeInteger(value.sequence) || value.sequence <= sequence || !Number.isFinite(value.sentAt)) return;
        const state = value.state, page = documentValue.pages.find(page => page.id === state?.pageId);
        if (!page || !Number.isInteger(state.step) || state.step < 0 || !Number.isFinite(state.time) || state.time < 0 || typeof state.playing !== 'boolean') return;
        if (pageId !== page.id) {
          player?.destroy(); player = root.IlapoAnimationPlayer.create(paper,page); pageId = page.id;
          document.title = page.name + ' — illustSlide 投影画面'; fit();
        }
        player.sync(state,Math.max(0,Math.min(60000,Date.now()-value.sentAt)));
        sequence = value.sequence; send('ack');
      } else if (value.kind === 'end') end();
    } catch (_) { end('投影画面を表示できませんでした。発表者ビューから開き直してください。'); send('error'); }
  }
  function command(name) { if (!ended && documentValue) send('command',{command:name}); }
  async function fullscreen() {
    if (!viewport.requestFullscreen) { document.getElementById('audience-instruction').textContent = 'このブラウザでは全画面に切り替えられません。ウィンドウを最大化してください。'; return; }
    try { await viewport.requestFullscreen(); paper.focus(); } catch (_) { document.getElementById('audience-instruction').textContent = '全画面にできませんでした。もう一度「全画面」を押してください。'; }
  }
  fullscreenButton.addEventListener('click',fullscreen);
  document.addEventListener('fullscreenchange',fit);
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.ctrlKey || event.metaKey || event.altKey) return;
    if (document.fullscreenElement === viewport && event.key === 'Tab') { event.preventDefault(); paper.focus(); return; }
    if (event.target.closest('button') && [' ','Enter'].includes(event.key)) return;
    const name = {ArrowRight:'next',PageDown:'next',' ':'next',Enter:'next',ArrowLeft:'previous',PageUp:'previous',Home:'first',End:'last',r:'reset',R:'reset'}[event.key];
    if (name) { event.preventDefault(); command(name); }
  });
  viewport.addEventListener('click',event=>{if(suppressClick){suppressClick=false;event.preventDefault();return;}command('next');});
  viewport.addEventListener('pointerdown',event=>{if(event.button!==0)return;swipe={x:event.clientX,y:event.clientY,id:event.pointerId};suppressClick=false;viewport.setPointerCapture?.(event.pointerId);});
  viewport.addEventListener('pointerup',event=>{
    if(!swipe||swipe.id!==event.pointerId)return;
    const dx=event.clientX-swipe.x,dy=event.clientY-swipe.y;swipe=null;
    if(Math.abs(dx)>36&&Math.abs(dx)>Math.abs(dy)){suppressClick=true;command(dx<0?'next':'previous');}
  });
  viewport.addEventListener('pointercancel',()=>{swipe=null;suppressClick=false;});
  root.addEventListener('message',receive);
  const observer = new ResizeObserver(fit); observer.observe(viewport);
  const timer = setInterval(()=>{
    if (!parent || parent.closed) { if(!ended)end('発表者ビューが閉じられました。このウィンドウを閉じてください。'); return; }
    if (!documentValue && !ended) send('ready');
  },1000);
  root.addEventListener('pagehide',()=>{clearInterval(timer);observer.disconnect();player?.destroy();});
  root.addEventListener('pageshow',()=>{if(documentValue&&!ended)send('ready');});
  if (!parent || !/^[a-f0-9]{32}$/.test(token)) end('illustSlideの「発表者ビューで開始」から開いてください。');
  else send('ready');
  // 自動操作検証と接続状況の確認用。編集用データは公開しない。
  root.IlapoAudience = Object.freeze({getState:()=>({pageId,animation:player?.getState()||null,connected:!!documentValue&&!ended})});
}(globalThis));
