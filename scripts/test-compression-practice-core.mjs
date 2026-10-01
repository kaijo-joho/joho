import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import vm from 'node:vm';
import { readFile } from 'node:fs/promises';

const require = createRequire(import.meta.url);
const api = require('../js/compression-practice-core.js');
const Compression = require('../js/compression-core.js');
let checks = 0;
function equal(actual, expected, message) { assert.deepEqual(actual, expected, message); checks += 1; }
function same(actual, expected, message) { assert.equal(JSON.stringify(actual), JSON.stringify(expected), message); checks += 1; }
function ok(value, message) { assert.ok(value, message); checks += 1; }
function invalid(callback, message) { assert.throws(callback, RangeError, message); checks += 1; }

const browser = {};
vm.runInNewContext(await readFile(new URL('../js/compression-practice-core.js', import.meta.url), 'utf8'), browser);
equal(Object.keys(browser.CompressionPracticeCore).sort(), Object.keys(api).sort(), 'CommonJSとブラウザーのAPI');

const originalFrequencies = { A: 9, B: 7, C: 3, D: 2, E: 1 };
const forest = api.createForest(originalFrequencies);
equal(forest.map(node => [node.id, node.symbol, node.count]), [['E', 'E', 1], ['D', 'D', 2], ['C', 'C', 3], ['B', 'B', 7], ['A', 'A', 9]], '頻度順の初期forest');
originalFrequencies.A = 99;
equal(forest.find(node => node.symbol === 'A').count, 9, '入力頻度とforestを共有しない');

let one = api.createForest({ A: 1, B: 1, C: 2, D: 4 });
const inputBeforeJoin = structuredClone(one);
const joinedReverse = api.joinForest(one, ['B', 'A']);
ok(joinedReverse.ok, '先に選んだBを0枝として結合');
equal(one, inputBeforeJoin, 'joinForestは入力を変更しない');
equal(joinedReverse.parent.zero.id, 'B', '先に選んだrootが0枝');
equal(joinedReverse.parent.one.id, 'A', '後に選んだrootが1枝');
equal(joinedReverse.parent.id, 'node:AB', 'root IDは葉文字から安定生成');
equal([joinedReverse.parent.zero.prefix, joinedReverse.parent.one.prefix], ['0', '1'], '選択順とprefix');

const validNonTied = api.createForest({ A: 1, B: 2, C: 8 });
const reversedJoin = api.joinForest(validNonTied, ['B', 'A']);
const forwardJoin = api.joinForest(validNonTied, ['A', 'B']);
ok(reversedJoin.ok && forwardJoin.ok, '枝向きを反転した2つの小root結合を受理');
equal(api.codesFromTree(reversedJoin.parent), { B: '0', A: '1' }, '反転した枝の符号');
equal(api.codesFromTree(forwardJoin.parent), { A: '0', B: '1' }, '通常の枝の符号');

// 結合APIは形が正しければ一時的な誤答も木にでき、正誤は最終判定へ送る。
const wrongButJoinable = api.joinForest(api.createForest({ A: 1, B: 3, C: 8 }), ['B', 'C']);
ok(wrongButJoinable.ok, '最小2つでない異なるrootも途中では結合可能');
const malformedPairs = [
  api.joinForest(validNonTied, ['A']),
  api.joinForest(validNonTied, ['A', 'A']),
  api.joinForest(validNonTied, ['A', 'Z']),
  api.joinForest(validNonTied, null),
  api.joinForest([{ id: 'A', symbol: 'A', count: 1 }, { id: 'B', symbol: 'B', count: 2, zero: {} }], ['A', 'B'])
];
malformedPairs.forEach((result, index) => equal(result.ok, false, `構造が不正な選択${index + 1}を拒否`));

function chooseSmallest(frequencies, orientation = 'forward') {
  let current = api.createForest(frequencies);
  const joins = [];
  while (current.length > 1) {
    const sorted = current.slice().sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
    const pair = [sorted[0].id, sorted[1].id];
    if (orientation === 'reverse' && joins.length % 2 === 0) pair.reverse();
    const result = api.joinForest(current, pair);
    ok(result.ok, `選んだ最小2rootを結合: ${pair.join(',')}`);
    joins.push({ selectedIds: pair });
    current = result.forest;
  }
  return { forest: current, joins };
}

const sourceFixtures = [Compression.HUFFMAN_EXAMPLE, ...Compression.HUFFMAN_PRACTICE, ...Compression.HUFFMAN_QUESTIONS];
for (const [index, fixture] of sourceFixtures.entries()) {
  const built = chooseSmallest(fixture.frequencies, index % 2 ? 'reverse' : 'forward');
  const beforeForest = JSON.stringify(built.forest);
  const history = { frequencies: fixture.frequencies, joins: built.joins };
  const beforeHistory = JSON.stringify(history);
  const judged = api.gradeForest(built.forest, history);
  equal([judged.correct, judged.complete], [true, true], `原稿fixture${index + 1}の全${Object.keys(fixture.frequencies).length - 1}結合を採点`);
  equal(Object.keys(judged.codes).sort(), Object.keys(fixture.frequencies).sort(), `原稿fixture${index + 1}は全文字に符号`);
  const independentlyCountedBits = Object.entries(fixture.frequencies).reduce((sum, [symbol, count]) => sum + count * judged.codes[symbol].length, 0);
  equal(judged.bitCount, independentlyCountedBits, `原稿fixture${index + 1}の合計bit数`);
  equal(judged.bitCount, independentHuffmanCost(fixture.frequencies), `原稿fixture${index + 1}の独立Huffman最適値`);
  const text = Object.entries(fixture.frequencies).flatMap(([symbol, count]) => Array(count).fill(symbol)).join('');
  const encoded = Compression.encodeHuffman(text, judged.codes);
  equal(Compression.decodeHuffman(encoded, judged.codes), text, `原稿fixture${index + 1}の符号・復号往復`);
  equal(JSON.stringify(built.forest), beforeForest, `原稿fixture${index + 1}のforest不変`);
  equal(JSON.stringify(history), beforeHistory, `原稿fixture${index + 1}のhistory不変`);
}

// 同頻度の別ペア、0/1の枝反転も、各段階で最小2つなら正解。
const tieFrequencies = { A: 1, B: 1, C: 1, D: 2 };
const tiePaths = [];
function enumerateTies(current, path = []) {
  if (current.length === 1) { tiePaths.push(path); return; }
  const sorted = current.slice().sort((a, b) => a.count - b.count || a.id.localeCompare(b.id));
  const required = sorted.slice(0, 2).map(node => node.count).sort((a, b) => a - b);
  for (let i = 0; i < current.length; i += 1) for (let j = i + 1; j < current.length; j += 1) {
    const counts = [current[i].count, current[j].count].sort((a, b) => a - b);
    if (counts[0] !== required[0] || counts[1] !== required[1]) continue;
    const pair = [current[i].id, current[j].id];
    const result = api.joinForest(current, pair);
    ok(result.ok, 'tieで許されるpairを結合');
    enumerateTies(result.forest, path.concat([{ selectedIds: pair }]));
  }
}
enumerateTies(api.createForest(tieFrequencies));
ok(tiePaths.length > 1, '複数のtie経路を列挙');
for (const path of tiePaths) {
  let current = api.createForest(tieFrequencies);
  for (const step of path) current = api.joinForest(current, step.selectedIds).forest;
  const judged = api.gradeForest(current, { frequencies: tieFrequencies, joins: path });
  equal(judged.correct, true, 'tie経路を正解として採点');
  equal(judged.bitCount, independentHuffmanCost(tieFrequencies), 'tie経路は最適bit数');
}

// 最初の2結合は正解、3結合目でA9+B7を誤選択。最後まで木を作れても最初の誤りを示す。
let mistaken = api.createForest({ A: 9, B: 7, C: 3, D: 2, E: 1 });
const wrongSteps = [];
for (const pair of [['E', 'D'], ['C', 'node:DE'], ['A', 'B'], ['node:AB', 'node:CDE']]) {
  const result = api.joinForest(mistaken, pair);
  ok(result.ok, `誤った手順も構造上結合可能: ${pair.join(',')}`);
  wrongSteps.push({ selectedIds: pair });
  mistaken = result.forest;
}
const wrongGrade = api.gradeForest(mistaken, { frequencies: { A: 9, B: 7, C: 3, D: 2, E: 1 }, joins: wrongSteps });
equal([wrongGrade.correct, wrongGrade.complete, wrongGrade.firstIncorrectStep], [false, true, 3], '完成した誤答は最初の誤った結合を指摘');
equal(wrongGrade.expectedCounts, [6, 7], '誤った時点で選ぶべき頻度');
ok(wrongGrade.message.includes('3回目') && wrongGrade.message.includes('6と7'), '誤答説明に段階と正しい頻度');

// undo後の再判定: 最後の誤結合を取り消して、最小ペアに置き換える。
let corrected = api.createForest({ A: 9, B: 7, C: 3, D: 2, E: 1 });
const correctedJoins = [];
for (const pair of [['E', 'D'], ['C', 'node:DE'], ['node:CDE', 'B'], ['node:BCDE', 'A']]) {
  const result = api.joinForest(corrected, pair);
  ok(result.ok, `再判定の正しい結合: ${pair.join(',')}`);
  correctedJoins.push({ selectedIds: pair });
  corrected = result.forest;
}
const afterRedo = api.gradeForest(corrected, { frequencies: { A: 9, B: 7, C: 3, D: 2, E: 1 }, joins: correctedJoins });
equal([afterRedo.correct, afterRedo.complete], [true, true], 'undo後に正しい結合を再実行して再判定');

const incomplete = api.createForest({ A: 1, B: 2, C: 3 });
const incompleteGrade = api.gradeForest(incomplete, { frequencies: { A: 1, B: 2, C: 3 }, joins: [] });
equal([incompleteGrade.correct, incompleteGrade.complete], [false, false], '未完成forest');
equal(api.gradeForest([{ id: 'A', symbol: 'A', count: 1 }], { frequencies: { A: 1, B: 1 }, joins: [] }).complete, false, '頻度と葉の不一致');

equal(api.codesFromTree({ id: 'A', symbol: 'A', count: 5, prefix: '' }), { A: '0' }, '1文字木の1bit符号');
equal(api.totalBits({ id: 'A', symbol: 'A', count: 5, prefix: '' }), 5, '1文字木の合計bit数');

const cyclic = { id: 'node:AB', count: 2 };
cyclic.zero = cyclic;
cyclic.one = { id: 'B', symbol: 'B', count: 1 };
equal(api.joinForest([cyclic], ['node:AB', 'B']).ok, false, '循環構造を安全に拒否');
equal(api.gradeForest([cyclic], { frequencies: { A: 1, B: 1 }, joins: [] }).complete, false, 'graderの循環ガード');
const sharedLeaf = { id: 'A', symbol: 'A', count: 1 };
const sharedForest = [{ id: 'node:AA', count: 2, zero: sharedLeaf, one: sharedLeaf }];
equal(api.joinForest(sharedForest, ['A', 'A']).ok, false, '共有節点の不正な木を拒否');

for (const action of [
  () => api.createForest({}),
  () => api.createForest({ F: 1 }),
  () => api.createForest({ AB: 1 }),
  () => api.createForest({ A: 0 }),
  () => api.createForest({ A: -1 }),
  () => api.createForest({ A: 1.5 }),
  () => api.createForest({ A: Number.MAX_SAFE_INTEGER + 1 }),
  () => api.createForest({ A: Number.MAX_SAFE_INTEGER, B: 1 }),
  () => api.codesFromTree({ id: 'bad', count: 2, zero: { id: 'A', symbol: 'A', count: 1 }, one: { id: 'A2', symbol: 'A', count: 1 } })
]) invalid(action, '不正な頻度または木の入力を拒否');
equal(api.gradeForest(api.createForest({ A: 1 }), { frequencies: {}, joins: [] }).correct, false, '採点APIは不正な履歴を安全な不正解として返す');

console.log(`compression-practice-core: ${checks}件の検証に合格（誤結合、最終判定、tie、枝反転、n-1結合、原稿fixture、入力不変、安全ガード）`);

function independentHuffmanCost(frequencies) {
  const pending = Object.values(frequencies).sort((a, b) => a - b);
  let total = 0;
  while (pending.length > 1) {
    const combined = pending.shift() + pending.shift();
    total += combined;
    pending.push(combined);
    pending.sort((a, b) => a - b);
  }
  return total;
}
