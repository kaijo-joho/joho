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
        // 64角のセルを100%で覆う。境界の描画誤差を避けるため32√2より少し大きくする。
        host.querySelectorAll(`[data-output-ink-dot="${channel}"]`).forEach(dot => {
          dot.setAttribute('r', String(46 * value / 100));
        });
        host.querySelector(`[data-output-ink-label="${channel}"]`).textContent = `${value}%`;
        control.setAttribute('aria-valuetext', `点の直径を最大の${value}%`);
      });
      const values = controls.map(control => Number(control.value));
      // 全面が単色なら直接塗る。タイル境界の平滑化やぼかしによる色のずれを避ける。
      const solid = values.every(value => value === 0 || value === 100);
      host.querySelectorAll('[data-output-ink-surface]').forEach(surface => {
        surface.setAttribute('fill', solid
          ? `rgb(${values.map(value => value === 100 ? 0 : 255).join(' ')})`
          : `url(#${surface.dataset.outputInkSurface})`);
      });
      host.querySelector('[data-output-ink-distant]').setAttribute('filter', solid ? 'none' : 'url(#op-ink-distant-blur)');
      host.querySelectorAll('[data-output-ink-desc]').forEach(description => {
        description.textContent = `点の直径は最大を100%としてC ${values[0]}%、M ${values[1]}%、Y ${values[2]}%。点の並ぶ間隔は固定しています。`;
      });
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
