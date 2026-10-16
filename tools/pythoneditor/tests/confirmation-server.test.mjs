import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCloudFixture, T0, DUE } from './cloud-fixture.mjs';
import { teacherPreviewFixture } from '../../../scripts/pythoneditor-preview-gas/tests/fixture.mjs';
const plain = value => JSON.parse(JSON.stringify(value)), uid = () => randomUUID().replaceAll('-', '');
const key = q => q.version + '/' + q.questionId;
const inputConfig = () => ({ cases: [{ id: 'greater', label: '6より大きい値', inputs: [{ index: 0, kind: 'integer', op: 'gt', value: 6 }] }],
  private: { expectedOutputs: { greater: { mode: 'lastLine', text: '合成の非公開出力' } } } });
const inputGrading = () => ({ schema: 1, version: 'rubric1', checks: [{ id: 'greater', points: 3, require: 'inputAndOutput' }] });
function fixture(type = 'inputCases', config = inputConfig(), grading = inputGrading()) {
  const f = createCloudFixture(), C = f.ctx.PythonEditorConfirmation, G = f.ctx.PythonEditorConfirmationGraderV1;
  const code = 'print(input("値: "))', ref = { questionId: 'q1', version: 'v1' };
  const q = { questionId: 'check1', version: 'v1', setId: 'exercise', order: 2, title: '合成の確認問題', prompt: '確認してください',
    templateCode: '', setupCode: '', kind: 'confirmation', codeRefs: [ref], checkType: type, checkConfig: plain(C.publicCheck(type, config)) };
  const body = { schema: 1, question: q, gradingVersion: '', engineVersion: grading ? G.engineVersion : f.ctx.PythonEditorGraderV1.engineVersion,
    ranges: [], rules: {}, graded: !!grading, confirmation: { codeRefs: [ref], checkType: type, checkConfig: plain(C.normalizeCheck(type, config)) } };
  if (grading) body.confirmationGrading = plain(G.normalize(type, config, grading));
  f.freeze(body);
  const trial = (changes = {}) => ({ schema: 1, id: 'trial-' + uid(), source: ref, code, codeHash: f.P.hashText(code),
    inputs: [{ prompt: '値: ', value: '7' }], stdout: '合成の非公開出力\n', stderr: '', outcome: 'success', truncated: false, at: T0, ...changes });
  const submission = (trials = [trial()], response, changes = {}) => ({ kind: 'confirmation-v1', questionId: q.questionId, version: q.version,
    assignmentId: 'exercise1', requestId: uid(), sources: [{ ...ref, code }],
    journal: { schema: 1, trials, responses: response ? { [key(q)]: response } : {} }, ...changes });
  return { ...f, C, G, q, body, code, ref, trial, input: submission };
}
const error = name => value => value.pythonEditorCode === name;

test('採点設定なしは正式提出を開かず、既定配点を作らない', () => {
  const f = fixture('inputCases', inputConfig(), null), session = f.dispatch('session');
  assert.equal(session.policies.find(p => p.questionId === f.q.questionId).canSubmit, false);
  assert.equal(session.policies.find(p => p.questionId === f.q.questionId).graded, false);
  assert.ok(!session.ratings.some(r => r.questionId === f.q.questionId));
  assert.throws(() => f.dispatch('submit', f.input()), error('not_allowed'));
  assert.equal(f.sheets.Python提出受付.getLastRow(), 1);
});
test('private出力をGASで再判定し、確認の正式結果と星だけを返す', () => {
  const f = fixture(), session = f.dispatch('session'), publicQ = session.catalog.sets[0].questions.find(q => q.questionId === f.q.questionId);
  assert.equal(session.policies.find(p => p.questionId === f.q.questionId).canSubmit, true);
  assert.equal(session.policies.find(p => p.questionId === f.q.questionId).graded, true);
  const publicText = JSON.stringify(publicQ);
  for (const privateField of ['expectedOutputs', '合成の非公開出力', 'confirmationGrading', 'rubric1', 'points']) assert.ok(!publicText.includes(privateField));
  const wrong = f.dispatch('submit', f.input([f.trial({ stdout: '誤り\n' })]));
  assert.equal(wrong.receipt.score, 0); assert.equal(wrong.receipt.kind, 'confirmation-v1'); assert.equal(wrong.rating.earned, 0);
  const request = f.input(), result = f.dispatch('submit', request);
  assert.equal(result.receipt.score, 1); assert.equal(result.rating.earned, 1); assert.equal(result.rating.total, 1);
  assert.match(result.receipt.evidenceHash, /^[a-f0-9]{64}$/); assert.equal(result.receipt.codeHash, undefined);
  const normalized = f.P.submission(request, f.P.hashText);
  assert.equal(result.receipt.evidenceHash, f.P.confirmationEvidenceHash(normalized, f.P.hashText));
  assert.equal(result.receipt.checks[0].label, '確認条件1'); assert.ok(!JSON.stringify(result).includes('合成の非公開出力'));
  assert.match(result.receipt.diagnostics[0], /実行を証明するものではありません/);
});
test('未知metadata・偽合否・hash不整合・余分な参照/回答・選択先欠落は受付前に拒否', () => {
  const mutations = [
    input => { input.score = 1; }, input => { input.passed = true; }, input => { input.completed = true; },
    input => { input.evidenceHash = 'a'.repeat(64); }, input => { input.sources[0].codeHash = 'a'.repeat(64); },
    input => { input.journal.trials[0].passed = true; }, input => { input.journal.responses['v1/other'] = { answer: 1 }; },
    input => { input.journal.trials.push(plain(input.journal.trials[0])); },
    input => { input.sources.push(plain(input.sources[0])); }, input => { input.journal.trials[0].source.version = 'v99'; },
    input => { input.journal.responses['v1/check1'] = { selections: { greater: 'missing' } }; }
  ];
  for (const mutate of mutations) {
    const f = fixture(), input = plain(f.input()); mutate(input);
    assert.throws(() => f.dispatch('submit', input), error('invalid_input')); assert.equal(f.sheets.Python提出受付.getLastRow(), 1);
  }
  const f = fixture(), input = f.input(); input.journal.trials[0].codeHash = 'a'.repeat(64);
  assert.throws(() => f.dispatch('submit', input), error('stale_output')); assert.equal(f.sheets.Python提出受付.getLastRow(), 1);
});
test('変更前コード・停止・エラー・出力上限を合格材料にせず、記録自体は保持', () => {
  for (const changes of [{ outcome: 'stopped' }, { outcome: 'error' }, { outcome: 'environment_error' }, { truncated: true }]) {
    const f = fixture(), result = f.dispatch('submit', f.input([f.trial(changes)])); assert.equal(result.receipt.score, 0);
  }
  const f = fixture(), input = f.input(); input.sources[0].code += '\nprint("edited")';
  assert.equal(f.dispatch('submit', input).receipt.score, 0);
  const saved = f.store.findRequest(f.environment.actor.key, input.requestId);
  assert.equal(saved.body.journal.trials[0].stdout, input.journal.trials[0].stdout);
  assert.equal(saved.body.sources[0].code, input.sources[0].code);
});
test('受付・結果保存・応答消失・再送・締切・最高点は既存の正式提出契約を共用', () => {
  const f = fixture(), input = f.input();
  f.sheets.Python提出結果.beforeWrite = () => { throw new Error('synthetic storage failure'); };
  assert.throws(() => f.dispatch('submit', input));
  const pending = f.dispatch('getSubmission', { requestId: input.requestId });
  assert.equal(pending.receipt.state, 'pending'); assert.equal(pending.receipt.receivedAt, T0);
  f.sheets.Python提出結果.beforeWrite = null; f.setNow(new Date(Date.parse(DUE) + 1).toISOString());
  const resumed = f.dispatch('resumeSubmission', { requestId: input.requestId });
  assert.equal(resumed.receipt.state, 'submitted'); assert.equal(resumed.receipt.score, 1); assert.equal(resumed.receipt.late, false);
  f.dispatch('submit', input); assert.equal(f.sheets.Python提出受付.getLastRow(), 2); assert.equal(f.sheets.Python提出結果.getLastRow(), 2);
  const conflict = plain(input); conflict.journal.trials[0].stdout = 'changed';
  assert.throws(() => f.dispatch('submit', conflict), error('request_conflict'));
  const late = f.dispatch('submit', f.input([f.trial({ stdout: 'wrong' })]));
  assert.equal(late.receipt.late, true); assert.equal(late.bestScore, 1); assert.equal(late.rating.earned, 1); assert.equal(late.history.length, 2);
  const other = f.dispatch('getSubmission', { requestId: input.requestId }, undefined, f.env('another@example.invalid'));
  assert.equal(other.receipt, null);
});
test('到着証明は確認の本文全体と結合し、締切後に同じ要求だけ回復する', () => {
  const f = fixture(), input = f.input(); let ticket;
  f.setLocked(true);
  try { f.dispatch('submit', input); } catch (e) { assert.equal(e.pythonEditorCode, 'busy'); ticket = plain(e.intakeTicket); }
  assert.ok(ticket); f.setLocked(false); f.setNow(new Date(Date.parse(DUE) + 1000).toISOString());
  const saved = f.dispatch('submit', { ...input, intakeTicket: ticket });
  assert.equal(saved.receipt.receivedAt, T0); assert.equal(saved.receipt.late, false);
  const changed = fixture(), bad = changed.input(); bad.sources[0].code += '\n# changed';
  assert.throws(() => changed.dispatch('submit', { ...bad, intakeTicket: ticket }), error('request_conflict'));
});
test('明示した旧codeRefの採用版で判定し、現配布版へ変換しない', () => {
  const f = fixture(), body = plain(f.body); body.question.version = 'v2'; f.freeze(body);
  f.config.assignments[0].enabled = false;
  f.config.assignments.push({ ...f.config.assignments[0], enabled: true, version: 'v2', assignmentId: 'exercise2' });
  const unrelated = plain(f.snapBody); unrelated.question.questionId = 'unrelated'; f.freeze(unrelated);
  const session = f.dispatch('session');
  assert.ok(session.catalog.sets[0].questions.some(q => q.questionId === 'q1' && q.version === 'v1'));
  assert.ok(!session.catalog.sets[0].questions.some(q => q.questionId === 'unrelated'));
  assert.ok(!session.policies.some(p => p.questionId === 'q1' && p.version === 'v1'));
  const input = f.input(); input.version = 'v2'; input.assignmentId = 'exercise2';
  assert.equal(f.dispatch('submit', input).receipt.score, 1);
  assert.equal(f.store.findRequest(f.environment.actor.key, input.requestId).body.sources[0].version, 'v1');
  const changed = plain(body); changed.confirmationGrading.checks[0].points = 9;
  assert.throws(() => f.freeze(changed), error('snapshot_conflict'));
  const missing = plain(body); missing.question.version = 'v3'; missing.question.codeRefs[0].version = 'missing'; missing.confirmation.codeRefs[0].version = 'missing'; f.freeze(missing);
  f.config.assignments.push({ ...f.config.assignments[1], version: 'v3', assignmentId: 'exercise3' });
  const wrongRef = f.input(); wrongRef.version = 'v3'; wrongRef.assignmentId = 'exercise3';
  wrongRef.sources[0].version = 'missing'; wrongRef.journal.trials[0].source.version = 'missing';
  assert.throws(() => f.dispatch('submit', wrongRef), error('snapshot_missing'));
});
test('確認問題の旧版最高点は旧基準の星分母を保持し、別提出の条件を寄せ集めない', () => {
  const f = fixture(); f.dispatch('submit', f.input());
  const body = plain(f.body); body.question.version = 'v2';
  body.confirmation.checkConfig.cases.push({ id: 'less', label: '6以下の値', inputs: [{ index: 0, kind: 'integer', op: 'lte', value: 6 }] });
  body.confirmation.checkConfig.private.expectedOutputs.less = { mode: 'lastLine', text: 'lower' };
  body.question.checkConfig = plain(f.C.publicCheck('inputCases', body.confirmation.checkConfig));
  body.confirmationGrading = plain(f.G.normalize('inputCases', body.confirmation.checkConfig, { schema: 1, version: 'rubric2', checks: [
    { id: 'greater', points: 1, require: 'inputAndOutput' }, { id: 'less', points: 1, require: 'inputAndOutput' }] }));
  f.freeze(body); f.config.assignments.push({ ...f.config.assignments[0], version: 'v2' });
  const request = f.input(); request.version = 'v2';
  const result = f.dispatch('submit', request); assert.equal(result.receipt.score, 0.5); assert.equal(result.bestScore, 1);
  assert.deepEqual(plain(result.rating), { earned: 1, total: 1, version: 'v1' });
});
test('依存配布は許可された親の採用済み同セットcodeRefsだけで、privateと他セットを返さない', () => {
  const f = fixture();
  const hidden = f.env('outside@example.invalid'); hidden.actor.grade = 1;
  let lookups = 0; const find = f.store.findSnapshot; f.store.findSnapshot = ref => { lookups++; return find(ref); };
  assert.equal(f.dispatch('session', {}, undefined, hidden).catalog.sets.length, 0); assert.equal(lookups, 0);
  const text = JSON.stringify(f.dispatch('session'));
  for (const secret of ['expectedOutputs','合成の非公開出力','confirmationGrading','rubric-v1']) assert.ok(!text.includes(secret));
  for (const invalid of [{ setId: 'another', kind: 'code' }, { setId: 'exercise', kind: 'observation' }]) {
    const g = fixture(), source = plain(g.snapBody); source.question.questionId = 'alien'; Object.assign(source.question, invalid); g.freeze(source);
    const parent = plain(g.body); parent.question.version = 'v2'; parent.question.codeRefs = [{ questionId: 'alien', version: 'v1' }]; parent.confirmation.codeRefs = plain(parent.question.codeRefs); g.freeze(parent);
    g.config.assignments.push({ ...g.config.assignments[0], version: 'v2' });
    assert.throws(() => g.dispatch('session'), error('snapshot_missing'));
    const input = g.input(); input.version = 'v2'; input.sources[0].questionId = 'alien'; input.journal.trials[0].source.questionId = 'alien';
    assert.throws(() => g.dispatch('submit', input), error('snapshot_invalid')); assert.equal(g.sheets.Python提出受付.getLastRow(), 1);
  }
});
test('resultCoverageは種類数を再計算し、明示された閾値と配点を使う', () => {
  const f = fixture('resultCoverage', { results: ['red','blue','green'], requiredDistinct: 3, output: 'lastLine' },
    { schema: 1, version: 'coverage1', checks: [{ id: 'one', points: 2, distinctAtLeast: 1 }, { id: 'two', points: 3, distinctAtLeast: 2 }, { id: 'three', points: 5, distinctAtLeast: 3 }] });
  const result = f.dispatch('submit', f.input([f.trial({ stdout: 'red\n' }), f.trial({ stdout: 'red\n' }), f.trial({ stdout: 'blue\n' })]));
  assert.equal(result.receipt.score, 0.5); assert.equal(result.rating.earned, 2); assert.equal(result.rating.total, 3);
});
test('attemptLimitは一実行内の有効な推測回数と成功表示を再計算する', () => {
  const f = fixture('attemptLimit', { range: { min: 1, max: 10 }, maxGuesses: 'theoretical', guessPrompt: 'guess: ', successOutput: 'correct', output: 'lastLine' },
    { schema: 1, version: 'attempt1', checks: [{ id: 'limit', points: 2, require: 'withinLimit' }] });
  const inputs = count => Array.from({ length: count }, () => ({ prompt: 'guess: ', value: '5' }));
  assert.equal(f.dispatch('submit', f.input([f.trial({ inputs: inputs(5), stdout: 'correct\n' })])).receipt.score, 0);
  assert.equal(f.dispatch('submit', f.input([f.trial({ inputs: inputs(4), stdout: 'correct\n' })])).receipt.score, 1);
});
test('compareRunsは固定条件への適合と異なる選択を確認し、variantsだけ変更前コードを許容', () => {
  const f = fixture('compareRuns', { conditions: [{ id: 'left', label: '条件A' }, { id: 'right', label: '条件B' }], codePolicy: 'variants' },
    { schema: 1, version: 'comparison1', checks: [{ id: 'left', points: 1, require: 'output', output: { mode: 'lastLine', text: 'before' } },
      { id: 'right', points: 1, require: 'inputAndOutput', inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 8 }], output: { mode: 'lastLine', text: 'after' } }] });
  const a = f.trial({ code: 'print("before")', stdout: 'before\n' }); a.codeHash = f.P.hashText(a.code);
  const b = f.trial({ inputs: [{ prompt: '値: ', value: '8' }], stdout: 'after\n' });
  assert.equal(f.dispatch('submit', f.input([a, b], { selections: { left: a.id, right: b.id } })).receipt.score, 1);
  assert.equal(f.dispatch('submit', f.input([a, b], { selections: { left: a.id, right: a.id } })).receipt.score, 0.5);
});
test('answerはprivate正答と明示誤差で採点し、回答済みだけを正解にしない', () => {
  const f = fixture('answer', { format: 'number', question: '値は？', private: { expectedAnswer: 2 } },
    { schema: 1, version: 'answer1', checks: [{ id: 'answer', points: 4, require: 'correct', absoluteTolerance: 0.1, relativeTolerance: 0 }] });
  assert.equal(f.dispatch('submit', f.input([], { answer: 1 })).receipt.score, 0);
  assert.equal(f.dispatch('submit', f.input([], { answer: 2.05 })).receipt.score, 1);
  assert.equal(f.dispatch('submit', f.input()).receipt.score, 0);
  const choice = fixture('answer', { format: 'choice', question: '選択してください', choices: [{ id: 'a', label: 'A' }, { id: 'b', label: 'B' }], private: { expectedAnswer: 'b' } },
    { schema: 1, version: 'choice1', checks: [{ id: 'answer', points: 1, require: 'correct' }] });
  assert.equal(choice.dispatch('submit', choice.input([], { answer: 'a' })).receipt.score, 0);
  assert.equal(choice.dispatch('submit', choice.input([], { answer: 'b' })).receipt.score, 1);
});
test('採点定義の曖昧さ・欠落・未知項目と保存上限超過を拒否する', () => {
  const f = fixture();
  for (const grading of [ {}, { ...inputGrading(), checks: [] }, { ...inputGrading(), checks: [{ id: 'greater', require: 'input' }] },
    { ...inputGrading(), checks: [{ id: 'greater', points: 0, require: 'input' }] },
    { ...inputGrading(), checks: [{ id: 'greater', points: 1, require: 'input', passed: true }] } ])
    assert.throws(() => f.G.normalize('inputCases', inputConfig(), grading), error('snapshot_invalid'));
  const noExpected = plain(inputConfig()); delete noExpected.private;
  assert.throws(() => f.G.normalize('inputCases', noExpected, inputGrading()), error('snapshot_invalid'));
  assert.throws(() => f.G.normalize('answer', { format: 'number', question: '値', private: { expectedAnswer: 2 } },
    { schema: 1, version: 'v1', checks: [{ id: 'answer', points: 1, require: 'correct' }] }), error('snapshot_invalid'));
  const code = 'x'.repeat(200000), long = f.input(Array.from({ length: 5 }, () => f.trial({ code, codeHash: f.P.hashText(code), stdout: 'x'.repeat(100000) })));
  assert.throws(() => f.dispatch('submit', long), error('payload_too_large')); assert.equal(f.sheets.Python提出受付.getLastRow(), 1);
});
test('正本runtimeConfigの明示定義だけで採点を有効化し、圧縮配布にもprivateを保持する', () => {
  const f = fixture(), M = f.ctx.PythonEditorMaster, headers = plain(M.headers);
  const row = values => headers.map(name => values[name] ?? '');
  const common = { setId: 'exercise', version: 'v1', status: '編集中', runtimeConfig: '{}' };
  const source = row({ ...common, questionId: 'q1', order: 1, title: 'コード問題', prompt: '合成問題', templateCode: f.code });
  const confirm = values => row({ ...common, questionId: 'check1', order: 2, title: '確認問題', prompt: '合成問題', kind: 'confirmation',
    codeRefs: 'q1@v1', checkType: 'inputCases', checkConfig: JSON.stringify(inputConfig()), ...values });
  const spec = { setId: 'exercise', version: 'v1', gradingSheet: '採点設定py' };
  const before = M.build([headers, source, confirm()], [], spec).records[1].body;
  assert.equal(before.graded, false); assert.equal(before.confirmationGrading, undefined);
  const graded = M.build([headers, source, confirm({ runtimeConfig: JSON.stringify({ confirmationGrading: inputGrading() }) })], [], spec);
  const body = graded.records[1].body; assert.equal(body.graded, true); assert.equal(body.engineVersion, f.G.engineVersion);
  assert.equal(body.confirmationGrading.version, 'rubric1'); assert.equal(body.confirmationGrading.checks[0].points, 3);
  const p = teacherPreviewFixture(), records = graded.records.map(compiled => {
    const q = compiled.body.question;
    return { recordKey: key(q), groupKey: q.version + '/' + q.setId, actorKey: '', questionId: q.questionId, version: q.version,
      requestId: '', seq: 0, at: T0, payloadHash: p.T.hash(p.T.canonical(compiled.body)), body: plain(compiled.body) };
  });
  p.packages.publish({ snapshots: records, assignments: [], actors: {}, registry: [] }, { expiresAt: null });
  const stored = p.packages.open().findSnapshot({ questionId: 'check1', version: 'v1' });
  assert.equal(stored.body.confirmationGrading.checks[0].points, 3);
  const publicQ = M.publicQuestion(stored); assert.equal(publicQ.checkConfig.private, undefined); assert.equal(publicQ.confirmationGrading, undefined);
  assert.throws(() => M.build([headers, source, confirm({ runtimeConfig: JSON.stringify({ confirmationGrading: { schema: 1, version: 'bad', checks: [] } }) })], [], spec), /正式採点定義/);
});
