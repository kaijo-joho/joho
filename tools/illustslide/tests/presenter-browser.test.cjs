/* 実際の二つのChromeウィンドウで、同期・手元表示・スキップ・配布内容を確認する。 */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
const C=require('../core.js');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const relative=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,relative.endsWith('/')?relative+'index.html':relative);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'application/octet-stream');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
function fixture() {
  const doc=C.createDocument();doc.id='presenter-fixture';doc.name='発表の検証';doc.pages=[];
  for(let i=0;i<4;i++) {
    const page=C.createPage(['準備','説明','補足','結び'][i],C.boardPreset(i===3?'a4':'16:9'));page.id='page-'+i;page.notes='手元だけのメモ NOTE_SECRET_'+i;page.skip=i%2===0;
    const o=C.makeShape('rect',100,120,180,120,{fill:'#2563EB',stroke:'none'});o.id='object-'+i;o.name=i%2===0?'SKIP_SECRET_'+i:'図形'+i;page.objects=[o];doc.pages.push(page);
  }
  const page=doc.pages[1],hidden=C.makeShape('ellipse',400,100,100,100,{fill:'#EF4444',stroke:'none'});hidden.id='hidden';hidden.name='HIDDEN_SECRET';hidden.visible=false;page.objects.push(hidden);
  page.animations=[{id:'hidden-effect',targets:['hidden'],effect:'fade',mode:'in',trigger:'click',duration:0,delay:0},{id:'fade',targets:['object-1'],effect:'fade',mode:'in',trigger:'click',duration:1200,delay:0},{id:'move',targets:['object-1'],effect:'move',dx:40,dy:0,trigger:'with',duration:800,delay:0},{id:'color',targets:['object-1'],effect:'color',channel:'fill',color:'#FF0000',trigger:'after',duration:200,delay:0},{id:'out',targets:['object-1'],effect:'wipe',mode:'out',direction:'left',trigger:'click',duration:600,delay:0}];
  return C.validateDocument(doc);
}
const settle=page=>page.evaluate(()=>new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))));
const upload=async(page,doc)=>{await page.locator('#file-input').setInputFiles({name:'presenter.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(doc))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,doc.id);await settle(page);};
const action=async(page,name)=>{await page.locator('#present-button').click();await page.locator(`#command-menu [data-action="${name}"]`).click();};
const waitAudience=page=>page.waitForFunction(()=>window.IlapoAudience?.getState().connected&&IlapoAudience.getState().pageId);
(async()=>{
  await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  const browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},reducedMotion:'reduce'});
  const errors=[];
  await context.addInitScript(()=>{window.presentationMessages=[];window.addEventListener('message',event=>{if(event.data?.channel==='illustslide-presentation-1')window.presentationMessages.push(event.data);});});
  context.on('page',page=>page.on('pageerror',error=>errors.push(error.message)));
  const page=await context.newPage();
  const base=process.env.ILLUSTSLIDE_URL||`http://127.0.0.1:${server.address().port}/illustslide/`;
  try {
    await page.goto(base);await page.waitForFunction(()=>!!window.IlapoEditor);const doc=fixture();await upload(page,doc);
    const before=await page.evaluate(()=>IlapoEditor.getDocument());
    const popup=context.waitForEvent('page');await action(page,'presenter-start');let audience=await popup;await waitAudience(audience);
    assert.equal(await page.evaluate(()=>IlapoPresenter.getState().pageId),'page-1');
    assert.equal(await page.evaluate(()=>IlapoPresenter.getState().total),2);
    assert.equal(await page.evaluate(()=>IlapoPresenter.getState().animation.steps),2);
    assert.match(await page.locator('[data-notes]').textContent(),/NOTE_SECRET_1/);
    const sent=await audience.evaluate(()=>presentationMessages.find(m=>m.kind==='init').document);
    assert.deepEqual(sent.pages.map(p=>p.id),['page-1','page-3']);
    assert(!/NOTE_SECRET|SKIP_SECRET|HIDDEN_SECRET/.test(JSON.stringify(sent)));
    assert.equal(await audience.locator('[data-animation-object="hidden"]').count(),0);
    assert.equal(await page.locator('[data-preview-paper="current"] [data-animation-object="hidden"]').count(),1);
    assert.equal(await audience.locator('[data-animation-object="object-1"]').getAttribute('opacity'),'0');
    await page.locator('[data-hidden-mode="show"]').click();
    assert.equal(await page.locator('[data-preview-paper="current"] [data-animation-object="object-1"]').getAttribute('opacity'),'1');
    assert.equal(await audience.locator('[data-animation-object="object-1"]').getAttribute('opacity'),'0');
    await page.locator('[data-hidden-mode="hide"]').click();assert.equal(await page.locator('[data-preview-paper="current"] [data-animation-object="hidden"]').isVisible(),false);
    await page.locator('[data-hidden-mode="ghost"]').click();
    await page.locator('[data-presenter-action="next"]').click();await audience.waitForFunction(()=>IlapoAudience.getState().animation.step===1);
    assert.equal(await page.evaluate(()=>IlapoPresenter.getState().animation.step),1);
    await audience.keyboard.press('ArrowRight');await page.waitForFunction(()=>IlapoPresenter.getState().animation.step===2);
    await page.locator('.presenter-browse summary').click();await page.locator('[data-browse-page]').selectOption('page-2');
    assert(await page.locator('[data-presenter-action="jump"]').isDisabled());assert.match(await page.locator('[data-browse-notes]').textContent(),/NOTE_SECRET_2/);
    assert.equal(await audience.evaluate(()=>IlapoAudience.getState().pageId),'page-1');
    await page.locator('[data-presenter-action="next"]').click();await audience.waitForFunction(()=>IlapoAudience.getState().pageId==='page-3');
    assert.match(await page.locator('[data-preview-paper="next"]').textContent(),/最後/);
    await page.locator('[data-presenter-action="previous"]').click();await audience.waitForFunction(()=>IlapoAudience.getState().pageId==='page-1'&&IlapoAudience.getState().animation.step===2);
    await audience.keyboard.press('Home');await page.waitForFunction(()=>IlapoPresenter.getState().animation.step===0);
    // 宛先・起点の違うメッセージは発表を動かさない。
    await audience.evaluate(()=>window.dispatchEvent(new MessageEvent('message',{source:opener,origin:location.origin,data:{channel:'illustslide-presentation-1',token:'wrong',kind:'state',sequence:999,sentAt:Date.now(),state:{pageId:'page-3',step:0,time:0,playing:false}}})));
    assert.equal(await audience.evaluate(()=>IlapoAudience.getState().pageId),'page-1');
    await audience.locator('#audience-fullscreen').click();await audience.waitForFunction(()=>document.fullscreenElement?.id==='audience-viewport');
    const fullscreen=await audience.evaluate(()=>({target:document.fullscreenElement.id,notes:!!document.querySelector('[data-notes]'),controls:document.fullscreenElement.querySelectorAll('button,input,select,textarea').length,ratio:document.getElementById('audience-paper').clientWidth/document.getElementById('audience-paper').clientHeight}));
    assert.equal(fullscreen.controls,0);assert.equal(fullscreen.notes,false);assert(Math.abs(fullscreen.ratio-16/9)<.02);
    await audience.evaluate(()=>document.exitFullscreen());
    await audience.reload();await waitAudience(audience);assert.equal(await audience.evaluate(()=>IlapoAudience.getState().animation.step),0);
    await audience.close();await page.waitForFunction(()=>!IlapoPresenter.getState().connected);
    const reopened=context.waitForEvent('page');await page.locator('[data-presenter-action="screen"]').click();audience=await reopened;await waitAudience(audience);
    assert.equal(await audience.evaluate(()=>IlapoAudience.getState().pageId),'page-1');
    // 通常の速度で開始・途中の同期・完了・resetを確認する。
    await page.emulateMedia({reducedMotion:'no-preference'});await audience.emulateMedia({reducedMotion:'no-preference'});
    await page.locator('[data-presenter-action="next"]').click();
    await audience.waitForFunction(()=>IlapoAudience.getState().animation.playing&&IlapoAudience.getState().animation.time>120);
    const handTime=await page.evaluate(()=>IlapoPresenter.getState().animation.time),screenTime=await audience.evaluate(()=>IlapoAudience.getState().animation.time);
    assert(Math.abs(handTime-screenTime)<250,'two windows share elapsed time');
    await page.locator('[data-hidden-mode="show"]').click();assert(await page.evaluate(()=>IlapoPresenter.getState().animation.playing),'display preference does not stop playback');
    await audience.keyboard.press('ArrowRight');await page.waitForFunction(()=>!IlapoPresenter.getState().animation.playing);
    assert.equal(await page.evaluate(()=>IlapoPresenter.getState().animation.step),1,'next during playback finishes the current group');
    await page.locator('[data-presenter-action="reset"]').click();await audience.waitForFunction(()=>IlapoAudience.getState().animation.step===0);
    await page.locator('[data-hidden-mode="ghost"]').click();
    await page.locator('.presenter-layout').evaluate(el=>el.scrollTop=0);await page.screenshot({path:'/private/tmp/illustslide-presenter-desktop.png'});
    for(const width of [720,390,320]) {
      await page.setViewportSize({width,height:800});await settle(page);
      assert(await page.evaluate(()=>document.querySelector('.presenter-layout').scrollWidth<=document.querySelector('.presenter-layout').clientWidth+1),'presenter layout fits '+width);
      assert(await page.evaluate(()=>{const order=document.querySelector('.presenter-order').getBoundingClientRect(),browse=document.querySelector('.presenter-browse').getBoundingClientRect();return order.bottom<=browse.top;}),'order panel does not overlap the browse panel');
    }
    await page.evaluate(()=>document.documentElement.dataset.theme='dark');
    assert.notEqual(await page.locator('#illustslide-presenter').evaluate(el=>getComputedStyle(el).color),'rgb(31, 41, 51)');
    await page.screenshot({path:'/private/tmp/illustslide-presenter-narrow.png'});
    await page.keyboard.press('Escape');await page.waitForFunction(()=>!IlapoPresenter.getState().open);
    assert(audience.isClosed());assert.deepEqual(await page.evaluate(()=>IlapoEditor.getDocument()),before);
    await page.setViewportSize({width:1280,height:900});
    // 配布HTMLからノートとスキップページを物理的に除去し、オフラインで再生。
    const html=await page.evaluate(()=>IlapoPlaybackExport.buildHTML(IlapoEditor.getDocument()));
    assert(!/NOTE_SECRET|SKIP_SECRET|HIDDEN_SECRET/.test(html));
    const offline=await browser.newContext({offline:true,reducedMotion:'reduce'}),playback=await offline.newPage();
    await playback.setContent(html);await playback.waitForSelector('.ilapo-present-dialog');assert.match(await playback.locator('.ilapo-present-status').textContent(),/1 \/ 2/);
    await playback.keyboard.press('End');assert.match(await playback.locator('.ilapo-present-status').textContent(),/2 \/ 2/);await offline.close();
    const skipped=C.clone(doc);skipped.id='all-skipped';skipped.pages.forEach(p=>p.skip=true);await upload(page,skipped);
    await action(page,'presenter-start');assert.equal(await page.locator('#illustslide-presenter').count(),0);assert.match(await page.locator('#toast').textContent(),/すべてのページ/);
    // ポップアップ拒否でも編集データを保ち、再試行の入口を残す。
    await upload(page,doc);await page.evaluate(()=>{window.originalOpen=window.open;window.open=()=>null;});await action(page,'presenter-start');
    assert.match(await page.locator('[data-connection-status]').textContent(),/ポップアップ/);await page.evaluate(()=>window.open=window.originalOpen);await page.keyboard.press('Escape');
    // 接続完了前にウィンドウを閉じても「接続中」の表示を残さない。
    await context.route('**/audience.js*',route=>route.abort());
    const loadingPopup=context.waitForEvent('page');await action(page,'presenter-start');const loading=await loadingPopup;await loading.close();
    await page.waitForFunction(()=>document.querySelector('[data-connection-status]')?.textContent.includes('閉じられました'));
    await page.keyboard.press('Escape');await context.unroute('**/audience.js*');
    assert.deepEqual(errors,[]);
    console.log('presenter-browser.test.cjs: passed');
  } finally {await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1;});
