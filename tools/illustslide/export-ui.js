/* 対象を選び、共通の設定から画像・再生用HTML・PDFを書き出す。 */
(function (root) {
  'use strict';
  function create(ctx) {
    const C=root.IlapoCore, A=root.IlapoExportAssets, T=root.IlapoExportTargets, S=root.IlapoSVG, E=root.IlapoExport;
    const panel=ctx.root, byId=id=>panel.querySelector('#'+id), list=byId('export-asset-list'), pageList=byId('export-page-list');
    const fields=['export-format','export-padding','export-scale','export-background'];
    const states=new Map(), rows=new Map(), pageRows=new Map(), groups=new WeakMap(), resolvedAssets=new Map();
    const modes=['assets','pages','all'];
    let session=null, current=null, lastDocument=null, busy=false;
    const assetList=()=>ctx.document().exportAssets||[];
    function saveState() {
      if(!current)return;
      current.values=fields.map(id=>byId(id).value);
      current.excludeSkipped=byId('export-exclude-skipped').checked;
      current.details=byId('export-details').open;
    }
    function state() {
      if(session===ctx.session())return;
      saveState();session=ctx.session();lastDocument=null;rows.clear();pageRows.clear();resolvedAssets.clear();list.replaceChildren();pageList.replaceChildren();
      if(!states.has(session))states.set(session,{mode:'pages',pageIds:null,values:['svg','8','1','transparent'],excludeSkipped:false,details:false});
      current=states.get(session);
      fields.forEach((id,index)=>byId(id).value=current.values[index]);
      byId('export-exclude-skipped').checked=current.excludeSkipped;
      byId('export-details').open=current.details;
    }
    function setMode(mode) {current.mode=mode;sync();}
    function registeredMode() {setMode('assets');}
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
    function makePageRow(page) {
      const row=document.createElement('div');row.className='export-page-row';row.dataset.exportPage=page.id;
      row.innerHTML='<label class="export-asset-check"><input type="checkbox"></label><button type="button" class="export-page-pick"><img alt="" draggable="false"><span><strong></strong><small></small></span></button>';
      const scope=session, checkbox=row.querySelector('input'), pick=row.querySelector('button');pick.dataset.exportPagePick=page.id;
      checkbox.onchange=()=>{
        if(scope!==ctx.session())return;
        if(checkbox.checked)current.pageIds.add(page.id);else current.pageIds.delete(page.id);
        sync();
      };
      pick.onclick=()=>{if(scope===ctx.session())ctx.selectPage(page.id);};
      return row;
    }
    function renderPages(doc) {
      const keep=new Set(doc.pages.map(page=>page.id));
      for(const [id,row] of pageRows)if(!keep.has(id)){row.remove();pageRows.delete(id);}
      doc.pages.forEach((page,index)=>{
        let row=pageRows.get(page.id);if(!row){row=makePageRow(page);pageRows.set(page.id,row);}
        if(pageList.children[index]!==row)pageList.insertBefore(row,pageList.children[index]||null);
        row.querySelector('strong').textContent=(index+1)+'. '+page.name;
        row.querySelector('small').textContent=page.skip?'発表スキップ':'';
        row.querySelector('input').setAttribute('aria-label',page.name+'を書き出す');
        row.querySelector('button').setAttribute('aria-label',page.name+'を編集画面で表示');
        const key=JSON.stringify(page);
        if(row.thumbnailKey!==key){row.thumbnailKey=key;const image=row.querySelector('img');
          try{image.src='data:image/svg+xml,'+encodeURIComponent(S.exportPage(page,{padding:2}));image.hidden=false;}catch(_){image.removeAttribute('src');image.hidden=true;}
        }
      });
    }
    function targetOptions() {
      return {mode:current.mode,pageIds:[...current.pageIds],excludeSkipped:byId('export-format').value==='html'&&byId('export-exclude-skipped').checked};
    }
    function sync() {
      state();if(panel.hidden)return;
      // 最初にパネルを開いた時点のページを選ぶ。編集ページの切替ではチェックを変えない。
      if(current.pageIds===null)current.pageIds=new Set([ctx.page().id]);
      const doc=ctx.document(), format=byId('export-format').value, mode=current.mode;
      if(lastDocument!==doc){renderRows(doc);renderPages(doc);lastDocument=doc;}
      for(const name of modes){
        const tab=byId('export-'+name+'-tab'), active=name===mode;
        tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1;
        byId('export-'+name+'-pane').hidden=!active;
      }
      for(const [id,row] of pageRows){
        row.querySelector('input').checked=current.pageIds.has(id);
        const pick=row.querySelector('button');
        if(id===ctx.page().id)pick.setAttribute('aria-current','page');else pick.removeAttribute('aria-current');
      }
      const selected=new Set(ctx.selected());
      byId('export-asset-add').disabled=(doc.exportAssets||[]).length>=100||!ctx.page().objects.some(object=>selected.has(object.id)&&root.IlapoLayers.visible(ctx.page(),object)&&!(object.type==='image'&&object.reference));
      byId('export-all-summary').textContent='全'+doc.pages.length+'ページを書き出します。';
      const result=T.collect(doc,targetOptions()), count=result.entries.length, partial=mode==='assets';
      const needsPadding=partial||result.entries.some(entry=>entry.page.board.infinite);
      byId('export-padding-field').hidden=!needsPadding;
      byId('export-board-note').hidden=needsPadding;
      byId('export-png-options').hidden=format!=='png';
      byId('export-html-options').hidden=format!=='html';
      byId('export-pdf-options').hidden=format!=='pdf';
      const noun=partial?'件':'ページ', button=byId('export-save');
      button.disabled=busy||count===0;
      button.textContent=busy?'書き出し中…':(format==='pdf'?'PDF・印刷':'書き出す')+'（'+count+noun+'）';
      const info=[];
      if(!count)info.push(mode==='all'?'発表スキップの除外を解除すると書き出せます。':partial?'書き出すアセットにチェックしてください。':'書き出すページにチェックしてください。');
      else if(format==='html')info.push(partial?'1アセットを1ページにして、1つのHTMLにまとめます。':'動きを含む1つのHTMLにまとめます。');
      else if(format==='pdf')info.push('対象をまとめて印刷画面で開きます。');
      else info.push(count>1?count+'枚の画像をZIPにまとめます。':'1枚の画像ファイルを保存します。');
      if(result.omitted)info.push(result.omitted+'件を除外（対象なし・非表示・スキップ指定）。');
      byId('export-summary').textContent=info.join('');
    }
    byId('export-asset-add').onclick=()=>{
      state();const pageId=ctx.page().id, ids=ctx.selected().slice();let added;
      if(ctx.change(doc=>{added=A.add(doc,pageId,ids);})){registeredMode();sync();ctx.toast('「'+added.name+'」を書き出しアセットに追加しました。');}
    };
    panel.querySelectorAll('[data-export-mode]').forEach(tab=>{
      tab.onclick=()=>{state();setMode(tab.dataset.exportMode);};
      tab.onkeydown=event=>{
        const offset=event.key==='ArrowRight'?1:event.key==='ArrowLeft'?-1:0;
        if(!offset&&!['Home','End'].includes(event.key))return;
        event.preventDefault();event.stopPropagation();
        const index=event.key==='Home'?0:event.key==='End'?modes.length-1:(modes.indexOf(current.mode)+offset+modes.length)%modes.length;
        setMode(modes[index]);byId('export-'+modes[index]+'-tab').focus();
      };
    });
    panel.querySelectorAll('[data-export-pages]').forEach(button=>button.onclick=()=>{
      state();current.pageIds=new Set(button.dataset.exportPages==='all'?ctx.document().pages.map(page=>page.id):button.dataset.exportPages==='current'?[ctx.page().id]:[]);sync();
    });
    for(const id of fields)byId(id).addEventListener('change',()=>{saveState();sync();});
    byId('export-exclude-skipped').onchange=()=>{saveState();sync();};
    byId('export-details').addEventListener('toggle',saveState);
    panel.addEventListener('keydown',event=>{
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'&&!event.isComposing){
        event.preventDefault();event.stopPropagation();
        const active=document.activeElement;if(active?.matches('.export-asset-name'))active.blur();
        ctx.onHistory(event.shiftKey);sync();
      }
    });
    async function save() {
      if(busy)return;
      state();sync();saveState();
      const format=byId('export-format').value, padding=Number(byId('export-padding').value), scale=Number(byId('export-scale').value), background=byId('export-background').value;
      if(!Number.isFinite(padding)||padding<0||padding>1000)throw new Error('余白は0〜1000pxで指定してください。');
      if(format==='png'&&(!Number.isFinite(scale)||scale<=0||scale>1000))throw new Error('PNGの倍率は0より大きく1000以下で指定してください。');
      const frozen=C.clone(ctx.document()), mode=current.mode, options={padding,scale,background};
      const {entries,omitted}=T.collect(frozen,targetOptions());
      if(!entries.length)throw new Error(mode==='assets'?'書き出せるアセットにチェックしてください。':'書き出すページにチェックしてください。');
      // 対象・名前・設定を開始時点で固定し、処理中の編集や作品タブ切替の影響を受けない。
      busy=true;sync();
      try {
        if(format==='html'){
          const output=T.htmlDocument(frozen,entries,{padding});
          const html=await root.IlapoPlaybackExport.buildHTML(output);
          ctx.download(html,ctx.fileName(frozen.name,'.play.html'),'text/html');
        }else if(format==='pdf'){
          await E.print(entries,{padding,title:frozen.name});
        }else{
          const files=Object.create(null), used=new Set();let total=0;
          for(const entry of entries){
            const base=ctx.fileName(entry.name,'').replace(/[. ]+$/,'')||'画像';let name=base+'.'+format, index=2;
            while(used.has(name.toLowerCase()))name=base+'_'+(index++)+'.'+format;
            used.add(name.toLowerCase());
            const output=format==='png'?await E.png(entry.page,{...options,selectionIds:entry.selectionIds}):new Blob([S.exportPage(entry.page,{...options,selectionIds:entry.selectionIds})],{type:'image/svg+xml'});
            const bytes=new Uint8Array(await output.arrayBuffer());total+=bytes.length;
            if(total>64*1024*1024)throw new Error('書き出しの合計が64MBを超えました。対象の数やPNGの倍率を減らしてください。');
            files[name]=bytes;
          }
          if(entries.length===1){const [name,bytes]=Object.entries(files)[0];ctx.download(bytes,name,format==='png'?'image/png':'image/svg+xml');}
          else ctx.download(root.fflate.zipSync(files,{level:0}),ctx.fileName(frozen.name+(mode==='assets'?'_アセット_':'_ページ_')+format.toUpperCase(),'.zip'),'application/zip');
        }
        ctx.toast(format==='pdf'?'印刷画面を開きました。':format.toUpperCase()+'を'+entries.length+(mode==='assets'?'件':'ページ')+'書き出しました。'+(omitted?'対象外の'+omitted+'件は除外しました。':''));
      }finally{busy=false;sync();}
    }
    return Object.freeze({sync,save});
  }
  root.IlapoExportUI=Object.freeze({create});
}(globalThis));
