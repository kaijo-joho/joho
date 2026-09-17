const assert = require('assert');
const ViewControls = require('../view-controls.js');

const makeDoc = (x, y, mode = '2d') => ({ mode, axes: {
  x: { min: x[0], max: x[1], scale: x[2] || 'linear' },
  y: { min: y[0], max: y[1], scale: y[2] || 'linear' }
} });

{
  const doc = makeDoc([1e9 - 1, 1e9], [-1, 1]);
  const before = JSON.stringify(doc);
  assert.deepStrictEqual(ViewControls.zoomAxes(doc, 'both', 1), { x: { min: 1e9 - 1, max: 1e9 }, y: { min: -1, max: 1 } });
  assert.equal(JSON.stringify(doc), before, '文書を変更しない');
}

{
  const out = ViewControls.zoomAxes(makeDoc([-10, 10], [-4, 6]), 'both', .5);
  assert.deepStrictEqual(out, { x: { min: -5, max: 5 }, y: { min: -1.5, max: 3.5 } });
}
{
  const out = ViewControls.zoomAxes(makeDoc([-10, 10], [-4, 6]), 'x', 2);
  assert.deepStrictEqual(out, { x: { min: -20, max: 20 }, y: { min: -4, max: 6 } });
}
{
  const out = ViewControls.zoomAxes(makeDoc([1, 100, 'log'], [10, 20, 'log']), 'y', .1);
  assert.deepStrictEqual(out.x, { min: 1, max: 100 });
  const center = (Math.log10(10) + Math.log10(20)) / 2;
  assert(Math.abs((Math.log10(out.y.min) + Math.log10(out.y.max)) / 2 - center) < 1e-12);
  assert(Math.abs((Math.log10(out.y.max) - Math.log10(out.y.min)) - .1 * (Math.log10(20) - Math.log10(10))) < 1e-12);
}

// Logarithmic zoom preserves the geometric center and scales the exponent span.
{
  const out = ViewControls.zoomAxes(makeDoc([1, 100, 'log'], [1, 100, 'log']), 'x', .5);
  assert(Math.abs(out.x.min - 10 ** .5) < 1e-12);
  assert(Math.abs(out.x.max - 10 ** 1.5) < 1e-12);
}

for (const args of [
  [makeDoc([-1, 1], [-1, 1], '3d'), 'both', .5],
  [makeDoc([-1, 1], [-1, 1]), 'z', .5],
  [makeDoc([-1, 1], [-1, 1]), 'both', 0],
  [makeDoc([-1, 1], [-1, 1]), 'both', Infinity]
]) assert.throws(() => ViewControls.zoomAxes(...args), /グラフ|方向|倍率/);

assert.throws(() => ViewControls.zoomAxes(makeDoc([1, 2, 'log'], [-1, 1]), 'both', 1e20), /許容範囲/);
assert.throws(() => ViewControls.zoomAxes(makeDoc([-1e9, 1], [-1, 1]), 'x', 2), /許容範囲/);
assert.throws(() => ViewControls.zoomAxes(makeDoc([0, 1, 'log'], [-1, 1]), 'both', .5), /対数範囲/);
console.log('view-controls.test.cjs: ok');
