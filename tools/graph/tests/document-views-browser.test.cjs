/* Chrome: 文書タブごとの作図・分析・比較表示範囲を保持する。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const Core = require('../core.js');
const Charts = require('../charts.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const server = http.createServer((request, response) => {
  const file = path.resolve(root, '.' + decodeURIComponent(request.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, data) => response.end(error ? 'not found' : data));
});
let browser;

function fixture(name) {
  const document = Core.createDocument();
  document.name = name; document.mode = '3d';
  const surface = Core.createSeries('surface'); surface.id = 'shared-surface'; surface.name = 'z = x² + y²'; surface.expression = 'z = x^2 + y^2'; surface.domain = { x: [-3, 3], y: [-3, 3] };
  const data = Core.createSeries('data2d'); data.id = 'shared-data'; data.name = '測定値'; data.rows = [[0, 1], [1, 3], [2, 5]];
  data.dataTable = { columns: ['x', 'y'], rows: [[0, 1], [1, 3], [2, 5]], mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null } };
  const chart = Charts.create('scatter', { seriesId: data.id, xColumn: 0, yColumn: 1, name: '共通IDの散布図' }); chart.id = 'shared-chart';
  document.series = [surface, data]; document.charts = [chart]; document.comparison = { columns: 2, items: ['main', chart.id] };
  return Core.validateDocument(document);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, acceptDownloads: true });
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const ready = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  async function openDisplay() { const menu = page.locator('#display-menu'); if (!await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click(); }
  async function selectView(value) { await openDisplay(); await page.locator('#workspace-view').selectOption(value); await ready(); }
  const state = () => page.evaluate(() => GraphEditor.getState());
  const range = selector => page.locator(selector).evaluate(el => el._fullLayout.xaxis.range.slice());
  const comparisonRange = () => page.locator('#comparison-stage > .comparison-card > .comparison-plot').nth(1).evaluate(el => el._fullLayout.xaxis.range.slice());
  const camera = () => page.locator('#plot').evaluate(el => ({ ...el._fullLayout.scene.camera.eye }));
  const relayout = (selector, values) => page.evaluate(async ({ selector, values }) => Plotly.relayout(document.querySelector(selector), values), { selector, values });
  const relayoutComparison = values => page.evaluate(async values => Plotly.relayout(document.querySelectorAll('#comparison-stage > .comparison-card > .comparison-plot')[1], values), values);
  async function load(document, fileName) { await page.setInputFiles('#file-input', { name: fileName, mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(document)) }); await ready(); }
  async function activate(id) { await page.locator(`[role="tab"][data-document-tab-id="${id}"]`).click(); await ready(); assert.equal((await state()).tabId, id); }

  await page.goto(url); await ready();
  await load(fixture('文書A'), 'a.graph.json');
  const a = (await state()).tabId, originalA = await page.evaluate(() => GraphEditor.getDocument());
  await relayout('#plot', { 'scene.camera': { eye: { x: 1.8, y: 0.7, z: 2.4 } } });
  const cameraA = await camera();
  await selectView('shared-chart'); await page.waitForSelector('#analysis-plot .main-svg');
  await relayout('#analysis-plot', { 'xaxis.range': [10, 20] }); const analysisA = await range('#analysis-plot');
  await selectView('comparison'); await page.waitForFunction(() => document.querySelectorAll('#comparison-stage > .comparison-card > .comparison-plot').length === 2 && !!document.querySelectorAll('#comparison-stage > .comparison-card > .comparison-plot')[1]._fullLayout);
  await relayoutComparison({ 'xaxis.range': [100, 200] }); const comparisonA = await comparisonRange();

  await load(fixture('文書B'), 'b.graph.json');
  const b = (await state()).tabId;
  assert.notEqual(b, a); assert.equal((await state()).tabs.length, 3, 'ファイル読込は既存文書を残す新規タブ');
  await relayout('#plot', { 'scene.camera': { eye: { x: -1.5, y: 2.2, z: 1.1 } } }); const cameraB = await camera();
  await selectView('shared-chart'); await page.waitForSelector('#analysis-plot .main-svg');
  await relayout('#analysis-plot', { 'xaxis.range': [30, 40] }); const analysisB = await range('#analysis-plot');
  await selectView('comparison'); await page.waitForFunction(() => document.querySelectorAll('#comparison-stage > .comparison-card > .comparison-plot').length === 2 && !!document.querySelectorAll('#comparison-stage > .comparison-card > .comparison-plot')[1]._fullLayout);
  await relayoutComparison({ 'xaxis.range': [300, 400] }); const comparisonB = await comparisonRange();

  await activate(a); assert.equal((await state()).workspaceView, 'comparison'); assert.deepEqual(await comparisonRange(), comparisonA, '同一chart IDでも文書Aの比較範囲を戻す');
  await selectView('shared-chart'); assert.deepEqual(await range('#analysis-plot'), analysisA, '文書Aの分析範囲を戻す');
  await activate(b); assert.equal((await state()).workspaceView, 'comparison'); assert.deepEqual(await comparisonRange(), comparisonB, '文書Bの比較範囲を混ぜない');
  await selectView('shared-chart'); assert.deepEqual(await range('#analysis-plot'), analysisB, '文書Bの分析範囲を混ぜない');
  await selectView('main'); assert.deepEqual(await camera(), cameraB, '文書Bの3D回転・倍率を戻す');
  await activate(a); await selectView('main'); assert.deepEqual(await camera(), cameraA, '文書Aの3D回転・倍率を戻す');
  assert.deepEqual(await page.evaluate(() => GraphEditor.getDocument()), originalA, '表示操作は文書内容を変更しない');
  assert.deepEqual(errors, []);

  const touch = await browser.newContext({ viewport: { width: 390, height: 850 }, isMobile: true, hasTouch: true });
  const touchPage = await touch.newPage(); await touchPage.goto(url); await touchPage.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  await touchPage.locator('#view-menu > summary').click(); await touchPage.locator('#text-size').selectOption('largest');
  const sizes = await touchPage.evaluate(() => ({ coarse: matchMedia('(pointer:coarse)').matches, overflow: document.documentElement.scrollWidth > innerWidth, documentTab: document.querySelector('[role="tab"]').getBoundingClientRect().height, sideTab: document.querySelector('.side-tabs button').getBoundingClientRect().width, strip: getComputedStyle(document.querySelector('.graph-document-tabs__strip')).overflowX }));
  assert.equal(sizes.overflow, false, '390px・特大文字でも横にはみ出さない'); assert.equal(sizes.strip, 'auto');
  if (sizes.coarse) { assert(sizes.documentTab >= 44); assert(sizes.sideTab >= 44); }
  await touch.close();
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('document-views-browser.test.cjs: ok');
})().catch(async error => { console.error(error.stack || error); if (browser) await browser.close(); server.close(); process.exitCode = 1; });
