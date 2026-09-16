/* 非等方変形後も、線幅を作品座標の値として保持するChrome回帰。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
function fixture(){const d=C.createDocument();d.id='stroke-width';d.pages[0].board={width:640,height:400,unit:'px',infinite:false};const arrow=C.makeShape('arrow',100,100,100,60,{fill:'#ffffff',stroke:'#123456',strokeWidth:6});arrow.id='arrow';d.pages[0].objects=[arrow];return d;}
(async()=>{const supplied=process.argv.find(value=>/^https?:/.test(value));if(!supplied)await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));const browser=await chromium.launch({channel:'chrome',headless:true});try{const page=await browser.newPage({viewport:{width:1280,height:800}});page.setDefaultTimeout(10000);const errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>!!window.IlapoEditor);const d=fixture();await page.locator('#file-input').setInputFiles({name:'stroke.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(d))});await page.waitForFunction(()=>IlapoEditor.getDocument().id==='stroke-width');await page.locator('#canvas').focus();await page.keyboard.press('v');const point=await page.evaluate(()=>{const canvas=document.querySelector('#canvas').getBoundingClientRect(),camera=IlapoEditor.getCamera();return{x:canvas.x+(150-camera.x)/camera.width*canvas.width,y:canvas.y+(130-camera.y)/camera.height*canvas.height};});await page.mouse.click(point.x,point.y);await settle(page);
async function transform(width,scale){await page.locator('#selection-bar [data-action="transform"]').click();await page.locator('#transform-width').fill(String(width));if(scale)await page.locator('#scale-stroke').check();await page.locator('#inspector-submit').click();await settle(page);}
await transform(300,false);let state=await page.evaluate(()=>IlapoEditor.getDocument().pages[0].objects[0]);assert.equal(state.style.strokeWidth,6,'横だけを3倍にしても線幅の数値は変わらない');let markup=await page.locator('[data-object="arrow"]').innerHTML();assert.match(markup,/stroke-width="6"/);await page.screenshot({path:'/private/tmp/illustslide-stroke-width.png'});assert.doesNotMatch(markup,/matrix\(3 0 0 1/,'描画用SVGはパスを作品座標へ焼き込む');
// 実際のPNG画素で縦辺・横辺を測り、出力倍率にも追従することを確認する。
const pixels=await page.evaluate(async()=>{
  const results=[],art=IlapoEditor.getDocument().pages[0];
  for(const scale of [1,2]){
    const blob=await IlapoExport.png(art,{scale,background:'transparent'}),bitmap=await createImageBitmap(blob);
    const canvas=document.createElement('canvas');canvas.width=bitmap.width;canvas.height=bitmap.height;
    const context=canvas.getContext('2d');context.drawImage(bitmap,0,0);bitmap.close();
    const data=context.getImageData(0,0,canvas.width,canvas.height).data;
    const ink=(x,y)=>{const i=(y*canvas.width+x)*4;return data[i+3]>220&&Math.abs(data[i]-18)<3&&Math.abs(data[i+1]-52)<3&&Math.abs(data[i+2]-86)<3;};
    let vertical=0,horizontal=0;
    for(let x=90*scale;x<110*scale;x++)if(ink(x,130*scale))vertical++;
    for(let y=108*scale;y<128*scale;y++)if(ink(130*scale,y))horizontal++;
    results.push({scale,vertical,horizontal});
  }
  return results;
});
assert.deepEqual(pixels,[{scale:1,vertical:6,horizontal:6},{scale:2,vertical:12,horizontal:12}],'PNGの縦横の枠線は同じ太さで、出力倍率だけに追従する');
const beforeZoom=await page.evaluate(()=>({camera:IlapoEditor.getCamera(),width:document.querySelector('[data-object="arrow"] path').getAttribute('stroke-width')}));await page.locator('[data-action="zoom-in"]').click();const afterZoom=await page.evaluate(()=>({camera:IlapoEditor.getCamera(),width:document.querySelector('[data-object="arrow"] path').getAttribute('stroke-width')}));assert.equal(afterZoom.width,beforeZoom.width,'表示倍率を変えてもSVGの作品座標線幅は不変');assert(afterZoom.camera.width<beforeZoom.camera.width,'カメラ倍率だけが変わる');
await transform(600,true);state=await page.evaluate(()=>IlapoEditor.getDocument().pages[0].objects[0]);const expected=6*Math.sqrt(2);assert(Math.abs(state.style.strokeWidth-expected)<1e-9,'線幅も拡大縮小する場合は面積倍率を一度だけ反映する');await page.locator('#objects-toggle').click();await page.locator('#objects-toggle').click();state=await page.evaluate(()=>IlapoEditor.getDocument().pages[0].objects[0]);assert(Math.abs(state.style.strokeWidth-expected)<1e-9,'再描画しても線幅を二重に拡大しない');const exported=await page.evaluate(()=>IlapoSVG.exportPage(IlapoEditor.getDocument().pages[0]));assert.match(exported,new RegExp(`stroke-width="${expected}`),'SVG出力も作品座標の線幅を使う');assert.deepEqual(errors,[]);console.log('stroke-browser.test.cjs: passed');}finally{await browser.close();if(!supplied)server.close();}})().catch(error=>{console.error(error);process.exitCode=1;});
