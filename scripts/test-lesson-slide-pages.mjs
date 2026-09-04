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
  { id: 'nw11', slides: 4 }
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
    `nw11の${provider}を並列経路の独立した事業者として配置`
  );
}
for (const link of [
  'switch-router',
  'access-point-switch',
  'router-terminal',
  'terminal-provider',
  'branch-carrier',
  'branch-isp',
  'corporate-router-switch',
  'corporate-switch-bus'
]) {
  equal(
    (networkPage.match(new RegExp(`data-network-link="${link}"`, 'g')) || []).length,
    1,
    `nw11の接続 ${link} は1本だけ存在`
  );
}
ok(networkPage.includes('id="nw-corporate-lan"'), 'nw11に入口・集線装置・端末を含む社内LAN');
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
  "'aria-pressed'",
  "'joho:lesson-content-resize'",
  "event.key !== 'Enter'",
  'data-network-reveal-all',
  'data-network-reveal-reset'
]) {
  ok(networkJs.includes(requirement), `穴埋めJavaScriptに ${requirement}`);
}

for (const requirement of [
  ':root[data-theme="light"]',
  ':root[data-theme="dark"]',
  '.nw-diagram-scroll',
  'overflow-x: auto',
  'width: 1400px',
  '.nw-svg-callout',
  '.nw-reveal:focus-visible',
  '@media (max-width: 390px)',
  '@media (prefers-reduced-motion: reduce)',
  '@media print'
]) {
  ok(networkCss.includes(requirement), `ネットワーク教材CSSに ${requirement}`);
}

console.log(`lesson-slide-pages: ${checks}件の検証に合格`);
