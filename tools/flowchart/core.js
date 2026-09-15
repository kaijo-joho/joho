(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiagramCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const TYPES = ['flowchart', 'activity', 'state'];
  const DEFAULT_STYLE = Object.freeze({ fontSize: 16, stroke: '#253140', fill: '#ffffff', color: '#253140', strokeWidth: 2, dashed: false, bold: false });
  const def = (label, w, h, modes) => Object.freeze({ label, w, h, modes });
  const NODE_DEFS = Object.freeze({
    terminal: def('開始・終了', 160, 52, ['flowchart']), process: def('処理', 168, 64, ['flowchart']),
    decision: def('判断・分岐', 172, 100, ['flowchart','activity']), inputOutput: def('入出力', 172, 64, ['flowchart']),
    manualInput: def('手入力', 172, 72, ['flowchart']), display: def('表示', 172, 64, ['flowchart']),
    loopStart: def('反復開始', 172, 64, ['flowchart']), loopEnd: def('反復終了', 172, 64, ['flowchart']),
    action: def('処理', 168, 64, ['activity']), initial: def('初期', 24, 24, ['activity']), final: def('終了', 28, 28, ['activity']),
    merge: def('統合', 44, 44, ['activity']), fork: def('並列開始', 168, 8, ['activity']), join: def('並列終了', 168, 8, ['activity']),
    state: def('状態', 120, 120, ['state']), text: def('文字', 180, 48, TYPES), junction: def('合流点', 12, 12, ['flowchart'])
  });
  let serial = 0;
  function uid(prefix = 'id') { return `${prefix}_${Date.now().toString(36)}_${(++serial).toString(36)}_${Math.random().toString(36).slice(2,9)}`; }
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const byteLength = value => new TextEncoder().encode(value).length;
  const record = value => value && typeof value === 'object' && !Array.isArray(value);
  function number(value, fallback, min = -100000, max = 100000) {
    if (value === undefined) return fallback;
    if (typeof value !== 'number' || !Number.isFinite(value) || value < min || value > max) fail('座標や大きさに不正な値があります。');
    return value;
  }
  function text(value, fallback = '', limit = 10000) {
    if (value === undefined) return fallback;
    if (typeof value !== 'string' || value.length > limit) fail('文字データが不正か、長すぎます。');
    return value;
  }
  function enumValue(value, choices, fallback) {
    if (value === undefined) return fallback;
    if (!choices.includes(value)) fail('対応していない部品や設定が含まれています。');
    return value;
  }
  function id(value) { if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(value)) fail('部品のIDが不正です。'); return value; }
  function style(value = {}) {
    if (!record(value)) fail('書式データが不正です。');
    const out = { ...DEFAULT_STYLE };
    for (const k of ['stroke', 'fill', 'color']) if (value[k] !== undefined) {
      if (typeof value[k] !== 'string' || !/^#[a-f0-9]{6}$/i.test(value[k])) fail('色の指定が不正です。');
      out[k] = value[k];
    }
    out.fontSize = number(value.fontSize, 16, 8, 96); out.strokeWidth = number(value.strokeWidth, 2, .5, 12);
    for (const key of ['dashed','bold']) { if (value[key] !== undefined && typeof value[key] !== 'boolean') fail('書式データが不正です。'); out[key] = value[key] || false; }
    return out;
  }
  function endpoint(value) {
    if (!record(value)) fail('線の接続先が不正です。');
    if (value.nodeId !== undefined) return { nodeId: id(value.nodeId), side: enumValue(value.side, ['auto','top','right','bottom','left'], 'auto'), offset: number(value.offset, .5, 0, 1) };
    if (value.x === undefined || value.y === undefined) fail('線の端点がありません。');
    return { x: number(value.x), y: number(value.y) };
  }
  function waypoints(value, kind) {
    if (value === undefined) return [];
    if (!Array.isArray(value) || value.length > 32) fail('線の経路点が不正です。');
    if (value.length && kind !== 'orthogonal') fail('経路点は直角の線だけに設定できます。');
    return value.map(point => {
      if (!record(point) || point.x === undefined || point.y === undefined) fail('線の経路点が不正です。');
      return { x: number(point.x), y: number(point.y) };
    });
  }
  function createDocument(type = 'flowchart') {
    enumValue(type, TYPES, 'flowchart');
    const doc = { format: 'kaijo-diagram', version: 3, id: uid('doc'), title: '無題の図', diagramType: type, nodes: [], edges: [], lanes: [], groups: [], lesson: null };
    if (type === 'activity') doc.lanes = [{ id: uid('lane'), title: '担当1', x: 40, y: 40, w: 300, h: 600, locked: false }, { id: uid('lane'), title: '担当2', x: 340, y: 40, w: 300, h: 600, locked: false }];
    return doc;
  }
  function createNode(kind, x, y, options = {}) {
    if (!Object.hasOwn(NODE_DEFS, kind)) fail('対応していない図形です。');
    const d = NODE_DEFS[kind];
    return { id: options.id || uid('node'), kind, x, y, w: options.w ?? d.w, h: options.h ?? d.h, text: options.text ?? '', style: style(options.style), laneId: options.laneId ?? null, locked: options.locked === true, ...(kind === 'state' ? { variant: options.variant || 'circle' } : {}) };
  }
  function createEdge(from, to, options = {}) {
    const label = options.label || {};
    const kind = enumValue(options.kind, ['orthogonal','straight','curve'], 'orthogonal'), points = waypoints(options.waypoints, kind);
    if (points.length && options.bend != null) fail('経路点と従来の経路調整は同時に設定できません。');
    return { id: options.id || uid('edge'), from: endpoint(from), to: endpoint(to), kind, head: options.head || 'end', label: { text: label.text || '', t: label.t ?? .5, dx: label.dx ?? 0, dy: label.dy ?? -12 }, bend: options.bend ? clone(options.bend) : null, waypoints: points, style: style(options.style), locked: options.locked === true };
  }
  function parseDocument(input) {
    let value = input;
    if (typeof value === 'string') { if (byteLength(value) > 2 * 1024 * 1024) fail('ファイルが大きすぎます。'); try { value = JSON.parse(value); } catch { fail('JSONファイルを読み取れません。'); } }
    if (!record(value) || value.format !== 'kaijo-diagram') fail('フローチャートエディタの再編集ファイルを選んでください。');
    if (value.version !== 1 && value.version !== 2 && value.version !== 3) fail('このバージョンのファイルには対応していません。');
    if (![value.nodes, value.edges, value.lanes].every(Array.isArray)) fail('図形・線・領域の一覧がありません。');
    if (value.nodes.length + value.edges.length > 1000 || value.lanes.length > 50) fail('部品が多すぎます（図形と線は合わせて1000個まで）。');
    const seen = new Set();
    const unique = value => { const v = id(value); if (seen.has(v)) fail('部品のIDが重複しています。'); seen.add(v); return v; };
    const oldVersion = value.version === 1;
    const locked = value => { if (value === undefined) return false; if (typeof value !== 'boolean') fail('固定設定が不正です。'); return value; };
    const out = { format: 'kaijo-diagram', version: 3, id: id(value.id), title: text(value.title, '無題の図', 160), diagramType: enumValue(value.diagramType, TYPES, 'flowchart'), nodes: [], edges: [], lanes: [], groups: [], lesson: null };
    out.lanes = value.lanes.map(l => {
      if (!record(l)) fail('担当領域が不正です。');
      if (['x','y','w','h'].some(key => l[key] === undefined)) fail('担当領域の座標や大きさがありません。');
      return { id: unique(l.id), title: text(l.title, '', 160), x: number(l.x, 0), y: number(l.y, 0), w: number(l.w, 300, 1, 20000), h: number(l.h, 600, 1, 20000), locked: locked(l.locked) };
    });
    const laneIds = new Set(out.lanes.map(l => l.id));
    out.nodes = value.nodes.map(n => {
      if (!record(n) || !Object.hasOwn(NODE_DEFS, n.kind)) fail('対応していない図形が含まれています。');
      if (['x','y','w','h'].some(key => n[key] === undefined)) fail('図形の座標や大きさがありません。');
      const d = NODE_DEFS[n.kind], laneId = n.laneId ?? null;
      if (laneId !== null && !laneIds.has(laneId)) fail('図形の担当領域が見つかりません。');
      return { id: unique(n.id), kind: n.kind, x: number(n.x, 0), y: number(n.y, 0), w: number(n.w, d.w, 1, 20000), h: number(n.h, d.h, 1, 20000), text: text(n.text), style: style(n.style), laneId, locked: locked(n.locked), ...(n.kind === 'state' ? { variant: enumValue(n.variant, ['circle','round'], 'circle') } : {}) };
    });
    const nodeIds = new Set(out.nodes.map(n => n.id));
    out.edges = value.edges.map(e => {
      if (!record(e)) fail('線のデータが不正です。');
      const from = endpoint(e.from), to = endpoint(e.to), label = e.label ?? {}, kind = enumValue(e.kind, ['orthogonal','straight','curve'], 'orthogonal'), points = waypoints(e.waypoints, kind);
      if (!record(label)) fail('線のラベルが不正です。');
      for (const p of [from, to]) if (p.nodeId && !nodeIds.has(p.nodeId)) fail('線の接続先が見つかりません。');
      if (e.bend != null && !record(e.bend)) fail('線の経路が不正です。');
      if (points.length && e.bend != null) fail('経路点と従来の経路調整は同時に設定できません。');
      return { id: unique(e.id), from, to, kind, head: enumValue(e.head, ['end','both','none'], 'end'), label: { text: text(label.text), t: number(label.t, .5, 0, 1), dx: number(label.dx, 0), dy: number(label.dy, -12) }, bend: e.bend ? { x: number(e.bend.x, 0), y: number(e.bend.y, 0) } : null, waypoints: points, style: style(e.style), locked: locked(e.locked) };
    });
    const componentIds = new Set([...out.nodes, ...out.edges].map(item => item.id));
    const grouped = new Set();
    const groups = value.groups === undefined && oldVersion ? [] : value.groups;
    if (!Array.isArray(groups)) fail('グループの一覧が不正です。');
    out.groups = groups.map(group => {
      if (!record(group) || !Array.isArray(group.memberIds) || group.memberIds.length < 2) fail('グループのデータが不正です。');
      const groupId = unique(group.id), members = group.memberIds.map(id);
      if (new Set(members).size !== members.length || members.some(member => !componentIds.has(member) || grouped.has(member))) fail('グループの所属が不正です。');
      members.forEach(member => grouped.add(member));
      return { id: groupId, memberIds: members };
    });
    const lesson = value.lesson === undefined && oldVersion ? null : value.lesson;
    if (lesson !== null && (!record(lesson) || typeof lesson.studentMode !== 'boolean' || typeof lesson.instructions !== 'string' || lesson.instructions.length > 10000)) fail('授業用設定が不正です。');
    out.lesson = lesson === null ? null : { instructions: lesson.instructions, studentMode: lesson.studentMode };
    if (byteLength(JSON.stringify(out, null, 2)) > 2 * 1024 * 1024) fail('図のデータは2MB以内にしてください。');
    return out;
  }
  function serializeDocument(doc) { return JSON.stringify(parseDocument(doc), null, 2); }
  const getNode = (doc, nodeId) => doc.nodes.find(n => n.id === nodeId);
  const findLane = (doc, x, y) => doc.lanes.find(l => x >= l.x && x <= l.x + l.w && y >= l.y && y <= l.y + l.h) || null;
  const components = doc => [...doc.nodes, ...doc.edges, ...doc.lanes];
  function expandSelection(doc, ids) {
    const chosen = new Set(ids || []), groups = doc.groups || [];
    let changed = true;
    while (changed) { changed = false; for (const group of groups) if (group.id && (chosen.has(group.id) || group.memberIds.some(member => chosen.has(member)))) for (const member of group.memberIds) if (!chosen.has(member)) { chosen.add(member); changed = true; } }
    return [...chosen].filter(value => components(doc).some(item => item.id === value));
  }
  function groupSelection(doc, ids) {
    const chosen = new Set(expandSelection(doc, ids));
    for (const edge of doc.edges) if (chosen.has(edge.from.nodeId) && chosen.has(edge.to.nodeId)) chosen.add(edge.id);
    const old = (doc.groups || []).filter(group => group.memberIds.some(member => chosen.has(member)));
    old.forEach(group => group.memberIds.forEach(member => chosen.add(member)));
    const members = [...chosen]; if (members.length < 2) fail('2つ以上の部品を選択してください。');
    doc.groups = (doc.groups || []).filter(group => !old.includes(group));
    const group = { id: uid('group'), memberIds: members }; doc.groups.push(group); parseDocument(doc); return group.id;
  }
  function ungroupSelection(doc, ids) {
    const selected = new Set(ids || []), remove = (doc.groups || []).filter(group => selected.has(group.id) || group.memberIds.some(member => selected.has(member))).map(group => group.id);
    doc.groups = (doc.groups || []).filter(group => !remove.includes(group.id)); return remove;
  }
  function setLocked(doc, ids, locked) {
    if (typeof locked !== 'boolean') fail('固定設定が不正です。');
    const selected = new Set(expandSelection(doc, ids));
    for (const group of doc.groups || []) if ((ids || []).includes(group.id)) group.memberIds.forEach(member => selected.add(member));
    const changed = []; components(doc).forEach(item => { if (selected.has(item.id) && item.locked !== locked) { item.locked = locked; changed.push(item.id); } }); return changed;
  }
  function nodeOrderSelection(doc, ids) {
    if (!Array.isArray(ids)) fail('選択が不正です。');
    const selected = new Set(expandSelection(doc, ids));
    return { selected, nodes: doc.nodes.filter(node => selected.has(node.id)) };
  }
  function nodeOrderActions(doc, ids) {
    const { selected, nodes } = nodeOrderSelection(doc, ids), unavailable = { front: false, forward: false, backward: false, back: false };
    if (!nodes.length || components(doc).some(item => selected.has(item.id) && item.locked)) return unavailable;
    const chosen = new Set(nodes.map(node => node.id)), order = doc.nodes;
    const canMoveForward = order.some((node, index) => chosen.has(node.id) && index + 1 < order.length && !chosen.has(order[index + 1].id));
    const canMoveBackward = order.some((node, index) => !chosen.has(node.id) && index + 1 < order.length && chosen.has(order[index + 1].id));
    return {
      front: canMoveForward,
      forward: canMoveForward,
      backward: canMoveBackward,
      back: canMoveBackward
    };
  }
  function reorderNodes(doc, ids, action) {
    if (!['front','forward','backward','back'].includes(action)) fail('重なり順の操作が不正です。');
    const source = parseDocument(doc), { selected, nodes } = nodeOrderSelection(source, ids);
    if (components(source).some(item => selected.has(item.id) && item.locked)) fail('固定された部品は変更できません。');
    if (!nodes.length) return false;
    if (!nodeOrderActions(source, ids)[action]) return false;
    const chosen = new Set(nodes.map(node => node.id)), order = source.nodes;
    let reordered;
    if (action === 'front') reordered = [...order.filter(node => !chosen.has(node.id)), ...order.filter(node => chosen.has(node.id))];
    else if (action === 'back') reordered = [...order.filter(node => chosen.has(node.id)), ...order.filter(node => !chosen.has(node.id))];
    else if (action === 'forward') {
      reordered = [];
      for (let index = 0; index < order.length;) {
        if (!chosen.has(order[index].id)) { reordered.push(order[index++]); continue; }
        let end = index; while (end < order.length && chosen.has(order[end].id)) end++;
        if (end < order.length) reordered.push(order[end]);
        reordered.push(...order.slice(index, end)); index = end + (end < order.length ? 1 : 0);
      }
    } else {
      reordered = [];
      for (let index = 0; index < order.length;) {
        if (chosen.has(order[index].id) || index + 1 >= order.length || !chosen.has(order[index + 1].id)) { reordered.push(order[index++]); continue; }
        let end = index + 1; while (end < order.length && chosen.has(order[end].id)) end++;
        reordered.push(...order.slice(index + 1, end), order[index]); index = end;
      }
    }
    applyDocumentChange(doc, { ...source, nodes: reordered });
    return true;
  }
  function memberships(doc, componentId) { return (doc.groups || []).filter(group => group.memberIds.includes(componentId)).map(group => group.id).sort(); }
  function assertEditable(before, after, { allowLockChange = false, allowLessonChange = false } = {}) {
    const a = parseDocument(before), b = parseDocument(after);
    const beforeStudent = a.lesson && a.lesson.studentMode;
    if (JSON.stringify(a.lesson) !== JSON.stringify(b.lesson) && !allowLessonChange) fail('授業用設定は編集できません。');
    const byId = new Map(components(b).map(item => [item.id, item]));
    for (const old of components(a)) if (old.locked) {
      const next = byId.get(old.id); if (!next) fail('固定された部品は削除できません。');
      const oldData = clone(old), nextData = clone(next); delete oldData.locked; delete nextData.locked;
      if (JSON.stringify(oldData) !== JSON.stringify(nextData) || JSON.stringify(memberships(a, old.id)) !== JSON.stringify(memberships(b, old.id))) fail('固定された部品は変更できません。');
      if (old.locked !== next.locked && (!allowLockChange || beforeStudent)) fail('固定設定は変更できません。');
    }
    if (beforeStudent) for (const old of components(a)) { const next = byId.get(old.id); if (next && old.locked !== next.locked) fail('生徒用では固定設定を変更できません。'); }
    return true;
  }
  // Validate the complete replacement before changing the caller's document so a
  // batch can never leave an earlier item changed after a later failure.
  function applyDocumentChange(doc, next) { const clean = parseDocument(next); assertEditable(doc, clean); Object.assign(doc, clean); }
  function addLane(doc, options = {}) {
    const next = clone(doc); if (next.lanes.length >= 50) fail('担当領域は50個までです。'); if (!record(options)) fail('担当領域の設定が不正です。');
    const ends = next.lanes.map(l => l.x + l.w), nodeEnd = next.nodes.length ? Math.max(...next.nodes.map(n => n.x + n.w + 20)) : -100000;
    const last = [...next.lanes].sort((a,b) => a.x - b.x).at(-1), used = new Set(next.lanes.map(l => l.title)); let counter = 1; while (used.has(`担当${counter}`)) counter++;
    const x = number(options.x, Math.max(ends.length ? Math.max(...ends) : 40, nodeEnd), -100000, 100000), y = number(options.y, next.lanes.length ? Math.min(...next.lanes.map(l => l.y)) : 40, -100000, 100000), w = number(options.w, Math.max(140, Math.min(6000, last ? last.w : 300)), 140, 6000), h = number(options.h, next.lanes.length ? Math.max(600, Math.max(...next.lanes.map(l => l.y + l.h)) - y) : 600, 1, 20000);
    const lane = { id: options.id === undefined ? uid('lane') : id(options.id), title: text(options.title, `担当${counter}`, 160), x, y, w, h, locked: false }; next.lanes.push(lane); applyDocumentChange(doc, next); return lane.id;
  }
  function removeLane(doc, laneId) {
    const next = clone(doc), lane = next.lanes.find(l => l.id === laneId); if (!lane) fail('担当領域が見つかりません。'); if (lane.locked) fail('固定された担当領域は削除できません。');
    const members = next.nodes.filter(n => n.laneId === laneId); if (members.some(n => n.locked)) fail('固定された図形がある担当領域は削除できません。'); members.forEach(n => { n.laneId = null; }); next.lanes = next.lanes.filter(l => l.id !== laneId); applyDocumentChange(doc, next); return laneId;
  }
  function moveLane(doc, laneId, direction) {
    if (direction !== -1 && direction !== 1) fail('移動方向が不正です。'); const next = clone(doc), lanes = [...next.lanes].sort((a,b) => a.x - b.x), index = lanes.findIndex(l => l.id === laneId); if (index < 0) fail('担当領域が見つかりません。'); const otherIndex = index + direction; if (otherIndex < 0 || otherIndex >= lanes.length) return false;
    const left = direction < 0 ? lanes[otherIndex] : lanes[index], right = direction < 0 ? lanes[index] : lanes[otherIndex]; if (left.x + left.w > right.x) fail('重なっている担当領域は並べ替えできません。'); if (left.locked || right.locked) fail('固定された担当領域は並べ替えできません。');
    const gap = right.x - (left.x + left.w), shifts = new Map([[left.id, right.w + gap], [right.id, -(left.w + gap)]]), movingNodes = new Map(); next.nodes.forEach(n => { if (shifts.has(n.laneId)) movingNodes.set(n.id, shifts.get(n.laneId)); });
    if ([...movingNodes.keys()].some(id => next.nodes.find(n => n.id === id).locked)) fail('固定された図形がある担当領域は並べ替えできません。');
    const groupEdgeDeltas = new Map(), nodeById = new Map(next.nodes.map(n => [n.id, n])), edgeById = new Map(next.edges.map(e => [e.id, e]));
    for (const group of next.groups || []) {
      const deltas = new Set(), groupEdges = [];
      for (const memberId of group.memberIds) {
        if (nodeById.has(memberId)) deltas.add(movingNodes.get(memberId) ?? 0);
        const edge = edgeById.get(memberId); if (!edge) continue;
        groupEdges.push(edge);
        // Attached nodes anchor an edge-only group, even when they are not group members.
        for (const endpoint of [edge.from, edge.to]) if (endpoint.nodeId) deltas.add(movingNodes.get(endpoint.nodeId) ?? 0);
      }
      if (deltas.size > 1) fail('領域をまたぐグループは、解除してから並べ替えてください。');
      const dx = deltas.values().next().value || 0;
      if (dx) groupEdges.forEach(edge => groupEdgeDeltas.set(edge.id, dx));
    }
    const leftX = left.x, rightX = right.x; next.lanes.forEach(l => { if (l.id === left.id) l.x = rightX + right.w - left.w; else if (l.id === right.id) l.x = leftX; }); next.nodes.forEach(n => { const dx = movingNodes.get(n.id); if (dx) n.x += dx; });
    next.edges.forEach(e => {
      const a = movingNodes.get(e.from.nodeId), b = movingNodes.get(e.to.nodeId), groupDx = groupEdgeDeltas.get(e.id), internalDx = a && a === b ? a : 0;
      const translatePath = dx => { if (e.bend) e.bend.x += dx; (e.waypoints || []).forEach(point => { point.x += dx; }); };
      if (internalDx) translatePath(internalDx);
      if (groupDx) {
        if (!e.from.nodeId) e.from.x += groupDx;
        if (!e.to.nodeId) e.to.x += groupDx;
        if (!internalDx) translatePath(groupDx);
      }
    });
    next.lanes.sort((a,b) => a.x - b.x); applyDocumentChange(doc, next); return true;
  }
  function changeNodeShape(doc, ids, kind, options = {}) {
    if (!Object.hasOwn(NODE_DEFS,kind)) fail('対応していない図形です。');
    if (kind === 'state' && options.variant !== undefined) enumValue(options.variant,['circle','round'],'circle');
    const selected = new Set(ids), changed = [], def = NODE_DEFS[kind];
    const small = k => ['initial','final','junction','merge'].includes(k), bar = k => ['fork','join'].includes(k);
    const nodes = doc.nodes.map(n => {
      const variant = kind === 'state' ? options.variant || n.variant || 'circle' : null;
      if (!selected.has(n.id) || n.kind === kind && (kind !== 'state' || n.variant === variant)) return n;
      const next = clone(n), cx = n.x + n.w/2, cy = n.y + n.h/2;
      if (small(kind) || (small(n.kind) || bar(n.kind)) && !bar(kind)) { next.w = def.w; next.h = def.h; }
      else if (bar(kind)) { next.w = Math.max(def.w, small(n.kind) ? 0 : n.w); next.h = bar(n.kind) ? n.h : def.h; }
      else { next.w = Math.max(n.w,def.w); next.h = Math.max(n.h,def.h); }
      next.kind = kind;
      if (kind === 'state') { next.variant = variant; if (variant === 'circle') next.w = next.h = Math.max(next.w,next.h); }
      else delete next.variant;
      next.x = cx-next.w/2; next.y = cy-next.h/2;
      changed.push(n.id); return next;
    });
    if (changed.length) doc.nodes = parseDocument({...doc,nodes}).nodes;
    return changed;
  }
  function changeEdgeShape(doc, ids, { kind, head } = {}) {
    if (kind !== undefined) enumValue(kind,['orthogonal','straight','curve'],'orthogonal');
    if (head !== undefined) enumValue(head,['end','both','none'],'end');
    const selected = new Set(ids), changed = [];
    const edges = doc.edges.map(e => {
      if (!selected.has(e.id)) return e;
      if (kind === 'straight' && e.from.nodeId && e.from.nodeId === e.to.nodeId) fail('自己ループは直角または曲線に変更できます。');
      if ((kind === undefined || e.kind === kind) && (head === undefined || e.head === head)) return e;
      const next = clone(e);
      if (kind !== undefined && kind !== e.kind) { next.kind = kind; next.bend = null; next.waypoints = []; }
      if (head !== undefined) next.head = head;
      changed.push(e.id); return next;
    });
    if (changed.length) doc.edges = parseDocument({...doc,edges}).edges;
    return changed;
  }
  function matchNodeSize(doc, ids, referenceId, dimension = 'both') {
    if (!['width','height','both'].includes(dimension)) fail('そろえる寸法が不正です。');
    const source = parseDocument(doc), selected = new Set(expandSelection(source, ids));
    const nodes = source.nodes.filter(node => selected.has(node.id));
    const reference = nodes.find(node => node.id === referenceId);
    if (!reference) fail('基準となる図形を選択してください。');
    if (nodes.length < 2) fail('2つ以上の図形を選択してください。');
    if (nodes.some(node => node.id !== referenceId && node.locked)) fail('固定された部品は変更できません。');
    const next = clone(source), changed = [];
    for (const node of next.nodes) {
      if (!selected.has(node.id) || node.id === referenceId) continue;
      let w = node.w, h = node.h;
      const circular = node.kind === 'state' && node.variant !== 'round';
      if (circular && dimension === 'both' && reference.w !== reference.h) fail('円形の状態には、幅か高さを指定してください。');
      if (circular) {
        const size = dimension === 'height' ? reference.h : reference.w;
        w = h = size;
      } else {
        if (dimension === 'width' || dimension === 'both') w = reference.w;
        if (dimension === 'height' || dimension === 'both') h = reference.h;
      }
      if (w === node.w && h === node.h) continue;
      const cx = node.x + node.w / 2, cy = node.y + node.h / 2;
      node.w = w; node.h = h; node.x = cx - w / 2; node.y = cy - h / 2;
      changed.push(node.id);
    }
    if (!changed.length) return [];
    applyDocumentChange(doc, next);
    return changed;
  }
  function setEdgeWaypoints(doc, edgeId, points) {
    const source = parseDocument(doc), next = clone(source), edge = next.edges.find(item => item.id === edgeId);
    if (!edge) fail('線が見つかりません。');
    if (edge.kind !== 'orthogonal') fail('経路点は直角の線だけに設定できます。');
    if (!Array.isArray(points)) fail('線の経路点が不正です。');
    const replacement = waypoints(points, edge.kind);
    if (JSON.stringify(edge.waypoints) === JSON.stringify(replacement) && edge.bend === null) return false;
    edge.waypoints = replacement; edge.bend = null;
    applyDocumentChange(doc, next);
    return true;
  }
  function copyStyle(doc, sourceId) {
    const clean = parseDocument(doc), node = clean.nodes.find(item => item.id === sourceId), edge = clean.edges.find(item => item.id === sourceId);
    if (!node && !edge) fail('図形または線を選択してください。');
    const source = node || edge;
    return { format: 'kaijo-diagram-style', version: 1, sourceType: node ? 'node' : 'edge', style: clone(style(source.style)) };
  }
  function stylePayload(payload) {
    if (!record(payload) || payload.format !== 'kaijo-diagram-style' || payload.version !== 1 || !['node','edge'].includes(payload.sourceType) || !record(payload.style)) fail('フローチャートエディタでコピーした書式を貼り付けてください。');
    return { sourceType: payload.sourceType, style: style(payload.style) };
  }
  function pasteStyle(doc, ids, payload) {
    const source = parseDocument(doc), selected = new Set(expandSelection(source, ids)), targets = [...source.nodes, ...source.edges].filter(item => selected.has(item.id));
    if (!targets.length) fail('図形または線を選択してください。');
    const copied = stylePayload(payload);
    if (targets.some(item => item.locked)) fail('固定された部品は変更できません。');
    const next = clone(source), changed = [];
    for (const item of [...next.nodes, ...next.edges]) {
      if (!selected.has(item.id)) continue;
      const previous = item.style, replacement = { ...previous };
      for (const key of ['fontSize','stroke','color','strokeWidth','dashed','bold']) replacement[key] = copied.style[key];
      if (copied.sourceType === 'node' && next.nodes.includes(item)) replacement.fill = copied.style.fill;
      if (JSON.stringify(previous) === JSON.stringify(replacement)) continue;
      item.style = replacement; changed.push(item.id);
    }
    if (!changed.length) return [];
    applyDocumentChange(doc, next);
    return changed;
  }
  function removeSelection(doc, ids) {
    const selected = new Set(expandSelection(doc, ids));
    doc.nodes = doc.nodes.filter(n => !selected.has(n.id));
    doc.edges = doc.edges.filter(e => !selected.has(e.id) && !selected.has(e.from.nodeId) && !selected.has(e.to.nodeId));
    const retained = new Set([...doc.nodes, ...doc.edges].map(item => item.id));
    doc.groups = (doc.groups || []).map(group => ({ ...group, memberIds: group.memberIds.filter(member => retained.has(member)) })).filter(group => group.memberIds.length >= 2);
  }
  function detached(doc, p) {
    if (!p.nodeId) return clone(p);
    const n = getNode(doc, p.nodeId), offset = p.offset ?? .5;
    if (!n) fail('接続先が見つかりません。');
    if (p.side === 'top') return { x: n.x + n.w * offset, y: n.y };
    if (p.side === 'bottom') return { x: n.x + n.w * offset, y: n.y + n.h };
    if (p.side === 'left') return { x: n.x, y: n.y + n.h * offset };
    if (p.side === 'right') return { x: n.x + n.w, y: n.y + n.h * offset };
    return { x: n.x + n.w / 2, y: n.y + n.h / 2 };
  }
  function copySelection(doc, ids) {
    const selected = new Set(expandSelection(doc, ids)), nodes = doc.nodes.filter(n => selected.has(n.id)).map(n => ({ ...clone(n), laneId: null }));
    const selectedNodes = new Set(nodes.map(n => n.id));
    const edges = doc.edges.filter(e => selected.has(e.id) || selectedNodes.has(e.from.nodeId) && selectedNodes.has(e.to.nodeId)).map(e => {
      const copy = clone(e);
      for (const side of ['from','to']) if (copy[side].nodeId && !selectedNodes.has(copy[side].nodeId)) copy[side] = detached(doc, copy[side]);
      return copy;
    });
    const copied = new Set([...nodes, ...edges].map(item => item.id));
    const groups = (doc.groups || []).filter(group => group.memberIds.every(member => copied.has(member))).map(clone);
    return { format: 'kaijo-diagram-selection', version: 3, nodes, edges, groups };
  }
  function pasteSelection(doc, payload, dx = 24, dy = 24) {
    if (!record(payload) || payload.format !== 'kaijo-diagram-selection' || ![1,2,3].includes(payload.version)) fail('フローチャートエディタでコピーした部品を貼り付けてください。');
    const clean = parseDocument({ format: 'kaijo-diagram', version: 3, id: 'clipboard', title: '', diagramType: doc.diagramType, nodes: payload.nodes, edges: payload.edges, lanes: [], groups: payload.groups || [], lesson: null });
    const map = new Map(clean.nodes.map(n => [n.id, uid('node')])), ids = [];
    clean.nodes.forEach(n => { n.id = map.get(n.id); n.x += dx; n.y += dy; n.laneId = findLane(doc, n.x + n.w / 2, n.y + n.h / 2)?.id || null; n.locked = false; ids.push(n.id); });
    clean.edges.forEach(e => {
      const oldId = e.id; e.id = uid('edge'); map.set(oldId, e.id); e.locked = false; ids.push(e.id);
      for (const side of ['from','to']) { if (e[side].nodeId) e[side].nodeId = map.get(e[side].nodeId); else { e[side].x += dx; e[side].y += dy; } }
      if (e.bend) { e.bend.x += dx; e.bend.y += dy; }
      e.waypoints.forEach(point => { point.x += dx; point.y += dy; });
    });
    const groups = clean.groups.map(group => ({ id: uid('group'), memberIds: group.memberIds.map(member => map.get(member)) }));
    const combined = { ...doc, nodes: [...doc.nodes, ...clean.nodes], edges: [...doc.edges, ...clean.edges], groups: [...(doc.groups || []), ...groups] };
    parseDocument(combined);
    doc.nodes = combined.nodes; doc.edges = combined.edges; doc.groups = combined.groups;
    return ids;
  }
  function insertNodeOnEdge(doc, edgeId, item, { entrySide = 'auto', exitSide = 'auto', direction = null, incomingBend = null, outgoingBend = null, incomingWaypoints, outgoingWaypoints } = {}) {
    const next = clone(parseDocument(doc)), original = next.edges.find(e => e.id === edgeId), inserted = clone(item);
    if (!original) fail('挿入先の線が見つかりません。');
    if (original.waypoints.length && (!Array.isArray(incomingWaypoints) || !Array.isArray(outgoingWaypoints))) fail('手動経路の線へ挿入するには、分割後の経路点が必要です。');
    const source = getNode(next, original.from.nodeId), target = getNode(next, original.to.nodeId);
    // Open a gap along a straight run. A cycle stops at the source, and unrelated nodes stay put.
    if (direction && source && target && source !== target) {
      const axis = ['up','down'].includes(direction) ? 'y' : 'x', size = axis === 'y' ? 'h' : 'w';
      const sign = ['down','right'].includes(direction) ? 1 : -1;
      const sourceEnd = source[axis] + (sign > 0 ? source[size] : 0);
      inserted[axis] = sign > 0 ? Math.max(inserted[axis], sourceEnd + 36) : Math.min(inserted[axis], sourceEnd - 36 - inserted[size]);
      const targetStart = target[axis] + (sign < 0 ? target[size] : 0);
      const required = inserted[axis] + (sign > 0 ? inserted[size] : 0) + sign * 36;
      const delta = sign * Math.max(0, sign * (required - targetStart));
      if (delta) {
        const moved = new Set(), queue = [target.id];
        while (queue.length) {
          const id = queue.pop(); if (id === source.id || moved.has(id)) continue;
          const candidate = getNode(next,id);
          if (id !== target.id && sign * (candidate[axis] + candidate[size]/2 - sourceEnd) <= 0) continue;
          moved.add(id);
          next.edges.forEach(e => { if (e.from.nodeId === id && e.to.nodeId) queue.push(e.to.nodeId); });
        }
        // A grouped diagram fragment keeps its relative arrangement when a gap moves it.
        const movedGroupEdges = new Set();
        for (const group of next.groups || []) if (group.memberIds.some(member => moved.has(member))) {
          if (group.memberIds.includes(source.id)) fail('同じグループ内では、部品を挿入するための余白を安全に確保できません。');
          group.memberIds.forEach(member => { if (getNode(next, member)) moved.add(member); else if (next.edges.some(edge => edge.id === member)) movedGroupEdges.add(member); });
        }
        next.nodes.forEach(n => { if (moved.has(n.id)) n[axis] += delta; });
        next.edges.forEach(e => {
          const followsMovedNodes = moved.has(e.from.nodeId) && (moved.has(e.to.nodeId) || !e.to.nodeId);
          const followsGroup = movedGroupEdges.has(e.id);
          // 内部線がグループにも属する場合でも、経路と自由端は1回だけ動かす。
          if (followsMovedNodes || followsGroup) {
            if (e.bend) e.bend[axis] += delta;
            e.waypoints.forEach(point => { point[axis] += delta; });
            if (followsGroup) {
              for (const endpoint of [e.from, e.to]) if (!endpoint.nodeId) endpoint[axis] += delta;
            } else if (!e.to.nodeId) e.to[axis] += delta;
          }
        });
      }
    }
    inserted.laneId = findLane(next, inserted.x + inserted.w / 2, inserted.y + inserted.h / 2)?.id || source?.laneId || null;
    const after = createEdge({ nodeId: inserted.id, side: exitSide, offset: .5 }, original.to, { kind: original.kind, head: original.head, style: original.style, bend: outgoingBend, waypoints: outgoingWaypoints });
    original.to = { nodeId: inserted.id, side: entrySide, offset: .5 }; original.bend = incomingBend ? clone(incomingBend) : null; original.waypoints = incomingWaypoints === undefined ? [] : clone(incomingWaypoints);
    next.nodes.push(inserted); next.edges.push(after);
    next.lanes.forEach(l => { l.h = Math.max(l.h, ...next.nodes.filter(n => n.laneId === l.id).map(n => n.y + n.h + 24 - l.y)); });
    const clean = parseDocument(next); assertEditable(doc, clean);
    doc.nodes = clean.nodes; doc.edges = clean.edges; doc.lanes = clean.lanes;
    return { nodeId: inserted.id, edgeIds: [original.id, after.id] };
  }
  function addBranch(doc, x, y) {
    if (doc.diagramType !== 'flowchart') fail('分岐セットはフローチャートで使えます。');
    const decision = createNode('decision', x - 86, y - 50, { text: '条件' });
    const yes = createNode('process', x + 140 - 84, y + 128, { text: 'はいの処理' });
    const no = createNode('process', x - 140 - 84, y + 128, { text: 'いいえの処理' });
    const merge = createNode('junction', x - 6, y + 274);
    const ep = (n, side) => ({ nodeId: n.id, side, offset: .5 });
    const nodes = [decision, yes, no, merge], edges = [
      createEdge(ep(decision,'right'), ep(yes,'top'), { label: { text: 'はい', t: .18, dy: -16 } }),
      createEdge(ep(decision,'left'), ep(no,'top'), { label: { text: 'いいえ', t: .18, dy: -16 } }),
      createEdge(ep(yes,'bottom'), ep(merge,'right')),
      createEdge(ep(no,'bottom'), ep(merge,'left'))
    ];
    nodes.forEach(n => { n.laneId = findLane(doc, n.x + n.w/2, n.y + n.h/2)?.id || null; });
    const clean = parseDocument({ ...doc, nodes: [...doc.nodes, ...nodes], edges: [...doc.edges, ...edges] });
    doc.nodes = clean.nodes; doc.edges = clean.edges;
    const ids = [...nodes, ...edges].map(o => o.id), groupId = groupSelection(doc, ids);
    return { nodeId: decision.id, ids, groupId };
  }
  function traceStarts(doc) {
    const usable = doc.nodes.filter(node => node.kind !== 'text');
    const initial = usable.filter(node => node.kind === 'initial'); if (initial.length) return initial.map(node => node.id);
    const incoming = new Set();
    doc.edges.filter(edge => edge.head !== 'none').forEach(edge => { if (edge.to.nodeId) incoming.add(edge.to.nodeId); if (edge.head === 'both' && edge.from.nodeId) incoming.add(edge.from.nodeId); });
    const roots = usable.filter(node => !incoming.has(node.id)); return (roots.length ? roots : usable).map(node => node.id);
  }
  function inspectDocument(doc) {
    const graph = parseDocument(doc), suggestions = [];
    const isBlank = value => !String(value || '').trim();
    const connected = new Set();
    graph.edges.forEach(edge => { if (edge.from.nodeId) connected.add(edge.from.nodeId); if (edge.to.nodeId) connected.add(edge.to.nodeId); });
    const blankKinds = new Set(['terminal', 'process', 'action', 'decision', 'inputOutput', 'manualInput', 'display', 'loopStart', 'loopEnd', 'state', 'text']);
    for (const node of graph.nodes) if (blankKinds.has(node.kind) && isBlank(node.text)) suggestions.push({ code: 'blank-node-label', message: '文字が空です。必要な内容を書きますか？', ids: [node.id] });
    for (const edge of graph.edges) if (edge.head !== 'none' && (!edge.from.nodeId || !edge.to.nodeId)) suggestions.push({ code: 'free-arrow-end', message: '接続先がない矢印です。意図した自由線か確認してください。', ids: [edge.id] });
    if (graph.diagramType === 'flowchart' || graph.diagramType === 'activity') {
      for (const node of graph.nodes.filter(node => node.kind === 'decision')) {
        const outgoingEdges = graph.edges.filter(edge => edge.head !== 'none' && (edge.from.nodeId === node.id || edge.head === 'both' && edge.to.nodeId === node.id));
        if (outgoingEdges.length > 1) for (const edge of outgoingEdges) if (isBlank(edge.label.text)) suggestions.push({ code: 'decision-branch-label', message: graph.diagramType === 'flowchart' ? '分岐の行き先が分かるラベルを付けますか？' : '分岐の条件や行き先が分かるラベルを付けますか？', ids: [node.id, edge.id] });
      }
    }
    if (graph.diagramType === 'state') {
      const labelled = new Set(); for (const node of graph.nodes.filter(node => node.kind === 'state')) {
      const outgoingEdges = graph.edges.filter(edge => edge.head !== 'none' && (edge.from.nodeId === node.id || edge.head === 'both' && edge.to.nodeId === node.id));
      for (const edge of outgoingEdges) if (isBlank(edge.label.text) && !labelled.has(edge.id)) { labelled.add(edge.id); suggestions.push({ code: 'state-transition-label', message: '状態が変わる条件やきっかけを付けますか？', ids: [node.id, edge.id] }); }
      }
    }
    const visibleNodes = graph.nodes.filter(node => node.kind !== 'text');
    if (visibleNodes.length > 1) for (const node of visibleNodes) if (!connected.has(node.id)) suggestions.push({ code: 'isolated-node', message: 'ほかの部品とつながっていません。意図した配置か確認してください。', ids: [node.id] });
    return suggestions;
  }
  function createTrace(doc, startNodeId) {
    parseDocument(doc); const start = getNode(doc, startNodeId); if (!start || start.kind === 'text') fail('開始する部品が見つかりません。');
    return { current: [startNodeId], visitedNodes: [startNodeId], visitedEdges: [], history: [], waiting: [], status: 'ready', _tokens: [{ nodeId: startNodeId }], _snapshots: [] };
  }
  function outgoing(doc, nodeId) {
    const result = [];
    for (const edge of doc.edges) {
      if (edge.head === 'none') { if (edge.from.nodeId === nodeId || edge.to.nodeId === nodeId) result.push({ edge, nodeId: null, status: 'unavailable', reason: '方向のない線はトレースできません。' }); continue; }
      if (edge.from.nodeId === nodeId) result.push({ edge, nodeId: edge.to.nodeId || null, status: edge.to.nodeId ? 'ready' : 'blocked', reason: edge.to.nodeId ? '' : 'この線の接続先がありません。' });
      if (edge.head === 'both' && edge.to.nodeId === nodeId) result.push({ edge, nodeId: edge.from.nodeId || null, status: edge.from.nodeId ? 'ready' : 'blocked', reason: edge.from.nodeId ? '' : 'この線の接続先がありません。' });
    }
    return result.filter((path, index, all) => all.findIndex(other => other.edge.id === path.edge.id && other.nodeId === path.nodeId) === index);
  }
  function joinInbound(doc, nodeId) {
    const ids = new Set();
    for (const edge of doc.edges) {
      if (edge.head === 'none') continue;
      if (edge.to.nodeId === nodeId) ids.add(edge.id);
      if (edge.head === 'both' && edge.from.nodeId === nodeId) ids.add(edge.id);
    }
    return [...ids];
  }
  function traceOptions(doc, state) {
    if (!state || !Array.isArray(state.current)) fail('トレースの状態が不正です。');
    if (state.status === 'complete' || state.status === 'limit') return [];
    const options = [];
    for (const nodeId of state.current) {
      const node = getNode(doc, nodeId); if (!node) continue;
      const paths = outgoing(doc, nodeId);
      if (node.kind === 'fork') { const blocked = paths.find(path => path.status !== 'ready'); options.push({ nodeId, edgeId: null, label: '並列の枝へ進む', status: blocked || !paths.length ? 'blocked' : 'ready', reason: blocked ? blocked.reason : !paths.length ? '並列の枝がありません。' : '' }); }
      else if (!paths.length || node.kind === 'final') options.push({ nodeId, edgeId: null, label: 'ここで終了', status: 'ready' });
      else for (const path of paths) options.push({ nodeId, edgeId: path.edge.id, label: path.edge.label.text || '次へ進む', status: path.status, reason: path.reason });
    }
    return options.filter((option, index, all) => all.findIndex(other => other.nodeId === option.nodeId && other.edgeId === option.edgeId) === index);
  }
  function publicTrace(state) { return clone(state); }
  function copyArrivals(source) {
    const arrivals = Object.create(null);
    for (const [joinId, counts] of Object.entries(source || {})) arrivals[joinId] = Object.assign(Object.create(null), counts);
    return arrivals;
  }
  function stepTrace(doc, state, nodeId, edgeId) {
    parseDocument(doc); if (state.status === 'complete' || state.status === 'limit') fail('トレースは終了しています。');
    if ((state._steps || 0) >= 1000) return { ...state, status: 'limit' };
    const tokenIndex = (state._tokens || []).findIndex(item => item.nodeId === nodeId); if (tokenIndex < 0) fail('現在位置ではない部品は選べません。');
    const option = traceOptions(doc, state).find(item => item.nodeId === nodeId && item.edgeId === edgeId);
    if (!option || option.status !== 'ready') fail(option && option.reason || 'その進み方は選べません。');
    const snapshot = { tokens: clone(state._tokens || []), arrivals: copyArrivals(state._arrivals), status: state.status, steps: state._steps || 0, visitedNodeCount: state.visitedNodes.length, visitedEdgeCount: state.visitedEdges.length, waiting: clone(state.waiting || []) };
    const next = { ...state, current: [...state.current], visitedNodes: [...state.visitedNodes], visitedEdges: [...state.visitedEdges], history: [...state.history], waiting: [...(state.waiting || [])], _tokens: clone(state._tokens || []), _arrivals: copyArrivals(state._arrivals), _snapshots: [...(state._snapshots || []), snapshot] };
    next._steps = (state._steps || 0) + 1;
    next._tokens.splice(tokenIndex, 1);
    let edgeIds = [];
    if (edgeId === null && getNode(doc, nodeId).kind === 'fork') {
      const paths = outgoing(doc, nodeId); if (!paths.length || paths.some(path => path.status !== 'ready')) fail('並列の枝に進めません。');
      edgeIds = paths.map(path => path.edge.id); paths.forEach(path => next._tokens.push({ nodeId: path.nodeId, via: path.edge.id, arriving: true }));
    } else if (edgeId === null) {
      if (getNode(doc, nodeId).kind === 'final' && doc.diagramType === 'activity') { next._tokens = []; next._arrivals = {}; }
    } else { const path = outgoing(doc, nodeId).find(path => path.edge.id === edgeId && path.status === 'ready'); edgeIds = [edgeId]; next._tokens.push({ nodeId: path.nodeId, via: edgeId, arriving: true }); }
    next.visitedEdges = [...next.visitedEdges, ...edgeIds];
    next.history.push({ nodeId, edgeIds, label: option.label });
    const arrivedAtJoin = next._tokens.filter(item => item.arriving && getNode(doc, item.nodeId)?.kind === 'join');
    next._tokens = next._tokens.filter(item => !(item.arriving && getNode(doc, item.nodeId)?.kind === 'join'));
    for (const item of arrivedAtJoin) if (item.via) {
      const counts = next._arrivals[item.nodeId] || Object.create(null);
      counts[item.via] = (counts[item.via] || 0) + 1; next._arrivals[item.nodeId] = counts;
    }
    for (const joinId of Object.keys(next._arrivals)) {
      const required = joinInbound(doc, joinId), counts = next._arrivals[joinId];
      if (required.length && required.every(edgeId => (counts[edgeId] || 0) > 0)) {
        required.forEach(edgeId => { counts[edgeId]--; if (!counts[edgeId]) delete counts[edgeId]; });
        next._tokens.push({ nodeId: joinId, arriving: false }); if (!Object.keys(counts).length) delete next._arrivals[joinId];
      }
    }
    next._tokens.forEach(item => { delete item.arriving; });
    next.waiting = Object.entries(next._arrivals).map(([waitingNodeId, counts]) => ({ nodeId: waitingNodeId, arrived: Object.values(counts).filter(count => count > 0).length, required: joinInbound(doc, waitingNodeId).length }));
    next.current = next._tokens.map(item => item.nodeId); next.visitedNodes = [...new Set([...next.visitedNodes, ...next.current, ...arrivedAtJoin.map(item => item.nodeId)])];
    if (next._steps >= 1000) next.status = 'limit'; else if (!next.current.length && !next.waiting.length) next.status = 'complete'; else if (!next.current.length) next.status = 'blocked'; else next.status = 'ready';
    return publicTrace(next);
  }
  function backTrace(state) {
    if (!state || !state._snapshots || !state._snapshots.length) return null;
    const snapshot = state._snapshots[state._snapshots.length - 1], tokens = clone(snapshot.tokens || []), arrivals = copyArrivals(snapshot.arrivals);
    const previous = { ...state, current: tokens.map(token => token.nodeId), visitedNodes: state.visitedNodes.slice(0, snapshot.visitedNodeCount), visitedEdges: state.visitedEdges.slice(0, snapshot.visitedEdgeCount), history: state.history.slice(0, -1), waiting: clone(snapshot.waiting || []), status: snapshot.status, _tokens: tokens, _arrivals: arrivals, _steps: snapshot.steps, _snapshots: state._snapshots.slice(0, -1) };
    return publicTrace(previous);
  }
  class History {
    constructor(doc) { this.reset(doc); }
    reset(doc) { this.states = [serializeDocument(doc)]; this.index = 0; }
    get canUndo() { return this.index > 0; }
    get canRedo() { return this.index < this.states.length - 1; }
    commit(doc) {
      const state = serializeDocument(doc); if (state === this.states[this.index]) return false;
      this.states.splice(this.index + 1); this.states.push(state);
      if (this.states.length > 100) this.states.shift(); this.index = this.states.length - 1; return true;
    }
    undo() { return this.canUndo ? JSON.parse(this.states[--this.index]) : null; }
    redo() { return this.canRedo ? JSON.parse(this.states[++this.index]) : null; }
  }
  const TEMPLATES = Object.freeze([
    { id: 'flow-branch', title: '分岐と反復', description: '内容を確認し、必要なら修正して、もう一度確認する。', diagramType: 'flowchart' },
    { id: 'flow-sequence', title: '順番に進める', description: '入力、処理、出力を順に並べる。', diagramType: 'flowchart' },
    { id: 'activity-parallel', title: '担当を分けて並行作業', description: '資料集めと図の作成を分担し、終わってからまとめる。', diagramType: 'activity' },
    { id: 'state-device', title: '操作による状態の変化', description: '開始・停止・一時停止。自己ループと複数の遷移を含む。', diagramType: 'state' }
  ]);
  function createTemplate(templateId) {
    const meta = TEMPLATES.find(t => t.id === templateId); if (!meta) fail('ひな形が見つかりません。');
    const doc = createDocument(meta.diagramType); doc.title = meta.title;
    const n = (kind, x, y, text, options = {}) => { const item = createNode(kind, x, y, { text, ...options }); item.laneId = findLane(doc, x + item.w/2, y + item.h/2)?.id || null; doc.nodes.push(item); return item; };
    const e = (from, to, label = '', options = {}) => { const item = createEdge({ nodeId: from.id, side: 'auto', offset: .5 }, { nodeId: to.id, side: 'auto', offset: .5 }, { label: { text: label }, ...options }); doc.edges.push(item); return item; };
    if (templateId === 'flow-branch') {
      const a = n('terminal', 230, 35, '開始'), b = n('process',226,135,'内容を確認'), c = n('decision',224,270,'修正が必要'), d = n('process',226,430,'修正する'), z = n('terminal',30,550,'終了');
      e(a,b); e(b,c); e(c,d,'はい').from = {nodeId:c.id,side:'bottom',offset:.5};
      e(c,z,'いいえ',{bend:{x:110,y:320},label:{text:'いいえ',t:.18,dy:-16}}).from = {nodeId:c.id,side:'left',offset:.5};
      e(d,b,'もう一度',{bend:{x:510,y:230}});
    } else if (templateId === 'flow-sequence') {
      const a = n('terminal',190,30,'開始'), b = n('inputOutput',184,130,'数値を入力'), c = n('process',186,260,'合計を求める'), d = n('display',184,390,'結果を表示'), z = n('terminal',190,510,'終了');
      e(a,b); e(b,c); e(c,d); e(d,z);
    } else if (templateId === 'activity-parallel') {
      doc.lanes[0].title = '班員A'; doc.lanes[1].title = '班員B'; doc.lanes.forEach(l=>{l.h=610;});
      const a=n('initial',178,80,''), b=n('action',106,150,'課題を確認'), f=n('fork',106,265,''), p=n('action',106,320,'資料を集める'), q=n('action',406,320,'図を作る'), j=n('join',106,445,''), z=n('action',106,495,'内容をまとめる'), end=n('final',176,590,'');
      e(a,b);e(b,f);e(f,p);e(f,q);e(p,j);e(q,j);e(j,z);e(z,end);
    } else {
      const a=n('state',75,185,'待機'), b=n('state',385,185,'動作中'), c=n('state',235,465,'一時停止',{w:170,h:72,variant:'round'});
      e(a,b,'開始',{kind:'curve'});e(b,a,'停止',{kind:'curve'});e(a,b,'再開',{kind:'curve'});e(b,b,'更新',{kind:'curve'});e(b,c,'一時停止',{kind:'curve'});e(c,b,'再開',{kind:'curve'});
    }
    return parseDocument(doc);
  }
  return Object.freeze({ NODE_DEFS, DEFAULT_STYLE, uid, clone, createDocument, createNode, createEdge, parseDocument, serializeDocument, getNode, findLane, expandSelection, groupSelection, ungroupSelection, setLocked, nodeOrderActions, reorderNodes, assertEditable, addLane, removeLane, moveLane, changeNodeShape, changeEdgeShape, matchNodeSize, setEdgeWaypoints, copyStyle, pasteStyle, removeSelection, copySelection, pasteSelection, insertNodeOnEdge, addBranch, traceStarts, inspectDocument, createTrace, traceOptions, stepTrace, backTrace, History, TEMPLATES, createTemplate });
});
