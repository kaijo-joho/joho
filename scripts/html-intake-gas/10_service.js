var HtmlIntakeService = (function () {
  'use strict';
  function create(config, dep) {
    var T=HtmlIntakeContract,C=T.constants,signing=T.signing(config,dep.crypto);
    function checked(raw) {
      var record=signing.verify(raw);
      T.yes(record.kind===C.kind && T.id(record.submissionId) && T.digest(record.requestHash) && T.digest(record.sourceSha256),'receipt_invalid');
      return record;
    }
    function pending(envelope) {
      var summary=signing.sign(T.summary(checked(envelope)),envelope.keyId), raw=T.canonical(summary), key=T.outboxKey(summary.body);
      T.yes(signing.bytes(raw)<=C.maxSummaryBytes,'summary_too_large');
      var previous=dep.properties.getProperty(key);
      if(previous!==null) {
        var existing; try {existing=signing.verify(JSON.parse(previous));} catch(e) {T.fail('outbox_corrupt');}
        T.yes(T.canonical(existing)===T.canonical(summary.body),'outbox_conflict');
        return key;
      }
      dep.properties.setProperty(key,raw);
      T.yes(dep.properties.getProperty(key)===raw,'outbox_unconfirmed');
      return key;
    }
    function session(bindingToken,origin,time) {
      T.yes(config.enabled===true,'disabled');
      T.yes(typeof dep.verifyBinding==='function' && typeof dep.authorize==='function' && typeof dep.openRepository==='function','adapters_required');
      var identity=dep.identity();
      T.yes(T.account(identity.active) && identity.active===identity.effective,'execution_mode_mismatch');
      T.yes(config.allowedDomains.indexOf(identity.active.split('@')[1])>=0 && config.allowedOrigins.indexOf(origin)>=0,'account_denied');
      var binding=dep.verifyBinding(bindingToken,origin,identity.active,time);
      T.yes(binding && binding.tool==='html' && binding.account===identity.active && binding.origin===origin && binding.actorKey===signing.sha(identity.active) &&
        /^[A-Za-z0-9_-]{20,160}$/.test(binding.spreadsheetId) && T.id(binding.generation),'binding_invalid');
      return binding;
    }
    function call(action,input,bindingToken,origin) {
      // ロック・GSS・認証の待ち時間を受付時刻へ足さない。
      var receivedAt=dep.now(), binding=session(bindingToken,origin,receivedAt);
      T.yes(input && T.id(input.submissionId) && ['submit','lookup'].indexOf(action)>=0,'request_invalid');
      var lock=dep.userLock(); T.yes(lock.tryLock(1000),'busy');
      try {
        // 所有者・本人の編集権限・保護・世代・見出しはopenRepositoryが毎回検証する。
        var repo=dep.openRepository(binding), existing=repo.read(input.submissionId), record;
        if(existing) {
          record=checked(existing.envelope);
          T.yes(record.account===binding.account && record.actorKey===binding.actorKey && record.spreadsheetId===binding.spreadsheetId && record.generation===binding.generation,'account_mismatch');
        }
        if(action==='lookup') {
          if(!existing) return {state:'not-found',submissionId:input.submissionId};
          if(!existing.complete) return {state:'incomplete',submissionId:input.submissionId,requestHash:record.requestHash};
          T.yes(signing.sha(existing.source)===record.sourceSha256 && signing.bytes(existing.source)===record.byteLength,'backup_corrupt');
          pending(existing.envelope);
          return accepted(record);
        }
        T.yes(typeof input.source==='string' && input.source.length>0 && signing.bytes(input.source)<=C.maxBytes && /^html\d{2}-\d{2}$/.test(input.targetId) && input.fileName===input.targetId+'.html','request_invalid');
        var sourceSha256=signing.sha(input.source);
        T.yes(input.assessment===null || input.assessment && input.assessment.sourceSha256===sourceSha256,'source_hash_mismatch');
        T.yes(T.canonical(input.hintUsage || null).length<=8000 && T.canonical(input.assessment || null).length<=24000,'metadata_too_large');
        var requestHash=signing.sha(T.canonical({sourceSha256:sourceSha256,targetId:input.targetId,fileName:input.fileName,assessment:input.assessment,hintUsage:input.hintUsage || null}));
        if(record) T.yes(record.requestHash===requestHash,'request_conflict');
        // 既存署名の版・初回時刻を使って再開する。期間終了後も受領済み記録は消さない。
        var policy=dep.authorize({binding:binding,source:input.source,targetId:input.targetId,fileName:input.fileName,
          receivedAt:record?record.receivedAt:receivedAt,resume:!!record});
        T.yes(policy && policy.binding && Number.isSafeInteger(policy.fiscalYear) && Number.isSafeInteger(policy.grade) && Number.isSafeInteger(policy.finalDueAt),'policy_invalid');
        var fixed=policy.binding, frozen=fixed.snapshot;
        T.yes(fixed.targetId===input.targetId && frozen && signing.sha(T.canonical(frozen.body))===fixed.rubricSha256 && frozen.hash===fixed.rubricSha256 &&
          frozen.body.engineVersion===fixed.engineVersion && frozen.body.engineSourceHash===fixed.engineSourceHash && frozen.body.rubric.targetId===fixed.targetId && frozen.body.rubric.version===fixed.rubricVersion,'version_mismatch');
        var result=T.assessment(input.assessment,fixed);
        if(!record) {
          T.yes(policy.intakeEnabled===true,'intake_closed');
          // startAtは配付だけの判定。提出は受領時刻と最終期限で判定する。
          T.yes(receivedAt<=policy.finalDueAt || policy.lateSubmissionPolicy==='history-only','deadline_passed');
          var previousAt=repo.lastReceivedAt(input.targetId);
          T.yes(previousAt===null || receivedAt-previousAt>=60000,'cooldown');
          record={kind:C.kind,account:binding.account,actorKey:binding.actorKey,spreadsheetId:binding.spreadsheetId,generation:binding.generation,
            submissionId:input.submissionId,requestHash:requestHash,targetId:input.targetId,fileName:input.fileName,sourceSha256:sourceSha256,byteLength:signing.bytes(input.source),
            templateVersion:fixed.templateVersion,templateSha256:fixed.templateSha256,rubricVersion:fixed.rubricVersion,rubricSha256:fixed.rubricSha256,
            engineVersion:fixed.engineVersion,engineSourceHash:fixed.engineSourceHash,receivedAt:receivedAt,fiscalYear:policy.fiscalYear,grade:policy.grade,
            finalDueAt:policy.finalDueAt,result:result,hintUsage:input.hintUsage || null};
        } else {
          T.yes(record.fiscalYear===policy.fiscalYear && record.grade===policy.grade && ['templateVersion','templateSha256','rubricVersion','rubricSha256','engineVersion','engineSourceHash'].every(function(k){return record[k]===fixed[k];}) && T.canonical(record.result)===T.canonical(result),'resume_mismatch');
        }
        var envelope=existing?existing.envelope:signing.sign(record);
        repo.save(input.submissionId,input.source,envelope);
        var saved=repo.read(input.submissionId);
        T.yes(saved && saved.complete && saved.source===input.source && T.canonical(saved.envelope)===T.canonical(envelope),'backup_unconfirmed');
        checked(saved.envelope); pending(saved.envelope);
        return accepted(record);
      } finally {lock.releaseLock();}
    }
    function accepted(r) { return {state:'accepted',submissionId:r.submissionId,requestHash:r.requestHash,sourceSha256:r.sourceSha256,receivedAt:r.receivedAt,
      targetId:r.targetId,templateVersion:r.templateVersion,rubricVersion:r.rubricVersion,engineVersion:r.engineVersion,result:T.clone(r.result),transfer:'pending-or-collected'}; }
    return {call:call,restorePending:pending};
  }
  return {create:create};
})();
