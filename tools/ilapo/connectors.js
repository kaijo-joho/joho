/* Connectors are persisted objects but render as ordinary SVG paths and text. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoConnectors = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  var IDENTITY = [1, 0, 0, 1, 0, 0];
  var STYLE = { fill: '#FFFFFF', stroke: '#000000', strokeWidth: 1, opacity: 1, dash: '', linecap: 'butt', linejoin: 'miter', fontSize: 24, fontFamily: 'sans-serif', bold: false, italic: false };
  var PORTS = ['auto', 'top', 'right', 'bottom', 'left'];
  var ARROWS = ['none', 'triangle', 'open'];
  var ROUTES = ['straight', 'orthogonal'];
  var serial = 0;
  var sharedScope;

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function uid(prefix) { var c = root.IlapoCore; if (c && c.uid) return c.uid(prefix); serial += 1; return (prefix || 'connector') + '-' + Date.now().toString(36) + '-' + serial; }
  function finite(value, fallback) { value = Number(value); return Number.isFinite(value) ? value : fallback; }
  function point(value, fallback) { value = value || {}; return { x: finite(value.x, fallback && fallback.x || 0), y: finite(value.y, fallback && fallback.y || 0) }; }
  function endpoint(value, fallback) {
    value = value || {};
    var p = point(value, fallback);
    return { x: p.x, y: p.y, objectId: typeof value.objectId === 'string' && value.objectId ? value.objectId : null,
      port: PORTS.indexOf(value.port) >= 0 ? value.port : 'auto', ratio: Math.max(0, Math.min(1, finite(value.ratio, .5))) };
  }
  function style(value) { return Object.assign({}, (root.IlapoCore && root.IlapoCore.DEFAULT_STYLE) || STYLE, value || {}); }
  function matrixPoint(m, p) { return { x: m[0] * p.x + m[2] * p.y + m[4], y: m[1] * p.x + m[3] * p.y + m[5] }; }
  function vector(m, p) { return { x: m[0] * p.x + m[2] * p.y, y: m[1] * p.x + m[3] * p.y }; }
  function sub(a, b) { return { x: a.x - b.x, y: a.y - b.y }; }
  function add(a, b) { return { x: a.x + b.x, y: a.y + b.y }; }
  function length(p) { return Math.hypot(p.x, p.y); }
  function unit(p) { var n = length(p); return n > 1e-9 ? { x: p.x / n, y: p.y / n } : { x: 1, y: 0 }; }
  function pathD(points, close) { return points.length ? 'M ' + points.map(function (p) { return p.x + ' ' + p.y; }).join(' L ') + (close ? ' Z' : '') : ''; }
  function find(page, id) { return page && Array.isArray(page.objects) ? page.objects.find(function (o) { return o.id === id && o.type !== 'connector'; }) : null; }
  function box(object) { var g = root.IlapoGeometry; if (g && g.bounds) return g.bounds(object); return { x: 0, y: 0, width: 0, height: 0 }; }
  function localBox(object) {
    if (!object) return { x: 0, y: 0, width: 0, height: 0 };
    if (object.type === 'image') return { x: finite(object.x, 0), y: finite(object.y, 0), width: Math.max(0, finite(object.width, 0)), height: Math.max(0, finite(object.height, 0)) };
    if (object.type === 'text') { var size = finite(object.style && object.style.fontSize, 16), text = (object.runs || []).map(function (r) { return r.text || ''; }).join(''), lines = text.split('\n'); return { x: finite(object.x, 0), y: finite(object.y, 0) - size, width: Math.max.apply(null, lines.map(function (line) { return line.length * size * .6; })), height: Math.max(1, lines.length) * size * 1.2 }; }
    var g = root.IlapoGeometry;
    if (g && g.bounds) { var local = Object.assign({}, object, { matrix: IDENTITY }); try { return g.bounds(local); } catch (_) { /* Geometry is optional for fallback ports. */ } }
    return box(object);
  }
  function worldBox(local, m) { var corners = [{ x: local.x, y: local.y }, { x: local.x + local.width, y: local.y }, { x: local.x, y: local.y + local.height }, { x: local.x + local.width, y: local.y + local.height }].map(function (p) { return matrixPoint(m, p); }), xs = corners.map(function (p) { return p.x; }), ys = corners.map(function (p) { return p.y; }); return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), width: Math.max.apply(null, xs) - Math.min.apply(null, xs), height: Math.max.apply(null, ys) - Math.min.apply(null, ys) }; }
  function worldCenter(object) { var local = localBox(object), m = object && object.matrix || IDENTITY; return matrixPoint(m, { x: local.x + local.width / 2, y: local.y + local.height / 2 }); }

  /* A Paper path intersection keeps ports on an ellipse, diamond, or custom path,
     rather than treating its transformed bounding rectangle as the shape. */
  function paperEdge(object, direction, fixedPort, epRatio) {
    if (!root.paper || !root.paper.PaperScope || !object || object.type !== 'path') return null;
    if (!sharedScope) { sharedScope = new root.paper.PaperScope(); sharedScope.setup(new sharedScope.Size(1, 1)); }
    var scope = sharedScope;
    if (scope.project && scope.project.activeLayer) scope.project.activeLayer.removeChildren();
    try {
      var shape = new scope.CompoundPath(object.d);
      var localBounds = shape.bounds, m = object.matrix || IDENTITY;
      shape.matrix = new scope.Matrix(m[0], m[1], m[2], m[3], m[4], m[5]);
      var b = shape.bounds, center = matrixPoint(m, { x: localBounds.x + localBounds.width / 2, y: localBounds.y + localBounds.height / 2 });
      var d;
      if (fixedPort) {
        /* ratio lives in the object's local bounding box, before rotation or scale. */
        var q = (epRatio == null ? .5 : epRatio) - .5;
        var local = fixedPort === 'top' ? { x: q * localBounds.width, y: -localBounds.height / 2 } : fixedPort === 'right' ? { x: localBounds.width / 2, y: q * localBounds.height } : fixedPort === 'bottom' ? { x: q * localBounds.width, y: localBounds.height / 2 } : { x: -localBounds.width / 2, y: q * localBounds.height };
        d = unit(vector(m, local));
      } else d = unit(direction);
      var distance = Math.max(b.width, b.height, 1) * 4 + 2;
      var line = new scope.Path.Line(new scope.Point(center.x - d.x * distance, center.y - d.y * distance), new scope.Point(center.x + d.x * distance, center.y + d.y * distance));
      var hits = shape.getIntersections(line);
      var best = null;
      hits.forEach(function (hit) { var p = { x: hit.point.x, y: hit.point.y }, score = (p.x - center.x) * d.x + (p.y - center.y) * d.y; if (score >= -1e-7 && (!best || score > best.score)) best = { point: p, score: score }; });
      return best && best.point;
    } catch (_) { return null; }
    finally { if (scope.project && scope.project.activeLayer) scope.project.activeLayer.removeChildren(); }
  }
  function fallbackEdge(object, direction, fixedPort, ratio) {
    var local = localBox(object), m = object.matrix || IDENTITY, b = worldBox(local, m), center = matrixPoint(m, { x: local.x + local.width / 2, y: local.y + local.height / 2 }), d = unit(direction);
    if (fixedPort === 'top') return matrixPoint(m, { x: local.x + local.width * ratio, y: local.y });
    if (fixedPort === 'right') return matrixPoint(m, { x: local.x + local.width, y: local.y + local.height * ratio });
    if (fixedPort === 'bottom') return matrixPoint(m, { x: local.x + local.width * ratio, y: local.y + local.height });
    if (fixedPort === 'left') return matrixPoint(m, { x: local.x, y: local.y + local.height * ratio });
    var det=m[0]*m[3]-m[1]*m[2];if(Math.abs(det)<1e-12)return center;
    var localDirection={x:(m[3]*d.x-m[2]*d.y)/det,y:(m[0]*d.y-m[1]*d.x)/det};
    var tx = localDirection.x ? (local.width / 2) / Math.abs(localDirection.x) : Infinity, ty = localDirection.y ? (local.height / 2) / Math.abs(localDirection.y) : Infinity, t = Math.min(tx, ty);
    if(!Number.isFinite(t))return center;
    return matrixPoint(m,{x:local.x+local.width/2+localDirection.x*t,y:local.y+local.height/2+localDirection.y*t});
  }
  function edge(object, ep, toward) {
    if (!object) return { x: ep.x, y: ep.y };
    var direction = sub(toward, worldCenter(object)), fixed = ep.port === 'auto' ? null : ep.port;
    return paperEdge(object, direction, fixed, ep.ratio) || fallbackEdge(object, direction, fixed, ep.ratio);
  }
  function resolvedEndpoints(connector, page) {
    var from = endpoint(connector && connector.from), to = endpoint(connector && connector.to);
    var source = from.objectId && find(page, from.objectId), target = to.objectId && find(page, to.objectId);
    if (!source) from.objectId = null;
    if (!target) to.objectId = null;
    var middle = connector && Array.isArray(connector.waypoints) ? connector.waypoints : [];
    var sourceCenter = source ? worldCenter(source) : { x: from.x, y: from.y }, targetCenter = target ? worldCenter(target) : { x: to.x, y: to.y };
    var fromToward = middle.length ? point(middle[0]) : targetCenter, toToward = middle.length ? point(middle[middle.length - 1]) : sourceCenter;
    var a = edge(source, from, fromToward), b = edge(target, to, toToward);
    return { from: a, to: b, source: source, target: target };
  }
  function orthogonal(points, firstPort, lastPort, stub) {
    if (points.length < 2) return points;
    var start = points[0], end = points[points.length - 1], lead = { top: { x: 0, y: -stub }, right: { x: stub, y: 0 }, bottom: { x: 0, y: stub }, left: { x: -stub, y: 0 } }, working = [start];
    /* A small port stub makes the direction true even if the next waypoint shares
       the endpoint's row or column.  Explicit waypoints remain untouched. */
    if (lead[firstPort]) working.push(add(start, lead[firstPort]));
    for (var wi = 1; wi < points.length - 1; wi++) working.push(points[wi]);
    if (lead[lastPort]) working.push(add(end, lead[lastPort]));
    working.push(end);
    var out = [working[0]];
    for (var i = 1; i < working.length; i++) {
      var a = out[out.length - 1], b = working[i];
      if (a.x !== b.x && a.y !== b.y) {
        out.push({ x: b.x, y: a.y });
      }
      out.push(b);
    }
    return out.filter(function (p, i, all) { return !i || p.x !== all[i - 1].x || p.y !== all[i - 1].y; });
  }
  function points(connector, page) {
    var r = resolvedEndpoints(connector, page), middle = Array.isArray(connector && connector.waypoints) ? connector.waypoints.map(function (p) { return point(p); }) : [];
    var all = [r.from].concat(middle, [r.to]);
    function side(e){if(!e.normal)return e.port;var n=e.normal;return Math.abs(n.x)>=Math.abs(n.y)?(n.x>=0?'right':'left'):(n.y>=0?'bottom':'top');}
    return (connector && connector.route === 'orthogonal') ? orthogonal(all, side(connector.from), side(connector.to), Math.max(.01,Math.max(connector.style.strokeWidth*3,connector.style.fontSize*.5))) : all;
  }
  function labelPosition(list, offset) {
    if (!list.length) return point(offset);
    var total = 0, i; for (i = 1; i < list.length; i++) total += length(sub(list[i], list[i - 1]));
    if (!total) return add(list[0], offset);
    var target = total / 2, seen = 0;
    for (i = 1; i < list.length; i++) { var segment = length(sub(list[i], list[i - 1])); if (seen + segment >= target) { var t = (target - seen) / segment; return add({ x: list[i - 1].x + (list[i].x - list[i - 1].x) * t, y: list[i - 1].y + (list[i].y - list[i - 1].y) * t }, offset); } seen += segment; }
    return add(list[list.length - 1], offset);
  }
  function arrowPart(id, at, adjacent, kind, base) {
    if (kind === 'none' || !at || !adjacent) return null;
    var d = unit(sub(at, adjacent)), side = { x: -d.y, y: d.x }, size = Math.max(.01,finite(base.fontSize,18)*.3,finite(base.strokeWidth,1)*3), back = { x: at.x - d.x * size, y: at.y - d.y * size }, l = { x: back.x + side.x * size * .55, y: back.y + side.y * size * .55 }, r = { x: back.x - side.x * size * .55, y: back.y - side.y * size * .55 };
    var s = Object.assign({}, base, { dash: '', fill: kind === 'triangle' ? base.stroke : 'none' });
    return { id: id, type: 'path', name: '矢印', group: null, locked: true, matrix: IDENTITY.slice(), style: s, d: kind === 'triangle' ? pathD([at, l, r], true) : pathD([l, at, r]) };
  }
  function renderedParts(connector, page) {
    var list = points(connector, page), base = style(connector && connector.style), prefix = String(connector && connector.id || 'connector'), parts = [];
    parts.push({ id: prefix + ':line', type: 'path', name: (connector && connector.name) || '接続線', group: null, locked: true, matrix: IDENTITY.slice(), style: Object.assign({}, base, { fill: 'none' }), d: pathD(list) });
    var start = arrowPart(prefix + ':start', list[0], list[1], connector && connector.startArrow, base), end = arrowPart(prefix + ':end', list[list.length - 1], list[list.length - 2], connector && connector.endArrow, base);
    if (start) parts.push(start); if (end) parts.push(end);
    if (connector && connector.label) {
      var p = labelPosition(list, point(connector.labelOffset)), probe = { type: 'text', matrix: IDENTITY, style: Object.assign({}, base, { fill:base.stroke,stroke: 'none', dash: '' }), x: 0, y: 0, runs: [{ text: String(connector.label), script: 'normal' }] }, g = root.IlapoGeometry, measured = g && g.bounds ? g.bounds(probe) : { x: 0, y: -base.fontSize, width: String(connector.label).length * base.fontSize * .6, height: base.fontSize * 1.2 }, gap = Math.max(.01,base.strokeWidth,base.fontSize * .12);
      parts.push({ id: prefix + ':label', type: 'text', name: '接続線ラベル', group: null, locked: true, matrix: IDENTITY.slice(), style: probe.style, x: p.x - measured.x - measured.width / 2, y: p.y - measured.y - measured.height - gap, runs: probe.runs });
    }
    return parts;
  }
  function union(boxes) { var out = null; boxes.forEach(function (b) { if (!b) return; if (!out) out = { x: b.x, y: b.y, right: b.x + b.width, bottom: b.y + b.height }; else { out.x = Math.min(out.x, b.x); out.y = Math.min(out.y, b.y); out.right = Math.max(out.right, b.x + b.width); out.bottom = Math.max(out.bottom, b.y + b.height); } }); return out && { x: out.x, y: out.y, width: out.right - out.x, height: out.bottom - out.y }; }
  function bounds(connector, visual, page) { var g = root.IlapoGeometry, method = visual && g && g.visualBounds ? g.visualBounds : g && g.bounds; if (!method) { var ps = points(connector, page), xs = ps.map(function (p) { return p.x; }), ys = ps.map(function (p) { return p.y; }); return { x: Math.min.apply(null, xs), y: Math.min.apply(null, ys), width: Math.max.apply(null, xs) - Math.min.apply(null, xs), height: Math.max.apply(null, ys) - Math.min.apply(null, ys) }; } return union(renderedParts(connector, page).map(method)); }

  function make(from, to, options) {
    options = options || {}; var a = endpoint(from), b = endpoint(to), base = style(options.style);
    return { id: options.id || uid('connector'), type: 'connector', name: typeof options.name === 'string' ? options.name : '接続線', group: options.group == null ? null : options.group, locked: !!options.locked, matrix: IDENTITY.slice(), style: base, from: a, to: b,
      waypoints: Array.isArray(options.waypoints) ? options.waypoints.map(function (p) { return point(p); }) : [], route: ROUTES.indexOf(options.route) >= 0 ? options.route : 'straight', startArrow: ARROWS.indexOf(options.startArrow) >= 0 ? options.startArrow : 'none', endArrow: ARROWS.indexOf(options.endArrow) >= 0 ? options.endArrow : 'triangle', label: typeof options.label === 'string' ? options.label : '', labelOffset: point(options.labelOffset) };
  }
  function sync(page) {
    if(!page||!Array.isArray(page.objects))return page;
    page.objects.filter(function(o){return o.type==='connector';}).forEach(function(c){
      var r=resolvedEndpoints(c,page);c.matrix=IDENTITY.slice();
      [['from',r.source],['to',r.target]].forEach(function(pair){var key=pair[0],object=pair[1],e=c[key];if(!object){e.objectId=null;delete e.normal;return;}e.x=r[key].x;e.y=r[key].y;
        var local={top:{x:0,y:-1},right:{x:1,y:0},bottom:{x:0,y:1},left:{x:-1,y:0}}[e.port];
        e.normal=unit(local?vector(object.matrix,local):sub(e,worldCenter(object)));
      });
    });return page;
  }
  function transform(connector, m) { var c = clone(connector), a = Array.isArray(m) && m.length === 6 ? m.map(Number) : IDENTITY; ['from', 'to'].forEach(function (key) { if (c[key]) { var q = matrixPoint(a, c[key]); c[key].x = q.x; c[key].y = q.y; } }); c.waypoints = (c.waypoints || []).map(function (p) { return matrixPoint(a, p); }); c.labelOffset = vector(a, point(c.labelOffset)); c.matrix = IDENTITY.slice(); return c; }
  return { make: make, sync: sync, resolve: resolvedEndpoints, points: points, renderedParts: renderedParts, bounds: bounds, transform: transform, refresh: sync };
}));
