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

for (const id of ['dr31', 'dr32']) {
  equal(pages[id]?.release, false, `${id}を非公開ページとして登録`);
  equal(pages[id]?.show, true, `${id}をサイドナビへ表示`);
  equal(pages[id]?.mainTitle, 'Digital Representation', `${id}のシリーズ名`);
  equal(pages[id]?.category, '音のデジタル表現', `${id}のカテゴリ`);
}
equal(pages.dr31.next?.[0]?.id, 'dr32', 'dr31からdr32への次ページ');
equal(pages.dr32.back, 'dr31', 'dr32からdr31への前ページ');
equal(pages.dr32.next, false, 'dr32を音シリーズの末尾に設定');
equal(pages.dr33, undefined, '旧dr33をページ登録から削除');

const [dr31, dr32, css, slideDeck, renderer, widgets, lessons, quiz, links, searchIndexSource] = await Promise.all([
  source('dr31.html'),
  source('dr32.html'),
  source('css/digital-representation.css'),
  source('js/dr-slide-deck.js'),
  source('js/sound-renderer.js'),
  source('js/sound-widgets.js'),
  source('js/sound-lessons.js'),
  source('js/sound-quiz.js'),
  source('js/links.js'),
  source('data/search-index.json')
]);

for (const [name, html] of [['dr31', dr31], ['dr32', dr32]]) {
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
ok(widgets.includes('end: 1.2'), '可変PCMグラフの表示範囲は0〜1.2秒');
ok(!widgets.includes('表示範囲の標本数'), '可変PCMグラフに標本数を重複表示しない');
ok(!widgets.includes("['量子化の幅'"), '可変PCMグラフに量子化の幅を重複表示しない');
ok(!widgets.includes('renderTable(') && !widgets.includes("element('table', 'dr-sample-table')"), '可変PCMグラフの下に標本値表を置かない');
ok(!dr31.includes('SVG上の点と下の表'), '条件変更スライドで削除した表へ言及しない');
ok(widgets.includes('createInfoTip') && widgets.includes('aria-controls'), '補足アイコンをフォーカス・タップでも確認可能');
ok(dr31.includes('data-dr-slide-deck'), 'dr31をスライドページとして設定');
equal((dr31.match(/<section data-dr-slide(?:\s|>)/g) || []).length, 6, 'dr31は補足を除いて6スライド');
ok(dr31.includes('./js/dr-slide-deck.js'), 'dr31が共通スライド機構を読み込む');
equal((dr31.match(/data-dr-supplement-dialog/g) || []).length, 2, '正弦波と重ね合わせを2つの補足dialogに配置');
equal((dr31.match(/data-dr-supplement-open=/g) || []).length, 2, '標本化定理から2つの補足を開ける');
ok(dr31.indexOf('data-dr-supplement-open=') < dr31.indexOf('data-sound-sampling-theorem'), '補足リンクを標本化定理の説明内に配置');
ok(slideDeck.includes('initializeSupplementDialogs') && slideDeck.includes("aria-haspopup', 'dialog"), '補足dialogをキーボード操作可能に初期化');
ok(slideDeck.includes('joho:overlay-open') && slideDeck.includes("dialog.addEventListener('close'"), '補足dialogの排他制御とフォーカス復帰');
ok(slideDeck.includes("event.key !== 'Escape'") && slideDeck.includes('event.preventDefault()'), '補足dialogをEscapeで閉じる');
ok(!dr32.includes('data-dr-slide-deck'), '問題演習dr32はタブ型ページを維持');
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

ok(dr31.includes('data-sound-superposition'), 'dr31に波の重ね合わせ教材を統合');
ok(dr31.includes('data-sound-sampling-theorem'), 'dr31に標本化定理教材を統合');
ok(lessons.includes('元の波の位相（境界の確認用）') && lessons.includes('2倍ちょうどにしたとき'), '位相操作を境界確認用と明示');
ok(lessons.includes('標本点を結ぶグラフを描く') && lessons.includes('showReconstruction'), '標本点を確認してから波形を描く操作');
ok((lessons.match(/this\.state\.showReconstruction = false/g) || []).length === 3, '条件を変えたら描画前の状態へ戻す');
ok(lessons.indexOf("actions, scroll, this.legend, this.status") >= 0, '描画操作はグラフ直前、判定コメントはグラフの下へ配置');
ok(renderer.includes("options.showReconstruction === true") && renderer.includes("layer('reconstruction')"), '操作前は標本点からの波形を描かない');
ok(renderer.includes('dr-svg--reconstruction-enter') && css.includes('@keyframes dr-reconstruction-wipe'), '標本点からの波形をワイプ表示');
ok(renderer.includes("matchMedia('(prefers-reduced-motion: reduce)')") && css.includes('.dr-svg--reconstruction-enter .dr-svg__reconstruction-wipe'), '波形アニメーションで動きを減らす設定を尊重');
ok(lessons.includes('丸い標本点を直線で結ぶのではなく') && lessons.includes('元の波形と区別できない別の候補'), '折れ線を復元波形と誤説明しない');
ok(dr31.includes('2倍より大きい場合') && dr31.includes('2倍ちょうどの場合') && dr31.includes('2倍より小さい場合'), '標本化定理の3状態');
ok(dr31.includes('元の波形とは異なる波形'), '指定した表現で標本化不足を説明');

const learnerFacingSources = [dr31, dr32, slideDeck, renderer, widgets, lessons, quiz, pagesSource].join('\n');
for (const unsupportedTerm of ['エイリアシング', 'ナイキスト', 'Nyquist', 'PCM Explorer', 'fmax', '量子化番号', '量子化誤差', '資料']) {
  ok(!learnerFacingSources.includes(unsupportedTerm), `学習画面で使わない表現「${unsupportedTerm}」を含めない`);
}

ok(dr31.includes('id="digitization-judge"'), '波形デジタル化問題をdr31末尾へ移動');
ok(dr31.indexOf('data-sound-sampling-theorem') < dr31.indexOf('id="digitization-judge"'), '標本化定理の後に波形問題を配置');
ok(quiz.includes('hasDigitization') && quiz.includes('hasCalculation') && quiz.includes('hasTerminology'), '存在する問題カテゴリだけを初期化');
equal((dr32.match(/role="tab"/g) || []).length, 2, 'dr32の2タブ');
equal((dr32.match(/role="tabpanel"/g) || []).length, 2, 'dr32の2タブパネル');
for (const id of ['calculation-judge', 'terminology-judge']) {
  ok(dr32.includes(`id="${id}"`), `dr32の判定ボタン ${id}`);
}
ok(!dr32.includes('id="digitization-judge"'), 'dr32では波形問題を重複させない');
ok(dr32.includes('1KB = 1000B'), '1000倍換算を明記');
ok(dr32.includes('1KB = 1024B'), '1024倍換算を明記');
for (const term of ['音のチャンネル', 'モノラル（1チャンネル）', 'ステレオ（2チャンネル）', 'ホームシアター（5.1チャンネル）', 'チャンネル数と音のデータ量は比例']) {
  ok(dr32.includes(term), `dr32のチャンネル説明「${term}」`);
}

for (const query of ['max-width: 820px', 'max-width: 560px', 'max-width: 390px', 'prefers-reduced-motion', 'data-theme="light"', 'data-theme="dark"']) {
  ok(css.includes(query), `DRスタイルに ${query}`);
}

const searchIndex = JSON.parse(searchIndexSource);
for (const id of ['dr31', 'dr32']) {
  ok(!searchIndex.documents.some(entry => entry.id === id), `${id}をrelease:falseの間は検索索引へ含めない`);
}
ok(!searchIndex.documents.some(entry => entry.id === 'dr33'), '旧dr33を検索索引から削除');

ok(/"l35"\s*:\s*\{/.test(links), '既存の外部小テストl35を維持');
ok(/quizId=l35/.test(links), 'l35の既存外部リンクを維持');

console.log(`sound-pages: ${checks}件の検証に合格`);
