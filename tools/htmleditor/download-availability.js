/* A fresh read-only dist check for each new v3 download; never a submission permit. */
(function(root){'use strict';
const CHANNEL='joho-html-download-v3',ORIGIN='https://joho.kaijo.ed.jp';
const REASONS=['before_start','not_released','not_configured','task_closed','distribution_disabled','maintenance_blocked','not_allowed','availability_unavailable','request_invalid'];
const id=()=>Array.from(root.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');
function failure(reason){const error=Error(reason);error.downloadAvailability={reason};return error;}
function response(value,targetId){
 const keys=value&&Object.keys(value).sort().join(',');
 if(!value || value.v!==1 || value.targetId!==targetId || typeof value.allowed!=='boolean')throw failure('availability_unavailable');
 if(value.allowed){if(keys!=='allowed,targetId,v')throw failure('availability_unavailable');}
 else {
  if(!REASONS.includes(value.reason) || keys!==(value.reason==='before_start'?'allowed,reason,startAt,targetId,v':'allowed,reason,targetId,v'))throw failure('availability_unavailable');
  if(value.reason==='before_start' && !(typeof value.startAt==='string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value.startAt) && Number.isFinite(Date.parse(value.startAt)) && new Date(value.startAt).toISOString()===value.startAt))throw failure('availability_unavailable');
 }
 return value;
}
function message(error){
 const value=error?.downloadAvailability;
 if(!value)return '';
 if(value.reason==='before_start')return 'この実習ファイルは配付開始前です。開始日時：'+new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hour12:false}).format(new Date(value.startAt))+'。開始後に「新しくダウンロード」を押してください。';
 if(['not_released','not_configured','task_closed','not_allowed'].includes(value.reason))return 'この課題は現在の学校アカウント・学年では配付されていないか、準備中です。授業担当者の案内を確認してください。';
 if(['distribution_disabled','maintenance_blocked'].includes(value.reason))return '現在、実習ファイルの新規ダウンロードを停止しています。保存済みのファイルはそのまま使えます。';
 return '配付設定を確認できなかったため、新しいファイルは保存していません。学校アカウントのログインを確認し、時間をおいてもう一度操作してください。保存済みのファイルはそのまま使えます。';
}
function bridge({container,url,request,signal}){
 if(root.location.origin!==ORIGIN || root.top!==root)return Promise.reject(failure('not_allowed'));
 let parsed;try{parsed=new URL(url);}catch(_){return Promise.reject(failure('availability_unavailable'));}
 if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/gfe\.kaijo\.ed\.jp\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.href) ||
   !request || !/^html\d{2}-\d{2}$/.test(request.targetId) || typeof request.identity!=='string' || request.identity.length>=16384)return Promise.reject(failure('availability_unavailable'));
 return new Promise((resolve,reject)=>{
  let frame=null,source=null,sourceOrigin='',bridgeId='',settled=false,timer,slowTimer;
  const nonce=id(),help=root.HtmlEditorDownload.loginHelp(container,()=>{
   if(settled)return;
   if(source){help.say('最新の配付設定を確認しています。確認中はこのままお待ちください。');return;}
   start();
  },{availability:true});
  function finish(error,value){
   if(settled)return;settled=true;clearTimeout(timer);clearTimeout(slowTimer);observer?.disconnect();
   root.removeEventListener('message',receive);signal?.removeEventListener('abort',cancel);frame?.remove();help.element.remove();
   error?reject(error):resolve(value);
  }
  function cancel(){const error=Error('download_canceled');error.name='AbortError';finish(error);}
  function appearance(type='appearance'){
   if(source)source.postMessage({channel:CHANNEL,bridge:bridgeId,type,nonce,
    ...root.HtmlEditorDownload.legacyAppearance(document),...(type==='connect'?request:{})},sourceOrigin);
  }
  const observer=typeof root.MutationObserver==='function'?new root.MutationObserver(()=>appearance()):null;
  observer?.observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme','data-theme','data-text-size']});
  function receive(event){
   const d=event.data;
   if(settled || !frame?.isConnected || !root.HtmlEditorDownload.gasOrigin(event.origin) || !root.HtmlEditorDownload.withinFrame(event.source,frame.contentWindow) || !d || d.channel!==CHANNEL || d.bridge!==bridgeId)return;
   if(d.type==='hello'){
    if(source && (event.source!==source || event.origin!==sourceOrigin))return;
    source=event.source;sourceOrigin=event.origin;clearTimeout(slowTimer);appearance('connect');return;
   }
   if(event.source!==source || event.origin!==sourceOrigin || d.nonce!==nonce)return;
   if(d.type==='checking'){frame.hidden=true;return;}
   if(d.type==='error'){finish(failure('availability_unavailable'));return;}
   if(d.type==='result'){try{finish(null,response(d.response,request.targetId));}catch(error){finish(error);}}
  }
  function start(){
   clearTimeout(timer);clearTimeout(slowTimer);frame?.remove();source=null;sourceOrigin='';bridgeId=id()+id().slice(0,16);
   const attempt=bridgeId;
   parsed.searchParams.set('type','htmlDownload');parsed.searchParams.set('embed','html-editor');parsed.searchParams.set('bridge',bridgeId);
   frame=document.createElement('iframe');frame.title='実習ファイルの配付設定を確認';frame.className='download-availability-frame';frame.referrerPolicy='no-referrer';
   frame.style.cssText='width:100%;height:80px;border:0;display:block';
   frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
   slowTimer=setTimeout(()=>{if(!settled && attempt===bridgeId && !source){help.element.open=true;help.say('配付確認画面を開けていません。学校アカウントでログインし、この画面だけを開き直してください。');}},20000);
   timer=setTimeout(()=>{if(settled || attempt!==bridgeId)return;if(source)finish(failure('availability_unavailable'));else{help.element.open=true;help.say('配付確認画面を読み込めません。学校アカウントのログイン後に画面を開き直すか、一度閉じてやり直してください。');}},180000);
   frame.src=parsed.href;container.append(frame);
  }
  root.addEventListener('message',receive);start();signal?.addEventListener('abort',cancel,{once:true});if(signal?.aborted)cancel();
 });
}
root.HtmlDownloadGate={bridge,response,message};
})(typeof window==='undefined'?globalThis:window);
