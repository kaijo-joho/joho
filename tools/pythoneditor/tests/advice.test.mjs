import test from 'node:test';
import assert from 'node:assert/strict';
import { AdviceBridge, AdviceJournal, ADVICE_PROTOCOL, prepareConsultation, consultationResult,
  contextNotice, historyRecords } from '../advice.mjs';
import { codeHash } from '../cloud.mjs';
const source = { setId: 'example', questionId: 'q1', version: 'v1', runId: 'run:1',
  code: 'n = int("abc")', setupCode: '', errorText: "ValueError: invalid literal for int() with base 10: 'abc'" };
const actor = 'a'.repeat(64);
class Storage { constructor() { this.values = new Map(); } get length() { return this.values.size; } key(i) { return [...this.values.keys()][i]; }
  getItem(k) { return this.values.get(k) ?? null; } setItem(k, v) { this.values.set(k, v); } removeItem(k) { this.values.delete(k); } }
function response(p) { return { state: 'complete', ...p, result: { errorKey: 'ValueError', errorType: 'ValueError',
  cause: '整数に変換できない文字列です。', advice: '変換する直前に値を確認しましょう。', fixedCode: 'must not expose' },
  completedAt: '2026-10-17T00:00:00Z', shared: true, apiKey: 'must not expose' }; }
test('相談は独立IDとコード/版/実行を固定し、相談文を別項目にする', async () => {
  const p = await prepareConsultation(source, '値と型の確認方法を知りたい');
  assert.match(p.requestId, /^[a-f0-9]{32}$/); assert.ok(Object.isFrozen(p));
  assert.equal(p.codeHash, await codeHash(JSON.stringify([source.code, source.setupCode])));
  assert.equal(p.snapshotHash, await codeHash(JSON.stringify(['example', 'q1', 'v1', 'run:1', source.code, '', source.errorText])));
  assert.equal(p.errorText, source.errorText); assert.equal(p.questionText, '値と型の確認方法を知りたい');
  const another = await prepareConsultation(source, '別の質問'); assert.notEqual(another.requestId, p.requestId);
  assert.equal(another.snapshotHash, p.snapshotHash);
  for (const raw of [{ ...source, questionId: '../q' }, { ...source, runId: '' }, { ...source, code: '' }, { ...source, errorText: 'x'.repeat(40001) }])
    await assert.rejects(prepareConsultation(raw));
  await assert.rejects(prepareConsultation(source, 'q'.repeat(3001)));
});
test('遅い回答は元の版/実行/全文のhashが一致したときだけ受け取る', async () => {
  const p = await prepareConsultation(source), good = response(p);
  const accepted = consultationResult(good, p);
  assert.equal(accepted.result.advice, good.result.advice); assert.equal(accepted.result.fixedCode, undefined); assert.equal(accepted.apiKey, undefined);
  for (const field of ['requestId', 'setId', 'questionId', 'version', 'runId', 'codeHash', 'snapshotHash'])
    assert.throws(() => consultationResult({ ...good, [field]: 'different' }, p));
  assert.throws(() => consultationResult({ ...good, shared: false }, p));
  assert.throws(() => consultationResult({ ...good, completedAt: 'bad' }, p));
  assert.deepEqual(consultationResult({ state: 'pending', requestId: p.requestId }, p), { state: 'pending', requestId: p.requestId });
  assert.throws(() => consultationResult({ state: 'pending', requestId: p.requestId, version: 'v2' }, p));
});
test('編集中・別問題・再実行したコードへ古い回答を混ぜない', () => {
  assert.equal(contextNotice(source, source), '');
  assert.match(contextNotice(source, { ...source, questionId: 'q2' }), /別の問題/);
  assert.match(contextNotice(source, { ...source, version: 'v2' }), /別の問題/);
  assert.match(contextNotice(source, { ...source, code: 'new draft' }), /変更前/);
  assert.match(contextNotice(source, { ...source, setupCode: 'new setup' }), /変更前/);
  assert.match(contextNotice(source, { ...source, runId: 'run:2' }), /別の実行/);
});
test('送信控えをアカウント別に復元し、他のタブの未確認相談を保持する', async () => {
  const storage = new Storage(), journal = new AdviceJournal(storage, actor), other = new AdviceJournal(storage, actor);
  const a = { payload: await prepareConsultation(source), title: '問1', state: 'pending' };
  const b = { payload: await prepareConsultation({ ...source, questionId: 'q2' }), title: '問2', state: 'unknown' };
  journal.write([a]); other.write([b]); assert.equal(journal.read().length, 2);
  assert.deepEqual(new AdviceJournal(storage, 'b'.repeat(64)).read(), []);
  const done = { ...a, state: 'complete', response: consultationResult(response(a.payload), a.payload) };
  journal.write([done]); other.write([a]); assert.equal(journal.read().find(r => r.payload.requestId === a.payload.requestId).state, 'complete');
  assert.throws(() => journal.write([{ ...a, payload: { ...a.payload, code: 'overwritten' } }]), /変更/);
});
test('2タブの書込が交差しても別々のpendingと完了回答を失わない', async () => {
  const storage = new Storage(), one = new AdviceJournal(storage, actor), two = new AdviceJournal(storage, actor);
  const a = { payload: await prepareConsultation(source), title: 'A', state: 'pending' };
  const b = { payload: await prepareConsultation(source), title: 'B', state: 'pending' };
  const set = storage.setItem.bind(storage); let inserted = false;
  storage.setItem = (key, value) => {
    if (!inserted && key.endsWith(a.payload.requestId)) { inserted = true; two.write([b]); }
    set(key, value);
  };
  one.write([a]); assert.deepEqual(new Set(one.read().map(r => r.title)), new Set(['A', 'B']));
  const done = { ...a, state: 'complete', response: consultationResult(response(a.payload), a.payload) };
  one.write([done]); two.write([{ ...a, state: 'unknown' }]);
  assert.equal(two.read().find(r => r.title === 'A').state, 'complete');
  assert.equal(two.read().find(r => r.title === 'B').state, 'pending');
});
test('保存不能では送信控えが成功したことにせず、未確認の控えを件数調整で消さない', async () => {
  const storage = new Storage(), journal = new AdviceJournal(storage, actor), records = [];
  for (let i = 0; i < 12; i++) records.push({ payload: await prepareConsultation(source), title: '問', state: 'unknown' });
  journal.write(records); assert.equal(journal.read().length, 12);
  assert.throws(() => journal.write([...records, { payload: { ...records[0].payload, requestId: 'f'.repeat(32) }, state: 'pending' }]), /結果未確認/);
  const denied = new Storage(); denied.setItem = () => { throw new Error('quota'); };
  assert.throws(() => new AdviceJournal(denied, actor).write([records[0]]), /送信控えを保存できません/);
});
test('共有履歴は文字列項目だけ受け取り、内部情報や完成コードを引き継がない', () => {
  const raw = { timestamp: '2026-10-17', code: '<script>unsafe()</script>', errorText: 'Error', questionText: '相談',
    errorKey: 'ValueError', cause: '原因', advice: 'ヒント', fixedCode: 'solution', rawJson: 'secret', userEmail: 'private@example.invalid' };
  const record = historyRecords({ records: [raw] })[0];
  assert.equal(record.code, raw.code); assert.equal(record.questionText, '相談');
  assert.equal(record.fixedCode, undefined); assert.equal(record.rawJson, undefined); assert.equal(record.userEmail, undefined);
  assert.throws(() => historyRecords({ records: new Array(11).fill(raw) }));
});
test('相談のbridgeは既存保存用とprotocol/routeを分離し、偽origin/source・古い応答を拒否', async () => {
  let listener; const calls = [], frames = [];
  const win = { location: { origin: 'https://editor.example.invalid' }, addEventListener: (_t, fn) => listener = fn, removeEventListener() {} };
  const doc = { createElement: () => ({ remove() {} }), body: { append(frame) { frames.push(frame); } } };
  const bridge = new AdviceBridge({ enabled: true, bridgeURL: 'https://script.google.com/macros/s/TEST/exec' }, { win, doc, timeout: 80 });
  const connection = bridge.connect(), url = new URL(frames[0].src), channel = url.searchParams.get('channel');
  assert.equal(url.searchParams.get('kind'), 'pythoneditor-advice');
  const reply = (source, origin, data) => listener({ source, origin, data: { protocol: ADVICE_PROTOCOL, channel, type: 'response', ...data } });
  const peer = { postMessage(data) { calls.push(data); if (data.action === 'session') queueMicrotask(() => reply(peer, 'https://script.googleusercontent.com', { id: data.id, result: { ok: true, value: { actorKey: actor, maxInputLength: 10000 } } })); } };
  listener({ source: peer, origin: 'https://evil.invalid', data: { protocol: ADVICE_PROTOCOL, channel, type: 'ready' } }); assert.equal(calls.length, 0);
  listener({ source: peer, origin: 'https://script.googleusercontent.com', data: { protocol: ADVICE_PROTOCOL, channel, type: 'ready' } });
  assert.equal((await connection).actorKey, actor);
  const pending = bridge.call('getConsultation', { requestId: 'b'.repeat(32) }, actor), request = calls.at(-1);
  assert.equal(request.actorKey, actor);
  reply({}, 'https://script.googleusercontent.com', { id: request.id, result: { ok: true, value: 'wrong source' } });
  reply(peer, 'https://script.googleusercontent.com', { id: request.id, protocol: 'python-editor-rpc-v1', result: { ok: true, value: 'wrong protocol' } });
  await assert.rejects(pending, e => e.code === 'timeout' && /新たな問い合わせは送っていません/.test(e.message));
  reply(peer, 'https://script.googleusercontent.com', { id: request.id, result: { ok: true, value: 'late' } });
  assert.equal(bridge.requests.size, 0); assert.equal(calls.filter(c => c.action === 'getConsultation').length, 1); bridge.dispose();
});
