import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readFile, writeFile, readdir, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { join } from 'node:path';
import { teacherPreviewFixture as fixture, TEACHER } from './fixture.mjs';
const plain = value => JSON.parse(JSON.stringify(value));
const code = expected => error => error.previewCode === expected;

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
test('期限切れの問題を拒否し、別経路へ読み直さない', () => {
  const f = fixture(); f.enable(); const reads = f.state.reads;
  f.advance(7200001);
  assert.throws(() => f.service.session(f.config.editorOrigin), code('preview_expired'));
  assert.equal(f.state.reads, reads);
  const next = f.publish(); f.service.setEnabled(true, next.generation);
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, next.generation);
});
test('同じID・版の本文変更は拒否し、直前の配信を保持する', () => {
  const f = fixture(), initial = f.enable();
  f.state.groups[0].records = [f.snapshot({ prompt: '変更された本文' })];
  assert.throws(() => f.publish(), e => e.toolsStoreCode === 'packages_conflict');
  assert.equal(f.service.session(f.config.editorOrigin).preview.generation, initial.generation);
  assert.equal(f.service.session(f.config.editorOrigin).catalog.sets[0].questions[0].prompt, '問題文');
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
    await writeFile(settings, JSON.stringify({ editorOrigin: 'https://example.invalid', sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccount: TEACHER, gradingSheet: '採点設定py' }));
    const command = [new URL('../../prepare-pythoneditor-preview-gas.mjs', import.meta.url).pathname, '--settings', settings, '--out', out];
    const result = JSON.parse(execFileSync(process.execPath, command, { encoding: 'utf8' }));
    assert.equal(result.remoteChanged, false); assert.equal(result.settingsEnabled, false);
    const names = await readdir(out); assert.ok(!names.includes('.clasp.json'));
    const manifest = JSON.parse(await readFile(join(out, 'appsscript.json')));
    assert.equal(manifest.webapp.executeAs, 'USER_ACCESSING'); assert.equal(manifest.webapp.access, 'DOMAIN');
    assert.equal(manifest.oauthScopes.length, 2); assert.ok(!manifest.oauthScopes.some(s => /drive|script\.scriptapp/.test(s)));
    const bridge = await readFile(join(out, '21_python_editor_bridge.html'), 'utf8');
    assert.match(bridge, /new Set\(\['session'\]\)/); assert.match(bridge, /teacherPythonPreviewRpc\(data.action,data.input \|\| \{\},data.actorKey,boot.origin\)/);
    const review = JSON.parse(await readFile(join(out, 'DEPLOYMENT_REVIEW.json')));
    assert.equal(review.deployed, false); assert.equal(review.permissionsChanged, false); assert.equal(review.adoptsProblems, false);
    const originalManifest = await readFile(join(out, 'appsscript.json'), 'utf8');
    assert.throws(() => execFileSync(process.execPath, command, { encoding: 'utf8', stdio: 'pipe' }));
    assert.equal(await readFile(join(out, 'appsscript.json'), 'utf8'), originalManifest);
  } finally { await rm(root, { recursive: true, force: true }); }
});
