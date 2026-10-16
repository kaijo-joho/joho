// OCR receives only the printed label crops. All code/model files are self hosted.
import {parsePrintedLabel} from './10_model.mjs?v=20261016-ocr1';
const vendor = new URL('./vendor/tesseract-6.0.1/', import.meta.url);
let sdkPromise = null;
function deadline(promise, milliseconds, code) {
  let timer;
  return Promise.race([promise, new Promise((_, reject) => {timer=setTimeout(()=>reject(Error(code)),milliseconds);})])
    .finally(()=>clearTimeout(timer));
}
function sdk() {
  if (!sdkPromise) sdkPromise = deadline(new Promise((resolve,reject)=>{
    const script=document.createElement('script');script.src=new URL('tesseract.min.js',vendor).href;
    script.onload=()=>window.Tesseract?.createWorker?resolve(window.Tesseract):reject(Error('OCR_UNAVAILABLE'));
    script.onerror=()=>{script.remove();reject(Error('OCR_UNAVAILABLE'));};document.head.append(script);
  }),20000,'OCR_TIMEOUT').catch(error=>{sdkPromise=null;throw error;});
  return sdkPromise;
}
export function labelConsensus(views) {
  if (!Array.isArray(views)||views.length!==2) throw Error('OCR_INCOMPLETE');
  const labels=views.map(view=>{
    // Engine-specific heuristic, not a probability. Both views must agree and
    // the independent Mac reader must still verify the original uploaded pixels.
    if (!Number.isFinite(view.confidence)||view.confidence<90||view.confidence>100) throw Error('OCR_LOW_CONFIDENCE');
    return parsePrintedLabel(view.text);
  });
  if(labels[0].worksheetId!==labels[1].worksheetId||labels[0].side!==labels[1].side)throw Error('OCR_DISAGREEMENT');
  return labels[0];
}
export function makeLabelViews(source) {
  const pixels=source.getContext('2d').getImageData(0,0,source.width,source.height),gray=new Uint8Array(source.width*source.height),hist=new Uint32Array(256);
  for(let i=0;i<gray.length;i++){gray[i]=Math.round((pixels.data[i*4]+pixels.data[i*4+1]+pixels.data[i*4+2])/3);hist[gray[i]]++;}
  const percentile=p=>{let count=0;for(let i=0;i<256;i++){count+=hist[i];if(count>=gray.length*p)return i;}return 255;};
  const lo=percentile(.02),hi=percentile(.98),views=[];
  for(const contrast of [false,true]){
    const image=document.createElement('canvas');image.width=source.width;image.height=source.height;
    const ctx=image.getContext('2d'),data=ctx.createImageData(image.width,image.height);
    for(let i=0;i<gray.length;i++){const v=contrast&&hi>lo?(gray[i]-lo)*255/(hi-lo):gray[i];data.data[i*4]=data.data[i*4+1]=data.data[i*4+2]=v;data.data[i*4+3]=255;}
    ctx.putImageData(data,0,0);views.push(image);
  }
  return views;
}
function prepareLabelImage(source,targetHeight=40) {
  const w=source.width,h=source.height,copy=document.createElement('canvas');copy.width=w;copy.height=h;
  const ctx=copy.getContext('2d'),pixels=source.getContext('2d').getImageData(0,0,w,h),mask=new Uint8Array(w*h),queue=new Int32Array(w*h);
  for(let i=0;i<mask.length;i++)if((pixels.data[i*4]+pixels.data[i*4+1]+pixels.data[i*4+2])/3<128)mask[i]=1;
  let left=w,top=h,right=0,bottom=0;
  for(let start=0;start<mask.length;start++){
    if(mask[start]!==1)continue;mask[start]=2;queue[0]=start;let count=1,x0=w,y0=h,x1=0,y1=0;
    for(let n=0;n<count;n++){
      const i=queue[n],x=i%w,y=Math.floor(i/w);x0=Math.min(x0,x);y0=Math.min(y0,y);x1=Math.max(x1,x);y1=Math.max(y1,y);
      for(const j of [x?i-1:-1,x<w-1?i+1:-1,y?i-w:-1,y<h-1?i+w:-1])if(j>=0&&mask[j]===1){mask[j]=2;queue[count++]=j;}
    }
    if(x1-x0>w*.7&&y1-y0<h*.2){
      for(let n=0;n<count;n++){const i=queue[n]*4;pixels.data[i]=pixels.data[i+1]=pixels.data[i+2]=255;}
    }else if(count>=3){left=Math.min(left,x0);top=Math.min(top,y0);right=Math.max(right,x1);bottom=Math.max(bottom,y1);}
  }
  if(right<=left||bottom<=top)throw Error('OCR_LABEL_UNREADABLE');
  ctx.putImageData(pixels,0,0);
  const scale=Math.min(4,targetHeight/(bottom-top+1)),out=document.createElement('canvas');
  out.width=Math.ceil((right-left+1)*scale)+32;out.height=Math.ceil((bottom-top+1)*scale)+32;
  const oc=out.getContext('2d');oc.fillStyle='#fff';oc.fillRect(0,0,out.width,out.height);oc.imageSmoothingEnabled=true;
  oc.drawImage(copy,left,top,right-left+1,bottom-top+1,16,16,(right-left+1)*scale,(bottom-top+1)*scale);
  return out;
}
export function trialConsensus(trials) {
  const supported=trials.filter(view=>Number.isFinite(view.confidence)&&view.confidence>=90&&view.confidence<=100);
  if(!supported.length)throw Error('OCR_LOW_CONFIDENCE');
  const labels=supported.map(view=>parsePrintedLabel(view.text));
  if(labels.some(label=>label.worksheetId!==labels[0].worksheetId||label.side!==labels[0].side))throw Error('OCR_DISAGREEMENT');
  return supported.reduce((best,view)=>view.confidence>best.confidence?view:best);
}
export async function recognizePrintedLabel(crops) {
  if (!Array.isArray(crops)||crops.length!==2)throw Error('OCR_INCOMPLETE');
  const api=await sdk();let worker=null,expired=false;
  const create=api.createWorker('eng',0,{workerPath:new URL('worker.min.js',vendor).href,
    corePath:new URL('core/',vendor).href,langPath:new URL('lang/',vendor).href.replace(/\/$/,''),
    workerBlobURL:true,gzip:true,legacyCore:true,legacyLang:true,cachePath:'ws-label-eng-1.0.0-legacy',logger:()=>{}},
    {load_system_dawg:'0',load_freq_dawg:'0',load_punc_dawg:'0',load_number_dawg:'0',load_bigram_dawg:'0'})
    .catch(()=>{throw Error('OCR_UNAVAILABLE');});
  create.then(value=>{if(expired)value.terminate();}).catch(()=>{});
  try {
    worker=await deadline(create,45000,'OCR_TIMEOUT');
    await worker.setParameters({tessedit_pageseg_mode:'7',user_defined_dpi:'300',preserve_interword_spaces:'1'});
    const views=[];
    for(const [index,crop]of crops.entries()){
      const trials=[];
      for(const height of [28,36,40,48]){
        const {data}=await deadline(worker.recognize(prepareLabelImage(crop,height)),15000,'OCR_TIMEOUT');
        trials.push({height,text:data.text.trim(),confidence:data.confidence});
      }
      try{views.push({condition:index?'contrast':'grayscale',...trialConsensus(trials),trials});}
      catch(error){error.ocrViews=[...views,{condition:index?'contrast':'grayscale',trials}];throw error;}
    }
    try{return {label:labelConsensus(views),views,engine:'Tesseract.js 6.0.1 / eng legacy / local'};}
    catch(error){error.ocrViews=views;throw error;}
  } finally {expired=true;if(worker)await worker.terminate();}
}
