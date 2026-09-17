const assert = require('node:assert/strict');
const fs = require('node:fs'), http = require('node:http'), path = require('node:path'), os = require('node:os');
const Core = require('../core.js');
const Workspace = require('../workspace.js');
let chromium;
try { ({ chromium } = require('playwright')); } catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '../../..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + decodeURIComponent(req.url.split('?')[0]));
  if (!file.startsWith(root + path.sep) || !fs.existsSync(file)) { res.writeHead(404); return res.end('not found'); }
  res.writeHead(200, { 'Content-Type': file.endsWith('.js') ? 'text/javascript' : file.endsWith('.css') ? 'text/css' : 'text/html' }); res.end(fs.readFileSync(file));
});
(async () => {
  const spec = Workspace.comparison({ charts: [{ id: 'c1' }], comparison: { columns: 3, items: ['main', 'c1', 'c1', 'gone'] } });
  assert.deepEqual(spec.items, ['main', 'c1']); assert.equal(spec.columns, 3); assert.equal(spec.warnings.length, 2);
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 1000, height: 760 } });
    const base = 'http://127.0.0.1:' + server.address().port + '/tools/graph/';
    await page.setContent('<div id="workspace" style="width:900px;height:600px"></div>');
    for (const script of ['vendor/plotly.min.js', 'expression.js', 'symbols.js', 'curves.js', 'annotations.js', 'plot.js', 'tables.js', 'statistics.js', 'analysis.js', 'charts.js', 'workspace.js']) await page.addScriptTag({ url: base + script });
    const source = Core.createDocument(); source.name = 'ばねの測定';
    const series = Core.createSeries('data2d'); series.id = 'spring'; series.name = '伸びの測定'; series.rows = [[0, 1], [1, 2.8], [2, 5.1], [3, 6.9], [4, 9.2], [5, 10.8]]; series.dataTable = { columns: ['力', '伸び'], rows: series.rows, mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null } }; source.series = [series];
    const fit = Core.createAnnotation('regression'); fit.id = 'fit'; fit.name = 'ばねの回帰'; fit.seriesId = series.id; fit.model = 'linear'; source.annotations = [fit];
    source.charts = [{ id: 'residual', name: '残差', kind: 'residual', regressionId: 'fit', horizontal: 'x', color: '#2563eb' }, { id: 'scatter', name: '散布図', kind: 'scatter', seriesId: 'spring', xColumn: 0, yColumn: 1, model: 'linear', color: '#dc2626' }, { id: 'hist', name: 'ヒストグラム', kind: 'histogram', seriesId: 'spring', column: 1, bins: 3, color: '#059669' }];
    source.comparison = { columns: 2, items: ['main', 'residual', 'scatter', 'hist'] };
    const result = await page.evaluate(async source => {
      const before = JSON.stringify(source); const selected = [];
      const mounted = await GraphWorkspace.renderComparison(document.querySelector('#workspace'), source, { dark: true, onSelect: id => selected.push(id) });
      document.querySelector('.comparison-title').click();
      await Plotly.relayout(document.querySelectorAll('.comparison-plot')[0], { 'xaxis.range': [1, 3] });
      await Plotly.relayout(document.querySelectorAll('.comparison-plot')[1], { 'xaxis.range': [1, 4] });
      await GraphWorkspace.renderComparison(document.querySelector('#workspace'), source, { dark: true, onSelect: id => selected.push(id) });
      const rerenderedRanges = [document.querySelectorAll('.comparison-plot')[0].layout.xaxis.range.slice(), document.querySelectorAll('.comparison-plot')[1].layout.xaxis.range.slice()];
      const originalExport = GraphPlot.exportImage, exportedRanges = [];
      GraphPlot.exportImage = async (element, options) => { exportedRanges.push(element.layout.xaxis.range.slice()); return originalExport(element, options); };
      const originalNewPlot = Plotly.newPlot, exportLayouts = [];
      Plotly.newPlot = async (...args) => { exportLayouts.push(args[2]); return originalNewPlot(...args); };
      const svg = await GraphWorkspace.exportComparison(document.querySelector('#workspace'), source, { format: 'svg', width: 1000, height: 700, margin: 24, fontSize: 16, scale: 1, background: 'white' });
      // Inspect the actual exported panel SVGs, after mounting them for layout.
      const legendClearances = [], parser = new DOMParser();
      const combined = parser.parseFromString(await (await fetch(svg)).text(), 'image/svg+xml');
      for (const image of combined.querySelectorAll('image')) {
        const exported = parser.parseFromString(await (await fetch(image.getAttribute('href'))).text(), 'image/svg+xml');
        const host = document.createElement('div'); host.style.cssText = 'position:absolute;left:-10000px;top:0'; host.append(document.importNode(exported.documentElement, true)); document.body.append(host);
        const legend = host.querySelector('g.legend'), title = host.querySelector('.xtitle');
        if (legend && title) { const labels = [...legend.querySelectorAll('.legendtext')].map(label => label.getBoundingClientRect()); if (labels.length) legendClearances.push(Math.min(...labels.map(label => label.top)) - title.getBoundingClientRect().bottom); }
        host.remove();
      }
      const png = await GraphWorkspace.exportComparison(document.querySelector('#workspace'), source, { format: 'png', width: 1000, height: 700, margin: 24, fontSize: 16, scale: 2, background: 'transparent' });
      GraphPlot.exportImage = originalExport;
      Plotly.newPlot = originalNewPlot;
      const chartPng = await GraphWorkspace.exportChart(document.querySelectorAll('.comparison-plot')[1], { format: 'png', width: 420, height: 280, margin: 24, fontSize: 14, scale: 1, background: 'white' });
      await GraphWorkspace.resetView(document.querySelector('#workspace')); const resetRange = document.querySelectorAll('.comparison-plot')[0].layout.xaxis.range.slice();
      const cards = document.querySelectorAll('.comparison-card').length;
      const image = new Image(); await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = reject; image.src = svg; }); const canvas = document.createElement('canvas'); canvas.width = 1000; canvas.height = 700; canvas.getContext('2d').drawImage(image, 0, 0); const pixels = canvas.getContext('2d').getImageData(0, 0, 1000, 700).data;
      let blue = 0, red = 0, green = 0; for (let i = 0; i < pixels.length; i += 4) { const [r, g, b, a] = pixels.slice(i, i + 4); if (a > 180 && b > r * 1.3 && b > g * 1.2) blue++; if (a > 180 && r > g * 1.5 && r > b * 1.5) red++; if (a > 180 && g > r * 1.15 && g > b * 1.1) green++; }
      const pngBytes = new DataView(await (await fetch(png)).arrayBuffer());
      const three = { ...source, mode: '3d', annotations: [], series: [{ id: 'surface', kind: 'surface', name: '曲面', expression: 'x^2-y^2', domain: { x: [-2, 2], y: [-2, 2] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: .85 } }], comparison: { columns: 1, items: ['main'] } };
      await GraphWorkspace.renderComparison(document.querySelector('#workspace'), three, {}); await Plotly.relayout(document.querySelector('.comparison-plot'), { 'scene.camera': { eye: { x: 2, y: 1, z: 1.5 } } }); await GraphWorkspace.renderComparison(document.querySelector('#workspace'), three, {}); const camera = document.querySelector('.comparison-plot').layout.scene.camera.eye;
      const originalDispose = GraphPlot.dispose; let disposed = 0; GraphPlot.dispose = element => { disposed++; return originalDispose(element); }; GraphWorkspace.purge(document.querySelector('#workspace')); GraphPlot.dispose = originalDispose;
      const clickHost = document.createElement('div'); clickHost.style.cssText = 'width:700px;height:520px'; document.body.append(clickHost);
      const matrix = { id:'matrix', name:'散布図行列', kind:'matrix', seriesId:'spring', columns:[0,1], color:'#2563eb' }, rowClicks=[];
      await GraphWorkspace.renderChart(clickHost, matrix, source, { onRowSelect: row => rowClicks.push(row) });
      const initialMatrixRanges = { x:clickHost.layout.xaxis2.range.slice(), y:clickHost.layout.yaxis2.range.slice() };
      await Plotly.relayout(clickHost, { 'xaxis2.range':[1,1.2], 'yaxis2.range':[2,2.2] }); await GraphWorkspace.resetView(clickHost);
      const resetMatrixRanges = { x:clickHost.layout.xaxis2.range.slice(), y:clickHost.layout.yaxis2.range.slice() };
      const matrixTrace = clickHost.data.find(trace => trace.meta?.dataRows && trace.xaxis === 'x2'), matrixPoint = { data:matrixTrace, customdata:matrixTrace.customdata[0], x:matrixTrace.x[0], y:matrixTrace.y[0] }, matrixX = clickHost._fullLayout.xaxis2, matrixY = clickHost._fullLayout.yaxis2, matrixBox = clickHost.getBoundingClientRect();
      clickHost.emit('plotly_click', { points:[matrixPoint], event:{clientX:matrixBox.left + matrixX._offset + matrixX.d2p(matrixPoint.x),clientY:matrixBox.top + matrixY._offset + matrixY.d2p(matrixPoint.y)} });
      clickHost.emit('plotly_click', { points:[matrixPoint], event:{clientX:matrixBox.left + matrixX._offset + matrixX.d2p(matrixPoint.x) + 100,clientY:matrixBox.top + matrixY._offset + matrixY.d2p(matrixPoint.y)} });
      GraphWorkspace.purge(clickHost); clickHost.remove();
      return { legendClearances, mounted, selected, rowClicks, initialMatrixRanges, resetMatrixRanges, grid: getComputedStyle(document.querySelector('#workspace')).gridTemplateColumns, cards, unchanged: before === JSON.stringify(source), svg, png, chartPng, exportedRanges, rerenderedRanges, resetRange, camera, colors: { blue, red, green }, pngSize: [pngBytes.getUint32(16), pngBytes.getUint32(20)], whiteLayouts: exportLayouts.slice(0, 4).every(layout => layout.paper_bgcolor === '#ffffff' && layout.font.color === '#172033' && (!layout.xaxis || layout.xaxis.zerolinecolor !== '#e5e7eb')), disposed };
    }, source);
    assert(result.legendClearances.length >= 2 && result.legendClearances.every(gap => gap >= 1), '比較画像で横軸タイトルと凡例を重ねない: ' + JSON.stringify(result.legendClearances));
    assert.equal(result.cards, 4); assert.deepEqual(result.selected, ['main']); assert.equal(result.unchanged, true); assert.equal(result.disposed, 1, '比較を閉じるとメイングラフのPlotly listenerも破棄する');
    assert.deepEqual(result.rowClicks, [{ seriesId:'spring', rowIndex:0 }], '散布図行列は実際にクリックしたsubplotの座標だけを元行へ結び、離れた座標は選択しない');
    assert.deepEqual(result.resetMatrixRanges, result.initialMatrixRanges, '散布図行列はxaxis2/yaxis2を含むsubplotのズームをまとめて初期範囲へ戻す');
    assert.match(result.grid, /px/); assert.match(result.svg, /^data:image\/svg\+xml/); assert.match(result.png, /^data:image\/png/); assert.match(result.chartPng, /^data:image\/png/);
    assert(result.svg.length > 1000, 'SVG 出力が空ではない'); assert(result.png.length > 1000, 'PNG 出力が空ではない'); assert.deepEqual(result.rerenderedRanges, [[1, 3], [1, 4]], '同じ比較を再描画してもメインと統計グラフのズームを保つ'); assert.deepEqual(result.exportedRanges, [[1, 3], [1, 3]], '比較出力はライブのズーム範囲を使う'); assert.notDeepEqual(result.resetRange, [1, 3], '比較全体の表示範囲を初期状態へ戻せる'); assert.deepEqual(result.camera, { x: 2, y: 1, z: 1.5 }, '同じ比較を再描画しても3Dカメラを保つ'); assert.deepEqual(result.pngSize, [2000, 1400], '比較PNGの倍率を各パネルと合成結果へ反映する'); assert.equal(result.whiteLayouts, true, 'ダーク表示から白背景へ出力すると軸・ゼロ線を含めて黒字にする');
    assert(result.colors.blue > 30 && result.colors.red > 30 && result.colors.green > 30, 'SVGに埋め込んだ実グラフはChromeで色付きの曲線・棒として描画される');
    console.log('workspace.test.cjs: ok');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
