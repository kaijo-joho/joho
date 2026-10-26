/* 列配置だけを記憶する。文書・本人情報・接続先・プレビュー内容には触れない。 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.HtmlEditorLayout = api;
})(typeof window === 'object' ? window : null, function () {
  'use strict';
  const KEY = 'joho.htmleditor.layout.v1';
  const DEFAULTS = Object.freeze({v:1, leftRatio:.32, rightRatio:.5, leftCollapsed:false, rightCollapsed:false});
  const clamp = (value, minimum, maximum) => Math.max(minimum, Math.min(maximum, value));
  function parse(value) {
    try {
      const data = JSON.parse(value);
      if (!data || data.v !== 1 || !['leftRatio','rightRatio'].every(key =>
        typeof data[key] === 'number' && Number.isFinite(data[key]) && data[key] >= .05 && data[key] <= .95) ||
        !['leftCollapsed','rightCollapsed'].every(key => typeof data[key] === 'boolean')) return {...DEFAULTS};
      return Object.fromEntries(Object.keys(DEFAULTS).map(key => [key, data[key]]));
    } catch { return {...DEFAULTS}; }
  }
  function mount({document:doc, window:win, storage = null, onChange = () => {}, onStorageError = () => {}}) {
    const get = id => doc.getElementById(id);
    const body = doc.body, main = get('mainContainer'), editing = get('editingPanes');
    const compact = () => win.matchMedia('(max-width: 1050px)').matches;
    const controls = {
      left:{pane:get('leftPane'), bar:get('splitLeft'), menu:get('toggleLessonBtn'), label:'解説', sign:1},
      right:{pane:get('rightPane'), bar:get('splitRight'), menu:get('togglePreviewBtn'), label:'プレビュー', sign:-1}
    };
    let state = {...DEFAULTS}, gesture = null, queued = false, failed = false, disposed = false;
    const listeners = [];
    const listen = (node, type, action) => { node.addEventListener(type, action); listeners.push(() => node.removeEventListener(type, action)); };
    function storageFailed() { if (!failed) { failed = true; onStorageError(); } }
    try { if (storage) state = parse(storage.getItem(KEY)); } catch { storageFailed(); }
    function persist(reset = false) {
      if (!storage) return;
      try { if (reset) storage.removeItem(KEY); else storage.setItem(KEY, JSON.stringify(state)); }
      catch { storageFailed(); }
    }
    function changed() {
      if (queued || disposed) return;
      queued = true;
      win.requestAnimationFrame(() => { queued = false; if (!disposed) onChange(); });
    }
    function bounds(side) {
      const extent = side === 'left' ? main.clientWidth : editing.clientWidth;
      const barWidth = controls[side].bar.getBoundingClientRect().width || 10;
      const reserve = side === 'left' ? 280 + (body.classList.contains('has-document') && !state.rightCollapsed ? 250 : 0) : 280;
      const maximum = Math.max(0, Math.min(extent - reserve - barWidth, extent * (side === 'left' ? .65 : .8)));
      return {extent, maximum, minimum:Math.min(side === 'left' ? 220 : 240, maximum)};
    }
    function attribute(node, key, value) {
      value = String(value);
      if (node.getAttribute(key) !== value) node.setAttribute(key, value);
    }
    function render() {
      if (disposed) return;
      for (const [side, control] of Object.entries(controls)) {
        const collapsed = state[side + 'Collapsed'];
        const className = side + '-collapsed';
        if (body.classList.contains(className) !== collapsed) body.classList.toggle(className, collapsed);
        const size = bounds(side);
        if (!compact() && size.extent > 0 && !collapsed) {
          const width = clamp(size.extent * state[side + 'Ratio'], size.minimum, size.maximum);
          if (Math.abs(control.pane.getBoundingClientRect().width - width) > .5) control.pane.style.width = width + 'px';
          control.pane.style.flex = 'none';
        }
        const action = control.label + (collapsed ? 'を再表示' : 'を折りたたむ');
        attribute(control.bar, 'aria-label', action + '。左右矢印キーで幅を調整');
        attribute(control.bar, 'aria-controls', control.pane.id);
        attribute(control.bar, 'aria-valuemin', 0);
        attribute(control.bar, 'aria-valuemax', Math.round(size.maximum));
        attribute(control.bar, 'aria-valuenow', collapsed ? 0 : Math.min(Math.round(control.pane.getBoundingClientRect().width), Math.round(size.maximum)));
        attribute(control.bar, 'aria-valuetext', collapsed ? '折りたたみ中' : '表示中。Enterで折りたたむ');
        control.bar.dataset.collapsed = String(collapsed);
        control.bar.dataset.tip = action + '（クリック／Enter）。ドラッグで幅を調整し、端へ寄せると折りたたみます。';
        const arrow = control.bar.querySelector('.splitter-arrow');
        if (arrow) arrow.textContent = (side === 'left') !== collapsed ? '‹' : '›';
        attribute(control.menu, 'aria-pressed', collapsed);
        control.menu.textContent = action;
      }
      controls.right.menu.disabled = !body.classList.contains('has-document');
      changed();
    }
    function setCollapsed(side, collapsed, save = true) {
      const control = controls[side];
      if (!control || state[side + 'Collapsed'] === Boolean(collapsed)) return;
      if (collapsed && control.pane.contains(doc.activeElement)) control.bar.focus({preventScroll:true});
      state[side + 'Collapsed'] = Boolean(collapsed);
      render();
      if (save) persist();
    }
    function toggle(side) { if (controls[side]) setCollapsed(side, !state[side + 'Collapsed']); }
    function resize(side, width) {
      const size = bounds(side);
      if (width < 72) { setCollapsed(side, true, false); return; }
      if (!size.extent || !size.maximum) return;
      state[side + 'Collapsed'] = false;
      state[side + 'Ratio'] = clamp(clamp(width, size.minimum, size.maximum) / size.extent, .05, .95);
      render();
    }
    function finish(event, cancel = false) {
      if (!gesture || event.pointerId !== undefined && event.pointerId !== gesture.pointerId) return;
      const active = gesture; gesture = null;
      body.classList.remove('pane-resizing');
      if (cancel) { state = active.before; render(); }
      else if (active.dragged) persist();
      else toggle(active.side);
      try { if (active.bar.hasPointerCapture(active.pointerId)) active.bar.releasePointerCapture(active.pointerId); } catch { /* 既に失われたcaptureは解放不要。 */ }
    }
    for (const [side, control] of Object.entries(controls)) {
      listen(control.bar, 'pointerdown', event => {
        if (gesture || compact() || event.button !== 0 || event.isPrimary === false) return;
        event.preventDefault(); control.bar.focus({preventScroll:true});
        gesture = {side, bar:control.bar, pointerId:event.pointerId, startX:event.clientX,
          width:state[side + 'Collapsed'] ? 0 : control.pane.getBoundingClientRect().width, before:{...state}, dragged:false};
        try { control.bar.setPointerCapture(event.pointerId); } catch { /* 合成イベントにはcaptureがない。 */ }
      });
      listen(control.bar, 'pointermove', event => {
        if (!gesture || gesture.side !== side || gesture.pointerId !== event.pointerId) return;
        const delta = event.clientX - gesture.startX;
        if (Math.abs(delta) >= 5) gesture.dragged = true;
        if (!gesture.dragged) return;
        body.classList.add('pane-resizing');
        resize(side, gesture.width + delta * control.sign);
      });
      listen(control.bar, 'pointerup', event => finish(event));
      listen(control.bar, 'pointercancel', event => finish(event, true));
      listen(control.bar, 'lostpointercapture', event => finish(event, true));
      // 支援技術のclickはpointerイベントを伴わない。通常クリックはpointerupだけで扱う。
      listen(control.bar, 'click', event => { if (event.detail === 0 && !gesture) toggle(side); });
      listen(control.bar, 'keydown', event => {
        if (gesture || event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
        if (['Enter',' '].includes(event.key)) { event.preventDefault(); toggle(side); return; }
        if (!['ArrowLeft','ArrowRight','Home'].includes(event.key)) return;
        event.preventDefault();
        if (event.key === 'Home') { setCollapsed(side, true); return; }
        const direction = (event.key === 'ArrowRight' ? 1 : -1) * control.sign;
        const width = control.pane.getBoundingClientRect().width;
        if (state[side + 'Collapsed']) { if (direction > 0) setCollapsed(side, false); return; }
        if (direction < 0 && width <= bounds(side).minimum + 1) setCollapsed(side, true);
        else { resize(side, width + 20 * direction); persist(); }
      });
    }
    listen(win, 'blur', () => { if (gesture) finish({pointerId:gesture.pointerId}, true); });
    listen(win, 'resize', () => { if (gesture) finish({pointerId:gesture.pointerId}, true); render(); });
    const observer = win.ResizeObserver ? new win.ResizeObserver(render) : null;
    observer?.observe(main); observer?.observe(editing);
    let hadDocument = body.classList.contains('has-document');
    const documentObserver = win.MutationObserver ? new win.MutationObserver(() => {
      const hasDocument = body.classList.contains('has-document');
      if (hadDocument !== hasDocument) { hadDocument = hasDocument; render(); }
    }) : null;
    documentObserver?.observe(body, {attributes:true, attributeFilter:['class']});
    render();
    return Object.freeze({
      toggle, setCollapsed, refresh:render,
      reset() { if (gesture) finish({pointerId:gesture.pointerId}, true); state = {...DEFAULTS}; persist(true); render(); },
      get state() { return {...state}; },
      dispose() { if (gesture) finish({pointerId:gesture.pointerId}, true); disposed = true; observer?.disconnect(); documentObserver?.disconnect(); listeners.forEach(remove => remove()); }
    });
  }
  return Object.freeze({mount, parse, defaults:DEFAULTS, storageKey:KEY});
});
