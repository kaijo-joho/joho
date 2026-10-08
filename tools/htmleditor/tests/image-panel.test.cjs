const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
class Element {
  constructor(tag,doc){this.tag=tag;this.ownerDocument=doc;this.children=[];this.events={};this.attrs={};this.hidden=false;this.downloads=[];}
  append(n){this.children.push(n);}setAttribute(k,v){this.attrs[k]=v;}removeAttribute(k){delete this.attrs[k];delete this[k];}
  addEventListener(k,fn){this.events[k]=fn;}focus(){this.ownerDocument.activeElement=this;}scrollIntoView(){this.scrolled=true;}
  click(){let prevented=false;this.events.click?.({preventDefault(){prevented=true;}});if(!prevented)this.downloads.push({url:this.href,name:this.download});}
}
function setup(state={}){
  const doc={activeElement:null,createElement:t=>new Element(t,doc)},prompts=[],urls=[],revoked=[];
  const URLClass=class extends URL{static createObjectURL(){const url='blob:'+urls.length;urls.push(url);return url;}static revokeObjectURL(url){revoked.push(url);}};
  const context={document:doc,URL:URLClass,Blob,Uint8Array,AbortController,setTimeout,clearTimeout,crypto:require('node:crypto').webcrypto,confirm:s=>{prompts.push(s);return false;}};
  vm.createContext(context);vm.runInContext(fs.readFileSync(require.resolve('../image-downloads.js'),'utf8'),context);
  const target={},images={},writes=[],calls=[];let resolve;
  const fileSystem={isSupported:()=>!state.fallback,isConnected:()=>!state.disconnected,getDirectoryName:()=> 'HTML実習',
    async requireWritePermission(){if(state.denied)throw Error('permission denied');return target;},
    async getImagesDirectory(){if(state.noImages)throw Error('Finderでimagesを作成してください。');return images;},
    async hasImage(){return Boolean(state.exists);},async writeNewImage(name,raw,directory,folder){writes.push({name,raw,directory,folder});if(state.failWrite)throw Error('write failure');if(state.holdWrite)await state.holdWrite;},
    onChange(fn){state.changed=fn;return()=>{state.unsubscribed=true;};}
  };
  const container=new Element('div',doc),panel=context.HtmlEditorImageDownloads.createPanel({container,lessonId:'html14',fileSystem,
    selectedName:'photo02.jpg',connectFolder:async()=>{state.disconnected=false;},loadAsset(asset,options){calls.push({asset,options});return new Promise((r,j)=>{resolve=(failed=false)=>failed?j(Error('fetch failure')):r(Uint8Array.from([1,2,3]));});},onSaved:()=>{state.preview=(state.preview||0)+1;}});
  const walk=n=>[n,...n.children.flatMap(walk)],rows=walk(container).filter(n=>n.className==='local-download-file');
  return {state,panel,prompts,urls,revoked,doc,calls,writes,target,images,container,walk,finish:(...a)=>resolve(...a),
    buttons:rows.map(r=>walk(r).find(n=>n.tag==='button')),statuses:rows.map(r=>walk(r).find(n=>n.attrs.role==='status')),links:rows.map(r=>walk(r).find(n=>n.tag==='a'))};
}
async function requested(h){for(let i=0;i<20&&!h.calls.length;i++)await new Promise(r=>setImmediate(r));assert.equal(h.calls.length,1);}
test('画像リンク指定のボタンへフォーカスし、1クリックで保存・確認・プレビュー更新',async()=>{
 const h=setup();h.panel.focusSelected();assert.equal(h.doc.activeElement,h.buttons[1]);assert(h.buttons[1].scrolled);
 h.buttons[0].focus();const pending=h.buttons[0].events.click();await requested(h);h.finish();await pending;
 assert.equal(h.writes[0].name,'photo01.jpg');assert.equal(h.writes[0].directory,h.target);assert.equal(h.writes[0].folder,h.images);
 assert.equal(h.state.preview,1);assert.match(h.statuses[0].textContent,/保存しました：HTML実習\/images\/photo01.jpg/);
 assert.equal(h.buttons[0].hidden,true);assert.equal(h.doc.activeElement,h.statuses[0]);assert.equal(h.urls.length,0);
 await h.buttons[0].events.click();assert.equal(h.calls.length,1);h.panel.dispose();assert(h.state.unsubscribed);
});
test('未接続・権限拒否・images未作成・同名画像は取得前に止める',async()=>{
 for(const state of [{disconnected:true},{denied:true},{noImages:true},{exists:true}]){
  const h=setup(state);await h.buttons[0].events.click();assert.equal(h.calls.length,0);assert.equal(h.writes.length,0);assert.equal(h.state.preview,undefined);
  assert.doesNotMatch(h.statuses[0].textContent,/保存しました/);h.panel.dispose();
 }
 const h=setup({disconnected:true});const connect=h.walk(h.container).find(n=>n.tag==='button'&&!h.buttons.includes(n));
 await connect.events.click();assert.equal(h.buttons[0].disabled,false);assert.equal(connect.hidden,true);h.panel.dispose();
});
test('連打は1取得、失敗の再試行は同じ画像、保存中は閉じられない',async()=>{
 const h=setup({failWrite:true});const pending=h.buttons[0].events.click();await requested(h);
 await h.buttons[0].events.click();await h.buttons[1].events.click();assert.equal(h.calls.length,1);h.finish();await pending;
 assert.equal(h.buttons[0].textContent,'保存を再試行');assert.equal(h.panel.canClose(),false);
 h.state.failWrite=false;let release;h.state.holdWrite=new Promise(r=>release=r);
 const retry=h.buttons[0].events.click();for(let i=0;i<20&&h.writes.length<2;i++)await new Promise(r=>setImmediate(r));
 assert.equal(h.panel.canClose(),false);assert.equal(h.statuses[0].attrs['aria-busy'],'true');release();await retry;
 assert.equal(h.calls.length,1);assert.equal(h.panel.canClose(),true);assert.equal(h.state.preview,1);h.panel.dispose();
});
test('取得失敗と画面を閉じた後の遅い応答で保存・プレビュー更新をしない',async()=>{
 const h=setup();let pending=h.buttons[0].events.click();await requested(h);h.finish(true);await pending;
 assert.equal(h.writes.length,0);assert.equal(h.buttons[0].disabled,false);
 pending=h.buttons[0].events.click();for(let i=0;i<20&&h.calls.length<2;i++)await new Promise(r=>setImmediate(r));
 h.panel.dispose();h.finish();await pending;assert.equal(h.writes.length,0);assert.equal(h.state.preview,undefined);assert(h.calls[1].options.signal.aborted);
});
test('非対応環境だけ通常DL・Finder案内・同じ画像の再保存を維持',async()=>{
 const h=setup({fallback:true});h.buttons[0].focus();const pending=h.buttons[0].events.click();await requested(h);h.finish();await pending;
 assert.equal(h.writes.length,0);assert.equal(h.links[0].downloads.length,1);assert.match(h.statuses[0].textContent,/HTML実習\/images/);
 assert.doesNotMatch(h.statuses[0].textContent,/保存しました/);h.links[0].click();assert.equal(h.links[0].downloads.length,2);assert.equal(h.calls.length,1);
 assert.equal(h.doc.activeElement,h.links[0]);h.panel.dispose();assert.deepEqual(h.revoked,h.urls);
});
