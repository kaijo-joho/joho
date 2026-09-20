/* illustSlide: キャンバスと並べて使うページ一覧。文書の変更は既存の履歴へ渡す。 */
(function () {
  'use strict';
  function create(ctx) {
    const C=window.IlapoCore,S=window.IlapoSVG,esc=ctx.esc;
    let lastDocument=null,lastPage=null,bindings=null,drag=null,rendered=null,composingNotes=false;
    const notesOpen=new Map();
    const body=()=>ctx.inspectorBody?.()||document.getElementById('inspector-body');
    const scope=()=>ctx.session?.()??ctx.document().id;
    function rememberNotes(){
      if(!rendered?.rows.isConnected)return;
      const ids=new Set([...rendered.rows.querySelectorAll('[data-page-notes-for]')].filter(el=>el.open).map(el=>el.dataset.pageNotesFor));
      notesOpen.set(rendered.scope,ids);
    }
    function cancelDrag(){
      if(!drag)return;
      const state=drag;drag=null;
      cancelAnimationFrame(state.scrollFrame||0);
      try{if(state.handle.hasPointerCapture?.(state.pointerId))state.handle.releasePointerCapture(state.pointerId);}catch(_){}
      state.rows.forEach(row=>row.classList.remove('page-dragging','page-drop-before','page-drop-after'));
      document.documentElement.classList.remove('page-order-dragging');
    }
    function move(id,to){
      const from=ctx.document().pages.findIndex(page=>page.id===id);
      if(from<0||from===to)return;
      if(ctx.change(doc=>C.movePage(doc,id,to-from))){
        open();
        requestAnimationFrame(()=>body()?.querySelector(`[data-page-handle="${CSS.escape(id)}"]`)?.focus({preventScroll:true}));
      }
    }
    function dragStart(event){
      if(composingNotes){event.preventDefault();return;}
      if(event.button!==0||drag||ctx.isBusy?.())return;
      const handle=event.currentTarget,rows=[...body().querySelectorAll('[data-page-card]')],from=rows.indexOf(handle.closest('[data-page-card]'));
      if(from<0)return;
      event.preventDefault();handle.focus({preventScroll:true});
      body().querySelectorAll('.page-more-menu:popover-open').forEach(menu=>menu.hidePopover());
      drag={handle,rows,from,to:from,id:handle.dataset.pageHandle,pointerId:event.pointerId,startY:event.clientY,lastY:event.clientY,lastX:event.clientX,active:false,inside:true,document:ctx.document(),scope:scope(),pageId:ctx.page().id};
      handle.setPointerCapture?.(event.pointerId);
    }
    function updateDrop(){
      if(!drag)return;
      const r=body()?.getBoundingClientRect();
      drag.inside=!!r&&drag.lastX>=r.left&&drag.lastX<=r.right&&drag.lastY>=r.top&&drag.lastY<=r.bottom;
      drag.to=drag.from;
      drag.rows.forEach(row=>row.classList.remove('page-drop-before','page-drop-after'));
      if(!drag.active||!drag.inside)return;
      drag.rows.forEach((row,index)=>{
        const r=row.querySelector('.page-pick').getBoundingClientRect(),middle=r.top+r.height/2;
        if(index<drag.from&&drag.lastY<=middle+1)drag.to=Math.min(drag.to,index);
        if(index>drag.from&&drag.lastY>=middle-1)drag.to=Math.max(drag.to,index);
      });
      if(drag.to!==drag.from)drag.rows[drag.to].classList.add(drag.to<drag.from?'page-drop-before':'page-drop-after');
    }
    function safeDrag(){return drag&&drag.document===ctx.document()&&drag.scope===scope()&&drag.pageId===ctx.page().id&&drag.handle.isConnected&&!drag.handle.closest('[inert]')&&!!drag.handle.getClientRects().length&&!ctx.isBusy?.();}
    function autoScroll(){
      if(!safeDrag()){cancelDrag();return;}
      updateDrop();
      const panel=body(),r=panel.getBoundingClientRect(),amount=!drag.inside?0:drag.lastY<r.top+42?-12:drag.lastY>r.bottom-42?12:0,before=panel.scrollTop;
      if(amount){panel.scrollTop+=amount;updateDrop();}
      drag.scrollFrame=amount&&before!==panel.scrollTop?requestAnimationFrame(autoScroll):0;
    }
    function dragMove(event){
      if(!drag||event.pointerId!==drag.pointerId)return;
      if(!safeDrag()){cancelDrag();return;}
      drag.lastX=event.clientX;drag.lastY=event.clientY;
      if(!drag.active&&Math.abs(event.clientY-drag.startY)<5)return;
      drag.active=true;drag.rows[drag.from].classList.add('page-dragging');document.documentElement.classList.add('page-order-dragging');
      updateDrop();if(!drag.scrollFrame)drag.scrollFrame=requestAnimationFrame(autoScroll);
    }
    function dragFinish(event,cancelled){
      if(!drag||event.pointerId!==drag.pointerId)return;
      drag.lastX=event.clientX;drag.lastY=event.clientY;updateDrop();
      const state=drag,safe=safeDrag()&&state.active&&state.inside;
      cancelDrag();
      if(!cancelled&&safe)move(state.id,state.to);
    }
    const pageButton=(action,label,icon,disabled=false)=>`<button type="button" id="pages-${action}" data-page-command="${action}" aria-label="${label}" data-tip="${label}" ${disabled?'disabled':''}>${ctx.icon(icon)}</button>`;
    const moreIcon=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="5" r="1.5"></circle><circle cx="12" cy="12" r="1.5"></circle><circle cx="12" cy="19" r="1.5"></circle></svg>';
    const dragIcon=()=>'<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7 6h2m6 0h2M7 12h2m6 0h2M7 18h2m6 0h2"/></svg>';
    function open() {
      rememberNotes();cancelDrag();composingNotes=false;
      bindings?.abort();bindings=new AbortController();
      const doc=ctx.document(),current=ctx.page(),documentId=doc.id,session=ctx.session?.();
      const valid=()=>ctx.document().id===documentId&&ctx.session?.()===session;
      const documentScope=scope(),expanded=notesOpen.get(documentScope)||new Set();
      const reveal=lastDocument!==documentScope||lastPage!==current.id;
      lastDocument=documentScope;lastPage=current.id;
      const toolbar=pageButton('add','ページを追加','plus')+pageButton('duplicate','このページを複製','duplicate')+pageButton('rename','ページ名を変更','edit')+pageButton('delete','このページを削除','delete',doc.pages.length===1);
      const rows=doc.pages.map((page,index)=>{
        const skipped=page.skip===true;
        const menu=`<div class="page-more-menu" popover="auto" id="page-more-menu-${esc(page.id)}"><button type="button" data-page-skip="${esc(page.id)}" aria-pressed="${skipped}">${skipped?'発表スキップを解除':'発表スキップ'}</button></div>`;
        return `<div class="page-card ${page.id===current.id?'selected':''} ${skipped?'presentation-skipped':''}" data-page-card="${esc(page.id)}"><button type="button" class="page-pick" id="page-pick-${esc(page.id)}" data-page-pick="${index}" data-page-id="${esc(page.id)}" aria-label="${index+1}. ${esc(page.name)}${skipped?'（発表スキップ）':''}" ${page.id===current.id?'aria-current="page"':''}><img class="page-thumb" alt="" loading="lazy" draggable="false" src="data:image/svg+xml,${esc(encodeURIComponent(S.exportPage(page)))}"><span class="page-label"><strong>${index+1}</strong><span>${esc(page.name)}</span>${skipped?'<em>発表スキップ</em>':''}</span></button><div class="page-moves"><button type="button" class="page-order-handle" id="page-handle-${esc(page.id)}" data-page-handle="${esc(page.id)}" aria-label="${esc(page.name)}の順序をドラッグして変更" data-tip="ドラッグして順序変更。Alt+↑/↓でも移動できます" ${doc.pages.length===1?'disabled':''}>${dragIcon()}</button><button type="button" class="page-more" aria-haspopup="true" data-page-more="${esc(page.id)}" aria-label="${esc(page.name)}の操作メニュー" aria-expanded="false" aria-controls="page-more-menu-${esc(page.id)}" data-tip="ページの操作">${moreIcon()}</button>${menu}</div><details class="page-notes" id="page-notes-section-${esc(page.id)}" data-page-notes-for="${esc(page.id)}" ${expanded.has(page.id)?'open':''}><summary id="page-notes-toggle-${esc(page.id)}">発表者ノート</summary><textarea id="page-notes-${esc(page.id)}" data-page-notes-input="${esc(page.id)}" aria-label="${esc(page.name)}の発表者ノート" maxlength="100000" rows="4" placeholder="発表中だけに使うメモ">${esc(page.notes||'')}</textarea><p class="muted">投影画面や画像・PDF・再生HTMLには含めません。</p></details></div>`;
      }).join('');
      ctx.showInspector('pages','ページ',`<div class="page-toolbar" aria-label="ページの操作">${toolbar}</div><div id="page-rows" class="page-cards">${rows}</div>`,null,event=>{
        const element=event?.target;
        if(!valid()||!element?.matches('[data-page-notes-input]')||!body.contains(element))return;
        const notes=element.value,id=element.dataset.pageNotesInput;
        ctx.change(next=>{const target=next.pages.find(page=>page.id===id);if(target&&(target.notes||'')!==notes)target.notes=notes;});
      },{auto:true});
      const body=ctx.inspectorBody?.()||document.getElementById('inspector-body');
      body.addEventListener('compositionstart',()=>{composingNotes=true;},{signal:bindings.signal});
      body.addEventListener('compositionend',()=>{composingNotes=false;},{signal:bindings.signal});
      rendered={rows:body.querySelector('#page-rows'),scope:documentScope};
      body.querySelectorAll('[data-page-notes-for]').forEach(details=>{
        // Inspectorの位置によるdetails復元より、ページIDごとの状態を優先する。
        details.open=expanded.has(details.dataset.pageNotesFor);
        details.addEventListener('toggle',rememberNotes);
      });
      body.querySelectorAll('[data-page-pick]').forEach(button=>button.onclick=()=>{if(valid())ctx.selectPage(button.dataset.pageId);});
      body.querySelectorAll('[data-page-handle]').forEach(handle=>{
        handle.addEventListener('pointerdown',dragStart);handle.addEventListener('pointermove',dragMove);
        handle.addEventListener('pointerup',event=>dragFinish(event,false));
        handle.addEventListener('pointercancel',event=>dragFinish(event,true));handle.addEventListener('lostpointercapture',event=>dragFinish(event,true));
        handle.addEventListener('keydown',event=>{
          if(!valid()||!event.altKey||!['ArrowUp','ArrowDown'].includes(event.key)||ctx.isBusy?.())return;
          event.preventDefault();event.stopPropagation();
          const from=ctx.document().pages.findIndex(page=>page.id===handle.dataset.pageHandle),to=from+(event.key==='ArrowUp'?-1:1);
          if(from>=0&&to>=0&&to<ctx.document().pages.length)move(handle.dataset.pageHandle,to);
        });
      });
      body.querySelectorAll('[data-page-more]').forEach(button=>{
        const menu=body.querySelector('#page-more-menu-'+CSS.escape(button.dataset.pageMore));
        let timer=0,held=false;
        const close=focus=>{clearTimeout(timer);held=false;if(menu.matches(':popover-open'))menu.hidePopover();button.setAttribute('aria-expanded','false');if(focus&&button.isConnected)button.focus();};
        const show=focus=>{
          if(drag||!valid()||!button.isConnected||!button.getClientRects().length||button.closest('[inert]'))return;
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
    document.addEventListener('keydown',event=>{if(event.key==='Escape'&&drag){event.preventDefault();event.stopPropagation();cancelDrag();}},true);
    window.addEventListener('blur',cancelDrag);
    return Object.freeze({open,cancelDrag,get isDragging(){return !!drag;}});
  }
  window.IlapoPagesUI=Object.freeze({create});
}());
