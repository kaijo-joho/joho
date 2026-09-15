(function(root,factory){
  const common=typeof module==='object'&&module.exports;
  const api=factory(common?require('./core.js'):root.DiagramCore,common?require('./render.js'):root.DiagramRender);
  if(common)module.exports=api;else root.DiagramTransitions=api;
})(typeof globalThis!=='undefined'?globalThis:this,function(C,R){
  'use strict';
  const fail=message=>{throw new Error(message);};
  const center=n=>({x:n.x+n.w/2,y:n.y+n.h/2});
  const pairKey=e=>[e.from.nodeId,e.to.nodeId].sort().join('|');
  function number(value,fallback,min,max){const v=value===undefined?fallback:value;if(typeof v!=='number'||!Number.isFinite(v)||v<min||v>max)fail('調整する数値が範囲外です。');return v;}
  function plan(input,ids,options={}) {
    const source=C.parseDocument(input);
    if(source.diagramType!=='state')fail('状態遷移図で使える操作です。');
    if(!Array.isArray(ids)||!options||typeof options!=='object'||Array.isArray(options))fail('遷移の選択・設定が不正です。');
    const mode=options.mode===undefined?'spacing':options.mode,related=options.related===undefined?true:options.related;
    if(!['spacing','loop','label','reset-label'].includes(mode)||typeof related!=='boolean')fail('遷移の調整方法が不正です。');
    const spacing=number(options.spacing,48,20,240),distance=number(options.distance,80,28,600),side=options.side===undefined?'right':options.side;
    const t=number(options.t,.5,0,1),dx=number(options.dx,0,-1000,1000),dy=number(options.dy,-12,-1000,1000);
    if(!['top','right','bottom','left'].includes(side))fail('自己ループの向きが不正です。');
    const expanded=new Set(C.expandSelection(source,ids)),nodes=new Map(source.nodes.map(n=>[n.id,n]));
    const valid=source.edges.filter(e=>nodes.get(e.from.nodeId)?.kind==='state'&&nodes.get(e.to.nodeId)?.kind==='state');
    const chosen=valid.filter(e=>expanded.has(e.id));if(!chosen.length)fail('状態どうしをつなぐ矢印を選択してください。');
    const keys=new Set(chosen.map(pairKey)),targets=related?valid.filter(e=>keys.has(pairKey(e))):chosen;
    const next=C.clone(source),byId=new Map(next.edges.map(e=>[e.id,e])),changed=new Set(),warnings=[];
    const mark=e=>{if(e.locked)fail('固定された矢印が含まれています。固定を解除するか、対象を絞ってください。');changed.add(e.id);return byId.get(e.id);};
    if(mode==='spacing') {
      const groups=new Map();for(const e of targets){if(e.from.nodeId===e.to.nodeId)continue;const key=pairKey(e);if(!groups.has(key))groups.set(key,[]);groups.get(key).push(e);}
      for(const [key,edges] of groups){
        if(edges.length<2)continue;
        const [first,last]=key.split('|').map(id=>center(nodes.get(id))),vx=last.x-first.x,vy=last.y-first.y,length=Math.hypot(vx,vy);
        if(length<1)fail('同じ位置にある状態を離してから、矢印の間隔を調整してください。');
        const mid={x:(first.x+last.x)/2,y:(first.y+last.y)/2},normal={x:-vy/length,y:vx/length};
        const offset=e=>{const p=R.edgeGeometry(source,e).handle;return(p.x-mid.x)*normal.x+(p.y-mid.y)*normal.y;};
        edges.sort((a,b)=>offset(a)-offset(b)||a.id.localeCompare(b.id));
        edges.forEach((old,i)=>{const e=mark(old),shift=(i-(edges.length-1)/2)*spacing;e.kind='curve';e.waypoints=[];e.bend={x:mid.x+normal.x*shift,y:mid.y+normal.y*shift};e.from={nodeId:old.from.nodeId,side:'auto',offset:.5};e.to={nodeId:old.to.nodeId,side:'auto',offset:.5};});
      }
      if(!changed.size)fail('同じ2つの状態を結ぶ矢印を2本以上、対象に含めてください。');
      if(targets.some(e=>!changed.has(e.id)))warnings.push('1本だけの遷移と自己ループは保持します。');
    } else if(mode==='loop') {
      const loops=targets.filter(e=>e.from.nodeId===e.to.nodeId).sort((a,b)=>a.id.localeCompare(b.id)),counts=new Map();
      if(!loops.length)fail('同じ状態へ戻る矢印を選択してください。');
      for(const old of loops){
        if(old.kind==='straight')fail('自己ループの形を直角か曲線に変更してください。');
        const e=mark(old),n=nodes.get(old.from.nodeId),index=counts.get(n.id)||0;counts.set(n.id,index+1);
        e.from={nodeId:n.id,side,offset:.28};e.to={nodeId:n.id,side,offset:.72};e.waypoints=[];
        const p=center(n),radius=distance+index*spacing;
        e.bend=side==='left'?{x:n.x-radius,y:p.y}:side==='right'?{x:n.x+n.w+radius,y:p.y}:side==='top'?{x:p.x,y:n.y-radius}:{x:p.x,y:n.y+n.h+radius};
      }
      if(targets.some(e=>!changed.has(e.id)))warnings.push('別の状態へ向かう矢印は保持します。');
    } else {
      for(const old of targets){const e=mark(old);e.label={...e.label,...(mode==='reset-label'?{t:.5,dx:0,dy:-12}:{t,dx,dy})};}
    }
    const document=C.parseDocument(next);C.assertEditable(source,document);
    return{document,edgeIds:[...changed],warnings};
  }
  return Object.freeze({plan});
});
