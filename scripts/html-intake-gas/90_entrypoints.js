// 本番未接続。専用保存プロジェクトの本人/原本/台帳アダプター承認後にだけ接続する。
// dist・gradeへ単独でこのファイルをpushしない。doGetや既存RPCを置換しない。
function htmlIntakeCandidateConfig_() {
  return {enabled:false,allowedOrigins:[],allowedDomains:[],teacherAccounts:[],activeKeyId:'',receiptKeys:{}};
}
function htmlIntakeRpc(action,input,binding,origin) {
  var config=htmlIntakeCandidateConfig_();
  if(!config.enabled)return {ok:false,error:{code:'disabled',message:'新しい提出受付は準備中です。通常の提出フォームを使ってください。'}};
  // fail closed: 明示した実環境アダプターなしに試験用依存やclientのGSSIDを使わない。
  return {ok:false,error:{code:'adapters_required',message:'新しい提出受付の接続設定を確認できません。'}};
}
