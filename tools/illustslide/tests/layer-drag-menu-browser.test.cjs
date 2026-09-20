/* Layer menus remain reachable; cross-layer drops preserve exact stacking and groups. */
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
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
function fixture(){
  const d=C.createDocument(),p=d.pages[0];d.id='layer-drag-menu';p.board={width:640,height:400,unit:'px',infinite:false};
  p.objects=['source','s1','s2','back','middle','front','t1','t2'].map((id,i)=>{const o=C.makeShape('rect',10+i*60,120,40,40);o.id=o.name=id;if(id.startsWith('s')&&id!=='source')o.group='source-pair';if(id.startsWith('t'))o.group='target-pair';return o;});
  p.layers=[{id:'source-layer',name:'元のレイヤー',visible:true,locked:false,objectIds:['source','s1','s2']},{id:'target-layer',name:'移動先',visible:true,locked:false,objectIds:['back','middle','front','t1','t2']},{id:'empty',name:'空のレイヤー',visible:true,locked:false,objectIds:[]},{id:'locked',name:'固定',visible:true,locked:true,objectIds:[]},{id:'hidden',name:'非表示',visible:false,locked:false,objectIds:[]}];
  return C.validateDocument(d);
}
(async()=>{
  const supplied=process.argv.find(v=>/^https?:/.test(v));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:1200},hasTouch:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(()=>IlapoEditor.getDocument());
  const contents=async id=>(await read()).pages[0].layers.find(l=>l.id===id).objectIds;
  const undo=async()=>{await page.locator('#canvas').focus();await page.keyboard.press('Meta+z');await settle(page);};
  async function drag(source,target,front,options={}){
    await source.scrollIntoViewIfNeeded();await target.scrollIntoViewIfNeeded();
    const a=await source.boundingBox(),b=await target.boundingBox();assert(a&&b);
    await page.mouse.move(a.x+a.width/2,a.y+a.height/2);await page.mouse.down();
    await page.mouse.move(b.x+b.width/2,b.y+b.height*(front ? .2 : .8),{steps:7});
    assert.equal(await page.locator('.drop-before,.drop-after').count(),options.blocked?0:1);
    if(options.cancel)await page.keyboard.press('Escape');
    await page.mouse.up();await settle(page);
  }
  const source=()=>page.locator('[data-object-row="source"] [data-object-drag]');
  const row=id=>page.locator('[data-object-row="'+id+'"]');
  const header=id=>page.locator('[data-layer-id="'+id+'"] > .object-layer-head');
  try{
    await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>window.IlapoEditor);
    const original=fixture();await page.locator('#file-input').setInputFiles({name:'layer-drag.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(original))});await page.waitForFunction(()=>IlapoEditor.getDocument().id==='layer-drag-menu');
    await page.locator('#objects-toggle').click();await settle(page);
    for(const front of [true,false]){
      await drag(source(),row('middle'),front);
      assert.deepEqual(await contents('target-layer'),front?['back','middle','source','front','t1','t2']:['back','source','middle','front','t1','t2'],'上半分/下半分の指定位置へ挿入する');
      await undo();assert.deepEqual(await read(),original,'レイヤー移動を1回でUndo');
    }
    await drag(source(),header('empty'),true);assert.deepEqual(await contents('empty'),['source']);await undo();
    for(const id of ['locked','hidden']){await drag(source(),header(id),true,{blocked:true});assert.deepEqual(await read(),original,'非表示・固定レイヤーへの移動を防ぐ');}
    await drag(source(),row('middle'),true,{cancel:true});assert.deepEqual(await read(),original);
    // A source child moves its complete group without merging into the target group.
    await page.locator('[data-object-group-toggle="source-pair"]').click();
    await page.locator('[data-object-group-toggle="target-pair"]').click();await settle(page);
    for(const front of [true,false]){
      await drag(row('s1').locator('[data-object-drag]'),row(front?'t2':'t1'),front);
      assert.deepEqual(await contents('target-layer'),front?['back','middle','front','t1','t2','s1','s2']:['back','middle','front','s1','s2','t1','t2']);
      assert.deepEqual(await contents('source-layer'),['source']);
      assert.deepEqual((await read()).pages[0].objects.filter(o=>['s1','s2'].includes(o.id)).map(o=>o.group),['source-pair','source-pair']);
      await undo();assert.deepEqual(await read(),original);
    }
    // Menus overlay layer boundaries and the scrolling panel, including empty layers.
    await page.locator('[data-object-group-toggle="source-pair"]').click();await page.locator('[data-object-group-toggle="target-pair"]').click();
    const toggle=page.locator('[data-layer-more="empty"]'),menu=page.locator('[data-layer-menu="empty"]');
    for(const width of [1280,390]){
      await page.setViewportSize({width,height:850});await settle(page);
      if(width===1280){await page.locator('#inspector-resize').focus();await page.keyboard.press('Home');await settle(page);}
      await toggle.scrollIntoViewIfNeeded();await page.locator('[data-layer-pick="empty"]').focus();
      const beforeFocus=await page.evaluate(()=>document.activeElement.id);await toggle.hover();await settle(page);
      assert.equal(await page.evaluate(()=>document.activeElement.id),beforeFocus,'ホバーではフォーカスを奪わない');
      assert(await menu.evaluate(el=>el.matches(':popover-open')));
      assert(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return r.left>=0&&r.right<=innerWidth&&r.top>=0&&r.bottom<=innerHeight;}));
      assert(await menu.locator('button').evaluateAll(nodes=>nodes.every(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})),'メニューの全アイコンがクリックできる');
      await page.screenshot({path:'/private/tmp/illustslide-layer-menu-'+width+'.png'});
      const h=await header('empty').boundingBox(),t=await toggle.boundingBox();assert(t.y>=h.y&&t.y+t.height<=h.y+h.height,'︙は名前と同じ行');
      await toggle.click();await page.keyboard.press('Escape');await settle(page);
      assert.equal(await menu.evaluate(el=>el.matches(':popover-open')),false);assert.equal(await page.evaluate(()=>document.activeElement.id),'object-layer-more-empty');assert(await page.locator('#inspector-panel').isVisible());
      await page.keyboard.press('ArrowDown');assert(await menu.evaluate(el=>el.matches(':popover-open')));
      assert.equal(await menu.locator('button:focus').count(),1);
      await page.keyboard.press('Escape');await toggle.hover();await header('target-layer').click();await settle(page);
      assert.equal(await page.locator('[data-layer-menu]:popover-open').count(),0,'外側のクリックでメニューを閉じる');
      await toggle.click();await menu.locator('[data-object-command="layer-rename"]').click();await page.locator('#dialog-cancel').click();await settle(page);
      assert.equal(await page.evaluate(()=>document.activeElement.id),'object-layer-more-empty','名前変更をキャンセルすると︙へ戻る');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    assert.deepEqual(errors,[]);console.log('layer-drag-menu-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
