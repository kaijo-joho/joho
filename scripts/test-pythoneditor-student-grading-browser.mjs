// 本人確認/GSS/時刻は合成。実ブラウザ・二重iframe・生徒採点/教員回収GASコードを結合する。
import assert from 'node:assert/strict';
import { readFile, mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { createEditorServer } from './serve-pythoneditor.mjs';
import { fixture, DUE } from './tools-store-gas/tests/student-grading-fixture.mjs';
const require=createRequire(import.meta.url),{chromium,webkit}=require('playwright');
const engine=process.env.PYTHONEDITOR_ENGINE||'Chrome';
const evidence=process.env.PYTHONEDITOR_STUDENT_GRADING_EVIDENCE||'/private/tmp/pythoneditor-student-grading-verification';
await mkdir(evidence,{recursive:true});
const f=fixture({students:2}),server=await createEditorServer({isolate:false}),browser=engine==='webkit'?await webkit.launch({headless:true}):await chromium.launch({headless:true,executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const templates={dist:await readFile(new URL('./tools-store-gas/dist/25_toolsStoreConnection.html',import.meta.url),'utf8'),store:await readFile(new URL('./tools-store-gas/store/20_tools_store_bridge.html',import.meta.url),'utf8')};
const report={at:new Date().toISOString(),engine,environment:'synthetic school identity, clock and GSS; real editor, nested ToolsBridge, student grading and teacher collection code',checks:[]},errors=[],calls=[],drafts=new Map();
const check=name=>{report.checks.push(name);console.log('PASS',name);};
let currentAccount=f.accounts[0],loseAction=null,holdStatus=false,busyIntake=false,arrived,release;
function connection(account){return{account,actorKey:f.T.actorKey(account),binding:'synthetic-binding:'+account,spreadsheetId:f.bookFor(account).id,storeURL:'https://script.google.com/macros/s/STUDENT_GRADE_SYNTHETIC/exec',schemaVersion:1};}
async function context(){
  const context=await browser.newContext({viewport:{width:1440,height:1000}});
  await context.exposeBinding('__studentGradeRPC',async(_source,mode,action,input,binding)=>{
    calls.push({mode,action,input:structuredClone(input)});
    if(mode==='dist')return{ok:true,value:connection(currentAccount)};
    const account=binding?.replace('synthetic-binding:','');
    try{
      if(account!==currentAccount)f.T.fail('account_mismatch','同じ学校アカウントへ再接続してください。');
      if(action==='submit'&&busyIntake){
        busyIntake=false;
        const intakeTicket=f.student.prepareIntake(input,f.context(account));
        throw Object.assign(new Error('合成のUserLock混雑。署名した到着証明を保持します。'),{toolsStoreCode:'busy',intakeTicket});
      }
      const key=f.T.actorKey(account),qkey=key+'/'+input.questionId+'/'+input.version;
      let value;
      if(action==='session'){const c=connection(account);value={account,actorKey:key,spreadsheetId:c.spreadsheetId,schemaVersion:1};}
      else if(action==='getDraft')value={draft:drafts.get(qkey)||null,history:[]};
      else if(action==='listDrafts')value={drafts:[...drafts.values()].filter(d=>d.actorKey===key)};
      else if(action==='lookupSave')value={state:'missing'};
      else if(action==='saveDraft'){
        const prior=drafts.get(qkey);
        if((prior?.revision||null)!==input.expectedRevision)value={state:'conflict',draft:prior};
        else{
          const draft={...input,actorKey:key,seq:(prior?.seq||0)+1,revision:crypto.randomUUID().replaceAll('-',''),updatedAt:new Date().toISOString(),codeHash:f.P.hashText(input.code),stdinHash:f.P.hashText(input.stdin)};
          drafts.set(qkey,draft);value={state:'saved',draft};
        }
      }else value=f.call(action,input,account);
      if(action==='questionStatus'&&holdStatus){
        holdStatus=false;
        value={...value,receipt:{...value.receipt,state:'pending',score:null,checks:[],diagnostics:[]}};
        arrived?.();await new Promise(r=>release=r);
      }
      if(loseAction===action){loseAction=null;return{ok:false,error:{code:'transport_failed',message:'合成の応答消失。送信控えを保持しています。'}};}
      return{ok:true,value:structuredClone(value)};
    }catch(e){return{ok:false,error:{code:e.toolsStoreCode||e.pythonEditorCode||'service_unavailable',message:e.message,...(e.intakeTicket?{intakeTicket:e.intakeTicket}:{})}};}
  });
  await context.route('**/tools-store-config.mjs',route=>route.fulfill({contentType:'text/javascript',body:"export const toolsStoreConfig={enabled:true,studentGrading:true,distURL:'https://script.google.com/macros/s/TOOLS_DIST_SYNTHETIC/exec',autosave:{idleMs:80,minIntervalMs:180,maxWaitMs:300,jitterMs:0}};"}));
  // 旧grade接続は無効のまま。新しい提出がToolsBridgeだけで完結することを確認する。
  await context.route('**/cloud-config.mjs',route=>route.fulfill({contentType:'text/javascript',body:'export const cloudConfig={enabled:false,bridgeURL:""};'}));
  await context.route('https://script.google.com/**',route=>{
    const url=new URL(route.request().url()),mode=url.searchParams.has('type')?'dist':'store';
    return route.fulfill({contentType:'text/html',body:`<!doctype html><iframe src="https://n-student-grading-fixture-0lu-script.googleusercontent.com/${mode}?${url.searchParams}"></iframe>`});
  });
  await context.route('https://n-student-grading-fixture-0lu-script.googleusercontent.com/**',route=>{
    const url=new URL(route.request().url()),mode=url.pathname.slice(1),boot={protocol:'tools-store-rpc-v1',origin:url.searchParams.get('origin'),channel:url.searchParams.get('channel')};
    const shim=`<script>window.google={script:{run:{withSuccessHandler(success){return{withFailureHandler(failure){return{getToolsStoreConnectionV1(input){window.__studentGradeRPC('dist','session',input).then(success,failure);},toolsStoreRpc(action,input,binding){window.__studentGradeRPC('store',action,input,binding).then(success,failure);}};}};}}}};</script>`;
    return route.fulfill({contentType:'text/html',body:templates[mode].replace(/<\?!= (?:toolsStoreBootJson|bootJson) \?>/,JSON.stringify(boot)).replace('<script>',shim+'<script>')});
  });
  context.on('page',page=>page.on('pageerror',e=>errors.push(e.message)));return context;
}
const idle=page=>page.waitForFunction(()=>!document.querySelector('#cloud-connect').disabled);
const edit=(page,value)=>page.evaluate(value=>document.querySelector('.CodeMirror').CodeMirror.setValue(value),value);
const code=page=>page.locator('.CodeMirror').evaluate(el=>el.CodeMirror.getValue());
async function connect(page){await page.locator('#cloud-connect').click();await idle(page);}
async function submit(page){await page.locator('#formal-submit').click();await page.waitForSelector('#submit-dialog[open]');await page.locator('#submit-confirm').click();await idle(page);}
async function query(page){if(!await page.locator('#status-menu').evaluate(el=>el.open))await page.locator('#status-menu > summary').click();await page.locator('#formal-query').click();await idle(page);}
const saved=page=>page.waitForFunction(()=>document.querySelector('#cloud-inline-status').textContent==='クラウドに保存済み');
let primary;
try{
  primary=await context();const page=await primary.newPage();await page.goto(server.url+'?set=exercise&question=q1&version=v1');await page.waitForSelector('#cloud-connect');await connect(page);
  assert.equal(await page.locator('#question-id').textContent(),'q1');assert.equal(await page.locator('#formal-submit').isDisabled(),false);
  assert.ok(calls.some(c=>c.action==='gradingSession'));assert.equal(await page.locator('iframe[title="学校アカウント接続"]').count(),1);
  check('private URL opens through the draft ToolsBridge while legacy grade connection stays disabled');
  await edit(page,'# start\nx = 2\nprint("value:", x)\n# end');await saved(page);
  const draftCalls=calls.filter(c=>c.action==='saveDraft').length;await submit(page);
  assert.match(await page.locator('#formal-status').textContent(),/採点済み・教員側記録待ち/);assert.match(await page.locator('#formal-score').textContent(),/教員側保存待ち.*66.7 点/);
  assert.match(await page.locator('#question-list [data-question="q1"] .question-item-rating').textContent(),/未採点/);
  assert.match(await page.locator('#formal-best').textContent(),/なし/);assert.equal(f.centralRows('Python提出結果'),0);assert.equal(f.gradeCalls(),1);
  check('signed student grading displays a provisional score without official stars, best score or submitted state');
  await page.reload();await page.waitForSelector('#question-list [data-question="q1"]');await idle(page);
  await page.waitForFunction(()=>document.querySelector('#formal-status').textContent.includes('教員側記録待ち'));
  assert.equal(f.gradeCalls(),1);assert.equal(await page.locator('iframe[title="学校アカウント接続"]').count(),1);
  check('cached resume reconnects grading and recovers the immutable pending request without regrading');
  const collection=f.collector.run();assert.ok(collection.students.some(s=>s.completed===1));await query(page);
  assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.match(await page.locator('#formal-score').textContent(),/最新の得点 66.7 点/);
  assert.equal(await page.locator('#question-list [data-question="q1"] .question-item-rating').textContent(),'★');
  assert.equal(f.centralRows('Python提出結果'),1);assert.equal(await page.evaluate(()=>Object.keys(localStorage).filter(k=>k.includes('.cloud.v1.')&&k.includes('.submit.')).length),0);
  check('teacher archive and signed acknowledgment promote the score, history and official stars together');
  if(await page.locator('#status-menu').evaluate(el=>el.open))await page.locator('#status-menu > summary').click();
  await edit(page,'# start\nx = 3\nprint(x)\n# end');await saved(page);loseAction='submit';await submit(page);
  assert.match(await page.locator('#notice').textContent(),/応答消失/);const count=f.gradeCalls();await query(page);
  assert.equal(f.gradeCalls(),count);assert.match(await page.locator('#formal-status').textContent(),/教員側記録待ち/);assert.equal(f.centralRows('Python提出結果'),1);
  check('a lost grading response is queried by the same request ID and does not duplicate a grade or central result');
  // 別アカウント接続の前に未確認提出を検出し、コード移行の確認自体も出さない。
  if(await page.locator('#status-menu').evaluate(el=>el.open))await page.locator('#status-menu > summary').click();
  currentAccount=f.accounts[1];let dialogs=0;page.on('dialog',async dialog=>{dialogs++;await dialog.dismiss();});await connect(page);
  assert.match(await page.locator('#tools-connect-status').textContent(),/前のアカウントの未確認の提出/);assert.equal(dialogs,0);
  assert.ok(await page.evaluate(()=>Object.keys(localStorage).some(k=>k.includes('.cloud.v1.')&&k.includes('.submit.'))));
  currentAccount=f.accounts[0];await page.locator('#tools-connect-dialog [data-close]').click();await connect(page);
  check('an unconfirmed submission blocks account switching before any draft transfer and remains recoverable by its owner');
  f.collector.run();await query(page);assert.equal(f.centralRows('Python提出結果'),2);
  if(await page.locator('#status-menu').evaluate(el=>el.open))await page.locator('#status-menu > summary').click();
  f.setNow('2026-10-15T02:00:00.000Z');await edit(page,'# start\nx = 2\nprint("value:", x)\n# end');await saved(page);
  await page.locator('#run').click();await page.waitForFunction(()=>document.querySelector('#run').dataset.state==='run',null,{timeout:120000});assert.equal(await page.locator('#output').textContent(),'value: 2\n');
  await submit(page);f.collector.run();await query(page);
  assert.match(await page.locator('#formal-score').textContent(),/100 点.*締切後・成績対象外/);assert.match(await page.locator('#formal-best').textContent(),/66.7 点/);
  assert.equal(await page.locator('#formal-history li').count(),3);assert.ok(DUE<'2026-10-15T02:00:00.000Z');
  check('late resubmission keeps history while the official deadline-qualified per-question best score stays unchanged');
  // 前の接続の遅れた照会が、再接続後の画面へ反映されない。
  const ready=new Promise(r=>arrived=r);holdStatus=true;
  await page.locator('#question-list [data-question="q1"]').click();await ready;
  await page.evaluate(()=>document.getElementById('cloud-connect').click());await idle(page);release();await page.evaluate(()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r))));
  assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.equal(await code(page),'# start\nx = 2\nprint("value:", x)\n# end');
  check('reconnection ignores a prior session response and retains the current code');
  // 未受付busyから最終受付後へ跨いでも、署名済みの元要求だけを再送できる。
  if(await page.locator('#status-menu').evaluate(el=>el.open))await page.locator('#status-menu > summary').click();
  const closing='2026-10-15T03:00:00.000Z',originalCode='# start\nprint("signed first arrival")\n# end',laterCode='# start\nprint("later edit must stay")\n# end';
  f.assignments[0].closesAt=closing;f.setNow(closing);await edit(page,originalCode);await saved(page);busyIntake=true;await submit(page);
  const firstSend=calls.filter(c=>c.action==='submit').at(-1).input;
  assert.equal(f.call('getSubmission',{requestId:firstSend.requestId}).receipt,null);
  assert.ok(await page.evaluate(()=>Object.entries(localStorage).some(([key,value])=>key.includes('.cloud.v1.')&&key.includes('.submit.')&&!!JSON.parse(value).intakeTicket)));
  await edit(page,laterCode);await saved(page);f.setNow('2026-10-15T03:01:00.000Z');await page.reload();
  await page.waitForSelector('#question-list [data-question="q1"]');await idle(page);
  await page.waitForFunction(()=>document.querySelector('#formal-status').textContent.includes('完了未確認'));
  assert.equal(await page.locator('#formal-submit').isDisabled(),false);
  await page.locator('#formal-submit').click();await page.waitForSelector('#submit-dialog[open]');assert.equal(await page.locator('#submit-preview').textContent(),originalCode);
  await page.locator('#submit-confirm').click();await idle(page);
  const resent=calls.filter(c=>c.action==='submit').at(-1).input;
  assert.equal(resent.requestId,firstSend.requestId);assert.equal(resent.code,firstSend.code);assert.deepEqual(resent.run,firstSend.run);assert.equal(typeof resent.intakeTicket,'string');
  assert.equal(f.call('getSubmission',{requestId:firstSend.requestId}).receipt.receivedAt,closing);assert.equal(await code(page),laterCode);
  f.collector.run();await query(page);assert.match(await page.locator('#formal-status').textContent(),/提出済み/);assert.equal(f.centralRows('Python提出結果'),4);
  assert.equal(await page.locator('#formal-submit').isDisabled(),true);
  check('an unreceived signed request survives reload after final closing, resends identical content, and becomes official without allowing a new submission');
  assert.ok(calls.filter(c=>c.action==='saveDraft').length>=draftCalls);await page.setViewportSize({width:390,height:844});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
  await page.screenshot({path:evidence+'/'+engine+'-mobile.png',fullPage:true});await page.setViewportSize({width:1440,height:1000});await page.screenshot({path:evidence+'/'+engine+'-desktop.png',fullPage:true});
  assert.deepEqual(errors,[]);check('390px layout and nested grading connection have no unhandled browser errors');report.passed=true;
}catch(e){report.passed=false;report.error=e.stack;report.browserErrors=errors;report.ui=await primary?.pages()[0]?.evaluate(()=>({notice:document.querySelector('#notice')?.textContent,formal:document.querySelector('#formal-status')?.textContent,connection:document.querySelector('#tools-connect-status')?.textContent})).catch(()=>null);throw e;}
finally{await writeFile(evidence+'/'+engine+'-report.json',JSON.stringify({...report,calls:calls.map(c=>({mode:c.mode,action:c.action,requestId:c.input?.requestId,questionId:c.input?.questionId}))},null,2));await browser.close();await new Promise(r=>server.server.close(r));}
