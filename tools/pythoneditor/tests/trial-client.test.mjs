import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialStorage, TrialClient, validateTrialSession, TRIAL_SCOPE } from '../trial.mjs';
import { codeHash, canonicalEvidence, submissionText } from '../cloud.mjs';
import { compileAssessment, validateAssessmentPolicy, evaluateAssessment } from '../local-assessment.mjs';
import { validateRating, setRating, renderRating } from '../navigation.mjs';

const q = { questionId: 'q1', version: 'v1', setId: 'trial-set', kind: 'code', title: '動作確認', prompt: '入力して実行します。', templateCode: '', setupCode: '' };
const copy = value => structuredClone(value);
const failure = code => Object.assign(new Error(code), { code });
class Storage {
  rows = new Map(); broken = false;
  get length() { return this.rows.size; }
  key(index) { return [...this.rows.keys()][index] ?? null; }
  getItem(key) { if (this.broken) throw failure('quota'); return this.rows.get(key) ?? null; }
  setItem(key, value) { if (this.broken) throw failure('quota'); this.rows.set(key, value); }
  removeItem(key) { if (this.broken) throw failure('quota'); this.rows.delete(key); }
}
function policy() {
  return compileAssessment({ schema: 1, question: q, gradingVersion: 'rules-v1', graded: true,
    ranges: [{ regionId: 'whole', scoringId: 'q1', startMarker: null, endMarker: null }],
    rules: { q1: { schemaVersion: 2, minLines: 1, rules: [{ ruleId: 'display', target: 'code', ruleType: 'match', stepNo: 1, stepMode: 'single', keyword: 'print', points: 2, enabled: true }] } } });
}
async function session(letter = 'a', scopeId = '1'.repeat(32)) {
  // 合成用の本人情報。実在アカウントへの接続はしない。
  const account = `codex-fixture-${letter}@gfe.kaijo.ed.jp`, actorKey = await codeHash(account), p = policy();
  return { scope: TRIAL_SCOPE, scopeId, trial: true, account, actorKey, viewerRole: 'demo',
    catalog: { schema: 'python-editor-catalog-v1', label: '試用fixture', sets: [{ setId: 'trial-set', title: '試用', questions: [q] }] },
    assessments: [p], ratings: [{ questionId: q.questionId, version: q.version, earned: null, total: 1, assessmentSource: 'local-report' }],
    store: { connection: { account, actorKey, binding: 'synthetic-binding', spreadsheetId: 'synthetic-trial-spreadsheet-0001', schemaVersion: 1, storeURL: 'https://script.google.com/macros/s/SYNTHETIC_TRIAL/exec' } } };
}
async function input(code = 'print(1)') {
  const p = policy(), normalized = await submissionText({ ...q, code, stdin: '' }, { assignmentId: 'trial' });
  const value = { questionId: q.questionId, version: q.version, policyHash: p.policyHash, code, stdin: '', run: normalized.run };
  return { ...value, assessment: evaluateAssessment(p, value) };
}
class Server {
  constructor(session) { this.session = session; this.receipts = new Map(); this.bodies = new Map(); this.calls = []; }
  result(receipt) {
    const history = [...this.receipts.values()], best = history.slice().sort((a, b) => b.score - a.score)[0];
    return { scopeId: this.session.scopeId, questionId: q.questionId, version: q.version, receipt: receipt || null, bestScore: best?.score ?? null,
      rating: best ? { earned: best.starEarned, total: best.starTotal, version: q.version, trial: true } : null, history };
  }
  async rpc(action, payload, actorKey) {
    this.calls.push({ action, payload: copy(payload), actorKey }); if (this.before) await this.before(action, payload);
    assert.equal(actorKey, this.session.actorKey);
    if (action === 'submit') {
      if (!this.receipts.has(payload.requestId)) {
        const assessment = payload.assessment;
        const receipt = { state: 'submitted', scopeId: payload.scopeId, actorKey, questionId: payload.questionId, version: payload.version, requestId: payload.requestId,
          policyHash: payload.policyHash, payloadHash: await codeHash(canonicalEvidence(payload)), codeHash: await codeHash(payload.code), receivedAt: '2026-10-17T01:02:03.000Z', dueAt: null,
          score: assessment.score, earned: assessment.earned, total: assessment.total, starEarned: assessment.starEarned, starTotal: assessment.starTotal,
          checks: assessment.checks.map((check, index) => ({ ...check, label: '条件' + (index + 1), earned: check.passed && check.eligible ? check.points : 0 })),
          signature: 'f'.repeat(64), assessmentSource: 'local-report', trial: true };
        this.receipts.set(payload.requestId, receipt); this.bodies.set(payload.requestId, copy(payload));
      } else assert.deepEqual(payload, this.bodies.get(payload.requestId));
      if (this.lose) { this.lose = false; throw failure('timeout'); }
      return this.result(this.receipts.get(payload.requestId));
    }
    if (action === 'lookup') return this.receipts.has(payload.requestId) ? this.result(this.receipts.get(payload.requestId)) : { scopeId: this.session.scopeId, receipt: null, rating: null, history: [], bestScore: null };
    if (action === 'questionStatus') return this.result([...this.receipts.values()].at(-1));
    if (action === 'store') return payload.action === 'session' ? { ...this.session.store.connection, confirmationJournal: { schema: 1, enabled: true, maxBytes: 4194304, chunkSize: 32000 } } : { echo: payload };
    throw failure('invalid_action');
  }
}
async function fixture(letter = 'a', rawStorage = new Storage()) {
  const raw = await session(letter), validated = await validateTrialSession(raw, { validatePolicy: validateAssessmentPolicy }), server = new Server(raw);
  const storage = new TrialStorage(rawStorage, raw.scopeId), client = new TrialClient(server.rpc.bind(server), validated, storage);
  return { raw, validated, server, storage, client, rawStorage };
}

test('trial scope, identity, public policies and connection are checked before connecting storage', async () => {
  const raw = await session(), checked = await validateTrialSession(raw, { validatePolicy: validateAssessmentPolicy });
  assert.equal(checked.assessments[0].policyHash, policy().policyHash); assert.equal(checked.ratings[0].rating.trial, true); assert.equal(checked.ratings[0].rating.earned, null);
  for (const change of [{ trial: false }, { scope: 'production' }, { actorKey: 'a'.repeat(64) }, { viewerRole: 'teacher' }]) await assert.rejects(validateTrialSession({ ...raw, ...change }, { validatePolicy: validateAssessmentPolicy }));
  await assert.rejects(validateTrialSession({ ...raw, assessments: [{ ...raw.assessments[0], answerCode: 'secret' }] }, { validatePolicy: validateAssessmentPolicy }));
  await assert.rejects(validateTrialSession({ ...raw, store: { connection: { ...raw.store.connection, actorKey: 'a'.repeat(64) } } }, { validatePolicy: validateAssessmentPolicy }));
});
test('trial storage lists and changes only its scope and leaves ordinary cloud keys untouched', () => {
  const raw = new Storage(), a = new TrialStorage(raw, 'a'.repeat(32)), b = new TrialStorage(raw, 'b'.repeat(32)); raw.setItem('joho.pythoneditor.cloud.v1.production', 'original');
  a.setItem('draft', 'A'); b.setItem('draft', 'B'); assert.equal(a.length, 1); assert.equal(a.key(0), 'draft'); assert.equal(a.getItem('draft'), 'A');
  a.removeItem('draft'); assert.equal(b.getItem('draft'), 'B'); assert.equal(raw.getItem('joho.pythoneditor.cloud.v1.production'), 'original');
});
test('a local assessment alone creates no accepted rating, receipt or submission control', async () => {
  const { client, server } = await fixture(), local = await input(); assert.equal(local.assessment.starEarned, 1);
  assert.equal(client.pending(q), null); assert.equal(server.calls.length, 0); assert.equal((await client.recover(q)).rating, null);
});
test('accepted signed trial receipt distinguishes point totals from stars and clears only its matching pending record', async () => {
  const { client } = await fixture(), result = await client.submit(await input());
  assert.equal(result.receipt.state, 'submitted'); assert.equal(result.receipt.earned, 3); assert.equal(result.receipt.starEarned, 1); assert.equal(result.rating.earned, 1); assert.equal(result.rating.total, 1);
  assert.equal(result.rating.trial, true); assert.equal(client.pending(q), null); assert.equal(result.history.length, 1);
});
test('a lost submit response is recovered by immutable request lookup after reload without submitting again', async () => {
  const { client, server, validated, storage } = await fixture(); server.lose = true;
  await assert.rejects(client.submit(await input('print("first")')), { code: 'timeout' }); const pending = client.pending(q);
  const reloaded = new TrialClient(server.rpc.bind(server), validated, storage), result = await reloaded.recover(q);
  assert.equal(result.receipt.requestId, pending.input.requestId); assert.equal(result.receipt.payloadHash, pending.payloadHash); assert.equal(reloaded.pending(q), null);
  assert.equal(server.calls.filter(row => row.action === 'submit').length, 1);
});
test('an unreceived lookup holds its original body until explicit resend, without mixing later edits', async () => {
  const { client, server } = await fixture(); server.before = action => { if (action === 'submit') throw failure('timeout'); };
  await assert.rejects(client.submit(await input('print("old")')), { code: 'timeout' }); const pending = client.pending(q); server.before = null;
  const result = await client.recover(q); assert.equal(result.unreceived, true); assert.deepEqual(client.pending(q), pending); assert.equal(server.receipts.size, 0);
  const received = await client.recover(q, { resend: true }); assert.equal(received.receipt.requestId, pending.input.requestId); assert.equal(server.bodies.get(pending.input.requestId).code, 'print("old")');
});
test('wrong receipt scope, actor, version or payload hash keeps the original request', async () => {
  for (const bad of [{ scopeId: 'b'.repeat(32) }, { actorKey: 'b'.repeat(64) }, { version: 'v2' }, { payloadHash: '0'.repeat(64) }, { codeHash: '0'.repeat(64) }, { trial: false }]) {
    const { client, server } = await fixture(), original = server.rpc.bind(server);
    client.rpc = async (...args) => { const result = await original(...args); if (result.receipt) result.receipt = { ...result.receipt, ...bad }; return result; };
    await assert.rejects(client.submit(await input()), { code: 'trial_response' }); assert.ok(client.pending(q));
  }
});
test('a browser quota failure prevents transmission without losing local code', async () => {
  const { client, server, rawStorage } = await fixture(); rawStorage.broken = true;
  await assert.rejects(client.submit(await input()), { code: 'trial_journal' }); assert.equal(server.calls.length, 0);
});
test('another trial account does not find or resend the first account pending request', async () => {
  const original = await fixture(), other = await fixture('b', original.rawStorage); original.server.before = () => { throw failure('timeout'); };
  await assert.rejects(original.client.submit(await input()), { code: 'timeout' }); assert.ok(original.client.pending(q)); assert.equal(other.client.pending(q), null);
  await other.client.recover(q); assert.equal(other.server.calls.filter(row => row.action === 'submit').length, 0);
});
test('concurrent duplicate submit clicks share one immutable request and one receipt', async () => {
  const { client, server } = await fixture(), value = await input(); const one = client.submit(value), two = client.submit(value); assert.equal(one, two);
  await Promise.all([one, two]); assert.equal(server.calls.filter(row => row.action === 'submit').length, 1); assert.equal(server.receipts.size, 1);
});
test('trial storage bridge reuses the verified actor and binding and dispose leaves the main client usable', async () => {
  const { client, server, validated } = await fixture(), bridge = client.storeBridge(validated.store.connection);
  assert.equal((await bridge.connect()).actorKey, validated.actorKey); await bridge.call('getDraft', { tool: 'python' });
  const stored = server.calls.at(-1); assert.equal(stored.action, 'store'); assert.equal(stored.payload.binding, validated.store.connection.binding); assert.equal(stored.actorKey, validated.actorKey);
  assert.throws(() => client.storeBridge({ ...validated.store.connection, spreadsheetId: 'synthetic-other-sheet-00001' }));
  bridge.dispose(); await assert.rejects(bridge.call('getDraft', {}), { code: 'disconnected' }); await client.recover(q);
});
test('trial star sums stay labelled and never aggregate with production or demonstration ratings', () => {
  const r = validateRating({ earned: 1, total: 2, version: 'v1', trial: true }); assert.equal(r.trial, true);
  const other = { ...q, questionId: 'q2' }, set = { questions: [q, other] };
  assert.deepEqual(setRating(set, () => r), { earned: 2, total: 4, example: false, trial: true });
  assert.equal(setRating(set, item => item.questionId === 'q1' ? r : { earned: 1, total: 2 }), null);
  const oldDocument = globalThis.document, node = { textContent: '', replaceChildren() {}, classList: { toggle() {} }, setAttribute(key, value) { this[key] = value; } };
  globalThis.document = { createTextNode: value => value };
  try { renderRating(node, r, true); assert.match(node.textContent, /試用評価.*★1\/2/); assert.match(node['aria-label'], /試用評価/); }
  finally { if (oldDocument === undefined) delete globalThis.document; else globalThis.document = oldDocument; }
});
