import fs from 'node:fs';
import vm from 'node:vm';
import {createHash,createHmac} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const root=new URL('../',import.meta.url);
export const catalog=JSON.parse(fs.readFileSync(new URL('../../../tools/htmleditor/grading/catalog.json',import.meta.url)));
export const crypto={sha:s=>createHash('sha256').update(s).digest('hex'),hmac:(s,k)=>createHmac('sha256',k).update(s).digest('base64url'),bytes:s=>Buffer.byteLength(s)};
export const clone=value=>JSON.parse(JSON.stringify(value));
export class Sheet {
  constructor(headers,max=10000){this.rows=[headers.slice()];this.max=max;this.beforeWrite=null;this.writes=0;}
  getMaxRows(){return this.max;}getLastRow(){return this.rows.length;}getLastColumn(){return this.rows[0].length;}
  getRange(row,column,rows,columns){
    const sheet=this;
    return {getValues(){return Array.from({length:rows},(_,i)=>Array.from({length:columns},(_,j)=>sheet.rows[row+i-1]?.[column+j-1]??''));},
      getFormulas(){return Array.from({length:rows},()=>Array(columns).fill(''));},
      setValues(values){sheet.writes++;if(sheet.beforeWrite)sheet.beforeWrite({row,column,values});values.forEach((r,i)=>{sheet.rows[row+i-1]??=[];r.forEach((v,j)=>sheet.rows[row+i-1][column+j-1]=v);});return this;}};
  }
}
export function fixture(options={}) {
  const context=vm.createContext({Date,Set});
  for(const name of ['00_contract','10_service','20_repository','30_outbox','40_teacher_log','90_entrypoints'])vm.runInContext(fs.readFileSync(new URL(name+'.js',root),'utf8'),context,{filename:name});
  const T=context.HtmlIntakeContract;
  // 明示した合成鍵。実際の学校鍵を読み込まない。
  const config={enabled:true,allowedOrigins:['https://joho.kaijo.ed.jp'],allowedDomains:['school.invalid'],teacherAccounts:['teacher@school.invalid'],activeKeyId:'synthetic-1',receiptKeys:{'synthetic-1':'not-a-real-secret-for-unit-tests-only-20261017'}};
  let now=1800000000000,active='10101@school.invalid',effective=active;
  const properties={values:new Map(),beforeSet:null,beforeDelete:null,
    getProperty(k){return this.values.get(k)??null;},getProperties(){return Object.fromEntries(this.values);},
    setProperty(k,v){this.beforeSet?.(k,v);this.values.set(k,v);},deleteProperty(k){this.beforeDelete?.(k);this.values.delete(k);}};
  const stats={userLocks:0,collectorLocks:0,intakeScriptLocks:0,teacherReads:0};
  const locks=new Map();
  function lock(key,kind){return {held:false,tryLock(){if(locks.get(key))return false;locks.set(key,true);this.held=true;stats[kind]++;return true;},releaseLock(){locks.delete(key);this.held=false;}};}
  const stores=new Map(),signing=T.signing(config,crypto),bindingFor=account=>({tool:'html',account,origin:config.allowedOrigins[0],actorKey:crypto.sha(account),spreadsheetId:'synthetic_store_'+crypto.sha(account).slice(0,20),generation:'a'.repeat(32)});
  const binding=catalog.bindings.find(b=>b.targetId==='html12-01'&&b.templateVersion==='2026-10-local-1');
  let policy={binding:{...binding,snapshot:catalog.snapshots[binding.rubricSha256]},fiscalYear:2026,grade:3,intakeEnabled:true,finalDueAt:now+3600000,lateSubmissionPolicy:'reject'};
  function repository(b) {
    if(!stores.has(b.account))stores.set(b.account,new Sheet(T.constants.headers));
    const sheet=stores.get(b.account);
    return context.HtmlIntakeRepository.create(sheet,{...crypto,verify:signing.verify,recheck(){if(options.badStore)T.fail('owner_mismatch');},flush(){},encode:s=>Buffer.from(s).toString('base64'),decode:s=>Buffer.from(s,'base64').toString('utf8')});
  }
  const dep={crypto,properties,now:()=>now,identity:()=>({active,effective}),
    userLock:()=>lock('user:'+active,'userLocks'),
    verifyBinding(token,origin,account){T.yes(token==='synthetic-binding' && origin===config.allowedOrigins[0],'binding_invalid');return bindingFor(account);},
    authorize(input){if(options.authorizationError)T.fail('proof_invalid');if(input.targetId!==policy.binding.targetId)T.fail('target_mismatch');return policy;},
    openRepository:repository};
  const service=context.HtmlIntakeService.create(config,dep);
  const teacherRows=new Map(),teacherOrder=[];
  const teacherLog={hook:null,find(body){stats.teacherReads++;return teacherRows.get(body.actorKey+body.submissionId)||null;},
    append(row,body){this.hook?.(row,body);const key=body.actorKey+body.submissionId;if(teacherRows.has(key))throw Error('duplicate');teacherRows.set(key,clone(row));teacherOrder.push(key);}};
  const quarantine=[];
  const collectorDep={crypto,properties,identity:()=>({active,effective}),collectorLock:()=>lock('collector','collectorLocks'),teacherLog,
    validateSummary(body){T.yes(body.kind===T.constants.summaryKind && body.actorKey===crypto.sha(body.account) && body.spreadsheetId===bindingFor(body.account).spreadsheetId,'summary_invalid');},
    validateReceipt(body){T.yes(body.spreadsheetId===bindingFor(body.account).spreadsheetId && body.actorKey===crypto.sha(body.account),'receipt_invalid');},
    quarantine(key,raw){quarantine.push({key,raw});return true;}};
  const collector=context.HtmlIntakeOutbox.create(config,collectorDep);
  function input(source='<!doctype html><html lang="ja"><head><title>合成</title></head><body>合成データ</body></html>',id='1'.repeat(32)) {
    const rules=policy.binding.snapshot.body.rubric.rules;
    return {submissionId:id,targetId:policy.binding.targetId,fileName:policy.binding.targetId+'.html',source,
      assessment:policy.binding.targetId==='html11-01'?null:{kind:'html-local-result-v1',...Object.fromEntries(['targetId','templateVersion','templateSha256','rubricVersion','rubricSha256','engineVersion','engineSourceHash'].map(k=>[k,policy.binding[k]])),sourceSha256:crypto.sha(source),
        result:{state:'graded',rubricId:policy.binding.targetId,rubricVersion:policy.binding.rubricVersion,engineVersion:policy.binding.engineVersion,score:1,rules:rules.map(r=>({ruleId:r.ruleId,label:r.message,points:r.points,earned:r.points,passed:true})),diagnostics:[]}},hintUsage:{v:1,status:'unavailable'}};
  }
  return {context,T,config,dep,service,properties,stores,stats,teacherRows,teacherOrder,teacherLog,collector,collectorDep,quarantine,input,bindingFor,repository,
    get policy(){return policy;},set policy(v){policy=v;},now:()=>now,advance:ms=>now+=ms,
    actor(email){active=email;effective=email;},mismatch(){effective='other@school.invalid';},teacher(){active=effective='teacher@school.invalid';},
    call:(action,value)=>service.call(action,value,'synthetic-binding',config.allowedOrigins[0])};
}
