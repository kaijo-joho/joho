/* Pure geometric snapping for the OMR editor. No document or DOM access. */
(function(root){
 'use strict';
 var EPS=1e-7;
 function finite(n){return typeof n==='number'&&Number.isFinite(n);}
 function rect(value){return value&&finite(value.x)&&finite(value.y)&&finite(value.width)&&finite(value.height)&&value.width>=0&&value.height>=0?{x:value.x,y:value.y,width:value.width,height:value.height}:null;}
 function bounds(value){return value&&finite(value.left)&&finite(value.top)&&finite(value.right)&&finite(value.bottom)&&value.right>=value.left&&value.bottom>=value.top?{left:value.left,top:value.top,right:value.right,bottom:value.bottom}:null;}
 function center(r){return r.x+r.width/2;}
 function middle(r){return r.y+r.height/2;}
 function overlap(a0,a1,b0,b1){return Math.min(a1,b1)-Math.max(a0,b0)>EPS;}
 function intersects(a,b){return overlap(a.x,a.x+a.width,b.x,b.x+b.width)&&overlap(a.y,a.y+a.height,b.y,b.y+b.height);}
 function inside(r,b){return r.x>=b.left-EPS&&r.y>=b.top-EPS&&r.x+r.width<=b.right+EPS&&r.y+r.height<=b.bottom+EPS;}
 function clampFallback(frame,original){return rect(frame)||rect(original)||{x:0,y:0,width:0,height:0};}
 function propose(frame,original,otherRects,boundsValue,options){
  options=options||{};var f=rect(frame),o=rect(original),b=bounds(boundsValue);
  if(!f||!o)return{rect:clampFallback(frame,original),guides:[]};
  if(options.enabled===false)return{rect:f,guides:[]};
  var mode=options.mode==='resize'?'resize':'move',edge=typeof options.edge==='string'?options.edge.toLowerCase():'se';
  var threshold=finite(options.thresholdMM)&&options.thresholdMM>=0?options.thresholdMM:0;
  var others=Array.isArray(otherRects)?otherRects.map(rect).filter(Boolean):[];
  if(!b||!threshold||mode==='resize'&&(!/^(n|s|e|w|ne|nw|se|sw)$/.test(edge)))return{rect:f,guides:[]};
  var axes=[];
  function add(axis,pos,kind,source,target,from,to,distance,guideValue){
   var current=axis==='x'?f.x:f.y;if(mode==='resize'){
    var low=edge.indexOf(axis==='x'?'w':'n')>=0,high=edge.indexOf(axis==='x'?'e':'s')>=0;
    if(high)current+=axis==='x'?f.width:f.height;else if(!low)return;
   }
   if(!finite(pos)||Math.abs(pos-current)>threshold+EPS)return;
   var list=axis==='x'?axes[0]:axes[1];if(!list)list=axis==='x'?(axes[0]=[]):(axes[1]=[]);
   list.push({pos:pos,kind:kind,source:source,target:target,value:finite(guideValue)?guideValue:pos,from:from,to:to,distance:distance||0,order:list.length});
  }
  function alignCandidates(axis,feature,targets,source){
   var dimension=axis==='x'?'width':'height',posKey=axis==='x'?'x':'y',offset=feature==='start'?0:feature==='center'?f[dimension]/2:f[dimension];
   targets.forEach(function(t){add(axis,t.value-offset,'align',source,t.name,t.from,t.to,0,t.value);});
  }
  function axisFeatures(axis,r){var p=axis==='x'?r.x:r.y,len=axis==='x'?r.width:r.height;return[{name:'start',value:p},{name:'center',value:p+len/2},{name:'end',value:p+len}];}
  function targetLine(axis,value,source,name,r){return{value:value,name:name,from:axis==='x'?Math.min(b.top,r?r.y:b.top):Math.min(b.left,r?r.x:b.left),to:axis==='x'?Math.max(b.bottom,r?r.y+r.height:b.bottom):Math.max(b.right,r?r.x+r.width:b.right),source:source};}
  ['x','y'].forEach(function(axis){
   var axisBounds=axis==='x'?{lo:b.left,mid:(b.left+b.right)/2,hi:b.right}:{lo:b.top,mid:(b.top+b.bottom)/2,hi:b.bottom};
   var initial=axis==='x'?f.x:f.y,dim=axis==='x'?'width':'height';
   if(mode==='move'){
    var bodyTargets=[targetLine(axis,axisBounds.lo,'paper','本文範囲の先頭'),targetLine(axis,axisBounds.mid,'paper','本文範囲の中央'),targetLine(axis,axisBounds.hi,'paper','本文範囲の末尾')];
    ['start','center','end'].forEach(function(feature){alignCandidates(axis,feature,bodyTargets,'paper');});
    others.forEach(function(r,index){var targets=axisFeatures(axis,r).map(function(tf){return targetLine(axis,tf.value,'element','部品'+(index+1)+' '+tf.name,r);});['start','center','end'].forEach(function(feature){alignCandidates(axis,feature,targets,'element');});});
    // Four millimetre edge-to-edge spacing is available only when the
    // projected spans overlap, which makes it a neighbouring-element guide.
    others.forEach(function(r,index){
     var projected=axis==='x'?overlap(f.y,f.y+f.height,r.y,r.y+r.height):overlap(f.x,f.x+f.width,r.x,r.x+r.width);if(!projected)return;
     var otherStart=axis==='x'?r.x:r.y,otherEnd=otherStart+r[dim],ownEnd=initial+f[dim];
     [[otherStart-4-f[dim],otherStart-4,'部品'+(index+1)+'の4mm手前'],[otherEnd+4,otherEnd+4,'部品'+(index+1)+'の4mm先']].forEach(function(pair){var p=pair[0];add(axis,p,'gap','element',pair[2],axis==='x'?Math.min(f.y,r.y):Math.min(f.x,r.x),axis==='x'?Math.max(f.y+f.height,r.y+r.height):Math.max(f.x+f.width,r.x+r.width),4,pair[1]);});
    });
   }else{
    var lowEdge=axis==='x'?'w':'n',highEdge=axis==='x'?'e':'s',low=edge.indexOf(lowEdge)>=0,high=edge.indexOf(highEdge)>=0;if(!low&&!high)return;
    var anchor=low?(axis==='x'?o.x+o.width:o.y+o.height):(axis==='x'?o.x:o.y),edgePosition=high?initial+f[dim]:initial;
    function fromEdge(target){var size=high?target-anchor:anchor-target;return{position:high?anchor:target,size:size};}
    var paperValues=[axisBounds.lo,axisBounds.mid,axisBounds.hi];
    paperValues.forEach(function(v){var c=fromEdge(v);if(c.size>0)add(axis,v,'align','paper','本文範囲',axis==='x'?b.top:b.left,axis==='x'?b.bottom:b.right,0);});
    others.forEach(function(r,index){
     axisFeatures(axis,r).forEach(function(tf){var c=fromEdge(tf.value);if(c.size>0)add(axis,tf.value,'align','element','部品'+(index+1)+' '+tf.name,axis==='x'?Math.min(r.y,b.top):Math.min(r.x,b.left),axis==='x'?Math.max(r.y+r.height,b.bottom):Math.max(r.x+r.width,b.right),0);});
     var otherSize=r[dim],sizePos=high?anchor+otherSize:anchor-otherSize;if(otherSize>0)add(axis,sizePos,'size','element','部品'+(index+1)+' と同じ'+(axis==='x'?'幅':'高さ'),axis==='x'?Math.min(r.y,b.top):Math.min(r.x,b.left),axis==='x'?Math.max(r.y+r.height,b.bottom):Math.max(r.x+r.width,b.right),0);
     var projected=axis==='x'?overlap(f.y,f.y+f.height,r.y,r.y+r.height):overlap(f.x,f.x+f.width,r.x,r.x+r.width);if(projected){
      // The moving edge faces a neighbour; the opposite edge remains fixed.
      var otherStart=axis==='x'?r.x:r.y,otherEnd=otherStart+r[dim],targets=high?[otherStart-4,otherEnd+4]:[otherEnd+4,otherStart-4];
      targets.forEach(function(v){var c=fromEdge(v);if(c.size>0)add(axis,v,'gap','element','部品'+(index+1)+'との4mm間隔',axis==='x'?Math.min(r.y,f.y):Math.min(r.x,f.x),axis==='x'?Math.max(r.y+r.height,f.y+f.height):Math.max(r.x+r.width,f.x+f.width),4);});
     }
    });
    // Keep the original opposite edge as the resize anchor. Candidate pos
    // encodes the new leading edge; the final geometry is reconstructed below.
    axes[axis==='x'?0:1]=(axes[axis==='x'?0:1]||[]).filter(function(c){return c.kind&&Math.abs(c.pos-edgePosition)<=threshold+EPS;});
   }
  });
  var xs=axes[0]||[],ys=axes[1]||[];
  function baseline(axis){return{pos:axis==='x'?f.x:f.y,kind:null,order:-1};}
  var xChoices=[baseline('x')].concat(xs),yChoices=[baseline('y')].concat(ys),best=null;
  xChoices.forEach(function(xc){yChoices.forEach(function(yc){
   var r={x:xc.pos,y:yc.pos,width:f.width,height:f.height};
   if(mode==='resize'){
    var horizontal=edge.indexOf('e')>=0||edge.indexOf('w')>=0,vertical=edge.indexOf('n')>=0||edge.indexOf('s')>=0;
    if(horizontal){var hLow=edge.indexOf('w')>=0,anchorX=hLow?o.x+o.width:o.x,edgeX=xc.kind?xc.pos:(hLow?f.x:f.x+f.width);r.x=hLow?edgeX:anchorX;r.width=hLow?anchorX-edgeX:edgeX-anchorX;}
    if(vertical){var vLow=edge.indexOf('n')>=0,anchorY=vLow?o.y+o.height:o.y,edgeY=yc.kind?yc.pos:(vLow?f.y:f.y+f.height);r.y=vLow?edgeY:anchorY;r.height=vLow?anchorY-edgeY:edgeY-anchorY;}
   }
   if(!finite(r.x)||!finite(r.y)||!finite(r.width)||!finite(r.height)||r.width<=0||r.height<=0||!inside(r,b))return;
   if(others.some(function(other){return intersects(r,other);}))return;
   var score=Math.abs(xc.pos-(mode==='resize'&&edge.indexOf('w')>=0?f.x:mode==='resize'&&edge.indexOf('e')>=0?f.x+f.width:f.x))+Math.abs(yc.pos-(mode==='resize'&&edge.indexOf('n')>=0?f.y:mode==='resize'&&edge.indexOf('s')>=0?f.y+f.height:f.y));
   var order=(xc.order+1)*10000+(yc.order+1);
   var count=(xc.kind?1:0)+(yc.kind?1:0);
   if(!best||count>best.count||count===best.count&&(score<best.score-EPS||Math.abs(score-best.score)<=EPS&&order<best.order))best={rect:r,x:xc,y:yc,score:score,order:order,count:count};
  });});
  if(!best)return{rect:f,guides:[]};
  var guides=[];[best.x,best.y].forEach(function(c,idx){if(!c.kind)return;var axis=idx===0?'x':'y';guides.push({axis:axis,value:c.value,from:c.from,to:c.to,kind:c.kind,source:c.source,target:c.target,distance:c.distance});});
  return{rect:best.rect,guides:guides};
 }
 root.OMRSnapping={propose:propose};
})(typeof window==='undefined'?globalThis:window);
