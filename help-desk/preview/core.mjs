const idPattern = /^(?:op|tr)-[a-z][a-z0-9-]*$/;
const fail = message => { throw new Error(message); };

export function validateGuide(guide) {
  if (guide.format_version !== 2 || !Number.isInteger(guide.guide_revision) || guide.guide_revision < 1) fail('文書の版が不正です。');
  for (const [id, operation] of Object.entries(guide.operations)) {
    if (!idPattern.test(id) || !id.startsWith('op-') || !operation.title || !Array.isArray(operation.steps) || !operation.steps.length
      || operation.steps.some(step => typeof step !== 'string' || !step.trim())) fail('操作案内の定義が不正です。');
  }
  const entries = Object.entries(guide.nodes).filter(([, node]) => node.entry).map(([id]) => id);
  if (!entries.length) fail('切り分けの入口がありません。');
  for (const [id, node] of Object.entries(guide.nodes)) {
    if (!idPattern.test(id) || !id.startsWith('tr-') || typeof node.entry !== 'boolean' || !node.question || !node.choices?.length) fail('質問の定義が不正です。');
    const choices = new Set();
    for (const choice of node.choices) {
      if (!/^[a-z][a-z0-9-]*$/.test(choice.id) || choices.has(choice.id) || !choice.label) fail('選択肢IDが不正です。');
      choices.add(choice.id);
      if (choice.next === 'question') {
        if (!Object.hasOwn(guide.nodes, choice.ref)) fail('次の質問がありません。');
      } else if (choice.next === 'guide') {
        if (choice.ref === '-' ? !choice.guidance : !Object.hasOwn(guide.operations, choice.ref)) fail('案内先がありません。');
      } else if (choice.next !== 'handoff' || choice.ref !== '-') fail('分岐の処理が不正です。');
      if (choice.id === 'other' && choice.next !== 'handoff') fail('文章での相談はヘルプデスクへ進めます。');
    }
    if (['other', 'unknown', 'unavailable'].some(id => !choices.has(id))) fail('必要な選択肢がありません。');
  }
  const visited = new Set();
  function walk(id, path) {
    if (path.has(id)) fail('質問が循環しています。');
    visited.add(id);
    const nextPath = new Set([...path, id]);
    for (const choice of guide.nodes[id].choices) if (choice.next === 'question') walk(choice.ref, nextPath);
  }
  entries.forEach(id => walk(id, new Set()));
  if (visited.size !== Object.keys(guide.nodes).length) fail('入口から到達できない質問があります。');
  return entries;
}

export function startFlow(guide, appId, rootId = validateGuide(guide)[0]) {
  if (guide.app_id && guide.app_id !== appId) fail('文書の対象アプリが一致しません。');
  if (!Object.hasOwn(guide.nodes, rootId) || !guide.nodes[rootId].entry) fail('入口が不正です。');
  return { appId, rootId, phase: 'question', nodeId: rootId, history: [], guideId: null, guidance: '' };
}

export function choose(guide, state, choiceId) {
  if (state.phase !== 'question') fail('この状態では回答できません。');
  const option = guide.nodes[state.nodeId].choices.find(choice => choice.id === choiceId);
  if (!option) fail('選択肢がありません。');
  return {
    ...state,
    history: [...state.history, { item_id: state.nodeId, choice_id: choiceId }],
    phase: option.next,
    nodeId: option.next === 'question' ? option.ref : null,
    guideId: option.next === 'guide' && option.ref !== '-' ? option.ref : null,
    guidance: option.guidance || '',
  };
}

function exactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every(key => Object.hasOwn(value, key));
}

// ローカル試作の検証用。実版ではGAS側でも同等以上の検証・本人確認が必要。
export function validateHandoff(payload, guide, appIds) {
  const keys = ['app_id', 'guide_revision', 'app_version', 'root_id', 'answers'];
  if (!exactKeys(payload, keys) && !exactKeys(payload, [...keys, 'viewed_item_id'])) fail('引継ぎ項目が不正です。');
  if (!appIds.includes(payload.app_id)) fail('対象アプリが不正です。');
  if (payload.guide_revision !== guide.guide_revision || payload.app_version !== guide.app_version) fail('文書の版が一致しません。');
  if (!Array.isArray(payload.answers) || payload.answers.length > 5) fail('回答数が不正です。');
  let state = startFlow(guide, payload.app_id, payload.root_id);
  const summary = [];
  for (const answer of payload.answers) {
    if (!exactKeys(answer, ['item_id', 'choice_id']) || state.phase !== 'question' || answer.item_id !== state.nodeId) fail('回答の経路が不正です。');
    const node = guide.nodes[state.nodeId];
    const choice = node.choices.find(c => c.id === answer.choice_id);
    if (!choice) fail('回答の選択肢が不正です。');
    summary.push({ question: node.question, answer: choice.label });
    state = choose(guide, state, answer.choice_id);
  }
  if (Object.hasOwn(payload, 'viewed_item_id')) {
    if (typeof payload.viewed_item_id !== 'string' || !Object.hasOwn(guide.operations, payload.viewed_item_id)) fail('参照した説明が不正です。');
    summary.push({ question: '表示した説明', answer: guide.operations[payload.viewed_item_id].title });
  }
  return { state, summary };
}

export function makeHandoff(guide, state, appIds) {
  const payload = {
    app_id: state.appId, guide_revision: guide.guide_revision, app_version: guide.app_version,
    root_id: state.rootId, answers: state.history.map(answer => ({ item_id: answer.item_id, choice_id: answer.choice_id })),
  };
  if (state.guideId) payload.viewed_item_id = state.guideId;
  validateHandoff(payload, guide, appIds);
  return payload;
}

export function goBack(guide, state) {
  if (!state.history.length) return startFlow(guide, state.appId, state.rootId);
  return returnToQuestion(guide, state, state.history.length - 1);
}

export function returnToQuestion(guide, state, index) {
  if (!Number.isInteger(index) || index < 0 || index >= state.history.length) fail('戻る質問が不正です。');
  let previous = startFlow(guide, state.appId, state.rootId);
  for (const answer of state.history.slice(0, index)) {
    if (previous.phase !== 'question' || answer.item_id !== previous.nodeId) fail('回答の経路が不正です。');
    previous = choose(guide, previous, answer.choice_id);
  }
  if (previous.phase !== 'question' || previous.nodeId !== state.history[index].item_id) fail('回答の経路が不正です。');
  return previous;
}

export function answeredQuestions(guide, state) {
  return validateHandoff({
    app_id: state.appId, guide_revision: guide.guide_revision, app_version: guide.app_version,
    root_id: state.rootId, answers: state.history,
  }, guide, [state.appId]).summary;
}

export function findArticles(guides, query, appId = null) {
  const normalize = value => String(value || '').normalize('NFKC').toLowerCase();
  const terms = normalize(query).trim().split(/\s+/).filter(Boolean);
  if (!terms.length) return [];
  const matches = [];
  for (const [id, guide] of Object.entries(guides)) {
    if (appId && id !== appId) continue;
    const candidates = [
      ...Object.entries(guide.operations).map(([itemId, item]) => ({ ...item, itemId, kind: 'operation' })),
      ...Object.entries(guide.nodes).filter(([, item]) => item.entry).map(([itemId, item]) => ({ ...item, itemId, kind: 'symptom' })),
    ];
    for (const item of candidates) {
      const title = normalize(item.title);
      const all = normalize([guide.app_name, id, item.title, item.conditions, item.expected, item.caution,
        ...(item.steps || []), item.question, item.symptom, ...(item.choices || []).map(choice => choice.label)].join('\n'));
      if (terms.every(term => all.includes(term))) matches.push({
        appId: id, itemId: item.itemId, kind: item.kind, title: item.title,
        score: terms.reduce((score, term) => score + (title.includes(term) ? 3 : 1), 0),
      });
    }
  }
  return matches.sort((a, b) => b.score - a.score || a.title.localeCompare(b.title, 'ja'));
}
