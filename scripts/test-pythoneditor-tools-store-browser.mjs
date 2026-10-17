// 学校アカウント/Drive/GSSだけを合成し、実エディタ・実GAS保存コード・二重iframeを結合する。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { setup } from './tools-store-gas/tests/store-fixture.mjs';
const require=createRequire(import.meta.url),{chromium,webkit}=require('playwright');
const evidence=process.env.PYTHONEDITOR_TOOLS_EVIDENCE||'/private/tmp/pythoneditor-tools-store-verification';
await mkdir(evidence,{recursive:true});
const server=await createEditorServer({isolate:false}),origin=new URL(server.url).origin;
const f=setup({config:{allowedOrigins:[origin]}}),account=f.identity.active;
const connection={account,actorKey:f.T.actorKey(account),binding:f.binding,spreadsheetId:'synthetic_spreadsheet_identifier_0001',storeURL:'https://script.google.com/macros/s/TOOLS_STORE_SYNTHETIC/exec',schemaVersion:1};
const templates={dist:await readFile(new URL('./tools-store-gas/dist/25_toolsStoreConnection.html',import.meta.url),'utf8'),store:await readFile(new URL('./tools-store-gas/store/20_tools_store_bridge.html',import.meta.url),'utf8')};
const engine=process.env.PYTHONEDITOR_ENGINE||'Chrome',browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report={at:new Date().toISOString(),engine,environment:'synthetic account/Drive/GSS; real editor, shared signing contract, store GAS code and nested iframe bridges',checks:[]},errors=[],calls=[];
const check=name=>{report.checks.push(name);console.log('PASS',name);};
let offline=false,lose=false,hold=false,release,arrived;
async function context(options={}){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  if(options.noStorage)await context.addInitScript(()=>{Storage.prototype.setItem=function(){throw new DOMException('Synthetic quota','QuotaExceededError');};});
  await context.exposeBinding('__toolsRPC',async(_source,mode,action,input,binding,requestOrigin)=>{
    calls.push({mode,action,input:structuredClone(input)});
    if(mode==='dist')return {ok:true,value:{...connection,binding:f.issue()}};
    if(offline)return {ok:false,error:{code:'transport_failed',message:'合成の通信断'}};
    let result;
    try{result={ok:true,value:structuredClone(f.call(action,input,binding,requestOrigin))};}catch(e){result={ok:false,error:{code:e.toolsStoreCode||'service_unavailable',message:e.message}};}
    if(action==='saveDraft'&&hold){hold=false;arrived?.();await new Promise(r=>release=r);}
    if(action==='saveDraft'&&lose){lose=false;return {ok:false,error:{code:'transport_failed',message:'合成の応答消失'}};}
    return result;
  });
  await context.route(/\/tools-store-config\.mjs(?:\?.*)?$/,route=>route.fulfill({contentType:'text/javascript',body:"export const toolsStoreConfig={enabled:true,distURL:'https://script.google.com/macros/s/TOOLS_DIST_SYNTHETIC/exec',autosave:{idleMs:80,minIntervalMs:180,maxWaitMs:300,jitterMs:0}};"}));
  await context.route('https://script.google.com/**',route=>{
    const url=new URL(route.request().url()),mode=url.searchParams.has('type')?'dist':'store';
    return route.fulfill({contentType:'text/html',body:`<!doctype html><iframe src="https://n-tools-store-fixture-0lu-script.googleusercontent.com/${mode}?${url.searchParams}"></iframe>`});
  });
  await context.route('https://n-tools-store-fixture-0lu-script.googleusercontent.com/**',route=>{
    const url=new URL(route.request().url()),mode=url.pathname.slice(1),boot={protocol:'tools-store-rpc-v1',origin:url.searchParams.get('origin'),channel:url.searchParams.get('channel')};
    const shim=`<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{getToolsStoreConnectionV1(input){window.__toolsRPC('dist','session',input).then(success,failure);},toolsStoreRpc(action,input,binding,origin){window.__toolsRPC('store',action,input,binding,origin).then(success,failure);}};}};}}}};</script>`;
    return route.fulfill({contentType:'text/html',body:templates[mode].replace(/<\?!= (?:toolsStoreBootJson|bootJson) \?>/,JSON.stringify(boot)).replace('<script>',shim+'<script>')});
  });
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));return context;
}
const edit=(page,code)=>page.evaluate(code=>document.querySelector('.CodeMirror').CodeMirror.setValue(code),code);
const code=page=>page.locator('.CodeMirror').evaluate(el=>el.CodeMirror.getValue());
const saved=page=>page.waitForFunction(()=>document.querySelector('#cloud-inline-status').textContent==='クラウドに保存済み');
async function connect(page){await page.locator('#cloud-connect').click();await page.waitForFunction(()=>document.querySelector('#cloud-account').textContent.includes('@example.test'));await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);}
let primary,loan,blocked;
try{
  primary=await context();const page=await primary.newPage();await page.goto(server.url);await page.waitForSelector('#question-list button');await edit(page,'print("home")');await connect(page);await saved(page);
  assert.equal(await page.locator('#formal-submit').isDisabled(),true);assert.match(await page.locator('#formal-note').textContent(),/Colab/);
  assert.ok(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.includes('tools-connection')&&value.includes('synthetic_spreadsheet'))));
  check('dist connection resolves and caches own GSS; automatic save works while old Colab submission remains unchanged');
  const qid=await page.locator('#question-id').textContent(),version=await page.locator('#version').textContent();
  const remote=()=>f.call('getDraft',{tool:'python',questionId:qid,version},f.issue()).draft;
  assert.equal(remote().code,'print("home")');
  const arrival=new Promise(r=>arrived=r);hold=true;await edit(page,'first snapshot');await arrival;await edit(page,'edited while sending');
  assert.notEqual(await page.locator('#cloud-inline-status').textContent(),'クラウドに保存済み');release();await saved(page);assert.equal(remote().code,'edited while sending');
  check('delayed acknowledgment confirms its snapshot only; edits during the request are saved next');
  lose=true;await edit(page,'lost response');await saved(page);
  const duplicate=calls.filter(c=>c.action==='saveDraft'&&c.input.code==='lost response');assert.equal(duplicate.length,1);assert.ok(calls.some(c=>c.action==='lookupSave'&&c.input.requestId===duplicate[0].input.requestId));
  check('lost acknowledgment is recovered by request-ID lookup without duplicate revisions');
  offline=true;await edit(page,'offline continuation');await page.waitForFunction(()=>document.querySelector('#cloud-inline-status').textContent.includes('自動再試行'));
  assert.notEqual(remote().code,'offline continuation');offline=false;await saved(page);assert.equal(remote().code,'offline continuation');
  check('offline editing stays local and resumes automatic saving after connection recovery');
  loan=await context();const lp=await loan.newPage();await lp.goto(server.url);await lp.waitForSelector('#question-list button');await connect(lp);await lp.waitForSelector('#cloud-conflict[open]');
  await lp.locator('#conflict-cloud').click();assert.equal(await code(lp),'offline continuation');assert.ok(await lp.evaluate(()=>Object.keys(localStorage).some(key=>key.includes('archive.'))));
  await edit(lp,'loan continuation');await saved(lp);check('a loan device restores the matching problem/version and preserves its prior local code');
  await edit(page,'home continued');await page.waitForSelector('#cloud-conflict[open]');assert.equal(await page.locator('#conflict-preview').textContent(),'loan continuation');
  await page.locator('#conflict-cloud').click();assert.equal(await code(page),'loan continuation');
  assert.ok(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.includes('archive.')&&value.includes('home continued'))));
  check('returning home detects the loan revision and preserves both continuations before import');
  f.identity.active=f.identity.effective='other@example.test';await edit(page,'same owner after login expiry');await page.waitForFunction(()=>document.querySelector('#cloud-inline-status').textContent.includes('再接続'));
  f.identity.active=f.identity.effective=account;assert.equal(remote().code,'loan continuation');await connect(page);await saved(page);assert.equal(remote().code,'same owner after login expiry');
  check('identity mismatch pauses saving and reconnecting the same school user resumes the preserved request');
  await page.reload();await page.waitForSelector('#question-list button');await page.waitForFunction(()=>document.querySelector('#cloud-account').textContent.includes('@example.test'));await saved(page);
  check('reload uses cached connection only after the save GAS verifies identity and restores saved state');
  blocked=await context({noStorage:true});const bp=await blocked.newPage();await bp.goto(server.url);await bp.waitForSelector('#question-list button');
  // Use another problem so this browser-storage failure can create its first cloud draft.
  const buttons=bp.locator('#question-list button');if(await buttons.count()>1)await buttons.nth(1).click();
  await edit(bp,'saved despite browser quota');await connect(bp);
  if(await bp.locator('#cloud-conflict').evaluate(el=>el.open)){throw new Error('quota fixture selected an existing draft');}
  await saved(bp);assert.equal(await bp.locator('#cloud-storage-warning').isVisible(),true);check('browser quota failure displays a warning while cloud saving continues from memory');
  await page.setViewportSize({width:390,height:844});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);await page.screenshot({path:evidence+'/'+engine+'-mobile.png'});
  await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:evidence+'/'+engine+'-autosaved.png'});check('cloud status fits desktop and 390px layout');
  assert.deepEqual(errors,[]);report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;report.browserErrors=errors;report.ui=await primary?.pages()[0]?.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,status:document.querySelector('#cloud-inline-status')?.textContent,connection:document.querySelector('#tools-connect-status')?.textContent})).catch(()=>null);throw e;}
finally{await writeFile(evidence+'/'+engine+'-report.json',JSON.stringify({...report,calls:calls.map(c=>({mode:c.mode,action:c.action,questionId:c.input?.questionId}))},null,2));await browser.close();await new Promise(r=>server.server.close(r));}
