'use strict';
const assert=require('node:assert/strict');
const C=require('../core.js');
const doc=C.createDocument(),page=doc.pages[0];
const shape=C.makeShape('rect',10,20,180,80),text=C.makeText(12,34,'日本語\nH2O');
page.objects.push(shape,text);
const legacy=C.clone(doc);
assert.deepEqual(C.validateDocument(doc),legacy,'legacy documents do not acquire layout defaults');
const history=new C.History(doc);
history.change(d=>{
  d.pages[0].objects[0].label={runs:[{text:'手順 ',script:'normal'},{text:'2',script:'super'}],style:{...C.DEFAULT_STYLE,stroke:'none',fill:'#123456',fontSize:20},align:'center',padding:8};
  d.pages[0].objects[1].layout={width:120,align:'right'};
});
const authored=C.clone(history.document);
assert.equal(authored.version,4);
history.change(()=>{});assert.equal(history._undo.length,1,'unchanged edits add no history');
history.undo();assert.deepEqual(history.document,legacy,'one undo restores the entire previous model');
history.redo();assert.deepEqual(history.document,authored);
const moved=C.clone(authored),p=moved.pages[0],label=C.clone(p.objects[0].label);
C.transformObjects(p,[shape.id],[2,0,0,1,50,60]);
assert.deepEqual(p.objects[0].label,label,'resizing a body keeps its authored font size and padding');
const ids=C.duplicateObjects(p,[shape.id,text.id],20,30),copies=ids.map(id=>p.objects.find(o=>o.id===id));
assert.deepEqual(copies[0].label,label);assert.deepEqual(copies[1].layout,{width:120,align:'right'});
copies[0].label.runs[0].text='別の説明';
assert.deepEqual(p.objects[0].label,label,'duplicated labels are independently editable');
const pageId=C.duplicatePage(moved,p.id),copyPage=moved.pages.find(o=>o.id===pageId);
assert.deepEqual(copyPage.objects[0].label,label,'page duplication retains embedded labels');
const anim=C.clone(authored),later=C.createPage('後のページ'),laterShape=C.makeShape('rect',0,0,30,30);
later.objects.push(laterShape);later.animations=[{id:'fade',targets:[laterShape.id],effect:'fade',trigger:'click',duration:500,delay:0,mode:'in'}];
anim.pages.push(later);assert.equal(C.validateDocument(anim).version,4,'animation on a later page does not downgrade text features');
// A v4 document remains v4 after all advanced text is removed as well.
const emptied=C.clone(authored);delete emptied.pages[0].objects[0].label;delete emptied.pages[0].objects[1].layout;
assert.equal(C.validateDocument(emptied).version,4);
for(const layout of [{width:0,align:'left'},{width:-1,align:'center'},{width:Infinity,align:'right'},{width:null,align:'justify'},{width:120,align:'left',extra:true}]){
  assert.throws(()=>C.validateObject({...text,layout}));
}
for(const change of [v=>v.padding=-1,v=>v.padding=NaN,v=>v.align='justify',v=>v.extra=true,v=>v.runs[0].script='invalid',v=>v.runs[0].text='x'.repeat(C.LIMITS.textLength+1),v=>v.style.fill='red']){
  const value=C.clone(authored.pages[0].objects[0]);change(value.label);assert.throws(()=>C.validateObject(value));
}
const intact=C.clone(history.document);
assert.throws(()=>history.change(d=>d.pages[0].objects[0].label.padding=-1));
assert.deepEqual(history.document,intact,'invalid edits preserve the document');
const storage=new Map(),store=new C.Store({getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)});
store.save(authored,'auto');store.save(legacy,'saved');
assert.deepEqual(store.list().find(s=>s.kind==='auto').document,authored);
assert.deepEqual(store.list().find(s=>s.kind==='saved').document,legacy);
console.log('text-core.test.cjs: passed');
