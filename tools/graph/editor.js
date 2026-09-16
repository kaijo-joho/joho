/* global GraphCore, GraphExpression, GraphCurves, GraphAnnotations, GraphAnalysis, GraphRegions, GraphSymbols, GraphIcons, GraphPlot, GraphTemplates, IlapoLocalAutosave, JohoToolHelp, JohoUI */
(function () {
  'use strict';
  const C = window.GraphCore, P = window.GraphPlot, S = window.GraphSymbols;
  const $ = id => document.getElementById(id);
  const palette = ['#2563eb','#dc2626','#16a34a','#9333ea','#ea580c','#0891b2','#db2777','#4f46e5','#65a30d','#ca8a04','#0f766e','#7c3aed','#111827','#64748b','#ffffff','#a16207','#e11d48','#0284c7'];
  const quickColors = [palette[0],palette[1],palette[2],palette[3],palette[4],palette[12]];
  const colorNames = ['青','赤','緑','紫','オレンジ','青緑','ピンク','藍','黄緑','黄土','深緑','すみれ','黒','灰色','白','茶色','濃いピンク','水色'];
  const kindNames = {function:'2D 数式',implicit:'陰関数',parametric:'媒介変数',polar:'極座標',surface:'3D 曲面',data2d:'2D 数表',data3d:'3D 数表'};
  const annotationNames = {point:'点',guide:'補助線',tangent:'接線',intersection:'交点',tangentIntersection:'交点',segment:'線分・矢印',text:'文字',region:'領域',curveRegion:'曲線の領域',regression:'回帰曲線'};
  const isRegion = a => a && ['region','curveRegion'].includes(a.kind);
  const curveKinds = ['function','parametric','polar'];
  let history, store, localAuto, help, tooltip, selected = null, camera, settings = {}, side = '', dialogApply, dialogOpener, dialogOpenerKey, dialogSelectionKey, dialogListDetail;
  let drawPending = false, drawing = false, drawTask = Promise.resolve(), exportBusy = false, fileBusy = false, toastTimer, saveTimer;
  let parameterPreview = null, gesture = null, selectionPanel = null, tangentDraft = null, tangentHoverTimer;
  let addMenu = null, addMenuTimer;
  const templates = typeof GraphTemplates.list === 'function' ? GraphTemplates.list() : C.clone(GraphTemplates.list);
  function node(tag, text, attrs) { const el = document.createElement(tag); if (text != null) el.textContent = text; for (const [k,v] of Object.entries(attrs || {})) el.setAttribute(k,v); return el; }
  function button(text, action, attrs) { const el = node('button',text,Object.assign({type:'button'},attrs)); el.addEventListener('click',event=>run(()=>action(event))); return el; }
  function iconButton(icon,label,action,attrs={}) { const el=button(null,action,{'aria-label':label,'data-tip':label,class:'icon-button',...attrs});el.append(GraphIcons.create(icon,document));return el; }
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
  function regressionSources() {
    return current().annotations.filter(a=>a.kind==='regression').map(a=>{
      const fit=GraphAnalysis.fit(current().series.find(s=>s.id===a.seriesId),a.model);
      return {id:'regression:'+a.id,kind:'regression',name:'回帰：'+(a.name||'回帰曲線'),domain:{x:fit.domain||[current().axes.x.min,current().axes.x.max]}};
    });
  }
  function functionSources() {return [...current().series.filter(s=>s.kind==='function'),...regressionSources()];}
  function tangentSource(a) {return a.target?'regression:'+a.target.id:a.seriesId;}
  function setTangentSource(a,value) {delete a.seriesId;delete a.target;if(value.startsWith('regression:'))a.target={type:'regression',id:value.slice(11)};else a.seriesId=value;return a;}
  function curveAnchor(value,at) {return value.startsWith('regression:')?{type:'regression',regressionId:value.slice(11),at}:{type:'curve',seriesId:value,at};}
  function activeParameter() { return selected?.type==='parameter' ? current().parameters.find(p=>p.name===selected.name) : null; }
  function closeTopMenus() { for (const el of document.querySelectorAll('.top details[open]')) el.open=false; }
  function closeMenus() { closeTopMenus();closeAddMenu(); }
  function closeAddMenu(restoreFocus=false) {
    clearTimeout(addMenuTimer);if(!addMenu)return;
    const previous=addMenu;addMenu=null;previous.panel.hidden=true;previous.trigger.setAttribute('aria-expanded','false');
    if(restoreFocus)previous.trigger.focus({preventScroll:true});
  }
  function positionAddMenu() {
    if(!addMenu)return;
    const {trigger,panel}=addMenu,anchor=trigger.getBoundingClientRect(),viewport=window.visualViewport;
    const left=viewport?.offsetLeft||0,top=Math.max(viewport?.offsetTop||0,document.querySelector('.top').getBoundingClientRect().bottom)+8;
    const right=left+(viewport?.width||innerWidth)-8,bottom=(viewport?.offsetTop||0)+(viewport?.height||innerHeight)-8;
    if(!anchor.width||anchor.bottom<top||anchor.top>bottom){closeAddMenu();return;}
    panel.style.maxHeight=Math.max(80,bottom-top)+'px';
    const bounds=panel.getBoundingClientRect();
    if(anchor.right+4+bounds.width<=right){panel.style.left=anchor.right+4+'px';panel.style.top=Math.max(top,Math.min(anchor.top,bottom-bounds.height))+'px';return;}
    const below=Math.max(0,bottom-anchor.bottom-4),above=Math.max(0,anchor.top-top-4),down=below>=bounds.height||below>=above;
    panel.style.maxHeight=Math.max(80,down?below:above)+'px';
    panel.style.left=Math.max(left+8,Math.min(anchor.left,right-bounds.width))+'px';
    panel.style.top=Math.max(top,down?anchor.bottom+4:anchor.top-panel.getBoundingClientRect().height-4)+'px';
  }
  function openAddMenu(trigger,panel,pinned=false) {
    clearTimeout(addMenuTimer);if($('editor-dialog').open)return;
    if(addMenu?.trigger===trigger){addMenu.pinned ||= pinned;return;}
    closeMenus();cancelTangentDraft();tooltip?.hide();
    addMenu={trigger,panel,pinned};panel.hidden=false;trigger.setAttribute('aria-expanded','true');positionAddMenu();
  }
  function bindAddMenu(prefix) {
    const trigger=$(prefix+'-add-toggle'),panel=$(prefix+'-add-panel');
    const open=pinned=>openAddMenu(trigger,panel,pinned);
    trigger.addEventListener('pointerenter',event=>{if(event.pointerType==='mouse')open(false);});
    trigger.addEventListener('click',()=>{if(addMenu?.trigger===trigger&&addMenu.pinned)closeAddMenu();else open(true);});
    trigger.addEventListener('keydown',event=>{if(event.key==='ArrowDown'){event.preventDefault();open(true);panel.querySelector('button:not(:disabled)')?.focus();}});
    const leave=()=>{clearTimeout(addMenuTimer);addMenuTimer=setTimeout(()=>{if(addMenu?.trigger===trigger&&!addMenu.pinned&&!panel.contains(document.activeElement)&&!trigger.matches(':hover')&&!panel.matches(':hover'))closeAddMenu();},180);};
    trigger.addEventListener('pointerleave',leave);panel.addEventListener('pointerleave',leave);
    panel.addEventListener('pointerenter',()=>clearTimeout(addMenuTimer));
    panel.addEventListener('toggle',positionAddMenu,true);
  }
  function savePreferences() { try { localStorage.setItem('kaijo-graph:settings',JSON.stringify(settings)); } catch (_) {} }
  function isDark() { return settings.theme==='dark' || (settings.theme!=='light' && matchMedia('(prefers-color-scheme:dark)').matches); }
  function applySettings() { document.documentElement.dataset.theme=settings.theme||'auto'; document.documentElement.dataset.textSize=settings.textSize||'standard'; $('theme').value=settings.theme||'auto'; $('text-size').value=settings.textSize||'standard'; savePreferences(); requestDraw();positionAddMenu(); }
  function persistSoon() { clearTimeout(saveTimer); saveTimer=setTimeout(persist,250); }
  function persist() {
    clearTimeout(saveTimer);
    try { if (!store) throw new Error('ブラウザ保存を利用できません。ファイルに保存してください。'); store.save('auto',current()); status('ブラウザへ自動保存済み'); } catch(error) { status(error.message); }
    if (localAuto?.active) localAuto.schedule(current());
  }
  function changed(mutator, message, draw=true, rebuildToolbar=true) {
    cancelTangentDraft();cancelGesture(); parameterPreview=null; history.change(mutator);if(rebuildToolbar){updateList();updateToolbar();}updateHeader(); persistSoon(); if(draw) requestDraw(); if(message) notify(message);
  }
  function updateHeader() {
    updateOutputControls();
    $('document-name').textContent=current().name || '無題のグラフ';
    $('mode-label').textContent=current().mode.toUpperCase();
    for (const mode of ['2d','3d']) $('mode-'+mode).setAttribute('aria-pressed',String(current().mode===mode));
    for (const id of ['undo','undo-menu']) $(id).disabled=!history.canUndo;
    for (const id of ['redo','redo-menu']) $(id).disabled=!history.canRedo;
    $('add-function').textContent=current().mode==='3d'?'＋ 曲面':'＋ 数式';
    $('other-curves').hidden=current().mode==='3d';
    $('add-implicit').textContent='＋ 陰関数 F('+symbol('x')+', '+symbol('y')+') = 0';
    $('add-parametric').textContent='＋ 媒介変数 '+symbol('x')+'(t), '+symbol('y')+'(t)';
    for(const el of $('annotation-tools').querySelectorAll('button'))el.disabled=current().mode==='3d';
    $('annotation-mode-note').hidden=current().mode!=='3d';
    $('export-format').querySelector('[value="svg"]').disabled=current().mode==='3d';
    if(current().mode==='3d' && $('export-format').value==='svg') $('export-format').value='png';
  }
  function updateList() {
    $('series-list').replaceChildren();
    if(!current().series.length) $('series-list').append(node('p','数式や数表を追加してください。',{class:'small muted'}));
    for (const s of current().series) {
      const state=!s.visible?'非表示':!matchesMode(s)?'別の表示モード':'',description=kindNames[s.kind]+(state?'・'+state:'');
      const item=button('',()=>select({type:'series',id:s.id}),{class:'object-item','data-object-type':'series','data-object-id':s.id,'aria-pressed':String(selected?.type==='series'&&selected.id===s.id),'aria-label':(s.name||s.expression||kindNames[s.kind])+'（'+description+'）を選択','data-tip':description+'。選択して編集。ダブルクリックで数式・範囲を開く'});
      const dot=node('span',null,{class:'swatch'}); dot.style.backgroundColor=s.style.color;
      const copy=node('span',null,{class:'object-copy'});
      if(s.kind.startsWith('data'))copy.append(node('strong',s.name||kindNames[s.kind]),node('small',s.rows.length+' 行'));
      else {
        let equation=curveLabel(s);
        if(['function','surface'].includes(s.kind)&&!equation.includes('='))equation=symbol(s.kind==='surface'?'z':'y')+' = '+equation;
        if(s.kind==='implicit'&&!equation.includes('='))equation+=' = 0';
        if(s.kind==='parametric')equation=symbol('x')+' = '+display(s.components.x,s.kind)+'\n'+symbol('y')+' = '+display(s.components.y,s.kind);
        copy.append(node('span',equation,{class:'series-equation'}),node('span',s.name,{class:'series-name'}));
      }
      if(state)copy.append(node('span',state,{class:'dim-badge'}));
      item.append(dot,copy); item.addEventListener('dblclick',()=>run(()=>editSeries(s.id))); appendObjectRow($('series-list'),item,'series',s.id,s.name||kindNames[s.kind],s.kind.startsWith('data')?'数表・出典':'数式・範囲');
    }
    $('annotation-list').replaceChildren();
    for(const a of current().annotations) {
      const state=!a.visible?'非表示':current().mode==='3d'?'2Dで表示':'',description=annotationNames[a.kind]+(state?'・'+state:'');
      const item=button('',()=>select({type:'annotation',id:a.id}),{class:'object-item','data-object-type':'annotation','data-object-id':a.id,'aria-pressed':String(selected?.type==='annotation'&&selected.id===a.id),'aria-label':(a.name||annotationNames[a.kind])+'（'+description+'）を選択','data-tip':description+'。選択して編集。ダブルクリックで位置・設定を開く'});
      const dot=node('span',null,{class:'swatch'});dot.style.backgroundColor=a.style.color;
      const copy=node('span',null,{class:'object-copy'});copy.append(node('strong',a.name||annotationNames[a.kind]));
      if(state)copy.append(node('span',state,{class:'dim-badge'}));
      if(a.kind==='tangent')copy.append(node('small','',{'data-tangent-equation':a.id,class:'tangent-equation'}));
      if(a.kind==='regression'){const fit=GraphAnalysis.fit(current().series.find(s=>s.id===a.seriesId),a.model);copy.append(node('small',fit.warning||GraphAnalysis.equation(fit,symbol('x'),symbol('y')),{class:'tangent-equation','data-regression-equation':a.id}));}
      if(isRegion(a))copy.append(node('small','',{'data-region-area':a.id,class:'region-area'}));
      item.append(dot,copy);item.addEventListener('dblclick',()=>run(()=>editAnnotation(a.id)));appendObjectRow($('annotation-list'),item,'annotation',a.id,a.name||annotationNames[a.kind],'位置・設定');
    }
    updateParameters();updateTangentEquations(current());updateRegionAreas(current());
  }
  function appendObjectRow(list,item,type,id,name,details) {
    const row=node('div',null,{class:'object-row'}),label=name+'：'+details+'を編集';
    const more=iconButton('moreVertical',label,()=>{select({type,id},{keepListOpen:true});if(type==='series')editSeries(id);else editAnnotation(id);},{class:'icon-button object-details','data-object-details':type+':'+id,'aria-haspopup':'dialog'});
    row.append(item,more);list.append(row);
  }
  function updateTangentEquations(doc) { for(const el of document.querySelectorAll('[data-tangent-equation]')){const a=doc.annotations.find(a=>a.id===el.dataset.tangentEquation);if(!a)continue;const value=GraphAnnotations.tangentEquation(a,doc);el.textContent=value.text||value.warning;el.dataset.tip=value.text?value.text+'（数値微分による近似）':value.warning;} }
  function updateRegionAreas(doc) { for(const el of document.querySelectorAll('[data-region-area]')){const a=doc.annotations.find(a=>a.id===el.dataset.regionArea);if(!a)continue;const result=GraphAnnotations.evaluate(a,doc);el.textContent=result.warning||GraphRegions.areaText(result.area,doc);el.dataset.tip=result.warning||[el.textContent,a.kind==='curveRegion'?GraphRegions.integralText(result.integral,doc)+'（第1の境界 − 第2の境界）':''].filter(Boolean).join(' / ');} }
  function updateParameters() {
    const list=$('parameter-list'),names=new Set(current().parameters.map(p=>p.name));
    for(const row of [...list.children])if(!names.has(row.dataset.parameter))row.remove();
    for(const p of current().parameters){
      let row=[...list.children].find(r=>r.dataset.parameter===p.name);
      if(!row){
        row=node('div',null,{class:'parameter-row','data-parameter':p.name});const header=node('div',null,{class:'parameter-heading-row'});
        const name=button(p.name,()=>select({type:'parameter',name:p.name}),{class:'parameter-name','aria-label':'係数 '+p.name+' を選択'});
        const number=node('input',null,{type:'number',step:'any','aria-label':p.name+' の数値'});
        const slider=node('input',null,{type:'range','aria-label':p.name+' の値'});
        header.append(name,number,iconButton('settings',p.name+' の範囲・刻みを編集',()=>editParameter(p.name)));row.append(header,slider);list.append(row);
        slider.addEventListener('input',()=>{number.value=slider.value;parameterPreview={name:p.name,value:Number(slider.value)};requestDraw();});
        slider.addEventListener('change',()=>run(()=>setParameter(p.name,Number(slider.value))));
        slider.addEventListener('pointercancel',cancelParameterPreview);
        number.addEventListener('change',()=>run(()=>{try{setParameter(p.name,requiredNumber(number));}catch(error){updateParameters();throw error;}}));
      }
      const slider=row.querySelector('[type=range]'),number=row.querySelector('[type=number]');
      for(const el of [slider,number]){el.min=p.min;el.max=p.max;el.value=p.value;}slider.step=p.step;
      row.querySelector('.parameter-name').setAttribute('aria-pressed',String(selected?.type==='parameter'&&selected.name===p.name));
    }
  }
  function cancelParameterPreview() { if(!parameterPreview)return;parameterPreview=null;updateParameters();updateTangentEquations(current());requestDraw(); }
  function setListOpen(open) { if(!open)closeAddMenu();$('objects').classList.toggle('is-open',open); $('list-toggle').setAttribute('aria-expanded',String(open)); }
  function select(value,{keepListOpen=false}={}) { cancelTangentDraft();cancelParameterPreview();selected=value;for(const item of document.querySelectorAll('[data-object-id]'))item.setAttribute('aria-pressed',String(item.dataset.objectType===selected?.type&&item.dataset.objectId===selected?.id));for(const row of $('parameter-list').children)row.querySelector('.parameter-name').setAttribute('aria-pressed',String(selected?.type==='parameter'&&row.dataset.parameter===selected.name));updateToolbar();if(!keepListOpen&&matchMedia('(max-width:850px)').matches) setListOpen(false); }
  function updateToolbar() {
    cancelTangentDraft();
    const bar=$('selection-toolbar'),focused=bar.contains(document.activeElement)?document.activeElement.dataset.quickControl:null,scroll=bar.scrollTop;
    const s=activeSeries(), p=activeParameter(), a=activeAnnotation(),key=s?'series:'+s.id:a?'annotation:'+a.id:p?'parameter:'+p.name:'';
    if(bar.dataset.selectionKey!==key)selectionPanel=null;bar.dataset.selectionKey=key;bar.replaceChildren();bar.hidden=!s&&!p&&!a;bar.classList.toggle('has-colors',!!(s||a));
    if(s) {
      bar.append(node('span',s.name||kindNames[s.kind],{class:'selection-name'}),iconButton('edit',s.kind.startsWith('data')?'数表・出典':'数式・範囲',()=>editSeries(s.id)),selectionPanelButton('style','palette','色・線'));
      if(s.kind==='data2d')bar.append(iconButton('regression','回帰分析',()=>addAnnotation('regression',s.id),{'aria-haspopup':'dialog'}));
      if(s.kind.startsWith('data'))bar.append(iconButton('statistics','統計量・相関行列',()=>showStatistics(s.id),{'aria-haspopup':'dialog'}));
      bar.append(iconButton(s.visible?'hide':'show',s.visible?'非表示にする':'表示する',()=>changed(d=>{d.series.find(x=>x.id===s.id).visible=!s.visible;})),iconButton('copy','複製',()=>{const next=C.clone(current().series.find(x=>x.id===s.id));next.id=C.uid();next.name=(next.name||kindNames[next.kind])+' のコピー';changed(d=>d.series.push(next));select({type:'series',id:next.id});}),iconButton('trash','削除',()=>removeSeries(s.id)));
      const more=node('div');
      if(s.kind.startsWith('data')) more.append(button('数値をCSVで保存',()=>{const table=GraphTables.fromSeries(s,{x:symbol('x'),y:symbol('y'),z:symbol('z')});download(C.tableCSV(table.rows,table.columns),filename(s.name||'数表')+'.csv','text/csv;charset=utf-8');}));
      if(!matchesMode(s)) more.append(button(kindNames[s.kind].startsWith('3D')?'3Dで表示':'2Dで表示',()=>switchMode(kindNames[s.kind].startsWith('3D')?'3d':'2d')));
      if(more.children.length){const details=node('details',null,{class:'popup-details'}),summary=node('summary',null,{'aria-label':'その他',class:'icon-button','data-tip':'その他'});summary.append(GraphIcons.create('more',document));details.append(summary,more);bar.append(details);}
    } else if(a) {
      bar.append(node('span',a.name||annotationNames[a.kind],{class:'selection-name'}),iconButton('edit','位置・設定',()=>editAnnotation(a.id)),selectionPanelButton('label','label','文字・配置'),selectionPanelButton('style','palette',isRegion(a)?'塗りつぶし':'色・線'));
      if(a.kind==='segment')bar.append(iconButton('continue','終点から続ける',()=>addAnnotation('segment',a.to)));
      if(['point','tangentIntersection'].includes(a.kind))bar.append(iconButton('segment','この点から線分',()=>addAnnotation('segment',a.id)));
      bar.append(iconButton(a.visible?'hide':'show',a.visible?'非表示にする':'表示する',()=>changed(d=>{d.annotations.find(x=>x.id===a.id).visible=!a.visible;})),iconButton('copy','複製',()=>{const next=C.clone(current().annotations.find(x=>x.id===a.id));next.id=C.uid();next.name=(next.name||annotationNames[next.kind])+' のコピー';changed(d=>d.annotations.push(next));select({type:'annotation',id:next.id});}),iconButton('trash','削除',()=>removeAnnotation(a.id)));
      if(current().mode==='3d')bar.append(button('2Dで表示',()=>switchMode('2d')));
    } else if(p) {
      bar.append(node('span',p.name,{class:'selection-name'}),iconButton('settings','編集',()=>editParameter(p.name)),iconButton('trash','削除',()=>{changed(d=>{d.parameters=d.parameters.filter(x=>x.name!==p.name);});select(null);}));
    }
    if(s||a){const target=s||a,type=s?'series':'annotation';bar.append(colorButtons(target,type,quickColors,'基本色'));appendQuickLine(bar,target,type);
      if(selectionPanel==='style')appendQuickStyle(bar,target,type);else if(selectionPanel==='label'&&a)appendQuickLabel(bar,a);
    }
    if(focused)bar.querySelector('[data-quick-control="'+CSS.escape(focused)+'"]')?.focus({preventScroll:true});bar.scrollTop=scroll;
  }
  function selectionPanelButton(panel,icon,label) { return iconButton(icon,label,()=>{selectionPanel=selectionPanel===panel?null:panel;updateToolbar();},{'aria-expanded':String(selectionPanel===panel),...(selectionPanel===panel?{'aria-controls':'selection-'+panel}:{}),'data-quick-control':'toggle-'+panel}); }
  function bindTangentTrigger(trigger,seriesId) {
    trigger.setAttribute('aria-controls','tangent-quick-panel');trigger.setAttribute('aria-expanded','false');
    trigger.addEventListener('click',()=>run(()=>openQuickTangent(trigger,seriesId,true)));
    trigger.addEventListener('pointerenter',event=>{
      if(event.pointerType!=='mouse'||trigger.disabled)return;clearTimeout(tangentHoverTimer);
      tangentHoverTimer=setTimeout(()=>{if(trigger.getBoundingClientRect().width&&!$('editor-dialog').open&&!$('tangent-quick-panel').contains(document.activeElement)&&functionSources().length)run(()=>openQuickTangent(trigger,seriesId,false));},180);
    });
    trigger.addEventListener('pointerleave',()=>clearTimeout(tangentHoverTimer));
  }
  function cancelTangentDraft(restoreFocus=false) {
    clearTimeout(tangentHoverTimer);const previous=tangentDraft;if(!previous)return;
    tangentDraft=null;$('tangent-quick-panel').hidden=true;previous.opener.setAttribute('aria-expanded','false');requestDraw();
    if(restoreFocus){const target=previous.returnTarget||previous.opener;if(target.closest('#objects')&&matchMedia('(max-width:850px)').matches)setListOpen(true);if(target.isConnected&&target.getBoundingClientRect().width)target.focus({preventScroll:true});else $('stage').focus({preventScroll:true});}
  }
  function positionQuickTangent() {
    if(!tangentDraft)return;const panel=$('tangent-quick-panel'),openerBounds=(tangentDraft.returnTarget||tangentDraft.opener).getBoundingClientRect(),anchor=openerBounds.width?openerBounds:tangentDraft.anchor||document.querySelector('.stage-heading').getBoundingClientRect(),viewport=window.visualViewport;
    const left=viewport?.offsetLeft||0,top=viewport?.offsetTop||0,width=viewport?.width||innerWidth,height=viewport?.height||innerHeight;
    panel.style.maxHeight=Math.max(120,height-16)+'px';const bounds=panel.getBoundingClientRect();
    panel.style.left=Math.max(left+8,Math.min(anchor.left,left+width-bounds.width-8))+'px';
    const below=anchor.bottom+6,above=anchor.top-bounds.height-6;
    panel.style.top=Math.max(top+8,Math.min(below+bounds.height<=top+height-8?below:above,top+height-bounds.height-8))+'px';
  }
  function openQuickTangent(opener,seriesId,focus) {
    clearTimeout(tangentHoverTimer);if(current().mode!=='2d'||$('editor-dialog').open||exportBusy)return;
    if(tangentDraft?.opener===opener){if(focus){const input=$('tangent-quick-at');input.focus();input.select();}return;}
    const functions=functionSources(),source=functions.find(s=>s.id===(seriesId||activeSeries()?.id||(activeAnnotation()?.kind==='regression'?'regression:'+activeAnnotation().id:'')))||functions[0];
    if(!source)throw new Error('接線を追加するには、先に2Dの数式または回帰曲線を追加してください。');
    const returnTarget=opener.closest('.add-menu')?.querySelector('.add-menu-toggle')||opener,anchor=returnTarget.getBoundingClientRect();
    cancelTangentDraft();cancelGesture();cancelParameterPreview();closeMenus();tooltip?.hide();if(matchMedia('(max-width:850px)').matches)setListOpen(false);
    const annotation=C.createAnnotation('tangent');annotation.name='接線 '+(current().annotations.length+1);setTangentSource(annotation,source.id);
    annotation.at=String(source.domain.x[0]<0&&source.domain.x[1]>0?0:(source.domain.x[0]+source.domain.x[1])/2);
    const panel=$('tangent-quick-panel');panel.replaceChildren();panel.hidden=false;tangentDraft={annotation,opener,returnTarget,anchor,valid:false};opener.setAttribute('aria-expanded','true');
    const heading=node('div',null,{class:'quick-tangent-heading'});heading.append(node('strong','接線を追加'),iconButton('close','接線の追加を閉じる',()=>cancelTangentDraft(true)));panel.append(heading);
    let sourceInput;if(functions.length>1){sourceInput=choice(panel,'対象の数式',source.id,functions.map(s=>[s.id,s.name||display(s.expression,'function')]));sourceInput.addEventListener('change',refresh);}
    else panel.append(node('p',source.name||display(source.expression,'function'),{class:'small muted quick-tangent-source'}));
    const at=field(panel,'接点の '+symbol('x')+' 座標',display(annotation.at),'text',{id:'tangent-quick-at',maxlength:1000,spellcheck:'false',autocapitalize:'none',autocomplete:'off','aria-describedby':'tangent-quick-hint tangent-quick-equation'});
    const equation=node('output',null,{id:'tangent-quick-equation',class:'equation-preview','aria-label':'接線の方程式'});
    const hint=node('p','プレビュー中 · Enterで追加、Escで取り消し',{id:'tangent-quick-hint',class:'small muted'});
    const add=button('接線を追加',commit,{class:'primary full-button'});panel.append(equation,hint,add);
    function refresh() {
      if(!tangentDraft||tangentDraft.annotation!==annotation)return;
      tangentDraft.valid=false;
      try{
        if(!at.value.trim())throw new Error('接点の座標を入力してください。');
        setTangentSource(annotation,sourceInput?.value||source.id);annotation.at=canonical(at.value);
        const result=GraphAnnotations.tangentEquation(annotation,current());if(!result.text)throw new Error(result.warning);
        if(current().annotations.length>=100)throw new Error('注釈は100個まで追加できます。');
        equation.textContent=result.text;tangentDraft.valid=true;
      }catch(error){equation.textContent=error.message;}
      add.disabled=!tangentDraft.valid;at.setAttribute('aria-invalid',String(!tangentDraft.valid));equation.classList.toggle('error',!tangentDraft.valid);positionQuickTangent();requestDraw();
    }
    function commit() {
      refresh();if(!tangentDraft?.valid)return;const added=C.clone(annotation),next=C.clone(current());next.annotations.push(added);
      C.validateDocument(next);changed(d=>d.annotations.push(added));select({type:'annotation',id:added.id});
      $('selection-toolbar').querySelector('[aria-label="位置・設定"]')?.focus({preventScroll:true});
    }
    at.addEventListener('input',refresh);at.addEventListener('keydown',event=>{if(event.key==='Enter'&&!event.isComposing&&event.keyCode!==229&&!event.metaKey&&!event.ctrlKey&&!event.altKey){event.preventDefault();run(commit);}});
    refresh();if(focus){at.focus({preventScroll:true});at.select();}
  }
  function quickChange(type,id,mutator) { try{changed(d=>{const object=d[type==='series'?'series':'annotations'].find(x=>x.id===id);if(!object)throw new Error('対象が見つかりません。');mutator(object);},null,true,false);}finally{refreshQuickControls();} }
  function refreshQuickControls() {
    const target=activeSeries()||activeAnnotation();if(!target)return;
    const swatch=document.querySelector('[data-object-id="'+target.id+'"] .swatch');if(swatch)swatch.style.backgroundColor=target.style.color;
    for(const b of $('selection-toolbar').querySelectorAll('.quick-color'))b.setAttribute('aria-pressed',String(b.dataset.quickControl==='color-'+target.style.color.toLowerCase().slice(1)));
    const values={width:target.style.width,dash:target.style.dash,opacity:target.style.opacity,'label-size':target.label?.size,'label-visible':target.label?.visible,'equation-visible':target.showEquation,'metrics-visible':target.showMetrics,'area-visible':target.showArea,'integral-visible':target.showIntegral};
    for(const [key,value]of Object.entries(values)){const el=$('selection-toolbar').querySelector('[data-quick-control="'+key+'"]');if(!el)continue;if(el.type==='checkbox')el.checked=value;else{el.value=value;if(el.type==='number')el.defaultValue=String(value);}}
  }
  function colorButtons(target,type,colors,label) {
    const group=node('div',null,{class:'quick-palette',role:'group','aria-label':label});
    for(const color of colors){const label='色を変更：'+colorNames[palette.indexOf(color)]+'（'+color+'）';const b=button(null,()=>quickChange(type,target.id,o=>{o.style.color=color;}),{class:'quick-color','aria-label':label,'data-tip':label,'data-quick-control':'color-'+color.slice(1),'aria-pressed':String(target.style.color.toLowerCase()===color)});b.style.setProperty('--swatch-color',color);b.append(node('span',null,{'aria-hidden':'true'}));group.append(b);}
    return group;
  }
  function quickNumber(parent,label,value,min,max,step,key,onChange) {
    const input=field(parent,label,value,'number',{min,max,step,'data-quick-control':key});input.defaultValue=String(value);
    input.addEventListener('keydown',event=>{if(event.key==='Escape'&&!event.isComposing)input.value=input.defaultValue;});
    input.addEventListener('change',()=>run(()=>{try{onChange(requiredNumber(input));}catch(error){refreshQuickControls();throw error;}}));return input;
  }
  function appendQuickStyle(bar,target,type) {
    const panel=node('div',null,{id:'selection-style',class:'selection-details'});bar.append(panel);
    panel.append(colorButtons(target,type,palette.filter(c=>!quickColors.includes(c)),'その他の色'));
    const label=isRegion(target)?'塗りつぶしの詳細…':'色・線の詳細…';
    panel.append(button(label,()=>editStyle(target.id,type),{'aria-label':label,class:'full-button','data-quick-control':'style-detail','data-tip':'自由な色・RGB・不透明度などを設定'}));
  }
  function appendQuickLine(bar,target,type) {
    if(isRegion(target)){
      const group=node('div',null,{class:'quick-line-controls field-grid',role:'group','aria-label':'領域の表示'});bar.append(group);
      quickNumber(group,'不透明度（0〜1）',target.style.opacity,0,1,.05,'opacity',value=>quickChange(type,target.id,o=>{o.style.opacity=value;}));
      const checks=node('div',null,{class:'region-display-options'});group.append(checks);
      const visible=check(checks,'面積を図に表示',target.showArea);visible.dataset.quickControl='area-visible';visible.addEventListener('change',()=>run(()=>quickChange(type,target.id,o=>{o.showArea=visible.checked;})));
      if(target.kind==='curveRegion'){const integral=check(checks,'定積分を図に表示',target.showIntegral);integral.dataset.quickControl='integral-visible';integral.addEventListener('change',()=>run(()=>quickChange(type,target.id,o=>{o.showIntegral=integral.checked;})));}return;
    }
    if(target.kind==='surface'||target.kind==='text')return;
    const group=node('div',null,{class:'quick-line-controls field-grid',role:'group','aria-label':'線の設定'});bar.append(group);
    quickNumber(group,'線の太さ',target.style.width,.5,20,.5,'width',value=>quickChange(type,target.id,o=>{o.style.width=value;}));
    const dash=choice(group,'線種',target.style.dash,[['solid','実線'],['dash','破線'],['dot','点線']]);dash.dataset.quickControl='dash';dash.addEventListener('change',()=>run(()=>quickChange(type,target.id,o=>{o.style.dash=dash.value;})));
  }
  function appendQuickLabel(bar,target) {
    const panel=node('div',null,{id:'selection-label',class:'selection-details'});bar.append(panel);
    const visible=check(panel,target.kind==='text'?'文字を表示':'名前を表示',target.label.visible);visible.dataset.quickControl='label-visible';visible.addEventListener('change',()=>run(()=>quickChange('annotation',target.id,o=>{o.label.visible=visible.checked;})));
    if(target.kind==='tangent'){const equation=check(panel,'接線の方程式を図に表示',target.showEquation);equation.dataset.quickControl='equation-visible';equation.addEventListener('change',()=>run(()=>quickChange('annotation',target.id,o=>{o.showEquation=equation.checked;})));}
    if(target.kind==='regression')for(const [key,label,control]of [['showEquation','回帰式を図に表示','equation-visible'],['showMetrics','R²を図に表示','metrics-visible']]){const input=check(panel,label,target[key]);input.dataset.quickControl=control;input.addEventListener('change',()=>run(()=>quickChange('annotation',target.id,o=>{o[key]=input.checked;})));}
    quickNumber(panel,'文字サイズ（px）',target.label.size,8,48,1,'label-size',value=>quickChange('annotation',target.id,o=>{o.label.size=value;}));
    panel.append(button('文字・配置の詳細…',()=>editLabel(target.id),{'aria-label':'文字・配置の詳細…',class:'full-button','data-quick-control':'label-detail','data-tip':'文字サイズと上下左右のずれを設定'}));
  }
  function removeSeries(id) { changed(d=>C.removeSeries(d,id),'曲線と、それを参照する点・補助線を削除しました。元に戻せます。');select(null); }
  function removeAnnotation(id) { changed(d=>C.removeAnnotation(d,id),'参照する線分・交点・領域も一緒に削除しました。元に戻せます。');select(null); }
  function setParameter(name,value) { try{changed(d=>{d.parameters.find(p=>p.name===name).value=value;});}catch(error){parameterPreview=null;updateParameters();updateTangentEquations(current());requestDraw();throw error;} }
  function requestDraw() {
    if(!history)return Promise.resolve();drawPending=true;if(exportBusy||drawing)return drawTask;drawing=true;drawTask=drawPlot();return drawTask;
  }
  async function drawPlot() {
    try { while(drawPending) { drawPending=false; const doc=C.clone(gesture?.preview||current()); if(parameterPreview){const p=doc.parameters.find(x=>x.name===parameterPreview.name);if(p)p.value=parameterPreview.value;}
      if(tangentDraft?.valid){const preview=C.clone(tangentDraft.annotation);preview.name='接線（プレビュー）';preview.style.opacity=.65;doc.annotations.push(preview);}
      updateTangentEquations(doc);updateRegionAreas(doc);
      try { const result=await P.render($('plot'),doc,{dark:isDark(),camera,onSelect:id=>select({type:'series',id}),onAnnotationSelect:id=>{if(current().annotations.some(a=>a.id===id))select({type:'annotation',id});},onBlankClick:()=>{if(selected)select(null);},onViewChange:view=>{
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
  function undo(redo=false) { cancelTangentDraft();cancelGesture();parameterPreview=null; if(redo)history.redo();else history.undo(); selected=null;camera=undefined;updateHeader();updateList();updateToolbar();persistSoon();requestDraw(); }
  function openDialog(title, build, onApply, submit='適用') {
    const focused=document.activeElement,addTrigger=focused?.closest('.add-menu')?.querySelector('.add-menu-toggle');
    cancelTangentDraft();cancelGesture();cancelParameterPreview();closeMenus(); if($('editor-dialog').open)$('editor-dialog').close(); dialogOpener=addTrigger||focused;dialogOpenerKey=dialogOpener?.dataset.quickControl;dialogListDetail=dialogOpener?.dataset.objectDetails;dialogSelectionKey=$('selection-toolbar').dataset.selectionKey;dialogApply=onApply;
    $('editor-dialog').classList.remove('wide-dialog');$('dialog-title').textContent=title;$('dialog-content').replaceChildren();$('dialog-error').hidden=true;$('dialog-submit').hidden=!onApply;$('dialog-submit').textContent=submit;
    $('dialog-cancel').textContent=onApply?'キャンセル':'閉じる';build($('dialog-content'));$('editor-dialog').showModal();
    const focus=$('dialog-content').querySelector('input,textarea,select,button');if(focus)focus.focus();
  }
  function closeDialog() {
    document.body.classList.remove('print-ready');$('print-sheet').replaceChildren();$('editor-dialog').close();
    const replacement=dialogListDetail?document.querySelector('[data-object-details="'+CSS.escape(dialogListDetail)+'"]'):dialogOpenerKey&&dialogSelectionKey===$('selection-toolbar').dataset.selectionKey?$('selection-toolbar').querySelector('[data-quick-control="'+CSS.escape(dialogOpenerKey)+'"]'):null,opener=dialogOpener?.isConnected?dialogOpener:replacement;
    if((dialogListDetail||opener?.classList.contains('add-menu-toggle'))&&opener&&matchMedia('(max-width:850px)').matches)setListOpen(true);
    if(opener?.getBoundingClientRect().width)opener.focus();else $('stage').focus();
  }
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
    const existing=current().series.find(s=>s.id===id), s=C.clone(supplied||existing);if(!s)return;let name,expression,xmin,xmax,ymin,ymax,componentX,componentY,intervalMin,intervalMax,table,interpolation,dataPoints,sourceKind,sourceTitle,sourceURL,sourceNotes;
    const isData=s.kind.startsWith('data'),is3=s.kind==='surface'||s.kind==='data3d',isParam=s.kind==='parametric',isPolar=s.kind==='polar',isImplicit=s.kind==='implicit';
    const formulaAttrs={maxlength:1000,spellcheck:'false',autocapitalize:'none',autocomplete:'off'};
    openDialog((existing?'編集：':'追加：')+kindNames[s.kind],parent=>{
      name=field(parent,'名前',s.name,'text',{maxlength:160});
      if(isData){
        $('editor-dialog').classList.add('wide-dialog');
        table=GraphTableEditor.mount(parent,s,{symbols:{x:symbol('x'),y:symbol('y'),z:symbol('z')},onError:report});
        parent.append(node('p','空欄は欠測として扱います。表計算の複数セルをそのまま貼り付けられます。描画に使わない列も保存し、統計量・相関行列で利用できます。',{class:'small muted'}));
        if(!is3){const g=grid(parent);interpolation=choice(g,'点の結び方',s.style.lines?s.interpolation:'none',[['none','結ばない（散布図）'],['linear','入力順に直線で結ぶ'],['monotone','滑らかに補間（PCHIP）']]);dataPoints=check(g,'元の点を表示',s.style.points);parent.append(node('p','誤差列は0以上の±幅。滑らかな補間には各連続区間の横軸の値が昇順または降順である必要があります。',{class:'small muted'}));}
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
      s.name=name.value.trim();if(isData){GraphTables.assign(s,table.read());if(!is3){s.style.lines=interpolation.value!=='none';s.style.points=dataPoints.checked||!s.style.lines;s.interpolation=interpolation.value==='monotone'?'monotone':'linear';}if(!s.rows.length)throw new Error('1行以上の数値を入力してください。');}
      else{if(isParam)s.components={x:canonical(componentX.value,s.kind),y:canonical(componentY.value,s.kind)};else s.expression=canonical(expression.value,s.kind);if(isParam||isPolar)s.interval=[requiredNumber(intervalMin),requiredNumber(intervalMax)];else{s.domain.x=[requiredNumber(xmin),requiredNumber(xmax)];if(is3||isImplicit)s.domain.y=[requiredNumber(ymin),requiredNumber(ymax)];}}
      s.source={kind:sourceKind.value,title:sourceTitle.value,url:sourceURL.value,notes:sourceNotes.value};
      changed(d=>{if(existing)d.series[d.series.findIndex(x=>x.id===id)]=s;else d.series.push(s);});select({type:'series',id:s.id});
    },'描画');
  }
  function addSeries(data=false,rows,errorBars,dataTable) {
    const s=C.createSeries(data?(current().mode==='3d'?'data3d':'data2d'):(current().mode==='3d'?'surface':'function'));
    s.style.color=palette[current().series.length%12];s.name=kindNames[s.kind]+' '+(current().series.length+1);
    s.domain={x:[current().axes.x.min,current().axes.x.max],y:[current().axes.y.min,current().axes.y.max]};
    if(data){s.expression='';s.rows=rows||[[0,0],[1,1],[2,4]].map(r=>current().mode==='3d'?[...r,r[1]]:r);s.style.points=true;}
    if(errorBars)s.errorBars=errorBars;
    else s.expression=current().mode==='3d'?'z = sin(x)*cos(y)':'y = x^2';
    if(dataTable)GraphTables.assign(s,dataTable);
    editSeries(null,s);
  }
  function addCurve(kind) {
    const s=C.createSeries(kind);s.name=kindNames[kind]+' '+(current().series.length+1);s.style.color=palette[current().series.length%12];
    s.domain={x:[current().axes.x.min,current().axes.x.max],y:[current().axes.y.min,current().axes.y.max]};
    if((kind==='polar'||kind==='parametric')&&current().angle==='deg')s.interval=[0,360];
    $('other-curves').open=false;editSeries(null,s);
  }
  function intersectionSources() { return [...current().series.filter(s=>s.kind==='function').map(s=>['series:'+s.id,'数式：'+(s.name||curveLabel(s))]),...current().annotations.filter(a=>a.kind==='tangent').map(a=>['tangent:'+a.id,'接線：'+(a.name||GraphAnnotations.tangentEquation(a,current()).text)]),...regressionSources().map(s=>[s.id,s.name])]; }
  function configureIntersection(a,values,interval) {
    const targets=values.map(value=>{const split=value.indexOf(':');return {type:value.slice(0,split),id:value.slice(split+1)};});
    const bothTangents=targets.every(t=>t.type==='tangent');
    if(!bothTangents&&current().annotations.some(item=>item.kind==='segment'&&[item.from,item.to].includes(a.id)))throw new Error('この交点は線分の端点です。端点として使う交点は接線2本を選んでください。');
    delete a.seriesIds;delete a.targets;delete a.tangentIds;delete a.interval;
    if(bothTangents){a.kind='tangentIntersection';a.tangentIds=targets.map(t=>t.id);}
    else{a.kind='intersection';a.interval=interval;if(targets.every(t=>t.type==='series'))a.seriesIds=targets.map(t=>t.id);else a.targets=targets;}
  }
  function addAnnotation(kind,seriesId) {
    const a=C.createAnnotation(kind);a.name=annotationNames[kind]+' '+(current().annotations.length+1);
    if(kind==='regression'){a.seriesId=seriesId||activeSeries()?.id||'';editRegression(null,a);return;}
    if(kind==='region'){a.segmentIds=defaultRegionSegments();editRegion(null,a);return;}
    if(!seriesId){const source=activeSeries(),annotation=activeAnnotation();if(kind==='point'&&source&&curveKinds.includes(source.kind))seriesId=source.id;else if(kind==='point'&&annotation?.kind==='regression')seriesId='regression:'+annotation.id;if(kind==='intersection'){if(source?.kind==='function')seriesId='series:'+source.id;else if(['tangent','regression'].includes(annotation?.kind))seriesId=annotation.kind+':'+annotation.id;}}
    if(kind==='point'&&seriesId){const s=[...current().series,...regressionSources()].find(s=>s.id===seriesId);a.anchor=curveAnchor(seriesId,String(['function','regression'].includes(s.kind)?Math.max(s.domain.x[0],Math.min(0,s.domain.x[1])):s.interval[0]));}
    if(kind==='intersection'){const sources=intersectionSources();if(sources.length<2)throw new Error('交点には、先に数式・接線・回帰曲線を合わせて2つ以上登録してください。');const first=sources.find(s=>s[0]===seriesId)?.[0]||sources[0][0],type=first.split(':')[0],second=sources.find(s=>s[0]!==first&&s[0].startsWith(type+':'))||sources.find(s=>s[0]!==first);configureIntersection(a,[first,second[0]],[current().axes.x.min,current().axes.x.max]);}
    if(kind==='segment'){a.from=seriesId||'';a.style.dash='solid';}
    if(kind==='text'){a.text='説明';a.label.dx=0;a.label.dy=0;}
    editAnnotation(null,a);
  }
  function editAnnotation(id,supplied) {
    if((supplied||current().annotations.find(a=>a.id===id))?.kind==='regression'){editRegression(id,supplied);return;}
    const existing=current().annotations.find(a=>a.id===id),a=C.clone(supplied||existing);if(!a)return;
    if(isRegion(a)){editRegion(id,a);return;}
    let name,pointType,curve,at,x,y,projections,axis,value,first,second,min,max,text,arrows,from,to,showEquation;
    const curves=[...current().series.filter(s=>curveKinds.includes(s.kind)),...regressionSources()], functions=functionSources();
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
        pointType=choice(parent,'点の指定方法',a.anchor.type==='regression'?'curve':a.anchor.type,[['free','座標を入力'],['curve','曲線上の点']]);
        if(!curves.length){pointType.querySelector('[value="curve"]').disabled=true;pointType.value='free';}
        const freeBox=grid(parent),curveBox=node('div');parent.append(curveBox);
        x=field(freeBox,symbol('x')+' 座標',display(a.anchor.x||'0'),'text',exprAttrs);y=field(freeBox,symbol('y')+' 座標',display(a.anchor.y||'0'),'text',exprAttrs);
        curve=choice(curveBox,'対象の曲線',(a.anchor.regressionId?'regression:'+a.anchor.regressionId:a.anchor.seriesId)||curves[0]?.id,options(curves));at=field(curveBox,'位置（'+symbol('x')+' / t / theta の値）',display(a.anchor.at||'0'),'text',exprAttrs);
        const hint=node('p','',{class:'small muted'});curveBox.append(hint);
        const refresh=()=>{freeBox.hidden=pointType.value!=='free';curveBox.hidden=pointType.value!=='curve';const s=curves.find(s=>s.id===curve.value);hint.textContent=s?(['function','regression'].includes(s.kind)?symbol('x'):s.kind==='parametric'?'t':'theta')+' の値を指定します。対象の定義範囲内で入力してください。':'';};pointType.addEventListener('change',refresh);curve.addEventListener('change',refresh);refresh();
        projections=check(parent,'軸への読取線を表示',a.projections);
      }else if(a.kind==='guide'){axis=choice(parent,'方向',a.axis,[['x','縦の線（'+symbol('x')+' = 一定）'],['y','横の線（'+symbol('y')+' = 一定）']]);value=field(parent,'座標の値',display(a.value),'text',exprAttrs);}
      else if(a.kind==='tangent'){
        curve=choice(parent,'対象の数式',tangentSource(a),options(functions));at=field(parent,'接点の '+symbol('x')+' 座標',display(a.at),'text',exprAttrs);
        const equation=node('output',null,{class:'equation-preview','aria-label':'接線の方程式'});parent.append(equation);showEquation=check(parent,'接線の方程式を図に表示',a.showEquation);
        const refresh=()=>{try{const result=GraphAnnotations.tangentEquation(setTangentSource({...a,at:canonical(at.value)},curve.value),current());equation.textContent=result.text||result.warning;}catch(error){equation.textContent=error.message;}};curve.addEventListener('change',refresh);at.addEventListener('input',refresh);refresh();
        parent.append(node('p','接点と接線は数値計算による近似です。角や未定義の点では接線を表示しません。方程式は左の一覧でも確認できます。',{class:'small muted'}));
      }
      else if(['intersection','tangentIntersection'].includes(a.kind)){
        const sources=intersectionSources(),values=a.tangentIds?.map(id=>'tangent:'+id)||a.seriesIds?.map(id=>'series:'+id)||a.targets.map(t=>t.type+':'+t.id);
        first=choice(parent,'1つ目の対象',values[0],sources);second=choice(parent,'2つ目の対象',values[1],sources);
        const g=grid(parent),interval=a.interval||[current().axes.x.min,current().axes.x.max];min=field(g,'探索する '+symbol('x')+' の最小値',interval[0],'number',{step:'any'});max=field(g,'探索する '+symbol('x')+' の最大値',interval[1],'number',{step:'any'});const hint=node('p','',{class:'small muted'});parent.append(hint);
        const refresh=()=>{const both=[first.value,second.value].every(v=>v.startsWith('tangent:'));g.hidden=both;hint.textContent=both?'2本の接線を延長した交点です。平行・一致・微分できない場合は理由を表示します。':'数式・接線・回帰曲線から2つ選びます。指定区間と数式の定義範囲が重なる部分を数値探索します。非常に近い交点や細かい振動は捉えきれないことがあります。';};first.addEventListener('change',refresh);second.addEventListener('change',refresh);refresh();
      }
      else if(a.kind==='segment'){from=endpoint(parent,'始点',a.from,'0');to=endpoint(parent,'終点',a.to,'2');arrows=choice(parent,'矢印',a.arrows,[['none','なし'],['end','終点に矢印'],['both','両端に矢印']]);parent.append(node('p','既存の点を選ぶと、そこにつながる線分が同じ端点を共有します。点を移動するとすべて追従します。続きの線分は操作バーの「終点から続ける」で追加できます。',{class:'small muted'}));}
      else if(a.kind==='text'){text=area(parent,'表示する文字',a.text);text.maxLength=2000;const g=grid(parent);x=field(g,symbol('x')+' 座標',display(a.anchor.x),'text',exprAttrs);y=field(g,symbol('y')+' 座標',display(a.anchor.y),'text',exprAttrs);parent.append(node('p','改行、v_0・v_{max} の下付き、m^2・m^{2} の上付きに対応します。文字の大きさは「文字・配置」で設定します。',{class:'small muted'}));}
      if(!['intersection','tangentIntersection'].includes(a.kind))parent.append(node('p','座標や位置には 1/2、sqrt(2)、π、登録した係数などの数式も使えます。数値だけで指定した点や文字はドラッグでも移動できます。',{class:'small muted'}));
    },()=>{
      a.name=name.value.trim();
      const extra=[];
      if(a.kind==='point'){a.anchor=pointType.value==='free'?{type:'free',x:canonical(x.value),y:canonical(y.value)}:curveAnchor(curve.value,canonical(at.value));a.projections=projections.checked;}
      else if(a.kind==='guide'){a.axis=axis.value;a.value=canonical(value.value);}
      else if(a.kind==='tangent'){setTangentSource(a,curve.value);a.at=canonical(at.value);a.showEquation=showEquation.checked;}
      else if(['intersection','tangentIntersection'].includes(a.kind)){const both=[first.value,second.value].every(v=>v.startsWith('tangent:'));configureIntersection(a,[first.value,second.value],both?null:[requiredNumber(min),requiredNumber(max)]);}
      else if(a.kind==='text'){a.text=text.value;a.anchor={type:'free',x:canonical(x.value),y:canonical(y.value)};}
      else if(a.kind==='segment'){
        const endpointId=f=>{if(f.pick.value!=='new')return f.pick.value;const p=C.createAnnotation('point');p.name=(a.name||'線分')+'の'+f.label;p.anchor={type:'free',x:canonical(f.x.value),y:canonical(f.y.value)};p.projections=false;p.label.visible=false;p.style.color=a.style.color;extra.push(p);return p.id;};
        a.from=endpointId(from);a.to=endpointId(to);a.arrows=arrows.value;
      }
      changed(d=>{d.annotations.push(...extra);if(existing)d.annotations[d.annotations.findIndex(x=>x.id===id)]=a;else d.annotations.push(a);});select({type:'annotation',id:a.id});
    },'描画');
  }
  function defaultRegionSegments() {
    const edges=current().annotations.filter(a=>a.kind==='segment'),remaining=new Set(edges.map(a=>a.id)),groups=[];
    while(remaining.size){
      const first=edges.find(a=>remaining.has(a.id)),ids=[first.id],points=new Set([first.from,first.to]);remaining.delete(first.id);
      let extended=true;while(extended){extended=false;for(const edge of edges)if(remaining.has(edge.id)&&(points.has(edge.from)||points.has(edge.to))){remaining.delete(edge.id);ids.push(edge.id);points.add(edge.from);points.add(edge.to);extended=true;}}
      if(!GraphRegions.traceBoundary({segmentIds:ids},current()).warning)groups.push(ids);
    }
    const chosen=activeAnnotation();return groups.find(ids=>chosen?.kind==='segment'&&ids.includes(chosen.id))||(groups.length===1?groups[0]:[]);
  }
  function editRegion(id,supplied) {
    const existing=current().annotations.find(a=>a.id===id),a=C.clone(supplied||existing);if(!a)return;
    let name,showArea,showIntegral,method,first,second,min,max;const selectedEdges=new Set(a.segmentIds||[]),inputs=[];
    const edges=current().annotations.filter(a=>a.kind==='segment'),sources=intersectionSources(),pointName=id=>current().annotations.find(p=>p.id===id)?.name||'点';
    const source=activeSeries(),tangent=activeAnnotation(),activeTarget=source?.kind==='function'?'series:'+source.id:['tangent','regression'].includes(tangent?.kind)?tangent.kind+':'+tangent.id:'';
    const initialKind=existing?a.kind:sources.length&&(activeTarget||selectedEdges.size<3)?'curveRegion':'region';
    const firstDefault=activeTarget||sources[0]?.[0]||'',firstSeries=functionSources().find(s=>(s.kind==='regression'?s.id:'series:'+s.id)===firstDefault);
    const start=Math.max(current().axes.x.min,firstSeries?.domain.x[0]??-1e9),end=Math.min(current().axes.x.max,firstSeries?.domain.x[1]??1e9);
    const initialInterval=start<=0&&end>=1?['0','1']:start<end?[String(start),String(end)]:['0','1'];
    const targetKey=t=>t.type==='axis'?'axis:x':t.type+':'+t.id;
    const readTarget=value=>{const [type,key]=value.split(':');return type==='axis'?{type,axis:'x'}:{type,id:key||''};};
    const formulaAttrs={maxlength:1000,spellcheck:'false',autocapitalize:'none',autocomplete:'off'};
    const draft=()=>{
      const kind=existing?a.kind:method.value,next={...C.createAnnotation(kind),id:a.id,name:name.value.trim(),visible:a.visible,style:C.clone(a.style),label:C.clone(a.label),showArea:showArea.checked};
      if(kind==='region')next.segmentIds=[...selectedEdges];
      else{next.targets=[readTarget(first.value),readTarget(second.value)];next.interval=[canonical(min.value),canonical(max.value)];next.showIntegral=showIntegral.checked;}
      return next;
    };
    openDialog(existing?'編集：領域':'領域を作成',parent=>{
      if(!existing)method=choice(parent,'領域の作り方',initialKind,[['region','線分で囲む'],['curveRegion','曲線と軸・曲線の間']]);
      name=field(parent,'名前',a.name,'text',{maxlength:160});
      const box=node('fieldset',null,{class:'axis-fields'});box.append(node('legend','境界に使う線分'));parent.append(box);
      box.append(node('p','端点に同じ点を使ってつないだ線分を選びます。',{class:'small muted'}));
      const list=node('div',null,{class:'region-boundaries'});box.append(list);
      for(const edge of edges){const input=check(list,(edge.name||'線分')+'（'+pointName(edge.from)+' → '+pointName(edge.to)+'）',selectedEdges.has(edge.id));input.dataset.regionSegment=edge.id;input.addEventListener('change',()=>{if(input.checked)selectedEdges.add(edge.id);else selectedEdges.delete(edge.id);refresh();});inputs.push(input);}
      if(!edges.length)list.append(node('p','先に点と線分を追加して、閉じた輪郭を作ってください。',{class:'small muted'}));
      const actions=node('div',null,{class:'region-boundary-actions'});box.append(actions);
      actions.append(button('すべて選択',()=>{for(const input of inputs){input.checked=true;selectedEdges.add(input.dataset.regionSegment);}refresh();}),button('クリア',()=>{for(const input of inputs)input.checked=false;selectedEdges.clear();refresh();}));
      const curveBox=node('fieldset',null,{class:'axis-fields'});curveBox.append(node('legend','境界と区間'));parent.append(curveBox);
      first=choice(curveBox,'第1の境界',a.targets?targetKey(a.targets[0]):firstDefault,sources.length?sources:[['','先に数式・接線・回帰曲線を追加してください']]);
      second=choice(curveBox,'第2の境界',a.targets?targetKey(a.targets[1]):'axis:x',[['axis:x',symbol('x')+' 軸（'+symbol('y')+' = 0）'],...sources]);
      const interval=grid(curveBox),values=a.interval||initialInterval;
      min=field(interval,symbol('x')+' の始点',display(values[0]),'text',formulaAttrs);max=field(interval,symbol('x')+' の終点',display(values[1]),'text',formulaAttrs);
      curveBox.append(node('p','始点 < 終点。pi や係数も使えます。',{class:'small muted'}));
      const preview=node('output',null,{class:'equation-preview region-preview','aria-label':'領域の確認','aria-live':'polite'});parent.append(preview);
      showArea=check(parent,'面積を図に表示',a.showArea);
      const integralBox=node('div');parent.append(integralBox);showIntegral=check(integralBox,'定積分を図に表示',a.showIntegral===true);
      integralBox.append(node('p','面積は常に0以上。定積分は「第1の境界 − 第2の境界」を積分した符号付きの値です。いずれも数値近似です。',{class:'small muted'}));
      parent.append(node('p','面積は軸の座標値から計算します。単位の換算は行いません。',{class:'small muted'}));
      function refresh(){
        const kind=existing?a.kind:method.value,isCurve=kind==='curveRegion';box.hidden=isCurve;curveBox.hidden=!isCurve;integralBox.hidden=!isCurve;
        try{const result=GraphAnnotations.evaluate(draft(),current());preview.textContent=result.warning||[GraphRegions.areaText(result.area,current()),isCurve?GraphRegions.integralText(result.integral,current()):''].filter(Boolean).join('\n');preview.classList.toggle('region-invalid',!!result.warning);}
        catch(error){preview.textContent=error.message;preview.classList.add('region-invalid');}
      }
      method?.addEventListener('change',refresh);for(const input of [first,second])input.addEventListener('change',refresh);for(const input of [min,max])input.addEventListener('input',refresh);
      refresh();
    },()=>{
      const next=draft(),boundaryKey=value=>JSON.stringify(value.kind==='region'?[...value.segmentIds].sort():[value.targets,value.interval]);
      if(!existing||boundaryKey(existing)!==boundaryKey(next)){const result=GraphAnnotations.evaluate(next,current());if(result.warning)throw new Error(result.warning);}
      changed(d=>{if(existing)d.annotations[d.annotations.findIndex(item=>item.id===id)]=next;else d.annotations.push(next);});select({type:'annotation',id:next.id});
    },existing?'適用':'領域を作成');
  }
  function measurementHeaders(series,mode) {
    if(series.kind==='data3d')return ['x','y','z'].map(symbol);
    mode=mode||C.measurementMode(series);
    return [symbol('x'),symbol('y'),...(mode==='x'||mode==='xy'?['Δ'+symbol('x')]:[]),...(mode==='y'||mode==='xy'?['Δ'+symbol('y')]:[])];
  }
  function appendDataTable(parent,headers,rows,limit=100) {
    const wrap=node('div',null,{class:'table-wrap',tabindex:'0','aria-label':'数値一覧（横にスクロールできます）'}),table=node('table',null,{class:'data-table'}),head=node('thead'),tr=node('tr'),body=node('tbody');
    for(const label of headers)tr.append(node('th',label,{scope:'col'}));head.append(tr);table.append(head,body);
    for(const values of rows.slice(0,limit)){const row=node('tr');for(const value of values)row.append(node('td',value===null?'欠測':String(value)));body.append(row);}
    wrap.append(table);parent.append(wrap);
    if(rows.length>limit)parent.append(node('p','先頭'+limit+'行を表示しています。CSVには全行を出力します。',{class:'small muted'}));
  }
  function showStatistics(id) {
    const sources=current().series.filter(s=>s.kind.startsWith('data'));
    if(!sources.length)throw new Error('統計量を確認するには、先に数表を追加してください。');
    let source,columnBox,results,selectedColumns,table;
    const definitions=[['n','有効数 n'],['missing','欠測数'],['sum','合計'],['mean','平均'],['median','中央値'],['min','最小値'],['max','最大値'],['variance','分散（nで割る）'],['standardDeviation','標準偏差（nで割る）'],['sampleVariance','不偏分散（n−1で割る）'],['sampleStandardDeviation','標準偏差（n−1で割る）']];
    const number=value=>value===null?'未定義':String(Number(value.toPrecision(8)));
    openDialog('統計量・相関行列',parent=>{
      $('editor-dialog').classList.add('wide-dialog');
      source=choice(parent,'集計する数表',sources.some(s=>s.id===id)?id:sources[0].id,sources.map(s=>[s.id,s.name||'数表']));
      const details=node('details');details.append(node('summary','集計する列を選ぶ'));columnBox=node('div',null,{class:'statistics-columns'});details.append(columnBox);parent.append(details);
      results=node('div',null,{'data-statistics-results':''});parent.append(results);
      parent.append(node('p','空欄を除いて計算します。相関係数は同じ行の両方に値がある組だけを使うため、列の組によって n が変わります。一定の列や2組未満の相関は未定義です。相関は因果関係を示しません。',{class:'small muted'}));
      parent.append(node('p','「n−1で割る標準偏差」は不偏分散の平方根です。標準偏差そのものの不偏推定量ではありません。表示は8有効桁、CSVには計算した精度で保存します。',{class:'small muted'}));
      const load=()=>{
        table=GraphTables.fromSeries(sources.find(s=>s.id===source.value),{x:symbol('x'),y:symbol('y'),z:symbol('z')});
        selectedColumns=new Set(table.columns.map((_,i)=>i));columnBox.replaceChildren();
        table.columns.forEach((label,i)=>{const input=check(columnBox,(i+1)+': '+label,true);input.dataset.statisticsColumn=i;input.addEventListener('change',()=>{if(input.checked)selectedColumns.add(i);else selectedColumns.delete(i);refresh();});});refresh();
      };
      function refresh(){
        results.replaceChildren();const indices=[...selectedColumns].sort((a,b)=>a-b);
        if(!indices.length){results.append(node('p','集計する列を選んでください。'));return;}
        const summary=GraphStatistics.summarize(table,indices),matrix=GraphStatistics.matrix(table,indices),labels=summary.map(s=>(s.index+1)+': '+s.name);
        const actions=node('div',null,{class:'statistics-actions'});results.append(actions);
        actions.append(button('統計量をCSVで保存',()=>download(C.tableCSV(summary.map(s=>[s.name,...definitions.map(([key])=>s[key]),s.warning]),['列',...definitions.map(([,label])=>label),'注意']),filename(sources.find(s=>s.id===source.value).name)+'-統計量.csv','text/csv;charset=utf-8')));
        actions.append(button('相関行列をCSVで保存',()=>download(C.tableCSV(matrix.values.map((r,i)=>[labels[i],...r]),['Pearson r',...labels]),filename(sources.find(s=>s.id===source.value).name)+'-相関行列.csv','text/csv;charset=utf-8')));
        actions.append(button('相関の使用数をCSVで保存',()=>download(C.tableCSV(matrix.counts.map((r,i)=>[labels[i],...r]),['使用数 n',...labels]),filename(sources.find(s=>s.id===source.value).name)+'-相関の使用数.csv','text/csv;charset=utf-8')));
        results.append(node('h3','基本統計量'));appendDataTable(results,['統計量',...labels],definitions.map(([key,label])=>[label,...summary.map(s=>number(s[key]))]));
        summary.filter(s=>s.warning).forEach(s=>results.append(node('p',s.name+'：'+s.warning,{class:'small muted'})));
        results.append(node('h3','相関行列（Pearson r）'));
        const wrap=node('div',null,{class:'table-wrap correlation-wrap',tabindex:'0','aria-label':'相関行列。横にスクロールできます。'}),el=node('table',null,{class:'data-table correlation-table'}),thead=node('thead'),head=node('tr'),body=node('tbody');
        head.append(node('th','変数',{scope:'col'}));labels.forEach(label=>head.append(node('th',label,{scope:'col'})));thead.append(head);el.append(thead,body);
        labels.forEach((label,i)=>{const row=node('tr');row.append(node('th',label,{scope:'row'}));labels.forEach((other,j)=>{
          const value=matrix.values[i][j],n=matrix.counts[i][j],reason=matrix.warnings[i][j],cell=node('td',null,{'data-correlation':i+','+j,title:reason||label+' × '+other});
          cell.append(node('strong',number(value)),node('small','n = '+n));cell.setAttribute('aria-label',label+' × '+other+'：'+number(value)+'、使用数 '+n+(reason?'。'+reason:''));row.append(cell);
        });body.append(row);});wrap.append(el);results.append(wrap);
      }
      source.addEventListener('change',load);load();
    });
  }
  function editRegression(id,supplied) {
    const existing=current().annotations.find(a=>a.id===id),a=C.clone(supplied||existing),sources=current().series.filter(s=>s.kind==='data2d');
    if(!sources.length)throw new Error('回帰分析には、先に2Dの数表を追加してください。');
    if(!sources.some(s=>s.id===a.seriesId))a.seriesId=sources[0].id;
    let name,source,model,equation,metrics,result;
    const models=[['linear','直線'],['proportional','原点を通る直線'],['quadratic','2次式'],['exponential','指数 A exp(B·'+symbol('x')+')'],['power','べき乗 A·'+symbol('x')+'^B']];
    openDialog(existing?'編集：回帰分析':'追加：回帰分析',parent=>{
      name=field(parent,'名前',a.name,'text',{maxlength:160});
      const g=grid(parent);source=choice(g,'分析する数表',a.seriesId,sources.map(s=>[s.id,s.name||'数表']));model=choice(g,'回帰モデル',a.model,models);
      const preview=node('div',null,{class:'analysis-preview'});parent.append(preview);
      equation=check(parent,'回帰式を図に表示',a.showEquation);metrics=check(parent,'R²を図に表示',a.showMetrics);
      const residuals=node('details',null,{'data-analysis-residuals':''});residuals.append(node('summary','残差を確認・保存'));const residualBody=node('div');residuals.append(residualBody);parent.append(residuals);
      const note=node('p','',{class:'small muted'});parent.append(note);
      const number=value=>value===null?'未定義':String(Number(value.toPrecision(8)));
      const refresh=()=>{
        result=GraphAnalysis.fit(sources.find(s=>s.id===source.value),model.value);preview.replaceChildren();residualBody.replaceChildren();
        note.textContent='各点を等しい重みで分析します。誤差棒は重みとして使いません。'+(['exponential','power'].includes(model.value)?'指数・べき乗は対数変換後の最小二乗です。':'')+'R²とRMSEは元の縦軸の値から計算します。rは元の横軸と縦軸のPearson相関係数で、因果関係を示すものではありません。';
        if(result.warning){preview.append(node('p',result.warning,{class:'error','data-analysis-warning':''}));return;}
        preview.append(node('output',GraphAnalysis.equation(result,symbol('x'),symbol('y')),{class:'equation-preview','aria-label':'回帰式'}));
        const stats=node('dl',null,{class:'analysis-statistics'});
        for(const [label,value,key]of [['使用した点',String(result.n),'n'],['欠測で除外',String(result.skipped),'skipped'],['R²',number(result.r2),'r2'],['相関係数 r',number(result.r),'r'],['RMSE',number(result.rmse),'rmse']]){const cell=node('div');cell.append(node('dt',label),node('dd',value,{'data-analysis-stat':key}));stats.append(cell);}preview.append(stats);
        const headers=['元の行',symbol('x'),symbol('y'),'近似値','残差（実測値 − 近似値）'];
        residualBody.append(button('残差をCSVで保存',()=>download(C.tableCSV(result.residuals,headers),filename(name.value||'回帰分析')+'-残差.csv','text/csv;charset=utf-8')));
        appendDataTable(residualBody,headers,result.residuals.map(r=>r.map(number)));
      };
      source.addEventListener('change',refresh);model.addEventListener('change',refresh);refresh();
    },()=>{
      if(result.warning&&(!existing||source.value!==existing.seriesId||model.value!==existing.model))throw new Error(result.warning);
      a.name=name.value.trim();a.seriesId=source.value;a.model=model.value;a.showEquation=equation.checked;a.showMetrics=metrics.checked;
      changed(d=>{if(existing)d.annotations[d.annotations.findIndex(item=>item.id===id)]=a;else d.annotations.push(a);});select({type:'annotation',id:a.id});
    },existing?'適用':'回帰曲線を追加');
  }
  function editLabel(id) {
    const a=current().annotations.find(a=>a.id===id);let visible,dx,dy,size,equation,metrics;
    openDialog('文字・配置',parent=>{visible=check(parent,a.kind==='text'?'文字を表示':'名前を表示',a.label.visible);if(a.kind==='tangent')equation=check(parent,'接線の方程式を図に表示',a.showEquation);if(a.kind==='regression'){equation=check(parent,'回帰式を図に表示',a.showEquation);metrics=check(parent,'R²を図に表示',a.showMetrics);}const g=grid(parent);size=field(g,'文字サイズ（px）',a.label.size,'number',{min:8,max:48,step:1});dx=field(g,'横のずれ（右へ px）',a.label.dx,'number',{min:-500,max:500,step:1});dy=field(g,'縦のずれ（下へ px）',a.label.dy,'number',{min:-500,max:500,step:1});parent.append(node('p','名前はドラッグでも位置を調整できます。上付きは m^2、下付きは v_0、複数文字は v_{max} と入力します。',{class:'small muted'}));},()=>changed(d=>{const target=d.annotations.find(a=>a.id===id);target.label={visible:visible.checked,dx:requiredNumber(dx),dy:requiredNumber(dy),size:requiredNumber(size)};if(equation)target.showEquation=equation.checked;if(metrics)target.showMetrics=metrics.checked;}));
  }
  function editStyle(id,type='series') {
    const key=type==='annotation'?'annotations':'series',s=current()[key].find(x=>x.id===id);let color,width,dash,opacity,points,lines;let rgb=[];
    openDialog(isRegion(s)?'塗りつぶし':'色・線',parent=>{
      const pal=node('div',null,{class:'palette','aria-label':'色のパレット'});parent.append(pal);
      const refresh=value=>{color.value=value;for(const b of pal.children)b.setAttribute('aria-pressed',String(b.dataset.color===value.toLowerCase()));[0,1,2].forEach((i)=>rgb[i].value=parseInt(value.slice(1+i*2,3+i*2),16));};
      for(const value of palette){const b=button('',()=>refresh(value),{'aria-label':'色 '+value,'data-color':value,'aria-pressed':String(value===s.style.color)});b.style.backgroundColor=value;pal.append(b);}
      color=field(parent,'自由な色',s.style.color,'color');const colors=grid(parent,true);rgb=['R','G','B'].map((label,i)=>field(colors,label,parseInt(s.style.color.slice(1+i*2,3+i*2),16),'number',{min:0,max:255,step:1}));
      color.addEventListener('input',()=>refresh(color.value));for(const input of rgb)input.addEventListener('change',()=>run(()=>{const values=rgb.map(requiredNumber);if(values.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('RGBは0〜255の整数です。');refresh('#'+values.map(v=>v.toString(16).padStart(2,'0')).join(''));}));
      const g=grid(parent);if(!isRegion(s)){width=field(g,'線の太さ',s.style.width,'number',{min:.5,max:20,step:.5});dash=choice(g,'線種',s.style.dash,[['solid','実線'],['dash','破線'],['dot','点線']]);}opacity=field(g,'不透明度（0〜1）',s.style.opacity,'number',{min:0,max:1,step:.05});
      if(s.kind==='surface'){width.disabled=true;dash.disabled=true;}else if(type==='series'){points=check(parent,'点を表示',s.style.points);lines=check(parent,'線を表示',s.style.lines);}
    },()=>{const values=rgb.map(requiredNumber);if(values.some(v=>!Number.isInteger(v)||v<0||v>255))throw new Error('RGBは0〜255の整数です。');if(points&&!points.checked&&!lines.checked)throw new Error('点または線のいずれかを表示してください。');changed(d=>{const st=d[key].find(x=>x.id===id).style;st.color='#'+values.map(v=>v.toString(16).padStart(2,'0')).join('');if(width){st.width=requiredNumber(width);st.dash=dash.value;}st.opacity=requiredNumber(opacity);if(points){st.points=points.checked;st.lines=lines.checked;}});});
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
    let name,angle,equal,gridOn,legend;const fields={},presentation={};
    openDialog('座標・グラフの設定',parent=>{
      name=field(parent,'グラフ名',current().name,'text',{maxlength:160});angle=choice(parent,'三角関数の角度',current().angle,[['rad','ラジアン'],['deg','度']]);
      for(const key of current().mode==='3d'?['x','y','z']:['x','y']){const a=current().axes[key],box=node('fieldset',null,{class:'axis-fields','data-axis':key});box.append(node('legend',({x:'横軸',y:'縦軸',z:'高さの軸'})[key]+'（'+a.symbol+'）'));parent.append(box);const g=grid(box);fields[key]={symbol:field(g,'数式で使う記号',a.symbol,'text',{maxlength:32,spellcheck:'false',autocapitalize:'none'}),label:field(g,'軸名（表示）',a.label,'text',{maxlength:80}),unit:field(g,'単位（表示）',a.unit,'text',{maxlength:80}),min:field(g,'最小値',a.min,'number',{step:'any'}),max:field(g,'最大値',a.max,'number',{step:'any'}),scale:choice(box,'目盛',a.scale,[['linear','通常'],['log','対数（正の値）']]),step:field(g,'目盛の間隔（空欄で自動）',a.ticks.step===null?'':String(a.ticks.step),'text',{placeholder:'例：1、1/2、π/2',maxlength:100}),format:choice(g,'目盛の表記',a.ticks.format,[['auto','自動'],['decimal','小数'],['fraction','分数'],['pi','π の倍数']])};const refresh=()=>{fields[key].step.disabled=fields[key].format.disabled=fields[key].scale.value==='log';};fields[key].scale.addEventListener('change',refresh);refresh();}
      parent.append(node('p','記号は t、V、温度、θ などを使えます。軸間・係数・関数・定数と重複しない名前にしてください。軸名や単位は表示用で、v_0 や m^2 の添字も使えます。記号を変えてもグラフの数値は変わりません。',{class:'small muted'}));
      parent.append(node('p','媒介変数の t と極座標の θ は各式の独立変数です。角度を変更しても入力済みの範囲は自動換算しません。',{class:'small muted'}));
      equal=check(parent,'各軸の1単位を同じ長さで表示',current().equalScale);gridOn=check(parent,'グリッドを表示',current().grid);legend=check(parent,'凡例を表示',current().legend);
      const appearance=node('fieldset',null,{class:'axis-fields'});appearance.append(node('legend','軸の表示'));parent.append(appearance);
      for(const [key,label]of [['axisArrows','軸の正方向に矢印を表示（2D）'],['originLabel','原点に O を表示（2D）'],['tickMarks','目盛の線を表示'],['tickLabels','目盛の数値を表示']]){presentation[key]=check(appearance,label,current().presentation[key]);if(current().mode==='3d'&&['axisArrows','originLabel'].includes(key))presentation[key].disabled=true;}
    },()=>changed(d=>{d.name=name.value.trim();d.angle=angle.value;d.equalScale=equal.checked;d.grid=gridOn.checked;d.legend=legend.checked;for(const[key,input]of Object.entries(presentation))d.presentation[key]=input.checked;for(const[key,f]of Object.entries(fields)){const step=f.step.value.trim()?GraphExpression.compile(canonical(f.step.value),{variables:[],target:false,angle:d.angle}).evaluate({}):null;const nextSymbol=f.symbol.value.trim();d.axes[key]={symbol:nextSymbol,label:f.label.value===current().axes[key].symbol?nextSymbol:f.label.value,unit:f.unit.value,min:requiredNumber(f.min),max:requiredNumber(f.max),scale:f.scale.value,ticks:{step,format:f.format.value}};}}));
  }
  function fitView() {
    const doc=current(), values={x:[],y:[],z:[]},base=Object.fromEntries(doc.parameters.map(p=>[p.name,p.value]));
    const add=(key,value)=>{if(Number.isFinite(value)&&Math.abs(value)<=1e9&&(doc.axes[key].scale!=='log'||value>0))values[key].push(value);};
    for(const s of doc.series.filter(s=>s.visible&&matchesMode(s))) {
      if(s.kind.startsWith('data')){s.rows.forEach((r,index)=>{if(r.every(v=>v!==null))r.forEach((v,i)=>{const key=['x','y','z'][i];add(key,v);const width=s.errorBars?.[key]?.[index];if(Number.isFinite(width)&&(doc.axes[key].scale!=='log'||v-width>0)){add(key,v-width);add(key,v+width);}});});}
      else if(s.kind==='surface'){const samplingDoc=C.clone(doc);samplingDoc.axes.x.min=s.domain.x[0];samplingDoc.axes.x.max=s.domain.x[1];samplingDoc.axes.y.min=s.domain.y[0];samplingDoc.axes.y.max=s.domain.y[1];const sampled=P.sampleSurface(s,samplingDoc);for(const x of sampled.x)add('x',x);for(const y of sampled.y)add('y',y);for(const row of sampled.z)for(const z of row)add('z',z);}
      else if(['implicit','parametric','polar'].includes(s.kind)){const samplingDoc=C.clone(doc);if(s.kind==='implicit'){for(const key of ['x','y']){samplingDoc.axes[key].min=s.domain[key][0];samplingDoc.axes[key].max=s.domain[key][1];}}const sampler={implicit:'sampleImplicit',parametric:'sampleParametric',polar:'samplePolar'}[s.kind],sampled=GraphCurves[sampler](s,samplingDoc);sampled.x.forEach((x,i)=>{if(Number.isFinite(x)&&Number.isFinite(sampled.y[i])){add('x',x);add('y',sampled.y[i]);}});}
      else{const f=GraphExpression.compile(s.expression,{variables:['x',...doc.parameters.map(p=>p.name)],angle:doc.angle});for(let i=0;i<=500;i++){const x=s.domain.x[0]+(s.domain.x[1]-s.domain.x[0])*i/500;const y=f.evaluate({...base,x});if(Number.isFinite(y)){add('x',x);add('y',y);}}}
    }
    if(doc.mode==='2d')for(const a of doc.annotations.filter(a=>a.visible)){const result=GraphAnnotations.evaluate(a,doc);for(const p of result.points){add('x',p[0]);add('y',p[1]);}if(a.kind==='guide'&&result.segments.length)add(a.axis,result.segments[0][0][a.axis==='x'?0:1]);if(['segment','regression'].includes(a.kind))for(const segment of result.segments)for(const p of segment){add('x',p[0]);add('y',p[1]);}if(isRegion(a))for(const polygon of result.polygons||(result.polygon?[result.polygon]:[]))for(const p of polygon){add('x',p[0]);add('y',p[1]);}}
    changed(d=>{for(const key of d.mode==='3d'?['x','y','z']:['x','y']){const nums=values[key];if(!nums.length)continue;let min=Infinity,max=-Infinity;for(const v of nums){min=Math.min(min,v);max=Math.max(max,v);}if(d.axes[key].scale==='log'){if(min===max){min/=2;max*=2;}const pad=(Math.log10(max)-Math.log10(min))*.05;min=10**(Math.log10(min)-pad);max=10**(Math.log10(max)+pad);}else{const pad=(max-min||Math.max(Math.abs(min),1))*.07;min-=pad;max+=pad;}d.axes[key].min=Math.max(-1e9,min);d.axes[key].max=Math.min(1e9,max);}});
  }
  function setSide(which) {side=side===which?'':which;$('side-panel').hidden=!side;for(const value of ['templates','export']){$(value+'-panel').hidden=side!==value;$(value+'-tab').setAttribute('aria-expanded',String(side===value));}requestAnimationFrame(requestDraw);}
  function templateList() {const query=$('template-search').value.trim().toLowerCase(),list=$('template-list');list.replaceChildren();let category='';for(const item of templates){if(query&&!(item.name+item.category+item.description).toLowerCase().includes(query))continue;if(item.category!==category){category=item.category;list.append(node('h3',category,{class:'template-category'}));}const b=button('',()=>{const doc=C.validateDocument(item.document);cancelGesture();cancelParameterPreview();history.replace(doc);selected=null;camera=undefined;updateHeader();updateList();updateToolbar();persistSoon();requestDraw();if(matchMedia('(max-width:1150px)').matches)setSide('templates');notify('「'+item.name+'」を開きました。元に戻すこともできます。');},{class:'template-card'});b.append(node('strong',item.name),node('small',item.description));list.append(b);}if(!list.children.length)list.append(node('p','見つかりませんでした。'));}
  function filename(name) {return (name||'グラフ').replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,100);}
  function download(content,name,type) {const blob=content instanceof Blob?content:new Blob([content],{type:type||'application/json'}),url=URL.createObjectURL(blob),a=node('a',null,{href:url,download:name});document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),30000);}
  function encode(doc) {return JSON.stringify(C.validateDocument(doc),null,2);}
  function saveBrowser() {cancelTangentDraft();if(!store)throw new Error('ブラウザ保存を利用できません。ファイルに保存してください。');store.save('saved',current());closeMenus();status('ブラウザに明示保存済み');notify('明示保存しました。自動保存とは別に残ります。');}
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
  function loadDocument(doc) {const valid=C.validateDocument(doc);cancelGesture();cancelParameterPreview();history.replace(valid);selected=null;camera=undefined;updateList();updateToolbar();updateHeader();persistSoon();requestDraw();}
  function showSaved(initial=false) {
    openDialog(initial?'保存したグラフから再開':'保存したグラフを開く',parent=>{
      if(!store)parent.append(node('p','ブラウザ保存を利用できません。ローカルファイルを開いてください。'));
      for(const kind of ['auto','saved']){let entry;try{entry=store?.load(kind);}catch(error){parent.append(node('p',(kind==='auto'?'自動保存':'明示保存')+'：'+error.message,{class:'error'}));continue;}if(!entry)continue;const b=button('',()=>{loadDocument(entry.document);closeDialog();notify('保存したグラフを開きました。');},{class:'saved-option'});b.append(node('strong',(kind==='auto'?'自動保存':'明示保存')+'：'+entry.document.name),node('small',new Date(entry.at).toLocaleString('ja-JP')));parent.append(b);}
      parent.append(button('ローカルファイルを開く…',()=>{closeDialog();$('file-input').click();},{class:'full-button'}));
      if(initial)parent.append(node('p','「閉じる」で新しいグラフから始めます。編集を始めるまで、保存済みの内容は変更しません。',{class:'small muted'}));
      else parent.append(node('p','開いたあとも「元に戻す」で直前の図へ戻れます。',{class:'small muted'}));
    },null);
  }
  function updateOutputControls() {
    if(!history)return;
    for(const [key,value]of Object.entries(current().output)){const input=$('output-'+key);if(!input)continue;if(typeof value==='boolean')input.checked=value;else input.value=value;}
  }
  function saveOutputControls() {
    const out=C.clone(current().output);
    for(const key of Object.keys(out)){const input=$('output-'+key);out[key]=typeof out[key]==='boolean'?input.checked:typeof out[key]==='number'?requiredNumber(input):input.value;}
    if(JSON.stringify(out)!==JSON.stringify(current().output))changed(d=>{d.output=out;},undefined,false,false);
  }
  async function printPreview() {
    if(exportBusy)return;saveOutputControls();cancelTangentDraft();await requestDraw();if(exportBusy)return;
    exportBusy=true;$('print-preview').disabled=true;
    try{
      const doc=C.clone(current()),out=doc.output,is3=doc.mode==='3d';
      const url=await P.exportImage($('plot'),{format:is3?'png':'svg',scale:1,background:'white'});
      const dimensions=out.paper==='b5'?[182,257]:[210,297];if(out.orientation==='landscape')dimensions.reverse();
      const sheet=$('print-sheet');sheet.replaceChildren();
      if(out.title)sheet.append(node('h1',doc.name));sheet.append(node('img',null,{src:url,alt:doc.name+'のグラフ'}));
      sheet.style.setProperty('--print-page-height',(dimensions[1]-24)+'mm');
      $('print-page-style').textContent='@page { size: '+dimensions[0]+'mm '+dimensions[1]+'mm; margin: 12mm; }';
      document.body.classList.add('print-ready');
      openDialog('印刷プレビュー',parent=>{
        $('editor-dialog').classList.add('wide-dialog');
        parent.append(node('p',(out.paper==='b5'?'JIS B5':'A4')+'・'+(out.orientation==='landscape'?'横':'縦')+' ／ 余白12mm',{class:'small muted'}));
        const preview=node('div',null,{class:'print-preview-page'});if(out.title)preview.append(node('h3',doc.name));preview.append(node('img',null,{src:url,alt:'印刷するグラフ'}));parent.append(preview);
        parent.append(button('印刷する',()=>window.print(),{class:'primary full-button',id:'print-confirm'}));
        parent.append(node('p','印刷画面では倍率100%・ヘッダーとフッターをオフにすると、この配置で印刷できます。PDFとして保存することもできます。',{class:'small muted'}));
      });
      await Promise.all([...sheet.querySelectorAll('img')].map(img=>img.decode()));
    }finally{exportBusy=false;$('print-preview').disabled=false;if(drawPending)requestDraw();}
  }
  async function exportImage() {
    if(exportBusy)return;saveOutputControls();cancelTangentDraft();await requestDraw();if(exportBusy)return;exportBusy=true;$('export-image').disabled=true;
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
    bindAddMenu('series');bindAddMenu('annotation');
    $('plot').addEventListener('pointerdown',startGesture,{capture:true});
    $('plot').addEventListener('pointermove',moveGesture,{capture:true});
    $('plot').addEventListener('pointerup',finishGesture,{capture:true});
    $('plot').addEventListener('pointercancel',cancelGesture,{capture:true});
    $('plot').addEventListener('lostpointercapture',cancelGesture);
    listen('show-statistics','click',()=>showStatistics(activeSeries()?.id));
    listen('add-function','click',()=>addSeries());listen('add-data','click',()=>addSeries(true));listen('add-parameter','click',()=>editParameter());
    for(const kind of ['implicit','parametric','polar'])listen('add-'+kind,'click',()=>addCurve(kind));
    for(const kind of ['point','segment','intersection','text','guide','region','regression'])listen('add-'+kind,'click',()=>addAnnotation(kind));bindTangentTrigger($('add-tangent'));
    for(const el of document.querySelectorAll('[data-icon]'))el.prepend(GraphIcons.create(el.dataset.icon,document));
    try{tooltip=JohoUI.tooltip();}catch(_){}
    listen('mode-2d','click',()=>switchMode('2d'));listen('mode-3d','click',()=>switchMode('3d'));
    for(const id of ['undo','undo-menu'])listen(id,'click',()=>{closeMenus();undo();});for(const id of ['redo','redo-menu'])listen(id,'click',()=>{closeMenus();undo(true);});
    for(const id of ['axes-button','axes-menu'])listen(id,'click',editAxes);for(const id of ['reset-view','fit-button'])listen(id,'click',()=>{closeMenus();fitView();});
    listen('theme','change',()=>{settings.theme=$('theme').value;applySettings();});listen('text-size','change',()=>{settings.textSize=$('text-size').value;applySettings();});
    listen('templates-tab','click',()=>setSide('templates'));listen('export-tab','click',()=>setSide('export'));for(const el of document.querySelectorAll('[data-close-side]'))el.addEventListener('click',()=>setSide(side));listen('template-search','input',templateList);
    listen('save-browser','click',saveBrowser);listen('save-local','click',saveLocal);listen('open-saved','click',()=>showSaved());listen('open-local','click',()=>{closeMenus();$('file-input').click();});
    listen('start-local-auto','click',startLocalAutosave);listen('stop-local-auto','click',()=>{localAuto.stop();$('stop-local-auto').disabled=true;closeMenus();});
    listen('new-document','click',()=>{closeMenus();loadDocument(C.createDocument());notify('新しいグラフを開きました。元に戻すこともできます。');});
    listen('file-input','change',async()=>{const file=$('file-input').files[0];$('file-input').value='';if(!file)return;if(file.size>2*1024*1024)throw new Error('再編集ファイルは2MB以内にしてください。');loadDocument(C.validateDocument(await file.text()));notify('グラフを読み込みました。');});
    listen('import-csv','click',()=>$('csv-input').click());listen('csv-input','change',async()=>{const file=$('csv-input').files[0];$('csv-input').value='';if(!file)return;if(file.size>1024*1024)throw new Error('CSVは1MB以内にしてください。');const table=GraphTables.parse(await file.text(),current().mode==='3d'?'data3d':'data2d');addSeries(true,undefined,undefined,table);});
    for(const key of Object.keys(current().output))listen('output-'+key,'change',saveOutputControls);
    listen('print-preview','click',printPreview);listen('export-image','click',exportImage);listen('dialog-close','click',closeDialog);listen('dialog-cancel','click',closeDialog);
    $('editor-dialog').addEventListener('cancel',event=>{event.preventDefault();closeDialog();});
    $('dialog-form').addEventListener('submit',event=>{event.preventDefault();$('dialog-error').hidden=true;try{if(dialogApply){dialogApply();closeDialog();}}catch(error){report(error);}});
    for(const menu of document.querySelectorAll('.top details'))menu.addEventListener('toggle',()=>{if(menu.open){closeAddMenu();for(const other of document.querySelectorAll('.top details'))if(other!==menu)other.open=false;}});
    document.addEventListener('pointerdown',event=>{if(!event.target.closest('.top .menu'))closeTopMenus();if(addMenu&&!addMenu.trigger.contains(event.target)&&!addMenu.panel.contains(event.target))closeAddMenu();if(tangentDraft&&!$('tangent-quick-panel').contains(event.target)&&!tangentDraft.opener.contains(event.target))cancelTangentDraft();},true);
    document.addEventListener('focusin',event=>{if(addMenu&&!addMenu.trigger.contains(event.target)&&!addMenu.panel.contains(event.target))closeAddMenu();if(tangentDraft&&!$('tangent-quick-panel').contains(event.target)&&!tangentDraft.opener.contains(event.target))cancelTangentDraft();});
    addEventListener('resize',positionAddMenu);addEventListener('scroll',positionAddMenu,true);window.visualViewport?.addEventListener('resize',positionAddMenu);window.visualViewport?.addEventListener('scroll',positionAddMenu);
    addEventListener('resize',positionQuickTangent);addEventListener('scroll',positionQuickTangent,true);window.visualViewport?.addEventListener('resize',positionQuickTangent);window.visualViewport?.addEventListener('scroll',positionQuickTangent);
    document.addEventListener('keydown',event=>{
      if(event.isComposing||event.keyCode===229)return;if(help?.root?.contains(event.target)||$('operation-help').contains(event.target))return;
      const input=event.target.closest('input,textarea,select,[contenteditable="true"]');if($('editor-dialog').open)return;
      if(event.key==='Escape'&&tangentDraft){cancelTangentDraft(true);event.preventDefault();return;}
      if(event.key==='Escape'&&addMenu){closeAddMenu(true);event.preventDefault();return;}
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='p'){event.preventDefault();run(printPreview);return;}
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='s'){event.preventDefault();run(saveBrowser);return;}if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='o'){event.preventDefault();showSaved();return;}
      if(event.key==='Escape'&&parameterPreview){cancelParameterPreview();event.preventDefault();return;}
      if(event.key==='Escape'&&selectionPanel&&$('selection-toolbar').contains(event.target)){const panel=selectionPanel;selectionPanel=null;updateToolbar();$('selection-toolbar').querySelector('[data-quick-control="toggle-'+panel+'"]')?.focus();event.preventDefault();return;}
      if(input)return;
      if((event.metaKey||event.ctrlKey)&&event.key.toLowerCase()==='z'){event.preventDefault();undo(event.shiftKey);return;}
      if(event.key==='Escape'){const menu=document.querySelector('.top details[open]');if(gesture)cancelGesture();else if(menu){menu.open=false;menu.querySelector('summary').focus();}else if(selectionPanel){const panel=selectionPanel;selectionPanel=null;updateToolbar();$('selection-toolbar').querySelector('[data-quick-control="toggle-'+panel+'"]')?.focus();}else{select(null);setListOpen(false);}event.preventDefault();}
      if(event.key==='Enter'&&!event.metaKey&&!event.ctrlKey&&!event.altKey&&(event.target===$('stage')||event.target.closest('[data-object-id][aria-pressed="true"]'))){const s=activeSeries(),a=activeAnnotation();if(s||a){event.preventDefault();run(()=>s?editSeries(s.id):editAnnotation(a.id));}}
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
