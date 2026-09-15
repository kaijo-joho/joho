const assert=require('node:assert/strict');
const C=require('../core.js'),R=require('../render.js'),T=require('../transitions.js'),B=require('../parts.js');
const cases=[],test=(name,run)=>{run();cases.push(name);};
function states(){const d=C.createDocument('state');d.nodes=[C.createNode('state',80,150,{id:'a',text:'待機'}),C.createNode('state',440,150,{id:'b',text:'動作'}),C.createNode('state',800,150,{id:'other',text:'別の状態'})];d.edges=[C.createEdge({nodeId:'a'},{nodeId:'b'},{id:'ab',kind:'straight',label:{text:'開始',dx:7,dy:-20}}),C.createEdge({nodeId:'b'},{nodeId:'a'},{id:'ba',kind:'curve',label:{text:'停止'}}),C.createEdge({nodeId:'a'},{nodeId:'b'},{id:'ab2',kind:'orthogonal',waypoints:[{x:250,y:320}],label:{text:'再開'}}),C.createEdge({nodeId:'b'},{nodeId:'b'},{id:'loop',kind:'curve',label:{text:'更新'}}),C.createEdge({nodeId:'b'},{nodeId:'other'},{id:'outside'})];return d;}
test('Related transitions are spaced in both directions with labels, heads, styles and other objects retained',()=>{
 const d=states(),before=C.clone(d),result=T.plan(d,['ab'],{spacing:60});assert.deepEqual(d,before);assert.deepEqual(result.document.nodes,d.nodes);assert.equal(result.edgeIds.length,3);
 const edges=result.document.edges.slice(0,3),ys=edges.map(e=>R.edgeGeometry(result.document,e).handle.y).sort((a,b)=>a-b);assert.deepEqual(ys,[150,210,270]);
 edges.forEach((e,i)=>{assert.equal(e.kind,'curve');assert.deepEqual(e.waypoints,[]);assert.deepEqual(e.label,d.edges[i].label);assert.deepEqual(e.style,d.edges[i].style);assert.equal(e.from.nodeId,d.edges[i].from.nodeId);assert.equal(e.to.nodeId,d.edges[i].to.nodeId);});assert.deepEqual(result.document.edges.slice(3),d.edges.slice(3));
 assert.throws(()=>T.plan(d,['ab'],{related:false}),/2本以上/);
});
test('Self-loops support four sides for curved and orthogonal lines and remain on that side',()=>{
 for(const kind of ['curve','orthogonal'])for(const side of ['top','right','bottom','left']){const d=states();d.edges[3].kind=kind;const result=T.plan(d,['loop'],{mode:'loop',side,distance:100}),e=result.document.edges[3],g=R.edgeGeometry(result.document,e),n=d.nodes[1];assert.equal(e.kind,kind);assert.equal(e.from.side,side);assert.equal(e.to.side,side);assert.deepEqual(e.label,d.edges[3].label);const p=g.handle;assert.ok(side==='top'?p.y<n.y:side==='bottom'?p.y>n.y+n.h:side==='left'?p.x<n.x:p.x>n.x+n.w);assert.deepEqual(result.document.edges.slice(0,3),d.edges.slice(0,3));}
});
test('Label placement and reset change no path data; fixed and invalid inputs reject atomically',()=>{
 const d=states(),before=C.clone(d),changed=T.plan(d,['ab'],{mode:'label',related:false,t:.8,dx:35,dy:-40}).document;
 assert.deepEqual(changed.edges[0],{...d.edges[0],label:{text:'開始',t:.8,dx:35,dy:-40}});assert.deepEqual(T.plan(changed,['ab'],{mode:'reset-label',related:false}).document.edges[0].label,{text:'開始',t:.5,dx:0,dy:-12});
 d.edges[1].locked=true;const fixed=C.clone(d);assert.throws(()=>T.plan(d,['ab'],{}),/固定/);assert.deepEqual(d,fixed);
 assert.throws(()=>T.plan(before,['ab'],{spacing:0}),/数値/);assert.throws(()=>T.plan(before,['loop'],{mode:'loop',side:'auto'}),/向き/);assert.throws(()=>T.plan(before,['ab'],{mode:'label',t:2}),/数値/);assert.throws(()=>T.plan(C.createDocument(),[],{}),/状態遷移図/);
});
test('Transition plans round trip through files, parts and one history operation',()=>{
 const d=states(),history=new C.History(d),after=T.plan(d,['ab','loop'],{mode:'loop',side:'top'}).document;history.commit(after);assert.deepEqual(history.undo(),d);assert.deepEqual(history.redo(),after);assert.deepEqual(C.parseDocument(C.serializeDocument(after)),after);
 const item=B.capture(after,after.nodes.map(n=>n.id),'調整した状態');assert.ok(B.documentFor(item).edges.some(e=>e.id==='loop'&&e.from.side==='top'));
});
test('Activity branch and parallel sets keep lane membership and form one editable group',()=>{
 for(const kind of ['branch','parallel']){const d=C.createDocument('activity'),before=C.clone(d),result=C.addActivitySet(d,kind,{y:100});assert.equal(d.nodes.length,4);assert.equal(d.edges.length,4);assert.equal(d.groups.length,1);assert.deepEqual(new Set(d.groups[0].memberIds),new Set(result.ids));assert.deepEqual(d.lanes,before.lanes);
 for(const n of d.nodes){const l=d.lanes.find(l=>l.id===n.laneId);assert.ok(n.x>=l.x&&n.x+n.w<=l.x+l.w&&n.y>=l.y+48&&n.y+n.h<=l.y+l.h);}
 assert.equal(d.nodes[0].kind,kind==='branch'?'decision':'fork');assert.equal(d.nodes[3].kind,kind==='branch'?'merge':'join');assert.equal(d.edges.filter(e=>e.from.nodeId===d.nodes[0].id).length,2);assert.equal(d.edges.filter(e=>e.to.nodeId===d.nodes[3].id).length,2);assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
 const history=new C.History(before);history.commit(d);assert.deepEqual(history.undo(),before);assert.deepEqual(history.redo(),d);}
});
test('Activity set failure never leaves partial nodes, lanes, groups or edges',()=>{
 const d=C.createDocument('activity'),before=C.clone(d);assert.throws(()=>C.addActivitySet(d,'branch',{y:600}),/余白/);assert.deepEqual(d,before);assert.throws(()=>C.addActivitySet(d,'branch',{secondLaneId:d.lanes[0].id}),/余白/);assert.deepEqual(d,before);assert.throws(()=>C.addActivitySet(d,'unknown'),/種類/);assert.throws(()=>C.addActivitySet(d,'parallel',{laneId:'missing'}),/担当/);
 d.lanes[0].w=500;d.lanes[1].x=540;const result=C.addActivitySet(d,'parallel',{y:100,secondLaneId:d.lanes[0].id});assert.equal(result.ids.length,8);assert.ok(d.nodes.every(n=>n.laneId===d.lanes[0].id));
});
test('All three diagram types have reusable example templates with valid endpoints, lanes and SVG',()=>{
 for(const type of ['flowchart','activity','state'])assert.ok(C.TEMPLATES.filter(t=>t.diagramType===type).length>=3);
 for(const meta of C.TEMPLATES){const d=C.createTemplate(meta.id);assert.equal(d.diagramType,meta.diagramType);assert.equal(d.title,meta.title);assert.ok(d.nodes.length>1&&d.edges.length>0);assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);for(const e of d.edges){assert.ok(d.nodes.some(n=>n.id===e.from.nodeId));assert.ok(d.nodes.some(n=>n.id===e.to.nodeId));}assert.doesNotMatch(R.svgDocument(d),/NaN|undefined/);}
 for(const id of ['activity-choice','activity-handoff'])for(const n of C.createTemplate(id).nodes){assert.ok(n.laneId);}
});
console.log(JSON.stringify({ok:true,cases},null,2));
