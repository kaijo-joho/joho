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
 parsed.searchParams.set('type','htmlIdentity');parsed.searchParams.set('embed','html-editor');
 return new Promise((resolve,reject)=>{
   let frame=null,bridge='',slowTimer,timer;
   const progress=node(container,'','p');progress.className='download-status';progress.setAttribute('role','status');
   const spinner=node(progress,'','span');spinner.className='download-spinner';spinner.setAttribute('aria-hidden','true');const label=node(progress,'本人確認画面を読み込んでいます…','span');
   dialog?.classList.add('identity-open');
   let source=null,sourceOrigin='',settled=false,integrated=false;
   const help=root.HtmlEditorDownload.loginHelp(container,()=>{
     if(settled)return;
     if(source){help.say('本人確認画面に接続済みです。画面内の確認ボタンを使い、処理中はそのままお待ちください。');return;}
     startFrame();help.say('本人確認画面だけを開き直しました。編集内容はそのままです。');
   },{identity:true});
   function appearance(type='appearance') { if(source)source.postMessage({channel:CHANNEL,bridge,type,nonce:ticket.nonce,
     theme:document.documentElement.dataset.resolvedTheme || document.documentElement.dataset.theme,
     fontSize:document.documentElement.dataset.textSize,...(type==='connect'?{oldToken,layout:'integrated-v1',profile:'display-name-v1'}:{})},sourceOrigin); }
   const observer=typeof root.MutationObserver==='function'?new root.MutationObserver(()=>appearance()):null;
   observer?.observe(document.documentElement,{attributes:true,attributeFilter:['data-resolved-theme','data-theme','data-text-size']});
   function finish(error,response){if(settled)return;settled=true;clearTimeout(timer);clearTimeout(slowTimer);observer?.disconnect();root.removeEventListener('message',receive);if(signal)signal.removeEventListener('abort',cancel);frame?.remove();progress.remove();help.element.remove();dialog?.classList.remove('identity-open','identity-integrated');error?reject(error):resolve(response);}
   function cancel(){finish(Error('identity_confirmation_canceled'));}
   function receive(event){const data=event.data;
    if(settled || !frame?.isConnected || !root.HtmlEditorDownload.gasOrigin(event.origin) || !root.HtmlEditorDownload.withinFrame(event.source,frame.contentWindow) || !data || data.channel!==CHANNEL || data.bridge!==bridge)return;
    if(data.type==='hello'){
      if(source && (source!==event.source || sourceOrigin!==event.origin))return;
      source=event.source;sourceOrigin=event.origin;clearTimeout(slowTimer);appearance('connect');return;
    }
    if(event.source!==source || event.origin!==sourceOrigin || data.nonce!==ticket.nonce)return;
    if(data.type==='layout' && data.layout==='integrated-v1'){integrated=true;progress.hidden=true;dialog?.classList.add('identity-integrated');return;}
    if(integrated && data.type==='height' && Number.isInteger(data.height) && data.height>=0 && data.height<=20000){frame.style.height=Math.max(140,Math.min(700,data.height))+'px';return;}
    if(data.type==='proof')finish(null,data.response);
   }
   function startFrame(){
     clearTimeout(timer);clearTimeout(slowTimer);frame?.remove();source=null;sourceOrigin='';integrated=false;
     bridge=id()+id().slice(0,16);parsed.searchParams.set('bridge',bridge);
     const frameBridge=bridge;
     dialog?.classList.remove('identity-integrated');progress.hidden=false;spinner.hidden=false;label.textContent='本人確認画面を読み込んでいます…';
     frame=document.createElement('iframe');frame.title='学校アカウントの本人確認';frame.className='download-frame';frame.referrerPolicy='no-referrer';
     frame.setAttribute('sandbox','allow-scripts allow-same-origin allow-forms allow-popups allow-popups-to-escape-sandbox');
     slowTimer=setTimeout(()=>{if(settled||frameBridge!==bridge||source)return;label.textContent='表示に時間がかかっています。別タブでGoogleにログインし、本人確認画面だけを開き直してください。';help.element.open=true;},20000);
     timer=setTimeout(()=>{
       if(settled||frameBridge!==bridge)return;
       if(source){finish(Error('identity_confirmation_timeout'));return;}
       spinner.hidden=true;label.textContent='本人確認画面を読み込めませんでした。下のログイン案内を確認してください。';help.element.open=true;
     },180000);
     frame.src=parsed.href;container.append(frame);
   }
   root.addEventListener('message',receive);startFrame();
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
  compareFileIdentity:(state,source)=>root.HtmlIdentityCache.compareFileIdentity(state,source,codec,Date.now()),
  register:request=>coordinator.ensure({userInitiated:true,...request}),
  createPanel({container,lesson,fileSystem=null,connectFolder=null}){
   let busy=false,disposed=false,saving=false;node(container,lesson.title);
   const direct=Boolean(fileSystem?.isSupported());
   node(container,direct ? '「新しくダウンロード」を押すと、接続したフォルダへ実習ファイルを直接保存します。取得後は、この画面を閉じて上部の「開く」から選びます。編集中のファイルは差し替えません。' :
     '「新しくダウンロード」を押すと、公開中の最新版を取得して保存を開始します。編集中のファイルは差し替えません。');
   const destination=direct ? node(container,'') : null;
   const connect=direct ? node(container,'HTML実習フォルダを接続…','button') : null;
   if(connect){connect.type='button';connect.className='btn';}
   const files=node(container,'','div');files.className='local-download-files';
   const entries=[];
   function refresh(){
    if(disposed)return;
    const connected=!direct || fileSystem.isConnected();
    if(destination)destination.textContent=connected ? '保存先：'+fileSystem.getDirectoryName()+'（実習ファイルはこのフォルダの直下へ保存します）' : '先にFinderで「書類／HTML実習」を作り、そのフォルダを接続してください。';
    if(connect){connect.hidden=connected;connect.disabled=busy || !connectFolder;}
    entries.forEach(e=>{e.button.disabled=busy || !connected;});
   }
   if(connect)connect.addEventListener('click',async()=>{
    if(busy||disposed||!connectFolder)return;const moveFocus=document.activeElement===connect;busy=true;refresh();
    try{await connectFolder();}
    catch(e){if(!disposed)destination.textContent=e.name==='AbortError'?'フォルダ選択を取り消しました。まだ取得・保存していません。':e.message;}
    finally{busy=false;if(!disposed){const message=destination.textContent;refresh();if(!fileSystem.isConnected())destination.textContent=message;if(moveFocus)(fileSystem.isConnected()?entries[0]?.button:connect)?.focus();}}
   });
   for(const task of lesson.files){
    const row=node(files,'','section');row.className='local-download-file';row.setAttribute('aria-label',task.fileName);
    node(row,task.fileName,'h3');
    const actions=node(row,'','div');actions.className='local-download-actions';
    const button=node(actions,'新しくダウンロード','button');button.type='button';button.className='btn';button.setAttribute('aria-label',task.fileName+' を新しくダウンロード');
    const link=node(actions,'保存されなかった場合は、もう一度保存','a');link.className='local-download-retry';link.hidden=true;link.setAttribute('aria-label',task.fileName+' が保存されなかった場合は、もう一度保存');
    const status=node(row,'まだ取得していません。');status.setAttribute('role','status');
    const entry={button,link,status,url:null,result:null,completed:false};entries.push(entry);
    function clear(){if(entry.url)URL.revokeObjectURL(entry.url);entry.url=null;link.hidden=true;link.removeAttribute('href');link.removeAttribute('download');}
    entry.clear=clear;
    link.addEventListener('click',event=>{if(disposed||busy||!entry.url){event.preventDefault();return;}status.textContent='保存を開始しました。通常は「ダウンロード」に保存されます。'+task.fileName+' を確認し、「書類／HTML実習」へ移動してください。';});
    button.addEventListener('click',async()=>{if(busy||disposed||entry.url||entry.completed||direct&&!fileSystem.isConnected())return;busy=true;let moveFocus=document.activeElement===button;refresh();clear();status.setAttribute('aria-busy','true');status.textContent='最新のひな形を取得しています…';
     try{
      const directory=direct ? await fileSystem.requireWritePermission() : null;
      if(disposed)return;
      if(direct&&!entry.result&&await fileSystem.hasFile(task.fileName,directory)){const e=Error('同名ファイルがあります。上書きせず、上部の「開く」から保存済みファイルを開いてください。');e.name='FileExistsError';throw e;}
      const result=entry.result || await provider.generateFresh(task.id,cache);if(disposed)return;
      if(result.fileName!==task.fileName)throw Error('file_name_mismatch');
      if(direct){
       entry.result=result;saving=true;status.textContent=fileSystem.getDirectoryName()+'/'+result.fileName+' へ保存しています…';
       await fileSystem.writeNewFile(result.fileName,result.html,directory);
       if(disposed)return;
       entry.completed=true;entry.result=null;button.hidden=true;
       status.textContent='保存しました：'+fileSystem.getDirectoryName()+'/'+result.fileName+'。保存後の内容も確認しました。この画面を閉じて「開く」から選んでください。';
       status.setAttribute('tabindex','-1');if(moveFocus)status.focus();
       return;
      }
      entry.url=URL.createObjectURL(new Blob([result.html],{type:'text/html;charset=utf-8'}));link.href=entry.url;link.download=result.fileName;link.hidden=false;
      moveFocus=document.activeElement===button;button.hidden=true;
     }catch(e){if(!disposed){clear();button.hidden=false;
      button.textContent=entry.result?'保存を再試行':'新しくダウンロード';
      button.setAttribute('aria-label',task.fileName+' を'+button.textContent);
      status.textContent=e.name==='FileExistsError'?e.message:entry.result?'保存完了を確認できませんでした。取得済みの同じ内容で「保存を再試行」できます。通常のダウンロードへは切り替えていません。（'+e.message+'）':
       '取得・保存を開始できませんでした。学校アカウントとフォルダの許可を確認し、もう一度操作してください。（'+e.message+'）';}}
     finally{busy=false;saving=false;status.removeAttribute('aria-busy');refresh();if(!disposed&&!entry.completed&&!entry.url&&moveFocus)button.focus();}
     if(!disposed && entry.url){
      // The small link also remains available if the browser blocks the automatic download.
      try{link.click();}catch(e){status.textContent='実習ファイルを取得しました。保存されない場合は「もう一度保存」を押してください。';}
      if(moveFocus)link.focus();
     }
    });
   }
   refresh();
   return {canClose:()=>!saving&&(!busy || root.confirm('ひな形の取得中です。閉じますか？'))&&(!direct||!entries.some(e=>e.result)||root.confirm('取得した実習ファイルの保存が確認できていません。この画面を閉じると同じ内容での再試行ができなくなります。閉じますか？')),dispose:()=>{disposed=true;entries.forEach(e=>{e.clear();e.result=null;e.button.disabled=true;});}};
  },
  async renewFile(source,response){const before=P.parseLocal(source,codec),tokenHash=await sha256(before.envelope.identity);
    if(response.replacesTokenSha256!==tokenHash)throw Error('renewal_mismatch');
    return P.replaceIdentityForFile(source,{token:response.token,replacesTokenSha256:response.replacesTokenSha256},{...codec,hash:token=>{if(token!==before.envelope.identity)throw Error('renewal_mismatch');return tokenHash;}});
  }
 };
}
root.HtmlEditorLocalDownloads={create,browserCodec,sha256,confirmationBridge};
})(typeof window==='undefined'?globalThis:window);
