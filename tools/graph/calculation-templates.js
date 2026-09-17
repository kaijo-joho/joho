/* 計算列を使う物理・情報テンプレート。数値はすべて決定的な模擬データ。 */
(function (root, factory) {
  const api = factory(
    typeof module === 'object' && module.exports ? require('./core.js') : root.GraphCore,
    typeof module === 'object' && module.exports ? require('./tables.js') : root.GraphTables,
    typeof module === 'object' && module.exports ? require('./charts.js') : root.GraphCharts
  );
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphCalculationTemplates = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (Core, Tables, Charts) {
  'use strict';

  const clone = value => JSON.parse(JSON.stringify(value));
  const source = notes => ({
    kind: 'model',
    title: '教材用の物理関係式による模擬データ',
    url: '',
    notes: 'MODEL/模擬データです。実際の測定値やオープンデータではありません。' + notes
  });
  const axis = (label, symbol, unit, min, max, step) => ({
    label, symbol, unit, min, max, scale: 'linear',
    ticks: { step, format: 'auto' }
  });
  const style = (color, points = true, lines = true) => ({
    color, width: 2, dash: 'solid', points, lines, opacity: .9
  });

  function document(name) {
    const out = Core.createDocument();
    out.name = name;
    out.grid = true;
    out.legend = true;
    return out;
  }

  function tableSeries(id, name, table, mapping, notes, color) {
    const out = Core.createSeries('data2d');
    Object.assign(out, {
      id, name,
      source: source(notes),
      style: style(color || '#2563eb'),
      interpolation: 'linear'
    });
    out.dataTable = table;
    // assign validates and calculates the table, retaining the raw input rows.
    Tables.assign(out, table);
    out.dataTable.mapping = { ...out.dataTable.mapping, ...mapping };
    // Reassign after the mapping update so projected rows use the requested columns.
    Tables.assign(out, out.dataTable);
    return out;
  }

  function regression(doc, id, seriesId, name, color) {
    const fit = Core.createAnnotation('regression');
    Object.assign(fit, {
      id, name, seriesId, model: 'linear', showEquation: true, showMetrics: true,
      style: { color: color || '#dc2626', width: 2, dash: 'solid', opacity: 1 }
    });
    doc.annotations.push(fit);
    return fit;
  }

  function chart(kind, id, options) {
    const out = Charts.create(kind, options);
    out.id = id;
    return out;
  }

  function makeTemplates() {
    const acceleration = document('等加速度運動：区間平均速度');
    acceleration.axes.x = axis('区間中点時刻', 't', 's', .25, 3.75, .5);
    acceleration.axes.y = axis('区間平均速度', 'v', 'm/s', 0, 12, 2);
    const accelerationTable = {
      columns: ['時刻', '位置', '区間平均速度', '区間中点時刻'],
      rows: [[0, 0, null, null], [1, 3, null, null], [2, 8, null, null], [3, 15, null, null], [4, 24, null, null]],
      mapping: { x: 3, y: 2, z: null, errorX: null, errorY: null },
      formulas: [null, null,
        '([@位置]-[@"位置",-1])/([@時刻]-[@"時刻",-1])',
        '([@時刻]+[@"時刻",-1])/2']
    };
    const accelerationSeries = tableSeries(
      'calculation-acceleration-interval', '区間平均速度（模擬データ）', accelerationTable,
      { x: 3, y: 2 },
      '位置 s=2t+t² (m)、時刻間隔1 s、一定加速度 a=2 m/s² として作った値です。先行行がない最初の行は空欄です。',
      '#2563eb'
    );
    acceleration.series.push(accelerationSeries);

    const ohm = document('オームの法則：抵抗を計算');
    ohm.axes.x = axis('電圧', 'V', 'V', .5, 6.5, 1);
    ohm.axes.y = axis('電流', 'I', 'mA', 0, 35, 5);
    const ohmTable = {
      columns: ['電圧', '電流', '抵抗'],
      rows: [[1, 5.0, null], [2, 9.8, null], [3, 15.2, null], [4, 20.1, null], [5, 24.9, null], [6, 30.3, null]],
      mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null },
      formulas: [null, null, '1000*[@電圧]/[@電流]']
    };
    const ohmSeries = tableSeries(
      'calculation-ohm-measured', '電流（模擬測定値）', ohmTable,
      { x: 0, y: 1 },
      '抵抗 R=200 Ω を中心に小さなばらつきを加えました。電流は mA、抵抗の式では A へ換算しています。',
      '#d97706'
    );
    ohm.series.push(ohmSeries);
    const ohmFit = regression(ohm, 'calculation-ohm-fit', ohmSeries.id, '比例関係の直線回帰');
    ohm.charts.push(chart('residual', 'calculation-ohm-residual', {
      regressionId: ohmFit.id,
      name: 'オームの法則の残差',
      horizontal: 'x',
      axes: { x: { label: '電圧', unit: 'V' }, y: { label: '電流の残差', unit: 'mA' } },
      color: '#dc2626'
    }));
    ohm.comparison = { columns: 2, items: ['main', 'calculation-ohm-residual'] };

    const hooke = document('フックの法則：伸びと力');
    hooke.axes.x = axis('力', 'F', 'N', 0, 3.2, .5);
    hooke.axes.y = axis('伸び', 'x', 'm', 0, .08, .01);
    const hookeTable = {
      columns: ['質量', '伸び（cm）', '力', '伸び（m）'],
      rows: [[50, 1.2, null, null], [100, 2.5, null, null], [150, 3.7, null, null], [200, 5.1, null, null], [250, 6.2, null, null], [300, 7.6, null, null]],
      mapping: { x: 2, y: 3, z: null, errorX: null, errorY: null },
      formulas: [null, null, '[@質量]*9.8/1000', '[@"伸び（cm）"]/100']
    };
    const hookeSeries = tableSeries(
      'calculation-hooke-data', '伸び（模擬データ）', hookeTable,
      { x: 2, y: 3 },
      '質量を kg へ、伸びを m へ換算します。重力加速度 g=9.8 m/s²、ばね定数は一定と仮定し、数値は実測値ではなく練習用です。',
      '#16a34a'
    );
    hooke.series.push(hookeSeries);
    const hookeFit = regression(hooke, 'calculation-hooke-fit', hookeSeries.id, '伸びと力の直線回帰');
    hooke.charts.push(chart('scatter', 'calculation-hooke-scatter', {
      seriesId: hookeSeries.id, xColumn: 2, yColumn: 3, model: 'linear',
      axes: { x: { label: '力', unit: 'N' }, y: { label: '伸び', unit: 'm' } },
      name: '伸びと力の散布図', color: '#16a34a'
    }));
    hooke.comparison = { columns: 2, items: ['main', 'calculation-hooke-scatter'] };

    const sensor = document('センサー時系列：差分と移動平均');
    sensor.axes.x = axis('時刻', 't', 's', 0, 6, 1);
    sensor.axes.y = axis('センサー値', 'y', 'arb.', 8, 20, 2);
    const sensorTable = {
      columns: ['時刻', 'センサー値', '差分', '3点移動平均'],
      rows: [[0, 10, null, null], [1, 12, null, null], [2, 11, null, null], [3, 15, null, null], [4, 14, null, null], [5, 18, null, null], [6, 17, null, null]],
      mapping: { x: 0, y: 1, z: null, errorX: null, errorY: null },
      formulas: [null, null,
        '[@センサー値]-[@"センサー値",-1]',
        'AVERAGE([@"センサー値",-2:0])']
    };
    const sensorSeries = tableSeries(
      'calculation-sensor-series', 'センサー値（模擬データ）', sensorTable,
      { x: 0, y: 1 },
      '時刻間隔1 s、センサー値は任意単位（arb.）の固定した模擬値です。実際のセンサー測定値ではありません。',
      '#2563eb'
    );
    sensor.series.push(sensorSeries);
    sensor.charts.push(chart('scatter', 'calculation-sensor-raw-chart', {
      seriesId: sensorSeries.id, xColumn: 0, yColumn: 1, name: '生データ', color: '#2563eb',
      axes: { x: { label: '時刻', unit: 's', min: 0, max: 6 }, y: { label: 'センサー値', unit: 'arb.', min: 8, max: 20 } }
    }));
    sensor.charts.push(chart('scatter', 'calculation-sensor-smoothed-chart', {
      seriesId: sensorSeries.id, xColumn: 0, yColumn: 3, name: '3点移動平均', color: '#dc2626',
      axes: { x: { label: '時刻', unit: 's', min: 0, max: 6 }, y: { label: 'センサー値', unit: 'arb.', min: 8, max: 20 } }
    }));
    sensor.comparison = {
      columns: 2,
      items: ['calculation-sensor-raw-chart', 'calculation-sensor-smoothed-chart']
    };

    return [
      { id: 'calculation-acceleration-interval', name: acceleration.name, category: '物理', description: '位置の数表から、前の行を参照して区間平均速度と区間中点時刻を計算します。', document: acceleration },
      { id: 'calculation-ohm-resistance', name: ohm.name, category: '物理', description: '電流の模擬測定値から抵抗を計算し、直線回帰と残差を確認します。', document: ohm },
      { id: 'calculation-hooke-regression', name: hooke.name, category: '物理', description: '質量と伸びの模擬データを単位換算し、力と伸びを回帰します。', document: hooke },
      { id: 'calculation-sensor-moving-average', name: sensor.name, category: '情報', description: '同じ数表の生データ列と3点移動平均列を比較します。', document: sensor }
    ];
  }

  const templates = makeTemplates();
  return { list: () => clone(templates) };
}));
