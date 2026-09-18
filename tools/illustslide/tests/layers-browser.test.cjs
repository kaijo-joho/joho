/* レイヤー操作・旧作品の互換性・出力と再生・右端メニューをChromeで確認する。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),os=require('node:os'),path=require('node:path');
const C=require('../core.js');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
async function rail(page,section){const b=page.locator('#'+section+'-toggle');if(await b.getAttribute('aria-expanded')!=='true')await b.click();await settle(page);}
async function clickWorld(page,x,y){const p=await page.evaluate(({x,y})=>{const c=IlapoEditor.getCamera(),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.left+(x-c.x)/c.width*r.width,y:r.top+(y-c.y)/c.height*r.height};},{x,y});await page.mouse.click(p.x,p.y);await settle(page);}
async function history(page,redo=false){await page.locator('#canvas').focus();await page.keyboard.press(redo?'Meta+Shift+z':'Meta+z');await settle(page);}
function fixture(){const d=C.createDocument();d.id='layer-browser';d.pages[0].board={width:640,height:400,unit:'px',infinite:false};const a=C.makeShape('rect',60,80,110,70,{fill:'#EF4444',stroke:'none'}),b=C.makeShape('rect',240,80,110,70,{fill:'#2563EB',stroke:'#17324D',strokeWidth:2});a.id='red';a.name='赤い図形';b.id='blue';b.name='青い図形';d.pages[0].objects=[a,b];return C.validateDocument(d);}
(async()=>{
  const supplied=process.argv.find(v=>/^https?:/.test(v));if(!supplied)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
  try{
    await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>!!window.IlapoEditor);
    const original=fixture();await page.locator('#file-input').setInputFiles({name:'layers.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});await page.waitForFunction(()=>IlapoEditor.getDocument().id==='layer-browser');await settle(page);
    assert.deepEqual(await page.locator('.side-tab button').allTextContents(),['ページ','レイヤー','部品','用紙サイズ','表示と吸着','動きと再生順序','書き出し']);
    await rail(page,'objects');assert.deepEqual(await read(page),original,'一覧を開くだけでは旧作品を変更しない');
    await page.locator('[data-object-command=layer-create]').click();await settle(page);
    let doc=await read(page),layerId=doc.pages[0].layers[1].id;assert.equal(doc.version,6);assert.equal(await page.evaluate(()=>IlapoEditor.getState().activeLayerId),layerId);
    const action=command=>page.locator(`[data-object-command="${command}"][data-object-id="${layerId}"]`);
    await action('layer-rename').click();await page.locator('#layer-name').fill('イラスト');await page.locator('#dialog-form button[type=submit]').click();await settle(page);assert.equal((await read(page)).pages[0].layers[1].name,'イラスト');
    await page.locator('[data-object-pick=red]').click();await settle(page);await page.locator('[data-object-command=move-selection]').click();await page.locator('#object-target-layer').selectOption(layerId);await page.locator('#dialog-form button[type=submit]').click();await settle(page);
    assert.deepEqual((await read(page)).pages[0].layers[1].objectIds,['red']);
    await page.locator('#inspector-close').click();await page.locator('#style-button').click();await settle(page);
    const tabs=await page.locator('#inspector-tabs [data-inspector-section]').evaluateAll(nodes=>nodes.map(n=>n.dataset.inspectorSection));assert(tabs.includes('style'));assert(!tabs.some(s=>['pages','objects','assets','board','view','animation'].includes(s)));
    for(const section of ['board','view','animation']){await rail(page,section);assert.equal(await page.locator('#inspector-tabs').isVisible(),false);assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),['red']);}
    await rail(page,'objects');await action('layer-lock').click();await settle(page);const locked=await read(page);
    await page.locator('#inspector-close').click();await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Delete');await settle(page);assert.deepEqual(await read(page),locked,'レイヤー固定中は移動・削除をしない');assert.equal(await page.locator('#selection [data-handle]').count(),0);
    await rail(page,'objects');await action('layer-lock').click();await action('layer-visible').click();await settle(page);
    assert.equal(await page.locator('#artwork [data-object=red]').count(),0);assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),[]);
    await page.locator('#inspector-close').click();await clickWorld(page,60,80);assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),[],'隠した頂点を選択しない');assert.equal(await page.locator('#canvas').getAttribute('data-hover-kind'),null);
    await history(page);assert.equal(await page.locator('#artwork [data-object=red]').count(),1,'非表示をUndo');await history(page,true);assert.equal(await page.locator('#artwork [data-object=red]').count(),0);
    // A hidden active layer must not silently receive a new shape or switch destination.
    const before=await read(page);await page.locator('[data-tool=rect]').click();await clickWorld(page,440,240);assert.deepEqual(await read(page),before);await page.keyboard.press('v');
    await rail(page,'objects');await page.locator('[data-layer-pick=default]').click();await page.locator('#inspector-close').click();await page.locator('[data-tool=rect]').click();await clickWorld(page,440,240);
    doc=await read(page);const created=doc.pages[0].objects.find(o=>!['red','blue'].includes(o.id));assert(created);assert(doc.pages[0].layers[0].objectIds.includes(created.id));
    const imageData=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=c.height=8;c.getContext('2d').fillRect(0,0,8,8);return c.toDataURL().split(',')[1];});
    await page.locator('#image-input').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(imageData,'base64')});
    await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].objects.some(o=>o.type==='image'));await settle(page);
    doc=await read(page);const image=doc.pages[0].objects.find(o=>o.type==='image');assert(image.reference);assert.equal(doc.pages[0].layers[0].objectIds[0],image.id,'下絵を追加先レイヤーの背面に保持');
    const report=await page.evaluate(async()=>{
      const C=IlapoCore,S=IlapoSVG,L=IlapoLayers,d=IlapoEditor.getDocument(),p=d.pages[0],initial=JSON.stringify(d);
      p.animations=[{id:'hidden-effect',targets:['red'],effect:'fade',mode:'in',trigger:'click',duration:100,delay:0},{id:'visible-effect',targets:['blue'],effect:'fade',mode:'in',trigger:'click',duration:100,delay:0}];
      const checked=C.validateDocument(d),bytes=S.encodeProject(checked),decoded=S.decodeProject(bytes),svg=S.exportPage(p),print=IlapoExport.buildPrintHTML([p]);
      const png=await IlapoExport.png(p,{scale:1,background:'white'}),bitmap=await createImageBitmap(png),canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);const pixel=[...context.getImageData(100,110,1,1).data];bitmap.close();
      const html=await IlapoPlaybackExport.buildHTML(checked),htmlDoc=new DOMParser().parseFromString(html,'text/html'),playback=JSON.parse(htmlDoc.getElementById('ilapo-playback-data').textContent);
      const paper=document.createElement('div');document.body.append(paper);const player=IlapoAnimationPlayer.create(paper,p),steps=player.getState().steps,hiddenNode=!!paper.querySelector('[data-animation-object=red]');player.destroy();paper.remove();
      const outline=IlapoOutline.convertPage(p,['blue'],{lines:true}),blueLayer=L.layerOf(outline.page,'blue');
      const copy=C.clone(checked);C.duplicatePage(copy,p.id);const duplicate=C.validateDocument(copy).pages[1];
      return{checked,decoded,svg,print,pixel,playback,steps,hiddenNode,outlineValid:outline.page.objects.filter(o=>outline.ids.includes(o.id)).every(o=>blueLayer.objectIds.includes(o.id)),duplicate,sourceIntact:JSON.stringify(IlapoEditor.getDocument())===initial};
    });
    assert.deepEqual(report.decoded,report.checked,'非表示レイヤーも編集用ZIPに完全保存');assert(!report.svg.includes('data-ilapo-id="red"'));assert(!report.print.includes('data-ilapo-id="red"'));assert.deepEqual(report.pixel,[255,255,255,255]);assert.equal(report.steps,1);assert.equal(report.hiddenNode,false);assert.equal(report.playback.pages[0].objects.some(o=>o.id==='red'),false);assert.equal(report.playback.pages[0].animations.length,1);assert(report.outlineValid&&report.sourceIntact);assert.equal(report.duplicate.layers.length,2);
    await rail(page,'objects');await action('layer-visible').click();await settle(page);await page.locator(`[data-layer-pick="${layerId}"]`).focus();await page.keyboard.press('Alt+ArrowDown');await settle(page);assert.equal((await read(page)).pages[0].layers[0].id,layerId);await history(page);assert.equal((await read(page)).pages[0].layers[1].id,layerId);
    await action('layer-remove').click();assert.match(await page.locator('#dialog-body').textContent(),/図形.*1/);await page.locator('#dialog-form button[type=submit]').click();await settle(page);assert.equal((await read(page)).pages[0].layers.length,1);assert((await read(page)).pages[0].objects.some(o=>o.id==='red'),'レイヤー削除では図形を保持');await history(page);assert.equal((await read(page)).pages[0].layers.length,2);
    await fs.mkdir('/private/tmp/illustslide-layers-qa',{recursive:true});await page.screenshot({path:'/private/tmp/illustslide-layers-qa/layers-desktop.png'});
    await page.setViewportSize({width:390,height:736});
    for(const section of ['pages','objects','assets','board','view','animation']){await rail(page,section);assert.equal(await page.locator('#'+section+'-toggle').getAttribute('aria-expanded'),'true');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));assert(await page.evaluate(()=>{const p=document.getElementById('inspector-body');return p.scrollWidth<=p.clientWidth+1;}),section+'は右パネル内ではみ出さない');}
    await page.locator('.side-tab [data-action=export-toggle]').click();assert(await page.locator('#export-panel').isVisible());await rail(page,'objects');await page.screenshot({path:'/private/tmp/illustslide-layers-qa/layers-390.png'});assert.deepEqual(errors,[]);
    console.log('layers-browser.test.cjs: passed');
  }finally{await browser.close();if(!supplied)await new Promise(resolve=>server.close(resolve));}
})().catch(e=>{console.error(e);process.exitCode=1;});
