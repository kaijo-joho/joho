/* 接続の作成・折れ曲がり線の移動・端点の吸着を実際のポインターで検証する。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
async function inspectorSubmit(page){const submit=page.locator('#inspector-submit');if(await submit.isVisible())await submit.click();await settle(page);}
const screen=(page,p)=>page.evaluate(p=>{const c=IlapoEditor.getCamera(),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.x+(p.x-c.x)/c.width*r.width,y:r.y+(p.y-c.y)/c.height*r.height};},p);
const line=doc=>doc.pages[0].objects.find(o=>o.type==='connector');
const near=(a,b)=>assert(Math.abs(a-b)<.1,`${a} ≈ ${b}`);
async function drag(page,a,b,during){a=await screen(page,a);b=await screen(page,b);await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:8});await settle(page);if(during)await during();await page.mouse.up();await settle(page);}
async function pick(page,id){await page.locator('#objects-toggle').click();await page.locator(`[data-pick-object="${id}"]`).click();await settle(page);await page.locator('#inspector-close').click();await page.locator('#canvas').focus();await settle(page);}
async function load(page,doc){await page.locator('#file-input').setInputFiles({name:'elbows.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);await settle(page);}
(async()=>{
  const supplied=process.argv.find(s=>/^https?:/.test(s));if(!supplied)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=supplied||`http://127.0.0.1:${server.address().port}/illustslide/`,browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.on('pageerror',error=>errors.push(error.message));page.setDefaultTimeout(10000);
  try{
    await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);
    const doc=C.createDocument();doc.id='elbow-editing';doc.name='カギ型矢印の調整';doc.pages[0].board={width:640,height:420,unit:'px',infinite:false};
    const source=C.makeShape('rect',60,80,100,80,{fill:'#93C5FD'}),target=C.makeShape('rect',410,230,120,80,{fill:'#BBF7D0'});source.id='source';source.name='開始';target.id='target';target.name='次の処理';doc.pages[0].objects=[source,target];await load(page,doc);
    assert.equal(await page.locator('.palette [data-action=artboard],.palette [data-action=objects]').count(),0);
    await page.locator('.palette [data-tool=connector-orthogonal]').click();
    await drag(page,{x:160,y:120},{x:410,y:270},async()=>{assert.deepEqual(await read(page),doc,'creation preview is not saved');assert(await page.locator('.connection-target').isVisible());});
    const initial=await read(page),id=line(initial).id;assert.equal(line(initial).route,'orthogonal');assert.equal(line(initial).from.port,'right');assert.equal(line(initial).to.port,'left');assert.equal(line(initial).from.objectId,'source');assert.equal(line(initial).to.objectId,'target');
    let route=await page.evaluate(id=>IlapoConnectors.points(IlapoEditor.getDocument().pages[0].objects.find(o=>o.id===id)),id);
    assert.equal(route.length,4,'opposing horizontal ports use one centered bend lane');near(route[1].x,285);near(route[2].x,285);
    assert(await page.locator('[data-connection-handle="segment:1"]').isVisible());
    await drag(page,{x:285,y:195},{x:285,y:210});assert.deepEqual(await read(page),initial,'moving along the same segment leaves the route and history unchanged');
    await drag(page,{x:285,y:195},{x:325,y:195},async()=>{assert.deepEqual(await read(page),initial,'route preview is not saved');await page.keyboard.press('Escape');});
    assert.deepEqual(await read(page),initial,'Escape cancels a segment drag');
    await drag(page,{x:285,y:195},{x:325,y:195});const bent=await read(page);assert.equal(line(bent).waypoints.length,2);line(bent).waypoints.forEach(p=>near(p.x,325));
    assert.deepEqual(line(bent).from,line(initial).from);assert.deepEqual(line(bent).to,line(initial).to);
    await page.keyboard.press('Meta+z');await settle(page);assert.deepEqual(await read(page),initial,'one drag creates one Undo');await page.keyboard.press('Meta+Shift+z');await settle(page);assert.deepEqual(await read(page),bent);
    await pick(page,'target');await page.keyboard.press('v');await drag(page,{x:470,y:270},{x:550,y:310});
    const moved=await read(page),movedLine=line(moved);near(movedLine.to.x,490);near(movedLine.to.y,310);near(movedLine.waypoints[0].x,377.8);near(movedLine.waypoints[1].x,377.8);near(movedLine.waypoints[0].y,120);near(movedLine.waypoints[1].y,310);
    assert.deepEqual(await page.evaluate(()=>IlapoSVG.decodeProject(IlapoSVG.encodeProject(IlapoEditor.getDocument()))),moved,'relative bends survive native ZIP');
    await pick(page,id);await page.keyboard.press('a');await settle(page);
    await drag(page,movedLine.to,{x:550,y:350},async()=>{assert(await page.locator('.connection-target').isVisible());assert.deepEqual(await read(page),moved);});
    const attached=await read(page);assert.equal(line(attached).to.objectId,'target');assert.equal(line(attached).to.port,'bottom');near(line(attached).to.ratio,.5);near(line(attached).to.x,550);near(line(attached).to.y,350);
    await page.screenshot({path:'/private/tmp/illustslide-elbow-desktop.png'});
    await page.keyboard.down('Alt');await drag(page,line(attached).to,{x:550,y:310});await page.keyboard.up('Alt');
    const detached=await read(page);assert.equal(line(detached).to.objectId,null,'Option detaches inside a shape');near(line(detached).to.x,550);near(line(detached).to.y,310);
    await page.keyboard.press('Meta+z');await settle(page);assert.deepEqual(await read(page),attached);
    // New connectors can also be made with two clicks; cancelling the first leaves no object.
    await page.locator('.palette [data-tool=connector-orthogonal]').click();let q=await screen(page,{x:100,y:360});await page.mouse.click(q.x,q.y);await page.keyboard.press('Escape');assert.deepEqual(await read(page),attached);
    await page.locator('.palette [data-tool=connector]').click();q=await screen(page,{x:100,y:360});await page.mouse.click(q.x,q.y);q=await screen(page,{x:230,y:370});await page.mouse.click(q.x,q.y);await settle(page);assert.equal((await read(page)).pages[0].objects.at(-1).route,'straight');
    await page.keyboard.press('Meta+z');await settle(page);await pick(page,id);await page.keyboard.press('a');
    // The detailed panel remains available alongside the direct controls.
    await page.locator('#connection-options').click();await page.locator('#connection-to-ratio').fill('0.75');await inspectorSubmit(page);near(line(await read(page)).to.ratio,.75);await page.locator('#inspector-close').click();
    for(const width of [736,390]){await page.setViewportSize({width,height:844});await settle(page);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width<=560)await page.locator('#palette-toggle').click();assert(await page.locator('#shape-tools [data-tool=connector-orthogonal]').isVisible());if(width<=560)await page.keyboard.press('Escape');}
    await page.locator('#board-toggle').click();await page.locator('#view-toggle').click();await page.locator('#view-theme').selectOption('dark');await page.locator('#view-size').selectOption('xlarge');await inspectorSubmit(page);await page.locator('#inspector-close').click();await settle(page);await page.screenshot({path:'/private/tmp/illustslide-elbow-390px.png'});
    // A real touch drag moves the central lane, and retains attachment references.
    const touchContext=await browser.newContext({viewport:{width:390,height:844},hasTouch:true,isMobile:true}),touch=await touchContext.newPage();touch.on('pageerror',error=>errors.push(error.message));await touch.goto(url);await touch.waitForFunction(()=>!!window.IlapoEditor);await load(touch,bent);await pick(touch,id);await touch.locator('#canvas').focus();await touch.keyboard.press('a');await settle(touch);
    const position=await screen(touch,{x:325,y:195}),cdp=await touchContext.newCDPSession(touch);
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[position]});await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:position.x+20,y:position.y}]});await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(touch);
    const touched=line(await read(touch));assert(touched.waypoints[0].x>325);near(touched.waypoints[0].x,touched.waypoints[1].x);assert.equal(touched.from.objectId,'source');assert.equal(touched.to.objectId,'target');await touchContext.close();
    assert.deepEqual(errors,[]);console.log('connector-interaction-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
