(function (root, createCore) {
  'use strict';

  const core = Object.freeze(createCore());
  if (typeof module === 'object' && module.exports) module.exports = core;
  if (root) root.CompressionCore = core;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const MAX_OUTPUT_LENGTH = 512;
  const MAX_SAFE = Number.MAX_SAFE_INTEGER;

  function deepFreeze(value) {
    if (value && typeof value === 'object' && !Object.isFrozen(value)) {
      Object.values(value).forEach(deepFreeze);
      Object.freeze(value);
    }
    return value;
  }

  const RLE_EXAMPLE = 'AAAAAABBBBCCDAAA';
  const IMAGE_EXAMPLE = [
    [1, 1, 1, 1, 1],
    [1, 0, 0, 0, 0],
    [1, 1, 1, 1, 0],
    [1, 0, 0, 0, 0],
    [1, 0, 0, 0, 0]
  ];
  const IMAGE_QUESTIONS = {
    figure1: [[1, 1, 1], [0, 1, 1], [1, 1, 0]],
    figure2: [[1, 1, 1, 1], [1, 1, 0, 0], [0, 1, 1, 1], [0, 1, 1, 1]],
    figure3: [
      Array.from({ length: 8 }, () => [0, 0, 0, 0, 1, 1, 1, 1]),
      Array.from({ length: 8 }, () => [0, 1, 0, 1, 0, 1, 0, 1]),
      Array.from({ length: 8 }, (_, row) => Array(8).fill(row % 2 === 0 ? 1 : 0)),
      Array.from({ length: 8 }, (_, row) => Array.from({ length: 8 }, (_, column) => (row + column) % 2 === 0 ? 1 : 0))
    ],
    figure4: [
      [[1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 1, 0], [1, 0, 0, 0, 1]],
      [[1, 0, 0, 0, 1], [0, 1, 0, 1, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0], [0, 0, 1, 0, 0]],
      [[1, 1, 1, 1, 1], [0, 0, 0, 1, 0], [0, 0, 1, 0, 0], [0, 1, 0, 0, 0], [1, 1, 1, 1, 1]]
    ]
  };
  const HUFFMAN_EXAMPLE = {
    text: 'DAEBCBACBBBCDAAABB',
    frequencies: { A: 5, B: 7, C: 3, D: 2, E: 1 },
    codes: { A: '10', B: '0', C: '110', D: '1110', E: '1111' },
    fixedBits: 3
  };
  const HUFFMAN_PRACTICE = [
    { frequencies: { A: 9, B: 7, C: 3, D: 2, E: 1 }, codes: { A: '0', B: '10', C: '110', D: '1110', E: '1111' } },
    { frequencies: { A: 9, B: 4, C: 4, D: 3, E: 2 }, codes: { A: '0', B: '100', C: '101', D: '110', E: '111' } },
    { frequencies: { A: 9, B: 6, C: 5, D: 3, E: 2 }, codes: { A: '00', B: '01', C: '10', D: '110', E: '111' } }
  ];
  const HUFFMAN_QUESTIONS = [
    {
      text: 'ACBABACABBABBDBBCBBA',
      frequencies: { A: 6, B: 10, C: 3, D: 1 },
      codes: { A: '10', B: '0', C: '110', D: '111' },
      fixedBits: 2,
      encodeText: 'ACBA',
      decodeBits: '10110100'
    },
    {
      text: 'ABDAECABADCEBAADBAECABADCBEAACDBAECADBAA',
      frequencies: { A: 15, B: 8, C: 6, D: 6, E: 5 },
      codes: { A: '0', B: '100', C: '101', D: '110', E: '111' },
      fixedBits: 3,
      encodeText: 'ABDAEC',
      decodeBits: '1000111101'
    }
  ];
  const fixtures = deepFreeze({ RLE_EXAMPLE, IMAGE_EXAMPLE, IMAGE_QUESTIONS, HUFFMAN_EXAMPLE, HUFFMAN_PRACTICE, HUFFMAN_QUESTIONS });

  function codePoints(text, name = '文字列') {
    if (typeof text !== 'string') throw new RangeError(`${name}は文字列で指定してください`);
    return Array.from(text);
  }

  function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name}は正の整数で指定してください`);
    return value;
  }

  function rleRuns(text) {
    const characters = codePoints(text);
    const runs = [];
    let start = 0;
    while (start < characters.length) {
      const value = characters[start];
      let end = start + 1;
      while (end < characters.length && characters[end] === value) end += 1;
      runs.push({ value, count: end - start, start, end });
      start = end;
    }
    return runs;
  }

  function encodeRle(text, minimum = 1) {
    const threshold = positiveInteger(minimum, '繰り返しの最小回数');
    const original = typeof text === 'string' ? text : (() => { throw new RangeError('文字列は文字列で指定してください'); })();
    const runs = rleRuns(original).map(run => {
      const encoded = run.count >= threshold ? `${run.value}${run.count}` : run.value.repeat(run.count);
      return { ...run, encoded };
    });
    const encoded = runs.map(run => run.encoded).join('');
    return { original, encoded, runs, before: codePoints(original).length, after: codePoints(encoded).length };
  }

  function decodeRle(encoded) {
    if (typeof encoded !== 'string' || encoded.length === 0) throw new RangeError('圧縮文字列を指定してください');
    const token = /(?:[A-Z]|黒|白)(?:[1-9]\d*)/gu;
    const tokens = [...encoded.matchAll(token)];
    if (tokens.length === 0 || tokens.map(match => match[0]).join('') !== encoded) throw new RangeError('圧縮文字列の形式が正しくありません');
    let length = 0;
    let decoded = '';
    for (const match of tokens) {
      const value = match[0].startsWith('黒') ? '黒' : match[0].startsWith('白') ? '白' : match[0][0];
      const countText = match[0].slice(value.length);
      if (!/^[1-9]\d*$/.test(countText)) throw new RangeError('繰り返し回数が正しくありません');
      const count = Number(countText);
      if (!Number.isSafeInteger(count) || count > MAX_OUTPUT_LENGTH - length) throw new RangeError('復元後の文字列が長すぎます');
      decoded += value.repeat(count);
      length += count;
    }
    return decoded;
  }

  function compressionRate(before, after) {
    const original = positiveInteger(before, '圧縮前の文字数');
    if (!Number.isSafeInteger(after) || after < 0) throw new RangeError('圧縮後の文字数は0以上の整数で指定してください');
    return after / original * 100;
  }

  function countCharacters(text) {
    return codePoints(text).reduce((counts, value) => {
      counts[value] = (counts[value] || 0) + 1;
      return counts;
    }, {});
  }

  function validateCodes(codes) {
    if (!codes || typeof codes !== 'object' || Array.isArray(codes)) throw new RangeError('符号表を指定してください');
    const entries = Object.entries(codes);
    if (entries.length === 0) throw new RangeError('符号表は空にできません');
    const trie = {};
    for (const [symbol, bits] of entries) {
      if (codePoints(symbol, '文字').length !== 1 || typeof bits !== 'string' || !/^[01]+$/.test(bits)) throw new RangeError('符号表の文字またはビット列が正しくありません');
      let node = trie;
      for (const bit of bits) {
        if (node.symbol !== undefined) throw new RangeError('接頭符号が重複しています');
        node[bit] ||= {};
        node = node[bit];
      }
      if (node.symbol !== undefined || node[0] || node[1]) throw new RangeError('接頭符号が重複しています');
      node.symbol = symbol;
    }
    return { entries, trie };
  }

  function encodeHuffman(text, codes) {
    const { entries } = validateCodes(codes);
    const table = Object.fromEntries(entries);
    return codePoints(text).map(symbol => {
      if (!(symbol in table)) throw new RangeError(`符号表にない文字です: ${symbol}`);
      return table[symbol];
    }).join('');
  }

  function decodeHuffman(bits, codes) {
    if (typeof bits !== 'string' || !/^[01]*$/.test(bits)) throw new RangeError('ビット列は0と1だけで指定してください');
    const { trie } = validateCodes(codes);
    let node = trie;
    let decoded = '';
    for (const bit of bits) {
      node = node[bit];
      if (!node) throw new RangeError('符号表にないビット列です');
      if (node.symbol !== undefined) {
        decoded += node.symbol;
        if (codePoints(decoded).length > MAX_OUTPUT_LENGTH) throw new RangeError('復元後の文字列が長すぎます');
        node = trie;
      }
    }
    if (node !== trie) throw new RangeError('ビット列が符号の途中で終わっています');
    return decoded;
  }

  function huffmanFromCodes(frequencies, codes) {
    const { entries } = validateCodes(codes);
    if (!frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) throw new RangeError('出現回数を指定してください');
    const frequencyEntries = Object.entries(frequencies);
    if (frequencyEntries.length !== entries.length || entries.some(([symbol]) => !Object.hasOwn(frequencies, symbol))) throw new RangeError('出現回数と符号表の文字が一致しません');
    const frequencyTable = Object.fromEntries(frequencyEntries.map(([symbol, count]) => [symbol, positiveInteger(count, `${symbol}の出現回数`)]));
    const root = { id: 'root', prefix: '', count: 0 };
    const nodes = new Map([['', root]]);
    for (const [symbol, bits] of entries) {
      let node = root;
      let prefix = '';
      for (const bit of bits) {
        prefix += bit;
        if (!node[bit]) {
          const child = { id: prefix, prefix, count: 0 };
          node[bit] = child;
          nodes.set(prefix, child);
        }
        node = node[bit];
      }
      node.symbol = symbol;
      node.count = frequencyTable[symbol];
    }
    const calculateCount = node => {
      if (node.symbol !== undefined) {
        if (node.zero || node.one) throw new RangeError('符号表が接頭符号になっていません');
        return node.count;
      }
      if (!node[0] || !node[1]) throw new RangeError('ハフマン木の枝が不足しています');
      node.zero = node[0];
      node.one = node[1];
      delete node[0];
      delete node[1];
      node.count = calculateCount(node.zero) + calculateCount(node.one);
      if (!Number.isSafeInteger(node.count)) throw new RangeError('出現回数の合計が大きすぎます');
      return node.count;
    };
    calculateCount(root);
    const leaves = entries.map(([symbol, bits]) => nodes.get(bits));
    const internals = [...nodes.values()].filter(node => node.symbol === undefined);
    let forest = [...leaves];
    const steps = [];
    while (forest.length > 1) {
      const forestSet = new Set(forest);
      const ready = internals.filter(node => node !== root || forest.length === 2).filter(node => forestSet.has(node.zero) && forestSet.has(node.one));
      if (ready.length === 0) throw new RangeError('符号表からハフマン木を復元できません');
      ready.sort((left, right) => left.count - right.count || left.prefix.localeCompare(right.prefix));
      const parent = ready[0];
      const zero = parent.zero;
      const one = parent.one;
      forest = forest.filter(node => node !== zero && node !== one);
      forest.push(parent);
      forest.sort((left, right) => left.count - right.count || left.prefix.localeCompare(right.prefix));
      steps.push({ zero, one, parent, forest: [...forest] });
    }
    const totalBits = entries.reduce((total, [symbol, bits]) => total + frequencyTable[symbol] * bits.length, 0);
    if (!Number.isSafeInteger(totalBits)) throw new RangeError('ビット数が大きすぎます');
    return { root, steps, codes: Object.fromEntries(entries), totalBits, leaves };
  }

  return {
    rleRuns,
    encodeRle,
    decodeRle,
    compressionRate,
    countCharacters,
    encodeHuffman,
    decodeHuffman,
    huffmanFromCodes,
    fixtures,
    RLE_EXAMPLE: fixtures.RLE_EXAMPLE,
    IMAGE_EXAMPLE: fixtures.IMAGE_EXAMPLE,
    IMAGE_QUESTIONS: fixtures.IMAGE_QUESTIONS,
    HUFFMAN_EXAMPLE: fixtures.HUFFMAN_EXAMPLE,
    HUFFMAN_PRACTICE: fixtures.HUFFMAN_PRACTICE,
    HUFFMAN_QUESTIONS: fixtures.HUFFMAN_QUESTIONS
  };
});
