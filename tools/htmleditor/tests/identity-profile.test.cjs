const test=require('node:test'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const P=require('../local-protocol.js'),Cache=require('../identity-cache.js');
const codec={encode:s=>Buffer.from(s).toString('base64url'),decode:s=>Buffer.from(s,'base64url').toString('utf8'),hash:s=>crypto.createHash('sha256').update(s).digest('hex')};
function token(overrides={}){
 const payload={v:3,kind:'identity',issuer:'kaijo-html',audience:P.ORIGIN,identityId:'A'.repeat(43),proofId:'a'.repeat(32),issuedAt:100,expiresAt:2000,keyId:'synthetic',epoch:1,...overrides};
 return codec.encode(P.canonical(payload))+'.'+'S'.repeat(43);
}
function fixture(){
 let state={revision:0,identity:null},profile=null,now=500;
 const storage={read:async()=>structuredClone(state),readDisplayProfile:async()=>structuredClone(profile),compareAndSwap:async(revision,next,extra)=>{
  if(state.revision!==revision)return false;state=structuredClone(next);profile=extra?structuredClone(extra):null;return true;
 }};
 const create=()=>Cache.create({origin:P.ORIGIN,secure:true,codec,storage,now:()=>now,randomId:()=>crypto.randomBytes(16).toString('hex')});
 const cache=create();
 const confirm=async(response={},options={})=>{const ticket=await cache.beginConfirmation(options);return cache.acceptConfirmation(ticket,{nonce:ticket.nonce,label:'synthetic',token:token(),...response});};
 return {storage,cache,create,confirm,get state(){return state;},get profile(){return profile;},set profile(p){profile=p;},set state(s){state=s;},set now(n){now=n;}};
}
test('氏名は別レコードへ保存。旧 identity schema と生成する実習HTMLに入れない',async()=>{
 const f=fixture();await f.confirm({displayName:'検証 太郎'});
 assert.deepEqual(Object.keys(f.state).sort(),['identity','revision']);assert.deepEqual(Object.keys(f.state.identity).sort(),['label','token']);
 assert.equal(f.profile.displayName,'検証 太郎');assert.equal(f.profile.token,f.state.identity.token);assert.equal(f.profile.revision,f.state.revision);
 assert.equal((await f.create().load()).displayName,'検証 太郎');
 const identity=await f.cache.identityForGeneration();assert.deepEqual(Object.keys(identity).sort(),['label','token']);
 const source='<html><body>synthetic</body></html>',template={assignmentId:'html12-01',fileName:'html12-01.html',templateVersion:'test',templateSha256:codec.hash(source),source,editableRegions:['document']};
 const html=P.generate(identity.token,template,'b'.repeat(32),codec);
 assert.equal(P.parseLocal(html,codec).source,source);
 assert.doesNotMatch(codec.decode(identity.token.split('.')[0]),/displayName|label|検証/);
 assert.doesNotMatch(codec.decode(html.match(/v3:([^ ]+)/)[1]),/displayName|label|検証/);
});
test('旧サーバー応答・旧キャッシュはIDで利用でき、氏名を強制取得しない',async()=>{
 const f=fixture();await f.confirm();assert.equal((await f.cache.load()).displayName,'');assert.equal(f.profile,null);
 f.state={revision:4,identity:{label:'synthetic',token:token()}};
 const state=await f.create().load();assert.equal(state.status,'ready');assert.equal(state.label,'synthetic');assert.equal(state.displayName,'');
});
test('氏名はproof・revisionへ拘束。旧タブ・切替・破損・保存障害から別人の名前を表示しない',async()=>{
 const f=fixture();await f.confirm({displayName:'検証 太郎'});const original=structuredClone(f.profile);
 f.profile={...original,token:token({proofId:'b'.repeat(32)})};assert.equal((await f.cache.load()).displayName,'');
 f.profile={...original,revision:0};assert.equal((await f.cache.load()).displayName,'');
 f.profile={...original,displayName:'<script>'};assert.equal((await f.cache.load()).displayName,'');
 f.profile=original;f.state={revision:2,identity:{label:'synthetic2',token:token({identityId:'B'.repeat(43)})}};assert.equal((await f.cache.load()).displayName,'');
 f.storage.readDisplayProfile=async()=>{throw Error('storage');};assert.equal((await f.cache.load()).status,'ready');
});
test('取消・遅延応答・CAS失敗では氏名を変更しない',async()=>{
 const f=fixture();await f.confirm({displayName:'検証 太郎'});const before=structuredClone(f.profile);
 const ticket=await f.cache.beginConfirmation({switchAccount:true,safeToSwitch:true});f.cache.cancelConfirmation();
 await assert.rejects(f.cache.acceptConfirmation(ticket,{nonce:ticket.nonce,label:'synthetic2',token:token({identityId:'B'.repeat(43)}),displayName:'検証 花子'}),/confirmation_stale/);
 assert.deepEqual(f.profile,before);
 const other=await f.cache.beginConfirmation({switchAccount:true,safeToSwitch:true});f.storage.compareAndSwap=async()=>false;
 await assert.rejects(f.cache.acceptConfirmation(other,{nonce:other.nonce,label:'synthetic2',token:token({identityId:'B'.repeat(43)}),displayName:'検証 花子'}),/cache_changed/);assert.deepEqual(f.profile,before);
});
test('明示切替だけ名前を更新。期限切れ・forgetで以前の氏名を確認済みとしない',async()=>{
 const f=fixture();await f.confirm({displayName:'検証 太郎'});
 await f.confirm({label:'synthetic2',token:token({identityId:'B'.repeat(43)}),displayName:'検証 花子'},{switchAccount:true,safeToSwitch:true});
 assert.equal((await f.cache.load()).displayName,'検証 花子');f.now=2000;assert.equal((await f.cache.load()).displayName,'');assert.equal((await f.cache.load()).status,'expired');
 await f.cache.forget({confirmed:true,safeToSwitch:true});assert.equal(f.profile,null);assert.equal(f.state.identity,null);
});
for(const name of ['<img>', 'x\ny', 'x'.repeat(101), '\u202eevil', ' bad ', 1])test('不正な表示用氏名を保存しない '+JSON.stringify(name),async()=>{
 const f=fixture();await assert.rejects(f.confirm({displayName:name}),/confirmation_invalid/);assert.equal(f.state.identity,null);assert.equal(f.profile,null);
});
test('不一致警告は比較可能なv3の同一署名鍵だけ。鍵更新・v2・期限切れを別人と断定しない',async()=>{
 const f=fixture();await f.confirm();const state=await f.cache.load();
 const file=overrides=>'<!-- joho-html-local:v3:'+codec.encode(P.canonical({v:3,identity:token(overrides),assignmentId:'html12-01',fileName:'html12-01.html',templateVersion:'test',templateSha256:'a'.repeat(64),localFileId:'a'.repeat(32)}))+' -->\n<html><body>test</body></html>';
 assert.equal(Cache.compareFileIdentity(state,file({}),codec,500),'match');
 assert.equal(Cache.compareFileIdentity(state,file({identityId:'B'.repeat(43)}),codec,500),'mismatch');
 assert.equal(Cache.compareFileIdentity(state,file({identityId:'B'.repeat(43),keyId:'rotated'}),codec,500),'unknown');
 assert.equal(Cache.compareFileIdentity(state,file({expiresAt:500}),codec,500),'unknown');
 assert.equal(Cache.compareFileIdentity(state,file({}),codec,2000),'unknown');
 assert.equal(Cache.compareFileIdentity(state,'<!-- joho-issued-html:v2:legacy -->',codec,500),'unknown');
 assert.equal(Cache.compareFileIdentity(null,file({}),codec,500),'unknown');
});
test('IndexedDB v1 の別キーへ同じCAS transactionで保存・削除し、旧形式 current を維持',async()=>{
 const records=new Map(),transactions=[];let version;
 const db={objectStoreNames:{contains:()=>true},close(){},transaction(store,mode){
  const tx={objectStore(){return {get(key){const request={};queueMicrotask(()=>{request.result=records.get(key);request.onsuccess();queueMicrotask(()=>tx.oncomplete());});return request;},put(value,key){records.set(key,structuredClone(value));transactions.at(-1).push(['put',key]);},delete(key){records.delete(key);transactions.at(-1).push(['delete',key]);}};}};
  transactions.push([mode]);return tx;
 }};
 const indexedDB={open(name,v){version=v;const r={};queueMicrotask(()=>{r.result=db;r.onsuccess();});return r;}};
 const storage=Cache.indexedDBStorage(indexedDB),next={revision:1,identity:{label:'synthetic',token:token()}},profile={revision:1,token:token(),displayName:'検証 太郎'};
 assert.equal(await storage.compareAndSwap(0,next,profile),true);assert.equal(version,1);
 assert.deepEqual(transactions[0],['readwrite',['put','current'],['put','displayProfile']]);
 assert.deepEqual(await storage.read(),next);assert.deepEqual(await storage.readDisplayProfile(),profile);
 assert.equal(await storage.compareAndSwap(0,next,null),false);assert.deepEqual(records.get('displayProfile'),profile);
 assert.equal(await storage.compareAndSwap(1,{revision:2,identity:null},null),true);assert(!records.has('displayProfile'));storage.close();
});
