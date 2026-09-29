// 化学系アプリの土台 B（定数）：元素・物質の定数と、それを使った式のライブラリ・例題。
// 値は 25 ℃・1.013×10⁵ Pa、単位は kJ/mol。出典は docs/DEVELOPMENT.md の「定数の出典」。
// chem-energy.js を先に読み込む（Node では require する）。ブラウザでは window.ChemData。
(function (root) {
'use strict';
const E = (typeof module === 'object' && module.exports) ? require('./chem-energy.js') : root.ChemEnergy;
const {Frac} = E;

// ---- 生成エンタルピー ΔfH°（kJ/mol）。f：化学式、st：状態、name：名前 ----
const FORMATION = [
  // 無機物
  {f:'H2O', st:'液', name:'水', v:-285.8}, {f:'H2O', st:'気', name:'水（水蒸気）', v:-241.8},
  {f:'H2O2', st:'液', name:'過酸化水素', v:-187.8},
  {f:'CO2', st:'気', name:'二酸化炭素', v:-393.5}, {f:'CO', st:'気', name:'一酸化炭素', v:-110.5},
  {f:'NH3', st:'気', name:'アンモニア', v:-45.9}, {f:'NO', st:'気', name:'一酸化窒素', v:91.3},
  {f:'NO2', st:'気', name:'二酸化窒素', v:33.2}, {f:'N2O4', st:'気', name:'四酸化二窒素', v:11.1},
  {f:'HF', st:'気', name:'フッ化水素', v:-273.3}, {f:'HCl', st:'気', name:'塩化水素', v:-92.3},
  {f:'HBr', st:'気', name:'臭化水素', v:-36.3}, {f:'HI', st:'気', name:'ヨウ化水素', v:26.5},
  {f:'H2S', st:'気', name:'硫化水素', v:-20.6}, {f:'SO2', st:'気', name:'二酸化硫黄', v:-296.8},
  {f:'SO3', st:'気', name:'三酸化硫黄', v:-395.7}, {f:'O3', st:'気', name:'オゾン', v:142.7},
  {f:'NaCl', st:'固', name:'塩化ナトリウム', v:-411.2}, {f:'KCl', st:'固', name:'塩化カリウム', v:-436.5},
  {f:'NaOH', st:'固', name:'水酸化ナトリウム', v:-425.8}, {f:'KOH', st:'固', name:'水酸化カリウム', v:-424.6},
  {f:'CaO', st:'固', name:'酸化カルシウム', v:-634.9}, {f:'Ca(OH)2', st:'固', name:'水酸化カルシウム', v:-985.2},
  {f:'CaCO3', st:'固', name:'炭酸カルシウム', v:-1207.6}, {f:'MgO', st:'固', name:'酸化マグネシウム', v:-601.6},
  {f:'Al2O3', st:'固', name:'酸化アルミニウム', v:-1675.7}, {f:'Fe2O3', st:'固', name:'酸化鉄(III)', v:-824.2},
  {f:'CuO', st:'固', name:'酸化銅(II)', v:-157.3},
  {f:'NH4NO3', st:'固', name:'硝酸アンモニウム', v:-365.6}, {f:'KNO3', st:'固', name:'硝酸カリウム', v:-494.6},
  {f:'H2SO4', st:'液', name:'硫酸', v:-814.0},
  // 有機物
  {f:'CH4', st:'気', name:'メタン', v:-74.6}, {f:'C2H6', st:'気', name:'エタン', v:-84.0},
  {f:'C3H8', st:'気', name:'プロパン', v:-103.8}, {f:'C4H10', st:'気', name:'ブタン', v:-125.6},
  {f:'C2H4', st:'気', name:'エチレン（エテン）', v:52.4}, {f:'C2H2', st:'気', name:'アセチレン（エチン）', v:227.4},
  {f:'C6H6', st:'液', name:'ベンゼン', v:49.1},
  {f:'CH3OH', st:'液', name:'メタノール', v:-239.2}, {f:'CH3OH', st:'気', name:'メタノール（気体）', v:-201.0},
  {f:'C2H5OH', st:'液', name:'エタノール', v:-277.6}, {f:'C2H5OH', st:'気', name:'エタノール（気体）', v:-234.8},
  {f:'CH3COOH', st:'液', name:'酢酸', v:-484.3}, {f:'C6H12O6', st:'固', name:'グルコース', v:-1273.3},
  // 単体（標準の状態ではないもの）
  {f:'C', st:'ダイヤモンド', name:'ダイヤモンド', v:1.9},
  {f:'Br2', st:'気', name:'臭素（気体）', v:30.9}, {f:'I2', st:'気', name:'ヨウ素（気体）', v:62.4},
];
// 気体の原子（生成エンタルピー＝単体を原子にばらすのに必要なエンタルピー）。結合エネルギー・昇華で使う
const ATOM_GAS = {H:218.0, O:249.2, N:472.7, C:716.7, F:79.4, Cl:121.3, Br:111.9, I:106.8,
  Li:159.3, Na:107.5, K:89.0, Mg:147.1, Ca:177.8};
// 水溶液中のイオンの生成エンタルピー（H⁺(aq) = 0 を基準）。溶解・中和の値を出すのに使う
const ION_AQ = {'H+':0, 'OH-':-230.0, 'Na+':-240.1, 'K+':-252.4, 'NH4+':-132.5, 'Cl-':-167.2, 'NO3-':-207.4, 'SO42-':-909.3};
// イオン化エネルギー（第一）・電子親和力（kJ/mol）。電子親和力は「放出するエネルギー」で、正の数で表す
const IONIZATION = {H:1312.0, Li:520.2, Na:495.8, K:418.8, Mg:737.7, Ca:589.8};
const ELECTRON_AFFINITY = {H:72.8, O:141.0, F:328.2, Cl:348.6, Br:324.6, I:295.2};
// 結合エネルギーの平均の値（多原子の分子の中の値。二原子分子は上の原子の値から計算する）
const BOND_AVG = {'C–H':416, 'C–C':330, 'C=C':589, 'C≡C':810, 'O–H':463, 'N–H':391, 'C=O':804};

// 単体の標準の状態（生成エンタルピーの式を作るとき）。n：単体 1 つに含まれる原子の数
const STANDARD = {H:['H2','気',2], O:['O2','気',2], N:['N2','気',2], F:['F2','気',2], Cl:['Cl2','気',2], Br:['Br2','液',2],
  I:['I2','固',2], C:['C','黒鉛',1], S:['S','斜方',1], Na:['Na','固',1], K:['K','固',1], Li:['Li','固',1], Ca:['Ca','固',1],
  Mg:['Mg','固',1], Al:['Al','固',1], Fe:['Fe','固',1], Cu:['Cu','固',1], Zn:['Zn','固',1], Ag:['Ag','固',1]};

// ---- 式の文字を作る ----
const cf = f => { f = Frac.of(f); return f.eq(1) ? '' : f.toString(); };
const term = (c, f, st) => cf(c) + f + (st ? (st === 'aq' ? 'aq' : '(' + st + ')') : '');
const join = arr => arr.filter(Boolean).join(' + ');
const r1 = v => Math.round(v * 10) / 10;
// 元素の出てくる順（CH4 → C, H）
function elementOrder(f){ return [...f.matchAll(/[A-Z][a-z]?/g)].map(m => m[0]).filter((e, i, a) => a.indexOf(e) === i); }
const fOf = (f, st) => FORMATION.find(x => x.f === f && x.st === st);
const isStandard = (f, st) => Object.values(STANDARD).some(([sf, sst]) => sf === f && sst === st);
// 生成エンタルピー。標準の状態の単体は 0、表にないものは null
const dfh = (f, st) => { if (isStandard(f, st)) return 0; const x = fOf(f, st); return x ? x.v : null; };

// 生成エンタルピーの式：C(黒鉛) + 2H2(気) → CH4(気)
function formationEq(x){
  const atoms = E.parseFormula(x.f);
  const lhs = elementOrder(x.f).map(el => { const [sf, sst, n] = STANDARD[el]; return term(new Frac(atoms[el], n), sf, sst); });
  return {text: join(lhs) + ' → ' + term(1, x.f, x.st), dh: x.v};
}
// 燃焼エンタルピーの式（C・H・O だけからなる物質、H2・C・CO・S）：生成物は CO2(気)・H2O(液)・SO2(気)
function combustionEq(f, st){
  const a = E.parseFormula(f);
  if (Object.keys(a).some(el => !['C', 'H', 'O', 'S'].includes(el))) return null;
  const c = a.C || 0, h = a.H || 0, o = a.O || 0, s = a.S || 0;
  const o2 = new Frac(4 * c + h + 4 * s - 2 * o, 4);
  if (o2.sign <= 0) return null;
  const prods = [c && term(c, 'CO2', '気'), h && term(new Frac(h, 2), 'H2O', '液'), s && term(s, 'SO2', '気')];
  const v = c * -393.5 + (h / 2) * -285.8 + s * -296.8 - (dfh(f, st) || 0);
  return {text: term(1, f, st) + ' + ' + term(o2, 'O2', '気') + ' → ' + join(prods), dh: r1(v)};
}

// ---- 結合エネルギー ----
// 二原子分子の結合エネルギーは、気体の原子の生成エンタルピーから計算する（値がほかの表と食い違わないように）
function diatomicBond(a, b){
  const molF = a === b ? a + '2' : a + b;
  return r1(ATOM_GAS[a] + ATOM_GAS[b] - dfh(molF, '気'));   // Br2・I2 は気体の生成エンタルピーを引く
}
// 分子を気体の原子にばらす式：CH4(気) → C(気) + 4H(気)  ΔH = 4×416
const BOND_MOLECULES = [
  {f:'H2', bonds:[['H–H', 1]]}, {f:'O2', bonds:[['O=O', 1]]}, {f:'N2', bonds:[['N≡N', 1]]},
  {f:'F2', bonds:[['F–F', 1]]}, {f:'Cl2', bonds:[['Cl–Cl', 1]]}, {f:'Br2', bonds:[['Br–Br', 1]]}, {f:'I2', bonds:[['I–I', 1]]},
  {f:'HF', bonds:[['H–F', 1]]}, {f:'HCl', bonds:[['H–Cl', 1]]}, {f:'HBr', bonds:[['H–Br', 1]]}, {f:'HI', bonds:[['H–I', 1]]},
  {f:'H2O', bonds:[['O–H', 2]]}, {f:'NH3', bonds:[['N–H', 3]]}, {f:'CH4', bonds:[['C–H', 4]]},
  {f:'C2H6', bonds:[['C–C', 1], ['C–H', 6]]}, {f:'C2H4', bonds:[['C=C', 1], ['C–H', 4]]}, {f:'C2H2', bonds:[['C≡C', 1], ['C–H', 2]]},
  {f:'CO2', bonds:[['C=O', 2]]},
];
function bondValue(b){
  if (BOND_AVG[b] != null) return BOND_AVG[b];
  const [a, c] = b.split(/[–=≡]/);
  return diatomicBond(a, c);
}
function bondEq(m){
  const atoms = E.parseFormula(m.f);
  const rhs = elementOrder(m.f).map(el => term(atoms[el], el, '気'));
  const v = m.bonds.reduce((s, [b, n]) => s + n * bondValue(b), 0);
  const note = m.bonds.map(([b, n]) => b + (n > 1 ? '×' + n : '') + '（' + bondValue(b) + '）').join('＋');
  return {text: term(1, m.f, '気') + ' → ' + join(rhs), dh: r1(v), note};
}

// ---- 溶解・中和（イオンの値から計算） ----
const ionSum = list => list.reduce((s, [ion, n]) => s + n * ION_AQ[ion], 0);
const SOLUTION = [
  {name:'水酸化ナトリウムの溶解', text:'NaOH(固) + aq → NaOHaq', dh: r1(ionSum([['Na+', 1], ['OH-', 1]]) - dfh('NaOH', '固'))},
  {name:'塩化ナトリウムの溶解', text:'NaCl(固) + aq → NaClaq', dh: r1(ionSum([['Na+', 1], ['Cl-', 1]]) - dfh('NaCl', '固'))},
  {name:'硝酸アンモニウムの溶解（冷える）', text:'NH4NO3(固) + aq → NH4NO3aq', dh: r1(ionSum([['NH4+', 1], ['NO3-', 1]]) - dfh('NH4NO3', '固'))},
  {name:'硝酸カリウムの溶解', text:'KNO3(固) + aq → KNO3aq', dh: r1(ionSum([['K+', 1], ['NO3-', 1]]) - dfh('KNO3', '固'))},
  {name:'硫酸の溶解（希釈）', text:'H2SO4(液) + aq → H2SO4aq', dh: r1(ionSum([['H+', 2], ['SO42-', 1]]) - dfh('H2SO4', '液'))},
  {name:'塩化水素の溶解', text:'HCl(気) + aq → HClaq', dh: r1(ionSum([['H+', 1], ['Cl-', 1]]) - dfh('HCl', '気'))},
  {name:'中和（塩酸と水酸化ナトリウム水溶液）', text:'HClaq + NaOHaq → NaClaq + H2O(液)', dh: r1(dfh('H2O', '液') - ION_AQ['OH-'])},
  {name:'中和（イオンの式）', text:'H+(aq) + OH-(aq) → H2O(液)', dh: r1(dfh('H2O', '液') - ION_AQ['OH-'])},
];

// ---- 状態変化（ほかの表から計算できるものは計算する） ----
const PHASE = [
  {name:'水の融解（0 ℃）', text:'H2O(固) → H2O(液)', dh:6.0},
  {name:'水の蒸発（25 ℃）', text:'H2O(液) → H2O(気)', dh: r1(dfh('H2O', '気') - dfh('H2O', '液'))},
  {name:'エタノールの蒸発', text:'C2H5OH(液) → C2H5OH(気)', dh: r1(dfh('C2H5OH', '気') - dfh('C2H5OH', '液'))},
  {name:'メタノールの蒸発', text:'CH3OH(液) → CH3OH(気)', dh: r1(dfh('CH3OH', '気') - dfh('CH3OH', '液'))},
  {name:'臭素の蒸発', text:'Br2(液) → Br2(気)', dh: dfh('Br2', '気')},
  {name:'ヨウ素の昇華', text:'I2(固) → I2(気)', dh: dfh('I2', '気')},
  {name:'黒鉛の昇華（原子にする）', text:'C(黒鉛) → C(気)', dh: ATOM_GAS.C},
  {name:'黒鉛 → ダイヤモンド', text:'C(黒鉛) → C(ダイヤモンド)', dh: dfh('C', 'ダイヤモンド')},
];

// ---- ボルン・ハーバー（昇華・イオン化エネルギー・電子親和力・解離） ----
const halfBond = X => r1(ATOM_GAS[X]);   // ½X2(気) → X(気)
const BORN_HABER = [
  ...['Li', 'Na', 'K'].map(M => ({name: M + ' の昇華', text: M + '(固) → ' + M + '(気)', dh: ATOM_GAS[M]})),
  ...['Li', 'Na', 'K'].map(M => ({name: M + ' のイオン化エネルギー', text: M + '(気) → ' + M + '+(気) + e-', dh: IONIZATION[M]})),
  ...['F', 'Cl'].map(X => ({name: '½' + X + '₂ を原子にする（結合エネルギーの半分）', text: '1/2' + X + '2(気) → ' + X + '(気)', dh: halfBond(X)})),
  ...['F', 'Cl', 'Br', 'I'].map(X => ({name: X + ' の電子親和力（' + ELECTRON_AFFINITY[X] + ' kJ/mol を放出）', text: X + '(気) + e- → ' + X + '-(気)', dh: -ELECTRON_AFFINITY[X]})),
];

// ---- ライブラリ（右のパネル）：分類ごとの式 ----
function library(){
  const fm = FORMATION.map(x => Object.assign({name: x.name}, formationEq(x)));
  const burnList = [
    {f:'H2', st:'気', name:'水素'}, {f:'C', st:'黒鉛', name:'黒鉛'}, {f:'C', st:'ダイヤモンド', name:'ダイヤモンド'},
    {f:'CO', st:'気', name:'一酸化炭素'}, {f:'S', st:'斜方', name:'硫黄'},
    ...[['CH4', '気'], ['C2H6', '気'], ['C3H8', '気'], ['C4H10', '気'], ['C2H4', '気'], ['C2H2', '気'], ['C6H6', '液'],
      ['CH3OH', '液'], ['C2H5OH', '液'], ['CH3COOH', '液'], ['C6H12O6', '固']].map(([f, st]) => fOf(f, st)),
  ];
  const burn = burnList.map(x => { const e = combustionEq(x.f, x.st); return e && Object.assign({name: x.name}, e); }).filter(Boolean);
  return [
    {id:'formation', title:'生成エンタルピー', note:'単体から 1 mol の物質ができるときの ΔH', items: fm},
    {id:'combustion', title:'燃焼エンタルピー', note:'1 mol が完全に燃焼するときの ΔH（水は液体）', items: burn},
    {id:'phase', title:'状態変化', note:'融解・蒸発・昇華', items: PHASE},
    {id:'solution', title:'溶解・中和', note:'aq は大量の水。値は薄い水溶液のもの', items: SOLUTION},
    {id:'bond', title:'結合エネルギー（原子にばらす）', note:'気体の分子を気体の原子にばらす ΔH。多原子の分子は平均の値なので、実際の値と少しずれる', items: BOND_MOLECULES.map(m => Object.assign({name: m.f + '：' + bondEq(m).note}, bondEq(m)))},
    {id:'bornhaber', title:'ボルン・ハーバー（イオン結晶）', note:'昇華・イオン化エネルギー・電子親和力。格子エネルギーを求める', items: BORN_HABER},
  ];
}

// ---- 例題（左の式の組をまとめて入れる）。target.dh は '?'（求める値） ----
function examples(){
  const F = (f, st) => formationEq(fOf(f, st));
  const B = (f, st) => combustionEq(f, st);
  const BE = f => bondEq(BOND_MOLECULES.find(m => m.f === f));
  const bh = s => BORN_HABER.find(x => x.text === s);
  return [
    {name:'一酸化炭素の生成エンタルピー（ヘスの法則）', target:'C(黒鉛) + 1/2O2(気) → CO(気)', eqs:[B('C', '黒鉛'), B('CO', '気')]},
    {name:'メタンの生成エンタルピー（燃焼エンタルピーから）', target:'C(黒鉛) + 2H2(気) → CH4(気)', eqs:[B('CH4', '気'), B('C', '黒鉛'), B('H2', '気')]},
    {name:'黒鉛 → ダイヤモンド（燃焼エンタルピーから）', target:'C(黒鉛) → C(ダイヤモンド)', eqs:[B('C', '黒鉛'), B('C', 'ダイヤモンド')]},
    {name:'水の蒸発エンタルピー（生成エンタルピーから）', target:'H2O(液) → H2O(気)', eqs:[F('H2O', '液'), F('H2O', '気')]},
    {name:'エタノールの燃焼エンタルピー（生成エンタルピーから）', target:'C2H5OH(液) + 3O2(気) → 2CO2(気) + 3H2O(液)', eqs:[F('C2H5OH', '液'), F('CO2', '気'), F('H2O', '液')]},
    {name:'塩化水素の生成（結合エネルギーから）', target:'H2(気) + Cl2(気) → 2HCl(気)', eqs:[BE('H2'), BE('Cl2'), BE('HCl')]},
    {name:'アンモニアの生成（結合エネルギーから）', target:'N2(気) + 3H2(気) → 2NH3(気)', eqs:[BE('N2'), BE('H2'), BE('NH3')]},
    {name:'塩化ナトリウムの格子エネルギー（ボルン・ハーバー）', target:'NaCl(固) → Na+(気) + Cl-(気)',
      eqs:[F('NaCl', '固'), bh('Na(固) → Na(気)'), bh('Na(気) → Na+(気) + e-'), bh('1/2Cl2(気) → Cl(気)'), bh('Cl(気) + e- → Cl-(気)')]},
    {name:'塩化カリウムの格子エネルギー（ボルン・ハーバー）', target:'KCl(固) → K+(気) + Cl-(気)',
      eqs:[F('KCl', '固'), bh('K(固) → K(気)'), bh('K(気) → K+(気) + e-'), bh('1/2Cl2(気) → Cl(気)'), bh('Cl(気) + e- → Cl-(気)')]},
    {name:'固体の NaOH と塩酸（溶解と中和）', target:'NaOH(固) + HClaq → NaClaq + H2O(液)',
      eqs:[SOLUTION[0], SOLUTION[6]]},
  ];
}

const api = {FORMATION, ATOM_GAS, ION_AQ, IONIZATION, ELECTRON_AFFINITY, BOND_AVG, STANDARD,
  formationEq, combustionEq, bondEq, bondValue, diatomicBond, library, examples};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemData = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
