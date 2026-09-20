/* Export target collection and isolated playback documents. */
(function (root, factory) {
  var api = factory(root, root.IlapoCore || (typeof require === 'function' ? require('./core.js') : null), root.IlapoLayers || (typeof require === 'function' ? require('./layers.js') : null), root.IlapoExportAssets || (typeof require === 'function' ? require('./export-assets.js') : null), root.IlapoConnectors || (typeof require === 'function' ? require('./connectors.js') : null), root.IlapoGeometry || (typeof require === 'function' ? require('./geometry.js') : null), root.IlapoAnimation || (typeof require === 'function' ? require('./animation.js') : null));
  root.IlapoExportTargets = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, C, L, A, K, G, Animation) {
  'use strict';

  function fail(message) { throw new Error('イラストスライド書き出し: ' + message); }
  function pageEntry(document, page) {
    return { key: page.id, name: document.name + '_' + page.name, page: page, selectionIds: null };
  }
  function collect(document, options) {
    options = options || {};
    var mode = options.mode;
    var excludeSkipped = options.excludeSkipped === true;
    var entries = [], omitted = 0;
    if (!document || !Array.isArray(document.pages)) fail('文書が正しくありません。');
    if (mode === 'assets') {
      if (!A || typeof A.resolve !== 'function') fail('書き出しアセットを読み込めません。');
      (document.exportAssets || []).forEach(function (asset) {
        if (!asset.enabled) return;
        var resolved = A.resolve(document, asset);
        if (!resolved.available) { omitted += 1; return; }
        if (excludeSkipped && resolved.page.skip === true) { omitted += 1; return; }
        entries.push({ key: asset.id, name: asset.name, page: resolved.page, selectionIds: resolved.selectionIds.slice() });
      });
    } else if (mode === 'pages' || mode === 'all') {
      var wanted = mode === 'pages' ? new Set(options.pageIds || []) : null;
      document.pages.forEach(function (page) {
        if (wanted && !wanted.has(page.id)) return;
        if (excludeSkipped && page.skip === true) { omitted += 1; return; }
        entries.push(pageEntry(document, page));
      });
    } else {
      fail('書き出し範囲が正しくありません。');
    }
    return { entries: entries, omitted: omitted };
  }

  function visible(page, object) {
    return L && typeof L.visible === 'function' ? L.visible(page, object) : !!(object && object.visible !== false);
  }
  function copyPage(source, selectionIds) {
    var page = C.clone(source);
    if (K && typeof K.sync === 'function') K.sync(page);
    var selected = selectionIds == null ? null : new Set(selectionIds);
    page.objects = page.objects.filter(function (object) {
      return visible(page, object) && !(object.type === 'image' && object.reference) && (!selected || selected.has(object.id));
    });
    var ids = new Set(page.objects.map(function (object) { return object.id; }));
    if (Array.isArray(page.layers)) page.layers.forEach(function (layer) {
      layer.objectIds = layer.objectIds.filter(function (id) { return ids.has(id); });
    });
    if (K && typeof K.sync === 'function') K.sync(page);
    if (C && typeof C.pruneAnimations === 'function') C.pruneAnimations(page);
    if (L && typeof L.reconcile === 'function') L.reconcile(page);
    return page;
  }
  function union(a, b) {
    if (!a) return { x: b.x, y: b.y, width: b.width, height: b.height };
    var right = Math.max(a.x + a.width, b.x + b.width), bottom = Math.max(a.y + a.height, b.y + b.height);
    return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), width: right - Math.min(a.x, b.x), height: bottom - Math.min(a.y, b.y) };
  }
  function pageBounds(page, measure) {
    return page.objects.reduce(function (result, object) { return union(result, measure(object)); }, null);
  }
  function animationBounds(page) {
    if (!G || !(G.visualBounds || G.bounds)) return null;
    var measure = G.visualBounds || G.bounds, bounds = pageBounds(page, measure), runtime = root.IlapoAnimation || Animation;
    // 動きは各クリックグループ内で同時に進む。開始・終了点を実際の
    // player と同じ評価器で調べれば、with/after と delay の組合せでも
    // 途中の最大範囲を取りこぼさない（区間内は線形移動）。
    if (!runtime || typeof runtime.compile !== 'function' || typeof runtime.frame !== 'function') return bounds;
    var plan = runtime.compile(page);
    plan.groups.forEach(function (group) {
      var times = new Set([0, group.duration]);
      group.items.forEach(function (item) { times.add(item.start); times.add(item.end); });
      times.forEach(function (time) {
        var frame = runtime.frame(page, group.index, time, { plan: plan }).page;
        // Animation.frame moves shapes on a clone.  Match the player by
        // refreshing attached connectors before measuring their visual bounds.
        if (K && typeof K.sync === 'function') K.sync(frame);
        bounds = union(bounds, pageBounds(frame, measure));
      });
    });
    return bounds;
  }
  function translatePage(page, dx, dy) {
    var matrix = [1, 0, 0, 1, dx, dy];
    page.objects = page.objects.map(function (object) {
      if (object.type === 'connector' && K && typeof K.transform === 'function') return K.transform(object, matrix);
      var copy = object;
      copy.matrix = C.multiply(matrix, copy.matrix || [1, 0, 0, 1, 0, 0]);
      return copy;
    });
    if (K && typeof K.sync === 'function') K.sync(page);
  }
  function crop(page, padding) {
    var bounds = animationBounds(page);
    if (!bounds) return;
    var width = Math.max(1, bounds.width + padding * 2), height = Math.max(1, bounds.height + padding * 2);
    translatePage(page, padding - bounds.x, padding - bounds.y);
    page.board = { width: width, height: height, unit: 'px', infinite: false };
  }
  function uniquePageId(sourceId, used, index) {
    var base = String(sourceId) + '-export-' + (index + 1), id = base, suffix = 2;
    while (used.has(id)) id = base + '-' + suffix++;
    used.add(id); return id;
  }
  function htmlDocument(document, entries, options) {
    options = options || {};
    var padding = options.padding === undefined ? 8 : Number(options.padding);
    if (!Number.isFinite(padding) || padding < 0) fail('余白は0以上の数値で指定してください。');
    if (!document || !Array.isArray(document.pages) || !Array.isArray(entries)) fail('書き出し対象が正しくありません。');
    var used = new Set(), pages = entries.map(function (entry, index) {
      if (!entry || !entry.page) fail('書き出し対象が正しくありません。');
      var selectionIds = entry.selectionIds == null ? null : entry.selectionIds.slice();
      var page = copyPage(entry.page, selectionIds);
      if (selectionIds !== null && !page.objects.length) fail('選択した図形がありません。');
      page.id = uniquePageId(entry.page.id, used, index);
      delete page.notes; delete page.skip;
      if (selectionIds !== null) page.name = entry.name;
      if (selectionIds !== null || page.board.infinite) crop(page, padding);
      return page;
    });
    if (!pages.length) fail('書き出すページがありません。');
    var output = { format: 'kaijo-ilapo', version: Math.max(10, Number(document.version) || 1), id: document.id, name: document.name, pages: pages };
    return C.validateDocument(output);
  }
  return Object.freeze({ collect: collect, htmlDocument: htmlDocument });
}));
