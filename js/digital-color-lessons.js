(function () {
  'use strict';
  const Core = window.DigitalColorCore;
  if (!Core) return;
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(element => { element.hidden = false; });
  const channelLabels = ['R（赤）', 'G（緑）', 'B（青）'];
  function setSwatch(element, color) {
    element.style.backgroundColor = color.css;
    element.setAttribute('aria-label', 'RGB(' + color.channels.join(', ') + ')の色見本');
  }
  function numeral(value, base) {
    const fragment = document.createDocumentFragment(), digits = document.createElement('span'), suffix = document.createElement('sub');
    digits.className = 'dcl-code'; digits.textContent = value;
    suffix.textContent = '(' + base + ')'; fragment.append(digits, suffix);
    return fragment;
  }
  function setupRgb(root) {
    const fields = all(root, '[data-dcl-channel]'), ranges = all(root, '[data-dcl-range]');
    const hex = one(root, '[data-dcl-hex-input]'), error = one(root, '[data-dcl-error]'), output = one(root, '[data-dcl-output]');
    function show(color) {
      output.hidden = false; error.hidden = true; error.textContent = '';
      fields.forEach(field => field.removeAttribute('aria-invalid'));
      if (hex) hex.removeAttribute('aria-invalid');
      setSwatch(one(root, '[data-dcl-swatch]'), color);
      one(root, '[data-dcl-rgb-label]').textContent = 'RGB(' + color.channels.join(', ') + ')';
      const name = Core.basicName(color.channels);
      one(root, '[data-dcl-name]').textContent = name ? '色の名前：' + name : 'R・G・Bの3つの値で色を表します。';
      if (hex) {
        one(root, '[data-dcl-hex-label]').textContent = color.hex;
        color.channels.forEach((value, i) => {
          one(root, '[data-dcl-decimal="' + i + '"]').replaceChildren(numeral(value, 10));
          one(root, '[data-dcl-binary="' + i + '"]').replaceChildren(numeral(color.bits[i], 2));
          one(root, '[data-dcl-hexpart="' + i + '"]').replaceChildren(numeral(color.hexParts[i], 16));
        });
      }
      resize();
    }
    function invalid(message) {
      error.textContent = message; error.hidden = false; output.hidden = true; resize();
    }
    function readChannels() {
      const values = fields.map(field => Core.parseChannel(field.value));
      values.forEach((value, i) => { fields[i].setAttribute('aria-invalid', String(value === null)); if (value !== null) ranges[i].value = value; });
      if (values.includes(null)) { invalid('R・G・Bには、それぞれ0〜255の整数を入力してください。'); return; }
      const color = Core.rgb(...values);
      if (hex) hex.value = color.hex;
      show(color);
    }
    function setColor(color) {
      fields.forEach((field, i) => { field.value = color.channels[i]; ranges[i].value = color.channels[i]; });
      if (hex) hex.value = color.hex;
      show(color);
    }
    fields.forEach(field => field.addEventListener('input', readChannels));
    ranges.forEach((range, i) => range.addEventListener('input', () => { fields[i].value = range.value; readChannels(); }));
    if (hex) hex.addEventListener('input', () => {
      const color = Core.parseHex(hex.value);
      hex.setAttribute('aria-invalid', String(color === null));
      if (!color) { invalid('カラーコードは、#に続けて0〜9・A〜Fを6桁で入力してください（#は省略可）。'); return; }
      fields.forEach((field, i) => { field.value = color.channels[i]; ranges[i].value = color.channels[i]; });
      show(color);
    });
    all(root, '[data-dcl-preset]').forEach(button => button.addEventListener('click', () => {
      setColor(Core.rgb(...button.dataset.dclPreset.split(',').map(Number)));
    }));
    enhance(root); readChannels();
  }
  function setupMix(root) {
    const subtractive = root.dataset.dclMix === 'subtractive';
    const mix = subtractive ? Core.mixSubtractive : Core.mixAdditive;
    const letters = subtractive ? ['C', 'M', 'Y'] : ['R', 'G', 'B'];
    const fields = all(root, '[data-dcl-mix-channel]');
    function render() {
      const enabled = fields.map(field => field.checked), color = mix(enabled);
      all(root, '[data-dcl-region]').forEach(region => {
        const mask = Array.from(region.dataset.dclRegion, value => value === '1');
        region.setAttribute('fill', mix(enabled.map((value, i) => value && mask[i])).hex);
      });
      const selected = letters.filter((_, i) => enabled[i]);
      one(root, '[data-dcl-mix-result]').textContent = (selected.length ? selected.join(' ＋ ') : subtractive ? '色材なし' : '光なし') + ' → ' + Core.basicName(color.channels);
      const remaining = ['R', 'G', 'B'].filter((_, i) => color.channels[i] > 0);
      one(root, '[data-dcl-mix-note]').textContent = subtractive
        ? remaining.length ? '吸収されずに残る光の成分：' + remaining.join('・') : 'R・G・Bがすべて吸収され、残る光の成分がありません。'
        : remaining.length ? '出している光の成分：' + remaining.join('・') : 'どの成分の光も出していません。';
      resize();
    }
    fields.forEach(field => field.addEventListener('change', render));
    all(root, '[data-dcl-all]').forEach(button => button.addEventListener('click', () => {
      fields.forEach(field => { field.checked = button.dataset.dclAll === 'true'; }); render();
    }));
    enhance(root); render();
  }
  function setupSteps(root) {
    const stages = all(root, '[data-dcl-stage]'), next = one(root, '[data-dcl-next]');
    let count = 1;
    function render() {
      stages.forEach((stage, i) => { stage.hidden = i >= count; });
      next.disabled = count === stages.length;
      one(root, '[data-dcl-progress]').textContent = count + ' / ' + stages.length + '段階';
      resize();
    }
    next.addEventListener('click', () => { count = Math.min(count + 1, stages.length); render(); });
    one(root, '[data-dcl-reset]').addEventListener('click', () => { count = 1; render(); });
    enhance(root); render();
  }
  function setupDepth(root) {
    const input = one(root, '[data-dcl-depth-input]');
    function render() {
      const result = Core.depth(Number(input.value));
      one(root, '[data-dcl-depth-result]').textContent = '各' + result.bitsPerChannel + 'bit → 各' + result.levels + '段階 → 合計' + result.totalBits + 'bit → ' + result.colors.toLocaleString('ja-JP') + '色';
      all(root, '[data-dcl-band]').forEach(band => {
        const channel = Number(band.dataset.dclBand);
        const fragment = document.createDocumentFragment();
        for (let i = 0; i < result.levels; i += 1) {
          const value = Core.quantize(Math.round(i / (result.levels - 1) * 255), result.bitsPerChannel).value;
          const rgb = [0, 1, 2].map(index => channel === 3 || index === channel ? value : 0);
          const span = document.createElement('span');
          span.style.backgroundColor = Core.rgb(...rgb).css; fragment.append(span);
        }
        band.replaceChildren(fragment);
        band.setAttribute('aria-label', (channel === 3 ? '灰色' : channelLabels[channel]) + 'を' + result.levels + '段階で表したグラデーション');
      });
      all(root.closest('section'), '[data-dcl-depth-row]').forEach(row => {
        row.dataset.selected = String(Number(row.dataset.dclDepthRow) === result.bitsPerChannel);
      });
      resize();
    }
    input.addEventListener('change', render); enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [
      ['[data-dcl-rgb]', setupRgb], ['[data-dcl-mix]', setupMix],
      ['[data-dcl-steps]', setupSteps], ['[data-dcl-depth]', setupDepth]
    ]) all(document, selector).forEach(root => {
      if (root.dataset.dclReady) return;
      try { setup(root); root.dataset.dclReady = 'true'; } catch (error) { console.error('色の操作を初期化できませんでした。', error); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
