const assert = require('assert');
const Regions = require('../regions.js');
const Core = require('../core.js');
const Annotations = require('../annotations.js');
const near = (actual, expected, relative = 1e-12) => assert(Math.abs(actual - expected) <= Math.max(Math.abs(expected) * relative, Number.MIN_VALUE));
const doc = () => ({ mode: '2d', angle: 'rad', parameters: [{ name: 'a', value: 2 }], axes: { x: { min: -10, max: 10, scale: 'linear', unit: 'cm' }, y: { min: -10, max: 10, scale: 'linear', unit: 'cm' } }, series: [], annotations: [] });
function boundary(document, ids) { return Regions.traceBoundary({ segmentIds: ids }, document); }
function addTriangle(document) {
  document.annotations = [
    { id: 'a', kind: 'point', anchor: { type: 'free', x: '0', y: '0' } }, { id: 'b', kind: 'point', anchor: { type: 'free', x: '4', y: '0' } }, { id: 'c', kind: 'point', anchor: { type: 'free', x: '0', y: '3' } },
    { id: 'ab', kind: 'segment', from: 'a', to: 'b' }, { id: 'bc', kind: 'segment', from: 'b', to: 'c' }, { id: 'ca', kind: 'segment', from: 'c', to: 'a' }
  ];
}
{
  const document = doc(); addTriangle(document);
  const traced = boundary(document, ['bc', 'ca', 'ab']);
  assert.equal(traced.warning, ''); assert.equal(new Set(traced.pointIds).size, 3); assert.equal(new Set(traced.segmentIds).size, 3);
  const result = Regions.measurePolygon([[0, 0], [4, 0], [0, 3]]);
  assert.equal(result.warning, ''); assert.equal(result.area, 6); assert(Regions.containsPoint(result.polygon, result.labelPoint));
  assert.equal(Regions.areaText(result.area, document), '面積 ≈ 6 [cm × cm]');
  document.axes.y.unit = '   '; assert.equal(Regions.areaText(result.area, document), '面積 ≈ 6');
}
{
  const concave = Regions.measurePolygon([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]]);
  assert.equal(concave.warning, ''); assert.equal(concave.area, 10); assert(Regions.containsPoint(concave.polygon, concave.labelPoint));
  assert.equal(Regions.measurePolygon([[0, 0], [3, 3], [0, 3], [3, 0]]).area, null, '自己交差は拒否する');
  assert.equal(Regions.measurePolygon([[1000000000, 1000000000], [1000000002, 1000000000], [1000000000, 1000000003]]).area, 3, '大きな平行移動で面積を失わない');
  assert.equal(Regions.measurePolygon([[0, 0], [1e-9, 0], [0, 1e-9]]).area, 5e-19, '小さな図形も扱う');
  for (const scale of [1e-9, 1e-15]) {
    const points = [[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]].map(([x, y]) => [x * scale, y * scale]);
    const scaled = Regions.measurePolygon(points);
    assert.equal(scaled.warning, ''); near(scaled.area, 10 * scale * scale); // 小さな凹多角形の面積を保つ
    assert(Regions.containsPoint(scaled.polygon, [scale, scale])); assert(!Regions.containsPoint(scaled.polygon, [2 * scale, 3 * scale]));
    assert(Regions.containsPoint(scaled.polygon, scaled.labelPoint), '小さな凹多角形のラベルは内部に置く');
  }
  const shifted = Regions.measurePolygon([[0, 0], [4, 0], [4, 4], [2, 1], [0, 4]].map(([x, y]) => [1000000000 + x, -1000000000 + y]));
  assert.equal(shifted.area, 10); assert(Regions.containsPoint(shifted.polygon, shifted.labelPoint)); assert(Regions.containsPoint(shifted.polygon, [1000000001, -999999999]));
}
{
  const document = doc(); addTriangle(document); document.annotations.push({ id: 'branch', kind: 'segment', from: 'a', to: 'b' });
  assert.match(boundary(document, ['ab', 'bc', 'ca', 'branch']).warning, /枝分かれ/);
}
{
  const document = doc(); addTriangle(document); document.annotations.push({ id: 'region', kind: 'region', visible: true, segmentIds: ['ab', 'bc', 'ca'], showArea: true });
  let result = Annotations.evaluate(document.annotations.at(-1), document);
  assert.equal(result.area, 6); assert.equal(result.warning, '');
  document.annotations.find(a => a.id === 'b').anchor.x = 'a*3'; result = Annotations.evaluate(document.annotations.at(-1), document);
  assert.equal(result.area, 9, '係数と点の変更へ追従する');
  document.axes.x.scale = 'log'; result = Annotations.evaluate(document.annotations.at(-1), document); assert.match(result.warning, /対数軸/);
}
{
  const document = Core.createDocument(), a = Core.createAnnotation('point'), b = Core.createAnnotation('point'), c = Core.createAnnotation('point'), ab = Core.createAnnotation('segment'), bc = Core.createAnnotation('segment'), ca = Core.createAnnotation('segment'), region = Core.createAnnotation('region');
  [a, b, c].forEach((point, i) => { point.id = ['a', 'b', 'c'][i]; }); ab.id = 'ab'; bc.id = 'bc'; ca.id = 'ca'; ab.from = 'a'; ab.to = 'b'; bc.from = 'b'; bc.to = 'c'; ca.from = 'c'; ca.to = 'a'; region.id = 'r'; region.segmentIds = ['ab', 'bc', 'ca']; document.annotations = [region, ca, b, ab, c, bc, a];
  const clean = Core.validateDocument(document); assert.equal(clean.version, 12); Core.removeAnnotation(document, 'a'); assert.equal(document.annotations.length, 3, '点→線分→領域を再帰削除する'); assert(!document.annotations.some(annotation => annotation.id === 'r'));
  const old = Core.clone(clean); old.version = 4; delete old.presentation; delete old.output; assert.throws(() => Core.validateDocument(old), /版と内容|版と数表|版と型付き数表|分析グラフ・比較設定/);
  const bad = Core.clone(clean); bad.annotations.find(a => a.id === 'r').segmentIds = ['missing', 'bc', 'ca']; assert.throws(() => Core.validateDocument(bad), /領域/);
}
console.log('graph regions tests passed');
