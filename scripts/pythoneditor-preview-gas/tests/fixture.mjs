// 配布preview専用fixture。同期・採点・collector・トリガーのモジュールを読み込まない。
import { readFileSync } from 'node:fs';
import { gzipSync, gunzipSync } from 'node:zlib';
import vm from 'node:vm';
import { loadCommon } from '../../tools-store-gas/tests/common-fixture.mjs';

export const TEACHER = 'teacher+fixture@gfe.kaijo.ed.jp'; // 合成テスト専用。実アカウントへ接続しない。
export const DEMO = 'demo+fixture@gfe.kaijo.ed.jp';
class PreviewProperties {
  constructor() { this.values = {}; this.writes = []; this.deletes = []; }
  getProperty(key) { return Object.hasOwn(this.values, key) ? this.values[key] : null; }
  getProperties() { return { ...this.values }; }
  setProperty(key, value) { this.values[key] = value; this.writes.push([key, value]); return this; }
  deleteProperty(key) { delete this.values[key]; this.deletes.push(key); return this; }
}
export function teacherPreviewFixture() {
  const { context, contract: T } = loadCommon();
  for (const name of ['../../tools-store-gas/store/30_grading_packages.js', '../../pythoneditor-gas/06_python_editor_contract.js',
    '../../pythoneditor-gas/45_python_editor_confirmation.js', '../../pythoneditor-gas/46_python_editor_master.js', '../00_teacher_preview.js']) {
    vm.runInContext(readFileSync(new URL(name, import.meta.url), 'utf8'), context);
  }
  const properties = new PreviewProperties();
  let clock = Date.UTC(2026, 9, 15), nextId = 1, held = false;
  const dependencies = { properties, allowNoExpiry: true, now: () => clock, uuid: () => (nextId++).toString(16).padStart(32, '0'),
    gzip: text => gzipSync(Buffer.from(text, 'utf8')).toString('base64'), gunzip: text => gunzipSync(Buffer.from(text, 'base64')).toString('utf8'),
    byteLength: text => Buffer.byteLength(text, 'utf8'), lock: () => ({ tryLock() { if (held) return false; held = true; return true; }, releaseLock() { held = false; } }) };
  const packages = context.ToolsGradingPackages.create(dependencies);
  function snapshot({ setId = 'demo', version = 'v1', questionId = 'q1', prompt = '問題文', rule = 'PRIVATE_RULE_SENTINEL', code = 'print(1)' } = {}) {
    const body = { schema: 1, question: { questionId, version, setId, order: 1, title: '問題', prompt, templateCode: code, setupCode: '', kind: 'code' },
      gradingVersion: 'grade-v1', engineVersion: 'test-engine-v1', ranges: [], rules: { example: { keyword: rule } }, graded: false, sourceHash: 'f'.repeat(64) };
    return { recordKey: `${version}/${questionId}`, groupKey: `${version}/${setId}`, actorKey: '', questionId, version, requestId: '', seq: 0,
      at: new Date(clock).toISOString(), payloadHash: T.hash(T.canonical(body)), adoptedBy: 'e'.repeat(64), body };
  }
  const config = { schema: 1, enabled: false, editorOrigin: 'https://example.invalid', sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccounts: [TEACHER], demoAccounts: [DEMO], gradingSheet: '採点設定py' };
  const identity = { active: TEACHER, effective: TEACHER };
  const state = { groups: [{ setId: 'demo', version: 'v1', records: [snapshot()] }], reads: 0 };
  const build = () => {
    const groups = state.groups.map(g => ({ ...g, title: g.title || g.setId }));
    return { groups, digest: T.hash(T.canonical(groups)) };
  };
  const env = { properties, identity: () => identity, now: () => clock, bytes: s => Buffer.byteLength(s, 'utf8'), packages: () => packages,
    readSource() { state.reads++; state.onRead?.(); return build(); } };
  properties.setProperty(context.ToolsTeacherPreview.keys.config, T.canonical(config)); properties.writes = [];
  const service = context.ToolsTeacherPreview.create(env);
  function publish() { return service.publish({ expectedDigest: service.preview().digest, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }); }
  function enable() { const published = publish(); service.setEnabled(true, published.generation); return published; }
  return { context, T, properties, packages, dependencies, snapshot, now: () => clock, advance: ms => { clock += ms; }, config, identity, state, env, service, publish, enable };
}
