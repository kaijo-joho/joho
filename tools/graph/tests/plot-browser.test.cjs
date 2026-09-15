const assert = require('assert');
const http = require('http');
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
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = server.address().port;
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage({ viewport: { width: 800, height: 600 } });
    await page.setContent(`<div id="graph" style="width:700px;height:500px"></div><script src="http://127.0.0.1:${port}/vendor/plotly.min.js"></script><script src="http://127.0.0.1:${port}/expression.js"></script><script src="http://127.0.0.1:${port}/symbols.js"></script><script src="http://127.0.0.1:${port}/plot.js"></script>`);
    const checks = await page.evaluate(async () => {
      const graph = document.querySelector('#graph');
      let views = 0;
      await GraphPlot.render(document.querySelector('#graph'), {
        mode: '3d', angle: 'rad', axes: { x: { min: -2, max: 2, label: '<x>', symbol: 'x', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} }, y: { min: -2, max: 2, label: 'y', symbol: 'y', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} }, z: { min: -4, max: 4, label: 'z', symbol: 'z', unit: '', scale: 'linear', ticks:{step:null,format:'auto'} } },
        parameters: [], grid: true, legend: true, equalScale: true,
        series: [{ id: 's', kind: 'surface', name: '<surface>', expression: 'x^2-y^2', domain: { x: [-2, 2], y: [-2, 2] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: .85 } }, { id: 'points', kind: 'data3d', name: '欠測', rows: [[1, null, 3], [1, 2, 3]], visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: true, lines: true, opacity: .85 } }]
      }, { dark: true, onViewChange: () => { views++; } });
      const svgError = await GraphPlot.exportImage(graph, { format: 'svg' }).then(() => '', (error) => error.message);
      graph.emit('plotly_relayout', { autosize: true });
      const afterAutosize = views;
      graph.emit('plotly_relayout', { 'scene.camera': { eye: { x: 2, y: 2, z: 2 } } });
      const original = Plotly.newPlot; let exportLayout;
      Plotly.newPlot = async (...args) => { exportLayout = args[2]; return original(...args); };
      const image = await GraphPlot.exportImage(graph, { format: 'png', background: 'white' });
      Plotly.newPlot = original;
      const webgl = graph.querySelectorAll('.gl-container canvas').length;
      const aspectmode = graph.layout.scene.aspectmode, dragmode = graph.layout.dragmode, legendClick = graph.layout.legend.itemclick;
      const missing = graph.data[1].x[0] === null && graph.data[1].y[0] === null && graph.data[1].z[0] === null, liveFont = graph.layout.font.color;
      return { webgl, aspectmode, dragmode, legendClick, missing, afterAutosize, afterCamera: views, image, exportFont: exportLayout.font.color, exportScene: exportLayout.scene.bgcolor, exportCamera: exportLayout.scene.camera.eye.x, liveFont, svgError };
    });
    assert.equal(checks.webgl, 1, '3D 曲面を WebGL canvas で描画する');
    const text = await page.locator('body').innerHTML();
    assert(!text.includes('<surface>'), '系列名を HTML として注入しない');
    assert.match(checks.svgError, /3D/);
    assert.equal(checks.aspectmode, 'data');
    assert.equal(checks.dragmode, 'orbit');
    assert.equal(checks.legendClick, false);
    assert(checks.missing, '欠測行は全座標を null にする');
    assert.equal(checks.afterAutosize, 0, 'autosize ではビューを通知しない');
    assert.equal(checks.afterCamera, 1, 'カメラ変更だけを通知する');
    assert.match(checks.image, /^data:image\/png/);
    assert.equal(checks.exportFont, '#172033');
    assert.equal(checks.exportScene, '#ffffff');
    assert.equal(checks.exportCamera, 2, '書き出しにも現在のカメラを使う');
    assert.equal(checks.liveFont, '#e5e7eb', '表示テーマを変えない');
    const beforeCamera = await page.evaluate(() => structuredClone(document.querySelector('#graph').layout.scene.camera.eye));
    await page.mouse.move(410, 300); await page.mouse.down(); await page.mouse.move(500, 340, { steps: 4 }); await page.mouse.up();
    await page.waitForTimeout(100);
    const afterCamera = await page.evaluate(() => structuredClone(document.querySelector('#graph').layout.scene.camera.eye));
    assert.notDeepEqual(afterCamera, beforeCamera, '3D の実マウスドラッグで視点を回転する');
    const viewCheck = await page.evaluate(async () => {
      const graph = document.querySelector('#graph'); let xOnlyView;
      const twoD = { mode: '2d', angle: 'rad', axes: { x: { min: -2, max: 2, label: 'x', symbol:'x', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} }, y: { min: 10, max: 20, label: 'y', symbol:'y', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} }, z: { min: -2, max: 2, label: 'z', symbol:'z', unit: '', scale: 'linear',ticks:{step:null,format:'auto'} } }, parameters: [], grid: true, legend: true, equalScale: false, series: [{ id: 'line', kind: 'function', name: 'x', expression: 'x', domain: { x: [-10, 10], y: [-10, 10] }, visible: true, style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: .85 } }] };
      await GraphPlot.render(graph, twoD, { onViewChange: (view) => { xOnlyView = view; } }); graph.emit('plotly_relayout', { 'xaxis.range': [0, 1] });
      const next = structuredClone(twoD); next.axes.x = xOnlyView.axes.x; await GraphPlot.render(graph, next, {});
      return { axes: Object.keys(xOnlyView.axes), y: graph.layout.yaxis.range, dragmode: graph.layout.dragmode };
    });
    assert.deepEqual(viewCheck.axes, ['x']);
    assert.deepEqual(viewCheck.y, [10, 20], 'x だけのズーム通知で y 範囲を復元しない');
    assert.equal(viewCheck.dragmode, 'pan');
    console.log('plot-browser.test.cjs: ok');
  } finally { await browser.close(); await new Promise((resolve) => server.close(resolve)); }
})().catch((error) => { console.error(error); process.exitCode = 1; });
