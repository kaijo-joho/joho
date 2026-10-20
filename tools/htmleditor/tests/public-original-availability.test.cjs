const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const P=require('../local-protocol.js'),Public=require('../public-original.js');
const repo=path.resolve(__dirname,'../../..'),manifest=JSON.parse(fs.readFileSync(path.join(repo,Public.MANIFEST_PATH))),hash=s=>crypto.createHash('sha256').update(s).digest('hex');
function setup(authorize){
 const order=[],record=manifest.templates.find(t=>t.assignmentId==='html14-01'),source=fs.readFileSync(path.join(repo,record.sourcePath),'utf8');
 const codec={encode:s=>Buffer.from(s).toString('base64url'),decode:s=>Buffer.from(s,'base64url').toString(),hash};
 let token=P.issueIdentity({codec,config:()=>({enabled:true,activeKeyId:'demo-key',allowedKeyIds:['demo-key'],epoch:1,lifetimeMs:90*86400000,revokedProofIds:[]}),
  now:()=>1e12,currentEmail:()=> 'example@gfe.kaijo.ed.jp',readRoster:()=>[['userId','年'],['example@gfe.kaijo.ed.jp',3]],key:()=> 'k'.repeat(43),
  hmac:(s,k)=>crypto.createHmac('sha256',k).update(s).digest('base64url'),randomId:()=> 'a'.repeat(32)}).token;
 const cache={identityForGeneration:async()=>({token,label:'example'})};
 const provider=Public.create({origin:P.ORIGIN,codec,sha256:async s=>hash(s),randomId:()=> 'b'.repeat(32),authorize,
  fetch:async(url,options)=>{order.push({url,options});const text=url.endsWith(Public.MANIFEST_PATH)?JSON.stringify(manifest):source;return {ok:true,url,headers:new Headers(),body:new Response(text).body};}});
 return {provider,cache,order,source,record,token,setToken:v=>token=v};
}
test('毎回の可否確認が成功したあとだけ原本を取得し、従来v3形式で生成する',async()=>{
 let checks=0,h;h=setup(async q=>{checks++;assert.equal(h.order.length,checks*2-1);assert.equal(q.identity,h.token);assert.equal(q.targetId,'html14-01');return {v:1,targetId:q.targetId,allowed:true};});
 for(let i=0;i<2;i++){
  const result=await h.provider.generateFresh('html14-01',h.cache);const parsed=P.parseLocal(result.html,{encode:s=>Buffer.from(s).toString('base64url'),decode:s=>Buffer.from(s,'base64url').toString()});
  assert.equal(parsed.source,h.source);assert.equal(parsed.envelope.identity,h.token);assert.equal(parsed.envelope.templateSha256,h.record.templateSha256);
 }
 assert.equal(checks,2);assert(h.order.every(r=>r.options.cache==='no-store'&&r.options.credentials==='omit'));
});
test('開始前・照会失敗・不正応答・可否機能の欠落は原本取得と生成を行わない',async()=>{
 for(const authorize of [undefined,async()=>({v:1,targetId:'html14-01',allowed:false,reason:'before_start',startAt:'2026-12-01T00:00:00.000Z'}),
  async()=>{throw Error('network unavailable');},async()=>({v:1,targetId:'html13-01',allowed:true}),async()=>({v:1,targetId:'html14-01',allowed:true,extra:true})]){
  const h=setup(authorize);await assert.rejects(h.provider.generateFresh('html14-01',h.cache));assert(h.order.length<=1);
 }
});
test('開始可否の応答待ちで閉じた画面・本人情報変更は保存用の候補を生成しない',async()=>{
 const controller=new AbortController(),h=setup(async q=>{controller.abort();return {v:1,targetId:q.targetId,allowed:true};});
 await assert.rejects(h.provider.generateFresh('html14-01',h.cache,controller.signal),{name:'AbortError'});assert.equal(h.order.length,1);
 const other=setup(async q=>{other.setToken('changed');return {v:1,targetId:q.targetId,allowed:true};});
 await assert.rejects(other.provider.generateFresh('html14-01',other.cache),/identity_changed/);
});
