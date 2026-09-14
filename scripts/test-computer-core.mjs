import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';

const context = vm.createContext({});
vm.runInContext(readFileSync(new URL('../js/computer-core.js', import.meta.url), 'utf8'), context);
const core = context.ComputerCore;
const plain = value => JSON.parse(JSON.stringify(value));
assert.equal(core.CPU_STEPS.length, 13);
assert.deepEqual(plain(core.CPU_STEPS.map(frame => frame.register)), [null, null, null, 3, 3, 3, 8, 8, 8, 8, 8, 8, 8]);
assert.deepEqual(plain(core.CPU_STEPS.map(frame => frame.result)), [null, null, null, null, null, null, null, null, null, 8, 8, 8, 8]);
assert.deepEqual(plain(core.CPU_STEPS.filter(frame => frame.stage === 'fetch').map(frame => frame.address)), [1, 2, 3, 4]);
assert.deepEqual(plain(core.CPU_STEPS.filter(frame => frame.stage === 'execute').map(frame => frame.pc)), [2, 3, 4, 4]);
assert.equal(core.CPU_STEPS.at(-1).halted, true);
assert.deepEqual(plain(core.MEMORY_STEPS.map(frame => frame.disk)), ['こんにちは', 'こんにちは', 'こんにちは', 'こんにちは！', 'こんにちは！']);
assert.equal(core.MEMORY_STEPS[2].ram, 'こんにちは！');
assert.equal(core.MEMORY_STEPS.at(-1).ram, null);
assert.equal(core.clockRate(1.6, 4), 4e8);
for (const args of [[0, 4], [1, 0], [NaN, 2], [1, 2.5], [Infinity, 4], [-2, 4]]) assert.throws(() => core.clockRate(...args));
for (const [text, value] of [['４００', 400], ['1.6e9', 1.6e9], ['.5', .5], ['0', 0]]) assert.equal(core.parseNumber(text), value);
for (const text of ['', ' ', '1,2', '4億', '<img>', '-1', 'NaN', 'Infinity', '1e309']) assert.equal(core.parseNumber(text), null);
let count = 0;
for (const bank of Object.values(core.QUESTIONS)) {
  for (const question of bank) {
    count++;
    if (question.type === 'number') {
      for (const scale of [1, 1e4, 1e8]) assert.deepEqual(plain(core.judge(question, String(question.answer / scale), scale)), { valid: true, correct: true });
      assert.equal(core.judge(question, String(question.answer * 2)).correct, false);
      assert.equal(core.judge(question, '', 1).valid, false);
      assert.equal(core.judge(question, '4', 10).valid, false);
    } else if (question.type === 'order') {
      assert.equal(core.judge(question, question.answer).correct, true);
      assert.equal(core.judge(question, [null, 1, 0]).valid, false);
      assert.equal(core.judge(question, [0, 1, 2]).correct, false);
    } else {
      question.options.forEach((_, i) => assert.equal(core.judge(question, i).correct, question.answer === i));
      assert.equal(core.judge(question, null).valid, false);
    }
  }
}
const info = core.fileAt([0, 0, 0]), english = core.fileAt([1, 0, 0]);
assert.equal(info.name, english.name);
assert.notEqual(info, english);
assert.equal(core.fileAt([999]), undefined);
console.log(`computer-core: CPU・記憶装置・数値換算・${count}問・階層モデル OK`);
