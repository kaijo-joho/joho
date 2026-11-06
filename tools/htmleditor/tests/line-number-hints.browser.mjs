import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {readFile, mkdir, writeFile} from 'node:fs/promises';
import {existsSync} from 'node:fs';
import {resolve, extname, sep} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
import {createHash, createHmac} from 'node:crypto';

const require=createRequire(import.meta.url), {chromium,webkit}=require('playwright');
const protocol=require('../local-protocol.js'), diagnostics=require('../diagnostics.js');
const root=resolve(fileURLToPath(new URL('../../../',import.meta.url)));
const engine=process.env.HTML_HINTS_ENGINE||'chromium';
const evidence=process.env.HTML_HINTS_EVIDENCE||'/private/tmp/html-line-number-hints-20261106/'+engine;
await mkdir(evidence,{recursive:true});
const types={'.html':'text/html','.js':'application/javascript','.mjs':'application/javascript','.css':'text/css','.json':'application/json','.svg':'image/svg+xml','.png':'image/png','.jpg':'image/jpeg','.webp':'image/webp'};
const server=createServer(async(request,response)=>{
 try{
  let pathname=decodeURIComponent(new URL(request.url,'http://localhost').pathname);
  if(pathname.endsWith('/'))pathname+='index.html';
  const file=resolve(root,'.'+pathname);assert(file.startsWith(root+sep));
  response.writeHead(200,{'Content-Type':types[extname(file)]||'application/octet-stream'});response.end(await readFile(file));
 }catch{if(!response.headersSent)response.writeHead(404);response.end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port;
const chrome='/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const browser=engine==='webkit'?await webkit.launch():await chromium.launch(existsSync(chrome)?{executablePath:chrome}:{});
const context=await browser.newContext({viewport:{width:1440,height:950}}),page=await context.newPage();
const report={engine,checks:[],geometry:[],errors:[],externalRequests:[]};
page.on('pageerror',error=>report.errors.push(error.message));
await context.route('**/*',route=>{
 const url=new URL(route.request().url());
 if(url.origin===origin||['data:','blob:'].includes(url.protocol))return route.continue();
 report.externalRequests.push(url.origin);return route.abort();
});
const check=name=>{report.checks.push(name);console.log('PASS',name);};
const codec={encode:s=>Buffer.from(s).toString('base64url'),decode:s=>Buffer.from(s,'base64url').toString(),hash:s=>createHash('sha256').update(s).digest('hex')};
const now=Date.parse('2026-11-06T00:00:00.000Z');
const token=protocol.issueIdentity({codec,config:()=>({enabled:true,activeKeyId:'synthetic-key',allowedKeyIds:['synthetic-key'],epoch:1,lifetimeMs:90*86400000,revokedProofIds:[]}),
 now:()=>now,currentEmail:()=> 'synthetic-student@gfe.kaijo.ed.jp',readRoster:()=>[['userId','年'],['synthetic-student@gfe.kaijo.ed.jp',3]],
 key:()=> 'k'.repeat(43),hmac:(s,k)=>createHmac('sha256',k).update(s).digest('base64url'),randomId:()=> 'a'.repeat(32)}).token;
function fixture(padding=0,id='b'){
 const source='<!doctype html>\n<html lang="ja">\n<head>\n<meta charset="utf-8">\n<title>行番号の検証</title>\n</head>\n<body>\n'+
  '\n'.repeat(padding)+'<imgg></imgg>\n</body>\n</html>';
 const template={assignmentId:'html12-01',fileName:'html12-01.html',templateVersion:'synthetic-v1',templateSha256:codec.hash(source),source,editableRegions:['document']};
 const html=protocol.generate(token,template,id.repeat(32),codec);
 const errors=diagnostics.check(html,{mode:'html'}).errors;
 assert(errors.length>0);return {html,lines:[...new Set(errors.map(e=>e.line))]};
}
const usage=()=>page.evaluate(()=>Object.keys(localStorage).filter(k=>k.startsWith('joho.htmleditor.hints.v1:')).map(k=>JSON.parse(localStorage.getItem(k))));
const codeState=()=>page.evaluate(()=>{
 const cm=document.querySelector('.CodeMirror').CodeMirror;
 return {source:cm.getValue(),history:cm.historySize(),file:document.getElementById('currentFileLabel').textContent,dirty:document.getElementById('dirtyMark').hidden};
});
const geometry=()=>page.evaluate(()=>{
 const cm=document.querySelector('.CodeMirror'),gutter=cm.querySelector('.CodeMirror-linenumbers'),sizer=cm.querySelector('.CodeMirror-sizer');
 return {gutterCount:cm.querySelectorAll('.CodeMirror-gutter').length,width:gutter.getBoundingClientRect().width,
  codeX:sizer.getBoundingClientRect().left-cm.getBoundingClientRect().left,editorWidth:cm.getBoundingClientRect().width};
});
async function upload(data){
 await page.locator('#fileInput').setInputFiles({name:'html12-01.html',mimeType:'text/html',buffer:Buffer.from(data.html)});
 await page.waitForFunction(expected=>document.querySelector('.CodeMirror')?.CodeMirror.getValue()===expected&&
  !document.getElementById('findErrorsBtn').hidden&&!document.getElementById('app').hasAttribute('aria-busy'),data.html);
}
async function showHints(consent=true){
 await page.locator('#findErrorsBtn').click();
 if(consent){
  await page.locator('#actionDialog[open]').waitFor();
  assert.equal(await page.locator('#actionTitle').textContent(),'ヒントを使う前に');
  assert.deepEqual(await page.locator('#actionBody p').allTextContents(),[
   'まずは自分でコードを見直してみましょう。','ヒントを使うと、その利用履歴が提出時に授業担当者へ送られます。']);
  await page.locator('[data-choice="use"]').click();
 }
 await page.waitForFunction(()=>{
  const cm=document.querySelector('.CodeMirror').CodeMirror;let found=false;
  cm.eachLine(line=>{if(line.gutterMarkers?.['CodeMirror-linenumbers'])found=true;});return found;
 });
}
async function scrollToHint(line){
 const button=page.locator('.error-hint-marker[aria-label="'+line+'行目のエラーのヒントを表示"]');
 // CodeMirror measures virtualized line heights as they enter the viewport.
 for(let attempt=0;attempt<5;attempt++){
  await page.evaluate(line=>{const cm=document.querySelector('.CodeMirror').CodeMirror;cm.refresh();cm.scrollTo(null,cm.heightAtLine(line-1,'local')-60);},line);
  await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
  if(await button.count())break;
 }
 await button.waitFor({state:'attached',timeout:5000});await button.scrollIntoViewIfNeeded();
 await page.evaluate(()=>new Promise(done=>requestAnimationFrame(()=>requestAnimationFrame(done))));
 assert.equal(await button.evaluate(el=>Boolean(el.closest('[aria-hidden="true"]'))),false,'scrolled hint must stay accessible');
 assert.equal(await page.getByRole('button',{name:line+'行目のエラーのヒントを表示',exact:true}).count(),1);
 return button;
}
function sameWidth(a,b){assert(Math.abs(a.width-b.width)<0.5,'gutter width changed');assert(Math.abs(a.codeX-b.codeX)<0.5,'code shifted sideways');}
try{
 await page.goto(origin+'/tools/htmleditor/index.html?lesson=html12');
 await page.waitForFunction(()=>window.HtmlEditorStartup&&document.querySelector('.CodeMirror')&&document.querySelector('#startupFallback')?.hidden);
 const data=fixture();await upload(data);
 const initial=await codeState(),before=await geometry();assert.equal(before.gutterCount,1);assert.equal(await page.locator('.error-hint-marker').count(),0);assert.equal((await usage()).length,0);
 check('通常時は行番号1列だけで、エラーがあってもヒントと記録を自動表示しない');
 await page.locator('#findErrorsBtn').click();await page.locator('#actionDialog[open]').waitFor();
 await page.locator('[data-choice="cancel"]').click();assert.equal(await page.locator('.error-hint-marker').count(),0);assert.equal((await usage()).length,0);sameWidth(before,await geometry());
 check('自分で見直すで取消すると、印も記録も追加しない');
 await showHints();
 await writeFile(resolve(evidence,'hint-dom.html'),await page.locator('#editorContainer').innerHTML());
 await page.screenshot({path:resolve(evidence,'hint-initial.png')});
 const after=await geometry();sameWidth(before,after);assert.deepEqual(await codeState(),initial);report.geometry.push({case:'hints',before,after});
 assert.equal((await usage())[0].usage.locationRequests,1);assert.equal((await usage())[0].usage.detailRequests,0);
 const button=await scrollToHint(data.lines[0]);assert.equal(await button.textContent(),String(data.lines[0]));
 assert.equal(await button.getAttribute('cm-ignore-events'),'true');
 assert.equal(await button.evaluate(el=>Boolean(el.closest('[aria-hidden="true"]'))),false);
 await button.hover();await button.focus();assert.equal((await usage())[0].usage.detailRequests,0);assert.equal(await page.locator('#actionDialog[open]').count(),0);
 check('番号を残したボタンを既存欄へ表示し、ホバー・フォーカスは詳細利用に数えない');
 for(const [i,key] of ['click','Enter','Space'].entries()){
  if(key==='click')await button.click();else{await button.focus();await page.keyboard.press(key);}
  await page.locator('#actionDialog[open]').waitFor();
  assert.equal(await page.locator('#actionTitle').textContent(),data.lines[0]+'行目のヒント');
  assert.equal((await usage())[0].usage.detailRequests,i+1);assert.equal((await usage())[0].usage.locationRequests,1);
  await page.locator('[data-choice="close"]').click();assert.equal(await button.evaluate(el=>document.activeElement===el),true);
  assert.deepEqual(await codeState(),initial);sameWidth(before,await geometry());
 }
 check('クリック・Enter・Spaceで各1回だけ詳細を記録し、フォーカス・内容・Undo・保存状態を保持');
 await page.keyboard.press('Tab');assert.notEqual(await page.evaluate(()=>document.activeElement?.className),'error-hint-marker');
 check('行番号ボタンからTabでフォーカスを移動できる');
 await page.locator('#findErrorsBtn').click();await page.waitForTimeout(30);assert.equal(await page.locator('#actionDialog[open]').count(),0);assert.equal((await usage())[0].usage.locationRequests,2);
 check('同じファイルでの再検索では再同意を求めず、場所利用だけを加算');
 await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.replaceRange(' ',{line:4,ch:0}));
 await page.waitForFunction(()=>!document.querySelector('.error-hint-marker'));sameWidth(before,await geometry());
 assert((await page.locator('.CodeMirror-linenumber').allTextContents()).includes(String(data.lines[0])),'ordinary line number must return');
 assert.equal(await page.locator('.CodeMirror-gutter-wrapper[data-hint-number]').count(),0);
 assert.equal((await usage())[0].usage.detailRequests,3);assert.equal((await usage())[0].usage.locationRequests,2);
 const edited=await codeState();assert.notEqual(edited.source,initial.source);
 await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.getElementById('findErrorsBtn').hidden);assert.equal(await page.locator('.error-hint-marker').count(),0);
 await showHints(false);assert.equal((await usage())[0].usage.locationRequests,3);
 await page.locator('#runBtn').click();await page.waitForFunction(()=>!document.querySelector('.error-hint-marker'));sameWidth(before,await geometry());
 check('編集・プレビュー再検査で通常番号へ戻り、利用履歴は保持する');
 // A new document discards old markers and gets its own consent/usage record.
 await page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.undo());
 for(const [index,padding] of [100,1000].entries()){
  const data=fixture(padding,index?'d':'c');await upload(data);
  const before=await geometry(),state=await codeState();await showHints();const button=await scrollToHint(data.lines[0]);
  assert.equal(await button.textContent(),String(data.lines[0]));sameWidth(before,await geometry());assert.deepEqual(await codeState(),state);
  const bounds=await button.evaluate(el=>{const a=el.getBoundingClientRect(),g=document.querySelector('.CodeMirror-linenumbers').getBoundingClientRect();return {left:a.left,right:a.right,gLeft:g.left,gRight:g.right};});
  report.geometry.push({case:'digits-'+String(data.lines[0]).length,before,after:await geometry(),bounds});
  await page.screenshot({path:resolve(evidence,'digits-'+String(data.lines[0]).length+'.png')});
  assert(bounds.left>=bounds.gLeft-0.5&&bounds.right<=bounds.gRight+0.5,'number button escapes its gutter: '+JSON.stringify(bounds));
 }
 check('ファイル切替と3桁・4桁の番号でも専用列を増やさず、番号が欄からはみ出さない');
 await page.locator('#toast').waitFor({state:'hidden'});
 for(const width of [1440,390])for(const scale of [100,150])for(const theme of ['light','dark']){
  await page.setViewportSize({width,height:950});
  await page.evaluate(({scale,theme})=>{window.siteDisplaySettings.setPreferences({textScale:scale,theme});
   if(innerWidth<1050)document.querySelector('#paneNav [data-pane="center"]').click();},{scale,theme});
  const button=await scrollToHint(1009);await button.click({trial:true,timeout:5000});
  const box=await button.boundingBox();assert(box&&box.width>0&&box.height>0);
  const g=await geometry();assert.equal(g.gutterCount,1);
  await page.screenshot({path:resolve(evidence,`hints-${width}-${scale}-${theme}.png`)});
 }
 check('1440/390px・100/150%・ライト/ダークでヒント番号の表示を確認');
 assert.equal(report.errors.length,0);assert.equal(report.externalRequests.filter(url=>url.includes('script.google')).length,0);
 check('ページ例外とGAS通信は0件');
}catch(error){
 report.failure={message:error.message,state:await page.evaluate(()=>{
  const cm=document.querySelector('.CodeMirror')?.CodeMirror;
  return {lines:cm?.lineCount(),sourceLength:cm?.getValue().length,dialog:document.getElementById('actionDialog')?.open,
   dialogTitle:document.getElementById('actionTitle')?.textContent,busy:document.getElementById('app')?.getAttribute('aria-busy'),
   markers:[...document.querySelectorAll('.error-hint-marker')].map(el=>el.textContent),viewport:cm?.getViewport(),scroll:cm?.getScrollInfo(),
   markerLines:cm?Array.from({length:cm.lineCount()},(_,i)=>cm.lineInfo(i)?.gutterMarkers?i+1:null).filter(Boolean):[]};
 })};
 await page.screenshot({path:resolve(evidence,'failure.png')});
 throw error;
}finally{
 await writeFile(resolve(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
 await context.close();await browser.close();await new Promise(done=>server.close(done));
}
