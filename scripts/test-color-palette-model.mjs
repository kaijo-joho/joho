import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const Model = require(resolve(dirname(fileURLToPath(import.meta.url)), '../js/color-palette-model.js'));

function apply(document, command) {
  return Model.applyCommand(document, command);
}

const defaults = Model.defaults();
assert.equal(defaults.schemaVersion, 2);
assert.equal(defaults.revision, 0);
assert.deepEqual(defaults.pinnedColors, []);
assert.deepEqual(defaults.reservedCssNames, []);
for (const key of ['l','c','h','r','g','b','count','viewMode','bgTheme','outputFormat','hsvMode','hsl','hsv','themeMode','comparisonFG','comparisonBG','compareFollow']) {
  assert.ok(Object.hasOwn(defaults.state, key), `default state has ${key}`);
}

assert.deepEqual(Model.parseHex('#0f8'), { r: 0, g: 255, b: 136 });
assert.deepEqual(Model.parseHex('225386'), { r: 34, g: 83, b: 134 });
for (const invalid of ['#12', 'GGGGGG', '12345', '#1234567', null]) assert.equal(Model.parseHex(invalid), null);
assert.equal(Model.cssIdentifier(' Primary / CTA '), 'primary-cta');
assert.equal(Model.cssIdentifier('東京_色'), '東京_色');
assert.deepEqual(Model.hslToRgb(0, 100, 50), { r: 255, g: 0, b: 0 });
assert.deepEqual(Model.hsvToRgb(120, 100, 100), { r: 0, g: 255, b: 0 });
assert.equal(Model.contrastRatio({r:0,g:0,b:0}, {r:255,g:255,b:255}), 21);
assert.equal(Model.contrastRatio({r:38,g:38,b:38}, {r:38,g:38,b:38}), 1);

// 旧保存は再読み込みごとに同じIDと、以前のCSS出力と同じ別名を得る。
const legacy = {
  state: { l: 0.54, c: 0.1, h: 190, r: 10, g: 20, b: 30, count: 9, outputFormat: 'hex' },
  pinnedColors: [
    { l: 0.6, c: 0.1, h: 20, name: 'Primary / CTA' },
    { l: 0.5, c: 0.08, h: 220, name: 'primary:cta' },
    { l: 0.7, c: 0.05, h: 80, name: 'Primary CTA-2' },
    { l: 0.3, c: 0, h: 99 }
  ]
};
const migrated = Model.normalizeDocument(legacy);
const migratedAgain = Model.normalizeDocument(legacy);
const strictLegacy = Model.normalizeDocument(legacy, { strict: true });
assert.equal(migrated.repaired, true, 'legacy shape requests one-time canonical persistence');
assert.deepEqual(migrated.document.pinnedColors.map(pin => pin.id), ['legacy-1','legacy-2','legacy-3','legacy-4']);
assert.deepEqual(migrated.document.pinnedColors.map(pin => pin.cssName), ['primary-cta','primary-cta-3','primary-cta-2','color']);
assert.deepEqual(migratedAgain.document.pinnedColors, migrated.document.pinnedColors);
assert.deepEqual(strictLegacy.document.pinnedColors, migrated.document.pinnedColors, 'strict import accepts a recognized legacy payload');
assert.notDeepEqual([migrated.document.state.r,migrated.document.state.g,migrated.document.state.b], [10,20,30], 'valid LCH wins over stale legacy RGB fields');
assert.equal(migrated.document.state.count, 9);
assert.equal(migrated.document.state.outputFormat, 'hex');
assert.throws(() => Model.normalizeDocument({ state: { ...legacy.state, count: 2 }, pinnedColors: legacy.pinnedColors }, { strict: true }), /count/);
assert.throws(() => Model.normalizeDocument({ state: legacy.state, pinnedColors: [{ l: null, c: 0, h: 0 }] }, { strict: true }), /pinnedColors/);
assert.throws(() => Model.normalizeDocument('{broken', { strict: true }), /JSON/);

// 無彩色で色相が見えなくなっても、入力した色相を次の部分編集まで保持する。
let state = structuredClone(defaults.state);
let patch = Model.colorPatch(state, 'hsl', { h: 230, s: 0, l: 50 });
state = { ...state, ...patch };
assert.equal(state.hsl.h, 230);
assert.equal(state.hsl.s, 0);
assert.equal(state.r, state.g);
assert.equal(state.g, state.b);
patch = Model.colorPatch(state, 'hsl', { l: 60 });
assert.equal(patch.hsl.h, 230);
assert.equal(patch.hsl.s, 0);
state = { ...state, ...patch };
state = { ...state, ...Model.colorPatch(state, 'rgb', { r: 128, g: 128, b: 128 }) };
patch = Model.colorPatch(state, 'hsl', { h: 240 });
state = { ...state, ...patch };
assert.equal(state.hsv.h, 240, 'an achromatic HSL hue is shared with latent HSV hue');
patch = Model.colorPatch(state, 'hsv', { s: 100 });
assert.equal(patch.hsv.h, 240);
assert.ok(patch.b > 120 && patch.r < 3 && patch.g < 3, 'switching to HSV and increasing saturation restores the selected blue hue');
patch = Model.colorPatch(state, 'hsv', { h: 310, s: 65, v: 0 });
state = { ...state, ...patch };
assert.equal(state.hsv.h, 310);
assert.equal(state.hsv.s, 65);
assert.deepEqual([state.r,state.g,state.b], [0,0,0]);
patch = Model.colorPatch(state, 'hsv', { v: 50 });
assert.equal(patch.hsv.h, 310);
assert.equal(patch.hsv.s, 65);
state = { ...state, ...patch };
patch = Model.colorPatch(state, 'rgb', { r: 127, g: 127, b: 127 });
assert.equal(patch.hsl.h, state.hsl.h);
assert.equal(patch.hsv.h, 310);
const followed = Model.colorPatch({ ...state, compareFollow: 'bg', comparisonBG: '#FFFFFF' }, 'rgb', { r: 0, g: 0, b: 0 });
assert.equal(followed.comparisonBG, '#000000');

// CSS別名は表示名の編集に追従せず、削除後も自動割当で再利用されない。
let doc = migrated.document;
const originalPin = doc.pinnedColors[0];
let result = apply(doc, { type: 'renameStock', id: originalPin.id, name: 'New Human Label' });
doc = result.document;
assert.equal(doc.pinnedColors[0].cssName, 'primary-cta');
assert.equal(doc.pinnedColors[0].name, 'New Human Label');
result = apply(doc, { type: 'removeStock', id: 'legacy-2' });
doc = result.document;
assert.ok(doc.reservedCssNames.includes('primary-cta-3'));
const afterRemove = apply(doc, { type: 'addStock', color: { l: 0.42, c: 0.09, h: 75, name: 'primary:cta' } });
assert.equal(afterRemove.document.pinnedColors.at(-1).cssName, 'primary-cta-4');
const restored = apply(result.document, result.inverse);
assert.equal(restored.document.pinnedColors[1].id, 'legacy-2');
assert.equal(restored.document.pinnedColors[1].cssName, 'primary-cta-3');
assert.equal(restored.document.reservedCssNames.includes('primary-cta-3'), true);
const redoneRemoval = apply(restored.document, restored.inverse);
assert.equal(redoneRemoval.document.pinnedColors.some(pin => pin.id === 'legacy-2'), false);
assert.equal(redoneRemoval.document.reservedCssNames.includes('primary-cta-3'), true);

let renamed = apply(doc, { type: 'setCssName', id: 'legacy-1', cssName: 'accent-main' });
assert.equal(renamed.document.pinnedColors[0].cssName, 'accent-main');
assert.ok(renamed.document.reservedCssNames.includes('primary-cta'));
const aliasUndo = apply(renamed.document, renamed.inverse);
assert.equal(aliasUndo.document.pinnedColors[0].cssName, 'primary-cta');
assert.throws(() => apply(aliasUndo.document, { type: 'setCssName', id: 'legacy-1', cssName: aliasUndo.document.pinnedColors[1].cssName }), /使用中/);

// 逆操作は対象がその後に外部変更された場合に止まる。
const stateChange = apply(Model.defaults(), { type: 'state', patch: { count: 12 } });
assert.equal(stateChange.document.revision, 1);
const stateUndo = apply(stateChange.document, stateChange.inverse);
assert.equal(stateUndo.document.state.count, 16);
assert.equal(apply(stateUndo.document, stateUndo.inverse).document.state.count, 12, 'inverse of Undo works as Redo');
const stateRemote = apply(stateChange.document, { type: 'state', patch: { count: 14 } });
assert.throws(() => apply(stateRemote.document, stateChange.inverse), /別の場所/);

const pinAdd = apply(Model.defaults(), { type: 'addStock', color: { l: 0.55, c: 0.12, h: 190, name: 'teal' } });
assert.equal(pinAdd.document.pinnedColors[0].id, 'stock-1');
assert.throws(() => apply(pinAdd.document, { type: 'addStock', color: { l: 0.55, c: 0.12, h: 550, name: 'same-color' } }), /同じLCH/);
const neutralDistinctHue = apply(Model.defaults(), { type: 'addStock', color: { l: 0.5, c: 0, h: 0, name: 'gray' } });
assert.equal(apply(neutralDistinctHue.document, { type: 'addStock', color: { l: 0.5, c: 0, h: 80, name: 'gray-green' } }).document.pinnedColors.length, 2);
const pinRename = apply(pinAdd.document, { type: 'renameStock', id: 'stock-1', name: 'Renamed' });
assert.throws(() => apply(pinRename.document, pinAdd.inverse), /変更されています/);
const pinRemove = apply(pinAdd.document, { type: 'removeStock', id: 'stock-1' });
const remoteReinsert = apply(pinRemove.document, { type: 'addStock', color: { id: 'stock-1', l: 0.4, c: 0.1, h: 10, name: 'remote', cssName: 'remote' } });
assert.throws(() => apply(remoteReinsert.document, pinRemove.inverse), /すでにあります/);

const beforeBadImport = JSON.stringify(defaults);
assert.throws(() => apply(defaults, { type: 'replace', document: { state: { count: 0 }, pinnedColors: [] } }), /不正/);
assert.equal(JSON.stringify(defaults), beforeBadImport, 'failed import does not mutate the prior document');
assert.throws(() => Model.normalizeDocument({ state: { ...defaults.state }, pinnedColors: [{ l: 0.5, c: 0, h: 0, id: 'x', name: 'x', cssName: 'same' }, { l: 0.6, c: 0, h: 0, id: 'y', name: 'y', cssName: 'same' }] }, { strict: true }), /重複/);

console.log('color-palette-model: all assertions passed');
