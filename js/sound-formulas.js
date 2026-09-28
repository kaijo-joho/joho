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
  const unit = (label, dimensions) => ({ label, dimensions });
  // bit/B/KB/MB are deliberately independent bases: wrong conversion direction
  // must not disappear through automatic unit conversion. Counts are dimensionless.
  const UNITS = Object.freeze({
    '': unit('単位なし', {}), s: unit('秒', { s: 1 }), min: unit('分', { min: 1 }),
    Hz: unit('回/秒（Hz）', { s: -1 }), kHz: unit('kHz', { kHz: 1 }),
    'Hz/kHz': unit('Hz/kHz', { s: -1, kHz: -1 }), 's/min': unit('秒/分', { s: 1, min: -1 }),
    bit: unit('bit', { bit: 1 }), 'bit/sample': unit('bit/回', { bit: 1 }),
    bitCount: unit('bit（桁数）', {}), levels: unit('段階', {}), channel: unit('チャンネル', {}),
    B: unit('B', { B: 1 }), 'B/sample': unit('B/回', { B: 1 }),
    KB: unit('KB', { KB: 1 }), MB: unit('MB', { MB: 1 }),
    KiB: unit('KiB', { KiB: 1 }), MiB: unit('MiB', { MiB: 1 }),
    'B/s': unit('B/秒', { B: 1, s: -1 }), 'KB/s': unit('KB/秒', { KB: 1, s: -1 }),
    'bit/B': unit('bit/B', { bit: 1, B: -1 }), 'B/bit': unit('B/bit', { B: 1, bit: -1 }),
    'B/KB': unit('B/KB', { B: 1, KB: -1 }), 'KB/B': unit('KB/B', { KB: 1, B: -1 }),
    'KB/MB': unit('KB/MB', { KB: 1, MB: -1 }), 'MB/KB': unit('MB/KB', { MB: 1, KB: -1 }),
    'B/MB': unit('B/MB', { B: 1, MB: -1 }),
    'B/KiB': unit('B/KiB', { B: 1, KiB: -1 }), 'KiB/MiB': unit('KiB/MiB', { KiB: 1, MiB: -1 })
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
      const bytes = constant('bit-byte', 'bitからBへ', 8, 'bit/B');
      constant('byte-bit', 'B/bitで表す換算値（1/8）', 0.125, 'B/bit');
      const base = p.base ?? 1000;
      const binaryName = (problem.answerUnit || p.answerUnit || '').includes('i');
      const k = binaryName ? 'KiB' : 'KB';
      const m = binaryName ? 'MiB' : 'MB';
      for (const n of [1000, 1024]) {
        constant(`byte-kilo-${n}`, 'Bからキロ単位へ', n, `B/${k}`);
        constant(`kilo-mega-${n}`, 'キロからメガ単位へ', n, `${k}/${m}`);
      }
      constant('minute-second', '分から秒へ', 60, 's/min');
      constant('kilo-hertz', 'kHzからHzへ', 1000, 'Hz/kHz');
      const normalizedRate = kilo ? group([rate, op('×'), value(1000, 'Hz/kHz')]) : rate;
      const sample = [bits, op('×'), channels, op('÷'), bytes];
      if (example) {
        const size = Sound.audioDataSize({ sampleRate: 1, seconds: 1, bitDepth: p.bitDepth, channels: p.channels });
        task('sample', '(1) 1回の標本化で生じるデータ量', 'B', size.bytes, sample);
        const second = Sound.audioDataSize({ ...p, seconds: 1 });
        task('second', '(2) 1秒あたりのデータ量', 'KB/s', Sound.convertBytes(second.bytes, 'KB', 1000), [...sample, op('×'), normalizedRate, op('÷'), value(1000, 'B/KB')]);
      } else {
        let duration;
        if (p.durationParts) {
          const minute = source('minutes', '録音時間（分の部分）', p.durationParts.minutes, 'min');
          const second = source('seconds', '録音時間（秒の部分）', p.durationParts.seconds, 's');
          duration = group([minute, op('×'), value(60, 's/min'), op('+'), second]);
        } else duration = source('duration', '録音時間', p.seconds, 's');
        const expression = [normalizedRate, op('×'), duration, op('×'), ...sample];
        const targetUnit = problem.answerUnit || p.answerUnit;
        if ([k, m].includes(targetUnit)) expression.push(op('÷'), value(base, `B/${k}`));
        if (targetUnit === m) expression.push(op('÷'), value(base, `${k}/${m}`));
        const size = Sound.audioDataSize(p);
        const expected = targetUnit === 'B' ? size.bytes : Sound.convertBytes(size.bytes, targetUnit, base);
        task('answer', '音声データ量', targetUnit, expected, expression);
      }
    } else throw new TypeError('この問題には式の組み立てを設定していません。');
    return definition;
  }

  function grade(definition, draft) {
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
    function evaluateRow(index) {
      const row = rows[index];
      if (records.has(row.id)) return records.get(row.id);
      if (!Array.isArray(row.tokens) || row.tokens.length === 0) throw new Error(`式${index + 1}を組み立ててください。`);
      const expressionResult = evaluate(row.tokens, index);
      const relation = expressionResult.relation;
      const equality = relation && relation.operators.every(operator => operator === '=');
      const expression = equality ? relation.operands[0] : expressionResult;
      let declared = equality ? relation.operands.at(-1) : null;
      if (String(row.result ?? '').trim()) declared = evaluate([value(row.result, row.resultUnit || '')], index, true);
      const calculationCorrect = equality
        ? relation.truths.every(Boolean) && (!declared || close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions))
        : declared ? close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions) : null;
      const record = { expression, declared, equality, relation, calculationCorrect, original: expressionResult, index };
      records.set(row.id, record);
      result.rows.push({ id: row.id, calculationCorrect,
        message: calculationCorrect === false ? `式${index + 1}：入力した結果またはその単位を確認してください。` : calculationCorrect === true ? `式${index + 1}：この式の計算結果は合っています。` : '' });
      return record;
    }
    function structural(actual, expected) {
      return !actual.relation && sameDimensions(actual.dimensions, expected.dimensions) && Formula.equivalent(actual.symbolic, expected.symbolic);
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
    try {
      if (!rows.length || rows.length > 16 || indexes.size !== rows.length) throw new Error('式の行を確認してください。');
      for (const task of definition.tasks) {
        const index = indexes.get(draft.targets?.[task.id]);
        if (index === undefined) throw new Error(`${task.label}に使う式を選んでください。`);
        const record = evaluateRow(index);
        const answer = Formula.normalizeNumber(draft.answers?.[task.id] ?? '');
        const formulaCorrect = task.rule === 'minimum-bits'
          ? minimumBits(task, index)
          : structural(record.expression, evaluate(task.expectedTokens, index, true));
        const answerCorrect = close(answer, task.expected, task.tolerance);
        const messages = [];
        if (!formulaCorrect) {
          const expected = task.rule === 'minimum-bits' ? null : evaluate(task.expectedTokens, index, true);
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
      // Validate non-empty working rows too, so an invalid intermediate expression
      // cannot be hidden by selecting a different final row.
      rows.forEach((row, index) => { if (row.tokens.length) evaluateRow(index); });
      result.status = 'judged';
      result.formulaCorrect = result.tasks.every(task => task.formulaCorrect);
      result.answerCorrect = result.tasks.every(task => task.answerCorrect);
    } catch (error) {
      errors.push(error.message || '式と入力欄を確認してください。');
      result.tasks = [];
      result.message = `まだ判定していません。${errors.join(' ')}`;
    }
    return result;
  }
  return Object.freeze({ define, grade });
});
