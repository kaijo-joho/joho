// 有効化とURL設定は、本番GAS・権限の確認後に行う。URLパラメーターから受け取らない。
export const toolsStoreConfig = Object.freeze({
  enabled: false,
  distURL: '',
  autosave: Object.freeze({ idleMs: 600000, minIntervalMs: 20000, maxWaitMs: 600000, jitterMs: 0 })
});
