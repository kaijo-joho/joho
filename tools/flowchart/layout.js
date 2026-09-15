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
  const pairKey=(a,b)=>a.id+'\u0000'+b.id;
  function options(value={}){
    if(!record(value))fail('自動配置の設定が不正です。');
    const direction=value.direction===undefined?'vertical':value.direction,gap=value.gap===undefined?60:value.gap,route=value.route===undefined?true:value.route,mode=value.mode===undefined?'connected':value.mode,branchGap=value.branchGap===undefined?80:value.branchGap,flipBranches=value.flipBranches===undefined?false:value.flipBranches;
    if(!['vertical','horizontal'].includes(direction))fail('配置方向が不正です。');
    if(typeof gap!=='number'||!Number.isFinite(gap)||gap<0||gap>400)fail('間隔は0〜400で指定してください。');
    if(typeof branchGap!=='number'||!Number.isFinite(branchGap)||branchGap<20||branchGap>400)fail('分岐の間隔は20〜400で指定してください。');
    if(typeof route!=='boolean'||typeof flipBranches!=='boolean'||!['connected','lanes'].includes(mode))fail('自動配置の設定が不正です。');
    return{direction,gap,route,mode,branchGap,flipBranches};
  }
  function makeUnits(doc,nodeIds){
    const byNode=new Map(),items=[];
    for(const group of doc.groups||[]){
      const selected=group.memberIds.filter(id=>nodeIds.has(id));if(!selected.length)continue;
      const members=group.memberIds.filter(id=>doc.nodes.some(n=>n.id===id));
      if(!members.every(id=>nodeIds.has(id)))fail('グループはまとめて選択してください。');
      const item={id:group.id,nodeIds:members,edgeIds:group.memberIds.filter(id=>doc.edges.some(e=>e.id===id))};items.push(item);members.forEach(id=>byNode.set(id,item));
    }
    for(const id of nodeIds)if(!byNode.has(id)){const item={id,nodeIds:[id],edgeIds:[]};items.push(item);byNode.set(id,item);}
    items.forEach(item=>{item.nodes=item.nodeIds.map(id=>doc.nodes.find(n=>n.id===id));item.box=bounds(item.nodes);});
    return{items,byNode};
  }
  function graph(doc,items,byNode){
    const selected=new Set(byNode.keys()),pairs=new Map(),incoming=new Map(items.map(x=>[x,[]])),outgoing=new Map(items.map(x=>[x,[]]));
    for(const edge of doc.edges){
      if(!selected.has(edge.from.nodeId)||!selected.has(edge.to.nodeId))continue;
      const from=byNode.get(edge.from.nodeId),to=byNode.get(edge.to.nodeId);
      if(from===to){if(from.id===edge.from.nodeId)fail('自己ループの循環を含む選択は自動配置できません。');continue;}
      if(edge.head!=='end')fail('両矢印・矢印なしの線を含む選択は自動配置できません。');
      const key=pairKey(from,to);if(!pairs.has(key))pairs.set(key,{key,from,to,edges:[]});pairs.get(key).edges.push(edge);
    }
    for(const item of pairs.values()){outgoing.get(item.from).push(item);incoming.get(item.to).push(item);}
    return{pairs,incoming,outgoing};
  }
  const walkForward=(start,g,stop=new Set())=>{
    const units=[],pairs=[],seen=new Set();let current=start;
    while(current&&!stop.has(current)){
      if(seen.has(current))return null;seen.add(current);units.push(current);
      const next=g.outgoing.get(current);if(next.length===0)break;if(next.length!==1)return null;
      pairs.push(next[0]);current=next[0].to;
    }
    return{units,pairs,stop:current||null};
  };
  function backwards(unit,g){
    const units=[unit],pairs=[],seen=new Set([unit]);let current=unit;
    while(g.incoming.get(current).length){
      if(g.incoming.get(current).length!==1)return null;
      const previous=g.incoming.get(current)[0];current=previous.from;if(seen.has(current))return null;
      seen.add(current);pairs.unshift(previous);units.unshift(current);
    }
    return{units,pairs};
  }
  function validWhole(items,g,units,pairs){
    if(new Set(units).size!==items.length||units.length!==items.length)return false;
    const expected=new Set(pairs.map(pair=>pair.key));
    return expected.size===g.pairs.size&&[...g.pairs.keys()].every(key=>expected.has(key));
  }
  function sequence(items,g){
    if(g.pairs.size!==items.length-1)return null;
    if(items.some(item=>g.incoming.get(item).length>1||g.outgoing.get(item).length>1))return null;
    const starts=items.filter(item=>g.incoming.get(item).length===0);if(starts.length!==1)return null;
    const walked=walkForward(starts[0],g);if(!walked||!validWhole(items,g,walked.units,walked.pairs))return null;
    return{structure:'sequence',units:walked.units,pairs:walked.pairs};
  }
  function decisionUnit(unit){return unit.nodeIds.length===1&&unit.nodes[0].kind==='decision';}
  function branchStructure(items,g){
    for(const decision of items.filter(decisionUnit)){
      const exits=g.outgoing.get(decision);if(exits.length!==2||g.incoming.get(decision).length>1)continue;
      const a=walkForward(exits[0].to,g),b=walkForward(exits[1].to,g);if(!a||!b)continue;
      const merge=a.units.find(unit=>b.units.includes(unit));if(!merge||g.incoming.get(merge).length!==2||g.outgoing.get(merge).length>1)continue;
      const aIndex=a.units.indexOf(merge),bIndex=b.units.indexOf(merge),left=a.units.slice(0,aIndex),right=b.units.slice(0,bIndex);
      const aPairs=[exits[0],...a.pairs.slice(0,aIndex)],bPairs=[exits[1],...b.pairs.slice(0,bIndex)];
      if(aPairs.at(-1).to!==merge||bPairs.at(-1).to!==merge)continue;
      const pre=backwards(decision,g),post=walkForward(merge,g);if(!pre||!post)continue;
      const all=[...pre.units,...left,...right,merge,...post.units.slice(1)],pairs=[...pre.pairs,...aPairs,...bPairs,...post.pairs];
      if(!validWhole(items,g,all,pairs))continue;
      return{structure:'branch',decision,merge,pre:pre.units,post:post.units.slice(1),negative:left,positive:right,pairs,firstPairs:[exits[0],exits[1]],branchPairs:[aPairs,bPairs]};
    }
    return null;
  }
  function loopStructure(items,g){
    for(const decision of items.filter(decisionUnit)){
      const exits=g.outgoing.get(decision);if(exits.length!==2)continue;
      // A post-condition loop returns directly from the decision to the body
      // immediately before it: body -> decision -> body / exit.
      for(const returnPair of exits){
        const reentry=returnPair.to,forwardUnits=[],forwardPairs=[],seen=new Set();let current=reentry;
        while(current!==decision){
          if(seen.has(current)||g.outgoing.get(current).length!==1){current=null;break;}
          seen.add(current);forwardUnits.push(current);const next=g.outgoing.get(current)[0];forwardPairs.push(next);current=next.to;
        }
        if(current!==decision||!forwardUnits.length)continue;
        const backUnits=[reentry],backPairs=[],backSeen=new Set([reentry]);let backCurrent=reentry,valid=true;
        while(true){const previous=g.incoming.get(backCurrent).filter(pair=>pair!==returnPair);if(previous.length===0)break;if(previous.length!==1){valid=false;break;}const pair=previous[0];backCurrent=pair.from;if(backSeen.has(backCurrent)){valid=false;break;}backSeen.add(backCurrent);backPairs.unshift(pair);backUnits.unshift(backCurrent);}
        if(!valid)continue;
        const pre=[...backUnits,...forwardUnits.slice(1),decision],prePairs=[...backPairs,...forwardPairs],exit=exits.find(pair=>pair!==returnPair),post=walkForward(exit.to,g);if(!post)continue;
        const units=[...pre,...post.units],pairs=[...prePairs,returnPair,exit,...post.pairs];
        if(validWhole(items,g,units,pairs))return{structure:'loop',decision,pre,body:[],post:post.units,returnPair,exitPair:exit,pairs,reentry};
      }
      // A pre-condition loop can return to a node on the path immediately before
      // the decision (the built-in "分岐と反復" template has this shape).
      for(const bodyStart of exits){
        const cycleUnits=[],cyclePairs=[],seen=new Set();let current=bodyStart.to;
        while(current!==decision){
          if(seen.has(current)||g.outgoing.get(current).length!==1){current=null;break;}
          seen.add(current);cycleUnits.push(current);const next=g.outgoing.get(current)[0];cyclePairs.push(next);current=next.to;
        }
        if(current!==decision||!cycleUnits.length)continue;
        for(let index=0;index<cyclePairs.length;index++){
          const returnPair=cyclePairs[index],reentry=returnPair.to,backPairs=[],backUnits=[reentry];let backCurrent=reentry,valid=true,backSeen=new Set([reentry]);
          while(true){const previous=g.incoming.get(backCurrent).filter(pair=>pair!==returnPair);if(previous.length===0)break;if(previous.length!==1){valid=false;break;}const pair=previous[0];backCurrent=pair.from;if(backSeen.has(backCurrent)){valid=false;break;}backSeen.add(backCurrent);backPairs.unshift(pair);backUnits.unshift(backCurrent);}
          if(!valid)continue;
          const pre=reentry===decision?backUnits:[...backUnits,decision],prePairs=reentry===decision?backPairs:[...backPairs,...cyclePairs.slice(index+1)],body=cycleUnits.slice(0,index+1),bodyPairs=cyclePairs.slice(0,index),exit=exits.find(pair=>pair!==bodyStart),post=walkForward(exit.to,g);if(!post)continue;
          const units=[...pre,...body,...post.units],pairs=[...prePairs,bodyStart,...bodyPairs,returnPair,exit,...post.pairs];
          if(validWhole(items,g,units,pairs))return{structure:'loop',decision,pre,body,post:post.units,returnPair,exitPair:exit,pairs,reentry};
        }
      }
      const pre=backwards(decision,g);if(!pre)continue;const ancestors=new Set(pre.units);
      for(const bodyStart of exits){
        const body=[],bodyPairs=[],seen=new Set();let current=bodyStart.to,returnPair=null;
        if(!ancestors.has(current))while(true){
          if(seen.has(current)||ancestors.has(current)){returnPair=null;break;}
          seen.add(current);body.push(current);const next=g.outgoing.get(current);
          if(next.length!==1){returnPair=null;break;}
          bodyPairs.push(next[0]);if(ancestors.has(next[0].to)){returnPair=next[0];break;}
          current=next[0].to;
        }else returnPair=bodyStart;
        if(!returnPair)continue;
        const exit=exits.find(pair=>pair!==bodyStart);const post=walkForward(exit.to,g);if(!post)continue;
        const units=[...pre.units,...body,...post.units],pairs=[...pre.pairs,bodyStart,...bodyPairs,exit,...post.pairs];
        if(!validWhole(items,g,units,pairs))continue;
        return{structure:'loop',decision,pre:pre.units,body,post:post.units,returnPair,exitPair:exit,pairs,reentry:returnPair.to};
      }
    }
    return null;
  }
  function hasCycle(items,g){
    const visiting=new Set(),done=new Set();
    const visit=unit=>{if(visiting.has(unit))return true;if(done.has(unit))return false;visiting.add(unit);for(const pair of g.outgoing.get(unit))if(visit(pair.to))return true;visiting.delete(unit);done.add(unit);return false;};
    return items.some(visit);
  }
  function isConnected(items,g){
    if(!items.length)return true;const seen=new Set([items[0]]),pending=[items[0]];
    while(pending.length){const unit=pending.pop();for(const pair of [...g.outgoing.get(unit),...g.incoming.get(unit)]){const other=pair.from===unit?pair.to:pair.from;if(!seen.has(other)){seen.add(other);pending.push(other);}}}
    return seen.size===items.length;
  }
  function position(box,main,cross,direction){return direction==='vertical'?{x:cross-box.w/2,y:main}:{x:main,y:cross-box.h/2};}
  function extent(box,direction){return direction==='vertical'?box.h:box.w;}
  function breadth(box,direction){return direction==='vertical'?box.w:box.h;}
  function arrange(list,main,cross,setting,place){
    for(const unit of list){place(unit,position(unit.box,main,cross,setting.direction));main+=extent(unit.box,setting.direction)+setting.gap;}
    return main;
  }
  function pairLabel(pair){return (pair.edges[0]&&pair.edges[0].label&&pair.edges[0].label.text||'').trim().toLocaleLowerCase();}
  const negativeLabel=label=>/^(いいえ|no|n|false|×)$/.test(label);
  const positiveLabel=label=>/^(はい|yes|y|true|○)$/.test(label);
  function loopReturnNegative(model,setting){
    let result=true,exitLabel=pairLabel(model.exitPair),returnLabel=pairLabel(model.returnPair);
    if(negativeLabel(exitLabel))result=false;
    else if(negativeLabel(returnLabel))result=true;
    else if(positiveLabel(exitLabel))result=true;
    else if(positiveLabel(returnLabel))result=false;
    else {
      const negativeSide=setting.direction==='vertical'?'left':'top',positiveSide=setting.direction==='vertical'?'right':'bottom',exitSide=model.exitPair.edges[0].from.side,returnSide=model.returnPair.edges[0].from.side;
      if(exitSide===negativeSide)result=false;else if(exitSide===positiveSide)result=true;else if(returnSide===negativeSide)result=true;else if(returnSide===positiveSide)result=false;
    }
    return setting.flipBranches?!result:result;
  }
  function arrangeBranch(model,setting,place){
    const first=model.pre[0].box,baseMain=setting.direction==='vertical'?first.y:first.x,baseCross=setting.direction==='vertical'?first.cx:first.cy;
    let cursor=arrange(model.pre,baseMain,baseCross,setting,place),decision=model.decision;
    let negative={pair:model.firstPairs[0],list:model.negative,pairs:model.branchPairs[0]},positive={pair:model.firstPairs[1],list:model.positive,pairs:model.branchPairs[1]};
    const negativeIsKnown=negativeLabel(pairLabel(negative.pair));
    if(positiveLabel(pairLabel(negative.pair))||negativeLabel(pairLabel(positive.pair))){[negative,positive]=[positive,negative];}
    else if(!negativeIsKnown&&!positiveLabel(pairLabel(positive.pair))){
      const cross=unit=>setting.direction==='vertical'?unit.box.cx:unit.box.cy;
      const a=negative.list[0]||model.merge,b=positive.list[0]||model.merge;
      if(cross(a)>cross(b)||(cross(a)===cross(b)&&a.id>b.id))[negative,positive]=[positive,negative];
    }
    if(setting.flipBranches)[negative,positive]=[positive,negative];
    const negativeBreadth=Math.max(0,...negative.list.map(unit=>breadth(unit.box,setting.direction))),positiveBreadth=Math.max(0,...positive.list.map(unit=>breadth(unit.box,setting.direction)));
    const negCross=baseCross-(negativeBreadth/2+setting.branchGap/2),posCross=baseCross+(positiveBreadth/2+setting.branchGap/2);
    const branchMain=cursor,negEnd=arrange(negative.list,branchMain,negCross,setting,place),posEnd=arrange(positive.list,branchMain,posCross,setting,place);
    cursor=Math.max(branchMain,negEnd,posEnd);place(model.merge,position(model.merge.box,cursor,baseCross,setting.direction));cursor+=extent(model.merge.box,setting.direction)+setting.gap;
    arrange(model.post,cursor,baseCross,setting,place);
    const side=setting.direction==='vertical'?{negative:'left',positive:'right',target:'top'}:{negative:'top',positive:'bottom',target:'left'},routes=new Map([[negative.pair.key,{from:side.negative,to:side.target}],[positive.pair.key,{from:side.positive,to:side.target}]]);
    if(model.merge.nodeIds.length===1&&['junction','merge'].includes(model.merge.nodes[0].kind)){routes.set(negative.pairs.at(-1).key,{...(routes.get(negative.pairs.at(-1).key)||{}),to:side.negative});routes.set(positive.pairs.at(-1).key,{...(routes.get(positive.pairs.at(-1).key)||{}),to:side.positive});}
    return{branchRoutes:routes};
  }
  function arrangeLoop(model,setting,place){
    const first=model.pre[0].box,baseMain=setting.direction==='vertical'?first.y:first.x,baseCross=setting.direction==='vertical'?first.cx:first.cy;
    let cursor=arrange(model.pre,baseMain,baseCross,setting,place);const bodyStart=cursor;
    arrange(model.body,bodyStart,baseCross,setting,place);const returnNegative=loopReturnNegative(model,setting),bodyBreadth=Math.max(0,...model.body.map(unit=>breadth(unit.box,setting.direction))),postBreadth=Math.max(0,...model.post.map(unit=>breadth(unit.box,setting.direction))),offset=Math.max(setting.branchGap,(bodyBreadth+postBreadth)/2+setting.branchGap),exitCross=baseCross+(returnNegative?offset:-offset);
    arrange(model.post,bodyStart,exitCross,setting,place);
    return{loopPair:model.returnPair,loopExitPair:model.exitPair,loopOuterSide:returnNegative?'left':'right'};
  }
  function laneStructure(source,items,setting,place){
    const lanes=new Map(source.lanes.map(lane=>[lane.id,lane])),byLane=new Map();
    for(const unit of items){
      const laneIds=new Set(unit.nodes.map(node=>node.laneId));if(laneIds.size!==1)fail('複数の担当領域にまたがるグループは、グループを解除してから整列してください。');if(!laneIds.values().next().value)fail('担当領域内の図形だけを選択してください。');
      const lane=lanes.get(laneIds.values().next().value);if(!lane)fail('担当領域が見つかりません。');
      if(unit.box.w>lane.w||unit.box.h>lane.h)fail('担当領域内に収まるようにしてから自動配置してください。');
      if(!byLane.has(lane.id))byLane.set(lane.id,[]);byLane.get(lane.id).push(unit);
    }
    for(const [laneId,list] of byLane){
      const lane=lanes.get(laneId);list.sort((a,b)=>a.box.y-b.box.y||a.box.x-b.box.x||a.id.localeCompare(b.id));
      let y=Math.max(lane.y+48,list[0].box.y);
      for(const unit of list){place(unit,{x:lane.x+(lane.w-unit.box.w)/2,y});y+=unit.box.h+setting.gap;}
    }
    return{structure:'lanes',pairs:[]};
  }
  function translate(edge,dx,dy){if(edge.bend){edge.bend.x+=dx;edge.bend.y+=dy;}edge.waypoints.forEach(point=>{point.x+=dx;point.y+=dy;});for(const end of ['from','to'])if(!edge[end].nodeId){edge[end].x+=dx;edge[end].y+=dy;}}
  const needsTranslation=edge=>Boolean(edge.bend||edge.waypoints.length||!edge.from.nodeId||!edge.to.nodeId);
  const staysWithinUnit=(edge,unit,byNode)=>['from','to'].every(end=>!edge[end].nodeId||byNode.get(edge[end].nodeId)===unit);
  function plan(doc,ids,rawOptions){
    if(!Array.isArray(ids))fail('選択が不正です。');
    const source=Core.parseDocument(doc),setting=options(rawOptions),selected=new Set(Core.expandSelection(source,ids)),nodeIds=new Set(source.nodes.filter(node=>selected.has(node.id)).map(node=>node.id));
    if(nodeIds.size<2)fail('2つ以上の図形を選択してください。');
    if(setting.mode==='lanes'&&source.diagramType!=='activity')fail('担当領域ごとの整列はアクティビティ図で使えます。');
    const components=[...source.nodes,...source.edges,...source.lanes];if(components.some(item=>selected.has(item.id)&&item.locked))fail('固定された部品は自動配置できません。');
    const grouped=makeUnits(source,nodeIds);if(setting.mode!=='lanes'&&grouped.items.length<2)fail('1つの部品だけでは自動配置できません。');
    const next=clone(source),nextNodes=new Map(next.nodes.map(node=>[node.id,node])),deltas=new Map();
    const place=(unit,target)=>{const dx=target.x-unit.box.x,dy=target.y-unit.box.y;deltas.set(unit,{dx,dy});unit.nodeIds.forEach(id=>{nextNodes.get(id).x+=dx;nextNodes.get(id).y+=dy;});};
    let model,routes={};
    if(setting.mode==='lanes'){model=laneStructure(source,grouped.items,setting,place);if(grouped.items.length<2)fail('1つの部品だけでは自動配置できません。');}
    else{
      const g=graph(source,grouped.items,grouped.byNode),simple=sequence(grouped.items,g),loop=simple?null:loopStructure(grouped.items,g),branch=simple||loop?null:branchStructure(grouped.items,g);
      model=simple||loop||branch;if(!model)fail(hasCycle(grouped.items,g)?'循環する順路または複雑な反復は自動配置できません。':!isConnected(grouped.items,g)?'選択した図形が1本の順路につながっていません。':'入れ子または複雑な分岐・反復は自動配置できません。');
      if(model.structure==='sequence'){const first=model.units[0].box;arrange(model.units,setting.direction==='vertical'?first.y:first.x,setting.direction==='vertical'?first.cx:first.cy,setting,place);}
      else if(model.structure==='branch')routes=arrangeBranch(model,setting,place);
      else routes=arrangeLoop(model,setting,place);
    }
    const connectorIds=new Set((model.pairs||[]).flatMap(pair=>pair.edges.map(edge=>edge.id))),laneRouteIds=new Set(),routeCandidateIds=new Set(connectorIds),unitByEdge=new Map(),changed=new Set();
    for(const unit of grouped.items)for(const id of unit.edgeIds)unitByEdge.set(id,unit);
    if(setting.mode==='lanes'&&setting.route)for(const edge of source.edges){
      const from=grouped.byNode.get(edge.from.nodeId),to=grouped.byNode.get(edge.to.nodeId),fromNode=source.nodes.find(node=>node.id===edge.from.nodeId),toNode=source.nodes.find(node=>node.id===edge.to.nodeId);
      if(!from||!to||from===to||!fromNode||!toNode||fromNode.laneId!==toNode.laneId)continue;
      routeCandidateIds.add(edge.id);
      if(edge.kind==='orthogonal'&&!edge.bend&&!edge.waypoints.length)laneRouteIds.add(edge.id);
    }
    for(const edge of next.edges){
      const old=source.edges.find(item=>item.id===edge.id),from=grouped.byNode.get(old.from.nodeId),to=grouped.byNode.get(old.to.nodeId),same=from&&from===to?from:null,member=unitByEdge.get(edge.id);
      const moving=same||member&&staysWithinUnit(old,member,grouped.byNode)?(same||member):null;
      if(moving&&needsTranslation(edge)){const delta=deltas.get(moving)||{dx:0,dy:0};if(delta.dx||delta.dy){if(edge.locked)fail('固定された線の経路は変更できません。');translate(edge,delta.dx,delta.dy);changed.add(edge.id);}}
      if(setting.route&&(connectorIds.has(edge.id)||laneRouteIds.has(edge.id))&&edge.kind==='orthogonal'){
        if(edge.locked)fail('固定された線の経路は変更できません。');
        const pair=[...model.pairs].find(item=>item.edges.some(item=>item.id===edge.id)),override=pair&&routes.branchRoutes&&routes.branchRoutes.get(pair.key);
        let fromSide=(override&&override.from)||(setting.direction==='vertical'?'bottom':'right'),toSide=(override&&override.to)||(setting.direction==='vertical'?'top':'left'),waypoints=[];
        if(laneRouteIds.has(edge.id)){
          const fromNode=nextNodes.get(old.from.nodeId),toNode=nextNodes.get(old.to.nodeId),down=fromNode.y+fromNode.h/2<=toNode.y+toNode.h/2;
          fromSide=down?'bottom':'top';toSide=down?'top':'bottom';
        }
        if(routes.loopPair&&pair&&pair.key===routes.loopPair.key){
          const movedBoxes=grouped.items.map(unit=>bounds(unit.nodeIds.map(id=>nextNodes.get(id))));
          const outerRight=routes.loopOuterSide==='right',outer=setting.direction==='vertical'?(outerRight?Math.max(...movedBoxes.map(box=>box.x+box.w))+setting.branchGap:Math.min(...movedBoxes.map(box=>box.x))-setting.branchGap):(outerRight?Math.max(...movedBoxes.map(box=>box.y+box.h))+setting.branchGap:Math.min(...movedBoxes.map(box=>box.y))-setting.branchGap);
          fromSide=setting.direction==='vertical'?(outerRight?'right':'left'):(outerRight?'bottom':'top');toSide=fromSide;
          const a=nextNodes.get(old.from.nodeId),b=nextNodes.get(old.to.nodeId);
          waypoints=setting.direction==='vertical'?[{x:outer,y:a.y+a.h/2},{x:outer,y:b.y+b.h/2}]:[{x:a.x+a.w/2,y:outer},{x:b.x+b.w/2,y:outer}];
        }
        if(routes.loopExitPair&&pair&&pair.key===routes.loopExitPair.key){
          const exitRight=routes.loopOuterSide==='left';
          fromSide=setting.direction==='vertical'?(exitRight?'right':'left'):(exitRight?'bottom':'top');
          toSide=setting.direction==='vertical'?'top':'left';
        }
        edge.from={nodeId:old.from.nodeId,side:fromSide,offset:.5};edge.to={nodeId:old.to.nodeId,side:toSide,offset:.5};edge.bend=null;edge.waypoints=waypoints;changed.add(edge.id);
      }
    }
    for(const node of next.nodes)if(nodeIds.has(node.id)&&node.laneId){const lane=next.lanes.find(item=>item.id===node.laneId);if(!lane||node.x<lane.x||node.y<lane.y||node.x+node.w>lane.x+lane.w||node.y+node.h>lane.y+lane.h)fail('担当領域内に収まるようにしてから自動配置してください。');}
    const warnings=[];if(setting.route&&source.edges.some(edge=>routeCandidateIds.has(edge.id)&&(edge.kind==='straight'||edge.kind==='curve')))warnings.push('直線・曲線の矢印は経路を保持しました。');for(const node of next.nodes.filter(node=>nodeIds.has(node.id)))if(next.nodes.some(other=>!nodeIds.has(other.id)&&overlap(node,other))){warnings.push('選択外の図形と重なる可能性があります。');break;}
    const clean=Core.parseDocument(next);Core.assertEditable(source,clean);
    const resultUnits=model.structure==='sequence'?model.units:grouped.items;
    return{document:clean,nodeIds:resultUnits.flatMap(unit=>unit.nodeIds),edgeIds:source.edges.filter(edge=>changed.has(edge.id)).map(edge=>edge.id),unitCount:grouped.items.length,warnings,structure:model.structure};
  }
  return Object.freeze({plan});
});
