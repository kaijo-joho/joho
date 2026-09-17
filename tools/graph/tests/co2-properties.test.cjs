const assert = require('assert');
const CO2 = require('../co2-properties.js');

const close = (actual, expected, tolerance, label) => assert(Math.abs(actual - expected) <= tolerance, label + ': ' + actual + ' (expected ' + expected + ')');

assert.deepStrictEqual(CO2.constants, { tripleT: 216.592, tripleP: 0.51795, criticalT: 304.1282, criticalP: 7.3773 }, '1996年モデルの定数を固定する');
assert.strictEqual(CO2.sublimationPressure(CO2.constants.tripleT), CO2.constants.tripleP, '昇華線は三重点を正確に通る');
assert.strictEqual(CO2.meltingPressure(CO2.constants.tripleT), CO2.constants.tripleP, '融解線は三重点を正確に通る');
assert.strictEqual(CO2.vaporPressure(CO2.constants.tripleT), CO2.constants.tripleP, '蒸気圧線は表示上の三重点を正確に通る');
assert.strictEqual(CO2.vaporPressure(CO2.constants.criticalT), CO2.constants.criticalP, '蒸気圧線は臨界点を正確に通る');

// Span--Wagner Eq. (3.12) gives the normal sublimation temperature as 194.6855 K.
close(CO2.sublimationPressure(194.6855), 0.101325, 4e-7, '1気圧での昇華圧');
close(CO2.vaporPressure(273.15), 3.48502835, 2e-7, '0 ℃での液体-気体平衡圧');

assert(CO2.sublimationPressure(181) < CO2.sublimationPressure(194.6855) && CO2.sublimationPressure(194.6855) < CO2.sublimationPressure(210), '昇華圧は温度とともに増える');
assert(CO2.vaporPressure(220) < CO2.vaporPressure(273.15) && CO2.vaporPressure(273.15) < CO2.vaporPressure(300), '液体-気体平衡圧は温度とともに増える');
assert(CO2.meltingPressure(220) > CO2.constants.tripleP && CO2.meltingPressure(230) > CO2.meltingPressure(220), '融解曲線は正の傾きを持つ');

// Eq. (3.13) itself is not constrained to pt; the display endpoint is fixed to the paper's triple-point value.
const rawVaporAtTriple = 7.3773 * Math.exp(304.1282 / 216.592 * (-7.0602087 * (1 - 216.592 / 304.1282) + 1.9391218 * Math.pow(1 - 216.592 / 304.1282, 1.5) - 1.6463597 * Math.pow(1 - 216.592 / 304.1282, 2) - 3.2995634 * Math.pow(1 - 216.592 / 304.1282, 4)));
assert(rawVaporAtTriple > CO2.constants.tripleP && rawVaporAtTriple - CO2.constants.tripleP < 2e-5, '蒸気圧補助式と指定三重点には微小な丸め差があることを認識する');

for (const [method, invalid] of [[CO2.vaporPressure, 216], [CO2.sublimationPressure, 179.999], [CO2.meltingPressure, 230.001], [CO2.vaporPressure, NaN], [CO2.meltingPressure, Infinity]]) {
  assert.throws(() => method(invalid), error => error instanceof RangeError && /適用範囲|有限の温度/.test(error.message), '範囲外・非数値は日本語のRangeErrorにする');
}
for (const source of Object.values(CO2.sources)) {
  assert.strictEqual(source.kind, 'model', '表データではなくモデル計算として出典を示す');
  assert(source.url === 'https://doi.org/10.1063/1.555991' && source.notes.includes('1996年'), '各曲線が同じ1996年出典を明示する');
}

console.log('co2 properties tests passed');
