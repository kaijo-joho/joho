// 現行の共通提出ログへ追加する行。旧recordJson・日時・ファイルは一切変更しない。
var HtmlIntakeTeacherLog = (function () {
  'use strict';
  function project(r,envelope) {
    var T=HtmlIntakeContract;
    T.yes(r.kind===T.constants.summaryKind && T.account(r.account) && T.id(r.submissionId),'summary_invalid');
    var userId=r.account.split('@')[0];
    return {Timestamp:r.receivedAt,userId:userId,kadai:r.targetId,fileId:'',
      fileUrl:'https://docs.google.com/spreadsheets/d/'+r.spreadsheetId+'/edit',tokne:'',
      score:r.result.score===null?'':r.result.score,inquaryUrl:'',detailJson:T.canonical({rules:r.result.rules}),
      fiscalYear:r.fiscalYear,cohortCode:userId[0]==='1'?userId.slice(0,3):'',grade:r.grade,
      assignmentType:'html',assignmentId:r.targetId,submissionMode:'auto',submissionId:r.submissionId,
      artifactSha256:r.sourceSha256,manifestFileId:'',issueId:'',proofStatus:'verified-at-intake',
      templateVersion:r.templateVersion,rubricVersion:r.rubricVersion,engineVersion:r.engineVersion,
      gradingState:r.result.state,gradingRunId:r.submissionId,requestedGradingMode:'local',effectiveGradingMode:'local',
      receiptKind:T.constants.kind,recordJson:T.canonical({kind:T.constants.kind,summary:envelope})};
  }
  function create(book,dep) {
    var T=HtmlIntakeContract;
    function table(body) {
      var sheet=book.getSheetByName(T.sheetName(body.account.split('@')[0])); T.yes(sheet,'teacher_sheet_missing');
      var header=sheet.getRange(1,1,1,sheet.getLastColumn()).getValues()[0];
      var normalized=header.map(function(name){return name==='token'?'tokne':name;});
      var fields=Object.keys(project(body,{keyId:'unused',body:{},signature:''}));
      T.yes(new Set(normalized).size===normalized.length && fields.every(function(k){return normalized.indexOf(k)>=0;}),'teacher_schema_mismatch');
      return {sheet:sheet,header:normalized};
    }
    function find(body) {
      var t=table(body),last=t.sheet.getLastRow();if(last<2)return null;
      var ids=t.sheet.getRange(2,t.header.indexOf('submissionId')+1,last-1,1).getValues();
      var matches=ids.map(function(v,i){return v[0]===body.submissionId?i+2:0;}).filter(Boolean);
      T.yes(matches.length<=1,'teacher_log_duplicate'); if(!matches.length)return null;
      var row=t.sheet.getRange(matches[0],1,1,t.header.length).getValues()[0],expected=project(body,{keyId:'unused',body:{},signature:''}),result={};
      // 比較は投影した列だけ。手動列・既存列の意味を上書きしない。
      Object.keys(expected).forEach(function(k){var v=row[t.header.indexOf(k)];result[k]=k==='Timestamp' && v instanceof Date?v.getTime():v;});
      return result;
    }
    function append(row,body) {
      // このアダプターは旧gradeの書込側へ配置する。同じGSSを別プロジェクトの
      // ScriptLockだけで直接追記すると、旧フォームとの同時書込で行を失い得る。
      T.yes(typeof dep.legacyWriterLock==='function','legacy_writer_lock_required');
      var lock=dep.legacyWriterLock();T.yes(lock.tryLock(1000),'teacher_writer_busy');
      try {
        if(find(body))return;
        var t=table(body),last=t.sheet.getLastRow()+1;
        T.yes(last<=t.sheet.getMaxRows(),'teacher_sheet_full');
        var values=t.header.map(function(k){return k==='Timestamp'?new Date(row[k]):Object.prototype.hasOwnProperty.call(row,k)?row[k]:'';});
        t.sheet.getRange(last,1,1,values.length).setValues([values]); dep.flush();
      } finally {lock.releaseLock();}
    }
    return {find:find,append:append};
  }
  return {project:project,create:create};
})();
