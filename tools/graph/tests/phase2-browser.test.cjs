/* Chrome regression for curve types, dependent annotations and migrated documents. */
const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep)) { res.writeHead(403); return res.end(); }
  fs.readFile(file, (error, data) => { res.writeHead(error ? 404 : 200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : file.endsWith('.svg') ? 'image/svg+xml' : 'text/html' }); res.end(error ? 'not found' : data); });
});
let browser;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1280, height: 850 }, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  const page = await context.newPage(), errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const field = (label, value) => page.getByLabel(label, { exact: true }).fill(String(value));
  const submit = async () => { await page.locator('#dialog-submit').click(); await settle(); };
  const curves = () => page.locator('#series-list .object-item');
  const annotations = () => page.locator('#annotation-list .object-item');
  async function seriesAdd() { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); }
  async function annotationAdd() { if (await page.locator('#annotation-add-panel').isHidden()) await page.locator('#annotation-add-toggle').click(); }
  async function addCurve(kind, name) { await seriesAdd(); if (!await page.locator('#other-curves').evaluate(el => el.open)) await page.locator('#other-curves summary').click(); await page.locator('#add-' + kind).click(); await field('名前', name); }
  const annotationButton = { '点':'#add-point', '補助線':'#add-guide', '接線':'#add-tangent', '交点':'#add-intersection', '線分・矢印':'#add-segment', '文字':'#add-text' };
  async function addAnnotation(name) { await annotationAdd(); await page.locator(annotationButton[name]).click(); }
  async function more(action) { await page.getByRole('button', { name: action, exact: true }).click(); }
  async function addQuickTangent(at) { await annotationAdd(); await page.locator('#add-tangent').click(); const panel=page.locator('#tangent-quick-panel'); await panel.getByLabel(/^接点の .+ 座標$/).fill(String(at)); await panel.getByRole('button',{name:'接線を追加',exact:true}).click(); await settle(); }
  async function openTemplate(name) { if (!await page.locator('#templates-panel').isVisible()) await page.locator('#templates-tab').click(); await page.locator('#template-list').getByRole('button', { name: new RegExp('^' + name) }).click(); await settle(); }
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`); await settle();
  await addCurve('implicit', '円'); await field('方程式（例：x^2 + y^2 = 9）', 'x^2+y^2=9');
  for (const axis of ['x', 'y']) { await field(axis + ' の最小値', -4); await field(axis + ' の最大値', 4); } await submit();
  assert((await doc()).series.some(s => s.kind === 'implicit'));
  await addCurve('parametric', '楕円'); await field('x(t) の式', '3*cos(t)'); await field('y(t) の式', '2*sin(t)'); await submit();
  await addCurve('polar', '花形'); await submit();
  const traces = await page.evaluate(() => document.querySelector('#plot').data.map(t => ({ id: t.meta.objectId, x: t.x.filter(Number.isFinite).length })));
  assert(traces.every(t => t.x > 50), 'each default curve actually draws a substantial path');
  assert.equal((await doc()).version, 7);

  await page.locator('#add-parameter').click(); await field('名前（半角英字。例：a）', 'a'); await submit();
  await curves().filter({ hasText: '楕円' }).click(); await annotationAdd(); await page.locator('#add-point').click(); await field('名前', 'P'); await field('位置（x / t / theta の値）', 'a'); await submit();
  const pId = (await doc()).annotations[0].id;
  const pointXY = id => page.evaluate(id => { const t = document.querySelector('#plot').data.find(t => t.meta.objectId === id && t.mode.includes('markers')); return [t.x[0], t.y[0]]; }, id);
  let xy = await pointXY(pId); assert(Math.abs(xy[0] - 3 * Math.cos(1)) < 1e-8);
  await page.getByLabel('a の数値', { exact: true }).fill('2'); await page.getByLabel('a の数値', { exact: true }).press('Tab'); await settle();
  xy = await pointXY(pId); assert(Math.abs(xy[1] - 2 * Math.sin(2)) < 1e-8, 'dependent point follows the coefficient');
  await page.locator('#stage').focus(); await page.keyboard.press('Escape');
  const pointBox = await page.locator('#plot .scatterlayer .trace').last().locator('path.point').first().boundingBox();
  await page.mouse.move(pointBox.x + pointBox.width / 2, pointBox.y + pointBox.height / 2);
  await page.waitForTimeout(150); await page.mouse.down(); await page.mouse.up();
  await page.waitForFunction(id => GraphEditor.getState().selected?.id === id, pId).catch(async error => { console.error('click state', pointBox, await page.evaluate(() => ({state:GraphEditor.getState(),traces:document.querySelector('#plot').data.map(t=>({meta:t.meta,mode:t.mode})),hover:document.querySelector('#plot')._hoverdata?.map(p=>({curve:p.curveNumber,point:p.pointNumber}))})));await page.screenshot({path:'/private/tmp/graph-02-click-debug.png'});throw error; });
  assert.equal((await page.evaluate(() => GraphEditor.getState())).selected.type, 'annotation', 'multiple traces still select the correct annotation');
  await page.getByRole('button', { name: '色・線', exact: true }).click(); await page.getByRole('button', { name: '色・線の詳細…', exact: true }).click(); await page.getByLabel('色 #0891b2', { exact: true }).click(); await field('R', 10); await field('G', 20); await field('B', 30); await submit();
  assert.equal((await doc()).annotations[0].style.color, '#0a141e');

  await addAnnotation('点'); await field('名前', '自由点'); await field('x 座標', '1/2'); await field('y 座標', 'sqrt(2)'); await submit();
  xy = await pointXY((await doc()).annotations.at(-1).id); assert(Math.abs(xy[0] - .5) < 1e-10 && Math.abs(xy[1] - Math.sqrt(2)) < 1e-10);
  await addAnnotation('補助線'); await field('名前', '縦線'); await field('座標の値', 'a'); await submit();
  assert.equal((await doc()).annotations.at(-1).value, 'a');
  await curves().first().click(); await addQuickTangent(1);
  await seriesAdd(); await page.locator('#add-function').click(); await field('名前', '直線'); await field('数式（例：y = a*x^2）', 'x+2'); await submit();
  await addAnnotation('交点'); await field('名前', '交点A'); const functionIds=(await doc()).series.filter(s=>s.kind==='function').map(s=>s.id); await page.getByLabel('1つ目の対象', { exact:true }).selectOption('series:'+functionIds[0]); await page.getByLabel('2つ目の対象', { exact:true }).selectOption('series:'+functionIds.at(-1)); await submit();
  const intersectionId = (await doc()).annotations.at(-1).id;
  assert.deepEqual(await page.evaluate(id => document.querySelector('#plot').data.find(t => t.meta.objectId === id).x.map(v => Math.round(v * 1e5) / 1e5), intersectionId), [-1, 2]);

  const beforeDelete = await doc(); await curves().first().click(); await more('削除'); await settle();
  assert.equal((await doc()).annotations.length, beforeDelete.annotations.length - 2, 'deleting a function removes only its tangent and intersections');
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeDelete, 'one undo restores all dependent annotations');
  await page.locator('#mode-3d').click(); await settle(); assert.equal((await doc()).mode, '3d'); assert.equal((await doc()).annotations.length, beforeDelete.annotations.length);
  assert(await page.locator('#add-point').isDisabled()); assert(await page.locator('#other-curves').isHidden());
  await page.locator('#mode-2d').click(); await settle();

  const downloadPromise = page.waitForEvent('download'); await page.locator('#file-menu summary').click(); await page.locator('#save-local').click(); const file = await downloadPromise;
  const serialized = JSON.parse(fs.readFileSync(await file.path(), 'utf8')); assert.equal(serialized.version, 7); assert.equal(serialized.annotations.length, 5);
  await page.setInputFiles('#file-input', await file.path()); await settle(); assert.deepEqual(await doc(), serialized, 'new types and dependencies survive JSON download/import');
  const invalid = structuredClone(serialized); invalid.annotations[0].anchor.seriesId = 'missing';
  await page.setInputFiles('#file-input', { name: 'broken.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(invalid)) }); await settle(); assert.deepEqual(await doc(), serialized, 'broken references keep the current document');
  await page.locator('#file-menu summary').click(); await page.locator('#save-browser').click(); await page.reload(); await page.waitForSelector('#editor-dialog[open]'); await page.locator('.saved-option').filter({ hasText: '明示保存' }).click(); await settle(); assert.deepEqual(await doc(), serialized);

  const legacy = structuredClone(serialized);legacy.version=1;delete legacy.annotations;legacy.series=legacy.series.filter(s=>s.kind==='function');for(const axis of Object.values(legacy.axes)){delete axis.symbol;delete axis.ticks;}
  await page.setInputFiles('#file-input',{name:'old-v1.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});
  await page.waitForFunction(()=>GraphEditor.getDocument().annotations.length===0);await settle();assert.equal((await doc()).version,7);assert.deepEqual((await doc()).series,legacy.series);

  await openTemplate('楕円と曲線上の点');
  assert((await doc()).annotations.some(a => a.kind === 'point'));
  await page.locator('#templates-panel [data-close-side]').click();
  await page.locator('#export-tab').click(); await page.locator('#export-format').selectOption('svg');
  const svgPromise = page.waitForEvent('download'); await page.locator('#export-image').click(); const svg = await svgPromise, svgText = fs.readFileSync(await svg.path(), 'utf8');
  assert(svgText.includes('>P</text>') && svgText.includes('js-line'), 'export contains point labels and curved lines');
  await page.locator('#export-panel [data-close-side]').click();
  await openTemplate('極座標の花形曲線'); await page.screenshot({path:'/private/tmp/graph-02-polar.png'}); assert.equal((await doc()).series[0].kind, 'polar');
  await openTemplate('放物線の接線と交点'); assert.equal((await doc()).annotations.length, 2);
  await page.locator('#templates-panel [data-close-side]').click();
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.keyboard.press('Escape'); await settle();
  await page.waitForFunction(()=>{const p=document.querySelector('#plot');return Math.abs(p.clientWidth-p.layout.width)<2;});
  await page.screenshot({ path: '/private/tmp/graph-02-desktop.png' });
  for (const width of [736, 390]) { await page.setViewportSize({ width, height: 850 }); await page.waitForTimeout(150); assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth)); assert.equal(await page.locator('.top').evaluate(el => getComputedStyle(el).flexWrap), 'nowrap'); }
  await page.locator('#list-toggle').tap(); await annotations().first().tap(); await page.getByRole('button', { name: '位置・設定', exact: true }).tap();
  await page.getByLabel('接点の x 座標', { exact: true }).fill('1/2'); await submit();
  await page.screenshot({ path: '/private/tmp/graph-02-mobile.png' });
  await page.locator('#stage').focus(); await page.keyboard.press('Escape'); await page.locator('#help-button').focus(); await page.keyboard.press('Enter'); await page.locator('#operation-help:visible').waitFor(); await page.keyboard.press('Escape');
  assert.deepEqual(errors, []);
  await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph phase2-browser.test.cjs: ok');
})().catch(async error => { if (browser) await browser.close(); server.close(); console.error(error); process.exitCode = 1; });
