/* Chrome: connected boundaries, live area, selection, persistence and export. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const C = require('../core.js');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); res.end(error ? 'not found' : data); });
});
const fixture = C.createDocument(); fixture.name = '領域の確認'; fixture.axes.x.min = fixture.axes.y.min = -1; fixture.axes.x.max = fixture.axes.y.max = 6;
fixture.parameters.push({ name: 'h', value: 3, min: 1, max: 5, step: .1 });
for (const [id, x, y] of [['A', '0', '0'], ['B', '4', '0'], ['C', '1', 'h']]) {
  const p = C.createAnnotation('point'); Object.assign(p, { id, name: id, anchor: { type: 'free', x, y }, projections: false }); fixture.annotations.push(p);
}
for (const [from, to] of [['A', 'B'], ['B', 'C'], ['C', 'A']]) {
  const s = C.createAnnotation('segment'); Object.assign(s, { id: from + to, name: from + to, from, to }); s.style.dash = 'solid'; s.label.visible = false; fixture.annotations.push(s);
}
const curve = C.createSeries(); curve.id = 'curve'; curve.expression = 'y=2'; fixture.series.push(curve);
let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  page = await context.newPage(); const errors = []; page.on('pageerror', e => errors.push(e.message));
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const item = id => page.locator('[data-object-id="' + id + '"]');
  const dialog = page.locator('#editor-dialog'), bar = page.locator('#selection-toolbar');
  const details = async id => { await item(id).click(); await bar.getByRole('button', { name: '位置・設定', exact: true }).click(); await dialog.waitFor({ state: 'visible' }); };
  const fill = (name, value) => dialog.getByLabel(name, { exact: true }).fill(String(value));
  const submit = async () => { await page.locator('#dialog-submit').click(); await settle(); };
  const addRegion = async () => { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); await page.locator('#add-region').click(); await dialog.waitFor({ state: 'visible' }); };
  const importDoc = async value => { await page.locator('#file-input').setInputFiles({ name: 'region.graph.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(value)) }); await page.waitForFunction(name => GraphEditor.getDocument().name === name, value.name); await settle(); };
  const screen = point => page.evaluate(p => GraphPlot.screenPoint(document.querySelector('#plot'), p), point);
  const regionTrace = id => page.evaluate(id => document.querySelector('#plot').data.find(t => t.meta?.objectId === id), id);
  await page.goto(process.env.GRAPH_TEST_URL || 'http://127.0.0.1:' + server.address().port + '/tools/graph/index.html'); await settle(); await importDoc(fixture);
  await addRegion(); assert.equal(await dialog.locator('[data-region-segment]:checked').count(), 3);
  assert.match(await dialog.getByLabel('領域の確認').innerText(), /面積 ≈ 6/);
  await fill('名前', '三角形'); await submit();
  let d = await doc(); const region = d.annotations.find(a => a.kind === 'region'); assert(region); assert.equal(d.version, 10);
  const area = page.locator('[data-region-area="' + region.id + '"]'); assert.equal(await area.innerText(), '面積 ≈ 6');
  assert.equal((await regionTrace(region.id)).fill, 'toself');
  assert.equal(await page.evaluate(() => document.querySelector('#plot').data[0].meta.kind), 'region');
  const labels = () => page.evaluate(id => document.querySelector('#plot').layout.annotations.filter(a => a.name === id), region.id);
  assert.equal((await labels()).length, 1); assert.match((await labels())[0].text, /三角形<br>面積/); assert.equal((await labels())[0].opacity, 1);
  await bar.getByLabel('不透明度（0〜1）', { exact: true }).fill('.4'); await page.keyboard.press('Tab'); await settle();
  assert.equal((await doc()).annotations.find(a => a.id === region.id).style.opacity, .4);
  await bar.locator('[data-quick-control="color-16a34a"]').click(); await settle(); assert.equal((await regionTrace(region.id)).fillcolor, '#16a34a');
  await bar.getByLabel('面積を図に表示', { exact: true }).uncheck(); await settle(); assert.equal((await labels())[0].text, '三角形');
  await bar.getByLabel('面積を図に表示', { exact: true }).check(); await settle();
  await bar.getByRole('button', { name: '文字・配置', exact: true }).click(); await bar.getByLabel('名前を表示', { exact: true }).uncheck(); await settle();
  assert.match((await labels())[0].text, /^面積/); await bar.getByLabel('名前を表示', { exact: true }).check(); await settle();
  await page.keyboard.press('Escape'); await page.keyboard.press('Escape');
  const labelBox = await page.locator('#plot .annotation').filter({ hasText: '三角形' }).boundingBox(), beforeLabelDrag = await doc();
  await page.mouse.move(labelBox.x + labelBox.width / 2, labelBox.y + labelBox.height / 2); await page.mouse.down();
  await page.mouse.move(labelBox.x + labelBox.width / 2 + 24, labelBox.y + labelBox.height / 2 + 16, { steps: 4 }); await page.mouse.up(); await settle();
  assert(Math.abs((await doc()).annotations.find(a => a.id === region.id).label.dx - 24) < 2);
  assert.equal((await labels()).length, 1); assert(Math.abs((await labels())[0].xshift - 24) < 2, 'name and area move together');
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeLabelDrag);
  // A point, a curve and a region all remain selectable where they overlap.
  await page.mouse.click(...await screen([1.4, .5])); await page.waitForFunction(id => GraphEditor.getState().selected?.id === id, region.id);
  await page.mouse.click(...await screen([2, 2])); await page.waitForFunction(() => GraphEditor.getState().selected?.id === 'curve');
  await page.mouse.click(...await screen([4, 0])); await page.waitForFunction(() => GraphEditor.getState().selected?.id === 'B');
  const beforeDrag = await doc(), from = await screen([4, 0]), to = await screen([5, 0]);
  await page.mouse.move(...from); await page.mouse.down(); await page.mouse.move(...to, { steps: 5 }); await page.mouse.up(); await settle();
  assert(Math.abs(Number((await doc()).annotations.find(a => a.id === 'B').anchor.x) - 5) < .03);
  assert(Math.abs(Number((await area.innerText()).split('≈ ')[1]) - 7.5) < .01, 'area follows the actual dragged position');
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeDrag);
  const slider = page.locator('[data-parameter="h"] input[type="range"]'); await slider.focus(); await slider.press('End'); await settle();
  assert.equal(await area.innerText(), '面積 ≈ 10'); await page.locator('#undo').click(); await settle(); assert.equal(await area.innerText(), '面積 ≈ 6');
  // The same region survives temporary geometric degeneracy, then recovers on Undo.
  await details('C'); await fill('y 座標', '0'); await submit();
  assert((await doc()).annotations.some(a => a.id === region.id)); assert.equal(await regionTrace(region.id), undefined); assert.match(await area.innerText(), /面積が0/);
  await page.locator('#undo').click(); await settle(); assert.equal(await area.innerText(), '面積 ≈ 6');
  const valid = await doc(); await details(region.id); await dialog.locator('[data-region-segment="AB"]').uncheck(); await page.locator('#dialog-submit').click();
  assert(await page.locator('#dialog-error').isVisible()); assert.deepEqual(await doc(), valid); await page.keyboard.press('Escape');
  await page.locator('[data-object-details="annotation:A"]').click(); await page.locator('#object-menu').getByRole('menuitem', { name: '削除', exact: true }).click(); await settle();
  assert(!(await doc()).annotations.some(a => a.id === region.id)); assert((await doc()).annotations.some(a => a.id === 'BC'));
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), valid);
  await page.locator('#mode-3d').click(); await settle(); assert.equal(await regionTrace(region.id), undefined); assert((await doc()).annotations.some(a => a.id === region.id));
  await page.locator('#mode-2d').click(); await settle();
  // JSON and browser saves preserve references, settings and area after reload.
  await page.locator('#file-menu summary').click(); const downloading = page.waitForEvent('download'); await page.locator('#save-local').click();
  const saved = JSON.parse(fs.readFileSync(await (await downloading).path(), 'utf8')); assert.equal(saved.version, 10);
  await importDoc(C.createDocument()); await importDoc(saved); assert.deepEqual(await doc(), saved); assert.equal(await area.innerText(), '面積 ≈ 6');
  await page.locator('#file-menu summary').click(); await page.locator('#save-browser').click();
  assert.deepEqual(await page.evaluate(() => JSON.parse(localStorage.getItem('kaijo-graph:saved')).document), saved);
  const svg = await page.evaluate(async () => decodeURIComponent((await GraphPlot.exportImage(document.querySelector('#plot'), { format: 'svg', scale: 1, background: 'white' })).split(',').slice(1).join(',')));
  assert.match(svg, /js-fill/); assert.match(svg, /面積/); assert.match(svg, /22, 163, 74/);
  const png = await page.evaluate(() => GraphPlot.exportImage(document.querySelector('#plot'), { format: 'png', scale: 1, background: 'white' }));
  assert.match(png, /^data:image\/png;base64,/); assert(Buffer.from(png.split(',')[1], 'base64').length > 2000);
  await page.screenshot({ path: '/private/tmp/graph-regions-desktop.png' });
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.locator('#text-size').selectOption('largest'); await page.keyboard.press('Escape');
  await page.setViewportSize({ width: 390, height: 850 }); await page.mouse.move(380,840); await page.locator('#list-toggle').tap(); await page.locator('#series-add-toggle').tap(); await page.locator('#add-region').tap();
  await dialog.waitFor({ state: 'visible' }); assert.equal(await dialog.locator('[data-region-segment]:checked').count(), 3);
  assert(await dialog.evaluate(el => el.scrollWidth <= el.clientWidth)); await page.screenshot({ path: '/private/tmp/graph-regions-mobile.png' });
  await page.keyboard.press('Escape'); assert(await page.locator('#series-add-toggle').evaluate(el => el === document.activeElement));
  assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth)); assert.deepEqual(errors, []);
  console.log('graph regions-browser.test.cjs: ok');
})().catch(async error => { if (page) await page.screenshot({ path: '/private/tmp/graph-regions-failure.png' }).catch(() => {}); console.error(error); process.exitCode = 1; })
.finally(async () => { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); });
