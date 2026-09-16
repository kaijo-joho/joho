const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const Core = require('../core.js');
const Charts = require('../charts.js');

const root = path.resolve(__dirname, '../../..');
const mime = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((request, response) => {
  const file = path.join(root, path.normalize(decodeURIComponent(request.url.split('?')[0])).replace(/^[/\\]+/, ''));
  if (!file.startsWith(root)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, data) => { response.writeHead(error ? 404 : 200, { 'Content-Type': mime(file) }); response.end(error ? 'not found' : data); });
});
let browser;

function fixture() {
  const document = Core.createDocument(), series = Core.createSeries('data2d'), regression = Core.createAnnotation('regression');
  series.id = 'fixture-data'; series.name = '実験データ'; series.rows = [[1, 2], [2, 4], [3, 6]]; series.dataTable = { columns: ['時間', '値', '備考'], rows: [[1, 2, 10], [2, 4, 20], [3, 6, 30]], mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null } };
  regression.id = 'fixture-fit'; regression.seriesId = series.id; regression.model = 'linear';
  document.name = '保存前の図'; document.series = [series]; document.annotations = [regression];
  document.charts = [{ ...Charts.create('scatter', { seriesId: series.id, xColumn: 0, yColumn: 1, model: 'linear' }), id: 'fixture-chart' }];
  document.comparison = { columns: 2, items: ['main', 'fixture-chart'] };
  return Core.validateDocument(document);
}

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  const page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  const waitReady = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const submit = async () => { await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open && !GraphEditor.getState().drawing); };
  const templateName = name => page.locator('#custom-template-list [data-template-id]').filter({ hasText: name });

  await page.goto(url); await waitReady();
  await page.setInputFiles('#file-input', { name: 'fixture.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture())) }); await waitReady();
  const beforeTemplate = await doc();
  await page.locator('#templates-tab').click(); await page.locator('#save-template').click();
  await page.getByLabel('テンプレート名', { exact: true }).fill('授業用テンプレート');
  await page.getByLabel('説明', { exact: true }).fill('数表と分析グラフの確認');
  await page.getByLabel('保存先', { exact: true }).selectOption('both');
  const downloadPromise = page.waitForEvent('download'); await submit();
  const download = await downloadPromise; assert.match(download.suggestedFilename(), /\.graph-template\.json$/);
  const exported = JSON.parse(fs.readFileSync(await download.path(), 'utf8'));
  assert.equal(exported.format, 'kaijo-graph-template'); assert.equal(exported.document.charts.length, 1); assert.equal(exported.document.series[0].rows.length, 3);
  assert.equal(await page.locator('#custom-template-list [data-template-id]').count(), 1);
  const savedLibrary = await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-graph:templates')));
  assert.equal(savedLibrary.items.length, 1);

  await page.locator('#template-list .template-card').filter({ has: page.locator('strong', { hasText: '2次関数と係数 a' }) }).click(); await waitReady();
  const beforeTemplateOpen = await doc();
  await page.locator('#custom-template-list [data-template-id]').click(); await waitReady();
  await page.locator('#undo').click(); await waitReady(); assert.deepEqual(await doc(), beforeTemplateOpen, 'テンプレートを開く操作をUndoできる');
  const itemId = await page.locator('#custom-template-list [data-template-id]').getAttribute('data-template-id');
  await page.getByRole('button', { name: '授業用テンプレートの管理', exact: true }).click();
  await page.getByLabel('テンプレート名', { exact: true }).fill('変更済みテンプレート'); await page.getByLabel('説明', { exact: true }).fill('変更した説明'); await submit();
  assert(await templateName('変更済みテンプレート').count());
  await page.getByRole('button', { name: '変更済みテンプレートの管理', exact: true }).click();
  const manageDownload = page.waitForEvent('download'); await page.getByRole('button', { name: 'テンプレートをファイルに保存', exact: true }).click(); const managed = await manageDownload; assert.match(managed.suggestedFilename(), /\.graph-template\.json$/);
  await page.locator('#editor-dialog details summary').click(); assert(await page.getByRole('button', { name: '削除する', exact: true }).isVisible()); await page.locator('#dialog-cancel').click();

  await page.setInputFiles('#template-input', { name: 'copy.graph-template.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(exported)) }); await page.waitForFunction(() => document.querySelectorAll('#custom-template-list [data-template-id]').length === 2);
  assert.equal(await page.locator('#custom-template-list [data-template-id]').count(), 2, '同じテンプレートを再importしても別IDになる');
  const currentBeforeBadImport = await doc(), libraryBeforeBadImport = await page.evaluate(() => localStorage.getItem('kaijo-graph:templates'));
  await page.setInputFiles('#template-input', { name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') }); await waitReady();
  assert.deepEqual(await doc(), currentBeforeBadImport); assert.equal(await page.evaluate(() => localStorage.getItem('kaijo-graph:templates')), libraryBeforeBadImport, '不正importで図とライブラリを保持する');
  await page.reload(); await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing); if (await page.locator('#editor-dialog').isVisible()) await page.locator('#dialog-close').click(); await waitReady(); await page.locator('#templates-tab').click(); assert.equal(await page.locator('#custom-template-list [data-template-id]').count(), 2, 'reload後も自作テンプレートを保持する');

  await templateName('授業用テンプレート').last().click(); await waitReady();
  await page.locator('#save-template').click(); await page.getByLabel('テンプレート名', { exact: true }).fill('数値なしUI'); await page.getByLabel('説明', { exact: true }).fill('列を残す'); await page.getByLabel('数表の数値も含める', { exact: true }).uncheck(); await page.getByLabel('保存先', { exact: true }).selectOption('browser'); await submit();
  const noData = await page.evaluate(() => localStorage.getItem('kaijo-graph:templates'));
  const noDataEntry = JSON.parse(noData).items.find(item => item.name === '数値なしUI');
  assert.deepEqual(noDataEntry.document.series[0].dataTable.rows, []); assert.deepEqual(noDataEntry.document.series[0].dataTable.columns, beforeTemplate.series[0].dataTable.columns); assert.deepEqual(noDataEntry.document.comparison, beforeTemplate.comparison); assert.equal(noDataEntry.document.charts[0].seriesId, 'fixture-data');

  await page.setViewportSize({ width: 390, height: 820 }); await page.waitForTimeout(100); assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  await page.locator('#save-template').focus(); await page.keyboard.press('Enter'); assert(await page.locator('#editor-dialog').isVisible()); await page.keyboard.press('Escape'); assert(!(await page.locator('#editor-dialog').isVisible()));
  await page.locator('#custom-template-list [data-template-id]').first().tap(); await waitReady();
  assert.equal(await page.locator('#templates-tab').getAttribute('aria-expanded'), 'false');
  assert.deepEqual(errors, []);
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph template-library-browser.test.cjs: ok');
})().catch(async error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => {}); await new Promise(resolve => server.close(() => resolve())); });
