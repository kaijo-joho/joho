/* グラフエディタの初期テンプレート。外部データやコードは実行しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./physics-templates.js'), require('./science-templates.js'));
  else root.GraphTemplates = factory(root.GraphPhysicsTemplates, root.GraphScienceTemplates);
}(typeof globalThis === 'object' ? globalThis : this, function (Physics, Science) {
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
    return { format: 'kaijo-graph', version: 2, name, mode, angle: 'rad',
      axes: axes(mode), equalScale: false, grid: true, legend: true,
      parameters: [], series: [], annotations: [] };
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
    gas.axes.x = { label: 'V', symbol: 'V', unit: 'L', min: 1, max: 10, scale: 'linear' };
    gas.axes.y = { label: 'P', symbol: 'P', unit: 'kPa', min: 0, max: 2600, scale: 'linear' };
    gas.parameters = [{ name: 'n', value: 1, min: 0.1, max: 2, step: 0.1 }, { name: 'T', value: 300, min: 200, max: 500, step: 10 }];
    gas.series.push(functionSeries('ideal-gas-pv', 'P = nRT / V', 'n*8.314*T/x', { kind: 'model', title: '理想気体の状態方程式', url: '', notes: '横軸は体積 V (L)、縦軸は圧力 P (kPa)。R=8.314 kPa·L/(mol·K)。理想化したモデルで、実測値ではありません。' }, [1, 10]));

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

    const circle = documentBase('円を方程式で描く', '2d');
    circle.equalScale = true; circle.axes.x.min = circle.axes.y.min = -4; circle.axes.x.max = circle.axes.y.max = 4;
    const circleSeries = functionSeries('implicit-circle', 'x² + y² = 9', 'x^2+y^2=9', undefined, [-4, 4]);
    circleSeries.kind = 'implicit'; circleSeries.domain.y = [-4, 4]; circle.series.push(circleSeries);

    const ellipse = documentBase('楕円と曲線上の点', '2d');
    ellipse.equalScale = true; ellipse.axes.x.min = -4; ellipse.axes.x.max = 4; ellipse.axes.y.min = -3; ellipse.axes.y.max = 3;
    ellipse.parameters.push({ name: 'a', value: 0.8, min: 0, max: 6.28, step: 0.02 });
    const ellipseSeries = functionSeries('parametric-ellipse', 'x = 3cos(t), y = 2sin(t)', '', undefined, [-4, 4]);
    Object.assign(ellipseSeries, { kind: 'parametric', components: { x: '3*cos(t)', y: '2*sin(t)' }, interval: [0, 2 * Math.PI] });
    ellipse.series.push(ellipseSeries);
    ellipse.annotations.push({ id: 'ellipse-point', kind: 'point', name: 'P', visible: true, anchor: { type: 'curve', seriesId: ellipseSeries.id, at: 'a' }, projections: true, style: { color: '#dc2626', width: 1.5, dash: 'dash', opacity: 1 } });

    const rose = documentBase('極座標の花形曲線', '2d');
    rose.equalScale = true; rose.axes.x.min = rose.axes.y.min = -2.5; rose.axes.x.max = rose.axes.y.max = 2.5;
    const roseSeries = functionSeries('polar-rose', 'r = 2cos(3θ)', '2*cos(3*theta)');
    Object.assign(roseSeries, { kind: 'polar', interval: [0, 2 * Math.PI] }); rose.series.push(roseSeries);

    const tangent = documentBase('放物線の接線と交点', '2d');
    tangent.axes.x.min = -3; tangent.axes.x.max = 3; tangent.axes.y.min = -2; tangent.axes.y.max = 6;
    tangent.parameters.push({ name: 'a', value: 1, min: -2, max: 2, step: 0.1 });
    tangent.series.push(functionSeries('tangent-parabola', 'y = x²', 'x^2', undefined, [-3, 3]), functionSeries('intersection-line', 'y = x + 2', 'x+2', undefined, [-3, 3]));
    tangent.series[1].style.color = '#16a34a';
    tangent.annotations.push({ id: 'tangent-at-a', kind: 'tangent', name: '接線', visible: true, seriesId: 'tangent-parabola', at: 'a', style: { color: '#dc2626', width: 2, dash: 'dash', opacity: 1 } }, { id: 'two-intersections', kind: 'intersection', name: '交点', visible: true, seriesIds: ['tangent-parabola', 'intersection-line'], interval: [-3, 3], style: { color: '#9333ea', width: 1.5, dash: 'dash', opacity: 1 } });

    sine.axes.x.ticks = { step: Math.PI / 2, format: 'pi' };
    complexity.axes.x.symbol = 'n';
    const triangle = documentBase('三角形の領域と面積', '2d');
    triangle.version = 5; triangle.equalScale = true;
    triangle.axes.x.min = triangle.axes.y.min = -1;
    triangle.axes.x.max = triangle.axes.y.max = 6;
    triangle.parameters.push({ name: 'h', value: 3, min: 1, max: 5, step: .1 });
    const regionStyle = { color: '#2563eb', width: 2, dash: 'solid', opacity: 1 };
    for (const [id, name, x, y] of [['triangle-a', 'A', '0', '0'], ['triangle-b', 'B', '4', '0'], ['triangle-c', 'C', '1', 'h']]) {
      triangle.annotations.push({ id, kind: 'point', name, visible: true, anchor: { type: 'free', x, y }, projections: false, style: { ...regionStyle } });
    }
    for (const [id, name, from, to] of [['triangle-ab', 'AB', 'triangle-a', 'triangle-b'], ['triangle-bc', 'BC', 'triangle-b', 'triangle-c'], ['triangle-ca', 'CA', 'triangle-c', 'triangle-a']]) {
      triangle.annotations.push({ id, kind: 'segment', name, visible: true, from, to, arrows: 'none', style: { ...regionStyle }, label: { visible: false } });
    }
    triangle.annotations.push({ id: 'triangle-region', kind: 'region', name: '三角形 ABC', visible: true, segmentIds: ['triangle-ab', 'triangle-bc', 'triangle-ca'], showArea: true, style: { ...regionStyle, opacity: .25 }, label: { dx: 0, dy: 0 } });
    const between = documentBase('曲線の間の面積', '2d'); between.version = 6;
    between.axes.x.min = -.5; between.axes.x.max = 3.5; between.axes.y.min = -1; between.axes.y.max = 10;
    between.parameters.push({ name: 'h', value: 2, min: .5, max: 3, step: .1 });
    between.series.push(functionSeries('area-parabola', 'y = x²', 'x^2', { kind: 'model', title: '数式による面積の例', url: '', notes: '' }, [-.5, 3.5]));
    between.series.push(functionSeries('area-line', 'y = h x', 'h*x', { kind: 'model', title: '数式による面積の例', url: '', notes: '' }, [-.5, 3.5]));
    between.series[1].style.color = '#dc2626';
    const curved = { id: 'curved-region', kind: 'curveRegion', name: '曲線の間', visible: true, targets: [{ type: 'series', id: 'area-parabola' }, { type: 'series', id: 'area-line' }], interval: ['0', 'h'], showArea: true, showIntegral: true, style: { ...regionStyle, opacity: .25 }, label: { dx: 0, dy: 0 } };
    between.annotations.push(curved);
    const signed = documentBase('面積と定積分の違い', '2d'); signed.version = 6;
    signed.axes.x = { ...signed.axes.x, min: -.5, max: 7, ticks: { step: Math.PI / 2, format: 'pi' } };
    signed.axes.y.min = -1.6; signed.axes.y.max = 1.6;
    signed.series.push(functionSeries('area-sine', 'y = sin(x)', 'sin(x)', { kind: 'model', title: '面積と符号付き積分の例', url: '', notes: '' }, [-.5, 7]));
    signed.annotations.push({ ...curved, id: 'sine-region', name: '0 ≤ x ≤ 2π', targets: [{ type: 'series', id: 'area-sine' }, { type: 'axis', axis: 'x' }], interval: ['0', '2*pi'], style: { ...curved.style }, label: { ...curved.label } });
    const spring = documentBase('ばねの伸びと力（合成データ）', '2d'); spring.version = 7;
    spring.axes.x = { label: '力', symbol: 'F', unit: 'N', min: 0, max: 8, scale: 'linear' };
    spring.axes.y = { label: '伸び', symbol: 'l', unit: 'cm', min: 0, max: 18, scale: 'linear' };
    const springSeries = tableSeries('spring-data', 'ばねの伸び（合成データ）', [[0,0],[1,2.05],[2,3.92],[3,6.08],[4,7.95],[5,10.12],[6,11.9],[7,14.06]], { kind: 'model', title: '回帰練習用の合成データ', url: '', notes: '実測値ではありません。ばねの伸びと力を模した小さなばらつき入りの合成データです。' });
    springSeries.domain = { x: [0, 7], y: [0, 15] }; springSeries.style.lines = false; springSeries.interpolation = 'linear'; springSeries.errorBars = { x: [], y: [0.12,0.12,0.15,0.12,0.14,0.13,0.15,0.12] }; spring.series.push(springSeries);
    spring.annotations.push({ id: 'spring-linear-fit', kind: 'regression', name: '直線回帰', visible: true, seriesId: springSeries.id, model: 'linear', showEquation: true, showMetrics: true, style: { color: '#dc2626', width: 2, dash: 'solid', opacity: 1 }, label: { visible: true, dx: 12, dy: -12, size: 13 } });
    const decay = documentBase('時間と濃度（合成データ）', '2d'); decay.version = 7;
    decay.axes.x = { label: '時間', symbol: 't', unit: 'min', min: 0, max: 7, scale: 'linear' }; decay.axes.y = { label: '濃度', symbol: 'c', unit: 'mg/L', min: 0, max: 12, scale: 'linear' };
    const decaySeries = tableSeries('decay-data', '濃度（合成データ）', [[0,10.1],[1,7.48],[2,5.51],[3,4.12],[4,3.02],[5,2.23],[6,1.63]], { kind: 'model', title: '指数回帰練習用の合成データ', url: '', notes: '実測値ではありません。時間と濃度の指数減衰を模した小さなばらつき入りの合成データです。' });
    decaySeries.domain = { x: [0, 6], y: [0, 11] }; decaySeries.style.lines = false; decaySeries.interpolation = 'linear'; decaySeries.errorBars = { x: [], y: [0.2,0.18,0.16,0.14,0.12,0.1,0.1] }; decay.series.push(decaySeries);
    decay.annotations.push({ id: 'decay-exponential-fit', kind: 'regression', name: '指数回帰', visible: true, seriesId: decaySeries.id, model: 'exponential', showEquation: true, showMetrics: true, style: { color: '#dc2626', width: 2, dash: 'solid', opacity: 1 }, label: { visible: true, dx: 12, dy: -12, size: 13 } });
    return [
      { id: 'math-quadratic-a', name: '2次関数と係数 a', category: '数学', description: '係数 a を変えて放物線の開き方と向きを比べます。', document: quadratic },
      { id: 'math-sine-comparison', name: 'sin の比較', category: '数学', description: 'sin(x) と sin(2x) の周期を比べます。', document: sine },
      { id: 'math-implicit-circle', name: '円を方程式で描く', category: '数学', description: 'x² + y² = 9 を陰関数として描きます。', document: circle },
      { id: 'math-parametric-ellipse', name: '楕円と曲線上の点', category: '数学', description: '媒介変数で楕円を描き、係数 a で点 P を動かします。', document: ellipse },
      { id: 'math-polar-rose', name: '極座標の花形曲線', category: '数学', description: '半径 r と角度 θ で花形の軌跡を描きます。角度はラジアン。', document: rose },
      { id: 'math-tangent-intersections', name: '放物線の接線と交点', category: '数学', description: '係数 a で接点を動かし、放物線と直線の交点を確認します。', document: tangent },
      { id: 'math-triangle-region', name: '三角形の領域と面積', category: '数学', description: '共有点でつないだ3本の線分を塗りつぶし、係数 h で高さと面積を変えます。', document: triangle },
      { id: 'math-curve-region', name: '曲線の間の面積', category: '数学', description: 'y = x² と y = h x の間を塗りつぶし、係数 h と区間・面積の関係を見ます。', document: between },
      { id: 'math-signed-integral', name: '面積と定積分の違い', category: '数学', description: 'sin(x) と横軸の間で、面積4と符号付きの定積分0を比べます。', document: signed },
      { id: 'science-spring-regression', name: 'ばねの伸びと力（合成データ）', category: '理科', description: '合成データの散布図に直線回帰を当て、力と伸びの関係を調べます。', document: spring },
      { id: 'science-decay-regression', name: '時間と濃度（合成データ）', category: '理科', description: '合成データの散布図に指数回帰を当て、濃度の減衰を調べます。', document: decay },
      { id: 'science-water-vapor-pressure', name: '水の飽和蒸気圧（計算値）', category: '理科', description: 'IAPWS の式から計算した温度と水の飽和蒸気圧の数表です。', document: vapor },
      { id: 'science-ideal-gas-pv', name: '理想気体 PV モデル', category: '理科', description: '温度と物質量を変え、P と V の関係を見ます。', document: gas },
      { id: 'information-complexity', name: '計算量の比較', category: '情報', description: 'n、log₂n、n log₂n、n² の増え方を比べます。', document: complexity },
      { id: 'surface-bowl', name: '3D 曲面 z = x² + y²', category: '数学', description: '上に開く放物面を表示します。', document: bowl },
      { id: 'surface-saddle', name: '鞍型曲面 z = x² − y²', category: '数学', description: '鞍型曲面を表示します。', document: saddle }
    ].map(item => {
      const doc = item.document;if(doc.version < 5)doc.version = 3;
      for(const key of ['x','y','z'])doc.axes[key] = {symbol:key,ticks:{step:null,format:'auto'},...doc.axes[key]};
      for(const a of doc.annotations)a.label = {visible:true,dx:12,dy:-12,size:13,...a.label};
      return item;
    });
  }
  // 分類をまとめ、テンプレート数が増えても見出しを繰り返さない。
  const groups = new Map();
  for (const item of [...makeTemplates(), ...Physics.list(), ...Science.list()]) {
    if (!groups.has(item.category)) groups.set(item.category, []);
    groups.get(item.category).push(item);
  }
  const templates = [...groups.values()].flat();
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  return { list: function () { return clone(templates); } };
}));
