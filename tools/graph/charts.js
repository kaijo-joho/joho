/* Derived statistical charts. This module deliberately does not depend on GraphCore. */
(function (root, factory) {
  const api = factory(root);
  if (typeof module === 'object' && module.exports) module.exports = api;else root.GraphCharts = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function (root) {
  'use strict';

  const Tables = typeof module === 'object' && module.exports ? require('./tables.js') : root.GraphTables,
    Statistics = typeof module === 'object' && module.exports ? require('./statistics.js') : root.GraphStatistics,
    Analysis = typeof module === 'object' && module.exports ? require('./analysis.js') : root.GraphAnalysis,
    Symbols = typeof module === 'object' && module.exports ? require('./symbols.js') : root.GraphSymbols;
  const kinds = ['residual', 'scatter', 'histogram', 'box'],
    models = ['linear', 'proportional', 'quadratic', 'exponential', 'power'],
    dashes = ['solid', 'dot', 'dash'];
  let sequence = 0;
  const finite = v => typeof v === 'number' && Number.isFinite(v),
    own = (o, k) => Object.prototype.hasOwnProperty.call(o, k),
    escape = v => String(v == null ? '' : v).replace(/[&<>"']/g, c => ({
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    })[c]),
    fail = m => {
      throw Error(m);
    },
    clone = v => JSON.parse(JSON.stringify(v)),
    num = v => String(Number(v.toPrecision(8)));
  const axisDefault = () => ({
    label: '',
    unit: '',
    min: null,
    max: null,
    step: null,
    format: 'auto'
  });
  const columnType = (table, column) => ['date', 'category'].includes(table?.columnTypes?.[column]) ? table.columnTypes[column] : 'number';
  const categoriesFor = (table, column) => [...new Set((table?.rows || []).map(row => row?.[column]).filter(value => typeof value === 'string' && value !== ''))];
  const dateText = value => {
    const d = new Date(Math.round(value) * 86400000);
    return Number.isNaN(d.getTime()) ? '' : d.toISOString().slice(0, 10);
  };
  function typedAxis(type, categories) { return { type, categories: type === 'category' ? categories : [] }; }
  function projectColumns(table, xColumn, yColumn) {
    const x = typedAxis(columnType(table, xColumn), categoriesFor(table, xColumn)), y = typedAxis(columnType(table, yColumn), categoriesFor(table, yColumn));
    const mapped = { ...table, mapping: { x: xColumn, y: yColumn, z: null, errorX: null, errorY: null } };
    return { axes: { x, y }, rows: Tables.project(mapped, 'data2d', { x, y }).rows };
  }
  function typedAxisLayout(target, typed, extent) {
    if (!typed || typed.type === 'number') return;
    target.zeroline = false;
    if (typed.type === 'category') {
      const values = typed.categories.map((_, index) => index);
      target.tickmode = 'array'; target.tickvals = values; target.ticktext = typed.categories;
      return;
    }
    const values = (extent || []).filter(finite), lo = Math.min(...values), hi = Math.max(...values), span = hi - lo;
    if (!finite(lo) || !finite(hi)) return;
    const tickvals = Tables.dateTicks(lo,hi);
    target.tickmode = 'array'; target.tickvals = tickvals; target.ticktext = tickvals.map(dateText);
  }
  function defaultView() {
    return {
      axes: {
        x: axisDefault(),
        y: axisDefault()
      },
      style: {
        pointSize: 8,
        width: 2,
        dash: 'solid'
      },
      legend: true,
      labels: {
        equation: false,
        metrics: false
      }
    };
  }
  function id() {
    sequence++;
    return 'chart_' + Date.now().toString(36) + '_' + sequence.toString(36);
  }
  function mergeView(v = {}) {
    const d = defaultView(),
      a = v.axes || {},
      s = v.style || {},
      l = v.labels || {};
    return {
      axes: {
        x: {
          ...d.axes.x,
          ...(a.x || {})
        },
        y: {
          ...d.axes.y,
          ...(a.y || {})
        }
      },
      style: {
        ...d.style,
        ...s
      },
      legend: v.legend === undefined ? true : v.legend,
      labels: {
        ...d.labels,
        ...l
      }
    };
  }
  function create(kind, options = {}) {
    if (!kinds.includes(kind) || !options || typeof options !== 'object' || Array.isArray(options)) fail('グラフの設定が不正です。');
    const generated = id(),
      base = {
        id: generated,
        kind,
        name: '',
        visible: true,
        color: '#2563eb',
        ...defaultView()
      };
    if (kind === 'residual') Object.assign(base, {
      regressionId: '',
      horizontal: 'x'
    });
    if (kind === 'scatter') Object.assign(base, {
      seriesId: '',
      xColumn: 0,
      yColumn: 1,
      model: null
    });
    if (kind === 'histogram') Object.assign(base, {
      seriesId: '',
      column: 0,
      bins: null
    });
    if (kind === 'box') Object.assign(base, {
      seriesId: '',
      columns: [0]
    });
    return {
      ...base,
      ...clone(options),
      ...mergeView(options),
      id: generated,
      kind,
      visible: options.visible === undefined ? true : options.visible
    };
  }
  function series(doc, id) {
    return (doc && doc.series || []).find(x => x && x.id === id);
  }
  function annotation(doc, id) {
    return (doc && doc.annotations || []).find(x => x && x.id === id);
  }
  function text(v, label, max = 160) {
    if (typeof v !== 'string' || v.length > max || /[\u0000-\u001f]/.test(v)) fail(label + 'が不正です。');
    return v;
  }
  function chartId(v, used, reserved) {
    if (typeof v !== 'string' || !/^[A-Za-z0-9_-]{1,100}$/.test(v) || used.has(v) || reserved.has(v)) fail('グラフのIDが不正または重複しています。');
    used.add(v);
    return v;
  }
  function index(v, label) {
    if (!Number.isInteger(v) || v < 0 || v >= 20) fail(label + 'が不正です。');
    return v;
  }
  function validateAxis(raw, key) {
    const d = axisDefault();
    if (raw === undefined) return d;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail(key + '軸の設定が不正です。');
    const o = {
      ...d,
      ...raw
    };
    o.label = text(o.label, '軸ラベル', 160);
    o.unit = text(o.unit, '軸の単位', 80);
    for (const k of ['min', 'max', 'step']) if (o[k] !== null && !finite(o[k])) fail(key + '軸の範囲が不正です。');
    if (o.min === null !== (o.max === null) || o.min !== null && (!(o.min < o.max) || Math.abs(o.min) > 1e9 || Math.abs(o.max) > 1e9)) fail(key + '軸の範囲が不正です。');
    if (o.step !== null && !(o.step > 0)) fail(key + '軸の目盛が不正です。');
    if (!['auto', 'decimal', 'fraction', 'pi'].includes(o.format)) fail(key + '軸の表示形式が不正です。');
    return o;
  }
  function validateView(raw, kind) {
    const ar = raw.axes === undefined ? {} : raw.axes;
    if (!ar || typeof ar !== 'object' || Array.isArray(ar)) fail('軸の設定が不正です。');
    const axes = {
      x: validateAxis(ar.x, 'x'),
      y: validateAxis(ar.y, 'y')
    };
    if (kind === 'box' && (axes.x.min !== null || axes.x.max !== null || axes.x.step !== null || axes.x.format !== 'auto')) fail('箱ひげ図の横軸には範囲・目盛を設定できません。');
    const sr = raw.style === undefined ? {} : raw.style;
    if (!sr || typeof sr !== 'object' || Array.isArray(sr)) fail('線と点の設定が不正です。');
    const style = {
      ...defaultView().style,
      ...sr
    };
    if (!finite(style.pointSize) || style.pointSize < 2 || style.pointSize > 30 || !finite(style.width) || style.width < .5 || style.width > 20 || !dashes.includes(style.dash)) fail('線と点の設定が不正です。');
    if (raw.legend !== undefined && typeof raw.legend !== 'boolean') fail('凡例の設定が不正です。');
    const lr = raw.labels === undefined ? {} : raw.labels;
    if (!lr || typeof lr !== 'object' || Array.isArray(lr)) fail('表示ラベルの設定が不正です。');
    const labels = {
      ...defaultView().labels,
      ...lr
    };
    if (typeof labels.equation !== 'boolean' || typeof labels.metrics !== 'boolean') fail('表示ラベルの設定が不正です。');
    return {
      axes,
      style,
      legend: raw.legend === undefined ? true : raw.legend,
      labels
    };
  }
  function validateOne(raw, doc, used, reserved) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw) || !kinds.includes(raw.kind) || typeof raw.color !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(raw.color)) fail('グラフの設定が不正です。');
    const out = {
      id: chartId(raw.id, used, reserved),
      kind: raw.kind,
      name: text(raw.name ?? '', 'グラフ名'),
      // version 10の任意項目。省略された旧作品は従来どおり表示する。
      visible: raw.visible === undefined ? true : raw.visible,
      color: raw.color,
      ...validateView(raw, raw.kind)
    };
    if (typeof out.visible !== 'boolean') fail('グラフの表示設定が不正です。');
    if (raw.kind === 'residual') {
      out.regressionId = text(raw.regressionId, '回帰参照', 100);
      if (!annotation(doc, out.regressionId) || annotation(doc, out.regressionId).kind !== 'regression') fail('残差グラフの回帰参照が見つかりません。');
      if (!['x', 'predicted'].includes(raw.horizontal)) fail('残差グラフの横軸が不正です。');
      out.horizontal = raw.horizontal;
      return out;
    }
    out.seriesId = text(raw.seriesId, '数表参照', 100);
    const source = series(doc, out.seriesId);
    if (!source || !['data2d', 'data3d'].includes(source.kind)) fail('数表参照が見つかりません。');
    const table = Tables.fromSeries(source),
      has = v => v < table.columns.length;
    if (raw.kind === 'scatter') {
      out.xColumn = index(raw.xColumn, '横軸の列');
      out.yColumn = index(raw.yColumn, '縦軸の列');
      if (!has(out.xColumn) || !has(out.yColumn) || out.xColumn === out.yColumn) fail('散布図の列が不正です。');
      if (raw.model !== null && !models.includes(raw.model)) fail('回帰モデルが不正です。');
      out.model = raw.model;
    } else if (raw.kind === 'histogram') {
      out.column = index(raw.column, 'ヒストグラムの列');
      if (!has(out.column)) fail('ヒストグラムの列が数表にありません。');
      if (columnType(table, out.column) !== 'number') fail('ヒストグラムには数値列を指定してください。');
      if (raw.bins !== null && (!Number.isInteger(raw.bins) || raw.bins < 1 || raw.bins > 100)) fail('階級数は1〜100または自動にしてください。');
      out.bins = raw.bins;
    } else {
      if (!Array.isArray(raw.columns) || raw.columns.length < 1 || raw.columns.length > 20) fail('箱ひげ図の列が不正です。');
      out.columns = raw.columns.map(v => index(v, '箱ひげ図の列'));
      if (out.columns.some(v => !has(v)) || new Set(out.columns).size !== out.columns.length || out.columns.some(v => columnType(table, v) !== 'number')) fail('箱ひげ図には数値列を指定してください。');
    }
    return out;
  }
  function validate(charts, doc) {
    if (!Array.isArray(charts) || charts.length > 12) fail('グラフは12個以下にしてください。');
    const reserved = new Set(['main', 'comparison']),
      used = new Set();
    for (const x of [].concat(doc && doc.series || [], doc && doc.annotations || [])) if (x && typeof x.id === 'string') reserved.add(x.id);
    return charts.map(x => validateOne(x, doc, used, reserved));
  }
  function prune(charts, doc) {
    const ss = new Set((doc && doc.series || []).map(x => x && x.id)),
      rs = new Set((doc && doc.annotations || []).filter(x => x && x.kind === 'regression').map(x => x.id));
    return Array.isArray(charts) ? charts.filter(x => x && typeof x === 'object' && (x.kind === 'residual' ? rs.has(x.regressionId) : ss.has(x.seriesId))) : [];
  }
  function base(chart, title, dark, fontSize) {
    const grid = dark ? '#374151' : '#d1d5db',
      color = dark ? '#e5e7eb' : '#1f2937';
    return {
      title: {
        text: escape(chart.name || title),
        font: {
          size: fontSize + 2
        }
      },
      font: {
        size: fontSize,
        color
      },
      paper_bgcolor: dark ? '#111827' : '#fff',
      plot_bgcolor: dark ? '#111827' : '#fff',
      margin: {
        l: 64,
        r: 28,
        t: 56,
        b: 100
      },
      showlegend: chart.legend,
      legend: {
        orientation: 'h',
        x: 0,
        y: 0,
        yref: 'container',
        xanchor: 'left',
        yanchor: 'bottom'
      },
      xaxis: {
        automargin: true,
        gridcolor: grid,
        zerolinecolor: color,
        tickfont: {
          color
        }
      },
      yaxis: {
        automargin: true,
        gridcolor: grid,
        zerolinecolor: color,
        tickfont: {
          color
        }
      }
    };
  }
  function axisName(axis, fallback) {
    return (axis.label || fallback) + (axis.unit ? ' [' + axis.unit + ']' : '');
  }
  function finiteExtent(values) {
    let min = Infinity,
      max = -Infinity;
    for (const value of values || []) {
      if (!finite(value)) continue;
      if (value < min) min = value;
      if (value > max) max = value;
    }
    return finite(min) && finite(max) ? [min, max] : null;
  }
  function axes(layout, chart, fallback, box, extent = {}, typed = {}) {
    for (const key of ['x', 'y']) {
      const axis = chart.axes[key],
        target = layout[key + 'axis'];
      target.title = {
        text: escape(axisName(axis, fallback[key]))
      };
      if (key === 'x' && box) continue;
      if (axis.min !== null) target.range = [axis.min, axis.max];
      if (axis.format === 'decimal') target.tickformat = '.8g';
      if (axis.step !== null || axis.format !== 'auto') {
        const bounds = axis.min !== null ? [axis.min, axis.max] : finiteExtent(extent[key]);
        if (bounds) {
          if (bounds[0] === bounds[1]) { const pad = Math.max(1, Math.abs(bounds[0]) * .05); bounds[0] -= pad; bounds[1] += pad; }
          const ticks = Symbols.ticksFor({
            min: bounds[0],
            max: bounds[1],
            scale: 'linear',
            ticks: {
              step: axis.step,
              format: axis.format
            }
          });
          Object.assign(target, ticks);
        }
      }
      typedAxisLayout(target, typed[key], target.range || extent[key]);
    }
  }
  function empty(chart, msg, dark, fontSize, f = {
    x: '値',
    y: '値'
  }) {
    const layout = base(chart, '統計グラフ', dark, fontSize);
    axes(layout, chart, f);
    layout.annotations = [{
      text: escape(msg),
      showarrow: false,
      font: { color: dark ? '#e5e7eb' : '#1f2937' }
    }];
    return {
      data: [],
      layout,
      summary: '',
      warnings: [msg]
    };
  }
  const marker = c => ({
      color: c.color,
      size: c.style.pointSize
    }),
    line = c => ({
      color: c.color,
      width: c.style.width,
      dash: c.style.dash
    });
  function labelAnnotations(chart, fit, x, y, dark) {
    const a = [];
    if (fit && !fit.warning) {
      if (chart.labels.equation) a.push(escape(Analysis.equation(fit, x, y)));
      if (chart.labels.metrics) {
        const m = ['n=' + fit.n];
        if (fit.r !== null) m.push('r=' + num(fit.r));
        if (fit.r2 !== null) m.push('R²=' + num(fit.r2));
        if (fit.rmse !== null) m.push('RMSE=' + num(fit.rmse));
        a.push(escape(m.join('　')));
      }
    }
    return a.length ? [{
      text: a.join('<br>'),
      xref: 'paper',
      yref: 'paper',
      x: 1,
      y: 1,
      xanchor: 'right',
      yanchor: 'top',
      showarrow: false,
      font: {
        color: dark ? '#f9fafb' : '#111827'
      },
      bgcolor: dark ? 'rgba(17,24,39,.88)' : 'rgba(255,255,255,.88)',
      bordercolor: dark ? '#9ca3af' : '#6b7280',
      borderwidth: 1
    }] : [];
  }
  function pointHover(xName, yName) {
    return '元の行 %{customdata[0]}<br>' + escape(xName) + '=%{x:.8g}<br>' + escape(yName) + '=%{y:.8g}<extra></extra>';
  }
  function highlight(chart, source, point) {
    return {
      type: 'scatter',
      mode: 'markers',
      name: '選択中の行',
      showlegend: false,
      x: [point.x],
      y: [point.y],
      customdata: [[point.row]],
      meta: {
        observationHighlight: true,
        dataRows: true,
        seriesId: source.id
      },
      marker: {
        color: '#f59e0b',
        size: chart.style.pointSize + 5,
        symbol: 'circle-open',
        line: {
          color: '#92400e',
          width: 2
        }
      },
      hoverinfo: 'skip'
    };
  }
  function buildScatter(chart, doc, dark, fontSize, selectedRow) {
    const source = series(doc, chart.seriesId);
    let table;
    try {
      table = Tables.fromSeries(source);
    } catch {
      return empty(chart, '数表参照が見つかりません。', dark, fontSize);
    }
    if (!table.columns[chart.xColumn] || !table.columns[chart.yColumn]) return empty(chart, '指定した列が数表にありません。', dark, fontSize);
    const excluded = new Set(source.excludedRows || []), projected = projectColumns(table, chart.xColumn, chart.yColumn), typed = projected.axes,
      rows = projected.rows,
      pairs = [],
      hover = typed.x.type === 'number' && typed.y.type === 'number' ? pointHover(table.columns[chart.xColumn], table.columns[chart.yColumn]) : '元の行 %{customdata[0]}<br>' + escape(table.columns[chart.xColumn]) + '=%{customdata[1]}<br>' + escape(table.columns[chart.yColumn]) + '=%{customdata[2]}<extra></extra>';
    rows.forEach(([x, y], i) => {
      if (x !== null && y !== null) pairs.push({
        row: i + 1,
        x,
        y,
        excluded: excluded.has(i), rawX: table.rows[i][chart.xColumn], rawY: table.rows[i][chart.yColumn]
      });
    });
    if (!pairs.length) return empty(chart, '同じ行にそろった数値の組がありません。', dark, fontSize);
    const active = pairs.filter(p => !p.excluded),
      hidden = pairs.filter(p => p.excluded),
      trace = (name, ps, extra = {}) => ({
        type: 'scatter',
        mode: 'markers',
        name,
        x: ps.map(p => p.x),
        y: ps.map(p => p.y),
        customdata: ps.map(p => [p.row, p.rawX, p.rawY]),
        meta: {
          dataRows: true,
          seriesId: source.id
        },
        marker: {
          ...marker(chart),
          ...extra
        },
        hovertemplate: hover
      }),
      data = [];
    if (active.length) data.push(trace(escape(chart.name || '散布図'), active));
    if (hidden.length) data.push(trace('回帰から除外', hidden, {
      opacity: .35,
      symbol: 'circle-open'
    }));
    let fit = null,
      warnings = [],
      summary = '有効な ' + pairs.length + ' 組を表示しています。';
    if (chart.model && typed.x.type !== 'category' && typed.y.type === 'number') {
      fit = Analysis.fit({
        rows,
        excludedRows: [...excluded]
      }, chart.model);
      if (fit.warning) warnings.push(fit.warning);else {
        const [lo, hi] = fit.domain,
          xs = Array.from({
            length: 129
          }, (_, i) => i === 128 ? hi : lo + (hi - lo) * i / 128),
          m = [];
        data.push({
          type: 'scatter',
          mode: 'lines',
          name: '回帰曲線',
          x: xs,
          y: xs.map(fit.predict),
          line: line(chart),
          hoverinfo: 'skip'
        });
        if (fit.r2 !== null) m.push('R²=' + num(fit.r2));
        if (fit.r !== null) m.push('Pearson r=' + num(fit.r));
        if (fit.rmse !== null) m.push('RMSE=' + num(fit.rmse));
        summary += ' ' + Analysis.equation(fit, table.columns[chart.xColumn], table.columns[chart.yColumn]) + (m.length ? '（' + m.join('、') + '）' : '') + (fit.excluded ? ' 回帰から ' + fit.excluded + ' 行を除外しています。' : '');
      }
    } else if (chart.model) warnings.push('回帰分析は横軸が数値または日付、縦軸が数値の散布図で表示できます。');
    if (selectedRow && selectedRow.seriesId === source.id) {
      const p = pairs.find(x => x.row === selectedRow.rowIndex + 1);
      if (p) data.push(highlight(chart, source, p));
    }
    const layout = base(chart, '散布図', dark, fontSize);
    axes(layout, chart, {
      x: table.columns[chart.xColumn],
      y: table.columns[chart.yColumn]
    }, false, {
      x: pairs.map(p => p.x),
      y: pairs.map(p => p.y)
    }, typed);
    layout.annotations = labelAnnotations(chart, fit, table.columns[chart.xColumn], table.columns[chart.yColumn], dark);
    return {
      data,
      layout,
      summary,
      warnings
    };
  }
  function buildResidual(chart, doc, dark, fontSize, selectedRow) {
    const regression = annotation(doc, chart.regressionId),
      source = regression && series(doc, regression.seriesId),
      original = key => {
        const a = doc && doc.axes && doc.axes[key] || {},
          s = a.symbol || key;
        return s + (a.label && a.label !== s ? '（' + a.label + '）' : '') + (a.unit ? ' [' + a.unit + ']' : '');
      };
    if (!source) return empty(chart, '参照する回帰が見つかりません。', dark, fontSize);
    const fit = Analysis.fit(source, regression.model);
    if (fit.warning) return empty(chart, fit.warning, dark, fontSize);
    const xName = original('x'), dateX = chart.horizontal === 'x' && source.dataTable?.columnTypes?.[source.dataTable.mapping.x] === 'date',
      yName = original('y'),
      points = fit.residuals.map(r => ({
        row: r[0],
        x: chart.horizontal === 'predicted' ? r[3] : r[1],
        y: r[4],
        raw: r
      })),
      trace = {
        type: 'scatter',
        mode: 'markers',
        name: escape(chart.name || '残差'),
        x: points.map(p => p.x),
        y: points.map(p => p.y),
        customdata: points.map(p => [p.raw[0], dateX ? dateText(p.raw[1]) : p.raw[1], p.raw[2], p.raw[3], p.raw[4]]),
        meta: {
          dataRows: true,
          seriesId: source.id
        },
        marker: marker(chart),
        hovertemplate: '元の行 %{customdata[0]}<br>x=' + (dateX ? '%{customdata[1]}' : '%{customdata[1]:.8g}') + '<br>y=%{customdata[2]:.8g}<br>予測値=%{customdata[3]:.8g}<br>残差=%{y:.8g}<extra></extra>'
      },
      data = [trace];
    if (selectedRow && selectedRow.seriesId === source.id) {
      const p = points.find(x => x.row === selectedRow.rowIndex + 1);
      if (p) data.push(highlight(chart, source, p));
    }
    const layout = base(chart, '残差グラフ', dark, fontSize);
    axes(layout, chart, {
      x: chart.horizontal === 'predicted' ? yName + ' の予測値' : xName,
      y: yName + ' の残差'
    }, false, {
      x: points.map(p => p.x),
      y: [0, ...points.map(p => p.y)]
    }, dateX ? { x: typedAxis('date'), y: typedAxis('number') } : {});
    layout.yaxis.zeroline = true;
    layout.yaxis.rangemode = 'tozero';
    layout.annotations = labelAnnotations(chart, fit, xName, yName, dark);
    return {
      data,
      layout,
      summary: '有効な ' + fit.n + ' 組' + (fit.excluded ? '（除外 ' + fit.excluded + ' 行）' : '') + 'の残差を表示しています。',
      warnings: []
    };
  }
  function buildHistogram(chart, doc, dark, fontSize) {
    const source = series(doc, chart.seriesId),
      table = source && Tables.fromSeries(source);
    if (!table || !table.columns[chart.column]) return empty(chart, '指定した列が数表にありません。', dark, fontSize);
    const values = table.rows.map(r => r[chart.column]).filter(v => v !== null);
    if (!values.length) return empty(chart, 'この列に数値がありません。', dark, fontSize);
    const min = Math.min(...values),
      max = Math.max(...values),
      n = chart.bins || Math.max(1, Math.min(100, Math.ceil(Math.sqrt(values.length)))),
      range = max - min,
      edges = [min];
    for (let i = 1; i < n && range > 0; i++) {
      const e = min + range * i / n;
      if (e > edges.at(-1) && e < max) edges.push(e);
    }
    if (max > edges.at(-1)) edges.push(max);
    if (edges.length === 1) edges.push(max);
    const counts = Array(edges.length - 1).fill(0);
    for (const v of values) {
      let p = 0;
      while (p < counts.length - 1 && v >= edges[p + 1]) p++;
      counts[p]++;
    }
    const labels = counts.map((_, i) => '[' + num(edges[i]) + ', ' + num(edges[i + 1]) + (i === counts.length - 1 ? ']' : ')')),
      trace = {
        type: 'bar',
        name: escape(chart.name || 'ヒストグラム'),
        x: counts.map((_, i) => (edges[i] + edges[i + 1]) / 2),
        y: counts,
        width: counts.map((_, i) => edges[i + 1] - edges[i] || 1),
        marker: {
          color: chart.color,
          line: {
            color: chart.color,
            width: chart.style.width
          }
        },
        customdata: labels.map((x, i) => [x, counts[i]]),
        hovertemplate: '階級 %{customdata[0]}<br>度数 %{customdata[1]}<extra></extra>'
      },
      layout = base(chart, 'ヒストグラム', dark, fontSize);
    axes(layout, chart, {
      x: table.columns[chart.column],
      y: '度数'
    }, false, {
      x: edges,
      y: [0, ...counts]
    });
    layout.yaxis.rangemode = 'tozero';
    layout.yaxis.tick0 = 0;
    if (chart.axes.y.step === null) layout.yaxis.dtick = Math.max(1, Math.ceil(Math.max(...counts) / 6));
    return {
      data: [trace],
      layout,
      summary: '数値 ' + values.length + ' 個。' + labels.map((x, i) => x + '：' + counts[i]).join('、'),
      warnings: []
    };
  }
  function buildBox(chart, doc, dark, fontSize) {
    const source = series(doc, chart.seriesId),
      table = source && Tables.fromSeries(source);
    if (!table) return empty(chart, '数表参照が見つかりません。', dark, fontSize);
    const data = [],
      values = [],
      summaries = [];
    for (const column of chart.columns) {
      const valuesForColumn = table.rows.map(row => row[column]).filter(value => value !== null),
        stats = Statistics.describe(valuesForColumn);
      if (!stats.n) { summaries.push(table.columns[column] + '：数値なし'); continue; }
      values.push(...valuesForColumn);
      const name = column + 1 + ': ' + table.columns[column];
      data.push({
        type: 'box',
        name: escape(name),
        x0: escape(name),
        q1: [stats.q1],
        median: [stats.median],
        q3: [stats.q3],
        lowerfence: [stats.min],
        upperfence: [stats.max],
        boxpoints: false,
        marker: { color: chart.color },
        line: line(chart),
        showlegend: chart.legend,
        hovertemplate: 'Q1=%{q1:.8g}<br>中央値=%{median:.8g}<br>Q3=%{q3:.8g}<br>最小=%{lowerfence:.8g}<br>最大=%{upperfence:.8g}<extra>' + escape(table.columns[column]) + '</extra>'
      });
      summaries.push(table.columns[column] + ': n=' + stats.n + '、最小=' + num(stats.min) + '、Q1=' + num(stats.q1) + '、中央値=' + num(stats.median) + '、Q3=' + num(stats.q3) + '、最大=' + num(stats.max));
    }
    if (!data.length) return empty(chart, '指定した列に数値がありません。', dark, fontSize);
    const layout = base(chart, '箱ひげ図', dark, fontSize);
    axes(layout, chart, {
      x: '列',
      y: '値'
    }, true, {
      y: values
    });
    layout.xaxis.type = 'category';
    return {
      data,
      layout,
      summary: '四分位数は、中央値を奇数個では除き、上下半分の中央値で求めます。ひげは外れ値を除かず最小値・最大値です。' + summaries.join('。'),
      warnings: []
    };
  }
  function build(chart, doc, {
    dark = false,
    fontSize = 14,
    selectedRow = null
  } = {}) {
    fontSize = finite(fontSize) && fontSize >= 8 && fontSize <= 48 ? fontSize : 14;
    let clean;
    try {
      clean = validate([chart], doc)[0];
    } catch (error) {
      const fallback = {
        ...defaultView(),
        ...(chart || {}),
        ...mergeView(chart || {})
      };
      return empty(fallback, error.message, dark, fontSize);
    }
    if (!clean.visible) return empty(clean, 'この分析グラフは非表示です。', dark, fontSize);
    const result = clean.kind === 'scatter' ? buildScatter(clean, doc, dark, fontSize, selectedRow) : clean.kind === 'residual' ? buildResidual(clean, doc, dark, fontSize, selectedRow) : clean.kind === 'histogram' ? buildHistogram(clean, doc, dark, fontSize) : buildBox(clean, doc, dark, fontSize);
    const sourceId = clean.kind === 'residual' ? doc.annotations.find(a => a.id === clean.regressionId)?.seriesId : clean.seriesId;
    const source = doc.series.find(s => s.id === sourceId);
    const warning = source?.dataTable ? Tables.calculationWarning(source.dataTable) : '';
    if (warning) result.warnings.push(warning);
    return result;
  }
  return {
    create,
    defaultView,
    validate,
    prune,
    build
  };
});
