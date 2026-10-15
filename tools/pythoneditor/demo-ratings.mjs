// UI表示のための固定例。採点・提出の結果として使用せず、保存もしない。
export const demoRatings = new Map([
  ['demo-v1/demo-print', { earned: 3, total: 5 }],
  ['demo-v1/demo-input', { earned: 4, total: 7 }],
  ['demo-v2/demo-plot', { earned: 5, total: 8 }],
  ['demo-subquestions-v1/demo-temperature-01', { earned: 4, total: 7 }],
  ['demo-subquestions-v1/demo-temperature-02', { earned: 6, total: 8 }],
  ['demo-subquestions-v1/demo-table-01', { earned: 5, total: 9 }],
  ['demo-subquestions-v1/demo-boxes-01', { earned: 3, total: 8 }],
  ['demo-v1/demo-plot', { earned: 5, total: 8 }]
].map(([key, rating]) => [key, Object.freeze({ ...rating, example: true })]));
