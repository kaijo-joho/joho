/* グラフエディタに同梱する、確認済みオープンデータの小規模カタログ。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphOpenDataCatalog = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const catalog = [{
    id: 'jma-tokyo-normal-1991-2020',
    title: '東京の月別平年値（1991–2020）',
    description: '気象庁が公開する東京の月別平年値。平均気温、降水量、相対湿度、日照時間をグラフ用の数表として収録します。',
    csv: [
      '月,平均気温(℃),降水量(mm),相対湿度(%),日照時間(h)',
      '1,5.4,59.7,51,192.6',
      '2,6.1,56.5,52,170.4',
      '3,9.4,116.0,57,175.3',
      '4,14.3,133.7,62,178.8',
      '5,18.8,139.7,68,179.6',
      '6,21.9,167.8,75,124.2',
      '7,25.7,156.2,76,151.4',
      '8,26.9,154.7,74,174.2',
      '9,23.3,224.9,75,126.7',
      '10,18.0,234.8,71,129.4',
      '11,12.5,96.3,64,149.8',
      '12,7.7,57.9,56,174.4'
    ].join('\n'),
    source: {
      kind: 'reference',
      title: '気象庁｜過去の気象データ検索｜東京 平年値（年・月ごとの値）',
      url: 'https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?prec_no=44&block_no=47662&year=&month=&day=&view=',
      notes: '統計期間は1991–2020（資料年数30）。地域・地点は東京都の東京（観測所番号47662）。気象庁の同表から平均気温、降水量、相対湿度、日照時間を選択して転記し、グラフ用CSVへ加工した固定スナップショットです。出典表示と編集した旨の明記は気象庁の利用条件（https://www.jma.go.jp/jma/en/copyright.html）に従います。元ページの最新値を自動取得するものではなく、取得確認日は2026-09-17です。',
    },
    license: {
      title: '気象庁ウェブサイト利用規約（Public Data License Version 1.0）',
      url: 'https://www.jma.go.jp/jma/en/copyright.html'
    },
    coverage: '東京（東京都）／月別平年値／1991–2020',
    checkedAt: '2026-09-17',
    x: 0,
    y: 1,
    axes: {
      x: { label: '月', unit: '' },
      y: { label: '平均気温', unit: '℃' }
    },
    lines: true,
    category: '気象'
  }, {
    id: 'jma-sapporo-normal-1991-2020',
    title: '札幌の月別平年値（1991–2020）',
    description: '気象庁が公開する札幌の月別平年値。平均気温、降水量、相対湿度、日照時間を収録します。',
    csv: [
      '月,平均気温(℃),降水量(mm),相対湿度(%),日照時間(h)',
      '1,-3.2,108.4,69,90.4', '2,-2.7,91.9,68,103.5', '3,1.1,77.6,65,144.7',
      '4,7.3,54.6,61,175.8', '5,13.0,55.5,65,200.4', '6,17.0,60.4,72,180.0',
      '7,21.1,90.7,75,168.0', '8,22.3,126.8,75,168.1', '9,18.6,142.2,71,159.3',
      '10,12.1,109.9,67,145.9', '11,5.2,113.8,67,99.1', '12,-0.9,114.5,68,82.7'
    ].join('\n'),
    source: {
      kind: 'reference',
      title: '気象庁｜過去の気象データ検索｜札幌 平年値（年・月ごとの値）',
      url: 'https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?prec_no=14&block_no=47412&year=&month=&day=&view=',
      notes: '統計期間は1991–2020（資料年数30）。地域・地点は石狩地方の札幌（観測所番号47412）。公式表から4列を選択・転記し、グラフ用CSVへ加工した固定スナップショットです。出典表示と編集した旨の明記は気象庁の利用条件（https://www.jma.go.jp/jma/en/copyright.html）に従います。元ページの最新値を自動取得するものではなく、取得確認日は2026-09-17です。'
    },
    license: { title: '気象庁ウェブサイト利用規約（Public Data License Version 1.0）', url: 'https://www.jma.go.jp/jma/en/copyright.html' },
    coverage: '札幌（石狩地方）／月別平年値／1991–2020', checkedAt: '2026-09-17', x: 0, y: 1,
    axes: { x: { label: '月', unit: '' }, y: { label: '平均気温', unit: '℃' } }, lines: true, category: '気象'
  }, {
    id: 'jma-naha-normal-1991-2020',
    title: '那覇の月別平年値（1991–2020）',
    description: '気象庁が公開する那覇の月別平年値。平均気温、降水量、相対湿度、日照時間を収録します。',
    csv: [
      '月,平均気温(℃),降水量(mm),相対湿度(%),日照時間(h)',
      '1,17.3,101.6,66,93.1', '2,17.5,114.5,69,93.1', '3,19.1,142.8,71,115.3',
      '4,21.5,161.0,75,120.9', '5,24.2,245.3,78,138.2', '6,27.2,284.4,83,159.5',
      '7,29.1,188.1,78,227.0', '8,29.0,240.0,78,206.3', '9,27.9,275.2,75,181.3',
      '10,25.5,179.2,72,163.3', '11,22.5,119.1,69,121.7', '12,19.0,110.0,67,107.4'
    ].join('\n'),
    source: {
      kind: 'reference',
      title: '気象庁｜過去の気象データ検索｜那覇 平年値（年・月ごとの値）',
      url: 'https://www.data.jma.go.jp/stats/etrn/view/nml_sfc_ym.php?prec_no=91&block_no=47936&year=&month=&day=&view=',
      notes: '統計期間は1991–2020（資料年数30）。地域・地点は沖縄県の那覇（観測所番号47936）。公式表から4列を選択・転記し、グラフ用CSVへ加工した固定スナップショットです。出典表示と編集した旨の明記は気象庁の利用条件（https://www.jma.go.jp/jma/en/copyright.html）に従います。元ページの最新値を自動取得するものではなく、取得確認日は2026-09-17です。'
    },
    license: { title: '気象庁ウェブサイト利用規約（Public Data License Version 1.0）', url: 'https://www.jma.go.jp/jma/en/copyright.html' },
    coverage: '那覇（沖縄県）／月別平年値／1991–2020', checkedAt: '2026-09-17', x: 0, y: 1,
    axes: { x: { label: '月', unit: '' }, y: { label: '平均気温', unit: '℃' } }, lines: true, category: '気象'
  }, {
    id: 'nasa-planets-metric',
    title: '太陽系8惑星の距離・公転周期・物性値',
    description: 'NASAのPlanetary Fact Sheetから転記した、8惑星の数値比較表です。惑星名は数表の別列へ保存せず、番号と出典注記で対応します。',
    csv: [
      '惑星番号,太陽からの距離(AU),公転周期(年),赤道半径(km),質量(10^24kg),平均密度(kg/m3),赤道での重力(m/s2),平均温度(℃)',
      '1,0.387,0.241,2439.5,0.330,5429,3.7,167', '2,0.723,0.615,6052,4.87,5243,8.9,464',
      '3,1.000,1.000,6378,5.97,5514,9.8,15', '4,1.524,1.881,3396,0.642,3934,3.7,-65',
      '5,5.204,11.858,71492,1898,1326,23.1,-110', '6,9.572,29.424,60268,568,687,9.0,-140',
      '7,19.165,83.748,25559,86.8,1270,8.7,-195', '8,30.181,163.723,24764,102,1638,11.0,-200'
    ].join('\n'),
    source: {
      kind: 'reference',
      title: 'NASA NSSDCA｜Planetary Fact Sheet – Metric',
      url: 'https://nssdc.gsfc.nasa.gov/planetary/factsheet/',
      notes: 'NASA掲載表の1水星、2金星、3地球、4火星、5木星、6土星、7天王星、8海王星の順。距離（10^6 km）を149.5978707で割ってAU、回帰公転周期（日）を365.25で割って年へ換算し、小数第3位に丸めた。赤道半径は赤道直径の1/2。重力は回転の効果を含み、巨大ガス惑星の重力・温度は大気の1 bar水準の値。原表の定義は https://nssdc.gsfc.nasa.gov/planetary/factsheet/planetfact_notes.html 参照。転記・換算した固定スナップショットで、確認日は2026-09-17。最新版の自動取得はしない。NASA利用条件 https://www.nasa.gov/nasa-brand-center/images-and-media/ を確認し、画像・標章は含めない。'
    },
    license: { title: 'NASA Images and Media Usage Guidelines（事実情報の教育利用）', url: 'https://www.nasa.gov/nasa-brand-center/images-and-media/' },
    coverage: '太陽系8惑星／距離・公転周期・赤道半径ほか／NASA Fact Sheet Metric', checkedAt: '2026-09-17', x: 1, y: 2,
    axes: { x: { label: '太陽からの距離', unit: 'AU' }, y: { label: '公転周期', unit: '年' } }, lines: false, category: '物理・天文'
  }];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  return { list: function () { return clone(catalog); } };
}));
