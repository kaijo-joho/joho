(function () {
  'use strict';
  const Core = window.DigitalErrorsCore;
  if (!Core) return;
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const one = (root, selector) => root.querySelector(selector);
  const set = (root, selector, value) => { one(root, selector).textContent = value; };
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(element => { element.hidden = false; });
  function node(tag, value, className) {
    const element = document.createElement(tag);
    if (value !== undefined) element.textContent = value;
    if (className) element.className = className;
    return element;
  }
  function binary(value) { return [node('span', value, 'de-code'), node('sub', '(2)')]; }
  function error(root, valid, message, inputs) {
    inputs.forEach(input => input.setAttribute('aria-invalid', String(!valid)));
    one(root, '[data-de-error]').hidden = valid;
    one(root, '[data-de-output]').hidden = !valid;
    set(root, '[data-de-error]', valid ? '' : message);
  }
  function setupRound(root) {
    const input = one(root, '[data-de-value]'), precision = one(root, '[data-de-precision]'), mode = one(root, '[data-de-mode]');
    function render() {
      let result;
      try { result = Core.roundBinaryFraction(input.value, Number(precision.value), mode.value); }
      catch { error(root, false, '0以上1未満の数値を、小数6桁以内で入力してください。', [input]); resize(); return; }
      error(root, true, '', [input]);
      const width = result.fractionBits;
      // 最近接丸めで1に繰り上がる場合も、小数部の桁数を保つ。
      const bits = result.bits.length > width ? `1.${'0'.repeat(width)}` : `0.${result.bits}`;
      one(root, '[data-de-binary]').replaceChildren(...binary(bits), node('span', ` ＝ ${result.stored}`), node('sub', '(10)'));
      set(root, '[data-de-original]', result.original); set(root, '[data-de-stored]', result.stored); set(root, '[data-de-gap]', result.error);
      set(root, '[data-de-note]', result.exact ? 'この値は指定したビット数で正確に表せるため、丸め誤差は0です。' : `もとの値と保存した値の差の絶対値は ${result.error} です。${result.stored === '1' ? '丸めによって整数部へ繰り上がりました。' : ''}`);
      resize();
    }
    input.addEventListener('input', render); [precision, mode].forEach(select => select.addEventListener('change', render));
    one(root, '[data-de-reset]').addEventListener('click', () => { input.value = '0.3'; precision.value = '8'; mode.value = 'truncate'; render(); });
    enhance(root); render();
  }
  function setupSeries(root) {
    const count = one(root, '[data-de-count]'), more = one(root, '[data-de-more]');
    function render() {
      const result = Core.geometricPartial(Number(count.value));
      set(root, '[data-de-equation]', result.count <= 5 ? Array.from({ length: result.count }, (_, i) => `1/${2 ** (i + 1)}`).join(' ＋ ') : `1/2 ＋ 1/4 ＋ … ＋ 1/${result.denominator}（${result.count}項）`);
      set(root, '[data-de-sum]', result.sum); set(root, '[data-de-remainder]', result.remainder);
      set(root, '[data-de-result]', `${result.count}項で終えると、残りの 1/${result.denominator} ＝ ${result.remainder} が誤差になります。`);
      one(root, '[data-de-fill]').style.width = `${Number(result.sum) * 100}%`;
      one(root, '[data-de-rest]').style.width = `${Number(result.remainder) * 100}%`;
      one(root, '[data-de-bar]').setAttribute('aria-label', `${result.count}項の和は${result.sum}、1までの残りは${result.remainder}`);
      more.disabled = result.count === 16; resize();
    }
    count.addEventListener('change', render); more.addEventListener('click', () => { count.value = String(Math.min(16, Number(count.value) + 1)); render(); });
    one(root, '[data-de-reset]').addEventListener('click', () => { count.value = '4'; render(); });
    enhance(root); render();
  }
  function setupLoss(root) {
    const exponent = one(root, '[data-de-exponent]'), precision = one(root, '[data-de-precision]');
    function render() {
      const e = Number(exponent.value), p = Number(precision.value), r = Core.informationLoss(e, p);
      one(root, '[data-de-equation]').replaceChildren(node('span', '1.234 ＋ 1.234 × 10'), node('sup', String(e).replace('-', '−')));
      const places = r.exactSum.split('.')[1].length;
      const padded = value => { const [whole, fraction = ''] = value.split('.'); return `${whole}.${fraction.padEnd(places, '0')}`; };
      set(root, '[data-de-large]', padded(r.large)); set(root, '[data-de-small]', padded(r.small)); set(root, '[data-de-exact]', r.exactSum);
      const cut = p + 1; // 正確な和は1以上10未満。小数点1文字も数える。
      one(root, '[data-de-digits]').replaceChildren(node('strong', r.exactSum.slice(0, cut), 'de-kept'), node('span', r.exactSum.slice(cut), 'de-discarded'));
      set(root, '[data-de-result]', `保存した和：${r.storedSum}　${r.lost ? '小さい数を加えた影響が消えました。' : r.error === '0' ? 'この和は正確に保存できています。' : '小さい数を加えた影響の一部が失われました。'}`);
      set(root, '[data-de-gap]', `正確な和との差：${r.error}`); resize();
    }
    [exponent, precision].forEach(select => select.addEventListener('change', render));
    one(root, '[data-de-reset]').addEventListener('click', () => { exponent.value = '-4'; precision.value = '4'; render(); });
    enhance(root); render();
  }
  function parseInteger(raw) {
    const text = raw.normalize('NFKC').trim().replace(/−/g, '-');
    return /^[+-]?\d+$/.test(text) ? Number(text) : NaN;
  }
  function setupOverflow(root) {
    const left = one(root, '[data-de-left]'), right = one(root, '[data-de-right]');
    const bits = n => ((n + 256) % 256).toString(2).padStart(8, '0');
    function render() {
      const a = parseInteger(left.value), b = parseInteger(right.value);
      const valid = n => Number.isInteger(n) && n >= -128 && n <= 127;
      error(root, valid(a) && valid(b), 'それぞれ−128〜127の整数を入力してください。', [left, right]);
      left.setAttribute('aria-invalid', String(!valid(a))); right.setAttribute('aria-invalid', String(!valid(b)));
      if (!valid(a) || !valid(b)) { resize(); return; }
      const r = Core.signedAddition(a, b);
      const signed = n => String(n).replace('-', '−');
      set(root, '[data-de-equation]', `${signed(a)} ${b < 0 ? '−' : '＋'} ${Math.abs(b)} ＝ ${signed(r.sum)}`);
      set(root, '[data-de-result]', r.overflow ? `${signed(r.sum)} ${r.sum > 127 ? '＞ 127' : '＜ −128'}　オーバーフローが起こります。` : `${signed(r.sum)} は−128〜127の範囲内です。正確に保存できます。`);
      set(root, '[data-de-bits]', `${bits(a)} ＋ ${bits(b)} → ${r.bits}`);
      set(root, '[data-de-wrap]', `${r.bits}を符号付き8bit整数として読むと${signed(r.wrapped)}です。${r.overflow ? `数学的な答え${signed(r.sum)}とは異なります。` : '数学的な答えと一致します。'}`); resize();
    }
    [left, right].forEach(input => input.addEventListener('input', render));
    all(root, '[data-de-preset]').forEach(button => button.addEventListener('click', () => { [left.value, right.value] = button.dataset.dePreset.split(','); render(); }));
    enhance(root); render();
  }
  function scientific(raw) {
    if (raw === '0') return [node('span', '0')];
    const [mantissa, exponent] = Number(raw).toExponential(4).split('e');
    return [node('span', `約${mantissa} × 10`), node('sup', String(Number(exponent)).replace('-', '−'))];
  }
  function setupUnderflow(root) {
    const exponent = one(root, '[data-de-exponent]'), more = one(root, '[data-de-more]');
    function render() {
      const n = Number(exponent.value), r = Core.underflow(n);
      one(root, '[data-de-equation]').replaceChildren(...binary('1.0000000001'), node('span', ' × 2'), node('sup', `−${n}`));
      one(root, '[data-de-true]').replaceChildren(...scientific(r.trueValue)); one(root, '[data-de-stored]').replaceChildren(...scientific(r.stored));
      set(root, '[data-de-bits]', `${r.bits[0]} ｜ ${r.bits.slice(1, 6)} ｜ ${r.bits.slice(6)}`);
      set(root, '[data-de-result]', r.kind === 'normal' ? '通常の正規化した数として、正確に表せています。' : r.kind === 'zero' ? '正の値ですが小さすぎるため、0へ丸められました。' : `0に近い特別な領域の値です。${r.exact ? 'この値は正確に表せます。' : '保てる有効桁が減り、丸め誤差が生じています。'}${n >= 24 ? '保存した値は、この形式の最小の正の値です。' : ''}`);
      more.disabled = n === 26; resize();
    }
    exponent.addEventListener('change', render); more.addEventListener('click', () => { exponent.value = String(Math.min(26, Number(exponent.value) + 1)); render(); });
    one(root, '[data-de-reset]').addEventListener('click', () => { exponent.value = '14'; render(); }); enhance(root); render();
  }
  function setupOrder(root) {
    const count = one(root, '[data-de-count]'), precision = one(root, '[data-de-precision]');
    function render() {
      const n = Number(count.value), r = Core.summationOrder(n, Number(precision.value));
      set(root, '[data-de-large-work]', `1に0.0001を、1つずつ${n}回加える`);
      set(root, '[data-de-small-work]', `0.0001を${n}個合計 → ${r.smallSubtotal}。その後で1を加える`);
      set(root, '[data-de-exact-work]', `1 ＋ 0.0001 × ${n}`);
      set(root, '[data-de-large-result]', r.largeFirst); set(root, '[data-de-small-result]', r.smallFirst); set(root, '[data-de-exact]', r.exact);
      set(root, '[data-de-note]', r.largeFirst === r.exact && r.smallFirst === r.exact ? 'この精度では、どちらの順序も数学的な値と一致します。' : 'この条件では、小さい数を先にまとめると情報落ちを抑えられます。'); resize();
    }
    [count, precision].forEach(select => select.addEventListener('change', render));
    one(root, '[data-de-reset]').addEventListener('click', () => { count.value = '10'; precision.value = '4'; render(); }); enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [['[data-de-round]', setupRound], ['[data-de-series]', setupSeries], ['[data-de-loss]', setupLoss], ['[data-de-overflow]', setupOverflow], ['[data-de-underflow]', setupUnderflow], ['[data-de-order]', setupOrder]]) {
      all(document, selector).forEach(root => { try { setup(root); } catch (exception) { console.error('演算誤差の操作を初期化できませんでした。', exception); } });
    }
    all(document, 'details').forEach(details => details.addEventListener('toggle', resize));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
