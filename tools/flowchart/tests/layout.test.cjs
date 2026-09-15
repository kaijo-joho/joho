const assert=require('node:assert/strict');
const C=require('../core.js');
const L=require('../layout.js');
const cases=[];const test=(name,fn)=>{fn();cases.push(name);};const clone=value=>JSON.parse(JSON.stringify(value));
function line({sizes=[{w:100,h:50},{w:140,h:70},{w:90,h:60}],lanes=false}={}){
  const d=C.createDocument(lanes?'activity':'flowchart');if(lanes)d.lanes=[{id:'lane',title:'担当',x:0,y:0,w:1000,h:1000,locked:false}];
  d.nodes=sizes.map((size,index)=>C.createNode(lanes?'action':'process',100+index*250,100+index*120,{id:`n${index}`,w:size.w,h:size.h,laneId:lanes?'lane':null,text:`N${index}`}));
  d.edges=d.nodes.slice(0,-1).map((node,index)=>C.createEdge({nodeId:node.id,side:'left'},{nodeId:d.nodes[index+1].id,side:'right'},{id:`e${index}`,bend:{x:500+index,y:300+index},label:{text:`E${index}`,dx:11,dy:-9}}));return d;
}
test('Vertical and horizontal plans follow directed order rather than selection or drawing order',()=>{
  const d=line({sizes:[{w:100,h:40},{w:160,h:80},{w:90,h:60}]});d.nodes.reverse();const before=clone(d),vertical=L.plan(d,['n2','n0','n1'],{gap:30});
  assert.deepEqual(vertical.nodeIds,['n0','n1','n2']);assert.equal(vertical.unitCount,3);assert.equal(vertical.document.nodes.find(n=>n.id==='n0').y,100);assert.equal(vertical.document.nodes.find(n=>n.id==='n1').y,170);assert.equal(vertical.document.nodes.find(n=>n.id==='n2').y,280);assert.equal(vertical.document.nodes.find(n=>n.id==='n1').x,70);assert.deepEqual(d,before);
  const horizontal=L.plan(d,['n1','n2','n0'],{direction:'horizontal',gap:25});assert.equal(horizontal.document.nodes.find(n=>n.id==='n1').x,225);assert.equal(horizontal.document.nodes.find(n=>n.id==='n2').x,410);assert.equal(horizontal.document.nodes.find(n=>n.id==='n2').y,90);
});
test('Groups move rigidly and their internal route and free endpoint follow the group delta',()=>{
  const d=line({sizes:[{w:100,h:50},{w:100,h:50},{w:100,h:50}]});const free=C.createEdge({nodeId:'n1'},{x:300,y:340},{id:'inside_free',waypoints:[{x:280,y:280}]});d.edges.push(free);d.groups=[{id:'g',memberIds:['n1','n2','e1','inside_free']}];
  const result=L.plan(d,['n0','n1'],{gap:40,route:false}),out=result.document,a=out.nodes.find(n=>n.id==='n0'),b=out.nodes.find(n=>n.id==='n1'),edge=out.edges.find(e=>e.id==='inside_free');
  assert.equal(a.y,100);assert.equal(b.y,190);assert.equal(out.nodes.find(n=>n.id==='n2').y,310);assert.deepEqual(edge.waypoints,[{x:-95,y:250}]);assert.deepEqual(edge.to,{x:-75,y:310});
});
test('Route true resets only chain edges while route false and external edges retain stored routes',()=>{
  const d=line(),external=C.createEdge({nodeId:'n1'},{x:900,y:400},{id:'external',waypoints:[{x:600,y:350}]});d.edges.push(external);const routed=L.plan(d,['n0','n1','n2'],{}),plain=L.plan(d,['n0','n1','n2'],{route:false});
  assert.deepEqual(routed.edgeIds,['e0','e1']);assert.equal(routed.document.edges.find(e=>e.id==='e0').from.side,'bottom');assert.equal(routed.document.edges.find(e=>e.id==='e0').bend,null);assert.deepEqual(routed.document.edges.find(e=>e.id==='e0').waypoints,[]);assert.deepEqual(routed.document.edges.find(e=>e.id==='external').waypoints,[{x:600,y:350}]);
  assert.deepEqual(plain.edgeIds,[]);assert.deepEqual(plain.document.edges.find(e=>e.id==='e0').waypoints,d.edges.find(e=>e.id==='e0').waypoints);assert.deepEqual(plain.document.edges.find(e=>e.id==='external'),d.edges.find(e=>e.id==='external'));
});
test('Only moved nodes are checked against lanes, and group-internal routes move safely',()=>{
  const lane=line({lanes:true});lane.nodes.push(C.createNode('action',1200,1200,{id:'outside',laneId:'lane'}));
  assert.equal(L.plan(lane,['n0','n1','n2'],{}).unitCount,3);
  const grouped=line();grouped.nodes.push(C.createNode('process',900,100,{id:'outside'}));const external=C.createEdge({nodeId:'n1'},{nodeId:'outside'},{id:'external_group',waypoints:[{x:700,y:180}]});grouped.edges.push(external);grouped.groups=[{id:'g',memberIds:['n1','n2','e1','external_group']}];
  const result=L.plan(grouped,['n0','n1'],{gap:40,route:false}),out=result.document;
  assert.deepEqual(out.edges.find(edge=>edge.id==='e1').bend,{x:131,y:271});
  assert.deepEqual(out.edges.find(edge=>edge.id==='external_group'),grouped.edges.find(edge=>edge.id==='external_group'));
  assert.ok(result.edgeIds.includes('e1'));assert.equal(result.edgeIds.includes('external_group'),false);
});
test('Fixed routes that must follow a moved group reject without changing the source',()=>{
  const grouped=line();grouped.groups=[{id:'g',memberIds:['n1','n2']}];grouped.edges.find(edge=>edge.id==='e1').locked=true;const before=clone(grouped);
  assert.throws(()=>L.plan(grouped,['n0','n1'],{gap:40,route:false}),/固定された線/);assert.deepEqual(grouped,before);
  grouped.edges.find(edge=>edge.id==='e1').locked=false;grouped.edges.find(edge=>edge.id==='e1').bend=null;grouped.edges.find(edge=>edge.id==='e1').waypoints=[];grouped.edges.find(edge=>edge.id==='e1').locked=true;
  assert.equal(L.plan(grouped,['n0','n1'],{gap:40,route:false}).unitCount,2);
});
test('Invalid, fixed, lane overflow, branch, loop and disconnected plans reject atomically',()=>{
  const d=line();d.nodes[0].locked=true;const before=clone(d);assert.throws(()=>L.plan(d,['n0','n1'],{}),/固定/);assert.deepEqual(d,before);
  d.nodes[0].locked=false;assert.throws(()=>L.plan(d,['n0','n1'],{gap:401}),/間隔/);assert.throws(()=>L.plan(d,['n0'],{}),/2つ/);assert.throws(()=>L.plan(d,'n0',{}),/選択/);
  const branch=line();branch.edges.push(C.createEdge({nodeId:'n0'},{nodeId:'n2'},{id:'branch'}));assert.throws(()=>L.plan(branch,['n0','n1','n2'],{}),/分岐/);
  const loop=line();loop.edges=[C.createEdge({nodeId:'n0'},{nodeId:'n1'},{id:'a'}),C.createEdge({nodeId:'n1'},{nodeId:'n0'},{id:'b'})];assert.throws(()=>L.plan(loop,['n0','n1'],{}),/循環/);
  const disconnected=line();disconnected.edges=[];assert.throws(()=>L.plan(disconnected,['n0','n1'],{}),/つながって/);
  const pathAndCycle=line({sizes:[{w:80,h:40},{w:80,h:40},{w:80,h:40},{w:80,h:40}]});pathAndCycle.edges=[C.createEdge({nodeId:'n0'},{nodeId:'n1'},{id:'path'}),C.createEdge({nodeId:'n2'},{nodeId:'n3'},{id:'cycle_a'}),C.createEdge({nodeId:'n3'},{nodeId:'n2'},{id:'cycle_b'})];assert.throws(()=>L.plan(pathAndCycle,pathAndCycle.nodes.map(node=>node.id),{}),/循環/);
  const maximum=line();maximum.nodes[0].x=99900;maximum.nodes[1].x=99910;assert.throws(()=>L.plan(maximum,['n0','n1'],{direction:'horizontal'}),/座標/);
  const lane=line({lanes:true});lane.lanes[0].h=180;assert.throws(()=>L.plan(lane,['n0','n1','n2'],{}),/担当領域/);assert.deepEqual(lane.nodes.map(n=>n.y),[100,220,340]);
});
test('Plans round trip and make one History operation; linear templates remain plannable',()=>{
  const d=line(),proposal=L.plan(d,['n0','n1','n2'],{}),history=new C.History(d);assert.deepEqual(C.parseDocument(C.serializeDocument(proposal.document)),proposal.document);assert.equal(history.commit(proposal.document),true);assert.deepEqual(history.undo(),d);assert.deepEqual(history.redo(),proposal.document);
  const template=C.createTemplate('flow-sequence');assert.equal(L.plan(template,template.nodes.map(n=>n.id),{}).unitCount,template.nodes.length);
});
test('A self-loop rejects while an unchanged fixed route inside the first group stays intact',()=>{
  const loop=line();loop.edges.push(C.createEdge({nodeId:'n1'},{nodeId:'n1'},{id:'self_loop'}));const before=clone(loop);
  assert.throws(()=>L.plan(loop,['n0','n1','n2'],{}),/循環/);assert.deepEqual(loop,before);
  const first=line();first.groups=[{id:'first',memberIds:['n0','n1']}];first.edges[0].locked=true;
  const result=L.plan(first,['n0','n2'],{gap:40});assert.deepEqual(result.document.edges[0],first.edges[0]);
});
console.log(JSON.stringify({ok:true,cases},null,2));
