/* Chrome integration of matrix templates, data-row links, editing, and exports. */
const assert=require('node:assert/strict'),fs=require('node:fs'),http=require('node:http'),path=require('node:path'),os=require('node:os');
const C=require('../core.js'),T=require('../tables.js'),Charts=require('../charts.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../../..');
const server=http.createServer((req,res)=>{const file=path.resolve(root,'.'+decodeURIComponent(req.url.split('?')[0]));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}fs.readFile(file,(error,data)=>{res.writeHead(error?404:200,{'Content-Type':file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.svg')?'image/svg+xml':'text/html'});res.end(error?'not found':data);});});
let browser,page;
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));browser=await chromium.launch({channel:'chrome',headless:true});page=await browser.newPage({viewport:{width:1440,height:1000},acceptDownloads:true});
  const errors=[];page.on('pageerror',error=>errors.push(error.message));page.on('dialog',dialog=>dialog.accept());
  const dialog=page.locator('#editor-dialog'),settle=()=>page.waitForFunction(()=>window.GraphEditor&&!GraphEditor.getState().drawing),doc=()=>page.evaluate(()=>GraphEditor.getDocument()),state=()=>page.evaluate(()=>GraphEditor.getState());
  const importDoc=async value=>{await page.locator('#file-input').setInputFiles({name:'matrix.graph.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});await page.waitForFunction(name=>GraphEditor.getDocument().name===name,value.name);await settle();};
  const submit=async()=>{await page.locator('#dialog-submit').click();await dialog.waitFor({state:'hidden'});await settle();};
  const openTemplate=async name=>{if(await page.locator('#templates-panel').isHidden())await page.locator('#templates-tab').click();await page.locator('#template-search').fill(name);await page.locator('#template-list .template-card').filter({hasText:name}).first().click();await settle();};
  await page.goto(process.env.GRAPH_TEST_URL||'http://127.0.0.1:'+server.address().port+'/tools/graph/index.html');await settle();
  for(const [name,count]of [['相関の向きを比べる',4],['振り子の線形化',3],['東京の気象平年値を比べる',3]]){
    await openTemplate(name);const d=await doc();assert.equal((await state()).workspaceView,d.charts[0].id,'template opens its matrix immediately');assert.equal(d.charts[0].columns.length,count);
    assert.equal(await page.locator('#analysis-plot').evaluate(plot=>plot.data.filter(t=>t.type==='bar').length),count);assert.equal(await page.locator('#plot-error').isVisible(),false);
  }
  await page.locator('#templates-tab').click();await settle();await page.screenshot({path:'/private/tmp/graph-matrix-weather.png'});
  await openTemplate('相関の向きを比べる');await page.locator('#templates-tab').click();await settle();await page.screenshot({path:'/private/tmp/graph-matrix-correlation.png'});
  const fixture=C.createDocument();fixture.name='行列の編集と連動';fixture.axes.x.min=0;fixture.axes.x.max=6;
  const series=C.createSeries('data2d');series.id='matrix-data';series.name='行列の元データ';T.assign(series,{columns:['基準','測定','気温','分類','予備1','予備2'],columnTypes:['number','number','number','category','number','number'],rows:[[1,2,10,'甲',7,1],[2,5,null,'乙',7,2],[3,null,30,'甲',7,3],[4,8,15,'乙',7,4],[5,11,20,'甲',7,5]],mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});fixture.series=[series];
  const chart=Charts.create('matrix',{seriesId:series.id,columns:[0,1,2],name:'実験の行列'});chart.id='matrix';fixture.charts=[chart];fixture.comparison={columns:1,items:['main',chart.id]};await importDoc(fixture);await page.locator('#workspace-view').selectOption(chart.id);await settle();
  // Select a point in the upper middle cell: its trace uses x2/y2, not x/y.
  const point=await page.locator('#analysis-plot').evaluate(plot=>{const trace=plot.data.find(t=>t.xaxis==='x2'&&t.meta?.dataRows),i=trace.customdata.findIndex(row=>row[0]===4),box=plot.getBoundingClientRect(),x=plot._fullLayout.xaxis2,y=plot._fullLayout.yaxis2;return [box.left+x._offset+x.d2p(trace.x[i]),box.top+y._offset+y.d2p(trace.y[i])];});
  await page.mouse.click(...point);await page.waitForFunction(()=>GraphEditor.getState().observedSelection?.rowIndex===3);await settle();assert.deepEqual((await state()).observedSelection,{seriesId:series.id,rowIndex:3});
  assert.equal(await page.locator('#analysis-plot').evaluate(plot=>plot.data.filter(t=>t.meta?.observationHighlight).length),6);
  await page.getByRole('button',{name:'この行を数表で編集',exact:true}).click();await dialog.getByLabel('4行2列',{exact:true}).fill('9');await submit();assert.equal((await state()).workspaceView,'matrix');assert.equal((await doc()).series[0].dataTable.rows[3][1],9);
  await page.locator('[data-object-id="matrix"]').click();await page.locator('#selection-toolbar').getByRole('button',{name:'分析グラフの設定',exact:true}).click();
  assert.equal(await dialog.getByRole('checkbox',{name:'4: 分類',exact:true}).count(),0,'categorical columns are not offered');
  await dialog.getByRole('checkbox',{name:'5: 予備1',exact:true}).check();await dialog.getByRole('checkbox',{name:'6: 予備2',exact:true}).check();await page.locator('#dialog-submit').click();assert(await dialog.isVisible());assert.match(await page.locator('#dialog-error').innerText(),/2〜4/);
  await dialog.getByRole('checkbox',{name:'6: 予備2',exact:true}).uncheck();await submit();assert.deepEqual((await doc()).charts[0].columns,[0,1,2,4]);
  await page.locator('#undo').click();await settle();assert.deepEqual((await doc()).charts[0].columns,[0,1,2]);await page.locator('#redo').click();await settle();
  await page.locator('#view-menu summary').click();await page.locator('#theme').selectOption('dark');await page.keyboard.press('Escape');await settle();
  const exported=await page.evaluate(async()=>{
    const plot=document.querySelector('#analysis-plot'),original=Plotly.newPlot;let capture;
    Plotly.newPlot=async(...args)=>{capture={highlights:args[1].filter(t=>t.meta?.observationHighlight).length,axes:Object.entries(args[2]).filter(([key])=>/^[xy]axis\d*$/.test(key)).map(([,a])=>a.tickfont.color)};return original(...args);};
    try{const svg=await GraphWorkspace.exportChart(plot,{format:'svg',width:1200,height:1000,margin:64,fontSize:16,background:'white'}),png=await GraphWorkspace.exportChart(plot,{format:'png',width:960,height:800,margin:48,fontSize:14,background:'transparent'});return{...capture,svg,png};}finally{Plotly.newPlot=original;}
  });
  assert.equal(exported.highlights,0);assert.equal(exported.axes.length,32);assert(exported.axes.every(color=>color==='#172033'));assert(exported.png.startsWith('data:image/png;base64,'));
  const svgText=decodeURIComponent(exported.svg.split(',').slice(1).join(','));assert.match(svgText,/度数/);assert.match(svgText,/r=—/);fs.writeFileSync('/private/tmp/graph-matrix-export.svg',svgText);fs.writeFileSync('/private/tmp/graph-matrix-export.png',Buffer.from(exported.png.split(',')[1],'base64'));
  const saved=await doc();await importDoc({...C.createDocument(),name:'空の文書'});await importDoc(saved);assert.deepEqual(await doc(),saved);assert.equal(saved.version,14);
  await page.locator('[data-object-details="series:matrix-data"]').click();await page.locator('#object-menu').getByRole('menuitem',{name:'削除',exact:true}).click();await settle();assert.equal((await doc()).charts.length,0);await page.locator('#undo').click();await settle();assert.equal((await doc()).charts.length,1);
  await page.setViewportSize({width:390,height:900});await page.locator('#workspace-view').selectOption('matrix');await settle();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  const viewport=page.locator('#analysis-viewport');assert(await viewport.evaluate(el=>el.scrollWidth>el.clientWidth&&el.scrollHeight>el.clientHeight),'small screens keep readable cells in a local scroll area');
  await viewport.focus();await page.keyboard.press('ArrowRight');await page.waitForTimeout(150);assert(await viewport.evaluate(el=>el.scrollLeft>0),'the matrix can scroll with a keyboard');
  await viewport.evaluate(el=>{el.scrollLeft=0;el.scrollTop=0;});await viewport.hover();await page.mouse.wheel(180,160);await page.waitForTimeout(150);assert(await viewport.evaluate(el=>el.scrollTop>0),'wheel scrolls the matrix viewport instead of zooming a single cell');
  await viewport.evaluate(el=>{el.scrollLeft=el.scrollWidth;el.scrollTop=el.scrollHeight;});await page.screenshot({path:'/private/tmp/graph-matrix-mobile.png'});
  assert.deepEqual(errors,[]);console.log('scatter-matrix-browser.test.cjs: ok');
})().catch(async error=>{console.error(error);if(page)await page.screenshot({path:'/private/tmp/graph-matrix-failure.png'}).catch(()=>{});process.exitCode=1;}).finally(async()=>{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));});
