#!/usr/bin/env node
'use strict';

const assert = require('node:assert/strict');
const path = require('node:path');
let chromium;
try { ({chromium}=require('playwright')); } catch { ({chromium}=require(path.join(require('node:os').homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const TextLayout = require('../text-layout.js');
const root = path.resolve(__dirname, '..');
const style = { fontSize: 10, fontFamily: 'sans-serif', bold: false, italic: false };
const measure = text => Array.from(text).length * 10;

function words(lines) { return lines.map(line => line.runs.map(run => run.text).join('')); }

// The injected measure makes line breaks independent of installed fonts.
let result = TextLayout.layout({ x: 12, y: 20, runs: [{ text: 'ab cd', script: 'normal' }], style, layout: { width: 25, align: 'left' } }, { measure });
assert.deepEqual(words(result.lines), ['ab', 'cd']);
assert.deepEqual(result.lines.map(line => line.x), [12, 12]);
assert.deepEqual(words(TextLayout.layout({ x: 0, y: 0, runs: [{ text: 'abcd', script: 'normal' }], style, layout: { width: 20, align: 'left' } }, { measure }).lines), ['ab', 'cd']);

result = TextLayout.layout({ x: 0, y: 10, runs: [{ text: 'a\nb', script: 'normal' }, { text: '\n', script: 'super' }], style, layout: { width: null, align: 'right' } }, { measure });
assert.deepEqual(words(result.lines), ['a', 'b', '']);
assert.deepEqual(result.lines.map(line => line.x), [0, 0, 10]);
assert.equal(result.lines[1].y - result.lines[0].y, 12);

result = TextLayout.layout({ x: 5, y: 20, runs: [{ text: 'a', script: 'normal' }, { text: '2', script: 'super' }, { text: 'b', script: 'sub' }], style, layout: { width: null, align: 'center' } }, { measure });
assert.deepEqual(result.lines[0].runs, [{ text: 'a', script: 'normal' }, { text: '2', script: 'super' }, { text: 'b', script: 'sub' }]);
assert.equal(result.lines[0].x, 5);

result = TextLayout.layout({ x: 0, y: 0, runs: [{ text: 'A👩‍💻e\u0301日本語', script: 'normal' }], style, layout: { width: 20, align: 'left' } }, { measure });
assert.ok(words(result.lines).join('') === 'A👩‍💻e\u0301日本語');
assert.ok(words(result.lines).every(line => !line.includes('\ud83d') || line.includes('👩‍💻')));
assert.ok(words(result.lines).includes('e\u0301'));

result = TextLayout.layout({ x: 0, y: 0, runs: [{ text: 'e', script: 'normal' }, { text: '\u0301', script: 'super' }, { text: '👩\u200d', script: 'normal' }, { text: '💻', script: 'sub' }], style, layout: { width: null, align: 'left' } }, { measure });
assert.deepEqual(result.lines[0].runs, [{ text: 'e\u0301👩‍💻', script: 'normal' }]);

const original = { x: 2, y: 3, runs: [{ text: 'unchanged', script: 'normal' }], style, layout: { width: 20, align: 'right' } };
const snapshot = JSON.stringify(original); TextLayout.layout(original, { measure });
assert.equal(JSON.stringify(original), snapshot);

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
  const page = await browser.newPage();
  for (const file of ['vendor/paper-core-0.12.18.min.js', 'text-layout.js', 'geometry.js']) await page.addScriptTag({ path: path.join(root, file) });
  const report = await page.evaluate(() => {
    const style = { fill: '#000000', stroke: 'none', strokeWidth: 0, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 10, fontFamily: 'sans-serif', bold: false, italic: false };
    const path = { id: 'labelled', type: 'path', name: 'ラベル', group: null, locked: false, d: 'M0 0 L40 0 L40 2 L0 2 Z', matrix: [0, 2, -3, 0, 100, 50], style, label: { runs: [{ text: 'abcdef', script: 'normal' }], style, align: 'center', padding: 2 } };
    const before = JSON.stringify(path), text = IlapoTextLayout.shapeText(path), moved = IlapoTextLayout.shapeText({ ...path, matrix: [0, 2, -3, 0, 113, 73] }), visual = IlapoGeometry.visualBounds(path), shape = IlapoGeometry.bounds(path);
    const zero = IlapoTextLayout.shapeText({ ...path, matrix: [0, 0, 0, 0, 7, 8], label: { ...path.label, padding: 999 } });
    const padded = IlapoTextLayout.shapeText({ ...path, label: { ...path.label, padding: 999 } });
    const textStyle = { ...style, fontSize: 30, fontFamily: 'serif', italic: true };
    const scripted = { id: 'scripted', type: 'text', name: 'script', group: null, locked: false, x: 100, y: 100, runs: [{ text: 'A', script: 'normal' }, { text: '2', script: 'super' }, { text: 'x', script: 'sub' }], style: textStyle, matrix: [1, 0, 0, 1, 0, 0], layout: { width: null, align: 'right' } };
    const scriptedLayout = IlapoTextLayout.layout(scripted), scriptedGeometry = IlapoGeometry.bounds(scripted);
    const canvas = document.createElement('canvas').getContext('2d'); canvas.font = 'italic 30px serif';
    const kerning = IlapoTextLayout.layout({ ...scripted, x: 200, runs: [{ text: 'AV', script: 'normal' }], layout: { width: 100, align: 'right' } });
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg'), node = document.createElementNS(svg.namespaceURI, 'text'); node.setAttribute('x', '100'); node.setAttribute('y', '100'); node.setAttribute('font-size', '30'); node.setAttribute('font-family', 'serif'); node.setAttribute('font-style', 'italic'); scripted.runs.forEach(run => { const span = document.createElementNS(svg.namespaceURI, 'tspan'); if (run.script !== 'normal') { span.setAttribute('baseline-shift', run.script); span.setAttribute('font-size', '70%'); } span.textContent = run.text; node.append(span); }); svg.append(node); document.body.append(svg); const b = node.getBBox(); svg.remove();
    return { text, moved, visual, shape, unchanged: before === JSON.stringify(path), zero, padded, scriptedLayout, scriptedGeometry, svgBox: { x: b.x, y: b.y, width: b.width, height: b.height }, kerning: { width: kerning.lines[0].width, x: kerning.lines[0].x, av: canvas.measureText('AV').width, separate: canvas.measureText('A').width + canvas.measureText('V').width } };
  });
  assert.equal(report.unchanged, true);
  assert.deepEqual(report.text.matrix, [0, 1, -1, 0, 100, 50]);
  assert.equal(report.text.layout.width, 76); // 40 * sx(2), padding on both sides
  assert.ok(report.text.layout.width > 0 && report.text.runs[0].text === 'abcdef');
  assert.deepEqual(report.moved.matrix, [0, 1, -1, 0, 113, 73]);
  assert.ok(report.visual.width > report.shape.width); // the one-line label overflows this thin path
  assert.ok(report.zero.matrix.every(Number.isFinite));
  assert.equal(report.zero.matrix[4], 7);
  assert.equal(report.zero.layout.width, 1e-6);
  assert.equal(report.padded.layout.width, 1e-6);
  assert.equal(report.padded.x, 40); // horizontal padding clamps to the scaled path half-width
  assert.ok(Math.abs(report.kerning.width - report.kerning.av) < .001);
  assert.ok(Math.abs(report.kerning.x - (300 - report.kerning.width)) < .001);
  assert.ok(Math.abs(report.kerning.av - report.kerning.separate) > .001);
  assert.ok(report.scriptedLayout.inkBounds.x > 98); // centered/right text no longer starts at input.x
  assert.ok(report.scriptedGeometry.x <= report.svgBox.x && report.scriptedGeometry.y <= report.svgBox.y);
  assert.ok(report.scriptedGeometry.x + report.scriptedGeometry.width >= report.svgBox.x + report.svgBox.width);
  assert.ok(report.scriptedGeometry.y + report.scriptedGeometry.height >= report.svgBox.y + report.svgBox.height);
  console.log('text-layout.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(async error => { console.error(error); process.exitCode = 1; });
