(function(root,factory){
  const core=typeof module==='object'&&module.exports?require('./core.js'):root.DiagramCore;
  const api=factory(core);if(typeof module==='object'&&module.exports)module.exports=api;else root.DiagramLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(Core){
  'use strict';
  if(!Core)throw new Error('自動配置には core.js が必要です。');
  const clone=value=>JSON.parse(JSON.stringify(value));
  const fail=message=>{throw new Error(message);};
  const record=value=>value&&typeof value==='object'&&!Array.isArray(value);
  const bounds=nodes=>{const x=Math.min(...nodes.map(n=>n.x)),y=Math.min(...nodes.map(n=>n.y)),r=Math.max(...nodes.map(n=>n.x+n.w)),b=Math.max(...nodes.map(n=>n.y+n.h));return{x,y,w:r-x,h:b-y,cx:(x+r)/2,cy:(y+b)/2};};
  const overlap=(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y;
  function options(value={}){
    if(!record(value))fail('自動配置の設定が不正です。');
    const direction=value.direction===undefined?'vertical':value.direction, gap=value.gap===undefined?60:value.gap, route=value.route===undefined?true:value.route;
    if(!['vertical','horizontal'].includes(direction))fail('配置方向が不正です。');
    if(typeof gap!=='number'||!Number.isFinite(gap)||gap<0||gap>400)fail('間隔は0〜400で指定してください。');
    if(typeof route!=='boolean')fail('接続線の設定が不正です。');
    return{direction,gap,route};
  }
  function units(doc,nodeIds){
    const byNode=new Map(),out=[];
    for(const group of doc.groups||[]){
      const members=group.memberIds.filter(id=>nodeIds.has(id));if(!members.length)continue;
      const all=group.memberIds.filter(id=>doc.nodes.some(n=>n.id===id));
      if(!all.every(id=>nodeIds.has(id)))fail('グループはまとめて選択してください。');
      const item={id:group.id,nodeIds:all,edgeIds:group.memberIds.filter(id=>doc.edges.some(e=>e.id===id))};out.push(item);all.forEach(id=>byNode.set(id,item));
    }
    for(const id of nodeIds)if(!byNode.has(id)){const item={id, nodeIds:[id], edgeIds:[]};out.push(item);byNode.set(id,item);}
    out.forEach(item=>{item.nodes=item.nodeIds.map(id=>doc.nodes.find(n=>n.id===id));item.box=bounds(item.nodes);});return{units:out,byNode};
  }
  function chain(doc,units,byNode){
    const selected=new Set(byNode.keys()), pairs=new Map();
    for(const edge of doc.edges){
      if(!selected.has(edge.from.nodeId)||!selected.has(edge.to.nodeId))continue;
      const from=byNode.get(edge.from.nodeId),to=byNode.get(edge.to.nodeId);
      if(from===to){if(from.id===edge.from.nodeId)fail('循環する順路は自動配置できません。');continue;}
      if(edge.head!=='end')fail('両矢印・矢印なしの線を含む選択は自動配置できません。');
      const key=`${from.id}\u0000${to.id}`;if(!pairs.has(key))pairs.set(key,{from,to,edges:[]});pairs.get(key).edges.push(edge);
    }
    const incoming=new Map(units.map(unit=>[unit,0])),outgoing=new Map(units.map(unit=>[unit,0])),nextByUnit=new Map();
    for(const item of pairs.values()){
      incoming.set(item.to,incoming.get(item.to)+1);outgoing.set(item.from,outgoing.get(item.from)+1);
      if(incoming.get(item.to)>1||outgoing.get(item.from)>1)fail('分岐や合流を含む選択は自動配置できません。');
      nextByUnit.set(item.from,item);
    }
    const starts=units.filter(unit=>incoming.get(unit)===0);if(!starts.length)fail('循環する順路は自動配置できません。');if(starts.length!==1)fail('選択した図形が1本の順路につながっていません。');const start=starts[0];
    if(pairs.size!==units.length-1)fail('選択した図形が1本の順路につながっていません。');
    const result=[],seen=new Set();let current=start;
    while(current){
      if(seen.has(current))fail('循環する順路は自動配置できません。');
      seen.add(current);result.push(current);const next=nextByUnit.get(current);current=next?next.to:null;
    }
    if(result.length!==units.length){
      if(units.some(unit=>!seen.has(unit)&&incoming.get(unit)&&outgoing.get(unit)))fail('循環する順路は自動配置できません。');
      fail('選択した図形が1本の順路につながっていません。');
    }
    return{units:result,pairs};
  }
  function translate(edge,dx,dy){if(edge.bend){edge.bend.x+=dx;edge.bend.y+=dy;}edge.waypoints.forEach(point=>{point.x+=dx;point.y+=dy;});for(const end of ['from','to'])if(!edge[end].nodeId){edge[end].x+=dx;edge[end].y+=dy;}}
  function needsTranslation(edge){return Boolean(edge.bend||edge.waypoints.length||!edge.from.nodeId||!edge.to.nodeId);}
  function staysWithinUnit(edge,unit,byNode){return ['from','to'].every(end=>!edge[end].nodeId||byNode.get(edge[end].nodeId)===unit);}
  function plan(doc,ids,rawOptions){
    if(!Array.isArray(ids))fail('選択が不正です。');const source=Core.parseDocument(doc),setting=options(rawOptions),selected=new Set(Core.expandSelection(source,ids)),nodeIds=new Set(source.nodes.filter(node=>selected.has(node.id)).map(node=>node.id));
    if(nodeIds.size<2)fail('2つ以上の図形を選択してください。');
    const components=[...source.nodes,...source.edges,...source.lanes];if(components.some(item=>selected.has(item.id)&&item.locked))fail('固定された部品は自動配置できません。');
    const grouped=units(source,nodeIds),ordered=chain(source,grouped.units,grouped.byNode);if(ordered.units.length<2)fail('1つの部品だけでは自動配置できません。');
    const next=clone(source),nextNodes=new Map(next.nodes.map(node=>[node.id,node])),deltas=new Map(),first=ordered.units[0].box;let cursor=setting.direction==='vertical'?first.y:first.x;
    for(const unit of ordered.units){const box=unit.box, target=setting.direction==='vertical'?{x:first.cx-box.w/2,y:cursor}:{x:cursor,y:first.cy-box.h/2};const dx=target.x-box.x,dy=target.y-box.y;deltas.set(unit, {dx,dy});unit.nodeIds.forEach(id=>{nextNodes.get(id).x+=dx;nextNodes.get(id).y+=dy;});cursor+=(setting.direction==='vertical'?box.h:box.w)+setting.gap;}
    const connectorIds=new Set([...ordered.pairs.values()].flatMap(item=>item.edges.map(edge=>edge.id))),unitByEdge=new Map();
    for(const unit of ordered.units)for(const id of unit.edgeIds)unitByEdge.set(id,unit);
    const changedEdges=[];
    for(const edge of next.edges){const old=source.edges.find(item=>item.id===edge.id),from=grouped.byNode.get(old.from.nodeId),to=grouped.byNode.get(old.to.nodeId),same=from&&from===to?from:null,member=unitByEdge.get(edge.id);
      const groupedInternal=member&&staysWithinUnit(old,member,grouped.byNode)?member:null,moveWithUnit=same||groupedInternal;
      if(moveWithUnit&&needsTranslation(edge)){
        const delta=deltas.get(moveWithUnit);
        if(delta.dx||delta.dy){if(edge.locked)fail('固定された線の経路は変更できません。');translate(edge,delta.dx,delta.dy);changedEdges.push(edge.id);}
      }
      if(setting.route&&connectorIds.has(edge.id)){
        if(edge.locked)fail('固定された線の経路は変更できません。');
        edge.from={nodeId:old.from.nodeId,side:setting.direction==='vertical'?'bottom':'right',offset:.5};edge.to={nodeId:old.to.nodeId,side:setting.direction==='vertical'?'top':'left',offset:.5};edge.bend=null;edge.waypoints=[];if(!changedEdges.includes(edge.id))changedEdges.push(edge.id);
      }
    }
    for(const node of next.nodes)if(nodeIds.has(node.id)&&node.laneId){const lane=next.lanes.find(item=>item.id===node.laneId);if(!lane||node.x<lane.x||node.y<lane.y||node.x+node.w>lane.x+lane.w||node.y+node.h>lane.y+lane.h)fail('担当領域内に収まるようにしてから自動配置してください。');}
    const warnings=[];const moved=new Set(nodeIds);for(const node of next.nodes.filter(node=>moved.has(node.id)))for(const other of next.nodes.filter(node=>!moved.has(node.id)))if(overlap(node,other)){warnings.push('選択外の図形と重なる可能性があります。');break;}if(warnings.length)warnings.splice(1);
    const clean=Core.parseDocument(next);Core.assertEditable(source,clean);
    return{document:clean,nodeIds:ordered.units.flatMap(unit=>unit.nodeIds),edgeIds:changedEdges,unitCount:ordered.units.length,warnings};
  }
  return Object.freeze({plan});
});
