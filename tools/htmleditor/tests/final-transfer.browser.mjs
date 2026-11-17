import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {createRequire} from 'node:module';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {resolve,join} from 'node:path';
const require=createRequire(import.meta.url),{chromium,webkit}=require('playwright'),Project=require('../final-project.js');
const engine=process.env.HTML_FINAL_TRANSFER_ENGINE||'chromium';
const evidence='/private/tmp/html-fm2-draft2-'+engine;await mkdir(evidence,{recursive:true});
const root=resolve(fileURLToPath(new URL('../',import.meta.url)));
const fixture=`<!doctype html><meta charset="utf-8"><title>合成fm2確認UI</title><form><input id="title" aria-label="タイトル"><label><input id="consent" type="checkbox">公開内容を確認</label><button id="formal" disabled>正式提出</button></form><script>
window.fixture={headers:null,zipCount:0,formalCount:0,formRevision:1,last:null,serverReceipt:null};
let parentOrigin='';
function emit(operation,extra={}){parent.postMessage({...fixture.headers,operation,...extra},parentOrigin);}
window.inject=data=>parent.postMessage(data,parentOrigin||'http://127.0.0.1');
window.replay=()=>{if(fixture.last)emit('formal-receipt',fixture.last);};
window.publish=(status,publicationRevision)=>emit('publication',{formRevision:fixture.last.formRevision,formalRequestId:fixture.last.htmlSubmissionReceipt.formalRequestId,submissionFingerprint:fixture.last.htmlSubmissionReceipt.submissionFingerprint,attemptId:fixture.last.htmlSubmissionReceipt.attemptId,status,publicationRevision});
addEventListener('message',async event=>{
 if(event.source!==parent)return;
 const d=event.data;
 if(d?.operation==='hello'){
  parentOrigin=event.origin;
  fixture.headers=Object.fromEntries(['contract','nonce','transferRequestId','route','actorBinding','archiveSha256'].map(k=>[k,d[k]]));
  emit('ready',{formRevision:fixture.formRevision});
 }else if(d?.operation==='prepare'){
  const sum=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',d.archive.bytes)),n=>n.toString(16).padStart(2,'0')).join('');
  if(sum!==d.archiveSha256)throw Error('fixture archive mismatch');
  fixture.zipCount++;document.querySelector('#formal').disabled=false;emit('archive-staged',{formRevision:fixture.formRevision});
 }else if(d?.operation==='status'){
  const r=fixture.serverReceipt;
  emit('status-result',{checkSequence:d.checkSequence,result:r?{ok:true,...r,currentOfficial:true,matchesSubmittedContent:Boolean(d.query.submissionFingerprint)}:{ok:true,status:'unknown',formalRequestId:d.query.formalRequestId}});
 }
});
for(const element of document.querySelectorAll('input'))element.addEventListener('input',()=>{if(fixture.zipCount){fixture.formRevision++;emit('form-changed',{formRevision:fixture.formRevision});}});
document.querySelector('form').addEventListener('submit',async event=>{
 event.preventDefault();if(!fixture.zipCount||!document.querySelector('#title').value||!document.querySelector('#consent').checked)return;
 const formRevision=fixture.formRevision,formalRequestId='formal-'+crypto.randomUUID();fixture.formalCount++;
 emit('formal-submitting',{formRevision,formalRequestId});
 // 合成サーバー結果。実認証済みactorや実GASの受付ではない。
 const raw=JSON.stringify({serverActor:'synthetic-actor',route:fixture.headers.route,archiveSha256:fixture.headers.archiveSha256,title:document.querySelector('#title').value,consent:true});
 const submissionFingerprint=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(raw))),n=>n.toString(16).padStart(2,'0')).join('');
 const htmlSubmissionReceipt={status:'accepted',formalRequestId,attemptId:'attempt-'+crypto.randomUUID(),archiveSha256:fixture.headers.archiveSha256,submissionFingerprint,submittedAt:'2026-11-17T03:00:00.000Z'};
 fixture.serverReceipt=htmlSubmissionReceipt;fixture.last={formRevision,htmlSubmissionReceipt};emit('formal-receipt',fixture.last);
});
</script>`;
const shell=`<!doctype html><meta charset="utf-8"><title>受渡し契約だけの合成ホスト</title><script src="/final-transfer.js"></script><script src="/final-pending.js"></script><iframe id="bridge" src="https://fm2.example.test/confirm"></iframe><iframe id="sibling" src="https://fm2.example.test/confirm"></iframe>`;
const server=createServer(async(req,res)=>{
 try{if(req.url==='/'){res.writeHead(200,{'Content-Type':'text/html'}).end(shell);return;}
  const name=req.url.slice(1);if(!['final-transfer.js','final-pending.js'].includes(name))throw Error();
  res.writeHead(200,{'Content-Type':'text/javascript'}).end(await readFile(join(root,name)));
 }catch{res.writeHead(404).end();}
});
await new Promise((done,reject)=>{server.once('error',reject);server.listen(0,'127.0.0.1',done);});
const origin='http://127.0.0.1:'+server.address().port;
const browser=engine==='webkit'?await webkit.launch():await chromium.launch({executablePath:'/Applications/Google Chrome.app/Contents/MacOS/Google Chrome'});
const context=await browser.newContext(),report={engine,checks:[],errors:[],externalRequests:[],actualGas:false,actualActor:false};
await context.route('**/*',route=>{
 const u=new URL(route.request().url());if(u.origin===origin)return route.continue();
 if(u.origin==='https://fm2.example.test')return route.fulfill({contentType:'text/html',body:fixture});
 report.externalRequests.push(u.origin);return route.abort();
});
const page=await context.newPage();page.on('pageerror',e=>report.errors.push(e.message));
const ok=name=>{report.checks.push(name);console.log(name);};
try{
 await page.goto(origin);await page.frameLocator('#bridge').locator('#formal').waitFor();
 const blob=await Project.pack([{path:'index.html',raw:new TextEncoder().encode('<!doctype html><html><body>合成作品</body></html>')}]);
 const bytes=[...new Uint8Array(await blob.arrayBuffer())];
 await page.evaluate(async bytes=>{
  const snapshot={blob:new Blob([new Uint8Array(bytes)],{type:'application/zip'}),name:'HTML最終課題.zip',sha256:await HtmlFinalTransfer.digest(new Uint8Array(bytes))};
  const context={actorBinding:'synthetic-actor-binding-A',route:{bookId:'synthetic-book',pid:'final',itemId:'zip'}};
  const pending=HtmlFinalPending.create(indexedDB),saved=await pending.reserve(context,snapshot);
  window.testState={snapshot,context,pending,saved,events:[],isCurrent:true};
  const config={enabled:true,contractAgreed:true,contract:HtmlFinalTransfer.CONTRACT,frameUrl:'https://fm2.example.test/confirm',origin:'https://fm2.example.test'};
  const options={config,frame:document.querySelector('#bridge'),snapshot,context,transferRequestId:saved.transferRequestId,isCurrent:()=>testState.isCurrent,onState:(state,value)=>testState.events.push({state,value})};
  testState.options=options;testState.adapter=HtmlFinalTransfer.create(options);testState.adapter.connect();
 },bytes);
 await page.waitForFunction(()=>testState.adapter.state==='ready');
 assert.equal(await page.frameLocator('#bridge').locator('#formal').isDisabled(),true);
 assert.equal(await page.evaluate(()=>testState.adapter.receipt),null);
 await page.evaluate(()=>testState.adapter.sendArchive());await page.waitForFunction(()=>testState.adapter.state==='confirming');
 assert.equal(await page.frameLocator('#bridge').locator('#formal').evaluate(()=>fixture.formalCount),0);
 ok('実Windowのhello/readyではZIPを送らず、明示送信・受渡し完了でも正式提出を呼ばない');
 const main=page.frames().find(f=>f.url()==='https://fm2.example.test/confirm');
 const sibling=page.frames().filter(f=>f.url()==='https://fm2.example.test/confirm')[1];
 const headers=await main.evaluate(()=>fixture.headers);
 await sibling.evaluate(({headers,origin})=>{parent.postMessage({...headers,operation:'formal-submitting',formRevision:1,formalRequestId:'sibling-formal'},origin);},{headers,origin});
 await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>testState.adapter.formalReference),null);
 ok('同じoriginの別iframeから届く形式の合う通知も採用しない');
 await page.frameLocator('#bridge').locator('#title').fill('作品タイトル');await page.frameLocator('#bridge').locator('#consent').check();
 await page.frameLocator('#bridge').locator('#formal').click();await page.waitForFunction(()=>testState.adapter.state==='accepted');
 assert.equal(await page.evaluate(()=>testState.adapter.publication),null);
 await main.evaluate(()=>publish('pending',1));await page.waitForFunction(()=>testState.adapter.publication?.status==='pending');
 await main.evaluate(()=>publish('published',2));await page.waitForFunction(()=>testState.adapter.publication?.status==='published');
 await page.evaluate(async()=>{testState.saved=await testState.pending.rememberFormal(testState.saved.key,testState.context,testState.saved.transferRequestId,testState.adapter.formalReference);});
 ok('fm2合成UIの必須回答・同意・最終ボタンの後だけ正式結果を受け、公開待ち/公開済みを別表示');
 const serverReceipt=await main.evaluate(()=>fixture.serverReceipt);
 await page.frameLocator('#bridge').locator('#title').fill('変更した作品タイトル');await page.waitForFunction(()=>testState.adapter.receipt===null);
 await main.evaluate(()=>replay());await page.waitForTimeout(40);assert.equal(await page.evaluate(()=>testState.adapter.receipt),null);
 ok('フォーム変更後の遅延receiptは、現在の編集内容の成功へ戻さない');
 await page.evaluate(()=>testState.adapter.dispose());
 await page.evaluate(async()=>{
  const recovered=await testState.pending.recover(testState.saved.key,testState.context);
  if(recovered.receiptVerified!==false)throw Error('IDB is not a receipt');
  testState.adapter=HtmlFinalTransfer.create({...testState.options,recovery:recovered.references[0]});testState.adapter.connect();
 });
 await page.waitForFunction(()=>testState.adapter.state==='ready');assert.equal(await page.evaluate(()=>testState.adapter.sendArchive()),false);
 await main.evaluate(value=>{fixture.serverReceipt=value;},serverReceipt);await page.evaluate(()=>testState.adapter.check());
 await page.waitForFunction(()=>testState.adapter.state==='historical');assert.equal(await page.evaluate(()=>testState.adapter.receipt),null);
 assert.equal(await main.evaluate(()=>fixture.zipCount),1);
 ok('実IndexedDBの回復も照会専用でZIPを再送せず、一致した過去受付を現在成功にしない');
 assert.deepEqual(report.errors,[]);assert.deepEqual(report.externalRequests,[]);
}finally{
 await writeFile(join(evidence,'report.json'),JSON.stringify(report,null,2)+'\n');
 await context.close();await browser.close();await new Promise(resolve=>server.close(resolve));
}
