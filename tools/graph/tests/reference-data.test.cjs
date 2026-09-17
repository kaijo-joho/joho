const assert = require('node:assert/strict');
const Catalog = require('../open-data-catalog.js');
const Data = require('../data-import.js');

const byId = new Map(Catalog.list().map(item => [item.id, item]));
function numericRows(id) {
  return Data.parse(byId.get(id).csv).records.slice(1).map(row => row.map(Number));
}

// 気象庁「世界の年平均気温偏差（℃）」の2000–2024年全行を転記照合する。
assert.deepEqual(numericRows('jma-global-temperature-anomaly-2000-2024'), [
  [2000,-0.19,-0.20,-0.17], [2001,-0.05,-0.07,-0.04], [2002,0,-0.04,0.03], [2003,0.01,0.01,0.01], [2004,-0.05,-0.05,-0.05],
  [2005,0.06,0.09,0.02], [2006,0.02,0.05,0], [2007,0,0.06,-0.06], [2008,-0.08,-0.07,-0.08], [2009,0.03,-0.02,0.08],
  [2010,0.11,0.14,0.07], [2011,-0.05,-0.06,-0.04], [2012,0.01,0,0.03], [2013,0.07,0.06,0.08], [2014,0.13,0.15,0.10],
  [2015,0.30,0.38,0.20], [2016,0.35,0.43,0.26], [2017,0.26,0.34,0.17], [2018,0.16,0.19,0.13], [2019,0.31,0.38,0.23],
  [2020,0.34,0.51,0.16], [2021,0.22,0.35,0.09], [2022,0.24,0.35,0.11], [2023,0.54,0.68,0.38], [2024,0.63,0.81,0.41]
]);

// 気象庁「日本の年平均気温偏差（℃）」の2000–2024年全行を転記照合する。
assert.deepEqual(numericRows('jma-japan-temperature-anomaly-2000-2024'), [
  [2000,-0.03], [2001,-0.35], [2002,-0.01], [2003,-0.36], [2004,0.46], [2005,-0.32], [2006,-0.10], [2007,0.30], [2008,-0.08], [2009,0],
  [2010,0.30], [2011,-0.17], [2012,-0.26], [2013,0.04], [2014,-0.16], [2015,0.39], [2016,0.58], [2017,-0.05], [2018,0.38], [2019,0.62],
  [2020,0.65], [2021,0.61], [2022,0.60], [2023,1.29], [2024,1.48]
]);

// NOAA GML Mauna Loa annual mean dataの2000–2024年全行を転記照合する。
assert.deepEqual(numericRows('noaa-mauna-loa-co2-annual-2000-2024'), [
  [2000,369.71,0.12], [2001,371.32,0.12], [2002,373.45,0.12], [2003,375.98,0.12], [2004,377.70,0.12],
  [2005,379.98,0.12], [2006,382.09,0.12], [2007,384.02,0.12], [2008,385.83,0.12], [2009,387.64,0.12],
  [2010,390.10,0.12], [2011,391.85,0.12], [2012,394.06,0.12], [2013,396.74,0.12], [2014,398.81,0.12],
  [2015,401.01,0.12], [2016,404.41,0.12], [2017,406.76,0.12], [2018,408.72,0.12], [2019,411.65,0.12],
  [2020,414.21,0.12], [2021,416.41,0.12], [2022,418.53,0.12], [2023,421.08,0.12], [2024,424.61,0.12]
]);

for (const id of [
  'jma-global-temperature-anomaly-2000-2024',
  'jma-japan-temperature-anomaly-2000-2024',
  'noaa-mauna-loa-co2-annual-2000-2024'
]) {
  const item = byId.get(id);
  assert.equal(item.checkedAt, '2026-09-17');
  assert.match(item.source.notes, /固定スナップショット/);
  assert.match(item.source.notes, /2026-09-17/);
  assert.match(item.source.url, /^https:\/\//);
  assert.match(item.license.url, /^https:\/\//);
  const inspection = Data.inspect(Data.parse(item.csv));
  assert.equal(inspection.rows.length, 25);
  assert.ok(inspection.columns.every(column => column.type === 'number'));
}

console.log('reference-data.test.cjs: ok');
