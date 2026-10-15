import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, writeFile, readFile, readdir } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fileURLToPath } from 'node:url';
const exec = promisify(execFile), script = fileURLToPath(new URL('./prepare-tools-store-gas.mjs', import.meta.url));
async function fixture() {
  const root = await mkdtemp('/private/tmp/tools-store-package-'), base = root + '/baseline'; await mkdir(base);
  const files = { '00_code.js': "function doGet(e) {\n  if (DistMaintenance.isAdminRequest(e)) return DistMaintenance.renderAdmin();\n  if (DistMaintenance.shouldBlock(e)) return DistMaintenance.renderPublic();\n  return existingColabAndHtml(e);\n}\n", '10_fileDistribution.js': '/* existing Colab and HTML distribution unchanged */\n', 'appsscript.json': '{"webapp":{"executeAs":"USER_DEPLOYING","access":"DOMAIN"}}\n', '.clasp.json': JSON.stringify({ scriptId: 'SYNTHETIC_NOT_A_REAL_SCRIPT', filePushOrder: ['00_code.js', '10_fileDistribution.js'] }) };
  for (const [name, data] of Object.entries(files)) await writeFile(base + '/' + name, data);
  const args = ['--baseline', base, '--dist-out', root + '/dist', '--store-out', root + '/store']; return { root, base, files, args };
}
test('配置準備は旧Colab/HTML本文・manifest・原本を保持し、別の無効GAS候補だけを作る', async () => {
  const f = await fixture(); await exec(process.execPath, [script, ...f.args]);
  for (const [name, data] of Object.entries(f.files)) assert.equal(await readFile(f.base + '/' + name, 'utf8'), data);
  assert.equal(await readFile(f.root + '/dist/10_fileDistribution.js', 'utf8'), f.files['10_fileDistribution.js']);
  assert.equal(await readFile(f.root + '/dist/appsscript.json', 'utf8'), f.files['appsscript.json']);
  const source = await readFile(f.root + '/dist/00_code.js', 'utf8'); assert.match(source, /type === 'toolsStore'/); assert.match(source, /existingColabAndHtml/);
  assert.equal((await readdir(f.root + '/store')).includes('.clasp.json'), false);
  const proposed = JSON.parse(await readFile(f.root + '/store/appsscript.json', 'utf8')); assert.equal(proposed.webapp.executeAs, 'USER_ACCESSING');
  assert.ok(proposed.oauthScopes.includes('https://www.googleapis.com/auth/script.scriptapp'));
  for (const name of ['30_grading_packages.js', '31_grading_sync.js', '32_student_grading.js', '33_grading_collection.js', '13_python_editor_grader.js', '45_python_editor_store.js']) {
    assert.ok((await readFile(f.root + '/store/' + name, 'utf8')).length > 100);
  }
  const bundle = (await readdir(f.root + '/store')).filter(name => name.endsWith('.js'));
  // GASでは同一globalへ配置されるため、単独構文確認に加えて候補全体をまとめて解析する。
  const code = await Promise.all(bundle.map(name => readFile(f.root + '/store/' + name, 'utf8')));
  assert.doesNotThrow(() => new Function(code.join('\n')));
  const report = JSON.parse(await readFile(f.root + '/dist-review.json', 'utf8')); assert.equal(report.pushed, false); assert.equal(report.permissionsChanged, false); assert.equal(report.productionReadbackVerifiedByCommand, false);
  for (const name of ['studentGradingEnabled','teacherSyncEnabled','collectorEnabled','gradingProvisioningEnabled','triggersInstalled']) assert.equal(report.flags[name], false);
  await assert.rejects(exec(process.execPath, [script, ...f.args]), /置換しません/);
});
test('入口が異なる原本や既存追加ファイルは自動置換せず停止する', async () => {
  const f = await fixture(); await writeFile(f.base + '/00_code.js', 'function doGet(e){ return unknown(e); }');
  await assert.rejects(exec(process.execPath, [script, ...f.args]), /確認済み構造/);
  assert.equal(await readFile(f.base + '/10_fileDistribution.js', 'utf8'), f.files['10_fileDistribution.js']);
});
