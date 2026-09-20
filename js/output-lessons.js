(function () {
  'use strict';

  const Core = globalThis.OutputCore;
  const format = value => value.toLocaleString('ja-JP', { maximumFractionDigits: 3 });
  const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const reveal = host => host.querySelectorAll('.op-enhancement').forEach(element => { element.hidden = false; });
  const text = (host, selector, value) => { host.querySelector(selector).textContent = value; };
  function element(name, content, className) {
    const node = document.createElement(name);
    if (content !== undefined) node.textContent = content;
    if (className) node.className = className;
    return node;
  }
  function attributes(node, values) {
    Object.entries(values).forEach(([key, value]) => node.setAttribute(key, String(value)));
  }
  function svgElement(name, values = {}) {
    const node = document.createElementNS('http://www.w3.org/2000/svg', name);
    attributes(node, values);
    return node;
  }

  function initializeScreen(host) {
    const control = host.querySelector('#op-ppi');
    const pattern = host.querySelector('#op-pixel-pattern');
    function update() {
      const ppi = Number(control.value);
      const size = 320 / ppi;
      const pixels = Core.screenPixels(ppi, 20);
      attributes(pattern, { width: size, height: size });
      ['r', 'g', 'b'].forEach((channel, index) => attributes(host.querySelector(`[data-output-subpixel="${channel}"]`), { x: size * index / 3, width: size / 3, height: size }));
      attributes(host.querySelector('[data-output-pixel-edge]'), { d: `M0 0H${size}V${size}H0Z`, 'stroke-width': size * .06 });
      text(host, '[data-output-ppi-label]', `${ppi}ppi`);
      control.setAttribute('aria-valuetext', `${ppi}ppi、1インチに${ppi}画素`);
      text(host, '[data-output-pixel-count]', `横${ppi}画素 × 縦${ppi}画素`);
      text(host, '[data-output-pixel-desc]', `1インチ四方に${ppi}×${ppi}画素が並んでいます。各画素はRGBの3つのサブピクセルで構成されます。`);
      const label = host.querySelector('[data-output-screen-equation]');
      label.replaceChildren(document.createTextNode('画面の横幅が20インチなら'), element('br'), document.createTextNode(`${ppi}［画素/インチ］×20［インチ］＝`), element('strong', `${format(pixels)}画素`));
      resized();
    }
    control.addEventListener('input', update);
    host.querySelector('[data-output-reset]').addEventListener('click', () => { control.value = '64'; update(); });
    update(); reveal(host);
  }

  function initializeLight(host) {
    host.querySelectorAll('[data-output-light-device]').forEach(device => {
      const kind = device.dataset.outputLightDevice;
      const controls = [...device.querySelectorAll('[data-output-brightness]')];
      function update() {
        controls.forEach(control => {
          const channel = control.dataset.outputBrightness;
          const brightness = Number(control.value);
          const opacity = brightness / 100;
          const parts = kind === 'lcd' ? ['lcd-through', 'lcd-light'] : ['oled-emitter', 'oled-light'];
          parts.forEach(part => attributes(device.querySelector(`[data-output-${part}="${channel}"]`), { opacity }));
          // 電圧の大小は一般化せず、向きの変化と透過量の対応を模式的に示す。
          device.querySelectorAll(`[data-output-molecule="${channel}"]`).forEach(molecule => {
            attributes(molecule, { transform: `rotate(${-65 + .6 * brightness})` });
          });
          text(device, `[data-output-brightness-label="${channel}"]`, `${brightness}%`);
          control.setAttribute('aria-valuetext', `${brightness}%`);
        });
        const allOff = controls.every(control => Number(control.value) === 0);
        text(device, '[data-output-device-note]', kind === 'lcd'
          ? (allOff ? '光を遮っていても、バックライトは点灯したままです。' : '各層の下のスライダーで、白色光を通す量を調整できます。')
          : (allOff ? '3つの発光部が発光を止めています。' : '各発光部の下のスライダーで、発光する量を調整できます。'));
        resized();
      }
      controls.forEach(control => control.addEventListener('input', update));
      device.querySelector('[data-output-reset]').addEventListener('click', () => {
        controls.forEach(control => { control.value = '70'; }); update();
      });
      update();
    });
    reveal(host);
  }

  function initializeDots(host) {
    const control = host.querySelector('#op-dpi-demo');
    const layer = host.querySelector('[data-output-dot-layer]');
    const colors = ['#00acc1', '#d93887', '#e2bd16'];
    function update() {
      const dpi = Number(control.value);
      const grid = Core.dotGrid(dpi);
      const size = 300 / grid.perSide;
      layer.replaceChildren(...Array.from({ length: grid.total }, (_, i) => {
        const row = Math.floor(i / dpi); const column = i % dpi;
        return svgElement('circle', { cx: (column + .5) * size, cy: (row + .5) * size, r: size * .27, fill: colors[(row + column) % 3] });
      }));
      text(host, '[data-output-dots-label]', `${dpi}dpi`);
      control.setAttribute('aria-valuetext', `${dpi}dpi、1インチに${dpi}ドット`);
      text(host, '[data-output-dots-caption]', `${dpi}dpi（比較）`);
      text(host, '[data-output-dot-count]', `${dpi}×${dpi}＝${format(grid.total)}ドット`);
      text(host, '[data-output-dots-desc]', `CMYのドットが横${dpi}個、縦${dpi}個、合計${grid.total}個並びます。`);
      resized();
    }
    control.addEventListener('input', update);
    host.querySelector('[data-output-reset]').addEventListener('click', () => { control.value = '10'; update(); });
    update(); reveal(host);
  }

  function initializeQuiz(host) {
    const dots = host.hasAttribute('data-output-dot-quiz');
    const answer = dots
      ? { row: 300, total: Core.dotGrid(300).total, doubleTotal: Core.dotGrid(600).total, ratio: Core.dotGrid(600).total / Core.dotGrid(300).total }
      : Core.printPixels(101.6, 76.2, 400);
    const names = dots ? ['row', 'total', 'doubleTotal', 'ratio'] : ['width', 'height'];
    const fields = names.map(name => host.elements.namedItem(name));
    const feedback = host.querySelector('[data-output-feedback]');
    function clearFeedback() {
      fields.forEach(field => field.removeAttribute('aria-invalid'));
      feedback.textContent = '';
    }
    function parse(value) {
      const normalized = value.normalize('NFKC').trim();
      if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)$/.test(normalized)) return NaN;
      return Number(normalized.replaceAll(',', ''));
    }
    host.addEventListener('submit', event => {
      event.preventDefault();
      let correct = 0;
      fields.forEach(field => {
        const valid = parse(field.value) === answer[field.name];
        field.setAttribute('aria-invalid', String(!valid));
        if (valid) correct += 1;
      });
      feedback.textContent = fields.some(field => field.value.trim() === '')
        ? (dots ? '4つの欄をすべて入力しましょう。' : '横と縦の画素数を両方入力しましょう。')
        : correct === fields.length
          ? (dots ? '正解です。全体は横×縦で求めます。dpiが2倍になると、同じ面積のドット数は4倍です。' : '正解です。横1600画素×縦1200画素です。')
          : dots ? `${correct}か所が正解です。dpiは長さ1インチあたりの数です。全体のドット数は横×縦で考えましょう。`
            : `${correct === 1 ? '一方は正解です。' : ''}横と縦をそれぞれインチに直してから、400を掛けましょう。`;
      resized();
    });
    host.addEventListener('reset', clearFeedback);
    fields.forEach(field => field.addEventListener('input', clearFeedback));
    const solution = host.querySelector('[data-output-solution]');
    const steps = [...solution.querySelectorAll('ol > li')];
    const next = solution.querySelector('[data-output-solution-next]');
    let visible = 1;
    function showSteps() {
      steps.forEach((step, index) => { step.hidden = index >= visible; });
      next.disabled = visible === steps.length;
      resized();
    }
    next.addEventListener('click', () => { visible = Math.min(steps.length, visible + 1); showSteps(); });
    solution.querySelector('[data-output-solution-reset]').addEventListener('click', () => { visible = 1; showSteps(); });
    showSteps(); reveal(host);
  }

  function initialize() {
    if (!Core) return;
    const widgets = [
      ['[data-output-screen]', initializeScreen], ['[data-output-light]', initializeLight],
      ['[data-output-refresh]', host => globalThis.OutputRefresh?.initialize(host)], ['[data-output-dots]', initializeDots],
      ['[data-output-print]', host => globalThis.OutputPrint?.initialize(host)],
      ['[data-output-ink]', host => globalThis.OutputInk?.initialize(host)],
      ['[data-output-dot-quiz]', initializeQuiz], ['[data-output-quiz]', initializeQuiz]
    ];
    widgets.forEach(([selector, setup]) => document.querySelectorAll(selector).forEach(host => {
      try { setup(host); }
      catch (error) { console.error('出力装置の教材の初期化に失敗しました。', error); }
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
