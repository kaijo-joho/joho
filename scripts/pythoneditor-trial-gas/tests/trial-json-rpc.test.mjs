import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { trialApiFixture, OWNER, DEMO, FOURTH, id, plain } from './trial-api-fixture.mjs';
import { validateAssessmentPolicy } from '../../../tools/pythoneditor/local-assessment.mjs';
import { validateTrialSession } from '../../../tools/pythoneditor/trial.mjs';

// Reproduce the observed object transport failure without changing the business API.
function googleObjectTransport(value) {
  if (Array.isArray(value)) return value.map(googleObjectTransport);
  if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== null).map(([key, item]) => [key, googleObjectTransport(item)]));
  return value;
}
const rawRequest = (f, action, input = {}, key = action === 'session' ? null : f.T.actorKey(f.identity.active), origin = f.config.editorOrigin) => JSON.stringify({ action, input, expectedActorKey: key, origin });
const jsonCall = (f, ...args) => JSON.parse(googleObjectTransport(f.context.schoolPythonTrialJsonRpc(googleObjectTransport(rawRequest(f, ...args)))));
function notRunSubmission(f) {
  const original = f.submission({ code: f.submission().code + '\nimport random\n' });
  return f.submission({ code: original.code, requestId: id(8000), run: { ...original.run, outcome: 'not_run', stdout: '', outputText: '' } });
}
function bridge(f, response = raw => f.context.schoolPythonTrialJsonRpc(raw)) {
  const boot = { protocol: 'python-editor-trial-rpc-v1', channel: 'a'.repeat(64), origin: f.config.editorOrigin }, messages = [], requests = [];
  const peer = { postMessage(value, origin) { assert.equal(origin, boot.origin); messages.push(plain(value)); } };
  let listener;
  const google = { script: { run: { withSuccessHandler(success) { return { withFailureHandler(failure) { return {
    schoolPythonTrialJsonRpc(raw) {
      requests.push(raw); assert.equal(typeof raw, 'string');
      try { success(googleObjectTransport(response(googleObjectTransport(raw)))); } catch (error) { failure(error); }
    }
  }; } }; } } } };
  const html = readFileSync(new URL('../23_school_trial_bridge.html', import.meta.url), 'utf8');
  const source = html.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= bootJson ?>', JSON.stringify(boot));
  vm.runInNewContext(source, { window: { top: peer }, google, addEventListener(event, fn) { assert.equal(event, 'message'); listener = fn; } });
  function call(action, input = {}, actorKey = action === 'session' ? undefined : f.T.actorKey(f.identity.active), requestId = id(8001)) {
    listener({ source: peer, origin: boot.origin, data: { ...boot, type: 'request', action, input, actorKey, id: requestId } });
    return messages.at(-1)?.result;
  }
  return { call, requests, messages };
}

test('JSON文字列は採点マーカー/未採点nullを保持し、objectのnull脱落fixtureでも実client policy検証を通る', async () => {
  const f = trialApiFixture(), direct = plain(f.rpc('session'));
  assert.equal(direct.value.assessments[0].ranges[0].startMarker, null);
  const damaged = googleObjectTransport(direct);
  assert.equal(Object.hasOwn(damaged.value.assessments[0].ranges[0], 'startMarker'), false);
  assert.throws(() => validateAssessmentPolicy(damaged.value.assessments[0]), /採点マーカー/);
  const result = jsonCall(f, 'session'); assert.equal(result.ok, true);
  assert.equal(result.value.assessments[0].ranges[0].startMarker, null);
  assert.equal(result.value.assessments[0].ranges[0].endMarker, null);
  assert.equal(result.value.ratings[0].earned, null);
  await validateTrialSession(result.value);
  assert.equal(f.state.evaluationCalls, 0); assert.equal(f.state.oldGraderCalls, 0);
});

test('未受付lookupのreceipt/rating/bestScore nullをJSON往復で省略しない', () => {
  const f = trialApiFixture({ account: DEMO });
  const direct = plain(f.rpc('lookup', { scopeId: f.config.scopeId, requestId: id(8999) }));
  assert.equal(Object.hasOwn(googleObjectTransport(direct).value, 'receipt'), false);
  const result = jsonCall(f, 'lookup', { scopeId: f.config.scopeId, requestId: id(8999) });
  assert.equal(result.ok, true);
  for (const key of ['receipt', 'rating', 'bestScore']) { assert.equal(Object.hasOwn(result.value, key), true); assert.equal(result.value[key], null); }
  assert.deepEqual(result.value.history, []);
});

test('提出inputの対象外passed:nullと受付dueAt:nullを双方向に保持し、同じ署名/本文で照会する', () => {
  const f = trialApiFixture({ account: DEMO }), input = notRunSubmission(f);
  assert.ok(input.assessment.checks.some(check => check.passed === null && !check.eligible));
  const result = jsonCall(f, 'submit', input); assert.equal(result.ok, true);
  const receipt = result.value.receipt; assert.equal(receipt.dueAt, null);
  assert.ok(receipt.checks.some(check => check.passed === null && !check.eligible));
  const record = JSON.parse(f.stores.get(DEMO).ledger.getRange(2, 4, 1, 70).getValues()[0].map(value => value.slice(2)).join(''));
  assert.deepEqual(record.input, input); assert.equal(record.receipt.signature, receipt.signature);
  assert.deepEqual(jsonCall(f, 'lookup', { scopeId: f.config.scopeId, requestId: input.requestId }).value.receipt, receipt);
  assert.equal(f.state.evaluationCalls, 0); assert.equal(f.state.oldGraderCalls, 0);
});

test('JSON窓口は4項目と2100000文字以内の文字列に限定し、既存RPCの認証拒否を再利用する', () => {
  const f = trialApiFixture(), original = f.context.schoolPythonTrialRpc, calls = [];
  f.context.schoolPythonTrialRpc = (...args) => { calls.push(args); return original(...args); };
  const valid = JSON.parse(rawRequest(f, 'session'));
  for (const value of [null, {}, '', 'null', '[]', '{', ' '.repeat(2100001), JSON.stringify({ ...valid, role: 'teacherTrial' }),
    JSON.stringify({ action: 'session', input: {}, origin: f.config.editorOrigin }), JSON.stringify({ ...valid, input: null }),
    JSON.stringify({ ...valid, input: [] }), JSON.stringify({ ...valid, expectedActorKey: {} }), JSON.stringify({ ...valid, origin: null })]) {
    assert.equal(JSON.parse(f.context.schoolPythonTrialJsonRpc(value)).error.code, 'invalid_request');
  }
  assert.equal(calls.length, 0); assert.equal(f.state.opens.length, 0);
  f.select(FOURTH); assert.equal(jsonCall(f, 'session').error.code, 'account_denied');
  f.select(DEMO); assert.equal(jsonCall(f, 'session', {}, f.T.actorKey(OWNER)).error.code, 'account_mismatch');
  assert.equal(jsonCall(f, 'session', {}, null, 'https://other.example.test').error.code, 'origin_denied');
  assert.equal(calls.length, 3); assert.equal(f.state.opens.length, 0);
  assert.equal(jsonCall(f, 'session').ok, true); assert.equal(calls.length, 4);
  assert.equal(typeof f.context.schoolPythonTrialRpc, 'function');
});

test('実bridgeはgoogle.script.runへ文字列だけを送り、nullを落とすobject transportでもsession/lookup/提出を通す', async () => {
  const f = trialApiFixture({ account: DEMO }), b = bridge(f), session = b.call('session');
  assert.equal(session.ok, true); await validateTrialSession(session.value);
  assert.equal(JSON.parse(b.requests[0]).expectedActorKey, null);
  assert.equal(b.call('lookup', { scopeId: f.config.scopeId, requestId: id(8999) }).value.receipt, null);
  const input = notRunSubmission(f), result = b.call('submit', input); assert.equal(result.ok, true);
  assert.ok(JSON.parse(b.requests.at(-1)).input.assessment.checks.some(check => check.passed === null));
  assert.ok(result.value.receipt.checks.some(check => check.passed === null));
  assert.ok(b.requests.every(raw => typeof raw === 'string'));
});

test('bridgeの不正JSON/非文字列/壊れたenvelopeはtransport_failedにし、同番号の再照会を妨げない', () => {
  for (const invalid of ['invalid', 'null', '[]', '{}', '{"ok":true}', '{"ok":false}', { ok: true, value: null }]) {
    const f = trialApiFixture(); let current = invalid;
    const b = bridge(f, raw => current === undefined ? f.context.schoolPythonTrialJsonRpc(raw) : current);
    assert.equal(b.call('session').error.code, 'transport_failed');
    current = undefined; assert.equal(b.call('session').ok, true);
  }
  const f = trialApiFixture(), b = bridge(f);
  assert.equal(b.call('submit', { text: 'a'.repeat(2100000) }).error.code, 'transport_failed');
  assert.equal(b.requests.length, 0);
});
