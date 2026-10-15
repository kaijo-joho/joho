// ローカルの配備候補だけを作る。Google API、clasp、共有・OAuth設定には作用しない。
import { readFile, writeFile, mkdir, access } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const settingsPath = arg('--settings'), outputPath = arg('--out');
if (!settingsPath || !outputPath) throw new Error('--settings <私有JSON> --out /private/tmp/<新しい候補フォルダ> が必要です。');
const out = resolve(outputPath), settings = JSON.parse(await readFile(settingsPath, 'utf8'));
if (!out.startsWith('/private/tmp/')) throw new Error('出力先は新しい/private/tmp/内に限定します。');
try { await access(out); throw new Error('既存フォルダは置換しません。'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
if (!settings || Object.keys(settings).some(k => !['editorOrigin', 'sourceFileListId', 'teacherAccount', 'demoAccount', 'gradingSheet'].includes(k)) ||
    !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(settings.editorOrigin) || !/^[A-Za-z0-9_-]{20,160}$/.test(settings.sourceFileListId) ||
    !/^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(settings.teacherAccount) ||
    settings.demoAccount !== undefined && (!/^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(settings.demoAccount) || settings.demoAccount === settings.teacherAccount) ||
    !/^採点設定py(?:_[A-Za-z0-9_-]+)?$/.test(settings.gradingSheet)) throw new Error('対象origin・正本GSSID・教員とデモ用アカウント・参照採点表を確認してください。');
const files = new Map();
for (const [destination, source] of [
  ['00_teacher_preview.js', './pythoneditor-preview-gas/00_teacher_preview.js'],
  ['05_tools_store_contract.js', './tools-store-gas/common/05_tools_store_contract.js'],
  ['06_python_editor_contract.js', './pythoneditor-gas/06_python_editor_contract.js'],
  ['13_python_editor_grader.js', './pythoneditor-gas/13_python_editor_grader.js'],
  ['30_grading_packages.js', './tools-store-gas/store/30_grading_packages.js'],
  ['46_python_editor_master.js', './pythoneditor-gas/46_python_editor_master.js'],
  ['appsscript.json', './pythoneditor-preview-gas/appsscript.proposed.json']
]) files.set(destination, await readFile(new URL(source, import.meta.url), 'utf8'));
let bridge = await readFile(new URL('./pythoneditor-gas/21_python_editor_bridge.html', import.meta.url), 'utf8');
const actions = /const actions = new Set\(\[[^\n]+\]\);/g;
const call = '.pythonEditorRpc(data.action,data.input || {},data.actorKey)';
if ([...bridge.matchAll(actions)].length !== 1 || bridge.split(call).length !== 2) throw new Error('接続ブリッジの原本構造が変わっています。');
bridge = bridge.replace(actions, "const actions = new Set(['session']);").replace(call, '.teacherPythonPreviewRpc(data.action,data.input || {},data.actorKey,boot.origin)');
files.set('21_python_editor_bridge.html', bridge);
files.set('.claspignore', '**/**\n!**/*.js\n!**/*.html\n!appsscript.json\n');
files.set('_CHANGELOG.html', `${new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' })} | Codex | 明示した教員・デモ用アカウントの問題配布検証用候補。管理操作は所有教員だけ、問題は圧縮して保持しsessionだけを許可。生成時は未配備・無効、既存dist/grade/Colab・正本・採用状態・権限を保持。\n`);
const config = { schema: 1, enabled: false, editorOrigin: settings.editorOrigin, sourceFileListId: settings.sourceFileListId,
  teacherAccounts: [settings.teacherAccount], demoAccounts: settings.demoAccount ? [settings.demoAccount] : [], gradingSheet: settings.gradingSheet };
files.set('99_private_setup.js', `// 私有の配備候補。リポジトリや公開ファイルへ追加しない。
// IDEで選択できる管理入口。公開関数でも指定教員の本人確認を必須とする。
function run_setupTeacherPreview() {
  var config = ${JSON.stringify(config)}, active = String(Session.getActiveUser().getEmail() || '').toLowerCase(), effective = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (active !== config.teacherAccounts[0] || effective !== active) throw new Error('指定教員の所有プロジェクトで実行してください。');
  var properties = PropertiesService.getScriptProperties(), key = ToolsTeacherPreview.keys.config, previous = properties.getProperty(key);
  if (previous && ToolsStoreContract.canonical(JSON.parse(previous)) !== ToolsStoreContract.canonical(config)) throw new Error('既存設定を置換しません。');
  properties.setProperty(key, ToolsStoreContract.canonical(config));
  console.log(JSON.stringify({ configured: true, enabled: false, teacherAccounts: 1, demoAccounts: config.demoAccounts.length }));
}
function run_inspectTeacherCatalog() { console.log(JSON.stringify(previewToolsTeacherCatalog_())); }
function run_publishTeacherCatalog() {
  var plan = previewToolsTeacherCatalog_();
  console.log(JSON.stringify(publishToolsTeacherCatalog_({ expectedDigest: plan.digest, confirmation: 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' })));
}
function run_enableTeacherPreview() {
  var index = JSON.parse(PropertiesService.getScriptProperties().getProperty(ToolsTeacherPreview.keys.index));
  console.log(JSON.stringify(enableToolsTeacherPreview_(index.generation)));
}
function run_stopTeacherPreview() { console.log(JSON.stringify(stopToolsTeacherPreview_())); }
`);
files.set('README.md', `# 私有の問題配布検証GAS候補

設定で明示した学校教員1名と、指定時はデモ用アカウント1名だけが利用する候補です。実メール・正本IDを含む99_private_setup.jsは公開リポジトリへ追加しないでください。このREADMEやDEPLOYMENT_REVIEW.jsonはGASへの配置対象外です。

生成処理はGoogleへ接続していません。生成時点では未配備・無効です。指定した新規GASだけへ配置し、所有教員、2スコープ、USER_ACCESSING、DOMAINを確認します。既存dist/grade/Colab・生徒用GSS・共有設定は変更しません。手動の標準Cloud作成や既存Cloudの紐付け変更は今回の機能では必須にしません。

所有教員がrun_setupTeacherPreview、run_inspectTeacherCatalog、run_publishTeacherCatalog、run_enableTeacherPreviewの順で設定・確認・配信します。別設定がすでにある場合は上書きせず、対象を確認してください。配信は2時間有効です。

デモ用アカウントは別のdemo roleでsessionだけ利用します。正本確認・配信・有効化・停止は教員だけが行い、デモへ正本GSSを共有しません。ブラウザへ返すのは問題文・雛形・準備コードで、解答・解説・採点基準は返しません。クラウド保存・正式提出・採点は今回の対象外です。

停止は所有教員のrun_stopTeacherPreviewとフロント専用設定enabled:falseで行います。圧縮データや正本は削除しません。実機のOAuthと配布結果は合成テストとは分けて記録してください。
`);
const js = [...files].filter(([name]) => name.endsWith('.js'));
for (const [name, source] of js) new vm.Script(source, { filename: name });
new vm.Script(js.map(([, source]) => source).join('\n;\n'));
new vm.Script(bridge.match(/<script>([\s\S]*?)<\/script>/)[1].replace('<?!= bootJson ?>', '{"origin":"https://example.invalid","channel":"' + 'a'.repeat(64) + '"}'));
const hashes = Object.fromEntries([...files].map(([name, source]) => [name, createHash('sha256').update(source).digest('hex')]));
const review = { at: new Date().toISOString(), purpose: 'limited-account-problem-distribution-preview', teacherAccounts: 1, demoAccounts: config.demoAccounts.length,
  files: [...files.keys()], hashes, executeAs: 'USER_ACCESSING', access: 'DOMAIN',
  scopes: JSON.parse(files.get('appsscript.json')).oauthScopes,
  sourceChanges: false, adoptsProblems: false, studentGssProvisioning: false, grading: false,
  collection: false, triggers: false, existingDistGradeColabChanged: false,
  createdRemoteProject: false, deployed: false, permissionsChanged: false, enabled: false,
  rollback: '検証設定enabled=falseとフロント専用設定enabled=falseで停止。既存の授業用デプロイは変更しない。' };
await mkdir(out, { recursive: false, mode: 0o700 });
for (const [name, content] of files) await writeFile(join(out, name), content, { flag: 'wx', mode: 0o600 });
await writeFile(join(out, 'DEPLOYMENT_REVIEW.json'), JSON.stringify(review, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
console.log(JSON.stringify({ output: out, files: files.size, settingsEnabled: false, prepared: true, remoteChanged: false }));
