/* グラフエディタの初期テンプレート。外部データやコードは実行しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GraphTemplates = factory();
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const IAPWS_WATER = 'https://www.iapws.org/relguide/Supp-sat.html';
  const waterRows = [
    [0.01, 0.612], [10, 1.228], [20, 2.339], [30, 4.247], [40, 7.385],
    [50, 12.352], [60, 19.947], [70, 31.202], [80, 47.416], [90, 70.183], [100, 101.418]
  ];

  function axes(mode) {
    return {
      x: { label: 'x', unit: '', min: -10, max: 10, scale: 'linear' },
      y: { label: 'y', unit: '', min: -10, max: 10, scale: 'linear' },
      z: { label: 'z', unit: '', min: -10, max: 10, scale: 'linear' }
    };
  }
  function documentBase(name, mode) {
    return { format: 'kaijo-graph', version: 1, name, mode, angle: 'rad',
      axes: axes(mode), equalScale: false, grid: true, legend: true,
      parameters: [], series: [] };
  }
  function functionSeries(id, name, expression, source, domain) {
    return { id, kind: 'function', name, expression,
      domain: { x: domain || [-10, 10], y: [-10, 10] }, rows: [], visible: true,
      style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: 0.85 },
      source: source || { kind: 'user', title: '', url: '', notes: '' } };
  }
  function surfaceSeries(id, name, expression) {
    return { id, kind: 'surface', name, expression,
      domain: { x: [-5, 5], y: [-5, 5] }, rows: [], visible: true,
      style: { color: '#2563eb', width: 2, dash: 'solid', points: false, lines: true, opacity: 0.85 },
      source: { kind: 'model', title: '定義した数式によるモデル', url: '', notes: '描画値は数式から生成されます。' } };
  }
  function tableSeries(id, name, rows, source) {
    return { id, kind: 'data2d', name, expression: '', domain: { x: [0, 90], y: [0, 70] },
      rows, visible: true,
      style: { color: '#2563eb', width: 2, dash: 'solid', points: true, lines: true, opacity: 0.85 }, source };
  }
  function makeTemplates() {
    const quadratic = documentBase('2次関数と係数 a', '2d');
    quadratic.axes.x = { label: 'x', unit: '', min: -5, max: 5, scale: 'linear' };
    quadratic.axes.y = { label: 'y', unit: '', min: -10, max: 10, scale: 'linear' };
    quadratic.parameters = [{ name: 'a', value: 1, min: -3, max: 3, step: 0.1 }];
    quadratic.series.push(functionSeries('quadratic-a', 'y = ax²', 'a*x^2',
      { kind: 'model', title: '2次関数の定義', url: '', notes: '係数 a をスライダーで変更する数式モデル。' }, [-5, 5]));

    const sine = documentBase('sin の比較', '2d');
    sine.axes.x = { label: 'x', unit: 'rad', min: -6.283185307, max: 6.283185307, scale: 'linear' };
    sine.axes.y = { label: 'y', unit: '', min: -1.2, max: 1.2, scale: 'linear' };
    sine.series.push(functionSeries('sin-x', 'y = sin(x)', 'sin(x)', { kind: 'model', title: '正弦関数の定義', url: '', notes: '角度はラジアン。' }, [-6.283185307, 6.283185307]));
    sine.series.push(functionSeries('sin-2x', 'y = sin(2x)', 'sin(2*x)', { kind: 'model', title: '正弦関数の定義', url: '', notes: '角度はラジアン。' }, [-6.283185307, 6.283185307]));

    const vapor = documentBase('水の飽和蒸気圧（計算値）', '2d');
    vapor.axes.x = { label: '温度', unit: '°C', min: 0, max: 100, scale: 'linear' };
    vapor.axes.y = { label: '飽和蒸気圧', unit: 'kPa', min: 0, max: 110, scale: 'linear' };
    vapor.series.push(tableSeries('water-vapor-pressure', '水の飽和蒸気圧', waterRows.map(row => row.slice()), {
      kind: 'model', title: 'IAPWS SR1-86(1992) の飽和圧力式からの計算値', url: IAPWS_WATER,
      notes: '実測値の転載ではありません。IAPWS の式（Tc=647.096 K, pc=22.064 MPa, a1=-7.85951783, a2=1.84408259, a3=-11.7866497, a4=22.6807411, a5=-15.9618719, a6=1.80122502）から計算し、MPa を kPa に換算。適用範囲は三重点 273.16 K（0.01°C）から臨界点 647.096 K までです。表は 0.01°C、10–100°C を 10°C 刻みで丸めた値です。点間は直線補間し、平滑化しません。'
    }));

    const gas = documentBase('理想気体 PV モデル', '2d');
    gas.axes.x = { label: 'V', unit: 'L', min: 1, max: 10, scale: 'linear' };
    gas.axes.y = { label: 'P', unit: 'kPa', min: 0, max: 2600, scale: 'linear' };
    gas.parameters = [{ name: 'n', value: 1, min: 0.1, max: 2, step: 0.1 }, { name: 'T', value: 300, min: 200, max: 500, step: 10 }];
    gas.series.push(functionSeries('ideal-gas-pv', 'P = nRT / V', 'n*8.314*T/x', { kind: 'model', title: '理想気体の状態方程式', url: '', notes: '横軸 x は体積 V (L) として表示。R=8.314 kPa·L/(mol·K)。理想化したモデルで、実測値ではありません。' }, [1, 10]));

    const complexity = documentBase('計算量の比較', '2d');
    complexity.axes.x = { label: 'n', unit: '', min: 1, max: 100, scale: 'linear' };
    complexity.axes.y = { label: '相対的な計算量', unit: '', min: 0, max: 10000, scale: 'linear' };
    complexity.series.push(functionSeries('complexity-n', 'n', 'x', undefined, [1, 100]));
    complexity.series.push(functionSeries('complexity-log2n', 'log₂n', 'log(x)/log(2)', { kind: 'model', title: '計算量の定義', url: '', notes: '' }, [1, 100]));
    complexity.series.push(functionSeries('complexity-nlog2n', 'n log₂n', 'x*log(x)/log(2)', { kind: 'model', title: '計算量の定義', url: '', notes: '' }, [1, 100]));
    complexity.series.push(functionSeries('complexity-n2', 'n²', 'x^2', { kind: 'model', title: '計算量の定義', url: '', notes: '' }, [1, 100]));
    complexity.series.forEach((series, index) => { series.style.color = ['#2563eb', '#16a34a', '#d97706', '#dc2626'][index]; });
    sine.series[0].style.color = '#2563eb'; sine.series[1].style.color = '#dc2626';

    const bowl = documentBase('3D 曲面 z = x² + y²', '3d');
    bowl.axes.x = { label: 'x', unit: '', min: -5, max: 5, scale: 'linear' };
    bowl.axes.y = { label: 'y', unit: '', min: -5, max: 5, scale: 'linear' };
    bowl.axes.z = { label: 'z', unit: '', min: 0, max: 50, scale: 'linear' };
    bowl.equalScale = true;
    bowl.series.push(surfaceSeries('surface-bowl', 'z = x² + y²', 'x^2+y^2'));
    const saddle = documentBase('鞍型曲面 z = x² − y²', '3d');
    saddle.axes.x = { label: 'x', unit: '', min: -5, max: 5, scale: 'linear' };
    saddle.axes.y = { label: 'y', unit: '', min: -5, max: 5, scale: 'linear' };
    saddle.axes.z = { label: 'z', unit: '', min: -25, max: 25, scale: 'linear' };
    saddle.equalScale = true;
    saddle.series.push(surfaceSeries('surface-saddle', 'z = x² − y²', 'x^2-y^2'));

    return [
      { id: 'math-quadratic-a', name: '2次関数と係数 a', category: '数学', description: '係数 a を変えて放物線の開き方と向きを比べます。', document: quadratic },
      { id: 'math-sine-comparison', name: 'sin の比較', category: '数学', description: 'sin(x) と sin(2x) の周期を比べます。', document: sine },
      { id: 'science-water-vapor-pressure', name: '水の飽和蒸気圧（計算値）', category: '理科', description: 'IAPWS の式から計算した温度と水の飽和蒸気圧の数表です。', document: vapor },
      { id: 'science-ideal-gas-pv', name: '理想気体 PV モデル', category: '理科', description: '温度と物質量を変え、P と V の関係を見ます。', document: gas },
      { id: 'information-complexity', name: '計算量の比較', category: '情報', description: 'n、log₂n、n log₂n、n² の増え方を比べます。', document: complexity },
      { id: 'surface-bowl', name: '3D 曲面 z = x² + y²', category: '数学', description: '上に開く放物面を表示します。', document: bowl },
      { id: 'surface-saddle', name: '鞍型曲面 z = x² − y²', category: '数学', description: '鞍型曲面を表示します。', document: saddle }
    ];
  }
  const templates = makeTemplates();
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  return { list: function () { return clone(templates); } };
}));
