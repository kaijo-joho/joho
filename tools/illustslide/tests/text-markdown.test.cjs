#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const Markdown = require('../text-markdown.js');

function runs(input) { return Markdown.parse(input).runs; }
assert.deepEqual(runs('普通 **太字** *斜体* ^上^ _下_'), [
  { text: '普通 ', script: 'normal' }, { text: '太字', script: 'normal', bold: true },
  { text: ' ', script: 'normal' }, { text: '斜体', script: 'normal', italic: true },
  { text: ' ', script: 'normal' }, { text: '上', script: 'super' },
  { text: ' ', script: 'normal' }, { text: '下', script: 'sub' }
]);
assert.deepEqual(runs('**太字と*斜体* ^上^**'), [
  { text: '太字と', script: 'normal', bold: true }, { text: '斜体', script: 'normal', bold: true, italic: true },
  { text: ' ', script: 'normal', bold: true }, { text: '上', script: 'super', bold: true }
]);
assert.deepEqual(runs('{{color=#1a2B3c|赤 **太字**}}'), [
  { text: '赤 ', script: 'normal', fill: '#1A2B3C' }, { text: '太字', script: 'normal', bold: true, fill: '#1A2B3C' }
]);
assert.deepEqual(runs('\\**literal\\** と \\_x\\_ と \\{{color=#FF0000|x}}'), [{ text: '**literal** と _x_ と {{color=#FF0000|x}}', script: 'normal' }]);
const code = Markdown.parse('`a_b` と `**x**`');
assert.deepEqual(code.runs, [{ text: 'a_b と **x**', script: 'normal' }]);
assert.equal(code.diagnostics.filter(d => d.syntax === 'inline-code').length, 2);
const unsafe = Markdown.parse('<img src=x onerror=alert(1)> {{style=color:red|危険}} [[warning: 注意]]');
assert.deepEqual(unsafe.runs, [{ text: '<img src=x onerror=alert(1)> {{style=color:red|危険}} [[warning: 注意]]', script: 'normal' }]);
assert.deepEqual(unsafe.diagnostics.map(d => d.syntax), ['html', 'curly-span', 'shortcode']);
const bad = Markdown.parse('**閉じない {{color=red|色}} `コード');
assert.equal(bad.runs.map(run => run.text).join(''), '**閉じない {{color=red|色}} `コード');
assert.equal(bad.diagnostics.some(d => d.kind === 'malformed'), true);
for (const input of ['**a\\**', '{{color=#FF0000|a\\}}', '**a *b']) {
  const value = Markdown.parse(input);
  assert.equal(value.runs.map(run => run.text).join(''), input, `未閉じの ${input} は原文を重複なく保つ`);
  assert.equal(value.runs.every(run => !run.bold && !run.italic && run.script === 'normal' && run.fill === undefined), true);
}
assert.deepEqual(runs('{{color=#FF0000|赤 {{color=#00ff00|緑}} 青}}'), [
  { text: '赤 ', script: 'normal', fill: '#FF0000' }, { text: '緑', script: 'normal', fill: '#00FF00' }, { text: ' 青', script: 'normal', fill: '#FF0000' }
]);
for (const input of ['[リンク](https://example.test)', '[[[table]]]\na|b\n[[[/table]]]', '<b>HTML</b>']) {
  const value = Markdown.parse(input); assert.equal(value.runs.map(run => run.text).join(''), input, `${input} は原文を保持する`); assert(value.diagnostics.length);
}
assert.deepEqual(runs('a\r\nb\u000bc\fd'), [{ text: 'a\nb\nc\nd', script: 'normal' }]);
assert.equal(Object.values(runs('**A**')).every(run => ['normal', 'super', 'sub'].includes(run.script)), true);
console.log('text-markdown.test.cjs: passed');
