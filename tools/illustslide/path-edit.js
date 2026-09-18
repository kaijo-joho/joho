/* Bounded, Paper.js-backed path editing.  All public coordinates are world coordinates. */
(function (root, factory) {
  var api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.IlapoPathEdit = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';
  var scope;
  function fail(message) { throw new Error('パス編集: ' + message); }
  function paper() {
    if (!root.paper || !root.paper.PaperScope) fail('Paper.js を先に読み込んでください。');
    if (!scope) { scope = new root.paper.PaperScope(); scope.setup(new scope.Size(1, 1)); }
    if (scope.project && scope.project.activeLayer) scope.project.activeLayer.removeChildren();
    return scope;
  }
  function clear(s) { if (s.project && s.project.activeLayer) s.project.activeLayer.removeChildren(); }
  function m(s, values) { values = values || [1, 0, 0, 1, 0, 0]; return new s.Matrix(values[0], values[1], values[2], values[3], values[4], values[5]); }
  function localItem(s, object) {
    if (!object || object.type !== 'path' || typeof object.d !== 'string') fail('パスオブジェクトを指定してください。');
    return new s.CompoundPath(object.d);
  }
  function children(item) { return item.children || [item]; }
  function inverse(s, object) { var x = m(s, object.matrix); if (Math.abs(x.determinant) < 1e-12) fail('変形行列が特異のため編集できません。'); return x.inverted(); }
  function point(s, value, label) { if (!value || !Number.isFinite(value.x) || !Number.isFinite(value.y)) fail((label || '座標') + 'は有限の x, y を指定してください。'); return new s.Point(value.x, value.y); }
  function world(s, object, p) { return m(s, object.matrix).transform(p); }
  function local(s, object, p) { return inverse(s, object).transform(point(s, p)); }
  function vectorToWorld(s, object, v) { var x = m(s, object.matrix); return new s.Point(x.a * v.x + x.c * v.y, x.b * v.x + x.d * v.y); }
  function vectorToLocal(s, object, v) { var x = inverse(s, object); return new s.Point(x.a * v.x + x.c * v.y, x.b * v.x + x.d * v.y); }
  function cloneObject(object, path) { var out = Object.assign({}, object); out.style = Object.assign({}, object.style); out.matrix = (object.matrix || [1, 0, 0, 1, 0, 0]).slice(); out.d = path.pathData; return out; }
  function refPath(item, ref, object) { var list = children(item); if (!ref || (ref.id !== undefined && (!object || ref.id !== object.id))) fail('別の図形のアンカーは編集できません。'); if (!Number.isInteger(ref.path) || ref.path < 0 || ref.path >= list.length) fail('パス番号が範囲外です。'); return list[ref.path]; }
  function refSegment(item, ref, object) { var path = refPath(item, ref, object); if (!Number.isInteger(ref.index) || ref.index < 0 || ref.index >= path.segments.length) fail('アンカー番号が範囲外です。'); return { path: path, segment: path.segments[ref.index] }; }
  function copySegment(s, segment) { return new s.Segment(segment.point.clone(), segment.handleIn.clone(), segment.handleOut.clone()); }
  function reversedSegments(s, segments) { return segments.slice().reverse().map(function (seg) { return new s.Segment(seg.point.clone(), seg.handleOut.clone(), seg.handleIn.clone()); }); }
  function mappedSegment(s, segment, from, to) { return new s.Segment(local(s, to, world(s, from, segment.point)), vectorToLocal(s, to, vectorToWorld(s, from, segment.handleIn)), vectorToLocal(s, to, vectorToWorld(s, from, segment.handleOut))); }
  function replacePaths(s, compound, list) { compound.removeChildren(); list.forEach(function (path) { compound.addChild(path); }); return compound; }
  function buildPath(s, segments, closed) { var p = new s.Path(); segments.forEach(function (seg) { p.add(copySegment(s, seg)); }); p.closed = !!closed; return p; }
  function ensureOpenEndpoint(item, ref, object) {
    var p = refPath(item, ref, object); if (p.closed || (ref.index !== 0 && ref.index !== p.segments.length - 1)) fail('開いたパスの端点を指定してください。'); return p;
  }

  function inspect(object) {
    var s = paper(), item = localItem(s, object);
    try { return children(item).map(function (path) { return { closed: !!path.closed, segments: path.segments.map(function (seg) { return { point: xy(world(s, object, seg.point)), handleIn: xy(vectorToWorld(s, object, seg.handleIn)), handleOut: xy(vectorToWorld(s, object, seg.handleOut)) }; }) }; }); } finally { clear(s); }
  }
  function xy(p) { return { x: p.x, y: p.y }; }
  function moveAnchors(object, refs, dx, dy) {
    if (!Array.isArray(refs)) fail('アンカー配列を指定してください。'); if (!Number.isFinite(dx) || !Number.isFinite(dy)) fail('移動量は有限値を指定してください。');
    var s = paper(), item = localItem(s, object);
    try { var d = vectorToLocal(s, object, new s.Point(dx, dy)), seen = {}; refs.forEach(function (ref) { var got = refSegment(item, ref, object), key = ref.path + ':' + ref.index; if (!seen[key]) { got.segment.point = got.segment.point.add(d); seen[key] = true; } }); return cloneObject(object, item); } finally { clear(s); }
  }
  function moveHandle(object, ref, which, worldPoint, options) {
    if (which !== 'in' && which !== 'out') fail('ハンドルは in または out を指定してください。');
    var s = paper(), item = localItem(s, object);
    try {
      var seg = refSegment(item, ref, object).segment;
      var prop = which === 'in' ? 'handleIn' : 'handleOut', opposite = which === 'in' ? 'handleOut' : 'handleIn';
      var next = point(s, worldPoint).subtract(world(s, object, seg.point));
      var length = vectorToWorld(s, object, seg[opposite]).length;
      seg[prop] = vectorToLocal(s, object, next);
      // 反対側の長さは画面上で保つ。開いた端の未使用ハンドルは増やさない。
      if (!(options && options.independent) && next.length && length) {
        seg[opposite] = vectorToLocal(s, object, next.normalize(-length));
      }
      return cloneObject(object, item);
    } finally { clear(s); }
  }

  function nearest(object, worldPoint) {
    var s = paper(), item = localItem(s, object);
    try { item.matrix = m(s, object.matrix); var q = point(s, worldPoint), best = null; children(item).forEach(function (path, pathIndex) { var hit = path.getNearestLocation(q); if (hit && (!best || hit.point.getDistance(q) < best.distance)) best = { point: hit.point, distance: hit.point.getDistance(q), path: pathIndex, index: hit.curve.index, t: hit.time }; }); if (!best) return null; best.point = xy(best.point); return best; } finally { clear(s); }
  }
  function addAnchor(object, worldPoint) {
    // 最近点はworldで決め、その曲線のtimeをlocalの曲線にも適用する。
    var hit = nearest(object, worldPoint);
    if (!hit) fail('アンカーを追加する区間がありません。');
    var s = paper(), item = localItem(s, object);
    try {
      var path = children(item)[hit.path];
      if (hit.t < 1e-7 || hit.t > 1 - 1e-7) fail('すでにアンカーがある位置です。区間の途中を選んでください。');
      var second = path.curves[hit.index].divideAtTime(hit.t);
      if (!second) fail('この位置にはアンカーを追加できません。');
      return { object: cloneObject(object, item), ref: { id: object.id, path: hit.path, index: second.segment1.index } };
    } finally { clear(s); }
  }

  function deleteAnchors(object, refs, options) {
    if (!Array.isArray(refs)) fail('アンカー配列を指定してください。'); var s = paper(), item = localItem(s, object), selected = {};
    try {
      refs.forEach(function (r) { refSegment(item, r, object); selected[r.path + ':' + r.index] = true; }); var output = [];
      children(item).forEach(function (p, pi) {
        var keep = p.segments.filter(function (_, i) { return !selected[pi + ':' + i]; });
        if (!keep.length) return;
        if (!selected[pi + ':0'] && !p.segments.some(function (_, i) { return selected[pi + ':' + i]; })) { output.push(buildPath(s, p.segments, p.closed)); return; }
        if (options && options.open === false) { if (keep.length >= 2) output.push(buildPath(s, keep, p.closed)); return; }
        var runs = [], run = [];
        p.segments.forEach(function (seg, i) { if (selected[pi + ':' + i]) { if (run.length) { runs.push(run.splice(0)); } } else run.push(seg); }); if (run.length) runs.push(run);
        if (p.closed && runs.length > 1 && !selected[pi + ':0']) { runs[0] = runs.pop().concat(runs[0]); }
        runs.forEach(function (r) { if (r.length >= 2) { var part = buildPath(s, r, false); part.firstSegment.handleIn = new s.Point(); part.lastSegment.handleOut = new s.Point(); output.push(part); } });
      });
      if (!output.length) return null; replacePaths(s, item, output); return cloneObject(object, item);
    } finally { clear(s); }
  }
  function setAnchorType(object, refs, type) {
    if (type !== 'corner' && type !== 'smooth') fail('アンカー種別は corner または smooth です。');
    var s = paper(), item = localItem(s, object);
    try {
      refs.forEach(function (r) {
        var got = refSegment(item, r, object), seg = got.segment, path = got.path;
        if (type === 'corner') { seg.handleIn = new s.Point(); seg.handleOut = new s.Point(); return; }
        var index = seg.index, count = path.segments.length, center = world(s, object, seg.point);
        var prev = path.closed || index > 0 ? path.segments[(index - 1 + count) % count] : null;
        var next = path.closed || index < count - 1 ? path.segments[(index + 1) % count] : null;
        var incoming = vectorToWorld(s, object, seg.handleIn), outgoing = vectorToWorld(s, object, seg.handleOut);
        var direction = outgoing.length ? outgoing : incoming.length ? incoming.negate() :
          prev && next ? world(s, object, next.point).subtract(world(s, object, prev.point)) :
          next ? world(s, object, next.point).subtract(center) : prev ? center.subtract(world(s, object, prev.point)) : new s.Point(1, 0);
        if (direction.length < 1e-9) direction = new s.Point(1, 0);
        var beforeLength = prev ? center.getDistance(world(s, object, prev.point)) / 3 : 0;
        var afterLength = next ? center.getDistance(world(s, object, next.point)) / 3 : 0;
        seg.handleIn = vectorToLocal(s, object, direction.normalize(-(incoming.length || beforeLength)));
        seg.handleOut = vectorToLocal(s, object, direction.normalize(outgoing.length || afterLength));
      });
      return cloneObject(object, item);
    } finally { clear(s); }
  }

  // Coordinates for the direct-selection corner handle.  Keep this in world
  // space so a transformed path has the same visual radius and drag behaviour.
  function cornerInfoFor(s, object, path, index) {
    var seg = path.segments[index], count = path.segments.length;
    if (!seg || (!path.closed && (index === 0 || index === count - 1))) return null;
    var prev = path.segments[(index - 1 + count) % count], next = path.segments[(index + 1) % count];
    if (seg.handleIn.length || seg.handleOut.length || prev.handleOut.length || next.handleIn.length) return null;
    var center = world(s, object, seg.point), incoming = center.subtract(world(s, object, prev.point)), outgoing = world(s, object, next.point).subtract(center);
    if (!incoming.length || !outgoing.length) return null;
    var u = incoming.normalize(), v = outgoing.normalize(), turn = Math.acos(Math.max(-1, Math.min(1, u.dot(v))));
    if (turn < 1e-6 || Math.PI - turn < 1e-6) return null;
    var tangent = Math.tan(turn / 2), direction = u.negate().add(v);
    if (!direction.length || !Number.isFinite(tangent) || tangent <= 0) return null;
    // turn is the path's exterior turn.  The handle lies on the inner-angle
    // bisector, whose sin(alpha/2) is cos(turn/2).
    return { center: center, direction: direction.normalize(), sinHalf: Math.cos(turn / 2), tangent: tangent,
      maxRadius: Math.min(incoming.length / 2, outgoing.length / 2) / tangent };
  }
  function cornerInfo(object, ref) {
    var s = paper(), item = localItem(s, object);
    try { var got = refSegment(item, ref, object), value = cornerInfoFor(s, object, got.path, got.segment.index); return value && { center: xy(value.center), direction: xy(value.direction), sinHalf: value.sinHalf, maxRadius: value.maxRadius }; } finally { clear(s); }
  }

  function roundCorners(object, refs, radius) {
    if (!(Number.isFinite(radius) && radius > 0)) fail('角丸半径は正の有限値を指定してください。');
    var s = paper(), item = localItem(s, object);
    try {
      var chosen = new Set();
      refs.forEach(function (ref) { refSegment(item, ref, object); chosen.add(ref.path + ':' + ref.index); });
      // 全角を変更前の辺から計算する。配列番号の変化や隣の丸めに影響されない。
      var output = children(item).map(function (path, pi) {
        var segments = [];
        path.segments.forEach(function (seg, index) {
          if (!chosen.has(pi + ':' + index)) { segments.push(copySegment(s, seg)); return; }
          if (!path.closed && (index === 0 || index === path.segments.length - 1)) fail('開いたパスの端点は丸められません。');
          var prev = path.segments[(index - 1 + path.segments.length) % path.segments.length], next = path.segments[(index + 1) % path.segments.length];
          if (seg.handleIn.length || seg.handleOut.length || prev.handleOut.length || next.handleIn.length) fail('曲線を含む角の丸めには対応していません。');
          var center = world(s, object, seg.point), incoming = center.subtract(world(s, object, prev.point)), outgoing = world(s, object, next.point).subtract(center);
          if (!incoming.length || !outgoing.length) fail('長さ0の辺は丸められません。');
          var u = incoming.normalize(), v = outgoing.normalize(), turn = Math.acos(Math.max(-1, Math.min(1, u.dot(v))));
          if (turn < 1e-6 || Math.PI - turn < 1e-6) fail('一直線や折り返しの点は丸められません。');
          var tangent = Math.tan(turn / 2), distance = Math.min(radius * tangent, incoming.length / 2, outgoing.length / 2);
          var actualRadius = distance / tangent, handle = 4 / 3 * Math.tan(turn / 4) * actualRadius;
          segments.push(new s.Segment(local(s, object, center.subtract(u.multiply(distance))), new s.Point(), vectorToLocal(s, object, u.multiply(handle))));
          segments.push(new s.Segment(local(s, object, center.add(v.multiply(distance))), vectorToLocal(s, object, v.multiply(-handle)), new s.Point()));
        });
        return buildPath(s, segments, path.closed);
      });
      replacePaths(s, item, output); return cloneObject(object, item);
    } finally { clear(s); }
  }

  function openPath(object, ref) {
    var s = paper(), item = localItem(s, object);
    try {
      var got = refSegment(item, ref, object), path = got.path, index = ref.index;
      if (Number.isFinite(ref.t) && ref.t > 1e-9 && ref.t < 1 - 1e-9) {
        var curve = path.curves[index]; if (!curve) fail('分割する区間がありません。');
        var divided = curve.divideAtTime(ref.t); if (!divided) fail('この位置では切り開けません。');
        index = divided.segment1.index;
      }
      var replacements;
      if (path.closed) {
        var sequence = path.segments.slice(index).concat(path.segments.slice(0, index));
        sequence.push(copySegment(s, path.segments[index]));
        replacements = [buildPath(s, sequence, false)];
      } else {
        if (index === 0 || index === path.segments.length - 1) fail('この点はすでに開いた端点です。');
        replacements = [buildPath(s, path.segments.slice(0, index + 1), false), buildPath(s, path.segments.slice(index), false)];
      }
      replacements.forEach(function (p) { p.firstSegment.handleIn = new s.Point(); p.lastSegment.handleOut = new s.Point(); });
      var list = [];
      children(item).forEach(function (p) { if (p === path) list.push.apply(list, replacements); else list.push(buildPath(s, p.segments, p.closed)); });
      replacePaths(s, item, list); return cloneObject(object, item);
    } finally { clear(s); }
  }

  function closePaths(object, pathIndexes) {
    if (!Array.isArray(pathIndexes)) fail('パス番号配列を指定してください。');
    var s = paper(), item = localItem(s, object);
    try {
      pathIndexes.forEach(function (i) {
        var path = children(item)[i];
        if (!Number.isInteger(i) || !path) fail('パス番号が範囲外です。');
        if (path.segments.length < 2) fail('閉じるには2点以上必要です。');
        if (path.closed) return;
        if (path.firstSegment.point.getDistance(path.lastSegment.point) < 1e-9) {
          path.firstSegment.handleIn = path.lastSegment.handleIn.clone(); path.lastSegment.remove();
        } else { path.lastSegment.handleOut = new s.Point(); path.firstSegment.handleIn = new s.Point(); }
        path.closed = true;
      });
      return cloneObject(object, item);
    } finally { clear(s); }
  }

  function joinEndpoints(a, refA, b, refB, mode) {
    if (!['line', 'merge', 'smooth'].includes(mode)) fail('連結方法が不正です。');
    var s = paper(), one = localItem(s, a), two = a.id === b.id ? one : localItem(s, b);
    try {
      var pa = ensureOpenEndpoint(one, refA, a), pb = ensureOpenEndpoint(two, refB, b);
      if (pa.segments.length < 2 || pb.segments.length < 2) fail('2点以上のパスを指定してください。');
      if (pa === pb && refA.index === refB.index) fail('異なる2つの端点を選んでください。');
      var aa = pa.segments.map(function (seg) { return copySegment(s, seg); }), bb;
      var closing = pa === pb;
      if (!closing) {
        bb = pb.segments.map(function (seg) { return two === one ? copySegment(s, seg) : mappedSegment(s, seg, b, a); });
        if (refA.index === 0) aa = reversedSegments(s, aa);
        if (refB.index === pb.segments.length - 1) bb = reversedSegments(s, bb);
      }
      var end = aa[aa.length - 1], start = closing ? aa[0] : bb[0];
      var endWorld = world(s, a, end.point), startWorld = world(s, a, start.point), gap = endWorld.getDistance(startWorld);
      var merge = mode === 'merge' || gap < 1e-8;
      if (merge) {
        var midpoint = end.point.add(start.point).divide(2);
        var combined = new s.Segment(midpoint, end.handleIn.clone(), start.handleOut.clone());
        if (mode === 'smooth') {
          var wi = vectorToWorld(s, a, combined.handleIn), wo = vectorToWorld(s, a, combined.handleOut);
          var direction = wo.length ? wo : wi.length ? wi.negate() : new s.Point(1, 0);
          combined.handleIn = vectorToLocal(s, a, direction.normalize(-wi.length));
          combined.handleOut = vectorToLocal(s, a, direction.normalize(wo.length));
        }
        if (closing) { aa[0] = combined; aa.pop(); }
        else { aa[aa.length - 1] = combined; bb.shift(); }
      } else if (mode === 'smooth') {
        // 両端を動かさず、隣の曲線・直線と接線をそろえた橋を渡す。
        var previous = aa[aa.length - 2], next = closing ? aa[1] : bb[1];
        var endDirection = vectorToWorld(s, a, end.handleIn).negate();
        var startDirection = vectorToWorld(s, a, start.handleOut).negate();
        if (!endDirection.length) endDirection = endWorld.subtract(world(s, a, previous.point));
        if (!startDirection.length) startDirection = startWorld.subtract(world(s, a, next.point));
        if (!endDirection.length) endDirection = startWorld.subtract(endWorld);
        if (!startDirection.length) startDirection = endWorld.subtract(startWorld);
        end.handleOut = vectorToLocal(s, a, endDirection.normalize(gap / 3));
        start.handleIn = vectorToLocal(s, a, startDirection.normalize(gap / 3));
      } else { end.handleOut = new s.Point(); start.handleIn = new s.Point(); }
      var merged = buildPath(s, closing ? aa : aa.concat(bb), closing), list = [];
      children(one).forEach(function (p) {
        if (p === pa) list.push(merged);
        else if (two !== one || p !== pb) list.push(buildPath(s, p.segments, p.closed));
      });
      if (two !== one) children(two).forEach(function (p) {
        if (p !== pb) list.push(buildPath(s, p.segments.map(function (seg) { return mappedSegment(s, seg, b, a); }), p.closed));
      });
      replacePaths(s, one, list); return cloneObject(a, one);
    } finally { clear(s); }
  }

  function boolean(objects, operation) {
    if (!Array.isArray(objects) || !objects.length) fail('1個以上の閉じたパスを指定してください。'); if (!['union', 'subtract', 'intersect'].includes(operation)) fail('ブール演算が不正です。');
    var s = paper(), first = objects[0], result;
    try {
      objects.forEach(function (o) { var local = localItem(s, o); children(local).forEach(function (p) { if (!p.closed) fail('開いたパスにはブール演算を使用できません。'); }); });
      var source = localItem(s, first); source.matrix = m(s, first.matrix); result = source;
      for (var i = 1; i < objects.length; i++) { var other = localItem(s, objects[i]); other.matrix = m(s, objects[i].matrix); result = result[operation === 'union' ? 'unite' : operation](other, { insert: false }); }
      if (!result || !children(result).some(function (p) { return p.segments.length >= 2; })) return null;
      result.matrix = inverse(s, first); return cloneObject(first, result);
    } finally { clear(s); }
  }
  return { inspect: inspect, moveAnchors: moveAnchors, moveHandle: moveHandle, addAnchor: addAnchor, nearest: nearest, deleteAnchors: deleteAnchors, setAnchorType: setAnchorType, cornerInfo: cornerInfo, roundCorners: roundCorners, openPath: openPath, closePaths: closePaths, joinEndpoints: joinEndpoints, boolean: boolean };
}));
