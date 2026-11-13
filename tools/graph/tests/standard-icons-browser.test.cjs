/* Common sprite integration, semantic mappings, and visual states in the graph UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const {chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const C = require('../core.js'), Toolbar = require('./toolbar-helpers.cjs');
const root = path.resolve(__dirname, '../../..');
const screenshots = process.env.GRAPH_ICON_SCREENSHOTS || path.join(os.tmpdir(), 'graph-standard-icons');
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(req.url.split('?')[0]);
  let file = path.resolve(root, '.' + pathname);
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  // Before the shared release, test its owner's candidate without copying or editing it.
  if (process.env.GRAPH_SHARED_DIR && /^\/tools\/shared\/ui-icons\.(js|svg)$/.test(pathname)) file = path.join(process.env.GRAPH_SHARED_DIR, path.basename(pathname));
  fs.readFile(file, (error, data) => {
    res.writeHead(error ? 404 : 200, {'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html'});
    res.end(error ? 'not found' : data);
  });
});
let browser;
(async () => {
  fs.mkdirSync(screenshots, {recursive: true});
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({channel: 'chrome', headless: true});
  const page = await browser.newPage({viewport: {width: 1440, height: 950}}), errors = [], failed = [];
  page.on('pageerror', error => errors.push(error.message));
  page.on('response', response => { if (response.status() >= 400) failed.push(response.url()); });
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  await page.goto(url); await settle();
  const assets = await page.locator('script[src],link[rel="stylesheet"]').evaluateAll(nodes => nodes.map(node => new URL(node.src || node.href)) .map(url => ({name: url.pathname.split('/').pop(), version: url.searchParams.get('v')})));
  for (const name of ['icons.js', 'editor.js', 'document-tabs-ui.js', 'data-import-ui.js', 'editor.css', 'document-tabs.css']) assert.equal(assets.find(asset => asset.name === name)?.version, '0.23.1', name + ' cache version');
  assert.equal(assets.find(asset => asset.name === 'ui-icons.js')?.version, '20261113');
  const original = await page.evaluate(() => GraphEditor.getDocument());
  const mapping = {
    '#file-menu > summary': 'file', '#new-document': 'new', '#save-current': 'save',
    '#save-browser': 'save', '#save-local': 'save', '#open-saved': 'open', '#open-local': 'open',
    '#start-local-auto': 'refresh', '#stop-local-auto': 'stop', '#undo': 'undo', '#redo': 'redo',
    '#display-menu > summary': 'view', '#view-menu > summary': 'settings', '#help-button': 'help',
    '#toolbar-more > summary': 'more', '#zoom-toggle': 'zoom-in', '#fit-button': 'fit',
    '[data-theme-value="auto"]': 'theme-auto', '[data-theme-value="light"]': 'theme-light', '[data-theme-value="dark"]': 'theme-dark',
    '#copy-image': 'copy', '#export-image': 'export', '#export-tab': 'export', '#dialog-close': 'close',
    '.graph-document-tabs__close': 'close'
  };
  for (const [selector, id] of Object.entries(mapping)) {
    const svg = page.locator(selector).first().locator(':scope > svg');
    assert.equal(await svg.getAttribute('data-joho-icon'), id, selector);
    assert.equal(await svg.getAttribute('aria-hidden'), 'true');
    assert.equal(await svg.getAttribute('focusable'), 'false');
    assert.match(await svg.locator('use').getAttribute('href'), new RegExp('/tools/shared/ui-icons\\.svg[^#]*#' + id + '$'));
    assert.equal(await svg.locator('path').count(), 0, 'the graph does not duplicate standard paths');
  }
  assert.equal(await page.locator('#add-parameter svg path').count(), 1, 'parameter adjustments retain the sliders glyph');
  assert.equal(await page.locator('#add-parameter svg').getAttribute('data-joho-icon'), null);
  assert.equal(await page.locator('#undo').isDisabled(), true);
  assert.equal(await page.locator('#redo').isDisabled(), true);
  assert.equal(await page.locator('#stop-local-auto').isDisabled(), true);
  for (const [theme, osTheme] of [['light', 'light'], ['dark', 'light'], ['auto', 'light'], ['auto', 'dark']]) {
    await page.emulateMedia({colorScheme: osTheme});
    await Toolbar.setAppearance(page, {theme}); await settle();
    assert.equal(await page.locator(`[data-theme-value="${theme}"]`).getAttribute('aria-pressed'), 'true');
    await page.keyboard.press('Tab');
    await page.locator('#view-menu > summary').focus();
    await page.waitForFunction(() => document.querySelector('#view-menu > summary svg').getBBox().width > 10);
    const painted = await page.locator('#view-menu > summary svg').evaluate(svg => {
      const style = getComputedStyle(svg), parent = getComputedStyle(svg.parentElement), rect = svg.getBoundingClientRect();
      return {stroke: style.stroke, color: parent.color, width: rect.width, line: style.strokeWidth, focus: svg.parentElement.matches(':focus-visible')};
    });
    assert.equal(painted.stroke, painted.color); assert.equal(painted.width, 22); assert.equal(painted.line, '1.7px'); assert(painted.focus);
    assert.equal((await page.locator('.top').boundingBox()).height, 41);
    await page.screenshot({path: path.join(screenshots, `${theme}-${osTheme}.png`)});
    await page.keyboard.press('Escape');
  }
  assert.deepEqual(await page.evaluate(() => GraphEditor.getDocument()), original, 'theme selection never edits the graph');
  await page.locator('#file-menu > summary').click();
  await page.screenshot({path: path.join(screenshots, 'file-menu-disabled.png')});
  await page.keyboard.press('Escape');
  const fixture = C.createDocument(), curve = C.createSeries();
  fixture.name = 'アイコン操作確認'; curve.id = 'parabola'; curve.name = '放物線'; curve.expression = 'x^2'; fixture.series = [curve];
  await page.locator('#file-input').setInputFiles({name: 'icons.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(fixture))});
  await page.waitForFunction(() => GraphEditor.getDocument().series[0]?.id === 'parabola'); await settle();
  await page.locator('[data-object-id="parabola"]').click();
  await page.locator('[data-object-details="series:parabola"]').hover();
  const duplicate = page.getByRole('menuitem', {name: '複製', exact: true});
  assert.equal(await duplicate.locator('svg').getAttribute('data-joho-icon'), 'duplicate');
  assert.equal(await page.getByRole('menuitem', {name: '削除', exact: true}).locator('svg').getAttribute('data-joho-icon'), 'delete');
  await duplicate.click(); await settle();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).series.length, 2);
  await page.locator('#undo').click(); await settle();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).series.length, 1);
  await page.locator('#redo').click(); await settle();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).series.length, 2);
  await page.locator('#undo').click(); await settle();
  await page.locator('#format-panel [data-close-side]').click();
  await page.locator('#series-add-toggle').click(); await page.locator('#add-parameter').click();
  assert.equal(await page.locator('#dialog-title svg').getAttribute('data-joho-icon'), null, 'coefficient dialog is not global settings');
  await page.locator('#dialog-close').click();
  for (const width of [720, 390]) {
    await page.setViewportSize({width, height: 850}); await settle();
    await Toolbar.openSettings(page);
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
    assert(await page.locator('#view-menu-panel').evaluate(el => { const r = el.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; }));
    await page.screenshot({path: path.join(screenshots, `narrow-${width}.png`)});
    await page.keyboard.press('Escape');
  }
  const touch = await browser.newPage({viewport: {width: 390, height: 850}, hasTouch: true});
  await touch.goto(url); await touch.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  for (const selector of ['#file-menu > summary', '#view-menu > summary', '#help-button']) {
    const rect = await touch.locator(selector).boundingBox(); assert(rect.width >= 44 && rect.height >= 44);
  }
  await touch.locator('#view-menu > summary').tap();
  assert(await touch.locator('[data-theme-value="dark"]').isVisible());
  await touch.screenshot({path: path.join(screenshots, 'touch-390.png')});
  assert.deepEqual(errors, []); assert.deepEqual(failed, []);
  console.log('standard-icons-browser.test.cjs: ok; ' + screenshots);
})().catch(error => { console.error(error); process.exitCode = 1; }).finally(async () => {
  await browser?.close(); await new Promise(resolve => server.close(resolve));
});
