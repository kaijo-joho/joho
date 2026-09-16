(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphIntegrals = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  // 計算量を制限し、収束しなかった結果を面積として返さない。
  const MAX_EVALUATIONS = 32768, MAX_DEPTH = 30, INITIAL = 64;
  const RELATIVE_ERROR = 1e-9, DRAW_ERROR = 2e-4;
  const finite = n => typeof n === 'number' && Number.isFinite(n);
  const bad = warning => ({ polygons: [], area: null, integral: null, labelPoint: null, warning });
  const mid = (a, b) => a + (b - a) / 2;
  const opposite = (a, b) => a !== 0 && b !== 0 && (a < 0) !== (b < 0);
  function sum(values) {
    let total = 0, correction = 0;
    for (const value of values) { const next = value - correction, t = total + next; correction = (t - total) - next; total = t; }
    return total;
  }
  class Queue {
    constructor(key) { this.key = key; this.items = []; }
    add(item) {
      const a = this.items; let i = a.length; a.push(item);
      while (i > 0) { const p = (i - 1) >> 1; if (a[p][this.key] >= item[this.key]) break; a[i] = a[p]; i = p; } a[i] = item;
    }
    pop() {
      const a = this.items, first = a[0], last = a.pop(); if (!a.length) return first;
      let i = 0;
      while (i * 2 + 1 < a.length) { let c = i * 2 + 1; if (c + 1 < a.length && a[c + 1][this.key] > a[c][this.key]) c++; if (a[c][this.key] <= last[this.key]) break; a[i] = a[c]; i = c; }
      a[i] = last; return first;
    }
    peek() { while (this.items.length && !this.items[0].active) this.pop(); return this.items[0]; }
  }

  function compute(first, second, interval) {
    if (typeof first !== 'function' || typeof second !== 'function' || !Array.isArray(interval) || interval.length !== 2 || !interval.every(finite) || interval[0] >= interval[1]) return bad('積分区間または境界が不正です。');
    const [a, b] = interval, span = b - a;
    if (!finite(span)) return bad('積分区間が広すぎます。');
    const samples = new Map(), leaves = new Set(), errors = new Queue('error'), shapes = new Queue('shape');
    let failure = '', totalError = 0, calls = 0;
    const at = x => {
      if (samples.has(x)) return samples.get(x);
      if (++calls > MAX_EVALUATIONS) { failure = '計算点数の上限に達しました。区間を狭めてください。'; return null; }
      let u, v; try { u = first(x); v = second(x); } catch (_) { u = v = NaN; }
      if (!finite(u) || !finite(v) || !finite(u - v)) { failure = '指定区間に境界を定義できない値、または大きすぎる値があります。'; return null; }
      const p = { x, u, v, d: u - v }; samples.set(x, p); return p;
    };
    const simpson = (l, m, r, absolute) => (r.x - l.x) * ((absolute ? Math.abs(l.d) : l.d) / 6 + (absolute ? Math.abs(m.d) : m.d) * (2 / 3) + (absolute ? Math.abs(r.d) : r.d) / 6);
    // 等間隔の標本が周期と一致して振動を見落とすのを抑える。
    const seed = [];
    for (let i = 0; i <= INITIAL; i++) {
      const t = (i + .12 * Math.sin(2 * Math.PI * i / INITIAL)) / INITIAL;
      const p = at(i === INITIAL ? b : a + span * t); if (!p) return bad(failure);
      if (!seed.length || p.x > seed[seed.length - 1].x) seed.push(p);
    }
    const bases = [];
    for (let i = 1; i < seed.length; i++) { const l = seed[i - 1], r = seed[i], m = at(mid(l.x, r.x)); if (!m) return bad(failure); bases.push({ l, m, r }); }
    const initial = [...samples.values()];
    const range = key => { let lo = Infinity, hi = -Infinity; for (const p of initial) { lo = Math.min(lo, p[key]); hi = Math.max(hi, p[key]); } return hi - lo; };
    const scaleU = range('u'), scaleV = range('v');
    const initialArea = sum(bases.map(q => simpson(q.l, q.m, q.r, true)));
    const magnitude = Math.max(...initial.map(p => Math.abs(p.d))) * span;
    const tolerance = Math.max(initialArea, magnitude * .01) * RELATIVE_ERROR;
    if (!finite(tolerance) || !finite(scaleU) || !finite(scaleV)) return bad('値が大きすぎて面積を計算できません。');
    function make(l, m, r, depth) {
      const lm = at(mid(l.x, m.x)), mr = at(mid(m.x, r.x)); if (!lm || !mr) return null;
      const coarse = simpson(l, m, r, false), coarseArea = simpson(l, m, r, true);
      const integral = simpson(l, lm, m, false) + simpson(m, mr, r, false), area = simpson(l, lm, m, true) + simpson(m, mr, r, true);
      const error = Math.max(Math.abs(integral - coarse), Math.abs(area - coarseArea)) / 15;
      let shape = 0;
      for (const [key, scale] of [['u', scaleU], ['v', scaleV]]) {
        const deviation = Math.max(Math.abs(lm[key] - (l[key] / 2 + m[key] / 2)), Math.abs(m[key] - (l[key] / 2 + r[key] / 2)), Math.abs(mr[key] - (m[key] / 2 + r[key] / 2)));
        // 大きい共通オフセットの丸め誤差を曲がりと取り違えない。
        const noise = Number.EPSILON * 16 * Math.max(Math.abs(l[key]), Math.abs(m[key]), Math.abs(r[key]));
        shape = Math.max(shape, Math.max(0, deviation - noise) / (scale || 1));
      }
      if (![integral, area, error, shape].every(finite)) { failure = '値が大きすぎて面積を計算できません。'; return null; }
      return { l, m, r, lm, mr, depth, error, shape, integral: integral + (integral - coarse) / 15, area: area + (area - coarseArea) / 15, active: true };
    }
    const add = q => { leaves.add(q); errors.add(q); shapes.add(q); totalError += q.error; };
    for (const q of bases) { const leaf = make(q.l, q.m, q.r, 0); if (!leaf) return bad(failure); add(leaf); }
    while (totalError > tolerance || shapes.peek()?.shape > DRAW_ERROR) {
      const leaf = shapes.peek()?.shape > DRAW_ERROR ? shapes.peek() : errors.peek();
      if (!leaf || leaf.depth >= MAX_DEPTH || leaf.m.x === leaf.l.x || leaf.m.x === leaf.r.x) return bad('積分または曲線の形が収束しません。区間内の不連続や急な変化を確認してください。');
      const left = make(leaf.l, leaf.lm, leaf.m, leaf.depth + 1), right = make(leaf.m, leaf.mr, leaf.r, leaf.depth + 1);
      if (!left || !right) return bad(failure);
      leaf.active = false; leaves.delete(leaf); totalError = Math.max(0, totalError - leaf.error); add(left); add(right);
    }
    const area = Math.max(0, sum([...leaves].map(q => q.area)));
    let integral = sum([...leaves].map(q => q.integral));
    if (!finite(area) || !finite(integral)) return bad('面積を計算できません。');
    if (Math.abs(integral) <= area * Number.EPSILON * 64) integral = 0;

    const points = [...samples.values()].sort((p, q) => p.x - q.x), roots = [];
    for (let i = 1; i < points.length; i++) if (opposite(points[i - 1].d, points[i].d)) {
      let l = points[i - 1], r = points[i], best = Math.abs(l.d) < Math.abs(r.d) ? l : r;
      const threshold = Math.max(Math.abs(l.d), Math.abs(r.d)) * 1e-10;
      for (let j = 0; j < 64; j++) {
        const x = mid(l.x, r.x); if (x === l.x || x === r.x) break;
        const p = at(x); if (!p) return bad(failure);
        if (Math.abs(p.d) < Math.abs(best.d)) best = p;
        if (Math.abs(p.d) <= threshold) break;
        if (opposite(l.d, p.d)) r = p; else l = p;
      }
      const y = best.u / 2 + best.v / 2;
      roots.push({ x: best.x, u: y, v: y, d: 0 });
    }
    // root の位置では上下で同じ頂点を使い、交差した輪郭を作らない。
    const boundary = new Map(points.map(p => [p.x, p])); for (const p of roots) boundary.set(p.x, p);
    const ordered = [...boundary.values()].sort((p, q) => p.x - q.x), polygons = [];
    let run = [], largest = 0, labelPoint = [mid(a, b), 0];
    function flush() {
      if (run.length < 2 || !run.some(p => p.d !== 0)) return;
      const approximate = sum(run.slice(1).map((p, i) => (p.x - run[i].x) * (Math.abs(p.d) / 2 + Math.abs(run[i].d) / 2)));
      if (!(approximate > 0)) return;
      polygons.push(run.map(p => [p.x, p.u]).concat([...run].reverse().map(p => [p.x, p.v])));
      if (approximate > largest) {
        largest = approximate;
        const x = mid(run[0].x, run[run.length - 1].x), i = Math.max(1, run.findIndex(p => p.x >= x)), l = run[i - 1], r = run[i], t = (x - l.x) / (r.x - l.x);
        labelPoint = [x, (1 - t) * (l.u / 2 + l.v / 2) + t * (r.u / 2 + r.v / 2)];
      }
    }
    for (const p of ordered) { run.push(p); if (p.d === 0) { flush(); run = [p]; } } flush();
    if (!polygons.length) { const p = at(mid(a, b)); if (!p) return bad(failure); labelPoint = [p.x, p.u / 2 + p.v / 2]; }
    return { polygons, area, integral, labelPoint, warning: '' };
  }
  return { compute };
}));
