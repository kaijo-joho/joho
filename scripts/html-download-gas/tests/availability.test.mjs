import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import crypto from 'node:crypto';
const server=fs.readFileSync(new URL('../48_html_download_availability.js',import.meta.url),'utf8');
const protocol=fs.readFileSync(new URL('../../../tools/htmleditor/local-protocol.js',import.meta.url),'utf8');
const targets=JSON.parse(fs.readFileSync(new URL('../../../data/html-practice-templates-v3.json',import.meta.url),'utf8')).templates.map(t=>t.assignmentId);
function setup(){
 let now=Date.parse('2026-10-20T00:00:00.000Z'),current='synthetic-student@gfe.kaijo.ed.jp',reads=0;
 const actor={email:current,grade:3},start='2026-10-20T00:00:00.000Z';
 const input={config:{enabled:true,distributionEnabled:true},
  distributions:[{id:'html14-01',status:'active',release:true,g1:false,g2:false,g3:'TASK',g4:false,g5:false,g6:false,distributionMode:'personal-html-v2',submitBackend:'grade'}],
  tasks:[{year:2026,grade:3,item:'html',targetId:'html14-01',status:'active',startAt:start}]};
 const box=vm.createContext({HtmlPracticeCatalog:{targets},Date});
 vm.runInContext(protocol+'\n'+server,box);
 const codec={encode:s=>Buffer.from(s).toString('base64url'),decode:s=>Buffer.from(s,'base64url').toString(),hash:s=>crypto.createHash('sha256').update(s).digest('hex')};
 const identityEnv={config:()=>({enabled:true,activeKeyId:'test-key',allowedKeyIds:['test-key'],epoch:1,lifetimeMs:90*86400000,revokedProofIds:[]}),
  now:()=>now,currentEmail:()=>current,readRoster:()=>[['userId','年'],[actor.email,3],['other@gfe.kaijo.ed.jp',3],['informatics@gfe.kaijo.ed.jp',3]],codec,
  key:()=> 'k'.repeat(43),hmac:(s,k)=>crypto.createHmac('sha256',k).update(s).digest('base64url'),randomId:()=> 'a'.repeat(32)};
 const token=box.HtmlLocalProtocol.issueIdentity(identityEnv).token;
 const request={bridge:'b'.repeat(48),nonce:'c'.repeat(32),identity:token,targetId:'html14-01'};
 const env={verify:t=>box.HtmlLocalProtocol.verifyIdentity(t,identityEnv),read:()=>{reads++;return input;},
  now:()=>new Date(now).toISOString(),teacher:()=>false,maintenance:()=>false};
 return {api:box.HtmlDownloadAvailability,box,input,env,request,actor,start,identityEnv,
  context:()=>({actor,targetId:request.targetId,now:env.now(),teacherPreview:false,maintenanceBlocked:false}),
  decision:extra=>box.HtmlDownloadAvailability.assess(input,{actor,targetId:request.targetId,now:env.now(),teacherPreview:false,maintenanceBlocked:false,...extra}),
  check:()=>box.HtmlDownloadAvailability.check(request,env),setNow:v=>now=Date.parse(v),setEmail:v=>current=v,reads:()=>reads};
}
test('開始1ms前は不可、開始時刻ちょうどから可。提出用のフラグ・期限は関係しない',()=>{
 const h=setup();h.setNow('2026-10-19T23:59:59.999Z');
 assert.equal(h.decision().reason,'before_start');assert.equal(h.decision().startAt,h.start);
 h.setNow(h.start);assert.equal(h.decision().allowed,true);
 h.input.tasks[0].standardDueAt='2026-10-19T00:00:00.000Z';h.input.tasks[0].finalDueAt='2026-10-19T01:00:00.000Z';h.input.tasks[0].gradingMode='closed';
 h.input.policies=[{intakeEnabled:false}];assert.equal(h.decision().allowed,true);
});
test('同じ要求を呼んでも毎回読み、開始日時の変更を次の取得へ反映する',()=>{
 const h=setup();assert.equal(h.check().result.allowed,true);assert.equal(h.reads(),1);
 h.input.tasks[0].startAt='2026-10-21T00:00:00.000Z';assert.equal(h.check().result.reason,'before_start');assert.equal(h.reads(),2);
 h.input.tasks[0].startAt=h.start;assert.equal(h.check().result.allowed,true);assert.equal(h.reads(),3);
});
for(const [name,change,reason] of [
 ['課題下書き',h=>h.input.tasks[0].status='draft','task_closed'],
 ['課題停止',h=>h.input.tasks[0].status='closed','task_closed'],
 ['配付停止',h=>h.input.distributions[0].status='inactive','not_released'],
 ['リンク停止',h=>h.input.distributions[0].release=false,'not_released'],
 ['対象外学年',h=>h.input.distributions[0].g3=false,'not_released'],
 ['対象課題なし',h=>h.input.tasks=[],'not_configured'],
 ['年度違い',h=>h.input.tasks[0].year=2027,'not_configured'],
 ['学年違い',h=>h.input.tasks[0].grade=4,'not_configured'],
 ['item違い',h=>h.input.tasks[0].item='py','not_configured'],
 ['課題重複',h=>h.input.tasks.push({...h.input.tasks[0]}),'not_configured'],
 ['配付行重複',h=>h.input.distributions.push({...h.input.distributions[0]}),'availability_unavailable'],
 ['startAt空欄',h=>h.input.tasks[0].startAt='','availability_unavailable'],
 ['曖昧な日時',h=>h.input.tasks[0].startAt='2026/10/20','availability_unavailable'],
 ['開始日時の年度違い',h=>h.input.tasks[0].startAt='2027-04-01T00:00:00.000Z','availability_unavailable'],
 ['配付制御の数式',h=>h.input.distributions[0]._formulaKeys=['release'],'availability_unavailable'],
 ['開始日時の数式',h=>h.input.tasks[0]._formulaKeys=['startAt'],'availability_unavailable'],
 ['全体停止',h=>h.input.config.enabled=false,'distribution_disabled'],
 ['配付全体停止',h=>h.input.config.distributionEnabled=false,'distribution_disabled']
])test(name+'は新規取得だけを拒否',()=>{const h=setup();change(h);assert.equal(h.decision().reason,reason);});
test('practiceとSheetsのDate日時、説明欄だけの数式は受理',()=>{
 const h=setup();h.input.tasks[0].status='practice';h.input.tasks[0].startAt=new Date(h.start);
 h.input.distributions[0]._formulaKeys=['sourceType','questionDistributionUrl'];assert.equal(h.decision().allowed,true);
});
test('指定教員だけは既存の配付例外、他教員/生徒の自己申告では解除できない',()=>{
 const h=setup();h.input.tasks[0].status='draft';h.input.tasks[0].startAt='2026-12-01T00:00:00.000Z';h.input.distributions[0].release=false;h.input.config.distributionEnabled=false;
 assert.equal(h.decision({teacherPreview:true}).allowed,false);
 assert.equal(h.decision({teacherPreview:true,actor:{email:'informatics@gfe.kaijo.ed.jp',grade:3}}).allowed,true);
 assert.equal(h.decision({teacherPreview:true,actor:{email:'other@gfe.kaijo.ed.jp',grade:3}}).allowed,false);
 assert.equal(h.decision({teacherPreview:true,actor:{email:'informatics@gfe.kaijo.ed.jp',grade:3},maintenanceBlocked:true}).reason,'maintenance_blocked');
});
test('実際の署名・現在のGoogle本人が一致しないとGSSを読まず拒否する',()=>{
 const h=setup();assert.equal(h.check().nonce,h.request.nonce);h.setEmail('other@gfe.kaijo.ed.jp');
 assert.throws(h.check,/owner_mismatch/);assert.equal(h.reads(),1);
 h.setEmail('synthetic-student@gfe.kaijo.ed.jp');h.request.identity=h.request.identity.slice(0,-1)+'x';assert.throws(h.check,/proof_invalid/);assert.equal(h.reads(),1);
});
test('要求のtarget・nonce・identity・teacher追加などの不正値を拒否する',()=>{
 for(const extra of [{targetId:'py11'},{nonce:'x'},{bridge:'x'},{identity:'x'.repeat(16384)},{teacher:true}]){
  const h=setup();Object.assign(h.request,extra);assert.throws(h.check,/request_invalid/);assert.equal(h.reads(),0);
 }
});
test('返却は対象と可否だけ。メール・氏名・token・採点や保存先の情報を含めない',()=>{
 const h=setup(),reply=h.check();assert.deepEqual(Object.keys(reply).sort(),['nonce','result']);
 assert.deepEqual(Object.keys(reply.result).sort(),['allowed','targetId','v']);assert.doesNotMatch(JSON.stringify(reply),/@|token|sheet|grade|name/);
 assert.doesNotMatch(server,/DriveApp|LockService|CacheService|appendRow|setProperty|createFile|issueIdentity|Logger\.|console\./);
});
