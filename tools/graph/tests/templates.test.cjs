const assert = require('assert');
const GraphTemplates = require('../templates.js');
const GraphCore = require('../core.js');

const templates = GraphTemplates.list();
assert.strictEqual(templates.length, 11);
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
const gas = templates.find(t => t.id === 'science-ideal-gas-pv').document;
assert.strictEqual(gas.series[0].expression, 'n*8.314*T/x');
assert.strictEqual(require('../symbols.js').toDisplay(gas.series[0].expression,gas,'function'),'n*8.314*T/V');
assert.strictEqual(gas.axes.y.symbol,'P');
assert.ok(gas.axes.y.max >= 2494);
const first = GraphTemplates.list();
first[0].document.name = '変更';
assert.notStrictEqual(GraphTemplates.list()[0].document.name, '変更');
console.log('templates tests passed');
