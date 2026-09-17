const assert = require('assert');

global.GraphSymbols = { richText: value => String(value), ticksFor: () => ({}) };
global.GraphRegions = { areaText: () => '面積 ≈ 1', integralText: () => '定積分 ≈ 1' };
global.GraphAnalysis = { equation: () => 'y = x' };
global.GraphAnnotations = {
  evaluate(annotation) {
    const point = annotation.nonPositive ? [0, 100] : [10, 100];
    const common = { warning: '', points: [point], segments: [[[1, 1], [100, 100]]], labelPoint: point };
    if (annotation.kind === 'region') return { ...common, polygon: [[1, 1], [100, 1], [10, 100]], area: 1 };
    if (annotation.kind === 'curveRegion') return { ...common, polygons: [[[1, 1], [100, 1], [10, 100]]], area: 1, integral: 1 };
    if (annotation.kind === 'regression') return { ...common, fit: { r2: .99 } };
    return common;
  }
};
let exportedLayout = null;
global.Plotly = {
  react: async (element, data, layout) => { element.data = data; element.layout = layout; element._fullLayout = { xaxis: { d2p: value => value, _offset: 0, _length: 640 }, yaxis: { d2p: value => value, _offset: 0, _length: 480 } }; },
  newPlot: async (_host, _data, layout) => { exportedLayout = layout; },
  toImage: async () => 'data:image/png;base64,',
  purge: () => {}
};
const Plot = require('../plot.js');

const style = { color: '#2563eb', width: 2, dash: 'solid', opacity: 1 };
const label = { visible: true, dx: 0, dy: 0, size: 13 };
const annotations = () => [
  { id: 'region', kind: 'region', name: '領域', visible: true, showArea: true, style: { ...style, opacity: .3 }, label },
  { id: 'curve-region', kind: 'curveRegion', name: '曲線領域', visible: true, showArea: true, showIntegral: true, style: { ...style, opacity: .3 }, label },
  { id: 'point', kind: 'point', name: '点', visible: true, style, label },
  { id: 'guide', kind: 'guide', name: '補助線', visible: true, style, label },
  { id: 'text', kind: 'text', name: '文字', text: '説明', visible: true, style, label },
  { id: 'regression', kind: 'regression', name: '回帰', visible: true, showEquation: true, showMetrics: true, style, label }
];
function documentFor(scale, annotationList = annotations()) {
  return { mode: '2d', angle: 'rad', presentation: {}, output: { width: 640, height: 480, margin: 64, fontSize: 16, scale: 1, background: 'white', title: true }, axes: {
    x: { min: 1, max: 100, label: 'x', symbol: 'x', unit: '', scale, ticks: { step: null, format: 'auto' } },
    y: { min: 1, max: 100, label: 'y', symbol: 'y', unit: '', scale, ticks: { step: null, format: 'auto' } },
    z: { min: 1, max: 100, label: 'z', symbol: 'z', unit: '', scale: 'linear', ticks: { step: null, format: 'auto' } }
  }, parameters: [], series: [{ id: 'data', kind: 'data2d', name: 'データ', rows: [[10, 100]], visible: true, style: { ...style, points: true, lines: false } }], annotations: annotationList, grid: true, legend: true };
}
const ownerDocument = {
  body: { appendChild() {} },
  createElement() { return { style: {}, remove() {} }; },
  addEventListener() {}, removeEventListener() {}
};
const element = { clientWidth: 640, clientHeight: 480, ownerDocument, removeAllListeners() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }) };

(async () => {
  await Plot.render(element, documentFor('log'), {});
  for (const annotation of element.layout.annotations) {
    assert.strictEqual(annotation.x, 1, annotation.name + ' x is log10(10)');
    assert.strictEqual(annotation.y, 2, annotation.name + ' y is log10(100)');
  }
  const data = element.data.find(trace => trace.meta && trace.meta.objectId === 'data');
  assert.deepStrictEqual(data.x, [10], 'trace data remains in ordinary data coordinates');
  assert.deepStrictEqual(data.y, [100], 'trace data remains in ordinary data coordinates');
  await Plot.exportImage(element, { format: 'png', width: 320, height: 320, margin: 16, fontSize: 16, scale: 1, background: 'white', title: false });
  assert.ok(exportedLayout);
  for (const annotation of exportedLayout.annotations) {
    assert.strictEqual(annotation.x, 1, annotation.name + ' exported x remains log10(10)');
    assert.strictEqual(annotation.y, 2, annotation.name + ' exported y remains log10(100)');
  }

  const nonPositive = ['point', 'text', 'guide'].map(kind => ({ id: 'non-positive-' + kind, kind, name: '非正値' + kind, text: '説明', visible: true, nonPositive: true, style, label }));
  await Plot.render(element, documentFor('log', nonPositive), {});
  assert.strictEqual(element.layout.annotations.length, 0, '対数軸の非正値アンカーは annotation にしない');

  await Plot.render(element, documentFor('linear'), {});
  for (const annotation of element.layout.annotations) {
    assert.strictEqual(annotation.x, 10, annotation.name + ' x remains a linear coordinate');
    assert.strictEqual(annotation.y, 100, annotation.name + ' y remains a linear coordinate');
  }
  console.log('log-annotations.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
