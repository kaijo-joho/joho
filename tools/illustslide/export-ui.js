/* 作品内の図形を参照する、書き出し専用のアセット一覧。 */
(function (root) {
  'use strict';
  function create(ctx) {
    const C=root.IlapoCore, A=root.IlapoExportAssets, S=root.IlapoSVG, E=root.IlapoExport;
    const panel=ctx.root, byId=id=>panel.querySelector('#'+id), list=byId('export-asset-list');
    const fields=['export-range','export-padding','export-scale','export-background','print-range'];
    const defaults=['page','8','1','transparent','page'], states=new Map(), rows=new Map(), groups=new WeakMap(), resolvedAssets=new Map();
    let session=null, lastDocument=null, busy=false;
    const assetList=()=>ctx.document().exportAssets||[];
    function saveState() { if(session!==null)states.set(session,fields.map(id=>byId(id).value)); }
    function state() {
      if(session===ctx.session())return;
      saveState();session=ctx.session();lastDocument=null;rows.clear();resolvedAssets.clear();list.replaceChildren();
      const values=states.get(session)||defaults;
      fields.forEach((id,index)=>byId(id).value=values[index]);
    }
    function registeredMode() { byId('export-range').value='assets';saveState(); }
    function sourceStatus(resolved) {
      if(!resolved.page)return '元のページがありません';
      if(!resolved.available)return resolved.hiddenCount?'図形は非表示です':'元の図形がありません';
      const omitted=resolved.missingCount+resolved.hiddenCount;
      return resolved.page.name+' · '+resolved.selectionIds.length+'個'+(omitted?'（'+omitted+'個を除外）':'');
    }
    function makeRow(asset) {
      const row=document.createElement('div');row.className='export-asset-row';row.dataset.exportAsset=asset.id;
      row.innerHTML='<label class="export-asset-check"><input type="checkbox"></label><button type="button" class="export-asset-thumb"><img alt="" draggable="false"></button><div class="export-asset-info"><input class="export-asset-name" maxlength="120" spellcheck="false"><small class="export-asset-status"></small></div><button type="button" class="export-asset-remove">'+ctx.icon('delete')+'</button>';
      const scope=session, valid=()=>scope===ctx.session()&&assetList().some(item=>item.id===asset.id);
      const checkbox=row.querySelector('input[type=checkbox]'), name=row.querySelector('.export-asset-name');
      const thumb=row.querySelector('.export-asset-thumb'), remove=row.querySelector('.export-asset-remove');
      checkbox.onchange=()=>{if(!valid())return;ctx.change(doc=>{doc.exportAssets.find(item=>item.id===asset.id).enabled=checkbox.checked;});registeredMode();sync();};
      name.onfocus=()=>groups.set(name,Symbol('export-asset-name'));
      function rename(event) {
        if(!valid()||event.isComposing||name.dataset.composing)return;
        const value=name.value.trim();name.setAttribute('aria-invalid',String(!value));
        if(value)ctx.change(doc=>{doc.exportAssets.find(item=>item.id===asset.id).name=value;},groups.get(name));
      }
      function finishName() {
        if(name.dataset.composing)return;
        if(valid()){name.value=assetList().find(item=>item.id===asset.id).name;name.removeAttribute('aria-invalid');}
        groups.delete(name);
      }
      name.addEventListener('input',rename);
      name.addEventListener('compositionstart',()=>{name.dataset.composing='true';});
      name.addEventListener('compositionend',event=>{delete name.dataset.composing;rename(event);if(document.activeElement!==name)finishName();});
      name.onblur=finishName;
      name.onkeydown=event=>{if(event.key==='Enter'&&!event.isComposing){event.preventDefault();name.blur();}};
      thumb.onclick=()=>{
        if(!valid())return;
        const current=assetList().find(item=>item.id===asset.id), resolved=A.resolve(ctx.document(),current);
        if(resolved.available)ctx.select(resolved.page.id,resolved.selectionIds);
      };
      remove.onclick=()=>{
        if(!valid())return;
        const next=row.nextElementSibling?.dataset.exportAsset||row.previousElementSibling?.dataset.exportAsset;
        if(ctx.change(doc=>{doc.exportAssets=doc.exportAssets.filter(item=>item.id!==asset.id);})){sync();(rows.get(next)?.querySelector('.export-asset-remove')||byId('export-asset-add')).focus();ctx.toast('一覧から外しました。元の図形は残っています。');}
      };
      return row;
    }
    function renderRows(doc) {
      const items=doc.exportAssets||[], keep=new Set(items.map(item=>item.id)), pageKeys=new Map();
      resolvedAssets.clear();
      for(const [id,row] of rows)if(!keep.has(id)){row.remove();rows.delete(id);}
      list.querySelector('.export-assets-empty')?.remove();
      if(!items.length){const empty=document.createElement('p');empty.className='muted export-assets-empty';empty.textContent='図形を選んで追加すると、ここに並びます。';list.append(empty);}
      items.forEach((asset,index)=>{
        let row=rows.get(asset.id);if(!row){row=makeRow(asset);rows.set(asset.id,row);}
        // 入力欄を作り直さず、日本語変換中のカーソルとフォーカスを保つ。
        if(list.children[index]!==row)list.insertBefore(row,list.children[index]||null);
        const resolved=A.resolve(doc,asset), name=row.querySelector('.export-asset-name'), checkbox=row.querySelector('input[type=checkbox]');
        resolvedAssets.set(asset.id,resolved);
        const thumb=row.querySelector('.export-asset-thumb'), image=thumb.querySelector('img');
        if(document.activeElement!==name&&!name.dataset.composing){name.value=asset.name;name.removeAttribute('aria-invalid');}
        name.setAttribute('aria-label',asset.name+'のファイル名');
        checkbox.checked=asset.enabled;checkbox.setAttribute('aria-label',asset.name+'を書き出す');
        thumb.disabled=!resolved.available;thumb.setAttribute('aria-label',asset.name+'の元の図形を選択');
        const remove=row.querySelector('.export-asset-remove');remove.setAttribute('aria-label',asset.name+'を一覧から外す');remove.title='一覧から外す';
        row.querySelector('.export-asset-status').textContent=sourceStatus(resolved);
        if(resolved.page&&!pageKeys.has(resolved.page.id))pageKeys.set(resolved.page.id,JSON.stringify(resolved.page));
        const key=JSON.stringify(resolved.selectionIds)+'|'+(pageKeys.get(asset.pageId)||'');
        if(row.thumbnailKey!==key){
          row.thumbnailKey=key;
          if(resolved.available){try{image.src='data:image/svg+xml,'+encodeURIComponent(S.exportPage(resolved.page,{selectionIds:resolved.selectionIds,padding:2}));image.hidden=false;}catch(_){image.removeAttribute('src');image.hidden=true;}}
          else {image.removeAttribute('src');image.hidden=true;}
        }
      });
    }
    function sync() {
      state();if(panel.hidden)return;
      const doc=ctx.document();
      if(lastDocument!==doc){renderRows(doc);lastDocument=doc;}
      const selected=new Set(ctx.selected());
      byId('export-asset-add').disabled=(doc.exportAssets||[]).length>=100||!ctx.page().objects.some(object=>selected.has(object.id)&&root.IlapoLayers.visible(ctx.page(),object)&&!(object.type==='image'&&object.reference));
      const mode=byId('export-range').value, checked=assetList().filter(item=>item.enabled);
      const available=checked.filter(item=>resolvedAssets.get(item.id)?.available).length;
      const summary=byId('export-asset-summary');summary.hidden=mode!=='assets';
      summary.textContent=available+'件を書き出します。'+(available>1?'複数の画像はZIPにまとめます。':'')+(checked.length>available?'元の図形がない・非表示のアセットは除外します。':'');
      for(const format of ['svg','png']){
        const button=panel.querySelector('[data-action="export-'+format+'"]');
        button.disabled=busy||(mode==='assets'&&!available);
        button.textContent=busy?'書き出し中…':format.toUpperCase()+'を保存'+(mode==='assets'?'（'+available+'件）':'');
      }
    }
    byId('export-asset-add').onclick=()=>{
      state();const pageId=ctx.page().id, ids=ctx.selected().slice();let added;
      if(ctx.change(doc=>{added=A.add(doc,pageId,ids);})){registeredMode();sync();ctx.toast('「'+added.name+'」を書き出しアセットに追加しました。');}
    };
    for(const id of fields)byId(id).addEventListener('change',()=>{saveState();sync();});
    panel.addEventListener('keydown',event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!event.isComposing){
        event.preventDefault();event.stopPropagation();
        const active=document.activeElement;if(active?.matches('.export-asset-name'))active.blur();
        ctx.onHistory(event.shiftKey);sync();
      }
    });
    async function save(format) {
      if(busy)return;
      state();
      const padding=Number(byId('export-padding').value), scale=Number(byId('export-scale').value), background=byId('export-background').value;
      if(!Number.isFinite(padding)||padding<0||padding>1000)throw new Error('余白は0〜1000pxで指定してください。');
      if(format==='png'&&(!Number.isFinite(scale)||scale<=0||scale>1000))throw new Error('PNGの倍率は0より大きく1000以下で指定してください。');
      const frozen=C.clone(ctx.document()), mode=byId('export-range').value, options={padding,scale,background};
      let entries, omitted=0;
      if(mode==='assets'){
        const checked=(frozen.exportAssets||[]).filter(item=>item.enabled);
        entries=checked.map(asset=>({...A.resolve(frozen,asset),name:asset.name})).filter(entry=>entry.available);
        omitted=checked.length-entries.length;
        if(!entries.length)throw new Error('書き出せるアセットにチェックしてください。');
      }else{
        const page=frozen.pages.find(value=>value.id===ctx.page().id);
        const resolved=mode==='selection'?A.resolve(frozen,{pageId:page.id,objectIds:ctx.selected()}):{page,selectionIds:null,available:true};
        if(!resolved.available)throw new Error('書き出す図形を選択してください。');
        entries=[{...resolved,name:frozen.name+'_'+page.name}];
      }
      // 名前・対象・設定を開始時点で固定し、処理中の編集や作品タブ切替の影響を受けない。
      busy=true;sync();
      try {
        const files=Object.create(null), used=new Set();let total=0;
        for(const entry of entries){
          let base=ctx.fileName(entry.name,'').replace(/[. ]+$/,'')||'アセット', name=base+'.'+format, index=2;
          while(used.has(name.toLowerCase()))name=base+'_'+(index++)+'.'+format;
          used.add(name.toLowerCase());
          const output=format==='png'?await E.png(entry.page,{...options,selectionIds:entry.selectionIds}):new Blob([S.exportPage(entry.page,{...options,selectionIds:entry.selectionIds})],{type:'image/svg+xml'});
          const bytes=new Uint8Array(await output.arrayBuffer());total+=bytes.length;
          if(total>64*1024*1024)throw new Error('書き出しの合計が64MBを超えました。アセットの数やPNGの倍率を減らしてください。');
          files[name]=bytes;
        }
        if(entries.length===1){const [name,bytes]=Object.entries(files)[0];ctx.download(bytes,name,format==='png'?'image/png':'image/svg+xml');}
        else ctx.download(root.fflate.zipSync(files,{level:0}),ctx.fileName(frozen.name+'_アセット_'+format.toUpperCase(),'.zip'),'application/zip');
        ctx.toast(format.toUpperCase()+'を'+entries.length+'件書き出しました。'+(omitted?'書き出せない'+omitted+'件は除外しました。':''));
      }finally{busy=false;sync();}
    }
    return Object.freeze({sync,save});
  }
  root.IlapoExportUI=Object.freeze({create});
}(globalThis));
