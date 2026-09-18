const assert = require('assert');
const Core = require('../core.js');

const current = Core.createDocument();
const currentVersion = current.version;
assert.equal(current.version, currentVersion);
assert.equal(current.axes.x.labelPosition, 'edge');
assert.equal(current.axes.y.labelPosition, 'edge');

const v10 = Core.createDocument();
v10.version = 10;
for (const key of ['x', 'y', 'z']) delete v10.axes[key].labelPosition;
const migrated = Core.validateDocument(v10);
assert.equal(migrated.version, currentVersion);
assert.equal(migrated.axes.x.labelPosition, 'edge');
assert.equal(migrated.axes.y.labelPosition, 'edge');

const positioned = Core.createDocument();
positioned.axes.x.labelPosition = 'axis';
positioned.axes.y.labelPosition = 'edge';
const saved = Core.validateDocument(JSON.stringify(positioned));
assert.equal(saved.axes.x.labelPosition, 'axis');
assert.equal(saved.axes.y.labelPosition, 'edge');

const invalid = Core.createDocument();
invalid.axes.x.labelPosition = 'center';
assert.throws(() => Core.validateDocument(invalid), /目盛数値の位置/);

global.GraphExpression = require('../expression.js');
global.GraphSymbols = require('../symbols.js');
const calls = [];
let exported;
global.Plotly = {
  react: async (element, data, layout) => { element.data = data; element.layout = layout; calls.push(layout); },
  newPlot: async (_element, _data, layout) => { exported = layout; },
  toImage: async () => 'data:image/png;base64,AA==',
  purge() {}
};
const Plot = require('../plot.js');
const element = () => ({ clientWidth: 640, clientHeight: 480, data: [], layout: {}, addEventListener() {}, removeEventListener() {}, on() {}, removeAllListeners() {}, getBoundingClientRect: () => ({ left: 0, top: 0 }), ownerDocument: { body: { appendChild() {} }, createElement: () => ({ style: {}, remove() {} }) } });

(async () => {
  const doc = Core.createDocument();
  doc.axes.x = { ...doc.axes.x, min: -Math.PI, max: Math.PI, labelPosition: 'axis', ticks: { step: Math.PI / 2, format: 'pi' } };
  doc.axes.y = { ...doc.axes.y, min: -2, max: 2, labelPosition: 'axis', ticks: { step: 1, format: 'fraction' } };
  const graph = element();
  await Plot.render(graph, doc, {});
  let layout = calls.at(-1);
  assert.equal(layout.xaxis.showticklabels, false);
  assert.equal(layout.yaxis.showticklabels, false);
  assert.equal(layout.xaxis.tickvals.length, 5);
  assert(Math.abs(layout.xaxis.tickvals[3] - Math.PI / 2) < 1e-10);
  const axisTicks = layout.annotations.filter(item => item.name.startsWith('__graph_axis_tick_'));
  assert(axisTicks.some(item => item.text === 'π/2'));
  assert(axisTicks.some(item => item.text === '1'));
  assert(!axisTicks.some(item => item.text === '0' && item.meta.axisTick === 'x'), '原点では横軸の数値を省く');
  assert.equal(doc.annotations.length, 0, '軸目盛は利用者の注釈を消費しない');
  await Plot.exportImage(graph, { format: 'png', width: 640, height: 480, margin: 64, fontSize: 16, scale: 1, background: 'white' });
  assert(exported.annotations.some(item => item.name.startsWith('__graph_axis_tick_x')), '画像書き出しにも軸上の数値を含める');

  const styled = Core.createDocument();
  styled.grid = false; styled.presentation.axisArrows = true;
  styled.axes.x = { ...styled.axes.x, labelPosition:'axis', style:{color:'#991b1b',width:4,grid:true,gridColor:'#0f766e',gridWidth:2,gridDash:'dash',tickMarks:false,tickLabels:true} };
  styled.axes.y = { ...styled.axes.y, style:{color:'#1d4ed8',width:3} };
  const styledGraph = element();
  await Plot.render(styledGraph, styled, {});
  layout = calls.at(-1);
  assert.deepStrictEqual({color:layout.xaxis.color,linecolor:layout.xaxis.linecolor,linewidth:layout.xaxis.linewidth,showgrid:layout.xaxis.showgrid,gridcolor:layout.xaxis.gridcolor,gridwidth:layout.xaxis.gridwidth,griddash:layout.xaxis.griddash,ticks:layout.xaxis.ticks,showticklabels:layout.xaxis.showticklabels}, {color:'#991b1b',linecolor:'#991b1b',linewidth:4,showgrid:true,gridcolor:'#0f766e',gridwidth:2,griddash:'dash',ticks:'',showticklabels:false});
  assert(layout.annotations.some(item => item.name.startsWith('__graph_axis_tick_x') && item.font.color === '#991b1b'), '軸上の目盛数値を明示した軸色で描画する');
  assert.equal(layout.annotations.find(item => item.name === '__graph_axis_x').arrowcolor, '#991b1b');
  assert.deepStrictEqual({color:layout.yaxis.zerolinecolor,width:layout.yaxis.zerolinewidth}, {color:'#991b1b',width:4}, '横軸の書式をyaxisの水平ゼロ線へ適用する');
  assert.deepStrictEqual({color:layout.xaxis.zerolinecolor,width:layout.xaxis.zerolinewidth}, {color:'#1d4ed8',width:3}, '縦軸の書式をxaxisの垂直ゼロ線へ適用する');
  await Plot.exportImage(styledGraph, { format:'png',width:640,height:480,margin:64,fontSize:16,scale:1,background:'white' });
  assert.equal(exported.xaxis.color, '#991b1b');
  assert.equal(exported.xaxis.gridcolor, '#0f766e');
  assert.deepStrictEqual({color:exported.yaxis.zerolinecolor,width:exported.yaxis.zerolinewidth}, {color:'#991b1b',width:4}, '画像書き出しでも横軸のゼロ線書式を保つ');
  assert.deepStrictEqual({color:exported.xaxis.zerolinecolor,width:exported.xaxis.zerolinewidth}, {color:'#1d4ed8',width:3}, '画像書き出しでも縦軸のゼロ線書式を保つ');
  assert.equal(exported.annotations.find(item => item.name === '__graph_axis_x').arrowcolor, '#991b1b', '画像書き出しでも軸矢印の明示色を保つ');

  const horizontalOnly = Core.createDocument();
  horizontalOnly.axes.x.style = {color:'#dc2626',width:5};
  const horizontalGraph = element();
  await Plot.render(horizontalGraph, horizontalOnly, {});
  await Plot.exportImage(horizontalGraph, { format:'png',width:640,height:480,margin:64,fontSize:16,scale:1,background:'white' });
  assert.deepStrictEqual({color:exported.xaxis.zerolinecolor,width:exported.xaxis.zerolinewidth}, {color:'#444',width:1}, '縦のゼロ線は未指定時の従来色・幅を保つ');
  assert.deepStrictEqual({color:exported.yaxis.zerolinecolor,width:exported.yaxis.zerolinewidth}, {color:'#dc2626',width:5}, '画像書き出しでも横軸だけの書式を水平ゼロ線へ適用する');

  const log = Core.createDocument();
  log.axes.x = { ...log.axes.x, min: 1, max: 100, scale: 'log', labelPosition: 'axis' };
  log.axes.y = { ...log.axes.y, min: -1, max: 1, labelPosition: 'axis', ticks: { step: 1, format: 'decimal' } };
  await Plot.render(element(), log, {});
  layout = calls.at(-1);
  assert.equal(layout.xaxis.showticklabels, false, '対数の横軸も y=0 に置ける');
  assert.deepEqual(layout.xaxis.tickvals, [1, 10, 100], '対数軸の目盛線と数値は同じ値に置く');
  assert(layout.annotations.some(item => item.name.startsWith('__graph_axis_tick_x') && item.text === '10'));

  const huge = Core.createDocument();
  huge.axes.x = { ...huge.axes.x, min: 1e9, max: 1e9 + 1e-6, labelPosition: 'axis' };
  huge.axes.y = { ...huge.axes.y, min: -1, max: 1, labelPosition: 'axis' };
  await Plot.render(element(), huge, {});
  layout = calls.at(-1);
  const hugeTicks = layout.annotations.filter(item => item.name.startsWith('__graph_axis_tick_x'));
  assert(hugeTicks.length <= 200, '大きな目盛添字でも有界回数で止める');
  assert.equal(new Set(hugeTicks.map(item => item.x)).size, hugeTicks.length, '浮動小数点で重なる目盛を重複表示しない');

  const fallback = Core.createDocument();
  fallback.axes.x = { ...fallback.axes.x, labelPosition: 'axis' };
  fallback.axes.y = { ...fallback.axes.y, min: 1, max: 10, scale: 'log' };
  await Plot.render(element(), fallback, {});
  layout = calls.at(-1);
  assert.equal(layout.xaxis.showticklabels, true, 'y=0 がないと横軸は下端へ戻す');
  assert(!layout.annotations.some(item => item.name.startsWith('__graph_axis_tick_x')));

  const threeD = Core.createDocument();
  threeD.mode = '3d'; threeD.axes.x.labelPosition = 'axis';
  await Plot.render(element(), threeD, {});
  layout = calls.at(-1);
  assert.equal(layout.scene.xaxis.showticklabels, true, '3D は端の表示を維持する');
  assert.equal(layout.annotations.length, 0);
  console.log('axis-label-position.test.cjs: ok');
})().catch(error => { console.error(error); process.exitCode = 1; });
