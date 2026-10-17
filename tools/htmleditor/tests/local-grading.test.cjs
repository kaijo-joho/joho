const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const {webcrypto,createHash} = require('node:crypto');
const G = require('../local-grading.js');
const root = path.resolve(__dirname,'..'), site = path.resolve(root,'../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'grading/catalog.json')));
const config = {}; vm.runInNewContext(fs.readFileSync(path.join(root,'grading-assets.js'),'utf8'),{window:config});
const assets=config.HtmlLocalGradingAssets;
const engine = fs.readFileSync(path.join(root,'grading/normal-engine.js'),'utf8');
const reference=vm.createContext({});vm.runInContext(engine,reference);
const referenceGrade=vm.runInContext('(source,compiled)=>HtmlNormalConfiguredGrader.gradeConfigured(source,JSON.parse(compiled))',reference);
const mappings={'html12-01':'1-2','html13-01':'1-3_1','html13-02':'1-3_2','html14-01':'1-4','html15-01':'1-5_1','html15-02':'1-5_2','html16-01':'1-6','html17-01':'1-7','html22-01':'2-2_1','html22-02':'2-2_2','html23-01':'2-3','html24-01':'2-4'};
const proof=b=>({assignmentId:b.targetId,templateVersion:b.templateVersion,templateSha256:b.templateSha256});
function environment({brokenAsset=false, noReply=false}={}) {
  const blobs=new Map(), stats={fetches:0,workers:0,terminated:0,revoked:0},base='https://joho.kaijo.ed.jp/tools/htmleditor/';
  class LocalURL extends URL {
    static createObjectURL(blob){const id='blob:synthetic-'+blobs.size;blobs.set(id,blob);return id;}
    static revokeObjectURL(id){blobs.delete(id);stats.revoked++;}
  }
  class Worker {
    constructor(id){stats.workers++;this.stopped=false;this.ready=blobs.get(id).text().then(source=>{
      this.ctx=vm.createContext({self:{postMessage:data=>queueMicrotask(()=>!this.stopped&&this.onmessage?.({data:structuredClone(data)}))}});
      vm.runInContext(source,this.ctx);
    });}
    postMessage(data){this.ready.then(()=>{if(this.stopped||noReply)return;this.ctx.json=JSON.stringify(data);vm.runInContext('self.onmessage({data:JSON.parse(json)})',this.ctx);}).catch(()=>this.onerror?.());}
    terminate(){this.stopped=true;stats.terminated++;}
  }
  const env={location:{href:base+'index.html'},crypto:webcrypto,URL:LocalURL,Blob,Worker,
    fetch:async(url,options)=>{
      stats.fetches++;assert.equal(options.credentials,'omit');assert.equal(options.referrerPolicy,'no-referrer');
      let text=fs.readFileSync(path.join(root,new URL(url).pathname.slice(new URL(base).pathname.length)),'utf8');
      if(brokenAsset)text+='changed';return {ok:true,url,text:async()=>text};
    }};
  return {env,stats};
}
function fixture(b,kind) {
  const candidate=path.join(site,'html',(kind==='answer'?'answer':'sample')+mappings[b.targetId]+'.html');
  let source=fs.readFileSync(fs.existsSync(candidate)?candidate:path.join(site,'html','sample'+mappings[b.targetId]+'.html'),'utf8');
  if(!fs.existsSync(candidate))source=source.replace('</head>','<style>body{color:blue;background-color:white}p{font-size:16px}</style></head>');
  for(const [id,old] of Object.entries(mappings))source=source.replaceAll('sample'+old+'.html',id+'.html');
  if(b.rubricVersion==='2026-10-inquiry-1')source=source.replaceAll('strongほど強くはないが、強調したいときはemタグを使います。','アクセントを置いて読む語句にはemタグを使います。');
  return source;
}

test('公開採点資産のhash・40雛形・14凍結基準を検証し、非公開ID/鍵/本人情報を含めない',async()=>{
  assert.equal(catalog.bindings.length,40);assert.equal(Object.keys(catalog.snapshots).length,14);
  for(const [file,key] of [[assets.catalog,'catalogSha256'],[assets.engine,'engineSha256']]) assert.equal(createHash('sha256').update(fs.readFileSync(path.join(root,file))).digest('hex'),assets[key]);
  for(const b of catalog.bindings){assert.deepEqual(Object.keys(b).sort(),['engineSourceHash','engineVersion','rubricSha256','rubricVersion','targetId','templateSha256','templateVersion']);const {snapshot}=G.select(catalog,proof(b));assert.equal(await G.hash(G.canonical(snapshot.body)),snapshot.hash);}
  assert.doesNotMatch(JSON.stringify(catalog),/FileId|FolderId|ParentId|storageFolder|@gfe|receiptKeys|spreadsheetId/);
  assert.doesNotMatch(engine,/\bfetch\s*\(|\bXMLHttpRequest\b|\bimportScripts\s*\(/);
  for(const name of ['parse5','entities','css-tree','mdn-data','source-map-js'])assert.ok(fs.readFileSync(path.join(root,'grading/LICENSES.txt'),'utf8').includes(name));
});

test('全40雛形の空欄・編集例・構造エラーが凍結したGAS採点器と一致する',async()=>{
  const h=environment(),grader=G.create({env:h.env,assets});let count=0;
  for(const b of catalog.bindings){
    if(b.targetId==='html11-01'){const r=await grader.grade({source:'<html><body>準備</body></html>',fileName:b.targetId+'.html',proof:proof(b)});assert.equal(r.status,'receipt-only');assert.equal(r.receipt,undefined);continue;}
    const blank=fixture(b,'blank'),answer=fixture(b,'answer');
    for(const source of [blank,answer,answer.replace(/<\/body>/,'')]){
      const r=await grader.grade({source,fileName:b.targetId+'.html',proof:proof(b)});
      const expected=referenceGrade(source,JSON.stringify(catalog.snapshots[b.rubricSha256].body.rubric));
      assert.deepEqual(JSON.parse(JSON.stringify(r.receipt.result)),JSON.parse(JSON.stringify(expected)),b.targetId+' '+b.templateVersion);
      assert.equal(r.receipt.sourceSha256,await G.hash(source));count++;
    }
  }
  assert.equal(h.stats.fetches,2);assert.equal(h.stats.workers,count);assert.equal(h.stats.terminated,count);assert.equal(h.stats.revoked,count);
});

test('同じファイル名でも編集・再提出ごとに新しい本文hashと結果を得る',async()=>{
  const h=environment(),g=G.create({env:h.env,assets}),b=catalog.bindings.find(b=>b.targetId==='html12-01');
  const empty=await g.grade({source:fixture(b,'blank'),fileName:b.targetId+'.html',proof:proof(b)});
  const full=await g.grade({source:fixture(b,'answer'),fileName:b.targetId+'.html',proof:proof(b)});
  assert.notEqual(empty.receipt.sourceSha256,full.receipt.sourceSha256);assert.notDeepEqual(empty.receipt.result,full.receipt.result);
});

test('不明な版・hash違い・別名・資産差替えは偽の0点/合格にしない',async()=>{
  const h=environment(),g=G.create({env:h.env,assets}),b=catalog.bindings.find(b=>b.targetId==='html12-01');
  for(const p of [{...proof(b),templateVersion:'unknown'},{...proof(b),templateSha256:'0'.repeat(64)}])await assert.rejects(g.grade({source:'text',fileName:b.targetId+'.html',proof:p}));
  await assert.rejects(g.grade({source:'text',fileName:'html12-01 (1).html',proof:proof(b)}));
  const broken=environment({brokenAsset:true});await assert.rejects(G.create({env:broken.env,assets}).grade({source:'text',fileName:b.targetId+'.html',proof:proof(b)}));assert.equal(broken.stats.workers,0);
  const ambiguous=structuredClone(catalog);ambiguous.bindings.push({...b,rubricVersion:'changed'});assert.throws(()=>G.select(ambiguous,proof(b)),/ambiguous/);
});

test('Worker停止・時間切れ・取消しで編集画面や旧提出を妨げない',async()=>{
  const h=environment({noReply:true}),g=G.create({env:h.env,assets,timeoutMs:20}),b=catalog.bindings.find(b=>b.targetId==='html12-01');
  await assert.rejects(g.grade({source:'text',fileName:b.targetId+'.html',proof:proof(b)}),/timeout/);
  const abort=new AbortController();abort.abort();await assert.rejects(g.grade({source:'text',fileName:b.targetId+'.html',proof:proof(b),signal:abort.signal}),/cancelled/);
  assert.equal(h.stats.workers,1);assert.equal(h.stats.terminated,1);
});

test('採点不能時の★を隠し、未提出・受領とは別表示にする',async()=>{
  class Node{constructor(){this.children=[];this.textContent='';}append(...n){this.children.push(...n);}insertBefore(n,b){this.children.splice(this.children.indexOf(b),0,n);}setAttribute(){}remove(){}}
  const doc={createElement:()=>new Node(),createTextNode:text=>Object.assign(new Node(),{textContent:text})},parent=new Node();
  const p=G.panel(parent,{document:doc,isCurrent:()=>true,input:{},grader:{grade:async()=>({status:'checked',receipt:{result:{state:'needs_review',rules:[{passed:true,label:'見出し',points:10,earned:10}]}}})}});
  await p.completed;
  const text=n=>n.textContent+n.children.map(text).join('');const display=text(parent);
  assert.ok(display.includes('この表示だけでは提出完了になりません'));assert.ok(display.includes('確認待ち：見出し'));assert.doesNotMatch(display,/★|10|100/);p.dispose();
});
