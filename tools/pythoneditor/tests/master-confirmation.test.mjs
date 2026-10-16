import test from 'node:test';
import assert from 'node:assert/strict';
import { createCloudFixture } from './cloud-fixture.mjs';
import { teacherPreviewFixture } from '../../../scripts/pythoneditor-preview-gas/tests/fixture.mjs';
import { MASTER_HEADERS, MASTER_LEGACY_HEADERS, masterRows, studentCatalog } from '../../../scripts/pythoneditor-master.mjs';

const plain = value => JSON.parse(JSON.stringify(value));
const spec = { setId: 'exercise', version: 'v1', gradingSheet: '採点設定py' };
const privateText = 'PRIVATE_EXPECTED_OUTPUT_ONLY_ON_SERVER';
const config = () => ({ cases: [{ id: 'greater', label: '6より大きい値', inputs: [{ index: 0, kind: 'integer', op: 'gt', value: 6 }] }],
  private: { expectedOutputs: { greater: { mode: 'lastLine', text: privateText } } } });
function row(values = {}, width = 22) {
  const result = Array(width).fill(''), headers = width === 18 ? MASTER_LEGACY_HEADERS : MASTER_HEADERS;
  const base = { questionId: 'q1', setId: 'exercise', order: 1, version: 'v1', title: 'コードを書く', prompt: '問題文',
    templateCode: 'print(input("値: "))', status: '編集中', runtimeConfig: '{}' };
  for (const [key, value] of Object.entries({ ...base, ...values })) {
    const index = headers.indexOf(key); assert.ok(index >= 0, key); result[index] = value;
  }
  return result;
}
function confirmation(values = {}) {
  return row({ questionId: 'check1', order: 2, title: '条件を試す', templateCode: '', kind: 'confirmation', codeRefs: 'q1@v1',
    checkType: 'inputCases', checkConfig: JSON.stringify(config()), ...values });
}
function build(rows = [row(), confirmation()], f = createCloudFixture()) {
  return { f, built: f.ctx.PythonEditorMaster.build([MASTER_HEADERS, ...rows], [], spec) };
}
function record(f, compiled) {
  const q = compiled.body.question, result = f.snapshot({ setId: q.setId, version: q.version, questionId: q.questionId });
  result.body = plain(compiled.body); result.payloadHash = f.T.hash(f.T.canonical(result.body)); return result;
}
function updateHash(f, value) { value.payloadHash = f.T.hash(f.T.canonical(value.body)); return value; }

test('18列・追加4列空欄・kind=codeは同一の採用本文とハッシュになる', () => {
  const f = createCloudFixture(), M = f.ctx.PythonEditorMaster;
  const legacy = M.build([MASTER_LEGACY_HEADERS, row({}, 18)], [], spec);
  for (const current of [row(), row({ kind: 'code' })]) {
    const next = M.build([MASTER_HEADERS, current], [], spec);
    assert.deepEqual(plain(next), plain(legacy));
    assert.equal(next.records[0].body.question.kind, 'code');
    assert.ok(!('confirmation' in next.records[0].body));
  }
  const oldObservation = { runtimeConfig: JSON.stringify({ hasOriginalInputCell: false, useExistingQuestionCode: 'q1' }), questionId: 'observe', order: 2, templateCode: '' };
  const before = M.build([MASTER_LEGACY_HEADERS, row({}, 18), row(oldObservation, 18)], [], spec);
  const after = M.build([MASTER_HEADERS, row(), row({ ...oldObservation, kind: 'code' })], [], spec);
  assert.deepEqual(plain(after), plain(before)); assert.equal(after.records[1].body.question.kind, 'observation');
});

test('確認設定の非公開期待値は採用本文に保持し、生徒向け問題から除く', () => {
  const { f, built } = build(), r = built.records[1];
  assert.equal(r.body.graded, false); assert.equal(r.body.ranges.length, 0); assert.deepEqual(plain(r.body.rules), {});
  assert.equal(r.body.confirmation.checkConfig.private.expectedOutputs.greater.text, privateText);
  const output = f.ctx.PythonEditorMaster.publicQuestion(r);
  assert.equal(output.kind, 'confirmation'); assert.equal(output.codeRefs[0].version, 'v1');
  assert.ok(!('private' in output.checkConfig)); assert.doesNotMatch(JSON.stringify(output), /PRIVATE_EXPECTED|answerCode|gradingVersion|sourceHash/);
  assert.equal(output.templateCode, ''); assert.equal(output.setupCode, '');
});

test('5方式の確認条件はそれぞれ宣言済みの型で配布され、未知のキーを受け付けない', () => {
  const cases = [
    ['inputCases', config()],
    ['resultCoverage', { results: ['北', '東', '南', '西'], requiredDistinct: 3, output: 'lastLine' }],
    ['attemptLimit', { range: { min: 1, max: 100 }, maxGuesses: 'theoretical', guessPrompt: '予想: ', successOutput: '正解', output: 'lastLine' }],
    ['compareRuns', { conditions: [{ id: 'before', label: '変更前' }, { id: 'after', label: '変更後' }], codePolicy: 'variants' }],
    ['answer', { format: 'number', question: '何回でしたか', private: { expectedAnswer: 7 } }]
  ];
  for (const [checkType, checkConfig] of cases) {
    const { built } = build([row(), confirmation({ checkType, checkConfig: JSON.stringify(checkConfig) })]);
    const q = built.records[1].body.question; assert.equal(q.checkType, checkType); assert.ok(!('private' in q.checkConfig));
    assert.throws(() => build([row(), confirmation({ checkType, checkConfig: JSON.stringify({ ...checkConfig, evaluator: 'arbitraryScript()' }) })]),
      error => error.pythonEditorCode === 'snapshot_invalid');
  }
});

test('旧採点ルールはコード問題にだけ従来どおり結合する', () => {
  const f = createCloudFixture(), rubric = [
    ['questionId', 'questionTitle', 'minLines', 'keywords1', 'outKeywords1', 'output'],
    ['q1', 'コード', 1, 'print', 'value', 'value']
  ];
  const source = row({ gradingVersion: 'grade-v1', scoringIds: 'q1', runtimeConfig: JSON.stringify({ scoringRanges: [{ regionId: 'whole', scoringId: 'q1', startMarker: null, endMarker: null }] }) });
  const built = f.ctx.PythonEditorMaster.build([MASTER_HEADERS, source, confirmation()], rubric, spec);
  assert.equal(built.records[0].body.graded, true); assert.equal(built.records[0].body.rules.q1.keywordsArr[0], 'print');
  assert.equal(built.records[1].body.graded, false); assert.deepEqual(plain(built.records[1].body.rules), {});
});

test('列名・列数・確認方式・JSON・採点の混在は採用前に拒否する', () => {
  const f = createCloudFixture(), M = f.ctx.PythonEditorMaster;
  for (const length of [17, 19, 21, 23]) assert.throws(() => M.build([Array(length).fill(''), row()], [], spec), /列/);
  const changed = [...MASTER_HEADERS]; changed[19] = 'refs'; assert.throws(() => M.build([changed, row()], [], spec), /列/);
  for (const change of [{ kind: 'other' }, { kind: 0 }, { kind: false }, { kind: '', codeRefs: 'q1@v1' }, { checkType: 'script' }, { checkConfig: '{' },
    { templateCode: 'print(1)' }, { setupCode: 'import random' }, { gradingVersion: 'grade-v1' }, { scoringIds: 'q1' },
    { runtimeConfig: JSON.stringify({ scoringRanges: [{ regionId: 'x' }] }) }]) {
    assert.throws(() => build([row(), confirmation(change)], f), error => error.pythonEditorCode === 'snapshot_invalid' && /check1|kind|列/.test(error.message));
  }
});

test('参照は同じセットのコードと明示版だけを受け付け、旧版を自動更新しない', () => {
  assert.equal(build([row({ version: 'v0' }), confirmation({ codeRefs: 'q1@v0' })]).built.records[0].body.question.codeRefs[0].version, 'v0');
  for (const change of [{ codeRefs: 'q1' }, { codeRefs: 'missing@v1' }, { codeRefs: 'q1@v2' }, { codeRefs: 'check1@v1' }])
    assert.throws(() => build([row(), confirmation(change)]), error => error.pythonEditorCode === 'snapshot_invalid');
  assert.throws(() => build([row({ setId: 'other' }), confirmation()]), error => error.pythonEditorCode === 'snapshot_invalid');
  assert.throws(() => build([row({ runtimeConfig: JSON.stringify({ hasOriginalInputCell: false }) }), confirmation()]), error => error.pythonEditorCode === 'snapshot_invalid');
});

test('正本読取は18列と22列のみ対応し、新列を含む数式と余剰列を拒否する', () => {
  const f = createCloudFixture(), M = f.ctx.PythonEditorMaster;
  for (const width of [18, 22]) {
    const headers = width === 18 ? MASTER_LEGACY_HEADERS : MASTER_HEADERS, rows = [headers, row({}, width)];
    const sheet = { getLastRow: () => 2, getLastColumn: () => width, getRange: () => ({ getValues: () => rows, getFormulas: () => rows.map(r => r.map(() => '')) }) };
    assert.equal(M.masterValues(sheet, 5001)[0].length, width);
    const raw = { sheets: [{ properties: { title: 'Python問題マスター' }, data: [{ rowData: rows.map(values => ({ values: values.map(stringValue => ({ userEnteredValue: { stringValue } })) })) }] }] };
    assert.equal(masterRows(raw)[0].length, width);
    if (width === 22) { raw.sheets[0].data[0].rowData[1].values[21].userEnteredValue = { formulaValue: '=A1' }; assert.throws(() => masterRows(raw), /数式/); }
  }
  assert.throws(() => masterRows([row(), row({}, 18)]), /列数/);
});

test('Nodeの配布投影も確認条件のprivateを除き、18列の旧動作を保持する', () => {
  const before = studentCatalog([MASTER_LEGACY_HEADERS, row({}, 18)]), after = studentCatalog([MASTER_HEADERS, row()]);
  assert.deepEqual(after, before); assert.equal(after.schema, 'python-editor-catalog-v1');
  const catalog = studentCatalog([MASTER_HEADERS, row(), confirmation()]), q = catalog.sets[0].questions[1];
  assert.equal(catalog.schema, 'python-editor-catalog-v2'); assert.equal(q.kind, 'confirmation'); assert.equal(q.checkType, 'inputCases'); assert.ok(!('private' in q.checkConfig));
  assert.doesNotMatch(JSON.stringify(catalog), /PRIVATE_EXPECTED|answerCode|sourceHash/);
  assert.throws(() => studentCatalog([MASTER_HEADERS, row(), confirmation({ codeRefs: 'q1@missing' })]), /参照元/);
});

test('圧縮配布は確認問題を保持し、sessionは公開条件だけを返す', () => {
  const { built } = build(), f = teacherPreviewFixture();
  f.state.groups = [{ setId: 'exercise', version: 'v1', records: plain(built.records) }];
  const meta = f.enable(), session = f.service.session(f.config.editorOrigin), q = session.catalog.sets[0].questions[1];
  assert.equal(session.catalog.schema, 'python-editor-catalog-v2');
  assert.equal(q.kind, 'confirmation'); assert.equal(q.checkType, 'inputCases'); assert.ok(!('private' in q.checkConfig));
  assert.doesNotMatch(JSON.stringify(session), /PRIVATE_EXPECTED|"rules"|"answerCode"/);
  assert.equal(f.packages.open().findSnapshot(q).body.confirmation.checkConfig.private.expectedOutputs.greater.text, privateText);
  assert.equal(meta.expiresAt, null); assert.equal(session.policies.length, 0);
});

test('圧縮パッケージはprivateの公開混入・正式採点・設定差異・参照欠落を拒否する', () => {
  const { built } = build();
  for (const mutate of [
    r => { r.body.question.checkConfig.private = config().private; },
    r => { r.body.graded = true; },
    r => { r.body.confirmation.checkConfig.cases[0].inputs[0].value = 7; },
    r => { r.body.question.codeRefs[0].version = 'v2'; r.body.confirmation.codeRefs[0].version = 'v2'; }
  ]) {
    const f = teacherPreviewFixture(), records = built.records.map(r => record(f, r));
    mutate(records[1]); updateHash(f, records[1]);
    assert.throws(() => f.packages.publish({ snapshots: records, assignments: [], actors: {}, registry: [] }, { expiresAt: null }), error => error.toolsStoreCode === 'packages_invalid');
    assert.equal(f.packages.head(), null);
  }
});

test('確認問題は正式提出と星評価から除外し、ブラウザの達成結果を得点にしない', () => {
  const { built } = build(), f = createCloudFixture(), body = plain(built.records[1].body);
  f.freeze(body);
  const session = f.dispatch('session'), policy = session.policies.find(p => p.questionId === 'check1');
  assert.equal(session.catalog.schema, 'python-editor-catalog-v2');
  assert.equal(policy.canSubmit, false); assert.ok(!session.ratings.some(r => r.questionId === 'check1'));
  const request = { ...f.submission(), questionId: 'check1' };
  assert.throws(() => f.dispatch('submit', request), error => error.pythonEditorCode === 'not_allowed');
  const f2 = createCloudFixture(); body.graded = true; f2.freeze(body);
  assert.throws(() => f2.dispatch('submit', request), error => error.pythonEditorCode === 'invalid_input');
  assert.equal(f2.store.requests(f2.P.gradeGroup(f2.environment.actor.key, f2.config.assignments[0], 'check1')).length, 0);
});
