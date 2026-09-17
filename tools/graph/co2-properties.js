/* global GraphCO2Properties */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphCO2Properties = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  // Span and Wagner (1996), Eqs. (3.10), (3.12), and (3.13).
  // All pressures returned by this module are absolute pressures in MPa.
  const constants = Object.freeze({
    tripleT: 216.592,
    tripleP: 0.51795,
    criticalT: 304.1282,
    criticalP: 7.3773
  });
  const sourceUrl = 'https://doi.org/10.1063/1.555991';
  const sources = Object.freeze({
    vapor: Object.freeze({
      kind: 'model',
      title: 'Span and Wagner (1996), Eq. (3.13): CO₂ vapor-pressure correlation',
      url: sourceUrl,
      notes: '1996年の補助相関を独自に計算する。T = 216.592–304.1282 K（三重点から臨界点）、圧力はMPa。T=216.592 Kでは論文の三重点値0.51795 MPaを返す。'
    }),
    sublimation: Object.freeze({
      kind: 'model',
      title: 'Span and Wagner (1996), Eq. (3.12): CO₂ sublimation-pressure correlation',
      url: sourceUrl,
      notes: '1996年の補助相関を独自に計算する。論文のフィットは154 K超のデータに基づくが、この授業用モジュールは保守的に180–216.592 Kだけを許可する。圧力はMPa。'
    }),
    melting: Object.freeze({
      kind: 'model',
      title: 'Span and Wagner (1996), Eq. (3.10): CO₂ melting-pressure correlation',
      url: sourceUrl,
      notes: '1996年の補助相関を独自に計算する。論文は三重点付近から270 Kまで不確かさを示すが、この授業用モジュールは保守的に216.592–230 Kだけを許可する。圧力はMPa。'
    })
  });
  const ranges = Object.freeze({
    vapor: Object.freeze([constants.tripleT, constants.criticalT]),
    sublimation: Object.freeze([180, constants.tripleT]),
    melting: Object.freeze([constants.tripleT, 230])
  });

  function assertTemperature(Tkelvin, name, range) {
    if (typeof Tkelvin !== 'number' || !Number.isFinite(Tkelvin)) throw new RangeError(name + 'には有限の温度（K）を指定してください。');
    if (Tkelvin < range[0] || Tkelvin > range[1]) throw new RangeError(name + 'の適用範囲は' + range[0] + '–' + range[1] + ' Kです。');
  }

  function vaporPressure(Tkelvin) {
    assertTemperature(Tkelvin, '蒸気圧式', ranges.vapor);
    if (Tkelvin === constants.tripleT) return constants.tripleP;
    if (Tkelvin === constants.criticalT) return constants.criticalP;
    const theta = 1 - Tkelvin / constants.criticalT;
    const sum = -7.0602087 * theta + 1.9391218 * Math.pow(theta, 1.5) - 1.6463597 * theta * theta - 3.2995634 * Math.pow(theta, 4);
    return constants.criticalP * Math.exp(constants.criticalT / Tkelvin * sum);
  }

  function sublimationPressure(Tkelvin) {
    assertTemperature(Tkelvin, '昇華圧式', ranges.sublimation);
    if (Tkelvin === constants.tripleT) return constants.tripleP;
    const theta = 1 - Tkelvin / constants.tripleT;
    const sum = -14.740846 * theta + 2.4327015 * Math.pow(theta, 1.9) - 5.3061778 * Math.pow(theta, 2.9);
    return constants.tripleP * Math.exp(constants.tripleT / Tkelvin * sum);
  }

  function meltingPressure(Tkelvin) {
    assertTemperature(Tkelvin, '融解圧式', ranges.melting);
    if (Tkelvin === constants.tripleT) return constants.tripleP;
    const theta = Tkelvin / constants.tripleT - 1;
    return constants.tripleP * (1 + 1955.539 * theta + 2055.4593 * theta * theta);
  }

  return Object.freeze({ constants, vaporPressure, sublimationPressure, meltingPressure, sources });
}));
