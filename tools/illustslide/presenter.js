/* 手元の発表者ビュー。投影先には発表用に限定した複製だけを渡す。 */
(function (root) {
  'use strict';
  const base = new URL('.', document.currentScript.src);
  const version = new URL(document.currentScript.src).search;
  const channel = 'illustslide-presentation-1';
  const hiddenKey = 'kaijo-ilapo:presenter-hidden';
  const paths = {
    previous:'m15 5-7 7 7 7', next:'m9 5 7 7-7 7', reset:'M4 4v6h6M4 10a8 8 0 1 1 1 9',
    close:'m6 6 12 12M18 6 6 18', screen:'M3 3h18v14H3zM8 21h8M12 17v4',
    hide:'m3 3 18 18M10 5h2c6 0 10 7 10 7s-2 3-5 5M6 6c-3 2-4 6-4 6s4 7 10 7h2',
    ghost:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12ZM12 8v8M9 9v6M15 9v6',
    show:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12Zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="${paths[name]}"/></svg>`;
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const button = (action, name, graphic) => `<button type="button" data-presenter-action="${action}" aria-label="${name}" title="${name}">${icon(graphic)}</button>`;
  const paper = (key, label) => `<div class="presenter-preview" data-preview="${key}"><div data-preview-paper="${key}" role="img" aria-label="${label}"></div></div>`;
  let active = null;

  function open(input, options = {}) {
    const C = root.IlapoCore, D = root.IlapoPresentationData, Player = root.IlapoAnimationPlayer, A = root.IlapoAnimation;
    const source = C.validateDocument(input), included = D.pages(source), output = D.outputDocument(source);
    let index = D.startIndex(source, options.pageId);
    if (active) active.close();
    const opener = options.opener || document.activeElement, oldOverflow = document.body.style.overflow;
    const token = Array.from(root.crypto.getRandomValues(new Uint32Array(4)), n => n.toString(16).padStart(8, '0')).join('');
    const audienceURL = new URL('audience.html' + version, base); audienceURL.hash = token;
    const targetOrigin = location.protocol === 'file:' ? '*' : location.origin;
    let closed = false, audience = null, connected = false, hasStarted = false, sequence = 0;
    let master = null, previewPlayers = [], suppress = false, hiddenMode = 'ghost';
    let startTime = null, lastAck = 0, openedAt = 0, previewKey = '', pagePlan = null, hasConnectionError = false;
    try { const saved = localStorage.getItem(hiddenKey); if (['hide','ghost','show'].includes(saved)) hiddenMode = saved; } catch (_) {}
    const dialog = document.createElement('dialog');
    dialog.id = 'illustslide-presenter'; dialog.className = 'ilapo-presenter-dialog';
    dialog.setAttribute('aria-label', '発表者ビュー');
    dialog.innerHTML = `<header class="presenter-header"><strong>発表者ビュー</strong><span class="presenter-document">${esc(source.name)}</span><time class="presenter-clock" aria-label="経過時間">00:00</time>${button('close','発表を終了','close')}</header>
      <div class="presenter-connection"><span data-connection-status role="status">投影画面を開いています…</span><button type="button" data-presenter-action="screen">${icon('screen')}<span>投影画面を開く</span></button></div>
      <main class="presenter-layout">
        <section class="presenter-current"><div class="presenter-section-title"><h2>現在のページ</h2><span data-current-caption></span></div>${paper('current','現在のページ')}</section>
        <div class="presenter-forecasts"><section><div class="presenter-section-title"><h2>次のクリック</h2><span data-next-action-caption></span></div>${paper('action','次のクリック後の表示')}</section><section><div class="presenter-section-title"><h2>次のページ</h2><span data-next-page-caption></span></div>${paper('next','次のページ')}</section></div>
        <section class="presenter-notes"><h2>発表者ノート</h2><div class="presenter-note-text" data-notes tabindex="0"></div></section>
        <section class="presenter-order"><h2>動きと再生順序</h2><div data-animation-order></div></section>
      </main>
      <footer class="presenter-footer"><div class="presenter-navigation">${button('previous','前の動き・ページへ','previous')}${button('reset','このページをやり直す','reset')}${button('next','次の動き・ページへ','next')}<span data-progress></span></div><div class="presenter-visibility" role="group" aria-label="手元だけの非表示オブジェクトの見せ方"><span>非表示の図形</span>${[['hide','非表示'],['ghost','半透明'],['show','表示']].map(([mode,name])=>`<button type="button" data-hidden-mode="${mode}" aria-label="非表示の図形：${name}（手元のみ）" title="${name}（手元のみ）" aria-pressed="${hiddenMode===mode}">${icon(mode)}<span>${name}</span></button>`).join('')}</div></footer>`;
    document.body.append(dialog); document.body.style.overflow = 'hidden';
    const q = selector => dialog.querySelector(selector);
    const viewport = key => q(`[data-preview="${key}"]`);
    const surface = key => q(`[data-preview-paper="${key}"]`);
    const act = key => q(`[data-presenter-action="${key}"]`);

    function fit() {
      for (const element of dialog.querySelectorAll('[data-preview-paper]')) {
        const svg = element.querySelector('svg'), container = element.parentElement;
        if (!svg || !container.clientWidth) continue;
        const box = svg.viewBox.baseVal, ratio = box.width / box.height || 1;
        const width = Math.max(1, Math.min(container.clientWidth, container.clientHeight * ratio));
        element.style.width = width + 'px'; element.style.height = width / ratio + 'px';
      }
    }
    function snapshot() {
      const state = master.getState();
      return {pageId: included[index].id, step: state.step, time: Math.min(state.time, state.duration), playing: state.playing};
    }
    function post(kind, payload = {}) {
      if (!audience || audience.closed) return;
      try { audience.postMessage({channel, token, kind, ...payload}, targetOrigin); } catch (_) { connected = false; }
    }
    function broadcast() {
      if (closed || !master || !connected) return;
      post('state', {state: snapshot(), sentAt: Date.now(), sequence: ++sequence});
    }
    function connection(message) {
      q('[data-connection-status]').textContent = message;
      act('screen').querySelector('span').textContent = connected && !hasConnectionError ? '投影画面を手前に' : '投影画面を開く';
    }
    function openAudience() {
      if (closed) return;
      if (audience && !audience.closed && connected && !hasConnectionError) { audience.focus(); return; }
      // この呼出しはクリックの処理内に置き、ポップアップ許可を失わない。
      if (audience && !audience.closed) audience.close();
      connected = false; hasConnectionError = false;
      audience = root.open(audienceURL.href, 'illustslide-audience-' + token, 'popup,width=1100,height=720');
      if (!audience) { connection('投影画面を開けませんでした。ポップアップを許可して「投影画面を開く」を押してください。'); return; }
      openedAt = Date.now();
      connection('投影画面へ接続中… 別画面へ移動して「全画面」を押してください。');
    }
    function setPreview(key, page, step = 0, time = Infinity) {
      const target = surface(key); target.replaceChildren();
      viewport(key).classList.toggle('is-empty', !page);
      if (!page) { target.textContent = key === 'next' ? '最後のページです' : '発表の最後です'; target.removeAttribute('style'); return; }
      const player = Player.create(target, page, {hiddenMode}); player.seek(step, time);
      previewPlayers.push(player);
    }
    function previews() {
      const state = master.getState(), key = [index,state.step,state.playing,hiddenMode].join('|');
      if (key === previewKey) return;
      previewKey = key; previewPlayers.forEach(player => player.destroy()); previewPlayers = [];
      const next = included[index + 1];
      q('[data-next-page-caption]').textContent = next ? next.name : '';
      setPreview('next', next);
      if (state.playing) {
        q('[data-next-action-caption]').textContent = '再生中の動きが完了'; setPreview('action', included[index], state.step);
      } else if (state.step < state.steps) {
        q('[data-next-action-caption]').textContent = `クリック ${state.step + 1} の完了後`; setPreview('action', included[index], state.step + 1);
      } else {
        q('[data-next-action-caption]').textContent = next ? '次のページへ' : ''; setPreview('action', next);
      }
      fit();
    }
    function order() {
      const outPage = output.pages[index];
      pagePlan = A.compile(outPage);
      const ui = root.IlapoAnimationUI;
      q('[data-animation-order]').innerHTML = pagePlan.groups.filter(group => group.items.length).map(group => `<div class="presenter-animation-group" data-animation-group="${group.index}"><strong>${group.index ? 'クリック '+group.index : '自動で開始'}</strong>${group.items.map(item=>{
        const animation = item.animation, names = animation.targets.map(id=>outPage.objects.find(object=>object.id===id)?.name||'図形').join('、');
        return `<div class="presenter-animation-item">${root.IlapoObjectPreview.markup(outPage,animation.targets)}<span title="${esc(ui.effectLabel(animation))}">${ui.effectIcon(animation)}</span><span class="presenter-animation-name">${esc(names)}<small>${esc(ui.effectLabel(animation))} · ${item.start/1000}秒〜 / ${animation.duration/1000}秒間</small></span><span title="${esc({click:'クリック時',with:'前の動きと同時',after:'前の動きの後'}[animation.trigger])}">${ui.triggerIcon(animation.trigger)}</span></div>`;
      }).join('')}</div>`).join('') || '<p class="presenter-muted">このページに動きはありません。</p>';
    }
    function update() {
      if (closed || suppress || !master) return;
      const page = included[index], state = master.getState();
      q('[data-progress]').textContent = `${index+1} / ${included.length}` + (state.steps ? ` · 動き ${state.step} / ${state.steps}` : '');
      q('[data-current-caption]').textContent = page.name + (state.playing ? ' · 再生中' : '');
      act('previous').disabled = index === 0 && state.step === 0;
      act('next').disabled = index === included.length-1 && state.step === state.steps && !state.playing;
      act('reset').disabled = !pagePlan?.groups.some(group=>group.items.length);
      for (const row of dialog.querySelectorAll('[data-animation-group]')) {
        const groupIndex = Number(row.dataset.animationGroup);
        row.classList.toggle('is-current', groupIndex === state.step);
        row.classList.toggle('is-complete', groupIndex < state.step || groupIndex === state.step && !state.playing);
        row.classList.toggle('is-next', groupIndex === state.step + 1);
      }
      previews(); broadcast();
    }
    function render(atEnd = false) {
      suppress = true; master?.destroy();
      const page = included[index];
      master = Player.create(surface('current'), page, {hiddenMode, onChange:update});
      q('[data-notes]').textContent = page.notes || 'このページにノートはありません。';
      order(); previewKey = '';
      if (atEnd) master.seek(master.getState().steps);
      else if (hasStarted) master.reset();
      else master.seek(0,0);
      suppress = false; update(); fit();
    }
    function next() { if (closed) return; if (!hasStarted) begin(); else if (!master.next() && index < included.length-1) { index++; render(); } }
    function previous() { if (closed) return; if (!master.previous() && index > 0) { index--; render(true); } }
    function reset() { if (!hasStarted) begin(); else master.reset(); }
    function begin() { hasStarted = true; startTime ??= Date.now(); master.reset(); }
    function setHiddenMode(mode) {
      if (!['hide','ghost','show'].includes(mode)) return;
      hiddenMode = mode;
      try { localStorage.setItem(hiddenKey, mode); } catch (_) {}
      suppress = true; master.setHiddenMode(mode); suppress = false;
      for (const button of dialog.querySelectorAll('[data-hidden-mode]')) button.setAttribute('aria-pressed', String(button.dataset.hiddenMode === mode));
      previews(); fit();
    }
    const commands = {
      next, previous, reset,
      first:()=>{index=0;render();}, last:()=>{index=included.length-1;render(true);},
      close, screen:openAudience,
    };
    function receive(event) {
      const message = event.data;
      if (closed || event.source !== audience || event.origin !== location.origin || !message || message.channel !== channel || message.token !== token) return;
      if (message.kind === 'ready') {
        connected = true; lastAck = Date.now(); hasConnectionError = false;
        post('init', {document: output});
        if (!hasStarted) begin(); else broadcast();
        connection('投影画面に接続しました。別画面へ移動して「全画面」を押してください。');
      } else if (message.kind === 'ack') {
        lastAck = Date.now();
        if (hasConnectionError) { hasConnectionError = false; connection('投影画面に接続しました。'); }
      } else if (message.kind === 'command' && ['next','previous','reset','first','last'].includes(message.command)) commands[message.command]();
      else if (message.kind === 'error') { hasConnectionError = true; connection('投影画面を表示できませんでした。「投影画面を開く」からやり直してください。'); connected = false; }
    }
    function tick() {
      if (closed) return;
      const seconds = startTime === null ? 0 : Math.floor((Date.now()-startTime)/1000);
      q('.presenter-clock').textContent = `${String(Math.floor(seconds/60)).padStart(2,'0')}:${String(seconds%60).padStart(2,'0')}`;
      if (audience?.closed) { audience = null; connected = false; connection('投影画面が閉じられました。再び開くと現在の位置から続けられます。'); }
      else if (audience && !connected && !hasConnectionError && Date.now()-openedAt > 10000) { hasConnectionError = true; connection('投影画面の接続に時間がかかっています。「投影画面を開く」からやり直せます。'); }
      else if (connected && Date.now()-lastAck > 10000 && !hasConnectionError) { hasConnectionError = true; connection('投影画面との接続を確認しています。必要なら投影画面を開き直してください。'); }
      broadcast();
    }
    function keydown(event) {
      event.stopPropagation();
      if (event.isComposing) return;
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.target.closest('input,textarea,select,summary') || event.altKey || event.metaKey || event.ctrlKey) return;
      if ([' ','Enter'].includes(event.key) && event.target.closest('button')) return;
      const command = {ArrowRight:'next',PageDown:'next',' ':'next',Enter:'next',ArrowLeft:'previous',PageUp:'previous',Home:'first',End:'last',r:'reset',R:'reset'}[event.key];
      if (command) { event.preventDefault(); commands[command](); }
    }
    function close() {
      if (closed) return;
      post('end'); closed = true;
      master?.destroy(); previewPlayers.forEach(player=>player.destroy());
      clearInterval(timer); observer.disconnect();
      root.removeEventListener('message', receive); root.removeEventListener('pagehide', close);
      if (audience && !audience.closed) audience.close();
      dialog.close(); dialog.remove(); document.body.style.overflow = oldOverflow;
      if (active?._dialog === dialog) active = null;
      if (opener?.isConnected) opener.focus({preventScroll:true});
    }
    dialog.addEventListener('keydown', keydown);
    dialog.addEventListener('cancel', event=>{event.preventDefault();close();});
    dialog.addEventListener('click', event=>{
      const button=event.target.closest('button');
      if (button?.dataset.presenterAction) commands[button.dataset.presenterAction]?.();
      if (button?.dataset.hiddenMode) setHiddenMode(button.dataset.hiddenMode);
    });
    root.addEventListener('message', receive); root.addEventListener('pagehide', close);
    const observer = new ResizeObserver(fit); dialog.querySelectorAll('.presenter-preview').forEach(el=>observer.observe(el));
    const timer = setInterval(tick,1000);
    dialog.showModal(); render();
    active = {_dialog:dialog,close,next,previous,reset,setHiddenMode,getState:()=>({open:!closed,pageId:included[index].id,index,total:included.length,animation:master.getState(),hiddenMode,connected})};
    openAudience(); act('next').focus({preventScroll:true});
    return active;
  }
  root.IlapoPresenter = Object.freeze({open, getState:()=>active?.getState()||{open:false}});
}(globalThis));
