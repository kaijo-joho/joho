// Point-only registration. No images, answers, accounts, storage or network.
const primary = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
export function annualEdition(layout) {
  const i=layout?.identity,a=layout?.annualEdition;
  return a?.schema==='worksheet-annual-capture/1'&&i?.subject==='INFO1'&&i.year===2026&&i.worksheetId==='dr43';
}
export function mapPoint(m,p) {
  const z=m[6]*p.x+m[7]*p.y+1;
  if(!Number.isFinite(z)||Math.abs(z)<1e-8)throw Error('ANNUAL_SINGULAR');
  return {x:(m[0]*p.x+m[1]*p.y+m[2])/z,y:(m[3]*p.x+m[4]*p.y+m[5])/z};
}
function solve(a) {
  for(let k=0;k<8;k++){
    let best=k;for(let i=k+1;i<8;i++)if(Math.abs(a[i][k])>Math.abs(a[best][k]))best=i;
    [a[k],a[best]]=[a[best],a[k]];if(Math.abs(a[k][k])<1e-10)throw Error('ANNUAL_SINGULAR');
    const d=a[k][k];for(let j=k;j<9;j++)a[k][j]/=d;
    for(let i=0;i<8;i++)if(i!==k){const f=a[i][k];for(let j=k;j<9;j++)a[i][j]-=f*a[k][j];}
  }
  return a.map(r=>r[8]);
}
export function fitProjective(from,to) {
  if(from.length!==to.length||from.length<4)throw Error('ANNUAL_POINTS');
  const fx=Math.max(1,...from.map(p=>Math.abs(p.x))),fy=Math.max(1,...from.map(p=>Math.abs(p.y))),tx=Math.max(1,...to.map(p=>Math.abs(p.x))),ty=Math.max(1,...to.map(p=>Math.abs(p.y)));
  const a=Array.from({length:8},()=>new Array(9).fill(0));
  from.forEach((p,i)=>{const x=p.x/fx,y=p.y/fy,u=to[i].x/tx,v=to[i].y/ty;
    for(const r of [[x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]])for(let k=0;k<8;k++)for(let j=0;j<9;j++)a[k][j]+=r[k]*r[j];
  });
  const m=solve(a);return [m[0]*tx/fx,m[1]*tx/fy,m[2]*tx,m[3]*ty/fx,m[4]*ty/fy,m[5]*ty,m[6]/fx,m[7]/fy,1];
}
export function fitAffine(from,to) {
  if(from.length!==to.length||from.length<3)throw Error('ANNUAL_POINTS');
  const origin=from[0],scale=Math.max(1,...from.map(p=>Math.hypot(p.x-origin.x,p.y-origin.y)));
  const solveAxis=axis=>{
    const a=Array.from({length:3},()=>new Array(4).fill(0));
    from.forEach((p,i)=>{const r=[(p.x-origin.x)/scale,(p.y-origin.y)/scale,1];for(let j=0;j<3;j++){for(let k=0;k<3;k++)a[j][k]+=r[j]*r[k];a[j][3]+=r[j]*to[i][axis];}});
    for(let k=0;k<3;k++){
      let pivot=k;for(let i=k+1;i<3;i++)if(Math.abs(a[i][k])>Math.abs(a[pivot][k]))pivot=i;
      [a[k],a[pivot]]=[a[pivot],a[k]];if(Math.abs(a[k][k])<1e-9)throw Error('ANNUAL_SINGULAR');
      const d=a[k][k];for(let j=k;j<4;j++)a[k][j]/=d;
      for(let i=0;i<3;i++)if(i!==k){const f=a[i][k];for(let j=k;j<4;j++)a[i][j]-=f*a[k][j];}
    }
    const [x,y,z]=a.map(r=>r[3]);return[x/scale,y/scale,z-x*origin.x/scale-y*origin.y/scale];
  };
  return [...solveAxis('x'),...solveAxis('y'),0,0,1];
}
const cross=(a,b,c)=>(b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);
function hull(points) {
  const q=points.slice().sort((a,b)=>a.x-b.x||a.y-b.y),lo=[],hi=[];
  for(const p of q){while(lo.length>1&&cross(lo.at(-2),lo.at(-1),p)<=0)lo.pop();lo.push(p);}
  for(const p of q.reverse()){while(hi.length>1&&cross(hi.at(-2),hi.at(-1),p)<=0)hi.pop();hi.push(p);}
  return lo.slice(0,-1).concat(hi.slice(0,-1));
}
function area(q){return Math.abs(q.reduce((s,p,i)=>{const n=q[(i+1)%q.length];return s+p.x*n.y-p.y*n.x;},0))/2;}
function support(matches,c) {
  const q=matches.map(m=>m.expected),xs=q.map(p=>p.x),ys=q.map(p=>p.y);
  return matches.length>=6&&area(hull(q))/(c.page.widthMm*c.page.heightMm)>=.25&&Math.max(...xs)-Math.min(...xs)>c.page.widthMm*.6&&Math.max(...ys)-Math.min(...ys)>c.page.heightMm*.6;
}
function matchesAt(observed,c,toMm,searchRadiusMm=3) {
  const matches=[],scale=c.scale||1;
  for(const [key,m]of Object.entries(c.markers)){
    const expected=m.center.mm,size=m.mm.width,near=[];
    for(const [index,p]of observed.entries()){
      const actual=mapPoint(toMm,p),distance=Math.hypot(actual.x-expected.x,actual.y-expected.y);
      if(distance>searchRadiusMm*scale||!Array.isArray(p.polygon)||p.polygon.length!==4)continue;
      const poly=p.polygon.map(v=>mapPoint(toMm,v)),lengths=poly.map((v,i)=>Math.hypot(v.x-poly[(i+1)%4].x,v.y-poly[(i+1)%4].y));
      if(Math.min(...lengths)<size*.70||Math.max(...lengths)>size*1.30)continue;
      const turns=poly.map((v,i)=>cross(v,poly[(i+1)%4],poly[(i+2)%4]));
      if(!turns.every(v=>v>0)&&!turns.every(v=>v<0)||area(poly)<size*size*.65||area(poly)>size*size*1.40||Math.max(...lengths)/Math.min(...lengths)>1.30)continue;
      if(poly.some((v,i)=>{const a=poly[(i+3)%4],b=poly[(i+1)%4];return Math.abs((a.x-v.x)*(b.x-v.x)+(a.y-v.y)*(b.y-v.y))/(lengths[(i+3)%4]*lengths[i])>.35;}))continue;
      near.push({key,expected,source:{x:p.x,y:p.y},index,distance});
    }
    near.sort((a,b)=>a.distance-b.distance);
    if(near.length&&(!near[1]||near[1].distance-near[0].distance>.35*scale))matches.push(near[0]);
  }
  return new Set(matches.map(m=>m.index)).size===matches.length?matches:[];
}
function consensus(matches,c,requiredKeys=[]) {
  if(!support(matches,c))return null;
  const limit=.45,score=sample=>{
    try{
      let inverse=fitProjective(sample.map(m=>m.source),sample.map(m=>m.expected));
      const selected=matches.filter(m=>{const p=mapPoint(inverse,m.source);return Math.hypot(p.x-m.expected.x,p.y-m.expected.y)<=limit;});
      if(!support(selected,c)||requiredKeys.some(key=>!selected.some(m=>m.key===key)))return null;
      inverse=fitProjective(selected.map(m=>m.source),selected.map(m=>m.expected));
      const residual=Math.max(...selected.map(m=>{const p=mapPoint(inverse,m.source);return Math.hypot(p.x-m.expected.x,p.y-m.expected.y);}));
      if(residual>limit)return null;
      return {selected,residual,toMm:inverse,toSource:fitProjective(selected.map(m=>m.expected),selected.map(m=>m.source))};
    }catch{return null;}
  };
  let best=score(matches);if(best?.selected.length===matches.length)return best;
  for(let a=0;a<matches.length-3;a++)for(let b=a+1;b<matches.length-2;b++)for(let d=b+1;d<matches.length-1;d++)for(let e=d+1;e<matches.length;e++){
    const fit=score([matches[a],matches[b],matches[d],matches[e]]);
    if(fit&&(!best||fit.selected.length>best.selected.length||fit.selected.length===best.selected.length&&fit.residual<best.residual))best=fit;
  }
  return best;
}
export function annualMarkerFits(observed,c,seeds,{seedSearchRadiusMm=3,anchorNearQr=false}={}) {
  if(!annualEdition(c))return [];
  const result=[],seenMatches=new Set();
  for(const seed of seeds){
    let fit;
    try{
      // A small QR baseline can amplify initial position error at the foot.
      // Only the seed search may be broader; consensus and the observation
      // pass after fitting retain the same 0.45 mm / 3 mm checks.
      const toMm=fitProjective(seed.source,seed.target),matches=matchesAt(observed,c,toMm,Math.max(3,Math.min(6,seedSearchRadiusMm)));
      const signature=matches.map(m=>m.key+':'+m.index).sort().join('|');
      if(seenMatches.has(signature))continue;seenMatches.add(signature);
      const q=c.qr.region.mm,center={x:q.x+q.width/2,y:q.y+q.height/2};
      // A measured QR gives an independent local anchor. When its nearest
      // square was actually observed, don't discard that observation in favor
      // of a larger group at the opposite end and extrapolate into the header.
      const anchor=anchorNearQr?matches.slice().sort((a,b)=>Math.hypot(a.expected.x-center.x,a.expected.y-center.y)-Math.hypot(b.expected.x-center.x,b.expected.y-center.y))[0]:null;
      const required=anchor&&Math.hypot(anchor.expected.x-center.x,anchor.expected.y-center.y)<25*c.scale?[anchor.key]:[];
      fit=consensus(matches,c,required);if(!fit)continue;
      // A second observation pass admits nearby squares only after the fit.
      const refined=consensus(matchesAt(observed,c,fit.toMm),c,required);if(refined)fit=refined;
    }catch{continue;}
    const points=primary.map(k=>mapPoint(fit.toSource,c.markers[k].center.mm));
    if(result.some(r=>points.every((p,i)=>Math.hypot(p.x-r.points[i].x,p.y-r.points[i].y)<1)))continue;
    result.push({...fit,points,observedCount:fit.selected.length,coverageFraction:area(hull(fit.selected.map(m=>m.expected)))/(c.page.widthMm*c.page.heightMm)});
  }
  return result.sort((a,b)=>b.observedCount-a.observedCount||a.residual-b.residual).slice(0,4);
}
