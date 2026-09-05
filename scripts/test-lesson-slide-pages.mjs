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
  { id: 'nw11', slides: 5 },
  { id: 'nw12', slides: 7 }
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
equal((reviewSlide.match(/<details\b[^>]*\bdata-review-term(?:\s|>)/g) || []).length, 15, 'nw11のまとめに15個の重要語句開閉項目');
equal((reviewSlide.match(/class="nw-review-term__body"/g) || []).length, 15, 'nw11のまとめに15個の語句説明');
ok(reviewSlide.includes('data-network-review-terms'), 'nw11の重要語句を開閉操作のまとまりにする');
ok(reviewSlide.includes('data-review-terms-open'), 'nw11の重要語句に一括表示操作');
ok(reviewSlide.includes('data-review-terms-close'), 'nw11の重要語句に一括閉じる操作');
ok(!/<details\b[^>]*\bdata-review-term[^>]*\bopen(?:\s|>)/.test(reviewSlide), 'nw11の語句説明を最初から展開しない');
const reviewPoints = reviewSlide.slice(reviewSlide.indexOf('class="nw-review-points"'), reviewSlide.indexOf('</ul>'));
equal((reviewPoints.match(/<li>/g) || []).length, 5, 'nw11のまとめに5つの押さえるポイント');
for (const term of [
  'LAN',
  'WAN',
  'スイッチングハブ',
  'アクセスポイント',
  'ルーター',
  '終端装置',
  'ISP（プロバイダ）',
  '通信キャリア',
  '回線交換方式',
  'パケット交換方式',
  'パケット',
  'ヘッダ情報',
  'プロトコル',
  'IPアドレス',
  'プロトコルの4階層'
]) {
  ok(reviewSlide.includes(`<summary>${term}</summary>`), `nw11のまとめに独立した重要語句「${term}」`);
}
for (const combinedTerm of ['LAN / WAN', 'ルーター / 終端装置', 'パケット / ヘッダ情報']) {
  ok(!reviewSlide.includes(`<summary>${combinedTerm}</summary>`), `nw11のまとめで「${combinedTerm}」を1項目にまとめない`);
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
  "'[data-review-term]'",
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
  '.nw-review-term > summary',
  '.nw-review-term__body',
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
const reviewTermsScript = networkJs.slice(
  networkJs.indexOf('class NetworkReviewTerms'),
  networkJs.indexOf('function initialize()')
);
ok(!reviewTermsScript.includes('notifyContentResize()'), 'nw11の語句開閉でスライドの再計測を要求しない');
ok(networkCss.includes('overflow-anchor: none'), 'nw11の語句開閉をスクロール位置の基準から外す');

const networkInterfacePage = pages[pageSpecs.findIndex(({ id }) => id === 'nw12')];
ok(networkInterfacePage.includes('./css/network-mechanisms.css'), 'nw12がネットワーク教材CSSを読み込む');
ok(networkInterfacePage.includes('./js/network-lessons.js'), 'nw12がネットワーク教材JavaScriptを読み込む');
ok(
  networkInterfacePage.indexOf('./js/main.js') < networkInterfacePage.indexOf('./js/network-lessons.js')
    && networkInterfacePage.indexOf('./js/network-lessons.js') < networkInterfacePage.indexOf('./js/lesson-slide-deck.js'),
  'nw12は共通サイト初期化、教材固有処理、スライド基盤の順で読み込む'
);
for (const title of [
  'ネットワークインターフェース層の役割',
  '有線でデータを送る',
  '無線でデータを送る',
  'LAN内で相手を区別するしくみ',
  'スイッチングハブの転送',
  '語句とポイントのまとめ',
  '問題演習'
]) {
  ok(networkInterfacePage.includes(`data-lesson-slide-title="${title}"`), `nw12に「${title}」スライド`);
}
equal(
  (networkInterfacePage.match(/<button\b[^>]*\bdata-network-reveal(?:\s|>)/g) || []).length,
  7,
  'nw12に学習範囲の7個の穴埋め'
);
ok(!/class="nw-reveal__answer"\s+hidden/.test(networkInterfacePage), 'JavaScript無効時もnw12の答えを読める');

const interfaceIntroSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="ネットワークインターフェース層の役割"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="有線でデータを送る"')
);
equal((interfaceIntroSlide.match(/\bdata-interface-stage=/g) || []).length, 4, 'nw12はデータを信号へ変える4段階を表示');
for (const control of ['prev', 'next', 'reset']) {
  ok(interfaceIntroSlide.includes(`data-interface-flow-${control}`), `nw12の信号変換図に${control}操作`);
}
for (const term of ['物理層', 'データリンク層', 'ヘッダ', 'ペイロード']) {
  ok(interfaceIntroSlide.includes(term), `nw12の範囲注釈に補助語句「${term}」`);
}
ok(interfaceIntroSlide.includes('名称や構造の暗記は不要'), 'nw12は補助語句が範囲外であることを明示');

const wiredSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="有線でデータを送る"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="無線でデータを送る"')
);
equal((wiredSlide.match(/\bdata-medium-moving-signal=/g) || []).length, 2, 'nw12の有線比較に電気と光の移動信号');
ok(wiredSlide.includes('data-medium-replay'), 'nw12の有線比較に信号アニメーションの再生操作');
for (const answer of ['ツイストペアケーブル', '光ファイバーケーブル']) {
  ok(wiredSlide.includes(`class="nw-reveal__answer">${answer}</span>`), `nw12の有線比較に「${answer}」`);
}

const wirelessSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="無線でデータを送る"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="LAN内で相手を区別するしくみ"')
);
equal((wirelessSlide.match(/\bdata-lesson-view-panel=/g) || []).length, 2, 'nw12の無線説明は2.4GHz帯と5GHz帯を切り替える');
ok(wirelessSlide.includes('data-lesson-default-view="2g"'), 'nw12の無線説明は2.4GHz帯から開始');
for (const answer of ['Wi-Fi', 'チャネル']) {
  ok(wirelessSlide.includes(`class="nw-reveal__answer">${answer}</span>`), `nw12の無線説明に「${answer}」`);
}
equal((wirelessSlide.match(/IEEE 802\.11(?:a|g|n|ac)<\/th>/g) || []).length, 4, 'nw12は原本の無線LAN規格表を補足表示');
ok(/IEEE 802\.11ac<\/th><td>2013<\/td>/.test(wirelessSlide), 'nw12はIEEE 802.11acの策定年を2013年に補正');

const macSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="LAN内で相手を区別するしくみ"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="スイッチングハブの転送"')
);
ok(macSlide.includes('class="nw-reveal__answer">MACアドレス</span>'), 'nw12のLAN内識別にMACアドレスの穴埋め');
equal((macSlide.match(/class="nw-mac-route__line"/g) || []).length, 2, 'nw12のMACアドレス図はPC1、ハブ、PC2を2本の線で接続');
for (const field of ['送信先', '送信元', '内容']) {
  ok(macSlide.includes(`<b>${field}</b>`), `nw12のLAN内データ図に「${field}」`);
}

const switchSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="スイッチングハブの転送"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="語句とポイントのまとめ"')
);
equal((switchSlide.match(/\bdata-switch-step=/g) || []).length, 6, 'nw12のスイッチングハブ図に6段階');
equal((switchSlide.match(/\bdata-switch-path=/g) || []).length, 5, 'nw12のスイッチングハブ図に5本の移動経路');
equal((switchSlide.match(/\bdata-switch-mover=/g) || []).length, 5, 'nw12のスイッチングハブ図に5つのデータ移動表示');
equal((switchSlide.match(/\bdata-switch-mobile-path=/g) || []).length, 5, 'nw12のモバイル用スイッチングハブ図に5本の移動経路');
equal((switchSlide.match(/\bdata-switch-mobile-mover=/g) || []).length, 5, 'nw12のモバイル用スイッチングハブ図に5つのデータ移動表示');
for (const control of ['prev', 'replay', 'next', 'reset']) {
  ok(switchSlide.includes(`data-switch-${control}`), `nw12のスイッチングハブ図に${control}操作`);
}
ok(switchSlide.includes('class="nw-reveal__answer">MACアドレステーブル</span>'), 'nw12の転送説明にMACアドレステーブルの穴埋め');

const interfaceReviewSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="語句とポイントのまとめ"'),
  networkInterfacePage.indexOf('data-lesson-slide-title="問題演習"')
);
equal((interfaceReviewSlide.match(/<details\b[^>]*\bdata-review-term(?:\s|>)/g) || []).length, 9, 'nw12のまとめに9個の独立した重要語句');
equal((interfaceReviewSlide.match(/class="nw-review-term__body"/g) || []).length, 9, 'nw12のまとめに9個の語句説明');
ok(!/<details\b[^>]*\bdata-review-term[^>]*\bopen(?:\s|>)/.test(interfaceReviewSlide), 'nw12の語句説明を最初から展開しない');
for (const term of [
  'ネットワークインターフェース層',
  'ツイストペアケーブル',
  '光ファイバーケーブル',
  '無線LAN',
  'Wi-Fi',
  'チャネル',
  'MACアドレス',
  'MACアドレステーブル',
  'スイッチングハブ'
]) {
  ok(interfaceReviewSlide.includes(`<summary>${term}</summary>`), `nw12のまとめに独立した重要語句「${term}」`);
}
for (const supplementalTerm of ['物理層', 'データリンク層', 'ヘッダ', 'ペイロード', 'フレーム']) {
  ok(!interfaceReviewSlide.includes(`<summary>${supplementalTerm}</summary>`), `nw12のまとめは範囲外語句「${supplementalTerm}」を暗記対象にしない`);
}

const interfaceQuizSlide = networkInterfacePage.slice(
  networkInterfacePage.indexOf('data-lesson-slide-title="問題演習"'),
  networkInterfacePage.indexOf('id="examples_and_questions"')
);
equal((interfaceQuizSlide.match(/\bdata-network-question(?:\s|>)/g) || []).length, 5, 'nw12の問題演習に5問');
equal((interfaceQuizSlide.match(/\bdata-network-feedback(?:\s|>)/g) || []).length, 5, 'nw12の各問題に固定位置の解説欄');
for (const supplementalTerm of ['物理層', 'データリンク層', 'ヘッダ', 'ペイロード', 'フレーム']) {
  ok(!interfaceQuizSlide.includes(supplementalTerm), `nw12の問題演習に範囲外語句「${supplementalTerm}」を出題しない`);
}

for (const requirement of [
  'class NetworkInterfaceFlow',
  'class NetworkMediumDemo',
  'class NetworkSwitchDemo',
  'class NetworkQuiz',
  "'[data-network-interface-flow]'",
  "'[data-network-medium-demo]'",
  "'[data-network-switch-demo]'",
  "'[data-network-quiz]'",
  'SWITCH_DEMO_STEPS',
  'getTotalLength',
  'data-network-quiz-score'
]) {
  ok(networkJs.includes(requirement), `nw12の教材JavaScriptに ${requirement}`);
}

for (const requirement of [
  '.nw-scope-note',
  '.nw-interface-flow__stages',
  '.nw-cable-comparison',
  '.nw-wireless-layout',
  '.nw-mac-route',
  '.nw-switch-svg',
  '.nw-switch-sequence',
  '.nw-quiz__question',
  '.nw-review-scope-reminder'
]) {
  ok(networkCss.includes(requirement), `nw12の教材CSSに ${requirement}`);
}
ok(
  /@media \(max-width: 520px\)[\s\S]*?\.nw-mac-route\s*\{[\s\S]*?grid-template-columns:\s*1fr;/.test(networkCss),
  'nw12のMACアドレス経路図を狭い画面では縦に配置'
);
ok(
  /@media \(prefers-reduced-motion: reduce\)[\s\S]*?\.nw-medium-figure\.is-playing/.test(networkCss),
  'nw12の信号アニメーションは動きを減らす設定へ対応'
);

console.log(`lesson-slide-pages: ${checks}件の検証に合格`);
