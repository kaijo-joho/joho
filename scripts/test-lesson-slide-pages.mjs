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
  { id: 'dr32', slides: 3 }
];

const [deck, css, logicCss, applications, ...pages] = await Promise.all([
  source('js/lesson-slide-deck.js'),
  source('css/lesson-slide-deck.css'),
  source('css/logic-circuits.css'),
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

console.log(`lesson-slide-pages: ${checks}件の検証に合格`);
