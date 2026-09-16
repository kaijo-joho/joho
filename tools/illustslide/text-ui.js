/* illustSlide: 文字をキャンバスで確認しながら入力する。 */
(function() {
  'use strict';
  const C=window.IlapoCore;
  function create(ctx) {
    const $=id=>document.getElementById(id),esc=ctx.esc;
    let draft=null;
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
      let runsChanged=false;
      let chars=model.runs.flatMap(run=>run.text.split('').map(text=>({text,script:run.script}))),previous=chars.map(c=>c.text).join('');
      let align=isLabel?model.align:source.layout?.align||'left';
      const style=model.style,initialWidth=source.layout?.width||Math.max(style.fontSize*5,b.width),initialScope=scope(),id=source.id;
      const alignNames={left:'左揃え',center:'中央揃え',right:'右揃え'};
      const alignment=Object.entries(alignNames).map(([key,name])=>`<button type="button" data-text-align="${key}" aria-label="${name}" data-tip="${name}" aria-pressed="${align===key}">${ctx.icon('text-'+key)}</button>`).join('');
      const markup=`<label>文章<textarea id="text-input" maxlength="${C.LIMITS.textLength}" spellcheck="false">${esc(previous)}</textarea></label>
        <div class="text-tools" role="group" aria-label="選択した文字の上付き・下付き"><button type="button" data-script="normal" aria-label="通常の文字にする">x</button><button type="button" data-script="super" aria-label="上付きにする">x²</button><button type="button" data-script="sub" aria-label="下付きにする">x₂</button></div>
        <div id="text-preview" aria-label="入力した文字の書式プレビュー"></div>
        <div class="text-align-buttons" role="group" aria-label="文字の揃え方">${alignment}</div>
        ${isLabel?`<label>図形内の余白（px）<input id="text-padding" type="number" required min="0" max="10000000" step="any" value="${model.padding}"></label><p class="muted">図形の中央に配置し、図形の幅に合わせて折り返します。</p>`:`<label class="check"><input id="text-wrap" type="checkbox" ${source.layout?.width?'checked':''}>幅を指定して折り返す</label><label>文字幅（px）<input id="text-width" type="number" required min="0.01" max="10000000" step="any" value="${initialWidth}" ${source.layout?.width?'':'disabled'}></label>`}
        <div class="fields text-font-fields"><label>文字サイズ（px）<input id="text-font-size" type="number" required min="0.01" max="10000000" step="any" value="${style.fontSize}"></label><label>書体<select id="text-font-family"><option value="sans-serif">ゴシック</option><option value="serif">明朝</option><option value="monospace">等幅</option></select></label></div>
        <div class="row"><label class="check"><input id="text-bold" type="checkbox" ${style.bold?'checked':''}>太字</label><label class="check"><input id="text-italic" type="checkbox" ${style.italic?'checked':''}>斜体</label></div>
        <details><summary>文字の色</summary><div class="swatches">${ctx.palette.map(color=>`<button type="button" data-text-color="${color}" style="--swatch:${color}" aria-label="文字色 ${color}"></button>`).join('')}</div>
        <div class="row text-color-row"><input id="text-color-picker" type="color" aria-label="自由な文字色"><input id="text-color-hex" maxlength="7" aria-label="文字色の16進数"><button type="button" id="text-color-none">色なし</button></div>
        <div class="fields three">${['R','G','B'].map(key=>`<label>${key}<input data-text-rgb="${key}" type="number" required min="0" max="255" step="1"></label>`).join('')}</div></details>
        <p id="text-fit-note" class="muted" hidden></p><p class="muted">入力中はキャンバスで確認できます。「適用」で確定します。</p>
        ${isLabel&&source.label?'<button type="button" id="text-remove-label" class="text-remove-label">図形内の文字を削除</button>':''}`;
      function runs() {
        if(!runsChanged)return C.clone(model.runs);
        const result=[],segments=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(previous)].map(s=>({text:s.segment,index:s.index})):Array.from(previous).map((text,index)=>({text,index}));
        let fallbackIndex=0;
        for(const segment of segments) {
          const index=typeof Intl.Segmenter==='function'?segment.index:fallbackIndex;fallbackIndex+=segment.text.length;
          const script=chars[index]?.script||'normal',last=result.at(-1);
          if(last?.script===script)last.text+=segment.text;else result.push({text:segment.text,script});
        }
        return result.length?result:[{text:'',script:'normal'}];
      }
      function read() {
        const value=C.clone(source),fill=$('text-color-hex').value;
        if(fill!=='none'&&!/^#[0-9a-f]{6}$/i.test(fill)) throw Error('文字色は # と6桁の16進数で入力してください。');
        const nextStyle={...style,fill,fontSize:Number($('text-font-size').value),fontFamily:$('text-font-family').value,bold:$('text-bold').checked,italic:$('text-italic').checked};
        if(isLabel)value.label={runs:runs(),style:nextStyle,align,padding:Number($('text-padding').value)};
        else {value.runs=runs();value.style=nextStyle;const width=$('text-wrap').checked?Number($('text-width').value):null;if(source.layout||width!==null||align!=='left')value.layout={width,align};}
        return C.validateObject(value);
      }
      function mutate(value) {
        return page=>{
          if(scope()!==initialScope)throw Error('編集中のページが変わりました。文字を選び直してください。');
          if(isNew)page.objects.push(value);
          else {const index=page.objects.findIndex(o=>o.id===id&&o.type===source.type);if(index<0)throw Error('編集中の図形が見つかりません。');page.objects[index]=value;}
        };
      }
      function preview() {
        if(!previous.trim()){ctx.clearPreview();return;}
        const value=read();ctx.previewChange(mutate(value));
        const note=$('text-fit-note');note.hidden=true;
        if(isLabel) {
          const label=T.shapeText(value),layout=label&&T.layout(label),base=G.bounds({...value,label:undefined,matrix:[1,0,0,1,0,0]}),height=base.height*Math.hypot(value.matrix[2],value.matrix[3]);
          if(layout&&layout.inkBounds.height>Math.max(0,height-Math.min(value.label.padding,height/2)*2)+.01){note.textContent='文字が図形の高さを超えています。文字サイズや図形の高さを調整してください。';note.hidden=false;}
        }
      }
      ctx.showInspector('text',isLabel?'図形内の文字':isNew?'文字を追加':'文字を編集',markup,'適用',()=>{
        if(!previous.trim())throw Error('文章を入力してください。');
        const value=read();if(!ctx.changePage(mutate(value)))return;
        if(isNew){draft=null;ctx.select([id]);}
      },{preview,target:isNew?'新しい文字':undefined});
      $('text-font-family').value=style.fontFamily;
      function color(value) {
        $('text-color-hex').value=value;
        const hex=value==='none'?'#000000':value;$('text-color-picker').value=hex;
        document.querySelectorAll('[data-text-rgb]').forEach((input,index)=>input.value=parseInt(hex.slice(1+index*2,3+index*2),16));
        document.querySelectorAll('[data-text-color]').forEach(button=>button.setAttribute('aria-pressed',String(button.dataset.textColor===value.toUpperCase())));
      }
      color(style.fill);
      const notify=()=>$('text-input').dispatchEvent(new Event('change',{bubbles:true}));
      function previewText() {
        $('text-preview').innerHTML=runs().map(run=>`<span class="text-script-${run.script}">${esc(run.text)}</span>`).join('');
      }
      let composing=false;
      function updateInput() {
        const next=$('text-input').value;if(next!==previous)runsChanged=true;let prefix=0,suffix=0;
        while(prefix<Math.min(previous.length,next.length)&&previous[prefix]===next[prefix])prefix++;
        while(suffix<Math.min(previous.length-prefix,next.length-prefix)&&previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;
        const inherited=chars[Math.max(0,prefix-1)]?.script||'normal';
        chars=[...chars.slice(0,prefix),...next.slice(prefix,next.length-suffix).split('').map(text=>({text,script:inherited})),...chars.slice(previous.length-suffix)];previous=next;previewText();
      }
      $('text-input').oncompositionstart=()=>{composing=true;};
      $('text-input').oncompositionend=()=>{composing=false;updateInput();};
      $('text-input').oninput=event=>{if(!composing&&!event.isComposing)updateInput();};
      const panel=$('inspector-body');
      panel.querySelectorAll('[data-script]').forEach(button=>{
        button.onmousedown=event=>event.preventDefault();
        button.onclick=()=>{
          const input=$('text-input'),start=input.selectionStart,end=input.selectionEnd;
          if(start===end){ctx.toast('上付き・下付きにする文字を範囲選択してください。');return;}
          runsChanged=true;
          const ranges=typeof Intl.Segmenter==='function'?[...new Intl.Segmenter('ja',{granularity:'grapheme'}).segment(previous)].map(s=>[s.index,s.index+s.segment.length]):[[start,end]];
          for(const [a,b] of ranges)if(a<end&&b>start)for(let i=a;i<b;i++)chars[i].script=button.dataset.script;
          previewText();notify();input.focus();input.setSelectionRange(start,end);
        };
      });
      panel.querySelectorAll('[data-text-align]').forEach(button=>button.onclick=()=>{align=button.dataset.textAlign;panel.querySelectorAll('[data-text-align]').forEach(b=>b.setAttribute('aria-pressed',String(b===button)));notify();});
      if(!isLabel)$('text-wrap').onchange=()=>{$('text-width').disabled=!$('text-wrap').checked;};
      panel.querySelectorAll('[data-text-color]').forEach(button=>button.onclick=()=>{color(button.dataset.textColor);notify();});
      $('text-color-picker').oninput=()=>color($('text-color-picker').value);
      $('text-color-hex').oninput=()=>{const value=$('text-color-hex').value;if(value==='none'||/^#[0-9a-f]{6}$/i.test(value))color(value);};
      $('text-color-none').onclick=()=>{color('none');notify();};
      panel.querySelectorAll('[data-text-rgb]').forEach(input=>input.oninput=()=>{const fields=[...panel.querySelectorAll('[data-text-rgb]')];if(fields.some(field=>!field.value||!field.checkValidity()))return;color('#'+fields.map(field=>Number(field.value).toString(16).padStart(2,'0')).join(''));});
      if($('text-remove-label'))$('text-remove-label').onclick=()=>ctx.changePage(page=>{const target=page.objects.find(o=>o.id===id);if(target)delete target.label;});
      previewText();
      if(isNew||document.activeElement.id==='canvas')$('text-input').focus();
    }
    return Object.freeze({open,add,get hasDraft(){return activeDraft();},cancelDraft(){draft=null;}});
  }
  window.IlapoTextUI=Object.freeze({create});
}());
