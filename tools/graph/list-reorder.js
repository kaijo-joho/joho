/* グラフ一覧のドラッグとキーボードによる並べ替え。 */
(function (global) {
  'use strict';

  const START_DISTANCE = 6;
  const AUTO_SCROLL_EDGE = 40;
  const AUTO_SCROLL_STEP = 12;
  const CLICK_SUPPRESS_MS = 400;
  const INTERACTIVE = 'input, select, textarea, button, a, [contenteditable="true"], [data-object-menu], [data-no-reorder]';

  function bind(root, options = {}) {
    if (!root || typeof root.addEventListener !== 'function') throw new TypeError('root is required');
    const onMove = typeof options.onMove === 'function' ? options.onMove : () => {};
    const onStart = typeof options.onStart === 'function' ? options.onStart : () => {};
    let state = null;
    let suppressClick = null;
    let destroyed = false;

    const rows = () => [...root.querySelectorAll('[data-reorder-type][data-reorder-id]')].filter(row => row.parentElement?.querySelectorAll(':scope > [data-reorder-type][data-reorder-id]').length);
    const siblingRows = row => [...row.parentElement.children].filter(item => item.dataset?.reorderType && item.dataset?.reorderId);
    const typeRows = (type, parent) => siblingRows(parent ? { parentElement: parent } : { parentElement: root }).filter(row => row.dataset.reorderType === type);
    const clearMarks = () => rows().forEach(row => row.classList.remove('is-reordering', 'reorder-before', 'reorder-after', 'reorder-source'));
    const groupRows = source => {
      const all = siblingRows(source), index = all.indexOf(source), type = source.dataset.reorderType;
      const result = [source];
      for (let i = index - 1; i >= 0 && all[i].dataset.reorderType === type; i--) result.unshift(all[i]);
      for (let i = index + 1; i < all.length && all[i].dataset.reorderType === type; i++) result.push(all[i]);
      return result;
    };
    const cleanup = () => {
      if (!state) return;
      const previous = state;
      state = null;
      try { previous.row.releasePointerCapture?.(previous.pointerId); } catch (_) { /* 既に解除済み */ }
      if (previous.raf) global.cancelAnimationFrame?.(previous.raf);
      clearMarks();
    };
    const armClickSuppression = (pointerId, x, y) => {
      const rect = root.getBoundingClientRect();
      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) return;
      suppressClick = { pointerId, x, y, until: Date.now() + CLICK_SUPPRESS_MS };
    };
    const cancel = () => {
      if (state?.started) armClickSuppression(state.pointerId, state.lastX ?? state.startX, state.lastY ?? state.startY);
      cleanup();
    };
    const start = (row, event) => {
      if (state || destroyed) return;
      state = { row, pointerId: event.pointerId, startX: event.clientX, startY: event.clientY, started: false, destination: null, lastY: event.clientY };
      row.classList.add('reorder-source');
    };
    const preview = (event) => {
      if (!state) return;
      state.lastX = event.clientX;
      state.lastY = event.clientY;
      if (!state.started) {
        if (Math.hypot(event.clientX - state.startX, event.clientY - state.startY) < START_DISTANCE) return;
        state.started = true;
        state.group = groupRows(state.row);
        state.type = state.row.dataset.reorderType;
        state.groupIndexes = state.group.map(row => typeRows(state.type, row.parentElement).indexOf(row));
        onStart();
        state.row.classList.add('is-reordering');
        try { state.row.setPointerCapture(event.pointerId); } catch (_) { /* DOMによっては捕捉を利用できない */ }
        state.raf = global.requestAnimationFrame?.(autoTick);
      }
      autoscroll(event.clientY);
      const group = state.group;
      const rootRect = root.getBoundingClientRect();
      const groupTop = group[0].getBoundingClientRect().top;
      const groupBottom = group[group.length - 1].getBoundingClientRect().bottom;
      if (event.clientX < rootRect.left || event.clientX > rootRect.right || event.clientY < groupTop || event.clientY > groupBottom) {
        clearMarks(); state.row.classList.add('is-reordering'); state.destination = null; return;
      }
      const target = group.find(row => row !== state.row && (() => { const rect = row.getBoundingClientRect(); return event.clientY < (rect.top + rect.bottom) / 2; })()) || group[group.length - 1];
      if (!target || !root.contains(target)) return;
      const targetRect = target.getBoundingClientRect();
      const after = event.clientY >= (targetRect.top + targetRect.bottom) / 2;
      let index = typeRows(state.type, state.row.parentElement).indexOf(target) + (after ? 1 : 0);
      const sourceIndex = typeRows(state.type, state.row.parentElement).indexOf(state.row);
      if (index > sourceIndex) index--;
      const groupMin = state.groupIndexes[0], groupMax = state.groupIndexes[state.groupIndexes.length - 1];
      if (index < groupMin || index > groupMax) { clearMarks(); state.row.classList.add('is-reordering'); state.destination = null; return; }
      clearMarks();
      state.row.classList.add('is-reordering', 'reorder-source');
      target.classList.add(after ? 'reorder-after' : 'reorder-before');
      state.destination = index;
    };
    const autoscroll = y => {
      const rect = root.getBoundingClientRect();
      if (y < rect.top + AUTO_SCROLL_EDGE) root.scrollTop -= AUTO_SCROLL_STEP;
      else if (y > rect.bottom - AUTO_SCROLL_EDGE) root.scrollTop += AUTO_SCROLL_STEP;
    };
    const autoTick = () => {
      if (!state?.started) return;
      const before = root.scrollTop;
      autoscroll(state.lastY);
      if (root.scrollTop !== before) preview({ clientX: state.lastX, clientY: state.lastY });
      state.raf = global.requestAnimationFrame?.(autoTick);
    };
    const finish = event => {
      if (!state) return;
      if (!state.started) { cleanup(); return; }
      const rect = root.getBoundingClientRect();
      const inside = event.clientX >= rect.left && event.clientX <= rect.right && event.clientY >= rect.top && event.clientY <= rect.bottom;
      const destination = inside ? state.destination : null;
      const row = state.row, type = state.type, id = row.dataset.reorderId;
      armClickSuppression(state.pointerId, event.clientX, event.clientY);
      cleanup();
      if (destination == null) return;
      const current = typeRows(type, row.parentElement).indexOf(row);
      if (destination !== current) onMove(type, id, destination);
    };
    const keydown = event => {
      if (state && event.key === 'Escape') { event.preventDefault(); cancel(); return; }
      if (destroyed || !event.altKey || event.defaultPrevented) return;
      const row = event.target.closest?.('[data-reorder-type][data-reorder-id]');
      if (!row || !root.contains(row) || event.target.closest(INTERACTIVE.replace('button, ', '').replace('a, ', ''))) return;
      const group = groupRows(row), type = row.dataset.reorderType, index = typeRows(type, row.parentElement).indexOf(row);
      let destination = null;
      if (event.key === 'ArrowUp' || event.code === 'ArrowUp') destination = index - 1;
      if (event.key === 'ArrowDown' || event.code === 'ArrowDown') destination = index + 1;
      if (event.key === 'Home' || event.code === 'Home') destination = typeRows(type, row.parentElement).indexOf(group[0]);
      if (event.key === 'End' || event.code === 'End') destination = typeRows(type, row.parentElement).indexOf(group[group.length - 1]);
      const min = typeRows(type, row.parentElement).indexOf(group[0]), max = typeRows(type, row.parentElement).indexOf(group[group.length - 1]);
      if (destination == null || destination < min || destination > max || destination === index) return;
      event.preventDefault(); onStart(); onMove(type, row.dataset.reorderId, destination); row.focus?.();
    };
    const pointerdown = event => {
      // 同じ位置でも、押し直したときは新しい操作として扱う。
      suppressClick = null;
      if (destroyed || event.button !== 0) return;
      const row = event.target.closest?.('[data-reorder-type][data-reorder-id]');
      if (!row || !root.contains(row)) return;
      const isMouse = event.pointerType === 'mouse';
      const grip = event.target.closest('[data-reorder-handle]');
      const surface = event.target.closest('.object-item, .parameter-name');
      const blocked = event.target.closest('input, select, textarea, a, [contenteditable="true"], [data-object-menu], [data-no-reorder]');
      const otherButton = event.target.closest('button') && !surface;
      if (blocked || otherButton || (!isMouse && !grip) || (isMouse && (!surface || !row.contains(surface)))) return;
      start(row, event);
    };
    const pointermove = event => { if (state && event.pointerId === state.pointerId) preview(event); };
    const pointerup = event => { if (state && event.pointerId === state.pointerId) finish(event); };
    const pointercancel = event => { if (state && event.pointerId === state.pointerId) cancel(); };
    // タッチ開始時の子要素から行へ捕捉を移すときは取り消さない。
    const lostcapture = event => { if (state && event.pointerId === state.pointerId && event.target === state.row) cancel(); };
    const blur = () => cancel();
    const click = event => {
      const pending = suppressClick;
      if (!pending) return;
      if (Date.now() > pending.until) { suppressClick = null; return; }
      const pointerId = event.pointerId || 0;
      const near = Math.hypot((event.clientX || 0) - pending.x, (event.clientY || 0) - pending.y) <= 12;
      const rect = root.getBoundingClientRect();
      const inside = (event.clientX || 0) >= rect.left && (event.clientX || 0) <= rect.right && (event.clientY || 0) >= rect.top && (event.clientY || 0) <= rect.bottom;
      if (event.detail > 0 && near && inside && (pointerId === 0 || pointerId === pending.pointerId)) {
        event.preventDefault(); event.stopImmediatePropagation(); suppressClick = null;
      }
    };
    root.addEventListener('pointerdown', pointerdown);
    global.document?.addEventListener('pointermove', pointermove);
    global.document?.addEventListener('pointerup', pointerup);
    global.document?.addEventListener('pointercancel', pointercancel);
    global.document?.addEventListener('lostpointercapture', lostcapture);
    root.addEventListener('keydown', keydown);
    global.addEventListener('blur', blur);
    global.document?.addEventListener('click', click, true);
    return { cancel, destroy() { if (destroyed) return; destroyed = true; cleanup(); root.removeEventListener('pointerdown', pointerdown); global.document?.removeEventListener('pointermove', pointermove); global.document?.removeEventListener('pointerup', pointerup); global.document?.removeEventListener('pointercancel', pointercancel); global.document?.removeEventListener('lostpointercapture', lostcapture); root.removeEventListener('keydown', keydown); global.removeEventListener('blur', blur); global.document?.removeEventListener('click', click, true); }, get active() { return !!state?.started; } };
  }
  global.GraphListReorder = Object.freeze({ bind });
})(typeof window === 'object' ? window : globalThis);
