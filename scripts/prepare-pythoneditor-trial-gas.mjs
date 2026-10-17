// 退避した限定配布GASから私有の配置候補を作る。ネットワーク・共有・配置は行わない。
import { readFile, writeFile, mkdir, readdir, lstat, access, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const baselinePath = arg('--baseline'), outPath = arg('--out'), url = arg('--bridge-url');
if (!baselinePath || !outPath || !url) throw new Error('--baseline <退避済みGAS> --out /private/tmp/<新規候補> --bridge-url <既存exec> が必要です。');
if (!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(url)) throw new Error('既存の限定試用GASのexec URLを指定してください。');
const base = await realpath(resolve(baselinePath)), out = resolve(outPath), parent = await realpath(dirname(out));
if (!(parent === '/private/tmp' || parent.startsWith('/private/tmp/')) || out === base || out.startsWith(base + '/')) throw new Error('原本とは別の新規/private/tmpフォルダだけに出力します。');
try { await access(out); throw new Error('既存フォルダを置換しません。'); } catch (error) { if (error.code !== 'ENOENT') throw error; }
const files = new Map(), before = new Map(), digest = value => createHash('sha256').update(value).digest('hex');
for (const name of await readdir(base)) {
  const entry = await lstat(join(base, name));
  if (entry.isSymbolicLink() || !entry.isFile()) throw new Error('退避元は通常ファイルだけにしてください。');
  const bytes = await readFile(join(base, name)); files.set(name, bytes.toString('utf8')); before.set(name, digest(bytes));
}
const manifest = JSON.parse(files.get('appsscript.json')), clasp = JSON.parse(files.get('.clasp.json'));
const scopes = ['https://www.googleapis.com/auth/spreadsheets','https://www.googleapis.com/auth/userinfo.email'];
if (JSON.stringify([...manifest.oauthScopes].sort()) !== JSON.stringify(scopes.sort()) || manifest.webapp?.executeAs !== 'USER_ACCESSING' || manifest.webapp?.access !== 'DOMAIN' || clasp.rootDir && clasp.rootDir !== '.') throw new Error('既存GASの2スコープ・利用者実行・学校内限定を確認してください。');
const replacements = new Map([
  ['00_teacher_preview.js','pythoneditor-preview-gas/00_teacher_preview.js'],
  ['05_tools_store_contract.js','tools-store-gas/common/05_tools_store_contract.js'],
  ['06_tools_confirmation_contract.js','tools-store-gas/common/06_tools_confirmation_contract.js'],
  ['08_local_assessment.js','pythoneditor-trial-gas/08_local_assessment.js'],
  ['23_school_trial_bridge.html','pythoneditor-trial-gas/23_school_trial_bridge.html'],
  ['40_tools_store_repository.js','tools-store-gas/store/40_tools_store_repository.js'],
  ['41_confirmation_repository.js','tools-store-gas/store/41_confirmation_repository.js'],
  ['50_trial_repository.js','pythoneditor-trial-gas/50_trial_repository.js'],
  ['70_trial_api.js','pythoneditor-trial-gas/70_trial_api.js'],
  ['98_trial_admin.js','pythoneditor-trial-gas/98_trial_admin.js']
]);
for (const [name, source] of replacements) {
  if (before.has(name) && !['00_teacher_preview.js','05_tools_store_contract.js'].includes(name)) throw new Error('追加先が既存GASと重なっています: ' + name);
  files.set(name, await readFile(new URL('./' + source, import.meta.url), 'utf8'));
}
const api = await readFile(new URL('./tools-store-gas/store/10_tools_store_api.js', import.meta.url), 'utf8');
if (api.split('\nfunction toolsStoreRpc(').length !== 2) throw new Error('保存APIの構造が変わっています。');
files.set('10_trial_store_service.js', api.split('\nfunction toolsStoreRpc(')[0] + '\n');
files.set('99_trial_endpoint_private.js', `// 私有。既存の限定配布GASの固定execだけを登録する。\nfunction run_configureSchoolTrialEndpoint() {\n  var env = schoolTrialAdminEnvironment_();\n  ToolsSchoolTrialAdmin.create(env).inspect();\n  var key = ToolsSchoolTrialAdmin.keys.url, url = ${JSON.stringify(url)}, previous = env.properties.getProperty(key);\n  if (previous && previous !== url) throw new Error('既存の接続先を上書きしません。');\n  env.properties.setProperty(key, url);\n  if (env.properties.getProperty(key) !== url) throw new Error('接続先を確認できません。');\n  console.log(JSON.stringify({configured:true}));\n}\n`);
files.set('.claspignore', '**/**\n!**/*.js\n!**/*.html\n!appsscript.json\n');
clasp.filePushOrder = ['05_tools_store_contract.js','06_python_editor_contract.js','06_tools_confirmation_contract.js','08_local_assessment.js',
  '13_python_editor_grader.js','30_grading_packages.js','40_tools_store_repository.js','41_confirmation_repository.js','45_python_editor_confirmation.js',
  '46_python_editor_master.js','50_trial_repository.js','10_trial_store_service.js','70_trial_api.js','98_trial_admin.js','00_teacher_preview.js','99_private_setup.js','99_trial_endpoint_private.js'];
files.set('.clasp.json', JSON.stringify(clasp, null, 2) + '\n');
files.set('_CHANGELOG.html', files.get('_CHANGELOG.html') + '\n' + new Date().toLocaleString('sv-SE',{timeZone:'Asia/Tokyo'}) + ' | Codex | 既存3名だけの個別GSS保存・ローカル取組評価受領・署名付き試用提出・教員回収を追加する配置候補。通常dist/grade/Colab/HTML・正本・公開リンクを保持。OAuthの2スコープとUSER_ACCESSING/DOMAINを維持。作成と本人共有は所有教員の明示管理操作、初期接続は無効。\n');
for (const [name, source] of files) if (name.endsWith('.js')) new vm.Script(source, {filename:name});
new vm.Script([...files].filter(([name])=>name.endsWith('.js')).map(([,source])=>source).join('\n;\n'));
for (const name of ['21_python_editor_bridge.html','23_school_trial_bridge.html']) {
  const script = files.get(name).match(/<script>([\s\S]*?)<\/script>/)?.[1];
  new vm.Script(script.replace('<?!= bootJson ?>', JSON.stringify({origin:'https://example.invalid',channel:'a'.repeat(64)})));
}
const allowed = new Set(['00_teacher_preview.js','05_tools_store_contract.js','.clasp.json','_CHANGELOG.html']);
for (const [name, hash] of before) if (!allowed.has(name) && digest(files.get(name)) !== hash) throw new Error('範囲外の変更です: ' + name);
const review = { at:new Date().toISOString(),baseline:base,out,scriptId:clasp.scriptId,bridgeURL:url,
  baselineHashes:Object.fromEntries(before),candidateHashes:Object.fromEntries([...files].map(([name,source])=>[name,digest(source)])),
  scopeChanges:false,manifestChanged:false,sourceMasterChanged:false,normalDistGradeChanged:false,legacyColabChanged:false,
  remoteChanged:false,enabled:false,rollback:'退避元ソースと既存公開版へ戻す。停止はrun_stopSchoolTrial。作成GSSと提出履歴は削除しない。' };
await mkdir(out,{mode:0o700});
for (const [name,source] of files) await writeFile(join(out,name),source,{flag:'wx',mode:0o600});
await writeFile(join(out,'TRIAL_DEPLOYMENT_REVIEW.json'),JSON.stringify(review,null,2)+'\n',{flag:'wx',mode:0o600});
console.log(JSON.stringify({out,files:files.size,scopeChanges:false,remoteChanged:false,enabled:false}));
