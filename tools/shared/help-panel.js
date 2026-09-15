// エディタを操作しながら読める共通ヘルプ。本文とアプリの編集処理には依存しない。
(() => {
  'use strict';
  const instances = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text) node.textContent = text;
    return node;
  }
  function button(label, text, className = '') {
    const node = element('button', className, text);
    node.type = 'button'; node.tabIndex = 0;
    node.setAttribute('aria-label', label); node.dataset.tip = label;
    return node;
  }
  function drawIcon(node, pathData) {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('aria-hidden', 'true');
    const path = document.createElementNS(svg.namespaceURI, 'path'); path.setAttribute('d', pathData);
    svg.append(path); node.replaceChildren(svg);
  }

  function create({ root, opener, storageKey, title = '使い方', bounds, initialRight,
    isBusy = () => false, returnToEditor = () => opener.focus({ preventScroll: true }) }) {
    if (!root?.id || !opener) throw new Error('ヘルプの本文と開くボタンを指定してください。');
    if (instances.has(root)) return instances.get(root);
    const topics = [...root.querySelectorAll(':scope > [data-help-topic]')];
    const ids = topics.map(node => node.dataset.helpTopic);
    if (!topics.length || ids.some(id => !/^[a-z][a-z0-9-]*$/.test(id)) || new Set(ids).size !== ids.length) {
      throw new Error('ヘルプの項目IDは重複しない英数字で指定してください。');
    }
    let stored = {};
    try {
      const raw = storageKey && localStorage.getItem(storageKey);
      if (raw && raw.length <= 8192) {
        const value = JSON.parse(raw);
        if (value?.version === 1) stored = value;
      }
    } catch (_) { /* UI設定を保存できなくても、ヘルプと編集は使える。 */ }
    let geometry = stored.geometry;
    if (!geometry || !['x', 'y', 'width', 'height'].every(key => finite(geometry[key]) && Math.abs(geometry[key]) < 100000)) geometry = null;
    else geometry = { x: geometry.x, y: geometry.y, width: geometry.width, height: geometry.height };
    let compactHeight = finite(stored.compactHeight) ? clamp(stored.compactHeight, 160, 1600) : null;
    let selected = ids.includes(stored.topic) ? stored.topic : ids[0];
    const scrolls = Object.create(null);
    ids.forEach(id => { scrolls[id] = finite(stored.scrolls?.[id]) ? clamp(stored.scrolls[id], 0, 100000) : 0; });
    let minimized = false, drag = null, saveTimer, frame, destroyed = false, switching = false;
    const removers = [];
    function listen(target, type, callback, options) {
      target.addEventListener(type, callback, options);
      removers.push(() => target.removeEventListener(type, callback, options));
    }
    const header = element('div', 'tool-help__header');
    const heading = element('h2', 'tool-help__heading'); heading.setAttribute('aria-label', title);
    const move = button('ヘルプを移動', '', 'tool-help__move');
    const headingText = element('span', 'tool-help__heading-text', title);
    headingText.id = root.id + '-title';
    const current = element('span', 'tool-help__current');
    move.append(headingText, current); heading.append(move);
    const minimize = button('ヘルプを最小化', '', 'tool-help__icon'); drawIcon(minimize, 'M5 16h14');
    minimize.dataset.helpMinimize = '';
    const close = button('詳しい操作方法を閉じる', '', 'tool-help__icon'); drawIcon(close, 'M6 6l12 12M18 6L6 18'); close.dataset.helpClose = '';
    header.append(heading, minimize, close);
    const main = element('div', 'tool-help__main'); main.id = root.id + '-main';
    minimize.setAttribute('aria-controls', main.id); minimize.setAttribute('aria-expanded', 'true');
    const label = element('label', 'tool-help__topic-label');
    label.append(element('span', '', '項目'));
    const select = element('select', 'tool-help__topics'); select.setAttribute('aria-label', 'ヘルプの項目');
    topics.forEach(topic => {
      const option = element('option', '', topic.dataset.helpTitle || topic.querySelector('h3')?.textContent || topic.dataset.helpTopic);
      option.value = topic.dataset.helpTopic; select.append(option);
    });
    label.append(select);
    const content = element('div', 'tool-help__content');
    content.tabIndex = 0; content.setAttribute('aria-label', '選択した項目の説明'); content.append(...topics);
    main.append(label, content);
    const footer = element('div', 'tool-help__footer');
    const reset = button('ヘルプの位置とサイズを戻す', '位置を戻す');
    const returnButton = button('ヘルプを開いたまま編集へ戻る', '編集へ戻る');
    footer.append(reset, returnButton);
    const handles = ['e', 's', 'se'].map(edge => {
      const node = button('ヘルプのサイズを変更', '', 'tool-help__resize tool-help__resize--' + edge);
      if (edge === 'se') drawIcon(node, 'M6 18L18 6M12 18l6-6');
      node.dataset.helpResize = edge;
      node.dataset.tip = 'ドラッグ・矢印キーでサイズ変更。Shiftで大きく変更、Enterで標準サイズ。';
      return node;
    });
    root.replaceChildren(header, main, footer, ...handles);
    root.classList.add('tool-help'); root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'false'); root.setAttribute('aria-labelledby', headingText.id);
    opener.setAttribute('aria-haspopup', 'dialog'); opener.setAttribute('aria-controls', root.id); opener.setAttribute('aria-expanded', 'false');

    function area() {
      const viewport = window.visualViewport;
      const left = (viewport?.offsetLeft || 0) + 8, top = (viewport?.offsetTop || 0) + 8;
      const right = left + (viewport?.width || window.innerWidth) - 16;
      const bottom = top + (viewport?.height || window.innerHeight) - 16;
      const requested = bounds?.() || {};
      const a = { left: Math.max(left, finite(requested.left) ? requested.left : left),
        top: Math.max(top, finite(requested.top) ? requested.top : top),
        right: Math.min(right, finite(requested.right) ? requested.right : right),
        bottom: Math.min(bottom, finite(requested.bottom) ? requested.bottom : bottom) };
      if (a.right - a.left < 160 || a.bottom - a.top < 120) return { left, top, right, bottom };
      return a;
    }
    const compact = () => document.documentElement.clientWidth <= 850;
    function layout() {
      const a = area(), width = a.right - a.left, height = a.bottom - a.top;
      const small = compact();
      const maxHeight = small && height >= 360 ? height * .6 : height;
      const minHeight = Math.min(280, maxHeight);
      const headerHeight = Math.max(52, header.getBoundingClientRect().height);
      if (!geometry) geometry = { x: (initialRight?.() || a.right) - Math.min(400, width),
        y: Math.max(a.top, a.bottom - Math.min(440, height) - 12), width: 400, height: Math.min(440, height) };
      const w = small ? width : clamp(geometry.width, Math.min(320, width), Math.min(700, width));
      const h = minimized ? Math.min(headerHeight, height)
        : clamp(small ? compactHeight || height * .45 : geometry.height, minHeight, maxHeight);
      const x = small ? a.left : clamp(geometry.x, a.left, a.right - w);
      const y = small ? a.bottom - h : clamp(geometry.y, a.top, a.bottom - h);
      root.dataset.compact = String(small); root.dataset.minimized = String(minimized);
      root.style.left = `${Math.round(x)}px`; root.style.top = `${Math.round(y)}px`;
      root.style.width = `${Math.round(w)}px`; root.style.height = `${Math.round(h)}px`;
      const moveLabel = small ? 'ヘルプの高さを変更' : 'ヘルプを移動';
      if (move.getAttribute('aria-label') !== moveLabel) move.setAttribute('aria-label', moveLabel);
      move.dataset.tip = small ? '見出しを上下にドラッグ・上下キーで高さを変更。Shiftで大きく変更、Enterで標準位置。'
        : '見出しをドラッグ・矢印キーで移動。Shiftで大きく移動、Enterで標準位置。';
      handles.forEach(handle => { handle.hidden = small || minimized; });
      return { x, y, width: w, height: h };
    }
    function persist() {
      clearTimeout(saveTimer);
      if (!storageKey || destroyed) return;
      try { localStorage.setItem(storageKey, JSON.stringify({ version: 1, geometry, compactHeight, topic: selected, scrolls })); }
      catch (_) { /* ヘルプだけの設定。作品の保存状態へ波及させない。 */ }
    }
    function rememberScroll() { if (!root.hidden && !minimized && !switching) scrolls[selected] = content.scrollTop; }
    function selectTopic(id, remember = true) {
      if (!ids.includes(id)) return;
      if (remember) rememberScroll(); selected = id; switching = true;
      topics.forEach(topic => { topic.hidden = topic.dataset.helpTopic !== id; });
      select.value = id; current.textContent = select.selectedOptions[0].textContent;
      content.scrollTop = scrolls[id];
      requestAnimationFrame(() => { if (!destroyed && selected === id) { content.scrollTop = scrolls[id]; switching = false; } });
      persist();
    }
    function open(id) {
      if (destroyed || isBusy() || document.querySelector('dialog[open]')) return;
      if (!root.hidden) rememberScroll();
      root.hidden = false; minimized = false; main.hidden = false; footer.hidden = false;
      drawIcon(minimize, 'M5 16h14'); minimize.setAttribute('aria-label', 'ヘルプを最小化');
      minimize.dataset.tip = 'ヘルプを最小化'; minimize.setAttribute('aria-expanded', 'true');
      opener.setAttribute('aria-expanded', 'true');
      layout(); selectTopic(ids.includes(id) ? id : selected, false); select.focus({ preventScroll: true });
    }
    function closePanel(restoreFocus = true) {
      if (root.hidden) return;
      finish(true); rememberScroll(); persist(); root.hidden = true; opener.setAttribute('aria-expanded', 'false');
      if (restoreFocus) opener.focus({ preventScroll: true });
    }
    function toggleMinimized() {
      if (drag) return;
      rememberScroll(); minimized = !minimized; main.hidden = minimized; footer.hidden = minimized;
      drawIcon(minimize, minimized ? 'M5 5h14v14H5zM5 9h14' : 'M5 16h14');
      const text = minimized ? 'ヘルプを元の大きさに戻す' : 'ヘルプを最小化';
      minimize.setAttribute('aria-label', text); minimize.dataset.tip = text; minimize.setAttribute('aria-expanded', String(!minimized));
      layout();
      if (!minimized) content.scrollTop = scrolls[selected];
      minimize.focus({ preventScroll: true });
    }
    function resetGeometry() { geometry = null; compactHeight = null; layout(); persist(); }
    function finish(cancelled = false) {
      if (!drag) return;
      const previous = drag; drag = null;
      if (cancelled) { geometry = previous.geometry; compactHeight = previous.compactHeight; }
      if (previous.handle.hasPointerCapture(previous.id)) previous.handle.releasePointerCapture(previous.id);
      root.classList.remove('tool-help--dragging'); layout(); if (!cancelled) persist();
    }
    function startDrag(event, handle, kind) {
      if (event.button !== 0 || drag || isBusy() || (compact() && minimized)) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      const rect = layout();
      drag = { id: event.pointerId, handle, kind, x: event.clientX, y: event.clientY, rect,
        geometry: { ...geometry }, compactHeight };
      handle.setPointerCapture(event.pointerId); root.classList.add('tool-help--dragging');
    }
    function moveDrag(event) {
      if (event.pointerId !== drag?.id) return;
      event.preventDefault();
      const { rect, kind, x, y } = drag, dx = event.clientX - x, dy = event.clientY - y, a = area();
      if (compact()) compactHeight = rect.height - dy;
      else if (kind === 'move') geometry = { ...geometry, x: rect.x + dx, y: rect.y + dy };
      else geometry = { ...geometry, x: rect.x, y: rect.y,
        width: kind.includes('e') ? Math.min(rect.width + dx, a.right - rect.x) : rect.width,
        height: kind.includes('s') ? Math.min(rect.height + dy, a.bottom - rect.y) : rect.height };
      const effective = layout();
      if (compact()) compactHeight = effective.height;
      else geometry = { ...effective, height: minimized ? geometry.height : effective.height };
    }
    function keyGeometry(event, kind) {
      if (isBusy() || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Home') { event.preventDefault(); event.stopPropagation(); resetGeometry(); return; }
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || (compact() && minimized)) return;
      const step = event.shiftKey ? 64 : 16, rect = layout();
      event.preventDefault(); event.stopPropagation();
      const dx = { ArrowLeft: -step, ArrowRight: step }[event.key] || 0;
      const dy = { ArrowUp: -step, ArrowDown: step }[event.key] || 0;
      if (compact()) compactHeight = rect.height - dy;
      else if (kind === 'move') geometry = { ...geometry, x: rect.x + dx, y: rect.y + dy };
      else { const a = area(); geometry = { ...geometry, x: rect.x, y: rect.y,
        width: Math.min(rect.width + dx, a.right - rect.x), height: Math.min(rect.height + dy, a.bottom - rect.y) }; }
      const effective = layout();
      if (compact()) compactHeight = effective.height;
      else geometry = { ...effective, height: minimized ? geometry.height : effective.height };
      persist();
    }
    [move, ...handles].forEach(handle => {
      const kind = handle.dataset.helpResize || 'move';
      listen(handle, 'pointerdown', event => startDrag(event, handle, kind));
      listen(handle, 'pointermove', moveDrag);
      listen(handle, 'pointerup', event => { if (event.pointerId === drag?.id) finish(); });
      listen(handle, 'pointercancel', () => finish(true));
      listen(handle, 'lostpointercapture', () => finish(true));
      listen(handle, 'keydown', event => keyGeometry(event, kind));
    });
    listen(document, 'keydown', event => {
      if (!drag) return;
      if (event.key === 'Escape') finish(true);
      event.preventDefault(); event.stopImmediatePropagation();
    }, true);
    listen(root, 'keydown', event => {
      if (event.key !== 'Escape' || event.isComposing || event.defaultPrevented) return;
      // 補足のdetailsを読んでいる場合は、まずその補足だけ閉じる。
      const detail = event.target.closest('details[open]');
      event.preventDefault(); event.stopPropagation();
      if (detail) { detail.open = false; detail.querySelector('summary')?.focus(); }
      else closePanel();
    });
    listen(select, 'change', () => selectTopic(select.value));
    listen(close, 'click', () => closePanel());
    listen(minimize, 'click', toggleMinimized);
    listen(reset, 'click', resetGeometry);
    listen(returnButton, 'click', returnToEditor);
    listen(content, 'scroll', () => { rememberScroll(); clearTimeout(saveTimer); saveTimer = setTimeout(persist, 200); });
    listen(opener, 'click', () => root.hidden || minimized ? open() : closePanel());
    function refresh() {
      finish(true); cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => { if (!root.hidden && !destroyed) layout(); });
    }
    listen(window, 'resize', refresh); listen(window, 'blur', () => finish(true));
    listen(window, 'pagehide', () => { finish(true); rememberScroll(); persist(); });
    if (window.visualViewport) { listen(window.visualViewport, 'resize', refresh); listen(window.visualViewport, 'scroll', refresh); }
    const observer = new ResizeObserver(() => {
      if (!drag && !root.hidden) { cancelAnimationFrame(frame); frame = requestAnimationFrame(layout); }
    });
    observer.observe(header);
    const api = Object.freeze({ root, open, close: closePanel, selectTopic, refresh,
      get interacting() { return Boolean(drag); },
      destroy() {
        if (destroyed) return;
        closePanel(false); destroyed = true; clearTimeout(saveTimer); cancelAnimationFrame(frame);
        observer.disconnect(); removers.forEach(remove => remove()); instances.delete(root);
        topics.forEach(topic => { topic.hidden = false; }); root.replaceChildren(...topics);
      }
    });
    instances.set(root, api);
    // 設定読込みだけでstorageへ書き戻さず、次に開く時に選択項目を反映する。
    topics.forEach(topic => { topic.hidden = topic.dataset.helpTopic !== selected; }); select.value = selected;
    return api;
  }
  window.JohoToolHelp = Object.freeze({ create });
})();
