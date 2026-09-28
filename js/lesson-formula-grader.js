// 教材共通の立式・途中計算・答えの判定。問題条件と単位は教材側が宣言する。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./lesson-formula-core.js'));
  else root.LessonFormulaGrader = factory(root.LessonFormulaCore);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Formula) {
  'use strict';
  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const group = body => ({ kind: 'group', body });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const close = (a, b, tolerance = 1e-8) => Number.isFinite(a) && Number.isFinite(b) && Math.abs(a - b) <= Math.max(tolerance, Math.abs(b) * 1e-9);
  const sameDimensions = (a, b) => [...new Set([...Object.keys(a), ...Object.keys(b)])].every(key => (a[key] || 0) === (b[key] || 0));

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
    // answerIsResult:false の比較式も、教材が明示した結論量だけは後の式へ
    // 参照できる。比較の真偽値を数値へ変換するのではなく、最小bitの根拠を
    // 確認した後に、生徒が入力した結論とその由来を投影する。
    function conclusionTaskForRow(index) {
      const row = rows[index];
      return definition.tasks.find(task => task.conclusionQuantity
        && (String(row.taskId || '') === String(task.id) || draft.targets?.[task.id] === row.id));
    }
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
        if (!record.declared) throw new Error('参照元の式に、数値の結果と単位を入力してください。');
        if (record.expression.relation) {
          const task = conclusionTaskForRow(index);
          if (!task || task.rule !== 'minimum-bits' || !task.conclusionQuantity || !minimumBits(task, index)) {
            throw new Error('参照元の比較式を完成し、左では足りず右なら足りる根拠を確認してください。');
          }
          const conclusion = task.conclusionQuantity;
          const expectedDimensions = units[conclusion.unit || '']?.dimensions;
          if (!expectedDimensions || !sameDimensions(record.declared.dimensions, expectedDimensions)) {
            throw new Error('参照する結論の単位を確認してください。');
          }
          // 構造は宣言した由来量を引き継ぎ、算術は生徒が入力した値を使う。
          // したがって14bitの誤答を参照しても、15bitへ勝手に補正しない。
          return evaluate([value(record.declared.value, conclusion.unit || '', conclusion.symbol)], rowIndex, true);
        }
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
    const unitlessConversionChoices = definition.unitlessConversionChoices || Object.freeze({
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
      const conclusionTask = conclusionTaskForRow(index);
      const candidates = evaluateVariants(row.tokens, index).map(({ result: expressionResult }) => {
        const relation = expressionResult.relation;
        const equality = relation && relation.operators.every(operator => operator === '=');
        const expression = equality ? relation.operands[0] : expressionResult;
        const declared = equality ? relation.operands.at(-1) : declaredInput;
        const conclusionDimensions = conclusionTask && units[conclusionTask.conclusionQuantity.unit || '']?.dimensions;
        const calculationCorrect = conclusionTask && relation && !equality
          ? declared ? close(declared.value, conclusionTask.expected) && sameDimensions(declared.dimensions, conclusionDimensions) : null
          : equality
          ? relation.truths.every(Boolean) && (!declared || close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions))
          : declared ? close(declared.value, expression.value) && sameDimensions(declared.dimensions, expression.dimensions) : null;
        return { expression, declared, equality, relation, calculationCorrect, original: expressionResult, index };
      });
      // A declared intermediate result selects the dimensional interpretation
      // that actually agrees with it.  This is not a numerical-answer waiver.
      const record = candidates.find(candidate => candidate.calculationCorrect === true) || candidates[0];
      records.set(row.id, record);
      result.rows.push({ id: row.id, calculationCorrect: record.calculationCorrect,
        message: record.calculationCorrect === false ? `式${index + 1}：入力した${conclusionTask ? '結論' : '結果'}またはその単位を確認してください。` : record.calculationCorrect === true ? `式${index + 1}：${conclusionTask ? '入力した結論' : 'この式の計算結果'}は合っています。` : '' });
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
      const count = evaluate([value(task.levels, task.boundUnit || 'levels', task.boundSymbol || 'levels')], index, true);
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
    function scaffoldFields(task, tokens) {
      if (task.scaffold?.type !== 'power-bounds' || tokens.length !== 5 || tokens[0]?.kind !== 'power' || tokens[4]?.kind !== 'power') return null;
      const inputs = { lower: tokens[0].exponent?.[0]?.value, bound: tokens[2]?.value, upper: tokens[4].exponent?.[0]?.value };
      const labels = { lower: '左の指数', bound: task.boundLabel || '中央の段階数・色数', upper: '右の指数' };
      const parsed = {};
      Object.entries(inputs).forEach(([key, text]) => {
        if (!String(text ?? '').trim()) throw new Error(`${labels[key]}の空欄を入力してください。`);
        parsed[key] = Formula.normalizeNumber(text);
        if (!Number.isSafeInteger(parsed[key]) || parsed[key] < (key === 'bound' ? 1 : 0)) throw new Error(`${labels[key]}には${key === 'bound' ? '1以上' : '0以上'}の整数を入力してください。`);
      });
      return { lower: parsed.lower === task.expected - 1, bound: parsed.bound === task.levels, upper: parsed.upper === task.expected };
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
        const fields = scaffoldFields(task, rows[index].tokens || []);
        const record = evaluateRow(index);
        const answer = Formula.normalizeNumber(draft.answers?.[task.id] ?? '');
        const formulaCorrect = task.rule === 'minimum-bits'
          ? minimumBits(task, index) && (!fields || Object.values(fields).every(Boolean))
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
            if (fields) {
              if (!fields.bound) messages.push('中央には、問題で指定された段階数・色数を入れてください。');
              if (!fields.lower || !fields.upper) messages.push('右は必要な最小ビット数、左はその1つ前の指数にします。左では足りず、右なら足りることを確かめましょう。');
            } else messages.push('問題の段階数を含む比較式で、このビット数では足りて、その一つ前では足りないことを示してください。');
          } else {
            messages.push('問題の数量を使った元の式と換算値を確認してください。計算済みの数値を使う場合は、元の式を残して参照します。');
          }
        }
        const arithmeticErrors = result.rows.filter(row => row.calculationCorrect === false);
        if (formulaCorrect && arithmeticErrors.length) messages.push('立式の組み方は合っています。途中式の手入力結果を見直してください。後の式では、その入力値をそのまま使っています。');
        if (!answerCorrect) messages.push('最終回答を見直してください。指定の単位と丸め方も確認しましょう。');
        if (formulaCorrect && answerCorrect && !arithmeticErrors.length) messages.push(fields ? '1つ前では足りず、このビット数なら足りることと、結論が合っています。' : '元の数量・演算・単位と、答えが合っています。');
        result.tasks.push({ id: task.id, formulaCorrect, answerCorrect, ...(fields ? { fields } : {}), messages });
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
  return Object.freeze({ grade, gradeRow });
});
