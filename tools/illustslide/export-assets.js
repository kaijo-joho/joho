/* 登録済み書き出しアセット。参照だけを保存し、作品の図形を複製しない。 */
(function (root, factory) {
  'use strict';
  const api = typeof module === 'object' && module.exports
    ? factory(require('./core.js'), require('./layers.js'))
    : factory(root.IlapoCore, root.IlapoLayers);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoExportAssets = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C, L) {
  'use strict';

  function currentAssets(document) {
    return Array.isArray(document.exportAssets) ? document.exportAssets : [];
  }
  function checkedName(name) {
    if (typeof name !== 'string' || !name.trim() || name.length > C.LIMITS.exportAssetNameLength) throw new RangeError('アセット名は1〜' + C.LIMITS.exportAssetNameLength + '文字で指定してください。');
    return name.trim();
  }
  function clippedName(name) {
    return name.slice(0, C.LIMITS.exportAssetNameLength);
  }
  function visible(page, object) {
    return L ? L.visible(page, object) : !!(object && object.visible !== false);
  }
  function uniqueAutoName(document, base) {
    const used = new Set(currentAssets(document).map(asset => asset.name));
    if (!used.has(base)) return base;
    for (let index = 2; ; index += 1) {
      const suffix = '_' + index;
      const candidate = base.slice(0, C.LIMITS.exportAssetNameLength - suffix.length) + suffix;
      if (!used.has(candidate)) return candidate;
    }
  }
  function assetName(document, objects, name) {
    if (name !== undefined) return checkedName(name);
    const base = objects.length === 1 && objects[0].name.trim()
      ? clippedName(objects[0].name.trim())
      : 'アセット ' + (currentAssets(document).length + 1);
    return uniqueAutoName(document, base);
  }
  function reference(asset) {
    if (!asset || typeof asset !== 'object' || Array.isArray(asset)) throw new TypeError('書き出し対象が不正です。');
    const full = ['id', 'name', 'pageId', 'objectIds', 'enabled'];
    const registered = full.every(key => Object.hasOwn(asset, key));
    if (Object.keys(asset).some(key => !(registered ? full : ['pageId', 'objectIds']).includes(key)) || typeof asset.pageId !== 'string' || !asset.pageId || !Array.isArray(asset.objectIds) || asset.objectIds.length > C.LIMITS.exportAssetRefs) throw new TypeError('書き出し対象が不正です。');
    if (registered && (typeof asset.id !== 'string' || !asset.id || typeof asset.name !== 'string' || !asset.name.trim() || asset.name.length > C.LIMITS.exportAssetNameLength || !asset.objectIds.length || typeof asset.enabled !== 'boolean')) throw new TypeError('書き出し対象が不正です。');
    const ids = new Set();
    asset.objectIds.forEach(objectId => {
      if (typeof objectId !== 'string' || !objectId || ids.has(objectId)) throw new TypeError('書き出し対象の図形IDが不正です。');
      ids.add(objectId);
    });
    return asset;
  }
  function add(document, pageId, objectIds, name) {
    C.validateDocument(document);
    if (typeof pageId !== 'string' || !pageId) throw new RangeError('ページを選択してください。');
    if (!Array.isArray(objectIds)) throw new TypeError('選択した図形のIDが必要です。');
    const page = document.pages.find(item => item.id === pageId);
    if (!page) throw new RangeError('指定されたページがありません。');
    const byId = new Map(page.objects.map(object => [object.id, object]));
    const requested = new Set();
    objectIds.forEach(objectId => {
      if (typeof objectId !== 'string' || !objectId) throw new TypeError('図形IDが不正です。');
      if (!byId.has(objectId)) throw new RangeError('指定された図形がありません。');
      requested.add(objectId);
    });
    const objects = page.objects.filter(object => requested.has(object.id) && visible(page, object) && !(object.type === 'image' && object.reference));
    if (!objects.length) throw new RangeError('書き出せる図形を選択してください。');
    const assets = currentAssets(document);
    if (assets.length >= C.LIMITS.exportAssets) throw new RangeError('登録できるアセットは' + C.LIMITS.exportAssets + '件までです。');
    const asset = { id: C.uid('export_asset'), name: assetName(document, objects, name), pageId, objectIds: objects.map(object => object.id), enabled: true };
    document.exportAssets = assets;
    assets.push(asset);
    document.version = Math.max(document.version, 10);
    C.validateDocument(document);
    return asset;
  }
  function resolve(document, asset) {
    const source = reference(asset);
    if (!document || !Array.isArray(document.pages)) throw new TypeError('文書が不正です。');
    const page = document.pages.find(item => item.id === source.pageId) || null;
    if (!page) return { page: null, selectionIds: [], missingCount: source.objectIds.length, hiddenCount: 0, available: false };
    const byId = new Map(page.objects.map(object => [object.id, object]));
    let missingCount = 0, hiddenCount = 0;
    const selectionIds = source.objectIds.filter(objectId => {
      const object = byId.get(objectId);
      if (!object || (object.type === 'image' && object.reference)) { missingCount += 1; return false; }
      if (!visible(page, object)) { hiddenCount += 1; return false; }
      return true;
    });
    return { page, selectionIds, missingCount, hiddenCount, available: selectionIds.length >= 1 };
  }
  return Object.freeze({ add, resolve });
}));
