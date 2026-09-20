'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const C = require('../core.js');
const L = require('../layers.js');
const K = require('../connectors.js');
const A = require('../export-assets.js');
const T = require('../export-targets.js');

function fixture() {
  const document = C.createDocument(), page = document.pages[0];
  document.id = 'export-target-document'; document.name = '作品'; document.version = 10;
  page.id = 'page-one'; page.name = '最初'; page.board = { width: 120, height: 80, unit: 'px', infinite: false };
  const a = C.makeShape('rect', 10, 20, 20, 10); a.id = 'a'; a.name = 'A';
  const b = C.makeShape('rect', 70, 20, 20, 10); b.id = 'b'; b.name = 'B';
  const hidden = C.makeShape('rect', 5, 50, 10, 10); hidden.id = 'hidden'; hidden.visible = false;
  const reference = { id: 'reference', type: 'image', name: '下絵', group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0], style: C.normalizeStyle(undefined, true), x: 0, y: 0, width: 10, height: 10, src: 'data:image/png;base64,iVBORw0KGgo=', reference: true };
  const connector = K.make({ x: 30, y: 25, objectId: null, port: 'auto' }, { x: 70, y: 25, objectId: null, port: 'auto' }, { id: 'link' });
  page.objects = [a, b, hidden, reference, connector];
  page.animations = [
    { id: 'mixed', targets: ['a', 'b'], effect: 'fade', mode: 'in', trigger: 'click', duration: 100, delay: 0 },
    { id: 'move-a', targets: ['a'], effect: 'move', dx: 20, dy: -5, trigger: 'after', duration: 100, delay: 0 }
  ];
  page.notes = '教員用'; page.skip = true;
  const second = C.createPage('次', { width: 100, height: 60, unit: 'px', infinite: false }); second.id = 'page-two'; second.skip = false;
  document.pages.push(second);
  document.exportAssets = [
    { id: 'asset-a', name: 'Aだけ', pageId: 'page-one', objectIds: ['a'], enabled: true },
    { id: 'asset-disabled', name: '無効', pageId: 'page-one', objectIds: ['b'], enabled: false },
    { id: 'asset-missing', name: '欠落', pageId: 'page-one', objectIds: ['gone'], enabled: true }
  ];
  return C.validateDocument(document);
}

test('collect keeps document page order, defaults to including skipped pages, and resolves enabled assets', () => {
  const document = fixture();
  const assets = T.collect(document, { mode: 'assets' });
  assert.deepEqual(assets.entries.map(entry => [entry.key, entry.name, entry.selectionIds]), [['asset-a', 'Aだけ', ['a']]]);
  assert.equal(assets.omitted, 1, 'disabled assets are intentionally unchecked, not omitted');
  const skippedAssets = T.collect(document, { mode: 'assets', excludeSkipped: true });
  assert.deepEqual(skippedAssets.entries, []); assert.equal(skippedAssets.omitted, 2, 'unavailable and skipped enabled assets are omitted');
  const pages = T.collect(document, { mode: 'pages', pageIds: ['page-two', 'page-one'] });
  assert.deepEqual(pages.entries.map(entry => entry.key), ['page-one', 'page-two']);
  assert.deepEqual(pages.entries.map(entry => entry.name), ['作品_最初', '作品_次']);
  assert.equal(pages.omitted, 0);
  const filtered = T.collect(document, { mode: 'all', excludeSkipped: true });
  assert.deepEqual(filtered.entries.map(entry => entry.key), ['page-two']);
  assert.equal(filtered.omitted, 1);
});

test('htmlDocument excludes notes, skip metadata, hidden/reference objects, and exports no asset metadata', () => {
  const document = fixture(), source = JSON.stringify(document);
  const output = T.htmlDocument(document, [{ key: 'whole', name: '全部', page: document.pages[0], selectionIds: null }]);
  const page = output.pages[0];
  assert.equal(output.version, 10);
  assert.equal(Object.hasOwn(output, 'exportAssets'), false);
  assert.equal(Object.hasOwn(page, 'notes'), false); assert.equal(Object.hasOwn(page, 'skip'), false);
  assert.deepEqual(page.objects.map(object => object.id), ['a', 'b', 'link']);
  assert.equal(JSON.stringify(document), source, 'source document remains unchanged');
});

test('htmlDocument rejects empty target entries instead of creating blank source-sized pages', () => {
  const document = fixture(), page = document.pages[0];
  assert.throws(() => T.htmlDocument(document, []), /書き出すページがありません/);
  assert.throws(() => T.htmlDocument(document, [{ key: 'empty', name: '空', page, selectionIds: [] }]), /選択した図形がありません/);
  assert.throws(() => T.htmlDocument(document, [{ key: 'hidden', name: '非表示', page, selectionIds: ['hidden'] }]), /選択した図形がありません/);
});

test('htmlDocument makes selected assets independent cropped pages and prunes connectors and animations', async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const tab = await browser.newPage(); const root = path.resolve(__dirname, '..');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'core.js', 'layers.js', 'geometry.js', 'connectors.js', 'svg.js', 'export.js', 'export-assets.js', 'animation.js', 'export-targets.js']) await tab.addScriptTag({ path: path.join(root, file) });
    const result = await tab.evaluate(() => {
      const C = IlapoCore, K = IlapoConnectors, T = IlapoExportTargets;
      const document = C.createDocument(), page = document.pages[0]; document.id = 'browser-doc'; document.name = '作品'; document.version = 10; page.id = 'source'; page.board = { width: 120, height: 80, unit: 'px', infinite: false };
      const a = C.makeShape('rect', 10, 20, 20, 10); a.id = 'a'; const b = C.makeShape('rect', 70, 20, 20, 10); b.id = 'b';
      const link = K.make({ x: 0, y: 0, objectId: 'a', port: 'right' }, { x: 0, y: 0, objectId: 'b', port: 'left' }, { id: 'link' });
      page.objects = [a, b, link]; K.sync(page);
      page.animations = [{ id: 'mixed', targets: ['a', 'b'], effect: 'fade', mode: 'in', trigger: 'click', duration: 100, delay: 0 }, { id: 'move', targets: ['a'], effect: 'move', dx: 20, dy: 0, trigger: 'after', duration: 100, delay: 0 }, { id: 'move-back', targets: ['a'], effect: 'move', dx: -12, dy: 5, trigger: 'with', duration: 100, delay: 50 }];
      const source = JSON.stringify(document), output = T.htmlDocument(document, [{ key: 'asset-a', name: 'A', page, selectionIds: ['a', 'link'] }, { key: 'asset-b', name: 'B', page, selectionIds: ['b'] }], { padding: 8 });
      const first = output.pages[0], second = output.pages[1], aOut = first.objects.find(object => object.id === 'a');
      const aBounds = IlapoGeometry.visualBounds(aOut);
      const pdfPage = C.createPage('PDF', { width: 100, height: 60, unit: 'px', infinite: false }); const one = C.makeShape('rect', 1, 1, 10, 10); one.id = 'one'; const two = C.makeShape('rect', 50, 1, 10, 10); two.id = 'two'; pdfPage.objects = [one, two];
      const pdfHTML = IlapoExport.buildPrintHTML([{ page: pdfPage, selectionIds: ['one'] }]);
      const plan = IlapoAnimation.compile(first), measure = IlapoGeometry.visualBounds || IlapoGeometry.bounds;
      const frameBoundsFit = plan.groups.every(group => {
        const times = new Set([0, group.duration]); group.items.forEach(item => { times.add(item.start); times.add(item.end); });
        return [...times].every(time => { const frame = IlapoAnimation.frame(first, group.index, time, { plan }).page; IlapoConnectors.sync(frame); return frame.objects.every(object => { const b = measure(object); return b.x >= -.01 && b.y >= -.01 && b.x + b.width <= first.board.width + .01 && b.y + b.height <= first.board.height + .01; }); });
      });
      const animated = IlapoAnimation.frame(first, 1, 200, { plan }).page; IlapoConnectors.sync(animated);
      return { output, first: { ids: first.objects.map(object => object.id), name: first.name, target: first.objects.find(object => object.id === 'link').to.objectId, fromX: first.objects.find(object => object.id === 'link').from.x, animations: first.animations, board: first.board, aBounds }, second: { ids: second.objects.map(object => object.id), board: second.board }, sourceUnchanged: source === JSON.stringify(document), pdfHTML, frameBoundsFit, animatedFromX: animated.objects.find(object => object.id === 'link').from.x };
    });
    assert.equal(result.sourceUnchanged, true);
    assert.notEqual(result.output.pages[0].id, result.output.pages[1].id, 'each asset receives a unique output page ID');
    assert.deepEqual(result.first.ids, ['a', 'link']);
    assert.equal(result.first.target, null, 'connector endpoint to excluded object is detached');
    assert.equal(result.first.name, 'A');
    assert.deepEqual(result.first.animations.map(animation => [animation.id, animation.targets]), [['mixed', ['a']], ['move', ['a']], ['move-back', ['a']]]);
    assert(result.first.board.width >= 56, 'crop includes the selected object movement and padding');
    assert(result.first.aBounds.x >= 7.9 && result.first.aBounds.y >= 7.9, 'selected artwork is translated into its cropped board');
    assert.deepEqual(result.second.ids, ['b']);
    assert.equal(result.frameBoundsFit, true, 'every compiled animation boundary remains inside the cropped board');
    assert(result.animatedFromX > result.first.fromX, 'attached connector follows the selected shape during animation');
    assert.match(result.pdfHTML, /data-ilapo-id="one"/); assert.doesNotMatch(result.pdfHTML, /data-ilapo-id="two"/);
  } finally { await browser.close(); }
});
