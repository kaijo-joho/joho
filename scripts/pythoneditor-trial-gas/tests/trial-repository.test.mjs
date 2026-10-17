import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { loadCommon } from '../../tools-store-gas/tests/common-fixture.mjs';
import { FakeSheet } from '../../tools-store-gas/tests/store-fixture.mjs';

const actor = 'a'.repeat(64), otherActor = 'b'.repeat(64);
const id = n => n.toString(16).padStart(32, '0');
const plain = value => JSON.parse(JSON.stringify(value));
const fails = (fn, expected) => assert.throws(fn, error => error.toolsTrialCode === expected, expected);

function fixture(options = {}) {
  const loaded = loadCommon({ SpreadsheetApp: { flush() {} } }), { context, contract: T } = loaded;
  vm.runInContext(readFileSync(new URL('../50_trial_repository.js', import.meta.url), 'utf8'), context);
  const API = context.ToolsSchoolTrialRepository, C = API.constants;
  const sheetName = options.central ? C.CENTRAL : C.SHEET;
  const rows = options.rows || (options.central ? C.CENTRAL_ROWS : C.ROWS);
  const sheet = new FakeSheet(sheetName, rows, C.HEADERS.length, true);
  sheet.getRange(1, 1, 1, C.HEADERS.length).setValues([[...C.HEADERS]]);
  sheet.writes = [];
  const book = { getSheetByName: name => name === sheetName ? sheet : null };
  const secret = 'synthetic-trial-repository-key-only';
  function sign(value) {
    const receipt = { ...value }; delete receipt.signature;
    return { ...receipt, signature: createHmac('sha256', secret).update(T.canonical(receipt)).digest('hex') };
  }
  const verified = [];
  function verifyReceipt(receipt) { verified.push(plain(receipt)); return sign(receipt).signature === receipt.signature; }
  const dependencies = { sheetName, rows, verifyReceipt, recheck() {}, flush() {}, ...options.dependencies };
  const repo = API.create(book, dependencies);
  function submission(overrides = {}, receiptOverrides = {}) {
    const input = { requestId: id(1), questionId: 'trial-q1', version: 'v1', kind: 'code-v1', code: 'print("試用")', ...overrides };
    const receipt = sign({ scopeId: id(90), actorKey: actor, questionId: input.questionId, version: input.version,
      policyHash: 'c'.repeat(64), codeHash: T.hash(input.code), requestId: input.requestId, payloadHash: T.hash(T.canonical(input)),
      receivedAt: '2026-10-17T12:00:00.000Z', dueAt: null, state: 'submitted', assessmentSource: 'local-report', trial: true,
      earned: 3, total: 4, starEarned: 2, starTotal: 3, checks: [{ id: 'code', passed: true, points: 1, eligible: true, label: '取組', earned: 1 }],
      ...receiptOverrides });
    return { input, receipt };
  }
  function append(submission) { return repo.append(submission.input, submission.receipt); }
  const values = row => sheet.getRange(row, 1, 1, C.HEADERS.length).getValues()[0];
  return { ...loaded, API, C, sheet, book, repo, dependencies, verified, sign, submission, append, values };
}

function metaAt(f, row = 2) { return JSON.parse(f.sheet.cells.get(`${row},3`).slice(2)); }
function replaceMeta(f, mutate, row = 2) {
  const meta = metaAt(f, row); mutate(meta);
  f.sheet.cells.set(`${row},3`, 'j:' + f.contract.canonical(meta));
}

test('個人と中央は同じ73列で2MiBまで、不変要求は1行に式安全に保存する', () => {
  for (const central of [false, true]) {
    const f = fixture({ central }), value = f.submission({ code: '=IMPORTXML("private", "x")\n+SUM(1)\n@name\n-1' });
    assert.equal(f.C.HEADERS.length, 73); assert.equal(f.C.HEADERS[3], 'payload01'); assert.equal(f.C.HEADERS[72], 'payload70');
    assert.equal(f.C.MAX_BYTES, 2097152); assert.equal(f.sheet.getMaxRows(), central ? 8193 : 2049);
    assert.deepEqual(plain(f.append(value)), value.receipt);
    assert.equal(f.sheet.getLastRow(), 2);
    assert(f.values(2).every(cell => typeof cell === 'string' && cell.startsWith('j:')));
    assert(f.sheet.writes.some(write => write.column === 2 && write.columns === 1));
    assert.deepEqual(plain(f.repo.read(actor, id(1))), value);
    assert.deepEqual(plain(f.repo.lookup(actor, id(1))), value);
    assert.equal(f.repo.lookup(actor, id(2)), null);
    assert.deepEqual(plain(f.repo.summaries(actor)), [value.receipt]);
    assert(f.verified.length >= 6);
  }
});

test('同key/同本文の再送は元の署名付き受付時刻を返し、行/書込を増やさない', () => {
  const f = fixture(), first = f.submission(); f.append(first);
  const count = f.sheet.writes.length;
  const retry = f.submission({}, { receivedAt: '2026-10-17T13:00:00.000Z' });
  assert.deepEqual(plain(f.append(retry)), first.receipt);
  assert.equal(f.sheet.writes.length, count);
  assert.equal(f.sheet.getLastRow(), 2);
  const changed = f.submission({ code: 'print("different")' });
  fails(() => f.append(changed), 'request_reused');
  assert.equal(f.sheet.writes.length, count);
  assert.deepEqual(plain(f.repo.read(actor, id(1))), first);
});

test('中央では同requestIdを別actorで両立でき、一覧を本人で絞る', () => {
  const f = fixture({ central: true }), a = f.submission(), b = f.submission({ code: 'print("B")' }, { actorKey: otherActor });
  f.append(a); f.append(b);
  assert.equal(f.sheet.getLastRow(), 3);
  assert.deepEqual(plain(f.repo.summaries(actor)), [a.receipt]);
  assert.deepEqual(plain(f.repo.summaries(otherActor)), [b.receipt]);
  assert.deepEqual(plain(f.repo.summaries()), [a.receipt, b.receipt]);
  assert.deepEqual(plain(f.repo.read(actor, id(1))), a);
  assert.deepEqual(plain(f.repo.read(otherActor, id(1))), b);
  assert.equal(f.repo.read('d'.repeat(64), id(1)), null);
});

test('有効なpending metaが残る部分書込は同本文/元receiptで完了し、commit前を提出済みにしない', () => {
  for (const after of [3, 4, 10, 72]) {
    const f = fixture(), first = f.submission({ code: 'あ😀'.repeat(15000) });
    f.sheet.writeFailure = range => range.column === 1 ? { after } : null;
    fails(() => f.append(first), 'storage_write_uncertain');
    assert.equal(f.sheet.cells.get('2,2'), 'j:pending');
    fails(() => f.repo.lookup(actor, id(1)), 'storage_incomplete');
    assert.deepEqual(plain(f.repo.summaries()), []);
    f.sheet.writeFailure = null;
    const retry = f.submission({ code: first.input.code }, { receivedAt: '2026-10-17T15:00:00.000Z' });
    assert.deepEqual(plain(f.append(retry)), first.receipt);
    assert.deepEqual(plain(f.repo.read(actor, id(1))), first);
    assert.equal(f.sheet.getLastRow(), 2);
  }
});

test('metaまで保存できなかった部分書込は消さず停止し、全く書かれなかった要求だけ再開できる', () => {
  for (const after of [0, 1, 2]) {
    const f = fixture(), value = f.submission();
    f.sheet.writeFailure = () => ({ after });
    fails(() => f.append(value), 'storage_write_uncertain');
    f.sheet.writeFailure = null;
    const before = [...f.sheet.cells.entries()], count = f.sheet.writes.length;
    if (after === 0) assert.deepEqual(plain(f.append(value)), value.receipt);
    else {
      fails(() => f.append(value), 'storage_corrupt');
      assert.deepEqual([...f.sheet.cells.entries()], before); assert.equal(f.sheet.writes.length, count);
    }
  }
});

test('commit前の通信断は再送で完了し、書込完了後の例外は読戻しで確認できる', () => {
  for (const after of [0, 1]) {
    const f = fixture(), first = f.submission();
    f.sheet.writeFailure = range => range.column === 2 ? { after } : null;
    if (after === 0) {
      fails(() => f.append(first), 'storage_write_uncertain');
      fails(() => f.repo.read(actor, id(1)), 'storage_incomplete');
      f.sheet.writeFailure = null;
      assert.deepEqual(plain(f.append(f.submission({}, { receivedAt: '2026-10-17T15:00:00.000Z' }))), first.receipt);
    } else assert.deepEqual(plain(f.append(first)), first.receipt);
    assert.deepEqual(plain(f.repo.read(actor, id(1))), first);
  }
  const f = fixture(), value = f.submission();
  f.sheet.writeFailure = range => range.column === 1 ? { after: 73 } : null;
  assert.deepEqual(plain(f.append(value)), value.receipt);
  assert.deepEqual(plain(f.repo.lookup(actor, id(1))), value);
});

test('書込後の読戻し消失は保存成功と断言せず、同ID照会/再送で元受付を回復する', () => {
  for (const phase of ['pending', 'committed']) {
    const f = fixture(), first = f.submission();
    f.sheet.readFailure = range => range.row === 2 && range.columns === 73 && f.sheet.cells.get('2,2') === 'j:' + phase;
    fails(() => f.append(first), 'storage_write_uncertain');
    assert.equal(f.sheet.cells.get('2,2'), 'j:' + phase);
    f.sheet.readFailure = null;
    if (phase === 'pending') fails(() => f.repo.lookup(actor, id(1)), 'storage_incomplete');
    else assert.deepEqual(plain(f.repo.lookup(actor, id(1))), first);
    assert.deepEqual(plain(f.append(f.submission({}, { receivedAt: '2026-10-17T15:00:00.000Z' }))), first.receipt);
    assert.equal(f.sheet.getLastRow(), 2);
  }
});

test('署名/入力hash/行hash/本文/キー/状態/式の改変は復元・再送で採用しない', () => {
  const cases = [
    f => replaceMeta(f, meta => { meta.receipt.earned = 100; }),
    f => replaceMeta(f, meta => { meta.rowHash = 'f'.repeat(64); }),
    f => replaceMeta(f, meta => { meta.receipt = f.sign({ ...meta.receipt, payloadHash: 'e'.repeat(64) }); }),
    f => { f.sheet.cells.set('2,4', f.sheet.cells.get('2,4').replace('試用', '改変')); },
    f => { f.sheet.cells.set('2,4', '=A1'); },
    f => { f.sheet.cells.set('2,3', '=A1'); },
    f => { f.sheet.cells.set('2,1', '=A1'); },
    f => { f.sheet.cells.set('2,2', 'j:unknown'); },
    f => { f.sheet.cells.set('2,73', 'plain'); },
    f => { f.sheet.cells.set('2,73', 'j:extra'); }
  ];
  for (const mutate of cases) {
    const f = fixture(), value = f.submission(); f.append(value); mutate(f);
    const before = [...f.sheet.cells.entries()], count = f.sheet.writes.length;
    fails(() => f.repo.read(actor, id(1)), 'storage_corrupt');
    assert.throws(() => f.append(value));
    assert.deepEqual([...f.sheet.cells.entries()], before); assert.equal(f.sheet.writes.length, count);
  }
});

test('破損meta/重複key/pendingの別本文は自動修復や追加行へ逃げず既存内容を保持する', () => {
  for (const mutate of [
    f => { f.sheet.cells.set('2,3', 'j:{broken'); },
    f => { f.sheet.getRange(3, 1, 1, 73).setValues([f.values(2)]); },
    f => { f.sheet.cells.set('2,2', 'j:pending'); replaceMeta(f, meta => { meta.rowHash = 'd'.repeat(64); }); }
  ]) {
    const f = fixture(), value = f.submission(); f.append(value); mutate(f);
    const before = [...f.sheet.cells.entries()], count = f.sheet.writes.length;
    fails(() => f.append(value), 'storage_corrupt');
    assert.deepEqual([...f.sheet.cells.entries()], before); assert.equal(f.sheet.writes.length, count);
  }
  const f = fixture(), first = f.submission(); f.append(first); f.sheet.cells.set('2,2', 'j:pending');
  const before = [...f.sheet.cells.entries()];
  fails(() => f.append(f.submission({ code: 'print(2)' })), 'request_reused');
  assert.deepEqual([...f.sheet.cells.entries()], before);
});

test('一覧は本文を読まず各受付の署名を検証し、回収readで本文/行hashを必須にする', () => {
  const f = fixture(), value = f.submission(); f.append(value);
  f.sheet.reads = []; f.verified.length = 0;
  assert.deepEqual(plain(f.repo.summaries()), [value.receipt]);
  assert(f.sheet.reads.filter(read => read.row >= 2).every(read => read.columns <= 3));
  assert.equal(f.verified.length, 1);
  f.sheet.cells.set('2,4', 'j:corrupt');
  assert.deepEqual(plain(f.repo.summaries()), [value.receipt]);
  fails(() => f.repo.read(actor, id(1)), 'storage_corrupt');
  replaceMeta(f, meta => { meta.receipt.total = 900; });
  fails(() => f.repo.summaries(), 'storage_corrupt');
});

test('2MiB境界と32000 UTF16境界のサロゲートを保ち、超過は書込前に拒否する', () => {
  const f = fixture();
  let value = f.submission({ code: 'x'.repeat(1000) });
  const overhead = Buffer.byteLength(f.contract.canonical(value)) - 1000;
  value = f.submission({ code: 'x'.repeat(f.C.MAX_BYTES - overhead) });
  assert.equal(Buffer.byteLength(f.contract.canonical(value)), f.C.MAX_BYTES);
  f.append(value); assert.deepEqual(plain(f.repo.read(actor, id(1))), value);
  assert(f.values(2).slice(3).every(cell => cell.length <= 32002));
  const tooLarge = fixture(), over = tooLarge.submission({ code: value.input.code + 'x' });
  fails(() => tooLarge.append(over), 'payload_too_large'); assert.equal(tooLarge.sheet.writes.length, 0);
  const unicode = fixture();
  const prefix = Buffer.from(unicode.contract.canonical(unicode.submission({ code: '' })), 'utf8').toString();
  const codeStart = prefix.indexOf('"code":"') + '"code":"'.length;
  const padding = 32000 - 1 - codeStart;
  const paired = unicode.submission({ code: 'x'.repeat(padding) + '😀' + 'あ'.repeat(12000) });
  unicode.append(paired);
  const chunks = unicode.values(2).slice(3).map(cell => cell.slice(2)).filter(Boolean);
  assert.equal(chunks[0].length, 31999);
  assert(chunks[1].startsWith('😀'));
  assert.deepEqual(plain(unicode.repo.read(actor, id(1))), paired);
});

test('署名のない入力・hash不一致・strict true以外の検証結果を保存しない', () => {
  for (const mutate of [
    value => { delete value.receipt.signature; },
    value => { value.input.code = 'changed'; },
    value => { value.input.requestId = id(2); },
    value => { value.receipt.actorKey = 'invalid'; }
  ]) {
    const f = fixture(), value = f.submission(); mutate(value);
    assert.throws(() => f.append(value)); assert.equal(f.sheet.writes.length, 0);
  }
  for (const result of [false, 'true', 1, Promise.resolve(true)]) {
    const f = fixture({ dependencies: { verifyReceipt: () => result } });
    fails(() => f.append(f.submission()), 'receipt_invalid'); assert.equal(f.sheet.writes.length, 0);
  }
});

test('署名検証の失効/例外はすべての読取を停止し、既存受付を消さない', () => {
  const f = fixture(), value = f.submission(); f.append(value);
  const before = [...f.sheet.cells.entries()], count = f.sheet.writes.length;
  for (const verifyReceipt of [() => false, () => { throw new Error('synthetic private signing failure'); }]) {
    f.dependencies.verifyReceipt = verifyReceipt;
    for (const action of [() => f.repo.read(actor, id(1)), () => f.repo.lookup(actor, id(1)), () => f.repo.summaries()]) {
      assert.throws(action, error => error.toolsTrialCode === 'storage_corrupt' && !error.message.includes('private'));
    }
  }
  assert.deepEqual([...f.sheet.cells.entries()], before); assert.equal(f.sheet.writes.length, count);
});

test('満杯・構成不一致・recheck失敗では既存行を保持し、増設しない', () => {
  const f = fixture({ rows: 3 }); f.append(f.submission()); f.append(f.submission({ requestId: id(2) }));
  const before = [...f.sheet.cells.entries()];
  fails(() => f.append(f.submission({ requestId: id(3) })), 'storage_full');
  assert.deepEqual([...f.sheet.cells.entries()], before); assert.equal(f.sheet.getMaxRows(), 3);
  f.sheet.cells.set('1,1', 'changed'); fails(() => f.repo.summaries(), 'schema_mismatch');
  const guard = fixture(), value = guard.submission(); let calls = 0;
  guard.dependencies.recheck = () => { if (++calls === 3) { const error = new Error('stale'); error.toolsTrialCode = 'binding_stale'; throw error; } };
  fails(() => guard.append(value), 'binding_stale');
  assert.equal(guard.sheet.cells.get('2,2'), 'j:pending');
  guard.dependencies.recheck = () => {};
  fails(() => guard.repo.lookup(actor, id(1)), 'storage_incomplete');
  assert.deepEqual(plain(guard.append(value)), value.receipt);
});
