const assert = require('assert');
global.GraphExpression = require('../expression.js');
const Plot = require('../plot.js');

const doc = () => ({ mode: '2d', angle: 'rad', axes: { x: { min: -2, max: 2, label: 'x', unit: '', scale: 'linear' }, y: { min: -2, max: 2, label: 'y', unit: '', scale: 'linear' }, z: { min: -2, max: 2, label: 'z', unit: '', scale: 'linear' } }, parameters: [], series: [] });

{
  const p = Plot.sampleFunction({ expression: 'x^2', domain: { x: [-2, 2] } }, doc());
  assert(p.x.length > 64 && p.x.length <= 1601);
  assert(p.y.every((v) => v === null || Number.isFinite(v)));
}
{
  const p = Plot.sampleFunction({ expression: '1/x', domain: { x: [-1, 1] } }, doc());
  assert(p.y.includes(null), '漸近線付近は線を切る');
}
for (const expression of ['1/(x-.123456)', 'tan(x+1.4473403267948966)']) {
  const p = Plot.sampleFunction({ expression, domain: { x: [-1, 1] } }, doc());
  for (let i = 1; i < p.x.length; i++) {
    assert(!(p.y[i - 1] !== null && p.y[i] !== null && p.x[i - 1] < .123456 && p.x[i] > .123456), expression + ' の漸近線を横切って接続しない');
  }
}
for (const expression of ['x^2', 'exp(x)', 'sin(x)', '100000*x']) {
  const p = Plot.sampleFunction({ expression, domain: { x: [-2, 2] } }, doc());
  assert(!p.y.includes(null), expression + ' は連続関数なので線を切らない');
}
{
  const p = Plot.sampleFunction({ expression: 'sqrt(x)', domain: { x: [-2, 2] } }, doc());
  assert(p.y.some((v, i) => p.x[i] < 0 && v === null));
  assert(p.y.some((v, i) => p.x[i] > .5 && v !== null), '定義域側は描画する');
}
{
  const p = Plot.sampleSurface({ expression: 'sqrt(x-y)', domain: { x: [-1, 1], y: [-1, 1] } }, doc());
  assert.equal(p.x.length, 71);
  assert.equal(p.z.length, 71);
  assert(p.z.flat().includes(null), '未定義の曲面は null にする');
}
{
  const p = Plot.sampleSurface({ expression: '1/(x-.13)', domain: { x: [-1, 1], y: [-1, 1] } }, doc());
  assert(p.z.flat().includes(null), '漸近面は null の帯で切る');
}
assert.equal(Plot.escapeText('<img src=x>'), '&lt;img src=x&gt;');
console.log('plot.test.cjs: ok');
