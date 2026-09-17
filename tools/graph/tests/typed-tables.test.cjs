const assert = require('assert');
const Tables = require('../tables.js');
const Core = require('../core.js');
const Analysis = require('../analysis.js');
const Statistics = require('../statistics.js');

assert.equal(Tables.dateNumber('2024-02-29'), Tables.dateNumber('2024/2/29'));
assert.throws(() => Tables.dateNumber('2025-02-29'), /日付/);
assert.equal(Tables.dateFromNumber(Tables.dateNumber('0001-01-01')), '0001-01-01');

const table = Tables.validate({
  columns: ['日付', '組', '値'],
  columnTypes: ['date', 'category', 'number'],
  rows: [['2024/2/29', 'B', 2], ['2024-03', 'A', 3]],
  mapping: {x: 1, y: 2, z: null, errorX: null, errorY: null}
});
assert.deepStrictEqual(Tables.project(table).rows, [[0, 2], [1, 3]]);
assert.deepStrictEqual(Tables.project(table, 'data2d', {x:{categories:['A', 'B']}, y:{}}).rows, [[1, 2], [0, 3]]);
assert.deepStrictEqual(Tables.numericColumnIndices(table), [2]);

const doc = Core.createDocument();
doc.axes.x.type = 'category'; doc.axes.x.categories = [];
for (const [id, labels] of [['first', ['B', 'A']], ['second', ['A', 'C', 'B']]]) {
  const series = Core.createSeries('data2d'); series.id = id;
  Tables.assign(series, {columns:['組','値'], columnTypes:['category','number'], rows:labels.map((label, i) => [label, i]), mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});
  doc.series.push(series);
}
const clean = Core.validateDocument(doc);
assert.equal(clean.version, 14);
assert.deepStrictEqual(clean.axes.x.categories, ['B', 'A', 'C']);
assert.deepStrictEqual(clean.series[1].rows.map(row => row[0]), [1, 2, 0]);

const categorical = Core.createSeries('data2d');
Tables.assign(categorical, {columns:['組','値'], columnTypes:['category','number'], rows:[['A',1],['B',2]], mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});
assert.match(Analysis.fit(categorical, 'linear').warning, /カテゴリ/);
assert.throws(() => Statistics.summarize({columns:['組','値'],columnTypes:['category','number'],rows:[['A',1]]}), /数値列/);
assert.deepStrictEqual(Statistics.summarize({columns:['組','値'],columnTypes:['category','number'],rows:[['A',1]]}, [1]).map(x => x.mean), [1]);

const dateY=Core.createSeries('data2d');
Tables.assign(dateY, {columns:['値','日付'],columnTypes:['number','date'],rows:[[1,'2024-01-01'],[2,'2024-01-02']],mapping:{x:0,y:1,z:null,errorX:null,errorY:null}});
assert.match(Analysis.fit(dateY,'linear').warning,/縦軸.*数値列/);

console.log('typed table tests passed');
