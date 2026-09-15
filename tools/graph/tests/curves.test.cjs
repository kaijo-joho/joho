const assert = require('assert');
const Curves = require('../curves.js');
const doc = (angle = 'rad') => ({ angle, axes: { x: { min: -5, max: 5 }, y: { min: -5, max: 5 }, z: { min: -5, max: 5 } }, parameters: [] });
const implicit = expression => ({ kind: 'implicit', expression, domain: { x: [-5, 5], y: [-5, 5] } });
const parametric = (x, y, interval = [0, Math.PI * 2]) => ({ kind: 'parametric', components: { x, y }, interval, domain: { x: [-5, 5], y: [-5, 5] } });
const polar = (expression, interval = [0, Math.PI * 2]) => ({ kind: 'polar', expression, interval, domain: { x: [-5, 5], y: [-5, 5] } });
const hasPointNear = (sample, x, y, tolerance = .08) => sample.x.some((vx, i) => vx !== null && Math.hypot(vx - x, sample.y[i] - y) < tolerance);
const segments = sample => { const out = []; for (let i = 0; i < sample.x.length; i += 3) if (sample.x[i] !== null && sample.x[i + 1] !== null) out.push([[sample.x[i], sample.y[i]], [sample.x[i + 1], sample.y[i + 1]]]); return out; };

{
  const result = Curves.sampleImplicit(implicit('x^2+y^2=9'), doc());
  assert(result.x.length > 100 && result.x.length <= 12000);
  assert(hasPointNear(result, 3, 0) && hasPointNear(result, 0, 3), '円周を格子境界まで検出する');
}
for (const expression of ['1e8*(x^2+y^2-9)=0', '1e-10*(x^2+y^2-9)=0']) {
  const result = Curves.sampleImplicit(implicit(expression), doc());
  assert(hasPointNear(result, 3, 0) && hasPointNear(result, 0, 3), '定数倍しても同じ円を検出する');
}
{
  const zoomed = doc(); zoomed.axes.x = { min: -1, max: 1 }; zoomed.axes.y = { min: -1, max: 1 };
  const result = Curves.sampleImplicit(implicit('x=0'), zoomed);
  assert(result.x.every((x, i) => x === null || (x >= -1 && x <= 1 && result.y[i] >= -1 && result.y[i] <= 1)), '陰関数は表示範囲との共通部をサンプリングする');
}
{
  const result = Curves.sampleImplicit(implicit('x*y=0'), doc());
  assert(hasPointNear(result, 0, 2) && hasPointNear(result, 2, 0), '曖昧セルを含む直交する軸を描く');
}
{
  const series = implicit('(x-.00625)*(y-.00625)-.00002=0'); series.domain = { x: [-1, 1], y: [-1, 1] };
  const result = Curves.sampleImplicit(series, doc());
  const local = segments(result).filter(pair => pair.flat().every(value => value >= 0 && value <= .025));
  assert(local.some(pair => pair.flat().every(value => value < .00625)), 'Q<0 の片枝は低い x/y 側を結ぶ');
  assert(local.some(pair => pair.flat().every(value => value > .00625)), 'Q<0 の片枝は高い x/y 側を結ぶ');
}
{
  const series = implicit('(x-.00625)*(y-.00625)=0'); series.domain = { x: [-1, 1], y: [-1, 1] };
  const result = Curves.sampleImplicit(series, doc());
  const local = segments(result).filter(pair => pair.flat().every(value => value >= 0 && value <= .025));
  assert(local.filter(pair => pair.some(point => Math.hypot(point[0] - .00625, point[1] - .00625) < 1e-9)).length === 4, 'Q=0 の鞍点では4辺を中心へ接続する');
}
for (const expression of ['x=0', 'y=0']) {
  const result = Curves.sampleImplicit(implicit(expression), doc());
  assert(result.x.filter(x => x !== null).length > 100, expression + ' が格子線と一致しても輪郭を描く');
  if (expression === 'x=0') assert(result.x.every(x => x === null || Math.abs(x) < 1e-10), '格子線上の根を巨大な横線にしない');
  else assert(result.y.every(y => y === null || Math.abs(y) < 1e-10), '格子線上の根を巨大な縦線にしない');
}
{
  const result = Curves.sampleImplicit(implicit('x^2+y^2=0'), doc());
  assert.equal(result.x.filter(x => x !== null).length, 0, '孤立した重根を曲線の線分にしない');
  assert(result.warnings.length > 0);
}
{
  const result = Curves.sampleImplicit(implicit('1/x=0'), doc());
  assert.equal(result.x.filter(x => x !== null).length, 0, '1/x=0 の漸近線を根として描かない');
}
{
  const result = Curves.sampleImplicit(implicit('tan(x)=0'), doc());
  assert(hasPointNear(result, 0, 2), 'tan の実根は描く');
  assert(!result.x.some((x, i) => x !== null && Math.abs(x - Math.PI / 2) < .06 && Math.abs(result.y[i]) > 1), 'tan の漸近線を根として描かない');
}
{
  const smooth = Curves.sampleParametric(parametric('3*cos(t)', '2*sin(t)'), doc());
  assert(smooth.x.filter(x => x === null).length < 4);
  assert(hasPointNear(smooth, 3, 0));
  const cusp = Curves.sampleParametric(parametric('t^2', 't^3', [-1, 1]), doc());
  assert(hasPointNear(cusp, 0, 0, .02), '尖点を含む媒介曲線を評価する');
}
{
  const broken = Curves.sampleParametric(parametric('1/t', 't', [-1, 1]), doc());
  assert(broken.x.includes(null), '媒介曲線の未定義点を接続しない');
  const shifted = Curves.sampleParametric(parametric('1/(t-.12345)', 't', [-1, 1]), doc());
  assert(shifted.x.includes(null));
  const steps = Curves.sampleParametric(parametric('floor(t)', 't', [-2, 2]), doc());
  assert(steps.x.includes(null), '段差を線で橋渡ししない');
  const oneSided = Curves.sampleParametric(parametric('sqrt(t)', 't', [-1, 1]), doc());
  assert(oneSided.x.some((x, i) => x !== null && oneSided.y[i] > .5), '片側定義の有効側は残す');
  assert(oneSided.x.some((x, i) => x === null && oneSided.y[i] === null));
}
{
  const result = Curves.samplePolar(polar('2*cos(3*theta)'), doc());
  assert(hasPointNear(result, 2, 0));
  assert(!result.x.includes(null), '滑らかなrose曲線を不連続として切らない');
  const negative = Curves.samplePolar(polar('-2*cos(theta)'), doc());
  assert(hasPointNear(negative, -2, 0), '負の半径を座標変換する');
  const degree = Curves.samplePolar(polar('2*cos(theta)', [0, 360]), doc('deg'));
  assert(hasPointNear(degree, 2, 0));
  const endpoint = Curves.pointAt(polar('1', [0, 360]), doc('deg'), 360);
  assert(Math.hypot(endpoint[0] - 1, endpoint[1]) < 1e-10);
}
{
  assert.deepEqual(Curves.pointAt({ kind: 'function', expression: 'y=x^2', domain: { x: [-2, 2] } }, doc(), 2), [2, 4]);
  assert.equal(Curves.pointAt({ kind: 'function', expression: 'x^2', domain: { x: [-2, 2] } }, doc(), 3), null);
  assert.deepEqual(Curves.pointAt(parametric('cos(t)', 'sin(t)', [0, Math.PI]), doc(), 0), [1, 0]);
  assert.equal(Curves.pointAt(polar('1', [0, 90]), doc('deg'), 91), null);
}
console.log('curves.test.cjs: ok');
