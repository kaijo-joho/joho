import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let checks = 0;

function ok(value, message) {
  checks += 1;
  assert.ok(value, message);
}

function equal(actual, expected, message) {
  checks += 1;
  assert.equal(actual, expected, message);
}

async function source(file) {
  return readFile(path.join(root, file), 'utf8');
}

const pagesSource = await source('js/pages.js');
const context = { window: {} };
vm.runInNewContext(pagesSource, context, { filename: 'js/pages.js', timeout: 1000 });
const pages = context.window.pages;

for (const id of ['dr31', 'dr32', 'dr33']) {
  equal(pages[id]?.release, true, `${id}を公開ページとして登録`);
  equal(pages[id]?.show, true, `${id}をサイドナビへ表示`);
  equal(pages[id]?.mainTitle, 'Digital Representation', `${id}のシリーズ名`);
  equal(pages[id]?.category, '音のデジタル表現', `${id}のカテゴリ`);
}
equal(pages.dr31.next?.[0]?.id, 'dr32', 'dr31からdr32への次ページ');
equal(pages.dr32.back, 'dr31', 'dr32からdr31への前ページ');
equal(pages.dr32.next?.[0]?.id, 'dr33', 'dr32からdr33への次ページ');
equal(pages.dr33.back, 'dr32', 'dr33からdr32への前ページ');

const [dr31, dr32, dr33, css, lessons, links, searchIndexSource] = await Promise.all([
  source('dr31.html'),
  source('dr32.html'),
  source('dr33.html'),
  source('css/digital-representation.css'),
  source('js/sound-lessons.js'),
  source('js/links.js'),
  source('data/search-index.json')
]);

for (const [name, html] of [['dr31', dr31], ['dr32', dr32], ['dr33', dr33]]) {
  ok(html.includes('./js/main.js'), `${name}が共通サイト機能を読み込む`);
  ok(html.includes('./css/digital-representation.css'), `${name}が共通DRスタイルを読み込む`);
  ok(html.indexOf('./js/sound-core.js') < html.indexOf('./js/sound-renderer.js'), `${name}のCore→Renderer読み込み順`);
}

ok(dr31.includes('data-sound-pcm'), 'dr31にPCM Explorer');
for (const term of ['アナログ', 'デジタル', '標本化', 'サンプリング', '標本化周波数', '標本化周期', '量子化', '量子化ビット数', '量子化段階数', '符号化', 'PCM']) {
  ok(dr31.includes(term), `dr31に用語「${term}」`);
}
ok(dr31.includes('0以上8未満'), 'dr31に基本量子化範囲');
ok(dr31.includes('ちょうど中間なら上側'), 'dr31に丸め規則');
ok(dr31.includes('クリップ'), 'dr31にクリッピング規則');

ok(dr32.includes('data-sound-superposition'), 'dr32に波の重ね合わせ教材');
ok(dr32.includes('data-sound-sampling-theorem'), 'dr32に標本化定理教材');
ok(lessons.includes('復元された正解波形') && lessons.includes('ではありません'), '破線を復元結果と誤説明しない');
ok(dr32.includes('fs &gt; 2fmax') && dr32.includes('fs = 2fmax') && dr32.includes('fs &lt; 2fmax'), '標本化定理の3状態');

equal((dr33.match(/role="tab"/g) || []).length, 3, 'dr33の3タブ');
equal((dr33.match(/role="tabpanel"/g) || []).length, 3, 'dr33の3タブパネル');
for (const id of ['digitization-judge', 'calculation-judge', 'terminology-judge']) {
  ok(dr33.includes(`id="${id}"`), `dr33の判定ボタン ${id}`);
}
ok(dr33.includes('1KB = 1000B'), '1000倍換算を明記');
ok(dr33.includes('1KB = 1024B'), '1024倍換算を明記');
ok(dr33.includes('チャンネル数'), 'チャンネル数の説明');

for (const query of ['max-width: 820px', 'max-width: 560px', 'max-width: 390px', 'prefers-reduced-motion', 'data-theme="light"', 'data-theme="dark"']) {
  ok(css.includes(query), `DRスタイルに ${query}`);
}

const searchIndex = JSON.parse(searchIndexSource);
for (const id of ['dr31', 'dr32', 'dr33']) {
  const document = searchIndex.documents.find(entry => entry.id === id);
  ok(document, `${id}を検索索引へ登録`);
  equal(document?.course, 'dr', `${id}の検索講座キー`);
}

ok(/"l35"\s*:\s*\{/.test(links), '既存の外部小テストl35を維持');
ok(/quizId=l35/.test(links), 'l35の既存外部リンクを維持');

console.log(`sound-pages: ${checks}件の検証に合格`);
