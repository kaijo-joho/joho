/* Candidate integration. No authentication authority belongs to this public UI. */
(function(root){'use strict';
const P=root.HtmlLocalProtocol,CHANNEL='joho-html-identity-v3';
function id(){return Array.from(root.crypto.getRandomValues(new Uint8Array(16)),x=>x.toString(16).padStart(2,'0')).join('');}
function browserCodec(){return {
 encode:s=>btoa(Array.from(new TextEncoder().encode(s),x=>String.fromCharCode(x)).join('')).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,''),
 decode:s=>new TextDecoder('utf-8',{fatal:true}).decode(Uint8Array.from(atob(s.replace(/-/g,'+').replace(/_/g,'/')),c=>c.charCodeAt(0)))
};}
const sha256=async s=>Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',new TextEncoder().encode(s))),x=>x.toString(16).padStart(2,'0')).join('');
function node(parent,text,tag='p'){const n=document.createElement(tag);n.textContent=text;parent.append(n);return n;}
function confirmationBridge({container,dialog,url,ticket,oldToken='',signal}){
 if(root.location.origin!==P.ORIGIN || root.top!==root)return Promise.reject(Error('origin_not_allowed'));
 const parsed=new URL(url);
 if(!/^https:\/\/script\.google\.com\/(?:a\/macros\/gfe\.kaijo\.ed\.jp\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/.test(parsed.href))return Promise.reject(Error('identity_route_invalid'));
 const bridge=id()+id().slice(0,16);parsed.searchParams.set('type','htmlIdentity');parsed.searchParams.set('embed','html-editor');parsed.searchParams.set('bridge',bridge);
 return new Promise((resolve,reject)=>{
   const frame=document.createElement('iframe');frame.title='学校アカウントの本人確認';frame.className='download-frame';frame.referrerPolicy='no-referrer';
   frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
   const progress=node(container,'','p');progress.className='download-status';progress.setAttribute('role','status');
   const spinner=node(progress,'','span');spinner.className='download-spinner';spinner.setAttribute('aria-hidden','true');node(progress,'本人確認画面を読み込んでいます…','span');
   dialog?.classList.add('identity-open');
   let source=null,sourceOrigin='',settled=false,integrated=false;
   function appearance(type='appearance') { if(source)source.postMessage({channel:CHANNEL,bridge,type,nonce:ticket.nonce,
     theme:document.documentElement.dataset.resolvedTheme || document.documentElement.dataset.theme,
     fontSize:document.documentElement.dataset.textSize,...(type==='connect'?{oldToken,layout:'integrated-v1'}:{})},sourceOrigin); }
   const observer=typeof root.MutationObserver==='function'?new root.MutationObserver(()=>appearance()):null;
   observer?.observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme','data-theme','data-text-size']});
   const timer=setTimeout(()=>finish(Error('identity_confirmation_timeout')),180000);
   function finish(error,response){if(settled)return;settled=true;clearTimeout(timer);observer?.disconnect();root.removeEventListener('message',receive);if(signal)signal.removeEventListener('abort',cancel);frame.remove();progress.remove();dialog?.classList.remove('identity-open','identity-integrated');error?reject(error):resolve(response);}
   function cancel(){finish(Error('identity_confirmation_canceled'));}
   function receive(event){const data=event.data;
    if(!frame.isConnected || !root.HtmlEditorDownload.gasOrigin(event.origin) || !root.HtmlEditorDownload.withinFrame(event.source,frame.contentWindow) || !data || data.channel!==CHANNEL || data.bridge!==bridge)return;
    if(data.type==='hello'){
      if(source && (source!==event.source || sourceOrigin!==event.origin))return;
      source=event.source;sourceOrigin=event.origin;appearance('connect');return;
    }
    if(event.source!==source || event.origin!==sourceOrigin || data.nonce!==ticket.nonce)return;
    if(data.type==='layout' && data.layout==='integrated-v1'){integrated=true;progress.hidden=true;dialog?.classList.add('identity-integrated');return;}
    if(integrated && data.type==='height' && Number.isInteger(data.height) && data.height>=0 && data.height<=20000){frame.style.height=Math.max(140,Math.min(700,data.height))+'px';return;}
    if(data.type==='proof')finish(null,data.response);
   }
   root.addEventListener('message',receive);frame.src=parsed.href;container.append(frame);
   if(signal){signal.addEventListener('abort',cancel,{once:true});if(signal.aborted)cancel();}
 });
}
function create(options){
 const codec=options.codec || browserCodec(),cache=options.cache || root.HtmlIdentityCache.create({origin:root.location.origin,secure:root.isSecureContext,indexedDB:root.indexedDB,codec,now:()=>Date.now(),randomId:id});
 const provider=options.provider || root.HtmlPublicOriginal.create({origin:root.location.origin,codec,fetch:root.fetch.bind(root),sha256,randomId:id});
 const coordinator=root.HtmlConfirmationCoordinator.create({cache,locks:options.locks || root.navigator.locks,randomFraction:()=>root.crypto.getRandomValues(new Uint32Array(1))[0]/4294967296,
   delay:ms=>new Promise(resolve=>setTimeout(resolve,ms)),confirmViaExistingBridge:ticket=>options.confirm(ticket)});
 return {
  cache,provider,
  load:()=>cache.load(),
  register:request=>coordinator.ensure({userInitiated:true,...request}),
  createPanel({container,lesson}){
   let busy=false,disposed=false;node(container,lesson.title);
   node(container,'新しい実習ファイルは、その都度公開中の最新版を取得します。編集中のファイルは差し替えません。');
   const files=node(container,'','div');files.className='local-download-files';
   const entries=[];
   for(const task of lesson.files){
    const row=node(files,'','section');row.className='local-download-file';row.setAttribute('aria-label',task.fileName);
    node(row,task.fileName,'h3');
    const actions=node(row,'','div');actions.className='local-download-actions';
    const button=node(actions,'新しくダウンロード','button');button.type='button';button.className='btn';button.setAttribute('aria-label',task.fileName+' を新しくダウンロード');
    const link=node(actions,task.fileName+' を保存する','a');link.className='btn';link.hidden=true;
    const status=node(row,'まだ取得していません。');status.setAttribute('role','status');
    const entry={button,link,status,url:null};entries.push(entry);
    function clear(){if(entry.url)URL.revokeObjectURL(entry.url);entry.url=null;link.hidden=true;link.removeAttribute('href');link.removeAttribute('download');}
    entry.clear=clear;
    link.addEventListener('click',event=>{if(disposed||busy||!entry.url){event.preventDefault();return;}status.textContent='保存を開始しました。Macのダウンロード先を確認してください。';});
    button.addEventListener('click',async()=>{if(busy||disposed)return;busy=true;entries.forEach(e=>{e.button.disabled=true;});clear();status.textContent='最新のひな形を取得しています…';
     try{const result=await provider.generateFresh(task.id,cache);if(disposed)return;
      if(result.fileName!==task.fileName)throw Error('file_name_mismatch');
      entry.url=URL.createObjectURL(new Blob([result.html],{type:'text/html;charset=utf-8'}));link.href=entry.url;link.download=result.fileName;link.hidden=false;
      status.textContent='準備できました。'+result.fileName+' を保存し、「書類／HTML実習」へ移動してください。';
     }catch(e){if(!disposed)status.textContent='取得できませんでした。学校アカウントの確認状態を確認し、もう一度取得してください。（'+e.message+'）';}
     finally{busy=false;if(!disposed)entries.forEach(e=>{e.button.disabled=false;});}
    });
   }
   return {canClose:()=>!busy || root.confirm('ひな形の取得中です。閉じますか？'),dispose:()=>{disposed=true;entries.forEach(e=>{e.clear();e.button.disabled=true;});}};
  },
  async renewFile(source,response){const before=P.parseLocal(source,codec),tokenHash=await sha256(before.envelope.identity);
    if(response.replacesTokenSha256!==tokenHash)throw Error('renewal_mismatch');
    return P.replaceIdentityForFile(source,{token:response.token,replacesTokenSha256:response.replacesTokenSha256},{...codec,hash:token=>{if(token!==before.envelope.identity)throw Error('renewal_mismatch');return tokenHash;}});
  }
 };
}
root.HtmlEditorLocalDownloads={create,browserCodec,sha256,confirmationBridge};
})(typeof window==='undefined'?globalThis:window);
