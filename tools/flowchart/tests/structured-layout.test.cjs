const assert=require('node:assert/strict');
const C=require('../core.js');
const L=require('../layout.js');
const R=require('../render.js');
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};
const clone=value=>JSON.parse(JSON.stringify(value));
function node(doc,id,kind,x,y,options={}){const value=C.createNode(kind,x,y,{id,text:id,...options});doc.nodes.push(value);return value;}
function edge(doc,id,from,to,label='',options={}){const value=C.createEdge({nodeId:from.id},{nodeId:to.id},{id,label:{text:label},...options});doc.edges.push(value);return value;}
function branchDocument({direct=false}={}){
  const doc=C.createDocument('flowchart'),start=node(doc,'start','terminal',300,20),decision=node(doc,'decision','decision',300,130),no=node(doc,'no','process',80,300),yes=node(doc,'yes','process',540,300),merge=node(doc,'merge','process',300,480),end=node(doc,'end','terminal',300,610);
  edge(doc,'before',start,decision);
  edge(doc,'noEdge',decision,direct?merge:no,'いいえ');
  edge(doc,'yesEdge',decision,yes,'はい');
  if(!direct)edge(doc,'noMerge',no,merge);
  edge(doc,'yesMerge',yes,merge);edge(doc,'after',merge,end);
  return doc;
}
const find=(doc,id)=>doc.nodes.find(item=>item.id===id);
function routeAvoidsOtherNodes(doc,edge){
  const points=R.edgeGeometry(doc,edge).points,skip=new Set([edge.from.nodeId,edge.to.nodeId]);
  for(let index=1;index<points.length;index++)for(const box of doc.nodes.filter(node=>!skip.has(node.id))){const a=points[index-1],b=points[index],inside=value=>value>0.01&&value<1-0.01;
    if(a.x===b.x&&a.x>box.x&&a.x<box.x+box.w&&Math.max(a.y,b.y)>box.y&&Math.min(a.y,b.y)<box.y+box.h)throw new Error(`route crosses ${box.id}`);
    if(a.y===b.y&&a.y>box.y&&a.y<box.y+box.h&&Math.max(a.x,b.x)>box.x&&Math.min(a.x,b.x)<box.x+box.w)throw new Error(`route crosses ${box.id}`);
  }
}
test('A two-branch decision follows labels, handles a direct merge branch, and preserves input',()=>{
  const doc=branchDocument(),before=clone(doc),result=L.plan(doc,['yes','end','decision','start','merge','no'],{gap:30,branchGap:90});
  assert.equal(result.structure,'branch');assert.equal(result.unitCount,6);assert.deepEqual(doc,before);
  const out=result.document,decision=find(out,'decision'),no=find(out,'no'),yes=find(out,'yes'),merge=find(out,'merge');
  assert.ok(no.x+no.w<decision.cx||no.x<decision.x);assert.ok(yes.x>decision.x);assert.ok(merge.y>no.y&&merge.y>yes.y);
  assert.equal(out.edges.find(item=>item.id==='noEdge').from.side,'left');assert.equal(out.edges.find(item=>item.id==='yesEdge').from.side,'right');
  const direct=L.plan(branchDocument({direct:true}),['start','decision','yes','merge','end'],{});
  assert.equal(direct.structure,'branch');
});
test('Horizontal and flipped branch placements transpose the branch sides',()=>{
  const doc=branchDocument(),horizontal=L.plan(doc,doc.nodes.map(item=>item.id),{direction:'horizontal',branchGap:100}),flipped=L.plan(doc,doc.nodes.map(item=>item.id),{branchGap:100,flipBranches:true});
  assert.equal(horizontal.document.edges.find(item=>item.id==='noEdge').from.side,'top');
  assert.equal(horizontal.document.edges.find(item=>item.id==='yesEdge').from.side,'bottom');
  assert.ok(find(flipped.document,'no').x>find(flipped.document,'decision').x);
});
test('The branch-and-loop template produces an exterior return route and keeps labels and styles',()=>{
  const doc=C.createTemplate('flow-branch'),before=clone(doc),result=L.plan(doc,doc.nodes.map(item=>item.id),{gap:40,branchGap:85});
  assert.equal(result.structure,'loop');assert.deepEqual(doc,before);
  const repeat=result.document.edges.find(item=>item.label.text==='もう一度'),boxes=result.document.nodes;
  assert.equal(repeat.kind,'orthogonal');assert.equal(repeat.waypoints.length,2);
  const rightBeforeFlip=Math.max(...boxes.map(item=>item.x+item.w));assert.ok(repeat.waypoints.every(point=>point.x>rightBeforeFlip));
  routeAvoidsOtherNodes(result.document,repeat);
  const flipped=L.plan(doc,doc.nodes.map(item=>item.id),{gap:40,branchGap:85,flipBranches:true}),flippedRepeat=flipped.document.edges.find(item=>item.label.text==='もう一度'),leftAfterFlip=Math.min(...flipped.document.nodes.map(item=>item.x));assert.ok(flippedRepeat.waypoints.every(point=>point.x<leftAfterFlip));
  const unchanged=C.createTemplate('flow-branch'),plain=L.plan(unchanged,unchanged.nodes.map(item=>item.id),{route:false});
  assert.deepEqual(plain.document.edges.find(item=>item.label.text==='もう一度').bend,unchanged.edges.find(item=>item.label.text==='もう一度').bend);
});
test('A post-condition loop with one return and one exit is recognized',()=>{
  const doc=C.createDocument('flowchart'),start=node(doc,'start','terminal',180,20),body=node(doc,'body','process',180,130),decision=node(doc,'decision','decision',180,260),end=node(doc,'end','terminal',500,380);
  edge(doc,'toBody',start,body);edge(doc,'toDecision',body,decision);edge(doc,'again',decision,body,'はい');edge(doc,'exit',decision,end,'いいえ');
  const result=L.plan(doc,doc.nodes.map(item=>item.id),{gap:30});assert.equal(result.structure,'loop');
  const repeat=result.document.edges.find(item=>item.id==='again');assert.equal(repeat.waypoints.length,2);assert.ok(repeat.waypoints.every(point=>point.x>Math.max(...result.document.nodes.map(item=>item.x+item.w))));
  routeAvoidsOtherNodes(result.document,repeat);
});
test('All five flow templates make a structured proposal and route their loop outside every other node',()=>{
  const expected={"flow-sequence":"sequence","flow-choice":"branch","flow-branch":"loop","flow-while":"loop","flow-repeat":"loop"};
  for(const [id,structure] of Object.entries(expected)){
    const doc=C.createTemplate(id),result=L.plan(doc,doc.nodes.map(item=>item.id),{gap:20,branchGap:20});
    assert.equal(result.structure,structure,id);assert.deepEqual(C.parseDocument(C.serializeDocument(result.document)),result.document);
    const loop=result.document.edges.find(item=>item.waypoints.length===2);
    if(structure==='loop')routeAvoidsOtherNodes(result.document,loop);
  }
  const choice=C.createTemplate('flow-choice'),choiceResult=L.plan(choice,choice.nodes.map(item=>item.id),{}),merge=choiceResult.document.nodes.find(item=>item.kind==='junction'),entries=choiceResult.document.edges.filter(item=>item.to.nodeId===merge.id);
  assert.deepEqual(new Set(entries.map(item=>item.to.side)),new Set(['left','right']));
  const whileDoc=C.createTemplate('flow-while'),whileResult=L.plan(whileDoc,whileDoc.nodes.map(item=>item.id),{}),whileReturn=whileResult.document.edges.find(item=>item.label.text==='次の回');assert.ok(whileReturn.waypoints.every(point=>point.x>Math.max(...whileResult.document.nodes.map(item=>item.x+item.w))));assert.equal(whileResult.document.edges.find(item=>item.label.text==='いいえ').from.side,'left');
  const repeatDoc=C.createTemplate('flow-repeat'),repeatResult=L.plan(repeatDoc,repeatDoc.nodes.map(item=>item.id),{}),repeatReturn=repeatResult.document.edges.find(item=>item.label.text==='いいえ');assert.ok(repeatReturn.waypoints.every(point=>point.x<Math.min(...repeatResult.document.nodes.map(item=>item.x))));
});
test('Lane mode centers each selected unit in its own lane and preserves cross-lane manual routes',()=>{
  const doc=C.createDocument('activity');
  doc.lanes=[{id:'a',title:'A',x:0,y:0,w:260,h:700,locked:false},{id:'b',title:'B',x:300,y:0,w:260,h:700,locked:false}];
  const a0=node(doc,'a0','action',40,150,{laneId:'a'}),a1=node(doc,'a1','action',60,350,{laneId:'a'}),b0=node(doc,'b0','action',330,100,{laneId:'b'}),b1=node(doc,'b1','action',350,320,{laneId:'b'});
  edge(doc,'inside',a0,a1,'',{bend:{x:80,y:280}});edge(doc,'cross',a1,b0,'',{bend:{x:290,y:270}});
  doc.groups=[{id:'ga',memberIds:['a0','a1','inside']}];const before=clone(doc),result=L.plan(doc,['ga','b0','b1'],{mode:'lanes',gap:25});
  assert.equal(result.structure,'lanes');assert.deepEqual(doc,before);
  const out=result.document,ga=[find(out,'a0'),find(out,'a1')],laneA=out.lanes.find(item=>item.id==='a'),laneB=out.lanes.find(item=>item.id==='b');
  assert.equal(ga[1].x-ga[0].x,20);assert.equal(ga[0].x,36);assert.ok(ga[0].y>=laneA.y+48);
  assert.equal(find(out,'b0').x,laneB.x+(laneB.w-find(out,'b0').w)/2);
  assert.deepEqual(out.edges.find(item=>item.id==='cross'),doc.edges.find(item=>item.id==='cross'));
});
test('Lane routing resets only automatic orthogonal lines in the same lane',()=>{
  const doc=C.createDocument('activity');doc.lanes=[{id:'leftLane',title:'左',x:0,y:0,w:280,h:1000,locked:false},{id:'rightLane',title:'右',x:340,y:0,w:280,h:1000,locked:false}];
  const top=node(doc,'top','action',40,130,{laneId:'leftLane'}),bottom=node(doc,'bottom','action',50,400,{laneId:'leftLane'}),other=node(doc,'other','action',370,260,{laneId:'rightLane'});
  edge(doc,'down',top,bottom);edge(doc,'up',bottom,top);edge(doc,'manual',top,bottom,'',{waypoints:[{x:20,y:220},{x:20,y:420} ]});edge(doc,'cross',top,other,'',{bend:{x:300,y:210}});edge(doc,'curve',bottom,top,'',{kind:'curve',bend:{x:300,y:260}});edge(doc,'straight',top,bottom,'',{kind:'straight'});
  const before=clone(doc),routed=L.plan(doc,doc.nodes.map(item=>item.id),{mode:'lanes',route:true}),out=routed.document;
  assert.deepEqual(doc,before);assert.equal(out.edges.find(item=>item.id==='down').from.side,'bottom');assert.equal(out.edges.find(item=>item.id==='down').to.side,'top');assert.equal(out.edges.find(item=>item.id==='up').from.side,'top');assert.equal(out.edges.find(item=>item.id==='up').to.side,'bottom');
  for(const id of ['manual','cross','curve','straight'])assert.deepEqual(out.edges.find(item=>item.id===id),doc.edges.find(item=>item.id===id),id);
  assert.deepEqual(routed.warnings,['直線・曲線の矢印は経路を保持しました。']);
  const plain=L.plan(doc,doc.nodes.map(item=>item.id),{mode:'lanes',route:false});assert.deepEqual(plain.document.edges,doc.edges);
  const flow=C.createTemplate('flow-sequence'),flowBefore=clone(flow);assert.throws(()=>L.plan(flow,flow.nodes.map(item=>item.id),{mode:'lanes'}),/アクティビティ/);assert.deepEqual(flow,flowBefore);
});
test('Ambiguous structures, fixed selections, and invalid lane groups reject without mutating the source',()=>{
  const processBranch=branchDocument();find(processBranch,'decision').kind='process';const before=clone(processBranch);
  assert.throws(()=>L.plan(processBranch,processBranch.nodes.map(item=>item.id),{}),/分岐|複雑/);assert.deepEqual(processBranch,before);
  const nested=branchDocument();const yes=find(nested,'yes');yes.kind='decision';const extra=node(nested,'extra','process',750,430);edge(nested,'extraEdge',yes,extra,'はい');edge(nested,'extraMerge',extra,find(nested,'merge'),'いいえ');
  assert.throws(()=>L.plan(nested,nested.nodes.map(item=>item.id),{}),/複雑|分岐/);
  const lane=C.createDocument('activity');lane.lanes=[{id:'a',title:'A',x:0,y:0,w:300,h:300,locked:false},{id:'b',title:'B',x:320,y:0,w:300,h:300,locked:false}];
  const a=node(lane,'na','action',20,80,{laneId:'a'}),b=node(lane,'nb','action',340,80,{laneId:'b'});lane.groups=[{id:'bad',memberIds:['na','nb']}];const laneBefore=clone(lane);
  assert.throws(()=>L.plan(lane,['bad'],{mode:'lanes'}),/担当領域/);assert.deepEqual(lane,laneBefore);
  lane.groups=[];a.locked=true;assert.throws(()=>L.plan(lane,['na','nb'],{mode:'lanes'}),/固定/);
});
test('Structured proposals round trip and make one History operation',()=>{
  const doc=branchDocument(),proposal=L.plan(doc,doc.nodes.map(item=>item.id),{gap:35});
  assert.deepEqual(C.parseDocument(C.serializeDocument(proposal.document)),proposal.document);
  const history=new C.History(doc);assert.equal(history.commit(proposal.document),true);assert.deepEqual(history.undo(),doc);assert.deepEqual(history.redo(),proposal.document);
});
console.log(JSON.stringify({ok:true,cases},null,2));
