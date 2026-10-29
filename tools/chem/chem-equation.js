// 化学反応式ビルダーのコア：式の構造、変形の操作（式を足す・両辺から消す）、確認と採点。画面（DOM）には触らない。
// 化学式の読み取り・分数・下付きの表示は土台 B（chem-energy.js）を使う。ブラウザでは window.ChemEquation、Node では require() で使う。
// 設計は docs/equation-builder-design.md。係数を自動で合わせたり、正解を補ったりはしない。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./chem-energy.js'));
  else root.ChemEquation = factory(root.ChemEnergy);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (E) {
'use strict';
const {Frac, ZERO, ONE} = E;
// 大きすぎる入力で止まらないための上限（項の数は片側、行の数は 1 つのビルダー全体）
const LIMITS = Object.freeze({terms: 10, coef: 99, rows: 12, mult: 20, text: 40});

// ===================== 物質 =====================
// 1 つの物質を読む。係数・状態・複数の物質は受け付けない（係数は別の欄に入れる）。
// 返す text は、読みなおしても同じになる書き方（電荷は ^ で書く：SO4^2-）。key は同じ物質かどうかを決める印
function species(input){
  const raw = E.normalize(input);
  if (!raw) return {error: '化学式を入れてください'};
  if (raw.length > LIMITS.text) return {error: '化学式が長すぎます'};
  if (/→|->|=>|=/.test(raw)) return {error: '物質を 1 つずつ入れます（矢印は入れません）'};
  if (E.splitTerms(raw).length > 1) return {error: '物質を 1 つずつ入れます'};
  let p;
  try { p = E.parseTerm(raw); } catch (e){ return {error: e.message}; }
  if (p.heat !== undefined || !p.sp || p.sp.kind === 'aq') return {error: '化学式が読めません'};
  if (!p.coef.eq(ONE)) return {error: '係数は、化学式の前の欄に入れます'};
  if (p.sp.state) return {error: '状態（固・液・気・aq）は付けません'};
  const sp = p.sp;
  if (sp.kind === 'e') return {key: 'e-', text: 'e-', formula: 'e', charge: -1, atoms: {}, kind: 'e'};
  const text = sp.charge ? `${sp.formula}^${Math.abs(sp.charge)}${sp.charge > 0 ? '+' : '-'}` : sp.formula;
  return {key: sp.formula + (sp.charge ? '^' + sp.charge : ''), text, formula: sp.formula, charge: sp.charge, atoms: sp.atoms, kind: 'species'};
}
// 物質の表示（下付き・上付き）と、読み上げ・文章用の書き方
const segsOf = sp => E.speciesSegs({kind: sp.kind, formula: sp.formula, charge: sp.charge, state: ''});
const speciesHTML = sp => E.segsToHTML(segsOf(sp));
const SUB = '₀₁₂₃₄₅₆₇₈₉', SUP = {'0': '⁰', '1': '¹', '2': '²', '3': '³', '4': '⁴', '5': '⁵', '6': '⁶', '7': '⁷', '8': '⁸', '9': '⁹', '+': '⁺', '−': '⁻', '-': '⁻'};
const speciesText = sp => segsOf(sp).map(s => s.sub ? s.t.replace(/\d/g, d => SUB[d]) : s.sup ? [...s.t].map(c => SUP[c] || c).join('') : s.t).join('');

// 別名（H⁺ と H₃O⁺ など）を 1 つの印にまとめる表。定義ごとに 1 度だけ作る
const aliasCache = new WeakMap();
function canon(def){
  if (def && aliasCache.has(def)) return aliasCache.get(def);
  const map = new Map();
  for (const group of (def && def.aliases) || []){
    const keys = group.map(t => species(t).key).filter(Boolean);
    for (const k of keys) map.set(k, keys[0]);
  }
  const fn = key => map.get(key) || key;
  if (def && typeof def === 'object') aliasCache.set(def, fn);
  return fn;
}

// ===================== 係数・式 =====================
// 係数の欄を読む。空は 1。初めは正の整数だけ（定義で allowFraction のときだけ分数）
function coefficient(s, def){
  const t = E.normalize(s == null ? '' : String(s));
  if (t === '') return {value: ONE};
  if (/^\d+$/.test(t)){
    const n = +t;
    if (n === 0) return {error: '係数に 0 は使えません'};
    if (n > LIMITS.coef) return {error: '係数が大きすぎます'};
    return {value: new Frac(n)};
  }
  if (def && def.allowFraction && /^\d+\s*\/\s*\d+$/.test(t)){
    const f = Frac.parse(t.replace(/\s/g, ''));
    if (f && !f.isZero) return {value: f};
  }
  return {error: '係数は正の整数で入れます'};
}
const coefString = f => f.eq(ONE) ? '' : f.toString();
const SIDES = ['lhs', 'rhs'], SIDE_NAME = {lhs: '左辺', rhs: '右辺'};

// 1 行を読む。errors があれば判定しない（どこを直すかを示す）
function analyzeRow(row, def){
  const out = {lhs: [], rhs: [], errors: []};
  if (!row) { out.errors.push('式がありません'); return out; }
  for (const side of SIDES){
    const terms = Array.isArray(row[side]) ? row[side] : [];
    if (!terms.length) out.errors.push(`${SIDE_NAME[side]}に物質がありません`);
    if (terms.length > LIMITS.terms) out.errors.push(`${SIDE_NAME[side]}の物質が多すぎます`);
    terms.slice(0, LIMITS.terms).forEach((t, i) => {
      const sp = species(t && t.sp);
      if (sp.error){ out.errors.push(`${SIDE_NAME[side]}の ${i + 1} 番目の物質：${sp.error}`); return; }
      const c = coefficient(t.coef, def);
      if (c.error){ out.errors.push(`${SIDE_NAME[side]}の ${speciesText(sp)} の係数：${c.error}`); return; }
      out[side].push({coef: c.value, sp});
    });
  }
  return out;
}
// 同じ辺の同じ物質を 1 つにまとめる（表示は最初に出てきた書き方）。順番は保つ
function mergeSide(items, def){
  const C = canon(def), m = new Map();
  for (const {coef, sp} of items){
    const k = C(sp.key), cur = m.get(k);
    if (cur) cur.coef = cur.coef.add(coef); else m.set(k, {coef, sp, key: k});
  }
  return [...m.values()];
}
const toTerms = items => items.map(({coef, sp}) => ({sp: sp.text, coef: coefString(coef)}));

// ===================== 式の変形 =====================
// 式を足す：items = [{row, k}]（k は倍数の文字列）。左辺どうし・右辺どうしを並べ、同じ辺の同じ物質だけまとめる。
// 両辺に同じ物質が残っても消さない（消すのは cancel で、生徒が選ぶ）
function sumRows(items, def){
  if (!items.length) return {error: '足す式を選んでください'};
  const acc = {lhs: [], rhs: []};
  for (const {row, k, label} of items){
    const kt = E.normalize(k == null ? '' : String(k)) || '1';
    if (!/^\d+$/.test(kt) || +kt < 1 || +kt > LIMITS.mult) return {error: `${label || '式'}の倍数は 1〜${LIMITS.mult} の整数にします`};
    const a = analyzeRow(row, def);
    if (a.errors.length) return {error: `${label || '式'}を直してから足します（${a.errors[0]}）`};
    for (const side of SIDES) for (const t of a[side]) acc[side].push({coef: t.coef.mul(+kt), sp: t.sp});
  }
  const lhs = mergeSide(acc.lhs, def), rhs = mergeSide(acc.rhs, def);
  if (lhs.length > LIMITS.terms || rhs.length > LIMITS.terms) return {error: '物質が多すぎます。途中で消してから足します'};
  return {lhs: toTerms(lhs), rhs: toTerms(rhs)};
}
// 両辺にある物質と、消せる最大の数（少ないほうの係数）
function commonSpecies(row, def){
  const a = analyzeRow(row, def); if (a.errors.length) return [];
  const L = mergeSide(a.lhs, def), R = new Map(mergeSide(a.rhs, def).map(x => [x.key, x]));
  return L.filter(x => R.has(x.key)).map(x => {
    const r = R.get(x.key), max = x.coef.valueOf() <= r.coef.valueOf() ? x.coef : r.coef;
    return {key: x.key, text: x.sp.text, html: speciesHTML(x.sp), label: speciesText(x.sp), left: x.coef.toString(), right: r.coef.toString(), max: max.toString()};
  });
}
// 両辺から消す：key の物質を n だけ両辺から引く。0 になった項は消える。その辺に同じ物質が 2 か所あれば、先にまとめる
function cancel(row, key, n, def){
  const a = analyzeRow(row, def);
  if (a.errors.length) return {error: `式を直してから消します（${a.errors[0]}）`};
  const c = coefficient(n, def); if (c.error) return {error: '消す数：' + c.error};
  const C = canon(def), out = {};
  for (const side of SIDES){
    const merged = mergeSide(a[side], def), hit = merged.find(x => x.key === C(key));
    if (!hit) return {error: '両辺にある物質だけを消せます'};
    if (c.value.valueOf() > hit.coef.valueOf() + 1e-12) return {error: `${speciesText(hit.sp)} は${SIDE_NAME[side]}に ${hit.coef.toString()} しかありません`};
    // まとめたのはこの物質だけ。ほかの項の並びと書き方はそのまま
    const rest = [];
    let done = false;
    for (const t of a[side]){
      if (C(t.sp.key) !== hit.key){ rest.push(t); continue; }
      if (done) continue;
      done = true;
      const left = hit.coef.sub(c.value);
      if (!left.isZero) rest.push({coef: left, sp: t.sp});
    }
    out[side] = rest;
  }
  if (!out.lhs.length || !out.rhs.length) return {error: '消すと片方の辺が空になります'};
  return {lhs: toTerms(out.lhs), rhs: toTerms(out.rhs)};
}

// ===================== 確認と採点 =====================
// 正解の式を「物質ごとの数」（右辺 +、左辺 −）にする
const answerCache = new WeakMap();
function answerVecs(def, task){
  if (answerCache.has(task)) return answerCache.get(task);
  const C = canon(def);
  const vecs = (task.answers || []).map(text => {
    const eq = E.parseEquation(text);
    if (eq.errors.length) throw new Error(`正解の式「${text}」：${eq.errors[0]}`);
    const v = new Map();
    for (const [arr, sgn] of [[eq.lhs, -1], [eq.rhs, 1]]) for (const {coef, sp} of arr){
      const k = C(species(sp.kind === 'e' ? 'e-' : sp.formula + (sp.charge ? '^' + Math.abs(sp.charge) + (sp.charge > 0 ? '+' : '-') : '')).key);
      v.set(k, (v.get(k) || ZERO).add(coef.mul(sgn)));
    }
    return {text, eq, v};
  });
  answerCache.set(task, vecs);
  return vecs;
}
// 1 行を確かめる。判定できないときは status: 'pending'。
// items は画面に出す項目（ok: true/false、null は未判定）。どの物質が違うか・正しい係数はいくつか、は示さない
function check(row, def, task){
  const a = analyzeRow(row, def);
  if (a.errors.length) return {status: 'pending', messages: a.errors};
  const C = canon(def), L = mergeSide(a.lhs, def), R = mergeSide(a.rhs, def);
  const messages = [];
  const dup = SIDES.some(side => mergeSide(a[side], def).length !== a[side].length);
  if (dup) messages.push('同じ辺に同じ物質が 2 か所あります。1 つにまとめます');
  const rk = new Map(R.map(x => [x.key, x]));
  const both = L.filter(x => rk.has(x.key));
  if (both.length) messages.push(`両辺に同じ物質（${both.map(x => speciesText(x.sp)).join('、')}）があります。両辺から消します`);
  // 原子の数と電荷
  const cnt = new Map(); let charge = ZERO; const order = [];
  for (const [arr, sgn] of [[L, -1], [R, 1]]) for (const {coef, sp} of arr){
    for (const [el, n] of Object.entries(sp.atoms)){ if (!cnt.has(el)){ cnt.set(el, ZERO); order.push(el); } cnt.set(el, cnt.get(el).add(coef.mul(n * sgn))); }
    charge = charge.add(coef.mul(sp.charge * sgn));
  }
  const badEl = order.filter(el => !cnt.get(el).isZero);
  const atomsOk = !badEl.length, chargeOk = charge.isZero;
  const charged = [...L, ...R].some(x => x.sp.charge);
  // 物質の組：差し引きの向き（反応物か生成物か）まで、正解と同じか
  const net = new Map();
  for (const [arr, sgn] of [[L, -1], [R, 1]]) for (const {coef, key} of arr) net.set(key, (net.get(key) || ZERO).add(coef.mul(sgn)));
  for (const [k, v] of net) if (v.isZero) net.delete(k);
  const answers = answerVecs(def, task);
  const sameSet = ans => ans.v.size === net.size && [...ans.v].every(([k, c]) => net.has(k) && Math.sign(net.get(k).valueOf()) === Math.sign(c.valueOf()));
  const match = answers.find(sameSet);
  const speciesOk = !!match;
  // 係数：正解と比が同じで、最も簡単な（正解そのもの）か
  let coefOk = null, ratio = null;
  if (speciesOk && atomsOk && chargeOk){
    const [k0] = match.v.keys();
    ratio = net.get(k0).div(match.v.get(k0));
    const prop = [...match.v].every(([k, c]) => net.get(k).eq(c.mul(ratio)));
    coefOk = prop && ratio.eq(ONE);
    if (!prop) messages.push('係数の比を確かめます');
    else if (!ratio.eq(ONE)) messages.push('係数を最も簡単な整数の比にします');
  }
  // 式の種類
  const hasE = [...L, ...R].some(x => x.sp.kind === 'e');
  if (task.kind === 'molecular' && (hasE || charged)) messages.push('イオンや e⁻ を含まない化学反応式で書きます');
  if (task.kind === 'half'){
    const want = task.electrons === 'right' ? R : L, other = task.electrons === 'right' ? L : R;
    if (!hasE) messages.push('半反応式には e⁻ を書きます');
    else if (other.some(x => x.sp.kind === 'e') && !want.some(x => x.sp.kind === 'e')) messages.push('e⁻ を書く辺を確かめます');
  }
  if (!speciesOk) messages.unshift('反応物と生成物（化学式）を確かめます');
  if (!atomsOk) messages.splice(speciesOk ? 0 : 1, 0, `原子の数が左右で合いません（${badEl.join('・')}）`);
  if (!chargeOk) messages.push('電荷の合計が左右で合いません');
  const items = [
    {id: 'species', label: '物質（化学式）', ok: speciesOk},
    {id: 'atoms', label: '原子の数', ok: atomsOk},
    ...(charged || !chargeOk || task.kind !== 'molecular' ? [{id: 'charge', label: '電荷', ok: chargeOk}] : []),
    {id: 'coef', label: '係数（最も簡単な整数比）', ok: coefOk}
  ];
  const correct = speciesOk && atomsOk && chargeOk && coefOk === true && !dup && !both.length && !messages.length;
  return {status: 'judged', correct, items, messages};
}
// 小問ごとの採点。採点するのは、その小問の最後の行
function targetRow(draft, taskId){
  const rows = (draft && Array.isArray(draft.rows) ? draft.rows : []).filter(r => r.taskId === taskId);
  return rows[rows.length - 1] || null;
}
function grade(def, draft, taskId){
  const task = def.tasks.find(t => t.id === taskId);
  if (!task) return {taskId, status: 'pending', messages: ['小問がありません']};
  const row = targetRow(draft, taskId);
  return Object.assign({taskId, rowId: row ? row.id : null}, check(row, def, task));
}
// 解答の表示（教科書の書き方。係数 1 は書かない）
function equationHTML(text){
  const eq = E.parseEquation(text);
  const side = arr => arr.map(({coef, sp}) => (coef.eq(ONE) ? '' : coef.toString()) + speciesHTML({kind: sp.kind, formula: sp.formula, charge: sp.charge})).join(' + ');
  return side(eq.lhs) + ' → ' + side(eq.rhs);
}

// ===================== 下書き（draft） =====================
// 保存した下書きを読みなおすときに、形と大きさを確かめる。読めない部分は捨てる
function sanitizeDraft(def, d){
  if (!d || typeof d !== 'object' || !Array.isArray(d.rows)) return null;
  const tasks = new Set(def.tasks.map(t => t.id)), ids = new Set();
  const term = t => t && typeof t.sp === 'string' && t.sp.length <= LIMITS.text ? {sp: t.sp, coef: typeof t.coef === 'string' ? t.coef.slice(0, 4) : ''} : null;
  const rows = d.rows.slice(0, LIMITS.rows).filter(r => r && typeof r.id === 'string' && tasks.has(r.taskId) && !ids.has(r.id) && ids.add(r.id)).map(r => ({
    id: r.id, taskId: r.taskId,
    lhs: (Array.isArray(r.lhs) ? r.lhs : []).slice(0, LIMITS.terms).map(term).filter(Boolean),
    rhs: (Array.isArray(r.rhs) ? r.rhs : []).slice(0, LIMITS.terms).map(term).filter(Boolean),
    origin: r.origin && typeof r.origin === 'object' ? JSON.parse(JSON.stringify(r.origin)) : null
  }));
  for (const t of def.tasks) if (!rows.some(r => r.taskId === t.id)) return null;
  const custom = (Array.isArray(d.custom) ? d.custom : []).filter(s => typeof s === 'string' && !species(s).error).slice(0, 8);
  return {rows, custom};
}
function emptyDraft(def){
  return {rows: def.tasks.map((t, i) => ({id: 'r' + (i + 1), taskId: t.id, lhs: [], rhs: [], origin: null})), custom: []};
}

return {LIMITS, species, speciesHTML, speciesText, coefficient, analyzeRow, sumRows, commonSpecies, cancel, check, grade, targetRow, equationHTML, sanitizeDraft, emptyDraft};
});
