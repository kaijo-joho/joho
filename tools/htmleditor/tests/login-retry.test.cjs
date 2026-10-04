const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const {TextEncoder} = require('node:util');
const targetId = 'html12-01';
const accountAdvice = '複数のアカウントでログインしていると開けない場合があります。すべてのGoogleアカウントからログアウトし、学校アカウントだけでログインし直してください。';
function setup(kind, options = {}) {
  const listeners = new Set(), timers = new Map(), sent = [], confirmations = [];
  let nonce = 0, timerId = 0, closed = 0, current = true, allowed = false, reloaded = 0;
  class Element {
    constructor(tag) {
      this.tag = tag; this.children = []; this.style = {}; this.dataset = {}; this.events = {};
      this.hidden = false; this.isConnected = true; this.attributes = {}; this.contentWindow = {};
      this.classes = new Set(); this.classList = {add:(...ns)=>ns.forEach(n=>this.classes.add(n)),remove:(...ns)=>ns.forEach(n=>this.classes.delete(n))};
    }
    append(...nodes) { for (const n of nodes) { n.parent = this; this.children.push(n); } }
    replaceChildren(...nodes) { for (const n of [...this.children]) n.remove(); this.append(...nodes); }
    remove() { this.isConnected = false; if (this.parent) this.parent.children = this.parent.children.filter(n=>n!==this); for (const n of [...this.children]) n.remove(); }
    setAttribute(k,v) { this.attributes[k] = v; }
    addEventListener(k,f) { this.events[k] = f; }
    focus() { ctx.document.activeElement = this; }
    querySelector() { return null; }
  }
  const ctx = {URL,TextEncoder,Uint8Array,
    location:{origin:options.origin || 'https://joho.kaijo.ed.jp',reload(){reloaded++;}},
    crypto:{getRandomValues(a){if (options.noCrypto) throw Error('crypto unavailable'); return a.fill(++nonce);}},
    confirm(message){confirmations.push(message); return allowed;},
    setTimeout(f){timers.set(++timerId,f); return timerId;}, clearTimeout(id){timers.delete(id);},
    addEventListener(k,f){if (k === 'message') listeners.add(f);}, removeEventListener(k,f){listeners.delete(f);},
    document:{createElement:tag=>new Element(tag),documentElement:{dataset:{resolvedTheme:'dark',textSize:'largest'}},addEventListener(){},removeEventListener(){}}
  };
  ctx.window = ctx; ctx.top = ctx;
  vm.createContext(ctx);
  for (const f of ['download','submission']) vm.runInContext(fs.readFileSync(require.resolve('../' + f + '.js'),'utf8'),ctx);
  const container = new Element('div'), dialog = new Element('dialog');
  const walk = n=>[n,...n.children.flatMap(walk)];
  const find = text=>walk(container).find(n=>n.textContent === text);
  const savedFile = {fileName:targetId+'.html',text:'<html><body>保存済みの合成実習ファイル</body></html>'};
  const original = JSON.stringify(savedFile);
  let panel;
  if (kind === 'download') {
    panel = ctx.HtmlEditorDownload.create({container,dialog,lesson:{title:'合成課題',files:[{id:targetId,fileName:targetId+'.html',title:'合成課題'}]},
      stateFor:()=>({item:current?{url:'https://script.google.com/macros/s/SYNTHETIC/exec?type=htmlPractice&target='+targetId}:null}),requestClose(){closed++;}});
    walk(container).find(n=>n.dataset.taskDownload).events.click({button:0,preventDefault(){}});
  } else {
    panel = ctx.HtmlEditorSubmission.create({container,dialog,targetId,url:'https://script.google.com/macros/s/SYNTHETIC/exec?kind=html&flow=normal&kadai='+targetId,
      isCurrent:()=>current,requestClose(){closed++;},savedFile:options.manual?null:savedFile});
  }
  const h = {ctx,container,dialog,panel,sent,timers,listeners,confirmations,savedFile,original,find,
    get frame(){return walk(container).find(n=>n.tag === 'iframe');},
    get retry(){return find('フォームだけを開き直す');},
    get help(){return walk(container).find(n=>n.tag === 'details');},
    clickRetry(){this.retry.events.click();},
    setCurrent(v){current=v;},allow(v){allowed=v;},closed:()=>closed,reloaded:()=>reloaded,
    child(frame=this.frame){return {parent:frame.contentWindow,postMessage:(data,origin)=>sent.push({data,origin})};},
    event(child,data={},extra={}) {return {source:child,origin:'https://n-test-script.googleusercontent.com',data:{channel:'joho-html-'+(kind==='download'?'distribution':'submission')+'-v1',bridge:new URL(this.frame.src).searchParams.get('bridge'),targetId,...data},...extra};},
    message(event){for (const fn of [...listeners]) fn(event);},
    connect(child=this.child()){this.message(this.event(child,{type:'hello',fileTransfer:'saved-html-v1'}));return child;},
    state(child,phase){this.message(this.event(child,{type:'state',phase}));}
  };
  return h;
}
for (const kind of ['download','submission']) {
  test(kind + ': 公式ログインリンク・学校案内・対処の注意。自動ログアウトなし',()=>{
    const h=setup(kind), login=h.find('Googleにログイン');
    assert.equal(login.href,'https://accounts.google.com/'); assert.equal(login.target,'_blank'); assert.equal(login.rel,'noopener noreferrer');
    assert.equal(login.events.click,undefined); assert.ok(h.find(accountAdvice));
    assert.ok(h.help.children[1].children.some(n=>n.textContent.includes('他のGoogleサービスもログアウト')));
    assert.ok(h.help.children[1].children.some(n=>n.textContent.includes('原因が必ず同じとは限りません')));
    assert.equal(h.closed(),0); assert.equal(h.reloaded(),0);
  });
  test(kind + ': 開き直しは新bridge。古いiframe・source・応答・タイマーを破棄',()=>{
    const h=setup(kind), oldFrame=h.frame, child=h.connect(), oldEvent=h.event(child,{type:'state',phase:kind==='download'?'issuing':'sending'});
    const oldListener=[...h.listeners][0], oldBridge=new URL(oldFrame.src).searchParams.get('bridge');
    h.state(child,'ready'); h.clickRetry();
    assert.notEqual(h.frame,oldFrame); assert.equal(oldFrame.isConnected,false);
    assert.notEqual(new URL(h.frame.src).searchParams.get('bridge'),oldBridge);
    assert.equal(h.listeners.size,1); assert.equal(h.timers.size,1); assert.equal(h.closed(),0); assert.equal(h.reloaded(),0);
    h.message(oldEvent); oldListener(oldEvent);
    assert.equal(h.confirmations.length,0); assert.equal(h.panel.canClose(),true);
    const freshChild=h.connect(); h.state(freshChild,'ready');
    assert.equal(h.sent.at(-1).data.type,'connect'); assert.ok(!('text' in h.sent.at(-1).data));
    assert.equal(JSON.stringify(h.savedFile),h.original);
  });
  test(kind + ': 20秒の待機案内でログイン対処を展開。親子統合と終了操作を維持',()=>{
    const h=setup(kind); [...h.timers.values()][0](); assert.equal(h.help.open,true);
    const child=h.connect(); h.message(h.event(child,{type:'layout',layout:'integrated-v1'}));
    assert.equal(h.timers.size,0); assert.equal(h.find('Googleにログイン').isConnected,true);
    h.panel.dispose(); assert.equal(h.frame,undefined); assert.equal(h.listeners.size,0);
    h.clickRetry(); assert.equal(h.frame,undefined);
  });
  test(kind + ': nonce生成失敗・信頼外のページでは埋込を作らない',()=>{
    for (const options of [{noCrypto:true},{origin:'https://evil.invalid'}]) {
      const h=setup(kind,options); assert.equal(h.frame,undefined); assert.equal(h.listeners.size,0);
      h.clickRetry(); assert.equal(h.frame,undefined); assert.equal(h.reloaded(),0);
    }
  });
  test(kind + ': origin/source/bridge/target/channel違いを再接続後も拒否',()=>{
    for (const change of [e=>e.origin='https://evil.invalid',e=>e.source={},e=>e.data.bridge='bad',e=>e.data.targetId='html11-01',e=>e.data.channel='bad']) {
      const h=setup(kind); h.clickRetry(); const child=h.child(), bad=h.event(child,{type:'hello'}); change(bad); h.message(bad);
      assert.equal(h.sent.length,0); h.connect(child); bad.data.type='state'; bad.data.phase=kind==='download'?'issuing':'sending'; h.message(bad);
      assert.equal(h.panel.canClose(),true);
    }
    const h=setup(kind),child=h.connect(); h.message(h.event(child,{type:'hello'},{origin:'https://other-script.googleusercontent.com'}));
    assert.equal(h.sent.length,1);
  });
  test(kind + ': 文書・提出先が変わっていたら再接続しない',()=>{
    const h=setup(kind),frame=h.frame; h.setCurrent(false); h.clickRetry(); assert.equal(h.frame,frame); assert.equal(h.closed(),0);
  });
}
for (const phase of ['issuing','uncertain','issued']) {
  test('download: '+phase+' は開き直さず終了確認と保存リンクを維持',()=>{
    const h=setup('download'),child=h.connect(),frame=h.frame; h.state(child,phase); h.allow(true); h.clickRetry();
    assert.equal(h.frame,frame); assert.equal(h.confirmations.length,0); assert.equal(h.listeners.size,1);
    h.allow(false); assert.equal(h.panel.canClose(),false);
    h.state(child,'error'); h.clickRetry(); assert.equal(h.frame,frame); assert.equal(h.panel.canClose(),false);
    h.state(child,'download-started'); h.clickRetry(); assert.notEqual(h.frame,frame);
  });
}
for (const phase of ['sending','checking','uncertain','received','grading','downloading']) {
  test('submission: '+phase+' は再送せず既存の受領・採点・控え確認を維持',()=>{
    const h=setup('submission'),child=h.connect(),frame=h.frame; h.state(child,phase); h.allow(true); h.clickRetry();
    assert.equal(h.frame,frame); assert.equal(h.confirmations.length,0); assert.equal(h.listeners.size,1);
    h.allow(false);
    assert.equal(h.panel.canClose(),phase==='received');
    h.state(child,'error'); h.clickRetry(); assert.equal(h.frame,frame);
  });
}
test('submission: 未送信の選択済みファイルは確認後だけ再接続する',()=>{
  const h=setup('submission'),child=h.connect(),frame=h.frame; h.state(child,'selected'); h.clickRetry(); assert.equal(h.frame,frame);
  assert.match(h.confirmations[0],/まだ提出していません/); h.allow(true); h.clickRetry(); assert.notEqual(h.frame,frame);
});
test('submission: 再接続時も能力・要求ID・transferId・現在の文書を照合して保存内容を渡す',()=>{
  const h=setup('submission'); h.clickRetry(); const child=h.connect(), request={type:'file-request',requestId:'a'.repeat(32),transferId:1};
  h.message(h.event(child,request)); assert.equal(h.sent.at(-1).data.type,'saved-file'); assert.equal(h.sent.at(-1).data.text,h.savedFile.text);
  assert.equal(h.sent.at(-1).origin,'https://n-test-script.googleusercontent.com');
  const before=h.sent.length;
  for (const bad of [{...request,transferId:-1},{...request,requestId:'bad'}]) h.message(h.event(child,bad));
  assert.equal(h.sent.length,before);
  h.setCurrent(false); h.message(h.event(child,{...request,transferId:2})); assert.equal(h.sent.at(-1).data.type,'file-unavailable'); assert.ok(!('text' in h.sent.at(-1).data));
  const manual=setup('submission',{manual:true}),manualChild=manual.connect(); manual.message(manual.event(manualChild,request)); assert.equal(manual.sent.length,1);
});
test('前回の受領は今回の提出完了にせず、閉じるときに未提出を確認する',()=>{
 const h=setup('submission'),child=h.connect();h.state(child,'checking');h.state(child,'previous-received');
 assert.equal(h.panel.needsAttention(),true);assert.equal(h.panel.canClose(),false);assert.match(h.confirmations.at(-1),/今回のファイルはまだ提出/);
 h.allow(true);assert.equal(h.panel.canClose(),true);
 h.state(child,'sending');assert.equal(h.panel.needsAttention(),true);h.state(child,'received');assert.equal(h.panel.needsAttention(),false);
});
