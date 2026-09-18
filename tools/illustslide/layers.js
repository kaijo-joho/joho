(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoLayers = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  let serial = 0;
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function uid() { serial += 1; return 'layer_' + Date.now().toString(36) + '_' + serial.toString(36) + '_' + Math.random().toString(36).slice(2, 8); }
  function fail(message) { throw new RangeError('Layer: ' + message); }
  function objects(page) { if (!page || !Array.isArray(page.objects)) fail('page.objects is required'); return page.objects; }
  function hasLayers(page) { return Array.isArray(page.layers); }
  function virtual(page) { return { id: 'default', name: 'レイヤー 1', visible: true, locked: false, objectIds: objects(page).map(object => object.id) }; }
  function list(page) { return hasLayers(page) ? page.layers : [virtual(page)]; }
  function layerOf(page, objectOrId) { const objectId = typeof objectOrId === 'string' ? objectOrId : objectOrId && objectOrId.id; return list(page).find(layer => layer.objectIds.includes(objectId)) || null; }
  function visible(page, objectOrId) { const object = typeof objectOrId === 'string' ? objects(page).find(item => item.id === objectOrId) : objectOrId; const layer = layerOf(page, object); return !!(object && object.visible !== false && layer && layer.visible); }
  function locked(page, objectOrId) { const object = typeof objectOrId === 'string' ? objects(page).find(item => item.id === objectOrId) : objectOrId; const layer = layerOf(page, object); return !!(object && (object.locked || (layer && layer.locked))); }
  function orderedObjects(page) { const byId = new Map(objects(page).map(object => [object.id, object])); return list(page).flatMap(layer => layer.objectIds.map(id => byId.get(id)).filter(Boolean)); }
  function chooseActive(page, activeId) { const layers = page.layers; const requested = layers.find(layer => layer.id === activeId && layer.visible && !layer.locked); return requested || layers.find(layer => layer.visible && !layer.locked) || layers[0]; }
  function reconcile(page, beforePage, activeId) {
    if (!hasLayers(page)) return page;
    const byId = new Map(objects(page).map(object => [object.id, object]));
    const assigned = new Set();
    page.layers.forEach(layer => { layer.objectIds = layer.objectIds.filter(id => byId.has(id) && !assigned.has(id) && (assigned.add(id), true)); });
    const groupLayer = new Map();
    page.layers.forEach(layer => layer.objectIds.forEach(id => { const group = byId.get(id).group; if (group !== null) groupLayer.set(group, layer); }));
    const pending = objects(page).filter(object => !assigned.has(object.id) && !(object.group !== null && groupLayer.get(object.group)));
    objects(page).forEach(object => { if (!assigned.has(object.id) && object.group !== null && groupLayer.get(object.group)) groupLayer.get(object.group).objectIds.push(object.id); });
    if (pending.length) { const requested = activeId && page.layers.find(layer => layer.id === activeId); if (requested && (!requested.visible || requested.locked)) fail('指定したレイヤーは非表示または固定されています。'); const fallback = requested || chooseActive(page, activeId) || page.layers[0]; if (!fallback.visible || fallback.locked) fail('追加先のレイヤーがありません。'); pending.forEach(object => fallback.objectIds.push(object.id)); }
    page.objects.splice(0, page.objects.length, ...orderedObjects(page));
    return page;
  }
  function create(page, name) {
    objects(page);
    if (!hasLayers(page)) page.layers = [virtual(page)];
    if (page.layers.length >= 100) fail('レイヤーは100個までです。');
    const layer = { id: uid(), name: typeof name === 'string' ? name : 'レイヤー ' + (page.layers.length + 1), visible: true, locked: false, objectIds: [] };
    page.layers.push(layer); return layer.id;
  }
  function find(page, id) { if (!hasLayers(page) && id === 'default') page.layers = [virtual(page)]; const layer = hasLayers(page) && page.layers.find(item => item.id === id); if (!layer) fail('unknown layer id: ' + id); return layer; }
  function rename(page, id, name) { if (typeof name !== 'string') fail('name must be a string'); find(page, id).name = name; return page; }
  function setVisible(page, id, value) { if (typeof value !== 'boolean') fail('visible must be boolean'); find(page, id).visible = value; return page; }
  function setObjectVisible(page, id, value) {
    if (typeof value !== 'boolean') fail('visible must be boolean');
    const object = objects(page).find(item => item.id === id);
    if (!object) fail('unknown object id: ' + id);
    object.visible = value;
    return page;
  }
  function setLocked(page, id, value) { if (typeof value !== 'boolean') fail('locked must be boolean'); find(page, id).locked = value; return page; }
  function move(page, id, delta) { if (!Number.isInteger(delta)) fail('delta must be an integer'); const layer = find(page, id), from = page.layers.indexOf(layer), to = Math.max(0, Math.min(page.layers.length - 1, from + delta)); if (from !== to) { page.layers.splice(from, 1); page.layers.splice(to, 0, layer); } reconcile(page); return to; }
  function expand(page, ids) { const known = new Map(objects(page).map(object => [object.id, object])); const selected = new Set(ids); ids.forEach(id => { if (!known.has(id)) fail('unknown object id: ' + id); }); const groups = new Set([...selected].map(id => known.get(id).group).filter(group => group !== null)); objects(page).forEach(object => { if (groups.has(object.group)) selected.add(object.id); }); return objects(page).filter(object => selected.has(object.id)).map(object => object.id); }
  function moveObjects(page, ids, targetId) {
    if (!Array.isArray(ids)) fail('ids must be an array'); const target = find(page, targetId), selected = expand(page, ids);
    if (!target.visible || target.locked) fail('移動先のレイヤーを表示し、固定を解除してください。');
    selected.forEach(id => { const object = objects(page).find(item => item.id === id), layer = layerOf(page, id); if (!layer || !layer.visible || layer.locked || object.locked) fail('移動する図形と元のレイヤーを表示し、固定を解除してください。'); });
    page.layers.forEach(layer => { layer.objectIds = layer.objectIds.filter(id => !selected.includes(id)); }); target.objectIds.push(...selected); reconcile(page); return selected;
  }
  function remove(page, id) {
    const layer = find(page, id), index = page.layers.indexOf(layer); if (page.layers.length <= 1) fail('最後のレイヤーは削除できません。');
    const receiver = page.layers[index > 0 ? index - 1 : 1]; receiver.objectIds.push(...layer.objectIds); page.layers.splice(index, 1); reconcile(page); return receiver.id;
  }
  function forOutput(page) {
    const output = clone(page);
    // Resolve attachments while their targets are still present, then detach
    // absent targets in the output copy without moving the visible connector.
    root.IlapoConnectors?.sync(output);
    const shown = new Set(orderedObjects(output).filter(object => visible(output, object)).map(object => object.id));
    output.objects = orderedObjects(output).filter(object => shown.has(object.id));
    if (Array.isArray(output.layers)) output.layers.forEach(layer => { layer.objectIds = layer.objectIds.filter(id => shown.has(id)); });
    if (Array.isArray(output.animations)) output.animations = output.animations.map(animation => Object.assign({}, animation, { targets: animation.targets.filter(id => shown.has(id)) })).filter(animation => animation.targets.length);
    root.IlapoConnectors?.sync(output);
    return output;
  }
  return { list, layerOf, visible, locked, orderedObjects, reconcile, create, rename, setVisible, setObjectVisible, setLocked, move, moveObjects, remove, forOutput };
}));
