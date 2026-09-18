const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js');let chromium;
const Toolbar=require('./toolbar-helpers.cjs');
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(error?'not found':data);});});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
  page=await browser.newPage({viewport:{width:1280,height:900},hasTouch:true,acceptDownloads:true});const errors=[];page.on('pageerror',e=>errors.push(e.message));
  const settle=()=>page.waitForFunction(()=>window.GraphEditor&&!GraphEditor.getState().drawing&&!document.querySelector('#editor-dialog').open);
  const dialog=page.locator('#editor-dialog');
  const doc=()=>page.evaluate(()=>GraphEditor.getDocument());
  await page.goto(process.env.GRAPH_TEST_URL||'http://127.0.0.1:'+server.address().port+'/tools/graph/index.html');await settle();
  const fixture=C.createDocument(),series=C.createSeries('function');fixture.name='教材用の出力';fixture.axes.x.min=-2;fixture.axes.x.max=3;fixture.axes.y.min=-2;fixture.axes.y.max=5;series.expression='x^2';fixture.series=[series];
  await page.locator('#file-input').setInputFiles({name:'output.graph.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(()=>GraphEditor.getDocument().name==='教材用の出力');await settle();
  await Toolbar.openAxes(page);await dialog.getByRole('tab',{name:'目盛・表示',exact:true}).click();await dialog.getByLabel('軸の正方向に矢印を表示（2D）',{exact:true}).check();await dialog.getByLabel('原点に O を表示（2D）',{exact:true}).check();await dialog.getByLabel('目盛の線を表示',{exact:true}).uncheck();await dialog.getByLabel('目盛の数値を表示',{exact:true}).uncheck();await page.locator('#dialog-submit').click();await settle();
  const layout=await page.evaluate(()=>document.querySelector('#plot').layout);
  assert.equal(layout.xaxis.ticks,'');assert.equal(layout.yaxis.showticklabels,false);assert.equal(layout.annotations.filter(a=>a.name?.startsWith('__graph_')).length,3);
  const arrow=await page.locator('#plot .annotation-arrow-g path').count();assert(arrow>=2,'axis arrows render in Chrome');
  await page.locator('#export-tab').click();await page.locator('#output-width').fill('1000');await page.locator('#output-height').fill('600');await page.locator('#output-margin').fill('50');await page.locator('#output-fontSize').fill('18');await page.locator('#output-fontSize').press('Tab');
  await Toolbar.setAppearance(page,{theme:'dark'});await page.keyboard.press('Escape');await settle();
  await page.locator('#export-format').selectOption('svg');await page.locator('#export-scale').selectOption('1');
  let waiting=page.waitForEvent('download');await page.locator('#export-image').click();const svg=fs.readFileSync(await(await waiting).path(),'utf8');
  assert.match(svg,/width="1000"/);assert.match(svg,/height="600"/);assert.match(svg,/>O</);assert(!svg.includes('rgb(229, 231, 235)'), 'axis decorations use dark text in white export');
  assert.equal(await page.locator('html').getAttribute('data-theme'),'dark');assert.equal((await doc()).output.margin,50);
  await page.locator('#export-format').selectOption('png');await page.locator('#export-scale').selectOption('2');waiting=page.waitForEvent('download');await page.locator('#export-image').click();const png=fs.readFileSync(await(await waiting).path());assert.equal(png.readUInt32BE(16),2000);assert.equal(png.readUInt32BE(20),1200);
  const before=await doc();await page.locator('#output-width').fill('200');await page.locator('#output-width').press('Tab');assert.deepEqual(await doc(),before);await page.locator('#output-width').fill('1000');await page.locator('#output-width').press('Tab');
  for(const [paper,orientation,width,height]of [['a4','portrait',210,297],['a4','landscape',297,210],['b5','portrait',182,257],['b5','landscape',257,182]]){
    await page.locator('#output-paper').selectOption(paper);await page.locator('#output-orientation').selectOption(orientation);await page.locator('#print-preview').click();await dialog.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#print-sheet img')?.complete);
    assert.match(await page.locator('#print-page-style').textContent(),new RegExp(width+'mm '+height+'mm'));await page.pdf({path:'/private/tmp/graph-output-'+paper+'-'+orientation+'.pdf',preferCSSPageSize:true,printBackground:true});
    await page.screenshot({path:'/private/tmp/graph-output-preview.png'});await page.keyboard.press('Escape');assert.equal(await page.locator('body').evaluate(e=>e.classList.contains('print-ready')),false);
  }
  await page.locator('#output-title').uncheck();await page.locator('#print-preview').click();await dialog.waitFor({state:'visible'});assert.equal(await page.locator('#print-sheet h1').count(),0);await page.keyboard.press('Escape');
  const saved=await doc();assert.equal(saved.output.title,false);assert.equal(saved.presentation.axisArrows,true);
  await page.setViewportSize({width:390,height:850});await Toolbar.setAppearance(page,{textSize:'largest'});await page.keyboard.press('Escape');
  await page.locator('#print-preview').click();await dialog.waitFor({state:'visible'});assert(await dialog.evaluate(e=>e.scrollWidth<=e.clientWidth));assert(await page.locator('body').evaluate(e=>e.scrollWidth<=innerWidth));await page.screenshot({path:'/private/tmp/graph-output-mobile.png'});await page.keyboard.press('Escape');
  assert.deepEqual(errors,[]);console.log('publication-browser.test.cjs: ok');
})().catch(async error=>{if(page)await page.screenshot({path:'/private/tmp/graph-output-failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
