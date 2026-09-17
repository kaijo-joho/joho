/* Chrome UI checks for the science templates and the bundled data catalog. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const mime = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((request, response) => {
  const file = path.join(root, path.normalize(decodeURIComponent(request.url.split('?')[0])).replace(/^[/\\]+/, ''));
  if (!file.startsWith(root)) { response.writeHead(403); return response.end(); }
  fs.readFile(file, (error, data) => { response.writeHead(error ? 404 : 200, {'Content-Type': mime(file)}); response.end(error ? 'not found' : data); });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const context = await browser.newContext({viewport: {width: 1280, height: 850}, hasTouch: true});
  context.setDefaultTimeout(10000);
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(url); await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const openTemplate = async name => {
    if (await page.locator('#templates-panel').isHidden()) await page.locator('#templates-tab').click();
    await page.locator('#template-list .template-card').filter({hasText: name}).first().click();
    await page.waitForFunction(() => !GraphEditor.getState().drawing);
    await page.waitForTimeout(120);
  };
  const openImport = async () => {
    if (!(await page.locator('#templates-panel').isHidden())) await page.locator('#templates-tab').click();
    if (!(await page.locator('#series-add-toggle').isVisible())) await page.locator('#list-toggle').click();
    if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click();
    await page.locator('#import-csv').click(); await page.locator('#editor-dialog[open]').waitFor();
  };
  assert.equal((await page.evaluate(() => GraphEditor.getTemplates().length)), 26, '標準テンプレート26件');

  await openTemplate('水の状態図');
  let current = await doc();
  assert.equal(current.axes.y.scale, 'log');
  assert.equal(current.series.filter(s => s.id.startsWith('water-')).length, 3);
  assert.deepEqual(current.annotations.filter(a => /water-(triple|critical|atmosphere)/.test(a.id)).map(a => a.id).sort(), ['water-atmosphere', 'water-critical', 'water-triple']);
  assert(current.series.every(s => s.rows.length > 100));
  const waterLayout = await page.locator('#plot').evaluate(el => ({annotations: el.layout.annotations, data: el.data}));
  const waterGuide = waterLayout.annotations.find(a => a.name === 'water-atmosphere');
  assert(waterGuide, '水の1気圧ガイド');
  assert(Math.abs(waterGuide.y - Math.log10(0.101325)) < 1e-12, '対数軸のガイド位置');
  for (const id of ['water-triple', 'water-critical']) {
    const anchor = current.annotations.find(a => a.id === id).anchor;
    const label = waterLayout.annotations.find(a => a.name === id);
    assert(Math.abs(label.y - Math.log10(Number(anchor.y))) < 1e-12, id + ' ラベル位置');
  }
  const roundTrip = await page.locator('#plot').evaluate(el => {
    const p = [0.01, .000611657];
    const screen = GraphPlot.screenPoint(el, p);
    return { screen, point: screen && GraphPlot.dataPoint(el, screen), xPixelsPerUnit: el._fullLayout.xaxis._length / 520, yPixelsPerDecade: el._fullLayout.yaxis._length / (Math.log10(50) + 7) };
  });
  assert(roundTrip.point, '対数軸の画面座標を戻せる');
  // Plotly d2p は0.01px単位に丸める。データ値での完全一致ではなく画面精度を確認する。
  assert(Math.abs(roundTrip.point[0] - .01) * roundTrip.xPixelsPerUnit < .011, JSON.stringify(roundTrip));
  assert(Math.abs(Math.log10(roundTrip.point[1] / .000611657)) * roundTrip.yPixelsPerDecade < .011, JSON.stringify(roundTrip));
  const exportedSVG = await page.locator('#plot').evaluate(async el => {
    const result = await GraphPlot.exportImage(el, {format: 'svg', width: 1200, height: 800, background: 'white', title: true});
    return decodeURIComponent(result.slice(result.indexOf(',') + 1));
  });
  assert.match(exportedSVG, /<svg/); assert.match(exportedSVG, /臨界点/); assert.match(exportedSVG, /1気圧/); assert(!exportedSVG.includes('NaN'));
  const waterTrace = waterLayout.data.find(t => t.meta?.objectId === 'water-vapor');
  assert(waterTrace && waterTrace.y.some(value => value > 0 && value < 1), '曲線のy値は通常の圧力値');
  await page.locator('#toast').waitFor({state: 'hidden'});
  await page.screenshot({path: path.join(os.tmpdir(), 'graph-science-water.png'), fullPage: true});
  const beforeUndo = current;
  await page.locator('#undo').click(); await page.waitForFunction(() => GraphEditor.getDocument().name !== '水の状態図（計算値）');
  await page.locator('#redo').click(); await page.waitForFunction(() => GraphEditor.getDocument().name === '水の状態図（計算値）');
  assert.equal((await doc()).series.length, beforeUndo.series.length);

  await openTemplate('二酸化炭素の状態図');
  current = await doc(); assert.equal(current.axes.y.scale, 'log');
  assert.equal(current.series.filter(s => s.id.startsWith('co2-')).length, 3);
  const co2Layout = await page.locator('#plot').evaluate(el => ({annotations: el.layout.annotations, data: el.data}));
  const co2Guide = co2Layout.annotations.find(a => a.name === 'co2-atmosphere');
  assert(co2Guide && Math.abs(co2Guide.y - Math.log10(0.101325)) < 1e-12);
  assert(co2Layout.data.some(t => t.meta?.objectId === 'co2-vapor' && t.y.some(value => value > 0)));
  await page.locator('#toast').waitFor({state: 'hidden'});
  await page.screenshot({path: path.join(os.tmpdir(), 'graph-science-co2.png'), fullPage: true});

  await openTemplate('単振動（変位と時間）');
  const parameter = page.locator('#parameter-list [type=range]').first();
  assert.equal(await parameter.count(), 1);
  const parameterBefore = (await doc()).parameters[0].value;
  await parameter.tap(); await parameter.press('ArrowRight'); await parameter.dispatchEvent('change');
  await page.waitForFunction(value => GraphEditor.getDocument().parameters[0].value !== value, parameterBefore);
  assert.notEqual((await doc()).parameters[0].value, parameterBefore);

  for (const id of ['jma-tokyo-normal-1991-2020', 'jma-sapporo-normal-1991-2020', 'jma-naha-normal-1991-2020', 'nasa-planets-metric']) {
    const before = (await doc()).series.length;
    await openImport();
    await page.getByLabel('データを検索', {exact: true}).fill(id.startsWith('nasa') ? '惑星' : id.includes('sapporo') ? '札幌' : id.includes('naha') ? '那覇' : '東京');
    assert.equal(await page.locator('[data-catalog-id]').count(), 1);
    await page.locator(`[data-catalog-id="${id}"]`).click(); await page.locator('[data-import-summary]').waitFor();
    assert.equal(await page.locator('#dialog-submit').isDisabled(), false, id);
    assert(await page.locator('.data-import-citation').getByRole('link').count() >= 1, id + ' 出典');
    await page.locator('#dialog-submit').click(); await page.waitForFunction(count => GraphEditor.getDocument().series.length === count + 1, before);
    current = await doc(); assert.equal(current.series.at(-1).source.kind, 'reference');
    assert(current.series.at(-1).source.notes.includes('固定スナップショット'));
  }

  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.keyboard.press('Escape');
  await page.setViewportSize({width: 390, height: 820}); await page.waitForTimeout(120);
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth), '390pxで横スクロールしない');
  await openTemplate('二酸化炭素の状態図');
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  assert.equal(await page.locator('#plot').evaluate(el => el.layout.legend.orientation), 'h', '狭い画面では凡例を下へ移す');
  assert(await page.locator('#plot').evaluate(el => el._fullLayout.xaxis._length > 200), '凡例で状態図が細くならない');
  await page.locator('#toast').waitFor({state: 'hidden'});
  await page.screenshot({path: path.join(os.tmpdir(), 'graph-science-mobile-dark.png'), fullPage: true});
  await openImport();
  await page.locator('[data-catalog-id="nasa-planets-metric"]').tap(); await page.locator('[data-import-summary]').waitFor();
  await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open);
  assert.deepEqual(errors, []);
  console.log('science-templates-browser.test.cjs: ok');
})().catch(error => { console.error(error.stack || error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close().catch(() => {}); await new Promise(resolve => server.close(() => resolve())); });
