(function () {
  'use strict';
  const Core = window.DigitalBasicsCore;
  if (!Core) return;
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const one = (root, selector) => root.querySelector(selector);
  const set = (root, selector, text) => { one(root, selector).textContent = text; };
  const format = number => number.toLocaleString('ja-JP', { maximumSignificantDigits: 12 });
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(element => { element.hidden = false; });
  function node(tag, text, className) {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  }
  function setupLength(root) {
    const input = one(root, '[data-db-length-input]');
    const interval = one(root, '[data-db-length-step]');
    function render() {
      const value = Number(input.value), step = Number(interval.value);
      const rounded = Core.quantizeLength(value, step);
      const x = 40 + value * 64, rx = 40 + rounded * 64;
      set(root, '[data-db-length-value]', `${format(value)} cm`);
      one(root, '[data-db-length-analog]').setAttribute('d', `M40 80H${x}`);
      one(root, '[data-db-length-dot]').setAttribute('cx', x);
      one(root, '[data-db-length-digital]').setAttribute('d', `M40 180H${rx}`);
      one(root, '[data-db-length-square]').setAttribute('x', rx - 7);
      const ticks = one(root, '[data-db-length-ticks]');
      ticks.replaceChildren();
      for (let i = 0; i <= Math.round(10 / step); i += 1) {
        const line = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        line.setAttribute('class', 'db-grid-line');
        line.setAttribute('d', `M${40 + i * step * 64} 167v26`);
        ticks.append(line);
      }
      const message = `${format(value)} cmを${format(step)} cm間隔にそろえると、${format(rounded)} cm`;
      set(root, '[data-db-length-result]', message);
      set(root, '#db-length-desc', `上の線は元の長さ${format(value)}cm、下の線は${format(step)}cm間隔の値にそろえた${format(rounded)}cmです。`);
    }
    input.addEventListener('input', render); interval.addEventListener('change', render);
    one(root, '[data-db-length-reset]').addEventListener('click', () => { input.value = '5.3'; interval.value = '1'; render(); });
    enhance(root); render();
  }
  function setupBits(root) {
    const count = one(root, '[data-db-bit-count]');
    const row = one(root, '[data-db-bit-row]');
    const patterns = one(root, '[data-db-patterns]');
    patterns.setAttribute('data-lesson-slide-navigation-lock', '');
    patterns.setAttribute('role', 'group'); patterns.setAttribute('aria-label', 'すべてのビットの組合せ。矢印キーで選択');
    let bits = Array(Number(count.value)).fill(0);
    function update() {
      const selected = bits.join('');
      all(row, 'button').forEach((button, i) => {
        button.textContent = bits[i]; button.setAttribute('aria-pressed', String(Boolean(bits[i])));
        button.setAttribute('aria-label', `左から${i + 1}桁目、${bits[i]}。押すと切り替えます`);
      });
      all(patterns, 'button').forEach(button => {
        const current = button.textContent === selected;
        button.setAttribute('aria-pressed', String(current)); button.tabIndex = current ? 0 : -1;
      });
    }
    function build() {
      bits = Array(Number(count.value)).fill(0);
      row.replaceChildren(...bits.map((_, i) => {
        const button = node('button', '0', 'db-bit'); button.type = 'button';
        button.addEventListener('click', () => { bits[i] = 1 - bits[i]; update(); }); return button;
      }));
      patterns.replaceChildren(...Core.binaryPatterns(bits.length).map(pattern => {
        const button = node('button', pattern, 'db-pattern'); button.type = 'button';
        button.addEventListener('click', () => { bits = [...pattern].map(Number); update(); }); return button;
      }));
      const result = one(root, '[data-db-bits-result]'); result.replaceChildren();
      result.append(node('span', `${Array(bits.length).fill('2').join(' × ')} ＝ 2`), node('sup', bits.length), node('span', ` ＝ ${format(Core.combinations(bits.length))}通り`));
      update(); resize();
    }
    patterns.addEventListener('keydown', event => {
      const buttons = all(patterns, 'button');
      const index = buttons.indexOf(document.activeElement);
      if (index < 0 || !['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
      event.preventDefault(); event.stopPropagation();
      const target = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (index + (['ArrowLeft', 'ArrowUp'].includes(event.key) ? -1 : 1) + buttons.length) % buttons.length;
      buttons[target].click(); buttons[target].focus();
    });
    count.addEventListener('change', build);
    one(root, '[data-db-bits-reset]').addEventListener('click', () => { bits.fill(0); update(); });
    enhance(root); build();
  }
  function setupCapacity(root) {
    const input = one(root, '[data-db-needed]');
    function render() {
      const count = Number(input.value);
      const valid = input.value !== '' && Number.isSafeInteger(count) && count >= 2 && count <= 65536;
      input.setAttribute('aria-invalid', String(!valid));
      one(root, '.db-capacity').hidden = !valid;
      if (!valid) { set(root, '[data-db-capacity-result]', '2〜65,536の整数を入力してください。'); return; }
      const bits = Core.requiredBits(count), low = Core.combinations(bits - 1), high = Core.combinations(bits);
      set(root, '[data-db-capacity-low-label]', `${bits - 1}bit：${format(low)}通り`);
      set(root, '[data-db-capacity-want-label]', `必要：${format(count)}通り`);
      set(root, '[data-db-capacity-high-label]', `${bits}bit：${format(high)}通り`);
      one(root, '[data-db-capacity-low]').style.width = `${low / high * 100}%`;
      one(root, '[data-db-capacity-want]').style.width = `${count / high * 100}%`;
      const result = one(root, '[data-db-capacity-result]'); result.replaceChildren();
      result.append(node('span', '2'), node('sup', bits - 1), node('span', `＝${format(low)} ＜ ${format(count)} ≦ ${format(high)}＝2`), node('sup', bits), node('span', ` なので、少なくとも${bits}bit必要です。`));
    }
    input.addEventListener('input', render);
    one(root, '[data-db-capacity-reset]').addEventListener('click', () => { input.value = '120'; render(); });
    enhance(root); render();
  }
  function setupConverter(root) {
    const input = one(root, '[data-db-convert-value]');
    const from = one(root, '[data-db-from]'), to = one(root, '[data-db-to]'), base = one(root, '[data-db-base]');
    function render() {
      const radix = Number(base.value);
      all(root, '[data-db-base-value]').forEach(span => { span.textContent = radix; });
      set(root, '[data-db-base-note]', radix === 1024 ? '1024＝2¹⁰なので、1MB＝2²⁰Bです。' : '1000倍換算では、1MB＝1000×1000Bです。この操作欄の選択は、ほかのスライドの問題の条件を変えません。');
      const value = Number(input.value), valid = input.value !== '' && Number.isFinite(value) && value >= 0 && value <= 1e6;
      input.setAttribute('aria-invalid', String(!valid));
      if (!valid) { set(root, '[data-db-convert-result]', '0〜1,000,000の数値を入力してください。'); set(root, '[data-db-convert-equation]', ''); return; }
      const result = Core.convert(value, from.value, to.value, radix);
      const rounded = Number(format(result).replaceAll(',', '')) !== result;
      const equal = rounded ? ' ≈ ' : ' ＝ ';
      set(root, '[data-db-convert-result]', `${format(value)}${from.value}${equal}${format(result)}${to.value}`);
      const start = Core.UNITS.indexOf(from.value), end = Core.UNITS.indexOf(to.value);
      const parts = [format(value)];
      if (start > end) for (let i = start; i > end; i -= 1) parts.push(`× ${i === 1 ? 8 : format(radix)}`);
      if (start < end) for (let i = start; i < end; i += 1) parts.push(`÷ ${i === 0 ? 8 : format(radix)}`);
      set(root, '[data-db-convert-equation]', `${parts.join(' ')}${equal}${format(result)}${rounded ? '（表示は有効数字12桁）' : ''}`);
    }
    [from, to, base].forEach(select => select.addEventListener('change', render)); input.addEventListener('input', render);
    one(root, '[data-db-convert-reset]').addEventListener('click', () => { input.value = '4'; from.value = 'GB'; to.value = 'MB'; base.value = '1024'; render(); });
    enhance(root); render();
  }
  function setupSolution(root) {
    const items = all(root, 'ol > li'), next = one(root, '[data-db-step-next]'), reset = one(root, '[data-db-step-reset]');
    let count = 1;
    const render = () => {
      items.forEach((item, i) => { item.hidden = i >= count; });
      next.disabled = count >= items.length; reset.disabled = count <= 1; resize();
    };
    next.addEventListener('click', () => { count = Math.min(count + 1, items.length); render(); });
    reset.addEventListener('click', () => { count = 1; render(); });
    render();
  }
  function setupQuestionGroup(root) {
    const forms = all(root, '[data-db-question]'), select = one(root, '[data-db-question-select]');
    select.replaceChildren(...forms.map((form, index) => { const option = node('option', `${index + 1} / ${forms.length}　${form.dataset.dbQuestionTitle}`); option.value = index; return option; }));
    function show() { forms.forEach((form, i) => { form.hidden = i !== Number(select.value); }); resize(); }
    forms.forEach(form => {
      const input = one(form, '[data-db-answer]'), feedback = one(form, '[data-db-feedback]');
      const clear = () => { feedback.textContent = ''; delete feedback.dataset.correct; if (input) input.removeAttribute('aria-invalid'); };
      form.addEventListener('submit', event => {
        event.preventDefault();
        const selected = one(form, 'input[type="radio"]:checked');
        const value = input ? Core.parseAnswer(input.value) : selected?.value;
        const correct = input ? value !== null && value === Core.expectedAnswer(form.dataset.dbQuestion) : value === form.dataset.dbChoiceAnswer;
        feedback.dataset.correct = String(correct);
        feedback.textContent = correct ? '正解です。解き方も確認しましょう。' : (value === null || value === undefined ? (input ? '数値を入力してください。全角数字や3桁ごとのカンマも使えます。' : '選択肢を1つ選んでください。') : 'もう一度考えてみましょう。「解き方を確認」で途中の考え方を見られます。');
        if (input) input.setAttribute('aria-invalid', String(!correct));
        resize();
      });
      form.addEventListener('input', clear); form.addEventListener('reset', clear);
      all(form, '.db-solution').forEach(setupSolution);
    });
    select.addEventListener('change', show); enhance(root); show();
  }
  function init() {
    for (const [selector, setup] of [
      ['[data-db-length]', setupLength], ['[data-db-bits]', setupBits], ['[data-db-capacity]', setupCapacity],
      ['[data-db-converter]', setupConverter], ['[data-db-question-group]', setupQuestionGroup]
    ]) all(document, selector).forEach(element => {
      try { setup(element); } catch (error) { console.error('デジタル表現の操作を初期化できませんでした。', error); }
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
