const http = require('http');
const assert = require('assert');
const path = require('path');
const fs = require('fs');
const os = require('os');
let chromium;
try { ({ chromium } = require('playwright')); }
catch (_) { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }

const root = path.resolve(__dirname, '..');
const server = http.createServer((req, res) => {
  const file = path.resolve(root, '.' + new URL(req.url, 'http://localhost').pathname);
  if (!file.startsWith(root) || !fs.existsSync(file)) { res.writeHead(404); return res.end(); }
  res.setHeader('Content-Type', file.endsWith('.js') ? 'text/javascript' : 'text/html');
  res.end(fs.readFileSync(file));
});

(async () => {
  await new Promise(resolve => server.listen(0, '127.0.0.1', resolve));
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    const port = server.address().port;
    await page.setContent(`<div id="graph" style="width:700px;height:500px"></div><script src="http://127.0.0.1:${port}/vendor/plotly.min.js"></script><script src="http://127.0.0.1:${port}/expression.js"></script><script src="http://127.0.0.1:${port}/symbols.js"></script><script src="http://127.0.0.1:${port}/plot.js"></script>`);
    const result = await page.evaluate(async () => {
      const axis = (key, extra = {}) => ({ min: -2, max: 2, label: key, symbol: key, unit: '', scale: 'linear', ticks: { step: null, format: 'auto' }, labelPosition: 'edge', ...extra });
      const doc = { mode: '2d', angle: 'rad', presentation: { axisArrows: false, originLabel: false, tickMarks: true, tickLabels: true }, axes: { x: axis('x', { min: 1, max: 100, scale: 'log', labelPosition: 'axis' }), y: axis('y', { min: -1, max: 1, labelPosition: 'axis' }), z: axis('z') }, parameters: [], grid: true, legend: false, equalScale: false, series: [], annotations: [] };
      const graph = document.querySelector('#graph'); await GraphPlot.render(graph, doc, {});
      const positioned = { tickvals: graph.layout.xaxis.tickvals, full: graph._fullLayout.xaxis._vals.map(item => ({ x: item.x, text: item.text })), annotations: graph.layout.annotations.filter(item => item.name.startsWith('__graph_axis_tick_x')).map(item => ({ x: item.x, text: item.text })), grid: [...graph.querySelectorAll('.xgrid')].map(item => item.getAttribute('transform')) };
      doc.axes.x = axis('x', { min: 2, max: 8, scale: 'log', labelPosition: 'axis' });
      doc.presentation.tickMarks = false;
      await GraphPlot.render(graph, doc, {});
      const narrow = { tickvals: graph.layout.xaxis.tickvals, ticks: graph.layout.xaxis.ticks, annotations: graph.layout.annotations.filter(item => item.name.startsWith('__graph_axis_tick_x')).map(item => item.x) };
      doc.axes.x = axis('x', { min: 2.3, max: 2.7, scale: 'log', labelPosition: 'axis' });
      doc.presentation.tickMarks = true;
      await GraphPlot.render(graph, doc, {});
      const fractional = { tickvals: graph.layout.xaxis.tickvals, annotations: graph.layout.annotations.filter(item => item.name.startsWith('__graph_axis_tick_x')).map(item => item.x) };
      return { positioned, narrow, fractional };
    });
    assert.deepEqual(result.positioned.tickvals, [1, 10, 100], 'log tickvals は対数値ではなく実数値で渡す');
    assert.deepEqual(result.positioned.full, [{ x: 0, text: '1' }, { x: 1, text: '10' }, { x: 2, text: '100' }], 'Plotly の対数目盛は log10 座標へ配置される');
    assert.deepEqual(result.positioned.annotations, result.positioned.full, '軸上の数値を目盛線と同じ実座標へ配置する');
    assert(result.positioned.grid.length > 0, '軸上表示でもグリッドを描く');
    assert(result.narrow.tickvals.length >= 3 && result.narrow.tickvals.length <= 6, '狭い対数範囲でも読み取れる数の目盛を出す');
    assert(result.narrow.tickvals.every(value => value >= 2 && value <= 8));
    assert(result.narrow.annotations.every((value, index) => Math.abs(value - Math.log10(result.narrow.tickvals[index])) < 1e-12), '狭い対数範囲でも目盛と注釈を一致させる');
    assert.equal(result.narrow.ticks, '', '目盛線を隠す設定を維持する');
    assert(result.fractional.tickvals.length >= 3 && result.fractional.tickvals.length <= 6, '整数×10^nがない対数範囲も空にしない');
    assert(result.fractional.tickvals.every(value => value >= 2.3 && value <= 2.7));
    assert(result.fractional.annotations.every((value, index) => Math.abs(value - Math.log10(result.fractional.tickvals[index])) < 1e-12));
    console.log('axis-label-browser.test.cjs: ok');
  } finally { await browser.close(); await new Promise(resolve => server.close(resolve)); }
})().catch(error => { console.error(error); process.exitCode = 1; });
