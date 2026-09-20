/* Effect picker, draft playback and slider Undo in the actual editor. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),http=require('node:http'),path=require('node:path'),os=require('node:os'),C=require('../core.js');
const {setAppearance}=require('./ui-helpers.cjs');
let chromium;
try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{
  const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);
  if(!file.startsWith(root+path.sep))return res.writeHead(403).end();
  try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}
});
const settle=p=>p.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
function fixture(){
  const d=C.createDocument();d.id='animation-editor-ui';const p=d.pages[0];p.board={width:640,height:400,unit:'px',infinite:false};
  const a=C.makeShape('rect',80,90,140,100,{fill:'#2563EB'});a.id='box';a.name='青い長方形';p.objects=[a];return C.validateDocument(d);
}
(async()=>{
  const supplied=process.argv.find(v=>/^https?:/.test(v));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const browser=await chromium.launch({channel:'chrome',headless:true}),context=await browser.newContext({viewport:{width:1280,height:850}}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(()=>IlapoEditor.getDocument()),animation=async()=>(await read()).pages[0].animations?.[0];
  const undo=async(redo=false)=>{await page.keyboard.press(redo?'Meta+Shift+z':'Meta+z');await settle(page);};
  async function slide(id,value){
    const range=page.locator('#'+id+'-range');await range.scrollIntoViewIfNeeded();const r=await range.boundingBox(),current=Number(await range.inputValue());
    const x=v=>r.x+8+(r.width-16)*v/10,y=r.y+r.height/2;
    await page.mouse.move(x(current),y);await page.mouse.down();
    await page.mouse.move(x(value),y,{steps:10});await page.mouse.up();await settle(page);
  }
  try{
    await page.goto(supplied||`http://127.0.0.1:${server.address().port}/illustslide/`);await page.waitForFunction(()=>window.IlapoEditor);
    const doc=fixture();await page.locator('#file-input').setInputFiles({name:'animation-editor.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);
    await page.locator('#canvas').focus();await page.keyboard.press('v');await page.locator('#artwork [data-object="box"]').click();await page.locator('#animation-toggle').click();await page.locator('#animation-add').click();
    const toggle=page.locator('#animation-effect-toggle'),menu=page.locator('#animation-effect-menu');
    assert.equal(await page.locator('#animation-effect-caption').count(),1);assert.equal(await toggle.getAttribute('aria-label'),'効果：フェードイン');
    assert.equal(await menu.isVisible(),false,'初期状態は現在の効果のみ');
    const focused=await page.evaluate(()=>document.activeElement.id);await toggle.hover();await settle(page);
    assert.equal(await page.evaluate(()=>document.activeElement.id),focused,'ホバーではフォーカスを奪わない');
    assert.equal(await menu.locator('button').count(),12);
    assert.deepEqual(await menu.locator('.animation-effect-group-label').allTextContents(),['表示','消去','その他']);
    await toggle.click();assert(await menu.isVisible(),'ホバー後クリックしても選択肢を閉じない');
    await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert(await page.locator('#animation-add').count()===0,'Escapeで追加画面を閉じない');
    await toggle.press('ArrowDown');await page.locator('[data-animation-choice="move"]').click();
    assert.equal(await toggle.getAttribute('aria-label'),'効果：移動');assert.equal(await toggle.getAttribute('data-tip'),'効果：移動');assert.equal(await page.locator('#animation-effect-caption').textContent(),'移動');
    const duration=page.locator('#animation-duration'),delay=page.locator('#animation-delay');
    await duration.fill('0.75');assert.equal(await page.locator('#animation-duration-range').inputValue(),'0.8');assert.equal(await duration.inputValue(),'0.75','数値の精度はrangeの丸めで失わない');
    await delay.fill('0.35');await page.locator('#animation-dx').fill('40');
    const original=await read();await page.locator('#animation-try').click();await settle(page);
    assert.equal(await page.evaluate(()=>IlapoEditor.getState().playback.steps),1,'未追加の動きも試し再生する');
    assert.equal(await page.locator('#inline-playback-controls').isVisible(),true);assert.deepEqual(await read(),original);
    await page.locator('#inline-playback-stop').click();assert.equal(await page.evaluate(()=>document.activeElement.id),'animation-try');
    await duration.fill('-1');await page.locator('#animation-try').click();assert.equal(await page.evaluate(()=>IlapoEditor.getState().playback.active),false);assert.deepEqual(await read(),original,'不正な入力を再生・保存しない');
    await duration.fill('0.75');await page.locator('#inspector-submit').click();await settle(page);assert.equal((await animation()).duration,750);assert.equal((await animation()).delay,350);
    await page.locator('[data-animation-more="0"]').click();await settle(page);
    assert.equal(await page.locator('#animation-preview').count(),1);assert.equal(await page.locator('.animation-row #animation-try').count(),0,'行内には重複した再生を置かない');
    for(const id of ['animation-duration','animation-delay']){
      const before=await animation();await slide(id,2.8);const changed=await animation();
      assert(changed[id==='animation-duration'?'duration':'delay']>1000,'実ポインタで連続変更');assert.equal(await page.locator('#inspector-submit').isVisible(),false,'既存設定は適用不要');
      await undo();assert.deepEqual(await animation(),before,'一連のスライダー操作を1回で戻す');await undo(true);assert.deepEqual(await animation(),changed);
      await slide(id,4.2);const second=await animation();assert.notDeepEqual(second,changed);await undo();assert.deepEqual(await animation(),changed,'同じスライダーの次の操作は別の履歴');await undo();assert.deepEqual(await animation(),before);
    }
    // Keyboard opening/Escape and viewport edges in the desktop and bottom panels.
    for(const width of [1280,390,320]){
      await page.setViewportSize({width,height:850});await setAppearance(page,{theme:width===1280?'light':'dark'});await settle(page);
      if(width===1280){await page.locator('#inspector-resize').focus();await page.keyboard.press('Home');await settle(page);}
      await toggle.scrollIntoViewIfNeeded();await toggle.press('ArrowDown');await settle(page);
      assert(await menu.isVisible());assert.equal(await menu.locator('button:focus').count(),1);
      await page.mouse.move(5,100);await page.waitForTimeout(240);assert(await menu.isVisible(),'キー操作中はマウスが外れても閉じない');
      assert(await menu.evaluate(el=>{const r=el.getBoundingClientRect();return r.x>=0&&r.right<=innerWidth+1&&r.y>=0&&r.bottom<=innerHeight+1;}),'効果メニューは画面内');
      assert(await menu.locator('button').evaluateAll(nodes=>nodes.every(el=>{const r=el.getBoundingClientRect();return el.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));})),'全12アイコンへ到達できる');
      await page.screenshot({path:'/private/tmp/illustslide-animation-picker-'+width+'.png'});
      await page.keyboard.press('Escape');assert.equal(await menu.isVisible(),false);assert.equal(await page.locator('.animation-row-editor').count(),1,'Escは子メニューだけ閉じる');
      await toggle.press('ArrowDown');await page.locator('#animation-duration').click();assert.equal(await menu.isVisible(),false,'外側クリックで閉じる');
      assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
    }
    await page.locator('[data-animation-close-edit="0"]').click();assert.equal(await page.locator('.animation-row-editor').count(),0);
    await page.locator('[data-animation-more="0"]').click();assert.equal(await page.locator('[data-animation-delete="0"]').innerText(),'');
    const beforeDelete=await read();await page.locator('[data-animation-delete="0"]').click();assert.equal((await read()).pages[0].animations.length,0);await undo();assert.deepEqual(await read(),beforeDelete,'削除を元に戻す');
    assert.deepEqual(errors,[]);console.log('animation-editor-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
})().catch(e=>{console.error(e);process.exitCode=1;server.close();});
