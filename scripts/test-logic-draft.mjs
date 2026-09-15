import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const Draft = require('../tools/logic/recovery.js');
const Storage = require('../js/logic-storage.js');
class MemoryStorage {
  values = new Map();
  writes = 0;
  getItem(key) { if (this.failRead) throw new Error('blocked'); return this.values.get(key) ?? null; }
  setItem(key, value) { if (this.failWrite) throw new Error('quota'); this.values.set(key, value); this.writes++; }
  removeItem(key) { this.values.delete(key); }
}
const snapshot = Storage.normalizeSnapshot({ inputNames: ['A', 'B'], inputValues: { A: 0, B: 1 }, graph: {
  nodes: [
    { id: 'a', type: 'input', name: 'A', x: 70, y: 180 }, { id: 'b', type: 'input', name: 'B', x: 70, y: 280 },
    { id: 'gate', type: 'AND', x: 400, y: 250 }, { id: 'f', type: 'output', x: 800, y: 250 }
  ], wires: [
    { id: 'ag', from: 'a', to: 'gate', port: 0 }, { id: 'bg', from: 'b', to: 'gate', port: 1 },
    { id: 'gf', from: 'gate', to: 'f', port: 0, bends: [{ x: 580, y: 250 }, { x: 580, y: 300 }, { x: 690, y: 300 }, { x: 690, y: 250 }] }
  ]
} });
const memory = new MemoryStorage();
const named = new Storage.Store(memory);
for (let i = 0; i < 30; i++) named.save({ name: `既存${i}`, snapshot });
const namedRaw = memory.getItem(Storage.STORAGE_KEY);
const file = { id: named.list()[0].id, name: '既存0', savedSnapshot: snapshot };
const value = { snapshot, file };
const draft = new Draft.Store(memory);
assert.equal(draft.load(), null);
assert.equal(draft.save(value), true);
const raw = memory.getItem(Draft.KEY), writes = memory.writes;
assert.equal(draft.save(value), false);
assert.equal(memory.writes, writes, '同じ内容では保存し直さない');
const loaded = new Draft.Store(memory).load();
assert.deepEqual(loaded.snapshot, snapshot);
assert.deepEqual(loaded.file, file);
assert.equal(memory.getItem(Storage.STORAGE_KEY), namedRaw, '30件の名前付き保存とは別枠');
const incomplete = structuredClone(value);
incomplete.snapshot.graph.wires.pop();
incomplete.snapshot.graph.nodes.push({ id: 'f2', type: 'output', x: 800, y: 350 });
assert.equal(draft.save(incomplete), true, '未接続部品・複数出力も復元できる');
assert.deepEqual(new Draft.Store(memory).load().snapshot, Storage.normalizeSnapshot(incomplete.snapshot));
assert.equal(memory.getItem(Storage.STORAGE_KEY), namedRaw);

// 不正な下書き・新しい版を勝手に上書きせず、読み込み時に回路も検証する。
for (const corrupt of ['{broken', JSON.stringify({ version: 2 }), 'x'.repeat(Storage.MAX_DOCUMENT_LENGTH + 1),
  JSON.stringify({ ...JSON.parse(raw), snapshot: { graph: {} } }),
  JSON.stringify({ ...JSON.parse(raw), file: { ...file, name: 'x'.repeat(61) } })]) {
  memory.setItem(Draft.KEY, corrupt);
  const broken = new Draft.Store(memory);
  assert.throws(() => broken.load(), /復元できません/);
  assert.throws(() => broken.save(value), /停止中/);
  assert.equal(memory.getItem(Draft.KEY), corrupt);
}
memory.setItem(Draft.KEY, raw);
const first = new Draft.Store(memory), second = new Draft.Store(memory);
first.load(); second.load();
second.save(incomplete);
const otherTab = memory.getItem(Draft.KEY);
const changed = structuredClone(value); changed.snapshot.inputValues.A = 1;
assert.throws(() => first.save(changed), /別のタブ/);
assert.equal(first.blocked, true);
assert.equal(memory.getItem(Draft.KEY), otherTab, '別タブの下書きを上書きしない');
const recoverable = new Draft.Store(memory); recoverable.load(); memory.failWrite = true;
assert.throws(() => recoverable.save(value), /quota/);
memory.failWrite = false;
assert.equal(memory.getItem(Draft.KEY), otherTab, '容量不足で既存下書きを消さない');
assert.equal(recoverable.save(value), true, '保存領域が回復すると再度保存できる');
memory.failRead = true;
assert.throws(() => new Draft.Store(memory).load(), /復元できません/);

// 読み込み候補は書き込まず、呼び出し側が変更しても保存済みの回路を変えない。
memory.failRead = false;
const listing = new Draft.Store(memory);
const beforeListWrites = memory.writes;
const choices = listing.list();
assert.equal(memory.writes, beforeListWrites, '候補の一覧表示は保存データを書き換えない');
assert.equal(choices[0].id, 'draft-current');
assert.equal(choices[0].archived, false);
choices[0].snapshot.inputValues.A = 7;
assert.notDeepEqual(new Draft.Store(memory).list()[0].snapshot, choices[0].snapshot, '候補はdeep copyで返す');

// 開く直前に主下書きを残す。別の候補を開いても、元の候補を再度選べる。
const archiveMemory = new MemoryStorage();
const original = structuredClone(value);
const changedSource = structuredClone(value);
changedSource.snapshot.graph.nodes.find(node => node.id === 'gate').x = 470;
const archiveStore = new Draft.Store(archiveMemory);
archiveStore.load();
archiveStore.save(original);
const mainBeforePreserve = archiveMemory.getItem(Draft.KEY);
assert.equal(archiveStore.preserve(), true);
assert.equal(archiveMemory.getItem(Draft.KEY), mainBeforePreserve, '退避は主下書きを変更しない');
assert.equal(archiveStore.preserve(), false, '同じ下書きを重複して退避しない');
archiveStore.save(changedSource);
const archivedOriginal = new Draft.Store(archiveMemory).list().find(choice => choice.archived);
assert.deepEqual(archivedOriginal.snapshot, Storage.normalizeSnapshot(original.snapshot), '別の候補を選んだ後も元の下書きを再取得できる');
assert.equal(archivedOriginal.file.id, original.file.id);
assert.equal(archivedOriginal.file.name, original.file.name);
assert.deepEqual(archivedOriginal.file.savedSnapshot, Storage.normalizeSnapshot(original.file.savedSnapshot));

// 最近の候補は5件に保ち、最も古い候補から回転する。
for (let i = 0; i < 7; i++) {
  assert.equal(archiveStore.preserve(), true);
  const next = structuredClone(changedSource);
  next.snapshot.graph.nodes.find(node => node.id === 'gate').x = 300 + i;
  archiveStore.save(next);
}
const archiveDocument = JSON.parse(archiveMemory.getItem(Draft.ARCHIVE_KEY));
assert.equal(archiveDocument.version, 1);
assert.equal(archiveDocument.archives.length, Draft.MAX_ARCHIVES);
assert.equal(new Set(archiveDocument.archives.map(record => record.id)).size, Draft.MAX_ARCHIVES, '候補IDは安定して一意');
const rotatedChoices = new Draft.Store(archiveMemory).list();
assert.equal(rotatedChoices.filter(choice => choice.archived).length, Draft.MAX_ARCHIVES);
assert.equal(rotatedChoices[0].archived, false, '主下書きは常に先頭');

// アーカイブが壊れても主下書きは表示でき、preserveは壊れた履歴を上書きしない。
const intactMain = archiveMemory.getItem(Draft.KEY);
archiveMemory.setItem(Draft.ARCHIVE_KEY, '{broken');
const corruptArchiveStore = new Draft.Store(archiveMemory);
const withArchiveError = corruptArchiveStore.list();
assert.equal(withArchiveError.length, 1);
assert.match(withArchiveError.archiveError, /最近の下書き/);
assert.match(corruptArchiveStore.archiveError, /最近の下書き/);
corruptArchiveStore.load();
assert.throws(() => corruptArchiveStore.preserve(), /最近の下書き/);
assert.equal(archiveMemory.getItem(Draft.ARCHIVE_KEY), '{broken');
assert.equal(archiveMemory.getItem(Draft.KEY), intactMain);

// 容量不足・別タブ更新では、主下書きと既存アーカイブをどちらも壊さない。
archiveMemory.setItem(Draft.ARCHIVE_KEY, JSON.stringify({ version: 1, archives: [] }));
const quotaArchiveStore = new Draft.Store(archiveMemory);
quotaArchiveStore.load();
const beforeQuotaMain = archiveMemory.getItem(Draft.KEY);
const beforeQuotaArchive = archiveMemory.getItem(Draft.ARCHIVE_KEY);
archiveMemory.failWrite = true;
assert.throws(() => quotaArchiveStore.preserve(), /最近の下書きを保存できません/);
archiveMemory.failWrite = false;
assert.equal(archiveMemory.getItem(Draft.KEY), beforeQuotaMain);
assert.equal(archiveMemory.getItem(Draft.ARCHIVE_KEY), beforeQuotaArchive);
const staleList = new Draft.Store(archiveMemory);
staleList.load();
archiveMemory.setItem(Draft.KEY, JSON.stringify({ ...JSON.parse(beforeQuotaMain), updatedAt: new Date(Date.now() + 1000).toISOString() }));
assert.throws(() => staleList.list(), /別のタブ/);
assert.equal(staleList.blocked, true, '一覧も既読の主下書きの外部更新を黙って採用しない');
const staleArchive = new Draft.Store(archiveMemory);
staleArchive.load();
staleArchive.list();
const archiveBeforeExternalUpdate = archiveMemory.getItem(Draft.ARCHIVE_KEY);
archiveMemory.setItem(Draft.ARCHIVE_KEY, JSON.stringify({ version: 1, archives: [archiveDocument.archives[0]] }));
assert.throws(() => staleArchive.preserve(), /最近の下書き/);
assert.notEqual(archiveMemory.getItem(Draft.ARCHIVE_KEY), archiveBeforeExternalUpdate, '別タブの最近の下書きを上書きしない');

console.log('logic-draft: recovery, choices, archives, validation, named-save isolation, conflicts and storage failures passed');
