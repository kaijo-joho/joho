/* global GraphCore, GraphExpression, GraphCurves, GraphAnnotations, GraphSymbols, GraphPlot, GraphTemplates, IlapoLocalAutosave, JohoToolHelp */
(function () {
  'use strict';
  const C = window.GraphCore, P = window.GraphPlot, S = window.GraphSymbols;
  const $ = id => document.getElementById(id);
  const palette = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#db2777','#4f46e5','#65a30d','#ca8a04','#0f766e','#7c3aed','#111827','#64748b','#ffffff','#a16207','#e11d48','#0284c7'];
  const kindNames = {function:'2D 数式',implicit:'陰関数',parametric:'媒介変数',polar:'極座標',surface:'3D 曲面',data2d:'2D 数表',data3d:'3D 数表'};
  const annotationNames = {point:'点',guide:'補助線',tangent:'接線',intersection:'交点',tangentIntersection:'接線どうしの交点',segment:'線分・矢印',text:'文字'};
  const curveKinds = ['function','parametric','polar'];
  let history, store, localAuto, help, selected = null, camera, settings = {}, side = '', dialogApply, dialogOpener;
  let drawPending = false, drawing = false, exportBusy = false, fileBusy = false, toastTimer, saveTimer;
  let parameterPreview = null, gesture = null;
  const templates = typeof GraphTemplates.list === 'function' ? GraphTemplates.list() : C.clone(GraphTemplates.list);
  function node(tag, text, attrs) { const el = document.createElement(tag); if (text != null) el.textContent = text; for (const [k,v] of Object.entries(attrs || {})) el.setAttribute(k,v); return el; }
  function button(text, action, attrs) { const el = node('button',text,Object.assign({type:'button'},attrs)); el.addEventListener('click',event=>run(()=>action(event))); return el; }
  function run(action) { try { const result = action(); if (result && result.catch) result.catch(report); return result; } catch (error) { report(error); } }
  function listen(id,event,action) { $(id).addEventListener(event,e=>run(()=>action(e))); }
  function report(error) { const message = error?.message || String(error); if ($('editor-dialog').open) { $('dialog-error').textContent=message; $('dialog-error').hidden=false; } else notify(message); }
  function notify(text) { $('toast').textContent=text; $('toast').hidden=false; clearTimeout(toastTimer); toastTimer=setTimeout(()=>$('toast').hidden=true,Math.max(3200,text.length*80)); }
  function status(text) { $('save-status').textContent=text; }
  function current() { return history.document; }
  function matchesMode(s) { return current().mode==='3d' ? ['surface','data3d'].includes(s.kind) : !['surface','data3d'].includes(s.kind); }
  function activeSeries() { return selected?.type==='series' ? current().series.find(s=>s.id===selected.id) : null; }
  function activeAnnotation() { return selected?.type==='annotation' ? current().annotations.find(a=>a.id===selected.id) : null; }
  function symbol(key) { return current().axes[key].symbol || key; }
  function display(text,kind='scalar') { return S.toDisplay(text,current(),kind); }
  function canonical(text,kind='scalar') { return S.toCanonical(text.trim(),current(),kind); }
  function curveLabel(s) { return s.kind==='parametric' ? symbol('x')+' = '+display(s.components.x,s.kind)+' / '+symbol('y')+' = '+display(s.components.y,s.kind) : (s.kind==='polar'?'r = ':'')+display(s.expression,s.kind); }
  function activeParameter() { return selected?.type==='parameter' ? current().parameters.find(p=>p.name===selected.name) : null; }
  function closeMenus() { for (const el of document.querySelectorAll('.top details[open]')) el.open=false; }
  function savePreferences() { try { localStorage.setItem('kaijo-graph:settings',JSON.stringify(settings)); } catch (_) {} }
  function isDark() { return settings.theme==='dark' || (settings.theme!=='light' && matchMedia('(prefers-color-scheme:dark)').matches); }
  function applySettings() { document.documentElement.dataset.theme=settings.theme||'auto'; document.documentElement.dataset.textSize=settings.textSize||'standard'; $('theme').value=settings.theme||'auto'; $('text-size').value=settings.textSize||'standard'; savePreferences(); requestDraw(); }
  function persistSoon() { clearTimeout(saveTimer); saveTimer=setTimeout(persist,250); }
  function persist() {
    clearTimeout(saveTimer);
    try { if (!store) throw new Error('ブラウザ保存を利用できません。ファイルに保存してください。'); store.save('auto',current()); status('ブラウザへ自動保存済み'); } catch(error) { status(error.message); }
    if (localAuto?.active) localAuto.schedule(current());
  }
  function changed(mutator, message, draw=true) {
    cancelGesture(); parameterPreview=null; history.change(mutator); updateList(); updateToolbar(); updateHeader(); persistSoon(); if(draw) requestDraw(); if(message) notify(message);
  }
  function updateHeader() {
    $('document-name').textContent=current().name || '無題のグラフ';
    $('mode-label').textContent=current().mode.toUpperCase();
    for (const mode of ['2d','3d']) $('mode-'+mode).setAttribute('aria-pressed',String(current().mode===mode));
    for (const id of ['undo','undo-menu']) $(id).disabled=!history.canUndo;
    for (const id of ['redo','redo-menu']) $(id).disabled=!history.canRedo;
    $('add-function').textContent=current().mode==='3d'?'＋ 曲面':'＋ 数式';
    $('other-curves').hidden=current().mode==='3d';
    $('add-implicit').textContent='＋ 陰関数 F('+symbol('x')+', '+symbol('y')+') = 0';
    $('add-parametric').textContent='＋ 媒介変数 '+symbol('x')+'(t), '+symbol('y')+'(t)';
    $('add-annotation').disabled=current().mode==='3d';
    $('annotation-mode-note').hidden=current().mode!=='3d';
    $('export-format').querySelector('[value="svg"]').disabled=current().mode==='3d';
    if(current().mode==='3d' && $('export-format').value==='svg') $('export-format').value='png';
  }
  function updateList() {
    $('series-list').replaceChildren();
    if(!current().series.length) $('series-list').append(node('p','数式や数表を追加してください。',{class:'small muted'}));
    for (const s of current().series) {
      const item=button('',()=>select({type:'series',id:s.id}),{class:'object-item','aria-pressed':String(selected?.type==='series'&&selected.id===s.id),'aria-label':(s.name||s.expression||kindNames[s.kind])+'を選択'});
      const dot=node('span',null,{class:'swatch'}); dot.style.backgroundColor=s.style.color;
      const copy=node('span',null,{class:'object-copy'}); copy.append(node('strong',s.name||kindNames[s.kind]),node('small',s.kind.startsWith('data')?s.rows.length+' 行':curveLabel(s)));
      copy.append(node('span',kindNames[s.kind]+(!s.visible?'・非表示':!matchesMode(s)?'・別の表示モード':''),{class:'dim-badge'}));
      item.append(dot,copy); item.addEventListener('dblclick',()=>run(()=>editSeries(s.id))); $('series-list').append(item);
    }
    $('annotation-list').replaceChildren();
    for(const a of current().annotations) {
      const item=button('',()=>select({type:'annotation',id:a.id}),{class:'object-item','aria-pressed':String(selected?.type==='annotation'&&selected.id===a.id),'aria-label':(a.name||annotationNames[a.kind])+'を選択'});
      const dot=node('span',null,{class:'swatch'});dot.style.backgroundColor=a.style.color;
      const copy=node('span',null,{class:'object-copy'});copy.append(node('strong',a.name||annotationNames[a.kind]),node('span',annotationNames[a.kind]+(!a.visible?'・非表示':current().mode==='3d'?'・2Dで表示':''),{class:'dim-badge'}));
      item.append(dot,copy);item.addEventListener('dblclick',()=>run(()=>editAnnotation(a.id)));$('annotation-list').append(item);
    }
    $('parameter-list').replaceChildren();
    for(const p of current().parameters) $('parameter-list').append(button(p.name+' = '+p.value,()=>select({type:'parameter',name:p.name}),{class:'object-item','aria-pressed':String(selected?.type==='parameter'&&selected.name===p.name)}));
  }
  function setListOpen(open) { $('objects').classList.toggle('is-open',open); $('list-toggle').setAttribute('aria-expanded',String(open)); }
  function select(value) { const hadPreview=!!parameterPreview;parameterPreview=null; selected=value; updateList(); updateToolbar(); if(hadPreview)requestDraw();if(matchMedia('(max-width:850px)').matches) setListOpen(false); }
  function updateToolbar() {
    const bar=$('selection-toolbar'); bar.replaceChildren(); const s=activeSeries(), p=activeParameter(), a=activeAnnotation(); bar.hidden=!s&&!p&&!a;
    if(s) {
      bar.append(node('span',s.name||kindNames[s.kind],{class:'selection-name'}),button(s.kind.startsWith('data')?'数表・出典':'数式・範囲',()=>editSeries(s.id)),button('色・線',()=>editStyle(s.id)));
      const details=node('details',null,{class:'popup-details'}); details.append(node('summary','その他'));
      const more=node('div');
      more.append(button(s.visible?'非表示にする':'表示する',()=>changed(d=>{d.series.find(x=>x.id===s.id).visible=!s.visible;})),button('複製',()=>{const next=C.clone(s);next.id=C.uid();next.name=(next.name||kindNames[next.kind])+' のコピー';changed(d=>d.series.push(next));select({type:'series',id:next.id});}),button('削除',()=>removeSeries(s.id)));
      if(current().mode==='2d'&&curveKinds.includes(s.kind))more.append(button('この曲線上に点',()=>addAnnotation('point',s.id)));
      if(current().mode==='2d'&&s.kind==='function')more.append(button('この曲線の接線',()=>addAnnotation('tangent',s.id)));
      if(s.kind.startsWith('data')) more.append(button('数値をCSVで保存',()=>download(C.tableCSV(s.rows,(s.kind==='data3d'?['x','y','z']:['x','y']).map(symbol)),filename(s.name||'数表')+'.csv','text/csv;charset=utf-8')));
      if(!matchesMode(s)) more.append(button(kindNames[s.kind].startsWith('3D')?'3Dで表示':'2Dで表示',()=>switchMode(kindNames[s.kind].startsWith('3D')?'3d':'2d')));
      details.append(more); bar.append(details,button('×',()=>select(null),{'aria-label':'選択を解除',class:'icon-button'}));
    } else if(a) {
      bar.append(node('span',a.name||annotationNames[a.kind],{class:'selection-name'}),button('位置・設定',()=>editAnnotation(a.id)),button('文字・配置',()=>editLabel(a.id)),button('色・線',()=>editStyle(a.id,'annotation')));
      const details=node('details',null,{class:'popup-details'});details.append(node('summary','その他'));const more=node('div');
      more.append(button(a.visible?'非表示にする':'表示する',()=>changed(d=>{d.annotations.find(x=>x.id===a.id).visible=!a.visible;})),button('複製',()=>{const next=C.clone(a);next.id=C.uid();next.name=(next.name||annotationNames[next.kind])+' のコピー';changed(d=>d.annotations.push(next));select({type:'annotation',id:next.id});}),button('削除',()=>removeAnnotation(a.id)));
      if(a.kind==='segment')more.append(button('終点から続ける',()=>addAnnotation('segment',a.to)));
      if(['point','tangentIntersection'].includes(a.kind))more.append(button('この点から線分',()=>addAnnotation('segment',a.id)));
      if(a.kind==='tangent')more.append(button('他の接線との交点',()=>addAnnotation('tangentIntersection',a.id)));
      if(current().mode==='3d')more.append(button('2Dで表示',()=>switchMode('2d')));
      details.append(more);bar.append(details,button('×',()=>select(null),{'aria-label':'選択を解除',class:'icon-button'}));
    } else if(p) {
      bar.append(node('span',p.name,{class:'selection-name'})); const controls=node('div',null,{class:'parameter-control'});
      const slider=node('input',null,{type:'range',min:p.min,max:p.max,step:p.step,value:p.value,'aria-label':p.name+' の値'});
      const number=node('input',null,{type:'number',min:p.min,max:p.max,step:'any',value:p.value,'aria-label':p.name+' の数値'});
      slider.addEventListener('input',()=>{number.value=slider.value;parameterPreview={name:p.name,value:Number(slider.value)};requestDraw();});
      slider.addEventListener('change',()=>run(()=>setParameter(p.name,Number(slider.value))));
      slider.addEventListener('pointercancel',()=>{parameterPreview=null;slider.value=p.value;number.value=p.value;requestDraw();});
      number.addEventListener('change',()=>run(()=>setParameter(p.name,requiredNumber(number))));
      controls.append(slider,number);bar.append(controls,button('編集',()=>editParameter(p.name)),button('削除',()=>{changed(d=>{d.parameters=d.parameters.filter(x=>x.name!==p.name);});select(null);}),button('×',()=>select(null),{'aria-label':'選択を解除',class:'icon-button'}));
    }
  }
  function removeSeries(id) { changed(d=>C.removeSeries(d,id),'曲線と、それを参照する点・補助線を削除しました。元に戻せます。');select(null); }
  function removeAnnotation(id) { changed(d=>C.removeAnnotation(d,id),'参照する線分・交点も一緒に削除しました。元に戻せます。');select(null); }
  function setParameter(name,value) { changed(d=>{d.parameters.find(p=>p.name===name).value=value;}); }
  async function requestDraw() {
    if(!history)return;drawPending=true;if(exportBusy||drawing)return;drawing=true;
    try { while(drawPending) { drawPending=false; const doc=C.clone(gesture?.preview||current()); if(parameterPreview){const p=doc.parameters.find(x=>x.name===parameterPreview.name);if(p)p.value=parameterPreview.value;}
      try { const result=await P.render($('plot'),doc,{dark:isDark(),camera,onSelect:id=>select({type:'series',id}),onAnnotationSelect:id=>select({type:'annotation',id}),onViewChange:view=>{
        if(drawing||parameterPreview||gesture)return; if(view.camera)camera=view.camera;
        if(view.axes){const next=C.clone(current());let modified=false;for(const key of ['x','y','z'])if(view.axes[key]&&Number.isFinite(view.axes[key].min)&&Number.isFinite(view.axes[key].max)){for(const part of ['min','max'])if(next.axes[key][part]!==view.axes[key][part]){next.axes[key][part]=view.axes[key][part];modified=true;}}
          if(modified)run(()=>{history.replace(next);updateHeader();persistSoon();requestDraw();});}
      }}); $('plot-error').hidden=true;$('plot-notes').replaceChildren();for(const warning of result?.warnings||[])$('plot-notes').append(node('p',warning));$('plot-notes').hidden=!result?.warnings?.length; } catch(error) { $('plot-error').textContent=error.message; $('plot-error').hidden=false; }
    }} finally{drawing=false;}
  }
  function releaseGesture() {
    const previous=gesture;gesture=null;$('plot').classList.remove('is-dragging');
    if(previous&&$('plot').hasPointerCapture(previous.pointerId))$('plot').releasePointerCapture(previous.pointerId);
    return previous;
  }
  function cancelGesture() { if(!gesture)return;releaseGesture();requestDraw(); }
  function startGesture(event) {
    if(event.button!==0||gesture||exportBusy||current().mode!=='2d'||$('editor-dialog').open)return;
    const hit=P.pickAnnotation($('plot'),event,current(),selected?.id);if(!hit)return;
    const a=current().annotations.find(a=>a.id===hit.id);if(!a)return;
    select({type:'annotation',id:a.id});
    const part=hit.part==='label'&&a.kind!=='text'?'label':'point';
    let point,screen;
    if(part==='point'){
      if(!['point','text'].includes(a.kind))return;
      point=GraphAnnotations.evaluate(a,current()).points[0];
      if(!point||!GraphAnnotations.anchorForDrag(a,current(),point)){
        event.preventDefault();event.stopImmediatePropagation();notify('数式で指定した位置は「位置・設定」や係数から変更できます。');return;
      }
      screen=P.screenPoint($('plot'),point);if(!screen)return;
    }
    event.preventDefault();event.stopImmediatePropagation();
    gesture={id:a.id,part,pointerId:event.pointerId,start:[event.clientX,event.clientY],screen,original:C.clone(current()),preview:C.clone(current()),moved:false};
    $('plot').setPointerCapture(event.pointerId);$('plot').classList.add('is-dragging');$('stage').focus({preventScroll:true});
  }
  function moveGesture(event) {
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    event.preventDefault();event.stopImmediatePropagation();
    const dx=event.clientX-gesture.start[0],dy=event.clientY-gesture.start[1];
    if(!gesture.moved&&Math.hypot(dx,dy)<3)return;
    const original=gesture.original.annotations.find(a=>a.id===gesture.id),target=gesture.preview.annotations.find(a=>a.id===gesture.id);
    if(gesture.part==='label')target.label={...original.label,dx:Math.max(-500,Math.min(500,original.label.dx+dx)),dy:Math.max(-500,Math.min(500,original.label.dy+dy))};
    else{
      const point=P.dataPoint($('plot'),[gesture.screen[0]+dx,gesture.screen[1]+dy]);if(!point||point.some(v=>Math.abs(v)>1e9))return;
      const anchor=GraphAnnotations.anchorForDrag(original,gesture.original,point);if(!anchor)return;target.anchor=anchor;
    }
    gesture.moved=true;requestDraw();
  }
  function finishGesture(event) {
    if(!gesture||event.pointerId!==gesture.pointerId)return;
    event.preventDefault();event.stopImmediatePropagation();
    moveGesture(event);const finished=releaseGesture();
    if(finished.moved)run(()=>changed(d=>Object.assign(d,finished.preview)));
  }
  function switchMode(mode) { changed(d=>{d.mode=mode;}); select(null); camera=undefined; }
  function undo(redo=false) { cancelGesture();parameterPreview=null; if(redo)history.redo();else history.undo(); selected=null;camera=undefined;updateHeader();updateList();updateToolbar();persistSoon();requestDraw(); }
  function openDialog(title, build, onApply, submit='適用') {
    cancelGesture();closeMenus(); if($('editor-dialog').open)$('editor-dialog').close(); dialogOpener=document.activeElement;dialogApply=onApply;
    $('dialog-title').textContent=title;$('dialog-content').replaceChildren();$('dialog-error').hidden=true;$('dialog-submit').hidden=!onApply;$('dialog-submit').textContent=submit;
    $('dialog-cancel').textContent=onApply?'キャンセル':'閉じる';build($('dialog-content'));$('editor-dialog').showModal();
    const focus=$('dialog-content').querySelector('input,textarea,select,button');if(focus)focus.focus();
  }
  function closeDialog() { $('editor-dialog').close(); if(dialogOpener?.isConnected&&dialogOpener.getBoundingClientRect().width)dialogOpener.focus();else $('stage').focus(); }
  function field(parent,label,value,type='text',attrs={}) { const wrap=node('label',label);const input=node('input',null,Object.assign({type},attrs)); input.value=value;wrap.append(input);parent.append(wrap);return input; }
  function area(parent,label,value) {const wrap=node('label',label);const input=node('textarea');input.value=value;wrap.append(input);parent.append(wrap);return input;}
  function choice(parent,label,value,options) {const wrap=node('label',label),select=node('select',null,{'aria-label':label});for(const [v,t]of options)select.append(node('option',t,{value:v}));select.value=value;wrap.append(select);parent.append(wrap);return select;}
  function check(parent,label,value) {const wrap=node('label',null,{class:'check'}),input=node('input',null,{type:'checkbox'});input.checked=value;wrap.append(input,document.createTextNode(label));parent.append(wrap);return input;}
  function grid(parent,three=false) {const el=node('div',null,{class:three?'field-grid three':'field-grid'});parent.append(el);return el;}
  function requiredNumber(input) { if(input.value.trim()==='')throw new Error('数値を入力してください。');const value=Number(input.value);if(!Number.isFinite(value))throw new Error('有限の数値を入力してください。');return value; }
  function appendSource(parent,source) {
    if(!source.title&&!source.notes&&!source.url)return;
    const box=node('div',null,{class:'source-info small'});box.append(node('strong',({user:'自分のデータ',reference:'資料の数値',model:'式・モデルからの値'})[source.kind]));if(source.title)box.append(node('p',source.title));if(source.notes)box.append(node('p',source.notes));if(source.url)box.append(node('a','出典を開く',{href:source.url,target:'_blank',rel:'noopener noreferrer'}));parent.append(box);
  }
  function editSeries(id, supplied) {
    const existing=current().series.find(s=>s.id===id), s=C.clone(supplied||existing);if(!s)return;let name,expression,xmin,xmax,ymin,ymax,componentX,componentY,intervalMin,intervalMax,table,sourceKind,sourceTitle,sourceURL,sourceNotes;
    const isData=s.kind.startsWith('data'),is3=s.kind==='surface'||s.kind==='data3d',isParam=s.kind==='parametric',isPolar=s.kind==='polar',isImplicit=s.kind==='implicit';
    const formulaAttrs={maxlength:1000,spellcheck:'false',autocapitalize:'none',autocomplete:'off'};
    openDialog((existing?'編集：':'追加：')+kindNames[s.kind],parent=>{
      name=field(parent,'名前',s.name,'text',{maxlength:160});
      if(isData){const columns=(is3?['x','y','z']:['x','y']).map(symbol);table=area(parent,'数表（'+columns.join(', ')+' の'+columns.length+'列）',C.tableCSV(s.rows));table.placeholder=columns.join(',')+'\n'+(is3?'0,0,0\n1,2,3':'0,0\n1,1\n2,4');parent.append(node('p','CSVまたはタブ区切り。欠測のセルは空欄。点は入力した順に結びます。',{class:'small muted'}));
        if(s.rows.length){const wrap=node('div',null,{class:'table-wrap'}),preview=node('table',null,{class:'data-table'});const head=node('thead'),tr=node('tr');for(const v of columns)tr.append(node('th',v,{scope:'col'}));head.append(tr);preview.append(head);const body=node('tbody');for(const row of s.rows.slice(0,100)){const r=node('tr');for(const v of row)r.append(node('td',v===null?'欠測':String(v)));body.append(r);}preview.append(body);wrap.append(preview);parent.append(wrap);}
      }else{
        if(isParam){componentX=field(parent,symbol('x')+'(t) の式',display(s.components.x,s.kind),'text',formulaAttrs);componentY=field(parent,symbol('y')+'(t) の式',display(s.components.y,s.kind),'text',formulaAttrs);}
        else expression=field(parent,is3?'数式（例：'+display('z = x^2 + y^2',s.kind)+'）':isImplicit?'方程式（例：'+display('x^2 + y^2 = 9',s.kind)+'）':isPolar?'r の式（例：2*cos(3*theta)）':'数式（例：'+display('y = a*x^2',s.kind)+'）',display(s.expression,s.kind),'text',formulaAttrs);
        parent.append(node('p','^ は累乗、sqrt(x) は平方根、ln(x) は自然対数、log(x) は常用対数。角度：'+(current().angle==='deg'?'度':'ラジアン')+'。',{class:'small muted'}));
        const g=grid(parent);
        if(isParam||isPolar){const v=isParam?'t':'theta';intervalMin=field(g,v+' の最小値',s.interval[0],'number',{step:'any'});intervalMax=field(g,v+' の最大値',s.interval[1],'number',{step:'any'});parent.append(node('p',isPolar?'theta（θ）が角度です。1周はラジアンで約6.283185307、度で360。r = を付けず、右辺を入力します。':'t を動かして点 (x(t), y(t)) の軌跡を描きます。各欄には右辺を入力します。',{class:'small muted'}));}
        else{xmin=field(g,symbol('x')+' の最小値',s.domain.x[0],'number',{step:'any'});xmax=field(g,symbol('x')+' の最大値',s.domain.x[1],'number',{step:'any'});if(is3||isImplicit){ymin=field(g,symbol('y')+' の最小値',s.domain.y[0],'number',{step:'any'});ymax=field(g,symbol('y')+' の最大値',s.domain.y[1],'number',{step:'any'});}}
        if(isImplicit)parent.append(node('p','等号なしなら「式 = 0」として扱います。指定範囲を格子で調べるため、小さな輪郭・重根・孤立点は捉えられないことがあります。',{class:'small muted'}));
      }
      appendSource(parent,s.source);
      const details=node('details');details.append(node('summary','出典・条件を記録する'));parent.append(details);
      sourceKind=choice(details,'データの由来',s.source.kind,[['user','自分のデータ'],['reference','資料の数値'],['model','式・モデルからの値']]);sourceTitle=field(details,'資料名',s.source.title,'text',{maxlength:300});sourceURL=field(details,'出典URL（https）',s.source.url,'url',{maxlength:2000});sourceNotes=area(details,'条件・単位・適用範囲など',s.source.notes);sourceNotes.maxLength=3000;
    },()=>{
      s.name=name.value.trim();if(isData){s.rows=C.parseTable(table.value,is3?3:2);if(!s.rows.length)throw new Error('1行以上の数値を入力してください。');}
      else{if(isParam)s.components={x:canonical(componentX.value,s.kind),y:canonical(componentY.value,s.kind)};else s.expression=canonical(expression.value,s.kind);if(isParam||isPolar)s.interval=[requiredNumber(intervalMin),requiredNumber(intervalMax)];else{s.domain.x=[requiredNumber(xmin),requiredNumber(xmax)];if(is3||isImplicit)s.domain.y=[requiredNumber(ymin),requiredNumber(ymax)];}}
      s.source={kind:sourceKind.value,title:sourceTitle.value,url:sourceURL.value,notes:sourceNotes.value};
      changed(d=>{if(existing)d.series[d.series.findIndex(x=>x.id===id)]=s;else d.series.push(s);});select({type:'series',id:s.id});
    },'描画');
  }
  function addSeries(data=false,rows) {
    const s=C.createSeries(data?(current().mode==='3d'?'data3d':'data2d'):(current().mode==='3d'?'surface':'function'));
    s.style.color=palette[current().series.length%12];s.name=kindNames[s.kind]+' '+(current().series.length+1);
    s.domain={x:[current().axes.x.min,current().axes.x.max],y:[current().axes.y.min,current().axes.y.max]};
    if(data){s.expression='';s.rows=rows||[[0,0],[1,1],[2,4]].map(r=>current().mode==='3d'?[...r,r[1]]:r);s.style.points=true;}
    else s.expression=current().mode==='3d'?'z = sin(x)*cos(y)':'y = x^2';
    editSeries(null,s);
  }
  function addCurve(kind) {
    const s=C.createSeries(kind);s.name=kindNames[kind]+' '+(current().series.length+1);s.style.color=palette[current().series.length%12];
    s.domain={x:[current().axes.x.min,current().axes.x.max],y:[current().axes.y.min,current().axes.y.max]};
    if((kind==='polar'||kind==='parametric')&&current().angle==='deg')s.interval=[0,360];
    $('other-curves').open=false;editSeries(null,s);
  }
  function addAnnotation(kind,seriesId) {
    if(!kind){openDialog('点・線分・文字を追加',parent=>{for(const [value,label]of Object.entries(annotationNames))parent.append(button(label+'を追加',()=>addAnnotation(value),{class:'full-button'}));parent.append(node('p','注釈は2Dで表示します。接線と曲線の交点は '+symbol('y')+' = f('+symbol('x')+') が対象です。',{class:'small muted'}));},null);return;}
    const a=C.createAnnotation(kind);a.name=annotationNames[kind]+' '+(current().annotations.length+1);
    const functions=current().series.filter(s=>s.kind==='function');
    if(kind==='point'&&seriesId){const s=current().series.find(s=>s.id===seriesId);a.anchor={type:'curve',seriesId,at:String(s.kind==='function'?Math.max(s.domain.x[0],Math.min(0,s.domain.x[1])):s.interval[0])};}
    if(kind==='tangent'){const s=functions.find(s=>s.id===seriesId)||functions[0];if(!s)throw new Error('接線を追加するには、先に2Dの数式 y = f(x) を追加してください。');a.seriesId=s.id;a.at=String(Math.max(s.domain.x[0],Math.min(0,s.domain.x[1])));}
    if(kind==='intersection'){if(functions.length<2)throw new Error('交点には異なる2つの数式 y = f(x) が必要です。');a.seriesIds=functions.slice(0,2).map(s=>s.id);a.interval=[current().axes.x.min,current().axes.x.max];}
    if(kind==='tangentIntersection'){const tangents=current().annotations.filter(a=>a.kind==='tangent');if(tangents.length<2)throw new Error('先に異なる2本の接線を追加してください。');a.tangentIds=[seriesId||tangents[0].id,tangents.find(a=>a.id!==(seriesId||tangents[0].id)).id];}
    if(kind==='segment'){a.from=seriesId||'';a.style.dash='solid';}
    if(kind==='text'){a.text='説明';a.label.dx=0;a.label.dy=0;}
    editAnnotation(null,a);
  }
  function editAnnotation(id,supplied) {
    const existing=current().annotations.find(a=>a.id===id),a=C.clone(supplied||existing);if(!a)return;
    let name,pointType,curve,at,x,y,projections,axis,value,first,second,min,max,text,arrows,from,to;
    const curves=current().series.filter(s=>curveKinds.includes(s.kind)), functions=current().series.filter(s=>s.kind==='function');
    const options=items=>items.map(s=>[s.id,s.name||kindNames[s.kind]||annotationNames[s.kind]]),exprAttrs={maxlength:1000,spellcheck:'false',autocapitalize:'none',autocomplete:'off'};
    function endpoint(parent,label,id,defaultX) {
      const box=node('fieldset',null,{class:'axis-fields'});box.append(node('legend',label));parent.append(box);
      const points=current().annotations.filter(p=>['point','tangentIntersection'].includes(p.kind));
      const pick=choice(box,label+'の指定',id||'new',[['new','座標から新しい点を作る'],...options(points)]),coords=grid(box);
      const px=field(coords,label+'の '+symbol('x')+' 座標',defaultX,'text',exprAttrs),py=field(coords,label+'の '+symbol('y')+' 座標','0','text',exprAttrs);
      const refresh=()=>{coords.hidden=pick.value!=='new';};pick.addEventListener('change',refresh);refresh();
      return {pick,x:px,y:py,label};
    }
    openDialog((existing?'編集：':'追加：')+annotationNames[a.kind],parent=>{
      name=field(parent,'名前',a.name,'text',{maxlength:160});
      if(a.kind==='point'){
        pointType=choice(parent,'点の指定方法',a.anchor.type,[['free','座標を入力'],['curve','曲線上の点']]);
        if(!curves.length){pointType.querySelector('[value="curve"]').disabled=true;pointType.value='free';}
        const freeBox=grid(parent),curveBox=node('div');parent.append(curveBox);
        x=field(freeBox,symbol('x')+' 座標',display(a.anchor.x||'0'),'text',exprAttrs);y=field(freeBox,symbol('y')+' 座標',display(a.anchor.y||'0'),'text',exprAttrs);
        curve=choice(curveBox,'対象の曲線',a.anchor.seriesId||curves[0]?.id,options(curves));at=field(curveBox,'位置（'+symbol('x')+' / t / theta の値）',display(a.anchor.at||'0'),'text',exprAttrs);
        const hint=node('p','',{class:'small muted'});curveBox.append(hint);
        const refresh=()=>{freeBox.hidden=pointType.value!=='free';curveBox.hidden=pointType.value!=='curve';const s=curves.find(s=>s.id===curve.value);hint.textContent=s?(s.kind==='function'?symbol('x'):s.kind==='parametric'?'t':'theta')+' の値を指定します。対象の定義範囲内で入力してください。':'';};pointType.addEventListener('change',refresh);curve.addEventListener('change',refresh);refresh();
        projections=check(parent,'軸への読取線を表示',a.projections);
      }else if(a.kind==='guide'){axis=choice(parent,'方向',a.axis,[['x','縦の線（'+symbol('x')+' = 一定）'],['y','横の線（'+symbol('y')+' = 一定）']]);value=field(parent,'座標の値',display(a.value),'text',exprAttrs);}
      else if(a.kind==='tangent'){curve=choice(parent,'対象の数式',a.seriesId,options(functions));at=field(parent,'接点の '+symbol('x')+' 座標',display(a.at),'text',exprAttrs);parent.append(node('p','接点と接線を数値計算で描きます。角や未定義の点では接線を表示しません。',{class:'small muted'}));}
      else if(a.kind==='intersection'){first=choice(parent,'1つ目の数式',a.seriesIds[0],options(functions));second=choice(parent,'2つ目の数式',a.seriesIds[1],options(functions));const g=grid(parent);min=field(g,'探索する '+symbol('x')+' の最小値',a.interval[0],'number',{step:'any'});max=field(g,'探索する '+symbol('x')+' の最大値',a.interval[1],'number',{step:'any'});parent.append(node('p','指定区間と両方の定義範囲が重なる部分を数値探索します。非常に近い交点や細かい振動は捉えきれないことがあります。',{class:'small muted'}));}
      else if(a.kind==='tangentIntersection'){const ts=current().annotations.filter(a=>a.kind==='tangent');first=choice(parent,'1本目の接線',a.tangentIds[0],options(ts));second=choice(parent,'2本目の接線',a.tangentIds[1],options(ts));parent.append(node('p','2本の接線を延長した交点です。平行・一致・微分できない場合は理由を表示します。',{class:'small muted'}));}
      else if(a.kind==='segment'){from=endpoint(parent,'始点',a.from,'0');to=endpoint(parent,'終点',a.to,'2');arrows=choice(parent,'矢印',a.arrows,[['none','なし'],['end','終点に矢印'],['both','両端に矢印']]);parent.append(node('p','既存の点を選ぶと、そこにつながる線分が同じ端点を共有します。点を移動するとすべて追従します。続きの線分は「その他」→「終点から続ける」で追加できます。',{class:'small muted'}));}
      else if(a.kind==='text'){text=area(parent,'表示する文字',a.text);text.maxLength=2000;const g=grid(parent);x=field(g,symbol('x')+' 座標',display(a.anchor.x),'text',exprAttrs);y=field(g,symbol('y')+' 座標',display(a.anchor.y),'text',exprAttrs);parent.append(node('p','改行、v_0・v_{max} の下付き、m^2・m^{2} の上付きに対応します。文字の大きさは「文字・配置」で設定します。',{class:'small muted'}));}
      if(!['intersection','tangentIntersection'].includes(a.kind))parent.append(node('p','座標や位置には 1/2、sqrt(2)、π、登録した係数などの数式も使えます。数値だけで指定した点や文字はドラッグでも移動できます。',{class:'small muted'}));
    },()=>{
      a.name=name.value.trim();
      const extra=[];
      if(a.kind==='point'){a.anchor=pointType.value==='free'?{type:'free',x:canonical(x.value),y:canonical(y.value)}:{type:'curve',seriesId:curve.value,at:canonical(at.value)};a.projections=projections.checked;}
      else if(a.kind==='guide'){a.axis=axis.value;a.value=canonical(value.value);}
      else if(a.kind==='tangent'){a.seriesId=curve.value;a.at=canonical(at.value);}
      else if(a.kind==='intersection'){a.seriesIds=[first.value,second.value];a.interval=[requiredNumber(min),requiredNumber(max)];}
      else if(a.kind==='tangentIntersection')a.tangentIds=[first.value,second.value];
      else if(a.kind==='text'){a.text=text.value;a.anchor={type:'free',x:canonical(x.value),y:canonical(y.value)};}
      else if(a.kind==='segment'){
        const endpointId=f=>{if(f.pick.value!=='new')return f.pick.value;const p=C.createAnnotation('point');p.name=(a.name||'線分')+'の'+f.label;p.anchor={type:'free',x:canonical(f.x.value),y:canonical(f.y.value)};p.projections=false;p.label.visible=false;p.style.color=a.style.color;extra.push(p);return p.id;};
        a.from=endpointId(from);a.to=endpointId(to);a.arrows=arrows.value;
      }
      changed(d=>{d.annotations.push(...extra);if(existing)d.annotations[d.annotations.findIndex(x=>x.id===id)]=a;else d.annotations.push(a);});select({type:'annotation',id:a.id});
    },'描画');
  }
  function editLabel(id) {
    const a=current().annotations.find(a=>a.id===id);let visible,dx,dy,size;
    openDialog('文字・配置',parent=>{visible=check(parent,a.kind==='text'?'文字を表示':'名前を表示',a.label.visible);const g=grid(parent);size=field(g,'文字サイズ（px）',a.label.size,'number',{min:8,max:48,step:1});dx=field(g,'横のずれ（右へ px）',a.label.dx,'number',{min:-500,max:500,step:1});dy=field(g,'縦のずれ（下へ px）',a.label.dy,'number',{min:-500,max:500,step:1});parent.append(node('p','名前はドラッグでも位置を調整できます。上付きは m^2、下付きは v_0、複数文字は v_{max} と入力します。',{class:'small muted'}));},()=>changed(d=>{d.annotations.find(a=>a.id===id).label={visible:visible.checked,dx:requiredNumber(dx),dy:requiredNumber(dy),size:requiredNumber(size)};}));
  }
  function editStyle(id,type='series') {
    const key=type==='annotation'?'annotations':'series',s=current()[key].find(x=>x.id===id);let color,width,dash,opacity,points,lines;let rgb=[];
    openDialog('色・線',parent=>{
      const pal=node('div',null,{class:'palette','aria-label':'色のパレット'});parent.append(pal);
      const refresh=value=>{color.value=value;for(const b of pal.children)b.setAttribute('aria-pressed',String(b.dataset.color===value.toLowerCase()));[0,1,2].forEach((i)=>rgb[i].value=parseInt(value.slice(1+i*2,3+i*2),16));};
      for(const value of palette){const b=button('',()=>refresh(value),{'aria-label':'色 '+value,'data-color':value,'aria-pressed':String(value===s.style.color)});b.style.backgroundColor=value;pal.append(b);}
      color=field(parent,'自由な色',s.style.color,'color');const colors=grid(parent,true);rgb=['R','G','B'].map((label,i)=>field(colors,label,parseInt(s.style.color.slice(1+i*2,3+i*2),16),'number',{min:0,max:255,step:1}));
      color.addEventListener('input',()=>refresh(color.value));for(const input of rgb)input.addEventListener('change',()=>run(()=>{const values=rgb.map(requiredNumber);if(values.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('RGBは0〜255の整数です。');refresh('#'+values.map(v=>v.toString(16).padStart(2,'0')).join(''));}));
      const g=grid(parent);width=field(g,'線の太さ',s.style.width,'number',{min:.5,max:20,step:.5});dash=choice(g,'線種',s.style.dash,[['solid','実線'],['dash','破線'],['dot','点線']]);opacity=field(g,'不透明度（0〜1）',s.style.opacity,'number',{min:0,max:1,step:.05});
      if(s.kind==='surface'){width.disabled=true;dash.disabled=true;}else if(type==='series'){points=check(parent,'点を表示',s.style.points);lines=check(parent,'線を表示',s.style.lines);}
    },()=>{const values=rgb.map(requiredNumber);if(values.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('RGBは0〜255の整数です。');if(points&&!points.checked&&!lines.checked)throw new Error('点または線のいずれかを表示してください。');changed(d=>{const st=d[key].find(x=>x.id===id).style;st.color='#'+values.map(v=>v.toString(16).padStart(2,'0')).join('');st.width=requiredNumber(width);st.dash=dash.value;st.opacity=requiredNumber(opacity);if(points){st.points=points.checked;st.lines=lines.checked;}});});
  }
  function editParameter(name) {
    const existing=current().parameters.find(p=>p.name===name);let paramName,value,min,max,step;
    openDialog(existing?'係数の編集':'係数の追加',parent=>{
      paramName=field(parent,'名前（半角英字。例：a）',existing?.name||'a','text',{maxlength:32});if(existing)paramName.readOnly=true;
      const g=grid(parent);value=field(g,'値',existing?.value??1,'number',{step:'any'});step=field(g,'刻み幅',existing?.step??.1,'number',{step:'any',min:.000001});min=field(g,'最小値',existing?.min??-5,'number',{step:'any'});max=field(g,'最大値',existing?.max??5,'number',{step:'any'});
      parent.append(node('p','x, y, z, pi, e と関数名は使えません。媒介変数のある図では t、極座標のある図では theta も予約されています。登録した係数は数式や点の位置に使えます。',{class:'small muted'}));
    },()=>{const p={name:paramName.value.trim(),value:requiredNumber(value),min:requiredNumber(min),max:requiredNumber(max),step:requiredNumber(step)};changed(d=>{if(existing)d.parameters[d.parameters.findIndex(x=>x.name===name)]=p;else d.parameters.push(p);});select({type:'parameter',name:p.name});});
  }
  function editAxes() {
    let name,angle,equal,gridOn,legend;const fields={};
    openDialog('座標・グラフの設定',parent=>{
      name=field(parent,'グラフ名',current().name,'text',{maxlength:160});angle=choice(parent,'三角関数の角度',current().angle,[['rad','ラジアン'],['deg','度']]);
      for(const key of current().mode==='3d'?['x','y','z']:['x','y']){const a=current().axes[key],box=node('fieldset',null,{class:'axis-fields','data-axis':key});box.append(node('legend',({x:'横軸',y:'縦軸',z:'高さの軸'})[key]+'（'+a.symbol+'）'));parent.append(box);const g=grid(box);fields[key]={symbol:field(g,'数式で使う記号',a.symbol,'text',{maxlength:32,spellcheck:'false',autocapitalize:'none'}),label:field(g,'軸名（表示）',a.label,'text',{maxlength:80}),unit:field(g,'単位（表示）',a.unit,'text',{maxlength:80}),min:field(g,'最小値',a.min,'number',{step:'any'}),max:field(g,'最大値',a.max,'number',{step:'any'}),scale:choice(box,'目盛',a.scale,[['linear','通常'],['log','対数（正の値）']]),step:field(g,'目盛の間隔（空欄で自動）',a.ticks.step===null?'':String(a.ticks.step),'text',{placeholder:'例：1、1/2、π/2',maxlength:100}),format:choice(g,'目盛の表記',a.ticks.format,[['auto','自動'],['decimal','小数'],['fraction','分数'],['pi','π の倍数']])};const refresh=()=>{fields[key].step.disabled=fields[key].format.disabled=fields[key].scale.value==='log';};fields[key].scale.addEventListener('change',refresh);refresh();}
      parent.append(node('p','記号は t、V、温度、θ などを使えます。軸間・係数・関数・定数と重複しない名前にしてください。軸名や単位は表示用で、v_0 や m^2 の添字も使えます。記号を変えてもグラフの数値は変わりません。',{class:'small muted'}));
      parent.append(node('p','媒介変数の t と極座標の θ は各式の独立変数です。角度を変更しても入力済みの範囲は自動換算しません。',{class:'small muted'}));
      equal=check(parent,'各軸の1単位を同じ長さで表示',current().equalScale);gridOn=check(parent,'グリッドを表示',current().grid);legend=check(parent,'凡例を表示',current().legend);
    },()=>changed(d=>{d.name=name.value.trim();d.angle=angle.value;d.equalScale=equal.checked;d.grid=gridOn.checked;d.legend=legend.checked;for(const[key,f]of Object.entries(fields)){const step=f.step.value.trim()?GraphExpression.compile(canonical(f.step.value),{variables:[],target:false,angle:d.angle}).evaluate({}):null;const nextSymbol=f.symbol.value.trim();d.axes[key]={symbol:nextSymbol,label:f.label.value===current().axes[key].symbol?nextSymbol:f.label.value,unit:f.unit.value,min:requiredNumber(f.min),max:requiredNumber(f.max),scale:f.scale.value,ticks:{step,format:f.format.value}};}}));
  }
  function fitView() {
    const doc=current(), values={x:[],y:[],z:[]},base=Object.fromEntries(doc.parameters.map(p=>[p.name,p.value]));
    const add=(key,value)=>{if(Number.isFinite(value)&&Math.abs(value)<=1e9&&(doc.axes[key].scale!=='log'||value>0))values[key].push(value);};
    for(const s of doc.series.filter(s=>s.visible&&matchesMode(s))) {
      if(s.kind.startsWith('data')){for(const r of s.rows)if(r.every(v=>v!==null))r.forEach((v,i)=>add(['x','y','z'][i],v));}
      else if(s.kind==='surface'){const samplingDoc=C.clone(doc);samplingDoc.axes.x.min=s.domain.x[0];samplingDoc.axes.x.max=s.domain.x[1];samplingDoc.axes.y.min=s.domain.y[0];samplingDoc.axes.y.max=s.domain.y[1];const sampled=P.sampleSurface(s,samplingDoc);for(const x of sampled.x)add('x',x);for(const y of sampled.y)add('y',y);for(const row of sampled.z)for(const z of row)add('z',z);}
      else if(['implicit','parametric','polar'].includes(s.kind)){const samplingDoc=C.clone(doc);if(s.kind==='implicit'){for(const key of ['x','y']){samplingDoc.axes[key].min=s.domain[key][0];samplingDoc.axes[key].max=s.domain[key][1];}}const sampler={implicit:'sampleImplicit',parametric:'sampleParametric',polar:'samplePolar'}[s.kind],sampled=GraphCurves[sampler](s,samplingDoc);sampled.x.forEach((x,i)=>{if(Number.isFinite(x)&&Number.isFinite(sampled.y[i])){add('x',x);add('y',sampled.y[i]);}});}
      else{const f=GraphExpression.compile(s.expression,{variables:['x',...doc.parameters.map(p=>p.name)],angle:doc.angle});for(let i=0;i<=500;i++){const x=s.domain.x[0]+(s.domain.x[1]-s.domain.x[0])*i/500;const y=f.evaluate({...base,x});if(Number.isFinite(y)){add('x',x);add('y',y);}}}
    }
    if(doc.mode==='2d')for(const a of doc.annotations.filter(a=>a.visible)){const result=GraphAnnotations.evaluate(a,doc);for(const p of result.points){add('x',p[0]);add('y',p[1]);}if(a.kind==='guide'&&result.segments.length)add(a.axis,result.segments[0][0][a.axis==='x'?0:1]);if(a.kind==='segment')for(const segment of result.segments)for(const p of segment){add('x',p[0]);add('y',p[1]);}}
    changed(d=>{for(const key of d.mode==='3d'?['x','y','z']:['x','y']){const nums=values[key];if(!nums.length)continue;let min=Infinity,max=-Infinity;for(const v of nums){min=Math.min(min,v);max=Math.max(max,v);}if(d.axes[key].scale==='log'){if(min===max){min/=2;max*=2;}const pad=(Math.log10(max)-Math.log10(min))*.05;min=10**(Math.log10(min)-pad);max=10**(Math.log10(max)+pad);}else{const pad=(max-min||Math.max(Math.abs(min),1))*.07;min-=pad;max+=pad;}d.axes[key].min=Math.max(-1e9,min);d.axes[key].max=Math.min(1e9,max);}});
  }
  function setSide(which) {side=side===which?'':which;$('side-panel').hidden=!side;for(const value of ['templates','export']){$(value+'-panel').hidden=side!==value;$(value+'-tab').setAttribute('aria-expanded',String(side===value));}requestAnimationFrame(requestDraw);}
  function templateList() {const query=$('template-search').value.trim().toLowerCase(),list=$('template-list');list.replaceChildren();let category='';for(const item of templates){if(query&&!(item.name+item.category+item.description).toLowerCase().includes(query))continue;if(item.category!==category){category=item.category;list.append(node('h3',category,{class:'template-category'}));}const b=button('',()=>{const doc=C.validateDocument(item.document);history.replace(doc);selected=null;camera=undefined;updateHeader();updateList();updateToolbar();persistSoon();requestDraw();if(matchMedia('(max-width:1150px)').matches)setSide('templates');notify('「'+item.name+'」を開きました。元に戻すこともできます。');},{class:'template-card'});b.append(node('strong',item.name),node('small',item.description));list.append(b);}if(!list.children.length)list.append(node('p','見つかりませんでした。'));}
  function filename(name) {return (name||'グラフ').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,100);}
  function download(content,name,type) {const blob=content instanceof Blob?content:new Blob([content],{type:type||'application/json'}),url=URL.createObjectURL(blob),a=node('a',null,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function encode(doc) {return JSON.stringify(C.validateDocument(doc),null,2);}
  function saveBrowser() {if(!store)throw new Error('ブラウザ保存を利用できません。ファイルに保存してください。');store.save('saved',current());closeMenus();status('ブラウザに明示保存済み');notify('明示保存しました。自動保存とは別に残ります。');}
  async function saveLocal() {
    if(fileBusy)return;fileBusy=true;closeMenus();const doc=C.clone(current());
    try{if(!window.showSaveFilePicker){download(encode(doc),filename(doc.name)+'.graph.json');notify('再編集用ファイルをダウンロードしました。');return;}
      const handle=await window.showSaveFilePicker({suggestedName:filename(doc.name)+'.graph.json',types:[{description:'グラフの再編集ファイル',accept:{'application/json':['.json']}}]});
      if(localAuto)await localAuto.protect(handle);const writable=await handle.createWritable();try{await writable.write(encode(doc));await writable.close();}catch(error){try{await writable.abort();}catch(_){}throw error;}if(localAuto)await localAuto.rememberExplicit(handle);notify('ローカルファイルに保存しました。');
    }catch(error){if(error.name!=='AbortError')throw error;}finally{fileBusy=false;}
  }
  async function startLocalAutosave() {
    if(fileBusy)return;if(!localAuto||!window.showSaveFilePicker)throw new Error('ローカル自動保存には対応するChromeが必要です。「ファイルに保存」も利用できます。');fileBusy=true;closeMenus();
    try{const handle=await window.showSaveFilePicker({suggestedName:filename(current().name)+'.autosave.graph.json',types:[{description:'グラフの自動保存',accept:{'application/json':['.json']}}]});await localAuto.start(current(),handle);$('stop-local-auto').disabled=!localAuto.active;}catch(error){if(error.name!=='AbortError')throw error;}finally{fileBusy=false;}
  }
  function loadDocument(doc) {const valid=C.validateDocument(doc);cancelGesture();history.replace(valid);selected=null;camera=undefined;updateList();updateToolbar();updateHeader();persistSoon();requestDraw();}
  function showSaved(initial=false) {
    openDialog(initial?'保存したグラフから再開':'保存したグラフを開く',parent=>{
      if(!store)parent.append(node('p','ブラウザ保存を利用できません。ローカルファイルを開いてください。'));
      for(const kind of ['auto','saved']){let entry;try{entry=store?.load(kind);}catch(error){parent.append(node('p',(kind==='auto'?'自動保存':'明示保存')+'：'+error.message,{class:'error'}));continue;}if(!entry)continue;const b=button('',()=>{loadDocument(entry.document);closeDialog();notify('保存したグラフを開きました。');},{class:'saved-option'});b.append(node('strong',(kind==='auto'?'自動保存':'明示保存')+'：'+entry.document.name),node('small',new Date(entry.at).toLocaleString('ja-JP')));parent.append(b);}
      parent.append(button('ローカルファイルを開く…',()=>{closeDialog();$('file-input').click();},{class:'full-button'}));
      if(initial)parent.append(node('p','「閉じる」で新しいグラフから始めます。編集を始めるまで、保存済みの内容は変更しません。',{class:'small muted'}));
      else parent.append(node('p','開いたあとも「元に戻す」で直前の図へ戻れます。',{class:'small muted'}));
    },null);
  }
  async function exportImage() {
    if(exportBusy||drawing)throw new Error('描画が完了してから書き出してください。');exportBusy=true;$('export-image').disabled=true;
    try{const format=$('export-format').value,url=await P.exportImage($('plot'),{format,scale:Number($('export-scale').value),background:$('export-background').value});const a=node('a',null,{href:url,download:filename(current().name)+'.'+format});document.body.append(a);a.click();a.remove();notify('画像を書き出しました。');}
    finally{exportBusy=false;$('export-image').disabled=false;if(drawPending)requestDraw();}
  }
  function startup() {
    if(!C||!P||!S)throw new Error('アプリの読み込みに失敗しました。ページを再読み込みしてください。');
    try{settings=JSON.parse(localStorage.getItem('kaijo-graph:settings')||'{}');if(!settings||typeof settings!=='object')settings={};store=new C.Store(localStorage);}catch(_){settings={};}
    if(!['auto','light','dark'].includes(settings.theme))settings.theme='auto';if(!['standard','large','largest'].includes(settings.textSize))settings.textSize='standard';
    const initial=C.createDocument();initial.name='はじめてのグラフ';Object.assign(initial.axes.x,{min:-5,max:5});Object.assign(initial.axes.y,{min:-2,max:10});const f=C.createSeries('function');f.expression='x^2';f.name='y = x²';f.domain.x=[-5,5];initial.series.push(f);history=new C.History(initial);
    try{localAuto=new IlapoLocalAutosave({encode:doc=>new Blob([encode(doc)],{type:'application/json'}),onStatus:result=>{status(result.message);$('stop-local-auto').disabled=!localAuto.active;if(result.state==='error')notify(result.message);}});}catch(_){$('start-local-auto').disabled=true;}
    listen('list-toggle','click',()=>setListOpen(!$('objects').classList.contains('is-open')));listen('list-close','click',()=>setListOpen(false));
    $('plot').addEventListener('pointerdown',startGesture,{capture:true});
    $('plot').addEventListener('pointermove',moveGesture,{capture:true});
    $('plot').addEventListener('pointerup',finishGesture,{capture:true});
    $('plot').addEventListener('pointercancel',cancelGesture,{capture:true});
    $('plot').addEventListener('lostpointercapture',cancelGesture);
    listen('add-function','click',()=>addSeries());listen('add-data','click',()=>addSeries(true));listen('add-parameter','click',()=>editParameter());
    for(const kind of ['implicit','parametric','polar'])listen('add-'+kind,'click',()=>addCurve(kind));listen('add-annotation','click',()=>addAnnotation());
    listen('mode-2d','click',()=>switchMode('2d'));listen('mode-3d','click',()=>switchMode('3d'));
    for(const id of ['undo','undo-menu'])listen(id,'click',()=>{closeMenus();undo();});for(const id of ['redo','redo-menu'])listen(id,'click',()=>{closeMenus();undo(true);});
    for(const id of ['axes-button','axes-menu'])listen(id,'click',editAxes);for(const id of ['reset-view','fit-button'])listen(id,'click',()=>{closeMenus();fitView();});
    listen('theme','change',()=>{settings.theme=$('theme').value;applySettings();});listen('text-size','change',()=>{settings.textSize=$('text-size').value;applySettings();});
    listen('templates-tab','click',()=>setSide('templates'));listen('export-tab','click',()=>setSide('export'));for(const el of document.querySelectorAll('[data-close-side]'))el.addEventListener('click',()=>setSide(side));listen('template-search','input',templateList);
    listen('save-browser','click',saveBrowser);listen('save-local','click',saveLocal);listen('open-saved','click',()=>showSaved());listen('open-local','click',()=>{closeMenus();$('file-input').click();});
    listen('start-local-auto','click',startLocalAutosave);listen('stop-local-auto','click',()=>{localAuto.stop();$('stop-local-auto').disabled=true;closeMenus();});
    listen('new-document','click',()=>{closeMenus();loadDocument(C.createDocument());notify('新しいグラフを開きました。元に戻すこともできます。');});
    listen('file-input','change',async()=>{const file=$('file-input').files[0];$('file-input').value='';if(!file)return;if(file.size>2*1024*1024)throw new Error('再編集ファイルは2MB以内にしてください。');loadDocument(C.validateDocument(await file.text()));notify('グラフを読み込みました。');});
    listen('import-csv','click',()=>$('csv-input').click());listen('csv-input','change',async()=>{const file=$('csv-input').files[0];$('csv-input').value='';if(!file)return;if(file.size>1024*1024)throw new Error('CSVは1MB以内にしてください。');addSeries(true,C.parseTable(await file.text(),current().mode==='3d'?3:2));});
    listen('export-image','click',exportImage);listen('dialog-close','click',closeDialog);listen('dialog-cancel','click',closeDialog);
    $('editor-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
    $('dialog-form').addEventListener('submit',event=>{event.preventDefault();$('dialog-error').hidden=true;try{if(dialogApply){dialogApply();closeDialog();}}catch(error){report(error);}});
    for(const menu of document.querySelectorAll('.top details'))menu.addEventListener('toggle',()=>{if(menu.open)for(const other of document.querySelectorAll('.top details'))if(other!==menu)other.open=false;});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.top .menu'))closeMenus();});
    document.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;if(help?.root?.contains(event.target)||$('operation-help').contains(event.target))return;
      const input=event.target.closest('input,textarea,select,[contenteditable="true"]');if($('editor-dialog').open)return;
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();run(saveBrowser);return;}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='o'){event.preventDefault();showSaved();return;}
      if(input)return;
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
      if(event.key==='Escape'){const menu=document.querySelector('.top details[open]');if(gesture)cancelGesture();else if(menu){menu.open=false;menu.querySelector('summary').focus();}else if(parameterPreview){parameterPreview=null;updateToolbar();requestDraw();}else{select(null);setListOpen(false);}event.preventDefault();}
      if(event.key==='?'){event.preventDefault();help?.open();}
      if(event.key==='Delete'||event.key==='Backspace'){const s=activeSeries(),a=activeAnnotation();if(s||a){event.preventDefault();run(()=>s?removeSeries(s.id):removeAnnotation(a.id));}}
    });
    try{help=JohoToolHelp.create({root:$('operation-help'),opener:$('help-button'),title:'グラフエディタの使い方',storageKey:'kaijo-graph:help',bounds:()=>({top:document.querySelector('.top').getBoundingClientRect().bottom+6,bottom:$('stage').getBoundingClientRect().bottom-52}),isBusy:()=>!!parameterPreview||!!gesture,returnToEditor:()=>$('stage').focus()});}catch(_){$('help-button').disabled=true;}
    let resizeTimer;new ResizeObserver(()=>{clearTimeout(resizeTimer);resizeTimer=setTimeout(requestDraw,100);}).observe($('plot'));
    matchMedia('(prefers-color-scheme:dark)').addEventListener('change',()=>{if(settings.theme==='auto')requestDraw();});
    addEventListener('pagehide',()=>{if(saveTimer)persist();localAuto?.stop(false);});
    applySettings();updateHeader();updateList();updateToolbar();templateList();
    let hasSaved=false;for(const kind of ['auto','saved'])try{if(localStorage.getItem('kaijo-graph:'+kind))hasSaved=true;}catch(_){}if(hasSaved)showSaved(true);
    window.GraphEditor=Object.freeze({getDocument:()=>C.clone(current()),getState:()=>({selected:C.clone(selected),drawing,dragging:!!gesture,side,localAutosave:!!localAuto?.active}),getTemplates:()=>C.clone(templates)});
  }
  try{startup();}catch(error){$('plot-error').textContent=error.message;$('plot-error').hidden=false;}
}());
