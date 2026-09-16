/* global GraphDataCurves */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphDataCurves = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const finite = value => typeof value === 'number' && Number.isFinite(value);
  const MAX_POINTS = 20000;

  // Fritsch-Carlson monotone cubic Hermite slopes (the PCHIP definition).
  function slopes(xs, ys) {
    const n = xs.length, h = [], delta = [];
    for (let i = 0; i < n - 1; i++) { h.push(xs[i + 1] - xs[i]); delta.push((ys[i + 1] - ys[i]) / h[i]); }
    if (n === 2) return [delta[0], delta[0]];
    const d = Array(n);
    const endpoint = (h0, h1, m0, m1) => {
      let value = ((2 * h0 + h1) * m0 - h0 * m1) / (h0 + h1);
      if (Math.sign(value) !== Math.sign(m0)) value = 0;
      else if (Math.sign(m0) !== Math.sign(m1) && Math.abs(value) > Math.abs(3 * m0)) value = 3 * m0;
      return value;
    };
    d[0] = endpoint(h[0], h[1], delta[0], delta[1]);
    d[n - 1] = endpoint(h[n - 2], h[n - 3], delta[n - 2], delta[n - 3]);
    for (let i = 1; i < n - 1; i++) {
      if (delta[i - 1] === 0 || delta[i] === 0 || Math.sign(delta[i - 1]) !== Math.sign(delta[i])) d[i] = 0;
      else { const w1 = 2 * h[i] + h[i - 1], w2 = h[i] + 2 * h[i - 1]; d[i] = (w1 + w2) / (w1 / delta[i - 1] + w2 / delta[i]); }
    }
    return d;
  }
  function interpolateBlock(block, method, perInterval) {
    if (block.length < 2) return block.slice();
    const descending = block[1][0] < block[0][0], ordered = descending ? block.slice().reverse() : block.slice();
    const xs = ordered.map(row => row[0]), ys = ordered.map(row => row[1]);
    const ds = method === 'linear' ? null : slopes(xs, ys), out = [];
    for (let i = 0; i < ordered.length - 1; i++) {
      const count = Math.max(1, perInterval);
      for (let j = 0; j < count; j++) {
        const t = j / count, h = xs[i + 1] - xs[i];
        let y;
        if (method === 'linear') y = ys[i] + (ys[i + 1] - ys[i]) * t;
        else { const t2 = t * t, t3 = t2 * t; y = (2 * t3 - 3 * t2 + 1) * ys[i] + (t3 - 2 * t2 + t) * h * ds[i] + (-2 * t3 + 3 * t2) * ys[i + 1] + (t3 - t2) * h * ds[i + 1]; }
        out.push([xs[i] + h * t, y]);
      }
    }
    out.push(ordered[ordered.length - 1].slice(0, 2));
    return descending ? out.reverse() : out;
  }
  function interpolate(rows, method = 'monotone') {
    if (!Array.isArray(rows)) return { rows: [], warning: '数表が不正です。' };
    if (!['linear', 'monotone'].includes(method)) return { rows: rows.slice(), warning: '補間方法が不正です。' };
    const output = [], warnings = [], blocks = [];
    let block = [];
    const flush = () => {
      if (block.length) { blocks.push({ rows: block, valid: true }); block = []; }
    };
    for (const row of rows) {
      if (!Array.isArray(row) || !finite(row[0]) || !finite(row[1])) { flush(); blocks.push({ rows: [Array.isArray(row) ? row.slice() : row], valid: false }); } else block.push([row[0], row[1]]);
    }
    flush();
    const intervals = blocks.reduce((sum, part) => sum + (part.valid ? Math.max(0, part.rows.length - 1) : 0), 0);
    const separatorCount = blocks.reduce((sum, part) => sum + (part.valid ? 0 : part.rows.length), 0);
    const perInterval = intervals ? Math.max(1, Math.floor((MAX_POINTS - separatorCount - blocks.filter(part => part.valid).length) / intervals)) : 1;
    for (const part of blocks) {
      if (!part.valid) { output.push(...part.rows); continue; }
      const candidate = part.rows;
      const direction = candidate.length > 1 ? Math.sign(candidate[1][0] - candidate[0][0]) : 0;
      if (candidate.some((row, i) => i && (row[0] - candidate[i - 1][0]) * direction <= 0)) { warnings.push('x が単調でない区間は補間しません。'); output.push(...candidate); continue; }
      output.push(...interpolateBlock(candidate, method, Math.min(128, perInterval)));
    }
    if(output.some(row=>Array.isArray(row)&&row[0]!==null&&row[1]!==null&&(!finite(row[0])||!finite(row[1]))))return {rows:rows.map(row=>Array.isArray(row)?row.slice():row),warning:'値の桁が極端なため補間できません。元の点を表示します。'};
    return { rows: output, warning: [...new Set(warnings)].join('') };
  }
  return { interpolate };
}));
