import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { parseCodeRefs, normalizeCheck, publicCheck, validateReferenceGraph, normalizeTrial, evaluateCheck } from '../confirmation.mjs';
const ref={questionId:'q1',version:'v1'};
const run=(id,value,stdout,code='print(1)',other={})=>({schema:1,id,source:ref,code,codeHash:'a'.repeat(64),inputs:[{prompt:'予想: ',value:String(value)}],stdout,stderr:'',outcome:'success',truncated:false,at:'2026-10-16T00:00:00.000Z',...other});
const input={cases:[{id:'over',label:'大きい',inputs:[{index:0,kind:'integer',op:'gt',value:20}]},{id:'equal',label:'等しい',inputs:[{index:0,kind:'integer',op:'eq',value:20}]},{id:'under',label:'小さい',inputs:[{index:0,kind:'integer',op:'lt',value:20}]}]};
test('参照元のIDと版を固定し、重複・版なし・余分な項目を拒否する',()=>{
 assert.deepEqual(parseCodeRefs('q1@v1,q2@v2'),[ref,{questionId:'q2',version:'v2'}]);
 for(const value of ['q1','q1@v1,q1@v1','[{"questionId":"q1","version":"v1","secret":1}]'])assert.throws(()=>parseCodeRefs(value));
 assert.throws(()=>validateReferenceGraph([{...ref,setId:'s',kind:'confirmation',codeRefs:[ref],checkType:'inputCases',checkConfig:input}]));
 assert.throws(()=>validateReferenceGraph([{...ref,setId:'other',kind:'code'},{questionId:'check',version:'v1',setId:'s',kind:'confirmation',codeRefs:[ref],checkType:'inputCases',checkConfig:input}]));
});
test('型ごとに設定を検査し、private正答をpublicへ出さない',()=>{
 const c={...input,private:{expectedOutputs:{over:{mode:'lastLine',text:'secret'}}}};
 assert.deepEqual(publicCheck('inputCases',c),input);
 assert.throws(()=>normalizeCheck('inputCases',c,{publicOnly:true}));
 for(const [type,conf] of [['unknown',{}],['resultCoverage',{results:['a','a'],requiredDistinct:2}],['attemptLimit',{range:{min:1,max:100},maxGuesses:0,guessPrompt:'',successOutput:'OK'}],['compareRuns',{conditions:[{id:'x',label:'X'}],codePolicy:'variants'}],['answer',{format:'choice',question:'Q',choices:[{id:'a',label:'A'},{id:'a',label:'B'}]}]])assert.throws(()=>normalizeCheck(type,conf));
 const answer={format:'number',question:'回数は？',private:{expectedAnswer:7}}; assert.deepEqual(publicCheck('answer',answer),{format:'number',question:'回数は？'});
});
test('入力条件を正常終了した同じコードで試す。境界値・全角数字・失敗・改変前を区別する',()=>{
 const trials=[run('a',24,'A'),run('b','２０','B'),run('c',18,'C')];
 assert.equal(evaluateCheck('inputCases',input,trials).completed,true);
 assert.equal(evaluateCheck('inputCases',input,trials,{},{currentCode:{'v1/q1':'changed'}}).completed,false);
 assert.equal(evaluateCheck('inputCases',input,[...trials.slice(0,2),run('d',18,'C','print(1)',{outcome:'error'})]).completed,false);
 assert.equal(evaluateCheck('inputCases',input,[...trials.slice(0,2),run('e',18,'C','print(1)',{truncated:true})]).completed,false);
 assert.equal(evaluateCheck('inputCases',input,[run('f','aaa','X')]).details.some(d=>d.complete),false);
});
test('出力全体の違いを種類数にせず、定義済みの種類だけを数える',()=>{
 const c={results:['北','東','南','西'],requiredDistinct:3,output:'lastLine'};
 const trials=[run('a',1,'1\n北\n'),run('b',2,'2\n北\n'),run('c',3,'3\n東\n')];
 assert.equal(evaluateCheck('resultCoverage',c,trials).completed,false);
 assert.equal(evaluateCheck('resultCoverage',c,[...trials,run('d',4,'4\n南\n')]).completed,true);
 assert.equal(evaluateCheck('resultCoverage',c,[run('e',4,'北 東 南\n')]).completed,false);
});
test('数当ては正解を含む回答回数で判定し、理論値の2の冪の境界も扱う',()=>{
 const config={range:{min:1,max:100},maxGuesses:'theoretical',guessPrompt:'予想: ',successOutput:'正解',output:'lastLine'};
 const game=n=>run('game'+n,1,'正解\n','print(1)',{inputs:[{prompt:'名前: ',value:'A'},...Array.from({length:n},(_,i)=>({prompt:'予想: ',value:String(i+1)}))]});
 assert.equal(evaluateCheck('attemptLimit',config,[game(7)]).completed,true);
 const over=evaluateCheck('attemptLimit',config,[game(8)]);assert.equal(over.completed,false);assert.match(over.label,/8回で正解/);
 assert.equal(evaluateCheck('attemptLimit',{...config,range:{min:1,max:128}},[game(8)]).completed,true);
 assert.equal(evaluateCheck('attemptLimit',config,[{...game(7),outcome:'stopped'}]).completed,false);
 for(const value of ['0','101','aaa']) assert.equal(evaluateCheck('attemptLimit',config,[{...game(1),inputs:[{prompt:'予想: ',value},{prompt:'予想: ',value:'42'}]}]).completed,false);
 assert.equal(evaluateCheck('attemptLimit',config,[{...game(1),inputs:[{prompt:'予想: ',value:'42',eof:true}]}]).completed,false);
});
test('比較は別々の正常試行を選択し、意図的なコード変更を通常の入力確認と分ける',()=>{
 const c={conditions:[{id:'a',label:'A'},{id:'b',label:'B'}],codePolicy:'variants'};
 const trials=[run('one',1,'A','codeA'),run('two',2,'B','codeB')],response={selections:{a:'one',b:'two'}};
 assert.equal(evaluateCheck('compareRuns',c,trials,response).completed,true);
 assert.equal(evaluateCheck('compareRuns',{...c,codePolicy:'sameCode'},trials,response).completed,false);
 assert.equal(evaluateCheck('compareRuns',c,trials,{selections:{a:'one',b:'one'}}).completed,false);
});
test('非公開の正答がないブラウザでは回答済みと正解を区別する',()=>{
 const c={format:'choice',question:'予想は？',choices:[{id:'a',label:'A'},{id:'b',label:'B'}]};
 assert.deepEqual(evaluateCheck('answer',c,[],{answer:'a'}),{state:'answered',completed:false,label:'回答を記録済み（正誤未判定）',details:[],runCount:0});
 assert.equal(evaluateCheck('answer',c,[],{answer:'wrong'}).state,'not-started');
});
test('試行データに得点や秘密値を混ぜず、記録の不正な形式を拒否する',()=>{
 const t=run('valid',1,'OK');assert.deepEqual(normalizeTrial(t),t);
 assert.throws(()=>normalizeTrial({...t,score:100}));assert.throws(()=>normalizeTrial({...t,codeHash:'invalid'}));
});
test('生成GASとブラウザは同じ検査・観測判定を実行する',async()=>{
 const source=await readFile(new URL('../../../scripts/pythoneditor-gas/45_python_editor_confirmation.js',import.meta.url),'utf8');
 const context=vm.createContext({});vm.runInContext(source,context);const server=context.PythonEditorConfirmation;
 const trials=[run('a',24,'A'),run('b',20,'B'),run('c',18,'C')];
 assert.deepEqual(JSON.parse(JSON.stringify(server.evaluateCheck('inputCases',input,trials))),evaluateCheck('inputCases',input,trials));
 assert.throws(()=>server.normalizeCheck('answer',{format:'number',question:'Q',private:{expectedAnswer:7}},{publicOnly:true}));
});
