/* Convert a document-space SVG stroke into one ordinary, non-zero fill path.
 * The caller owns style/metadata and keeps the editable source object. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoStrokeOutline = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  // A single resulting SVG path is filled once by the browser.  Its overlapping
  // subpaths therefore do not multiply opacity, unlike separate outline paths.
  var MAX_CURVES = 2048;
  var MAX_POINTS = 4096;
  var MAX_SHAPES = 12288;
  var MAX_DASH_STEPS = 2048;
  var MAX_BOOLEAN_PARTS = 2048;
  var EPSILON = 1e-8;
  var IDENTITY = [1, 0, 0, 1, 0, 0];

  function fail(message) { throw new Error('線のアウトライン化: ' + message); }
  function clear(scope) { if (scope.project && scope.project.activeLayer) scope.project.activeLayer.removeChildren(); }
  var sharedScope;
  function paper() {
    if (!root.paper || !root.paper.PaperScope) fail('Paper.js を先に読み込んでください。');
    if (!sharedScope) { sharedScope = new root.paper.PaperScope(); sharedScope.setup(new sharedScope.Size(1, 1)); }
    clear(sharedScope);
    return sharedScope;
  }
  function matrix(scope, values) { return new scope.Matrix(values[0], values[1], values[2], values[3], values[4], values[5]); }
  function number(value, label) { if (!Number.isFinite(value)) fail(label + 'が有限値ではありません。'); return value; }
  function point(x, y) { return { x: x, y: y }; }
  function same(a, b) { return Math.abs(a.x - b.x) <= EPSILON && Math.abs(a.y - b.y) <= EPSILON; }
  function length(a, b) { return Math.hypot(b.x - a.x, b.y - a.y); }
  function unit(a, b) { var l = length(a, b); return l > EPSILON ? { x: (b.x - a.x) / l, y: (b.y - a.y) / l, length: l } : null; }
  function add(a, b) { return point(a.x + b.x, a.y + b.y); }
  function scale(a, k) { return point(a.x * k, a.y * k); }
  function left(v) { return point(-v.y, v.x); }
  function cross(a, b) { return a.x * b.y - a.y * b.x; }
  function append(points, value) { if (!points.length || !same(points[points.length - 1], value)) points.push(value); }
  function cornerKey(value) { return Math.round(value.x * 100000) + ',' + Math.round(value.y * 100000); }
  function fmt(value) {
    if (!Number.isFinite(value) || Math.abs(value) > 10000000.000001) fail('出力座標が範囲外です。');
    var rounded = Math.round(value * 1000000) / 1000000;
    return String(Object.is(rounded, -0) ? 0 : rounded);
  }
  function move(points) { return 'M' + fmt(points[0].x) + ' ' + fmt(points[0].y) + points.slice(1).map(function (p) { return 'L' + fmt(p.x) + ' ' + fmt(p.y); }).join('') + 'Z'; }
  function circle(center, radius) {
    return 'M' + fmt(center.x + radius) + ' ' + fmt(center.y) +
      'A' + fmt(radius) + ' ' + fmt(radius) + ' 0 1 0 ' + fmt(center.x - radius) + ' ' + fmt(center.y) +
      'A' + fmt(radius) + ' ' + fmt(radius) + ' 0 1 0 ' + fmt(center.x + radius) + ' ' + fmt(center.y) + 'Z';
  }
  function square(center, half) {
    return move([point(center.x - half, center.y - half), point(center.x + half, center.y - half), point(center.x + half, center.y + half), point(center.x - half, center.y + half)]);
  }
  function lineIntersection(a, av, b, bv) {
    var den = cross(av, bv);
    if (Math.abs(den) < EPSILON) return null;
    var ab = point(b.x - a.x, b.y - a.y);
    return add(a, scale(av, cross(ab, bv) / den));
  }
  function dashValues(value) {
    if (!value) return null;
    var values = String(value).trim().split(/\s+/).filter(Boolean).map(Number);
    if (!values.length || values.some(function (n) { return !Number.isFinite(n) || n < 0; })) fail('破線の指定が不正です。');
    // SVG repeats an odd-length dash list.  An all-zero list is equivalent to
    // an unbroken stroke for this conversion and avoids a zero-length loop.
    if (!values.some(function (n) { return n > EPSILON; })) return null;
    if (values.length % 2) values = values.concat(values);
    return values;
  }
  function sourceRuns(points, closed, dash) {
    var source = points.slice();
    if (source.length > 1 && same(source[0], source[source.length - 1])) source.pop();
    if (!source.length) return [];
    if (!dash) return [{ points: source, closed: !!closed }];
    var edges = [], total = 0;
    for (var i = 0; i + 1 < source.length; i++) {
      var v = unit(source[i], source[i + 1]); if (v) { edges.push({ a: source[i], b: source[i + 1], unit: v, length: v.length }); total += v.length; }
    }
    if (closed && source.length > 1) {
      var last = unit(source[source.length - 1], source[0]); if (last) { edges.push({ a: source[source.length - 1], b: source[0], unit: last, length: last.length }); total += last.length; }
    }
    if (!edges.length) return [{ points: [source[0]], closed: false }];
    var shortestDash = Math.min.apply(null, dash.filter(function (value) { return value > EPSILON; }));
    if (Math.ceil(total / shortestDash) > MAX_DASH_STEPS) fail('破線が細かすぎるため変換できません。');
    var out = [], active = null, pattern = 0, remain = dash[0], on = true;
    // Values of zero alternate immediately. Bound the turn count even for data
    // not routed through IlapoCore's validator.
    while (remain <= EPSILON) { pattern = (pattern + 1) % dash.length; on = !on; remain = dash[pattern]; }
    edges.forEach(function (edge) {
      var at = edge.a, leftLength = edge.length;
      while (leftLength > EPSILON) {
        var take = Math.min(leftLength, remain), next = take >= leftLength - EPSILON ? edge.b : add(at, scale(edge.unit, take));
        if (on) { if (!active) active = [at]; append(active, next); }
        at = next; leftLength -= take; remain -= take;
        if (remain <= EPSILON) {
          if (on && active && active.length) {
            if (out.length >= MAX_DASH_STEPS) fail('破線が細かすぎるため変換できません。');
            out.push({ points: active, closed: false }); active = null;
          }
          var turns = 0;
          do { pattern = (pattern + 1) % dash.length; on = !on; remain = dash[pattern]; turns++; } while (remain <= EPSILON && turns <= dash.length);
          if (turns > dash.length) fail('破線の指定が不正です。');
        }
      }
    });
    if (active && active.length) {
      if (out.length >= MAX_DASH_STEPS) fail('破線が細かすぎるため変換できません。');
      out.push({ points: active, closed: false });
    }
    // A dash can span the explicit start/end of a closed contour. Make that
    // span continuous so it receives joins at the seam rather than two caps.
    if (closed && out.length > 1 && same(out[0].points[0], source[0]) && same(out[out.length - 1].points[out[out.length - 1].points.length - 1], source[0])) {
      var tail = out.pop().points, head = out.shift().points;
      out.unshift({ points: tail.concat(head.slice(1)), closed: false });
    }
    return out;
  }
  function addBody(parts, run, half, cap, join) {
    var points = run.points, closed = run.closed;
    if (points.length === 1) {
      if (cap === 'round') parts.push(circle(points[0], half));
      else if (cap === 'square') parts.push(square(points[0], half));
      return;
    }
    var segments = [];
    for (var i = 0; i + 1 < points.length; i++) { var v = unit(points[i], points[i + 1]); if (v) segments.push({ a: points[i], b: points[i + 1], unit: v }); }
    if (closed) { var final = unit(points[points.length - 1], points[0]); if (final) segments.push({ a: points[points.length - 1], b: points[0], unit: final }); }
    if (!segments.length) return;
    segments.forEach(function (segment, index) {
      var a = segment.a, b = segment.b;
      if (!closed && cap === 'square' && index === 0) a = add(a, scale(segment.unit, -half));
      if (!closed && cap === 'square' && index === segments.length - 1) b = add(b, scale(segment.unit, half));
      var n = scale(left(segment.unit), half);
      parts.push(move([add(a, n), add(b, n), add(b, scale(n, -1)), add(a, scale(n, -1))]));
    });
    if (!closed && cap === 'round') { parts.push(circle(points[0], half)); parts.push(circle(points[points.length - 1], half)); }
    var count = closed ? points.length : Math.max(0, points.length - 2);
    for (var k = 0; k < count; k++) {
      var index = closed ? k : k + 1, prev = segments[(index - 1 + segments.length) % segments.length], next = segments[index % segments.length];
      if (!prev || !next) continue;
      var turn = cross(prev.unit, next.unit);
      if (Math.abs(turn) <= EPSILON) continue;
      // In the SVG coordinate system a positive cross product turns toward
      // the left normal; its exposed outer corner is therefore the right one.
      var outer = turn > 0 ? -1 : 1, vertex = points[index], a = add(vertex, scale(left(prev.unit), half * outer)), b = add(vertex, scale(left(next.unit), half * outer));
      // `flatten()` adds points along curves.  SVG applies linejoin at the
      // authored nodes, not at those approximation points, so use a mitered
      // polygon there to follow the curve without adding a bead at each point.
      var vertexJoin = vertex.corner ? join : 'miter';
      if (vertexJoin === 'round') { parts.push(circle(vertex, half)); continue; }
      var middle = vertexJoin === 'miter' ? lineIntersection(a, prev.unit, b, next.unit) : null;
      if (!middle || length(vertex, middle) > half * 4 + EPSILON) middle = vertex;
      // The original vertex completes the wedge and overlaps both segment
      // bodies. Omitting it leaves a miter triangle point-touching the bodies,
      // which prevents the boolean union from forming one outer contour.
      parts.push(same(middle, vertex) ? move([a, vertex, b]) : move([a, middle, b, vertex]));
    }
  }
  function validateInput(object) {
    if (!object || object.type !== 'path' || typeof object.d !== 'string') fail('パスオブジェクトを指定してください。');
    var style = object.style || {}, width = Number(style.strokeWidth);
    if (style.stroke === 'none' || width === 0) return null;
    if (!Number.isFinite(width) || width < 0) fail('線幅が不正です。');
    if (typeof style.stroke !== 'string' || !style.stroke) fail('線色が不正です。');
    var values = Array.isArray(object.matrix) ? object.matrix : IDENTITY;
    if (values.length !== 6) fail('変形行列が不正です。');
    values.forEach(function (value) { number(value, '変形行列'); });
    return { style: style, width: width, matrix: values };
  }
  function estimatedSegments(item, flatness) {
    var count = 0, estimate = 0, children = item.children && item.children.length ? item.children : [item];
    children.forEach(function (child) { (child.curves || []).forEach(function (curve) {
      count++;
      if (curve.handle1.length > EPSILON || curve.handle2.length > EPSILON) estimate += Math.ceil(Math.sqrt(Math.max(curve.length, curve.handle1.length + curve.handle2.length) / flatness)) * 4;
    }); });
    if (count > MAX_CURVES || estimate > MAX_POINTS) fail('パスが複雑すぎるため変換できません。');
  }
  function loneMove(d, values) {
    // Paper.js omits a CompoundPath child for an SVG subpath made of only M.
    // SVG still paints round and square caps for that zero-length subpath.
    var numberPattern = '[-+]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)(?:[eE][-+]?\\d+)?';
    var match = new RegExp('^\\s*([Mm])\\s*(' + numberPattern + ')[,\\s]+(' + numberPattern + ')\\s*$').exec(d);
    if (!match) return null;
    var x = Number(match[2]), y = Number(match[3]);
    return match[1] === 'm' ? point(values[4] + values[0] * x + values[2] * y, values[5] + values[1] * x + values[3] * y) : point(values[0] * x + values[2] * y + values[4], values[1] * x + values[3] * y + values[5]);
  }
  function unionParts(scope, parts) {
    if (!parts.length) return null;
    if (parts.length > MAX_BOOLEAN_PARTS) fail('アウトラインが複雑すぎるため変換できません。');
    var current = parts.map(function (data) { return new scope.CompoundPath(data); });
    try {
      while (current.length > 1) {
        var next = [];
        for (var i = 0; i < current.length; i += 2) {
          if (i + 1 >= current.length) { next.push(current[i]); continue; }
          var leftPart = current[i], rightPart = current[i + 1], merged;
          try { merged = leftPart.unite(rightPart, { insert: false }); }
          finally { if (leftPart && !leftPart.removed) leftPart.remove(); if (rightPart && !rightPart.removed) rightPart.remove(); }
          if (!merged) fail('アウトラインを結合できません。');
          next.push(merged);
        }
        current = next;
      }
      current[0].reorient(true, true);
      var output = current[0].pathData;
      current[0].remove();
      return output;
    } catch (error) {
      current.forEach(function (item) { if (item && !item.removed) item.remove(); });
      throw error;
    }
  }
  function path(object, options) {
    options = options || {};
    var input = validateInput(object); if (!input) return null;
    var width = input.width, flatness = options.flatness == null ? Math.min(0.1, width / 32) : Number(options.flatness);
    if (!Number.isFinite(flatness) || flatness <= 0 || flatness > 1) fail('曲線の許容誤差が不正です。');
    var scope = paper();
    try {
      var item = new scope.CompoundPath(object.d);
      item.matrix = matrix(scope, input.matrix);
      item.applyMatrix = true;
      item.matrix = new scope.Matrix();
      estimatedSegments(item, flatness);
      var originalChildren = item.children && item.children.length ? item.children : [item];
      var authoredCorners = originalChildren.map(function (child) { return new Set((child.segments || []).map(function (segment) { return cornerKey(segment.point); })); });
      item.flatten(flatness);
      var children = item.children && item.children.length ? item.children : [item], total = 0, parts = [], dash = dashValues(input.style.dash), cap = /^(butt|round|square)$/.test(input.style.linecap) ? input.style.linecap : 'butt', join = /^(miter|round|bevel)$/.test(input.style.linejoin) ? input.style.linejoin : 'miter';
      if (!item.children || !item.children.length) {
        var zero = loneMove(object.d, input.matrix);
        if (zero) { addBody(parts, { points: [zero], closed: false }, width / 2, cap, join); children = []; }
      }
      children.forEach(function (child, childIndex) {
        var knownCorners = authoredCorners[childIndex] || new Set();
        var points = (child.segments || []).map(function (segment) { var value = point(segment.point.x, segment.point.y); value.corner = knownCorners.has(cornerKey(value)); return value; });
        total += points.length;
        if (total > MAX_POINTS) fail('パスが複雑すぎるため変換できません。');
        sourceRuns(points, !!child.closed, dash).forEach(function (run) { addBody(parts, run, width / 2, cap, join); });
      });
      if (!parts.length) {
        var moveOnly = loneMove(object.d, input.matrix);
        if (moveOnly) addBody(parts, { points: [moveOnly], closed: false }, width / 2, cap, join);
      }
      if (!parts.length) return null;
      if (parts.length > MAX_SHAPES) fail('パスが複雑すぎるため変換できません。');
      var output = unionParts(scope, parts);
      if (output.length > (root.IlapoCore && root.IlapoCore.LIMITS ? root.IlapoCore.LIMITS.pathLength : 100000)) fail('出力パスが長すぎます。');
      return output || null;
    } catch (error) {
      if (/^線のアウトライン化:/.test(error.message || '')) throw error;
      throw new Error('線のアウトライン化: パスを変換できません。');
    } finally { clear(scope); }
  }
  return { path: path, MAX_CURVES: MAX_CURVES, MAX_POINTS: MAX_POINTS };
}));
