const assert = require('node:assert/strict');
const Core = require('../core.js');
const Charts = require('../charts.js');

function source() {
  const series = Core.createSeries('data2d');
  series.id = 'data';
  series.dataTable = {
    columns: ['長さ <x>', '重さ & y', '一定'],
    rows: [[1, 2, 7], [2, 4, 7], [3, null, 7], [null, 8, 7], [4, 8, 7]],
    mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null }
  };
  series.rows = series.dataTable.rows.map(row => [row[0], row[1]]);
  return series;
}
function documentWithMatrix() {
  const doc = Core.createDocument(); doc.series = [source()];
  doc.charts = [{ ...Charts.create('matrix', { seriesId: 'data', columns: [0, 1, 2] }), id: 'matrix' }];
  doc.comparison = { columns: 1, items: ['main', 'matrix'] };
  return doc;
}

{
  const doc = documentWithMatrix();
  const clean = Core.validateDocument(doc);
  assert.equal(clean.version, 15);
  assert.deepEqual(clean.charts[0].columns, [0, 1, 2]);
  const old = structuredClone(doc); old.version = 13;
  assert.throws(() => Core.validateDocument(old), /版と散布図行列/);
  old.charts = []; old.comparison = { columns: 2, items: ['main'] };
  assert.equal(Core.validateDocument(old).version, 15, 'v13はmatrixなしで移行する');
}
{
  const doc = documentWithMatrix(), chart = doc.charts[0], built = Charts.build(chart, doc, { selectedRow: { seriesId: 'data', rowIndex: 1 } });
  assert.equal(built.data.filter(trace => trace.type === 'bar').length, 3, '対角線は3本のヒストグラム');
  assert.equal(built.data.filter(trace => trace.meta?.dataRows && !trace.meta?.observationHighlight).length, 6, '対角線以外は相関の散布図');
  const xy = built.data.find(trace => trace.xaxis === 'x2' && trace.yaxis === 'y2');
  assert.deepEqual(xy.customdata.map(value => value[0]), [1, 2, 5], '欠測をペアごとに除外して元行番号を保持する');
  assert.equal(xy.meta.seriesId, 'data');
  assert.match(xy.hovertemplate, /&lt;x&gt;/, '列名はhover templateでエスケープする');
  const metric = built.layout.annotations.find(annotation => annotation.xref === 'x2 domain' && annotation.yref === 'y2 domain');
  assert.match(metric.text, /r=1　n=3/);
  assert.equal(built.layout.yaxis.title.text, '度数', '左上の対角ヒストグラムは元変数名ではなく度数軸と明示する');
  assert.match(built.layout.annotations.find(annotation => annotation.xref === 'x domain' && annotation.yref === 'y domain').text, /長さ &lt;x&gt;<br>度数/);
  const constant = built.layout.annotations.find(annotation => annotation.text.includes('r=—'));
  assert.match(constant.text, /r=—/, '定数列の相関は0に置き換えない');
  assert.deepEqual(built.layout.xaxis2.range, built.layout.yaxis4.range, '同じ列の座標範囲を上下三角で共用する');
  assert(built.data.some(trace => trace.meta?.observationHighlight && trace.xaxis === 'x2'), '選択行を各対応散布図で強調する');
}
{
  const doc = documentWithMatrix(), base = doc.charts[0];
  for (const columns of [[0], [0, 0], [0, 1, 2, 0, 1]]) assert.throws(() => Charts.validate([{ ...base, columns }], doc), /散布図行列/);
  const dated = structuredClone(doc); dated.series[0].dataTable.columnTypes = ['number', 'category', 'number']; dated.series[0].dataTable.rows.forEach((row, index) => { row[1] = '区分' + index; });
  assert.throws(() => Charts.validate([base], dated), /数値列/);
}
console.log('scatter-matrix.test.cjs: ok');
