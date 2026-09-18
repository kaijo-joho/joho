/* global Plotly, GraphPlot, GraphCharts */
/* 複数グラフの比較表示と、現在の編集画面を変えない画像出力。 */
(function (root, factory) {
  const api = factory(root || globalThis);
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.GraphWorkspace = api;
}(typeof window !== 'undefined' ? window : globalThis, function (root) {
  'use strict';
  const states = new WeakMap();
  const comparisonStates = new WeakMap();
  const MAX_DIMENSION = 8192, MAX_PIXELS = 33554432;
  const text = value => value == null ? '' : String(value);
  const unique = values => [...new Set(values)];
  const hex = value => typeof value === 'string' && /^#[0-9a-fA-F]{6}$/.test(value);
  const chartById = (doc, id) => (doc && doc.charts || []).find(chart => chart && chart.id === id) || null;
  const chartVisible = chart => !chart || chart.visible !== false;
  const titleFor = (item, doc) => item === 'main' ? (doc && doc.name || 'メインのグラフ') : (chartById(doc, item) || {}).name || 'グラフ';
  const chartAxesRevision = chart => ['x', 'y'].map(key => { const axis = Object.assign({}, chart?.axes?.[key] || {}); delete axis.style; return axis; });
  const rowFromClick = (element, event) => { const point = event?.points?.[0], trace = point?.data || point?.fullData, meta = trace?.meta, layout = element?._fullLayout, mouse = event?.event, box = element?.getBoundingClientRect?.(); if (!point || !meta?.dataRows || meta.observationHighlight || !Array.isArray(point.customdata) || !Number.isInteger(point.customdata[0])) return null; const axisKey = value => { value = String(value || 'x'); return value[0] + 'axis' + value.slice(1); }; const xaxis = layout?.[axisKey(trace?.xaxis || 'x')], yaxis = layout?.[axisKey(trace?.yaxis || 'y')]; if (xaxis?.d2p && yaxis?.d2p && mouse && box) { const x = xaxis.d2p(point.x), y = yaxis.d2p(point.y); if (!Number.isFinite(x) || !Number.isFinite(y) || Math.hypot(box.left + xaxis._offset + x - mouse.clientX, box.top + yaxis._offset + y - mouse.clientY) > 14) return null; } return { seriesId: meta.seriesId || meta.objectId, rowIndex: point.customdata[0] - 1 }; };

  function comparison(doc) {
    const source = doc && doc.comparison || {};
    const columns = [1, 2, 3].includes(source.columns) ? source.columns : 2;
    const allowed = new Set(['main'].concat((doc && doc.charts || []).map(chart => chart.id)));
    const items = [];
    const warnings = [];
    for (const id of Array.isArray(source.items) ? source.items : []) {
      const chart = id === 'main' ? null : chartById(doc, id);
      if (!allowed.has(id)) warnings.push('比較対象「' + text(id) + '」は見つかりません。');
      else if (!chartVisible(chart)) continue;
      else if (items.includes(id)) warnings.push('比較対象「' + text(id) + '」が重複しています。');
      else if (items.length < 6) items.push(id);
      else warnings.push('比較できるグラフは6件までです。');
    }
    return { columns, items, warnings };
  }

  function output(options, fallback) {
    const out = Object.assign({ format: 'png', width: fallback && fallback.width || 640, height: fallback && fallback.height || 480, margin: 32, fontSize: 16, scale: 1, background: 'white' }, options || {});
    if (!['png', 'svg'].includes(out.format)) throw new Error('書き出し形式はPNGまたはSVGを指定してください。');
    if (!Number.isInteger(out.width) || out.width < 320 || out.width > MAX_DIMENSION) throw new Error('書き出し幅は320〜8192pxで指定してください。');
    if (!Number.isInteger(out.height) || out.height < 220 || out.height > MAX_DIMENSION) throw new Error('書き出し高さは220〜8192pxで指定してください。');
    if (!Number.isInteger(out.margin) || out.margin < 0 || out.margin > 200) throw new Error('書き出し余白が不正です。');
    if (!Number.isInteger(out.fontSize) || out.fontSize < 8 || out.fontSize > 36) throw new Error('書き出し文字サイズは8〜36pxで指定してください。');
    if (!Number.isInteger(out.scale) || out.scale < 1 || out.scale > 4) throw new Error('書き出し倍率は1〜4で指定してください。');
    if (out.background !== 'white' && out.background !== 'transparent') throw new Error('背景は白または透明を指定してください。');
    if (out.width * out.height > MAX_PIXELS || out.width * out.scale > MAX_DIMENSION || out.height * out.scale > MAX_DIMENSION || out.width * out.height * out.scale * out.scale > MAX_PIXELS) throw new Error('書き出し画像のサイズが上限を超えています。');
    return out;
  }
  function graphLayout(layout, options, chart) {
    const clone = JSON.parse(JSON.stringify(layout || {}));
    const bg = options.background === 'transparent' ? 'rgba(0,0,0,0)' : '#ffffff';
    clone.width = options.width; clone.height = options.height; clone.autosize = false;
    clone.margin = Object.assign({}, clone.margin, { l: options.margin, r: options.margin, t: options.margin, b: options.margin });
    if(clone.legend?.orientation==='h'&&clone.legend.yref==='container')clone.margin.b=Math.max(options.margin,options.fontSize*6.5);
    clone.font = Object.assign({}, clone.font, { size: options.fontSize, color: '#172033' });
    if (clone.title) clone.title.font = Object.assign({}, clone.title.font, { color: '#172033', size: options.fontSize + 2 });
    if(options.title===false)delete clone.title;
    clone.paper_bgcolor = bg; clone.plot_bgcolor = bg;
    Object.keys(clone).filter(key => /^xaxis\d*$|^yaxis\d*$/.test(key)).forEach(key => {
      const axis = clone[key], styleKey = key[0], style = chart?.axes?.[styleKey]?.style;
      const explicitColor = hex(style?.color) ? style.color : '#172033';
      const explicitGrid = hex(style?.gridColor) ? style.gridColor : '#cbd5e1';
      axis.color = explicitColor; axis.linecolor = explicitColor; axis.gridcolor = explicitGrid;
      axis.zerolinecolor = '#374151';
      axis.tickfont = Object.assign({}, axis.tickfont, { color: explicitColor });
      if (axis.title) axis.title.font = Object.assign({}, axis.title.font, { color: explicitColor });
    });
    for (const annotation of clone.annotations || []) { annotation.font = Object.assign({}, annotation.font, { color: '#172033' }); if (annotation.bgcolor) annotation.bgcolor = 'rgba(255,255,255,.88)'; if (annotation.bordercolor) annotation.bordercolor = '#6b7280'; }
    return clone;
  }
  function hostFor(element, width, height) {
    const host = element.ownerDocument.createElement('div');
    host.style.cssText = 'position:fixed;left:-10000px;top:0;width:' + width + 'px;height:' + height + 'px;visibility:hidden;';
    element.ownerDocument.body.appendChild(host); return host;
  }
  function installChartBlankClick(element, callback) {
    let latest = callback, down = null, hit = false;
    const eligible = event => event.pointerType === 'touch' || event.button === 0;
    const start = event => { if (!eligible(event)) return; down = { id: event.pointerId, x: event.clientX, y: event.clientY, moved: false, inside: !!event.target?.closest?.('.trace,.legend,.annotation') }; hit = false; };
    const move = event => { if (down && event.pointerId === down.id && Math.hypot(event.clientX - down.x, event.clientY - down.y) > 4) down.moved = true; };
    const end = event => { if (!down || event.pointerId !== down.id) return; const click = down; down = null; setTimeout(() => { if (!click.moved && !click.inside && !hit && typeof latest === 'function') latest(); }, 0); };
    element.addEventListener('pointerdown', start, true); element.ownerDocument.addEventListener('pointermove', move, true); element.ownerDocument.addEventListener('pointerup', end, true);
    return { hit: () => { hit = true; }, update: next => { latest = next; }, dispose: () => { element.removeEventListener('pointerdown', start, true); element.ownerDocument.removeEventListener('pointermove', move, true); element.ownerDocument.removeEventListener('pointerup', end, true); } };
  }
  async function renderChart(element, chart, doc, options) {
    options = options || {};
    if (!root.Plotly || !element) throw new Error('Plotly を読み込めません。');
    if (!root.GraphCharts || typeof root.GraphCharts.build !== 'function') throw new Error('比較グラフの機能を読み込めません。');
    const previous = states.get(element), built = root.GraphCharts.build(chart, doc, { dark: !!options.dark, fontSize: options.fontSize, selectedRow: options.selectedRow });
    const layout = Object.assign({}, built.layout || {}, { autosize: true, width: element.clientWidth || 640, height: element.clientHeight || 320, uirevision: 'chart:' + text(chart && chart.id) + ':' + text(chart && chart.kind) });
    layout.uirevision += ':' + JSON.stringify([chart.seriesId,chart.regressionId,chart.horizontal,chart.xColumn,chart.yColumn,chart.column,chart.columns,chartAxesRevision(chart)]);
    if(options.title===false){delete layout.title;layout.margin={...layout.margin,t:24};}
    await root.Plotly.react(element, built.data || [], layout, { displayModeBar: false, responsive: true, scrollZoom: chart?.kind !== 'matrix' });
    const blank = previous?.blankCleanup || installChartBlankClick(element, options.onBlankClick); blank.update(options.onBlankClick);
    if (typeof element.removeAllListeners === 'function') element.removeAllListeners('plotly_click');
    if (typeof element.on === 'function') element.on('plotly_click', event => { blank.hit(); const row = rowFromClick(element, event); if (row && typeof options.onRowSelect === 'function') options.onRowSelect(row); });
    states.set(element, { chart, doc, options, summary: text(built.summary), warnings: built.warnings || [], blankCleanup: blank });
    return { warnings: unique(built.warnings || []), summary: text(built.summary) };
  }
  function resize(element) {
    if (!element) return;
    if (states.has(element) && root.Plotly && root.Plotly.Plots) return root.Plotly.Plots.resize(element);
    const plots = element.querySelectorAll ? element.querySelectorAll('.comparison-plot') : [];
    for (const plot of plots) if (root.Plotly && root.Plotly.Plots) root.Plotly.Plots.resize(plot);
  }
  function purge(element) {
    if (!element) return;
    if (states.has(element)) { states.get(element).blankCleanup?.dispose(); if (root.Plotly && typeof root.Plotly.purge === 'function') root.Plotly.purge(element); states.delete(element); return; }
    const comparisonState = comparisonStates.get(element);
    if (comparisonState) {
      for (const panel of comparisonState.panels) purgePanel(panel);
      comparisonStates.delete(element); return;
    }
    const plots = element.querySelectorAll ? element.querySelectorAll('.comparison-plot') : [];
    for (const plot of plots) purge(plot);
    comparisonStates.delete(element);
  }
  function purgePanel(panel) {
    if (!panel) return;
    if (panel.item === 'main' && root.GraphPlot && typeof root.GraphPlot.dispose === 'function') root.GraphPlot.dispose(panel.plot);
    else if (panel.item === 'main' && root.Plotly && typeof root.Plotly.purge === 'function') root.Plotly.purge(panel.plot);
    else purge(panel.plot);
    panel.card && panel.card.remove();
  }
  async function exportChart(element, options) {
    const state = states.get(element);
    if (!state || !root.Plotly) throw new Error('グラフを描画してから書き出してください。');
    const out = output(options, { width: element.clientWidth || 640, height: element.clientHeight || 400 });
    const host = hostFor(element, out.width, out.height);
    const data = JSON.parse(JSON.stringify((element.data || []).filter(trace => !trace?.meta?.observationHighlight)));
    const layout = graphLayout(element.layout, out, state.chart);
    try { await root.Plotly.newPlot(host, data, layout, { displayModeBar: false, responsive: false }); return await root.Plotly.toImage(host, { format: out.format, width: out.width, height: out.height, scale: out.scale }); }
    finally { if (root.Plotly && typeof root.Plotly.purge === 'function') root.Plotly.purge(host); host.remove(); }
  }
  async function renderComparison(container, doc, options) {
    options = options || {}; if (!container) throw new Error('比較表示先がありません。');
    const spec = comparison(doc), warnings = spec.warnings.slice();
    container.className = 'comparison-grid';
    container.style.gridTemplateColumns = 'repeat(' + spec.columns + ', minmax(0, 1fr))';
    const previous = comparisonStates.get(container);
    const previousByItem = new Map((previous && previous.panels || []).map(panel => [panel.item, panel]));
    const panels = [];
    for (const item of spec.items) {
      let panel = previousByItem.get(item);
      if (!panel) {
        const card = container.ownerDocument.createElement('section'); card.className = 'comparison-card';
        const heading = container.ownerDocument.createElement('button'); heading.type = 'button'; heading.className = 'comparison-title';
        const plot = container.ownerDocument.createElement('div'); plot.className = 'comparison-plot'; plot.style.minHeight = '220px';
        const summary = container.ownerDocument.createElement('p'); summary.className = 'comparison-summary';
        card.append(heading, plot, summary); panel = { item, card, heading, plot, summary, mode: null }; }
      const { card, heading, plot, summary } = panel; heading.textContent = titleFor(item, doc); heading.setAttribute('aria-label', heading.textContent + 'を単独で表示'); heading.onclick = typeof options.onSelect === 'function' ? () => options.onSelect(item) : null;
      container.appendChild(card);
      try {
        const view = item === 'main' && panel.mode === doc.mode && doc.mode !== '3d' && plot.layout && JSON.stringify(previous?.doc.axes)===JSON.stringify(doc.axes) ? { x: plot.layout.xaxis && plot.layout.xaxis.range, y: plot.layout.yaxis && plot.layout.yaxis.range } : null;
        const result = item === 'main' ? await root.GraphPlot.render(plot, doc, { dark: !!options.dark, fontSize: options.fontSize, compactLegend:true, camera:panel.mode===doc.mode?undefined:options.camera, selectedRow: options.selectedRow, onRowSelect: options.onRowSelect, onBlankClick: options.onBlankClick }) : await renderChart(plot, chartById(doc, item), doc, {...options,title:false});
        if (view && root.Plotly && typeof root.Plotly.relayout === 'function') { const changes = {}; if (Array.isArray(view.x)) changes['xaxis.range'] = view.x; if (Array.isArray(view.y)) changes['yaxis.range'] = view.y; if (Object.keys(changes).length) await root.Plotly.relayout(plot, changes); }
        summary.textContent = result.summary || '';
        warnings.push(...(result.warnings || [])); panel.mode = item === 'main' ? doc.mode : null; panels.push(panel);
      } catch (error) { summary.textContent = error.message; warnings.push(titleFor(item, doc) + '：' + error.message); panels.push(panel); }
    }
    for (const panel of previousByItem.values()) if (!panels.includes(panel)) purgePanel(panel);
    comparisonStates.set(container, { doc, options, spec, panels });
    return { warnings: unique(warnings) };
  }
  async function resetView(element) {
    if (!element) return;
    if (states.has(element)) {
      if (!root.Plotly || typeof root.Plotly.relayout !== 'function') return;
      const state = states.get(element), chart = state.chart || {}, axes = chart.axes || {}, changes = {};
      if (chart.kind === 'matrix' && root.GraphCharts && typeof root.GraphCharts.build === 'function') {
        const built = root.GraphCharts.build(chart, state.doc, { dark: !!state.options?.dark, fontSize: state.options?.fontSize });
        for (const [key, axis] of Object.entries(built.layout || {})) if (/^xaxis\d*$|^yaxis\d*$/.test(key)) {
          if (Array.isArray(axis?.range)) { changes[key + '.range'] = axis.range; changes[key + '.autorange'] = false; }
          else changes[key + '.autorange'] = true;
        }
        return root.Plotly.relayout(element, changes);
      }
      for (const key of ['x', 'y']) { const axis = axes[key] || {}; if (Number.isFinite(axis.min) && Number.isFinite(axis.max) && axis.min < axis.max) { changes[key + 'axis.range'] = [axis.min, axis.max]; changes[key + 'axis.autorange'] = false; } else changes[key + 'axis.autorange'] = true; }
      return root.Plotly.relayout(element, changes);
    }
    const state = comparisonStates.get(element); if (!state) return;
    return Promise.all(state.panels.map(panel => panel.item === 'main' ? root.GraphPlot && typeof root.GraphPlot.resetView === 'function' ? root.GraphPlot.resetView(panel.plot, state.doc) : undefined : resetView(panel.plot)));
  }
  function loadImage(doc, src) { return new Promise((resolve, reject) => { const image = new doc.defaultView.Image(); image.onload = () => resolve(image); image.onerror = reject; image.src = src; }); }
  const encode = value => 'data:image/svg+xml;base64,' + btoa(unescape(encodeURIComponent(value)));
  function svgImage(url, x, y, width, height) { return '<image x="' + x + '" y="' + y + '" width="' + width + '" height="' + height + '" preserveAspectRatio="none" href="' + url.replace(/&/g, '&amp;').replace(/"/g, '&quot;') + '"/>'; }
  async function panelImage(item, doc, owner, out, livePlot) {
    // GraphPlot's established export contract has a 320px minimum height.
    // Render it larger when a dense comparison cell is shorter, then fit the
    // finished image into that cell without touching the live plot.
    const imageOptions = Object.assign({}, out, { width: Math.max(320, out.width), height: Math.max(320, out.height) });
    if (livePlot) return item === 'main' ? root.GraphPlot.exportImage(livePlot, imageOptions) : exportChart(livePlot, imageOptions);
    const panel = hostFor(owner, imageOptions.width, imageOptions.height);
    try {
      if (item === 'main') {
        if (doc.mode === '3d' && out.format === 'svg') throw new Error('3D グラフを含む比較はSVGで書き出せません。PNGを選んでください。');
        await root.GraphPlot.render(panel, doc, {compactLegend:true}); return await root.GraphPlot.exportImage(panel, imageOptions);
      }
      await renderChart(panel, chartById(doc, item), doc, {}); return await exportChart(panel, imageOptions);
    } finally { if(item==='main')root.GraphPlot.dispose(panel);else purge(panel);panel.remove(); }
  }
  const svgText = value => text(value).replace(/[&<>"']/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
  function fitTitle(doc,value,width,fontSize) {
    const context=doc.createElement('canvas').getContext('2d');context.font='600 '+fontSize+'px -apple-system,BlinkMacSystemFont,sans-serif';
    const characters=Array.from(text(value));if(context.measureText(characters.join('')).width<=width)return characters.join('');
    let low=0,high=characters.length;while(low<high){const mid=Math.ceil((low+high)/2);if(context.measureText(characters.slice(0,mid).join('')+'…').width<=width)low=mid;else high=mid-1;}
    return characters.slice(0,low).join('')+'…';
  }
  async function exportComparison(container, doc, options) {
    const spec = comparison(doc); if (!spec.items.length) throw new Error('比較するグラフを選んでください。');
    const base = output(options, { width: Math.max(640, container && container.clientWidth || 640), height: 480 });
    const gap = base.margin, titleHeight = Math.max(24, base.fontSize + 10), columns = Math.min(spec.columns, spec.items.length), rows = Math.ceil(spec.items.length / columns);
    const panelWidth = Math.floor((base.width - gap * (columns + 1)) / columns), panelHeight = Math.floor((base.height - gap * (rows + 1)) / rows);
    const plotHeight = panelHeight - titleHeight;
    if (panelWidth < 260 || plotHeight < 220) throw new Error('比較の各グラフが小さすぎます。「比較に合わせて画像サイズを調整」を押すか、幅・高さ・列数を変更してください。');
    const panelOptions = Object.assign({}, base, { width: panelWidth, height: plotHeight, margin: Math.max(24, Math.min(base.margin, 64)), scale: base.scale, title:false });
    const titles=spec.items.map(item=>fitTitle(container.ownerDocument,titleFor(item,doc),panelWidth,base.fontSize));
    const live = comparisonStates.get(container);
    const livePlots = new Map((live && live.panels || []).map(panel => [panel.item, panel.plot]));
    const urls = [];
    for (const item of spec.items) urls.push(await panelImage(item, doc, container, panelOptions, livePlots.get(item)));
    if (base.format === 'svg') {
      const bg = base.background === 'white' ? '<rect width="100%" height="100%" fill="#fff"/>' : '';
      const images = urls.map((url, index) => { const x = gap + (index % columns) * (panelWidth + gap), y = gap + Math.floor(index / columns) * (panelHeight + gap); return '<text x="' + x + '" y="' + (y + base.fontSize) + '" fill="#172033" font-family="-apple-system,BlinkMacSystemFont,sans-serif" font-size="' + base.fontSize + '" font-weight="600">' + svgText(titles[index]) + '</text>' + svgImage(url, x, y + titleHeight, panelWidth, plotHeight); }).join('');
      return encode('<svg xmlns="http://www.w3.org/2000/svg" width="' + base.width + '" height="' + base.height + '" viewBox="0 0 ' + base.width + ' ' + base.height + '">' + bg + images + '</svg>');
    }
    const canvas = container.ownerDocument.createElement('canvas'); canvas.width = base.width * base.scale; canvas.height = base.height * base.scale;
    const context = canvas.getContext('2d'); context.scale(base.scale, base.scale); if (base.background === 'white') { context.fillStyle = '#fff'; context.fillRect(0, 0, base.width, base.height); }
    context.fillStyle = '#172033'; context.font = '600 ' + base.fontSize + 'px -apple-system,BlinkMacSystemFont,sans-serif'; context.textBaseline = 'top';
    for (let index = 0; index < urls.length; index++) { const x = gap + (index % columns) * (panelWidth + gap), y = gap + Math.floor(index / columns) * (panelHeight + gap); context.fillText(titles[index], x, y); const image = await loadImage(container.ownerDocument, urls[index]); context.drawImage(image, x, y + titleHeight, panelWidth, plotHeight); }
    return canvas.toDataURL('image/png');
  }
  return { comparison, renderChart, resize, purge, resetView, exportChart, renderComparison, exportComparison };
}));
