/* global GraphExpression */
(function (root, factory) {
  const expression = typeof module === 'object' && module.exports ? require('./expression.js') : root.GraphExpression;
  const api = factory(expression);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphCurves = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Expression) {
  'use strict';
  const GRID = 80, EDGE_STEPS = 18, MAX_POINTS = 12000, MAX_EVALUATIONS = 30000, PARAM_STEPS = 160, PARAM_DEPTH = 10;
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const range = (value, fallback) => Array.isArray(value) && finite(value[0]) && finite(value[1]) && value[0] < value[1] ? value : fallback;
  const intersection = (a, b) => { const result = [Math.max(a[0], b[0]), Math.min(a[1], b[1])]; return result[0] < result[1] ? result : null; };
  const parameters = doc => Object.fromEntries((doc.parameters || []).map(p => [p.name, Number(p.value)]));
  const axisRange = (doc, axis) => range(doc.axes && doc.axes[axis] && [doc.axes[axis].min, doc.axes[axis].max], [-10, 10]);
  const domainRange = (series, axis, fallback) => range(series.domain && series.domain[axis], fallback);
  const scope = (base, extra) => Object.assign({}, base, extra);
  const evaluate = (compiled, values) => { try { const value = compiled.evaluate(values); return finite(value) ? value : null; } catch (_) { return null; } };
  const variables = (names, doc) => names.concat((doc.parameters || []).map(p => p.name));
  const compile = (text, names, doc, target) => {
    if (!Expression || typeof Expression.compile !== 'function') throw new Error('数式エンジンを読み込めません。');
    return Expression.compile(text || '', { variables: variables(names, doc), angle: doc.angle || 'rad', target });
  };
  const compileEquation = (text, doc) => {
    if (!Expression || typeof Expression.compileEquation !== 'function') throw new Error('陰関数の数式処理を読み込めません。');
    return Expression.compileEquation(text || '', { variables: variables(['x', 'y'], doc), angle: doc.angle || 'rad' });
  };
  const addSegment = (out, a, b) => { if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 1e-9) return true; if (out.x.length + 3 > MAX_POINTS) return false; out.x.push(a[0], b[0], null); out.y.push(a[1], b[1], null); return true; };

  function sampleImplicit(series, doc) {
    const out = { x: [], y: [], warnings: [] }, domainX = domainRange(series, 'x', axisRange(doc, 'x')), domainY = domainRange(series, 'y', axisRange(doc, 'y'));
    const xr = intersection(domainX, axisRange(doc, 'x')), yr = intersection(domainY, axisRange(doc, 'y'));
    if (!xr || !yr) { out.warnings.push('表示範囲と計算範囲が重なりません。'); return out; }
    const compiled = compileEquation(series.expression, doc), base = parameters(doc), dx = (xr[1] - xr[0]) / GRID, dy = (yr[1] - yr[0]) / GRID;
    let evaluations = 0, exhausted = false;
    const value = (x, y) => { if (evaluations >= MAX_EVALUATIONS) { exhausted = true; return null; } evaluations++; return evaluate(compiled, scope(base, { x, y })); };
    const grid = Array.from({ length: GRID + 1 }, (_, j) => Array.from({ length: GRID + 1 }, (_, i) => value(xr[0] + i * dx, yr[0] + j * dy)));
    const rootOnEdge = (a, fa, b, fb) => {
      if (fa === null || fb === null || fa === 0 && fb === 0) return null;
      let lo = a, hi = b, flo = fa, best = Math.abs(fa) < Math.abs(fb) ? [a, fa] : [b, fb];
      if (fa === 0) return a; if (fb === 0) return b;
      if (Math.sign(fa) === Math.sign(fb)) return null;
      for (let n = 0; n < EDGE_STEPS; n++) {
        const mid = [(lo[0] + hi[0]) / 2, (lo[1] + hi[1]) / 2], fm = value(mid[0], mid[1]);
        if (fm === null) return null;
        if (Math.abs(fm) < Math.abs(best[1])) best = [mid, fm];
        if (Math.sign(flo) === Math.sign(fm)) { lo = mid; flo = fm; } else hi = mid;
      }
      return Math.abs(best[1]) <= Math.min(Math.abs(fa), Math.abs(fb)) * 1e-4 ? best[0] : null;
    };
    const edge = (id, x0, x1, y0, y1, values) => {
      const pairs = [[0, 1, [x0, y0], [x1, y0]], [1, 2, [x1, y0], [x1, y1]], [2, 3, [x1, y1], [x0, y1]], [3, 0, [x0, y1], [x0, y0]]];
      const item = pairs[id]; return rootOnEdge(item[2], values[item[0]], item[3], values[item[1]]);
    };
    for (let j = 0; j < GRID; j++) for (let i = 0; i < GRID; i++) {
      const x0 = xr[0] + i * dx, x1 = x0 + dx, y0 = yr[0] + j * dy, y1 = y0 + dy;
      const values = [grid[j][i], grid[j][i + 1], grid[j + 1][i + 1], grid[j + 1][i]];
      if (values.some(v => v === null)) continue;
      const roots = []; for (let id = 0; id < 4; id++) {
        const p = edge(id, x0, x1, y0, y1, values);
        if (p && !roots.some(item => Math.hypot(item.p[0] - p[0], item.p[1] - p[1]) < 1e-9)) roots.push({ id, p });
      }
      if (roots.length === 2) { if (!addSegment(out, roots[0].p, roots[1].p)) { out.warnings.push('描画点数の上限に達しました。'); return out; } }
      else if (roots.length === 4) {
        const byId = Object.fromEntries(roots.map(item => [item.id, item.p]));
        const normalizer = Math.max(...values.map(Math.abs), Number.MIN_VALUE), v = values.map(item => item / normalizer), q = v[0] * v[2] - v[1] * v[3];
        if (Math.abs(q) < 1e-12) {
          const d = v[0] - v[1] - v[3] + v[2], u = d ? (v[0] - v[3]) / d : .5, w = d ? (v[0] - v[1]) / d : .5;
          const saddle = u >= 0 && u <= 1 && w >= 0 && w <= 1 ? [x0 + (x1 - x0) * u, y0 + (y1 - y0) * w] : [(x0 + x1) / 2, (y0 + y1) / 2];
          for (const item of roots) if (!addSegment(out, item.p, saddle)) { out.warnings.push('描画点数の上限に達しました。'); return out; }
        } else {
          const pairs = q > 0 ? [[0, 1], [2, 3]] : [[0, 3], [1, 2]];
          for (const pair of pairs) if (!addSegment(out, byId[pair[0]], byId[pair[1]])) { out.warnings.push('描画点数の上限に達しました。'); return out; }
        }
      }
    }
    if (exhausted) out.warnings.push('数式の評価回数の上限に達しました。');
    if (!out.x.length) out.warnings.push('この範囲では曲線を検出できません。重根・孤立点・非常に細い曲線は格子では捉えられないことがあります。');
    return out;
  }

  function sampleCurve(series, doc, kind) {
    const base = parameters(doc), interval = range(series.interval, [0, 1]), xr = axisRange(doc, 'x'), yr = axisRange(doc, 'y'), compiled = kind === 'parametric' ? { x: compile(series.components && series.components.x, ['t'], doc, false), y: compile(series.components && series.components.y, ['t'], doc, false) } : { r: compile(series.expression, ['theta'], doc, false) };
    const out = { x: [], y: [], warnings: [] }, span = Math.max(xr[1] - xr[0], yr[1] - yr[0], 1);
    let evaluations = 0, exhausted = false;
    const limitedEvaluate = (compiledExpression, values) => { if (evaluations >= MAX_EVALUATIONS) { exhausted = true; return null; } evaluations++; return evaluate(compiledExpression, values); };
    const at = t => {
      if (kind === 'parametric') { const x = limitedEvaluate(compiled.x, scope(base, { t })), y = limitedEvaluate(compiled.y, scope(base, { t })); return x === null || y === null ? null : [x, y]; }
      const r = limitedEvaluate(compiled.r, scope(base, { theta: t })); if (r === null) return null;
      const radians = doc.angle === 'deg' ? t * Math.PI / 180 : t; return [r * Math.cos(radians), r * Math.sin(radians)];
    };
    let used = 0;
    const append = (p) => { if (out.x.length >= MAX_POINTS) return false; out.x.push(p ? p[0] : null); out.y.push(p ? p[1] : null); return true; };
    const discontinuous = (a, m, b) => {
      if (!a || !m || !b) return true;
      const chord = Math.hypot(b[0] - a[0], b[1] - a[1]), bend = Math.hypot(m[0] - (a[0] + b[0]) / 2, m[1] - (a[1] + b[1]) / 2);
      return chord > span * 3 && bend > span * 1.25;
    };
    const walk = (a, pa, b, pb, depth) => {
      if (used >= MAX_POINTS - PARAM_STEPS) { append(null); return; }
      const m = (a + b) / 2, pm = at(m); used++;
      if (!pa && !pm && !pb) { append(null); return; }
      if (!pa && !pm) { append(null); walk(m, pm, b, pb, depth + 1); return; }
      if (!pm && !pb) { append(null); return; }
      const bad = discontinuous(pa, pm, pb);
      const bend = pa && pm && pb && Math.hypot(pm[0] - (pa[0] + pb[0]) / 2, pm[1] - (pa[1] + pb[1]) / 2);
      if (depth < PARAM_DEPTH && (bad || bend > span * .02) && used < MAX_POINTS - PARAM_STEPS) { walk(a, pa, m, pm, depth + 1); walk(m, pm, b, pb, depth + 1); }
      else append(bad || (depth >= PARAM_DEPTH && bend > span * .02) ? null : pb);
    };
    const first = at(interval[0]); append(first);
    for (let i = 0; i < PARAM_STEPS; i++) { const a = interval[0] + (interval[1] - interval[0]) * i / PARAM_STEPS, b = interval[0] + (interval[1] - interval[0]) * (i + 1) / PARAM_STEPS; walk(a, i ? at(a) : first, b, at(b), 0); }
    if (out.x.length >= MAX_POINTS) out.warnings.push('描画点数の上限に達しました。');
    if (exhausted) out.warnings.push('数式の評価回数の上限に達しました。');
    return out;
  }
  function sampleParametric(series, doc) { return sampleCurve(series, doc, 'parametric'); }
  function samplePolar(series, doc) { return sampleCurve(series, doc, 'polar'); }

  function pointAt(series, doc, at) {
    if (!finite(at)) return null;
    const base = parameters(doc);
    if (series.kind === 'function') {
      const domain = domainRange(series, 'x', axisRange(doc, 'x')); if (at < domain[0] || at > domain[1]) return null;
      const y = evaluate(compile(series.expression, ['x'], doc, 'y'), scope(base, { x: at })); return y === null ? null : [at, y];
    }
    if (series.kind === 'parametric') {
      const interval = range(series.interval, [0, 1]); if (at < interval[0] || at > interval[1]) return null;
      const x = evaluate(compile(series.components && series.components.x, ['t'], doc, false), scope(base, { t: at })), y = evaluate(compile(series.components && series.components.y, ['t'], doc, false), scope(base, { t: at })); return x === null || y === null ? null : [x, y];
    }
    if (series.kind === 'polar') {
      const interval = range(series.interval, [0, 1]); if (at < interval[0] || at > interval[1]) return null;
      const r = evaluate(compile(series.expression, ['theta'], doc, false), scope(base, { theta: at })); if (r === null) return null;
      const radians = doc.angle === 'deg' ? at * Math.PI / 180 : at; return [r * Math.cos(radians), r * Math.sin(radians)];
    }
    return null;
  }
  return { sampleImplicit, sampleParametric, samplePolar, pointAt };
}));
