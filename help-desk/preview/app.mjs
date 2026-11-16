import { apps, guide as sampleGuide, sampleCases } from './data.mjs?v=worksheet-20261116';
import { draftGuides } from './draft-guides.mjs?v=worksheet-20261116';
import { legacyFaq } from './legacy-faq.mjs';
import { validateGuide, startFlow, choose, returnToQuestion, answeredQuestions, makeHandoff, validateHandoff, findArticles } from './core.mjs?v=question-flow-20261116';
import { findFaqs, makeFaqHandoff, validateFaqHandoff, courseFilters, makeCourseHandoff, validateCourseHandoff, legacyLocation } from './faq-core.mjs?v=target-tabs-20261116';
import { mountDisplayControls } from './display-ui.mjs?v=site-header-20261116';

validateGuide(sampleGuide);
Object.values(draftGuides).forEach(validateGuide);
const appIds = apps.map(app => app.id);
const appName = id => apps.find(app => app.id === id)?.name || '分からない・その他';
const guideFor = id => draftGuides[id] || sampleGuide;
const publicTargets = [
  ...apps.map(app => ({ key: 'app:' + app.id, kind: 'app', id: app.id, label: app.name })),
  ...[...new Map(legacyFaq.entries.map(entry => [entry.course, entry.course_label]))].map(([id, label]) => ({ key: 'course:' + id, kind: 'course', id, label })),
];
const main = document.querySelector('#main');
const state = {
  view: new URL(location.href).searchParams.get('view') || 'public',
  publicTarget: '', targetPickerOpen: false, publicMode: 'search', search: '', searchDraft: '', searchItem: null, selectedApp: null,
  selectedFaq: null, courseFaq: null, courseAnswers: [], courseLimit: 15, faqPage: '', faqUnit: '', faqCategory: '', faqLimit: 15,
  flow: null, inherited: null, portalTab: 'cases', stage: 'edit',
  draft: { appId: '', text: '', image: null }, error: '',
  cases: structuredClone(sampleCases), selectedCase: 'HD-DEMO-001', replyDrafts: Object.create(null), replyPreview: null,
};
if (!['public', 'student', 'admin'].includes(state.view)) state.view = 'public';
if (state.view === 'public') applyPublicLocation(location.href);

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
  if (view === 'public') addPublicRoute(url);
  history.pushState(null, '', url);
  render(true);
}
function render(focus = false) {
  const route = new URL(location.pathname, location.origin);
  route.searchParams.set('view', state.view);
  if (state.view === 'public') addPublicRoute(route);
  history.replaceState(null, '', route);
  document.querySelector('#views').replaceChildren(
    ...[['public', 'ヘルプを探す'], ['student', '自分の相談'], ['admin', '管理画面（試作）']].map(([view, label]) =>
      button(label, () => { if (view === 'student') state.portalTab = 'cases'; showView(view); }, false,
        { 'aria-current': state.view === view && (view !== 'student' || state.portalTab === 'cases') ? 'page' : false })),
  );
  main.replaceChildren(...(state.view === 'public' ? publicPage() : state.view === 'student' ? studentPage() : adminPage()));
  if (focus) {
    const panel = main.querySelector('[data-focus-panel]') || main;
    panel.focus();
  }
}

function targetDetails() {
  return publicTargets.find(target => target.key === state.publicTarget) || null;
}

function setPublicTarget(key) {
  if (key && !publicTargets.some(target => target.key === key)) return false;
  state.publicTarget = key;
  state.targetPickerOpen = false;
  const target = targetDetails();
  state.selectedApp = target?.kind === 'app' ? target.id : null;
  state.search = ''; state.searchDraft = ''; state.searchItem = null; state.selectedFaq = null; state.courseFaq = null;
  state.flow = null; state.courseAnswers = []; state.courseLimit = 15;
  state.faqPage = ''; state.faqUnit = ''; state.faqCategory = ''; state.faqLimit = 15;
  return true;
}

function applyPublicLocation(href, preserve = false) {
  const incoming = legacyLocation(legacyFaq, href);
  const entry = legacyFaq.entries.find(item => item.id === incoming.id);
  const pageCourses = new Set(legacyFaq.entries.filter(item => item.display_pages.includes(incoming.page)).map(item => item.course));
  const course = entry?.course || incoming.course || (pageCourses.size === 1 ? [...pageCourses][0] : '');
  const app = new URL(href).searchParams.get('app');
  const key = course ? 'course:' + course : apps.some(item => item.id === app) ? 'app:' + app : '';
  if (!preserve || key !== state.publicTarget) { setPublicTarget(key); state.publicMode = 'search'; }
  state.faqPage = incoming.page;
  if (state.publicMode === 'questions' && course) state.courseFaq = incoming.id;
  else state.selectedFaq = incoming.id;
}

function addPublicRoute(url) {
  const target = targetDetails();
  if (target) url.searchParams.set(target.kind === 'course' ? 'course' : 'app', target.id);
  if (target?.kind === 'course') {
    const faq = state.publicMode === 'questions' ? state.courseFaq : state.selectedFaq;
    if (faq) url.hash = faq;
    if (state.publicMode === 'search' && state.faqPage) url.searchParams.set('page', state.faqPage);
  }
}

function switchPublicMode(mode) {
  if (!['search', 'questions'].includes(mode)) return;
  state.publicMode = mode; render();
  document.querySelector('#help-tab-' + mode)?.focus();
}

function publicPage() {
  const target = targetDetails();
  const pickerOpen = !target || state.targetPickerOpen;
  const select = el('select', { id: 'public-target', on: { change: event => {
    if (!setPublicTarget(event.target.value)) return;
    render(); document.querySelector('#change-target')?.focus();
  } } }, el('option', { value: '', disabled: true }, '対象を選んでください'),
  ...[['app', 'アプリ・サービス'], ['course', '教材サイトのコース']].map(([kind, label]) =>
    el('optgroup', { label }, publicTargets.filter(target => target.kind === kind).map(target => el('option', { value: target.key }, target.label)))));
  select.value = state.publicTarget;
  const picker = el('div', { id: 'target-picker', class: 'target-picker', hidden: !pickerOpen }, pickerOpen
    ? el('div', { class: 'field target-field' }, el('label', { for: 'public-target' }, 'アプリ・教材コース'), select) : null);
  if (!target) return [intro('ヘルプを探す', '何について調べますか？'), picker];
  const heading = el('div', { class: 'public-heading' }, intro(target.label + 'のヘルプ', '検索するか、質問に答えて確認できます。'),
    button(state.targetPickerOpen ? '対象の変更を閉じる' : '対象を変更', () => {
      state.targetPickerOpen = !state.targetPickerOpen; render();
      document.querySelector(state.targetPickerOpen ? '#public-target' : '#change-target')?.focus();
    }, false, { id: 'change-target', class: 'quiet-button', 'aria-controls': 'target-picker', 'aria-expanded': String(state.targetPickerOpen) }));
  const modes = [['search', '検索する'], ['questions', '質問に答える']];
  const tabs = el('div', { class: 'help-tabs', role: 'tablist', 'aria-label': 'ヘルプの探し方' }, modes.map(([mode, label], index) =>
    el('button', { type: 'button', id: 'help-tab-' + mode, role: 'tab', 'aria-controls': 'help-panel-' + mode,
      'aria-selected': String(state.publicMode === mode), tabindex: state.publicMode === mode ? '0' : '-1',
      on: { click: () => switchPublicMode(mode), keydown: event => {
        if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? 1 : (index + 1) % 2;
        switchPublicMode(modes[next][0]);
      } } }, label)));
  const panels = modes.map(([mode]) => el('div', { id: 'help-panel-' + mode, role: 'tabpanel',
    'aria-labelledby': 'help-tab-' + mode, hidden: state.publicMode !== mode },
    state.publicMode !== mode ? null : mode === 'search' ? searchPanel(target)
      : target.kind === 'app' ? guideSessionPage() : courseQuestionPanel(target)));
  return [heading, picker, tabs,
    el('div', { class: 'layout' }, el('div', { class: 'stack' }, panels), publicSidebar())];
}

function publicSidebar() {
  return el('aside', { class: 'stack' },
    previewComment('6アプリの原稿、ワークシートの提出・確認、教材サイトの5コースのFAQを確認用に表示します。正式運用と自動回答への採用は未実施です。'));
}

function searchPanel(target) {
  const input = el('input', { id: 'search', type: 'search', maxlength: '200', value: state.searchDraft,
    placeholder: '例：保存、画像、開けない', 'aria-label': target.label + 'のヘルプを検索',
    on: { input: event => { state.searchDraft = event.target.value; } } });
  const form = card(el('form', { class: 'search', on: { submit: event => {
    event.preventDefault(); state.search = input.value.trim(); state.searchItem = null; state.selectedFaq = null; state.faqLimit = 15; render(true);
  } } }, input, el('button', { type: 'submit' }, '検索')));
  let result;
  if (target.kind === 'course') result = state.selectedFaq ? faqPanel() : faqIndex(target);
  else if (state.searchItem) result = operationSearchPanel(target);
  else {
    const guide = draftGuides[target.id];
    const matches = state.search ? findArticles(draftGuides, state.search, target.id)
      : Object.entries(guide?.operations || {}).map(([itemId, item]) => ({ appId: target.id, itemId, kind: 'operation', title: item.title }));
    result = focusPanel(card(el('h2', {}, state.search ? '検索結果' : '操作の説明'), p(matches.length + '件', 'step'),
      el('div', { class: 'choices' }, matches.map(item => button([
        el('strong', {}, item.title), el('small', { class: 'muted' }, item.kind === 'symptom' ? '質問に答えて確認する' : '操作の説明'),
      ], () => openArticle(target.id, item.itemId)))),
      matches.length ? null : p('該当する説明がありません。検索語を変えるか、「質問に答える」へ切り替えてください。')));
  }
  return el('div', { class: 'stack' }, form, result);
}

function operationContent(operation, guidance = '') {
  const supplements = [...new Set([guidance, operation.supplement].filter(Boolean))];
  return [
    operation.conditions || operation.caution ? el('details', { class: 'operation-notes' }, el('summary', {}, '始める前の確認'),
      operation.conditions ? el('div', {}, el('h4', {}, '使える場面'), p(operation.conditions, 'prose')) : null,
      operation.caution ? el('div', {}, el('h4', {}, '注意すること'), p(operation.caution, 'prose')) : null) : null,
    el('section', { class: 'procedure', 'aria-label': '手順' }, el('h3', {}, '手順'),
      el('ol', { class: 'operation-steps' }, operation.steps.map(step => el('li', { class: 'prose' }, step)))),
    operation.expected ? el('details', { class: 'operation-notes' }, el('summary', {}, 'できたときの表示・状態'), p(operation.expected, 'prose')) : null,
    supplements.length ? el('details', { class: 'operation-notes' }, el('summary', {}, '補足'), supplements.map(text => p(text, 'prose'))) : null,
  ];
}

function solutionActions(onSolved, onUnsolved) {
  return actions(button('解決した', onSolved, true), button('解決しない', onUnsolved));
}

function consultAboutGuide(guide, flow, unresolved = false) {
  const payload = makeHandoff(guide, flow, appIds);
  const checked = validateHandoff(payload, guide, appIds);
  const rows = unresolved ? [...checked.summary, { question: '案内の結果', answer: '解決しなかった' }] : checked.summary;
  return prepareConsultation({ appId: flow.appId, kind: 'guide', payload, summary: rows });
}

function answerGuideQuestion(guide, choiceId) {
  const next = choose(guide, state.flow, choiceId);
  if (next.phase === 'handoff') {
    if (consultAboutGuide(guide, next)) state.flow = next;
  } else { state.flow = next; render(true); }
}

function operationSearchPanel(target) {
  const guide = guideFor(target.id);
  const operation = guide.operations[state.searchItem.itemId];
  return focusPanel(card(el('h2', {}, operation.title), operationContent(operation),
    solutionActions(() => { state.searchItem = null; render(true); }, () => {
        const flow = { ...startFlow(guide, target.id), phase: 'guide', guideId: state.searchItem.itemId };
        consultAboutGuide(guide, flow, true);
      })));
}

function focusPanel(panel) {
  panel.tabIndex = -1; panel.setAttribute('data-focus-panel', ''); return panel;
}

function currentQuestion(panel) {
  focusPanel(panel); panel.classList.add('current-question'); panel.setAttribute('aria-label', 'いまの質問'); return panel;
}

function guideSessionPage() {
  const currentPanel = state.flow ? flowPanel() : currentQuestion(guideIndex(state.selectedApp));
  return el('div', { class: 'stack' }, answerHistoryPanel(), currentPanel);
}

function historyPanel(rows) {
  if (!rows.length) return null;
  return card(el('h2', {}, 'ここまでの回答'), el('ol', { class: 'answer-history' }, rows.map(row => el('li', {},
    el('div', {}, el('small', {}, row.question), p(row.answer)),
    button('変更する', row.change, false, { 'aria-label': row.question + 'の回答を変更する' })))));
}

function answerHistoryPanel() {
  if (!state.flow) return null;
  const flow = state.flow, guide = guideFor(flow.appId);
  const rows = [{ question: '困っていること', answer: guide.nodes[flow.rootId].title || guide.nodes[flow.rootId].question,
    change: () => { state.flow = null; render(true); } }];
  answeredQuestions(guide, flow).forEach((row, index) => rows.push({ ...row, change: () => {
    state.flow = returnToQuestion(guide, flow, index); render(true);
  } }));
  return historyPanel(rows);
}

function openArticle(appId, itemId) {
  if (state.publicTarget !== 'app:' + appId) setPublicTarget('app:' + appId);
  const guide = guideFor(appId);
  if (itemId.startsWith('tr-')) {
    state.publicMode = 'questions'; state.flow = startFlow(guide, appId, itemId);
  } else {
    state.publicMode = 'search'; state.searchItem = { appId, itemId };
  }
  render(true);
}

function openFaq(id) {
  const entry = legacyFaq.entries.find(entry => entry.id === id);
  if (!entry) return;
  if (state.publicTarget !== 'course:' + entry.course) {
    setPublicTarget('course:' + entry.course); state.publicMode = 'search';
  }
  if (state.publicMode === 'questions') state.courseFaq = id;
  else state.selectedFaq = id;
  showView('public');
}

function faqIndex(target) {
  const choices = (values, id, label, current, handler) => {
    const select = el('select', { id, on: { change: event => handler(event.target.value) } }, el('option', { value: '' }, 'すべて'),
      values.map(item => el('option', { value: item.value }, item.label)));
    select.value = current;
    return el('div', { class: 'field' }, el('label', { for: id }, label), select);
  };
  const available = courseFilters(legacyFaq, target.id, state.faqUnit);
  const filters = el('details', { open: !!(state.faqUnit || state.faqCategory || state.faqPage) }, el('summary', {}, '単元・内容の種類で絞り込む'),
    choices(available.units, 'faq-unit', '単元', state.faqUnit, value => { state.faqUnit = value; state.faqCategory = ''; state.faqLimit = 15; render(); }),
    choices(available.categories, 'faq-category', '内容の種類', state.faqCategory, value => { state.faqCategory = value; state.faqLimit = 15; render(); }));
  if (state.faqPage) append(filters, p('教材ページ：' + state.faqPage, 'muted'),
    button('ページの絞り込みを解除', () => { state.faqPage = ''; render(); }));
  const matches = findFaqs(legacyFaq, state.search, { course: target.id, page: state.faqPage, unit: state.faqUnit, category: state.faqCategory });
  return focusPanel(card(el('h2', {}, state.search ? '検索結果' : 'FAQの説明'), filters, p(matches.length + '件', 'step'),
    el('div', { class: 'choices' }, matches.slice(0, state.faqLimit).map(entry => button([
      el('strong', {}, entry.question), el('small', { class: 'muted' }, entry.unit),
    ], () => openFaq(entry.id)))),
    matches.length === 0 ? p('該当するFAQがありません。検索語や絞り込みを変えられます。') : null,
    matches.length > state.faqLimit ? actions(button('さらに15件表示', () => { state.faqLimit += 15; render(); })) : null));
}

function beginCourseConsultation(target) {
  const payload = makeCourseHandoff(legacyFaq, target.id, state.courseAnswers[0] || '', state.courseAnswers[1] || '');
  const checked = validateCourseHandoff(legacyFaq, payload);
  prepareConsultation({ appId: '', kind: 'course', targetLabel: checked.label, payload, summary: checked.summary });
}

function courseQuestionPanel(target) {
  const answers = state.courseAnswers;
  const available = courseFilters(legacyFaq, target.id, answers[0] || '');
  const rows = answers.map((value, index) => ({ question: index === 0 ? '単元' : '内容の種類',
    answer: value ? index === 0 ? value : available.categories.find(item => item.value === value).label : '分からない',
    change: () => { state.courseAnswers = answers.slice(0, index); state.courseFaq = null; state.courseLimit = 15; render(true); } }));
  if (state.courseFaq) {
    return el('div', { class: 'stack' }, historyPanel(rows), faqPanel(state.courseFaq));
  }
  let panel;
  if (answers.length < 2) {
    const index = answers.length;
    const options = index === 0 ? available.units : available.categories;
    panel = currentQuestion(card(p('いまの質問 · 確認 ' + (index + 1), 'step'),
      el('h2', {}, index === 0 ? 'どの単元についてですか？' : 'どんな内容についてですか？'),
      el('div', { class: 'choices' }, [...options, { value: '', label: '分からない・絞り込まずに進む' }].map(item =>
        button(item.label, () => { state.courseAnswers = [...answers, item.value]; state.courseLimit = 15; render(true); }))),
      actions(button('選択肢にない・文章で説明する', () => beginCourseConsultation(target)),
        button('今は確認できない', () => beginCourseConsultation(target)))));
  } else {
    const matches = findFaqs(legacyFaq, '', { course: target.id, unit: answers[0], category: answers[1] });
    panel = currentQuestion(card(p('いまの質問 · 確認 3', 'step'), el('h2', {}, '近い内容はありますか？'),
      el('div', { class: 'choices' }, matches.slice(0, state.courseLimit).map(entry => button(entry.question, () => openFaq(entry.id)))),
      matches.length > state.courseLimit ? button('さらに15件表示', () => { state.courseLimit += 15; render(); }) : null,
      actions(button('当てはまる説明がない', () => beginCourseConsultation(target), true))));
  }
  return el('div', { class: 'stack' }, historyPanel(rows), panel);
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
  if (state.stage !== 'done' && (state.draft.text || state.draft.image) && !window.confirm('入力中の相談があります。入力を消して、今回の相談に切り替えますか？')) return false;
  if (state.draft.image) URL.revokeObjectURL(state.draft.image.url);
  state.draft = { appId: context.appId, text: '', image: null };
  state.inherited = context; state.portalTab = 'compose'; state.stage = 'edit'; state.error = ''; showView('student');
  return true;
}

function faqPanel(id = state.selectedFaq) {
  const entry = legacyFaq.entries.find(entry => entry.id === id);
  if (!entry) return p('FAQが見つかりません。');
  const related = entry.related_faq.map(id => legacyFaq.entries.find(item => item.id === id)).filter(Boolean);
  const panel = card(p(`${entry.course_label} · ${entry.unit}`, 'step'), el('h2', { id: entry.id }, entry.question),
    el('div', { class: 'legacy-body' }, entry.body_nodes.map(faqNode)),
    related.length ? el('details', {}, el('summary', {}, '関連するFAQ'), el('div', { class: 'choices' }, related.map(item => button(item.question, () => openFaq(item.id))))) : null,
    actions(...[['関連する教材を開く', entry.related_page], ['関連するスライドを開く', entry.related_slide]].filter(([, href]) => href).map(([label, href]) => el('a', { href, target: '_blank', rel: 'noopener noreferrer' }, label))),
    solutionActions(() => {
      if (state.publicMode === 'questions') state.courseFaq = null;
      else state.selectedFaq = null;
      render(true);
    }, () => {
      const payload = makeFaqHandoff(legacyFaq, entry.id);
      const checked = validateFaqHandoff(legacyFaq, payload);
      prepareConsultation({ appId: '', kind: 'faq', payload,
        summary: [...checked.summary, { question: '案内の結果', answer: '解決しなかった' }] });
    }));
  panel.tabIndex = -1; panel.setAttribute('data-focus-panel', '');
  return panel;
}

function guideIndex(appId) {
  const guide = guideFor(appId);
  if (!draftGuides[appId]) return card(el('h2', {}, appName(appId)), previewComment('この試作では、このアプリの原稿はまだ表示していません。'),
    button('確認のサンプルを試す', () => { state.flow = startFlow(guide, appId); render(true); }));
  const version = guide.version_basis === 'date' ? `${guide.verified_on || '未確認'}確認の原稿` : `対象版 ${guide.app_version || '未確認'}`;
  return card(previewComment('この原稿は確認用です。正式採用前の内容を表示しています。'), el('h2', {}, guide.app_name), p(`${version} · 改訂 ${guide.guide_revision}`, 'muted'),
    p('いまの質問', 'step'), el('h3', {}, '困っていることを選んでください'),
    el('div', { class: 'choices' }, Object.entries(guide.nodes).filter(([, node]) => node.entry).map(([id, node]) => button(node.title, () => openArticle(appId, id)))),
    el('details', {}, el('summary', {}, '共通の利用条件'), p(guide.general_conditions, 'prose')));
}

function flowPanel() {
  const flow = state.flow;
  const guide = guideFor(flow.appId);
  const block = card();
  block.tabIndex = -1; block.setAttribute('data-focus-panel', '');
  if (flow.phase === 'question') {
    const node = guide.nodes[flow.nodeId];
    block.classList.add('current-question');
    block.setAttribute('aria-label', 'いまの質問');
    append(block, p(`いまの質問 · 確認 ${flow.history.length + 1}`, 'step'),
      node.conditions ? p(node.conditions, 'muted') : null, flow.guidance ? p(flow.guidance, 'note') : null,
      el('h2', { class: 'choice-title' }, node.question),
      el('div', { class: 'choices' }, node.choices.map(choice => button(choice.label, () => answerGuideQuestion(guide, choice.id)))));
  } else if (flow.phase === 'guide') {
    const operation = guide.operations[flow.guideId];
    block.id = flow.guideId || 'inline-guidance';
    append(block, el('h2', {}, operation?.title || '確認する手順'));
    if (operation) append(block, operationContent(operation, flow.guidance));
    else append(block, el('section', { class: 'procedure' }, el('h3', {}, '確認すること'), p(flow.guidance, 'prose')));
    append(block,
      solutionActions(() => { state.flow = { ...flow, phase: 'solved' }; render(true); }, () => consultAboutGuide(guide, flow, true)));
  } else if (flow.phase === 'solved') {
    append(block, el('h2', {}, '元の作業を続けてください。'), p('この確認だけでは相談の送信や通知は行いません。'));
  } else {
    append(block, el('h2', {}, '相談の入力画面を開きました。'),
      p('入力中の内容は、上の「自分の相談」から再開できます。'));
  }
  return block;
}

function inheritedPanel() {
  const rows = state.inherited?.summary || [];
  const target = consultationTarget();
  return card(el('h2', {}, 'ここまで確認したこと'), p(target, 'step'),
    rows.length ? summary(rows) : p('引継ぎはありません。分かることから入力できます。'));
}

function consultationTarget() {
  return state.inherited?.targetLabel || (state.inherited?.kind === 'faq' ? '教材サイトのFAQ' : appName(state.draft.appId));
}

function studentPage() {
  const title = state.portalTab === 'cases'
    ? intro('自分の相談', '送った相談への回答や追加の質問を確認できます。')
    : intro('相談する', 'ここまでの確認を引き継いで、必要な内容だけ追加できます。');
  if (state.portalTab === 'cases') return [title,
    state.inherited && state.stage !== 'done' ? card(p('送信前の相談があります。'),
      button('入力中の相談を続ける', () => { state.portalTab = 'compose'; render(true); })) : null, casePortal()];
  if (state.stage === 'done') return [title, card(previewComment('受付完了の表示例です。この試作では実際の相談は送信されていません。'), el('h2', {}, state.selectedCase),
    p('受付後は、画面から回答や追加質問を確認できます。'),
    actions(button('自分の相談を見る', () => { state.portalTab = 'cases'; render(true); }, true), button('ヘルプを探す', () => showView('public'))))];
  const body = state.stage === 'review' ? reviewPanel() : composePanel();
  return [title, el('div', { class: 'layout' }, el('div', { class: 'stack' }, body),
    el('aside', { class: 'stack' }, inheritedPanel(), card(el('h2', {}, '送信する前に'), p('分かることだけで構いません。氏名やメールアドレスを本文に書く必要はありません。'), previewComment('実際の返信は、ヘルプデスクの画面で確認できるようにします。'))))];
}

function composePanel() {
  const appSelect = el('select', { id: 'target', on: { change: event => {
    state.draft.appId = event.target.value;
    if (state.inherited && state.inherited.appId !== state.draft.appId) state.inherited = null;
    render();
  } } },
    el('option', { value: '' }, state.inherited?.targetLabel || (state.inherited?.kind === 'faq' ? '教材サイトのFAQ' : '分からない・その他')), apps.map(app => el('option', { value: app.id }, app.name)));
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
    el('div', { class: 'field' }, el('label', { for: 'target' }, '対象'), appSelect),
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
  const target = consultationTarget();
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

mountDisplayControls(document, window);
window.addEventListener('popstate', () => {
  const view = new URL(location.href).searchParams.get('view'); state.view = ['public', 'student', 'admin'].includes(view) ? view : 'public';
  if (state.view === 'public') {
    applyPublicLocation(location.href, true);
  }
  render(true);
});
render();
