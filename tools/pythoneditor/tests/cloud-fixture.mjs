import vm from 'node:vm';
import { readFile } from 'node:fs/promises';
import { createHash, createHmac, randomUUID } from 'node:crypto';
const files = ['06_python_editor_contract.js','07_python_editor_config.js','13_python_editor_grader.js','45_python_editor_store.js','46_python_editor_master.js','22_python_editor_api.js'];
const sources = await Promise.all(files.map(f => readFile(new URL('../../../scripts/pythoneditor-gas/' + f, import.meta.url), 'utf8')));
const hash = text => createHash('sha256').update(text).digest('hex');
const uid = () => randomUUID().replaceAll('-', '');
const json = value => JSON.parse(JSON.stringify(value));
export const T0 = '2026-10-14T00:00:00.000Z', DUE = '2026-10-14T01:00:00.000Z';

class Sheet {
  constructor(headers) { this.values = [headers.slice()]; this.maxRows = 1000; this.beforeWrite = null; this.afterWrite = null; }
  getLastRow() { return this.values.length; } getLastColumn() { return this.values[0].length; }
  getMaxRows() { return this.maxRows; } getMaxColumns() { return this.values[0].length; }
  insertRowsAfter(n, k) { this.maxRows += k; }
  getRange(row, col, nr, nc) {
    const sheet = this;
    return {
      getValues() { return Array.from({length:nr}, (_, i) => Array.from({length:nc}, (_, j) => sheet.values[row - 1 + i]?.[col - 1 + j] ?? '')); },
      setNumberFormat() { return this; },
      setValues(values) {
        sheet.beforeWrite?.(values); sheet.values[row - 1] = values[0].slice(); sheet.afterWrite?.(values); return this;
      },
      createTextFinder(value) { return { matchEntireCell() { return this; }, useRegularExpression() { return this; }, findAll() {
        return sheet.values.flatMap((r, i) => i >= row - 1 && i < row - 1 + nr && String(r[col - 1]) === value ? [{ getRow:() => i + 1 }] : []);
      } }; }
    };
  }
}
export function createCloudFixture() {
  const ctx = vm.createContext({console, Utilities:{DigestAlgorithm:{SHA_256:'SHA_256'},Charset:{UTF_8:'UTF_8'},computeDigest:(_a,s)=>[...createHash('sha256').update(s).digest()],computeHmacSha256Signature:(s,k)=>[...createHmac('sha256',k).update(s).digest()],getUuid:randomUUID}});
  sources.forEach(code => vm.runInContext(code, ctx));
  const {PythonEditor: P, PythonEditorStore: S, PythonEditorService: Service, PythonEditorConfig: C} = ctx;
  const sheets = Object.fromEntries(Object.values(S.names).map(name => [name,new Sheet(S.headers)]));
  const book = {getSheetByName:name=>sheets[name],getSheets:()=>Object.values(sheets)};
  let locked = false, lockHook = null;
  const dep = {book,hash,flush(){},lock:()=>({tryLock(){ if(locked) return false;lockHook?.();locked=true;return true; },releaseLock(){locked=false;}})};
  const config = {enabled:true,assignments:[{assignmentId:'exercise1',setId:'exercise',version:'v1',year:2026,grades:[4],enabled:true,official:true,
    startsAt:T0,dueAt:DUE,closesAt:'2026-10-15T01:00:00.000Z'}]};
  const store = S.create(config,dep);
  const rubric = [
    ['questionId','questionTitle','minLines','ruleId','target','ruleType','stepNo','stepMode','keyword','points','enabled','python','output','url','note'],
    ['q1','test',2,'code','code','match',1,'single','print',1,true,'','','',''],
    ['q1','test',2,'out','output','match',1,'single','value: 2',1,true,'','','','']
  ];
  const snapBody = {schema:1,question:{questionId:'q1',version:'v1',setId:'exercise',order:1,title:'テスト',prompt:'テスト',templateCode:'# start\n\n# end',setupCode:'',kind:'code'},
    gradingVersion:'rubric-v1',engineVersion:ctx.PythonEditorGraderV1.engineVersion,graded:true,
    ranges:[{regionId:'r1',scoringId:'q1',startMarker:'# start',endMarker:'# end'}],rules:ctx.PythonEditorGraderV1.parseRules(rubric)};
  function freeze(body=snapBody) {
    const q=body.question;
    return store.putSnapshots([{recordKey:P.key(q),groupKey:q.version+'/'+q.setId,actorKey:'',questionId:q.questionId,version:q.version,requestId:'',seq:0,at:T0,
      payloadHash:hash(P.canonical(body)),body:json(body)}],()=>{})[0];
  }
  freeze();
  let now = T0, recheckHook = null;
  function env(email='learner@example.invalid') {
    const actor={email,key:hash(email),grade:4,teacher:false};
    return {actor,config,store,hash,now:()=>now,intakeSecret:()=>hash('synthetic fixture only; never a production key'),authorize:(s,a,at,intake)=>C.authorize(config,actor,s.body,a,at,intake),
      recheck:(s,a,at,intake)=>{recheckHook?.();C.authorize(config,actor,s.body,a,at,intake);}};
  }
  const environment=env();
  function dispatch(action,input={},at=now,e=environment) { return Service.dispatch(action,json(input),e,at); }
  function submission(code='# start\nx = 2\nprint("value:", x)\n# end',output='value: 2\n',requestId=uid()) {
    return {questionId:'q1',version:'v1',assignmentId:'exercise1',requestId,code,stdin:'',run:{codeHash:hash(code),outcome:'success',truncated:false,
      outputText:output,stdout:output,inputEcho:'',stderr:'',errorText:''}};
  }
  function draft(code='one',revision=null,requestId=uid()) { return {questionId:'q1',version:'v1',requestId,code,stdin:'',expectedRevision:revision}; }
  return {ctx,P,store,sheets,config,freeze,snapBody,dispatch,submission,draft,env,environment,setNow:value=>now=value,
    setRecheck:fn=>recheckHook=fn,setLockHook:fn=>lockHook=fn,setLocked:value=>locked=value};
}
