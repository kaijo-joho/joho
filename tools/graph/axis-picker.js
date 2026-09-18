/* Plotlyの2D軸を単クリックで選択する。ドラッグ・点や曲線の操作は優先する。 */
(function (root) {
  'use strict';
  function decorate(element){
    for(const el of element.querySelectorAll('.annotation')){
      const annotation=element.layout?.annotations?.[Number(el.dataset.index)],key=annotation?.name?.match(/^__graph_axis_(?:tick_)?([xy])(?:_|$)/)?.[1];
      el.classList.toggle('axis-pickable',!!key);
    }
  }
  function axisAt(element,event,{main=false}={}) {
    const layout=element?._fullLayout;if(!layout||layout.scene)return null;
    const target=event.target;
    if(target?.closest?.('.legend,.modebar,.hoverlayer'))return null;
    for(let el=target;el&&el!==element;el=el.parentElement){
      const classes=el.getAttribute?.('class')||'';
      const match=classes.match(/(?:^|\s)(?:g-)?([xy])\d*(?:tick|title)(?:\s|$)/);if(match)return match[1];
      if(el.matches?.('.annotation')){
        const annotation=element.layout?.annotations?.[Number(el.dataset.index)];
        const named=annotation?.name?.match(/^__graph_axis_(?:tick_)?([xy])(?:_|$)/);return named?.[1]||null;
      }
    }
    const rect=element.getBoundingClientRect(),x=event.clientX-rect.left,y=event.clientY-rect.top,xa=layout.xaxis,ya=layout.yaxis;
    if(!xa||!ya||xa.visible===false||ya.visible===false)return null;
    const candidates=[];
    const add=(key,distance,within)=>{if(within&&distance<=6)candidates.push([key,distance]);};
    const inX=x>=xa._offset-6&&x<=xa._offset+xa._length+6,inY=y>=ya._offset-6&&y<=ya._offset+ya._length+6;
    if(xa.showline)add('x',Math.abs(y-(xa.side==='top'?ya._offset:ya._offset+ya._length)),inX);
    if(ya.showline)add('y',Math.abs(x-(ya.side==='right'?xa._offset+xa._length:xa._offset)),inY);
    if(main&&xa.zeroline&&xa.type==='linear'){const at=xa._offset+xa.d2p(0);if(at>=xa._offset&&at<=xa._offset+xa._length)add('y',Math.abs(x-at),inY);}
    if(main&&ya.zeroline&&ya.type==='linear'){const at=ya._offset+ya.d2p(0);if(at>=ya._offset&&at<=ya._offset+ya._length)add('x',Math.abs(y-at),inX);}
    if(!candidates.length)return null;
    if(main){const object=root.GraphPlot.pickObject(element,event);if(object&&!['region','curveRegion'].includes(object.kind))return null;}
    candidates.sort((a,b)=>a[1]-b[1]);return candidates[0][0];
  }
  function bind(stage,{plots,onSelect,isBusy=()=>false,context=()=>null}){
    const doc=stage.ownerDocument;let down=null;const pointers=new Set();
    stage.addEventListener('pointerdown',event=>{
      pointers.add(event.pointerId);if(pointers.size>1){down=null;return;}
      if(event.button!==0||isBusy())return;
      const plot=plots().find(item=>item.element?.contains(event.target));if(!plot)return;
      const key=axisAt(plot.element,event,{main:plot.viewId==='main'});if(!key)return;
      down={key,viewId:plot.viewId,pointerId:event.pointerId,x:event.clientX,y:event.clientY,context:context()};
    },true);
    doc.addEventListener('pointermove',event=>{if(down?.pointerId===event.pointerId&&Math.hypot(event.clientX-down.x,event.clientY-down.y)>5)down=null;},true);
    doc.addEventListener('pointerup',event=>{
      pointers.delete(event.pointerId);
      const candidate=down;if(candidate?.pointerId===event.pointerId)setTimeout(()=>{if(down===candidate)down=null;},0);
    },true);
    doc.addEventListener('pointerup',event=>{
      const candidate=down;if(!candidate||event.pointerId!==candidate.pointerId)return;down=null;
      if(Math.hypot(event.clientX-candidate.x,event.clientY-candidate.y)>5)return;
      // Plotlyが捕捉中に予約する空白クリック処理の後で選択する。
      setTimeout(()=>{if(candidate.context===context()&&!isBusy())onSelect(candidate.key,candidate.viewId);},0);
    });
    doc.addEventListener('pointercancel',event=>{pointers.delete(event.pointerId);down=null;},true);
    root.addEventListener('blur',()=>{pointers.clear();down=null;});
  }
  root.GraphAxisPicker=Object.freeze({axisAt,bind,decorate});
}(typeof globalThis!=='undefined'?globalThis:this));
