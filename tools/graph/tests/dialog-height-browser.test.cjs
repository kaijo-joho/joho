const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const C = require('../core.js');
const T = require('../tables.js');
const Charts = require('../charts.js');
const Toolbar = require('./toolbar-helpers.cjs');
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200); res.end(error ? 'not found' : data); });
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1320, height: 950 } });
  page.setDefaultTimeout(15000);
  const dialog = page.locator('#editor-dialog');
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const tabs = () => dialog.getByRole('tab');
  const rect = selector => selector === 'dialog'
    ? dialog.evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height }; })
    : dialog.locator(selector).evaluate(el => { const r = el.getBoundingClientRect(); return { top: r.top, height: r.height }; });
  const assertStable = async names => {
    const before = await rect('dialog');
    for (const name of names) {
      await dialog.getByRole('tab', { name, exact: true }).click();
      const after = await rect('dialog');
      assert(Math.abs(after.top - before.top) < 1, `${name}: dialog top moved`);
      assert(Math.abs(after.height - before.height) < 1, `${name}: dialog height moved`);
    }
    assert(await dialog.locator('#dialog-content').evaluate(el => el.scrollHeight >= el.clientHeight));
    assert(await dialog.locator('.dialog-actions').evaluate(el => { const r = el.getBoundingClientRect(); return r.bottom <= innerHeight && r.height > 0; }));
  };
  try {
    await page.goto(process.env.GRAPH_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/tools/graph/index.html'); await settle();
    const fixture = C.createDocument();
    const series = C.createSeries('data2d'); series.id = 'measure'; series.name = '測定値';
    T.assign(series, { columns: ['時刻', '位置'], rows: [[0, 1], [1, 3], [2, 5]], mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null } });
    fixture.series = [series];
    const chart = Charts.create('scatter', { seriesId: series.id, name: '散布図', model: 'linear' }); chart.id = 'scatter'; fixture.charts = [chart];
    await page.locator('#file-input').setInputFiles({ name: 'height.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture)) });
    await page.waitForFunction(() => GraphEditor.getDocument().series.length === 1); await settle();

    await page.locator('[data-object-id="measure"]').click();
    await page.locator('#selection-toolbar').getByRole('button', { name: '数表・出典', exact: true }).click();
    assert.equal(await tabs().count(), 3); await assertStable(['描画', '出典', '数表']);
    await page.locator('#dialog-cancel').click(); await dialog.waitFor({ state: 'hidden' });

    await Toolbar.openAxes(page); await assertStable(['軸名', '目盛・表示', '範囲']);
    await page.locator('#dialog-cancel').click(); await dialog.waitFor({ state: 'hidden' });

    await page.locator('[data-object-id="scatter"]').click();
    await page.locator('#selection-toolbar').getByRole('button', { name: '分析グラフの設定', exact: true }).click();
    await assertStable(['軸', '書式', 'データ']);
    await page.locator('#dialog-cancel').click(); await dialog.waitFor({ state: 'hidden' });

    await page.locator('#series-add-toggle').click(); await page.locator('#add-parameter').click();
    const shortHeight = await rect('dialog');
    assert(shortHeight.height < 760, 'non-tab dialog was unnecessarily enlarged');
    await page.locator('#dialog-cancel').click();

    await Toolbar.openSettings(page); await page.locator('[data-theme-value="dark"]').click(); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 390, height: 900 }); await settle();
    await page.locator('#list-toggle').click(); await page.locator('[data-object-id="measure"]').click(); await page.locator('#selection-toolbar').getByRole('button', { name: '数表・出典', exact: true }).click();
    await assertStable(['数表', '描画', '出典']);
    assert(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
    console.log('dialog-height-browser.test.cjs: ok');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
