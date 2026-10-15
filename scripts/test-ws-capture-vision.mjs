// Synthetic images only. No Google login, receipt creation, camera or external uploads.
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const {chromium}=await import(process.env.PLAYWRIGHT_MODULE||'playwright');
const output=process.env.WS_CAPTURE_TEST_OUTPUT||null,baseline=process.env.WS_CAPTURE_BASELINE||null;
const browser=await chromium.launch({channel:'chrome',headless:true}),page=await browser.newPage();
await page.route('**/*',async route=>{
  const u=new URL(route.request().url());if(u.hostname!=='capture.test'){await route.abort();return;}
  if(u.pathname==='/'){await route.fulfill({contentType:'text/html',body:'<!doctype html><html><head><script src="/assets/ws-home/vendor/qrcodegen.js"></script><script src="/assets/ws-home/vendor/jsQR.js"></script></head><body>Private synthetic capture tests</body></html>'});return;}
  let file=path.join(root,u.pathname);
  if(u.pathname.startsWith('/baseline/'))file=u.pathname.endsWith('/11_vision.mjs')?baseline:path.join(root,'assets/ws-home',u.pathname.split('/baseline/')[1]);
  if(!file||!fs.existsSync(file)){await route.fulfill({status:404,body:'NOT_FOUND'});return;}
  await route.fulfill({contentType:u.pathname.endsWith('.json')?'application/json':'text/javascript',body:fs.readFileSync(file)});
});
await page.goto('https://capture.test/');
const cases=[
 {name:'b5-front',paper:'b5',side:'F'}, {name:'b5-back',paper:'b5',side:'B'},
 {name:'a4-front',paper:'a4',side:'F'}, {name:'a4-back',paper:'a4',side:'B'},
 {name:'inset-on-dark-desk',paper:'b5',side:'F',photo:true},
 {name:'off-centre-perspective',paper:'b5',side:'B',photo:true,offset:true},
 {name:'background-squares',paper:'b5',side:'F',photo:true,decoys:true},
 {name:'shadow-and-jpeg',paper:'a4',side:'F',photo:true,shadow:true,jpeg:true},
 {name:'rotated-photo',paper:'b5',side:'B',photo:true,rotate:true},
 {name:'clipped-bottom-left',paper:'b5',side:'B',photo:true,clip:'bottomLeft'},
 {name:'clipped-bottom-right-a4',paper:'a4',side:'F',photo:true,clip:'bottomRight'},
 {name:'clipped-top-left',paper:'b5',side:'F',photo:true,clip:'topLeft'},
 {name:'clipped-header-drift-b5',paper:'b5',side:'B',photo:true,clip:'bottomLeft',headerDrift:true},
 {name:'clipped-header-drift-a4',paper:'a4',side:'F',photo:true,clip:'bottomLeft',headerDrift:true},
 {name:'excessive-header-drift-b5',paper:'b5',side:'B',photo:true,clip:'bottomLeft',headerDrift:[-1.5,1.5],review:true},
 {name:'excessive-header-drift-a4',paper:'a4',side:'F',photo:true,clip:'bottomLeft',headerDrift:[-1.5,1.5],review:true},
 {name:'clipped-alternate-marks-b5',paper:'b5',side:'B',photo:true,clip:'bottomLeft',marks:[6,2,4]},
 {name:'clipped-alternate-marks-a4',paper:'a4',side:'F',photo:true,clip:'bottomLeft',marks:[6,2,4]},
 {name:'displaced-qr-b5',paper:'b5',side:'B',photo:true,qrShift:-2,review:true},
 {name:'displaced-qr-a4',paper:'a4',side:'F',photo:true,qrShift:-2,review:true},
 {name:'clipped-displaced-qr-b5',paper:'b5',side:'B',photo:true,clip:'bottomLeft',qrShift:-2,review:true},
 {name:'clipped-displaced-qr-a4',paper:'a4',side:'F',photo:true,clip:'bottomLeft',qrShift:-2,review:true},
 {name:'clipped-marker-blank-back',paper:'b5',side:'B',photo:true,clip:'bottomLeft',blank:true,review:true},
 {name:'missing-marker',paper:'b5',side:'F',photo:true,missingMarker:true,review:true},
 {name:'two-clipped-markers',paper:'b5',side:'B',photo:true,twoClipped:true,review:true},
 {name:'manual-tone-only',paper:'b5',side:'F',photo:true,manualTone:true},
 {name:'manual-rough-centres',paper:'b5',side:'F',photo:true,manual:true},
 {name:'manual-paper-corners',paper:'b5',side:'B',photo:true,paperCorners:true},
 {name:'incorrect-precise-corners',paper:'b5',side:'F',photo:true,manual:true,precise:true,review:true},
 {name:'insufficient-source-resolution',paper:'b5',side:'F',lowRes:true,review:true},
 {name:'missing-qr',paper:'b5',side:'F',missingQr:true,review:true},
 {name:'unrelated-qr',paper:'b5',side:'B',wrongQr:true,review:true},
 {name:'blank-back-omr',paper:'b5',side:'B',blank:true,review:true},
 {name:'crossed-manual-points',paper:'b5',side:'F',crossed:true,review:true}
];
const results=[],errors=[];page.on('pageerror',e=>errors.push(String(e.message)));
for(const mode of baseline?['baseline','candidate']:['candidate'])for(const spec of cases){
  const result=await page.evaluate(async({spec,mode})=>{
    const v=await import((mode==='baseline'?'/baseline/':'/assets/ws-home/')+'11_vision.mjs'),c=(await v.layouts()).find(c=>c.pageSize===spec.paper&&c.identity.side===spec.side);
    const width=spec.lowRes?500:1800,height=Math.round(width*c.page.heightMm/c.page.widthMm),sx=width/c.page.widthMm,sy=height/c.page.heightMm;
    const sheet=v.canvas(width,height),ctx=sheet.getContext('2d');ctx.fillStyle='#fff';ctx.fillRect(0,0,width,height);ctx.fillStyle='#111';
    for(const m of Object.values(c.markers)){const r=m.mm;ctx.fillRect(Math.round(r.x*sx),Math.round(r.y*sy),Math.round(r.width*sx),Math.round(r.height*sy));}
    for(const key of spec.clip?[spec.clip]:spec.twoClipped?['bottomLeft','bottomRight']:spec.missingMarker?['bottomLeft']:[]){
      const r=c.markers[key].mm;ctx.fillStyle='#fff';ctx.fillRect(Math.round(r.x*sx)-1,Math.round(r.y*sy)-1,Math.round(r.width*sx)+2,Math.round(r.height*sy)+2);
      if(!spec.missingMarker){ctx.fillStyle='#111';ctx.fillRect(Math.round(r.x*sx),Math.round(r.y*sy),Math.round(r.width*sx*.45),Math.round(r.height*sy));}
    }ctx.fillStyle='#111';
    for(const [index,name] of ['class','tens','ones'].entries())for(let digit=0;digit<10;digit++){
      const mark=c.omr[name][digit],p=mark.center.mm,r=mark.radiusMm||1.5*c.scale;ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,r*sx,0,2*Math.PI);ctx.strokeStyle='#111';ctx.lineWidth=.25*c.scale*sx;ctx.stroke();
      if(!spec.blank&&digit===(spec.marks||[3,0,7])[index]){ctx.beginPath();ctx.arc(p.x*sx,p.y*sy,r*.9*sx,0,2*Math.PI);ctx.fill();}
    }
    if(!spec.missingQr){
      const qr=window.qrcodegen.QrCode.encodeText(spec.wrongQr?'https://example.test/unrelated':'INFO1|2026|dr41|'+spec.side,window.qrcodegen.QrCode.Ecc.MEDIUM),r=c.qr.region.mm,q=v.canvas(Math.round(r.width*sx),Math.round(r.height*sy)),qc=q.getContext('2d');
      qc.fillStyle='#fff';qc.fillRect(0,0,q.width,q.height);qc.fillStyle='#000';const pitch=q.width/(qr.size+8);
      for(let y=0;y<qr.size;y++)for(let x=0;x<qr.size;x++)if(qr.getModule(x,y))qc.fillRect(Math.round((x+4)*pitch),Math.round((y+4)*pitch),Math.round((x+5)*pitch)-Math.round((x+4)*pitch),Math.round((y+5)*pitch)-Math.round((y+4)*pitch));
      ctx.drawImage(q,(r.x+(spec.qrShift||0)*c.scale)*sx,r.y*sy,r.width*sx,r.height*sy);
    }
    if(spec.headerDrift){
      const r=c.qr.region.mm,first=c.omr.class[0].center.mm,last=c.omr.ones.at(-1).center.mm;
      const x=Math.floor((first.x-3*c.scale)*sx),y=Math.floor(r.y*sy),w=Math.ceil((r.x+r.width)*sx)-x,h=Math.ceil((last.y+3*c.scale)*sy)-y;
      const part=v.canvas(w,h);part.getContext('2d').drawImage(sheet,x,y,w,h,0,0,w,h);
      const [dx,dy]=Array.isArray(spec.headerDrift)?spec.headerDrift:[-.35,.45];
      ctx.fillStyle='#fff';ctx.fillRect(x,y,w,h);ctx.drawImage(part,x+dx*c.scale*sx,y+dy*c.scale*sy);
    }
    ctx.font='bold 28px sans-serif';ctx.fillStyle='#111';ctx.fillText('SYNTHETIC WORKSHEET - no real student information',130,450);
    for(let y=650;y<height-220;y+=160){ctx.fillRect(130,y,width-260,2);ctx.fillText('Practice writing',130,y-30);}
    const original=[{x:0,y:0},{x:width-1,y:0},{x:width-1,y:height-1},{x:0,y:height-1}];
    let image=sheet,destination=original;
    if(spec.photo){
      destination=spec.offset?[{x:595,y:760},{x:1680,y:690},{x:1750,y:2340},{x:440,y:2220}]:[{x:390,y:390},{x:1640,y:300},{x:1570,y:2230},{x:280,y:2110}];
      const warped=v.warp(sheet,original,destination,1950,2500);image=v.canvas(1950,2500);const ic=image.getContext('2d');ic.fillStyle='#303436';ic.fillRect(0,0,image.width,image.height);
      ic.save();ic.beginPath();destination.forEach((p,i)=>i?ic.lineTo(p.x,p.y):ic.moveTo(p.x,p.y));ic.closePath();ic.clip();ic.drawImage(warped,0,0);ic.restore();
      if(spec.decoys){ic.fillStyle='#000';for(const [x,y] of [[65,80],[1850,60],[1840,2390],[60,2400]])ic.fillRect(x,y,28,28);}
      if(spec.shadow){const g=ic.createLinearGradient(0,0,image.width,200);g.addColorStop(0,'#0007');g.addColorStop(.5,'#0002');g.addColorStop(1,'#0000');ic.fillStyle=g;ic.fillRect(0,0,image.width,image.height);}
    }
    let options={};
    if(spec.manualTone)options.autoTone=false;
    if(spec.manual||spec.paperCorners){
      const [p0,p1,p2,p3]=destination,dx1=p1.x-p2.x,dx2=p3.x-p2.x,dx3=p0.x-p1.x+p2.x-p3.x,dy1=p1.y-p2.y,dy2=p3.y-p2.y,dy3=p0.y-p1.y+p2.y-p3.y,den=dx1*dy2-dx2*dy1,g=(dx3*dy2-dx2*dy3)/den,h=(dx1*dy3-dx3*dy1)/den;
      const project=(u,v)=>({x:((p1.x-p0.x+g*p1.x)*u+(p3.x-p0.x+h*p3.x)*v+p0.x)/(g*u+h*v+1),y:((p1.y-p0.y+g*p1.y)*u+(p3.y-p0.y+h*p3.y)*v+p0.y)/(g*u+h*v+1)});
      options.corners=spec.paperCorners?destination.map(p=>({...p})):['topLeft','topRight','bottomRight','bottomLeft'].map((key,i)=>{const m=c.markers[key].center.mm,p=project(m.x*sx/(width-1),m.y*sy/(height-1));return {x:p.x+(i%2?-14:14),y:p.y+(i<2?15:-15)};});
    }
    if(spec.crossed){const points=v.detectMarkers(image);options.corners=[points[0],points[2],points[1],points[3]];}
    if(spec.precise)options.preciseCorners=true;
    if(spec.rotate){const rotated=v.canvas(image.height,image.width),rc=rotated.getContext('2d');rc.translate(rotated.width,0);rc.rotate(Math.PI/2);rc.drawImage(image,0,0);image=rotated;}
    const blob=await new Promise(resolve=>image.toBlob(resolve,spec.jpeg?'image/jpeg':'image/png',.76));
    const result=await v.processImage(blob,options),reading=result.reading;
    const bytes=result.correctedBlob?Array.from(new Uint8Array(await result.correctedBlob.arrayBuffer())):null;
    return {status:reading.status,reason:reading.reason||null,message:reading.message,worksheetId:reading.qr?.worksheetId,side:reading.qr?.side,pageSize:reading.pageSize,marksMatch:reading.classNumber===(spec.marks||[3,0,7])[0]&&reading.number===(spec.marks||[3,0,7])[1]*10+(spec.marks||[3,0,7])[2],restoredMarkers:reading.restoredMarkers||0,autoTone:reading.autoTone,elapsedMs:reading.elapsedMs||0,bytes:bytes&&(spec.name==='inset-on-dark-desk'||spec.name==='off-centre-perspective'||spec.clip&&!spec.blank)?bytes:null};
  },{spec,mode});
  const pass=spec.review?result.status==='REVIEW':result.status==='OK'&&result.worksheetId==='dr41'&&result.side===spec.side&&result.pageSize===spec.paper&&result.marksMatch&&(!spec.clip||result.restoredMarkers===1)&&result.autoTone!==!!spec.manualTone;
  if(result.bytes&&output){fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(path.join(path.dirname(output),mode+'-'+(spec.clip?spec.name:spec.side)+'.png'),Buffer.from(result.bytes));}delete result.bytes;
  results.push({mode,name:spec.name,pass,...result});console.log(JSON.stringify(results.at(-1)));
}
await browser.close();
const summary={mode:'SYNTHETIC_VISION_ONLY',results,pageErrors:errors,candidatePassed:results.filter(r=>r.mode==='candidate'&&r.pass).length,candidateTotal:cases.length};
if(output)fs.writeFileSync(output,JSON.stringify(summary,null,2)+'\n');
if(results.some(r=>r.mode==='candidate'&&!r.pass)||errors.length)process.exitCode=1;
