/* Chromeで、全体選択の1:1リサイズ吸着を実際のポインタ操作で確認する。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http'),C=require('../core.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(request,response)=>{
  const relative=decodeURIComponent(new URL(request.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);
  if(!file.startsWith(root+path.sep)){response.writeHead(403).end();return;}
  try{response.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');response.end(await fs.readFile(file));}catch{response.writeHead(404).end();}
});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const documentOf=page=>page.evaluate(()=>IlapoEditor.getDocument());
function fixture(id='square-resize',board={width:400,height:280,unit:'px',infinite:false},shapeBox={x:100,y:100,width:100,height:50}){const document=C.createDocument();document.id=id;document.pages[0].board=board;const shape=C.makeShape('rect',shapeBox.x,shapeBox.y,shapeBox.width,shapeBox.height,{fill:'#2563EB'});shape.id='box';document.pages[0].objects=[shape];return document;}
(async()=>{
  const supplied=process.argv.find(value=>/^https?:/.test(value));if(!supplied)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const url=supplied||`http://127.0.0.1:${server.address().port}/illustslide/`,browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:800}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',error=>errors.push(error.message));
  const world=point=>page.evaluate(point=>{const canvas=document.getElementById('canvas').getBoundingClientRect(),camera=IlapoEditor.getCamera();return{x:canvas.x+(point.x-camera.x)/camera.width*canvas.width,y:canvas.y+(point.y-camera.y)/camera.height*canvas.height};},point);
  async function load(document){await page.locator('#file-input').setInputFiles({name:'square.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(document))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,document.id);await settle(page);await page.locator('#canvas').focus();await page.keyboard.press('v');await page.locator('[data-object="box"]').click();await settle(page);}
  async function handle(key){const box=await page.locator(`[data-handle="${key}"]`).boundingBox();assert(box,`${key} handle is visible`);return{x:box.x+box.width/2,y:box.y+box.height/2};}
  async function begin(key){const start=await handle(key);await page.mouse.move(start.x,start.y);await page.mouse.down();return start;}
  async function moveWorld(point,steps=5){const target=await world(point);await page.mouse.move(target.x,target.y,{steps});}
  const selectionBox=()=>page.locator('#selection > rect').evaluate(node=>({x:Number(node.getAttribute('x')),y:Number(node.getAttribute('y')),width:Number(node.getAttribute('width')),height:Number(node.getAttribute('height'))}));
  async function squareTarget(deltaPixels,edge=false){const box=await selectionBox(),zoom=await page.evaluate(()=>{const canvas=document.getElementById('canvas');return canvas.clientWidth/IlapoEditor.getCamera().width;});return{x:box.x+box.height+deltaPixels/zoom,y:box.y+(edge?box.height/2:box.height)};}
  const bounds=async()=>page.evaluate(()=>IlapoGeometry.bounds(IlapoEditor.getDocument().pages[0].objects.find(object=>object.id==='box')));
  try{
    // 辺のドラッグ: 高さを変えず、1:1に入ったら幅だけをそろえる。
    const original=fixture();await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);await load(original);const beforeEdge=await documentOf(page);await begin('e');await moveWorld(await squareTarget(3,true));
    assert.equal(await page.locator('#alignment-guides .alignment-ratio text').textContent(),'1:1','辺のリサイズ中に1:1ガイドを表示する');assert.deepEqual(await documentOf(page),beforeEdge,'プレビュー中は文書を変更しない');await page.mouse.up();await settle(page);let box=await bounds();assert(Math.abs(box.width-box.height)<1e-5,'辺のリサイズが正方形へ吸着する');assert(Math.abs(box.y-100)<1e-5,'辺のリサイズでは非操作辺を保つ');const edgeAfter=await documentOf(page);await page.keyboard.press('Meta+z');await settle(page);assert.deepEqual(await documentOf(page),beforeEdge,'1回のUndoで辺のリサイズを戻す');await page.keyboard.press('Meta+Shift+z');await settle(page);assert.deepEqual(await documentOf(page),edgeAfter,'Redoで辺のリサイズを戻す');

    // 角のドラッグと、画面上6pxで入って10pxを越えるまで保持することを確認する。
    await load(fixture('square-corner'));await begin('se');await moveWorld(await squareTarget(4));assert.equal(await page.locator('#alignment-guides .alignment-ratio text').textContent(),'1:1','6px以内で1:1へ吸着する');await moveWorld(await squareTarget(8));assert.equal(await page.locator('#alignment-guides .alignment-ratio text').textContent(),'1:1','10px以内では1:1を保持する');await moveWorld(await squareTarget(12));assert.equal(await page.locator('#alignment-guides .alignment-ratio').count(),0,'10pxを越えると1:1を解除する');await page.mouse.up();await settle(page);box=await bounds();assert(Math.abs(box.width-box.height)>1e-3,'解除後はポインタの縦横差を保つ');

    // OptionとShiftは、1:1より既存の一時解除／元比率保持を優先する。
    await load(fixture('square-option'));await begin('se');await page.keyboard.down('Alt');await moveWorld(await squareTarget(3));assert.equal(await page.locator('#alignment-guides .alignment-ratio').count(),0,'Option中は1:1ガイドを表示しない');await page.mouse.up();await page.keyboard.up('Alt');await settle(page);box=await bounds();assert(Math.abs(box.width-box.height)>1e-3,'Option中は正方形へ吸着しない');
    await load(fixture('square-shift'));await begin('se');await page.keyboard.down('Shift');await moveWorld({x:155,y:150});assert.equal(await page.locator('#alignment-guides .alignment-ratio').count(),0,'Shift中は1:1ガイドを表示しない');await page.mouse.up();await page.keyboard.up('Shift');await settle(page);box=await bounds();assert(Math.abs(box.width/box.height-2)<1e-5,'Shiftは元の2:1比率を保つ');

    // Escapeはドラッグ中の1:1プレビューを確定しない。
    await load(fixture('square-escape'));const beforeEscape=await documentOf(page);await begin('se');await moveWorld(await squareTarget(3));assert.equal(await page.locator('#alignment-guides .alignment-ratio').count(),1);await page.keyboard.press('Escape');await page.mouse.up();await settle(page);assert.deepEqual(await documentOf(page),beforeEscape,'Escapeは1:1リサイズを取り消す');

    // 18px用紙と390px幅でも、pixelSnapと1:1の結果を整数座標で維持する。
    await page.setViewportSize({width:390,height:844});await load(fixture('square-18',{width:18,height:18,unit:'px',infinite:false},{x:2,y:2,width:10,height:6}));await begin('se');await moveWorld(await squareTarget(0));assert.equal(await page.locator('#alignment-guides .alignment-ratio').count(),1);await page.mouse.up();await settle(page);box=await bounds();for(const value of [box.x,box.y,box.width,box.height])assert(Math.abs(value-Math.round(value))<1e-9,'18px用紙でもpixelSnapの整数座標を保つ');assert(Math.abs(box.width-box.height)<1e-5,'390px幅でも正方形へ吸着する');assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'390px幅で横にはみ出さない');
    assert.deepEqual(errors,[]);console.log('square-resize-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();if(!supplied)server.close();}
})().catch(error=>{console.error(error);process.exitCode=1;server.close();});
