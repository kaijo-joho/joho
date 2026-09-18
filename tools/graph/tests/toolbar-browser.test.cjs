/* 上部共通仕様: 寸法、グラフ表示の移設、ホバー/キー/タッチ、狭幅。 */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const C = require('../core.js'), T = require('../tables.js'), Charts = require('../charts.js');
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html'}); res.end(error ? 'not found' : data); });
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 950}}), errors = [];
  page.setDefaultTimeout(10000); page.on('pageerror', error => errors.push(error.message));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  const topBox = () => page.locator('.top').boundingBox();
  async function openMenu(id) {
    const menu = page.locator('#' + id);
    if (!await menu.isVisible()) await openMenu('toolbar-more');
    if (!await menu.evaluate(el => el.open)) await menu.locator(':scope > summary').click();
  }
  async function assertFits() {
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    const result = await page.evaluate(() => {
      const top = document.querySelector('.top'), box = top.getBoundingClientRect();
      const children = [...top.children].filter(el => el.getClientRects().length).map(el => ({id: el.id || el.className, r: el.getBoundingClientRect()}));
      return {overflow: document.documentElement.scrollWidth > innerWidth, outside: children.filter(({r}) => r.left < 0 || r.right > innerWidth + .5 || r.top < box.top || r.bottom > box.bottom + .5).map(x => x.id)};
    });
    assert.equal(result.overflow, false); assert.deepEqual(result.outside, []);
  }
  await page.goto(url); await settle();
  assert(await page.locator('.brand img').evaluate(el => el.complete && el.naturalWidth > 0));
  assert.equal(await page.locator('.stage-heading').count(), 0);
  assert.equal(await page.locator('#undo-menu,#redo-menu,#axes-menu,#reset-view').count(), 0);
  assert.equal(await page.locator('.top #document-tabs').count(), 1);
  assert.equal(await page.locator('.brand').getAttribute('href'), '../index.html');
  assert(Math.abs((await topBox()).height - 41) < .5);
  const undoBox = await page.locator('#undo').boundingBox();
  assert.equal(undoBox.width, 32); assert.equal(undoBox.height, 30);
  assert(Math.abs((await page.locator('#stage').boundingBox()).y - 41) < .5);
  const order = ['.brand', '#file-menu', '#undo', '#redo', '#multiple-select', '#display-menu', '#document-tabs', '#view-menu', '#help-button'];
  const xs = await Promise.all(order.map(async selector => (await page.locator(selector).boundingBox()).x));
  assert(xs.every((x, i) => i === 0 || x > xs[i - 1])); await assertFits();

  const original = await page.evaluate(() => GraphEditor.getDocument());
  await page.locator('#stage').focus();
  await page.locator('#file-menu > summary').hover();
  assert(await page.locator('#file-menu').evaluate(el => el.open));
  assert.equal(await page.evaluate(() => document.activeElement.id), 'stage');
  await page.locator('#save-browser').hover();
  assert(await page.locator('#file-menu').evaluate(el => el.open));
  assert.deepEqual(await page.evaluate(() => GraphEditor.getDocument()), original, 'hover never changes a graph');
  assert.equal(await page.evaluate(() => new GraphDocumentStore.Store(localStorage).list().entries.filter(entry => entry.kind === 'saved').length), 0, 'hover never saves');
  await page.locator('#save-browser').focus(); await page.mouse.move(800, 800);
  await page.waitForTimeout(300);
  assert(await page.locator('#file-menu').evaluate(el => el.open), 'focused menu stays open');
  await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#file-menu > summary')), true);
  await page.keyboard.press('ArrowDown');
  assert.equal(await page.evaluate(() => document.activeElement.id), 'new-document');
  await page.keyboard.press('Escape');

  await openMenu('view-menu'); await page.locator('#axes-button').click();
  await page.locator('#dialog-cancel').click();
  assert.equal(await page.evaluate(() => document.activeElement === document.querySelector('#view-menu > summary')), true, 'modal returns to visible settings trigger');
  for (const theme of ['dark', 'light', 'auto']) {
    await openMenu('view-menu'); await page.locator(`[data-theme-value="${theme}"]`).click();
    assert.equal(await page.locator('html').getAttribute('data-theme'), theme);
    assert.equal(await page.locator('#theme [aria-pressed="true"]').count(), 1);
  }
  await page.emulateMedia({colorScheme: 'dark'});
  assert.equal(await page.evaluate(() => getComputedStyle(document.documentElement).colorScheme), 'dark');
  for (const [size, height] of [['large', 47], ['largest', 53], ['standard', 41]]) {
    await page.locator('#text-size').selectOption(size);
    assert(Math.abs((await topBox()).height - height) < .6); await assertFits();
  }
  await page.keyboard.press('Escape');
  assert.deepEqual(await page.evaluate(() => GraphEditor.getDocument()), original, 'appearance settings leave the graph unchanged');

  const fixture = C.createDocument(); fixture.name = '測定値と分析の比較';
  const data = C.createSeries('data2d'); data.id = 'data'; data.name = '測定値';
  T.assign(data, {columns: ['時刻', '位置', '温度'], rows: [[0, 1, 20], [1, 3, 21], [2, 5, 22]], mapping: {x: 0, y: 1, z: null, errorX: null, errorY: null}});
  fixture.series = [data];
  const matrix = Charts.create('matrix', {seriesId: data.id, name: '測定値の散布図行列', columns: [0, 1, 2]}); matrix.id = 'matrix'; fixture.charts = [matrix];
  fixture.comparison = {columns: 2, items: ['main', matrix.id]};
  await page.locator('#file-input').setInputFiles({name: 'toolbar.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture))}); await settle();
  await openMenu('display-menu'); await page.locator('#workspace-view').selectOption(matrix.id); await settle();
  assert.equal(await page.evaluate(() => GraphEditor.getState().workspaceView), matrix.id);
  await openMenu('display-menu'); await page.locator('#comparison-settings').click();
  await page.locator('#dialog-submit').click(); await settle();
  assert.equal(await page.locator('.comparison-card').count(), 2);
  await openMenu('display-menu'); await page.locator('#workspace-view').selectOption('main'); await settle();
  assert.equal(await page.locator('#plot').isVisible(), true);
  if (process.env.GRAPH_SCREENSHOT_DIR) await page.screenshot({path: path.join(process.env.GRAPH_SCREENSHOT_DIR, 'graph-toolbar-wide.png')});

  await openMenu('view-menu'); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
  await page.setViewportSize({width: 390, height: 850}); await settle(); await assertFits();
  assert.equal(await page.locator('#toolbar-more-panel #undo').count(), 1);
  assert.equal(await page.locator('#undo').count(), 1);
  await openMenu('toolbar-more'); await openMenu('display-menu');
  assert(await page.locator('#toolbar-more').evaluate(el => el.open), 'parent menu remains open');
  const panelBox = await page.locator('#toolbar-more-panel').boundingBox();
  assert(panelBox.x >= 0 && panelBox.x + panelBox.width <= 390 && panelBox.y + panelBox.height <= 850);
  await page.locator('#workspace-view').selectOption('comparison'); await settle();
  await page.locator('#list-toggle').click();
  assert.equal(await page.locator('#objects').isVisible(), true);
  assert((await page.locator('#objects').boundingBox()).y >= (await topBox()).height);
  await page.locator('#list-close').click();
  if (process.env.GRAPH_SCREENSHOT_DIR) await page.screenshot({path: path.join(process.env.GRAPH_SCREENSHOT_DIR, 'graph-toolbar-narrow.png')});
  await page.locator('#help-button').click(); assert.equal(await page.locator('#operation-help').isVisible(), true);
  assert.deepEqual(errors, []);

  const touch = await browser.newContext({viewport: {width: 390, height: 850}, hasTouch: true});
  const touchPage = await touch.newPage(); await touchPage.goto(url);
  await touchPage.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  for (const selector of ['#file-menu > summary', '#toolbar-more > summary', '#view-menu > summary', '#help-button']) {
    const box = await touchPage.locator(selector).boundingBox(); assert(box.width >= 44 && box.height >= 44);
  }
  await touchPage.locator('#file-menu > summary').tap(); assert(await touchPage.locator('#save-browser').isVisible());
  await touchPage.locator('#view-menu > summary').tap();
  assert.equal(await touchPage.locator('#file-menu').evaluate(el => el.open), false);
  await touchPage.locator('[data-theme-value="dark"]').tap();
  assert.equal(await touchPage.locator('html').getAttribute('data-theme'), 'dark');
  await touch.close();
  console.log('toolbar-browser.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); if (server.listening) await new Promise(resolve => server.close(resolve)); });
