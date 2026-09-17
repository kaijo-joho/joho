/* illustSlide: 編集画面。作品、表示、選択、保存候補はそれぞれ独立して管理する。 */
(function () {
  'use strict';
  const C = window.IlapoCore, S = window.IlapoSVG, G = window.IlapoGeometry, E = window.IlapoExport, K=window.IlapoConnectors, A=window.IlapoAssets, Guides=window.IlapoGuides, Grid=window.IlapoGrid;
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
    edit:'m4 16 12-12 4 4L8 20l-5 1zM14 6l4 4',image:'M3 3h18v18H3zM3 16l5-6 4 5 3-3 6 7M15 7h.01',
    arrange:'M4 2v20M8 5h12v5H8zM8 14h8v5H8z',animation:'m10 6 9 6-9 6zM3 7h3M1 12h5M3 17h3',
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
  if (!C || !S || !G || !E || !K || !A || !Guides || !Grid || !window.IlapoPathEdit || !window.IlapoPathUI || !window.IlapoConnectorUI || !window.IlapoPresentation || !window.IlapoAnimation || !window.IlapoAnimationPlayer || !window.IlapoAnimationUI || !window.IlapoPlaybackExport || !window.IlapoInspector || !window.IlapoPagesUI || !window.IlapoObjectsUI || !window.IlapoObjectsModel || !window.IlapoAssetsUI || !window.IlapoTextUI || !window.IlapoTextLayout || !window.IlapoOutline || !window.IlapoOutlineUI || !window.IlapoStrokeOutline || !window.IlapoTextOutline) { $('hint').textContent='必要なファイルを読み込めませんでした。ページを再読み込みしてください。'; return; }
  const initial=C.createDocument(); initial.name='無題の作品'; initial.pages[0].board=C.boardPreset('16:9');
  const history=new C.History(initial);
  let pageId=initial.pages[0].id, selected=[], tool='select', drag=null, preview=null, clipboard=null, copiedStyle=null;
  let camera={x:0,y:0,width:1280,height:720}, saveTimer, saveFingerprint=JSON.stringify(initial), edited=false, store, localAuto, help, space=false, renderPending=false, writeInProgress=false;
  let pathUI,connectionUI,animationUI,pagesUI,objectsUI,assetsUI,textUI,outlineUI,library,inspector,inspectorPreview=null,revision=0;
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
  function snap(p,event) { return Grid.point(p,settings,event); }
  function bounds(ids,p=drawPage()) {
    const boxes=p.objects.filter(o=>ids.includes(o.id)).map(o=>G.bounds(o));
    if(!boxes.length) return {x:0,y:0,width:1,height:1};
    const x=Math.min(...boxes.map(b=>b.x)),y=Math.min(...boxes.map(b=>b.y));
    return {x,y,width:Math.max(...boxes.map(b=>b.x+b.width))-x,height:Math.max(...boxes.map(b=>b.y+b.height))-y};
  }
  function selection(ids) { const known=[...new Set(ids.filter(id=>page().objects.some(o=>o.id===id)))];selected=[...new Set([...known,...C.expandSelection(page(),known)])]; render(); }
  const selecting=()=>tool==='select'||tool==='direct';
  function clearSelection(){selected=[];pathUI.reset();connectionUI.reset();if(selecting())tool='select';}
  function outlineAvailable(){const info=window.IlapoOutline.inspect(page(),selected);return !!(info.lines||info.text)&&!info.locked;}
  function allUnlocked() { return !page().objects.some(o=>selected.includes(o.id)&&o.locked); }
  function editable() { if(!selected.length)return false; if(!allUnlocked()){toast('固定された図形を含むため、先に固定を解除してください。');return false;} return true; }
  function change(fn) {
    const before=snapshot();
    try { history.change(d=>{fn(d);d.pages.forEach(p=>K.sync(p));},{group:inspector?.changeGroup}); pageId=page().id; selected=selected.filter(id=>page().objects.some(o=>o.id===id)); if(before!==snapshot()){revision++;edited=true;queueSave();} render(); return before!==snapshot(); }
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
    inspector?.sync();
    if(preview)K.sync(preview);
    const p=drawPage(); $('canvas').setAttribute('viewBox',`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);
    $('canvas').dataset.tool=tool==='pan'||space?'pan':pathUI?.context().adding?'draw':['select','direct'].includes(tool)?'select':'draw';
    const art=p.board.infinite?{x:camera.x,y:camera.y,width:camera.width,height:camera.height}:{x:0,y:0,width:p.board.width,height:p.board.height};
    for(const [key,value] of Object.entries(art)){$('paper').setAttribute(key,value);$('grid').setAttribute(key,value);$('pixel-grid').setAttribute(key,value);}
    const interval=Math.max(.01,Number(settings.gridStep)||20),visibleStep=interval*zoom()<7?interval*Math.ceil(7/(interval*zoom())):interval;
    $('grid-pattern').setAttribute('width',visibleStep);$('grid-pattern').setAttribute('height',visibleStep);$('grid-pattern').firstElementChild.setAttribute('r',.7/zoom());$('grid').style.display=settings.grid&&!(settings.pixelGrid&&zoom()>=8&&interval===1)?'':'none';
    $('pixel-pattern').firstElementChild.setAttribute('stroke-width',.8/zoom());$('pixel-grid').style.display=settings.pixelGrid&&zoom()>=8?'':'none';
    $('artwork').innerHTML=p.objects.map(o=>`<g data-object="${esc(o.id)}" aria-label="${esc(o.name)}">${o.type==='connector'?`<path d="${K.renderedParts(o)[0].d}" fill="none" stroke="transparent" stroke-width="${16/zoom()}"/>`:''}${S.objectMarkup(o)}</g>`).join('');
    $('welcome').hidden=!!p.objects.length||!!drag; $('selection-bar').hidden=!selected.length||!!drag;
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
    $('alignment-guides').innerHTML=Guides.markup(drag?.alignment,zoom(),p.board.unit);
  }
  function renderSelectionActions(p){
    const objects=p.objects.filter(o=>selected.includes(o.id)),one=objects.length===1?objects[0]:null;
    const paths=objects.filter(o=>o.type==='path'),combine=paths.length>1&&paths.length===objects.length;
    const points=!combine&&tool==='direct'&&pathUI.count()>0,unlocked=allUnlocked();
    const canDirect=paths.length>0||one?.type==='connector';
    $('whole-mode').hidden=!canDirect||tool!=='direct';$('direct-mode').hidden=!canDirect||tool==='direct';
    $('selection-bar').dataset.mode=tool==='direct'?'direct':'whole';
    for(const key of ['union','subtract','intersect']){$('quick-'+key).hidden=!combine;$('quick-'+key).disabled=!unlocked;}
    $('quick-add-anchor').hidden=!one||one.type!=='path';$('quick-add-anchor').disabled=!unlocked;
    $('quick-add-anchor').setAttribute('aria-pressed',String(!!pathUI.context?.().adding));
    for(const key of ['corner','smooth']){$('quick-anchor-'+key).hidden=!points;$('quick-anchor-'+key).disabled=!unlocked;}
    $('path-menu-button').hidden=!one||one.type!=='path';
    $('connection-options').hidden=one?.type!=='connector';$('image-options').hidden=one?.type!=='image';
    $('style-button').hidden=points||one?.type==='image';$('style-button').disabled=!unlocked;
    $('text-options').hidden=points||!one||!(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)));
    $('text-options').disabled=!unlocked;
    const bar=$('selection-bar');
    bar.querySelector('[data-menu=edit]').hidden=!!points;
    bar.querySelector('[data-action=transform]').hidden=true;
    bar.querySelectorAll('.selection-extra').forEach(button=>button.hidden=true);
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
  function setTool(value){closePalette(false);objectsUI?.cancelDrag();cancelDrag();if(tool!==value){pathUI?.reset();connectionUI?.reset();}tool=value;hideMenu();render();$('canvas').focus();}
  function cancelDrag(){if(drag?.originalSelection)selected=drag.originalSelection;pathUI?.cancel(drag);connectionUI?.cancel();preview=null;drag=null;render();}
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
  $('canvas').addEventListener('pointerdown',event=>{
    if(inspectorPreview)inspector.reset();
    if(event.button!==0&&event.button!==1)return;if(drag)return;hideMenu();$('canvas').focus();
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
    if(!drag||drag.pointerId!==event.pointerId)return;const p=world(event),sp=snap(p,event);drag.moved=drag.moved||Math.hypot(p.x-drag.rawStart.x,p.y-drag.rawStart.y)*zoom()>3;drag.lastPoint={...p};
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
    drag.guideSession||=Guides.prepare(drag.base,ids,G.bounds,camera);
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
    else if(action.kind==='marquee'&&action.moved){const b=action.box;const hits=page().objects.filter(o=>{const a=G.bounds(o);return a.x>=b.x&&a.y>=b.y&&a.x+a.width<=b.x+b.width&&a.y+a.height<=b.y+b.height;}).map(o=>o.id);selection(action.add?[...new Set([...action.originalSelection,...hits])]:hits);}
    render();
  });
  $('canvas').addEventListener('pointercancel',cancelDrag);
  $('canvas').addEventListener('dblclick',event=>{
    const point=world(event);
    // 再描画とポインター捕捉で対象がcanvasになる場合も、実際に触れた要素を使う。
    const target=event.target.closest('[data-object],[data-node],[data-bezier]')?event.target:document.elementFromPoint(event.clientX,event.clientY)||event.target;
    if(connectionUI.doubleClick(event,point,target))return;
    const id=target.closest('[data-object]')?.dataset.object,o=page().objects.find(o=>o.id===id);
    const shape=o?.type==='path'&&(o.label||/[zZ]/.test(o.d)),edge=shape&&tool==='direct'?window.IlapoPathEdit.nearest(o,point):null;
    if(o&&!o.locked&&(o.type==='text'||shape&&!target.closest('[data-node],[data-bezier]')&&(!edge||edge.distance>9/zoom()))){selection([id]);if(selected.length===1)openInspectorSection('text');return;}
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
  function hideMenu(){clearTimeout(menuCloseTimer);if($('command-menu').matches(':popover-open'))$('command-menu').hidePopover();if(menuOpener)menuOpener.setAttribute('aria-expanded','false');hoverMenu=false;menuKind=null;}
  function positionMenu(){
    if(!menuOpener||!$('command-menu').matches(':popover-open'))return;
    const r=menuOpener.getBoundingClientRect(),below=innerHeight-r.bottom-13,above=r.top-13,down=below>=Math.min(220,above);
    $('command-menu').style.maxHeight=Math.max(44,down?below:above)+'px';
    const m=$('command-menu').getBoundingClientRect();
    $('command-menu').style.left=Math.max(8,Math.min(r.left,innerWidth-m.width-8))+'px';
    $('command-menu').style.top=Math.max(8,down?r.bottom+5:r.top-m.height-5)+'px';
  }
  const actionIcons={'path-union':'union','path-subtract':'subtract','path-intersect':'intersect','anchor-add':'anchor-add','anchor-position':'anchor-position','anchor-corner':'anchor-corner','anchor-smooth':'anchor-smooth','selection-path':'path',outline:'outline',transform:'transform',copy:'copy',paste:'paste',duplicate:'duplicate',delete:'delete',group:'group',ungroup:'ungroup',lock:'lock','style-copy':'brush','style-paste':'paste','text-edit':'text','component-save':'group','connection-between':'connector','connection-convert':'path','selection-arrange':'arrange','selection-order':'layers',animations:'animation'};
  function menuButton(label,action,disabled=false){const name=actionIcons[action]||(action.startsWith('align-')?'arrange':action.startsWith('order-')?'layers':null);return `<button data-action="${action}" ${disabled?'disabled':''}>${name?icon(name):''}<span>${label}</span></button>`;}
  function openMenu(kind,opener,options={}){
    const was=$('command-menu').matches(':popover-open')&&menuOpener===opener&&menuKind===kind;
    if(was&&(options.hover||hoverMenu)){clearTimeout(menuCloseTimer);if(!options.hover){hoverMenu=false;$('command-menu').querySelector('button:not(:disabled)')?.focus();}return;}
    hideMenu();if(was)return;menuOpener=opener;menuKind=kind;hoverMenu=!!options.hover;$('tooltip').hidden=true;
    const selectedNone=!selected.length;
    const menus={
      save:()=>menuButton('ブラウザに保存','save-browser')+menuButton('ローカルファイルに保存…','save-local')+'<hr>'+menuButton(localAuto?.active?'ローカル自動保存を停止':'ローカル自動保存を開始…',localAuto?.active?'auto-stop':'auto-start'),
      open:()=>menuButton('保存した内容を選ぶ…','recovery')+menuButton('ファイルを開く…','open-file')+menuButton('SVGを追加する…','import-svg')+'<hr>'+menuButton('新しい作品…','new'),
      more:()=>{
        const hidden=selector=>!document.querySelector('.top '+selector)?.getClientRects().length;
        const tools=['select','pan'].filter(key=>hidden(`[data-tool="${key}"]`)).map(key=>`<button data-tool="${key}" aria-pressed="${key==='select'?selecting():tool===key}">${icon(key)}<span>${names[key]}</span></button>`).join('');
        const actions=menuButton('すべて選択','select-all',!page().objects.length)+menuButton('貼り付け','paste',!clipboard);
        const historyMenu=(hidden('[data-action="undo"]')?menuButton('元に戻す','undo',!history.canUndo):'')+(hidden('[data-action="redo"]')?menuButton('やり直し','redo',!history.canRedo):'');
        const pagesMenu=hidden('[data-action="pages"]')?menuButton('ページ一覧…','pages'):'';
        const presentationMenu=hidden('#present-button')?menus.present():'';
        return [tools,actions,historyMenu,pagesMenu,presentationMenu].filter(Boolean).join('<hr>');
      },
      present:()=>menuButton('先頭から発表','present-start')+menuButton('このページから発表','present-current'),
      path:()=>pathUI.menu(menuButton)+'<hr>'+menuButton('アウトライン化…','outline',!outlineAvailable()),
      'selection-more':()=>menuButton('位置・大きさ・回転…','transform')+(page().objects.some(o=>selected.includes(o.id)&&o.type==='path')?menuButton('アンカー・パスの操作…','selection-path'):'')+menuButton('アウトライン化…','outline',!outlineAvailable())+'<hr>'+menuButton('整列・大きさをそろえる','selection-arrange',selected.length<2)+menuButton('重なり順','selection-order')+menuButton('動きと再生順序…','animations')+'<hr>'+menuButton('複製','duplicate')+menuButton('削除','delete'),
      edit:()=>menuButton('文字を編集…','text-edit',selected.length!==1||!page().objects.some(o=>o.id===selected[0]&&(o.type==='text'||o.type==='path'&&(o.label||/[zZ]/.test(o.d)))))+menuButton('アウトライン化…','outline',!outlineAvailable())+'<hr>'+menuButton('コピー','copy',selectedNone)+menuButton('貼り付け','paste',!clipboard)+menuButton('複製','duplicate',selectedNone)+menuButton('削除','delete',selectedNone)+'<hr>'+menuButton('グループ化','group',selected.length<2)+menuButton('グループ解除','ungroup',selectedNone)+menuButton('固定／固定解除','lock',selectedNone)+'<hr>'+menuButton('書式をコピー','style-copy',selectedNone)+menuButton('書式を適用','style-paste',selectedNone||!copiedStyle),
      arrange:()=>['left:左にそろえる','center:左右中央にそろえる','right:右にそろえる','top:上にそろえる','middle:上下中央にそろえる','bottom:下にそろえる','distribute-x:左右に等間隔','distribute-y:上下に等間隔','width:幅をそろえる','height:高さをそろえる','size:幅と高さをそろえる'].map(s=>{const [key,label]=s.split(':');return menuButton(label,'align-'+key,selected.length<2);}).join(''),
      order:()=>menuButton('最前面へ','order-front')+menuButton('1つ前へ','order-forward')+menuButton('1つ後ろへ','order-backward')+menuButton('最背面へ','order-back')
    };
    if(kind==='edit'){const old=menus.edit;menus.edit=()=>old()+'<hr>'+menuButton('選択した2図形を接続','connection-between',selected.length!==2)+menuButton('自作部品に登録…','component-save',selectedNone)+menuButton('接続矢印を通常のパスに変換','connection-convert',selected.length!==1||page().objects.find(o=>o.id===selected[0])?.type!=='connector');}
    $('command-menu').innerHTML=(menus[kind]||menus.more)();$('command-menu').showPopover();opener.setAttribute('aria-expanded','true');
    positionMenu();if(!options.hover)$('command-menu').querySelector('button:not(:disabled)')?.focus();
  }
  window.addEventListener('resize',hideMenu);
  $('command-menu').addEventListener('toggle',event=>{if(event.newState==='closed'&&menuOpener)menuOpener.setAttribute('aria-expanded','false');});
  function deferHoverClose(){clearTimeout(menuCloseTimer);if(hoverMenu)menuCloseTimer=setTimeout(()=>{if(hoverMenu&&!$('command-menu').contains(document.activeElement))hideMenu();},240);}
  document.querySelectorAll('[data-menu]').forEach(button=>{
    button.setAttribute('aria-haspopup','true');
    button.setAttribute('aria-expanded','false');
    if($('selection-bar').contains(button)){
      button.addEventListener('pointerenter',event=>{if(event.pointerType!=='mouse'||event.buttons||drag||$('dialog').open||button===ignoredHover)return;openMenu(button.dataset.menu,button,{hover:true});});
      button.addEventListener('pointerleave',()=>{if(ignoredHover===button)ignoredHover=null;deferHoverClose();});
    }
    button.addEventListener('keydown',event=>{if(!['ArrowDown','ArrowUp'].includes(event.key))return;event.preventDefault();event.stopPropagation();if(!$('command-menu').matches(':popover-open')||menuOpener!==button)openMenu(button.dataset.menu,button);hoverMenu=false;const items=$('command-menu').querySelectorAll('button:not(:disabled)');(event.key==='ArrowUp'?items[items.length-1]:items[0])?.focus();});
  });
  $('command-menu').addEventListener('pointerenter',()=>clearTimeout(menuCloseTimer));
  $('command-menu').addEventListener('pointerleave',deferHoverClose);
  $('command-menu').addEventListener('focusin',()=>clearTimeout(menuCloseTimer));
  $('command-menu').addEventListener('focusout',deferHoverClose);
  $('command-menu').addEventListener('keydown',event=>{
    if(!['ArrowDown','ArrowUp','Home','End'].includes(event.key))return;
    event.preventDefault();event.stopPropagation();const items=[...$('command-menu').querySelectorAll('button:not(:disabled)')],i=items.indexOf(document.activeElement);
    const next=event.key==='Home'?0:event.key==='End'?items.length-1:(i+(event.key==='ArrowDown'?1:-1)+items.length)%items.length;items[next]?.focus();
  });
  document.addEventListener('keydown',event=>{
    if(event.key!=='Escape'||!$('command-menu').matches(':popover-open'))return;
    event.preventDefault();event.stopPropagation();const focus=$('command-menu').contains(document.activeElement)||!hoverMenu;ignoredHover=menuOpener?.matches(':hover')?menuOpener:null;hideMenu();if(focus)menuOpener?.focus();
  },true);
  let dialogOpener,dialogCallback;
  function closeDialog(){if($('dialog').open)$('dialog').close();if(dialogOpener?.isConnected)dialogOpener.focus();else $('canvas').focus();}
  function showDialog(title,html,label,callback){if(inspectorPreview)inspector.reset();const focused=document.activeElement,opener=$('dialog').contains(focused)?dialogOpener:$('command-menu').contains(focused)?menuOpener:focused;hideMenu();if($('dialog').open)$('dialog').close();dialogOpener=opener;$('dialog-title').textContent=title;$('dialog-body').innerHTML=html;$('dialog-error').hidden=true;$('dialog-submit').textContent=label||'適用';$('dialog-submit').hidden=!label;dialogCallback=callback;$('dialog').showModal();}
  $('dialog-close').onclick=$('dialog-cancel').onclick=closeDialog;
  $('dialog').addEventListener('cancel',()=>{setTimeout(()=>dialogOpener?.focus(),0);});
  $('dialog-form').onsubmit=async event=>{event.preventDefault();if(!dialogCallback){closeDialog();return;}const cb=dialogCallback;try{const result=cb();if(result?.then)await result;if(dialogCallback===cb)closeDialog();}catch(error){$('dialog-error').textContent=error.message;$('dialog-error').hidden=false;}};
  const inspectorSections={outline:['アウトライン化','outline'],text:['文字・配置','text'],style:['書式・色','style'],transform:['位置・大きさ','transform'],anchor:['アンカーの座標','path'],connection:['接続・経路','connector'],image:['画像の設定','image'],animation:['動きと再生順序','animation'],board:['用紙サイズ','board'],view:['表示・吸着','view'],pages:['ページ一覧','pages'],objects:['図形の一覧','layers'],assets:['アイコン・部品','assets']};
  let inspectorTabsKey='';
  function inspectorScope(section){return JSON.stringify([revision,doc().id,pageId,section==='pages'?null:selected,section==='anchor'?pathUI.getRefs():null,section==='view'?settings:null]);}
  function clearInspectorPreview(){if(inspectorPreview){inspectorPreview=null;render();}}
  function previewInspectorChange(fn){
    const next=C.clone(doc()),p=next.pages.find(v=>v.id===pageId);fn(p);K.sync(p);C.pruneAnimations(p);
    inspectorPreview=C.validateDocument(next).pages.find(v=>v.id===pageId);render();
  }
  function renderInspectorTabs(){
    if(!inspector)return;
    const one=selected.length===1?page().objects.find(o=>o.id===selected[0]):null;
    const sections=['pages','objects','assets',...(selected.length?[one?.type==='image'?'image':'style','transform',...(one&&(one.type==='text'||one.type==='path'&&(one.label||/[zZ]/.test(one.d)))?['text']:[]),...(one?.type==='connector'?['connection']:pathUI.count()?['anchor']:[]),...(outlineAvailable()?['outline']:[]),'animation','board','view']:[...(textUI?.hasDraft?['text']:[]),'board','view','animation'])];
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
    if(!compatible||needsSelection&&section!=='image'&&!allUnlocked()){
      const message=!compatible?'対象の図形'+(section==='anchor'?'とアンカー':'')+'を選ぶと、ここで調整できます。':'固定された図形を含みます。編集から固定を解除すると調整できます。';
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
  function styleDialog(){
    if(selected.length===1&&page().objects.find(o=>o.id===selected[0])?.type==='image'){imageDialog();return;}
    if(!editable())return;const objects=page().objects.filter(o=>selected.includes(o.id)),first=objects[0].style,patch={};let channel=objects.every(o=>o.type==='connector')?'stroke':'fill';
    function read(){
      if($('color-hex').value!=='none'&&!/^#[0-9a-f]{6}$/i.test($('color-hex').value))throw Error('色は # と6桁の16進数で入力してください。');
      return p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>Object.assign(o.style,patch));
    }
    showInspector('style','書式・色',`<div class="color-tabs"><button type="button" data-color-channel="fill" class="on">塗り・文字</button><button type="button" data-color-channel="stroke">線</button></div><p id="mixed-color" class="muted"></p><div class="swatches">${palette.map(v=>`<button type="button" data-color="${v}" style="--swatch:${v}" aria-label="色 ${v}"></button>`).join('')}</div><div class="row"><button type="button" id="color-none">色なし</button><input id="color-picker" type="color" aria-label="自由な色を選択" style="flex:1"><input id="color-hex" aria-label="色の16進数" maxlength="7" style="flex:1"></div><div class="fields three">${['R','G','B'].map(k=>`<label>${k}<input id="color-${k}" type="number" min="0" max="255" step="1"></label>`).join('')}</div><div class="fields"><label>線幅（px）<input data-style="strokeWidth" type="number" required min="0" step="any" value="${first.strokeWidth}"></label><label>不透明度（%）<input data-style="opacity" type="number" required min="0" max="100" step="1" value="${first.opacity*100}"></label><label>線の種類<select data-style="dash"><option value="">実線</option><option value="6 4">破線</option><option value="1 3">点線</option><option value="10 3 2 3">一点鎖線</option></select></label><label>線の端<select data-style="linecap"><option value="butt">平ら</option><option value="round">丸い</option><option value="square">四角い</option></select></label><label>線の角<select data-style="linejoin"><option value="miter">角</option><option value="round">丸い</option><option value="bevel">面取り</option></select></label><label>文字サイズ（px）<input data-style="fontSize" type="number" required min="0.01" step="any" value="${first.fontSize}"></label><label>書体<select data-style="fontFamily"><option value="sans-serif">ゴシック</option><option value="serif">明朝</option><option value="monospace">等幅</option></select></label></div><div class="row"><label class="check"><input data-style="bold" type="checkbox" ${first.bold?'checked':''}>太字</label><label class="check"><input data-style="italic" type="checkbox" ${first.italic?'checked':''}>斜体</label></div><p class="muted">変更はすぐに図形へ反映します。元に戻すには⌘Zを使います。</p>`,'適用',()=>changePage(read()),{preview:()=>previewInspectorChange(read())});
    function updateColor(){const color=patch[channel]??first[channel],value=color==='none'?'#000000':color;$('color-picker').value=value;$('color-hex').value=color;['R','G','B'].forEach((k,i)=>$('color-'+k).value=parseInt(value.slice(1+i*2,3+i*2),16));$('mixed-color').textContent=!(channel in patch)&&objects.some(o=>o.style[channel]!==first[channel])?'複数の色が混在しています。色を選ぶとそろえます。':color==='none'?'色なし':color;document.querySelectorAll('[data-color]').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.color===color.toUpperCase())));}
    $('inspector-body').querySelectorAll('[data-color-channel]').forEach(b=>b.onclick=()=>{channel=b.dataset.colorChannel;$('inspector-body').querySelectorAll('[data-color-channel]').forEach(v=>v.classList.toggle('on',v===b));updateColor();});
    $('inspector-body').querySelectorAll('[data-color]').forEach(b=>b.onclick=()=>{patch[channel]=b.dataset.color;updateColor();});
    $('color-none').onclick=()=>{patch[channel]='none';updateColor();};$('color-picker').oninput=()=>{patch[channel]=$('color-picker').value.toUpperCase();updateColor();};$('color-hex').oninput=()=>{if(/^#[0-9a-f]{6}$/i.test($('color-hex').value)){patch[channel]=$('color-hex').value.toUpperCase();updateColor();}};
    ['R','G','B'].forEach(k=>$('color-'+k).oninput=()=>{const rgb=['R','G','B'].map(c=>Number($('color-'+c).value));if(rgb.every((v,i)=>$('color-'+['R','G','B'][i]).value!==''&&Number.isInteger(v)&&v>=0&&v<=255)){patch[channel]='#'+rgb.map(v=>v.toString(16).padStart(2,'0')).join('').toUpperCase();updateColor();}});
    $('inspector-body').querySelectorAll('[data-style]').forEach(el=>{if(el.tagName==='SELECT')el.value=first[el.dataset.style];el.oninput=el.onchange=()=>{const key=el.dataset.style;patch[key]=el.type==='checkbox'?el.checked:el.type==='number'?Number(el.value)/(key==='opacity'?100:1):el.value;};});$('inspector-body').querySelectorAll('[data-color-channel]').forEach(b=>b.classList.toggle('on',b.dataset.colorChannel===channel));updateColor();
  }
  function viewDialog(){showInspector('view','表示設定',`<label>テーマ<select id="view-theme"><option value="auto">自動</option><option value="light">ライト</option><option value="dark">ダーク</option></select></label><label>操作部の文字サイズ<select id="view-size"><option value="standard">標準</option><option value="large">大</option><option value="xlarge">特大</option></select></label><label class="check"><input id="view-guides" type="checkbox" ${settings.smartGuides?'checked':''}>図形・用紙への位置合わせガイドと吸着</label><label class="check"><input id="view-grid" type="checkbox" ${settings.grid?'checked':''}>作図用グリッド（点）を表示</label><label class="check"><input id="view-pixel-grid" type="checkbox" ${settings.pixelGrid?'checked':''}>ピクセルの方眼を表示（拡大時・1px）</label><label class="check"><input id="view-snap" type="checkbox" ${settings.snap?'checked':''}>指定間隔のグリッドに吸着</label><label class="check"><input id="view-pixel" type="checkbox" ${settings.snapPixel?'checked':''}>図形・アンカー・ハンドルをピクセルに吸着</label><label class="check"><input id="view-anchor" type="checkbox" ${settings.snapAnchor?'checked':''}>他のアンカーに吸着</label><label class="check"><input id="view-path" type="checkbox" ${settings.snapPath?'checked':''}>他のパスの上に吸着</label><label>グリッドの間隔（px）<input id="view-step" type="number" min="0.01" max="10000" step="any" required value="${Number(settings.gridStep)||20}"></label><p class="muted">拡大すると1pxの方眼を表示します。画像や印刷には入りません。両方の吸着を選ぶと指定間隔を優先し、目盛りに合う位置へそろえます。曲線のハンドルも同じ間隔に吸着します。Optionで吸着を一時解除、Shift＋矢印キーで10倍移動。数値入力では指定値、Shiftでの拡大縮小では縦横比、図形への接続では輪郭の位置を保ちます。</p>`,'適用',()=>{settings={...settings,theme:$('view-theme').value,size:$('view-size').value,grid:$('view-grid').checked,pixelGrid:$('view-pixel-grid').checked,snap:$('view-snap').checked,snapPixel:$('view-pixel').checked,snapAnchor:$('view-anchor').checked,snapPath:$('view-path').checked,smartGuides:$('view-guides').checked,gridStep:Number($('view-step').value)};applySettings();});$('view-theme').value=settings.theme;$('view-size').value=settings.size;}
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
  $('image-input').onchange=async()=>{
    const file=$('image-input').files[0];$('image-input').value='';if(!file)return;const targetDoc=doc().id,targetPage=pageId,center={x:camera.x+camera.width/2,y:camera.y+camera.height/2},board=C.clone(page().board);
    try{const image=await A.imageFromFile(file,{maxWidth:board.width*.8,maxHeight:board.height*.8});image.x=center.x-image.width/2;image.y=center.y-image.height/2;if(doc().id!==targetDoc||!doc().pages.some(p=>p.id===targetPage))throw Error('作品が切り替わったため、画像をもう一度選んでください。');if(change(d=>d.pages.find(p=>p.id===targetPage).objects.unshift(image))){pageId=targetPage;selected=[image.id];setTool('select');toast('下絵を追加しました。位置は固定、書き出し・発表では非表示です。「画像の設定」で変更できます。');}}catch(error){toast(errorMessage(error));}
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
    selected=keepSelection?selected.filter(id=>page().objects.some(o=>o.id===id)):[];if(!selected.length)clearSelection();edited=true;queueSave();render();
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
    lock:()=>{const lock=allUnlocked();changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.locked=lock));},
    'text-edit':()=>openInspectorSection('text'),outline:()=>openInspectorSection('outline'),
    'style-copy':()=>{if(selected.length){copiedStyle=C.clone(page().objects.find(o=>o.id===selected[0]).style);toast('書式をコピーしました。');}},'style-paste':()=>{if(copiedStyle&&editable())changePage(p=>p.objects.filter(o=>selected.includes(o.id)).forEach(o=>o.style=C.clone(copiedStyle)));},
    fit,'zoom-in':()=>zoomAt(1.25),'zoom-out':()=>zoomAt(.8),'zoom-reset':()=>zoomAt(1/zoom()),
    'inspector-toggle':()=>inspector.isOpen&&!['pages','objects','assets'].includes(inspector.section)?inspector.close():openInspectorSection(selected.length?'style':'board'),
    'assets-toggle':()=>inspector.isOpen&&inspector.section==='assets'?inspector.close():openInspectorSection('assets'),
    'objects-toggle':()=>inspector.isOpen&&inspector.section==='objects'?inspector.close():openInspectorSection('objects'),
    'pages-toggle':()=>inspector.isOpen&&inspector.section==='pages'?inspector.close():openInspectorSection('pages'),
    'selection-path':()=>openMenu('path',$('selection-more')),'selection-arrange':()=>openMenu('arrange',$('selection-more')),'selection-order':()=>openMenu('order',$('selection-more')),
    'export-toggle':()=>{const opening=$('export-panel').hidden;if(opening)inspector.close({focus:false});$('export-panel').hidden=!opening;document.querySelector('.side-tab [data-action=export-toggle]').setAttribute('aria-expanded',String(opening));render();help?.refresh();},
    'export-svg':()=>{download(S.exportPage(page(),exportOptions()),fileName(doc().name+'_'+page().name,'.svg'),'image/svg+xml');toast('SVGを書き出しました。');},
    'export-png':exportBitmap,
    'export-pdf':async()=>{const pages=C.clone($('print-range').value==='all'?doc().pages:[page()]);await E.print(pages,{title:doc().name});}
  };
  function execute(action){hideMenu();closePalette(false);objectsUI?.cancelDrag();if(inspectorPreview)inspector.reset();cancelDrag();try{if(action.startsWith('align-'))align(action.slice(6));else if(action.startsWith('order-')){if(editable())changePage(p=>C.reorderObjects(p,selected,action.slice(6)));}else if(pathUI.commands[action])pathUI.commands[action]();else {const result=commands[action]?.();if(result?.catch)result.catch(error=>toast(errorMessage(error)));}}catch(error){toast(errorMessage(error));}}
  document.addEventListener('click',event=>{const button=event.target.closest('button');if(!button||button.disabled)return;if(button.dataset.inspectorSection)openInspectorSection(button.dataset.inspectorSection);else if(button.dataset.tool)setTool(button.dataset.tool);else if(button.dataset.menu)openMenu(button.dataset.menu,button);else if(button.dataset.action)execute(button.dataset.action);});
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
  function showTooltip(target){if(!target||target===menuOpener&&$('command-menu').matches(':popover-open'))return;const r=target.getBoundingClientRect();$('tooltip').textContent=target.dataset.tip;$('tooltip').hidden=false;$('tooltip').style.left=Math.max(8,Math.min(r.left,innerWidth-$('tooltip').offsetWidth-8))+'px';$('tooltip').style.top=Math.min(r.bottom+7,innerHeight-$('tooltip').offsetHeight-8)+'px';}
  const hideTooltip=()=>$('tooltip').hidden=true;
  document.addEventListener('pointerover',event=>{if(event.pointerType!=='touch')showTooltip(event.target.closest('[data-tip]'));});
  document.addEventListener('focusin',event=>{hideTooltip();if(event.target.matches(':focus-visible'))showTooltip(event.target.closest('[data-tip]'));});
  document.addEventListener('focusout',hideTooltip);document.addEventListener('pointerout',hideTooltip);document.addEventListener('pointerdown',hideTooltip,true);
  pathUI=window.IlapoPathUI.create({page,selected:()=>selected,tool:()=>tool,settings:()=>settings,zoom,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,errorMessage,showDialog,showInspector,esc,round,standardSize});
  connectionUI=window.IlapoConnectorUI.create({page,selected:()=>selected,tool:()=>tool,zoom,snap,select:selection,render,setTool,setDrag:value=>drag=value,setPreview:value=>preview=value,editable,changePage,toast,clearToast:()=>{clearTimeout(toast.timer);$('toast').hidden=true;},showInspector,previewChange:previewInspectorChange,esc,round,standardSize});
  animationUI=window.IlapoAnimationUI.create({document:doc,page,selected:()=>selected,changePage,toast,showInspector,esc,standardSize,palette});
  textUI=window.IlapoTextUI.create({document:doc,page,selected:()=>selected,select:selection,showInspector,changePage,previewChange:previewInspectorChange,clearPreview:clearInspectorPreview,isOpen:()=>!!inspector?.isOpen&&inspector.section==='text',esc,icon,palette,standardSize,toast});
  outlineUI=window.IlapoOutlineUI.create({page,selected:()=>selected,scope:()=>inspectorScope('outline'),isOpen:()=>!!inspector?.isOpen&&inspector.section==='outline',showInspector,changePage,previewChange:previewInspectorChange,clearPreview:clearInspectorPreview,esc,finish:ids=>{pathUI.reset();connectionUI.reset();selection(ids);setTool('select');inspector.close();render();}});
  objectsUI=window.IlapoObjectsUI.create({document:doc,page,selected:()=>selected,select:selection,showInspector,changePage,showDialog,execute,isBusy:()=>!!drag,esc,icon});
  pagesUI=window.IlapoPagesUI.create({document:doc,page,selectPage,change,showInspector,showDialog,esc,icon});
  assetsUI=window.IlapoAssetsUI.create({document:doc,page,selected:()=>selected,library,insertionPoint,insertObjects,showInspector,showDialog,isOpen:()=>inspector?.isOpen&&inspector.section==='assets',esc,icon,toast,download});
  inspector=window.IlapoInspector.create({onHistory:redo=>moveHistory(redo,true),onLayout:()=>{render();help?.refresh();},clearPreview:clearInspectorPreview,isBusy:()=>!!drag||objectsUI?.isDragging});
  window.IlapoEditor=Object.freeze({getAnchors:()=>pathUI.getRefs(),getDocument:()=>C.clone(doc()),getSelection:()=>selected.slice(),getCamera:()=>({...camera}),getState:()=>({tool,dirty:dirty(),pageId})});
  applySettings();requestAnimationFrame(()=>{fit();if(store?.list().length)recoveryDialog();});
}());
