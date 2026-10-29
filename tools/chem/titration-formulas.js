// 中和滴定（未知試料）の立式規則。値・単位・正解は、出題された系（chem-titration.js の makeSys）から導く。
// 式の編集と採点は、座学の共通基盤（js/lesson-formula-*.js）に任せる。ここは問題の定義だけを担う。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('../../js/lesson-formula-grader.js'));
  else root.TitrationFormulas = factory(root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Grader) {
  'use strict';
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const group = body => ({ kind: 'group', body });
  const unit = (label, dimensions, extras = {}) => ({ label, dimensions, ...extras });
  // mL と L は別の単位として扱う。換算の 1000 は、単位なしの数として式に残す（掛ける・割るの向きも採点される）。
  const UNITS = Object.freeze({
    '': unit('単位なし', {}), mL: unit('mL', { mL: 1 }), L: unit('L', { L: 1 }), mol: unit('mol', { mol: 1 }), 'mol/L': unit('mol/L', { mol: 1, L: -1 }),
    'mL/L': unit('mL/L', { mL: 1, L: -1 }, { conversion: true, conversionLabel: 'L→mL', conversionOperation: '掛ける' }),
    'L/mL': unit('L/mL', { L: 1, mL: -1 }, { conversion: true, conversionLabel: 'mL→L', conversionOperation: '掛ける' })
  });
  const UNIT_LESS_CONVERSIONS = Object.freeze({ '1000': ['', 'mL/L'], '0.001': ['', 'L/mL'] });
  // ビュレットの読みの許容（mL）。炭酸塩の第 1 終点（フェノールフタレイン）は変色がゆるやかで、色の中央でも当量点より
  // 0.15〜0.26 mL 前になるため、0.5 mL とする。誤った指示薬では 0.9 mL 以上ずれるので、区別はつく（dev のテストで確かめる）
  const readTol = 0.5;
  const concTol = c => Math.max(c * 0.03, 0.003);                       // 濃度の許容（mol/L）
  const sig3 = n => Number(n).toPrecision(3);                           // 問題の数値は有効数字 3 桁で示す（0.100 mol/L、10.0 mL）

  function createDefinition(id) {
    const definition = { id, units: UNITS, unitlessConversionChoices: UNIT_LESS_CONVERSIONS, manualUnits: ['mL', 'L', 'mol', 'mol/L'], preserveDecimals: true, quantities: [], constants: [], sources: [], tasks: [] };
    // 測った値（濃度・体積）は、有効数字 3 桁の書き方のまま渡す（式ビルダーは preserveDecimals で末尾の 0 を残す）
    function source(sourceId, label, number, unitId, options = {}) {
      const text = options.implicit ? String(number) : sig3(number);
      const item = { id: sourceId, label, value: text, unit: unitId, symbol: sourceId };
      definition.sources.push(item);
      if (!options.implicit) definition.quantities.push({ id: sourceId, label, value: text, unit: unitId });
      return value(text, unitId, sourceId);
    }
    function constant(constantId, label, number, unitId = '') { definition.constants.push({ id: constantId, label, value: String(number), unit: unitId }); return value(number, unitId); }
    function task(taskId, label, answerUnit, expected, expectedTokens, extras = {}) {
      definition.tasks.push({ id: taskId, label, answerUnit, answerUnitLabel: UNITS[answerUnit].label, expected, tolerance: 1e-7, expectedTokens, ...extras });
    }
    // 滴定の読み（ビュレットの目盛り）。生徒が読んで直接記入し、後の式で参照する。
    function reading(taskId, symbol, label, prompt, expected) {
      const quantity = source(symbol, label, Math.round(expected * 1e4) / 1e4, 'mL', { implicit: true });
      task(taskId, label, 'mL', expected, [], { rule: 'given-value', tolerance: readTol, answerUnitLabel: 'mL。', conclusionQuantity: { unit: 'mL', symbol }, scaffold: { type: 'given-value', prompt } });
      return quantity;
    }
    return { definition, source, constant, task, reading };
  }

  // 直接の滴定（食酢・塩酸・水酸化ナトリウム・アンモニア水）。濃度 = 滴下液の濃度 × 当量点の滴下量 ÷ 試料の体積（1 : 1）
  function direct(sys, label) {
    const { definition, source, constant, task, reading } = createDefinition('titration-direct');
    const ct = source('ct', `${sys.titrant.name} の濃度`, sys.Ct, 'mol/L'), v0 = source('v0', '試料の体積', sys.V0, 'mL');
    constant('kilo', '換算用の数', 1000);
    const veq = reading('reading', 'veq', '(1) 終点の滴下量', '滴定の終点までに滴下した量（ビュレットの読み）は', sys.Veq[0]);
    task('conc', `(2) ${label}の濃度`, 'mol/L', sys.C0, [ct, op('×'), veq, op('÷'), v0], { tolerance: concTol(sys.C0) });
    return definition;
  }

  // 逆滴定：もとの濃度 = (加えた HCl の物質量 − 残りの HCl を中和した NaOH の物質量) ÷ アンモニア水の体積
  function back(sys) {
    const { definition, source, constant, task, reading } = createDefinition('titration-back'), c = sys.comp;
    const ca = source('ca', '加えた塩酸の濃度', c.nHCl / 20, 'mol/L'), va = source('va', '加えた塩酸の体積', 20, 'mL');
    const vs = source('vs', 'アンモニア水の体積', 10, 'mL'), ct = source('ct', `${sys.titrant.name} の濃度`, sys.Ct, 'mol/L');
    constant('kilo', '換算用の数', 1000);
    const veq = reading('reading', 'veq', '(1) 終点の滴下量', '残った塩酸の中和が終わるまでに滴下した量（ビュレットの読み）は', sys.Veq[0]);
    task('conc', '(2) もとのアンモニア水の濃度', 'mol/L', c.cOrig, [group([ca, op('×'), va, op('-'), ct, op('×'), veq]), op('÷'), vs], { tolerance: concTol(c.cOrig) });
    return definition;
  }

  // 炭酸塩：組成が分かったあとの濃度。V₁ = フェノールフタレインの終点の読み、Vt = メチルオレンジの終点の読み（どちらも始めからの読み）
  const PARTS = { A: [['c1', 'Na₂CO₃']], B: [['c2', 'NaHCO₃']], C: [['c3', 'NaOH'], ['c1', 'Na₂CO₃']], D: [['c1', 'Na₂CO₃'], ['c2', 'NaHCO₃']] };
  function carbonate(sys) {
    const { definition, source, constant, task, reading } = createDefinition('titration-carbonate'), c = sys.comp, t = c.type;
    const ct = source('ct', `${sys.titrant.name} の濃度`, sys.Ct, 'mol/L'), v0 = source('v0', '試料の体積', sys.V0, 'mL');
    constant('kilo', '換算用の数', 1000); constant('two', '係数', 2);
    const v1 = t === 'B' ? null : reading('v1', 'v1', '(1) フェノールフタレインの終点の読み V₁', 'フェノールフタレインが変色するまでの滴下量 V₁（ビュレットの読み）は', sys.Veq[0]);
    const vt = reading('vt', 'vt', `(${t === 'B' ? 1 : 2}) メチルオレンジの終点の読み Vt`, t === 'B' ? 'メチルオレンジが変色するまでの滴下量 Vt（ビュレットの読み）は' : 'メチルオレンジが変色するまでの、滴下の始めからの量 Vt（ビュレットの読み。V₂ = Vt − V₁）は', sys.Veq[sys.Veq.length - 1]);
    const V2 = group([vt, op('-'), v1 || value(0)]);
    const expr = {
      A: { c1: [ct, op('×'), v1, op('÷'), v0] },
      B: { c2: [ct, op('×'), vt, op('÷'), v0] },
      C: { c3: [ct, op('×'), group([value(2), op('×'), v1, op('-'), vt]), op('÷'), v0], c1: [ct, op('×'), V2, op('÷'), v0] },
      D: { c1: [ct, op('×'), v1, op('÷'), v0], c2: [ct, op('×'), group([vt, op('-'), value(2), op('×'), v1]), op('÷'), v0] }
    }[t];
    const alt = t === 'A' ? { c1: [[ct, op('×'), V2, op('÷'), v0], [ct, op('×'), vt, op('÷'), value(2), op('÷'), v0]] } : {};
    PARTS[t].forEach(([k, name], i) => {
      const n = (t === 'B' ? 1 : 2) + i + 1;
      task(`conc-${k}`, `(${n}) ${name} の濃度`, 'mol/L', c[k], expr[k], { tolerance: concTol(c[k]), expectedAlternatives: alt[k] });
    });
    return definition;
  }

  // 出題に合わせた式の定義。炭酸塩は、組成を答えたあとで呼ぶ。
  function define(sample, sys) {
    if (sample.unkBack) return back(sys);
    if (sample.unkCarb) return carbonate(sys);
    return direct(sys, `${sample.unkWhat ? 'うすめた液の' : ''}${sample.unkSub}`);
  }
  const gradeTask = (definition, draft, taskId) => Grader.grade(definition, draft, { taskId });
  const gradeRow = (definition, draft, rowId) => Grader.gradeRow(definition, draft, rowId);
  return Object.freeze({ define, gradeTask, gradeRow, PARTS, UNITS });
});
