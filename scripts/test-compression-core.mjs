import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const require = createRequire(import.meta.url);
const commonJsCore = require('../js/compression-core.js');
const runtime = {};
vm.runInNewContext(await readFile(new URL('../js/compression-core.js', import.meta.url), 'utf8'), runtime);
const core = runtime.CompressionCore;
let checks = 0;
const equal = (actual, expected) => { assert.equal(actual, expected); checks += 1; };
const jsonEqual = (actual, expected) => equal(JSON.stringify(actual), JSON.stringify(expected));

const toBinaryImage = grid => grid.flat().map(value => value ? '黒' : '白').join('');
const independentHuffmanCost = frequencies => {
  const forest = Object.values(frequencies).slice().sort((a, b) => a - b);
  let cost = 0;
  while (forest.length > 1) {
    const parent = forest.shift() + forest.shift();
    cost += parent;
    forest.push(parent);
    forest.sort((a, b) => a - b);
  }
  return cost;
};

equal(Object.isFrozen(core), true);
equal(typeof commonJsCore.huffmanFromCodes, 'function');
equal(Object.isFrozen(core.fixtures), true);
equal(Object.isFrozen(core.IMAGE_QUESTIONS.figure4), true);

// 原本77枚目: A6 B4 C2 D1 A3、16文字を10文字へ。
jsonEqual(core.rleRuns(core.RLE_EXAMPLE), [
  { value: 'A', count: 6, start: 0, end: 6 },
  { value: 'B', count: 4, start: 6, end: 10 },
  { value: 'C', count: 2, start: 10, end: 12 },
  { value: 'D', count: 1, start: 12, end: 13 },
  { value: 'A', count: 3, start: 13, end: 16 }
]);
const letterRle = core.encodeRle(core.RLE_EXAMPLE);
equal(letterRle.encoded, 'A6B4C2D1A3');
equal(letterRle.before, 16); equal(letterRle.after, 10);
equal(core.compressionRate(letterRle.before, letterRle.after), 62.5);
equal(core.decodeRle(letterRle.encoded), core.RLE_EXAMPLE);
equal(core.encodeRle(core.RLE_EXAMPLE, 3).encoded, 'A6B4CCDA3');

// 5×5の二値画像は行をまたいで読み、原本の黒6から始まる。
const imageText = toBinaryImage(core.IMAGE_EXAMPLE);
equal(core.encodeRle(imageText).encoded, '黒6白4黒4白1黒1白4黒1白4');
equal(core.compressionRate(25, 16), 64);
equal(core.encodeRle(toBinaryImage(core.IMAGE_QUESTIONS.figure2), 3).encoded, '黒6白3黒3白黒3');
equal(core.encodeRle(toBinaryImage(core.IMAGE_QUESTIONS.figure4[2]), 3).after, 15);
equal(core.compressionRate(25, 15), 60);
jsonEqual(core.rleRuns('😀😀😀白白'), [
  { value: '😀', count: 3, start: 0, end: 3 },
  { value: '白', count: 2, start: 3, end: 5 }
]);
equal(core.encodeRle('😀😀😀白白', 3).encoded, '😀3白白');
equal(core.decodeRle('A12B1'), 'AAAAAAAAAAAAB');
for (const [symbol, count] of Object.entries(core.HUFFMAN_EXAMPLE.frequencies)) equal(core.countCharacters(core.HUFFMAN_EXAMPLE.text)[symbol], count);

const allHuffmanFixtures = [core.HUFFMAN_EXAMPLE, ...core.HUFFMAN_PRACTICE, ...core.HUFFMAN_QUESTIONS];
for (const fixture of allHuffmanFixtures) {
  const tree = core.huffmanFromCodes(fixture.frequencies, fixture.codes);
  equal(tree.root.id, 'root');
  equal(tree.root.count, Object.values(fixture.frequencies).reduce((sum, value) => sum + value, 0));
  equal(tree.totalBits, independentHuffmanCost(fixture.frequencies));
  equal(tree.steps.length, Object.keys(fixture.codes).length - 1);
  let forest = [...tree.leaves];
  for (const step of tree.steps) {
    const smallest = forest.map(node => node.count).sort((a, b) => a - b).slice(0, 2);
    jsonEqual([step.zero.count, step.one.count].sort((a, b) => a - b), smallest);
    equal(step.parent.count, step.zero.count + step.one.count);
    forest = step.forest;
  }
  equal(forest.length, 1);
  equal(forest[0].id, 'root');
}

const exampleBits = core.encodeHuffman(core.HUFFMAN_EXAMPLE.text, core.HUFFMAN_EXAMPLE.codes);
equal(exampleBits.length, 38);
equal(core.decodeHuffman(exampleBits, core.HUFFMAN_EXAMPLE.codes), core.HUFFMAN_EXAMPLE.text);
equal(core.compressionRate(core.HUFFMAN_EXAMPLE.text.length * core.HUFFMAN_EXAMPLE.fixedBits, exampleBits.length), 38 / 54 * 100);
jsonEqual(core.HUFFMAN_EXAMPLE.codes, { A: '10', B: '0', C: '110', D: '1110', E: '1111' });

for (const [index, question] of core.HUFFMAN_QUESTIONS.entries()) {
  const bits = core.encodeHuffman(question.text, question.codes);
  equal(bits.length, [34, 90][index]);
  equal(core.compressionRate(question.text.length * question.fixedBits, bits.length), [85, 75][index]);
  equal(core.encodeHuffman(question.encodeText, question.codes), ['10110010', '01001100111101'][index]);
  equal(core.decodeHuffman(question.decodeBits, question.codes), ['ACAB', 'BAEC'][index]);
  equal(core.decodeHuffman(bits, question.codes), question.text);
}

for (const action of [
  () => core.encodeRle('AAA', 0),
  () => core.decodeRle('A0'),
  () => core.decodeRle('A01'),
  () => core.decodeRle('A'),
  () => core.decodeRle('A513'),
  () => core.compressionRate(0, 1),
  () => core.encodeHuffman('Z', { A: '0', B: '1' }),
  () => core.decodeHuffman('01', { A: '0', B: '01' }),
  () => core.decodeHuffman('1', { A: '0', B: '10', C: '11' }),
  () => core.decodeHuffman('2', { A: '0', B: '1' }),
  () => core.huffmanFromCodes({ A: 1 }, { A: '0', B: '1' }),
  () => core.huffmanFromCodes({ A: 1, B: 1 }, { A: '0', B: '10' })
]) {
  assert.throws(action); checks += 1;
}

console.log(`compression-core: ${checks}件の検証に合格（原本RLE・二値画像・Huffman全fixture、木、往復、境界）`);
