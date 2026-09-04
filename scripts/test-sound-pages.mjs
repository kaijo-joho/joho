import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
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

ok(!existsSync(path.join(root, 'js/dr-slide-deck.js')), '旧DR専用スライドJavaScriptを削除');

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

const [dr31, dr32, css, lessonCss, slideDeck, renderer, widgets, lessons, quiz, links, searchIndexSource] = await Promise.all([
  source('dr31.html'),
  source('dr32.html'),
  source('css/digital-representation.css'),
  source('css/lesson-slide-deck.css'),
  source('js/lesson-slide-deck.js'),
  source('js/sound-renderer.js'),
  source('js/sound-widgets.js'),
  source('js/sound-lessons.js'),
  source('js/sound-quiz.js'),
  source('js/links.js'),
  source('data/search-index.json')
]);

for (const [name, html] of [['dr31', dr31], ['dr32', dr32]]) {
  ok(html.includes('./js/main.js'), `${name}が共通サイト機能を読み込む`);
  ok(html.includes('./css/lesson-slide-deck.css'), `${name}が共通スライドCSSを読み込む`);
  ok(html.includes('./css/digital-representation.css'), `${name}が共通DRスタイルを読み込む`);
  ok(html.includes('./js/lesson-slide-deck.js'), `${name}が共通スライドJavaScriptを読み込む`);
  ok(!html.includes('./js/dr-slide-deck.js'), `${name}が旧DR専用スライドJavaScriptを読み込まない`);
  ok(html.indexOf('./js/sound-core.js') < html.indexOf('./js/sound-renderer.js'), `${name}のCore→Renderer読み込み順`);
  ok(html.indexOf('./js/sound-quiz.js') < html.indexOf('./js/lesson-slide-deck.js'), `${name}は教材固有処理の後に共通スライド基盤を読み込む`);
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
const walkthroughSource = widgets.slice(widgets.indexOf('class PcmWalkthrough'), widgets.indexOf('class PcmExplorer'));
ok(walkthroughSource.includes('パルス符号変調（PCM）方式') && walkthroughSource.includes('標本化・量子化・符号化'), 'スライド2でPCM方式を3工程と結び付けて説明');
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
ok(dr31.includes('data-lesson-slide-deck'), 'dr31を共通スライドページとして設定');
equal((dr31.match(/<section\b[^>]*\bdata-lesson-slide(?:\s|>)/g) || []).length, 6, 'dr31は補足を除いて6スライド');
equal((dr31.match(/data-lesson-supplement-dialog/g) || []).length, 2, '正弦波と重ね合わせを2つの補足dialogに配置');
equal((dr31.match(/data-lesson-supplement-open=/g) || []).length, 2, '標本化定理から2つの補足を開ける');
ok(dr31.indexOf('data-lesson-supplement-open=') < dr31.indexOf('data-sound-sampling-theorem'), '補足リンクを標本化定理の説明内に配置');
ok(slideDeck.includes('initializeSupplementDialogs') && slideDeck.includes("aria-haspopup', 'dialog"), '補足dialogをキーボード操作可能に初期化');
ok(slideDeck.includes('joho:overlay-open') && slideDeck.includes("dialog.addEventListener('close'"), '補足dialogの排他制御とフォーカス復帰');
ok(slideDeck.includes("event.key !== 'Escape'") && slideDeck.includes('event.preventDefault()'), '補足dialogをEscapeで閉じる');
ok(dr32.includes('data-lesson-slide-deck'), '問題演習dr32も共通スライドページとして設定');
equal((dr32.match(/<section\b[^>]*\bdata-lesson-slide(?:\s|>)/g) || []).length, 3, 'dr32は3スライド');
ok(dr32.includes('class="dr-quiz-stage" data-lesson-slide-navigation-lock'), 'dr32は問題操作領域だけページ送りを抑止');
for (const requirement of ['class LessonSlideDeck', 'lesson-slide-deck__navigation', 'lesson-slide-deck__steps', 'aria-current', 'ArrowRight', 'PageDown', 'location.hash', 'lesson-slide-page--content', 'is-height-compact']) {
  ok(slideDeck.includes(requirement), `スライド機構に ${requirement}`);
}
for (const requirement of ['.lesson-slide-deck', '--lesson-slide-deck-height', '.lesson-slide-deck__navigation', '.lesson-slide-deck__steps', 'body.lesson-slide-ready', 'max-height: 520px']) {
  ok(lessonCss.includes(requirement), `共通スライドCSSに ${requirement}`);
}
for (const requirement of ['.dr-info-tip', 'dr-sampling-divider-in', 'dr-quantization-level-in', 'dr-code-in', '.dr-quiz-slide', '.dr-quiz-stage']) {
  ok(css.includes(requirement), `音教材固有CSSに ${requirement}`);
}
ok(!css.includes('.dr-slide-deck'), '音教材CSSへ旧DR専用ナビゲーションを重複実装しない');
ok(css.includes('--lesson-theme-panel: var(--dr-panel-strong)'), '音教材テーマを共通スライド基盤へ接続');
ok(widgets.includes('joho:lesson-content-resize') && quiz.includes('joho:lesson-content-resize'), '動的な音教材から共通基盤へ高さ再計測を通知');
ok(renderer.includes('dr-svg--stage-enter-${animationStage}'), 'Rendererが進めた工程をSVGクラスへ反映');
ok(renderer.includes("svg.addEventListener('pointerleave'"), 'グラフ外へポインタが出たら標本強調を解除');
ok(renderer.includes("svg.addEventListener('focusout'"), 'グラフ外へキーボードフォーカスが移ったら標本強調を解除');
ok(!renderer.includes('dr-svg__sample-highlight'), '標本選択時の背景帯を描画しない');
for (const stage of [2, 3, 4]) ok(css.includes(`.dr-svg--stage-enter-${stage}`), `SVG工程${stage}の追加アニメーション`);
for (const term of ['アナログ', 'デジタル', '標本化', 'サンプリング', '標本化周波数', '標本化周期', '量子化', '量子化ビット数', '量子化段階数', '符号化', 'PCM', '標本化定理']) {
  ok(dr31.includes(term), `dr31に用語「${term}」`);
}
ok(dr31.includes('0以上8未満'), 'dr31に基本量子化範囲');
ok(dr31.includes('ちょうど中間なら上側'), 'dr31に丸め規則');
ok(dr31.includes('表示範囲を超えた値'), 'dr31に表示範囲外の規則');
ok(dr31.includes('<summary>パルス符号変調（PCM）方式</summary>') && widgets.includes('PCMは「パルス符号変調」の略です'), 'PCM方式と略語を説明');

ok(dr31.includes('data-sound-superposition'), 'dr31に波の重ね合わせ教材を統合');
ok(dr31.includes('data-sound-sampling-theorem'), 'dr31に標本化定理教材を統合');
ok(dr31.includes('<h2 id="headline_4">(4) 標本化定理</h2>'), '標本化定理をスライド4へ移動');
ok(dr31.includes('<h2 id="headline_5">(5) 用語と数値の例</h2>'), '用語と数値の例をスライド5へ移動');
ok(dr31.indexOf('data-sound-pcm data-stage') < dr31.indexOf('data-sound-sampling-theorem'), '条件変更の後に標本化定理を配置');
ok(dr31.indexOf('data-sound-sampling-theorem') < dr31.indexOf('class="dr-reference-grid"'), '標本化定理の後に用語と数値の例を配置');
equal((dr31.match(/<details class="dr-reveal-item/g) || []).length, 15, '用語9項目と数値例6項目をクリック展開にする');
equal((dr31.match(/class="dr-reference-card"/g) || []).length, 2, '用語と数値の例を2つのまとまりに分ける');
for (const example of ['T = 1 / fs = 1 / 10 = 0.1秒', 'fs = 1 / T = 1 / 0.05 = 20Hz', '2ⁿ = 2³ = 8段階', '2⁴ = 16', '答え：010', '答え：1100']) {
  ok(dr31.includes(example), `クリック式の数値例に「${example}」`);
}
for (const selector of ['.dr-reference-grid', '.dr-reference-card', '.dr-reveal-list', '.dr-reveal-item > summary', '.dr-reveal-item__body']) {
  ok(css.includes(selector), `用語・数値例の表示CSSに ${selector}`);
}
ok(css.includes('min-height: 44px') && css.includes('.dr-reveal-item > summary:focus-visible'), '展開項目にタッチ領域とキーボードフォーカスを用意');
ok(lessons.includes('元の波の位相（境界の確認用）') && lessons.includes('2倍ちょうどにしたとき'), '位相操作を境界確認用と明示');
ok(lessons.includes('標本点を結ぶグラフを描く') && lessons.includes('showReconstruction'), '標本点を確認してから波形を描く操作');
ok((lessons.match(/this\.state\.showReconstruction = false/g) || []).length === 3, '条件を変えたら描画前の状態へ戻す');
ok(lessons.includes('controls.append(frequency.wrapper, sampleRate.wrapper, phase.wrapper, this.metrics, actions)'), '計算値と描画ボタンをスライダー枠内の下部へ配置');
ok(lessons.includes('visual.append(scroll, this.legend, this.status, warning)'), '判定コメントをグラフの下へ配置');
ok(/label: '元の波の周波数',[\s\S]*?min: 1,[\s\S]*?max: 20,[\s\S]*?allowedMax: 10,/.test(lessons), '元の波の周波数は共通目盛1〜20Hzのうち1〜10Hzを使用');
ok(/label: '標本化周波数 fs',[\s\S]*?min: 1,[\s\S]*?max: 20,[\s\S]*?allowedMin: 2,/.test(lessons), '標本化周波数は共通目盛1〜20Hzのうち2〜20Hzを使用');
ok(widgets.includes('dr-control--bounded-range') && widgets.includes('灰色部分は選択できません'), '選択できないスライダー範囲を見た目と文章で示す');
ok(widgets.includes("input.setAttribute('aria-valuemin'") && widgets.includes("input.setAttribute('aria-valuemax'"), 'スライダーの有効範囲を支援技術へ伝える');
ok(css.includes('.dr-svg__wave--original') && css.includes('stroke-width: 7'), '標本化定理の元の波形を約2倍の太さで表示');
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
ok(dr31.indexOf('class="dr-reference-grid"') < dr31.indexOf('id="digitization-judge"'), '用語と数値の例の後に波形問題を配置');
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
