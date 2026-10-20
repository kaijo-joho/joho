// Actual candidate GAS modules with in-memory Sheets/Properties, no external writes.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import vm from 'node:vm';
const directory=path.resolve(process.argv[2]||'');assert(fs.existsSync(directory+'/48_html_download_availability.js'));
let now=Date.parse('2026-10-20T00:00:00.000Z'),email='synthetic-student@gfe.kaijo.ed.jp';
class Clock extends Date{constructor(...args){super(...(args.length?args:[now]));}static now(){return now;}}
const names=[],ranges=[],propertyReads=[];
const fail=code=>{const error=Error(code);error.htmlCode=code;throw error;};
const config={schemaVersion:2,enabled:true,distributionEnabled:true,logSpreadsheetId:'synthetic-log-'.padEnd(25,'x'),storageFolderId:'synthetic-storage-'.padEnd(25,'x'),
 issuanceSpreadsheetId:'synthetic-issuance-'.padEnd(25,'x'),rubricManifestFileId:'synthetic-manifest-'.padEnd(25,'x'),rubricManifestSha256:'a'.repeat(64),
 manifestFolderId:'synthetic-manifest-folder-'.padEnd(30,'x'),rubricArchiveFolderId:'synthetic-archive-'.padEnd(25,'x'),
 distributionBaseUrl:'https://script.google.com/macros/s/SYNTHETIC_DIST/exec',gradeBaseUrl:'https://script.google.com/macros/s/SYNTHETIC_GRADE/exec',siteBaseUrl:'https://joho.kaijo.ed.jp/'};
const properties={HTML_ASSIGNMENT_CONFIG_V2:JSON.stringify(config),HTML_IDENTITY_CONFIG_V3:JSON.stringify({enabled:true,activeKeyId:'synthetic-key',allowedKeyIds:['synthetic-key'],epoch:1,lifetimeMs:90*86400000,revokedProofIds:[]}),HTML_ISSUANCE_KEYS:JSON.stringify({'synthetic-key':'k'.repeat(43)})};
const tables={
 生徒名簿:[['userId','年'],[email,3],['other@gfe.kaijo.ed.jp',3]],
 配布設定一覧:[['id','status','release','g1','g2','g3','g4','g5','g6','distributionMode','submitBackend'],['html14-01','active',true,false,false,'TASK',false,false,false,'personal-html-v2','grade']],
 課題設定:[['year','grade','item','targetId','status','startAt'],[2026,3,'html','html14-01','active',new Clock(now)]]
};
let formula=false;
function sheet(name){assert(name in tables);names.push(name);return {
 getLastRow:()=>tables[name].length,getLastColumn:()=>tables[name][0].length,
 getRange:(row,col,height,width)=>{ranges.push({name,row,col,height,width});return {
  getValues:()=>tables[name].slice(row-1,row-1+height).map(r=>r.slice(col-1,col-1+width)),
  getFormulas:()=>tables[name].slice(row-1,row-1+height).map((r,i)=>r.slice(col-1,col-1+width).map((_,j)=>formula&&name==='課題設定'&&i===1&&j===5?'=NOW()':''))
 };}
};}
const box=vm.createContext({Date:Clock,Common:{SSID:{fileList:'synthetic-book',submitLog:config.logSpreadsheetId},FAVICON_URL:'https://joho.kaijo.ed.jp/favicon.ico'},
 SpreadsheetApp:{openById:id=>{assert.equal(id,'synthetic-book');return {getSheetByName:sheet};}},
 PropertiesService:{getScriptProperties:()=>({getProperty:key=>{propertyReads.push(key);assert(key in properties);return properties[key];}})},
 Session:{getActiveUser:()=>({getEmail:()=>email})},
 HtmlTrial:{assert:(v,code)=>{if(!v)fail(code);},fail,hashText:s=>crypto.createHash('sha256').update(s).digest('hex')},
 Utilities:{Charset:{UTF_8:'UTF-8'},base64EncodeWebSafe:s=>Buffer.from(s).toString('base64url'),base64DecodeWebSafe:s=>Buffer.from(s,'base64url'),
  newBlob:s=>({getDataAsString:()=>s.toString()}),computeHmacSha256Signature:(s,k)=>crypto.createHmac('sha256',k).update(s).digest(),getUuid:()=> '12345678-1234-1234-1234-123456789abc'},
 DistMaintenance:{shouldBlock:()=>false,isAdminRequest:()=>false},HtmlPracticeTeacher:{allowed:()=>false,identity:()=>({})}
});
for(const file of ['06_html_practice_catalog.js','07_html_practice_bindings.js','16_html_practice_policy.js','46_html_practice_catalog_runtime.js','90_html_local_protocol.js','91_html_identity_runtime.js','48_html_download_availability.js'])vm.runInContext(fs.readFileSync(directory+'/'+file,'utf8'),box,{filename:file});
const identity=box.HtmlLocalProtocol.issueIdentity(box.HtmlIdentityRuntime.env()).token;
names.length=0;ranges.length=0;propertyReads.length=0;
const request={bridge:'b'.repeat(48),nonce:'c'.repeat(32),identity,targetId:'html14-01'};
assert.equal(box.getHtmlDownloadAvailabilityV3(request).result.allowed,true);
assert.deepEqual(names,['生徒名簿','配布設定一覧','課題設定']);assert.equal(ranges.length,5);
assert(!names.some(n=>/採点|発行|ログ|教材ファイル|HTML課題設定/.test(n)));
tables.課題設定[1][5]=new Clock(now+1);const denied=box.getHtmlDownloadAvailabilityV3(request);assert.equal(denied.result.reason,'before_start');
now++;assert.equal(box.getHtmlDownloadAvailabilityV3(request).result.allowed,true);
formula=true;assert.equal(box.getHtmlDownloadAvailabilityV3(request).result.reason,'availability_unavailable');formula=false;
email='other@gfe.kaijo.ed.jp';const previous=names.length;assert.throws(()=>box.getHtmlDownloadAvailabilityV3(request),/availability_unavailable/);
assert.deepEqual(names.slice(previous),['生徒名簿'],'本人不一致では配付設定を読まない');
assert.doesNotMatch(JSON.stringify(denied),/@|identity|key|sheet|grade/);
const templateCalls=[];box.ScriptApp={getService:()=>({getUrl:()=>config.distributionBaseUrl})};
box.HtmlService={XFrameOptionsMode:{ALLOWALL:'ALLOWALL'},createTemplateFromFile:name=>{templateCalls.push(name);return {evaluate(){return this;},setTitle(){return this;},setFaviconUrl(){return this;},addMetaTag(){return this;},setXFrameOptionsMode(value){assert.equal(value,'ALLOWALL');return this;}};}};
box.HtmlIdentityConfirmation={render:()=> 'existing-identity'};box.HtmlPracticeEmbed={render:()=> 'existing-embed'};
vm.runInContext(fs.readFileSync(directory+'/00_code.js','utf8'),box);
box.doGet({parameter:{type:'htmlDownload',embed:'html-editor',bridge:request.bridge}});assert.deepEqual(templateCalls,['25_htmlDownloadAvailability']);
assert.equal(box.doGet({parameter:{type:'htmlIdentity'}}),'existing-identity');assert.equal(box.doGet({parameter:{type:'htmlPractice',embed:'html-editor'}}),'existing-embed');
assert.throws(()=>box.doGet({parameter:{type:'htmlDownload',embed:'html-editor',bridge:request.bridge,target:'html14-01'}}),/request_invalid/);
console.log(JSON.stringify({actualCandidateModules:8,checks:15,remoteCalls:0,remoteWrites:0,settingsSheets:2,rosterColumns:2,existingRoutesPreserved:true}));
