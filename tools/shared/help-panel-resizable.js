// エディタを操作しながら読める共通ヘルプ。本文とアプリの編集処理には依存しない。
(() => {
  'use strict';
  const instances = new WeakMap();
  const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const frameEdges = Object.freeze({n:'上辺', e:'右辺', s:'下辺', w:'左辺', nw:'左上', ne:'右上', se:'右下', sw:'左下'});

  function resizeSpan(start, size, delta, lower, upper, minSize, maxSize, leading, trailing) {
    if (leading) {
      const end = start + size;
      const next = clamp(start + delta, Math.max(lower, end - maxSize), end - minSize);
      return [next, end - next];
    }
    if (trailing) return [start, clamp(size + delta, minSize, Math.min(maxSize, upper - start))];
    return [start, size];
  }
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
    frameResize = false, headerActions, isBusy = () => false, returnToEditor = () => opener.focus({ preventScroll: true }) }) {
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
    // 狭い画面で再び開くときは、保存した高さで下部の全幅に戻す。
    let compactRect = null;
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
    header.append(heading);
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
    const actions = headerActions?.({reset, returnButton});
    if (actions) {
      const controls = element('div', 'tool-help__header-controls');
      controls.append(actions, minimize, close);
      header.append(controls);
    } else {
      header.append(minimize, close);
      footer.append(reset, returnButton);
    }
    const handles = (frameResize ? Object.keys(frameEdges) : ['e', 's', 'se']).map(edge => {
      const label = frameResize ? frameEdges[edge] + 'でヘルプのサイズを変更' : 'ヘルプのサイズを変更';
      const node = button(label, '', 'tool-help__resize tool-help__resize--' + edge);
      if (frameResize) node.tabIndex = edge === 'nw' || edge === 'se' ? 0 : -1;
      else if (edge === 'se') drawIcon(node, 'M6 18L18 6M12 18l6-6');
      node.dataset.helpResize = edge;
      node.dataset.tip = 'ドラッグ・矢印キーでサイズ変更。Shiftで大きく変更、Enterで標準サイズ。';
      return node;
    });
    root.replaceChildren(header, main, ...(actions ? [] : [footer]), ...handles);
    root.classList.add('tool-help');
    root.classList.toggle('tool-help--frame-resize', frameResize);
    root.hidden = true;
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
    function sizeLimits(a, small) {
      const width = a.right - a.left, height = a.bottom - a.top;
      const maxHeight = small && height >= 360 ? height * .6 : height;
      return { minWidth: Math.min(320, width), maxWidth: small ? width : Math.min(700, width),
        minHeight: Math.min(280, maxHeight), maxHeight };
    }
    function resizeFrame(rect, edge, dx, dy, a, small) {
      const {minWidth, maxWidth, minHeight, maxHeight} = sizeLimits(a, small);
      const [x, width] = resizeSpan(rect.x, rect.width, dx, a.left, a.right,
        minWidth, maxWidth, edge.includes('w'), edge.includes('e'));
      const [y, height] = resizeSpan(rect.y, rect.height, dy, a.top, a.bottom,
        minHeight, maxHeight, edge.includes('n'), edge.includes('s'));
      if (small) { compactRect = {x, y, width}; compactHeight = height; }
      else geometry = {x, y, width, height};
    }
    function minimizedHeight() {
      const height = Math.max(52, header.offsetHeight);
      if (!frameResize) return height;
      const style = getComputedStyle(root);
      return height + parseFloat(style.paddingTop) + parseFloat(style.paddingBottom) + root.clientTop * 2;
    }
    function layout() {
      const a = area(), width = a.right - a.left, height = a.bottom - a.top, small = compact();
      const {minWidth, maxWidth, minHeight, maxHeight} = sizeLimits(a, small);
      root.dataset.compact = String(small); root.dataset.minimized = String(minimized);
      if (actions) actions.hidden = minimized;
      if (!geometry) geometry = { x: (initialRight?.() || a.right) - Math.min(400, width),
        y: Math.max(a.top, a.bottom - Math.min(440, height) - 12), width: 400, height: Math.min(440, height) };
      const preferred = small ? compactRect : geometry;
      const w = preferred ? clamp(preferred.width, minWidth, maxWidth) : width;
      const h = minimized ? Math.min(minimizedHeight(), height)
        : clamp(small ? compactHeight || height * .45 : geometry.height, minHeight, maxHeight);
      const x = preferred ? clamp(preferred.x, a.left, a.right - w) : a.left;
      const y = !preferred || small && minimized ? a.bottom - h : clamp(preferred.y, a.top, a.bottom - h);
      root.style.left = `${Math.round(x)}px`; root.style.top = `${Math.round(y)}px`;
      root.style.width = `${Math.round(w)}px`; root.style.height = `${Math.round(h)}px`;
      const moveLabel = small ? 'ヘルプの高さを変更' : 'ヘルプを移動';
      if (move.getAttribute('aria-label') !== moveLabel) move.setAttribute('aria-label', moveLabel);
      move.dataset.tip = small ? '見出しを上下にドラッグ・上下キーで高さを変更。Shiftで大きく変更、Enterで標準位置。'
        : '見出しをドラッグ・矢印キーで移動。Shiftで大きく移動、Enterで標準位置。';
      handles.forEach(handle => { handle.hidden = minimized || small && !frameResize; });
      return { x, y, width: w, height: h };
    }
    function persist() {
      clearTimeout(saveTimer);
      if (!storageKey || destroyed || drag) return;
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
      finish(true); rememberScroll(); persist(); compactRect = null;
      root.hidden = true; opener.setAttribute('aria-expanded', 'false');
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
    function resetGeometry() { geometry = null; compactRect = null; compactHeight = null; layout(); persist(); }
    function finish(cancelled = false) {
      if (!drag) return;
      const previous = drag; drag = null;
      if (cancelled) {
        geometry = previous.geometry; compactRect = previous.compactRect; compactHeight = previous.compactHeight;
      }
      if ((!frameResize || cancelled) && previous.handle.hasPointerCapture(previous.id)) {
        previous.handle.releasePointerCapture(previous.id);
      }
      root.classList.remove('tool-help--dragging'); layout(); if (!cancelled) persist();
    }
    function startDrag(event, handle, kind) {
      if (event.button !== 0 || drag || isBusy() || (compact() && minimized)) return;
      event.preventDefault(); handle.focus({ preventScroll: true });
      const rect = layout();
      drag = { id: event.pointerId, handle, kind, x: event.clientX, y: event.clientY, rect,
        geometry, compactRect, compactHeight };
      if (!frameResize) handle.setPointerCapture(event.pointerId);
      root.classList.add('tool-help--dragging');
    }
    function moveDrag(event) {
      if (event.pointerId !== drag?.id) return;
      event.preventDefault();
      const { rect, kind, x, y } = drag, dx = event.clientX - x, dy = event.clientY - y, a = area(), small = compact();
      if (frameResize && (kind !== 'move' || small)) resizeFrame(rect, kind === 'move' ? 'n' : kind, dx, dy, a, small);
      else if (small) compactHeight = rect.height - dy;
      else if (kind === 'move') geometry = { ...geometry, x: rect.x + dx, y: rect.y + dy };
      else geometry = { ...geometry, x: rect.x, y: rect.y,
        width: kind.includes('e') ? Math.min(rect.width + dx, a.right - rect.x) : rect.width,
        height: kind.includes('s') ? Math.min(rect.height + dy, a.bottom - rect.y) : rect.height };
      const effective = layout();
      if (small) compactHeight = effective.height;
      else geometry = { ...effective, height: minimized ? geometry.height : effective.height };
    }
    function keyGeometry(event, kind) {
      if (isBusy() || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
      if (event.key === 'Enter' || event.key === 'Home') { event.preventDefault(); event.stopPropagation(); resetGeometry(); return; }
      const small = compact();
      if (!['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown'].includes(event.key) || (small && minimized)) return;
      const step = event.shiftKey ? 64 : 16, rect = layout();
      event.preventDefault(); event.stopPropagation();
      const dx = { ArrowLeft: -step, ArrowRight: step }[event.key] || 0;
      const dy = { ArrowUp: -step, ArrowDown: step }[event.key] || 0;
      if (frameResize && (kind !== 'move' || small)) resizeFrame(rect, kind === 'move' ? 'n' : kind, dx, dy, area(), small);
      else if (small) compactHeight = rect.height - dy;
      else if (kind === 'move') geometry = { ...geometry, x: rect.x + dx, y: rect.y + dy };
      else { const a = area(); geometry = { ...geometry, x: rect.x, y: rect.y,
        width: Math.min(rect.width + dx, a.right - rect.x), height: Math.min(rect.height + dy, a.bottom - rect.y) }; }
      const effective = layout();
      if (small) compactHeight = effective.height;
      else geometry = { ...effective, height: minimized ? geometry.height : effective.height };
      persist();
    }
    const endDrag = event => { if (event.pointerId === drag?.id) finish(); };
    const cancelDrag = event => { if (event.pointerId === drag?.id) finish(true); };
    if (frameResize) {
      // 埋め込みをまたぐドラッグは操作中だけiframeのヒット判定を外し、親文書で追う。
      listen(document, 'pointermove', moveDrag, true);
      listen(document, 'pointerup', endDrag, true);
      listen(document, 'pointercancel', cancelDrag, true);
      listen(document, 'pointerout', event => { if (event.relatedTarget === null) cancelDrag(event); }, true);
    }
    [move, ...handles].forEach(handle => {
      const kind = handle.dataset.helpResize || 'move';
      listen(handle, 'pointerdown', event => startDrag(event, handle, kind));
      if (!frameResize) {
        listen(handle, 'pointermove', moveDrag);
        listen(handle, 'pointerup', endDrag);
        listen(handle, 'pointercancel', cancelDrag);
        listen(handle, 'lostpointercapture', cancelDrag);
      }
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
        if (frameResize) root.classList.remove('tool-help--frame-resize');
        topics.forEach(topic => { topic.hidden = false; }); root.replaceChildren(...topics);
      }
    });
    instances.set(root, api);
    // 設定読込みだけでstorageへ書き戻さず、次に開く時に選択項目を反映する。
    topics.forEach(topic => { topic.hidden = topic.dataset.helpTopic !== selected; }); select.value = selected;
    return api;
  }
  window.JohoToolHelpResizable = Object.freeze({ create });
})();
