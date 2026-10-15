import { readFileSync } from 'node:fs';
import vm from 'node:vm';
import { gradingFixture } from '../../tools-store-gas/tests/grading-fixture.mjs';

export const TEACHER = 'teacher+fixture@gfe.kaijo.ed.jp'; // 合成テスト専用。実アカウントへ接続しない。
export const DEMO = 'demo+fixture@gfe.kaijo.ed.jp';
export function teacherPreviewFixture() {
  const f = gradingFixture();
  vm.runInContext(readFileSync(new URL('../00_teacher_preview.js', import.meta.url), 'utf8'), f.context);
  const config = { schema: 1, enabled: false, editorOrigin: 'https://example.invalid', sourceFileListId: 'synthetic_filelist_identifier_0001', teacherAccounts: [TEACHER], demoAccounts: [DEMO], gradingSheet: '採点設定py' };
  const identity = { active: TEACHER, effective: TEACHER };
  const state = { groups: [{ setId: 'demo', version: 'v1', records: [f.snapshot()] }], reads: 0 };
  const build = () => ({ groups: state.groups, digest: f.T.hash(f.T.canonical(state.groups)) });
  const env = { properties: f.properties, identity: () => identity, now: f.now, bytes: s => Buffer.byteLength(s, 'utf8'), packages: () => f.packages,
    readSource() { state.reads++; state.onRead?.(); return build(); } };
  f.properties.setProperty(f.context.ToolsTeacherPreview.keys.config, f.T.canonical(config)); f.properties.writes = [];
  const service = f.context.ToolsTeacherPreview.create(env);
  function publish() { return service.publish({ expectedDigest: service.preview().digest, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' }); }
  function enable() { const published = publish(); service.setEnabled(true, published.generation); return published; }
  return { ...f, config, identity, state, env, service, publish, enable };
}
