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
    lines: true
  }];

  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  return { list: function () { return clone(catalog); } };
}));
