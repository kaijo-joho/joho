const test = require('node:test');
const assert = require('node:assert/strict');
const IlapoCore = require('../core.js');
const IlapoExport = require('../export.js');

function page(board = IlapoCore.boardPreset('a4')) {
  const p = IlapoCore.createPage('テスト', board);
  p.objects.push(IlapoCore.makeText(40, 70, '日本語 H', { fontSize: 18, fontFamily: 'sans-serif' }));
  return p;
}

test('buildPrintHTML gives each page its physical paper size and keeps SVG vector markup', () => {
  const html = IlapoExport.buildPrintHTML([page(), page(IlapoCore.boardPreset('b5'))]);
  assert.match(html, /@page ilapo-0\{size:210mm 297mm/);
  assert.match(html, /@page ilapo-1\{size:182mm 257mm/);
  assert.match(html, /<text[\s\S]*日本語/);
  assert.match(html, /break-after:page/);
  assert.match(html, /\.ilapo-print-page:last-child\{break-after:auto/);
  assert.doesNotMatch(html, /<script|<img|data:image\/png/i);
});

test('free pages retain their SVG dimensions in CSS millimetres', () => {
  const p = page(IlapoCore.boardPreset('free'));
  p.objects[0].x = -20;
  const html = IlapoExport.buildPrintHTML([p], { padding: 8 });
  assert.match(html, /@page ilapo-0\{size:[0-9.]+mm [0-9.]+mm/);
  assert.match(html, /viewBox="0 0 1280 720"/);
});

test('custom paper dimensions are preserved instead of inferred as A4/B5', () => {
  const custom = page({ width: 210 * 96 / 25.4, height: 100 * 96 / 25.4, unit: 'mm', infinite: false });
  const html = IlapoExport.buildPrintHTML([custom], { title: '確認 <作品>' });
  assert.match(html, /@page ilapo-0\{size:210mm 99\.9+mm/);
  assert.match(html, /<title>確認 &lt;作品&gt;<\/title>/);
});

test('print input accepts pages only and rejects raw SVG strings', () => {
  assert.throws(() => IlapoExport.buildPrintHTML(['<svg width="10" height="10"></svg>']), /Pageまたは/);
});

test('empty PNG selection is rejected before browser work', async () => {
  await assert.rejects(() => IlapoExport.png(page(), { selectionIds: [] }), /選択した図形がありません/);
});

test('print input must contain a page', () => {
  assert.throws(() => IlapoExport.buildPrintHTML([]), /印刷するページがありません/);
});

test('literal HTML examples in lesson artwork remain escaped printable text', () => {
  const p = page(); p.objects[0].runs = [{ text: '<script> onload="説明" </script>', script: 'normal' }];
  const html = IlapoExport.buildPrintHTML([p]);
  assert.match(html, /&lt;script&gt; onload=&quot;説明&quot; &lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>/);
});
