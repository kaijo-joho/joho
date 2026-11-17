const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash,webcrypto}=require('node:crypto');
const Transfer=require('../final-transfer.js');
const ID='10000000-0000-4000-8000-000000000001';
const HASH=bytes=>createHash('sha256').update(bytes).digest('hex');
const FP=HASH('all answers and server actor/route');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
test('現在のエディタは受渡しモジュールを読み込まず、実接続の全設定を無効のまま保つ',()=>{
 const fs=require('node:fs'),vm=require('node:vm'),path=require('node:path'),scope={};
 vm.runInNewContext(fs.readFileSync(path.join(__dirname,'../final-config.js'),'utf8'),scope);
 const transfer=scope.HTML_FINAL_PROJECT_CONFIG.transfer;
 assert.equal(transfer.enabled,false);assert.equal(transfer.contractAgreed,false);assert.equal(transfer.frameUrl,'');assert.equal(transfer.origin,'');assert.equal(transfer.route,null);
 const html=fs.readFileSync(path.join(__dirname,'../index.html'),'utf8');
 assert.doesNotMatch(html,/<script[^>]+src="(?:final-transfer|final-pending|final-project)\.js/);
});
function clock(){let serial=0;const jobs=new Map();return {setTimeout(fn){const id=++serial;jobs.set(id,fn);return id;},clearTimeout(id){jobs.delete(id);},expire(){for(const [id,fn]of [...jobs]){jobs.delete(id);fn();}},get size(){return jobs.size;}};}
function harness(overrides={}){
 const listeners=new Set(),sent=[],states=[],timers=clock();let current=true;
 const source={postMessage(data,origin){sent.push({data,origin});}},frame={contentWindow:source};
 const config={enabled:true,contractAgreed:true,contract:Transfer.CONTRACT,frameUrl:'https://fm2.example.test/confirm',origin:'https://fm2.example.test'};
 const context={route:{bookId:'book',pid:'htmlfin',itemId:'zip'},actorBinding:'actor-session-opaque-A'};
 const snapshot={blob:new Blob(['fixed zip']),sha256:HASH('fixed zip'),name:'HTML最終課題.zip'};
 const host={addEventListener(type,fn){assert.equal(type,'message');listeners.add(fn);},removeEventListener(type,fn){listeners.delete(fn);}};
 const adapter=Transfer.create({config,context,snapshot,transferRequestId:ID,frame,host,timers,isCurrent:()=>current,onState:(...v)=>states.push(v),...overrides});
 const message=(operation,more={},event={})=>{
  const first=sent[0]?.data;
  const data={contract:Transfer.CONTRACT,operation,nonce:first?.nonce,transferRequestId:adapter.transferRequestId,route:context.route,actorBinding:context.actorBinding,archiveSha256:snapshot.sha256,...more};
  for(const fn of listeners)fn({source,origin:config.origin,data,...event});
 };
 const receipt=(more={})=>({status:'accepted',formalRequestId:'formal-1',attemptId:'attempt-1',archiveSha256:snapshot.sha256,submissionFingerprint:FP,submittedAt:'2026-11-17T03:00:00.000Z',...more});
 const start=()=>{adapter.connect();message('ready',{formRevision:1});};
 const stage=async()=>{start();assert(await adapter.sendArchive());message('archive-staged',{formRevision:1});};
 const submit=()=>message('formal-submitting',{formRevision:1,formalRequestId:'formal-1'});
 const accept=()=>message('formal-receipt',{formRevision:1,htmlSubmissionReceipt:receipt()});
 return {adapter,listeners,sent,states,timers,frame,source,config,context,snapshot,message,receipt,start,stage,submit,accept,setCurrent:value=>{current=value;}};
}
test('draft-2は明示有効化・合意版・当回の本人/作品/既知Windowを必須とし、draft-1のrequestIdを受けない',()=>{
 for(const config of [{},{enabled:true},{enabled:true,contractAgreed:true},{enabled:true,contractAgreed:true,contract:'html-editor.fm2-zip.draft-1'},{enabled:true,contractAgreed:true,contract:Transfer.CONTRACT,frameUrl:'http://fm2.example.test/',origin:'http://fm2.example.test'}])assert.throws(()=>harness({config}));
 for(const patch of [{requestId:ID},{transferRequestId:'formal'},{context:{route:{bookId:'book',pid:'p',itemId:'zip'},actorBinding:'email@example.test'}},{isCurrent:undefined},{isCurrent:()=>false},{frame:{contentWindow:null}},{timeoutMs:0}])assert.throws(()=>harness(patch));
});
test('hello/readyではZIPを送らず、明示sendArchiveの固定ZIP受渡しだけでは正式受付にならない',async()=>{
 const h=harness();try{
  h.start();assert.equal(h.adapter.state,'ready');assert.equal(h.sent.length,1);
  assert(await h.adapter.sendArchive());assert.equal(h.sent[1].data.operation,'prepare');assert.equal(Buffer.from(h.sent[1].data.archive.bytes).toString(),'fixed zip');
  h.message('archive-staged',{formRevision:1});assert.equal(h.adapter.state,'confirming');assert.equal(h.adapter.receipt,null);
  h.message('submit',{});h.message('ready',{formRevision:1});assert.equal(await h.adapter.sendArchive(),false);assert.deepEqual(h.sent.map(v=>v.data.operation),['hello','prepare']);
 }finally{h.adapter.dispose();}
});
test('origin/Window/nonce/transfer ID/hash/版/未知キーの不一致を受けず、ワイルドカードへ送らない',()=>{
 for(const [more,event]of [[{}, {origin:'https://other.test'}],[{}, {source:{}}],[{nonce:'wrong'},{}],[{transferRequestId:'20000000-0000-4000-8000-000000000002'},{}],[{archiveSha256:'b'.repeat(64)},{}],[{contract:'html-editor.fm2-zip.draft-1'},{}],[{extra:true},{}]]){
  const h=harness();try{h.adapter.connect();h.message('ready',{formRevision:1,...more},event);assert.equal(h.adapter.state,'connecting');assert.equal(h.sent.length,1);assert.equal(h.sent[0].origin,'https://fm2.example.test');}finally{h.adapter.dispose();}
 }
});
test('相関した既知画面で本人/routeが変わると停止し、過去の結果も再利用しない',async()=>{
 for(const patch of [{actorBinding:'actor-session-opaque-B'},{route:{bookId:'other',pid:'htmlfin',itemId:'zip'}},{route:{bookId:'book',pid:'htmlfin'}}]){
  const h=harness();try{await h.stage();h.submit();h.accept();assert(h.adapter.receipt);h.message('ready',{formRevision:1,...patch});assert.equal(h.adapter.state,'blocked');assert.equal(h.adapter.receipt,null);h.accept();assert.equal(h.adapter.receipt,null);}finally{h.adapter.dispose();}
 }
});
test('ZIPの実bytesとhashを照合し、改変・偽のsizeではZIPを渡さない',async()=>{
 const h=harness({snapshot:{blob:new Blob(['changed zip']),sha256:HASH('fixed zip'),name:'work.zip'}});try{h.start();assert.equal(await h.adapter.sendArchive(),false);assert.equal(h.adapter.state,'unknown');assert.equal(h.sent.length,1);}finally{h.adapter.dispose();}
});
test('時間切れのunknownで自動再送・新ID採番をせず、旧retry APIも用意しない',async()=>{
 const h=harness();try{h.adapter.connect();h.timers.expire();assert.equal(h.adapter.state,'unknown');h.message('ready',{formRevision:1});assert.equal(await h.adapter.sendArchive(),false);assert.equal(h.adapter.check(),false);h.timers.expire();assert.equal(h.sent.length,1);assert.equal(h.adapter.transferRequestId,ID);assert.equal(h.adapter.retry,undefined);}finally{h.adapter.dispose();}
});
test('ZIP読取中の時間切れや編集変更では、遅れて返ったbytesも送らない',async()=>{
 for(const expire of [true,false]){
  let release;class Delayed extends Blob{arrayBuffer(){return new Promise(resolve=>{release=()=>super.arrayBuffer().then(resolve);});}}
  const h=harness({snapshot:{blob:new Delayed(['fixed zip']),sha256:HASH('fixed zip'),name:'work.zip'}});
  try{h.start();const pending=h.adapter.sendArchive();await tick();if(expire)h.timers.expire();else h.setCurrent(false);release();assert.equal(await pending,false);assert.equal(h.sent.length,1);assert.equal(h.adapter.receipt,null);}finally{h.adapter.dispose();}
 }
});
test('fm2の最終確認IDを受けた後の非ダミー正式結果だけをacceptedにし、公開状態を推測しない',async()=>{
 const h=harness();try{
  await h.stage();h.accept();assert.equal(h.adapter.receipt,null);h.submit();assert.equal(h.adapter.formalReference.formalRequestId,'formal-1');assert.notEqual(h.adapter.formalReference.formalRequestId,h.adapter.transferRequestId);
  h.accept();assert.equal(h.adapter.state,'accepted');assert.equal(h.adapter.receipt.attemptId,'attempt-1');assert.equal(h.adapter.publication,null);
  h.message('formal-receipt',{formRevision:1,htmlSubmissionReceipt:Object.fromEntries(Object.entries(h.receipt()).reverse())});assert.equal(h.adapter.state,'accepted');
 }finally{h.adapter.dispose();}
});
test('不正・旧形式・別の正式要求/ZIP・ダミーフラグ付き結果・不正日時をacceptedにしない',async()=>{
 const invalid=[{status:'stored'},{formalRequestId:'formal-other'},{formalRequestId:ID},{archiveSha256:'b'.repeat(64)},{submissionFingerprint:'bad'},{attemptId:''},{submittedAt:'2026-02-30T00:00:00Z'},{submittedAt:'2026-11-17T12:00:00+09:00'},{isAdminTestSubmission:true},{requestId:ID}];
 for(const patch of invalid){const h=harness();try{await h.stage();h.submit();h.message('formal-receipt',{formRevision:1,htmlSubmissionReceipt:h.receipt(patch)});assert.equal(h.adapter.receipt,null);assert.equal(h.adapter.state,'submitting');}finally{h.adapter.dispose();}}
});
test('同じ未変更フォームの遅延receiptはunknown後も確認でき、古いerrorは受付を取り消さない',async()=>{
 const h=harness();try{await h.stage();h.submit();h.timers.expire();assert.equal(h.adapter.state,'unknown');h.accept();assert.equal(h.adapter.state,'accepted');h.message('error',{code:'LATE_ERROR'});assert.equal(h.adapter.state,'accepted');assert(h.adapter.receipt);assert.equal(h.sent.filter(v=>v.data.operation==='prepare').length,1);}finally{h.adapter.dispose();}
});
test('フォーム変更で現在の受付を解除し、古い改訂/受付・同じ正式IDの流用を受けない',async()=>{
 const h=harness();try{
  await h.stage();h.submit();h.accept();h.message('form-changed',{formRevision:2});assert.equal(h.adapter.receipt,null);assert.equal(h.adapter.history.matchesCurrent,false);
  h.accept();assert.equal(h.adapter.receipt,null);h.message('formal-submitting',{formRevision:2,formalRequestId:'formal-1'});assert.equal(h.adapter.formalReference,null);
  h.message('formal-submitting',{formRevision:2,formalRequestId:'formal-2'});h.message('formal-receipt',{formRevision:2,htmlSubmissionReceipt:h.receipt()});assert.equal(h.adapter.receipt,null);
  h.message('formal-receipt',{formRevision:2,htmlSubmissionReceipt:h.receipt({formalRequestId:'formal-2',attemptId:'attempt-2',submissionFingerprint:HASH('new answers')})});assert.equal(h.adapter.receipt.attemptId,'attempt-2');
 }finally{h.adapter.dispose();}
});
test('同じフォームのunknownで別の正式IDを採番して通知されても引き継がない',async()=>{
 const h=harness();try{await h.stage();h.submit();h.timers.expire();h.message('formal-submitting',{formRevision:1,formalRequestId:'formal-new'});assert.equal(h.adapter.formalReference.formalRequestId,'formal-1');assert.equal(h.adapter.state,'unknown');}finally{h.adapter.dispose();}
});
test('編集中内容やWindowが変われば、getterと遅延receiptも安全側に停止する',async()=>{
 for(const kind of ['editor','window']){const h=harness();try{await h.stage();h.submit();if(kind==='editor')h.setCurrent(false);else h.frame.contentWindow={};h.accept();assert.equal(h.adapter.receipt,null);assert.equal(h.adapter.state,'blocked');h.setCurrent(true);assert.equal(h.adapter.receipt,null);}finally{h.adapter.dispose();}}
});
test('fingerprintなしの受付照会はZIPを再送せず、結果からfingerprintを拾って現在成功へ昇格しない',()=>{
 const h=harness({recovery:{formRevision:1,formalRequestId:'formal-1'}});try{
  h.start();assert(h.adapter.check());const sent=h.sent.at(-1).data;assert.equal(sent.operation,'status');assert.deepEqual(Object.keys(sent.query).sort(),['archiveSha256','bookId','formalRequestId','pid']);
  const result={ok:true,...h.receipt(),currentOfficial:true,matchesSubmittedContent:false};h.message('status-result',{checkSequence:sent.checkSequence,result});assert.equal(h.adapter.state,'historical');assert.equal(h.adapter.receipt,null);assert.equal(h.adapter.history.matchesCurrent,false);
  h.adapter.check();assert(!Object.hasOwn(h.sent.at(-1).data.query,'submissionFingerprint'));assert.equal(h.sent.filter(v=>v.data.operation==='prepare').length,0);
 }finally{h.adapter.dispose();}
});
test('fingerprint付きIDB照会で一致しても、当回フォームの正式確認を通らない過去receiptは現在成功にしない',()=>{
 const h=harness({recovery:{formRevision:1,formalRequestId:'formal-1',submissionFingerprint:FP}});try{h.start();h.adapter.check();h.message('status-result',{checkSequence:1,result:{ok:true,...h.receipt(),currentOfficial:true,matchesSubmittedContent:true}});assert.equal(h.adapter.state,'historical');assert.equal(h.adapter.receipt,null);assert.equal(h.adapter.history.matchesCurrent,false);}finally{h.adapter.dispose();}
});
test('IDBの受付識別子を使って再接続するアダプタはZIP再送を受け付けない',async()=>{
 const h=harness({recovery:{formRevision:1,formalRequestId:'formal-1'}});try{h.start();assert.equal(await h.adapter.sendArchive(),false);assert.equal(h.sent.length,1);assert(h.adapter.check());assert.equal(h.sent.at(-1).data.operation,'status');}finally{h.adapter.dispose();}
});
test('受付照会のunknown、fingerprint/現正式版不一致、遅い別照会を成功へ使わない',async()=>{
 const h=harness();try{
  await h.stage();h.submit();h.timers.expire();h.adapter.check();h.message('status-result',{checkSequence:1,result:{ok:true,status:'unknown',formalRequestId:'formal-1'}});assert.equal(h.adapter.state,'unknown');assert.equal(h.sent.filter(v=>v.data.operation==='prepare').length,1);
  h.accept();h.adapter.check();h.adapter.check();h.message('status-result',{checkSequence:2,result:{ok:true,...h.receipt(),currentOfficial:false,matchesSubmittedContent:true}});assert.equal(h.adapter.state,'accepted');
  h.message('status-result',{checkSequence:3,result:{ok:true,...h.receipt({submissionFingerprint:HASH('different')}),currentOfficial:true,matchesSubmittedContent:true}});assert.equal(h.adapter.state,'accepted');
  h.message('status-result',{checkSequence:3,result:{ok:true,...h.receipt(),currentOfficial:false,matchesSubmittedContent:true}});assert.equal(h.adapter.state,'historical');assert.equal(h.adapter.receipt,null);
 }finally{h.adapter.dispose();}
});
test('fingerprintなし照会のmatches=trueを拒否し、後続の正しい過去照会だけを表示する',()=>{
 const h=harness({recovery:{formRevision:1,formalRequestId:'formal-1'}});try{h.start();h.adapter.check();h.message('status-result',{checkSequence:1,result:{ok:true,...h.receipt(),currentOfficial:true,matchesSubmittedContent:true}});assert.equal(h.adapter.state,'checking');h.message('status-result',{checkSequence:1,result:{ok:true,...h.receipt(),currentOfficial:true,matchesSubmittedContent:false}});assert.equal(h.adapter.state,'historical');}finally{h.adapter.dispose();}
});
test('公開待ち/公開済み/失敗は受付と別で、正式ID・fingerprint・attempt・改訂を照合する',async()=>{
 const h=harness();try{
  await h.stage();h.submit();h.accept();
  const base={formRevision:1,formalRequestId:'formal-1',submissionFingerprint:FP,attemptId:'attempt-1',status:'pending',publicationRevision:1};
  for(const patch of [{formalRequestId:'other'},{submissionFingerprint:HASH('other')},{attemptId:'other'},{formRevision:2}]){h.message('publication',{...base,...patch});assert.equal(h.adapter.publication,null);}
  h.message('publication',base);assert.equal(h.adapter.publication.status,'pending');h.message('publication',{...base,status:'published',publicationRevision:2});assert.equal(h.adapter.publication.status,'published');h.message('publication',base);assert.equal(h.adapter.publication.status,'published');h.message('publication',{...base,status:'failed',publicationRevision:3});assert.equal(h.adapter.state,'accepted');assert(h.adapter.receipt);
 }finally{h.adapter.dispose();}
});
test('dispose後にlistener・タイマーを残さず、古い受付通知を使わない',async()=>{
 const h=harness();await h.stage();h.submit();h.adapter.dispose();h.accept();assert.equal(h.adapter.state,'disposed');assert.equal(h.adapter.receipt,null);assert.equal(h.listeners.size,0);assert.equal(h.timers.size,0);
});
