const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<div id="graph" style="width:700px;height:500px"></div><script src="http://127.0.0.1:${port}/vendor/plotly.min.js"></script><script src="http://127.0.0.1:${port}/expression.js"></script><script src="http://127.0.0.1:${port}/symbols.js"></script><script src="http://127.0.0.1:${port}/curves.js"></script><script src="http://127.0.0.1:${port}/annotations.js"></script><script src="http://127.0.0.1:${port}/plot.js"></script>`);
    const checks = await page.evaluate(async () => {
      const graph = document.querySelector('#graph');
      let views = 0; window.__blank3d = 0; window.__surfaceSelect = 0;
      await GraphPlot.render(document.querySelector('#graph'), {
        mode: '3d', angle: 'rad', axes: { x: { min: -2, max: 2, label: '<x>', symbol: 'x', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} }, y: { min: -2, max: 2, label: 'y', symbol: 'y', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} }, z: { min: -4, max: 4, label: 'z', symbol: 'z', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} } },
        parameters: [], grid: true, legend: true, equalScale: true,
        series: [{ id: 's', kind: 'surface', name: '<surface>', expression: 'x^2-y^2', domain: { x: [-2, 2], y: [-2, 2] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: .85 } }, { id: 'points', kind: 'data3d', name: '欠測', rows: [[1, null, 3], [1, 2, 3]], visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: true, lines: true, opacity: .85 } }]
      }, { dark: true, onViewChange: () => { views++; }, onBlankClick: () => { window.__blank3d++; }, onSelect: () => { window.__surfaceSelect++; } });
      const svgError = await GraphPlot.exportImage(graph, { format: 'svg' }).then(() => '', (error) => error.message);
      graph.emit('plotly_relayout', { autosize: true });
      const afterAutosize = views;
      graph.emit('plotly_relayout', { 'scene.camera': { eye: { x: 2, y: 2, z: 2 } } });
      const original = Plotly.newPlot; let exportLayout;
      Plotly.newPlot = async (...args) => { exportLayout = args[2]; return original(...args); };
      const image = await GraphPlot.exportImage(graph, { format: 'png', background: 'white' });
      Plotly.newPlot = original;
      const webgl = graph.querySelectorAll('.gl-container canvas').length;
      const aspectmode = graph.layout.scene.aspectmode, dragmode = graph.layout.dragmode, legendClick = graph.layout.legend.itemclick;
      const missing = graph.data[1].x[0] === null && graph.data[1].y[0] === null && graph.data[1].z[0] === null, liveFont = graph.layout.font.color;
      return { webgl, aspectmode, dragmode, legendClick, missing, afterAutosize, afterCamera: views, image, exportFont: exportLayout.font.color, exportScene: exportLayout.scene.bgcolor, exportCamera: exportLayout.scene.camera.eye.x, liveFont, svgError };
    });
    assert.equal(checks.webgl, 1, '3D 曲面を WebGL canvas で描画する');
    const text = await page.locator('body').innerHTML();
    assert(!text.includes('<surface>'), '系列名を HTML として注入しない');
    assert.match(checks.svgError, /3D/);
    assert.equal(checks.aspectmode, 'data');
    assert.equal(checks.dragmode, 'orbit');
    assert.equal(checks.legendClick, false);
    assert(checks.missing, '欠測行は全座標を null にする');
    assert.equal(checks.afterAutosize, 0, 'autosize ではビューを通知しない');
    assert.equal(checks.afterCamera, 1, 'カメラ変更だけを通知する');
    assert.match(checks.image, /^data:image\/png/);
    assert.equal(checks.exportFont, '#172033');
    assert.equal(checks.exportScene, '#ffffff');
    assert.equal(checks.exportCamera, 2, '書き出しにも現在のカメラを使う');
    assert.equal(checks.liveFont, '#e5e7eb', '表示テーマを変えない');
    const canvas = await page.locator('.gl-container canvas').boundingBox();
    await page.mouse.click(canvas.x + 8, canvas.y + 8); await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blank3d), 1, '3D の空白クリックだけを通知する');
    let surfaceHit = false;
    surfaceSearch: for (const y of [.3,.5,.7]) for (const x of [.3,.5,.7]) {
      const before = await page.evaluate(() => ({selected:window.__surfaceSelect,blank:window.__blank3d}));
      await page.mouse.move(canvas.x + canvas.width * x, canvas.y + canvas.height * y);await page.waitForTimeout(80);
      await page.mouse.click(canvas.x + canvas.width * x, canvas.y + canvas.height * y); await page.waitForTimeout(30);
      if (await page.evaluate(value => window.__surfaceSelect>value,before.selected)) { surfaceHit = true;assert.equal(await page.evaluate(() => window.__blank3d),before.blank,'曲面の選択と空白クリックを同時に通知しない');break surfaceSearch; }
    }
    assert(surfaceHit, '3D 曲面のクリックは系列を選択する');
    const afterSurface = await page.evaluate(() => window.__blank3d);
    await page.mouse.click(canvas.x+8,canvas.y+8);await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blank3d),afterSurface+1,'3D曲面から空白へすぐ移動しても解除できる');
    const blankBeforeOrbit = await page.evaluate(() => window.__blank3d);
    const beforeCamera = await page.evaluate(() => structuredClone(document.querySelector('#graph').layout.scene.camera.eye));
    await page.mouse.move(410, 300); await page.mouse.down(); await page.mouse.move(500, 340, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(100);
    const afterCamera = await page.evaluate(() => structuredClone(document.querySelector('#graph').layout.scene.camera.eye));
    assert.notDeepEqual(afterCamera, beforeCamera, '3D の実マウスドラッグで視点を回転する');
    assert.equal(await page.evaluate(() => window.__blank3d), blankBeforeOrbit, '3D orbit は空白クリックにしない');
    const viewCheck = await page.evaluate(async () => {
      const graph = document.querySelector('#graph'); let xOnlyView;
      const twoD = { mode: '2d', angle: 'rad', axes: { x: { min: -2, max: 2, label: 'x', symbol:'x', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} }, y: { min: 10, max: 20, label: 'y', symbol:'y', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} }, z: { min: -2, max: 2, label: 'z', symbol:'z', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} } }, parameters: [], grid: true, legend: true, equalScale: false, series: [{ id: 'line', kind: 'function', name: 'x', expression: 'x', domain: { x: [-10, 10], y: [-10, 10] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: .85 } }] };
      await GraphPlot.render(graph, twoD, { onViewChange: (view) => { xOnlyView = view; } }); graph.emit('plotly_relayout', { 'xaxis.range': [0, 1] });
      const next = structuredClone(twoD); next.axes.x = xOnlyView.axes.x; await GraphPlot.render(graph, next, {});
      return { axes: Object.keys(xOnlyView.axes), y: graph.layout.yaxis.range, dragmode: graph.layout.dragmode };
    });
    assert.deepEqual(viewCheck.axes, ['x']);
    assert.deepEqual(viewCheck.y, [10, 20], 'x だけのズーム通知で y 範囲を復元しない');
    assert.equal(viewCheck.dragmode, 'pan');
    const blankCheck = await page.evaluate(async () => {
      const graph = document.querySelector('#graph'), axis = key => ({ min: -2, max: 2, label: key, symbol: key, unit: '', scale: 'linear', ticks:{step:null,format:'auto'} });
      window.__blankState = {blanks:0,selected:0,annotationSelected:0};
      const twoD = { mode:'2d', angle:'rad', axes:{x:axis('x'),y:axis('y'),z:axis('z')}, parameters:[], grid:true, legend:true, equalScale:false,
        series:[{id:'data',kind:'data2d',name:'点',rows:[[0,0]],visible:true,style:{color:'#2563eb',width:2,dash:'solid',points:true,lines:false,opacity:1}}],
        annotations:[{id:'note',kind:'point',name:'注釈',visible:true,style:{color:'#dc2626',width:1.5,dash:'dash',opacity:1},label:{visible:true,dx:12,dy:-12,size:13},anchor:{type:'free',x:'-1',y:'-1'},projections:false}] };
      window.__blankDoc = twoD;
      await GraphPlot.render(graph,twoD,{onBlankClick:()=>{window.__blankState.blanks++;},onSelect:()=>{window.__blankState.selected++;},onAnnotationSelect:()=>{window.__blankState.annotationSelected++;}});
      const point=GraphPlot.screenPoint(graph,[0,0]), blank=GraphPlot.screenPoint(graph,[1.5,-1.5]);
      return {point,blank};
    });
    await page.mouse.click(...blankCheck.blank); await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blankState.blanks), 1, '2D の空白クリックだけを通知する');
    await page.mouse.click(...blankCheck.point); await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blankState.blanks), 1, '数表の点は空白クリックにしない');
    await page.mouse.click(...blankCheck.blank);await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blankState.blanks),2,'2Dの点から空白へすぐ移動しても解除できる');
    const label = await page.locator('.annotation').boundingBox();
    await page.mouse.click(label.x + label.width / 2, label.y + label.height / 2); await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blankState.blanks), 2, '注釈ラベルは空白クリックにしない');
    await page.mouse.move(...blankCheck.blank); await page.mouse.down(); await page.mouse.move(blankCheck.blank[0]+30,blankCheck.blank[1]+10,{steps:3}); await page.mouse.up(); await page.waitForTimeout(30);
    assert.equal(await page.evaluate(() => window.__blankState.blanks), 2, 'pan は空白クリックにしない');
    await page.evaluate(async blank => { const graph=document.querySelector('#graph'),fire=(target,type,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:91,pointerType:'mouse',button:0,clientX:x,clientY:y}));fire(graph,'pointerdown',blank[0],blank[1]);await GraphPlot.render(graph,window.__blankDoc,{onBlankClick:()=>window.__blankState.blanks++});fire(document,'pointerup',blank[0],blank[1]); }, blankCheck.blank);
    await page.waitForTimeout(30); assert.equal(await page.evaluate(() => window.__blankState.blanks), 3, 'pointerdown中のrender後も空白クリックを失わない');
    await page.evaluate(blank => { const graph=document.querySelector('#graph'),fire=(target,type,button)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:92,pointerType:'mouse',button,clientX:blank[0],clientY:blank[1]}));fire(graph,'pointerdown',2);fire(document,'pointerup',2); }, blankCheck.blank);
    await page.waitForTimeout(30); assert.equal(await page.evaluate(() => window.__blankState.blanks), 3, '右クリックは空白クリックにしない');
    const lineCheck = await page.evaluate(async () => { const graph=document.querySelector('#graph'),axis=key=>({min:-2,max:2,label:key,symbol:key,unit:'',scale:'linear',ticks:{step:null,format:'auto'}});window.__lineState={blank:0,series:0,annotation:0};const doc={mode:'2d',angle:'rad',axes:{x:axis('x'),y:axis('y'),z:axis('z')},parameters:[],grid:true,legend:true,equalScale:false,series:[{id:'line',kind:'data2d',name:'2点線分',rows:[[-2,-2],[2,2]],visible:true,style:{color:'#2563eb',width:2,dash:'solid',points:false,lines:true,opacity:1}}],annotations:[{id:'guide',kind:'guide',name:'補助線',visible:true,style:{color:'#dc2626',width:2,dash:'solid',opacity:1},label:{visible:false,dx:0,dy:0,size:13},axis:'x',value:'1'}]};window.__lineDoc=doc;await GraphPlot.render(graph,doc,{onBlankClick:()=>window.__lineState.blank++,onSelect:()=>window.__lineState.series++,onAnnotationSelect:()=>window.__lineState.annotation++});return {line:GraphPlot.screenPoint(graph,[0,0]),guide:GraphPlot.screenPoint(graph,[1,0])}; });
    await page.mouse.click(...lineCheck.line); await page.waitForTimeout(30);
    assert.deepEqual(await page.evaluate(() => window.__lineState), {blank:0,series:1,annotation:0}, '疎な2点線分の中央は系列を選択する');
    await page.mouse.click(...lineCheck.guide); await page.waitForTimeout(30);
    assert.deepEqual(await page.evaluate(() => window.__lineState), {blank:0,series:1,annotation:1}, '注釈線は選択し、空白クリックにしない');
    await page.evaluate(async () => { const graph=document.querySelector('#graph'); await GraphPlot.render(graph,window.__lineDoc,{onSelect:()=>window.__lineState.series++});graph.emit('plotly_click',{points:[{curveNumber:0}],event:{}}); });
    assert.equal(await page.evaluate(() => window.__lineState.series), 2, 'onBlankClickなしへの再描画でも既存の選択callbackを保つ');
    const touchContext = await browser.newContext({ viewport:{width:800,height:600}, hasTouch:true });
    const touchPage = await touchContext.newPage();
    try {
      await touchPage.setContent(`<div id="graph" style="width:700px;height:500px"></div><script src="http://127.0.0.1:${port}/vendor/plotly.min.js"></script><script src="http://127.0.0.1:${port}/expression.js"></script><script src="http://127.0.0.1:${port}/symbols.js"></script><script src="http://127.0.0.1:${port}/plot.js"></script>`);
      const touchPoint = await touchPage.evaluate(async () => { const graph=document.querySelector('#graph'),axis=key=>({min:-2,max:2,label:key,symbol:key,unit:'',scale:'linear',ticks:{step:null,format:'auto'}});window.__touchBlank=0;await GraphPlot.render(graph,{mode:'2d',angle:'rad',axes:{x:axis('x'),y:axis('y'),z:axis('z')},parameters:[],grid:true,legend:true,equalScale:false,series:[]},{onBlankClick:()=>window.__touchBlank++});return GraphPlot.screenPoint(graph,[0,0]); });
      await touchPage.touchscreen.tap(...touchPoint); await touchPage.waitForTimeout(30);
      assert.equal(await touchPage.evaluate(() => window.__touchBlank), 1, '2D の単指タップを通知する');
      await touchPage.evaluate(() => { const graph=document.querySelector('#graph'),fire=(target,type,id,x,y)=>target.dispatchEvent(new PointerEvent(type,{bubbles:true,pointerId:id,pointerType:'touch',clientX:x,clientY:y}));fire(graph,'pointerdown',1,300,300);fire(document,'pointerdown',2,320,300);fire(document,'pointerup',1,300,300);fire(document,'pointerup',2,320,300);fire(graph,'pointerdown',3,300,300);fire(document,'pointercancel',3,300,300); });
      await touchPage.waitForTimeout(30); assert.equal(await touchPage.evaluate(() => window.__touchBlank), 1, 'pinch と pointercancel は通知しない');
      await touchPage.touchscreen.tap(...touchPoint); await touchPage.waitForTimeout(30); assert.equal(await touchPage.evaluate(() => window.__touchBlank), 2, 'pointercancel後の単指タップを通知する');
    } finally { await touchContext.close(); }
    console.log('plot-browser.test.cjs: ok');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
