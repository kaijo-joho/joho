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
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '強酸を強塩基で滴定。当量点は pH 7。'},
  {key: 'naoh', group: '強酸×強塩基', name: '水酸化ナトリウム × 塩酸', kind: 'base', formula: 'NaOH', label: '水酸化ナトリウム NaOH', n: 0, pKa: [], cX: 0, cM: 1, ionM: 'Na⁺',
    titrant: 'hcl', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '強塩基を強酸で滴定。曲線は右下がり。'},
  {key: 'hcl-dilute', group: '強酸×強塩基', name: 'とても薄い塩酸 × 水酸化ナトリウム', kind: 'acid', formula: 'HCl', label: '塩酸 HCl（1.0×10⁻⁴ mol/L）', n: 0, pKa: [], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.000100, V0: 10.0, Ct: 0.000100, steps: 1, rMax: 2, ind: 'bt',
    note: '濃度が薄いと、当量点のまわりの変化がゆるやか。水の電離（10⁻⁷ mol/L）を無視した近似がずれる。'},
  {key: 'ch3cooh', group: '弱酸・弱塩基', name: '酢酸 × 水酸化ナトリウム', kind: 'acid', formula: 'CH₃COOH', label: '酢酸 CH₃COOH', n: 1, pKa: [4.76], z0: -1, forms: ['CH₃COO⁻', 'CH₃COOH'], cX: 0, cM: 0,
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: '弱酸を強塩基で滴定。半当量点で pH = pKa。当量点は塩基性。'},
  {key: 'nh3', group: '弱酸・弱塩基', name: 'アンモニア × 塩酸', kind: 'base', formula: 'NH₃', label: 'アンモニア NH₃', n: 1, pKa: [9.25], z0: 0, forms: ['NH₃', 'NH₄⁺'], cX: 0, cM: 0,
    titrant: 'hcl', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'mo',
    note: '弱塩基を強酸で滴定。NH₄⁺ の pKa は 9.25（pKb 4.75）。当量点は酸性。'},
  {key: 'vinegar', group: '実験', name: '食酢の滴定（濃度が未知）', kind: 'acid', formula: 'CH₃COOH', label: '食酢（10 倍にうすめた液）', n: 1, pKa: [4.76], z0: -1, forms: ['CH₃COO⁻', 'CH₃COOH'], cX: 0, cM: 0, unknown: true,
    titrant: 'naoh', C0: 0.0700, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: 'うすめた食酢 10.0 mL を NaOH で滴定して、酢酸の濃度を求める。濃度は、出題ごとにちがう。'},
  {key: 'gly', group: 'アミノ酸', name: 'グリシン（塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'Gly', label: 'グリシン塩酸塩', n: 2, pKa: [2.34, 9.60], z0: -1, forms: ['H₂NCH₂COO⁻', 'H₃N⁺CH₂COO⁻', 'H₃N⁺CH₂COOH'], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp', pIform: true,
    note: '陽イオン → 双性イオン → 陰イオン。第 1 当量点の pH が等電点（pKa₁ と pKa₂ の平均）。'},
  {key: 'ala', group: 'アミノ酸', name: 'アラニン（塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'Ala', label: 'アラニン塩酸塩', n: 2, pKa: [2.34, 9.69], z0: -1, forms: ['Ala⁻', 'Ala±（双性イオン）', 'Ala⁺'], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: 'グリシンに近い 2 段階の滴定。'},
  {key: 'asp', group: 'アミノ酸', name: 'アスパラギン酸（塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'Asp', label: 'アスパラギン酸塩酸塩', n: 3, pKa: [1.88, 3.65, 9.60], z0: -2, forms: ['Asp²⁻', 'Asp⁻', 'Asp±（電荷 0）', 'Asp⁺'], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 8.0, Ct: 0.100, steps: 3, rMax: 3.5, ind: 'pp',
    note: '酸性アミノ酸。側鎖のカルボキシ基があるので 3 段階。等電点は pKa₁ と pKa₂ の平均。'},
  {key: 'glu', group: 'アミノ酸', name: 'グルタミン酸（塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'Glu', label: 'グルタミン酸塩酸塩', n: 3, pKa: [2.19, 4.25, 9.67], z0: -2, forms: ['Glu²⁻', 'Glu⁻', 'Glu±（電荷 0）', 'Glu⁺'], cX: 1, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 8.0, Ct: 0.100, steps: 3, rMax: 3.5, ind: 'pp',
    note: '酸性アミノ酸。3 段階。第 2 当量点のあたり（電荷 0 の形が最も多い）が等電点。'},
  {key: 'lys', group: 'アミノ酸', name: 'リシン（2 塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'Lys', label: 'リシン塩酸塩', n: 3, pKa: [2.18, 8.95, 10.53], z0: -1, forms: ['Lys⁻', 'Lys±（電荷 0）', 'Lys⁺', 'Lys²⁺'], cX: 2, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 8.0, Ct: 0.100, steps: 3, rMax: 3.5, ind: 'pp',
    note: '塩基性アミノ酸。側鎖のアミノ基があるので 3 段階（2 つの Cl⁻ つき）。等電点は pKa₂ と pKa₃ の平均で塩基性。'},
  {key: 'his', group: 'アミノ酸', name: 'ヒスチジン（2 塩酸塩）× 水酸化ナトリウム', kind: 'acid', formula: 'His', label: 'ヒスチジン塩酸塩', n: 3, pKa: [1.82, 6.00, 9.17], z0: -1, forms: ['His⁻', 'His±（電荷 0）', 'His⁺', 'His²⁺'], cX: 2, cM: 0, ionX: 'Cl⁻',
    titrant: 'naoh', C0: 0.100, V0: 8.0, Ct: 0.100, steps: 3, rMax: 3.5, ind: 'pp',
    note: '塩基性アミノ酸。イミダゾール環が pKa 6.0 で働く。等電点は pKa₂ と pKa₃ の平均。'},
  {key: 'na2co3', group: '多段階', name: '炭酸ナトリウム × 塩酸', kind: 'base', formula: 'Na₂CO₃', label: '炭酸ナトリウム Na₂CO₃', n: 2, pKa: [6.35, 10.33], z0: -2, forms: ['CO₃²⁻', 'HCO₃⁻', 'H₂CO₃'], cX: 0, cM: 2, ionM: 'Na⁺',
    titrant: 'hcl', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '2 段階。第 1 当量点は NaHCO₃（フェノールフタレイン）、第 2 当量点は H₂CO₃（メチルオレンジ）。'},
  {key: 'h2so4', group: '多段階', name: '硫酸 × 水酸化ナトリウム', kind: 'acid', formula: 'H₂SO₄', label: '硫酸 H₂SO₄', n: 2, pKa: [-3, 1.99], z0: -2, forms: ['SO₄²⁻', 'HSO₄⁻', 'H₂SO₄'], cX: 0, cM: 0,
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '第 1 段は完全電離、第 2 段（HSO₄⁻）は弱い酸（pKa 1.99）。'},
  {key: 'oxalic', group: '多段階', name: 'シュウ酸 × 水酸化ナトリウム', kind: 'acid', formula: '(COOH)₂', label: 'シュウ酸 (COOH)₂', n: 2, pKa: [1.27, 4.27], z0: -2, forms: ['C₂O₄²⁻', 'HC₂O₄⁻', 'H₂C₂O₄'], cX: 0, cM: 0,
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '2 価の弱酸。2 つの pKa の差が 3 しかなく、第 1 当量点がゆるやか。'},
  {key: 'h3po4', group: '多段階', name: 'リン酸 × 水酸化ナトリウム', kind: 'acid', formula: 'H₃PO₄', label: 'リン酸 H₃PO₄', n: 3, pKa: [2.15, 7.20, 12.35], z0: -3, forms: ['PO₄³⁻', 'HPO₄²⁻', 'H₂PO₄⁻', 'H₃PO₄'], cX: 0, cM: 0,
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 2, rMax: 2.5, ind: 'pp',
    note: '3 価の酸。高校では第 2 当量点まで。第 3 段（pKa 12.35）は水の電離と区別しにくい。'},
  {key: 'h2s', group: '多段階', name: '硫化水素 × 水酸化ナトリウム', kind: 'acid', formula: 'H₂S', label: '硫化水素 H₂S', n: 2, pKa: [7.0, 13.9], z0: -2, forms: ['S²⁻', 'HS⁻', 'H₂S'], cX: 0, cM: 0,
    titrant: 'naoh', C0: 0.100, V0: 10.0, Ct: 0.100, steps: 1, rMax: 2, ind: 'pp',
    note: 'とても弱い 2 価の酸（pKa 7.0・13.9）。'}
];


SAMPLES.push(customSample({kind: 'acid', n: 1}));
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

// ---- 滴下液（ビュレットの液）。強塩基・強酸のほか、弱塩基・弱酸・多価のものも選べる ----
// type：'base'（試料の酸を中和）／'acid'（試料の塩基を中和）。strong：完全電離（教科書の近似式が使える）。
// m：1 mol あたり中和できる H⁺（OH⁻）の数（Ba(OH)₂ は 2）。弱いものは n・pKa・z0・forms（試料と同じ書き方）をもつ。
// ionM・ionX：滴下液が持ち込む陽イオン・陰イオン（z：電荷、per：1 単位あたりの個数）。
const TITRANTS = [
  {key: 'naoh', name: 'NaOH', label: '水酸化ナトリウム NaOH', type: 'base', strong: true, m: 1, n: 0, pKa: [], z0: 0, forms: [], ionM: {name: 'Na⁺', z: 1, per: 1}, C: 0.100},
  {key: 'baoh2', name: 'Ba(OH)₂', label: '水酸化バリウム Ba(OH)₂（2 価の強塩基）', type: 'base', strong: true, m: 2, n: 0, pKa: [], z0: 0, forms: [], ionM: {name: 'Ba²⁺', z: 2, per: 1}, C: 0.0500},
  {key: 'nh3t', name: 'NH₃', label: 'アンモニア水 NH₃（弱塩基）', type: 'base', strong: false, m: 1, n: 1, pKa: [9.25], z0: 0, forms: ['NH₃', 'NH₄⁺'], C: 0.100},
  {key: 'na2co3t', name: 'Na₂CO₃', label: '炭酸ナトリウム Na₂CO₃（2 価の弱塩基）', type: 'base', strong: false, m: 2, n: 2, pKa: [6.35, 10.33], z0: -2, forms: ['CO₃²⁻', 'HCO₃⁻', 'H₂CO₃'], ionM: {name: 'Na⁺', z: 1, per: 2}, C: 0.100},
  {key: 'hcl', name: 'HCl', label: '塩酸 HCl', type: 'acid', strong: true, m: 1, n: 0, pKa: [], z0: 0, forms: [], ionX: {name: 'Cl⁻', z: 1, per: 1}, C: 0.100},
  {key: 'acoht', name: 'CH₃COOH', label: '酢酸 CH₃COOH（弱酸）', type: 'acid', strong: false, m: 1, n: 1, pKa: [4.76], z0: -1, forms: ['CH₃COO⁻', 'CH₃COOH'], C: 0.100}
];
// 自作の滴下液：弱い酸（type 'acid'）か弱い塩基（'base'）、価数 n（1〜3）。pKa は画面で決める
function customTitrant(type, n){
  const sm = customSample({kind: type === 'acid' ? 'acid' : 'base', n}), re = type === 'acid' ? [/A/g, 'X'] : [/B/g, 'Y'];
  return {key: 'custom', name: type === 'acid' ? '自作の酸 ' + sm.formula.replace(...re) : '自作の塩基 Y', label: type === 'acid' ? '自作の酸（弱酸）' : '自作の塩基（弱塩基）', type, strong: false, m: sm.n, n: sm.n,
    pKa: sm.pKa.slice(), z0: sm.z0, forms: sm.forms.map(f => f.replace(...re)), C: 0.100};
}
const titrantByKey = (key, customN = 1, customType = 'base') => key === 'custom' ? customTitrant(customType, customN) : (TITRANTS.find(t => t.key === key) || null);
const titrantsFor = kind => TITRANTS.filter(t => t.type === (kind === 'acid' ? 'base' : 'acid'));      // 酸を中和するのは塩基、塩基を中和するのは酸

// ---- 系（試料＋滴下液＋条件）を作る ----
// over = {C0, V0, Ct, pKa:[...], tpKa:[...]}（画面で変えた値）。titrant を省くと、試料の標準の滴下液。
function makeSys(sample, over = {}, titrant = null){
  const T0 = titrant || titrantByKey(sample.titrant);
  const s = Object.assign({}, sample, over);
  const pKa = (over.pKa && over.pKa.length === sample.n) ? over.pKa.slice() : sample.pKa.slice();
  const tpKa = (over.tpKa && over.tpKa.length === T0.n) ? over.tpKa.slice() : (T0.pKa || []).slice();
  const Ct = over.Ct != null ? over.Ct : (T0.key === sample.titrant ? sample.Ct : T0.C);
  const sys = {key: sample.key, name: sample.label, formula: sample.formula, kind: sample.kind, n: sample.n, pKa, z0: sample.z0 || 0, forms: sample.forms || [],
    cM: sample.cM || 0, cX: sample.cX || 0, ionM: sample.ionM || 'M⁺', ionX: sample.ionX || 'X⁻',
    titrant: {key: T0.key, name: T0.name, label: T0.label, type: T0.type, strong: T0.strong, m: T0.m, n: T0.n || 0, pKa: tpKa, z0: T0.z0 || 0, forms: T0.forms || [], ionM: T0.ionM || null, ionX: T0.ionX || null},
    tm: T0.m, approxOK: !!T0.strong,
    unknown: !!sample.unknown, C0: s.C0, V0: s.V0, Ct, steps: sample.steps, rMax: sample.rMax, ind: sample.ind, note: sample.note};
  // 等電点：電荷が 0 の形が H を j 個もつとき（j = −z0）、その形が出入りする 2 つの pKa の平均（2 つ以上の形をもつ酸で、電荷 0 の形が両端でないとき）
  { const j0 = -sys.z0; sys.pI = (sys.kind === 'acid' && sys.n >= 2 && j0 >= 1 && j0 <= sys.n - 1 && sys.z0 !== -sys.n) ? (sys.pKa[sys.n - j0] + sys.pKa[sys.n - j0 - 1]) / 2 : null; }
  sys.N0 = sys.C0 * sys.V0;                                           // mmol
  sys.dVeq = sys.N0 / (sys.Ct * sys.tm);                              // 1 当量の滴下量（mL）
  sys.Veq = Array.from({length: sys.steps}, (_, i) => (i + 1) * sys.dVeq);   // mL
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
// 滴下量 V（mL）のときの溶液を、電荷のつり合いから解く。試料の化学種と、滴下液の化学種（弱い滴下液のとき）の両方を数える。
function solveExact(sys, V){
  const Vt = sys.V0 + V, N0 = sys.N0, Nt = sys.Ct * V, t = sys.titrant;
  const CA = sys.n > 0 ? N0 / Vt : 0, CT = t.n > 0 ? Nt / Vt : 0;
  const fam = (n, pKa, z0, C, pH) => { if (!(n > 0) || !(C > 0)) return 0; const a = fractions(pKa, pH); let mean = 0; for (let j = 0; j <= n; j++) mean += j * a[j]; return C * (z0 + mean); };
  // 陽イオン・陰イオン（滴下液が持ち込むものを含む）の電荷の濃度
  const posSpec = sys.cM * N0 / Vt + (t.ionM ? t.ionM.z * t.ionM.per * Nt / Vt : 0);
  const negSpec = sys.cX * N0 / Vt + (t.ionX ? t.ionX.z * t.ionX.per * Nt / Vt : 0);
  const balance = pH => {
    const h = Math.pow(10, -pH);
    return h + posSpec - KW / h - negSpec + fam(sys.n, sys.pKa, sys.z0, CA, pH) + fam(t.n, t.pKa, t.z0, CT, pH);
  };
  const pH = S.bisect(balance, -2, 16);
  const h = Math.pow(10, -pH), alpha = sys.n > 0 ? fractions(sys.pKa, pH) : [];
  const raw = [{name: 'H⁺', conc: h, z: 1}, {name: 'OH⁻', conc: KW / h, z: -1}];
  if (sys.cM > 0) raw.push({name: sys.ionM, conc: sys.cM * N0 / Vt, z: 1});
  if (sys.cX > 0) raw.push({name: sys.ionX, conc: sys.cX * N0 / Vt, z: -1});
  if (t.ionM) raw.push({name: t.ionM.name, conc: t.ionM.per * Nt / Vt, z: t.ionM.z});
  if (t.ionX) raw.push({name: t.ionX.name, conc: t.ionX.per * Nt / Vt, z: -t.ionX.z});
  for (let j = 0; j <= sys.n && sys.n > 0; j++) raw.push({name: sys.forms[j], conc: CA * alpha[j], z: sys.z0 + j, family: true});
  if (t.n > 0){ const a = fractions(t.pKa, pH); for (let j = 0; j <= t.n; j++) raw.push({name: t.forms[j], conc: CT * a[j], z: t.z0 + j, family: true}); }
  const species = [];                                              // 同じ名前（Na⁺ など）は 1 つにまとめる
  for (const sp of raw){ const m = species.find(x => x.name === sp.name && x.z === sp.z); if (m) m.conc += sp.conc; else species.push(Object.assign({}, sp)); }
  let pos = 0, neg = 0;
  for (const sp of species){ if (sp.z > 0) pos += sp.z * sp.conc; else neg += -sp.z * sp.conc; }
  return {pH, h, oh: KW / h, Vt, species, alpha, pos, neg, residual: (pos - neg) / Math.max(pos, neg, 1e-300)};
}

// ---- 近似の計算（教科書の式） ----
// 戻り値：{pH, label, lines:[文], formula:'使った式', role}
// r = 滴下した H⁺（OH⁻）の物質量 ÷ 試料の物質量。整数なら当量点（または出発点）。
function approx(sys, V){
  const N0 = sys.N0, Vt = sys.V0 + V, Ntm = sys.Ct * V, Nt = Ntm * sys.tm, n = sys.n, acid = sys.kind === 'acid';   // Nt：滴下した H⁺（OH⁻）の物質量 mmol
  if (!sys.approxOK) return {pH: null, label: '', lines: ['滴下液が弱い酸・塩基（' + sys.titrant.name + '）なので、教科書の近似式はありません。厳密な計算の結果だけを出しています。'], role: 'none'};
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
  L.push(`物質量：${aName} ${left(N0)}、${tName} ${left(Ntm)}${sys.tm > 1 ? `（${T} ${left(Nt)}）` : ''}（比 ${fmt(r, 3)}）、${vol}`);

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
  if (diff == null || !isFinite(diff)) return {level: 'none', text: '近似なし'};
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
    approx: sys.approxOK ? grid.map(v => [v, Math.max(-1, Math.min(15, approx(sys, v).pH))]) : []
  };
}

// ---- 代表点（近似と厳密を見比べる表） ----
function keyPoints(sys, xmax){
  const pts = [], add = (r, label) => { const V = r * sys.dVeq; if (V <= xmax + 1e-9) pts.push({r, V, label}); };
  for (let k = 0; k < sys.steps; k++){
    add(k, k === 0 ? '滴下前' : `第 ${k} 当量点`);
    if (sys.n > 0 || k === 0){ if (k === 0 || sys.n > 0) add(k + 0.5, sys.n > 0 ? '半当量点' + (sys.steps > 1 ? `（第 ${k + 1} 段）` : '') : '当量点の 50 %'); }
    add(k + 0.9, '当量点の 90 %'); add(k + 0.99, '当量点の 99 %'); add(k + 0.999, '当量点の 99.9 %');
  }
  add(sys.steps, sys.steps > 1 ? `第 ${sys.steps} 当量点` : '当量点');
  add(sys.steps + 0.001, '当量点の少し後（+0.1 %）'); add(sys.steps + 0.5, '当量点の後（+50 %）');
  return pts.map(p => { const a = approx(sys, p.V), e = solveExact(sys, p.V); const df = a.pH == null ? null : a.pH - e.pH; return Object.assign(p, {approx: a.pH, exact: e.pH, diff: df, q: quality(df), scene: a.label}); });
}


// ---- 指示薬の判定（どの指示薬なら、当量点で色が変わるか） ----
// 厳密な曲線で、変色域の下端・中央・上端の pH になる滴下量を求め、当量点とのずれ（mL）を出す。
// 判定：ずれ 0.1 mL（約 2 滴）以内を「適切」、0.5 mL 以内を「ややずれる」、それより大きければ「不適切」。
function indicatorReport(sys, xmax){
  const grid = volumeGrid(sys, xmax, 800), pts = grid.map(v => [v, solveExact(sys, v).pH]);
  const cross = target => { const out = []; for (let i = 1; i < pts.length; i++){ const a = pts[i - 1], b = pts[i];
    if ((a[1] - target) * (b[1] - target) < 0) out.push(a[0] + (target - a[1]) / (b[1] - a[1]) * (b[0] - a[0])); } return out; };
  const nearest = (arr, v) => arr.length ? arr.reduce((m, x) => Math.abs(x - v) < Math.abs(m - v) ? x : m) : null;
  return INDICATORS.filter(i => i.lo != null).map(ind => {
    const mid = (ind.lo + ind.hi) / 2, cm = cross(mid), cl = cross(ind.lo), ch = cross(ind.hi);
    const events = sys.Veq.map((ve, k) => {
      if (ve > xmax) return null;
      const c = nearest(cm, ve); if (c == null) return {eq: k, ve, changes: false, grade: 'bad'};
      const err = c - ve, a = Math.abs(err);
      return {eq: k, ve, changes: true, V: c, Vlo: nearest(cl, c), Vhi: nearest(ch, c), err, grade: a <= 0.1 ? 'good' : a <= 0.5 ? 'fair' : 'bad'};
    }).filter(Boolean);
    return {key: ind.key, name: ind.name, lo: ind.lo, hi: ind.hi, events};
  });
}

// ---- 緩衝液のはたらき：いまの液に titrant を dV mL 加えたときの pH の変化を、純水に同じ量を加えたときと比べる ----
function bufferTest(sys, V, dV = 0.5){
  const before = solveExact(sys, V).pH, after = solveExact(sys, V + dV).pH;
  const w = Object.assign({}, sys, {n: 0, cM: 0, cX: 0, C0: 0, N0: 0, V0: sys.V0 + V});       // 試料の入っていない、同じ体積の純水
  const water = solveExact(w, dV).pH;
  return {dV, before, after, d: after - before, water, dWater: water - 7};
}

// ---- 化学種の割合（滴下量ごとの α）。多段階の酸で、形が入れ替わる様子を見る ----
function alphaCurve(sys, xmax, N = 300){
  const grid = volumeGrid(sys, xmax, N), series = [];
  for (let j = sys.n; j >= 0; j--) series.push({j, name: sys.forms[j], pts: []});
  for (const v of grid){ const a = solveExact(sys, v).alpha; for (const se of series) se.pts.push([v, a[se.j]]); }
  return series;
}

// ---- ビュレットの目盛りを読む練習 ----
// mode 'single'：液面の読みを答える／'diff'：始めと終わりの読みから、滴下した量を答える。読みは 0.01 mL の位まで（最小目盛りは 0.1 mL）。
function readingQuestion(seed, cap = 25, mode = 'single'){
  const rnd = S.rng(seed * 7919 + (mode === 'diff' ? 13 : 5));
  const r2 = x => Math.round(x * 100) / 100;
  if (mode === 'diff'){
    const a = r2(rnd() * 4), len = r2(5 + rnd() * Math.min(15, cap - 6));
    const b = r2(a + len);
    return {mode, a, b, answer: r2(b - a), tol: 0.03};
  }
  return {mode, a: r2(0.6 + rnd() * (cap - 1.2)), answer: null, tol: 0.02, get value(){ return this.a; }};
}
function checkReading(q, ans){
  const correct = q.mode === 'diff' ? q.answer : q.a;
  return {correct, ok: isFinite(ans) && Math.abs(ans - correct) <= q.tol + 1e-9, diff: ans - correct};
}
// 食酢の滴定：未知の濃度（うすめた液）を出題ごとに決める。0.0500〜0.1000 mol/L、0.0001 刻み
function unknownConc(seed){ const r = S.rng(seed * 104729 + 3); return Math.round((0.05 + r() * 0.05) * 1e4) / 1e4; }

// ---- 架空の酸・塩基（pKa を自由に決める）。spec = {kind:'acid'|'base', n:1〜3} ----
// 酸は H_nA（NaOH で滴定）、塩基は B（HCl で滴定。pKa は共役酸 BHₙⁿ⁺ → … → BH⁺ の順）。pKa の初期値は段数ごとの例。
function customSample(spec){
  const kind = spec && spec.kind === 'base' ? 'base' : 'acid';
  const n = Math.max(1, Math.min(3, (spec && spec.n | 0) || 1));
  const acid = kind === 'acid';
  const pKa = (acid ? {1: [4.5], 2: [3, 7], 3: [2, 6.5, 11]} : {1: [9], 2: [6, 10], 3: [3, 7, 11]})[n];
  const forms = acid ? [['A⁻', 'HA'], ['A²⁻', 'HA⁻', 'H₂A'], ['A³⁻', 'HA²⁻', 'H₂A⁻', 'H₃A']][n - 1] : [['B', 'BH⁺'], ['B', 'BH⁺', 'BH₂²⁺'], ['B', 'BH⁺', 'BH₂²⁺', 'BH₃³⁺']][n - 1];
  const formula = acid ? (n === 1 ? 'HA' : 'H' + '₂₃'[n - 2] + 'A') : 'B';
  return {key: 'custom', group: '架空の酸・塩基', name: '架空の酸・塩基（pKa を自由に決める）', kind, formula, label: (acid ? '架空の酸 ' : '架空の塩基 ') + formula, n, pKa, z0: acid ? -n : 0, forms, cX: 0, cM: 0,
    titrant: acid ? 'naoh' : 'hcl', C0: 0.100, V0: 10.0, Ct: 0.100, steps: n, rMax: n === 1 ? 2 : n + 0.5, ind: acid ? 'pp' : 'mo',
    note: '右の設定で、酸か塩基か・段数・pKa を決められる。pKa を変えると、曲線・半当量点・割合のグラフがどう変わるかを調べよう。'};
}
// pH と各化学種のモル分率（滴下量に関係なく、pKa だけで決まる）
function alphaVsPH(sys, step = 0.05){
  const series = [];
  for (let j = sys.n; j >= 0; j--) series.push({j, name: sys.forms[j], pts: []});
  for (let pH = 0; pH <= 14 + 1e-9; pH += step){ const a = fractions(sys.pKa, pH); for (const se of series) se.pts.push([Math.round(pH * 1e6) / 1e6, a[se.j]]); }
  return series;
}

const api = {TITRANTS, titrantByKey, titrantsFor, customTitrant, customSample, alphaVsPH, alphaCurve, readingQuestion, checkReading, unknownConc, indicatorReport, bufferTest, KW, SAMPLES, sampleByKey, INDICATORS, indicatorByKey, indicatorColor, indicatorFrac, WATER, makeSys, fractions, solveExact, approx, quality, exactLines, curve, volumeGrid, keyPoints};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemTitration = api;
})(typeof window !== 'undefined' ? window : globalThis);
