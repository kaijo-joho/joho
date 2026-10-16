// pyerr原本を読み取り、新しい私有コピーだけを作る。Google・clasp・AIには接続しない。
import { readFile, writeFile, mkdir, readdir, lstat, cp, access, realpath } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import vm from 'node:vm';

const digest = value => createHash('sha256').update(value).digest('hex');
function replaceOnce(source, needle, replacement, label) {
  if (source.split(needle).length !== 2) throw new Error(`原本構造が変わっています: ${label}`);
  return source.replace(needle, replacement);
}
export function transformAdviceSources(original) {
  const changed = new Map();
  let entry = original.get('00_code.gs');
  entry = replaceOnce(entry, 'function doGet(e) {', "function doGet(e) {\n  if (e && e.parameter && e.parameter.kind === 'pythoneditor-advice') return pythonEditorAdviceBridge_(e);", 'doGet');
  changed.set('00_code.gs', entry);
  let main = original.get('10_main.gs');
  main = replaceOnce(main, 'function getGeminiAdvice(studentCode, errorMessage) {', `function getGeminiAdvice(studentCode, errorMessage) {
  return buildAdviceHtml(getPythonEditorAdviceData_(studentCode, errorMessage, ''));
}

// private: google.script.runから直接呼ばせず、既存画面か認証済みエディタ窓口を通す。
function getPythonEditorAdviceData_(studentCode, errorMessage, questionText) {`, '相談core');
  main = replaceOnce(main, '  const inputHash = makeInputHash_(code, errMsg);', `  const question = String(questionText || '');
  const inputHash = makePythonEditorAdviceInputHash_(code, errMsg, question);
  const logAdvice_ = function (email, sourceCode, sourceError, data, status, meta) {
    return logToSheet_(email, sourceCode, sourceError, data, status,
      Object.assign({}, meta || {}, { inputHash: inputHash, questionText: question }));
  };`, '質問のキャッシュ・ログ');
  main = replaceOnce(main, '(code + errMsg).length > MAX_INPUT_LENGTH', '(code + errMsg + question).length > MAX_INPUT_LENGTH', '入力上限');
  main = replaceOnce(main, 'prompt = buildGeminiPrompt_(code, errMsg);', 'prompt = buildPythonEditorAdvicePrompt_(code, errMsg, question);', '質問のプロンプト');
  // 20の既存分岐をそのままデータで返す。追加のHTML呼出しは互換wrapperの1か所だけ。
  if ([...main.matchAll(/return buildAdviceHtml\((\w+)\);/g)].length !== 20 || [...main.matchAll(/logToSheet_\(/g)].length !== 21)
    throw new Error('相談の戻り値・ログ分岐が変わっています。変換を見直してください。');
  main = main.replace(/return buildAdviceHtml\((\w+)\);/g, 'return $1;');
  main = main.replace(/\blogToSheet_\(userEmail,/g, 'logAdvice_(userEmail,');
  if ([...main.matchAll(/logAdvice_\(userEmail,/g)].length !== 20 || main.includes('return buildAdviceHtml(error'))
    throw new Error('相談分岐の変換を確認してください。');
  changed.set('10_main.gs', main);
  let logging = original.get('40_logging.gs');
  logging = replaceOnce(logging, 'const inputHash = makeInputHash_(code, errorMessage);', 'const inputHash = meta.inputHash || makeInputHash_(code, errorMessage);', 'ログの質問ハッシュ');
  logging = replaceOnce(logging, 'const rawJson = JSON.stringify({\n      errorKey,', 'const rawJson = JSON.stringify({\n      questionText: String(meta.questionText || ""),\n      errorKey,', '既存rawJson内の相談文');
  changed.set('40_logging.gs', logging);
  let history = original.get('50_history.gs');
  history = replaceOnce(history, '        errorMessage: record.errorMessage,', '        errorMessage: record.errorMessage,\n        questionText: pythonEditorAdviceQuestionText_(record.rawJson),', '履歴の共有相談文');
  changed.set('50_history.gs', history);
  return changed;
}

export async function prepareAdviceGas({ baseline, out, settings }) {
  const base = await realpath(resolve(baseline)), target = resolve(out);
  const parent = await realpath(dirname(target));
  if (!parent.startsWith('/private/tmp') || parent !== '/private/tmp' && !parent.startsWith('/private/tmp/') ||
      target === base || target.startsWith(base + '/')) throw new Error('原本とは別の新しい/private/tmp内だけへ出力できます。');
  try { await access(target); throw new Error('既存フォルダを置換しません。'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
  const allowed = ['ownerAccount', 'editorOrigins', 'schoolDomain', 'allowedUsers'];
  if (!settings || Object.keys(settings).some(k => !allowed.includes(k)) ||
      typeof settings.schoolDomain !== 'string' || !/^[a-z0-9.-]+$/.test(settings.schoolDomain) ||
      !Array.isArray(settings.editorOrigins) || !settings.editorOrigins.length || settings.editorOrigins.length > 10 ||
      settings.editorOrigins.some(o => typeof o !== 'string' || !/^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(o)) ||
      !Array.isArray(settings.allowedUsers) || !settings.allowedUsers.length || settings.allowedUsers.length > 500 ||
      settings.allowedUsers.some(e => typeof e !== 'string' || !/^[a-z0-9._+\-]+@[a-z0-9.-]+$/.test(e) || e.split('@')[1] !== settings.schoolDomain) ||
      typeof settings.ownerAccount !== 'string' || !settings.allowedUsers.includes(settings.ownerAccount))
    throw new Error('所有教員・許可origin・学校ドメイン・明示した対象ユーザーを私有JSONで確認してください。');
  const originals = new Map(), hashes = {};
  for (const name of await readdir(base)) {
    const entry = await lstat(join(base, name));
    if (entry.isSymbolicLink()) throw new Error('原本内のシンボリックリンクは候補へコピーしません: ' + name);
    if (entry.isFile()) {
      const value = await readFile(join(base, name)); hashes[name] = digest(value);
      if (['00_code.gs', '10_main.gs', '40_logging.gs', '50_history.gs'].includes(name)) originals.set(name, value.toString('utf8'));
    }
  }
  if (originals.size !== 4) throw new Error('pyerr原本の4ファイルを確認してください。');
  const manifest = JSON.parse(await readFile(join(base, 'appsscript.json'), 'utf8'));
  const clasp = JSON.parse(await readFile(join(base, '.clasp.json'), 'utf8'));
  if (clasp.rootDir && clasp.rootDir !== '.') throw new Error('clasp rootDirを確認してください。');
  const additions = ['70_python_editor_advice.gs', '71_python_editor_advice_bridge.html'];
  for (const name of [...additions, '99_python_editor_advice_private_setup.gs'])
    if (hashes[name]) throw new Error('追加予定ファイルが原本にあります: ' + name);
  const files = transformAdviceSources(originals);
  for (const name of additions) files.set(name, await readFile(new URL('./pythoneditor-advice-gas/' + name, import.meta.url), 'utf8'));
  const config = { schema: 1, enabled: false, editorOrigins: [...new Set(settings.editorOrigins)],
    schoolDomain: settings.schoolDomain, allowedUsers: [...new Set(settings.allowedUsers)] };
  if (Buffer.byteLength(JSON.stringify(config), 'utf8') > 8000) throw new Error('接続設定は1プロパティの上限内に収めてください。');
  files.set('99_python_editor_advice_private_setup.gs', `// 私有の配置候補。公開リポジトリへ追加しない。
function run_setupPythonEditorAdvice() {
  var owner = ${JSON.stringify(settings.ownerAccount)};
  if (Session.getActiveUser().getEmail() !== owner || Session.getEffectiveUser().getEmail() !== owner)
    throw new Error('指定した所有教員のアカウントで実行してください。');
  var config = ${JSON.stringify(config)}, props = PropertiesService.getScriptProperties();
  var existing = props.getProperty('PYTHON_EDITOR_ADVICE_CONFIG');
  if (existing && existing !== JSON.stringify(config)) throw new Error('既存設定を上書きしません。');
  if (!props.getProperty('PYTHON_EDITOR_ADVICE_ACTOR_SALT'))
    props.setProperty('PYTHON_EDITOR_ADVICE_ACTOR_SALT', Utilities.getUuid() + Utilities.getUuid());
  props.setProperty('PYTHON_EDITOR_ADVICE_CONFIG', JSON.stringify(config));
  console.log(JSON.stringify({ configured: true, enabled: false, allowedUsers: config.allowedUsers.length }));
}
// 実行前に対象・権限・費用範囲を確認する。有効化はこの準備スクリプトでは実行しない。
function run_enablePythonEditorAdvice() {
  var owner = ${JSON.stringify(settings.ownerAccount)};
  if (Session.getActiveUser().getEmail() !== owner || Session.getEffectiveUser().getEmail() !== owner)
    throw new Error('指定した所有教員のアカウントで実行してください。');
  var props = PropertiesService.getScriptProperties(), config = JSON.parse(props.getProperty('PYTHON_EDITOR_ADVICE_CONFIG') || 'null');
  if (!config || config.schema !== 1) throw new Error('先に接続設定を確認してください。');
  config.enabled = true; props.setProperty('PYTHON_EDITOR_ADVICE_CONFIG', JSON.stringify(config));
  console.log(JSON.stringify({ enabled: true, allowedUsers: config.allowedUsers.length }));
}
function run_stopPythonEditorAdvice() {
  var owner = ${JSON.stringify(settings.ownerAccount)};
  if (Session.getActiveUser().getEmail() !== owner || Session.getEffectiveUser().getEmail() !== owner)
    throw new Error('指定した所有教員のアカウントで実行してください。');
  var props = PropertiesService.getScriptProperties(), config = JSON.parse(props.getProperty('PYTHON_EDITOR_ADVICE_CONFIG') || 'null');
  if (!config || config.schema !== 1) throw new Error('接続設定を確認してください。');
  config.enabled = false; props.setProperty('PYTHON_EDITOR_ADVICE_CONFIG', JSON.stringify(config));
  console.log(JSON.stringify({ enabled: false }));
}
`);
  for (const [name, source] of files) if (name.endsWith('.gs')) new vm.Script(source, { filename: name });
  const bridge = files.get('71_python_editor_advice_bridge.html').match(/<script>([\s\S]*?)<\/script>/)[1];
  new vm.Script(bridge.replace('<?!= bootJson ?>', JSON.stringify({ origin: 'https://example.invalid', channel: 'a'.repeat(64) })));
  await mkdir(target, { mode: 0o700 });
  await cp(base, target, { recursive: true, filter: p => !p.split('/').some(n => n === '.git' || n === 'node_modules') });
  for (const [name, source] of files) await writeFile(join(target, name), source, { mode: 0o600 });
  clasp.filePushOrder = [...(clasp.filePushOrder || []), ...additions, '99_python_editor_advice_private_setup.gs'];
  await writeFile(join(target, '.clasp.json'), JSON.stringify(clasp, null, 2) + '\n', { mode: 0o600 });
  const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
  for (const [name, line] of [
    ['_CHANGELOG.html', `${at} | Codex | Pythonエディタ相談JSON窓口・版固定・再送照会を追加した未配置コピー。既存HTML窓口・共有ログ・上限維持。接続既定無効。`],
    ['AI_NOTES.md', `${at} | Codex | 既存getGeminiAdviceをHTML互換wrapperとして保持しprivateデータcoreを抽出。質問文をprompt/cache/logへ含め、kind=pythoneditor-adviceを追加。明示allowlistとorigin・Session本人を毎RPCで照合。UserPropertiesはactor別の予約と再実行禁止記録のみ（1値2000bytes/全体450KB）、回答はScriptCacheへ6h一時保存。消失時は再AIせず過去相談を案内。20分経過した未完了予約は期限切れ記録へ縮小し再実行しない。旧Colab/grade/GSSスキーマ/manifest不変。実AI・本番・権限変更は未実施。所有者実行時の共有容量と40人実負荷は実機要確認。`]
  ]) {
    let before = ''; try { before = await readFile(join(target, name), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await writeFile(join(target, name), before + '\n' + line + '\n', { mode: 0o600 });
  }
  const modified = ['00_code.gs', '10_main.gs', '40_logging.gs', '50_history.gs', '.clasp.json', '_CHANGELOG.html', 'AI_NOTES.md'];
  for (const [name, hash] of Object.entries(hashes)) {
    if (!modified.includes(name) && digest(await readFile(join(target, name))) !== hash) throw new Error('範囲外のファイルが変化しています: ' + name);
  }
  const review = { baseline: base, target, at, baselineHashes: hashes, modified, added: [...files.keys()].filter(n => !originals.has(n)),
    executeAs: manifest.webapp?.executeAs || null, access: manifest.webapp?.access || null,
    manifestChanged: false, sourceChanged: false, propertiesChanged: false, permissionsChanged: false,
    enabled: false, pushed: false, deployed: false, aiCalled: false,
    rollback: '原本と既存デプロイを保持。新版設定enabled=false、フロントenabled=falseで停止。受付記録を削除しない。' };
  await writeFile(join(target, 'PYTHON_EDITOR_ADVICE_REVIEW.json'), JSON.stringify(review, null, 2) + '\n', { mode: 0o600 });
  return { output: target, added: review.added.length, modified: modified.length, enabled: false, remoteChanged: false };
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
  const baseline = arg('--baseline'), out = arg('--out'), settingsPath = arg('--settings');
  if (!baseline || !out || !settingsPath) throw new Error('--baseline <pyerr原本> --settings <私有JSON> --out /private/tmp/<新規候補> が必要です。');
  console.log(JSON.stringify(await prepareAdviceGas({ baseline, out, settings: JSON.parse(await readFile(settingsPath, 'utf8')) })));
}
