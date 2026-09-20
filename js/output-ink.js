(function (root) {
  'use strict';
  function initialize(host) {
    if (host.dataset.outputInkReady === 'true') return;
    const controls = [...host.querySelectorAll('[data-output-ink-size]')];
    const initial = { c: 60, m: 30, y: 10 };
    function update() {
      controls.forEach(control => {
        const channel = control.dataset.outputInkSize;
        const value = Number(control.value);
        // 100%では円が網点セルの四隅まで届き、白い部分を覆う。
        host.querySelector(`[data-output-ink-dot="${channel}"]`).setAttribute('r', String(Math.SQRT2 * 32 * value / 100));
        host.querySelector(`[data-output-ink-label="${channel}"]`).textContent = `${value}%`;
        control.setAttribute('aria-valuetext', `点の直径を最大の${value}%`);
      });
      const values = controls.map(control => Number(control.value));
      host.querySelector('[data-output-ink-desc]').textContent = `点の直径は最大を100%としてC ${values[0]}%、M ${values[1]}%、Y ${values[2]}%。点の並ぶ間隔は固定しています。`;
      host.querySelector('[data-output-ink-note]').textContent = values.every(value => value === 0)
        ? 'インクを付けないと、紙の白が見えます。'
        : values.every(value => value === 100)
          ? '理想的なCMYを全面に重ねると、黒になります。実際の印刷ではK（黒）も使います。'
          : '点の並ぶ間隔はそのままで、各色の点の大きさを変えています。';
      document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
    }
    controls.forEach(control => control.addEventListener('input', update));
    host.querySelector('[data-output-ink-reset]').addEventListener('click', () => {
      controls.forEach(control => { control.value = String(initial[control.dataset.outputInkSize]); }); update();
    });
    host.querySelectorAll('.op-enhancement').forEach(node => { node.hidden = false; });
    host.dataset.outputInkReady = 'true'; update();
  }
  root.OutputInk = Object.freeze({ initialize });
}(globalThis));
