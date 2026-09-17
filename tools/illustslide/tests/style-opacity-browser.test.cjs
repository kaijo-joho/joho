/* 塗り・線の対象、即時入力、保存と画像出力の不透明度をChromeで確認する。 */
'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const http = require('node:http');
const C = require('../core.js');
const K = require('../connectors.js');
let chromium;
try { ({chromium} = require('playwright')); }
catch { ({chromium} = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../..');
const server = http.createServer(async (request, response) => {
  const relative = decodeURIComponent(new URL(request.url, 'http://localhost').pathname).replace(/^\/+/, '');
  const file = path.resolve(root, relative.endsWith('/') ? relative + 'index.html' : relative);
  if (!file.startsWith(root + path.sep)) { response.writeHead(403).end(); return; }
  try { response.setHeader('Content-Type', ({'.html':'text/html', '.js':'text/javascript', '.css':'text/css', '.svg':'image/svg+xml'})[path.extname(file)] || 'application/octet-stream'); response.end(await fs.readFile(file)); }
  catch { response.writeHead(404).end(); }
});
let serial = 0;
function fixture() {
  const doc = C.createDocument(); doc.id = 'paint-' + (++serial); doc.name = '塗りと線 ' + serial;
  const p = doc.pages[0]; p.board = {width:640,height:400,unit:'px',infinite:false};
  const a = C.makeShape('rect',60,100,160,120,{fill:'#EF4444',stroke:'#172B4D',strokeWidth:8}); a.id='a';
  const b = C.makeShape('ellipse',360,100,150,120,{fill:'#22C55E',stroke:'#2563EB',fillOpacity:.6,strokeOpacity:.8,strokeWidth:4}); b.id='b';
  const connector = K.make({x:80,y:300},{x:240,y:300},{label:'接続',style:{fill:'none',stroke:'#000000',strokeWidth:4}}); connector.id='c';
  const t = C.makeText(350,330,'文字',{fill:'#172B4D',stroke:'none'}); t.id='t';
  p.objects=[a,b,connector,t]; return C.validateDocument(doc);
}
const settle = p => p.evaluate(() => new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))));
const read = p => p.evaluate(() => IlapoEditor.getDocument());
const object = async (p,id) => (await read(p)).pages[0].objects.find(o=>o.id===id);
async function load(page,doc=fixture()) {
  await page.locator('#file-input').setInputFiles({name:'paint.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(id=>IlapoEditor.getDocument().id===id||document.getElementById('dialog').open,doc.id);
  if(await page.locator('#replace-discard').isVisible())await page.locator('#replace-discard').click();
  await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);await settle(page);return doc;
}
async function select(page,id,add=false) {
  await page.locator('#canvas').focus();if(!add)await page.keyboard.press('Escape');await page.keyboard.press('v');
  await page.locator(`#artwork [data-object="${id}"]`).click({modifiers:add?['Shift']:[]});await settle(page);
}
async function openStyle(page) { await page.locator('#style-button').click();await settle(page); }
async function channel(page,key) { await page.locator(`[data-color-channel="${key}"]`).click();await settle(page); }
async function input(page,key,value) { await page.locator('#style-'+key).fill(String(value));await settle(page); }
function near(actual,expected,label,tolerance=2) { assert.equal(actual.length,expected.length);actual.forEach((n,i)=>assert(Math.abs(n-expected[i])<=tolerance,`${label}: ${actual} != ${expected}`)); }

(async()=>{
  await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=process.argv.find(v=>/^https?:/.test(v))||`http://127.0.0.1:${server.address().port}/illustslide/`;
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:820}}),page=await context.newPage(),errors=[];
  const artifacts=await fs.mkdtemp(path.join(os.tmpdir(),'illustslide-paint-'));
  page.on('pageerror',e=>errors.push(e.message));page.setDefaultTimeout(10000);
  try {
    await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);
    await load(page);await select(page,'a');await openStyle(page);
    const before=await read(page);
    assert(await page.locator('#style-fillOpacity').isVisible());
    assert(await page.locator('#style-strokeWidth').isHidden());
    assert.equal(await page.locator('[data-style="fontSize"]').count(),0,'図形本体に無効な文字設定を並べない');
    await channel(page,'stroke');assert(await page.locator('#style-strokeWidth').isVisible());assert(await page.locator('#style-fillOpacity').isHidden());
    assert.equal(await page.locator('[data-color-channel="stroke"]').getAttribute('aria-pressed'),'true');
    await channel(page,'fill');assert.deepEqual(await read(page),before,'切替だけで属性や履歴を追加しない');
    await input(page,'fillOpacity',20);await input(page,'fillOpacity',40);
    let a=await object(page,'a');assert.equal(a.style.fillOpacity,.4);assert.equal(a.style.opacity,1);assert.equal(a.style.strokeOpacity,undefined);
    assert.equal(await page.locator('#artwork [data-object="a"] path').first().getAttribute('fill-opacity'),'0.4');
    await page.keyboard.press('Meta+z');await settle(page);assert.equal((await object(page,'a')).style.fillOpacity,undefined,'連続入力を1回でUndo');
    await page.keyboard.press('Meta+Shift+z');await settle(page);assert.equal((await object(page,'a')).style.fillOpacity,.4);
    await channel(page,'stroke');await input(page,'strokeOpacity',70);a=await object(page,'a');assert.equal(a.style.fillOpacity,.4);assert.equal(a.style.strokeOpacity,.7);
    await page.keyboard.press('Meta+z');await settle(page);assert(await page.locator('#style-strokeOpacity').isVisible(),'Undo後も線の設定を保持');
    await page.keyboard.press('Meta+Shift+z');await settle(page);
    const valid=await read(page);await input(page,'strokeOpacity',101);assert.deepEqual(await read(page),valid,'不正値を保存しない');
    await channel(page,'fill');await channel(page,'stroke');assert.equal(await page.locator('#style-strokeOpacity').inputValue(),'70');
    await input(page,'strokeWidth',12);await page.locator('#style-dash').selectOption('6 4');await page.locator('#style-linecap').selectOption('round');await page.locator('#style-linejoin').selectOption('bevel');await settle(page);
    a=await object(page,'a');assert.deepEqual([a.style.strokeWidth,a.style.dash,a.style.linecap,a.style.linejoin],[12,'6 4','round','bevel']);
    await page.locator('#style-overall summary').click();await input(page,'opacity',50);
    a=await object(page,'a');assert.deepEqual([a.style.fillOpacity,a.style.strokeOpacity,a.style.opacity],[.4,.7,.5]);
    await channel(page,'fill');await page.locator('#color-none').click();await settle(page);assert.equal((await object(page,'a')).style.fill,'none');
    assert.equal((await object(page,'a')).style.strokeOpacity,.7);
    await page.locator('[data-color="#EF4444"]').click();await settle(page);
    await page.locator('#inspector-close').click();await select(page,'b',true);await openStyle(page);
    assert.equal(await page.locator('#style-fillOpacity').inputValue(),'');assert.equal(await page.locator('#style-fillOpacity').getAttribute('placeholder'),'混在');
    const mixedBefore=await read(page);await channel(page,'stroke');await channel(page,'fill');assert.deepEqual(await read(page),mixedBefore);
    await input(page,'fillOpacity',25);assert.equal((await object(page,'a')).style.fillOpacity,.25);assert.equal((await object(page,'b')).style.fillOpacity,.25);
    assert.equal((await object(page,'a')).style.strokeOpacity,.7);assert.equal((await object(page,'b')).style.strokeOpacity,.8);
    assert.equal((await object(page,'b')).style.strokeWidth,4,'線の設定をそろえない');

    // Copying format and saving retain both channels independently.
    await page.locator('#inspector-close').click();await select(page,'a');
    await page.locator('[data-menu="edit"]').click();await page.locator('#command-menu [data-action="style-copy"]').click();
    await select(page,'b');await page.locator('[data-menu="edit"]').click();await page.locator('#command-menu [data-action="style-paste"]').click();await settle(page);
    assert.deepEqual((await object(page,'b')).style,(await object(page,'a')).style);
    await page.locator('[data-menu="save"]').click();await page.locator('#command-menu [data-action="save-browser"]').click();
    const saved=await read(page);
    const roundtrip=await page.evaluate(()=>IlapoSVG.decodeProject(IlapoSVG.encodeProject(IlapoEditor.getDocument())));
    assert.deepEqual(roundtrip,saved,'ZIPで別々の値を復元');
    await page.waitForFunction(()=>JSON.parse(localStorage.getItem('kaijo-ilapo:auto')||'null')?.document?.version===7);
    const stored=await page.evaluate(()=>new IlapoCore.Store(localStorage).list());
    assert(stored.some(s=>s.kind==='auto'&&s.document.pages[0].objects[0].style.fillOpacity===.25));
    assert(stored.some(s=>s.kind==='saved'&&s.document.pages[0].objects[0].style.strokeOpacity===.7));

    await select(page,'c');await openStyle(page);
    assert.equal(await page.locator('[data-color-channel="fill"]').count(),0,'接続矢印に効かない塗り欄を出さない');
    await input(page,'strokeOpacity',35);
    const connectorParts=await page.evaluate(()=>IlapoConnectors.renderedParts(IlapoEditor.getDocument().pages[0].objects.find(o=>o.id==='c')));
    assert.equal(connectorParts[0].style.strokeOpacity,.35);
    for(const part of connectorParts.slice(1)){assert.equal(part.style.fillOpacity,.35);if(part.type==='path'&&part.style.stroke!=='none')assert.equal(part.style.strokeOpacity,.35);}
    await page.locator('.style-text-link button').click();await page.locator('.style-extra summary').click();await page.locator('#connection-font-size').fill('30');await page.locator('#connection-font-family').selectOption('serif');await page.locator('#connection-bold').check();await settle(page);
    assert.equal((await object(page,'c')).style.fontSize,30);assert.equal((await object(page,'c')).style.bold,true);
    assert.equal((await object(page,'c')).style.strokeOpacity,.35,'ラベル編集で線の不透明度を失わない');
    await page.locator('#inspector-close').click();await select(page,'t');await openStyle(page);
    assert.equal(await page.locator('[data-color-channel="fill"]').textContent(),'文字の塗り');await input(page,'fillOpacity',60);
    await page.locator('.style-text-link button').click();assert(await page.locator('#text-input').isVisible());await page.locator('#text-font-size').fill('26');await settle(page);
    assert.equal((await object(page,'t')).style.fillOpacity,.6,'文章編集で不透明度を保つ');

    // Pixel checks prove fill/stroke composition, PNG and print use the same model.
    const output=await page.evaluate(async()=>{
      const p=IlapoCore.createPage('不透明度',{width:180,height:160,unit:'px',infinite:false});
      const shape=IlapoCore.makeShape('rect',30,30,100,100,{fill:'#FF0000',stroke:'#0000FF',strokeWidth:20,fillOpacity:.4,strokeOpacity:.75});p.objects=[shape];
      async function pixels(blob){const image=await createImageBitmap(blob),canvas=document.createElement('canvas');canvas.width=image.width;canvas.height=image.height;const ctx=canvas.getContext('2d');ctx.drawImage(image,0,0);return [[80,80],[22,80],[35,80]].map(([x,y])=>Array.from(ctx.getImageData(x,y,1,1).data));}
      const png=await IlapoExport.png(p,{background:'transparent',scale:1});
      const independent=await pixels(png);shape.style.opacity=.5;
      const dimmed=await pixels(await IlapoExport.png(p,{background:'transparent',scale:1}));
      return {independent,dimmed,print:IlapoExport.buildPrintHTML([p]),svg:IlapoSVG.exportPage(p),png:Array.from(new Uint8Array(await png.arrayBuffer()))};
    });
    near(output.independent[0],[255,0,0,102],'塗りのみ');near(output.independent[1],[0,0,255,191],'線のみ');near(output.independent[2],[30,0,225,217],'塗りと線が重なる部分');
    near(output.dimmed[0],[255,0,0,51],'全体50%の塗り');near(output.dimmed[1],[0,0,255,96],'全体50%の線');near(output.dimmed[2],[30,0,225,108],'合成後の全体50%');
    await fs.writeFile(path.join(artifacts,'opacity.png'),Buffer.from(output.png));await fs.writeFile(path.join(artifacts,'opacity.svg'),output.svg);
    const printPage=await context.newPage();await printPage.setContent(output.print);await printPage.emulateMedia({media:'print'});
    const printStyle=await printPage.locator('svg path').first().evaluate(el=>[getComputedStyle(el).fillOpacity,getComputedStyle(el).strokeOpacity,getComputedStyle(el).opacity]);
    assert.deepEqual(printStyle,['0.4','0.75','0.5']);
    await printPage.pdf({path:path.join(artifacts,'opacity.pdf'),preferCSSPageSize:true,printBackground:true});await printPage.close();

    // Mixed selections change only meaningful properties, including image-only groups.
    const mixedDoc=fixture(),mixedPage=mixedDoc.pages[0];
    const imageSource='data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVQIHWP4z8DwHwAFgAI/ScLbtAAAAABJRU5ErkJggg==';
    const imageModel=(id,x)=>({id,type:'image',name:id,group:null,locked:false,matrix:[1,0,0,1,0,0],style:{...C.DEFAULT_STYLE},x,y:90,width:90,height:90,reference:false,src:imageSource});
    mixedPage.objects=[mixedPage.objects[0],mixedPage.objects[3],imageModel('i1',340),imageModel('i2',480)];
    await load(page,mixedDoc);await select(page,'a');await select(page,'i1',true);await openStyle(page);
    await input(page,'fillOpacity',30);await channel(page,'stroke');await input(page,'strokeOpacity',45);
    assert.equal((await object(page,'i1')).style.fillOpacity,undefined);assert.equal((await object(page,'i1')).style.strokeOpacity,undefined);
    await page.locator('#style-overall summary').click();await input(page,'opacity',60);assert.equal((await object(page,'i1')).style.opacity,.6);
    await page.locator('#inspector-close').click();await select(page,'i1');await select(page,'i2',true);await openStyle(page);
    assert.equal(await page.locator('[data-color-channel]').count(),0);await input(page,'opacity',40);
    assert.equal((await object(page,'i1')).style.opacity,.4);assert.equal((await object(page,'i2')).style.opacity,.4);
    await page.locator('#inspector-close').click();await select(page,'a');await page.locator('[data-menu="edit"]').click();await page.locator('[data-action="style-copy"]').click();
    await select(page,'i2');await page.locator('[data-menu="edit"]').click();await page.locator('[data-action="style-paste"]').click();await settle(page);
    assert.equal((await object(page,'i2')).style.opacity,.6);assert.equal((await object(page,'i2')).style.fillOpacity,undefined);
    await select(page,'a');await select(page,'t',true);await openStyle(page);await page.locator('.style-extra summary').filter({hasText:'文字の基本書式'}).click();
    await input(page,'fontSize',32);assert.equal((await object(page,'t')).style.fontSize,32);assert.equal((await object(page,'a')).style.fontSize,24);

    const playback=await page.evaluate(()=>{
      const p=IlapoCore.createPage(),o=IlapoCore.makeShape('rect',30,30,100,100,{fillOpacity:.4,strokeOpacity:.7,opacity:.5});
      p.objects=[o];p.animations=[{id:'fade',targets:[o.id],effect:'fade',mode:'in',trigger:'click',duration:1000,delay:0}];
      const holder=document.createElement('div');document.body.append(holder);const player=IlapoAnimationPlayer.create(holder,p);player.seek(1,500);
      const path=player.svg.querySelector('[data-ilapo-id]');const result={fill:path.getAttribute('fill-opacity'),stroke:path.getAttribute('stroke-opacity'),overall:path.getAttribute('opacity'),fade:path.parentElement.getAttribute('opacity')};player.destroy();holder.remove();return result;
    });
    assert.deepEqual(playback,{fill:'0.4',stroke:'0.7',overall:'0.5',fade:'0.5'},'フェードの倍率と各書式の不透明度を保持');

    // Theme, panel width and keyboard switching on a narrow viewport.
    await load(page);await select(page,'a');await openStyle(page);
    for(const width of [1280,736,390]){
      await page.setViewportSize({width,height:820});await page.locator('#view-toggle').click();await page.locator('#view-theme').selectOption('dark');await settle(page);await openStyle(page);await channel(page,'stroke');
      await page.locator('#style-strokeOpacity').scrollIntoViewIfNeeded();assert(await page.locator('#style-strokeOpacity').isVisible());
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'書式パネルを開いても横にはみ出さない');
      await page.screenshot({path:path.join(artifacts,'stroke-'+width+'.png')});
    }
    await page.locator('[data-color-channel="fill"]').focus();await page.keyboard.press('Enter');await settle(page);assert(await page.locator('#style-fillOpacity').isVisible());
    const touchContext=await browser.newContext({viewport:{width:390,height:820},hasTouch:true,isMobile:true});
    try {
      const touch=await touchContext.newPage();touch.on('pageerror',e=>errors.push(e.message));await touch.goto(url);await touch.waitForFunction(()=>!!window.IlapoEditor);await load(touch);
      await touch.locator('#artwork [data-object="a"]').tap();await touch.locator('#style-button').tap();await touch.locator('[data-color-channel="stroke"]').tap();
      await input(touch,'strokeOpacity',55);assert.equal((await object(touch,'a')).style.strokeOpacity,.55);
      await touch.locator('[data-color-channel="fill"]').tap();await input(touch,'fillOpacity',15);
      assert.equal((await object(touch,'a')).style.fillOpacity,.15);assert.equal((await object(touch,'a')).style.strokeOpacity,.55);
    }finally{await touchContext.close();}
    assert.deepEqual(errors,[]);console.log('Style opacity browser tests passed. Artifacts: '+artifacts);
  }finally{await context.close();await browser.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
