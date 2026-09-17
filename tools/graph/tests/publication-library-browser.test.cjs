/* Output snapshots, clipboard payloads (without touching the system clipboard), and new library entries. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js'),T=require('../tables.js');let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(error?'not found':data);});});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:950},acceptDownloads:true});
  await context.addInitScript(()=>{
    window.__copies=[];window.__texts=[];window.__clipboardDenied=false;
    Object.defineProperty(navigator,'clipboard',{configurable:true,value:{
      async write(items){
        if(window.__clipboardDenied)throw new DOMException('denied','NotAllowedError');
        const blob=await items[0].getType('image/png'),bytes=await blob.arrayBuffer(),data=new DataView(bytes);
        const bitmap=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=canvas.height=1;
        const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);bitmap.close();
        window.__copies.push({type:blob.type,width:data.getUint32(16),height:data.getUint32(20),alpha:ctx.getImageData(0,0,1,1).data[3]});
      },
      async writeText(text){if(window.__clipboardDenied)throw new Error('denied');window.__texts.push(text);}
    }});
  });
  page=await context.newPage();page.setDefaultTimeout(15000);const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const settle=()=>page.waitForFunction(()=>window.GraphEditor&&!GraphEditor.getState().drawing);
  const doc=()=>page.evaluate(()=>GraphEditor.getDocument()),dialog=page.locator('#editor-dialog'),bar=page.locator('#selection-toolbar');
  const load=async value=>{await page.locator('#file-input').setInputFiles({name:'test.graph.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(name=>GraphEditor.getDocument().name===name,value.name);await settle();};
  const download=async action=>{const waiting=page.waitForEvent('download');await action();return fs.readFileSync(await(await waiting).path());};
  const close=()=>page.locator('#dialog-close').click();
  const copied=async()=>{const count=await page.evaluate(()=>__copies.length);await page.locator('#copy-image').click();await page.waitForFunction(n=>__copies.length===n+1,count);await page.waitForFunction(()=>!document.querySelector('#copy-image').disabled);return page.evaluate(()=>__copies.at(-1));};
  await page.goto(process.env.GRAPH_TEST_URL||'http://127.0.0.1:'+server.address().port+'/tools/graph/index.html');await settle();
  const fixture=C.createDocument(),series=C.createSeries('data2d');fixture.name='出力の確認';series.id='measurements';series.name='測定値';
  T.assign(series,{columns:['時刻','位置'],rows:[[0,0],[1,1],[2,4]],mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});
  series.source={kind:'model',title:'試験用の模擬データ',url:'',notes:'条件と利用範囲 <script>実行しない</script>'};fixture.series=[series];await load(fixture);
  await page.locator('[data-object-id="measurements"]').click();assert.equal(await bar.locator('summary[aria-label="その他"]').count(),0);assert.equal(await bar.getByRole('button',{name:'数値をCSVで保存',exact:true}).count(),0);
  await bar.getByRole('button',{name:'数表・出典',exact:true}).click();await dialog.getByLabel('2行2列',{exact:true}).fill('12');
  const csv=(await download(()=>dialog.getByRole('button',{name:'数値をCSVで保存',exact:true}).click())).toString('utf8');assert.match(csv,/1,12/);assert.equal((await doc()).series[0].dataTable.rows[1][1],1,'CSV uses the draft without committing');
  await dialog.getByRole('button',{name:'計算列を追加',exact:true}).click();await dialog.getByRole('button',{name:'数値をCSVで保存',exact:true}).click();assert.match(await page.locator('#dialog-error').innerText(),/未適用/);await close();assert.deepEqual(await doc(),C.validateDocument(fixture));
  await page.locator('#export-tab').click();await page.locator('#output-preset').selectOption('slide');assert.equal((await doc()).output.width,1600);assert.equal((await doc()).output.height,900);
  await page.locator('#undo').click();assert.equal((await doc()).output.width,1200);await page.locator('#redo').click();assert.equal(await page.locator('#output-preset').inputValue(),'slide');
  await page.locator('#export-scale').selectOption('1');await page.locator('#export-background').selectOption('transparent');
  await page.locator('#view-menu summary').click();await page.locator('#theme').selectOption('dark');await page.keyboard.press('Escape');await settle();
  const saved=await doc();assert.deepEqual(await copied(),{type:'image/png',width:1600,height:900,alpha:0});assert.deepEqual(await doc(),saved);assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');
  assert.match(await page.locator('#export-size-note').innerText(),/1600 × 900/);
  await page.locator('#export-format').selectOption('svg');await page.locator('#image-preview').click();await dialog.locator('.image-export-preview img').waitFor();
  const preview=await dialog.locator('.image-export-preview img').getAttribute('src');const svg=(await download(()=>dialog.getByRole('button',{name:'この画像を保存',exact:true}).click())).toString();assert.equal(svg,decodeURIComponent(preview.slice(preview.indexOf(',')+1)));assert.match(svg,/width="1600"/);assert.doesNotMatch(svg,/>出力の確認<\/text>/);await page.screenshot({path:'/private/tmp/graph-017-image-preview.png'});await close();
  await page.locator('#export-sources').click();const source=await dialog.getByLabel('出典・条件のテキスト',{exact:true}).inputValue();assert.match(source,/<script>実行しない<\/script>/);assert.equal(await dialog.locator('script').count(),0);await dialog.getByRole('button',{name:'出典・条件をコピー',exact:true}).click();assert.equal(await page.evaluate(()=>__texts.at(-1)),source);
  await page.evaluate(()=>{__clipboardDenied=true;});await dialog.getByRole('button',{name:'出典・条件をコピー',exact:true}).click();assert.match(await dialog.getByRole('status').innerText(),/⌘C/);await close();
  await page.locator('#copy-image').click();await page.waitForFunction(()=>!document.querySelector('#copy-image').disabled);assert.match(await page.locator('#export-status').innerText(),/許可/);await page.evaluate(()=>{__clipboardDenied=false;});await copied();
  await page.evaluate(()=>{window.__realExport=GraphPlot.exportImage;GraphPlot.exportImage=async()=>{throw new Error('試験用の描画失敗');};});await page.locator('#copy-image').click();await page.waitForFunction(()=>!document.querySelector('#copy-image').disabled);assert.match(await page.locator('#export-status').innerText(),/描画失敗/);await page.evaluate(()=>{GraphPlot.exportImage=__realExport;});await copied();
  await page.evaluate(()=>{window.__clipboard=navigator.clipboard;Object.defineProperty(navigator,'clipboard',{configurable:true,value:undefined});});await page.locator('#copy-image').click();assert.match(await page.locator('#export-status').innerText(),/画像を保存/);await page.evaluate(()=>Object.defineProperty(navigator,'clipboard',{configurable:true,value:__clipboard}));
  for(const name of ['等加速度運動：区間平均速度','オームの法則：抵抗を計算','フックの法則：伸びと力','センサー時系列：差分と移動平均']){
    if(await page.locator('#templates-panel').isHidden())await page.locator('#templates-tab').click();await page.locator('#template-list .template-card').filter({hasText:name}).click();await settle();const value=await doc();assert.equal(value.name,name);assert.equal(await page.locator('#plot-error').isVisible(),false);assert(value.series.every(s=>s.source.kind==='model'));
  }
  await page.locator('#workspace-view').selectOption('calculation-sensor-smoothed-chart');await settle();await page.locator('#export-tab').click();assert.equal((await copied()).type,'image/png');
  await page.locator('#workspace-view').selectOption('comparison');await settle();assert.equal((await copied()).type,'image/png');
  for(const id of ['jma-global-temperature-anomaly-2000-2024','jma-japan-temperature-anomaly-2000-2024','noaa-mauna-loa-co2-annual-2000-2024']){
    await page.locator('#series-add-toggle').click();await page.locator('#import-csv').click();await page.locator('[data-catalog-id="'+id+'"]').click();await page.locator('[data-import-summary]').waitFor();await page.locator('#dialog-submit').click();await settle();const s=(await doc()).series.at(-1);assert.equal(s.dataTable.rows.length,25);assert.equal(s.source.kind,'reference');assert.match(s.source.notes,/2026-09-17/);
  }
  const mixed=C.createDocument();mixed.name='次元切替';const surface=C.createSeries('surface');surface.id='surface';surface.expression='x+y';mixed.series=[surface];await load(mixed);await page.locator('[data-object-id="surface"]').click();await bar.getByRole('button',{name:'3Dで表示',exact:true}).click();await settle();assert.equal((await doc()).mode,'3d');assert.equal(await bar.locator('summary[aria-label="その他"]').count(),0);await page.locator('#export-tab').click();assert.equal((await copied()).type,'image/png');
  await page.setViewportSize({width:390,height:850});await page.locator('#view-menu summary').click();await page.locator('#text-size').selectOption('largest');await page.keyboard.press('Escape');await settle();await page.locator('#image-preview').click();await dialog.locator('.image-export-preview img').waitFor();assert(await dialog.evaluate(el=>el.scrollWidth<=el.clientWidth));assert(await page.locator('body').evaluate(el=>el.scrollWidth<=innerWidth));await page.screenshot({path:'/private/tmp/graph-017-output-mobile.png'});await close();
  assert.deepEqual(errors,[]);console.log('publication-library-browser.test.cjs: ok');
})().catch(async error=>{if(page)await page.screenshot({path:'/private/tmp/graph-017-output-failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
