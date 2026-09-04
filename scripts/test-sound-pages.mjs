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

const [dr31, dr32, dr33, css, slideDeck, renderer, widgets, lessons, quiz, links, searchIndexSource] = await Promise.all([
  source('dr31.html'),
  source('dr32.html'),
  source('dr33.html'),
  source('css/digital-representation.css'),
  source('js/dr-slide-deck.js'),
  source('js/sound-renderer.js'),
  source('js/sound-widgets.js'),
  source('js/sound-lessons.js'),
  source('js/sound-quiz.js'),
  source('js/links.js'),
  source('data/search-index.json')
]);

for (const [name, html] of [['dr31', dr31], ['dr32', dr32], ['dr33', dr33]]) {
  ok(html.includes('./js/main.js'), `${name}が共通サイト機能を読み込む`);
  ok(html.includes('./css/digital-representation.css'), `${name}が共通DRスタイルを読み込む`);
  ok(html.indexOf('./js/sound-core.js') < html.indexOf('./js/sound-renderer.js'), `${name}のCore→Renderer読み込み順`);
}

ok(dr31.includes('data-sound-analog-intro'), 'dr31に最初のアナログ波形');
ok(dr31.includes('data-sound-pcm-guide'), 'dr31に固定条件の段階学習');
ok(dr31.includes('data-sound-pcm data-stage="4"'), 'dr31に全工程から始まる可変グラフ');
ok(dr31.indexOf('data-sound-analog-intro') < dr31.indexOf('data-sound-pcm-guide'), 'アナログ波形の後に変換手順を説明');
ok(dr31.indexOf('data-sound-pcm-guide') < dr31.indexOf('data-sound-pcm data-stage'), '変換手順の後に可変グラフを配置');
ok(renderer.includes('renderAnalogWave'), 'アナログ波形専用SVG Renderer');
ok(widgets.includes('class PcmWalkthrough'), '固定条件の段階学習ウィジェット');
ok(widgets.includes('this.state = { stage: 1, selectedIndex: null }'), '固定条件グラフは元の波形だけ・未選択から開始');
for (const label of ['0. アナログ波形', '1. 標本化', '2. 量子化', '3. 符号化']) {
  ok(widgets.includes(label), `固定条件グラフに工程「${label}」`);
}
ok(widgets.includes('this.stageLabels = stages.map((name, index) => `${index}. ${name}`)'), '可変グラフも0〜3の工程番号を使用');
ok(/const bitDepth = createRangeControl\(\{[\s\S]*?id: `dr-pcm-bit-depth-[\s\S]*?min: 2,[\s\S]*?max: 4,[\s\S]*?step: 1,/.test(widgets), '量子化ビット数は2〜4bitの整数スライダー');
ok(!widgets.includes('dr-pcm-phase-') && !widgets.includes('phaseDegrees'), '可変PCMグラフには位相操作を置かない');
ok(/if \(this\.state\.waveform === 'composite'\)[\s\S]*?frequency: this\.state\.frequency,\s*phase: 0[\s\S]*?phase: Math\.PI \/ 3/.test(widgets), '合成波の成分間の位相差は固定');
ok(widgets.includes('disabled: this.state.stage < 2') && widgets.includes('disabled: this.state.stage < 3'), '工程前の標本化・量子化スライダーを無効化');
ok(widgets.includes("control.input.disabled = disabled") && widgets.includes("classList.toggle('is-disabled', disabled)"), '無効状態を操作と表示の両方へ反映');
ok(widgets.includes("this.sampleRateMetrics = element('dl', 'dr-control__metrics')"), '標本化の計算値を標本化周波数スライダー内に配置');
ok(widgets.includes("this.bitDepthMetrics = element('dl', 'dr-control__metrics')"), '量子化の計算値を量子化ビット数スライダー内に配置');
ok(!widgets.includes("this.metrics = element('dl', 'dr-metrics')"), '可変PCMグラフには独立した計算カードを置かない');
ok(widgets.includes('createInfoTip') && widgets.includes('aria-controls'), '補足アイコンをフォーカス・タップでも確認可能');
for (const [name, html, expectedSlides] of [['dr31', dr31, 5], ['dr32', dr32, 3]]) {
  ok(html.includes('data-dr-slide-deck'), `${name}をスライドページとして設定`);
  equal((html.match(/<section data-dr-slide(?:\s|>)/g) || []).length, expectedSlides, `${name}のスライド数`);
  ok(html.includes('./js/dr-slide-deck.js'), `${name}が共通スライド機構を読み込む`);
}
ok(!dr33.includes('data-dr-slide-deck'), '問題演習dr33はタブ型ページを維持');
for (const requirement of ['class DrSlideDeck', 'dr-slide-deck__navigation', 'dr-slide-deck__steps', 'aria-current', 'ArrowRight', 'PageDown', 'location.hash', 'dr-slide-page--content', 'is-height-compact']) {
  ok(slideDeck.includes(requirement), `スライド機構に ${requirement}`);
}
for (const requirement of ['.dr-slide-deck', '--dr-slide-deck-height', '.dr-slide-deck__navigation', '.dr-slide-deck__steps', 'body.dr-slide-ready', 'max-height: 520px', '.dr-info-tip', 'dr-sampling-divider-in', 'dr-quantization-level-in', 'dr-code-in']) {
  ok(css.includes(requirement), `スライド表示CSSに ${requirement}`);
}
ok(renderer.includes('dr-svg--stage-enter-${animationStage}'), 'Rendererが進めた工程をSVGクラスへ反映');
ok(renderer.includes("svg.addEventListener('pointerleave'"), 'グラフ外へポインタが出たら標本強調を解除');
ok(renderer.includes("svg.addEventListener('focusout'"), 'グラフ外へキーボードフォーカスが移ったら標本強調を解除');
ok(!renderer.includes('dr-svg__sample-highlight'), '標本選択時の背景帯を描画しない');
for (const stage of [2, 3, 4]) ok(css.includes(`.dr-svg--stage-enter-${stage}`), `SVG工程${stage}の追加アニメーション`);
for (const term of ['アナログ', 'デジタル', '標本化', 'サンプリング', '標本化周波数', '標本化周期', '量子化', '量子化ビット数', '量子化段階数', '符号化', 'PCM']) {
  ok(dr31.includes(term), `dr31に用語「${term}」`);
}
ok(dr31.includes('0以上8未満'), 'dr31に基本量子化範囲');
ok(dr31.includes('ちょうど中間なら上側'), 'dr31に丸め規則');
ok(dr31.includes('表示範囲を超えた値'), 'dr31に表示範囲外の規則');
ok(dr31.includes('<dt>PCM</dt>') && widgets.includes('PCMは「パルス符号変調」の略です'), 'PCMは略語としてのみ説明');

ok(dr32.includes('data-sound-superposition'), 'dr32に波の重ね合わせ教材');
ok(dr32.includes('data-sound-sampling-theorem'), 'dr32に標本化定理教材');
ok(lessons.includes('復元された正解波形') && lessons.includes('ではありません'), '破線を復元結果と誤説明しない');
ok(dr32.includes('2倍より大きい場合') && dr32.includes('2倍ちょうどの場合') && dr32.includes('2倍より小さい場合'), '標本化定理の3状態');
ok(dr32.includes('元の波形とは異なる波形'), '指定した表現で標本化不足を説明');

const learnerFacingSources = [dr31, dr32, dr33, slideDeck, renderer, widgets, lessons, quiz, pagesSource].join('\n');
for (const unsupportedTerm of ['エイリアシング', 'ナイキスト', 'Nyquist', 'PCM Explorer', 'fmax', '量子化番号', '量子化誤差', '資料']) {
  ok(!learnerFacingSources.includes(unsupportedTerm), `学習画面で使わない表現「${unsupportedTerm}」を含めない`);
}

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
