/* Real controls, portable output, and recovery of explanatory diagrams. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const near=(a,b)=>assert(Math.abs(a-b)<.05,`${a} ~= ${b}`);
async function run(){
  const supplied=process.argv.find(s=>/^https?:/.test(s));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=supplied||`http://127.0.0.1:${server.address().port}/ilapo/`,browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(()=>IlapoEditor.getDocument());
  const screen=p=>page.evaluate(p=>{const c=IlapoEditor.getCamera(),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+(p.x-c.x)/c.width*r.width,y:r.y+(p.y-c.y)/c.height*r.height};},p);
  const click=async p=>{const q=await screen(p);await page.mouse.click(q.x,q.y);await sleep(40);};
  const drag=async(a,b,preview)=>{a=await screen(a);b=await screen(b);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});if(preview)await preview();await page.mouse.up();await sleep(60);};
  const pick=async id=>{await page.locator('[data-action=objects]').first().click();await page.locator(`[data-pick-object="${id}"]`).click();await sleep(50);};
  const edit=async action=>{await page.locator('[data-menu=edit]').click();await page.locator(`#command-menu [data-action="${action}"]`).click();};
  const submit=async()=>{await page.locator('#dialog-submit').click();await page.waitForFunction(()=>!document.getElementById('dialog').open);await sleep(40);};
  const fixture=C.createDocument();fixture.name='接続と部品';fixture.pages[0].board={width:640,height:420,unit:'px',infinite:false};const a=C.makeShape('rect',80,120,100,70,{fill:'#93C5FD'}),b=C.makeShape('diamond',410,130,100,90,{fill:'#BEF264'});a.id='source';a.name='送信元';b.id='target';b.name='受信先';fixture.pages[0].objects=[a,b];
  async function load(value,name='practice.json'){await page.locator('#file-input').setInputFiles({name,mimeType:name.endsWith('zip')?'application/zip':'application/json',buffer:Buffer.isBuffer(value)?value:Buffer.from(JSON.stringify(value))});await sleep(80);if(await page.locator('#replace-discard').isVisible())await page.locator('#replace-discard').click();await sleep(80);}
  try{
    await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);await load(fixture);
    await page.locator('[data-tool=connector]').first().click();await drag({x:130,y:150},{x:460,y:170});
    let doc=await read(),connection=doc.pages[0].objects.find(o=>o.type==='connector');assert(connection);assert.equal(connection.from.objectId,'source');assert.equal(connection.to.objectId,'target');assert.equal(doc.version,2);
    await page.keyboard.press('Meta+z');await sleep(60);assert.equal((await read()).pages[0].objects.length,2);await page.keyboard.press('Meta+Shift+z');await sleep(60);
    await pick('source');await page.locator('#canvas').focus();await page.keyboard.press('v');await drag({x:130,y:150},{x:165,y:180});doc=await read();const followed=doc.pages[0].objects.find(o=>o.id===connection.id);assert(followed.from.x>connection.from.x+20);near(doc.pages[0].objects[0].matrix[4],35);
    await pick(connection.id);await page.locator('#canvas').focus();await page.keyboard.press('a');await page.locator('#connection-options').click();
    await page.locator('#connection-route').selectOption('orthogonal');await page.locator('#connection-label').fill('要求 → 応答\n秘密の鍵');await page.locator('#connection-from-port').selectOption('right');await page.locator('#connection-to-port').selectOption('left');
    await page.locator('#connection-add-point').click();await page.locator('#connection-point-x-0').fill('280');await page.locator('#connection-point-y-0').fill('270');await page.locator('#connection-add-point').click();await page.locator('#connection-point-x-1').fill('360');await page.locator('#connection-point-y-1').fill('300');await submit();
    const routed=await read();const points=await page.evaluate(id=>IlapoConnectors.points(IlapoEditor.getDocument().pages[0].objects.find(o=>o.id===id)),connection.id);assert(points.slice(1).every((p,i)=>Math.abs(p.x-points[i].x)<1e-7||Math.abs(p.y-points[i].y)<1e-7));
    await drag({x:280,y:270},{x:300,y:260},async()=>{assert.deepEqual(await read(),routed);await page.keyboard.press('Escape');});assert.deepEqual(await read(),routed,'canceled route drag is not saved');
    await drag({x:280,y:270},{x:300,y:260});doc=await read();near(doc.pages[0].objects.find(o=>o.id===connection.id).waypoints[0].x,300);await page.keyboard.press('Meta+z');await sleep(60);assert.deepEqual(await read(),routed,'route edit is one undo');await page.keyboard.press('Meta+Shift+z');await sleep(60);
    // The actual ZIP keeps semantic attachment; standalone SVG contains portable paths/text.
    const beforeZIP=await read();const bytes=await page.evaluate(()=>Array.from(IlapoSVG.encodeProject(IlapoEditor.getDocument())));
    assert.deepEqual(await page.evaluate(bytes=>IlapoSVG.decodeProject(new Uint8Array(bytes)),bytes),beforeZIP);
    const portable=await page.evaluate(()=>IlapoSVG.importSVG(IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0])).page);assert(!portable.objects.some(o=>o.type==='connector'));assert(portable.objects.some(o=>o.type==='text'&&o.runs.some(r=>r.text.includes('秘密の鍵'))));
    await load(Buffer.from(bytes),'connections.ilapo.zip');assert.deepEqual(await read(),beforeZIP);
    // Copy a complete diagram into the component library and insert an independent copy.
    await page.locator('#canvas').focus();await page.keyboard.press('Meta+a');await edit('component-save');await page.locator('#component-name').fill('送受信 <部品>');await submit();await page.locator('[data-action=assets]').first().click();
    assert.equal(await page.locator('[data-insert-icon]').count(),10);assert.equal(await page.locator('[data-insert-component]').count(),1);await page.locator('[data-insert-component]').click();await sleep(70);
    doc=await read();const copies=doc.pages[0].objects.filter(o=>!beforeZIP.pages[0].objects.some(v=>v.id===o.id)),copyLine=copies.find(o=>o.type==='connector');assert.equal(copies.length,3);assert(copies.some(o=>o.id===copyLine.from.objectId));assert(copies.some(o=>o.id===copyLine.to.objectId));assert.equal(new Set(copies.map(o=>o.group)).size,1);assert(copies.every(o=>!o.locked));
    await page.locator('[data-action=assets]').first().click();await page.locator('[data-insert-icon=pc]').click();await sleep(50);assert.equal((await read()).pages[0].objects.at(-1).type,'path');
    // Decode/re-encode real raster data, retain source resolution, exclude guides from output.
    const png=await page.evaluate(()=>{const c=document.createElement('canvas');c.width=800;c.height=600;const g=c.getContext('2d');g.fillStyle='#ff0000';g.fillRect(0,0,800,600);return c.toDataURL('image/png').split(',')[1];});
    await page.locator('#image-input').setInputFiles({name:'reference.png',mimeType:'image/png',buffer:Buffer.from(png,'base64')});await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].objects.some(o=>o.type==='image'));
    doc=await read();const image=doc.pages[0].objects.find(o=>o.type==='image');assert(image.locked&&image.reference);assert(image.width<=512&&image.height<=336);
    const originalSize=await page.evaluate(async src=>{const img=new Image();img.src=src;await img.decode();return[img.naturalWidth,img.naturalHeight];},image.src);assert.deepEqual(originalSize,[800,600]);
    assert(!(await page.evaluate(()=>IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]))).includes('<image'));
    assert.deepEqual(await page.evaluate(()=>IlapoSVG.decodeProject(IlapoSVG.encodeProject(IlapoEditor.getDocument()))),doc);
    await page.locator('#image-options').click();await page.locator('#image-locked').uncheck();await page.locator('#image-output').check();await page.locator('#image-opacity').fill('100');await submit();assert((await page.evaluate(()=>IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]))).includes('<image'));
    const unsafe=await page.evaluate(()=>{try{IlapoSVG.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><image width="1" height="1" href="https://example.com/tracker.png"/></svg>');return false;}catch{return true;}});assert(unsafe);
    const exportResult=await page.evaluate(async()=>{const p=IlapoEditor.getDocument().pages[0],blob=await IlapoExport.png(p,{scale:.5});return{size:blob.size,printed:IlapoExport.buildPrintHTML([p]).includes('<image')};});assert(exportResult.size>1000&&exportResult.printed);
    const semantics=await page.evaluate(()=>{
      const C=IlapoCore,K=IlapoConnectors,A=IlapoAssets,G=IlapoGeometry,p=C.createPage('回帰'),a=C.makeShape('rect',0,0,100,60),b=C.makeShape('diamond',250,0,100,80);
      a.matrix=[0,1,-1,0,100,0];
      const c=K.make({x:0,y:0,objectId:a.id,port:'top'},{x:0,y:0,objectId:b.id,port:'left'},{route:'orthogonal',label:'visible',style:{fill:'none',stroke:'#112233'}});p.objects=[c,a,b];K.sync(p);const synced=JSON.stringify(p);K.sync(p);const stable=synced===JSON.stringify(p);
      const ps=K.points(c),label=K.renderedParts(c).find(o=>o.type==='text');
      const beforeDelete={x:c.from.x,y:c.from.y};const duplicateIds=C.duplicateObjects(p,[c.id,a.id,b.id],10,20),copies=p.objects.filter(o=>duplicateIds.includes(o.id)),duplicateLine=copies.find(o=>o.type==='connector');K.sync(p);
      C.removeObjects(p,[a.id]);const detached=c.from.objectId===null&&c.from.x===beforeDelete.x&&c.from.y===beforeDelete.y;
      let raw=null,quota=false;const storage={getItem:()=>raw,setItem:(k,v)=>{if(quota)throw new Error('quota');raw=v;}},lib=A.createLibrary(storage);
      const component=lib.save('矢印が先頭',copies),placed=lib.instantiate(component.id,{x:20,y:40,size:100}),placedLine=placed.find(o=>o.type==='connector');
      const backup=raw;quota=true;let quotaKept=false;try{lib.save('追加',copies);}catch{quotaKept=raw===backup;}quota=false;
      let rejectedDuplicate=false;try{const v=JSON.parse(backup);v.components[0].objects.push(v.components[0].objects[0]);lib.importJSON(JSON.stringify(v));}catch{rejectedDuplicate=raw===backup;}
      let invalidRaster=false;try{C.validateObject({...IlapoEditor.getDocument().pages[0].objects.find(o=>o.type==='image'),src:'https://example.com/image.png'});}catch{invalidRaster=true;}
      const boxes=placed.map(G.bounds),width=Math.max(...boxes.map(b=>b.x+b.width))-Math.min(...boxes.map(b=>b.x)),height=Math.max(...boxes.map(b=>b.y+b.height))-Math.min(...boxes.map(b=>b.y));
      return {stable,rotatedPort:ps[1].x>ps[0].x&&ps[1].y===ps[0].y,correctArrival:ps.at(-2).x<ps.at(-1).x,labelFill:label.style.fill,labelStroke:label.style.stroke,refs:copies.some(o=>o.id===duplicateLine.from.objectId)&&copies.some(o=>o.id===duplicateLine.to.objectId),detached,placedRefs:placed.some(o=>o.id===placedLine.from.objectId)&&placed.some(o=>o.id===placedLine.to.objectId),quotaKept,rejectedDuplicate,invalidRaster,placedExtent:Math.max(width,height)};
    });
    for(const key of ['stable','rotatedPort','correctArrival','refs','detached','placedRefs','quotaKept','rejectedDuplicate','invalidRaster'])assert(semantics[key],key);assert.equal(semantics.labelFill,'#112233');assert.equal(semantics.labelStroke,'none');near(semantics.placedExtent,100);
    // Presentation navigation must work with initial button focus and leave the editor unchanged.
    await page.locator('[data-action=pages]').first().click();await page.locator('[data-page-command=duplicate]').click();await page.locator('#dialog-cancel').click();const beforePresent=await read();await page.locator('#present-button').click();
    await page.waitForFunction(()=>document.querySelector('#ilapo-presentation[open]'));assert((await page.locator('.ilapo-present-status').textContent()).startsWith('1 / 2'));await page.keyboard.press('ArrowRight');assert((await page.locator('.ilapo-present-status').textContent()).startsWith('2 / 2'));await page.keyboard.press('Home');assert((await page.locator('.ilapo-present-status').textContent()).startsWith('1 / 2'));await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('ilapo-presentation'));assert.deepEqual(await read(),beforePresent);assert.equal(await page.evaluate(()=>document.activeElement.id),'present-button');
    await page.screenshot({path:'/private/tmp/ilapo-stage3-desktop.png'});
    for(const width of [736,390]){await page.setViewportSize({width,height:840});await sleep(80);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await page.locator('[data-menu=more]').click();await page.locator('#command-menu [data-action=assets]').click();assert(await page.locator('[data-insert-icon=person]').isVisible());await page.locator('#dialog-cancel').click();await page.screenshot({path:`/private/tmp/ilapo-stage3-${width}.png`});}
    // A real touch gesture changes one waypoint, with touch-sized handles.
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(url);await touch.waitForFunction(()=>!!window.IlapoEditor);
    await touch.locator('#file-input').setInputFiles({name:'route.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(routed))});await touch.waitForFunction(id=>IlapoEditor.getDocument().id===id,routed.id);await touch.locator('[data-menu=more]').click();await touch.locator('#command-menu [data-action=objects]').click();await touch.locator(`[data-pick-object="${connection.id}"]`).click();await sleep(60);
    const tp=await touch.evaluate(()=>{const r=document.getElementById('canvas').getBoundingClientRect(),c=IlapoEditor.getCamera();return{x:r.x+(280-c.x)/c.width*r.width,y:r.y+(270-c.y)/c.height*r.height};});const cdp=await touchContext.newCDPSession(touch);await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tp.x,y:tp.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tp.x+20,y:tp.y+12}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await sleep(80);assert((await touch.evaluate(()=>IlapoEditor.getDocument())).pages[0].objects.find(o=>o.id===connection.id).waypoints[0].x>300);await touchContext.close();
    // A legible teaching example also exercises real fullscreen rather than a mock.
    await page.setViewportSize({width:1280,height:900});
    const example=await page.evaluate(()=>{
      const C=IlapoCore,A=IlapoAssets,K=IlapoConnectors,d=C.createDocument(),p=d.pages[0];d.name='リクエストとレスポンス';p.board=C.boardPreset('16:9');
      const pc=A.instantiateIcon('pc',{x:170,y:230,size:200})[0],server=A.instantiateIcon('server',{x:890,y:230,size:200})[0];
      const title=C.makeText(90,105,d.name,{fill:'#172B4D',stroke:'none',fontSize:40,bold:true}),left=C.makeText(185,470,'クライアント',{fill:'#172B4D',stroke:'none',fontSize:26}),right=C.makeText(935,470,'サーバー',{fill:'#172B4D',stroke:'none',fontSize:26});
      const arrow=(from,to,ratio,label,color)=>K.make({objectId:from.id,x:0,y:0,port:from===pc?'right':'left',ratio},{objectId:to.id,x:0,y:0,port:to===server?'left':'right',ratio},{label,style:{fill:'none',stroke:color,strokeWidth:3,fontSize:25}});
      p.objects=[title,pc,server,left,right,arrow(pc,server,.25,'① リクエストを送信','#2563EB'),arrow(server,pc,.9,'② レスポンスを返す','#157C61')];K.sync(p);const next=C.createPage('次のページ',p.board);next.objects=[C.makeText(100,180,'図形を動かしても、矢印は追従します。',{fill:'#172B4D',stroke:'none',fontSize:38})];d.pages.push(next);return C.validateDocument(d);
    });
    await load(example);await page.screenshot({path:'/private/tmp/ilapo-stage3-example.png'});await page.locator('#present-button').click();await page.screenshot({path:'/private/tmp/ilapo-stage3-presentation.png'});
    await page.locator('.ilapo-present-fullscreen').click();await page.waitForFunction(()=>document.fullscreenElement===document.documentElement);await page.keyboard.press('Escape');await page.waitForFunction(()=>!document.getElementById('ilapo-presentation'));assert.deepEqual(await read(),example);
    await pick(example.pages[0].objects.at(-1).id);await page.locator('#canvas').focus();await page.keyboard.press('a');await page.locator('[data-menu=view]').click();await page.locator('#command-menu [data-action=view-dialog]').click();await page.locator('#view-theme').selectOption('dark');await submit();await page.setViewportSize({width:390,height:844});await page.locator('#connection-options').click();await page.screenshot({path:'/private/tmp/ilapo-stage3-dark-dialog.png'});assert(await page.evaluate(()=>document.getElementById('dialog').scrollWidth<=innerWidth));
    assert.deepEqual(errors,[]);console.log('stage3-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;server.close();});
