const assert = require('node:assert/strict');
const Catalog = require('../open-data-catalog.js');
const Data = require('../data-import.js');

const items = Catalog.list();
assert.equal(items.length, 7);
const ids = new Set(items.map(item => item.id));
assert.equal(ids.size, items.length);
for (const item of items) {
  assert.equal(item.source.kind, 'reference');
  assert.match(item.source.url, /^https:\/\//);
  assert.match(item.license.url, /^https:\/\//);
  assert.equal(item.checkedAt, '2026-09-17');
  const parsed = Data.parse(item.csv);
  const inspection = Data.inspect(parsed);
  assert.ok([8, 12, 20, 25].includes(inspection.rows.length), item.id);
  assert.ok(inspection.columns.length >= 2 && inspection.columns.length <= 20, item.id);
  assert.ok(inspection.columns.every(column => column.type === 'number'), item.id);
  const projected = Data.project(inspection, {kind: 'data2d', x: item.x, y: item.y, columns: [item.x, item.y]});
  assert.equal(projected.table.mapping.x, 0, item.id);
  assert.equal(projected.table.mapping.y, 1, item.id);
}
assert.deepEqual(items[0].csv.split(/\n/).slice(1, 4).map(row => row.split(',').slice(0, 2)), [['1', '5.4'], ['2', '6.1'], ['3', '9.4']]);
// NASA原表の値から換算を照合する（距離:百万km、周期:日、直径:km）。
const planets = items.find(item => item.id === 'nasa-planets-metric');
const planetRows = planets.csv.split('\n').slice(1).map(row => row.split(',').map(Number));
const distances = [57.9, 108.2, 149.6, 228, 778.5, 1432, 2867, 4515];
const periods = [88, 224.7, 365.2, 687, 4331, 10747, 30589, 59800];
const diameters = [4879, 12104, 12756, 6792, 142984, 120536, 51118, 49528];
planetRows.forEach((row, i) => {
  assert.equal(row[0], i + 1);
  assert.equal(row[1], Number((distances[i] / 149.5978707).toFixed(3)));
  assert.equal(row[2], Number((periods[i] / 365.25).toFixed(3)));
  assert.equal(row[3], diameters[i] / 2);
});
assert.match(planets.csv.split('\n')[0], /赤道半径/);
assert.match(planets.source.notes, /1 bar/);
const copy = Catalog.list(); copy[0].csv = 'changed'; copy[0].source.notes = 'changed';
assert.notEqual(Catalog.list()[0].csv, 'changed');
assert.notEqual(Catalog.list()[0].source.notes, 'changed');
console.log('open-data-catalog.test.cjs: ok');
