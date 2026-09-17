const assert = require('assert');
const Core = require('../core.js');
const Charts = require('../charts.js');
const Workspace = require('../workspace.js');
const Templates = require('../templates.js');
const TemplateLibrary = require('../template-library.js');

function dataSeries(id = 'data') {
  const series = Core.createSeries('data2d');
  series.id = id;
  series.rows = [[1, 2], [2, 4], [3, 6]];
  series.dataTable = { columns: ['x', 'y', '未使用'], rows: [[1, 2, 10], [2, 4, 20], [3, 6, 30]], mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null } };
  return series;
}
function documentWithCharts() {
  const doc = Core.createDocument(), series = dataSeries(), regression = Core.createAnnotation('regression');
  regression.id = 'fit'; regression.seriesId = series.id; regression.model = 'linear';
  doc.series = [series]; doc.annotations = [regression];
  doc.charts = [
    { ...Charts.create('residual', { regressionId: 'fit', horizontal: 'x' }), id: 'residual-1' },
    { ...Charts.create('scatter', { seriesId: 'data', xColumn: 0, yColumn: 1, model: 'linear' }), id: 'scatter-1' },
    { ...Charts.create('histogram', { seriesId: 'data', column: 1, bins: 2 }), id: 'histogram-1' },
    { ...Charts.create('box', { seriesId: 'data', columns: [0, 1] }), id: 'box-1' }
  ];
  doc.comparison = { columns: 2, items: ['main', 'residual-1', 'scatter-1', 'histogram-1', 'box-1'] };
  return doc;
}
function valid(doc) { return Core.validateDocument(doc); }

{
  const clean = valid(documentWithCharts());
  assert.equal(clean.version, 10);
  assert.deepEqual(clean.charts.map(chart => chart.kind), ['residual', 'scatter', 'histogram', 'box']);
  assert(clean.charts.every(chart => chart.visible === true), 'visible省略時はtrueとして保存する');
  assert.deepEqual(clean.comparison.items, ['main', 'residual-1', 'scatter-1', 'histogram-1', 'box-1']);
  assert.deepEqual(valid(JSON.parse(JSON.stringify(clean))), clean, '全chart種別を保存形式から復元できる');
}
{
  const doc = documentWithCharts(), hidden = doc.charts.find(chart => chart.id === 'scatter-1');
  delete hidden.visible;
  const migrated = valid(doc);
  assert.equal(migrated.version, 10);
  assert.equal(migrated.charts.find(chart => chart.id === 'scatter-1').visible, true, 'v10のvisible省略値は互換的にtrue');
  migrated.charts.find(chart => chart.id === 'scatter-1').visible = false;
  assert.deepEqual(migrated.comparison.items, ['main', 'residual-1', 'scatter-1', 'histogram-1', 'box-1'], '非表示でも比較の所属は保存する');
  assert.deepEqual(Workspace.comparison(migrated).items, ['main', 'residual-1', 'histogram-1', 'box-1'], '非表示の分析グラフは比較表示・出力から除外する');
}
{
  const old = Core.createDocument(); old.version = 8; delete old.charts; delete old.comparison;
  const migrated = valid(old); assert.equal(migrated.version, 10); assert.deepEqual(migrated.charts, []); assert.deepEqual(migrated.comparison, { columns: 2, items: ['main'] });
  assert.throws(() => valid({ ...old, charts: [] }), /版/);
}
{
  const doc = documentWithCharts(), chart = doc.charts[1];
  for (const mutate of [
    d => { d.charts[0].kind = 'unknown'; },
    d => { d.charts[0].id = 'data'; },
    d => { d.charts[0].regressionId = 'missing'; },
    d => { d.charts[1].xColumn = 99; },
    d => { d.comparison.items = ['main', 'missing']; },
    d => { d.charts.push({ ...chart, id: 'duplicate' }, { ...chart, id: 'duplicate' }); },
    d => { d.charts = Array.from({ length: 13 }, (_, i) => ({ ...Charts.create('scatter', { seriesId: 'data', xColumn: 0, yColumn: 1, model: null }), id: 'chart-' + i })); }
  ]) { const bad = Core.clone(doc); mutate(bad); assert.throws(() => valid(bad)); }
  const six = Core.clone(doc);six.charts.push({...chart,id:'scatter-2'},{...chart,id:'scatter-3'});six.comparison.items=['main',...six.charts.slice(0,5).map(chart=>chart.id)];valid(six);
  const seven = Core.clone(six); seven.comparison.items.push('scatter-3'); assert.throws(() => valid(seven), /1〜6/);
}
{
  const doc = documentWithCharts(), before = Core.clone(doc), history = new Core.History(doc);
  history.change(current => Core.removeSeries(current, 'data'));
  assert.deepEqual(history.document.charts, []); assert.deepEqual(history.document.comparison, { columns: 2, items: ['main'] });
  history.undo(); assert.deepEqual(history.document, valid(before), '系列・回帰削除はchart/comparisonをUndo復元する');
  history.change(current=>Core.removeAnnotation(current,'fit'));
  assert.equal(history.document.charts.length,3);assert(!history.document.charts.some(chart=>chart.kind==='residual'));assert(!history.document.comparison.items.includes('residual-1'));assert.equal(history.document.series.length,1);
  history.undo();assert.deepEqual(history.document,valid(before));
}
{
  const doc = documentWithCharts(), beforeTable = Core.clone(doc.series[0].dataTable), beforeAnnotations = Core.clone(doc.annotations);
  Core.removeChart(doc, 'scatter-1');
  assert.equal(doc.charts.length, 3); assert.deepEqual(doc.series[0].dataTable, beforeTable); assert.deepEqual(doc.annotations, beforeAnnotations); assert(!doc.comparison.items.includes('scatter-1'));
}
{
  const doc = documentWithCharts();doc.charts.find(chart=>chart.kind==='histogram').column=2;
  const history = new Core.History(doc), before = Core.clone(history.document);
  assert.throws(() => history.change(current => { current.series[0].dataTable.columns.pop();current.series[0].dataTable.rows.forEach(row=>row.pop()); }), /ヒストグラムの列/);
  assert.deepEqual(history.document, before, '不正な列削除はHistoryを変更しない');
}
{
  const doc = documentWithCharts(), template = TemplateLibrary.create(doc, { name: '分析グラフ（データなし）', includeData: false });
  assert.deepEqual(template.document.charts.map(chart => chart.id), doc.charts.map(chart => chart.id));
  assert.deepEqual(template.document.comparison, doc.comparison);
  assert.deepEqual(template.document.series[0].dataTable.columns, doc.series[0].dataTable.columns);
  assert.deepEqual(template.document.series[0].source, doc.series[0].source);
  assert.deepEqual(template.document.series[0].dataTable.rows, []);
  const output = Charts.build(template.document.charts[1], template.document);
  assert(output.warnings.length > 0, 'データなしのchartは警告を返す');
}
{
  const source = Templates.list().find(item => item.id === 'science-spring-regression').document;
  const withChart = Core.clone(source); withChart.version = 10; withChart.presentation = Core.createDocument().presentation; withChart.output = Core.createDocument().output; withChart.charts = [{ ...Charts.create('residual', { regressionId: 'spring-linear-fit', horizontal: 'x' }), id: 'residual' }]; withChart.comparison = { columns: 1, items: ['main', 'residual'] };
  const template = TemplateLibrary.create(withChart, { name: '列保持', includeData: false });
  assert.equal(template.document.charts[0].regressionId, 'spring-linear-fit');
  assert.deepEqual(template.document.comparison.items, ['main', 'residual']);
}
console.log('graph charts core tests passed');
