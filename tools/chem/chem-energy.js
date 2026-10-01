// 化学系アプリの土台 B（エネルギー）：式の読み取り・原子の数の確認・ヘスの法則の計算・エネルギー図の配置と描画。
// 画面（DOM）には触らない純粋な計算。ブラウザでは window.ChemEnergy、Node では require() で使う。
// 使っているアプリ：エネルギー図エディタ（thermo.html）。周期表・電池のアプリでも使う予定（docs/DEVELOPMENT.md）。
(function (root) {
'use strict';

// ===================== 分数 =====================
// 係数（½ など）を小数にすると誤差が出るので、分数のまま計算する。
const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) [a, b] = [b, a % b]; return a || 1; };
class Frac {
  constructor(n, d = 1){
    if (!d) throw new Error('分母が 0');
    if (d < 0){ n = -n; d = -d; }
    const g = gcd(n, d);
    this.n = n / g; this.d = d / g;
  }
  static of(x){ return x instanceof Frac ? x : new Frac(x, 1); }
  // "3"・"1/2"・"-3/2"・"0.5"・"½" を分数にする。読めなければ null
  static parse(s){
    s = String(s).trim().replace(/[−–]/g, '-');
    const vul = {'½':[1,2], '⅓':[1,3], '⅔':[2,3], '¼':[1,4], '¾':[3,4]};
    let sign = 1;
    if (s[0] === '-'){ sign = -1; s = s.slice(1); } else if (s[0] === '+') s = s.slice(1);
    if (vul[s]) return new Frac(sign * vul[s][0], vul[s][1]);
    let m = s.match(/^(\d+)\s*\/\s*(\d+)$/);
    if (m) return +m[2] ? new Frac(sign * +m[1], +m[2]) : null;
    m = s.match(/^(\d+)(?:\.(\d+))?$/);
    if (m){ const k = (m[2] || '').length; return new Frac(sign * Math.round(+s * 10 ** k), 10 ** k); }
    return null;
  }
  add(o){ o = Frac.of(o); return new Frac(this.n * o.d + o.n * this.d, this.d * o.d); }
  sub(o){ o = Frac.of(o); return new Frac(this.n * o.d - o.n * this.d, this.d * o.d); }
  mul(o){ o = Frac.of(o); return new Frac(this.n * o.n, this.d * o.d); }
  div(o){ o = Frac.of(o); return new Frac(this.n * o.d, this.d * o.n); }
  neg(){ return new Frac(-this.n, this.d); }
  abs(){ return new Frac(Math.abs(this.n), this.d); }
  get isZero(){ return this.n === 0; }
  get sign(){ return Math.sign(this.n); }
  eq(o){ o = Frac.of(o); return this.n === o.n && this.d === o.d; }
  valueOf(){ return this.n / this.d; }
  toString(){ return this.d === 1 ? String(this.n) : this.n + '/' + this.d; }
}
const ZERO = new Frac(0), ONE = new Frac(1);

// ===================== 元素・状態 =====================
const ELEMENTS = ('H He Li Be B C N O F Ne Na Mg Al Si P S Cl Ar K Ca Sc Ti V Cr Mn Fe Co Ni Cu Zn Ga Ge As Se Br Kr ' +
  'Rb Sr Y Zr Nb Mo Tc Ru Rh Pd Ag Cd In Sn Sb Te I Xe Cs Ba La Ce Pr Nd Pm Sm Eu Gd Tb Dy Ho Er Tm Yb Lu Hf Ta W Re ' +
  'Os Ir Pt Au Hg Tl Pb Bi Po At Rn Fr Ra Ac Th Pa U Np Pu Am Cm Bk Cf Es Fm Md No Lr Rf Db Sg Bh Hs Mt Ds Rg Cn Nh Fl ' +
  'Mc Lv Ts Og').split(' ');
const ELSET = new Set(ELEMENTS);
// 状態の書き方をそろえる。s・l・g（英語）や「気体」も受け付け、表示は教科書どおり (固)(液)(気)・aq にする
const STATE_ALIAS = {'固':'固', '固体':'固', 's':'固', '液':'液', '液体':'液', 'l':'液', '気':'気', '気体':'気', 'g':'気',
  'aq':'aq', '水溶液':'aq'};

// 入力をそろえる：全角→半角（NFKC）、いろいろなマイナス・矢印を 1 種類に。
// NFKC で ₂→2・⁺→+ になるが、読み取りの規則（下の parseCharge）でイオンの価数として正しく読める。
function normalize(s){
  return String(s == null ? '' : s).normalize('NFKC')
    .replace(/[−–—‐]/g, '-').replace(/⁄/g, '/').replace(/[⟶⇒➝➞⟹]/g, '→')
    .replace(/\s+/g, ' ').trim();
}

// ===================== 化学式の読み取り =====================
// "Ca(OH)2"・"CuSO4·5H2O"・"[Ag(NH3)2]" などを原子の数 {Ca:1, O:2, H:2} にする
function parseFormula(s){
  const atoms = {};
  const parts = s.split(/[·・•*]|\.(?=\d*[A-Z(\[])/);   // 水和水の「・」（小数点と区別する）
  parts.forEach((p, pi) => {
    let mult = 1;
    if (pi > 0){ const m = p.match(/^(\d+)/); if (m){ mult = +m[1]; p = p.slice(m[1].length); } }
    const [acc, i] = group(p, 0, '');
    if (i !== p.length) throw new Error('「' + p.slice(i) + '」が読めません');
    for (const [el, n] of Object.entries(acc)) atoms[el] = (atoms[el] || 0) + n * mult;
  });
  if (!Object.keys(atoms).length) throw new Error('化学式がありません');
  return atoms;
  function group(str, i, close){
    const acc = {};
    const addTo = (el, n) => { acc[el] = (acc[el] || 0) + n; };
    while (i < str.length){
      const ch = str[i];
      if (ch === '(' || ch === '['){
        const [sub, j] = group(str, i + 1, ch === '(' ? ')' : ']');
        i = j;
        const m = str.slice(i).match(/^\d+/); const n = m ? +m[0] : 1; if (m) i += m[0].length;
        for (const [el, c] of Object.entries(sub)) addTo(el, c * n);
      } else if (ch === ')' || ch === ']'){
        if (ch !== close) throw new Error('かっこの対応が合いません');
        return [acc, i + 1];
      } else if (/[A-Z]/.test(ch)){
        let sym = ch;
        if (/[a-z]/.test(str[i + 1] || '')) sym += str[i + 1];
        if (!ELSET.has(sym)) throw new Error('「' + sym + '」という元素はありません');
        i += sym.length;
        const m = str.slice(i).match(/^\d+/); const n = m ? +m[0] : 1; if (m) i += m[0].length;
        if (n === 0) throw new Error(sym + ' の数が 0 です');
        addTo(sym, n);
      } else {
        throw new Error('「' + ch + '」が読めません');
      }
    }
    if (close) throw new Error('かっこが閉じていません');
    return [acc, i];
  }
}

// イオンの価数を読む。"Ca2+"→Ca²⁺、"SO42-"→SO₄²⁻、"NH4+"→NH₄⁺、"Ag(NH3)2+"→[Ag(NH₃)₂]⁺、"Ca^2+" も可。
// 数字が 2 けた以上なら最後の 1 けたが価数。1 けたなら、元素 1 つだけ（Ca・O など）のときは価数、
// 多原子（NH・NO など）のときは下付きの数と読む（教科書に出るイオンはこれで正しく読める）
function parseCharge(s){
  let m = s.match(/^(.*?)\^(\d*)([+-])$/);
  if (m) return {body: m[1], charge: (m[3] === '+' ? 1 : -1) * (m[2] ? +m[2] : 1)};
  m = s.match(/^(.*?)(\d*)([+-])$/);
  if (!m || !m[1]) return {body: s, charge: 0};
  let body = m[1], digits = m[2], n = 1;
  const sign = m[3] === '+' ? 1 : -1;
  if (digits.length >= 2){ n = +digits.slice(-1); body += digits.slice(0, -1); }
  else if (digits.length === 1){
    if (/^[A-Z][a-z]?$/.test(body)) n = +digits;   // Ca2+・O2-・Fe3+
    else body += digits;                             // NH4+・NO3-
  }
  if (n === 0) return {body: s, charge: 0};
  return {body, charge: sign * n};
}

// 状態のかっこか：中身が大文字・数字で始まらない（化学式のかっこ Ca(OH)2 と区別する）
const isStateText = t => t !== '' && !/^[A-Z0-9\[(]/.test(t.trim());

// 1 つの項（"2H2O(液)"・"1/2O2(気)"・"Na+(気)"・"e-"・"NaOHaq"・"aq"）を読む
function parseTerm(raw){
  let t = raw.trim();
  let m = t.match(/^([+-]?\d+(?:\.\d+)?)\s*kJ(?:\/mol)?$/i);   // 旧課程の「+ 394 kJ」
  if (m) return {heat: +m[1]};
  let coef = ONE;
  m = t.match(/^(\d+\s*\/\s*\d+|\d+(?:\.\d+)?)\s*(?=\S)/);
  if (m){ coef = Frac.parse(m[1].replace(/\s/g, '')); t = t.slice(m[0].length); if (!coef || coef.isZero) throw new Error('係数「' + m[1] + '」が読めません'); }
  if (t === 'aq') return {coef, sp: {key: 'aq', kind: 'aq', formula: 'aq', charge: 0, state: '', atoms: {}}};
  if (/^e\s*-?$/.test(t) || /^e\^?-$/.test(t)) return {coef, sp: {key: 'e-', kind: 'e', formula: 'e', charge: -1, state: '', atoms: {}}};
  let state = '', stateLabel = '', stateStyle = '';
  m = t.match(/^(.*)\(([^()]*)\)\s*$/);
  if (m && isStateText(m[2])){
    const s = m[2].trim();
    state = STATE_ALIAS[s] || s; stateLabel = state; stateStyle = 'paren'; t = m[1].trim();
  } else if (/[A-Za-z)\]\d+-]aq$/.test(t)){
    state = 'aq'; stateLabel = 'aq'; stateStyle = 'suffix'; t = t.slice(0, -2);
  }
  if (!t) throw new Error('化学式がありません');
  const {body, charge} = parseCharge(t);
  const atoms = parseFormula(body);
  const key = body + (charge ? '^' + charge : '') + '|' + state;
  return {coef, sp: {key, kind: 'species', formula: body, charge, state, stateLabel, stateStyle, atoms}};
}

// 式の片側を項に分ける。「+」はイオンの電荷にも使うので、次の文字を見て区切りかどうか決める
function splitTerms(side){
  side = side.replace(/\s-\s*(\d[\d.]*\s*kJ)/gi, ' + -$1');   // 旧課程の「− 44 kJ」
  const out = []; let cur = '';
  for (let i = 0; i < side.length; i++){
    const ch = side[i];
    if (ch === '+'){
      let j = i + 1; while (side[j] === ' ') j++;
      const nx = side[j];
      const paren = nx === '(' ? side.slice(j + 1).split(')')[0] : null;
      const sep = cur.trim() !== '' && nx !== undefined && nx !== '+' && nx !== ')' && !(paren !== null && isStateText(paren));
      if (sep){ out.push(cur); cur = ''; continue; }
    }
    cur += ch;
  }
  out.push(cur);
  return out.map(s => s.trim()).filter(Boolean);
}

// ΔH の値を読む。'' → undefined（書いていない）、'?'・'x' → null（求める値）、数 → number
function parseDH(v){
  v = normalize(v).replace(/\s*kJ(\/mol)?$/i, '').trim();
  if (v === '') return {value: undefined};
  if (/^[?xX]$/.test(v)) return {value: null};
  if (/^[+-]?\d+(\.\d+)?$/.test(v)) return {value: +v};
  return {error: 'ΔH の値「' + v + '」が読めません（数か ? を入れます）'};
}

// 式を読む。text の中に ΔH を書いてもよい（"C + O2 → CO2  ΔH = -394"）。dhText は ΔH の欄の値（あれば優先）
function parseEquation(text, dhText){
  const res = {text, lhs: [], rhs: [], dh: undefined, errors: [], warnings: [], old: false, empty: false};
  let s = normalize(text);
  if (!s){ res.empty = true; return res; }
  let inlineDH;
  const dm = s.match(/(?:^|[\s,;、])(?:Δ|⊿|[dD])H\s*=?\s*(.*)$/);
  if (dm){ inlineDH = dm[1]; s = s.slice(0, dm.index).replace(/[\s,;、]+$/, ''); }
  const am = s.match(/→|->|=>|⇌|⇄|=/);
  if (!am){ res.errors.push('矢印（→）がありません。「->」と打っても矢印になります'); return res; }
  if (am[0] === '=') res.old = true;
  const L = s.slice(0, am.index), R = s.slice(am.index + am[0].length);
  let heat = 0, hasHeat = false;
  for (const [side, arr, sgn] of [[L, res.lhs, 1], [R, res.rhs, -1]]){
    for (const term of splitTerms(side)){
      try {
        const p = parseTerm(term);
        if (p.heat !== undefined){ heat += sgn * p.heat; hasHeat = true; continue; }   // 右辺の +Q kJ → ΔH = −Q
        arr.push(p);
      } catch (e){ res.errors.push('「' + term + '」：' + e.message); }
    }
  }
  if (!res.lhs.length || !res.rhs.length){ res.errors.push('矢印の両側に物質を書きます'); return res; }
  const dhSrc = dhText != null && normalize(dhText) !== '' ? dhText : inlineDH;
  if (dhSrc != null){ const d = parseDH(dhSrc); if (d.error) res.errors.push(d.error); else res.dh = d.value; }
  if (hasHeat && res.dh === undefined){ res.dh = heat; res.old = true; }
  if (!res.errors.length){
    const bal = balance(res);
    if (!bal.ok) res.errors.push(bal.message);
    const noState = [...res.lhs, ...res.rhs].filter(t => t.sp.kind === 'species' && !t.sp.state).map(t => t.sp.formula);
    if (noState.length) res.warnings.push('状態が書いてありません：' + noState.join('、') + '。(固)(液)(気) を書くと、H₂O(液) と H₂O(気) を区別できます');
  }
  return res;
}

// 原子の数と電荷が左右で合っているか
function balance(eq){
  const cnt = {}; let charge = ZERO;
  for (const [arr, sgn] of [[eq.lhs, -1], [eq.rhs, 1]]){
    for (const {coef, sp} of arr){
      for (const [el, n] of Object.entries(sp.atoms)) cnt[el] = (cnt[el] || ZERO).add(coef.mul(n * sgn));
      charge = charge.add(coef.mul(sp.charge * sgn));
    }
  }
  const bad = Object.entries(cnt).filter(([, v]) => !v.isZero).map(([el]) => el);
  if (bad.length){
    const side = (el, arr) => arr.reduce((s, {coef, sp}) => s.add(coef.mul(sp.atoms[el] || 0)), ZERO);
    return {ok: false, message: '左右で原子の数が合いません（' + bad.map(el => el + '：左 ' + fracText(side(el, eq.lhs)) + '、右 ' + fracText(side(el, eq.rhs))).join('／') + '）'};
  }
  if (!charge.isZero) return {ok: false, message: '左右で電荷の合計が合いません（e⁻ の数を確かめます）'};
  return {ok: true};
}

// 式を「物質ごとの数」にする（右辺 +、左辺 −）。水溶液の「aq」（大量の水）は数えない
function vectorOf(eq){
  const v = new Map();
  for (const [arr, sgn] of [[eq.lhs, -1], [eq.rhs, 1]]){
    for (const {coef, sp} of arr){
      if (sp.kind === 'aq') continue;
      v.set(sp.key, (v.get(sp.key) || ZERO).add(coef.mul(sgn)));
    }
  }
  for (const [k, c] of v) if (c.isZero) v.delete(k);
  return v;
}
// 物質の表示用の情報（key → sp）。最初に出てきた書き方を使う
function collectSpecies(eqs, into = new Map()){
  for (const eq of eqs) if (eq) for (const {sp} of [...eq.lhs, ...eq.rhs]) if (!into.has(sp.key)) into.set(sp.key, sp);
  return into;
}

// ===================== ヘスの法則 =====================
// 目的の式 = Σ c_i × 式 i となる係数 c を、分数のまま消去法で求める。作れなければ ok:false と理由
function solveCombination(targetVec, vecs){
  const keys = [...new Set([...targetVec.keys(), ...vecs.flatMap(v => [...v.keys()])])];
  const n = vecs.length;
  const missing = [...targetVec.keys()].filter(k => !vecs.some(v => v.has(k)));
  if (missing.length) return {ok: false, missing};
  const M = keys.map(k => [...vecs.map(v => v.get(k) || ZERO), targetVec.get(k) || ZERO]);
  const piv = []; let r = 0;
  for (let col = 0; col < n && r < M.length; col++){
    const p = M.findIndex((row, i) => i >= r && !row[col].isZero);
    if (p < 0) continue;
    [M[r], M[p]] = [M[p], M[r]];
    const inv = M[r][col];
    M[r] = M[r].map(x => x.div(inv));
    for (let i = 0; i < M.length; i++){
      if (i === r || M[i][col].isZero) continue;
      const f = M[i][col];
      M[i] = M[i].map((x, j) => x.sub(f.mul(M[r][j])));
    }
    piv.push(col); r++;
  }
  if (M.slice(r).some(row => !row[n].isZero)) return {ok: false, missing: []};
  const coefs = Array(n).fill(ZERO);
  piv.forEach((col, i) => { coefs[col] = M[i][n]; });
  return {ok: true, coefs};
}

const addVec = (a, b, c = ONE) => {
  const out = new Map(a);
  for (const [k, v] of b){ const x = (out.get(k) || ZERO).add(v.mul(c)); if (x.isZero) out.delete(k); else out.set(k, x); }
  return out;
};
const vecEq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && b.get(k).eq(v));
const sideVec = arr => { const v = new Map(); for (const {coef, sp} of arr) if (sp.kind !== 'aq') v.set(sp.key, (v.get(sp.key) || ZERO).add(coef)); return v; };

function permutations(a){
  if (a.length <= 1) return [a.slice()];
  const out = [];
  a.forEach((x, i) => { for (const p of permutations([...a.slice(0, i), ...a.slice(i + 1)])) out.push([x, ...p]); });
  return out;
}

// 目的の式の反応物から出発し、選んだ係数で式を 1 本ずつ足していく道のり（エネルギー図の段）を作る。
// 途中で数が負になる物質（O₂ など）は、はじめから両方の段に足しておく（spect）。
// 足す量が最も少なく、段の線が矢印と交わらない順番を選ぶ。
// target・eqs は parseEquation の結果、coefs は Frac の配列（0 は使わない式）
function buildPath(target, eqs, coefs){
  const R = sideVec(target.lhs), P = sideVec(target.rhs);
  const tvec = vectorOf(target);
  const used = coefs.map((c, i) => i).filter(i => !coefs[i].isZero && eqs[i]);
  const vecs = eqs.map(e => e ? vectorOf(e) : new Map());
  const sum = used.reduce((acc, i) => addVec(acc, vecs[i], coefs[i]), new Map());
  const residual = addVec(tvec, sum, new Frac(-1));   // 目的の式 − いまの足し合わせ
  const matched = residual.size === 0 && used.length > 0;
  const orders = used.length <= 6 ? permutations(used) : [used];
  let best = null;
  for (const order of orders){
    let run = new Map(R); const need = new Map();
    for (const i of order){
      run = addVec(run, vecs[i], coefs[i]);
      for (const [k, v] of run) if (v.sign < 0 && (!need.has(k) || +v.neg() > +need.get(k))) need.set(k, v.neg());
    }
    const total = [...need.values()].reduce((s, v) => s + +v, 0);
    if (!best || total < best.total - 1e-12) best = {order, need, total};
  }
  const spect = best ? best.need : new Map();
  const start = addVec(R, spect);
  const levels = [{vec: start}];
  const steps = [];
  let run = start;
  for (const i of (best ? best.order : [])){
    run = addVec(run, vecs[i], coefs[i]);
    levels.push({vec: run});
    steps.push({eq: i, c: coefs[i], from: levels.length - 2, to: levels.length - 1});
  }
  return {start, end: run, goal: addVec(P, spect), spect, levels, steps, matched, residual, sum, used};
}

// 段の高さ（エンタルピー、出発点を 0 とする）を決める。ΔH が分からない式が 1 本だけなら、目的の式の ΔH から逆算する。
// 戻り値：{H:[...], targetDH, solved:{kind:'target'|'eq', eq, value} | null}
function levelHeights(path, target, eqs){
  const dhOf = i => eqs[i] ? eqs[i].dh : undefined;
  let targetDH = target.dh;
  let solved = null;
  const unknownSteps = path.steps.filter(s => typeof dhOf(s.eq) !== 'number');
  const known = (i, overrides) => (overrides && overrides.has(i)) ? overrides.get(i) : dhOf(i);
  const overrides = new Map();
  if (path.matched){
    if (typeof targetDH !== 'number' && unknownSteps.length === 0){
      targetDH = path.steps.reduce((s, st) => s + +st.c * dhOf(st.eq), 0);
      solved = {kind: 'target', value: targetDH};
    } else if (typeof targetDH === 'number' && unknownSteps.length === 1){
      const u = unknownSteps[0];
      const rest = path.steps.filter(s => s !== u).reduce((s, st) => s + +st.c * dhOf(st.eq), 0);
      const v = (targetDH - rest) / +u.c;
      overrides.set(u.eq, v);
      solved = {kind: 'eq', eq: u.eq, value: v};
    }
  }
  const H = [0];
  for (const st of path.steps){
    const d = known(st.eq, overrides);
    const prev = H[H.length - 1];
    H.push(typeof d === 'number' && prev !== null ? prev + +st.c * d : null);
  }
  return {H, targetDH: typeof targetDH === 'number' ? targetDH : null, solved, overrides};
}

// ===================== 表示用の文字（上付き・下付き） =====================
// 文字の並びを「かたまり」の配列にする：{t, sub, sup, sm（小さめ）, cls（色分け用）}
const VULGAR = {'1/2':'½', '1/3':'⅓', '2/3':'⅔', '1/4':'¼', '3/4':'¾'};
function fracText(f){ f = Frac.of(f); const s = f.abs().toString(); return (f.sign < 0 ? '−' : '') + (VULGAR[s] || s); }
function coefText(f){ f = Frac.of(f); return f.eq(1) ? '' : fracText(f); }

function formulaSegs(formula){
  const segs = [];
  const parts = formula.split(/([·・•*]|\.(?=\d*[A-Z(\[]))/);
  for (let pi = 0; pi < parts.length; pi++){
    let p = parts[pi];
    if (pi % 2 === 1){ segs.push({t: '·'}); continue; }
    if (pi > 0){ const m = p.match(/^\d+/); if (m){ segs.push({t: m[0]}); p = p.slice(m[0].length); } }
    for (const m of p.matchAll(/(\d+)|([^\d]+)/g)) segs.push(m[1] ? {t: m[1], sub: true} : {t: m[2]});
  }
  return segs;
}
function speciesSegs(sp){
  if (sp.kind === 'e') return [{t: 'e'}, {t: '−', sup: true}];
  if (sp.kind === 'aq') return [{t: 'aq'}];
  const segs = formulaSegs(sp.formula);
  if (sp.charge){
    const n = Math.abs(sp.charge);
    segs.push({t: (n > 1 ? n : '') + (sp.charge > 0 ? '+' : '−'), sup: true});
  }
  if (sp.state){
    if (sp.stateStyle === 'suffix' && sp.state === 'aq') segs.push({t: 'aq'});
    else segs.push({t: '(' + sp.stateLabel + ')', sm: true});
  }
  return segs;
}
// {key → 数} の組を「C(黒鉛) + 2H₂(気) + …」にする。order は並べる順、spect は色を変える物質
function compSegs(vec, species, order, spect){
  let keys = [...order.filter(k => vec.has(k)), ...[...vec.keys()].filter(k => !order.includes(k))];
  // 両方の段に足した分（またはその残り）だけの物質は、後ろに置いて色を変える（CO + ½O₂）。
  // 目的の式の分も含むもの（C + O₂ の O₂ は、½ が目的の式の分）は変えない
  const onlySpect = k => spect && spect.has(k) && +vec.get(k) <= +spect.get(k);
  keys = [...keys.filter(k => !onlySpect(k)), ...keys.filter(onlySpect)];
  const segs = [];
  for (const k of keys){
    const c = vec.get(k);
    if (!c || c.sign <= 0) continue;
    if (segs.length) segs.push({t: ' + '});
    const cls = onlySpect(k) ? 'spect' : '';
    const ct = coefText(c);
    if (ct) segs.push({t: ct, cls});
    for (const s of speciesSegs(species.get(k))) segs.push(Object.assign({}, s, cls ? {cls} : {}));
  }
  return segs;
}
function termsSegs(arr){
  const segs = [];
  for (const {coef, sp} of arr){
    if (segs.length) segs.push({t: ' + '});
    const ct = coefText(coef); if (ct) segs.push({t: ct});
    segs.push(...speciesSegs(sp));
  }
  return segs;
}

// 数の表示。マイナスは「−」。小数の桁は digits にそろえる（与えられた値の桁に合わせる）
function numText(x, digits = 1, plus = false){
  if (x == null || !isFinite(x)) return '?';
  const s = Math.abs(x).toFixed(digits);
  if (+s === 0) return s;
  return (x < 0 ? '−' : plus ? '+' : '') + s;
}
// 入力された値の小数の桁数（表示をそろえるため）
function decimalsOf(values){
  let d = 0;
  for (const v of values) if (typeof v === 'number' && isFinite(v)){ const m = String(v).match(/\.(\d+)/); if (m) d = Math.max(d, Math.min(2, m[1].length)); }
  return d;
}

// 式の表示（新課程：→ と ΔH、旧課程：= と + Q kJ）
function equationSegs(eq, opt = {}){
  const segs = [...termsSegs(eq.lhs)];
  const dig = opt.digits != null ? opt.digits : 1;
  if (opt.old){
    segs.push({t: ' = '}, ...termsSegs(eq.rhs));
    const q = typeof eq.dh === 'number' ? -eq.dh : null;
    segs.push({t: q == null ? ' + Q kJ' : (q < 0 ? ' − ' : ' + ') + numText(Math.abs(q), dig) + ' kJ'});
  } else {
    segs.push({t: ' → '}, ...termsSegs(eq.rhs));
    if (eq.dh !== undefined) segs.push({t: '　ΔH = ' + (eq.dh === null ? '?' : numText(eq.dh, dig)) + ' kJ'});
  }
  return segs;
}

const esc = s => String(s).replace(/[&<>"]/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;'}[c]));
function segsToHTML(segs){
  return segs.map(s => {
    let h = esc(s.t);
    if (s.sub) h = '<sub>' + h + '</sub>';
    else if (s.sup) h = '<sup>' + h + '</sup>';
    else if (s.sm) h = '<small>' + h + '</small>';
    return s.cls ? '<span class="' + s.cls + '">' + h + '</span>' : h;
  }).join('');
}
// SVG の <text> の中身。上付き・下付きは dy で上下させる
function segsToSVG(segs, size, colors = {}){
  let out = '', cur = 0;
  for (const s of segs){
    const off = s.sub ? 0.28 * size : s.sup ? -0.42 * size : 0;
    const fs = s.sub || s.sup ? 0.7 * size : s.sm ? 0.8 * size : size;
    const dy = off - cur; cur = off;
    const fill = s.cls && colors[s.cls] ? ' fill="' + colors[s.cls] + '"' : '';
    out += '<tspan' + (dy ? ' dy="' + dy.toFixed(2) + '"' : '') + (fs !== size ? ' font-size="' + fs.toFixed(1) + '"' : '') + fill + '>' + esc(s.t).replace(/ /g, '&#160;') + '</tspan>';
  }
  return out;
}
// 文字の幅の見積もり（配置のため。ASCII は 0.6 文字、日本語は 1 文字）
// 文字だけ取り出す（読み上げ用の名前に使う）
function segsText(segs){ return segs.map(s => s.t).join(''); }
function segsWidth(segs, size){
  let w = 0;
  for (const s of segs){
    const fs = s.sub || s.sup ? 0.7 * size : s.sm ? 0.8 * size : size;
    for (const ch of s.t) w += fs * (/[　-鿿＀-￯]/.test(ch) ? 1 : /[ .,·]/.test(ch) ? 0.32 : /[A-Z]/.test(ch) ? 0.68 : 0.56);
  }
  return w;
}

// ===================== エネルギー図 =====================
// group = {levels:[{H, segs, dashed}], arrows:[{from, to, kind:'target'|'step', segs, dashed, eq}], order?:[levels の縦の順]}
// 各段は、その段につながる矢印の列の範囲に引く。矢印の列の並び（目的の式の矢印をどこに置くか）は、段の線が
// 矢印と交わらないものを選ぶ。
function arrangeColumns(g){
  const n = g.arrows.length;
  const y = i => g.levels[i].rank;
  const stepIdx = g.arrows.map((a, i) => i).filter(i => g.arrows[i].kind !== 'target');
  const tIdx = g.arrows.findIndex(a => a.kind === 'target');
  const cands = [];
  if (tIdx < 0) cands.push(stepIdx);
  else for (let p = stepIdx.length; p >= 0; p--) cands.push([...stepIdx.slice(0, p), tIdx, ...stepIdx.slice(p)]);
  let best = null;
  for (const order of cands){
    const col = Array(n); order.forEach((ai, c) => { col[ai] = c; });
    const span = g.levels.map(() => [Infinity, -Infinity]);
    g.arrows.forEach((a, ai) => { for (const li of [a.from, a.to]){ span[li][0] = Math.min(span[li][0], col[ai]); span[li][1] = Math.max(span[li][1], col[ai]); } });
    let cross = 0;
    g.levels.forEach((lv, li) => {
      g.arrows.forEach((a, ai) => {
        if (a.from === li || a.to === li) return;
        if (col[ai] < span[li][0] || col[ai] > span[li][1]) return;
        const lo = Math.min(y(a.from), y(a.to)), hi = Math.max(y(a.from), y(a.to));
        if (y(li) > lo && y(li) < hi) cross++;
      });
    });
    if (!best || cross < best.cross) best = {cross, col, span};
  }
  g.col = best.col; g.span = best.span.map(s => isFinite(s[0]) ? s : [0, 0]);
  g.ncols = Math.max(1, n);
}

// groups を 1 枚の SVG にする。opt.scale：'prop'（高さを ΔH に比例）／'even'（等間隔）
// opt.colors：{ink, muted, target, step, spect, bg}。opt.old：旧課程の表示（「エネルギー」「Q kJ」）
function diagramSVG(groups, opt = {}){
  // eqs：与えられた式ごとの色（式の番号順に使う）。target：目的の式の矢印、step：色が決まっていない式の矢印
  const C = Object.assign({ink: '#1f2933', muted: '#6b7480', target: '#2563eb', step: '#7c3aed', spect: '#d9480f', bg: '',
    eqs: ['#7c3aed', '#0e9f6e', '#d97706', '#db2777', '#0891b2', '#65a30d']}, opt.colors || {});
  const LS = 16, AS = 13.5;       // 段の文字・矢印の文字の大きさ
  const padL = 44, padT = 58, padB = 28, gapG = 50, colGap = 14, lvPad = 12;
  // 縦の位置：高さ（H）が分かる段は、H の順（等間隔）か H に比例した位置。分からない段（点線の目的の段）は、その下に並べる
  const hs = [];
  groups.forEach(g => g.levels.forEach(l => { if (typeof l.H === 'number') hs.push(l.H); }));
  const rnd = h => Math.round(h * 1000) / 1000;
  const distinct = [...new Set(hs.map(rnd))].sort((a, b) => b - a);
  const EVEN = 72;
  let yKnown;
  if (opt.scale === 'prop' && distinct.length > 1){
    const range = distinct[0] - distinct[distinct.length - 1];
    const k = Math.min(1.2, Math.max(0.05, 420 / range));
    yKnown = h => padT + (distinct[0] - h) * k;
  } else {
    yKnown = h => padT + distinct.indexOf(rnd(h)) * EVEN;
  }
  const maxKnownY = distinct.length ? Math.max(...distinct.map(yKnown)) : padT - EVEN;
  // 生徒が自分で置いた高さ（Y）があるときは、それをそのまま使う（「自分で矢印を引く」）
  const freeY = groups.every(g => g.levels.every(l => typeof l.Y === 'number'));
  const yOf = (l, g) => {
    if (freeY) return padT + l.Y;
    if (typeof l.H === 'number') return yKnown(l.H);
    const unk = g.levels.filter(x => typeof x.H !== 'number').sort((a, b) => a.ord - b.ord);
    return maxKnownY + EVEN * (unk.indexOf(l) + 1);
  };
  groups.forEach(g => {
    g.levels.forEach((l, i) => { if (l.ord == null) l.ord = i; });
    g.levels.forEach(l => { l.y = yOf(l, g); l.rank = l.y; });
    arrangeColumns(g);
  });
  // 横の位置：列の幅は、矢印の文字と段の文字が入るように決める
  let x = padL, maxY = 0, maxX = 0;
  const lines = [], arrows = [], texts = [];
  const overlap = (p, q) => !(p[2] <= q[0] || p[0] >= q[2] || p[3] <= q[1] || p[1] >= q[3]);
  for (const g of groups){
    const arrowW = Math.max(60, ...g.arrows.map(a => segsWidth(a.segs, AS) + 22));
    let colW = arrowW + colGap;
    g.levels.forEach((l, li) => {
      const cols = g.span[li][1] - g.span[li][0] + 1;
      const need = segsWidth(l.segs, LS) + 2 * lvPad + 40;   // 矢印の横にも文字が置けるように
      colW = Math.max(colW, need / cols);
    });
    colW = Math.ceil(colW);
    const colX = c => x + c * colW;
    g.levels.forEach((l, li) => { l.x0 = colX(g.span[li][0]) + 2; l.x1 = colX(g.span[li][1] + 1) - colGap; });
    // 矢印（縦の線とその文字）を先に決める
    const obst = [];
    const geo = g.arrows.map((a, ai) => {
      const ax = colX(g.col[ai]) + lvPad + 10;
      const y1 = g.levels[a.from].y, y2 = g.levels[a.to].y;
      const w = segsWidth(a.segs, AS), my = (y1 + y2) / 2 + AS * 0.35;
      obst.push([ax - 7, Math.min(y1, y2) + 2, ax + 7, Math.max(y1, y2) - 2], [ax + 8, my - AS, ax + 8 + w, my + 4]);
      return {ax, y1, y2, w, my};
    });
    // 段の文字の置き場所：線の上の左 → 矢印の右 → 線の上の右 → 線の下 の順に、重ならないところ
    g.levels.forEach((l, li) => {
      const w = segsWidth(l.segs, LS);
      const up = l.y - 7, dn = l.y + LS + 3;
      const xs = [l.x0 + 4];
      g.arrows.forEach((a, ai) => { if (a.from === li || a.to === li) xs.push(geo[ai].ax + 11); });
      xs.push(l.x1 - 4 - w);
      const cands = [];
      for (const ty of [up, dn]) for (const tx of xs) if (tx >= l.x0 && tx + w <= l.x1 + 30) cands.push([tx, ty]);
      if (!cands.length) cands.push([l.x0 + 4, up]);
      let best = null;
      for (const [tx, ty] of cands){
        const box = [tx - 2, ty - LS + 2, tx + w + 2, ty + 4];
        const n = obst.filter(o => overlap(box, o)).length;
        if (!best || n < best.n) best = {n, tx, ty, box};
        if (n === 0) break;
      }
      obst.push(best.box);
      l.tx = best.tx; l.ty = best.ty;
    });
    for (const l of g.levels){
      const lineEl = '<line class="vis" x1="' + l.x0 + '" y1="' + l.y.toFixed(1) + '" x2="' + l.x1 + '" y2="' + l.y.toFixed(1) + '" stroke="' + C.ink + '" stroke-width="' + (l.bold ? 3.6 : 2.2) + '"' + (l.dashed ? ' stroke-dasharray="6 5"' : '') + '/>';
      if (opt.interactive){   // 段（横線）をつかめるように、太い透明の線を重ねる。キーボードでも選べる
        const gi = groups.indexOf(g), li = g.levels.indexOf(l);
        lines.push('<g class="lvl" data-g="' + gi + '" data-lv="' + li + '" tabindex="0" role="button" aria-label="段 ' + (li + 1) + '：' + esc(segsText(l.segs)) + '">' +
          '<line class="hit" x1="' + (l.x0 - 4) + '" y1="' + l.y.toFixed(1) + '" x2="' + (l.x1 + 4) + '" y2="' + l.y.toFixed(1) + '" stroke="transparent" stroke-width="18"/>' + lineEl + '</g>');
      } else lines.push(lineEl);
      if (l.empty){   // まだ物質を書いていない段：クリックして書く、という案内（書き出しには出さない）
        if (opt.interactive) texts.push('<text pointer-events="none" x="' + (l.x0 + 4) + '" y="' + (l.y - 7).toFixed(1) + '" font-size="13" fill="' + C.muted + '">＋ クリックして物質を書く</text>');
      } else texts.push('<text pointer-events="none" x="' + l.tx.toFixed(1) + '" y="' + l.ty.toFixed(1) + '" font-size="' + LS + '" fill="' + C.ink + '">' + segsToSVG(l.segs, LS, {spect: C.spect}) + '</text>');
      if (l.warn && opt.interactive) texts.push('<g pointer-events="none"><title>原子の数が、ほかの横線と合っていません</title><circle cx="' + (l.x1 + 14) + '" cy="' + l.y.toFixed(1) + '" r="8" fill="#d61f1f"/><text x="' + (l.x1 + 14) + '" y="' + (l.y + 4.5).toFixed(1) + '" font-size="12" font-weight="700" text-anchor="middle" fill="#fff">!</text></g>');
      maxY = Math.max(maxY, l.y + 6, l.ty + 6); maxX = Math.max(maxX, l.x1 + (l.warn ? 26 : 0), l.empty ? l.x0 + 160 : l.tx + segsWidth(l.segs, LS));
    }
    g.arrows.forEach((a, ai) => {
      const {ax, y1, y2, w, my} = geo[ai];
      const dir = Math.sign(y2 - y1) || 1;
      const color = a.kind === 'target' ? C.target : a.unk ? C.muted : (a.ci != null ? C.eqs[a.ci % C.eqs.length] : C.step);
      const ya = y1 + dir * 3, yb = y2 - dir * 3;
      const head = Math.abs(yb - ya) >= 10;
      a.geo = {ax, y1, y2};
      arrows.push('<g class="arrow" data-kind="' + a.kind + '"' + (a.eq != null ? ' data-eq="' + a.eq + '"' : '') + (a.step != null ? ' data-st="' + a.step + '"' : '') +
        (opt.interactive ? ' tabindex="0" role="button" aria-label="矢印：' + esc(segsText(a.segs)) + '"' : '') + '>' +
        '<line x1="' + ax + '" y1="' + ya.toFixed(1) + '" x2="' + ax + '" y2="' + (head ? yb - dir * 7 : yb).toFixed(1) + '" stroke="' + color + '" stroke-width="' + (a.kind === 'target' ? 3.8 : 2.2) + '"' + (a.dashed ? ' stroke-dasharray="5 4"' : '') + '/>' +
        (head ? '<path d="M' + (ax - 5.5) + ' ' + (yb - dir * 9).toFixed(1) + ' L' + ax + ' ' + yb.toFixed(1) + ' L' + (ax + 5.5) + ' ' + (yb - dir * 9).toFixed(1) + ' Z" fill="' + color + '"/>' : '') +
        '<text x="' + (ax + 8) + '" y="' + my.toFixed(1) + '" font-size="' + AS + '" fill="' + color + '">' + segsToSVG(a.segs, AS) + '</text>' +
        '<rect x="' + (ax - 8) + '" y="' + Math.min(y1, y2).toFixed(1) + '" width="' + (w + 24).toFixed(0) + '" height="' + Math.max(8, Math.abs(y2 - y1)).toFixed(1) + '" fill="transparent"/>' +   // マウスで指しやすくする
        '</g>');
      maxX = Math.max(maxX, ax + 12 + w);
    });
    x = colX(g.ncols) + gapG;
  }
  const parts = [...lines, ...arrows, ...texts];   // 段の文字をいちばん上に描く
  const W = Math.ceil(maxX + 20), H = Math.ceil(maxY + padB);
  // 縦軸（エンタルピー）。旧課程のときは「エネルギー」
  const axis = '<line x1="18" y1="14" x2="18" y2="' + (H - 10) + '" stroke="' + C.muted + '" stroke-width="1.2"/>' +
    '<path d="M13 22 L18 10 L23 22" fill="none" stroke="' + C.muted + '" stroke-width="1.2"/>' +
    '<text x="26" y="20" font-size="12" fill="' + C.muted + '">' + (opt.old ? 'エネルギー' : 'エンタルピー') + '</text>';
  const bg = C.bg ? '<rect width="100%" height="100%" fill="' + C.bg + '"/>' : '';
  return {width: W, height: H,
    svg: '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + W + ' ' + H + '" width="' + W + '" height="' + H + '" font-family="Arial, \'Hiragino Sans\', \'Hiragino Kaku Gothic ProN\', \'Yu Gothic\', Meiryo, sans-serif">' + bg + axis + parts.join('') + '</svg>'};
}

// 矢印の文字：「(2)  ΔH = −393.5 kJ」「(3)×2  ΔH = −571.6 kJ」。旧課程は「(2)  393.5 kJ」
function arrowSegs(label, dh, digits, old, plus){
  const segs = label ? [{t: label + '  '}] : [];
  if (old) segs.push({t: dh == null ? 'Q kJ' : numText(Math.abs(dh), digits) + ' kJ'});
  else segs.push({t: 'ΔH = ' + (dh == null ? '?' : numText(dh, digits, plus)) + ' kJ'});
  return segs;
}

// 目的の式と、係数を選んだ式から、エネルギー図のグループを作る
// 段の中の物質の並べ方：目的の式に出てくる元素の順（NaCl なら Na の物質 → Cl の物質）、電子は最後。
// 同じ元素の中では、式に出てきた順（CO2 + 2H2 + O2、Na⁺ + ½Cl₂ + e⁻ のようになる）
function speciesOrder(target, eqs){
  const all = [...target.lhs, ...target.rhs, ...eqs.filter(Boolean).flatMap(e => [...e.lhs, ...e.rhs])].map(t => t.sp);
  const keys = all.map(sp => sp.key).filter((k, i, a) => a.indexOf(k) === i);
  const els = [];
  for (const sp of [...target.lhs, ...target.rhs].map(t => t.sp)) for (const el of Object.keys(sp.atoms)) if (!els.includes(el)) els.push(el);
  for (const sp of all) for (const el of Object.keys(sp.atoms)) if (!els.includes(el)) els.push(el);
  const rank = k => { const sp = all.find(x => x.key === k); if (sp.kind === 'e') return 1e9; const el = Object.keys(sp.atoms)[0]; return el ? els.indexOf(el) : 1e8; };
  return keys.map((k, i) => [k, rank(k), i]).sort((a, b) => a[1] - b[1] || a[2] - b[2]).map(x => x[0]);
}

function groupFromPath(path, heights, target, eqs, species, opt = {}){
  const order = speciesOrder(target, eqs);
  const digits = opt.digits != null ? opt.digits : 1;
  const g = {levels: [], arrows: []};
  path.levels.forEach((lv, i) => g.levels.push({H: heights.H[i], segs: compSegs(lv.vec, species, order, path.spect), ord: i}));
  path.steps.forEach(st => {
    const e = eqs[st.eq];
    const dh = heights.overrides.has(st.eq) ? heights.overrides.get(st.eq) : e.dh;
    const mag = st.c.abs();
    const label = '(' + (st.eq + 1) + ')' + (mag.eq(1) ? '' : '×' + fracText(mag));
    // 矢印は、もとの式の向き（反応物 → 生成物）に描く。逆向きに使った式は、矢印が道のりと逆を向く
    const [from, to] = st.c.sign > 0 ? [st.from, st.to] : [st.to, st.from];
    g.arrows.push({from, to, kind: 'step', eq: st.eq, ci: st.eq, dashed: typeof dh !== 'number',
      segs: arrowSegs(label, typeof dh === 'number' ? +mag * dh : null, digits, opt.old)});
  });
  const last = g.levels.length - 1;
  if (path.matched){
    g.levels[0].bold = true; g.levels[last].bold = true;   // 目的の式の出発点と到着点の段は太い線にする
    g.arrows.push({from: 0, to: last, kind: 'target', segs: arrowSegs(opt.targetLabel || '', heights.targetDH, digits, opt.old), dashed: heights.targetDH == null});
  } else {
    // まだ目的の式にならないとき：目的の生成物の段を点線で下に置く（高さは分からない）
    const maxOrd = g.levels.length;
    g.levels.push({H: null, segs: compSegs(path.goal, species, order, path.spect), dashed: true, ord: maxOrd});
    g.arrows.push({from: 0, to: g.levels.length - 1, kind: 'target', dashed: true, segs: arrowSegs(opt.targetLabel || '', typeof target.dh === 'number' ? target.dh : null, digits, opt.old)});
  }
  return g;
}

// 1 本の式だけのエネルギー図（目的の式がないとき、与えられた式を 1 本ずつ並べる）
function groupFromEquation(eq, label, species, opt = {}){
  const order = [...eq.lhs, ...eq.rhs].map(t => t.sp.key);
  const digits = opt.digits != null ? opt.digits : 1;
  const L = sideVec(eq.lhs), R = sideVec(eq.rhs);
  const known = typeof eq.dh === 'number';
  const g = {levels: [
    {H: 0, segs: compSegs(L, species, order), ord: 0},
    {H: known ? eq.dh : null, segs: compSegs(R, species, order), ord: 1, dashed: !known}], arrows: []};
  g.arrows.push({from: 0, to: 1, kind: opt.kind || 'step', eq: opt.eqIndex, ci: opt.eqIndex, dashed: !known, segs: arrowSegs(label, known ? eq.dh : null, digits, opt.old)});
  return g;
}

// 計算の行：「(2) + (3)×2 − (1)」と「ΔH = −393.5 + 2×(−285.8) − (−890.5) = −74.6 kJ」
function calcText(steps, eqs, result, opt = {}){
  const digits = opt.digits != null ? opt.digits : 1;
  if (!steps.length) return {combo: '', expr: ''};
  const sorted = steps.slice().sort((a, b) => a.eq - b.eq);
  let combo = '', expr = '';
  sorted.forEach((st, k) => {
    const mag = st.c.abs(), neg = st.c.sign < 0;
    const m = mag.eq(1) ? '' : fracText(mag);
    combo += (k === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ')) + '(' + (st.eq + 1) + ')' + (m ? '×' + m : '');
    const dh = opt.overrides && opt.overrides.has(st.eq) ? null : eqs[st.eq].dh;
    let v = typeof dh === 'number' ? (opt.old ? -dh : dh) : null;
    let vs = v == null ? (opt.old ? 'Q' + (st.eq + 1) : 'ΔH' + (st.eq + 1)) : numText(v, digits);
    if (v != null && v < 0 && (k > 0 || neg || m)) vs = '(' + vs + ')';   // 先頭の負の数だけは、かっこを付けない
    expr += (k === 0 ? (neg ? '−' : '') : (neg ? ' − ' : ' + ')) + (m ? m + '×' : '') + vs;
  });
  const lhs = opt.old ? 'Q' : 'ΔH';
  const res = result == null ? '' : ' = ' + numText(opt.old ? -result : result, digits) + ' kJ';
  return {combo, expr: lhs + ' = ' + expr + res};
}

// ===================== 自分で矢印を引く（エネルギー図エディタ 0.4） =====================
// draw = {spect:{key:量}, steps:[{eq, c, from}], target:段の番号|null}
//   spect：すべての段に同じだけ足す物質（O₂ など。ΔH は変わらない）
//   steps：引いた矢印。eq：与えられた式の番号、c：符号つきの倍率（負は逆向き）、from：出発する段の番号（0 = はじめの段、k+1 = steps[k] でできた段）
//   target：目的の式の矢印の終点の段の番号（出発はいつも 0）
// 段は、はじめの段（目的の式の反応物 + spect）に矢印を順に足して、計算で作る（保存しない）。
const emptyDraw = () => ({spect: {}, steps: [], target: null});
const okEq = p => !!(p && !p.empty && !p.errors.length);
const DRAW_MULTS = ['1/2', '1', '3/2', '2', '3', '4', '5', '6'].map(x => Frac.parse(x));
// いまの量（have）で、必要な量（need）の何倍まで引けるか。引ける倍率を小さい順に返す
function feasibleMults(have, need){
  if (!need.size) return [];
  return DRAW_MULTS.filter(m => [...need].every(([k, v]) => (have.get(k) || ZERO).sub(v.mul(m)).sign >= 0));
}
// 段（vec）から式 eq を引けるか。fwd：左辺 → 右辺、rev：右辺 → 左辺 で引ける倍率の一覧。引けなければ足りない物質（missing）
function dragPlan(vec, eq){
  const lhs = sideVec(eq.lhs), rhs = sideVec(eq.rhs);
  const fwd = feasibleMults(vec, lhs), rev = feasibleMults(vec, rhs);
  const short = need => [...need].filter(([k, v]) => (vec.get(k) || ZERO).sub(v).sign < 0).map(([k]) => k);
  return {fwd, rev, missingFwd: short(lhs), missingRev: short(rhs)};
}
// 引いたあとの ΔH の符号から、矢印の向き（発熱 = 下向き）。ΔH が分からないときは null
function arrowDown(dh, c){
  if (typeof dh !== 'number') return null;
  const v = dh * +c;
  return v < 0 ? true : v > 0 ? false : null;
}
// 引いた矢印から、段・高さ・目的の式の矢印を計算する。式が直されて引けなくなった矢印は invalid に入れて、図には出さない
function drawCompute(draw, target, eqs){
  const S = new Map();
  for (const [k, v] of Object.entries(draw.spect || {})){ const f = Frac.parse(v); if (f && f.sign > 0) S.set(k, f); }
  const start = addVec(sideVec(target.lhs), S), goal = addVec(sideVec(target.rhs), S);
  const levels = [{vec: start, parent: -1, step: -1, orig: 0, H: 0}];
  const steps = [], invalid = [], newIdx = new Map([[0, 0]]);
  (draw.steps || []).forEach((st, k) => {
    const p = eqs[st.eq], c = Frac.parse(st.c);
    const fail = why => invalid.push({k, eq: st.eq, why});
    if (!okEq(p)) return fail('eq');
    if (!c || c.isZero) return fail('c');
    if (!newIdx.has(st.from)) return fail('from');
    const from = newIdx.get(st.from);
    const vec = addVec(levels[from].vec, vectorOf(p), c);
    if ([...vec.values()].some(v => v.sign < 0)) return fail('short');
    levels.push({vec, parent: from, step: k, orig: k + 1, H: null});
    newIdx.set(k + 1, levels.length - 1);
    steps.push({k, eq: st.eq, c, from, to: levels.length - 1});
  });
  const reached = levels.map((l, i) => i > 0 && vecEq(l.vec, goal) ? i : -1).filter(i => i > 0);
  let tl = -1;
  if (draw.target != null && draw.target > 0 && newIdx.has(draw.target)){ const j = newIdx.get(draw.target); if (j > 0 && vecEq(levels[j].vec, goal)) tl = j; }
  const chainTo = j => { const out = []; while (j > 0){ const st = steps.find(x => x.to === j); out.unshift(st); j = st.from; } return out; };
  let targetDH = null, solved = null, overrides = new Map();
  if (tl > 0){
    const h = levelHeights({steps: chainTo(tl).map(x => ({eq: x.eq, c: x.c})), matched: true}, target, eqs);
    targetDH = h.targetDH; solved = h.solved; overrides = h.overrides;
  }
  const dhOf = i => overrides.has(i) ? overrides.get(i) : (eqs[i] ? eqs[i].dh : undefined);
  for (const st of steps){
    const d = dhOf(st.eq), f = levels[st.from].H;
    levels[st.to].H = typeof d === 'number' && f !== null ? f + +st.c * d : null;
  }
  return {S, start, goal, levels, steps, invalid, reached, tl, targetDH, solved, overrides, dhOf, chainTo, last: levels.length - 1};
}
// 矢印 k を消す。その段から出ている矢印も、順に消える（番号を詰め直す）
function drawRemoveStep(draw, k){
  const gone = new Set([k + 1]);   // 消える段の番号
  const keep = [];
  (draw.steps || []).forEach((st, i) => {
    if (i === k || gone.has(st.from)){ gone.add(i + 1); return; }
    keep.push({st, i});
  });
  const map = new Map([[0, 0]]); keep.forEach(({i}, n) => map.set(i + 1, n + 1));
  return {spect: Object.assign({}, draw.spect),
    steps: keep.map(({st}) => ({eq: st.eq, c: st.c, from: map.get(st.from)})),
    target: draw.target != null && map.has(draw.target) && !gone.has(draw.target) ? map.get(draw.target) : null};
}
// 与えられた式 i を消したとき：その式を使った矢印を消し、i より後の式の番号を詰める
function drawRemoveEq(draw, i){
  let d = {spect: Object.assign({}, draw.spect), steps: draw.steps.map(x => ({...x})), target: draw.target};
  for (let k = d.steps.length - 1; k >= 0; k--) if (d.steps[k] && d.steps[k].eq === i) d = drawRemoveStep(d, k);
  d.steps.forEach(st => { if (st.eq > i) st.eq--; });
  return d;
}
// 図にする。arrowSegs の向きは「引いた向き」（ΔH の符号 = 矢印の向き）
function groupFromDraw(dc, target, eqs, species, opt = {}){
  const order = speciesOrder(target, eqs);
  const digits = opt.digits != null ? opt.digits : 1;
  const g = {levels: [], arrows: []};
  dc.levels.forEach((l, i) => g.levels.push({H: l.H, segs: compSegs(l.vec, species, order, dc.S), ord: i, dashed: i > 0 && l.H === null,
    bold: dc.tl > 0 && (i === 0 || i === dc.tl)}));
  for (const st of dc.steps){
    const d = dc.dhOf(st.eq), mag = st.c.abs(), rev = st.c.sign < 0;
    const label = '(' + (st.eq + 1) + ')' + (rev ? 'の逆' : '') + (mag.eq(1) ? '' : '×' + fracText(mag));
    const value = typeof d === 'number' ? +st.c * d : null;
    g.arrows.push({from: st.from, to: st.to, kind: 'step', eq: st.eq, ci: st.eq, step: st.k, dashed: value === null,
      segs: arrowSegs(label, value, digits, opt.old, true)});
  }
  if (dc.tl > 0) g.arrows.push({from: 0, to: dc.tl, kind: 'target', dashed: dc.targetDH === null, segs: arrowSegs('目的', dc.targetDH, digits, opt.old, true)});
  return g;
}
// 「答えを見る」：自動で求めた道のり（buildPath）を、引いた矢印にする
function drawFromPath(path){
  const d = emptyDraw();
  for (const [k, v] of path.spect) d.spect[k] = v.toString();
  path.steps.forEach((st, n) => d.steps.push({eq: st.eq, c: st.c.toString(), from: n}));
  d.target = path.steps.length || null;
  return d;
}

// ===================== 自分で矢印を引く（0.5：段ごとに物質を自分で書く） =====================
// free = {levels:[{items, parent, dy}], target}
//   levels[0] がはじめの段（items が null のあいだは、目的の式の反応物をそのまま使う）。levels[k]（k ≥ 1）は矢印 k の終点の段
//   items：段の物質 {key: 量}。parent：矢印の出発の段の番号。dy：矢印を離した位置の、出発の段からの上下（下が正）
//   target：目的の式の矢印の終点の段の番号（出発は、いつもはじめの段）
// 段は「その段にある物質すべてがもつエネルギー」を表すので、どの段も各元素の原子の数は同じでなければならない。
const emptyFree = () => ({levels: [{items: null, parent: -1, dy: 0}], target: null});
function itemsToVec(items){
  const v = new Map();
  for (const [k, a] of Object.entries(items || {})){ const f = Frac.parse(String(a)); if (f && f.sign > 0) v.set(k, f); }
  return v;
}
function vecToItems(vec){ const o = {}; for (const [k, f] of vec) if (f.sign > 0) o[k] = f.toString(); return o; }
// 元素ごとの原子の数と電荷の合計
function inventory(vec, species){
  const inv = new Map(); let unknown = false;
  const add = (k, f) => inv.set(k, (inv.get(k) || ZERO).add(f));
  for (const [key, f] of vec){
    const sp = species.get(key); if (!sp){ unknown = true; continue; }
    for (const [el, n] of Object.entries(sp.atoms)) add(el, f.mul(n));
    if (sp.charge) add('電荷', f.mul(sp.charge));
  }
  for (const [k, v] of [...inv]) if (v.isZero) inv.delete(k);
  return {inv, unknown};
}
const invEq = (a, b) => a.size === b.size && [...a].every(([k, v]) => b.has(k) && b.get(k).eq(v));
// 始点の段 A から終点の段 B への変化（B − A）が、与えられた式の何倍かを探す。順方向は c > 0、逆向きは c < 0
function explainArrow(vecA, vecB, eqs){
  const diff = addVec(vecB, vecA, new Frac(-1));
  if (!diff.size) return null;
  for (let i = 0; i < eqs.length; i++){
    const p = eqs[i]; if (!okEq(p)) continue;
    const v = vectorOf(p); if (!v.size) continue;
    const k0 = [...v.keys()][0]; if (!diff.has(k0)) continue;
    const m = diff.get(k0).div(v.get(k0));
    if (m.isZero || +m.abs() > 20) continue;
    const keys = new Set([...diff.keys(), ...v.keys()]);
    if ([...keys].every(k => (diff.get(k) || ZERO).eq((v.get(k) || ZERO).mul(m)))) return {i, c: m};
  }
  return null;
}
// 段 li の物質から式 i を引いたあとの物質（引けなければ null）。dir：'fwd' / 'rev'
function applyEq(vec, eq, c){
  const out = addVec(vec, vectorOf(eq), c);
  return [...out.values()].some(v => v.sign < 0) ? null : out;
}
function freeCompute(free, target, eqs, species){
  const lv = free.levels;
  const start = lv[0].items ? itemsToVec(lv[0].items) : sideVec(target.lhs);
  const levels = lv.map((l, i) => {
    const vec = i === 0 ? start : itemsToVec(l.items);
    return {vec, written: i === 0 || vec.size > 0, parent: l.parent, dy: l.dy, Y: 0};
  });
  levels.forEach((l, i) => { if (i > 0) l.Y = levels[l.parent].Y + l.dy; });
  // 離した位置が近すぎる横線は、上下の順番を変えずに少しだけ離す（線や文字が重ならないように）
  const GAP = 38, order = levels.map((l, i) => i).sort((a, b) => levels[a].Y - levels[b].Y || a - b);
  for (let n = 1; n < order.length; n++){
    const d = levels[order[n]].Y - levels[order[n - 1]].Y;
    if (d < GAP) for (let m = n; m < order.length; m++) levels[order[m]].Y += GAP - d;
  }
  const minY = Math.min(...levels.map(l => l.Y)); levels.forEach(l => { l.Y -= minY; });
  const goal = addVec(start, vectorOf(target), ONE);
  const startInv = inventory(start, species).inv;
  levels.forEach(l => { const r = inventory(l.vec, species); l.inv = r.inv; l.unknown = r.unknown; l.mismatch = l.written && !invEq(r.inv, startInv); });
  const steps = [];
  for (let k = 1; k < levels.length; k++){
    const a = levels[levels[k].parent], b = levels[k], both = a.written && b.written;
    steps.push({k, from: levels[k].parent, to: k, both, ex: both ? explainArrow(a.vec, b.vec, eqs) : null, down: b.Y > a.Y});
  }
  const reached = levels.map((l, i) => i > 0 && l.written && vecEq(l.vec, goal) ? i : -1).filter(i => i > 0);
  const chainTo = j => { const out = []; while (j > 0){ out.unshift(steps[j - 1]); j = steps[j - 1].from; } return out; };
  let tl = -1;
  if (free.target != null && free.target > 0 && free.target < levels.length && levels[free.target].written && vecEq(levels[free.target].vec, goal)) tl = free.target;
  let targetDH = null, solved = null, overrides = new Map();
  if (tl > 0){
    const chain = chainTo(tl);
    if (chain.every(x => x.ex)){
      const h = levelHeights({steps: chain.map(x => ({eq: x.ex.i, c: x.ex.c})), matched: true}, target, eqs);
      targetDH = h.targetDH; solved = h.solved; overrides = h.overrides;
    }
  }
  const dhOf = i => overrides.has(i) ? overrides.get(i) : (eqs[i] ? eqs[i].dh : undefined);
  steps.forEach(st => { if (st.ex){ const d = dhOf(st.ex.i); st.signed = typeof d === 'number' ? +st.ex.c * d : null; } });
  let last = 0; levels.forEach((l, i) => { if (l.written) last = i; });
  return {levels, steps, start, goal, startInv, reached, tl, targetDH, solved, overrides, dhOf, chainTo, last};
}
// 段 li とその先の段をすべて消す（番号を詰め直す）
function freeRemoveLevel(free, li){
  if (li <= 0) return free;
  const gone = new Set([li]);
  free.levels.forEach((l, i) => { if (i > li && gone.has(l.parent)) gone.add(i); });
  const map = new Map(); let n = 0;
  free.levels.forEach((l, i) => { if (!gone.has(i)) map.set(i, n++); });
  return {levels: free.levels.filter((l, i) => !gone.has(i)).map(l => ({...l, parent: l.parent < 0 ? -1 : map.get(l.parent)})),
    target: free.target != null && map.has(free.target) ? map.get(free.target) : null};
}
// 矢印を引く（新しい段を足す）。items：段の物質（null = まだ書いていない）
function freeAddChild(free, parent, items, dy){
  const f = {levels: free.levels.map(l => ({...l})), target: free.target};
  f.levels.push({items: items ? {...items} : {}, parent, dy});
  return f;
}
// 段の物質を直す。start 段が items = null のときは、startVec から作る
function freeSetItems(free, li, items){
  const f = {levels: free.levels.map(l => ({...l})), target: free.target};
  f.levels[li].items = {...items};
  return f;
}
// 「答えを見る」：自動で求めた道のり（buildPath）を、段と矢印にする
function freeFromPath(path, heights){
  const f = emptyFree();
  const h = heights && heights.H ? heights.H : [];
  f.levels[0].items = vecToItems(path.levels[0].vec);
  for (let i = 1; i < path.levels.length; i++){
    const down = h[i] == null || h[i - 1] == null ? true : h[i] < h[i - 1];
    f.levels.push({items: vecToItems(path.levels[i].vec), parent: i - 1, dy: down ? 84 : -84});
  }
  f.target = path.levels.length > 1 ? path.levels.length - 1 : null;
  return f;
}
// 図にする。矢印のラベルは大きさ（絶対値）だけ。向きは生徒が置いた矢印の向き
function groupFromFree(fc, target, eqs, species, opt = {}){
  const order = speciesOrder(target, eqs);
  const digits = opt.digits != null ? opt.digits : 1;
  const g = {levels: [], arrows: []};
  fc.levels.forEach((l, i) => g.levels.push({H: null, Y: l.Y, segs: l.written ? compSegs(l.vec, species, order, null) : [], ord: i,
    dashed: !l.written, empty: !l.written, warn: l.mismatch, bold: fc.tl > 0 && (i === 0 || i === fc.tl)}));
  for (const st of fc.steps){
    let segs, unk = false;
    if (st.ex){
      const mag = st.ex.c.abs(), rev = st.ex.c.sign < 0;
      const label = '(' + (st.ex.i + 1) + ')' + (rev ? 'の逆' : '') + (mag.eq(1) ? '' : '×' + fracText(mag));
      segs = [{t: label + '  '}, {t: st.signed == null ? '? kJ' : numText(Math.abs(st.signed), digits) + ' kJ'}];
    } else { segs = [{t: 'ΔH = ? kJ'}]; unk = true; }
    g.arrows.push({from: st.from, to: st.to, kind: 'step', eq: st.ex ? st.ex.i : null, ci: st.ex ? st.ex.i : null, step: st.k, dashed: !st.ex, unk, segs});
  }
  if (fc.tl > 0) g.arrows.push({from: 0, to: fc.tl, kind: 'target', dashed: fc.targetDH === null, segs: arrowSegs('目的', fc.targetDH, digits, opt.old, true)});
  return g;
}

// ---- ヒント（段階を追って小出しにする） ----
// 返り値：{cat, id, lines:[弱いヒント, 具体的なヒント, 答えに近いヒント]}。いまいちばん先に直すところを 1 つだけ選ぶ。
// 順番：段が空 → 原子の数 → 矢印の向き → 説明できない矢印 → つづき（使えそうな式） → 目的の矢印
function hintFor(fc, target, eqs, species){
  const nm = k => { const sp = species.get(k); return sp ? segsText(speciesSegs(sp)) : k; };
  const lvName = i => '横線 ' + (i + 1);
  const unwritten = fc.levels.map((l, i) => l.written ? -1 : i).filter(i => i > 0);
  if (unwritten.length) return {cat: 'empty', id: 'empty:' + unwritten.join(','), lines: [
    'まだ物質を書いていない横線があります。', lvName(unwritten[0]) + ' をクリックして、物質を書きます。',
    '矢印の始点の横線から、与えられた式のどれかで変わった物質を書きます。式を選んでからドラッグすると、自動で書かれます。']};
  const bad = fc.levels.map((l, i) => l.mismatch ? i : -1).filter(i => i >= 0);
  if (bad.length){
    const i = bad[0], diffs = [];
    for (const el of new Set([...fc.startInv.keys(), ...fc.levels[i].inv.keys()])){
      const d = (fc.levels[i].inv.get(el) || ZERO).sub(fc.startInv.get(el) || ZERO); if (d.isZero) continue;
      diffs.push((el === '電荷' ? '電荷が ' + fracText(d.abs()) : el + ' が ' + fracText(d.abs()) + ' 個') + (d.sign < 0 ? '足りません' : '多すぎます'));
    }
    // 横線 1 との差を埋める物質を、1 種類で探す
    let fix = null;
    for (const [k, sp] of species){
      if (sp.kind !== 'species') continue;
      for (const m of DRAW_MULTS){
        const t = addVec(fc.levels[i].vec, new Map([[k, m]]));
        if (invEq(inventory(t, species).inv, fc.startInv)){ fix = {k, m}; break; }
      }
      if (fix) break;
    }
    return {cat: 'atoms', id: 'atoms:' + bad.join(','), lines: [
      '原子の数がそろっていない横線があります（!の印）。どの横線も、原子の数は同じです。',
      lvName(i) + ' は、' + lvName(0) + ' と比べて ' + (diffs.slice(0, 2).join('、') || '物質が合っていません') + '。',
      fix ? nm(fix.k) + ' を ' + (fix.m.eq(1) ? '1' : fracText(fix.m)) + ' つ、' + lvName(i) + ' に足します。足したら、ほかの横線にも同じ物質を足します。'
        : lvName(i) + ' の物質を見直します。足すときは、ほかの横線にも同じ物質を足します。']};
  }
  const wrong = fc.steps.filter(st => st.ex && st.signed != null && st.signed !== 0 && (st.signed < 0) !== st.down);
  const tWrong = fc.tl > 0 && fc.targetDH != null && fc.targetDH !== 0 && (fc.targetDH < 0) !== (fc.levels[fc.tl].Y > fc.levels[0].Y);
  if (wrong.length || tWrong){
    const st = wrong[0];
    if (st) return {cat: 'dir', id: 'dir:' + st.k, lines: [
      '矢印の向きが合っていないものがあります。発熱（ΔH < 0）は下向き、吸熱（ΔH > 0）は上向きです。',
      '矢印 (' + (st.ex.i + 1) + ')' + (st.ex.c.sign < 0 ? ' の逆' : '') + ' の向きを確かめます。',
      '(' + (st.ex.i + 1) + ')' + (st.ex.c.sign < 0 ? ' の逆' : '') + ' は ΔH = ' + numText(st.signed, 1, true) + ' kJ で、' + (st.signed < 0 ? '発熱なので下' : '吸熱なので上') + '向きに引きます。']};
    return {cat: 'dir', id: 'dir:target', lines: ['矢印の向きが合っていないものがあります。発熱（ΔH < 0）は下向き、吸熱（ΔH > 0）は上向きです。',
      '目的の矢印の向きを確かめます。', '目的の式の ΔH = ' + numText(fc.targetDH, 1, true) + ' kJ で、' + (fc.targetDH < 0 ? '発熱なので下' : '吸熱なので上') + '向きです。']};
  }
  const unex = fc.steps.filter(st => st.both && !st.ex);
  if (unex.length){
    const st = unex[0], a = fc.levels[st.from], b = fc.levels[st.to];
    const diff = addVec(b.vec, a.vec, new Frac(-1));
    const dec = [], inc = [];
    for (const [k, f] of diff) (f.sign < 0 ? dec : inc).push(nm(k) + (f.abs().eq(1) ? '' : ' ' + fracText(f.abs())));
    const same = !diff.size;
    // いちばん近い式：変化に出てくる物質をいちばん多く含む式
    let best = null, bestScore = 0;
    eqs.forEach((p, i) => { if (!okEq(p)) return; const v = vectorOf(p); let sc = 0; for (const k of diff.keys()) if (v.has(k)) sc++; if (sc > bestScore){ bestScore = sc; best = i; } });
    return {cat: 'noeq', id: 'noeq:' + st.k, lines: [
      '矢印 ' + st.k + ' は、どの式でも説明できません（ΔH が ? のままです）。',
      same ? '始点と終点の物質が同じです。' : 'この矢印では、' + (dec.length ? dec.join('・') + ' が減り' : '') + (dec.length && inc.length ? '、' : '') + (inc.length ? inc.join('・') + ' が増え' : '') + 'ています。',
      best != null ? '(' + (best + 1) + ') の式が近いです。倍率や向き、足りない物質を確かめます。' : '与えられた式の左辺と右辺の差と、見くらべます。']};
  }
  if (fc.tl > 0 && fc.targetDH != null) return {cat: 'done', id: 'done', lines: ['目的の式ができています。ΔH = ' + numText(fc.targetDH, 1, true) + ' kJ です。']};
  if (fc.reached.length && fc.tl < 0) return {cat: 'target', id: 'target', lines: [
    '目的の生成物がそろった横線があります。', '最初の横線（' + lvName(0) + '）から、その横線（' + lvName(fc.reached[0]) + '）へ、目的の矢印を引きます。',
    'ドラッグして、最初の横線から ' + lvName(fc.reached[0]) + ' の線の上で離します。']};
  // つづき：いちばん新しく書いた横線から、使える式
  const fl = fc.last, vec = fc.levels[fl].vec;
  const usable = [];
  eqs.forEach((p, i) => { if (!okEq(p)) return; const pl = dragPlan(vec, p); if (pl.fwd.length) usable.push({i, rev: false}); else if (pl.rev.length) usable.push({i, rev: true}); });
  const used = new Set(fc.steps.filter(x => x.ex).map(x => x.ex.i));
  const fresh = usable.filter(u => !used.has(u.i)), pick = (fresh.length ? fresh : usable)[0];
  if (pick) return {cat: 'next', id: 'next:' + fl, lines: [
    'つづきを考えます。目的の生成物がそろうまで、式を使って矢印を引きます。',
    lvName(fl) + ' から使える式があります。',
    '(' + (pick.i + 1) + ') の式が使えます（' + (pick.rev ? '右辺' : '左辺') + 'の物質が ' + lvName(fl) + ' にそろっています）。']};
  // 使える式がない → 補う物質が足りない
  let cand = null, bestM = 99;
  eqs.forEach((p, i) => { if (!okEq(p) || used.has(i)) return; const pl = dragPlan(vec, p); const m = Math.min(pl.missingFwd.length || 99, pl.missingRev.length || 99); if (m > 0 && m < bestM){ bestM = m; cand = {i, miss: pl.missingFwd.length && pl.missingFwd.length <= (pl.missingRev.length || 99) ? pl.missingFwd : pl.missingRev}; } });
  return {cat: 'next', id: 'next0:' + fl, lines: [
    lvName(fl) + ' からは、どの式も使えません。',
    '式の物質が足りないのかもしれません。補う物質（O₂ など）を足すことを考えます。',
    cand ? '(' + (cand.i + 1) + ') を使うには ' + cand.miss.map(nm).join('・') + ' が要ります。すべての横線に足します。' : '使っていない式の左辺・右辺の物質を見くらべます。']};
}

const api = {emptyFree, itemsToVec, vecToItems, inventory, invEq, explainArrow, applyEq, freeCompute, freeRemoveLevel, freeAddChild, freeSetItems, freeFromPath, groupFromFree, hintFor, emptyDraw, okEq, feasibleMults, dragPlan, arrowDown, drawCompute, drawRemoveStep, drawRemoveEq, groupFromDraw, drawFromPath, DRAW_MULTS, segsText, Frac, ZERO, ONE, ELEMENTS, normalize, parseFormula, parseCharge, parseTerm, splitTerms, parseDH, parseEquation,
  balance, vectorOf, sideVec, collectSpecies, solveCombination, buildPath, levelHeights, addVec, vecEq,
  fracText, coefText, formulaSegs, speciesSegs, compSegs, termsSegs, equationSegs, numText, decimalsOf,
  segsToHTML, segsToSVG, segsWidth, diagramSVG, arrowSegs, groupFromPath, groupFromEquation, calcText, speciesOrder, esc};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemEnergy = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
