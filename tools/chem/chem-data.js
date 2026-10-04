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

// ---- 表の値から ΔH を出す（自分で入力した式の ΔH が分からないとき、候補として見せる） ----
// 物質の生成エンタルピー（式の物質の key で引く）。表にないものは null
const CATION = {Li:'Li', Na:'Na', K:'K'}, ANION = ['F', 'Cl', 'Br', 'I'];
function enthalpyOf(key){
  if (key === 'e-') return 0;   // 電子は 0 とする（イオン化エネルギー・電子親和力の式が合うように）
  const [body, state] = key.split('|');
  const m = body.match(/^(.*?)(?:\^(-?\d+))?$/);
  const f = m[1], charge = m[2] ? +m[2] : 0;
  if (!charge){
    if (isStandard(f, state)) return 0;
    const x = fOf(f, state); if (x) return x.v;
    if (state === '気' && ATOM_GAS[f] != null) return ATOM_GAS[f];   // 気体の原子
    return null;
  }
  if (state === '気' && charge === 1 && CATION[f] && IONIZATION[f] != null) return r1(ATOM_GAS[f] + IONIZATION[f]);
  if (state === '気' && charge === -1 && ANION.includes(f) && ELECTRON_AFFINITY[f] != null) return r1(ATOM_GAS[f] - ELECTRON_AFFINITY[f]);
  return null;
}
// 式（parseEquation の結果）の ΔH を、表の値から計算する。分からない物質があれば null
function suggestDH(eq){
  const vec = E.vectorOf(eq);
  if (!vec.size) return null;
  let sum = 0;
  for (const [k, c] of vec){ const h = enthalpyOf(k); if (h == null) return null; sum += +c * h; }
  return r1(sum);
}

const api = {enthalpyOf, suggestDH, FORMATION, ATOM_GAS, ION_AQ, IONIZATION, ELECTRON_AFFINITY, BOND_AVG, STANDARD,
  formationEq, combustionEq, bondEq, bondValue, diatomicBond, library, examples};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemData = api;
// ======================================================================
// 追記（周期表と結合 periodic.html 用）：元素データ表。既存の表には手を入れず、api に足すだけ。
// 値の出典は docs/DEVELOPMENT.md の「定数の出典（周期表と結合）」。
// ======================================================================
// [原子番号, 記号, 名前, 原子量（[ ]は安定な同位体がないので質量数）, 電気陰性度（ポーリング）, 第一イオン化エネルギー(kJ/mol),
//  電子親和力(kJ/mol。放出するエネルギーを正で), 原子半径(pm。スレーターの経験値。貴ガスはなし)]
const ELEMENT_ROWS = [
  [1,'H','水素',1.008,2.20,1312.0,72.8,25], [2,'He','ヘリウム',4.003,null,2372.3,null,null],
  [3,'Li','リチウム',6.94,0.98,520.2,59.6,145], [4,'Be','ベリリウム',9.012,1.57,899.5,null,105],
  [5,'B','ホウ素',10.81,2.04,800.6,26.7,85], [6,'C','炭素',12.01,2.55,1086.5,121.8,70],
  [7,'N','窒素',14.01,3.04,1402.3,null,65], [8,'O','酸素',16.00,3.44,1313.9,141.0,60],
  [9,'F','フッ素',19.00,3.98,1681.0,328.2,50], [10,'Ne','ネオン',20.18,null,2080.7,null,null],
  [11,'Na','ナトリウム',22.99,0.93,495.8,52.9,180], [12,'Mg','マグネシウム',24.31,1.31,737.7,null,150],
  [13,'Al','アルミニウム',26.98,1.61,577.5,42.5,125], [14,'Si','ケイ素',28.09,1.90,786.5,134.1,110],
  [15,'P','リン',30.97,2.19,1011.8,72.0,100], [16,'S','硫黄',32.07,2.58,999.6,200.4,100],
  [17,'Cl','塩素',35.45,3.16,1251.2,348.6,100], [18,'Ar','アルゴン',39.95,null,1520.6,null,null],
  [19,'K','カリウム',39.10,0.82,418.8,48.4,220], [20,'Ca','カルシウム',40.08,1.00,589.8,2.4,180],
  [21,'Sc','スカンジウム',44.96,1.36,633.1,18.1,160], [22,'Ti','チタン',47.87,1.54,658.8,7.6,140],
  [23,'V','バナジウム',50.94,1.63,650.9,50.6,135], [24,'Cr','クロム',52.00,1.66,652.9,64.3,140],
  [25,'Mn','マンガン',54.94,1.55,717.3,null,140], [26,'Fe','鉄',55.85,1.83,762.5,15.7,140],
  [27,'Co','コバルト',58.93,1.88,760.4,63.7,135], [28,'Ni','ニッケル',58.69,1.91,737.1,112.0,135],
  [29,'Cu','銅',63.55,1.90,745.5,118.4,135], [30,'Zn','亜鉛',65.38,1.65,906.4,null,135],
  [31,'Ga','ガリウム',69.72,1.81,578.8,28.9,130], [32,'Ge','ゲルマニウム',72.63,2.01,762.0,119.0,125],
  [33,'As','ヒ素',74.92,2.18,947.0,78.0,115], [34,'Se','セレン',78.97,2.55,941.0,195.0,115],
  [35,'Br','臭素',79.90,2.96,1139.9,324.6,115], [36,'Kr','クリプトン',83.80,3.00,1350.8,null,null],
  [37,'Rb','ルビジウム',85.47,0.82,403.0,46.9,235], [38,'Sr','ストロンチウム',87.62,0.95,549.5,5.0,200],
  [39,'Y','イットリウム',88.91,1.22,600.0,29.6,180], [40,'Zr','ジルコニウム',91.22,1.33,640.1,41.1,155],
  [41,'Nb','ニオブ',92.91,1.6,652.1,86.1,145], [42,'Mo','モリブデン',95.95,2.16,684.3,71.9,145],
  [43,'Tc','テクネチウム','[99]',1.9,702.0,null,135], [44,'Ru','ルテニウム',101.1,2.2,710.2,101.3,130],
  [45,'Rh','ロジウム',102.9,2.28,719.7,109.7,135], [46,'Pd','パラジウム',106.4,2.20,804.4,53.7,140],
  [47,'Ag','銀',107.9,1.93,731.0,125.6,160], [48,'Cd','カドミウム',112.4,1.69,867.8,null,155],
  [49,'In','インジウム',114.8,1.78,558.3,28.9,155], [50,'Sn','スズ',118.7,1.96,708.6,107.3,145],
  [51,'Sb','アンチモン',121.8,2.05,834.0,101.0,145], [52,'Te','テルル',127.6,2.1,869.3,190.2,140],
  [53,'I','ヨウ素',126.9,2.66,1008.4,295.2,140], [54,'Xe','キセノン',131.3,2.6,1170.4,null,null],
  [55,'Cs','セシウム',132.9,0.79,375.7,45.5,260], [56,'Ba','バリウム',137.3,0.89,502.9,14.0,215],
  [57,'La','ランタン',138.9,1.10,538.1,null,195], [58,'Ce','セリウム',140.1,null,null,null,null],
  [59,'Pr','プラセオジム',140.9,null,null,null,null], [60,'Nd','ネオジム',144.2,null,null,null,null],
  [61,'Pm','プロメチウム','[145]',null,null,null,null], [62,'Sm','サマリウム',150.4,null,null,null,null],
  [63,'Eu','ユウロピウム',152.0,null,null,null,null], [64,'Gd','ガドリニウム',157.3,null,null,null,null],
  [65,'Tb','テルビウム',158.9,null,null,null,null], [66,'Dy','ジスプロシウム',162.5,null,null,null,null],
  [67,'Ho','ホルミウム',164.9,null,null,null,null], [68,'Er','エルビウム',167.3,null,null,null,null],
  [69,'Tm','ツリウム',168.9,null,null,null,null], [70,'Yb','イッテルビウム',173.0,null,null,null,null],
  [71,'Lu','ルテチウム',175.0,null,null,null,null],
  [72,'Hf','ハフニウム',178.5,1.3,658.5,null,155], [73,'Ta','タンタル',180.9,1.5,761.0,null,145],
  [74,'W','タングステン',183.8,2.36,770.0,null,135], [75,'Re','レニウム',186.2,1.9,760.0,null,135],
  [76,'Os','オスミウム',190.2,2.2,840.0,null,130], [77,'Ir','イリジウム',192.2,2.20,880.0,null,135],
  [78,'Pt','白金',195.1,2.28,870.0,null,135], [79,'Au','金',197.0,2.54,890.1,222.8,135],
  [80,'Hg','水銀',200.6,2.00,1007.1,null,150], [81,'Tl','タリウム',204.4,1.62,589.4,null,190],
  [82,'Pb','鉛',207.2,2.33,715.6,null,180], [83,'Bi','ビスマス',209.0,2.02,703.0,null,160],
  [84,'Po','ポロニウム','[209]',2.0,812.1,null,190], [85,'At','アスタチン','[210]',2.2,null,null,null],
  [86,'Rn','ラドン','[222]',null,1037.0,null,null],
  [87,'Fr','フランシウム','[223]',null,null,null,null], [88,'Ra','ラジウム','[226]',0.9,509.3,null,215],
  [89,'Ac','アクチニウム','[227]',null,null,null,null], [90,'Th','トリウム',232.0,null,null,null,null],
  [91,'Pa','プロトアクチニウム',231.0,null,null,null,null], [92,'U','ウラン',238.0,null,null,null,null],
  [93,'Np','ネプツニウム','[237]',null,null,null,null], [94,'Pu','プルトニウム','[244]',null,null,null,null],
  [95,'Am','アメリシウム','[243]',null,null,null,null], [96,'Cm','キュリウム','[247]',null,null,null,null],
  [97,'Bk','バークリウム','[247]',null,null,null,null], [98,'Cf','カリホルニウム','[251]',null,null,null,null],
  [99,'Es','アインスタイニウム','[252]',null,null,null,null], [100,'Fm','フェルミウム','[257]',null,null,null,null],
  [101,'Md','メンデレビウム','[258]',null,null,null,null], [102,'No','ノーベリウム','[259]',null,null,null,null],
  [103,'Lr','ローレンシウム','[266]',null,null,null,null],
  [104,'Rf','ラザホージウム','[267]',null,null,null,null], [105,'Db','ドブニウム','[268]',null,null,null,null],
  [106,'Sg','シーボーギウム','[269]',null,null,null,null], [107,'Bh','ボーリウム','[270]',null,null,null,null],
  [108,'Hs','ハッシウム','[269]',null,null,null,null], [109,'Mt','マイトネリウム','[278]',null,null,null,null],
  [110,'Ds','ダームスタチウム','[281]',null,null,null,null], [111,'Rg','レントゲニウム','[282]',null,null,null,null],
  [112,'Cn','コペルニシウム','[285]',null,null,null,null], [113,'Nh','ニホニウム','[286]',null,null,null,null],
  [114,'Fl','フレロビウム','[289]',null,null,null,null], [115,'Mc','モスコビウム','[290]',null,null,null,null],
  [116,'Lv','リバモリウム','[293]',null,null,null,null], [117,'Ts','テネシン','[294]',null,null,null,null],
  [118,'Og','オガネソン','[294]',null,null,null,null],
];
// 電子を受け取っても安定な陰イオンにならない元素（電子親和力が 0 以下）。表では「なし」と書く
const EA_NONE = ['He','Be','N','Ne','Mg','Ar','Zn','Kr','Cd','Xe','Mn'];
// 主なイオンの価数（正：陽イオン、負：陰イオン）。先頭が主なもの。ふつうのイオンをつくらない元素は書かない
const ION_CHARGES = {Li:[1], Na:[1], K:[1], Rb:[1], Cs:[1], Fr:[1], Be:[2], Mg:[2], Ca:[2], Sr:[2], Ba:[2], Ra:[2],
  Al:[3], Ga:[3], In:[3], Sc:[3], Cr:[3], Mn:[2], Fe:[2,3], Co:[2], Ni:[2], Cu:[2,1], Zn:[2], Ag:[1], Cd:[2], Hg:[2], Sn:[2], Pb:[2],
  N:[-3], P:[-3], O:[-2], S:[-2], Se:[-2], Te:[-2], F:[-1], Cl:[-1], Br:[-1], I:[-1]};
// イオン半径(pm)。キー：記号＋価数（Na+、O2-）。シャノンの値（配位数 6 など）
const ION_RADIUS = {'Li+':76,'Na+':102,'K+':138,'Rb+':152,'Cs+':167,'Be2+':45,'Mg2+':72,'Ca2+':100,'Sr2+':118,'Ba2+':135,
  'Al3+':54,'Ga3+':62,'In3+':80,'Sc3+':75,'Cr3+':62,'Mn2+':83,'Fe2+':78,'Fe3+':65,'Co2+':75,'Ni2+':69,'Cu+':77,'Cu2+':73,
  'Zn2+':74,'Ag+':115,'Cd2+':95,'Hg2+':102,'Pb2+':119,'N3-':146,'O2-':140,'S2-':184,'Se2-':198,'Te2-':221,
  'F-':133,'Cl-':181,'Br-':196,'I-':220};
const ionKey = (sym, q) => sym + (Math.abs(q) === 1 ? '' : Math.abs(q)) + (q > 0 ? '+' : '-');

// 周期表の位置（period：周期、group：族。ランタノイド・アクチノイドは group = null、f：'La'|'Ac'）
function elementPosition(Z){
  if (Z === 1) return {period:1, group:1};
  if (Z === 2) return {period:1, group:18};
  const ends = [2, 10, 18, 36, 54, 86, 118];
  const period = ends.findIndex(e => Z <= e) + 1, start = ends[period - 2] + 1;
  const k = Z - start;   // その周期の何番目か（0 から）
  if (period <= 3) return {period, group: k < 2 ? k + 1 : k + 11};
  if (period <= 5) return {period, group: k + 1};
  const fStart = period === 6 ? 57 : 89;
  if (k < 2) return {period, group: k + 1};
  if (Z >= fStart && Z <= fStart + 14) return {period, group: null, f: period === 6 ? 'La' : 'Ac'};
  return {period, group: Z - (fStart + 15) + 4};
}
// 種類：alkali アルカリ金属、alk2 2 族、trans 遷移元素（3〜12 族）、post その他の金属、metalloid 半金属、
//       nonmetal 非金属、halogen ハロゲン、noble 貴ガス、lan ランタノイド、act アクチノイド
const METALLOID = ['B','Si','Ge','As','Sb','Te'], NONMETAL = ['H','C','N','O','P','S','Se'];
const POST_METAL = ['Al','Ga','In','Sn','Tl','Pb','Bi','Po','Nh','Fl','Mc','Lv'];
function elementCategory(Z, sym, pos){
  if (pos.f) return pos.f === 'La' ? 'lan' : 'act';
  if (pos.group === 18) return 'noble';
  if (pos.group === 17) return 'halogen';
  if (METALLOID.includes(sym)) return 'metalloid';
  if (NONMETAL.includes(sym)) return 'nonmetal';
  if (POST_METAL.includes(sym)) return 'post';
  if (pos.group === 1) return 'alkali';
  if (pos.group === 2) return 'alk2';
  return 'trans';
}
// 電子殻ごとの電子数（K, L, M, …）。原子番号 54 まで（高校では 20 まで、が中心）。それより先は null
const SUBSHELLS = [[1,'s',2],[2,'s',2],[2,'p',6],[3,'s',2],[3,'p',6],[4,'s',2],[3,'d',10],[4,'p',6],[5,'s',2],[4,'d',10],[5,'p',6]];
const CONFIG_EXCEPT = {24:{'4s':1,'3d':5}, 29:{'4s':1,'3d':10}, 41:{'5s':1,'4d':4}, 42:{'5s':1,'4d':5}, 44:{'5s':1,'4d':7},
  45:{'5s':1,'4d':8}, 46:{'5s':0,'4d':10}, 47:{'5s':1,'4d':10}};
function electronShells(Z){
  if (Z < 1 || Z > 54) return null;
  const occ = {};
  let left = Z;
  for (const [n, l, cap] of SUBSHELLS){ const put = Math.min(cap, left); occ[n + l] = put; left -= put; if (!left) break; }
  if (CONFIG_EXCEPT[Z]) Object.assign(occ, CONFIG_EXCEPT[Z]);
  const shells = [];
  for (const k of Object.keys(occ)){ const n = +k[0]; shells[n - 1] = (shells[n - 1] || 0) + occ[k]; }
  const out = shells.map(v => v || 0);
  while (out.length && !out[out.length - 1]) out.pop();   // 空になった最後の殻（Pd の 5s など）は除く
  return out;
}
const ELEMENTS = ELEMENT_ROWS.map(([Z, sym, name, mass, en, ie, ea, r]) => {
  const pos = elementPosition(Z), cat = elementCategory(Z, sym, pos), shells = electronShells(Z);
  const ions = ION_CHARGES[sym] || [];
  const eaState = ea != null ? 'value' : (EA_NONE.includes(sym) ? 'none' : 'nodata');
  const isMetal = ['alkali','alk2','trans','post','lan','act'].includes(cat);
  return {Z, sym, name, mass, en, ie, ea, r, eaState, period: pos.period, group: pos.group, f: pos.f || null, cat, isMetal,
    shells, ions, ionR: ions.length && ION_RADIUS[ionKey(sym, ions[0])] || null};
});
const elementBySym = sym => ELEMENTS.find(e => e.sym === sym) || null;

Object.assign(api, {ELEMENTS, ELEMENT_ROWS, ION_RADIUS, ION_CHARGES, ionKey, elementBySym, elementPosition, electronShells});

})(typeof globalThis !== 'undefined' ? globalThis : this);
