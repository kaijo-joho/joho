import assert from 'node:assert/strict';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const Core = require('../js/lesson-formula-core.js');
const v = (value, unit = '', extra = {}) => ({ kind: 'value', value: String(value), unit, ...extra });
const op = value => ({ kind: 'operator', value });
const units = {
  bit: { label: 'bit', dimensions: { bit: 1 } },
  B: { label: 'B', dimensions: { B: 1 } },
  s: { label: '秒', dimensions: { s: 1 } },
  Hz: { label: 'Hz', dimensions: { s: -1 } },
  '回/秒': { label: '回/秒', dimensions: { s: -1 } }
};
const evaluate = tokens => Core.evaluate(tokens, { units });
const expectError = (tokens, code) => assert.throws(() => evaluate(tokens), error => error instanceof Core.FormulaError && error.code === code);

assert.equal(Core.normalizeNumber(' １,２３４．５ '), 1234.5, '全角と桁区切りを数値化する');
assert.throws(() => Core.normalizeNumber(''), error => error.code === 'NUMBER');
assert.equal(evaluate([v(2), op('+'), v(3), op('×'), v(4)]).value, 14, '乗除を加減より先にする');
assert.equal(evaluate([op('('), v(2), op('+'), v(3), op(')'), op('×'), v(4)]).value, 20, '括弧を優先する');
assert.equal(evaluate([{ kind: 'fraction', numerator: [v(3)], denominator: [v(4)] }, op('+'), v(1)]).value, 1.75, '分数を評価する');
assert.equal(evaluate([op('-'), v(3), op('×'), v(2)]).value, -6, '単項マイナスを扱う');
assert.equal(evaluate([{ kind: 'power', base: [v(2)], exponent: [v(3)] }]).value, 8, '指数を評価する');
const chained = evaluate([v(1), op('<'), v(2), op('<='), v(2)]);
assert.equal(chained.value, true, '関係式チェーン全体を真偽値で返す');
assert.deepEqual(chained.relation.operators, ['<', '<='], '関係式チェーンの演算子を残す');
assert.deepEqual(chained.relation.truths, [true, true], '関係式チェーンの各比較結果を残す');
const variablePower = evaluate([{ kind: 'power', base: [v(2, '', { symbol: 'n' })], exponent: [v(3, '', { symbol: 'm' })] }, op('×'), v(2)]);
assert.equal(variablePower.symbolic.kind, 'binary', '変数指数を含む式は構造を保って返す');
assert.equal(evaluate([v(0.1), op('+'), v(0.2), op('='), v(0.3)]).relation.truths[0], true, 'IEEE 754の加算誤差だけを等号比較で吸収する');
const nestedPower = exponent => evaluate([{
  kind: 'power',
  base: [v(2, '', { symbol: 'b' })],
  exponent: [{ kind: 'power', base: [v(2, '', { symbol: 'a' })], exponent: [v(2, '', { symbol: exponent })] }, op('+'), v(1)]
}]);
assert.equal(Core.equivalent(nestedPower('n'), nestedPower('m')), false, '非有理の入れ子指数どうしを誤って同値にしない');
const powerOf = exponent => ({ kind: 'power', base: [v(2)], exponent: [v(exponent === 'n' ? 4 : 3, '', { symbol: exponent })] });
const twoToN = evaluate([powerOf('n')]);
assert.equal(Core.equivalent(twoToN, evaluate([powerOf('n'), op('×'), v(1)])), true, '変数指数の式に1を掛けた表現を同値とする');
assert.equal(Core.equivalent(twoToN, evaluate([{ kind: 'fraction', numerator: [powerOf('n')], denominator: [v(1)] }])), true, '変数指数の式を分母1の分数で表しても同値とする');
assert.equal(Core.equivalent(twoToN, evaluate([powerOf('n'), op('+'), v(0)])), true, '変数指数の式に0を足した表現を同値とする');
assert.equal(Core.equivalent(evaluate([powerOf('n'), op('×'), powerOf('m')]), evaluate([powerOf('m'), op('×'), powerOf('n')])), true, '変数指数の項どうしの積の順序を入れ替えても同値とする');
assert.equal(Core.equivalent(twoToN, evaluate([powerOf('m')])), false, '異なる変数指数を数値一致だけで同値にしない');
expectError([{ kind: 'power', base: [v(2)], exponent: [v(Core.MAX_INTEGER_EXPONENT + 1)] }], 'LIMIT');
const polynomialExplosion = [
  v(1, '', { symbol: 'a' }), op('+'), v(1, '', { symbol: 'b' }), op('+'), v(1, '', { symbol: 'c' }), op('+'), v(1, '', { symbol: 'd' }), op('+'), v(1, '', { symbol: 'e' })
];
expectError([{ kind: 'power', base: polynomialExplosion, exponent: [v(Core.MAX_INTEGER_EXPONENT)] }], 'LIMIT');
assert.equal(Core.equivalent(evaluate([v(0.1), op('+'), v(0.2)]), evaluate([v(0.3)])), true, '小数のIEEE 754誤差だけが違う式を同値とする');
assert.equal(Core.equivalent(evaluate([v('1e-13'), op('×'), v(1, '', { symbol: 'a' })]), evaluate([v(0)])), false, '微小でも非ゼロの係数をゼロ式と誤って同値にしない');
for (const [token, label] of [
  [[{ kind: 'fraction', numerator: [], denominator: [v(1)] }], '分子'],
  [[{ kind: 'fraction', numerator: [v(1)], denominator: [] }], '分母'],
  [[{ kind: 'power', base: [], exponent: [v(1)] }], '底'],
  [[{ kind: 'power', base: [v(1)], exponent: [] }], '指数']
]) {
  assert.throws(() => Core.parse(token), error => error instanceof Core.FormulaError && error.code === 'INCOMPLETE' && error.message.includes(label), `${label}の空欄を日本語で示す`);
}

const ab = evaluate([v(16, 'bit', { symbol: 'b' }), op('÷'), v(8)]);
const ba = evaluate([v(2, 'bit', { symbol: 'b' })]);
assert.equal(Core.equivalent(ab, ba), false, '同じ記号でも係数が異なる式は同値にしない');
assert.equal(Core.equivalent(evaluate([v(2, '', { symbol: 'a' }), op('+'), v(3, '', { symbol: 'b' })]), evaluate([v(3, '', { symbol: 'b' }), op('+'), v(2, '', { symbol: 'a' })])), true, '加算の順序が違っても記号式として同値');
assert.equal(Core.equivalent(evaluate([v(2, '', { symbol: 'a' }), op('×'), v(3, '', { symbol: 'b' })]), evaluate([v(3, '', { symbol: 'b' }), op('×'), v(2, '', { symbol: 'a' })])), true, '乗算の順序が違っても記号式として同値');

assert.deepEqual(evaluate([v(4, 'Hz'), op('='), v(4, '回/秒')]).relation.truths, [true], '同じ次元として定義された単位を比較できる');
expectError([v(1, 'bit'), op('+'), v(1, 'B')], 'UNIT_MISMATCH');
expectError([v(1, 'not-known')], 'UNIT');
expectError([v(1), op('÷'), v(0)], 'DIVISION_BY_ZERO');
expectError([v(1), op('+')], 'INCOMPLETE');
expectError(Array.from({ length: Core.MAX_TOKENS + 1 }, () => v(1)), 'LIMIT');

const first = evaluate([v(20, 'bit', { symbol: 'n' }), op('÷'), v(4)]);
const referenced = Core.evaluate([{ kind: 'reference', rowId: 'row-1' }, op('×'), v(2)], { units, resolveReference: rowId => rowId === 'row-1' ? first : null });
assert.equal(referenced.value, 10, '前の式の結果を参照できる');
const manuallyEnteredReference = { ...first, value: 7 };
const fromManualResult = Core.evaluate([{ kind: 'reference', rowId: 'row-1' }, op('×'), v(2)], { units, resolveReference: () => manuallyEnteredReference });
assert.equal(fromManualResult.value, 14, '参照値は手入力結果へ差し替えられる');
assert.equal(Core.equivalent(fromManualResult, evaluate([v(2, '', { symbol: 'n' }), op('÷'), v(2)])), true, '参照の式構造は手入力値に関わらず引き継ぐ');
expectError([{ kind: 'reference', rowId: 'missing' }], 'REFERENCE');
assert.equal(Core.formatTokens([v(16, 'bit'), op('÷'), v(8)]), '16 bit ÷ 8', '可読文字列を作る');

console.log('lesson-formula-core: ok');
