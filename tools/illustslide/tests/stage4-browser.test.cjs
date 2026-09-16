/* Actual editing, reversible playback, and an offline copy of the same runtime. */
'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),http=require('node:http');
let chromium;try{({chromium}=require('playwright'));}catch{({chromium}=require(path.join(os.homedir(),'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright')));}
const root=path.resolve(__dirname,'../..');
const server=http.createServer(async(req,res)=>{const rel=decodeURIComponent(new URL(req.url,'http://localhost').pathname).replace(/^\/+/,''),file=path.resolve(root,rel.endsWith('/')?rel+'index.html':rel);if(!file.startsWith(root+path.sep)){res.writeHead(403).end();return;}try{res.setHeader('Content-Type',({'.html':'text/html','.js':'text/javascript','.css':'text/css','.svg':'image/svg+xml'})[path.extname(file)]||'text/plain');res.end(await fs.readFile(file));}catch{res.writeHead(404).end();}});
const near=(a,b)=>assert(Math.abs(a-b)<.06,`${a} ~= ${b}`);
async function run(){
  const supplied=process.argv.find(s=>/^https?:/.test(s));if(!supplied)await new Promise(r=>server.listen(0,'127.0.0.1',r));
  const url=supplied||`http://127.0.0.1:${server.address().port}/illustslide/`,browser=await chromium.launch({channel:'chrome',headless:true});
  const context=await browser.newContext({viewport:{width:1280,height:900},acceptDownloads:true}),page=await context.newPage(),errors=[];
  page.setDefaultTimeout(10000);page.on('pageerror',e=>errors.push(e.message));
  const read=()=>page.evaluate(()=>IlapoEditor.getDocument());
  const pick=async id=>{await page.locator('[data-menu=more]').click();await page.locator('#command-menu [data-action=objects]').click();await page.locator(`[data-pick-object="${id}"]`).click();};
  const openList=async()=>{await page.locator('[data-menu=more]').click();await page.locator('#command-menu [data-action=animations]').click();};
  const close=()=>page.locator('#dialog-cancel').click();
  async function add(effect,fields={}){
    await page.locator('#selection-bar [data-action=animations]').click();await page.locator('#animation-add').click();await page.locator('#animation-effect').selectOption(effect);
    for(const [key,value]of Object.entries(fields)){const el=page.locator('#animation-'+key);if(await el.evaluate(e=>e.tagName==='SELECT'))await el.selectOption(String(value));else await el.fill(String(value));}
    await page.locator('#dialog-submit').click();await page.waitForFunction(()=>document.getElementById('dialog-title').textContent==='動きと再生順序');await close();
  }
  try{
    await page.goto(url);await page.waitForFunction(()=>!!window.IlapoEditor);
    const fixture=await page.evaluate(()=>{
      const C=IlapoCore,K=IlapoConnectors,A=IlapoAssets,d=C.createDocument(),p=d.pages[0];d.name='要求を送って、応答を受け取る';p.name='クライアントとサーバー';p.board=C.boardPreset('16:9');
      const pc=A.instantiateIcon('pc',{x:160,y:260,size:180})[0],server=A.instantiateIcon('server',{x:910,y:260,size:180})[0];pc.id='pc';server.id='server';pc.name='クライアント';server.name='サーバー';
      const title=C.makeText(90,100,d.name,{fontSize:40,fill:'#172B4D',stroke:'none',bold:true});
      const arrow=K.make({objectId:'pc',x:0,y:0,port:'right'},{objectId:'server',x:0,y:0,port:'left'},{route:'orthogonal',label:'リクエスト',style:{stroke:'#2563EB',strokeWidth:3,fontSize:28}});arrow.id='arrow';
      p.objects=[title,pc,server,arrow];K.sync(p);const second=C.createPage('まとめ',p.board);second.objects=[C.makeText(100,150,'要求と応答を図で説明しよう。',{fontSize:40,fill:'#172B4D',stroke:'none'})];d.pages.push(second);return C.validateDocument(d);
    });
    await page.locator('#file-input').setInputFiles({name:'animation.json',mimeType:'application/json',buffer:Buffer.from(JSON.stringify(fixture))});await page.waitForFunction(id=>IlapoEditor.getDocument().id===id,fixture.id);
    await pick('pc');await page.locator('#selection-bar [data-action=animations]').click();await page.locator('#animation-add').click();
    await page.locator('#animation-duration').fill('-1');await page.locator('#dialog-submit').click();assert.deepEqual(await read(),fixture,'invalid input does not apply');await page.locator('#animation-duration').fill('.6');
    // Preview the draft, then cancel it without writing a history or a save.
    await page.locator('#animation-try').click();await page.waitForSelector('#ilapo-presentation[open]');assert.equal(await page.locator('[data-animation-object=pc]').getAttribute('opacity'),'0');
    await page.keyboard.press('Space');await page.waitForFunction(()=>document.querySelector('[data-animation-object=pc]').getAttribute('opacity')==='1');await page.keyboard.press('Escape');assert.deepEqual(await read(),fixture);assert.equal(await page.evaluate(()=>document.activeElement.id),'animation-try');
    await close();assert.deepEqual(await read(),fixture);
    await add('fade',{duration:.6});
    await add('color',{trigger:'after',duration:.4});
    await openList();await page.locator('[data-animation-edit="1"]').click();await page.locator('[data-animation-color="#EF4444"]').click();
    assert.equal(await page.locator('#animation-color-R').inputValue(),'239');await page.locator('#animation-color-B').fill('100');assert.equal(await page.locator('#animation-color-hex').inputValue(),'#EF4464');await page.locator('#dialog-submit').click();await close();
    await add('move',{trigger:'with',duration:.4,dx:160,dy:80});
    await pick('arrow');await add('wipe',{duration:.5,direction:'right'});
    let animated=await read();assert.equal(animated.version,3);assert.equal(animated.pages[0].animations.length,4);
    assert.equal(animated.pages[0].animations[1].color,'#EF4464');
    // Reorder then restore; delete then Undo restores precisely the effect, not artwork.
    await openList();await page.screenshot({path:'/private/tmp/illustslide-stage4-order.png'});await page.locator('[data-animation-move="3,-1"]').click();assert.equal((await read()).pages[0].animations[2].effect,'wipe');await page.locator('[data-animation-move="2,1"]').click();
    await page.locator('[data-animation-delete="3"]').click();await close();await page.locator('#canvas').focus();await page.keyboard.press('Meta+z');await page.waitForFunction(()=>IlapoEditor.getDocument().pages[0].animations.length===4);animated=await read();
    await page.evaluate(()=>window.viewer=IlapoPresentation.open(IlapoEditor.getDocument(),{opener:document.getElementById('present-button')}));
    assert.equal(await page.locator('[data-animation-object=pc]').getAttribute('opacity'),'0');assert.equal(await page.locator('[data-animation-object=arrow]').getAttribute('opacity'),'0');
    await page.evaluate(()=>viewer.seek(1,300));near(Number(await page.locator('[data-animation-object=pc]').getAttribute('opacity')),.5);
    await page.evaluate(()=>viewer.seek(1,800));
    const moved=await page.evaluate(()=>{
      const wrapper=document.querySelector('[data-animation-object=pc]'),shape=wrapper.querySelector('path'),line=document.querySelector('[data-animation-object=arrow] path');
      return {matrix:shape.transform.baseVal.consolidate().matrix.toString(),fill:shape.getAttribute('fill'),x:shape.transform.baseVal.consolidate().matrix.e,y:shape.transform.baseVal.consolidate().matrix.f,line:line.getAttribute('d')};
    });
    const pc=animated.pages[0].objects.find(o=>o.id==='pc');near(moved.x,pc.matrix[4]+80);near(moved.y,pc.matrix[5]+40);assert(moved.fill!=='#FFFFFF'&&moved.fill!=='#EF4464');
    const expected=await page.evaluate(()=>{const p=IlapoAnimation.frame(IlapoEditor.getDocument().pages[0],1,800).page;IlapoConnectors.sync(p);return IlapoConnectors.renderedParts(p.objects.find(o=>o.id==='arrow'))[0].d;});assert.equal(moved.line,expected,'the attached arrow follows the moving shape');
    await page.evaluate(()=>viewer.seek(2,250));
    const wipe=await page.evaluate(()=>{const g=document.querySelector('[data-animation-object=arrow]'),clip=document.querySelector(g.getAttribute('clip-path').slice(4,-1)+' rect'),b=IlapoGeometry.visualBounds(IlapoAnimation.frame(IlapoEditor.getDocument().pages[0],2,250).page.objects.find(o=>o.id==='arrow'));return{opacity:g.getAttribute('opacity'),width:Number(clip.getAttribute('width')),b};});
    assert.equal(wipe.opacity,'1');assert(wipe.width>0);await page.screenshot({path:'/private/tmp/illustslide-stage4-wipe.png'});
    await page.evaluate(()=>viewer.previous());let state=await page.evaluate(()=>viewer.getState());assert.equal(state.animation.step,1);assert.equal(state.animation.playing,false);
    await page.evaluate(()=>viewer.reset());assert.equal(await page.locator('[data-animation-object=pc]').getAttribute('opacity'),'0');
    await page.keyboard.press('Space');state=await page.evaluate(()=>viewer.getState());assert.equal(state.animation.step,1);assert.equal(state.animation.playing,true);
    await page.keyboard.press('Space');state=await page.evaluate(()=>viewer.getState());assert.equal(state.animation.step,1);assert.equal(state.animation.playing,false,'a click during playback finishes, never skips the next group');
    await page.keyboard.press('End');assert.equal((await page.evaluate(()=>viewer.getState())).currentPage,2);await page.keyboard.press('ArrowLeft');state=await page.evaluate(()=>viewer.getState());assert.equal(state.animation.step,2,'return to the completed previous page');
    await page.keyboard.press('Escape');assert.deepEqual(await read(),animated);assert.equal(await page.evaluate(()=>document.activeElement.id),'present-button');
    // Explicit/autosave and native ZIP all preserve the exact animation document.
    assert.deepEqual(await page.evaluate(()=>IlapoSVG.decodeProject(IlapoSVG.encodeProject(IlapoEditor.getDocument()))),animated);
    await page.locator('#canvas').focus();await page.keyboard.press('Meta+s');await page.waitForFunction(()=>localStorage.getItem('kaijo-ilapo:saved'));
    assert.deepEqual(await page.evaluate(()=>JSON.parse(localStorage.getItem('kaijo-ilapo:saved')).document),animated);
    await pick('pc');await page.locator('#canvas').focus();await page.keyboard.press('Meta+c');await page.locator('[data-action=pages]').first().click();await page.locator('[data-page-pick="1"]').click();await page.locator('#canvas').focus();await page.keyboard.press('Meta+v');
    await page.waitForFunction(()=>IlapoEditor.getDocument().pages[1].animations?.length===3);const pasted=await read(),copied=pasted.pages[1].objects.at(-1);assert(pasted.pages[1].animations.every(a=>a.targets.length===1&&a.targets[0]===copied.id));
    await page.keyboard.press('Meta+z');await page.waitForFunction(()=>!IlapoEditor.getDocument().pages[1].animations?.length);
    await page.locator('[data-action=pages]').first().click();await page.locator('[data-page-pick="0"]').click();
    // Narrow, dark and touch operation; large fonts must not break the one-row toolbar.
    for(const width of [736,390]){
      await page.setViewportSize({width,height:844});await page.locator('[data-menu=more]').click();await page.locator('#command-menu [data-action=view-dialog]').click();await page.locator('#view-theme').selectOption('dark');await page.locator('#view-size').selectOption('xlarge');await page.locator('#dialog-submit').click();
      await openList();assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth&&document.getElementById('dialog').scrollWidth<=innerWidth));
      await page.locator('[data-animation-edit="1"]').click();assert(await page.evaluate(()=>document.getElementById('dialog').scrollWidth<=innerWidth));
      await page.screenshot({path:`/private/tmp/illustslide-stage4-editor-${width}.png`});await page.keyboard.press('Tab');await page.keyboard.press('Shift+Tab');await page.keyboard.press('Escape');
    }
    await page.evaluate(()=>window.viewer=IlapoPresentation.open(IlapoEditor.getDocument()));await page.emulateMedia({reducedMotion:'reduce'});await page.keyboard.press('Space');state=await page.evaluate(()=>viewer.getState());assert.equal(state.animation.step,1);assert.equal(state.animation.playing,false);assert.equal(await page.locator('[data-animation-object=pc]').getAttribute('opacity'),'1');
    await page.screenshot({path:'/private/tmp/illustslide-stage4-mobile.png'});await page.keyboard.press('Escape');await page.emulateMedia({reducedMotion:'no-preference'});
    // The downloaded artifact loads with all network disabled, excludes guides and escapes text.
    await page.setViewportSize({width:1280,height:900});
    const exportDoc=await page.evaluate(()=>{
      const d=IlapoCore.clone(IlapoEditor.getDocument());d.name='共有 </script><script>window.INJECTED=1</script> \u2028';
      const c=document.createElement('canvas');c.width=c.height=2;const g=c.getContext('2d');g.fillStyle='#123456';g.fillRect(0,0,2,2);
      d.pages[0].objects.push({id:'hidden-guide',type:'image',name:'秘密の下絵',group:null,locked:true,matrix:[1,0,0,1,0,0],style:IlapoCore.clone(IlapoCore.DEFAULT_STYLE),x:0,y:0,width:10,height:10,src:c.toDataURL(),reference:true});return d;
    });
    const html=await page.evaluate(d=>IlapoPlaybackExport.buildHTML(d),exportDoc);assert(!html.includes('秘密の下絵'));assert(!html.includes('hidden-guide'));
    const output='/private/tmp/illustslide-stage4-offline.html';await fs.writeFile(output,html);
    const offlineContext=await browser.newContext({viewport:{width:1100,height:800},offline:true}),offline=await offlineContext.newPage(),requests=[];offline.on('request',r=>{if(/^https?:/.test(r.url()))requests.push(r.url());});offline.on('pageerror',e=>errors.push(e.message));
    await offline.goto('file://'+output);await offline.waitForSelector('#ilapo-presentation[open]');assert.equal(await offline.evaluate(()=>window.INJECTED),undefined);
    assert.equal(await offline.locator('[data-animation-object=pc]').getAttribute('opacity'),'0');await offline.keyboard.press('Space');await offline.waitForFunction(()=>!ilapoPlayback.getState().animation.playing);assert.equal((await offline.evaluate(()=>ilapoPlayback.getState())).animation.step,1);
    await offline.keyboard.press('Space');await offline.waitForFunction(()=>!ilapoPlayback.getState().animation.playing);assert.equal((await offline.evaluate(()=>ilapoPlayback.getState())).animation.step,2);
    await offline.keyboard.press('r');assert.equal(await offline.locator('[data-animation-object=pc]').getAttribute('opacity'),'0');await offline.keyboard.press('Escape');await offline.locator('#restart').click();await offline.waitForSelector('#ilapo-presentation[open]');assert.deepEqual(requests,[]);await offline.screenshot({path:'/private/tmp/illustslide-stage4-offline.png'});await offlineContext.close();
    await page.locator('[data-menu=more]').click();const downloaded=page.waitForEvent('download');await page.locator('#command-menu [data-action=export-playback]').click();const download=await downloaded;assert(download.suggestedFilename().endsWith('.play.html'));
    assert.deepEqual(errors,[]);console.log('stage4-browser.test.cjs: passed');
  }finally{await context.close();await browser.close();server.close();}
}
run().catch(error=>{console.error(error);process.exitCode=1;server.close();});
