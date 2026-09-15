const assert = require('node:assert/strict');
const Core = require('../core.js');
const Local = require('../local-autosave.js');
const cases = [];
function test(name, run) { cases.push(name); return run(); }
const doc = () => Core.createTemplate('flow-branch');
function handle(initial = '', options = {}) {
  let text = initial, writes = 0, open = 0, aborted = 0;
  let permissionCall = 0;
  return { name: options.name || 'test.diagram.json', get text() { return text; }, change(value) { text = value; }, get writes() { return writes; }, get open() { return open; }, get aborted() { return aborted; }, async queryPermission() { if (options.queryDelay) await new Promise(resolve => setTimeout(resolve, options.queryDelay)); const values = options.permissions || [options.permission || 'granted']; return values[Math.min(permissionCall++, values.length - 1)]; }, async requestPermission() { return options.request || 'granted'; }, async getFile() { if (options.getFileError) throw new Error(options.getFileError); return { size: options.size === undefined ? Buffer.byteLength(text) : options.size, text: async () => text }; }, async createWritable() { if (options.createError) throw new Error(options.createError); open++; let next = text, closed = false; return { async write(value) { if (options.writeError) throw new Error(options.writeError); if (options.slow) await new Promise(resolve => setTimeout(resolve, 15)); next = value; }, async close() { if (options.closeError) throw new Error(options.closeError); closed = true; writes++; text = next; open--; }, async abort() { if (!closed) { closed = true; aborted++; open--; } } }; } };
}
async function main() {
  await test('Denied and cancelled handles do not write', async () => {
    for (const permission of ['denied', 'prompt']) { const h = handle('', { permission, request: 'denied' }); const a = Local.create(); assert.equal(await a.start(h, doc()), false); assert.equal(h.writes, 0); assert.equal(a.getState().status, 'failed'); }
  });
  await test('Writes auto data and keeps a successful snapshot', async () => {
    const h = handle(), a = Local.create(), d = doc(), baseline = Core.serializeDocument(d); assert.equal(await a.start(h, d, { view: { x: 2, y: 3, scale: 1 }, saved: '' }), true); assert.equal(JSON.parse(h.text).saveInfo.method, 'auto'); assert.equal(a.getSnapshot().name, h.name); assert.equal(a.getSnapshot().view.x, 2); assert.equal(a.getSnapshot().saved, '');
    const b = Local.create(); assert.equal(await b.start(handle(), d, { saved: baseline }), true); assert.equal(b.getSnapshot().saved, baseline);
  });
  await test('Close failure preserves prior file and reports failure', async () => {
    const d = doc(), h = handle('', { closeError: 'close failed' }), a = Local.create(); assert.equal(await a.start(h, d), false); assert.equal(h.text, ''); assert.equal(a.getSnapshot(), null); assert.equal(a.getState().status, 'failed');
  });
  await test('Queued edits merge to the latest document without parallel streams', async () => {
    const h = handle('', { slow: true }), a = Local.create(), d = doc(); const start = a.start(h, d); await new Promise(resolve => setTimeout(resolve, 2)); const latest = Core.clone(d); latest.title = '最後の編集'; a.enqueue(latest); assert.equal(await start, true); await a.flush(); assert.equal(a.getSnapshot().document.title, '最後の編集'); assert.ok(h.writes >= 2); assert.equal(h.open, 0);
  });
  await test('Stop and another document cannot write stale content', async () => {
    const h = handle('', { slow: true }), a = Local.create(), d = doc(); const start = a.start(h, d); await new Promise(resolve => setTimeout(resolve, 2)); a.stop(); await start; assert.equal(a.getState().status, 'stopped'); assert.equal(a.getSnapshot(), null); const other = doc(); a.enqueue(other); assert.equal(h.open, 0);
    const next = handle(), replacement = doc(); assert.equal(await a.start(next, replacement), true); assert.equal(a.getSnapshot().document.id, replacement.id); assert.equal(next.open, 0);
  });
  await test('External, manual, and other-document files are never overwritten', async () => {
    const d = doc(), h = handle(), a = Local.create(); assert.equal(await a.start(h, d), true); h.change(`${h.text}\n外部変更`);
    const changed = Core.clone(d); changed.title = '編集'; a.enqueue(changed); await a.flush(); assert.equal(a.getState().status, 'failed');
    const manual = handle(JSON.stringify({ ...d, saveInfo: { method: 'manual', savedAt: null } })); assert.equal(await Local.create().start(manual, d), false); assert.equal(manual.writes, 0);
    const other = doc(), automaticOther = handle(JSON.stringify({ ...other, saveInfo: { method: 'auto', savedAt: null } })); assert.equal(await Local.create().start(automaticOther, d), false); assert.equal(automaticOther.writes, 0);
    const malformedAuto = handle(JSON.stringify({ ...d, saveInfo: { method: 'auto', savedAt: 'not-a-time' } })); assert.equal(await Local.create().start(malformedAuto, d), false); assert.equal(malformedAuto.writes, 0);
    const tooLarge = handle('', { size: 2 * 1024 * 1024 + 1 }); assert.equal(await Local.create().start(tooLarge, d), false); assert.equal(tooLarge.writes, 0);
  });
  await test('Stopping during permission and revoked write permission do not write', async () => {
    const delayed = handle('', { queryDelay: 20 }), a = Local.create(), starting = a.start(delayed, doc()); await new Promise(resolve => setTimeout(resolve, 2)); a.stop(); assert.equal(await starting, false); assert.equal(delayed.writes, 0); assert.equal(a.getState().status, 'stopped');
    const revoked = handle('', { permissions: ['granted', 'denied'] }), b = Local.create(); assert.equal(await b.start(revoked, doc()), false); assert.equal(revoked.writes, 0); assert.equal(b.getState().status, 'failed');
  });
  await test('Oversized documents fail before writing', async () => {
    const h = handle(), d = Core.createDocument(); for (let i = 0; i < 230; i++) d.nodes.push(Core.createNode('process', i * 10, 0, { text: 'x'.repeat(10000) })); const a = Local.create(); assert.equal(await a.start(h, d), false); assert.equal(h.writes, 0);
  });
  console.log(`local autosave tests passed: ${cases.length}`);
}
main().catch(error => { console.error(error); process.exitCode = 1; });
