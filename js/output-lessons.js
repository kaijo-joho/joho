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
  function equation(node, expression, result) {
    node.replaceChildren(document.createTextNode(expression), element('strong', result));
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
    const control = host.querySelector('#op-brightness');
    function update() {
      const brightness = Number(control.value);
      const opacity = brightness / 100;
      ['[data-output-lcd-light]', '[data-output-oled-emitter]', '[data-output-oled-light]'].forEach(selector => attributes(host.querySelector(selector), { opacity }));
      attributes(host.querySelector('[data-output-lcd-shutter]'), { opacity: 1 - opacity });
      text(host, '[data-output-brightness-label]', `${brightness}%`);
      control.setAttribute('aria-valuetext', `表示する明るさ${brightness}%`);
      text(host, '[data-output-light-note]', brightness === 0
        ? '0%：LCDは光を遮り、OLEDは発光を止めています。LCDのバックライトは点灯したままです。'
        : `${brightness}%：LCDは通す光の量を、OLEDは発光する量を調整しています。0%にして光源の違いも比べましょう。`);
      resized();
    }
    control.addEventListener('input', update);
    host.querySelector('[data-output-reset]').addEventListener('click', () => { control.value = '70'; update(); });
    update(); reveal(host);
  }

  function initializeRefresh(host) {
    const fpsControl = host.querySelector('[data-output-fps]');
    const hzControl = host.querySelector('[data-output-hz]');
    const source = host.querySelector('[data-output-source-frames]');
    const display = host.querySelector('[data-output-display-frames]');
    const previous = host.querySelector('[data-output-refresh-prev]');
    const next = host.querySelector('[data-output-refresh-next]');
    let plan;
    let index = 0;
    function draw() {
      const current = plan.frames[index];
      source.querySelectorAll('span').forEach((cell, position) => cell.classList.toggle('is-current', position + 1 === current.frame));
      display.querySelectorAll('span').forEach((cell, position) => cell.classList.toggle('is-current', position === index));
      text(host, '[data-output-refresh-current]', `更新${index + 1} / ${plan.updateCount}：開始から${format(current.time * 1000)}msで、フレーム${current.frame}を表示`);
      text(host, '[data-output-refresh-desc]', `更新${index + 1}。元の動画のフレーム${current.frame}を表示しています。`);
      // 0.1秒で左から右へ進む動きを、元の動画の時刻で標本化する。
      attributes(host.querySelector('[data-output-refresh-ball]'), { cx: 32 + 416 * (current.frame - 1) / plan.sourceCount });
      previous.disabled = index === 0;
      next.disabled = index === plan.updateCount - 1;
      resized();
    }
    function update() {
      const fps = Number(fpsControl.value);
      const hz = Number(hzControl.value);
      plan = Core.refreshFrames(fps, hz);
      index = 0;
      source.style.setProperty('--op-columns', plan.sourceCount);
      display.style.setProperty('--op-columns', plan.updateCount);
      source.replaceChildren(...Array.from({ length: plan.sourceCount }, (_, i) => element('span', i + 1)));
      display.replaceChildren(...plan.frames.map(frame => element('span', frame.frame)));
      text(host, '[data-output-source-label]', `動画（${fps}fps）：0.1秒に${plan.sourceCount}枚`);
      text(host, '[data-output-display-label]', `画面（${hz}Hz）：0.1秒に${plan.updateCount}回更新`);
      const sequence = plan.frames.map(frame => frame.frame).join('→');
      const description = hz < fps
        ? `${plan.sourceCount}枚のうち${plan.uniqueCount}枚を表示し、一部のフレームは表示されません。`
        : hz > fps
          ? `同じフレームを${hz / fps}回ずつ表示します。元の動画に新しいフレームが増えるわけではありません。`
          : '動画の各フレームを1回ずつ表示します。';
      text(host, '[data-output-refresh-note]', `${fps}fps・${hz}Hz：${description}（${sequence}）`);
      draw();
    }
    fpsControl.addEventListener('change', update);
    hzControl.addEventListener('change', update);
    previous.addEventListener('click', () => { index = Math.max(0, index - 1); draw(); });
    next.addEventListener('click', () => { index = Math.min(plan.updateCount - 1, index + 1); draw(); });
    host.querySelector('[data-output-reset]').addEventListener('click', () => { fpsControl.value = '60'; hzControl.value = '30'; update(); });
    update(); reveal(host);
  }

  function initializeDots(host) {
    const control = host.querySelector('#op-dpi-demo');
    function update() {
      const dpi = Number(control.value);
      const grid = Core.dotGrid(dpi);
      const size = 300 / grid.perSide;
      attributes(host.querySelector('#op-dots-pattern'), { width: size, height: size });
      attributes(host.querySelector('[data-output-dot]'), { cx: size / 2, cy: size / 2, r: size * .3 });
      text(host, '[data-output-dots-label]', `${dpi}dpi`);
      control.setAttribute('aria-valuetext', `${dpi}dpi、1インチに${dpi}ドット`);
      text(host, '[data-output-dots-caption]', `${dpi}dpi（比較）`);
      text(host, '[data-output-dot-count]', `${dpi}×${dpi}＝${format(grid.total)}ドット`);
      text(host, '[data-output-dots-desc]', `横${dpi}個、縦${dpi}個、合計${grid.total}個のドットが並びます。`);
      resized();
    }
    control.addEventListener('input', update);
    host.querySelector('[data-output-reset]').addEventListener('click', () => { control.value = '10'; update(); });
    update(); reveal(host);
  }

  function initializePrint(host) {
    const sizeControl = host.querySelector('[data-output-print-size]');
    const dpiControl = host.querySelector('#op-print-dpi');
    function update() {
      const [width, height] = sizeControl.value.split(',').map(Number);
      const dpi = Number(dpiControl.value);
      const pixels = Core.printPixels(width, height, dpi);
      text(host, '[data-output-print-dpi-label]', `${dpi}dpi`);
      dpiControl.setAttribute('aria-valuetext', `${dpi}dpi`);
      for (const [direction, mm, count] of [['width', width, pixels.width], ['height', height, pixels.height]]) {
        const label = direction === 'width' ? '横' : '縦';
        equation(host.querySelector(`[data-output-print-${direction}]`), `${label}：${format(mm)}［mm］÷25.4［mm/インチ］×${dpi}［画素/インチ］＝`, `${format(count)}画素`);
        text(host, `[data-output-${direction}-mm]`, `${label}${format(mm)}mm`);
      }
      host.querySelector('[data-output-print-result]').replaceChildren(document.createTextNode(`${format(pixels.width)}×${format(pixels.height)}画素`), element('br'), element('span', `合計${format(pixels.total)}画素`));
      const scale = 224 / Math.max(width, height);
      attributes(host.querySelector('[data-output-photo]'), { x: 172 - width * scale / 2, y: 138 - height * scale / 2, width: width * scale, height: height * scale });
      text(host, '[data-output-size-desc]', `横${width}mm、縦${height}mmに、横${pixels.width}画素、縦${pixels.height}画素を対応させます。`);
      resized();
    }
    sizeControl.addEventListener('change', update);
    dpiControl.addEventListener('input', update);
    host.querySelector('[data-output-reset]').addEventListener('click', () => { sizeControl.value = '25.4,25.4'; dpiControl.value = '300'; update(); });
    update(); reveal(host);
  }

  function initializeQuiz(host) {
    const answer = Core.printPixels(101.6, 76.2, 400);
    const fields = ['width', 'height'].map(name => host.elements.namedItem(name));
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
        ? '横と縦の画素数を両方入力しましょう。'
        : correct === 2 ? '正解です。横1600画素×縦1200画素です。'
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
      ['[data-output-refresh]', initializeRefresh], ['[data-output-dots]', initializeDots],
      ['[data-output-print]', initializePrint], ['[data-output-quiz]', initializeQuiz]
    ];
    widgets.forEach(([selector, setup]) => document.querySelectorAll(selector).forEach(host => {
      try { setup(host); }
      catch (error) { console.error('出力装置の教材の初期化に失敗しました。', error); }
    }));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
}());
