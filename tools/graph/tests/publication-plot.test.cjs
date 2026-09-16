const assert = require('assert');

global.GraphExpression = require('../expression.js');
const calls = [];
let purged = false;
global.Plotly = {
  react: async (element, data, layout) => { element.data = data; element.layout = layout; element._fullLayout = layout; calls.push(['react', layout]); },
  newPlot: async (element, data, layout) => { element.data = data; element.layout = layout; calls.push(['newPlot', layout]); },
  toImage: async (element, options) => { calls.push(['toImage', options]); return 'data:image/png;base64,AA=='; },
  purge: () => { purged = true; }
};
const Plot = require('../plot.js');

const makeElement = () => ({
  clientWidth: 640, clientHeight: 480, data: [], layout: {}, _fullLayout: {},
  ownerDocument: { body: { appendChild() {} }, createElement: () => ({ style: {}, ownerDocument: null, remove() {} }) },
  addEventListener() {}, removeEventListener() {}, on() {}, removeAllListeners() {}, getBoundingClientRect: () => ({ left: 0, top: 0 })
});
const document2d = (presentation = {}, output = null) => ({
  mode: '2d', angle: 'rad', name: '公開用グラフ', presentation,
  ...(output ? { output } : {}), axes: {
    x: { min: -2, max: 2, label: 'x', unit: '', scale: 'linear', ticks: { step: null, format: 'auto' } },
    y: { min: -2, max: 2, label: 'y', unit: '', scale: 'linear', ticks: { step: null, format: 'auto' } },
    z: { min: -2, max: 2, label: 'z', unit: '', scale: 'linear', ticks: { step: null, format: 'auto' } }
  }, equalScale: false, grid: true, legend: true, parameters: [], series: [], annotations: []
});

(async () => {
  const element = makeElement();
  await Plot.render(element, document2d({ axisArrows: true, originLabel: true, tickMarks: false, tickLabels: false }), {});
  const layout = calls.find(c => c[0] === 'react')[1];
  assert.equal(layout.xaxis.ticks, '');
  assert.equal(layout.xaxis.showticklabels, false);
  assert.equal(layout.yaxis.showticklabels, false);
  assert(layout.annotations.some(a => a.name === '__graph_axis_x' && a.showarrow));
  assert(layout.annotations.some(a => a.name === '__graph_axis_y' && a.showarrow));
  assert(layout.annotations.some(a => a.name === '__graph_origin_label' && a.text === 'O'));

  const logElement = makeElement();
  const logDoc = document2d({ axisArrows: true });
  logDoc.axes.x = { ...logDoc.axes.x, min: 1, max: 100, scale: 'log' };
  await Plot.render(logElement, logDoc, {});
  const logLayout = calls.filter(c => c[0] === 'react').at(-1)[1];
  assert(logLayout.annotations.some(a => a.name === '__graph_axis_y' && a.x === 0 && a.y === 1 && a.xref === 'paper'), '対数x軸のとき縦軸の矢印を左端へ置く');

  calls.length = 0;
  await Plot.exportImage(element, { format: 'png', width: 1200, height: 800, margin: 64, fontSize: 16, scale: 2, background: 'transparent' });
  const exportLayout = calls.find(c => c[0] === 'newPlot')[1];
  const image = calls.find(c => c[0] === 'toImage')[1];
  assert.deepEqual([exportLayout.width, exportLayout.height], [1200, 800]);
  assert.deepEqual(exportLayout.margin, { l: 64, r: 64, t: 64, b: 64 });
  assert.equal(exportLayout.paper_bgcolor, 'rgba(0,0,0,0)');
  assert.deepEqual([image.width, image.height, image.scale], [1200, 800, 2]);
  assert.equal(purged, true);

  await assert.rejects(() => Plot.exportImage(element, { format: 'png', width: 319, height: 800, margin: 64, fontSize: 16, scale: 1 }), /320/);
  await assert.rejects(() => Plot.exportImage(element, { format: 'png', width: 4096, height: 4096, margin: 64, fontSize: 16, scale: 3 }), /上限/);
  console.log('publication-plot.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
