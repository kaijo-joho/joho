const assert = require('assert');

global.GraphSymbols = { richText: value => String(value).replace(/</g, '&lt;'), ticksFor: () => ({}) };
global.GraphRegions = {
  containsPoint: (polygon, point) => polygon.length >= 3 && point[0] >= 0 && point[0] <= 2 && point[1] >= 0 && point[1] <= 1,
  areaText: (area, doc) => '面積 ≈ ' + Number(area.toPrecision(8)) + (doc.axes.x.unit && doc.axes.y.unit ? ' [' + doc.axes.x.unit + ' × ' + doc.axes.y.unit + ']' : ''),
  integralText: integral => '定積分 ≈ ' + Number(integral.toPrecision(8))
};
global.GraphAnnotations = {
  evaluate(annotation) {
    if (annotation.warning) return { points: [], segments: [], polygon: [], area: null, labelPoint: null, warning: annotation.warning };
    const polygons = annotation.polygons || [[[0, 0], [2, 0], [2, 1]], [[0, 2], [1, 2], [1, 3]]];
    return { points: [], segments: [], polygon: annotation.polygon || polygons[0], polygons, area: 2, integral: 1.25, labelPoint: [1, .5], warning: '' };
  }
};
let last = null;
global.Plotly = { react: async (element, data, layout) => { element.data = data; element.layout = layout; element._fullLayout = { xaxis: { d2p: x => x * 100, _offset: 0, _length: 400 }, yaxis: { d2p: y => y * 100, _offset: 0, _length: 300 } }; last = { data, layout }; }, newPlot: async () => {}, purge: () => {}, toImage: async () => 'data:image/png;base64,' };
const Plot = require('../plot.js');

const axis = unit => ({ min: -1, max: 3, label: 'axis', symbol: 'a', unit, scale: 'linear', ticks: { step: null, format: 'auto' } });
const element = { clientWidth: 640, clientHeight: 480, removeAllListeners() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), ownerDocument: { addEventListener() {}, removeEventListener() {} } };
const base = (annotations, mode = '2d') => ({ mode, angle: 'rad', axes: { x: axis('cm'), y: axis('cm'), z: axis('') }, parameters: [], series: [{ id: 's', kind: 'data2d', name: '系列', rows: [[0, 0], [2, 1]], visible: true, style: { color: '#00f', width: 2, dash: 'solid', points: false, lines: true, opacity: 1 } }], annotations });

(async () => {
  await Plot.render(element, base([{ id: 'r', kind: 'region', name: '領域', showArea: true, visible: true, polygon: [[0, 0], [2, 0], [2, 1]], style: { color: '#f00', opacity: .25 }, label: { visible: true, dx: 8, dy: -8, size: 13 } }]));
  assert.equal(last.data[0].meta.kind, 'region', '領域は系列より先に描画する');
  assert.equal(last.data[0].fill, 'toself');
  assert.equal(last.data[0].opacity, .25);
  assert.equal(last.data[0].line.width, 0);
  assert.equal(last.layout.annotations.length, 1, '名前と面積を1つのannotationにまとめる');
  assert.match(last.layout.annotations[0].text, /領域/);
  assert.match(last.layout.annotations[0].text, /面積/);
  assert.equal(last.layout.annotations[0].opacity, 1, 'ラベルは塗りつぶしopacityを継承しない');
  assert.equal(last.layout.annotations[0].xshift, 8);
  assert.equal(last.layout.annotations[0].yshift, 8);

  await Plot.render(element, base([{ id: 'cr', kind: 'curveRegion', name: '曲線領域', showArea: true, showIntegral: true, visible: true, style: { color: '#0a0', opacity: .3 }, label: { visible: true, dx: 3, dy: -4, size: 12 } }]));
  assert.equal(last.data.filter(trace => trace.meta.kind === 'curveRegion').length, 2, '複数ローブを同じ注釈として塗る');
  assert.equal(last.layout.annotations.length, 1, '曲線領域のラベルも1つにまとめる');
  assert.match(last.layout.annotations[0].text, /面積/);
  assert.match(last.layout.annotations[0].text, /定積分/);
  assert.equal(last.layout.annotations[0].opacity, 1);

  await Plot.render(element, base([{ id: 'cr', kind: 'curveRegion', name: '非表示', showArea: false, showIntegral: false, visible: true, style: { color: '#0a0', opacity: .3 }, label: { visible: false, dx: 0, dy: 0, size: 12 } }]));
  assert.equal(last.layout.annotations.length, 0, '名前・面積・定積分をすべて非表示にできる');
  await Plot.render(element, base([{ id: 'zero', kind: 'curveRegion', name: '零領域', showArea: true, showIntegral: true, visible: true, polygons: [], style: { color: '#0a0', opacity: .3 }, label: { visible: false, dx: 0, dy: 0, size: 12 } }]));
  assert.equal(last.data.length, 1, '零面積ローブは塗らない');
  assert.equal(last.layout.annotations.length, 1, '零面積でも面積・定積分を表示する');
  assert.match(last.layout.annotations[0].text, /面積/);
  assert.match(last.layout.annotations[0].text, /定積分/);

  await Plot.render(element, base([{ id: 'r', kind: 'region', name: '名前', showArea: true, visible: true, style: { color: '#f00', opacity: .2 }, label: { visible: false, dx: 0, dy: 0, size: 13 } }]));
  assert.equal(last.layout.annotations.length, 1, '名前OFFでも面積を表示する');
  assert(!last.layout.annotations[0].text.includes('名前'));
  await Plot.render(element, base([{ id: 'r', kind: 'region', name: '名前', showArea: false, visible: true, style: { color: '#f00', opacity: .2 }, label: { visible: true, dx: 0, dy: 0, size: 13 } }]));
  assert.equal(last.layout.annotations.length, 1, '面積OFFでも名前を表示する');
  assert(!last.layout.annotations[0].text.includes('面積'));

  const warning = await Plot.render(element, base([{ id: 'bad', kind: 'region', name: '不正', showArea: true, visible: true, warning: '閉じていません', style: { color: '#f00', opacity: .5 }, label: { visible: true, dx: 0, dy: 0, size: 13 } }]));
  assert.equal(last.data.length, 1, '警告時は領域を描画しない');
  assert.match(warning.warnings[0], /閉じていません/);
  const curveWarning = await Plot.render(element, base([{ id: 'badCurve', kind: 'curveRegion', name: '不正曲線領域', showArea: true, showIntegral: true, visible: true, warning: '区間が不正', style: { color: '#f00', opacity: .5 }, label: { visible: true, dx: 0, dy: 0, size: 13 } }]));
  assert.equal(last.data.length, 1, '曲線領域の警告時は描画しない');
  assert.match(curveWarning.warnings[0], /区間が不正/);
  await Plot.render(element, base([{ id: 'r', kind: 'region', name: '3Dでは非表示', showArea: true, visible: true, style: { color: '#f00', opacity: .5 }, label: { visible: true, dx: 0, dy: 0, size: 13 } }], '3d'));
  assert.equal(last.data.length, 0, '3Dでは領域を描画しない');
  console.log('region-plot.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
