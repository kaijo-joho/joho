/* illustSlide: キャンバスと並べて使うページ一覧。文書の変更は既存の履歴へ渡す。 */
(function () {
  'use strict';
  function create(ctx) {
    const C=window.IlapoCore,S=window.IlapoSVG,esc=ctx.esc;
    let lastDocument=null,lastPage=null;
    const pageButton=(action,label,icon,disabled=false)=>`<button type="button" id="pages-${action}" data-page-command="${action}" aria-label="${label}" data-tip="${label}" ${disabled?'disabled':''}>${ctx.icon(icon)}</button>`;
    function open() {
      const doc=ctx.document(),current=ctx.page(),documentId=doc.id;
      const reveal=lastDocument!==documentId||lastPage!==current.id;
      lastDocument=documentId;lastPage=current.id;
      const toolbar=pageButton('add','ページを追加','plus')+pageButton('duplicate','このページを複製','duplicate')+pageButton('rename','ページ名を変更','edit')+pageButton('delete','このページを削除','delete',doc.pages.length===1);
      const rows=doc.pages.map((page,index)=>`<div class="page-card ${page.id===current.id?'selected':''}"><button type="button" class="page-pick" id="page-pick-${esc(page.id)}" data-page-pick="${index}" data-page-id="${esc(page.id)}" aria-label="${index+1}. ${esc(page.name)}" ${page.id===current.id?'aria-current="page"':''}><img class="page-thumb" alt="" loading="lazy" src="data:image/svg+xml,${esc(encodeURIComponent(S.exportPage(page)))}"><span class="page-label"><strong>${index+1}</strong><span>${esc(page.name)}</span></span></button><div class="page-moves"><button type="button" id="page-before-${esc(page.id)}" data-page-id="${esc(page.id)}" data-page-move="${index},-1" aria-label="${esc(page.name)}を前へ" data-tip="前へ移動" ${index===0?'disabled':''}>${ctx.icon('up')}</button><button type="button" id="page-after-${esc(page.id)}" data-page-id="${esc(page.id)}" data-page-move="${index},1" aria-label="${esc(page.name)}を後へ" data-tip="後へ移動" ${index===doc.pages.length-1?'disabled':''}>${ctx.icon('down')}</button></div></div>`).join('');
      ctx.showInspector('pages','ページ',`<div class="page-toolbar" aria-label="ページの操作">${toolbar}</div><div id="page-rows" class="page-cards">${rows}</div>`,null);
      const body=ctx.inspectorBody?.()||document.getElementById('inspector-body');
      const valid=()=>ctx.document().id===documentId;
      body.querySelectorAll('[data-page-pick]').forEach(button=>button.onclick=()=>{if(valid())ctx.selectPage(button.dataset.pageId);});
      body.querySelectorAll('[data-page-move]').forEach(button=>button.onclick=()=>{
        if(!valid())return;
        const id=button.dataset.pageId,delta=Number(button.dataset.pageMove.split(',')[1]);
        if(ctx.document().pages.some(page=>page.id===id))ctx.change(doc=>C.movePage(doc,id,delta));
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
