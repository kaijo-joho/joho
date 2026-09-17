const assert = require('node:assert/strict');
const Core = require('../core.js');
const Charts = require('../charts.js');
const Analysis = require('../analysis.js');
const CalculationTemplates = require('../calculation-templates.js');
const GraphTemplates = require('../templates.js');

const expectedIds = [
  'calculation-acceleration-interval',
  'calculation-ohm-resistance',
  'calculation-hooke-regression',
  'calculation-sensor-moving-average'
];
const entries = CalculationTemplates.list();
assert.deepEqual(entries.map(entry => entry.id), expectedIds);
assert.equal(new Set(entries.map(entry => entry.name)).size, entries.length);
assert.deepEqual(GraphTemplates.list().filter(entry => expectedIds.includes(entry.id)).map(entry => entry.id).sort(), expectedIds.slice().sort());

function clean(id) {
  return Core.validateDocument(entries.find(entry => entry.id === id).document);
}

for (const entry of entries) {
  const document = clean(entry.id);
  assert.equal(document.version, 14, entry.id);
  assert.ok(document.series.length, entry.id);
  for (const series of document.series) {
    assert.equal(series.source.kind, 'model', entry.id);
    assert.match(series.source.notes, /MODEL\/模擬データ/);
    assert.ok(series.dataTable, entry.id);
    assert.equal(series.dataTable.formulas.length, series.dataTable.columns.length);
  }
  for (const chart of document.charts) {
    const built = Charts.build(chart, document);
    assert.deepEqual(built.warnings, [], `${entry.id}/${chart.id}`);
    assert.ok(built.data.length, `${entry.id}/${chart.id} has no plotted data`);
    assert.doesNotMatch(built.summary, /見つかりません|不正です/);
  }
}

const acceleration = clean('calculation-acceleration-interval').series[0].dataTable;
assert.deepEqual(acceleration.rows.map(row => row[2]), [null, 3, 5, 7, 9]);
assert.deepEqual(acceleration.rows.map(row => row[3]), [null, .5, 1.5, 2.5, 3.5]);
assert.equal(acceleration.mapping.x, 3);
assert.equal(acceleration.mapping.y, 2);

const ohmDocument = clean('calculation-ohm-resistance');
const ohmTable = ohmDocument.series[0].dataTable;
assert.deepEqual(ohmTable.rows.map(row => row[2].toFixed(3)), ['200.000', '204.082', '197.368', '199.005', '200.803', '198.020']);
assert.equal(ohmDocument.axes.x.unit, 'V');
assert.equal(ohmDocument.axes.y.unit, 'mA');
assert.equal(ohmDocument.charts.length, 1);
assert.equal(ohmDocument.charts[0].kind, 'residual');
assert.equal(ohmDocument.annotations[0].kind, 'regression');

const ohmChanged = Core.clone(ohmDocument);
ohmChanged.series[0].dataTable.rows[1][1] = 10;
const ohmRecalculated = Core.validateDocument(ohmChanged);
assert.equal(ohmRecalculated.series[0].dataTable.rows[1][2], 200);
const ohmFit = Analysis.fit(ohmRecalculated.series[0], 'linear');
assert.equal(ohmFit.warning, '');
assert.ok(Number.isFinite(ohmFit.coefficients[1]));

const hookeDocument = clean('calculation-hooke-regression');
const hookeTable = hookeDocument.series[0].dataTable;
assert.ok(Math.abs(hookeTable.rows[0][2] - .49) < 1e-12);
assert.ok(Math.abs(hookeTable.rows[0][3] - .012) < 1e-12);
assert.equal(hookeTable.rows[5][2], 2.94);
assert.equal(hookeDocument.axes.x.unit, 'N');
assert.equal(hookeDocument.axes.y.unit, 'm');
assert.equal(hookeDocument.annotations[0].kind, 'regression');
const hookeChanged = Core.clone(hookeDocument);
hookeChanged.series[0].dataTable.rows[2][1] = 4;
const hookeRecalculated = Core.validateDocument(hookeChanged);
assert.equal(hookeRecalculated.series[0].dataTable.rows[2][3], .04);
const hookeFit = Analysis.fit(hookeRecalculated.series[0], 'linear');
assert.equal(hookeFit.warning, '');
assert.ok(Number.isFinite(hookeFit.coefficients[1]));

const sensorDocument = clean('calculation-sensor-moving-average');
assert.equal(sensorDocument.series.length, 1);
const rawTable = sensorDocument.series[0].dataTable;
assert.deepEqual(rawTable.rows.map(row => row[2]), [null, 2, -1, 4, -1, 4, -1]);
assert.deepEqual(rawTable.rows.map(row => row[3]), [null, null, 11, 12.666666666666666, 13.333333333333334, 15.666666666666666, 16.333333333333332]);
assert.deepEqual(sensorDocument.comparison.items, ['calculation-sensor-raw-chart', 'calculation-sensor-smoothed-chart']);
assert.deepEqual(sensorDocument.charts[0].axes,sensorDocument.charts[1].axes);
assert.equal(sensorDocument.series[0].dataTable.mapping.y, 1);
assert.equal(sensorDocument.charts[0].seriesId, sensorDocument.charts[1].seriesId);
assert.equal(sensorDocument.charts[0].yColumn, 1);
assert.equal(sensorDocument.charts[1].yColumn, 3);

const sensorChanged = Core.clone(sensorDocument);
sensorChanged.series[0].dataTable.rows[3][1] = 16;
const sensorRecalculated = Core.validateDocument(sensorChanged);
assert.equal(sensorRecalculated.series[0].dataTable.rows[3][2], 5);
assert.equal(sensorRecalculated.series[0].dataTable.rows[3][3], 13);

const first = CalculationTemplates.list();
first[0].document.series[0].dataTable.rows[1][1] = 999;
first[0].document.name = '変更した複製';
const second = CalculationTemplates.list();
assert.equal(second[0].document.name, '等加速度運動：区間平均速度');
assert.equal(second[0].document.series[0].dataTable.rows[1][1], 3);

console.log('calculation template tests passed');
