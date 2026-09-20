'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const os = require('node:os');
const C = require('../core.js');
const A = require('../export-assets.js');
const P = require('../presentation-data.js');

function image(id, reference) {
  return {
    id, type: 'image', name: '下絵', group: null, locked: false, matrix: [1, 0, 0, 1, 0, 0],
    style: C.normalizeStyle(undefined, true), x: 0, y: 0, width: 10, height: 10,
    src: 'data:image/png;base64,iVBORw0KGgo=', reference
  };
}
function documentWithLayers() {
  const document = C.createDocument(), page = document.pages[0];
  document.id = 'asset-document'; document.name = '書き出しアセット'; page.id = 'asset-page';
  const live = C.makeShape('rect', 0, 0, 10, 10); live.id = 'live'; live.name = '四角';
  const objectHidden = C.makeShape('ellipse', 20, 0, 10, 10); objectHidden.id = 'object-hidden'; objectHidden.visible = false;
  const layerHidden = C.makeShape('triangle', 40, 0, 10, 10); layerHidden.id = 'layer-hidden';
  const reference = image('reference', true);
  page.objects = [live, objectHidden, reference, layerHidden];
  page.layers = [
    { id: 'visible-layer', name: '表示', visible: true, locked: false, objectIds: ['live', 'object-hidden', 'reference'] },
    { id: 'hidden-layer', name: '非表示', visible: false, locked: false, objectIds: ['layer-hidden'] }
  ];
  return C.validateDocument(document);
}

test('registered assets retain only current visible, non-reference selections', () => {
  const document = documentWithLayers();
  const asset = A.add(document, 'asset-page', ['live', 'object-hidden', 'layer-hidden', 'reference']);
  assert.equal(asset.name, '四角');
  assert.deepEqual(asset.objectIds, ['live']);
  assert.equal(document.version, 10);
  assert.deepEqual(C.validateDocument(JSON.parse(JSON.stringify(document))).exportAssets, [asset], 'JSON keeps references without snapshots');
  assert.throws(() => A.add(document, 'asset-page', ['object-hidden', 'layer-hidden', 'reference']), /書き出せる図形/);
});

test('asset names are fixed while sources resolve live, deleted, and hidden references', () => {
  const document = documentWithLayers();
  const asset = A.add(document, 'asset-page', ['live']);
  document.pages[0].objects.find(object => object.id === 'live').name = '変更後の図形';
  assert.equal(asset.name, '四角');
  assert.deepEqual(A.resolve(document, asset).selectionIds, ['live']);
  document.pages[0].objects.find(object => object.id === 'live').visible = false;
  const hidden = A.resolve(document, asset);
  assert.equal(hidden.page, document.pages[0], 'resolve returns the current document page without cloning it');
  assert.deepEqual({ ...hidden, page: null }, { page: null, selectionIds: [], missingCount: 0, hiddenCount: 1, available: false });
  document.pages[0].objects = document.pages[0].objects.filter(object => object.id !== 'live');
  document.pages[0].layers[0].objectIds = document.pages[0].layers[0].objectIds.filter(id => id !== 'live');
  const deleted = A.resolve(document, asset);
  assert.equal(deleted.missingCount, 1); assert.equal(deleted.available, false); assert.deepEqual(deleted.selectionIds, []);
});

test('a missing page never resolves to a whole-page export', () => {
  const document = documentWithLayers();
  const asset = { id: 'missing-page-asset', name: '残存参照', pageId: 'removed-page', objectIds: ['old-object'], enabled: true };
  document.exportAssets = [asset]; document.version = 10;
  assert.deepEqual(A.resolve(document, asset), { page: null, selectionIds: [], missingCount: 1, hiddenCount: 0, available: false });
});

test('resolve accepts an ephemeral selected-object reference', () => {
  const document = documentWithLayers();
  assert.deepEqual(A.resolve(document, { pageId: 'asset-page', objectIds: ['live', 'object-hidden', 'reference'] }).selectionIds, ['live']);
  const empty = A.resolve(document, { pageId: 'asset-page', objectIds: [] });
  assert.equal(empty.available, false); assert.deepEqual(empty.selectionIds, []);
});

test('asset schema rejects unknown fields, duplicate references, and configured limits', () => {
  const base = documentWithLayers();
  const asset = { id: 'asset-1', name: '対象', pageId: 'asset-page', objectIds: ['live'], enabled: true };
  assert.throws(() => C.validateDocument({ ...base, version: 9, exportAssets: [{ ...asset, extra: true }] }), /not allowed/);
  assert.throws(() => C.validateDocument({ ...base, exportAssets: [{ ...asset, name: '　 ' }] }), /blank/);
  assert.throws(() => C.validateDocument({ ...base, version: 9, exportAssets: [{ ...asset, objectIds: ['live', 'live'] }] }), /duplicate export asset object id/);
  assert.throws(() => C.validateDocument({ ...base, version: 9, exportAssets: Array.from({ length: 101 }, (_, index) => ({ ...asset, id: 'asset-' + index })) }), /exceeds the limit/);
  assert.throws(() => C.validateDocument({ ...base, version: 9, exportAssets: [{ ...asset, objectIds: Array.from({ length: 5001 }, (_, index) => 'object-' + index) }] }), /invalid length/);
  assert.equal(C.validateDocument({ ...base, version: 10 }).version, 10, 'existing versions do not decrease when metadata is removed');
});

test('automatic names are unique and clip a long source object name', () => {
  const document = documentWithLayers();
  document.pages[0].objects.find(object => object.id === 'live').name = 'あ'.repeat(121);
  const first = A.add(document, 'asset-page', ['live']);
  const second = A.add(document, 'asset-page', ['live']);
  assert.equal(first.name.length, 120);
  assert.equal(second.name, 'あ'.repeat(118) + '_2');
  assert.equal(second.name.length, 120);
});

test('presentation output removes export metadata and remains valid', () => {
  const document = documentWithLayers();
  A.add(document, 'asset-page', ['live']);
  const output = P.outputDocument(document);
  assert.equal(Object.hasOwn(output, 'exportAssets'), false);
  assert.equal(output.version, 10);
  assert.equal(Object.hasOwn(document, 'exportAssets'), true);
});

test('ZIP manifest serializes and validates export asset references', async () => {
  let chromium;
  try { ({ chromium } = require('playwright')); } catch { ({ chromium } = require(path.join(os.homedir(), '.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'))); }
  const browser = await chromium.launch({ channel: 'chrome', headless: true });
  try {
    const page = await browser.newPage();
    const root = path.resolve(__dirname, '..');
    for (const file of ['vendor/paper-core-0.12.18.min.js', 'vendor/fflate-0.8.2.umd.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js']) await page.addScriptTag({ path: path.join(root, file) });
    const zipDocument = documentWithLayers();
    const asset = A.add(zipDocument, 'asset-page', ['live'], 'ZIP参照'); asset.id = 'asset-zip';
    const result = await page.evaluate(document => {
      const bytes = IlapoSVG.encodeProject(document);
      const files = fflate.unzipSync(bytes), manifest = JSON.parse(fflate.strFromU8(files['manifest.json']));
      const roundtrip = IlapoSVG.decodeProject(bytes);
      manifest.exportAssets[0].unexpected = true;
      files['manifest.json'] = fflate.strToU8(JSON.stringify(manifest));
      let rejected = false;
      try { IlapoSVG.decodeProject(fflate.zipSync(files)); } catch (_) { rejected = true; }
      return { manifest, roundtrip, rejected };
    }, zipDocument);
    assert.equal(result.manifest.version, 10);
    assert.deepEqual(result.roundtrip.exportAssets, [{ id: 'asset-zip', name: 'ZIP参照', pageId: 'asset-page', objectIds: ['live'], enabled: true }]);
    assert.equal(result.rejected, true);
  } finally { await browser.close(); }
});
