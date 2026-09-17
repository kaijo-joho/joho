const assert = require('node:assert/strict');
const S = require('../selection.js');

const series = (id, style = {}) => ({ id, kind: 'data2d', style: { color: '#111111', width: 2, dash: 'solid', opacity: .8, points: true, lines: false, ...style } });
const annotation = (id, kind = 'text', style = {}, label = {}) => ({ id, kind, style: { color: '#222222', width: 1.5, dash: 'dash', opacity: 1, ...style }, label: { visible: true, dx: 1, dy: 2, size: 13, ...label } });
const chart = (id, style = {}, extra = {}) => ({ id, kind: 'scatter', color: '#333333', style: { pointSize: 8, width: 2, dash: 'solid', ...style }, ...extra });
const doc = { series: [series('s1'), series('s2', { color: '#111111', width: 3 })], annotations: [annotation('a1', 'guide'), annotation('a2', 'segment', { color: '#222222' }, { visible: false, size: 16 })], charts: [chart('c1')], parameters: [{ name: 'p', value: 1 }] };

assert.equal(S.key({ type: 'series', id: 's1' }), 'series:s1');
assert.equal(S.key({ type: 'parameter', name: 'p' }), 'parameter:p');
assert.equal(S.key({ type: 'series', id: '' }), null);
assert.equal(S.resolve(doc, { type: 'series', id: 's1' }), doc.series[0]);
assert.equal(S.resolve(doc, { type: 'annotation', id: 'missing' }), null);
assert.deepEqual(S.supported({ type: 'series', id: 's1' }, doc.series[0]), ['color', 'width', 'dash', 'opacity', 'points', 'lines']);
assert.deepEqual(S.supported({ type: 'annotation', id: 'a1' }, doc.annotations[0]), ['color', 'width', 'dash', 'opacity', 'fontSize', 'labelVisible']);
assert.deepEqual(S.supported({ type: 'chart', id: 'c1' }, doc.charts[0]), ['color', 'width', 'pointSize']);
assert.deepEqual(S.supported({ type: 'series', id: 'surface' }, { id: 'surface', kind: 'surface', style: { color: '#111111', width: 2, dash: 'solid', opacity: .8, points: true, lines: false } }), ['color', 'opacity']);
assert.deepEqual(S.supported({ type: 'annotation', id: 'region' }, annotation('region', 'region')), ['color', 'opacity', 'fontSize', 'labelVisible']);
assert.deepEqual(S.supported({ type: 'chart', id: 'residual' }, chart('residual', { width: 2, dash: 'solid', pointSize: 8 }, { kind: 'residual' })), ['color', 'pointSize']);
assert.deepEqual(S.supported({ type: 'parameter', name: 'p' }, doc.parameters[0]), []);

assert.deepEqual(S.common(doc, [{ type: 'series', id: 's1' }, { type: 'series', id: 's2' }]), { color: '#111111', width: null, dash: 'solid', opacity: .8, points: true, lines: false });
assert.deepEqual(S.common(doc, [{ type: 'series', id: 's1' }, { type: 'series', id: 's1' }, { type: 'series', id: 'stale' }]), { color: '#111111', width: 2, dash: 'solid', opacity: .8, points: true, lines: false });
assert.deepEqual(S.common(doc, [{ type: 'series', id: 's1' }, { type: 'annotation', id: 'a1' }]), { color: null, width: null, dash: null, opacity: null });
assert.deepEqual(S.common(doc, [{ type: 'series', id: 's1' }, { type: 'parameter', name: 'p' }]), {});

const before = JSON.stringify(doc.series[0]);
const snapshot = S.capture(doc, { type: 'series', id: 's1' });
assert.deepEqual(snapshot, doc.series[0].style);
snapshot.color = '#ffffff';
assert.equal(JSON.stringify(doc.series[0]), before);
assert.equal(S.capture(doc, { type: 'series', id: 'missing' }), null);

const result = S.apply(doc, [{ type: 'series', id: 's1' }, { type: 'series', id: 's1' }, { type: 'series', id: 'missing' }], { color: '#abcdef', width: 4, name: 'ignored' });
assert.deepEqual(result.keys, ['color', 'width']);
assert.equal(doc.series[0].style.color, '#abcdef');
assert.equal(doc.series[0].name, undefined);

const annotationBefore = JSON.stringify(doc.annotations[0]);
S.paste(doc, [{ type: 'annotation', id: 'a1' }, { type: 'annotation', id: 'a2' }], { color: '#abcdef', fontSize: 20, labelVisible: false, points: true });
assert.equal(doc.annotations[0].style.color, '#abcdef');
assert.equal(doc.annotations[0].label.size, 20);
assert.equal(doc.annotations[0].label.visible, false);
assert.equal(doc.annotations[0].style.points, undefined);
assert.notEqual(JSON.stringify(doc.annotations[0]), annotationBefore);

S.paste(doc, [{ type: 'series', id: 's1' }, { type: 'annotation', id: 'a1' }], { points: true, fontSize: 22 });
assert.equal(doc.series[0].style.points, true);
assert.equal(doc.annotations[0].label.size, 22);

S.paste(doc, [{ type: 'chart', id: 'c1' }], { color: '#fedcba', width: 5, dash: 'dot', pointSize: 12, opacity: .5 });
assert.deepEqual(doc.charts[0], { id: 'c1', kind: 'scatter', color: '#fedcba', style: { pointSize: 12, width: 5, dash: 'solid' } });

assert.throws(() => S.apply(doc, [{ type: 'series', id: 's1' }], { width: 0 }), /不正/);
assert.throws(() => S.apply(doc, [{ type: 'series', id: 's1' }], { opacity: null }), /不正/);
const atomicStyle = JSON.stringify(doc.series[0].style);
assert.throws(() => S.apply(doc, [{ type: 'series', id: 's1' }], { points: false, lines: false }), /少なくとも/);
assert.equal(JSON.stringify(doc.series[0].style), atomicStyle, 'invalid visibility pair is atomic');
assert.throws(() => S.apply(doc, [{ type: 'parameter', name: 'p' }], { color: '#fff000' }), /共通/);
assert.throws(() => S.paste(doc, [{ type: 'series', id: 's1' }], { width: 100 }), /不正/);
assert.throws(() => S.apply(doc, [], { color: '#fff000' }), /対象/);

console.log('graph selection.test.cjs: ok');
