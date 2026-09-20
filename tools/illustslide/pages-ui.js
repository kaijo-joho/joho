/* illustSlide: キャンバスと並べて使うページ一覧。文書の変更は既存の履歴へ渡す。 */
(function () {
  'use strict';
  function create(ctx) {
    const C=window.IlapoCore,S=window.IlapoSVG,esc=ctx.esc;
    let lastDocument=null,lastPage=null,bindings=null;
    const pageButton=(action,label,icon,disabled=false)=>`<button type="button" id="pages-${action}" data-page-command="${action}" aria-label="${label}" data-tip="${label}" ${disabled?'disabled':''}>${ctx.icon(icon)}</button>`;
    const moreIcon=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';
    function open() {
      bindings?.abort();bindings=new AbortController();
      const doc=ctx.document(),current=ctx.page(),documentId=doc.id,session=ctx.session?.();
      const valid=()=>ctx.document().id===documentId&&ctx.session?.()===session;
      const reveal=lastDocument!==documentId||lastPage!==current.id;
      lastDocument=documentId;lastPage=current.id;
      const toolbar=pageButton('add','ページを追加','plus')+pageButton('duplicate','このページを複製','duplicate')+pageButton('rename','ページ名を変更','edit')+pageButton('delete','このページを削除','delete',doc.pages.length===1);
      const rows=doc.pages.map((page,index)=>{
        const skipped=page.skip===true;
        const menu=`<div class="page-more-menu" popover="auto" id="page-more-menu-${esc(page.id)}"><button type="button" data-page-skip="${esc(page.id)}" aria-pressed="${skipped}">${skipped?'発表スキップを解除':'発表スキップ'}</button><button type="button" data-page-notes="${esc(page.id)}">発表者ノートを編集</button></div>`;
        return `<div class="page-card ${page.id===current.id?'selected':''} ${skipped?'presentation-skipped':''}"><button type="button" class="page-pick" id="page-pick-${esc(page.id)}" data-page-pick="${index}" data-page-id="${esc(page.id)}" aria-label="${index+1}. ${esc(page.name)}${skipped?'（発表スキップ）':''}" ${page.id===current.id?'aria-current="page"':''}><img class="page-thumb" alt="" loading="lazy" src="data:image/svg+xml,${esc(encodeURIComponent(S.exportPage(page)))}"><span class="page-label"><strong>${index+1}</strong><span>${esc(page.name)}</span>${skipped?'<em>発表スキップ</em>':''}</span></button><div class="page-moves"><button type="button" id="page-before-${esc(page.id)}" data-page-id="${esc(page.id)}" data-page-move="${index},-1" aria-label="${esc(page.name)}を前へ" data-tip="前へ移動" ${index===0?'disabled':''}>${ctx.icon('up')}</button><button type="button" id="page-after-${esc(page.id)}" data-page-id="${esc(page.id)}" data-page-move="${index},1" aria-label="${esc(page.name)}を後へ" data-tip="後へ移動" ${index===doc.pages.length-1?'disabled':''}>${ctx.icon('down')}</button><button type="button" class="page-more" aria-haspopup="true" data-page-more="${esc(page.id)}" aria-label="${esc(page.name)}の操作メニュー" aria-expanded="false" aria-controls="page-more-menu-${esc(page.id)}" data-tip="ページの操作">${moreIcon()}</button>${menu}</div></div>`;
      }).join('');
      const notes=current.notes===undefined?'':current.notes;
      ctx.showInspector('pages','ページ',`<div class="page-toolbar" aria-label="ページの操作">${toolbar}</div><div class="page-notes"><label for="page-notes">発表者ノート</label><textarea id="page-notes" maxlength="100000" rows="5" placeholder="発表中だけに使うメモ">${esc(notes)}</textarea><p class="muted">作品へすぐ反映します。ノートは投影画面や画像・PDF・配布用の再生HTMLには含めません。</p></div><div id="page-rows" class="page-cards">${rows}</div>`,null,event=>{
        const notesElement=document.getElementById('page-notes'),pageId=current.id;
        if(!valid()||!notesElement||ctx.page().id!==pageId||event?.target!==notesElement)return;
        const notes=notesElement.value;
        ctx.change(next=>{const target=next.pages.find(page=>page.id===pageId);if(target&&(target.notes||'')!==notes)target.notes=notes;});
      },{auto:true,target:current.name});
      const body=ctx.inspectorBody?.()||document.getElementById('inspector-body');
      body.querySelectorAll('[data-page-pick]').forEach(button=>button.onclick=()=>{if(valid())ctx.selectPage(button.dataset.pageId);});
      body.querySelectorAll('[data-page-move]').forEach(button=>button.onclick=()=>{
        if(!valid())return;
        const id=button.dataset.pageId,delta=Number(button.dataset.pageMove.split(',')[1]);
        if(ctx.document().pages.some(page=>page.id===id))ctx.change(doc=>C.movePage(doc,id,delta));
      });
      body.querySelectorAll('[data-page-more]').forEach(button=>{
        const menu=body.querySelector('#page-more-menu-'+CSS.escape(button.dataset.pageMore));
        let timer=0,held=false;
        const close=focus=>{clearTimeout(timer);held=false;if(menu.matches(':popover-open'))menu.hidePopover();button.setAttribute('aria-expanded','false');if(focus&&button.isConnected)button.focus();};
        const show=focus=>{
          if(!valid()||!button.isConnected||!button.getClientRects().length||button.closest('[inert]'))return;
          clearTimeout(timer);menu.showPopover();button.setAttribute('aria-expanded','true');
          const r=button.getBoundingClientRect(),m=menu.getBoundingClientRect();
          menu.style.left=Math.max(8,Math.min(innerWidth-m.width-8,r.right-m.width))+'px';
          menu.style.top=Math.max(8,Math.min(innerHeight-m.height-8,r.bottom+m.height+4<innerHeight?r.bottom+4:r.top-m.height-4))+'px';
          if(focus)menu.querySelector('button')?.focus();
        };
        const later=()=>{clearTimeout(timer);timer=setTimeout(()=>{if(!held&&!menu.matches(':hover')&&!menu.contains(document.activeElement))close(false);},180);};
        button.onclick=()=>{if(held){close(false);}else{held=true;show(false);}};
        button.onpointerenter=event=>{if(event.pointerType==='mouse')show(false);};button.onpointerleave=later;
        menu.onpointerenter=()=>clearTimeout(timer);menu.onpointerleave=later;
        menu.addEventListener('toggle',()=>{button.setAttribute('aria-expanded',String(menu.matches(':popover-open')));if(!menu.matches(':popover-open'))held=false;});
        const key=event=>{if(event.key==='Escape'&&menu.matches(':popover-open')){event.preventDefault();event.stopPropagation();close(true);}else if(event.key==='ArrowDown'&&event.target===button){event.preventDefault();held=true;show(true);}};
        button.addEventListener('keydown',key);menu.addEventListener('keydown',key);
        body.addEventListener('scroll',()=>close(false),{capture:true,signal:bindings.signal});
        window.addEventListener('resize',()=>close(false),{signal:bindings.signal});
        bindings.signal.addEventListener('abort',()=>close(false),{once:true});
      });
      body.querySelectorAll('[data-page-skip]').forEach(button=>button.onclick=()=>{
        if(!valid())return;
        const id=button.dataset.pageSkip;
        if(ctx.change(doc=>{const target=doc.pages.find(page=>page.id===id);if(target)target.skip=!target.skip;})){open();requestAnimationFrame(()=>body.querySelector(`[data-page-more="${CSS.escape(id)}"]`)?.focus());}
      });
      body.querySelectorAll('[data-page-notes]').forEach(button=>button.onclick=()=>{
        if(!valid())return;
        button.closest('[popover]').hidePopover();ctx.selectPage(button.dataset.pageNotes);
        requestAnimationFrame(()=>document.getElementById('page-notes')?.focus());
      });
      body.querySelectorAll('[data-page-command]').forEach(button=>button.onclick=()=>{
        if(!valid())return;
        const page=ctx.page(),id=page.id,action=button.dataset.pageCommand;
        if(action==='add'){
          const next=C.createPage('ページ '+(ctx.document().pages.length+1),page.board);
          if(ctx.change(doc=>doc.pages.push(next)))ctx.selectPage(next.id);
        }else if(action==='duplicate'){
          let next;if(ctx.change(doc=>next=C.duplicatePage(doc,id)))ctx.selectPage(next);
        }else if(action==='rename'){
          ctx.showDialog('ページ名',`<label>名前<input id="page-name" maxlength="120" required value="${esc(page.name)}"></label>`,'変更',()=>{
            const name=document.getElementById('page-name').value.trim();
            if(!name)throw Error('ページ名を入力してください。');
            ctx.change(doc=>doc.pages.find(page=>page.id===id).name=name);
          });
        }else if(action==='delete'&&ctx.document().pages.length>1){
          const pages=ctx.document().pages,index=pages.findIndex(page=>page.id===id),next=pages[index+1]||pages[index-1];
          ctx.showDialog('ページを削除',`<p>「${esc(page.name)}」と、そのページの図形を削除します。元に戻す操作で取り消せます。</p>`,'削除',()=>{
            if(ctx.change(doc=>C.removePage(doc,id)))ctx.selectPage(next.id);
          });
        }
      });
      body.querySelector('#page-rows').addEventListener('keydown',event=>{
        const button=event.target.closest('[data-page-pick]');
        if(!button||!['ArrowUp','ArrowDown','Home','End'].includes(event.key)||!valid())return;
        event.preventDefault();
        const pages=ctx.document().pages,index=pages.findIndex(page=>page.id===button.dataset.pageId);
        const next=event.key==='Home'?0:event.key==='End'?pages.length-1:Math.max(0,Math.min(pages.length-1,index+(event.key==='ArrowDown'?1:-1)));
        ctx.selectPage(pages[next].id);
        document.getElementById('page-pick-'+pages[next].id)?.focus();
      });
      if(reveal)queueMicrotask(()=>{
        if(!valid())return;
        body.querySelector('[aria-current="page"]')?.scrollIntoView({block:'nearest'});
      });
    }
    return Object.freeze({open});
  }
  window.IlapoPagesUI=Object.freeze({create});
}());
