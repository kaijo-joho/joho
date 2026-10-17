// 新設したGASの所有者がIDEで行う読取り確認。GSS作成・共有・有効化はしない。
function run_inspectHtmlIntakeTrial() {
  var setup=htmlIntakeTrialSetup_(),active=Session.getActiveUser().getEmail(),effective=Session.getEffectiveUser().getEmail();
  if(!setup || setup.schema!==1 || active!==setup.owner || effective!==setup.owner || !Array.isArray(setup.accounts) || setup.accounts.length!==2 || new Set(setup.accounts).size!==2) throw new Error('trial_owner_required');
  var properties=PropertiesService.getScriptProperties();
  var result={kind:'html-intake-setup-inspection-v1',ownerVerified:true,allowedAccountCount:2,
    enabled:false,backupSheetsConfigured:!!properties.getProperty('HTML_INTAKE_TRIAL_STORES_V1'),
    createdStudentData:false,sharingChanged:false,triggersCreated:false};
  console.log(JSON.stringify(result));return result;
}
