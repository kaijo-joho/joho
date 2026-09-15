(function (root, factory) {
  const api = factory(typeof module === 'object' && module.exports ? require('./output.js') : root.DiagramOutput);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiagramRender = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Output) {
  'use strict';
  const escapeXML = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;' })[c]);
  const num = n => Number.isFinite(n) ? Math.round(n * 1000) / 1000 : 0;
  const pstr = p => `${num(p.x)} ${num(p.y)}`;
  const midpoint = (a,b) => ({ x:(a.x+b.x)/2, y:(a.y+b.y)/2 });
  const add = (a,b,f=1) => ({x:a.x+b.x*f,y:a.y+b.y*f});
  const center = n => ({ x:n.x+n.w/2, y:n.y+n.h/2 });
  const normals = {top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}};
  const DEFAULT_STYLE = Object.freeze({ fontSize:16,stroke:'#253140',fill:'#ffffff',color:'#253140',strokeWidth:2,dashed:false,bold:false });
  const DARK_DEFAULT_STYLE = Object.freeze({ stroke:'#e8eef7',fill:'#273442',color:'#eef4fb' });
  const getStyle = o => ({ ...DEFAULT_STYLE,...o.style });
  function displayStyle(o,theme='light',preserveCustomFill=false) {
    const style=getStyle(o);
    if(theme!=='dark')return style;
    if(preserveCustomFill&&String(style.fill).toLowerCase()!==DEFAULT_STYLE.fill)return style;
    for(const key of ['stroke','fill','color'])if(String(style[key]).toLowerCase()===DEFAULT_STYLE[key])style[key]=DARK_DEFAULT_STYLE[key];
    return style;
  }
  const isEllipse = n => ['initial','final','junction'].includes(n.kind) || n.kind === 'state' && n.variant !== 'round';
  const isDiamond = n => n.kind === 'decision' || n.kind === 'merge';
  function textWidth(text, fs) { return [...String(text)].reduce((w,c) => w + (c.codePointAt(0)>255 ? 1 : /[il .,'!|]/.test(c) ? .32 : .62) * fs, 0); }
  function wrapText(text, width, fs) {
    const lines=[];
    String(text||'').split('\n').forEach(line=>{
      let part='';
      for(const c of [...line]) { if(part && textWidth(part+c,fs)>width) {lines.push(part);part='';} part+=c; }
      lines.push(part);
    });
    return lines;
  }
  function textMarkup(text, x, y, width, style) {
    const lines=wrapText(text,Math.max(10,width),style.fontSize), step=style.fontSize*1.35;
    return `<text x="${num(x)}" y="${num(y-(lines.length-1)*step/2)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif" font-size="${style.fontSize}" font-weight="${style.bold?700:400}" fill="${escapeXML(style.color)}">${lines.map((line,i)=>`<tspan x="${num(x)}" dy="${i?num(step):0}">${escapeXML(line)}</tspan>`).join('')}</text>`;
  }
  function laneTitleMarkup(title,x,y,width,color) {
    const full=String(title??''),available=Math.max(0,width-16);
    if(available<11)return '';
    let fontSize=11,lines=wrapText(full,available,fontSize);
    for(const candidate of [14,12,11]){const wrapped=wrapText(full,available,candidate);if((wrapped.length===1||candidate<=12&&wrapped.length<=2)&&wrapped.every(line=>textWidth(line,candidate)<=available)){fontSize=candidate;lines=wrapped;break;}}
    if(lines.length>2||lines.some(line=>textWidth(line,fontSize)>available)){
      lines=lines.slice(0,2);
      let last=lines.pop()||'';
      while(last&&textWidth(last+'…',fontSize)>available)last=[...last].slice(0,-1).join('');
      lines.push(last+'…');
    }
    const step=fontSize*1.2,start=y-(lines.length-1)*step/2;
    return `<text x="${num(x)}" y="${num(start)}" text-anchor="middle" dominant-baseline="central" font-family="Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif" font-size="${fontSize}" font-weight="700" fill="${escapeXML(color)}">${lines.map((line,i)=>`<tspan x="${num(x)}" dy="${i?num(step):0}">${escapeXML(line)}</tspan>`).join('')}</text>`;
  }
  function fitNode(n) {
    const s=getStyle(n), diamond=isDiamond(n), longest=Math.max(0,...String(n.text||'').split('\n').map(t=>textWidth(t,s.fontSize)));
    const w=Math.max(n.w,Math.min(360,longest+36)*(diamond?1.35:1));
    const lines=wrapText(n.text,diamond?w*.6:w-26,s.fontSize);
    const h=Math.max(n.h,(lines.length*s.fontSize*1.35+26)*(diamond?1.5:1));
    return n.kind==='state'&&n.variant!=='round'?{w:num(Math.max(w,h)),h:num(Math.max(w,h))}:{w:num(w),h:num(h)};
  }
  function polygon(n) {
    const {x,y,w,h}=n, cut=Math.min(20,w*.17);
    if(isDiamond(n))return [{x:x+w/2,y},{x:x+w,y:y+h/2},{x:x+w/2,y:y+h},{x,y:y+h/2}];
    if(n.kind==='inputOutput')return [{x:x+cut,y},{x:x+w,y},{x:x+w-cut,y:y+h},{x,y:y+h}];
    if(n.kind==='manualInput')return [{x,y:y+h*.22},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
    if(n.kind==='loopStart')return [{x:x+cut,y},{x:x+w-cut,y},{x:x+w,y:y+cut},{x:x+w,y:y+h},{x,y:y+h},{x,y:y+cut}];
    if(n.kind==='loopEnd')return [{x,y},{x:x+w,y},{x:x+w,y:y+h-cut},{x:x+w-cut,y:y+h},{x:x+cut,y:y+h},{x,y:y+h-cut}];
    return [{x,y},{x:x+w,y},{x:x+w,y:y+h},{x,y:y+h}];
  }
  function shape(n,theme='light') {
    const s=displayStyle(n,theme,true), {x,y,w,h}=n;
    const attrs=`fill="${escapeXML(s.fill)}" stroke="${escapeXML(s.stroke)}" stroke-width="${s.strokeWidth}"${s.dashed?' stroke-dasharray="7 5"':''}`;
    if(n.kind==='text')return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="transparent" stroke="none"/>`;
    if(n.kind==='initial'||n.kind==='junction')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" fill="${escapeXML(s.stroke)}"/>`;
    if(n.kind==='final')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${attrs}/><ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w*.29}" ry="${h*.29}" fill="${escapeXML(s.stroke)}"/>`;
    if(n.kind==='fork'||n.kind==='join')return `<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="${escapeXML(s.stroke)}"/>`;
    if(n.kind==='state'&&n.variant!=='round')return `<ellipse cx="${x+w/2}" cy="${y+h/2}" rx="${w/2}" ry="${h/2}" ${attrs}/>`;
    if(n.kind==='terminal'||n.kind==='action'||n.kind==='state')return `<rect x="${x}" y="${y}" width="${w}" height="${h}" rx="${n.kind==='terminal'?h/2:10}" ${attrs}/>`;
    if(n.kind==='display') {const cut=Math.min(20,w*.16);return `<path d="M${x+cut} ${y}H${x+w-cut}Q${x+w+cut} ${y+h/2} ${x+w-cut} ${y+h}H${x+cut}L${x} ${y+h/2}Z" ${attrs}/>`;}
    return `<polygon points="${polygon(n).map(p=>`${num(p.x)},${num(p.y)}`).join(' ')}" ${attrs}/>`;
  }
  function nodeMarkup(n,{interactive=true,theme='light'}={}) {
    const s=displayStyle(n,theme,true), noText=['initial','final','junction','fork','join'].includes(n.kind);
    const attrs=interactive?` data-node="${escapeXML(n.id)}" tabindex="0" role="button" aria-label="${escapeXML(n.text||n.kind)}${n.locked?'、固定':''}"`:'';
    return `<g${attrs}>${shape(n,theme)}${noText?'':textMarkup(n.text,n.x+n.w/2,n.y+n.h/2,isDiamond(n)?n.w*.62:n.w-24,s)}</g>`;
  }
  function automaticSide(n,t) {const c=center(n),dx=t.x-c.x,dy=t.y-c.y;return Math.abs(dx/Math.max(1,n.w))>Math.abs(dy/Math.max(1,n.h))?(dx>=0?'right':'left'):(dy>=0?'bottom':'top');}
  function orthogonalSide(doc,n,other) {
    const target=other.w!==undefined?center(other):other;
    return doc.diagramType!=='state'&&Math.abs(target.y-center(n).y)>(n.h+(other.h||0))/2+8?(target.y>=center(n).y?'bottom':'top'):automaticSide(n,target);
  }
  function edgeContext(doc,e) {
    const na=doc.nodes.find(n=>n.id===e.from.nodeId),nb=doc.nodes.find(n=>n.id===e.to.nodeId);
    const ca=na?center(na):{x:e.from.x,y:e.from.y},cb=nb?center(nb):{x:e.to.x,y:e.to.y};
    const pair=na&&nb?doc.edges.filter(o=>o.from.nodeId&&o.to.nodeId&&[o.from.nodeId,o.to.nodeId].sort().join('|')===[na.id,nb.id].sort().join('|')):[e];
    const index=Math.max(0,pair.findIndex(o=>o.id===e.id)),slot=index-(pair.length-1)/2;
    return {na,nb,ca,cb,pair,index,slot};
  }
  function endpointSide(doc,e,end) {
    const ep=e[end];if(!ep.nodeId)return null;if(ep.side&&ep.side!=='auto')return ep.side;
    if(e.from.nodeId===e.to.nodeId)return e.from.side&&e.from.side!=='auto'?e.from.side:'right';
    const n=doc.nodes.find(n=>n.id===ep.nodeId),otherEp=e[end==='from'?'to':'from'];
    const other=doc.nodes.find(n=>n.id===otherEp.nodeId)||otherEp;
    if(e.kind==='orthogonal')return orthogonalSide(doc,n,other);
    const {na,nb,ca,cb,pair,slot}=edgeContext(doc,e),vx=cb.x-ca.x,vy=cb.y-ca.y,len=Math.max(1,Math.hypot(vx,vy)),normal={x:-vy/len,y:vx/len};
    const sign=na&&nb&&na.id>nb.id?-1:1;
    const target=e.kind==='curve'?e.bend||add(midpoint(ca,cb),normal,pair.length>1?slot*72*sign:48):add(end==='from'?cb:ca,normal,pair.length>1?slot*30*sign:0);
    return automaticSide(n,target);
  }
  function connectionsOnSide(doc,nodeId,side) {
    const entries=[];
    for(const e of doc.edges)for(const end of ['from','to'])if(e[end].nodeId===nodeId&&endpointSide(doc,e,end)===side)entries.push({edgeId:e.id,end});
    return entries;
  }
  function connectionOffsets(count=1) {
    const divisions=Math.max(2,Math.floor(count)+1),offsets=new Set([0,.5,1]);
    for(let i=1;i<divisions;i++)offsets.add(i/divisions);
    return [...offsets].sort((a,b)=>a-b);
  }
  function rayPolygon(n,target) {
    const c=center(n), d={x:target.x-c.x,y:target.y-c.y}, points=polygon(n); let best=Infinity;
    const cross=(a,b)=>a.x*b.y-a.y*b.x;
    for(let i=0;i<points.length;i++) {
      const a=points[i],b=points[(i+1)%points.length],v={x:b.x-a.x,y:b.y-a.y},o={x:a.x-c.x,y:a.y-c.y};
      const det=cross(d,v);if(Math.abs(det)<1e-9)continue;
      const t=cross(o,v)/det,u=cross(o,d)/det;if(t>=0&&u>=0&&u<=1)best=Math.min(best,t);
    }
    return Number.isFinite(best)?add(c,d,best):c;
  }
  function anchor(n,p,target,orthogonal=false,shift=0) {
    const c=center(n);let side=p.side||'auto',offset=p.offset??.5;
    if(side==='auto'&&!orthogonal) {
      let dx=target.x-c.x,dy=target.y-c.y;if(Math.abs(dx)+Math.abs(dy)<1e-6)dx=1;
      if(isEllipse(n)){const t=1/Math.sqrt((dx/(n.w/2))**2+(dy/(n.h/2))**2);return {x:c.x+dx*t,y:c.y+dy*t};}
      return rayPolygon(n,{x:c.x+dx,y:c.y+dy});
    }
    if(side==='auto'){side=automaticSide(n,target);offset=Math.max(.12,Math.min(.88,.5+shift));}
    const f=Math.max(0,Math.min(1,offset));
    let q=side==='top'?{x:n.x+n.w*f,y:n.y}:side==='bottom'?{x:n.x+n.w*f,y:n.y+n.h}:side==='left'?{x:n.x,y:n.y+n.h*f}:{x:n.x+n.w,y:n.y+n.h*f};
    if(isEllipse(n)) {
      if(side==='left'||side==='right'){const v=(q.y-c.y)/(n.h/2);q.x=c.x+(side==='right'?1:-1)*(n.w/2)*Math.sqrt(Math.max(0,1-v*v));}
      else{const v=(q.x-c.x)/(n.w/2);q.y=c.y+(side==='bottom'?1:-1)*(n.h/2)*Math.sqrt(Math.max(0,1-v*v));}
    } else if(n.kind==='display') {
      const cut=Math.min(20,n.w*.16);
      if(side==='top'||side==='bottom')q.x=n.x+cut+(n.w-2*cut)*f;
      else q.x=side==='left'?n.x+cut*Math.abs(2*f-1):n.x+n.w-cut+4*cut*f*(1-f);
    } else if(isDiamond(n)||['inputOutput','manualInput','loopStart','loopEnd'].includes(n.kind)) q=rayPolygon(n,q);
    else if(['terminal','action','state'].includes(n.kind)) {
      const r=n.kind==='terminal'?n.h/2:10,rx=Math.min(r,n.w/2),ry=Math.min(r,n.h/2);
      if(side==='top'||side==='bottom') {const dx=Math.max(n.x+rx-q.x,0,q.x-(n.x+n.w-rx)),dy=ry*Math.sqrt(Math.max(0,1-(dx/rx)**2));q.y=side==='top'?n.y+ry-dy:n.y+n.h-ry+dy;}
      else {const dy=Math.max(n.y+ry-q.y,0,q.y-(n.y+n.h-ry)),dx=rx*Math.sqrt(Math.max(0,1-(dy/ry)**2));q.x=side==='left'?n.x+rx-dx:n.x+n.w-rx+dx;}
    }
    return q;
  }
  function sidePoint(n,side,offset=.5) {return anchor(n,{side,offset},center(n),true);}
  function nearestOffset(n,side,p,offsets) {
    return offsets.reduce((best,offset)=>{const a=sidePoint(n,side,offset),b=sidePoint(n,side,best);return Math.hypot(a.x-p.x,a.y-p.y)<Math.hypot(b.x-p.x,b.y-p.y)-1e-8?offset:best;},offsets.includes(.5)?.5:offsets[0]);
  }
  function snapEndpoint(doc,e,end) {
    const ep=e[end];if(!ep.nodeId)return {...ep};
    const graph=doc.edges.some(o=>o.id===e.id)?doc:{...doc,edges:[...doc.edges,e]},side=endpointSide(graph,e,end),n=graph.nodes.find(n=>n.id===ep.nodeId);
    const p=ep.side==='auto'?edgeGeometry(graph,e)[end]:sidePoint(n,side,ep.offset);
    return {nodeId:n.id,side,offset:nearestOffset(n,side,p,connectionOffsets(connectionsOnSide(graph,n.id,side).length))};
  }
  function samplesQuadratic(a,c,b) {return Array.from({length:33},(_,i)=>{const t=i/32,u=1-t;return{x:u*u*a.x+2*u*t*c.x+t*t*b.x,y:u*u*a.y+2*u*t*c.y+t*t*b.y};});}
  function samplesCubic(a,c,d,b) {return Array.from({length:49},(_,i)=>{const t=i/48,u=1-t;return{x:u*u*u*a.x+3*u*u*t*c.x+3*u*t*t*d.x+t*t*t*b.x,y:u*u*u*a.y+3*u*u*t*c.y+3*u*t*t*d.y+t*t*t*b.y};});}
  function atLength(points,t) {
    const distances=points.slice(1).map((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)),total=distances.reduce((a,b)=>a+b,0);let wanted=Math.max(0,Math.min(1,t))*total;
    for(let i=0;i<distances.length;i++){if(wanted<=distances[i]||i===distances.length-1){const r=distances[i]?wanted/distances[i]:0;return{x:points[i].x+(points[i+1].x-points[i].x)*r,y:points[i].y+(points[i+1].y-points[i].y)*r};}wanted-=distances[i];}
    return points[0]||{x:0,y:0};
  }
  function boundsOf(points,padding=0) {const xs=points.map(p=>p.x),ys=points.map(p=>p.y),x=Math.min(...xs)-padding,y=Math.min(...ys)-padding;return{x,y,w:Math.max(1,Math.max(...xs)-x+padding),h:Math.max(1,Math.max(...ys)-y+padding)};}
  function segmentHits(a,b,o) {
    const epsilon=1e-7;
    if(Math.abs(a.y-b.y)<epsilon) return a.y>o.y+epsilon&&a.y<o.b-epsilon&&Math.max(Math.min(a.x,b.x),o.x)<Math.min(Math.max(a.x,b.x),o.r)-epsilon;
    if(Math.abs(a.x-b.x)<epsilon) return a.x>o.x+epsilon&&a.x<o.r-epsilon&&Math.max(Math.min(a.y,b.y),o.y)<Math.min(Math.max(a.y,b.y),o.b)-epsilon;
    return true;
  }
  function simplifyRoute(points) {
    const result=[];
    for(const p of points) {
      if(result.length&&Math.hypot(p.x-result.at(-1).x,p.y-result.at(-1).y)<1e-7)continue;
      while(result.length>1) {
        const a=result.at(-2),b=result.at(-1),u={x:b.x-a.x,y:b.y-a.y},v={x:p.x-b.x,y:p.y-b.y};
        if(Math.abs(u.x*v.y-u.y*v.x)>1e-7||u.x*v.x+u.y*v.y<0)break;
        result.pop();
      }
      result.push(p);
    }
    return result;
  }
  function orthogonalRoute(doc,e,from,to,sideA,sideB,existing) {
    if(e.kind!=='orthogonal'||e.bend||e.waypoints?.length)return null;
    const normalA=normals[sideA]||normals.right,normalB=normals[sideB]||normals.left;
    const sameAnchor=e.from.nodeId&&e.from.nodeId===e.to.nodeId&&Math.hypot(from.x-to.x,from.y-to.y)<1e-7;
    const routeCost=points=>points.slice(1).reduce((sum,p,i)=>sum+Math.abs(p.x-points[i].x)+Math.abs(p.y-points[i].y),0)+Math.max(0,points.length-2)*18;
    // Reduce clearance only when the expanded boxes leave no route through a narrow gap.
    for(const clearance of [12,4,0]) {
      const obstacles=doc.nodes.map(n=>({id:n.id,x:n.x-clearance,y:n.y-clearance,r:n.x+n.w+clearance,b:n.y+n.h+clearance}));
      const clearRoute=points=>points.length>1&&points.every((p,i)=>!i||!obstacles.some(o=>
        !(i===1&&o.id===e.from.nodeId)&&!(i===points.length-1&&o.id===e.to.nodeId)&&segmentHits(points[i-1],p,o)));
      if(clearRoute(existing))return null;
      function stub(point,normal,nodeId) {
        const own=obstacles.find(o=>o.id===nodeId);
        const required=own?Math.max(0,normal.x>0?own.r-point.x:normal.x<0?point.x-own.x:normal.y>0?own.b-point.y:point.y-own.y):0;
        let distance=Math.max(22,required);
        for(const o of obstacles) {
          if(o.id===nodeId)continue;
          const onRay=normal.x?point.y>o.y+1e-7&&point.y<o.b-1e-7:point.x>o.x+1e-7&&point.x<o.r-1e-7;
          if(!onRay)continue;
          const near=normal.x>0?o.x-point.x:normal.x<0?point.x-o.r:normal.y>0?o.y-point.y:point.y-o.b;
          const far=normal.x>0?o.r-point.x:normal.x<0?point.x-o.x:normal.y>0?o.b-point.y:point.y-o.y;
          if(far>1e-7)distance=Math.min(distance,Math.max(0,near));
        }
        if(distance+1e-7<required)return null;
        const result=add(point,normal,distance);
        return obstacles.some(o=>o.id!==nodeId&&segmentHits(point,result,o))?null:result;
      }
      const start=stub(from,normalA,e.from.nodeId),end=stub(to,normalB,e.to.nodeId);
      if(!start||!end)continue;
      const envelope={x:Math.min(start.x,end.x,...obstacles.map(o=>o.x))-24,y:Math.min(start.y,end.y,...obstacles.map(o=>o.y))-24,r:Math.max(start.x,end.x,...obstacles.map(o=>o.r))+24,b:Math.max(start.y,end.y,...obstacles.map(o=>o.b))+24};
      const blockers=obstacles.filter(o=>existing.some((p,i)=>i&&segmentHits(existing[i-1],p,o)));
      const distance=o=>Math.max(o.x-start.x,0,start.x-o.r)+Math.max(o.y-start.y,0,start.y-o.b);
      const nearest=obstacles.slice().sort((a,b)=>distance(a)-distance(b));
      const relevant=[...new Set([...blockers.slice(0,20),...nearest.slice(0,16)])].slice(0,28);
      const accepted=route=>{
        const points=simplifyRoute([from,start,...route,end,to]);
        if(!clearRoute(points))return null;
        // A segment must not immediately double back over the preceding segment.
        for(let i=2;i<points.length;i++) {
          const a=points[i-2],b=points[i-1],c=points[i];
          if((b.x-a.x)*(c.x-b.x)+(b.y-a.y)*(c.y-b.y)<0&&Math.abs((b.x-a.x)*(c.y-b.y)-(b.y-a.y)*(c.x-b.x))<1e-7)return null;
        }
        if(sameAnchor) {
          const area=Math.abs(points.slice(1).reduce((sum,p,i)=>sum+points[i].x*p.y-points[i].y*p.x,0))/2;
          if(area<128)return null;
        }
        return points;
      };
      let best=null,bestCost=Infinity;
      const consider=route=>{const result=accepted(route);if(result){const cost=routeCost(result);if(cost<bestCost){best=result;bestCost=cost;}}};
      if(sameAnchor) {
        const tangent={x:-normalA.y,y:normalA.x},own=doc.nodes.find(n=>n.id===e.from.nodeId);
        const span=Math.max(32,(normalA.x?own.h:own.w)*.32);
        for(const reach of [8,16,28,58,100,Math.max(envelope.r-envelope.x,envelope.b-envelope.y)])for(const sign of [-1,1]) {
          const a=add(start,tangent,span*sign),b=add(a,normalA,reach),c=add(b,tangent,-span*sign);
          consider([a,b,c]);
        }
      } else {
        consider([]); consider([{x:start.x,y:end.y}]); consider([{x:end.x,y:start.y}]);
        const xs=new Set([envelope.x,envelope.r,...existing.map(p=>p.x),...relevant.flatMap(o=>[o.x,o.r])]);
        const ys=new Set([envelope.y,envelope.b,...existing.map(p=>p.y),...relevant.flatMap(o=>[o.y,o.b])]);
        for(const x of xs)consider([{x,y:start.y},{x,y:end.y}]);
        for(const y of ys)consider([{x:start.x,y},{x:end.x,y}]);
      }
      if(best)return best;
      if(sameAnchor)continue;
      // A compressed visibility grid uses only selected obstacle boundaries, but every
      // visibility check uses ALL boxes. Both grid size and A* expansions are bounded.
      const missed=new Set();
      for(let attempt=0;attempt<3;attempt++) {
        if(attempt)for(const o of missed)if(relevant.length<40&&!relevant.includes(o))relevant.push(o);
        missed.clear();
        const xs=[...new Set([start.x,end.x,envelope.x,envelope.r,...relevant.flatMap(o=>[o.x,o.r])])].sort((a,b)=>a-b);
        const ys=[...new Set([start.y,end.y,envelope.y,envelope.b,...relevant.flatMap(o=>[o.y,o.b])])].sort((a,b)=>a-b);
        const nx=xs.length,count=nx*ys.length;if(count>7200)break;
        const startIndex=ys.indexOf(start.y)*nx+xs.indexOf(start.x),endIndex=ys.indexOf(end.y)*nx+xs.indexOf(end.x);
        const coordinates=index=>({x:xs[index%nx],y:ys[Math.floor(index/nx)]});
        const pointCache=new Map(),segmentCache=new Map();
        const validPoint=index=>{
          if(pointCache.has(index))return pointCache.get(index);
          const p=coordinates(index),hits=obstacles.filter(o=>p.x>o.x+1e-7&&p.x<o.r-1e-7&&p.y>o.y+1e-7&&p.y<o.b-1e-7);
          hits.forEach(o=>missed.add(o));pointCache.set(index,!hits.length);return !hits.length;
        };
        const visible=(a,b)=>{
          const key=Math.min(a,b)*count+Math.max(a,b);if(segmentCache.has(key))return segmentCache.get(key);
          const first=coordinates(a),last=coordinates(b),hits=obstacles.filter(o=>segmentHits(first,last,o));
          hits.forEach(o=>missed.add(o));segmentCache.set(key,!hits.length);return !hits.length;
        };
        if(!validPoint(startIndex)||!validPoint(endIndex))break;
        const heap=[];
        function push(item) {
          heap.push(item);let i=heap.length-1;
          while(i){const p=(i-1)>>1;if(heap[p].score<=item.score)break;heap[i]=heap[p];i=p;}heap[i]=item;
        }
        function pop() {
          const first=heap[0],last=heap.pop();if(!heap.length)return first;
          let i=0;while(i*2+1<heap.length){let child=i*2+1;if(child+1<heap.length&&heap[child+1].score<heap[child].score)child++;if(heap[child].score>=last.score)break;heap[i]=heap[child];i=child;}heap[i]=last;return first;
        }
        const costs=new Float64Array(count*3).fill(Infinity),previous=new Int32Array(count*3).fill(-1);
        const initial=startIndex*3;costs[initial]=0;push({state:initial,cost:0,score:Math.abs(start.x-end.x)+Math.abs(start.y-end.y)});
        let final=-1;
        for(let expanded=0;heap.length&&expanded<14000;expanded++) {
          const item=pop();if(item.cost!==costs[item.state])continue;
          const index=Math.floor(item.state/3),direction=item.state%3,p=coordinates(index);
          if(index===endIndex){final=item.state;break;}
          const x=index%nx,y=Math.floor(index/nx),neighbors=[];
          if(x)neighbors.push(index-1);if(x+1<nx)neighbors.push(index+1);if(y)neighbors.push(index-nx);if(y+1<ys.length)neighbors.push(index+nx);
          for(const next of neighbors) {
            const q=coordinates(next),nextDirection=p.x===q.x?2:1;
            if(index===startIndex&&(q.x-p.x)*normalA.x+(q.y-p.y)*normalA.y<0)continue;
            if(next===endIndex&&(q.x-p.x)*normalB.x+(q.y-p.y)*normalB.y>0)continue;
            if(!validPoint(next)||!visible(index,next))continue;
            const state=next*3+nextDirection,cost=item.cost+Math.abs(q.x-p.x)+Math.abs(q.y-p.y)+(direction&&direction!==nextDirection?18:0);
            if(cost>=costs[state])continue;
            costs[state]=cost;previous[state]=item.state;push({state,cost,score:cost+Math.abs(q.x-end.x)+Math.abs(q.y-end.y)});
          }
        }
        if(final>=0) {
          const path=[];for(let state=final;state>=0;state=previous[state])path.push(coordinates(Math.floor(state/3)));path.reverse();
          const result=accepted(path);if(result)return result;
        }
        if(relevant.length>=40||![...missed].some(o=>!relevant.includes(o)))break;
      }
    }
    // Overlapping shapes or an endpoint inside another shape can make avoidance impossible.
    return null;
  }
  // 手動の経路点を順番に通り、点の間を水平・垂直の線でつなぐ。
  // 補助の角は文書へ保存せず、反転しても同じ経路になるように決める。
  function manualOrthogonal(doc,e,context) {
    const {na,nb,ca,cb}=context,loop=na&&nb&&na.id===nb.id;
    function endpoint(end,n,other) {
      const value=e[end];
      if(!n)return {point:{...value},side:null};
      const side=loop?(value.side==='auto'?(e.from.side==='auto'?'right':e.from.side):value.side):endpointSide(doc,e,end);
      let offset=value.offset??.5;
      if(value.side==='auto') {
        if(loop)offset=end==='from'?.32:.72;
        else {const peers=connectionsOnSide(doc,n.id,side),index=Math.max(0,peers.findIndex(p=>p.edgeId===e.id&&p.end===end));offset=(index+1)/(peers.length+1);}
      }
      return {point:anchor(n,{...value,side,offset},other,true),side};
    }
    const a=endpoint('from',na,cb),b=endpoint('to',nb,ca),controls=e.waypoints;
    const elbow=(p,q)=>p.x<q.x?{x:q.x,y:p.y}:{x:p.x,y:q.y};
    const leg=(endpoint,target)=>{
      const p=endpoint.point,n=normals[endpoint.side];
      if(!n)return [p,elbow(p,target),target];
      const dx=target.x-p.x,dy=target.y-p.y;
      if(Math.abs(dx*n.y-dy*n.x)<1e-7&&dx*n.x+dy*n.y>=0)return [p,target];
      const stub=add(p,n,22),corner=n.x?{x:stub.x,y:target.y}:{x:target.x,y:stub.y};
      return [p,stub,corner,target];
    };
    const points=[],segmentSlots=[];
    const append=(p,slot)=>{if(points.length&&Math.hypot(p.x-points.at(-1).x,p.y-points.at(-1).y)<1e-7)return;if(points.length)segmentSlots.push(slot);points.push({...p});};
    leg(a,controls[0]).forEach(p=>append(p,0));
    for(let i=1;i<controls.length;i++) {
      const p=controls[i-1],q=controls[i];
      if(Math.abs(p.x-q.x)>1e-7&&Math.abs(p.y-q.y)>1e-7)append(elbow(p,q),i);
      append(q,i);
    }
    leg(b,controls.at(-1)).reverse().forEach(p=>append(p,controls.length));
    if(points.length===1)points.push({...points[0]});
    return {points,segmentSlots,from:a.point,to:b.point};
  }
  function edgeGeometry(doc,e) {
    const {na,nb,ca,cb,pair,index,slot}=edgeContext(doc,e);
    let from,to,handle,path,points,segmentSlots;
    if(e.kind==='orthogonal'&&e.waypoints?.length) {
      ({from,to,points,segmentSlots}=manualOrthogonal(doc,e,{na,nb,ca,cb}));
      handle=atLength(points,.5);path=points.map((p,i)=>(i?'L':'M')+pstr(p)).join('');
    } else if(na&&nb&&na.id===nb.id&&e.kind==='orthogonal') {
      const sideA=e.from.side!=='auto'?e.from.side:'right',sideB=e.to.side==='auto'?sideA:e.to.side;
      const normalA=normals[sideA]||normals.right,normalB=normals[sideB]||normals.right;
      const first={...e.from,side:sideA,offset:e.from.side==='auto'?.32:e.from.offset??.32};
      const last={...e.to,side:sideB,offset:e.to.side==='auto'?.72:e.to.offset??.72};
      from=anchor(na,first,cb,true);to=anchor(nb,last,ca,true);
      const mid=midpoint(from,to),base=58+index*28;
      const rail=(side,padding,useBend=false)=>{
        const normal=normals[side]||normals.right,axis=normal.x?'x':'y',edge=normal.x?(normal.x>0?na.x+na.w:na.x):(normal.y>0?na.y+na.h:na.y);
        const bend=useBend&&e.bend?e.bend[axis]:null,minimum=edge+normal[axis]*28;
        return normal[axis]>0?Math.max(minimum,bend??edge+padding):Math.min(minimum,bend??edge-padding);
      };
      const onRail=(p,side,value)=>(normals[side]||normals.right).x===0?{x:p.x,y:value}:{x:value,y:p.y};
      if(sideA===sideB) {
        const outer=rail(sideA,base,true),a=onRail(from,sideA,outer),b=onRail(to,sideA,outer),tangent={x:-normalA.y,y:normalA.x};
        if(Math.hypot(a.x-b.x,a.y-b.y)>.01) {points=[from,a,b,to];handle=midpoint(a,b);}
        else {
          const span=Math.max(32,(sideA==='top'||sideA==='bottom'?na.w:na.h)*.32),inner=rail(sideA,28),axis=normalA.x?'x':'y',outerRail=normalA[axis]>0?Math.max(outer,inner+28):Math.min(outer,inner-28),near=onRail(from,sideA,inner),left=add(near,tangent,-span),outerLeft=onRail(left,sideA,outerRail),outerRight=add(outerLeft,tangent,2*span),right=onRail(outerRight,sideA,inner),back=add(right,tangent,-span);
          points=[from,near,left,outerLeft,outerRight,right,back,to];handle=midpoint(outerLeft,outerRight);
        }
      } else if(normalA.x===-normalB.x&&normalA.y===-normalB.y) {
        const a=onRail(from,sideA,rail(sideA,base)),b=onRail(to,sideB,rail(sideB,base)),horizontal=normalA.x!==0;
        const direction=e.bend?(horizontal?(e.bend.y<mid.y?-1:1):(e.bend.x<mid.x?-1:1)):(index%2?-1:1);
        const route=horizontal?(direction<0?Math.min(e.bend?.y??Infinity,na.y-28):Math.max(e.bend?.y??-Infinity,na.y+na.h+28)):(direction<0?Math.min(e.bend?.x??Infinity,na.x-28):Math.max(e.bend?.x??-Infinity,na.x+na.w+28));
        if(horizontal) {points=[from,a,{x:a.x,y:route},{x:b.x,y:route},b,to];handle={x:(a.x+b.x)/2,y:route};}
        else {points=[from,a,{x:route,y:a.y},{x:route,y:b.y},b,to];handle={x:route,y:(a.y+b.y)/2};}
      } else {
        const a=onRail(from,sideA,rail(sideA,base,true)),b=onRail(to,sideB,rail(sideB,base,true));
        handle=normalA.x!==0?{x:a.x,y:b.y}:{x:b.x,y:a.y};points=[from,a,handle,b,to];
      }
      points=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>.01);
      const routed=orthogonalRoute(doc,e,from,to,sideA,sideB,points);if(routed){points=routed;handle=points[Math.floor((points.length-1)/2)];}
      path=points.map((p,i)=>(i?'L':'M')+pstr(p)).join('');
    } else if(na&&nb&&na.id===nb.id) {
      const side=e.from.side!=='auto'?e.from.side:'right',normal=normals[side]||normals.right,tangent={x:-normal.y,y:normal.x};
      const first={...e.from,side,offset:e.from.side==='auto'?.32:e.from.offset??.32};
      const last={...e.to,side:e.to.side==='auto'?side:e.to.side,offset:e.to.side==='auto'?.72:e.to.offset??.72};
      from=anchor(na,first,cb,true);to=anchor(nb,last,ca,true);
      const mid=midpoint(from,to);handle=e.bend||add(mid,normal,95+index*42);
      const cm={x:(handle.x-.25*mid.x)/.75,y:(handle.y-.25*mid.y)/.75},span=Math.max(55,(side==='top'||side==='bottom'?na.w:na.h)*.65);
      const c=add(cm,tangent,-span),d=add(cm,tangent,span);
      path=`M${pstr(from)}C${pstr(c)} ${pstr(d)} ${pstr(to)}`;points=samplesCubic(from,c,d,to);
    } else {
      const vx=cb.x-ca.x,vy=cb.y-ca.y,length=Math.max(1,Math.hypot(vx,vy)),normal={x:-vy/length,y:vx/length};
      const sign=na&&nb&&na.id>nb.id?-1:1,offset=pair.length>1?slot*72*sign:48;
      if(e.kind==='curve') {
        handle=e.bend||add(midpoint(ca,cb),normal,offset);
        from=na?anchor(na,e.from,handle):ca;to=nb?anchor(nb,e.to,handle):cb;
        const m=midpoint(from,to),c={x:2*handle.x-m.x,y:2*handle.y-m.y};
        path=`M${pstr(from)}Q${pstr(c)} ${pstr(to)}`;points=samplesQuadratic(from,c,to);
      } else if(e.kind==='straight') {
        const shift=pair.length>1?slot*30*sign:0;
        from=na?anchor(na,e.from,add(cb,normal,shift)):ca;to=nb?anchor(nb,e.to,add(ca,normal,shift)):cb;
        points=[from,to];handle=midpoint(from,to);path=`M${pstr(from)}L${pstr(to)}`;
      } else {
        const sideA=na?endpointSide(doc,e,'from'):Math.abs(vx)>Math.abs(vy)?(vx>=0?'right':'left'):(vy>=0?'bottom':'top');
        const sideB=nb?endpointSide(doc,e,'to'):Math.abs(vx)>Math.abs(vy)?(vx>=0?'left':'right'):(vy>=0?'top':'bottom');
        function distributed(n,endpoint,side,end){
          if(endpoint.side!=='auto')return endpoint;
          const attached=connectionsOnSide(doc,n.id,side),i=Math.max(0,attached.findIndex(o=>o.edgeId===e.id&&o.end===end));
          return {...endpoint,side,offset:(i+1)/(attached.length+1)};
        }
        from=na?anchor(na,distributed(na,e.from,sideA,'from'),cb,true):ca;to=nb?anchor(nb,distributed(nb,e.to,sideB,'to'),ca,true):cb;
        const a=add(from,normals[sideA]||normals.bottom,22),b=add(to,normals[sideB]||normals.top,22),verticalA=sideA==='top'||sideA==='bottom',verticalB=sideB==='top'||sideB==='bottom';
        if(verticalA&&verticalB) {
          const outside=from.y>to.y||e.bend&&(e.bend.x<Math.min(a.x,b.x)-25||e.bend.x>Math.max(a.x,b.x)+25);
          if(outside){const x=e.bend?.x??Math.max(na?na.x+na.w:a.x,nb?nb.x+nb.w:b.x)+65+index*22;handle={x,y:(a.y+b.y)/2};points=[from,a,{x,y:a.y},{x,y:b.y},b,to];}
          else{const y=e.bend?.y??(a.y+b.y)/2;handle={x:(a.x+b.x)/2,y};points=[from,a,{x:a.x,y},{x:b.x,y},b,to];}
        } else if(!verticalA&&!verticalB) {
          const y=e.bend?.y??(a.y+b.y)/2;
          if(e.bend||from.x>to.x){handle={x:(a.x+b.x)/2,y};points=[from,a,{x:a.x,y},{x:b.x,y},b,to];}
          else{const x=(a.x+b.x)/2;handle={x,y};points=[from,a,{x,y:a.y},{x,y:b.y},b,to];}
        } else {
          handle=e.bend||(verticalA?{x:a.x,y:b.y}:{x:b.x,y:a.y});
          points=verticalA?[from,a,{x:a.x,y:handle.y},handle,{x:handle.x,y:b.y},b,to]:[from,a,{x:handle.x,y:a.y},handle,{x:b.x,y:handle.y},b,to];
        }
        points=points.filter((p,i)=>!i||Math.hypot(p.x-points[i-1].x,p.y-points[i-1].y)>.01);
        const routed=orthogonalRoute(doc,e,from,to,sideA,sideB,points);if(routed){points=routed;handle=points[Math.floor((points.length-1)/2)];}
        path=points.map((p,i)=>(i?'L':'M')+pstr(p)).join('');
      }
    }
    const labelBase=atLength(points,e.label?.t??.5);let label={x:labelBase.x+(e.label?.dx||0),y:labelBase.y+(e.label?.dy||0)};
    const s=getStyle(e),lines=wrapText(e.label?.text||'',240,s.fontSize),lw=Math.max(0,...lines.map(t=>textWidth(t,s.fontSize)))+12,lh=lines.length*s.fontSize*1.35+8;
    if(e.kind==='orthogonal'&&!e.bend&&!e.waypoints?.length&&e.label?.text&&(e.label.t??.5)===.5&&(e.label.dx??0)===0&&(e.label.dy??-12)===-12) {
      const overlaps=(p,n)=>p.x+lw/2>n.x-4&&p.x-lw/2<n.x+n.w+4&&p.y+lh/2>n.y-4&&p.y-lh/2<n.y+n.h+4;
      const hits=doc.nodes.filter(n=>overlaps(label,n));
      if(hits.length) {
        const candidates=hits.flatMap(n=>[{x:label.x,y:n.y-lh/2-6},{x:label.x,y:n.y+n.h+lh/2+6},{x:n.x-lw/2-6,y:label.y},{x:n.x+n.w+lw/2+6,y:label.y}]);
        for(let i=1;i<points.length;i++) {
          const p=midpoint(points[i-1],points[i]);
          candidates.push({x:p.x,y:p.y-lh/2-6},{x:p.x,y:p.y+lh/2+6},{x:p.x-lw/2-6,y:p.y},{x:p.x+lw/2+6,y:p.y});
        }
        candidates.sort((a,b)=>Math.hypot(a.x-label.x,a.y-label.y)-Math.hypot(b.x-label.x,b.y-label.y));
        label=candidates.find(p=>doc.nodes.every(n=>!overlaps(p,n)))||label;
      }
    }
    const bounds=boundsOf([...points,handle,...(e.label?.text?[{x:label.x-lw/2,y:label.y-lh/2},{x:label.x+lw/2,y:label.y+lh/2}]:[])],Math.max(10,s.strokeWidth*4));
    return {path,points,from,to,label,labelOffset:{x:label.x-labelBase.x,y:label.y-labelBase.y},handle,bounds,segmentSlots,labelBounds:e.label?.text?{x:label.x-lw/2,y:label.y-lh/2,w:lw,h:lh}:null};
  }
  function waypointGeometry(doc,e) {
    const geometry=edgeGeometry(doc,e),manual=!!e.waypoints?.length;
    const points=manual?geometry.points:simplifyRoute(geometry.points);
    const waypoints=(manual?e.waypoints:points.slice(1,-1)).map(p=>({...p}));
    return {...geometry,points,waypoints,segmentSlots:manual?geometry.segmentSlots:points.slice(1).map((_,i)=>i)};
  }
  function insertWaypoint(doc,e,position) {
    const geometry=waypointGeometry(doc,e);
    if(geometry.waypoints.length>=32)throw new Error('折れ曲がり点は1本の矢印につき32個までです。');
    let best=null;
    for(let i=1;i<geometry.points.length;i++) {
      const a=geometry.points[i-1],b=geometry.points[i],dx=b.x-a.x,dy=b.y-a.y,length=dx*dx+dy*dy;
      if(length<1e-10)continue;
      const t=Math.max(0,Math.min(1,((position.x-a.x)*dx+(position.y-a.y)*dy)/length)),p={x:a.x+dx*t,y:a.y+dy*t},distance=Math.hypot(position.x-p.x,position.y-p.y);
      if(!best||distance<best.distance)best={point:p,index:geometry.segmentSlots[i-1],distance};
    }
    if(!best)throw new Error('点を追加できる長さの線がありません。');
    if([geometry.from,...geometry.waypoints,geometry.to].some(p=>Math.hypot(p.x-best.point.x,p.y-best.point.y)<.01))throw new Error('既存の点から少し離れた位置を選んでください。');
    const waypoints=geometry.waypoints;waypoints.splice(best.index,0,best.point);
    return {waypoints,index:best.index};
  }
  function splitWaypoints(doc,e,n) {
    const points=edgeGeometry(doc,e).points,hits=[],distances=[0];
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      for(const [axis,boundary] of [['x',n.x],['x',n.x+n.w],['y',n.y],['y',n.y+n.h]]) {
        const delta=axis==='x'?dx:dy;if(Math.abs(delta)<1e-7)continue;
        const t=(boundary-a[axis])/delta,other=axis==='x'?a.y+dy*t:a.x+dx*t,lo=axis==='x'?n.y:n.x,hi=lo+(axis==='x'?n.h:n.w);
        if(t>=0&&t<=1&&other>=lo-1e-7&&other<=hi+1e-7)hits.push(distances.at(-1)+length*t);
      }
      distances.push(distances.at(-1)+length);
    }
    const unique=[...new Set(hits.map(d=>Math.round(d*1e5)/1e5))].sort((a,b)=>a-b);
    if(unique.length!==2)throw new Error('経路が処理の枠を1回だけ通る位置を選んでください。');
    return {
      incomingWaypoints:simplifyRoute(points.filter((_,i)=>i>0&&distances[i]<unique[0]-1e-5)).map(p=>({...p})),
      outgoingWaypoints:simplifyRoute(points.filter((_,i)=>i<points.length-1&&distances[i]>unique[1]+1e-5)).map(p=>({...p}))
    };
  }
  function edgeMarkup(doc,e,interactive,idPrefix,theme='light') {
    const g=edgeGeometry(doc,e),s=displayStyle(e,theme),label=e.label?.text||'',marker=`${idPrefix}-arrow-${e.id}`;
    const attrs=interactive?` data-edge="${escapeXML(e.id)}" tabindex="0" role="button" aria-label="${escapeXML(label||'接続線')}${e.locked?'、固定':''}"`:'';
    const line=`<path d="${g.path}" fill="none" stroke="${escapeXML(s.stroke)}" stroke-width="${s.strokeWidth}"${s.dashed?' stroke-dasharray="7 5"':''}${e.head!=='none'?` marker-end="url(#${escapeXML(marker)})"`:''}${e.head==='both'?` marker-start="url(#${escapeXML(marker)})"`:''}/>`;
    const lines=wrapText(label,240,s.fontSize),w=Math.max(0,...lines.map(t=>textWidth(t,s.fontSize)))+12,h=lines.length*s.fontSize*1.35+8;
    const labelFill=theme==='dark'?'#273442':'#ffffff';
    const labelMarkup=label?`<g${interactive?` data-edge-label="${escapeXML(e.id)}"`:''}><rect x="${num(g.label.x-w/2)}" y="${num(g.label.y-h/2)}" width="${num(w)}" height="${num(h)}" rx="3" fill="${labelFill}" fill-opacity=".95"/>${textMarkup(label,g.label.x,g.label.y,240,s)}</g>`:'';
    return `<g${attrs}>${interactive?`<path d="${g.path}" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke"/>`:''}${line}${labelMarkup}</g>`;
  }
  function exportSelection(doc,selectedIds=null) {
    const {nodes,edges,lanes}=doc;
    if(selectedIds==null)return{nodes,edges,lanes};
    const chosen=new Set(Array.isArray(selectedIds)?selectedIds:[]);
    let changed=true;
    const include=id=>{if(!chosen.has(id)){chosen.add(id);changed=true;}};
    // A selected lane includes its contents. Groups and internal connections stay together.
    while(changed) {
      changed=false;
      for(const n of nodes)if(n.laneId&&chosen.has(n.laneId))include(n.id);
      for(const g of doc.groups||[])if(chosen.has(g.id)||g.memberIds.some(id=>chosen.has(id)))g.memberIds.forEach(include);
      for(const e of edges)if(e.from.nodeId&&e.to.nodeId&&chosen.has(e.from.nodeId)&&chosen.has(e.to.nodeId))include(e.id);
    }
    return{nodes:nodes.filter(n=>chosen.has(n.id)),edges:edges.filter(e=>chosen.has(e.id)),lanes:lanes.filter(l=>chosen.has(l.id))};
  }
  function sceneMarkup(doc,{interactive=true,idPrefix='diagram',theme='light',selectedIds=null}={}) {
    const draw=exportSelection(doc,selectedIds);
    const dark=theme==='dark',lane={fill:dark?'#222d3a':'#ffffff',header:dark?'#34465a':'#edf0f4',stroke:dark?'#718197':'#b8c2cf',color:dark?'#eef4fb':'#253140'};
    const definitions=`<defs>${draw.edges.map(e=>`<marker id="${escapeXML(idPrefix)}-arrow-${escapeXML(e.id)}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M1 1L9 5L1 9Z" fill="${escapeXML(displayStyle(e,theme).stroke)}"/></marker>`).join('')}</defs>`;
    const lanes=draw.lanes.map(l=>`<g${interactive?` data-lane="${escapeXML(l.id)}" tabindex="0" role="button" aria-label="担当領域 ${escapeXML(l.title)}"`:''}><title>${escapeXML(l.title)}</title><rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="${lane.fill}" stroke="${lane.stroke}" stroke-width="1.5"/><rect x="${l.x}" y="${l.y}" width="${l.w}" height="32" fill="${lane.header}" stroke="${lane.stroke}" stroke-width="1"/>${laneTitleMarkup(l.title,l.x+l.w/2,l.y+16,l.w,lane.color)}</g>`).join('');
    return `${definitions}<g>${lanes}</g><g>${draw.edges.map(e=>edgeMarkup(doc,e,interactive,idPrefix,theme)).join('')}</g><g>${draw.nodes.map(n=>nodeMarkup(n,{interactive,theme})).join('')}</g>`;
  }
  function documentBounds(doc,{selectedIds=null}={}) {
    const draw=exportSelection(doc,selectedIds);
    const boxes=[];
    for(const n of draw.nodes){const s=getStyle(n),lines=wrapText(n.text,isDiamond(n)?n.w*.62:n.w-24,s.fontSize),height=lines.length*s.fontSize*1.35;boxes.push({x:n.x-3,y:Math.min(n.y-3,n.y+n.h/2-height/2),w:n.w+6,h:Math.max(n.h+6,height)});}
    draw.lanes.forEach(l=>boxes.push({x:l.x-2,y:l.y-2,w:l.w+4,h:l.h+4}));
    draw.edges.forEach(e=>boxes.push(edgeGeometry(doc,e).bounds));
    if(!boxes.length)return{x:0,y:0,w:480,h:320};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    return{x,y,w:Math.max(1,...boxes.map(b=>b.x+b.w-x)),h:Math.max(1,...boxes.map(b=>b.y+b.h-y))};
  }
  function alignmentSnap(doc,selectedIds,delta,{scale=1,tolerance=6,viewport=null}={}) {
    const nodes=Array.isArray(doc?.nodes)?doc.nodes:[], groups=Array.isArray(doc?.groups)?doc.groups:[], raw=Array.isArray(selectedIds)?selectedIds.map(String):[], chosen=new Set(raw);let changed=true;
    while(changed){changed=false;for(const group of groups)if(group?.memberIds?.some(id=>chosen.has(String(id)))||chosen.has(String(group.id)))for(const id of group.memberIds||[])if(!chosen.has(String(id))){chosen.add(String(id));changed=true;}}
    const selected=nodes.filter(n=>chosen.has(String(n.id))),targets=nodes.filter(n=>!chosen.has(String(n.id)));if(!selected.length)return{dx:Number.isFinite(delta?.dx)?delta.dx:0,dy:Number.isFinite(delta?.dy)?delta.dy:0,guides:[]};
    const boxes=selected.map(n=>({x:n.x,y:n.y,r:n.x+n.w,b:n.y+n.h}));
    const box={x:Math.min(...boxes.map(b=>b.x)),y:Math.min(...boxes.map(b=>b.y)),r:Math.max(...boxes.map(b=>b.r)),b:Math.max(...boxes.map(b=>b.b))};
    const safeScale=Math.min(4,Math.max(.02,Number.isFinite(scale)&&scale>0?scale:1)),worldTolerance=Math.max(0,Number.isFinite(tolerance)?tolerance:6)/safeScale,dx=Number.isFinite(delta?.dx)?delta.dx:0,dy=Number.isFinite(delta?.dy)?delta.dy:0;
    const visible=targets.filter(n=>{const v=viewport;if(!v)return true;return n.x+n.w>=v.x&&n.x<=v.x+v.w&&n.y+n.h>=v.y&&n.y<=v.y+v.h;});
    const pick=(axis)=>{const moving=axis==='x'?[box.x,(box.x+box.r)/2,box.r]:[box.y,(box.y+box.b)/2,box.b],best=[];for(const target of visible){const anchors=axis==='x'?[target.x,target.x+target.w/2,target.x+target.w]:[target.y,target.y+target.h/2,target.y+target.h];for(let mi=0;mi<3;mi++)for(let ti=0;ti<3;ti++){const needed=anchors[ti]-(moving[mi]+(axis==='x'?dx:dy)),distance=Math.abs(needed);if(distance<=worldTolerance+1e-9)best.push({needed,value:anchors[ti],target,anchor:ti,moving:mi,distance});}}if(!best.length)return null;best.sort((a,b)=>a.distance-b.distance||(a.anchor===1? -1:0)-(b.anchor===1? -1:0)||String(a.target.id).localeCompare(String(b.target.id))||a.anchor-b.anchor||a.moving-b.moving);return best[0];};
    const gx=pick('x'),gy=pick('y'),sx=dx+(gx?.needed||0),sy=dy+(gy?.needed||0),guide=(axis,hit)=>{if(!hit)return null;const start=axis==='x'?box.y+sy:box.x+sx,end=axis==='x'?box.b+sy:box.r+sx,ts=axis==='x'?hit.target.y:hit.target.x,te=axis==='x'?hit.target.y+hit.target.h:hit.target.x+hit.target.w;return{axis,value:hit.value,start:Math.min(start,ts)-8/safeScale,end:Math.max(end,te)+8/safeScale,targetIds:[String(hit.target.id)]};};return{dx:sx,dy:sy,guides:[guide('x',gx),guide('y',gy)].filter(Boolean)};
  }
  function svgDocument(doc,{padding=32,transparent=false,idPrefix='diagram',selectedIds=null}={}) {
    const p=Output.padding(padding),b=documentBounds(doc,{selectedIds}),x=b.x-p.left,y=b.y-p.top,w=b.w+p.left+p.right,h=b.h+p.top+p.bottom;
    const selected=exportSelection(doc,selectedIds),description=`${selected.nodes.length}個の図形と${selected.edges.length}本の接続線。${selected.lanes.length?selected.lanes.map(l=>l.title).join('、')+'の担当領域。':''}`;
    return `<svg xmlns="http://www.w3.org/2000/svg" width="${num(w)}" height="${num(h)}" viewBox="${num(x)} ${num(y)} ${num(w)} ${num(h)}" role="img" aria-labelledby="${escapeXML(idPrefix)}-title ${escapeXML(idPrefix)}-description"><title id="${escapeXML(idPrefix)}-title">${escapeXML(doc.title||'図')}</title><desc id="${escapeXML(idPrefix)}-description">${escapeXML(description)}</desc>${transparent?'':`<rect x="${num(x)}" y="${num(y)}" width="${num(w)}" height="${num(h)}" fill="#ffffff"/>`}${sceneMarkup(doc,{interactive:false,idPrefix,selectedIds})}</svg>`;
  }
  function learningOverlay(doc,{selectedIds=[],trace=null,scale=1}={}) {
    const nodes=Array.isArray(doc?.nodes)?doc.nodes:[], edges=Array.isArray(doc?.edges)?doc.edges:[], lanes=Array.isArray(doc?.lanes)?doc.lanes:[];
    const safeScale=Number.isFinite(scale)&&scale>0?scale:1, strokeWidth=num(2/safeScale), thinWidth=num(1.5/safeScale), fontSize=num(12/safeScale);
    const selected=new Set((Array.isArray(selectedIds)?selectedIds:[]).map(String));
    const nodeById=new Map(nodes.map(n=>[String(n.id),n])), edgeById=new Map(edges.map(e=>[String(e.id),e])), laneById=new Map(lanes.map(l=>[String(l.id),l]));
    const finiteBox=(b)=>b&&[b.x,b.y,b.w,b.h].every(Number.isFinite)?b:null;
    const union=(boxes,pad=0)=>{const valid=boxes.map(finiteBox).filter(Boolean);if(!valid.length)return null;const x=Math.min(...valid.map(b=>b.x))-pad,y=Math.min(...valid.map(b=>b.y))-pad,r=Math.max(...valid.map(b=>b.x+b.w))+pad,t=Math.max(...valid.map(b=>b.y+b.h))+pad;return{x,y,w:Math.max(1,r-x),h:Math.max(1,t-y)};};
    const nodeBox=n=>({x:num(n.x),y:num(n.y),w:Math.max(1,num(n.w)),h:Math.max(1,num(n.h))});
    const memberBox=id=>{const key=String(id);if(nodeById.has(key))return nodeBox(nodeById.get(key));if(edgeById.has(key))return edgeGeometry(doc,edgeById.get(key)).bounds;if(laneById.has(key)){const l=laneById.get(key);return{x:num(l.x),y:num(l.y),w:Math.max(1,num(l.w)),h:Math.max(1,num(l.h))};}return null;};
    const tokenCounts=new Map(), currentIds=Array.isArray(trace?.current)?trace.current.map(String):[];currentIds.forEach(id=>tokenCounts.set(id,(tokenCounts.get(id)||0)+1));
    const visitedNodes=new Set(Array.isArray(trace?.visitedNodes)?trace.visitedNodes.map(String):[]), visitedEdges=new Set(Array.isArray(trace?.visitedEdges)?trace.visitedEdges.map(String):[]);
    const parts=['<g class="diagram-learning-overlay" pointer-events="none" aria-hidden="true" style="--learning-accent:var(--accent);--learning-panel:var(--panel);--learning-text:var(--text)">'];
    const vars='style="--learning-accent:var(--accent);--learning-panel:var(--panel);--learning-text:var(--text)"';
    const lock=(x,y,id,label)=>`<g class="diagram-learning-lock" transform="translate(${num(x)} ${num(y)}) scale(${num(1/safeScale)})"><title>${escapeXML('固定')}</title><g aria-label="${escapeXML(label||'固定')}" fill="var(--learning-panel)" stroke="var(--learning-accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"><rect x="-5" y="-1" width="10" height="8" rx="1.5"/><path d="M-3 -1V-4a3 3 0 0 1 6 0v3" fill="none"/></g></g>`;
    nodes.forEach(n=>{if(n.locked)parts.push(lock(n.x+n.w-9,n.y+9,n.id,`固定: ${String(n.text||n.kind||n.id)}`));});
    edges.forEach(e=>{if(e.locked){const g=edgeGeometry(doc,e);parts.push(lock(g.handle.x,g.handle.y,String(e.id),`固定: ${String(e.label?.text||'接続線')}`));}});
    lanes.forEach(l=>{if(l.locked)parts.push(lock(l.x+l.w-9,l.y+16,l.id,`固定: ${String(l.title||l.id)}`));});
    edges.filter(e=>visitedEdges.has(String(e.id))).forEach(e=>{const g=edgeGeometry(doc,e);parts.push(`<path class="diagram-learning-trace-edge" d="${escapeXML(g.path)}" fill="none" stroke="var(--learning-accent)" stroke-width="5" stroke-linecap="round" stroke-opacity=".82" vector-effect="non-scaling-stroke"/>`);});
    nodes.filter(n=>visitedNodes.has(String(n.id))).forEach(n=>{const x=n.x+n.w-7,y=n.y+7;parts.push(`<circle class="diagram-learning-trace-node" cx="${num(x)}" cy="${num(y)}" r="5" fill="var(--learning-panel)" stroke="var(--learning-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><path d="M${num(x-2.5)} ${num(y)}l2 2 3.5 -4" fill="none" stroke="var(--learning-text)" stroke-width="1.5" vector-effect="non-scaling-stroke"/>`);});
    [...new Set(currentIds)].filter(id=>nodeById.has(id)).forEach((id,i)=>{const n=nodeById.get(id),count=tokenCounts.get(id),badgeW=(count>1?48:34)/safeScale,badgeH=18/safeScale,badgeX=n.x+n.w/2-badgeW/2,badgeY=n.y-26/safeScale;parts.push(`<rect class="diagram-learning-current-outline" x="${num(n.x-4)}" y="${num(n.y-4)}" width="${num(n.w+8)}" height="${num(n.h+8)}" rx="7" fill="none" stroke="var(--learning-accent)" stroke-width="3" vector-effect="non-scaling-stroke"/><path class="diagram-learning-current-line" d="M${num(n.x+n.w/2)} ${num(n.y-4)}L${num(n.x+n.w/2)} ${num(badgeY+badgeH)}" fill="none" stroke="var(--learning-accent)" stroke-width="2" vector-effect="non-scaling-stroke"/><rect x="${num(badgeX)}" y="${num(badgeY)}" width="${num(badgeW)}" height="${num(badgeH)}" rx="4" fill="var(--learning-panel)" stroke="var(--learning-accent)" stroke-width="1.5" vector-effect="non-scaling-stroke"/><text class="diagram-learning-current" x="${num(n.x+n.w/2)}" y="${num(badgeY+12/safeScale)}" text-anchor="middle" fill="var(--learning-text)" font-size="${fontSize}" font-family="Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif" font-weight="700">${escapeXML('現在')}${count>1?` ×${num(count)}`:''}</text>`);});
    (Array.isArray(doc?.groups)?doc.groups:[]).forEach(group=>{const members=Array.isArray(group?.memberIds)?group.memberIds:[],isSelected=members.some(id=>selected.has(String(id)));if(!isSelected)return;const box=union(members.map(memberBox),8);if(!box)return;const label='グループ',labelH=16/safeScale;parts.push(`<g class="diagram-learning-group" data-group="${escapeXML(group?.id??'')}" ${vars}><rect x="${num(box.x)}" y="${num(box.y)}" width="${num(box.w)}" height="${num(box.h)}" fill="none" stroke="var(--learning-accent)" stroke-width="2" stroke-dasharray="${num(7/safeScale)} ${num(5/safeScale)}" rx="4" vector-effect="non-scaling-stroke"/><rect x="${num(box.x+4/safeScale)}" y="${num(box.y+2/safeScale)}" width="${num(Math.max(24,textWidth(label,fontSize)+8/safeScale))}" height="${num(labelH)}" fill="var(--learning-panel)" fill-opacity=".94"/><text x="${num(box.x+8/safeScale)}" y="${num(box.y+labelH-2/safeScale)}" fill="var(--learning-text)" font-size="${fontSize}" font-family="Arial, 'Hiragino Sans', 'Yu Gothic', sans-serif">${escapeXML(label)}</text></g>`);});
    parts.push('</g>');return parts.join('');
  }
  return Object.freeze({escapeXML,wrapText,fitNode,nodeMarkup,sceneMarkup,edgeGeometry,waypointGeometry,insertWaypoint,splitWaypoints,documentBounds,svgDocument,learningOverlay,alignmentSnap,exportSelection,sidePoint,endpointSide,connectionsOnSide,connectionOffsets,nearestOffset,snapEndpoint});
});
