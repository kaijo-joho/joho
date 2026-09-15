/* global Plotly, GraphExpression, GraphCurves, GraphAnnotations */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphPlot = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const states = new WeakMap();
  const MAX_FUNCTION_SAMPLES = 1600;
  const BASE_FUNCTION_SEGMENTS = 128;
  const MAX_ADAPTIVE_EVALUATIONS = MAX_FUNCTION_SAMPLES - BASE_FUNCTION_SEGMENTS;
  const MAX_SURFACE_CELLS = 70;
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  const range = (axis, fallback) => {
    const a = axis && Number(axis.min), b = axis && Number(axis.max);
    return finite(a) && finite(b) && a < b ? [a, b] : fallback;
  };
  const intersect = (a, b) => {
    const out = [Math.max(a[0], b[0]), Math.min(a[1], b[1])];
    return out[0] < out[1] ? out : null;
  };
  const plotly = () => root.Plotly;
  const params = (doc) => Object.fromEntries((doc.parameters || []).map((p) => [p.name, Number(p.value)]));
  const expression = (text, variables, doc) => {
    if (!root.GraphExpression || typeof root.GraphExpression.compile !== 'function') {
      throw new Error('数式エンジンを読み込めません。');
    }
    return root.GraphExpression.compile(text || '', { variables: variables.concat((doc.parameters || []).map((p) => p.name)), angle: doc.angle || 'rad', target: variables.length === 2 ? 'z' : 'y' });
  };
  const valueOf = (compiled, scope) => {
    try { const v = compiled.evaluate(scope); return finite(v) ? v : null; } catch (_) { return null; }
  };
  const style = (s) => Object.assign({ color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: 0.85 }, s || {});
  const axisTitle = (a, fallback) => esc((a && a.label) || fallback) + ((a && a.unit) ? ' (' + esc(a.unit) + ')' : '');
  const tick = (a) => {
    const dataRange = range(a, [-10, 10]), isLog = a && a.scale === 'log';
    return { title: { text: axisTitle(a, '') }, range: isLog ? dataRange.map((v) => Math.log10(v)) : dataRange, type: isLog ? 'log' : 'linear', showgrid: true, zeroline: true };
  };
  const defaultCamera = (doc) => {
    if (doc.mode !== '3d' || !doc.equalScale) return undefined;
    const spans = ['x', 'y', 'z'].map((key) => { const r = range(doc.axes && doc.axes[key], [-10, 10]); return r[1] - r[0]; });
    const ratio = Math.max(...spans) / Math.max(1e-9, Math.min(...spans));
    const distance = Math.min(4.5, 1.25 * Math.pow(Math.max(1, ratio), .65));
    return { eye: { x: distance, y: distance, z: distance } };
  };

  function sampleFunction(series, doc) {
    const domainX = range(series.domain && { min: series.domain.x && series.domain.x[0], max: series.domain.x && series.domain.x[1] }, [-10, 10]);
    const xRange = intersect(domainX, range(doc.axes && doc.axes.x, domainX));
    if (!xRange) return { x: [], y: [] };
    const yRange = range(doc.axes && doc.axes.y, [-10, 10]);
    const compiled = expression(series.expression, ['x'], doc);
    const base = params(doc), xs = [], ys = [];
    const visibleSpan = Math.max(Math.abs(yRange[1] - yRange[0]), 1);
    let count = 0;
    const f = (x) => valueOf(compiled, Object.assign({}, base, { x }));
    const add = (x, y) => { xs.push(x); ys.push(y); };
    const discontinuous = (a, va, m, vm, b, vb) => {
      if (va === null || vm === null || vb === null) return true;
      const jump = Math.max(Math.abs(va - vb), Math.abs(va - vm), Math.abs(vm - vb));
      const deviation = Math.abs(vm - (va + vb) / 2);
      const signChange = (va < 0 && vb > 0) || (va > 0 && vb < 0);
      const spike = Math.abs(vm) > Math.max(Math.abs(va), Math.abs(vb), 1) * 4;
      return jump > visibleSpan * 3 && deviation > visibleSpan * 1.5 && (signChange || spike);
    };
    const walk = (a, va, b, vb, depth) => {
      if (count >= MAX_ADAPTIVE_EVALUATIONS) { add(b, null); return; }
      const m = (a + b) / 2, vm = f(m); count++;
      if (va === null && vm === null && vb === null) { add(b, null); return; }
      if (va === null && vm === null) { add(m, null); walk(m, vm, b, vb, depth + 1); return; }
      if (vm === null && vb === null) { add(m, null); add(b, null); return; }
      const span = Math.abs(b - a), jump = discontinuous(a, va, m, vm, b, vb);
      if (depth < 12 && (jump || depth < 1) && span > (xRange[1] - xRange[0]) / 8192 && count < MAX_ADAPTIVE_EVALUATIONS) {
        walk(a, va, m, vm, depth + 1); walk(m, vm, b, vb, depth + 1);
      } else if (jump) add(b, null);
      else add(b, vb);
    };
    const steps = BASE_FUNCTION_SEGMENTS, first = f(xRange[0]); add(xRange[0], first);
    for (let i = 0; i < steps; i++) { const a = xRange[0] + (xRange[1] - xRange[0]) * i / steps, b = xRange[0] + (xRange[1] - xRange[0]) * (i + 1) / steps; walk(a, i ? f(a) : first, b, f(b), 0); }
    return { x: xs, y: ys };
  }

  function sampleSurface(series, doc) {
    const domainX = range(series.domain && { min: series.domain.x && series.domain.x[0], max: series.domain.x && series.domain.x[1] }, [-10, 10]);
    const domainY = range(series.domain && { min: series.domain.y && series.domain.y[0], max: series.domain.y && series.domain.y[1] }, [-10, 10]);
    const xr = intersect(domainX, range(doc.axes && doc.axes.x, domainX));
    const yr = intersect(domainY, range(doc.axes && doc.axes.y, domainY));
    if (!xr || !yr) return { x: [], y: [], z: [] };
    const compiled = expression(series.expression, ['x', 'y'], doc), base = params(doc);
    const n = MAX_SURFACE_CELLS, x = [], y = [], z = [];
    for (let i = 0; i <= n; i++) x.push(xr[0] + (xr[1] - xr[0]) * i / n);
    for (let j = 0; j <= n; j++) { const row = []; y.push(yr[0] + (yr[1] - yr[0]) * j / n); for (let i = 0; i <= n; i++) row.push(valueOf(compiled, Object.assign({}, base, { x: x[i], y: y[j] }))); z.push(row); }
    const zRange = range(doc.axes && doc.axes.z, [-10, 10]);
    const zSpan = Math.max(Math.abs(zRange[1] - zRange[0]), 1);
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) {
      const corners = [z[j][i], z[j][i + 1], z[j + 1][i], z[j + 1][i + 1]];
      const center = valueOf(compiled, Object.assign({}, base, { x: (x[i] + x[i + 1]) / 2, y: (y[j] + y[j + 1]) / 2 }));
      if (corners.some((v) => v === null) || center === null) continue;
      const average = corners.reduce((sum, v) => sum + v, 0) / 4;
      const signs = new Set(corners.map((v) => Math.sign(v)).filter(Boolean));
      const spike = Math.abs(center) > Math.max(1, ...corners.map(Math.abs)) * 4;
      if (Math.abs(center - average) > zSpan * 1.5 && (signs.size > 1 || spike)) {
        z[j][i] = z[j][i + 1] = z[j + 1][i] = z[j + 1][i + 1] = null;
      }
    }
    return { x, y, z };
  }

  function traceFor(series, doc, warnings) {
    const st = style(series.style), name = esc(series.name || series.expression || '系列');
    const sampler = { implicit: 'sampleImplicit', parametric: 'sampleParametric', polar: 'samplePolar' }[series.kind];
    if (sampler) {
      const p = root.GraphCurves[sampler](series, doc);
      for (const warning of p.warnings || []) warnings.push((series.name || '曲線') + '：' + warning);
      return { type: 'scatter', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: p.x, y: p.y, name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color }, connectgaps: false };
    }
    if (series.kind === 'function') { const p = sampleFunction(series, doc); return { type: 'scatter', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: p.x, y: p.y, name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color }, connectgaps: false }; }
    if (series.kind === 'surface') { const p = sampleSurface(series, doc); return { type: 'surface', x: p.x, y: p.y, z: p.z, name, showlegend: doc.legend !== false, showscale: false, opacity: st.opacity, colorscale: [[0, st.color], [1, st.color]] }; }
    const rows = (series.rows || []).filter((r) => Array.isArray(r));
    const is3 = series.kind === 'data3d';
    const vals = (n) => rows.map((r) => r.every(finite) ? r[n] : null);
    return is3 ? { type: 'scatter3d', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: vals(0), y: vals(1), z: vals(2), name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color, size: 4 }, connectgaps: false } : { type: 'scatter', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: vals(0), y: vals(1), name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color }, connectgaps: false };
  }

  function annotationTraces(annotation, doc, warnings) {
    const result = root.GraphAnnotations.evaluate(annotation, doc);
    if (result.warning) warnings.push((annotation.name || '点・補助線') + '：' + result.warning);
    const st = annotation.style, traces = [], meta = { objectType: 'annotation', objectId: annotation.id };
    const common = { type: 'scatter', name: esc(annotation.name), opacity: st.opacity, meta, legendgroup: annotation.id, connectgaps: false };
    if (result.segments.length) {
      const x = [], y = [];
      for (const segment of result.segments) { for (const p of segment) { x.push(p[0]); y.push(p[1]); } x.push(null); y.push(null); }
      traces.push(Object.assign({}, common, { x, y, mode: 'lines', showlegend: !result.points.length, line: { color: st.color, width: st.width, dash: st.dash } }));
    }
    if (result.points.length) traces.push(Object.assign({}, common, { x: result.points.map(p => p[0]), y: result.points.map(p => p[1]), mode: 'markers+text', text: result.points.map((_, i) => esc(annotation.name + (result.points.length > 1 ? ' ' + (i + 1) : ''))), textposition: 'top right', marker: { color: st.color, size: 9, symbol: 'circle' }, hovertemplate: '%{x:.8g}, %{y:.8g}<extra>' + esc(annotation.name) + '</extra>' }));
    return traces;
  }

  function layoutFor(doc, options) {
    const dark = !!options.dark, fg = dark ? '#e5e7eb' : '#172033', bg = dark ? '#111827' : '#ffffff';
    const common = { paper_bgcolor: bg, plot_bgcolor: bg, font: { color: fg }, showlegend: doc.legend !== false, legend: { itemclick: false, itemdoubleclick: false }, margin: { l: 64, r: 24, t: 28, b: 56 }, hovermode: 'closest' };
    if (doc.mode === '3d') return Object.assign(common, { dragmode: 'orbit', scene: { xaxis: Object.assign(tick(doc.axes && doc.axes.x), { title: { text: axisTitle(doc.axes && doc.axes.x, 'x') }, showgrid: doc.grid !== false }), yaxis: Object.assign(tick(doc.axes && doc.axes.y), { title: { text: axisTitle(doc.axes && doc.axes.y, 'y') }, showgrid: doc.grid !== false }), zaxis: Object.assign(tick(doc.axes && doc.axes.z), { title: { text: axisTitle(doc.axes && doc.axes.z, 'z') }, showgrid: doc.grid !== false }), aspectmode: doc.equalScale ? 'data' : 'auto', camera: options.camera || defaultCamera(doc) } });
    return Object.assign(common, { dragmode: 'pan',
      xaxis: Object.assign(tick(doc.axes && doc.axes.x), { title: { text: axisTitle(doc.axes && doc.axes.x, 'x') }, showgrid: doc.grid !== false }),
      yaxis: Object.assign(tick(doc.axes && doc.axes.y), { title: { text: axisTitle(doc.axes && doc.axes.y, 'y') }, showgrid: doc.grid !== false, scaleanchor: doc.equalScale ? 'x' : undefined, scaleratio: doc.equalScale ? 1 : undefined })
    });
  }

  function viewFrom(event, doc) {
    const axes = {};
    let changed = false;
    [['x', 'xaxis'], ['y', 'yaxis'], ['z', 'zaxis']].forEach(([name, key]) => {
      const r = event[key + '.range'] || [event[key + '.range[0]'], event[key + '.range[1]']];
      if (finite(r[0]) && finite(r[1])) {
        const isLog = doc.axes && doc.axes[name] && doc.axes[name].scale === 'log';
        axes[name] = { min: isLog ? Math.pow(10, r[0]) : r[0], max: isLog ? Math.pow(10, r[1]) : r[1] }; changed = true;
      }
    });
    const camera = event['scene.camera'];
    if (camera !== undefined) changed = true;
    return changed ? { axes, camera } : null;
  }

  function selectionMeta(element, event, traces) {
    const point = event && event.points && event.points[0];
    let meta = point && traces[point.curveNumber] && traces[point.curveNumber].meta;
    // Plotly's nearest-curve hit can win over a marker directly on that curve.
    // Use the fixed bundled Plotly axis converters to prioritize visible annotation markers.
    const mouse = event && event.event, layout = element._fullLayout;
    if (mouse && finite(mouse.clientX) && finite(mouse.clientY) && layout && layout.xaxis && layout.yaxis) {
      const xa = layout.xaxis, ya = layout.yaxis, box = element.getBoundingClientRect();
      if (typeof xa.d2p === 'function' && typeof ya.d2p === 'function') {
        let nearest = 11;
        for (const trace of traces) if (trace.meta.objectType === 'annotation' && (trace.mode || '').includes('markers')) {
          for (let i = 0; i < trace.x.length; i++) {
            const x = xa.d2p(trace.x[i]), y = ya.d2p(trace.y[i]);
            if (!finite(x) || !finite(y) || x < 0 || y < 0 || x > xa._length || y > ya._length) continue;
            const distance = Math.hypot(box.left + xa._offset + x - mouse.clientX, box.top + ya._offset + y - mouse.clientY);
            if (distance < nearest) { nearest = distance; meta = trace.meta; }
          }
        }
      }
    }
    return meta;
  }

  async function render(element, doc, options) {
    options = options || {};
    const P = plotly(); if (!P || !element) throw new Error('Plotly を読み込めません。');
    const warnings = [], traces = [];
    for (const s of doc.series || []) {
      if (s.visible === false || (doc.mode === '3d' ? !['surface', 'data3d'].includes(s.kind) : ['surface', 'data3d'].includes(s.kind))) continue;
      const trace = traceFor(s, doc, warnings); trace.meta = { objectType: 'series', objectId: s.id }; traces.push(trace);
    }
    if (doc.mode !== '3d') for (const a of doc.annotations || []) if (a.visible !== false) {
      try { traces.push(...annotationTraces(a, doc, warnings)); } catch (error) { warnings.push((a.name || '点・補助線') + '：' + error.message); }
    }
    const state = states.get(element) || {}; const camera = options.camera || state.camera;
    if (typeof element.removeAllListeners === 'function') { element.removeAllListeners('plotly_click'); element.removeAllListeners('plotly_relayout'); }
    const layout = Object.assign(layoutFor(doc, Object.assign({}, options, { camera })), { autosize: true, width: element.clientWidth || 640, height: element.clientHeight || 480 });
    await P.react(element, traces, layout, { displayModeBar: false, responsive: true, scrollZoom: true });
    const live = { doc, camera: (element.layout && element.layout.scene && element.layout.scene.camera) || camera, options }; states.set(element, live);
    if (typeof element.on === 'function') {
      element.on('plotly_click', (event) => { const meta = selectionMeta(element, event, traces); if (!meta) return; const callback = meta.objectType === 'annotation' ? options.onAnnotationSelect : options.onSelect; if (typeof callback === 'function') callback(meta.objectId); });
      element.on('plotly_relayout', (event) => { const view = viewFrom(event || {}, doc); if (!view) return; if (view.camera) live.camera = view.camera; if (typeof options.onViewChange === 'function') options.onViewChange(view); });
    }
    return { warnings: [...new Set(warnings)] };
  }
  function resetView(element, doc) { const P = plotly(); if (!P || !element) return Promise.resolve(); const layout = layoutFor(doc, Object.assign({}, states.get(element) && states.get(element).options, { camera: undefined })); const state = states.get(element); if (state) state.camera = undefined; return P.relayout(element, layout); }
  function resize(element) { const P = plotly(); return P && P.Plots && element ? P.Plots.resize(element) : undefined; }
  async function exportImage(element, options) {
    options = options || {}; const P = plotly(), state = states.get(element); if (!P || !state) throw new Error('グラフを描画してから書き出してください。');
    if (options.format === 'svg' && state.doc.mode === '3d') throw new Error('3D グラフは SVG で書き出せません。PNG を選んでください。');
    const host = element.ownerDocument.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + Math.max(element.clientWidth || 640, 320) + 'px;height:' + Math.max(element.clientHeight || 480, 240) + 'px;'; element.ownerDocument.body.appendChild(host);
    const data = (element.data || []).map((x) => JSON.parse(JSON.stringify(x))); const layout = JSON.parse(JSON.stringify(element.layout || layoutFor(state.doc, state.options)));
    const transparent = options.background === 'transparent', bg = transparent ? 'rgba(0,0,0,0)' : '#ffffff', fg = '#172033', grid = '#cbd5e1';
    layout.paper_bgcolor = bg; layout.plot_bgcolor = bg; layout.font = Object.assign({}, layout.font, { color: fg });
    ['xaxis', 'yaxis'].forEach((key) => { if (layout[key]) { layout[key].color = fg; layout[key].gridcolor = grid; layout[key].zerolinecolor = grid; layout[key].title = Object.assign({}, layout[key].title, { font: Object.assign({}, layout[key].title && layout[key].title.font, { color: fg }) }); } });
    if (layout.scene) { layout.scene.bgcolor = bg; layout.scene.camera = state.camera || layout.scene.camera; ['xaxis', 'yaxis', 'zaxis'].forEach((key) => { const axis = layout.scene[key]; if (axis) { axis.color = fg; axis.gridcolor = grid; axis.zerolinecolor = grid; axis.backgroundcolor = bg; axis.title = Object.assign({}, axis.title, { font: Object.assign({}, axis.title && axis.title.font, { color: fg }) }); } }); }
    try { await P.newPlot(host, data, layout, { displayModeBar: false }); return await P.toImage(host, { format: options.format || 'png', scale: options.scale || 2 }); } finally { P.purge(host); host.remove(); }
  }
  return { sampleFunction, sampleSurface, render, resetView, resize, exportImage, escapeText: esc };
}));
