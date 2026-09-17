/* Chrome coverage for multi-selection, bulk formatting, style transfer, and responsive state. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(error ? 'not found' : data); });
});

function fixture() {
  const doc = C.createDocument();
  const f = C.createSeries(); Object.assign(f, { id: 'f', name: '曲線A', expression: 'x' });
  const g = C.createSeries(); Object.assign(g, { id: 'g', name: '曲線B', expression: 'x+1', style: { ...g.style, width: 3, color: '#dc2626' } });
  const d = C.createSeries('data2d'); Object.assign(d, { id: 'd', name: '観測値', rows: [[0, 1], [1, 2], [2, 4]] });
  doc.series = [f, g, d];
  const p = C.createAnnotation('point'); Object.assign(p, { id: 'p', name: '点P', anchor: { type: 'curve', seriesId: 'f', at: '1' } });
  const t = C.createAnnotation('text'); Object.assign(t, { id: 't', name: '説明', text: '説明文' });
  doc.annotations = [p, t];
  return C.validateDocument(doc);
}

let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  page = await browser.newPage({ viewport: { width: 1280, height: 900 }, hasTouch: true });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`);
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const state = () => page.evaluate(() => GraphEditor.getState());
  const load = async value => { await page.locator('#file-input').setInputFiles({ name: 'multiselect.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await settle(); };
  const item = (type, id) => page.locator('[data-reorder-type="' + type + '"][data-reorder-id="' + id + '"] .object-item, [data-reorder-type="' + type + '"][data-reorder-id="' + id + '"] .parameter-name').first();
  const bar = page.locator('#selection-toolbar');
  const mod = process.platform === 'darwin' ? 'Meta' : 'Control';
  await settle(); await load(fixture());

  await item('series', 'f').click(); await page.keyboard.down(mod); await item('series', 'g').click(); await page.keyboard.up(mod); await settle();
  assert.deepEqual((await state()).selection.map(ref => ref.id), ['f', 'g'], 'modifier click selects two series');
  assert.equal(await bar.getByLabel('線の太さ', { exact: true }).inputValue(), '', 'mixed width has no value');
  assert.equal(await bar.getByLabel('線の太さ', { exact: true }).getAttribute('placeholder'), '混在');
  await bar.getByLabel('線の太さ', { exact: true }).fill('4'); await bar.getByLabel('線の太さ', { exact: true }).press('Tab'); await settle();
  assert.equal((await doc()).series[0].style.width, 4, 'style is changed before reload');
  assert.deepEqual((await doc()).series.slice(0, 2).map(s => s.style.width), [4, 4], 'bulk width applies to both');
  await page.locator('#undo').click(); await settle(); assert.deepEqual((await doc()).series.slice(0, 2).map(s => s.style.width), [2, 3], 'one undo restores the bulk operation');

  await item('series', 'f').click(); await settle(); await bar.getByRole('button', { name: '書式をコピー', exact: true }).click();
  const beforeData = (await doc()).series[2];
  await page.keyboard.down(mod); await item('series', 'g').click(); await item('series', 'd').click(); await page.keyboard.up(mod); await settle();
  assert.equal(await bar.getByRole('button', { name: '書式を適用', exact: true }).isEnabled(), true);
  await bar.getByRole('button', { name: '書式を適用', exact: true }).click(); await settle();
  const copied = await doc(); assert.equal(copied.series[1].style.color, copied.series[0].style.color); assert.equal(copied.series[2].style.color, copied.series[0].style.color);
  assert.equal(copied.series[2].name, beforeData.name); assert.deepEqual(copied.series[2].rows, beforeData.rows); assert.deepEqual(copied.series[2].style, copied.series[0].style);
  await page.locator('#undo').click(); await settle(); assert.equal((await doc()).series[1].style.color, '#dc2626', 'paste is one undo operation');

  await item('series', 'f').click(); await page.keyboard.down(mod); await item('annotation', 'p').click(); await page.keyboard.up(mod); await settle();
  await page.keyboard.press('Delete'); await settle(); assert.equal((await doc()).series.some(s => s.id === 'f'), false); assert.equal((await doc()).annotations.some(a => a.id === 'p'), false, 'dependent point is deleted with its parent');
  await page.locator('#undo').click(); await settle(); assert.equal((await doc()).series.some(s => s.id === 'f'), true); assert.equal((await doc()).annotations.some(a => a.id === 'p'), true, 'one undo restores cascade');

  await item('series', 'f').click(); await page.keyboard.down(mod); await item('series', 'g').click(); await page.keyboard.up(mod); await settle();
  await bar.getByRole('button', { name: '自由な色（RGB）', exact: true }).click();
  for (const [label, value] of [['R', '12'], ['G', '34'], ['B', '56']]) await page.locator('#editor-dialog').getByLabel(label, { exact: true }).fill(value);
  await page.locator('#dialog-submit').click(); await settle(); assert.deepEqual((await doc()).series.slice(0, 2).map(s => s.style.color), ['#0c2238', '#0c2238'], 'RGB applies to all selected series');

  await item('series', 'f').click(); await page.keyboard.down(mod); await item('annotation', 'p').click(); await page.keyboard.up(mod); await settle();
  assert.equal(await bar.getByLabel('線の太さ', { exact: true }).count(), 0, 'incompatible bulk width control is hidden');
  assert.equal(await bar.getByLabel('文字サイズ（px）', { exact: true }).count(), 0, 'font size is hidden when not common');

  await item('series', 'f').click(); await page.keyboard.down('Shift'); await item('series', 'd').click(); await page.keyboard.up('Shift'); await settle();
  assert.deepEqual((await state()).selection.map(ref => ref.id), ['f', 'g', 'd'], 'shift click selects an inclusive range');
  await item('series', 'd').focus(); await page.keyboard.press('Shift+ArrowUp'); await settle(); assert.deepEqual((await state()).selection.map(ref => ref.id), ['f', 'g', 'd'], 'shift arrow preserves the selected range without editing data');

  await load(fixture()); await page.locator('#multiple-select').click(); await settle(); await item('series', 'f').click(); await item('series', 'g').click(); await settle();
  assert.equal(await page.locator('#selection-count').innerText(), '2件の書式を編集'); assert.equal(await page.locator('#selection-count').isVisible(), true);
  await page.locator('#selection-count').click(); assert.equal(await page.locator('#format-panel').isVisible(), true);
  await bar.getByLabel('線の太さ', { exact: true }).fill('4'); await bar.getByLabel('線の太さ', { exact: true }).press('Tab'); await settle();
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 850 }); await settle();
  await page.keyboard.press(mod + '+s'); await settle(); await page.reload(); if (await page.locator('#editor-dialog').isVisible()) { await page.locator('#editor-dialog .saved-option').first().click(); await settle(); } assert.deepEqual((await state()).selection, [], 'reload clears transient selection'); assert.equal((await doc()).series[0].style.width, 4, 'reload preserves saved style');
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), 'mobile view does not overflow'); assert.deepEqual(errors, []);
  await page.screenshot({ path: '/private/tmp/graph-multiselect-mobile.png' });
  await browser.close(); await new Promise(resolve => server.close(resolve)); console.log('multiselect-browser.test.cjs: ok');
})().catch(async error => { if (page) await page.screenshot({ path: '/private/tmp/graph-multiselect-failure.png' }).catch(() => {}); if (browser) await browser.close(); server.close(); console.error(error.stack || error); process.exitCode = 1; });
