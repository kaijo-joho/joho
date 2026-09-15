#!/usr/bin/env node
'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { chromium } = require(path.join(process.env.HOME, '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root = path.resolve(__dirname, '..');

(async () => {
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage();
  for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'svg.js']) await page.addScriptTag({ path: path.join(root, file) });
  const report = await page.evaluate(() => {
    const style = { fill: '#112233', stroke: '#445566', strokeWidth: 2, opacity: .8, dash: '4 2', linecap: 'round', linejoin: 'round', fontSize: 20, fontFamily: 'serif', bold: true, italic: true };
    const curved = { id: 'curve', type: 'path', name: 'curve', group: 'shapes', locked: false, matrix: [1, 0, 0, 1, 10, 5], style, d: 'M0 0 C20 -20 40 20 60 0 L60 40 L0 40 Z M15 10 C20 20 40 20 45 10 L45 30 L15 30 Z' };
    const circle = { id: 'circle', type: 'path', name: 'circle', group: 'shapes', locked: false, matrix: [1, 0, 0, 1, 25, 0], style, d: 'M0 0 A25 25 0 1 0 50 0 A25 25 0 1 0 0 0 Z' };
    const text = { id: 'text', type: 'text', name: '日本語', group: 'labels', locked: false, matrix: [1, .1, 0, 1, 4, 3], style, x: 20, y: 80, runs: [{ text: '日本語 ', script: 'normal' }, { text: '太字', script: 'super' }, { text: '\n下付き', script: 'sub' }] };
    const b = IlapoGeometry.bounds(curved);
    const textBox = IlapoGeometry.bounds(text);
    const cut = IlapoGeometry.boolean(curved, circle, 'subtract');
    const before = IlapoGeometry.anchors(cut);
    const moved = IlapoGeometry.moveAnchor(cut, 0, 0, 18, -6);
    const after = IlapoGeometry.anchors(moved);
    const p = { id: 'p1', name: 'A4', board: { width: 210 * 96 / 25.4, height: 297 * 96 / 25.4, unit: 'mm', infinite: false }, objects: [curved, text] };
    const svg = IlapoSVG.exportPage(p);
    const imported = IlapoSVG.importSVG(svg).page;
    const free = { id: 'p2', name: '曲線', board: { width: 300, height: 200, unit: 'px', infinite: true }, objects: [{ ...moved, matrix: [1, 0, 0, 1, -55, -20] }, { ...text, x: -40, y: -30 }] };
    const beforeD = free.objects[0].d;
    const zip = IlapoSVG.encodeProject({ format: 'kaijo-ilapo', version: 1, id: 'doc', name: '図', pages: [free] });
    const resumed = IlapoSVG.decodeProject(zip);
    const nativeSvg = fflate.strFromU8(fflate.unzipSync(zip)['pages/p2.svg']);
    const selectionRoundTrip = IlapoSVG.importSVG(IlapoSVG.exportPage(free, { selectionIds: free.objects.map(o => o.id) })).page;
    let blocked = false; try { IlapoSVG.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'); } catch (_) { blocked = true; }
    const ordered = IlapoSVG.exportPage({ id: 'order', board: { width: 100, height: 100 }, objects: [{ ...curved, id: 'a', group: 'g' }, { ...circle, id: 'b', group: null }, { ...curved, id: 'c', group: 'g' }] });
    let rootBlocked = false; try { IlapoSVG.importSVG('<svg xmlns="http://www.w3.org/2000/svg" onload="x()"/>'); } catch (_) { rootBlocked = true; }
    const shiftedViewBox = IlapoSVG.importSVG('<svg xmlns="http://www.w3.org/2000/svg" viewBox="10 5 20 20"><path d="M10 5L20 5"/></svg>').page;
    const named = IlapoSVG.importSVG('<svg xmlns="http://www.w3.org/2000/svg"><g fill="red" opacity=".5"><path d="M0 0L1 1" opacity=".5"/></g></svg>').page.objects[0];
    return { b, textBox, before, after, svg, imported, zipLength: zip.length, resumed, beforeD, nativeSvg, selectionRoundTrip, blocked, ordered, rootBlocked, shiftedViewBox, named };
  });
  assert.ok(report.b.width > 0 && report.b.height > 0);
  assert.ok(report.textBox.x > 0 && report.textBox.y > 0); // matrix applies to text bounds
  assert.equal(report.after[0][0].point.x - report.before[0][0].point.x, 18);
  assert.equal(report.after[0][0].point.y - report.before[0][0].point.y, -6);
  assert.match(report.svg, /日本語/);
  assert.equal(report.imported.objects.length, 2);
  assert.equal(report.imported.objects.find(o => o.type === 'text').runs.map(r => r.text).join(''), '日本語 太字\n下付き');
  assert.deepEqual(report.imported.objects.find(o => o.type === 'text').runs.map(r => r.script), ['normal', 'super', 'sub']);
  assert.ok(report.zipLength > 100);
  assert.equal(report.resumed.pages[0].objects[0].d, report.beforeD);
  assert.equal(report.resumed.pages[0].objects[0].matrix[4], -55);
  assert.match(report.nativeSvg, /viewBox="-/); // free canvas includes negative artwork
  assert.equal(report.resumed.pages[0].objects[1].style.fontFamily, 'serif');
  assert.equal(report.blocked, true);
  assert.equal(report.rootBlocked, true);
  assert.equal(report.shiftedViewBox.objects[0].matrix[4], -10);
  assert.equal(report.shiftedViewBox.objects[0].matrix[5], -5);
  assert.equal(report.selectionRoundTrip.objects.length, 2);
  assert.equal(report.named.style.fill, '#ff0000');
  assert.equal(report.named.style.opacity, .25);
  assert.ok(report.ordered.indexOf('data-ilapo-id="a"') < report.ordered.indexOf('data-ilapo-id="b"') && report.ordered.indexOf('data-ilapo-id="b"') < report.ordered.indexOf('data-ilapo-id="c"'));
  const svgWidth = Number(report.svg.match(/width="([^"]+)"/)[1]);
  assert.ok(Math.abs(svgWidth - 210 * 96 / 25.4) < 1e-9); // 210 mm at 96 px/in
  console.log('geometry-svg.test.cjs: passed');
  await browser.close();
})().catch(async error => { console.error(error); process.exitCode = 1; });
