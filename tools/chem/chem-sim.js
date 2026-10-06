// 化学系アプリの土台 A（数値計算）：反応の速さの式・アレニウスの式・微分方程式の時間発展・平衡の解・Q と K。
// DOM に触らない（Node でテストする：dev/test-sim.cjs）。ブラウザでは window.ChemSim。
// 濃度は mol/L、時間は「模型の時間」（秒）。設計は docs/reaction-design.md。
(function (root) {
'use strict';

const R = 8.314;          // 気体定数 J/(K·mol)
const R_PA_L = 8.314e3;   // 気体定数 Pa·L/(K·mol)（圧平衡定数・分圧に使う）

// ---- 反応のかたち ----
// net = {species:['H2','I2','HI'], reactions:[{r:{H2:1, I2:1}, p:{HI:2}, kf, kb}]}
// 速さの式は素反応として、係数をそのまま次数にする：v₁ = kf·Π[反応物]^係数、v₂ = kb·Π[生成物]^係数。
// 次数を変えたいときは order:{H2:1, ...}（正反応）・orderB（逆反応）を持たせる。
function compile(net){
  const idx = {}; net.species.forEach((k, i) => { idx[k] = i; });
  const rx = net.reactions.map(r => {
    const toList = o => Object.entries(o).map(([k, n]) => { if (!(k in idx)) throw new Error('物質がない：' + k); return [idx[k], n]; });
    const reac = toList(r.r), prod = toList(r.p);
    const ordF = r.order ? toList(r.order) : reac, ordB = r.orderB ? toList(r.orderB) : prod;
    const nu = new Float64Array(net.species.length);
    for (const [i, n] of reac) nu[i] -= n;
    for (const [i, n] of prod) nu[i] += n;
    // reversible：逆反応の道があるか（いまの kb が 0 でも、逆反応を「止めた」だけなら道は残す）
    return {reac, prod, ordF, ordB, nu, kf: r.kf, kb: r.kb || 0, reversible: r.reversible ?? !!r.kb};
  });
  return {species: net.species.slice(), idx, rx, n: net.species.length};
}
const powProd = (c, list) => { let v = 1; for (const [i, n] of list) v *= n === 1 ? c[i] : Math.pow(Math.max(c[i], 0), n); return v; };

// 各反応の正反応・逆反応の速さ（mol/(L·s)）
function rates(cn, c){
  return cn.rx.map(r => ({vf: r.kf * powProd(c, r.ordF), vb: r.kb * powProd(c, r.ordB)}));
}
function deriv(cn, c, out){
  out.fill(0);
  for (const r of cn.rx){
    const v = r.kf * powProd(c, r.ordF) - r.kb * powProd(c, r.ordB);
    for (let i = 0; i < cn.n; i++) if (r.nu[i]) out[i] += r.nu[i] * v;
  }
  return out;
}

// ---- 時間発展：ドルマン・プリンスの方法（刻みを自動で変えるルンゲ・クッタ 5(4)） ----
const DP = {
  c: [0, 1/5, 3/10, 4/5, 8/9, 1, 1],
  a: [[], [1/5], [3/40, 9/40], [44/45, -56/15, 32/9], [19372/6561, -25360/2187, 64448/6561, -212/729],
    [9017/3168, -355/33, 46732/5247, 49/176, -5103/18656], [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84]],
  b: [35/384, 0, 500/1113, 125/192, -2187/6784, 11/84, 0],
  e: [71/57600, 0, -71/16695, 71/1920, -17253/339200, 22/525, -1/40]
};
// c（濃度の配列）を t から t + T まで進める。c は書きかえる。opt.h は前回の刻み（続けて呼ぶと速い）。
function integrate(cn, c, T, opt = {}){
  const n = cn.n, rtol = opt.rtol || 1e-7, atol = opt.atol || 1e-12;
  const k = Array.from({length: 7}, () => new Float64Array(n));
  const y = new Float64Array(n), y5 = new Float64Array(n);
  let t = 0, h = Math.min(opt.h || T / 20, T), steps = 0;
  if (!(T > 0)) return {h};
  while (t < T && steps < (opt.maxSteps || 100000)){
    if (t + h > T) h = T - t;
    deriv(cn, c, k[0]);
    for (let s = 1; s < 7; s++){
      for (let i = 0; i < n; i++){ let v = c[i]; for (let j = 0; j < s; j++) v += h * DP.a[s][j] * k[j][i]; y[i] = v; }
      deriv(cn, y, k[s]);
    }
    let err = 0;
    for (let i = 0; i < n; i++){
      let v5 = c[i], e = 0;
      for (let j = 0; j < 7; j++){ v5 += h * DP.b[j] * k[j][i]; e += h * DP.e[j] * k[j][i]; }
      y5[i] = v5;
      const sc = atol + rtol * Math.max(Math.abs(c[i]), Math.abs(v5));
      err = Math.max(err, Math.abs(e) / sc);
    }
    if (err <= 1 || h < 1e-12){
      t += h; steps++;
      for (let i = 0; i < n; i++) c[i] = Math.max(0, y5[i]);
    }
    h *= Math.min(5, Math.max(0.2, 0.9 * Math.pow(err || 1e-10, -0.2)));
  }
  return {h, steps};
}
// 0 から tEnd まで、dt ごとの濃度の表を作る（グラフ・テスト用）
function simulate(cn, c0, tEnd, dt){
  const c = Float64Array.from(c0), out = [{t: 0, c: Array.from(c)}];
  let h;
  for (let t = dt; t <= tEnd + 1e-9; t += dt){ h = integrate(cn, c, dt, {h}).h; out.push({t, c: Array.from(c)}); }
  return out;
}

// ---- 平衡 ----
// 1 つの反応について、反応の進み具合 ξ（mol/L）を二分法で求める。Q(ξ) = K となる ξ。
// c0 から反応が進める範囲（どの濃度も負にならない）で、ln Q は ξ とともに増える。
function bisect(f, lo, hi, iter = 200){
  let flo = f(lo);
  for (let i = 0; i < iter; i++){
    const mid = (lo + hi) / 2, fm = f(mid);
    if (mid === lo || mid === hi) break;
    if ((fm > 0) === (flo > 0)){ lo = mid; flo = fm; } else hi = mid;
  }
  return (lo + hi) / 2;
}
function lnQ(cn, c, ri = 0){
  const r = cn.rx[ri]; let s = 0;
  for (const [i, n] of r.prod) s += n * Math.log(c[i]);
  for (const [i, n] of r.reac) s -= n * Math.log(c[i]);
  return s;
}
function Q(cn, c, ri = 0){ return Math.exp(lnQ(cn, c, ri)); }
// 平衡の濃度（1 つの反応）。K を省くと kf/kb。
function equilibrium(cn, c0, K, ri = 0){
  const r = cn.rx[ri];
  if (K == null) K = r.kf / r.kb;
  let lo = -Infinity, hi = Infinity;
  for (let i = 0; i < cn.n; i++){
    if (r.nu[i] < 0) hi = Math.min(hi, c0[i] / -r.nu[i]);
    if (r.nu[i] > 0) lo = Math.max(lo, -c0[i] / r.nu[i]);
  }
  const at = x => Array.from(c0, (v, i) => Math.max(0, v + r.nu[i] * x));
  const lnK = Math.log(K);
  const xi = bisect(x => lnQ(cn, at(x), ri) - lnK, lo, hi);
  return at(xi);
}

// ---- 温度 ----
// アレニウスの式：基準の温度 Tref での値 kref から、活性化エネルギー Ea（kJ/mol）で T の値を出す
const arrhenius = (kref, EaKJ, T, Tref) => kref * Math.exp(-EaKJ * 1000 / R * (1 / T - 1 / Tref));
// ファントホッフの式：基準の温度での K から、ΔH（kJ/mol）で T の K を出す（ΔH = Ea₁ − Ea₂ とアレニウスの式から出る）
const vantHoff = (Kref, dHkJ, T, Tref) => Kref * Math.exp(-dHkJ * 1000 / R * (1 / T - 1 / Tref));
// エネルギーが E（kJ/mol）以上の衝突の割合 exp(−E/RT)
const fractionAbove = (EkJ, T) => Math.exp(-EkJ * 1000 / (R * T));

// ---- 反応のプリセットから、いまの条件の速度定数を作る ----
// pre = {species, react:[[key, n]], prod:[[key, n]], Tref, Kref, k1ref, Ea1, dH}（chem-data.js の REACTION_PRESETS）
// 触媒は正反応・逆反応の活性化エネルギーを同じだけ下げる（catEa kJ/mol）。だから K は変わらない。
// 速度定数 k₁・k₂ は教科書の決め方：v は基準の物質（pre.vRef。ふつうは最初の反応物）が減る速さ。
// 例：2H₂O₂ → 2H₂O + O₂ で v = −d[H₂O₂]/dt = k[H₂O₂]。ΔH・Ea も基準の物質 1 mol あたり（dHref）で考える。
// opt.reverse === false：逆反応を止める（速度の単元で、初めは逆反応を考えないとき）。不可逆の反応（Kref なし）は K = ∞。
function constants(pre, T, opt = {}){
  const lower = opt.catalyst ? (pre.catEa || 0) : 0;
  const nu = nuRef(pre), dHref = pre.dH / nu;
  const Ea1 = pre.Ea1 - lower, Ea2 = pre.Ea1 - dHref - lower;
  const K = pre.Kref == null ? Infinity : vantHoff(pre.Kref, pre.dH, T, pre.Tref);
  const k1 = arrhenius(pre.k1ref, pre.Ea1, T, pre.Tref) * Math.exp(lower * 1000 / (R * T));
  const k2 = isFinite(K) && opt.reverse !== false ? k1 / K : 0;
  return {T, Ea1, Ea2, dH: pre.dH, dHref, nu, K, k1, k2, catalyst: !!lower, reverse: k2 > 0, reversible: isFinite(K), dn: dnGas(pre)};
}
// 基準の物質の係数（v を「この物質が減る速さ」とするので、式の上の速さは v/係数）
function nuRef(pre){
  const key = pre.vRef || pre.react[0][0];
  const e = pre.react.find(([k]) => k === key) || pre.prod.find(([k]) => k === key);
  return e ? e[1] : 1;
}
function dnGas(pre){
  const st = k => (pre.species.find(s => s.key === k) || {}).st;
  const g = list => list.reduce((s, [k, n]) => s + (st(k) === '気' ? n : 0), 0);   // 気体の係数の和
  return g(pre.prod) - g(pre.react);
}
function network(pre, consts){
  return compile({species: pre.species.map(s => s.key),
    reactions: [{r: Object.fromEntries(pre.react), p: Object.fromEntries(pre.prod), order: pre.order || null,
      kf: consts.k1 / consts.nu, kb: consts.k2 / consts.nu, reversible: consts.reversible}]});
}
// 条件（温度・触媒・逆反応）を変えたとき、反応のかたちはそのままで速度定数だけを入れかえる
function setConstants(cn, consts){
  cn.rx[0].kf = consts.k1 / consts.nu; cn.rx[0].kb = consts.k2 / consts.nu;
}
// 圧平衡定数 Kp = Kc·(RT)^Δn（Pa、R = 8.314×10³ Pa·L/(K·mol)）
const Kp = (Kc, T, dn) => Kc * Math.pow(R_PA_L * T, dn);
const partialPressure = (c, T) => c * R_PA_L * T;   // Pa

// ---- 粒子の箱とのつなぎ（設計 2.2） ----
// 反応ごとに「正反応」「逆反応」の 2 つの道（channel）を作る。係数の数だけ粒子を並べる（H₂ + I₂ → 2HI なら [H₂, I₂] → [HI, HI]）。
// 次数の合計と粒子の数が同じなら、ぶつかって（または 1 つで）起こる反応。違えば（2H₂O₂ の一次反応など）、回数を決めて粒子を集める。
function channelsOf(cn){
  const expand = list => list.flatMap(([i, n]) => Array(n).fill(i));
  const kindOf = (parts, ord) => {
    const o = ord.reduce((s, [, n]) => s + n, 0);
    return o === parts.length && parts.length <= 2 ? (parts.length === 1 ? 'uni' : 'bi') : 'event';
  };
  return cn.rx.flatMap(r => {
    const f = expand(r.reac), b = expand(r.prod);
    return [{reac: f, prod: b, kind: kindOf(f, r.ordF)}, ...(r.reversible ? [{reac: b, prod: f, kind: kindOf(b, r.ordB)}] : [])];
  });
}
// 粒子の数から、各道のほしい反応の回数（回/粒子の箱の 1 秒）。
// sigma：1 mol/L あたりの粒子の数（いまの体積で）。scale：粒子の箱の 1 秒が模型の時間の何秒か。
function particleRates(cn, counts, sigma, scale = 1){
  const c = counts.map(n => n / sigma), out = [];
  for (const r of cn.rx){
    out.push(r.kf * powProd(c, r.ordF) * sigma * scale);
    if (r.reversible) out.push(r.kb * powProd(c, r.ordB) * sigma * scale);
  }
  return out;
}

// ---- 時系列から読む量 ----
// 値が target を初めて横切る時刻（線形補間）。series = [{t, v}]
function crossTime(series, target){
  for (let i = 1; i < series.length; i++){
    const a = series[i - 1], b = series[i];
    if ((a.v - target) * (b.v - target) <= 0 && a.v !== b.v) return a.t + (target - a.v) / (b.v - a.v) * (b.t - a.t);
  }
  return null;
}
// 平衡までの変化の frac（0.95 など）に達した時刻
function timeToFraction(series, vEq, frac = 0.95){
  if (!series.length) return null;
  const v0 = series[0].v;
  return crossTime(series, v0 + (vEq - v0) * frac);
}

// ---- 乱数（種を決められる。テストで同じ結果を再現する） ----
function rng(seed){
  let a = seed >>> 0 || 1;
  const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  let spare = null;
  next.normal = () => {   // 標準正規分布（ボックス・ミュラー法）
    if (spare !== null){ const s = spare; spare = null; return s; }
    let u = 0; while (u === 0) u = next();
    const v = next(), r = Math.sqrt(-2 * Math.log(u));
    spare = r * Math.sin(2 * Math.PI * v); return r * Math.cos(2 * Math.PI * v);
  };
  next.poisson = lam => {   // ポアソン分布（λ が小さいときの方法。粒子の反応の回数に使う）
    if (lam <= 0) return 0;
    if (lam > 30) return Math.max(0, Math.round(lam + Math.sqrt(lam) * next.normal()));
    const L = Math.exp(-lam); let k = 0, p = 1;
    do { k++; p *= next(); } while (p > L);
    return k - 1;
  };
  return next;
}

// ---- 数の書き方（有効数字） ----
function sig(v, n = 3){
  if (v == null || !isFinite(v)) return '—';
  if (v === 0) return '0';
  const e = Math.floor(Math.log10(Math.abs(v)));
  if (e >= -3 && e < 4) return v.toFixed(Math.max(0, n - 1 - e));
  const m = v / Math.pow(10, e);
  return m.toFixed(n - 1) + '×10' + supNum(e);
}
const SUP = {'-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹'};
const supNum = e => String(e).split('').map(ch => SUP[ch]).join('');

const api = {R, R_PA_L, compile, rates, deriv, integrate, simulate, equilibrium, lnQ, Q, bisect, arrhenius, vantHoff, fractionAbove,
  constants, nuRef, network, setConstants, dnGas, channelsOf, particleRates, Kp, partialPressure, crossTime, timeToFraction, rng, sig, supNum};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemSim = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
