import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const api = require('../js/compression-practice-core.js');
const Compression = require('../js/compression-core.js');
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function ok(value, message) { assert.ok(value, message); checks += 1; }
function invalid(callback, message) { assert.throws(callback, RangeError, message); checks += 1; }

// Browser global and CommonJS expose the same pure API.
const browser = {};
vm.runInNewContext(await readFile(new URL('../js/compression-practice-core.js', import.meta.url), 'utf8'), browser);
equal(Object.keys(browser.CompressionPracticeCore).sort(), Object.keys(api).sort(), 'UMD browser API');

const source = { A: 9, B: 7, C: 3, D: 2, E: 1 };
const original = api.createForest(source);
equal(original.map(node => [node.id, node.symbol, node.count]), [['E', 'E', 1], ['D', 'D', 2], ['C', 'C', 3], ['B', 'B', 7], ['A', 'A', 9]], '初期forestは安定した小順');
source.A = 99;
equal(original.find(node => node.symbol === 'A').count, 9, '頻度入力とforestを共有しない');

let forest = api.createForest({ A: 1, B: 1, C: 2, D: 4 });
const before = structuredClone(forest);
const joined = api.joinForest(forest, ['B', 'A']);
ok(joined.ok, '小さい2節点を逆順で結合');
equal(forest, before, 'joinForestは入力を変更しない');
equal(joined.parent.zero.id, 'B', '先に選んだ節点は0枝');
equal(joined.parent.one.id, 'A', '後に選んだ節点は1枝');
equal(joined.parent.id, 'node:AB', '親idは葉文字順で安定');
equal(joined.parent.zero.prefix, '0', '0枝prefix');
equal(joined.parent.one.prefix, '1', '1枝prefix');
const flipped = api.joinForest(api.createForest({ A: 1, B: 2, C: 8 }), ['B', 'A']);
const ordinary = api.joinForest(api.createForest({ A: 1, B: 2, C: 8 }), ['A', 'B']);
ok(flipped.ok && ordinary.ok, '枝順を変えた結合を受理');
equal(api.codesFromTree(flipped.forest.find(node => node.id === 'node:AB')), { B: '0', A: '1' }, '選択順を反転すると枝符号も反転');
equal(api.codesFromTree(ordinary.forest.find(node => node.id === 'node:AB')), { A: '0', B: '1' }, '通常順の枝符号');

const tieForest = api.createForest({ A: 1, B: 1, C: 1, D: 2, E: 2 });
for (const pair of [['A', 'B'], ['A', 'C'], ['B', 'C']]) {
  const result = api.joinForest(tieForest, pair);
  ok(result.ok, `同頻度の最小2個の選択を受理 ${pair.join(',')}`);
}
const nonSmallest = api.joinForest(api.createForest({ A: 1, B: 1, C: 2, D: 4 }), ['A', 'C']);
equal(nonSmallest.ok, false, '最小2個と重みが一致しない選択を拒否');
const badPairCases = [
  api.joinForest(tieForest, ['A']),
  api.joinForest(tieForest, ['A', 'A']),
  api.joinForest(tieForest, ['A', 'Z']),
  api.joinForest(tieForest, null)
];
badPairCases.forEach((result, index) => equal(result.ok, false, `不正選択 ${index + 1} を拒否`));

const final = api.joinForest(api.createForest({ A: 1 }), ['A', 'A']);
equal(final.ok, false, '単一rootは追加結合しない');
equal(api.codesFromTree({ id: 'A', symbol: 'A', count: 5, prefix: '' }), { A: '0' }, '単一文字は有効な1bit符号を持つ');
equal(api.totalBits({ id: 'A', symbol: 'A', count: 5, prefix: '' }), 5, '単一文字のbit数');

invalid(() => api.createForest({}), '空の頻度');
invalid(() => api.createForest({ F: 1 }), 'A〜E以外の文字');
invalid(() => api.createForest({ AB: 1 }), '複数文字のsymbol');
invalid(() => api.createForest({ A: 0 }), '0頻度');
invalid(() => api.createForest({ A: -1 }), '負頻度');
invalid(() => api.createForest({ A: 1.5 }), '小数頻度');
invalid(() => api.createForest({ A: Number.MAX_SAFE_INTEGER + 1 }), '安全整数外の頻度');
invalid(() => api.createForest({ A: Number.MAX_SAFE_INTEGER, B: 1 }), '合計の安全整数超過');

function finishTree(frequencies, choices) {
  let current = api.createForest(frequencies);
  for (const pair of choices) {
    const result = api.joinForest(current, pair);
    ok(result.ok, `有効な結合 ${pair.join(',')}`);
    current = result.forest;
  }
  equal(current.length, 1, '全節点を結合');
  return current[0];
}
const practiceCosts = [];
for (const [index, fixture] of Compression.HUFFMAN_PRACTICE.entries()) {
  const pairs = [];
  // Use the current stable IDs while choosing every required minimum pair.
  let current = api.createForest(fixture.frequencies);
  while (current.length > 1) {
    const ordered = current.slice().sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
    const result = api.joinForest(current, [ordered[0].id, ordered[1].id]);
    ok(result.ok, `practice ${index + 1}: 最小2節点を結合`);
    pairs.push([ordered[0].id, ordered[1].id]);
    current = result.forest;
  }
  const tree = current[0];
  const codes = api.codesFromTree(tree);
  equal(Object.keys(codes).sort(), Object.keys(fixture.frequencies).sort(), `practice ${index + 1}: 全文字に符号`);
  equal(api.totalBits(tree), Object.entries(fixture.frequencies).reduce((sum, [symbol, count]) => sum + count * codes[symbol].length, 0), `practice ${index + 1}: totalBitsと独立計算`);
  const expected = independentHuffmanCost(fixture.frequencies);
  equal(api.totalBits(tree), expected, `practice ${index + 1}: 独立Huffman最適bit数`);
  practiceCosts.push(expected);
  const text = Object.entries(fixture.frequencies).flatMap(([symbol, count]) => Array(count).fill(symbol)).join('');
  const encoded = Compression.encodeHuffman(text, codes);
  equal(Compression.decodeHuffman(encoded, codes), text, `practice ${index + 1}: encode/decode往復`);
  const restarted = api.createForest(fixture.frequencies);
  for (const pair of pairs) {
    const replay = api.joinForest(restarted, pair);
    ok(replay.ok, `practice ${index + 1}: 同じ選択を再実行`);
    restarted.splice(0, restarted.length, ...replay.forest);
  }
  equal(api.codesFromTree(restarted[0]), codes, `practice ${index + 1}: 同じ選択から同じ符号`);
}
equal(practiceCosts, Compression.HUFFMAN_PRACTICE.map(fixture => independentHuffmanCost(fixture.frequencies)), '3 practice原稿を独立計算');

// Enumerate every valid tied minimum choice for a compact tie-heavy fixture.
const tieChoices = [];
function enumerateTies(forest, path = []) {
  if (forest.length === 1) { tieChoices.push(path); return; }
  const ordered = forest.slice().sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  const minPairCounts = ordered.slice(0, 2).map(node => node.count).sort((a, b) => a - b);
  const equalPairs = [];
  for (let i = 0; i < forest.length; i += 1) for (let j = i + 1; j < forest.length; j += 1) {
    if ([forest[i].count, forest[j].count].sort((a, b) => a - b).every((count, index) => count === minPairCounts[index])) equalPairs.push([forest[i].id, forest[j].id]);
  }
  for (const pair of equalPairs) {
    const result = api.joinForest(forest, pair);
    ok(result.ok, 'すべての正しいtie pairを受理');
    enumerateTies(result.forest, path.concat([pair]));
  }
}
enumerateTies(api.createForest({ A: 1, B: 1, C: 1, D: 2 }));
ok(tieChoices.length > 1, 'tieの別経路を網羅');
for (const choices of tieChoices) {
  const tree = finishTree({ A: 1, B: 1, C: 1, D: 2 }, choices);
  equal(api.totalBits(tree), independentHuffmanCost({ A: 1, B: 1, C: 1, D: 2 }), 'tie経路でも最適bit数');
}

console.log(`compression-practice-core: ${checks}件の検証に合格（頻度、選択、枝、tie、安定id、往復、独立optimal cost）`);

function independentHuffmanCost(frequencies) {
  const pending = Object.values(frequencies).sort((a, b) => a - b);
  let total = 0;
  while (pending.length > 1) {
    const first = pending.shift();
    const second = pending.shift();
    const combined = first + second;
    total += combined;
    pending.push(combined);
    pending.sort((a, b) => a - b);
  }
  return total;
}
