#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
let chromium;
try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
const root = path.resolve(__dirname, '..');

function near(actual, expected, message) { assert.ok(Math.abs(actual - expected) < 1e-6, `${message}: ${actual} !== ${expected}`); }

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  try {
    for (const file of [
      'vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js',
      'core.js', 'geometry.js', 'connectors.js', 'assets.js', 'animation.js', 'svg.js'
    ]) await page.addScriptTag({ path: path.join(root, file) });

    const report = await page.evaluate(() => {
      const C = IlapoCore, K = IlapoConnectors, S = IlapoSVG, A = IlapoAnimation;
      const style = { fill: '#ffffff', stroke: '#123456', strokeWidth: 1, opacity: 1, dash: '', linecap: 'round', linejoin: 'round', fontSize: 16, fontFamily: 'sans-serif', bold: false, italic: false };
      const page = C.createPage('routing', { width: 700, height: 500, unit: 'px', infinite: false });
      const a = C.makeShape('rect', 0, 100, 40, 40, style); a.id = 'a';
      const b = C.makeShape('rect', 220, 160, 40, 40, style); b.id = 'b';
      const c = K.make({ x: 0, y: 0, objectId: 'a' }, { x: 0, y: 0, objectId: 'b' }, { id: 'c', waypoints: [{ x: 80, y: 120 }, { x: 150, y: 260 }] });
      page.objects = [a, b, c]; K.sync(page);
      const initial = c.waypoints.map(p => ({ ...p }));
      a.matrix[4] += 20; b.matrix[4] += 40; K.sync(page);
      const moved = c.waypoints.map(p => ({ ...p }));
      const stableSnapshot = JSON.stringify(page); K.sync(page); const stable = JSON.stringify(page) === stableSnapshot;

      const fixed = K.make({ x: 0, y: 0, objectId: 'a', port: 'top', ratio: .25 }, { x: 0, y: 0, objectId: 'b', port: 'bottom', ratio: .75 }, { id: 'fixed' });
      page.objects.push(fixed); K.sync(page);
      const fixedBefore = { from: { x: fixed.from.x, y: fixed.from.y }, to: { x: fixed.to.x, y: fixed.to.y } };
      a.matrix[5] += 30; b.matrix[5] += 50; K.sync(page);
      const fixedAfter = { from: { x: fixed.from.x, y: fixed.from.y }, to: { x: fixed.to.x, y: fixed.to.y } };

      const free = K.make({ x: 30, y: 300 }, { x: 0, y: 0, objectId: 'b' }, { id: 'free', waypoints: [{ x: 120, y: 320 }] });
      page.objects.push(free); K.sync(page); const freeBefore = { ...free.waypoints[0] };
      b.matrix[4] += 25; K.sync(page); const freeAfter = { ...free.waypoints[0] };

      const zA = C.makeShape('rect', 0, 350, 40, 40, style); zA.id = 'zA'; const zB = C.makeShape('rect', 200, 350, 40, 40, style); zB.id = 'zB';
      const zero = K.make({ x: 0, y: 0, objectId: 'zA' }, { x: 0, y: 0, objectId: 'zB' }, { id: 'zero', waypoints: [{ x: 120, y: 500 }] });
      page.objects.push(zA, zB, zero); K.sync(page); const zeroBefore = zero.waypoints[0].y;
      zA.matrix[5] += 11; zB.matrix[5] += 31; K.sync(page); const zeroAfter = zero.waypoints[0].y;

      const transformed = C.clone(c); const transformedBefore = transformed.waypoints.map(p => ({ ...p }));
      const transformPage = { id: 'transform-page', name: 'transform', board: { width: 700, height: 500, unit: 'px', infinite: false }, objects: [a, b, transformed] }; C.transformObjects(transformPage, ['a', 'b', 'c'], [1, 0, 0, 1, 70, 45]); K.sync(transformPage);
      const transformDelta = transformed.waypoints.map((p, i) => ({ x: p.x - transformedBefore[i].x, y: p.y - transformedBefore[i].y }));

      const rotate = C.makeShape('rect', 400, 100, 60, 30, style); rotate.id = 'rotate'; rotate.matrix = [0, 1, -1, 0, 500, 0];
      const rotateTarget = C.makeShape('rect', 600, 100, 40, 40, style); rotateTarget.id = 'rotateTarget';
      const rotated = K.make({ x: 0, y: 0, objectId: 'rotate', port: 'right', ratio: .5 }, { x: 0, y: 0, objectId: 'rotateTarget', port: 'left', ratio: .5 }, { id: 'rotated' });
      const rotatePage = { objects: [rotate, rotateTarget, rotated] }; K.sync(rotatePage); const rotatedPoint = { ...rotated.from };
      rotatePage.objects.splice(1, 1); K.sync(rotatePage); const detached = rotated.to.objectId === null;

      const orthogonal = K.make({ x: 0, y: 0, objectId: 'a', port: 'right' }, { x: 0, y: 0, objectId: 'b', port: 'left' }, { id: 'orthogonal', route: 'orthogonal', waypoints: [{ x: 100, y: 50 }, { x: 160, y: 350 }] });
      const op = { objects: [a, b, orthogonal] }; K.sync(op); const beforeSegment = K.points(orthogonal, op); const movedSegment = K.moveSegment(orthogonal, 1, { x: 175, y: 0 }); const afterSegment = K.points(movedSegment, op);
      const segmentKeepsEnds = beforeSegment[0].x === afterSegment[0].x && beforeSegment[0].y === afterSegment[0].y && beforeSegment.at(-1).x === afterSegment.at(-1).x && beforeSegment.at(-1).y === afterSegment.at(-1).y;
      const routeValid = afterSegment.slice(1).every((p, i) => p.x === afterSegment[i].x || p.y === afterSegment[i].y);

      const ports = ['top', 'right', 'bottom', 'left']; let allPorts = true, badPorts = [];
      const relative = [[0, 0], [320, 0], [-320, 0], [0, 260], [0, -260], [250, 180]];
      for (const [dx, dy] of relative) for (const from of ports) for (const to of ports) {
        const qa = C.makeShape('rect', 100, 100, 40, 40, style); qa.id = 'qa'; const qb = C.makeShape('rect', 100 + dx, 100 + dy, 40, 40, style); qb.id = 'qb';
        const q = K.make({ x: 0, y: 0, objectId: 'qa', port: from }, { x: 0, y: 0, objectId: 'qb', port: to }, { route: 'orthogonal' });
        const qp = { objects: [qa, qb, q] }; K.sync(qp); const ps = K.points(q, qp); const lead = { top: [0, -1], right: [1, 0], bottom: [0, 1], left: [-1, 0] };
        const first = [Math.sign(ps[1].x - ps[0].x), Math.sign(ps[1].y - ps[0].y)], last = [Math.sign(ps.at(-1).x - ps.at(-2).x), Math.sign(ps.at(-1).y - ps.at(-2).y)];
        if (first[0] !== lead[from][0] || first[1] !== lead[from][1] || last[0] !== -lead[to][0] || last[1] !== -lead[to][1] || !ps.slice(1).every((p, i) => p.x === ps[i].x || p.y === ps[i].y)) badPorts.push({ dx, dy, from, to, ps });
      }
      allPorts = badPorts.length === 0;

      const segmentNoOp = JSON.stringify(K.moveSegment(orthogonal, 1, { x: beforeSegment[1].x, y: beforeSegment[1].y })) === JSON.stringify(orthogonal);
      const togetherA = C.makeShape('rect', 0, 0, 40, 40, style); togetherA.id = 'togetherA'; const togetherB = C.makeShape('rect', 200, 0, 40, 40, style); togetherB.id = 'togetherB';
      const togetherC = K.make({ x: 0, y: 0, objectId: 'togetherA' }, { x: 0, y: 0, objectId: 'togetherB' }, { id: 'togetherC', waypoints: [{ x: 100, y: 80 }, { x: 150, y: 100 }] }); const togetherPage = { objects: [togetherA, togetherB, togetherC] }; K.sync(togetherPage); const togetherBefore = togetherC.waypoints.map(p => ({ ...p })); togetherA.matrix[4] += 35; togetherA.matrix[5] += 22; togetherB.matrix[4] += 35; togetherB.matrix[5] += 22; K.sync(togetherPage); const togetherDelta = togetherC.waypoints.map((p, i) => ({ x: p.x - togetherBefore[i].x, y: p.y - togetherBefore[i].y }));

      const animShape = C.makeShape('rect', 0, 0, 40, 40, style); animShape.id = 'animShape'; const animTarget = C.makeShape('rect', 200, 0, 40, 40, style); animTarget.id = 'animTarget';
      const animConnector = K.make({ x: 0, y: 0, objectId: 'animShape' }, { x: 0, y: 0, objectId: 'animTarget' }, { id: 'animConnector', waypoints: [{ x: 100, y: 80 }] });
      const animPage = C.createPage('animation', { width: 700, height: 500, unit: 'px', infinite: false }); animPage.objects = [animShape, animTarget, animConnector]; animPage.animations = [{ id: 'move', targets: ['animShape'], effect: 'move', trigger: 'click', duration: 100, delay: 0, dx: 50, dy: 20 }];
      const animDoc = C.validateDocument({ format: 'kaijo-ilapo', version: 3, id: 'animation-doc', name: 'animation', pages: [animPage] }); K.sync(animDoc.pages[0]); const animBefore = JSON.stringify(animDoc); const frame = A.frame(animDoc.pages[0], 1, Infinity).page; K.sync(frame); const animationLine = frame.objects.find(o => o.id === 'animConnector'); const animationFollow = animationLine.from.x > animConnector.from.x && animationLine.waypoints[0].x > animConnector.waypoints[0].x; const animationInputStable = JSON.stringify(animDoc) === animBefore;
      const doc = C.validateDocument({ format: 'kaijo-ilapo', version: 3, id: 'routing-doc', name: 'routing', pages: [page] }); const roundTrip = JSON.stringify(S.decodeProject(S.encodeProject(doc))) === JSON.stringify(doc);
      return { initial, moved, stable, fixedBefore, fixedAfter, freeBefore, freeAfter, zeroBefore, zeroAfter, transformDelta, rotatedPoint, detached, segmentKeepsEnds, routeValid, segmentNoOp, togetherDelta, allPorts, badPorts, animationFrom: animationLine.from.x, animationFollow, animationWaypoints: animationLine.waypoints, animationInputStable, roundTrip };
    });

    assert.deepEqual(report.initial, [{ x: 80, y: 120 }, { x: 150, y: 260 }]);
    near(report.moved[0].x, 104.44444444444444, 'first waypoint interpolates endpoint deltas');
    near(report.moved[1].x, 182.22222222222223, 'second waypoint interpolates endpoint deltas');
    near(report.moved[0].y, 120, 'first waypoint preserves unchanged axis');
    near(report.moved[1].y, 260, 'second waypoint preserves unchanged axis');
    assert.equal(report.stable, true, 'repeated sync is stable');
    near(report.fixedAfter.from.x, report.fixedBefore.from.x, 'fixed top port x remains ratio based');
    near(report.fixedAfter.to.x, report.fixedBefore.to.x, 'fixed bottom port x remains ratio based');
    assert(report.freeAfter.x > report.freeBefore.x && report.freeAfter.x < report.freeBefore.x + 25, 'free endpoint contributes zero delta');
    near(report.zeroAfter - report.zeroBefore, 21, 'zero extent uses half weight');
    assert.deepEqual(report.transformDelta, [{ x: 70, y: 45 }, { x: 70, y: 45 }], 'connector-inclusive transform moves each route point once');
    near(report.rotatedPoint.x, 385, 'rotated fixed port has exact transformed x');
    near(report.rotatedPoint.y, 460, 'rotated fixed port has exact transformed y');
    assert(report.detached, 'deleted target detaches while retaining cached endpoint');
    assert(report.segmentKeepsEnds && report.routeValid && report.segmentNoOp, 'manual orthogonal segment move retains endpoints, right angles, and no-op identity');
    report.togetherDelta.forEach((p, i) => { near(p.x, 35, `same-direction waypoint ${i + 1} x delta`); near(p.y, 22, `same-direction waypoint ${i + 1} y delta`); });
    assert(report.allPorts, `all 16 orthogonal port combinations preserve stub direction: ${JSON.stringify(report.badPorts)}`);
    assert(report.animationFollow && report.animationInputStable, `animation frame moves endpoint and waypoint without mutating input: ${JSON.stringify(report.animationFrom)}`);
    near(report.animationWaypoints[0].x, 131.25, 'animation moves waypoint by expected interpolated x delta');
    near(report.animationWaypoints[0].y, 100, 'animation preserves unchanged waypoint axis');
    assert(report.roundTrip, 'native ZIP round trip preserves routing document');
    console.log('connector-routing-browser.test.cjs: passed');
  } finally { await browser.close(); }
})().catch(error => { console.error(error); process.exitCode = 1; });
