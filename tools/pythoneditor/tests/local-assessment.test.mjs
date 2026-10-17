import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { LOCAL_ASSESSMENT_ENGINE, compileAssessment, validateAssessmentPolicy, evaluateAssessment, assessmentCodeHash, assessmentEvidenceHash } from '../local-assessment.mjs';
const plain=value=>JSON.parse(JSON.stringify(value));
const ctx=vm.createContext({console});
for(const file of ['06_python_editor_contract.js','13_python_editor_grader.js'])vm.runInContext(readFileSync(new URL('../../../scripts/pythoneditor-gas/'+file,import.meta.url),'utf8'),ctx);
vm.runInContext(readFileSync(new URL('../../../scripts/pythoneditor-trial-gas/08_local_assessment.js',import.meta.url),'utf8'),ctx);
function snapshot(keywords,{target='code',points=1,minLines=1,range={startMarker:null,endMarker:null}}={}){
  const rules=keywords.map((keyword,index)=>({ruleId:'check'+(index+1),target,ruleType:'match',stepNo:1,stepMode:'single',keyword,points,enabled:true}));
  return {schema:1,question:{questionId:'q1',setId:'test',version:'v1',kind:'code'},gradingVersion:'grade-v1',engineVersion:ctx.PythonEditorGraderV1.engineVersion,graded:true,
    ranges:[{regionId:'whole',scoringId:'q1',...range}],rules:{q1:{schemaVersion:2,minLines,title:'PRIVATE_TITLE',rules}}};
}
function input(code,outputText='',extra={}){return {code,stdin:'',run:{codeHash:assessmentCodeHash(code),outcome:'success',truncated:false,outputText},...extra};}
function compare(body,data){const legacy=ctx.PythonEditorGraderV1.grade(plain(body),plain(data)),policy=compileAssessment(body),local=evaluateAssessment(policy,data);
  assert.equal(local.score,legacy.score,'legacy/new score mismatch');
  assert.deepEqual(local.checks.map(c=>[c.passed,c.points,c.eligible]),plain(legacy.checks).map(c=>[c.passed,c.points,true]),'legacy/new checks mismatch');return local;}

test('SHA256はUTF-8とUnicode・単独surrogateを含めNode/WebCrypto相当と一致する',()=>{
  for(const value of ['', 'abc', '日本語🙂', '\ud800', 'a'.repeat(200000)])assert.equal(assessmentCodeHash(value),createHash('sha256').update(value).digest('hex'));
});
test('公開policyは原文・模範解答・解説・メモを含めず、配点と版を保持する',()=>{
  const body=snapshot(['private_variable = 123456789','print("PRIVATE_EXPECTED_TEXT")'],{points:2});body.question.answerCode='PRIVATE_MODEL_CODE';body.note='PRIVATE_NOTE';
  const policy=compileAssessment(body),text=JSON.stringify(policy);
  for(const secret of ['private_variable','123456789','PRIVATE_EXPECTED_TEXT','PRIVATE_MODEL_CODE','PRIVATE_NOTE','PRIVATE_TITLE'])assert.ok(!text.includes(secret));
  assert.equal(policy.engineVersion,LOCAL_ASSESSMENT_ENGINE);assert.equal(policy.rubricVersion,'grade-v1');assert.equal(policy.checks.reduce((s,c)=>s+c.points,0),5);
  const changed=structuredClone(policy);changed.checks[1].points=3;assert.throws(()=>validateAssessmentPolicy(changed),/hash/);
});
test('literal/代入の境界・文字列引用符・空白・全角正規化を旧判定どおり扱う',()=>{
  const cases=[['x=1','xx=1',false],['x=1','x=10',false],['x=1','x=(1)',true],['name="hello"',"name='hello'",true],
    ['print("a b")',"print('a b')",true],['print("a b")','print("ab")',false],['for i in range(3)','for  i  in range (3)',true],['x=2','ｘ＝２',true],
    ['print(x)','print(xx)',false],['print(x)','print(x, end="")',true],['print("a",end="")','print("a")',false],['print("a",end="")',"print('a',end='')",true]];
  for(const [keyword,code] of cases)compare(snapshot([keyword]),input(code));
});
test('+=・比較左右交換・可換式・分配・累乗・DeMorgan・関数引数の主要同値を継承する',()=>{
  const cases=[['total=total+1','total += 1'],['total+=1','total=1+total'],['a+b>c','c<b+a'],['if a>20:','if 20<a:'],
    ['x=a+b','x=b+a'],['x=a*b','x=b*a'],['x=a*(b+c)','x=a*b+a*c'],['x=a**2','x=a*a'],['x=pow(a,2)','x=a**2'],
    ['if not(a>1 and b<3):','if b>=3 or a<=1:'],['int(a+b)','int(b+a)'],['round(a*b,2)','round(b*a,2)'],['items.append(a+b)','items.append(b+a)'],
    ['print(a*b)','print(b*a)'],['print("x"*3)','print(3*"x")']];
  for(const [keyword,code] of cases)compare(snapshot([keyword]),input(code));
});
test('OR/ANDとstep any/all・重みを旧ルールから保持し、独自実行点は加えない',()=>{
  const body=snapshot(['x=1||x=2&print(x)','for|while']);body.rules.q1.rules.push({ruleId:'group',target:'code',ruleType:'match',stepNo:1,stepMode:'any',keyword:'if',points:3,enabled:true},
    {ruleId:'group',target:'code',ruleType:'match',stepNo:1,stepMode:'any',keyword:'else',points:2,enabled:true});
  for(const code of ['','x=1','x=2\nprint(x)','while True:\n    break','if True:\n    pass'])compare(body,input(code));
});
test('複数の正解・非同値・断片を交差させたコーパスで旧判定との取り違えを防ぐ',()=>{
  const keywords=['x=1','x+=1','x=x+1','x=a+b','x=a*b','x=a-b','x=a*(b+c)','x=(a+b)*(c+d)','x=a**2','x=a**3',
    'a+b>c','if a>20:','if a%2==0:','if not(a>1 and b<3):','if a>1 or b<3:','for i in range(5):','while n>0:',
    'print(x)','print("a b")','print("a",end="")','print("a"*3)','print(a*b)','print(a+b)','print(x,y)','print(end="")',
    'int(a+b)','round(a*b,2)','items.append(a+b)','items[0]','else','elif','import random','x="日本語"'];
  const cases=new Set(['','pass','xx=10','x=1.0','x+=2','a=1\nb=2','x=c+a+b','x=a+b-c','x=a*b+a*c','x=c*a+b*a','x=a*a*a','x=a+a+a',
    'if c<b+a:\n    pass','if a%2!=0:\n    pass','if b>=3 or a<=1:\n    pass','int(b+a)','round(b*a,3)','other.append(b+a)',
    'print("ab")','print("a",end=" ")','print(3*"a")','print(y,x)','print(x,end="")','print(xy)','x="日本"']);
  for(const keyword of keywords){cases.add(keyword);cases.add(keyword+'0');cases.add(keyword.replaceAll('"',"'"));cases.add(keyword.replace(/\ba\b/g,'b'));}
  const body=snapshot(keywords);for(const code of cases)compare(body,input(code));
});
test('出力は数値ラベル境界と空白の旧規則を保持し、停止・打切り・旧コードの結果を流用しない',()=>{
  const body=snapshot(['a=7','hello world'],{target:'output'});
  for(const output of ['a=7\nhello world','aa=7 hello world','a=70 hello world','a=7.0 helloworld','a = 7\nhello\nworld'])compare(body,input('print(1)',output));
  for(const outcome of ['error','stopped','not_run'])compare(body,input('print(1)','a=7 hello world',{run:{...input('print(1)').run,outcome}}));
  const data=input('print(2)','a=7 hello world');data.run.codeHash=assessmentCodeHash('print(1)');const local=evaluateAssessment(compileAssessment(body),data);
  assert.equal(local.checks.filter(c=>c.passed).length,1);assert.ok(local.diagnostics.includes('stale_output'));
});
test('random使用時は旧エンジンと同じく出力点を分母から除外する',()=>{
  const body=snapshot(['hello'],{target:'output'}),data=input('import random\nprint(random.random())','hello'),legacy=ctx.PythonEditorGraderV1.grade(body,data),local=evaluateAssessment(compileAssessment(body),data);
  assert.equal(local.score,legacy.score);assert.equal(local.total,1);assert.equal(local.checks[1].eligible,false);assert.equal(local.checks[1].passed,null);assert.equal(local.starTotal,0);
});
test('採点区間マーカーを消した場合は全文へ迂回せず0点にする',()=>{
  const body=snapshot(['print'],{range:{startMarker:'# start',endMarker:'# end'}}),policy=compileAssessment(body);
  const before=evaluateAssessment(policy,input('# start\nprint(1)\n# end'));assert.equal(before.score,1);
  for(const code of ['print(1)','# start\n# start\nprint(1)\n# end']){const result=evaluateAssessment(policy,input(code));assert.equal(result.score,0);assert.ok(result.diagnostics.includes('markers_invalid'));}
});
test('未採点・v1・得点付き構造・正規表現は別の点へ置換せず未対応として拒否する',()=>{
  const body=snapshot(['x']);for(const alter of [b=>b.graded=false,b=>b.rules.q1.schemaVersion=1,b=>b.rules.q1.rules[0].ruleType='branch',b=>b.rules.q1.rules[0].keyword='re:x']){
    const current=structuredClone(body);alter(current);assert.throws(()=>compileAssessment(current));}
  const current=structuredClone(body);current.rules.q1.rules.push({...current.rules.q1.rules[0],ruleId:'unscored',points:0,ruleType:'branch'});assert.equal(compileAssessment(current).checks.length,2);
});
test('GASとブラウザのpolicy/resultは同一、証拠hashは入力・出力・試行の変更を検出する',()=>{
  const body=snapshot(['x+=1','if a>10:']),policy=compileAssessment(body),data=input('x=x+1\nif 10<a:\n    pass','',{evidence:{trials:['synthetic']}});
  assert.deepEqual(plain(ctx.PythonEditorLocalAssessment.compile(body)),policy);
  assert.deepEqual(plain(ctx.PythonEditorLocalAssessment.evaluate(policy,data)),evaluateAssessment(policy,data));
  assert.equal(ctx.PythonEditorLocalAssessment.evidenceHash(data),assessmentEvidenceHash(data));
  for(const changed of [{...data,stdin:'2'},{...data,run:{...data.run,outputText:'different'}},{...data,evidence:{trials:[]}}])assert.notEqual(assessmentEvidenceHash(changed),assessmentEvidenceHash(data));
});
