// GENERATED: node scripts/build-tools-confirmation-contract.mjs
// 正本: tools/pythoneditor/confirmation.mjs, confirmation-store.mjs の検証関数。手で編集しない。
var ToolsConfirmationContract = (function () {
'use strict';
var P = (function () {
// 確認課題の宣言・学習用進捗。ブラウザの達成結果は正式得点にしない。
const CHECK_TYPES = Object.freeze(['inputCases', 'resultCoverage', 'attemptLimit', 'compareRuns', 'answer']);
const ID = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const object = x => x && Object.prototype.toString.call(x) === '[object Object]';
function fail(message) { throw new Error('確認設定: ' + message); }
function need(test, message) { if (!test) fail(message); }
function keys(value, allowed) { need(object(value) && Object.keys(value).every(k => allowed.includes(k)), '設定項目を確認してください。'); }
function text(value, max = 2000, empty = false) { need(typeof value === 'string' && value.length <= max && (empty || value.length > 0), '文字列の形式・長さを確認してください。'); return value; }
function id(value) { need(typeof value === 'string' && ID.test(value), 'IDを確認してください。'); return value; }
function integer(value, min, max) { need(Number.isSafeInteger(value) && value >= min && value <= max, '整数の範囲を確認してください。'); return value; }
const refKey = ref => ref.version + '/' + ref.questionId;

function parseCodeRefs(raw) {
  if (raw == null || raw === '') return [];
  if (typeof raw === 'string') {
    try { raw = raw.trim().startsWith('[') ? JSON.parse(raw) : raw.split(',').map(part => {
      const a = part.trim().split('@'); need(a.length === 2, '参照元は問題ID@版で指定してください。'); return { questionId: a[0], version: a[1] };
    }); } catch (e) { fail('参照元のJSONまたは問題ID@版を確認してください。'); }
  }
  need(Array.isArray(raw) && raw.length <= 8, '参照元は8件以内です。');
  const seen = new Set();
  return raw.map(ref => { keys(ref, ['questionId','version']); const r = { questionId: id(ref.questionId), version: id(ref.version) };
    need(!seen.has(refKey(r)), '参照元が重複しています。'); seen.add(refKey(r)); return r; });
}
function matcher(raw) { keys(raw, ['mode','text']); need(['exact','lastLine','contains'].includes(raw.mode), '出力の照合方法を確認してください。'); return { mode: raw.mode, text: text(raw.text, 10000, true) }; }
function predicate(raw) {
  keys(raw, ['index','kind','op','value']); const index = integer(raw.index, 0, 63), kind = raw.kind, op = raw.op || 'eq';
  need(['integer','number','text'].includes(kind) && ['eq','ne','gt','gte','lt','lte','any'].includes(op), '入力条件の型・比較方法を確認してください。');
  if (kind === 'text') need(['eq','ne','any'].includes(op), '文字列は一致・不一致で比較してください。');
  if (op === 'any') return { index, kind, op };
  const value = kind === 'text' ? text(raw.value, 2000, true) : raw.value;
  if (kind !== 'text') need(typeof value === 'number' && Number.isFinite(value) && (kind !== 'integer' || Number.isSafeInteger(value)), '入力条件の比較値を確認してください。');
  return { index, kind, op, value };
}
function normalizeCheck(type, raw, options = {}) {
  need(CHECK_TYPES.includes(type), '対応していない確認方式です。');
  if (typeof raw === 'string') { try { raw = JSON.parse(raw); } catch (e) { fail('確認設定のJSONを確認してください。'); } }
  need(object(raw), '確認設定を指定してください。');
  let out;
  if (type === 'inputCases') {
    keys(raw, ['cases','private']); need(Array.isArray(raw.cases) && raw.cases.length >= 1 && raw.cases.length <= 32, '入力ケースは1〜32件です。');
    const seen = new Set(); out = { cases: raw.cases.map(c => { keys(c, ['id','label','inputs']); const cid = id(c.id); need(!seen.has(cid), 'ケースIDが重複しています。'); seen.add(cid);
      need(Array.isArray(c.inputs) && c.inputs.length >= 1 && c.inputs.length <= 16, '入力条件の件数を確認してください。');
      return { id: cid, label: text(c.label, 300), inputs: c.inputs.map(predicate) }; }) };
    if (raw.private !== undefined) { keys(raw.private, ['expectedOutputs']); keys(raw.private.expectedOutputs, [...seen]);
      out.private = { expectedOutputs: Object.fromEntries(Object.entries(raw.private.expectedOutputs).map(([k,v]) => [k, matcher(v)])) }; }
  } else if (type === 'resultCoverage') {
    keys(raw, ['results','requiredDistinct','output']); need(Array.isArray(raw.results) && raw.results.length >= 2 && raw.results.length <= 100, '結果の種類は2〜100件です。');
    const results = raw.results.map(s => text(s, 300)); need(new Set(results).size === results.length, '結果の種類が重複しています。');
    need(['lastLine','exact'].includes(raw.output || 'lastLine'), '結果の読み取り方法を確認してください。');
    out = { results, requiredDistinct: integer(raw.requiredDistinct, 1, results.length), output: raw.output || 'lastLine' };
  } else if (type === 'attemptLimit') {
    keys(raw, ['range','maxGuesses','guessPrompt','successOutput','output']); keys(raw.range, ['min','max']);
    const min = integer(raw.range.min, -1000000000, 1000000000), max = integer(raw.range.max, min, min + 1000000000);
    need(['lastLine','exact'].includes(raw.output || 'lastLine'), '正解表示の読み取り方法を確認してください。');
    out = { range: { min, max }, maxGuesses: raw.maxGuesses === 'theoretical' ? 'theoretical' : integer(raw.maxGuesses, 1, 10000),
      guessPrompt: text(raw.guessPrompt, 1000, true), successOutput: text(raw.successOutput, 1000), output: raw.output || 'lastLine' };
  } else if (type === 'compareRuns') {
    keys(raw, ['conditions','codePolicy','question']); need(Array.isArray(raw.conditions) && raw.conditions.length >= 2 && raw.conditions.length <= 8, '比較条件は2〜8件です。');
    const seen = new Set(); const conditions = raw.conditions.map(c => { keys(c, ['id','label']); const cid = id(c.id); need(!seen.has(cid), '比較条件IDが重複しています。'); seen.add(cid); return { id: cid, label: text(c.label, 300) }; });
    need(['sameCode','variants'].includes(raw.codePolicy), '比較するコードの扱いを確認してください。');
    out = { conditions, codePolicy: raw.codePolicy, ...(raw.question === undefined ? {} : { question: text(raw.question, 2000) }) };
  } else {
    keys(raw, ['format','question','choices','private']); need(['choice','number'].includes(raw.format), '回答形式を確認してください。');
    out = { format: raw.format, question: text(raw.question, 2000) };
    if (raw.format === 'choice') { need(Array.isArray(raw.choices) && raw.choices.length >= 2 && raw.choices.length <= 20, '選択肢は2〜20件です。');
      const seen = new Set(); out.choices = raw.choices.map(c => { keys(c, ['id','label']); const cid = id(c.id); need(!seen.has(cid), '選択肢IDが重複しています。'); seen.add(cid); return { id: cid, label: text(c.label, 300) }; });
    } else need(raw.choices === undefined, '数値回答に選択肢は指定できません。');
    if (raw.private !== undefined) { keys(raw.private, ['expectedAnswer']); const a = raw.private.expectedAnswer;
      need(raw.format === 'choice' ? out.choices.some(c => c.id === a) : typeof a === 'number' && Number.isFinite(a), '正答の形式を確認してください。'); out.private = { expectedAnswer: a }; }
  }
  if (options.publicOnly) need(out.private === undefined, '非公開の正答を配布できません。');
  return out;
}
function publicCheck(type, config) { const out = normalizeCheck(type, config); delete out.private; return out; }
function validateConfirmationQuestion(q) {
  const codeRefs = parseCodeRefs(q.codeRefs); need(codeRefs.length >= 1 && (q.checkType === 'compareRuns' || codeRefs.length === 1), '確認方式に合う参照元を指定してください。');
  return { codeRefs, checkType: q.checkType, checkConfig: normalizeCheck(q.checkType, q.checkConfig, { publicOnly: true }) };
}
function validateReferenceGraph(questions) {
  for (const q of questions) if (q.kind === 'confirmation') {
    validateConfirmationQuestion(q);
    for (const ref of q.codeRefs) { const source = questions.find(p => p.questionId === ref.questionId && p.version === ref.version);
      need(source && source.kind === 'code' && source.setId === q.setId && source !== q, '参照元のコード・版・問題セットを確認してください。'); }
  }
  return true;
}
function normalizeTrial(t) {
  keys(t, ['schema','id','source','code','codeHash','inputs','stdout','stderr','outcome','truncated','at']); need(t.schema === 1, '試行記録の形式を確認してください。');
  need(typeof t.id === 'string' && /^[A-Za-z0-9_.-]{1,120}$/.test(t.id), '試行IDを確認してください。');
  const source = parseCodeRefs([t.source])[0], code = text(t.code, 200000, true); need(typeof t.codeHash === 'string' && /^[a-f0-9]{64}$/.test(t.codeHash), 'コードのhashを確認してください。');
  need(Array.isArray(t.inputs) && t.inputs.length <= 10000, '入力記録の件数を確認してください。');
  const inputs = t.inputs.map(input => { keys(input, ['prompt','value','eof']); need(input.eof === undefined || typeof input.eof === 'boolean', '入力終了の記録を確認してください。');
    return { prompt: text(input.prompt, 10000, true), value: text(input.value, 200000, true), ...(input.eof ? { eof: true } : {}) }; });
  need(['success','error','stopped','environment_error'].includes(t.outcome) && typeof t.truncated === 'boolean', '試行の終了状態を確認してください。');
  need(typeof t.at === 'string' && Number.isFinite(Date.parse(t.at)), '試行日時を確認してください。');
  return { schema: 1, id: t.id, source, code, codeHash: t.codeHash, inputs, stdout: text(t.stdout, 100000, true), stderr: text(t.stderr || '', 100000, true), outcome: t.outcome, truncated: t.truncated, at: t.at };
}
function numberValue(value, kind) {
  const s = value.normalize('NFKC').trim();
  if (kind === 'integer' && !/^[+-]?[0-9]+(?:_[0-9]+)*$/.test(s)) return null;
  if (kind === 'number' && !/^[+-]?(?:[0-9]+(?:_[0-9]+)*(?:\.(?:[0-9]+(?:_[0-9]+)*)?)?|\.[0-9]+(?:_[0-9]+)*)(?:[eE][+-]?[0-9]+(?:_[0-9]+)*)?$/.test(s)) return null;
  const n = Number(s.replace(/_/g, '')); return Number.isFinite(n) && (kind !== 'integer' || Number.isSafeInteger(n)) ? n : null;
}
function matchesInput(input, p) {
  if (!input || input.eof) return false;
  const a = p.kind === 'text' ? input.value : numberValue(input.value, p.kind); if (a === null) return false;
  return p.op === 'any' || ({ eq: () => a === p.value, ne: () => a !== p.value, gt: () => a > p.value, gte: () => a >= p.value, lt: () => a < p.value, lte: () => a <= p.value })[p.op]();
}
function outputValue(stdout, mode) { const s = stdout.replace(/\r\n?/g, '\n').replace(/\n+$/, ''), lines = s.split('\n'); return mode === 'lastLine' ? lines[lines.length - 1] : s; }
function evaluateCheck(type, config, trials, response = null, options = {}) {
  const c = normalizeCheck(type, config, { publicOnly: true }); need(Array.isArray(trials), '試行記録を確認してください。');
  const history = trials.map(normalizeTrial); let current = options.currentCode;
  if (!current) { current = {}; for (const t of history) current[refKey(t.source)] = t.code; }
  const same = t => current[refKey(t.source)] === t.code;
  const ok = history.filter(t => t.outcome === 'success' && !t.truncated && (type === 'compareRuns' && c.codePolicy === 'variants' || same(t)));
  let details = [], completed = false, state = history.length ? 'in-progress' : 'not-started', label = '未確認';
  if (type === 'inputCases') {
    details = c.cases.map(item => ({ id: item.id, label: item.label, complete: ok.some(t => item.inputs.every(p => matchesInput(t.inputs[p.index], p))) }));
    const count = details.filter(d => d.complete).length; completed = count === details.length; label = `入力条件 ${count}/${details.length} 件を試行`;
  } else if (type === 'resultCoverage') {
    const observed = new Set(ok.map(t => outputValue(t.stdout, c.output)).filter(s => c.results.includes(s)));
    details = c.results.map((s,i) => ({ id: 'result-' + i, label: s, complete: observed.has(s) })); completed = observed.size >= c.requiredDistinct;
    label = `試行${ok.length}回・確認${observed.size}/${c.requiredDistinct}種類`;
  } else if (type === 'attemptLimit') {
    const limit = c.maxGuesses === 'theoretical' ? Math.ceil(Math.log2(c.range.max - c.range.min + 2)) : c.maxGuesses;
    const games = ok.filter(t => outputValue(t.stdout, c.output) === c.successOutput).map(t => {
      const guesses = t.inputs.filter(i => i.prompt === c.guessPrompt);
      const valid = guesses.every(i => !i.eof && numberValue(i.value, 'integer') !== null && numberValue(i.value, 'integer') >= c.range.min && numberValue(i.value, 'integer') <= c.range.max);
      return { id: t.id, count: guesses.length, valid }; }).filter(g => g.count > 0 && g.valid);
    const best = games.length ? Math.min(...games.map(g => g.count)) : null; completed = best !== null && best <= limit;
    details = games.map(g => ({ id: g.id, label: `${g.count}回で正解`, complete: g.count <= limit }));
    label = best === null ? `目標${limit}回以内・未確認` : `${best}回で正解・目標${limit}回以内${completed ? 'を達成' : 'は未達'}`;
  } else if (type === 'compareRuns') {
    const selections = object(response?.selections) ? response.selections : {}, used = new Set();
    details = c.conditions.map(condition => { const selected = ok.find(t => t.id === selections[condition.id]), valid = !!selected && !used.has(selected.id); if (valid) used.add(selected.id);
      return { id: condition.id, label: condition.label, complete: valid }; });
    completed = details.every(d => d.complete); label = `比較する結果 ${details.filter(d => d.complete).length}/${details.length} 件を選択`;
  } else {
    const value = response?.answer, answered = c.format === 'choice' ? c.choices.some(choice => choice.id === value) : typeof value === 'number' && Number.isFinite(value);
    state = answered ? 'answered' : 'not-started'; label = answered ? '回答を記録済み（正誤未判定）' : '未回答';
  }
  if (completed) state = 'complete';
  return { state, completed, label, details, runCount: ok.length };
}

return {normalizeTrial:normalizeTrial,refKey:refKey};
})();
const normalizeTrial = P.normalizeTrial, refKey = P.refKey;
function byteLength(text) { return Utilities.newBlob(String(text)).getBytes().length; }
const JOURNAL_LIMITS = Object.freeze({ trials: 1000, responses: 2000, bytes: 4 * 1024 * 1024 });
const idPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const trialIdPattern = /^[A-Za-z0-9_.-]{1,120}$/;
const clone = value => JSON.parse(JSON.stringify(value));
const empty = () => ({ schema: 1, trials: [], responses: {} });
const fail = (code, message) => Object.assign(new Error(message), { code });

function object(value, keys, label) {
  if (!value || typeof value !== 'object' || Array.isArray(value) ||
      ![Object.prototype, null].includes(Object.getPrototypeOf(value)) || Object.keys(value).some(key => !keys.includes(key)))
    throw fail('journal_invalid', `${label}の形式を確認してください。元の記録は保持しています。`);
}
function key(value) {
  if (typeof value !== 'string' || value.split('/').length !== 2 || !value.split('/').every(part => idPattern.test(part)))
    throw fail('journal_invalid', '確認問題のID・版を確認してください。');
  return value;
}
function response(value) {
  object(value, ['answer', 'selections'], '確認問題の回答');
  const result = {};
  if (Object.hasOwn(value, 'answer')) {
    if (!(typeof value.answer === 'string' && value.answer.length <= 20000 || typeof value.answer === 'number' && Number.isFinite(value.answer)))
      throw fail('journal_invalid', '確認問題の回答が長すぎるか、形式が対応していません。');
    result.answer = value.answer;
  }
  if (Object.hasOwn(value, 'selections')) {
    object(value.selections, Object.keys(value.selections || {}), '比較する試行');
    const entries = Object.entries(value.selections);
    if (entries.length > 100 || entries.some(([condition, trialId]) => !idPattern.test(condition) || typeof trialId !== 'string' || !trialIdPattern.test(trialId)))
      throw fail('journal_invalid', '比較する条件・試行のIDを確認してください。');
    result.selections = Object.fromEntries(entries.sort(([a], [b]) => a.localeCompare(b)));
  }
  return result;
}
function withinLimits(journal) {
  if (journal.trials.length > JOURNAL_LIMITS.trials || Object.keys(journal.responses).length > JOURNAL_LIMITS.responses ||
      byteLength(JSON.stringify(journal)) > JOURNAL_LIMITS.bytes)
    throw fail('journal_limit', '試行記録の保存上限に達しました。以前の記録は削除していません。ファイルへ保存してから教員へ相談してください。');
  return journal;
}

// ローカルファイルの取込みにも使う、公開形式の厳格な検査。
function validateJournal(raw) {
  object(raw, ['schema', 'trials', 'responses'], '試行記録');
  if (raw.schema !== 1 || !Array.isArray(raw.trials)) throw fail('journal_invalid', 'この試行記録の形式は対応していません。');
  object(raw.responses, Object.keys(raw.responses || {}), '確認問題の回答一覧');
  withinLimits(raw);
  const ids = new Set();
  const trials = raw.trials.map(value => {
    const trial = normalizeTrial(value);
    if (!trialIdPattern.test(trial.id) || ids.has(trial.id)) throw fail('journal_invalid', '試行のIDが不正、または重複しています。');
    ids.add(trial.id);
    return trial;
  });
  const responses = Object.fromEntries(Object.entries(raw.responses).map(([questionKey, value]) => [key(questionKey), response(value)]));
  for (const value of Object.values(responses)) {
    if (Object.values(value.selections || {}).some(id => !ids.has(id)))
      throw fail('journal_invalid', '比較に指定した試行が記録内にありません。元の記録は保持しています。');
  }
  return withinLimits({ schema: 1, trials, responses });
}


function validate(raw) {
  try {
    const normalized = validateJournal(JSON.parse(ToolsStoreContract.canonical(raw)));
    normalized.trials.forEach(t => {
      if (ToolsStoreContract.hash(t.code) !== t.codeHash) throw fail('journal_invalid', '試行コードのhashが一致しません。');
    });
    return normalized;
  } catch (error) { ToolsStoreContract.fail('journal_invalid', error.message || '確認記録の形式を確認してください。'); }
}
return Object.freeze({validate:validate,byteLength:byteLength});
})();
