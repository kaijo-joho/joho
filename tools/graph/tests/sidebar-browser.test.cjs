/* Chrome regression for the collapsed sidebar add panels. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
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
  page = await browser.newPage({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GRAPH_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/tools/graph/index.html');
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing);
  await settle();
  const series = page.locator('#series-add-toggle');
  const sp = page.locator('#series-add-panel');
  const focused = locator => locator.evaluate(el => el === document.activeElement);
  const inViewport = locator => locator.evaluate(el => { const b = el.getBoundingClientRect(); return b.left >= 0 && b.right <= innerWidth && b.top >= 0 && b.bottom <= innerHeight; });
  const equation = page.locator('.series-equation').first();
  assert(await equation.evaluate(el => parseFloat(getComputedStyle(el).fontSize) > parseFloat(getComputedStyle(el.parentElement.querySelector('.series-name')).fontSize)), 'formula is larger than its name');
  assert.match(await equation.innerText(), /^y = x\^2$/);
  assert(await sp.isHidden());
  await page.locator('#stage').focus(); await series.hover(); await sp.waitFor({ state: 'visible' });
  assert(await focused(page.locator('#stage')), 'hover does not steal focus');
  await page.locator('#add-function').hover(); assert(await sp.isVisible(), 'pointer can move from heading into the panel');
  await page.mouse.move(1200, 800); await sp.waitFor({ state: 'hidden' });
  await series.click(); assert(await sp.isVisible());
  assert.equal(await sp.locator('#add-point').count(), 1); assert.equal(await sp.locator('#add-tangent').count(), 1); assert.equal(await sp.locator('#add-parameter').count(), 1);
  await series.click();assert(await sp.isHidden(),'click closes the pinned add menu');await series.click();assert(await sp.isVisible());await page.mouse.click(1200, 800); await sp.waitFor({ state: 'hidden' });
  await series.focus(); await page.keyboard.press('Enter'); assert(await sp.isVisible());
  await page.keyboard.press('Tab'); assert(await focused(page.locator('#add-function')));
  await page.mouse.move(1200, 800); await page.waitForTimeout(220); assert(await sp.isVisible(), 'keyboard focus keeps panel open after mouse leaves');
  await page.keyboard.press('Shift+Tab'); assert(await focused(series));
  await page.keyboard.press('Escape'); await sp.waitFor({ state: 'hidden' }); assert(await focused(series));
  await page.keyboard.press('Space'); assert(await sp.isVisible()); await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowDown'); assert(await focused(page.locator('#add-function')));
  await page.keyboard.press('Enter'); await page.locator('#editor-dialog').waitFor({ state: 'visible' });
  assert(await sp.isHidden()); await page.keyboard.press('Escape'); assert(await focused(series), 'dialog returns to the visible heading icon');
  await series.click();
  await page.locator('#import-csv').click(); await page.getByRole('button',{name:'ファイル',exact:true}).click();
  const chooseCSV = page.waitForEvent('filechooser'); await page.getByRole('button',{name:'CSV・TSVファイルを選ぶ',exact:true}).click();
  await (await chooseCSV).setFiles({ name: 'observations.csv', mimeType: 'text/csv', buffer: Buffer.from('x,y\n0,1\n1,2') });
  await page.locator('#editor-dialog').waitFor({ state: 'visible' });
  await page.locator('.data-import-preview').waitFor({state:'visible'}); assert.equal(await page.getByLabel('横軸の列',{exact:true}).inputValue(),'0');
  await page.locator('#dialog-cancel').click(); assert(await focused(series), 'CSV import returns to the heading icon');

  await page.locator('#mode-3d').click(); await settle(); await series.click();
  assert.equal(await page.locator('#add-function').innerText(), '＋ 曲面'); assert(await page.locator('#other-curves').isHidden());
  assert(await page.locator('#add-point').isDisabled()); assert(await page.locator('#annotation-mode-note').isVisible());
  await page.locator('#mode-2d').click(); await settle();
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 850 }); await page.waitForTimeout(200); await settle();
  await page.locator('#list-toggle').tap(); await series.tap(); assert(await sp.isVisible());
  await page.locator('#other-curves summary').tap(); assert(await inViewport(sp), 'expanded formula choices stay inside narrow viewport');
  await page.locator('#add-polar').tap(); await page.locator('#editor-dialog').waitFor({ state: 'visible' }); await page.locator('#dialog-cancel').tap();
  assert(await focused(series)); assert(await series.isVisible()); assert(await sp.isHidden());
  await series.tap(); await page.locator('#add-point').tap(); await page.locator('#editor-dialog').waitFor({ state: 'visible' }); await page.locator('#dialog-cancel').tap(); assert(await focused(series));
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  await page.locator('#file-menu summary').tap();
  assert.equal(await page.locator('#file-menu summary').getAttribute('aria-label'), 'ファイル');
  assert.equal(await page.locator('#file-menu summary svg').count(), 1);
  assert(await page.locator('#save-browser').isVisible());
  assert.equal(await page.locator('#undo svg path').getAttribute('d'), 'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14');
  assert.equal(await page.locator('#redo svg path').getAttribute('d'), 'm16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14');
  assert.deepEqual(errors, []);
  console.log('graph sidebar-browser.test.cjs: ok');
})().catch(async error => {
  if (page) await page.screenshot({ path: '/private/tmp/graph-sidebar-failure.png' }).catch(() => {});
  console.error(error); process.exitCode = 1;
}).finally(async () => { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
