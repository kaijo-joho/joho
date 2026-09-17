/* IAPWS の飽和・氷 Ih 相関式。圧力 MPa、温度 K、密度 kg/m³。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GraphWaterProperties = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const constants = Object.freeze({ tripleT: 273.16, tripleP: .000611657, criticalT: 647.096, criticalP: 22.064, criticalDensity: 322 });
  const saturationURL = 'https://iapws.org/technical-guidance/release/Supp-sat';
  const iceURL = 'https://iapws.org/technical-guidance/release/MeltSub';
  const sources = Object.freeze({
    vapor: Object.freeze({ kind: 'model', title: 'IAPWS SR1-86(1992), 式(1)：水の飽和蒸気圧', url: saturationURL, notes: 'IAPWS公式相関式からの計算値で、実測値の転載ではありません。適用範囲273.16–647.096 K。絶対圧MPa。三重点の接続には0.000611657 MPaを用います。' }),
    density: Object.freeze({ kind: 'model', title: 'IAPWS SR1-86(1992), 式(2)：飽和液体の密度', url: saturationURL, notes: 'IAPWS公式相関式からの計算値で、実測値の転載ではありません。適用範囲273.16–647.096 K、密度kg/m³。液体と蒸気が共存する飽和条件です。温度とともに圧力も変わり、1気圧一定の水の密度ではありません。' }),
    sublimation: Object.freeze({ kind: 'model', title: 'IAPWS R14-08(2011), 式(6)：氷 Ih の昇華圧', url: iceURL, notes: 'International Association for the Properties of Water and Steam の公式相関式からの計算値。適用範囲50–273.16 K、絶対圧MPa。実測値の転載ではありません。' }),
    melting: Object.freeze({ kind: 'model', title: 'IAPWS R14-08(2011), 式(1)：氷 Ih の融解圧', url: iceURL, notes: 'International Association for the Properties of Water and Steam の公式相関式からの計算値。適用範囲251.165–273.16 K、絶対圧MPa。通常の氷 Ih と液体の境界だけを扱い、高圧氷の別の結晶相は含めません。' })
  });
  function check(T, min, max) {
    if (!Number.isFinite(T) || T < min || T > max) throw new RangeError('温度は適用範囲 ' + min + '–' + max + ' K の有限な数値にしてください。');
  }
  function vaporPressure(T) {
    check(T, constants.tripleT, constants.criticalT);
    if (T === constants.tripleT) return constants.tripleP;
    const tau = 1 - T / constants.criticalT;
    const sum = -7.85951783 * tau + 1.84408259 * tau ** 1.5 - 11.7866497 * tau ** 3 + 22.6807411 * tau ** 3.5 - 15.9618719 * tau ** 4 + 1.80122502 * tau ** 7.5;
    return constants.criticalP * Math.exp(constants.criticalT / T * sum);
  }
  function liquidDensity(T) {
    check(T, constants.tripleT, constants.criticalT);
    const tau = 1 - T / constants.criticalT;
    return constants.criticalDensity * (1 + 1.99274064 * tau ** (1 / 3) + 1.09965342 * tau ** (2 / 3) - .510839303 * tau ** (5 / 3) - 1.75493479 * tau ** (16 / 3) - 45.5170352 * tau ** (43 / 3) - 674694.450 * tau ** (110 / 3));
  }
  function sublimationPressure(T) {
    check(T, 50, constants.tripleT);
    if (T === constants.tripleT) return constants.tripleP;
    const theta = T / constants.tripleT;
    const sum = -21.2144006 * theta ** .00333333333 + 27.3203819 * theta ** 1.20666667 - 6.10598130 * theta ** 1.70333333;
    return constants.tripleP * Math.exp(sum / theta);
  }
  function meltingPressure(T) {
    check(T, 251.165, constants.tripleT);
    const theta = T / constants.tripleT;
    return constants.tripleP * (1 + 1195393.37 * (1 - theta ** 3) + 80818.3159 * (1 - theta ** 25.75) + 3338.26860 * (1 - theta ** 103.75));
  }
  return Object.freeze({ constants, sources, vaporPressure, liquidDensity, sublimationPressure, meltingPressure });
}));
