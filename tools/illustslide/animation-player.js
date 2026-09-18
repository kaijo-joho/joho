/* Deterministic animation rendering shared by the editor and exported HTML. */
(function (root) {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  function create(paper, input, options = {}) {
    const C = root.IlapoCore, A = root.IlapoAnimation, G = root.IlapoGeometry, K = root.IlapoConnectors, S = root.IlapoSVG;
    const page = (input.layers || input.objects.some(o=>o.visible===false)) ? root.IlapoLayers.forOutput(input) : C.clone(input), nodes = new Map();
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
    svg.replaceChildren();
    svg.removeAttribute('width'); svg.removeAttribute('height');
    svg.style.width = svg.style.height = '100%';
    svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
    svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    const defs = document.createElementNS(NS, 'defs'); svg.append(defs);
    const prefix = C.uid('reveal');
    page.objects.forEach((o, i) => {
      const g = document.createElementNS(NS, 'g'), clip = document.createElementNS(NS, 'clipPath'), rect = document.createElementNS(NS, 'rect');
      g.dataset.animationObject = o.id;
      clip.id = prefix + '-' + i; clip.setAttribute('clipPathUnits', 'userSpaceOnUse');
      clip.append(rect); defs.append(clip); svg.append(g);
      nodes.set(o.id, {g, clip, rect, signature: null});
    });
    let step = 0, time = 0, playing = false, raf = null, started = 0, destroyed = false;
    const motion = root.matchMedia('(prefers-reduced-motion: reduce)');
    function getState() { return {step, steps: plan.steps, playing, time, duration: plan.groups[step].duration}; }
    function notify() { options.onChange?.(getState()); }
    function cancel() { if (raf !== null) root.cancelAnimationFrame(raf); raf = null; playing = false; }
    function draw(t) {
      time = t;
      const result = A.frame(page, step, t, {plan}); K?.sync(result.page);
      const revealBoxes = new Map();
      for (const object of result.page.objects) {
        const reveal = result.visuals[object.id]?.reveal;
        if (!reveal) continue;
        const key = reveal.animationId || object.id, b = (G.visualBounds || G.bounds)(object), previous = revealBoxes.get(key);
        if (!previous) revealBoxes.set(key, {x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height});
        else { previous.x = Math.min(previous.x, b.x); previous.y = Math.min(previous.y, b.y); previous.right = Math.max(previous.right, b.x + b.width); previous.bottom = Math.max(previous.bottom, b.y + b.height); }
      }
      for (const object of result.page.objects) {
        const node = nodes.get(object.id), visual = result.visuals[object.id] || {opacity: 1, reveal: null};
        const signature = JSON.stringify(object);
        if (node.signature !== signature) { node.g.innerHTML = S.objectMarkup(object); node.signature = signature; }
        node.g.setAttribute('opacity', visual.opacity);
        if (!visual.reveal) { node.g.removeAttribute('clip-path'); continue; }
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
      }
      const description = result.page.objects.filter(o => {
        const v = result.visuals[o.id]; return !v || (v.opacity > 0 && (!v.reveal || v.reveal.fraction > 0));
      }).map(o => o.type === 'text' ? o.runs.map(r => r.text).join('') : o.type === 'connector' ? o.label : o.name).filter(Boolean).join('。');
      paper.setAttribute('aria-label', page.name + (description ? '。' + description : ''));
    }
    function finish() { cancel(); draw(Infinity); notify(); }
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
    function reset() { if (destroyed) return; step = 0; play(); }
    function seek(value, at = Infinity) {
      if (!Number.isInteger(value) || value < 0 || value > plan.steps || !(at >= 0)) throw new RangeError('Invalid animation position');
      cancel(); step = value; draw(at); notify(); return getState();
    }
    function onMotionChange() { if (motion.matches && playing) finish(); }
    motion.addEventListener('change', onMotionChange);
    function destroy() { cancel(); destroyed = true; motion.removeEventListener('change', onMotionChange); }
    draw(0);
    return {next, previous, reset, seek, finish, getState, destroy, svg};
  }
  root.IlapoAnimationPlayer = {create};
}(globalThis));
