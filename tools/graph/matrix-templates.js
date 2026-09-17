/* 散布図行列の授業用テンプレート。数値列の選択と出典を明示する。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory(require('./core.js'), require('./charts.js'), require('./tables.js'), require('./open-data-catalog.js'));
  } else root.GraphMatrixTemplates = factory(root.GraphCore, root.GraphCharts, root.GraphTables, root.GraphOpenDataCatalog);
}(typeof globalThis === 'object' ? globalThis : this, function (Core, Charts, Tables, Catalog) {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));
  const matrixChart = (seriesId, columns, name) => {
    return Charts.create('matrix', { seriesId, columns, name });
  };
  const tableSeries = (id, name, columns, rows, source, mapping = { x: 0, y: 1 }) => {
    const series = Core.createSeries('data2d');
    Object.assign(series, {
      id, name, rows: rows.map(row => [row[mapping.x], row[mapping.y]]),
      dataTable: { columns: columns.slice(), columnTypes: columns.map(() => 'number'),
        formulas: columns.map(() => null), mapping: { x: mapping.x, y: mapping.y, z: null, errorX: null, errorY: null }, rows: rows.map(row => row.slice()) },
      source: { kind: source.kind, title: source.title, url: source.url || '', notes: source.notes || '' }
    });
    series.style.points = true; series.style.lines = false;
    return series;
  };
  const documentFor = (name, series, chart) => {
    const doc = Core.createDocument(); doc.name = name;
    doc.series.push(series); doc.charts.push(chart); doc.comparison = { columns: 1, items: ['main', chart.id] };
    return doc;
  };
  const modelSource = (title, notes) => ({ kind: 'model', title, url: '', notes });

  function correlationTemplate() {
    const rows = [
      [1, 2.1, 9.1, 6], [2, 4.0, 8.2, -6], [3, 6.2, 7.0, 5], [4, 7.8, 6.1, -5],
      [5, 10.1, 5.2, 4], [6, 11.8, 4.1, -4], [7, 14.2, 3.0, 3], [8, 15.9, 2.0, -3],
      [9, 18.1, 1.1, -6], [10, 20.2, 0.2, 6], [11, 21.8, -0.8, -5], [12, 24.1, -1.9, 5],
      [13, 25.9, -2.8, -4], [14, 28.2, -3.9, 4], [15, 29.8, -4.8, -3], [16, 32.1, -5.8, 3]
    ];
    const source = modelSource('相関の向きを比べる固定模擬データ', '実測値ではありません。正の相関、負の相関、ほぼ無相関を同じ16行の模擬データで表した例です。相関は因果関係を示しません。');
    const series = tableSeries('matrix-correlation-data', '相関比較（模擬データ）', ['基準 X', '正の相関', '負の相関', 'ほぼ無相関'], rows, source);
    return { id: 'matrix-correlation-directions', name: '相関の向きを比べる', category: '統計・相関', description: '基準 X と正の相関、負の相関、ほぼ無相関の3変数を散布図行列で比較します。', document: documentFor('相関の向きを比べる（模擬データ）', series, matrixChart(series.id, [0, 1, 2, 3], '4変数の散布図行列')) };
  }

  function pendulumTemplate() {
    const g = 9.8;
    const rows = [0.20, 0.30, 0.40, 0.50, 0.60, 0.70, 0.80, 0.90].map(length => {
      const period = 2 * Math.PI * Math.sqrt(length / g);
      return [length, period, period * period];
    });
    const source = modelSource('単振り子の小角近似', '実測値ではありません。高校向けの小角近似 T=2π√(L/g) による計算値です。長さ L は m、周期 T は s、重力加速度 g=9.8 m/s²。T と T² は計算列として扱います。');
    const series = tableSeries('matrix-pendulum-data', '振り子（計算値）', ['長さ L (m)', '周期 T (s)', '周期の二乗 T² (s²)'], rows, source);
    Tables.assign(series, { columns: series.dataTable.columns, columnTypes: series.dataTable.columnTypes,
      formulas: [null, '2*pi*sqrt([@"長さ L (m)"]/9.8)', '[@"周期 T (s)"]^2'], mapping: series.dataTable.mapping, rows: series.dataTable.rows });
    const document = documentFor('振り子の長さ・周期・周期二乗', series, matrixChart(series.id, [0, 1, 2], '振り子の散布図行列'));
    return { id: 'matrix-pendulum-linearization', name: '振り子の線形化', category: '物理・統計', description: '長さ・周期・周期の二乗を散布図行列で比べ、非線形と線形の関係を考えます。', document };
  }

  function weatherTemplate() {
    const item = Catalog.list().find(entry => entry.id === 'jma-tokyo-normal-1991-2020');
    if (!item) throw new Error('東京の平年値カタログが見つかりません。');
    const lines = Tables.parse(item.csv, 'data2d').rows.slice();
    const rows = lines.map(row => [row[0], row[1], row[2], row[4]]);
    const source = { ...item.source, notes: item.source.notes + ' 散布図行列では元表から月・平均気温・降水量・日照時間の4列を抽出し、数値3列（平均気温・降水量・日照時間）を選択した。' };
    const series = tableSeries('matrix-tokyo-weather-data', '東京の月別平年値', ['月', '平均気温(℃)', '降水量(mm)', '日照時間(h)'], rows, source);
    return { id: 'matrix-tokyo-weather-normal', name: '東京の気象平年値を比べる', category: '気象・統計', description: '東京の月別平年値から、平均気温・降水量・日照時間の関係を散布図行列で見ます。', document: documentFor('東京の月別平年値（数値3列）', series, matrixChart(series.id, [1, 2, 3], '気象3変数の散布図行列')) };
  }

  const templates = [correlationTemplate(), pendulumTemplate(), weatherTemplate()];
  return { list: () => clone(templates) };
}));
