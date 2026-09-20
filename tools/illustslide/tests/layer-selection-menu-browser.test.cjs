'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const http = require('node:http');
const path = require('node:path');
const os = require('node:os');
const C = require('../core.js');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (req, res) => {
  const relative = decodeURIComponent(new URL(req.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) return res.writeHead(403).end();
  try {
    res.setHeader('Content-Type', ({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream');
    res.end(await fs.readFile(file));
  } catch { res.writeHead(404).end(); }
});
const settle = page => page.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
function fixture() {
  const d=C.createDocument(),p=d.pages[0];d.id='layer-selection-menu';p.board={width:640,height:400,unit:'px',infinite:false};
  p.objects=[0,1,2].map(i=>{const o=C.makeShape('rect',70+i*150,100,90,70);o.id='box'+i;o.name='図形'+i;return o;});
  p.objects[0].group=p.objects[1].group='pair';
  p.layers=[{id:'back',name:'背景',visible:true,locked:false,objectIds:['box0','box1']},{id:'front',name:'前面 <図> &',visible:true,locked:false,objectIds:['box2']},{id:'locked',name:'固定',visible:true,locked:true,objectIds:[]},{id:'hidden',name:'非表示',visible:false,locked:false,objectIds:[]}];
  return C.validateDocument(d);
}
(async()=>{
  const supplied=process.argv.find(v=>/^https?:/.test(v));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(()=>IlapoEditor.getDocument());
  async function open(){
    await page.locator('#selection-more').click();
    await page.locator('#command-menu [data-action="selection-order"]').click();
    await page.locator('.command-submenu [data-action="selection-layer"]').click();
    await page.locator('[data-menu-kind="layer-change"]').waitFor();
  }
  try{
    await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>window.IlapoEditor);
    const doc=fixture();await page.locator('#file-input').setInputFiles({name:'layer-menu.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.waitForFunction(()=>IlapoEditor.getDocument().id==='layer-selection-menu');
    await page.locator('#canvas').focus();await page.keyboard.press('v');await page.locator('#artwork [data-object="box0"]').click();await settle(page);
    assert.deepEqual(await page.evaluate(()=>IlapoEditor.getSelection()),['box0','box1']);
    await open();
    for(const id of ['back','locked','hidden'])assert.equal(await page.locator(`[data-action="layer-set:${id}"]`).isDisabled(),true,id);
    assert.equal(await page.locator('[data-action="layer-set:front"]').innerText(),'前面 <図> &','名前をHTMLとして扱わない');
    await page.locator('[data-action="layer-set:front"]').click();await settle(page);
    const moved=await read();assert.deepEqual(moved.pages[0].layers.find(l=>l.id==='front').objectIds,['box2','box0','box1']);assert.deepEqual(moved.pages[0].layers.find(l=>l.id==='back').objectIds,[]);
    assert.deepEqual(moved.pages[0].objects.slice(1),doc.pages[0].objects.slice(0,2),'形状・書式・グループを保持');
    assert.equal(await page.evaluate(()=>IlapoEditor.getState().activeLayerId),'front');
    await page.locator('#canvas').focus();await page.keyboard.press('Meta+z');await settle(page);assert.deepEqual(await read(),doc,'レイヤー移動が1 Undoで戻る');
    await page.keyboard.press('Meta+Shift+z');await settle(page);assert.deepEqual(await read(),moved);
    await page.locator('#artwork [data-object="box0"]').click();await settle(page);await open();
    await page.keyboard.press('Escape');assert.equal(await page.locator('[data-menu-kind="layer-change"]').count(),0);assert.equal(await page.locator('[data-menu-kind="order"]').isVisible(),true,'Escapeは一段だけ戻る');
    await page.keyboard.press('Escape');await page.keyboard.press('Escape');
    await page.setViewportSize({width:390,height:850});await settle(page);await open();
    assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
    const target=page.locator('[data-action="layer-set:back"]');assert.equal(await target.isVisible(),true);await target.click();await settle(page);
    assert.deepEqual((await read()).pages[0].layers.find(l=>l.id==='back').objectIds,['box0','box1']);
    assert.deepEqual(errors,[]);console.log('layer-selection-menu-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
