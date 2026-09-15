const assert = require('node:assert/strict');
const fs = require('node:fs/promises'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const Core = require('../core.js');
const Render = require('../render.js');
let pw; try { pw = require('playwright'); } catch { pw = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')); }
async function serve() {
  const root=path.resolve(__dirname,'..'),allowed=new Set(['index.html','output.js','parts.js','core.js','render.js','editor.js','editor.css','storage.js','local-autosave.js','icon.svg']);
  const types={'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'};
  const server=http.createServer(async(req,res)=>{
    const file=new URL(req.url,'http://localhost').pathname.slice(1)||'index.html';
    if(!allowed.has(file))return res.writeHead(404).end();
    try {res.writeHead(200,{'Content-Type':types[path.extname(file)]});res.end(await fs.readFile(path.join(root,file)));}catch{res.writeHead(404).end();}
  });
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  return {url:`http://127.0.0.1:${server.address().port}/`,close:()=>new Promise(resolve=>server.close(resolve))};
}
const getDoc=page=>page.evaluate(()=>DiagramEditor.getDocument());
const select=(page,ids)=>page.evaluate(ids=>DiagramEditor.select(ids),ids);
async function load(page,doc) {
  await page.locator('#file-input').setInputFiles({name:'waypoints.diagram.json',mimeType:'application/json',buffer:Buffer.from(Core.serializeDocument(doc))});
  await page.locator('[data-open-source="local-file"]').click();
  if(await page.locator('#confirm-dialog').isVisible())await page.locator('#confirm-continue').click();
  await page.waitForFunction(expected=>JSON.stringify(DiagramEditor.getDocument())===expected,JSON.stringify(Core.parseDocument(doc)));
}
async function menu(page,id) {if(await page.locator('#'+id).getAttribute('open')===null)await page.locator('#'+id+' > summary').click();}
async function start(page,id) {await select(page,[id]);await menu(page,'shape-menu');await page.locator('#edit-waypoints').click();assert.equal(await page.locator('#route-bar').isVisible(),true);}
async function screen(page,p) {return page.evaluate(p=>{const q=new DOMPoint(p.x,p.y).matrixTransform(document.getElementById('world').getScreenCTM());return {x:q.x,y:q.y};},p);}
async function drawDrag(page,point,delta,{alt=false,cancel=null}={}) {
  const a=await screen(page,point),b=await screen(page,{x:point.x+delta.x,y:point.y+delta.y});
  if(alt)await page.keyboard.down('Alt');
  await page.mouse.move(a.x,a.y);await page.mouse.down();await page.mouse.move(b.x,b.y,{steps:6});
  if(cancel==='Escape')await page.keyboard.press('Escape');
  if(cancel==='pointercancel')await page.locator('#canvas').evaluate(el=>el.dispatchEvent(new PointerEvent('pointercancel',{bubbles:true,pointerId:1})));
  await page.mouse.up();if(alt)await page.keyboard.up('Alt');
}
function fixture() {
  const d=Core.createDocument(),a=Core.createNode('process',100,150,{id:'way_a',text:'開始'}),b=Core.createNode('process',600,360,{id:'way_b',text:'終了'});
  const e=Core.createEdge({nodeId:a.id,side:'right',offset:.5},{nodeId:b.id,side:'left',offset:.5},{id:'way_edge',kind:'orthogonal',label:{text:'条件',dx:15,dy:-20},head:'both'});
  d.title='折れ曲がり点の確認';d.nodes=[a,b];d.edges=[e];return d;
}
async function desktop(page,artifacts,engine) {
  const d=fixture(),id=d.edges[0].id;await load(page,d);await start(page,id);
  const initial=await page.locator('#waypoint-index option').count(),before=await getDoc(page);assert.deepEqual(before,d,'Entering does not change the document');
  await page.locator('[data-handle="waypoint-add"]').first().click();
  let current=await getDoc(page);assert.equal(current.edges[0].waypoints.length,initial+1);
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),before);await page.locator('#redo').click();assert.deepEqual(await getDoc(page),current);
  const index=Number(await page.locator('#waypoint-index').inputValue());
  await menu(page,'waypoint-position');await page.locator('#waypoint-x').fill('340');await page.locator('#waypoint-y').fill('240');await page.locator('#apply-waypoint').click();
  current=await getDoc(page);assert.deepEqual(current.edges[0].waypoints[index],{x:340,y:240});assert.deepEqual(current.edges[0].label,d.edges[0].label);assert.equal(current.edges[0].head,'both');
  await page.locator('#waypoint-x').fill('100001');await page.locator('#apply-waypoint').click();assert.deepEqual(await getDoc(page),current,'Invalid coordinates preserve the document');
  await page.locator('#waypoint-x').fill('340');await page.locator('#waypoint-x').press('Escape');
  await drawDrag(page,current.edges[0].waypoints[index],{x:27,y:13});
  const dragged=await getDoc(page);assert.deepEqual(dragged.edges[0].waypoints[index],{x:370,y:250});
  assert.deepEqual(dragged.edges[0].waypoints.filter((_,i)=>i!==index),current.edges[0].waypoints.filter((_,i)=>i!==index));
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),current);await page.locator('#redo').click();
  await drawDrag(page,dragged.edges[0].waypoints[index],{x:7.25,y:3.5},{alt:true});
  const free=await getDoc(page),p=free.edges[0].waypoints[index];assert.ok(Math.abs(p.x-377.25)<1&&Math.abs(p.y-253.5)<1,'Option disables grid snapping');
  for(const cancel of ['Escape','pointercancel']) {
    const redo=await page.locator('#redo').isDisabled();await drawDrag(page,p,{x:40,y:40},{cancel});
    assert.deepEqual(await getDoc(page),free,cancel+' restores the points');assert.equal(await page.locator('#redo').isDisabled(),redo);
  }
  await page.locator('#canvas').focus();await page.keyboard.press('ArrowRight');await page.keyboard.press('Shift+ArrowDown');
  current=await getDoc(page);assert.ok(Math.abs(current.edges[0].waypoints[index].x-p.x-1)<1e-6);assert.ok(Math.abs(current.edges[0].waypoints[index].y-p.y-10)<1e-6);
  await page.keyboard.press('Delete');const deleted=await getDoc(page);assert.equal(deleted.edges.length,1);assert.equal(deleted.edges[0].waypoints.length,free.edges[0].waypoints.length-1);assert.deepEqual(deleted.nodes,free.nodes);
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),current);
  await page.locator('#add-waypoint').click();await page.keyboard.press('Enter');const added=await getDoc(page);assert.equal(added.edges[0].waypoints.length,current.edges[0].waypoints.length+1);
  await page.keyboard.press('Escape');assert.equal(await page.locator('#route-bar').isHidden(),true);assert.equal(await page.locator('#shape-menu > summary').evaluate(el=>el===document.activeElement),true);
  const saving=page.waitForEvent('download');await menu(page,'file-menu');await page.locator('#save-file').click();const download=await saving,file=path.join(artifacts,engine+'.diagram.json');await download.saveAs(file);
  const raw=JSON.parse(await fs.readFile(file,'utf8'));assert.equal(raw.version,3);assert.deepEqual(Core.parseDocument(raw),added);
  await load(page,raw);assert.deepEqual(await getDoc(page),added);assert.equal(await page.locator('#route-bar').isHidden(),true,'Editing controls are not stored');
  await menu(page,'file-menu');await page.locator('#save-browser').click();await page.reload();await page.locator('[data-open-source="browser-manual"]').click();assert.deepEqual(await getDoc(page),added);
  await start(page,id);await menu(page,'waypoint-position');await page.locator('#auto-route').click();assert.equal((await getDoc(page)).edges[0].waypoints.length,0);assert.equal(await page.locator('#route-bar').isHidden(),true);
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),added);
  await select(page,[id]);await menu(page,'shape-menu');await page.locator('#reverse-edge').click();
  const reversed=await getDoc(page);assert.deepEqual(reversed.edges[0].waypoints,[...added.edges[0].waypoints].reverse());assert.deepEqual(reversed.edges[0].from,added.edges[0].to);assert.deepEqual(reversed.edges[0].to,added.edges[0].from);
  await page.locator('#undo').click();await select(page,d.nodes.map(n=>n.id));await menu(page,'edit-menu');await page.locator('#group-button').click();
  const grouped=await getDoc(page);await page.locator('#canvas').focus();await page.keyboard.press('Shift+ArrowRight');
  const moved=await getDoc(page);assert.deepEqual(moved.edges[0].waypoints,grouped.edges[0].waypoints.map(p=>({x:p.x+10,y:p.y})));assert.equal(moved.nodes[0].x,grouped.nodes[0].x+10);
  await menu(page,'edit-menu');await page.locator('#duplicate-button').click();
  const copies=await getDoc(page),copy=copies.edges.find(e=>e.id!==id);assert.ok(copy);assert.deepEqual(copy.waypoints,moved.edges[0].waypoints.map(p=>({x:p.x+30,y:p.y+30})));assert.notEqual(copy.from.nodeId,moved.edges[0].from.nodeId);assert.equal(copies.groups.length,2);
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),moved);await page.locator('#undo').click();await page.locator('#undo').click();
  await select(page,[id]);await menu(page,'shape-menu');await page.locator('#edge-head').selectOption('none');assert.deepEqual((await getDoc(page)).edges[0].waypoints,added.edges[0].waypoints);
  await page.locator('#edge-kind').selectOption('curve');assert.deepEqual((await getDoc(page)).edges[0].waypoints,[]);await page.locator('#undo').click();
  await menu(page,'edit-menu');await page.locator('#lock-button').click();await menu(page,'shape-menu');assert.equal(await page.locator('#edit-waypoints').isDisabled(),true);assert.equal(await page.locator('[data-handle="waypoint"]').count(),0);
  await page.locator('#shape-menu > summary').press('Escape');await page.locator('#canvas').focus();const locked=await getDoc(page);await page.keyboard.press('Delete');assert.deepEqual(await getDoc(page),locked);
  await page.locator('#undo').click();await select(page,[id]);const svg=await page.evaluate(()=>DiagramEditor.exportSVG());assert.doesNotMatch(svg,/data-handle|route-bar|waypoint-index/);
  await start(page,id);await page.screenshot({path:path.join(artifacts,engine+'-wide.png')});await page.locator('#finish-waypoints').click();
  const splitDoc=Core.createDocument(),split=Core.createEdge({x:0,y:100},{x:700,y:100},{id:'split',label:{text:'条件'},waypoints:[{x:100,y:100},{x:100,y:300},{x:600,y:300},{x:600,y:100}]});splitDoc.edges=[split];
  await load(page,splitDoc);await select(page,[split.id]);await menu(page,'shape-menu');await page.locator('#insert-process').click();
  const inserted=await getDoc(page);assert.equal(inserted.nodes.length,1);assert.equal(inserted.edges.length,2);assert.ok(inserted.edges[0].waypoints.length&&inserted.edges[1].waypoints.length);assert.deepEqual(inserted.edges[0].from,split.from);assert.deepEqual(inserted.edges[1].to,split.to);assert.equal(inserted.edges[0].label.text,'条件');
  await page.locator('#undo').click();assert.deepEqual(await getDoc(page),splitDoc);

  const straightDoc=Core.createDocument(),straight=Core.createEdge({x:100,y:150},{x:700,y:150},{id:'first_point'});straightDoc.edges=[straight];
  await load(page,straightDoc);await start(page,straight.id);
  assert.equal(await page.locator('#waypoint-index').inputValue(),'-1');assert.equal(await page.locator('#waypoint-index').isDisabled(),true);
  await page.locator('[data-handle="waypoint-add"]').first().click();const single=await getDoc(page);
  assert.equal(single.edges[0].waypoints.length,1);assert.equal(await page.locator('#waypoint-index').inputValue(),'0');assert.equal(await page.locator('#waypoint-index').isDisabled(),false);assert.equal(await page.locator('#waypoint-index option').textContent(),'1');
  await page.locator('#undo').click();assert.equal(await page.locator('#waypoint-index').inputValue(),'-1');await page.locator('#redo').click();assert.equal(await page.locator('#waypoint-index').inputValue(),'0');
  await page.locator('#canvas').focus();await page.keyboard.press('Delete');assert.equal((await getDoc(page)).edges[0].waypoints.length,0);assert.equal(await page.locator('#route-bar').isHidden(),true);await page.locator('#undo').click();assert.deepEqual(await getDoc(page),single);

  for(const kind of ['state','decision'])for(const toSide of ['auto','top']) {
    const loopDoc=Core.createDocument('state'),loopNode=Core.createNode(kind,200,200,{id:'loop_node'}),loop=Core.createEdge({nodeId:loopNode.id,side:'auto'},{nodeId:loopNode.id,side:toSide},{id:'loop',label:{text:'再試行',t:.3,dx:14,dy:-20},waypoints:[{x:470,y:218},{x:530,y:300},{x:470,y:310}]});loopDoc.nodes=[loopNode];loopDoc.edges=[loop];
    await load(page,loopDoc);const loopBefore=Render.edgeGeometry(loopDoc,loop);await select(page,[loop.id]);await menu(page,'shape-menu');await page.locator('#reverse-edge').click();
    const loopReversed=await getDoc(page),loopAfter=Render.edgeGeometry(loopReversed,loopReversed.edges[0]);
    assert.deepEqual(loopAfter.from,loopBefore.to);assert.deepEqual(loopAfter.to,loopBefore.from);assert.deepEqual(loopAfter.points,[...loopBefore.points].reverse());assert.ok(Math.hypot(loopAfter.label.x-loopBefore.label.x,loopAfter.label.y-loopBefore.label.y)<1e-6);
    await page.locator('#undo').click();assert.deepEqual(await getDoc(page),loopDoc,'Undo restores automatic anchors as well as the route');
  }
}
async function mobile(browser,url,artifacts,engine) {
  const context=await browser.newContext({viewport:{width:390,height:844},hasTouch:true});
  try {
    const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
    await page.goto(url);await page.waitForFunction(()=>!!window.DiagramEditor);
    await page.locator('#toolbar-toggle').tap();await page.locator('#settings-menu > summary').tap();await page.locator('#theme').selectOption('dark');await page.locator('#text-size').selectOption('largest');await page.locator('#text-size').press('Escape');
    const d=fixture();d.edges[0].waypoints=[{x:380,y:182},{x:380,y:392}];await load(page,d);await start(page,d.edges[0].id);
    await page.locator('[data-handle="waypoint"][data-index="1"]').tap();assert.equal(await page.locator('#waypoint-index').inputValue(),'1');
    await page.locator('#waypoint-position > summary').tap();const panel=await page.locator('#waypoint-position > .menu-panel').boundingBox();assert.ok(panel.x>=0&&panel.x+panel.width<=391&&panel.y>=0&&panel.y+panel.height<=845);
    await page.locator('#waypoint-x').fill('410');await page.locator('#apply-waypoint').tap();assert.equal((await getDoc(page)).edges[0].waypoints[1].x,410);
    await page.locator('#waypoint-x').press('Escape');assert.equal(await page.locator('#waypoint-position > summary').evaluate(el=>el===document.activeElement),true);
    const bar=await page.locator('#route-bar').boundingBox();assert.ok(bar.x>=0&&bar.x+bar.width<=391);assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=390));
    for(const id of ['add-waypoint','remove-waypoint','finish-waypoints']){const box=await page.locator('#'+id).boundingBox();assert.ok(box.width>=43&&box.height>=43,id+' has a usable tap target');}
    await page.screenshot({path:path.join(artifacts,engine+'-narrow-dark.png'),fullPage:true});await page.locator('#finish-waypoints').focus();await page.keyboard.press('Enter');assert.equal(await page.locator('#route-bar').isHidden(),true);assert.deepEqual(errors,[]);
  } finally {await context.close();}
}
async function run() {
  const host=await serve(),artifacts=path.join(os.tmpdir(),'joho-flowchart-waypoints-browser');await fs.mkdir(artifacts,{recursive:true});
  try {for(const engine of process.argv.includes('--chrome-only')?['chromium']:['chromium','webkit']) {
    const browser=await pw[engine].launch(engine==='chromium'?{channel:'chrome',headless:true}:{headless:true});
    try {
      const context=await browser.newContext({viewport:{width:1280,height:800},acceptDownloads:true}),page=await context.newPage(),errors=[];page.setDefaultTimeout(12000);page.on('pageerror',e=>errors.push(e.message));
      await page.goto(host.url);await page.waitForFunction(()=>!!window.DiagramEditor);await desktop(page,artifacts,engine);assert.deepEqual(errors,[]);await context.close();
      await mobile(browser,host.url,artifacts,engine);console.log(`${engine}: waypoint edits, cancellation, saving, connected operations and narrow touch UI passed`);
    } finally {await browser.close();}
  }}finally{await host.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;});
