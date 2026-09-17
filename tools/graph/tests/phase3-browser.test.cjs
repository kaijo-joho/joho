/* Actual Chrome interaction: custom symbols, shared endpoints, labels and drag history. */
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
let browser, page;
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const context = await browser.newContext({ viewport: { width: 1360, height: 900 }, hasTouch: true, acceptDownloads: true });
  await context.addInitScript(() => Object.defineProperty(window, 'showSaveFilePicker', { value: undefined, configurable: true }));
  page = await context.newPage(); const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  const settle = () => page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing && !document.querySelector('#editor-dialog').open);
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const fill = (label, value) => page.locator('#editor-dialog').getByLabel(label, { exact: true }).fill(String(value));
  const submit = async () => { await page.locator('#dialog-submit').click(); await settle(); };
  const ann = name => page.locator('#annotation-list .object-item').getByText(name, { exact: true });
  const annotationButton = { '点':'#add-point', '補助線':'#add-guide', '接線':'#add-tangent', '交点':'#add-intersection', '線分・矢印':'#add-segment', '文字':'#add-text' };
  const seriesAdd = async () => { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); };
  const annotationAdd = async () => { if (await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); };
  const add = async name => { await annotationAdd(); await page.locator(annotationButton[name]).click(); };
  const more = async name => { if(name!=='削除') return page.locator('#selection-toolbar').getByRole('button', { name, exact: true }).click(); const selected=await page.evaluate(()=>GraphEditor.getState().selected); await page.locator('[data-object-details="'+selected.type+':'+selected.id+'"]').click(); await page.getByRole('menuitem', { name, exact: true }).click(); };
  const addQuickTangent = async (name,at) => { await annotationAdd(); await page.locator('#add-tangent').click(); const panel=page.locator('#tangent-quick-panel'); await panel.getByLabel(/^接点の .+ 座標$/).fill(String(at)); await panel.getByRole('button',{name:'接線を追加',exact:true}).click(); await settle(); await page.getByRole('button',{name:'位置・設定',exact:true}).click(); await fill('名前',name); await submit(); };
  const axes = key => page.locator('[data-axis="' + key + '"]');
  const screen = point => page.evaluate(point => GraphPlot.screenPoint(document.querySelector('#plot'), point), point);
  async function drag(from, to, cancel = false) {
    await page.mouse.move(...from); await page.mouse.down();
    await page.waitForFunction(() => GraphEditor.getState().dragging);
    await page.mouse.move(...to, { steps: 5 });
    if (cancel) await page.keyboard.press('Escape');
    await page.mouse.up(); await settle();
  }
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`); await settle();
  await page.locator('#axes-button').click();
  await axes('x').getByLabel('数式で使う記号', { exact: true }).fill('t');
  await axes('y').getByLabel('数式で使う記号', { exact: true }).fill('s');
  await axes('y').getByLabel('軸名（表示）', { exact: true }).fill('距離 s_0');
  await axes('y').getByLabel('単位（表示）', { exact: true }).fill('m^2');
  await axes('x').getByLabel('目盛の間隔（空欄で自動）', { exact: true }).fill('π/2');
  await axes('x').getByLabel('目盛の表記', { exact: true }).selectOption('pi');
  await submit();
  assert.equal((await doc()).axes.x.symbol, 't'); assert.equal((await doc()).series[0].expression, 'x^2');
  assert((await page.locator('#series-list').innerText()).includes('t^2'));
  const plotted = await page.evaluate(() => document.querySelector('#plot').layout);
  assert(plotted.xaxis.ticktext.includes('π/2')); assert(plotted.yaxis.title.text.includes('s<sub>0</sub>'));
  assert(plotted.yaxis.title.text.includes('m<sup>2</sup>'));
  await seriesAdd(); await page.locator('#add-function').click(); await fill('名前', '移動'); await fill('数式（例：s = a*t^2）', 's = 2*t'); await submit();
  assert.equal((await doc()).series.at(-1).expression, 'y = 2*x');
  const beforeInvalid = await doc(); await page.locator('#axes-button').click();
  await axes('y').getByLabel('数式で使う記号', { exact: true }).fill('t'); await page.locator('#dialog-submit').click();
  assert(await page.locator('#dialog-error').isVisible()); assert.deepEqual(await doc(), beforeInvalid); await page.locator('#dialog-cancel').click();
  await page.locator('#axes-button').click();
  await axes('x').getByLabel('数式で使う記号', { exact: true }).fill('時間'); await axes('y').getByLabel('数式で使う記号', { exact: true }).fill('距離'); await submit();
  await page.locator('#series-list .object-item').last().click(); await page.getByRole('button', { name: '数式・範囲', exact: true }).click();
  assert.equal(await page.getByLabel('数式（例：距離 = a*時間^2）', { exact: true }).inputValue(), '距離 = 2*時間'); await page.locator('#dialog-cancel').click();
  // Restore simple axis names and a square range for the direct manipulation checks.
  await page.locator('#axes-button').click();
  for (const key of ['x', 'y']) { await axes(key).getByLabel('数式で使う記号', { exact: true }).fill(key); await axes(key).getByLabel('軸名（表示）', { exact: true }).fill(key); await axes(key).getByLabel('単位（表示）', { exact: true }).fill(''); await axes(key).getByLabel('最小値', { exact: true }).fill('-5'); await axes(key).getByLabel('最大値', { exact: true }).fill('5'); }
  await submit();
  const beforeSegment = await doc();
  await add('線分・矢印'); await fill('名前', 'AB'); await fill('始点の x 座標', '-2'); await fill('始点の y 座標', '-2'); await fill('終点の x 座標', '2'); await fill('終点の y 座標', '-2'); await submit();
  let d = await doc(), ab = d.annotations.find(a => a.name === 'AB');
  assert.equal(d.annotations.length, beforeSegment.annotations.length + 3);
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeSegment, 'two endpoints and segment are one history entry');
  await page.locator('#redo').click(); await settle(); await ann('AB').click();
  await more('終点から続ける'); await fill('名前', 'BC'); await fill('終点の x 座標', '0'); await fill('終点の y 座標', '2'); await page.getByLabel('矢印', { exact: true }).selectOption('end'); await submit();
  d = await doc(); const bc = d.annotations.find(a => a.name === 'BC'); assert.equal(bc.from, ab.to);
  await more('終点から続ける'); await fill('名前', 'CA'); await page.getByLabel('終点の指定', { exact: true }).selectOption(ab.from); await submit();
  d = await doc(); assert.equal(d.annotations.length, beforeSegment.annotations.length + 6); const ca = d.annotations.find(a => a.name === 'CA'); assert.equal(ca.to, ab.from);
  // Move shared B and ensure both connected line segments track the same point.
  await page.locator('#stage').focus(); await page.keyboard.press('Escape');
  const beforeDrag = await doc(); await drag(await screen([2, -2]), await screen([3, -1]));
  d = await doc(); const b = d.annotations.find(a => a.id === ab.to); assert(Math.abs(Number(b.anchor.x) - 3) < .03); assert(Math.abs(Number(b.anchor.y) + 1) < .03);
  const joined = await page.evaluate(ids => ids.map(id => { const t = document.querySelector('#plot').data.find(t => t.meta.objectId === id); return [t.x.filter(Number.isFinite), t.y.filter(Number.isFinite)]; }), [ab.id, bc.id]);
  assert.equal(joined[0][0][1], joined[1][0][0]); assert.equal(joined[0][1][1], joined[1][1][0]);
  await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeDrag, 'drag has a single undo record');
  await drag(await screen([2, -2]), await screen([3, -1]), true); assert.deepEqual(await doc(), beforeDrag, 'Escape cancels drag without committing');
  // Label placement and text use Plotly SVG text, including superscripts and escaping.
  await ann('AB').click(); await page.getByLabel('文字サイズ（px）', { exact: true }).fill('20'); await page.getByLabel('文字サイズ（px）', { exact: true }).press('Tab'); await page.getByLabel('横のずれ（右へ px）', { exact: true }).fill('0'); await page.getByLabel('横のずれ（右へ px）', { exact: true }).press('Tab'); await page.getByLabel('縦のずれ（下へ px）', { exact: true }).fill('25'); await page.getByLabel('縦のずれ（下へ px）', { exact: true }).press('Tab'); await settle();
  const label = page.locator('#plot .annotation').filter({ hasText: /^AB$/ }); const box = await label.boundingBox();
  await drag([box.x + box.width / 2, box.y + box.height / 2], [box.x + box.width / 2 + 30, box.y + box.height / 2 + 20]);
  ab = (await doc()).annotations.find(a => a.id === ab.id); assert(Math.abs(ab.label.dx - 30) < 2); assert(Math.abs(ab.label.dy - 45) < 2);
  await add('文字'); await fill('名前', '説明'); await fill('表示する文字', 'v_0 = 2 m^2\n<script>alert(1)</script>'); await fill('x 座標', '-3'); await fill('y 座標', '3'); await submit();
  const textId = (await doc()).annotations.at(-1).id;
  assert.equal(await page.locator('#plot script').count(), 0);
  const textBox = await page.locator('#plot .annotation').filter({ hasText: 'alert(1)' }).boundingBox();
  await drag([textBox.x + 20, textBox.y + 10], [textBox.x + 45, textBox.y + 30]);
  assert.notEqual((await doc()).annotations.find(a => a.id === textId).anchor.x, '-3');
  // Tangents are treated as infinite straight lines, independent of visible clipping.
  for (const [name, at] of [['接線A', -1], ['接線B', 1]]) await addQuickTangent(name,at);
  await add('交点'); await fill('名前', 'T'); const tangentIds=(await doc()).annotations.filter(a=>a.kind==='tangent').slice(-2).map(a=>a.id); await page.getByLabel('1つ目の対象', { exact:true }).selectOption('tangent:'+tangentIds[0]); await page.getByLabel('2つ目の対象', { exact:true }).selectOption('tangent:'+tangentIds[1]); await submit();
  const tId = (await doc()).annotations.at(-1).id;
  const xy = await page.evaluate(id => GraphAnnotations.evaluate(GraphEditor.getDocument().annotations.find(a => a.id === id), GraphEditor.getDocument()).points[0], tId);
  assert(Math.abs(xy[0]) < 1e-8 && Math.abs(xy[1] + 1) < 1e-7);
  const beforeDelete = await doc(); await ann('接線A').click(); await more('削除'); await settle(); assert(!(await doc()).annotations.some(a => a.id === tId)); await page.locator('#undo').click(); await settle(); assert.deepEqual(await doc(), beforeDelete);
  // Curve points retain their curve reference; literal position changes, formula position does not.
  await page.locator('#series-list .object-item').first().click(); await annotationAdd(); await page.locator('#add-point').click(); await fill('名前', 'P'); await fill('位置（x / t / theta の値）', '1'); await submit();
  await page.locator('#stage').focus(); await page.keyboard.press('Escape'); await drag(await screen([1, 1]), await screen([1.5, 1.6]));
  const p = (await doc()).annotations.at(-1); assert.equal(p.anchor.type, 'curve'); assert(Math.abs(Number(p.anchor.at) - 1.5) < .03);
  await page.getByRole('button', { name: '位置・設定', exact: true }).click(); await fill('位置（x / t / theta の値）', '1/2'); await submit();
  const preserved = await doc(), half = await screen([.5, .25]); await page.mouse.move(...half); await page.mouse.down(); await page.mouse.move(half[0] + 30, half[1] + 30); await page.mouse.up(); await settle(); assert.deepEqual(await doc(), preserved);
  // Save/load and actual SVG export retain the new content.
  const downloadPromise = page.waitForEvent('download'); await page.locator('#file-menu summary').click(); await page.locator('#save-local').click(); const file = await downloadPromise;
  const saved = JSON.parse(fs.readFileSync(await file.path(), 'utf8')); assert.equal(saved.version, 10); assert(saved.annotations.some(a => a.kind === 'segment'));
  await page.setInputFiles('#file-input', await file.path()); await settle(); assert.deepEqual(await doc(), saved);
  await page.locator('#export-tab').click(); await page.locator('#export-format').selectOption('svg'); const svgPromise = page.waitForEvent('download'); await page.locator('#export-image').click(); const svg = fs.readFileSync(await (await svgPromise).path(), 'utf8');
  fs.writeFileSync('/private/tmp/graph-03-export.svg',svg);
  assert(svg.includes('annotation') && svg.includes('AB') && svg.includes('BC') && svg.includes('font-size:70%'), 'SVG includes labels, arrows and rich text');
  await page.locator('#export-panel [data-close-side]').click();
  await page.locator('#view-menu summary').click(); await page.locator('#theme').selectOption('dark'); await page.keyboard.press('Escape'); await settle();
  await page.screenshot({ path: '/private/tmp/graph-03-desktop.png' });
  await page.setViewportSize({ width: 390, height: 850 }); await page.waitForTimeout(250); await settle(); assert(await page.locator('body').evaluate(el => el.scrollWidth <= innerWidth));
  await page.locator('#list-toggle').tap(); await ann('AB').tap(); await page.getByLabel('文字サイズ（px）', { exact: true }).fill('16'); await page.getByLabel('文字サイズ（px）', { exact: true }).press('Tab'); await settle();
  await page.screenshot({ path: '/private/tmp/graph-03-mobile.png' });
  await page.locator('#stage').focus(); await page.keyboard.press('Escape'); await page.locator('#help-button').focus(); await page.keyboard.press('Enter'); await page.locator('#operation-help:visible').waitFor(); await page.keyboard.press('Escape');
  const cdp=await context.newCDPSession(page), touch=await screen([2,-2]), beforeTouch=await doc();
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch[0],y:touch[1]}]});
  await page.waitForFunction(()=>GraphEditor.getState().dragging);
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch[0]+12,y:touch[1]-20}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchCancel',touchPoints:[]});await settle();assert.deepEqual(await doc(),beforeTouch,'touch cancellation preserves the document');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:touch[0],y:touch[1]}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:touch[0]+12,y:touch[1]-20}]});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle();assert.notDeepEqual(await doc(),beforeTouch,'touch drag commits the shared endpoint');
  await page.setViewportSize({width:1360,height:900});await page.waitForTimeout(200);await settle();
  await page.locator('#mode-3d').click();await settle();assert.equal((await doc()).annotations.length,saved.annotations.length);
  await page.locator('#axes-button').click();
  for(const [key,value] of [['x','α'],['y','β'],['z','γ']])await axes(key).getByLabel('数式で使う記号',{exact:true}).fill(value);
  await submit();await seriesAdd();await page.locator('#add-function').click();await fill('数式（例：γ = α^2 + β^2）','γ = α^2 + β^2');await submit();
  assert.equal((await doc()).series.at(-1).expression,'z = x^2 + y^2');
  assert.equal(await page.evaluate(()=>document.querySelector('#plot').layout.scene.zaxis.title.text),'γ');
  const legacy=await page.evaluate(()=>{const d=GraphCore.createDocument();d.version=2;delete d.charts;delete d.comparison;delete d.presentation;delete d.output;d.series.push(GraphCore.createSeries());const p=GraphCore.createAnnotation('point');delete p.label;d.annotations.push(p);for(const a of Object.values(d.axes)){delete a.symbol;delete a.ticks;}return d;});
  await page.setInputFiles('#file-input',{name:'version2.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(legacy))});await settle();
  assert.equal((await doc()).version,10);assert.equal((await doc()).axes.x.symbol,'x');assert.equal((await doc()).annotations[0].label.visible,true);
  assert.deepEqual(errors, []); await browser.close(); await new Promise(resolve => server.close(resolve));
  console.log('graph phase3-browser.test.cjs: ok');
})().catch(async error => { if (page) await page.screenshot({ path: '/private/tmp/graph-03-failure.png' }).catch(() => {}); if (browser) await browser.close(); server.close(); console.error(error); process.exitCode = 1; });
