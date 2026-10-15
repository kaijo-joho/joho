// 画面・実行・保存で共有する契約。正式採点の結果を生成しない。
export const APP = 'kaijo-python-editor';
export const FORMAT = 1;
export const LIMITS = Object.freeze({ code: 200000, prompt: 200000, output: 100000, figures: 12, figureBytes: 4000000, runMs: 120000 });
export const PYODIDE_URL = 'https://cdn.jsdelivr.net/pyodide/v314.0.7/full/';
const idPattern = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
export function validId(value) { return typeof value === 'string' && idPattern.test(value); }
function text(value, max, name) {
  if (typeof value !== 'string' || value.length > max) throw new Error(`${name}の形式または長さを確認してください。`);
  return value;
}
export function questionKey(q) { return `${q.version}/${q.questionId}`; }
// 配信内容は許可した項目だけへ投影する。模範解答・教員メモは受け入れない。
export function validateCatalog(raw) {
  if (raw?.schema !== 'python-editor-catalog-v1' || !Array.isArray(raw.sets) || raw.sets.length > 100) throw new Error('問題データの形式が対応していません。');
  const sets = [], keys = new Set(), setIds = new Set();
  for (const set of raw.sets) {
    if (!validId(set.setId) || setIds.has(set.setId) || !Array.isArray(set.questions) || set.questions.length > 300) throw new Error('問題セットのIDを確認してください。');
    setIds.add(set.setId);
    const questions = set.questions.map(q => {
      if (!validId(q.questionId) || !validId(q.version)) throw new Error('問題または版のIDを確認してください。');
      const key = questionKey(q);
      if (keys.has(key)) throw new Error('同じ版の問題IDが重複しています。');
      keys.add(key);
      const result = { questionId: q.questionId, setId: set.setId, version: q.version,
        title: text(q.title, 300, '問題名'), prompt: text(q.prompt, LIMITS.prompt, '問題文'),
        templateCode: text(q.templateCode, LIMITS.code, '雛形'), setupCode: text(q.setupCode || '', LIMITS.code, '準備コード'),
        kind: q.kind === 'observation' ? 'observation' : 'code' };
      if (q.useExistingQuestionCode) {
        if (!validId(q.useExistingQuestionCode)) throw new Error('参照する問題IDを確認してください。');
        result.useExistingQuestionCode = q.useExistingQuestionCode;
      }
      return result;
    });
    for (const q of questions) if (q.useExistingQuestionCode && !questions.some(p => p.questionId === q.useExistingQuestionCode && p.version === q.version && p !== q)) throw new Error('参照元の問題が同じ版にありません。');
    sets.push({ setId: set.setId, title: text(set.title, 300, 'セット名'), questions });
  }
  return { schema: raw.schema, label: typeof raw.label === 'string' ? raw.label.slice(0, 300) : '', sets };
}
export function stdinLines(value) {
  if (value === '') return [];
  const lines = value.replace(/\r\n?/g, '\n').split('\n');
  if (lines.at(-1) === '') lines.pop();
  return lines;
}
export function validateDraft(raw) {
  if (raw?.app !== APP || raw.version !== FORMAT || !Array.isArray(raw.entries) || raw.entries.length > 2000) throw new Error('このエディタの保存ファイルではありません。');
  const seen = new Set();
  const entries = raw.entries.map(e => {
    if (!validId(e.questionId) || !validId(e.version)) throw new Error('保存データの問題ID・版を確認してください。');
    const key = questionKey(e);
    if (seen.has(key)) throw new Error('保存データの問題が重複しています。');
    seen.add(key);
    return { questionId: e.questionId, version: e.version,
      code: text(e.code, LIMITS.code, 'コード'), stdin: text(e.stdin || '', LIMITS.code, '入力値'),
      updatedAt: typeof e.updatedAt === 'string' ? e.updatedAt.slice(0, 40) : '',
      practiced: e.practiced === true };
  });
  return { app: APP, version: FORMAT, entries, savedAt: typeof raw.savedAt === 'string' ? raw.savedAt : '' };
}
export function errorAdvice(error) {
  const message = String(error);
  if (/EOFError/.test(message)) return 'input()の入力が終了しました。もう一度実行して出力欄へ入力するか、「入力値をまとめて渡す」に1回分ずつ改行して指定してください。';
  if (/IndentationError|TabError/.test(message)) return '字下げを確認してください。ブロック内は半角スペース4個にそろえると確認しやすくなります。';
  if (/SyntaxError/.test(message)) return '表示された行の記号、括弧、引用符、行末のコロンを確認してください。';
  if (/NameError/.test(message)) return '変数名の綴りと、その変数に値を入れる順序を確認してください。';
  if (/ValueError/.test(message)) return '入力した値や型を確認してください。int()には整数の文字列が必要です。';
  if (/IndexError/.test(message)) return 'リストの添字と要素数を確認してください。先頭は0番です。';
  if (/ZeroDivisionError/.test(message)) return '割る数が0になっていないか確認してください。';
  if (/ModuleNotFoundError/.test(message)) return 'ブラウザで利用できるライブラリか確認してください。準備処理の通信失敗なら再実行してください。';
  return 'エラー末尾の種類と、表示された行を確認してください。実行結果は正式採点とは別です。';
}
