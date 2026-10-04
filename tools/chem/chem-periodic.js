// 周期表と結合：量の見せ方と、2 つの原子から結合の種類を考える計算。DOM に触らない。
// chem-energy.js・chem-data.js を先に読み込む（Node では require する）。ブラウザでは window.ChemPeriodic。
(function (root) {
'use strict';
const D = (typeof module === 'object' && module.exports) ? require('./chem-data.js') : root.ChemData;
const {ELEMENTS, elementBySym, ionKey, ION_RADIUS} = D;

const r1 = v => Math.round(v * 10) / 10;
const r2 = v => Math.round(v * 100) / 100;
const gcd = (a, b) => b ? gcd(b, a % b) : Math.abs(a);
const SUB = '₀₁₂₃₄₅₆₇₈₉';
// 式の数字を下付きの文字にする（H2O → H₂O）。画面の見出しや文章に使う
const subs = f => f.replace(/\d/g, d => SUB[+d]);
const SUP = {'0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻'};
// イオンの書き方（Na⁺、O²⁻）
const ionText = (sym, q) => sym + (Math.abs(q) === 1 ? '' : String(Math.abs(q)).replace(/\d/g, d => SUP[d])) + (q > 0 ? '⁺' : '⁻');

// ---- 周期表に色を付ける量 ----
const CATEGORY = {
  alkali:{name:'アルカリ金属', color:'cat0'}, alk2:{name:'2 族', color:'cat1'}, trans:{name:'遷移元素', color:'cat2'},
  post:{name:'その他の金属', color:'cat3'}, metalloid:{name:'半金属', color:'cat4'}, nonmetal:{name:'非金属', color:'cat5'},
  halogen:{name:'ハロゲン', color:'cat6'}, noble:{name:'貴ガス', color:'cat7'}, lan:{name:'ランタノイド', color:'cat8'}, act:{name:'アクチノイド', color:'cat9'}};
const PROPS = {
  cat:{label:'元素の種類', unit:'', kind:'cat', note:'金属・非金属などの分類（アルカリ金属・ハロゲン・貴ガス…）。'},
  en:{label:'電気陰性度', unit:'', short:'電気陰性度', kind:'num', digits:2, get: e => e.en,
    note:'原子が共有電子対を引きつける強さ（ポーリングの値）。右上のフッ素が最大。貴ガスは決められていません。'},
  ie:{label:'第一イオン化エネルギー', unit:'kJ/mol', short:'イオン化エネルギー', kind:'num', digits:0, get: e => e.ie,
    note:'原子から電子を 1 個取り去って陽イオンにするのに必要なエネルギー。大きいほど陽イオンになりにくい。'},
  ea:{label:'電子親和力', unit:'kJ/mol', short:'電子親和力', kind:'num', digits:1, get: e => e.ea,
    note:'原子が電子を 1 個受け取って陰イオンになるときに放出するエネルギー。大きいほど陰イオンになりやすい。'},
  r:{label:'原子半径', unit:'pm', short:'原子半径', kind:'num', digits:0, get: e => e.r,
    note:'原子の大きさの目安（1 pm = 10⁻¹² m）。同じ周期では右ほど小さく、同じ族では下ほど大きい。'},
  ionR:{label:'イオン半径', unit:'pm', short:'イオン半径', kind:'num', digits:0, get: e => e.ionR,
    note:'主なイオンの半径。陽イオンは原子より小さく、陰イオンは原子より大きい。'},
};
const PROP_ORDER = ['cat', 'en', 'ie', 'ea', 'r', 'ionR'];
const propValue = (prop, e) => (PROPS[prop] && PROPS[prop].get) ? PROPS[prop].get(e) : null;
function propRange(prop){
  const vs = ELEMENTS.map(e => propValue(prop, e)).filter(v => v != null);
  return {min: Math.min(...vs), max: Math.max(...vs)};
}
const fmtVal = (prop, v) => v == null ? '—' : v.toFixed(PROPS[prop].digits);

// ---- グラフに載せる点 ----
// mode：'z' 原子番号の順（1〜56）、'period' 同じ周期、'group' 同じ族。sel：選んだ元素（周期・族を決める）
function chartSeries(mode, prop, sel){
  const pick = e => ({el: e, v: propValue(prop, e)});
  if (mode === 'period' && sel){
    const list = ELEMENTS.filter(e => e.period === sel.period && !e.f && (e.group != null)).sort((a, b) => a.group - b.group);
    return {title: `第 ${sel.period} 周期`, xlabel: '族', pts: list.map(e => Object.assign(pick(e), {x: e.group, xl: String(e.group)}))};
  }
  if (mode === 'group' && sel && sel.group != null){
    const list = ELEMENTS.filter(e => e.group === sel.group && !e.f).sort((a, b) => a.period - b.period);
    return {title: `${sel.group} 族`, xlabel: '周期', pts: list.map(e => Object.assign(pick(e), {x: e.period, xl: String(e.period)}))};
  }
  const list = ELEMENTS.filter(e => e.Z <= 56);
  return {title: '原子番号 1〜56', xlabel: '原子番号', pts: list.map(e => Object.assign(pick(e), {x: e.Z, xl: String(e.Z)}))};
}

// ---- 結合の種類 ----
// 判定の目安（高校の学び方に合わせた単純な規則。連続的なちがいなので、あくまで目安）
//  貴ガス … ふつうは結合しない
//  金属どうし … 金属結合
//  金属 ＋ 非金属（半金属を含む）… ΔEN ≥ 1.7 ならイオン結合、それ未満は「イオン結合（共有結合の性質もある）」
//  非金属どうし … ΔEN < 0.4 は無極性（極性がほとんどない）共有結合、0.4〜1.7 は極性共有結合、1.7 以上は極性がきわめて大きい共有結合
const T_IONIC = 1.7, T_POLAR = 0.4;
// 電気陰性度から見積もるイオン結合性（ポーリングの式）。0〜1
const ionicCharacter = d => 1 - Math.exp(-d * d / 4);
// 原子が出す手の数（共有結合の本数の目安）
const HANDS = {1:1, 13:3, 14:4, 15:3, 16:2, 17:1};
const handsOf = e => e.sym === 'H' ? 1 : (e.isMetal ? null : (HANDS[e.group] != null ? HANDS[e.group] : null));
const SELF = {H:'H₂（単結合）', O:'O₂（二重結合）', N:'N₂（三重結合）', F:'F₂（単結合）', Cl:'Cl₂（単結合）', Br:'Br₂（単結合）', I:'I₂（単結合）',
  C:'ダイヤモンド・黒鉛（共有結合の結晶）', Si:'ケイ素の結晶（共有結合の結晶）', S:'S₈（環状の分子）など', P:'P₄（正四面体の分子）など',
  B:'ホウ素の結晶', Ge:'ゲルマニウムの結晶', As:'ヒ素の結晶', Se:'セレンの結晶', Sb:'アンチモンの結晶', Te:'テルルの結晶'};
// 手の数から考えた分子の式。確かだと言える組み合わせだけ（H・B・C・N・O・F、H と第 3 周期以降、塩素以降のハロゲンと 14 族）
function covalentFormula(a, b){
  const ha = handsOf(a), hb = handsOf(b);
  if (!ha || !hb) return null;
  const small = e => e.period <= 2, withH = a.sym === 'H' || b.sym === 'H';
  const hal = e => ['Cl','Br','I'].includes(e.sym), g14 = e => e.group === 14;
  const ok = (small(a) && small(b)) || withH || (hal(a) && g14(b)) || (hal(b) && g14(a));
  if (!ok) return null;
  const k = gcd(ha, hb), na = hb / k, nb = ha / k;   // A が na 個、B が nb 個
  // 先に書く元素：電気陰性度の小さい方（CO₂・CCl₄・NF₃）。H だけは、16・17 族の相手のとき先（H₂O・HCl）、14・15 族のとき後（CH₄・NH₃）
  let first = a, second = b, nf = na, ns = nb;
  const rank = e => e.en;
  let swap = rank(b) < rank(a);
  if (withH){ const x = a.sym === 'H' ? b : a; swap = (b.sym === 'H') === (x.group >= 16); }
  if (swap){ first = b; second = a; nf = nb; ns = na; }
  const text = first.sym + (nf > 1 ? nf : '') + second.sym + (ns > 1 ? ns : '');
  const special = {'N+O':'NO、NO₂、N₂O など（窒素の酸化物は何種類もある）', 'C+O':'CO₂（二酸化炭素。CO もある）'};
  const key = [a.sym, b.sym].sort().join('+');
  return {text: subs(text), note: special[key] || null, hands: [ha, hb]};
}
// 陰イオンの価数（15〜17 族）
const anionCharge = e => e.sym === 'H' ? -1 : (({15:-3, 16:-2, 17:-1})[e.group] || null);   // H は金属との化合物（水素化物）のとき H⁻
const ANION_NAME = {H:'水素化', F:'フッ化', Cl:'塩化', Br:'臭化', I:'ヨウ化', O:'酸化', S:'硫化', Se:'セレン化', Te:'テルル化', N:'窒化', P:'リン化'};
const ROMAN = {1:'Ⅰ', 2:'Ⅱ', 3:'Ⅲ', 4:'Ⅳ'};
// イオン結合の組成式（陽イオン m、陰イオン x）。qc：陽イオンの価数（鉄(Ⅱ)・鉄(Ⅲ)の選択）
function ionicFormula(m, x, qc){
  const q = m.ions[0] > 0 ? (qc || m.ions[0]) : null, qa = anionCharge(x);
  if (!q || !qa) return null;
  const g = gcd(q, -qa), nc = -qa / g, na = q / g;
  const text = m.sym + (nc > 1 ? nc : '') + x.sym + (na > 1 ? na : '');
  const roman = m.ions.filter(v => v > 0).length > 1 ? '(' + ROMAN[q] + ')' : '';
  const name = ANION_NAME[x.sym] ? ANION_NAME[x.sym] + m.name + roman : null;
  return {text: subs(text), plain: text, name, cation: {sym: m.sym, q, n: nc}, anion: {sym: x.sym, q: qa, n: na}};
}
// 点電荷とみなしたイオン対の引力のエネルギー（kJ/mol）。距離は陽イオンと陰イオンの半径の和
// E = −1389.4 × |q₁q₂| / r（r は Å）。結晶の半径から見積もるので、実際の気体のイオン対より小さめに出る目安
const COULOMB = 138935;   // kJ·pm/mol
function ionPairEnergy(qc, qa, rc, ra){ return r1(-COULOMB * Math.abs(qc * qa) / (rc + ra)); }

// ポーリングの電気陰性度の考え方：A–B の結合エネルギーは、A–A と B–B の平均（幾何平均）より強い。
// その差が 96.5 × (ΔEN)² にほぼ等しい。二原子分子の値が表から計算できる組み合わせ（H と H・F・Cl・Br・I）だけ出す。
const PAULING_OK = ['F', 'Cl', 'Br', 'I'];
function paulingCheck(a, b){
  const [h, x] = a.sym === 'H' ? [a, b] : [b, a];
  if (h.sym !== 'H' || !PAULING_OK.includes(x.sym)) return null;
  const dAB = D.diatomicBond('H', x.sym), dAA = D.diatomicBond('H', 'H'), dBB = D.diatomicBond(x.sym, x.sym);
  const mean = Math.sqrt(dAA * dBB), excess = dAB - mean, d = Math.abs(a.en - b.en);
  return {dAB, dAA, dBB, mean: r1(mean), excess: r1(excess), predicted: r1(96.5 * d * d), dEN: r2(d), pair: ['H', x.sym]};
}

// 2 つの原子から結合の種類を考える。a・b は ELEMENTS の要素。opt.qc：金属の陽イオンの価数を選ぶとき
function judge(a, b, opt){
  opt = opt || {};
  const out = {a, b, same: a.sym === b.sym};
  if (a.cat === 'noble' || b.cat === 'noble'){
    out.kind = 'noble'; out.label = '貴ガス（ふつうは結合しない）';
    out.reason = '貴ガスは最外殻が満たされていて安定なので、ふつうは他の原子と結合しません（単原子分子として存在します）。';
    return out;
  }
  if (a.en == null || b.en == null){
    out.kind = 'nodata'; out.label = '電気陰性度のデータがないので判定できません';
    out.reason = (a.en == null ? a.name : b.name) + 'には、このアプリで使っている電気陰性度の値がありません。';
    return out;
  }
  const d = r2(Math.abs(a.en - b.en)), mean = r2((a.en + b.en) / 2);
  Object.assign(out, {d, mean, ionicPct: Math.round(ionicCharacter(d) * 100)});
  const [lo, hi] = a.en <= b.en ? [a, b] : [b, a];   // lo：電子を引きつける力が小さい方（δ⁺）
  Object.assign(out, {lo, hi});
  if (a.isMetal && b.isMetal){
    out.kind = 'metallic'; out.label = '金属結合';
    out.reason = '金属どうしです。価電子が原子の間を自由に動きまわる（自由電子）ことで結びついています。';
    if (!out.same) out.reason += '種類のちがう金属が混ざると合金になります。';
  } else if (a.isMetal || b.isMetal){
    const m = a.isMetal ? a : b, x = a.isMetal ? b : a;
    out.metal = m; out.other = x;
    if (d >= T_IONIC){
      out.kind = 'ionic'; out.label = 'イオン結合';
      out.reason = `電気陰性度の差（ΔEN）が ${d.toFixed(2)} と大きく、${m.name}が電子を渡して陽イオン、${x.name}が電子を受け取って陰イオンになります。`;
    } else {
      out.kind = 'mixed'; out.label = 'イオン結合（共有結合の性質もある）';
      out.reason = `金属と非金属なので、高校ではイオン結合として扱います。ただ ΔEN は ${d.toFixed(2)} と ${T_IONIC} より小さく、電子の受け渡しが完全ではないので、共有結合の性質もあわせもちます。`;
    }
    out.formula = ionicFormula(m, x, opt.qc);
    out.chargeChoices = m.ions.filter(v => v > 0);
  } else {
    if (d < T_POLAR){
      out.kind = 'covalent'; out.label = out.same ? '無極性の共有結合' : '共有結合（極性はほとんどない）';
      out.reason = out.same ? '同じ原子どうしなので、共有電子対はどちらにもかたよらず、極性はありません。'
        : `ΔEN が ${d.toFixed(2)} と小さいので、共有電子対はほとんどかたよりません。`;
    } else if (d < T_IONIC){
      out.kind = 'polar'; out.label = '極性共有結合';
      out.reason = `非金属どうしで、ΔEN が ${d.toFixed(2)}。共有電子対が${hi.name}のほうにかたより、${hi.name}が δ⁻、${lo.name}が δ⁺ になります。`;
    } else {
      out.kind = 'polar'; out.label = '極性共有結合（極性がきわめて大きい）';
      out.reason = `非金属どうしで、ΔEN が ${d.toFixed(2)} とかなり大きく、共有電子対が${hi.name}に強くかたよっています。`;
    }
    out.formula = out.same ? {text: SELF[a.sym] || null, self: true} : covalentFormula(a, b);
    out.pauling = out.same ? null : paulingCheck(a, b);
  }
  // イオン結合のとき：電子の受け渡しにかかるエネルギー（1 価のイオンどうしだけ）
  if ((out.kind === 'ionic' || out.kind === 'mixed') && out.formula){
    const q = out.formula.cation.q, qa = out.formula.anion.q;
    const rc = ION_RADIUS[ionKey(out.metal.sym, q)], ra = ION_RADIUS[ionKey(out.other.sym, qa)];
    out.ionic = {qc: q, qa, rc: rc || null, ra: ra || null, ie: out.metal.ie, ea: out.other.ea, simple: q === 1 && qa === -1};
    if (out.ionic.simple && out.ionic.ie != null && out.ionic.ea != null){
      out.ionic.transfer = r1(out.ionic.ie - out.ionic.ea);   // Na(気) + Cl(気) → Na⁺(気) + Cl⁻(気) のエネルギー
    }
    if (rc && ra) out.ionic.attract = ionPairEnergy(q, qa, rc, ra);
    if (out.ionic.transfer != null && out.ionic.attract != null) out.ionic.net = r1(out.ionic.transfer + out.ionic.attract);
    // 結晶の格子エネルギー（ボルン・ハーバー）。エネルギー図エディタにある NaCl・KCl だけ
    const salt = D.FORMATION.find(x => x.f === out.formula.plain && x.st === '固');
    if (out.ionic.simple && salt && out.metal.sym in {Na:1, K:1}){
      const sub = D.ATOM_GAS[out.metal.sym] - 0;   // M(固) → M(気)
      const xe = D.ATOM_GAS[out.other.sym];        // ½X₂ → X(気)
      out.ionic.lattice = r1(sub + out.metal.ie + xe - out.other.ea - salt.v);
    }
  }
  return out;
}

const api = {subs, ionText, CATEGORY, PROPS, PROP_ORDER, propValue, propRange, fmtVal, chartSeries, ionicCharacter, handsOf,
  covalentFormula, ionicFormula, anionCharge, ionPairEnergy, paulingCheck, judge, T_IONIC, T_POLAR};
if (typeof module === 'object' && module.exports) module.exports = api;
else root.ChemPeriodic = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
