const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../download.js'), 'utf8');
function setup() {
  const all=[], listeners={}, sent=[], timers=new Map(); let confirms=0, closed=0, current=true, allowed=false;
  class Element {
    constructor(tag){this.tag=tag;this.children=[];this.style={};this.dataset={};this.hidden=false;this.isConnected=true;this.events={};this.contentWindow={};this.classes=new Set();this.classList={add:(...ns)=>ns.forEach(n=>this.classes.add(n)),remove:(...ns)=>ns.forEach(n=>this.classes.delete(n))};all.push(this);}
    append(...ns){this.children.push(...ns)} replaceChildren(){this.children=[]} setAttribute(){} focus(){} remove(){this.isConnected=false}
    addEventListener(k,f){this.events[k]=f} querySelector(){return null}
  }
  const ctx={URL,Uint8Array,crypto:{getRandomValues:a=>a.fill(7)},location:{origin:'https://joho.kaijo.ed.jp'},
    confirm:()=>{confirms++;return allowed},setTimeout:f=>{const n=timers.size+1;timers.set(n,f);return n},clearTimeout:n=>timers.delete(n),
    addEventListener:(k,f)=>listeners[k]=f,removeEventListener:k=>delete listeners[k],
    document:{createElement:t=>new Element(t),documentElement:{dataset:{resolvedTheme:'dark',textSize:'largest'}},addEventListener(){},removeEventListener(){}}};
  ctx.window=ctx;ctx.top=ctx;vm.runInNewContext(source,ctx);
  const container=new Element('div'),dialog=new Element('dialog');
  const task={id:'html12-01',fileName:'html12-01.html',title:'HTMLファイルの構成'};
  const panel=ctx.HtmlEditorDownload.create({container,dialog,lesson:{title:'実習',files:[task]},stateFor:()=>({item:current?{url:'https://script.google.com/macros/s/SYNTHETIC/exec?type=htmlPractice&target=html12-01'}:null}),requestClose:()=>closed++});
  all.find(n=>n.dataset.taskDownload).events.click({button:0,preventDefault(){}});
  const frame=all.find(n=>n.tag==='iframe'), bridge=new URL(frame.src).searchParams.get('bridge');
  const child={parent:frame.contentWindow,postMessage:(data,origin)=>sent.push({data,origin})};
  const event=(data={},extra={})=>({source:child,origin:'https://n-test-script.googleusercontent.com',data:{channel:'joho-html-distribution-v1',targetId:task.id,bridge,...data},...extra});
  return {all,dialog,panel,frame,sent,event,child,message:e=>listeners.message?.(e),connect(){this.message(event({type:'hello'}))},confirm:()=>confirms,closed:()=>closed,allow:v=>allowed=v,current:v=>current=v,timers};
}
test('統合は認証済み接続の応答後だけ。旧子では見出しと状態を維持',()=>{
  const h=setup(),status=h.all.find(n=>n.className==='download-status'),heading=h.all.find(n=>n.tag==='h3'&&n.tabIndex===-1);
  h.message(h.event({type:'layout',layout:'integrated-v1'})); assert.equal(status.hidden,false);
  h.connect();assert.equal(h.sent[0].data.layout,'integrated-v1');assert.equal(h.sent[0].origin,'https://n-test-script.googleusercontent.com');
  h.message(h.event({type:'state',phase:'ready'}));assert.equal(status.hidden,false);assert.equal(heading.hidden,false);
  h.message(h.event({type:'layout',layout:'integrated-v1'}));assert.equal(status.hidden,true);assert.equal(heading.hidden,true);assert.ok(h.dialog.classes.has('distribution-integrated'));
  h.message(h.event({type:'height',height:8000}));assert.equal(h.frame.style.height,'1600px');
  for(const height of [Infinity,-1,2.5,20001,'400'])h.message(h.event({type:'height',height}));assert.equal(h.frame.style.height,'1600px');
  h.panel.dispose();assert.equal(h.frame.isConnected,false);assert.ok(!h.dialog.classes.has('distribution-integrated'));
});
test('origin/source/nonce/課題ID/channel違い、別originへの遷移を拒否',()=>{
  for(const change of [e=>e.origin='https://evil.invalid',e=>e.source={},e=>e.data.bridge='bad',e=>e.data.targetId='html11-01',e=>e.data.channel='other']){
    const h=setup(),bad=h.event({type:'hello'});change(bad);h.message(bad);assert.equal(h.sent.length,0);
    h.connect();bad.data.type='layout';bad.data.layout='integrated-v1';h.message(bad);assert.ok(!h.dialog.classes.has('distribution-integrated'));
  }
  const h=setup();h.connect();h.message(h.event({type:'layout',layout:'integrated-v1'},{origin:'https://other-script.googleusercontent.com'}));assert.ok(!h.dialog.classes.has('distribution-integrated'));
});
test('統合後も発行中/結果不明/未保存の閉じる確認と別タブ確認を維持',()=>{
  const h=setup();h.connect();h.message(h.event({type:'layout',layout:'integrated-v1'}));
  for(const phase of ['issuing','uncertain','issued']){h.message(h.event({type:'state',phase}));assert.equal(h.panel.canClose(),false);}
  let prevented=false;h.all.find(n=>n.tag==='a'&&n.textContent==='別タブで開く').events.click({preventDefault:()=>prevented=true});assert.equal(prevented,true);assert.equal(h.closed(),0);
  h.message(h.event({type:'state',phase:'download-started'}));assert.equal(h.panel.canClose(),true);
  h.all.find(n=>n.textContent==='課題一覧へ戻る').events.click();assert.ok(!h.dialog.classes.has('distribution-open'));assert.equal(h.frame.isConnected,false);
});
