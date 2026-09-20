(function (root) {
  'use strict';
  const Core = root.OutputCore;
  const PRESETS = [{ width: 25.4, height: 25.4 }, { width: 50.8, height: 50.8 }, { width: 152.4, height: 101.6 }];
  const VIEW_WIDTH = 600, VIEW_HEIGHT = 420;
  const format = value => value.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
  const attrs = (node, values) => Object.entries(values).forEach(([key, value]) => node?.setAttribute(key, String(value)));
  const text = (host, selector, value) => { const node = host.querySelector(selector); if (node) node.textContent = value; };
  const equation = (host, selector, formula, result) => {
    const node = host.querySelector(selector);
    if (!node) return;
    const value = document.createElement('strong');
    value.className = 'op-print-value'; value.textContent = result;
    node.replaceChildren(document.createTextNode(formula), value);
  };
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));

  function initialize(host) {
    if (!Core || !host || host.dataset.outputPrintReady === 'true') return;
    const sizeControl = host.querySelector('[data-output-print-size]');
    const dpiControl = host.querySelector('[data-output-print-dpi]');
    const handle = host.querySelector('[data-output-print-handle]');
    const diagram = host.querySelector('[data-output-print-diagram]');
    const reset = host.querySelector('[data-output-reset]');
    if (!sizeControl || !dpiControl || !handle || !diagram || !reset) return;
    host.dataset.outputPrintReady = 'true';
    let index = Number(sizeControl.value) || 0;
    let drag = null;

    function box() {
      const scale = 360 / PRESETS[2].width;
      const preset = PRESETS[index];
      return { x: 100, y: 70, width: preset.width * scale, height: preset.height * scale, scale };
    }
    function stopDrag() {
      if (!drag) return;
      const { pointerId } = drag;
      drag = null;
      handle.setAttribute('aria-grabbed', 'false');
      if (handle.hasPointerCapture(pointerId)) handle.releasePointerCapture(pointerId);
    }
    function nearestIndex(x, y) {
      const current = box();
      const width = Math.max(0, (x - current.x) / current.scale);
      const height = Math.max(0, (y - current.y) / current.scale);
      return PRESETS.reduce((best, preset, candidate) => {
        const distance = Math.hypot(preset.width - width, preset.height - height);
        return distance < best.distance ? { candidate, distance } : best;
      }, { candidate: 0, distance: Infinity }).candidate;
    }
    function setPattern(dpi) {
      const unit = 17 * 100 / dpi;
      attrs(host.querySelector('[data-output-print-pattern]'), { width: unit * 3, height: unit * 3 });
      host.querySelectorAll('[data-output-print-dot]').forEach(dot => attrs(dot, {
        cx: (Number(dot.dataset.column) + .5) * unit, cy: (Number(dot.dataset.row) + .5) * unit, r: unit * .24
      }));
    }
    function draw() {
      const preset = PRESETS[index];
      const dpi = Number(dpiControl.value);
      const pixels = Core.printPixels(preset.width, preset.height, dpi);
      const current = box();
      const right = current.x + current.width, bottom = current.y + current.height;
      const cx = current.x + current.width / 2, cy = current.y + current.height / 2;
      attrs(host.querySelector('[data-output-print-range]'), { x: current.x, y: current.y, width: current.width, height: current.height });
      attrs(host.querySelector('[data-output-print-width-line]'), { x1: current.x, x2: right, y1: current.y - 26, y2: current.y - 26 });
      attrs(host.querySelector('[data-output-print-height-line]'), { x1: current.x - 29, x2: current.x - 29, y1: current.y, y2: bottom });
      attrs(host.querySelector('[data-output-print-width-pixels-line]'), { x1: current.x, x2: right, y1: bottom + 27, y2: bottom + 27 });
      attrs(host.querySelector('[data-output-print-height-pixels-line]'), { x1: right + 29, x2: right + 29, y1: current.y, y2: bottom });
      [['top', current.x, current.y, current.x, current.y - 24], ['top-right', right, current.y, right, current.y - 24], ['left', current.x, current.y, current.x - 27, current.y], ['left-bottom', current.x, bottom, current.x - 27, bottom], ['bottom', current.x, bottom, current.x, bottom + 25], ['bottom-right', right, bottom, right, bottom + 25], ['right', right, current.y, right + 27, current.y], ['right-bottom', right, bottom, right + 27, bottom]].forEach(([name, x1, y1, x2, y2]) => attrs(host.querySelector(`[data-output-print-extension="${name}"]`), { x1, y1, x2, y2 }));
      attrs(host.querySelector('[data-output-print-width-label]'), { x: cx, y: current.y - 34 });
      attrs(host.querySelector('[data-output-print-height-label]'), { x: current.x - 37, y: cy, transform: `rotate(-90 ${current.x - 37} ${cy})` });
      attrs(host.querySelector('[data-output-print-width-pixels-label]'), { x: cx, y: bottom + 47 });
      attrs(host.querySelector('[data-output-print-height-pixels-label]'), { x: right + 50, y: cy, transform: `rotate(-90 ${right + 50} ${cy})` });
      const wrap = host.querySelector('.op-print-diagram-wrap');
      wrap.style.setProperty('--op-print-handle-x', `${right / VIEW_WIDTH * 100}%`);
      wrap.style.setProperty('--op-print-handle-y', `${bottom / VIEW_HEIGHT * 100}%`);
      text(host, '[data-output-print-size-label]', `${format(preset.width)}×${format(preset.height)}mm`);
      text(host, '[data-output-print-dpi-label]', `${dpi}dpi`);
      text(host, '[data-output-print-width-mm]', `← ${format(preset.width)} mm →`);
      text(host, '[data-output-print-height-mm]', `← ${format(preset.height)} mm →`);
      text(host, '[data-output-print-width-pixels]', `← ${format(pixels.width)} ドット →`);
      text(host, '[data-output-print-height-pixels]', `← ${format(pixels.height)} ドット →`);
      equation(host, '[data-output-print-width-equation]', `横：${format(preset.width)}［mm］÷25.4［mm/インチ］×${dpi}［画素/インチ］＝`, `${format(pixels.width)}画素`);
      equation(host, '[data-output-print-height-equation]', `縦：${format(preset.height)}［mm］÷25.4［mm/インチ］×${dpi}［画素/インチ］＝`, `${format(pixels.height)}画素`);
      text(host, '[data-output-print-result]', `${format(pixels.width)}×${format(pixels.height)}画素`);
      text(host, '[data-output-print-total]', `合計${format(pixels.total)}画素`);
      text(host, '[data-output-print-desc]', `横${format(preset.width)}mm、縦${format(preset.height)}mm。横${format(pixels.width)}ドット、縦${format(pixels.height)}ドットを、双方向矢印の寸法線で示します。CMYの点は密度を表す模式図です。`);
      sizeControl.value = String(index);
      sizeControl.setAttribute('aria-valuetext', `${format(preset.width)}×${format(preset.height)}mm`);
      dpiControl.setAttribute('aria-valuetext', `${dpi}dpi、1インチに${dpi}ドット`);
      attrs(handle, { 'aria-valuemin': 0, 'aria-valuemax': 2, 'aria-valuenow': index, 'aria-valuetext': `大きさ${format(preset.width)}×${format(preset.height)}mm、${index + 1}段階目` });
      setPattern(dpi); resize();
    }
    function setIndex(next) { stopDrag(); index = Math.max(0, Math.min(2, next)); draw(); }
    function point(event) { const rect = diagram.getBoundingClientRect(); return { x: (event.clientX - rect.left) / rect.width * VIEW_WIDTH, y: (event.clientY - rect.top) / rect.height * VIEW_HEIGHT }; }
    handle.addEventListener('pointerdown', event => {
      if (!event.isPrimary || event.button !== 0) return;
      event.preventDefault();
      handle.focus({ preventScroll: true });
      const current = box(), position = point(event);
      drag = { pointerId: event.pointerId, index, offsetX: position.x - current.x - current.width, offsetY: position.y - current.y - current.height };
      handle.setPointerCapture(event.pointerId); handle.setAttribute('aria-grabbed', 'true');
    });
    handle.addEventListener('pointermove', event => {
      if (!drag || event.pointerId !== drag.pointerId) return;
      const position = point(event);
      const next = nearestIndex(position.x - drag.offsetX, position.y - drag.offsetY);
      if (next !== index) { index = next; draw(); }
    });
    handle.addEventListener('pointerup', stopDrag);
    handle.addEventListener('pointercancel', stopDrag);
    handle.addEventListener('lostpointercapture', stopDrag);
    handle.addEventListener('keydown', event => {
      if (event.key === 'ArrowRight' || event.key === 'ArrowUp') { event.preventDefault(); setIndex(index + 1); }
      else if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') { event.preventDefault(); setIndex(index - 1); }
      else if (event.key === 'Home') { event.preventDefault(); setIndex(0); }
      else if (event.key === 'End') { event.preventDefault(); setIndex(2); }
      else if (event.key === 'Escape' && drag) { event.preventDefault(); index = drag.index; stopDrag(); draw(); }
    });
    sizeControl.addEventListener('input', () => setIndex(Number(sizeControl.value)));
    dpiControl.addEventListener('input', () => { stopDrag(); draw(); });
    reset.addEventListener('click', () => { stopDrag(); index = 0; dpiControl.value = '300'; draw(); });
    document.addEventListener('joho:lesson-slide-change', stopDrag);
    document.addEventListener('visibilitychange', () => { if (document.hidden) stopDrag(); });
    window.addEventListener('pagehide', stopDrag);
    host.querySelectorAll('.op-enhancement').forEach(node => { node.hidden = false; });
    draw();
  }
  root.OutputPrint = Object.freeze({ initialize });
}(globalThis));
