(function (root, factory) {
  const core = typeof module === 'object' && module.exports ? require('./core.js') : root.DiagramCore;
  const render = typeof module === 'object' && module.exports ? require('./render.js') : root.DiagramRender;
  const api = factory(core, render);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.DiagramParts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Render) {
  'use strict';

  if (!Core || !Render) throw new Error('フローチャートエディタの部品セットには core.js と render.js が必要です。');

  const FORMAT = 'kaijo-flowchart-parts';
  const VERSION = 1;
  const LIMIT = 2 * 1024 * 1024;
  const MAX_ITEMS = 100;
  const TYPES = new Set(['flowchart', 'activity', 'state']);
  const clone = value => JSON.parse(JSON.stringify(value));
  const fail = message => { throw new Error(message); };
  const bytes = value => new TextEncoder().encode(value).length;
  const isRecord = value => value && typeof value === 'object' && !Array.isArray(value);
  const isId = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,100}$/.test(value);
  const canonical = value => JSON.stringify(value);

  function itemName(value) {
    if (typeof value !== 'string') fail('部品セット名が不正です。');
    const name = value.trim();
    if (!name || [...name].length > 80) fail('部品セット名は1〜80文字で入力してください。');
    return name;
  }

  function updatedAt(value) {
    if (typeof value !== 'string' || value.length > 40) fail('部品セットの更新日時が不正です。');
    const date = new Date(value);
    if (!Number.isFinite(date.getTime()) || date.toISOString() !== value) fail('部品セットの更新日時が不正です。');
    return value;
  }

  function selectionFor(value, diagramType) {
    if (!isRecord(value) || value.format !== 'kaijo-diagram-selection' || value.version !== 3) fail('部品セットの内容が不正です。');
    if (!Array.isArray(value.nodes) || !Array.isArray(value.edges) || !Array.isArray(value.groups || [])) fail('部品セットの内容が不正です。');
    if ((Array.isArray(value.lanes) && value.lanes.length) || value.lesson != null) fail('部品セットに担当領域や授業用設定は保存できません。');
    if (!value.nodes.length && !value.edges.length) fail('空の部品セットは保存できません。');
    const doc = Core.parseDocument({
      format: 'kaijo-diagram', version: 3, id: 'parts_selection', title: '', diagramType,
      nodes: value.nodes, edges: value.edges, lanes: [], groups: value.groups || [], lesson: null
    });
    if (!doc.nodes.length && !doc.edges.length) fail('空の部品セットは保存できません。');
    return { format: 'kaijo-diagram-selection', version: 3, nodes: clone(doc.nodes), edges: clone(doc.edges), groups: clone(doc.groups) };
  }

  function normalizeItem(value) {
    if (!isRecord(value) || !isId(value.id)) fail('部品セットのIDが不正です。');
    if (!TYPES.has(value.diagramType)) fail('部品セットの図の種類が不正です。');
    return {
      id: value.id,
      name: itemName(value.name),
      diagramType: value.diagramType,
      updatedAt: updatedAt(value.updatedAt),
      selection: selectionFor(value.selection, value.diagramType)
    };
  }

  function assertSize(library) {
    if (bytes(canonical(library)) > LIMIT) fail('部品セット全体は2MB以内にしてください。');
    return library;
  }

  function normalizeLibrary(value) {
    if (!isRecord(value) || value.format !== FORMAT || value.version !== VERSION || !Array.isArray(value.items)) fail('部品セットファイルを読み取れません。');
    if (value.items.length > MAX_ITEMS) fail('部品セットは100件までです。');
    const ids = new Set();
    const items = value.items.map(raw => {
      const item = normalizeItem(raw);
      if (ids.has(item.id)) fail('部品セットのIDが重複しています。');
      ids.add(item.id);
      return item;
    });
    return assertSize({ format: FORMAT, version: VERSION, items });
  }

  function emptyLibrary() { return { format: FORMAT, version: VERSION, items: [] }; }

  function parseLibrary(input) {
    let value = input;
    if (typeof value === 'string') {
      if (bytes(value) > LIMIT) fail('部品セットファイルは2MB以内にしてください。');
      try { value = JSON.parse(value); } catch { fail('部品セットファイルを読み取れません。'); }
    }
    return normalizeLibrary(value);
  }

  function serializeLibrary(library) {
    return canonical(parseLibrary(library));
  }

  function capture(doc, ids, name) {
    const source = Core.parseDocument(doc);
    const selection = Core.copySelection(source, ids);
    if (!selection.nodes.length && !selection.edges.length) fail('保存する図形または線を選択してください。');
    const copiedNodes = new Set(selection.nodes.map(node => node.id));
    const originalEdges = new Map(source.edges.map(edge => [edge.id, edge]));
    for (const edge of selection.edges) {
      const original = originalEdges.get(edge.id);
      if (!original) fail('部品セットの線を読み取れません。');
      const geometry = Render.edgeGeometry(source, original);
      for (const end of ['from', 'to']) {
        if (original[end].nodeId && !copiedNodes.has(original[end].nodeId)) edge[end] = { x: geometry[end].x, y: geometry[end].y };
      }
    }
    return normalizeItem({
      id: Core.uid('part'), name, diagramType: source.diagramType, updatedAt: new Date().toISOString(), selection
    });
  }

  function documentFor(item) {
    const clean = normalizeItem(item);
    return Core.parseDocument({
      format: 'kaijo-diagram', version: 3, id: 'parts_preview', title: clean.name, diagramType: clean.diagramType,
      nodes: clean.selection.nodes, edges: clean.selection.edges, lanes: [], groups: clean.selection.groups, lesson: null
    });
  }

  function pointFor(value) {
    if (!isRecord(value) || !Number.isFinite(value.x) || !Number.isFinite(value.y) || value.x < -100000 || value.x > 100000 || value.y < -100000 || value.y > 100000) fail('配置位置が不正です。');
    return { x: value.x, y: value.y };
  }

  function place(doc, item, point) {
    // Validate every input before Core.pasteSelection changes the destination document.
    Core.parseDocument(doc);
    const itemDoc = documentFor(item), target = pointFor(point), bounds = Render.documentBounds(itemDoc);
    const dx = target.x - (bounds.x + bounds.w / 2), dy = target.y - (bounds.y + bounds.h / 2);
    const payload = { format: 'kaijo-diagram-selection', version: 3, nodes: itemDoc.nodes, edges: itemDoc.edges, groups: itemDoc.groups };
    return Core.pasteSelection(doc, payload, dx, dy);
  }

  function add(library, item) {
    const clean = parseLibrary(library), nextItem = normalizeItem(item);
    if (clean.items.some(existing => existing.id === nextItem.id)) fail('同じIDの部品セットは追加できません。');
    return normalizeLibrary({ ...clean, items: [...clean.items, nextItem] });
  }

  function rename(library, id, name) {
    const clean = parseLibrary(library);
    if (!isId(id)) fail('部品セットのIDが不正です。');
    if (!clean.items.some(item => item.id === id)) fail('部品セットが見つかりません。');
    const nextName = itemName(name), now = new Date().toISOString();
    return normalizeLibrary({ ...clean, items: clean.items.map(item => item.id === id ? { ...item, name: nextName, updatedAt: now } : item) });
  }

  function remove(library, id) {
    const clean = parseLibrary(library);
    if (!isId(id)) fail('部品セットのIDが不正です。');
    if (!clean.items.some(item => item.id === id)) fail('部品セットが見つかりません。');
    return normalizeLibrary({ ...clean, items: clean.items.filter(item => item.id !== id) });
  }

  function freshId(used) {
    let id = Core.uid('part');
    while (used.has(id)) id = Core.uid('part');
    return id;
  }

  function numberedName(name, used) {
    if (!used.has(name)) return name;
    let number = 2;
    while (number < 100000) {
      const suffix = ` (${number})`, maximum = 80 - [...suffix].length;
      const base = [...name].slice(0, Math.max(1, maximum)).join('').trimEnd();
      const candidate = `${base}${suffix}`;
      if (!used.has(candidate)) return candidate;
      number += 1;
    }
    fail('重複しない部品セット名を作成できません。');
  }

  function merge(library, incoming) {
    const base = parseLibrary(library), added = parseLibrary(incoming);
    const ids = new Set(base.items.map(item => item.id)), names = new Set(base.items.map(item => item.name));
    const items = clone(base.items);
    for (const source of added.items) {
      const item = clone(source);
      if (ids.has(item.id)) item.id = freshId(ids);
      item.name = numberedName(item.name, names);
      ids.add(item.id); names.add(item.name); items.push(item);
    }
    return normalizeLibrary({ format: FORMAT, version: VERSION, items });
  }

  return Object.freeze({ emptyLibrary, parseLibrary, serializeLibrary, capture, documentFor, place, add, rename, remove, merge });
});
