const assert = require('node:assert/strict');
const C=require('../core.js'),R=require('../render.js');
const cases=[];function test(name,run){run();cases.push(name);}
test('All template paths and export bounds are finite and contain edge geometry',()=>{
  for(const t of C.TEMPLATES){const d=C.createTemplate(t.id),b=R.documentBounds(d);assert.ok([b.x,b.y,b.w,b.h].every(Number.isFinite));
    for(const e of d.edges){const g=R.edgeGeometry(d,e);assert.doesNotMatch(g.path,/NaN|Infinity|undefined/);for(const p of [...g.points,g.handle]){assert.ok(p.x>=b.x-.01&&p.x<=b.x+b.w+.01);assert.ok(p.y>=b.y-.01&&p.y<=b.y+b.h+.01);}}
  }
});
test('Same-direction and opposite-direction transitions have distinct routes',()=>{
  const d=C.createTemplate('state-device'),paths=d.edges.map(e=>R.edgeGeometry(d,e).path);assert.equal(new Set(paths).size,paths.length);
  const loop=d.edges.find(e=>e.from.nodeId===e.to.nodeId),n=d.nodes.find(n=>n.id===loop.from.nodeId),g=R.edgeGeometry(d,loop);
  assert.notDeepEqual(g.from,g.to);assert.ok(g.bounds.x+g.bounds.w>n.x+n.w);
});
test('Moving and resizing nodes moves the attached endpoints',()=>{
  const d=C.createTemplate('flow-sequence'),e=d.edges[0],a=R.edgeGeometry(d,e);d.nodes[0].x+=70;d.nodes[0].w+=45;const b=R.edgeGeometry(d,e);
  assert.notDeepEqual(a.from,b.from);assert.notEqual(a.path,b.path);
});
test('Circle and diamond attachment points lie on their outlines',()=>{
  for(const kind of ['state','decision']){const d=C.createDocument('state'),a=C.createNode(kind,20,30),b=C.createNode('process',350,190);d.nodes=[a,b];const e=C.createEdge({nodeId:a.id,side:'auto'},{nodeId:b.id,side:'auto'},{kind:'straight'});d.edges=[e];const p=R.edgeGeometry(d,e).from,dx=(p.x-a.x-a.w/2)/(a.w/2),dy=(p.y-a.y-a.h/2)/(a.h/2);assert.ok(Math.abs((kind==='state'?dx*dx+dy*dy:Math.abs(dx)+Math.abs(dy))-1)<1e-8);}
});
test('Distant labels and manual loops are included in SVG viewBox',()=>{
  const d=C.createTemplate('state-device'),e=d.edges[0];e.label={text:'長いラベル\n2行目',t:.2,dx:-600,dy:-400};const g=R.edgeGeometry(d,e),b=R.documentBounds(d);assert.ok(b.x<g.label.x&&b.y<g.label.y);
  assert.match(R.svgDocument(d),/<title/);assert.match(R.svgDocument(d),/<desc/);
});
test('XML is escaped and exports contain no editor controls or executable markup',()=>{
  const d=C.createTemplate('flow-sequence');d.title='" & <題名>';d.nodes[0].text='<script>alert("x")</script>';d.edges[0].label.text='<img src=x onerror=alert(1)>';
  const svg=R.svgDocument(d);assert.doesNotMatch(svg,/<script|<img|onerror="|foreignObject|tabindex|data-node=/);assert.match(svg,/&lt;script&gt;/);assert.match(svg,/&lt;img/);
});
test('Every palette shape supports Japanese multiline input',()=>{
  for(const kind of Object.keys(C.NODE_DEFS)){const n=C.createNode(kind,0,0,{text:'日本語\n改行'});const markup=R.nodeMarkup(n);assert.doesNotMatch(markup,/NaN|undefined/);const size=R.fitNode(n);assert.ok(size.w>0&&size.h>0);}
});
test('Canvas, preview and printed SVG references stay inside their own diagram',()=>{
  const d=C.createTemplate('state-device'),all=[];
  for(const idPrefix of ['canvas','preview','print']){
    const svg=R.svgDocument(d,{idPrefix}),ids=[...svg.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
    for(const match of svg.matchAll(/url\(#([^)]+)\)/g))assert.ok(ids.includes(match[1]));
    all.push(...ids);
  }
  assert.equal(new Set(all).size,all.length);
});
test('Dark canvas maps only default drawing colors and keeps exports light',()=>{
  const d=C.createTemplate('flow-sequence'),node=d.nodes[0],edge=d.edges[0];
  d.lanes.push({id:'lane-dark',title:'担当',x:0,y:0,w:100,h:100});edge.label.text='接続';
  node.style={...node.style,fill:'#ffdd66'};edge.style={...edge.style,stroke:'#d946ef'};
  const dark=R.sceneMarkup(d,{interactive:true,idPrefix:'dark',theme:'dark'}),light=R.sceneMarkup(d,{interactive:true,idPrefix:'light',theme:'light'}),svg=R.svgDocument(d,{idPrefix:'export'});
  assert.match(dark,/fill="#273442"/,'Edge labels use a readable dark background');
  assert.match(dark,/fill="#222d3a"/,'Lanes use a readable dark body');
  assert.match(dark,/fill="#34465a"/,'Lane headers use a readable dark background');
  assert.match(dark,/stroke="#e8eef7"/,'Default strokes become light on the dark canvas');
  assert.match(dark,/fill="#ffdd66" stroke="#253140"/,'Custom fills keep their original outline');
  assert.match(dark,/fill="#253140"><tspan[^>]*>開始<\/tspan>/,'Custom fills keep their original readable text');
  assert.match(dark,/stroke="#d946ef"/,'Custom edge strokes and arrowheads remain unchanged');
  assert.match(light,/fill="#ffffff"/);assert.match(svg,/fill="#ffffff"/);
  assert.doesNotMatch(svg,/#273442|#222d3a|#34465a|#e8eef7/);
  assert.equal(node.style.fill,'#ffdd66');assert.equal(edge.style.stroke,'#d946ef');
  for(const kind of ['initial','final','fork','join'])assert.match(R.nodeMarkup(C.createNode(kind,0,0),{theme:'dark'}),/#e8eef7/);
});
test('Connection candidates include endpoints, the center and equal subdivisions',()=>{
  assert.deepEqual(R.connectionOffsets(1),[0,.5,1]);
  assert.deepEqual(R.connectionOffsets(2),[0,1/3,.5,2/3,1]);
  assert.deepEqual(R.connectionOffsets(3),[0,.25,.5,.75,1]);
  assert.deepEqual(R.connectionOffsets(4),[0,.2,.4,.5,.6,.8,1]);
});
test('Side counts include both directions and both ends of a self loop',()=>{
  const d=C.createDocument(),n=C.createNode('process',100,200,{w:300,h:100});d.nodes=[n];
  const ep=offset=>({nodeId:n.id,side:'top',offset});
  d.edges=[C.createEdge({x:0,y:0},ep(.37)),C.createEdge(ep(.75),{x:400,y:0}),C.createEdge({nodeId:n.id,side:'bottom'},{x:200,y:450})];
  assert.equal(R.connectionsOnSide(d,n.id,'top').length,2);
  assert.equal(R.snapEndpoint(d,d.edges[0],'to').offset,1/3);
  assert.equal(d.edges[0].to.offset,.37,'Querying snap points must not move existing connections');
  d.edges.push(C.createEdge(ep(.25),ep(.75),{kind:'curve'}));
  assert.equal(R.connectionsOnSide(d,n.id,'top').length,4);
});
test('Automatic orthogonal branches use exact thirds and quarters',()=>{
  for(const count of [2,3]){
    const d=C.createDocument(),n=C.createNode('process',100,80,{w:300,h:100});d.nodes=[n];
    for(let i=0;i<count;i++)d.edges.push(C.createEdge({nodeId:n.id,side:'auto'},{x:100+i*150,y:400}));
    d.edges.forEach((e,i)=>assert.ok(Math.abs((R.edgeGeometry(d,e).from.x-n.x)/n.w-(i+1)/(count+1))<1e-10));
  }
});
test('Snap guides and fixed arrow endpoints share the actual shape outline',()=>{
  for(const kind of ['process','decision','state','terminal','display']){
    const n=C.createNode(kind,100,200),d=C.createDocument();d.nodes=[n];
    for(const side of ['top','right','bottom','left'])for(const offset of R.connectionOffsets(3)){
      const e=C.createEdge({nodeId:n.id,side,offset},{x:600,y:600}),p=R.sidePoint(n,side,offset);d.edges=[e];
      assert.deepEqual(R.edgeGeometry(d,e).from,p);
      const dx=(p.x-n.x-n.w/2)/(n.w/2),dy=(p.y-n.y-n.h/2)/(n.h/2);
      if(kind==='state')assert.ok(Math.abs(dx*dx+dy*dy-1)<1e-8);
      if(kind==='decision')assert.ok(Math.abs(Math.abs(dx)+Math.abs(dy)-1)<1e-8);
    }
  }
  const display=C.createNode('display',100,200),top=R.sidePoint(display,'top',0),right=R.sidePoint(display,'right',0);
  assert.equal(top.x,120);assert.equal(right.x,display.x+display.w-20);
  const narrow=C.createNode('terminal',100,200,{w:40,h:200});assert.deepEqual(R.sidePoint(narrow,'top',0),{x:100,y:300});
});
test('Orthogonal self loops follow the outside of every side and preserve manual anchors',()=>{
  const crossesInterior=(a,b,n)=>a.x===b.x?a.x>n.x+.001&&a.x<n.x+n.w-.001&&Math.max(Math.min(a.y,b.y),n.y)<Math.min(Math.max(a.y,b.y),n.y+n.h):a.y>n.y+.001&&a.y<n.y+n.h-.001&&Math.max(Math.min(a.x,b.x),n.x)<Math.min(Math.max(a.x,b.x),n.x+n.w);
  for(const side of ['top','right','bottom','left']){
    const d=C.createDocument(),n=C.createNode('process',100,100);d.nodes=[n];
    const e=C.createEdge({nodeId:n.id,side,offset:.23},{nodeId:n.id,side,offset:.77},{kind:'orthogonal'});d.edges=[e];const g=R.edgeGeometry(d,e);
    assert.deepEqual(g.from,R.sidePoint(n,side,.23));assert.deepEqual(g.to,R.sidePoint(n,side,.77));assert.doesNotMatch(g.path,/C/);
    assert.ok(g.points.every((p,i)=>!i||!crossesInterior(g.points[i-1],p,n)),`${side} loop must not cross the node interior`);
  }
});
test('Orthogonal self loops route outside for different sides and coincident anchors',()=>{
  const d=C.createDocument(),n=C.createNode('process',100,100);d.nodes=[n];
  const crossesInterior=(a,b)=>a.x===b.x?a.x>n.x+.001&&a.x<n.x+n.w-.001&&Math.max(Math.min(a.y,b.y),n.y)<Math.min(Math.max(a.y,b.y),n.y+n.h):a.y>n.y+.001&&a.y<n.y+n.h-.001&&Math.max(Math.min(a.x,b.x),n.x)<Math.min(Math.max(a.x,b.x),n.x+n.w);
  const pairs=[['right','bottom'],['right','left'],['top','bottom'],['left','top']];
  for(const [fromSide,toSide] of pairs){const e=C.createEdge({nodeId:n.id,side:fromSide,offset:.5},{nodeId:n.id,side:toSide,offset:.5},{kind:'orthogonal'});d.edges=[e];const g=R.edgeGeometry(d,e);assert.ok(g.points.every((p,i)=>!i||p.x===g.points[i-1].x||p.y===g.points[i-1].y));assert.ok(g.points.every((p,i)=>!i||!crossesInterior(g.points[i-1],p)),`${fromSide} to ${toSide} stays outside`);}
  const e=C.createEdge({nodeId:n.id,side:'right',offset:.5},{nodeId:n.id,side:'right',offset:.5},{kind:'orthogonal'});d.edges=[e];const g=R.edgeGeometry(d,e);assert.ok(g.points.length>=7);assert.deepEqual(g.from,g.to);assert.ok(g.bounds.w>n.w*.4);
});
test('Orthogonal self-loop rails stay rectilinear outside large rounded and polygonal nodes',()=>{
  const cases=[['state',{w:260,h:260}],['decision',{w:280,h:180}],['terminal',{w:300,h:140}]],pairs=[['top','top'],['right','right'],['bottom','bottom'],['left','left'],['right','bottom'],['right','left']];
  for(const [kind,size] of cases)for(const [fromSide,toSide] of pairs)for(const [fromOffset,toOffset] of [[.23,.61],[0,1]]){
    const d=C.createDocument(),n=C.createNode(kind,100,100,size),e=C.createEdge({nodeId:n.id,side:fromSide,offset:fromOffset},{nodeId:n.id,side:toSide,offset:toOffset},{kind:'orthogonal'});d.nodes=[n];d.edges=[e];const g=R.edgeGeometry(d,e),rail=g.points[1];
    assert.deepEqual(g.from,R.sidePoint(n,fromSide,fromOffset));assert.deepEqual(g.to,R.sidePoint(n,toSide,toOffset));
    assert.ok(g.points.every((p,i)=>!i||p.x===g.points[i-1].x||p.y===g.points[i-1].y),`${kind} ${fromSide}→${toSide} must remain rectilinear`);
    if(fromSide==='top')assert.ok(rail.y<=n.y-28);else if(fromSide==='bottom')assert.ok(rail.y>=n.y+n.h+28);else if(fromSide==='left')assert.ok(rail.x<=n.x-28);else assert.ok(rail.x>=n.x+n.w+28);
  }
});
test('Orthogonal self-loop bend, bounds and curve fallback remain stable',()=>{
  const d=C.createDocument(),n=C.createNode('process',100,100),ep={nodeId:n.id,side:'right',offset:.5};d.nodes=[n];
  const first=C.createEdge(ep,ep,{kind:'orthogonal'}),second=C.createEdge(ep,ep,{kind:'orthogonal'}),bent=C.createEdge(ep,ep,{kind:'orthogonal',bend:{x:n.x+n.w+140,y:n.y+n.h/2}});d.edges=[first,second,bent];
  const a=R.edgeGeometry(d,first),b=R.edgeGeometry(d,second),g=R.edgeGeometry(d,bent);assert.ok(b.handle.x>a.handle.x);assert.equal(g.handle.x,n.x+n.w+140);assert.ok([...g.points,g.handle,g.bounds].every(p=>Object.values(p).every(Number.isFinite)));
  const curve=C.createEdge(ep,ep,{kind:'curve'}),legacy=C.createEdge(ep,ep,{kind:'straight'});d.edges=[curve];assert.match(R.edgeGeometry(d,curve).path,/C/);d.edges=[legacy];assert.match(R.edgeGeometry(d,legacy).path,/C/);
});
test('Orthogonal self-loop handles keep an outer rail and adjust the intended axes',()=>{
  const d=C.createDocument(),n=C.createNode('process',100,100),right={nodeId:n.id,side:'right',offset:.5};d.nodes=[n];
  const coincident=C.createEdge(right,right,{kind:'orthogonal',bend:{x:n.x+n.w,y:n.y+n.h/2}});d.edges=[coincident];const same=R.edgeGeometry(d,coincident);assert.ok(same.handle.x>=same.points[1].x+28,'An inward bend cannot collapse a coincident loop');
  const adjacent=C.createEdge(right,{nodeId:n.id,side:'bottom',offset:.5},{kind:'orthogonal',bend:{x:n.x+n.w+140,y:n.y+n.h+130}});d.edges=[adjacent];const corner=R.edgeGeometry(d,adjacent);assert.deepEqual(corner.handle,{x:n.x+n.w+140,y:n.y+n.h+130});
  const opposite=C.createEdge(right,{nodeId:n.id,side:'left',offset:.5},{kind:'orthogonal',bend:{x:n.x+n.w+500,y:n.y-140}});d.edges=[opposite];const detour=R.edgeGeometry(d,opposite);assert.equal(detour.points[1].x,n.x+n.w+58);assert.equal(detour.handle.y,n.y-140);assert.notEqual(detour.handle.x,opposite.bend.x);
});
test('Learning overlay is opt-in, escaped, non-mutating, and covers grouped node/edge labels',()=>{
  const d=C.createDocument(),a=C.createNode('process',40,60,{text:'A<&'}),b=C.createNode('process',340,60,{text:'B'});
  const e=C.createEdge({x:0,y:0},{x:600,y:220},{kind:'straight',label:{text:'edge<&',t:.5,dx:80,dy:-20}});d.nodes=[a,b];d.edges=[e];d.groups=[{id:'g<&',memberIds:[a.id,e.id]}];
  const before=JSON.stringify(d),out=R.learningOverlay(d,{selectedIds:[a.id],scale:2});
  assert.equal(JSON.stringify(d),before);assert.match(out,/diagram-learning-overlay/);assert.match(out,/>グループ<\/text>/);assert.match(out,/data-group="g&lt;&amp;"/);assert.doesNotMatch(out,/グループ g/);assert.match(out,/stroke-dasharray/);assert.doesNotMatch(out,/edge&lt;&amp;/);
  assert.doesNotMatch(out,/NaN|Infinity|undefined|tabindex/);assert.doesNotMatch(R.svgDocument(d),/diagram-learning-overlay/);assert.doesNotMatch(R.sceneMarkup(d),/diagram-learning-overlay/);
});
test('Learning overlay renders free-edge groups, locks, and multiple current tokens',()=>{
  const d=C.createDocument(),n=C.createNode('process',100,100,{text:'現在<&',locked:true});
  const e=C.createEdge({x:20,y:240},{x:420,y:240},{kind:'straight',locked:true});d.nodes=[n];d.edges=[e];d.lanes=[{id:'l',title:'領域',x:0,y:0,w:500,h:300,locked:true}];d.groups=[{id:'free',memberIds:[e.id]}];
  const out=R.learningOverlay(d,{selectedIds:[e.id],trace:{current:[n.id,n.id],visitedNodes:[n.id],visitedEdges:[e.id]}});
  assert.match(out,/>グループ<\/text>/);assert.match(out,/data-group="free"/);assert.match(out,/固定/);assert.match(out,/aria-label="固定:/);assert.match(out,/現在 ×2/);assert.match(out,/diagram-learning-trace-edge/);assert.match(out,/diagram-learning-trace-node/);assert.match(out,/pointer-events="none"/);
});
test('Learning overlay tolerates legacy documents and invalid scale',()=>{
  const d=C.createDocument();delete d.groups;const out=R.learningOverlay(d,{scale:NaN});
  assert.equal(typeof out,'string');assert.doesNotMatch(out,/NaN|Infinity|undefined/);assert.match(out,/diagram-learning-overlay/);
});
test('Lane titles stay within the 32px header and retain escaped full text',()=>{
  const d=C.createDocument(),title='非常に長い担当領域名<&>\n複数行の説明';d.lanes=[{id:'lane-long',title,x:10,y:20,w:180,h:240},{id:'lane-narrow',title:'狭い<&>',x:210,y:20,w:1,h:240}];const before=JSON.stringify(d),svg=R.sceneMarkup(d,{interactive:false,theme:'dark'});
  assert.equal(JSON.stringify(d),before);assert.match(svg,/担当領域名&lt;&amp;&gt;/);assert.match(svg,/<title>非常に長い担当領域名&lt;&amp;&gt;/);assert.match(svg,/font-size="(?:11|12|14)"/);assert.doesNotMatch(svg,/NaN|Infinity|undefined/);
});
test('Long lane headers use two bounded lines and explicit export colors',()=>{
  const d=C.createDocument('activity');d.lanes=[{id:'long',title:'とても長い担当領域の名前を省略しても全文は保持する<&>'.repeat(4),x:0,y:0,w:140,h:600}];
  const dark=R.sceneMarkup(d,{interactive:true,theme:'dark'}),label=dark.match(/<text[^>]*>([\s\S]*?)<\/text>/)[0];
  assert.equal((label.match(/<tspan /g)||[]).length,2);assert.match(label,/font-size="11"/);assert.match(label,/…/);assert.match(label,/fill="#eef4fb"/);assert.doesNotMatch(dark,/var\(--lane/);
  assert.ok(dark.includes(`<title>${R.escapeXML(d.lanes[0].title)}</title>`));assert.match(R.svgDocument(d),/fill="#253140"/);
});
test('Alignment snapping finds deterministic node guides with zoom tolerance and keeps data unchanged',()=>{
  const d=C.createDocument(),a=C.createNode('process',10,-20,{id:'a',w:100,h:60}),b=C.createNode('process',115,100,{id:'b',w:100,h:80,locked:true}),c=C.createNode('process',400,100,{id:'c'});d.nodes=[a,b,c];const before=JSON.stringify(d);
  const hit=R.alignmentSnap(d,['a'],{dx:5,dy:0},{scale:2,tolerance:6});assert.equal(hit.dx,5);assert.ok(hit.guides.some(g=>g.axis==='x'&&g.value===115));assert.deepEqual(hit.guides[0].targetIds,['b']);assert.equal(JSON.stringify(d),before);
  const none=R.alignmentSnap(d,['a'],{dx:12,dy:0},{scale:1,tolerance:6});assert.equal(none.guides.length,0);assert.deepEqual(R.alignmentSnap(d,['missing'],{dx:3,dy:4}),{dx:3,dy:4,guides:[]});
});
test('Alignment supports every pair of edge and center anchors on both axes',()=>{
  const d=C.createDocument(),a=C.createNode('process',-220,-160,{id:'moving',w:82,h:62}),b=C.createNode('process',400,360,{id:'target',w:142,h:102});d.nodes=[a,b];
  for(const axis of ['x','y'])for(let from=0;from<3;from++)for(let to=0;to<3;to++){
    const dim=axis==='x'?'w':'h',key=axis==='x'?'dx':'dy',target=b[axis]+b[dim]*to/2,wanted=target-a[axis]-a[dim]*from/2;
    const result=R.alignmentSnap(d,[a.id],{dx:0,dy:0,[key]:wanted+2});
    assert.equal(result[key],wanted,`${axis}: anchor ${from} to ${to}`);assert.equal(result.guides.find(g=>g.axis===axis).value,target);
  }
});
test('Alignment tolerance is measured in screen pixels and excludes offscreen targets',()=>{
  const d=C.createDocument();d.nodes=[C.createNode('process',0,0,{id:'a',w:400,h:400}),C.createNode('process',1000,1000,{id:'b',w:600,h:600})];
  for(const scale of [.25,1,2,4])for(const sign of [-1,1]){
    const hit=R.alignmentSnap(d,['a'],{dx:1000+sign*5.9/scale,dy:0},{scale});assert.equal(hit.dx,1000);
    const miss=R.alignmentSnap(d,['a'],{dx:1000+sign*6.1/scale,dy:0},{scale});assert.ok(!miss.guides.some(g=>g.axis==='x'));
  }
  assert.equal(R.alignmentSnap(d,['a'],{dx:1000,dy:0},{viewport:{x:0,y:0,w:900,h:900}}).guides.length,0);
  assert.ok(R.alignmentSnap(d,['a'],{dx:1000,dy:0},{viewport:{x:0,y:0,w:1100,h:1100}}).guides.some(g=>g.axis==='x'));
  const fallback=R.alignmentSnap(d,['a'],{dx:1004,dy:0},{scale:NaN});assert.equal(fallback.dx,1000);
});
test('Alignment uses the rigid group node bounds and never uses members as targets',()=>{
  const d=C.createDocument();d.nodes=[C.createNode('process',0,0,{id:'a',w:100,h:100}),C.createNode('process',200,100,{id:'b',w:100,h:100}),C.createNode('process',410,500,{id:'c',w:100,h:100,locked:true})];
  d.edges=[C.createEdge({nodeId:'a'},{nodeId:'b'},{id:'e',bend:{x:-500,y:-500}})];d.groups=[{id:'g',memberIds:['a','b','e']}];C.parseDocument(d);
  const before=C.serializeDocument(d),svg=R.svgDocument(d),result=R.alignmentSnap(d,['a'],{dx:104,dy:0});assert.equal(result.dx,110);assert.deepEqual(result,R.alignmentSnap(d,['g'],{dx:104,dy:0}));assert.ok(result.guides.every(g=>g.targetIds.every(id=>id==='c')));
  assert.equal(C.serializeDocument(d),before);assert.equal(R.svgDocument(d),svg);
  assert.equal(R.alignmentSnap(d,['a','c'],{dx:0,dy:0}).guides.length,0);
  assert.deepEqual(R.alignmentSnap({...d,groups:[]},['e'],{dx:8,dy:3}),{dx:8,dy:3,guides:[]});
});
test('Equal alignment candidates are stable and guide spans use both snapped axes',()=>{
  const d=C.createDocument();d.nodes=[C.createNode('process',0,0,{id:'a',w:100,h:60}),C.createNode('process',200,300,{id:'b',w:100,h:60}),C.createNode('process',204,500,{id:'c',w:100,h:60})];
  const a=R.alignmentSnap(d,['a'],{dx:202,dy:0}),b=R.alignmentSnap({...d,nodes:[...d.nodes].reverse()},['a'],{dx:202,dy:0});assert.deepEqual(a,b);assert.equal(a.dx,200);
  d.nodes.pop();const both=R.alignmentSnap(d,['a'],{dx:195,dy:295});assert.equal(both.dx,200);assert.equal(both.dy,300);
  assert.deepEqual(both.guides.find(g=>g.axis==='x'),{axis:'x',value:250,start:292,end:368,targetIds:['b']});assert.deepEqual(both.guides.find(g=>g.axis==='y'),{axis:'y',value:330,start:192,end:308,targetIds:['b']});
});
test('Selection export expands groups and keeps geometry positions without leaking unrelated items',()=>{
  const d=C.createDocument(),a=C.createNode('process',20,40,{id:'a'}),b=C.createNode('process',240,40,{id:'b'}),other=C.createNode('process',500,300,{id:'other'});const edge=C.createEdge({nodeId:a.id,side:'right'},{nodeId:b.id,side:'left'},{id:'inside',label:{text:'内部'}}),outside=C.createEdge({nodeId:b.id,side:'bottom'},{x:700,y:500},{id:'outside'});d.nodes=[a,b,other];d.edges=[edge,outside];d.groups=[{id:'group',memberIds:['a','b']}];const before=JSON.stringify(d),picked=R.exportSelection(d,['a']);assert.deepEqual(picked.nodes.map(n=>n.id),['a','b']);assert.deepEqual(picked.edges.map(e=>e.id),['inside']);assert.deepEqual(picked.lanes,[]);const svg=R.svgDocument(d,{selectedIds:['a'],padding:0});assert.match(svg,/内部/);assert.doesNotMatch(svg,/outside/);assert.equal(JSON.stringify(d),before);
});
test('Selection export handles whole, empty, lane, edge-only, parallel and loop selections',()=>{
  const d=C.createDocument('activity');d.lanes=[{id:'laneA',title:'対象レーン',x:0,y:0,w:300,h:500},{id:'laneB',title:'非選択レーン',x:300,y:0,w:300,h:500}];const a=C.createNode('action',40,80,{id:'a',laneId:'laneA',text:'対象'}),b=C.createNode('action',180,80,{id:'b',laneId:'laneA',text:'対象2'}),z=C.createNode('action',340,300,{id:'z',laneId:'laneB',text:'漏れるな'});const e=C.createEdge({nodeId:a.id,side:'right'},{nodeId:b.id,side:'left'},{id:'e',kind:'curve',label:{text:'保持ラベル'}}),loop=C.createEdge({nodeId:a.id,side:'bottom'},{nodeId:a.id,side:'bottom'},{id:'loop',kind:'curve'}),out=C.createEdge({nodeId:b.id,side:'right'},{nodeId:z.id,side:'left'},{id:'out'});d.nodes=[a,b,z];d.edges=[e,loop,out];const before=JSON.stringify(d),all=R.exportSelection(d,null);assert.equal(all.nodes.length,3);assert.equal(R.exportSelection(d,[]).nodes.length,0);assert.equal(R.exportSelection(d,['unknown']).edges.length,0);const lane=R.exportSelection(d,['laneA']);assert.deepEqual(lane.nodes.map(n=>n.id),['a','b']);assert.deepEqual(lane.edges.map(x=>x.id).sort(),['e','loop']);const edge=R.exportSelection(d,['e']);assert.deepEqual(edge.edges.map(x=>x.id),['e']);const path=R.edgeGeometry(d,e).path;const svg=R.svgDocument(d,{selectedIds:['e'],padding:0});assert.ok(svg.includes(path));assert.match(svg,/保持ラベル/);assert.doesNotMatch(svg,/漏れるな|非選択レーン/);assert.equal(JSON.stringify(d),before);
});
test('Empty selection never falls back to the whole drawing or its descriptions',()=>{
  const d=C.createTemplate(C.TEMPLATES.find(t=>t.diagramType==='activity').id),before=C.serializeDocument(d);
  assert.equal(R.svgDocument(d),R.svgDocument(d,{selectedIds:null}));
  for(const selectedIds of [[],['missing']]){
    assert.deepEqual(R.exportSelection(d,selectedIds),{nodes:[],edges:[],lanes:[]});
    const svg=R.svgDocument(d,{selectedIds});assert.match(svg,/0個の図形と0本の接続線/);assert.doesNotMatch(svg,/<marker|<tspan/);
    for(const l of d.lanes)assert.ok(!svg.includes(R.escapeXML(l.title)));
  }
  assert.equal(C.serializeDocument(d),before);
});
test('A selected edge retains its original obstacle route, label and complete output bounds',()=>{
  const d=C.createDocument();d.nodes=[C.createNode('process',0,100,{id:'a',text:'非選択の始点'}),C.createNode('process',600,100,{id:'b',text:'非選択の終点'}),C.createNode('process',300,75,{id:'obstacle',text:'非選択の障害物',w:180,h:130})];
  const e=C.createEdge({nodeId:'a',side:'right'},{nodeId:'b',side:'left'},{id:'route',label:{text:'遠いラベル',dx:135,dy:-180}});d.edges=[e];
  const before=C.serializeDocument(d),g=R.edgeGeometry(d,e),svg=R.svgDocument(d,{selectedIds:[e.id],padding:0});
  assert.ok(svg.includes(`d="${g.path}"`));assert.notEqual(g.path,R.edgeGeometry({...d,nodes:d.nodes.slice(0,2)},e).path);
  const b=R.documentBounds(d,{selectedIds:[e.id]});assert.deepEqual(b,g.bounds);
  const bounds=svg.match(/viewBox="([^"]+)"/)[1].split(' ').map(Number);[b.x,b.y,b.w,b.h].forEach((v,i)=>assert.ok(Math.abs(bounds[i]-v)<.001));
  assert.match(svg,/遠いラベル/);assert.doesNotMatch(svg,/非選択|data-edge|data-node|alignment-guide|diagram-learning/);
  assert.equal(C.serializeDocument(d),before);
});
test('Exporting one parallel curve or self loop keeps the original curve slot and manual label',()=>{
  const d=C.createDocument('state');d.nodes=[C.createNode('state',0,0,{id:'a',text:'状態A'}),C.createNode('state',500,0,{id:'b',text:'状態B'})];
  const ep=id=>({nodeId:id,side:'auto',offset:.5});
  d.edges=[C.createEdge(ep('a'),ep('b'),{id:'curve1',kind:'curve'}),C.createEdge(ep('a'),ep('b'),{id:'curve2',kind:'curve',label:{text:'曲線ラベル',dx:41,dy:-37}}),C.createEdge(ep('a'),ep('a'),{id:'loop1',kind:'curve'}),C.createEdge(ep('a'),ep('a'),{id:'loop2',kind:'curve',label:{text:'ループラベル',dx:-15,dy:45}})];
  const before=C.serializeDocument(d);
  for(const id of ['curve2','loop2']){
    const e=d.edges.find(e=>e.id===id),g=R.edgeGeometry(d,e),svg=R.svgDocument(d,{selectedIds:[id]});
    assert.ok(svg.includes(`d="${g.path}"`));assert.notEqual(g.path,R.edgeGeometry({...d,edges:[e]},e).path);
    assert.equal((svg.match(/<marker /g)||[]).length,1);assert.ok(svg.includes(R.escapeXML(e.label.text)));assert.doesNotMatch(svg,/状態A|状態B/);
    for(const hidden of d.edges.filter(o=>o.id!==id))assert.ok(!svg.includes(`diagram-arrow-${hidden.id}`));
    const b=R.documentBounds(d,{selectedIds:[id]});assert.ok(b.x<=g.labelBounds.x&&b.y<=g.labelBounds.y);assert.ok(b.x+b.w>=g.labelBounds.x+g.labelBounds.w&&b.y+b.h>=g.labelBounds.y+g.labelBounds.h);
  }
  assert.equal(C.serializeDocument(d),before);
});
test('A selected lane keeps complete groups, internal lines and fixed content without other lane headers',()=>{
  const d=C.createDocument('activity');d.lanes=[{id:'lane1',title:'選択した担当',x:0,y:0,w:300,h:600},{id:'lane2',title:'選択外の担当',x:300,y:0,w:300,h:600}];
  d.nodes=[C.createNode('action',30,100,{id:'a',laneId:'lane1',locked:true}),C.createNode('action',330,100,{id:'b',laneId:'lane2'}),C.createNode('action',330,400,{id:'c',laneId:'lane2',text:'選択外の処理'})];
  d.edges=[C.createEdge({nodeId:'a'},{nodeId:'b'},{id:'inside',bend:{x:280,y:220}}),C.createEdge({nodeId:'b'},{nodeId:'c'},{id:'outside'})];d.groups=[{id:'group',memberIds:['a','b']}];
  const before=C.serializeDocument(d),part=R.exportSelection(d,['lane1']),svg=R.svgDocument(d,{selectedIds:['lane1']});
  assert.deepEqual(part.nodes.map(n=>n.id),['a','b']);assert.deepEqual(part.edges.map(e=>e.id),['inside']);assert.deepEqual(part.lanes.map(l=>l.id),['lane1']);
  assert.match(svg,/選択した担当/);assert.doesNotMatch(svg,/選択外|diagram-arrow-outside|data-group|固定/);assert.equal(C.serializeDocument(d),before);
});
test('Orthogonal automatic routes detour around node obstacles without mutating the document',()=>{
  const d=C.createDocument(),from=C.createNode('process',20,180,{id:'from'}),block=C.createNode('process',250,150,{id:'block',w:150,h:120}),to=C.createNode('process',520,180,{id:'to'});
  const e=C.createEdge({nodeId:from.id,side:'right',offset:.5},{nodeId:to.id,side:'left',offset:.5},{id:'route'});d.nodes=[from,block,to];d.edges=[e];const before=JSON.stringify(d),g=R.edgeGeometry(d,e);
  assert.notEqual(g.path,`M${g.from.x} ${g.from.y}L${g.to.x} ${g.to.y}`);assert.equal(JSON.stringify(d),before);
  const obstacle={x:block.x-12,y:block.y-12,r:block.x+block.w+12,b:block.y+block.h+12};for(let i=1;i<g.points.length;i++){const a=g.points[i-1],b=g.points[i];if(a.y===b.y)assert.ok(!(a.y>obstacle.y&&a.y<obstacle.b&&Math.max(a.x,b.x)>obstacle.x&&Math.min(a.x,b.x)<obstacle.r));else assert.ok(!(a.x>obstacle.x&&a.x<obstacle.r&&Math.max(a.y,b.y)>obstacle.y&&Math.min(a.y,b.y)<obstacle.b));}
});
test('Orthogonal routes preserve explicit anchors and manual bends',()=>{
  const d=C.createDocument(),a=C.createNode('process',20,80,{id:'a'}),b=C.createNode('process',400,80,{id:'b'}),ob=C.createNode('process',190,60,{id:'ob'});d.nodes=[a,b,ob];
  const fixed=C.createEdge({nodeId:a.id,side:'bottom',offset:.23},{nodeId:b.id,side:'top',offset:.77},{id:'fixed',kind:'orthogonal',bend:{x:700,y:500}}),g=R.edgeGeometry(d,fixed);assert.deepEqual(g.from,R.sidePoint(a,'bottom',.23));assert.deepEqual(g.to,R.sidePoint(b,'top',.77));assert.deepEqual(fixed.bend,{x:700,y:500});assert.doesNotMatch(g.path,/NaN|Infinity/);
  const reverse=C.createEdge({nodeId:b.id,side:'left',offset:.5},{nodeId:a.id,side:'right',offset:.5},{id:'reverse'});d.edges.push(reverse);const rg=R.edgeGeometry(d,reverse);assert.ok(rg.points.length>=2);assert.deepEqual(rg.from,R.sidePoint(b,'left',.5));assert.deepEqual(rg.to,R.sidePoint(a,'right',.5));
});
test('Orthogonal routing considers blockers beyond the nearest obstacle cap and avoids loop neighbors',()=>{
  const d=C.createDocument(),a=C.createNode('process',0,0,{id:'a',w:120,h:60}),b=C.createNode('process',2000,0,{id:'b',w:120,h:60}),blocked=C.createNode('process',1000,0,{id:'blocked',w:120,h:60});
  d.nodes=[a,b,...Array.from({length:32},(_,i)=>C.createNode('process',200+2*i,200,{id:`near${i}`,w:1,h:1})),blocked];const e=C.createEdge({nodeId:a.id,side:'right'},{nodeId:b.id,side:'left'},{id:'long'});d.edges=[e];const g=R.edgeGeometry(d,e);assert.ok(g.points.some(p=>p.y<0||p.y>60),'A blocker after 32 distractors must still cause a detour');
  const loopDoc=C.createDocument(),loop=C.createNode('process',0,0,{id:'loopNode',w:120,h:80}),neighbor=C.createNode('process',160,-20,{id:'neighbor',w:120,h:140});loopDoc.nodes=[loop,neighbor];const loopEdge=C.createEdge({nodeId:loop.id,side:'right',offset:.3},{nodeId:loop.id,side:'right',offset:.7},{id:'loopEdge'});loopDoc.edges=[loopEdge];const lg=R.edgeGeometry(loopDoc,loopEdge);assert.doesNotMatch(lg.path,/NaN|Infinity/);assert.ok(lg.points.length>=4);
});
function assertRouteClear(doc,edge,geometry,padding=0) {
  for(let i=1;i<geometry.points.length;i++) {
    const a=geometry.points[i-1],b=geometry.points[i];
    assert.ok(a.x===b.x||a.y===b.y,'All route segments stay orthogonal');
    for(const node of doc.nodes) {
      if(i===1&&node.id===edge.from.nodeId||i===geometry.points.length-1&&node.id===edge.to.nodeId)continue;
      const box={x:node.x-padding,y:node.y-padding,r:node.x+node.w+padding,b:node.y+node.h+padding};
      const crosses=a.y===b.y?a.y>box.y+1e-7&&a.y<box.b-1e-7&&Math.max(Math.min(a.x,b.x),box.x)<Math.min(Math.max(a.x,b.x),box.r)-1e-7:a.x>box.x+1e-7&&a.x<box.r-1e-7&&Math.max(Math.min(a.y,b.y),box.y)<Math.min(Math.max(a.y,b.y),box.b)-1e-7;
      assert.equal(crosses,false,`${edge.id} must avoid ${node.id} at segment ${i}`);
    }
  }
}
test('Return routes avoid their endpoint nodes and take narrow gaps without moving anchors',()=>{
  const d=C.createDocument(),a=C.createNode('process',0,0,{id:'return_a',w:120,h:60}),b=C.createNode('process',500,0,{id:'return_b',w:120,h:60});d.nodes=[a,b];
  const e=C.createEdge({nodeId:b.id,side:'right',offset:.5},{nodeId:a.id,side:'left',offset:.5});d.edges=[e];
  assertRouteClear(d,e,R.edgeGeometry(d,e),12);
  const narrow=C.createDocument();narrow.nodes=[C.createNode('decision',0,0,{id:'p',w:172,h:100}),C.createNode('terminal',420,0,{id:'q',w:160,h:52}),C.createNode('process',190,-30,{id:'x',w:150,h:120})];
  const back=C.createEdge({nodeId:'q',side:'left',offset:.5},{nodeId:'p',side:'right',offset:.5});narrow.edges=[back];const g=R.edgeGeometry(narrow,back);
  assertRouteClear(narrow,back,g);assert.deepEqual(g.to,R.sidePoint(narrow.nodes[0],'right',.5));assert.ok(g.points.at(-2).x-g.to.x<22,'A narrow gap shortens the endpoint stub');
});
test('Self loops and a multi-turn escape avoid every intervening node',()=>{
  for(const sides of [['right','left'],['right','right']]) {
    const d=C.createDocument(),n=C.createNode('process',0,0,{id:'loop',w:120,h:80}),o=C.createNode('process',160,-20,{id:'neighbor',w:120,h:140});d.nodes=[n,o];
    const e=C.createEdge({nodeId:n.id,side:sides[0],offset:.5},{nodeId:n.id,side:sides[1],offset:.5});d.edges=[e];const g=R.edgeGeometry(d,e);assertRouteClear(d,e,g);
    assert.ok(g.points.length>=4);assert.ok(g.bounds.w>20&&g.bounds.h>20);
  }
  const maze=C.createDocument();maze.nodes=[['a',100,100,120,60],['b',600,100,120,60],['top',50,0,450,40],['right',460,40,40,260],['bottom',50,260,410,40],['left',50,80,40,180]].map(([id,x,y,w,h])=>C.createNode('process',x,y,{id,w,h}));
  const e=C.createEdge({nodeId:'a',side:'right'},{nodeId:'b',side:'left'});maze.edges=[e];const before=JSON.stringify(maze),g=R.edgeGeometry(maze,e);
  assertRouteClear(maze,e,g,12);assert.ok(g.points.length>=8,'The enclosed source needs more than a single detour');assert.equal(JSON.stringify(maze),before);
});
test('Default routed labels remain readable and manual label offsets are preserved',()=>{
  const d=C.createDocument();d.nodes=[C.createNode('process',120,150,{id:'a'}),C.createNode('process',620,150,{id:'b'}),C.createNode('process',370,140,{id:'block'})];
  const e=C.createEdge({nodeId:'a',side:'right'},{nodeId:'b',side:'left'},{label:{text:'進む'}});d.edges=[e];const before=JSON.stringify(d),g=R.edgeGeometry(d,e),box=g.labelBounds;
  for(const n of d.nodes)assert.ok(box.x+box.w<=n.x||box.x>=n.x+n.w||box.y+box.h<=n.y||box.y>=n.y+n.h,'Automatic labels must not hide under nodes');
  assert.equal(JSON.stringify(d),before);assertRouteClear(d,e,g);
  e.label.dx=35;e.label.dy=40;const manual=R.edgeGeometry(d,e);assert.deepEqual(manual.labelOffset,{x:35,y:40});
});
test('Automatic routing stays bounded on a document near the object limit',()=>{
  const d=C.createDocument();d.nodes=Array.from({length:998},(_,i)=>C.createNode('process',(i%40)*200,Math.floor(i/40)*110,{id:`large_${i}`,w:120,h:60}));
  const e=C.createEdge({nodeId:'large_0',side:'right'},{nodeId:'large_39',side:'left'});d.edges=[e];const started=performance.now(),g=R.edgeGeometry(d,e);
  assert.ok(performance.now()-started<4000,'A bounded route search must not stall on hundreds of nodes');assertRouteClear(d,e,g,12);
  const crowded=C.createDocument();crowded.nodes=d.nodes.slice(0,75);crowded.edges=Array.from({length:75},(_,i)=>C.createEdge({nodeId:`large_${i}`,side:'bottom'},{nodeId:`large_${(i+23)%75}`,side:'top'}));
  const begin=performance.now(),svg=R.sceneMarkup(crowded);assert.ok(performance.now()-begin<4000,'A classroom-sized scene must remain responsive');assert.doesNotMatch(svg,/NaN|Infinity/);
});
console.log(JSON.stringify({ok:true,cases},null,2));
