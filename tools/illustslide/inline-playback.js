/* Play a temporary page in the current canvas, keeping the editor layout. */
(function (root) {
  'use strict';
  function create({canvas, stage, scope}) {
    const artwork = document.createElementNS('http://www.w3.org/2000/svg', 'g');
    artwork.id = 'inline-playback-artwork';
    artwork.setAttribute('pointer-events', 'none');
    canvas.querySelector('#pixel-grid').before(artwork);
    const controls = document.createElement('nav');
    controls.id = 'inline-playback-controls';
    controls.setAttribute('aria-label', 'キャンバス内の再生操作');
    controls.hidden = true;
    const icon = path => `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${path}</svg>`;
    const button = (id, label, path) => `<button type="button" id="${id}" aria-label="${label}" data-tip="${label}">${icon(path)}</button>`;
    controls.innerHTML = button('inline-playback-reset','最初から再生','<path d="M4 10a8 8 0 1 1 1 8M4 4v6h6"/>')
      + button('inline-playback-previous','前の動きへ','<path d="M17 5 7 12l10 7Z"/>')
      + button('inline-playback-next','次の動きを再生','<path d="m7 5 10 7-10 7Z"/>')
      + '<span id="inline-playback-status"></span>'
      + button('inline-playback-stop','再生を終了して編集へ戻る','<rect x="5" y="5" width="14" height="14" rx="1"/>');
    stage.append(controls);
    const byId = id => controls.querySelector('#inline-playback-' + id);
    let player = null, sourceScope = null, opener = null;
    function update() {
      if (!player) return;
      const state = player.getState();
      byId('status').textContent = `${state.step} / ${state.steps}`;
      byId('status').dataset.tip = state.playing ? '再生中' : state.step < state.steps ? 'クリックで次へ' : '再生完了';
      byId('previous').disabled = !state.step;
      byId('next').disabled = !state.playing && state.step >= state.steps;
      byId('next').setAttribute('aria-label', state.playing ? '再生中の動きを完了' : '次の動きを再生');
      byId('next').dataset.tip = byId('next').getAttribute('aria-label');
    }
    function stop({focus = false} = {}) {
      if (!player) return;
      player.destroy(); player = null;
      artwork.replaceChildren(); controls.hidden = true;
      stage.classList.remove('inline-playback-active');
      if (focus) {
        const target = opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]') ? opener : canvas;
        target.focus({preventScroll:true});
      }
      opener = null; sourceScope = null;
    }
    function restart() {
      if (!player) return;
      player.reset();
      // Play starts the first click group unless an automatic group precedes it.
      if (!player.getState().duration) player.next();
      update();
    }
    function play(page) {
      stop();
      opener = document.activeElement; sourceScope = scope();
      const holder = document.createElement('div');
      player = root.IlapoAnimationPlayer.create(holder, page, {onChange:update});
      // Live nodes retain the player's references and the canvas coordinates.
      artwork.replaceChildren(...player.svg.childNodes);
      stage.classList.add('inline-playback-active'); controls.hidden = false;
      restart();
      (byId('next').disabled ? byId('stop') : byId('next')).focus({preventScroll:true});
    }
    byId('reset').onclick = restart;
    byId('previous').onclick = () => { player?.previous(); update(); };
    byId('next').onclick = () => { player?.next(); update(); };
    byId('stop').onclick = () => stop({focus:true});
    canvas.addEventListener('click', event => {
      if (!player || event.detail > 1) return;
      event.preventDefault(); event.stopImmediatePropagation();
      player.next(); update();
    }, true);
    stage.addEventListener('keydown', event => {
      if (!player || event.isComposing || event.key === 'Tab') return;
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); stop({focus:true}); return; }
      if (event.target.closest('button') && [' ', 'Enter'].includes(event.key)) { event.stopPropagation(); return; }
      event.stopPropagation();
      if ([' ', 'Enter', 'ArrowRight', 'ArrowDown'].includes(event.key)) { event.preventDefault(); player.next(); update(); }
      else if (['ArrowLeft', 'ArrowUp'].includes(event.key)) { event.preventDefault(); player.previous(); update(); }
      else if (event.key === 'Home') { event.preventDefault(); restart(); }
    });
    return {
      play, stop,
      sync() { if (player && sourceScope !== scope()) stop(); },
      get active() { return !!player; },
      getState() { return player ? {active:true,...player.getState()} : {active:false}; }
    };
  }
  root.IlapoInlinePlayback = {create};
}(globalThis));
