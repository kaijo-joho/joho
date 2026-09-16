/* Chrome regression for the compact object list and selection controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(error ? 'not found' : data); });
});
let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const item = id => page.locator('[data-object-id="' + id + '"]');
  const details = (type, id) => page.locator('[data-object-details="' + type + ':' + id + '"]');
  const dialog = page.locator('#editor-dialog');
  const fill = (label, value) => dialog.getByLabel(label, { exact: true }).fill(String(value));
  const submit = async () => { await page.locator('#dialog-submit').click(); await settle(); };
  const selected = () => page.evaluate(() => GraphEditor.getState().selected);
  const bar = page.locator('#selection-toolbar');
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`); await settle();

  const series = (await doc()).series[0].id;
  assert.equal(await page.locator('#series-list .object-row').count(), 1);
  await item(series).click();
  const width = bar.getByLabel('線の太さ', { exact: true });
  const dash = bar.getByLabel('線種', { exact: true });
  assert(await width.isVisible()); assert(await dash.isVisible());
  await width.fill('4'); await width.press('Tab'); await settle();
  await dash.selectOption('dash'); await settle();
  assert.equal((await doc()).series[0].style.width, 4); assert.equal((await doc()).series[0].style.dash, 'dash');
  for (const label of ['この曲線上に点', 'この曲線の接線', 'この曲線との交点', 'この接線との交点', '選択を解除']) assert.equal(await bar.getByRole('button', { name: label, exact: true }).count(), 0, label + ' is no longer in the selection bar');

  const seriesDetails = details('series', series); assert.equal(await seriesDetails.count(), 1);
  await seriesDetails.click(); await dialog.waitFor({ state: 'visible' }); await fill('名前', '放物線'); await submit();
  assert(await seriesDetails.evaluate(el => el === document.activeElement), 'applying series edits restores focus to its details button after the list rerenders');

  await page.locator('#add-data').click(); await fill('名前', '観測値'); await dialog.getByLabel(/^数表（/).fill('x,y\n0,1\n1,2'); await submit();
  const data = (await doc()).series.at(-1).id;
  await details('series', data).click(); await dialog.waitFor({ state: 'visible' }); assert(await dialog.getByText('数表', { exact: false }).count()); await page.locator('#dialog-cancel').click();
  assert(await details('series', data).evaluate(el => el === document.activeElement), 'data details returns focus to dots button');

  await item(series).click(); await page.locator('#add-point').click(); await fill('名前', 'P'); await fill('位置（x / t / theta の値）', '1'); await submit();
  const point = (await doc()).annotations.at(-1).id;
  await details('annotation', point).click(); await dialog.waitFor({ state: 'visible' }); assert(await dialog.getByLabel('位置（x / t / theta の値）', { exact: true }).isVisible()); await page.locator('#dialog-cancel').click();
  assert(await details('annotation', point).evaluate(el => el === document.activeElement), 'annotation editor restores focus to dots button');

  await item(series).click(); await width.fill('5');
  const plot = page.locator('#plot'); const box = await plot.boundingBox();
  await page.mouse.click(box.x + box.width - 12, box.y + box.height - 12); await page.waitForFunction(() => GraphEditor.getState().selected === null);
  assert.equal((await doc()).series.find(s => s.id === series).style.width, 5, 'blank click commits an in-progress line-width edit');
  await item(series).click();
  const panStart = await page.evaluate(() => GraphPlot.screenPoint(document.querySelector('#plot'), [-3, -1]));
  const beforePan = (await doc()).axes.x;
  await page.mouse.move(...panStart); await page.mouse.down(); await page.mouse.move(panStart[0] + 25, panStart[1] - 15, { steps: 3 }); await page.mouse.up(); await settle();
  assert.equal((await selected()).id, series, 'panning preserves the selection');
  assert.notDeepEqual((await doc()).axes.x, beforePan, 'dragging the plot actually changes the view');
  await item(data).click();
  const curvePoint = await page.evaluate(() => GraphPlot.screenPoint(document.querySelector('#plot'), [2, 4]));
  await page.mouse.click(curvePoint[0], curvePoint[1]);
  await page.waitForFunction(id => GraphEditor.getState().selected?.id === id, series);

  await page.setViewportSize({ width: 390, height: 850 }); await page.waitForTimeout(200); await page.locator('#list-toggle').tap();
  await details('series', series).tap(); await dialog.waitFor({ state: 'visible' }); await page.locator('#dialog-cancel').click();
  assert(await details('series', series).evaluate(el => el === document.activeElement));
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  assert.deepEqual(errors, []);
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph selection-browser.test.cjs: ok');
})().catch(async error => { if (page) await page.screenshot({ path: '/private/tmp/graph-selection-failure.png' }).catch(() => {}); if (browser) await browser.close(); server.close(); console.error(error.stack || error); process.exitCode = 1; });
