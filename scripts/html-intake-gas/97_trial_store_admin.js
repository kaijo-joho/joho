// 利用者実行GASの所有教員だけが実行する保存先登録。Driveの作成・共有権限を要求しない。
var HtmlIntakeTrialStores = (function () {
  'use strict';
  function create(env) {
    var L=HtmlIntakeStoreLayout,C=L.constants,T=HtmlIntakeContract;
    function owner() {
      var setup=env.setup(),who=env.identity();
      L.yes(setup && setup.schema===1 && setup.scriptId===env.scriptId() && who.active===setup.owner && who.effective===setup.owner &&
        Array.isArray(setup.accounts) && setup.accounts.length===2 && new Set(setup.accounts).size===2 &&
        setup.accounts.every(function(a){return T.account(a) && a!==setup.owner;}),'trial_owner_required');
      return setup;
    }
    function validate(value,setup) {
      L.yes(value && value.schema===1 && value.enabled===false && value.owner===setup.owner && value.intakeScriptId===setup.scriptId &&
        T.id(value.scopeId) && Array.isArray(value.entries) && value.entries.length===2,'trial_registry_invalid');
      var ids={},generations={};
      value.entries.forEach(function(b,i){
        L.yes(b && b.account===setup.accounts[i] && b.actorKey===env.sha(b.account) && b.owner===setup.owner &&
          b.intakeScriptId===setup.scriptId && b.scopeId===value.scopeId && T.id(b.generation) && !generations[b.generation] &&
          /^[A-Za-z0-9_-]{20,160}$/.test(b.spreadsheetId) && !ids[b.spreadsheetId] && /^[A-Za-z0-9_-]{20,160}$/.test(b.individualFolderId),'trial_registry_invalid');
        ids[b.spreadsheetId]=true;generations[b.generation]=true;L.inspect(env.open(b.spreadsheetId),b,env);
      });return value;
    }
    function inspect() {
      var setup=owner(),raw=env.properties.getProperty(C.registryKey),value=null;
      if(raw){try{value=JSON.parse(raw);}catch(_){L.fail('trial_registry_invalid');}validate(value,setup);}
      return {kind:'html-intake-trial-stores-inspection-v1',ownerVerified:true,allowedAccountCount:2,
        backupSheetsConfigured:!!value,backupSheetsVerified:!!value,enabled:false,createdStudentData:false,sharingChanged:false,triggersCreated:false};
    }
    function configure(exported) {
      var setup=owner(),lock=env.lock();L.yes(lock.tryLock(1000),'trial_busy');
      try {
        L.yes(exported && exported.kind==='html-intake-trial-registry-export-v1' && exported.schema===1 &&
          exported.intakeScriptId===setup.scriptId && T.id(exported.scopeId) && Array.isArray(exported.entries) && exported.entries.length===2,'trial_registry_invalid');
        var value={schema:1,enabled:false,scopeId:exported.scopeId,owner:setup.owner,intakeScriptId:setup.scriptId,
          entries:exported.entries.map(function(b,i){L.yes(b && b.accountIndex===i,'trial_registry_invalid');var copy=T.clone(b);delete copy.accountIndex;delete copy.url;copy.account=setup.accounts[i];return copy;})};
        validate(value,setup);var raw=T.canonical(value),old=env.properties.getProperty(C.registryKey);
        L.yes(T.bytes(raw)<=8000 && (old===null || old===raw),'trial_registry_conflict');
        if(old===null)env.properties.setProperty(C.registryKey,raw);
        L.yes(env.properties.getProperty(C.registryKey)===raw,'trial_registry_write_uncertain');
        return inspect();
      }finally{lock.releaseLock();}
    }
    return {inspect:inspect,configure:configure};
  }
  return {create:create};
})();
function htmlIntakeTrialStoresEnvironment_(){
  return {setup:function(){return htmlIntakeTrialSetup_();},identity:function(){return {active:Session.getActiveUser().getEmail(),effective:Session.getEffectiveUser().getEmail()};},
    scriptId:function(){return ScriptApp.getScriptId();},properties:PropertiesService.getScriptProperties(),lock:function(){return LockService.getScriptLock();},
    sha:HtmlIntakeContract.sha,open:function(id){return SpreadsheetApp.openById(id);},rangeProtectionType:SpreadsheetApp.ProtectionType.RANGE};
}
function run_configureHtmlIntakeTrialStores(){
  var result=HtmlIntakeTrialStores.create(htmlIntakeTrialStoresEnvironment_()).configure(htmlIntakeTrialStoreImport_());
  console.log(JSON.stringify(result));return result;
}
function run_verifyHtmlIntakeTrialStores(){var result=HtmlIntakeTrialStores.create(htmlIntakeTrialStoresEnvironment_()).inspect();console.log(JSON.stringify(result));return result;}
