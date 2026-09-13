(function () {
  'use strict';
  const Core = window.DigitalRadixCore;
  if (!Core) return;
  const one = (root, selector) => root.querySelector(selector);
  const all = (root, selector) => Array.from(root.querySelectorAll(selector));
  const node = (tag, text, className) => {
    const element = document.createElement(tag);
    if (text !== undefined) element.textContent = text;
    if (className) element.className = className;
    return element;
  };
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const enhance = root => all(root, '.db-enhancement').forEach(el => { el.hidden = false; });
  const numeral = (value, base) => {
    const span = node('span', value, 'rx-numeral'); span.append(node('sub', `(${base})`)); return span;
  };
  function equation(element, source, from, target, to) {
    element.replaceChildren(numeral(source, from), ' ＝ ', numeral(target, to));
  }
  function validate(root, input, base) {
    const text = Core.normalizeNumeral(input.value, base);
    const feedback = one(root, '[data-rx-error]');
    input.setAttribute('aria-invalid', String(text === null));
    feedback.hidden = text !== null;
    feedback.textContent = text === null ? (base === 2 ? '0と1で1〜16桁の2進数を入力してください。' : base === 16 ? '0〜9・A〜Fで1〜4桁の16進数を入力してください。' : '0〜65,535の整数を入力してください。') : '';
    return text;
  }
  function setupCounter(root) {
    const input = one(root, '[data-rx-count]');
    const decrease = one(root, '[data-rx-decrement]'), increase = one(root, '[data-rx-increment]');
    function render() {
      const value = Number(input.value), valid = input.value !== '' && Number.isInteger(value) && value >= 0 && value <= 32;
      input.setAttribute('aria-invalid', String(!valid));
      const error = one(root, '[data-rx-error]'); error.hidden = valid; error.textContent = valid ? '' : '0〜32の整数を入力してください。';
      one(root, 'table').hidden = !valid;
      decrease.disabled = !valid || value === 0; increase.disabled = !valid || value === 32;
      if (valid) for (const [key, base] of [['dec', 10], ['bin', 2], ['hex', 16]]) one(root, `[data-rx-count-${key}]`).textContent = Core.formatNumeral(value, base);
    }
    input.addEventListener('input', render);
    decrease.addEventListener('click', () => { input.value = Number(input.value) - 1; render(); });
    increase.addEventListener('click', () => { input.value = Number(input.value) + 1; render(); });
    one(root, '[data-rx-counter-reset]').addEventListener('click', () => { input.value = '15'; render(); });
    enhance(root); render();
  }
  function setupDivision(root) {
    const base = Number(root.dataset.rxBase), input = one(root, '[data-rx-value]');
    const next = one(root, '[data-rx-next]'), restart = one(root, '[data-rx-restart]');
    const body = one(root, '[data-rx-division-rows]'), answer = one(root, '[data-rx-division-answer]');
    let shown = 1;
    function render() {
      const text = validate(root, input, 10), valid = text !== null;
      const steps = valid ? Core.divisionSteps(Core.parseNumeral(text, 10), base) : [];
      one(root, 'table').hidden = !valid;
      next.disabled = !valid || shown >= steps.length; restart.disabled = !valid || shown === 1;
      body.replaceChildren(...steps.map((step, index) => {
        const row = node('tr'); row.hidden = index >= shown;
        const heading = node('th', index + 1); heading.scope = 'row';
        row.append(heading, node('td', `${step.dividend} ÷ ${base}`), node('td', step.quotient), node('td', `${step.remainder}${base === 16 && step.remainder > 9 ? `（${step.digit}）` : ''}`, 'rx-remainder'));
        return row;
      }));
      answer.hidden = !valid || shown < steps.length;
      if (valid) equation(one(root, '[data-rx-division-result]'), text, 10, steps.map(s => s.digit).reverse().join(''), base);
      else one(root, '[data-rx-division-result]').replaceChildren();
      resize();
    }
    input.addEventListener('input', () => { shown = 1; render(); });
    next.addEventListener('click', () => { shown += 1; render(); });
    restart.addEventListener('click', () => { shown = 1; render(); });
    one(root, '[data-rx-reset]').addEventListener('click', () => { input.value = root.dataset.rxDefault; shown = 1; render(); });
    enhance(root); render();
  }
  function setupPlace(root) {
    const base = Number(root.dataset.rxBase), input = one(root, '[data-rx-value]');
    const weights = one(root, '[data-rx-weights]'), digits = one(root, '[data-rx-digits]'), products = one(root, '[data-rx-products]');
    const expression = one(root, '[data-rx-place-expression]'), result = one(root, '[data-rx-place-result]');
    let length = 0;
    function render() {
      const text = validate(root, input, base), valid = text !== null;
      one(root, 'table').hidden = expression.hidden = result.hidden = !valid;
      if (!valid) return;
      const terms = Core.placeTerms(text, base);
      if (terms.length !== length) {
        length = terms.length;
        for (const [row, label] of [[weights, '位の値'], [digits, '数字'], [products, '数字×位の値']]) {
          const heading = node('th', label); heading.scope = 'row'; row.replaceChildren(heading);
        }
        terms.forEach((term, index) => {
          const weight = node('th', base); weight.scope = 'col'; weight.append(node('sup', term.power), node('br'), String(term.weight)); weights.append(weight);
          const cell = node('td');
          if (base === 2) {
            const bit = node('button', term.digit, 'db-bit'); bit.type = 'button'; bit.tabIndex = 0;
            bit.addEventListener('click', () => {
              const current = Core.normalizeNumeral(input.value, base);
              if (current === null) return;
              input.value = current.slice(0, index) + (current[index] === '0' ? '1' : '0') + current.slice(index + 1); render();
            });
            cell.append(bit);
          } else cell.textContent = term.digit;
          digits.append(cell); products.append(node('td', term.product));
        });
      }
      terms.forEach((term, index) => {
        const cell = digits.children[index + 1];
        if (base === 2) {
          const bit = cell.firstElementChild; bit.textContent = term.digit;
          bit.setAttribute('aria-pressed', String(term.digit === '1'));
          bit.setAttribute('aria-label', `${term.weight}の位、${term.digit}。押すと切り替えます`);
        } else cell.textContent = term.digit;
        products.children[index + 1].textContent = term.product;
      });
      expression.replaceChildren();
      terms.forEach((term, index) => { if (index) expression.append(' ＋ '); expression.append(node('span', `${term.digitValue} × ${term.weight}`, 'rx-term')); });
      equation(result, text, base, String(Core.parseNumeral(text, base)), 10); resize();
    }
    input.addEventListener('input', render);
    one(root, '[data-rx-reset]').addEventListener('click', () => { input.value = root.dataset.rxDefault; render(); });
    enhance(root); render();
  }
  function setupGroups(root) {
    const base = Number(root.dataset.rxBase), input = one(root, '[data-rx-value]');
    const table = one(root, 'table'), grouped = one(root, '[data-rx-grouped]');
    const note = one(root, '[data-rx-padding-note]'), result = one(root, '[data-rx-group-result]'), minimal = one(root, '[data-rx-minimal]');
    function render() {
      const text = validate(root, input, base), valid = text !== null;
      [table, grouped, note, result, minimal].forEach(el => { el.hidden = !valid; });
      if (!valid) return;
      const data = base === 2 ? Core.groupBinary(text) : Core.expandHex(text);
      const rows = base === 2 ? [['2進数（4桁ずつ）', 'binary'], ['10進数での値', 'value'], ['16進数（1桁ずつ）', 'hex']] : [['16進数（1桁ずつ）', 'hex'], ['10進数での値', 'value'], ['2進数（4桁ずつ）', 'binary']];
      one(root, '[data-rx-group-rows]').replaceChildren(...rows.map(([label, key]) => {
        const row = node('tr'), header = node('th', label); header.scope = 'row'; row.append(header, ...data.groups.map(g => node('td', g[key]))); return row;
      }));
      if (base === 2) {
        const display = data.groups.map(g => g.binary).join(' '); grouped.replaceChildren();
        if (data.padding) {
          const padding = node('span', display.slice(0, data.padding), 'rx-padding'); padding.setAttribute('aria-label', `補った${data.padding}個の0`); grouped.append(padding);
        }
        grouped.append(display.slice(data.padding));
        note.textContent = data.padding ? `右から4桁ずつ区切り、左端に0を${data.padding}個補います。下線部分が補った0です。` : '右から4桁ずつ区切ります。左端も4桁なので、そのまま対応させます。';
        equation(result, text, 2, data.groups.map(g => g.hex).join(''), 16); minimal.hidden = true;
      } else {
        grouped.textContent = [...text].join(' ');
        note.textContent = '各桁を4bitにして並べます。途中の0は省略しません。';
        equation(result, text, 16, data.groups.map(g => g.binary).join(' '), 2);
        minimal.hidden = data.binary === data.minimal;
        minimal.replaceChildren('数全体の先頭にある0を省略した ', numeral(data.minimal, 2), ' も、同じ値を表します。');
      }
      resize();
    }
    input.addEventListener('input', render);
    one(root, '[data-rx-reset]').addEventListener('click', () => { input.value = root.dataset.rxDefault; render(); });
    all(root, '[data-rx-preset]').forEach(button => button.addEventListener('click', () => { input.value = button.dataset.rxPreset; render(); }));
    enhance(root); render();
  }
  function init() {
    for (const [selector, setup] of [['[data-rx-counter]', setupCounter], ['[data-rx-division]', setupDivision], ['[data-rx-place]', setupPlace], ['[data-rx-groups]', setupGroups]]) {
      all(document, selector).forEach(root => { try { setup(root); } catch (error) { console.error('基数変換の操作を初期化できませんでした。', error); } });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once: true }); else init();
})();
