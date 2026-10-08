/* 教材に明示された公開画像だけを、利用者が作ったimagesへ保存する。 */
(function(root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(globalThis);
  else root.HtmlEditorImageDownloads = factory(root);
})(typeof globalThis === 'undefined' ? this : globalThis, function(root) {
  'use strict';
  const definitions = [
    ['html14','photo01.jpg',3143110,'d5f572253ecf5063ef86e1fa0a3aa892ea154e61faf08ffc7f510bd32a3fe691'],
    ['html14','photo02.jpg',3336253,'ab6aaeddf921153ca4d65793866cccf42277a9dcf17a891351ba3a20eb5e450d'],
    ['html14','photo03.jpg',2704628,'620c08f652f790e4a2c1022942e8bf76e9f6edf940d1f04f4511b344fbdddfe7'],
    ['html14','photo04.jpg',3171944,'6104b9c35676d03068302295051d57ffc33703d4fbf01995e61eae5da05a9d18'],
    ['html14','photo05.jpg',3065657,'dd5c0516629a876c9050c519b3e1e871375906e431f917ac333aa13781aff134'],
    ['html15','evolution_of_internet.png',1404899,'d301529df100cca5496f5568534e32ef0a754c5ebabfd74a4856a8e02ad4119b'],
    ['html15','history_of_programming_languages.png',1801596,'ca002e43aac9dceebedcc684b13c167520ad14f6f7fe27ba4558dcbcea87df9d'],
    ['html15','futuristic_technologies.png',1996640,'573a4a5beed9554acffc79eebbcf2430e99b711db88763e2ce8e4456af62afd6'],
    ['html25','seaside-park.png',3219360,'27c194a992539ee459d4b1f24dd3afc32fea7e3c8ec39037b72080fa0a735609']
  ];
  const assets = Object.freeze(definitions.map(([lessonId,name,size,sha256])=>Object.freeze({
    lessonId,name,size,sha256,mime:name.endsWith('.jpg')?'image/jpeg':'image/png'
  })));
  const forLesson = id => assets.filter(asset=>asset.lessonId===id);
  function assetUrl(asset, base = root.location.href) {
    if (!assets.includes(asset)) throw Error('教材の画像を確認できません。');
    const url = new URL('../../html/images/'+asset.name,base), here = new URL(base);
    if (!/^https?:$/.test(here.protocol) || here.username || here.password || url.origin!==here.origin) throw Error('画像の取得先を確認できません。');
    return url.href;
  }
  function fromLink(lessonId, href, base = root.location.href) {
    try { return forLesson(lessonId).find(asset=>assetUrl(asset,base)===new URL(href).href) || null; }
    catch { return null; }
  }
  async function fetchAsset(asset, {base=root.location.href, fetch=root.fetch.bind(root), signal} = {}) {
    const url=assetUrl(asset,base);
    const response=await fetch(url,{mode:'same-origin',credentials:'omit',redirect:'error',cache:'no-cache',signal});
    if (!response.ok || response.url && response.url!==url || response.headers.get('content-type')?.split(';')[0].trim()!==asset.mime) throw Error('教材の画像を取得できませんでした。');
    const length=response.headers.get('content-length'),encoding=response.headers.get('content-encoding');
    if (length!==null && (!encoding||encoding==='identity') && Number(length)!==asset.size) throw Error('画像の容量が登録内容と一致しません。');
    // Content-Lengthがない場合も、登録容量を超える応答をメモリへ蓄積しない。
    const chunks=[];let size=0;
    if (response.body?.getReader) {
      const reader=response.body.getReader();
      try {
        for (;;) {
          const {done,value}=await reader.read();if(done)break;
          size+=value.length;if(size>asset.size)throw Error('画像の容量が登録内容と一致しません。');chunks.push(value);
        }
      } catch(error) { try { await reader.cancel(); } catch {} throw error; }
      finally { reader.releaseLock(); }
    } else { const raw=new Uint8Array(await response.arrayBuffer());chunks.push(raw);size=raw.length; }
    if (size!==asset.size) throw Error('画像の容量が登録内容と一致しません。');
    const raw=new Uint8Array(size);let offset=0;for(const chunk of chunks){raw.set(chunk,offset);offset+=chunk.length;}
    const digest=Array.from(new Uint8Array(await root.crypto.subtle.digest('SHA-256',raw)),n=>n.toString(16).padStart(2,'0')).join('');
    if (digest!==asset.sha256) throw Error('画像の内容が登録内容と一致しません。時間をおいて再試行してください。');
    return raw;
  }
  function createPanel({container, lessonId, fileSystem, connectFolder=null, onSaved=()=>{}, selectedName='', loadAsset=fetchAsset}) {
    const files=forLesson(lessonId);
    if (!files.length) return {canClose:()=>true,dispose(){}};
    const doc=container.ownerDocument || root.document;
    function node(parent,text,tag='p'){const element=doc.createElement(tag);element.textContent=text;parent.append(element);return element;}
    const section=node(container,'','section');section.className='image-downloads';
    node(section,'教材の画像','h2');
    const direct=Boolean(fileSystem?.isSupported());
    node(section,direct ? 'Finderで「HTML実習」の中に「images」を作ります。下のボタンでその中へ画像を直接保存できます。imagesは自動では作成しません。同名画像は上書きしません。' :
      '画像をダウンロードしたら、Finderで「HTML実習」の中に作った「images」へ移動してください。');
    const destination=node(section,'');destination.setAttribute('role','status');
    const connect=direct && connectFolder ? node(section,'HTML実習フォルダを接続…','button') : null;
    if(connect){connect.type='button';connect.className='btn';}
    const rows=node(section,'','div');rows.className='local-download-files';
    const entries=[];
    let busy=false,saving=false,disposed=false,controller=null,timer;
    function refresh() {
      if(disposed)return;
      const connected=!direct||fileSystem.isConnected();
      destination.textContent=direct ? connected ? '画像の保存先：'+fileSystem.getDirectoryName()+'/images' : '先に「HTML実習」フォルダを接続してください。' : '通常のダウンロードを使います。';
      if(connect){connect.hidden=connected;connect.disabled=busy;}
      entries.forEach(entry=>entry.button.disabled=busy||!connected);
    }
    if(connect)connect.addEventListener('click',async()=>{
      if(busy||disposed)return;busy=true;refresh();
      try{await connectFolder();}catch(error){destination.textContent=error.name==='AbortError'?'フォルダ選択を取り消しました。':error.message;}
      finally{busy=false;const message=destination.textContent;refresh();if(!fileSystem.isConnected())destination.textContent=message;(fileSystem.isConnected()?entries[0].button:connect).focus();}
    });
    for(const asset of files) {
      const row=node(rows,'','section');row.className='local-download-file';row.setAttribute('aria-label',asset.name);
      node(row,asset.name,'h3');
      const button=node(row,direct?'imagesへ保存':'画像をダウンロード','button');button.type='button';button.className='btn';
      button.setAttribute('aria-label',asset.name+' を'+button.textContent);
      const status=node(row,'まだ保存していません。');status.setAttribute('role','status');
      const retry=node(row,'保存されなかった場合は、もう一度保存','a');retry.className='local-download-retry';retry.hidden=true;
      const entry={asset,button,status,retry,raw:null,target:null,url:null,completed:false};entries.push(entry);
      retry.addEventListener('click',event=>{
        if(disposed||busy||!entry.url){event.preventDefault();return;}
        status.textContent='画像の保存を開始しました。Finderで '+asset.name+' を確認し、「HTML実習/images」へ移動してください。';
      });
      button.addEventListener('click',async()=>{
        if(busy||disposed||entry.completed||direct&&!fileSystem.isConnected())return;
        const moveFocus=doc.activeElement===button;busy=true;refresh();status.setAttribute('aria-busy','true');
        status.textContent='画像と保存先を確認しています…';
        try {
          const directory=direct ? await fileSystem.requireWritePermission() : null;
          const images=direct ? await fileSystem.getImagesDirectory(directory,entry.target?.images) : null;
          if(disposed){entry.raw=null;return;}
          if(entry.target&&entry.target.directory!==directory)throw Error('接続先が変わりました。画像の保存先を確認してください。');
          if(direct&&!entry.raw&&await fileSystem.hasImage(asset.name,images)){const error=Error('同名の画像があります。上書きせず、保存済みの画像を使ってください。');error.name='FileExistsError';throw error;}
          if(!entry.raw) {
            controller=new AbortController();timer=setTimeout(()=>controller?.abort(),60000);
            status.textContent='教材の画像を取得しています…';
            try{entry.raw=await loadAsset(asset,{signal:controller.signal});}finally{clearTimeout(timer);controller=null;}
          }
          if(disposed){entry.raw=null;return;}
          if(direct) {
            entry.target={directory,images};saving=true;status.textContent=asset.name+' をimagesへ保存しています…';
            await fileSystem.writeNewImage(asset.name,entry.raw,directory,images);
            entry.completed=true;entry.raw=null;button.hidden=true;
            status.textContent='保存しました：'+fileSystem.getDirectoryName()+'/images/'+asset.name+'。保存後の内容も確認しました。';
            try{onSaved(asset);}catch{status.textContent+=' プレビューは更新アイコンで確認してください。';}
            status.setAttribute('tabindex','-1');if(moveFocus)status.focus();
          } else {
            entry.url=URL.createObjectURL(new Blob([entry.raw],{type:asset.mime}));entry.completed=true;entry.raw=null;button.hidden=true;
            retry.href=entry.url;retry.download=asset.name;retry.hidden=false;
          }
        } catch(error) {
          if(!disposed){
            button.textContent=entry.raw?'保存を再試行':direct?'imagesへ保存':'画像をダウンロード';button.setAttribute('aria-label',asset.name+' を'+button.textContent);
            status.textContent=entry.url ? '保存を開始できない場合は、もう一度保存するリンクを使ってください。' :
              entry.raw ? '保存完了を確認できませんでした。同じ画像で「保存を再試行」できます。（'+error.message+'）' :
              'まだ画像を保存していません。'+(error.name==='AbortError'?'画像の取得を中止しました。もう一度操作してください。':error.message);
          }
        } finally {
          busy=false;saving=false;status.removeAttribute('aria-busy');refresh();
          if(!disposed&&!entry.completed&&moveFocus)button.focus();
        }
        if(!disposed&&entry.url){try{retry.click();}catch{status.textContent='保存されない場合は、もう一度保存するリンクを使ってください。';}if(moveFocus)retry.focus();}
      });
    }
    const unsubscribe=fileSystem?.onChange?.(refresh);
    refresh();
    return {
      focusSelected(){const entry=entries.find(e=>e.asset.name===selectedName);if(entry){entry.button.focus();entry.button.scrollIntoView({block:'nearest'});}},
      canClose:()=>!saving&&(!busy||root.confirm('画像の取得中です。閉じますか？'))&&(!entries.some(entry=>entry.raw)||root.confirm('画像の保存を確認できていません。閉じると同じ画像での再試行ができなくなります。閉じますか？')),
      dispose(){disposed=true;clearTimeout(timer);controller?.abort();unsubscribe?.();entries.forEach(entry=>{entry.raw=null;entry.button.disabled=true;if(entry.url)URL.revokeObjectURL(entry.url);entry.retry.hidden=true;entry.retry.removeAttribute('href');entry.retry.removeAttribute('download');});}
    };
  }
  return Object.freeze({assets,forLesson,fromLink,assetUrl,fetchAsset,createPanel});
});
