// 教員が準備した個人GSSの固定構成。生徒向け処理では作成・共有・保護を変更しない。
var HtmlIntakeStoreLayout = (function () {
  'use strict';
  var C = Object.freeze({kind:'html-intake-trial-store-v1',guide:'使い方',meta:'HTML設定',sheet:'HTML提出',rows:6001,
    headers:['submissionId','recordKind','metaJson','payload'],registryKey:'HTML_INTAKE_TRIAL_STORES_V1'});
  function fail(code) { var e=new Error(code);e.htmlIntakeCode=code;throw e; }
  function yes(ok,code) { if(!ok)fail(code); }
  function canonical(value) {
    if(value===null || typeof value!=='object')return JSON.stringify(value);
    if(Array.isArray(value))return '['+value.map(canonical).join(',')+']';
    return '{'+Object.keys(value).sort().map(function(k){return JSON.stringify(k)+':'+canonical(value[k]);}).join(',')+'}';
  }
  function metadata(binding,state) {
    return [['schemaVersion',1],['kind',C.kind],['actorKey',binding.actorKey],['generation',binding.generation],['state',state],
      ['teacherOwner',binding.owner],['scopeId',binding.scopeId],['intakeScriptId',binding.intakeScriptId],
      ['recordRows',C.rows],['boundFolderId',binding.individualFolderId]];
  }
  function protection(sheet,rows,columns,owner,env) {
    var found=sheet.getProtections(env.rangeProtectionType).some(function(p){
      var r=p.getRange();
      return r && r.getRow()===1 && r.getColumn()===1 && r.getNumRows()===rows && r.getNumColumns()===columns &&
        !p.isWarningOnly() && !p.canDomainEdit() && typeof p.getTargetAudiences==='function' && p.getTargetAudiences().length===0 &&
        p.getEditors().every(function(user){return user.getEmail()===owner;});
    });
    yes(found,'store_protection_mismatch');
  }
  function inspect(book,binding,env) {
    yes(book.getId()===binding.spreadsheetId && book.getOwner() && book.getOwner().getEmail()===binding.owner,'store_owner_mismatch');
    var editors=book.getEditors().map(function(user){return user.getEmail();}).filter(function(email){return email!==binding.owner;}).sort();
    yes(canonical(editors)===canonical([binding.account]) && book.getViewers().every(function(user){
      return user.getEmail()===binding.owner || user.getEmail()===binding.account;
    }),'store_sharing_mismatch');
    var meta=book.getSheetByName(C.meta),sheet=book.getSheetByName(C.sheet),guide=book.getSheetByName(C.guide);
    yes(meta && sheet && guide && meta.isSheetHidden() && sheet.isSheetHidden() && !guide.isSheetHidden(),'store_schema_mismatch');
    var fixed=metadata(binding,'active'),range=meta.getRange(1,1,fixed.length,2);
    yes(canonical(range.getValues())===canonical(fixed) && range.getFormulas().every(function(row){return row.every(function(v){return v==='';});}),'store_metadata_mismatch');
    protection(meta,fixed.length,2,binding.owner,env);
    var header=sheet.getRange(1,1,1,C.headers.length);
    yes(sheet.getMaxRows()>=C.rows && sheet.getMaxColumns()>=C.headers.length && sheet.getLastRow()<=C.rows &&
      canonical(header.getValues()[0])===canonical(C.headers) && header.getFormulas()[0].every(function(v){return v==='';}),'store_schema_mismatch');
    protection(sheet,1,C.headers.length,binding.owner,env);
    return {book:book,sheet:sheet};
  }
  return Object.freeze({constants:C,canonical:canonical,yes:yes,fail:fail,metadata:metadata,protection:protection,inspect:inspect});
})();
