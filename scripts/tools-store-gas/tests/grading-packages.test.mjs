import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { gradingFixture, FakeGradingProperties } from './grading-fixture.mjs';

const code = expected => e => e.toolsStoreCode === expected;
const q = { questionId: 'q1', version: 'v1' };
const ACTIVE = 'TOOLS_GRADING_V1_ACTIVE';

test('gzip+Base64の固定版を原子的に公開し、本人/課題/保存先はserver-onlyで復元する', () => {
  const f = gradingFixture(), input = f.input(), meta = f.packages.publish(input, { expectedGeneration: null });
  const opened = f.packages.open({ expectedGeneration: meta.generation });
  assert.equal(opened.findSnapshot(q).payloadHash, input.snapshots[0].payloadHash);
  assert.equal(opened.snapshots('demo', 'v1').length, 1); assert.equal(opened.assignments[0].assignmentId, 'class-demo');
  assert.equal(opened.actors[f.T.actorKey('student@example.test')].grade, 1);
  assert.equal(opened.registry[0].spreadsheetId, input.registry[0].spreadsheetId);
  for (const [key, value] of f.properties.writes) { assert.equal(Buffer.byteLength(value) < 8000, true); assert.equal(value.includes('PRIVATE_RULE_SENTINEL'), false); }
  assert.equal(f.properties.writes.at(-1)[0], ACTIVE);
  assert.equal(f.lockState.acquired, f.lockState.released);
});
test('採用版bodyはserverに残し、public projectionには採点基準や名簿・保存先を含めない', () => {
  const f = gradingFixture(); f.packages.publish(f.input());
  const record = f.packages.open().findSnapshot(q), projected = f.context.PythonEditorMaster.publicQuestion(record);
  assert.equal(record.body.rules.example.keyword, 'PRIVATE_RULE_SENTINEL');
  const text = JSON.stringify(projected);
  for (const secret of ['PRIVATE_RULE_SENTINEL', 'adoptedBy', 'actors', 'spreadsheetId', 'rules']) assert.equal(text.includes(secret), false);
  assert.equal(projected.prompt, '問題文');
});
test('同じ版の基準変更・問題追加を拒否し、別版を追加しても旧版を保持する', () => {
  const f = gradingFixture(), first = f.packages.publish(f.input());
  for (const snapshots of [[f.snapshot({ rule: 'changed secret' })], [f.snapshot(), f.snapshot({ questionId: 'q2' })]]) assert.throws(() => f.packages.publish(f.input({ snapshots })), code('packages_conflict'));
  assert.equal(f.packages.head().generation, first.generation);
  f.packages.publish(f.input({ snapshots: [f.snapshot({ version: 'v2', rule: 'new version secret' })], assignments: [f.assignment({ version: 'v2' })] }));
  const opened = f.packages.open();
  assert.equal(opened.findSnapshot(q).body.rules.example.keyword, 'PRIVATE_RULE_SENTINEL');
  assert.equal(opened.findSnapshot({ ...q, version: 'v2' }).body.rules.example.keyword, 'new version secret');
});
test('staging途中の例外・読戻し破損では旧pointerと旧版を維持する', () => {
  for (const fault of ['before', 'after', 'corrupt']) {
    const f = gradingFixture(), first = f.packages.publish(f.input());
    let once = true; f.properties.onWrite = key => key !== ACTIVE && once ? (once = false, fault) : null;
    assert.throws(() => f.packages.publish(f.input({ snapshots: [f.snapshot({ version: 'v2' })], assignments: [f.assignment({ version: 'v2' })] })), e => ['packages_invalid', 'packages_write_uncertain'].includes(e.toolsStoreCode));
    f.properties.onWrite = null;
    assert.equal(f.packages.open().meta.generation, first.generation); assert.equal(f.packages.open().findSnapshot(q).version, 'v1');
    assert.equal(Object.keys(f.properties.values).some(key => key.includes('00000000000000000000000000000002')), false);
  }
});
test('pointer書込前の失敗は旧版、書込後の応答消失は新世代の読戻しで成功を確定する', () => {
  const f = gradingFixture(), first = f.packages.publish(f.input());
  f.properties.onWrite = key => key === ACTIVE ? 'before' : null;
  assert.throws(() => f.packages.publish(f.input()), code('packages_write_uncertain'));
  assert.equal(f.packages.head().generation, first.generation);
  f.properties.onWrite = key => key === ACTIVE ? 'after' : null;
  const second = f.packages.publish(f.input());
  f.properties.onWrite = null;
  assert.equal(f.packages.open().meta.generation, second.generation); assert.notEqual(second.generation, first.generation);
});
test('期限切れ・未来の発行時刻・破損・古い期待世代はfallbackせず拒否する', () => {
  const f = gradingFixture(), first = f.packages.publish(f.input());
  assert.throws(() => f.packages.open({ expectedGeneration: 'f'.repeat(32) }), code('packages_stale'));
  f.advance(7200000); assert.throws(() => f.packages.open(), code('packages_expired'));
  assert.equal(f.packages.head().generation, first.generation);
  const renewed = f.packages.publish(f.input(), { expectedGeneration: first.generation }); assert.notEqual(renewed.generation, first.generation);
  f.advance(-31000); assert.throws(() => f.packages.open(), code('packages_expired')); f.advance(31000);
  const part = Object.keys(f.properties.values).find(key => key.includes(renewed.generation) && key.includes('_P_'));
  f.properties.values[part] = f.properties.values[part].slice(1);
  assert.throws(() => f.packages.open(), code('packages_invalid'));
});
test('読取中のpointer切替と遅れたpublish要求を拒否する', () => {
  const f = gradingFixture(), first = f.packages.publish(f.input()), firstRaw = f.properties.values[ACTIVE];
  const second = f.packages.publish(f.input()), secondRaw = f.properties.values[ACTIVE];
  assert.throws(() => f.packages.publish(f.input(), { expectedGeneration: first.generation }), code('packages_stale'));
  f.properties.values[ACTIVE] = firstRaw;
  f.properties.onRead = key => { if (key === ACTIVE) f.properties.values[ACTIVE] = secondRaw; };
  assert.throws(() => f.packages.open(), code('packages_stale')); f.properties.onRead = null;
  assert.equal(f.packages.open().meta.generation, second.generation);
});
test('beforeCommitの権限再検証失敗では新世代を有効にしない', () => {
  const f = gradingFixture(), first = f.packages.publish(f.input());
  assert.throws(() => f.packages.publish(f.input(), { beforeCommit: () => f.T.fail('sync_source_changed', 'safe message') }), code('sync_source_changed'));
  assert.equal(f.packages.head().generation, first.generation);
});
test('他の設定と既存世代を含む450KBの上限は書込前に拒否する', () => {
  const properties = new FakeGradingProperties();
  for (let i = 0; i < 64; i++) properties.values['FOREIGN_CONFIG_' + i] = 'x'.repeat(7000);
  const f = gradingFixture({ properties });
  const before = JSON.stringify(properties.values);
  assert.throws(() => f.packages.publish(f.input()), code('packages_capacity'));
  assert.equal(JSON.stringify(properties.values), before); assert.equal(properties.writes.length, 0);
  const g = gradingFixture(); const large = g.input({ snapshots: [g.snapshot({ prompt: randomBytes(90000).toString('base64') })] });
  g.packages.publish(large); g.packages.publish(large);
  for (let i = 0; i < 15; i++) g.properties.values['FOREIGN_CONFIG_' + i] = 'x'.repeat(7000);
  const current = g.packages.head().generation;
  assert.throws(() => g.packages.publish(large), code('packages_capacity'));
  assert.equal(g.packages.open().meta.generation, current);
});
test('TTLを12回更新してもactiveと直前世代だけを保持し、旧採用版を失わない', () => {
  const f = gradingFixture(); f.properties.values.FOREIGN_KEEP = 'unchanged';
  f.packages.publish(f.input());
  const current = f.input({ snapshots: [f.snapshot({ version: 'v2' })], assignments: [f.assignment({ version: 'v2' })] });
  let size = 0;
  for (let i = 0; i < 12; i++) {
    f.advance(3600000); f.packages.publish(current);
    const generations = new Set(Object.keys(f.properties.values).map(key => /^TOOLS_GRADING_V1_G_([a-f0-9]{32})_/.exec(key)?.[1]).filter(Boolean));
    assert.equal(generations.size, 2);
    const next = Buffer.byteLength(JSON.stringify(f.properties.values));
    if (size) assert.equal(Math.abs(next - size) < 500, true); size = next;
    assert.equal(f.packages.open().findSnapshot(q).version, 'v1'); assert.equal(f.properties.values.FOREIGN_KEEP, 'unchanged');
  }
});
test('GC失敗は現行を保持し、次回stage前に再試行して不要世代を回収する', () => {
  const f = gradingFixture(); f.packages.publish(f.input()); f.packages.publish(f.input());
  f.properties.onDelete = () => true; const third = f.packages.publish(f.input());
  assert.equal(f.packages.open().meta.generation, third.generation);
  let generations = new Set(Object.keys(f.properties.values).map(key => /^TOOLS_GRADING_V1_G_([a-f0-9]{32})_/.exec(key)?.[1]).filter(Boolean));
  assert.equal(generations.size, 3);
  f.properties.onDelete = null; f.packages.publish(f.input());
  generations = new Set(Object.keys(f.properties.values).map(key => /^TOOLS_GRADING_V1_G_([a-f0-9]{32})_/.exec(key)?.[1]).filter(Boolean));
  assert.equal(generations.size, 2);
});
test('未採用master形・hash不一致・別人保存先・不正policyを拒否して機密値をエラーへ出さない', () => {
  const f = gradingFixture();
  const invalid = [f.input({ snapshots: [{ body: f.snapshot().body, payloadHash: f.snapshot().payloadHash, sourceStatus: '編集中' }] }), f.input({ snapshots: [{ ...f.snapshot(), payloadHash: '0'.repeat(64) }] }), f.input({ registry: [{ account: 'unknown@example.test', spreadsheetId: 'synthetic_spreadsheet_identifier_0002' }] }), f.input({ assignments: [f.assignment({ dueAt: 'invalid private due' })] }), f.input({ actors: { [f.T.actorKey('student@example.test')]: { grade: 1, teacher: false, name: 'PRIVATE_NAME_SENTINEL' } } })];
  for (const input of invalid) assert.throws(() => f.packages.publish(input), error => { assert.equal(error.message.includes('PRIVATE'), false); assert.equal(error.message.includes('private due'), false); return !!error.toolsStoreCode; });
  assert.equal(f.properties.writes.length, 0);
});
test('読取結果を書き換えてもserver内の固定版を変更できない', () => {
  const f = gradingFixture(); f.packages.publish(f.input()); const opened = f.packages.open();
  opened.findSnapshot(q).body.rules.example.keyword = 'mutated'; opened.assignments[0].enabled = false;
  assert.equal(opened.findSnapshot(q).body.rules.example.keyword, 'PRIVATE_RULE_SENTINEL'); assert.equal(f.packages.open().assignments[0].enabled, true);
});
