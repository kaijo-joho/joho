/* Draft preservation, accessible dialog tabs and visible validation targets. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js'),T=require('../tables.js'),Charts=require('../charts.js');
const Toolbar=require('./toolbar-helpers.cjs');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(error?'not found':data);});});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1320,height:950}});page.setDefaultTimeout(15000);
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const dialog=page.locator('#editor-dialog'),settle=()=>page.waitForFunction(()=>window.GraphEditor&&!GraphEditor.getState().drawing),doc=()=>page.evaluate(()=>GraphEditor.getDocument());
  const tab=name=>dialog.getByRole('tab',{name,exact:true}),close=async()=>{await page.locator('#dialog-cancel').click();await dialog.waitFor({state:'hidden'});await settle();};
  const apply=async()=>{await page.locator('#dialog-submit').click();await dialog.waitFor({state:'hidden'});await settle();};
  const detail=async(id,label)=>{await page.locator('[data-object-id="'+id+'"]').click();await page.locator('#selection-toolbar').getByRole('button',{name:label,exact:true}).click();};
  await page.goto(process.env.GRAPH_TEST_URL||'http://127.0.0.1:'+server.address().port+'/tools/graph/index.html');await settle();
  const fixture=C.createDocument();fixture.name='設定の整理';fixture.equalScale=false;
  const series=C.createSeries('data2d');series.id='measure';series.name='測定値';T.assign(series,{columns:['時刻','位置'],rows:[[0,1],[1,3],[2,5]],mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});fixture.series=[series];
  const chart=Charts.create('scatter',{seriesId:series.id,name:'散布図',model:'linear'});chart.id='scatter';fixture.charts=[chart];
  await page.locator('#file-input').setInputFiles({name:'dialog.graph.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>GraphEditor.getDocument().name==='設定の整理');await settle();const original=await doc();

  await detail('measure','数表・出典');assert.equal(await dialog.getByRole('tab').count(),3);assert.equal(await dialog.locator('[role=tab] svg').count(),3);
  assert.equal(await dialog.locator('.graph-table-editor__mapping-details').getAttribute('open'),'');
  assert.equal(await dialog.getByLabel('横軸の列',{exact:true}).inputValue(),'0');assert.equal(await dialog.getByLabel('縦軸の列',{exact:true}).inputValue(),'1');
  await dialog.getByLabel('2列目の名前',{exact:true}).fill('距離');await dialog.getByLabel('2列目の名前',{exact:true}).press('Tab');assert.equal(await dialog.getByLabel('縦軸の列',{exact:true}).locator('option:checked').innerText(),'距離');await dialog.getByLabel('2列目の名前',{exact:true}).fill('位置');await dialog.getByLabel('2列目の名前',{exact:true}).press('Tab');
  const sourceCell=dialog.getByLabel('2行2列',{exact:true});await sourceCell.click();await sourceCell.press('F2');await sourceCell.fill('12');await sourceCell.press('Tab');await tab('描画').click();await dialog.getByLabel('点の結び方',{exact:true}).selectOption('linear');
  await tab('出典').click();await dialog.getByLabel('資料名',{exact:true}).fill('試行記録');await dialog.getByLabel('出典URL（https）',{exact:true}).fill('invalid');
  await tab('数表').click();await page.locator('#dialog-submit').click();assert.equal(await tab('出典').getAttribute('aria-selected'),'true');assert(await dialog.getByLabel('出典URL（https）',{exact:true}).evaluate(input=>input===document.activeElement));
  assert.deepEqual(await doc(),original);await dialog.getByLabel('出典URL（https）',{exact:true}).fill('https://example.org/data');
  await tab('出典').focus();await page.keyboard.press('Home');assert.equal(await tab('数表').getAttribute('aria-selected'),'true');assert.equal(await dialog.getByLabel('2行2列',{exact:true}).inputValue(),'12');
  await page.keyboard.press('ArrowRight');assert.equal(await tab('描画').getAttribute('aria-selected'),'true');assert.equal(await dialog.getByLabel('点の結び方',{exact:true}).inputValue(),'linear');await page.keyboard.press('End');assert.equal(await tab('出典').getAttribute('aria-selected'),'true');
  await close();assert.deepEqual(await doc(),original);assert(await page.locator('#selection-toolbar').getByRole('button',{name:'数表・出典',exact:true}).evaluate(el=>el===document.activeElement));

  await detail('measure','数表・出典');const draftCell=dialog.getByLabel('2行2列',{exact:true});await draftCell.click();await draftCell.press('F2');await draftCell.fill('12');await draftCell.press('Tab');await dialog.locator('.graph-table-editor__column-menu summary').click();await dialog.getByRole('button',{name:'計算列を追加',exact:true}).click();await dialog.getByLabel('計算式',{exact:true}).fill('[@位置]*2');
  await tab('出典').click();await dialog.getByLabel('資料名',{exact:true}).fill('計算の記録');await page.locator('#dialog-submit').click();assert.equal(await tab('数表').getAttribute('aria-selected'),'true');assert.match(await page.locator('#dialog-error').innerText(),/計算列の設定/);assert.equal(await dialog.getByLabel('計算式',{exact:true}).inputValue(),'[@位置]*2');assert.equal(await page.locator('dialog[open]').count(),1);
  await dialog.getByRole('button',{name:'取消',exact:true}).click();await apply();const saved=await doc();assert.equal(saved.series[0].rows[1][1],12);assert.equal(saved.series[0].source.title,'計算の記録');
  await page.locator('#undo').click();await settle();assert.deepEqual(await doc(),original,'all sections commit a single undo entry');await page.locator('#redo').click();await settle();

  await Toolbar.openAxes(page);const range=dialog.locator('[data-dialog-panel=range]'),names=dialog.locator('[data-dialog-panel=names]');
  const xBox=await range.locator('[data-axis=x]').boundingBox(),yBox=await range.locator('[data-axis=y]').boundingBox();assert(Math.abs(xBox.y-yBox.y)<2&&yBox.x>xBox.x,'axis ranges stay side by side');
  await range.locator('[data-axis=x]').getByLabel('最小値',{exact:true}).fill('-2');await tab('軸名').click();await names.locator('[data-axis=x]').getByLabel('軸名（表示）',{exact:true}).fill('時間');
  await tab('目盛・表示').click();await dialog.getByLabel('グリッドを表示',{exact:true}).uncheck();await tab('範囲').click();assert.equal(await range.locator('[data-axis=x]').getByLabel('最小値',{exact:true}).inputValue(),'-2');await close();assert.deepEqual(await doc(),saved);

  await detail('scatter','分析グラフの設定');await tab('書式').click();await dialog.getByRole('button',{name:'色を変更：赤',exact:true}).click();await dialog.getByLabel('点の大きさ',{exact:true}).fill('-1');await dialog.getByLabel('線の太さ',{exact:true}).fill('-2');await tab('データ').click();await page.locator('#dialog-submit').click();assert.equal(await tab('書式').getAttribute('aria-selected'),'true');assert(await dialog.getByLabel('点の大きさ',{exact:true}).evaluate(el=>el===document.activeElement));
  await dialog.getByLabel('点の大きさ',{exact:true}).fill('10');await dialog.getByLabel('線の太さ',{exact:true}).fill('2');
  await dialog.locator('summary').filter({hasText:'RGBで指定'}).click();await dialog.getByLabel('R',{exact:true}).fill('260');await dialog.locator('summary').filter({hasText:'RGBで指定'}).click();await tab('データ').click();await page.locator('#dialog-submit').click();assert(await dialog.getByLabel('R',{exact:true}).isVisible());assert(await dialog.getByLabel('R',{exact:true}).evaluate(el=>el===document.activeElement));await dialog.getByLabel('R',{exact:true}).fill('220');
  await tab('軸').click();await dialog.getByLabel('横軸の名前',{exact:true}).fill('経過時間');await tab('データ').click();await apply();const edited=await doc();assert.equal(edited.charts[0].style.pointSize,10);assert.equal(edited.charts[0].color,'#dc2626');assert.equal(edited.charts[0].axes.x.label,'経過時間');

  // Narrow screens and large text keep each section and the Apply/Cancel actions usable.
  await Toolbar.openSettings(page);await page.locator('[data-theme-value="dark"]').click();await page.locator('#text-size').selectOption('largest');await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:900});await settle();
  await page.locator('[data-quick-control="edit-detail"]').click();for(const label of ['データ','軸','書式']){await tab(label).click();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));}
  await page.screenshot({path:'/private/tmp/graph-019-chart-mobile.png'});await close();
  await page.setViewportSize({width:1320,height:950});await detail('measure','数表・出典');await page.screenshot({path:'/private/tmp/graph-019-table-desktop.png'});await page.setViewportSize({width:390,height:900});await tab('数表').click();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth+1));await page.screenshot({path:'/private/tmp/graph-019-table-mobile.png'});await close();
  assert.deepEqual(errors,[]);console.log('dialog-usability-browser.test.cjs: ok');
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:'/private/tmp/graph-019-dialog-failure.png'}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
