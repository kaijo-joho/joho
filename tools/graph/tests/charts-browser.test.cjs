/* Chrome integration: derived statistical charts, comparison layout, and exports. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js'),T=require('../tables.js');let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(error?'not found':data);});});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true,acceptDownloads:true});await context.addInitScript(()=>Object.defineProperty(window,'showSaveFilePicker',{value:undefined,configurable:true}));page=await context.newPage();
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  const dialog=page.locator('#editor-dialog'),settle=()=>page.waitForFunction(()=>window.GraphEditor&&!GraphEditor.getState().drawing&&!document.querySelector('#editor-dialog').open),doc=()=>page.evaluate(()=>GraphEditor.getDocument());
  const importDoc=async value=>{await page.locator('#file-input').setInputFiles({name:'charts.graph.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(name=>GraphEditor.getDocument().name===name,value.name);await settle();};
  const submit=async()=>{await page.locator('#dialog-submit').click();await settle();};
  const detail=async(type,id)=>{await page.locator('[data-object-details="'+type+':'+id+'"]').click();await dialog.waitFor({state:'visible'});};
  const download=async action=>{const waiting=page.waitForEvent('download');await action();return await waiting;};
  await page.goto(process.env.GRAPH_TEST_URL||'http://127.0.0.1:'+server.address().port+'/tools/graph/index.html');await settle();

  const fixture=C.createDocument();fixture.name='分析グラフのUI';fixture.axes.x={...fixture.axes.x,symbol:'t',label:'時間',unit:'s',min:0,max:5};fixture.axes.y={...fixture.axes.y,symbol:'v',label:'速度',unit:'m/s',min:0,max:12};
  const measured=C.createSeries('data2d');measured.id='measurements';measured.name='多列の測定値';T.assign(measured,{columns:['時刻','速度','温度'],rows:[[0,1,10],[1,3,12],[2,5,14],[3,7,16],[4,9,18]],mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});fixture.series=[measured];
  const regression=C.createAnnotation('regression');regression.id='velocity-fit';regression.name='速度の回帰';regression.seriesId=measured.id;regression.model='linear';fixture.annotations=[regression];await importDoc(fixture);

  // Regression selection creates a residual chart through the annotation toolbar.
  await page.locator('[data-object-id="'+regression.id+'"]').click();await page.locator('[aria-label="残差グラフを表示"]').click();await page.waitForFunction(()=>GraphEditor.getDocument().charts.some(chart=>chart.kind==='residual'));let current=await doc(),residual=current.charts.find(chart=>chart.kind==='residual');assert.equal(await page.locator('#analysis-stage').isVisible(),true);assert.equal(await page.locator('#analysis-plot .plotly').count(),1);

  // The correlation cell makes a scatter chart.  Its settings dialog changes its regression model.
  await page.locator('#series-add-toggle').click();await page.locator('#show-statistics').click();await dialog.waitFor({state:'visible'});await page.locator('[data-correlation-pair="0,1"]').click();await page.waitForFunction(()=>GraphEditor.getDocument().charts.some(chart=>chart.kind==='scatter'));current=await doc();let scatter=current.charts.find(chart=>chart.kind==='scatter');await detail('chart',scatter.id);await dialog.getByLabel('散布図の回帰モデル',{exact:true}).selectOption('quadratic');await submit();scatter=(await doc()).charts.find(chart=>chart.id===scatter.id);assert.equal(scatter.model,'quadratic');

  // Distribution chart actions are available from the statistics dialog.
  await page.locator('#series-add-toggle').click();await page.locator('#show-statistics').click();await dialog.getByRole('button',{name:'ヒストグラムを作成',exact:true}).click();await page.waitForFunction(()=>GraphEditor.getDocument().charts.some(chart=>chart.kind==='histogram'));await page.locator('#series-add-toggle').click();await page.locator('#show-statistics').click();await dialog.getByRole('button',{name:'箱ひげ図を作成',exact:true}).click();await page.waitForFunction(()=>GraphEditor.getDocument().charts.some(chart=>chart.kind==='box'));current=await doc();assert.equal(current.charts.length,4);assert(current.charts.every(chart=>chart.id!==''));

  // Comparison uses all created charts, changes the grid columns, and accepts a reorder.
  await page.locator('#comparison-settings').click();await dialog.getByLabel('横に並べる数',{exact:true}).selectOption('3');const firstLabel='作図：'+fixture.name;await dialog.getByLabel(firstLabel+'を後へ',{exact:true}).click();await submit();current=await doc();assert.equal(current.comparison.columns,3);assert.notEqual(current.comparison.items[0],'main');assert.equal(await page.locator('#comparison-stage').isVisible(),true);assert.equal(await page.locator('.comparison-card').count(),current.comparison.items.length);
  const boxCard=page.locator('.comparison-card').filter({hasText:'多列の測定値の箱ひげ図'});await boxCard.locator('.box').first().waitFor();const boxCenters=await boxCard.locator('.box').evaluateAll(items=>items.map(item=>{const rect=item.getBoundingClientRect();return Math.round((rect.left+rect.right)/2);}).filter(Number.isFinite));assert.equal(new Set(boxCenters).size,3,'箱ひげ図の各列を別のカテゴリ位置に描画します。');

  // A data-table edit is reflected in every derived chart rebuild and its visible scatter trace.
  await detail('series',measured.id);await dialog.locator('input[aria-label="1行2列"]').fill('21');await submit();await page.locator('#workspace-view').selectOption(scatter.id);await page.waitForFunction(()=>document.querySelector('#analysis-plot').data&&document.querySelector('#analysis-plot').data[0].y[0]===21);assert.equal((await doc()).series[0].dataTable.rows[0][1],21);

  // Derived views use the common export and print controls.
  await page.locator('#workspace-view').selectOption('comparison');await page.waitForSelector('.comparison-card');await page.locator('#export-tab').click();await page.locator('#fit-comparison-output').click();await page.locator('#export-format').selectOption('svg');let saved=await download(()=>page.locator('#export-image').click());assert.match(saved.suggestedFilename(),/\.svg$/);await saved.saveAs('/private/tmp/graph-charts-comparison.svg');await page.locator('#export-format').selectOption('png');saved=await download(()=>page.locator('#export-image').click());assert.match(saved.suggestedFilename(),/\.png$/);await saved.saveAs('/private/tmp/graph-charts-comparison.png');
  for(const [paper,width,height]of [['a4',297,210],['b5',257,182]]){await page.locator('#output-paper').selectOption(paper);await page.locator('#output-orientation').selectOption('landscape');await page.locator('#print-preview').click();await dialog.waitFor({state:'visible'});await page.waitForFunction(()=>document.querySelector('#print-sheet img')?.complete);assert.equal(await page.locator('#print-sheet img').count(),1);assert.match(await page.locator('#print-page-style').textContent(),new RegExp(width+'mm '+height+'mm'));await page.pdf({path:'/private/tmp/graph-charts-comparison-'+paper+'.pdf',preferCSSPageSize:true,printBackground:true});await page.keyboard.press('Escape');}

  // Dark, touch-sized UI, Escape and keyboard focus remain usable at phone width.
  await page.locator('#view-menu summary').click();await page.locator('#theme').selectOption('dark');await page.keyboard.press('Escape');await page.setViewportSize({width:390,height:850});await page.waitForTimeout(150);await settle();if(await page.locator('#export-panel [data-close-side]').isVisible())await page.locator('#export-panel [data-close-side]').tap();await page.locator('#list-toggle').tap();await page.locator('#chart-add-toggle').tap();await page.keyboard.press('Tab');await page.keyboard.press('Escape');await page.waitForTimeout(150);await settle();
  // Leave the comparison itself visible in the evidence image, then record the
  // actual overflowing boxes before making the responsive assertion.
  if(await page.locator('#export-panel [data-close-side]').isVisible())await page.locator('#export-panel [data-close-side]').tap();
  if(await page.locator('#list-close').isVisible())await page.locator('#list-close').tap();
  await page.waitForTimeout(100);await settle();await page.screenshot({path:'/private/tmp/graph-charts-mobile.png'});
  const narrow=await page.evaluate(()=>({innerWidth,body:{scrollWidth:document.body.scrollWidth,clientWidth:document.body.clientWidth},html:{scrollWidth:document.documentElement.scrollWidth,clientWidth:document.documentElement.clientWidth},objects:document.querySelector('#objects')?.getBoundingClientRect().toJSON(),stage:document.querySelector('#stage')?.getBoundingClientRect().toJSON(),side:document.querySelector('#side-panel')?.getBoundingClientRect().toJSON()}));assert(narrow.body.scrollWidth<=narrow.innerWidth,JSON.stringify(narrow));await page.setViewportSize({width:1280,height:900});await page.screenshot({path:'/private/tmp/graph-charts-desktop.png'});
  assert.deepEqual(errors,[]);console.log('charts-browser.test.cjs: ok');
})().catch(async error=>{if(page)await page.screenshot({path:'/private/tmp/graph-charts-failure.png'}).catch(()=>{});console.error(error);process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
