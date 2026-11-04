// Actual captured GAS modules, synthetic in-memory data only. No network or Google writes.
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import crypto from 'node:crypto';

const directory=process.env.HTML_DIST_SOURCE_DIR;
assert(directory,'HTML_DIST_SOURCE_DIR must name the captured candidate');
const read=name=>fs.readFileSync(path.join(directory,name),'utf8');
const TANAKA='tanaka-yuuki@gfe.kaijo.ed.jp',INFO='informatics@gfe.kaijo.ed.jp';
const OTHER_TEACHER='hirata@gfe.kaijo.ed.jp',STUDENT='synthetic-student@gfe.kaijo.ed.jp';
const UNKNOWN='synthetic-unregistered@gfe.kaijo.ed.jp';
const files=['04_html_trial_policy.js','03_taskSettings.js','06_html_practice_catalog.js',
 '07_html_practice_bindings.js','16_html_practice_policy.js','46_html_practice_catalog_runtime.js',
 '90_html_local_protocol.js','91_html_identity_runtime.js','48_html_download_availability.js'];

function setup(email=STUDENT){
 let now=Date.parse('2026-11-05T00:00:00.000Z'),current=email,maintenance=false;
 class Clock extends Date {constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
 const config={schemaVersion:2,enabled:true,distributionEnabled:true,
  logSpreadsheetId:'synthetic-log-'.padEnd(25,'x'),storageFolderId:'synthetic-storage-'.padEnd(25,'x'),
  issuanceSpreadsheetId:'synthetic-issuance-'.padEnd(25,'x'),rubricManifestFileId:'synthetic-manifest-'.padEnd(25,'x'),
  rubricManifestSha256:'a'.repeat(64),manifestFolderId:'synthetic-manifest-folder-'.padEnd(30,'x'),
  rubricArchiveFolderId:'synthetic-archive-'.padEnd(25,'x'),
  distributionBaseUrl:'https://script.google.com/macros/s/SYNTHETIC_DIST/exec',
  gradeBaseUrl:'https://script.google.com/macros/s/SYNTHETIC_GRADE/exec',siteBaseUrl:'https://joho.kaijo.ed.jp/'};
 const identityConfig={enabled:true,activeKeyId:'synthetic-key',allowedKeyIds:['synthetic-key'],
  epoch:1,lifetimeMs:90*86400000,revokedProofIds:[]};
 const tables={
  生徒名簿:[['userId','年'],...[STUDENT,TANAKA,INFO,OTHER_TEACHER,UNKNOWN].map(e=>[e,3])],
  配布設定一覧:[['id','status','release','g1','g2','g3','g4','g5','g6','distributionMode','submitBackend'],
   ['html14-01','active',true,false,false,'TASK',false,false,false,'personal-html-v2','grade']]
 };
 const names=[],ranges=[],propertyReads=[];
 const teachers=[INFO,TANAKA,OTHER_TEACHER];
 const formulaCells=new Set();
 function sheet(name){
  assert(name in tables,'Unexpected sheet access: '+name);names.push(name);
  return {getSheetId:()=>12345,getLastRow:()=>tables[name].length,getLastColumn:()=>tables[name][0].length,
   getRange:(row,col,height,width)=>{ranges.push({name,row,col,height,width});return {
    getValues:()=>tables[name].slice(row-1,row-1+height).map(r=>r.slice(col-1,col-1+width)),
    getFormulas:()=>tables[name].slice(row-1,row-1+height).map((r,i)=>r.slice(col-1,col-1+width)
     .map((_,j)=>formulaCells.has([name,row+i,col+j].join(':'))?'=NOW()':''))
   };}};
 }
 const props={getProperty:key=>{propertyReads.push(key);switch(key){
  case 'HTML_ASSIGNMENT_CONFIG_V2':return JSON.stringify(config);
  case 'HTML_IDENTITY_CONFIG_V3':return JSON.stringify(identityConfig);
  case 'HTML_ISSUANCE_KEYS':return JSON.stringify({'synthetic-key':'k'.repeat(43)});
  default:assert.fail('Unexpected property access: '+key);
 }}};
 const common={SSID:{fileList:'synthetic-book',submitLog:config.logSpreadsheetId},TEACHERS:teachers};
 const box=vm.createContext({Date:Clock,Common:common,
  Session:{getActiveUser:()=>({getEmail:()=>current})},
  PropertiesService:{getScriptProperties:()=>props},
  SpreadsheetApp:{openById:id=>{assert.equal(id,'synthetic-book');return {getSheetByName:sheet};}},
  Utilities:{Charset:{UTF_8:'UTF-8'},DigestAlgorithm:{SHA_256:'SHA-256'},
   computeDigest:(_,s)=>Array.from(crypto.createHash('sha256').update(Buffer.from(s)).digest()),
   newBlob:s=>({getBytes:()=>Array.from(Buffer.from(s)),getDataAsString:()=>Buffer.from(s).toString()}),
   base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),
   computeHmacSha256Signature:(s,k)=>Array.from(crypto.createHmac('sha256',k).update(s).digest()),
   getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
  DistMaintenance:{shouldBlock:()=>maintenance}
 });
 for(const name of files)vm.runInContext(read(name),box,{filename:name});
 const headers=Array.from(box.DistTaskSettingsTable.headers);
 const guide=headers.map((_,i)=>({0:'課題設定ID',2:'年度',3:'学年',5:'課題種別',6:'課題対象ID',17:'採点方式'}[i]||''));
 const task={id:'synthetic-stable-task-id',status:'active',year:2026,grade:3,item:'html',targetId:'html14-01',
  startAt:new Clock('2026-11-20T00:00:00.000Z')};
 tables.新_課題設定=[headers,guide,headers.map(k=>task[k]??'')];
 const issued=box.HtmlLocalProtocol.issueIdentity(box.HtmlIdentityRuntime.env());
 names.length=0;ranges.length=0;propertyReads.length=0;
 const request={bridge:'b'.repeat(48),nonce:'c'.repeat(32),identity:issued.token,targetId:'html14-01'};
 const taskSet=(key,value)=>tables.新_課題設定[2][headers.indexOf(key)]=value;
 const distributionSet=(key,value)=>tables.配布設定一覧[1][tables.配布設定一覧[0].indexOf(key)]=value;
 return {box,request,issued,tables,names,ranges,propertyReads,teachers,config,identityConfig,common,formulaCells,taskSet,distributionSet,
  check:()=>box.HtmlDownloadAvailability.check(request),rpc:()=>box.getHtmlDownloadAvailabilityV3(request),
  setNow:value=>now=Date.parse(value),setEmail:value=>current=value,setMaintenance:value=>maintenance=value};
}

for(const email of [TANAKA,INFO]){
 test('指定教員は開始前でも、実署名・Google本人・既存教員定義の照合で取得可能: '+email,()=>{
  const h=setup(email);assert.equal(h.check().result.allowed,true);
  assert.deepEqual([...h.names].sort(),['新_課題設定','生徒名簿','配布設定一覧'].sort());
  assert(h.ranges.some(r=>r.name==='新_課題設定'&&r.height===3&&r.width===18));
  assert(!h.names.includes('課題設定'));
  assert.deepEqual(Object.keys(h.check().result).sort(),['allowed','targetId','v']);
 });
 test('指定教員の既存例外は下書き・配付停止にも適用される: '+email,()=>{
  const h=setup(email);h.config.enabled=false;h.config.distributionEnabled=false;
  h.distributionSet('status','draft');h.distributionSet('release',false);h.distributionSet('g3',false);h.taskSet('status','draft');
  assert.equal(h.check().result.allowed,true);
 });
 test('既存教員定義から対象を外すと、署名済みでも拒否する: '+email,()=>{
  const h=setup(email);h.common.TEACHERS=h.teachers.filter(e=>e!==email);
  assert.throws(h.check,/not_allowed/);assert.throws(h.rpc,/^Error: availability_unavailable$/);
 });
}
test('生徒は開始1ms前は拒否、ちょうど・開始後は正常取得できる',()=>{
 const h=setup();h.setNow('2026-11-19T23:59:59.999Z');assert.equal(h.check().result.reason,'before_start');
 h.setNow('2026-11-20T00:00:00.000Z');assert.equal(h.check().result.allowed,true);
 h.setNow('2026-11-20T00:00:00.001Z');assert.equal(h.check().result.allowed,true);
});
for(const email of [OTHER_TEACHER,UNKNOWN])test('他の登録教員/未登録教員には例外を広げない: '+email,()=>{
 const h=setup(email);assert.equal(h.check().result.reason,'before_start');
 h.setNow('2026-11-20T00:00:00.000Z');assert.equal(h.check().result.allowed,true);
});
for(const key of ['teacher','teacherPreview','actor'])test('RPCへの'+key+'追加では教員を偽装できない',()=>{
 const h=setup();h.request[key]=key==='actor'?{email:TANAKA,teacher:true}:true;
 assert.throws(h.check,/request_invalid/);assert.equal(h.names.length,0);assert.equal(h.propertyReads.length,0);
});
for(const [owner,current] of [[TANAKA,STUDENT],[STUDENT,TANAKA],[INFO,TANAKA]])test('別Google本人への切替では設定を読む前に拒否: '+owner+' -> '+current,()=>{
 const h=setup(owner);h.setEmail(current);assert.throws(h.check,/owner_mismatch/);
 assert.deepEqual(h.names,['生徒名簿']);
});
test('署名改変・期限切れ・明示失効は教員でも通過できない',()=>{
 const bad=setup(TANAKA);bad.request.identity=bad.request.identity.slice(0,-1)+(bad.request.identity.endsWith('x')?'y':'x');
 assert.throws(bad.check,/proof_invalid/);assert.equal(bad.names.length,0);
 const expired=setup(TANAKA);expired.setNow('2027-02-03T00:00:00.000Z');assert.throws(expired.check,/identity_expired/);
 const revoked=setup(TANAKA);revoked.identityConfig.revokedProofIds.push(revoked.issued.payload.proofId);assert.throws(revoked.check,/identity_revoked/);
});
test('名簿から削除・学年不正・学校外本人も教員例外にできない',()=>{
 const missing=setup(TANAKA);missing.tables.生徒名簿=missing.tables.生徒名簿.filter(r=>r[0]!==TANAKA);assert.throws(missing.check,/not_allowed/);
 const grade=setup(TANAKA);grade.tables.生徒名簿.find(r=>r[0]===TANAKA)[1]=0;assert.throws(grade.check,/not_allowed/);
 const external=setup(TANAKA);external.setEmail('synthetic@example.org');assert.throws(external.check,/not_allowed/);
});
for(const [name,change,reason] of [
 ['課題下書き',h=>h.taskSet('status','draft'),'task_closed'],
 ['受付対象外学年',h=>h.taskSet('grade',4),'not_configured'],
 ['別年度',h=>h.taskSet('year',2027),'not_configured'],
 ['別教材',h=>h.taskSet('item','py'),'not_configured'],
 ['別対象',h=>h.taskSet('targetId','html15-01'),'not_configured'],
 ['公開停止',h=>h.distributionSet('release',false),'not_released'],
 ['配付停止',h=>h.distributionSet('status','inactive'),'not_released'],
 ['学年TASKなし',h=>h.distributionSet('g3',false),'not_released'],
 ['全体無効',h=>h.config.enabled=false,'distribution_disabled'],
 ['配付全体無効',h=>h.config.distributionEnabled=false,'distribution_disabled'],
])test('開始後も生徒の制限を保持: '+name,()=>{
 const h=setup();h.setNow('2026-11-20T00:00:00.000Z');change(h);assert.equal(h.check().result.reason,reason);
});
for(const email of [TANAKA,INFO,STUDENT])test('保守停止は全員を拒否: '+email,()=>{
 const h=setup(email);h.setMaintenance(true);assert.equal(h.check().result.reason,'maintenance_blocked');
});
for(const [name,change] of [
 ['課題物理列順',h=>h.tables.新_課題設定[0].reverse()],
 ['課題案内行',h=>h.tables.新_課題設定[1][0]='invalid'],
 ['課題の重複',h=>h.tables.新_課題設定.push([...h.tables.新_課題設定[2]])],
 ['課題セルの数式',h=>h.formulaCells.add('新_課題設定:3:9')],
 ['課題表なし',h=>delete h.tables.新_課題設定],
])test('教員でも新版課題表の検証を維持: '+name,()=>{
 const h=setup(TANAKA);change(h);assert.throws(h.rpc,/availability_unavailable/);
});
for(const [name,change,reason] of [
 ['課題なし',h=>h.tables.新_課題設定.pop(),'not_configured'],
 ['年度違い',h=>h.taskSet('year',2027),'not_configured'],
 ['対象違い',h=>h.taskSet('targetId','html15-01'),'not_configured'],
 ['開始日時空欄',h=>h.taskSet('startAt',''),'availability_unavailable'],
 ['開始日時の年度違い',h=>h.taskSet('startAt','2027-04-01T00:00:00.000Z'),'availability_unavailable'],
 ['配付行重複',h=>h.tables.配布設定一覧.push([...h.tables.配布設定一覧[1]]),'availability_unavailable'],
 ['配付種別不正',h=>h.distributionSet('distributionMode','other'),'availability_unavailable'],
])test('教員も設定の存在・年度・対象・妥当性を保持: '+name,()=>{
 const h=setup(TANAKA);change(h);assert.equal(h.check().result.reason,reason);
});
test('停止中の提出受付を配付判定へ流用せず、提出データも読まない',()=>{
 const h=setup();h.setNow('2026-11-20T00:00:00.000Z');h.taskSet('gradingMode','closed');
 h.taskSet('standardDueAt',new Date('2026-11-01T00:00:00.000Z'));
 h.taskSet('finalDueAt',new Date('2026-11-02T00:00:00.000Z'));
 assert.equal(h.check().result.allowed,true);
 assert(!h.names.some(n=>/受付|提出|採点|ログ|発行/.test(n)));
 assert.doesNotMatch(JSON.stringify(h.check()),/@|identity|proof|key|sheet|grade/);
});
test('旧HTML配付の教員例外は今回拡張しない',()=>{
 const h=setup(TANAKA);vm.runInContext(read('03_html_practice_embed.js'),h.box);
 assert.equal(h.box.HtmlPracticeTeacher.allowed({email:TANAKA,teacher:true}),false);
 assert.equal(h.box.HtmlPracticeTeacher.allowed({email:INFO,teacher:true}),true);
});
