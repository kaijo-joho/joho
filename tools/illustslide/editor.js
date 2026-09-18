/* illustSlide: 編集画面。作品、表示、選択、保存候補はそれぞれ独立して管理する。 */
(function () {
  'use strict';
  const C = window.IlapoCore, L = window.IlapoLayers, S = window.IlapoSVG, G = window.IlapoGeometry, E = window.IlapoExport, K=window.IlapoConnectors, A=window.IlapoAssets, Guides=window.IlapoGuides, Grid=window.IlapoGrid, Arrange=window.IlapoArrange;
  const $ = id => document.getElementById(id);
  const esc = value => String(value).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const icons = {
    direct:'m5 3 14 11-7 1-3 7zM17 3v5m-2-2h4',save:'M5 3h12l4 4v14H3V3h2zm2 0v6h10V3M7 21v-8h10v8',open:'M3 7V4h7l2 3h9v3M3 7v14h17l2-11H7L3 21',select:'m5 3 14 11-7 1-3 7z',undo:'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14',redo:'m16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14',pages:'M7 3h14v16H7zM3 7v16h14',view:'M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12zm7 0a3 3 0 1 0 6 0 3 3 0 0 0-6 0',more:'M4 12h1m6 0h1m6 0h1',board:'M5 1v22M1 5h22M19 1v22M1 19h22',layers:'m12 3 10 5-10 5L2 8zm-10 9 10 5 10-5M2 17l10 5 10-5',fit:'M9 3H3v6m12-6h6v6M3 15v6h6m12-6v6h-6',rect:'M3 5h18v14H3z',roundrect:'M7 4h10q4 0 4 4v8q0 4-4 4H7q-4 0-4-4V8q0-4 4-4',ellipse:'M22 12a10 7 0 1 0-20 0 10 7 0 1 0 20 0',triangle:'m12 3 10 18H2z',pentagon:'m12 2 10 8-4 12H6L2 10z',line:'m3 20 18-16',text:'M3 4h18M12 4v17m-5 0h10',pan:'M8 11V5a2 2 0 0 1 4 0v6-8a2 2 0 0 1 4 0v8-5a2 2 0 0 1 4 0v10q0 7-7 7-4 0-6-3L2 14q-1-3 2-3l4 4'
  };
  const icon = name => `<svg viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[name] || icons.rect}"/></svg>`;
  Object.assign(icons,{diamond:'m12 2 10 10-10 10L2 12z',parallelogram:'M7 5h15l-5 14H2z',arrow:'M2 9h12V3l8 9-8 9v-6H2z',callout:'M2 3h20v14H11l-5 5v-5H2z',connector:'M3 19 21 5m-7-1 7 1-1 7','connector-orthogonal':'M3 4h9v16h9m-5-5 5 5-5 3'});
  Object.assign(icons,{
    style:'M12 3a9 9 0 1 0 0 18h1a2 2 0 0 0 0-4h-1a2 2 0 0 1 0-4h5a4 4 0 0 0 4-4c0-3-4-6-9-6zM7 9h.01M11 6h.01M16 7h.01M5 13h.01',
    transform:'M3 3h4v4H3zM17 3h4v4h-4zM3 17h4v4H3zM17 17h4v4h-4zM7 5h10M5 7v10M19 7v10M7 19h10m-8-3 8-8m-5 0h5v5',
    outline:'M2 21 9 3h6l7 18h-5l-2-5H9l-2 5zM10 12h4l-2-5z',
    path:'M3 17C7 17 7 7 13 7s6 4 8 4M1 15h4v4H1zM11 5h4v4h-4zM13 7l5-4m-1-1h2v2h-2z',
    'flip-h':'M12 2v3m0 3v3m0 3v3m0 3v2M3 5l6 6v7H3zM21 5l-6 6v7h6z','flip-v':'M2 12h3m3 0h3m3 0h3m3 0h2M5 3l6 6h7V3zM5 21l6-6h7v6z',
    'rotate-left':'M3 3v6h6M3 9a9 9 0 1 1 1 10','rotate-right':'M21 3v6h-6M21 9a9 9 0 1 0-1 10',export:'M12 3v12m-5-5 5 5 5-5M4 15v6h16v-6',
    details:'M3 5h18M3 12h18M3 19h18M8 2v6M16 9v6M9 16v6',back:'m14 5-7 7 7 7',edit:'m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4',image:'M3 3h18v18H3zM3 16l5-6 4 5 3-3 6 7M15 7h.01',
    arrange:'M4 2v20M8 5h12v5H8zM8 14h8v5H8z',animation:'m10 6 9 6-9 6zM3 7h3M1 12h5M3 17h3',
    'align-left':'M3 2v20M6 4h15v5H6zM6 15h9v5H6z','align-center':'M12 1v22M3 4h18v5H3zM7 15h10v5H7z','align-right':'M21 2v20M3 4h15v5H3zM9 15h9v5H9z',
    'align-top':'M2 3h20M4 6h5v15H4zM15 6h5v9h-5z','align-middle':'M1 12h22M4 3h5v18H4zM15 7h5v10h-5z','align-bottom':'M2 21h20M4 3h5v15H4zM15 9h5v9h-5z',
    'align-distribute-x':'M2 4h3v16H2zM10 7h4v10h-4zM19 4h3v16h-3zM5 12h5m4 0h5','align-distribute-y':'M4 2h16v3H4zM7 10h10v4H7zM4 19h16v3H4zM12 5v5m0 4v5',
    'align-width':'M3 9h18v4H3zM3 17h18v4H3zM3 4h18M6 1 3 4l3 3M18 1l3 3-3 3','align-height':'M9 3h4v18H9zM17 3h4v18h-4zM4 3v18M1 6l3-3 3 3M1 18l3 3 3-3',
    'align-size':'M3 3h7v7H3zM14 14h7v7h-7zM14 3h7v7M17 7l4-4M3 14v7h7M3 21l4-4',
    copy:'M8 8h13v13H8zM4 16H3V3h13v1',duplicate:'M8 8h13v13H8zM4 16H3V3h13v1M11 14h7M14.5 11v7',
    paste:'M8 4H4v17h16V4h-4M8 2h8v5H8zM8 11h8M8 15h6',delete:'M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7M14 10v7',
    group:'M2 2h20v20H2zM6 6h8v8H6zM10 10h8v8h-8z',ungroup:'M2 8V2h6M16 2h6v6M22 16v6h-6M8 22H2v-6M6 6h8v8H6zM10 10h8v8h-8z',
    lock:'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5zM12 14v4',brush:'m14 3 7 7-8 8-7-7zM8 13l-3 3M3 16h5v5H3z',
    plus:'M12 4v16M4 12h16',up:'m5 14 7-7 7 7',down:'m5 10 7 7 7-7',right:'m9 5 7 7-7 7',unlock:'M7 10V7a5 5 0 0 1 9-3M5 10h14v12H5zM12 14v4',
    assets:'M3 3h7v7H3zM14 3h7v7h-7zM3 14h7v7H3zM17.5 14v7M14 17.5h7',
    'text-left':'M3 4h18M3 9h11M3 14h18M3 19h11','text-center':'M3 4h18M6 9h12M3 14h18M6 19h12','text-right':'M3 4h18M10 9h11M3 14h18M10 19h11',
    union:'M3 3h11v6h7v12H9v-7H3z',subtract:'M3 3h12v6H9v6H3zM18 9h3v12H9v-3',intersect:'M9 9h6v6H9zM3 15V3h12M21 9v12H9',
    'anchor-add':'M2 19C7 19 7 6 13 6s5 5 9 5M8 13h5v5H8zM17 2v6M14 5h6','anchor-corner':'M3 19 11 5l10 14M9 3h4v4H9z','anchor-smooth':'M2 18C7 18 7 6 12 6s5 12 10 12M10 4h4v4h-4zM4 6h16','anchor-position':'M12 2v20M2 12h20M9 9h6v6H9z',
    canvas:'M3 8V3h5M16 3h5v5M21 16v5h-5M8 21H3v-5m7-5 7 4-4 1-1 4z'
  });
  const names = {rect:'長方形',roundrect:'角丸',ellipse:'楕円',triangle:'三角形',pentagon:'五角形',diamond:'菱形',parallelogram:'平行四辺形',arrow:'太い矢印',callout:'吹き出し',line:'線',connector:'接続矢印','connector-orthogonal':'カギ型矢印',text:'文字',direct:'点を編集',select:'選択',pan:'移動'};
  document.querySelectorAll('[data-icon]').forEach(el => el.insertAdjacentHTML('afterbegin',icon(el.dataset.icon)));
  $('shape-tools').innerHTML = Object.keys(names).filter(k=>!['direct','select','pan'].includes(k)).map(k=>`<button data-tool="${k}" aria-label="${names[k]}を追加" data-tip="${names[k]}を追加">${icon(k)}<span>${names[k]}</span></button>`).join('');
  if (!C || !L || !S || !G || !E || !K || !A || !Guides || !Grid || !Arrange || !window.IlapoPathEdit || !window.IlapoPathUI || !window.IlapoConnectorUI || !window.IlapoPresentation || !window.IlapoAnimation || !window.IlapoAnimationPlayer || !window.IlapoAnimationUI || !window.IlapoPlaybackExport || !window.IlapoInspector || !window.IlapoPagesUI || !window.IlapoObjectsUI || !window.IlapoObjectsModel || !window.IlapoAssetsUI || !window.IlapoTextUI || !window.IlapoTextLayout || !window.IlapoOutline || !window.IlapoOutlineUI || !window.IlapoStrokeOutline || !window.IlapoTextOutline) { $('hint').textContent='必要なファイルを読み込めませんでした。ページを再読み込みしてください。'; return; }
  const initial=C.createDocument(); initial.name='無題の作品'; initial.pages[0].board=C.boardPreset('16:9');
  const history=new C.History(initial);
  let pageId=initial.pages[0].id, selected=[], tool='select', drag=null, preview=null, clipboard=null, copiedStyle=null;
  let camera={x:0,y:0,width:1280,height:720}, saveTimer, saveFingerprint=JSON.stringify(initial), edited=false, store, localAuto, help, space=false, renderPending=false, writeInProgress=false;
  let pathUI,connectionUI,animationUI,pagesUI,objectsUI,assetsUI,textUI,outlineUI,library,inspector,inspectorPreview=null,revision=0;
  let hoverPreview,hoverState=null,hoverInvalidated=false,hoverEpoch=0;
  let arrangeReference='object',arrangeKey=null,arrangeSelectionKey='';
  let settings={theme:'auto',size:'standard',grid:true,snap:false,gridStep:20,pixelGrid:true,snapPixel:true,snapAnchor:true,snapPath:true,smartGuides:true};
  try { Object.assign(settings,JSON.parse(localStorage.getItem('kaijo-ilapo:settings')||'{}')); } catch (_) {}
  for(const key of ['pixelGrid','snapPixel'])if(typeof settings[key]!=='boolean')settings[key]=true;
  if(typeof settings.smartGuides!=='boolean')settings.smartGuides=true;
  if(!['auto','light','dark'].includes(settings.theme))settings.theme='auto';
  if(!['standard','large','xlarge'].includes(settings.size))settings.size='standard';
  if(!Number.isFinite(Number(settings.gridStep))||Number(settings.gridStep)<.01||Number(settings.gridStep)>10000)settings.gridStep=20;
  try { store=new C.Store(localStorage); } catch (_) { store=null; }
  try { library=A.createLibrary(localStorage); } catch (_) { library=null; }
  const doc=()=>history.document;
  const page=()=>doc().pages.find(p=>p.id===pageId)||doc().pages[0];
  const drawPage=()=>preview||inspectorPreview||page();
  const activeLayers=new Map();
  const layerScope=(p=page())=>doc().id+'|'+p.id;
  const isVisible=(object,p=page())=>L.visible(p,object);
  const isLocked=(object,p=page())=>L.locked(p,object);
  function activeLayer(p=page()) {
    const layers=L.list(p), saved=activeLayers.get(layerScope(p));
    return (layers.find(l=>l.id===saved)||layers.find(l=>l.visible&&!l.locked)||layers[0]).id;
  }
  function setActiveLayer(id) {
    if(!L.list(page()).some(l=>l.id===id))return;
    activeLayers.set(layerScope(),id);clearSelection();render();
  }
  function canInsert() {
    const layer=L.list(page()).find(l=>l.id===activeLayer());
    if(layer.visible&&!layer.locked)return true;
    toast('「レイヤー」で追加先のレイヤーを表示し、固定を解除してください。');return false;
  }
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
    const p=page(), shown=p.objects.filter(o=>isVisible(o,p)), b=p.board.infinite&&shown.length ? bounds(shown.map(o=>o.id),p) : {x:0,y:0,width:p.board.width,height:p.board.height};
    const cw=Math.max(1,$('canvas').clientWidth),ch=Math.max(1,$('canvas').clientHeight);
    const scale=Math.min(cw/(Math.max(b.width,1)*1.28),ch/(Math.max(b.height,1)*1.35));
    camera={x:b.x+b.width/2-cw/scale/2,y:b.y+b.height/2-ch/scale/2,width:cw/scale,height:ch/scale}; render();
  }
  function world(event) { const r=$('canvas').getBoundingClientRect(); return {x:camera.x+(event.clientX-r.left)/r.width*camera.width,y:camera.y+(event.clientY-r.top)/r.height*camera.height}; }
  function snap(p,event) { return Grid.point(p,settings,event); }
  function bounds(ids,p=drawPage()) {
    const boxes=p.objects.filter(o=>ids.includes(o.id)).map(o=>G.bounds(o));
    if(!boxes.length) return {x:0,y:0,width:1,height:1};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
  }
  function selection(ids) {
    const known=[...new Set(ids.filter(id=>page().objects.some(o=>o.id===id&&isVisible(o))))];
    selected=[...new Set([...known,...C.expandSelection(page(),known)])].filter(id=>isVisible(id));
    const layers=new Set(selected.map(id=>L.layerOf(page(),id)?.id));
    if(layers.size===1)activeLayers.set(layerScope(),[...layers][0]);
    render();
  }
  const selecting=()=>tool==='select'||tool==='direct';
  function clearSelection(){selected=[];pathUI.reset();connectionUI.reset();if(selecting())tool='select';}
  function outlineAvailable(){const info=window.IlapoOutline.inspect(page(),selected);return !!(info.lines||info.text)&&!info.locked&&allUnlocked();}
  function allUnlocked() { return !page().objects.some(o=>selected.includes(o.id)&&isLocked(o)); }
  function editable() { if(!selected.length)return false; if(!allUnlocked()){toast('固定された図形を含むため、先に固定を解除してください。');return false;} return true; }
  function change(fn) {
    const before=snapshot(), previous=doc();
    try { history.change(d=>{fn(d);d.pages.forEach(p=>{L.reconcile(p,previous.pages.find(v=>v.id===p.id),activeLayer(p));K.sync(p);});},{group:inspector?.changeGroup}); pageId=page().id; selected=selected.filter(id=>page().objects.some(o=>o.id===id&&isVisible(o))); if(before!==snapshot()){revision++;edited=true;queueSave();} render(); return before!==snapshot(); }
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
    hoverInvalidated=true;
    if(renderPending)return; renderPending=true;requestAnimationFrame(()=>{renderPending=false;renderNow();});
  }
  function clearHoverPreview(invalidate=true) {
    if (invalidate) hoverEpoch++;
    hoverState=null;
    if (hoverPreview) hoverPreview.innerHTML='';
    $('canvas').removeAttribute('data-hover-kind');
  }
  function updateHoverPreview(event, point) {
    if (!hoverPreview || drag || space || !selecting() || event.pointerType==='touch') return;
    if (event.target.closest('[data-handle],[data-bezier],[data-connection-handle]')) { clearHoverPreview(); return; }
    const base=page(), picked=pathUI?.pick(point,event,base);
    const targetId=event.target.closest('[data-object]')?.dataset.object;
    let next=null;
    // 全体選択中の図形内部は、PathUIの頂点判定より変形操作を優先する。
    if (tool==='select' && targetId && selected.includes(targetId)) {
      next={kind:'whole',id:targetId};
    } else if (picked?.ref) {
      const object=base.objects.find(o=>o.id===picked.ref.id), segment=object&&window.IlapoPathEdit.inspect(object)[picked.ref.path]?.segments[picked.ref.index];
      if (segment) next={kind:'anchor',ref:picked.ref,point:{...segment.point}};
    } else {
      // 辺の近傍は押すと直接選択へ切り替わるため、全体候補を表示しない。
      const id=picked?.near ? null : picked?.id||targetId;
      if (id && base.objects.some(o=>o.id===id)) next={kind:'whole',id};
    }
    const key=next?.kind==='anchor'?`anchor:${next.ref.id}:${next.ref.path}:${next.ref.index}`:next?.kind==='whole'?`whole:${next.id}`:'';
    if ((hoverState?.key||'')===key) return;
    hoverState=next?{...next,key}:null;
    if (!next) { clearHoverPreview(); return; }
    $('canvas').dataset.hoverKind=next.kind;
    if (next.kind==='anchor') {
      const r=Math.max(5/zoom(),3/zoom());
      hoverPreview.innerHTML=`<circle cx="${next.point.x}" cy="${next.point.y}" r="${r*2.1}" fill="var(--accent-soft)" stroke="var(--accent)" stroke-width="${1.5/zoom()}"/><circle cx="${next.point.x}" cy="${next.point.y}" r="${r*.7}" fill="var(--accent)"/>`;
      return;
    }
    const ids=C.expandSelection(base,[next.id]),b=bounds(ids,base),stroke=1.2/zoom();
    hoverPreview.innerHTML=`<rect x="${b.x}" y="${b.y}" width="${Math.max(b.width,.1/zoom())}" height="${Math.max(b.height,.1/zoom())}" fill="var(--accent-soft)" fill-opacity=".12" stroke="var(--accent)" stroke-opacity=".58" stroke-width="${stroke}" stroke-dasharray="${4/zoom()} ${3/zoom()}"/>`;
  }
  function renderNow() {
    // 作品・カメラ・選択状態を更新した候補は、次の座標で再判定する。
    if (hoverInvalidated) { hoverInvalidated=false; if (hoverState) clearHoverPreview(false); }
    inspector?.sync();
    if(preview){L.reconcile(preview,page(),activeLayer());K.sync(preview);}
    const p=drawPage(); $('canvas').setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    $('canvas').dataset.tool=tool==='pan'||space?'pan':pathUI?.context().adding?'draw':['select','direct'].includes(tool)?'select':'draw';
    const art=p.board.infinite?{x:camera.x,y:camera.y,width:camera.width,height:camera.height}:{x:0,y:0,width:p.board.width,height:p.board.height};
    for(const [key,value] of Object.entries(art)){$('paper').setAttribute(key,value);$('grid').setAttribute(key,value);$('pixel-grid').setAttribute(key,value);}
    const interval=Math.max(.01,Number(settings.gridStep)||20),visibleStep=interval*zoom()<7?interval*Math.ceil(7/(interval*zoom())):interval;
    $('grid-pattern').setAttribute('width',visibleStep);$('grid-pattern').setAttribute('height',visibleStep);$('grid-pattern').firstElementChild.setAttribute('r',.7/zoom());$('grid').style.display=settings.grid&&!(settings.pixelGrid&&zoom()>=8&&interval===1)?'':'none';
    $('pixel-pattern').firstElementChild.setAttribute('stroke-width',.8/zoom());$('pixel-grid').style.display=settings.pixelGrid&&zoom()>=8?'':'none';
    $('artwork').innerHTML=p.objects.filter(o=>isVisible(o,p)).map(o=>`<g data-object="${esc(o.id)}" aria-label="${esc(o.name)}">${o.type==='connector'?`<path d="${K.renderedParts(o)[0].d}" fill="none" stroke="transparent" stroke-width="${16/zoom()}"/>`:''}${S.objectMarkup(o)}</g>`).join('');
    $('welcome').hidden=p.objects.some(o=>isVisible(o,p))||!!drag; $('selection-bar').hidden=!selected.length||!!drag;
    $('selection-count').textContent=pathUI?.count()?pathUI.count()+'点':selected.length+'個';
    renderSelectionActions(p);
    $('document-title').textContent=doc().name;document.title=doc().name+' — イラストスライド illustSlide';
    renderInspectorTabs();
    $('page-status').textContent=`${doc().pages.indexOf(page())+1} / ${doc().pages.length} · ${page().name}`;
    $('zoom-value').textContent=(zoom()*100<10?(zoom()*100).toFixed(1):Math.round(zoom()*100))+'%';
    document.querySelectorAll('[data-action=undo]').forEach(b=>b.disabled=!history.canUndo);document.querySelectorAll('[data-action=redo]').forEach(b=>b.disabled=!history.canRedo);
    document.querySelectorAll('button[data-tool]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.tool==='select'?selecting():b.dataset.tool===tool)));
    $('hint').textContent=['connector','connector-orthogonal'].includes(tool)?connectionUI.hint():!$('connection-options').hidden&&tool==='direct'?'丸い端点で接続位置 · 四角で折れ曲がり位置 · ダブルクリックで点を追加 · Enterで詳細':tool==='direct'?pathUI.hint():tool==='select'?(selected.length?'全体を選択中 · 枠の角・辺で拡大縮小 · 内側ダブルクリックで文字 · Escで解除':'頂点・辺で点を編集 · 内側で全体を選択 · 空白ドラッグで範囲選択'):tool==='pan'?'ドラッグして表示を移動':`${names[tool]}：クリックで配置 · ドラッグで大きさを指定`;
    renderSelection();
    renderArrangeReference();
    $('alignment-guides').innerHTML=Guides.markup(drag?.alignment,zoom(),p.board.unit);
  }
  function renderSelectionActions(p){
    syncArrangeSelection();
    const objects=p.objects.filter(o=>selected.includes(o.id)),one=objects.length===1?objects[0]:null;
    const paths=objects.filter(o=>o.type==='path'),combine=paths.length>1&&paths.length===objects.length;
    const direct=tool==='direct',points=!combine&&direct&&pathUI.count()>0,unlocked=allUnlocked();
    const canDirect=paths.length>0||one?.type==='connector';
    $('whole-mode').hidden=!canDirect||tool!=='direct';$('direct-mode').hidden=!canDirect||tool==='direct';
    $('selection-bar').dataset.mode=tool==='direct'?'direct':'whole';
    for(const key of ['union','subtract','intersect']){$('quick-'+key).hidden=!direct||!combine;$('quick-'+key).disabled=!unlocked;}
    $('quick-add-anchor').hidden=!direct||!one||one.type!=='path';$('quick-add-anchor').disabled=!unlocked;
    $('quick-add-anchor').setAttribute('aria-pressed',String(!!pathUI.context?.().adding));
    for(const key of ['corner','smooth']){$('quick-anchor-'+key).hidden=!points;$('quick-anchor-'+key).disabled=!unlocked;}
    $('path-menu-button').hidden=direct?(!one||one.type!=='path'):!paths.length;
    $('path-menu-button').setAttribute('aria-label',direct?'パス':'アンカー');
    $('connection-options').hidden=!direct||one?.type!=='connector';$('image-options').hidden=!direct||one?.type!=='image';
    $('style-button').hidden=points||direct&&one?.type==='image';$('style-button').disabled=one?.type==='image'?!!L.layerOf(p,one.id)?.locked:!unlocked;
    $('text-options').hidden=points||!one||!(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)));
    $('text-options').disabled=!unlocked;
    $('selection-arrange').hidden=objects.length<2;$('selection-arrange').disabled=!unlocked;
    for(const axis of ['h','v']){$('selection-flip-'+axis).hidden=!direct||!!points;$('selection-flip-'+axis).disabled=!unlocked;}
    $('selection-transform').hidden=direct;$('selection-transform').disabled=!unlocked;
    $('selection-combine').hidden=direct||!combine;$('selection-combine').disabled=!unlocked;
    $('selection-group').hidden=direct;
    $('selection-more').setAttribute('aria-label',direct?'その他の編集':'詳細');
    $('selection-more').dataset.tip=direct?'その他の編集：コピー・グループ・重なり順など':'詳細：コピー・重なり順・アウトライン化など';
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
      const gap=18/z,sides={n:w>gap*2?`M${x+gap} ${y}H${x+w-gap}`:'',s:w>gap*2?`M${x+gap} ${y+h}H${x+w-gap}`:'',w:h>gap*2?`M${x} ${y+gap}V${y+h-gap}`:'',e:h>gap*2?`M${x+w} ${y+gap}V${y+h-gap}`:''};
      markup+=handles.map(([key,hx,hy])=>`<g data-handle="${key}" style="cursor:${key==='rotate'?'crosshair':key+'-resize'}">${sides[key]?`<path d="${sides[key]}" fill="none" stroke="transparent" stroke-width="${(matchMedia('(pointer:coarse)').matches?22:12)/z}"/>`:''}<circle cx="${hx}" cy="${hy}" r="${(matchMedia('(pointer:coarse)').matches?15:8)/z}" fill="transparent"/><circle cx="${hx}" cy="${hy}" r="${4/z}" fill="white" stroke="#2563eb" stroke-width="${stroke}"/></g>`).join('');
    }
    $('selection').innerHTML=markup;
  }
  function setTool(value){closePalette(false);objectsUI?.cancelDrag();cancelDrag();clearHoverPreview();if(tool!==value){pathUI?.reset();connectionUI?.reset();}tool=value;hideMenu();render();$('canvas').focus();}
  function cancelDrag(){if(drag?.originalSelection)selected=drag.originalSelection;pathUI?.cancel(drag);connectionUI?.cancel();preview=null;drag=null;clearHoverPreview();render();}
  function standardSize(){return Math.max(.5,Math.min(160,page().board.width*.2,page().board.height*.25));}
  function createShape(kind,start,end,defaultSize=false,event){
    const size=standardSize();let x=defaultSize?start.x-size/2:Math.min(start.x,end.x),y=defaultSize?start.y-size*.32:Math.min(start.y,end.y),w=defaultSize?size:Math.abs(end.x-start.x),h=defaultSize?size*.65:Math.abs(end.y-start.y);
    if(defaultSize){const a=snap({x,y},event),b=snap({x:x+w,y:y+h},event),interval=Grid.step(settings,event);x=a.x;y=a.y;w=Math.max(interval||.001,b.x-x);h=Math.max(interval||.001,b.y-y);}
    const style={fill:kind==='line'?'none':'#93C5FD',stroke:'#1E3A5F',strokeWidth:Math.max(.04,size/90),linecap:'round',linejoin:'round'};
    const minimum=Grid.step(settings,event)||.001;
    let o=C.makeShape(kind,x,y,Math.max(w,minimum),kind==='line'?h:Math.max(h,minimum),style);o.name=names[kind];
    if(kind==='line'&&!defaultSize)o.d=`M${start.x} ${start.y}L${end.x} ${end.y}`;
    return o;
  }
  hoverPreview=document.createElementNS('http://www.w3.org/2000/svg','g');
  hoverPreview.id='hover-preview';
  hoverPreview.setAttribute('pointer-events','none');
  hoverPreview.setAttribute('aria-hidden','true');
  $('canvas').insertBefore(hoverPreview,$('selection'));
  $('canvas').addEventListener('pointerdown',event=>{
    if(inspectorPreview)inspector.reset();
    if(event.button!==0&&event.button!==1)return;if(drag)return;hideMenu();$('canvas').focus();
    clearHoverPreview();
    if(!['select','direct','pan'].includes(tool)&&!space&&event.button===0&&!canInsert())return;
    const p=world(event),point=snap(p,event),base=C.clone(page()),originalSelection=selected.slice();
    const handle=event.target.closest('[data-handle]')?.dataset.handle;
    let hit=event.target.closest('[data-object]')?.dataset.object,picked=null;
    // 既に選択した図形と操作ハンドルは現在の状態を保つ。初回だけ触れた場所で決める。
    if(selecting()&&!space&&event.button===0&&!handle&&!event.target.closest('[data-node],[data-bezier],[data-connection-handle]')&&!pathUI.context().adding){
      picked=pathUI.pick(p,event,base);hit||=picked?.id;
      if(hit&&!selected.includes(hit)){
        const next=(picked||base.objects.find(o=>o.id===hit)?.type==='connector')?'direct':'select';
        if(tool!==next){pathUI.reset();connectionUI.reset();tool=next;}
      }
    }
    if(tool==='pan'||space||event.button===1)drag={kind:'pan',start:p,client:{x:event.clientX,y:event.clientY},camera:{...camera}};
    else if(connectionUI.pointerDown(event,p,base)){}
    else if(handle&&selected.length&&editable())drag={kind:'transform',handle,start:p,box:bounds(selected),base,originalSelection};
    else if(tool==='text'){selected=[];tool='direct';pathUI.reset();textUI.add(point);render();return;}
    else if(tool==='direct')pathUI.pointerDown(event,p,base,picked);
    else if(tool!=='select')drag={kind:'draw',start:point,end:point,base,originalSelection};
    else if(hit){
      const expanded=C.expandSelection(page(),[hit]);
      if(event.shiftKey){const remove=expanded.every(id=>selected.includes(id));selection(remove?selected.filter(id=>!expanded.includes(id)):[...new Set([...selected,...expanded])]);}
      else if(!selected.includes(hit))selection(expanded);
      if(selected.includes(hit)&&allUnlocked())drag={kind:'move',start:point,base,originalSelection:selected.slice()};
    }else {if(!event.shiftKey)selected=[];drag={kind:'marquee',start:p,box:{x:p.x,y:p.y,width:0,height:0},originalSelection,add:event.shiftKey};}
    if(drag){drag.rawStart={...p};drag.selectionIds=selected.slice();event.preventDefault();$('canvas').setPointerCapture(event.pointerId);drag.pointerId=event.pointerId;}render();
  });
  $('canvas').addEventListener('pointermove',event=>{
    if(!drag){
      if(event.pointerType!=='touch'){
        const epoch=hoverEpoch;
        updateHoverPreview(event,world(event));
        requestAnimationFrame(()=>{if(!drag&&epoch===hoverEpoch)updateHoverPreview(event,world(event));});
      }
      return;
    }
    if(drag.pointerId!==event.pointerId)return;clearHoverPreview();const p=world(event),sp=snap(p,event);drag.moved=drag.moved||Math.hypot(p.x-drag.rawStart.x,p.y-drag.rawStart.y)*zoom()>3;drag.lastPoint={...p};
    if(connectionUI.pointerMove(event,p,drag)||pathUI.pointerMove(event,p,drag)){render();return;}
    if(drag.kind==='pan'){camera.x=drag.camera.x-(event.clientX-drag.client.x)/zoom();camera.y=drag.camera.y-(event.clientY-drag.client.y)/zoom();}
    if(drag.kind==='draw'){drag.end=sp;preview=C.clone(drag.base);if(drag.moved){try{preview.objects.push(createShape(tool,drag.start,sp,false,event));}catch(_){}}}
    if(drag.kind==='marquee'){drag.box={x:Math.min(p.x,drag.start.x),y:Math.min(p.y,drag.start.y),width:Math.abs(p.x-drag.start.x),height:Math.abs(p.y-drag.start.y)};}
    updateSelectionDrag(p,event);
    render();
  });
  function updateSelectionDrag(point,event){
    if(!drag||!['move','transform'].includes(drag.kind)||!drag.moved)return;
    const ids=drag.selectionIds||drag.originalSelection;
    drag.guideSession||=Guides.prepare(drag.base,ids,G.bounds,camera,{isVisible});
    const interval=Grid.step(settings,event),options={zoom:zoom(),enabled:settings.smartGuides,alt:event.altKey,accept:(_axis,value)=>Grid.matches(value,interval)};
    preview=C.clone(drag.base);
    if(drag.kind==='move'){
      const delta={x:point.x-drag.rawStart.x,y:point.y-drag.rawStart.y};
      drag.alignment=Guides.move(drag.guideSession,delta,{...options,fallback:Grid.moveDelta(drag.guideSession.box,delta,settings,event)});
      C.transformObjects(preview,ids,[1,0,0,1,drag.alignment.delta.x,drag.alignment.delta.y]);return;
    }
    const b=drag.box,cx=b.x+b.width/2,cy=b.y+b.height/2,key=drag.handle;let m;
    drag.alignment=null;
    if(key==='rotate'){
      let angle=Math.atan2(point.y-cy,point.x-cx)-Math.atan2(drag.start.y-cy,drag.start.x-cx);
      if(event.shiftKey)angle=Math.round(angle/(Math.PI/12))*Math.PI/12;
      m=around(rotation(angle),cx,cy);
    }else{
      const x=key.includes('w')?'start':key.includes('e')?'end':null,y=key.includes('n')?'start':key.includes('s')?'end':null;
      const ax=x==='start'?b.x+b.width:x==='end'?b.x:cx,ay=y==='start'?b.y+b.height:y==='end'?b.y:cy;
      let sx=x?(point.x-ax)/(drag.start.x-ax||1):1,sy=y?(point.y-ay)/(drag.start.y-ay||1):1;
      sx=Math.max(.01,sx);sy=Math.max(.01,sy);
      if(event.shiftKey){if(!x)sx=sy;else sy=sx;}
      const proposed={x:ax+(b.x-ax)*sx,y:ay+(b.y-ay)*sy,width:b.width*sx,height:b.height*sy};
      const snapped=Grid.resize(b,proposed,{x,y,uniform:event.shiftKey},settings,event);
      drag.alignment=Guides.resize(drag.guideSession,snapped,{...options,x,y,uniform:event.shiftKey});
      if(b.width)sx=drag.alignment.box.width/b.width;if(b.height)sy=drag.alignment.box.height/b.height;
      m=around([sx,0,0,sy,0,0],ax,ay);
    }
    C.transformObjects(preview,ids,m);
  }
  $('canvas').addEventListener('pointerup',event=>{
    if(!drag||drag.pointerId!==event.pointerId)return;const action=drag, result=preview;drag=null;preview=null;
    if(['marquee','node-marquee'].includes(action.kind)&&!action.moved&&!action.add){clearSelection();render();return;}
    if(connectionUI.finishDrag(action,result)||pathUI.finishDrag(action,result)){render();return;}
    if(action.kind==='draw'){
      const object=createShape(tool,action.start,action.end,!action.moved,event);changePage(p=>p.objects.push(object));selected=[object.id];tool='select';pathUI.reset();
    }else if(['move','transform'].includes(action.kind)&&action.moved&&result)changePage(p=>p.objects=result.objects);
    else if(action.kind==='marquee'&&action.moved){const b=action.box;const hits=page().objects.filter(o=>{if(!isVisible(o))return false;const a=G.bounds(o);return a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;}).map(o=>o.id);selection(action.add?[...new Set([...action.originalSelection,...hits])]:hits);}
    render();
  });
  $('canvas').addEventListener('pointerleave',()=>{if(!drag)clearHoverPreview();});
  $('canvas').addEventListener('pointercancel',cancelDrag);
  $('canvas').addEventListener('dblclick',event=>{
    const point=world(event);
    // 再描画とポインター捕捉で対象がcanvasになる場合も、実際に触れた要素を使う。
    const target=event.target.closest('[data-object],[data-node],[data-bezier]')?event.target:document.elementFromPoint(event.clientX,event.clientY)||event.target;
    if(connectionUI.doubleClick(event,point,target))return;
    const id=target.closest('[data-object]')?.dataset.object,o=page().objects.find(o=>o.id===id);
    const shape=o?.type==='path'&&(o.label||/[zZ]/.test(o.d)),edge=shape&&tool==='direct'?window.IlapoPathEdit.nearest(o,point):null;
    if(o&&!isLocked(o)&&(o.type==='text'||shape&&!target.closest('[data-node],[data-bezier]')&&(!edge||edge.distance>9/zoom()))){selection([id]);if(selected.length===1)openInspectorSection('text');return;}
    if(tool==='direct')pathUI.doubleClick({target},point);
  });
  function rotation(a){return [Math.cos(a),Math.sin(a),-Math.sin(a),Math.cos(a),0,0];}
  function around(m,x,y){return C.multiply([1,0,0,1,x,y],C.multiply(m,[1,0,0,1,-x,-y]));}
  function zoomAt(factor,p){const old=zoom(),next=Math.max(.005,Math.min(100,old*factor)),ratio=old/next;const anchor=p||{x:camera.x+camera.width/2,y:camera.y+camera.height/2};camera={x:anchor.x-(anchor.x-camera.x)*ratio,y:anchor.y-(anchor.y-camera.y)*ratio,width:camera.width*ratio,height:camera.height*ratio};render();}
  $('canvas').addEventListener('wheel',event=>{event.preventDefault();if(drag)return;if(event.ctrlKey||event.metaKey)zoomAt(Math.exp(-event.deltaY*.01),world(event));else{camera.x+=event.deltaX/zoom();camera.y+=event.deltaY/zoom();render();}},{passive:false});
  new ResizeObserver(entries=>{const r=entries[0].contentRect;if(r.width&&r.height){const cy=camera.y+camera.height/2;camera.height=camera.width*r.height/r.width;camera.y=cy-camera.height/2;render();help?.refresh();}}).observe($('stage'));

  const narrowPalette=matchMedia('(max-width:560px)');
  function closePalette(restoreFocus=true){
    const wasOpen=$('app').classList.contains('palette-open');
    $('app').classList.remove('palette-open');$('palette-toggle').setAttribute('aria-expanded','false');
    if(wasOpen&&restoreFocus)$('palette-toggle').focus();
  }
  function togglePalette(){
    if($('app').classList.contains('palette-open')){closePalette();return;}
    hideMenu();$('app').classList.add('palette-open');$('palette-toggle').setAttribute('aria-expanded','true');
    ($('add-palette').querySelector('[data-tool][aria-pressed=true]')||$('shape-tools').querySelector('button'))?.focus();
  }
  $('palette-toggle').onclick=togglePalette;$('palette-close').onclick=()=>closePalette();
  document.addEventListener('pointerdown',event=>{if($('app').classList.contains('palette-open')&&!event.target.closest('#add-palette,#palette-toggle')){closePalette(false);if(event.target.closest('#stage')){event.preventDefault();event.stopPropagation();$('canvas').focus();}}},true);
  document.addEventListener('focusin',event=>{if($('app').classList.contains('palette-open')&&!event.target.closest('#add-palette,#palette-toggle'))closePalette(false);});
  document.addEventListener('keydown',event=>{if(event.key==='Escape'&&$('app').classList.contains('palette-open')){event.preventDefault();event.stopImmediatePropagation();closePalette();}},true);
  narrowPalette.addEventListener('change',()=>{const focused=$('add-palette').contains(document.activeElement);closePalette(false);if(narrowPalette.matches&&focused)$('palette-toggle').focus();});
  new ResizeObserver(()=>{$('app').style.setProperty('--toolbar-height',document.querySelector('.top').getBoundingClientRect().height+'px');}).observe(document.querySelector('.top'));

  let menuOpener,menuKind,hoverMenu=false,menuCloseTimer,ignoredHover=null;
  const submenus=[];
  const menuSurface=element=>element?.closest('#command-menu,.command-submenu');
  const menuItems=surface=>[...surface.querySelectorAll('button:not(:disabled)')].filter(button=>menuSurface(button)===surface);
  const menuContent=surface=>surface.querySelector(':scope > .menu-content');
  const menuTitle=kind=>({arrange:'整列','arrange-details':'整列の詳細',order:'重なり順',path:'アンカー・パス','selection-more':tool==='direct'?'その他の編集':'詳細','selection-transform':'変形','selection-combine':'図形の合成','selection-group':'グループ・固定'})[kind]||'メニュー';
  const caret=direction=>`<span class="menu-caret" aria-hidden="true">${direction==='right'?'▶':'▼'}</span>`;
  function closeSubmenus(from=0,focus=false){
    const removed=submenus.splice(from),opener=removed[0]?.opener;
    for(const entry of removed.reverse()){entry.opener?.setAttribute('aria-expanded','false');if(entry.element.matches(':popover-open'))entry.element.hidePopover();entry.element.remove();}
    if(focus&&opener?.isConnected){hoverMenu=false;ignoredHover=opener.matches(':hover')?opener:null;opener.focus();}
    renderArrangeReference();
  }
  function hideMenu(){
    clearTimeout(menuCloseTimer);closeSubmenus();
    if($('command-menu').matches(':popover-open'))$('command-menu').hidePopover();
    if(menuOpener)menuOpener.setAttribute('aria-expanded','false');hoverMenu=false;menuKind=null;$('arrange-reference').replaceChildren();
  }
  function positionSubmenu(entry){
    const {element,opener}=entry;if(!opener?.isConnected)return;
    const parent=menuSurface(opener),p=parent.getBoundingClientRect(),r=opener.getBoundingClientRect();
    element.style.maxHeight=Math.max(80,innerHeight-16)+'px';
    const box=element.getBoundingClientRect();
    const right=p.right+5,left=p.left-box.width-5;
    const beside=right+box.width<=innerWidth-8||left>=8;
    element.style.left=(right+box.width<=innerWidth-8?right:left>=8?left:Math.max(8,Math.min(p.left,innerWidth-box.width-8)))+'px';
    // 横に収まらない画面では親の上に重ね、戻るボタンで一段ずつ移動する。
    const top=beside?r.top:p.top+24;
    element.style.top=Math.max(8,Math.min(top,innerHeight-box.height-8))+'px';
  }
  function positionMenu(){
    if(!menuOpener||!$('command-menu').matches(':popover-open'))return;
    const r=menuOpener.getBoundingClientRect(),below=innerHeight-r.bottom-13,above=r.top-13,down=below>=Math.min(220,above);
    $('command-menu').style.maxHeight=Math.max(44,down?below:above)+'px';
    const m=$('command-menu').getBoundingClientRect();
    $('command-menu').style.left=Math.max(8,Math.min(r.left,innerWidth-m.width-8))+'px';
    $('command-menu').style.top=Math.max(8,down?r.bottom+5:r.top-m.height-5)+'px';
    submenus.forEach(positionSubmenu);
  }
  const actionIcons={'path-union':'union','path-subtract':'subtract','path-intersect':'intersect','anchor-add':'anchor-add','anchor-position':'anchor-position','anchor-corner':'anchor-corner','anchor-smooth':'anchor-smooth','selection-path':'path',outline:'outline',transform:'transform',copy:'copy',paste:'paste',duplicate:'duplicate',delete:'delete',group:'group',ungroup:'ungroup',lock:'lock','style-copy':'brush','style-paste':'paste','text-edit':'text','component-save':'group','connection-between':'connector','connection-convert':'path','selection-arrange':'arrange','selection-order':'layers',animations:'animation'};
  const actionSubmenus={'selection-path':'path','selection-arrange':'arrange','selection-order':'order'};
  function menuButton(label,action,disabled=false){
    const name=actionIcons[action]||(icons[action]?action:action.startsWith('order-')?'layers':null),child=actionSubmenus[action];
    return `<button data-action="${action}" ${child?`data-submenu="${child}" aria-haspopup="true" aria-expanded="false"`:''} ${disabled?'disabled':''}>${name?icon(name):''}<span>${label}</span>${child?caret('right'):''}</button>`;
  }
  function syncArrangeSelection(){
    const signature=JSON.stringify([doc().id,page().id,selected]);
    if(signature!==arrangeSelectionKey){arrangeKey=null;arrangeSelectionKey=signature;}
  }
  function arrangeContext(){
    syncArrangeSelection();
    const p=page(),units=Arrange.collect(p,selected,bounds);
    if(!units.some(u=>u.key===arrangeKey))arrangeKey=units[0]?.key;
    let reference=arrangeReference;
    if(units.length===1&&!p.board.infinite)reference='board';
    else if(reference==='board'&&p.board.infinite)reference='selection';
    return {units,reference,key:arrangeKey,board:p.board};
  }
  const arrangeButton=(mode,label,short,disabled)=>`<button type="button" data-action="align-${mode}" aria-label="${label}" data-tip="${label}" ${disabled?'disabled':''}>${icon('align-'+mode)}<span>${short}</span></button>`;
  function arrangeMenu(){
    const {units,reference,key}=arrangeContext(),unlocked=allUnlocked(),multiple=units.length>1;
    const disabled=!unlocked||!units.length||reference!=='board'&&!multiple;
    const directions=[['left','左にそろえる','左'],['center','左右中央にそろえる','左右中央'],['right','右にそろえる','右'],['top','上にそろえる','上'],['middle','上下中央にそろえる','上下中央'],['bottom','下にそろえる','下']].map(([mode,label,short])=>arrangeButton(mode,label,short,disabled)).join('');
    const spacing=[['distribute-x','左右に等間隔','左右等間隔'],['distribute-y','上下に等間隔','上下等間隔']].map(([mode,label,short])=>arrangeButton(mode,label,short,!unlocked||units.length<3)).join('');
    const basis=reference==='board'?'用紙':reference==='selection'?'選択範囲':'図形：'+(units.find(u=>u.key===key)?.label||'未選択');
    return `<div class="arrange-menu"><div class="arrange-heading">整列</div><p class="arrange-note">基準：${esc(basis)}</p><div class="arrange-actions" role="group" aria-label="整列と等間隔">${directions}${spacing}<button type="button" id="arrange-details-button" data-submenu="arrange-details" aria-label="整列の詳細" data-tip="整列の基準・大きさをそろえる" aria-haspopup="true" aria-expanded="false">${icon('details')}<span>詳細</span>${caret('right')}</button></div></div>`;
  }
  function arrangeDetailsMenu(){
    const {units,reference,key,board}=arrangeContext(),keyUnit=units.find(u=>u.key===key),multiple=units.length>1;
    const choices=[['board','用紙'],['selection','選択範囲'],['object','基準の図形']].map(([value,label])=>`<button type="button" data-arrange-reference="${value}" aria-pressed="${reference===value}" ${value==='board'?board.infinite?'disabled':'':!multiple?'disabled':''}>${label}</button>`).join('');
    const keySelect=`<label class="arrange-key">${reference==='object'?'基準の図形':'大きさの基準にする図形'}<select id="arrange-key" ${!multiple?'disabled':''}>${units.map((u,i)=>`<option value="${esc(u.key)}" ${u.key===key?'selected':''}>${i+1}. ${esc(u.label)}</option>`).join('')}</select></label>`;
    const sizes=[['width','幅をそろえる','幅'],['height','高さをそろえる','高さ'],['size','幅と高さをそろえる','幅と高さ']].map(([mode,label,short])=>arrangeButton(mode,label,short,!allUnlocked()||!multiple)).join('');
    return `<div class="arrange-heading">整列の基準</div><div class="arrange-basis" role="group" aria-label="整列の基準">${choices}</div>${board.infinite?'<p class="arrange-note">自由キャンバスでは用紙基準は使えません。</p>':''}${keySelect}${reference==='object'?'<p class="arrange-note">紫の枠の図形を動かさずにそろえます。</p>':''}<hr><div class="arrange-heading">大きさをそろえる</div><p class="arrange-note">基準：${esc(keyUnit?.label||'図形を選択してください')}</p><div class="arrange-actions" role="group" aria-label="大きさをそろえる">${sizes}</div><p class="arrange-note">等間隔は3つ以上の図形・グループで使えます。${reference==='board'?'用紙':'選択範囲'}の両端を基準にします。</p>`;
  }
  function renderArrangeReference(){
    const layer=$('arrange-reference');layer.replaceChildren();
    if(drag||!$('command-menu').matches(':popover-open')||![menuKind,...submenus.map(s=>s.kind)].includes('arrange'))return;
    const {units,reference,key}=arrangeContext(),unit=units.find(u=>u.key===key);
    if(reference!=='object'||!unit||units.length<2)return;
    const z=zoom(),b=unit.b,pad=4/z;
    layer.innerHTML=`<rect x="${b.x-pad}" y="${b.y-pad}" width="${b.width+pad*2}" height="${b.height+pad*2}" fill="none" stroke-width="${2/z}"/><rect class="arrange-reference-label" x="${b.x-pad}" y="${b.y-pad-19/z}" width="${32/z}" height="${18/z}" rx="${3/z}"/><text x="${b.x-pad+4/z}" y="${b.y-pad-6/z}" font-size="${12/z}">基準</text>`;
  }
  function refreshArrangeMenu(focus){
    for(const surface of [$('command-menu'),...submenus.map(s=>s.element)]){
      const kind=surface.dataset.menuKind;if(kind==='arrange'||kind==='arrange-details')menuContent(surface).innerHTML=buildMenu(kind);
    }
    for(const entry of submenus){
      if(!entry.opener.isConnected)entry.opener=menuItems(entry.element.parentElement).find(b=>b.dataset.submenu===entry.kind);
      entry.opener?.setAttribute('aria-expanded','true');
    }
    positionMenu();renderArrangeReference();
    const details=submenus.find(s=>s.kind==='arrange-details')?.element;
    if(focus==='key')$('arrange-key')?.focus();else details?.querySelector(`[data-arrange-reference="${focus}"]`)?.focus();
  }
  function buildMenu(kind){
    const selectedNone=!selected.length,objects=page().objects.filter(o=>selected.includes(o.id)),one=objects.length===1?objects[0]:null,unlocked=allUnlocked();
    const menus={
      save:()=>menuButton('ブラウザに保存','save-browser')+menuButton('ローカルファイルに保存…','save-local')+'<hr>'+menuButton(localAuto?.active?'ローカル自動保存を停止':'ローカル自動保存を開始…',localAuto?.active?'auto-stop':'auto-start'),
      open:()=>menuButton('保存した内容を選ぶ…','recovery')+menuButton('ファイルを開く…','open-file')+menuButton('SVGを追加する…','import-svg')+'<hr>'+menuButton('新しい作品…','new'),
      more:()=>{
        const hidden=selector=>!document.querySelector('.top '+selector)?.getClientRects().length;
        const tools=['select','pan'].filter(key=>hidden(`[data-tool="${key}"]`)).map(key=>`<button data-tool="${key}" aria-pressed="${key==='select'?selecting():tool===key}">${icon(key)}<span>${names[key]}</span></button>`).join('');
        const actions=menuButton('すべて選択','select-all',!page().objects.length)+menuButton('貼り付け','paste',!clipboard);
        const historyMenu=(hidden('[data-action="undo"]')?menuButton('元に戻す','undo',!history.canUndo):'')+(hidden('[data-action="redo"]')?menuButton('やり直し','redo',!history.canRedo):'');
        const pagesMenu=hidden('[data-action="pages"]')?menuButton('ページ一覧…','pages'):'';
        return [tools,actions,historyMenu,pagesMenu,hidden('#present-button')?menus.present():''].filter(Boolean).join('<hr>');
      },
      present:()=>menuButton('先頭から発表','present-start')+menuButton('このページから発表','present-current'),
      path:()=>pathUI.menu(menuButton,{includeCombine:tool==='direct'})+'<hr>'+menuButton('アウトライン化…','outline',!outlineAvailable()),
      'selection-transform':()=>menuButton('左右反転','flip-h',!unlocked)+menuButton('上下反転','flip-v',!unlocked)+'<hr>'+menuButton('左に90°回転','rotate-left',!unlocked)+menuButton('右に90°回転','rotate-right',!unlocked)+'<hr>'+menuButton('位置・拡大縮小・回転を指定…','transform',!unlocked),
      'selection-combine':()=>menuButton('合体','path-union',!unlocked)+menuButton('型抜き（最初の図形から）','path-subtract',!unlocked)+menuButton('重なりを残す','path-intersect',!unlocked),
      'selection-group':()=>{
        const groups=objects.length>1?menuButton('グループ化','group',!unlocked):'';
        const ungroup=objects.some(o=>o.group)?menuButton('グループ解除','ungroup',!unlocked):'';
        return groups+ungroup+(groups||ungroup?'<hr>':'')+menuButton(unlocked?'固定':'固定を解除','lock',selectedNone);
      },
      'selection-more':()=>{
        const direct=tool==='direct';
        const text=one&&(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)))?menuButton('文字を編集…','text-edit',!unlocked):'';
        const path=objects.some(o=>o.type==='path')?menuButton('アンカー・パスの操作','selection-path'):'';
        const grouping=direct?menuButton('グループ化','group',objects.length<2||!unlocked)+menuButton('グループ解除','ungroup',!objects.some(o=>o.group)||!unlocked)+menuButton('固定／固定解除','lock',selectedNone)+'<hr>':'';
        const specific=!direct&&one?.type==='image'?menuButton('画像の設定…','image-options'):!direct&&one?.type==='connector'?menuButton('接続・経路…','connection-options',!unlocked):'';
        return menuButton('コピー','copy',selectedNone)+menuButton('貼り付け','paste',!clipboard)+menuButton('複製','duplicate',selectedNone)+menuButton('削除','delete',!unlocked)+'<hr>'+grouping+menuButton('書式をコピー','style-copy',selectedNone)+menuButton('書式を適用','style-paste',!unlocked||!copiedStyle)+'<hr>'+(direct?menuButton('位置・大きさ・回転…','transform',!unlocked):'')+menuButton('整列','selection-arrange',selectedNone||!unlocked)+menuButton('重なり順','selection-order',!unlocked)+(direct?text+path:'')+specific+menuButton('アウトライン化…','outline',!outlineAvailable())+'<hr>'+menuButton('動きと再生順序…','animations')+(objects.length===2?menuButton('選択した2図形を接続','connection-between'):'')+menuButton('自作部品に登録…','component-save',selectedNone)+(one?.type==='connector'?menuButton('接続矢印を通常のパスに変換','connection-convert',!unlocked):'');
      },
      arrange:arrangeMenu,'arrange-details':arrangeDetailsMenu,
      order:()=>menuButton('最前面へ','order-front')+menuButton('1つ前へ','order-forward')+menuButton('1つ後ろへ','order-backward')+menuButton('最背面へ','order-back')
    };
    return (menus[kind]||menus.more)();
  }
  function openMenu(kind,opener,options={}){
    const was=$('command-menu').matches(':popover-open')&&menuOpener===opener&&menuKind===kind;
    if(was&&(options.hover||hoverMenu)){clearTimeout(menuCloseTimer);if(!options.hover){hoverMenu=false;menuItems($('command-menu'))[0]?.focus();}return;}
    hideMenu();if(was)return;menuOpener=opener;menuKind=kind;hoverMenu=!!options.hover;$('tooltip').hidden=true;
    $('command-menu').dataset.menuKind=kind;$('command-menu').innerHTML=`<div class="menu-content">${buildMenu(kind)}</div>`;$('command-menu').showPopover();opener.setAttribute('aria-expanded','true');
    positionMenu();renderArrangeReference();if(!options.hover)menuItems($('command-menu'))[0]?.focus();
  }
  function openSubmenu(opener,options={}){
    if(opener.disabled||!opener.isConnected||!$('command-menu').matches(':popover-open'))return;
    clearTimeout(menuCloseTimer);$('tooltip').hidden=true;
    const parent=menuSurface(opener),index=submenus.findIndex(s=>s.element===parent)+1,existing=submenus[index];
    // 起点のpointerdownでブラウザが子を閉じた直後は、toggle通知より先にclickが来る。
    if(existing?.opener===opener&&existing.element.matches(':popover-open')){
      if(options.hover)return;
      if(existing.hover){existing.hover=false;hoverMenu=false;menuItems(existing.element)[0]?.focus();return;}
      closeSubmenus(index,true);return;
    }
    closeSubmenus(index);
    const kind=opener.dataset.submenu,element=document.createElement('div');element.className='command-submenu';element.popover='auto';element.dataset.menuKind=kind;element.setAttribute('aria-label',menuTitle(kind));
    element.innerHTML=`<div class="submenu-heading"><button type="button" data-menu-back aria-label="${menuTitle(parent.dataset.menuKind)}へ戻る" data-tip="戻る Esc / ←">${icon('back')}</button><strong>${menuTitle(kind)}</strong></div><div class="menu-content">${buildMenu(kind)}</div>`;
    parent.append(element);
    const width=parseFloat(getComputedStyle(element).width),rect=parent.getBoundingClientRect();
    // 重ね表示をホバーで開くと、押そうとしたボタンを別の操作が覆ってしまう。
    if(options.hover&&rect.right+5+width>innerWidth-8&&rect.left-width-5<8){element.remove();return;}
    const entry={element,opener,kind,hover:!!options.hover};submenus.push(entry);element.showPopover();opener.setAttribute('aria-expanded','true');
    element.addEventListener('toggle',event=>{if(event.newState==='closed'){const i=submenus.indexOf(entry);if(i>=0)closeSubmenus(i);}});
    element.addEventListener('pointerenter',()=>clearTimeout(menuCloseTimer));element.addEventListener('pointerleave',deferHoverClose);
    positionSubmenu(entry);renderArrangeReference();if(!options.hover){hoverMenu=false;menuItems(element)[0]?.focus();}
  }
  window.addEventListener('resize',hideMenu);
  $('command-menu').addEventListener('toggle',event=>{if(event.newState==='closed'){closeSubmenus();menuOpener?.setAttribute('aria-expanded','false');}renderArrangeReference();});
  $('command-menu').addEventListener('click',event=>{
    const back=event.target.closest('[data-menu-back]');if(back){closeSubmenus(submenus.findIndex(s=>s.element===menuSurface(back)),true);return;}
    const button=event.target.closest('[data-arrange-reference]');if(!button||button.disabled)return;
    arrangeReference=button.dataset.arrangeReference;hoverMenu=false;refreshArrangeMenu(arrangeReference);
  });
  $('command-menu').addEventListener('change',event=>{if(event.target.id==='arrange-key'){arrangeKey=event.target.value;hoverMenu=false;refreshArrangeMenu('key');}});
  function deferHoverClose(){clearTimeout(menuCloseTimer);if(hoverMenu)menuCloseTimer=setTimeout(()=>{if(hoverMenu&&!$('command-menu').contains(document.activeElement))hideMenu();},240);}
  document.querySelectorAll('[data-menu]').forEach(button=>{
    button.setAttribute('aria-haspopup','true');button.setAttribute('aria-expanded','false');button.insertAdjacentHTML('beforeend',caret('down'));
    if($('selection-bar').contains(button)){
      button.addEventListener('pointerenter',event=>{if(button.disabled||event.pointerType!=='mouse'||event.buttons||drag||$('dialog').open||button===ignoredHover)return;openMenu(button.dataset.menu,button,{hover:true});});
      button.addEventListener('pointerleave',()=>{if(ignoredHover===button)ignoredHover=null;deferHoverClose();});
    }
    button.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(!$('command-menu').matches(':popover-open')||menuOpener!==button)openMenu(button.dataset.menu,button);hoverMenu=false;const items=menuItems($('command-menu'));(event.key==='ArrowUp'?items[items.length-1]:items[0])?.focus();});
  });
  $('command-menu').addEventListener('pointerover',event=>{
    const button=event.target.closest('[data-submenu]');if(!button||button.contains(event.relatedTarget)||event.pointerType!=='mouse'||event.buttons||drag||button===ignoredHover)return;
    openSubmenu(button,{hover:true});
  });
  $('command-menu').addEventListener('pointerout',event=>{const button=event.target.closest('[data-submenu]');if(button===ignoredHover&&!button?.contains(event.relatedTarget))ignoredHover=null;});
  $('command-menu').addEventListener('pointerenter',()=>clearTimeout(menuCloseTimer));
  $('command-menu').addEventListener('pointerleave',deferHoverClose);
  $('command-menu').addEventListener('focusin',()=>clearTimeout(menuCloseTimer));
  $('command-menu').addEventListener('focusout',deferHoverClose);
  $('command-menu').addEventListener('keydown',event=>{
    if(event.target.closest('select,input,textarea'))return;
    const surface=menuSurface(event.target),button=event.target.closest('[data-submenu]');
    if(event.key==='ArrowRight'&&button){event.preventDefault();event.stopPropagation();openSubmenu(button);return;}
    if(event.key==='ArrowLeft'&&surface!==$('command-menu')){event.preventDefault();event.stopPropagation();closeSubmenus(submenus.findIndex(s=>s.element===surface),true);return;}
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const items=menuItems(surface),i=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!$('command-menu').matches(':popover-open'))return;
    event.preventDefault();event.stopPropagation();
    if(submenus.length){closeSubmenus(submenus.length-1,true);return;}
    const focus=$('command-menu').contains(document.activeElement)||!hoverMenu;ignoredHover=menuOpener?.matches(':hover')?menuOpener:null;hideMenu();if(focus)menuOpener?.focus();
  },true);
  let dialogOpener,dialogCallback;
  function closeDialog(){if($('dialog').open)$('dialog').close();if(dialogOpener?.isConnected)dialogOpener.focus();else $('canvas').focus();}
  function showDialog(title,html,label,callback){if(inspectorPreview)inspector.reset();const focused=document.activeElement,opener=$('dialog').contains(focused)?dialogOpener:$('command-menu').contains(focused)?menuOpener:focused;hideMenu();if($('dialog').open)$('dialog').close();dialogOpener=opener;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog-error').hidden=true;$('dialog-submit').textContent=label||'適用';$('dialog-submit').hidden=!label;dialogCallback=callback;$('dialog').showModal();}
  $('dialog-close').onclick=$('dialog-cancel').onclick=closeDialog;
  $('dialog').addEventListener('cancel',()=>{setTimeout(()=>dialogOpener?.focus(),0);});
  $('dialog-form').onsubmit=async event=>{event.preventDefault();if(!dialogCallback){closeDialog();return;}const cb=dialogCallback;try{const result=cb();if(result?.then)await result;if(dialogCallback===cb)closeDialog();}catch(error){$('dialog-error').textContent=error.message;$('dialog-error').hidden=false;}};
  const inspectorSections={outline:['アウトライン化','outline'],text:['文字・配置','text'],style:['書式・色','style'],transform:['位置・大きさ','transform'],anchor:['アンカーの座標','path'],connection:['接続・経路','connector'],image:['画像の設定','image'],animation:['動きと再生順序','animation'],board:['用紙サイズ','board'],view:['表示と吸着','view'],pages:['ページ一覧','pages'],objects:['レイヤー','layers'],assets:['アイコン・部品','assets']};
  let inspectorTabsKey='';
  function inspectorScope(section){return JSON.stringify([revision,doc().id,pageId,['pages','board','view'].includes(section)?null:selected,section==='objects'?activeLayer():null,section==='anchor'?pathUI.getRefs():null,section==='view'?settings:null]);}
  function clearInspectorPreview(){if(inspectorPreview){inspectorPreview=null;render();}}
  function previewInspectorChange(fn){
    const next=C.clone(doc()),p=next.pages.find(v=>v.id===pageId);fn(p);L.reconcile(p,page(),activeLayer());K.sync(p);C.pruneAnimations(p);
    inspectorPreview=C.validateDocument(next).pages.find(v=>v.id===pageId);render();
  }
  function renderInspectorTabs(){
    if(!inspector)return;
    const one=selected.length===1?page().objects.find(o=>o.id===selected[0]):null;
    const global=['pages','objects','assets','board','view','animation'].includes(inspector.section);
    const sections=global?[]:selected.length?[one?.type==='image'?'image':'style','transform',...(one&&(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)))?['text']:[]),...(one?.type==='connector'?['connection']:pathUI.count()?['anchor']:[]),...(outlineAvailable()?['outline']:[])]:textUI?.hasDraft?['text']:[];
    $('inspector-tabs').hidden=!sections.length;
    $('inspector-panel').classList.toggle('global-settings',!sections.length);
    const key=sections.join(',');
    if(inspectorTabsKey!==key){inspectorTabsKey=key;$('inspector-tabs').innerHTML=sections.map(section=>`<button type="button" data-inspector-section="${section}" aria-label="${inspectorSections[section][0]}" data-tip="${inspectorSections[section][0]}">${icon(inspectorSections[section][1])}</button>`).join('');}
    $('inspector-tabs').querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.inspectorSection===inspector.section)));
    $('selection-bar').querySelectorAll('[data-action]').forEach(b=>{const section=({'connection-options':'connection','image-options':'image',animations:'animation','text-edit':'text'})[b.dataset.action]||b.dataset.action;if(inspectorSections[section])b.setAttribute('aria-pressed',String(inspector.isOpen&&inspector.section===section));});
  }
  function showInspector(section,title,html,label,apply,options={}){
    const focused=document.activeElement,opener=$('command-menu').contains(focused)?menuOpener:focused;hideMenu();
    const target=options.target||(section==='pages'?doc().pages.length+'ページ':['objects','assets','board','view','animation'].includes(section)?page().name:page().objects.filter(o=>selected.includes(o.id)).map(o=>o.name).join('、'));
    inspector.show({section,title,html:`<p class="inspector-target">${esc(target||'選択した図形')}</p>`+html,label,apply,auto:options.auto??(['text','style','transform','anchor','connection','image','board','view'].includes(section)&&label!=null),preview:options.preview,scope:()=>inspectorScope(section),refresh:options.refresh||(()=>openInspectorSection(section)),opener});
    renderInspectorTabs();
  }
  function openInspectorSection(section){
    objectsUI?.cancelDrag();
    if(section!=='text')textUI?.cancelDraft();
    clearInspectorPreview();
    const one=selected.length===1?page().objects.find(o=>o.id===selected[0]):null;
    if(section==='style'&&one?.type==='image')section='image';
    const needsSelection=['style','transform','anchor','connection','image','text','outline'].includes(section)&&!(section==='text'&&textUI?.hasDraft);
    const compatible=!needsSelection||selected.length&&(section!=='image'||one?.type==='image')&&(section!=='connection'||one?.type==='connector')&&(section!=='anchor'||pathUI.count())&&(section!=='text'||one&&(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d))));
    if(!compatible||needsSelection&&(section==='image'?!!L.layerOf(page(),one?.id)?.locked:!allUnlocked())){
      const message=!compatible?'対象の図形'+(section==='anchor'?'とアンカー':'')+'を選ぶと、ここで調整できます。':'固定された図形を含みます。「レイヤー」で図形やレイヤーの固定を解除すると調整できます。';
      showInspector(section,inspectorSections[section][0],`<p class="muted">${message}</p>`,null);return;
    }
    ({outline:()=>outlineUI.open(),text:()=>textUI.open(one),style:styleDialog,transform:transformDialog,board:boardDialog,view:viewDialog,image:imageDialog,connection:()=>connectionUI.dialog(),anchor:()=>pathUI.commands['anchor-position'](),animation:()=>animationUI.list(),pages:()=>pagesUI.open(),objects:()=>objectsUI.open(),assets:()=>assetsUI.open()})[section]?.();
  }
  function renameDialog(){showDialog('作品名',`<label>名前<input id="name-input" value="${esc(doc().name)}" maxlength="120" required></label>`,'変更',()=>{const name=$('name-input').value.trim();if(!name)throw Error('名前を入力してください。');change(d=>d.name=name);});}
  function checkReplace(next){
    if(!dirty()){next();return;}
    showDialog('作業中の変更を保存', '<p>今の作品には明示保存していない変更があります。</p><div class="list-actions"><button type="button" id="replace-save" class="primary">保存して開く</button><button type="button" id="replace-discard">保存せず開く</button></div>',null);
    $('replace-save').onclick=()=>{if(saveBrowser()){closeDialog();next();}};$('replace-discard').onclick=()=>{closeDialog();next();};
  }
  function replaceDocument(value){objectsUI?.cancelDrag();textUI?.cancelDraft();clearInspectorPreview();revision++;pathUI.reset();connectionUI.reset();const checked=C.validateDocument(value);checked.pages.forEach(p=>K.sync(p));history.replace(checked);pageId=doc().pages[0].id;selected=[];if(selecting())tool='select';edited=false;saveFingerprint=snapshot();clearTimeout(saveTimer);clearTimeout(toast.timer);$('toast').hidden=true;localAuto?.stop();$('save-status').textContent='読み込みました';fit();}
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
    showInspector('board','用紙サイズ',`<label>サイズ<select id="board-preset"><option value="custom">任意のサイズ</option>${Object.entries(presetLabels).map(([k,v])=>`<option value="${k}">${v}</option>`).join('')}</select></label><div class="fields"><label>幅<input id="board-width" type="number" min="0.01" step="any" required value="${round(b.width/unitScale(unit))}"></label><label>高さ<input id="board-height" type="number" min="0.01" step="any" required value="${round(b.height/unitScale(unit))}"></label></div><div class="fields"><label>単位<select id="board-unit">${['px','mm','pt'].map(u=>`<option ${u===unit?'selected':''}>${u}</option>`).join('')}</select></label><label>向き<button type="button" id="board-swap">タテ・ヨコを入れ替え</button></label></div><label class="check"><input id="board-infinite" type="checkbox" ${b.infinite?'checked':''}>自由に広がるキャンバス</label><p class="muted">用紙の変更で作品は拡大縮小されません。自由キャンバスの書き出し範囲は作品全体です。縦横とも72px以下の用紙では、1pxの方眼とピクセル吸着を有効にします。</p>`,'変更',event=>{
      const width=Number($('board-width').value)*unitScale(unit),height=Number($('board-height').value)*unitScale(unit);
      if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0||width>1e6||height>1e6)throw Error('幅と高さは0より大きく、1,000,000px以下にしてください。');
      changePage(p=>p.board={width,height,unit,infinite:$('board-infinite').checked});if((!event||event.type==='change'||event.type==='click')&&unit==='px'&&!$('board-infinite').checked&&Math.max(width,height)<=72){Object.assign(settings,{gridStep:1,pixelGrid:true,snapPixel:true,snap:false});applySettings();}fit();
    });
    $('board-preset').onchange=()=>{const key=$('board-preset').value;if(key==='custom')return;const p=C.boardPreset(key);unit=p.unit;$('board-unit').value=unit;$('board-width').value=round(p.width/unitScale(unit));$('board-height').value=round(p.height/unitScale(unit));$('board-infinite').checked=p.infinite;};
    $('board-unit').onchange=()=>{const next=$('board-unit').value;for(const k of ['board-width','board-height'])$(k).value=round(Number($(k).value)*unitScale(unit)/unitScale(next));unit=next;};
    $('board-swap').onclick=()=>{const w=$('board-width').value;$('board-width').value=$('board-height').value;$('board-height').value=w;};
  }
  function selectPage(id){
    if(!doc().pages.some(p=>p.id===id)||pageId===id)return;
    clearInspectorPreview();cancelDrag();pathUI.reset();connectionUI.reset();
    pageId=id;clearSelection();fit();
  }
  function flipSelection(horizontal){
    if(!editable())return;
    const ids=selected.slice(),b=bounds(ids),matrix=around([horizontal?-1:1,0,0,horizontal?1:-1,0,0],b.x+b.width/2,b.y+b.height/2);
    changePage(p=>C.transformObjects(p,ids,matrix));
  }
  function rotateSelection(clockwise){
    if(!editable())return;
    const ids=selected.slice(),b=bounds(ids),matrix=around(clockwise?[0,1,-1,0,0,0]:[0,-1,1,0,0,0],b.x+b.width/2,b.y+b.height/2);
    changePage(p=>C.transformObjects(p,ids,matrix));
  }
  function transformDialog(){
    if(!editable())return;const base=C.clone(page()),ids=selected.slice(),b=bounds(ids,base);
    function read(){
      const [x,y,w,h,a]=['x','y','width','height','angle'].map(k=>Number($('transform-'+k).value));if([x,y,w,h,a].some(v=>!Number.isFinite(v))||w<0||h<0||(b.width>0&&w===0)||(b.height>0&&h===0))throw Error('位置と大きさを確認してください。');
      const sx=b.width?w/b.width:1,sy=b.height?h/b.height:1;let m=C.multiply([sx,0,0,sy,x,y],[1,0,0,1,-b.x,-b.y]);
      const flip=[$('flip-x').checked?-1:1,0,0,$('flip-y').checked?-1:1,0,0];m=C.multiply(around(C.multiply(rotation(a*Math.PI/180),flip),x+w/2,y+h/2),m);
      const scaleStroke=$('scale-stroke').checked;return p=>{const next=C.clone(base);C.transformObjects(next,ids,m);if(scaleStroke)next.objects.filter(o=>ids.includes(o.id)).forEach(o=>o.style.strokeWidth*=Math.sqrt(Math.abs(sx*sy)));p.objects=C.clone(next.objects);};
    }
    showInspector('transform','選択した図形を変形',`<div class="fields"><label>左の位置（px）<input id="transform-x" type="number" step="any" value="${round(b.x)}" required></label><label>上の位置（px）<input id="transform-y" type="number" step="any" value="${round(b.y)}" required></label><label>幅（px）<input id="transform-width" type="number" min="0" step="any" value="${round(b.width)}" required></label><label>高さ（px）<input id="transform-height" type="number" min="0" step="any" value="${round(b.height)}" required></label></div><label>現在の向きから回転（°）<input id="transform-angle" type="number" step="any" value="0" required></label><label class="check"><input id="transform-ratio" type="checkbox">縦横比を保つ</label><div class="row"><label class="check"><input id="flip-x" type="checkbox">左右反転</label><label class="check"><input id="flip-y" type="checkbox">上下反転</label></div><label class="check"><input id="scale-stroke" type="checkbox">線幅も拡大縮小する</label>`,'適用',()=>changePage(read()),{preview:()=>previewInspectorChange(read())});
    for(const axis of ['width','height'])$('transform-'+axis).oninput=()=>{if(!$('transform-ratio').checked||!b.width||!b.height)return;const target=axis==='width'?'height':'width';$('transform-'+target).value=round(Number($('transform-'+axis).value)*b[target]/b[axis]);};
  }
  const palette=['#FFFFFF','#E2E8F0','#94A3B8','#475569','#172B4D','#000000','#FCA5A5','#EF4444','#F59E0B','#FDE047','#BEF264','#22C55E','#5EEAD4','#06B6D4','#93C5FD','#2563EB','#A78BFA','#EC4899'];
  function styleChoiceIcon(key,value){
    let drawing;
    if(key==='dash')drawing=`<path d="M2 12H34" stroke-width="2.5" stroke-linecap="butt" stroke-dasharray="${esc(value)}"/>`;
    else if(key==='linecap')drawing=`<path d="M10 12H26" stroke-width="8" stroke-linecap="${value}"/><path d="M10 2V22M26 2V22" stroke-width="1" opacity=".5"/>`;
    else drawing=`<path d="M6 21 18 6 30 21" stroke-width="7" stroke-linecap="butt" stroke-linejoin="${value}"/><path d="M6 21 18 6 30 21" stroke="var(--panel)" stroke-width="1" opacity=".6"/>`;
    return `<svg viewBox="0 0 36 24" aria-hidden="true" focusable="false">${drawing}</svg>`;
  }
  let styleChannelScope='',styleChannel='fill';
  function styleDialog(){
    if(selected.length===1&&page().objects.find(o=>o.id===selected[0])?.type==='image'){imageDialog();return;}
    if(!editable())return;
    const objects=page().objects.filter(o=>selected.includes(o.id)),ids=objects.map(o=>o.id),patch={};
    const supports=(o,key)=>{
      if(key==='opacity')return true;
      if(['fill','fillOpacity'].includes(key))return ['path','text'].includes(o.type);
      if(['fontSize','fontFamily','bold','italic'].includes(key))return ['text','connector'].includes(o.type);
      return o.type!=='image';
    };
    const targets=key=>objects.filter(o=>supports(o,key));
    const valueOf=(o,key)=>o.style[key]??(['fillOpacity','strokeOpacity'].includes(key)?1:undefined);
    const first=key=>valueOf(targets(key)[0],key);
    const mixed=key=>!(key in patch)&&targets(key).some(o=>valueOf(o,key)!==first(key));
    const value=key=>patch[key]??first(key),percent=key=>Math.round(value(key)*1000000)/10000;
    const channels=['fill','stroke'].filter(key=>targets(key).length);
    const channelNames={fill:objects.every(o=>o.type==='text')?'文字の塗り':'塗り',stroke:'線'};
    const channelScope=JSON.stringify([doc().id,pageId,ids]);
    let channel=styleChannelScope===channelScope&&channels.includes(styleChannel)?styleChannel:channels[0];
    styleChannelScope=channelScope;styleChannel=channel;
    const numeric=(key,label,min=0,max='')=>`<label>${label}<input id="style-${key}" data-style="${key}" type="number" min="${min}" ${max!==''?`max="${max}"`:''} step="any" ${mixed(key)?'placeholder="混在"':`required value="${key.endsWith('Opacity')||key==='opacity'?percent(key):value(key)}"`}></label>`;
    const smallBoard=Math.max(page().board.width,page().board.height)<=72;
    const widthMax=Math.max(smallBoard?4:20,...targets('strokeWidth').map(o=>o.style.strokeWidth));
    const slider=(key,label)=>{
      const width=key==='strokeWidth',current=width?value(key):percent(key);
      return `<div class="style-slider"><label id="style-${key}-label" for="style-${key}-range">${label}</label><div class="style-slider-row"><input id="style-${key}-range" data-style-range="${key}" type="range" min="0" max="${width?widthMax:100}" step="${width ? (smallBoard ? 0.01 : 0.1) : 1}" value="${current}" aria-labelledby="style-${key}-label"><input id="style-${key}" data-style="${key}" type="number" min="0" max="${width?C.LIMITS.coordinate:100}" step="any" aria-label="${label}を数値で指定" ${mixed(key)?'placeholder="混在"':`required value="${current}"`}></div></div>`;
    };
    const iconChoices=(key,label,choices)=>{
      if(!choices.some(([v])=>v===first(key)))choices=[...choices,[first(key),'カスタム']];
      return `<div class="style-choice"><div class="style-choice-heading"><span id="style-${key}-label">${label}</span><small id="style-${key}-state"></small></div><div class="style-choices" role="group" aria-labelledby="style-${key}-label">${choices.map(([v,name])=>`<button type="button" data-style-choice="${key}" data-style-value="${esc(v)}" data-style-name="${name}" aria-label="${label}：${name}" data-tip="${label}：${name}${name==='カスタム'?'（'+esc(v)+'）':''}" aria-pressed="${!mixed(key)&&v===value(key)}">${styleChoiceIcon(key,v)}</button>`).join('')}</div></div>`;
    };
    const choice=(key,label,choices)=>{
      if(!mixed(key)&&!choices.some(([v])=>v===value(key)))choices=[...choices,[value(key),'カスタム（'+value(key)+'）']];
      return `<label>${label}<select id="style-${key}" data-style="${key}">${mixed(key)?'<option value="__mixed" disabled selected>混在</option>':''}${choices.map(([v,name])=>`<option value="${esc(v)}" ${!mixed(key)&&v===value(key)?'selected':''}>${esc(name)}</option>`).join('')}</select></label>`;
    };
    const textObjects=targets('fontSize'),bulkText=textObjects.length>0&&objects.length>1,one=objects.length===1?objects[0]:null;
    const textLink=one&&(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)))?'<button type="button" data-inspector-section="text">文字・配置を編集</button>':one?.type==='connector'?'<button type="button" data-inspector-section="connection">ラベル・接続を編集</button>':'';
    function read(){
      if($('color-hex')&&$('color-hex').value!=='none'&&!/^#[0-9a-f]{6}$/i.test($('color-hex').value))throw Error('色は # と6桁の16進数で入力してください。');
      return p=>p.objects.filter(o=>ids.includes(o.id)).forEach(o=>{
        for(const [key,next] of Object.entries(patch))if(supports(o,key)&&valueOf(o,key)!==next)o.style[key]=next;
      });
    }
    if(!channels.length){
      showInspector('style','書式・色',numeric('opacity','画像全体の不透明度（%）',0,100),'適用',()=>changePage(read()));
      $('style-opacity').oninput=()=>{const input=$('style-opacity');if(input.value!==''&&input.checkValidity())patch.opacity=Number(input.value)/100;};return;
    }
    showInspector('style','書式・色',`
      <div class="color-tabs" role="group" aria-label="書式の対象">${channels.map(key=>`<button type="button" data-color-channel="${key}" aria-controls="style-paint" aria-pressed="${key===channel}">${channelNames[key]}</button>`).join('')}</div>
      <section id="style-paint" aria-label="${channelNames[channel]}の設定">
        <p id="mixed-color" class="muted"></p>
        <div class="swatches">${palette.map(v=>`<button type="button" data-color="${v}" style="--swatch:${v}" aria-label="色 ${v}"></button>`).join('')}</div>
        <div class="row"><button type="button" id="color-none">色なし</button><input id="color-picker" type="color" aria-label="自由な色を選択" style="flex:1"><input id="color-hex" aria-label="色の16進数" maxlength="7" pattern="#[0-9a-fA-F]{6}|none" required style="flex:1"></div>
        ${channels.includes('fill')?`<fieldset class="paint-fields" data-paint-fields="fill">${slider('fillOpacity','塗りの不透明度（%）')}</fieldset>`:''}
        <fieldset class="paint-fields" data-paint-fields="stroke">
          ${slider('strokeOpacity','線の不透明度（%）')}${slider('strokeWidth','線幅（px）')}
          ${iconChoices('dash','線の種類',[['','実線'],['6 4','破線'],['1 3','点線'],['10 3 2 3','一点鎖線']])}
          ${iconChoices('linecap','線の端',[['butt','平ら'],['round','丸い'],['square','四角い']])}
          ${iconChoices('linejoin','線の角',[['miter','角'],['round','丸い'],['bevel','面取り']])}
        <p id="style-line-note" class="muted"></p></fieldset>
      </section>
      <details id="style-overall" class="style-extra" ${mixed('opacity')||value('opacity')!==1?'open':''}><summary id="style-overall-summary"></summary>
        ${slider('opacity','全体の不透明度（%）')}<p class="muted">塗りと線をまとめて薄くします。${objects.some(o=>o.label&&o.type==='path')?'図形内の文字は別の書式です。':''}</p>
      </details>
      ${bulkText?`<details class="style-extra"><summary>文字の基本書式（${textObjects.length}個）</summary><div class="fields">${numeric('fontSize','文字サイズ（px）',.01)}${choice('fontFamily','書体',[['sans-serif','ゴシック'],['serif','明朝'],['monospace','等幅']])}</div><div class="row">${['bold','italic'].map(key=>`<label class="check"><input type="checkbox" id="style-${key}" data-style="${key}" ${value(key)?'checked':''}>${key==='bold'?'太字':'斜体'}</label>`).join('')}</div><p class="muted">選択中の文字・接続ラベルの基本書式に反映します。部分書式は、文字を1つ選んで「文字・配置」で編集します。</p></details>`:''}
      ${textLink?`<div class="style-text-link">${textLink}${one?.type==='text'?'<p class="muted">部分ごとの文字色・太字・斜体は「文字・配置」で編集します。</p>':''}</div>`:''}
      ${objects.some(o=>o.type==='image')?'<p class="muted">画像には全体の不透明度だけを反映します。</p>':''}
    `,'適用',()=>changePage(read()),{preview:()=>previewInspectorChange(read())});
    const body=$('inspector-body');
    function updateOverall(){$('style-overall-summary').textContent='全体の不透明度 · '+(mixed('opacity')?'混在':percent('opacity')+'%');}
    function updateColor(){
      const color=value(channel),hex=color==='none'?'#000000':color;
      $('color-picker').value=hex;$('color-hex').value=color;
      $('mixed-color').textContent=mixed(channel)?'複数の色が混在しています。色を選ぶとそろえます。':color==='none'?'色なし':color;
      body.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(!mixed(channel)&&b.dataset.color===color.toUpperCase())));
      $('style-line-note').textContent=channel==='stroke'?(value('stroke')==='none'?'線の色が「色なし」のため、線は表示されません。':value('strokeWidth')===0?'線幅が0のため、線は表示されません。':objects.some(o=>o.type==='connector')?'接続矢印では、矢じりとラベルにも線の色・不透明度を使います。':'線の端は開いたパスの両端、線の角は折れ曲がる部分に反映します。'):'';
    }
    function updateChannel(){
      body.querySelectorAll('[data-color-channel]').forEach(b=>{const on=b.dataset.colorChannel===channel;b.classList.toggle('on',on);b.setAttribute('aria-pressed',String(on));});
      body.querySelectorAll('[data-paint-fields]').forEach(el=>{el.hidden=el.dataset.paintFields!==channel;el.disabled=el.hidden;});
      $('style-paint').setAttribute('aria-label',channelNames[channel]+'の設定');updateColor();
    }
    function updateRange(key){
      const range=$('style-'+key+'-range');if(!range)return;
      const current=key==='strokeWidth'?value(key):percent(key);
      if(key==='strokeWidth')range.max=Math.max(Number(range.max),current);
      range.value=current;range.setAttribute('aria-valuetext',mixed(key)?'混在':current+(key==='strokeWidth'?' px':'%'));
      range.closest('.style-slider').classList.toggle('mixed',mixed(key));
    }
    function updateChoices(key){
      let name='混在';
      body.querySelectorAll(`[data-style-choice="${key}"]`).forEach(b=>{const on=!mixed(key)&&b.dataset.styleValue===value(key);b.setAttribute('aria-pressed',String(on));if(on)name=b.dataset.styleName;});
      $('style-'+key+'-state').textContent=name;
    }
    body.querySelectorAll('[data-color-channel]').forEach(b=>b.onclick=()=>{
      body.querySelectorAll('[data-paint-fields] input[type=number]').forEach(el=>{if(el.value===''||!el.checkValidity()){const key=el.dataset.style;el.value=mixed(key)?'':key.endsWith('Opacity')?percent(key):value(key);}});
      channel=b.dataset.colorChannel;styleChannel=channel;updateChannel();
    });
    body.querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{patch[channel]=b.dataset.color;updateColor();});
    $('color-none').onclick=()=>{patch[channel]='none';updateColor();};
    $('color-picker').oninput=()=>{patch[channel]=$('color-picker').value.toUpperCase();updateColor();};
    $('color-hex').oninput=()=>{if(/^#[0-9a-f]{6}$/i.test($('color-hex').value)){patch[channel]=$('color-hex').value.toUpperCase();updateColor();}};
    body.querySelectorAll('[data-style]').forEach(el=>{
      const key=el.dataset.style;if(el.type==='checkbox')el.indeterminate=mixed(key);
      el.oninput=el.onchange=()=>{
        if(el.type==='number'&&(el.value===''||!el.checkValidity()))return;
        patch[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)/(key.endsWith('Opacity')||key==='opacity'?100:1):el.value;
        if(el.type==='checkbox')el.indeterminate=false;
        updateOverall();updateRange(key);if(key==='strokeWidth')updateColor();
      };
    });
    body.querySelectorAll('[data-style-range]').forEach(range=>{
      const key=range.dataset.styleRange;updateRange(key);
      range.oninput=range.onchange=()=>{const number=$('style-'+key);number.value=range.value;number.oninput();};
    });
    body.querySelectorAll('[data-style-choice]').forEach(button=>{
      const key=button.dataset.styleChoice;updateChoices(key);
      button.onclick=()=>{patch[key]=button.dataset.styleValue;updateChoices(key);};
    });
    updateChannel();updateOverall();
  }
  function viewDialog(){showInspector('view','表示設定',`<label>テーマ<select id="view-theme"><option value="auto">自動</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label><label>操作部の文字サイズ<select id="view-size"><option value="standard">標準</option><option value="large">大</option><option value="xlarge">特大</option></select></label><label class="check"><input id="view-guides" type="checkbox" ${settings.smartGuides?'checked':''}>図形・用紙への位置合わせガイドと吸着</label><label class="check"><input id="view-grid" type="checkbox" ${settings.grid?'checked':''}>作図用グリッド（点）を表示</label><label class="check"><input id="view-pixel-grid" type="checkbox" ${settings.pixelGrid?'checked':''}>ピクセルの方眼を表示（拡大時・1px）</label><label class="check"><input id="view-snap" type="checkbox" ${settings.snap?'checked':''}>指定間隔のグリッドに吸着</label><label class="check"><input id="view-pixel" type="checkbox" ${settings.snapPixel?'checked':''}>図形・アンカー・ハンドルをピクセルに吸着</label><label class="check"><input id="view-anchor" type="checkbox" ${settings.snapAnchor?'checked':''}>他のアンカーに吸着</label><label class="check"><input id="view-path" type="checkbox" ${settings.snapPath?'checked':''}>他のパスの上に吸着</label><label>グリッドの間隔（px）<input id="view-step" type="number" min="0.01" max="10000" step="any" required value="${Number(settings.gridStep)||20}"></label><p class="muted">拡大すると1pxの方眼を表示します。画像や印刷には入りません。両方の吸着を選ぶと指定間隔を優先し、目盛りに合う位置へそろえます。曲線のハンドルも同じ間隔に吸着します。Optionで吸着を一時解除、Shift＋矢印キーで10倍移動。数値入力では指定値、Shiftでの拡大縮小では縦横比、図形への接続では輪郭の位置を保ちます。</p>`,'適用',()=>{settings={...settings,theme:$('view-theme').value,size:$('view-size').value,grid:$('view-grid').checked,pixelGrid:$('view-pixel-grid').checked,snap:$('view-snap').checked,snapPixel:$('view-pixel').checked,snapAnchor:$('view-anchor').checked,snapPath:$('view-path').checked,smartGuides:$('view-guides').checked,gridStep:Number($('view-step').value)};applySettings();});$('view-theme').value=settings.theme;$('view-size').value=settings.size;}
  function align(mode){
    if(!editable())return;
    const context=arrangeContext(),transforms=Arrange.plan(context.units,mode,context);
    if(transforms.length)changePage(p=>transforms.forEach(({ids,matrix})=>C.transformObjects(p,ids,matrix)));
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
  function insertObjects(objects){if(!canInsert())return;if(changePage(p=>p.objects.push(...objects))){selected=objects.map(o=>o.id);setTool('select');}}
  $('image-input').onchange=async()=>{
    const file=$('image-input').files[0];$('image-input').value='';if(!file||!canInsert())return;const targetDoc=doc().id,targetPage=pageId,targetLayer=activeLayer(),center={x:camera.x+camera.width/2,y:camera.y+camera.height/2},board=C.clone(page().board);
    try{const image=await A.imageFromFile(file,{maxWidth:board.width*.8,maxHeight:board.height*.8});image.x=center.x-image.width/2;image.y=center.y-image.height/2;if(doc().id!==targetDoc||!doc().pages.some(p=>p.id===targetPage))throw Error('作品が切り替わったため、画像をもう一度選んでください。');if(change(d=>{const p=d.pages.find(p=>p.id===targetPage),layer=L.list(p).find(l=>l.id===targetLayer);if(!layer||!layer.visible||layer.locked)throw Error('下絵の追加先レイヤーを表示し、固定を解除してください。');p.objects.unshift(image);if(p.layers)layer.objectIds.unshift(image.id);})){pageId=targetPage;selected=[image.id];setTool('select');toast('下絵を追加しました。位置は固定、書き出し・発表では非表示です。「画像の設定」で変更できます。');}}catch(error){toast(errorMessage(error));}
  };
  function imageDialog(){
    const o=page().objects.find(o=>o.id===selected[0]&&o.type==='image');if(!o||selected.length!==1)return;
    function read(){const opacity=Number($('image-opacity').value)/100;if(!Number.isFinite(opacity)||opacity<0||opacity>1)throw Error('不透明度は0〜100%で指定してください。');return p=>{const image=p.objects.find(v=>v.id===o.id);image.name=$('image-name').value;image.locked=$('image-locked').checked;image.reference=!$('image-output').checked;image.style.opacity=opacity;};}
    showInspector('image','画像の設定',`<label>名前<input id="image-name" maxlength="120" value="${esc(o.name)}"></label><label>不透明度（%）<input id="image-opacity" type="number" required min="0" max="100" value="${o.style.opacity*100}"></label><label class="check"><input id="image-locked" type="checkbox" ${o.locked?'checked':''}>位置と大きさを固定する</label><label class="check"><input id="image-output" type="checkbox" ${!o.reference?'checked':''}>画像として書き出し・印刷・発表にも含める</label><p class="muted">下絵は編集用ファイルに保存されます。固定を解除すると移動・拡大縮小できます。画像自体の輪郭はパスにはなりません。</p>`,'適用',()=>changePage(read()),{preview:()=>previewInspectorChange(read())});
  }
  function present(fromStart){const focused=document.activeElement,opener=$('command-menu').contains(focused)?menuOpener:focused;hideMenu();cancelDrag();connectionUI.reset();window.IlapoPresentation.open(doc(),{pageId:fromStart?doc().pages[0].id:pageId,opener});}
  let playbackBusy=false;
  async function exportPlayback(){
    if(playbackBusy)return;playbackBusy=true;
    const frozen=C.clone(doc());document.querySelectorAll('[data-action=export-playback]').forEach(b=>b.disabled=true);
    try{const html=await window.IlapoPlaybackExport.buildHTML(frozen);download(html,fileName(frozen.name,'.play.html'),'text/html');toast('すべてのページを再生用HTMLへ保存しました。ファイルだけで再生できます。');}
    finally{playbackBusy=false;document.querySelectorAll('[data-action=export-playback]').forEach(b=>b.disabled=false);}
  }
  function moveHistory(redo,keepSelection=false){
    if(!(redo?history.canRedo:history.canUndo))return;
    clearInspectorPreview();revision++;history[redo?'redo':'undo']();pageId=page().id;
    selected=keepSelection?selected.filter(id=>page().objects.some(o=>o.id===id&&isVisible(o))):[];if(!selected.length)clearSelection();edited=true;queueSave();render();
  }
  const commands={
    animations:()=>openInspectorSection('animation'),'animation-add':()=>animationUI.edit(),'export-playback':exportPlayback,
    assets:()=>openInspectorSection('assets'),'component-save':()=>assetsUI.focusRegistration(),'import-image':()=>$('image-input').click(),'image-options':()=>openInspectorSection('image'),
    'connection-tool':()=>setTool('connector'),'connection-orthogonal-tool':()=>setTool('connector-orthogonal'),'connection-options':()=>openInspectorSection('connection'),'connection-between':()=>connectionUI.addBetween(),'connection-convert':()=>connectionUI.convert(),
    'present-start':()=>present(true),'present-current':()=>present(false),
    rename:renameDialog,artboard:()=>openInspectorSection('board'),pages:()=>openInspectorSection('pages'),objects:()=>openInspectorSection('objects'),transform:()=>openInspectorSection('transform'),style:()=>openInspectorSection('style'),'view-dialog':()=>openInspectorSection('view'),
    'save-browser':saveBrowser,'save-local':saveLocal,recovery:recoveryDialog,'open-file':()=>{$('file-input').accept='.zip,.json,.svg';$('file-input').click();},'import-svg':()=>{$('file-input').accept='.svg';$('file-input').click();},
    new:()=>checkReplace(()=>{const d=C.createDocument();d.name='無題の作品';d.pages[0].board=C.boardPreset('16:9');replaceDocument(d);$('save-status').textContent='新しい作品';}),
    'auto-start':async()=>{if(!localAuto){toast('ローカル自動保存を利用できません。');return;}try{await localAuto.start(doc());}catch(error){if(error.name!=='AbortError')toast(errorMessage(error));}},'auto-stop':()=>localAuto?.stop(),
    undo:()=>moveHistory(false),redo:()=>moveHistory(true),
    'select-all':()=>selection(page().objects.map(o=>o.id)),copy,paste,duplicate:()=>{if(!selected.length)return;let ids;if(changePage(p=>ids=C.duplicateObjects(p,selected,standardSize()*.12,standardSize()*.12)))selected=ids;render();},
    delete:()=>{if(editable())changePage(p=>C.removeObjects(p,selected));},group:()=>{if(editable())changePage(p=>C.groupObjects(p,selected));},ungroup:()=>{if(editable())changePage(p=>C.ungroupObjects(p,selected));},
    lock:()=>{if(selected.some(id=>L.layerOf(page(),id)?.locked)){toast('「レイヤー」でレイヤーの固定を解除してください。');return;}const lock=allUnlocked();changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.locked=lock));},
    'flip-h':()=>flipSelection(true),'flip-v':()=>flipSelection(false),'rotate-left':()=>rotateSelection(false),'rotate-right':()=>rotateSelection(true),
    'text-edit':()=>openInspectorSection('text'),outline:()=>openInspectorSection('outline'),
    'style-copy':()=>{if(selected.length){copiedStyle=C.clone(page().objects.find(o=>o.id===selected[0]).style);toast('書式をコピーしました。');}},'style-paste':()=>{if(copiedStyle&&editable())changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>{if(o.type==='image')o.style.opacity=copiedStyle.opacity;else o.style=C.clone(copiedStyle);}));},
    fit,'zoom-in':()=>zoomAt(1.25),'zoom-out':()=>zoomAt(.8),'zoom-reset':()=>zoomAt(1/zoom()),
    'board-toggle':()=>toggleInspector('board'),
    'view-toggle':()=>toggleInspector('view'),
    'animation-toggle':()=>toggleInspector('animation'),
    'assets-toggle':()=>inspector.isOpen&&inspector.section==='assets'?inspector.close():openInspectorSection('assets'),
    'objects-toggle':()=>inspector.isOpen&&inspector.section==='objects'?inspector.close():openInspectorSection('objects'),
    'pages-toggle':()=>inspector.isOpen&&inspector.section==='pages'?inspector.close():openInspectorSection('pages'),
    'selection-path':()=>openMenu('path',$('selection-more')),'selection-arrange':()=>openMenu('arrange',$('selection-more')),'selection-order':()=>openMenu('order',$('selection-more')),
    'export-toggle':()=>{const opening=$('export-panel').hidden;if(opening)inspector.close({focus:false});$('export-panel').hidden=!opening;document.querySelector('.side-tab [data-action=export-toggle]').setAttribute('aria-expanded',String(opening));render();help?.refresh();},
    'export-svg':()=>{download(S.exportPage(page(),exportOptions()),fileName(doc().name+'_'+page().name,'.svg'),'image/svg+xml');toast('SVGを書き出しました。');},
    'export-png':exportBitmap,
    'export-pdf':async()=>{const pages=C.clone($('print-range').value==='all'?doc().pages:[page()]);await E.print(pages,{title:doc().name});}
  };
  function toggleInspector(section){if(inspector.isOpen&&inspector.section===section)inspector.close();else openInspectorSection(section);}
  function execute(action){hideMenu();closePalette(false);objectsUI?.cancelDrag();if(inspectorPreview)inspector.reset();cancelDrag();try{if(action.startsWith('align-'))align(action.slice(6));else if(action.startsWith('order-')){if(editable())changePage(p=>C.reorderObjects(p,selected,action.slice(6)));}else if(pathUI.commands[action])pathUI.commands[action]();else {const result=commands[action]?.();if(result?.catch)result.catch(error=>toast(errorMessage(error)));}}catch(error){toast(errorMessage(error));}}
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.inspectorSection)openInspectorSection(button.dataset.inspectorSection);else if(button.dataset.tool)setTool(button.dataset.tool);else if(button.dataset.menu)openMenu(button.dataset.menu,button);else if(button.dataset.submenu)openSubmenu(button);else if(button.dataset.action)execute(button.dataset.action);});
  document.addEventListener('keydown',event=>{
    if(inspector?.root.contains(event.target)||help?.root.contains(event.target)||event.isComposing||event.target.closest('input,textarea,select,[contenteditable=true],.ilapo-present-dialog')||$('dialog').open)return;
    if(['Alt','Shift'].includes(event.key)&&drag?.lastPoint){updateSelectionDrag(drag.lastPoint,event);render();}
    if(event.key==='Escape'){if(drag)cancelDrag();else if($('command-menu').matches(':popover-open')){hideMenu();menuOpener?.focus();}else if(!connectionUI.keyboard(event)&&!pathUI.keyboard(event)){clearSelection();}space=false;render();return;}
    const mod=event.metaKey||event.ctrlKey,key=event.key.toLowerCase();
    if(mod){const map={s:'save-browser',o:'recovery',z:event.shiftKey?'redo':'undo',a:'select-all',c:'copy',v:'paste',d:'duplicate'};if(map[key]){event.preventDefault();execute(map[key]);}return;}
    if(event.target.closest('button')&&[' ','Enter'].includes(event.key))return;
    if(event.key===' '){event.preventDefault();space=true;render();return;}
    if(connectionUI.keyboard(event)||pathUI.keyboard(event)){event.preventDefault();return;}
    if(event.key==='Delete'||event.key==='Backspace'){event.preventDefault();execute('delete');}
    else if(event.key.startsWith('Arrow')&&selected.length&&!event.target.closest('button')){event.preventDefault();if(editable()){const n=(event.shiftKey?10:1)*(Grid.step(settings,event)||(page().board.width<100?.1:1));const dx=event.key==='ArrowLeft'?-n:event.key==='ArrowRight'?n:0,dy=event.key==='ArrowUp'?-n:event.key==='ArrowDown'?n:0;if(tool==='direct'&&page().objects.some(o=>selected.includes(o.id)&&o.type==='path')){if(!pathUI.nudge(dx,dy,event))toast('動かす点を選ぶか「全体を選択」に切り替えてください。');}else {const delta=Grid.nudgeDelta(bounds(selected),{x:dx,y:dy},settings,event);changePage(p=>C.transformObjects(p,selected,[1,0,0,1,delta.x,delta.y]));}}}
    else if(event.key==='?')help?.open();else if(key==='a')setTool('direct');else if(key==='v')setTool('select');else if(key==='h')setTool('pan');else if(key==='t')setTool('text');else if(key==='r')setTool('rect');else if(key==='e')setTool('ellipse');
  });
  document.addEventListener('keyup',event=>{if(['Alt','Shift'].includes(event.key)&&drag?.lastPoint){updateSelectionDrag(drag.lastPoint,event);render();}if(event.key===' '){space=false;render();}});window.addEventListener('blur',()=>{space=false;cancelDrag();});
  window.addEventListener('beforeunload',event=>{if(dirty()||writeInProgress||localAuto?.pending){event.preventDefault();event.returnValue='';}});
  matchMedia('(prefers-color-scheme: dark)').addEventListener('change',()=>{if(settings.theme==='auto')applySettings();});
  if(window.IlapoLocalAutosave)localAuto=new IlapoLocalAutosave({encode:S.encodeProject,onStatus:status=>{if(status.state==='error')toast('ローカル自動保存を停止しました。'+status.message);else if(status.state==='saved')$('save-status').textContent='ローカルへ自動保存済み';}});
  try{help=window.JohoToolHelp?.create({root:$('operation-help'),opener:$('help-button'),title:'イラストスライドの使い方',storageKey:'kaijo-ilapo:help',bounds:()=>({top:document.querySelector('.top').getBoundingClientRect().bottom+8,bottom:$('stage').getBoundingClientRect().bottom-8}),isBusy:()=>!!drag,returnToEditor:()=>$('canvas').focus()});}catch(error){console.warn('Help unavailable',error);}
  function showTooltip(target){if(!target||target===menuOpener&&$('command-menu').matches(':popover-open')||target.dataset.submenu&&target.getAttribute('aria-expanded')==='true')return;const r=target.getBoundingClientRect();$('tooltip').textContent=target.dataset.tip;$('tooltip').hidden=false;$('tooltip').style.left=Math.max(8,Math.min(r.left,innerWidth-$('tooltip').offsetWidth-8))+'px';$('tooltip').style.top=Math.min(r.bottom+7,innerHeight-$('tooltip').offsetHeight-8)+'px';}
  const hideTooltip=()=>$('tooltip').hidden=true;
  document.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')showTooltip(event.target.closest('[data-tip]'));});
  document.addEventListener('focusin',event=>{hideTooltip();if(event.target.matches(':focus-visible'))showTooltip(event.target.closest('[data-tip]'));});
  document.addEventListener('focusout',hideTooltip);document.addEventListener('pointerout',hideTooltip);document.addEventListener('pointerdown',hideTooltip,true);
  pathUI=window.IlapoPathUI.create({page,isVisible,isLocked,canInsert,selected:()=>selected,tool:()=>tool,settings:()=>settings,zoom,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,errorMessage,showDialog,showInspector,esc,round,standardSize});
  connectionUI=window.IlapoConnectorUI.create({page,isVisible,isLocked,canInsert,selected:()=>selected,tool:()=>tool,zoom,snap,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,clearToast:()=>{clearTimeout(toast.timer);$('toast').hidden=true;},showInspector,previewChange:previewInspectorChange,esc,round,standardSize});
  animationUI=window.IlapoAnimationUI.create({document:doc,page,selected:()=>selected,changePage,toast,showInspector,esc,standardSize,palette});
  textUI=window.IlapoTextUI.create({document:doc,page,selected:()=>selected,select:selection,showInspector,changePage,previewChange:previewInspectorChange,clearPreview:clearInspectorPreview,isOpen:()=>!!inspector?.isOpen&&inspector.section==='text',esc,icon,palette,standardSize,toast});
  outlineUI=window.IlapoOutlineUI.create({page,isVisible,isLocked,selected:()=>selected,scope:()=>inspectorScope('outline'),isOpen:()=>!!inspector?.isOpen&&inspector.section==='outline',showInspector,changePage,previewChange:previewInspectorChange,clearPreview:clearInspectorPreview,esc,finish:ids=>{pathUI.reset();connectionUI.reset();selection(ids);setTool('select');inspector.close();render();}});
  objectsUI=window.IlapoObjectsUI.create({document:doc,page,activeLayer,setActiveLayer,isVisible,isLocked,toast,selected:()=>selected,select:selection,showInspector,changePage,showDialog,execute,isBusy:()=>!!drag,esc,icon});
  pagesUI=window.IlapoPagesUI.create({document:doc,page,selectPage,change,showInspector,showDialog,esc,icon});
  assetsUI=window.IlapoAssetsUI.create({document:doc,page,selected:()=>selected,library,insertionPoint,insertObjects,showInspector,showDialog,isOpen:()=>inspector?.isOpen&&inspector.section==='assets',esc,icon,toast,download});
  inspector=window.IlapoInspector.create({onHistory:redo=>moveHistory(redo,true),onLayout:()=>{render();help?.refresh();},clearPreview:clearInspectorPreview,isBusy:()=>!!drag||objectsUI?.isDragging});
  window.IlapoEditor=Object.freeze({getAnchors:()=>pathUI.getRefs(),getDocument:()=>C.clone(doc()),getSelection:()=>selected.slice(),getCamera:()=>({...camera}),getState:()=>({tool,dirty:dirty(),pageId,activeLayerId:activeLayer()})});
  applySettings();requestAnimationFrame(()=>{fit();if(store?.list().length)recoveryDialog();});
}());
