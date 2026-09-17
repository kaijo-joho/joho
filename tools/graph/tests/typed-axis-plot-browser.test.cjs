const assert = require('assert');
const http = require('http');
const path = require('path');
const fs = require('fs');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');
const day = text => Date.parse(text + 'T00:00:00Z') / 86400000;
const server = http.createServer((req, res) => { const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname); if (!file.startsWith(root) || !fs.existsSync(file)) return res.writeHead(404).end(); res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html'); res.end(fs.readFileSync(file)); });
(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } }), port = server.address().port;
    await page.setContent(`<div id="plot" style="width:700px;height:480px"></div><script src="http://127.0.0.1:${port}/vendor/plotly.min.js"></script><script src="http://127.0.0.1:${port}/analysis.js"></script><script src="http://127.0.0.1:${port}/data-curves.js"></script><script src="http://127.0.0.1:${port}/symbols.js"></script><script src="http://127.0.0.1:${port}/tables.js"></script><script src="http://127.0.0.1:${port}/annotations.js"></script><script src="http://127.0.0.1:${port}/plot.js"></script>`);
    const result = await page.evaluate(async () => {
      const day = text => Date.parse(text + 'T00:00:00Z') / 86400000, axis = (type, min, max, categories = []) => ({ type, categories, min, max, label: type, symbol: type, unit: '', scale: 'linear', ticks: { step: null, format: 'auto' }, labelPosition: 'axis' });
      const doc = { mode: '2d', axes: { x: axis('date', day('2024-01-30'), day('2024-03-03')), y: axis('category', -.5, 2.5, ['低', '中', '高']), z: axis('number', -1, 1) }, parameters: [], grid: true, legend: true, equalScale: true, presentation: { axisArrows: true, originLabel: true, tickMarks: true, tickLabels: true }, series: [{ id: 'data', kind: 'data2d', name: '観測', rows: [[day('2024-01-31'), 0], [day('2024-02-29'), 2]], dataTable: { columnTypes: ['date', 'category'], mapping: { x: 0, y: 1 }, rows: [['2024-01-31', '低'], ['2024-02-29', '高']] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: true, lines: false, opacity: 1 } }, { id: 'f', kind: 'function', name: '式', expression: 'x', visible: true, style: { color: '#dc2626', width: 2, dash: 'solid', points: false, lines: true, opacity: 1 } }], annotations: [{ id: 'a', kind: 'point', name: '注釈', visible: true }] };
      const plot = document.querySelector('#plot'); await GraphPlot.render(plot, doc, {});
      const image = await GraphPlot.exportImage(plot, { format: 'svg', width: 600, height: 400, margin: 32, fontSize: 14, scale: 1, background: 'white' }); const initial = { ticks: plot.layout.xaxis.ticktext, categories: plot.layout.yaxis.ticktext, traces: plot.data.map(x => x.name), hover: plot.data[0].hovertemplate, equal: plot.layout.yaxis.scaleanchor };
      const categories = structuredClone(doc); categories.axes.x = axis('category', -.5, 2.5, ['春', '夏', '秋']); categories.axes.y = axis('number', 0, 5); categories.series = [
        { ...doc.series[0], id: 'first', rows: [[1, 1], [0, 2]], dataTable: { columnTypes: ['category', 'number'], mapping: { x: 0, y: 1 }, rows: [['夏', 1], ['春', 2]] } },
        { ...doc.series[0], id: 'second', rows: [[2, 3], [1, 4]], dataTable: { columnTypes: ['category', 'number'], mapping: { x: 0, y: 1 }, rows: [['秋', 3], ['夏', 4]] } }
      ]; categories.annotations = []; await GraphPlot.render(plot, categories, {}); const categoryResult = { ticks: plot.layout.xaxis.ticktext, x: plot.data.map(trace => trace.x), image: await GraphPlot.exportImage(plot, { format: 'svg', width: 600, height: 400, margin: 32, fontSize: 14, scale: 1, background: 'white' }) };
      const regression = structuredClone(doc); regression.axes.y = axis('number', 0, 7); regression.series = [{ ...doc.series[0], rows: [[day('2024-01-31'), 1], [day('2024-02-29'), 3], [day('2024-03-31'), 6]], errorBars: { x: [1, 2, 1], y: [.1, .2, .1] }, interpolation: 'monotone', style: { ...doc.series[0].style, lines: true }, dataTable: { columnTypes: ['date', 'number'], mapping: { x: 0, y: 1 }, rows: [['2024-01-31', 1], ['2024-02-29', 3], ['2024-03-31', 6]] } }]; regression.annotations = [{ id: 'fit', kind: 'regression', name: '日付回帰', visible: true, seriesId: 'data', model: 'linear', showEquation: true, showMetrics: true, style: { color: '#dc2626', width: 2, dash: 'solid', opacity: 1 }, label: { visible: true, dx: 12, dy: -12, size: 13 } }]; let view; await GraphPlot.render(plot, regression, { onViewChange: value => { view = value; } }); plot.emit('plotly_relayout', { 'xaxis.range': [day('2024-02-01') + .25, day('2024-02-20') + .75] }); const regressionResult = { traces: plot.data.map(x => x.name), annotations: plot.layout.annotations.map(a => a.text), view, interpolation: plot.data.some(x => x.mode === 'lines'), errorX: plot.data[0].error_x?.array, errorY: plot.data[0].error_y?.array };
      const numeric = structuredClone(regression); numeric.axes.x = axis('number',-10,10);
      await GraphPlot.render(plot,numeric,{selectedRow:{seriesId:'data',rowIndex:0}});
      const wrongAxis = {traces:plot.data.length,annotations:plot.layout.annotations.filter(a=>a.name==='fit').length,compatible:GraphPlot.seriesAxisCompatible(numeric.series[0],numeric)};
      return { wrongAxis, ...initial, categoryTicks: categoryResult.ticks, categoryX: categoryResult.x, categoryImage: categoryResult.image, image, regression: regressionResult, compatible: { ok: GraphPlot.seriesAxisCompatible(regression.series[0], regression), formula: GraphPlot.seriesAxisCompatible(doc.series[1], regression) } };
    });
    assert.deepEqual(result.wrongAxis,{traces:0,annotations:0,compatible:false},'数値軸へ戻すと日付系列・回帰・選択点を描かない');
    assert(result.ticks.includes('2024-02-01'), '月境界をUTC日数へ正しく置く');
    assert.deepEqual(result.categories, ['低', '中', '高']);
    assert(!result.traces.includes('式'), '型付き軸では数式を描画しない');
    assert.match(result.hover, /customdata/, 'ホバーは元の値を使う');
    assert.deepEqual(result.categoryTicks, ['春', '夏', '秋']);
    assert.deepEqual(result.categoryX, [[1, 0], [2, 1]], '別系列でもカテゴリ順を共有する');
    assert.match(result.categoryImage, /^data:image\/svg\+xml/);
    assert(result.regression.traces.includes('日付回帰'), '日付回帰を主グラフに描く');
    assert(result.regression.annotations.some(text => text.includes('UTC日数として回帰')), '日付回帰の座標系を注記する');
    assert(result.regression.interpolation, '日付軸でPCHIP補間を維持する');
    assert.deepEqual(result.regression.errorX, [1, 2, 1]); assert.deepEqual(result.regression.errorY, [.1, .2, .1]);
    assert.deepEqual(result.regression.view.axes.x, { min: day('2024-02-01') + .25, max: day('2024-02-20') + .75 }, '小数日のパン・ズーム範囲を保持する');
    assert.equal(result.compatible.ok, true); assert.equal(result.compatible.formula, false);
    assert.equal(result.equal, undefined, '型付き軸では等倍率を強制しない');
    assert.match(result.image, /^data:image\/svg\+xml/);
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
