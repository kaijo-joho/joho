// 接続先をブラウザ内で合成応答へ差し替える。学校アカウント/本番GAS/GSSへ通信しない。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { createCloudFixture, T0, DUE } from '../tools/pythoneditor/tests/cloud-fixture.mjs';
const require=createRequire(import.meta.url),{chromium,webkit}=require('playwright');
const evidence=process.env.PYTHONEDITOR_CLOUD_EVIDENCE||'/private/tmp/pythoneditor-cloud-verification';
await mkdir(evidence,{recursive:true});
const f=createCloudFixture(),other=structuredClone(f.snapBody);other.question.questionId='q2';other.question.order=2;other.question.title='二つ目のテスト';f.freeze(other);
let clock=T0,loginExpired=false,loseAction=null,delayAction=null,holdStatusQuestion=null,releaseStatus,readyStatus,doneStatus;
const setClock=value=>{clock=value;f.setNow(value);};
f.ctx.Date=class extends Date {constructor(...args){super(...(args.length?args:[clock]));}};
f.ctx.PythonEditorService.environment=()=>{if(loginExpired)f.P.fail('login_required');return f.env();};
const backendCalls=[];
const server=await createEditorServer({isolate:false});
const browser=process.env.PYTHONEDITOR_ENGINE==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const report={at:new Date().toISOString(),environment:'synthetic school identity/GSS and nested GAS bridge; real browser/editor/Pyodide',engine:process.env.PYTHONEDITOR_ENGINE||'Chrome',checks:[]};
const check=name=>{report.checks.push(name);console.log('PASS',name);};
const bridge=await readFile(new URL('./pythoneditor-gas/21_python_editor_bridge.html',import.meta.url),'utf8');
const ui=await readFile(new URL('../tools/pythoneditor/cloud-ui.mjs',import.meta.url),'utf8');
const errors=[];
async function context() {
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.exposeBinding('__pythonFixture',async(_source,action,input,actorKey)=>{
    backendCalls.push({action,input:structuredClone(input),actorKey});
    if(delayAction===action){delayAction=null;await new Promise(r=>setTimeout(r,300));}
    const result=f.ctx.pythonEditorRpc(action,input,actorKey);
    if(action==='questionStatus'&&input.questionId===holdStatusQuestion){holdStatusQuestion=null;await new Promise(r=>{releaseStatus=r;readyStatus();});doneStatus();}
    if(loseAction===action){loseAction=null;await new Promise(r=>setTimeout(r,3000));}
    return result;
  });
  await context.route('**/cloud-config.mjs',route=>route.fulfill({contentType:'text/javascript',body:"export const cloudConfig={enabled:true,bridgeURL:'https://script.google.com/macros/s/PYTHON_EDITOR_TEST_ONLY/exec'};"}));
  // 本番60秒の同じタイムアウト分岐を1.5秒で検査する。
  assert.ok(ui.includes('new GoogleBridge(cloudConfig)'));
  await context.route('**/cloud-ui.mjs',route=>route.fulfill({contentType:'text/javascript',body:ui.replace('new GoogleBridge(cloudConfig)','new GoogleBridge(cloudConfig,{timeout:1500})')}));
  await context.route('https://script.google.com/**',route=>{
    const url=new URL(route.request().url());
    return route.fulfill({contentType:'text/html',body:`<!doctype html><iframe src="https://n-pythoneditor-fixture-0lu-script.googleusercontent.com/python-editor-fixture?${url.searchParams}"></iframe>`});
  });
  await context.route('https://n-pythoneditor-fixture-0lu-script.googleusercontent.com/**',route=>{
    const url=new URL(route.request().url()),boot={origin:url.searchParams.get('origin'),channel:url.searchParams.get('channel')};
    const shim=`<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{pythonEditorRpc(action,input,key){window.__pythonFixture(action,input,key).then(success,failure);}}}}}}}};</script>`;
    return route.fulfill({contentType:'text/html',body:bridge.replace('<?!= bootJson ?>',JSON.stringify(boot)).replace('<script>',shim+'<script>')});
  });
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));
  return context;
}
async function edit(page,code){await page.evaluate(code=>document.querySelector('.CodeMirror').CodeMirror.setValue(code),code);}
async function code(page){return page.evaluate(()=>document.querySelector('.CodeMirror').CodeMirror.getValue());}
async function connect(page){await page.locator('#cloud-connect').click();await page.waitForFunction(()=>document.querySelector('#cloud-account').textContent.includes('@example.invalid'));await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);}
async function menu(page,id){await page.locator('#file-menu summary').click();await page.locator('#'+id).click();}
async function save(page){await menu(page,'save-cloud');await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);}
async function submit(page){await page.locator('#formal-submit').click();await page.waitForSelector('#submit-dialog[open]');await page.locator('#submit-confirm').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);}
let primary;
try {
  primary=await context();const page=await primary.newPage();await page.goto(server.url);await page.waitForSelector('#question-list button');
  const linked=await primary.newPage();await linked.goto(server.url+'?set=exercise&question=q2&version=v1');await linked.waitForSelector('#question-list button');await connect(linked);
  assert.equal(await linked.locator('#question-id').textContent(),'q2');assert.match(linked.url(),/question=q2/);await linked.close();check('URL-selected private question/version opens after school connection');
  const delayed=await primary.newPage();let releaseCatalog,deliveredCatalog;const catalogDone=new Promise(r=>deliveredCatalog=r);
  await delayed.route('**/__pythoneditor/catalog',async route=>{await new Promise(r=>releaseCatalog=r);await route.fulfill({status:404,body:'Not found'});deliveredCatalog();});
  await delayed.goto(server.url+'?set=exercise&question=q2&version=v1');await connect(delayed);await edit(delayed,'authenticated draft must stay');
  releaseCatalog();await catalogDone;await delayed.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.equal(await delayed.locator('#question-id').textContent(),'q2');assert.equal(await code(delayed),'authenticated draft must stay');await delayed.close();check('late initial catalog response cannot replace authenticated selection or edited code');
  await edit(page,'print("接続待ちの編集中")');await connect(page);assert.match(await code(page),/接続待ちの編集中/);check('nested cross-origin bridge connects without replacing current edited code');
  await page.locator('#set-select').selectOption('exercise');
  await edit(page,'# start\nx = 2\nprint("value:", x)\n# end');
  await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:120000});assert.equal(await page.locator('#output').textContent(),'value: 2\n');
  await save(page);assert.match(await page.locator('#notice').textContent(),/GSSに保存/);assert.equal(f.sheets.Python下書き履歴.values.length,2);assert.match(await page.locator('#formal-status').textContent(),/未提出/);check('real execution and GSS draft save remain separate from submission');
  const statusReady=new Promise(r=>readyStatus=r),statusDone=new Promise(r=>doneStatus=r);holdStatusQuestion='q1';
  await page.locator('#question-list button').nth(1).click();await page.locator('#question-list button').nth(0).click();await statusReady;
  await submit(page);assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.match(await page.locator('#formal-score').textContent(),/100 点/);check('full-code text submission, server grading, persisted result/history and official display');
  releaseStatus();await statusDone;await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));assert.match(await page.locator('#formal-status').textContent(),/提出済み/);check('late status lookup cannot downgrade a completed submission');
  await edit(page,'# start\nx = 3\nprint("value:", x)\n# end');await page.waitForFunction(()=>document.querySelector('#formal-edited').textContent.includes('変更'));check('editing after submission keeps official result and identifies changed code');
  let latest=f.dispatch('getDraft',{questionId:'q1',version:'v1'}).draft;
  f.dispatch('saveDraft',f.draft('loan continuation',latest.revision));
  await save(page);await page.waitForSelector('#cloud-conflict[open]');assert.equal(await page.locator('#conflict-preview').textContent(),'loan continuation');
  await page.locator('#conflict-cloud').click();assert.equal(await code(page),'loan continuation');
  const archived=await page.evaluate(()=>Object.entries(localStorage).filter(([k,v])=>k.includes('archive.')&&v.includes('x = 3')).length);assert.ok(archived>0);check('loan-device restore conflicts preserve local pre-import code');
  latest=f.dispatch('getDraft',{questionId:'q1',version:'v1'}).draft;f.dispatch('saveDraft',f.draft('another loan edit',latest.revision));
  await edit(page,'home continuation');await save(page);await page.waitForSelector('#cloud-conflict[open]');await page.locator('#conflict-local').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);
  assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1'}).draft.code,'home continuation');assert.ok(f.dispatch('getDraft',{questionId:'q1',version:'v1'}).history.length>=4);check('keeping local continuation uses checked revision and retains both cloud histories');
  const loan=await context(),lp=await loan.newPage();await lp.goto(server.url);await lp.waitForSelector('#question-list button');await connect(lp);await menu(lp,'open-cloud');
  await lp.locator('#cloud-options button').filter({hasText:'q1'}).click();await lp.waitForFunction(()=>!document.querySelector('#cloud-import').disabled);
  const revisions=await lp.locator('#cloud-revisions option').evaluateAll(items=>items.map(i=>i.value));assert.ok(revisions.length>=4);
  await lp.selectOption('#cloud-revisions',revisions[1]);await lp.waitForFunction(()=>!document.querySelector('#cloud-import').disabled);assert.notEqual(await lp.locator('#cloud-preview').textContent(),'home continuation');
  await lp.selectOption('#cloud-revisions',revisions[0]);await lp.waitForFunction(()=>!document.querySelector('#cloud-import').disabled);
  await lp.locator('#cloud-import').click();assert.equal(await code(lp),'home continuation');await loan.close();check('another browser profile selects GSS history and restores continuation with a protected local draft');
  await edit(page,'sent before network break');loseAction='saveDraft';await save(page);assert.match(await page.locator('#notice').textContent(),/応答/);
  await edit(page,'edited during disconnect');const callsBefore=backendCalls.filter(c=>c.action==='saveDraft').at(-1).input;
  await save(page);const callsAfter=backendCalls.filter(c=>c.action==='saveDraft').at(-1).input;assert.deepEqual(callsAfter,callsBefore);assert.equal(await code(page),'edited during disconnect');assert.match(await page.locator('#notice').textContent(),/送信開始時/);check('lost draft response retries identical request/code while keeping newer in-browser edits');
  await edit(page,'# start\nx = 2\nprint("value:", x)\n# end');loseAction='submit';const resultsBefore=f.sheets.Python提出結果.values.length;
  await submit(page);assert.match(await page.locator('#notice').textContent(),/応答/);await page.locator('#formal-query').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);
  assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.equal(f.sheets.Python提出結果.values.length,resultsBefore+1);check('lost submission response is recovered by request ID without a duplicate result');
  f.sheets.Python提出結果.beforeWrite=()=>{throw new Error('temporary failure');};await submit(page);
  await page.locator('#formal-query').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);assert.match(await page.locator('#formal-status').textContent(),/結果保存待ち/);
  f.sheets.Python提出結果.beforeWrite=null;setClock('2026-10-14T02:00:00.000Z');await page.locator('#formal-resume').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);
  assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.ok(f.dispatch('questionStatus',{questionId:'q1',version:'v1',assignmentId:'exercise1'}).receipt.receivedAt<T0.slice(0,11)+'01:00:00.000Z');check('result write failure remains pending; retry after deadline uses original server receipt');
  loginExpired=true;await edit(page,'saved after reauthentication');await save(page);assert.match(await page.locator('#notice').textContent(),/再接続/);assert.equal(await code(page),'saved after reauthentication');
  loginExpired=false;await connect(page);await save(page);assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1'}).draft.code,'saved after reauthentication');check('synthetic authentication expiry keeps code and immutable draft request through reconnect');
  delayAction='saveDraft';await edit(page,'q1 fixed request');await menu(page,'save-cloud');await page.locator('#question-list button').nth(1).click();await edit(page,'q2 must remain');
  await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);assert.equal(await code(page),'q2 must remain');assert.equal(f.dispatch('getDraft',{questionId:'q1',version:'v1'}).draft.code,'q1 fixed request');check('late save response stays bound to original question after switching and editing');
  setClock(DUE);f.setLocked(true);await submit(page);assert.match(await page.locator('#notice').textContent(),/混み/);f.setLocked(false);setClock('2026-10-14T02:00:00.000Z');await submit(page);
  const proofResult=f.dispatch('questionStatus',{questionId:'q2',version:'v1',assignmentId:'exercise1'});assert.equal(proofResult.receipt.receivedAt,DUE);assert.equal(proofResult.receipt.late,false);check('signed server-arrival proof survives busy response and retry after deadline');
  await page.setViewportSize({width:390,height:844});await page.locator('#settings-menu summary').click();await page.selectOption('#theme','dark');await page.selectOption('#text-size','largest');await page.locator('#settings-menu summary').click();
  await page.evaluate(()=>{scrollTo(0,0);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  assert.equal(await page.locator('.CodeMirror').evaluate(el=>getComputedStyle(el).backgroundColor),await page.locator('#code-cell').evaluate(el=>getComputedStyle(el).backgroundColor));
  await page.screenshot({path:evidence+'/cloud-mobile.png',fullPage:true});
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));check('390px dark theme and largest text retain usable cloud/submission controls');
  await page.setViewportSize({width:1440,height:1000});await page.locator('#settings-menu summary').click();await page.selectOption('#theme','light');await page.selectOption('#text-size','standard');await page.locator('#settings-menu summary').click();await page.locator('#question-list button').nth(0).click();await page.locator('#formal-query').click();await page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);
  await page.evaluate(()=>{scrollTo(0,0);return new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));});
  await page.screenshot({path:evidence+'/cloud-desktop.png',fullPage:true});assert.deepEqual(errors,[]);check('no unhandled browser errors');
} catch(e) {report.failure=String(e);if(primary){const pages=primary.pages();report.ui=await pages[0]?.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,account:document.querySelector('#cloud-account')?.textContent,formal:document.querySelector('#formal-status')?.textContent})).catch(()=>null);}throw e;}
finally {await writeFile(evidence+'/report.json',JSON.stringify(report,null,2));await browser.close();await new Promise(r=>server.server.close(r));}
