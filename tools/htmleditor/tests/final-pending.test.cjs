const test=require('node:test');
const assert=require('node:assert/strict');
const {createHash}=require('node:crypto');
const Pending=require('../final-pending.js');
const Transfer=require('../final-transfer.js');
const tick=()=>new Promise(resolve=>setTimeout(resolve,0));
const sha=value=>createHash('sha256').update(value).digest('hex');
const context={actorBinding:'actor-session-opaque-A',route:{bookId:'book',pid:'final',itemId:'zip'}};
const snapshot=(body='zip')=>({blob:new Blob([body]),sha256:sha(body),name:'HTML最終課題.zip'});
const reference={formRevision:1,formalRequestId:'formal-1'};
function fakeIDB(){
 const databases=new Map(),opened=[],transactions=[];let closed=0,writes=0;
 const api={opened,databases,transactions,blocked:false,failWrites:false,hang:false,
  get closed(){return closed;},get writes(){return writes;},
  open(name){
   const request={};opened.push(name);
   queueMicrotask(()=>{
    if(api.blocked){request.onblocked?.();return;}
    const fresh=!databases.has(name);if(fresh)databases.set(name,{rows:new Map(),queue:[],active:false});
    const database=databases.get(name);
    request.result={close(){closed++;},createObjectStore(){},transaction(_store,mode){
     const tx={};transactions.push(tx);let rows,pending=0,aborted=false,active=false,done=false;const waiting=[];
     function next(){database.active=false;queueMicrotask(()=>{const start=database.queue.shift();if(start)start();});}
     function abort(){if(done||aborted)return;aborted=true;queueMicrotask(()=>{tx.onabort?.();if(active)next();});}
     tx.abort=abort;
     function complete(){queueMicrotask(()=>{if(done||aborted||pending)return;done=true;if(mode==='readwrite')database.rows=rows;tx.oncomplete?.();next();});}
     function operation(run){
      const r={};pending++;
      const execute=()=>queueMicrotask(()=>{
       if(aborted)return;
       if(api.hang)return;
       try{r.result=structuredClone(run());r.onsuccess?.();}
       catch(error){aborted=true;r.error=error;r.onerror?.();tx.onerror?.();next();}
       pending--;if(!pending)complete();
      });
      if(active)execute();else waiting.push(execute);return r;
     }
     tx.objectStore=()=>({
      get:key=>operation(()=>rows.get(key)),count:()=>operation(()=>rows.size),
      add:value=>operation(()=>{if(api.failWrites||rows.has(value.key))throw Error('synthetic write failure');rows.set(value.key,structuredClone(value));writes++;}),
      put:value=>operation(()=>{if(api.failWrites)throw Error('synthetic write failure');rows.set(value.key,structuredClone(value));writes++;})
     });
     const start=()=>{if(aborted)return;database.active=true;active=true;rows=structuredClone(database.rows);for(const execute of waiting)execute();if(!pending)complete();};
     if(database.active)database.queue.push(start);else{database.active=true;queueMicrotask(start);}return tx;
    }};
    if(fresh)request.onupgradeneeded?.();request.onsuccess?.();
   });return request;
  }
 };return api;
}
function fixture(options={}){const db=fakeIDB();let ids=0;const cryptoApi={subtle:crypto.subtle,randomUUID(){ids++;return crypto.randomUUID();}};return {db,pending:Pending.create(db,{cryptoApi,...options}),get ids(){return ids;}};}

test('固定ZIPのreserveはtransfer IDだけを保持し、同じ本人/route/bytesを明示再準備してもIDを増やさない',async()=>{
 const h=fixture(),first=await h.pending.reserve(context,snapshot()),second=await h.pending.reserve(context,snapshot());
 assert(Transfer.uuid(first.transferRequestId));assert.equal(first.transferRequestId,second.transferRequestId);assert.equal(h.ids,1);
 assert.equal(await first.snapshot.blob.text(),'zip');assert.deepEqual(first.references,[]);assert.equal(first.receiptVerified,false);
 assert(!Object.hasOwn(first,'requestId'));assert(!Object.hasOwn(first,'receipt'));assert(h.db.opened.every(n=>n===Pending.DATABASE));
});
test('並行reserveはIDBの同じ記録を使い、異なるtransfer IDを二重発行しない',async()=>{
 const h=fixture(),[a,b]=await Promise.all([h.pending.reserve(context,snapshot()),h.pending.reserve(context,snapshot())]);
 assert.equal(a.transferRequestId,b.transferRequestId);assert.equal(h.ids,1);assert.equal(h.db.databases.get(Pending.DATABASE).rows.size,1);
});
test('unknownからのrecoverは既存ZIPと識別子だけを読取り、新ID・書込み・再送を発生させない',async()=>{
 const h=fixture(),saved=await h.pending.reserve(context,snapshot());const writes=h.db.writes,ids=h.ids;
 const recovered=await h.pending.recover(saved.key,context);assert.equal(recovered.transferRequestId,saved.transferRequestId);assert.equal(recovered.receiptVerified,false);
 assert.equal(h.db.writes,writes);assert.equal(h.ids,ids);assert.equal(h.db.closed,h.db.opened.length);
});
test('同じ記録の別actor・別routeでの復旧を拒否し、古いv1のrequestIdを正式証明に移行しない',async()=>{
 const h=fixture(),saved=await h.pending.reserve(context,snapshot());h.db.databases.set('joho.htmleditor.final-pending.v1',{rows:new Map([['legacy',{requestId:'old'}]])});
 for(const value of [{...context,actorBinding:'actor-session-opaque-B'},{...context,route:{...context.route,pid:'other'}}])await assert.rejects(h.pending.recover(saved.key,value));
 assert(h.db.opened.every(n=>n===Pending.DATABASE));assert(h.db.databases.get('joho.htmleditor.final-pending.v1').rows.has('legacy'));assert.equal(h.ids,1);
});
test('ZIP bytes、hash、transfer ID、未知の受付フラグの改変を復旧時に拒否する',async()=>{
 for(const alter of [r=>{r.bytes=new TextEncoder().encode('bad').buffer;},r=>{r.archiveSha256=sha('other');},r=>{r.transferRequestId='bad';},r=>{r.accepted=true;},r=>{r.context.actorBinding='actor-session-opaque-B';},r=>{r.references=[{...reference,submissionFingerprint:'bad'}];}]){
  const h=fixture(),saved=await h.pending.reserve(context,snapshot());const rows=h.db.databases.get(Pending.DATABASE).rows,record=rows.get(saved.key);alter(record);rows.set(saved.key,record);
  await assert.rejects(h.pending.recover(saved.key,context));await assert.rejects(h.pending.reserve(context,snapshot()));assert.equal(h.ids,1);
 }
});
test('保存前にもZIPの実hash・サイズ・当回のactor形式を確認し、不一致では記録しない',async()=>{
 const h=fixture();await assert.rejects(h.pending.reserve(context,{...snapshot(),sha256:sha('other')}));
 await assert.rejects(h.pending.reserve({...context,actorBinding:'student@example.test'},snapshot()));
 await assert.rejects(h.pending.reserve(context,{...snapshot(),blob:new Blob([new Uint8Array(10*1024*1024+1)])}));
 assert.equal(h.db.opened.length,0);assert.equal(h.ids,0);
});
test('正式IDとfingerprintは照会用識別子として追記し、保存だけでは受付済みにならない',async()=>{
 const h=fixture(),saved=await h.pending.reserve(context,snapshot());
 let recovered=await h.pending.rememberFormal(saved.key,context,saved.transferRequestId,reference);
 assert.deepEqual(recovered.references,[reference]);assert.equal(recovered.receiptVerified,false);
 const completed={...reference,submissionFingerprint:sha('all answers'),attemptId:'attempt-1',submittedAt:'2026-11-17T03:00:00.000Z'};
 recovered=await h.pending.rememberFormal(saved.key,context,saved.transferRequestId,completed);
 assert.deepEqual(recovered.references,[completed]);assert.equal(recovered.receiptVerified,false);assert.equal(h.ids,1);
});
test('同じformal IDの改訂・fingerprint・attemptの差替えや、照合値の削除は拒否して旧値を保持する',async()=>{
 const h=fixture(),saved=await h.pending.reserve(context,snapshot()),completed={...reference,submissionFingerprint:sha('answers'),attemptId:'attempt-1',submittedAt:'2026-11-17T03:00:00Z'};
 await h.pending.rememberFormal(saved.key,context,saved.transferRequestId,completed);
 for(const candidate of [{...completed,formRevision:2},{...completed,submissionFingerprint:sha('new answers')},{...completed,attemptId:'attempt-2'},reference])await assert.rejects(h.pending.rememberFormal(saved.key,context,saved.transferRequestId,candidate));
 assert.deepEqual((await h.pending.recover(saved.key,context)).references,[completed]);
});
test('同じZIPの別の全回答は別formal IDで保持し、transfer IDの流用や別transfer記録への紐付けは拒否する',async()=>{
 const h=fixture(),saved=await h.pending.reserve(context,snapshot());
 await h.pending.rememberFormal(saved.key,context,saved.transferRequestId,reference);
 await h.pending.rememberFormal(saved.key,context,saved.transferRequestId,{formRevision:2,formalRequestId:'formal-2'});
 await assert.rejects(h.pending.rememberFormal(saved.key,context,saved.transferRequestId,{...reference,formalRequestId:saved.transferRequestId}));
 await assert.rejects(h.pending.rememberFormal(saved.key,context,crypto.randomUUID(),reference));
 assert.equal((await h.pending.recover(saved.key,context)).references.length,2);
});
test('保存件数・受付識別子が上限でも過去記録を消さず、余分なIDも発行しない',async()=>{
 const h=fixture();let first;
 for(let i=0;i<10;i++){const saved=await h.pending.reserve(context,snapshot('zip-'+i));first ||= saved;}
 await assert.rejects(h.pending.reserve(context,snapshot('zip-10')),/上限/);assert.equal(h.ids,10);assert.equal(h.db.databases.get(Pending.DATABASE).rows.size,10);
 for(let i=0;i<10;i++)await h.pending.rememberFormal(first.key,context,first.transferRequestId,{formRevision:i+1,formalRequestId:'formal-'+i});
 await assert.rejects(h.pending.rememberFormal(first.key,context,first.transferRequestId,{formRevision:11,formalRequestId:'formal-10'}),/上限/);
 assert.equal((await h.pending.recover(first.key,context)).references.length,10);
});
test('IDBの拒否・blocked・書込失敗は成功にせず、既存のZIPは保持する',async()=>{
 await assert.rejects(Pending.create(null).reserve(context,snapshot()),/記憶領域/);
 const blocked=fixture();blocked.db.blocked=true;await assert.rejects(blocked.pending.reserve(context,snapshot()),/他のタブ/);
 const h=fixture(),saved=await h.pending.reserve(context,snapshot());h.db.failWrites=true;
 await assert.rejects(h.pending.rememberFormal(saved.key,context,saved.transferRequestId,reference));
 assert.deepEqual((await h.pending.recover(saved.key,context)).references,[]);
});
test('IDB取引の時間切れは中止し、回復を新しい予約へ置き換えない',async()=>{
 let serial=0;const jobs=new Map(),timers={setTimeout(fn){const id=++serial;jobs.set(id,fn);return id;},clearTimeout(id){jobs.delete(id);}};
 const h=fixture({timers}),saved=await h.pending.reserve(context,snapshot());h.db.hang=true;
 const recovery=h.pending.recover(saved.key,context);const rejected=assert.rejects(recovery,/時間切れ/);
 for(let i=0;i<30&&h.db.transactions.length<2;i++)await tick();
 for(const fn of [...jobs.values()])fn();await rejected;assert.equal(h.ids,1);assert.equal(h.db.databases.get(Pending.DATABASE).rows.size,1);
});
