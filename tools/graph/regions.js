(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphRegions = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const failure = warning => ({ pointIds: [], segmentIds: [], warning });

  function traceBoundary(region, doc) {
    const ids = region && region.segmentIds;
    if (!Array.isArray(ids) || ids.length < 3 || ids.length > 100 || new Set(ids).size !== ids.length) return failure('領域には重複しない3本以上の線分を指定してください。');
    const annotations = new Map((doc && doc.annotations || []).filter(Boolean).map(a => [a.id, a]));
    const edges = [];
    for (const id of ids) {
      const segment = annotations.get(id);
      if (!segment || segment.kind !== 'segment' || typeof segment.from !== 'string' || typeof segment.to !== 'string' || segment.from === segment.to) return failure('領域の線分参照が不正です。');
      edges.push({ id, a: segment.from, b: segment.to });
    }
    const adjacent = new Map();
    for (const edge of edges) for (const pointId of [edge.a, edge.b]) {
      if (!adjacent.has(pointId)) adjacent.set(pointId, []);
      adjacent.get(pointId).push(edge);
    }
    if (adjacent.size !== edges.length || [...adjacent.values()].some(list => list.length !== 2)) return failure('領域の線分は枝分かれしない1つの閉路にしてください。');
    const start = edges[0].a, pointIds = [start], segmentIds = [], visited = new Set();
    let point = start, previous = null;
    while (true) {
      const candidates = adjacent.get(point).filter(edge => edge !== previous);
      const edge = candidates.find(candidate => !visited.has(candidate.id));
      if (!edge) break;
      visited.add(edge.id); segmentIds.push(edge.id);
      point = edge.a === point ? edge.b : edge.a;
      if (point === start) break;
      pointIds.push(point); previous = edge;
      if (pointIds.length > edges.length) return failure('領域の閉路をたどれません。');
    }
    if (point !== start || visited.size !== edges.length || pointIds.length !== edges.length) return failure('領域の線分は1つの閉じた輪郭にしてください。');
    return { pointIds, segmentIds, warning: '' };
  }

  function containsPoint(polygon, point) {
    if (!Array.isArray(polygon) || !Array.isArray(point) || polygon.length < 3 || !finite(point[0]) || !finite(point[1])) return false;
    let inside = false; const eps = tolerance(polygon);
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
      const a = polygon[j], b = polygon[i]; if (!validPoint(a) || !validPoint(b)) return false;
      if (onSegment(a, b, point, eps)) return true;
      if ((a[1] > point[1]) !== (b[1] > point[1])) {
        const x = (b[0] - a[0]) * (point[1] - a[1]) / (b[1] - a[1]) + a[0];
        if (point[0] < x) inside = !inside;
      }
    }
    return inside;
  }

  function measurePolygon(points) {
    const bad = warning => ({ polygon: [], area: null, labelPoint: null, warning });
    if (!Array.isArray(points) || points.length < 3 || points.some(point => !validPoint(point))) return bad('領域の頂点を評価できません。');
    const polygon = points.map(point => [point[0], point[1]]), eps = tolerance(polygon);
    for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++) if (distance(polygon[i], polygon[j]) <= eps) return bad('領域に重複または近すぎる頂点があります。');
    const translated = polygon.map(point => [point[0] - polygon[0][0], point[1] - polygon[0][1]]);
    let twice = 0; for (let i = 0; i < translated.length; i++) { const a = translated[i], b = translated[(i + 1) % translated.length]; twice += a[0] * b[1] - b[0] * a[1]; }
    const scale = extent(translated), areaTolerance = scale * scale * 1e-12;
    if (!finite(twice) || Math.abs(twice) <= areaTolerance * 2) return bad('領域の面積が0になるため表示できません。');
    for (let i = 0; i < polygon.length; i++) for (let j = i + 1; j < polygon.length; j++) {
      if (i === j || (i + 1) % polygon.length === j || (j + 1) % polygon.length === i) continue;
      if (segmentsIntersect(polygon[i], polygon[(i + 1) % polygon.length], polygon[j], polygon[(j + 1) % polygon.length], eps)) return bad('領域の辺が交差または重なっています。');
    }
    let cx = 0, cy = 0;
    for (let i = 0; i < translated.length; i++) { const a = translated[i], b = translated[(i + 1) % translated.length], cross = a[0] * b[1] - b[0] * a[1]; cx += (a[0] + b[0]) * cross; cy += (a[1] + b[1]) * cross; }
    let labelPoint = [polygon[0][0] + cx / (3 * twice), polygon[0][1] + cy / (3 * twice)];
    if (!containsPoint(polygon, labelPoint)) labelPoint = earPoint(polygon, twice, eps);
    if (!labelPoint || !containsPoint(polygon, labelPoint)) return bad('領域内のラベル位置を計算できません。');
    return { polygon, area: Math.abs(twice) / 2, labelPoint, warning: '' };
  }

  function areaText(area, doc) {
    if (!finite(area)) return '';
    const x = doc && doc.axes && doc.axes.x && doc.axes.x.unit, y = doc && doc.axes && doc.axes.y && doc.axes.y.unit;
    const xUnit = typeof x === 'string' ? x.trim() : '', yUnit = typeof y === 'string' ? y.trim() : '';
    const unit = xUnit && yUnit ? ' [' + xUnit + ' × ' + yUnit + ']' : '';
    return '面積 ≈ ' + Number(area.toPrecision(8)) + unit;
  }
  function validPoint(p) { return Array.isArray(p) && p.length >= 2 && finite(p[0]) && finite(p[1]); }
  function extent(points) { let value = 0; for (const p of points) value = Math.max(value, Math.abs(p[0]), Math.abs(p[1])); return value; }
  function tolerance(points) { const span = extent(points.map(p => [p[0] - points[0][0], p[1] - points[0][1]])); return span ? span * 1e-12 : 0; }
  function distance(a, b) { return Math.hypot(a[0] - b[0], a[1] - b[1]); }
  function cross(a, b, p) { return (b[0] - a[0]) * (p[1] - a[1]) - (b[1] - a[1]) * (p[0] - a[0]); }
  function onSegment(a, b, p, eps) { return Math.abs(cross(a, b, p)) <= eps * distance(a, b) && p[0] >= Math.min(a[0], b[0]) - eps && p[0] <= Math.max(a[0], b[0]) + eps && p[1] >= Math.min(a[1], b[1]) - eps && p[1] <= Math.max(a[1], b[1]) + eps; }
  function sign(value, eps) { return value > eps ? 1 : value < -eps ? -1 : 0; }
  function orientation(a, b, p, eps) { return sign(cross(a, b, p), eps * distance(a, b)); }
  function segmentsIntersect(a, b, c, d, eps) { const abC = orientation(a, b, c, eps), abD = orientation(a, b, d, eps), cdA = orientation(c, d, a, eps), cdB = orientation(c, d, b, eps); return (abC === 0 && onSegment(a, b, c, eps)) || (abD === 0 && onSegment(a, b, d, eps)) || (cdA === 0 && onSegment(c, d, a, eps)) || (cdB === 0 && onSegment(c, d, b, eps)) || abC !== abD && cdA !== cdB; }
  function earPoint(polygon, twice, eps) { const direction = Math.sign(twice); for (let i = 0; i < polygon.length; i++) { const a = polygon[(i + polygon.length - 1) % polygon.length], b = polygon[i], c = polygon[(i + 1) % polygon.length]; if (direction * orientation(a, b, c, eps) <= 0) continue; if (polygon.some((p, j) => j !== i && j !== (i + 1) % polygon.length && j !== (i + polygon.length - 1) % polygon.length && containsTriangle(a, b, c, p, eps))) continue; return [(a[0] + b[0] + c[0]) / 3, (a[1] + b[1] + c[1]) / 3]; } return null; }
  function containsTriangle(a, b, c, p, eps) { const x = orientation(a, b, p, eps), y = orientation(b, c, p, eps), z = orientation(c, a, p, eps); return (x >= 0 && y >= 0 && z >= 0) || (x <= 0 && y <= 0 && z <= 0); }
  return { traceBoundary, measurePolygon, containsPoint, areaText };
}));
