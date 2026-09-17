/* 出典のある相関式を計算して作る物性テンプレート。境界の外挿はしない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./water-properties.js'), require('./co2-properties.js'));
  else root.GraphScienceTemplates = factory(root.GraphCore, root.GraphWaterProperties, root.GraphCO2Properties);
}(typeof globalThis === 'object' ? globalThis : this, function (Core, Water, CO2) {
  'use strict';
  const clone = value => JSON.parse(JSON.stringify(value));
  const colors = { vapor: '#dc2626', sublimation: '#0891b2', melting: '#2563eb' };
  const celsius = T => Number((T - 273.15).toFixed(6));
  function doc(name, xRange, yRange, log = true) {
    const out = Core.createDocument(); out.name = name;
    Object.assign(out.axes.x, { label: '温度', symbol: 'T', unit: '°C', min: xRange[0], max: xRange[1] });
    Object.assign(out.axes.y, { label: '圧力（絶対圧）', symbol: 'P', unit: 'MPa', min: yRange[0], max: yRange[1], scale: log ? 'log' : 'linear' });
    return out;
  }
  function sample(fn, start, end, count = 240) {
    return Array.from({ length: count + 1 }, (_, i) => {
      const T = i === count ? end : start + (end - start) * i / count;
      return [celsius(T), fn(T)];
    });
  }
  function table(out, id, name, rows, source, color, notes) {
    const series = Core.createSeries('data2d');
    Object.assign(series, { id, name, expression: '', rows, source: { ...source, notes: source.notes + ' ' + notes } });
    Object.assign(series.style, { color, lines: true, points: false, width: 2.5, opacity: 1 });
    series.domain = { x: [Math.min(...rows.map(row => row[0])), Math.max(...rows.map(row => row[0]))], y: [Math.min(...rows.map(row => row[1])), Math.max(...rows.map(row => row[1]))] };
    out.series.push(series);
    return series;
  }
  function point(out, id, name, T, P, dx = 9, dy = -12) {
    const a = Core.createAnnotation('point');
    Object.assign(a, { id, name, anchor: { type: 'free', x: String(celsius(T)), y: String(P) }, projections: false });
    Object.assign(a.style, { color: '#9333ea', opacity: 1 }); Object.assign(a.label, { dx, dy });
    out.annotations.push(a);
  }
  function text(out, id, label, x, y, size = 16) {
    const a = Core.createAnnotation('text');
    Object.assign(a, { id, name: label, text: label, anchor: { type: 'free', x: String(x), y: String(y) } });
    Object.assign(a.style, { color: '#64748b', opacity: 1 }); Object.assign(a.label, { size, dx: 0, dy: 0 });
    out.annotations.push(a);
  }
  function atmosphere(out, id) {
    const a = Core.createAnnotation('guide');
    Object.assign(a, { id, name: '1気圧（0.101325 MPa）', axis: 'y', value: '0.101325' });
    Object.assign(a.style, { color: '#64748b', dash: 'dash', width: 1.2 });
    Object.assign(a.label, { size: 12, dx: 0, dy: -8 }); out.annotations.push(a);
  }
  function boundaries(out, prefix, model, meltingMin, meltingMax, sublimationMin) {
    const c = model.constants;
    const note = '横軸はKから°Cへ換算。計算点を直線で結び、表示範囲外へ外挿しません。図は純物質の平衡状態の一部で、高圧側の別の固相・準安定状態・混合物は扱いません。';
    table(out, prefix + '-sublimation', '昇華曲線（固体・気体）', sample(model.sublimationPressure, sublimationMin, c.tripleT), model.sources.sublimation, colors.sublimation, note);
    table(out, prefix + '-vapor', '蒸気圧曲線（液体・気体）', sample(model.vaporPressure, c.tripleT, c.criticalT, 400), model.sources.vapor, colors.vapor, note);
    table(out, prefix + '-melting', '融解曲線（固体・液体）', sample(model.meltingPressure, meltingMin, meltingMax), model.sources.melting, colors.melting, note);
    point(out, prefix + '-triple', '三重点', c.tripleT, c.tripleP);
    point(out, prefix + '-critical', '臨界点', c.criticalT, c.criticalP, -55, -12);
    atmosphere(out, prefix + '-atmosphere');
  }
  function makeTemplates() {
    const water = doc('水の状態図（計算値）', [-70, 450], [1e-7, 50]);
    boundaries(water, 'water', Water, 268, Water.constants.tripleT, 203.15);
    text(water, 'water-solid', '氷 Ih', -62, 2);
    text(water, 'water-liquid', '液体', 140, 3);
    text(water, 'water-gas', '気体', 190, .00003);
    text(water, 'water-supercritical', '超臨界', 392, 32, 12);

    const co2 = doc('二酸化炭素の状態図（計算値）', [-100, 65], [.01, 40]);
    boundaries(co2, 'co2', CO2, CO2.constants.tripleT, 230, 180);
    text(co2, 'co2-solid', '固体', -89, 4);
    text(co2, 'co2-liquid', '液体', -22, 12);
    text(co2, 'co2-gas', '気体', -15, .045);
    text(co2, 'co2-supercritical', '超臨界', 38, 18, 12);

    const melting = doc('水の融解曲線（拡大）', [-3.5, .5], [0, 42], false);
    table(melting, 'water-melting-detail', '氷 Ih の融解圧', sample(Water.meltingPressure, 270, Water.constants.tripleT), Water.sources.melting, colors.melting, '温度を°Cへ換算。状態図の融解曲線だけを線形の圧力軸で拡大しました。圧力を上げると氷 Ih の融点が下がることが読み取れます。');
    text(melting, 'melting-ice', '氷 Ih', -3.2, 8);
    text(melting, 'melting-water', '液体', -1, 28);
    point(melting, 'melting-triple', '三重点', Water.constants.tripleT, Water.constants.tripleP, -58, -10);

    const density = doc('水の密度（飽和液体）', [0, 100], [950, 1003], false);
    Object.assign(density.axes.y, { label: '密度（飽和液体）', symbol: 'rho', unit: 'kg/m³' });
    table(density, 'water-density', '飽和液体の密度', sample(Water.liquidDensity, Water.constants.tripleT, 373.15, 200), Water.sources.density, '#0f766e', 'この数表は0.01–100°Cのみを表示し、点の間を直線で結びます。');
    text(density, 'density-condition', '飽和条件：圧力も温度とともに変化', 5, 952, 12);

    return [
      { id: 'science-water-phase', name: water.name, category: '物性・状態図', description: 'IAPWS相関式。三重点・臨界点・1気圧を表示。縦軸は対数、氷は Ih の範囲。', document: water },
      { id: 'science-co2-phase', name: co2.name, category: '物性・状態図', description: 'Span–Wagner相関式。三重点・臨界点と、1気圧では液体にならないことを確認。', document: co2 },
      { id: 'science-water-melting-detail', name: melting.name, category: '物性・状態図', description: '氷 Ih の融解曲線を拡大し、圧力が上がると融点が下がる関係を確認。', document: melting },
      { id: 'science-water-saturated-density', name: density.name, category: '物性・状態図', description: 'IAPWS相関式からの0.01–100°Cの密度。飽和条件の計算値で、1気圧一定ではありません。', document: density }
    ];
  }
  const templates = makeTemplates();
  return { list: () => clone(templates) };
}));
