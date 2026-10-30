(function(){
  'use strict';var M=OMRDesigner,S=OMRScene,$=function(id){return document.getElementById(id);};
  var definition=null,pageIndex=0,selected=null,undo=[],redo=[],dirty=false,sequence=0,range=null,drag=null;
  var token=Array.from(crypto.getRandomValues(new Uint8Array(6))).map(function(x){return x.toString(16).padStart(2,'0');}).join('');
  var lastEmitted='';
  function el(tag,text){var n=document.createElement(tag);if(text!==undefined)n.textContent=text;return n;}
  function notice(value,error){$('notice').textContent=value;$('notice').classList.toggle('error',!!error);}
  function action(fn){return async function(event){try{await fn.call(this,event);}catch(error){notice(error.message||String(error),true);}};}
  function page(){return definition.pages[pageIndex];}
  function current(){return page().elements.find(function(e){return e.id===selected;});}
  function changed(next,label){if(M.canonical(next)===M.canonical(definition))return;undo.push(M.clone(definition));if(undo.length>50)undo.shift();redo=[];if(!dirty)next.layout_version=M.version();definition=next;dirty=true;render();if(label)notice(label);}
  function mutate(fn,label){var next=M.clone(definition);fn(next,next.pages[pageIndex]);M.validate(next);changed(next,label);}
  function download(name,value,type){var blob=new Blob([value],{type:type||'application/json;charset=utf-8'}),url=URL.createObjectURL(blob),a=el('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},1000);}
  function kindName(e){return e.type==='text'?'テキスト':e.type==='free'?'自由記述欄':{single:'単一選択',multiple:'複数選択',digits:'数値・得点'}[(page().fields.find(function(f){return f.id===e.field_id;})||{}).kind]||'OMR';}
  function select(id){$('text-editor').blur();selected=id;range=null;render();}
  function properties(){var e=current();$('no-selection').hidden=!!e;$('selected-properties').hidden=!e;if(!e)return;
    $('component-type').textContent=kindName(e);$('component-id').textContent=e.id;
    ['x','y','width','height'].forEach(function(k){$(k).value=e[k];});
    $('text-properties').hidden=e.type!=='text';$('free-properties').hidden=e.type!=='free';$('omr-properties').hidden=e.type!=='omr';
    if(e.type==='text'&&document.activeElement!==$('text-editor')){
      $('text-editor').replaceChildren();e.runs.forEach(function(r){var span=el('span',r.text);span.style.fontSize=r.font_size+'pt';span.style.color=r.color;span.style.fontWeight=r.bold?'700':'400';span.style.fontStyle=r.italic?'italic':'normal';span.style.textDecoration=r.underline?'underline':'none';$('text-editor').append(span);});
      $('font-size').value=String(e.runs[0].font_size);$('font-color').value=e.runs[0].color;
      ['bold','italic','underline'].forEach(function(k){$(k).setAttribute('aria-pressed',String(e.runs[0][k]));});
    }
    if(e.type==='free'){$('free-label').value=e.label;$('free-lines').value=e.lines;}
    if(e.type==='omr'){var f=page().fields.find(function(f){return f.id===e.field_id;});$('field-label').value=f.label;$('required').checked=f.required;
      $('choice-properties').hidden=f.kind==='digits';$('digit-properties').hidden=f.kind!=='digits';$('count-properties').hidden=f.kind!=='multiple';
      if(f.kind==='digits'){$('digits').value=f.digits;$('min-value').value=f.min;$('max-value').value=f.max;}
      else{$('field-layout').value=f.layout||'row';$('options').value=f.options.map(function(o){return o.code+' | '+o.label;}).join('\n');$('min-select').value=f.min_select||0;$('max-select').value=f.max_select||1;}}
  }
  function render(){if(!definition)return;$('title').value=definition.title;$('year').value=definition.academic_year;$('paper').value=definition.paper.size;$('orientation').value=definition.paper.orientation;$('purpose').value=definition.purpose;
    $('version').textContent='版 '+definition.layout_version+(dirty?' · 編集中':' · 読込・保存済み');
    $('page').replaceChildren.apply($('page'),definition.pages.map(function(p,i){var o=el('option',p.number+' / '+p.side);o.value=i;return o;}));$('page').value=String(pageIndex);
    $('element-list').replaceChildren.apply($('element-list'),page().elements.map(function(e){var item=el('li'),b=el('button');b.classList.toggle('selected',e.id===selected);var f=e.type==='omr'?page().fields.find(function(f){return f.id===e.field_id;}):null;
      b.append(el('span',e.type==='text'?e.runs.map(function(r){return r.text;}).join('').slice(0,32):e.type==='free'?e.label:f.label));b.append(el('small',kindName(e)));b.addEventListener('click',function(){select(e.id);});item.append(b);return item;}));
    $('undo').disabled=!undo.length;$('redo').disabled=!redo.length;properties();preview();var canonical=M.canonical(definition);if(canonical!==lastEmitted){lastEmitted=canonical;window.dispatchEvent(new CustomEvent('omr-editor-change',{detail:M.clone(definition)}));}
  }
  async function preview(){var own=++sequence,error='';try{M.validate(definition);}catch(e){error=e.message;}
    $('validation').textContent=error||'13個の■・QR・年組番の位置を固定。部品の配置検査に合格しました。';$('validation').classList.toggle('invalid',!!error);$('save').disabled=$('print').disabled=!!error;
    try{var node=await S.render(M.clone(definition),pageIndex,token,{interactive:true,selected:selected});if(own!==sequence)return;var zoom=Number($('zoom').value);node.style.width=M.size(definition)[0]*3.7795275591*zoom+'px';node.style.height=M.size(definition)[1]*3.7795275591*zoom+'px';$('canvas').replaceChildren(node);bindCanvas(node);}catch(e){if(own===sequence)notice(e.message,true);}
  }
  function bindCanvas(svg){svg.addEventListener('pointerdown',function(event){var hit=event.target.closest('[data-hit],[data-resize]');if(!hit)return;event.preventDefault();var id=hit.getAttribute('data-hit')||hit.getAttribute('data-resize');selected=id;var e=current();var box=svg.getBoundingClientRect();drag={id:id,resize:hit.hasAttribute('data-resize'),startX:event.clientX,startY:event.clientY,x:e.x,y:e.y,width:e.width,height:e.height,ratioX:M.size(definition)[0]/box.width,ratioY:M.size(definition)[1]/box.height,base:M.clone(definition)};
      $('text-editor').blur();range=null;svg.setPointerCapture&&svg.setPointerCapture(event.pointerId);properties();});
    svg.addEventListener('pointermove',function(event){if(!drag)return;var dx=(event.clientX-drag.startX)*drag.ratioX,dy=(event.clientY-drag.startY)*drag.ratioY;
      var next=M.clone(drag.base),e=next.pages[pageIndex].elements.find(function(e){return e.id===drag.id;});var round=function(v){return Math.round(v*2)/2;};
      if(drag.resize){e.width=round(drag.width+dx);e.height=round(drag.height+dy);}else{e.x=round(drag.x+dx);e.y=round(drag.y+dy);}
      try{M.validate(next);definition=next;$('validation').textContent='配置を調整しています';var group=svg.querySelector('[data-element-id="'+drag.id+'"]');if(!drag.resize&&group)group.setAttribute('transform','translate('+(e.x-drag.x)+' '+(e.y-drag.y)+')');['x','y','width','height'].forEach(function(k){$(k).value=e[k];});}catch(error){$('validation').textContent=error.message;}
    });
    svg.addEventListener('keydown',function(event){if(event.key==='Escape'&&drag){definition=drag.base;drag=null;render();}});
    function finish(){if(!drag)return;var old=drag.base,next=definition;definition=old;drag=null;changed(next,'配置を変更しました。');render();}
    svg.addEventListener('pointerup',finish);svg.addEventListener('pointercancel',function(){if(drag){definition=drag.base;drag=null;render();}});
  }
  function inputRuns(){var result=[];function walk(n,style){if(n.nodeType===3){if(n.nodeValue)result.push(Object.assign({text:n.nodeValue},style));return;}if(n.nodeType!==1||['SCRIPT','STYLE','IFRAME','OBJECT'].includes(n.tagName))return;if(n.tagName==='BR'){result.push(Object.assign({text:'\n'},style));return;}
      var s=Object.assign({},style);if(n.style){if(n.style.fontSize)s.font_size=parseFloat(n.style.fontSize);if(n.style.color){var match=n.style.color.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);s.color=match?'#'+match.slice(1).map(function(x){return Number(x).toString(16).padStart(2,'0');}).join(''):n.style.color;}if(n.style.fontWeight)s.bold=['bold','700','800','900'].includes(n.style.fontWeight);if(n.style.fontStyle)s.italic=n.style.fontStyle==='italic';if(n.style.textDecoration)s.underline=n.style.textDecoration.includes('underline');}
      if(['B','STRONG'].includes(n.tagName))s.bold=true;if(['I','EM'].includes(n.tagName))s.italic=true;if(n.tagName==='U')s.underline=true;Array.from(n.childNodes).forEach(function(c){walk(c,s);});if(['DIV','P'].includes(n.tagName)&&n!==$('text-editor')&&n.nextSibling)result.push(Object.assign({text:'\n'},s));}
    walk($('text-editor'),{font_size:9,color:'#000000',bold:false,italic:false,underline:false});return result.length?result:[{text:'',font_size:9,color:'#000000',bold:false,italic:false,underline:false}];}
  function syncText(){var runs=inputRuns();mutate(function(d,p){p.elements.find(function(e){return e.id===selected;}).runs=runs;});}
  function format(property,value){var editor=$('text-editor'),selection=window.getSelection(),r=range&&editor.contains(range.commonAncestorContainer)?range.cloneRange():document.createRange();if(!range||!editor.contains(r.commonAncestorContainer)||r.collapsed)r.selectNodeContents(editor);
    var span=el('span'),fragment=r.extractContents();span.append(fragment);span.style[property]=value;r.insertNode(span);editor.focus();selection.removeAllRanges();var fresh=document.createRange();fresh.selectNodeContents(span);selection.addRange(fresh);range=fresh.cloneRange();syncText();}
  document.addEventListener('selectionchange',function(){var s=window.getSelection();if(s.rangeCount&&$('text-editor').contains(s.getRangeAt(0).commonAncestorContainer))range=s.getRangeAt(0).cloneRange();});
  $('text-editor').addEventListener('input',action(syncText));
  function insertPlain(event,value){event.preventDefault();var selection=window.getSelection();if(!selection.rangeCount)return;var r=selection.getRangeAt(0);r.deleteContents();r.insertNode(document.createTextNode(value));r.collapse(false);selection.removeAllRanges();selection.addRange(r);syncText();}
  $('text-editor').addEventListener('paste',action(function(e){insertPlain(e,e.clipboardData.getData('text/plain'));}));$('text-editor').addEventListener('drop',action(function(e){insertPlain(e,e.dataTransfer.getData('text/plain'));}));
  ['bold','italic','underline'].forEach(function(k){$(k).addEventListener('mousedown',function(e){e.preventDefault();});$(k).addEventListener('click',action(function(){var enabled=$(k).getAttribute('aria-pressed')!=='true';$(k).setAttribute('aria-pressed',String(enabled));format({bold:'fontWeight',italic:'fontStyle',underline:'textDecoration'}[k],enabled?{bold:'700',italic:'italic',underline:'underline'}[k]:{bold:'400',italic:'normal',underline:'none'}[k]);}));});
  $('font-size').addEventListener('change',action(function(){format('fontSize',Number(this.value)+'pt');}));$('font-color').addEventListener('change',action(function(){format('color',this.value);}));
  ['x','y','width','height'].forEach(function(k){$(k).addEventListener('change',action(function(){var value=Number($(k).value);mutate(function(d,p){p.elements.find(function(e){return e.id===selected;})[k]=value;},'配置・サイズを変更しました。');}));});
  $('free-label').addEventListener('input',action(function(){var value=this.value;mutate(function(d,p){p.elements.find(function(e){return e.id===selected;}).label=value;});}));$('free-lines').addEventListener('change',action(function(){var value=Number(this.value);mutate(function(d,p){p.elements.find(function(e){return e.id===selected;}).lines=value;});}));
  $('apply-field').addEventListener('click',action(function(){mutate(function(d,p){var e=p.elements.find(function(e){return e.id===selected;}),f=p.fields.find(function(f){return f.id===e.field_id;});f.label=$('field-label').value;f.required=$('required').checked;
      if(f.kind==='digits'){f.digits=Number($('digits').value);f.min=Number($('min-value').value);f.max=Number($('max-value').value);}else{f.layout=$('field-layout').value;f.options=$('options').value.split('\n').filter(function(x){return x.trim();}).map(function(line){var at=line.indexOf('|');if(at<0)throw Error('選択肢は 内部コード | 表示名 で記入してください');return{code:line.slice(0,at).trim(),label:line.slice(at+1).trim()};});if(f.kind==='multiple'){f.min_select=Number($('min-select').value);f.max_select=Number($('max-select').value);}}
      var minimum=M.minSize(f);e.width=Math.max(e.width,minimum[0]);e.height=Math.max(e.height,minimum[1]);},'読取欄の設定を更新しました。');}));
  document.querySelectorAll('[data-add]').forEach(function(button){button.addEventListener('click',action(function(){var type=button.dataset.add;var id;mutate(function(d){var e=M.add(d,pageIndex,['single','multiple','digits'].includes(type)?'omr':type,type);id=e.id;},'部品を追加しました。');select(id);}));});
  $('delete').addEventListener('click',action(function(){mutate(function(d){M.remove(d,pageIndex,selected);},'部品を削除しました。「元に戻す」で復元できます。');selected=null;render();}));
  $('undo').addEventListener('click',function(){if(!undo.length)return;redo.push(M.clone(definition));definition=undo.pop();definition.layout_version=M.version();dirty=true;selected=null;pageIndex=Math.min(pageIndex,definition.pages.length-1);render();});
  $('redo').addEventListener('click',function(){if(!redo.length)return;undo.push(M.clone(definition));definition=redo.pop();definition.layout_version=M.version();dirty=true;selected=null;render();});
  $('page').addEventListener('change',function(){pageIndex=Number(this.value);selected=null;render();});$('add-page').addEventListener('click',action(function(){var next=M.clone(definition);pageIndex=M.addPage(next);M.validate(next);changed(next,'ページを追加しました。裏面の識別マークは任意照合用です。');selected=null;render();}));$('zoom').addEventListener('change',preview);
  ['title','year','purpose'].forEach(function(k){$(k).addEventListener(k==='title'?'input':'change',action(function(){var value=k==='year'?Number($(k).value):$(k).value;mutate(function(d){d[k==='year'?'academic_year':k]=value;});}));});
  function paperChange(){var next=M.clone(definition);next.paper={size:$('paper').value,orientation:$('orientation').value};next.pages.forEach(function(p){var original=p.elements.slice(),a=M.profile(next);p.elements=[];original.forEach(function(e){var width=a.w>a.h?(a.w-42)/2:a.w-32;e.width=width;if(e.type==='omr'){var f=p.fields.find(function(f){return f.id===e.field_id;}),minimum=M.minSize(f);e.width=Math.max(width,minimum[0]);e.height=Math.max(e.height,minimum[1]);}var position=M.place(next,p,e.width,e.height);e.x=position.x;e.y=position.y;p.elements.push(e);});});M.validate(next);changed(next,'用紙に合わせて部品を再配置しました。文字の収まりも確認してください。');}
  $('paper').addEventListener('change',action(paperChange));$('orientation').addEventListener('change',action(paperChange));
  $('print').addEventListener('click',action(async function(){M.validate(definition);var popup=window.open('','_blank');if(!popup)throw Error('印刷用ウィンドウを開けませんでした。ポップアップの設定を確認してください');var doc=popup.document;doc.title=definition.title;var style=doc.createElement('style'),sz=M.size(definition);style.textContent='@page{size:'+sz[0]+'mm '+sz[1]+'mm;margin:0}html,body{margin:0}svg{display:block;break-after:page}svg:last-child{break-after:auto}';doc.head.append(style);
    for(var i=0;i<definition.pages.length;i++){var svg=await S.render(M.clone(definition),i,token,{});doc.body.append(doc.importNode(svg,true));}popup.focus();popup.print();notice('確認用の印刷画面を開きました。読取用PDFは保存した定義JSONからMacで作成してください。');}));
  window.OMREditorAPI={getDefinition:function(){return M.clone(definition);},replace:function(value){M.validate(value);definition=M.clone(value);pageIndex=0;selected=null;undo=[];redo=[];dirty=false;lastEmitted=M.canonical(definition);render();},markClean:function(){dirty=false;$('version').textContent='版 '+definition.layout_version;}};
  action(async function(){var response=await fetch('starter.json');if(!response.ok)throw Error('初期用紙を読み込めません');definition=await response.json();M.validate(definition);render();window.dispatchEvent(new Event('omr-editor-ready'));notice('用紙を編集できます。共通識別欄と13個の■は固定です。');})();
})();
