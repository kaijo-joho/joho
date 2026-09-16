const assert = require('assert');
const Core = require('../core.js');
const Templates = require('../templates.js');
const LibraryAPI = require('../template-library.js');

class Memory {
  constructor() { this.value = null; }
  getItem() { return this.value; }
  setItem(key, value) { this.value = String(value); }
  removeItem() { this.value = null; }
}
const doc = Templates.list()[0].document;
const created = LibraryAPI.create(doc, { name: '  テスト  ', description: ' 説明 ', includeData: true });
assert.equal(created.name, 'テスト');
assert.equal(created.description, '説明');
assert.equal(created.document.format, 'kaijo-graph');
assert.throws(() => LibraryAPI.validate('{broken'), /JSON/);
assert.throws(() => LibraryAPI.validate({ format: 'other', version: 1 }), /形式/);
assert.throws(() => LibraryAPI.create(doc, { name: 'x'.repeat(161) }), /160/);
assert.throws(() => LibraryAPI.create(doc, { name: 'x', description: 'x'.repeat(1001) }), /1000/);

const withData = Templates.list().find(item => item.id === 'science-spring-regression').document;
const without = LibraryAPI.create(withData, { name: 'データなし', includeData: false });
assert.deepEqual(without.document.series[0].rows, []);
assert.deepEqual(without.document.series[0].errorBars, { x: [], y: [] });
if (withData.series[0].dataTable) {
  assert.deepEqual(without.document.series[0].dataTable.rows, []);
  assert.equal(without.document.series[0].dataTable.columns.length, withData.series[0].dataTable.columns.length);
}
assert.equal(without.document.series[0].source.notes, withData.series[0].source.notes);
assert.equal(without.document.annotations[0].seriesId, withData.annotations[0].seriesId);

const storage = new Memory();
const library = new LibraryAPI.Library(storage);
const entry = library.save(created);
assert.equal(library.list().length, 1);
const listed = library.list();
listed[0].document.name = '変更';
assert.notEqual(library.list()[0].document.name, '変更');
const exported = library.export(entry.id);
const imported = library.import(exported);
assert.notEqual(imported.id, entry.id);
assert.deepEqual(imported.document, entry.document);
assert.equal(library.list().length, 2);
assert.deepEqual(JSON.parse(library.export(imported.id)).document, entry.document);
assert.equal(library.remove(imported.id), true);
assert.equal(library.remove(imported.id), false);

// Legacy documents are migrated before data removal, so clearing data never
// creates a mixed-version payload.
const legacy = Core.createDocument(); legacy.version = 7; delete legacy.charts; delete legacy.comparison; delete legacy.presentation; delete legacy.output;
const legacySeries = Core.createSeries('data2d'); legacySeries.id = 'legacy-data'; delete legacySeries.excludedRows; delete legacySeries.dataTable; legacySeries.rows = [[1, 2], [2, 4]]; legacySeries.errorBars = { x: [], y: [] }; legacySeries.interpolation = 'linear'; legacy.series = [legacySeries];
// Legacy fixture intentionally excludes v8+ fields.
assert(!Object.hasOwn(legacySeries, 'dataTable') && !Object.hasOwn(legacySeries, 'excludedRows'));
Core.validateDocument(legacy);
const legacyBefore = Core.clone(legacy), legacyTemplate = LibraryAPI.create(legacy, { name: '旧版データなし', includeData: false });
assert.equal(legacyTemplate.document.version, Core.createDocument().version); assert.deepEqual(legacyTemplate.document.series[0].rows, []); assert.deepEqual(legacy, legacyBefore);

const v10 = Core.clone(withData); v10.version = 10; v10.presentation = Core.createDocument().presentation; v10.output = Core.createDocument().output; v10.charts = []; v10.comparison = { columns: 2, items: ['main'] }; v10.series[0].excludedRows = [1]; const v10Before = Core.clone(v10);
const v10Template = LibraryAPI.create(v10, { name: 'v10データなし', includeData: false });
assert.deepEqual(v10Template.document.series[0].excludedRows, []); assert.deepEqual(v10, v10Before);

storage.value = '{broken';
assert.throws(() => library.list(), /JSON/);
assert.equal(storage.value, '{broken');
storage.value = JSON.stringify({ format: 'kaijo-graph-templates', version: 1, items: [] });
let quota = false;
storage.setItem = (key, value) => { if (quota) throw new Error('quota'); storage.value = String(value); };
const beforeQuota = storage.value;
quota = true;
assert.throws(() => library.save(created), /quota/);
assert.equal(storage.value, beforeQuota);

console.log('template-library tests passed');
