/* Chrome UI regression tests. Run with the bundled Node runtime. */
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '../../..');
const mime = file => file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html';
const server = http.createServer((req, res) => {
  const name = path.normalize(decodeURIComponent(req.url.split('?')[0])).replace(/^\.\.([/\\]|$)/, '').replace(/^[/\\]+/, '');
  const file = path.join(root, name || 'tools/graph/index.html');
  if (!file.startsWith(root)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': mime(file) }); res.end(error ? 'not found' : data); });
});
let browser;

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const url = process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`;
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1200, height: 820 }, acceptDownloads: true, hasTouch: true });
  await context.addInitScript(() => { Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }); });
  const page = await context.newPage();
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  async function open() { await page.goto(url); await page.waitForFunction(() => window.GraphEditor && !window.GraphEditor.getState().drawing); await page.waitForSelector('#plot .main-svg'); }
  async function submit() { await page.locator('#dialog-submit').click(); await page.waitForFunction(() => !document.querySelector('#editor-dialog').open && !GraphEditor.getState().drawing); }
  async function setField(label, value) {
    const field = page.locator('#dialog-content label').filter({ hasText: label }).locator('input, textarea').first();
    await field.fill(String(value));
  }
  async function seriesAdd() { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); }
  await open();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).mode, '2d');
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).version, 13);
  assert(await page.locator('#plot .main-svg').count(), '2D graph is drawn');

  await seriesAdd(); await page.locator('#add-function').click(); await setField('数式', 'y = sin(x)'); await submit();
  assert((await page.evaluate(() => GraphEditor.getDocument())).series.some(s => s.expression === 'y = sin(x)'));

  await seriesAdd(); await page.locator('#add-data').click(); await page.locator('#dialog-content summary').filter({ hasText: 'CSV・TSVを貼り付け' }).click(); await page.getByLabel('CSV・TSVを貼り付け', { exact: true }).fill('x,y\n0,1\n1,\n2,4'); await page.getByRole('button', { name: '表に取り込む', exact: true }).click(); await submit();
  assert.deepStrictEqual((await page.evaluate(() => GraphEditor.getDocument())).series.at(-1).rows, [[0,1],[1,null],[2,4]]);
  const beforeInvalid = await page.evaluate(() => GraphEditor.getDocument());
  await seriesAdd(); await page.locator('#add-function').click(); await setField('数式', 'y = nope(x)'); await page.locator('#dialog-submit').click();
  await page.waitForSelector('#dialog-error:not([hidden])');
  assert.deepStrictEqual(await page.evaluate(() => GraphEditor.getDocument()), beforeInvalid, 'bad formula keeps the document');
  await page.locator('#dialog-cancel').click();

  await page.locator('#mode-3d').click(); await page.waitForFunction(() => GraphEditor.getDocument().mode === '3d');
  await seriesAdd(); await page.locator('#add-function').click(); await setField('数式', 'z = sin(x)*cos(y)'); await submit();
  await page.waitForSelector('#plot canvas');
  assert((await page.locator('#plot canvas').count()) > 0, '3D uses WebGL canvas');

  await page.locator('#templates-tab').click(); await page.getByRole('button', { name: '水の飽和蒸気圧（計算値）' }).click();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).series[0].kind, 'data2d');
  await page.getByRole('button', { name: '3D 曲面 z = x² + y²' }).click();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).mode, '3d');

  await page.locator('#mode-2d').click(); await seriesAdd(); await page.locator('#add-parameter').click(); await setField('名前', 'a'); await submit();
  await seriesAdd(); await page.locator('#add-function').click(); await setField('数式', 'y = a*x^2'); await submit();
  const slider = page.locator('#parameter-list input[type=range]').first(); await slider.fill('2');
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).parameters.find(p => p.name === 'a').value, 2);
  await page.locator('#undo').waitFor({ state: 'visible' }); await page.locator('#undo').click(); await page.waitForTimeout(80); assert.equal((await page.evaluate(() => GraphEditor.getDocument())).parameters.find(p => p.name === 'a').value, 1);

  const functionButton = page.locator('#series-list .object-item').filter({ hasText: 'y = a*x^2' }); await functionButton.click(); await page.getByRole('button', { name: '自由な色（RGB）', exact: true }).click();
  const rgb = page.locator('#dialog-content input[type=number]'); await rgb.nth(0).fill('255'); await rgb.nth(1).fill('0'); await rgb.nth(2).fill('0'); await submit();
  assert.equal((await page.evaluate(() => GraphEditor.getDocument())).series.find(s => s.expression === 'y = a*x^2').style.color, '#ff0000');

  await page.locator('#file-menu summary').click(); await page.locator('#save-browser').click(); await page.waitForTimeout(300);
  const saved = await page.evaluate(() => ({ auto: !!localStorage.getItem('kaijo-graph:auto'), saved: !!localStorage.getItem('kaijo-graph:saved') })); assert(saved.auto && saved.saved, 'auto and explicit browser saves are separate');
  const savedDocument = await page.evaluate(() => GraphEditor.getDocument());
  const downloadPromise = page.waitForEvent('download'); await page.locator('#file-menu summary').click(); await page.locator('#save-local').click(); const json = await downloadPromise; assert(/\.graph\.json$/.test(json.suggestedFilename()));
  const jsonPath=await json.path();assert.deepStrictEqual(JSON.parse(fs.readFileSync(jsonPath,'utf8')),savedDocument,'ダウンロードしたJSONは元の数式・表を保持する');
  await page.setInputFiles('#file-input',jsonPath);await page.waitForFunction(()=>!GraphEditor.getState().drawing);
  await seriesAdd(); await page.locator('#add-function').click();await setField('数式','y = x^3');await submit();
  await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kaijo-graph:auto')).document.series.some(s=>s.expression==='y = x^3'));
  assert.deepStrictEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('kaijo-graph:saved')).document),savedDocument,'後の自動保存は明示保存を変更しない');
  await page.reload(); await page.waitForFunction(() => window.GraphEditor && document.querySelector('#editor-dialog').open); await page.locator('.saved-option').filter({ hasText: '明示保存' }).click(); await page.waitForFunction(()=>!GraphEditor.getState().drawing); assert.deepStrictEqual(await page.evaluate(() => GraphEditor.getDocument()), savedDocument, 'reload restores the explicitly saved document independently');

  await page.locator('#export-tab').click(); const svgDownload = page.waitForEvent('download'); await page.locator('#export-format').selectOption('svg'); await page.locator('#export-image').click();const svg=await svgDownload;assert(/\.svg$/.test(svg.suggestedFilename()));assert(fs.readFileSync(await svg.path(),'utf8').includes('<svg'),'SVGの実体を出力する');
  const pngDownload = page.waitForEvent('download'); await page.locator('#export-format').selectOption('png'); await page.locator('#export-image').click();const png=await pngDownload;assert(/\.png$/.test(png.suggestedFilename()));assert.equal(fs.readFileSync(await png.path()).subarray(0,8).toString('hex'),'89504e470d0a1a0a','PNGの実体を出力する');
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); assert.equal(await page.locator('html').getAttribute('data-theme'), 'dark'); await page.keyboard.press('Escape'); await page.waitForFunction(() => !document.querySelector('#view-menu').open);

  for (const width of [736,390]) { await page.setViewportSize({ width, height: 820 }); await page.waitForTimeout(100); assert((await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth)),'no horizontal overflow at '+width); assert.equal(await page.locator('.top').evaluate(el => getComputedStyle(el).flexWrap), 'nowrap'); }
  await page.locator('#export-panel:not([hidden]) [data-close-side]').click(); await page.locator('#help-button').focus(); await page.keyboard.press('Enter'); await page.locator('#operation-help:visible').waitFor(); assert(await page.locator('#operation-help:visible select').isEditable(), 'keyboard opens visible non-modal help'); await page.locator('#operation-help:visible').getByRole('button', { name: 'ヘルプを開いたまま編集へ戻る' }).click(); await page.locator('#list-toggle').click(); await seriesAdd(); await page.locator('#add-function').click(); await page.locator('#dialog-cancel').click(); await page.locator('#help-button').focus(); await page.keyboard.press('Enter'); await page.keyboard.press('Escape');
  await page.locator('#list-toggle').tap(); await page.locator('#series-list .object-item').first().tap();
  assert.equal(errors.length, 0, errors.join('\n'));
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph browser.test.cjs: ok');
})().catch(async error => { if (browser) await browser.close(); server.close(); console.error(error.stack || error); process.exitCode = 1; });
