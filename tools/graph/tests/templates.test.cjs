const assert = require('assert');
const GraphTemplates = require('../templates.js');
const GraphCore = require('../core.js');

const templates = GraphTemplates.list();
assert.strictEqual(templates.length, 16);
assert.strictEqual(new Set(templates.map(t => t.id)).size, templates.length);
for (const template of templates) {
  assert.ok(template.name && template.category && template.description);
  const doc = template.document;
  assert.strictEqual(doc.format, 'kaijo-graph');
  assert.ok(['2d', '3d'].includes(doc.mode));
  assert.ok(Array.isArray(doc.series));
  const validation = GraphCore.validateDocument(doc);
  assert.ok(validation && validation.format === 'kaijo-graph', `${template.id}: invalid template`);
  for (const series of doc.series) {
    assert.ok(['function', 'surface', 'data2d', 'data3d', 'implicit', 'parametric', 'polar'].includes(series.kind));
    assert.ok(series.source && ['user', 'reference', 'model'].includes(series.source.kind));
  }
}
const vapor = templates.find(t => t.id === 'science-water-vapor-pressure').document.series[0];
assert.strictEqual(vapor.kind, 'data2d');
assert.strictEqual(vapor.rows.length, 11);
assert.deepStrictEqual(vapor.rows[0], [0.01, 0.612]);
assert.deepStrictEqual(vapor.rows[10], [100, 101.418]);
assert.ok(vapor.rows.every(([temperature, pressure]) => temperature >= 0.01 && temperature <= 100 && pressure > 0));
assert.ok(Math.abs(vapor.rows[10][1] - 101.325) < 0.2);
assert.strictEqual(vapor.source.kind, 'model');
assert.match(vapor.source.notes, /実測値の転載ではありません/);
assert.match(vapor.source.url, /^https:\/\//);
for (const [id, model, xSymbol, ySymbol] of [['science-spring-regression', 'linear', 'F', 'l'], ['science-decay-regression', 'exponential', 't', 'c']]) {
  const doc = templates.find(template => template.id === id).document, series = doc.series[0], regression = doc.annotations[0];
  assert.equal(doc.version, 7); assert.equal(series.kind, 'data2d'); assert.equal(series.style.points, true); assert.equal(series.style.lines, false); assert.deepStrictEqual(series.errorBars.x, []); assert.equal(series.errorBars.y.length, series.rows.length); assert.equal(series.interpolation, 'linear');
  assert.equal(series.source.kind, 'model'); assert.match(series.source.title + series.source.notes, /合成データ|実測値ではありません/); assert.equal(regression.model, model); assert.equal(regression.seriesId, series.id); assert.equal(doc.axes.x.symbol, xSymbol); assert.equal(doc.axes.y.symbol, ySymbol);
}
const gas = templates.find(t => t.id === 'science-ideal-gas-pv').document;
assert.strictEqual(gas.series[0].expression, 'n*8.314*T/x');
assert.strictEqual(require('../symbols.js').toDisplay(gas.series[0].expression,gas,'function'),'n*8.314*T/V');
assert.strictEqual(gas.axes.y.symbol,'P');
assert.ok(gas.axes.y.max >= 2494);
const first = GraphTemplates.list();
const triangle = GraphCore.validateDocument(templates.find(t => t.id === 'math-triangle-region').document);
const region = triangle.annotations.find(a => a.kind === 'region');
assert.strictEqual(require('../annotations.js').evaluate(region, triangle).area, 6);
triangle.parameters[0].value = 5;
assert.strictEqual(require('../annotations.js').evaluate(region, triangle).area, 10);
first[0].document.name = '変更';
for (const [id, expectedArea, expectedIntegral] of [['math-curve-region', 4/3, -4/3], ['math-signed-integral', 4, 0]]) {
  const doc = GraphCore.validateDocument(templates.find(t => t.id === id).document);
  const result = require('../annotations.js').evaluate(doc.annotations[0], doc);
  assert.equal(result.warning, ''); assert(Math.abs(result.area - expectedArea) < 1e-8); assert(Math.abs(result.integral - expectedIntegral) < 1e-8);
}
assert.notStrictEqual(GraphTemplates.list()[0].document.name, '変更');
console.log('templates tests passed');
