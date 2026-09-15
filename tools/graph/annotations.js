(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphAnnotations = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Expression = typeof module === 'object' && module.exports ? require('./expression.js') : root.GraphExpression;
  let requiredCurves = null;
  if (typeof module === 'object' && module.exports) {
    try { requiredCurves = require('./curves.js'); } catch (_) { /* curves.js may load after this independent module. */ }
  }
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const empty = warning => ({ points: [], segments: [], warning: warning || '' });
  const range = (axis, fallback) => {
    const min = Number(axis && axis.min), max = Number(axis && axis.max);
    return finite(min) && finite(max) && min < max ? [min, max] : fallback;
  };
  const overlap = (...ranges) => {
    const out = [Math.max(...ranges.map(value => value[0])), Math.min(...ranges.map(value => value[1]))];
    return out[0] <= out[1] ? out : null;
  };
  const parameters = doc => Object.fromEntries((doc && doc.parameters || []).filter(p => p && typeof p.name === 'string').map(p => [p.name, Number(p.value)]));
  const parameterNames = doc => (doc && doc.parameters || []).map(p => p.name);
  const curves = () => root.GraphCurves || requiredCurves;
  const seriesById = (doc, id) => (doc && doc.series || []).find(series => series && series.id === id);
  const annotationById = (doc, id) => (doc && doc.annotations || []).find(annotation => annotation && annotation.id === id);
  const axisRange = (doc, key) => range(doc && doc.axes && doc.axes[key], [-10, 10]);
  const axisIsLog = (doc, key) => !!(doc && doc.axes && doc.axes[key] && doc.axes[key].scale === 'log');
  const inRange = (value, limits) => finite(value) && value >= limits[0] - 1e-10 * Math.max(1, Math.abs(limits[0]), Math.abs(limits[1])) && value <= limits[1] + 1e-10 * Math.max(1, Math.abs(limits[0]), Math.abs(limits[1]));
  const drawablePoint = (doc, point) => Array.isArray(point) && finite(point[0]) && finite(point[1]) && (!axisIsLog(doc, 'x') || point[0] > 0) && (!axisIsLog(doc, 'y') || point[1] > 0);
  const numericTolerance = (...values) => Math.max(1e-12, Number.EPSILON * 64 * Math.max(1, ...values.map(value => Math.abs(value))));
  const literalNumber = value => typeof value === 'number' || typeof value === 'string' && /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(value.trim());
  const numberText = value => Object.is(value, -0) || value === 0 ? '0' : Number(value).toPrecision(15);
  const escapeRegExp = value => String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const usesParameter = (text, doc) => parameterNames(doc).some(name => new RegExp('(^|[^A-Za-z0-9_])' + escapeRegExp(name) + '(?![A-Za-z0-9_])').test(String(text || '')));

  function evaluateExpression(text, doc) {
    if (!Expression || typeof Expression.compile !== 'function') throw new Error('数式エンジンを読み込めません。');
    return Expression.compile(String(text || ''), { variables: parameterNames(doc), angle: doc && doc.angle || 'rad', target: false });
  }
  function scalar(text, doc) {
    try {
      const value = evaluateExpression(text, doc).evaluate(parameters(doc));
      return finite(value) ? value : null;
    } catch (_) { return null; }
  }
  function functionFor(series, doc) {
    if (!series || series.kind !== 'function') return null;
    try {
      const compiled = Expression.compile(series.expression || '', { variables: ['x'].concat(parameterNames(doc)), angle: doc && doc.angle || 'rad', target: 'y' });
      const base = parameters(doc);
      return x => {
        try {
          const value = compiled.evaluate(Object.assign({}, base, { x }));
          return finite(value) ? value : null;
        } catch (_) { return null; }
      };
    } catch (_) { return null; }
  }
  function functionDomain(series) {
    const values = series && series.domain && series.domain.x;
    return Array.isArray(values) && values.length === 2 && finite(Number(values[0])) && finite(Number(values[1])) && Number(values[0]) < Number(values[1]) ? [Number(values[0]), Number(values[1])] : [-10, 10];
  }
  function projectionBase(doc, key) {
    const limits = axisRange(doc, key);
    if (axisIsLog(doc, key)) return limits[0];
    if (limits[0] <= 0 && limits[1] >= 0) return 0;
    return Math.abs(limits[0]) < Math.abs(limits[1]) ? limits[0] : limits[1];
  }
  function clippedLine(point, slope, xr, yr) {
    const candidates = [];
    const add = (x, y) => {
      if (finite(x) && finite(y) && x >= xr[0] - 1e-9 && x <= xr[1] + 1e-9 && y >= yr[0] - 1e-9 && y <= yr[1] + 1e-9 && !candidates.some(p => Math.abs(p[0] - x) < 1e-8 && Math.abs(p[1] - y) < 1e-8)) candidates.push([x, y]);
    };
    add(xr[0], point[1] + slope * (xr[0] - point[0]));
    add(xr[1], point[1] + slope * (xr[1] - point[0]));
    if (slope !== 0) { add(point[0] + (yr[0] - point[1]) / slope, yr[0]); add(point[0] + (yr[1] - point[1]) / slope, yr[1]); }
    if (candidates.length < 2) return null;
    let pair = [candidates[0], candidates[1]], farthest = -1;
    for (let i = 0; i < candidates.length; i++) for (let j = i + 1; j < candidates.length; j++) {
      const distance = (candidates[i][0] - candidates[j][0]) ** 2 + (candidates[i][1] - candidates[j][1]) ** 2;
      if (distance > farthest) { farthest = distance; pair = [candidates[i], candidates[j]]; }
    }
    return farthest > 1e-20 ? pair : null;
  }
  function pointForAnchor(anchor, doc) {
    let point = null;
    if (anchor.type === 'free') {
      const x = scalar(anchor.x, doc), y = scalar(anchor.y, doc);
      if (x !== null && y !== null) point = [x, y];
    } else if (anchor.type === 'curve') {
      const series = seriesById(doc, anchor.seriesId), at = scalar(anchor.at, doc), api = curves();
      if (series && at !== null && api && typeof api.pointAt === 'function') {
        try { point = api.pointAt(series, doc, at); } catch (_) { point = null; }
      }
    }
    return Array.isArray(point) && finite(point[0]) && finite(point[1]) ? point : null;
  }
  function pointResult(annotation, doc) {
    const point = pointForAnchor(annotation && annotation.anchor || {}, doc);
    if (!drawablePoint(doc, point)) return empty('点の座標が定義されていないか、対数軸で表示できません。');
    const segments = [];
    if (annotation.projections) {
      const baseX = projectionBase(doc, 'x'), baseY = projectionBase(doc, 'y');
      if (drawablePoint(doc, [point[0], baseY])) segments.push([[point[0], baseY], [point[0], point[1]]]);
      if (drawablePoint(doc, [baseX, point[1]])) segments.push([[baseX, point[1]], [point[0], point[1]]]);
    }
    return { points: [point], segments, warning: '' };
  }
  function guideResult(annotation, doc) {
    const value = scalar(annotation && annotation.value, doc), axis = annotation && annotation.axis;
    if ((axis !== 'x' && axis !== 'y') || value === null) return empty('補助線の値が定義されていません。');
    if (axisIsLog(doc, axis) && value <= 0) return empty('対数軸では正の値の補助線だけを表示できます。');
    const other = axis === 'x' ? axisRange(doc, 'y') : axisRange(doc, 'x');
    const segment = axis === 'x' ? [[value, other[0]], [value, other[1]]] : [[other[0], value], [other[1], value]];
    return { points: [], segments: [segment], warning: '' };
  }
  function tangentLine(annotation, doc) {
    const series = seriesById(doc, annotation && annotation.seriesId), at = scalar(annotation && annotation.at, doc);
    const unavailable = warning => ({ point: null, slope: null, warning });
    if (!series || series.kind !== 'function' || at === null) return unavailable('接線の対象または接点が不正です。');
    const fn = functionFor(series, doc), domain = functionDomain(series);
    if (!fn || !inRange(at, domain)) return unavailable('接点で関数を評価できません。');
    const y = fn(at), point = [at, y];
    if (!finite(y)) return unavailable('接点が定義されていません。');
    const span = domain[1] - domain[0], h = Math.min(span / 4096, Math.max(span * 1e-6, 1e-7 * Math.max(1, Math.abs(at))));
    if (!(h > 0) || at - h * 2 < domain[0] || at + h * 2 > domain[1]) return unavailable('接点の左右で微分を確認できません。');
    const left = fn(at - h), right = fn(at + h), leftHalf = fn(at - h / 2), rightHalf = fn(at + h / 2);
    if ([left, right, leftHalf, rightHalf].some(value => value === null)) return unavailable('接点の左右で微分を確認できません。');
    const dl = (y - left) / h, dr = (right - y) / h, dl2 = (y - leftHalf) / (h / 2), dr2 = (rightHalf - y) / (h / 2);
    // 一次の刻み幅誤差を取り除く。x^2 のような滑らかな曲線では左右とも
    // 同じ極限へ近づき、abs(x) の折れ点では左右の極限が異なる。
    const leftLimit = 2 * dl2 - dl, rightLimit = 2 * dr2 - dr, slope = (leftLimit + rightLimit) / 2;
    const tolerance = Math.max(1e-8, 1e-5 * Math.max(Math.abs(leftLimit), Math.abs(rightLimit)));
    if (![dl, dr, dl2, dr2, leftLimit, rightLimit, slope].every(finite) || Math.abs(leftLimit - rightLimit) > tolerance || Math.abs(slope) > 1e10) return unavailable('接点の左右で傾きが一致しないため、接線を表示しません。');
    return { point, slope, warning: '' };
  }
  function tangentResult(annotation, doc) {
    const line = tangentLine(annotation, doc);
    if (!line.point || !drawablePoint(doc, line.point)) return empty(line.warning || '接点が定義されていないか、対数軸で表示できません。');
    const xr = axisRange(doc, 'x'), yr = axisRange(doc, 'y');
    const segment = clippedLine(line.point, line.slope, xr, yr);
    if (!segment) return { points: [line.point], segments: [], warning: '接線が表示範囲にありません。' };
    return { points: [line.point], segments: [segment], warning: '' };
  }
  function rootFromBracket(fn, a, b, fa, fb) {
    if (fa === 0) return a;
    if (fb === 0) return b;
    let left = a, right = b, lv = fa;
    let best = Math.abs(fa) < Math.abs(fb) ? [a, fa] : [b, fb];
    // x の幅だけで止めると、100*x=1 のような式で残差が十分に小さく
    // ならない。二分法なら片側だけが停滞せず区間を必ず縮められるため、
    // 評価済みのうち残差最小の候補を返す。
    for (let i = 0; i < 112; i++) {
      const middle = left + (right - left) / 2;
      if (middle === left || middle === right) break;
      const mv = fn(middle);
      if (mv === null) return null;
      if (Math.abs(mv) < Math.abs(best[1])) best = [middle, mv];
      if (mv === 0) return middle;
      if ((lv < 0) === (mv < 0)) { left = middle; lv = mv; } else right = middle;
    }
    return best[0];
  }
  function minimumIn(fn, a, b) {
    let left = a, right = b;
    for (let i = 0; i < 48; i++) {
      const one = left + (right - left) / 3, two = right - (right - left) / 3, f1 = fn(one), f2 = fn(two);
      if (f1 === null || f2 === null) return null;
      if (Math.abs(f1) < Math.abs(f2)) right = two; else left = one;
    }
    const middle = (left + right) / 2, value = fn(middle);
    return value === null ? null : middle;
  }
  function intersectionResult(annotation, doc) {
    const ids = annotation && annotation.seriesIds;
    if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) return empty('交点の対象が不正です。');
    const first = seriesById(doc, ids[0]), second = seriesById(doc, ids[1]);
    if (!first || !second || first.kind !== 'function' || second.kind !== 'function') return empty('交点は異なる2D関数を2つ選んでください。');
    const requested = Array.isArray(annotation.interval) && annotation.interval.length === 2 && finite(Number(annotation.interval[0])) && finite(Number(annotation.interval[1])) && Number(annotation.interval[0]) < Number(annotation.interval[1]) ? [Number(annotation.interval[0]), Number(annotation.interval[1])] : null;
    const limits = requested && overlap(requested, functionDomain(first), functionDomain(second));
    if (!limits) return empty('指定区間と関数の定義域が重なっていません。');
    const f = functionFor(first, doc), g = functionFor(second, doc);
    if (!f || !g) return empty('交点の対象となる関数を評価できません。');
    const difference = x => { const a = f(x), b = g(x); return a === null || b === null ? null : a - b; };
    const count = 768, samples = [], same = [];
    for (let i = 0; i <= count; i++) {
      const x = limits[0] + (limits[1] - limits[0]) * i / count, a = f(x), b = g(x), value = a === null || b === null ? null : a - b;
      samples.push({ x, a, b, value });
      if (value !== null) same.push(Math.abs(value) <= numericTolerance(a, b));
    }
    if (same.length >= 8 && same.every(Boolean)) return empty('2つの関数を数値計算では区別できないため、交点は表示しません。');
    const candidates = [];
    const add = value => {
      if (!finite(value)) return;
      const distance = Math.max(1e-7, (limits[1] - limits[0]) * 1e-6), index = candidates.findIndex(x => Math.abs(x - value) <= distance);
      if (index < 0) { candidates.push(value); return; }
      // 接する根の探索（最小化）は近い近似値を先に見つけることがある。
      // 同じ根と見なす候補は、残差が小さい方を残す。
      const before = difference(candidates[index]), after = difference(value);
      if (after !== null && (before === null || Math.abs(after) < Math.abs(before))) candidates[index] = value;
    };
    for (let i = 0; i < samples.length; i++) {
      const current = samples[i];
      // 格子点で「ほぼ0」だけでは、1e-10*x=0 の近傍を交点として
      // 大量に採用してしまう。格子点そのものは厳密に0のときだけ採用し、
      // それ以外は符号変化または局所最小から収束させる。
      if (current.value === 0) add(current.x);
      if (i && current.value !== null && samples[i - 1].value !== null && (current.value < 0) !== (samples[i - 1].value < 0)) add(rootFromBracket(difference, samples[i - 1].x, current.x, samples[i - 1].value, current.value));
      if (i && i < samples.length - 1 && current.value !== null && samples[i - 1].value !== null && samples[i + 1].value !== null && Math.abs(current.value) <= Math.abs(samples[i - 1].value) && Math.abs(current.value) <= Math.abs(samples[i + 1].value)) add(minimumIn(difference, samples[i - 1].x, samples[i + 1].x));
    }
    const points = [];
    for (const x of candidates.sort((a, b) => a - b)) {
      const a = f(x), b = g(x), residual = a === null || b === null ? Infinity : Math.abs(a - b), tolerance = a === null || b === null ? 0 : numericTolerance(a, b);
      const delta = Math.max((limits[1] - limits[0]) * 1e-6, 1e-8 * Math.max(1, Math.abs(x)));
      const neighbours = [];
      for (const probe of [x - delta, x + delta]) {
        if (inRange(probe, limits) && inRange(probe, functionDomain(first))) { const value = f(probe); if (value !== null) neighbours.push(value); }
        if (inRange(probe, limits) && inRange(probe, functionDomain(second))) { const value = g(probe); if (value !== null) neighbours.push(value); }
      }
      // 端点や sqrt(x) の定義域端では、存在しない側を評価失敗として扱わない。
      // 残差そのものを必ず確認するので、漸近線を交点として採用しない。
      if (residual <= tolerance && neighbours.every(finite)) points.push([x, a / 2 + b / 2]);
    }
    return { points, segments: [], warning: points.length ? '' : '指定範囲に有限の交点は見つかりませんでした。' };
  }
  function tangentIntersectionPoint(annotation, doc) {
    const ids = annotation && annotation.tangentIds;
    if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1]) return { point: null, warning: '接線の交点の対象が不正です。' };
    const first = annotationById(doc, ids[0]), second = annotationById(doc, ids[1]);
    if (!first || !second || first.kind !== 'tangent' || second.kind !== 'tangent') return { point: null, warning: '接線の交点には接線を2つ選んでください。' };
    const one = tangentLine(first, doc), two = tangentLine(second, doc);
    if (!one.point || !two.point) return { point: null, warning: one.warning || two.warning || '接線を評価できません。' };
    const difference = one.slope - two.slope, tolerance = Math.max(1e-10, 1e-10 * Math.max(Math.abs(one.slope), Math.abs(two.slope)));
    if (!finite(difference) || Math.abs(difference) <= tolerance) return { point: null, warning: '2つの接線は平行か、数値的に区別できません。' };
    const x = (two.point[1] - one.point[1] + one.slope * one.point[0] - two.slope * two.point[0]) / difference;
    const y = one.point[1] + one.slope * (x - one.point[0]);
    return finite(x) && finite(y) ? { point: [x, y], warning: '' } : { point: null, warning: '接線の交点を計算できません。' };
  }
  function tangentIntersectionResult(annotation, doc) {
    const result = tangentIntersectionPoint(annotation, doc);
    if (!drawablePoint(doc, result.point)) return empty(result.warning || '接線の交点が対数軸で表示できません。');
    return { points: [result.point], segments: [], warning: '' };
  }
  function referencePoint(annotation, doc, seen) {
    if (!annotation || !annotation.id || seen && seen.has(annotation.id)) return null;
    const next = new Set(seen || []); next.add(annotation.id);
    if (annotation.kind === 'point') return pointForAnchor(annotation.anchor || {}, doc);
    if (annotation.kind === 'tangentIntersection') return tangentIntersectionPoint(annotation, doc).point;
    return null;
  }
  function segmentResult(annotation, doc) {
    const from = annotationById(doc, annotation && annotation.from), to = annotationById(doc, annotation && annotation.to);
    if (!from || !to || from.id === to.id) return empty('線分の端点が不正です。');
    const first = referencePoint(from, doc), second = referencePoint(to, doc);
    if (!first || !second) return empty('線分の端点を評価できません。');
    if (!drawablePoint(doc, first) || !drawablePoint(doc, second)) return empty('線分の端点が対数軸で表示できません。');
    return { points: [], segments: [[first, second]], warning: '' };
  }
  function textResult(annotation, doc) {
    const point = pointForAnchor(annotation && annotation.anchor || {}, doc);
    if (!drawablePoint(doc, point)) return empty('文字の位置が定義されていないか、対数軸で表示できません。');
    return { points: [point], segments: [], warning: '' };
  }
  function curveEvaluator(series, doc) {
    if (!series || !Expression) return null;
    const base = parameters(doc), names = parameterNames(doc), angle = doc && doc.angle || 'rad';
    const evaluate = (compiled, scope) => { try { const value = compiled.evaluate(scope); return finite(value) ? value : null; } catch (_) { return null; } };
    try {
      if (series.kind === 'function') {
        const compiled = Expression.compile(series.expression || '', { variables: ['x'].concat(names), angle, target: 'y' }), domain = functionDomain(series);
        return at => { if (!inRange(at, domain)) return null; const y = evaluate(compiled, Object.assign({}, base, { x: at })); return y === null ? null : [at, y]; };
      }
      if (series.kind === 'parametric') {
        const x = Expression.compile(series.components && series.components.x || '', { variables: ['t'].concat(names), angle, target: false }), y = Expression.compile(series.components && series.components.y || '', { variables: ['t'].concat(names), angle, target: false }), interval = curveInterval(series);
        return at => { if (!interval || !inRange(at, interval)) return null; const px = evaluate(x, Object.assign({}, base, { t: at })), py = evaluate(y, Object.assign({}, base, { t: at })); return px === null || py === null ? null : [px, py]; };
      }
      if (series.kind === 'polar') {
        const compiled = Expression.compile(series.expression || '', { variables: ['theta'].concat(names), angle, target: false }), interval = curveInterval(series);
        return at => { if (!interval || !inRange(at, interval)) return null; const radius = evaluate(compiled, Object.assign({}, base, { theta: at })); if (radius === null) return null; const radians = angle === 'deg' ? at * Math.PI / 180 : at; return [radius * Math.cos(radians), radius * Math.sin(radians)]; };
      }
    } catch (_) { return null; }
    return null;
  }
  function curveInterval(series) {
    if (!series) return null;
    if (series.kind === 'function') return functionDomain(series);
    const values = series.interval;
    return Array.isArray(values) && values.length === 2 && finite(Number(values[0])) && finite(Number(values[1])) && Number(values[0]) < Number(values[1]) ? [Number(values[0]), Number(values[1])] : null;
  }
  function closestCurveAnchor(series, doc, target, initial) {
    const interval = curveInterval(series);
    if (!interval || !['function', 'parametric', 'polar'].includes(series.kind)) return null;
    const pointAt = curveEvaluator(series, doc);
    if (!pointAt) return null;
    const count = 320, span = interval[1] - interval[0], samples = [];
    const add = at => { if (!finite(at) || at < interval[0] || at > interval[1]) return; const point = pointAt(at); if (Array.isArray(point) && finite(point[0]) && finite(point[1])) samples.push({ at, point, distance: (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2 }); };
    for (let i = 0; i <= count; i++) add(interval[0] + span * i / count);
    add(initial); add(initial - span / count); add(initial + span / count);
    if (!samples.length) return null;
    samples.sort((a, b) => a.at - b.at);
    let best = samples.reduce((chosen, item) => item.distance < chosen.distance ? item : chosen);
    const refine = center => {
      let left = Math.max(interval[0], center - span / count), right = Math.min(interval[1], center + span / count);
      const distanceAt = at => { const point = pointAt(at); return point && finite(point[0]) && finite(point[1]) ? (point[0] - target[0]) ** 2 + (point[1] - target[1]) ** 2 : Infinity; };
      for (let i = 0; i < 48; i++) {
        const one = left + (right - left) / 3, two = right - (right - left) / 3, first = distanceAt(one), second = distanceAt(two);
        if (first <= second) right = two; else left = one;
      }
      const at = (left + right) / 2, point = pointAt(at), distance = distanceAt(at);
      if (point && distance < best.distance) best = { at, point, distance };
    };
    samples.forEach((sample, index) => { if ((!index || sample.distance <= samples[index - 1].distance) && (index === samples.length - 1 || sample.distance <= samples[index + 1].distance)) refine(sample.at); });
    return finite(best.at) ? best.at : null;
  }
  function anchorForDrag(annotation, doc, coordinate) {
    if (!annotation || !Array.isArray(coordinate) || !finite(coordinate[0]) || !finite(coordinate[1]) || !drawablePoint(doc, coordinate)) return null;
    const anchor = annotation.anchor || {};
    if (annotation.kind === 'text' || annotation.kind === 'point' && anchor.type === 'free') {
      if (anchor.type !== 'free' || !literalNumber(anchor.x) || !literalNumber(anchor.y) || usesParameter(anchor.x, doc) || usesParameter(anchor.y, doc)) return null;
      return { type: 'free', x: numberText(coordinate[0]), y: numberText(coordinate[1]) };
    }
    if (annotation.kind !== 'point' || anchor.type !== 'curve' || !literalNumber(anchor.at) || usesParameter(anchor.at, doc)) return null;
    const series = seriesById(doc, anchor.seriesId);
    if (!series || !['function', 'parametric', 'polar'].includes(series.kind)) return null;
    if (series.kind === 'function') {
      const domain = functionDomain(series), at = Math.max(domain[0], Math.min(domain[1], coordinate[0])), evaluate = curveEvaluator(series, doc);
      if (!evaluate || !drawablePoint(doc, evaluate(at))) return null;
      return { type: 'curve', seriesId: series.id, at: numberText(at) };
    }
    const initial = scalar(anchor.at, doc), at = initial === null ? null : closestCurveAnchor(series, doc, coordinate, initial);
    return at === null ? null : { type: 'curve', seriesId: series.id, at: numberText(at) };
  }
  function evaluate(annotation, doc) {
    try {
      if (!annotation || !doc || doc.mode === '3d') return empty('この注釈は2Dグラフで使います。');
      if (annotation.visible === false) return empty();
      if (annotation.kind === 'point') return pointResult(annotation, doc);
      if (annotation.kind === 'guide') return guideResult(annotation, doc);
      if (annotation.kind === 'tangent') return tangentResult(annotation, doc);
      if (annotation.kind === 'intersection') return intersectionResult(annotation, doc);
      if (annotation.kind === 'tangentIntersection') return tangentIntersectionResult(annotation, doc);
      if (annotation.kind === 'segment') return segmentResult(annotation, doc);
      if (annotation.kind === 'text') return textResult(annotation, doc);
      return empty('注釈の種類が不正です。');
    } catch (_) { return empty('注釈を評価できません。'); }
  }
  return { evaluate, tangentLine, anchorForDrag };
}));
