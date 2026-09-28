// 音教材の立式規則。値・単位・正解は問題params/SoundCoreから導出する。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lesson-formula-core.js'), require('./sound-core.js'));
  else root.SoundFormulas = factory(root.LessonFormulaCore, root.SoundCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Formula, Sound) {
  'use strict';
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const group = body => ({ kind: 'group', body });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const unit = (label, dimensions, extras = {}) => ({ label, dimensions, ...extras });
  // bit/B/KB/MB are deliberately independent bases: wrong conversion direction
  // must not disappear through automatic unit conversion. Counts are dimensionless.
  const UNITS = Object.freeze({
    '': unit('単位なし', {}), s: unit('秒', { s: 1 }), min: unit('分', { min: 1 }),
    Hz: unit('回/秒（Hz）', { s: -1 }), kHz: unit('kHz', { kHz: 1 }),
    'Hz/kHz': unit('Hz/kHz', { s: -1, kHz: -1 }, { conversion: true, conversionLabel: 'kHz→Hz', conversionOperation: '掛ける' }), 's/min': unit('秒/分', { s: 1, min: -1 }, { conversion: true, conversionLabel: '分→秒', conversionOperation: '掛ける' }),
    bit: unit('bit', { bit: 1 }), 'bit/sample': unit('bit/回', { bit: 1 }),
    bitCount: unit('bit（桁数）', {}), levels: unit('段階', {}), channel: unit('チャンネル', {}),
    B: unit('B', { B: 1 }), 'B/sample': unit('B/回', { B: 1 }),
    KB: unit('KB', { KB: 1 }), MB: unit('MB', { MB: 1 }),
    KiB: unit('KiB', { KiB: 1 }), MiB: unit('MiB', { MiB: 1 }),
    'B/s': unit('B/秒', { B: 1, s: -1 }), 'KB/s': unit('KB/秒', { KB: 1, s: -1 }),
    'bit/B': unit('bit/B', { bit: 1, B: -1 }, { conversion: true, conversionLabel: 'bit→B', conversionOperation: '割る' }), 'B/bit': unit('B/bit', { B: 1, bit: -1 }, { conversion: true, conversionLabel: 'bit→B', conversionOperation: '掛ける' }),
    'B/KB': unit('B/KB', { B: 1, KB: -1 }, { conversion: true, conversionLabel: 'B→KB', conversionOperation: '割る' }), 'KB/B': unit('KB/B', { KB: 1, B: -1 }, { conversion: true, conversionLabel: 'B→KB', conversionOperation: '掛ける' }),
    'KB/MB': unit('KB/MB', { KB: 1, MB: -1 }, { conversion: true, conversionLabel: 'KB→MB', conversionOperation: '割る' }), 'MB/KB': unit('MB/KB', { MB: 1, KB: -1 }, { conversion: true, conversionLabel: 'KB→MB', conversionOperation: '掛ける' }),
    'B/MB': unit('B/MB', { B: 1, MB: -1 }, { conversion: true, conversionLabel: 'B→MB', conversionOperation: '割る' }),
    'B/KiB': unit('B/KiB', { B: 1, KiB: -1 }, { conversion: true, conversionLabel: 'B→KiB', conversionOperation: '割る' }), 'KiB/MiB': unit('KiB/MiB', { KiB: 1, MiB: -1 }, { conversion: true, conversionLabel: 'KiB→MiB', conversionOperation: '割る' })
  });
  const close = (a, b, tolerance = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(tolerance, Math.abs(b) * 1e-9);
  const sameDimensions = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => (a[key] || 0) === (b[key] || 0));

  function define(problem) {
    const p = problem.params;
    const definition = { id: problem.id, units: UNITS, quantities: [], constants: [], sources: [], tasks: [] };
    function source(id, label, n, u, implicit = false) {
      const item = { id, label, value: String(n), unit: u };
      // Monophonic ×1 can be omitted. Other quantities retain their provenance.
      const symbol = id === 'channels' && n === 1 ? undefined : id;
      definition.sources.push({ ...item, symbol });
      if (!implicit) definition.quantities.push(item);
      return value(n, u, symbol);
    }
    function constant(id, label, n, u = '') {
      definition.constants.push({ id, label, value: String(n), unit: u });
      return value(n, u);
    }
    function task(id, label, answerUnit, expected, expectedTokens, extras = {}) {
      definition.tasks.push({ id, label, answerUnit, answerUnitLabel: UNITS[answerUnit].label, expected,
        tolerance: problem.tolerance ?? Math.max(1e-7, Math.abs(expected) * 1e-6), expectedTokens, ...extras });
    }
    constant('one', '基準の1', 1);
    constant('two', '2進数の基数など', 2);
    if (problem.type === 'periodFromRate' || problem.type === 'rateFromPeriod') {
      const period = problem.type === 'periodFromRate';
      const input = source(period ? 'rate' : 'period', period ? '標本化周波数' : '標本化周期', period ? p.sampleRate : p.period, period ? 'Hz' : 's');
      task('answer', '答え', period ? 's' : 'Hz', period ? Sound.samplingPeriod(p.sampleRate) : 1 / p.period, [value(1), op('÷'), input]);
    } else if (problem.type === 'levelsFromBits') {
      const bits = source('bits', '量子化ビット数', p.bitDepth, 'bitCount');
      task('answer', '量子化段階数', 'levels', Sound.quantizationLevels(p.bitDepth), [power([value(2)], [bits])]);
    } else if (problem.type === 'bitsFromLevels') {
      const levels = source('levels', '区別する段階数', p.levels, 'levels');
      const bits = Sound.requiredBitsForLevels(p.levels);
      task('answer', '必要な最小のビット数', 'bitCount', bits, [], { rule: 'minimum-bits', levels: p.levels, answerIsResult: false });
      definition.hint = '2の何乗で足りるか、その一つ前では足りないことも式で確かめます。指数の数値は自分で追加してください。';
      definition.bound = levels;
    } else if (problem.type === 'dataSize' || problem.type === 'workedExample') {
      const example = problem.type === 'workedExample';
      const kilo = p.sampleRateUnit === 'kHz';
      const rate = source('rate', '標本化周波数', kilo ? p.sampleRate / 1000 : p.sampleRate, kilo ? 'kHz' : 'Hz');
      const bits = source('bits', '量子化ビット数（1回・1チャンネル分）', p.bitDepth, 'bit/sample');
      const channels = source('channels', 'チャンネル数', p.channels, 'channel', !example);
      for (const n of [1, 2, 6]) constant(`channels-${n}`, 'チャンネル数の候補', n, 'channel');
      // 換算値は、値カードでも自由入力でも同じ「単位なしの数」として
      // 扱う。採点では下の構造比較で、掛ける/割る位置と 1000/1024 を
      // 確認するため、表示用の比の単位をトークンへ持ち込まない。
      const bytes = constant('bit-byte', '換算用の数', 8);
      constant('byte-bit', '換算用の数', 0.125);
      const base = p.base ?? 1000;
      const binaryName = (problem.answerUnit || p.answerUnit || '').includes('i');
      const k = binaryName ? 'KiB' : 'KB';
      const m = binaryName ? 'MiB' : 'MB';
      for (const n of [1000, 1024]) {
        constant(`byte-kilo-${n}`, '換算用の数', n);
        constant(`kilo-mega-${n}`, '換算用の数', n);
      }
      constant('minute-second', '換算用の数', 60);
      constant('kilo-hertz', '換算用の数', 1000);
      const normalizedRate = kilo ? group([rate, op('×'), value(1000)]) : rate;
      const legacyNormalizedRate = kilo ? group([rate, op('×'), value(1000, 'Hz/kHz')]) : rate;
      const sample = [bits, op('×'), channels, op('÷'), bytes];
      const legacySample = [bits, op('×'), channels, op('÷'), value(8, 'bit/B')];
      if (example) {
        const size = Sound.audioDataSize({ sampleRate: 1, seconds: 1, bitDepth: p.bitDepth, channels: p.channels });
        task('sample', '(1) 1回の標本化で生じるデータ量', 'B', size.bytes, sample, { legacyExpectedTokens: legacySample });
        const second = Sound.audioDataSize({ ...p, seconds: 1 });
        task('second', '(2) 1秒あたりのデータ量', 'KB/s', Sound.convertBytes(second.bytes, 'KB', 1000), [...sample, op('×'), normalizedRate, op('÷'), value(1000)], {
          legacyExpectedTokens: [...legacySample, op('×'), legacyNormalizedRate, op('÷'), value(1000, 'B/KB')]
        });
      } else {
        let duration;
        let legacyDuration;
        if (p.durationParts) {
          const minute = source('minutes', '録音時間（分の部分）', p.durationParts.minutes, 'min');
          const second = source('seconds', '録音時間（秒の部分）', p.durationParts.seconds, 's');
          duration = group([minute, op('×'), value(60), op('+'), second]);
          legacyDuration = group([minute, op('×'), value(60, 's/min'), op('+'), second]);
        } else duration = legacyDuration = source('duration', '録音時間', p.seconds, 's');
        const expression = [normalizedRate, op('×'), duration, op('×'), ...sample];
        const legacyExpression = [legacyNormalizedRate, op('×'), legacyDuration, op('×'), ...legacySample];
        const targetUnit = problem.answerUnit || p.answerUnit;
        if ([k, m].includes(targetUnit)) expression.push(op('÷'), value(base));
        if (targetUnit === m) expression.push(op('÷'), value(base));
        if ([k, m].includes(targetUnit)) legacyExpression.push(op('÷'), value(base, `B/${k}`));
        if (targetUnit === m) legacyExpression.push(op('÷'), value(base, `${k}/${m}`));
        const size = Sound.audioDataSize(p);
        const expected = targetUnit === 'B' ? size.bytes : Sound.convertBytes(size.bytes, targetUnit, base);
        task('answer', '音声データ量', targetUnit, expected, expression, { legacyExpectedTokens: legacyExpression });
      }
    } else throw new TypeError('この問題には式の組み立てを設定していません。');
    return definition;
  }

  // `taskId` limits a judgement to one small question and the rows it actually
  // uses.  This lets an independent (2) be checked while (1) is still blank,
  // without relaxing the existing all-questions API.
  function grade(definition, draft, options = {}) {
    const result = { status: 'invalid', tasks: [], rows: [], message: '' };
    const rows = Array.isArray(draft?.rows) ? draft.rows : [];
    const records = new Map();
    const indexes = new Map(rows.map((row, index) => [row.id, index]));
    const errors = [];
    const units = definition.units;
    // Candidate IDs are not trusted for grading: manual input with the same
    // quantity and unit has exactly the same provenance as a palette card.
    function resolveValue(token) {
      const n = Formula.normalizeNumber(token.value);
      const dimensions = units[token.unit || '']?.dimensions;
      if (!dimensions) return { ...token, symbol: undefined };
      const source = definition.sources.find(item => close(Number(item.value), n, 1e-12)
        // Counts have the same physical dimension but different roles: the base 2
        // is not a stereo channel count or a supplied bit count. Physical aliases
        // such as bit and bit/回 may share a role; count units must match exactly.
        && (Object.keys(dimensions).length ? sameDimensions(units[item.unit].dimensions, dimensions) : item.unit === (token.unit || '')));
      return { ...token, symbol: source?.symbol };
    }
    function evaluate(tokens, rowIndex, trusted = false) {
      return Formula.evaluate(tokens, { units, ...(trusted ? {} : { resolveValue }), resolveReference(rowId) {
        const index = indexes.get(rowId);
        if (index === undefined || index >= rowIndex) throw new Error('参照できるのは前の式だけです。');
        const record = evaluateRow(index);
        if (!record.declared || record.expression.relation) throw new Error('参照元の式に、数値の結果と単位を入力してください。');
        // Keep the source expression for structural grading, but use the student's
        // declared number for arithmetic. Never silently repair an earlier answer.
        return { ...record.expression, value: record.declared.value, dimensions: record.declared.dimensions };
      } });
    }
    // The UI deliberately stores conversion cards as plain numbers.  At grading
    // time, try only the conversion dimensions that this lesson permits, plus
    // the genuinely unitless interpretation.  A number is never globally
    // assigned a unit: for example 1000 may be Hz/kHz, B/KB, or KB/MB only when
    // that choice makes the complete student expression match the task's
    // dimensional expected expression.
    const unitlessConversionChoices = Object.freeze({
      '8': ['', 'bit/B'], '0.125': ['', 'B/bit'], '60': ['', 's/min'],
      '0.001': ['', 'KB/B', 'MB/KB'],
      '1000': ['', 'Hz/kHz', 'B/KB', 'KB/MB', 'B/KiB', 'KiB/MiB'],
      '1024': ['', 'B/KB', 'KB/MB', 'B/KiB', 'KiB/MiB'],
      '1000000': ['', 'B/MB'], '1048576': ['', 'B/MB']
    });
    // Current sound problems peak at 300 alternatives (kHz, 分秒, and two
    // 1024 conversions).  Keep a bounded search comfortably above that case.
    const MAX_UNITLESS_VARIANTS = 1024;
    function choicesForValue(token) {
      if (token.kind !== 'value' || (token.unit || '')) return [token];
      const normalized = String(Formula.normalizeNumber(token.value));
      const choices = unitlessConversionChoices[normalized];
      return choices ? choices.map(unitId => ({ ...token, unit: unitId })) : [token];
    }
    function combineVariants(parts) {
      return parts.reduce((all, options) => {
        if (all.length * options.length > MAX_UNITLESS_VARIANTS) throw new Error('換算値の候補が多すぎます。式を途中式に分けて確認してください。');
        return all.flatMap(prefix => options.map(option => prefix.concat([option])));
      }, [[]]);
    }
    function tokenVariants(token) {
      if (Array.isArray(token)) return combineVariants(token.map(tokenVariants));
      if (token.kind === 'value') return choicesForValue(token);
      if (token.kind === 'group') return tokenVariants(token.body).map(body => ({ ...token, body }));
      if (token.kind === 'fraction') return combineVariants([tokenVariants(token.numerator), tokenVariants(token.denominator)]).map(([numerator, denominator]) => ({ ...token, numerator, denominator }));
      if (token.kind === 'power') {
        const ordinary = combineVariants([tokenVariants(token.base), tokenVariants(token.exponent)]).map(([base, exponent]) => ({ ...token, base, exponent }));
        // Keep the student's visible 1000²/1024² structure intact, while
        // evaluating an additional dimensional interpretation for a permitted
        // B→MB conversion.  The temporary value is never written into draft.
        const base = token.base?.length === 1 && token.base[0];
        const exponent = token.exponent?.length === 1 && token.exponent[0];
        const n = base?.kind === 'value' && exponent?.kind === 'value' && !(base.unit || '') && !(exponent.unit || '')
          ? Formula.normalizeNumber(base.value) ** Formula.normalizeNumber(exponent.value) : NaN;
        if (n === 1000000 || n === 1048576) ordinary.push({ kind: 'value', value: String(n), unit: 'B/MB' });
        return ordinary;
      }
      return [token];
    }
    function evaluateVariants(tokens, rowIndex) {
      // Check token count, nesting, and grammar once before expanding the
      // permitted unit interpretations.  Invalid input must not trigger a
      // large number of repeated evaluator calls.
      Formula.parse(tokens);
      const results = [];
      let error = null;
      tokenVariants(tokens).forEach(candidate => {
        try { results.push({ tokens: candidate, result: evaluate(candidate, rowIndex) }); } catch (caught) { error = caught; }
      });
      if (!results.length) throw error || new Error('式を確認してください。');
      return results;
    }
    function evaluateRow(index) {
      const row = rows[index];
      if (records.has(row.id)) return records.get(row.id);
      if (!Array.isArray(row.tokens) || row.tokens.length === 0) throw new Error(`式${index + 1}を組み立ててください。`);
      const declaredInput = String(row.result ?? '').trim() ? evaluate([value(row.result, row.resultUnit || '')], index, true) : null;
      const candidates = evaluateVariants(row.tokens, index).map(({ result: expressionResult }) => {
        const relation = expressionResult.relation;
        const equality = relation && relation.operators.every(operator => operator === '=');
        const expression = equality ? relation.operands[0] : expressionResult;
        const declared = equality ? relation.operands.at(-1) : declaredInput;
        const calculationCorrect = equality
          ? relation.truths.every(Boolean) && (!declared || close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions))
          : declared ? close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions) : null;
        return { expression, declared, equality, relation, calculationCorrect, original: expressionResult, index };
      });
      // A declared intermediate result selects the dimensional interpretation
      // that actually agrees with it.  This is not a numerical-answer waiver.
      const record = candidates.find(candidate => candidate.calculationCorrect === true) || candidates[0];
      records.set(row.id, record);
      result.rows.push({ id: row.id, calculationCorrect: record.calculationCorrect,
        message: record.calculationCorrect === false ? `式${index + 1}：入力した結果またはその単位を確認してください。` : record.calculationCorrect === true ? `式${index + 1}：この式の計算結果は合っています。` : '' });
      return record;
    }
    function structural(actual, expected) {
      return !actual.relation && sameDimensions(actual.dimensions, expected.dimensions) && Formula.equivalent(actual.symbolic, expected.symbolic);
    }
    function formulaExpression(result) {
      const relation = result.relation;
      return relation && relation.operators.every(operator => operator === '=') ? relation.operands[0] : result;
    }
    function minimumBits(task, index) {
      const n = task.expected;
      const low = evaluate([power([value(2)], [value(n - 1)])], index, true);
      const high = evaluate([power([value(2)], [value(n)])], index, true);
      const count = evaluate([value(task.levels, 'levels', 'levels')], index, true);
      let lower = false;
      let upper = false;
      function hasPower(expression, rowIndex) {
        if (!expression) return false;
        if (expression.type === 'power') return true;
        if (expression.type === 'reference') {
          const previous = indexes.get(expression.rowId);
          if (previous === undefined || previous >= rowIndex) return false;
          const original = Formula.parse(rows[previous].tokens);
          return hasPower(original.type === 'relation' ? original.expressions[0] : original, previous);
        }
        return ['body', 'operand', 'left', 'right', 'numerator', 'denominator'].some(key => hasPower(expression[key], rowIndex));
      }
      // Accept a bounding chain or separate comparisons with the given levels.
      // Two isolated powers do not explain which one is sufficient for this
      // problem. An exact power equality also proves the smallest bit count.
      for (let i = 0; i <= index; i += 1) {
        if (!rows[i].tokens.length) continue;
        const record = evaluateRow(i);
        const relation = record.relation;
        if (!relation) continue;
        const expressions = Formula.parse(rows[i].tokens).expressions;
        relation.operators.forEach((operator, j) => {
          const a = relation.operands[j];
          const b = relation.operands[j + 1];
          const aPower = hasPower(expressions[j], i);
          const bPower = hasPower(expressions[j + 1], i);
          if ((operator === '<' && aPower && structural(a, low) && structural(b, count)) || (operator === '>' && bPower && structural(a, count) && structural(b, low))) lower = true;
          if ((operator === '<=' && bPower && structural(a, count) && structural(b, high)) || (operator === '>=' && aPower && structural(a, high) && structural(b, count))) upper = true;
          if (operator === '=' && task.levels === 2 ** n && ((aPower && structural(a, high) && structural(b, count)) || (bPower && structural(a, count) && structural(b, high)))) lower = upper = true;
        });
      }
      return lower && upper;
    }
    const requestedTaskId = options.taskId == null ? null : String(options.taskId);
    const requestedRowId = options.rowId == null ? null : String(options.rowId);
    let selectedTasks = definition.tasks;
    try {
      if (!rows.length || rows.length > 16 || indexes.size !== rows.length) throw new Error('式の行を確認してください。');
      if (requestedRowId != null) {
        const index = indexes.get(requestedRowId);
        if (index === undefined) throw new Error('確認する途中式が見つかりません。');
        const record = evaluateRow(index);
        if (record.calculationCorrect == null) throw new Error(`式${index + 1}の結果と単位を入力してください。`);
        result.status = 'checked';
        return result;
      }
      if (requestedTaskId != null) {
        selectedTasks = definition.tasks.filter(task => String(task.id) === requestedTaskId);
        if (!selectedTasks.length) throw new Error('確認する小問が見つかりません。');
      }
      for (const task of selectedTasks) {
        const index = indexes.get(draft.targets?.[task.id]);
        if (index === undefined) throw new Error(`${task.label}に使う式を選んでください。`);
        const record = evaluateRow(index);
        const answer = Formula.normalizeNumber(draft.answers?.[task.id] ?? '');
        const formulaCorrect = task.rule === 'minimum-bits'
          ? minimumBits(task, index)
          : (() => {
            const expected = evaluate(task.legacyExpectedTokens || task.expectedTokens, index, false);
            return evaluateVariants(rows[index].tokens, index).some(candidate => structural(formulaExpression(candidate.result), expected));
          })();
        const answerCorrect = close(answer, task.expected, task.tolerance);
        const messages = [];
        if (!formulaCorrect) {
          const expected = task.rule === 'minimum-bits' ? null : evaluate(task.legacyExpectedTokens || task.expectedTokens, index, false);
          if (expected && !sameDimensions(record.expression.dimensions, expected.dimensions)) {
            messages.push('式の単位が答えの単位と一致していません。換算の向き（掛ける・割る）と、各値に付けた単位を確認してください。');
          } else if (task.rule === 'minimum-bits') {
            messages.push('問題の段階数を含む比較式で、このビット数では足りて、その一つ前では足りないことを示してください。');
          } else {
            messages.push('問題の数量を使った元の式と換算値を確認してください。計算済みの数値を使う場合は、元の式を残して参照します。');
          }
        }
        const arithmeticErrors = result.rows.filter(row => row.calculationCorrect === false);
        if (formulaCorrect && arithmeticErrors.length) messages.push('立式の組み方は合っています。途中式の手入力結果を見直してください。後の式では、その入力値をそのまま使っています。');
        if (!answerCorrect) messages.push('最終回答を見直してください。指定の単位と丸め方も確認しましょう。');
        if (formulaCorrect && answerCorrect && !arithmeticErrors.length) messages.push('元の数量・演算・単位と、答えが合っています。');
        result.tasks.push({ id: task.id, formulaCorrect, answerCorrect, messages });
      }
      // A student must not be able to hide a started working line by selecting
      // another final line for the same question.  Other questions remain
      // independent, and blank placeholders remain harmless.
      if (requestedTaskId != null) {
        rows.forEach((row, index) => {
          if (String(row.taskId) === requestedTaskId && row.tokens.length) evaluateRow(index);
        });
      }
      // All-question grading retains the previous strict behavior.  Scoped
      // grading deliberately leaves unrelated unfinished rows alone.
      if (requestedTaskId == null) rows.forEach((row, index) => { if (row.tokens.length) evaluateRow(index); });
      result.status = 'judged';
      result.formulaCorrect = result.tasks.every(task => task.formulaCorrect);
      result.answerCorrect = result.tasks.every(task => task.answerCorrect);
    } catch (error) {
      errors.push(error.message || '式と入力欄を確認してください。');
      // Keep a scoped error beside its question rather than only at the bottom
      // of the builder.  No expected value is exposed here.
      result.tasks = requestedTaskId == null ? [] : [{ id: requestedTaskId, messages: [errors[0]] }];
      result.message = `まだ判定していません。${errors.join(' ')}`;
    }
    return result;
  }
  function gradeRow(definition, draft, rowId) {
    return grade(definition, draft, { rowId });
  }
  return Object.freeze({ define, grade, gradeRow });
});
