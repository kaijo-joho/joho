const assert = require('assert');
const Core = require('../core.js');
const Annotations = require('../annotations.js');
const Science = require('../science-templates.js');
const Water = require('../water-properties.js');
const CO2 = require('../co2-properties.js');
const templates = Science.list();
assert.equal(templates.length, 4);
for (const { document: original } of templates) {
  const doc = Core.validateDocument(original);
  assert.equal(doc.version, 15);
  for (const series of doc.series) {
    assert.equal(series.kind, 'data2d'); assert.equal(series.source.kind, 'model');
    assert.match(series.source.url, /^https:\/\//);
    assert(series.rows.length > 200); assert(series.rows.every(row => row.every(Number.isFinite) && row[1] > 0));
    assert.equal(series.interpolation, 'linear'); assert.equal(series.style.lines, true);
  }
  for (const a of doc.annotations) assert.equal(Annotations.evaluate(a, doc).warning, '', a.id);
  assert.deepEqual(Core.validateDocument(JSON.parse(JSON.stringify(doc))), doc, '保存して読み込んでも出典と数値が保持される');
}
for (const [id, prefix, model] of [['science-water-phase', 'water', Water], ['science-co2-phase', 'co2', CO2]]) {
  const doc = templates.find(t => t.id === id).document, c = model.constants;
  assert.equal(doc.axes.y.scale, 'log'); assert.equal(doc.axes.y.unit, 'MPa'); assert.equal(doc.axes.x.unit, '°C');
  const vapor = doc.series.find(s => s.id === prefix + '-vapor');
  const sub = doc.series.find(s => s.id === prefix + '-sublimation');
  const melt = doc.series.find(s => s.id === prefix + '-melting');
  assert.deepEqual(vapor.rows[0], sub.rows.at(-1), '三重点で昇華と蒸気圧曲線が接続する');
  assert(melt.rows.some(row => row[0] === vapor.rows[0][0] && row[1] === c.tripleP), '融解曲線も三重点を通る');
  assert.equal(vapor.rows.at(-1)[1], c.criticalP);
  assert(Math.abs(vapor.rows.at(-1)[0] - (c.criticalT - 273.15)) < 1e-6, '臨界点より先へ描かない');
  for (let i = 1; i < vapor.rows.length; i++) assert(vapor.rows[i][1] > vapor.rows[i - 1][1]);
  assert.equal(melt.rows[1][1] < melt.rows[0][1], prefix === 'water', '水とCO₂で融解曲線の傾きが逆');
  assert.equal(Number(doc.annotations.find(a => a.kind === 'guide').value), .101325);
  const critical = doc.annotations.find(a => a.id === prefix + '-critical');
  assert.equal(Number(critical.anchor.y), vapor.rows.at(-1)[1]);
}
const co2Doc = templates.find(t => t.id === 'science-co2-phase').document;
assert(co2Doc.series.find(s => s.id === 'co2-vapor').rows.every(row => row[1] > .101325), '1気圧には安定な液体CO₂はない');
const density = templates.find(t => t.id === 'science-water-saturated-density').document;
assert.match(density.series[0].source.notes, /1気圧一定.*ではありません/);
const copy = Science.list(); copy[0].document.series[0].rows[0][1] = 9;
assert.notEqual(Science.list()[0].document.series[0].rows[0][1], 9);
console.log('science templates tests passed');
