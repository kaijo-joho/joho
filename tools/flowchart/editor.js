/* Student diagram editor. No network services or external runtime dependencies. */
(() => {
  'use strict';
  const C = window.DiagramCore, R = window.DiagramRender, S = window.DiagramStorage, L = window.DiagramLocalAutosave;
  const $ = id => document.getElementById(id);
  const $$ = selector => [...document.querySelectorAll(selector)];
  if (!C || !R || !S || !L) {
    $('notice').hidden = false;
    $('notice').textContent = 'エディタを読み込めませんでした。ページを再読み込みしてください。';
    return;
  }
  const PREFS = 'kaijo.diagram.preferences.v1';
  const icons = {
    select: 'M5 3l14 10-7 1-4 7z', hand: 'M8 12V5a2 2 0 014 0v7-8a2 2 0 014 0v8-5a2 2 0 014 0v9c0 5-3 7-7 7-3 0-5-2-6-4l-4-6a2 2 0 013-2l2 3',
    undo: 'M4 9h10a6 6 0 010 12M4 9l5-5M4 9l5 5', redo: 'M20 9H10a6 6 0 000 12M20 9l-5-5M20 9l-5 5',
    arrow: 'M3 12h18m-6-6 6 6-6 6', elbow: 'M4 4h8v16h8m-5-5 5 5-5 3', curve: 'M3 19Q7-1 21 9m-7-4 7 4-5 6',
    branch: 'M12 2l5 4-5 4-5-4zM7 6H4v7m13-7h3v7M1 13h6v5H1zm16 0h6v5h-6M4 18v4h16v-4',
    connect: 'M8 5H3v5h5zM21 14h-5v5h5zM8 8h4v8h4', copy: 'M8 8h12v13H8zM5 17H3V3h12v2', paste: 'M9 3h6v4H9zM7 5H4v17h16V5h-3M8 12h8m-8 5h8',
    duplicate: 'M3 3h12v12H3zM9 18v3h12V9h-3M9 6v6m-3-3h6', trash: 'M4 6h16M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7',
    settings: 'M4 7h16M4 17h16M9 4v6m6 4v6', reverse: 'M3 7h17m-5-4 5 4-5 4M21 17H4m5-4-5 4 5 4',
    group: 'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M7 7h10v10H7z', ungroup: 'M3 8V3h5m8 0h5v5M3 16v5h5m8 0h5v-5M5 12h14', lock: 'M6 10h12v11H6zM8 10V6a4 4 0 018 0v4M12 14v3',
    matchSize: 'M3 8h7v10H3zM14 8h7v10h-7zM3 3h18M3 21h18', copyStyle: 'M4 3h16v6H4zM16 9v4h-4v8h-3v-8h3',
    alignLeft: 'M4 3v18M8 7h12M8 12h7M8 17h10', alignCenter: 'M12 3v18M4 7h16M7 12h10M5 17h14', alignRight: 'M20 3v18M4 7h12M9 12h7M6 17h10', alignTop: 'M3 4h18M7 8v12m5-12v7m5-7v10', alignMiddle: 'M3 12h18M7 4v16m5-13v10m5-12v14', alignBottom: 'M3 20h18M7 4v12m5-7v7m5-10v10'
  };
  $$('[data-icon]').forEach(el => { el.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons[el.dataset.icon] || icons.select}"/></svg>`; });
  let doc = C.createDocument('flowchart');
  let history = new C.History(doc), saved = C.serializeDocument(doc);
  let committed = C.clone(doc);
  let selected = new Set(), laneId = null, tool = 'select', layer = 'diagram', pane = '';
  let view = { x: 40, y: 60, scale: 1 }, drag = null, connection = null, editing = null;
  let clipboard = null, space = false, noticeTimer = null, recoveryTimer = null;
  let paletteType = null, restoringFocus = false, lastCopied = '', pastedCount = 0;
  let lastTap = null;
  let insertionPreview = null;
  let trace = null, traceStartId = null, lessonPreview = null;
  let recoveryState = 'idle';
  let storageArmed = false, lastSaveLocation = 'browser', localFileCandidate = null, localManualSnapshot = null;
  let openingSnapshot = false, choosingLocalSave = false, localPickerEpoch = 0;
  const localAutosave = L.create({ onState: state => { updateLocalSaveStatus(state); updateSaveStatus(); } });
  let imageOperation = null, imageCopyFallback = null;
  let styleClipboard = null, styleSourceLabel = '', sizeSelection = [];
  const paletteColors = [
    ['#ffffff','白'], ['#253140','標準の黒'], ['#000000','黒'], ['#6b7280','灰色'], ['#d61f1f','赤'], ['#1d4ed8','青'],
    ['#15803d','緑'], ['#ea7a00','橙'], ['#7c3aed','紫'], ['#facc15','黄'], ['#e5e7eb','薄い灰色'], ['#fce7f3','薄い桃色'],
    ['#fee2e2','薄い赤'], ['#ffedd5','薄い橙'], ['#fef3c7','薄い黄'], ['#dcfce7','薄い緑'], ['#dbeafe','薄い青'], ['#f3e8ff','薄い紫']
  ];
  const colorFields = { fill: 'fill-color', stroke: 'stroke-color', color: 'text-color' };
  const rgbFields = ['rgb-red', 'rgb-green', 'rgb-blue'];
  let colorSelection = '';
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const canvasTheme = () => $('theme').value === 'dark' || $('theme').value === 'auto' && systemTheme.matches ? 'dark' : 'light';
  const canvas = $('canvas'), stage = $('stage'), world = $('world');
  const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
  const esc = value => R.escapeXML(String(value));
  const node = id => doc.nodes.find(n => n.id === id);
  const edge = id => doc.edges.find(e => e.id === id);
  const lane = () => doc.lanes.find(l => l.id === laneId);
  const orderedLanes = () => doc.lanes.slice().sort((a, b) => a.x - b.x);
  const selectedNodes = () => doc.nodes.filter(n => selected.has(n.id));
  const selectedEdges = () => doc.edges.filter(e => selected.has(e.id));
  const objects = () => [...selectedNodes(), ...selectedEdges()];
  const content = () => doc.nodes.length || doc.edges.length;
  const dirty = () => JSON.stringify(doc, null, 2) !== saved;
  const isInput = target => target instanceof Element && !!target.closest('input,textarea,select,[contenteditable=true]');
  const isDialog = () => !!document.querySelector('dialog[open]');
  const snapped = n => $('snap').checked ? Math.round(n / 10) * 10 : n;
  const studentMode = () => !!doc.lesson?.studentMode;
  const lessonToolsEnabled = () => document.body.dataset.lessonTools === 'on';
  const expand = ids => C.expandSelection(doc, ids);
  const editable = ids => !trace && !expand(ids).some(id => (node(id) || edge(id) || doc.lanes.find(l => l.id === id))?.locked);
  const selectionEditable = () => selected.size > 0 && editable([...selected]);
  const describeNode = n => n ? n.text || C.NODE_DEFS[n.kind]?.label || '図形' : '接続先なし';

  function notify(message, error = false) {
    clearTimeout(noticeTimer);
    $('notice').textContent = message;
    $('notice').classList.toggle('error', error);
    $('notice').hidden = false;
    noticeTimer = setTimeout(() => { $('notice').hidden = true; }, error ? 9000 : 3800);
  }
  function updateSaveStatus() {
    if (lessonPreview) { $('save-status').textContent = '生徒の画面を確認中'; $('save-status').title = '確認を終了すると元のひな形に戻ります'; return; }
    const state = localAutosave.getState(), failed = recoveryState === 'failed' || state.status === 'failed';
    $('save-status').dataset.error = String(failed);
    $('save-status').title = failed ? 'ファイルメニューから別の保存先へ保存できます。' : '';
    const automatic = recoveryState === 'failed' ? 'ブラウザ自動保存に失敗' : recoveryState === 'pending' ? '自動保存中' : recoveryState === 'saved' ? '自動保存済み' : '';
    const explicit = dirty() ? '未保存の変更あり' : content() || doc.lanes.length || doc.lesson ? '保存時の内容' : '新しい図';
    const local = state.status === 'failed' ? 'ファイル自動保存に失敗' : state.status === 'saving' ? 'ファイル保存中' : state.status === 'saved' ? 'ファイル自動保存済み' : '';
    $('save-status').textContent = [automatic, explicit, local].filter(Boolean).join('・');
  }
  function writeRecovery() {
    clearTimeout(recoveryTimer);
    if (!storageArmed) return true;
    const value = lessonPreview ? { document: lessonPreview.doc, saved: lessonPreview.saved, view: lessonPreview.view } : { document: doc, saved, view };
    try {
      S.writeBrowser(localStorage, 'auto', value.document, { saved: value.saved, view: value.view });
      recoveryState = 'saved';
    } catch {
      recoveryState = 'failed';
    }
    localAutosave.enqueue(value.document, { saved: value.saved, view: value.view });
    updateSaveStatus();
    return recoveryState === 'saved';
  }
  function persist(documentChanged = false) {
    if (documentChanged) storageArmed = true;
    if (!storageArmed) return;
    clearTimeout(recoveryTimer); recoveryState = 'pending'; updateSaveStatus(); recoveryTimer = setTimeout(writeRecovery, 150);
  }
  function remember(options = {}) {
    try {
      if (trace) throw new Error('トレースを終了すると図を編集できます。');
      C.assertEditable(committed, doc, options); doc = C.parseDocument(doc);
      const changed = history.commit(doc); committed = C.clone(doc); if (changed) persist(true); render(); return changed;
    }
    catch (error) { doc = C.clone(committed); render(); notify(error.message, true); return false; }
  }
  function change(fn, options = {}) {
    if (trace) { notify('トレースを終了すると図を編集できます。'); return false; }
    finishText();
    const before = C.clone(doc);
    try { fn(); return remember(options); } catch (error) { doc = before; render(); notify(error.message, true); return false; }
  }
  function prune() {
    selected = new Set(expand([...selected].filter(id => node(id) || edge(id))));
    if (!lane()) laneId = null;
  }
  function point(event) {
    const rect = canvas.getBoundingClientRect();
    return { x: (event.clientX - rect.left - view.x) / view.scale, y: (event.clientY - rect.top - view.y) / view.scale };
  }
  function center() { return { x: (stage.clientWidth / 2 - view.x) / view.scale, y: (stage.clientHeight / 2 - view.y) / view.scale }; }
  function portOffsets(n, side) {
    let graph = doc, omitId = drag?.type === 'endpoint' ? drag.id : null, omitEnd = drag?.endpoint;
    if (connection) {
      graph = { ...doc, edges: [...doc.edges, { id: connection.id, from: connection.from, to: connection.to, kind: connection.kind }] };
      omitId = connection.id; omitEnd = 'to';
    }
    const count = R.connectionsOnSide(graph, n.id, side).filter(item => item.edgeId !== omitId || item.end !== omitEnd).length;
    return R.connectionOffsets(count + 1);
  }
  function endpointAt(p) {
    const margin = 12 / view.scale;
    const n = [...doc.nodes].reverse().find(n => n.kind !== 'text' && p.x >= n.x - margin && p.x <= n.x + n.w + margin && p.y >= n.y - margin && p.y <= n.y + n.h + margin);
    if (!n) return { x: snapped(p.x), y: snapped(p.y) };
    const choices = [['top', Math.abs(p.y - n.y)], ['bottom', Math.abs(p.y - n.y - n.h)], ['left', Math.abs(p.x - n.x)], ['right', Math.abs(p.x - n.x - n.w)]].sort((a, b) => a[1] - b[1]);
    const side = choices[0][1] <= 18 / view.scale ? choices[0][0] : 'auto';
    const offset = side === 'top' || side === 'bottom' ? (p.x - n.x) / n.w : (p.y - n.y) / n.h;
    return { nodeId: n.id, side, offset: side === 'auto' ? .5 : $('snap').checked ? R.nearestOffset(n, side, p, portOffsets(n, side)) : clamp(offset, 0, 1) };
  }
  function snapAutomatic(e, graph) {
    if (!$('snap').checked) return;
    for (const end of ['from', 'to']) if (e[end].nodeId && e[end].side === 'auto') e[end] = R.snapEndpoint(graph, e, end);
  }
  function connectionEdge(to) {
    const e = C.createEdge(connection.from, to, { id: connection.id, kind: connection.from.nodeId && connection.from.nodeId === to.nodeId ? 'curve' : connection.kind });
    snapAutomatic(e, { ...doc, edges: [...doc.edges, e] });
    return e;
  }
  function canInsert() { return doc.diagramType !== 'state' && ['node:process','node:action'].includes(tool); }
  function edgePlacement(e, p) {
    const g = R.edgeGeometry(doc, e), segments = g.points.slice(1).map((b,i) => {
      const a = g.points[i], dx = b.x-a.x, dy = b.y-a.y, length = Math.hypot(dx,dy);
      return { a,b,dx,dy,length };
    }).filter(s => s.length > .01);
    const total = segments.reduce((sum,s) => sum+s.length,0);
    let chosen = null, travelled = 0;
    for (const s of segments) {
      const fraction = p ? clamp(((p.x-s.a.x)*s.dx+(p.y-s.a.y)*s.dy)/(s.length*s.length),0,1) : clamp((total/2-travelled)/s.length,0,1);
      const at = { x:s.a.x+s.dx*fraction, y:s.a.y+s.dy*fraction };
      const distance = p ? Math.hypot(at.x-p.x,at.y-p.y) : Math.abs(travelled+s.length*fraction-total/2);
      if (!chosen || distance < chosen.distance) chosen = { ...at, distance, dx:s.dx, dy:s.dy, t:total ? (travelled+s.length*fraction)/total : .5 };
      travelled += s.length;
    }
    chosen ||= { ...g.from, dx:0, dy:1, t:.5 };
    const vertical = g.points.every(q => Math.abs(q.x-g.from.x)<.01), horizontal = g.points.every(q => Math.abs(q.y-g.from.y)<.01);
    chosen.direction = e.kind !== 'curve' && e.from.nodeId && e.to.nodeId && e.from.nodeId !== e.to.nodeId && (vertical || horizontal && !doc.lanes.length)
      ? vertical ? g.to.y>=g.from.y?'down':'up' : g.to.x>=g.from.x?'right':'left' : null;
    if (chosen.direction) return chosen;
    const size = C.NODE_DEFS.process, margin = 16;
    const clear = at => doc.nodes.every(n => n.kind === 'text' || at.x+size.w/2+margin<=n.x || at.x-size.w/2-margin>=n.x+n.w || at.y+size.h/2+margin<=n.y || at.y-size.h/2-margin>=n.y+n.h);
    if (clear(chosen)) return chosen;
    // Prefer a nearby clear part of this same route over covering an existing shape.
    let alternative = null; travelled = 0;
    for (const s of segments) {
      for (let i=0;i<=16;i++) {
        const at = {x:s.a.x+s.dx*i/16,y:s.a.y+s.dy*i/16};
        const distance = Math.hypot(at.x-chosen.x,at.y-chosen.y);
        if ((!alternative || distance<alternative.distance) && clear(at)) alternative = {...at,distance,dx:s.dx,dy:s.dy,t:total?(travelled+s.length*i/16)/total:.5,direction:null};
      }
      travelled += s.length;
    }
    return alternative;
  }
  function routeSides(points, n) {
    const hits=[];let travelled=0;
    for(let i=1;i<points.length;i++) {
      const a=points[i-1],b=points[i],dx=b.x-a.x,dy=b.y-a.y,length=Math.hypot(dx,dy);
      for(const [side,axis,boundary] of [['left','x',n.x],['right','x',n.x+n.w],['top','y',n.y],['bottom','y',n.y+n.h]]) {
        const delta=axis==='x'?dx:dy;if(Math.abs(delta)<.001)continue;
        const t=(boundary-a[axis])/delta,other=axis==='x'?a.y+dy*t:a.x+dx*t,lo=axis==='x'?n.y:n.x,hi=lo+(axis==='x'?n.h:n.w);
        if(t>=0&&t<=1&&other>=lo-.001&&other<=hi+.001)hits.push({side,distance:travelled+length*t});
      }
      travelled+=length;
    }
    hits.sort((a,b)=>a.distance-b.distance);
    return {entrySide:hits[0]?.side||'auto',exitSide:hits.at(-1)?.side||'auto'};
  }
  function clearInsertedLabel(e) {
    const g=R.edgeGeometry(doc,e),box=g.labelBounds;if(!box)return;
    const overlaps=(x,y,n)=>x+box.w/2>n.x&&x-box.w/2<n.x+n.w&&y+box.h/2>n.y&&y-box.h/2<n.y+n.h;
    const obstacles=doc.nodes.filter(n=>overlaps(g.label.x,g.label.y,n));if(!obstacles.length)return;
    const xs=[g.label.x],ys=[g.label.y];
    obstacles.forEach(n=>{xs.push(n.x-box.w/2-8,n.x+n.w+box.w/2+8);ys.push(n.y-box.h/2-8,n.y+n.h+box.h/2+8);});
    let best=null;
    for(const x of xs)for(const y of ys){const distance=Math.hypot(x-g.label.x,y-g.label.y);if((!best||distance<best.distance)&&doc.nodes.every(n=>!overlaps(x,y,n)))best={x,y,distance};}
    if(best){e.label.dx+=best.x-g.label.x;e.label.dy+=best.y-g.label.y;}
  }
  function updateView() {
    world.setAttribute('transform', `translate(${view.x} ${view.y}) scale(${view.scale})`);
    $('zoom').options[0].textContent = `${Math.round(view.scale * 100)}%`;
    $('zoom').value = 'current';
    stage.style.backgroundSize = `${20 * view.scale}px ${20 * view.scale}px`;
    stage.style.backgroundPosition = `${view.x}px ${view.y}px`;
    renderOverlay();
  }
  function zoomTo(scale, clientPoint) {
    finishText();
    const p = clientPoint || { x: stage.clientWidth / 2, y: stage.clientHeight / 2 };
    const wx = (p.x - view.x) / view.scale, wy = (p.y - view.y) / view.scale;
    view.scale = clamp(scale, .15, 4);
    view.x = p.x - wx * view.scale; view.y = p.y - wy * view.scale;
    updateView(); persist();
  }
  function fit() {
    finishText();
    if (!content() && !doc.lanes.length) { view = { x: 40, y: 70, scale: 1 }; updateView(); return; }
    const b = R.documentBounds(doc), top = laneId && layer === 'lanes' ? Math.max(70, $('lane-bar').offsetHeight + 22) : selected.size ? Math.max(70, $('format-bar').offsetHeight + 22) : 45;
    const width = Math.max(160, stage.clientWidth - 60), height = Math.max(layer === 'lanes' ? 60 : 170, stage.clientHeight - top - 55);
    view.scale = clamp(Math.min(width / Math.max(b.w, 100), height / Math.max(b.h, 100)), layer === 'lanes' ? .02 : .15, 1.5);
    view.x = (stage.clientWidth - b.w * view.scale) / 2 - b.x * view.scale;
    view.y = top + (height - b.h * view.scale) / 2 - b.y * view.scale;
    updateView(); persist();
  }
  function renderPalette() {
    if (paletteType === doc.diagramType) return;
    paletteType = doc.diagramType;
    const container = $('node-palette'); container.replaceChildren();
    Object.entries(C.NODE_DEFS).forEach(([kind, def]) => {
      if (kind === 'text' || !def.modes.includes(doc.diagramType)) return;
      const button = document.createElement('button'); button.type = 'button';
      button.dataset.tool = `node:${kind}`; button.setAttribute('aria-pressed', 'false');
      button.title = `${def.label}：選んで作図画面に置く。Enterで中央に配置`;
      const n = C.createNode(kind, 4, 4, { text: '' }); n.w = 58; n.h = ['initial', 'final', 'junction'].includes(kind) ? 32 : ['fork', 'join'].includes(kind) ? 6 : 32;
      n.style = { ...n.style, fill: 'none', stroke: 'currentColor' };
      if (['initial', 'final', 'junction', 'state'].includes(kind)) { n.w = n.h; n.x = 17; }
      const symbol = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
      symbol.setAttribute('viewBox', '0 0 66 42'); symbol.setAttribute('class', 'symbol'); symbol.setAttribute('aria-hidden', 'true');
      symbol.innerHTML = R.nodeMarkup(n, { interactive: false });
      const title = document.createElement('span'); title.textContent = def.label;
      button.append(symbol, title); container.append(button);
    });
    if (doc.diagramType === 'flowchart') {
      const button = document.createElement('button'); button.type = 'button'; button.dataset.tool = 'branch';
      button.setAttribute('aria-pressed','false'); button.title = '条件・はい／いいえの処理・合流点をまとめて配置。Enterで中央に配置';
      button.innerHTML = `<svg class="ui-icon" viewBox="0 0 24 24" aria-hidden="true"><path d="${icons.branch}"/></svg><span>分岐セット</span>`;
      container.append(button);
    }
    renderTemplates();
  }
  function renderTemplates() {
    const container = $('templates'); container.replaceChildren();
    C.TEMPLATES.filter(t => t.diagramType === doc.diagramType).forEach(template => {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'template-button'; button.dataset.template = template.id;
      const title = document.createElement('strong'); title.textContent = template.title;
      const thumb = document.createElement('div'); thumb.className = 'template-thumbnail'; thumb.setAttribute('aria-hidden', 'true');
      thumb.innerHTML = R.svgDocument(C.createTemplate(template.id), { padding: 20, idPrefix: `template-${template.id}` });
      const description = document.createElement('small'); description.textContent = template.description;
      button.append(thumb, title, description); container.append(button);
    });
  }
  function renderLesson() {
    const student = studentMode(), instructions = doc.lesson?.instructions || '', input = $('lesson-instructions');
    const enabled = lessonToolsEnabled();
    document.querySelector('[data-pane-button="lesson"]').hidden = !enabled;
    $('lesson-author').hidden = student; $('lesson-student').hidden = !student;
    if (input.dataset.documentId !== doc.id || input.dataset.source !== instructions) {
      input.value = instructions; input.dataset.documentId = doc.id; input.dataset.source = instructions;
    }
    $('assignment-title').textContent = doc.title; $('assignment-instructions').textContent = instructions || '問題文は設定されていません。';
    $('edit-lesson').hidden = !!lessonPreview; $('edit-lesson').disabled = !!trace;
    for (const id of ['lesson-instructions','apply-lesson','preview-lesson','download-lesson']) $(id).disabled = !!trace || !enabled;
    $('lesson-lock-summary').textContent = `固定：図形 ${doc.nodes.filter(n => n.locked).length} 個・線 ${doc.edges.filter(e => e.locked).length} 本・担当領域 ${doc.lanes.filter(l => l.locked).length} 個`;
    $('lesson-banner').hidden = !student && (enabled || !instructions);
    $('lesson-banner-text').textContent = lessonPreview ? '生徒の画面を確認中 — 確認を終了すると元のひな形に戻ります' : enabled ? '課題に取り組む' : '問題文付きの図を開いています';
    $('end-lesson-preview').hidden = !lessonPreview;
  }
  function renderInspection() {
    if (pane !== 'inspect') return;
    const list = $('inspection-list'), items = C.inspectDocument(doc);
    const focused = document.activeElement?.dataset.inspectionKey;
    const signature = JSON.stringify([!!trace, items, items.map(item => item.ids.map(id => {
      const o = node(id) || edge(id); return o?.text || o?.label?.text || '';
    }))]);
    $('inspection-summary').textContent = items.length ? `見直し候補 ${items.length} 件` : content() ? '見直し候補はありません。図の流れや条件も自分で確かめてみましょう。' : '図を描くと、見直し候補をここに表示します。';
    $('inspection-trace-note').hidden = !trace;
    if (list.dataset.signature === signature) return;
    list.dataset.signature = signature; list.replaceChildren();
    items.forEach(item => {
      const li = document.createElement('li'), button = document.createElement('button');
      button.type = 'button'; button.disabled = !!trace;
      button.dataset.inspectionKey = JSON.stringify([item.code, ...item.ids]); button.dataset.inspectionIds = JSON.stringify(item.ids);
      const title = document.createElement('strong'), message = document.createElement('span');
      title.textContent = item.ids.map(id => { const n = node(id), e = edge(id); return n ? describeNode(n) : e?.label.text || '矢印'; }).join(' → ');
      message.textContent = item.message; button.append(title, message); li.append(button); list.append(li);
    });
    if (focused) [...list.querySelectorAll('button')].find(el => el.dataset.inspectionKey === focused)?.focus({ preventScroll: true });
  }
  $('inspection-list').onclick = event => {
    const button = event.target.closest('[data-inspection-ids]'); if (!button || trace) return;
    finishText(); cancelGesture(); layer = 'diagram'; tool = 'select'; laneId = null;
    selected = new Set(expand(JSON.parse(button.dataset.inspectionIds))); pane = ''; render();
    // Free endpoints and group members need to stay visible along with the finding.
    const selectionKey = [...selected].join(','), focusSelection = () => {
      if (trace || pane || [...selected].join(',') !== selectionKey) return;
      const parts = [...selectedNodes().map(n => ({ x: n.x, y: n.y, w: n.w, h: n.h })), ...selectedEdges().map(e => R.edgeGeometry(doc, e).bounds)];
      if (!parts.length) return;
      const x = Math.min(...parts.map(p => p.x)), y = Math.min(...parts.map(p => p.y));
      const w = Math.max(...parts.map(p => p.x + p.w)) - x, h = Math.max(...parts.map(p => p.y + p.h)) - y;
      const top = Math.max(20, Math.min(stage.clientHeight - 120, $('format-bar').offsetHeight + 20)), width = Math.max(100, stage.clientWidth - 60), height = Math.max(100, stage.clientHeight - top - 45);
      view.scale = Math.max(.0001, Math.min(width / Math.max(w, 100), height / Math.max(h, 80), 1.5));
      view.x = (stage.clientWidth - w * view.scale) / 2 - x * view.scale;
      view.y = top + (height - h * view.scale) / 2 - y * view.scale; updateView();
    };
    focusSelection();
    // Closing the pane resizes the stage; keep the finding centered after that layout.
    requestAnimationFrame(() => requestAnimationFrame(focusSelection));
    const id = JSON.parse(button.dataset.inspectionIds).at(-1);
    [...$('scene').querySelectorAll('[data-node],[data-edge]')].find(el => el.dataset.node === id || el.dataset.edge === id)?.focus({ preventScroll: true });
  };
  function applyLesson() {
    if (trace || studentMode() || !lessonToolsEnabled()) return false;
    const instructions = $('lesson-instructions').value.slice(0, 10000);
    if (doc.lesson?.instructions === instructions) return true;
    return change(() => { doc.lesson = { instructions, studentMode: false }; }, { allowLessonChange: true });
  }
  function previewLesson() {
    if (!applyLesson()) return;
    finishText(); cancelGesture();
    lessonPreview = { doc: C.clone(doc), saved, committed: C.clone(committed), history, view: { ...view }, selected: [...selected], laneId, layer };
    doc = C.clone(doc); doc.lesson.studentMode = true; history = new C.History(doc); committed = C.clone(doc); saved = C.serializeDocument(doc);
    selected.clear(); laneId = null; layer = 'diagram'; tool = 'select'; pane = 'lesson'; render(); fit(); $('end-lesson-preview').focus();
  }
  function endLessonPreview() {
    if (!lessonPreview) return;
    finishText(true); cancelGesture(); trace = null; traceStartId = null;
    const original = lessonPreview; lessonPreview = null;
    doc = original.doc; saved = original.saved; committed = original.committed; history = original.history; view = original.view;
    selected = new Set(original.selected); laneId = original.laneId; layer = original.layer; tool = 'select'; pane = 'lesson';
    render(); writeRecovery(); $('preview-lesson').focus(); notify('確認を終了し、元のひな形に戻りました');
  }
  const traceName = id => [...describeNode(node(id)).replace(/\s+/g, ' ')].slice(0, 70).join('');
  function renderTrace() {
    $('trace-bar').hidden = !trace; $('trace-start-panel').hidden = !!trace; $('trace-history-panel').hidden = !trace;
    if (!trace) {
      const picker = $('trace-start-node'), preferred = C.traceStarts(doc), usable = doc.nodes.filter(n => n.kind !== 'text');
      const ordered = [...preferred.map(node).filter(Boolean), ...usable.filter(n => !preferred.includes(n.id))];
      const signature = JSON.stringify(ordered.map(n => [n.id, n.text, n.kind]));
      if (picker.dataset.choices !== signature) {
        const value = picker.value; picker.replaceChildren(); ordered.forEach(n => picker.add(new Option(traceName(n.id), n.id)));
        if (ordered.some(n => n.id === value)) picker.value = value; picker.dataset.choices = signature;
      }
      $('trace-start').disabled = !ordered.length; picker.disabled = !ordered.length;
      $('trace-history').replaceChildren(); return;
    }
    const unique = [...new Set(trace.current)], options = C.traceOptions(doc, trace);
    $('trace-current').textContent = trace.status === 'complete' ? 'トレース完了' : trace.status === 'limit' ? '1000手まで確認しました' : unique.length ? `現在${trace.current.length > 1 ? `（${trace.current.length}か所）` : ''}：${unique.map(traceName).join(' ／ ')}` : '合流待ち';
    const waits = trace.waiting.map(w => `${traceName(w.nodeId)}：${w.arrived} / ${w.required} 本が到着`);
    $('trace-message').textContent = waits.length ? `合流待ち — ${waits.join(' ／ ')}` : trace.status === 'complete' ? '「1つ戻る」で選び直すか、トレースを終了できます。' : trace.status === 'limit' ? '続けて確認するときは、トレースを終了して開始する図形を選び直してください。' : '進む矢印を選んでください。';
    $('trace-back').disabled = !trace.history.length;
    const choices = $('trace-choices'), active = document.activeElement?.closest('[data-trace-node]');
    const activeKey = active ? [active.dataset.traceNode, active.dataset.traceEdge] : null;
    choices.replaceChildren();
    options.forEach(option => {
      const button = document.createElement('button'), e = edge(option.edgeId);
      const nextId = e ? e.from.nodeId === option.nodeId ? e.to.nodeId : e.from.nodeId : null;
      button.type = 'button'; button.dataset.traceNode = option.nodeId; button.dataset.traceEdge = option.edgeId || '';
      const label = [...option.label].slice(0, 100).join('');
      button.textContent = `${unique.length > 1 ? `${traceName(option.nodeId)}：` : ''}${label}${nextId ? ` → ${traceName(nextId)}` : ''}${option.reason ? `（${option.reason}）` : ''}`;
      button.disabled = option.status !== 'ready'; button.className = button.disabled ? '' : 'primary';
      button.onclick = () => advanceTrace(option.nodeId, option.edgeId); choices.append(button);
    });
    if (activeKey) [...choices.children].find(button => button.dataset.traceNode === activeKey[0] && button.dataset.traceEdge === activeKey[1])?.focus({ preventScroll: true });
    $('trace-history-summary').textContent = `${trace.history.length} 手進みました。開始：${traceName(traceStartId)}`;
    const list = $('trace-history'); list.replaceChildren();
    trace.history.forEach(record => { const item = document.createElement('li'); item.textContent = `${traceName(record.nodeId)} — ${record.label}`; list.append(item); });
  }
  function focusTraceChoice() { ($('trace-choices').querySelector('button:not(:disabled)') || $('trace-back')).focus({ preventScroll: true }); }
  function advanceTrace(nodeId, edgeId) {
    try { trace = C.stepTrace(doc, trace, nodeId, edgeId); render(); focusTraceChoice(); }
    catch (error) { notify(error.message, true); }
  }
  function stopTrace() {
    if (!trace) return;
    cancelGesture(); trace = null; traceStartId = null; tool = 'select'; render(); document.querySelector('[data-pane-button="trace"]').focus();
  }
  function renderOverlay() {
    const s = view.scale, parts = [R.learningOverlay(doc, { selectedIds: [...selected], trace, scale: s })], blue = 'var(--accent)', placing = tool.startsWith('node:') || tool === 'branch';
    if (trace) { $('overlay').innerHTML = parts.join(''); return; }
    function circle(p, attrs, radius = 5) { parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${radius / s}" fill="var(--panel)" stroke="${blue}" stroke-width="${1.5 / s}" ${attrs}/>`); }
    function ports(n, interactive) {
      const seen = new Set(), candidates = [];
      for (const side of ['top','bottom','left','right']) for (const offset of $('snap').checked ? portOffsets(n, side) : [.5]) candidates.push({ side, offset, p: R.sidePoint(n, side, offset) });
      candidates.sort((a,b) => Math.abs(a.offset-.5)-Math.abs(b.offset-.5));
      for (const {side, offset, p} of candidates) {
        const key = `${Math.round(p.x*s)},${Math.round(p.y*s)}`; if (seen.has(key)) continue; seen.add(key);
        const attrs = `${interactive ? 'data-port' : 'data-snap-guide'}="${esc(n.id)}" data-side="${side}" data-offset="${offset}"`;
        if (interactive) parts.push(`<circle cx="${p.x}" cy="${p.y}" r="${9 / s}" fill="transparent" ${attrs}/>`);
        circle(p, attrs, offset === .5 ? 4 : 3);
      }
    }
    if (layer === 'diagram' && !placing) {
      selectedNodes().forEach(n => {
        parts.push(`<rect x="${n.x - 4 / s}" y="${n.y - 4 / s}" width="${n.w + 8 / s}" height="${n.h + 8 / s}" fill="none" stroke="${blue}" stroke-width="${1 / s}" stroke-dasharray="${4 / s} ${3 / s}"/>`);
        if (selected.size === 1) {
          if (!n.locked) circle({ x: n.x + n.w + 12/s, y: n.y + n.h + 12/s }, `data-handle="resize" data-id="${esc(n.id)}"`);
          if (n.kind !== 'text' && !connection) ports(n, true);
        }
      });
      selectedEdges().forEach(e => {
        const g = R.edgeGeometry(doc, e);
        parts.push(`<path d="${g.path}" fill="none" stroke="${blue}" stroke-width="${1 / s}" stroke-dasharray="${4 / s} ${3 / s}"/>`);
        if (selected.size === 1 && !e.locked) {
          ['from', 'to'].forEach(end => circle(g[end], `data-handle="endpoint" data-endpoint="${end}" data-id="${esc(e.id)}"`, 6));
          const r = 7 / s, p = g.handle;
          parts.push(`<path d="M${p.x} ${p.y-r}l${r} ${r}-${r} ${r}-${r}-${r}Z" fill="var(--panel)" stroke="${blue}" stroke-width="${1.5/s}" data-handle="bend" data-id="${esc(e.id)}"/>`);
        }
      });
    } else if (layer === 'lanes') {
      const lanes = orderedLanes();
      lanes.forEach((l, index) => {
        if (l.id === laneId) parts.push(`<rect x="${l.x}" y="${l.y}" width="${l.w}" height="${l.h}" fill="none" stroke="${blue}" stroke-width="${2/s}"/>`);
        const next = lanes[index + 1], shared = next && Math.abs(l.x + l.w - next.x) < .001;
        if (!l.locked && (!shared || !next.locked)) parts.push(`<rect x="${l.x + l.w - 8/s}" y="${l.y}" width="${16/s}" height="${l.h}" fill="transparent" data-boundary="${esc(l.id)}"/>`);
      });
    }
    if (insertionPreview && canInsert()) {
      const e = edge(insertionPreview.id);
      if (e) {
        const p = edgePlacement(e, insertionPreview.point);
        if (p) {
          parts.push(`<path d="${R.edgeGeometry(doc,e).path}" fill="none" stroke="${blue}" stroke-width="${4/s}" opacity=".65"/>`);
          parts.push(`<circle data-insertion-preview="${esc(e.id)}" cx="${p.x}" cy="${p.y}" r="${10/s}" fill="var(--panel)" stroke="${blue}" stroke-width="${2/s}"/><path d="M${p.x-5/s} ${p.y}h${10/s}M${p.x} ${p.y-5/s}v${10/s}" stroke="${blue}" stroke-width="${1.5/s}"/>`);
        }
      }
    }
    if (connection) {
      const ghost = connectionEdge(connection.to || connection.from);
      try { const g = R.edgeGeometry({ ...doc, edges: [...doc.edges, ghost] }, ghost); parts.push(`<path d="${g.path}" fill="none" stroke="${blue}" stroke-width="${2/s}" stroke-dasharray="${5/s} ${4/s}"/>`); } catch { /* Coincident free endpoints during the first click. */ }
      if (connection.to?.nodeId && $('snap').checked) ports(node(connection.to.nodeId), false);
    } else if (drag?.type === 'endpoint' && $('snap').checked) {
      const ep = edge(drag.id)[drag.endpoint]; if (ep.nodeId) ports(node(ep.nodeId), false);
    }
    if (drag?.type === 'marquee') {
      const a = drag.start, b = drag.current || a;
      parts.push(`<rect x="${Math.min(a.x,b.x)}" y="${Math.min(a.y,b.y)}" width="${Math.abs(a.x-b.x)}" height="${Math.abs(a.y-b.y)}" fill="#2563eb15" stroke="${blue}" stroke-width="${1/s}"/>`);
    }
    if (drag?.type === 'move') for (const guide of drag.guides || []) {
      const xAxis = guide.axis === 'x', x1 = xAxis ? guide.value : guide.start, y1 = xAxis ? guide.start : guide.value;
      const x2 = xAxis ? guide.value : guide.end, y2 = xAxis ? guide.end : guide.value;
      parts.push(`<line data-alignment-guide="${guide.axis}" x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" stroke="${blue}" stroke-width="${1.5/s}" stroke-dasharray="${5/s} ${3/s}"/>`);
    }
    $('overlay').innerHTML = parts.join('');
  }
  function setField(id, value) { const el = $(id); if (document.activeElement !== el) el.value = value; }
  const nodeShapeValue = n => n.kind === 'state' ? `state:${n.variant || 'circle'}` : n.kind;
  function renderShapeChoices(nodes, edges) {
    if (nodes.length) {
      const kinds = Object.entries(C.NODE_DEFS).filter(([kind,def]) => def.modes.includes(doc.diagramType) || nodes.some(n => n.kind === kind));
      const choices = kinds.flatMap(([kind,def]) => kind === 'state' ? [['state:circle','状態（円）'],['state:round','状態（角丸）']] : [[kind,kind === 'text' ? '文字（枠なし）' : def.label]]);
      const picker = $('node-shape'), signature = choices.map(c => c[0]).join(',');
      if (picker.dataset.choices !== signature) {
        picker.replaceChildren();
        const mixed = new Option('複数の形',''); mixed.disabled = true; mixed.hidden = true; picker.add(mixed);
        choices.forEach(([value,label]) => picker.add(new Option(label,value))); picker.dataset.choices = signature;
      }
      const values = new Set(nodes.map(nodeShapeValue)); picker.value = values.size === 1 ? [...values][0] : '';
    }
    if (edges.length) {
      const loop = edges.some(e => e.from.nodeId && e.from.nodeId === e.to.nodeId);
      $('edge-kind').querySelector('[value="straight"]').disabled = loop;
      $('edge-kind').title = loop ? '自己ループは直角・曲線に変更できます' : '線の形を変えても接続先とラベルは保持します';
      const kinds = new Set(edges.map(e => e.kind)), heads = new Set(edges.map(e => e.head || 'end'));
      $('edge-kind').value = kinds.size === 1 ? [...kinds][0] : ''; $('edge-head').value = heads.size === 1 ? [...heads][0] : '';
    }
  }
  function renderFormat() {
    const list = objects(), n = selectedNodes()[0], e = selectedEdges()[0], single = list.length === 1 ? list[0] : null;
    $('format-bar').hidden = !!trace || layer !== 'diagram' || !list.length;
    $('lane-bar').hidden = !!trace || layer !== 'lanes' || !lane();
    if ($('format-bar').hidden) {
      if ($('format-bar').contains(document.activeElement)) canvas.focus({ preventScroll: true });
      $$('#format-bar details.menu').forEach(menu => { menu.open = false; });
    }
    $('locked-selection').hidden = !list.some(o => o.locked);
    $('format-bar').querySelectorAll('button,input,select').forEach(el => { el.disabled = !selectionEditable(); });
    if (lane()) {
      const picker = $('lane-select'), lanes = orderedLanes(), index = lanes.findIndex(l => l.id === laneId);
      const signature = JSON.stringify(lanes.map(l => [l.id, l.title]));
      if (picker.dataset.choices !== signature) { picker.replaceChildren(); lanes.forEach(l => { const option = document.createElement('option'); option.value = l.id; option.textContent = l.title || '担当領域'; picker.append(option); }); picker.dataset.choices = signature; }
      picker.value = laneId;
      setField('lane-title', lane().title); setField('lane-width', lane().w); setField('lane-height', lane().h);
      ['lane-title','lane-width','lane-height'].forEach(id => { $(id).disabled = !!trace || !!lane().locked; });
      $('lock-lane').disabled = !!trace || studentMode(); $('lock-lane').textContent = lane().locked ? '領域の固定を解除' : '領域を固定'; $('lock-lane').setAttribute('aria-pressed', String(!!lane().locked));
      $('lane-left').disabled = !!trace || !!lane().locked || index === 0 || !!lanes[index - 1]?.locked;
      $('lane-right').disabled = !!trace || !!lane().locked || index === lanes.length - 1 || !!lanes[index + 1]?.locked;
      $('delete-lane').disabled = !!trace || !!lane().locked || doc.nodes.some(n => n.laneId === laneId && n.locked);
      $('lane-edit-note').textContent = lane().locked ? 'この担当領域は固定されています。' : doc.nodes.some(n => n.laneId === laneId && n.locked) ? '固定された図形の担当領域は、移動・削除できません。' : '削除しても図形・矢印は残ります。';
    }
    const textAllowed = !!(e || (n && !['initial', 'final', 'junction', 'fork', 'join'].includes(n.kind)));
    $('edit-text').hidden = !single || !textAllowed;
    $$('[data-for]').forEach(el => {
      const type = el.dataset.for;
      el.hidden = type === 'node' ? !n : type === 'edge' ? !e : type === 'multi' ? selectedNodes().length < 2 : type === 'size' ? !n || list.length !== 1 : !textAllowed;
    });
    $('insert-process').hidden = !single || !e || doc.diagramType === 'state';
    if ($('align-menu').hidden) $('align-menu').open = false;
    if (!list.length) return;
    const o = single || list[0], style = o.style || {};
    setField('font-size', style.fontSize || 16); setField('stroke-color', style.stroke || '#253140'); setField('fill-color', style.fill || '#ffffff'); setField('text-color', style.color || '#253140'); setField('stroke-width', style.strokeWidth || 2);
    $('bold').setAttribute('aria-pressed', String(!!style.bold)); $('dashed').checked = !!style.dashed;
    renderShapeChoices(selectedNodes(),selectedEdges());
    renderColors();
    if (n) { setField('node-width', n.w); setField('node-height', n.h); }
  }
  function render() {
    if (pane === 'lesson' && !lessonToolsEnabled()) pane = '';
    if (doc.diagramType !== 'activity' && layer === 'lanes') { layer = 'diagram'; laneId = null; }
    prune(); renderPalette();
    const active = document.activeElement?.closest?.('[data-node],[data-edge],[data-lane]');
    const focusId = active?.getAttribute('data-node') || active?.getAttribute('data-edge') || active?.getAttribute('data-lane');
    $('scene').innerHTML = R.sceneMarkup(doc, { interactive: true, idPrefix: 'canvas', theme: canvasTheme() });
    if (layer === 'lanes' || trace) $$('[data-node],[data-edge]').forEach(el => el.setAttribute('tabindex', '-1'));
    if (layer === 'diagram' || trace) $$('[data-lane]').forEach(el => el.setAttribute('tabindex', '-1'));
    renderFormat(); updateView();
    setField('diagram-type', doc.diagramType); setField('document-title', doc.title);
    $('layer-menu').hidden = !!trace || doc.diagramType !== 'activity'; $('create-lanes').hidden = doc.lanes.length > 0;
    if ($('layer-menu').hidden) $('layer-menu').open = false;
    $('add-lane').disabled = !!trace || doc.lanes.length >= 50; $('add-lane').title = doc.lanes.length >= 50 ? '担当領域は50個までです' : '右端に空の担当領域を追加します';
    $('create-lanes').disabled = !!trace || doc.lanes.length > 0;
    $('diagram-type').disabled = !!trace || studentMode(); $('document-title').disabled = !!trace;
    stage.dataset.layer = layer; canvas.dataset.tool = tool; canvas.dataset.placing = String(tool.startsWith('node:') || tool.startsWith('edge:') || tool === 'branch' || !!connection);
    stage.dataset.tracing = String(!!trace);
    $('app').dataset.tracing = String(!!trace);
    $$('[data-tool]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.tool === tool)));
    $$('[data-tool]').forEach(b => { b.disabled = !!trace && !['select','pan'].includes(b.dataset.tool); });
    $$('button[data-layer]').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.layer === layer)));
    $('undo').disabled = !!trace || !history.canUndo; $('redo').disabled = !!trace || !history.canRedo;
    ['copy-button', 'duplicate-button'].forEach(id => { $(id).disabled = !!trace || !selected.size; });
    $('delete-button').disabled = layer === 'lanes' ? !!trace || !lane() || !!lane()?.locked || doc.nodes.some(n => n.laneId === laneId && n.locked) : !selectionEditable(); $('paste-button').disabled = !!trace || !clipboard; $('connect-button').disabled = !!trace;
    const groups = doc.groups.filter(g => g.memberIds.some(id => selected.has(id))), allLocked = objects().length > 0 && objects().every(o => o.locked);
    $('group-button').disabled = !selectionEditable() || selected.size < 2 || groups.length === 1 && groups[0].memberIds.length === selected.size;
    $('ungroup-button').disabled = !selectionEditable() || !groups.length;
    $('lock-button').disabled = !!trace || studentMode() || !selected.size; $('lock-button').setAttribute('aria-pressed', String(allLocked)); $('lock-label').textContent = allLocked ? '固定を解除' : '固定';
    renderSizeStyleTools();
    ['new-file','open-file','autosave-settings'].forEach(id => { $(id).disabled = !!trace || !!lessonPreview; });
    $$('[data-template]').forEach(button => { button.disabled = !!trace || !!lessonPreview; });
    $('empty-hint').hidden = !!content() || !!doc.lanes.length || tool !== 'select';
    $('selection-status').textContent = trace ? '手動トレース中' : layer === 'lanes' ? lane() ? `${lane().title}を編集中` : '担当領域を選択' : connection ? '接続先をクリック（Escで中止）' : canInsert() ? '空白に配置・線をクリックして途中に挿入' : tool === 'branch' ? '作図画面をクリックして分岐セットを配置' : tool.startsWith('node:') ? '作図画面をクリックして配置' : selected.size ? `${groups.length ? `${groups.length}グループ・` : ''}${selectedNodes().length}図形・${selectedEdges().length}線を選択${allLocked ? '（固定）' : ''}` : '部品を選んで配置';
    $('canvas-help').textContent = canInsert() ? '処理を置く位置、または挿入する線をクリック・Escで中止' : tool === 'branch' ? '条件・はい／いいえの処理・合流点をまとめて配置・Escで中止' : 'Space＋ドラッグで画面移動・⌘＋ホイールで拡大縮小';
    updateSaveStatus();
    $('side-panel').classList.toggle('open', !!pane);
    $$('[data-pane]').forEach(el => { el.hidden = el.dataset.pane !== pane; });
    $$('[data-pane-button]').forEach(el => el.setAttribute('aria-pressed', String(el.dataset.paneButton === pane)));
    renderExport();
    renderLesson(); renderTrace(); renderInspection();
    layoutToolbar(); positionMenus();
    if (focusId && !restoringFocus) {
      const target = [...$('scene').querySelectorAll('[data-node],[data-edge],[data-lane]')].find(el => el.getAttribute('data-node') === focusId || el.getAttribute('data-edge') === focusId || el.getAttribute('data-lane') === focusId);
      if (target) { restoringFocus = true; target.focus({ preventScroll: true }); restoringFocus = false; }
    }
  }
  function setTool(next) { if (trace && !['select','pan'].includes(next)) return; finishText(); cancelGesture(); tool = next; layer = 'diagram'; laneId = null; render(); }
  function select(ids) { if (trace) return; selected = new Set(expand(ids)); laneId = null; render(); }
  function assignLane(n) { n.laneId = C.findLane(doc, n.x + n.w / 2, n.y + n.h / 2)?.id || null; }
  function addNode(kind, p) {
    if (trace) return;
    const def = C.NODE_DEFS[kind];
    if (!def) return;
    const n = C.createNode(kind, snapped(p.x - def.w / 2), snapped(p.y - def.h / 2));
    assignLane(n); doc.nodes.push(n); selected = new Set([n.id]); laneId = null; tool = 'select'; remember();
    if (!['initial', 'final', 'junction', 'fork', 'join'].includes(kind)) startText(n.id, 'node');
  }
  function insertProcess(id, position) {
    let result = null;
    change(() => {
      const e = edge(id); if (!e) return;
      const g = R.edgeGeometry(doc,e), p = edgePlacement(e,position), kind = doc.diagramType === 'activity' ? 'action' : 'process', def = C.NODE_DEFS[kind];
      if (!p) throw new Error('この線の途中には処理を置く余白がありません。図形を離すか、線の経路を調整してください。');
      const n = C.createNode(kind, p.x-def.w/2, p.y-def.h/2);
      const vertical = Math.abs(p.dy) >= Math.abs(p.dx), forward = vertical ? p.dy >= 0 : p.dx >= 0;
      let exitSide = vertical ? forward ? 'bottom':'top' : forward ? 'right':'left';
      let entrySide = { bottom:'top',top:'bottom',right:'left',left:'right' }[exitSide];
      if (!p.direction) ({entrySide,exitSide}=routeSides(g.points,n));
      function curveBend(t) {
        const lengths = g.points.slice(1).map((b,i) => Math.hypot(b.x-g.points[i].x,b.y-g.points[i].y));
        let remain = lengths.reduce((a,b) => a+b,0)*t;
        for (let i=0;i<lengths.length;i++) { if (remain<=lengths[i]) { const r=lengths[i]?remain/lengths[i]:0; return {x:g.points[i].x+(g.points[i+1].x-g.points[i].x)*r,y:g.points[i].y+(g.points[i+1].y-g.points[i].y)*r}; } remain-=lengths[i]; }
        return g.to;
      }
      result = C.insertNodeOnEdge(doc,id,n,{ entrySide:e.kind==='orthogonal'?entrySide:'auto', exitSide:e.kind==='orthogonal'?exitSide:'auto', direction:p.direction,
        incomingBend:e.kind==='curve'?curveBend(p.t/2):null, outgoingBend:e.kind==='curve'?curveBend((p.t+1)/2):null });
      clearInsertedLabel(edge(result.edgeIds[0]));
      selected = new Set([result.nodeId]); tool = 'select'; insertionPreview = null; laneId = null;
    });
    if (result && node(result.nodeId)) { startText(result.nodeId,'node'); notify('処理を挿入し、前後の線をつなぎ直しました'); }
  }
  function placeBranch(p) {
    let result = null;
    change(() => { result = C.addBranch(doc,snapped(p.x),snapped(p.y)); selected = new Set(result.ids); tool = 'select'; laneId = null; });
    if (result && node(result.nodeId)) { fit(); startText(result.nodeId,'node'); notify('分岐セットを追加しました。まとめて選択しています'); }
  }
  function startText(id, type) {
    finishText();
    const item = type === 'node' ? node(id) : type === 'edge' ? edge(id) : doc.lanes.find(l => l.id === id);
    if (!item || trace) return;
    if (item.locked) { notify('固定された部品です。編集するには固定を解除してください。'); return; }
    const text = type === 'edge' ? item.label?.text || '' : type === 'lane' ? item.title : item.text || '';
    const p = type === 'edge' ? R.edgeGeometry(doc, item).label : type === 'lane' ? { x: item.x + item.w / 2, y: item.y + 16 } : { x: item.x + item.w / 2, y: item.y + item.h / 2 };
    const width = clamp(type === 'node' ? item.w * view.scale : 230, 140, Math.max(140, stage.clientWidth - 20));
    const height = type === 'node' ? clamp(item.h * view.scale, 58, 220) : 80;
    editing = { id, type, original: text };
    const input = $('inline-editor'); input.hidden = false; input.value = text;
    input.style.width = `${width}px`; input.style.height = `${height}px`;
    input.style.left = `${clamp(p.x * view.scale + view.x - width / 2, 8, Math.max(8, stage.clientWidth - width - 8))}px`;
    input.style.top = `${clamp(p.y * view.scale + view.y - height / 2, 8, Math.max(8, stage.clientHeight - height - 8))}px`;
    input.style.fontSize = `${clamp((item.style?.fontSize || 16) * view.scale, 16, 32)}px`;
    input.focus(); input.select();
  }
  function finishText(cancel = false) {
    if (!editing) return;
    const edit = editing, value = $('inline-editor').value.slice(0, 10000); editing = null; $('inline-editor').hidden = true;
    if (cancel || value === edit.original) return;
    const item = edit.type === 'node' ? node(edit.id) : edit.type === 'edge' ? edge(edit.id) : doc.lanes.find(l => l.id === edit.id);
    if (!item) return;
    if (edit.type === 'edge') item.label = { t: .5, dx: 0, dy: -12, ...item.label, text: value };
    else if (edit.type === 'lane') item.title = value;
    else { item.text = value; fitTextNode(item); }
    remember();
  }
  function fitTextNode(n) {
    if (!n || ['initial', 'final', 'junction', 'fork', 'join'].includes(n.kind)) return;
    if (R.fitNode) { const size = R.fitNode(n); n.w = Math.max(n.w, size.w); n.h = Math.max(n.h, size.h); }
    else { const lines = String(n.text).split('\n'); const fs = n.style?.fontSize || 16; n.w = Math.max(n.w, Math.min(500, Math.max(...lines.map(l => l.length)) * fs + 28)); n.h = Math.max(n.h, lines.length * fs * 1.4 + 20); }
  }
  function finishConnection(to) {
    if (!connection) return;
    const from = connection.from;
    if (!from.nodeId && !to.nodeId && Math.hypot(from.x - to.x, from.y - to.y) < 5) { connection = null; render(); return; }
    const e = connectionEdge(to);
    doc.edges.push(e); connection = null; drag = null; selected = new Set([e.id]); tool = 'select'; remember();
  }
  function cancelGesture() {
    if (drag?.before) doc = drag.before;
    drag = null; connection = null; insertionPreview = null;
  }
  function beginDrag(type, p, extra = {}) {
    if (trace && type !== 'pan') return;
    if (type === 'move' && !selectionEditable() || !['pan','connect','marquee','move'].includes(type) && !editable([extra.id])) return;
    drag = { type, start: p, before: C.clone(doc), ...extra };
    if (type === 'label') drag.labelOrigin = R.edgeGeometry(doc, edge(extra.id)).labelOffset;
  }
  function moveGroup(before, dx, dy, ids = selected) {
    doc.nodes.forEach(n => { if (ids.has(n.id)) { const old = before.nodes.find(o => o.id === n.id); n.x = old.x + dx; n.y = old.y + dy; } });
    doc.edges.forEach(e => {
      const old = before.edges.find(o => o.id === e.id);
      if (!old) return;
      const internal = e.from.nodeId && e.to.nodeId && ids.has(e.from.nodeId) && ids.has(e.to.nodeId);
      if (!e.locked && (internal || ids.has(e.id))) {
        if (old.bend) e.bend = { x: old.bend.x + dx, y: old.bend.y + dy };
        for (const end of ['from', 'to']) if (!old[end].nodeId) e[end] = { x: old[end].x + dx, y: old[end].y + dy };
      }
    });
  }
  function updateMove(temporaryFree = false) {
    if (drag?.type !== 'move' || !drag.moved || !drag.rawDelta) return;
    const { dx, dy } = drag.rawDelta;
    const viewport = { x: -view.x/view.scale, y: -view.y/view.scale, w: stage.clientWidth/view.scale, h: stage.clientHeight/view.scale };
    const result = !temporaryFree && $('alignment-snap').checked ? R.alignmentSnap(drag.before, [...selected], { dx, dy }, { scale: view.scale, viewport }) : { dx, dy, guides: [] };
    drag.guides = result.guides;
    const moveX = temporaryFree || result.guides.some(g => g.axis === 'x') ? result.dx : snapped(dx);
    const moveY = temporaryFree || result.guides.some(g => g.axis === 'y') ? result.dy : snapped(dy);
    moveGroup(drag.before, moveX, moveY); render();
  }
  function resizeLane(l, desired) {
    const lanes = orderedLanes(), index = lanes.findIndex(item => item.id === l.id), neighbor = lanes[index + 1];
    const next = neighbor && Math.abs(l.x + l.w - neighbor.x) < .001 ? neighbor : null;
    const own = doc.nodes.filter(n => n.laneId === l.id), others = next ? doc.nodes.filter(n => n.laneId === next.id) : [];
    const lower = Math.max(l.x + 140, ...own.map(n => n.x + n.w + 12));
    const upper = next ? Math.min(l.x + 6000, next.x + next.w - 140, ...others.map(n => n.x - 12)) : Math.min(l.x + 6000, neighbor?.x ?? Infinity);
    if (lower > upper) return;
    const boundary = clamp(desired, lower, upper), delta = boundary - l.x - l.w;
    l.w += delta;
    if (next) { next.x += delta; next.w -= delta; }
  }

  canvas.addEventListener('pointerdown', event => {
    if (event.button !== 0 && event.button !== 1) return;
    if (editing) finishText();
    const p = point(event), target = event.target;
    canvas.focus({ preventScroll: true });
    if (event.button === 1 || space || tool === 'pan') beginDrag('pan', p, { screen: { x: event.clientX, y: event.clientY }, view: { ...view } });
    else if (trace) { event.preventDefault(); return; }
    else if (layer === 'lanes') {
      const boundary = target.closest('[data-boundary]')?.dataset.boundary;
      if (boundary) { laneId = boundary; beginDrag('boundary', p, { id: boundary }); }
      else {
        laneId = C.findLane(doc, p.x, p.y)?.id || null; selected.clear();
        const twice = laneId && lastTap?.id === laneId && event.timeStamp - lastTap.time < 400;
        lastTap = laneId ? { id: laneId, time: event.timeStamp, p } : null;
        render(); if (twice) { lastTap = null; startText(laneId, 'lane'); }
      }
    } else {
      const handle = target.closest('[data-handle]'), port = target.closest('[data-port]');
      const hitNode = target.closest('[data-node]')?.dataset.node;
      const hitLabel = target.closest('[data-edge-label]')?.dataset.edgeLabel;
      const hitEdge = hitLabel || target.closest('[data-edge]')?.dataset.edge;
      if (connection && !handle) { finishConnection(endpointAt(p)); event.preventDefault(); return; }
      if (handle) {
        beginDrag(handle.dataset.handle, p, { id: handle.dataset.id, endpoint: handle.dataset.endpoint });
        if (drag?.type === 'bend') drag.origin = R.edgeGeometry(doc, edge(drag.id)).handle;
      } else if (port || tool.startsWith('edge:')) {
        const kind = tool.startsWith('edge:') ? tool.slice(5) : doc.diagramType === 'state' ? 'curve' : 'orthogonal';
        const from = port ? { nodeId: port.dataset.port, side: port.dataset.side, offset: Number(port.dataset.offset) } : endpointAt(p);
        connection = { id: C.uid('edge'), from, to: { ...p }, kind }; beginDrag('connect', p); render();
      } else if (tool === 'branch') { placeBranch(p); event.preventDefault(); return; }
      else if (tool.startsWith('node:')) { if (hitEdge && canInsert()) insertProcess(hitEdge,p); else addNode(tool.slice(5), p); event.preventDefault(); return; }
      else if (hitNode || hitEdge) {
        const id = hitNode || hitEdge;
        if (!event.shiftKey && lastTap?.id === id && event.timeStamp - lastTap.time < 400 && Math.hypot(p.x-lastTap.p.x,p.y-lastTap.p.y)<8/view.scale) {
          lastTap = null; selected = new Set(expand([id])); render(); startText(id, hitNode ? 'node' : 'edge'); event.preventDefault(); return;
        }
        const members = expand([id]);
        if (event.shiftKey) { if (selected.has(id)) members.forEach(member => selected.delete(member)); else members.forEach(member => selected.add(member)); }
        else if (!selected.has(id)) selected = new Set(members);
        laneId = null;
        if (members.length > 1) beginDrag('move', p, { hitId: id });
        else if (hitLabel) beginDrag('label', p, { id, hitId: id });
        else if (hitNode) beginDrag('move', p, { hitId: id });
        else beginDrag('bend', p, { id, hitId: id, origin: R.edgeGeometry(doc, edge(id)).handle });
        render();
      } else {
        const previous = event.shiftKey ? [...selected] : [];
        selected = new Set(previous); laneId = null; beginDrag('marquee', p, { previous }); render();
      }
    }
    if (drag) { drag.pointerId = event.pointerId; canvas.setPointerCapture(event.pointerId); }
    event.preventDefault();
  });
  canvas.addEventListener('pointermove', event => {
    const p = point(event);
    if (!drag && canInsert()) {
      const id = event.target.closest('[data-edge]')?.dataset.edge;
      insertionPreview = id ? { id,point:p } : null; renderOverlay();
    }
    if (connection) { connection.to = endpointAt(p); renderOverlay(); }
    if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const dx = p.x - drag.start.x, dy = p.y - drag.start.y;
    if (Math.hypot(dx, dy) > 3 / view.scale) drag.moved = true;
    if (drag.type === 'pan') {
      view.x = drag.view.x + event.clientX - drag.screen.x; view.y = drag.view.y + event.clientY - drag.screen.y; updateView();
    } else if (drag.type === 'move') { drag.rawDelta = { dx, dy }; updateMove(event.altKey); }
    else if (drag.type === 'resize') {
      const n = node(drag.id), old = drag.before.nodes.find(n => n.id === drag.id);
      n.w = clamp(snapped(old.w + dx), ['initial','final','junction'].includes(n.kind) ? 16 : 40, 4000); n.h = clamp(snapped(old.h + dy), ['fork','join'].includes(n.kind) ? 6 : 20, 4000);
      if (n.kind === 'state' && n.variant !== 'round') n.w = n.h = Math.max(n.w, n.h);
      render();
    } else if (drag.type === 'endpoint') {
      const e = edge(drag.id); e[drag.endpoint] = endpointAt(p);
      if ($('snap').checked && e[drag.endpoint].nodeId && e[drag.endpoint].side === 'auto') e[drag.endpoint] = R.snapEndpoint(doc, e, drag.endpoint);
      render();
    }
    else if (drag.type === 'bend' && drag.moved) { const e = edge(drag.id); if (e.kind === 'straight') e.kind = 'curve'; e.bend = { x: snapped(drag.origin.x + dx), y: snapped(drag.origin.y + dy) }; render(); }
    else if (drag.type === 'label' && drag.moved) {
      const e = edge(drag.id), old = drag.before.edges.find(e => e.id === drag.id);
      e.label = { ...old.label, dx: drag.labelOrigin.x + dx, dy: drag.labelOrigin.y + dy }; render();
    } else if (drag.type === 'boundary') { doc = C.clone(drag.before); resizeLane(doc.lanes.find(l => l.id === drag.id), p.x); render(); }
    else if (drag.type === 'marquee') { drag.current = p; renderOverlay(); }
  });
  canvas.addEventListener('pointerleave', () => { insertionPreview = null; if (!drag) renderOverlay(); });
  canvas.addEventListener('pointerup', event => {
    if (!drag || (drag.pointerId !== undefined && event.pointerId !== drag.pointerId)) return;
    const current = drag, p = point(event);
    lastTap = !current.moved && current.hitId ? { id: current.hitId, time: event.timeStamp, p } : null;
    if (current.type === 'connect') { drag = null; if (current.moved) finishConnection(endpointAt(p)); else render(); }
    else if (current.type === 'marquee') {
      const x1 = Math.min(p.x, current.start.x), x2 = Math.max(p.x, current.start.x), y1 = Math.min(p.y, current.start.y), y2 = Math.max(p.y, current.start.y);
      selected = new Set(current.previous);
      doc.nodes.forEach(n => { if (n.x >= x1 && n.x + n.w <= x2 && n.y >= y1 && n.y + n.h <= y2) selected.add(n.id); });
      drag = null; render();
    } else {
      if (current.type === 'move' && current.moved) selectedNodes().forEach(assignLane);
      drag = null;
      if (current.type === 'pan') persist(); else remember();
      render();
    }
    if (canvas.hasPointerCapture(event.pointerId)) canvas.releasePointerCapture(event.pointerId);
  });
  canvas.addEventListener('pointercancel', () => { cancelGesture(); render(); });
  canvas.addEventListener('lostpointercapture', () => { if (drag) { cancelGesture(); render(); } });
  canvas.addEventListener('dblclick', event => {
    const n = event.target.closest('[data-node]')?.dataset.node;
    const e = event.target.closest('[data-edge-label]')?.dataset.edgeLabel || event.target.closest('[data-edge]')?.dataset.edge;
    if (layer === 'lanes') { const l = C.findLane(doc, point(event).x, point(event).y); if (l) startText(l.id, 'lane'); }
    else if (n) startText(n, 'node'); else if (e) startText(e, 'edge');
  });
  canvas.addEventListener('focusin', event => {
    if (restoringFocus || trace) return;
    if (layer === 'lanes') {
      const id = event.target.closest('[data-lane]')?.dataset.lane;
      if (id && laneId !== id) { finishText(); laneId = id; selected.clear(); render(); }
      return;
    }
    const id = event.target.getAttribute('data-node') || event.target.getAttribute('data-edge');
    if (id && !selected.has(id)) { selected = new Set(expand([id])); render(); }
  });
  canvas.addEventListener('wheel', event => {
    event.preventDefault();
    if (event.ctrlKey || event.metaKey) { const r = canvas.getBoundingClientRect(); zoomTo(view.scale * Math.exp(-event.deltaY * .008), { x: event.clientX - r.left, y: event.clientY - r.top }); }
    else { finishText(); view.x -= event.deltaX; view.y -= event.deltaY; updateView(); persist(); }
  }, { passive: false });

  function selectAll() { if (layer === 'diagram' && !trace) select([...doc.nodes, ...doc.edges].map(o => o.id)); }
  function remove() { if (layer === 'lanes') { deleteLane(); return; } if (!selectionEditable()) return; change(() => { C.removeSelection(doc, [...selected]); selected.clear(); }); }
  function duplicate() { if (!selected.size) return; change(() => { selected = new Set(C.pasteSelection(doc, C.copySelection(doc, [...selected]), 30, 30)); }); }
  function copy() {
    if (!selected.size || trace) return null;
    clipboard = C.copySelection(doc, [...selected]); lastCopied = JSON.stringify(clipboard); pastedCount = 0; render(); return lastCopied;
  }
  function paste(payload = clipboard) {
    if (!payload) return;
    change(() => { pastedCount++; selected = new Set(C.pasteSelection(doc, payload, 24 * pastedCount, 24 * pastedCount)); layer = 'diagram'; laneId = null; });
  }
  function undo() { if (trace) return; finishText(); if (drag || connection) { cancelGesture(); render(); return; } const prior = history.undo(); if (prior) { doc = prior; committed = C.clone(doc); persist(true); render(); } }
  function redo() { if (trace) return; finishText(); if (drag || connection) { cancelGesture(); render(); return; } const next = history.redo(); if (next) { doc = next; committed = C.clone(doc); persist(true); render(); } }
  function setStyle(key, value) { change(() => { objects().forEach(o => { o.style = { ...o.style, [key]: value }; if (key === 'fontSize' && o.w) fitTextNode(o); }); }); }
  function colorObjects(key) { return key === 'fill' ? selectedNodes() : objects(); }
  function validRGB() { return rgbFields.every(id => $(id).validity.valid && Number.isInteger($(id).valueAsNumber)); }
  function renderColors() {
    const picker = $('color-target');
    picker.querySelector('[value="fill"]').disabled = !selectedNodes().length;
    if (picker.value === 'fill' && !selectedNodes().length) picker.value = 'stroke';
    const key = picker.value, items = colorObjects(key), values = new Set(items.map(o => o.style[key].toLowerCase()));
    const mixed = values.size > 1, value = values.values().next().value || '#253140';
    const signature = `${key}:${[...selected].join(',')}`, changedSelection = signature !== colorSelection;
    colorSelection = signature;
    $$('[data-color-input]').forEach(el => { el.hidden = el.dataset.colorInput !== key; });
    setField(colorFields[key], value);
    picker.disabled = !!trace || !objects().length;
    $('color-value').textContent = mixed ? '複数の色：選んだ色をまとめて適用' : `現在の色 ${value.toUpperCase()}`;
    $('current-color-chip').style.setProperty('--chosen-color', value);
    $('current-color-chip').dataset.mixed = String(mixed);
    $$('#color-swatches button').forEach(button => {
      button.setAttribute('aria-pressed', String(!mixed && button.dataset.color === value));
      button.disabled = !selectionEditable();
    });
    rgbFields.forEach((id, i) => {
      if (changedSelection || document.activeElement !== $(id)) $(id).value = mixed ? '' : parseInt(value.slice(1 + i * 2, 3 + i * 2), 16);
      $(id).placeholder = mixed ? '—' : '';
    });
    $('apply-rgb').disabled = !selectionEditable() || !validRGB();
  }
  function applyColor(key, value) {
    if (!Object.hasOwn(colorFields, key) || !selectionEditable() || !/^#[0-9a-f]{6}$/i.test(value)) return;
    change(() => colorObjects(key).forEach(o => { o.style = { ...o.style, [key]: value.toLowerCase() }; }));
  }
  function renderSizeStyleTools() {
    const available = !trace && layer === 'diagram';
    $('match-size-button').disabled = !available || selectedNodes().length < 2;
    $('copy-style-button').disabled = !available || !objects().length;
    $('paste-style-button').disabled = !available || !styleClipboard || !selectionEditable();
    $('paste-style-button').title = !styleClipboard ? '先にコピー元を選んで「書式をコピー」を押します' : objects().some(o => o.locked) ? '固定された部品は書式を変更できません' : 'コピーした書式を、選択した図形・矢印に適用します';
    $('style-clipboard-status').textContent = styleClipboard ? `コピー元：${styleSourceLabel}` : '書式はまだコピーしていません';
  }
  function formatSourceLabel(item, index) {
    const isNode = !!node(item.id), kind = isNode ? C.NODE_DEFS[item.kind].label : '矢印';
    const label = (isNode ? item.text : item.label.text).replace(/\s+/g, ' ').trim();
    const size = isNode ? `・${Math.round(item.w * 10) / 10} × ${Math.round(item.h * 10) / 10}` : '';
    return `${index + 1}. ${[...label].slice(0, 36).join('') || kind}（${kind}${size}${item.locked ? '・固定' : ''}）`;
  }
  function sourceChoices(picker, items) {
    picker.replaceChildren();
    items.forEach((item, index) => picker.add(new Option(formatSourceLabel(item, index), item.id)));
  }
  function updateSizeDialog() {
    const note = $('size-note');
    try {
      const changes = C.matchNodeSize(C.clone(doc), sizeSelection, $('size-reference').value, $('size-dimension').value);
      $('size-apply').disabled = !changes.length; note.dataset.error = 'false';
      note.textContent = changes.length ? `基準以外の ${changes.length} 個の図形を変更します。` : 'すでに同じ大きさにそろっています。';
    } catch (error) {
      $('size-apply').disabled = true; note.dataset.error = 'true'; note.textContent = error.message;
    }
  }
  function copyObjectStyle(sourceId) {
    try {
      const item = node(sourceId) || edge(sourceId);
      const payload = C.copyStyle(doc, sourceId);
      styleSourceLabel = formatSourceLabel(item, 0).replace(/^1\. /, ''); styleClipboard = payload;
      renderSizeStyleTools(); notify('書式をコピーしました。適用先を選び「書式を貼り付け」を押します。');
      return true;
    } catch (error) { notify(error.message, true); return false; }
  }
  function align(kind) {
    if (!selectionEditable()) return;
    change(() => {
      const before = C.clone(doc), used = new Set(), items = [];
      // Keep the relative positions inside each group when aligning several groups.
      for (const n of selectedNodes()) {
        if (used.has(n.id)) continue;
        const ids = new Set(expand([n.id])); ids.forEach(id => used.add(id));
        const nodes = doc.nodes.filter(item => ids.has(item.id)), edges = doc.edges.filter(item => ids.has(item.id));
        const bounds = [...nodes, ...edges.map(e => R.edgeGeometry(doc, e).bounds)];
        const x = Math.min(...bounds.map(b => b.x)), y = Math.min(...bounds.map(b => b.y));
        items.push({ x, y, w: Math.max(...bounds.map(b => b.x + b.w)) - x, h: Math.max(...bounds.map(b => b.y + b.h)) - y, ids });
      }
      if (items.length < 2) return;
      const minX = Math.min(...items.map(n => n.x)), maxX = Math.max(...items.map(n => n.x + n.w));
      const minY = Math.min(...items.map(n => n.y)), maxY = Math.max(...items.map(n => n.y + n.h));
      items.forEach(item => { item.original = { x: item.x, y: item.y }; });
      if (kind === 'horizontal' || kind === 'vertical') {
        if (items.length < 3) return;
        const axis = kind === 'horizontal' ? 'x' : 'y', dim = axis === 'x' ? 'w' : 'h';
        items.sort((a,b) => a[axis] - b[axis]);
        const start = items[0][axis], end = items.at(-1)[axis] + items.at(-1)[dim];
        const gap = (end - start - items.reduce((total,n) => total + n[dim], 0)) / (items.length - 1);
        let p = start; items.forEach(n => { n[axis] = p; p += n[dim] + gap; });
      } else items.forEach(n => { if (kind === 'left') n.x = minX; if (kind === 'center') n.x = (minX + maxX - n.w) / 2; if (kind === 'right') n.x = maxX - n.w; if (kind === 'top') n.y = minY; if (kind === 'middle') n.y = (minY + maxY - n.h) / 2; if (kind === 'bottom') n.y = maxY - n.h; });
      items.forEach(item => moveGroup(before, item.x - item.original.x, item.y - item.original.y, item.ids));
      selectedNodes().forEach(assignLane);
    });
  }
  document.addEventListener('click', event => {
    const button = event.target.closest('button[data-tool]');
    if (button) { setTool(button.dataset.tool); if (event.detail === 0) { if (tool.startsWith('node:')) addNode(tool.slice(5), center()); else if (tool === 'branch') placeBranch(center()); } }
    const alignButton = event.target.closest('[data-align]'); if (alignButton) align(alignButton.dataset.align);
    const paneButton = event.target.closest('[data-pane-button]'); if (paneButton) { pane = pane === paneButton.dataset.paneButton ? '' : paneButton.dataset.paneButton; render(); if (pane === 'trace' && !trace && selectedNodes().length === 1 && selectedNodes()[0].kind !== 'text') $('trace-start-node').value = selectedNodes()[0].id; }
    const layerButton = event.target.closest('[data-layer]'); if (!trace && layerButton && layerButton.matches('button')) { finishText(); cancelGesture(); layer = layerButton.dataset.layer; selected.clear(); laneId = layer === 'lanes' ? orderedLanes()[0]?.id || null : null; tool = 'select'; render(); if (layer === 'lanes') requestAnimationFrame(fit); }
    if (event.target.closest('[data-close-side]')) { const oldPane = pane; pane = ''; render(); document.querySelector(`[data-pane-button="${oldPane}"]`)?.focus(); }
    if (event.target.closest('[data-close-dialog]')) event.target.closest('dialog').close();
    $$('details.menu[open]').forEach(menu => { if (!menu.contains(event.target)) menu.open = false; });
    if (layerButton) $('layer-menu').open = false;
    if (button?.closest('#toolbar-options') || layerButton || !event.target.closest('#toolbar-options,#toolbar-toggle')) setToolbarOpen(false);
  });
  const toolbar = document.querySelector('.toolbar'), toolbarOptions = $('toolbar-options');
  function setToolbarOpen(open, returnFocus = false) {
    const wasFocused = toolbarOptions.contains(document.activeElement);
    toolbarOptions.classList.toggle('is-open', open);
    $('toolbar-toggle').setAttribute('aria-expanded', String(open));
    if (!open && toolbar.dataset.compact === 'true') {
      $$('#toolbar-options details.menu').forEach(menu => { menu.open = false; });
      if (returnFocus || wasFocused && !editing && !isDialog()) $('toolbar-toggle').focus({ preventScroll: true });
    }
    positionMenus();
  }
  function layoutToolbar() {
    const wasCompact = toolbar.dataset.compact === 'true', focused = toolbarOptions.contains(document.activeElement);
    toolbar.dataset.compact = 'false';
    const compact = toolbar.scrollWidth > toolbar.clientWidth;
    toolbar.dataset.compact = String(compact);
    if (!compact) {
      toolbarOptions.classList.remove('is-open'); $('toolbar-toggle').setAttribute('aria-expanded', 'false');
    } else if (!wasCompact && focused) setToolbarOpen(true);
  }
  function positionMenu(menu) {
    if (!menu.open || menu.closest('[hidden]')) return;
    const panel = menu.querySelector(':scope > .menu-panel'), bounds = menu.querySelector('summary').getBoundingClientRect();
    if (!panel || !bounds.width) return;
    const width = document.documentElement.clientWidth, height = window.innerHeight;
    // Read the full content height without expanding the panel and resetting its scroll position.
    const naturalHeight = Math.min(panel.scrollHeight + 2, height - 16), below = height - bounds.bottom - 13, above = bounds.top - 13;
    const downward = below >= Math.min(naturalHeight, 240) || below >= above;
    const maxHeight = Math.min(naturalHeight, Math.max(80, downward ? below : above));
    panel.style.left = `${clamp(bounds.left, 8, Math.max(8, width - panel.offsetWidth - 8))}px`;
    panel.style.right = 'auto';
    panel.style.top = `${clamp(downward ? bounds.bottom + 5 : bounds.top - maxHeight - 5, 8, Math.max(8, height - maxHeight - 8))}px`;
    panel.style.maxHeight = `${maxHeight}px`;
  }
  function positionMenus() {
    if (toolbar?.dataset.compact === 'true' && toolbarOptions.classList.contains('is-open')) {
      const bounds = $('toolbar-toggle').getBoundingClientRect();
      toolbarOptions.style.setProperty('--tools-left', `${Math.max(8, Math.min(bounds.right - toolbarOptions.offsetWidth, document.documentElement.clientWidth - toolbarOptions.offsetWidth - 8))}px`);
      toolbarOptions.style.setProperty('--tools-top', `${bounds.bottom + 5}px`);
      toolbarOptions.style.setProperty('--tools-height', `${Math.max(80, window.innerHeight - bounds.bottom - 13)}px`);
    }
    $$('details.menu[open]').forEach(positionMenu);
  }
  $$('details.menu').forEach(menu => menu.addEventListener('toggle', () => {
    if (!menu.open) return;
    $$('details.menu[open]').forEach(other => { if (other !== menu) other.open = false; });
    positionMenu(menu);
  }));
  $$('details.menu').forEach(menu => menu.querySelector('summary').addEventListener('click', event => {
    event.preventDefault(); menu.open = !menu.open;
    if (menu.open) {
      $$('details.menu[open]').forEach(other => { if (other !== menu) other.open = false; });
      positionMenu(menu);
    }
  }));
  $('toolbar-toggle').onclick = () => setToolbarOpen(!toolbarOptions.classList.contains('is-open'));
  new ResizeObserver(() => { layoutToolbar(); positionMenus(); }).observe(toolbar);
  new ResizeObserver(positionMenus).observe($('format-bar'));
  window.addEventListener('resize', () => { layoutToolbar(); positionMenus(); });
  window.addEventListener('scroll', positionMenus, { passive: true, capture: true });
  $('inline-editor').addEventListener('blur', () => finishText());
  $('inline-editor').addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229) return;
    if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finishText(true); canvas.focus(); }
    else if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) { event.preventDefault(); finishText(); canvas.focus(); }
  });
  $('undo').onclick = undo; $('redo').onclick = redo; $('delete-button').onclick = remove; $('duplicate-button').onclick = duplicate;
  $('copy-button').onclick = () => { const value = copy(); if (value) { navigator.clipboard?.writeText(value).catch(() => {}); notify('コピーしました'); } };
  $('paste-button').onclick = () => { paste(); setToolbarOpen(false); };
  $('match-size-button').onclick = () => {
    if (trace || layer !== 'diagram' || selectedNodes().length < 2) return;
    finishText(); cancelGesture(); sizeSelection = [...selected];
    sourceChoices($('size-reference'), sizeSelection.map(node).filter(Boolean));
    updateSizeDialog(); openDialog($('size-dialog'), $('edit-menu').querySelector('summary'));
  };
  $('size-reference').onchange = updateSizeDialog; $('size-dimension').onchange = updateSizeDialog;
  $('size-form').onsubmit = event => {
    event.preventDefault(); updateSizeDialog(); if ($('size-apply').disabled) return;
    let applied = [];
    if (change(() => { applied = C.matchNodeSize(doc, sizeSelection, $('size-reference').value, $('size-dimension').value); })) {
      $('size-dialog').close(); notify(`${applied.length} 個の図形の大きさをそろえました`);
    }
  };
  const closeEditMenu = () => { $('edit-menu').open = false; $('edit-menu').querySelector('summary').focus({ preventScroll: true }); };
  $('copy-style-button').onclick = () => {
    if (trace || layer !== 'diagram' || !selected.size) return;
    finishText(); cancelGesture();
    const items = [...selected].map(id => node(id) || edge(id)).filter(Boolean);
    if (items.length === 1) { if (copyObjectStyle(items[0].id)) closeEditMenu(); return; }
    sourceChoices($('style-reference'), items);
    openDialog($('style-dialog'), $('edit-menu').querySelector('summary'));
  };
  $('style-form').onsubmit = event => {
    event.preventDefault(); if (copyObjectStyle($('style-reference').value)) $('style-dialog').close();
  };
  $('paste-style-button').onclick = () => {
    if (layer !== 'diagram' || !styleClipboard || !selectionEditable()) return;
    let applied;
    const changed = change(() => { applied = C.pasteStyle(doc, [...selected], styleClipboard); });
    if (applied && (!applied.length || changed)) {
      closeEditMenu(); notify(applied.length ? `${applied.length} 個の部品に書式を貼り付けました` : 'すでに同じ書式です');
    }
  };
  $('group-button').onclick = () => { if (selectionEditable()) change(() => { C.groupSelection(doc, [...selected]); selected = new Set(expand([...selected])); }); };
  $('ungroup-button').onclick = () => { if (selectionEditable()) change(() => C.ungroupSelection(doc, [...selected])); };
  $('lock-button').onclick = () => { if (!selected.size || studentMode()) return; const locked = !objects().every(o => o.locked); change(() => C.setLocked(doc, [...selected], locked), { allowLockChange: true }); };
  $('lock-lane').onclick = () => { if (!lane() || studentMode()) return; change(() => C.setLocked(doc, [laneId], !lane().locked), { allowLockChange: true }); };
  document.addEventListener('copy', event => { if (isInput(event.target) || isDialog() || !selected.size) return; const value = copy(); event.clipboardData.setData('text/plain', value); event.preventDefault(); });
  document.addEventListener('cut', event => { if (isInput(event.target) || isDialog() || !selected.size) return; event.clipboardData.setData('text/plain', copy()); event.preventDefault(); remove(); });
  document.addEventListener('paste', event => {
    if (isInput(event.target) || isDialog()) return;
    const text = event.clipboardData?.getData('text/plain');
    if (!text) return;
    try { const data = JSON.parse(text); if (!Array.isArray(data.nodes) || !Array.isArray(data.edges)) return; clipboard = data; if (text !== lastCopied) pastedCount = 0; paste(data); event.preventDefault(); } catch { /* Ordinary pasted text is left to the browser. */ }
  });
  $('edit-text').onclick = () => { const item = objects()[0]; if (item) startText(item.id, node(item.id) ? 'node' : 'edge'); };
  $('node-shape').onchange = event => {
    const [kind,variant] = event.target.value.split(':');
    change(() => {
      const changed = C.changeNodeShape(doc,selectedNodes().map(n => n.id),kind,{variant});
      changed.forEach(id => { const n=node(id),cx=n.x+n.w/2,cy=n.y+n.h/2; fitTextNode(n); n.x=cx-n.w/2; n.y=cy-n.h/2; });
    });
  };
  $('insert-process').onclick = () => { if (selected.size === 1 && selectedEdges()[0] && doc.diagramType !== 'state') insertProcess(selectedEdges()[0].id); };
  $('font-size').onchange = e => setStyle('fontSize', +e.target.value);
  $('bold').onclick = () => setStyle('bold', $('bold').getAttribute('aria-pressed') !== 'true');
  for (const [key, id] of Object.entries(colorFields)) $(id).onchange = event => applyColor(key, event.target.value);
  paletteColors.forEach(([value, name]) => {
    const button = document.createElement('button'); button.type = 'button'; button.dataset.color = value;
    button.setAttribute('aria-label', `${name} ${value.toUpperCase()}`); button.title = `${name} (${value.toUpperCase()})`; button.setAttribute('aria-pressed', 'false');
    const chip = document.createElement('span'); chip.className = 'color-chip'; chip.style.setProperty('--chosen-color', value); chip.setAttribute('aria-hidden', 'true');
    button.append(chip); $('color-swatches').append(button);
  });
  $('color-swatches').onclick = event => { const button = event.target.closest('button[data-color]'); if (button && !button.disabled) applyColor($('color-target').value, button.dataset.color); };
  $('color-target').onchange = () => { renderColors(); positionMenu($('color-menu')); };
  $('apply-rgb').onclick = () => {
    if (!validRGB()) return;
    applyColor($('color-target').value, '#' + rgbFields.map(id => $(id).valueAsNumber.toString(16).padStart(2, '0')).join(''));
  };
  rgbFields.forEach(id => {
    $(id).addEventListener('input', () => { $('apply-rgb').disabled = !selectionEditable() || !validRGB(); });
    $(id).addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing) { event.preventDefault(); event.stopPropagation(); $('apply-rgb').click(); }
    });
  });
  $('stroke-width').onchange = e => setStyle('strokeWidth', +e.target.value); $('dashed').onchange = e => setStyle('dashed', e.target.checked);
  $('edge-kind').onchange = e => change(() => C.changeEdgeShape(doc,selectedEdges().map(o => o.id),{kind:e.target.value}));
  $('edge-head').onchange = e => change(() => C.changeEdgeShape(doc,selectedEdges().map(o => o.id),{head:e.target.value}));
  $('reverse-edge').onclick = () => change(() => selectedEdges().forEach(o => { [o.from, o.to] = [o.to, o.from]; o.label.t = 1 - (o.label.t ?? .5); }));
  $('reset-route').onclick = () => change(() => selectedEdges().forEach(o => { o.bend = null; }));
  ['node-width','node-height'].forEach(id => { $(id).onchange = event => { const value = Number(event.target.value); if (!Number.isFinite(value) || value <= 0) { renderFormat(); return; } change(() => selectedNodes().forEach(n => { n[id === 'node-width' ? 'w' : 'h'] = clamp(value, 16, 4000); if (n.kind === 'state' && n.variant !== 'round') n.w = n.h = clamp(value,16,4000); })); }; });
  $('fit-text').onclick = () => change(() => selectedNodes().forEach(fitTextNode));
  $('lane-title').onchange = e => change(() => { if (lane()) lane().title = e.target.value; });
  $('lane-select').onchange = e => { finishText(); laneId = e.target.value; render(); };
  $('add-lane').onclick = () => {
    if (trace || doc.diagramType !== 'activity') return;
    $('layer-menu').open = false; setToolbarOpen(false);
    finishText(); cancelGesture();
    if (change(() => { const id = C.addLane(doc); selected.clear(); layer = 'lanes'; laneId = id; tool = 'select'; pane = ''; })) {
      fit(); $('lane-title').focus(); $('lane-title').select(); notify('担当領域を追加しました。名前を入力できます。');
    }
  };
  function shiftLane(direction) {
    if (trace || !lane()) return;
    finishText(); cancelGesture();
    if (change(() => C.moveLane(doc, laneId, direction))) {
      fit(); const button = direction < 0 ? $('lane-left') : $('lane-right'); (button.disabled ? $('lane-select') : button).focus({ preventScroll: true });
    }
  }
  function deleteLane() {
    if (trace || !lane()) return;
    finishText(); cancelGesture();
    const lanes = orderedLanes(), index = lanes.findIndex(l => l.id === laneId), id = laneId;
    if (change(() => { C.removeLane(doc, id); laneId = (lanes[index + 1] || lanes[index - 1])?.id || null; })) {
      fit(); (laneId ? $('lane-select') : toolbar.dataset.compact === 'true' ? $('toolbar-toggle') : $('layer-menu').querySelector('summary')).focus({ preventScroll: true }); notify('担当領域を削除しました。図形・矢印は元の位置に残しています。');
    }
  }
  $('lane-left').onclick = () => shiftLane(-1); $('lane-right').onclick = () => shiftLane(1); $('delete-lane').onclick = deleteLane;
  $('lane-width').onchange = e => { const value = Number(e.target.value); if (Number.isFinite(value) && value > 0) change(() => { if (lane()) resizeLane(lane(), lane().x + value); }); else renderFormat(); };
  $('lane-height').onchange = e => { const value = Number(e.target.value); if (Number.isFinite(value)) change(() => { const bottom = Math.max(180, ...doc.nodes.filter(n => n.laneId).map(n => n.y + n.h + 20)); doc.lanes.forEach(l => { l.h = Math.max(180, value, bottom - l.y); }); }); else renderFormat(); };
  $('create-lanes').onclick = () => { $('layer-menu').open = false; setToolbarOpen(false); change(() => {
    if (doc.lanes.length || doc.diagramType !== 'activity') return;
    const b = R.documentBounds(doc), x = content() ? b.x - 30 : 40, y = content() ? b.y - 65 : 40;
    const w = Math.max(600, b.w + 60), h = Math.max(600, b.h + 110);
    doc.lanes = [{ id: C.uid('lane'), title: '担当1', x, y, w: w / 2, h }, { id: C.uid('lane'), title: '担当2', x: x + w / 2, y, w: w / 2, h }];
    doc.nodes.forEach(assignLane); layer = 'lanes'; laneId = doc.lanes[0].id; requestAnimationFrame(fit);
  }); };
  $('diagram-type').onchange = e => change(() => { doc.diagramType = e.target.value; tool = 'select'; layer = 'diagram'; laneId = null; connection = null; });
  $('document-title').onchange = e => change(() => { doc.title = e.target.value.trim() || '無題の図'; });
  $('zoom-in').onclick = () => zoomTo(view.scale * 1.25); $('zoom-out').onclick = () => zoomTo(view.scale / 1.25);
  $('zoom').onchange = e => e.target.value === 'fit' ? fit() : zoomTo(Number(e.target.value));
  $('start-template').onclick = () => { pane = 'templates'; render(); };
  $('apply-lesson').onclick = () => { if (applyLesson()) notify('問題文を保存しました'); };
  $('preview-lesson').onclick = previewLesson; $('end-lesson-preview').onclick = endLessonPreview;
  $('show-assignment').onclick = () => {
    if (lessonToolsEnabled()) { pane = 'lesson'; render(); $('assignment-title').scrollIntoView({ block: 'nearest' }); return; }
    $('assignment-dialog-title').textContent = doc.title;
    $('assignment-dialog-text').textContent = doc.lesson?.instructions || '問題文は設定されていません。';
    openDialog($('assignment-dialog'), $('show-assignment'));
  };
  $('download-lesson').onclick = () => {
    if (!applyLesson()) return;
    const output = C.clone(doc); output.lesson.studentMode = true;
    download(new Blob([C.serializeDocument(output)], { type: 'application/json' }), `${safeName()}-授業ひな形.diagram.json`);
    notify('生徒が開いて使えるひな形を書き出しました');
  };
  $('edit-lesson').onclick = () => {
    if (trace || !studentMode() || lessonPreview) return;
    finishText(); cancelGesture();
    if (!change(() => { doc.lesson.studentMode = false; }, { allowLessonChange: true })) return;
    history = new C.History(doc); committed = C.clone(doc); persist(); render(); $('lesson-instructions').focus();
  };
  $('trace-start').onclick = () => {
    try {
      finishText(); cancelGesture(); traceStartId = $('trace-start-node').value; trace = C.createTrace(doc, traceStartId);
      selected.clear(); layer = 'diagram'; laneId = null; tool = 'select'; pane = ''; render(); fit(); focusTraceChoice();
    } catch (error) { trace = null; notify(error.message, true); }
  };
  $('trace-back').onclick = () => { if (!trace) return; const previous = C.backTrace(trace); if (previous) { trace = previous; render(); focusTraceChoice(); } };
  $('trace-restart').onclick = () => { if (!trace) return; trace = C.createTrace(doc, traceStartId); render(); fit(); focusTraceChoice(); };
  $('trace-stop').onclick = stopTrace;

  function openDialog(dialog, invoker = document.activeElement) {
    finishText(); $$('details.menu').forEach(el => { el.open = false; });
    invoker = invoker?.closest('details.menu')?.querySelector('summary') || invoker;
    dialog.addEventListener('close', () => {
      if (!invoker?.isConnected) return;
      const target = toolbar.dataset.compact === 'true' && toolbarOptions.contains(invoker) && !toolbarOptions.classList.contains('is-open') ? $('toolbar-toggle') : invoker.closest('[hidden]') ? canvas : invoker;
      target.focus({ preventScroll: true });
    }, { once: true });
    dialog.showModal();
  }
  function confirmReplace(message) {
    if (!dirty()) return Promise.resolve(true);
    return new Promise(resolve => {
      $('confirm-message').textContent = message;
      const dialog = $('confirm-dialog'); dialog.returnValue = 'cancel';
      dialog.addEventListener('close', () => { const value = dialog.returnValue; resolve(value === 'continue' || value === 'save' && saveCurrent()); }, { once: true });
      openDialog(dialog);
    });
  }
  function replaceDocument(next, markSaved = false, options = {}) {
    const validated = C.parseDocument(next);
    if (lessonPreview) throw new Error('生徒画面の確認を終了してからファイルを開いてください。');
    finishText(); if (storageArmed) writeRecovery();
    clearTimeout(recoveryTimer); localPickerEpoch++; localAutosave.stop();
    storageArmed = false; recoveryState = 'idle';
    trace = null; traceStartId = null; doc = validated; history.reset(doc); committed = C.clone(doc); selected.clear(); laneId = null; connection = null; drag = null; tool = 'select'; layer = 'diagram';
    $('export-scope').value = 'all';
    saved = options.saved === undefined ? markSaved ? C.serializeDocument(doc) : '' : options.saved;
    if (studentMode()) pane = 'lesson';
    render();
    if (options.view) { view = C.clone(options.view); updateView(); } else fit();
    if (!options.preserveSnapshots) persist(true);
  }
  $('new-file').onclick = async () => { finishText(); if (await confirmReplace('新しい図を作ります。今の図を残す場合は、再編集ファイルを保存してください。')) replaceDocument(C.createDocument(doc.diagramType), true); };
  $('templates').onclick = async event => { const id = event.target.closest('[data-template]')?.dataset.template; if (!id) return; finishText(); if (await confirmReplace('選んだひな形から新しく始めます。今の図を残す場合は、再編集ファイルを保存してください。')) { replaceDocument(C.createTemplate(id)); pane = ''; render(); fit(); } };
  $('help-button').onclick = () => openDialog($('help-dialog'), $('help-button'));
  $('connect-button').onclick = () => {
    const nodes = doc.nodes.filter(n => n.kind !== 'text');
    if (!nodes.length) { notify('先に、接続する図形を置いてください'); return; }
    ['connect-from','connect-to'].forEach(id => {
      $(id).replaceChildren(); nodes.forEach((n, index) => { const option = document.createElement('option'); option.value = n.id; option.textContent = `${index+1}. ${n.text || C.NODE_DEFS[n.kind].label}`; $(id).append(option); });
    });
    const ids = selectedNodes().map(n => n.id); $('connect-from').value = ids[0] || nodes[0].id; $('connect-to').value = ids[1] || nodes[Math.min(1, nodes.length - 1)].id;
    $('connect-kind').value = doc.diagramType === 'state' ? 'curve' : 'orthogonal'; $('connect-label').value = '';
    openDialog($('connect-dialog'), $('connect-button'));
  };
  $('connect-form').onsubmit = event => {
    event.preventDefault();
    const from = { nodeId: $('connect-from').value, side: 'auto', offset: .5 }, to = { nodeId: $('connect-to').value, side: 'auto', offset: .5 };
    const e = C.createEdge(from, to, { kind: from.nodeId === to.nodeId ? 'curve' : $('connect-kind').value, label: { text: $('connect-label').value, t: .5, dx: 0, dy: -12 } });
    change(() => { doc.edges.push(e); snapAutomatic(e, doc); selected = new Set([e.id]); }); $('connect-dialog').close();
  };
  function safeName(title = doc.title) { return (title || '図').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100); }
  function download(blob, name) {
    const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name; document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 5000);
  }
  function saveFile() {
    finishText();
    try {
      const output = S.serializeFile(doc), snapshot = S.parseFile(output);
      download(new Blob([output], { type: 'application/json' }), `${safeName()}.diagram.json`);
      localManualSnapshot = { ...snapshot, name: `${safeName()}.diagram.json` };
      saved = C.serializeDocument(snapshot.document); lastSaveLocation = 'local';
      savePreferences(); updateSaveShortcut(); writeRecovery(); render(); $('file-menu').open = false;
      notify('再編集ファイルを書き出しました'); return true;
    } catch (error) { reportStorageError(`ファイルを書き出せませんでした。${error.message}`); return false; }
  }
  function saveBrowser() {
    finishText();
    try {
      const snapshot = S.writeBrowser(localStorage, 'manual', doc, { view });
      saved = snapshot.saved; lastSaveLocation = 'browser';
      savePreferences(); updateSaveShortcut(); writeRecovery(); render(); $('file-menu').open = false;
      notify('ブラウザ内に明示保存しました'); return true;
    } catch (error) { reportStorageError(`ブラウザ内に保存できませんでした。「ファイルに保存」を使えます。${error.message}`); return false; }
  }
  function saveCurrent() { return lastSaveLocation === 'local' ? saveFile() : saveBrowser(); }
  function updateSaveShortcut() { $('save-shortcut').textContent = `⌘/Ctrl＋S：${lastSaveLocation === 'local' ? 'ファイルに保存' : 'ブラウザ内に保存'}`; }
  function reportStorageError(message) {
    notify(message, true);
    $('storage-open-error').textContent = message; $('storage-open-error').hidden = false;
  }
  function readBrowserSnapshots() {
    try { return S.readBrowser(localStorage); }
    catch (error) { return { auto: null, manual: null, errors: [{ message: 'ブラウザの保存データへアクセスできません。' }] }; }
  }
  function snapshotDate(value) {
    if (!value) return '保存日時不明（旧形式）';
    return new Intl.DateTimeFormat('ja-JP', { dateStyle: 'medium', timeStyle: 'medium' }).format(new Date(value));
  }
  function renderStorageCandidates() {
    const browser = readBrowserSnapshots(), candidates = [
      ['browser-auto', browser.auto], ['browser-manual', browser.manual],
      ['local-auto', localAutosave.getSnapshot()], ['local-manual', localManualSnapshot], ['local-file', localFileCandidate]
    ].filter(([, value]) => value);
    $('open-candidates').replaceChildren();
    for (const [source, snapshot] of candidates) {
      const button = document.createElement('button'); button.type = 'button'; button.className = 'storage-candidate'; button.dataset.openSource = source;
      const kind = document.createElement('span'); kind.className = 'storage-kind';
      kind.textContent = `${snapshot.location === 'local' ? 'ローカルファイル' : 'ブラウザ内'}・${snapshot.method === 'auto' ? '自動保存' : snapshot.legacy && source === 'browser-manual' ? '保存時の内容（旧形式）' : '明示保存'}`;
      const name = document.createElement('strong'); name.textContent = snapshot.document.title || '無題の図';
      const detail = document.createElement('span'); detail.textContent = `${snapshotDate(snapshot.savedAt)}${snapshot.name ? ` ／ ${snapshot.name}` : ''}`;
      button.append(kind, name, detail);
      button.onclick = () => openSnapshot(snapshot, source);
      $('open-candidates').append(button);
    }
    $('storage-empty').hidden = candidates.length > 0;
    $('storage-open-error').textContent = browser.errors.length ? '読み込めないブラウザ保存があります。ほかの候補またはローカルファイルを選べます。元の保存データは残っています。' : '';
    $('storage-open-error').hidden = !browser.errors.length;
    return candidates.length;
  }
  function openStorageDialog(startup = false) {
    if (trace || lessonPreview) return;
    finishText();
    if (storageArmed) writeRecovery();
    localFileCandidate = null;
    renderStorageCandidates();
    $('storage-open-title').textContent = startup ? '前回の図を開く' : '保存した図を開く';
    if (!$('storage-open-dialog').open) openDialog($('storage-open-dialog'), $('file-menu').querySelector('summary'));
  }
  async function openSnapshot(snapshot, source) {
    if (openingSnapshot || trace || lessonPreview) return;
    openingSnapshot = true;
    try {
      const next = C.parseDocument(snapshot.document);
      if (!await confirmReplace('選んだ保存内容を開きます。現在の変更を残す場合は、保存してから開いてください。')) return;
      let baseline = snapshot.saved;
      if (snapshot.method === 'auto') {
        const manual = readBrowserSnapshots().manual;
        const newerManual = manual?.savedAt && (!snapshot.savedAt || Date.parse(manual.savedAt) > Date.parse(snapshot.savedAt));
        if (manual?.document.id === next.id && (!baseline || newerManual)) baseline = C.serializeDocument(manual.document);
      }
      replaceDocument(next, snapshot.method === 'manual', { saved: baseline, view: snapshot.view, preserveSnapshots: true });
      recoveryState = source === 'browser-auto' ? 'saved' : 'idle'; updateSaveStatus();
      $('storage-open-dialog').close(); notify('選んだ保存内容を開きました');
    } catch (error) { reportStorageError(`読み込めませんでした。${error.message}`); }
    finally { openingSnapshot = false; }
  }
  $('save-file').onclick = saveFile;
  $('save-browser').onclick = saveBrowser;
  $('open-file').onclick = () => openStorageDialog();
  $('choose-local-file').onclick = () => { $('file-input').value = ''; $('file-input').click(); };
  $('file-input').onchange = async event => {
    const file = event.target.files[0]; if (!file) return;
    try {
      if (file.size > 2 * 1024 * 1024) throw new Error('ファイルは2MB以内にしてください。');
      const next = S.parseFile(await file.text(), { lastModified: file.lastModified });
      localFileCandidate = { ...next, name: file.name }; renderStorageCandidates();
      if (!$('storage-open-dialog').open) openDialog($('storage-open-dialog'), $('file-menu').querySelector('summary'));
      document.querySelector('#open-candidates [data-open-source="local-file"]')?.focus();
    } catch (error) { reportStorageError(`読み込めませんでした。${error.message}`); }
  };
  function updateLocalSaveStatus(state = localAutosave.getState()) {
    const labels = { idle: '停止中', stopped: '停止中', saving: '自動保存中', saved: '自動保存済み', failed: '自動保存に失敗しました' };
    $('local-auto-status').textContent = `${labels[state.status] || '停止中'}${state.name ? `：${state.name}` : ''}${state.message ? ` — ${state.message}` : ''}`;
    $('local-auto-status').dataset.error = String(state.status === 'failed');
    $('local-auto-stop').disabled = !['saving', 'saved'].includes(state.status);
  }
  const supportsLocalAutosave = window.isSecureContext && typeof window.showSaveFilePicker === 'function';
  $('local-auto-unavailable').hidden = supportsLocalAutosave;
  $('local-auto-start').disabled = !supportsLocalAutosave;
  $('autosave-settings').onclick = () => { updateLocalSaveStatus(); openDialog($('autosave-dialog'), $('file-menu').querySelector('summary')); };
  $('local-auto-start').onclick = async () => {
    if (choosingLocalSave || !supportsLocalAutosave || lessonPreview || trace) return;
    finishText(); const id = doc.id, epoch = ++localPickerEpoch;
    choosingLocalSave = true; $('local-auto-start').disabled = true;
    try {
      const handle = await window.showSaveFilePicker({ id: 'flowchart-autosave', suggestedName: `${safeName()}_自動保存.diagram.json`, types: [{ description: 'フローチャートの自動保存', accept: { 'application/json': ['.json'] } }] });
      if (epoch !== localPickerEpoch || doc.id !== id || lessonPreview || trace) return;
      await localAutosave.start(handle, C.clone(doc), { saved, view: C.clone(view) });
    } catch (error) {
      if (error.name !== 'AbortError') {
        $('local-auto-status').textContent = '保存先を利用できませんでした。別のファイルを選べます。'; $('local-auto-status').dataset.error = 'true';
      }
    } finally { choosingLocalSave = false; $('local-auto-start').disabled = !supportsLocalAutosave; }
  };
  $('local-auto-stop').onclick = () => { localPickerEpoch++; localAutosave.stop(); };
  function exportIds(scope) { return scope === 'selection' ? layer === 'lanes' ? laneId ? [laneId] : [] : [...selected] : null; }
  function hasExportObjects(parts) { return parts.nodes.length + parts.edges.length + parts.lanes.length > 0; }
  function pngDimensions(output, selectedIds) {
    const b = R.documentBounds(output, { selectedIds }), w = Math.max(1, b.w + 64), h = Math.max(1, b.h + 64);
    const requested = [1, 2, 4].includes(Number($('export-scale').value)) ? Number($('export-scale').value) : 1;
    const scale = Math.min(requested, 8192 / w, 8192 / h, Math.sqrt(32000000 / (w * h)));
    return { width: Math.max(1, Math.floor(w * scale + 1e-8)), height: Math.max(1, Math.floor(h * scale + 1e-8)), adjusted: scale < requested - 1e-8 };
  }
  function renderExport() {
    $('copy-image-button').disabled = !!imageOperation || !!trace || !selected.size;
    $('copy-image-button').setAttribute('aria-busy', String(imageOperation === 'copy'));
    if (pane !== 'export') return;
    const scope = $('export-scope').value, ids = exportIds(scope), parts = R.exportSelection(doc, ids), empty = !hasExportObjects(parts);
    ['export-copy-image','export-png','export-svg'].forEach(id => { $(id).disabled = !!imageOperation || empty; });
    $('export-copy-image').textContent = imageOperation === 'copy' ? 'コピー中…' : '画像をコピー';
    $('export-png').textContent = imageOperation === 'download' ? '作成中…' : 'PNGを保存';
    $('export-empty').hidden = !empty;
    $('export-empty').textContent = scope === 'selection' ? '書き出す図形・矢印、または担当領域を選択してください。' : '図形や矢印を配置すると、画像を書き出せます。';
    const preview = $('export-preview'), label = scope === 'selection' ? '選択部分' : '図全体';
    preview.dataset.transparent = String($('transparent').checked); preview.setAttribute('aria-label', `${label}の書き出しプレビュー`);
    if (empty) { preview.replaceChildren(); $('export-name').textContent = label; return; }
    preview.innerHTML = R.svgDocument(doc, { selectedIds: ids, padding: 32, transparent: $('transparent').checked, idPrefix: 'export-preview' });
    const size = pngDimensions(doc, ids);
    $('export-name').textContent = `${label}：${parts.nodes.length}図形・${parts.edges.length}線${parts.lanes.length ? `・${parts.lanes.length}担当領域` : ''} / PNG ${size.width} × ${size.height} px${size.adjusted ? '（大きな図のため解像度を調整）' : ''}`;
  }
  function imageSnapshot(scope) {
    finishText();
    const output = C.clone(doc), selectedIds = exportIds(scope);
    if (!hasExportObjects(R.exportSelection(output, selectedIds))) throw new Error(scope === 'selection' ? '書き出す部分を選択してください。' : '先に図形や矢印を配置してください。');
    const transparent = $('transparent').checked;
    return { svg: R.svgDocument(output, { selectedIds, padding: 32, transparent }), transparent, ...pngDimensions(output, selectedIds), name: `${safeName(output.title)}${scope === 'selection' ? '_選択部分' : ''}`, label: `${output.title || '図'}${scope === 'selection' ? '（選択部分）' : '（図全体）'}` };
  }
  async function pngBlob(snapshot) {
    const url = URL.createObjectURL(new Blob([snapshot.svg], { type: 'image/svg+xml' }));
    try {
      const image = new Image();
      await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(new Error('画像を作成できませんでした。')); image.src = url; });
      const out = document.createElement('canvas'); out.width = snapshot.width; out.height = snapshot.height;
      const ctx = out.getContext('2d'); if (!ctx) throw new Error('画像を作成できませんでした。');
      if (!snapshot.transparent) { ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, out.width, out.height); }
      ctx.drawImage(image, 0, 0, out.width, out.height);
      const blob = await new Promise(resolve => out.toBlob(resolve, 'image/png'));
      if (!blob) throw new Error('PNGを作成できませんでした。');
      return blob;
    } finally { URL.revokeObjectURL(url); }
  }
  function clearImageFallback() { imageCopyFallback = null; $('image-copy-fallback').hidden = true; }
  function showImageFallback(blob, snapshot, invoker) {
    imageCopyFallback = { blob, snapshot, invoker };
    $('image-copy-message').textContent = `「${snapshot.label}」を画像としてコピーできませんでした。作成したPNGを保存して、貼り付け先へ挿入できます。`;
    $('image-copy-fallback').hidden = false; pane = 'export'; render(); $('image-copy-download').focus();
    notify('画像をコピーできませんでした。書き出しパネルからPNGを保存できます。', true);
  }
  async function copyImage(scope, invoker) {
    if (imageOperation) return;
    let pending;
    try {
      const snapshot = imageSnapshot(scope);
      clearImageFallback(); imageOperation = 'copy'; renderExport();
      const menu = invoker.closest('details.menu');
      if (menu) { menu.open = false; invoker = menu.querySelector('summary'); invoker.focus(); }
      pending = pngBlob(snapshot);
      // Register the clipboard write in the click itself; WebKit requires a user gesture.
      // The promised PNG lets image decoding finish without losing that gesture.
      pending.catch(() => {});
      const supported = !!navigator.clipboard?.write && typeof window.ClipboardItem === 'function' && (!ClipboardItem.supports || ClipboardItem.supports('image/png'));
      if (!supported) { showImageFallback(await pending, snapshot, invoker); return; }
      try {
        await navigator.clipboard.write([new ClipboardItem({ 'image/png': pending })]);
        notify(snapshot.adjusted ? '解像度を調整して画像をコピーしました' : '画像をコピーしました');
      } catch { showImageFallback(await pending, snapshot, invoker); }
    } catch (error) { notify(error.message || '画像を作成できませんでした。', true); }
    finally { imageOperation = null; renderExport(); }
  }
  $('export-svg').onclick = () => {
    try { const snapshot = imageSnapshot($('export-scope').value); download(new Blob([snapshot.svg], { type: 'image/svg+xml' }), `${snapshot.name}.svg`); notify('SVGを書き出しました'); }
    catch (error) { notify(error.message, true); }
  };
  $('export-png').onclick = async () => {
    if (imageOperation) return;
    try {
      const snapshot = imageSnapshot($('export-scope').value); imageOperation = 'download'; renderExport();
      download(await pngBlob(snapshot), `${snapshot.name}.png`); notify(snapshot.adjusted ? '大きな図のため解像度を調整してPNGを書き出しました' : 'PNGを書き出しました');
    } catch (error) { notify(error.message, true); }
    finally { imageOperation = null; renderExport(); }
  };
  $('export-copy-image').onclick = () => copyImage($('export-scope').value, $('export-copy-image'));
  $('copy-image-button').onclick = () => copyImage('selection', $('copy-image-button'));
  ['export-scope','export-scale','transparent'].forEach(id => { $(id).onchange = renderExport; });
  $('image-copy-download').onclick = () => { if (imageCopyFallback) { download(imageCopyFallback.blob, `${imageCopyFallback.snapshot.name}.png`); notify('PNGを書き出しました'); } };
  function dismissImageFallback() { const invoker = imageCopyFallback?.invoker; clearImageFallback(); invoker?.focus(); }
  $('image-copy-dismiss').onclick = dismissImageFallback;
  $('image-copy-fallback').addEventListener('keydown', event => { if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); dismissImageFallback(); } });
  function printSettings() {
    return { paper: $('print-paper').value === 'B5' ? 'B5' : 'A4', orientation: $('print-orientation').value === 'landscape' ? 'landscape' : 'portrait', name: $('print-name').checked, instructions: $('print-instructions').checked };
  }
  function paperDimensions(settings) {
    const sizes = settings.paper === 'B5' ? [182, 257] : [210, 297];
    return settings.orientation === 'landscape' ? sizes.reverse() : sizes;
  }
  let printPagePixels = { w: 794, h: 1122 }, printResizeFrame = null;
  function preparePrint() {
    finishText();
    const settings = printSettings(), [width, height] = paperDimensions(settings), sheet = $('print-sheet');
    const instructions = settings.instructions ? doc.lesson?.instructions || '' : '';
    $('print-page-style').textContent = `@page{size:${width}mm ${height}mm;margin:0}`;
    sheet.replaceChildren(); sheet.classList.add('is-measuring');
    const pages = [];
    const makePage = () => {
      const article = document.createElement('article'); article.className = 'print-page';
      article.style.setProperty('--paper-width', `${width}mm`); article.style.setProperty('--paper-height', `${height}mm`);
      article.style.setProperty('--paper-margin', settings.paper === 'B5' ? '10mm' : '12mm');
      article.style.setProperty('--print-font-size', settings.paper === 'B5' ? '9pt' : '10.5pt');
      const title = document.createElement('h1'); title.textContent = doc.title || '図'; article.append(title);
      if (settings.name && !pages.length) {
        const name = document.createElement('div'); name.className = 'print-name-field';
        const classNumber = document.createElement('span'); classNumber.textContent = '年　　組　　番';
        const label = document.createElement('span'); label.textContent = '氏名';
        const line = document.createElement('span'); line.className = 'print-name-line';
        name.append(classNumber, label, line); article.append(name);
      }
      const body = document.createElement('div'); body.className = 'print-body'; article.append(body);
      const footer = document.createElement('footer'); footer.className = 'print-page-number'; article.append(footer);
      sheet.append(article); pages.push(article); return body;
    };
    const addDiagram = body => {
      const drawing = document.createElement('div'); drawing.className = 'print-diagram';
      drawing.innerHTML = R.svgDocument(doc, { padding: 24, transparent: false, idPrefix: 'print' }); body.append(drawing);
    };
    try {
      let remaining = Array.from(instructions), body = makePage();
      while (remaining.length) {
        const paragraph = document.createElement('p'); paragraph.className = 'print-instructions'; body.append(paragraph);
        const capacity = Math.max(20, body.getBoundingClientRect().height - 2);
        paragraph.textContent = remaining.join('');
        const textHeight = paragraph.getBoundingClientRect().height;
        if (textHeight <= capacity * .4) { remaining = []; break; }
        if (textHeight <= capacity) { remaining = []; body = makePage(); break; }
        // Measure text at its actual print size; split before it could leave the page.
        let low = 1, high = remaining.length;
        while (low < high) {
          const count = Math.ceil((low + high) / 2); paragraph.textContent = remaining.slice(0, count).join('');
          if (paragraph.getBoundingClientRect().height <= capacity) low = count; else high = count - 1;
        }
        const lineBreak = remaining.slice(0, low).lastIndexOf('\n');
        if (lineBreak > low * .6) low = lineBreak + 1;
        paragraph.textContent = remaining.slice(0, low).join(''); remaining = remaining.slice(low); body = makePage();
      }
      addDiagram(body);
      pages.forEach((article, index) => { article.querySelector('.print-page-number').textContent = pages.length > 1 ? `${index + 1} / ${pages.length}` : ''; });
      const rect = pages[0].getBoundingClientRect(); printPagePixels = { w: rect.width, h: rect.height };
      $('print-summary').textContent = `${settings.paper === 'B5' ? 'B5（JIS）' : 'A4'}・${settings.orientation === 'landscape' ? '横' : '縦'} / ${pages.length}ページ / 氏名欄${settings.name ? 'あり' : 'なし'}`;
      $('print-pagination-note').hidden = pages.length === 1;
    } finally { sheet.classList.remove('is-measuring'); }
  }
  function updatePrintPreview() {
    if (!$('print-dialog').open) return;
    const preview = $('print-preview'), scale = Math.min(1, Math.max(1, preview.clientWidth - 24) / printPagePixels.w);
    preview.replaceChildren();
    [...$('print-sheet').children].forEach((page, index) => {
      const wrapper = document.createElement('div'); wrapper.className = 'print-preview-page';
      wrapper.style.width = `${printPagePixels.w * scale}px`; wrapper.style.height = `${printPagePixels.h * scale}px`;
      const copy = page.cloneNode(true); copy.style.transform = `scale(${scale})`; copy.setAttribute('aria-label', `${index + 1}ページ`);
      const drawing = copy.querySelector('.print-diagram');
      if (drawing) drawing.innerHTML = R.svgDocument(doc, { padding: 24, transparent: false, idPrefix: 'print-preview' });
      wrapper.append(copy); preview.append(wrapper);
    });
  }
  function openPrint(invoker) {
    $('print-instructions').disabled = !doc.lesson?.instructions;
    openDialog($('print-dialog'), invoker); preparePrint(); updatePrintPreview();
    $('print-paper').focus();
  }
  window.addEventListener('beforeprint', preparePrint);
  $('print-button').onclick = () => openPrint($('file-menu').querySelector('summary'));
  $('side-print').onclick = () => openPrint($('side-print'));
  $('print-form').onsubmit = event => { event.preventDefault(); preparePrint(); window.print(); };
  for (const id of ['print-paper','print-orientation','print-name','print-instructions']) $(id).onchange = () => { savePreferences(); preparePrint(); updatePrintPreview(); };
  new ResizeObserver(() => {
    cancelAnimationFrame(printResizeFrame); printResizeFrame = requestAnimationFrame(updatePrintPreview);
  }).observe($('print-preview'));
  function savePreferences() { try { localStorage.setItem(PREFS, JSON.stringify({ theme: $('theme').value, textSize: $('text-size').value, snap: $('snap').checked, alignmentSnap: $('alignment-snap').checked, print: printSettings(), saveLocation: lastSaveLocation })); } catch { /* Editing remains available when browser storage is disabled. */ } }
  $('theme').onchange = e => { document.documentElement.dataset.theme = e.target.value; savePreferences(); render(); };
  systemTheme.addEventListener('change', () => { if ($('theme').value === 'auto') render(); });
  $('text-size').onchange = e => { document.documentElement.dataset.textSize = e.target.value; savePreferences(); layoutToolbar(); positionMenus(); };
  $('snap').onchange = () => { savePreferences(); render(); };
  $('alignment-snap').onchange = () => { savePreferences(); render(); };
  document.addEventListener('keydown', event => {
    if (event.isComposing || event.keyCode === 229 || isDialog()) return;
    const openMenu = event.target.closest('details.menu[open]');
    if (event.key === 'Escape' && openMenu) { event.preventDefault(); openMenu.open = false; openMenu.querySelector('summary').focus(); return; }
    if (event.key === 'Escape' && toolbar.dataset.compact === 'true' && toolbarOptions.classList.contains('is-open')) { event.preventDefault(); setToolbarOpen(false, true); return; }
    if (isInput(event.target)) return;
    const key = event.key.toLowerCase(), command = event.metaKey || event.ctrlKey;
    if (event.key === 'Alt' && drag?.type === 'move') { event.preventDefault(); updateMove(true); return; }
    if (trace && event.key === 'Escape') { event.preventDefault(); stopTrace(); return; }
    if (command) {
      if (key === 'z') { event.preventDefault(); event.shiftKey ? redo() : undo(); }
      else if (key === 'y') { event.preventDefault(); redo(); }
      else if (key === 's') { event.preventDefault(); saveCurrent(); }
      else if (key === 'o' && !trace && !lessonPreview) { event.preventDefault(); openStorageDialog(); }
      else if (key === 'a') { event.preventDefault(); selectAll(); }
      else if (key === 'd') { event.preventDefault(); duplicate(); }
      else if (key === 'g' && !trace) { event.preventDefault(); (event.shiftKey ? $('ungroup-button') : $('group-button')).click(); }
      return;
    }
    if (event.key === 'Escape') { event.preventDefault(); if (drag || connection) cancelGesture(); else { selected.clear(); laneId = null; } tool = 'select'; insertionPreview = null; $$('details.menu').forEach(el => { el.open = false; }); render(); }
    else if (event.key === 'Delete' || event.key === 'Backspace') { event.preventDefault(); remove(); }
    else if ((event.key === 'Enter' || event.key === 'F2') && event.target.closest('#canvas')) {
      if (layer === 'lanes' && laneId) { event.preventDefault(); startText(laneId, 'lane'); return; }
      const focused = event.target.closest('[data-node],[data-edge]');
      const id = focused?.dataset.node || focused?.dataset.edge || (selected.size === 1 ? [...selected][0] : null);
      if (id) { event.preventDefault(); startText(id, node(id) ? 'node' : 'edge'); }
    }
    else if (['ArrowUp','ArrowDown','ArrowLeft','ArrowRight'].includes(event.key) && selected.size && event.target.closest('#canvas')) {
      event.preventDefault(); const step = event.shiftKey ? 10 : 1;
      change(() => { const before = C.clone(doc); moveGroup(before, event.key === 'ArrowLeft' ? -step : event.key === 'ArrowRight' ? step : 0, event.key === 'ArrowUp' ? -step : event.key === 'ArrowDown' ? step : 0); selectedNodes().forEach(assignLane); });
    } else if (event.key === ' ' && event.target.closest('#canvas')) { event.preventDefault(); space = true; }
    else if (key === 'v') setTool('select'); else if (key === 'h') setTool('pan'); else if (key === 't') setTool('node:text');
  });
  window.addEventListener('keyup', event => { if (event.key === ' ') space = false; if (event.key === 'Alt' && drag?.type === 'move') updateMove(false); });
  window.addEventListener('blur', () => { space = false; if (drag) { cancelGesture(); render(); } });
  window.addEventListener('pagehide', () => { finishText(); writeRecovery(); localPickerEpoch++; localAutosave.stop(); });
  window.addEventListener('beforeunload', event => {
    const pending = lessonPreview?.doc || doc, lastSaved = lessonPreview?.saved ?? saved;
    if (localAutosave.getState().status === 'saving' || JSON.stringify(pending, null, 2) !== lastSaved || editing && $('inline-editor').value !== editing.original) { event.preventDefault(); event.returnValue = ''; }
  });
  let previousStageWidth = stage.clientWidth, previousStageHeight = stage.clientHeight, resizeFrame = null;
  new ResizeObserver(() => {
    const width = stage.clientWidth, height = stage.clientHeight;
    const changed = Math.abs(width - previousStageWidth) > 1 || !!trace && Math.abs(height - previousStageHeight) > 1;
    previousStageWidth = width; previousStageHeight = height;
    if (changed && !drag && !editing && (content() || doc.lanes.length)) {
      cancelAnimationFrame(resizeFrame); resizeFrame = requestAnimationFrame(() => { if (!drag && !editing) fit(); });
    } else updateView();
  }).observe(stage);
  try {
    const preferences = JSON.parse(localStorage.getItem(PREFS) || '{}');
    if (['auto','light','dark'].includes(preferences.theme)) { $('theme').value = preferences.theme; document.documentElement.dataset.theme = preferences.theme; }
    if (['standard','large','largest'].includes(preferences.textSize)) { $('text-size').value = preferences.textSize; document.documentElement.dataset.textSize = preferences.textSize; }
    if (typeof preferences.snap === 'boolean') $('snap').checked = preferences.snap;
    if (typeof preferences.alignmentSnap === 'boolean') $('alignment-snap').checked = preferences.alignmentSnap;
    if (['A4','B5'].includes(preferences.print?.paper)) $('print-paper').value = preferences.print.paper;
    if (['portrait','landscape'].includes(preferences.print?.orientation)) $('print-orientation').value = preferences.print.orientation;
    if (typeof preferences.print?.name === 'boolean') $('print-name').checked = preferences.print.name;
    if (typeof preferences.print?.instructions === 'boolean') $('print-instructions').checked = preferences.print.instructions;
    if (['browser','local'].includes(preferences.saveLocation)) lastSaveLocation = preferences.saveLocation;
  } catch { /* 表示設定の失敗でも、保存した図は別に読み込める。 */ }
  updateSaveShortcut(); updateLocalSaveStatus();
  render();
  window.DiagramEditor = Object.freeze({ getDocument: () => C.clone(doc), getTrace: () => trace ? C.clone(trace) : null, exportSVG: () => R.svgDocument(doc, { padding: 32 }), fit, select: ids => select(ids), setTool, undo, redo });
  const previous = readBrowserSnapshots();
  if (previous.auto || previous.manual || previous.errors.length) openStorageDialog(true);
})();
