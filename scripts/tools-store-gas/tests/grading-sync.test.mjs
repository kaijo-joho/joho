import test from 'node:test';
import assert from 'node:assert/strict';
import { syncFixture } from './grading-fixture.mjs';

const code = expected => error => error.toolsStoreCode === expected;
const spec = { setId: 'demo', version: 'v1', gradingSheet: '採点設定py' };
test('教員が固定採用版と授業権限だけを同期し、停止中grade経路は有効化しない', () => {
  const f = syncFixture(), preview = f.sync.preview();
  assert.equal(preview.counts.snapshots, 1); assert.equal(preview.counts.actors, 2); assert.equal(f.properties.writes.length, 0);
  const result = f.sync.sync(); assert.equal(result.state, 'published');
  const opened = f.packages.open();
  assert.equal(opened.actors[f.T.actorKey('student@example.test')].grade, 1);
  assert.equal(opened.registry[0].account, 'student@example.test');
  assert.equal(f.sourceConfig.enabled, false); assert.equal(f.state.created, 0);
  assert.equal(JSON.stringify(result).includes('PRIVATE_RULE_SENTINEL'), false);
  assert.equal(JSON.stringify(result).includes('student@example.test'), false);
});
test('無効既定・別人active/effective・不明教員では学校データを読まない', () => {
  const f = syncFixture(); f.setConfig({ enabled: false });
  assert.throws(() => f.sync.sync(), code('sync_disabled')); assert.equal(f.state.sourceReads, 0);
  f.setConfig({ enabled: true }); f.identity.active = 'student@example.test';
  assert.throws(() => f.sync.sync(), code('sync_not_allowed')); assert.equal(f.state.sourceReads, 0);
  f.identity.effective = 'student@example.test';
  assert.throws(() => f.sync.sync(), code('sync_not_allowed')); assert.equal(f.state.sourceReads, 0);
});
test('Commonがなくても教員owner設定で動き、存在する場合は二重照合する', () => {
  const f = syncFixture(); assert.equal(f.sync.preview().state, 'ready');
  f.env.commonTeachers = () => ['another-teacher@example.test'];
  assert.throws(() => f.sync.preview(), code('sync_not_allowed'));
});
test('全校1500名を検証し、保存先登録40名と教員だけを授業権限へ格納する', () => {
  const f = syncFixture();
  f.state.roster = [['userId', '年'], ...Array.from({ length: 1500 }, (_, i) => [`student${i}@example.test`, i % 6 + 1])];
  f.state.registry = [['userId', 'tools保存用GSSID'], ...Array.from({ length: 40 }, (_, i) => [`student${i}@example.test`, `synthetic_student_spreadsheet_${String(i).padStart(4, '0')}`])];
  const preview = f.sync.preview();
  assert.equal(preview.counts.actors, 41); assert.equal(preview.counts.stores, 40);
  f.sync.sync(); const opened = f.packages.open();
  assert.equal(Object.keys(opened.actors).length, 41);
  assert.equal(opened.actors[f.T.actorKey('student0@example.test')].grade, 1);
  assert.equal(opened.actors[f.T.actorKey('student39@example.test')].grade, 4);
  assert.equal(opened.actors[f.T.actorKey('teacher@example.test')].teacher, true);
  for (const i of [40, 500, 1499]) assert.equal(opened.actors[f.T.actorKey(`student${i}@example.test`)], undefined);
});
test('保存先未登録の名簿行も妥当性と重複を検証し、隠して同期を続けない', () => {
  for (const invalid of [['unregistered@example.test', 0], ['student@example.test', 2], ['unregistered@wrong.example', 1]]) {
    const f = syncFixture(), first = f.sync.sync(); f.state.roster.push(invalid);
    assert.throws(() => f.sync.sync(), code('sync_invalid_source'));
    assert.equal(f.packages.head().generation, first.meta.generation);
  }
});
test('保存先のない明示Common教員も許可domain分だけを授業権限へ含める', () => {
  const f = syncFixture();
  f.env.commonTeachers = () => ['teacher@example.test', 'second-teacher@example.test', 'outside-teacher@wrong.example'];
  f.sync.sync(); const opened = f.packages.open();
  assert.equal(Object.keys(opened.actors).length, 3);
  assert.equal(opened.actors[f.T.actorKey('second-teacher@example.test')].teacher, true);
  assert.equal(opened.actors[f.T.actorKey('outside-teacher@wrong.example')], undefined);
});
test('未固定版・未採用マスターへ逃げず旧activeを維持する', () => {
  const f = syncFixture(), first = f.sync.sync(); f.state.snapshots = [];
  assert.throws(() => f.sync.sync(), code('sync_snapshot_missing'));
  assert.equal(f.packages.open().meta.generation, first.meta.generation);
});
test('名簿/保存先の重複・見出し不正・本人未登録・権限読取拒否をfail-closedにする', () => {
  const mutations = [
    f => { f.state.roster.push(['student@example.test', 2, 'duplicate']); },
    f => { f.state.roster[0][0] = 'wrongId'; },
    f => { f.state.registry.push(['unknown@example.test', 'synthetic_spreadsheet_identifier_0002']); },
    f => { f.state.registry.push(['student@example.test', 'synthetic_spreadsheet_identifier_0002']); },
    f => { f.env.rosterRows = () => { throw new Error('synthetic permission denied'); }; }
  ];
  for (const mutate of mutations) {
    const f = syncFixture(), first = f.sync.sync(); mutate(f);
    assert.throws(() => f.sync.sync()); assert.equal(f.packages.head().generation, first.meta.generation);
  }
});
test('名簿が途中で変わる応答を採用せず、古い学年/資格で同期しない', () => {
  const f = syncFixture(), first = f.sync.sync(); let reads = 0;
  const original = f.env.rosterRows;
  f.env.rosterRows = id => { const rows = structuredClone(original(id)); if (++reads >= 2) rows[1][1] = 2; return rows; };
  assert.throws(() => f.sync.sync(), code('sync_source_changed'));
  assert.equal(f.packages.head().generation, first.meta.generation);
});
test('別の教員同期が先に公開した場合は遅れた同期のCASを拒否する', () => {
  const f = syncFixture(); f.sync.sync(); const original = f.env.rosterRows; let once = true, concurrent;
  f.env.rosterRows = id => { if (once) { once = false; concurrent = f.packages.publish(f.input()); } return original(id); };
  assert.throws(() => f.sync.sync(), code('packages_stale'));
  assert.equal(f.packages.head().generation, concurrent.generation);
});
test('教員トリガーのUID/handler/creator/activeを照合し、他人や偽eventを拒否する', () => {
  const f = syncFixture(); f.setConfig({ triggerEnabled: true });
  const installed = f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' });
  f.identity.active = '';
  assert.equal(f.sync.sync({ triggerUid: installed.uid }).state, 'published');
  assert.throws(() => f.sync.sync({ triggerUid: 'forged-uid' }), code('sync_not_allowed'));
  f.identity.active = 'student@example.test'; assert.throws(() => f.sync.sync({ triggerUid: installed.uid }), code('sync_not_allowed'));
  f.identity.active = ''; f.state.triggers = []; assert.throws(() => f.sync.sync({ triggerUid: installed.uid }), code('sync_not_allowed'));
});
test('triggerEnabledを切った後の既存trigger eventも同期を止める', () => {
  const f = syncFixture(); f.setConfig({ triggerEnabled: true }); const installed = f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' });
  f.setConfig({ triggerEnabled: false }); assert.throws(() => f.sync.sync({ triggerUid: installed.uid }), code('sync_trigger_disabled'));
});
test('installerは無効既定/明示確認を要求し、既存UIDを再利用して重複作成しない', () => {
  const f = syncFixture(); assert.throws(() => f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' }), code('sync_trigger_disabled')); assert.equal(f.state.created, 0);
  f.setConfig({ triggerEnabled: true }); assert.throws(() => f.sync.install({}), code('sync_invalid_config')); assert.equal(f.state.created, 0);
  const first = f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' }), second = f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' });
  assert.equal(first.uid, second.uid); assert.equal(second.state, 'existing'); assert.equal(f.state.created, 1); assert.equal(f.state.triggers[0].minutes, 60);
});
test('collectorは別の1分task/UIDを共用helperで検証できる', () => {
  const f = syncFixture(), task = { handler: 'runToolsGradingCollectionV1_', triggerKey: 'TOOLS_GRADING_COLLECTION_TRIGGER_V1', minutes: 1, confirmation: 'INSTALL_TOOLS_GRADING_COLLECTION_TRIGGER_V1' };
  assert.throws(() => f.sync.installTeacherTask(task, false), code('sync_trigger_disabled'));
  const installed = f.sync.installTeacherTask(task, true); f.identity.active = '';
  assert.equal(f.sync.authorizeTeacher({ triggerUid: installed.uid }, task).account, 'teacher@example.test');
  assert.throws(() => f.sync.authorizeTeacher({ triggerUid: installed.uid }), code('sync_not_allowed'));
});
test('installerの台帳書込前失敗は新規のowned triggerだけを片付ける', () => {
  const f = syncFixture(); f.setConfig({ triggerEnabled: true });
  f.properties.onWrite = key => key === 'TOOLS_GRADING_SYNC_TRIGGER_V1' ? 'before' : null;
  assert.throws(() => f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' })); assert.equal(f.state.created, 1); assert.equal(f.state.deleted, 1); assert.equal(f.state.triggers.length, 0);
});
test('installerの応答消失後はUID記録を読戻して同じtriggerを保持する', () => {
  const f = syncFixture(); f.setConfig({ triggerEnabled: true }); f.properties.onWrite = key => key === 'TOOLS_GRADING_SYNC_TRIGGER_V1' ? 'after' : null;
  assert.equal(f.sync.install({ confirmation: 'INSTALL_TOOLS_GRADING_SYNC_V1' }).state, 'installed'); assert.equal(f.state.created, 1); assert.equal(f.state.deleted, 0);
});
function adoption(f, sourceStatus = '採用済み') {
  const record = f.snapshot(); const built = { records: [{ body: record.body, payloadHash: record.payloadHash, sourceStatus }], digest: 'd'.repeat(64), canAdopt: sourceStatus !== '編集中' };
  f.env.readAdoption = () => built;
  let writes = 0;
  f.env.sourceStore = () => ({ snapshots: () => f.state.snapshots, putSnapshots(records, recheck) { recheck(); writes++; f.state.snapshots = records; return records; } });
  return { built, writes: () => writes, input: { spec, expectedDigest: built.digest, confirmation: 'ADOPT_TOOLS_GRADING_VERSION_V1' } };
}
test('manual採用previewは問題/解答を返さず、採用済みのdigestだけ明示固定する', () => {
  const f = syncFixture(), a = adoption(f), preview = f.sync.previewAdoption(spec);
  assert.equal(preview.canAdopt, true); assert.equal(a.writes(), 0); assert.equal(JSON.stringify(preview).includes('PRIVATE_RULE_SENTINEL'), false);
  const adopted = f.sync.adoptVersion(a.input);
  assert.equal(adopted.state, 'adopted'); assert.equal(a.writes(), 1); assert.equal(f.state.snapshots[0].adoptedBy, f.T.actorKey('teacher@example.test'));
  assert.equal(f.packages.head(), null);
});
test('編集中/古いdigest/確認なし/disabledはmasterを自動昇格せず固定保存しない', () => {
  const f = syncFixture(), a = adoption(f, '編集中');
  assert.throws(() => f.sync.adoptVersion(a.input), code('adoption_required')); assert.equal(a.writes(), 0); assert.equal(a.built.records[0].sourceStatus, '編集中');
  a.built.canAdopt = true; a.built.records[0].sourceStatus = '採用済み';
  assert.throws(() => f.sync.adoptVersion({ ...a.input, expectedDigest: 'c'.repeat(64) }), code('sync_source_changed'));
  assert.throws(() => f.sync.adoptVersion({ ...a.input, confirmation: 'not-confirmed' }), code('sync_invalid_source'));
  f.setConfig({ enabled: false }); assert.throws(() => f.sync.adoptVersion(a.input), code('sync_disabled')); assert.equal(a.writes(), 0);
});
test('採用のcommit直前に原本digestが変われば固定保存を停止する', () => {
  const f = syncFixture(), a = adoption(f); let reads = 0;
  f.env.readAdoption = () => ({ ...a.built, digest: ++reads > 1 ? 'c'.repeat(64) : a.built.digest });
  assert.throws(() => f.sync.adoptVersion(a.input), code('sync_source_changed')); assert.equal(a.writes(), 0);
});
test('manual採用後のoptional同期が失敗しても固定済みと公開失敗を区別する', () => {
  const f = syncFixture(), a = adoption(f); f.env.rosterRows = () => { throw new Error('synthetic private source denial'); };
  const result = f.sync.adoptVersion({ ...a.input, syncAfter: true });
  assert.equal(result.state, 'adopted'); assert.equal(result.sync.state, 'not_published'); assert.equal(f.packages.head(), null); assert.equal(a.writes(), 1);
  assert.equal(JSON.stringify(result).includes('synthetic private'), false);
});
