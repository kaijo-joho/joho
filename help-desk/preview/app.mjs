import { apps, guide as sampleGuide, sampleCases } from './data.mjs';
import { draftGuides } from './draft-guides.mjs';
import { legacyFaq } from './legacy-faq.mjs';
import { validateGuide, startFlow, choose, goBack, returnToQuestion, answeredQuestions, makeHandoff, validateHandoff, findArticles } from './core.mjs?v=question-flow-20261116';
import { findFaqs, makeFaqHandoff, validateFaqHandoff, legacyLocation } from './faq-core.mjs';

validateGuide(sampleGuide);
Object.values(draftGuides).forEach(validateGuide);
const appIds = apps.map(app => app.id);
const appName = id => apps.find(app => app.id === id)?.name || '分からない・その他';
const guideFor = id => draftGuides[id] || sampleGuide;
const main = document.querySelector('#main');
const state = {
  view: new URL(location.href).searchParams.get('view') || 'public',
  search: '', selectedApp: null, publicKind: 'all', selectedFaq: null, faqCourse: '', faqPage: '', faqUnit: '', faqCategory: '', faqLimit: 15,
  stepIndex: 0, flow: null, inherited: null, portalTab: 'compose', stage: 'edit',
  draft: { appId: '', text: '', image: null }, error: '',
  cases: structuredClone(sampleCases), selectedCase: 'HD-DEMO-001', replyDrafts: Object.create(null), replyPreview: null,
};
if (!['public', 'student', 'admin'].includes(state.view)) state.view = 'public';
if (state.view === 'public') {
  const incoming = legacyLocation(legacyFaq, location.href);
  state.faqCourse = incoming.course; state.faqPage = incoming.page; state.selectedFaq = incoming.id;
  if (incoming.course || incoming.page || incoming.id) state.publicKind = 'faq';
}

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (key === 'on') { for (const [event, handler] of Object.entries(value)) node.addEventListener(event, handler); }
    else if (key === 'value') node.value = value;
    else if (value !== false && value != null) node.setAttribute(key, value === true ? '' : value);
  }
  append(node, ...children);
  return node;
}
function append(node, ...children) {
  for (const child of children.flat(Infinity)) if (child != null) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
}
const p = (text, className = '') => el('p', { class: className }, text);
const button = (text, handler, primary = false, attrs = {}) => el('button', { type: 'button', class: primary ? 'primary' : '', ...attrs, on: { click: handler } }, text);
const actions = (...items) => el('div', { class: 'actions' }, items);
const card = (...items) => el('section', { class: 'card' }, items);
const pill = text => el('span', { class: 'pill' }, text);
const summary = rows => el('ul', { class: 'summary' }, rows.map(row => el('li', {}, el('small', {}, row.question), row.answer)));
const intro = (title, text) => el('div', { class: 'hero' }, el('h1', {}, title), p(text, 'muted'));
const previewComment = (...content) => el('aside', { class: 'preview-comment', 'aria-label': 'プレビュー用コメント' },
  el('span', { class: 'preview-comment__label' }, 'プレビュー用コメント'), el('div', { class: 'preview-comment__body' }, ...content));

function showView(view) {
  state.view = view;
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('view', view);
  if (view === 'public' && state.selectedFaq) url.hash = state.selectedFaq;
  history.pushState(null, '', url);
  render(true);
}
function render(focus = false) {
  const route = new URL(location.pathname, location.origin);
  route.searchParams.set('view', state.view);
  if (state.view === 'public' && state.selectedFaq) route.hash = state.selectedFaq;
  else if (state.view === 'public' && state.publicKind === 'faq') {
    if (state.faqCourse) route.searchParams.set('course', state.faqCourse);
    if (state.faqPage) route.searchParams.set('page', state.faqPage);
  }
  history.replaceState(null, '', route);
  document.querySelector('#views').replaceChildren(
    ...[['public', 'ヘルプを探す'], ['student', '相談する'], ['admin', '管理画面（試作）']].map(([view, label]) =>
      button(label, () => showView(view), false, { 'aria-current': state.view === view ? 'page' : false })),
  );
  main.replaceChildren(...(state.view === 'public' ? publicPage() : state.view === 'student' ? studentPage() : adminPage()));
  if (focus) {
    const panel = main.querySelector('[data-focus-panel]') || main;
    panel.focus();
  }
}

function publicPage() {
  if (state.selectedApp && state.publicKind !== 'faq') return guideSessionPage();
  const search = el('input', { id: 'search', type: 'search', maxlength: '200', value: state.search, placeholder: '例：文字 確定、保存、画像', 'aria-label': '操作や困っていることを探す' });
  const form = el('form', { class: 'search', on: { submit: event => {
    event.preventDefault(); state.search = search.value.trim(); state.flow = null; state.selectedFaq = null; state.faqLimit = 15; render(true);
  } } },
    search, el('button', { type: 'submit' }, '検索'));
  const applications = card(el('h2', {}, '操作や困っていることを探す'), form,
    actions(...[['all', 'すべて'], ['guides', 'アプリのヘルプ'], ['faq', '教材サイトのFAQ']].map(([kind, label]) => button(label, () => {
      state.publicKind = kind; state.selectedApp = null; state.selectedFaq = null; state.flow = null; state.faqLimit = 15; render(true);
    }, false, { 'aria-pressed': String(state.publicKind === kind) }))),
    state.publicKind === 'faq' ? null : el('div', { class: 'field' }, el('h3', {}, 'アプリ・サービスを選ぶ'),
    el('div', { class: 'app-grid' }, apps.map(app => button(app.name, () => {
      state.publicKind = 'guides'; state.selectedApp = app.id; state.selectedFaq = null; state.flow = null; state.stepIndex = 0; state.search = ''; render(true);
    }, false, { 'aria-pressed': state.selectedApp === app.id ? 'true' : 'false' })))));
  const content = el('div', { class: 'stack' }, applications);
  if (state.search && state.publicKind !== 'faq') {
    const matches = findArticles(draftGuides, state.search, state.selectedApp);
    append(content, card(el('h2', {}, `説明の候補 ${matches.length}件`),
      p(state.selectedApp ? `${appName(state.selectedApp)}の説明から検索しています。` : '各アプリの説明から検索しています。', 'muted'),
      matches.length ? el('div', { class: 'choices' }, matches.slice(0, 20).map(item => button(`${appName(item.appId)} · ${item.title}`, () => openArticle(item.appId, item.itemId))))
        : p('該当する説明が見つかりませんでした。別の言葉で検索するか、下の確認から進めてください。'),
      matches.length > 20 ? p('20件まで表示しています。アプリや語句で絞り込めます。', 'muted') : null,
      state.selectedApp ? button('すべてのアプリから探す', () => { state.selectedApp = null; render(); }) : null));
  }
  if (state.selectedFaq && state.publicKind !== 'guides') append(content, faqPanel());
  if (state.publicKind !== 'guides') append(content, faqIndex());
  return [intro('困ったところから、一緒に確認します。', '必要な説明を探して、操作を確認できます。解決しないときは、ここまでの内容を引き継いで相談へ進めます。'), el('div', { class: 'layout' }, content, publicSidebar())];
}

function publicSidebar() {
  return el('aside', { class: 'stack' },
    card(el('h2', {}, '必要な説明をその場で'), p('症状や操作から、条件・手順・正常な結果・注意を確認できます。'),
      previewComment(`試作では${Object.keys(draftGuides).length}アプリの原稿と旧FAQを確認用に表示します。正式運用と自動回答への採用は未実施です。`)),
    card(el('h2', {}, '自分の相談'), p('送った相談への回答や追加の質問を確認できます。'), button('自分の相談を見る', () => { state.portalTab = 'cases'; showView('student'); })));
}

function guideSessionPage() {
  const currentPanel = state.flow ? flowPanel() : guideIndex(state.selectedApp);
  if (!state.flow) {
    currentPanel.tabIndex = -1; currentPanel.setAttribute('data-focus-panel', '');
    currentPanel.classList.add('current-question'); currentPanel.setAttribute('aria-label', 'いまの質問');
  }
  return [intro('困っていることを順に確認します。', 'いま表示されている質問に答えてください。前の回答は「変更する」から直せます。'),
    el('div', { class: 'layout' }, el('div', { class: 'stack' }, answerHistoryPanel(),
      currentPanel,
      actions(button('ヘルプの検索に戻る', () => {
        state.selectedApp = null; state.flow = null; state.stepIndex = 0; state.search = ''; state.publicKind = 'all'; render(true);
      }))), publicSidebar())];
}

function answerHistoryPanel() {
  const rows = [{ question: 'アプリ・サービス', answer: appName(state.selectedApp), change: () => {
    state.selectedApp = null; state.flow = null; state.stepIndex = 0; state.search = ''; render(true);
  } }];
  if (state.flow) {
    const flow = state.flow;
    const guide = guideFor(flow.appId);
    const directOperation = !flow.history.length && flow.guideId;
    rows.push({ question: directOperation ? '操作の説明' : '困っていること',
      answer: directOperation ? guide.operations[flow.guideId].title : guide.nodes[flow.rootId].title || guide.nodes[flow.rootId].question,
      change: () => { state.flow = null; state.stepIndex = 0; render(true); } });
    answeredQuestions(guide, flow).forEach((row, index) => rows.push({ ...row, change: () => {
      state.flow = returnToQuestion(guide, flow, index); state.stepIndex = 0; render(true);
    } }));
  }
  return card(el('h2', {}, 'ここまでの回答'), el('ol', { class: 'answer-history' }, rows.map(row => el('li', {},
    el('div', {}, el('small', {}, row.question), p(row.answer)),
    button('変更する', row.change, false, { 'aria-label': `${row.question}の回答を変更する` })))));
}

function openArticle(appId, itemId) {
  const guide = guideFor(appId);
  state.publicKind = 'guides'; state.selectedFaq = null; state.selectedApp = appId; state.stepIndex = 0;
  if (itemId.startsWith('tr-')) state.flow = startFlow(guide, appId, itemId);
  else state.flow = { ...startFlow(guide, appId), phase: 'guide', guideId: itemId };
  render(true);
}

function openFaq(id) {
  const entry = legacyFaq.entries.find(entry => entry.id === id);
  if (!entry) return;
  state.publicKind = 'faq'; state.selectedFaq = id; state.selectedApp = null; state.flow = null;
  state.faqCourse = entry.course; state.faqUnit = ''; state.faqCategory = ''; state.faqPage = '';
  showView('public');
}

function faqIndex() {
  const choices = (values, id, label, current, handler) => {
    const select = el('select', { id, on: { change: event => handler(event.target.value) } }, el('option', { value: '' }, 'すべて'),
      values.map(([value, name]) => el('option', { value }, name)));
    select.value = current;
    return el('div', { class: 'field' }, el('label', { for: id }, label), select);
  };
  const courses = [...new Map(legacyFaq.entries.map(entry => [entry.course, entry.course_label])).entries()];
  const scope = legacyFaq.entries.filter(entry => !state.faqCourse || entry.course === state.faqCourse);
  const units = [...new Set(scope.map(entry => entry.unit).filter(Boolean))].map(value => [value, value]);
  const categories = [...new Set(scope.map(entry => entry.category).filter(Boolean))].map(value => [value, legacyFaq.categories.find(row => row.type === 'category' && row.key === value)?.label || value]);
  const filters = el('details', { open: !!(state.faqCourse || state.faqUnit || state.faqCategory || state.faqPage) }, el('summary', {}, '講座・単元・種類で絞り込む'),
    choices(courses, 'faq-course', '講座', state.faqCourse, value => { state.faqCourse = value; state.faqUnit = ''; state.faqCategory = ''; state.faqLimit = 15; render(); }),
    choices(units, 'faq-unit', '単元', state.faqUnit, value => { state.faqUnit = value; state.faqLimit = 15; render(); }),
    choices(categories, 'faq-category', '種類', state.faqCategory, value => { state.faqCategory = value; state.faqLimit = 15; render(); }));
  if (state.faqPage) append(filters, p(`教材ページ：${state.faqPage}`, 'muted'), button('ページの絞り込みを解除', () => { state.faqPage = ''; render(); }));
  const matches = findFaqs(legacyFaq, state.search, { course: state.faqCourse, page: state.faqPage, unit: state.faqUnit, category: state.faqCategory });
  return card(el('h2', {}, '教材サイトのFAQ'), previewComment(`${legacyFaq.entries.length}記事を取り込んだ確認用表示です。`), filters,
    p(`${matches.length}件の候補`, 'step'),
    el('div', { class: 'choices' }, matches.slice(0, state.faqLimit).map(entry => button([
      el('strong', {}, entry.question), el('small', { class: 'muted' }, `${entry.course_label} · ${entry.unit} · ${entry.id}`),
    ], () => openFaq(entry.id)))),
    matches.length === 0 ? p('該当するFAQはありません。検索語や絞り込みを変えられます。') : null,
    matches.length > state.faqLimit ? actions(button('さらに15件表示', () => { state.faqLimit += 15; render(); })) : null);
}

const faqTags = new Set(['p', 'br', 'hr', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'pre', 'code', 'em', 'strong', 'b', 'i', 'a', 'img', 'aside', 'div', 'span', 'kbd', 'blockquote', 'dl', 'dt', 'dd', 'table', 'thead', 'tbody', 'tr', 'td', 'th']);
function faqNode(node) {
  if (Object.hasOwn(node, 'text')) return document.createTextNode(node.text);
  const children = (node.children || []).map(faqNode);
  if (!faqTags.has(node.tag)) return el('span', {}, children);
  if (node.tag === 'img') {
    const attrs = node.attrs || {};
    if (!/^assets\/legacy\/[a-f0-9]{64}\.png$/.test(attrs.src || '')) return p(attrs.alt || '画像');
    return el('img', { src: attrs.src, alt: attrs.alt || '操作アイコン', width: attrs.width, height: attrs.height, loading: 'lazy' });
  }
  if (node.tag === 'a') {
    let url;
    try { url = new URL(node.attrs?.href); } catch { return el('span', {}, children); }
    if (url.protocol !== 'https:' || url.username || url.password || !['joho.kaijo.ed.jp', 'docs.google.com', 'drive.google.com', 'classroom.google.com', 'support.google.com'].includes(url.hostname)) return el('span', {}, children);
    const related = url.hostname === 'joho.kaijo.ed.jp' && url.pathname === '/faq.html' ? legacyLocation(legacyFaq, url.href).id : null;
    return el('a', { href: related ? `?view=public#${encodeURIComponent(related)}` : url.href, target: related ? null : '_blank', rel: 'noopener noreferrer',
      on: { click: event => { if (related) { event.preventDefault(); openFaq(related); } } } }, children);
  }
  return el(node.tag, {}, children);
}

function prepareConsultation(context) {
  if ((state.draft.text || state.draft.image) && !window.confirm('入力中の相談があります。入力を消して、今回の相談に切り替えますか？')) return;
  if (state.draft.image) URL.revokeObjectURL(state.draft.image.url);
  state.draft = { appId: context.appId, text: '', image: null };
  state.inherited = context; state.portalTab = 'compose'; state.stage = 'edit'; state.error = ''; showView('student');
}

function faqPanel() {
  const entry = legacyFaq.entries.find(entry => entry.id === state.selectedFaq);
  if (!entry) return p('FAQが見つかりません。');
  const related = entry.related_faq.map(id => legacyFaq.entries.find(item => item.id === id)).filter(Boolean);
  const panel = card(p(`${entry.course_label} · ${entry.unit} · ${entry.id}`, 'step'), el('h2', { id: entry.id }, entry.question),
    el('div', { class: 'legacy-body' }, entry.body_nodes.map(faqNode)),
    related.length ? el('details', {}, el('summary', {}, '関連するFAQ'), el('div', { class: 'choices' }, related.map(item => button(item.question, () => openFaq(item.id))))) : null,
    actions(...[['関連する教材を開く', entry.related_page], ['関連するスライドを開く', entry.related_slide]].filter(([, href]) => href).map(([label, href]) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label))),
    actions(button('解決した', () => { state.selectedFaq = null; render(true); }, true), button('相談へ進む', () => {
      const payload = makeFaqHandoff(legacyFaq, entry.id);
      const checked = validateFaqHandoff(legacyFaq, payload);
      prepareConsultation({ appId: '', kind: 'faq', payload, summary: checked.summary });
    })), p('解決しない場合は、表示したFAQを引き継いで相談へ進めます。', 'muted'));
  panel.tabIndex = -1; panel.setAttribute('data-focus-panel', '');
  return panel;
}

function guideIndex(appId) {
  const guide = guideFor(appId);
  if (!draftGuides[appId]) return card(el('h2', {}, appName(appId)), previewComment('この試作では、このアプリの原稿はまだ表示していません。'),
    button('確認のサンプルを試す', () => { state.flow = startFlow(guide, appId); render(true); }));
  const version = guide.version_basis === 'date' ? `${guide.verified_on || '未確認'}確認の原稿` : `対象版 ${guide.app_version || '未確認'}`;
  return card(previewComment('この原稿は確認用です。正式採用前の内容を表示しています。'), el('h2', {}, guide.app_name), p(`${version} · 改訂 ${guide.guide_revision}`, 'muted'),
    el('h3', {}, '困っていることから確認する'),
    el('div', { class: 'choices' }, Object.entries(guide.nodes).filter(([, node]) => node.entry).map(([id, node]) => button(node.title, () => openArticle(appId, id)))),
    el('details', {}, el('summary', {}, `操作の説明から探す（${Object.keys(guide.operations).length}件）`),
      el('div', { class: 'choices' }, Object.entries(guide.operations).map(([id, operation]) => button(operation.title, () => openArticle(appId, id))))),
    el('details', {}, el('summary', {}, '共通の利用条件'), p(guide.general_conditions, 'prose')));
}

function flowPanel() {
  const flow = state.flow;
  const guide = guideFor(flow.appId);
  const block = card(p(appName(flow.appId), 'step'));
  block.tabIndex = -1; block.setAttribute('data-focus-panel', '');
  if (flow.phase === 'question') {
    const node = guide.nodes[flow.nodeId];
    block.classList.add('current-question');
    block.setAttribute('aria-label', 'いまの質問');
    append(block, p(`いまの質問 · 確認 ${flow.history.length + 1}`, 'step'),
      node.conditions ? p(node.conditions, 'muted') : null, flow.guidance ? p(flow.guidance, 'note') : null,
      el('h2', { class: 'choice-title' }, node.question),
      el('div', { class: 'choices' }, node.choices.map(choice => button(choice.label, () => { state.flow = choose(guide, state.flow, choice.id); state.stepIndex = 0; render(true); }))));
  } else if (flow.phase === 'guide') {
    const operation = guide.operations[flow.guideId];
    block.id = flow.guideId || 'inline-guidance';
    append(block, el('h2', {}, operation?.title || '確認する手順'));
    if (operation) {
      const index = Math.min(state.stepIndex, operation.steps.length - 1);
      append(block, operation.conditions ? p(`対象：${operation.conditions}`, 'prose muted') : null,
        flow.guidance ? p(flow.guidance, 'note') : null,
        operation.caution ? el('div', { class: 'note' }, el('h3', {}, '操作前の注意'), p(operation.caution, 'prose')) : null,
        p(`手順 ${index + 1} / ${operation.steps.length}`, 'step'), p(operation.steps[index], 'prose'),
        actions(button('前の手順', () => { state.stepIndex = index - 1; render(true); }, false, { disabled: index === 0 }),
          button('次の手順', () => { state.stepIndex = index + 1; render(true); }, false, { disabled: index === operation.steps.length - 1 })),
        el('details', {}, el('summary', {}, '全手順をまとめて読む'), el('ol', {}, operation.steps.map(step => el('li', { class: 'prose' }, step)))),
        operation.expected ? el('div', { class: 'field' }, el('h3', {}, '正常な結果'), p(operation.expected, 'prose')) : null,
        operation.supplement ? el('details', {}, el('summary', {}, '補足'), p(operation.supplement, 'prose')) : null);
    } else append(block, p(flow.guidance, 'prose'));
    append(block,
      actions(button('解決した', () => { state.flow = { ...flow, phase: 'solved' }; render(true); }, true),
        button('解決しない', () => { state.flow = { ...flow, phase: 'handoff' }; render(true); })));
  } else if (flow.phase === 'solved') {
    append(block, el('h2', {}, '元の作業を続けてください。'), p('この確認だけでは相談の送信や通知は行いません。'));
  } else {
    const payload = makeHandoff(guide, flow, appIds);
    const checked = validateHandoff(payload, guide, appIds);
    append(block, el('h2', {}, '解決しないときは、相談へ進めます。'),
      checked.summary.length ? summary(checked.summary) : p('確認できた内容だけを引き継げます。'),
      p('文章での説明や画像は、次の画面で必要な場合だけ追加します。', 'muted'),
      button('相談へ進む', () => {
        prepareConsultation({ appId: flow.appId, kind: 'guide', payload, summary: checked.summary });
      }, true));
  }
  append(block, actions(
    button('一つ戻る', () => { state.flow = goBack(guide, state.flow); state.stepIndex = 0; render(true); }, false, { disabled: !flow.history.length }),
    button('最初から', () => { state.flow = startFlow(guide, flow.appId, flow.rootId); state.stepIndex = 0; render(true); }),
    ...(flow.phase === 'question' || flow.phase === 'guide' ? [button('相談へ進む', () => { state.flow = { ...flow, phase: 'handoff' }; render(true); })] : []),
  ));
  return block;
}

function inheritedPanel() {
  const rows = state.inherited?.summary || [];
  const target = state.inherited?.kind === 'faq' ? '教材サイトのFAQ' : appName(state.draft.appId);
  return card(el('h2', {}, 'ここまで確認したこと'), p(target, 'step'),
    rows.length ? summary(rows) : p('引継ぎはありません。分かることから入力できます。'));
}

function studentPage() {
  const tabs = actions(button('新しい相談', () => {
    if (state.stage === 'done') {
      if (state.draft.image) URL.revokeObjectURL(state.draft.image.url);
      state.draft = { appId: '', text: '', image: null }; state.inherited = null; state.stage = 'edit';
    }
    state.portalTab = 'compose'; render();
  }, false, { 'aria-pressed': String(state.portalTab === 'compose') }),
    button('自分の相談', () => { state.portalTab = 'cases'; render(); }, false, { 'aria-pressed': String(state.portalTab === 'cases') }));
  const title = state.portalTab === 'cases'
    ? intro('自分の相談', '送った相談への回答や追加の質問を確認できます。')
    : intro('相談する', 'ここまでの確認を引き継いで、必要な内容だけ追加できます。');
  if (state.portalTab === 'cases') return [title, tabs, casePortal()];
  if (state.stage === 'done') return [title, tabs, card(previewComment('受付完了の表示例です。この試作では実際の相談は送信されていません。'), el('h2', {}, state.selectedCase),
    p('受付後は、画面から回答や追加質問を確認できます。'),
    actions(button('自分の相談を見る', () => { state.portalTab = 'cases'; render(true); }, true), button('ヘルプを探す', () => showView('public'))))];
  const body = state.stage === 'review' ? reviewPanel() : composePanel();
  return [title, tabs, el('div', { class: 'layout' }, el('div', { class: 'stack' }, body),
    el('aside', { class: 'stack' }, inheritedPanel(), card(el('h2', {}, '送信する前に'), p('分かることだけで構いません。氏名やメールアドレスを本文に書く必要はありません。'), previewComment('実際の返信は、ヘルプデスクの画面で確認できるようにします。'))))];
}

function composePanel() {
  const appSelect = el('select', { id: 'target', on: { change: event => {
    state.draft.appId = event.target.value;
    if (state.inherited && state.inherited.appId !== state.draft.appId) state.inherited = null;
    render();
  } } },
    el('option', { value: '' }, state.inherited?.kind === 'faq' ? '教材サイトのFAQ' : '分からない・その他'), apps.map(app => el('option', { value: app.id }, app.name)));
  appSelect.value = state.draft.appId;
  const text = el('textarea', { id: 'description', value: state.draft.text, placeholder: '何をしようとして、どこで困りましたか？',
    'aria-describedby': 'description-help', on: { input: event => { state.draft.text = event.target.value; } } });
  const file = el('input', { id: 'screenshot', type: 'file', accept: 'image/png,image/jpeg', on: { change: event => {
    const image = event.target.files[0]; if (!image) return;
    if (!['image/png', 'image/jpeg'].includes(image.type) || image.size > 3 * 1024 * 1024) {
      state.error = 'この試作では3MB以下のPNG・JPEGを1枚選べます。'; render(); return;
    }
    if (state.draft.image) URL.revokeObjectURL(state.draft.image.url);
    state.draft.image = { name: image.name, url: URL.createObjectURL(image) }; state.error = ''; render();
  } } });
  const block = card(el('h2', {}, '追加で伝えたいこと'),
    el('div', { class: 'field' }, el('label', { for: 'target' }, '対象のアプリ'), appSelect),
    el('div', { class: 'field' }, el('label', { for: 'description' }, '困っていること・補足'), text,
      el('small', { id: 'description-help' }, state.inherited?.summary.length ? 'ここまでの確認があれば、追記なしでも進めます。' : 'まずは短い説明だけで構いません。')),
    el('details', {}, el('summary', {}, 'スクリーンショットを付ける（任意）'), p('ほかの人の情報が写っていないか、送信前に確認してください。'), file));
  if (state.draft.image) block.append(imagePreview(), button('画像を外す', () => { URL.revokeObjectURL(state.draft.image.url); state.draft.image = null; render(); }));
  if (state.error) block.append(p(state.error, 'error'));
  block.append(actions(button('送信内容を確認', () => {
    if (!state.draft.text.trim() && !state.inherited?.summary.length) { state.error = '困っていることを一言入力してください。'; render(); document.querySelector('#description').focus(); return; }
    state.error = ''; state.stage = 'review'; render(true);
  }, true)), previewComment('相談の登録は、次の確認画面で「送信する」を押したときに行う設計です。'));
  return block;
}

function imagePreview() { return el('img', { class: 'preview-image', src: state.draft.image.url, alt: '添付するスクリーンショットのプレビュー' }); }

function reviewPanel() {
  const target = state.inherited?.kind === 'faq' ? '教材サイトのFAQ' : appName(state.draft.appId);
  const block = card(el('h2', {}, '送信内容の確認'), p(target, 'step'),
    p(state.draft.text.trim() || '追加の文章はありません。'),
    state.draft.image ? imagePreview() : p('添付なし', 'muted'),
    actions(button('送信する', () => {
      const id = `HD-DEMO-${String(state.cases.length + 1).padStart(3, '0')}`;
      const text = state.draft.text.trim() || state.inherited.summary.map(row => row.answer).join('／');
      state.cases.unshift({ id, appId: state.draft.appId, targetLabel: target, sourceContext: state.inherited?.payload || null,
        title: text.slice(0, 36), status: '受付済み', messages: [{ role: 'student', text }], internal: [] });
      state.selectedCase = id; state.stage = 'done'; render(true);
    }, true), button('内容を直す', () => { state.stage = 'edit'; render(true); })),
    previewComment('試作のため、実際の送信・サーバー保存・メール通知は行いません。'));
  return block;
}

function messageList(record) {
  return record.messages.map(message => el('div', { class: `message ${message.role === 'desk' ? 'desk' : ''}` },
    el('small', {}, message.role === 'desk' ? 'ヘルプデスクからの回答' : '送った内容'), message.text));
}

function caseList(onSelect) {
  return card(el('h2', {}, '相談一覧'), previewComment('サンプルの相談を使った表示例です。この試作で入力した相談も、再読み込みで消えます。'), state.cases.map(record => button([
    el('strong', {}, record.title), el('span', {}, `${record.id} · ${record.targetLabel || appName(record.appId)}`), pill(record.status),
  ], () => onSelect(record), false, { class: 'case-row', 'aria-pressed': String(record.id === state.selectedCase) })));
}

function casePortal() {
  const record = state.cases.find(record => record.id === state.selectedCase) || state.cases[0];
  const followup = el('textarea', { id: 'followup', placeholder: '追加で分かったことを入力' });
  const detail = card(p(record.id, 'step'), el('h2', {}, record.title), pill(record.status), el('div', { class: 'actions' }),
    messageList(record), el('div', { class: 'field' }, el('label', { for: 'followup' }, '追加の情報'), followup),
    actions(button('送信する', () => {
      if (!followup.value.trim()) { followup.focus(); return; }
      record.messages.push({ role: 'student', text: followup.value.trim() }); record.status = '追加情報あり'; render(true);
    }, true), button('解決した', () => { record.status = '解決確認済み'; render(true); }),
    button('まだ解決しない', () => { record.status = '再調査待ち'; render(true); })));
  return el('div', { class: 'layout' }, caseList(record => { state.selectedCase = record.id; render(true); }), detail);
}

function adminPage() {
  const record = state.cases.find(record => record.id === state.selectedCase) || state.cases[0];
  const draft = state.replyDrafts[record.id] || '';
  const reply = el('textarea', { id: 'reply', value: draft, placeholder: '生徒に示す回答だけを入力', on: { input: event => {
    state.replyDrafts[record.id] = event.target.value; state.replyPreview = null;
    const confirm = document.querySelector('#confirm-reply'); if (confirm) confirm.disabled = true;
  } } });
  const detail = card(p(record.id, 'step'), el('h2', {}, record.title), pill(record.status), el('div', { class: 'actions' }),
    messageList(record),
    el('details', {}, el('summary', {}, '内部メモ（生徒には表示しない）'), record.internal.map(note => p(note)),
      button('教員判断待ちにする', () => { record.status = '教員判断待ち'; record.internal.push('教員の判断を待つ状態の表示例です。'); render(); })),
    el('div', { class: 'field' }, el('label', { for: 'reply' }, '生徒向けの回答案'), reply),
    p('自動回答は採用済み資料の範囲に限ります。資料外の判断や修正は教員の確認へ進めます。', 'muted'),
    actions(button('生徒向け表示を確認', () => { state.replyPreview = { caseId: record.id, text: state.replyDrafts[record.id] || '' }; render(); }, true)));
  const preview = state.replyPreview;
  if (preview?.caseId === record.id) detail.append(el('div', { class: 'note' }, el('h3', {}, '回答の表示確認'), p(preview.text || '回答を入力してください。'),
    button('返信を確定する（試作）', () => {
      if (state.replyPreview !== preview || state.selectedCase !== record.id || state.replyDrafts[record.id] !== preview.text || !preview.text.trim()) return;
      record.messages.push({ role: 'desk', text: preview.text.trim() }); record.status = '再確認待ち'; state.replyDrafts[record.id] = ''; state.replyPreview = null; render(true);
    }, true, { id: 'confirm-reply', disabled: !preview.text.trim() })));
  detail.append(el('details', {}, el('summary', {}, '修正が必要な場合'), previewComment(
    p('対象・変更案・影響・検証・復元方法を案件ごとに確認してから承認する設計です。'),
    p('この試作にはコード修正・承認記録・実行処理は接続していません。'))));
  return [intro('相談を確認する', '相談の内容や回答案を確認できます。'),
    previewComment('教員用の表示例です。本番では、案件・内部メモ・回答・修正承認へのアクセスをサーバー側で認可します。'),
    el('div', { class: 'layout' }, el('div', { class: 'stack' }, caseList(record => { state.selectedCase = record.id; state.replyPreview = null; render(true); }),
      card(el('h2', {}, '公開用資料の確認'), p('Webへの配信と自動回答への採用を別に管理します。'),
        el('table', {}, el('tbody', {}, el('tr', {}, el('th', {}, '資料'), el('td', {}, '確認用原稿とサンプル')), el('tr', {}, el('th', {}, 'Web配信'), el('td', {}, '試作専用ページで確認')), el('tr', {}, el('th', {}, '自動回答'), el('td', {}, '未採用')))))), detail)];
}

document.querySelector('#theme').addEventListener('change', event => { document.documentElement.dataset.theme = event.target.value; });
document.querySelector('#size').addEventListener('change', event => { document.documentElement.dataset.size = event.target.value; });
window.addEventListener('popstate', () => {
  const view = new URL(location.href).searchParams.get('view'); state.view = ['public', 'student', 'admin'].includes(view) ? view : 'public';
  if (state.view === 'public') {
    const incoming = legacyLocation(legacyFaq, location.href);
    if (incoming.course || incoming.page || incoming.id) { state.publicKind = 'faq'; state.faqCourse = incoming.course; state.faqPage = incoming.page; state.selectedFaq = incoming.id; }
  }
  render(true);
});
render();
