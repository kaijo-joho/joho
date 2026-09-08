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
  equal(pages[id]?.release, true, `${id}を公開ページとして登録`);
  equal(pages[id]?.show, true, `${id}をサイドナビへ表示`);
  equal(pages[id]?.mainTitle, pages.dr00.mainTitle, `${id}と座学目次のシリーズ名が一致`);
  equal(pages[id]?.category, '音のデジタル表現', `${id}のカテゴリ`);
}
equal(pages.dr31.next?.[0]?.id, 'dr32', 'dr31からdr32への次ページ');
equal(pages.dr32.back, 'dr31', 'dr32からdr31への前ページ');
equal(pages.dr32.next, false, 'dr32を音シリーズの末尾に設定');
equal(pages.dr33, undefined, '旧dr33をページ登録から削除');

const [dr31, dr32, css, lessonCss, slideDeck, core, renderer, widgets, lessons, quiz, links, searchIndexSource] = await Promise.all([
  source('dr31.html'),
  source('dr32.html'),
  source('css/digital-representation.css'),
  source('css/lesson-slide-deck.css'),
  source('js/lesson-slide-deck.js'),
  source('js/sound-core.js'),
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
ok(dr31.includes('class="dr-sound-capture"'), 'dr31の1枚目に音源とマイクの図');
ok(dr31.indexOf('class="dr-sound-capture"') < dr31.indexOf('data-sound-analog-intro'), '音源とマイクの図の後に電気信号の波形を表示');
ok(dr31.includes('<title id="dr-sound-capture-title">') && dr31.includes('<desc id="dr-sound-capture-desc">'), '音源とマイクのSVGにtitleとdescを設定');
ok(dr31.includes('dr-sound-capture__source') && dr31.includes('dr-sound-capture__waves') && dr31.includes('dr-sound-capture__microphone'), '音源・空気の振動・マイクをSVGで描画');
ok(dr31.includes('マイク</strong>がその変化を電気信号へ変換'), '図の内容をHTMLの説明文でも確認可能');
for (const selector of ['.dr-analog-digital-slide__visual', '.dr-sound-capture', '.dr-sound-capture__svg', '.dr-sound-capture__waves', '.dr-sound-capture__microphone']) {
  ok(css.includes(selector), `音源とマイクの図にスタイル「${selector}」`);
}
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
equal((dr32.match(/<section\b[^>]*\bdata-lesson-slide(?:\s|>)/g) || []).length, 6, 'dr32はチャンネル説明・例題・4種類の問題で6スライド');
equal((dr32.match(/class="dr-quiz-stage" data-lesson-slide-navigation-lock/g) || []).length, 5, 'dr32は例題と各問題の操作領域だけページ送りを抑止');
for (const requirement of ['class LessonSlideDeck', 'lesson-slide-deck__navigation', 'lesson-slide-deck__select', 'aria-controls', 'ArrowRight', 'PageDown', 'location.hash', 'lesson-slide-page--content', 'is-height-compact']) {
  ok(slideDeck.includes(requirement), `スライド機構に ${requirement}`);
}
for (const requirement of ['.lesson-slide-deck', '--lesson-slide-deck-height', '.lesson-slide-deck__navigation', '.lesson-slide-deck__select', 'body.lesson-slide-ready', 'max-height: 520px']) {
  ok(lessonCss.includes(requirement), `共通スライドCSSに ${requirement}`);
}
for (const requirement of ['.dr-info-tip', 'dr-sampling-divider-in', 'dr-quantization-level-in', 'dr-quantization-block-in', 'dr-code-in', '.dr-svg__quantization-block', '.dr-legend__blocks', '.dr-quiz-slide', '.dr-quiz-stage']) {
  ok(css.includes(requirement), `音教材固有CSSに ${requirement}`);
}
ok(!css.includes('.dr-slide-deck'), '音教材CSSへ旧DR専用ナビゲーションを重複実装しない');
ok(css.includes('--lesson-theme-panel: var(--dr-panel-strong)'), '音教材テーマを共通スライド基盤へ接続');
ok(widgets.includes('joho:lesson-content-resize') && quiz.includes('joho:lesson-content-resize'), '動的な音教材から共通基盤へ高さ再計測を通知');
ok(renderer.includes('dr-svg--stage-enter-${animationStage}'), 'Rendererが進めた工程をSVGクラスへ反映');
ok(renderer.includes("svg.addEventListener('pointerleave'"), 'グラフ外へポインタが出たら標本強調を解除');
ok(renderer.includes("svg.addEventListener('focusout'"), 'グラフ外へキーボードフォーカスが移ったら標本強調を解除');
ok(!renderer.includes('dr-svg__sample-highlight'), '標本選択時の背景帯を描画しない');
ok(renderer.includes("layer('quantization-blocks')") && renderer.includes('block < sample.code'), '段階値の個数だけ量子化幅1段分のブロックを積み上げる');
ok(renderer.includes("'data-quantization-level': block + 1"), '量子化ブロックに段階番号を付与');
ok(renderer.includes("class: 'dr-svg__level-label'") && renderer.includes('}, String(sample.code))'), 'グラフ上の数字は量子化後の電圧でなく段階値を表示');
ok(!renderer.includes('staircasePath') && !css.includes('.dr-svg__staircase'), '従来の階段線を量子化ブロックへ置き換える');
ok(widgets.includes('ブロック数・数字＝段階値') && widgets.includes('量子化幅1段分のブロック'), '凡例と工程説明でブロックと段階値の関係を明示');
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
ok(quiz.includes('hasDigitization') && quiz.includes('hasCalculation') && quiz.includes('hasWorkedExample') && quiz.includes('hasTerminology'), '存在する問題カテゴリと例題だけを初期化');
equal((dr32.match(/role="tab"/g) || []).length, 0, 'dr32は問題種類をタブへ重ねない');
equal((dr32.match(/data-lesson-slide-layout="exercise"/g) || []).length, 4, '4種類の問題を独立した演習スライドに分ける');
equal((dr32.match(/data-lesson-slide(?:\s|>)/g) || []).length, 6, 'dr32をチャンネル・例題・4種類の問題の6スライドで構成');
ok(dr32.includes('data-lesson-slide-title="チャンネル数とデータ量の例題"'), '音のチャンネル直後にデータ量の例題スライドを追加');
ok(dr32.indexOf('data-lesson-slide-title="音のチャンネル"') < dr32.indexOf('data-lesson-slide-title="チャンネル数とデータ量の例題"')
  && dr32.indexOf('data-lesson-slide-title="チャンネル数とデータ量の例題"') < dr32.indexOf('data-lesson-slide-title="周波数と周期の問題"'), 'チャンネル、例題、問題演習の順に配置');
for (const title of ['周波数と周期の問題', 'ビット数と段階数の問題', '音声データ量の問題', '用語と標本化定理の問題']) {
  ok(dr32.includes(`data-lesson-slide-title="${title}"`), `dr32に問題スライド「${title}」`);
}
equal((dr32.match(/data-calculation-judge/g) || []).length, 3, '3種類の計算問題に判定ボタン');
equal((dr32.match(/data-terminology-judge/g) || []).length, 1, '用語問題に判定ボタン');
ok(!dr32.includes('id="digitization-judge"'), 'dr32では波形問題を重複させない');
ok(!dr32.includes('計算の確認'), '計算の確認を独立したスライドへ重複掲載しない');
ok(!quiz.includes('（難易度') && !dr32.includes('難易度'), '問題画面へ難易度を表示しない');
ok(quiz.includes('1KB = 1000B'), '1000倍換算を問題文へ明記');
ok(quiz.includes('1KB = 1024B'), '1024倍換算を問題文へ明記');
for (const term of ['音のチャンネル', 'モノラル（1チャンネル）', 'ステレオ（2チャンネル）', 'ホームシアター（5.1チャンネル）', 'チャンネル数と音のデータ量は比例']) {
  ok(dr32.includes(term), `dr32のチャンネル説明「${term}」`);
}
equal((dr32.match(/class="dr-channel-figure"/g) || []).length, 3, '3種類のチャンネルに図を掲載');
equal((dr32.match(/class="dr-channel-svg(?:\s|\")/g) || []).length, 3, '各チャンネル図をSVGで描画');
equal((dr32.match(/<title id="(?:mono|stereo|surround)-title">/g) || []).length, 3, '各チャンネルSVGにtitleを設定');
equal((dr32.match(/<desc id="(?:mono|stereo|surround)-desc">/g) || []).length, 3, '各チャンネルSVGにdescを設定');
ok(dr32.includes('信号A（1系統）') && dr32.includes('左：信号A') && dr32.includes('右：信号B'), 'モノラルとステレオの信号系統を図示');
ok(dr32.includes('スクリーン（前）') && dr32.includes('dr-channel-svg__subwoofer') && dr32.includes('>.1</text>'), '5.1チャンネルの向きと低音用信号を図示');
for (const requirement of ['data-sound-worked-example="channel-data"', '標本化周波数 44,100Hz', '量子化ビット数 16bit', 'ステレオ 2チャンネル', '1KB = 1,000B', 'data-worked-example-next']) {
  ok(dr32.includes(requirement), `チャンネル数とデータ量の例題に「${requirement}」`);
}
equal((dr32.match(/data-sound-calculation="/g) || []).length, 3, '計算問題を3パターンのスライドへ分割');
for (const pattern of ['sampling', 'quantization', 'data-size']) {
  ok(dr32.includes(`data-sound-calculation="${pattern}"`), `計算スライドに分類「${pattern}」`);
}
for (const pattern of ["pattern: 'sampling'", "pattern: 'quantization'", "pattern: 'data-size'"]) {
  ok(quiz.includes(pattern), `計算問題に分類「${pattern}」`);
}
ok(quiz.includes('calculationProblemGroups[controller.pattern]') && quiz.includes('calculation-${controller.pattern}'), '各スライドの計算パターン内から連続出題');
ok(quiz.includes('calculationHosts.forEach(initializeCalculation)'), '3つの計算スライドをそれぞれ初期化');
ok(quiz.includes('workedExampleHosts.forEach(initializeWorkedExample)'), '例題を独立した段階表示として初期化');
for (const requirement of ['dr-solution__steps', '式を選ぶ', '時間を秒にそろえる', '標本化周波数を置く', '時間を掛ける', '量子化ビット数を掛ける', 'チャンネル数を掛ける', 'bitからBへ換算する', '約分して、まとめて計算する', 'ポイント']) {
  ok(quiz.includes(requirement), `計算問題の段階的な解説に「${requirement}」`);
}
for (const unit of ['［回/秒］', '［秒］', '［bit］', '［チャンネル］', '［bit/B］']) {
  ok(quiz.includes(unit), `音声データ量の立式に単位「${unit}」`);
}
for (const requirement of ['revealedSteps', "nextButton.textContent = hasHiddenSteps ? '次へ' : '次の問題'", 'problem.solution.steps.slice(0, revealedSteps)', 'replaceGroupIndexes']) {
  ok(quiz.includes(requirement), `計算問題の解法を順次表示する実装「${requirement}」`);
}
ok(quiz.includes('192000') && quiz.includes('4 * 60 + 16'), '添付例と同じ192kHz・24bit・ステレオ・4分16秒の問題を維持');

const quizContext = {
  console,
  Intl,
  document: { readyState: 'loading', addEventListener() {} },
  SoundRenderer: {},
  SoundWidgets: { element() {} }
};
quizContext.globalThis = quizContext;
vm.createContext(quizContext);
vm.runInContext(core, quizContext, { filename: 'js/sound-core.js', timeout: 1000 });
vm.runInContext(quiz, quizContext, { filename: 'js/sound-quiz.js', timeout: 1000 });
const channelDataExample = quizContext.SoundQuiz.createChannelDataExample();
equal(channelDataExample.expected.bytesPerSample, 4, 'CD音質のステレオは1回の標本化で4B');
equal(channelDataExample.expected.bytesPerSecond, 176400, 'CD音質のステレオ1秒分は176,400B');
equal(channelDataExample.expected.kilobytesPerSecond, 176.4, '1000倍換算でCD音質のステレオ1秒分は176.4KB');
equal(channelDataExample.solution.steps.length, 5, 'チャンネル数とデータ量の例題を5段階で解説');
const expectedChannelExampleFormulas = [
  '16［bit］',
  '16［bit］ × 2［チャンネル］',
  '16［bit］ × 2［チャンネル］ ÷ 8［bit/B］ = 4［B/回］',
  '4［B/回］ × 44,100［回/秒］ = 176,400［B/秒］',
  '4［B/回］ × 44,100［回/秒］ ÷ 1,000［B/KB］ = 176.4［KB/秒］'
];
expectedChannelExampleFormulas.forEach((formula, index) => {
  equal(channelDataExample.solution.steps[index].formula, formula, `チャンネル数とデータ量の例題の${index + 1}段階目`);
  ok(channelDataExample.solution.steps[index].text.length > 0, `例題の${index + 1}段階目に解説を付ける`);
});
equal(channelDataExample.solution.steps[0].replaceGroup, channelDataExample.solution.steps[2].replaceGroup, '1回分の式を同じ位置で伸ばす');
equal(channelDataExample.solution.steps[3].replaceGroup, channelDataExample.solution.steps[4].replaceGroup, '1秒分の式を同じ位置で伸ばす');
const highResolutionSolution = quizContext.SoundQuiz.createCalculationProblem({
  id: 'high-resolution-solution-test',
  kind: 'dataSize',
  pattern: 'data-size',
  level: 3,
  params: {
    sampleRate: 192000,
    seconds: 4 * 60 + 16,
    durationParts: { minutes: 4, seconds: 16 },
    bitDepth: 24,
    channels: 2,
    answerUnit: 'MB',
    base: 1024
  },
  prompt: '',
  answerUnit: 'MB',
  answerDigits: 2
});
equal(highResolutionSolution.expected, 281.25, '192kHz・24bit・ステレオ・4分16秒は281.25MB');
equal(highResolutionSolution.solution.steps.length, 8, '音声データ量は秒換算・立式6段階・まとめた計算で構成');
const highResolutionFormulaSteps = highResolutionSolution.solution.steps.filter(step => step.replaceGroup === 'data-size-formula');
equal(highResolutionFormulaSteps.length, 6, '立式は6回の「次へ」で項を追加');
const expectedFormulas = [
  '192,000［回/秒］',
  '192,000［回/秒］ × 256［秒］',
  '192,000［回/秒］ × 256［秒］ × 24［bit］',
  '192,000［回/秒］ × 256［秒］ × 24［bit］ × 2［チャンネル］',
  '192,000［回/秒］ × 256［秒］ × 24［bit］ × 2［チャンネル］ ÷ 8［bit/B］',
  '192,000［回/秒］ × 256［秒］ × 24［bit］ × 2［チャンネル］ ÷ 8［bit/B］ ÷ 1,024［B/KB］ ÷ 1,024［KB/MB］'
];
expectedFormulas.forEach((formula, index) => {
  equal(highResolutionFormulaSteps[index].formula, formula, `立式の${index + 1}段階目へ次の項を追加`);
  ok(highResolutionFormulaSteps[index].text.length > 0, `立式の${index + 1}段階目に解説を付ける`);
});
const highResolutionFinalStep = highResolutionSolution.solution.steps[highResolutionSolution.solution.steps.length - 1];
ok(highResolutionFinalStep.text.includes('375 × 3 ÷ 4 = 281.25MB'), '約分後の小さい数でまとめて計算');
for (const selector of ['.dr-channel-figure', '.dr-channel-svg', '.dr-channel-svg__route', '.dr-channel-svg__sound-paths', '.dr-solution--standalone', '.dr-solution__steps', '.dr-solution__point', '.dr-solution__prompt', '.dr-solution__formula']) {
  ok(css.includes(selector), `dr32の追加UIスタイルに ${selector}`);
}
ok(css.includes('@keyframes dr-solution-step-in'), '解法の新しい段階をアニメーションで表示');

for (const query of ['max-width: 820px', 'max-width: 560px', 'max-width: 390px', 'prefers-reduced-motion', 'data-theme="light"', 'data-theme="dark"']) {
  ok(css.includes(query), `DRスタイルに ${query}`);
}

const searchIndex = JSON.parse(searchIndexSource);
for (const id of ['dr31', 'dr32']) {
  ok(searchIndex.documents.some(entry => entry.id === id), `${id}を公開教材として検索索引へ含める`);
}
ok(!searchIndex.documents.some(entry => entry.id === 'dr33'), '旧dr33を検索索引から削除');

ok(/"l35"\s*:\s*\{/.test(links), '既存の外部小テストl35を維持');
ok(/quizId=l35/.test(links), 'l35の既存外部リンクを維持');

console.log(`sound-pages: ${checks}件の検証に合格`);
