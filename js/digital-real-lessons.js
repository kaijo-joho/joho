(function () {
  'use strict';
  const Core = window.DigitalRealCore;
  if (!Core) return;
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const one = (root, selector) => root.querySelector(selector);
  const set = (root, selector, text) => { one(root, selector).textContent = text; };
  const number = value => String(value).replace('-', '−');
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(element => { element.hidden = false; });
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function binary(text) {
    const fragment = document.createDocumentFragment();
    fragment.append(node('span', text, 'df-code'), node('sub', '2'));
    return fragment;
  }
  function normalExpression(root, selector, significand, exponent, sign = '') {
    one(root, selector).replaceChildren(node('span', sign), binary(significand), node('span', ' × 2'), node('sup', number(exponent)));
  }
  function showError(root, message) {
    const error = one(root, '[data-df-error]');
    error.hidden = !message; error.textContent = message;
    one(root, '[data-df-value]').setAttribute('aria-invalid', String(Boolean(message)));
    one(root, '[data-df-output]').hidden = Boolean(message);
    resize();
  }
  function presets(root, render) {
    all(root, '[data-df-preset]').forEach(button => button.addEventListener('click', () => {
      one(root, '[data-df-value]').value = button.dataset.dfPreset; render();
    }));
  }
  function setBit(button, bit, weight) {
    button.textContent = bit;
    button.setAttribute('aria-pressed', String(bit === '1'));
    button.setAttribute('aria-label', `重み${weight}のビット、${bit}。押すと切り替えます`);
  }
  function setupFraction(root) {
    const buttons = all(root, '[data-df-bit]'), weights = [0.5, 0.25, 0.125, 0.0625];
    let bits = '1011';
    function render() {
      buttons.forEach((button, i) => setBit(button, bits[i], `1/${2 ** (i + 1)}`));
      const terms = weights.filter((_, i) => bits[i] === '1');
      set(root, '[data-df-sum]', terms.length ? terms.join(' ＋ ') : '1のある桁はありません。');
      one(root, '[data-df-result]').replaceChildren(binary(`0.${bits}`), node('span', ` ＝ ${Core.decodeFixed(`0000${bits}`, 4)}`), node('sub', '10'));
    }
    buttons.forEach((button, i) => button.addEventListener('click', () => { bits = bits.slice(0, i) + (bits[i] === '1' ? '0' : '1') + bits.slice(i + 1); render(); }));
    one(root, '[data-df-reset]').addEventListener('click', () => { bits = '1011'; render(); });
    enhance(root); render();
  }
  function setupConvert(root) {
    const input = one(root, '[data-df-value]'), next = one(root, '[data-df-next]'), restart = one(root, '[data-df-restart]');
    let converted, shown = 1;
    function showSteps() {
      all(root, '[data-df-stage]').forEach((row, i) => { row.hidden = i >= shown; });
      next.disabled = shown >= converted.steps.length; restart.disabled = shown <= 1;
      const complete = shown >= converted.steps.length && converted.exact;
      const fraction = converted.fractionBits.slice(0, shown);
      const code = converted.integerBits + (fraction ? `.${fraction}` : '') + (complete ? '' : '…');
      one(root, '[data-df-result]').replaceChildren(node('span', number(converted.value)), node('sub', '10'), node('span', ' ＝ '), binary(code));
      set(root, '[data-df-note]', complete ? (converted.steps.length ? '残る小数部分が0になったので、変換は終了です。' : '小数部分が0なので、整数部分だけで表せます。') : shown >= converted.steps.length ? '小数部を8桁まで表示しました。残る小数が0でないため、この先も続きます。' : '取り出した整数部分を、上から順に小数点の右へ並べます。');
      resize();
    }
    function render() {
      const value = Core.parseDecimal(input.value);
      if (value === null || value < 0 || value > 255) { showError(root, '0〜255の数を入力してください。小数点は「.」、小数部分は12桁以内で入力します。'); return; }
      converted = Core.toBinary(input.value, 8); shown = 1;
      showError(root, '');
      one(root, '[data-df-integer]').replaceChildren(node('span', `整数部分：${Math.floor(value)} → `), binary(converted.integerBits));
      const rows = converted.steps.map((step, i) => {
        const tr = node('tr'); tr.dataset.dfStage = i;
        const th = node('th', i + 1); th.scope = 'row';
        tr.append(th, node('td', `${step.before} × 2 ＝ ${step.doubled}`), node('td', step.bit), node('td', step.after));
        return tr;
      });
      if (!rows.length) {
        const tr = node('tr'), td = node('td', '小数部分は0です。2倍する手順はありません。'); td.colSpan = 4; tr.append(td); rows.push(tr);
      }
      one(root, '[data-df-steps]').replaceChildren(...rows); showSteps();
    }
    input.addEventListener('input', render); presets(root, render);
    next.addEventListener('click', () => { shown = Math.min(shown + 1, converted.steps.length); showSteps(); });
    restart.addEventListener('click', () => { shown = 1; showSteps(); });
    enhance(root); render();
  }
  function setupFixed(root) {
    const input = one(root, '[data-df-value]');
    const buttons = [...all(root, '[data-df-integer-bit]'), ...all(root, '[data-df-fraction-bit]')];
    const weights = [8, 4, 2, 1, .5, .25, .125, .0625];
    let bits = '01010101';
    function draw() {
      buttons.forEach((button, i) => setBit(button, bits[i], i < 4 ? weights[i] : `1/${2 ** (i - 3)}`));
      const terms = weights.filter((_, i) => bits[i] === '1');
      set(root, '[data-df-sum]', terms.length ? terms.join(' ＋ ') : 'すべてのビットが0です。');
      one(root, '[data-df-result]').replaceChildren(binary(`${bits.slice(0, 4)}.${bits.slice(4)}`), node('span', ` ＝ ${Core.decodeFixed(bits)}`), node('sub', '10'));
      one(root, '[data-df-stored]').replaceChildren(node('span', '保存する8bit：'), node('span', `${bits.slice(0, 4)} ${bits.slice(4)}`, 'df-code'));
      resize();
    }
    function render() {
      try { bits = Core.encodeFixed(input.value).bits; }
      catch (_) { showError(root, '整数部4bit・小数部4bitでは、0〜15.9375の範囲で、0.0625の倍数だけを正確に表せます。入力値を確認してください。'); return; }
      showError(root, ''); draw();
    }
    buttons.forEach((button, i) => button.addEventListener('click', () => {
      bits = bits.slice(0, i) + (bits[i] === '1' ? '0' : '1') + bits.slice(i + 1);
      input.value = String(Core.decodeFixed(bits)); showError(root, ''); draw();
    }));
    input.addEventListener('input', render); presets(root, render); enhance(root); render();
  }
  function setupRange(root) {
    const input = one(root, '[data-df-width]');
    function render() {
      const f = Number(input.value), range = Core.fixedRange(f), bits = '01101100';
      set(root, '[data-df-range-result]', `0〜${range.max}`);
      set(root, '[data-df-step]', `1/${2 ** f} ＝ ${range.step}`);
      one(root, '[data-df-result]').replaceChildren(binary(`${bits.slice(0, -f)}.${bits.slice(-f)}`), node('span', ` ＝ ${Core.decodeFixed(bits, f)}`), node('sub', '10'));
      resize();
    }
    input.addEventListener('change', render); enhance(root); render();
  }
  function setupNormalize(root) {
    const input = one(root, '[data-df-value]');
    function render() {
      const result = Core.normalizeBinary(input.value);
      if (!result) { showError(root, '0と1、小数点、必要なら負の符号を使い、2進数を入力してください。'); return; }
      showError(root, '');
      if (result.zero) {
        set(root, '[data-df-result]', '0');
        set(root, '[data-df-move]', '0には最初の1がないので、1.……の形にはできません。');
        set(root, '[data-df-note]', '浮動小数点数では、0専用の表現を使います。'); return;
      }
      const original = input.value.normalize('NFKC').replace(/\s/g, '').replace(/[−ー]/g, '-').replace('-', '−');
      normalExpression(root, '[data-df-result]', result.significand, result.exponent, result.sign ? '−' : '＋');
      one(root, '[data-df-result]').prepend(binary(original), node('span', ' ＝ '));
      const e = result.exponent;
      set(root, '[data-df-move]', e === 0 ? 'すでに最初の1の直後に小数点があります。指数は0です。' : `小数点を${e > 0 ? '左' : '右'}へ${Math.abs(e)}桁動かし、2の${number(e)}乗を掛けて元の値を保ちます。`);
      set(root, '[data-df-note]', '正規化した仮数の絶対値は、1以上2未満になります。'); resize();
    }
    input.addEventListener('input', render); presets(root, render); enhance(root); render();
  }
  function setupBias(root) {
    const input = one(root, '[data-df-value]');
    function render() {
      const exponent = Number(input.value), stored = exponent + 127;
      one(root, '[data-df-result]').replaceChildren(node('span', `${number(exponent)} ＋ 127 ＝ ${stored} → `), node('span', stored.toString(2).padStart(8, '0'), 'df-code'));
      set(root, '[data-df-read]', `読むときは、${stored} − 127 ＝ ${number(exponent)} として指数を戻します。`); resize();
    }
    input.addEventListener('change', render); enhance(root); render();
  }
  function setupFloat(root) {
    const width = Number(root.dataset.dfWidth), input = one(root, '[data-df-value]');
    const next = one(root, '[data-df-next]'), restart = one(root, '[data-df-restart]');
    let stage = 0;
    function showStage() {
      all(root, '[data-df-stage]').forEach((row, i) => { row.hidden = i > stage; });
      one(root, '[data-df-final]').hidden = stage < 4;
      next.disabled = stage >= 4; restart.disabled = stage === 0;
      resize();
    }
    function render() {
      const value = Core.parseDecimal(input.value), abs = Math.abs(value);
      const min = width === 32 ? .000001 : .0001, max = width === 32 ? 1000000 : 65504;
      if (value === null || (abs !== 0 && (abs < min || abs > max))) {
        showError(root, `0、または絶対値が${min}〜${max.toLocaleString('ja-JP')}の数を入力してください。整数部・小数部はそれぞれ12桁以内です。`); return;
      }
      const parts = Core.floatParts(input.value, width), converted = Core.toBinary(input.value, 32);
      const normalized = Core.normalizeBinary(converted.bits), sign = value < 0 ? '−' : '＋';
      showError(root, ''); stage = 0;
      one(root, '[data-df-binary]').replaceChildren(node('span', number(value)), node('sub', '10'), node('span', ' ＝ '), binary(`${value < 0 ? '−' : ''}${converted.bits}${converted.exact ? '' : '…'}`));
      if (parts.kind === 'zero') {
        set(root, '[data-df-normal]', '0は1.……に正規化できないので、専用の表現を使います。');
        set(root, '[data-df-sign-work]', 'ここでは、符号部を0にします。');
        set(root, '[data-df-exponent-work]', `指数部の${parts.exponentWidth}bitをすべて0にします。`);
        set(root, '[data-df-fraction-work]', `仮数部の${parts.fractionWidth}bitもすべて0にします。`);
      } else {
        normalExpression(root, '[data-df-normal]', normalized.significand + (converted.exact ? '' : '…'), normalized.exponent, sign);
        set(root, '[data-df-sign-work]', `${value < 0 ? '負' : '正'}の数なので、${parts.signBits}`);
        const carry = parts.exponent !== normalized.exponent ? `仮数の丸めで指数が${number(parts.exponent)}に変わるため、` : '';
        one(root, '[data-df-exponent-work]').replaceChildren(node('span', `${carry}${number(parts.exponent)} ＋ ${parts.bias} ＝ ${parts.storedExponent} → `), node('span', parts.exponentBits, 'df-code'));
        one(root, '[data-df-fraction-work]').replaceChildren(node('span', `先頭の「1.」を省き、小数部分を${parts.fractionWidth}bit${parts.exact ? 'で表す' : 'へ最近接丸めする'} → `), node('span', parts.fractionBits, 'df-code'));
      }
      set(root, '[data-df-sign]', parts.signBits); set(root, '[data-df-exponent]', parts.exponentBits); set(root, '[data-df-fraction]', parts.fractionBits);
      set(root, '[data-df-note]', parts.kind === 'zero' ? '全ビットを0にすると、＋0を表します。' : parts.exact ? 'この値は、丸めずに正確に表せます。' : `最も近い値へ丸めて保存します。表される値は約${number(parts.value)}です。入力値との差は「演算誤差」で扱います。`);
      showStage();
    }
    input.addEventListener('input', render); presets(root, render);
    next.addEventListener('click', () => { stage = Math.min(stage + 1, 4); showStage(); });
    restart.addEventListener('click', () => { stage = 0; showStage(); });
    enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [
      ['[data-df-fraction-demo]', setupFraction], ['[data-df-convert]', setupConvert], ['[data-df-fixed]', setupFixed],
      ['[data-df-range]', setupRange], ['[data-df-normalize]', setupNormalize], ['[data-df-bias]', setupBias],
      ['[data-df-float]', setupFloat]
    ]) all(document, selector).forEach(root => {
      try { setup(root); } catch (error) { console.error('実数のデジタル表現の操作を初期化できませんでした。', error); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
