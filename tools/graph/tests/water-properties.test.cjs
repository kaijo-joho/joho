const assert = require('assert');
const W = require('../water-properties.js');
const near = (actual, expected, tolerance) => assert(Math.abs(actual - expected) <= tolerance, `${actual} != ${expected}`);
// IAPWS のプログラム照合用数値（SR1-86 Table 1 / R14-08 Table 3）。
near(W.vaporPressure(373.1243), .101325, 1e-7);
near(W.liquidDensity(273.16), 999.789, .0005);
near(W.liquidDensity(373.1243), 958.365, .0005);
near(W.liquidDensity(647.096), 322, 1e-9);
near(W.meltingPressure(260), 138.268, .0005);
near(W.sublimationPressure(230), 8.94735e-6, 5e-12);
for (const method of ['vaporPressure', 'sublimationPressure', 'meltingPressure']) near(W[method](W.constants.tripleT), W.constants.tripleP, 1e-12);
near(W.vaporPressure(W.constants.criticalT), W.constants.criticalP, 1e-12);
assert(W.meltingPressure(270) > W.meltingPressure(272), '水は圧力が上がると融点が下がる');
for (let T = 274; T < 647; T++) assert(W.vaporPressure(T) > W.vaporPressure(T - .5));
for (let T = 51; T < 273; T++) assert(W.sublimationPressure(T) > W.sublimationPressure(T - .5));
assert(W.liquidDensity(277.15) > W.liquidDensity(273.16));
assert(W.liquidDensity(277.15) > W.liquidDensity(283.15));
for (const [method, low, high] of [['vaporPressure', 273.16, 647.096], ['liquidDensity', 273.16, 647.096], ['sublimationPressure', 50, 273.16], ['meltingPressure', 251.165, 273.16]]) {
  for (const bad of [NaN, Infinity, '273.16', low - .001, high + .001]) assert.throws(() => W[method](bad), RangeError);
  assert(Number.isFinite(W[method](low))); assert(Number.isFinite(W[method](high)));
}
console.log('water properties tests passed');
