// 中和滴定（未知試料）の化学反応式の小問。物質のカード・正解の式を、試料（炭酸塩は組成）ごとに決める。
// 式の編集と採点は、化学反応式ビルダー（chem-equation.js・equation-builder.js）に任せる。ここは問題の定義だけを担う。
// カードにするのは問題文に出る物質（反応物）だけ。生成物は生徒が化学式を入力する（答えの候補を並べない）
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TitrationEquations = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const COMMON = ['H2O', 'CO2'];
  const task = (id, label, answers) => ({id, label, kind: 'molecular', answers: [].concat(answers)});
  // 炭酸塩の 2 段階。第 2 段階は H₂CO₃ と書く教科書もあるので、どちらも正解にする
  const STEP1 = 'Na2CO3 + HCl -> NaHCO3 + NaCl';
  const STEP2 = ['NaHCO3 + HCl -> NaCl + H2O + CO2', 'NaHCO3 + HCl -> NaCl + H2CO3'];
  const TOTAL = ['Na2CO3 + 2HCl -> 2NaCl + H2O + CO2', 'Na2CO3 + 2HCl -> 2NaCl + H2CO3'];
  const CARB = {
    A: {given: ['Na2CO3', 'HCl'], tasks: [task('s1', '第 1 段階（フェノールフタレインの変色まで）', STEP1), task('s2', '第 2 段階（メチルオレンジの変色まで）', STEP2),
      task('total', '全体の反応（第 1 段階と第 2 段階を合わせる）', TOTAL)]},
    B: {given: ['NaHCO3', 'HCl'], tasks: [task('s2', 'NaHCO₃ と塩酸の反応', STEP2)]},
    C: {given: ['NaOH', 'Na2CO3', 'HCl'], tasks: [task('oh', 'NaOH と塩酸の反応（第 1 段階）', 'NaOH + HCl -> NaCl + H2O'),
      task('s1', 'Na₂CO₃ と塩酸の反応（第 1 段階）', STEP1), task('s2', 'NaHCO₃ と塩酸の反応（第 2 段階）', STEP2)]},
    D: {given: ['Na2CO3', 'NaHCO3', 'HCl'], tasks: [task('s1', 'Na₂CO₃ と塩酸の反応（第 1 段階）', STEP1), task('s2', 'NaHCO₃ と塩酸の反応（第 2 段階）', STEP2)]}
  };
  const SIMPLE = {
    vinegar: {given: ['CH3COOH', 'NaOH'], tasks: [task('eq', '酢酸と水酸化ナトリウムの反応', 'CH3COOH + NaOH -> CH3COONa + H2O')]},
    unk_hcl: {given: ['HCl', 'NaOH'], tasks: [task('eq', '塩酸と水酸化ナトリウムの反応', 'HCl + NaOH -> NaCl + H2O')]},
    unk_naoh: {given: ['NaOH', 'HCl'], tasks: [task('eq', '水酸化ナトリウムと塩酸の反応', 'NaOH + HCl -> NaCl + H2O')]},
    unk_nh3: {given: ['NH3', 'HCl'], tasks: [task('eq', 'アンモニアと塩酸の反応', 'NH3 + HCl -> NH4Cl')]},
    unk_nh3b: {given: ['NH3', 'HCl', 'NaOH'], tasks: [task('nh3', 'アンモニアと塩酸の反応', 'NH3 + HCl -> NH4Cl'),
      task('back', '残った塩酸と水酸化ナトリウムの反応（滴定）', 'HCl + NaOH -> NaCl + H2O')]}
  };
  // smp：chem-titration.js の試料。炭酸塩は smp.comp.type（A〜D）で決まる。出題がない試料は null
  function define(smp){
    const src = smp.unkCarb ? CARB[smp.comp && smp.comp.type] : SIMPLE[smp.key];
    if (!src) return null;
    return {id: 'eq-' + smp.key + (smp.unkCarb ? '-' + smp.comp.type : ''), title: '中和反応の化学反応式', given: src.given.slice(), common: COMMON.slice(),
      freeEntry: true, aliases: [], tasks: src.tasks.map(t => Object.assign({}, t, {answers: t.answers.slice()}))};
  }
  return {define};
});
