(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CompressionPracticeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SYMBOLS = 'ABCDE';
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);

  function fail(message) { throw new RangeError(message); }

  function validateFrequencies(frequencies) {
    if (!frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) fail('出現回数を指定してください');
    const entries = Object.entries(frequencies);
    if (!entries.length) fail('出現回数を1文字以上指定してください');
    if (entries.some(([symbol, count]) => (symbol.length !== 1 || !SYMBOLS.includes(symbol)) || !Number.isSafeInteger(count) || count < 1)) {
      fail('A〜Eの文字と正の安全な整数の出現回数を指定してください');
    }
    return entries;
  }

  function leafSymbols(node, out = []) {
    if (!node || typeof node !== 'object') fail('木の節点が正しくありません');
    if (node.symbol !== undefined) {
      if (!SYMBOLS.includes(node.symbol) || node.zero || node.one) fail('葉の文字または枝が正しくありません');
      out.push(node.symbol);
      return out;
    }
    if (!node.zero || !node.one) fail('内部節点には0と1の両方の枝が必要です');
    leafSymbols(node.zero, out);
    leafSymbols(node.one, out);
    return out;
  }

  function cloneWithPrefixes(node, prefix = '') {
    if (node.symbol !== undefined) return { id: node.id, prefix, symbol: node.symbol, count: node.count };
    return {
      id: node.id,
      prefix,
      symbol: undefined,
      count: node.count,
      zero: cloneWithPrefixes(node.zero, `${prefix}0`),
      one: cloneWithPrefixes(node.one, `${prefix}1`)
    };
  }

  function normalizeForest(forest) {
    if (!Array.isArray(forest) || forest.length < 1) return null;
    const ids = new Set();
    const symbols = new Set();
    function validateNode(node) {
      if (!node || typeof node !== 'object' || typeof node.id !== 'string' || !node.id || ids.has(node.id)
        || !Number.isSafeInteger(node.count) || node.count < 1) throw new Error('節点が正しくありません');
      ids.add(node.id);
      if (node.symbol !== undefined) {
        if (typeof node.symbol !== 'string' || node.symbol.length !== 1 || !SYMBOLS.includes(node.symbol)
          || node.zero || node.one || symbols.has(node.symbol)) throw new Error('葉が正しくありません');
        symbols.add(node.symbol);
        return node.count;
      }
      if (!node.zero || !node.one) throw new Error('内部節点の枝が不足しています');
      const count = validateNode(node.zero) + validateNode(node.one);
      if (!Number.isSafeInteger(count) || count !== node.count) throw new Error('内部節点の出現回数が合いません');
      return count;
    }
    try {
      forest.forEach(validateNode);
      return forest.map(root => cloneWithPrefixes(root, ''));
    } catch (_) {
      return null;
    }
  }

  function findLeaf(node, symbol) {
    if (node.symbol !== undefined) return node.symbol === symbol ? node : null;
    return findLeaf(node.zero, symbol) || findLeaf(node.one, symbol);
  }

  function stableNodeId(node) {
    const symbols = leafSymbols(node).sort();
    return `node:${symbols.join('')}`;
  }

  function sortForest(forest) {
    return forest.slice().sort((left, right) => left.count - right.count || left.id.localeCompare(right.id));
  }

  function createForest(frequencies) {
    const entries = validateFrequencies(frequencies);
    const sum = entries.reduce((total, [, count]) => total + count, 0);
    if (!Number.isSafeInteger(sum)) fail('出現回数の合計が大きすぎます');
    return sortForest(entries.map(([symbol, count]) => ({ id: symbol, prefix: '', symbol, count })));
  }

  function joinForest(forest, selectedIds) {
    const normalized = normalizeForest(forest);
    if (!normalized) return { ok: false, message: '木の一覧が正しくありません。最初からやり直してください。', forest: [] };
    if (normalized.length < 2) return { ok: false, message: '結合する節点がありません。木は完成しています。', forest: normalized };
    if (!Array.isArray(selectedIds) || selectedIds.length !== 2 || selectedIds.some(id => typeof id !== 'string') || selectedIds[0] === selectedIds[1]) {
      return { ok: false, message: '異なる節点を2つ選んでください。', forest: normalized };
    }
    const byId = new Map(normalized.map(node => [node.id, node]));
    const zero = byId.get(selectedIds[0]);
    const one = byId.get(selectedIds[1]);
    if (!zero || !one) return { ok: false, message: '一覧にある節点を2つ選んでください。', forest: normalized };
    const smallestCounts = sortForest(normalized).slice(0, 2).map(node => node.count).sort((a, b) => a - b);
    const selectedCounts = [zero.count, one.count].sort((a, b) => a - b);
    if (selectedCounts[0] !== smallestCounts[0] || selectedCounts[1] !== smallestCounts[1]) {
      return { ok: false, message: '出現回数が小さい2つの節点を選んでください。', forest: normalized };
    }
    const count = zero.count + one.count;
    if (!Number.isSafeInteger(count)) return { ok: false, message: '結合後の出現回数が大きすぎます。', forest: normalized };
    const parent = { id: stableNodeId({ zero, one }), prefix: '', symbol: undefined, count, zero, one };
    const next = sortForest(normalized.filter(node => node.id !== zero.id && node.id !== one.id).concat(parent));
    return { ok: true, message: '選んだ節点を結合しました。', forest: next.map(node => cloneWithPrefixes(node, '')), parent: cloneWithPrefixes(parent, '') };
  }

  function codesFromTree(root) {
    if (!root || typeof root !== 'object') fail('木を指定してください');
    const leaves = leafSymbols(root);
    if (!leaves.length || new Set(leaves).size !== leaves.length) fail('木の文字は重複できません');
    const codes = {};
    function visit(node, prefix) {
      if (node.symbol !== undefined) {
        codes[node.symbol] = prefix || '0';
        return;
      }
      visit(node.zero, `${prefix}0`);
      visit(node.one, `${prefix}1`);
    }
    visit(root, '');
    return codes;
  }

  function totalBits(root) {
    const codes = codesFromTree(root);
    let total = 0;
    for (const [symbol, code] of Object.entries(codes)) {
      const leaf = findLeaf(root, symbol);
      total += leaf.count * code.length;
      if (!Number.isSafeInteger(total)) fail('合計bit数が大きすぎます');
    }
    return total;
  }

  return Object.freeze({ createForest, joinForest, codesFromTree, totalBits });
});
