const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(error ? 'not found' : data); });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  const page = await context.newPage();
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`);
  await page.waitForFunction(() => window.GraphTableEditor && window.GraphTables);
  const original = await page.evaluate(() => {
    const series = GraphCore.createSeries('data2d'); series.id = 'draft-data'; series.rows = Array.from({ length: 105 }, (_, i) => [i, i === 0 ? null : i * 2]); series.excludedRows = [1, 55, 101];
    const host = document.createElement('div'); host.id = 'table-test-host'; document.body.append(host); window.__sourceSeries = series;
    window.__tableTest = GraphTableEditor.mount(host, series, { selectedRow: 55, onRowSelect: index => { window.__selectedRow = index; } });
    return { rows: series.rows.length, excludedRows: series.excludedRows.slice(), selectedRow: window.__tableTest.getSelectedRow() };
  });
  assert.deepEqual(original, { rows: 105, excludedRows: [1, 55, 101], selectedRow: 55 });
  assert.equal(await page.locator('.graph-table-editor__focused-row').getAttribute('class'), 'graph-table-editor__focused-row');
  assert.equal(await page.locator('.graph-table-editor__pager span').innerText(), '51〜100行 / 105行');
  assert.equal(await page.locator('.graph-table-editor__regression-checkbox[aria-label="56行目を回帰に使用"]').isChecked(), false);

  await page.locator('.graph-table-editor__regression-checkbox[aria-label="56行目を回帰に使用"]').check();
  assert.deepEqual(await page.evaluate(() => __tableTest.getExcludedRows()), [1, 101]);
  await page.locator('.graph-table-editor__regression-tools summary').click(); await page.locator('input[aria-label="57行目を選択"]').check(); await page.locator('input[aria-label="58行目を選択"]').check();
  await page.getByRole('button', { name: '選択行を回帰から除外', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __tableTest.getExcludedRows()), [1, 56, 57, 101]);
  await page.locator('.graph-table-editor__regression-tools summary').click(); await page.getByRole('button', { name: '選択行を回帰に使用', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __tableTest.getExcludedRows()), [1, 101]);
  await page.locator('input[aria-label="57行目を選択"]').uncheck(); await page.locator('input[aria-label="58行目を選択"]').uncheck();

  await page.locator('input[aria-label="56行目を選択"]').check(); await page.getByRole('button', { name: '次の50行', exact: true }).click(); await page.locator('input[aria-label="101行目を選択"]').check();
  await page.locator('.graph-table-editor__row-menu summary').click(); await page.getByRole('button', { name: '選択行を削除', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __tableTest.getExcludedRows()), [1, 99], '削除行を除いてmaskを新indexへremap');
  assert.equal(await page.locator('.graph-table-editor__pager span').innerText(), '101〜103行 / 103行');

  await page.locator('.graph-table-editor__import summary').click(); await page.getByLabel('CSV・TSVを貼り付け', { exact: true }).fill('x,y\n1,2\n2,4'); await page.getByRole('button', { name: '表に取り込む', exact: true }).click();
  assert.deepEqual(await page.evaluate(() => __tableTest.getExcludedRows()), []); assert.equal(await page.locator('.graph-table-editor__pager span').innerText(), '1〜2行 / 2行');
  assert.equal(await page.evaluate(() => __tableTest.read().rows[0][1]), 2);

  await page.evaluate(() => { __tableTest.focusRow(0); });
  assert.equal(await page.evaluate(() => __tableTest.getSelectedRow()), 0, '空欄を含む先頭行でも0をnullと混同しない');
  assert.equal(await page.evaluate(() => window.__selectedRow), 0); assert.equal(await page.locator('.graph-table-editor__focused-row th').innerText(), '1');
  const sourceBeforeDraftCommit = await page.evaluate(() => ({ rows: window.__sourceSeries.rows, excludedRows: window.__sourceSeries.excludedRows }));
  const threeD = await page.evaluate(() => {
    const series = GraphCore.createSeries('data3d'); series.rows = [[1, 2, 3]]; const host = document.createElement('div'); document.body.append(host); const editor = GraphTableEditor.mount(host, series); return { excluded: editor.getExcludedRows(), checkbox: !!host.querySelector('[aria-label="1行目を回帰に使用"]') };
  });
  assert.deepEqual(threeD, { excluded: [], checkbox: true }); assert.deepEqual(sourceBeforeDraftCommit, { rows: Array.from({ length: 105 }, (_, i) => [i, i === 0 ? null : i * 2]), excludedRows: [1, 55, 101] });
  await browser.close(); browser = null; await new Promise(resolve => server.close(resolve));
  console.log('graph table-editor excluded rows browser test passed');
})().catch(async error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => {}); await new Promise(resolve => server.close(() => resolve())); });
