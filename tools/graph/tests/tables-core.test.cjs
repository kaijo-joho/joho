/* v8 table storage and regression-reference validation at the document boundary. */
const assert = require('assert');
const C = require('../core.js');
const T = require('../tables.js');

function table(columns, rows, mapping) { return { columns, rows, mapping }; }
function data2d(id = 'data') {
  const s = C.createSeries('data2d');
  s.id = id;
  T.assign(s, table(['時刻', '温度', '誤差'], [[0, 1, .1], [1, 3, null], [2, 5, .2]], { x: 0, y: 1, z: null, errorX: null, errorY: 2 }));
  return s;
}
function annotate(d, kind, id) { const a = C.createAnnotation(kind); a.id = id; d.annotations.push(a); return a; }

{
  const columns = Array.from({ length: 20 }, (_, i) => '列' + i);
  const rows = Array.from({ length: 10000 }, (_, row) => columns.map((_, column) => column === 3 && row % 2 ? null : row + column));
  const clean = T.validate(table(columns, rows, { x: 4, y: 1, z: null, errorX: 2, errorY: 3 }));
  assert.equal(clean.columns.length, 20); assert.equal(clean.rows.length, 10000); assert.equal(clean.rows[1][3], null);
  assert.throws(() => T.validate(table(columns.concat('超過'), [], { x: 0, y: 1, z: null, errorX: null, errorY: null })), /20列/);
  assert.throws(() => T.validate(table(['x', 'y'], Array.from({ length: 10001 }, () => [0, 0]), { x: 0, y: 1, z: null, errorX: null, errorY: null })), /10000行/);
}
{
  const parsed = T.parse('"横,軸","縦"\r\n1,\r\n2,3\r\n', 'data2d');
  assert.deepStrictEqual(parsed.columns, ['横,軸', '縦']); assert.deepStrictEqual(parsed.rows, [[1, null], [2, 3]]);
  assert.deepStrictEqual(T.parse('1\t2\t3\n4\t5\t6', 'data3d').rows, [[1, 2, 3], [4, 5, 6]]);
  for (const csv of ['"unterminated,2', 'x,y\n1,2,3']) assert.throws(() => T.parse(csv), /引用符|不正|列数|数値/);
  assert.deepStrictEqual(T.parse('x,y\n1,nope').columnTypes, ['number', 'category']);
  assert.throws(() => T.validate(table(['x', 'y', 'Δy'], [[1, 2, -1]], { x: 0, y: 1, z: null, errorX: null, errorY: 2 })), /誤差棒/);
}
{
  const source = table(['y', 'x', 'Δx', 'Δy', 'unused'], [[10, 1, .2, .3, 99], [20, 2, null, 0, null]], { x: 1, y: 0, z: null, errorX: 2, errorY: 3 });
  const projected = T.project(source);
  assert.deepStrictEqual(projected, { rows: [[1, 10], [2, 20]], errorBars: { x: [.2, null], y: [.3, 0] } });
  const d = C.createDocument(), s = C.createSeries('data2d'); s.id = 'mapped'; T.assign(s, source); d.series = [s];
  assert.deepStrictEqual(C.validateDocument(d).series[0].dataTable, T.validate(source));
  const mismatch = C.clone(d); mismatch.series[0].rows[0][0] = 9; assert.throws(() => C.validateDocument(mismatch), /一致/);
  const old2 = C.createSeries('data2d'); old2.id = 'old2'; old2.rows = [[1, 2], [null, 3]]; old2.errorBars = { x: [], y: [] }; const old3 = C.createSeries('data3d'); old3.id = 'old3'; old3.rows = [[1, 2, 3]];
  const legacy = C.createDocument(); legacy.series = [old2, old3]; const clean = C.validateDocument(legacy); assert.equal(clean.series[0].dataTable, undefined); assert.deepStrictEqual(T.fromSeries(clean.series[1]).rows, [[1, 2, 3]]);
}
{
  for (let version = 1; version <= 7; version++) {
    const old = C.createDocument(); old.version = version; delete old.presentation; delete old.output; delete old.charts; delete old.comparison;
    if (version === 1) delete old.annotations;
    if (version <= 2) for (const axis of Object.values(old.axes)) { delete axis.symbol; delete axis.ticks; }
    const clean = C.validateDocument(old); assert.equal(clean.version, 12, 'v' + version + ' migrates to v12');
  }
  for (let version = 1; version <= 7; version++) {
    const old = C.createDocument(); old.version = version;
    assert.throws(() => C.validateDocument(old), /版|一致/, 'v' + version + ' rejects v8 fields');
  }
}
{
  const d = C.createDocument(), source = data2d(), line = C.createSeries('function'); line.id = 'line'; line.expression = 'y=x'; d.series = [source, line];
  const point = annotate(d, 'point', 'point'); point.anchor = { type: 'regression', regressionId: 'fit', at: '1' };
  const tangent = annotate(d, 'tangent', 'tangent'); delete tangent.seriesId; tangent.target = { type: 'regression', id: 'fit' }; tangent.at = '1';
  const cross = annotate(d, 'intersection', 'cross'); delete cross.seriesIds; cross.targets = [{ type: 'tangent', id: 'tangent' }, { type: 'regression', id: 'fit' }]; cross.interval = [-1, 3];
  const curve = annotate(d, 'curveRegion', 'curve'); curve.targets = [{ type: 'regression', id: 'fit' }, { type: 'axis', axis: 'x' }]; curve.interval = ['0', '2'];
  const q = annotate(d, 'point', 'q'), r = annotate(d, 'point', 'r'); q.anchor = { type: 'free', x: '0', y: '0' }; r.anchor = { type: 'free', x: '1', y: '0' };
  const s1 = annotate(d, 'segment', 's1'), s2 = annotate(d, 'segment', 's2'), s3 = annotate(d, 'segment', 's3'); [s1.from, s1.to] = ['point', 'q']; [s2.from, s2.to] = ['q', 'r']; [s3.from, s3.to] = ['r', 'point'];
  const region = annotate(d, 'region', 'region'); region.segmentIds = ['s1', 's2', 's3'];
  const fit = annotate(d, 'regression', 'fit'); fit.seriesId = 'data'; fit.model = 'linear';
  // All dependents precede their source to prove that validation never uses array order.
  const clean = C.validateDocument(d); assert.equal(clean.annotations.length, d.annotations.length);
  const bad = mutate => { const copy = C.clone(d); mutate(copy); assert.throws(() => C.validateDocument(copy), /回帰|接線|交点|曲線領域|境界|不正/); };
  bad(x => x.annotations.find(a => a.id === 'point').anchor.regressionId = 'tangent');
  bad(x => x.annotations.find(a => a.id === 'tangent').target.id = 'point');
  bad(x => x.annotations.find(a => a.id === 'tangent').seriesId = 'line');
  bad(x => x.annotations.find(a => a.id === 'cross').targets = [{ type: 'regression', id: 'fit' }, { type: 'regression', id: 'fit' }]);
  bad(x => { const a = x.annotations.find(a => a.id === 'cross'); a.seriesIds = ['line', 'line']; });
  bad(x => x.annotations.find(a => a.id === 'curve').targets = [{ type: 'regression', id: 'fit' }, { type: 'regression', id: 'fit' }]);
  bad(x => x.annotations.find(a => a.id === 'curve').targets[0].id = 'point');
  const history = new C.History(d); history.change(current => C.removeSeries(current, 'data'));
  assert.deepStrictEqual(history.document.annotations.map(a => a.id).sort(), ['q', 'r', 's2'], 'series → regression and all linked annotations cascade');
  history.undo(); assert.equal(history.document.annotations.length, d.annotations.length, 'Undo restores every dependent annotation');
  const memory = new Map(), store = new C.Store({ getItem: key => memory.get(key) || null, setItem: (key, value) => memory.set(key, value) });
  store.save('auto', d); const loaded = store.load('auto').document; assert.equal(loaded.version, 12); assert.deepStrictEqual(loaded.series[0].dataTable, source.dataTable); assert.equal(loaded.annotations.find(a => a.id === 'point').anchor.regressionId, 'fit');
}
console.log('graph tables core tests passed');

{const old=C.createDocument();old.version=7;delete old.presentation;delete old.output;delete old.charts;delete old.comparison;assert.equal(C.validateDocument(old).presentation.tickMarks,false);}
