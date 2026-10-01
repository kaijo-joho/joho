(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.CompressionPracticeCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SYMBOLS = 'ABCDE';
  function fail(message) { throw new RangeError(message); }

  function validateFrequencies(frequencies) {
    if (!frequencies || typeof frequencies !== 'object' || Array.isArray(frequencies)) fail('出現回数を指定してください');
    const entries = Object.entries(frequencies);
    if (!entries.length) fail('出現回数を1文字以上指定してください');
    if (entries.some(([symbol, count]) => symbol.length !== 1 || !SYMBOLS.includes(symbol)
      || !Number.isSafeInteger(count) || count < 1)) fail('A〜Eの文字と正の安全な整数の出現回数を指定してください');
    const sum = entries.reduce((total, [, count]) => total + count, 0);
    if (!Number.isSafeInteger(sum)) fail('出現回数の合計が大きすぎます');
    return entries;
  }

  function validateAndCloneForest(forest) {
    if (!Array.isArray(forest) || forest.length < 1) fail('木の一覧を指定してください');
    const ids = new Set();
    const symbols = new Set();
    const visited = new WeakSet();
    function clone(node, prefix) {
      if (!node || typeof node !== 'object' || visited.has(node)) fail('木に循環または共有された節点があります');
      visited.add(node);
      if (typeof node.id !== 'string' || !node.id || ids.has(node.id)
        || !Number.isSafeInteger(node.count) || node.count < 1) fail('節点のIDまたは出現回数が正しくありません');
      ids.add(node.id);
      if (node.symbol !== undefined) {
        if (typeof node.symbol !== 'string' || node.symbol.length !== 1 || !SYMBOLS.includes(node.symbol)
          || node.zero !== undefined || node.one !== undefined || symbols.has(node.symbol)) fail('葉の文字または枝が正しくありません');
        symbols.add(node.symbol);
        return { id: node.id, prefix, symbol: node.symbol, count: node.count };
      }
      if (!node.zero || !node.one) fail('内部節点には0と1の両方の枝が必要です');
      const zero = clone(node.zero, `${prefix}0`);
      const one = clone(node.one, `${prefix}1`);
      const count = zero.count + one.count;
      if (!Number.isSafeInteger(count) || count !== node.count) fail('内部節点の出現回数が合いません');
      return { id: node.id, prefix, count, zero, one };
    }
    const cloned = forest.map(node => clone(node, ''));
    if (symbols.size === 0) fail('文字の葉がありません');
    return cloned;
  }

  function leaves(node, output = []) {
    if (node.symbol !== undefined) { output.push(node.symbol); return output; }
    leaves(node.zero, output); leaves(node.one, output);
    return output;
  }

  function sortForest(forest) {
    return forest.slice().sort((left, right) => left.count - right.count || left.id.localeCompare(right.id));
  }

  function withPrefixes(node, prefix = '') {
    if (node.symbol !== undefined) return { id: node.id, prefix, symbol: node.symbol, count: node.count };
    return {
      id: node.id, prefix, count: node.count,
      zero: withPrefixes(node.zero, `${prefix}0`),
      one: withPrefixes(node.one, `${prefix}1`)
    };
  }

  function createForest(frequencies) {
    const entries = validateFrequencies(frequencies);
    return sortForest(entries.map(([symbol, count]) => ({ id: symbol, prefix: '', symbol, count })));
  }

  function joinForest(forest, selectedIds) {
    let normalized;
    try { normalized = validateAndCloneForest(forest); }
    catch (error) { return { ok: false, message: `${error.message}。最初からやり直してください。`, forest: [] }; }
    if (normalized.length < 2) return { ok: false, message: '結合する節点がありません。木は完成しています。', forest: normalized };
    if (!Array.isArray(selectedIds) || selectedIds.length !== 2 || selectedIds.some(id => typeof id !== 'string') || selectedIds[0] === selectedIds[1]) {
      return { ok: false, message: '異なる節点を2つ選んでください。', forest: normalized };
    }
    const byId = new Map(normalized.map(node => [node.id, node]));
    const zero = byId.get(selectedIds[0]);
    const one = byId.get(selectedIds[1]);
    if (!zero || !one) return { ok: false, message: '一覧にある異なる2つの根を選んでください。', forest: normalized };
    const count = zero.count + one.count;
    if (!Number.isSafeInteger(count)) return { ok: false, message: '結合後の出現回数が大きすぎます。', forest: normalized };
    const symbols = [...leaves(zero), ...leaves(one)].sort().join('');
    const parent = { id: `node:${symbols}`, prefix: '', count, zero, one };
    const next = sortForest(normalized.filter(node => node.id !== zero.id && node.id !== one.id).concat(parent));
    const prefixed = next.map(node => withPrefixes(node));
    return { ok: true, message: '選んだ2つの根を結合しました。', forest: prefixed, parent: prefixed.find(node => node.id === parent.id) };
  }

  function codesFromTree(root) {
    const [tree] = validateAndCloneForest([root]);
    const codes = {};
    function visit(node, prefix) {
      if (node.symbol !== undefined) { codes[node.symbol] = prefix || '0'; return; }
      visit(node.zero, `${prefix}0`); visit(node.one, `${prefix}1`);
    }
    visit(tree, '');
    return codes;
  }

  function totalBits(root) {
    const tree = validateAndCloneForest([root])[0];
    const codes = codesFromTree(tree);
    let total = 0;
    function visit(node) {
      if (node.symbol !== undefined) total += node.count * codes[node.symbol].length;
      else { visit(node.zero); visit(node.one); }
      if (!Number.isSafeInteger(total)) fail('合計bit数が大きすぎます');
    }
    visit(tree);
    return total;
  }

  function gradeForest(forest, history) {
    let finalForest;
    let frequencies;
    let joins;
    try {
      finalForest = validateAndCloneForest(forest);
      if (!history || typeof history !== 'object' || Array.isArray(history)) fail('結合履歴が正しくありません');
      frequencies = Object.fromEntries(validateFrequencies(history.frequencies));
      if (!Array.isArray(history.joins)) fail('結合履歴が正しくありません');
      joins = history.joins;
      const expectedSymbols = Object.keys(frequencies).sort().join('');
      if ([...leavesFromForest(finalForest)].sort().join('') !== expectedSymbols) fail('木の文字と出現回数が一致しません');
    } catch (error) {
      return { correct: false, complete: false, message: `${error.message}。頻度と結合を確認してください。`, firstIncorrectStep: null };
    }

    let replay;
    try { replay = createForest(frequencies); }
    catch (error) { return { correct: false, complete: false, message: error.message, firstIncorrectStep: null }; }
    for (let index = 0; index < joins.length; index += 1) {
      const choice = joins[index];
      if (!choice || !Array.isArray(choice.selectedIds) || choice.selectedIds.length !== 2) {
        return { correct: false, complete: finalForest.length === 1, message: `${index + 1}回目の結合記録が正しくありません。`, firstIncorrectStep: index + 1 };
      }
      const sorted = sortForest(replay);
      const required = sorted.slice(0, 2).map(node => node.count).sort((a, b) => a - b);
      const selected = choice.selectedIds.map(id => replay.find(node => node.id === id));
      if (selected.some(node => !node)) {
        return { correct: false, complete: finalForest.length === 1, message: `${index + 1}回目に、すでに結合した根か存在しない根を選んでいます。`, firstIncorrectStep: index + 1, expectedCounts: required };
      }
      const selectedCounts = selected.map(node => node.count).sort((a, b) => a - b);
      if (selectedCounts[0] !== required[0] || selectedCounts[1] !== required[1]) {
        return {
          correct: false, complete: finalForest.length === 1, firstIncorrectStep: index + 1,
          selectedCounts, expectedCounts: required,
          message: `${index + 1}回目の結合で頻度${selectedCounts.join('と')}を選んでいます。この時点では頻度${required.join('と')}の根を選びます。`
        };
      }
      const result = joinForest(replay, choice.selectedIds);
      if (!result.ok) return { correct: false, complete: finalForest.length === 1, message: `${index + 1}回目の結合を確認できません。`, firstIncorrectStep: index + 1 };
      replay = result.forest;
    }

    const complete = finalForest.length === 1;
    if (!complete || replay.length !== 1 || joins.length !== Object.keys(frequencies).length - 1) {
      return { correct: false, complete, message: `木を完成させるには${Math.max(0, Object.keys(frequencies).length - 1)}回（文字種の数−1回）の結合が必要です。`, firstIncorrectStep: null };
    }
    if (!sameTree(finalForest[0], replay[0])) {
      return { correct: false, complete: true, message: '結合履歴と完成した木が一致しません。最初からやり直してください。', firstIncorrectStep: null };
    }
    const codes = codesFromTree(finalForest[0]);
    const bitCount = totalBits(finalForest[0]);
    return { correct: true, complete: true, message: `正解です。頻度の小さい2つを毎回選べています。合計${bitCount}bitです。`, codes, bitCount, firstIncorrectStep: null };
  }

  function leavesFromForest(forest) { return forest.flatMap(tree => leaves(tree)); }
  function sameTree(left, right) {
    if (left.id !== right.id || left.count !== right.count || left.symbol !== right.symbol) return false;
    if (left.symbol !== undefined) return true;
    return sameTree(left.zero, right.zero) && sameTree(left.one, right.one);
  }

  return Object.freeze({ createForest, joinForest, codesFromTree, totalBits, gradeForest });
});
