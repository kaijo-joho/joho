// 配置用コピーの作成のみ。ネットワーク、実GAS/GSS、OAuth、共有権限を操作しない。
import { readFile, writeFile, mkdir, cp, access, readdir, stat } from 'node:fs/promises';
import { resolve, join, dirname } from 'node:path';
import { createHash } from 'node:crypto';
const arg = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const baseline = arg('--baseline'), distOut = arg('--dist-out'), storeOut = arg('--store-out');
if (!baseline || !distOut || !storeOut) throw new Error('--baseline（distの読戻し） --dist-out --store-out が必要です。');
const base = resolve(baseline), dist = resolve(distOut), store = resolve(storeOut), bundle = new URL('./tools-store-gas/', import.meta.url);
for (const path of [dist, store]) {
  if (!path.startsWith('/private/tmp/') || path === base || path.startsWith(base + '/')) throw new Error('出力先は原本と異なる/private/tmp/を指定してください。');
  try { await access(path); throw new Error('出力先が存在します。置換しません: ' + path); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
if (dist === store || dist.startsWith(store + '/') || store.startsWith(dist + '/')) throw new Error('2つの出力先は別の場所にしてください。');
const source = await readFile(join(base, '00_code.js'), 'utf8'), clasp = JSON.parse(await readFile(join(base, '.clasp.json'), 'utf8'));
const guard = '  if (DistMaintenance.shouldBlock(e)) return DistMaintenance.renderPublic();';
if (source.split('function doGet(e) {').length !== 2 || source.split(guard).length !== 2 || source.includes('renderToolsStoreConnectionV1_'))
  throw new Error('distの入口が確認済み構造と異なります。原本を確認してください。');
if (clasp.rootDir && clasp.rootDir !== '.') throw new Error('distのrootDirを確認してください。');
const common = '05_tools_store_contract.js', distFiles = ['19_tools_store_distribution.js', '25_toolsStoreConnection.html'];
const storeFiles = ['01_tools_store_config.js', '40_tools_store_repository.js', '10_tools_store_api.js', '20_tools_store_bridge.html'];
for (const name of [common, ...distFiles]) {
  try { await access(join(base, name)); throw new Error('追加予定ファイルが既にあります: ' + name); } catch (e) { if (e.code !== 'ENOENT') throw e; }
}
const hash = data => createHash('sha256').update(data).digest('hex'), before = {};
for (const name of await readdir(base)) if ((await stat(join(base, name))).isFile()) before[name] = hash(await readFile(join(base, name)));
await cp(base, dist, { recursive: true, filter: path => !path.split('/').some(p => p === '.git' || p === 'node_modules') });
await mkdir(store, { recursive: true });
await writeFile(join(dist, '00_code.js'), source.replace(guard, guard + "\n  if (e && e.parameter && e.parameter.type === 'toolsStore') return renderToolsStoreConnectionV1_(e);"));
for (const target of [dist, store]) await cp(new URL('common/' + common, bundle), join(target, common));
for (const name of distFiles) await cp(new URL('dist/' + name, bundle), join(dist, name));
for (const name of storeFiles) await cp(new URL('store/' + name, bundle), join(store, name));
await cp(new URL('store/appsscript.proposed.json', bundle), join(store, 'appsscript.json'));
clasp.filePushOrder = [...(clasp.filePushOrder || []), common, ...distFiles];
await writeFile(join(dist, '.clasp.json'), JSON.stringify(clasp, null, 2) + '\n');
const at = new Date().toLocaleString('sv-SE', { timeZone: 'Asia/Tokyo' });
for (const [target, label] of [[dist, 'distにtools保存先の取得・準備と専用接続を追加'], [store, '生徒権限のtools下書き保存・復元GASを新規準備']]) {
  for (const name of ['_CHANGELOG.html', 'AI_NOTES.md']) {
    let previous = ''; try { previous = await readFile(join(target, name), 'utf8'); } catch (e) { if (e.code !== 'ENOENT') throw e; }
    await writeFile(join(target, name), previous + `\n${at} | Codex | ${label}。無効既定。実GSS/権限/OAuth/本番反映は別途承認。今年度Colab/HTML/gradeは保持。\n`);
  }
}
const allowed = new Set(['00_code.js', '.clasp.json', '_CHANGELOG.html', 'AI_NOTES.md']), unchanged = [];
for (const [name, digest] of Object.entries(before)) if (!allowed.has(name)) {
  if (hash(await readFile(join(dist, name))) !== digest) throw new Error('範囲外変更: ' + name); unchanged.push(name);
}
const review = { at, baseline: base, baselineHashes: before, dist, store, unchanged,
  modifiedDist: [...allowed], addedDist: [common, ...distFiles], storeFiles: [common, ...storeFiles, 'appsscript.json'],
  productionReadbackVerifiedByCommand: false, pushed: false, deployed: false, permissionsChanged: false,
  flags: { distEnabled: false, provisioningEnabled: false, adminEnabled: false, storeEnabled: false },
  rollback: '保持したdist原本/既存deployへ戻し、両接続を無効化。生徒GSSの保存データは削除しない。' };
await writeFile(dist + '-review.json', JSON.stringify(review, null, 2) + '\n');
await writeFile(join(store, 'DEPLOYMENT_REVIEW.json'), JSON.stringify({ ...review, notice: '新規保存用GASのプロジェクト作成・USER_ACCESSING設定・スコープは承認後。既存.claspを転用しない。' }, null, 2) + '\n');
console.log(JSON.stringify({ dist, store, review: dist + '-review.json', unchangedFiles: unchanged.length, pushed: false, deployed: false }));
