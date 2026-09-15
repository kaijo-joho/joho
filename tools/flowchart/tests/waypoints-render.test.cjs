const assert = require('node:assert/strict');
const C = require('../core.js'), R = require('../render.js');
const cases = [];
const test = (name, fn) => { fn(); cases.push(name); };
const distance = (a,b) => Math.hypot(a.x-b.x,a.y-b.y);
function simplify(points) {
  const result=[];
  for(const p of points) {
    if(result.length&&distance(result.at(-1),p)<1e-6)continue;
    while(result.length>1) {
      const a=result.at(-2),b=result.at(-1),dx=b.x-a.x,dy=b.y-a.y,ex=p.x-b.x,ey=p.y-b.y;
      if(Math.abs(dx*ey-dy*ex)>1e-6||dx*ex+dy*ey<0)break;
      result.pop();
    }
    result.push(p);
  }
  return result;
}
function assertRoute(g, controls) {
  assert.ok(g.points.every(p=>Number.isFinite(p.x)&&Number.isFinite(p.y)));
  for(let i=1;i<g.points.length;i++)assert.ok(Math.abs(g.points[i].x-g.points[i-1].x)<1e-6||Math.abs(g.points[i].y-g.points[i-1].y)<1e-6,'Every rendered segment is horizontal or vertical');
  let index=0;
  for(const p of controls) {const found=g.points.findIndex((q,i)=>i>=index&&distance(p,q)<1e-6);assert.ok(found>=0,`Missing ordered control ${JSON.stringify(p)}`);index=found;}
}
function sample() {
  const d=C.createDocument(),a=C.createNode('process',0,0,{id:'a'}),b=C.createNode('decision',500,360,{id:'b'});
  const e=C.createEdge({nodeId:a.id,side:'right',offset:.5},{nodeId:b.id,side:'left',offset:.5},{id:'e',label:{text:'条件',t:.3,dx:14,dy:-20},waypoints:[{x:230,y:32},{x:300,y:160},{x:400,y:300}]});
  d.nodes=[a,b];d.edges=[e];return {d,e,a,b};
}
test('Manual routes pass through every point in order and keep attached endpoints and document data',()=>{
  const {d,e,a,b}=sample(),before=C.serializeDocument(d),g=R.edgeGeometry(d,e);
  assertRoute(g,e.waypoints);assert.deepEqual(g.from,R.sidePoint(a,'right',.5));assert.deepEqual(g.to,R.sidePoint(b,'left',.5));assert.equal(C.serializeDocument(d),before);
  a.x+=70;a.w+=40;b.y+=120;
  const moved=R.edgeGeometry(d,e);assertRoute(moved,e.waypoints);assert.deepEqual(moved.from,R.sidePoint(a,'right',.5));assert.deepEqual(moved.to,R.sidePoint(b,'left',.5));
});
test('Reversing the endpoints and ordered points preserves the complete route and label position',()=>{
  const {d,e}=sample(),before=R.edgeGeometry(d,e);
  [e.from,e.to]=[e.to,e.from];e.waypoints.reverse();e.label.t=1-e.label.t;
  const after=R.edgeGeometry(d,e);
  assert.deepEqual(simplify(after.points),simplify(before.points).reverse());assert.ok(distance(before.label,after.label)<1e-6);
});
test('The first inserted point preserves existing template corners and legacy bend geometry',()=>{
  for(const template of C.TEMPLATES) {
    const d=C.createTemplate(template.id);
    for(const e of d.edges.filter(e=>e.kind==='orthogonal')) {
      const before=R.edgeGeometry(d,e),layout=R.waypointGeometry(d,e);
      const segment=layout.points.slice(1).map((b,i)=>({a:layout.points[i],b,length:distance(layout.points[i],b)})).sort((a,b)=>b.length-a.length)[0];
      const added=R.insertWaypoint(d,e,{x:(segment.a.x+segment.b.x)/2,y:(segment.a.y+segment.b.y)/2});
      C.setEdgeWaypoints(d,e.id,added.waypoints);const updated=d.edges.find(edge=>edge.id===e.id),after=R.edgeGeometry(d,updated);
      assert.equal(updated.waypoints.length,layout.waypoints.length+1);assertRoute(after,updated.waypoints);assert.deepEqual(simplify(after.points),simplify(before.points),template.id);
    }
  }
});
test('Self loops retain the correct outline anchors on all sixteen side combinations',()=>{
  for(const fromSide of ['top','right','bottom','left'])for(const toSide of ['top','right','bottom','left']) {
    const d=C.createDocument('state'),n=C.createNode('state',100,100,{id:'loop_node'}),e=C.createEdge({nodeId:n.id,side:fromSide,offset:.25},{nodeId:n.id,side:toSide,offset:.75},{id:'loop'});d.nodes=[n];d.edges=[e];
    const before=R.edgeGeometry(d,e),points=R.waypointGeometry(d,e).waypoints;
    C.setEdgeWaypoints(d,e.id,points);const after=R.edgeGeometry(d,d.edges[0]);
    assertRoute(after,points);assert.deepEqual(simplify(after.points),simplify(before.points));
  }
});
test('Insertions on generated elbows use the matching position in the ordered points',()=>{
  const {d,e}=sample(),g=R.waypointGeometry(d,e);
  for(let i=1;i<g.points.length;i++) {
    if(distance(g.points[i-1],g.points[i])<1)continue;
    const p={x:(g.points[i-1].x+g.points[i].x)/2,y:(g.points[i-1].y+g.points[i].y)/2},added=R.insertWaypoint(d,e,p);
    assert.equal(added.index,g.segmentSlots[i-1]);assert.deepEqual(added.waypoints[added.index],p);
    assert.deepEqual(added.waypoints.filter((_,j)=>j!==added.index),e.waypoints);
  }
});
test('Free endpoints, repeated points and thirty-two points remain finite and bounded',()=>{
  const d=C.createDocument(),e=C.createEdge({x:0,y:0},{x:1000,y:700},{waypoints:Array.from({length:32},(_,i)=>({x:20+i*20,y:i%2?300:100}))});d.edges=[e];
  assertRoute(R.edgeGeometry(d,e),e.waypoints);assert.throws(()=>R.insertWaypoint(d,e,{x:10,y:10}),/32/);
  e.waypoints=[{x:0,y:0},{x:0,y:0},{x:1000,y:700}];assertRoute(R.edgeGeometry(d,e),e.waypoints);
  e.to={x:0,y:0};e.waypoints=[{x:0,y:0}];assertRoute(R.edgeGeometry(d,e),e.waypoints);
});
test('A process insertion splits the manual route without losing the paths before and after it',()=>{
  const d=C.createDocument(),e=C.createEdge({x:0,y:100},{x:600,y:100},{id:'split',label:{text:'条件'},waypoints:[{x:100,y:100},{x:100,y:300},{x:500,y:300},{x:500,y:100}]});d.edges=[e];
  const n=C.createNode('process',250,268,{id:'inserted'}),split=R.splitWaypoints(d,e,n);
  assert.deepEqual(split.incomingWaypoints,[{x:100,y:100},{x:100,y:300}]);assert.deepEqual(split.outgoingWaypoints,[{x:500,y:300},{x:500,y:100}]);
  C.insertNodeOnEdge(d,e.id,n,{entrySide:'left',exitSide:'right',...split});
  d.edges.forEach(edge=>assertRoute(R.edgeGeometry(d,edge),edge.waypoints));assert.equal(d.edges[0].label.text,'条件');assert.equal(d.edges[1].label.text,'');
});
test('Export bounds include every detour and exported SVG contains only drawing data',()=>{
  const {d,e}=sample();e.waypoints.push({x:-500,y:1800});const g=R.edgeGeometry(d,e),bounds=R.documentBounds(d);
  assertRoute(g,e.waypoints);for(const p of e.waypoints)assert.ok(p.x>=bounds.x&&p.x<=bounds.x+bounds.w&&p.y>=bounds.y&&p.y<=bounds.y+bounds.h);
  const svg=R.svgDocument(d,{selectedIds:[e.id]});assert.ok(svg.includes(g.path));assert.doesNotMatch(svg,/data-handle|waypoint-index|route-bar|tabindex/);
  const copy=C.parseDocument(C.serializeDocument(d));assert.deepEqual(R.edgeGeometry(copy,copy.edges[0]).points,g.points);
});
console.log(JSON.stringify({ok:true,cases},null,2));
