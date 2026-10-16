import {parseWorksheetQr, provisionalLimits, hashBlob} from './10_model.mjs?v=20261016-ocr1';
import {recognizePrintedLabel, makeLabelViews} from './14_label_ocr.mjs?v=20261016-ocr1';
const layoutCache = new Map();
const rowNames = ['class', 'tens', 'ones'];
const decodedQrFacts = new WeakMap();
export async function layouts() {
  if (!layoutCache.size) {
    for (const name of ['b5', 'b5-back', 'a4', 'a4-back']) {
      const r = await fetch(new URL('./layout/' + name + '.json',import.meta.url));
      if (!r.ok) throw Error('LAYOUT_NOT_AVAILABLE');
      layoutCache.set(name, await r.json());
    }
  }
  return [...layoutCache.values()];
}
export function canvas(width, height) {const c = document.createElement('canvas'); c.width = width; c.height = height; return c;}
function percentile(values, p) {
  const hist = new Uint32Array(256); for (const v of values) hist[Math.round(v)]++;
  const target = values.length * p; let total = 0;
  for (let i = 0; i < 256; i++) {total += hist[i]; if (total >= target) return i;}
  return 255;
}
export async function loadImage(blob, turns = 0) {
  if (!(blob instanceof Blob) || blob.size > provisionalLimits.maxInputBytes) throw Error('INPUT_TOO_LARGE');
  const head = new Uint8Array(await blob.slice(0, 64).arrayBuffer());
  const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  const brands=String.fromCharCode(...head.slice(4)),heic=brands.startsWith('ftyp')&&/heic|heix|hevc|hevx|mif1/.test(brands);
  if (!png && !jpeg && !heic) throw Error('INPUT_FORMAT_UNSUPPORTED');
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url;
    try {await image.decode();} catch {throw Error(heic?'HEIC_BROWSER_UNSUPPORTED':'INPUT_DECODE_FAILED');}
    if (image.naturalWidth * image.naturalHeight > provisionalLimits.maxPixels) throw Error('INPUT_TOO_MANY_PIXELS');
    // Modern Image decoding applies EXIF orientation; output PNG has no orientation dependency.
    // Accept phone originals (including 24/48 MP), then bound all pixel processing.
    const scale = Math.min(1, provisionalLimits.maxSourceEdge / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale), odd = turns % 2;
    const c = canvas(odd ? h : w, odd ? w : h), ctx = c.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(turns * Math.PI / 2); ctx.drawImage(image, -w / 2, -h / 2, w, h);
    return c;
  } finally {image.removeAttribute('src');URL.revokeObjectURL(url);}
}
function grayscale(c) {
  const rgba = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round((rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3);
  return gray;
}
const markerCache = new WeakMap(), markerSetCache = new WeakMap(), paperCache = new WeakMap();
function polygonArea(points) {return Math.abs(points.reduce((sum,p,i)=>{const q=points[(i+1)%points.length];return sum+p.x*q.y-p.y*q.x;},0))/2;}
function cross(a,b,c) {return (b.x-a.x)*(c.y-a.y)-(b.y-a.y)*(c.x-a.x);}
function convexHull(points) {
  points.sort((a,b)=>a.x-b.x||a.y-b.y);const lower=[],upper=[];
  for(const p of points){while(lower.length>1&&cross(lower.at(-2),lower.at(-1),p)<=0)lower.pop();lower.push(p);}
  for(let i=points.length-1;i>=0;i--){const p=points[i];while(upper.length>1&&cross(upper.at(-2),upper.at(-1),p)<=0)upper.pop();upper.push(p);}
  return lower.slice(0,-1).concat(upper.slice(0,-1));
}
function squareCenter(points) {
  const hull=convexHull(points),poly=hull.slice();if(poly.length<4)return null;
  const perimeter=hull.reduce((s,p,i)=>s+Math.hypot(p.x-hull[(i+1)%hull.length].x,p.y-hull[(i+1)%hull.length].y),0);
  while(poly.length>4){
    let least=Infinity,index=-1;
    poly.forEach((p,i)=>{const a=poly[(i+poly.length-1)%poly.length],b=poly[(i+1)%poly.length],d=Math.abs(cross(a,b,p))/Math.max(1,Math.hypot(b.x-a.x,b.y-a.y));if(d<least){least=d;index=i;}});
    if(least>perimeter*.035)return null;poly.splice(index,1);
  }
  if(polygonArea(poly)<polygonArea(hull)*.88)return null;
  const [p,q,r,s]=poly,ax=r.x-p.x,ay=r.y-p.y,bx=s.x-q.x,by=s.y-q.y,den=ax*by-ay*bx;
  if(Math.abs(den)<1)return null;
  const t=((q.x-p.x)*by-(q.y-p.y)*bx)/den;
  return {x:p.x+t*ax,y:p.y+t*ay,polygon:poly};
}
function markerComponents(source) {
  if(markerCache.has(source))return markerCache.get(source);
  const ratio=Math.min(1,1600/Math.max(source.width,source.height)),small=canvas(Math.round(source.width*ratio),Math.round(source.height*ratio));
  small.getContext('2d').drawImage(source,0,0,small.width,small.height);
  const gray=grayscale(small),w=small.width,h=small.height,total=w*h,hist=new Uint32Array(256);
  for(const v of gray)hist[v]++;
  let sum=0;for(let i=0;i<256;i++)sum+=i*hist[i];
  let weight=0,partial=0,best=0,threshold=100;
  for(let t=0;t<255;t++){weight+=hist[t];partial+=t*hist[t];const remaining=total-weight;if(!weight||!remaining)continue;const variance=weight*remaining*(partial/weight-(sum-partial)/remaining)**2;if(variance>best){best=variance;threshold=t;}}
  threshold=Math.min(180,Math.max(20,threshold+2));
  const stride=w+1,integral=new Float64Array((w+1)*(h+1)),radius=Math.max(18,Math.round(Math.min(w,h)*.035));
  for(let y=0;y<h;y++){let row=0;for(let x=0;x<w;x++){row+=gray[y*w+x];integral[(y+1)*stride+x+1]=integral[y*stride+x+1]+row;}}
  const masks=[new Uint8Array(total),new Uint8Array(total)];
  for(let y=0;y<h;y++)for(let x=0;x<w;x++){
    const i=y*w+x,x0=Math.max(0,x-radius),x1=Math.min(w,x+radius+1),y0=Math.max(0,y-radius),y1=Math.min(h,y+radius+1);
    const mean=(integral[y1*stride+x1]-integral[y0*stride+x1]-integral[y1*stride+x0]+integral[y0*stride+x0])/((x1-x0)*(y1-y0));
    masks[0][i]=gray[i]<threshold?1:0;masks[1][i]=gray[i]<Math.max(8,mean*.7)?1:0;
  }
  const found=[],queue=new Int32Array(total);
  for(const mask of masks)for(let start=0;start<total;start++){
    if(mask[start]!==1)continue;
    mask[start]=2;queue[0]=start;let count=1,minX=w,maxX=0,minY=h,maxY=0;
    for(let n=0;n<count;n++){
      const i=queue[n],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]===1){mask[j]=2;queue[count++]=j;}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1;
    if(count<Math.max(16,total*.000025)||count>total*.004||bw/bh<.15||bw/bh>6.7||minX<2||minY<2||maxX>w-3||maxY>h-3)continue;
    const left=new Int32Array(bh).fill(w),right=new Int32Array(bh).fill(-1);
    for(let n=0;n<count;n++){const i=queue[n],x=i%w,y=Math.floor(i/w)-minY;left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
    const boundary=[];for(let y=0;y<bh;y++)if(right[y]>=0){boundary.push({x:left[y],y:y+minY},{x:right[y],y:y+minY});}
    const hull=convexHull(boundary),area=polygonArea(hull),fill=count/(area+bw+bh);
    if(fill<.8)continue;
    const center=squareCenter(boundary);if(!center)continue;
    const candidate={x:center.x/ratio,y:center.y/ratio,area:area/(ratio*ratio),size:Math.sqrt(area)/ratio,fill,polygon:center.polygon.map(p=>({x:p.x/ratio,y:p.y/ratio}))};
    const old=found.find(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y)<Math.min(p.size,candidate.size)*.6);
    if(!old)found.push(candidate);else if(candidate.fill>old.fill)Object.assign(old,candidate);
  }
  markerCache.set(source,found);return found;
}
function markerSets(source) {
  if(markerSetCache.has(source))return markerSetCache.get(source);
  const w=source.width,h=source.height,all=markerComponents(source),groups=[],paper=paperQuads(source);
  for(const [right,bottom] of [[false,false],[true,false],[true,true],[false,true]]){
    const nearby=all.filter(p=>(right?p.x>w*.35:p.x<w*.65)&&(bottom?p.y>h*.35:p.y<h*.65));
    nearby.sort((a,b)=>(Math.hypot(a.x/w-Number(right),a.y/h-Number(bottom))+(1-a.fill))-(Math.hypot(b.x/w-Number(right),b.y/h-Number(bottom))+(1-b.fill)));
    groups.push(nearby.slice(0,8));
  }
  const quads=[];
  for(const a of groups[0])for(const b of groups[1])for(const c of groups[2])for(const d of groups[3]){
    const p=[a,b,c,d];if(new Set(p).size!==4||p.some((v,i)=>cross(v,p[(i+1)%4],p[(i+2)%4])<=0))continue;
    const area=polygonArea(p);if(area<w*h*.2||Math.min(b.x-a.x,c.x-d.x)<w*.18||Math.min(d.y-a.y,c.y-b.y)<h*.18)continue;
    const ratios=p.map(v=>v.area/area),average=ratios.reduce((s,v)=>s+v,0)/4;
    if(Math.min(...ratios)<.00009||Math.max(...ratios)>.0009||Math.max(...ratios)/Math.min(...ratios)>4)continue;
    // Test the four shapes in page coordinates, not just their hull area.
    // Dense characters can have the same area as a square. Three intact 3.5 mm
    // squares must agree; the fourth may be a clipped printed remnant.
    const squareFit=[[168.5,243.5],[243.5,168.5]].some(([width,height])=>{
      const mm=homography(p,[{x:0,y:0},{x:width,y:0},{x:width,y:height},{x:0,y:height}]);
      const sides=p.map(m=>{const q=m.polygon.map(v=>transformPoint(mm,v));return q.map((v,i)=>Math.hypot(v.x-q[(i+1)%4].x,v.y-q[(i+1)%4].y));});
      return sides.every(v=>Math.min(...v)>.45&&Math.max(...v)<5.3)&&sides.filter(v=>Math.min(...v)>2.35&&Math.max(...v)<4.8).length>=3;
    });
    if(!squareFit)continue;
    const edgeError=paper.length?Math.min(...paper.map(q=>{
      const unit=homography(q,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]);
      const distances=p.map((v,i)=>{const t=transformPoint(unit,v);return Math.hypot(t.x-([0,1,1,0][i]),t.y-([0,0,1,1][i]));});
      return Math.max(...distances)<.14?distances.reduce((sum,v)=>sum+v,0)/4:Infinity;
    })):0;
    if(!Number.isFinite(edgeError))continue;
    const score=Math.abs(Math.log(average/.00030))+ratios.reduce((s,v)=>s+Math.abs(Math.log(v/average)),0)/4+(1-area/(w*h))*.2+edgeError*8;
    quads.push({points:p.map(v=>({x:v.x,y:v.y})),score});
  }
  const sets=quads.sort((a,b)=>a.score-b.score).slice(0,6);markerSetCache.set(source,sets);return sets;
}
export function detectMarkers(source) {
  const set=markerSets(source)[0];if(set)return set.points;
  // These are only starting positions for manual adjustment. Paper edges alone
  // never authorize correction: processImage still verifies the printed marks/QR.
  const paper=paperQuads(source)[0];if(!paper)return null;
  const unit=homography(paper,[{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}]),back=homography([{x:0,y:0},{x:1,y:0},{x:1,y:1},{x:0,y:1}],paper),all=markerComponents(source);
  return [[.037,.026],[.963,.026],[.963,.974],[.037,.974]].map(([x,y])=>{
    const nearby=all.map(m=>({m,p:transformPoint(unit,m)})).map(v=>({...v,d:Math.hypot(v.p.x-x,v.p.y-y)})).filter(v=>v.d<.045).sort((a,b)=>a.d-b.d);
    return nearby.length?{x:nearby[0].m.x,y:nearby[0].m.y}:transformPoint(back,{x,y});
  });
}
export function snapMarker(source,point) {
  const guides=detectMarkers(source)||[],edge=Math.min(source.width,source.height);
  const nearby=markerComponents(source).filter(p=>guides.some(g=>Math.hypot(p.x-g.x,p.y-g.y)<p.size*.6)).map(p=>({...p,d:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.d<Math.min(edge*.015,Math.max(p.size*.85,edge*.012))).sort((a,b)=>a.d-b.d);
  if(!nearby.length||nearby[1]&&nearby[1].d-nearby[0].d<nearby[0].size*.35)return {...point};
  return {x:nearby[0].x,y:nearby[0].y};
}
// Paper edges provide a second, independent registration cue when printing clips a square.
// No text, QR modules or OMR marks are reconstructed.
function paperQuads(source) {
  if(paperCache.has(source))return paperCache.get(source);
  const ratio=Math.min(1,1000/Math.max(source.width,source.height)),image=canvas(Math.round(source.width*ratio),Math.round(source.height*ratio));
  image.getContext('2d').drawImage(source,0,0,image.width,image.height);
  const gray=grayscale(image),w=image.width,h=image.height,total=w*h,paper=percentile(gray,.9),quads=[],queue=new Int32Array(total);
  for(const fraction of [.78,.65,.88]){
    const mask=Uint8Array.from(gray,v=>v>Math.max(70,paper*fraction)?1:0);
    for(let start=0;start<total;start++){
      if(mask[start]!==1)continue;mask[start]=2;queue[0]=start;let count=1;
      for(let n=0;n<count;n++){
        const i=queue[n],x=i%w,y=Math.floor(i/w);
        for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]===1){mask[j]=2;queue[count++]=j;}
      }
      if(count<total*.22||count>total*.96)continue;
      const left=new Int32Array(h).fill(w),right=new Int32Array(h).fill(-1);
      for(let n=0;n<count;n++){const i=queue[n],y=Math.floor(i/w),x=i%w;left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
      const boundary=[];for(let y=0;y<h;y++)if(right[y]>=0)boundary.push({x:left[y],y},{x:right[y],y});
      const shape=squareCenter(boundary);if(!shape)continue;
      let points=shape.polygon,area=polygonArea(points);
      if(area<count*.92||area>count*1.3||points.some(p=>p.x<2||p.y<2||p.x>w-3||p.y>h-3))continue;
      const first=points.reduce((best,p,i)=>p.x+p.y<points[best].x+points[best].y?i:best,0);
      points=points.slice(first).concat(points.slice(0,first)).map(p=>({x:p.x/ratio,y:p.y/ratio}));
      if(!quads.some(q=>q.every((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)<6/ratio)))quads.push(points);
    }
  }
  paperCache.set(source,quads);return quads;
}
function fitHomography(from,to,weights) {
  const fw=Math.max(1,...from.map(p=>p.x)),fh=Math.max(1,...from.map(p=>p.y)),tw=Math.max(1,...to.map(p=>p.x)),th=Math.max(1,...to.map(p=>p.y));
  const normal=Array.from({length:8},()=>new Array(9).fill(0));
  from.forEach((p,i)=>{
    const x=p.x/fw,y=p.y/fh,u=to[i].x/tw,v=to[i].y/th;
    for(const row of [[x,y,1,0,0,0,-u*x,-u*y,u],[0,0,0,x,y,1,-v*x,-v*y,v]])for(let a=0;a<8;a++)for(let b=0;b<=8;b++)normal[a][b]+=row[a]*row[b]*weights[i];
  });
  const m=solve(normal);
  return [m[0]*tw/fw,m[1]*tw/fh,m[2]*tw,m[3]*th/fw,m[4]*th/fh,m[5]*th,m[6]/fw,m[7]/fh,1];
}
function homography(from, to) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const {x, y} = from[i], u = to[i].x, v = to[i].y;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  return solve(rows).concat(1);
}
function solve(rows) {
  const n=rows.length;
  for (let p = 0; p < n; p++) {
    let m = p; for (let r = p + 1; r < n; r++) if (Math.abs(rows[r][p]) > Math.abs(rows[m][p])) m = r;
    [rows[p], rows[m]] = [rows[m], rows[p]];
    if (Math.abs(rows[p][p]) < 1e-9) throw Error('INVALID_CORNERS');
    const f = rows[p][p]; for (let j = p; j <= n; j++) rows[p][j] /= f;
    for (let r = 0; r < n; r++) if (r !== p) {const t = rows[r][p]; for (let j = p; j <= n; j++) rows[r][j] -= t * rows[p][j];}
  }
  return rows.map(r => r[n]);
}
export function warp(source, sourcePoints, targetPoints, width, height) {
  const matrix = homography(targetPoints, sourcePoints);
  const input = source.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, source.width, source.height).data;
  const out = canvas(width, height), ctx = out.getContext('2d', {willReadFrequently: true}), image = ctx.createImageData(width, height), d = image.data;
  d.fill(255);
  for (let y = 0, k = 0; y < height; y++) for (let x = 0; x < width; x++, k += 4) {
    const denominator = matrix[6] * x + matrix[7] * y + 1;
    const xx = (matrix[0] * x + matrix[1] * y + matrix[2]) / denominator, yy = (matrix[3] * x + matrix[4] * y + matrix[5]) / denominator;
    if (xx < 0 || yy < 0 || xx >= source.width - 1 || yy >= source.height - 1) continue;
    const ix = Math.floor(xx), iy = Math.floor(yy), fx = xx - ix, fy = yy - iy, a = (iy * source.width + ix) * 4;
    for (let channel = 0; channel < 3; channel++) d[k + channel] = input[a + channel] * (1 - fx) * (1 - fy) + input[a + 4 + channel] * fx * (1 - fy)
      + input[a + source.width * 4 + channel] * (1 - fx) * fy + input[a + (source.width + 1) * 4 + channel] * fx * fy;
  }
  ctx.putImageData(image, 0, 0); return out;
}
function targetMarkers(c, width, height) {
  return ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(key => ({
    x: c.markers[key].center.mm.x / c.page.widthMm * width, y: c.markers[key].center.mm.y / c.page.heightMm * height
  }));
}
function tone(image, brightness, contrast, automatic = true) {
  const ctx = image.getContext('2d', {willReadFrequently: true}), id = ctx.getImageData(0, 0, image.width, image.height);
  let illumination=null,black=0,cols=0,rows=0,tile=0;
  if(automatic){
    const gray=grayscale(image);black=Math.min(48,percentile(gray,.01));tile=Math.max(48,Math.round(image.width/12));cols=Math.ceil(image.width/tile);rows=Math.ceil(image.height/tile);illumination=[];
    const floor=Math.max(90,percentile(gray,.9)*.5);
    for(let y=0;y<rows;y++)for(let x=0;x<cols;x++){
      const values=[];for(let yy=y*tile;yy<Math.min(image.height,(y+1)*tile);yy+=2)for(let xx=x*tile;xx<Math.min(image.width,(x+1)*tile);xx+=2)values.push(gray[yy*image.width+xx]);
      illumination.push(Math.max(floor,percentile(values,.93)));
    }
  }
  const factor = Math.max(.4, 1 + contrast / 100);
  for (let y=0,i=0;y<image.height;y++)for(let x=0;x<image.width;x++,i+=4){
    let gain=1;
    if(illumination){
      const gx=Math.max(0,Math.min(cols-1,x/tile-.5)),gy=Math.max(0,Math.min(rows-1,y/tile-.5)),x0=Math.floor(gx),y0=Math.floor(gy),x1=Math.min(cols-1,x0+1),y1=Math.min(rows-1,y0+1),fx=gx-x0,fy=gy-y0;
      const white=illumination[y0*cols+x0]*(1-fx)*(1-fy)+illumination[y0*cols+x1]*fx*(1-fy)+illumination[y1*cols+x0]*(1-fx)*fy+illumination[y1*cols+x1]*fx*fy;
      gain=Math.min(2.5,244/Math.max(40,white-black));
    }
    for(let k=0;k<3;k++){const value=automatic?(id.data[i+k]-black)*gain:id.data[i+k];id.data[i+k]=(value-128)*factor+128+brightness*2.55;}
  }
  ctx.putImageData(id, 0, 0);
}
function transformPoint(matrix,p) {const d=matrix[6]*p.x+matrix[7]*p.y+1;return {x:(matrix[0]*p.x+matrix[1]*p.y+matrix[2])/d,y:(matrix[3]*p.x+matrix[4]*p.y+matrix[5])/d};}
function qrCrop(source,points,c,options) {
  // Sample the original QR region directly. A whole-page 1000 px preview loses small modules.
  const r=c.qr.region.mm,margin=5*c.scale,density=10,left=Math.max(0,r.x-margin),top=Math.max(0,r.y-margin);
  const width=Math.ceil((r.width+margin*2)*density),height=Math.ceil((r.height+margin*2)*density);
  const target=targetMarkers(c,c.page.widthMm*density,c.page.heightMm*density).map(p=>({x:p.x-left*density,y:p.y-top*density}));
  const image=warp(source,points,target,width,height);tone(image,options.brightness||0,options.contrast||0,options.autoTone!==false);
  return {image,left,top,density,source};
}
function printedQrGeometry(region,c,decoded) {
  // Measure the photographed nested finder squares. Decoders can infer a noisy
  // fourth QR corner even when the payload is correct; do not use it as a ruler.
  const {image,left,top,density}=region,gray=grayscale(image),w=image.width,h=image.height;
  const modules=decoded.version*4+17,r=c.qr.region.mm,pitch=r.width/(modules+8);
  const centers=['topLeftFinderPattern','topRightFinderPattern','bottomLeftFinderPattern'].map(k=>decoded.location[k]);
  if(centers.some(p=>!p||!Number.isFinite(p.x)||!Number.isFinite(p.y)))return null;
  const lo=percentile(gray,.04),hi=percentile(gray,.96);if(hi-lo<40)return null;
  const threshold=(lo+hi)/2,mask=Uint8Array.from(gray,v=>v<threshold?1:0),queue=new Int32Array(w*h),patterns=[];
  for(let start=0;start<mask.length;start++){
    if(mask[start]!==1)continue;mask[start]=2;queue[0]=start;let count=1,minX=w,maxX=0,minY=h,maxY=0;
    for(let n=0;n<count;n++){
      const i=queue[n],x=i%w,y=Math.floor(i/w);minX=Math.min(minX,x);maxX=Math.max(maxX,x);minY=Math.min(minY,y);maxY=Math.max(maxY,y);
      for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]===1){mask[j]=2;queue[count++]=j;}
    }
    const bw=maxX-minX+1,bh=maxY-minY+1,size=7*pitch*density;
    if(bw<size*.65||bh<size*.65||bw>size*1.4||bh>size*1.4||minX<1||minY<1||maxX>w-2||maxY>h-2)continue;
    const edgeLeft=new Int32Array(bh).fill(w),edgeRight=new Int32Array(bh).fill(-1);
    for(let n=0;n<count;n++){const i=queue[n],y=Math.floor(i/w)-minY,x=i%w;edgeLeft[y]=Math.min(edgeLeft[y],x);edgeRight[y]=Math.max(edgeRight[y],x);}
    const boundary=[];for(let y=0;y<bh;y++)if(edgeRight[y]>=0)boundary.push({x:edgeLeft[y],y:y+minY},{x:edgeRight[y],y:y+minY});
    const shape=squareCenter(boundary);if(!shape)continue;
    let poly=shape.polygon;const first=poly.reduce((best,p,i)=>p.x+p.y<poly[best].x+poly[best].y?i:best,0);
    poly=poly.slice(first).concat(poly.slice(0,first));
    const matrix=homography([{x:0,y:0},{x:7,y:0},{x:7,y:7},{x:0,y:7}],poly);
    let correct=0;
    for(let y=0;y<7;y++)for(let x=0;x<7;x++){
      const p=transformPoint(matrix,{x:x+.5,y:y+.5}),dark=gray[Math.round(p.y)*w+Math.round(p.x)]<threshold;
      const expected=x===0||x===6||y===0||y===6||x>=2&&x<=4&&y>=2&&y<=4;
      if(dark===expected)correct++;
    }
    if(correct>=47)patterns.push({center:{x:shape.x,y:shape.y},poly});
  }
  const expected=[],actual=[],used=new Set();
  for(const [i,center] of centers.entries()){
    const nearby=patterns.map((p,index)=>({p,index,d:Math.hypot(p.center.x-center.x,p.center.y-center.y)})).filter(v=>!used.has(v.index)&&v.d<pitch*density*1.5).sort((a,b)=>a.d-b.d);
    if(!nearby.length||nearby[1]&&nearby[1].d-nearby[0].d<pitch*density*.5)return null;
    used.add(nearby[0].index);
    const x=i===1?modules-3:4,y=i===2?modules-3:4;
    expected.push(...[{x,y},{x:x+7,y},{x:x+7,y:y+7},{x,y:y+7}].map(p=>({x:r.x+p.x*pitch,y:r.y+p.y*pitch})));
    actual.push(...nearby[0].p.poly.map(p=>({x:p.x/density+left,y:p.y/density+top})));
  }
  return {expected,actual,error:Math.max(...actual.map((p,i)=>Math.hypot(p.x-expected[i].x,p.y-expected[i].y)))};
}

function readQr(region,c) {
  const {image,left,top,density}=region,ctx=image.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,image.width,image.height);
  const remember=decoded=>{
    if(decoded&&typeof decoded.data==='string'&&decoded.data.length&&region.source){let set=decodedQrFacts.get(region.source);if(!set){set=new Set();decodedQrFacts.set(region.source,set);}set.add(decoded.data);}
    return decoded;
  };
  let decoded=remember(window.jsQR(data.data,image.width,image.height,{inversionAttempts:'attemptBoth'})),preprocessing='original';
  if(!decoded){
    const gray=grayscale(image),lo=percentile(gray,.04),hi=percentile(gray,.96);
    if(hi-lo>30){for(let i=0;i<gray.length;i++){const v=(gray[i]-lo)*255/(hi-lo);data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=v;}decoded=remember(window.jsQR(data.data,image.width,image.height,{inversionAttempts:'attemptBoth'}));if(decoded)preprocessing='contrast';}
  }
  if(!decoded){
    const r=c.qr.region.mm,margin=2*c.scale,x=Math.max(0,Math.round((r.x-margin-left)*density)),y=Math.max(0,Math.round((r.y-margin-top)*density));
    const w=Math.min(image.width-x,Math.round((r.width+2*margin)*density)),h=Math.min(image.height-y,Math.round((r.height+2*margin)*density));
    const crop=canvas(w,h);crop.getContext('2d').drawImage(image,x,y,w,h,0,0,w,h);
    const gray=grayscale(crop),dark=gray.filter(v=>v<128).length/gray.length;
    if(dark>=.08&&dark<=.65){
      const support=[];
      for(const [factor,smoothing]of [[1,false],[2,false],[3,true]]){
        const scaled=canvas(w*factor,h*factor),sc=scaled.getContext('2d',{willReadFrequently:true});sc.imageSmoothingEnabled=smoothing;sc.drawImage(crop,0,0,scaled.width,scaled.height);
        const pixels=sc.getImageData(0,0,scaled.width,scaled.height),found=remember(window.jsQR(pixels.data,scaled.width,scaled.height,{inversionAttempts:'attemptBoth'}));
        if(!found)continue;
        const location=Object.fromEntries(Object.entries(found.location).map(([key,p])=>[key,p&&typeof p.x==='number'?{x:p.x/factor+x,y:p.y/factor+y}:p]));
        support.push({...found,location});
      }
      if(support.length>=2&&new Set(support.map(v=>v.data)).size===1){decoded=support[0];preprocessing='tight-crop-scale-consensus';}
    }
  }
  if(!decoded)return null;
  let qr;try{qr=parseWorksheetQr(decoded.data);}catch{return null;}
  if(qr.side!==c.identity.side)return null;
  const r=c.qr.region.mm,modules=decoded.version*4+17,quiet=r.width*4/(modules+8);
  const expected=[{x:r.x+quiet,y:r.y+quiet},{x:r.x+r.width-quiet,y:r.y+quiet},{x:r.x+r.width-quiet,y:r.y+r.height-quiet},{x:r.x+quiet,y:r.y+r.height-quiet}];
  const actual=['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].map(key=>({x:decoded.location[key].x/density+left,y:decoded.location[key].y/density+top}));
  const error=Math.max(...actual.map((p,i)=>Math.hypot(p.x-expected[i].x,p.y-expected[i].y)));
  const measured=printedQrGeometry(region,c,decoded);
  return {qr,error:measured?.error??error,decodedError:error,modules,actual,expected,measured,preprocessing};
}
function recoverRegistration(source,points,c,found,options={}) {
  const physical=targetMarkers(c,c.page.widthMm,c.page.heightMm),toMm=homography(points,physical),toSource=homography(physical,points),observed=markerComponents(source),matches=[];
  for(const target of physical){
    const nearby=observed.map(m=>({m,point:transformPoint(toMm,m)})).map(v=>({...v,d:Math.hypot(v.point.x-target.x,v.point.y-target.y)})).filter(v=>v.d<5.5*c.scale).sort((a,b)=>a.d-b.d);
    if(!nearby.length||nearby[1]&&nearby[1].d-nearby[0].d<.5*c.scale)return null;
    const {m}=nearby[0],poly=m.polygon.map(p=>transformPoint(toMm,p));
    const lengths=poly.map((p,i)=>Math.hypot(p.x-poly[(i+1)%4].x,p.y-poly[(i+1)%4].y)),side=3.5*c.scale;
    matches.push({m,complete:Math.min(...lengths)>side*.74&&Math.max(...lengths)<side*1.28,lengths});
  }
  // At least three intact printed squares AND a visible remnant are mandatory.
  if(new Set(matches.map(v=>v.m)).size!==4||matches.filter(v=>v.complete).length!==3)return null;
  const from=[],to=[];
  matches.forEach((v,i)=>{if(v.complete){from.push(physical[i]);to.push(v.m);}});
  const registration=found.measured||found;
  registration.expected.forEach((p,i)=>{from.push(p);to.push(transformPoint(toSource,registration.actual[i]));});
  const damaged=matches.findIndex(v=>!v.complete),remnant=matches[damaged],poly=remnant.m.polygon.map(p=>transformPoint(toMm,p)),lengths=remnant.lengths;
  const axis=(lengths[0]+lengths[2])<(lengths[1]+lengths[3])?0:1,short=(lengths[axis]+lengths[axis+2])/2,long=(lengths[(axis+1)%4]+lengths[(axis+3)%4])/2;
  if(short>long*.74||short<long*.18)return null;
  const a=poly[axis],b=poly[(axis+1)%4],size=Math.hypot(b.x-a.x,b.y-a.y),unit={x:(b.x-a.x)/size,y:(b.y-a.y)/size},center=transformPoint(toMm,remnant.m);
  // Test both possible missing edges. The QR must decide, rather than guessing an answer.
  // Prefer the original total QR weight and 0.55 mm page fit. The second fit
  // uses all 12 measured vertices and requires the independent printed-circle
  // layout proof before applying the existing bounded local header correction.
  const attempts=found.measured?[{weight:1/3,limit:.55},{weight:1,limit:1.25}]:[{weight:1,limit:.55}];
  for(const attempt of attempts){
    const weights=from.map((_,i)=>i<3?4:attempt.weight),fits=[];
    for(const sign of [-1,1]){
      const inferred=transformPoint(toSource,{x:center.x+sign*unit.x*(long-short)/2,y:center.y+sign*unit.y*(long-short)/2});
      const src=from.concat(physical[damaged]),dst=to.concat(inferred),fit=fitHomography(src,dst,weights.concat(4)),newPoints=physical.map(p=>transformPoint(fit,p)),inverse=homography(newPoints,physical);
      const errors=dst.map((p,i)=>{const q=transformPoint(inverse,p);return Math.hypot(q.x-src[i].x,q.y-src[i].y);}),error=Math.max(...errors);
      if(error>attempt.limit*c.scale||errors.slice(0,3).some(v=>v>.55*c.scale)||errors.at(-1)>.55*c.scale||!validCorners(newPoints,source))continue;
      const p=physical[damaged],remainder=remnant.m.polygon.map(v=>transformPoint(inverse,v)),half=1.75*c.scale;
      if(remainder.some(v=>Math.abs(v.x-p.x)>half+.65*c.scale||Math.abs(v.y-p.y)>half+.65*c.scale)||polygonArea(remainder)<(3.5*c.scale)**2*.18)continue;
      const headerProof=found.measured?provePrintedHeader(source,newPoints,c,options):null;
      if(found.measured&&!headerProof)continue;
      fits.push({points:newPoints,error:Math.max(error,headerProof?.qrPositionError||0,headerProof?.headerResidual||0),score:error,limit:headerProof?1.25*c.scale:.8,headerProof,restored:[damaged]});
    }
    fits.sort((a,b)=>a.score-b.score);
    if(fits[0]&&(fits.length===1||fits[1].score-fits[0].score>.06*c.scale))return fits[0];
  }
  return null;
}
function completeMarkerSet(source,points,c) {
  const mm=homography(points,targetMarkers(c,c.page.widthMm,c.page.heightMm)),observed=markerComponents(source),side=3.5*c.scale;
  return points.every(point=>{
    const nearby=observed.filter(m=>Math.hypot(m.x-point.x,m.y-point.y)<Math.max(3,m.size*.65));
    return nearby.some(m=>{const p=m.polygon.map(v=>transformPoint(mm,v)),lengths=p.map((v,i)=>Math.hypot(v.x-p[(i+1)%4].x,v.y-p[(i+1)%4].y));return Math.min(...lengths)>side*.74&&Math.max(...lengths)<side*1.28;});
  });
}
function pixelAt(data,w,h,x,y,channel=0,channels=1) {
  x=Math.max(0,Math.min(w-1.001,x));y=Math.max(0,Math.min(h-1.001,y));const xx=Math.floor(x),yy=Math.floor(y),fx=x-xx,fy=y-yy,i=(yy*w+xx)*channels;
  return data[i+channel]*(1-fx)*(1-fy)+data[i+channels+channel]*fx*(1-fy)+data[i+w*channels+channel]*(1-fx)*fy+data[i+(w+1)*channels+channel]*fx*fy;
}
function remapRegion(image,c,box,sourceAt) {
  const ctx=image.getContext('2d'),input=ctx.getImageData(0,0,image.width,image.height),sx=image.width/c.page.widthMm,sy=image.height/c.page.heightMm;
  const x0=Math.floor(box.x*sx),y0=Math.floor(box.y*sy),w=Math.ceil(box.width*sx),h=Math.ceil(box.height*sy),out=ctx.createImageData(w,h);
  for(let y=0,i=0;y<h;y++)for(let x=0;x<w;x++,i+=4){
    const p={x:(x+x0)/sx,y:(y+y0)/sy},q=sourceAt(p),fade=Math.max(0,Math.min(1,(p.x-box.x)/c.scale,(box.x+box.width-p.x)/c.scale,(p.y-box.y)/c.scale,(box.y+box.height-p.y)/c.scale));
    const xx=(p.x+(q.x-p.x)*fade)*sx,yy=(p.y+(q.y-p.y)*fade)*sy;
    for(let k=0;k<3;k++)out.data[i+k]=pixelAt(input.data,image.width,image.height,xx,yy,k,4);out.data[i+3]=255;
  }
  ctx.putImageData(out,x0,y0);
}
function sharpenPrintedQr(image,c,payload) {
  const r=c.qr.region.mm,ctx=image.getContext('2d'),x=Math.round(r.x/c.page.widthMm*image.width),y=Math.round(r.y/c.page.heightMm*image.height),w=Math.round((r.x+r.width)/c.page.widthMm*image.width)-x,h=Math.round((r.y+r.height)/c.page.heightMm*image.height)-y;
  const original=ctx.getImageData(x,y,w,h),out=ctx.createImageData(w,h),gray=new Uint8Array(w*h),hist=new Uint32Array(256);
  let sum=0;for(let i=0;i<gray.length;i++){gray[i]=Math.round((original.data[i*4]+original.data[i*4+1]+original.data[i*4+2])/3);hist[gray[i]]++;sum+=gray[i];}
  let weight=0,partial=0,best=0,threshold=128;
  for(let t=0;t<255;t++){weight+=hist[t];partial+=t*hist[t];const rest=gray.length-weight;if(!weight||!rest)continue;const score=weight*rest*(partial/weight-(sum-partial)/rest)**2;if(score>best){best=score;threshold=t;}}
  if(percentile(gray,.9)-percentile(gray,.1)<60)return;
  for(let i=0;i<gray.length;i++){const value=gray[i]>threshold?255:0;out.data[i*4]=out.data[i*4+1]=out.data[i*4+2]=value;out.data[i*4+3]=255;}
  ctx.putImageData(out,x,y);
  const decoded=readQr(qrCrop(image,targetMarkers(c,image.width,image.height),c,{autoTone:false}),c);
  if(!decoded||decoded.qr.payload!==payload)ctx.putImageData(original,x,y);
}
function printedHeaderModel(image,c,fullHeight=image.height) {
  // Use the outlines of many EMPTY printed circles, never the selected answers,
  // to correct small header skew/print drift left after the page homography.
  const gray=grayscale(image),sx=image.width/c.page.widthMm,sy=fullHeight/c.page.heightMm,points=[];
  const directions=Array.from({length:24},(_,i)=>({x:Math.cos(i*Math.PI/12),y:Math.sin(i*Math.PI/12)}));
  const sample=(x,y)=>pixelAt(gray,image.width,image.height,x*sx,y*sy);
  for(const row of rowNames)for(const mark of c.omr[row]){
    const expected=mark.center.mm;let best=null;
    for(let dy=-1.2*c.scale;dy<=1.201*c.scale;dy+=.12*c.scale)for(let dx=-1.2*c.scale;dx<=1.201*c.scale;dx+=.12*c.scale){
      const x=expected.x+dx,y=expected.y+dy;if(sample(x,y)<165)continue;
      for(const radius of [.9,1,1.1].map(v=>v*mark.radiusMm)){
        let ring=0,inner=0,outer=0;
        for(const d of directions){ring+=sample(x+d.x*radius,y+d.y*radius);inner+=sample(x+d.x*radius*.64,y+d.y*radius*.64);outer+=sample(x+d.x*radius*1.3,y+d.y*radius*1.3);}
        ring/=24;inner/=24;outer/=24;const score=(inner+outer)/2-ring;
        if(inner<outer*.85||score<32)continue;
        if(!best||score>best.score)best={expected,actual:{x,y},row,score};
      }
    }
    if(best&&Math.abs(best.actual.x-best.expected.x)<1.18*c.scale&&Math.abs(best.actual.y-best.expected.y)<1.18*c.scale)points.push(best);
  }
  function fit(data){
    const origin=c.omr.class[0].center.mm,normal=Array.from({length:3},()=>new Array(4).fill(0)),other=Array.from({length:3},()=>new Array(4).fill(0));
    for(const p of data){const row=[p.expected.x-origin.x,p.expected.y-origin.y,1],dx=p.actual.x-p.expected.x,dy=p.actual.y-p.expected.y;for(let a=0;a<3;a++){for(let b=0;b<3;b++)normal[a][b]+=row[a]*row[b];normal[a][3]+=row[a]*dx;other[a][3]+=row[a]*dy;}}
    for(let a=0;a<3;a++)for(let b=0;b<3;b++)other[a][b]=normal[a][b];const x=solve(normal),y=solve(other);
    return p=>({x:p.x+x[0]*(p.x-origin.x)+x[1]*(p.y-origin.y)+x[2],y:p.y+y[0]*(p.x-origin.x)+y[1]*(p.y-origin.y)+y[2]});
  }
  function enough(data){return data.length>=18&&rowNames.every(row=>data.filter(p=>p.row===row).length>=5)&&new Set(data.map(p=>p.expected.x)).size>=8;}
  if(enough(points)){
    let model=fit(points),stable=points.filter(p=>{const q=model(p.expected);return Math.hypot(q.x-p.actual.x,q.y-p.actual.y)<.25*c.scale;});
    if(enough(stable)){
      model=fit(stable);const maxOffset=Math.max(...stable.map(p=>{const q=model(p.expected);return Math.hypot(q.x-p.expected.x,q.y-p.expected.y);}));
      if(maxOffset<1.25*c.scale){
        const p=model({x:0,y:0}),x=model({x:1,y:0}),y=model({x:0,y:1});
        const a=x.x-p.x,b=y.x-p.x,d=x.y-p.y,e=y.y-p.y,trace=a*a+b*b+d*d+e*e,det=(a*e-b*d)**2;
        const root=Math.sqrt(Math.max(0,trace*trace-4*det));
        return {model,maxOffset,maxResidual:Math.max(...stable.map(p=>{const q=model(p.expected);return Math.hypot(q.x-p.actual.x,q.y-p.actual.y);})),
          count:stable.length,minScale:Math.sqrt(Math.max(0,(trace-root)/2)),maxScale:Math.sqrt((trace+root)/2)};
      }
    }
  }
  return null;
}
function qrHeaderResidual(found,calibration,c) {
  if(!found?.measured||!calibration)return null;
  const {model}=calibration,{expected,actual}=found.measured;
  if(expected.some(p=>{const q=model(p);return Math.hypot(q.x-p.x,q.y-p.y)>1.25*c.scale;}))return null;
  const error=Math.max(...actual.map((p,i)=>{const q=model(expected[i]);return Math.hypot(p.x-q.x,p.y-q.y);}));
  return error<=1.25*c.scale?error:null;
}
function provePrintedHeader(source,points,c,options) {
  const width=provisionalLimits.normalizedWidth,height=Math.round(width*c.page.heightMm/c.page.widthMm);
  const image=warp(source,points,targetMarkers(c,width,height),width,height);tone(image,options.brightness||0,options.contrast||0,options.autoTone!==false);
  const found=readQr(qrCrop(source,points,c,options),c);
  if(!found?.measured||found.error>1.25*c.scale)return null;
  const calibration=printedHeaderModel(image,c),headerResidual=qrHeaderResidual(found,calibration,c);
  if(headerResidual===null)return null;
  const matrix=fitHomography(found.measured.expected,found.measured.actual,new Array(12).fill(1));
  const error=Math.max(...found.measured.actual.map((p,i)=>{const q=transformPoint(matrix,found.measured.expected[i]);return Math.hypot(p.x-q.x,p.y-q.y);}));
  return error<=.45*c.scale?{patternResidual:error,headerResidual,qrPositionError:found.error,headerOffset:calibration.maxOffset}:null;
}
function alignPrintedHeader(image,c) {
  const calibration=printedHeaderModel(image,c);let aligned=false,qrConsistent=false;
  if(calibration&&calibration.maxOffset>.15*c.scale){
    const first=c.omr.class[0].center.mm,last=c.omr.ones.at(-1).center.mm;
    remapRegion(image,c,{x:first.x-4*c.scale,y:first.y-3.5*c.scale,width:last.x-first.x+8.5*c.scale,height:last.y-first.y+7*c.scale},calibration.model);aligned=true;
  }
  // A larger local correction requires agreement with the EMPTY printed circles.
  const found=readQr(qrCrop(image,targetMarkers(c,image.width,image.height),c,{autoTone:false}),c);
  if(found){
    const r=c.qr.region.mm,box={x:r.x-2*c.scale,y:r.y-2*c.scale,width:r.width+4*c.scale,height:r.height+4*c.scale};
    const ctx=image.getContext('2d'),sx=image.width/c.page.widthMm,sy=image.height/c.page.heightMm;
    const x=Math.floor(box.x*sx),y=Math.floor(box.y*sy),w=Math.ceil(box.width*sx),h=Math.ceil(box.height*sy),original=ctx.getImageData(x,y,w,h);
    const methods=[{name:'original',matrix:null}];
    const decodedAllowed=found.decodedError<=.8*c.scale;
    const measuredAllowed=found.measured&&(found.error<=.8*c.scale||found.error<=1.25*c.scale&&qrHeaderResidual(found,calibration,c)!==null);
    if(decodedAllowed)methods.push({name:'decoded',matrix:homography(found.expected,found.actual)});
    if(measuredAllowed)methods.push({name:'printed',matrix:fitHomography(found.measured.expected,found.measured.actual,new Array(12).fill(1))});
    if(decodedAllowed&&measuredAllowed)methods.push({name:'combined',matrix:fitHomography(found.measured.expected.concat(found.expected),found.measured.actual.concat(found.actual),new Array(16).fill(1))});
    let best=null;
    for(const method of methods){
      ctx.putImageData(original,x,y);
      if(method.matrix)remapRegion(image,c,box,p=>transformPoint(method.matrix,p));
      sharpenPrintedQr(image,c,found.qr.payload);
      const after=readQr(qrCrop(image,targetMarkers(c,image.width,image.height),c,{autoTone:false}),c);
      if(!after||after.qr.payload!==found.qr.payload)continue;
      const score=Math.max(after.decodedError,after.measured?.error??after.decodedError);
      if(!best||score<best.score)best={score,pixels:ctx.getImageData(x,y,w,h),moved:!!method.matrix};
    }
    ctx.putImageData(best?.pixels||original,x,y);if(best?.moved)aligned=true;
    qrConsistent=!!best&&best.score<=.8*c.scale;
  }
  return {aligned,qrConsistent};
}
function markSamples(gray, image, c, mark) {
  const cx = mark.center.mm.x / c.page.widthMm * image.width, cy = mark.center.mm.y / c.page.heightMm * image.height;
  const rx = mark.sampleRadiusMm / c.page.widthMm * image.width, ry = mark.sampleRadiusMm / c.page.heightMm * image.height;
  const inside = [], surrounding = [];
  for (let y = Math.floor(cy - ry * 2.1); y <= cy + ry * 2.1; y++) for (let x = Math.floor(cx - rx * 2.1); x <= cx + rx * 2.1; x++) {
    if (x < 0 || y < 0 || x >= image.width || y >= image.height) continue;
    const r = Math.pow((x - cx) / rx, 2) + Math.pow((y - cy) / ry, 2), v = gray[y * image.width + x];
    if (r <= 1) inside.push(v); if (r > 2.8 && r < 4.3) surrounding.push(v);
  }
  return {inside, paper: percentile(surrounding, .9), radius: Math.min(rx, ry)};
}
export function readOmr(image, c) {
  const gray = grayscale(image), rows = {}, issues = [];
  for (const name of rowNames) {
    const samples = c.omr[name].map(mark => markSamples(gray, image, c, mark));
    let selected = null, stable = 0, previous = null;
    const weak = samples.map(s => s.inside.filter(v => v < s.paper * .9).length / s.inside.length);
    for (let t = .65; t <= .875 + .0001; t += .025) {
      const ratios = samples.map(s => s.inside.filter(v => v < s.paper * t).length / s.inside.length);
      const order = ratios.map((v, digit) => ({v, digit})).sort((a, b) => b.v - a.v), a = order[0], b = order[1];
      const othersWeak = Math.max(...weak.filter((_, i) => i !== a.digit));
      const ok = a.v >= .55 && b.v <= .18 && a.v - b.v >= .4 && othersWeak <= .28 && samples.every(s => s.paper >= 90 && s.radius >= 4);
      if (ok && previous === a.digit) stable++; else stable = ok ? 1 : 0;
      previous = ok ? a.digit : null;
      if (stable >= 2) {selected = a.digit; break;}
    }
    const blank = Math.max(...weak) < .08;
    rows[name] = {digit: selected, status: selected === null ? 'REVIEW' : 'OK', blank};
    if (selected === null) issues.push(blank ? 'マークが空欄です。表裏とも3行すべてを塗ってください。' : '複数マーク・薄い塗り・消し跡等で読めません。紙のマークを修正して撮り直してください。');
  }
  return {rows, issues, classNumber: rows.class.digit, number: rows.tens.digit === null || rows.ones.digit === null ? null : rows.tens.digit * 10 + rows.ones.digit};
}
function quality(image, c) {
  const gray = grayscale(image), roi = Math.min(image.height - 2, Math.ceil(40 / c.page.heightMm * image.height));
  let sum = 0, count = 0;
  for (let y = 2; y < roi; y += 2) for (let x = 2; x < image.width - 2; x += 2) {
    const i = y * image.width + x, lap = gray[i - 1] + gray[i + 1] + gray[i - image.width] + gray[i + image.width] - 4 * gray[i];
    sum += lap * lap; count++;
  }
  return {headerSharpness: sum / Math.max(1, count), paperBrightness: percentile(gray, .9)};
}
async function exportCorrected(image) {
  let blob=await new Promise(resolve=>image.toBlob(resolve,'image/png')),grayscaleExport=false;
  if(blob?.size>provisionalLimits.maxImageBytes){
    const ctx=image.getContext('2d'),id=ctx.getImageData(0,0,image.width,image.height);
    for(let i=0;i<id.data.length;i+=4){const gray=Math.round((id.data[i]+id.data[i+1]+id.data[i+2])/3);id.data[i]=id.data[i+1]=id.data[i+2]=gray;}
    ctx.putImageData(id,0,0);blob=await new Promise(resolve=>image.toBlob(resolve,'image/png'));grayscaleExport=true;
  }
  if(!blob||blob.size>provisionalLimits.maxImageBytes)throw Error('OUTPUT_TOO_LARGE');
  return {blob,grayscaleExport};
}
function validCorners(points,source) {
  return points.length===4&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<source.width&&p.y<source.height)&&new Set(points.map(p=>Math.round(p.x)+','+Math.round(p.y))).size===4&&points.every((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4])>0)&&polygonArea(points)>source.width*source.height*.15;
}
export async function processImage(blob, options = {}) {
  const began=performance.now(),source=await loadImage(blob,options.turns||0);
  const sets=options.corners?[{points:options.corners.map(p=>options.preciseCorners?{...p}:snapMarker(source,p))}]:markerSets(source);
  let corners=sets[0]?.points||(!options.corners?detectMarkers(source):null);
  if(Math.max(source.width,source.height)<900)return {source,corners,reading:{status:'REVIEW',reason:'SOURCE_TOO_SMALL',message:'画像が小さすぎてQRを確認できません。スクリーンショットや縮小画像ではなく、撮影した元の写真を選んでください。'}};
  if(options.corners&&!validCorners(corners,source))return {source,corners,reading:{status:'REVIEW',reason:'INVALID_CORNERS',message:'黒いマーカーを左上→右上→右下→左下の順に指定してください。紙の角ではなく、黒い■の中心です。'}};
  const candidates=[];
  const catalog=await layouts();
  for(const set of sets){
    if(!validCorners(set.points,source))continue;
    for(const c of catalog)for(let turn=0;turn<4;turn++){
      const points=set.points.slice(turn).concat(set.points.slice(0,turn)),found=readQr(qrCrop(source,points,c,options),c);
      if(found){
        if(completeMarkerSet(source,points,c))candidates.push({...found,c,points,corners:set.points});
        else if(!options.preciseCorners){
          const recovered=recoverRegistration(source,points,c,found,options);
          if(recovered){const refined=readQr(qrCrop(source,recovered.points,c,options),c);if(refined&&refined.qr.payload===found.qr.payload)candidates.push({...refined,error:Math.max(refined.error,recovered.error),limit:recovered.limit,c,points:recovered.points,corners:recovered.points,restored:recovered.restored});}
        }
      }
    }
    if(candidates.some(v=>v.error<=(v.limit??.8)))break;
  }
  if(!options.corners&&!candidates.some(v=>v.error<=(v.limit??.8))){
    for(const paper of paperQuads(source))for(const c of catalog)for(let turn=0;turn<4;turn++){
      const page=[{x:0,y:0},{x:c.page.widthMm,y:0},{x:c.page.widthMm,y:c.page.heightMm},{x:0,y:c.page.heightMm}],matrix=homography(page,paper.slice(turn).concat(paper.slice(0,turn)));
      const points=targetMarkers(c,c.page.widthMm,c.page.heightMm).map(p=>transformPoint(matrix,p));
      if(!validCorners(points,source))continue;
      const found=readQr(qrCrop(source,points,c,options),c);if(!found||found.error>4*c.scale)continue;
      const recovered=recoverRegistration(source,points,c,found,options);if(!recovered)continue;
      const refined=readQr(qrCrop(source,recovered.points,c,options),c);if(!refined||refined.qr.payload!==found.qr.payload)continue;
      candidates.push({...refined,error:Math.max(refined.error,recovered.error),limit:recovered.limit,c,points:recovered.points,corners:recovered.points,restored:recovered.restored});
    }
  }
  candidates.sort((a,b)=>a.error/a.c.scale-b.error/b.c.scale);
  const best=candidates[0],alternative=best&&candidates.find(v=>v.c.pageSize!==best.c.pageSize||v.qr.payload!==best.qr.payload);
  if(!best){
    const known=decodedQrFacts.get(source)?.size;
    return {source,corners,reading:{status:'REVIEW',reason:known?'QR_POSITION_MISMATCH':corners?'QR_UNREADABLE':'MARKERS_NOT_FOUND',message:known?'QRは検出されましたが、用紙との対応を確認できません。四隅の黒い■と正しい用紙かを確認してください。':corners?'WS識別QRを読み取れません。影・ピンぼけを避けて撮り直すか、「調整する」で四隅を確認してください。':'用紙の位置を確認できません。暗めの机の上で、用紙の四隅がすべて入るように撮影してください。'}};
  }
  if((decodedQrFacts.get(source)?.size||0)>1)return {source,corners,reading:{status:'REVIEW',reason:'QR_CONFLICT',message:'異なる内容のQRが検出されました。同じワークシートの表裏か確認してください。'}};
  corners=best.corners;
  if(best.error>(best.limit??.8)||alternative&&alternative.error/alternative.c.scale-best.error/best.c.scale<.1)return {source,corners,reading:{status:'REVIEW',reason:'QR_POSITION_MISMATCH',message:'QRは読めましたが、用紙と黒いマーカーの位置が合いません。紙の角ではなく四隅の黒い■の中心へ合わせてください。'}};
  const c=best.c,width=provisionalLimits.normalizedWidth,height=Math.round(width*c.page.heightMm/c.page.widthMm);
  const corrected=warp(source,best.points,targetMarkers(c,width,height),width,height);tone(corrected,options.brightness||0,options.contrast||0,options.autoTone!==false);
  const q=quality(corrected,c);
  const {aligned:headerAligned,qrConsistent}=alignPrintedHeader(corrected,c);
  const omr=readOmr(corrected,c),problems=omr.issues.slice();
  if(!qrConsistent)problems.push('補正後のQRの位置を確認できません。四隅を確認するか、撮り直してください。');
  const matrix=homography(targetMarkers(c,c.page.widthMm,c.page.heightMm),best.points),sourceQr=best.actual.map(p=>transformPoint(matrix,p));
  const modulePixels=Math.min(...sourceQr.map((p,i)=>Math.hypot(p.x-sourceQr[(i+1)%4].x,p.y-sourceQr[(i+1)%4].y)))/best.modules;
  if(modulePixels<3)problems.push('解像度が不足しています。用紙を大きく写して撮り直してください。');
  if(q.headerSharpness<25)problems.push('画像がぼけています。明るい場所でピントを合わせて撮り直してください。');
  if(q.paperBrightness<100)problems.push('画像が暗すぎます。明るさを調整するか、撮り直してください。');
  // After printed QR + three intact squares agree, standardize the four registration
  // guides, including the clipped one, to avoid another detector shifting the page.
  // Only their fixed, blank margin regions are replaced. The original is retained.
  if(best.restored){
    const ctx=corrected.getContext('2d');
    const keys=['topLeft','topRight','bottomRight','bottomLeft'];
    for(const key of keys){
      const r=c.markers[key].mm,sx=width/c.page.widthMm,sy=height/c.page.heightMm,pad=.8*c.scale;
      ctx.fillStyle='#fff';ctx.fillRect(Math.floor((r.x-pad)*sx),Math.floor((r.y-pad)*sy),Math.ceil((r.width+pad*2)*sx),Math.ceil((r.height+pad*2)*sy));
      ctx.fillStyle='#111';ctx.fillRect(Math.round(r.x*sx),Math.round(r.y*sy),Math.round(r.width*sx),Math.round(r.height*sy));
    }
  }
  const {blob:correctedBlob,grayscaleExport}=await exportCorrected(corrected);
  return {source,corners,correctedBlob,sha256:await hashBlob(correctedBlob),reading:{status:problems.length?'REVIEW':'OK',message:problems[0]||'',qr:best.qr,qrModules:best.modules,identitySource:'qr',classNumber:omr.classNumber,number:omr.number,rows:omr.rows,pageSize:c.pageSize,quality:q,autoTone:options.autoTone!==false,grayscaleExport,headerAligned,registration:best.restored?'QRと残る3点で欠けた■を補正':'四隅の■で補正',restoredMarkers:best.restored?.length||0,sourcePixelsPerModule:modulePixels,elapsedMs:Math.round(performance.now()-began),correctedBytes:correctedBlob.size}};
}

function mappedOmr(c,model,dx=0,dy=0) {
  const shifted=structuredClone(c);
  for(const marks of Object.values(shifted.omr))for(const mark of marks){const p=model(mark.center.mm);mark.center.mm={x:p.x+dx,y:p.y+dy};}
  return shifted;
}
export async function labelCrops(blob,source,markers,c,model,options) {
  const q=c.qr.region.mm,centre=q.x+q.width/2,top=q.y+q.height-1.2*c.scale;
  const matrix=homography(targetMarkers(c,c.page.widthMm,c.page.heightMm),markers);
  let points=[{x:centre-7*c.scale,y:top},{x:centre+7*c.scale,y:top},{x:centre+7*c.scale,y:top+7.2*c.scale},{x:centre-7*c.scale,y:top+7.2*c.scale}].map(model).map(p=>transformPoint(matrix,p));
  const w=Math.ceil(14*c.scale*20),h=Math.ceil(7.2*c.scale*20);
  // Crop only this small region from the decoded original, without a full-size
  // canvas. In particular, 24/48MP originals are not first reduced to the preview.
  const original=new Image(),url=URL.createObjectURL(blob);let crop;
  try{
    original.src=url;await original.decode();const turns=((options.turns||0)%4+4)%4;
    const rw=turns%2?source.height:source.width,rh=turns%2?source.width:source.height;
    points=points.map(p=>{
      const q=turns===0?p:turns===1?{x:p.y,y:rh-p.x}:turns===2?{x:rw-p.x,y:rh-p.y}:{x:rw-p.y,y:p.x};
      return {x:q.x*original.naturalWidth/rw,y:q.y*original.naturalHeight/rh};
    });
    const left=Math.max(0,Math.floor(Math.min(...points.map(p=>p.x)))),top=Math.max(0,Math.floor(Math.min(...points.map(p=>p.y))));
    const right=Math.min(original.naturalWidth,Math.ceil(Math.max(...points.map(p=>p.x)))),bottom=Math.min(original.naturalHeight,Math.ceil(Math.max(...points.map(p=>p.y))));
    if(right<=left||bottom<=top||(right-left)*(bottom-top)>2000000)throw Error('OCR_LABEL_UNREADABLE');
    const region=canvas(right-left,bottom-top);region.getContext('2d').drawImage(original,left,top,region.width,region.height,0,0,region.width,region.height);
    crop=warp(region,points.map(p=>({x:p.x-left,y:p.y-top})),[{x:0,y:0},{x:w,y:0},{x:w,y:h},{x:0,y:h}],w,h);
  }finally{original.removeAttribute('src');URL.revokeObjectURL(url);}
  tone(crop,options.brightness||0,options.contrast||0,options.autoTone!==false);
  return makeLabelViews(crop);
}
export async function processPairedImage(blob,anchor,options={}) {
  const began=performance.now(),a=anchor?.reading;
  if(a?.status!=='OK'||a.identityConfirmation||!anchor.sha256||![21,25,29,33].includes(a.qrModules)||rowNames.some(k=>a.rows?.[k]?.status!=='OK'))throw Error('PAIR_ANCHOR_REQUIRED');
  const identity=parseWorksheetQr(a.qr.payload);
  if(['subject','year','worksheetId','side'].some(k=>identity[k]!==a.qr[k]))throw Error('PAIR_ANCHOR_REQUIRED');
  const side=identity.side==='F'?'B':'F',c=(await layouts()).find(c=>c.pageSize===a.pageSize&&c.identity.side===side);
  if(!c)throw Error('PAIR_GEOMETRY_UNCONFIRMED');
  const source=options.sourceCanvas||await loadImage(blob,options.turns||0),width=provisionalLimits.normalizedWidth,height=Math.round(width*c.page.heightMm/c.page.widthMm);
  if(decodedQrFacts.get(source)?.size)throw Error('PAIR_QR_CONFLICT');
  const sets=options.preciseCorners&&options.corners?[{points:options.corners}]:markerSets(source),candidates=[];
  for(const set of sets){
    if(!validCorners(set.points,source))continue;
    for(let turn=0;turn<4;turn++){
      const points=set.points.slice(turn).concat(set.points.slice(0,turn));
      if(!completeMarkerSet(source,points,c))continue;
      const header=warp(source,points,targetMarkers(c,width,height),width,Math.ceil(45/c.page.heightMm*height));tone(header,options.brightness||0,options.contrast||0,options.autoTone!==false);
      let fit;try{fit=printedHeaderModel(header,c,height);}catch{continue;}
      if(!fit||fit.maxOffset>.6*c.scale||fit.maxResidual>.25*c.scale||fit.minScale<.97||fit.maxScale>1.03)continue;
      const matrix=homography(targetMarkers(c,c.page.widthMm,c.page.heightMm),points),radii=[];
      for(const marks of Object.values(c.omr))for(const mark of marks){
        const p=fit.model(mark.center.mm),r=mark.sampleRadiusMm,s=transformPoint(matrix,p);
        for(const q of [{x:p.x+r,y:p.y},{x:p.x,y:p.y+r}]){const t=transformPoint(matrix,q);radii.push(Math.hypot(t.x-s.x,t.y-s.y));}
      }
      const q=c.qr.region.mm,quiet=q.width*4/(a.qrModules+8),symbol=[{x:q.x+quiet,y:q.y+quiet},{x:q.x+q.width-quiet,y:q.y+quiet},{x:q.x+q.width-quiet,y:q.y+q.height-quiet},{x:q.x+quiet,y:q.y+q.height-quiet}].map(p=>transformPoint(matrix,fit.model(p)));
      const pitch=Math.min(...symbol.map((p,i)=>Math.hypot(p.x-symbol[(i+1)%4].x,p.y-symbol[(i+1)%4].y)))/a.qrModules;
      if(Math.min(...radii)<4||pitch<3)continue;
      if(!candidates.some(v=>v.points.every((p,i)=>Math.hypot(p.x-points[i].x,p.y-points[i].y)<2)))candidates.push({points,fit,pitch});
    }
  }
  if(candidates.length!==1)throw Error('PAIR_GEOMETRY_UNCONFIRMED');
  const {points,fit,pitch}=candidates[0],corrected=warp(source,points,targetMarkers(c,width,height),width,height);
  tone(corrected,options.brightness||0,options.contrast||0,options.autoTone!==false);
    const qrRegion=qrCrop(source,points,c,options).image,qrPixels=qrRegion.getContext('2d').getImageData(0,0,qrRegion.width,qrRegion.height);
  if(window.jsQR(qrPixels.data,qrRegion.width,qrRegion.height,{inversionAttempts:'attemptBoth'}))throw Error('PAIR_QR_CONFLICT');
  const coordinates=mappedOmr(c,fit.model),omr=readOmr(corrected,coordinates),q=quality(corrected,c);
  if(omr.issues.length)throw Error('PAIR_OMR_UNCONFIRMED');
  for(const [x,y]of[[-1,-1],[-1,0],[-1,1],[0,-1],[0,1],[1,-1],[1,0],[1,1]]){
    const other=readOmr(corrected,mappedOmr(c,fit.model,x*.1*c.scale,y*.1*c.scale));
    if(other.issues.length||other.classNumber!==omr.classNumber||other.number!==omr.number)throw Error('PAIR_OMR_UNCONFIRMED');
  }
  if(omr.classNumber!==a.classNumber||omr.number!==a.number)throw Error('PAIR_STUDENT_MISMATCH');
  if(q.headerSharpness<25||q.paperBrightness<100)throw Error('PAIR_IMAGE_QUALITY');
  const crops=await labelCrops(blob,source,points,c,fit.model,options);
  const ocr=await recognizePrintedLabel(crops);
  if(ocr.label.worksheetId!==identity.worksheetId||ocr.label.side!==side)throw Error('PAIR_LABEL_MISMATCH');
  const {blob:correctedBlob,grayscaleExport}=await exportCorrected(corrected);
  return {source,corners:points,correctedBlob,sha256:await hashBlob(correctedBlob),reading:{status:'OK',message:'反対面のQRと、この面の印字・組番号を照合しました。',
    qr:{subject:identity.subject,year:identity.year,worksheetId:identity.worksheetId,side,payload:null},identitySource:'paired-qr-printed-label-ocr',
    classNumber:omr.classNumber,number:omr.number,rows:omr.rows,pageSize:c.pageSize,quality:q,sourcePixelsPerModule:pitch,autoTone:options.autoTone!==false,grayscaleExport,
    identityConfirmation:{method:'paired-qr-printed-label-ocr/1',partnerQrDecoded:false,anchorPayload:identity.payload,anchorSha256:anchor.sha256,label:ocr.label.worksheetId+' '+ocr.label.side,
      engine:ocr.engine,ocrViews:ocr.views,printedGrid:{count:fit.count,maxOffset:fit.maxOffset,maxResidual:fit.maxResidual}},
    elapsedMs:Math.round(performance.now()-began),correctedBytes:correctedBlob.size}};
}
