(function () {
  'use strict';
  const Core = window.DigitalIntegerCore;
  if (!Core) return;
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(el => { el.hidden = false; });
  const widthOf = root => Number(one(root, 'select[data-di-width]')?.value || root.dataset.diWidth || 4);
  const signed = value => value < 0 ? `−${Math.abs(value)}` : String(value);
  const code = bits => {
    const span = document.createElement('span'); span.className = 'di-code';
    span.textContent = bits.length === 8 ? `${bits.slice(0, 4)} ${bits.slice(4)}` : bits;
    return span;
  };
  const setCode = (root, selector, bits) => one(root, selector).replaceChildren(code(bits));
  function validity(root, inputs, flags, message) {
    const valid = flags.every(Boolean), error = one(root, '[data-di-error]');
    inputs.forEach((input, i) => input.setAttribute('aria-invalid', String(!flags[i])));
    root.dataset.diValid = String(valid); error.hidden = valid; error.textContent = valid ? '' : message;
    all(root, '[data-di-output]').forEach(el => { el.hidden = !valid; });
    resize(); return valid;
  }
  function setupUnsigned(root) {
    const width = one(root, '[data-di-width]'), input = one(root, '[data-di-value]');
    function render() {
      const w = widthOf(root), value = Core.parseInteger(input.value), max = Core.range(w).unsignedMax;
      one(root, '[data-di-limit]').textContent = `ここでは符号を付けずに、0〜${max}を${w}bitで表します。`;
      if (!validity(root, [input], [value !== null && value >= 0 && value <= max], `0〜${max}の整数を入力してください。`)) return;
      one(root, '[data-di-result]').replaceChildren(`${value} ＝ `, code(Core.formatUnsigned(value, w)), `（${w}bit）`);
    }
    input.addEventListener('input', render); width.addEventListener('change', render);
    one(root, '[data-di-reset]').addEventListener('click', () => { width.value = '4'; input.value = '6'; render(); });
    enhance(root); render();
  }
  function setupSign(root) {
    const buttons = all(root, '[data-di-bit]'); let bits = '0110';
    function render() {
      buttons.forEach((button, i) => {
        button.textContent = bits[i]; button.setAttribute('aria-pressed', String(bits[i] === '1'));
        button.setAttribute('aria-label', `${i === 0 ? '符号ビット' : `左から${i + 1}番目のビット`}、${bits[i]}。押すと切り替えます`);
      });
      setCode(root, '[data-di-sign-code]', bits);
      one(root, '[data-di-unsigned-result]').textContent = Number.parseInt(bits, 2);
      one(root, '[data-di-signed-result]').textContent = signed(Core.decode(bits, 4));
    }
    buttons.forEach((button, i) => button.addEventListener('click', () => { bits = bits.slice(0, i) + (bits[i] === '0' ? '1' : '0') + bits.slice(i + 1); render(); }));
    one(root, '[data-di-reset]').addEventListener('click', () => { bits = '0110'; render(); });
    enhance(root); render();
  }
  function setupBuild(root) {
    const w = widthOf(root), input = one(root, '[data-di-value]');
    const next = one(root, '[data-di-next]'), restart = one(root, '[data-di-restart]'); let stage = 0;
    function render() {
      const value = Core.parseInteger(input.value), max = Core.range(w).max;
      const valid = validity(root, [input], [value !== null && value >= 0 && value <= max], `0〜${max}の整数を入力してください。`);
      next.disabled = !valid || stage === 2; restart.disabled = !valid || stage === 0;
      all(root, '[data-di-stage]').forEach(el => { el.hidden = Number(el.dataset.diStage) > stage; });
      next.textContent = stage === 0 ? '0と1を反転する' : stage === 1 ? '1を加える' : '2の補数を表示しました';
      if (!valid) return;
      const result = Core.complement(Core.encode(value, w), w);
      for (const key of ['original', 'ones', 'twos']) setCode(root, `[data-di-${key}]`, result[key]);
      one(root, '[data-di-result]').replaceChildren(code(result.twos), ` は、${w}bitの符号付き整数で ${signed(-value)} を表します。`);
      one(root, '[data-di-carry-note]').textContent = result.carry ? `幅外へ繰り上がった1を除き、下位${w}bitを残します。0の2の補数は0です。` : '';
      resize();
    }
    input.addEventListener('input', () => { stage = 0; render(); });
    next.addEventListener('click', () => { stage = Math.min(stage + 1, 2); render(); });
    restart.addEventListener('click', () => { stage = 0; render(); });
    one(root, '[data-di-reset]').addEventListener('click', () => { input.value = root.dataset.diDefault; stage = 0; render(); });
    enhance(root); render();
  }
  function setupDecode(root) {
    const width = one(root, '[data-di-width]'), input = one(root, '[data-di-value]');
    function render() {
      const w = widthOf(root), bits = Core.normalizeBits(input.value, w);
      one(root, '[data-di-limit]').textContent = `0と1を${w}桁入力します。桁を区切る空白も使えます。`;
      if (!validity(root, [input], [bits !== null], `0と1を${w}桁で入力してください。先頭の0も含めます。`)) return;
      const value = Core.decode(bits, w), complement = Core.complement(bits, w);
      setCode(root, '[data-di-original]', bits); setCode(root, '[data-di-ones]', complement.ones);
      one(root, '[data-di-absolute]').replaceChildren(code(complement.twos), ` ＝ ${Math.abs(value)}`);
      all(root, '.di-decode-table tbody tr').slice(1).forEach(row => { row.hidden = value >= 0; });
      one(root, '[data-di-result]').replaceChildren(code(bits), ` は ${signed(value)} を表します。`);
      one(root, '[data-di-decode-note]').textContent = value < 0 ? '絶対値を求めた行は、符号なしの2進数として読みます。最後に負の符号を付けます。' : '先頭が0なので、反転せずに各桁の値を合計します。';
      resize();
    }
    const reset = () => { input.value = widthOf(root) === 4 ? '1010' : '11011011'; render(); };
    input.addEventListener('input', render); width.addEventListener('change', reset);
    one(root, '[data-di-reset]').addEventListener('click', reset); enhance(root); render();
  }
  function setupArithmetic(root) {
    const left = one(root, '[data-di-a]'), right = one(root, '[data-di-b]'), operation = one(root, '[data-di-operation]');
    function render() {
      const w = widthOf(root), limits = Core.range(w), a = Core.parseInteger(left.value), b = Core.parseInteger(right.value);
      one(root, '[data-di-limit]').textContent = `入力できる整数は${signed(limits.min)}〜${limits.max}です。`;
      if (!validity(root, [left, right], [a, b].map(v => v !== null && v >= limits.min && v <= limits.max), `${signed(limits.min)}〜${limits.max}の整数を入力してください。`)) return;
      const result = Core.arithmetic(a, b, w, operation.value);
      setCode(root, '[data-di-left]', result.leftBits); setCode(root, '[data-di-operand]', result.operandBits); setCode(root, '[data-di-kept]', result.bits);
      one(root, '.di-arithmetic-table tbody tr:last-child th').textContent = `下位${w}bitを残す`;
      const carry = document.createElement('span'); carry.className = 'di-carry'; carry.textContent = result.fullBits[0];
      carry.setAttribute('aria-label', `幅外の桁 ${result.fullBits[0]}`);
      one(root, '[data-di-full]').replaceChildren(carry, ' ', code(result.bits));
      const explanation = one(root, '[data-di-arithmetic-explanation]');
      if (operation.value === 'subtract') explanation.replaceChildren(`引く数 ${signed(b)} のビット列 `, code(result.rightBits), ' の2の補数 ', code(result.operandBits), ' を加えます。');
      else explanation.textContent = 'それぞれの整数を2の補数によるビット列で表して加えます。';
      one(root, '[data-di-result]').replaceChildren(`${signed(a)}${operation.value === 'add' ? '＋' : '−'}(${signed(b)}) ＝ ${signed(result.expected)}（数学上の答え）`, document.createElement('br'), `下位${w}bitの値は ${signed(result.decoded)} です。`);
      const status = one(root, '[data-di-overflow]'); status.dataset.overflow = String(result.overflow);
      status.textContent = result.overflow ? 'オーバーフロー。残したビット列は数学上の答えを表していません。' : '答えは表現範囲内です。';
      one(root, '[data-di-carry-note]').textContent = `幅外への繰り上がり：${result.carry ? 'あり' : 'なし'}。点線の1桁を除き、下位${w}bitを残します。`;
      resize();
    }
    for (const input of [left, right]) input.addEventListener('input', render);
    operation.addEventListener('change', render); one(root, 'select[data-di-width]')?.addEventListener('change', render);
    all(root, '[data-di-preset-a]').forEach(button => button.addEventListener('click', () => { left.value = button.dataset.diPresetA; right.value = button.dataset.diPresetB; operation.value = button.dataset.diPresetOp; render(); }));
    one(root, '[data-di-reset]').addEventListener('click', () => { const width = one(root, 'select[data-di-width]'); if (width) width.value = '4'; left.value = root.dataset.diDefaultA; right.value = root.dataset.diDefaultB; operation.value = 'add'; render(); });
    enhance(root); render();
  }
  function setupRange(root) {
    const input = one(root, '[data-di-value]'), width = one(root, '[data-di-width]');
    const decrease = one(root, '[data-di-decrease]'), increase = one(root, '[data-di-increase]');
    function render() {
      const w = widthOf(root), value = Core.parseInteger(input.value), limits = Core.range(w);
      const valid = validity(root, [input], [value !== null && value >= limits.min && value <= limits.max], `${signed(limits.min)}〜${limits.max}の整数を入力してください。`);
      one(root, '[data-di-limit]').textContent = `${signed(limits.min)}〜${limits.max}の間で変化させます。`;
      decrease.disabled = !valid || value === limits.min; increase.disabled = !valid || value === limits.max;
      if (valid) one(root, '[data-di-result]').replaceChildren(`${signed(value)} ＝ `, code(Core.encode(value, w)), `（${w}bit）`);
    }
    input.addEventListener('input', render); width.addEventListener('change', render);
    decrease.addEventListener('click', () => { input.value = Core.parseInteger(input.value) - 1; render(); });
    increase.addEventListener('click', () => { input.value = Core.parseInteger(input.value) + 1; render(); });
    for (const key of ['min', 'max']) one(root, `[data-di-${key}]`).addEventListener('click', () => { input.value = Core.range(widthOf(root))[key]; render(); });
    one(root, '[data-di-reset]').addEventListener('click', () => { input.value = '0'; render(); });
    enhance(root); render();
  }
  function setupShift(root) {
    const input = one(root, '[data-di-shift-value]');
    const direction = one(root, '[data-di-shift-direction]');
    const count = one(root, '[data-di-shift-count]');
    function render() {
      const value = Core.parseInteger(input.value);
      const valid = value !== null && value >= 0 && value <= 255;
      input.setAttribute('aria-invalid', String(!valid));
      one(root, '[data-di-shift-error]').hidden = valid;
      one(root, '[data-di-shift-output]').hidden = !valid;
      if (!valid) { resize(); return; }
      const result = Core.unsignedShift(value, 8, Number(count.value), direction.value);
      setCode(root, '[data-di-shift-original]', result.originalBits);
      one(root, '[data-di-shift-decimal]').textContent = value;
      setCode(root, '[data-di-shift-result-bits]', result.bits);
      one(root, '[data-di-shift-operation]').textContent = `${result.direction === 'left' ? '左' : '右'}へ${result.count}桁`;
      const power = result.count === 1 ? '2' : `2の${result.count}乗`;
      const factor = result.factor;
      const resultValue = one(root, '[data-di-shift-result]');
      if (result.direction === 'left') {
        if (result.overflow) {
          resultValue.replaceChildren(`${value} × ${factor} ＝ ${value * factor}（数学上の値）`, document.createElement('br'), `8bitで残る値は ${result.shiftedValue}`);
        } else resultValue.textContent = `${value} × ${factor} ＝ ${result.shiftedValue}`;
        one(root, '[data-di-shift-rule]').textContent = `左へ${result.count}桁：${power}倍。右端の${result.count}桁へ0を入れます。`;
        one(root, '[data-di-shift-discarded]').textContent = result.overflow
          ? `左から出たbit：${result.discardedBits || 'なし'}。8bitでは上位bitを失うため、${value}×${factor}＝${value * factor}を表せません。`
          : `左から出たbit：${result.discardedBits || 'なし'}。8bitの範囲内です。`;
      } else {
        resultValue.replaceChildren(`${value} ÷ ${factor} ＝ ${result.shiftedValue} 余り ${result.remainder}`);
        one(root, '[data-di-shift-rule]').textContent = `右へ${result.count}桁：${power}で割った商（整数）になります。左端の${result.count}桁へ0を入れます。`;
        one(root, '[data-di-shift-discarded]').textContent = `右から出たbit：${result.discardedBits || 'なし'}（${result.remainder}を表します）。`;
      }
      resize();
    }
    input.addEventListener('input', render);
    direction.addEventListener('change', render);
    count.addEventListener('change', render);
    one(root, '[data-di-shift-reset]').addEventListener('click', () => { input.value = '34'; direction.value = 'left'; count.value = '2'; render(); });
    enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [['[data-di-unsigned]', setupUnsigned], ['[data-di-sign]', setupSign], ['[data-di-build]', setupBuild], ['[data-di-decode]', setupDecode], ['[data-di-arithmetic]', setupArithmetic], ['[data-di-range]', setupRange], ['[data-di-shift]', setupShift]]) {
      all(document, selector).forEach(root => { try { setup(root); } catch (error) { console.error('整数表現の操作を初期化できませんでした。', error); } });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
