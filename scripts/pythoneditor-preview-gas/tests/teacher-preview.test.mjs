import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import vm from 'node:vm';
import { teacherPreviewFixture as fixture, TEACHER, DEMO } from './fixture.mjs';
const plain = value => JSON.parse(JSON.stringify(value));
const code = expected => error => error.previewCode === expected;
const ADDITIONAL_TEACHER = 'second-teacher+fixture@gfe.kaijo.ed.jp';

test('ページtitleにA基本問題・B応用問題・演習問題を付け、章番号の区切りだけを揃える', () => {
  const f = fixture(), title = f.context.ToolsTeacherPreview.setTitle;
  const pages = { py23: '2-3. 繰り返し処理（while文）②', py33: '3-3_2次元リスト' };
  assert.equal(title('py23a', pages), '2-3_繰り返し処理（while文）② A基本問題');
  assert.equal(title('py23b', pages), '2-3_繰り返し処理（while文）② B応用問題');
  assert.equal(title('py23', pages), '2-3_繰り返し処理（while文）② 演習問題');
  assert.equal(title('py33a', pages), '3-3_2次元リスト A基本問題');
  for (const [id, values] of [['py23c', pages], ['py24a', pages], ['py23a', { py23: '' }], ['py23a', { py23: '行\n改行' }], ['py23a', { py23: '長'.repeat(300) }]]) {
    assert.throws(() => title(id, values), code('preview_invalid'));
  }
});
function sourceFixture() {
  const f = fixture(), pages = [['title', 'note', 'id'], ['2-3. 繰り返し処理（while文）②', '', 'py23'], ['', '', 'py94']];
  const master = [plain(f.context.PythonEditorMaster.headers), ...['py23a', 'py23b', 'py23'].map(id => {
    const row = Array(18).fill(''); row[1] = id; row[3] = 'v1'; return row;
  })];
  const data = { 'Python問題マスター': master, '採点設定py': [Array(15).fill('')], 'ページ一覧': pages }, reads = [];
  const sheet = (name, rows) => ({ getLastRow: () => rows.length, getLastColumn: () => rows[0].length,
    getRange(row, column, height, width) {
      reads.push({ name, row, column, height, width });
      return { getValues: () => rows.slice(row - 1, row - 1 + height).map(r => r.slice(column - 1, column - 1 + width)), getFormulas: () => Array.from({ length: height }, () => Array(width).fill('')) };
    } });
  f.context.PropertiesService = { getScriptProperties: () => f.properties };
  f.context.SpreadsheetApp = { openById(id) { assert.equal(id, f.config.sourceFileListId); return { getSheetByName: name => data[name] && sheet(name, data[name]) }; } };
  f.context.PythonEditorMaster.build = (_master, _rules, spec) => ({ records: [f.snapshot(spec)], digest: 'a'.repeat(64) });
  return { ...f, pages, reads, sourceEnv: f.context.toolsTeacherPreviewEnvironment_() };
}
test('正本読取は列名でid・titleを照合し、表示名の変更も配信digestに含める', () => {
  const f = sourceFixture(), before = f.sourceEnv.readSource(f.config);
  assert.deepEqual(plain(before.groups.map(g => g.title)), [
    '2-3_繰り返し処理（while文）② 演習問題', '2-3_繰り返し処理（while文）② A基本問題', '2-3_繰り返し処理（while文）② B応用問題'
  ]);
  assert.deepEqual(f.reads.filter(r => r.name === 'ページ一覧'), [
    { name: 'ページ一覧', row: 1, column: 1, height: 1, width: 3 },
    { name: 'ページ一覧', row: 2, column: 3, height: 2, width: 1 },
    { name: 'ページ一覧', row: 2, column: 1, height: 2, width: 1 }
  ]);
  f.pages[1][0] += ' 改訂'; const after = f.sourceEnv.readSource(f.config);
  assert.notEqual(after.digest, before.digest);
  assert.deepEqual(plain(after.groups.map(g => g.records)), plain(before.groups.map(g => g.records)));
  f.pages.push(['重複', '', 'py23']);
  assert.throws(() => f.sourceEnv.readSource(f.config), e => e.pythonEditorCode === 'snapshot_invalid');
  f.pages.pop(); f.pages[1][0] = '';
  assert.throws(() => f.sourceEnv.readSource(f.config), code('preview_invalid'));
});
test('表示名だけの再配信は同じ版の問題を保持し、接続時に正本を読まない', () => {
  const f = fixture(); f.state.groups[0].title = '初回の表示名'; const initial = f.enable();
  const before = plain(f.service.session(f.config.editorOrigin).catalog.sets[0]);
  f.state.groups[0].title = '変更後の表示名'; const next = f.publish(), reads = f.state.reads;
  const after = plain(f.service.session(f.config.editorOrigin).catalog.sets[0]);
  assert.notEqual(initial.sourceDigest, next.sourceDigest); assert.notEqual(initial.generation, next.generation);
  assert.equal(before.title, '初回の表示名'); assert.equal(after.title, '変更後の表示名');
  assert.deepEqual(after.questions, before.questions); assert.equal(f.state.reads, reads);
  const key = f.context.ToolsTeacherPreview.keys.index, index = JSON.parse(f.properties.getProperty(key));
  delete index.groups[0].title; f.properties.setProperty(key, f.T.canonical(index));
  assert.equal(f.service.session(f.config.editorOrigin).catalog.sets[0].title, 'demo');
  index.groups[0].title = ''; f.properties.setProperty(key, f.T.canonical(index));
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_invalid'));
});
test('表示名が配信中に変わった場合と、indexの容量超過では現行世代を保持する', () => {
  const f = fixture(), initial = f.enable(), expected = f.service.preview().digest;
  let reads = 0;
  f.state.onRead = () => { if (++reads === 2) f.state.groups[0].title = '途中で変更'; };
  assert.throws(() => f.service.publish({ expectedDigest: expected, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }), code('preview_changed'));
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
  f.state.onRead = null;
  f.state.groups = Array.from({ length: 10 }, (_, i) => ({ setId: 'set-' + i, title: '長'.repeat(290), version: 'v1', records: [f.snapshot({ setId: 'set-' + i, questionId: 'q' + i })] }));
  assert.throws(() => f.publish(), code('preview_capacity'));
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
});

test('教員のプレビューは読取だけで、採用・設定・圧縮データを変えない', () => {
  const f = fixture(), before = JSON.stringify(f.properties.values);
  const plan = plain(f.service.preview());
  assert.equal(plan.questions, 1); assert.equal(plan.enabled, false); assert.equal(f.state.reads, 1);
  assert.equal(JSON.stringify(f.properties.values), before); assert.equal(f.properties.writes.length, 0);
  assert.doesNotMatch(JSON.stringify(plan), /PRIVATE_RULE_SENTINEL|templateCode|prompt|rules|sourceFileListId/);
});
test('圧縮配信は教員だけに問題を投影し、解答・基準や保存先を返さない', () => {
  const f = fixture(), meta = f.enable(), reads = f.state.reads;
  const result = plain(f.service.rpc('session', {}, f.config.editorOrigin));
  assert.equal(result.account, TEACHER); assert.equal(result.teacher, true); assert.equal(result.preview.readOnly, true);
  assert.equal(result.preview.generation, meta.generation); assert.equal(result.catalog.sets[0].questions[0].templateCode, 'print(1)');
  assert.deepEqual(result.policies, []); assert.deepEqual(result.ratings, []); assert.equal(f.state.reads, reads);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RULE_SENTINEL|"rules"|"ranges"|"answerCode"|"explanation"|"registry"|"sourceHash"|"adoptedBy"/);
  assert.ok(Object.keys(f.properties.values).some(k => /_P_000$/.test(k)));
});
test('明示したデモ用アカウントは配布だけ利用でき、管理者や教員として扱わない', () => {
  const f = fixture(), meta = f.enable(), reads = f.state.reads, writes = f.properties.writes.length;
  Object.assign(f.identity, { active: DEMO, effective: DEMO });
  const result = plain(f.service.rpc('session', {}, f.config.editorOrigin));
  assert.equal(result.account, DEMO); assert.equal(result.actorKey, f.T.actorKey(DEMO));
  assert.equal(result.teacher, false); assert.equal(result.preview.viewerRole, 'demo');
  assert.equal(result.catalog.sets[0].questions.length, 1); assert.deepEqual(result.policies, []);
  assert.throws(() => f.service.preview(), code('preview_not_allowed'));
  assert.throws(() => f.service.publish({ expectedDigest: meta.sourceDigest, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }), code('preview_not_allowed'));
  assert.throws(() => f.service.setEnabled(false), code('preview_not_allowed'));
  assert.equal(f.state.reads, reads); assert.equal(f.properties.writes.length, writes);
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RULE_SENTINEL|"rules"|"answerCode"/);
});
test('追加教員は教員表示で配布だけ利用でき、所有教員の管理操作は実行できない', () => {
  const f = fixture();
  f.config.teacherAccounts.push(ADDITIONAL_TEACHER);
  f.properties.setProperty(f.context.ToolsTeacherPreview.keys.config, f.T.canonical(f.config));
  const meta = f.enable(), reads = f.state.reads, writes = f.properties.writes.length;
  Object.assign(f.identity, { active: ADDITIONAL_TEACHER, effective: ADDITIONAL_TEACHER });
  const result = plain(f.service.rpc('session', {}, f.config.editorOrigin));
  assert.equal(result.account, ADDITIONAL_TEACHER); assert.equal(result.teacher, true);
  assert.equal(result.preview.viewerRole, 'teacher'); assert.equal(result.preview.generation, meta.generation);
  assert.equal(result.catalog.sets[0].questions[0].templateCode, 'print(1)');
  assert.doesNotMatch(JSON.stringify(result), /PRIVATE_RULE_SENTINEL|"rules"|"answerCode"/);
  assert.throws(() => f.service.preview(), code('preview_not_allowed'));
  assert.throws(() => f.service.publish({ expectedDigest: meta.sourceDigest, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }), code('preview_not_allowed'));
  assert.throws(() => f.service.setEnabled(false), code('preview_not_allowed'));
  assert.throws(() => f.service.rpc('submit', {}, f.config.editorOrigin), code('preview_action_denied'));
  Object.assign(f.identity, { active: ADDITIONAL_TEACHER, effective: TEACHER });
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_not_allowed'));
  assert.equal(f.state.reads, reads); assert.equal(f.properties.writes.length, writes);
  Object.assign(f.identity, { active: TEACHER, effective: TEACHER });
  assert.equal(f.service.preview().questions, 1);
  assert.equal(f.service.setEnabled(false).enabled, false);
});
test('追加教員の重複・学校外・デモ兼用・人数超過を拒否する', () => {
  for (const teachers of [[], [TEACHER, TEACHER], [TEACHER, 'teacher@example.invalid'], [TEACHER, DEMO], [TEACHER, ADDITIONAL_TEACHER, 'third+fixture@gfe.kaijo.ed.jp']]) {
    const f = fixture();
    f.properties.setProperty(f.context.ToolsTeacherPreview.keys.config, f.T.canonical({ ...f.config, teacherAccounts: teachers }));
    assert.throws(() => f.service.preview(), code('preview_invalid'));
  }
});
test('無効状態、非教員、別の教員、実行主体の不一致、空の本人を拒否する', () => {
  const f = fixture(); f.publish();
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_disabled'));
  for (const [active, effective] of [
    ['student+fixture@gfe.kaijo.ed.jp', 'student+fixture@gfe.kaijo.ed.jp'],
    ['other-teacher+fixture@gfe.kaijo.ed.jp', 'other-teacher+fixture@gfe.kaijo.ed.jp'],
    [TEACHER, 'other-teacher+fixture@gfe.kaijo.ed.jp'], ['', TEACHER]
  ]) {
    Object.assign(f.identity, { active, effective });
    assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_not_allowed'));
    assert.throws(() => f.service.preview(), code('preview_not_allowed'));
  }
});
test('origin、channel、入口種別を検証し、保存・採点RPCは有効化後も拒否する', () => {
  const f = fixture(); f.enable();
  const valid = { kind: 'pythoneditor', origin: f.config.editorOrigin, channel: 'a'.repeat(64) };
  assert.deepEqual(plain(f.service.boot(valid)), { origin: valid.origin, channel: valid.channel });
  for (const change of [{ origin: 'https://other.invalid' }, { channel: 'a' }, { kind: 'toolsstore' }]) assert.throws(() => f.service.boot({ ...valid, ...change }), code('preview_not_allowed'));
  assert.throws(() => f.service.session('https://other.invalid'), code('preview_not_allowed'));
  const writes = f.properties.writes.length;
  for (const action of ['submit', 'saveDraft', 'getDraft', 'listDrafts', 'getSubmission', 'resumeSubmission', 'questionStatus', 'gradingSession']) {
    assert.throws(() => f.service.rpc(action, {}, valid.origin), code('preview_action_denied'));
  }
  assert.throws(() => f.service.rpc('session', { teacher: true }, valid.origin), code('preview_action_denied'));
  assert.equal(f.properties.writes.length, writes);
});
test('指定アカウントの期限なし配布は長期間後も同じ版を返し、対象外と停止中は拒否する', () => {
  const f = fixture(); f.config.teacherAccounts.push(ADDITIONAL_TEACHER);
  f.properties.setProperty(f.context.ToolsTeacherPreview.keys.config, f.T.canonical(f.config));
  const initial = f.enable(), reads = f.state.reads, writes = f.properties.writes.length;
  assert.equal(initial.expiresAt, null); assert.equal(f.packages.head().expiresAt, null);
  for (const elapsed of [7200001, 400 * 86400000]) {
    f.advance(elapsed);
    for (const account of [TEACHER, ADDITIONAL_TEACHER, DEMO]) {
      Object.assign(f.identity, { active: account, effective: account });
      const result = f.service.session(f.config.editorOrigin);
      assert.equal(result.preview.expiresAt, null); assert.equal(result.preview.generation, initial.generation);
      assert.equal(result.catalog.sets[0].questions[0].version, 'v1');
    }
  }
  assert.equal(f.state.reads, reads); assert.equal(f.properties.writes.length, writes);
  Object.assign(f.identity, { active: 'other+fixture@gfe.kaijo.ed.jp', effective: 'other+fixture@gfe.kaijo.ed.jp' });
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_not_allowed'));
  Object.assign(f.identity, { active: TEACHER, effective: TEACHER }); f.service.setEnabled(false);
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_disabled'));
});
test('通常の採点パッケージは期限なしを拒否し、既定の期限切れ判定を維持する', () => {
  const f = fixture(), defaults = { ...f.dependencies }; delete defaults.allowNoExpiry;
  const regular = f.context.ToolsGradingPackages.create(defaults);
  const input = { snapshots: [f.snapshot()], assignments: [], actors: {}, registry: [] };
  assert.throws(() => regular.publish(input, { expiresAt: null }), e => e.toolsStoreCode === 'packages_invalid');
  assert.equal(regular.head(), null);
  const meta = regular.publish(input); assert.equal(meta.expiresAt, f.now() + 7200000);
  assert.equal(regular.open().meta.generation, meta.generation); f.advance(7200001);
  assert.throws(() => regular.open(), e => e.toolsStoreCode === 'packages_expired');
  const forever = f.packages.publish(input, { expiresAt: null }); assert.equal(forever.expiresAt, null);
  assert.throws(() => regular.open(), e => e.toolsStoreCode === 'packages_invalid');
});
test('旧期限付き配信は期限を尊重し、再配信で期限なしへ移行できる', () => {
  const f = fixture(), initial = f.enable(), actors = {}; actors[f.T.actorKey(TEACHER)] = { grade: null, teacher: true };
  const old = f.packages.publish({ snapshots: [f.snapshot()], assignments: [], actors, registry: [] }, { expectedGeneration: initial.generation, expiresAt: f.now() + 1000 });
  const indexKey = f.context.ToolsTeacherPreview.keys.index, index = JSON.parse(f.properties.getProperty(indexKey));
  index.generation = old.generation; f.properties.setProperty(indexKey, f.T.canonical(index));
  assert.equal(f.service.session(f.config.editorOrigin).preview.expiresAt, new Date(old.expiresAt).toISOString());
  f.advance(1001); assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_expired'));
  const next = f.publish(); assert.equal(next.expiresAt, null);
  assert.equal(f.service.session(f.config.editorOrigin).preview.expiresAt, null);
});
test('同じID・版の本文変更は拒否し、直前の配信を保持する', () => {
  const f = fixture(), initial = f.enable();
  f.state.groups[0].records = [f.snapshot({ prompt: '変更された本文' })];
  assert.throws(() => f.publish(), e => e.toolsStoreCode === 'packages_conflict');
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
  assert.equal(f.service.session(f.config.editorOrigin).catalog.sets[0].questions[0].prompt, '問題文');
});
test('別セットで同じID・版を重複させた配信を拒否し、異なる版は独立して配信する', () => {
  const f = fixture(), initial = f.enable(), protectedState = JSON.stringify(f.properties.values);
  f.state.groups.push({ setId: 'demo-other', version: 'v1', records: [f.snapshot({ setId: 'demo-other' })] });
  assert.throws(() => f.publish(), e => e.toolsStoreCode === 'packages_invalid');
  assert.equal(JSON.stringify(f.properties.values), protectedState);
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
  f.state.groups[1] = { setId: 'demo-other', version: 'v2', records: [f.snapshot({ setId: 'demo-other', version: 'v2' })] };
  const next = f.publish(), result = plain(f.service.session(f.config.editorOrigin));
  assert.notEqual(next.generation, initial.generation);
  assert.equal(result.catalog.sets.find(s => s.setId === 'demo-other').questions[0].version, 'v2');
});
test('圧縮中に正本が変われば切替を拒否し、現行のデータを保持する', () => {
  const f = fixture(), initial = f.enable(), expected = f.service.preview().digest;
  let n = 0;
  f.state.onRead = () => { if (++n === 2) f.state.groups.push({ setId: 'demo-next', version: 'v2', records: [f.snapshot({ setId: 'demo-next', version: 'v2', questionId: 'q2' })] }); };
  assert.throws(() => f.service.publish({ expectedDigest: expected, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }), code('preview_changed'));
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
});
test('indexの世代ずれと圧縮破損で停止し、教員用停止操作は保存データを消さない', () => {
  const f = fixture(); f.enable();
  const key = f.context.ToolsTeacherPreview.keys.index, original = f.properties.values[key], index = JSON.parse(original);
  index.generation = 'f'.repeat(32); f.properties.values[key] = JSON.stringify(index);
  assert.throws(() => f.service.session(f.config.editorOrigin), e => e.toolsStoreCode === 'packages_stale');
  f.properties.values[key] = original;
  const part = Object.keys(f.properties.values).find(k => /_P_000$/.test(k));
  const saved = f.properties.values[part]; f.properties.values[part] = 'AAAA';
  assert.throws(() => f.service.session(f.config.editorOrigin), e => e.toolsStoreCode === 'packages_invalid');
  f.properties.values[part] = saved;
  const keys = Object.keys(f.properties.values); f.service.setEnabled(false);
  assert.deepEqual(Object.keys(f.properties.values), keys);
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_disabled'));
});
test('配備コピーは私有領域へ生成し、新旧のGASや設定を操作しない', async () => {
  const root = await mkdtemp('/private/tmp/pythoneditor-preview-prepare-test-');
  try {
    const settings = join(root, 'settings.json'), out = join(root, 'gas');
    await writeFile(settings, JSON.stringify({ editorOrigin: 'https://example.invalid', sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccount: TEACHER, demoAccount: DEMO, gradingSheet: '採点設定py' }));
    const command = [new URL('../../prepare-pythoneditor-preview-gas.mjs', import.meta.url).pathname, '--settings', settings, '--out', out];
    const result = JSON.parse(execFileSync(process.execPath, command, { encoding: 'utf8' }));
    assert.equal(result.remoteChanged, false); assert.equal(result.settingsEnabled, false);
    const names = await readdir(out); assert.ok(!names.includes('.clasp.json'));
    assert.deepEqual(names.filter(name => name.endsWith('.js')).sort(), [
      '00_teacher_preview.js', '05_tools_store_contract.js', '06_python_editor_contract.js',
      '13_python_editor_grader.js', '30_grading_packages.js', '46_python_editor_master.js', '99_private_setup.js'
    ]);
    assert.equal(await readFile(join(out, '.claspignore'), 'utf8'), '**/**\n!**/*.js\n!**/*.html\n!appsscript.json\n');
    const manifest = JSON.parse(await readFile(join(out, 'appsscript.json')));
    assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING'); assert.equal(manifest.webapp.access, 'DOMAIN');
    assert.equal(manifest.oauthScopes.length, 2); assert.ok(!manifest.oauthScopes.some(s => /drive|script\.scriptapp/.test(s)));
    const bridge = await readFile(join(out, '21_python_editor_bridge.html'), 'utf8');
    assert.match(bridge, /new Set\(\['session'\]\)/); assert.match(bridge, /teacherPythonPreviewRpc\(data.action,data.input \|\| \{\},data.actorKey,boot.origin\)/);
    const review = JSON.parse(await readFile(join(out, 'DEPLOYMENT_REVIEW.json')));
    assert.equal(review.teacherAccounts, 1); assert.equal(review.demoAccounts, 1);
    assert.equal(review.deployed, false); assert.equal(review.permissionsChanged, false); assert.equal(review.adoptsProblems, false);
    const f = fixture();
    f.context.Session = { getActiveUser: () => ({ getEmail: () => f.identity.active }), getEffectiveUser: () => ({ getEmail: () => f.identity.effective }) };
    f.context.PropertiesService = { getScriptProperties: () => f.properties };
    f.context.console = { log() {} };
    f.context.toolsTeacherPreviewEnvironment_ = () => f.env;
    vm.runInContext(await readFile(join(out, '99_private_setup.js'), 'utf8'), f.context);
    f.context.run_setupTeacherPreview();
    f.enable();
    const protectedState = JSON.stringify(f.properties.values), reads = f.state.reads;
    for (const viewer of [DEMO, 'other+fixture@gfe.kaijo.ed.jp']) {
      Object.assign(f.identity, { active: viewer, effective: viewer });
      for (const name of ['run_setupTeacherPreview', 'run_inspectTeacherCatalog', 'run_publishTeacherCatalog', 'run_enableTeacherPreview', 'run_stopTeacherPreview']) {
        assert.equal(typeof f.context[name], 'function');
        assert.throws(() => f.context[name](), undefined, `${viewer}: ${name}`);
      }
    }
    assert.equal(JSON.stringify(f.properties.values), protectedState); assert.equal(f.state.reads, reads);
    const originalManifest = await readFile(join(out, 'appsscript.json'), 'utf8');
    assert.throws(() => execFileSync(process.execPath, command, { encoding: 'utf8', stdio: 'pipe' }));
    assert.equal(await readFile(join(out, 'appsscript.json'), 'utf8'), originalManifest);
  } finally { await rm(root, { recursive: true, force: true }); }
});
test('追加教員の私有設定から再生成でき、実メールは公開ソースへ埋め込まない', async () => {
  const root = await mkdtemp('/private/tmp/pythoneditor-preview-additional-teacher-test-');
  try {
    const settings = join(root, 'settings.json'), out = join(root, 'gas');
    await writeFile(settings, JSON.stringify({ editorOrigin: 'https://example.invalid', sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccount: TEACHER, additionalTeacherAccount: ADDITIONAL_TEACHER, demoAccount: DEMO, gradingSheet: '採点設定py' }));
    const result = JSON.parse(execFileSync(process.execPath, [new URL('../../prepare-pythoneditor-preview-gas.mjs', import.meta.url).pathname, '--settings', settings, '--out', out], { encoding: 'utf8' }));
    assert.equal(result.remoteChanged, false);
    const review = JSON.parse(await readFile(join(out, 'DEPLOYMENT_REVIEW.json')));
    assert.equal(review.teacherAccounts, 2); assert.equal(review.demoAccounts, 1); assert.equal(review.permissionsChanged, false);
    const f = fixture(); f.properties.values = {};
    f.context.Session = { getActiveUser: () => ({ getEmail: () => f.identity.active }), getEffectiveUser: () => ({ getEmail: () => f.identity.effective }) };
    f.context.PropertiesService = { getScriptProperties: () => f.properties }; f.context.console = { log() {} };
    vm.runInContext(await readFile(join(out, '99_private_setup.js'), 'utf8'), f.context);
    f.context.run_setupTeacherPreview();
    const config = JSON.parse(f.properties.getProperty(f.context.ToolsTeacherPreview.keys.config));
    assert.deepEqual(config.teacherAccounts, [TEACHER, ADDITIONAL_TEACHER]); assert.equal(config.enabled, false);
    Object.assign(f.identity, { active: ADDITIONAL_TEACHER, effective: ADDITIONAL_TEACHER });
    assert.throws(() => f.context.run_setupTeacherPreview());
  } finally { await rm(root, { recursive: true, force: true }); }
});
