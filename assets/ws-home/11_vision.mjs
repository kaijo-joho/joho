import {parseWorksheetQr, provisionalLimits, hashBlob} from './10_model.mjs';
const layoutCache = new Map();
const rowNames = ['class', 'tens', 'ones'];
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
  const head = new Uint8Array(await blob.slice(0, 12).arrayBuffer());
  const png = head[0] === 137 && head[1] === 80 && head[2] === 78 && head[3] === 71;
  const jpeg = head[0] === 255 && head[1] === 216 && head[2] === 255;
  if (!png && !jpeg) throw Error('INPUT_FORMAT_UNSUPPORTED');
  const url = URL.createObjectURL(blob), image = new Image();
  try {
    image.src = url; await image.decode();
    if (image.naturalWidth * image.naturalHeight > provisionalLimits.maxPixels) throw Error('INPUT_TOO_MANY_PIXELS');
    // Modern Image decoding applies EXIF orientation; output PNG has no orientation dependency.
    const scale = Math.min(1, 3000 / Math.max(image.naturalWidth, image.naturalHeight));
    const w = Math.round(image.naturalWidth * scale), h = Math.round(image.naturalHeight * scale), odd = turns % 2;
    const c = canvas(odd ? h : w, odd ? w : h), ctx = c.getContext('2d', {willReadFrequently: true});
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate(turns * Math.PI / 2); ctx.drawImage(image, -w / 2, -h / 2, w, h);
    return c;
  } finally {URL.revokeObjectURL(url);}
}
function grayscale(c) {
  const rgba = c.getContext('2d', {willReadFrequently: true}).getImageData(0, 0, c.width, c.height).data;
  const gray = new Uint8Array(c.width * c.height);
  for (let i = 0; i < gray.length; i++) gray[i] = Math.round((rgba[i * 4] + rgba[i * 4 + 1] + rgba[i * 4 + 2]) / 3);
  return gray;
}
const markerCache = new WeakMap();
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
    if(count<Math.max(16,total*.000025)||count>total*.004||bw/bh<.4||bw/bh>2.5||minX<2||minY<2||maxX>w-3||maxY>h-3)continue;
    const left=new Int32Array(bh).fill(w),right=new Int32Array(bh).fill(-1);
    for(let n=0;n<count;n++){const i=queue[n],x=i%w,y=Math.floor(i/w)-minY;left[y]=Math.min(left[y],x);right[y]=Math.max(right[y],x);}
    const boundary=[];for(let y=0;y<bh;y++)if(right[y]>=0){boundary.push({x:left[y],y:y+minY},{x:right[y],y:y+minY});}
    const hull=convexHull(boundary),area=polygonArea(hull),fill=count/(area+bw+bh);
    if(fill<.8)continue;
    const center=squareCenter(boundary);if(!center)continue;
    const candidate={x:center.x/ratio,y:center.y/ratio,area:area/(ratio*ratio),size:Math.sqrt(area)/ratio,fill};
    const old=found.find(p=>Math.hypot(p.x-candidate.x,p.y-candidate.y)<Math.min(p.size,candidate.size)*.6);
    if(!old)found.push(candidate);else if(candidate.fill>old.fill)Object.assign(old,candidate);
  }
  markerCache.set(source,found);return found;
}
function markerSets(source) {
  const w=source.width,h=source.height,all=markerComponents(source),groups=[];
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
    const score=Math.abs(Math.log(average/.00030))+ratios.reduce((s,v)=>s+Math.abs(Math.log(v/average)),0)/4+(1-area/(w*h))*.2;
    quads.push({points:p.map(v=>({x:v.x,y:v.y})),score});
  }
  return quads.sort((a,b)=>a.score-b.score).slice(0,6);
}
export function detectMarkers(source) {return markerSets(source)[0]?.points||null;}
export function snapMarker(source,point) {
  const nearby=markerComponents(source).map(p=>({...p,d:Math.hypot(p.x-point.x,p.y-point.y)})).filter(p=>p.d<Math.max(p.size*2,Math.min(source.width,source.height)*.045)).sort((a,b)=>a.d-b.d);
  if(!nearby.length||nearby[1]&&nearby[1].d-nearby[0].d<nearby[0].size*.35)return {...point};
  return {x:nearby[0].x,y:nearby[0].y};
}
function homography(from, to) {
  const rows = [];
  for (let i = 0; i < 4; i++) {
    const {x, y} = from[i], u = to[i].x, v = to[i].y;
    rows.push([x, y, 1, 0, 0, 0, -u * x, -u * y, u]);
    rows.push([0, 0, 0, x, y, 1, -v * x, -v * y, v]);
  }
  for (let p = 0; p < 8; p++) {
    let m = p; for (let r = p + 1; r < 8; r++) if (Math.abs(rows[r][p]) > Math.abs(rows[m][p])) m = r;
    [rows[p], rows[m]] = [rows[m], rows[p]];
    if (Math.abs(rows[p][p]) < 1e-9) throw Error('INVALID_CORNERS');
    const f = rows[p][p]; for (let j = p; j <= 8; j++) rows[p][j] /= f;
    for (let r = 0; r < 8; r++) if (r !== p) {const t = rows[r][p]; for (let j = p; j <= 8; j++) rows[r][j] -= t * rows[p][j];}
  }
  return rows.map(r => r[8]).concat(1);
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
function tone(image, brightness, contrast) {
  const ctx = image.getContext('2d', {willReadFrequently: true}), id = ctx.getImageData(0, 0, image.width, image.height);
  const factor = Math.max(.4, 1 + contrast / 100);
  for (let i = 0; i < id.data.length; i += 4) for (let k = 0; k < 3; k++) id.data[i + k] = (id.data[i + k] - 128) * factor + 128 + brightness * 2.55;
  ctx.putImageData(id, 0, 0);
}
function transformPoint(matrix,p) {const d=matrix[6]*p.x+matrix[7]*p.y+1;return {x:(matrix[0]*p.x+matrix[1]*p.y+matrix[2])/d,y:(matrix[3]*p.x+matrix[4]*p.y+matrix[5])/d};}
function qrCrop(source,points,c,options) {
  // Sample the original QR region directly. A whole-page 1000 px preview loses small modules.
  const r=c.qr.region.mm,margin=5*c.scale,density=10,left=Math.max(0,r.x-margin),top=Math.max(0,r.y-margin);
  const width=Math.ceil((r.width+margin*2)*density),height=Math.ceil((r.height+margin*2)*density);
  const target=targetMarkers(c,c.page.widthMm*density,c.page.heightMm*density).map(p=>({x:p.x-left*density,y:p.y-top*density}));
  const image=warp(source,points,target,width,height);tone(image,options.brightness||0,options.contrast||0);
  return {image,left,top,density};
}
function readQr(region,c) {
  const {image,left,top,density}=region,ctx=image.getContext('2d',{willReadFrequently:true}),data=ctx.getImageData(0,0,image.width,image.height);
  let decoded=window.jsQR(data.data,image.width,image.height,{inversionAttempts:'attemptBoth'});
  if(!decoded){
    const gray=grayscale(image),lo=percentile(gray,.04),hi=percentile(gray,.96);
    if(hi-lo>30){for(let i=0;i<gray.length;i++){const v=(gray[i]-lo)*255/(hi-lo);data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=v;}decoded=window.jsQR(data.data,image.width,image.height,{inversionAttempts:'attemptBoth'});}
  }
  if(!decoded)return null;
  let qr;try{qr=parseWorksheetQr(decoded.data);}catch{return null;}
  if(qr.side!==c.identity.side)return null;
  const r=c.qr.region.mm,modules=decoded.version*4+17,quiet=r.width*4/(modules+8);
  const expected=[{x:r.x+quiet,y:r.y+quiet},{x:r.x+r.width-quiet,y:r.y+quiet},{x:r.x+r.width-quiet,y:r.y+r.height-quiet},{x:r.x+quiet,y:r.y+r.height-quiet}];
  const actual=['topLeftCorner','topRightCorner','bottomRightCorner','bottomLeftCorner'].map(key=>({x:decoded.location[key].x/density+left,y:decoded.location[key].y/density+top}));
  const error=Math.max(...actual.map((p,i)=>Math.hypot(p.x-expected[i].x,p.y-expected[i].y)));
  return {qr,error,modules,actual};
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
function validCorners(points,source) {
  return points.length===4&&points.every(p=>p&&Number.isFinite(p.x)&&Number.isFinite(p.y)&&p.x>=0&&p.y>=0&&p.x<source.width&&p.y<source.height)&&new Set(points.map(p=>Math.round(p.x)+','+Math.round(p.y))).size===4&&points.every((p,i)=>cross(p,points[(i+1)%4],points[(i+2)%4])>0)&&polygonArea(points)>source.width*source.height*.15;
}
export async function processImage(blob, options = {}) {
  const began=performance.now(),source=await loadImage(blob,options.turns||0);
  const sets=options.corners?[{points:options.corners.map(p=>options.preciseCorners?{...p}:snapMarker(source,p))}]:markerSets(source);
  let corners=sets[0]?.points||null;
  if(!corners)return {source,corners:null,reading:{status:'REVIEW',reason:'MARKERS_NOT_FOUND',message:'四隅の黒い■を確認できません。用紙全体が写っているか確認し、「黒いマーカーを指定」で拡大して合わせてください。'}};
  if(!validCorners(corners,source))return {source,corners,reading:{status:'REVIEW',reason:'INVALID_CORNERS',message:'黒いマーカーを左上→右上→右下→左下の順に指定してください。紙の角ではなく、黒い■の中心です。'}};
  const candidates=[];
  for(const set of sets){
    if(!validCorners(set.points,source))continue;
    for(const c of await layouts())for(let turn=0;turn<4;turn++){
      const points=set.points.slice(turn).concat(set.points.slice(0,turn)),found=readQr(qrCrop(source,points,c,options),c);
      if(found)candidates.push({...found,c,points,corners:set.points});
    }
    if(candidates.some(v=>v.error<=.8))break;
  }
  candidates.sort((a,b)=>a.error-b.error);
  const best=candidates[0],alternative=best&&candidates.find(v=>v.c.pageSize!==best.c.pageSize||v.qr.payload!==best.qr.payload);
  if(!best)return {source,corners,reading:{status:'REVIEW',reason:'QR_UNREADABLE',message:'WS識別QRを読み取れません。QRの汚れ・影・ピンぼけを確認し、黒いマーカーの位置を拡大して合わせてください。'}};
  corners=best.corners;
  if(best.error>.8||alternative&&alternative.error-best.error<.1)return {source,corners,reading:{status:'REVIEW',reason:'QR_POSITION_MISMATCH',message:'QRは読めましたが、用紙と黒いマーカーの位置が合いません。紙の角ではなく四隅の黒い■の中心へ合わせてください。'}};
  const c=best.c,width=provisionalLimits.normalizedWidth,height=Math.round(width*c.page.heightMm/c.page.widthMm);
  const corrected=warp(source,best.points,targetMarkers(c,width,height),width,height);tone(corrected,options.brightness||0,options.contrast||0);
  const omr=readOmr(corrected,c),q=quality(corrected,c),problems=omr.issues.slice();
  const matrix=homography(targetMarkers(c,c.page.widthMm,c.page.heightMm),best.points),sourceQr=best.actual.map(p=>transformPoint(matrix,p));
  const modulePixels=Math.min(...sourceQr.map((p,i)=>Math.hypot(p.x-sourceQr[(i+1)%4].x,p.y-sourceQr[(i+1)%4].y)))/best.modules;
  if(modulePixels<3)problems.push('解像度が不足しています。用紙を大きく写して撮り直してください。');
  if(q.headerSharpness<25)problems.push('画像がぼけています。明るい場所でピントを合わせて撮り直してください。');
  if(q.paperBrightness<100)problems.push('画像が暗すぎます。明るさを調整するか、撮り直してください。');
  const correctedBlob=await new Promise(resolve=>corrected.toBlob(resolve,'image/png'));
  if(!correctedBlob||correctedBlob.size>provisionalLimits.maxImageBytes)throw Error('OUTPUT_TOO_LARGE');
  return {source,corners,correctedBlob,sha256:await hashBlob(correctedBlob),reading:{status:problems.length?'REVIEW':'OK',message:problems[0]||'',qr:best.qr,classNumber:omr.classNumber,number:omr.number,rows:omr.rows,pageSize:c.pageSize,quality:q,sourcePixelsPerModule:modulePixels,elapsedMs:Math.round(performance.now()-began),correctedBytes:correctedBlob.size}};
}
