// 中和滴定シミュレータの計算（DOM に触らない）。ブラウザでは window.ChemTitration。
// 設計は docs/titration-design.md。
//   ・厳密な計算：電荷のつり合いを [H⁺] について二分法で解く（強酸・弱酸・多段階・弱塩基を同じ式で扱う）
//   ・近似の計算：教科書の式（完全電離・電離平衡の √(Ka·C)・緩衝液の式・塩の加水分解・両性の塩）を場面ごとに当てはめる
//   2 つを並べて、近似がどこで合い、どこでずれるかを学べるようにする（作成者の指示 2026-10-28）。
(function (root) {
'use strict';
const S = (typeof module === 'object' && module.exports) ? require('./chem-sim.js') : root.ChemSim;
const KW = 1e-14;                       // 水のイオン積（25 ℃）
const fmt = (v, n = 3) => S.sig(v, n);
const EPS = 1e-9;

// ---- 試料（プリセット） ----
// kind: 'acid'（酸を強塩基で滴定）／'base'（塩基を強酸で滴定）。n: 段数（強酸・強塩基は 0）。
// pKa: H_nA が 1 段ずつ H⁺ を出すときの pKa₁…pKaₙ（アンモニアは NH₄⁺ の pKa = 9.25）。強い段は負の値（硫酸の第 1 段 −3）。
// forms[j]: H が j 個ついた形の化学式。z0: j = 0 の形の電荷（酸は −n、アンモニアは 0）。
// cM・cX: 1 単位あたりの陽イオン・陰イオンの数（Na₂CO₃ の Na⁺ は 2、HCl の Cl⁻ は 1）。ion: そのイオンの化学式。
// steps: 滴定曲線に出す当量点の数。rMax: 横軸の終わりを、最初の当量点の何倍にするか。
const SAMPLES = [
  {key: 'hcl', group: '強酸×強塩基', name: '塩酸 × 水酸化ナトリウム', kind: 'acid', formula: 'HCl', label: '塩酸 HCl', n: 0, pKa: [], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '強酸を強塩基で滴定。当量点は pH 7。'},
  {key: 'naoh', group: '強酸×強塩基', name: '水酸化ナトリウム × 塩酸', kind: 'base', formula: 'NaOH', label: '水酸化ナトリウム NaOH', n: 0, pKa: [], cX: 0, cM: 1, ionM: 'Na⁺',
    titrant: {name: 'HCl', ion: 'Cl⁻', type: 'acid'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '強塩基を強酸で滴定。曲線は右下がり。'},
  {key: 'hcl-dilute', group: '強酸×強塩基', name: 'とても薄い塩酸 × 水酸化ナトリウム', kind: 'acid', formula: 'HCl', label: '塩酸 HCl（1.0×10⁻⁴ mol/L）', n: 0, pKa: [], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.000100, V0: 10.0, Ct: 0.000100, steps: 1, rMax: 2, ind: 'bt',
    note: '濃度が薄いと、当量点のまわりの変化がゆるやか。水の電離（10⁻⁷ mol/L）を無視した近似がずれる。'},
  {key: 'ch3cooh', group: '弱酸・弱塩基', name: '酢酸 × 水酸化ナトリウム', kind: 'acid', formula: 'CH₃COOH', label: '酢酸 CH₃COOH', n: 1, pKa: [4.76], z0: -1, forms: ['CH₃COO⁻', 'CH₃COOH'], cX: 0, cM: 0,
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '弱酸を強塩基で滴定。半当量点で pH = pKa。当量点は塩基性。'},
  {key: 'nh3', group: '弱酸・弱塩基', name: 'アンモニア × 塩酸', kind: 'base', formula: 'NH₃', label: 'アンモニア NH₃', n: 1, pKa: [9.25], z0: 0, forms: ['NH₃', 'NH₄⁺'], cX: 0, cM: 0,
    titrant: {name: 'HCl', ion: 'Cl⁻', type: 'acid'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'mo',
    note: '弱塩基を強酸で滴定。NH₄⁺ の pKa は 9.25（pKb 4.75）。当量点は酸性。'},
  {key: 'na2co3', group: '多段階', name: '炭酸ナトリウム × 塩酸', kind: 'base', formula: 'Na₂CO₃', label: '炭酸ナトリウム Na₂CO₃', n: 2, pKa: [6.35, 10.33], z0: -2, forms: ['CO₃²⁻', 'HCO₃⁻', 'H₂CO₃'], cX: 0, cM: 2, ionM: 'Na⁺',
    titrant: {name: 'HCl', ion: 'Cl⁻', type: 'acid'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '2 段階。第 1 当量点は NaHCO₃（フェノールフタレイン）、第 2 当量点は H₂CO₃（メチルオレンジ）。'},
  {key: 'h2so4', group: '多段階', name: '硫酸 × 水酸化ナトリウム', kind: 'acid', formula: 'H₂SO₄', label: '硫酸 H₂SO₄', n: 2, pKa: [-3, 1.99], z0: -2, forms: ['SO₄²⁻', 'HSO₄⁻', 'H₂SO₄'], cX: 0, cM: 0,
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '第 1 段は完全電離、第 2 段（HSO₄⁻）は弱い酸（pKa 1.99）。'},
  {key: 'oxalic', group: '多段階', name: 'シュウ酸 × 水酸化ナトリウム', kind: 'acid', formula: '(COOH)₂', label: 'シュウ酸 (COOH)₂', n: 2, pKa: [1.27, 4.27], z0: -2, forms: ['C₂O₄²⁻', 'HC₂O₄⁻', 'H₂C₂O₄'], cX: 0, cM: 0,
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '2 価の弱酸。2 つの pKa の差が 3 しかなく、第 1 当量点がゆるやか。'},
  {key: 'h3po4', group: '多段階', name: 'リン酸 × 水酸化ナトリウム', kind: 'acid', formula: 'H₃PO₄', label: 'リン酸 H₃PO₄', n: 3, pKa: [2.15, 7.20, 12.35], z0: -3, forms: ['PO₄³⁻', 'HPO₄²⁻', 'H₂PO₄⁻', 'H₃PO₄'], cX: 0, cM: 0,
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '3 価の酸。高校では第 2 当量点まで。第 3 段（pKa 12.35）は水の電離と区別しにくい。'},
  {key: 'h2s', group: '多段階', name: '硫化水素 × 水酸化ナトリウム', kind: 'acid', formula: 'H₂S', label: '硫化水素 H₂S', n: 2, pKa: [7.0, 13.9], z0: -2, forms: ['S²⁻', 'HS⁻', 'H₂S'], cX: 0, cM: 0,
    titrant: {name: 'NaOH', ion: 'Na⁺', type: 'base'}, C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: 'とても弱い 2 価の酸（pKa 7.0・13.9）。'}
];
const sampleByKey = key => SAMPLES.find(s => s.key === key) || null;

// ---- 指示薬 ----
// lo–hi：変色域。acid・base：酸性側・塩基性側の色。無色は液の色（WATER）に溶け込む。
const WATER = '#cfe6f5';
const INDICATORS = [
  {key: 'none', name: '指示薬なし'},
  {key: 'mo', name: 'メチルオレンジ', lo: 3.1, hi: 4.4, acid: '#e63a2e', base: '#f2c200', accidName: '赤', baseName: '黄'},
  {key: 'mr', name: 'メチルレッド', lo: 4.2, hi: 6.2, acid: '#d9262c', base: '#f4d03f', accidName: '赤', baseName: '黄'},
  {key: 'bt', name: 'BTB（ブロモチモールブルー）', lo: 6.0, hi: 7.6, acid: '#f2d21b', base: '#2b6fd6', accidName: '黄', baseName: '青'},
  {key: 'pp', name: 'フェノールフタレイン', lo: 8.0, hi: 9.8, acid: WATER, base: '#e0338a', accidName: '無色', baseName: '赤'}
];
const indicatorByKey = key => INDICATORS.find(i => i.key === key) || INDICATORS[0];
const hex = c => [1, 3, 5].map(i => parseInt(c.slice(i, i + 2), 16));
// pH のときの色。変色域の中央を境に、ロジスティック曲線で 2 つの色を混ぜる（域の両端で約 10 %・90 %）。
function indicatorFrac(ind, pH){
  if (!ind || ind.lo == null) return 0;
  const mid = (ind.lo + ind.hi) / 2, k = 1.9 / (ind.hi - ind.lo);
  return 1 / (1 + Math.pow(10, (mid - pH) * k));     // 塩基性色の割合
}
function indicatorColor(ind, pH){
  if (!ind || ind.lo == null) return WATER;
  const p = indicatorFrac(ind, pH), a = hex(ind.acid), b = hex(ind.base);
  return '#' + a.map((v, i) => Math.round(v + (b[i] - v) * p).toString(16).padStart(2, '0')).join('');
}

// ---- 系（試料＋条件）を作る ----
// over = {C0, V0, Ct, pKa:[...]}（画面で変えた値）。
function makeSys(sample, over = {}){
  const s = Object.assign({}, sample, over);
  const pKa = (over.pKa && over.pKa.length === sample.n) ? over.pKa.slice() : sample.pKa.slice();
  const sys = {key: sample.key, name: sample.label, formula: sample.formula, kind: sample.kind, n: sample.n, pKa, z0: sample.z0 || 0, forms: sample.forms || [],
    cM: sample.cM || 0, cX: sample.cX || 0, ionM: sample.ionM || 'M⁺', ionX: sample.ionX || 'X⁻', titrant: sample.titrant,
    C0: s.C0, V0: s.V0, Ct: s.Ct, steps: sample.steps, rMax: sample.rMax, ind: sample.ind, note: sample.note};
  sys.N0 = sys.C0 * sys.V0;                                           // mmol
  sys.Veq = Array.from({length: sys.steps}, (_, i) => (i + 1) * sys.N0 / sys.Ct);   // mL
  sys.Vmax = sys.Veq[0] * sys.rMax;
  return sys;
}

// ---- 厳密な計算 ----
// H が j 個ついた形の割合 α_j（j = 0…n）。桁あふれを避けるため対数で計算する。
function fractions(pKa, pH){
  const n = pKa.length, lg = [];
  let cum = 0;
  for (let m = 0; m <= n; m++){ if (m > 0) cum += pKa[m - 1]; lg.push(-cum - (n - m) * pH); }
  const mx = Math.max(...lg), w = lg.map(x => Math.pow(10, x - mx)), sum = w.reduce((a, b) => a + b, 0);
  const alpha = new Array(n + 1);
  for (let m = 0; m <= n; m++) alpha[n - m] = w[m] / sum;       // m 個はずれた形は、H が n − m 個
  return alpha;
}
// 滴下量 V（mL）のときの溶液を、電荷のつり合いから解く。
function solveExact(sys, V){
  const Vt = sys.V0 + V, N0 = sys.N0, Nt = sys.Ct * V, base = sys.titrant.type === 'base';
  const Cfam = sys.n > 0 ? N0 / Vt : 0;
  const cM = (sys.cM * N0 + (base ? Nt : 0)) / Vt, cX = (sys.cX * N0 + (base ? 0 : Nt)) / Vt;
  const balance = pH => {
    const h = Math.pow(10, -pH);
    let q = h + cM - KW / h - cX;
    if (sys.n > 0){ const a = fractions(sys.pKa, pH); let mean = 0; for (let j = 0; j <= sys.n; j++) mean += j * a[j]; q += Cfam * (sys.z0 + mean); }
    return q;
  };
  const pH = S.bisect(balance, -2, 16);
  const h = Math.pow(10, -pH), alpha = sys.n > 0 ? fractions(sys.pKa, pH) : [];
  const species = [{name: 'H⁺', conc: h, z: 1}];
  if (cM > 0) species.push({name: sys.titrant.type === 'base' ? sys.titrant.ion : sys.ionM, conc: cM, z: 1});
  for (let j = 0; j <= sys.n && sys.n > 0; j++) species.push({name: sys.forms[j], conc: Cfam * alpha[j], z: sys.z0 + j, family: true});
  species.push({name: 'OH⁻', conc: KW / h, z: -1});
  if (cX > 0) species.push({name: sys.titrant.type === 'acid' ? sys.titrant.ion : sys.ionX, conc: cX, z: -1});
  let pos = 0, neg = 0;
  for (const sp of species){ if (sp.z > 0) pos += sp.z * sp.conc; else neg += -sp.z * sp.conc; }
  return {pH, h, oh: KW / h, Vt, species, alpha, pos, neg, residual: (pos - neg) / Math.max(pos, neg, 1e-300)};
}

// ---- 近似の計算（教科書の式） ----
// 戻り値：{pH, label, lines:[文], formula:'使った式', role}
// r = 滴下した H⁺（OH⁻）の物質量 ÷ 試料の物質量。整数なら当量点（または出発点）。
function approx(sys, V){
  const N0 = sys.N0, Vt = sys.V0 + V, Nt = sys.Ct * V, n = sys.n, acid = sys.kind === 'acid';
  const r = N0 > 0 ? Nt / N0 : 0;
  const L = [], aName = sys.name, tName = sys.titrant.name;
  const H = acid ? 'H⁺' : 'OH⁻', T = acid ? 'OH⁻' : 'H⁺';
  const pHfrom = (c, ion) => ion === 'H⁺' ? -Math.log10(c) : 14 + Math.log10(c);   // c は H⁺ または OH⁻ の濃度
  const done = (pH, label, role) => ({pH, label, lines: L, role});
  const vol = `全体積 ${fmt(Vt, 4)} mL`;
  const left = (x, unit) => `${fmt(x)} ${unit || 'mmol'}`;

  // 強酸×強塩基（段なし）
  if (n === 0){
    if (Math.abs(r - 1) < EPS){
      L.push('酸と塩基が過不足なく反応（当量点）。水溶液は塩だけ。', '[H⁺] = [OH⁻] = 1.0×10⁻⁷ mol/L', 'pH = 7');
      return done(7, '当量点（中和）', 'eq');
    }
    if (r < 1){
      const rest = N0 - Nt, c = rest / Vt;
      if (V === 0) L.push(`${aName}は完全電離。[${H}] = ${fmt(sys.C0)} mol/L`);
      else L.push(`${aName}は完全電離。反応後に残った ${H} = ${left(N0)} − ${left(Nt)} = ${left(rest)}`, `[${H}] = ${left(rest)} ÷ ${vol} = ${fmt(c)} mol/L`);
      const pH = pHfrom(c, H);
      L.push(acid ? `pH = −log[H⁺] = ${pH.toFixed(2)}` : `pOH = −log[OH⁻] = ${(14 - pH).toFixed(2)}、pH = 14 − pOH = ${pH.toFixed(2)}`);
      return done(pH, V === 0 ? '滴下前（完全電離）' : '当量点の前（' + H + ' が余っている）', 'strong');
    }
    const rest = Nt - N0, c = rest / Vt;
    L.push(`中和したあと、余った ${T} = ${left(Nt)} − ${left(N0)} = ${left(rest)}`, `[${T}] = ${left(rest)} ÷ ${vol} = ${fmt(c)} mol/L`);
    const pH = pHfrom(c, T);
    L.push(acid ? `pOH = −log[OH⁻] = ${(14 - pH).toFixed(2)}、pH = 14 − pOH = ${pH.toFixed(2)}` : `pH = −log[H⁺] = ${pH.toFixed(2)}`);
    return done(pH, '当量点の後（' + T + ' が余っている）', 'strong');
  }

  // 弱酸・弱塩基・多段階
  const pK = h => sys.pKa[n - h];                 // H が h 個の形が H⁺ を 1 つ出す段の pKa（h = 1…n）
  const KaOf = h => Math.pow(10, -pK(h));
  const name = j => sys.forms[j];
  const k0 = Math.floor(r + EPS), f0 = r - k0;
  let k = k0, f = f0;
  if (f > 1 - EPS){ k += 1; f = 0; }
  if (f < EPS) f = 0;
  L.push(`物質量：${aName} ${left(N0)}、${tName} ${left(Nt)}（比 ${fmt(r, 3)}）、${vol}`);

  if (r > n + EPS){
    const rest = Nt - n * N0, c = rest / Vt;
    L.push(`${aName}をすべて中和したあと、余った ${T} = ${left(Nt)} − ${left(n * N0)} = ${left(rest)}`, `[${T}] = ${fmt(c)} mol/L（塩の加水分解は小さいので無視）`);
    const pH = pHfrom(c, T);
    L.push(`pH = ${pH.toFixed(2)}`);
    return done(pH, '当量点の後（' + T + ' が余っている）', 'strong');
  }
  const jMain = acid ? n - k : k;                  // いまいちばん多い形の H の数
  const sol = (pH, label, role) => { L.push(`pH = ${pH.toFixed(2)}`); return done(pH, label, role); };
  if (f === 0){
    const j = jMain;
    const C = N0 / Vt;
    const eqText = k === 0 ? '滴下前' : (k === n ? `第 ${k} 当量点（完全に中和）` : `第 ${k} 当量点`);
    if (j === n || (j >= 1 && j < n && pK(j + 1) < 0)){        // 弱酸として電離する形
      const pk = pK(j), Ka = KaOf(j);
      if (pk < 0){
        L.push(`${name(j)}は強酸で、完全電離。[H⁺] = ${fmt(C)} mol/L`);
        return sol(-Math.log10(C), eqText + '（強酸）', 'strong');
      }
      L.push(`${name(j)}の電離平衡：Ka = [H⁺]² ÷ (C − [H⁺])　（Ka = ${fmt(Ka)}、C = ${left(N0)} ÷ ${vol} = ${fmt(C)} mol/L）`,
        `電離しているのはごく一部（C − [H⁺] ≒ C）とみなして、[H⁺] = √(Ka × C) = ${fmt(Math.sqrt(Ka * C))} mol/L`);
      return sol(-0.5 * Math.log10(Ka * C), eqText + '（弱酸の電離平衡）', 'weak');
    }
    if (j === 0){                                           // 弱塩基として働く形（塩の加水分解）
      const pk = pK(1), Kh = KW / KaOf(1);
      L.push((k === 0 ? `${name(0)}は水と反応して OH⁻ を出す（電離平衡）：Kb = Kw ÷ Ka = ${fmt(Kh)}` : `${name(0)}が水と反応する（加水分解）：Kh = Kw ÷ Ka = ${fmt(Kh)}`) + `、C = ${left(N0)} ÷ ${vol} = ${fmt(C)} mol/L`,
        `[OH⁻] = √(Kh × C) = ${fmt(Math.sqrt(Kh * C))} mol/L`);
      const oh = Math.sqrt(Kh * C);
      L.push(`pOH = ${(-Math.log10(oh)).toFixed(2)}、pH = 14 − pOH`);
      return sol(14 + Math.log10(oh), eqText + (k === 0 ? '（弱塩基の電離）' : '（塩の加水分解）'), 'hydrolysis');
    }
    L.push(`${name(j)}は酸としても塩基としても働く。[H⁺] = √(Ka₁ × Ka₂) より、pH = (pKa + pKa′) ÷ 2 = (${pK(j)} + ${pK(j + 1)}) ÷ 2`);
    return sol((pK(j) + pK(j + 1)) / 2, eqText + '（両性の塩）', 'amphoteric');
  }
  // 緩衝液の領域：形 jMain が減り、形 jMain ∓ 1 が増える
  const jHi = acid ? jMain : jMain + 1, jLo = jHi - 1;      // 酸の形 jHi と、その共役塩基 jLo
  const pk = pK(jHi);
  const nAcid = acid ? N0 * (1 - f) : N0 * f, nBase = acid ? N0 * f : N0 * (1 - f);
  if (pk < 0){
    const rest = N0 * (1 - f);
    L.push(`${name(jHi)}は強酸で、完全電離。残った ${name(jHi)} = ${left(N0)} − ${left(Nt - k * N0)} = ${left(rest)}`, `[H⁺] = ${left(rest)} ÷ ${vol} = ${fmt(rest / Vt)} mol/L`);
    return sol(-Math.log10(rest / Vt), `第 ${k + 1} 段（強酸の中和）`, 'strong');
  }
  L.push(`${name(jHi)}（酸）と ${name(jLo)}（その塩）が混ざった緩衝液：${name(jHi)} = ${left(nAcid)}、${name(jLo)} = ${left(nBase)}`,
    `pH = pKa + log₁₀([${name(jLo)}] ÷ [${name(jHi)}]) = ${pk} + log₁₀(${fmt(nBase)} ÷ ${fmt(nAcid)})`);
  const pH = pk + Math.log10(nBase / nAcid);
  const half = Math.abs(f - 0.5) < 1e-6;
  if (half) L.push('半当量点：[酸] = [塩] なので log₁₀ の項が 0 になり、pH = pKa');
  return sol(pH, half ? '半当量点（pH = pKa）' : '緩衝液（' + (k === 0 ? '第 1 段' : `第 ${k + 1} 段`) + '）', 'buffer');
}

// 近似の良さ：差（pH）で 3 段階
function quality(diff){
  const d = Math.abs(diff);
  return d < 0.05 ? {level: 'good', text: 'ほぼ一致'} : d < 0.3 ? {level: 'fair', text: 'おおよそ合う'} : {level: 'bad', text: '近似がずれる'};
}

// ---- 厳密な計算の説明（画面に出す文） ----
function exactLines(sys, V){
  const ex = solveExact(sys, V), L = [];
  const sgn = sp => (sp.z > 0 ? '＋' : '−').replace('＋', '+');
  L.push('水溶液は電気的に中性：正の電荷の合計 = 負の電荷の合計');
  const side = z => ex.species.filter(sp => (sp.z > 0) === z && sp.conc > 1e-15 && !(sp.family && sp.conc < 1e-12 * Math.max(...ex.species.map(q => q.conc))))
    .map(sp => (Math.abs(sp.z) > 1 ? Math.abs(sp.z) + '×' : '') + '[' + sp.name + ']').join(' + ');
  L.push(side(true) + ' = ' + side(false));
  L.push('［ ］の中身は [H⁺]（pH）で決まるので、両辺が等しくなる [H⁺] を計算機で探す（二分法）。');
  L.push('見つかった pH = ' + ex.pH.toFixed(3));
  return {pH: ex.pH, ex, lines: L};
}

// ---- 曲線 ----
function volumeGrid(sys, xmax, N = 400){
  const set = new Set();
  for (let i = 0; i <= N; i++) set.add(Math.round(xmax * i / N * 1e6) / 1e6);
  for (const ve of sys.Veq.concat(sys.Veq.map(v => v / 2))){
    for (const d of [0.001, 0.003, 0.01, 0.03, 0.1, 0.3, 0.6]){ for (const s of [-1, 1]){ const v = ve + s * d; if (v > 0 && v < xmax) set.add(Math.round(v * 1e6) / 1e6); } }
    if (ve <= xmax) set.add(ve);
  }
  for (const ve of sys.Veq){ for (const k of [0.001, 0.003]) { const v = ve * (1 - k); if (v > 0 && v < xmax) set.add(Math.round(v * 1e6) / 1e6); } }
  return Array.from(set).sort((a, b) => a - b);
}
function curve(sys, xmax, N = 400){
  const grid = volumeGrid(sys, xmax, N);
  return {
    exact: grid.map(v => [v, solveExact(sys, v).pH]),
    approx: grid.map(v => [v, Math.max(-1, Math.min(15, approx(sys, v).pH))])
  };
}

// ---- 代表点（近似と厳密を見比べる表） ----
function keyPoints(sys, xmax){
  const pts = [], add = (r, label) => { const V = r * sys.N0 / sys.Ct; if (V <= xmax + 1e-9) pts.push({r, V, label}); };
  for (let k = 0; k < sys.steps; k++){
    add(k, k === 0 ? '滴下前' : `第 ${k} 当量点`);
    if (sys.n > 0 || k === 0){ if (k === 0 || sys.n > 0) add(k + 0.5, sys.n > 0 ? '半当量点' + (sys.steps > 1 ? `（第 ${k + 1} 段）` : '') : '当量点の 50 %'); }
    add(k + 0.9, '当量点の 90 %'); add(k + 0.99, '当量点の 99 %'); add(k + 0.999, '当量点の 99.9 %');
  }
  add(sys.steps, sys.steps > 1 ? `第 ${sys.steps} 当量点` : '当量点');
  add(sys.steps + 0.001, '当量点の少し後（+0.1 %）'); add(sys.steps + 0.5, '当量点の後（+50 %）');
  return pts.map(p => { const a = approx(sys, p.V), e = solveExact(sys, p.V); return Object.assign(p, {approx: a.pH, exact: e.pH, diff: a.pH - e.pH, q: quality(a.pH - e.pH), scene: a.label}); });
}

const api = {KW, SAMPLES, sampleByKey, INDICATORS, indicatorByKey, indicatorColor, indicatorFrac, WATER, makeSys, fractions, solveExact, approx, quality, exactLines, curve, volumeGrid, keyPoints};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemTitration = api;
})(typeof window !== 'undefined' ? window : globalThis);
