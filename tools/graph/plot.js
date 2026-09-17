/* global Plotly, GraphExpression, GraphCurves, GraphAnnotations, GraphSymbols */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphPlot = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Tables = typeof module === 'object' && module.exports ? require('./tables.js') : root.GraphTables;
  const states = new WeakMap();
  const MAX_FUNCTION_SAMPLES = 1600;
  const BASE_FUNCTION_SEGMENTS = 128;
  const MAX_ADAPTIVE_EVALUATIONS = MAX_FUNCTION_SAMPLES - BASE_FUNCTION_SEGMENTS;
  const MAX_SURFACE_CELLS = 70;
  const esc = (value) => String(value == null ? '' : value)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  const finite = (n) => typeof n === 'number' && Number.isFinite(n);
  // Coordinates remain numbers even when their source column is a date or a
  // category.  This keeps pan/zoom, annotations and exports on one stable
  // coordinate system; only the axis and hover text are specialised.
  const axisType = (doc, key) => ['date', 'category'].includes(doc?.axes?.[key]?.type) ? doc.axes[key].type : 'number';
  const typed2d = doc => doc?.mode === '2d' && (axisType(doc, 'x') !== 'number' || axisType(doc, 'y') !== 'number');
  const typedRegressionAllowed = doc => axisType(doc, 'x') === 'date' && axisType(doc, 'y') === 'number';
  const seriesAxisWarning = (series, doc) => {
    if (doc?.mode !== '2d') return '';
    if (series?.kind !== 'data2d') return typed2d(doc) ? '日付・カテゴリ軸では数式を表示できません。' : '';
    const table = series.dataTable, mapping = table?.mapping, types = table?.columnTypes || [];
    for (const key of ['x', 'y']) {
      const expected = axisType(doc, key), actual = types[mapping?.[key]] || 'number';
      if (actual !== expected) return key + '軸の型と割り当てた列の型が一致しません。';
    }
    return '';
  };
  const seriesAxisCompatible = (series, doc) => !seriesAxisWarning(series, doc);
  const utcDayText = value => {
    if (!finite(value)) return '';
    const d = new Date(Math.round(value) * 86400000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };
  const displayCoordinate = (doc, key, value) => {
    const type = axisType(doc, key), axis = doc?.axes?.[key] || {};
    if (type === 'date') return utcDayText(value);
    if (type === 'category') return Array.isArray(axis.categories) && typeof axis.categories[Math.round(value)] === 'string' ? axis.categories[Math.round(value)] : '';
    return root.GraphSymbols?.formatTick?.(value, axis.ticks?.format || 'auto') || String(value);
  };
  const typedTicks = (axis) => {
    const type = axis?.type;
    if (type === 'category') {
      const categories = Array.isArray(axis.categories) ? axis.categories : [], bounds = range(axis, [0, Math.max(1, categories.length - 1)]);
      const shown = categories.map((_, i) => i).filter(i => i >= Math.ceil(bounds[0]) && i <= Math.floor(bounds[1])),stride=Math.max(1,Math.ceil(shown.length/30)),vals=shown.filter((_,i)=>i%stride===0);
      return { tickmode: 'array', tickvals: vals, ticktext: vals.map(i => categories[i]) };
    }
    if (type !== 'date') return null;
    const bounds = range(axis, [-10, 10]), vals = Tables.dateTicks(bounds[0],bounds[1]);
    return { tickmode: 'array', tickvals: vals, ticktext: vals.map(utcDayText) };
  };
  const rich = text => root.GraphSymbols ? root.GraphSymbols.richText(text) : esc(text);
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
  const axisTitle = (a, fallback) => rich((a && a.label) || (a && a.symbol) || fallback) + ((a && a.unit) ? ' (' + rich(a.unit) + ')' : '');
  const tick = (a) => {
    const dataRange = range(a, [-10, 10]), isLog = a && a.scale === 'log';
    const specialised = typedTicks(a);
    return Object.assign({ title: { text: axisTitle(a, '') }, range: isLog ? dataRange.map((v) => Math.log10(v)) : dataRange, type: isLog ? 'log' : 'linear', showgrid: true, zeroline: a?.type === 'number' || !a?.type }, isLog ? { exponentformat: 'power', showexponent: 'all' } : {}, specialised || (root.GraphSymbols ? root.GraphSymbols.ticksFor(a) : {}));
  };
  const presentation = (doc) => Object.assign({ axisArrows: false, originLabel: false, tickMarks: true, tickLabels: true }, doc && doc.presentation || {});
  const axisUsesInternalLabels = (doc, key) => {
    if (!doc || doc.mode === '3d' || axisType(doc, key) !== 'number' || doc.axes?.[key]?.labelPosition !== 'axis') return false;
    const other = doc.axes[key === 'x' ? 'y' : 'x'];
    const bounds = range(other, [-10, 10]);
    return other?.scale !== 'log' && bounds[0] <= 0 && bounds[1] >= 0;
  };
  const automaticTickStep = (span) => {
    const exponent = Math.floor(Math.log10(span / 8)), fraction = span / 8 / Math.pow(10, exponent);
    return (fraction <= 1 ? 1 : fraction <= 2 ? 2 : fraction <= 5 ? 5 : 10) * Math.pow(10, exponent);
  };
  const evenlySpaced = (values, maximum) => {
    if (values.length <= maximum) return values;
    return Array.from({ length: maximum }, (_, index) => values[Math.round(index * (values.length - 1) / (maximum - 1))]);
  };
  const logLabelTicks = (bounds, format) => {
    const firstExponent = Math.floor(Math.log10(bounds[0])), lastExponent = Math.ceil(Math.log10(bounds[1]));
    const powers = [], addPower = value => { if (value >= bounds[0] && value <= bounds[1] && !powers.includes(value)) powers.push(value); };
    for (let exponent = firstExponent; exponent <= lastExponent; exponent++) addPower(Math.pow(10, exponent));
    if (powers.length >= 3) return evenlySpaced(powers.sort((a, b) => a - b), 6).map(value => ({ value, text: root.GraphSymbols?.formatTick?.(value, format) || String(value) }));
    const values = [], add = value => { if (value >= bounds[0] && value <= bounds[1] && !values.includes(value)) values.push(value); };
    for (let exponent = firstExponent; exponent <= lastExponent; exponent++) for (const factor of [1, 2, 5]) add(factor * Math.pow(10, exponent));
    // A range contained within a single decade (for example 2–8) needs more
    // than its two conventional 2/5 ticks to remain readable on the axis.
    if (values.length < 3) for (let exponent = firstExponent; exponent <= lastExponent; exponent++) for (let factor = 1; factor <= 9; factor++) add(factor * Math.pow(10, exponent));
    if (values.length < 3) {
      const step = automaticTickStep(bounds[1] - bounds[0]), first = Math.ceil(bounds[0] / step - 1e-12), last = Math.floor(bounds[1] / step + 1e-12), count = Math.max(0, Math.min(200, last - first + 1));
      for (let offset = 0; offset < count; offset++) add(Number((step * (first + offset)).toPrecision(14)));
      if (!values.length) for (let index = 0; index < 5; index++) add(Number(Math.pow(10, Math.log10(bounds[0]) + (Math.log10(bounds[1]) - Math.log10(bounds[0])) * index / 4).toPrecision(14)));
    }
    return evenlySpaced(values.sort((a, b) => a - b), 6).map(value => ({ value, text: root.GraphSymbols?.formatTick?.(value, format) || String(value) }));
  };
  const labelTicks = (axis) => {
    const specified = root.GraphSymbols?.ticksFor?.(axis);
    if (specified?.tickvals?.length) return specified.tickvals.map((value, index) => ({ value, text: specified.ticktext[index] }));
    const bounds = range(axis, [-10, 10]), format = axis?.ticks?.format || 'auto';
    if (axis?.scale === 'log') {
      return logLabelTicks(bounds, format);
    }
    const step = automaticTickStep(bounds[1] - bounds[0]);
    if (!finite(step) || step <= 0) return [];
    const first = Math.ceil(bounds[0] / step - 1e-12), last = Math.floor(bounds[1] / step + 1e-12), stride = Math.max(1, Math.ceil((last - first + 1) / 200)), count = Math.max(0, Math.min(200, Math.floor((last - first) / stride) + 1)), out = [];
    for (let offset = 0; offset < count; offset++) { const value = Number((step * (first + offset * stride)).toPrecision(14)); if (!out.length || out.at(-1).value !== value) out.push({ value, text: root.GraphSymbols?.formatTick?.(value, format) || String(value) }); }
    return out;
  };
  const axisLabelTickLayout = (axis) => {
    const values = labelTicks(axis);
    return { tickmode: 'array', tickvals: values.map(item => item.value), ticktext: values.map(item => item.text) };
  };
  const axisTickDecorations = (doc, color) => {
    if (doc.mode === '3d' || !presentation(doc).tickLabels) return [];
    const xOnAxis = axisUsesInternalLabels(doc, 'x'), yOnAxis = axisUsesInternalLabels(doc, 'y'), originShown = presentation(doc).originLabel && xOnAxis && yOnAxis;
    const out = [];
    for (const key of ['x', 'y']) {
      if (!axisUsesInternalLabels(doc, key)) continue;
      const axis = doc.axes[key];
      for (const tickValue of labelTicks(axis)) {
        if (!finite(tickValue.value) || !tickValue.text || (tickValue.value === 0 && (originShown || (key === 'x' && yOnAxis)))) continue;
        const point = key === 'x' ? annotationPosition([tickValue.value, 0], doc) : annotationPosition([0, tickValue.value], doc);
        if (!point) continue;
        out.push({ name: '__graph_axis_tick_' + key + '_' + out.length, x: point[0], y: point[1], xref: 'x', yref: 'y', text: esc(tickValue.text), showarrow: false, captureevents: false, font: { size: 12, color }, xanchor: key === 'x' ? 'center' : 'right', yanchor: key === 'x' ? 'top' : 'middle', xshift: key === 'x' ? 0 : -6, yshift: key === 'x' ? -6 : 0, meta: { decoration: true, axisTick: key } });
      }
    }
    return out;
  };
  const outputDefaults = (doc, element) => {
    const configured = doc && doc.output && typeof doc.output === 'object' ? doc.output : null;
    return Object.assign({
      width: element && element.clientWidth || 640,
      height: element && element.clientHeight || 480,
      margin: 64,
      fontSize: 16,
      scale: 2,
      background: 'white',
      title: true
    }, configured || {});
  };
  const validateOutput = (value) => {
    const out = Object.assign({}, value);
    const integer = (n) => Number.isInteger(n);
    if (!integer(out.width) || out.width < 320 || out.width > 4096) throw new Error('書き出し幅は320〜4096pxで指定してください。');
    if (!integer(out.height) || out.height < 320 || out.height > 4096) throw new Error('書き出し高さは320〜4096pxで指定してください。');
    if (out.width * out.height > 16777216) throw new Error('書き出し面積が上限を超えています。');
    if (!integer(out.margin) || out.margin < 16 || out.margin > 200 || out.width - out.margin * 2 < 100 || out.height - out.margin * 2 < 100) throw new Error('書き出し余白が不正です。');
    if (!integer(out.fontSize) || out.fontSize < 8 || out.fontSize > 36) throw new Error('書き出し文字サイズは8〜36pxで指定してください。');
    if (!integer(out.scale) || out.scale < 1 || out.scale > 4) throw new Error('書き出し倍率は1〜4で指定してください。');
    if (out.width * out.scale > 8192 || out.height * out.scale > 8192 || out.width * out.height * out.scale * out.scale > 33554432) throw new Error('書き出し画像のサイズが上限を超えています。');
    return out;
  };
  const axisDecoration = (doc, key, axis, color) => {
    if (!presentation(doc).axisArrows || doc.mode === '3d' || axisType(doc, key) !== 'number') return null;
    const other = doc.axes[key === 'x' ? 'y' : 'x'], bounds = range(other, [-10,10]);
    const fraction = other.scale !== 'log' && bounds[0] <= 0 && bounds[1] >= 0 ? -bounds[0]/(bounds[1]-bounds[0]) : 0;
    // Paper coordinates keep arrows on the viewport edge on both linear and log axes.
    return {name:'__graph_axis_'+key,text:'',xref:'paper',yref:'paper',axref:'pixel',ayref:'pixel',
      x:key==='x'?1:fraction,y:key==='x'?fraction:1,ax:key==='x'?-20:0,ay:key==='x'?0:20,
      showarrow:true,arrowhead:2,arrowsize:1,arrowwidth:1.5,arrowcolor:color,captureevents:false};
  };
  const axisDecorations = (doc, fg) => {
    if (doc.mode === '3d') return [];
    const p = presentation(doc), out = [];
    const x = doc.axes && doc.axes.x, y = doc.axes && doc.axes.y;
    const xa = axisDecoration(doc, 'x', x, fg), ya = axisDecoration(doc, 'y', y, fg);
    if (xa) out.push(xa); if (ya) out.push(ya);
    if (p.originLabel && x && y && axisType(doc, 'x') === 'number' && axisType(doc, 'y') === 'number' && x.scale !== 'log' && y.scale !== 'log' && x.min <= 0 && x.max >= 0 && y.min <= 0 && y.max >= 0) {
      out.push({ name: '__graph_origin_label', x: 0, y: 0, xref: 'x', yref: 'y', text: 'O', showarrow: false, xshift: 7, yshift: -7, xanchor: 'left', yanchor: 'top', font: { size: 13, color: fg }, captureevents: false, meta: { decoration: true, origin: true } });
    }
    return out;
  };
  // Plotly annotations use log10 coordinates when their reference axis is logarithmic,
  // whereas scatter traces continue to receive the original data values.
  const annotationCoordinate = (value, axis) => axis && axis.scale === 'log' ? finite(value) && value > 0 ? Math.log10(value) : null : value;
  const annotationPosition = (point, doc) => {
    const out = [annotationCoordinate(point[0], doc.axes && doc.axes.x), annotationCoordinate(point[1], doc.axes && doc.axes.y)];
    return out.every(finite) ? out : null;
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
    const compatibilityWarning = seriesAxisWarning(series, doc);
    if (compatibilityWarning) {
      warnings.push((series.name || '系列') + '：' + compatibilityWarning);
      return null;
    }
    const st = style(series.style), name = rich(series.name || (root.GraphSymbols ? root.GraphSymbols.toDisplay(series.expression,doc,series.kind) : series.expression) || '系列');
    const sampler = { implicit: 'sampleImplicit', parametric: 'sampleParametric', polar: 'samplePolar' }[series.kind];
    if (sampler) {
      const p = root.GraphCurves[sampler](series, doc);
      for (const warning of p.warnings || []) warnings.push((series.name || '曲線') + '：' + warning);
      return { type: 'scatter', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: p.x, y: p.y, name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color }, connectgaps: false };
    }
    if (series.kind === 'function') { const p = sampleFunction(series, doc); return { type: 'scatter', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: p.x, y: p.y, name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color }, connectgaps: false }; }
    if (series.kind === 'surface') { const p = sampleSurface(series, doc); return { type: 'surface', x: p.x, y: p.y, z: p.z, name, showlegend: doc.legend !== false, showscale: false, opacity: st.opacity, colorscale: [[0, st.color], [1, st.color]] }; }
    const rows = (series.rows || []).map(r => Array.isArray(r) ? r : []);
    const is3 = series.kind === 'data3d';
    const vals = (n) => rows.map((r) => r.every(finite) ? r[n] : null);
    if (is3) return { type: 'scatter3d', mode: st.lines && st.points ? 'lines+markers' : st.points ? 'markers' : 'lines', x: vals(0), y: vals(1), z: vals(2), name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color, size: 4 }, connectgaps: false };
    const excluded = new Set((series.excludedRows || []).filter(index => Number.isInteger(index) && index >= 0));
    const wantsInterpolation = axisType(doc, 'x') !== 'category' && axisType(doc, 'y') !== 'category' && series.interpolation === 'monotone' && st.lines && root.GraphDataCurves && typeof root.GraphDataCurves.interpolate === 'function';
    const points = wantsInterpolation ? root.GraphDataCurves.interpolate(rows, 'monotone') : { rows };
    if (points.warning) warnings.push((series.name || '数表') + '：' + points.warning);
    const valid = row => Array.isArray(row) && finite(row[0]) && finite(row[1]);
    const observedMode = points.warning ? 'markers' : wantsInterpolation ? (st.points || excluded.size ? 'markers' : 'none') : st.lines && (st.points || excluded.size) ? 'lines+markers' : st.points ? 'markers' : st.lines ? 'lines' : 'none';
    const labels = (series.dataTable && Array.isArray(series.dataTable.rows) && series.dataTable.mapping) ? series.dataTable.rows.map((row, index) => [index + 1, row?.[series.dataTable.mapping.x], row?.[series.dataTable.mapping.y]]) : rows.map((row, index) => [index + 1, displayCoordinate(doc, 'x', row[0]), displayCoordinate(doc, 'y', row[1])]);
    const hover = typed2d(doc) ? '元の行 %{customdata[0]}<br>' + esc(doc.axes.x.label || doc.axes.x.symbol || 'x') + '=%{customdata[1]}<br>' + esc(doc.axes.y.label || doc.axes.y.symbol || 'y') + '=%{customdata[2]}<extra>' + esc(series.name || '数表') + '</extra>' : undefined;
    const observed = { type: 'scatter', mode: observedMode, x: vals(0), y: vals(1), customdata: labels, name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, marker: { color: st.color, symbol: rows.map((_, index) => excluded.has(index) ? 'circle-open' : 'circle') }, legendgroup: series.id, connectgaps: false, showlegend: !wantsInterpolation || !!points.warning, meta: { objectType: 'series', objectId: series.id, dataRows: true, seriesId: series.id }, ...(hover ? { hovertemplate: hover } : {}) };
    const renderedRows = points.rows || rows;
    const trace = { type: 'scatter', mode: 'lines', x: renderedRows.map(r => valid(r) ? r[0] : null), y: renderedRows.map(r => valid(r) ? r[1] : null), name, opacity: st.opacity, line: { color: st.color, width: st.width, dash: st.dash }, legendgroup: series.id, connectgaps: false, showlegend: true, meta: { objectType: 'series', objectId: series.id } };
    const bars = series.errorBars || {}, addBars = (key, axisKey) => {
      const values = Array.isArray(bars[key]) && bars[key].length === rows.length ? bars[key] : null;
      if (!values) return;
      const axis = doc.axes && doc.axes[axisKey], log = axis && axis.scale === 'log', array = rows.map((row, i) => {
        const width = values[i], coordinate = row && row[axisKey === 'x' ? 0 : 1];
        if (!finite(width) || width < 0 || !finite(coordinate) || log && coordinate - width <= 0) { if (log && finite(width) && finite(coordinate) && coordinate - width <= 0) warnings.push((series.name || '数表') + '：対数軸の非正値に届く誤差棒を省略しました。'); return null; }
        return width;
      });
      observed['error_' + key] = { type: 'data', array, visible: true, symmetric: true, thickness: 1.2, width: 4, color: st.color };
    };
    if (axisType(doc, 'x') !== 'category') addBars('x', 'x');
    if (axisType(doc, 'y') !== 'category') addBars('y', 'y');
    if (wantsInterpolation && !points.warning && points.rows && points.rows.length >= 2) return [observed, trace];
    observed.showlegend=true;
    return observedMode === 'none' && !st.lines ? Object.assign(observed, { showlegend: true }) : observed;
  }

  function annotationTraces(annotation, doc, warnings, decorations) {
    const result = root.GraphAnnotations.evaluate(annotation, doc);
    if (result.warning) warnings.push((annotation.name || '点・補助線') + '：' + result.warning);
    const st = annotation.style, traces = [], meta = { objectType: 'annotation', objectId: annotation.id };
    if (annotation.kind === 'region' || annotation.kind === 'curveRegion') {
      // 領域の輪郭は参照した線分の描画に任せ、ここでは面だけを描く。
      const polygons = annotation.kind === 'curveRegion' ? result.polygons : [result.polygon];
      const drawable = Array.isArray(polygons) && polygons.some(polygon => Array.isArray(polygon) && polygon.length >= 3) && !result.warning;
      if (drawable) {
        for (const polygon of polygons) if (Array.isArray(polygon) && polygon.length >= 3) traces.push({ type: 'scatter', mode: 'lines', x: polygon.map(p => p[0]), y: polygon.map(p => p[1]), fill: 'toself', fillcolor: st.color, line: { color: 'rgba(0,0,0,0)', width: 0 }, opacity: st.opacity, name: rich(annotation.name), meta, legendgroup: annotation.id, showlegend: false, hoveron: 'fills', connectgaps: false });
      }
      if (!result.warning) {
        const label = annotation.label || { visible: true, dx: 12, dy: -12, size: 13 };
        const lines = [];
        if (label.visible) lines.push(annotation.name);
        if (annotation.showArea && finite(result.area) && root.GraphRegions && typeof root.GraphRegions.areaText === 'function') lines.push(root.GraphRegions.areaText(result.area, doc));
        if (annotation.kind === 'curveRegion' && annotation.showIntegral && finite(result.integral) && root.GraphRegions && typeof root.GraphRegions.integralText === 'function') lines.push(root.GraphRegions.integralText(result.integral, doc));
        if (lines.length && Array.isArray(result.labelPoint)) { const point = annotationPosition(result.labelPoint, doc); if (point) decorations.push({ name: annotation.id, x: point[0], y: point[1], xref: 'x', yref: 'y', text: lines.map(rich).join('<br>'), showarrow: false, xanchor: 'left', yanchor: 'bottom', xshift: label.dx, yshift: -label.dy, font: { size: label.size }, opacity: 1, captureevents: true }); }
      }
      return traces;
    }
    const common = { type: 'scatter', name: rich(annotation.name), opacity: st.opacity, meta, legendgroup: annotation.id, connectgaps: false };
    if (result.segments.length) {
      const x = [], y = [];
      for (const segment of result.segments) { for (const p of segment) { x.push(p[0]); y.push(p[1]); } x.push(null); y.push(null); }
      traces.push(Object.assign({}, common, { x, y, mode: 'lines', showlegend: !result.points.length, line: { color: st.color, width: st.width, dash: st.dash } }));
    }
    if (result.points.length && annotation.kind !== 'text') traces.push(Object.assign({}, common, { x: result.points.map(p => p[0]), y: result.points.map(p => p[1]), mode: 'markers', marker: { color: st.color, size: 9, symbol: 'circle' }, hovertemplate: esc(doc.axes.x.symbol || 'x') + ' = %{x:.8g}<br>' + esc(doc.axes.y.symbol || 'y') + ' = %{y:.8g}<extra>' + esc(annotation.name) + '</extra>' }));
    const label = annotation.label || {visible:true,dx:12,dy:-12,size:13};
    const positions = Array.isArray(result.labelPoint) ? [result.labelPoint] : result.points.length ? result.points : result.segments.length ? [result.segments[0][0].map((v,i)=>(v+result.segments[0][1][i])/2)] : [];
    const equation = annotation.kind==='tangent'&&annotation.showEquation ? root.GraphAnnotations.tangentEquation(annotation,doc).text : annotation.kind==='regression'&&annotation.showEquation&&result.fit&&root.GraphAnalysis&&typeof root.GraphAnalysis.equation==='function' ? root.GraphAnalysis.equation(result.fit, doc.axes?.x?.symbol || 'x', doc.axes?.y?.symbol || 'y') : '';
    const metrics = annotation.kind==='regression'&&annotation.showMetrics&&result.fit&&finite(result.fit.r2) ? 'R² ≈ ' + Number(result.fit.r2.toPrecision(8)) : '';
    const typedRegressionNote = annotation.kind === 'regression' && typedRegressionAllowed(doc) ? '日付はUTC日数として回帰' : '';
    if (label.visible || equation || metrics) positions.forEach((point,i) => {
      const title=label.visible?rich(annotation.kind==='text'?annotation.text:annotation.name+(positions.length>1?' '+(i+1):'')):'';
      const position = annotationPosition(point, doc);
      if (!position) return;
      decorations.push({name:annotation.id,x:position[0],y:position[1],xref:'x',yref:'y',text:[title,equation?rich(equation):'',metrics?rich(metrics):'',typedRegressionNote].filter(Boolean).join('<br>'),showarrow:false,xanchor:'left',yanchor:'bottom',xshift:label.dx,yshift:-label.dy,font:annotation.kind==='text'?{size:label.size,color:st.color}:{size:label.size},opacity:st.opacity,captureevents:true});
    });
    if (annotation.kind === 'segment' && annotation.arrows !== 'none' && result.segments.length) {
      const [a,b]=result.segments[0];
      const head=(from,to)=>traces.push(Object.assign({},common,{x:[from[0],to[0]],y:[from[1],to[1]],mode:'markers',showlegend:false,hoverinfo:'skip',meta:{...meta,decoration:true},marker:{symbol:'arrow',angleref:'previous',size:[0,8+3*st.width],color:st.color}}));
      head(a,b);if(annotation.arrows==='both')head(b,a);
    }
    return traces;
  }

  function layoutFor(doc, options) {
    const dark = !!options.dark, fg = dark ? '#e5e7eb' : '#172033', bg = dark ? '#111827' : '#ffffff';
    const p = presentation(doc), common = { paper_bgcolor: bg, plot_bgcolor: bg, font: { color: fg }, showlegend: doc.legend !== false, legend: { itemclick: false, itemdoubleclick: false }, margin: { l: 64, r: 24, t: 28, b: 56 }, hovermode: 'closest' };
    if(options.compactLegend){Object.assign(common.legend,{orientation:'h',x:0,y:0,yref:'container',yanchor:'bottom'});common.margin.b=100;}
    const configure = (axis, name) => Object.assign(tick(axis), axisUsesInternalLabels(doc, name) ? axisLabelTickLayout(axis) : {}, {
      title: { text: axisTitle(axis, name) },
      ...(options.compactLegend && doc.mode!=='3d' ? {automargin:true} : {}),
      showgrid: doc.grid !== false,
      zerolinecolor: p.axisArrows ? fg : undefined, zerolinewidth: p.axisArrows ? 1.5 : 1,
      linecolor:fg, linewidth:1.5,
      ticks: p.tickMarks ? 'outside' : '',
      showticklabels: p.tickLabels && !axisUsesInternalLabels(doc, name),
      showline: doc.mode!=='3d'&&axisType(doc, name)==='number'&&p.axisArrows&&(doc.axes[name==='x'?'y':'x'].scale==='log'||doc.axes[name==='x'?'y':'x'].min>0||doc.axes[name==='x'?'y':'x'].max<0)
    });
    if (doc.mode === '3d') return Object.assign(common, { dragmode: 'orbit', scene: { xaxis: configure(doc.axes && doc.axes.x, 'x'), yaxis: configure(doc.axes && doc.axes.y, 'y'), zaxis: configure(doc.axes && doc.axes.z, 'z'), aspectmode: doc.equalScale ? 'data' : 'auto', camera: options.camera || defaultCamera(doc) } });
    return Object.assign(common, { dragmode: 'pan',
      xaxis: configure(doc.axes && doc.axes.x, 'x'),
      yaxis: Object.assign(configure(doc.axes && doc.axes.y, 'y'), { scaleanchor: doc.equalScale && !typed2d(doc) ? 'x' : undefined, scaleratio: doc.equalScale && !typed2d(doc) ? 1 : undefined })
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
    // Plotly may report the filled region before a line or marker at the same
    // location. Re-run the geometric hit test so visible boundaries retain
    // their selection priority.
    if (meta && (meta.kind === 'region' || meta.kind === 'curveRegion') && event && event.event) {
      const precise = traceMetaAt(element, traces, event.event);
      if (precise && precise !== meta) meta = precise;
    }
    // Plotly's nearest-curve hit can win over a marker directly on that curve.
    // Use the fixed bundled Plotly axis converters to prioritize visible annotation markers.
    const mouse = event && event.event, layout = element._fullLayout;
    if (mouse && finite(mouse.clientX) && finite(mouse.clientY) && layout && layout.xaxis && layout.yaxis) {
      const xa = layout.xaxis, ya = layout.yaxis, box = element.getBoundingClientRect();
      if (typeof xa.d2p === 'function' && typeof ya.d2p === 'function') {
        let nearest = 11;
        for (const trace of traces) if (trace.meta.objectType === 'annotation' && !trace.meta.decoration && (trace.mode || '').includes('markers')) {
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

  function traceMetaAt(element, traces, event) {
    const layout = element._fullLayout, box = element.getBoundingClientRect();
    if (!layout?.xaxis?.d2p || !layout?.yaxis?.d2p) return null;
    const px = event.clientX - box.left - layout.xaxis._offset, py = event.clientY - box.top - layout.yaxis._offset;
    if (px < 0 || py < 0 || px > layout.xaxis._length || py > layout.yaxis._length) return null;
    const distanceToSegment = (x, y, ax, ay, bx, by) => {
      const dx = bx - ax, dy = by - ay, length = dx * dx + dy * dy;
      const t = length ? Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / length)) : 0;
      return Math.hypot(x - (ax + t * dx), y - (ay + t * dy));
    };
    let regionMeta = null;
    for (const trace of traces) {
      if (!trace.meta || !Array.isArray(trace.x) || !Array.isArray(trace.y)) continue;
      if (trace.meta.objectType === 'annotation' && (trace.meta.kind === 'region' || trace.meta.kind === 'curveRegion') && trace.fill === 'toself') {
        const polygon = trace.x.map((value, i) => [layout.xaxis.d2p(value), layout.yaxis.d2p(trace.y[i])]).filter(p => finite(p[0]) && finite(p[1]));
        if (root.GraphRegions && typeof root.GraphRegions.containsPoint === 'function' && root.GraphRegions.containsPoint(polygon, [px, py])) regionMeta = trace.meta;
        continue;
      }
      let previous = null;
      for (let i = 0; i < trace.x.length; i++) {
        if (!finite(trace.x[i]) || !finite(trace.y[i])) { previous = null; continue; }
        const x = layout.xaxis.d2p(trace.x[i]), y = layout.yaxis.d2p(trace.y[i]);
        if (!finite(x) || !finite(y)) { previous = null; continue; }
        if ((trace.mode || '').includes('markers') && Math.hypot(px - x, py - y) <= 12) return trace.meta;
        if ((trace.mode || '').includes('lines') && previous && distanceToSegment(px, py, previous[0], previous[1], x, y) <= Math.max(7, (trace.line?.width || 1) / 2 + 5)) return trace.meta;
        previous = [x, y];
      }
    }
    return regionMeta;
  }
  const traceHit = (element, traces, event) => !!traceMetaAt(element, traces, event);

  function installBlankClick(element, callback, traces) {
    if (typeof callback !== 'function') return null;
    let pending = null, awaiting = null, timer = null, hoverMeta = null, hoverPoint = null, lastPointer = null, latestMode, latestCallback = callback, latestTraces = traces, latestOptions = null;
    const active = new Set();
    const interactive = target => !!target?.closest?.('.trace,.legend,.annotation,.xaxislayer-above,.yaxislayer-above,.xaxislayer-below,.yaxislayer-below,.g-gtitle,.hoverlayer,.modebar');
    const clearTimer = () => { if (timer !== null) { clearTimeout(timer); timer = null; } };
    const eligible = event => event.pointerType === 'touch' || event.button === 0;
    const down = event => {
      if (typeof latestCallback !== 'function' || !eligible(event)) return;
      if (pending) { if (event.pointerId !== pending.id) { active.add(event.pointerId); pending.multiple = true; } return; }
      active.add(event.pointerId);
      const meta = traceMetaAt(element, latestTraces, event) || (hoverPoint && Math.hypot(event.clientX-hoverPoint[0],event.clientY-hoverPoint[1])<=4 ? hoverMeta : null);
      pending = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, cancelled: false, multiple: active.size > 1, hit: interactive(event.target) || !!meta, meta, plotHit:false };
    };
    const move = event => {
      lastPointer = [event.clientX,event.clientY];
      if (hoverPoint && Math.hypot(event.clientX-hoverPoint[0],event.clientY-hoverPoint[1])>4) { hoverMeta = null;hoverPoint = null; }
      if (!pending || event.pointerId !== pending.id) return;
      if (Math.hypot(event.clientX - pending.x, event.clientY - pending.y) > 4) pending.moved = true;
    };
    const cancel = event => {
      active.delete(event.pointerId);
      if (pending && event.pointerId === pending.id) { pending.cancelled = true; pending = null; }
    };
    const up = event => {
      active.delete(event.pointerId);
      if (!pending || event.pointerId !== pending.id) return;
      const click = pending;
      if (Math.hypot(event.clientX - click.x, event.clientY - click.y) > 4) click.moved = true;
      click.meta = click.meta || traceMetaAt(element, latestTraces, event); click.hit = click.hit || !!click.meta;
      pending = null; awaiting = click;
      if (active.size) click.multiple = true;
      clearTimer();
      timer = setTimeout(() => {
        timer = null;
        if (awaiting === click && !click.moved && !click.multiple && !click.cancelled) {
          if (click.meta && !click.plotHit) { const select = click.meta.objectType === 'annotation' ? latestOptions?.onAnnotationSelect : latestOptions?.onSelect; if (typeof select === 'function') select(click.meta.objectId); }
          else if (!click.hit && typeof latestCallback === 'function') latestCallback();
        }
        if (awaiting === click) awaiting = null;
      }, 0);
    };
    const hit = () => { const click = pending || awaiting; if (click) { click.hit = true; click.plotHit = true; } };
    const hover = meta => { hoverMeta = latestMode==='3d' ? meta || null : null; hoverPoint = hoverMeta ? lastPointer : null; };
    const leave = () => hover(null);
    element.addEventListener('pointerdown', down, true);
    element.addEventListener('pointerleave', leave);
    const owner = element.ownerDocument;
    const outsideDown = event => { if (pending && eligible(event) && event.pointerId !== pending.id) { active.add(event.pointerId); pending.multiple = true; } };
    owner.addEventListener('pointerdown', outsideDown, true);
    owner.addEventListener('pointermove', move, true);
    owner.addEventListener('pointerup', up, true);
    owner.addEventListener('pointercancel', cancel, true);
    return { hit, hover, update: (nextCallback, nextTraces, nextOptions, nextMode) => { latestCallback = nextCallback; latestTraces = nextTraces; latestOptions = nextOptions; latestMode = nextMode; hoverMeta = null; hoverPoint = null;if(typeof nextCallback!=='function'){clearTimer();active.clear();pending=null;awaiting=null;} }, dispose: () => {
      clearTimer(); active.clear(); pending = null; awaiting = null;
      element.removeEventListener('pointerdown', down, true);
      element.removeEventListener('pointerleave', leave);
      owner.removeEventListener('pointerdown', outsideDown, true);
      owner.removeEventListener('pointermove', move, true);
      owner.removeEventListener('pointerup', up, true);
      owner.removeEventListener('pointercancel', cancel, true);
    } };
  }

  function actualPlotHit(element, event) {
    const point = event?.points?.[0], layout = element._fullLayout, mouse = event?.event;
    if (!point || !mouse || !layout?.xaxis?.d2p || !layout?.yaxis?.d2p) return !!point && !!layout?.scene;
    const box = element.getBoundingClientRect();
    const x = layout.xaxis.d2p(point.x), y = layout.yaxis.d2p(point.y);
    return finite(x) && finite(y) && Math.hypot(box.left + layout.xaxis._offset + x - mouse.clientX, box.top + layout.yaxis._offset + y - mouse.clientY) <= 24;
  }
  function rowFromClick(element, event) {
    const point = event?.points?.[0], meta = point?.data?.meta || point?.fullData?.meta;
    if (!point || !meta?.dataRows || meta.observationHighlight || !Array.isArray(point.customdata) || !Number.isInteger(point.customdata[0])) return null;
    const layout = element?._fullLayout, mouse = event?.event, box = element?.getBoundingClientRect?.();
    if (layout?.xaxis?.d2p && layout?.yaxis?.d2p && mouse && box) { const x = layout.xaxis.d2p(point.x), y = layout.yaxis.d2p(point.y); if (!finite(x) || !finite(y) || Math.hypot(box.left + layout.xaxis._offset + x - mouse.clientX, box.top + layout.yaxis._offset + y - mouse.clientY) > 14) return null; }
    return { seriesId: meta.seriesId || meta.objectId, rowIndex: point.customdata[0] - 1 };
  }
  function observationHighlight(series, selectedRow) {
    if (!selectedRow || selectedRow.seriesId !== series.id || !Number.isInteger(selectedRow.rowIndex)) return null;
    const row = (series.rows || [])[selectedRow.rowIndex];
    if (!Array.isArray(row) || !finite(row[0]) || !finite(row[1])) return null;
    return { type: 'scatter', mode: 'markers', x: [row[0]], y: [row[1]], hoverinfo: 'skip', showlegend: false, marker: { symbol: 'circle-open', size: 16, color: '#172033', line: { color: '#ffffff', width: 1 } }, meta: { observationHighlight: true, objectType: 'series', objectId: series.id } };
  }

  async function render(element, doc, options) {
    options = Object.assign({ compactLegend: !!element && element.clientWidth > 0 && element.clientWidth < 520 }, options || {});
    const P = plotly(); if (!P || !element) throw new Error('Plotly を読み込めません。');
    const warnings = [], traces = [], decorations=[];
    // 領域面はすべての系列・線分より背面へ置く。
    if (doc.mode !== '3d' && !typed2d(doc)) for (const a of doc.annotations || []) if (a.visible !== false && (a.kind === 'region' || a.kind === 'curveRegion')) {
      try { const region = annotationTraces(a, doc, warnings, decorations); for (const trace of region) { trace.meta = Object.assign({}, trace.meta, { kind: a.kind }); traces.push(trace); } } catch (error) { warnings.push((a.name || '領域') + '：' + error.message); }
    }
    for (const s of doc.series || []) {
      if (s.visible === false || (doc.mode === '3d' ? !['surface', 'data3d'].includes(s.kind) : ['surface', 'data3d'].includes(s.kind))) continue;
      if (s.dataTable?.formulas) {
        const warning = Tables.calculationWarning(s.dataTable);
        if (warning) warnings.push((s.name || '数表') + '：' + warning);
      }
      const produced = traceFor(s, doc, warnings);
      for (const trace of Array.isArray(produced) ? produced : [produced]) { if (!trace) continue; trace.meta = Object.assign({ objectType: 'series', objectId: s.id }, trace.meta || {}); traces.push(trace); }
      const highlight = doc.mode === '2d' && s.kind === 'data2d' && seriesAxisCompatible(s,doc) ? observationHighlight(s, options.selectedRow) : null; if (highlight) traces.push(highlight);
    }
    if (doc.mode !== '3d') for (const a of doc.annotations || []) if (a.visible !== false && a.kind !== 'region' && a.kind !== 'curveRegion') {
      if (a.kind === 'regression' && !seriesAxisCompatible(doc.series.find(s=>s.id===a.seriesId),doc)) { warnings.push((a.name || '回帰曲線') + '：回帰元の数表と軸の種類が一致しません。'); continue; }
      if (typed2d(doc) && !(a.kind === 'regression' && typedRegressionAllowed(doc))) { warnings.push((a.name || '点・補助線') + '：日付・カテゴリ軸ではこの注釈を表示できません。'); continue; }
      try { traces.push(...annotationTraces(a, doc, warnings, decorations)); } catch (error) { warnings.push((a.name || '点・補助線') + '：' + error.message); }
    }
    const state = states.get(element) || {}; const camera = options.camera || state.camera;
    if (typeof element.removeAllListeners === 'function') { element.removeAllListeners('plotly_click'); element.removeAllListeners('plotly_relayout'); element.removeAllListeners('plotly_clickannotation'); element.removeAllListeners('plotly_hover'); element.removeAllListeners('plotly_unhover'); }
    const baseLayout = layoutFor(doc, Object.assign({}, options, { camera }));
    const decorationColor = options.dark ? '#e5e7eb' : '#172033';
    const layout = Object.assign(baseLayout, { autosize: true, width: element.clientWidth || 640, height: element.clientHeight || 480, annotations: decorations.concat(axisDecorations(doc, decorationColor), axisTickDecorations(doc, decorationColor)) });
    await P.react(element, traces, layout, { displayModeBar: false, responsive: true, scrollZoom: true });
    const blank = state.blankCleanup || installBlankClick(element, options.onBlankClick, traces); blank?.update(options.onBlankClick, traces, options, doc.mode);
    const live = { doc, camera: (element.layout && element.layout.scene && element.layout.scene.camera) || camera, options, blankCleanup: blank }; states.set(element, live);
    if (typeof element.on === 'function') {
      element.on('plotly_click', (event) => { const hit = actualPlotHit(element, event) || traceHit(element, traces, event.event || {}); if (typeof options.onBlankClick === 'function' && !hit) return; blank?.hit(); const row = actualPlotHit(element, event) ? rowFromClick(element, event) : null; if (row && typeof options.onRowSelect === 'function') { options.onRowSelect(row); return; } const meta = selectionMeta(element, event, traces); if (!meta) return; const callback = meta.objectType === 'annotation' ? options.onAnnotationSelect : options.onSelect; if (typeof callback === 'function') callback(meta.objectId); });
      element.on('plotly_clickannotation',event=>{blank?.hit();const item=element.layout?.annotations?.[event.index];if(item&&doc.annotations?.some(a=>a.id===item.name)&&typeof options.onAnnotationSelect==='function')options.onAnnotationSelect(item.name);});
      element.on('plotly_hover', event => blank?.hover(selectionMeta(element, event, traces)));
      element.on('plotly_unhover', () => blank?.hover(null));
      element.on('plotly_relayout', (event) => { const view = viewFrom(event || {}, doc); if (!view) return; if (view.camera) live.camera = view.camera; if (typeof options.onViewChange === 'function') options.onViewChange(view); });
    }
    return { warnings: [...new Set(warnings)] };
  }
  function screenPoint(element,point) {
    const l=element._fullLayout;if(!l?.xaxis?.d2p||!l?.yaxis?.d2p)return null;
    const x=l.xaxis.d2p(point[0]),y=l.yaxis.d2p(point[1]),b=element.getBoundingClientRect();
    return finite(x)&&finite(y)?[b.left+l.xaxis._offset+x,b.top+l.yaxis._offset+y]:null;
  }
  function dataPoint(element,point) {
    const l=element._fullLayout;if(!l?.xaxis?.p2d||!l?.yaxis?.p2d)return null;
    const b=element.getBoundingClientRect(),x=l.xaxis.p2d(point[0]-b.left-l.xaxis._offset),y=l.yaxis.p2d(point[1]-b.top-l.yaxis._offset);
    return finite(x)&&finite(y)?[x,y]:null;
  }
  function viewRanges(element) {
    const layout=element?._fullLayout,state=states.get(element);
    if(!layout?.xaxis||!layout?.yaxis||!state||state.doc.mode==='3d')return null;
    return viewFrom({'xaxis.range':layout.xaxis.range,'yaxis.range':layout.yaxis.range},state.doc)?.axes||null;
  }
  function pickAnnotation(element,event,doc,selectedId) {
    if(doc.mode!=='2d')return null;
    const target=event.target?.closest?.('.annotation');
    if(target){const i=Number(target.getAttribute('data-index')),item=element.layout?.annotations?.[i];if(item?.name&&doc.annotations.some(a=>a.id===item.name))return {id:item.name,part:'label'};}
    const l=element._fullLayout,b=element.getBoundingClientRect();if(!l?.xaxis)return null;
    if(event.clientX<b.left+l.xaxis._offset||event.clientX>b.left+l.xaxis._offset+l.xaxis._length||event.clientY<b.top+l.yaxis._offset||event.clientY>b.top+l.yaxis._offset+l.yaxis._length)return null;
    let best=null,distance=event.pointerType==='touch'?22:11,priority=-1;
    for(const a of doc.annotations)if(a.visible){const result=root.GraphAnnotations.evaluate(a,doc);for(const p of result.points){const screen=screenPoint(element,p);if(!screen)continue;const d=Math.hypot(screen[0]-event.clientX,screen[1]-event.clientY),rank=a.id===selectedId?2:['point','text'].includes(a.kind)?1:0;if(d<distance-1e-6||(Math.abs(d-distance)<1&&rank>priority)){distance=d;priority=rank;best={id:a.id,part:'point'};}}}
    return best;
  }
  function resetView(element, doc) { const P = plotly(); if (!P || !element) return Promise.resolve(); const layout = layoutFor(doc, Object.assign({}, states.get(element) && states.get(element).options, { camera: undefined })); const state = states.get(element); if (state) state.camera = undefined; return P.relayout(element, layout); }
  function resize(element) { const P = plotly(); return P && P.Plots && element ? P.Plots.resize(element) : undefined; }
  function dispose(element) {if(!element)return;states.get(element)?.blankCleanup?.dispose();states.delete(element);const P=plotly();if(P&&typeof P.purge==='function')P.purge(element);}
  async function exportImage(element, options) {
    options = options || {}; const P = plotly(), state = states.get(element); if (!P || !state) throw new Error('グラフを描画してから書き出してください。');
    if (options.format === 'svg' && state.doc.mode === '3d') throw new Error('3D グラフは SVG で書き出せません。PNG を選んでください。');
    const configured = outputDefaults(state.doc, element);
    const requested = Object.assign({}, configured, options, {title:options.title===true});
    if (options.format === undefined) requested.format = 'png';
    if (!['png', 'svg'].includes(requested.format)) throw new Error('書き出し形式はPNGまたはSVGを指定してください。');
    if (requested.background !== 'white' && requested.background !== 'transparent') throw new Error('背景は白または透明を指定してください。');
    const output = validateOutput(requested);
    const host = element.ownerDocument.createElement('div'); host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + output.width + 'px;height:' + output.height + 'px;'; element.ownerDocument.body.appendChild(host);
    const data = (element.data || []).filter(x => !x?.meta?.observationHighlight).map((x) => JSON.parse(JSON.stringify(x))); const layout = JSON.parse(JSON.stringify(element.layout || layoutFor(state.doc, state.options)));
    const transparent = output.background === 'transparent', bg = transparent ? 'rgba(0,0,0,0)' : '#ffffff', fg = '#172033', grid = '#cbd5e1';
    layout.width = output.width; layout.height = output.height; layout.autosize = false; layout.margin = { l: output.margin, r: output.margin, t: output.margin, b: output.margin };
    if(layout.legend?.orientation==='h'&&layout.legend.yref==='container')layout.margin.b=Math.max(output.margin,output.fontSize*6.5);
    layout.font = Object.assign({}, layout.font, { size: output.fontSize });
    if (output.title && state.doc.name) layout.title = Object.assign({}, layout.title, { text: rich(state.doc.name), font: Object.assign({}, layout.title && layout.title.font, { size: output.fontSize }) });
    else if (!output.title) delete layout.title;
    for(const annotation of layout.annotations||[])if(['__graph_axis_x','__graph_axis_y','__graph_origin_label'].includes(annotation.name)||annotation.name?.startsWith('__graph_axis_tick_')){annotation.arrowcolor=fg;if(annotation.font)annotation.font={...annotation.font,color:fg,size:output.fontSize};}
    layout.paper_bgcolor = bg; layout.plot_bgcolor = bg; layout.font = Object.assign({}, layout.font, { color: fg });
    ['xaxis', 'yaxis'].forEach((key) => { if (layout[key]) { layout[key].color = fg; layout[key].gridcolor = grid; layout[key].zerolinecolor = presentation(state.doc).axisArrows ? fg : grid; layout[key].linecolor=fg; layout[key].title = Object.assign({}, layout[key].title, { font: Object.assign({}, layout[key].title && layout[key].title.font, { color: fg }) }); } });
    if (layout.scene) { layout.scene.bgcolor = bg; layout.scene.camera = state.camera || layout.scene.camera; ['xaxis', 'yaxis', 'zaxis'].forEach((key) => { const axis = layout.scene[key]; if (axis) { axis.color = fg; axis.gridcolor = grid; axis.zerolinecolor = grid; axis.backgroundcolor = bg; axis.title = Object.assign({}, axis.title, { font: Object.assign({}, axis.title && axis.title.font, { color: fg }) }); } }); }
    try { await P.newPlot(host, data, layout, { displayModeBar: false }); return await P.toImage(host, { format: output.format, width: output.width, height: output.height, scale: output.scale }); } finally { if (typeof P.purge === 'function') P.purge(host); host.remove(); }
  }
  return { sampleFunction, sampleSurface, render, resetView, resize, exportImage, screenPoint, dataPoint, viewRanges, pickAnnotation, dispose, escapeText: esc, seriesAxisCompatible, seriesAxisWarning };
}));
