/* Chrome: curve-region authoring, live calculations, display controls and responsive UI. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const C = require('../core.js');
const Toolbar = require('./toolbar-helpers.cjs');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => { const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0])); if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); } fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); res.end(error ? 'not found' : data); }); });
const fixture = C.createDocument(); fixture.name = '曲線領域の確認'; fixture.axes.x.min = 0; fixture.axes.x.max = 1; fixture.axes.y.min = -1; fixture.axes.y.max = 2;
fixture.parameters.push({ name: 'h', value: 1, min: 0, max: 2, step: .1 });
for (const [id, expression] of [['f', 'h*x^2'], ['g', 'x']]) { const s = C.createSeries(); s.id = id; s.name = id; s.expression = expression; s.domain.x = [0, 1]; fixture.series.push(s); }
C.validateDocument(fixture);

let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const dialog = page.locator('#editor-dialog');
  const importDoc = async value => { await page.locator('#file-input').setInputFiles({ name: 'curve-region.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await page.waitForFunction(name => GraphEditor.getDocument().name === name, value.name); await settle(); };
  const addRegion = async () => { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); await page.locator('#add-region').click(); await dialog.waitFor({ state: 'visible' }); };
  await page.goto(process.env.GRAPH_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/tools/graph/index.html'); await settle(); await importDoc(fixture); await addRegion();
  await dialog.getByLabel('領域の作り方', { exact: true }).selectOption('curveRegion');
  await dialog.getByLabel('名前', { exact: true }).fill('曲線の間');
  await dialog.getByLabel('第1の境界', { exact: true }).selectOption('series:f');
  await dialog.getByLabel('第2の境界', { exact: true }).selectOption('series:g');
  await dialog.getByLabel('x の始点', { exact: true }).fill('0'); await dialog.getByLabel('x の終点', { exact: true }).fill('1');
  await dialog.getByLabel('面積を図に表示', { exact: true }).check(); await dialog.getByLabel('定積分を図に表示', { exact: true }).check();
  await page.waitForFunction(() => /面積/.test(document.querySelector('.region-preview').textContent) && /定積分/.test(document.querySelector('.region-preview').textContent));
  const preview = await dialog.locator('.region-preview').innerText(); assert.match(preview, /面積/); assert.match(preview, /定積分/);
  const previewNumbers = preview.match(/(?:面積|定積分)[^-+0-9]*([-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?)/gi) || [];
  assert(previewNumbers.some(text => Math.abs(Number(text.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/)[0]) - 1 / 6) < .01), 'x^2 と x の面積は1/6');
  assert(previewNumbers.some(text => Math.abs(Number(text.match(/[-+]?\d+(?:\.\d+)?(?:e[-+]?\d+)?/)[0]) + 1 / 6) < .01), '定積分は-1/6');
  await page.locator('#dialog-submit').click(); await settle();
  let d = await doc(), curveRegion = d.annotations.find(a => a.kind === 'curveRegion'); assert(curveRegion); assert.equal(d.version, 14); assert.equal(curveRegion.targets[0].type, 'series'); assert.equal(curveRegion.targets[1].type, 'series');
  const area = page.locator('[data-region-area="' + curveRegion.id + '"]'); assert(await area.count()); assert.match(await area.innerText(), /面積/);
  const labels = () => page.evaluate(id => document.querySelector('#plot').layout.annotations.filter(a => a.name === id), curveRegion.id);
  assert.equal((await labels()).length, 1); assert.match((await labels())[0].text, /曲線の間/); assert.match((await labels())[0].text, /面積/); assert.match((await labels())[0].text, /定積分/);
  const traceCount = await page.evaluate(id => document.querySelector('#plot').data.filter(t => t.meta?.objectId === id && t.fill === 'toself').length, curveRegion.id); assert(traceCount >= 1);
  const bar = page.locator('#selection-toolbar'); await bar.getByLabel('定積分を図に表示', { exact: true }).uncheck(); await settle(); assert(!/(定積分)/.test((await labels())[0].text)); await bar.getByLabel('定積分を図に表示', { exact: true }).check(); await settle();
  await bar.getByLabel('不透明度（0〜1）', { exact: true }).fill('.4'); await page.keyboard.press('Tab'); await settle();
  await bar.locator('[data-quick-control="color-16a34a"]').click(); await settle();
  assert.equal((await doc()).annotations[0].style.opacity,.4);assert.equal((await doc()).annotations[0].style.color,'#16a34a');assert.equal((await labels())[0].opacity,1);
  const slider=page.locator('[data-parameter="h"] input[type="range"]');await slider.focus();await slider.press('End');await settle();assert.equal(await area.innerText(),'面積 ≈ 0.25');
  await page.locator('#undo').click();await settle();assert.equal(await area.innerText(),'面積 ≈ 0.16666667');
  const beforeInterval=await doc();
  await page.locator('[data-object-id="'+curveRegion.id+'"]').click();await bar.getByRole('button',{name:'位置・設定',exact:true}).click();await dialog.getByLabel('x の終点',{exact:true}).fill('2');await page.locator('#dialog-submit').click();assert(await page.locator('#dialog-error').isVisible());assert.deepEqual(await doc(),beforeInterval);
  await dialog.getByLabel('x の終点',{exact:true}).fill('1/2');await page.locator('#dialog-submit').click();await settle();assert.equal(await area.innerText(),'面積 ≈ 0.083333333');assert.deepEqual((await doc()).annotations[0].interval,['0','1/2']);
  await page.locator('#undo').click();await settle();assert.deepEqual(await doc(),beforeInterval);
  await page.locator('[data-object-details="series:f"]').click();await page.locator('#object-menu').getByRole('menuitem',{name:'削除',exact:true}).click();await settle();assert.equal((await doc()).annotations.length,0);
  await page.locator('#undo').click();await settle();assert.deepEqual(await doc(),beforeInterval);
  // The same UI supports a crossing pair, which produces two independently selectable lobes.
  const twoLobes = C.clone(fixture); twoLobes.name = '2ローブの確認'; twoLobes.axes.x.min = -1; twoLobes.axes.x.max = 1; twoLobes.series[0].expression = 'x'; twoLobes.series[0].domain.x = [-1, 1]; twoLobes.series[1].expression = '0'; twoLobes.series[1].domain.x = [-1, 1]; C.validateDocument(twoLobes); await importDoc(twoLobes); await addRegion(); await dialog.getByLabel('領域の作り方', { exact: true }).selectOption('curveRegion'); await dialog.getByLabel('第1の境界', { exact: true }).selectOption('series:f'); await dialog.getByLabel('第2の境界', { exact: true }).selectOption('axis:x'); await dialog.getByLabel('x の始点', { exact: true }).fill('-1'); await dialog.getByLabel('x の終点', { exact: true }).fill('1'); await dialog.getByLabel('名前', { exact: true }).fill('2ローブ'); await page.locator('#dialog-submit').click(); await settle();
  d = await doc(); const lobes = d.annotations.find(a => a.kind === 'curveRegion'); assert(lobes); assert.equal(await page.evaluate(id => document.querySelector('#plot').data.filter(t => t.meta?.objectId === id && t.fill === 'toself').length, lobes.id), 2, '交差する境界は2ローブに分割する');
  const lobePoints = await page.evaluate(() => [-.5, .5].map(x => GraphPlot.screenPoint(document.querySelector('#plot'), [x, x / 2]))); for (const point of lobePoints) { await page.mouse.click(...point); await page.waitForFunction(id=>GraphEditor.getState().selected?.id===id,lobes.id); await page.waitForTimeout(350); }
  const boundary = await page.evaluate(() => GraphPlot.screenPoint(document.querySelector('#plot'), [.5, .5])); await page.mouse.click(...boundary); await page.waitForFunction(()=>GraphEditor.getState().selected?.id==='f');
  await page.locator('#file-menu summary').click(); const download = page.waitForEvent('download'); await page.locator('#save-local').click(); const saved = JSON.parse(fs.readFileSync(await (await download).path(), 'utf8')); assert.equal(saved.version, 14); await importDoc(C.createDocument()); await importDoc(saved); assert.equal((await doc()).version, 14);
  await page.locator('#file-menu summary').click(); await page.locator('#save-browser').click(); assert.equal((await page.evaluate(() => new GraphDocumentStore.Store(localStorage).load(GraphEditor.getState().tabId,'saved').document.version)), 14);
  assert.deepEqual(await doc(),saved);assert.deepEqual(await page.evaluate(()=>new GraphDocumentStore.Store(localStorage).load(GraphEditor.getState().tabId,'saved').document),saved);
  const svg = await page.evaluate(() => GraphPlot.exportImage(document.querySelector('#plot'), { format: 'svg', scale: 1, background: 'white' })); assert.match(svg, /^data:image\/svg\+xml/);
  assert.match(decodeURIComponent(svg.split(',').slice(1).join(',')),/2ローブ/);assert.match(decodeURIComponent(svg.split(',').slice(1).join(',')),/面積/);
  const png = await page.evaluate(() => GraphPlot.exportImage(document.querySelector('#plot'), { format: 'png', scale: 1, background: 'white' })); assert.match(png, /^data:image\/png/);
  await page.locator('[data-object-id="'+lobes.id+'"]').click();await page.screenshot({path:'/private/tmp/graph-curve-regions-desktop.png'});
  await Toolbar.openSettings(page); await page.locator('[data-theme-value="dark"]').click(); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape'); await page.setViewportSize({ width: 390, height: 850 });
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  await page.mouse.move(380,840);await page.locator('#list-toggle').tap();await page.locator('#series-add-toggle').tap();await page.locator('#add-region').tap();await dialog.waitFor({ state: 'visible' });
  await dialog.getByLabel('領域の作り方', { exact: true }).selectOption('curveRegion');await dialog.getByLabel('x の終点', { exact: true }).fill('0.9');await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');
  assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));await page.screenshot({path:'/private/tmp/graph-curve-regions-mobile.png'});
  await page.keyboard.press('Escape');assert(await page.locator('#series-add-toggle').evaluate(el => el === document.activeElement));assert.deepEqual(errors, []);
  console.log('curve-regions-browser.test.cjs: ok');
})().catch(async error => { if (page) await page.screenshot({ path: '/private/tmp/curve-regions-failure.png' }).catch(() => {}); console.error(error); process.exitCode = 1; }).finally(async () => { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
