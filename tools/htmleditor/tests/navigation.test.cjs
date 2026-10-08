const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
const Routing=require('../routing.js');
function setup({view=false,lessonId='html21',onImage}={}){
 const events={},winEvents={},docEvents={},calls=[],attrs={};
 const target={scrollIntoView:o=>calls.push(['scroll',o]),focus:o=>calls.push(['focus',o]),hasAttribute:k=>k in attrs,
  setAttribute:(k,v)=>attrs[k]=v,removeAttribute:k=>delete attrs[k],addEventListener:(k,f)=>target[k]=f};
 const doc={URL:'https://joho.kaijo.ed.jp/'+lessonId+'.html?view=lesson',readyState:'complete',querySelector:()=>({}),
  getElementById:id=>id==='main-content'?target:null,getElementsByName:()=>[],addEventListener:(k,f)=>docEvents[k]=f};
 const win={location:{href:doc.URL,replace:u=>win.location.href=u},scrollY:0,scrollTo:(...a)=>calls.push(['top',...a]),addEventListener:(k,f)=>winEvents[k]=f};doc.defaultView=win;
 if(view)win.HtmlPracticeLessonView={show:(hash,opts)=>calls.push(['view',hash,opts])};
 const iframe={contentWindow:win,contentDocument:doc,hasAttribute:()=>false,addEventListener:(k,f)=>events[k]=f};
 const location={href:'https://joho.kaijo.ed.jp/tools/htmleditor/index.html?lesson='+lessonId};
 const ctx={URL,location,HtmlEditorRouting:Routing,document:{documentElement:{dataset:{}},getElementById:()=>({})},
  history:{replaceState:(_,__,u)=>location.href=u,pushState:(_,__,u)=>location.href=u},
  addEventListener:(k,f)=>winEvents[k]=f,MutationObserver:class{observe(){}},setTimeout:()=>1,clearTimeout(){}};
 ctx.HtmlEditorImageDownloads={fromLink:(id,href)=>require('../image-downloads.js').fromLink(id,href,location.href)};
 ctx.window=ctx;vm.runInNewContext(fs.readFileSync(require.resolve('../navigation.js'),'utf8'),ctx);
 const nav=ctx.HtmlEditorNavigationMount({iframe,onSelect(){},onError:e=>{throw Error(e);},onImage});events.load();calls.length=0;
 return {nav,doc,win,docEvents,target,calls,attrs,location,events,iframe};
}
test('通常解説の本文リンクを捕捉した後、実際の本文へスクロール・フォーカスする',()=>{
 const h=setup();let prevented=false;
 const link={href:h.doc.URL+'#main-content',dataset:{},hasAttribute:()=>false};
 h.docEvents.click({button:0,target:{closest:()=>link},preventDefault:()=>prevented=true,stopImmediatePropagation(){}});
 assert(prevented);assert.equal(h.location.href.endsWith('#main-content'),true);
 assert.deepEqual(h.calls.map(c=>c[0]),['scroll','focus']);assert.equal(h.attrs.tabindex,'-1');h.target.blur();assert.equal(h.attrs.tabindex,undefined);
 h.win.scrollY=150;h.events.load();assert.equal(h.calls.length,2,'読んでいる位置を遅いloadで戻さない');
});
test('接続済みの現在の教材画像リンクだけ保存画面へ。修飾クリック・一般DL・古いiframeは維持',()=>{
 const calls=[],h=setup({lessonId:'html14',onImage:asset=>calls.push(asset.name)});
 function click(href,options={}){
  let prevented=false;const link={href,dataset:{},hasAttribute:name=>name==='download'};
  h.docEvents.click({button:0,target:{closest:()=>link},preventDefault:()=>prevented=true,stopImmediatePropagation(){},...options});return prevented;
 }
 const url='https://joho.kaijo.ed.jp/html/images/photo01.jpg';
 assert(click(url));assert.deepEqual(calls,['photo01.jpg']);
 for(const options of [{button:1},{ctrlKey:true},{metaKey:true},{shiftKey:true},{altKey:true}])assert.equal(click(url,options),false);
 for(const href of [url+'?x',url.replace('joho.kaijo.ed.jp','example.org'),url.replace('photo01.jpg','evolution_of_internet.png'),'https://joho.kaijo.ed.jp/html/practice-introduction.html'])assert.equal(click(href),false);
 h.iframe.contentDocument={};assert.equal(click(url),false);assert.equal(calls.length,1);
});
test('存在しないアンカーは安全に無視し、先頭へ戻る操作と既存専用ビューを維持',()=>{
 const h=setup();h.nav.navigate({lessonId:'html21',hash:'#missing'});assert.equal(h.calls.length,0);
 h.nav.navigate({lessonId:'html21',hash:''});assert.deepEqual(h.calls,[['top',0,0]]);
 const v=setup({view:true});v.nav.navigate({lessonId:'html21',hash:'#main-content'},'push',true);
 assert.equal(v.calls[0][0],'view');assert.equal(v.calls[0][1],'#main-content');assert.equal(v.calls.length,1);
});
