const assert = require('node:assert/strict');
const C = require('../core.js');
const cases = [];
function test(name, run) { run(); cases.push(name); }
test('Every teaching template survives a complete JSON round trip', () => {
  for (const t of C.TEMPLATES) {
    const d = C.createTemplate(t.id);
    assert.deepEqual(C.parseDocument(C.serializeDocument(d)), d);
    assert.ok(d.nodes.length && d.edges.length);
  }
});
test('Parallel edges, cycles, free endpoints and labels retain independent identities', () => {
  const d = C.createTemplate('state-device');
  d.edges.push(C.createEdge({x:-90,y:25},{x:10,y:30},{label:{text:'途中の線\n条件',t:.2,dx:70,dy:-42},bend:{x:-60,y:-35}}));
  const output = C.parseDocument(C.serializeDocument(d));
  assert.deepEqual(output,d);
  assert.ok(output.edges.some(e=>e.from.nodeId===e.to.nodeId));
  assert.equal(new Set(output.edges.map(e=>e.id)).size,output.edges.length);
});
test('Invalid files reject atomically, including future versions and missing references', () => {
  const original = C.createTemplate('flow-branch'), snapshot = JSON.stringify(original);
  const broken = [null,[],{},'{', {...original,version:3}, {...original,format:'other'}, {...original,nodes:[{...original.nodes[0],x:NaN}]}, {...original,nodes:[{...original.nodes[0],kind:'__proto__'}]}, {...original,edges:[{...original.edges[0],to:{nodeId:'missing'}}]}, {...original,nodes:[original.nodes[0],original.nodes[0]]}];
  for(const value of broken)assert.throws(()=>C.parseDocument(value));
  assert.equal(JSON.stringify(original),snapshot);
});
test('Copying a connected group reconnects to new IDs without linking to originals', () => {
  const d = C.createTemplate('flow-branch'), originalNodes = C.clone(d.nodes), originalEdges = C.clone(d.edges);
  const payload = C.copySelection(d,d.nodes.map(n=>n.id));
  const pasted = C.pasteSelection(d,payload,70,20), newNodes = d.nodes.slice(originalNodes.length), newEdges = d.edges.slice(originalEdges.length);
  assert.equal(newNodes.length,originalNodes.length); assert.equal(newEdges.length,originalEdges.length);
  assert.equal(pasted.length,newNodes.length+newEdges.length);
  const ids = new Set(newNodes.map(n=>n.id));
  for(const e of newEdges){assert.ok(ids.has(e.from.nodeId));assert.ok(ids.has(e.to.nodeId));}
  assert.equal(newNodes[0].x,originalNodes[0].x+70);
  C.removeSelection(d,pasted);assert.deepEqual(d.nodes,originalNodes);assert.deepEqual(d.edges,originalEdges);
});
test('An explicitly copied edge detaches safely when its nodes are not copied', () => {
  const d = C.createTemplate('state-device');const payload = C.copySelection(d,[d.edges[0].id]);
  assert.equal(payload.nodes.length,0); assert.ok(Number.isFinite(payload.edges[0].from.x));
  const ids = C.pasteSelection(d,payload);assert.equal(ids.length,1);C.parseDocument(d);
});
test('Deleting a node removes attached edges but retains unrelated cycles', () => {
  const d = C.createTemplate('state-device'), target=d.nodes[0].id, unrelated=d.edges.filter(e=>e.from.nodeId!==target&&e.to.nodeId!==target);
  C.removeSelection(d,[target]);assert.deepEqual(d.edges,unrelated);C.parseDocument(d);
});
test('History records one gesture, does not alias documents and discards redo after a new edit', () => {
  const d = C.createTemplate('flow-branch'), original=C.clone(d), h=new C.History(d);
  for(let i=0;i<20;i++)d.nodes[0].x+=2;
  h.commit(d);assert.deepEqual(h.undo(),original);const moved=h.redo();assert.equal(moved.nodes[0].x,original.nodes[0].x+40);
  moved.nodes[0].text='新しい編集';h.undo();h.commit(moved);assert.equal(h.canRedo,false);
  assert.equal(h.commit(moved),false);moved.nodes[0].text='外側の変更';assert.notEqual(h.undo().nodes[0].text,'外側の変更');
});
test('Text remains plain data and clipboard failures leave destination unchanged', () => {
  const d=C.createTemplate('activity-parallel');d.nodes[1].text='<script>alert(1)</script> & 日本語';
  assert.equal(C.parseDocument(C.serializeDocument(d)).nodes[1].text,d.nodes[1].text);
  const before=C.clone(d);assert.throws(()=>C.pasteSelection(d,{format:'kaijo-diagram-selection',version:1,nodes:[{id:'bad'}],edges:[]}));assert.deepEqual(d,before);
});
test('Inserting a process retains the original endpoints, condition, style and direction', () => {
  for (const kind of ['orthogonal','straight','curve']) for (const head of ['end','both','none']) {
    const d=C.createTemplate('flow-branch'), old=d.edges.find(e=>e.label.text==='いいえ'); old.kind=kind; old.head=head;
    old.style.stroke='#b83232'; const original=C.clone(old), before=C.clone(d), history=new C.History(d);
    const n=C.createNode('process',26,390,{text:'記録する'}), result=C.insertNodeOnEdge(d,old.id,n,{entrySide:'top',exitSide:'bottom'});
    const incoming=d.edges.find(e=>e.id===result.edgeIds[0]), outgoing=d.edges.find(e=>e.id===result.edgeIds[1]);
    assert.deepEqual(incoming.from,original.from); assert.deepEqual(outgoing.to,original.to);
    assert.equal(incoming.to.nodeId,n.id); assert.equal(outgoing.from.nodeId,n.id);
    assert.deepEqual(incoming.label,original.label); assert.equal(outgoing.label.text,'');
    for(const e of [incoming,outgoing]) { assert.equal(e.kind,kind); assert.equal(e.head,head); assert.deepEqual(e.style,original.style); }
    assert.equal(d.nodes.length,before.nodes.length+1); assert.equal(d.edges.length,before.edges.length+1);
    history.commit(d); assert.deepEqual(history.undo(),before); assert.deepEqual(history.redo(),d);
    assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
  }
});
test('A short run opens a gap, moves its continuation and stops at the loop source', () => {
  const d=C.createTemplate('flow-branch'), old=d.edges[1], source=C.getNode(d,old.from.nodeId), target=C.getNode(d,old.to.nodeId), before=C.clone(d);
  const unrelated=C.createNode('process',700,440,{text:'別の図'}); d.nodes.push(unrelated);
  const n=C.createNode('process',226,210);
  C.insertNodeOnEdge(d,old.id,n,{entrySide:'top',exitSide:'bottom',direction:'down'});
  const added=C.getNode(d,n.id), after=C.getNode(d,target.id), delta=after.y-target.y;
  assert.ok(delta>0); assert.ok(added.y>=source.y+source.h+36); assert.ok(after.y>=added.y+added.h+36);
  assert.deepEqual(C.getNode(d,source.id),source); assert.deepEqual(C.getNode(d,unrelated.id),unrelated);
  for(const text of ['修正する','終了']) { const oldNode=before.nodes.find(n=>n.text===text); assert.equal(C.getNode(d,oldNode.id).y,oldNode.y+delta); }
});
test('Activity insertion keeps lane membership and free and self-loop edges remain valid', () => {
  const d=C.createTemplate('activity-parallel'), old=d.edges[0], n=C.createNode('action',106,117);
  C.insertNodeOnEdge(d,old.id,n,{entrySide:'top',exitSide:'bottom',direction:'down'});
  assert.equal(C.getNode(d,n.id).laneId,d.lanes[0].id);
  for(const l of d.lanes)for(const n of d.nodes.filter(n=>n.laneId===l.id))assert.ok(l.y+l.h>=n.y+n.h);
  const free=C.createEdge({x:700,y:10},{x:700,y:300});d.edges.push(free);
  C.insertNodeOnEdge(d,free.id,C.createNode('action',616,120));
  const self=C.createEdge({nodeId:n.id},{nodeId:n.id},{kind:'curve'}); d.edges.push(self);
  C.insertNodeOnEdge(d,self.id,C.createNode('action',400,100));
  C.parseDocument(d);
});
test('Inserting inside a loop does not push its earlier return target over the decision', () => {
  const d=C.createTemplate('flow-branch'),e=d.edges.find(e=>e.label.text==='はい'),source=C.clone(C.getNode(d,e.from.nodeId)),earlier=C.clone(d.nodes.find(n=>n.text==='内容を確認'));
  const n=C.createNode('process',226,368);C.insertNodeOnEdge(d,e.id,n,{entrySide:'top',exitSide:'bottom',direction:'down'});
  assert.deepEqual(C.getNode(d,source.id),source);assert.deepEqual(C.getNode(d,earlier.id),earlier);
  const inserted=C.getNode(d,n.id),target=d.nodes.find(n=>n.text==='修正する');
  assert.ok(inserted.y>=source.y+source.h+36);assert.ok(target.y>=inserted.y+inserted.h+36);
});
test('Branch set creates two labelled paths that rejoin and can be copied as one selection', () => {
  const d=C.createDocument(), before=C.clone(d), history=new C.History(d), result=C.addBranch(d,320,180);
  const decision=C.getNode(d,result.nodeId), merge=d.nodes.find(n=>n.kind==='junction');
  assert.equal(d.nodes.length,4);assert.equal(d.edges.length,4);assert.equal(result.ids.length,8);
  assert.equal(decision.kind,'decision');
  for(const label of ['はい','いいえ']) {
    const branch=d.edges.find(e=>e.label.text===label); assert.equal(branch.from.nodeId,decision.id);
    assert.equal(branch.from.side,label==='いいえ'?'left':'right'); assert.equal(branch.from.offset,.5);
    assert.equal(C.getNode(d,branch.to.nodeId).kind,'process');
    assert.ok(d.edges.some(e=>e.from.nodeId===branch.to.nodeId&&e.to.nodeId===merge.id));
  }
  history.commit(d); assert.deepEqual(history.undo(),before); assert.deepEqual(history.redo(),d);
  assert.equal(C.pasteSelection(d,C.copySelection(d,result.ids),500,0).length,8); C.parseDocument(d);
});
test('Compound additions fail atomically at the document limits and on missing edges', () => {
  const d=C.createDocument();d.nodes=Array.from({length:997},(_,i)=>C.createNode('process',0,0,{id:`node_${i}`}));
  let before=C.clone(d);assert.throws(()=>C.addBranch(d,0,0));assert.deepEqual(d,before);
  assert.throws(()=>C.insertNodeOnEdge(d,'missing',C.createNode('process',0,0)));assert.deepEqual(d,before);
  d.edges.push(C.createEdge({nodeId:d.nodes[0].id},{nodeId:d.nodes[1].id}));d.nodes.push(C.createNode('process',0,0));before=C.clone(d);
  assert.throws(()=>C.insertNodeOnEdge(d,d.edges[0].id,C.createNode('process',0,0)));assert.deepEqual(d,before);
});
test('Shape changes preserve identities, text, styles, lane membership and all connections', () => {
  for(const kind of Object.keys(C.NODE_DEFS)) {
    const d=C.createTemplate('activity-parallel'),n=d.nodes.find(n=>n.kind==='action'),before=C.clone(d);
    n.text='条件を確認\nscore ≥ 60';n.style.fill='#ffeeaa';const original=C.clone(n);
    C.changeNodeShape(d,[n.id],kind);
    const changed=C.getNode(d,n.id);
    for(const key of ['id','text','style','laneId'])assert.deepEqual(changed[key],original[key]);
    assert.equal(changed.x+changed.w/2,original.x+original.w/2);assert.equal(changed.y+changed.h/2,original.y+original.h/2);
    assert.deepEqual(d.edges,before.edges);assert.deepEqual(d.lanes,before.lanes);
    assert.deepEqual(d.nodes.filter(n=>n.id!==original.id),before.nodes.filter(n=>n.id!==original.id));
    assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
  }
});
test('Batch shape changes have a single undo and same-shape choices are no-ops', () => {
  const d=C.createTemplate('flow-branch'),original=C.clone(d),ids=d.nodes.slice(0,3).map(n=>n.id),h=new C.History(d);
  assert.deepEqual(C.changeNodeShape(d,[d.nodes[1].id],'process'),[]);assert.equal(h.commit(d),false);
  C.changeNodeShape(d,ids,'decision');h.commit(d);assert.ok(d.nodes.slice(0,3).every(n=>n.kind==='decision'));
  assert.deepEqual(h.undo(),original);assert.deepEqual(h.redo(),d);
  const state=C.createDocument('state'),n=C.createNode('state',40,60,{w:200,h:80,variant:'round',text:'状態'});state.nodes=[n];
  C.changeNodeShape(state,[n.id],'state',{variant:'circle'});let changed=state.nodes[0];assert.equal(changed.w,changed.h);assert.equal(changed.x+changed.w/2,140);assert.equal(changed.y+changed.h/2,100);
  C.changeNodeShape(state,[n.id],'process');assert.equal(Object.hasOwn(state.nodes[0],'variant'),false);assert.equal(state.nodes[0].text,'状態');
});
test('Arrow shape and head changes preserve labels and endpoints, including mixed batches', () => {
  const d=C.createTemplate('flow-sequence'),a=d.edges[0],b=d.edges[1];a.kind='curve';a.bend={x:500,y:90};b.label.text='はい';b.head='both';
  const before=C.clone(d),ids=[a.id,b.id];C.changeEdgeShape(d,ids,{kind:'curve'});
  assert.deepEqual(d.edges[0],before.edges[0],'Selecting an existing curve must retain its manual route');
  assert.equal(d.edges[1].kind,'curve');assert.equal(d.edges[1].bend,null);
  for(const key of ['id','from','to','style','label','head'])assert.deepEqual(d.edges[1][key],before.edges[1][key]);
  const curves=C.clone(d);C.changeEdgeShape(d,ids,{head:'none'});
  assert.ok(d.edges.slice(0,2).every(e=>e.head==='none'));assert.deepEqual(d.nodes,before.nodes);
  for(let i=0;i<2;i++)for(const key of ['from','to','label','bend','kind'])assert.deepEqual(d.edges[i][key],curves.edges[i][key]);
  assert.deepEqual(C.changeEdgeShape(d,ids,{head:'none'}),[]);
});
test('Invalid shape changes and impossible straight self loops reject atomically', () => {
  const d=C.createTemplate('state-device'),before=C.clone(d),ids=d.edges.map(e=>e.id);
  assert.throws(()=>C.changeEdgeShape(d,ids,{kind:'straight'}));assert.deepEqual(d,before);
  assert.throws(()=>C.changeEdgeShape(d,ids,{head:'unknown'}));assert.deepEqual(d,before);
  assert.throws(()=>C.changeNodeShape(d,[d.nodes[0].id],'__proto__'));assert.deepEqual(d,before);
  assert.throws(()=>C.changeNodeShape(d,[d.nodes[0].id],'state',{variant:'unknown'}));assert.deepEqual(d,before);
  const limit=C.createDocument();limit.nodes=[C.createNode('process',-100000,-100000,{w:1,h:1})];const snapshot=C.clone(limit);
  assert.throws(()=>C.changeNodeShape(limit,[limit.nodes[0].id],'decision'));assert.deepEqual(limit,snapshot);
});
test('Version 1 migrates and version 2 rejects malformed groups and lessons', () => {
  const current=C.createTemplate('flow-sequence'), old=C.clone(current);old.version=1;delete old.groups;delete old.lesson;
  for(const item of [...old.nodes,...old.edges,...old.lanes])delete item.locked;
  const migrated=C.parseDocument(old);assert.equal(migrated.version,2);assert.deepEqual(migrated.groups,[]);assert.equal(migrated.lesson,null);assert.ok([...migrated.nodes,...migrated.edges,...migrated.lanes].every(item=>item.locked===false));
  const omitted=C.clone(current);for(const item of [...omitted.nodes,...omitted.edges,...omitted.lanes])delete item.locked;assert.ok([...C.parseDocument(omitted).nodes,...C.parseDocument(omitted).edges].every(item=>item.locked===false));
  assert.throws(()=>C.parseDocument({...current,groups:[{id:'group_bad',memberIds:[current.nodes[0].id]}]}));
  assert.throws(()=>C.parseDocument({...current,lesson:{instructions:1,studentMode:false}}));
});
test('Groups expand, copy and remove as units while locks protect authored content', () => {
  const d=C.createTemplate('flow-sequence'), gid=C.groupSelection(d,d.nodes.slice(0,2).map(n=>n.id));
  assert.ok(C.expandSelection(d,[gid]).length>=3);assert.deepEqual(C.setLocked(d,[gid],true).sort(),C.expandSelection(d,[gid]).sort());
  const changed=C.clone(d);changed.nodes[0].text='変更';assert.throws(()=>C.assertEditable(d,changed));
  const copied=C.copySelection(d,[gid]);const pasted=C.pasteSelection(d,copied);assert.ok(pasted.length>=3);assert.ok(d.nodes.slice(-2).every(n=>n.locked===false));
  const before=d.groups.length;C.removeSelection(d,[gid]);assert.ok(d.groups.length<before);C.parseDocument(d);
});
test('Manual trace handles a sequence, a fork/join wait and pure backtracking', () => {
  const d=C.createTemplate('flow-sequence');let s=C.createTrace(d,C.traceStarts(d)[0]);
  while(s.status==='ready'){const option=C.traceOptions(d,s)[0];s=C.stepTrace(d,s,option.nodeId,option.edgeId);}
  assert.equal(s.status,'complete');assert.equal(s.history.length,5);assert.equal(C.backTrace(s).history.length,4);
  const p=C.createTemplate('activity-parallel');s=C.createTrace(p,C.traceStarts(p)[0]);
  for(let i=0;i<3;i++){const option=C.traceOptions(p,s)[0];s=C.stepTrace(p,s,option.nodeId,option.edgeId);}
  assert.equal(s.current.length,2);const option=C.traceOptions(p,s)[0];s=C.stepTrace(p,s,option.nodeId,option.edgeId);assert.ok(s.waiting.length||s.current.length);
  const none=C.createEdge({nodeId:p.nodes[1].id},{x:999,y:1},{head:'none'});p.edges.push(none);assert.equal(C.traceOptions(p,C.createTrace(p,p.nodes[1].id)).find(o=>o.edgeId===none.id).status,'unavailable');
});
test('Trace retains independent tokens across joins, terminals and repeated positions', () => {
  const d=C.createTemplate('activity-parallel');const fork=d.nodes.find(n=>n.kind==='fork'),join=d.nodes.find(n=>n.kind==='join');
  const extra=C.createNode('action',706,320,{text:'別の枝'}),end=C.createNode('terminal',776,480,{text:'終了'});d.nodes.push(extra,end);
  d.edges.push(C.createEdge({nodeId:fork.id},{nodeId:extra.id}),C.createEdge({nodeId:extra.id},{nodeId:end.id}));C.parseDocument(d);
  let s=C.createTrace(d,C.traceStarts(d)[0]);
  for(let i=0;i<2;i++){const o=C.traceOptions(d,s)[0];s=C.stepTrace(d,s,o.nodeId,o.edgeId);} s=C.stepTrace(d,s,fork.id,null);
  const branches=C.traceOptions(d,s), first=branches.find(o=>C.getNode(d,o.nodeId).text==='資料を集める'), second=branches.find(o=>C.getNode(d,o.nodeId).text==='図を作る'), third=branches.find(o=>o.nodeId===extra.id);
  s=C.stepTrace(d,s,first.nodeId,first.edgeId);assert.deepEqual(s.waiting,[{nodeId:join.id,arrived:1,required:2}]);
  s=C.stepTrace(d,s,second.nodeId,second.edgeId);assert.ok(s.current.includes(join.id));assert.ok(s.current.includes(extra.id));
  s=C.stepTrace(d,s,extra.id,third.edgeId);assert.ok(s.current.includes(join.id));assert.ok(s.current.includes(end.id));
  s=C.stepTrace(d,s,end.id,null);assert.ok(s.current.includes(join.id));assert.equal(s.status,'ready');
  let counted=C.createTrace(d,C.traceStarts(d)[0]);for(let i=0;i<2;i++){const o=C.traceOptions(d,counted)[0];counted=C.stepTrace(d,counted,o.nodeId,o.edgeId);} counted=C.stepTrace(d,counted,fork.id,null);
  assert.equal(C.traceOptions(d,counted).find(o=>o.nodeId===fork.id),undefined);assert.equal(C.traceOptions(d,counted).find(o=>o.nodeId===first.nodeId).reason,'');
  counted=C.stepTrace(d,counted,first.nodeId,first.edgeId);counted._tokens.push({nodeId:first.nodeId});counted.current=counted._tokens.map(token=>token.nodeId);counted=C.stepTrace(d,counted,first.nodeId,first.edgeId);
  assert.deepEqual(counted.waiting,[{nodeId:join.id,arrived:1,required:2}]);counted=C.stepTrace(d,counted,second.nodeId,second.edgeId);assert.equal(counted._arrivals[join.id][first.edgeId],1);
  counted._tokens.push({nodeId:second.nodeId});counted.current=counted._tokens.map(token=>token.nodeId);counted=C.stepTrace(d,counted,second.nodeId,second.edgeId);assert.ok(counted.current.filter(id=>id===join.id).length>=2);
  const loop=C.createDocument('state'),a=C.createNode('state',0,0);loop.nodes=[a];loop.edges=[C.createEdge({nodeId:a.id},{nodeId:a.id},{head:'both'})];
  s=C.createTrace(loop,a.id);assert.equal(C.traceOptions(loop,s).length,1);s=C.stepTrace(loop,s,a.id,loop.edges[0].id);s._tokens.push({nodeId:a.id});s.current=s._tokens.map(t=>t.nodeId);assert.equal(C.traceOptions(loop,s).length,1);s=C.stepTrace(loop,s,a.id,loop.edges[0].id);assert.equal(s.current.filter(id=>id===a.id).length,2);
});
test('Trace keeps compact reversible snapshots through 1000 loop steps', () => {
  const d=C.createDocument('state'), n=C.createNode('state',0,0,{id:'loop'});d.nodes=[n];d.edges=[C.createEdge({nodeId:n.id},{nodeId:n.id},{id:'again',head:'both'}),C.createEdge({nodeId:n.id},{nodeId:n.id},{id:'other',head:'both'})];
  const original=C.clone(d);let s=C.createTrace(d,n.id);for(let i=0;i<1000;i++)s=C.stepTrace(d,s,n.id,'again');
  assert.equal(s.status,'limit');assert.equal(s.history.length,1000);assert.ok(JSON.stringify(s).length<900000);s=C.backTrace(s);assert.equal(s.status,'ready');assert.equal(s.history.length,999);s=C.stepTrace(d,s,n.id,'other');assert.equal(s.status,'limit');assert.equal(s.history.at(-1).edgeIds[0],'other');assert.deepEqual(d,original);
});
test('Join arrival maps accept reserved-looking IDs and reverse cleanly', () => {
  const d=C.createDocument('activity');d.nodes=[];d.edges=[];
  const f=C.createNode('fork',0,0,{id:'fork'}),a=C.createNode('action',0,80,{id:'left'}),b=C.createNode('action',200,80,{id:'right'}),j=C.createNode('join',0,180,{id:'__proto__'});d.nodes.push(f,a,b,j);
  d.edges.push(C.createEdge({nodeId:f.id},{nodeId:a.id},{id:'fork_left'}),C.createEdge({nodeId:f.id},{nodeId:b.id},{id:'fork_right'}),C.createEdge({nodeId:a.id},{nodeId:j.id},{id:'constructor'}),C.createEdge({nodeId:b.id},{nodeId:j.id},{id:'toString'}));C.parseDocument(d);
  let s=C.createTrace(d,f.id);s=C.stepTrace(d,s,f.id,null);s=C.stepTrace(d,s,a.id,'constructor');assert.deepEqual(s.waiting,[{nodeId:'__proto__',arrived:1,required:2}]);s=C.stepTrace(d,s,b.id,'toString');assert.ok(s.current.includes('__proto__'));s=C.backTrace(s);assert.deepEqual(s.waiting,[{nodeId:'__proto__',arrived:1,required:2}]);
});
test('Document inspection offers stable, non-mutating review candidates without judging answers', () => {
  const d=C.createDocument('flowchart');
  const decision=C.createNode('decision',0,0,{id:'constructor',text:'確認'}), blank=C.createNode('process',0,120,{id:'blank'}), isolated=C.createNode('display',500,0,{id:'toString',text:'表示'});
  const start=C.createNode('terminal',0,240,{id:'start'}), fork=C.createNode('fork',0,300,{id:'fork'}), join=C.createNode('join',0,340,{id:'join'}), junction=C.createNode('junction',0,380,{id:'junction'}), note=C.createNode('text',500,120,{id:'__proto__',text:'   '});d.nodes.push(decision,blank,isolated,start,fork,join,junction,note);
  d.edges.push(C.createEdge({nodeId:decision.id},{nodeId:blank.id},{id:'branch_blank',label:{text:'  '}}),C.createEdge({nodeId:decision.id},{nodeId:start.id},{id:'branch_named',label:{text:'完了'}}),C.createEdge({nodeId:decision.id},{x:400,y:30},{id:'free_arrow'}),C.createEdge({x:500,y:280},{x:600,y:280},{id:'free_line',head:'none'}));
  const before=C.clone(d), suggestions=C.inspectDocument(d);assert.deepEqual(d,before);assert.deepEqual(C.inspectDocument(d),suggestions);
  const byCode=code=>suggestions.filter(item=>item.code===code);assert.ok(byCode('blank-node-label').some(item=>item.ids[0]==='blank'));assert.ok(byCode('blank-node-label').some(item=>item.ids[0]==='__proto__'));
  assert.ok(byCode('blank-node-label').some(item=>item.ids[0]==='start'));assert.ok(!byCode('blank-node-label').some(item=>['fork','join','junction'].includes(item.ids[0])));assert.deepEqual(byCode('free-arrow-end').map(item=>item.ids),[['free_arrow']]);
  assert.deepEqual(byCode('decision-branch-label').map(item=>item.ids),[['constructor','branch_blank'],['constructor','free_arrow']]);assert.ok(byCode('isolated-node').some(item=>item.ids[0]==='toString'));
  const single=C.createDocument('flowchart');single.nodes.push(C.createNode('process',0,0,{id:'only',text:'処理'}));assert.ok(!C.inspectDocument(single).some(item=>item.code==='isolated-node'));
});
test('State inspection labels directed transitions, including both-headed edges, without yes-no rules', () => {
  const d=C.createDocument('state'),a=C.createNode('state',0,0,{id:'state_a',text:'待機'}),b=C.createNode('state',200,0,{id:'state_b',text:'動作'});d.nodes.push(a,b);
  d.edges.push(C.createEdge({nodeId:a.id},{nodeId:b.id},{id:'go',label:{text:'  '}}),C.createEdge({nodeId:b.id},{nodeId:a.id},{id:'back',head:'both',label:{text:''}}),C.createEdge({nodeId:a.id},{x:300,y:100},{id:'state_free',head:'both'}));
  const transitions=C.inspectDocument(d).filter(item=>item.code==='state-transition-label');assert.deepEqual(transitions.map(item=>item.ids),[['state_a','go'],['state_a','back'],['state_a','state_free']]);assert.ok(transitions.every(item=>!item.message.includes('はい')&&!item.message.includes('いいえ')));
});
test('Lane APIs add, remove, swap and preserve group-owned free edges atomically', () => {
  const d=C.createDocument('activity'),[left,right]=d.lanes;left.w=220;right.x=280;right.w=340;
  const a=C.createNode('action',60,80,{id:'a',laneId:left.id}),b=C.createNode('action',350,80,{id:'b',laneId:right.id}),free=C.createEdge({nodeId:a.id},{x:180,y:200},{id:'free',bend:{x:140,y:150}});d.nodes=[a,b];d.edges=[free];d.groups=[{id:'g',memberIds:[a.id,free.id]}];C.parseDocument(d);
  const h=new C.History(d), before=C.clone(d);assert.equal(C.moveLane(d,left.id,1),true);assert.deepEqual(d.lanes.map(l=>l.id),[right.id,left.id]);assert.equal(d.lanes.find(l=>l.id===right.id).x,40);assert.equal(d.lanes.find(l=>l.id===left.id).x,400);assert.equal(C.getNode(d,a.id).x,420);assert.equal(d.edges.find(e=>e.id===free.id).to.x,540);assert.equal(d.edges.find(e=>e.id===free.id).bend.x,500);h.commit(d);assert.deepEqual(h.undo(),before);assert.deepEqual(h.redo(),d);
  d.lanes.forEach(l=>{l.h=180;});const lane3=C.addLane(d);assert.equal(d.lanes.length,3);assert.equal(d.lanes.find(l=>l.id===lane3).h,600);assert.equal(new Set(d.lanes.map(l=>l.title)).size,3);assert.equal(C.removeLane(d,lane3),lane3);assert.equal(d.lanes.length,2);assert.equal(C.getNode(d,a.id).laneId,left.id);assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
  const snapshot=C.clone(d);assert.throws(()=>C.moveLane(d,'missing',1));assert.deepEqual(d,snapshot);assert.throws(()=>C.moveLane(d,left.id,0));assert.deepEqual(d,snapshot);d.lanes.find(l=>l.id===left.id).locked=true;assert.throws(()=>C.removeLane(d,left.id));assert.deepEqual(d.lanes.find(l=>l.id===left.id).locked,true);
});
test('Lane limits and cross-lane rigid groups reject without changing the document', () => {
  const d=C.createDocument('activity');d.lanes=Array.from({length:50},(_,i)=>({id:`lane_${i}`,title:`担当${i+1}`,x:i*140,y:40,w:140,h:600,locked:false}));const before=C.clone(d);assert.throws(()=>C.addLane(d));assert.deepEqual(d,before);
  const x=C.createNode('action',50,80,{id:'x',laneId:d.lanes[0].id}),y=C.createNode('action',250,80,{id:'y',laneId:d.lanes[1].id});d.nodes=[x,y];d.groups=[{id:'cross',memberIds:[x.id,y.id]}];const snap=C.clone(d);assert.throws(()=>C.moveLane(d,d.lanes[0].id,1));assert.deepEqual(d,snap);
});
function laneFixture() {
  const d=C.createDocument('activity');
  d.lanes=[{id:'left',title:'生徒',x:40,y:40,w:220,h:600,locked:false},{id:'right',title:'教員',x:280,y:40,w:340,h:600,locked:false},{id:'third',title:'システム',x:670,y:40,w:220,h:600,locked:false}];
  d.nodes=[C.createNode('action',60,110,{id:'a',text:'入力',laneId:'left'}),C.createNode('action',70,250,{id:'b',text:'確認',laneId:'left'}),C.createNode('action',310,110,{id:'c',text:'承認',laneId:'right'}),C.createNode('action',700,110,{id:'d',laneId:'third'})];
  d.edges=[C.createEdge({nodeId:'a',side:'bottom',offset:.5},{nodeId:'b',side:'top',offset:.5},{id:'internal',bend:{x:200,y:200},label:{text:'順次',t:.3,dx:12,dy:8}}),C.createEdge({nodeId:'b'},{nodeId:'c'},{id:'cross',bend:{x:250,y:290}}),C.createEdge({nodeId:'c'},{nodeId:'c'},{id:'loop',kind:'curve',bend:{x:590,y:90}})];
  return C.parseDocument(d);
}
test('Lane reordering translates internal paths, keeps cross-lane bends, and reverses exactly',()=>{
  const d=laneFixture(),before=C.clone(d);C.moveLane(d,'left',1);
  for(const n of before.nodes){const dx=n.laneId==='left'?360:n.laneId==='right'?-240:0;assert.deepEqual(C.getNode(d,n.id),{...n,x:n.x+dx});}
  assert.deepEqual(d.edges[0],{...before.edges[0],bend:{x:560,y:200}});assert.deepEqual(d.edges[1],before.edges[1]);assert.deepEqual(d.edges[2],{...before.edges[2],bend:{x:350,y:90}});
  assert.deepEqual(d.lanes.find(l=>l.id==='third'),before.lanes[2]);C.moveLane(d,'left',-1);assert.deepEqual(d,before);
  assert.equal(C.moveLane(d,'left',-1),false);assert.deepEqual(d,before);
});
test('Deleting occupied lanes retains diagram geometry, groups and the gap, including the last lane',()=>{
  const d=laneFixture();d.groups=[{id:'g',memberIds:['a','b','internal']}];d.edges[0].locked=true;const before=C.clone(d),history=new C.History(d);
  C.removeLane(d,'left');assert.deepEqual(d.nodes,before.nodes.map(n=>({...n,laneId:n.laneId==='left'?null:n.laneId})));assert.deepEqual(d.edges,before.edges);assert.deepEqual(d.groups,before.groups);assert.deepEqual(d.lanes,before.lanes.slice(1));
  history.commit(d);assert.deepEqual(history.undo(),before);assert.deepEqual(history.redo(),d);
  C.removeLane(d,'right');C.removeLane(d,'third');assert.equal(d.lanes.length,0);assert.ok(d.nodes.every(n=>n.laneId===null));assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
});
test('Lane edits reject locked members and coordinate overflow without partial changes',()=>{
  for(const kind of ['lane','node','bend']){const d=laneFixture();(kind==='lane'?d.lanes[1]:kind==='node'?d.nodes[0]:d.edges[0]).locked=true;const before=C.clone(d);assert.throws(()=>C.moveLane(d,'left',1),/固定/);assert.deepEqual(d,before);}
  for(const kind of ['lane','node']){const d=laneFixture();(kind==='lane'?d.lanes[0]:d.nodes[0]).locked=true;const before=C.clone(d);assert.throws(()=>C.removeLane(d,'left'),/固定/);assert.deepEqual(d,before);}
  const d=laneFixture();d.nodes[0].x=99999;const before=C.clone(d);assert.throws(()=>C.moveLane(d,'left',1));assert.deepEqual(d,before);assert.throws(()=>C.addLane(d));assert.deepEqual(d,before);
  const allowed=laneFixture();allowed.edges[0].bend=null;allowed.edges[0].locked=true;allowed.edges[1].locked=true;const edges=C.clone(allowed.edges);C.moveLane(allowed,'left',1);assert.deepEqual(allowed.edges.slice(0,2),edges.slice(0,2));
});
test('Edge-only groups follow their attached lane and reject incompatible displacements',()=>{
  const d=laneFixture();d.edges.push(C.createEdge({nodeId:'a'},{x:180,y:430},{id:'attached',bend:{x:160,y:350}}),C.createEdge({x:100,y:440},{x:180,y:460},{id:'free',bend:{x:150,y:470}}));
  d.groups=[{id:'edge_group',memberIds:['internal','attached','free']}];const before=C.clone(d);C.moveLane(d,'left',1);
  assert.deepEqual(d.edges[3].to,{x:540,y:430});assert.deepEqual(d.edges[3].bend,{x:520,y:350});assert.deepEqual(d.edges[4].from,{x:460,y:440});assert.deepEqual(d.edges[4].to,{x:540,y:460});assert.deepEqual(d.edges[4].bend,{x:510,y:470});
  C.moveLane(d,'left',-1);assert.deepEqual(d,before);d.edges[4].locked=true;const locked=C.clone(d);assert.throws(()=>C.moveLane(d,'left',1),/固定/);assert.deepEqual(d,locked);
  for(const members of [['internal','loop'],['d','internal'],['internal','cross']]){const bad=laneFixture();bad.groups=[{id:'conflict',memberIds:members}];const saved=C.clone(bad);assert.throws(()=>C.moveLane(bad,'left',1),/グループ/);assert.deepEqual(bad,saved);}
});
test('Adding a lane respects safe default sizes, existing nodes, unique names and the limit',()=>{
  const d=C.createDocument('activity');d.lanes=[{id:'tiny',title:'担当1',x:40,y:40,w:1,h:180,locked:false}];d.nodes=[C.createNode('action',450,110,{id:'outside',laneId:null})];const original=C.clone(d);const id=C.addLane(d),added=d.lanes.find(l=>l.id===id);
  assert.equal(added.w,140);assert.equal(added.h,600);assert.equal(added.title,'担当2');assert.ok(added.x>=d.nodes[0].x+d.nodes[0].w+20);assert.deepEqual(d.nodes,original.nodes);assert.deepEqual(d.lanes[0],original.lanes[0]);
  for(const options of [null,{w:1},{h:-1},{id:'tiny'},{title:'x'.repeat(161)}]){const before=C.clone(d);assert.throws(()=>C.addLane(d,options));assert.deepEqual(d,before);}
  d.lanes=Array.from({length:49},(_,i)=>({id:`limit_${i}`,title:`担当${i+1}`,x:i*140,y:40,w:140,h:600,locked:false}));C.addLane(d);assert.equal(d.lanes.length,50);const full=C.clone(d);assert.throws(()=>C.addLane(d),/50/);assert.deepEqual(d,full);
});
test('Size matching preserves centers and all non-size data, including a locked reference', () => {
  const d=C.createDocument('activity'), lane=d.lanes[0];
  const ref=C.createNode('process',100,100,{id:'ref',w:180,h:90,text:'基準',laneId:lane.id,locked:true});
  const target=C.createNode('action',400,160,{id:'target',w:80,h:140,text:'対象',laneId:lane.id,style:{fill:'#ffeeaa'}});
  const initial=C.createNode('initial',650,120,{id:'initial',w:17,h:31,laneId:lane.id});
  const junction=C.createNode('junction',760,120,{id:'junction',w:11,h:23,laneId:lane.id});
  const edge=C.createEdge({nodeId:target.id},{nodeId:junction.id},{id:'link',label:{text:'接続'},bend:{x:700,y:200}});
  d.nodes=[ref,target,initial,junction];d.edges=[edge];d.groups=[{id:'set',memberIds:[ref.id,target.id]}];
  const before=C.clone(d), center={x:target.x+target.w/2,y:target.y+target.h/2};
  assert.deepEqual(C.matchNodeSize(d,['set'],ref.id,'width'),[target.id]);
  assert.deepEqual(C.getNode(d,target.id),{...before.nodes[1],w:180,x:center.x-90});
  assert.deepEqual(d.edges,before.edges);assert.deepEqual(d.groups,before.groups);assert.deepEqual(d.lanes,before.lanes);
  assert.deepEqual(C.matchNodeSize(d,[ref.id,target.id,initial.id,junction.id],ref.id,'height').sort(),[target.id,initial.id,junction.id].sort());
  assert.equal(C.getNode(d,target.id).y+45,center.y);
  assert.deepEqual(C.getNode(d,initial.id),{...before.nodes[2],w:17,h:90,y:before.nodes[2].y-29.5});
  assert.deepEqual(C.getNode(d,junction.id),{...before.nodes[3],w:11,h:90,y:before.nodes[3].y-33.5});
  assert.deepEqual(C.matchNodeSize(d,[ref.id,target.id],ref.id,'both'),[]);
  const h=new C.History(d);assert.equal(h.commit(d),false);
  assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
});
test('Size matching rejects invalid, locked, circular, and overflowing batches atomically', () => {
  const d=C.createDocument('state');
  const ref=C.createNode('state',0,0,{id:'ref',w:300,h:80,variant:'round'});
  const regular=C.createNode('state',400,0,{id:'regular',w:90,h:140,variant:'round'});
  const circle=C.createNode('state',650,0,{id:'circle',w:120,h:120});
  const locked=C.createNode('state',850,0,{id:'locked',locked:true,variant:'round'});
  const edge=C.createEdge({nodeId:regular.id},{nodeId:circle.id},{id:'edge'});
  d.nodes=[ref,regular,circle,locked];d.edges=[edge];
  for(const args of [
    [[ref.id],'missing'],[[ref.id],ref.id],[[ref.id,regular.id],'outside'],[[ref.id,locked.id],ref.id]
  ]) { const before=C.clone(d);assert.throws(()=>C.matchNodeSize(d,...args));assert.deepEqual(d,before); }
  const beforeCircle=C.clone(d);assert.throws(()=>C.matchNodeSize(d,[ref.id,regular.id,circle.id],ref.id,'both'),/円形/);assert.deepEqual(d,beforeCircle);
  assert.deepEqual(C.matchNodeSize(d,[ref.id,circle.id],ref.id,'height'),[circle.id]);assert.equal(C.getNode(d,circle.id).w,80);assert.equal(C.getNode(d,circle.id).h,80);
  const overflow=C.createNode('state',-100000,200,{id:'overflow',w:1,h:1,variant:'round'});d.nodes.push(overflow);
  const beforeOverflow=C.clone(d);assert.throws(()=>C.matchNodeSize(d,[ref.id,overflow.id],ref.id,'width'));assert.deepEqual(d,beforeOverflow);
});
test('Style clipboard is independent and preserves every non-style node and edge field', () => {
  const d=C.createDocument('activity'), lane=d.lanes[0];
  const source=C.createNode('action',0,0,{id:'source',locked:true,laneId:lane.id,style:{fontSize:22,stroke:'#112233',fill:'#aabbcc',color:'#445566',strokeWidth:4,dashed:true,bold:true}});
  const target=C.createNode('action',240,0,{id:'target',text:'保持する文字',laneId:lane.id,style:{fill:'#ffeeaa'}});
  const other=C.createNode('action',480,0,{id:'other',text:'別の図形',laneId:lane.id,style:{fill:'#ddccbb'}});
  const edge=C.createEdge({nodeId:target.id,side:'left'},{nodeId:other.id,side:'right'},{id:'edge',kind:'curve',head:'both',bend:{x:360,y:90},label:{text:'条件',t:.2,dx:8,dy:-18},style:{fill:'#010101'}});
  const second=C.createEdge({x:20,y:300},{x:200,y:320},{id:'second',kind:'straight',head:'none',label:{text:'自由線'},style:{fill:'#222222'}});
  d.nodes=[source,target,other];d.edges=[edge,second];d.groups=[{id:'mixed',memberIds:[target.id,edge.id]}];
  const payload=C.copyStyle(d,source.id);assert.deepEqual(payload.style,source.style);
  source.style.fill='#000000';assert.equal(payload.style.fill,'#aabbcc');
  C.removeSelection(d,[source.id]);assert.equal(C.getNode(d,source.id),undefined);
  const targetBefore=C.clone(C.getNode(d,target.id)), edgeBefore=C.clone(d.edges.find(item=>item.id===edge.id));
  assert.deepEqual(C.pasteStyle(d,['mixed'],payload).sort(),[target.id,edge.id].sort());
  assert.deepEqual(C.getNode(d,target.id),{...targetBefore,style:{...targetBefore.style,...payload.style}});
  assert.deepEqual(d.edges.find(item=>item.id===edge.id),{...edgeBefore,style:{...edgeBefore.style,...payload.style,fill:edgeBefore.style.fill}});
  const edgePayload=C.copyStyle(d,edge.id), otherBefore=C.clone(C.getNode(d,other.id)), secondBefore=C.clone(d.edges.find(item=>item.id===second.id));
  assert.deepEqual(C.pasteStyle(d,[other.id,second.id],edgePayload).sort(),[other.id,second.id].sort());
  assert.deepEqual(C.getNode(d,other.id),{...otherBefore,style:{...otherBefore.style,...edgePayload.style,fill:otherBefore.style.fill}});
  assert.deepEqual(d.edges.find(item=>item.id===second.id),{...secondBefore,style:{...secondBefore.style,...edgePayload.style,fill:secondBefore.style.fill}});
  const h=new C.History(d);assert.deepEqual(C.pasteStyle(d,[other.id,second.id],edgePayload),[]);assert.equal(h.commit(d),false);
});
test('Style paste validates payloads and locked batches atomically', () => {
  const d=C.createDocument('activity'), lane=d.lanes[0];
  const source=C.createNode('action',0,0,{id:'source',style:{stroke:'#123456'}}), a=C.createNode('action',200,0,{id:'a'}), b=C.createNode('action',400,0,{id:'b',locked:true});
  d.nodes=[source,a,b];const payload=C.copyStyle(d,source.id), before=C.clone(d);
  assert.throws(()=>C.copyStyle(d,lane.id));assert.throws(()=>C.copyStyle(d,'missing'));
  assert.throws(()=>C.pasteStyle(d,[a.id,b.id],payload),/固定/);assert.deepEqual(d,before);
  const invalid=[
    {...payload,format:'other'}, {...payload,version:2}, {...payload,sourceType:'lane'}, {...payload,style:null},
    {...payload,style:{...payload.style,fontSize:Infinity}}, {...payload,style:{...payload.style,strokeWidth:13}},
    {...payload,style:{...payload.style,dashed:'true'}}, {...payload,style:{...payload.style,bold:1}}
  ];
  for(const bad of invalid) { const snapshot=C.clone(d);assert.throws(()=>C.pasteStyle(d,[a.id],bad));assert.deepEqual(d,snapshot); }
  b.locked=false;const editableBefore=C.clone(d), h=new C.History(d);
  assert.deepEqual(C.pasteStyle(d,[a.id,b.id],payload).sort(),[a.id,b.id].sort());assert.equal(h.commit(d),true);
  assert.deepEqual(h.undo(),editableBefore);assert.deepEqual(h.redo(),d);assert.deepEqual(C.parseDocument(C.serializeDocument(d)),d);
});
console.log(JSON.stringify({ok:true,cases},null,2));
