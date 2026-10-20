const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const sourceText=fs.readFileSync(require.resolve('../download-availability.js'),'utf8');
function setup(){
 const events=new Map(),timers=new Map(),sent=[];let observe,disconnected=false,reload,helpText='';
 const source={postMessage:(data,origin)=>sent.push({data,origin})};
 class Element{constructor(tag){this.tag=tag;this.children=[];this.isConnected=true;this.style={};this.contentWindow=tag==='iframe'?source:null;}append(n){this.children.push(n);}setAttribute(){}remove(){this.isConnected=false;}}
 const document={documentElement:{dataset:{resolvedTheme:'dark',textSize:'largest'}},createElement:t=>new Element(t)};
 const help=new Element('details'),container=new Element('div');
 const root={document,URL,Date,Intl,crypto:require('node:crypto').webcrypto,location:{origin:'https://joho.kaijo.ed.jp'},
  setTimeout:(f,n)=>{timers.set(n,f);return n;},clearTimeout:n=>timers.delete(n),
  addEventListener:(k,f)=>events.set(k,f),removeEventListener:k=>events.delete(k),
  MutationObserver:class{constructor(f){observe=f;}observe(){}disconnect(){disconnected=true;}},
  HtmlEditorDownload:{gasOrigin:o=>o==='https://script.googleusercontent.com',withinFrame:(s,w)=>s===w,
   loginHelp:(host,fn)=>{host.append(help);reload=fn;return {element:help,say:t=>helpText=t};}}};root.top=root;
 vm.createContext(root);vm.runInContext(sourceText,root);
 const controller=new AbortController(),request={targetId:'html14-01',identity:'synthetic-identity-not-in-url'};
 const result=root.HtmlDownloadGate.bridge({container,url:'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/SYNTHETIC/exec',request,signal:controller.signal});
 const frame=()=>container.children.findLast(n=>n.tag==='iframe'),nonce=()=>sent[0]?.data.nonce;
 const receive=(type,extra={},event={})=>events.get('message')?.({origin:'https://script.googleusercontent.com',source,
  data:{channel:'joho-html-download-v3',bridge:new URL(frame().src).searchParams.get('bridge'),nonce:nonce(),type,...extra},...event});
 return {root,request,result,controller,receive,container,frame,help,timers,events,sent,reload:()=>reload(),observe:()=>observe(),helpText:()=>helpText,disconnected:()=>disconnected};
}
test('iframeのorigin/source/bridge/nonceを照合し、本人情報はURLや外観更新へ入れない',async()=>{
 const h=setup();assert.doesNotMatch(h.frame().src,/identity|targetId/);
 h.receive('hello',{}, {origin:'https://evil.invalid'});h.receive('hello',{}, {source:{}});h.receive('hello',{bridge:'x'});assert.equal(h.sent.length,0);
 h.receive('hello');assert.equal(h.sent.length,1);assert.equal(h.sent[0].data.identity,h.request.identity);
 assert.equal(h.sent[0].data.theme,'dark');assert.equal(h.sent[0].data.fontSize,'largest');
 const response={v:1,targetId:'html14-01',allowed:true};
 h.receive('result',{response,nonce:'bad'});assert.equal(h.events.size,1);
 h.observe();assert.equal(h.sent.at(-1).data.type,'appearance');assert(!('identity' in h.sent.at(-1).data));
 h.receive('checking');assert.equal(h.frame().hidden,true);
 h.receive('result',{response});assert.deepEqual(await h.result,response);assert.equal(h.events.size,0);assert.equal(h.timers.size,0);assert.equal(h.frame().isConnected,false);assert(h.disconnected());
});
test('配付開始前の応答と日時を安全に表示。余分な個人情報や別課題の応答を拒否',async()=>{
 const h=setup();h.receive('hello');const response={v:1,targetId:'html14-01',allowed:false,reason:'before_start',startAt:'2026-10-21T00:00:00.000Z'};
 h.receive('result',{response});const value=await h.result;assert.equal(value.allowed,false);
 assert.match(h.root.HtmlDownloadGate.message({downloadAvailability:value}),/2026\/10\/21.*09:00/);
 for(const bad of [{...response,targetId:'html12-01'},{...response,startAt:'2026/10/21'},{...response,email:'not-for-parent'},
  {v:1,targetId:'html14-01',allowed:true,email:'not-for-parent'}])assert.throws(()=>h.root.HtmlDownloadGate.response(bad,'html14-01'),/availability_unavailable/);
});
test('取り消した画面と古い応答は片付け、通信失敗は取得許可へ読み替えない',async()=>{
 const h=setup();h.receive('hello');h.controller.abort();await assert.rejects(h.result,{name:'AbortError'});
 assert.equal(h.events.size,0);assert.equal(h.timers.size,0);assert.equal(h.frame().isConnected,false);
 const failed=setup();failed.receive('hello');failed.receive('error');await assert.rejects(failed.result,/availability_unavailable/);
 assert.equal(failed.events.size,0);assert.match(failed.root.HtmlDownloadGate.message({downloadAvailability:{reason:'availability_unavailable'}}),/新しいファイルは保存していません/);
});
test('ログイン画面だけを再読込でき、前のbridgeを拒否する',async()=>{
 const h=setup(),old=h.frame(),bridge=new URL(old.src).searchParams.get('bridge');
 h.timers.get(20000)();assert.equal(h.help.open,true);assert.match(h.helpText(),/学校アカウント/);
 h.timers.get(180000)();assert.equal(h.events.size,1);h.reload();assert.notEqual(h.frame(),old);assert.equal(old.isConnected,false);
 h.receive('hello',{bridge});assert.equal(h.sent.length,0);h.receive('hello');const current=h.frame();h.reload();assert.equal(h.frame(),current);assert.match(h.helpText(),/確認中/);
 h.receive('result',{response:{v:1,targetId:'html14-01',allowed:true}});await h.result;
});
test('GAS側は正規の親との接続後だけ一度RPCを呼び、重複hello/connectで再実行しない',()=>{
 const template=fs.readFileSync(require('node:path').resolve(__dirname,'../../../scripts/html-download-gas/25_htmlDownloadAvailability.html'),'utf8');
 const code=template.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= bootJson ?>',JSON.stringify({bridge:'b'.repeat(48)}));
 const events={},sent=[],calls=[];const top={postMessage:(d,o)=>sent.push({d,o})},root={top,addEventListener:(k,f)=>events[k]=f};
 const chain={withSuccessHandler:f=>{chain.success=f;return chain;},withFailureHandler:f=>{chain.failure=f;return chain;},getHtmlDownloadAvailabilityV3:r=>calls.push(r)};
 const box=vm.createContext({window:root,document:{getElementById:()=>({}),documentElement:{dataset:{}}},google:{script:{run:chain}},setInterval:()=>1,clearInterval:()=>{}});vm.runInContext(code,box);
 const data={channel:'joho-html-download-v3',bridge:'b'.repeat(48),nonce:'c'.repeat(32),type:'connect',identity:'synthetic',targetId:'html14-01'};
 events.message({source:{},origin:'https://joho.kaijo.ed.jp',data});events.message({source:top,origin:'https://evil.invalid',data});assert.equal(calls.length,0);
 events.message({source:top,origin:'https://joho.kaijo.ed.jp',data});events.message({source:top,origin:'https://joho.kaijo.ed.jp',data});assert.equal(calls.length,1);
 assert.deepEqual(Object.keys(calls[0]).sort(),['bridge','identity','nonce','targetId']);
 chain.success({nonce:'c'.repeat(32),result:{v:1,targetId:'html14-01',allowed:true}});assert.equal(sent.at(-1).d.type,'result');assert.equal(sent.at(-1).o,'https://joho.kaijo.ed.jp');
});
