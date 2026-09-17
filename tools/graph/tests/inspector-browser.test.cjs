/* Chrome coverage of the docked inspector, object menu, and axis controls. */
const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
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
  page = await browser.newPage({ viewport: { width: 1280, height: 850 }, hasTouch: true });
  const errors = []; page.on('pageerror', error => errors.push(error.message));
  await page.goto(process.env.GRAPH_TEST_URL || `http://127.0.0.1:${server.address().port}/tools/graph/index.html`);
  const settle = async () => { await page.waitForFunction(() => window.GraphEditor && !GraphEditor.getState().drawing); await page.waitForFunction(() => { const p=document.querySelector('#plot'); return p.hidden || Math.abs(p.clientWidth-p._fullLayout?.width)<2; }); };
  const doc = () => page.evaluate(() => GraphEditor.getDocument());
  const item = id => page.locator('[data-object-id="' + id + '"]');
  const more = (type,id) => page.locator('[data-object-details="' + type + ':' + id + '"]');
  const bar = page.locator('#selection-toolbar'), dialog = page.locator('#editor-dialog');
  const submit = async () => { await page.locator('#dialog-submit').click(); await dialog.waitFor({state:'hidden'}); await settle(); };
  const menu = page.locator('#object-menu');
  const add = async () => { if(await page.locator('#series-add-panel').isHidden()) await page.locator('#series-add-toggle').click(); };
  const openAxes = async () => { if(await page.locator('#axes-button').isVisible()) await page.locator('#axes-button').click(); else { await page.locator('#view-menu summary').click(); await page.locator('#axes-menu').click(); } await dialog.waitFor({state:'visible'}); };
  await settle();
  assert.equal(await page.locator('#objects .add-menu-toggle').count(),1);
  await add();
  for(const id of ['add-function','add-data','import-csv','add-point','add-segment','add-region','add-text','add-tangent','add-intersection','add-guide','add-regression','add-residual-chart','add-scatter-chart','add-histogram-chart','add-box-chart','add-parameter']) assert.equal(await page.locator('#series-add-panel #'+id).count(),1,id);
  await page.keyboard.press('Escape');
  let first=(await doc()).series[0].id;
  await item(first).click(); await settle();
  assert.equal(await page.evaluate(()=>GraphEditor.getState().side),'format');
  assert(await page.locator('#format-panel #selection-toolbar').isVisible());
  assert.equal(await dialog.isVisible(),false);
  const stageBounds=await page.locator('#stage').boundingBox(),sideBounds=await page.locator('#side-panel').boundingBox();
  assert(stageBounds.x+stageBounds.width<=sideBounds.x+1,'inspector does not cover graph');
  await bar.locator('[data-quick-control="color-dc2626"]').click();
  await bar.getByLabel('線の太さ',{exact:true}).fill('4'); await bar.getByLabel('線の太さ',{exact:true}).press('Tab'); await settle();
  assert.equal((await doc()).series[0].style.color,'#dc2626');assert.equal((await doc()).series[0].style.width,4);
  await bar.getByRole('button',{name:'数式・範囲',exact:true}).click();await dialog.getByLabel('名前',{exact:true}).fill('放物線');await submit();
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.quickControl),'edit-detail','detail modal returns to inspector');
  await more('series',first).click();await menu.getByRole('menuitem',{name:'複製',exact:true}).click();await settle();
  const second=(await doc()).series[1].id;
  await item(first).focus();await page.keyboard.press('Alt+End');await settle();
  assert.deepEqual((await doc()).series.map(s=>s.id),[second,first]);
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.objectId),first);
  await page.locator('#undo').click();await settle();assert.deepEqual((await doc()).series.map(s=>s.id),[first,second]);
  await more('series',second).focus();await page.keyboard.press('ArrowDown');assert(await menu.isVisible());
  await page.keyboard.press('End');assert.equal(await page.evaluate(()=>document.activeElement.textContent),'削除');await page.keyboard.press('Escape');
  assert.equal(await page.evaluate(()=>document.activeElement.dataset.objectDetails),'series:'+second);
  await more('series',second).click();await menu.getByRole('menuitem',{name:'削除',exact:true}).click();await settle();assert.equal((await doc()).series.length,1);
  await page.locator('#undo').click();await settle();assert.equal((await doc()).series.length,2);

  await item(first).click();await bar.getByRole('button',{name:'接線を追加',exact:true}).click();await dialog.waitFor({state:'visible'});
  assert.match(await page.locator('#dialog-title').innerText(),/接線/);await submit();
  assert.equal((await doc()).annotations.at(-1).seriesId,first,'related tangent retains selected source');
  await add();await page.locator('#add-parameter').click();await submit();
  assert(await page.locator('#parameter-list input[type=range]').isVisible());
  await more('parameter','a').click();await menu.getByRole('menuitem',{name:'削除',exact:true}).click();await settle();assert.equal((await doc()).parameters.length,0);
  await page.locator('#undo').click();await settle();assert.equal((await doc()).parameters.length,1);

  await page.locator('#zoom-toggle').click();
  let before=(await doc()).axes;
  await page.getByRole('button',{name:'横方向のみ拡大',exact:true}).click();await settle();let after=(await doc()).axes;
  assert.deepEqual(after.y,before.y);assert(Math.abs((after.x.max-after.x.min)/(before.x.max-before.x.min)-.8)<1e-10);
  before=after;await page.getByRole('button',{name:'縦方向のみ縮小',exact:true}).click();await settle();after=(await doc()).axes;
  assert.deepEqual(after.x,before.x);assert(Math.abs((after.y.max-after.y.min)/(before.y.max-before.y.min)-1.25)<1e-10);
  await page.keyboard.press('Escape');assert.equal(await page.evaluate(()=>document.activeElement.id),'zoom-toggle');
  await openAxes();
  const x=dialog.locator('[data-axis=x]'),y=dialog.locator('[data-axis=y]');
  const xb=await x.boundingBox(),yb=await y.boundingBox();assert(Math.abs(xb.y-yb.y)<2&&xb.x+xb.width<yb.x,'axis fields have two columns');
  assert(await dialog.evaluate(el=>el.querySelector('#dialog-submit').getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom-4),'axis dialog submit is not clipped');
  await page.screenshot({path:'/private/tmp/graph-inspector-axes-desktop.png'});
  for(const axis of [x,y]){await axis.getByLabel('最小値',{exact:true}).fill('-5');await axis.getByLabel('最大値',{exact:true}).fill('5');await axis.getByLabel('目盛の間隔（空欄で自動）',{exact:true}).fill('1');await axis.getByLabel('目盛の数値の位置',{exact:true}).selectOption('axis');}
  await submit();
  let ticks=await page.evaluate(()=>document.querySelector('#plot').layout.annotations.filter(a=>a.name?.startsWith('__graph_axis_tick_')));
  assert(ticks.some(a=>a.name.includes('_x_'))&&ticks.some(a=>a.name.includes('_y_')));
  assert.equal((await doc()).axes.x.labelPosition,'axis');
  await openAxes();await y.getByLabel('目盛の数値の位置',{exact:true}).selectOption('edge');await submit();
  assert.equal(await page.evaluate(()=>document.querySelector('#plot').layout.yaxis.showticklabels),true);
  assert.equal(await page.evaluate(()=>document.querySelector('#plot').layout.xaxis.showticklabels),false);

  await openAxes();await dialog.getByLabel('各軸の1単位を同じ長さで表示',{exact:true}).check();await submit();
  const equalRanges=await page.evaluate(()=>GraphPlot.viewRanges(document.querySelector('#plot')));
  await page.locator('#zoom-toggle').click();await page.getByRole('button',{name:'横方向のみ拡大',exact:true}).click();await settle();
  assert.equal((await doc()).equalScale,false);assert.deepEqual((await doc()).axes.y.min,equalRanges.y.min);assert.deepEqual((await doc()).axes.y.max,equalRanges.y.max,'single-axis zoom keeps the other visible range when unlocking equal scale');
  await page.keyboard.press('Escape');

  await openAxes();await x.getByLabel('最小値',{exact:true}).fill('1');await x.getByLabel('最大値',{exact:true}).fill('100');await x.getByLabel('目盛',{exact:true}).selectOption('log');await submit();
  before=(await doc()).axes;await page.locator('#zoom-toggle').click();await page.getByRole('button',{name:'横方向のみ拡大',exact:true}).click();await settle();after=(await doc()).axes;
  assert.deepEqual(after.y,before.y);assert(Math.abs(Math.log10(after.x.min*after.x.max)-2)<1e-10,'log zoom keeps geometric center');
  await page.keyboard.press('Escape');
  const saved=await doc();await page.locator('#file-input').setInputFiles({name:'saved.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(saved))});await settle();assert.deepEqual((await doc()).axes,saved.axes,'positions and zoom survive save/load');
  await item(first).click();await settle();await page.screenshot({path:'/private/tmp/graph-inspector-desktop.png'});

  await page.mouse.move(1200,840);await page.setViewportSize({width:390,height:850});await settle();
  const mobileStage=await page.locator('#stage').boundingBox(),mobileSide=await page.locator('#side-panel').boundingBox();
  assert(mobileStage.y+mobileStage.height<=mobileSide.y+1,'narrow inspector is below graph');
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  await openAxes();const mx=await x.boundingBox(),my=await y.boundingBox();assert(my.y>=mx.y+mx.height,'narrow axis fields stack');
  assert(await dialog.evaluate(el=>el.querySelector('#dialog-submit').getBoundingClientRect().bottom<=el.getBoundingClientRect().bottom-4),'narrow axis dialog submit is not clipped');
  await page.screenshot({path:'/private/tmp/graph-inspector-axes-mobile.png'});
  await page.locator('#dialog-cancel').tap();
  await page.mouse.move(380,840);await page.locator('#list-toggle').tap();if(await page.locator('#series-add-panel').isVisible())await page.keyboard.press('Escape');await item(first).focus();await page.keyboard.press('Alt+End');await settle();
  await item(first).tap();await settle();assert(await bar.isVisible());
  await page.locator('#view-menu summary').tap();await page.locator('#theme').selectOption('dark');await page.locator('#text-size').selectOption('largest');await page.keyboard.press('Escape');await settle();
  assert.equal(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth),true);
  await page.screenshot({path:'/private/tmp/graph-inspector-mobile.png'});
  assert.deepEqual(errors,[]);
  console.log('inspector-browser.test.cjs: ok');
})().catch(async error=>{if(page)await page.screenshot({path:'/private/tmp/graph-inspector-failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
