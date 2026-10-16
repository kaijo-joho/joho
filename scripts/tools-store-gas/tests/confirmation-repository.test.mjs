import test from 'node:test';
import assert from 'node:assert/strict';
import { setup } from './store-fixture.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const request = n => n.toString(16).padStart(32, '0');
function journal(f, id = 'trial-1', code = 'n = int(input("整数: "))\nprint(n)') {
  return { schema: 1, trials: [{ schema: 1, id, source: { questionId: 'py21a_1-01', version: 'v1' }, code, codeHash: f.T.hash(code),
    inputs: [{ prompt: '整数: ', value: '123' }], stdout: '123\n', stderr: '', outcome: 'success', truncated: false, at: '2026-10-17T12:00:00.000Z' }], responses: {} };
}
function upload(f, value, id, revision = null, commit = true) {
  const body = f.T.canonical(value), parts = [];
  for (let cursor = 0; cursor < body.length;) {
    let end = Math.min(cursor + 32000, body.length);
    if (end < body.length && /[\uD800-\uDBFF]/.test(body[end - 1]) && /[\uDC00-\uDFFF]/.test(body[end])) end--;
    parts.push(body.slice(cursor, end)); cursor = end;
  }
  const input = { tool: 'python', requestId: request(id), expectedRevision: revision, journalHash: f.T.hash(body), byteLength: Buffer.byteLength(body), chunkCount: parts.length };
  const begun = f.call('beginConfirmationSave', input);
  if (begun.state !== 'uploading') return begun;
  for (let index = 0; index < parts.length; index++) f.call('putConfirmationChunk', { tool: 'python', requestId: input.requestId, index, text: parts[index] });
  return commit ? f.call('saveConfirmationJournal', { tool: 'python', requestId: input.requestId, expectedRevision: revision }) : { input, parts };
}
function download(f, manifest = f.call('getConfirmationJournal', { tool: 'python' }), release = true) {
  if (manifest.revision === null) return manifest.journal;
  let body = '';
  for (let index = 0; index < manifest.chunkCount; index++) {
    const part = f.call('getConfirmationJournalChunk', { tool: 'python', revision: manifest.revision, index, readId: manifest.readId });
    assert.equal(part.chunkHash, f.T.hash(part.text)); body += part.text;
  }
  assert.equal(f.T.hash(body), manifest.journalHash); assert.equal(Buffer.byteLength(body), manifest.byteLength);
  if (release) f.call('releaseConfirmationRead', { tool: 'python', revision: manifest.revision, readId: manifest.readId });
  return JSON.parse(body);
}
function code(fn, expected) { assert.throws(fn, error => error.toolsStoreCode === expected, expected); }

test('旧schema1のコード保存を維持し、確認同期は明示フラグと教員による拡張が必要', () => {
  const old = setup(); assert.equal(old.call('session').confirmationJournal.enabled, false); assert.equal(old.save().state, 'saved');
  code(() => old.call('getConfirmationJournal', { tool: 'python' }), 'confirmation_disabled');
  old.config.confirmationEnabled = true;
  code(() => old.call('getConfirmationJournal', { tool: 'python' }), 'confirmation_upgrade_required');
  assert.equal(old.call('session').schemaVersion, 1); assert.equal(old.save({ questionId: 'another' }).state, 'saved');
});

test('確認journalは別シートへ分割し、CAS保存・hash読戻し・別端末復元できる', () => {
  const f = setup({ confirmation: true }), value = journal(f);
  assert.deepEqual(plain(download(f)), { schema: 1, trials: [], responses: {} });
  const saved = upload(f, value, 100);
  assert.equal(saved.state, 'saved'); assert.equal(saved.journalHash, f.T.hash(f.T.canonical(value)));
  assert.deepEqual(download(f), value);
  assert.equal(f.data.writes.length, 0); assert.equal(f.history.writes.length, 0);
  assert.equal(f.call('lookupConfirmationSave', { tool: 'python', requestId: request(100) }).revision, saved.revision);
  assert.equal(f.locks.held, false); assert.equal(f.locks.acquisitions, f.locks.releases);
});

test('同じrequestId/分割番号の異なる内容と、旧revisionからの上書きを拒否する', () => {
  const f = setup({ confirmation: true }), value = journal(f);
  const pending = upload(f, value, 100, null, false);
  assert.equal(f.call('beginConfirmationSave', pending.input).received.length, 1);
  code(() => f.call('beginConfirmationSave', { ...pending.input, journalHash: 'a'.repeat(64) }), 'request_reused');
  code(() => f.call('putConfirmationChunk', { tool: 'python', requestId: request(100), index: 0, text: '{}' }), 'confirmation_chunk_conflict');
  const saved = f.call('saveConfirmationJournal', { tool: 'python', requestId: request(100), expectedRevision: null });
  assert.equal(f.call('beginConfirmationSave', pending.input).revision, saved.revision);
  code(() => f.call('saveConfirmationJournal', { tool: 'python', requestId: request(100), expectedRevision: 'b'.repeat(32) }), 'request_reused');
  const conflict = upload(f, journal(f, 'different'), 101, null);
  assert.equal(conflict.state, 'conflict'); assert.equal(conflict.revision, saved.revision); assert.deepEqual(download(f, conflict), value);
  assert.deepEqual(download(f), value);
});

test('読取中に別端末で複数回保存してもrevision固定で最後まで読める', () => {
  const f = setup({ confirmation: true });
  let saved = upload(f, journal(f, 'old', 'あ'.repeat(50000)), 100);
  const pinned = f.call('getConfirmationJournal', { tool: 'python' });
  const pinnedOther = f.call('getConfirmationJournal', { tool: 'python' });
  for (let i = 101; i <= 110; i++) saved = upload(f, journal(f, 'new-' + i), i, saved.revision);
  assert.equal(download(f, pinned).trials[0].id, 'old');
  assert.equal(download(f, pinnedOther).trials[0].id, 'old');
  assert.equal(download(f).trials[0].id, 'new-110');
});

test('20万字・UTF8約4MiBでも1セル/1RPCの本文上限へ押し込まない', () => {
  const f = setup({ confirmation: true }), value = { schema: 1, trials: [], responses: {} };
  for (let i = 0; i < 7; i++) value.trials.push(journal(f, 'large-' + i, 'あ'.repeat(190000)).trials[0]);
  const bytes = Buffer.byteLength(f.T.canonical(value)); assert(bytes > 3900000 && bytes <= 4194304);
  const saved = upload(f, value, 100); assert.equal(saved.state, 'saved'); assert.deepEqual(download(f), value);
  const maxCell = Math.max(...[...f.confirmation.cells.values()].filter(v => typeof v === 'string').map(v => v.length));
  assert(maxCell <= 32002); assert(f.confirmation.writes.every(write => write.rows === 1 && write.columns <= 4));
});

test('未知score・不正参照・codeHash違い・1000試行/4MiB超過を採用しない', () => {
  const values = [
    f => ({ ...journal(f), score: 100 }),
    f => { const value = journal(f); value.trials[0].score = 100; return value; },
    f => { const value = journal(f); value.trials[0].codeHash = 'a'.repeat(64); return value; },
    f => { const value = journal(f); value.responses['v1/check'] = { selections: { condition: 'unknown-trial' } }; return value; },
    f => { const value = journal(f); value.trials = Array.from({ length: 1001 }, (_, i) => ({ ...value.trials[0], id: 'trial-' + i })); return value; },
    f => { const value = journal(f); value.responses = Object.fromEntries(Array.from({ length: 2001 }, (_, i) => ['v1/q' + i, { answer: 'A' }])); return value; }
  ];
  for (const make of values) {
    const f = setup({ confirmation: true }); code(() => upload(f, make(f), 100), 'journal_invalid');
    assert.equal(f.call('getConfirmationJournal', { tool: 'python' }).revision, null);
  }
  const f = setup({ confirmation: true });
  code(() => f.call('beginConfirmationSave', { tool: 'python', requestId: request(100), expectedRevision: null, journalHash: 'a'.repeat(64), byteLength: 4194305, chunkCount: 132 }), 'invalid_request');
});

test('未完了chunkとhash不一致は保存済みにせず、旧journalを保持する', () => {
  const f = setup({ confirmation: true }), first = upload(f, journal(f), 100);
  const value = journal(f, 'next', 'x'.repeat(70000)), body = f.T.canonical(value);
  f.call('beginConfirmationSave', { tool: 'python', requestId: request(101), expectedRevision: first.revision, journalHash: f.T.hash(body), byteLength: Buffer.byteLength(body), chunkCount: 3 });
  f.call('putConfirmationChunk', { tool: 'python', requestId: request(101), index: 0, text: body.slice(0, 32000) });
  code(() => f.call('saveConfirmationJournal', { tool: 'python', requestId: request(101), expectedRevision: first.revision }), 'confirmation_upload_incomplete');
  assert.equal(download(f).trials[0].id, 'trial-1');
  assert.equal(f.call('lookupConfirmationSave', { tool: 'python', requestId: request(101) }).state, 'pending');
});

test('commit途中失敗・受付結果の保存失敗を同じIDの照会/再送で回復する', () => {
  const f = setup({ confirmation: true }), old = upload(f, journal(f), 100), pending = upload(f, journal(f, 'next'), 101, old.revision, false);
  let failed = false;
  f.confirmation.writeFailure = range => {
    if (!failed && range.row === 3 && range.column === 1) { failed = true; return { after: 2 }; }
  };
  code(() => f.call('saveConfirmationJournal', { tool: 'python', requestId: request(101), expectedRevision: old.revision }), 'storage_write_uncertain');
  f.confirmation.writeFailure = null; assert.equal(download(f).trials[0].id, 'trial-1');
  const restored = f.call('saveConfirmationJournal', { tool: 'python', requestId: request(101), expectedRevision: old.revision });
  assert.equal(restored.state, 'saved'); assert.equal(download(f).trials[0].id, 'next');
  const newer = upload(f, journal(f, 'newer'), 102, restored.revision, false);
  f.confirmationReceipts.writeFailure = (range, values) => range.column === 3 && String(values[0][0]).includes('"state":"saved"') ? { after: 0 } : null;
  code(() => f.call('saveConfirmationJournal', { tool: 'python', requestId: request(102), expectedRevision: restored.revision }), 'storage_write_uncertain');
  f.confirmationReceipts.writeFailure = null;
  assert.equal(f.call('lookupConfirmationSave', { tool: 'python', requestId: request(102) }).state, 'saved');
  assert.equal(download(f).trials[0].id, 'newer');
  assert.equal(pending.input.requestId, request(101)); assert.equal(newer.input.requestId, request(102));
});

test('準備metadata/本文chunk途中の失敗も同じ不変IDと本文で再開できる', () => {
  for (const after of [0, 1, 2, 3]) {
    const f = setup({ confirmation: true }), value = journal(f), body = f.T.canonical(value);
    const input = { tool: 'python', requestId: request(100), expectedRevision: null, journalHash: f.T.hash(body), byteLength: Buffer.byteLength(body), chunkCount: 1 };
    let failed = false;
    f.confirmation.writeFailure = range => !failed && range.row === 4 && range.column === 1 ? (failed = true, { after }) : null;
    code(() => f.call('beginConfirmationSave', input), 'storage_write_uncertain');
    f.confirmation.writeFailure = null; assert.equal(f.call('beginConfirmationSave', input).state, 'uploading');
    failed = false;
    f.confirmation.writeFailure = range => !failed && range.row === 5 && range.column === 1 ? (failed = true, { after }) : null;
    code(() => f.call('putConfirmationChunk', { tool: 'python', requestId: request(100), index: 0, text: body }), 'storage_write_uncertain');
    f.confirmation.writeFailure = null;
    f.call('putConfirmationChunk', { tool: 'python', requestId: request(100), index: 0, text: body });
    assert.equal(f.call('saveConfirmationJournal', { tool: 'python', requestId: request(100), expectedRevision: null }).state, 'saved');
    assert.deepEqual(download(f), value);
  }
});

test('未commitの一時バンクが期限後に再利用されても同じ受付IDから再準備できる', () => {
  const f = setup({ confirmation: true }), value = journal(f), pending = upload(f, value, 100, null, false);
  for (let i = 101; i <= 107; i++) upload(f, journal(f, 'pending-' + i), i, null, false);
  f.advance(1200001); upload(f, journal(f, 'replacement'), 108, null, false);
  assert.equal(f.call('beginConfirmationSave', pending.input).state, 'uploading');
  for (let index = 0; index < pending.parts.length; index++) f.call('putConfirmationChunk', { tool: 'python', requestId: request(100), index, text: pending.parts[index] });
  assert.equal(f.call('saveConfirmationJournal', { tool: 'python', requestId: request(100), expectedRevision: null }).state, 'saved');
  assert.deepEqual(download(f), value);
});

test('本人・binding・origin・UserLock・構成/保護を各分割RPCでも照合する', () => {
  const f = setup({ confirmation: true });
  for (const action of ['getConfirmationJournal', 'getConfirmationJournalChunk', 'releaseConfirmationRead', 'beginConfirmationSave', 'putConfirmationChunk', 'saveConfirmationJournal', 'lookupConfirmationSave']) {
    f.identity.active = f.identity.effective = 'other@example.test'; code(() => f.call(action, { tool: 'python' }), 'account_mismatch');
    f.identity.active = f.identity.effective = 'student@example.test'; code(() => f.call(action, { tool: 'python' }, f.binding, 'https://bad.example'), 'origin_denied');
  }
  f.confirmation.protections = []; code(() => f.call('getConfirmationJournal', { tool: 'python' }), 'protection_mismatch');
  const other = setup({ confirmation: true }); other.locks.denied = true;
  code(() => other.call('getConfirmationJournal', { tool: 'python' }), 'busy');
});

test('読取リース切れ/既存データ改変は明示し、別版chunkを混ぜない', () => {
  const f = setup({ confirmation: true }); upload(f, journal(f), 100);
  const pinned = f.call('getConfirmationJournal', { tool: 'python' }); f.advance(300001);
  code(() => f.call('getConfirmationJournalChunk', { tool: 'python', revision: pinned.revision, readId: pinned.readId, index: 0 }), 'confirmation_read_expired');
  const current = f.call('getConfirmationJournal', { tool: 'python' });
  f.confirmation.cells.set('5,4', 'j:corrupt');
  code(() => download(f, current), 'confirmation_corrupt');
});

test('40名分の確認journalは別UserLock/別GSSに分散し、本人の記録だけを復元する', () => {
  const learners = Array.from({ length: 40 }, (_, i) => setup({ confirmation: true, account: 'student' + i + '@example.test' }));
  for (let i = 0; i < learners.length; i++) {
    const f = learners[i]; assert.equal(upload(f, journal(f, 'student-' + i), 100).state, 'saved');
  }
  for (let i = 0; i < learners.length; i++) {
    const f = learners[i]; assert.equal(download(f).trials[0].id, 'student-' + i);
    assert.equal(f.locks.held, false); assert.equal(f.locks.acquisitions, f.locks.releases);
  }
});
