/* Deterministic animation rendering shared by the editor and exported HTML. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function create(paper, input, options = {}) {
    const C = root.IlapoCore, A = root.IlapoAnimation, G = root.IlapoGeometry, K = root.IlapoConnectors, S = root.IlapoSVG;
    const source = C.clone(input);
    const page = (input.layers || input.objects.some(o=>o.visible===false)) ? root.IlapoLayers.forOutput(input) : C.clone(input), nodes = new Map();
    const hiddenMode = {value: options.hiddenMode === undefined ? 'hide' : options.hiddenMode};
    if (!['hide', 'ghost', 'show'].includes(hiddenMode.value)) throw new RangeError('Invalid hiddenMode');
    const sourceObjects = root.IlapoLayers ? root.IlapoLayers.orderedObjects(source) : source.objects.slice();
    const sourceById = new Map(sourceObjects.map(o => [o.id, o]));
    const visibleIds = new Set(page.objects.map(o => o.id));
    const hasHiddenConnectors = sourceObjects.some(o => o.type === 'connector' && !visibleIds.has(o.id));
    page.objects = page.objects.filter(o => !(o.type === 'image' && o.reference));
    root.IlapoLayers?.reconcile(page); C.pruneAnimations(page);
    const plan = A.compile(page), visibilityModes = new Map((page.animations || []).map(a => [a.id, a.mode]));
    K?.sync(page);
    paper.innerHTML = S.exportPage(page).replace(/^\s*<\?xml[^>]*>\s*/i, '');
    const svg = paper.querySelector('svg');
    const box = svg.viewBox.baseVal;
    // A free canvas has one stable camera, including the full range of translations.
    if (page.board.infinite && page.animations?.some(a => a.effect === 'move')) {
      let left = box.x, top = box.y, right = box.x + box.width, bottom = box.y + box.height;
      for (const object of page.objects) {
        const b = (G.visualBounds || G.bounds)(object);
        let minX = 0, maxX = 0, minY = 0, maxY = 0;
        for (const a of page.animations || []) if (a.effect === 'move' && a.targets.includes(object.id)) {
          minX += Math.min(0, a.dx); maxX += Math.max(0, a.dx);
          minY += Math.min(0, a.dy); maxY += Math.max(0, a.dy);
        }
        const pad = object.type === 'connector' ? Math.max(20, object.style.fontSize * 3, object.style.strokeWidth * 6) : 20;
        left = Math.min(left, b.x + minX - pad); top = Math.min(top, b.y + minY - pad);
        right = Math.max(right, b.x + b.width + maxX + pad); bottom = Math.max(bottom, b.y + b.height + maxY + pad);
      }
      svg.setAttribute('viewBox', [left, top, right - left, bottom - top].join(' '));
    }
    const outputViewBox = svg.getAttribute('viewBox');
    let presenterViewBox = outputViewBox;
    if (page.board.infinite) {
      const [x,y,width,height] = outputViewBox.split(/\s+/).map(Number);
      let left=x,top=y,right=x+width,bottom=y+height;
      for (const object of sourceObjects) if (!visibleIds.has(object.id) && !(object.type === 'image' && object.reference)) {
        const b=(G.visualBounds || G.bounds)(object);
        left=Math.min(left,b.x-20);top=Math.min(top,b.y-20);right=Math.max(right,b.x+b.width+20);bottom=Math.max(bottom,b.y+b.height+20);
      }
      presenterViewBox=[left,top,right-left,bottom-top].join(' ');
    }
    svg.setAttribute('viewBox', hiddenMode.value === 'hide' ? outputViewBox : presenterViewBox);
    svg.replaceChildren();
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = svg.style.height = '100%';
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const defs = document.createElementNS(NS, 'defs'); svg.append(defs);
    const prefix = C.uid('reveal');
    function renderList() { return hiddenMode.value === 'hide' ? page.objects : sourceObjects.filter(o => !(o.type === 'image' && o.reference)); }
    let nodeSerial = 0, renderedOrder = '';
    function ensureNode(o) {
      if (nodes.has(o.id)) return nodes.get(o.id);
      const holder = document.createElementNS(NS, 'g'), g = document.createElementNS(NS, 'g'), ghost = document.createElementNS(NS, 'g'), clip = document.createElementNS(NS, 'clipPath'), rect = document.createElementNS(NS, 'rect'), mask = document.createElementNS(NS, 'mask'), maskRect = document.createElementNS(NS, 'rect'), maskHole = document.createElementNS(NS, 'rect'), suffix = nodeSerial++;
      holder.dataset.animationContainer = o.id; g.dataset.animationObject = o.id; g.classList.add('ilapo-animation-normal'); ghost.classList.add('ilapo-animation-ghost');
      clip.id = prefix + '-clip-' + suffix; clip.setAttribute('clipPathUnits', 'userSpaceOnUse'); clip.append(rect);
      mask.id = prefix + '-mask-' + suffix; mask.setAttribute('maskUnits', 'userSpaceOnUse'); mask.setAttribute('maskContentUnits', 'userSpaceOnUse');
      maskRect.setAttribute('fill', 'white'); maskHole.setAttribute('fill', 'black'); mask.append(maskRect, maskHole);
      defs.append(clip, mask); holder.append(g, ghost); nodes.set(o.id, {holder, g, ghost, clip, rect, mask, maskRect, maskHole, signature: null});
      return nodes.get(o.id);
    }
    function orderNodes(objects) {
      const key = objects.map(object => object.id).join('\u0000');
      if (key === renderedOrder) return;
      for (const node of nodes.values()) node.holder.setAttribute('display', 'none');
      const fragment = document.createDocumentFragment();
      for (const object of objects) { const node = ensureNode(object); node.holder.removeAttribute('display'); fragment.append(node.holder); }
      svg.append(fragment); renderedOrder = key;
    }
    let step = 0, time = 0, playing = false, raf = null, started = 0, destroyed = false;
    const motion = root.matchMedia('(prefers-reduced-motion: reduce)');
    function getState() { const currentTime = playing ? Math.max(0, root.performance.now() - started) : time; return {step, steps: plan.steps, playing, time: currentTime, duration: plan.groups[step].duration}; }
    function notify() { options.onChange?.(getState()); }
    function cancel() { if (raf !== null) root.cancelAnimationFrame(raf); raf = null; playing = false; }
    function draw(t) {
      time = t;
      const result = A.frame(page, step, t, {plan}); K?.sync(result.page);
      const renderObjects = renderList();
      const resultById = new Map(result.page.objects.map(object => [object.id, object]));
      // 手元で補う非表示の矢印だけ、現在の動きの位置へ接続する。
      // 通常の投影用フレームと原稿の図形は変更しない。
      const combinedById = new Map();
      if (hiddenMode.value !== 'hide' && hasHiddenConnectors) {
        const combined = sourceObjects.filter(object => !(object.type === 'image' && object.reference)).map(object => {
          const current = resultById.get(object.id) || object;
          return object.type === 'connector' ? C.clone(current) : current;
        });
        K?.sync({objects: combined});
        for (const object of combined) combinedById.set(object.id, object);
      }
      for (const object of renderObjects) ensureNode(object);
      orderNodes(renderObjects);
      const revealBoxes = new Map();
      for (const object of result.page.objects) {
        const reveal = result.visuals[object.id]?.reveal;
        if (!reveal) continue;
        const key = reveal.animationId || object.id, b = (G.visualBounds || G.bounds)(object), previous = revealBoxes.get(key);
        if (!previous) revealBoxes.set(key, {x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height});
        else { previous.x = Math.min(previous.x, b.x); previous.y = Math.min(previous.y, b.y); previous.right = Math.max(previous.right, b.x + b.width); previous.bottom = Math.max(previous.bottom, b.y + b.height); }
      }
      for (const object of renderObjects) {
        const node = nodes.get(object.id), visual = result.visuals[object.id] || {opacity: 1, reveal: null};
        const hidden = !visibleIds.has(object.id), rendered = hidden && object.type === 'connector' ? combinedById.get(object.id) : visibleIds.has(object.id) ? resultById.get(object.id) : sourceById.get(object.id);
        if (!rendered || !node) continue;
        const signature = JSON.stringify(rendered);
        if (node.signature !== signature) { const markup = S.objectMarkup(rendered); node.g.innerHTML = markup; node.ghost.innerHTML = markup; node.signature = signature; }
        const opacity = hiddenMode.value === 'show' ? 1 : hidden ? .3 : hiddenMode.value === 'ghost' && !visual.reveal ? Math.max(.3, visual.opacity) : visual.opacity;
        node.g.setAttribute('opacity', opacity);
        node.ghost.setAttribute('display', 'none');
        node.g.removeAttribute('clip-path'); node.ghost.removeAttribute('mask');
        if (hidden || !visual.reveal || hiddenMode.value === 'show') continue;
        const reveal = visual.reveal, b = revealBoxes.get(reveal.animationId || object.id), f = reveal.fraction;
        // Add a tiny margin at the boundary so antialiasing never trims a finished stroke.
        let x = b.x - .01, y = b.y - .01, width = b.right - x + .01, height = b.bottom - y + .01;
        if (reveal.direction === 'left' || reveal.direction === 'right') {
          if ((reveal.direction === 'left') !== (visibilityModes.get(reveal.animationId) === 'out')) x += width * (1 - f);
          width *= f;
        } else {
          if ((reveal.direction === 'up') !== (visibilityModes.get(reveal.animationId) === 'out')) y += height * (1 - f);
          height *= f;
        }
        for (const [key, value] of Object.entries({x, y, width, height})) node.rect.setAttribute(key, value);
        node.g.setAttribute('clip-path', 'url(#' + node.clip.id + ')');
        if (hiddenMode.value === 'ghost' && f < 1) {
          const extent = Math.max(page.board.width, page.board.height, Math.abs(b.x), Math.abs(b.y), Math.abs(b.right), Math.abs(b.bottom)) * 4 + 100;
          for (const [key, value] of Object.entries({x:-extent, y:-extent, width:extent*2, height:extent*2})) node.maskRect.setAttribute(key, value);
          for (const [key, value] of Object.entries({x:-extent, y:-extent, width:extent*2, height:extent*2})) node.mask.setAttribute(key, value);
          for (const [key, value] of Object.entries({x, y, width, height})) node.maskHole.setAttribute(key, value);
          node.ghost.removeAttribute('display'); node.ghost.setAttribute('opacity', '.3'); node.ghost.setAttribute('mask', 'url(#' + node.mask.id + ')');
        } else node.ghost.setAttribute('display', 'none');
      }
      const description = renderObjects.filter(o => hiddenMode.value !== 'hide' || visibleIds.has(o.id)).filter(o => {
        if (hiddenMode.value !== 'hide') return true;
        const v = result.visuals[o.id]; return !v || (v.opacity > 0 && (!v.reveal || v.reveal.fraction > 0));
      }).map(o => o.type === 'text' ? o.runs.map(r => r.text).join('') : o.type === 'connector' ? o.label : o.name).filter(Boolean).join('。');
      paper.setAttribute('aria-label', page.name + (description ? '。' + description : ''));
    }
    function finish() { if (destroyed) return getState(); cancel(); draw(Infinity); notify(); return getState(); }
    function tick(now) {
      if (destroyed || !playing) return;
      const elapsed = Math.max(0, now - started);
      if (elapsed >= plan.groups[step].duration) { finish(); return; }
      draw(elapsed); raf = root.requestAnimationFrame(tick);
    }
    function play() {
      cancel();
      if (motion.matches || !plan.groups[step].duration) { draw(Infinity); notify(); return; }
      draw(0); started = root.performance.now(); playing = true; notify(); raf = root.requestAnimationFrame(tick);
    }
    function next() {
      if (destroyed) return false;
      if (playing) { finish(); return true; }
      if (step >= plan.steps) return false;
      step++; play(); return true;
    }
    function previous() {
      if (destroyed || step <= 0) return false;
      cancel(); step--; draw(Infinity); notify(); return true;
    }
    function reset() { if (destroyed) return getState(); step = 0; play(); return getState(); }
    function seek(value, at = Infinity) {
      if (destroyed) return getState();
      if (!Number.isInteger(value) || value < 0 || value > plan.steps || !Number.isFinite(at) && at !== Infinity || at < 0) throw new RangeError('Invalid animation position');
      cancel(); step = value; draw(at); notify(); return getState();
    }
    function setHiddenMode(mode) {
      if (destroyed) return hiddenMode.value;
      if (!['hide', 'ghost', 'show'].includes(mode)) throw new RangeError('Invalid hiddenMode');
      hiddenMode.value = mode;
      svg.setAttribute('viewBox', mode === 'hide' ? outputViewBox : presenterViewBox);
      // 表示だけを更新し、再生時刻と原稿を保持する。
      draw(time); notify(); return mode;
    }
    function sync(state, elapsedMs = 0) {
      if (destroyed) return getState();
      if (!state || !Number.isInteger(state.step) || state.step < 0 || state.step > plan.steps ||
          !Number.isFinite(state.time) || state.time < 0 || typeof state.playing !== 'boolean' || !Number.isFinite(elapsedMs) || elapsedMs < 0) throw new RangeError('Invalid animation state');
      cancel(); step = state.step;
      const at = state.playing ? state.time + elapsedMs : state.time;
      draw(at);
      if (!state.playing || motion.matches || at >= plan.groups[step].duration) { if (state.playing && (motion.matches || at >= plan.groups[step].duration)) draw(Infinity); return getState(); }
      started = root.performance.now() - at; playing = true; raf = root.requestAnimationFrame(tick); return getState();
    }
    function onMotionChange() { if (motion.matches && playing) finish(); }
    motion.addEventListener('change', onMotionChange);
    function destroy() { cancel(); destroyed = true; motion.removeEventListener('change', onMotionChange); }
    draw(0);
    return {next, previous, reset, seek, finish, getState, destroy, sync, setHiddenMode, svg};
  }
  root.IlapoAnimationPlayer = {create};
}(globalThis));
