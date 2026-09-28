// 座学用の式組立・採点基盤。DOMや教材固有の数値には依存しない。
// AST: { type:'value'|'reference'|'unary'|'binary'|'fraction'|'power', ... }
// 関係式は { type:'relation', operators:['=','<',...], expressions:[AST,...] }。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.LessonFormulaCore = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const MAX_TOKENS = 250;
  const MAX_DEPTH = 32;
  const MAX_TEXT = 100;
  const MAX_INTEGER_EXPONENT = 64;
  const MAX_POLYNOMIAL_TERMS = 256;
  const MAX_POLYNOMIAL_MULTIPLICATIONS = 4096;
  const RELATIONS = new Set(['=', '<', '<=', '>', '>=']);
  const ADDITIVE = new Set(['+', '-']);
  const MULTIPLICATIVE = new Set(['×', '÷']);

  class FormulaError extends Error {
    constructor(code, message, detail) {
      super(message);
      this.name = 'FormulaError';
      this.code = code;
      if (detail !== undefined) this.detail = detail;
    }
  }

  function fail(code, message, detail) { throw new FormulaError(code, message, detail); }

  function normalizeNumber(text) {
    if (typeof text !== 'string' && typeof text !== 'number') fail('NUMBER', '数値を入力してください。');
    const source = String(text).normalize('NFKC').trim();
    if (!source || source.length > MAX_TEXT) fail('NUMBER', '数値の形式が正しくありません。');
    const normalized = source.replace(/[,_\s]/g, '');
    if (!/^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(normalized)) {
      fail('NUMBER', '数値の形式が正しくありません。');
    }
    const value = Number(normalized);
    if (!Number.isFinite(value)) fail('NUMBER', '有限の数値を入力してください。');
    return value;
  }

  function tokenList(tokens, where, depth) {
    if (!Array.isArray(tokens)) fail('TOKEN', `${where}はトークン配列で指定してください。`);
    if (tokens.length === 0) fail('INCOMPLETE', `${where}が空です。`);
    if (tokens.length > MAX_TOKENS) fail('LIMIT', 'トークン数が上限を超えています。');
    if (depth > MAX_DEPTH) fail('LIMIT', '式の入れ子が深すぎます。');
  }

  function countAllTokens(tokens, depth = 0) {
    if (!Array.isArray(tokens)) return 0;
    if (depth > MAX_DEPTH) fail('LIMIT', '式の入れ子が深すぎます。');
    let count = tokens.length;
    tokens.forEach(token => {
      if (!token || typeof token !== 'object') return;
      if (token.kind === 'fraction') count += countAllTokens(token.numerator, depth + 1) + countAllTokens(token.denominator, depth + 1);
      if (token.kind === 'power') count += countAllTokens(token.base, depth + 1) + countAllTokens(token.exponent, depth + 1);
      if (token.kind === 'group') count += countAllTokens(token.body, depth + 1);
    });
    if (count > MAX_TOKENS) fail('LIMIT', 'トークン数が上限を超えています。');
    return count;
  }

  function validateToken(token, depth) {
    if (!token || typeof token !== 'object' || typeof token.kind !== 'string') fail('TOKEN', '不正なトークンです。');
    if (token.kind === 'value') {
      normalizeNumber(token.value);
      if (token.unit != null && typeof token.unit !== 'string') fail('UNIT', '単位IDが正しくありません。');
      if (token.symbol != null && (typeof token.symbol !== 'string' || !token.symbol.trim())) fail('SYMBOL', '記号が正しくありません。');
      return;
    }
    if (token.kind === 'operator') {
      if (!['+', '-', '×', '÷', '=', '<', '<=', '>', '>=', '(', ')'].includes(token.value)) fail('OPERATOR', '使用できない演算子です。');
      return;
    }
    if (token.kind === 'reference') {
      if (typeof token.rowId !== 'string' || !token.rowId) fail('REFERENCE', '参照先が正しくありません。');
      return;
    }
    if (token.kind === 'fraction' || token.kind === 'power') {
      const a = token.kind === 'fraction' ? 'numerator' : 'base';
      const b = token.kind === 'fraction' ? 'denominator' : 'exponent';
      const labelA = token.kind === 'fraction' ? '分子' : '底';
      const labelB = token.kind === 'fraction' ? '分母' : '指数';
      tokenList(token[a], labelA, depth + 1); tokenList(token[b], labelB, depth + 1);
      token[a].forEach(item => validateToken(item, depth + 1));
      token[b].forEach(item => validateToken(item, depth + 1));
      return;
    }
    if (token.kind === 'group') {
      tokenList(token.body, '括弧内の式', depth + 1);
      token.body.forEach(item => validateToken(item, depth + 1));
      return;
    }
    fail('TOKEN', '使用できないトークンです。');
  }

  function parse(tokens) {
    tokenList(tokens, '式', 0);
    countAllTokens(tokens);
    tokens.forEach(token => validateToken(token, 0));
    let position = 0;
    const current = () => tokens[position] || null;
    const take = () => tokens[position++];
    const isOp = value => current() && current().kind === 'operator' && current().value === value;

    function embeddedExpression(innerTokens) {
      const expression = parse(innerTokens);
      if (expression.type === 'relation') fail('SYNTAX', '関係式を分数・指数・括弧の中へ入れることはできません。');
      return expression;
    }

    function atom(token) {
      if (token.kind === 'value') return { type: 'value', token };
      if (token.kind === 'reference') return { type: 'reference', rowId: token.rowId };
      if (token.kind === 'fraction') return { type: 'fraction', numerator: embeddedExpression(token.numerator), denominator: embeddedExpression(token.denominator) };
      if (token.kind === 'power') return { type: 'power', base: embeddedExpression(token.base), exponent: embeddedExpression(token.exponent) };
      if (token.kind === 'group') return { type: 'group', body: embeddedExpression(token.body) };
      fail('INCOMPLETE', '値、参照、分数または括弧が必要です。');
    }
    function primary() {
      const item = current();
      if (!item) fail('INCOMPLETE', '式が途中で終わっています。');
      if (isOp('(')) {
        take();
        const expression = additive();
        if (!isOp(')')) fail('PAREN', '閉じ括弧が必要です。');
        take();
        return { type: 'group', body: expression };
      }
      if (item.kind === 'operator') fail('INCOMPLETE', '値、参照、分数または括弧が必要です。');
      take(); return atom(item);
    }
    function unary() {
      if (isOp('+') || isOp('-')) return { type: 'unary', operator: take().value, operand: unary() };
      return primary();
    }
    function multiplicative() {
      let left = unary();
      while (current() && current().kind === 'operator' && MULTIPLICATIVE.has(current().value)) {
        const operator = take().value;
        left = { type: 'binary', operator, left, right: unary() };
      }
      return left;
    }
    function additive() {
      let left = multiplicative();
      while (current() && current().kind === 'operator' && ADDITIVE.has(current().value)) {
        const operator = take().value;
        left = { type: 'binary', operator, left, right: multiplicative() };
      }
      return left;
    }

    const expressions = [additive()];
    const operators = [];
    while (current() && current().kind === 'operator' && RELATIONS.has(current().value)) {
      operators.push(take().value); expressions.push(additive());
    }
    if (current()) fail('SYNTAX', current().kind === 'operator' ? 'この位置の演算子は使えません。' : '演算子が必要です。');
    return operators.length ? { type: 'relation', operators, expressions } : expressions[0];
  }

  function formatTokens(tokens) {
    tokenList(tokens, '式', 0);
    countAllTokens(tokens);
    return tokens.map(token => {
      validateToken(token, 0);
      if (token.kind === 'value') return `${String(token.value)}${token.unit ? ` ${token.unit}` : ''}`;
      if (token.kind === 'operator') return token.value;
      if (token.kind === 'reference') return `［${token.rowId}］`;
      if (token.kind === 'fraction') return `(${formatTokens(token.numerator)})／(${formatTokens(token.denominator)})`;
      if (token.kind === 'power') return `(${formatTokens(token.base)})^(${formatTokens(token.exponent)})`;
      return `(${formatTokens(token.body)})`;
    }).join(' ');
  }

  function cleanDimensions(dimensions) {
    const out = {};
    Object.keys(dimensions || {}).sort().forEach(key => {
      const exponent = dimensions[key];
      if (!Number.isInteger(exponent)) fail('UNIT', '単位の指数は整数で指定してください。');
      if (exponent) out[key] = exponent;
    });
    return out;
  }
  function sameDimensions(a, b) { return JSON.stringify(cleanDimensions(a)) === JSON.stringify(cleanDimensions(b)); }
  function combineDimensions(a, b, direction) {
    const result = { ...cleanDimensions(a) };
    Object.entries(cleanDimensions(b)).forEach(([key, exponent]) => { result[key] = (result[key] || 0) + direction * exponent; });
    return cleanDimensions(result);
  }
  function powerDimensions(dimensions, exponent) {
    const result = {};
    Object.entries(cleanDimensions(dimensions)).forEach(([key, value]) => { result[key] = value * exponent; });
    return cleanDimensions(result);
  }

  // 有理式は可換な多項式の分子・分母で正規化する。係数は Number、単項式は a^1*b^2 のキー。
  function monoKey(factors) {
    return Object.keys(factors).filter(key => factors[key]).sort().map(key => `${encodeURIComponent(key)}^${factors[key]}`).join('*');
  }
  function decodeMono(key) {
    const factors = {};
    if (!key) return factors;
    key.split('*').forEach(part => { const divider = part.lastIndexOf('^'); factors[decodeURIComponent(part.slice(0, divider))] = Number(part.slice(divider + 1)); });
    return factors;
  }
  function polyConstant(value) { return new Map([[ '', value ]]); }
  function polySymbol(symbol) { return new Map([[monoKey({ [symbol]: 1 }), 1 ]]); }
  function polyClean(poly) {
    const out = new Map();
    poly.forEach((value, key) => { if (value !== 0) out.set(key, value); });
    if (out.size > MAX_POLYNOMIAL_TERMS) fail('LIMIT', '式の多項式が複雑すぎます。');
    return out.size ? out : new Map([[ '', 0 ]]);
  }
  function polyAdd(a, b, sign) {
    const out = new Map(a); b.forEach((value, key) => out.set(key, (out.get(key) || 0) + sign * value)); return polyClean(out);
  }
  function polyMultiply(a, b) {
    if (a.size * b.size > MAX_POLYNOMIAL_MULTIPLICATIONS) fail('LIMIT', '式の多項式が複雑すぎます。');
    const out = new Map();
    a.forEach((av, ak) => b.forEach((bv, bk) => {
      const factors = decodeMono(ak); Object.entries(decodeMono(bk)).forEach(([key, exp]) => { factors[key] = (factors[key] || 0) + exp; });
      const key = monoKey(factors); out.set(key, (out.get(key) || 0) + av * bv);
      if (out.size > MAX_POLYNOMIAL_TERMS) fail('LIMIT', '式の多項式が複雑すぎます。');
    })); return polyClean(out);
  }
  function polyPower(poly, exponent) {
    if (exponent < 0 || !Number.isInteger(exponent)) fail('EXPONENT', '有理式の指数は0以上の整数にしてください。');
    let out = polyConstant(1); for (let i = 0; i < exponent; i += 1) out = polyMultiply(out, poly); return out;
  }
  function polyEntries(poly) { return [...poly.entries()].filter(([, coefficient]) => coefficient).sort(([a], [b]) => a.localeCompare(b)).map(([key, coefficient]) => ({ coefficient, factors: decodeMono(key) })); }
  function rational(numerator, denominator) { return { kind: 'rational-internal', numerator: polyClean(numerator), denominator: polyClean(denominator) }; }
  function rationalConstant(value) { return rational(polyConstant(value), polyConstant(1)); }
  function rationalSymbol(symbol) { return rational(polySymbol(symbol), polyConstant(1)); }
  function rationalAdd(a, b, sign) { return rational(polyAdd(polyMultiply(a.numerator, b.denominator), polyMultiply(b.numerator, a.denominator), sign), polyMultiply(a.denominator, b.denominator)); }
  function rationalMultiply(a, b) { return rational(polyMultiply(a.numerator, b.numerator), polyMultiply(a.denominator, b.denominator)); }
  function rationalDivide(a, b) {
    if (polyEntries(b.numerator).length === 1 && polyEntries(b.numerator)[0].coefficient === 0) fail('DIVISION_BY_ZERO', '0で割ることはできません。');
    return rational(polyMultiply(a.numerator, b.denominator), polyMultiply(a.denominator, b.numerator));
  }
  function rationalPower(value, exponent) {
    if (!Number.isInteger(exponent)) return null;
    return exponent >= 0 ? rational(polyPower(value.numerator, exponent), polyPower(value.denominator, exponent)) : rational(polyPower(value.denominator, -exponent), polyPower(value.numerator, -exponent));
  }
  function isRational(value) { return value && value.kind === 'rational-internal'; }
  function rationalConstantValue(value) {
    if (!isRational(value)) return null;
    if (value.numerator.size !== 1 || value.denominator.size !== 1 || !value.numerator.has('') || !value.denominator.has('')) return null;
    const denominator = value.denominator.get('');
    if (denominator === 0) return null;
    return value.numerator.get('') / denominator;
  }
  function isRationalIdentity(value, identity) {
    const constant = rationalConstantValue(value);
    return constant !== null && sameNumericValue(constant, identity);
  }
  function symbolicBinary(operator, left, right) {
    // 非有理の指数式も、単位元との演算だけは有理式と同じ正規化を行う。
    // 数値だけを見て別の式を同一視するための規則ではない。
    if (operator === '+' && isRationalIdentity(right, 0)) return left;
    if (operator === '+' && isRationalIdentity(left, 0)) return right;
    if (operator === '-' && isRationalIdentity(right, 0)) return left;
    if (operator === '×' && isRationalIdentity(right, 1)) return left;
    if (operator === '×' && isRationalIdentity(left, 1)) return right;
    if (operator === '÷' && isRationalIdentity(right, 1)) return left;
    if (isRational(left) && isRational(right)) {
      if (operator === '+') return rationalAdd(left, right, 1);
      if (operator === '-') return rationalAdd(left, right, -1);
      if (operator === '×') return rationalMultiply(left, right);
      if (operator === '÷') return rationalDivide(left, right);
    }
    const commutative = operator === '+' || operator === '×';
    const ordered = commutative && symbolicKey(left) > symbolicKey(right) ? [right, left] : [left, right];
    return { kind: 'binary-internal', operator, left: ordered[0], right: ordered[1], leftKey: symbolicKey(ordered[0]), rightKey: symbolicKey(ordered[1]) };
  }
  function serializeSymbolic(value) {
    if (value.kind === 'rational-internal') {
      const numerator = polyEntries(value.numerator); const denominator = polyEntries(value.denominator);
      return { kind: 'rational', numerator, denominator, key: JSON.stringify({ numerator, denominator }) };
    }
    if (value.kind === 'power-internal') return { kind: 'power', base: serializeSymbolic(value.base), exponent: serializeSymbolic(value.exponent), key: `power(${value.baseKey},${value.exponentKey})` };
    return { kind: 'binary', operator: value.operator, left: serializeSymbolic(value.left), right: serializeSymbolic(value.right), key: `binary(${value.operator},${value.leftKey},${value.rightKey})` };
  }
  function deserializeSymbolic(value) {
    if (!value || typeof value !== 'object') return null;
    if (value.kind === 'rational' && Array.isArray(value.numerator) && Array.isArray(value.denominator)) {
      const toPoly = entries => new Map(entries.map(item => [monoKey(item.factors || {}), item.coefficient]));
      return rational(toPoly(value.numerator), toPoly(value.denominator));
    }
    if (value.kind === 'power') {
      const base = deserializeSymbolic(value.base); const exponent = deserializeSymbolic(value.exponent);
      if (!base || !exponent) return null;
      return { kind: 'power-internal', base, exponent, baseKey: symbolicKey(base), exponentKey: symbolicKey(exponent) };
    }
    if (value.kind === 'binary') {
      const left = deserializeSymbolic(value.left); const right = deserializeSymbolic(value.right);
      if (!left || !right || !['+', '-', '×', '÷'].includes(value.operator)) return null;
      return symbolicBinary(value.operator, left, right);
    }
    return null;
  }
  function symbolicKey(value) {
    if (value.kind === 'rational-internal') return serializeSymbolic(value).key;
    if (value.kind === 'power-internal') return `power(${value.baseKey},${value.exponentKey})`;
    if (value.kind === 'binary-internal') return `binary(${value.operator},${value.leftKey},${value.rightKey})`;
    fail('SYMBOLIC', '式構造を正規化できません。');
  }
  function symbolicEquivalent(a, b) {
    const left = a && a.symbolic ? a.symbolic : a; const right = b && b.symbolic ? b.symbolic : b;
    if (!left || !right || left.kind !== right.kind) return false;
    if (left.kind === 'rational') {
      // a/b = c/d は分子を交差乗算して判定する。
      const toPoly = entries => new Map(entries.map(item => [monoKey(item.factors), item.coefficient]));
      const crossA = polyMultiply(toPoly(left.numerator), toPoly(right.denominator));
      const crossB = polyMultiply(toPoly(right.numerator), toPoly(left.denominator));
      if (crossA.size !== crossB.size) return false;
      for (const [key, coefficient] of crossA) {
        if (!crossB.has(key) || !sameNumericValue(coefficient, crossB.get(key))) return false;
      }
      return true;
    }
    return left.key === right.key;
  }

  function ensureFinite(value) { if (!Number.isFinite(value)) fail('EVALUATION', '計算結果が有限の値になりません。'); return value; }
  function sameNumericValue(left, right) {
    // 表示用の丸めではなく、IEEE 754の演算誤差だけを許容する。
    return Math.abs(left - right) <= Number.EPSILON * 16 * Math.max(1, Math.abs(left), Math.abs(right));
  }
  function evalAst(ast, options) {
    if (ast.type === 'relation') return evalRelation(ast, options);
    if (ast.type === 'group') return evalAst(ast.body, options);
    if (ast.type === 'reference') {
      if (typeof options.resolveReference !== 'function') fail('REFERENCE', `参照「${ast.rowId}」を解決できません。`);
      const resolved = options.resolveReference(ast.rowId);
      if (!resolved) fail('REFERENCE', `参照先「${ast.rowId}」がありません。`);
      const value = resolved.relation ? null : resolved;
      if (!value || typeof value.value !== 'number' || !value.dimensions || !value.symbolic) fail('REFERENCE', `参照先「${ast.rowId}」の値が正しくありません。`);
      const inherited = value._symbolicInternal || deserializeSymbolic(value.symbolic);
      if (!inherited) fail('REFERENCE', `参照先「${ast.rowId}」の式情報が正しくありません。`);
      // valueは生徒の手入力結果へ置換できるが、symbolicは元の立式を引き継ぐ。
      return { value: ensureFinite(value.value), dimensions: cleanDimensions(value.dimensions), symbolicInternal: inherited };
    }
    if (ast.type === 'value') {
      let token = ast.token;
      if (typeof options.resolveValue === 'function') {
        const resolved = options.resolveValue(token);
        if (resolved !== undefined && resolved !== null) token = typeof resolved === 'number' ? { ...token, value: String(resolved) } : resolved;
      }
      validateToken(token, 0);
      const unit = token.unit || '';
      const unitInfo = unit ? options.units[unit] : { dimensions: {} };
      if (!unitInfo || !unitInfo.dimensions) fail('UNIT', `単位「${unit}」は定義されていません。`);
      const symbolicInternal = token.symbol ? rationalSymbol(token.symbol) : rationalConstant(normalizeNumber(token.value));
      return { value: normalizeNumber(token.value), dimensions: cleanDimensions(unitInfo.dimensions), symbolicInternal };
    }
    if (ast.type === 'unary') {
      const operand = evalAst(ast.operand, options);
      if (ast.operator === '+') return operand;
      return { ...operand, value: -operand.value, symbolicInternal: symbolicBinary('×', rationalConstant(-1), operand.symbolicInternal) };
    }
    if (ast.type === 'fraction') return calculate('÷', evalAst(ast.numerator, options), evalAst(ast.denominator, options));
    if (ast.type === 'binary') return calculate(ast.operator, evalAst(ast.left, options), evalAst(ast.right, options));
    if (ast.type === 'power') {
      const base = evalAst(ast.base, options); const exponent = evalAst(ast.exponent, options);
      if (!sameDimensions(exponent.dimensions, {})) fail('UNIT_MISMATCH', '指数には単位を付けられません。');
      const exponentIsConstant = exponent.symbolicInternal.kind === 'rational-internal' && polyEntries(exponent.symbolicInternal.numerator).length === 1 && polyEntries(exponent.symbolicInternal.denominator).length === 1 && !Object.keys(polyEntries(exponent.symbolicInternal.numerator)[0].factors).length && !Object.keys(polyEntries(exponent.symbolicInternal.denominator)[0].factors).length;
      if (!Number.isInteger(exponent.value) && !sameDimensions(base.dimensions, {})) fail('EXPONENT', '単位を持つ量の指数は整数にしてください。');
      if (Number.isInteger(exponent.value) && Math.abs(exponent.value) > MAX_INTEGER_EXPONENT) {
        fail('LIMIT', `整数の指数は${MAX_INTEGER_EXPONENT}以下にしてください。`);
      }
      const internal = exponentIsConstant && isRational(base.symbolicInternal) ? rationalPower(base.symbolicInternal, exponent.value) : null;
      const symbolicInternal = internal || { kind: 'power-internal', base: base.symbolicInternal, exponent: exponent.symbolicInternal, baseKey: symbolicKey(base.symbolicInternal), exponentKey: symbolicKey(exponent.symbolicInternal) };
      return { value: ensureFinite(base.value ** exponent.value), dimensions: Number.isInteger(exponent.value) ? powerDimensions(base.dimensions, exponent.value) : {}, symbolicInternal };
    }
    fail('AST', '評価できない式です。');
  }
  function calculate(operator, left, right) {
    if (operator === '+' || operator === '-') {
      if (!sameDimensions(left.dimensions, right.dimensions)) fail('UNIT_MISMATCH', '加減算する量の単位が一致しません。');
      return { value: ensureFinite(operator === '+' ? left.value + right.value : left.value - right.value), dimensions: left.dimensions, symbolicInternal: symbolicBinary(operator, left.symbolicInternal, right.symbolicInternal) };
    }
    if (operator === '÷' && right.value === 0) fail('DIVISION_BY_ZERO', '0で割ることはできません。');
    return { value: ensureFinite(operator === '×' ? left.value * right.value : left.value / right.value), dimensions: combineDimensions(left.dimensions, right.dimensions, operator === '×' ? 1 : -1), symbolicInternal: symbolicBinary(operator, left.symbolicInternal, right.symbolicInternal) };
  }
  function evalRelation(ast, options) {
    const expressions = ast.expressions.map(expression => evalAst(expression, options));
    const comparisons = ast.operators.map((operator, index) => {
      const left = expressions[index]; const right = expressions[index + 1];
      if (!sameDimensions(left.dimensions, right.dimensions)) fail('UNIT_MISMATCH', '比較する量の単位が一致しません。');
      const truth = operator === '=' ? sameNumericValue(left.value, right.value) : ({ '<': left.value < right.value, '<=': left.value <= right.value, '>': left.value > right.value, '>=': left.value >= right.value })[operator];
      return { operator, truth, left: publicResult(left), right: publicResult(right) };
    });
    const truths = comparisons.map(item => item.truth);
    return {
      value: truths.every(Boolean),
      dimensions: {},
      symbolicInternal: rationalConstant(truths.every(Boolean) ? 1 : 0),
      relation: { operators: ast.operators.slice(), operands: expressions.map(publicResult), truths, comparisons }
    };
  }
  function publicResult(result) { return { value: result.value, dimensions: cleanDimensions(result.dimensions), symbolic: serializeSymbolic(result.symbolicInternal) }; }
  function evaluate(tokens, settings) {
    const options = settings || {};
    if (!options.units || typeof options.units !== 'object') options.units = {};
    const result = evalAst(parse(tokens), options);
    const output = publicResult(result);
    if (result.relation) output.relation = result.relation;
    Object.defineProperty(output, '_symbolicInternal', { value: result.symbolicInternal, enumerable: false });
    return output;
  }

  return Object.freeze({ FormulaError, MAX_TOKENS, MAX_INTEGER_EXPONENT, MAX_POLYNOMIAL_TERMS, parse, normalizeNumber, formatTokens, evaluate, equivalent: symbolicEquivalent });
});
