import { questionKey, validId } from './core.mjs';

export { questionStructure } from './question-structure.mjs?v=20261016-prompt-structure1';
import { questionStructure } from './question-structure.mjs?v=20261016-prompt-structure1';

export function questionGroups(questions) {
  const groups = new Map();
  for (const question of questions) {
    const view = questionStructure(question), key = view.groupKey || 'ungrouped';
    if (!groups.has(key)) groups.set(key, { title: view.groupTitle, items: [] });
    groups.get(key).items.push({ question, body: view.shortTitle, minor: view.minor, hasMinorInTitle: view.hasMinorInTitle });
  }
  for (const group of groups.values()) {
    const multiple = new Set(group.items.map(item => item.question.questionId)).size > 1;
    for (const item of group.items) {
      const duplicate = questions.filter(q => q.questionId === item.question.questionId).length > 1;
      item.title = `${multiple && item.minor && !item.hasMinorInTitle ? `(${item.minor}) ` : ''}${item.body}${duplicate ? `（${item.question.version}）` : ''}`;
    }
  }
  return [...groups.values()];
}

export function validateRating(raw) {
  if (!raw || !Number.isInteger(raw.total) || raw.total < 0 || raw.total > 10000
    || !(raw.earned === null || Number.isInteger(raw.earned) && raw.earned >= 0 && raw.earned <= raw.total)
    || raw.version && !validId(raw.version)) throw new Error('評価の形式を確認できません。');
  return { earned: raw.earned, total: raw.total, version: raw.version || '', example: raw.example === true, ...(raw.trial === true ? { trial: true } : {}) };
}

export function setRating(set, ratingFor) {
  const unique = new Map();
  for (const q of set.questions) {
    if (q.kind === 'observation') continue;
    const rating = ratingFor(q);
    // 採点設定のない確認問題は分母に加えない。学習用の達成率を★へ変換しない。
    if (q.kind === 'confirmation' && (!rating || !rating.total)) continue;
    const prior=unique.get(q.questionId);
    if (!unique.has(q.questionId) || rating && (!prior || prior.total === 0 && rating.total > 0 || prior.earned === null && rating.earned !== null)) unique.set(q.questionId,rating);
  }
  const ratings = [...unique.values()];
  if (!ratings.length) return { earned: 0, total: 0, example: false };
  if (ratings.some(r => !r)) return null;
  if (ratings.some(r => r.trial) && ratings.some(r => !r.trial)) return null;
  return { earned: ratings.reduce((sum, r) => sum + (r.earned ?? 0), 0), total: ratings.reduce((sum, r) => sum + r.total, 0), example: ratings.some(r => r.example), ...(ratings.some(r => r.trial) ? { trial: true } : {}) };
}

export function renderRating(element, rating, compact = false) {
  element.replaceChildren();
  element.classList.toggle('rating-example', !!rating?.example);
  const prefix = rating?.trial ? '試用評価：' : rating?.example ? '表示例：' : '正式：';
  if (!rating) {
    element.textContent = '★—/—';
    element.setAttribute('aria-label', '採点結果は未取得');
    return;
  }
  if (!rating.total) {
    element.textContent = `${rating.trial ? '試用評価 ' : ''}★対象なし`;
    element.setAttribute('aria-label', prefix + 'コードのチェック項目なし');
    return;
  }
  const earned = rating.earned ?? 0;
  if (compact || rating.total > 48) element.textContent = `${rating.trial ? '試用評価 ' : ''}★${earned}/${rating.total}${rating.example ? '（表示例）' : ''}`;
  else {
    const filled = document.createElement('span'), empty = document.createElement('span');
    filled.textContent = '★'.repeat(earned); empty.textContent = '☆'.repeat(rating.total - earned); empty.className = 'rating-empty';
    if (rating.trial) element.append(document.createTextNode('試用評価 '));
    element.append(filled, empty);
    if (rating.earned === null) element.append(document.createTextNode(' 未採点'));
  }
  element.setAttribute('aria-label', `${prefix}${rating.total}項目中${earned}項目${rating.earned === null ? '、未採点' : 'を達成'}${rating.version ? `、採点版 ${rating.version}` : ''}`);
}

export function ratingKey(raw) {
  if (!validId(raw?.questionId) || !validId(raw?.version)) throw new Error('評価の問題・版を確認できません。');
  return questionKey(raw);
}
