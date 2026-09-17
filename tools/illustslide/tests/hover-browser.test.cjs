/* illustSlideのホバー候補表示とInspector上部の項目をChromeで確認する。 */
'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const http=require('node:http');
const os=require('node:os');
const path=require('node:path');
const C=require('../core.js');
let chromium;
try { ({chromium}=require('playwright')); } catch { ({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{
  const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,'');
  const file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
  if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}
  try { res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file)); }
  catch { res.writeHead(404).end(); }
});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
function fixture(){
  const d=C.createDocument();d.id='hover-fixture';d.pages[0].board={width:640,height:400,unit:'px',infinite:false};
  const object=C.makeShape('rect',100,100,180,120,{fill:'#B9DDF5',stroke:'#17324D',strokeWidth:2});object.id='hover-rect';object.name='ホバー対象';d.pages[0].objects=[object];return C.validateDocument(d);
}
async function screen(page,point){return page.evaluate(point=>{const camera=IlapoEditor.getCamera(),r=document.getElementById('canvas').getBoundingClientRect();return{x:r.left+(point.x-camera.x)/camera.width*r.width,y:r.top+(point.y-camera.y)/camera.height*r.height};},point);}
async function hoverWorld(page,point){const p=await screen(page,point);await page.mouse.move(p.x,p.y);await settle(page);}
async function load(page,value){await page.locator('#file-input').setInputFiles({name:'hover.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(value))});if(await page.locator('#replace-discard').isVisible())await page.locator('#replace-discard').click();await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,value.id);await settle(page);}
async function run(){
  const supplied=process.argv.find(value=>/^https?:/.test(value));if(!supplied)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});const context=await browser.newContext({viewport:{width:1280,height:820},hasTouch:true});const page=await context.newPage();page.setDefaultTimeout(12000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
  try {
    await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>!!window.IlapoEditor);const original=fixture();await load(page,original);
    await page.keyboard.press('v');await hoverWorld(page,{x:100,y:100});assert.equal(await page.locator('#canvas').getAttribute('data-hover-kind'),'anchor');assert.equal(await page.locator('#hover-preview circle').count(),2);assert.deepEqual(await page.evaluate(()=>IlapoEditor.getDocument()),original);
    await hoverWorld(page,{x:180,y:160});assert.equal(await page.locator('#canvas').getAttribute('data-hover-kind'),'whole');assert.equal(await page.locator('#hover-preview rect').count(),1);await page.mouse.move(20,20);await settle(page);await page.waitForTimeout(80);assert.equal(await page.locator('#hover-preview').innerHTML(),'');assert.equal(await page.locator('#canvas').getAttribute('data-hover-kind'),null,'mouseleave後に古い予約イベントで復活しない');
    // 選択済み全体の変形ハンドルでは、背後の頂点候補を表示しない。
    await page.locator('[data-object="hover-rect"]').click();await settle(page);const handle=await page.locator('[data-handle="se"]').boundingBox();assert(handle);
    await page.mouse.move(handle.x+handle.width/2,handle.y+handle.height/2);await settle(page);assert.equal(await page.locator('#hover-preview').innerHTML(),'');assert.equal(await page.locator('#canvas').getAttribute('data-hover-kind'),null);
    await hoverWorld(page,{x:180,y:160});await page.keyboard.press('a');await settle(page);assert.equal(await page.locator('#hover-preview').innerHTML(),'');await page.keyboard.press('Escape');
    await page.locator('[data-object="hover-rect"]').click();await settle(page);await page.locator('#style-button').click();const topTabs=await page.locator('#inspector-tabs [data-inspector-section]').evaluateAll(nodes=>nodes.map(node=>node.dataset.inspectorSection));assert(!topTabs.some(section=>['pages','objects','assets','board','view','animation'].includes(section)));assert.equal(await page.locator('#pages-toggle').isVisible(),true);assert.equal(await page.locator('#objects-toggle').isVisible(),true);assert.equal(await page.locator('#assets-toggle').isVisible(),true);
    await page.setViewportSize({width:390,height:820});await settle(page);assert((await page.locator('body').evaluate(el=>el.scrollWidth))<=390,'390pxで横スクロールしない');
    await page.setViewportSize({width:1280,height:820});await page.mouse.move(20,20);const before=await page.evaluate(()=>IlapoEditor.getDocument());const p=await screen(page,{x:180,y:160});await page.mouse.move(p.x,p.y);await page.mouse.down();await page.mouse.move(p.x+30,p.y+20,{steps:3});assert.equal(await page.locator('#hover-preview').innerHTML(),'');await page.keyboard.press('Escape');await page.mouse.up();await settle(page);assert.deepEqual(await page.evaluate(()=>IlapoEditor.getDocument()),before);
    assert.deepEqual(errors,[],'page errors: '+errors.join('; '));
  } finally { await browser.close();if(!supplied)await new Promise(resolve=>server.close(resolve)); }
}
run().catch(error=>{console.error(error);process.exitCode=1;});
