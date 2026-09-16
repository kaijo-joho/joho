/* Regression annotations are live curve sources; no displayed equation is reparsed. */
const assert = require('assert');
const A = require('../annotations.js');
const Analysis = require('../analysis.js');
const near = (actual, expected, tolerance = 1e-7) => assert(Math.abs(actual - expected) < tolerance, `${actual} != ${expected}`);
const doc = () => ({
  mode: '2d', angle: 'rad', parameters: [],
  axes: { x: { min: -2, max: 4, scale: 'linear' }, y: { min: -3, max: 12, scale: 'linear' } },
  series: [
    { id: 'data', kind: 'data2d', rows: [[0, 1], [1, 3], [2, 5]] },
    { id: 'line', kind: 'function', expression: 'y=3', domain: { x: [-2, 4] } }
  ],
  // Deliberately place dependents before the source annotation: lookup is by ID.
  annotations: [
    { id: 'point', kind: 'point', anchor: { type: 'regression', regressionId: 'fit', at: '1' } },
    { id: 'tangent', kind: 'tangent', target: { type: 'regression', id: 'fit' }, at: '1' },
    { id: 'fit', kind: 'regression', seriesId: 'data', model: 'linear' }
  ]
});
{
  const d = doc(), point = d.annotations[0], tangent = d.annotations[1];
  let out = A.evaluate(point, d); assert.equal(out.warning, ''); assert.deepStrictEqual(out.points, [[1, 3]]);
  const fit = A.evaluate(d.annotations[2], d); assert.equal(fit.warning, ''); assert.equal(fit.segments.length, 1);
  const line = A.tangentLine(tangent, d); assert.equal(line.warning, ''); near(line.slope, 2); near(line.point[1], 3);
  const cross = A.evaluate({ kind: 'intersection', targets: [{ type: 'regression', id: 'fit' }, { type: 'series', id: 'line' }], interval: ['0', '2'] }, d);
  assert.equal(cross.points.length, 1); near(cross.points[0][0], 1);
  const region = A.evaluate({ kind: 'curveRegion', targets: [{ type: 'regression', id: 'fit' }, { type: 'axis', axis: 'x' }], interval: ['0', '2'] }, d);
  assert.equal(region.warning, ''); near(region.integral, 6); near(region.area, 6);
  const moved = A.anchorForDrag(point, d, [99, 0]); assert.equal(moved.type, 'regression'); assert.equal(moved.regressionId, 'fit'); near(Number(moved.at), 2);
  d.series[0].rows = [[0, 1], [1, 5], [2, 9]];
  out = A.evaluate(point, d); assert.deepStrictEqual(out.points, [[1, 5]], 'source edits refit dependent point');
  near(A.tangentLine(tangent, d).slope, 4, 1e-10);
}
{
  const d = doc(); d.annotations.find(a => a.id === 'fit').model = 'quadratic'; d.series[0].rows = [[0, 0], [1, 1], [2, 4]];
  const region = A.evaluate({ kind: 'curveRegion', targets: [{ type: 'regression', id: 'fit' }, { type: 'axis', axis: 'x' }], interval: ['0', '2'] }, d);
  near(region.integral, 8 / 3, 1e-6); near(A.tangentLine(d.annotations[1], d).slope, 2, 1e-9);
}
{
  const fit = Analysis.fit({ rows: [[1e8 - 1, 9], [1e8, 4], [1e8 + 1, 1], [1e8 + 2, 0]] }, 'quadratic');
  assert.equal(fit.warning, ''); near(Analysis.derivative(fit, 1e8 + .5), -3, 1e-9);
  const exponential = Analysis.fit({ rows: [[0, 2], [1, 2 * Math.E], [2, 2 * Math.E ** 2]] }, 'exponential');
  near(Analysis.derivative(exponential, 1), 2 * Math.E, 1e-9);
  const power = Analysis.fit({ rows: [[1, 3], [2, 12], [4, 48]] }, 'power');
  near(Analysis.derivative(power, 2), 12, 1e-9);
  const proportional=Analysis.fit({rows:[[1,2],[2,4],[3,6]]},'proportional');
  near(Analysis.derivative(proportional,2),2,1e-12);
  const d=doc();d.series[0].rows=[[1,2],[2,4],[3,6]];d.annotations[2].model='proportional';
  assert.equal(A.tangentLine(d.annotations[1],d).warning,'');near(A.tangentLine(d.annotations[1],d).slope,2,1e-12);
}
{
  const d = doc(); d.series[0].rows = [[0, 1]];
  const result = A.evaluate(d.annotations[0], d);
  assert(result.warning, 'failed fits retain the configured dependency and report a warning');
  assert.equal(A.anchorForDrag(d.annotations[0], d, [1, 1]), null);
}
console.log('graph regression link tests passed');
