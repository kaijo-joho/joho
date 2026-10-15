// 有効化とURL設定は、本番GAS・権限の確認後に行う。URLパラメーターから受け取らない。
export const toolsStoreConfig = Object.freeze({
  enabled: false,
  // 採点用GAS・教員側回収の設定を実機確認してから個別に有効化する。
  studentGrading: false,
  distURL: '',
  autosave: Object.freeze({ idleMs: 4000, minIntervalMs: 20000, maxWaitMs: 30000, jitterMs: 3000 })
});
