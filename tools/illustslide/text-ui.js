/* illustSlide: 文字をキャンバスで確認しながら入力する。 */
(function() {
  'use strict';
  const C=window.IlapoCore;
  function create(ctx) {
    const $=id=>document.getElementById(id);
    let draft=null,activeEditor=null,editorKey=null;
    const scope=()=>JSON.stringify([ctx.document().id,ctx.page().id]);
    const activeDraft=()=>!!draft&&draft.scope===scope()&&!ctx.selected().length&&ctx.isOpen();
    function add(point) {
      const size=Math.max(.2,ctx.standardSize()*.16);
      draft={scope:scope(),object:C.makeText(point.x,point.y,'',{fill:'#172B4D',stroke:'none',fontSize:size})};
      open();
    }
    function open(existing) {
      const source=existing?C.clone(existing):draft?.scope===scope()?C.clone(draft.object):null;
      if(!source||!['path','text'].includes(source.type)) return;
      if(existing) draft=null;
      const isNew=!existing,isLabel=source.type==='path',G=window.IlapoGeometry,T=window.IlapoTextLayout;
      const b=G.bounds(source),size=Math.max(.2,Math.min(24,b.height*.22||ctx.standardSize()*.16));
      const model=isLabel?source.label||{runs:[{text:'',script:'normal'}],style:C.normalizeStyle({fill:'#172B4D',stroke:'none',fontSize:size},true),align:'center',padding:Math.min(8,b.width*.08,b.height*.08)}:source;
      let align=isLabel?model.align:source.layout?.align||'left',inputEditor;
      const style=model.style,initialWidth=source.layout?.width||Math.max(style.fontSize*5,b.width),initialScope=scope(),id=source.id,key=initialScope+id;
      const restoreRange=editorKey===key&&activeEditor?.element===document.activeElement?activeEditor.selection():null;
      const focusInput=!!restoreRange||isNew||document.activeElement.id==='canvas'||!activeEditor?.element.isConnected;
      activeEditor?.destroy();editorKey=key;
      const alignNames={left:'左揃え',center:'中央揃え',right:'右揃え'};
      const alignment=Object.entries(alignNames).map(([value,name])=>`<button type="button" data-text-align="${value}" aria-label="${name}" data-tip="${name}" aria-pressed="${align===value}">${ctx.icon('text-'+value)}</button>`).join('');
      const markup=`<div class="text-input-label"><span id="text-input-label">文章</span><button type="button" id="text-select-all">全文選択</button></div>
        <div id="text-input" contenteditable="true" role="textbox" aria-multiline="true" aria-labelledby="text-input-label" spellcheck="false" tabindex="0"></div>
        <p id="text-format-target" class="muted"></p>
        <div class="text-tools" role="group" aria-label="選択した文字の書式"><button type="button" id="text-bold" aria-label="太字" data-tip="太字 ⌘B" aria-pressed="false"><strong>B</strong></button><button type="button" id="text-italic" aria-label="斜体" data-tip="斜体 ⌘I" aria-pressed="false"><i>I</i></button><button type="button" data-script="normal" aria-label="通常の文字にする" data-tip="通常の文字">x</button><button type="button" data-script="super" aria-label="上付きにする" data-tip="上付き">x²</button><button type="button" data-script="sub" aria-label="下付きにする" data-tip="下付き">x₂</button></div>
        <details id="text-colors"><summary>文字の色</summary><div class="swatches">${ctx.palette.map(color=>`<button type="button" data-text-color="${color}" style="--swatch:${color}" aria-label="文字色 ${color}"></button>`).join('')}</div>
        <div class="row text-color-row"><input id="text-color-picker" type="color" aria-label="自由な文字色"><input id="text-color-hex" maxlength="7" pattern="#[0-9a-fA-F]{6}|none" aria-label="文字色の16進数"><button type="button" id="text-color-none">色なし</button></div>
        </details>
        <details id="text-markdown-tools"><summary>Markdownから挿入</summary><label>記法で入力<textarea id="text-markdown-input" maxlength="${C.LIMITS.textLength}" spellcheck="false" placeholder="**太字** · *斜体* · x^2^ · H_2_O"></textarea></label><div id="text-markdown-preview" class="rich-text-preview" aria-label="Markdownの挿入プレビュー"></div><p id="text-markdown-note" class="muted"></p><button id="text-markdown-insert" type="button" disabled>文章へ挿入</button><p class="muted">選択中の文字を置き換え、範囲選択がなければカーソル位置へ挿入します。色は {{color=#2563EB | 文字}}。表・リンクなどの未対応記法は原文を残します。</p></details>
        <div class="text-align-buttons" role="group" aria-label="文字の揃え方">${alignment}</div>
        ${isLabel?`<label>図形内の余白（px）<input id="text-padding" type="number" required min="0" max="10000000" step="any" value="${model.padding}"></label><p class="muted">図形の中央に配置し、図形の幅に合わせて折り返します。</p>`:`<label class="check"><input id="text-wrap" type="checkbox" ${source.layout?.width?'checked':''}>幅を指定して折り返す</label><label>文字幅（px）<input id="text-width" type="number" required min="0.01" max="10000000" step="any" value="${initialWidth}" ${source.layout?.width?'':'disabled'}></label>`}
        <div class="fields text-font-fields"><label>文字サイズ（px）<input id="text-font-size" type="number" required min="0.01" max="10000000" step="any" value="${style.fontSize}"></label><label>書体<select id="text-font-family"><option value="sans-serif">ゴシック</option><option value="serif">明朝</option><option value="monospace">等幅</option></select></label></div>
        <p class="muted">揃え・サイズ・書体は文章全体に反映します。</p><p id="text-fit-note" class="muted" hidden></p><p class="muted">日本語は変換の確定だけで反映します。Enterで改行、⌘Zで元に戻せます。</p>
        ${isLabel&&source.label?'<button type="button" id="text-remove-label" class="text-remove-label">図形内の文字を削除</button>':''}`;
      function read() {
        const value=C.clone(source),nextStyle={...style,fontSize:Number($('text-font-size').value),fontFamily:$('text-font-family').value};
        if(isLabel)value.label={runs:inputEditor.runs(),style:nextStyle,align,padding:Number($('text-padding').value)};
        else {value.runs=inputEditor.runs();value.style=nextStyle;const width=$('text-wrap').checked?Number($('text-width').value):null;if(source.layout||width!==null||align!=='left')value.layout={width,align};}
        return C.validateObject(value);
      }
      function mutate(value) {
        return page=>{
          if(scope()!==initialScope)throw Error('編集中のページが変わりました。文字を選び直してください。');
          const index=page.objects.findIndex(o=>o.id===id&&o.type===source.type);
          if(index>=0)page.objects[index]=value;
          else if(isNew)page.objects.push(value);
          else throw Error('編集中の図形が見つかりません。');
        };
      }
      function preview() {
        if(!inputEditor.text().trim()){ctx.clearPreview();return;}
        const value=read();ctx.previewChange(mutate(value));fitNote(value);
      }
      function fitNote(value) {
        const note=$('text-fit-note');note.hidden=true;
        if(isLabel) {
          const label=T.shapeText(value),layout=label&&T.layout(label),base=G.bounds({...value,label:undefined,matrix:[1,0,0,1,0,0]}),height=base.height*Math.hypot(value.matrix[2],value.matrix[3]);
          if(layout&&layout.inkBounds.height>Math.max(0,height-Math.min(value.label.padding,height/2)*2)+.01){note.textContent='文字が図形の高さを超えています。文字サイズや図形の高さを調整してください。';note.hidden=false;}
        }
      }
      ctx.showInspector('text',isLabel?'図形内の文字':isNew?'文字を追加':'文字を編集',markup,'適用',()=>{
        if(!inputEditor||inputEditor.isComposing())return;
        if(!inputEditor.text().trim()&&isNew&&!ctx.page().objects.some(o=>o.id===id))return;
        const value=read();ctx.changePage(mutate(value));fitNote(value);
        if(isNew){draft=null;ctx.select([id]);}
      },{preview,target:isNew?'新しい文字':undefined});
      $('text-font-family').value=style.fontFamily;
      const panel=$('inspector-body'),notify=()=>$('text-input').dispatchEvent(new Event('change',{bubbles:true}));
      function color(value) {
        $('text-color-hex').value=value||'';$('text-color-hex').placeholder=value===null?'複数の色':'';
        const hex=!value||value==='none'?'#000000':value;$('text-color-picker').value=hex;
        panel.querySelectorAll('[data-text-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.textColor===value?.toUpperCase())));
      }
      function toolbar() {
        if(!inputEditor||!inputEditor.element.isConnected)return;
        const current=inputEditor.format(),range=inputEditor.selection();
        $('text-format-target').textContent=range.start===range.end?'書式はこれから入力する文字に反映':'書式は選択した文字に反映';
        for(const key of ['bold','italic'])$('text-'+key).setAttribute('aria-pressed',current[key]===null?'mixed':String(!!current[key]));
        panel.querySelectorAll('[data-script]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.script===current.script)));
        if(!document.activeElement.closest('#text-colors'))color(current.fill);
      }
      inputEditor=window.IlapoRichText.create($('text-input'),{runs:model.runs,style,limit:C.LIMITS.textLength,onChange:notify,onSelection:toolbar,onError:ctx.toast});activeEditor=inputEditor;
      panel.querySelectorAll('.text-tools button,#text-select-all,[data-text-color],#text-color-none').forEach(button=>button.onmousedown=event=>event.preventDefault());
      $('text-select-all').onclick=()=>{inputEditor.select(0,inputEditor.text().length);toolbar();};
      for(const key of ['bold','italic'])$('text-'+key).onclick=()=>inputEditor.apply({[key]:!inputEditor.format()[key]});
      panel.querySelectorAll('[data-script]').forEach(button=>button.onclick=()=>inputEditor.apply({script:button.dataset.script}));
      function applyColor(value,focus=true){color(value);inputEditor.apply({fill:value},focus);}
      panel.querySelectorAll('[data-text-color]').forEach(button=>button.onclick=()=>applyColor(button.dataset.textColor));
      $('text-color-picker').oninput=()=>applyColor($('text-color-picker').value,false);
      $('text-color-hex').oninput=()=>{const value=$('text-color-hex').value;if(value==='none'||/^#[0-9a-f]{6}$/i.test(value))applyColor(value,false);};
      $('text-color-none').onclick=()=>applyColor('none');
      panel.querySelectorAll('[data-text-align]').forEach(button=>button.onclick=()=>{align=button.dataset.textAlign;panel.querySelectorAll('[data-text-align]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));notify();});
      if(!isLabel)$('text-wrap').onchange=()=>{$('text-width').disabled=!$('text-wrap').checked;};
      $('text-font-family').onchange=()=>inputEditor.setStyle({...style,fontFamily:$('text-font-family').value});
      let markdown={runs:[],diagnostics:[]};
      function markdownPreview(){
        try{markdown=window.IlapoTextMarkdown.parse($('text-markdown-input').value);inputEditor.paint($('text-markdown-preview'),markdown.runs);$('text-markdown-note').textContent=markdown.diagnostics.map(d=>d.message).join(' ');$('text-markdown-insert').disabled=!$('text-markdown-input').value;}
        catch(error){markdown={runs:[],diagnostics:[]};$('text-markdown-note').textContent=error.message;$('text-markdown-insert').disabled=true;}
      }
      const markdownInput=$('text-markdown-input');
      markdownInput.oninput=event=>{event.stopPropagation();if(!event.isComposing)markdownPreview();};
      markdownInput.oncompositionend=()=>setTimeout(()=>{if(markdownInput.isConnected)markdownPreview();},0);
      $('text-markdown-insert').onclick=()=>{if(markdown.runs.length&&inputEditor.insert(markdown.runs)){$('text-markdown-input').value='';markdownPreview();}};
      if($('text-remove-label'))$('text-remove-label').onclick=()=>ctx.changePage(page=>{const target=page.objects.find(o=>o.id===id);if(target)delete target.label;});
      color(style.fill);toolbar();
      if(restoreRange)inputEditor.select(restoreRange.start,restoreRange.end);else if(focusInput)inputEditor.focus();
    }
    return Object.freeze({open,add,get hasDraft(){return activeDraft();},cancelDraft(){draft=null;activeEditor?.destroy();activeEditor=null;editorKey=null;}});
  }
  window.IlapoTextUI=Object.freeze({create});
}());
