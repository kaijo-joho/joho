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
  const legend = find('[data-cp-frequency-band-legend]');
  const headers = Array.from(root.querySelectorAll('thead [data-cp-frequency-column]'));
  if ([source, fixedTrack, variableTrack, legend].some(element => !element) || headers.length !== symbols.length) return;

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

  // The table letters provide full-size keyboard/touch targets without a separate
  // letter picker. Hovering source letters or either code track uses the same state.
  const buttons = headers.map(header => {
    const symbol = header.dataset.cpFrequencyColumn;
    const button = make('button', 'cp-frequency-letter', symbol);
    button.type = 'button';
    button.dataset.cpFrequencyLetter = symbol;
    button.setAttribute('aria-label', `${symbol}、${fixture.frequencies[symbol]}回。同じ文字の場所を強調`);
    button.setAttribute('aria-pressed', 'false');
    header.replaceChildren(button);
    return button;
  });
  const columns = Array.from(root.querySelectorAll('[data-cp-frequency-column]'));
  let hovered = '';
  let focused = '';
  let tapped = '';
  let keyboardInput = false;
  const letterAt = target => {
    const column = target instanceof Element ? target.closest('[data-cp-frequency-column]') : null;
    return column && root.contains(column) ? column.dataset.cpFrequencyColumn : '';
  };
  function renderHighlight() {
    const symbol = hovered || focused || tapped;
    root.dataset.cpFrequencyActive = symbol;
    columns.forEach(element => element.classList.toggle('is-current', element.dataset.cpFrequencyColumn === symbol));
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.cpFrequencyLetter === symbol)));
  }
  function clearHighlight() {
    hovered = focused = tapped = '';
    renderHighlight();
  }
  root.addEventListener('pointerover', event => {
    if (event.pointerType === 'touch') return;
    keyboardInput = false;
    focused = tapped = '';
    hovered = letterAt(event.target);
    renderHighlight();
  });
  root.addEventListener('pointerout', event => {
    if (event.pointerType === 'touch') return;
    hovered = letterAt(event.relatedTarget);
    renderHighlight();
  });
  root.addEventListener('pointerdown', event => {
    keyboardInput = false;
    focused = '';
    if (event.pointerType === 'touch') {
      hovered = '';
      const symbol = letterAt(event.target);
      tapped = tapped === symbol ? '' : symbol;
    } else tapped = '';
    renderHighlight();
  });
  document.addEventListener('keydown', event => {
    if (event.key === 'Tab') keyboardInput = true;
  }, true);
  root.addEventListener('focusin', event => {
    if (!keyboardInput || !event.target.matches('[data-cp-frequency-letter]')) return;
    hovered = tapped = '';
    focused = letterAt(event.target);
    renderHighlight();
  });
  root.addEventListener('focusout', () => { focused = ''; renderHighlight(); });
  root.addEventListener('keydown', event => {
    if (event.key === 'Escape') { clearHighlight(); return; }
    if (!event.target.matches('[data-cp-frequency-letter]')) return;
    keyboardInput = true;
    hovered = tapped = '';
    focused = letterAt(event.target);
    renderHighlight();
  });
  buttons.forEach(button => button.addEventListener('click', event => {
    // Screen reader activation may produce a click without a key or pointer event.
    if (event.detail !== 0) return;
    keyboardInput = true;
    hovered = tapped = '';
    focused = button.dataset.cpFrequencyLetter;
    renderHighlight();
  }));
  document.addEventListener('pointerdown', event => {
    if (!root.contains(event.target)) clearHighlight();
  });
  document.addEventListener('joho:lesson-slide-change', event => {
    if (!event.detail?.slide?.contains(root)) clearHighlight();
  });
  renderHighlight();
  legend.hidden = false;
})();
