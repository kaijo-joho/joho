(function () {
  'use strict';

  const root = document.querySelector('[data-cp-frequency-stepper]');
  const Core = window.CompressionCore;
  if (!root || !Core || !Core.HUFFMAN_EXAMPLE) return;

  const fixture = Core.HUFFMAN_EXAMPLE;
  const text = fixture.text;
  const symbols = ['A', 'B', 'C', 'D', 'E'];
  const fixedCodes = { A: '001', B: '010', C: '011', D: '100', E: '101' };
  const order = ['B', 'A', 'C', 'D', 'E'];
  const codes = fixture.codes;
  const expectedCodes = { A: '10', B: '0', C: '110', D: '1110', E: '1111' };
  const encodedFixed = Array.from(text, symbol => fixedCodes[symbol]);
  const encodedVariable = Core.encodeHuffman(text, codes);
  const tree = Core.huffmanFromCodes(fixture.frequencies, codes);
  if (text !== 'DAEBCBACBBBCDAAABB' || symbols.some(symbol => !fixedCodes[symbol] || codes[symbol] !== expectedCodes[symbol]) || encodedFixed.join('').length !== 54 || tree.totalBits !== 38 || encodedVariable.length !== 38) return;

  const next = root.querySelector('[data-cp-frequency-next]');
  const restart = root.querySelector('[data-cp-frequency-restart]');
  const status = root.querySelector('[data-cp-frequency-status]');
  const fallback = root.querySelector('[data-cp-frequency-fallback]');
  const results = root.querySelector('[data-cp-frequency-results]');
  const toolbar = root.querySelector('[data-cp-frequency-toolbar]');
  const fixedStreamPanel = root.querySelector('[data-cp-frequency-fixed-stream-panel]');
  const fixedStream = root.querySelector('[data-cp-frequency-fixed-bits]');
  const variableStreamPanel = root.querySelector('[data-cp-frequency-variable-stream-panel]');
  const variableStream = root.querySelector('[data-cp-frequency-variable-bits]');
  const ratio = root.querySelector('[data-cp-frequency-ratio]');
  const answer = root.querySelector('[data-cp-frequency-answer]');
  if (!next || !restart || !status || !fallback || !results || !toolbar || !fixedStreamPanel || !fixedStream || !variableStreamPanel || !variableStream || !ratio || !answer) return;

  const countCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-count]'), cell => [cell.dataset.cpFrequencyCount, cell]));
  const codeCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-code]'), cell => [cell.dataset.cpFrequencyCode, cell]));
  const lengthCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-length]'), cell => [cell.dataset.cpFrequencyLength, cell]));
  const contributionCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-contribution]'), cell => [cell.dataset.cpFrequencyContribution, cell]));
  const firstCharacters = Array.from(root.querySelectorAll('[data-cp-frequency-character]'));
  const firstFixedCodes = Array.from(root.querySelectorAll('[data-cp-frequency-fixed-code]'));
  const firstVariableCodes = Array.from(root.querySelectorAll('[data-cp-frequency-variable-code]'));
  const totals = {
    fixed: root.querySelector('[data-cp-frequency-fixed-total]'),
    frequency: root.querySelector('[data-cp-frequency-frequency-total]'),
    variable: root.querySelector('[data-cp-frequency-variable-total]'),
    contribution: root.querySelector('[data-cp-frequency-contribution-total]')
  };
  if (symbols.some(symbol => !countCells.has(symbol) || !codeCells.has(symbol) || !lengthCells.has(symbol) || !contributionCells.has(symbol)) || firstCharacters.length !== 6 || firstFixedCodes.length !== 6 || firstVariableCodes.length !== 6 || Object.values(totals).some(cell => !cell)) return;

  const fixedStreamText = encodedFixed.join(' ');
  const variableStreamText = Array.from(text, symbol => codes[symbol]).join(' ');
  const totalSteps = 15;
  let step = 0;

  function setCurrent(symbol) {
    root.querySelectorAll('[data-cp-frequency-column]').forEach(cell => cell.classList.toggle('is-current', cell.dataset.cpFrequencyColumn === symbol));
  }

  function render() {
    root.dataset.cpFrequencyStep = String(step);
    fixedStreamPanel.hidden = step < 2;
    variableStreamPanel.hidden = step < 13;
    ratio.hidden = step < 14;
    answer.hidden = step < 15;

    firstCharacters.forEach((cell, index) => { cell.textContent = text[index]; cell.dataset.cpFrequencyColumn = text[index]; });
    firstFixedCodes.forEach((cell, index) => { cell.textContent = step >= 1 ? fixedCodes[text[index]] : ''; cell.dataset.cpFrequencyColumn = text[index]; });
    firstVariableCodes.forEach((cell, index) => {
      const symbol = text[index];
      const codeStep = 8 + order.indexOf(symbol);
      cell.textContent = step >= codeStep ? codes[symbol] : '';
      cell.dataset.cpFrequencyColumn = symbol;
    });

    symbols.forEach(symbol => {
      const frequencyStep = 3 + symbols.indexOf(symbol);
      const codeStep = 8 + order.indexOf(symbol);
      countCells.get(symbol).textContent = step >= frequencyStep ? `${fixture.frequencies[symbol]}回` : '';
      codeCells.get(symbol).textContent = step >= codeStep ? codes[symbol] : '';
      lengthCells.get(symbol).textContent = step >= codeStep ? `${codes[symbol].length}bit` : '';
      contributionCells.get(symbol).textContent = step >= codeStep ? `${fixture.frequencies[symbol] * codes[symbol].length}bit` : '';
      [countCells, codeCells, lengthCells, contributionCells].forEach(cells => { cells.get(symbol).dataset.cpFrequencyColumn = symbol; });
    });

    totals.fixed.textContent = step >= 2 ? '18文字×3bit＝54bit' : '';
    totals.frequency.textContent = step >= 7 ? '18回' : '';
    totals.variable.textContent = step >= 12 ? '38bit' : '';
    totals.contribution.textContent = step >= 12 ? '38bit' : '';
    fixedStream.textContent = fixedStreamText;
    variableStream.textContent = variableStreamText;

    const messages = {
      0: 'まず、元の文字列と2つの表を見ます。文字の種類はA〜Eの5種類です。',
      1: '2bitでは4通りまでなので5種類には足りません。3bitなら8通りを表せます。A=001、B=010、C=011、D=100、E=101です。',
      2: '先頭6文字の符号を表に示しました。元の18文字すべてを固定長符号にすると18文字×3bit＝54bitです。',
      3: 'Aは5回です。頻度表へ記入しました。',
      4: 'Bは7回です。頻度表へ記入しました。',
      5: 'Cは3回です。頻度表へ記入しました。',
      6: 'Dは2回です。頻度表へ記入しました。',
      7: 'Eは1回です。5種類すべての頻度が分かり、合計18文字です。',
      8: '頻度が最も高いBに、最も短い1bitの符号0を割り当てました。先頭の文字列のうちBに対応する場所へも示します。',
      9: '次に多いAへ2bitの符号10を割り当てました。',
      10: 'Cへ3bitの符号110を割り当てました。',
      11: 'Dへ4bitの符号1110を割り当てました。',
      12: 'Eへ4bitの符号1111を割り当てました。頻度が多い文字ほど短い符号を割り当てています。合計は38bitです。',
      13: '各文字を可変長符号へ置き換えた結果です。空白は文字ごとの境目を見やすくする表示です。',
      14: '圧縮率は「圧縮後÷圧縮前×100」。分子は38bit、分母は54bitです。',
      15: '38÷54×100＝70.37…%。小数第1位を四捨五入して約70%です。'
    };
    status.textContent = messages[step];
    next.disabled = step >= totalSteps;
    next.textContent = step >= totalSteps ? '最後まで確認しました' : '次へ';
    setCurrent(step >= 8 && step <= 12 ? order[step - 8] : (step >= 3 && step <= 7 ? symbols[step - 3] : ''));
  }

  function advance() {
    if (step < totalSteps) {
      step += 1;
      render();
    }
  }

  function reset() {
    step = 0;
    render();
    next.focus();
  }

  fallback.hidden = true;
  results.hidden = false;
  toolbar.hidden = false;
  root.querySelector('[data-cp-frequency-controls]').hidden = false;
  root.classList.add('is-enhanced');
  next.addEventListener('click', advance);
  restart.addEventListener('click', reset);
  render();
})();
