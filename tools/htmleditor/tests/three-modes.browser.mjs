import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,mkdtemp,writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve,join,extname,sep} from 'node:path';
import {fileURLToPath} from 'node:url';
const {chromium,webkit}=createRequire(import.meta.url)('playwright');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const engine=process.env.HTML_MODES_ENGINE||'chromium';
const evidence=process.env.HTML_MODES_EVIDENCE_DIR||'/private/tmp/html-three-modes-'+engine;
await mkdir(evidence,{recursive:true});
const fixture=await mkdtemp('/private/tmp/html-three-mode-files-');
const home='<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>作品</title><link rel="stylesheet" href="style.css"></head><body><h1>作品</h1><a href="pages/about.html">紹介</a><img src="images/photo.png" alt="写真"></body></html>';
const about='<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>紹介</title></head><body><h1>紹介</h1><a href="../index.html">戻る</a></body></html>';
await Promise.all(['images','pages'].map(p=>mkdir(join(fixture,p))));
await Promise.all([writeFile(join(fixture,'index.html'),home),writeFile(join(fixture,'style.css'),'body { color: navy; background-image: url("images/photo.png"); }'),writeFile(join(fixture,'pages/about.html'),about),writeFile(join(fixture,'html16-01.html'),home),writeFile(join(fixture,'images/photo.png'),await readFile(join(root,'html/images/seaside-park.png')))]);
const types={'.html':'text/html;charset=utf-8','.js':'text/javascript','.css':'text/css','.json':'application/json','.png':'image/png','.svg':'image/svg+xml'};
const server=createServer(async(req,res)=>{
 try{const url=new URL(req.url,'http://localhost');let path=decodeURIComponent(url.pathname);if(path.endsWith('/'))path+='index.html';const file=resolve(root,'.'+path);if(!file.startsWith(root+sep))throw Error();const raw=await readFile(file);res.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'}).end(raw);}catch{res.writeHead(404).end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port,base=origin+'/tools/htmleditor/';
const browser=engine==='webkit'?await webkit.launch():await chromium.launch(existsSync('/Applications/Google Chrome.app')?{executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'}:{});
const context=await browser.newContext({viewport:{width:1440,height:950},acceptDownloads:true});
const report={engine,checks:[],errors:[],gasRequests:[],documentRequests:[],blocked:[]};
context.on('page',page=>page.on('pageerror',error=>report.errors.push(error.message)));
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(url.origin===origin||['blob:','data:','about:'].includes(url.protocol))return route.continue();
 if(url.hostname==='docs.google.com'){report.documentRequests.push(url.href);return route.fulfill({contentType:'text/html',body:'<!doctype html><html><body><h1>要項の表示試験</h1></body></html>'});}
 if(/script\.google(?:usercontent)?\.com$/.test(url.hostname))report.gasRequests.push(url.href);
 report.blocked.push(url.origin);return route.abort();
});
if(engine==='chromium')await context.addInitScript(()=>{
 window.showDirectoryPicker=async()=>{
  const mode=new URL(location.href).searchParams.get('mode') || (new URL(location.href).searchParams.has('lesson')?'lesson':'free');
  return (await navigator.storage.getDirectory()).getDirectoryHandle(mode==='final'?'HTML最終課題':mode==='lesson'?'HTML実習':'自由編集',{create:true});
 };
 window.showOpenFilePicker=async()=>[(await window.showDirectoryPicker()).getFileHandle('index.html')];
});
const idle=async page=>{await page.waitForSelector('html[data-editor-ready="true"]');await page.waitForFunction(()=>!document.querySelector('#app').hasAttribute('aria-busy'));};
const current=page=>page.evaluate(()=>document.querySelector('.CodeMirror')?.CodeMirror.getValue());
const setCode=(page,value)=>page.evaluate(value=>document.querySelector('.CodeMirror').CodeMirror.setValue(value),value);
const currentMode=async page=>{assert.equal(await page.locator('#editorModeControl,#editorModeLabel').count(),0);return page.evaluate(()=>document.body.className.match(/\bmode-(lesson|final|free)\b/)?.[1]);};
const ok=name=>{report.checks.push(name);console.log(name);};
async function projectHeader(page){
 const boxes=await page.evaluate(()=>{
  const rect=id=>{const {x,y,width,bottom}=document.getElementById(id).getBoundingClientRect();return {x,y,width,bottom};};
  return {header:rect('editorHeader'),toolbar:rect('toolbar'),left:rect('leftPane'),main:rect('mainContainer'),viewport:innerWidth};
 });
 assert(Math.abs(boxes.toolbar.x)<1 && Math.abs(boxes.toolbar.width-boxes.viewport)<1,'共通ヘッダーは左列を含む全幅');
 assert(boxes.main.y>=boxes.header.bottom-1,'3列は共通ヘッダーの下');
 if(await page.locator('#leftPane').isVisible())assert(boxes.left.y>=boxes.header.bottom-1,'ファイル一覧もヘッダーの下');
 return boxes.toolbar;
}
const pages=[];
try{
 const free=await context.newPage();pages.push(free);await free.goto(base);await idle(free);
 assert.equal(await currentMode(free),'free');
 assert.equal(await free.locator('#submitBtn').isVisible(),false);assert.equal(await free.locator('#taskDownloadBtn').isVisible(),false);
 assert.equal(await free.locator('#finalTemplateBtn').isVisible(),false);
 assert.equal(await free.locator('.identity-alert:visible').count(),0);assert.equal(await free.locator('.identity-toolbar').count(),0);
 assert.equal(await free.locator('#lessonIframe').getAttribute('src'),null);assert.equal(await current(free),'');
 await projectHeader(free);
 ok('通常URLは学校連携なしの空の自由編集で起動');
 for (const id of ['html11','html16']) {
  const entry=await context.newPage();pages.push(entry);await entry.goto(origin+'/'+id+'.html');await idle(entry);
  assert.equal(await currentMode(entry),'lesson');assert.match(entry.url(),new RegExp('lesson='+id));
  assert.equal(await entry.locator('#finalTemplateBtn').isVisible(),false);
  const boxes=await entry.evaluate(()=>['toolbar','leftPane','workspace'].map(id=>{const {x,y,width}=document.getElementById(id).getBoundingClientRect();return {x,y,width};}));
  assert(boxes[0].x>=boxes[1].x+boxes[1].width,'実習の解説パネルはヘッダーから独立');
  assert(Math.abs(boxes[0].x-boxes[2].x)<1);
 }
 ok('教材HTML11・16からの既存入口は実習モードで起動');
 const final=await context.newPage();pages.push(final);await final.goto(base+'?mode=final');await idle(final);
 assert.equal(await currentMode(final),'final');assert(await final.locator('#submitBtn').isDisabled());
 assert.equal(await final.locator('.identity-toolbar').count(),0);assert.equal(await final.locator('#lessonIframe').getAttribute('src'),null);
 const headerBefore=await projectHeader(final);
 await final.locator('#splitLeft').focus();await final.keyboard.press('Enter');assert(await final.locator('body').evaluate(n=>n.classList.contains('left-collapsed')));
 assert.deepEqual(await projectHeader(final),headerBefore);
 await final.keyboard.press('Enter');await final.keyboard.press('ArrowLeft');
 assert.deepEqual(await projectHeader(final),headerBefore);
 ok('作品の共通ヘッダーは全幅で、左列の折りたたみ・幅変更でも移動しない');
 await final.locator('#assignmentDocBtn').click();await final.frameLocator('.assignment-document').locator('h1').waitFor();
 assert.match(await final.locator('#actionBody a').getAttribute('href'),/1zUbnH1Li4gzoSCc99tQWuHX2UJVbjM8AGcnZVvQNkUI\/edit\?tab=t.0#heading=/);
 assert.equal(report.documentRequests.length,1);assert.match(report.documentRequests[0],/\/preview\?tab=t.0$/);
 await final.locator('[data-choice="close"]').click();await idle(final);assert.equal(await final.locator('#assignmentDocBtn').evaluate(n=>n===document.activeElement),true);
 ok('最終課題は専用URL・要項モーダルと別タブの入口・提出停止');
 const templateButton = final.getByRole('button',{name:'テンプレートを取得',exact:true});
 const templateSource = await final.evaluate(() => window.HTML_FINAL_PROJECT_CONFIG.templateSource);
 if (engine === 'chromium') {
  await templateButton.click();
  assert.match(await final.locator('#toast').innerText(), /フォルダを接続/);
  await final.locator('#connectFolderBtn').click();
  await idle(final);
  await final.setViewportSize({width:390,height:950});
  await templateButton.click();
  await idle(final);
  const indexEntry = final.locator('#finalFileTree button').filter({hasText:/^index\.html$/});
  assert(await indexEntry.isVisible());
  assert.equal(await current(final),'');
  const notice = await final.locator('#toast').boundingBox();
  assert(notice.x >= 0 && notice.x + notice.width <= 391);
  assert.equal(await final.evaluate(async () => {
   const folder = await window.showDirectoryPicker();
   return (await (await folder.getFileHandle('index.html')).getFile()).text();
  }),templateSource);
  await indexEntry.click();
  await idle(final);
  assert.equal(await current(final),templateSource);
  await setCode(final,templateSource.replace('{観光地の名称}','編集中の作品'));
  await final.setViewportSize({width:1440,height:950});
  await final.evaluate(async rows=>{
   const dir=await window.showDirectoryPicker();
   for(const [path,body] of rows){
    let dest=dir;
    const parts=path.split('/');
    for(const part of parts.slice(0,-1)) dest=await dest.getDirectoryHandle(part,{create:true});
    const writable=await(await dest.getFileHandle(parts.at(-1),{create:true})).createWritable();
    await writable.write(body);
    await writable.close();
   }
  },[['index.html',home],['style.css','body{color:navy}'],['pages/about.html',about]]);
  await templateButton.click();
  await idle(final);
  assert.match(await final.locator('#toast').innerText(), /index\.html があり/);
  assert.equal(await current(final),templateSource.replace('{観光地の名称}','編集中の作品'));
  assert.equal(await final.evaluate(async () => {
   const folder = await window.showDirectoryPicker();
   return (await (await folder.getFileHandle('index.html')).getFile()).text();
  }),home);
  await final.locator('#projectRefreshBtn').click();
  await idle(final);
  await indexEntry.click();
  await final.locator('[data-choice="discard"]').click();
  await idle(final);
  ok('最終課題のテンプレートを接続先に保存し、作業中の内容と同名ファイルを保護');
 } else {
  const [downloaded] = await Promise.all([final.waitForEvent('download'),templateButton.click()]);
  assert.equal(downloaded.suggestedFilename(),'index.html');
  assert.equal(await readFile(await downloaded.path(),'utf8'),templateSource);
  await final.locator('#directoryInput').setInputFiles(fixture);
  await idle(final);
  await final.locator('#finalFileTree button').filter({hasText:/^index\.html$/}).click();
  await idle(final);
  ok('直接保存に未対応のブラウザでは index.html をダウンロード');
 }
 assert.equal(await current(final),home);await final.frameLocator('#previewIframe').locator('h1').waitFor();
 const paneTops=await final.evaluate(()=>['leftPane','centerPane','rightPane'].map(id=>document.getElementById(id).getBoundingClientRect().top));
 assert(paneTops.every(top=>Math.abs(top-paneTops[0])<1),'ヘッダーの下に3列を揃える');
 await final.screenshot({path:join(evidence,'header-final-desktop.png'),fullPage:true});
 await final.frameLocator('#previewIframe').getByRole('link',{name:'紹介',exact:true}).click();await final.frameLocator('#previewIframe').getByRole('heading',{name:'紹介',exact:true}).waitFor();
 assert.equal(await current(final),home);assert.equal(new URL(final.url()).search,'?mode=final');
 ok('作品の階層HTMLを開き、リンクはプレビュー内だけ移動');
 const edited=home.replace('</body>','<p>未保存の編集</p></body>');await setCode(final,edited);await final.waitForTimeout(650);
 await final.locator('#lessonPickerBtn').click();
 const [lesson]=await Promise.all([context.waitForEvent('page'),final.locator('#actionBody a').filter({hasText:'1-6.'}).click()]);pages.push(lesson);await idle(lesson);
 assert.equal(await currentMode(lesson),'lesson');assert.match(await lesson.locator('#lessonIframe').getAttribute('src'),/html16\.html/);
 assert.equal(await current(lesson),'');assert.equal(await current(final),edited);assert(await final.locator('#dirtyMark').isVisible());
 await final.locator('[data-choice="close"]').click();await idle(final);
 ok('最終課題から実習は別タブ、元の未保存内容・作品フォルダを維持');
 await lesson.locator('#displayMenuWrap > summary').click();const [otherFinal]=await Promise.all([context.waitForEvent('page'),lesson.locator('#finalModeLink').click()]);pages.push(otherFinal);await idle(otherFinal);
 assert.equal(await currentMode(otherFinal),'final');assert.equal(await current(otherFinal),'');assert.match(lesson.url(),/lesson=html16/);
 assert.equal(await lesson.locator('#displayMenuWrap').evaluate(n=>n.open),false);
 ok('実習から最終課題も別タブで開き、ファイルは自動で開かない');
 async function createFinalFile(name){
  await final.locator('#newProjectFileBtn').click();await final.locator('#newFileName').fill(name);await final.locator('[data-choice="create"]').click();
  await final.waitForFunction(name=>document.querySelector('#currentFileLabel').textContent===name || document.querySelector('[data-choice="discard"]'),name);
  if(await final.locator('[data-choice="discard"]').isVisible())await final.locator('[data-choice="discard"]').click();
  await idle(final);
 }
 if(engine==='chromium'){
  await final.locator('#saveBtn').click();await idle(final);assert.match(await final.locator('#toast').innerText(),/Macのファイルに保存しました/);
  const disk=await final.evaluate(async()=>await(await(await window.showDirectoryPicker()).getFileHandle('index.html')).getFile().then(f=>f.text()));assert.equal(disk,edited);
  await createFinalFile('race.html');const raceSource=await current(final);
  await final.evaluate(()=>{const original=FileSystemDirectoryHandle.prototype.getFileHandle;FileSystemDirectoryHandle.prototype.getFileHandle=async function(name,options){
   if(name==='race.html'&&options?.create){FileSystemDirectoryHandle.prototype.getFileHandle=original;const handle=await original.call(this,name,options),w=await handle.createWritable();await w.write('別の操作で保存した内容');await w.close();return handle;}return original.call(this,name,options);
  };});
  for(let attempt=0;attempt<2;attempt++){
   await final.locator('#saveBtn').click();await final.locator('[data-choice="save"]').click();await idle(final);
   assert.match(await final.locator('#toast').innerText(),/同名/);assert(await final.locator('#dirtyMark').isVisible());assert.equal(await current(final),raceSource);
   assert.equal(await final.evaluate(async()=>await(await(await window.showDirectoryPicker()).getFileHandle('race.html')).getFile().then(f=>f.text())),'別の操作で保存した内容');
  }
  ok('新規保存直前の同名ファイルを上書きせず、再試行も元の編集内容を保持');
  await createFinalFile('pages/extra.html');
  await final.locator('#saveBtn').click();await final.locator('[data-choice="save"]').click();await idle(final);
  assert.match(await final.locator('#toast').innerText(),/Macのファイルに保存しました/);
  assert.match(await final.evaluate(async()=>await(await(await(await window.showDirectoryPicker()).getDirectoryHandle('pages')).getFileHandle('extra.html')).getFile().then(f=>f.text())),/<!doctype html>/);
  await createFinalFile('missing/new.css');
  await final.locator('#saveBtn').click();await final.locator('[data-choice="save"]').click();await idle(final);
  assert.match(await final.locator('#toast').innerText(),/Finder/);assert(await final.locator('#dirtyMark').isVisible());
  assert.equal(await final.evaluate(async()=>{try{await(await window.showDirectoryPicker()).getDirectoryHandle('missing',{create:false});return false;}catch(e){return e.name==='NotFoundError';}}),true);
  ok('既存子フォルダへ新規保存でき、未作成フォルダは自動作成せず未保存内容を保持');
  await free.locator('#connectFolderBtn').click();await idle(free);
  await lesson.locator('#connectFolderBtn').click();await lesson.locator('#actionDialog[open]').waitFor();await lesson.locator('[data-choice="cancel"]').click();await idle(lesson);
  const keys=await final.evaluate(()=>new Promise((done,reject)=>{const req=indexedDB.open('joho.htmleditor.folder-memory.v1');req.onerror=()=>reject(req.error);req.onsuccess=()=>{const db=req.result,r=db.transaction('handles').objectStore('handles').getAllKeys();r.onsuccess=()=>{done(r.result);db.close();};};}));
  assert.deepEqual(keys.sort(),['directory','final-directory','free-directory']);
  await otherFinal.reload();await idle(otherFinal);assert.equal(await current(otherFinal),'');assert.match(await otherFinal.locator('#folderStatusText').textContent(),/HTML最終課題/);
  ok('Chrome合成フォルダへ保存・3つの接続先を別記憶・再読込で文書を自動復旧しない');
 }else{
  await final.locator('#saveBtn').click();assert.match(await final.locator('#actionTitle').innerText(),/上書き保存できません/);await final.locator('[data-choice="close"]').click();await idle(final);assert.equal(await current(final),edited);
  ok('WebKit読取専用では保存方法を案内し、編集内容を保持');
 }
 // 同名の実習ファイルを自由編集で開いても教材・本人確認を勝手に起動しない。
 await free.locator('#fileInput').setInputFiles(join(fixture,'html16-01.html'));await idle(free);
 assert.equal(await currentMode(free),'free');assert.equal(await free.locator('#lessonIframe').getAttribute('src'),null);assert.equal(await free.locator('.identity-toolbar').count(),0);
 await setCode(free,home+'<!-- free recovery -->');await free.waitForTimeout(650);
 await final.locator('#displayMenuWrap > summary').click();await final.locator('#restoreBtn').click();await final.locator('#actionTitle').filter({hasText:'復旧候補'}).waitFor();
 assert.doesNotMatch(await final.locator('#actionBody').innerText(),/html16-01\.html/);await final.locator('[data-choice="cancel"]').click();await idle(final);
 ok('実習名ファイルを自由編集で開いてもモード固定、復旧候補はモード別');
 await free.locator('#newProjectFileBtn').click();await free.locator('#newFileName').fill('../bad.html');await free.locator('[data-choice="create"]').click();assert(await free.locator('#actionError').isVisible());
 await free.locator('#newFileName').fill('new.html');await free.locator('[data-choice="create"]').click();await free.locator('[data-choice="discard"]').click();await idle(free);assert.equal(await free.locator('#currentFileLabel').innerText(),'new.html');assert(await free.locator('#dirtyMark').isVisible());
 assert.equal(await free.locator('.identity-toolbar').count(),0);ok('新規HTML作成は危険なパスを拒否し、保存前を未保存として表示');
 for(const page of [free,final,lesson]){
  for(const theme of ['light','dark']){
   await page.evaluate(theme=>window.siteDisplaySettings?.setPreferences({theme,textScale:120}),theme);
   for(const width of [1440,390]){
    await page.setViewportSize({width,height:950});await page.waitForTimeout(90);assert(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1));
    if(page!==lesson){
     await projectHeader(page);
     if(width===390){
      await page.locator('#paneNav button[data-pane="left"]').click();assert(await page.locator('#toolbar').isVisible());await projectHeader(page);
      await page.locator('#displayMenuWrap > summary').click();assert(await page.locator('#editorDisplaySettings').isVisible());
      await page.locator('#stepsModeLink').click();await page.locator('#actionDialog[open]').waitFor();assert.match(await page.locator('#actionTitle').innerText(),/手順/);
      await page.locator('[data-choice="close"]').click();await idle(page);assert(await page.locator('#displayMenuWrap > summary').evaluate(n=>n===document.activeElement));
      if(page===final){
       await page.locator('#displayMenuWrap > summary').click();await page.locator('#assignmentDocMenuBtn').click();await page.frameLocator('.assignment-document').locator('h1').waitFor();
       await page.locator('[data-choice="close"]').click();await idle(page);
      }
      await page.locator('#paneNav button[data-pane="center"]').click();
     }
    }
   }
  }
  await page.screenshot({path:join(evidence,(await currentMode(page))+'.png'),fullPage:true});
 }
 ok('3モードのライト・ダーク・拡大文字と390pxで横はみ出しなし');
 const invalid=await context.newPage();pages.push(invalid);await invalid.goto(base+'?mode=final&lesson=html16');
 await invalid.locator('#startupMessage').filter({hasText:'起動できませんでした'}).waitFor();assert.equal(await invalid.locator('#app').isVisible(),false);
 ok('混在したモードURLは別の課題へ推測して開かない');
 assert.equal(report.gasRequests.length,0);assert.deepEqual(report.errors,[]);
 await otherFinal.setViewportSize({width:1440,height:950});
 const layoutKey='joho.htmleditor.layout.v1.final';
 await otherFinal.evaluate(key=>localStorage.setItem(key,JSON.stringify({v:1,leftRatio:.32,rightRatio:.5,leftCollapsed:true,rightCollapsed:false})),layoutKey);
 await otherFinal.reload();await idle(otherFinal);assert(await otherFinal.locator('body').evaluate(n=>n.classList.contains('left-collapsed')));
 await otherFinal.locator('#viewMenu > summary').click();await otherFinal.locator('#resetLayoutBtn').click();
 assert.equal(await otherFinal.evaluate(key=>localStorage.getItem(key),layoutKey),null);
 await otherFinal.reload();await idle(otherFinal);assert.equal(await otherFinal.locator('body').evaluate(n=>n.classList.contains('left-collapsed')),false);
 ok('最終課題の列配置の初期化が再読込後も保たれる');
 for(const page of [free,otherFinal]){
  await page.setViewportSize({width:1440,height:950});
  const dirty=await page.locator('#dirtyMark').isVisible();
  await page.locator('#fileInput').setInputFiles(join(fixture,'html16-01.html'));
  if(dirty)await page.locator('[data-choice="discard"]').click();
  await idle(page);
  await setCode(page,home.replace('</body>','<imgg></imgg></body>'));await page.locator('#runBtn').click();await idle(page);
  await page.locator('#findErrorsBtn').click();
  if(await page.locator('[data-choice="use"]').isVisible())await page.locator('[data-choice="use"]').click();
  await idle(page);const marker=page.locator('.error-hint-marker').first();await marker.waitFor();assert.doesNotMatch(await marker.getAttribute('data-tip'),/授業担当者|送信|記録/);
  await marker.click();assert.doesNotMatch(await page.locator('#actionBody').innerText(),/授業担当者|送信|利用記録/);await page.locator('[data-choice="close"]').click();await idle(page);
  const help=await page.locator('[data-hint-help]').textContent();assert.doesNotMatch(help,/送信|利用記録/);
 }
 ok('最終課題・自由編集の行番号ヒントとヘルプに記録送信の誤案内がない');
 await context.route('**/final-config.js*',route=>route.abort());
 for(const suffix of ['', '?lesson=html16']){
  const page=await context.newPage();pages.push(page);await page.goto(base+suffix);await idle(page);
 }
 ok('最終課題設定を取得できない場合も自由編集と既存実習を起動できる');
 assert.equal(report.gasRequests.length,0);assert.deepEqual(report.errors,[]);
 ok('実GAS接続・提出・Mac mini通信なし、ブラウザ例外なし');
}finally{
 await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2));
 for(const page of pages){await page.evaluate(()=>{document.querySelector('.CodeMirror')?.CodeMirror.setValue('');}).catch(()=>{});}
 await browser.close();server.close();
}
