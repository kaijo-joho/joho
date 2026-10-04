const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
function setup(){
 const events=new Map(),sent=[],timers=new Map(),classes=new Set();let observe,disconnected=false;
 class Element{constructor(){this.children=[];this.isConnected=true;this.style={};}append(n){this.children.push(n);}setAttribute(){}remove(){this.isConnected=false;}}
 const document={documentElement:{dataset:{resolvedTheme:'dark',textSize:'large'}},createElement:()=>new Element()};
 const root={document,location:{origin:'https://joho.kaijo.ed.jp'},HtmlLocalProtocol:{ORIGIN:'https://joho.kaijo.ed.jp'},
  HtmlEditorDownload:{gasOrigin:o=>o==='https://script.googleusercontent.com',withinFrame:s=>s===source},
  crypto:require('node:crypto').webcrypto,URL,TextEncoder,setTimeout:(f,n)=>{timers.set(n,f);return n;},clearTimeout:n=>timers.delete(n),
  addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),
  MutationObserver:class{constructor(f){observe=f;}observe(){}disconnect(){disconnected=true;}}};root.top=root;
 const source={postMessage:(data,origin)=>sent.push({data,origin})},container=new Element(),dialog={classList:{add:(...names)=>names.forEach(n=>classes.add(n)),remove:(...names)=>names.forEach(n=>classes.delete(n))}};
 const context=vm.createContext(root);vm.runInContext(fs.readFileSync(require.resolve('../local-downloads.js'),'utf8'),context);
 const controller=new AbortController(),ticket={nonce:'1'.repeat(32)};
 const result=context.HtmlEditorLocalDownloads.confirmationBridge({container,dialog,url:'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/SYNTHETIC/exec',ticket,signal:controller.signal});
 const frame=container.children.find(n=>n.title),bridge=new URL(frame.src).searchParams.get('bridge');
 const receive=(type,extra={},event={})=>events.get('message')?.({origin:'https://script.googleusercontent.com',source,data:{channel:'joho-html-identity-v3',bridge,nonce:ticket.nonce,type,...extra},...event});
 return {result,frame,container,classes,sent,controller,receive,observe:()=>observe(),document,events,timers,disconnected:()=>disconnected};
}
test('本人確認iframeへテーマ・文字サイズを送信。照合済み応答だけ枠を外し高さを調整',async()=>{
 const h=setup();h.receive('hello');assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.theme,'dark');assert.equal(h.sent[0].data.fontSize,'large');assert.equal(h.sent[0].data.oldToken,'');
 h.receive('layout',{layout:'integrated-v1'},{origin:'https://evil.invalid'});assert(!h.classes.has('identity-integrated'));
 h.receive('layout',{layout:'integrated-v1',nonce:'wrong'});assert(!h.classes.has('identity-integrated'));
 h.receive('layout',{layout:'integrated-v1'});assert(h.classes.has('identity-integrated'));assert.equal(h.container.children[0].hidden,true);
 h.receive('height',{height:212});assert.equal(h.frame.style.height,'212px');h.receive('height',{height:50000});assert.equal(h.frame.style.height,'212px');
 h.document.documentElement.dataset.resolvedTheme='light';h.document.documentElement.dataset.textSize='largest';h.observe();assert.equal(h.sent.at(-1).data.type,'appearance');assert.equal(h.sent.at(-1).data.theme,'light');assert.equal(h.sent.at(-1).data.fontSize,'largest');assert(!('oldToken' in h.sent.at(-1).data));
 h.receive('proof',{response:{synthetic:true}});assert.deepEqual(await h.result,{synthetic:true});assert(h.disconnected());assert.equal(h.events.size,0);assert.equal(h.timers.size,0);assert.equal(h.classes.size,0);
});
test('取消時は通信監視・iframe・読み込み表示を破棄。別sourceからは接続しない',async()=>{
 const h=setup();h.receive('hello',{}, {source:{}});assert.equal(h.sent.length,0);h.controller.abort();await assert.rejects(h.result,/identity_confirmation_canceled/);assert.equal(h.frame.isConnected,false);assert(h.disconnected());assert.equal(h.events.size,0);
});
