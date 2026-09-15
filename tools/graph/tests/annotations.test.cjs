const assert = require('assert');
global.GraphCurves = {
  pointAt(series, doc, at) {
    if (series.id === 'curve' && at >= 0 && at <= 2) return [at, at * at];
    if (series.id === 'polar' && at >= 0 && at <= Math.PI * 2) return [2 * Math.cos(at), 2 * Math.sin(at)];
    return null;
  }
};
const Annotations = require('../annotations.js');

const doc = () => ({
  mode: '2d', angle: 'rad', parameters: [{ name: 'a', value: 2 }],
  axes: { x: { min: -5, max: 5, scale: 'linear' }, y: { min: -5, max: 8, scale: 'linear' } },
  series: [
    { id: 'square', kind: 'function', expression: 'y=x^2', domain: { x: [-4, 4] } },
    { id: 'line', kind: 'function', expression: 'y=2*x', domain: { x: [-4, 4] } },
    { id: 'absolute', kind: 'function', expression: 'y=abs(x)', domain: { x: [-4, 4] } },
    { id: 'same', kind: 'function', expression: 'y=x^2', domain: { x: [-4, 4] } },
    { id: 'near', kind: 'function', expression: 'y=x^2+1e-8', domain: { x: [-4, 4] } },
    { id: 'tiny', kind: 'function', expression: 'y=1e-10', domain: { x: [-4, 4] } },
    { id: 'largeA', kind: 'function', expression: 'y=1000000001', domain: { x: [-4, 4] } },
    { id: 'largeB', kind: 'function', expression: 'y=1000000000', domain: { x: [-4, 4] } },
    { id: 'two', kind: 'function', expression: 'y=2', domain: { x: [-4, 4] } },
    { id: 'half', kind: 'function', expression: 'y=.5', domain: { x: [-4, 4] } },
    { id: 'sine', kind: 'function', expression: 'y=sin(x)', domain: { x: [-4, 4] } },
    { id: 'hundredX', kind: 'function', expression: 'y=100*x', domain: { x: [-4, 4] } },
    { id: 'one', kind: 'function', expression: 'y=1', domain: { x: [-4, 4] } },
    { id: 'hugeX', kind: 'function', expression: 'y=10000000000*x', domain: { x: [-4, 4] } },
    { id: 'smallX', kind: 'function', expression: 'y=1e-10*x', domain: { x: [-4, 4] } },
    { id: 'largeShift', kind: 'function', expression: 'y=1000000000+x', domain: { x: [-4, 4] } },
    { id: 'tinyAbsolute', kind: 'function', expression: 'y=.001*abs(x)', domain: { x: [-4, 4] } },
    { id: 'squareRoot', kind: 'function', expression: 'y=sqrt(x)', domain: { x: [0, 4] } },
    { id: 'reciprocal', kind: 'function', expression: 'y=1/x', domain: { x: [-4, 4] } },
    { id: 'zero', kind: 'function', expression: 'y=0', domain: { x: [-4, 4] } },
    { id: 'curve', kind: 'parametric', components: { x: 't', y: 't^2' }, interval: [0, 2], domain: { x: [-4, 4] } },
    { id: 'polar', kind: 'polar', expression: '2', interval: [0, Math.PI * 2], domain: { x: [-4, 4] } },
    { id: 'parameterCurve', kind: 'function', expression: 'y=a*x', domain: { x: [-4, 4] } },
    { id: 'coefficientCurve', kind: 'parametric', components: { x: 'a*t', y: 't' }, interval: [0, 2], domain: { x: [-4, 4] } }
  ]
});
const near = (actual, expected, tolerance = 1e-5) => assert(Math.abs(actual - expected) < tolerance, `${actual} is not near ${expected}`);

{
  const result = Annotations.evaluate({ kind: 'point', anchor: { type: 'free', x: 'a+1', y: '2*a' }, projections: true }, doc());
  assert.deepStrictEqual(result.points, [[3, 4]]);
  assert.deepStrictEqual(result.segments, [[[3, 0], [3, 4]], [[0, 4], [3, 4]]]);
}
{
  const result = Annotations.evaluate({ kind: 'point', anchor: { type: 'curve', seriesId: 'curve', at: '2' }, projections: false }, doc());
  assert.deepStrictEqual(result.points, [[2, 4]]);
}
{
  const result = Annotations.evaluate({ kind: 'guide', axis: 'x', value: 'a-1' }, doc());
  assert.deepStrictEqual(result.segments, [[[1, -5], [1, 8]]]);
}
{
  const result = Annotations.evaluate({ kind: 'tangent', seriesId: 'square', at: '1' }, doc());
  assert.equal(result.warning, ''); assert.equal(result.points.length, 1); near(result.points[0][1], 1);
  assert.equal(result.segments.length, 1); near(result.segments[0][0][1] - result.segments[0][0][0] * 2, -1);
}
{
  const result = Annotations.evaluate({ kind: 'tangent', seriesId: 'square', at: '0' }, doc());
  assert.equal(result.warning, ''); assert.equal(result.segments.length, 1);
  near(result.segments[0][0][1], 0); near(result.segments[0][1][1], 0);
}
{
  const result = Annotations.evaluate({ kind: 'tangent', seriesId: 'absolute', at: '0' }, doc());
  assert.equal(result.segments.length, 0); assert.match(result.warning, /傾き/);
}
{
  const result = Annotations.evaluate({ kind: 'tangent', seriesId: 'tinyAbsolute', at: '0' }, doc());
  assert.equal(result.segments.length, 0); assert.match(result.warning, /傾き/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['square', 'line'], interval: [-3, 3] }, doc());
  assert.equal(result.warning, ''); assert.equal(result.points.length, 2);
  near(result.points[0][0], 0); near(result.points[1][0], 2);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['square', 'two'], interval: [-3, 3] }, doc());
  assert.equal(result.points.length, 2); near(result.points[0][0], -Math.sqrt(2)); near(result.points[1][0], Math.sqrt(2));
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['sine', 'half'], interval: [-3, 3] }, doc());
  assert.equal(result.points.length, 2); near(result.points[0][0], Math.PI / 6); near(result.points[1][0], 5 * Math.PI / 6);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['hundredX', 'one'], interval: [-1, 1] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], .01, 1e-9);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['squareRoot', 'two'], interval: [0, 4] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 4);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['hugeX', 'one'], interval: [-1, 1] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 1e-10, 1e-16);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['smallX', 'zero'], interval: [-1, 1] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 0);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['largeShift', 'largeA'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 1);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['square', 'zero'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 0);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['square', 'same'], interval: [-2, 2] }, doc());
  assert.match(result.warning, /数値計算では区別/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['reciprocal', 'zero'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 0); assert.match(result.warning, /交点/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['near', 'zero'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 0); assert.doesNotMatch(result.warning, /区別できない/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['tiny', 'zero'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 0); assert.doesNotMatch(result.warning, /区別できない/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['largeA', 'largeB'], interval: [-2, 2] }, doc());
  assert.equal(result.points.length, 0); assert.doesNotMatch(result.warning, /区別できない/);
}
{
  const result = Annotations.evaluate({ kind: 'intersection', seriesIds: ['squareRoot', 'zero'], interval: [0, 2] }, doc());
  assert.equal(result.points.length, 1); near(result.points[0][0], 0);
}
{
  const constrained = doc(); constrained.axes.x = { min: -1, max: 1, scale: 'linear' }; constrained.axes.y = { min: -1, max: 1, scale: 'linear' };
  const intersections = Annotations.evaluate({ kind: 'intersection', seriesIds: ['square', 'line'], interval: [-3, 3] }, constrained);
  assert.equal(intersections.points.length, 2); near(intersections.points[1][0], 2);
  const tangent = Annotations.evaluate({ kind: 'tangent', seriesId: 'square', at: '2' }, constrained);
  assert.deepStrictEqual(tangent.points, [[2, 4]]);
}
{
  const logarithmic = doc(); logarithmic.axes.x = { min: 1, max: 10, scale: 'log' }; logarithmic.axes.y = { min: 1, max: 10, scale: 'log' };
  const result = Annotations.evaluate({ kind: 'point', anchor: { type: 'free', x: '2', y: '3' }, projections: true }, logarithmic);
  assert.deepStrictEqual(result.segments, [[[2, 1], [2, 3]], [[1, 3], [2, 3]]]);
  assert.match(Annotations.evaluate({ kind: 'guide', axis: 'x', value: '0' }, logarithmic).warning, /対数軸/);
}
{
  const limited = doc(); limited.series.find(s => s.id === 'square').domain.x = [0, 1];
  const result = Annotations.evaluate({ kind: 'tangent', seriesId: 'square', at: '.5' }, limited);
  assert.equal(result.segments.length, 1);
  assert(result.segments[0].some(p => p[0] < 0) && result.segments[0].some(p => p[0] > 1), 'the tangent extends beyond the source curve domain within the view');
}
{
  const document = doc(); document.annotations = [
    { id: 'ti', kind: 'tangentIntersection', tangentIds: ['t1', 't2'] },
    { id: 't1', kind: 'tangent', seriesId: 'square', at: '1' },
    { id: 't2', kind: 'tangent', seriesId: 'square', at: '2' }
  ];
  const line = Annotations.tangentLine(document.annotations[1], document);
  near(line.point[0], 1); near(line.point[1], 1); near(line.slope, 2, 1e-4);
  const result = Annotations.evaluate(document.annotations[0], document);
  assert.equal(result.warning, ''); assert.equal(result.points.length, 1); near(result.points[0][0], 1.5); near(result.points[0][1], 2);
}
{
  const document = doc(); document.annotations = [
    { id: 'parallel', kind: 'tangentIntersection', tangentIds: ['t1', 't2'] },
    { id: 't1', kind: 'tangent', seriesId: 'square', at: '1' },
    { id: 't2', kind: 'tangent', seriesId: 'line', at: '0' }
  ];
  const result = Annotations.evaluate(document.annotations[0], document);
  assert.equal(result.points.length, 0); assert.match(result.warning, /平行|区別/);
}
{
  const document = doc(); document.annotations = [
    { id: 'segment', kind: 'segment', from: 'hidden', to: 'ti' },
    { id: 'ti', kind: 'tangentIntersection', tangentIds: ['t1', 't2'] },
    { id: 'hidden', kind: 'point', visible: false, anchor: { type: 'free', x: '1', y: '2' } },
    { id: 't1', kind: 'tangent', seriesId: 'square', at: '1' },
    { id: 't2', kind: 'tangent', seriesId: 'square', at: '2' }
  ];
  assert.equal(Annotations.evaluate(document.annotations[2], document).points.length, 0, 'hidden point itself is not drawn');
  const result = Annotations.evaluate(document.annotations[0], document);
  assert.equal(result.warning, ''); assert.equal(result.segments.length, 1); near(result.segments[0][0][0], 1); near(result.segments[0][0][1], 2); near(result.segments[0][1][0], 1.5); near(result.segments[0][1][1], 2);
}
{
  const result = Annotations.evaluate({ kind: 'text', anchor: { type: 'free', x: 'a+1', y: '2' }, text: '<b>説明</b>' }, doc());
  assert.deepStrictEqual(result.points, [[3, 2]]); assert.equal(result.segments.length, 0);
}
{
  const document = doc();
  const free = { kind: 'point', anchor: { type: 'free', x: '1', y: '2' } };
  const moved = Annotations.anchorForDrag(free, document, [1.23456789012345, -2.5]);
  assert.equal(moved.type, 'free'); near(Number(moved.x), 1.23456789012345, 1e-14); near(Number(moved.y), -2.5, 1e-14);
  assert.equal(Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'free', x: 'a', y: '2' } }, document, [1, 2]), null);
}
{
  const document = doc();
  const functionAnchor = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'square', at: '0' } }, document, [2, 4]);
  near(Number(functionAnchor.at), 2, 1e-5);
  const clampedFunctionAnchor = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'square', at: '0' } }, document, [9, 4]);
  near(Number(clampedFunctionAnchor.at), 4, 1e-12);
  const parametricAnchor = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'curve', at: '0' } }, document, [1.5, 2.25]);
  near(Number(parametricAnchor.at), 1.5, 1e-5);
  const polarAnchor = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'polar', at: '0' } }, document, [0, 2]);
  near(Number(polarAnchor.at), Math.PI / 2, 1e-4);
  const coefficientFunction = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'parameterCurve', at: '1' } }, document, [1.25, 2]);
  near(Number(coefficientFunction.at), 1.25, 1e-12);
  const coefficientParametric = Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'coefficientCurve', at: '1' } }, document, [2, 1]);
  near(Number(coefficientParametric.at), 1, 1e-5);
  assert.equal(Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'curve', at: '1/2' } }, document, [1, 1]), null);
  document.series.find(s => s.id === 'square').expression = 'sqrt(x)';
  assert.equal(Annotations.anchorForDrag({ kind: 'point', anchor: { type: 'curve', seriesId: 'square', at: '1' } }, document, [-1, 1]), null, 'do not drag a point into an undefined part of a function');
}
console.log('graph annotations tests passed');
