import assert from 'node:assert/strict';
import { validateCatalog, validateDraft, APP, questionKey, stdinLines } from '../core.mjs';
import { demoCatalog } from '../demo.mjs';
import { DraftStore } from '../storage.mjs';
import { PythonRunner } from '../runner.mjs';
import { adaptColab } from '../runtime.mjs';
import { studentCatalog } from '../../../scripts/pythoneditor-master.mjs';
import { readFile } from 'node:fs/promises';
class Storage {
  data = new Map();
  get length(){return this.data.size;}
  key(i){return [...this.data.keys()][i];}
  getItem(k){return this.data.get(k)||null;}
  setItem(k,v){this.data.set(k,v);}
}
const catalog=validateCatalog(demoCatalog),q=catalog.sets[0].questions[0];
assert.equal(catalog.sets[0].questions.length,3);
assert.deepEqual(stdinLines('a\r\nb\n'),['a','b']);
assert.deepEqual(stdinLines('\n'),['']);
assert.throws(()=>validateDraft({app:APP,version:1,entries:[{...q,code:3}]}));
assert.throws(()=>validateCatalog({...demoCatalog,sets:[...demoCatalog.sets,...demoCatalog.sets]}),/ID/);
const raw=structuredClone(demoCatalog);raw.sets[0].questions[0].answerCode='private';
assert.ok(!JSON.stringify(validateCatalog(raw)).includes('private'));
const data=new Storage(),a=new DraftStore(data),b=new DraftStore(data);
assert.equal(a.read(q),null);assert.equal(b.read(q),null);
const entry={questionId:q.questionId,version:q.version,code:'first',stdin:'',updatedAt:'2026-10-14',practiced:false};
a.write(entry);a.write(entry,'manual');
assert.throws(()=>b.write({...entry,code:'competing'}),/競合/);
const count=data.length;
assert.throws(()=>b.write({...entry,code:'still competing'}),/競合/);assert.equal(data.length,count,'conflict does not create a backup every keystroke');
assert.equal(a.read(q).code,'first');assert.equal(a.candidates(q).find(c=>c.kind==='archive').entry.code,'competing');
a.archive(entry,'取込み前');a.write({...entry,code:'new'});assert.equal(a.read(q,'manual').code,'first');
assert.equal(a.read({...q,version:'demo-v2'}),null);
const corrupt=new Storage();corrupt.setItem(a.key(q),'broken');
assert.throws(()=>new DraftStore(corrupt).read(q));assert.equal(corrupt.getItem(a.key(q)),'broken');
assert.equal(adaptColab('!pip install japanize-matplotlib\nprint(1)').split('\n').length,2);
assert.throws(()=>adaptColab('!curl example.com'),/未対応/);
const workers=[],events=[];
const runner=new PythonRunner(e=>events.push(e),{makeWorker:()=>{const w={postMessage(){},terminate(){this.terminated=true;}};workers.push(w);return w;},runMs:10000});
const first=runner.run({code:'loop'}),old=workers[0];
assert.throws(()=>runner.run({}),/実行中/);runner.stop();assert.ok(old.terminated);
const next=runner.run({code:'print(1)'});
old.onmessage({data:{type:'done',generation:first}});assert.ok(runner.active);
workers[1].onmessage({data:{type:'done',generation:next}});assert.equal(runner.active,false);
runner.dispose();assert.equal(events.filter(e=>e.type==='done').length,1);
const timed=[];
const timerRunner=new PythonRunner(e=>timed.push(e),{makeWorker:()=>({postMessage(){},terminate(){}}),runMs:20});
timerRunner.run({});await new Promise(r=>setTimeout(r,40));assert.equal(timerRunner.active,false);assert.match(timed.at(-1).text,/上限/);
if(process.env.PYTHONEDITOR_MASTER){
  const projected=studentCatalog(JSON.parse(await readFile(process.env.PYTHONEDITOR_MASTER,'utf8')));
  const all=projected.sets.flatMap(s=>s.questions);
  assert.equal(projected.sets.length,22);assert.equal(all.length,125);
  assert.equal(new Set(all.map(questionKey)).size,125);
  assert.equal(all.filter(q=>q.kind==='observation').length,1);
  for(const q of all) for(const k of ['answerCode','explanation','gradingVersion','scoringIds','runtimeConfig','note','sourceFileId']) assert.ok(!(k in q));
}
console.log('Python editor core: schema, private projection, draft conflict/version, stop/stale response passed');
