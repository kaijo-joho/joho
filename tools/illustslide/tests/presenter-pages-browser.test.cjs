/* 発表者ノートと発表スキップは、ページごとに即時保存して履歴へ入れる。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const documentValue=()=>{
  const doc=C.createDocument();doc.id='presenter-pages';doc.name='発表者メモ';doc.pages=[];
  for(let i=0;i<8;i++){
    const page=C.createPage('ページ '+(i+1),C.boardPreset('16:9'));page.id='page-'+i;
    page.objects.push(C.makeShape('rect',20+i*10,20,30,20));
    if(i===2){page.skip=true;page.notes='スキップのノート';}
    doc.pages.push(page);
  }
  return doc;
};
const read=page=>page.evaluate(()=>IlapoEditor.getDocument());
const state=page=>page.evaluate(()=>IlapoEditor.getState());
const order=async page=>(await read(page)).pages.map(p=>p.id);
const notes=(page,id)=>page.locator(`[data-page-notes-input="${id}"]`);
const details=(page,id)=>page.locator(`[data-page-notes-for="${id}"]`);
async function undo(page){await page.locator('.top [data-action=undo]').click();await settle(page);}
async function openNotes(page,id){if(!await details(page,id).evaluate(el=>el.open)){await details(page,id).locator('summary').click();await settle(page);}}
async function load(page,doc){
  const count=await page.evaluate(()=>IlapoEditor.getDocuments().length);
  await page.locator('#file-input').setInputFiles({name:'pages.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});
  await page.waitForFunction(count=>IlapoEditor.getDocuments().length===count+1,count);await settle(page);
  if(!await page.locator('#page-rows').isVisible())await page.locator('#pages-toggle').click();await settle(page);
}
async function startDrag(page,id){
  const handle=page.locator(`[data-page-handle="${id}"]`);await handle.scrollIntoViewIfNeeded();
  const r=await handle.boundingBox(),point={x:r.x+r.width/2,y:r.y+r.height/2};
  await page.mouse.move(point.x,point.y);await page.mouse.down();return point;
}
async function dragTo(page,from,to){
  await startDrag(page,from);
  const row=page.locator(`[data-page-card="${to}"] .page-pick`),r=await row.boundingBox();
  await page.mouse.move(r.x+r.width/2,r.y+r.height/2,{steps:8});
}
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(12000);page.on('pageerror',error=>errors.push(error.message));
  try{
    await page.goto(process.env.ILLUSTSLIDE_URL||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>!!window.IlapoEditor);
    const doc=documentValue();await load(page,doc);
    assert.equal(await page.locator('[data-page-move]').count(),0,'上下ボタンを置かない');
    assert.equal(await page.locator('.page-notes[open]').count(),0,'ノートは初期状態で折りたたむ');
    assert.deepEqual(await read(page),C.validateDocument(doc),'開いただけでは文書を変えない');
    await openNotes(page,'page-0');await notes(page,'page-0').fill('最初の説明');await settle(page);
    assert.equal((await read(page)).pages[0].notes,'最初の説明');
    await page.keyboard.press('Meta+z');await settle(page);assert.equal((await read(page)).pages[0].notes||'','');
    await page.keyboard.press('Shift+Meta+z');await settle(page);assert.equal(await notes(page,'page-0').inputValue(),'最初の説明');
    await openNotes(page,'page-1');
    await notes(page,'page-1').evaluate(element=>{
      element.dispatchEvent(new CompositionEvent('compositionstart',{bubbles:true}));element.value='日本語入力';
      element.dispatchEvent(new InputEvent('input',{bubbles:true,isComposing:true,data:'日本語入力'}));
    });await settle(page);assert.equal((await read(page)).pages[1].notes,undefined,'変換中は保存しない');
    await dragTo(page,'page-1','page-0');await page.mouse.up();await settle(page);
    assert.deepEqual((await order(page)).slice(0,2),['page-0','page-1'],'日本語変換中はドラッグで入力を中断しない');
    await notes(page,'page-1').evaluate(element=>element.dispatchEvent(new CompositionEvent('compositionend',{bubbles:true,data:'日本語入力'})));await settle(page);
    assert.equal((await read(page)).pages[1].notes,'日本語入力');assert.equal((await state(page)).pageId,'page-0','別ページのノートを編集してもキャンバスを変えない');
    assert.equal(await details(page,'page-0').evaluate(el=>el.open),true,'複数のノートを同時に開ける');
    // 開閉の状態を、順序変更後もページIDに対応させる。
    await details(page,'page-0').locator('summary').click();await settle(page);
    const beforeMove=await read(page);await dragTo(page,'page-1','page-0');
    assert.deepEqual(await read(page),beforeMove,'ドラッグ中は文書を変更しない');
    assert.equal(await page.locator('.page-drop-before').count(),1);
    await page.mouse.up();await settle(page);
    assert.deepEqual((await order(page)).slice(0,3),['page-1','page-0','page-2']);
    assert.equal((await state(page)).pageId,'page-0');
    assert.equal(await details(page,'page-1').evaluate(el=>el.open),true);assert.equal(await details(page,'page-0').evaluate(el=>el.open),false);
    assert.deepEqual((await read(page)).pages.find(p=>p.id==='page-1'),beforeMove.pages[1],'ノートと図形を保持する');
    assert.deepEqual((await read(page)).pages.find(p=>p.id==='page-2'),beforeMove.pages[2],'スキップページを保持する');
    await undo(page);assert.deepEqual(await read(page),beforeMove,'一度のUndoで全順序を戻す');
    await details(page,'page-1').locator('summary').click();await settle(page);
    await dragTo(page,'page-0','page-1');await page.keyboard.press('Escape');await page.mouse.up();await settle(page);
    assert.deepEqual(await read(page),beforeMove,'Escで中止');assert(await page.locator('#page-rows').isVisible());
    await dragTo(page,'page-0','page-1');await page.mouse.move(100,150);await page.mouse.up();await settle(page);assert.deepEqual(await read(page),beforeMove,'パネル外は中止');
    const p=await startDrag(page,'page-0');await page.mouse.move(p.x,p.y+2);await page.mouse.up();await settle(page);assert.deepEqual(await read(page),beforeMove,'小さい揺れでは移動しない');
    await dragTo(page,'page-0','page-1');await page.locator('[data-page-handle="page-0"]').dispatchEvent('pointercancel',{pointerId:1});await page.mouse.up();await settle(page);assert.deepEqual(await read(page),beforeMove,'pointercancelで中止');
    await dragTo(page,'page-0','page-1');await page.locator('[data-page-id="page-1"]').evaluate(el=>el.click());await page.mouse.up();await settle(page);
    assert.deepEqual(await read(page),beforeMove,'ページを切り替えるとドラッグを中止');assert.equal((await state(page)).pageId,'page-1');
    await page.locator('[data-page-id="page-0"]').click();await settle(page);
    await page.locator('[data-page-handle="page-1"]').focus();await page.keyboard.press('Alt+ArrowUp');await settle(page);assert.equal((await order(page))[0],'page-1');await undo(page);
    // 長い一覧の下端まで自動スクロールして移動する。
    await startDrag(page,'page-0');
    const panel=await page.locator('#page-rows').evaluate(el=>{const r=el.closest('.inspector-body').getBoundingClientRect();return{x:r.x,y:r.y,width:r.width,height:r.height};});
    await page.mouse.move(panel.x+panel.width/2,panel.y+panel.height-8,{steps:8});
    await page.waitForFunction(()=>document.querySelector('[data-page-card="page-7"]').classList.contains('page-drop-after'));
    await page.mouse.up();await settle(page);assert.equal((await order(page)).at(-1),'page-0');await undo(page);assert.deepEqual(await read(page),beforeMove);
    // メニューのホバーとスキップは既存の動作を保持。
    await page.locator('[data-page-more="page-1"]').scrollIntoViewIfNeeded();await settle(page);
    await page.locator('[data-page-more="page-1"]').hover();assert(await page.locator('#page-more-menu-page-1').isVisible());assert.deepEqual(await read(page),beforeMove);
    await page.locator('[data-page-more="page-1"]').focus();await page.keyboard.press('Escape');assert.equal(await page.locator('#page-more-menu-page-1').isVisible(),false);
    await page.keyboard.press('ArrowDown');assert.equal(await page.locator('[data-page-skip="page-1"]').evaluate(el=>el===document.activeElement),true);
    await page.locator('[data-page-skip="page-1"]').click();await settle(page);assert.equal((await read(page)).pages[1].skip,true);await undo(page);assert.deepEqual(await read(page),beforeMove);
    // 書込み・開閉は同じ文書IDの別作品タブと分離。
    await openNotes(page,'page-0');const originalSession=(await state(page)).sessionId;
    await load(page,doc);const otherSession=(await state(page)).sessionId;assert.notEqual(otherSession,originalSession);
    assert.equal(await page.locator('.page-notes[open]').count(),0);await openNotes(page,'page-0');await notes(page,'page-0').fill('別タブのノート');await settle(page);
    await page.locator(`[data-document-tab="${originalSession}"]`).click();await settle(page);await page.locator('#pages-toggle').click();await settle(page);
    assert.equal(await notes(page,'page-0').inputValue(),'最初の説明');assert.equal(await details(page,'page-0').evaluate(el=>el.open),true);
    // 表示幅・テーマを変えてもノートがサムネイルの下に収まる。
    for(const width of [1280,720,390,320]){
      await page.setViewportSize({width,height:900});await page.evaluate(()=>document.documentElement.dataset.theme='dark');await settle(page);
      const layout=await page.locator('[data-page-card="page-0"]').evaluate(card=>{const thumb=card.querySelector('.page-pick').getBoundingClientRect(),notes=card.querySelector('.page-notes').getBoundingClientRect();return{under:notes.top>=thumb.bottom,overflow:document.documentElement.scrollWidth>innerWidth+1,wide:card.scrollWidth>card.clientWidth+1};});
      assert(layout.under);assert.equal(layout.overflow,false);assert.equal(layout.wide,false);
    }
    await page.screenshot({path:'/private/tmp/illustslide-pages-narrow.png'});
    await page.setViewportSize({width:1280,height:900});await settle(page);await page.screenshot({path:'/private/tmp/illustslide-pages-desktop.png'});
    // ノートと並べ替えのJSON/ZIP往復。
    assert.equal(await page.evaluate(async()=>{const source=IlapoEditor.getDocument(),zip=IlapoSVG.encodeProject(source),restored=IlapoSVG.decodeProject(zip);return JSON.stringify(source)===JSON.stringify(restored);}),true);
    const touch=await browser.newContext({viewport:{width:1280,height:900},hasTouch:true});
    try{
      const tp=await touch.newPage();tp.on('pageerror',error=>errors.push(error.message));
      await tp.goto(process.env.ILLUSTSLIDE_URL||`http://127.0.0.1:${server.address().port}/illustslide/`);await tp.waitForFunction(()=>!!window.IlapoEditor);await load(tp,doc);
      const handle=await tp.locator('[data-page-handle="page-0"]').boundingBox(),target=await tp.locator('[data-page-card="page-1"] .page-pick').boundingBox();
      const client=await touch.newCDPSession(tp),x=handle.x+handle.width/2,y=handle.y+handle.height/2,to=target.y+target.height/2;
      await client.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x,y}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:y+8}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x,y:to}]});
      await client.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]});await settle(tp);
      assert.deepEqual((await order(tp)).slice(0,2),['page-1','page-0'],'タッチでも並べ替える');
      await details(tp,'page-1').locator('summary').tap();assert.equal(await notes(tp,'page-1').isVisible(),true,'タップでノートを開く');
    }finally{await touch.close();}
    assert.deepEqual(errors,[]);console.log('presenter-pages-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
