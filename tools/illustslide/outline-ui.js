/* アウトラインの変換内容を非モーダルで確認する。 */
(function(){
  'use strict';
  function create(ctx){
    function open(){
      const O=window.IlapoOutline,T=window.IlapoTextOutline,C=window.IlapoCore,$=id=>document.getElementById(id);
      const isVisible=(object,page=ctx.page())=>!!object&&(ctx.isVisible?ctx.isVisible(object,page):true);
      const isLocked=(object,page=ctx.page())=>!!object&&(ctx.isLocked?ctx.isLocked(object,page):!!object.locked);
      // Keep source as the complete raw page: filtering it would delete hidden objects on apply.
      const source=C.clone(ctx.page()),ids=ctx.selected().filter(id=>{const object=source.objects.find(item=>item.id===id);return isVisible(object,source)&&!isLocked(object,source);}),scope=ctx.scope(),info=O.inspect(source,ids);
      if(!ids.length){ctx.showInspector('outline','アウトライン化','<p class="muted">表示中で固定されていない線のある図形や文字を選ぶと、塗りのあるパスへ変換できます。</p>',null);return;}
      if(!info.lines&&!info.text){ctx.showInspector('outline','アウトライン化','<p class="muted">線のある図形や文字を選ぶと、塗りのあるパスへ変換できます。</p>',null);return;}
      let generation=0,cache=null;
      const fonts=T.fonts(),fontDefault=source.objects.some(o=>ids.includes(o.id)&&(o.label?.style.fontFamily||o.style.fontFamily)==='serif')?'serif':'sans';
      ctx.showInspector('outline','アウトライン化',`<p>線や文字の見た目を、アンカーで編集できるパスに変換します。</p>
        <label class="check"><input type="checkbox" id="outline-lines" ${info.lines?'checked':'disabled'}>線を塗りのあるパスに（${info.lines}個）</label>
        <label class="check"><input type="checkbox" id="outline-text" ${info.text?'checked':'disabled'}>文字をパスに（${info.text}個）</label>
        <label ${info.text?'':'hidden'}>文字の変換用フォント<select id="outline-font">${fonts.map(font=>`<option value="${ctx.esc(font.id)}" ${font.id===fontDefault?'selected':''}>${ctx.esc(font.label)}</option>`).join('')}</select></label>
        ${info.text?'<p class="muted">変換用フォントで文字の形や折り返しが変わる場合があります。太字・斜体、上付き・下付きも反映します。</p><p class="muted">変換後は文章として編集できなくなります。元の文字を残す場合は先に複製してください。</p>':''}
        ${info.images?'<p class="muted">画像は変換せず、そのまま保持します。</p>':''}
        <button type="button" id="outline-preview">プレビューを更新</button>
        <p id="outline-message" role="status"></p><ul id="outline-notes" class="muted"></ul>
        <p class="muted">「アウトライン化」で確定します。閉じると元の図形を保持し、確定後もUndoで戻せます。</p>`,
        'アウトライン化',()=>{
          if(!active()||!cache||cache.key!==key())throw Error('プレビューの完了を待ってから適用してください。');
          const result=cache.result;
          if(ctx.changePage(p=>{p.objects=C.clone(result.page.objects);if(result.page.layers)p.layers=C.clone(result.page.layers);if(result.page.animations)p.animations=C.clone(result.page.animations);})){ctx.finish(result.ids);}
        },{preview:build});
      const body=$('inspector-body'),anchor=$('outline-lines'),submit=$('inspector-submit');
      function active(){return anchor.isConnected&&body.contains(anchor)&&anchor===$('outline-lines')&&ctx.isOpen()&&ctx.scope()===scope;}
      function read(){return {lines:$('outline-lines').checked,text:$('outline-text').checked,fontId:$('outline-font').value};}
      function key(){return JSON.stringify(read());}
      async function build(){
        const ticket=++generation;if(!active())return;
        const config=read(),configKey=key();if(cache?.key===configKey)return;
        cache=null;submit.disabled=true;ctx.clearPreview();$('outline-font').disabled=!config.text;
        const message=$('outline-message'),notes=$('outline-notes');notes.replaceChildren();
        if(!config.lines&&!config.text){message.textContent='変換する線または文字を選んでください。';return;}
        message.textContent=config.text?'変換用フォントを読み込み、プレビューを作成しています…':'輪郭のプレビューを作成しています…';
        try{
          if(config.text)await T.prepare(config.fontId);
          if(!active()||ticket!==generation||configKey!==key())return;
          const result=O.convertPage(source,ids,config);
          if(!active()||ticket!==generation)return;
          ctx.previewChange(p=>{p.objects=C.clone(result.page.objects);if(result.page.layers)p.layers=C.clone(result.page.layers);if(result.page.animations)p.animations=C.clone(result.page.animations);});
          cache={key:configKey,result};submit.disabled=!result.converted;
          message.textContent=result.converted?`${result.converted}個の変換後の見た目を表示しています。`:'変換できる線・文字がありません。';
          for(const note of result.warnings){const item=document.createElement('li');item.textContent=note;notes.append(item);}
        }catch(error){if(active()&&ticket===generation){ctx.clearPreview();message.textContent=error.message;submit.disabled=true;}}
      }
      $('outline-preview').onclick=build;
      submit.disabled=true;queueMicrotask(build);
    }
    return Object.freeze({open});
  }
  window.IlapoOutlineUI=Object.freeze({create});
}());
