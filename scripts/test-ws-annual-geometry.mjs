import assert from 'node:assert/strict';
import fs from 'node:fs';
import test from 'node:test';
import {annualEdition, annualMarkerFits, fitAffine, fitProjective, mapPoint} from '../assets/ws-home/15_annual_geometry.mjs';

const layoutRoot = new URL('../assets/ws-home/layout/', import.meta.url);
const layouts = ['b5-F', 'b5-B', 'a4-F', 'a4-B'].map(name =>
  JSON.parse(fs.readFileSync(new URL(`2026-dr43-${name}.json`, layoutRoot), 'utf8')));
const geometrySource = fs.readFileSync(new URL('../assets/ws-home/15_annual_geometry.mjs', import.meta.url), 'utf8');
const {testConsensus} = await import(`data:text/javascript,${encodeURIComponent(`${geometrySource}\nexport {consensus as testConsensus};`)}`);
const pageCorners = layout => [
  {x: 0, y: 0}, {x: layout.page.widthMm, y: 0},
  {x: layout.page.widthMm, y: layout.page.heightMm}, {x: 0, y: layout.page.heightMm}
];
const photoCorners = [
  {x: 170, y: 120}, {x: 1540, y: 195},
  {x: 1390, y: 2180}, {x: 90, y: 2010}
];
function photoMap(layout) { return fitProjective(pageCorners(layout), photoCorners); }
function point(m, p) { return mapPoint(m, p); }
function squareObservation(layout, key, transform, shift = {x: 0, y: 0}) {
  const marker = layout.markers[key], center = marker.center.mm, size = marker.mm.width;
  const half = size / 2;
  const polygon = [
    {x: center.x - half, y: center.y - half}, {x: center.x + half, y: center.y - half},
    {x: center.x + half, y: center.y + half}, {x: center.x - half, y: center.y + half}
  ].map(p => { const q = point(transform, p); return {x: q.x + shift.x, y: q.y + shift.y}; });
  const p = point(transform, center);
  return {x: p.x + shift.x, y: p.y + shift.y, polygon};
}
function observations(layout, keys, transform = photoMap(layout)) {
  return keys.map(key => squareObservation(layout, key, transform));
}
function seed(layout, keys, observed, observedKeys = keys) {
  const indexes = keys.map(key => observedKeys.indexOf(key));
  assert.ok(indexes.every(i => i >= 0));
  return {source: indexes.map(i => ({x: observed[i].x, y: observed[i].y})),
    target: keys.map(key => layout.markers[key].center.mm)};
}
function assertPageFit(layout, fit, tolerance = 0.15) {
  const expected = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'].map(k => layout.markers[k].center.mm);
  expected.forEach((p, i) => {
    const actual = point(fit.toSource, p), target = point(photoMap(layout), p);
    assert.ok(Math.hypot(actual.x - target.x, actual.y - target.y) < tolerance,
      `corner ${i} drift: ${Math.hypot(actual.x - target.x, actual.y - target.y)}`);
  });
}

test('all four annual layouts register dispersed square markers through perspective', () => {
  for (const layout of layouts) {
    assert.equal(annualEdition(layout), true);
    const keys = Object.keys(layout.markers), observed = observations(layout, keys);
    const fits = annualMarkerFits(observed, layout,
      [seed(layout, ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'], observed, keys)]);
    assert.equal(fits.length, 1);
    assert.ok(fits[0].observedCount >= 6);
    assert.ok(fits[0].coverageFraction >= 0.25);
    assertPageFit(layout, fits[0]);
  }
});

test('four outer marks can be absent when intermediate points still span the page', () => {
  const layout = layouts[0], keys = ['topCenter', 'leftOneThird', 'rightOneThird', 'leftTwoThirds',
    'rightTwoThirds', 'bottomCenter'];
  const observed = observations(layout, keys);
  const fits = annualMarkerFits(observed, layout,
    [seed(layout, ['topCenter', 'leftOneThird', 'rightOneThird', 'bottomCenter'], observed, keys)]);
  assert.equal(fits.length, 1);
  assert.equal(fits[0].observedCount, 6);
  assert.ok(fits[0].coverageFraction >= 0.25);
  assertPageFit(layout, fits[0]);
});

test('low coverage, fewer than six supports, and tiny glyph-like fragments are rejected', () => {
  const layout = layouts[0], keys = ['topLeft', 'topLeftEdge', 'topCenter', 'leftOneThird', 'leftTwoThirds', 'bottomLeftEdge'];
  const observed = observations(layout, keys);
  const fits = annualMarkerFits(observed, layout, [seed(layout, keys.slice(0, 4), observed)]);
  assert.deepEqual(fits, []);

  const dispersed = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'topCenter', 'bottomCenter'];
  const five = observations(layout, dispersed.slice(0, 5));
  assert.deepEqual(annualMarkerFits(five, layout, [seed(layout, dispersed.slice(0, 4), five)]), []);

  const fragments = observations(layout, dispersed).map(o => ({...o,
    polygon: o.polygon.map((p, i) => ({x: o.x + (i % 2 ? 0.2 : -0.2), y: o.y + (i > 1 ? 0.2 : -0.2)}))}));
  assert.deepEqual(annualMarkerFits(fragments, layout, [seed(layout, dispersed.slice(0, 4), fragments)]), []);
});

test('a displaced false correspondence is excluded while six distributed true marks determine the fit', () => {
  const layout = layouts[0], keys = ['topCenter', 'topLeftEdge', 'topRight', 'leftOneThird',
    'rightTwoThirds', 'bottomLeft', 'bottomCenter'];
  const observed = observations(layout, keys);
  observed[3] = squareObservation(layout, keys[3], photoMap(layout), {x: 30, y: -24});
  const fits = annualMarkerFits(observed, layout,
    [seed(layout, ['topCenter', 'topRight', 'rightTwoThirds', 'bottomCenter'], observed, keys)]);
  assert.equal(fits.length, 1);
  assert.equal(fits[0].observedCount, 6);
  assertPageFit(layout, fits[0]);
});

test('near-tied duplicates weaken support, and unsupported editions never match', () => {
  const layout = layouts[0], keys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'topCenter', 'bottomCenter'];
  const observed = observations(layout, keys);
  observed.push(squareObservation(layout, 'topLeft', photoMap(layout), {x: 0.2, y: 0.1}));
  assert.deepEqual(annualMarkerFits(observed, layout, [seed(layout, keys.slice(0, 4), observed)]), []);
  assert.equal(annualMarkerFits(observations(layout, keys), {...layout, identity: {...layout.identity, year: 2025}},
    [seed(layout, keys.slice(0, 4), observations(layout, keys))]).length, 0);
  assert.equal(annualEdition({...layout, identity: {...layout.identity, worksheetId: 'dr41'}}), false);
});

test('projective mapping round trips synthetic control points', () => {
  const from = [{x: 0, y: 0}, {x: 182, y: 0}, {x: 182, y: 257}, {x: 0, y: 257}];
  const to = photoCorners;
  const matrix = fitProjective(from, to);
  from.forEach((p, i) => { const q = point(matrix, p); assert.ok(Math.hypot(q.x - to[i].x, q.y - to[i].y) < 1e-5); });
});

test('affine fit round trips a rotated, sheared and translated synthetic plane', () => {
  const from = [{x: 0, y: 0}, {x: 182, y: 0}, {x: 182, y: 257}, {x: 0, y: 257}, {x: 91, y: 128.5}];
  const to = from.map(p => ({x: 1.08 * p.x - 0.13 * p.y + 74, y: 0.07 * p.x + 0.96 * p.y - 31}));
  const matrix = fitAffine(from, to);
  from.forEach((p, i) => { const q = point(matrix, p); assert.ok(Math.hypot(q.x - to[i].x, q.y - to[i].y) < 1e-7); });
});

test('affine fit rejects collinear controls instead of inventing a transform', () => {
  assert.throws(() => fitAffine([{x: 0, y: 0}, {x: 1, y: 1}, {x: 2, y: 2}],
    [{x: 0, y: 0}, {x: 2, y: 2}, {x: 4, y: 4}]), /ANNUAL_SINGULAR/);
});

test('a singular four-point projective sample is skipped while a non-degenerate nine-point consensus survives', () => {
  const layout = layouts[0], names = Object.keys(layout.markers), corners = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft'];
  const targets = corners.map(key => layout.markers[key].center.mm), poleX = layout.markers.topCenter.center.mm.x;
  // This finite projectivity maps these four source controls to the corners,
  // while its denominator is zero at the synthetic fifth point.
  const source = targets.map(q => ({x: q.x / (1 + q.x / poleX), y: q.y / (1 + q.x / poleX)}));
  const expected = targets.map((target, i) => ({key: corners[i], expected: target, source: source[i], index: i}));
  const pole = {key: 'leftOneThird', expected: layout.markers.leftOneThird.center.mm,
    source: {x: poleX, y: layout.markers.topCenter.center.mm.y}, index: 4};
  const inlierKeys = ['topLeft', 'topRight', 'bottomRight', 'bottomLeft', 'leftOneThird', 'leftTwoThirds',
    'rightOneThird', 'rightTwoThirds', 'bottomCenter'];
  const inliers = inlierKeys.map((key, i) => ({key, expected: layout.markers[key].center.mm,
    source: layout.markers[key].center.mm, index: 5 + i}));
  const matches = expected.concat([pole], inliers);
  const result = testConsensus(matches, layout);
  assert.ok(result);
  assert.ok(result.selected.length >= 9);
  assert.ok(result.selected.some(m => m.index === 5) && result.selected.some(m => m.index === 13));
  assert.ok(result.residual <= 0.45);
});

test('six-millimeter seed search is recovered by strict refit without accepting a nearer false square', () => {
  const layout = layouts[0], keys = Object.keys(layout.markers), transform = photoMap(layout), observed = observations(layout, keys);
  const shift = {x: 4, y: -4}, sourcePage = pageCorners(layout);
  const seedSource = sourcePage.map(p => point(transform, p));
  const seedTarget = sourcePage.map(p => ({x: p.x + shift.x, y: p.y + shift.y}));
  const misleadingKey = 'leftOneThird', expected = layout.markers[misleadingKey].center.mm;
  const falseSource = {x: expected.x - shift.x, y: expected.y - shift.y};
  const falseObservation = squareObservation(layout, misleadingKey,
    fitProjective(pageCorners(layout), photoCorners), {x: 0, y: 0});
  const actualFalse = point(transform, falseSource);
  const delta = {x: actualFalse.x - falseObservation.x, y: actualFalse.y - falseObservation.y};
  observed.push({...falseObservation, x: actualFalse.x, y: actualFalse.y,
    polygon: falseObservation.polygon.map(p => ({x: p.x + delta.x, y: p.y + delta.y}))});
  const seed = {source: seedSource, target: seedTarget};
  assert.deepEqual(annualMarkerFits(observed, layout, [seed]), []);
  const fits = annualMarkerFits(observed, layout, [seed], {seedSearchRadiusMm: 6});
  assert.equal(fits.length, 1);
  assert.ok(fits[0].observedCount >= 12);
  assertPageFit(layout, fits[0]);
  assert.equal(fits[0].selected.some(m => Math.hypot(m.source.x - actualFalse.x, m.source.y - actualFalse.y) < 1e-6), false);
});


test('QR-local anchor is retained when observed, and absent corners are not invented', () => {
  const layout=layouts[0],all=Object.keys(layout.markers),observed=observations(layout,all);
  const fit=annualMarkerFits(observed,layout,[seed(layout,['topLeft','topRight','bottomRight','bottomLeft'],observed,all)],{seedSearchRadiusMm:6,anchorNearQr:true});
  assert.ok(fit.length);assert.ok(fit.every(f=>f.selected.some(m=>m.key==='topRight')));
  const remaining=['topCenter','leftOneThird','rightOneThird','leftTwoThirds','rightTwoThirds','bottomCenter'],partial=observations(layout,remaining);
  const noCorners=annualMarkerFits(partial,layout,[seed(layout,['topCenter','leftOneThird','rightOneThird','bottomCenter'],partial,remaining)],{seedSearchRadiusMm:6,anchorNearQr:true});
  assert.ok(noCorners.length);assert.equal(noCorners[0].observedCount,6);assertPageFit(layout,noCorners[0]);
});
