/* illustSlide: 編集画面。作品、表示、選択、保存候補はそれぞれ独立して管理する。 */
(function () {
  'use strict';
  const C = window.IlapoCore, S = window.IlapoSVG, G = window.IlapoGeometry, E = window.IlapoExport, K=window.IlapoConnectors, A=window.IlapoAssets;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    direct:'m5 3 14 11-7 1-3 7zM17 3v5m-2-2h4',save:'M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8',open:'M3 7V4h7l2 3h9v3M3 7v14h17l2-11H7L3 21',select:'m5 3 14 11-7 1-3 7z',undo:'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14',redo:'m16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14',pages:'M7 3h14v16H7zM3 7v16h14',view:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',more:'M4 12h1m6 0h1m6 0h1',board:'M5 1v22M1 5h22M19 1v22M1 19h22',layers:'m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 17l10 5 10-5',fit:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',rect:'M3 5h18v14H3z',roundrect:'M7 4h10q4 0 4 4v8q0 4-4 4H7q-4 0-4-4V8q0-4 4-4',ellipse:'M22 12a10 7 0 1 0-20 0 10 7 0 1 0 20 0',triangle:'m12 3 10 18H2z',pentagon:'m12 2 10 8-4 12H6L2 10z',line:'m3 20 18-16',text:'M3 4h18M12 4v17m-5 0h10',pan:'M8 11V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v10q0 7-7 7-4 0-6-3L2 14q-1-3 2-3l4 4'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.rect}"/></svg>`;
  Object.assign(icons,{diamond:'m12 2 10 10-10 10L2 12z',parallelogram:'M7 5h15l-5 14H2z',arrow:'M2 9h12V3l8 9-8 9v-6H2z',callout:'M2 3h20v14H11l-5 5v-5H2z',connector:'M3 4h8v16h10m-5-5 5 5-5 3'});
  const names = {rect:'長方形',roundrect:'角丸',ellipse:'楕円',triangle:'三角形',pentagon:'五角形',diamond:'菱形',parallelogram:'平行四辺形',arrow:'太い矢印',callout:'吹き出し',line:'線',connector:'接続矢印',text:'文字',direct:'直接選択',select:'全体を選択',pan:'移動'};
  document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon)));
  $('shape-tools').innerHTML = Object.keys(names).filter(k=>!['direct','select','pan'].includes(k)).map(k=>`<button data-tool="${k}" aria-label="${names[k]}を追加" data-tip="${names[k]}を追加">${icon(k)}<span>${names[k]}</span></button>`).join('');
  if (!C || !S || !G || !E || !K || !A || !window.IlapoPathEdit || !window.IlapoPathUI || !window.IlapoConnectorUI || !window.IlapoPresentation || !window.IlapoAnimation || !window.IlapoAnimationPlayer || !window.IlapoAnimationUI || !window.IlapoPlaybackExport) { $('hint').textContent='必要なファイルを読み込めませんでした。ページを再読み込みしてください。'; return; }
  const initial=C.createDocument(); initial.name='無題の作品'; initial.pages[0].board=C.boardPreset('16:9');
  const history=new C.History(initial);
  let pageId=initial.pages[0].id, selected=[], tool='direct', drag=null, preview=null, clipboard=null, copiedStyle=null;
  let camera={x:0,y:0,width:1280,height:720}, saveTimer, saveFingerprint=JSON.stringify(initial), edited=false, store, localAuto, help, space=false, renderPending=false, writeInProgress=false;
  let pathUI,connectionUI,animationUI,library;
  let settings={theme:'auto',size:'standard',grid:true,snap:false,gridStep:20,snapPixel:false,snapAnchor:true,snapPath:true};
  try { Object.assign(settings,JSON.parse(localStorage.getItem('kaijo-ilapo:settings')||'{}')); } catch (_) {}
  if(!['auto','light','dark'].includes(settings.theme))settings.theme='auto';
  if(!['standard','large','xlarge'].includes(settings.size))settings.size='standard';
  if(!Number.isFinite(Number(settings.gridStep))||Number(settings.gridStep)<.01||Number(settings.gridStep)>10000)settings.gridStep=20;
  try { store=new C.Store(localStorage); } catch (_) { store=null; }
  try { library=A.createLibrary(localStorage); } catch (_) { library=null; }
  const doc=()=>history.document;
  const page=()=>doc().pages.find(p=>p.id===pageId)||doc().pages[0];
  const drawPage=()=>preview||page();
  const snapshot=()=>JSON.stringify(doc());
  const dirty=()=>edited&&snapshot()!==saveFingerprint;
  function toast(message) { $('toast').textContent=message; $('toast').hidden=false; clearTimeout(toast.timer); toast.timer=setTimeout(()=>$('toast').hidden=true,6000); }
  function errorMessage(error) {
    console.error(error);const message=error?.message||String(error);
    const detail=/[ぁ-んァ-ヶ一-龯]/.test(message)?message:/Unsupported SVG (element|attribute|style|font|fill-rule|transform)/i.test(message)?'このSVGには、まだ対応していない書式や要素が含まれています。':/Unsafe SVG/i.test(message)?'外部参照や実行可能な要素を含むSVGには対応していません。':/limit|exceed|large|size/i.test(message)?'ファイルまたは作品が扱える大きさの上限を超えています。':'ファイル形式や入力値を確認してください。';
    return '操作を完了できませんでした。作品は保持されています。\n'+detail;
  }
  function applySettings() {
    const dark=settings.theme==='dark'||settings.theme==='auto'&&matchMedia('(prefers-color-scheme: dark)').matches;
    document.documentElement.dataset.theme=dark?'dark':'light';
    document.documentElement.style.setProperty('--ui-size',({standard:14,large:16,xlarge:18}[settings.size]||14)+'px');
    try { localStorage.setItem('kaijo-ilapo:settings',JSON.stringify(settings)); } catch (_) {}
    render(); help?.refresh();
  }
  function zoom() { return $('canvas').clientWidth/camera.width; }
  function fit() {
    const p=page(), b=p.board.infinite&&p.objects.length ? bounds(p.objects.map(o=>o.id),p) : {x:0,y:0,width:p.board.width,height:p.board.height};
    const cw=Math.max(1,$('canvas').clientWidth),ch=Math.max(1,$('canvas').clientHeight);
    const scale=Math.min(cw/(Math.max(b.width,1)*1.28),ch/(Math.max(b.height,1)*1.35));
    camera={x:b.x+b.width/2-cw/scale/2,y:b.y+b.height/2-ch/scale/2,width:cw/scale,height:ch/scale}; render();
  }
  function world(event) { const r=$('canvas').getBoundingClientRect(); return {x:camera.x+(event.clientX-r.left)/r.width*camera.width,y:camera.y+(event.clientY-r.top)/r.height*camera.height}; }
  function snap(p,event) { const interval=Number(settings.gridStep); return settings.snap&&!event?.altKey&&interval>0 ? {x:Math.round(p.x/interval)*interval,y:Math.round(p.y/interval)*interval}:p; }
  function bounds(ids,p=drawPage()) {
    const boxes=p.objects.filter(o=>ids.includes(o.id)).map(o=>G.bounds(o));
    if(!boxes.length) return {x:0,y:0,width:1,height:1};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
  }
  function selection(ids) { const known=[...new Set(ids.filter(id=>page().objects.some(o=>o.id===id)))];selected=[...new Set([...known,...C.expandSelection(page(),known)])]; render(); }
  function allUnlocked() { return !page().objects.some(o=>selected.includes(o.id)&&o.locked); }
  function editable() { if(!selected.length)return false; if(!allUnlocked()){toast('固定された図形を含むため、先に固定を解除してください。');return false;} return true; }
  function change(fn) {
    const before=snapshot();
    try { history.change(d=>{fn(d);d.pages.forEach(p=>K.sync(p));}); pageId=page().id; selected=selected.filter(id=>page().objects.some(o=>o.id===id)); if(before!==snapshot()){edited=true;queueSave();} render(); return before!==snapshot(); }
    catch(error){toast(errorMessage(error));render();return false;}
  }
  const changePage=fn=>change(d=>fn(d.pages.find(p=>p.id===pageId)));
  function queueSave() {
    clearTimeout(saveTimer); $('save-status').textContent='変更あり';
    saveTimer=setTimeout(()=>{
      try { if(!store)throw Error('ブラウザ保存が利用できません');store.save(doc(),'auto'); $('save-status').textContent=dirty()?'自動保存済み · 明示保存後に変更':'自動保存済み'; }
      catch(error){$('save-status').textContent='自動保存に失敗';toast('ブラウザへの自動保存に失敗しました。「保存」からローカルファイルへ保存できます。');}
      localAuto?.schedule(doc());
    },450);
  }
  function saveBrowser() {
    try { if(!store)throw Error('ブラウザ保存を利用できません。ローカル保存を使ってください。');store.save(doc(),'saved');saveFingerprint=snapshot();$('save-status').textContent='ブラウザに明示保存済み';toast('ブラウザに保存しました。自動保存とは別に保持します。');return true; }
    catch(error){toast(errorMessage(error));return false;}
  }
  function render() {
    if(renderPending)return; renderPending=true;requestAnimationFrame(()=>{renderPending=false;renderNow();});
  }
  function renderNow() {
    if(preview)K.sync(preview);
    const p=drawPage(); $('canvas').setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    $('canvas').dataset.tool=tool==='pan'||space?'pan':['select','direct'].includes(tool)?'select':'draw';
    const art=p.board.infinite?{x:camera.x,y:camera.y,width:camera.width,height:camera.height}:{x:0,y:0,width:p.board.width,height:p.board.height};
    for(const [key,value] of Object.entries(art)){$('paper').setAttribute(key,value);$('grid').setAttribute(key,value);}
    const interval=Math.max(.01,Number(settings.gridStep)||20),visibleStep=interval*zoom()<7?interval*Math.ceil(7/(interval*zoom())):interval;
    $('grid-pattern').setAttribute('width',visibleStep);$('grid-pattern').setAttribute('height',visibleStep);$('grid-pattern').firstElementChild.setAttribute('r',.7/zoom());$('grid').style.display=settings.grid?'':'none';
    $('artwork').innerHTML=p.objects.map(o=>`<g data-object="${esc(o.id)}" aria-label="${esc(o.name)}">${o.type==='connector'?`<path d="${K.renderedParts(o)[0].d}" fill="none" stroke="transparent" stroke-width="${16/zoom()}"/>`:''}${S.objectMarkup(o)}</g>`).join('');
    $('welcome').hidden=!!p.objects.length||!!drag; $('selection-bar').hidden=!selected.length||!!drag;
    $('selection-count').textContent=pathUI?.count()?pathUI.count()+'点':selected.length+'個';
    $('whole-mode').hidden=tool!=='direct';$('direct-mode').hidden=tool==='direct';
    $('path-menu-button').hidden=!p.objects.some(o=>selected.includes(o.id)&&o.type==='path'); $('document-title').textContent=doc().name; document.title=doc().name+' — イラストスライド illustSlide';
    $('connection-options').hidden=selected.length!==1||!p.objects.some(o=>o.id===selected[0]&&o.type==='connector');
    $('image-options').hidden=selected.length!==1||!p.objects.some(o=>o.id===selected[0]&&o.type==='image');
    $('page-status').textContent=`${doc().pages.indexOf(page())+1} / ${doc().pages.length} · ${page().name}`;
    $('zoom-value').textContent=(zoom()*100<10?(zoom()*100).toFixed(1):Math.round(zoom()*100))+'%';
    document.querySelectorAll('[data-action=undo]').forEach(b=>b.disabled=!history.canUndo);document.querySelectorAll('[data-action=redo]').forEach(b=>b.disabled=!history.canRedo);
    document.querySelectorAll('[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool===tool)));
    $('hint').textContent=tool==='connector'?connectionUI.hint():!$('connection-options').hidden?'端点・折れ曲がり点をドラッグ · ダブルクリックで点を追加 · Enterで接続・経路':tool==='direct'?pathUI.hint():tool==='select'?(selected.length>1?'整列・サイズの基準は最初に選んだ図形 · Space＋ドラッグで移動':'Shiftで追加選択 · Space＋ドラッグで移動'):tool==='pan'?'ドラッグして表示を移動':`${names[tool]}：クリックで配置 · ドラッグで大きさを指定`;
    renderSelection();
  }
  function renderSelection() {
    const z=zoom(), stroke=1/z;
    if(['marquee','node-marquee'].includes(drag?.kind)){
      const b=drag.box;$('selection').innerHTML=`<rect x="${b.x}" y="${b.y}" width="${b.width}" height="${b.height}" fill="#2563eb15" stroke="#2563eb" stroke-width="${stroke}"/>`;return;
    }
    const connectionMarkup=connectionUI.render(drawPage(),z);if(connectionMarkup!==null){$('selection').innerHTML=connectionMarkup;return;}
    if(!selected.length){$('selection').innerHTML='';return;}
    if(tool==='direct'){const markup=pathUI.render(drawPage(),z);if(markup!==null){$('selection').innerHTML=markup;return;}}
    const b=bounds(selected), x=b.x,y=b.y,w=Math.max(b.width,.1/z),h=Math.max(b.height,.1/z),cx=x+w/2,cy=y+h/2;
    let markup=`<rect x="${x}" y="${y}" width="${w}" height="${h}" fill="none" stroke="#2563eb" stroke-width="${stroke}" stroke-dasharray="${4/z} ${3/z}" pointer-events="none"/>`;
    if(allUnlocked()){
      const handles=[['nw',x,y],['n',cx,y],['ne',x+w,y],['e',x+w,cy],['se',x+w,y+h],['s',cx,y+h],['sw',x,y+h],['w',x,cy],['rotate',cx,y-28/z]];
      markup+=`<path d="M${cx} ${y}v${-28/z}" stroke="#2563eb" stroke-width="${stroke}"/>`;
      markup+=handles.map(([key,hx,hy])=>`<g data-handle="${key}" style="cursor:${key==='rotate'?'crosshair':key+'-resize'}"><circle cx="${hx}" cy="${hy}" r="${(matchMedia('(pointer:coarse)').matches?15:8)/z}" fill="transparent"/><circle cx="${hx}" cy="${hy}" r="${4/z}" fill="white" stroke="#2563eb" stroke-width="${stroke}"/></g>`).join('');
    }
    $('selection').innerHTML=markup;
  }
  function setTool(value){cancelDrag();if(tool!==value){pathUI?.reset();connectionUI?.reset();}tool=value;hideMenu();render();$('canvas').focus();}
  function cancelDrag(){if(drag?.originalSelection)selected=drag.originalSelection;pathUI?.cancel(drag);preview=null;drag=null;render();}
  function standardSize(){return Math.max(.5,Math.min(160,page().board.width*.2,page().board.height*.25));}
  function createShape(kind,start,end,defaultSize=false){
    const size=standardSize(),x=defaultSize?start.x-size/2:Math.min(start.x,end.x),y=defaultSize?start.y-size*.32:Math.min(start.y,end.y),w=defaultSize?size:Math.abs(end.x-start.x),h=defaultSize?size*.65:Math.abs(end.y-start.y);
    const style={fill:kind==='line'?'none':'#93C5FD',stroke:'#1E3A5F',strokeWidth:Math.max(.04,size/90),linecap:'round',linejoin:'round'};
    let o=C.makeShape(kind,x,y,Math.max(w,.001),kind==='line'?h:Math.max(h,.001),style);o.name=names[kind];
    if(kind==='line'&&!defaultSize)o.d=`M${start.x} ${start.y}L${end.x} ${end.y}`;
    return o;
  }
  $('canvas').addEventListener('pointerdown',event=>{
    if(event.button!==0&&event.button!==1)return;if(drag)return;hideMenu();$('canvas').focus();
    const p=world(event),point=snap(p,event),base=C.clone(page()),originalSelection=selected.slice();
    const handle=event.target.closest('[data-handle]')?.dataset.handle,hit=event.target.closest('[data-object]')?.dataset.object;
    if(tool==='pan'||space||event.button===1)drag={kind:'pan',start:p,client:{x:event.clientX,y:event.clientY},camera:{...camera}};
    else if(connectionUI.pointerDown(event,p,base)){}
    else if(handle&&selected.length&&editable())drag={kind:'transform',handle,start:p,box:bounds(selected),base,originalSelection};
    else if(tool==='text'){textDialog(null,point);tool='direct';pathUI.reset();render();return;}
    else if(tool==='direct')pathUI.pointerDown(event,p,base);
    else if(tool!=='select')drag={kind:'draw',start:point,end:point,base,originalSelection};
    else if(hit){
      const expanded=C.expandSelection(page(),[hit]);
      if(event.shiftKey){const remove=expanded.every(id=>selected.includes(id));selection(remove?selected.filter(id=>!expanded.includes(id)):[...new Set([...selected,...expanded])]);}
      else if(!selected.includes(hit))selection(expanded);
      if(selected.includes(hit)&&allUnlocked())drag={kind:'move',start:point,base,originalSelection:selected.slice()};
    }else {if(!event.shiftKey)selected=[];drag={kind:'marquee',start:p,box:{x:p.x,y:p.y,width:0,height:0},originalSelection,add:event.shiftKey};}
    if(drag){event.preventDefault();$('canvas').setPointerCapture(event.pointerId);drag.pointerId=event.pointerId;}render();
  });
  $('canvas').addEventListener('pointermove',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;const p=world(event),sp=snap(p,event);drag.moved=drag.moved||Math.hypot(p.x-drag.start.x,p.y-drag.start.y)*zoom()>3;
    if(connectionUI.pointerMove(event,p,drag)||pathUI.pointerMove(event,p,drag)){render();return;}
    if(drag.kind==='pan'){camera.x=drag.camera.x-(event.clientX-drag.client.x)/zoom();camera.y=drag.camera.y-(event.clientY-drag.client.y)/zoom();}
    if(drag.kind==='draw'){drag.end=sp;preview=C.clone(drag.base);if(drag.moved){try{preview.objects.push(createShape(tool,drag.start,sp));}catch(_){}}}
    if(drag.kind==='move'){preview=C.clone(drag.base);C.transformObjects(preview,selected,[1,0,0,1,sp.x-drag.start.x,sp.y-drag.start.y]);}
    if(drag.kind==='marquee'){drag.box={x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),width:Math.abs(p.x-drag.start.x),height:Math.abs(p.y-drag.start.y)};}
    if(drag.kind==='transform'){
      preview=C.clone(drag.base);const b=drag.box,cx=b.x+b.width/2,cy=b.y+b.height/2;let m;
      if(drag.handle==='rotate'){let angle=Math.atan2(p.y-cy,p.x-cx)-Math.atan2(drag.start.y-cy,drag.start.x-cx);if(event.shiftKey)angle=Math.round(angle/(Math.PI/12))*Math.PI/12;m=around(rotation(angle),cx,cy);}
      else {const key=drag.handle,ax=key.includes('w')?b.x+b.width:key.includes('e')?b.x:cx,ay=key.includes('n')?b.y+b.height:key.includes('s')?b.y:cy;let sx=key==='n'||key==='s'?1:(p.x-ax)/(drag.start.x-ax||1),sy=key==='e'||key==='w'?1:(p.y-ay)/(drag.start.y-ay||1);sx=Math.max(.01,sx);sy=Math.max(.01,sy);if(event.shiftKey){if(key==='n'||key==='s')sx=sy;else sy=sx;}m=around([sx,0,0,sy,0,0],ax,ay);}
      C.transformObjects(preview,selected,m);
    }
    render();
  });
  $('canvas').addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;const action=drag, result=preview;drag=null;preview=null;
    if(connectionUI.finishDrag(action,result)||pathUI.finishDrag(action,result)){render();return;}
    if(action.kind==='draw'){
      const object=createShape(tool,action.start,action.end,!action.moved);changePage(p=>p.objects.push(object));selected=[object.id];tool='direct';pathUI.reset();
    }else if(['move','transform'].includes(action.kind)&&action.moved&&result)changePage(p=>p.objects=result.objects);
    else if(action.kind==='marquee'&&action.moved){const b=action.box;const hits=page().objects.filter(o=>{const a=G.bounds(o);return a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;}).map(o=>o.id);selection(action.add?[...new Set([...action.originalSelection,...hits])]:hits);}
    render();
  });
  $('canvas').addEventListener('pointercancel',cancelDrag);
  $('canvas').addEventListener('dblclick',event=>{if(connectionUI.doubleClick(event,world(event)))return;if(tool==='direct')pathUI.doubleClick(event,world(event));const id=event.target.closest('[data-object]')?.dataset.object;const o=page().objects.find(o=>o.id===id);if(o?.type==='text'&&!o.locked)textDialog(o);});
  function rotation(a){return [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];}
  function around(m,x,y){return C.multiply([1,0,0,1,x,y],C.multiply(m,[1,0,0,1,-x,-y]));}
  function zoomAt(factor,p){const old=zoom(),next=Math.max(.005,Math.min(100,old*factor)),ratio=old/next;const anchor=p||{x:camera.x+camera.width/2,y:camera.y+camera.height/2};camera={x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio,width:camera.width*ratio,height:camera.height*ratio};render();}
  $('canvas').addEventListener('wheel',event=>{event.preventDefault();if(drag)return;if(event.ctrlKey||event.metaKey)zoomAt(Math.exp(-event.deltaY*.01),world(event));else{camera.x+=event.deltaX/zoom();camera.y+=event.deltaY/zoom();render();}},{passive:false});
  new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height){const cy=camera.y+camera.height/2;camera.height=camera.width*r.height/r.width;camera.y=cy-camera.height/2;render();help?.refresh();}}).observe($('stage'));

  let menuOpener;
  function hideMenu(){if($('command-menu').matches(':popover-open'))$('command-menu').hidePopover();if(menuOpener)menuOpener.setAttribute('aria-expanded','false');}
  function menuButton(label,action,disabled=false){return `<button data-action="${action}" ${disabled?'disabled':''}>${label}</button>`;}
  function openMenu(kind,opener){
    const was=$('command-menu').matches(':popover-open')&&menuOpener===opener;hideMenu();if(was)return;menuOpener=opener;
    const selectedNone=!selected.length;
    const menus={
      save:()=>menuButton('ブラウザに保存','save-browser')+menuButton('ローカルファイルに保存…','save-local')+'<hr>'+menuButton(localAuto?.active?'ローカル自動保存を停止':'ローカル自動保存を開始…',localAuto?.active?'auto-stop':'auto-start'),
      open:()=>menuButton('保存した内容を選ぶ…','recovery')+menuButton('ファイルを開く…','open-file')+menuButton('SVGを追加する…','import-svg')+'<hr>'+menuButton('新しい作品…','new'),
      more:()=>'<div class="menu-caption">ツール</div><div class="menu-grid">'+Object.keys(names).map(k=>`<button data-tool="${k}">${icon(k)}${names[k]}</button>`).join('')+'</div><hr>'+menuButton('元に戻す','undo',!history.canUndo)+menuButton('やり直し','redo',!history.canRedo)+menuButton('すべて選択','select-all')+menuButton('貼り付け','paste',!clipboard)+'<hr>'+menuButton('ページ…','pages')+menuButton('用紙サイズ…','artboard')+menuButton('図形の一覧…','objects')+menuButton('表示設定…','view-dialog'),
      view:()=>menuButton('全体を表示','fit')+menuButton('100%で表示','zoom-reset')+menuButton('用紙サイズ…','artboard')+menuButton('図形の一覧…','objects')+menuButton('表示設定…','view-dialog'),
      insert:()=>menuButton('アイコン・自作部品…','assets')+menuButton('下絵・画像を追加…','import-image')+menuButton('接続矢印を描く','connection-tool')+menuButton('選択した2図形を接続','connection-between',selected.length!==2),
      path:()=>pathUI.menu(menuButton),
      edit:()=>menuButton('文字を編集…','text-edit',selected.length!==1||page().objects.find(o=>o.id===selected[0])?.type!=='text')+menuButton('コピー','copy',selectedNone)+menuButton('貼り付け','paste',!clipboard)+menuButton('複製','duplicate',selectedNone)+menuButton('削除','delete',selectedNone)+'<hr>'+menuButton('グループ化','group',selected.length<2)+menuButton('グループ解除','ungroup',selectedNone)+menuButton('固定／固定解除','lock',selectedNone)+'<hr>'+menuButton('書式をコピー','style-copy',selectedNone)+menuButton('書式を適用','style-paste',selectedNone||!copiedStyle),
      arrange:()=>['left:左にそろえる','center:左右中央にそろえる','right:右にそろえる','top:上にそろえる','middle:上下中央にそろえる','bottom:下にそろえる','distribute-x:左右に等間隔','distribute-y:上下に等間隔','width:幅をそろえる','height:高さをそろえる','size:幅と高さをそろえる'].map(s=>{const [key,label]=s.split(':');return menuButton(label,'align-'+key,selected.length<2);}).join(''),
      order:()=>menuButton('最前面へ','order-front')+menuButton('1つ前へ','order-forward')+menuButton('1つ後ろへ','order-backward')+menuButton('最背面へ','order-back')
    };
    if(kind==='more'){const old=menus.more;menus.more=()=>old()+'<hr>'+menuButton('アイコン・自作部品…','assets')+menuButton('下絵・画像を追加…','import-image')+menuButton('動きと再生順序…','animations')+menuButton('先頭から発表','present-start')+menuButton('このページから発表','present-current')+menuButton('再生用HTMLを保存','export-playback');}
    if(kind==='edit'){const old=menus.edit;menus.edit=()=>old()+'<hr>'+menuButton('選択した2図形を接続','connection-between',selected.length!==2)+menuButton('自作部品に登録…','component-save',selectedNone)+menuButton('接続矢印を通常のパスに変換','connection-convert',selected.length!==1||page().objects.find(o=>o.id===selected[0])?.type!=='connector');}
    $('command-menu').innerHTML=(menus[kind]||menus.more)();$('command-menu').showPopover();opener.setAttribute('aria-expanded','true');
    const r=opener.getBoundingClientRect(),m=$('command-menu').getBoundingClientRect();$('command-menu').style.left=Math.max(8,Math.min(r.left,innerWidth-m.width-8))+'px';$('command-menu').style.top=Math.max(8,Math.min(r.bottom+5,innerHeight-m.height-8))+'px';$('command-menu').querySelector('button:not(:disabled)')?.focus();
  }
  $('command-menu').addEventListener('toggle',event=>{if(event.newState==='closed'&&menuOpener)menuOpener.setAttribute('aria-expanded','false');});
  $('command-menu').addEventListener('keydown',event=>{if(event.key==='Escape'){event.preventDefault();event.stopPropagation();hideMenu();menuOpener?.focus();}});
  let dialogOpener,dialogCallback;
  function closeDialog(){if($('dialog').open)$('dialog').close();if(dialogOpener?.isConnected)dialogOpener.focus();else $('canvas').focus();}
  function showDialog(title,html,label,callback){const focused=document.activeElement,opener=$('dialog').contains(focused)?dialogOpener:$('command-menu').contains(focused)?menuOpener:focused;hideMenu();if($('dialog').open)$('dialog').close();dialogOpener=opener;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog-error').hidden=true;$('dialog-submit').textContent=label||'適用';$('dialog-submit').hidden=!label;dialogCallback=callback;$('dialog').showModal();}
  $('dialog-close').onclick=$('dialog-cancel').onclick=closeDialog;
  $('dialog').addEventListener('cancel',()=>{setTimeout(()=>dialogOpener?.focus(),0);});
  $('dialog-form').onsubmit=async event=>{event.preventDefault();if(!dialogCallback){closeDialog();return;}const cb=dialogCallback;try{const result=cb();if(result?.then)await result;if(dialogCallback===cb)closeDialog();}catch(error){$('dialog-error').textContent=error.message;$('dialog-error').hidden=false;}};
  function renameDialog(){showDialog('作品名',`<label>名前<input id="name-input" value="${esc(doc().name)}" maxlength="120" required></label>`,'変更',()=>{const name=$('name-input').value.trim();if(!name)throw Error('名前を入力してください。');change(d=>d.name=name);});}
  function checkReplace(next){
    if(!dirty()){next();return;}
    showDialog('作業中の変更を保存', '<p>今の作品には明示保存していない変更があります。</p><div class="list-actions"><button type="button" id="replace-save" class="primary">保存して開く</button><button type="button" id="replace-discard">保存せず開く</button></div>',null);
    $('replace-save').onclick=()=>{if(saveBrowser()){closeDialog();next();}};$('replace-discard').onclick=()=>{closeDialog();next();};
  }
  function replaceDocument(value){pathUI.reset();connectionUI.reset();const checked=C.validateDocument(value);checked.pages.forEach(p=>K.sync(p));history.replace(checked);pageId=doc().pages[0].id;selected=[];edited=false;saveFingerprint=snapshot();clearTimeout(saveTimer);clearTimeout(toast.timer);$('toast').hidden=true;localAuto?.stop();$('save-status').textContent='読み込みました';fit();}
  function recoveryDialog(){
    const entries=store?.list()||[];
    showDialog('保存した内容を選ぶ',entries.length?'<p>開かなかった保存内容も保持されます。</p>'+entries.map((e,i)=>`<button type="button" class="recovery" data-recovery="${i}"><strong>${esc(e.document.name)}</strong> — ${e.kind==='auto'?'自動保存':'明示保存'}<small>ブラウザ内 · ${esc(new Date(e.at).toLocaleString('ja-JP'))} · ${e.document.pages.length}ページ</small></button>`).join(''):'<p>ブラウザ内に保存候補がありません。ローカルの作品は「ファイルを開く」から選べます。</p>',null);
    $('dialog-body').querySelectorAll('[data-recovery]').forEach(b=>b.onclick=()=>{const value=entries[Number(b.dataset.recovery)].document;closeDialog();checkReplace(()=>replaceDocument(value));});
  }
  function fileName(name,suffix){return (name.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,100)||'作品')+suffix;}
  function download(data,name,type){const url=URL.createObjectURL(new Blob([data],{type})),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),10000);}
  async function saveLocal(){
    const frozen=C.clone(doc()),fingerprint=JSON.stringify(frozen);writeInProgress=true;
    try{
      if(window.showSaveFilePicker){const handle=await showSaveFilePicker({suggestedName:fileName(frozen.name,'.illustslide.zip'),types:[{description:'イラストスライドの作品',accept:{'application/zip':['.zip']}}]});await localAuto?.protect(handle);const bytes=await S.encodeProject(frozen);const writer=await handle.createWritable();try{await writer.write(bytes);await writer.close();}catch(error){await writer.abort().catch(()=>{});throw error;}await localAuto?.rememberExplicit(handle);}
      else download(await S.encodeProject(frozen),fileName(frozen.name,'.illustslide.zip'),'application/zip');
      saveFingerprint=fingerprint;$('save-status').textContent='ローカルに明示保存済み';toast('編集用ファイルを保存しました。');
    }catch(error){if(error.name!=='AbortError')toast(errorMessage(error));}finally{writeInProgress=false;}
  }
  $('file-input').onchange=async()=>{
    const file=$('file-input').files[0];$('file-input').value='';if(!file)return;
    try{
      if(file.size>20*1024*1024)throw Error('読み込めるファイルは20MBまでです。');
      if(/\.svg$/i.test(file.name)){
        const result=S.importSVG(await file.text());result.page.name=file.name.replace(/\.svg$/i,'');
        result.page.id=C.uid('page');const groupIds=new Map();result.page.objects.forEach(o=>{o.id=C.uid('object');if(o.group){if(!groupIds.has(o.group))groupIds.set(o.group,C.uid('group'));o.group=groupIds.get(o.group);}});
        const insert=()=>{if(change(d=>d.pages.push(result.page))){pageId=result.page.id;selected=[];fit();}};
        if(result.warnings?.length){showDialog('SVGの読み込み確認',`<p>${esc(result.warnings.join('\n'))}</p>`,'追加',insert);}else insert();
      }else{const value=/\.json$/i.test(file.name)?C.validateDocument(JSON.parse(await file.text())):await S.decodeProject(new Uint8Array(await file.arrayBuffer()));checkReplace(()=>replaceDocument(value));}
    }catch(error){toast(errorMessage(error));}
  };
  // 次のブロックに選択時の編集フォームとコマンドをまとめる。
  const unitScale=unit=>unit==='mm'?96/25.4:unit==='pt'?96/72:1;
  const round=value=>Math.round(value*10000)/10000;
  const presetLabels={'18':'18 × 18 px','36':'36 × 36 px','72':'72 × 72 px',businessCard:'名刺（55 × 91 mm）',b5:'JIS B5（182 × 257 mm）',a4:'A4（210 × 297 mm）','16:9':'16:9（1280 × 720 px）',free:'自由キャンバス'};
  function boardDialog(){
    const b=page().board;let unit=b.unit;
    showDialog('用紙サイズ',`<label>サイズ<select id="board-preset"><option value="custom">任意のサイズ</option>${Object.entries(presetLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><div class="fields"><label>幅<input id="board-width" type="number" min="0.01" step="any" required value="${round(b.width/unitScale(unit))}"></label><label>高さ<input id="board-height" type="number" min="0.01" step="any" required value="${round(b.height/unitScale(unit))}"></label></div><div class="fields"><label>単位<select id="board-unit">${['px','mm','pt'].map(u=>`<option ${u===unit?'selected':''}>${u}</option>`).join('')}</select></label><label>向き<button type="button" id="board-swap">タテ・ヨコを入れ替え</button></label></div><label class="check"><input id="board-infinite" type="checkbox" ${b.infinite?'checked':''}>自由に広がるキャンバス</label><p class="muted">用紙の変更で作品は拡大縮小されません。自由キャンバスの書き出し範囲は作品全体です。</p>`,'変更',()=>{
      const width=Number($('board-width').value)*unitScale(unit),height=Number($('board-height').value)*unitScale(unit);
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>1e6||height>1e6)throw Error('幅と高さは0より大きく、1,000,000px以下にしてください。');
      changePage(p=>p.board={width,height,unit,infinite:$('board-infinite').checked});if(Math.min(width,height)<=72){settings.gridStep=1;applySettings();}fit();
    });
    $('board-preset').onchange=()=>{const key=$('board-preset').value;if(key==='custom')return;const p=C.boardPreset(key);unit=p.unit;$('board-unit').value=unit;$('board-width').value=round(p.width/unitScale(unit));$('board-height').value=round(p.height/unitScale(unit));$('board-infinite').checked=p.infinite;};
    $('board-unit').onchange=()=>{const next=$('board-unit').value;for(const k of ['board-width','board-height'])$(k).value=round(Number($(k).value)*unitScale(unit)/unitScale(next));unit=next;};
    $('board-swap').onclick=()=>{const w=$('board-width').value;$('board-width').value=$('board-height').value;$('board-height').value=w;};
  }
  function pagesDialog(){
    showDialog('ページ', '<div id="page-rows"></div><div class="list-actions"><button type="button" data-page-command="add">＋ ページを追加</button><button type="button" data-page-command="duplicate">このページを複製</button><button type="button" data-page-command="rename">名前を変更</button><button type="button" data-page-command="delete" class="danger">削除</button></div>',null);
    function rows(){
      $('page-rows').innerHTML=doc().pages.map((p,i)=>`<div class="list-row ${p.id===pageId?'selected':''}"><img class="thumb" alt="" src="data:image/svg+xml,${encodeURIComponent(S.exportPage(p))}"><button class="row-title" type="button" data-page-pick="${i}">${i+1}. ${esc(p.name)}</button><button type="button" data-page-move="${i},-1" aria-label="${esc(p.name)}を前へ" ${i===0?'disabled':''}>↑</button><button type="button" data-page-move="${i},1" aria-label="${esc(p.name)}を後ろへ" ${i===doc().pages.length-1?'disabled':''}>↓</button></div>`).join('');
      $('dialog-body').querySelector('[data-page-command=delete]').disabled=doc().pages.length===1;
      $('page-rows').querySelectorAll('[data-page-pick]').forEach(b=>b.onclick=()=>{pageId=doc().pages[Number(b.dataset.pagePick)].id;selected=[];closeDialog();fit();});
      $('page-rows').querySelectorAll('[data-page-move]').forEach(b=>b.onclick=()=>{const [i,delta]=b.dataset.pageMove.split(',').map(Number),id=doc().pages[i].id;change(d=>C.movePage(d,id,delta));rows();$('page-rows').querySelector(`[data-page-move="${i+delta},${delta}"]`)?.focus();});
    }
    rows();$('dialog-body').querySelectorAll('[data-page-command]').forEach(b=>b.onclick=()=>{
      const command=b.dataset.pageCommand;
      if(command==='add'){const next=C.createPage('ページ '+(doc().pages.length+1),page().board);if(change(d=>d.pages.push(next))){pageId=next.id;selected=[];closeDialog();fit();}}
      if(command==='duplicate'){let next;if(change(d=>next=C.duplicatePage(d,pageId))){pageId=next;selected=[];rows();fit();}}
      if(command==='rename'){showDialog('ページ名',`<label>名前<input id="page-name" maxlength="120" required value="${esc(page().name)}"></label>`,'変更',()=>{changePage(p=>p.name=$('page-name').value.trim()||'ページ');});}
      if(command==='delete'&&doc().pages.length>1){const id=pageId;showDialog('ページを削除',`<p>「${esc(page().name)}」と、そのページの図形を削除します。元に戻す操作で取り消せます。</p>`,'削除',()=>{change(d=>C.removePage(d,id));pageId=doc().pages[0].id;selected=[];fit();});}
    });
  }
  function objectsDialog(){
    showDialog('図形の一覧',page().objects.length?'<p class="muted">上ほど前面にある図形です。選ぶと編集ポップアップを開けます。</p>'+page().objects.slice().reverse().map(o=>`<button type="button" class="recovery" data-pick-object="${esc(o.id)}">${esc(o.name||'図形')}${o.locked?' · 固定':''}${o.group?' · グループ':''}</button>`).join(''):'<p>図形はまだありません。</p>',null);
    $('dialog-body').querySelectorAll('[data-pick-object]').forEach(b=>b.onclick=()=>{const id=b.dataset.pickObject;closeDialog();selection([id]);});
  }
  function transformDialog(){
    if(!editable())return;const b=bounds(selected);
    showDialog('選択した図形を変形',`<div class="fields"><label>左の位置（px）<input id="transform-x" type="number" step="any" value="${round(b.x)}" required></label><label>上の位置（px）<input id="transform-y" type="number" step="any" value="${round(b.y)}" required></label><label>幅（px）<input id="transform-width" type="number" min="0" step="any" value="${round(b.width)}" required></label><label>高さ（px）<input id="transform-height" type="number" min="0" step="any" value="${round(b.height)}" required></label></div><label>現在の向きから回転（°）<input id="transform-angle" type="number" step="any" value="0" required></label><label class="check"><input id="transform-ratio" type="checkbox">縦横比を保つ</label><div class="row"><label class="check"><input id="flip-x" type="checkbox">左右反転</label><label class="check"><input id="flip-y" type="checkbox">上下反転</label></div><label class="check"><input id="scale-stroke" type="checkbox">線幅も拡大縮小する</label>`,'適用',()=>{
      const [x,y,w,h,a]=['x','y','width','height','angle'].map(k=>Number($('transform-'+k).value));if([x,y,w,h,a].some(v=>!Number.isFinite(v))||w<0||h<0||(b.width>0&&w===0)||(b.height>0&&h===0))throw Error('位置と大きさを確認してください。');
      const sx=b.width?w/b.width:1,sy=b.height?h/b.height:1;let m=C.multiply([sx,0,0,sy,x,y],[1,0,0,1,-b.x,-b.y]);
      const flip=[$('flip-x').checked?-1:1,0,0,$('flip-y').checked?-1:1,0,0];m=C.multiply(around(C.multiply(rotation(a*Math.PI/180),flip),x+w/2,y+h/2),m);
      changePage(p=>{C.transformObjects(p,selected,m);if($('scale-stroke').checked)p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.style.strokeWidth*=Math.sqrt(Math.abs(sx*sy)));});
    });
    for(const axis of ['width','height'])$('transform-'+axis).oninput=()=>{if(!$('transform-ratio').checked||!b.width||!b.height)return;const target=axis==='width'?'height':'width';$('transform-'+target).value=round(Number($('transform-'+axis).value)*b[target]/b[axis]);};
  }
  function textDialog(existing,point){
    const size=Math.max(.2,standardSize()*.16),o=existing?C.clone(existing):C.makeText(point.x,point.y,'',{fill:'#172B4D',stroke:'none',fontSize:size});
    let chars=o.runs.flatMap(run=>run.text.split('').map(text=>({text,script:run.script}))),previous=chars.map(c=>c.text).join('');
    showDialog(existing?'文字を編集':'文字を追加',`<p class="muted">一部分を選択して、上付き・下付きを指定できます。</p><div class="text-tools"><button type="button" data-script="normal">通常</button><button type="button" data-script="super">上付き x²</button><button type="button" data-script="sub">下付き x₂</button></div><label>文章<textarea id="text-input" maxlength="10000" spellcheck="false">${esc(previous)}</textarea></label><div id="text-preview" aria-label="文字のプレビュー"></div>`,existing?'変更':'追加',()=>{
      if(!chars.length)throw Error('文章を入力してください。');const runs=[];chars.forEach(c=>{const last=runs[runs.length-1];if(last&&last.script===c.script)last.text+=c.text;else runs.push({...c});});o.runs=runs;
      if(existing)changePage(p=>p.objects[p.objects.findIndex(v=>v.id===o.id)]=o);else {changePage(p=>p.objects.push(o));selected=[o.id];}render();
    });
    function previewText(){let html='',last='';chars.forEach(c=>{if(c.script!==last){if(last)html+='</span>';html+=`<span style="${c.script==='super'?'vertical-align:super;font-size:.7em':c.script==='sub'?'vertical-align:sub;font-size:.7em':''}">`;last=c.script;}html+=esc(c.text);});$('text-preview').innerHTML=html+(last?'</span>':'');}
    $('text-input').oninput=()=>{const next=$('text-input').value;let prefix=0,suffix=0;while(prefix<Math.min(previous.length,next.length)&&previous[prefix]===next[prefix])prefix++;while(suffix<Math.min(previous.length-prefix,next.length-prefix)&&previous[previous.length-1-suffix]===next[next.length-1-suffix])suffix++;const inherited=chars[Math.max(0,prefix-1)]?.script||'normal';chars=[...chars.slice(0,prefix),...next.slice(prefix,next.length-suffix).split('').map(text=>({text,script:inherited})),...chars.slice(previous.length-suffix)];previous=next;previewText();};
    $('dialog-body').querySelectorAll('[data-script]').forEach(b=>{b.onmousedown=e=>e.preventDefault();b.onclick=()=>{const input=$('text-input'),start=input.selectionStart,end=input.selectionEnd;if(start===end){toast('上付き・下付きにする文字を範囲選択してください。');return;}for(let i=start;i<end;i++)chars[i].script=b.dataset.script;previewText();input.focus();input.setSelectionRange(start,end);};});previewText();$('text-input').focus();
  }
  const palette=['#FFFFFF','#E2E8F0','#94A3B8','#475569','#172B4D','#000000','#FCA5A5','#EF4444','#F59E0B','#FDE047','#BEF264','#22C55E','#5EEAD4','#06B6D4','#93C5FD','#2563EB','#A78BFA','#EC4899'];
  function styleDialog(){
    if(selected.length===1&&page().objects.find(o=>o.id===selected[0])?.type==='image'){imageDialog();return;}
    if(!editable())return;const objects=page().objects.filter(o=>selected.includes(o.id)),first=objects[0].style,patch={};let channel=objects.every(o=>o.type==='connector')?'stroke':'fill';
    showDialog('書式・色',`<div class="color-tabs"><button type="button" data-color-channel="fill" class="on">塗り・文字</button><button type="button" data-color-channel="stroke">線</button></div><p id="mixed-color" class="muted"></p><div class="swatches">${palette.map(v=>`<button type="button" data-color="${v}" style="--swatch:${v}" aria-label="色 ${v}"></button>`).join('')}</div><div class="row"><button type="button" id="color-none">色なし</button><input id="color-picker" type="color" aria-label="自由な色を選択" style="flex:1"><input id="color-hex" aria-label="色の16進数" maxlength="7" style="flex:1"></div><div class="fields three">${['R','G','B'].map(k=>`<label>${k}<input id="color-${k}" type="number" min="0" max="255" step="1"></label>`).join('')}</div><div class="fields"><label>線幅（px）<input data-style="strokeWidth" type="number" min="0" step="any" value="${first.strokeWidth}"></label><label>不透明度（%）<input data-style="opacity" type="number" min="0" max="100" step="1" value="${first.opacity*100}"></label><label>線の種類<select data-style="dash"><option value="">実線</option><option value="6 4">破線</option><option value="1 3">点線</option><option value="10 3 2 3">一点鎖線</option></select></label><label>線の端<select data-style="linecap"><option value="butt">平ら</option><option value="round">丸い</option><option value="square">四角い</option></select></label><label>線の角<select data-style="linejoin"><option value="miter">角</option><option value="round">丸い</option><option value="bevel">面取り</option></select></label><label>文字サイズ（px）<input data-style="fontSize" type="number" min="0.01" step="any" value="${first.fontSize}"></label><label>書体<select data-style="fontFamily"><option value="sans-serif">ゴシック</option><option value="serif">明朝</option><option value="monospace">等幅</option></select></label></div><div class="row"><label class="check"><input data-style="bold" type="checkbox" ${first.bold?'checked':''}>太字</label><label class="check"><input data-style="italic" type="checkbox" ${first.italic?'checked':''}>斜体</label></div><p class="muted">変更した項目だけを選択中の図形へ適用します。</p>`,'適用',()=>{
      if($('color-hex').value!=='none'&&!/^#[0-9a-f]{6}$/i.test($('color-hex').value))throw Error('色は # と6桁の16進数で入力してください。');
      changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>Object.assign(o.style,patch)));
    });
    function updateColor(){const color=patch[channel]??first[channel],value=color==='none'?'#000000':color;$('color-picker').value=value;$('color-hex').value=color;['R','G','B'].forEach((k,i)=>$('color-'+k).value=parseInt(value.slice(1+i*2,3+i*2),16));$('mixed-color').textContent=!(channel in patch)&&objects.some(o=>o.style[channel]!==first[channel])?'複数の色が混在しています。色を選ぶとそろえます。':color==='none'?'色なし':color;document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color.toUpperCase())));}
    $('dialog-body').querySelectorAll('[data-color-channel]').forEach(b=>b.onclick=()=>{channel=b.dataset.colorChannel;$('dialog-body').querySelectorAll('[data-color-channel]').forEach(v=>v.classList.toggle('on',v===b));updateColor();});
    $('dialog-body').querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{patch[channel]=b.dataset.color;updateColor();});
    $('color-none').onclick=()=>{patch[channel]='none';updateColor();};$('color-picker').oninput=()=>{patch[channel]=$('color-picker').value.toUpperCase();updateColor();};$('color-hex').oninput=()=>{if(/^#[0-9a-f]{6}$/i.test($('color-hex').value)){patch[channel]=$('color-hex').value.toUpperCase();updateColor();}};
    ['R','G','B'].forEach(k=>$('color-'+k).oninput=()=>{const rgb=['R','G','B'].map(c=>Number($('color-'+c).value));if(rgb.every((v,i)=>$('color-'+['R','G','B'][i]).value!==''&&Number.isInteger(v)&&v>=0&&v<=255)){patch[channel]='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();updateColor();}});
    $('dialog-body').querySelectorAll('[data-style]').forEach(el=>{if(el.tagName==='SELECT')el.value=first[el.dataset.style];el.onchange=()=>{const key=el.dataset.style;patch[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)/(key==='opacity'?100:1):el.value;};});$('dialog-body').querySelectorAll('[data-color-channel]').forEach(b=>b.classList.toggle('on',b.dataset.colorChannel===channel));updateColor();
  }
  function viewDialog(){showDialog('表示設定',`<label>テーマ<select id="view-theme"><option value="auto">自動</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label><label>操作部の文字サイズ<select id="view-size"><option value="standard">標準</option><option value="large">大</option><option value="xlarge">特大</option></select></label><label class="check"><input id="view-grid" type="checkbox" ${settings.grid?'checked':''}>グリッドを表示</label><label class="check"><input id="view-snap" type="checkbox" ${settings.snap?'checked':''}>移動・配置をグリッドに吸着</label><label class="check"><input id="view-pixel" type="checkbox" ${settings.snapPixel?'checked':''}>アンカーをピクセルに吸着</label><label class="check"><input id="view-anchor" type="checkbox" ${settings.snapAnchor?'checked':''}>他のアンカーに吸着</label><label class="check"><input id="view-path" type="checkbox" ${settings.snapPath?'checked':''}>他のパスの上に吸着</label><label>グリッドの間隔（px）<input id="view-step" type="number" min="0.01" max="10000" step="any" required value="${Number(settings.gridStep)||20}"></label><p class="muted">Optionを押している間は吸着を解除します。アンカー・パスを優先し、グリッドとピクセルが両方オンのときはグリッドを使います。パスへの吸着は位置合わせで、その後の移動には追従しません。テーマを変えても作品の色は変わりません。</p>`,'適用',()=>{settings={...settings,theme:$('view-theme').value,size:$('view-size').value,grid:$('view-grid').checked,snap:$('view-snap').checked,snapPixel:$('view-pixel').checked,snapAnchor:$('view-anchor').checked,snapPath:$('view-path').checked,gridStep:Number($('view-step').value)};applySettings();});$('view-theme').value=settings.theme;$('view-size').value=settings.size;}
  function selectionUnits(){const units=[],seen=new Set();for(const id of selected){const object=page().objects.find(o=>o.id===id);if(!object)continue;const key=object.group||id;if(seen.has(key))continue;seen.add(key);const ids=object.group?page().objects.filter(o=>o.group===key).map(o=>o.id):[id];units.push({ids,b:bounds(ids)});}return units;}
  function align(mode){
    if(!editable())return;let units=selectionUnits();if(units.length<2){toast('2つ以上の図形またはグループを選んでください。');return;}const reference=units[0].b,transforms=[];
    if(mode.startsWith('distribute')){if(units.length<3){toast('等間隔に並べるには3つ以上選んでください。');return;}const axis=mode.endsWith('x')?'x':'y',size=axis==='x'?'width':'height';units.sort((a,b)=>a.b[axis]-b.b[axis]);const end=units.at(-1).b[axis]+units.at(-1).b[size],gap=(end-units[0].b[axis]-units.reduce((sum,u)=>sum+u.b[size],0))/(units.length-1);let cursor=units[0].b[axis];for(const u of units){const delta=cursor-u.b[axis];transforms.push([u.ids,[1,0,0,1,axis==='x'?delta:0,axis==='y'?delta:0]]);cursor+=u.b[size]+gap;}}
    else for(const u of units.slice(1)){const b=u.b;let dx=0,dy=0,m;if(['width','height','size'].includes(mode)){const sx=mode==='height'?1:b.width?reference.width/b.width:1,sy=mode==='width'?1:b.height?reference.height/b.height:1;m=around([sx,0,0,sy,0,0],b.x+b.width/2,b.y+b.height/2);}else{if(mode==='left')dx=reference.x-b.x;if(mode==='center')dx=reference.x+reference.width/2-b.x-b.width/2;if(mode==='right')dx=reference.x+reference.width-b.x-b.width;if(mode==='top')dy=reference.y-b.y;if(mode==='middle')dy=reference.y+reference.height/2-b.y-b.height/2;if(mode==='bottom')dy=reference.y+reference.height-b.y-b.height;m=[1,0,0,1,dx,dy];}transforms.push([u.ids,m]);}
    changePage(p=>transforms.forEach(([ids,m])=>C.transformObjects(p,ids,m)));
  }
  function copy(){if(!selected.length)return;clipboard={objects:C.clone(page().objects.filter(o=>selected.includes(o.id))),animations:C.clone((page().animations||[]).filter(a=>a.targets.some(id=>selected.includes(id))).map(a=>({...a,targets:a.targets.filter(id=>selected.includes(id))}))),count:0};toast('図形と動きをコピーしました。別のページにも貼り付けられます。');}
  function paste(){if(!clipboard)return;const temp=C.createPage('コピー',page().board);temp.objects=C.clone(clipboard.objects);temp.animations=C.clone(clipboard.animations||[]);const offset=++clipboard.count*standardSize()*.12,ids=C.duplicateObjects(temp,temp.objects.map(o=>o.id),offset,offset);const copies=temp.objects.filter(o=>ids.includes(o.id)),animations=temp.animations.filter(a=>a.targets.every(id=>ids.includes(id)));copies.forEach(o=>o.locked=false);if(changePage(p=>{p.objects.push(...copies);if(animations.length){p.animations||=[];p.animations.push(...animations);}}))selected=ids;render();}
  function exportOptions(){
    const selectionIds=$('export-range').value==='selection'?selected.slice():null,padding=Number($('export-padding').value);
    if(selectionIds&&!selectionIds.length)throw Error('書き出す図形を選択してください。');
    if(!Number.isFinite(padding)||padding<0||padding>1000)throw Error('余白は0〜1000pxで指定してください。');
    return {selectionIds,padding};
  }
  let exportBusy=false;
  async function exportBitmap(){
    if(exportBusy)return;
    const options=exportOptions(),frozen=C.clone(page()),name=fileName(doc().name+'_'+frozen.name,'.png');
    options.scale=Number($('export-scale').value);options.background=$('export-background').value;
    exportBusy=true;document.querySelector('[data-action=export-png]').disabled=true;
    try{const blob=await E.png(frozen,options);download(blob,name,'image/png');toast('PNGを書き出しました。');}
    finally{exportBusy=false;document.querySelector('[data-action=export-png]').disabled=false;}
  }
  function insertionPoint(size=standardSize()){return {x:camera.x+camera.width/2-size/2,y:camera.y+camera.height/2-size/2,size};}
  function insertObjects(objects){if(changePage(p=>p.objects.push(...objects))){selected=objects.map(o=>o.id);setTool('select');}}
  function assetsDialog(){
    let components=[],libraryError='';try{components=library?.list()||[];}catch(error){libraryError=error.message;}
    function thumb(objects){const p=C.createPage('部品',C.boardPreset('free'));p.objects=objects;return 'data:image/svg+xml,'+encodeURIComponent(S.exportPage(p,{padding:8}));}
    showDialog('アイコン・自作部品',`<p class="muted">配置後もパスや色を編集できます。自作部品は図形を選び「編集」から登録します。</p><div class="asset-grid">${A.icons().map(d=>`<button type="button" data-insert-icon="${esc(d.id)}"><img alt="" src="${thumb(A.instantiateIcon(d.id,{size:100}))}"><span>${esc(d.name)}</span></button>`).join('')}</div><h3>自作部品</h3>${libraryError?'<p class="muted">'+esc(libraryError)+'</p>':!components.length?'<p class="muted">登録した部品はここに表示されます。</p>':''}<div class="asset-grid">${components.map(d=>`<div class="asset-card"><button type="button" data-insert-component="${esc(d.id)}"><img alt="" src="${thumb(library.instantiate(d.id,{size:100}))}"><span>${esc(d.name)}</span></button><button type="button" data-remove-component="${esc(d.id)}" aria-label="${esc(d.name)}を部品集から削除">削除</button></div>`).join('')}</div><div class="list-actions"><button type="button" id="components-export" ${!components.length?'disabled':''}>部品集を保存</button><button type="button" id="components-import" ${!library||libraryError?'disabled':''}>部品集を追加…</button></div>`,null);
    $('dialog-body').querySelectorAll('[data-insert-icon]').forEach(b=>b.onclick=()=>{closeDialog();insertObjects(A.instantiateIcon(b.dataset.insertIcon,insertionPoint()));});
    $('dialog-body').querySelectorAll('[data-insert-component]').forEach(b=>b.onclick=()=>{try{const objects=library.instantiate(b.dataset.insertComponent,insertionPoint());closeDialog();insertObjects(objects);}catch(error){toast(errorMessage(error));}});
    $('dialog-body').querySelectorAll('[data-remove-component]').forEach(b=>b.onclick=()=>{const id=b.dataset.removeComponent,name=components.find(c=>c.id===id).name;showDialog('部品集から削除',`<p>「${esc(name)}」を部品集から削除します。作品に配置済みの図形は残ります。</p>`,'削除',()=>{library.remove(id);toast('部品集から削除しました。');});});
    $('components-export').onclick=()=>download(library.exportJSON(),'illustSlide部品集.json','application/json');
    $('components-import').onclick=()=>$('components-input').click();
  }
  function saveComponent(){if(!selected.length)return;if(!library){toast('このブラウザでは部品集を保存できません。');return;}const objects=C.clone(page().objects.filter(o=>selected.includes(o.id)));showDialog('自作部品に登録','<label>部品名<input id="component-name" maxlength="120" required placeholder="例：データを送るPC"></label><p class="muted">今の形・書式・部品内の接続を登録します。配置後の変更は部品集へ自動反映しません。</p>','登録',()=>{library.save($('component-name').value,objects);toast('自作部品に登録しました。');});}
  $('components-input').onchange=async()=>{
    const file=$('components-input').files[0];$('components-input').value='';if(!file)return;
    try{if(file.size>3*1024*1024)throw Error('部品集は3MiBまでです。');let raw=null;const temporary=A.createLibrary({getItem:()=>raw,setItem:(key,value)=>raw=value});temporary.importJSON(await file.text());const incoming=JSON.parse(temporary.exportJSON()),existing=JSON.parse(library.exportJSON());incoming.components.forEach(c=>c.id=C.uid('component'));existing.components.push(...incoming.components);library.importJSON(JSON.stringify(existing));assetsDialog();toast(incoming.components.length+'件の部品を追加しました。');}catch(error){toast(errorMessage(error));}
  };
  $('image-input').onchange=async()=>{
    const file=$('image-input').files[0];$('image-input').value='';if(!file)return;const targetDoc=doc().id,targetPage=pageId,center={x:camera.x+camera.width/2,y:camera.y+camera.height/2},board=C.clone(page().board);
    try{const image=await A.imageFromFile(file,{maxWidth:board.width*.8,maxHeight:board.height*.8});image.x=center.x-image.width/2;image.y=center.y-image.height/2;if(doc().id!==targetDoc||!doc().pages.some(p=>p.id===targetPage))throw Error('作品が切り替わったため、画像をもう一度選んでください。');if(change(d=>d.pages.find(p=>p.id===targetPage).objects.unshift(image))){pageId=targetPage;selected=[image.id];setTool('select');toast('下絵を追加しました。位置は固定、書き出し・発表では非表示です。「画像の設定」で変更できます。');}}catch(error){toast(errorMessage(error));}
  };
  function imageDialog(){
    const o=page().objects.find(o=>o.id===selected[0]&&o.type==='image');if(!o||selected.length!==1)return;
    showDialog('画像の設定',`<label>名前<input id="image-name" maxlength="120" value="${esc(o.name)}"></label><label>不透明度（%）<input id="image-opacity" type="number" min="0" max="100" value="${o.style.opacity*100}"></label><label class="check"><input id="image-locked" type="checkbox" ${o.locked?'checked':''}>位置と大きさを固定する</label><label class="check"><input id="image-output" type="checkbox" ${!o.reference?'checked':''}>画像として書き出し・印刷・発表にも含める</label><p class="muted">下絵は編集用ファイルに保存されます。固定を解除すると移動・拡大縮小できます。画像自体の輪郭はパスにはなりません。</p>`,'適用',()=>{const opacity=Number($('image-opacity').value)/100;if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('不透明度は0〜100%で指定してください。');changePage(p=>{const image=p.objects.find(v=>v.id===o.id);image.name=$('image-name').value;image.locked=$('image-locked').checked;image.reference=!$('image-output').checked;image.style.opacity=opacity;});});
  }
  function present(fromStart){const focused=document.activeElement,opener=$('command-menu').contains(focused)?menuOpener:focused;hideMenu();cancelDrag();connectionUI.reset();window.IlapoPresentation.open(doc(),{pageId:fromStart?doc().pages[0].id:pageId,opener});}
  let playbackBusy=false;
  async function exportPlayback(){
    if(playbackBusy)return;playbackBusy=true;
    const frozen=C.clone(doc());document.querySelectorAll('[data-action=export-playback]').forEach(b=>b.disabled=true);
    try{const html=await window.IlapoPlaybackExport.buildHTML(frozen);download(html,fileName(frozen.name,'.play.html'),'text/html');toast('すべてのページを再生用HTMLへ保存しました。ファイルだけで再生できます。');}
    finally{playbackBusy=false;document.querySelectorAll('[data-action=export-playback]').forEach(b=>b.disabled=false);}
  }
  const commands={
    animations:()=>animationUI.list(),'animation-add':()=>animationUI.edit(),'export-playback':exportPlayback,
    assets:assetsDialog,'component-save':saveComponent,'import-image':()=>$('image-input').click(),'image-options':imageDialog,
    'connection-tool':()=>setTool('connector'),'connection-options':()=>connectionUI.dialog(),'connection-between':()=>connectionUI.addBetween(),'connection-convert':()=>connectionUI.convert(),
    'present-start':()=>present(true),'present-current':()=>present(false),
    rename:renameDialog,artboard:boardDialog,pages:pagesDialog,objects:objectsDialog,transform:transformDialog,style:styleDialog,'view-dialog':viewDialog,
    'save-browser':saveBrowser,'save-local':saveLocal,recovery:recoveryDialog,'open-file':()=>{$('file-input').accept='.zip,.json,.svg';$('file-input').click();},'import-svg':()=>{$('file-input').accept='.svg';$('file-input').click();},
    new:()=>checkReplace(()=>{const d=C.createDocument();d.name='無題の作品';d.pages[0].board=C.boardPreset('16:9');replaceDocument(d);$('save-status').textContent='新しい作品';}),
    'auto-start':async()=>{if(!localAuto){toast('ローカル自動保存を利用できません。');return;}try{await localAuto.start(doc());}catch(error){if(error.name!=='AbortError')toast(errorMessage(error));}},'auto-stop':()=>localAuto?.stop(),
    undo:()=>{if(history.canUndo){history.undo();pageId=page().id;selected=[];edited=true;queueSave();render();}},redo:()=>{if(history.canRedo){history.redo();pageId=page().id;selected=[];edited=true;queueSave();render();}},
    'select-all':()=>selection(page().objects.map(o=>o.id)),copy,paste,duplicate:()=>{if(!selected.length)return;let ids;if(changePage(p=>ids=C.duplicateObjects(p,selected,standardSize()*.12,standardSize()*.12)))selected=ids;render();},
    delete:()=>{if(editable())changePage(p=>C.removeObjects(p,selected));},group:()=>{if(editable())changePage(p=>C.groupObjects(p,selected));},ungroup:()=>{if(editable())changePage(p=>C.ungroupObjects(p,selected));},
    lock:()=>{const lock=allUnlocked();changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.locked=lock));},
    'text-edit':()=>{const o=page().objects.find(o=>o.id===selected[0]);if(selected.length===1&&o?.type==='text'&&editable())textDialog(o);},
    'style-copy':()=>{if(selected.length){copiedStyle=C.clone(page().objects.find(o=>o.id===selected[0]).style);toast('書式をコピーしました。');}},'style-paste':()=>{if(copiedStyle&&editable())changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.style=C.clone(copiedStyle)));},
    fit,'zoom-in':()=>zoomAt(1.25),'zoom-out':()=>zoomAt(.8),'zoom-reset':()=>zoomAt(1/zoom()),
    'export-toggle':()=>{$('export-panel').hidden=!$('export-panel').hidden;document.querySelector('.side-tab button').setAttribute('aria-expanded',String(!$('export-panel').hidden));render();help?.refresh();},
    'export-svg':()=>{download(S.exportPage(page(),exportOptions()),fileName(doc().name+'_'+page().name,'.svg'),'image/svg+xml');toast('SVGを書き出しました。');},
    'export-png':exportBitmap,
    'export-pdf':async()=>{const pages=C.clone($('print-range').value==='all'?doc().pages:[page()]);await E.print(pages,{title:doc().name});}
  };
  function execute(action){hideMenu();cancelDrag();try{if(action.startsWith('align-'))align(action.slice(6));else if(action.startsWith('order-')){if(editable())changePage(p=>C.reorderObjects(p,selected,action.slice(6)));}else if(pathUI.commands[action])pathUI.commands[action]();else {const result=commands[action]?.();if(result?.catch)result.catch(error=>toast(errorMessage(error)));}}catch(error){toast(errorMessage(error));}}
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.tool)setTool(button.dataset.tool);else if(button.dataset.menu)openMenu(button.dataset.menu,button);else if(button.dataset.action)execute(button.dataset.action);});
  document.addEventListener('keydown',event=>{
    if(help?.root.contains(event.target)||event.isComposing||event.target.closest('input,textarea,select,[contenteditable=true],.ilapo-present-dialog')||$('dialog').open)return;
    if(event.key==='Escape'){if(drag)cancelDrag();else if($('command-menu').matches(':popover-open')){hideMenu();menuOpener?.focus();}else if(!connectionUI.keyboard(event)){selected=[];pathUI.reset();connectionUI.reset();}space=false;render();return;}
    const mod=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
    if(mod){const map={s:'save-browser',o:'recovery',z:event.shiftKey?'redo':'undo',a:'select-all',c:'copy',v:'paste',d:'duplicate'};if(map[key]){event.preventDefault();execute(map[key]);}return;}
    if(event.target.closest('button')&&[' ','Enter'].includes(event.key))return;
    if(event.key===' '){event.preventDefault();space=true;render();return;}
    if(connectionUI.keyboard(event)||pathUI.keyboard(event)){event.preventDefault();return;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();execute('delete');}
    else if(event.key.startsWith('Arrow')&&selected.length&&!event.target.closest('button')){event.preventDefault();if(editable()){const n=(event.shiftKey?10:1)*(page().board.width<100?.1:1);const dx=event.key==='ArrowLeft'?-n:event.key==='ArrowRight'?n:0,dy=event.key==='ArrowUp'?-n:event.key==='ArrowDown'?n:0;if(tool==='direct'&&page().objects.some(o=>selected.includes(o.id)&&o.type==='path')){if(!pathUI.nudge(dx,dy))toast('動かす点を選ぶか「全体を選択」に切り替えてください。');}else changePage(p=>C.transformObjects(p,selected,[1,0,0,1,dx,dy]));}}
    else if(event.key==='?')help?.open();else if(key==='a')setTool('direct');else if(key==='v')setTool('select');else if(key==='h')setTool('pan');else if(key==='t')setTool('text');else if(key==='r')setTool('rect');else if(key==='e')setTool('ellipse');
  });
  document.addEventListener('keyup',event=>{if(event.key===' '){space=false;render();}});window.addEventListener('blur',()=>{space=false;cancelDrag();});
  window.addEventListener('beforeunload',event=>{if(dirty()||writeInProgress||localAuto?.pending){event.preventDefault();event.returnValue='';}});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(settings.theme==='auto')applySettings();});
  if(window.IlapoLocalAutosave)localAuto=new IlapoLocalAutosave({encode:S.encodeProject,onStatus:status=>{if(status.state==='error')toast('ローカル自動保存を停止しました。'+status.message);else if(status.state==='saved')$('save-status').textContent='ローカルへ自動保存済み';}});
  try{help=window.JohoToolHelp?.create({root:$('operation-help'),opener:$('help-button'),title:'イラストスライドの使い方',storageKey:'kaijo-ilapo:help',bounds:()=>({top:document.querySelector('.top').getBoundingClientRect().bottom+8,bottom:$('stage').getBoundingClientRect().bottom-8}),isBusy:()=>!!drag,returnToEditor:()=>$('canvas').focus()});}catch(error){console.warn('Help unavailable',error);}
  document.addEventListener('pointerover',event=>{const target=event.target.closest('[data-tip]');if(!target||event.pointerType==='touch')return;const r=target.getBoundingClientRect();$('tooltip').textContent=target.dataset.tip;$('tooltip').hidden=false;$('tooltip').style.left=Math.max(8,Math.min(r.left,innerWidth-$('tooltip').offsetWidth-8))+'px';$('tooltip').style.top=Math.min(r.bottom+7,innerHeight-$('tooltip').offsetHeight-8)+'px';});document.addEventListener('pointerout',()=>$('tooltip').hidden=true);document.addEventListener('pointerdown',()=>$('tooltip').hidden=true);
  pathUI=window.IlapoPathUI.create({page,selected:()=>selected,tool:()=>tool,settings:()=>settings,zoom,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,errorMessage,showDialog,esc,round,standardSize});
  connectionUI=window.IlapoConnectorUI.create({page,selected:()=>selected,tool:()=>tool,zoom,snap,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,showDialog,esc,round,standardSize});
  animationUI=window.IlapoAnimationUI.create({document:doc,page,selected:()=>selected,changePage,toast,showDialog,esc,standardSize,palette});
  window.IlapoEditor=Object.freeze({getAnchors:()=>pathUI.getRefs(),getDocument:()=>C.clone(doc()),getSelection:()=>selected.slice(),getCamera:()=>({...camera}),getState:()=>({tool,dirty:dirty(),pageId})});
  applySettings();requestAnimationFrame(()=>{fit();if(store?.list().length)recoveryDialog();});
}());
