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
  if (symbols.some(symbol => !fixedCodes[symbol] || codes[symbol] !== expectedCodes[symbol]) || encodedFixed.join('').length !== 54 || tree.totalBits !== 38 || encodedVariable.length !== 38) return;

  const next = root.querySelector('[data-cp-frequency-next]');
  const restart = root.querySelector('[data-cp-frequency-restart]');
  const status = root.querySelector('[data-cp-frequency-status]');
  const fallback = root.querySelector('[data-cp-frequency-fallback]');
  const results = root.querySelector('[data-cp-frequency-results]');
  const toolbar = root.querySelector('[data-cp-frequency-toolbar]');
  const fixedTable = root.querySelector('[data-cp-frequency-fixed-table]');
  const frequencyTable = root.querySelector('[data-cp-frequency-frequency-table]');
  const codeTable = root.querySelector('[data-cp-frequency-code-table]');
  const fixedStreamPanel = root.querySelector('[data-cp-frequency-fixed-stream-panel]');
  const fixedStream = root.querySelector('[data-cp-frequency-fixed-bits]');
  const variableStreamPanel = root.querySelector('[data-cp-frequency-variable-stream-panel]');
  const variableStream = root.querySelector('[data-cp-frequency-variable-bits]');
  const ratio = root.querySelector('[data-cp-frequency-ratio]');
  const answer = root.querySelector('[data-cp-frequency-answer]');
  if (!next || !restart || !status || !fallback || !results || !toolbar || !fixedTable || !frequencyTable || !codeTable || !fixedStreamPanel || !fixedStream || !variableStreamPanel || !variableStream || !ratio || !answer) return;

  const fixedCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-fixed-code]'), cell => [cell.dataset.cpFrequencyFixedCode, cell]));
  const frequencyCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-count]'), cell => [cell.dataset.cpFrequencyCount, cell]));
  const codeCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-code]'), cell => [cell.dataset.cpFrequencyCode, cell]));
  const contributionCells = new Map(Array.from(root.querySelectorAll('[data-cp-frequency-contribution]'), cell => [cell.dataset.cpFrequencyContribution, cell]));
  const totalCells = {
    fixed: root.querySelector('[data-cp-frequency-fixed-total]'),
    frequency: root.querySelector('[data-cp-frequency-frequency-total]'),
    variable: root.querySelector('[data-cp-frequency-variable-total]'),
    contribution: root.querySelector('[data-cp-frequency-contribution-total]')
  };
  const columns = new Map(symbols.map(symbol => [symbol, Array.from(root.querySelectorAll(`[data-cp-frequency-column="${symbol}"]`))]));
  if (symbols.some(symbol => !fixedCells.has(symbol) || !frequencyCells.has(symbol) || !codeCells.has(symbol) || !contributionCells.has(symbol) || !columns.get(symbol)?.length) || Object.values(totalCells).some(cell => !cell)) return;

  const fixedStreamText = encodedFixed.join(' ');
  const variableStreamText = Array.from(text, symbol => codes[symbol]).join(' ');
  const totalSteps = 15;
  let step = 0;

  function setCurrent(symbol) {
    symbols.forEach(item => columns.get(item).forEach(cell => cell.classList.toggle('is-current', item === symbol)));
  }

  function render() {
    root.dataset.cpFrequencyStep = String(step);
    fixedStreamPanel.hidden = step < 2;
    variableStreamPanel.hidden = step < 13;
    ratio.hidden = step < 14;
    answer.hidden = step < 15;

    symbols.forEach(symbol => {
      const frequencyStep = 2 + symbols.indexOf(symbol) + 1;
      const codeStep = 7 + order.indexOf(symbol) + 1;
      fixedCells.get(symbol).textContent = step >= 1 ? fixedCodes[symbol] : '';
      frequencyCells.get(symbol).textContent = step >= frequencyStep ? String(fixture.frequencies[symbol]) : '';
      codeCells.get(symbol).textContent = step >= codeStep ? codes[symbol] : '';
      contributionCells.get(symbol).textContent = step >= codeStep ? String(fixture.frequencies[symbol] * codes[symbol].length) : '';
    });
    totalCells.fixed.textContent = step >= 2 ? '54bit' : '';
    totalCells.frequency.textContent = step >= 7 ? '18' : '';
    totalCells.variable.textContent = step >= 12 ? '38bit' : '';
    totalCells.contribution.textContent = step >= 12 ? '38bit' : '';
    fixedStream.textContent = fixedStreamText;
    variableStream.textContent = variableStreamText;

    const messages = {
      0: 'まず、5種類の文字に固定長符号を割り当てます。',
      1: '2bitでは4通りまでなので5種類には足りません。3bitなら8通りを表せます。A=001、B=010、C=011、D=100、E=101とし、各文字を3bitにしました。',
      2: '元の18文字を固定長符号に置き換えました。1文字3bitなので、合計54bitです。',
      3: 'Aは5回です。頻度表へ記入しました。',
      4: 'Bは7回です。頻度表へ記入しました。',
      5: 'Cは3回です。頻度表へ記入しました。',
      6: 'Dは2回です。頻度表へ記入しました。',
      7: 'Eは1回です。5種類すべての頻度が分かり、合計18文字です。',
      8: '頻度が最も高いBに、最も短い1bitの符号0を割り当てました。',
      9: '次に多いAへ2bitの符号10を割り当てました。',
      10: 'Cへ3bitの符号110を割り当てました。',
      11: 'Dへ4bitの符号1110を割り当てました。',
      12: 'Eへ4bitの符号1111を割り当てました。符号の形は次のスライドで作るハフマン木から決まります。',
      13: '各文字を可変長符号へ置き換えると38bitです。空白は文字ごとの境目を見やすくする表示です。',
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
