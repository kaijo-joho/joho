(function () {
  'use strict';

  const root = document.querySelector('[data-cp-frequency-comparison]');
  const Core = window.CompressionCore;
  if (!root || !Core || !Core.HUFFMAN_EXAMPLE) return;

  const fixture = Core.HUFFMAN_EXAMPLE;
  const text = fixture.text;
  const symbols = ['A', 'B', 'C', 'D', 'E'];
  const fixedCodes = { A: '001', B: '010', C: '011', D: '100', E: '101' };
  const codes = fixture.codes;
  const expectedCodes = { A: '10', B: '0', C: '110', D: '1110', E: '1111' };
  const fixedBits = Array.from(text, symbol => fixedCodes[symbol]).join('');
  const variableBits = Core.encodeHuffman(text, codes);
  if (text !== 'DAEBCBACBBBCDAAABB' || symbols.some(symbol => codes[symbol] !== expectedCodes[symbol]) || fixedBits.length !== 54 || variableBits.length !== 38) return;

  const find = selector => root.querySelector(selector);
  const source = find('[data-cp-frequency-source]');
  const fixedTrack = find('[data-cp-frequency-fixed-bits]');
  const variableTrack = find('[data-cp-frequency-variable-bits]');
  const controls = find('[data-cp-frequency-controls]');
  const summary = find('[data-cp-frequency-summary]');
  const legend = find('[data-cp-frequency-band-legend]');
  const selectedLabel = find('[data-cp-frequency-selected]');
  const selectedFixed = find('[data-cp-frequency-selected-fixed]');
  const selectedVariable = find('[data-cp-frequency-selected-variable]');
  const selectedFixedTotal = find('[data-cp-frequency-selected-fixed-total]');
  const selectedVariableTotal = find('[data-cp-frequency-selected-variable-total]');
  const change = find('[data-cp-frequency-change]');
  const buttons = Array.from(root.querySelectorAll('[data-cp-frequency-select]'));
  if ([source, fixedTrack, variableTrack, controls, summary, legend, selectedLabel, selectedFixed, selectedVariable, selectedFixedTotal, selectedVariableTotal, change].some(element => !element) || buttons.length !== symbols.length) return;

  function make(tag, className, value) {
    const element = document.createElement(tag);
    if (className) element.className = className;
    if (value !== undefined) element.textContent = value;
    return element;
  }

  function drawTrack(container, codeMap, label) {
    const words = Array.from(text, (symbol, index) => {
      const code = codeMap[symbol];
      const word = make('div', 'cp-frequency-word');
      // Both tracks use the fixed-length total as their scale: n bits occupy n/54.
      word.style.flexBasis = `${code.length / fixedBits.length * 100}%`;
      word.dataset.cpFrequencyColumn = symbol;
      word.dataset.cpFrequencyWord = symbol;
      word.title = `${index + 1}文字目・${symbol}：${code}（${code.length}bit）`;
      word.setAttribute('aria-hidden', 'true');
      const cells = make('div', 'cp-frequency-cells');
      cells.append(...Array.from(code, bit => make('span', 'cp-frequency-bit', bit)));
      word.append(make('span', 'cp-frequency-word__symbol', symbol), cells);
      return word;
    });
    container.replaceChildren(...words);
    container.setAttribute('role', 'img');
    const encoded = Array.from(text, symbol => codeMap[symbol]);
    container.setAttribute('aria-label', `${label}、${encoded.join('').length}bit。${encoded.join('、')}`);
  }

  source.replaceChildren(...Array.from(text, symbol => {
    const character = make('span', '', symbol);
    character.dataset.cpFrequencyColumn = symbol;
    return character;
  }));
  drawTrack(fixedTrack, fixedCodes, '固定長符号');
  drawTrack(variableTrack, codes, '可変長符号');
  symbols.forEach(symbol => {
    const values = { count: `${fixture.frequencies[symbol]}回`, code: codes[symbol], length: `${codes[symbol].length}bit`, contribution: `${fixture.frequencies[symbol] * codes[symbol].length}bit` };
    Object.entries(values).forEach(([kind, value]) => {
      const cell = find(`[data-cp-frequency-${kind}="${symbol}"]`);
      if (cell) cell.textContent = value;
    });
  });

  function select(symbol) {
    if (!symbols.includes(symbol)) return;
    root.dataset.cpFrequencySelected = symbol;
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cpFrequencySelect === symbol)));
    root.querySelectorAll('[data-cp-frequency-column]').forEach(element => element.classList.toggle('is-current', element.dataset.cpFrequencyColumn === symbol));
    const count = fixture.frequencies[symbol];
    const fixedTotal = count * fixedCodes[symbol].length;
    const variableTotal = count * codes[symbol].length;
    selectedLabel.textContent = `${symbol}・${count}回`;
    selectedFixed.textContent = fixedCodes[symbol];
    selectedVariable.textContent = codes[symbol];
    selectedFixedTotal.textContent = `${count}回×3bit＝${fixedTotal}bit`;
    selectedVariableTotal.textContent = `${count}回×${codes[symbol].length}bit＝${variableTotal}bit`;
    const difference = fixedTotal - variableTotal;
    change.textContent = difference > 0 ? `${symbol}が使うbit数は${difference}bit少なくなります。`
      : difference < 0 ? `${symbol}が使うbit数は${-difference}bit多くなりますが、全体では54bitから38bitへ減ります。`
      : `${symbol}が使うbit数は同じです。`;
  }

  buttons.forEach(button => button.addEventListener('click', () => select(button.dataset.cpFrequencySelect)));
  select('B');
  controls.hidden = false;
  summary.hidden = false;
  legend.hidden = false;
})();
