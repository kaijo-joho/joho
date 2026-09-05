import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
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

const pageSpecs = [
  { id: 'lc01', slides: 4 },
  { id: 'lc02', slides: 3 },
  { id: 'lc03', slides: 3 },
  { id: 'lc04', slides: 3 },
  { id: 'dr31', slides: 6 },
  { id: 'dr32', slides: 3 },
  { id: 'nw11', slides: 5 }
];

const [deck, css, logicCss, networkCss, networkJs, applications, ...pages] = await Promise.all([
  source('js/lesson-slide-deck.js'),
  source('css/lesson-slide-deck.css'),
  source('css/logic-circuits.css'),
  source('css/network-mechanisms.css'),
  source('js/network-lessons.js'),
  source('js/logic-applications.js'),
  ...pageSpecs.map(({ id }) => source(`${id}.html`))
]);

pages.forEach((html, index) => {
  const { id, slides } = pageSpecs[index];
  ok(/<body\b[^>]*\bdata-lesson-slide-deck(?:\s|>)/.test(html), `${id}が共通スライド基盤を使用`);
  ok(html.includes('./css/lesson-slide-deck.css'), `${id}が共通スライドCSSを読み込む`);
  ok(html.includes('./js/lesson-slide-deck.js'), `${id}が共通スライドJavaScriptを読み込む`);
  equal(
    (html.match(/<section\b[^>]*\bdata-lesson-slide(?:\s|>)/g) || []).length,
    slides,
    `${id}のスライド数`
  );
  ok(
    html.indexOf('./js/main.js') < html.indexOf('./js/lesson-slide-deck.js'),
    `${id}は共通サイト初期化後にスライド基盤を読み込む`
  );
});

for (const requirement of [
  'class LessonSlideDeck',
  'class LessonViewGroup',
  'location.hash',
  'ArrowRight',
  'PageDown',
  "event.key !== 'Escape'",
  'focusHeading',
  'joho:lesson-slide-change',
  'joho:lesson-content-resize',
  'joho:overlay-open',
  'window.pages',
  'prefers-reduced-motion'
]) {
  ok(deck.includes(requirement) || css.includes(requirement), `共通基盤に ${requirement}`);
}

for (const pageId of pageSpecs.map(({ id }) => id)) {
  ok(!deck.includes(pageId), `共通JavaScriptへ${pageId}固有処理を持ち込まない`);
  ok(!css.includes(pageId), `共通CSSへ${pageId}固有処理を持ち込まない`);
}

for (const requirement of [
  'body.lesson-slide-ready',
  '--content-max: 1480px',
  '--content-fluid: min(96vw, var(--content-max))',
  '--lesson-theme-panel',
  '.lesson-slide-deck__viewport',
  '.lesson-slide-deck__navigation',
  '.lesson-supplement-dialog',
  '@media (max-width: 560px)',
  '@media (prefers-reduced-motion: reduce)',
  '@media print'
]) {
  ok(css.includes(requirement), `共通CSSに ${requirement}`);
}
ok(logicCss.includes('--lesson-theme-panel: var(--logic-panel-strong)'), '論理回路テーマを共通スライド基盤へ接続');

equal((pages[0].match(/data-lesson-view-panel=/g) || []).length, 6, 'lc01は6ゲートを表示切替');
ok(pages[0].includes('data-lesson-view-panel="xor"'), 'lc01にXORの表示パネル');
ok(pages[1].includes('data-lesson-supplement-open="lc02-operation-dialog"'), 'lc02に操作方法の補足dialog入口');
ok(pages[1].includes('data-lesson-supplement-dialog'), 'lc02に操作方法の補足dialog');
ok(pages[1].includes('class="logic-workspace-grid" data-lesson-slide-navigation-lock'), 'lc02はエディタ操作領域だけページ送りを抑止');
ok(pages[2].includes('class="logic-quiz-stage" data-lesson-slide-navigation-lock'), 'lc03は問題操作領域だけページ送りを抑止');
equal((pages[2].match(/role="tabpanel"/g) || []).length, 3, 'lc03は3種類の問題タブを維持');
ok(pages[3].includes('id="logic-application-challenge" data-lesson-slide-navigation-lock'), 'lc04は演習領域だけページ送りを抑止');
ok(applications.includes("['truth', 'function', 'name', 'complete']"), 'lc04に4段階の表示状態');
ok(applications.includes('logic-application-card--${stage}'), 'lc04は現在の段階をカードのクラスへ反映');
for (const stage of ['function', 'name', 'complete']) {
  ok(applications.includes(`setCardStage('${stage}'`), `lc04が次の段階 ${stage} へ進む`);
}

for (const selector of [
  '.logic-gate-topic',
  '.logic-workspace-grid',
  '.logic-quiz-stage',
  '.logic-application-card--truth'
]) {
  ok(logicCss.includes(selector), `論理回路CSSにスライド用レイアウト ${selector}`);
}

const networkPage = pages[pageSpecs.findIndex(({ id }) => id === 'nw11')];
ok(networkPage.includes('./css/network-mechanisms.css'), 'nw11がネットワーク教材CSSを読み込む');
ok(networkPage.includes('./js/network-lessons.js'), 'nw11が穴埋めJavaScriptを読み込む');
ok(
  networkPage.indexOf('./js/main.js') < networkPage.indexOf('./js/network-lessons.js')
    && networkPage.indexOf('./js/network-lessons.js') < networkPage.indexOf('./js/lesson-slide-deck.js'),
  'nw11は共通サイト初期化、穴埋め、スライド基盤の順で読み込む'
);
equal(
  (networkPage.match(/<button\b[^>]*\bdata-network-reveal(?:\s|>)/g) || []).length,
  20,
  'nw11に元スライドどおり20個の穴埋め'
);
equal(
  (networkPage.match(/\bdata-network-reveal-group(?:\s|>)/g) || []).length,
  4,
  'nw11の各スライドに穴埋めグループ'
);
ok(!/class="nw-reveal__answer"\s+hidden/.test(networkPage), 'JavaScript無効時もnw11の答えを読める');
const protocolSlide = networkPage.slice(
  networkPage.indexOf('data-lesson-slide-title="プロトコル"'),
  networkPage.indexOf('data-lesson-slide-title="プロトコルの階層構造"')
);
ok(
  protocolSlide.indexOf('data-network-reveal-toolbar') < protocolSlide.indexOf('aria-label="空欄1の答えを表示"'),
  'nw11のプロトコル一括操作は空欄1より前に表示'
);
ok(protocolSlide.includes('data-lesson-slide-layout="workspace"'), 'nw11のプロトコルを操作教材向けレイアウトで表示');
equal((protocolSlide.match(/\bdata-network-protocol(?:\s|>)/g) || []).length, 1, 'nw11のプロトコルは1つの通信図');
equal((protocolSlide.match(/\bdata-protocol-role=/g) || []).length, 5, 'nw11のプロトコルに5つの役割選択');
equal((protocolSlide.match(/\bdata-protocol-visual=/g) || []).length, 5, 'nw11のプロトコルに5つの累積表示');
for (const headerField of ['送信先IP', '送信元IP', '通し番号', '生存期間']) {
  ok(protocolSlide.includes(headerField), `nw11の荷札型ヘッダに${headerField}`);
}
ok(!protocolSlide.includes('nw-protocol-list'), 'nw11のプロトコルに縦積みの旧一覧を残さない');
ok(!protocolSlide.includes('nw-header-scroll'), 'nw11のプロトコルに横スクロールする旧ヘッダ表を残さない');
const layerSlide = networkPage.slice(
  networkPage.indexOf('data-lesson-slide-title="プロトコルの階層構造"'),
  networkPage.indexOf('id="examples_and_questions"')
);
ok(layerSlide.includes('data-lesson-slide-layout="workspace"'), 'nw11の階層構造を操作教材向けレイアウトで表示');
equal((layerSlide.match(/\bdata-network-layer-journey(?:\s|>)/g) || []).length, 1, 'nw11の階層構造は1つの連続した通信図');
equal((layerSlide.match(/\bdata-layer-choice=/g) || []).length, 4, 'nw11の階層構造に4階層の穴埋め選択');
equal((layerSlide.match(/\bdata-layer-journey-step=/g) || []).length, 9, 'nw11の階層構造に送信から受信までの9段階');
for (const control of ['data-layer-journey-prev', 'data-layer-journey-next', 'data-layer-journey-reset']) {
  ok(layerSlide.includes(control), `nw11の階層構造に段階操作 ${control}`);
}
ok(!layerSlide.includes('nw-diagram-scroll'), 'nw11の階層構造を横スクロールさせない');
ok(!layerSlide.includes('nw-layer-board'), 'nw11の階層構造に旧三列ボードを残さない');
ok(
  layerSlide.includes('d="M36 68H94V20H152V68H210V20H326V68H384V20H442V68H500"'),
  'nw11の伝送媒体は0/1の二つの高さだけで波形を描く'
);
for (const connectionText of [
  '端末からインターネットまでの経路と各機器の役割',
  '前のスライドでは、端末からインターネットまでの接続',
  '前のスライドのパケット交換方式では',
  'プロトコルが定める役割は、4つの階層が分担'
]) {
  ok(networkPage.includes(connectionText), `nw11のスライド間をつなぐ説明に「${connectionText}」`);
}
const reviewSlide = networkPage.slice(
  networkPage.indexOf('data-lesson-slide-title="語句とポイントのまとめ"'),
  networkPage.indexOf('id="examples_and_questions"')
);
ok(reviewSlide.includes('id="headline_5"'), 'nw11の5枚目に語句とポイントのまとめ');
equal((reviewSlide.match(/<li><b aria-hidden="true">[1-4]<\/b>/g) || []).length, 4, 'nw11のまとめに4段階の学習内容のつながり');
equal((reviewSlide.match(/\bdata-review-term-toggle(?:\s|>)/g) || []).length, 8, 'nw11のまとめに8個の重要語句ボタン');
equal((reviewSlide.match(/\bdata-review-term-description(?:\s|>)/g) || []).length, 8, 'nw11のまとめに8個の語句説明');
ok(reviewSlide.includes('data-network-review-terms'), 'nw11の重要語句を開閉操作のまとまりにする');
ok(reviewSlide.includes('data-review-terms-open'), 'nw11の重要語句に一括表示操作');
ok(reviewSlide.includes('data-review-terms-close'), 'nw11の重要語句に一括閉じる操作');
ok(!/data-review-term-description[^>]*\shidden(?:\s|>)/.test(reviewSlide), 'JavaScript無効時もnw11の語句説明を読める');
const reviewPoints = reviewSlide.slice(reviewSlide.indexOf('class="nw-review-points"'), reviewSlide.indexOf('</ul>'));
equal((reviewPoints.match(/<li>/g) || []).length, 5, 'nw11のまとめに5つの押さえるポイント');
for (const term of ['LAN / WAN', '回線交換 / パケット交換', 'プロトコル / IPアドレス', 'プロトコルの4階層']) {
  ok(reviewSlide.includes(term), `nw11のまとめに重要語句「${term}」`);
}
for (const device of ['switch', 'router', 'access-point', 'terminal']) {
  equal(
    (networkPage.match(new RegExp(`data-network-device="${device}"`, 'g')) || []).length,
    1,
    `nw11の家庭側${device}は独立した機器として1台だけ配置`
  );
}
for (const provider of ['carrier', 'isp']) {
  equal(
    (networkPage.match(new RegExp(`data-network-provider="${provider}"`, 'g')) || []).length,
    1,
    `nw11の${provider}を1つだけ配置`
  );
}
for (const link of [
  'desktop-switch',
  'laptop-switch',
  'mobile-access-point',
  'switch-router',
  'access-point-switch',
  'router-terminal',
  'terminal-isp',
  'isp-internet',
  'carrier-internet',
  'carrier-smartphone',
  'internet-corporate-router',
  'corporate-router-branches',
  'corporate-admin-lan',
  'corporate-sales-lan',
  'corporate-server-lan'
]) {
  equal(
    (networkPage.match(new RegExp(`data-network-link="${link}"`, 'g')) || []).length,
    1,
    `nw11の接続 ${link} は1本だけ存在`
  );
}
ok(!networkPage.includes('data-network-hierarchy='), 'nw11に通信事業者の分類線を置かない');
ok(!networkPage.includes('nw-svg-provider-category'), 'nw11に通信事業者の分類ノードを置かない');
for (const obsoleteLink of ['terminal-provider-network', 'provider-network-internet', 'provider-branch', 'branch-carrier', 'branch-isp']) {
  ok(!networkPage.includes(`data-network-link="${obsoleteLink}"`), `nw11に旧並列回線 ${obsoleteLink} を残さない`);
}
equal(
  (networkPage.match(/class="nw-svg-link--wireless"\s+data-network-link="carrier-smartphone"/g) || []).length,
  1,
  'nw11で通信キャリアとスマートフォンを無線接続'
);
equal(
  (networkPage.match(/data-network-device="carrier-smartphone"/g) || []).length,
  1,
  'nw11に通信キャリアへ接続するスマートフォンを1台配置'
);
const carrierPosition = networkPage.match(/id="nw-carrier"[^>]*transform="translate\((\d+) (\d+)\)"/);
const ispPosition = networkPage.match(/id="nw-isp"[^>]*transform="translate\((\d+) (\d+)\)"/);
ok(carrierPosition && ispPosition, 'nw11の通信キャリアとISPに位置を指定');
equal(carrierPosition?.[1], ispPosition?.[1], 'nw11の通信キャリアとISPをWAN内で縦に揃えて配置');
ok(!networkPage.includes('社内の入口'), 'nw11の社内ルーターに曖昧な入口ラベルを付けない');
ok(networkPage.includes('id="nw-corporate-network"'), 'nw11に会社内ネットワークの領域');
for (const lan of ['admin', 'sales', 'server']) {
  ok(networkPage.includes(`id="nw-${lan}-lan"`), `nw11の会社内に独立した${lan} LAN`);
}
const transportSlide = networkPage.slice(
  networkPage.indexOf('data-lesson-slide-title="データの伝送方式"'),
  networkPage.indexOf('data-lesson-slide-title="プロトコル"')
);
ok(transportSlide.includes('data-lesson-slide-layout="workspace"'), 'nw11の伝送方式を操作教材向けレイアウトで表示');
equal((transportSlide.match(/\bdata-network-transmission(?:\s|>)/g) || []).length, 1, 'nw11の伝送方式は1つの比較教材');
equal((transportSlide.match(/\bdata-transmission-mode=/g) || []).length, 2, 'nw11の伝送方式を2つのモードで切り替え');
equal((transportSlide.match(/\bdata-transmission-step-marker=/g) || []).length, 5, 'nw11の伝送方式を5段階で説明');
for (const control of ['prev', 'replay', 'next']) {
  equal(
    (transportSlide.match(new RegExp(`data-transmission-${control}(?:\\s|>)`, 'g')) || []).length,
    1,
    `nw11の伝送方式に${control}操作`
  );
}
equal((transportSlide.match(/data-transmission-mover="circuit-/g) || []).length, 6, 'nw11の回線交換方式に点列アニメーション');
for (const packet of ['a1', 'a2', 'a3', 'a4', 'b1', 'b2']) {
  equal(
    (transportSlide.match(new RegExp(`data-transmission-mover="${packet}"`, 'g')) || []).length,
    1,
    `nw11のパケット交換方式に小包${packet.toUpperCase()}`
  );
}
ok(transportSlide.includes('data-transmission-arrival="a2"'), 'nw11で番号と異なるパケット到着順を表示');
ok(transportSlide.includes('A1 ＋ A2 ＋ A3 ＋ A4 → 元のデータ'), 'nw11でパケットを順番に並べて復元');
ok(!transportSlide.includes('nw-transport-grid'), 'nw11の伝送方式に縦積みの旧比較カードを残さない');
ok(!transportSlide.includes('nw-route-svg'), 'nw11の伝送方式に横スクロール前提の旧経路図を残さない');
for (const answer of [
  'LAN',
  'WAN',
  'ルーター',
  'スイッチングハブ',
  'アクセスポイント',
  'ISP（プロバイダ）',
  '回線交換方式',
  'パケット交換方式',
  'パケット',
  'ヘッダ情報',
  'プロトコル',
  '物理的な仕様',
  '通信相手の特定',
  'パケットの転送',
  '信頼性の確立',
  'セキュリティの確保',
  'アプリケーション',
  'トランスポート',
  'インターネット',
  'ネットワークインターフェース'
]) {
  ok(networkPage.includes(`class="nw-reveal__answer">${answer}</span>`), `nw11に穴埋め語句「${answer}」`);
}

for (const requirement of [
  "'[data-network-reveal-group]'",
  "'[data-network-reveal]'",
  "'[data-network-transmission]'",
  "'[data-network-protocol]'",
  "'[data-network-layer-journey]'",
  "'[data-network-review-terms]'",
  "'aria-pressed'",
  "'joho:lesson-content-resize'",
  "'joho:network-reveal-change'",
  "event.key !== 'Enter'",
  'data-network-reveal-all',
  'data-network-reveal-reset',
  'class NetworkProtocol',
  'class NetworkLayerJourney',
  'class NetworkTransmission',
  'class NetworkReviewTerms',
  'data-review-terms-open',
  'data-review-terms-close',
  'LAYER_JOURNEY_STEPS',
  'requestAnimationFrame',
  'getPointAtLength',
  "matchMedia?.('(prefers-reduced-motion: reduce)')"
]) {
  ok(networkJs.includes(requirement), `穴埋めJavaScriptに ${requirement}`);
}
ok(
  /this\.mode = mode;\s+this\.step = 0;\s+this\.render\(false\);/.test(networkJs),
  'nw11は伝送方式を切り替えるとSTEP 1へ戻る'
);

for (const requirement of [
  ':root[data-theme="light"]',
  ':root[data-theme="dark"]',
  '.nw-diagram-scroll',
  'overflow-x: auto',
  'width: 1400px',
  'height: 700px',
  '.nw-svg-callout',
  '.nw-reveal:focus-visible',
  '.nw-transmission-mode-switch',
  '.nw-transmission-svg',
  '.nw-protocol-svg',
  '.nw-protocol-role-list',
  '.nw-layer-journey',
  '.nw-binary-waveform',
  '.nw-review-flow',
  '.nw-review-body',
  '.nw-review-terms',
  '.nw-review-term__toggle',
  '.nw-review-term-controls',
  '.nw-review-points',
  '.nw-moving-parcel',
  '.nw-circuit-dot',
  '@media (max-width: 390px)',
  '@media (prefers-reduced-motion: reduce)',
  '@media print'
]) {
  ok(networkCss.includes(requirement), `ネットワーク教材CSSに ${requirement}`);
}
ok(!networkCss.includes('min-width: 820px'), 'nw11の伝送方式にモバイルで横スクロールする固定幅を残さない');
ok(!networkCss.includes('min-width: 1080px'), 'nw11の階層構造に横スクロールする固定幅を残さない');
const layerChoiceColumnRules = [...networkCss.matchAll(/\.nw-layer-choices\s*\{[^}]*grid-template-columns:\s*([^;]+);/g)];
equal(layerChoiceColumnRules.length, 1, 'nw11の4階層一覧の列指定を画面幅で上書きしない');
equal(layerChoiceColumnRules[0][1].trim(), 'minmax(0, 1fr)', 'nw11の4階層一覧を常に縦1列で表示');

console.log(`lesson-slide-pages: ${checks}件の検証に合格`);
