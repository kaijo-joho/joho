/* 作図の座標をピクセルまたは指定間隔へそろえる。作品自体は変更しない。 */
(function(root){
  'use strict';
  function step(settings,event){
    if(event?.altKey)return 0;
    const interval=Number(settings.gridStep);
    return settings.snap&&Number.isFinite(interval)&&interval>0?interval:settings.snapPixel?1:0;
  }
  const round=(value,interval)=>interval?Math.round(value/interval)*interval:value;
  const matches=(value,interval)=>!interval||Math.abs(value-round(value,interval))<=1e-7*Math.max(1,interval);
  function point(value,settings,event){const interval=step(settings,event);return {x:round(value.x,interval),y:round(value.y,interval)};}
  function moveDelta(box,delta,settings,event){
    const target=point({x:box.x+delta.x,y:box.y+delta.y},settings,event);
    return {x:target.x-box.x,y:target.y-box.y};
  }
  function nudgeDelta(origin,delta,settings,event){
    const interval=step(settings,event);
    return {x:delta.x?round(origin.x+delta.x,interval)-origin.x:0,y:delta.y?round(origin.y+delta.y,interval)-origin.y:0};
  }
  function resize(original,proposed,edges,settings,event){
    const interval=step(settings,event),box={...proposed};if(!interval)return box;
    const size={x:'width',y:'height'},end=(b,axis)=>b[axis]+b[size[axis]];
    const snappedEdge=(axis,edge,anchor)=>{
      const target=round(edge==='start'?proposed[axis]:end(proposed,axis),interval),minimum=original[size[axis]]*.01;
      if((edge==='start'?anchor-target:target-anchor)>=minimum)return target;
      return edge==='start'?Math.floor((anchor-minimum)/interval)*interval:Math.ceil((anchor+minimum)/interval)*interval;
    };
    if(edges.uniform){
      const axis=edges.x?'x':edges.y?'y':null;if(!axis)return box;
      const other=axis==='x'?'y':'x',edge=edges[axis],anchor=edge==='start'?end(original,axis):original[axis];
      const target=snappedEdge(axis,edge,anchor);
      const extent=edge==='start'?anchor-target:target-anchor,ratio=extent/original[size[axis]];
      if(!Number.isFinite(ratio)||ratio<.01)return box;
      for(const key of [axis,other]){
        box[size[key]]=original[size[key]]*ratio;
        box[key]=edges[key]==='start'?end(original,key)-box[size[key]]:edges[key]==='end'?original[key]:original[key]+(original[size[key]]-box[size[key]])/2;
      }
    }else for(const axis of ['x','y']){
      const edge=edges[axis];if(!edge)continue;
      const anchor=edge==='start'?end(original,axis):original[axis],target=snappedEdge(axis,edge,anchor);
      const extent=edge==='start'?anchor-target:target-anchor;
      if(extent<original[size[axis]]*.01)continue;
      box[axis]=edge==='start'?target:anchor;box[size[axis]]=extent;
    }
    return box;
  }
  const api=Object.freeze({step,round,matches,point,moveDelta,nudgeDelta,resize});
  root.IlapoGrid=api;if(typeof module==='object'&&module.exports)module.exports=api;
}(globalThis));
