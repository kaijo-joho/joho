(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./compression-core.js'), require('./lesson-formula-grader.js'));
  } else {
    root.CompressionFormulas = factory(root.CompressionCore, root.LessonFormulaGrader);
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Compression, Grader) {
  'use strict';

  const units = Object.freeze({
    '': Object.freeze({ label: '単位なし', dimensions: Object.freeze({}) }),
    character: Object.freeze({ label: '文字', dimensions: Object.freeze({ character: 1 }) }),
    occurrence: Object.freeze({ label: '回', dimensions: Object.freeze({ occurrence: 1 }) }),
    'bit/character': Object.freeze({ label: 'bit/文字', dimensions: Object.freeze({ bit: 1, character: -1 }) }),
    'bit/occurrence': Object.freeze({ label: 'bit/回', dimensions: Object.freeze({ bit: 1, occurrence: -1 }) }),
    bit: Object.freeze({ label: 'bit', dimensions: Object.freeze({ bit: 1 }) }),
    '%': Object.freeze({ label: '%', dimensions: Object.freeze({}) })
  });
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const operator = value => ({ kind: 'operator', value });
  const group = body => ({ kind: 'group', body });
  const task = (id, label, answerUnit, expected, expectedTokens) => ({
    id, label, answerUnit, answerUnitLabel: units[answerUnit].label, expected,
    tolerance: Math.max(1e-7, Math.abs(expected) * 1e-6), expectedTokens
  });
  const sourceValue = item => value(item.value, item.unit, item.symbol);

  function definition(id) {
    return { id, units, quantities: [], constants: [], sources: [], tasks: [] };
  }

  function defineRleRate() {
    const result = definition('rle-rate-10-to-12');
    const original = { id: 'originalChars', label: '圧縮前の文字数', value: '10', unit: 'character', symbol: 'originalChars' };
    const compressed = { id: 'compressedChars', label: '圧縮後の文字数', value: '12', unit: 'character', symbol: 'compressedChars' };
    result.quantities.push(original, compressed);
    result.sources.push(original, compressed);
    result.constants.push({ id: 'percent', label: '百分率に直す数', value: '100', unit: '' });
    result.tasks.push(task('rate', '圧縮率', '%', 120, [sourceValue(compressed), operator('÷'), sourceValue(original), operator('×'), value(100)]));
    return result;
  }

  function groupedSource(result, { id, label, value: amount, unit, group, sortKey }) {
    const source = { id, label, value: String(amount), unit, symbol: group };
    result.quantities.push({ id, label, value: String(amount), unit });
    result.sources.push(source);
    return { ...source, sortKey };
  }

  function defineHuffman(index, { codes: selectedCodes } = {}) {
    if (!Number.isInteger(index) || index < 0 || index >= Compression.HUFFMAN_QUESTIONS.length) {
      throw new RangeError('Huffman問題の番号を指定してください');
    }
    const fixture = Compression.HUFFMAN_QUESTIONS[index];
    const result = definition(`huffman-question-${index + 1}`);
    const characterCount = Array.from(fixture.text).length;
    const originalBits = characterCount * fixture.fixedBits;
    const codes = selectedCodes || fixture.codes;
    const frequencies = fixture.frequencies;
    // The exercise uses the student's completed tree, including valid tie/branch alternatives.
    Compression.huffmanFromCodes(frequencies, codes);
    const frequencySources = [];
    const codeLengthSources = [];
    const frequencySymbols = new Map();
    const codeLengthSymbols = new Map();

    for (const symbol of Object.keys(frequencies).sort()) {
      const count = frequencies[symbol];
      const sourceSymbol = frequencySymbols.get(count) || `frequency:${count}`;
      frequencySymbols.set(count, sourceSymbol);
      frequencySources.push(groupedSource(result, {
        id: `frequency-${symbol}`, label: `${symbol}の出現回数`, value: count,
        unit: 'occurrence', group: sourceSymbol, sortKey: symbol
      }));
    }
    for (const symbol of Object.keys(codes).sort()) {
      const length = codes[symbol].length;
      const sourceSymbol = codeLengthSymbols.get(length) || `codeLength:${length}`;
      codeLengthSymbols.set(length, sourceSymbol);
      codeLengthSources.push(groupedSource(result, {
        id: `codeLength-${symbol}`, label: `${symbol}の符号長`, value: length,
        unit: 'bit/occurrence', group: sourceSymbol, sortKey: symbol
      }));
    }
    const fixed = { id: 'fixedBits', label: '固定長符号の1文字あたりのbit数', value: String(fixture.fixedBits), unit: 'bit/character', symbol: 'fixedBits' };
    const characters = { id: 'characters', label: '文字数', value: String(characterCount), unit: 'character', symbol: 'characters' };
    result.quantities.push(fixed, characters);
    result.sources.push(fixed, characters);
    result.constants.push({ id: 'percent', label: '百分率に直す数', value: '100', unit: '' });

    const originalTokens = [sourceValue(fixed), operator('×'), sourceValue(characters)];
    const compressedTokens = [];
    const sortedSymbols = Object.keys(frequencies).sort();
    sortedSymbols.forEach((symbol, position) => {
      if (position) compressedTokens.push(operator('+'));
      const frequency = frequencySources.find(item => item.sortKey === symbol);
      const codeLength = codeLengthSources.find(item => item.sortKey === symbol);
      compressedTokens.push(sourceValue(frequency), operator('×'), sourceValue(codeLength));
    });
    const rateTokens = [group(compressedTokens), operator('÷'), group(originalTokens), operator('×'), value(100)];
    const compressedBits = sortedSymbols.reduce((sum, symbol) => sum + frequencies[symbol] * codes[symbol].length, 0);
    result.tasks.push(
      task('originalBits', '圧縮前のbit数', 'bit', originalBits, originalTokens),
      task('compressedBits', '圧縮後のbit数', 'bit', compressedBits, compressedTokens),
      task('rate', '圧縮率', '%', compressedBits / originalBits * 100, rateTokens)
    );
    return result;
  }

  function grade(formulaDefinition, draft, options) {
    return Grader.grade(formulaDefinition, draft, options);
  }

  function gradeRow(formulaDefinition, draft, rowId) {
    return Grader.gradeRow(formulaDefinition, draft, rowId);
  }

  return Object.freeze({ defineRleRate, defineHuffman, grade, gradeRow });
});
