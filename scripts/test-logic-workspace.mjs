import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
const require = createRequire(import.meta.url);
const Core = require('../js/logic-core.js'), Storage = require('../js/logic-storage.js');
const { ResumeStore, KEY, Workspace, fingerprint } = require('../tools/logic/documents.js');
const Practice = require('../tools/logic/truth-practice.js');
const context = vm.createContext({ console, document: { elementFromPoint: () => null } });
for (const name of ['logic-core', 'logic-renderer', 'logic-layout', 'logic-editor']) {
  vm.runInContext(await readFile(new URL('../js/' + name + '.js', import.meta.url), 'utf8'), context);
}
const plain = value => JSON.parse(JSON.stringify(value));
function fixture() {
  const editor = Object.assign(Object.create(context.LogicEditor.prototype), {
    options: { allowProbes: true, allowWireInsertion: true, allowMultipleSelection: true, allowMultipleOutputs: true },
    inputNames: ['A', 'B'], availableInputNames: ['A', 'B', 'C', 'D'], inputValues: { A: 1, B: 0 },
    history: [], historyIndex: -1, selectedNodeIds: new Set(), canvasWrap: { focus() {} },
    svg: { contains() { return false; } }, render() {}, updateToolbar() {}
  });
  editor.resetBaseGraph(); editor.loadExpression('n(A-B)'); return editor;
}
const editor = fixture(), before = editor.snapshot();
const wire = editor.graph.wires.find(wire => wire.to === 'output-F');
const probe = editor.insertProbeInWire(wire.id);
assert.ok(probe, '配線へ中間点を挿入できる');
assert.equal(probe.type, 'probe'); assert.equal(probe.name, 'P1');
assert.equal(editor.getAnalysis().truthCode, '1110', '中間点は信号を反転しない');
assert.deepEqual(plain(editor.getAnalysis().columns.map(column => column.name)), ['P1', 'F']);
assert.equal(editor.getAnalysis().probes[0].truthCode, '1110');
const after = editor.snapshot();
editor.undo(); assert.deepEqual(editor.snapshot(), before, '挿入全体を1回のUndoで戻す');
editor.redo(); assert.deepEqual(editor.snapshot(), after);
assert.deepEqual(Storage.parseFile(Storage.serializeFile({ name: '中間点の往復', snapshot: plain(after) })).snapshot,
  Storage.normalizeSnapshot(plain(after)), '中間点とIDをファイル保存・読込で保持する');
const other = fixture(); other.addGate('probe', { x: 600, y: 300 });
const detachedProbe = other.graph.nodes.at(-1);
other.graph.wires.push({ id: 'probe-branch', from: 'input-B', to: detachedProbe.id, port: 0 });
assert.equal(other.getAnalysis().valid, true, '中間点は観測用の枝の終端にもなる');
assert.equal(other.getAnalysis().probes[0].truthCode, '0101');
assert.equal(other.evaluateSignals().get(detachedProbe.id), 0);
const cyclic = plain(other.snapshot());
cyclic.graph.wires.find(wire => wire.to === detachedProbe.id).from = detachedProbe.id;
assert.throws(() => Storage.normalizeSnapshot(cyclic), /循環/);
assert.equal(Core.graphAnalysis(cyclic.graph, null, { allowMultipleOutputs: true }).valid, false);
other.graph.nodes.push({ id: 'input-D', type: 'input', name: 'D', x: 50, y: 400 });
other.graph.wires.find(wire => wire.to === detachedProbe.id).from = 'input-D';
const independent = Core.graphAnalysis(plain(other.graph), null, { allowMultipleOutputs: true });
assert.deepEqual(independent.inputs, ['A', 'B', 'D'], '最終出力で使わない観測入力も真理値表へ入る');
assert.equal(independent.probes[0].truthCode, '01010101');
other.setNodeSelection([detachedProbe.id], detachedProbe.id);
const clones = other.duplicateSelection();
assert.equal(clones[0].name, 'P2'); other.undo();
assert.equal(other.graph.nodes.filter(node => node.type === 'probe').length, 1);
assert.ok(context.LogicLayout.arrange(editor.graph).length === editor.graph.nodes.length);
const analysis = plain(editor.getAnalysis()), answers = {};
for (const row of analysis.truthTable) for (const column of analysis.columns) answers[row.index + ':' + column.id] = String(row.outputs[column.id]);
assert.equal(Practice.grade(analysis, answers).correct, 8);
assert.equal(Practice.grade(analysis, {}).empty, 8);
const wrong = { ...answers, [Object.keys(answers)[0]]: '2', [Object.keys(answers)[1]]: '0' };
assert.equal(Practice.grade(analysis, wrong).empty, 1);
assert.equal(Practice.grade(analysis, wrong).correct, 6);
assert.equal(Practice.signature(analysis), Practice.signature({ ...analysis, inputValues: { A: 1, B: 1 } }));
assert.throws(() => Practice.grade({ valid: false }, {}), /完成/);
assert.deepEqual(Practice.restore({ mode: 'bad', answers: { '0:x': '<script>' } }).answers, {});
function memory() {
  const data = new Map();
  return { getItem: key => data.has(key) ? data.get(key) : null, setItem: (key, value) => data.set(key, value), removeItem: key => data.delete(key) };
}
const local = memory(), store = new ResumeStore(local);
assert.equal(store.load(), null);
const document = { id: 'doc-test', name: '回路A', snapshot: plain(after), savedFingerprint: null, view: {}, browserId: null };
const value = { activeId: document.id, documents: [document] };
store.save(value);
const readback = new ResumeStore(local).load();
assert.deepEqual(readback.documents[0].snapshot, Storage.normalizeSnapshot(plain(after)));
const second = new ResumeStore(local); second.load();
store.save({ activeId: document.id, documents: [{ ...document, name: '最初の保存者' }] });
const preserved = local.getItem(KEY);
assert.throws(() => second.save(value), /別のブラウザタブ/);
assert.equal(local.getItem(KEY), preserved, '別タブの更新を上書きしない');
for (const raw of ['{broken', JSON.stringify({ version: 99 }), JSON.stringify({ version: 1, activeId: 'missing', documents: [document] })]) {
  const broken = memory(); broken.setItem(KEY, raw);
  const candidate = new ResumeStore(broken);
  assert.throws(() => candidate.load(), /前回の文書/);
  assert.throws(() => candidate.save(value));
  assert.equal(broken.getItem(KEY), raw, '破損した元の記録を保持する');
}
const handle = {
  raw: '', async createWritable() { return { write: async raw => { this.raw = raw; }, close: async () => {} }; },
  async getFile() { return { text: async () => this.raw }; }
};
await Workspace.prototype.writeFile.call({}, handle, 'ファイルの読み戻し');
assert.equal(handle.raw, 'ファイルの読み戻し');
await assert.rejects(Workspace.prototype.writeFile.call({}, { ...handle, getFile: async () => ({ text: async () => 'mismatch' }) }, 'expected'), /読み戻し/);
const writes = [], releases = [];
const target = { snapshot: plain(after), name: '直列化', autoEnabled: true, autoGeneration: 1, writeChain: Promise.resolve() };
const autosave = { writeFile: async (handle, raw) => { writes.push(raw); await new Promise(resolve => releases.push(resolve)); }, renderTabs() {}, report(error) { throw error; } };
Workspace.prototype.scheduleAuto.call(autosave, target);
await new Promise(resolve => setImmediate(resolve));
target.snapshot.graph.nodes[0].x += 1;
Workspace.prototype.scheduleAuto.call(autosave, target);
target.snapshot.graph.nodes[0].x += 1;
Workspace.prototype.scheduleAuto.call(autosave, target);
assert.equal(writes.length, 1, '書込み中は次の保存を並行実行しない');
releases.shift()(); await new Promise(resolve => setImmediate(resolve));
assert.equal(writes.length, 2, '中間の古い保存を飛ばし、最新を次に書く');
releases.shift()(); await target.writeChain;
assert.equal(fingerprint(Storage.parseFile(writes.at(-1)).snapshot), fingerprint(target.snapshot));
assert.equal(target.autoPending, false);
const renamed = { name: '保存中の新しい名前' };
Workspace.prototype.markSaved.call({ activeId: 'other', changed() {}, renderTabs() {}, scheduleAuto() {} },
  renamed, '保存開始時の名前', plain(after), 'file', null, '保存開始時の名前');
assert.equal(renamed.name, '保存中の新しい名前', '非同期保存の完了で新しい名前を巻き戻さない');
assert.equal(renamed.savedName, '保存開始時の名前');
console.log('logic-workspace: probes, branches, cycles, file compatibility, grading, recovery conflicts, corrupt preservation, readback and serialized autosave passed');
