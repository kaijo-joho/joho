var HtmlIntakeOutbox = (function () {
  'use strict';
  function create(config,dep) {
    var T=HtmlIntakeContract,C=T.constants,signing=T.signing(config,dep.crypto);
    function teacher() {
      var identity=dep.identity();
      T.yes(T.account(identity.active) && identity.active===identity.effective && config.teacherAccounts.indexOf(identity.active)>=0,'teacher_required');
    }
    function collect(limit) {
      teacher(); T.yes(Number.isInteger(limit) && limit>0 && limit<=100,'batch_invalid');
      // 生徒受付はUserLockのみ。このScriptLockは転記処理同士だけを止める。
      var lock=dep.collectorLock(); T.yes(lock.tryLock(1000),'collector_busy');
      try {
        var snapshot=dep.properties.getProperties(), entries=[], invalid=0, bytes=0,oldest=null;
        Object.keys(snapshot).filter(function(k){return k.slice(0,C.prefix.length)===C.prefix;}).forEach(function(key){
          bytes+=signing.bytes(key+snapshot[key]);
          try {
            var envelope=JSON.parse(snapshot[key]),body=signing.verify(envelope);
            T.yes(body.kind===C.summaryKind && T.outboxKey(body)===key,'summary_invalid');
            entries.push({key:key,raw:snapshot[key],body:body,envelope:envelope});
            oldest=oldest===null?body.receivedAt:Math.min(oldest,body.receivedAt);
          } catch(e) {invalid++;}
        });
        entries.sort(function(a,b){return a.body.receivedAt-b.body.receivedAt || a.key.localeCompare(b.key);});
        var processed=0,failed=0;
        entries.slice(0,limit).forEach(function(entry){
          try {
            // 署名・版・集計対象をサーバー側で再照合。ここでは個人GSSの本文を読まない。
            dep.validateSummary(entry.body);
            var expected=HtmlIntakeTeacherLog.project(entry.body,entry.envelope), actual=dep.teacherLog.find(entry.body);
            if(actual) T.yes(T.canonical(actual)===T.canonical(expected),'teacher_log_conflict');
            else dep.teacherLog.append(expected,entry.body);
            T.yes(T.canonical(dep.teacherLog.find(entry.body))===T.canonical(expected),'teacher_log_unconfirmed');
            // 古い一覧で、転記中の新規到着や復旧で置換された値を削除しない。
            if(dep.properties.getProperty(entry.key)===entry.raw) dep.properties.deleteProperty(entry.key);
            processed++;
          } catch(e) {failed++;}
        });
        return {pending:entries.length+invalid,valid:entries.length,invalid:invalid,bytes:bytes,oldestReceivedAt:oldest,processed:processed,failed:failed};
      } finally {lock.releaseLock();}
    }
    function recover(records, repairCorrupt) {
      teacher(); T.yes(Array.isArray(records) && records.length<=100,'batch_invalid');
      var restored=0,conflicts=0;
      records.forEach(function(record){
        try {
          var receipt=signing.verify(record.envelope);
          T.yes(receipt.kind===C.kind && record.complete===true && signing.sha(record.source)===receipt.sourceSha256 && signing.bytes(record.source)===receipt.byteLength,'backup_corrupt');
          dep.validateReceipt(receipt); // trusted registryの本人/GSSID/世代と照合。client指定GSSIDは禁止。
          var summary=signing.sign(T.summary(receipt),record.envelope.keyId),key=T.outboxKey(summary.body),raw=T.canonical(summary),previous=dep.properties.getProperty(key);
          T.yes(signing.bytes(raw)<=C.maxSummaryBytes,'summary_too_large');
          if(previous!==null) {
            try { T.yes(T.canonical(signing.verify(JSON.parse(previous)))===T.canonical(summary.body),'outbox_conflict'); return; }
            catch(e) {
              T.yes(repairCorrupt===true && typeof dep.quarantine==='function','outbox_conflict');
              // 壊れた元値を退避・読戻ししてから、検証済み個人GSSの署名から再生成する。
              T.yes(dep.quarantine(key,previous)===true && dep.properties.getProperty(key)===previous,'quarantine_unconfirmed');
            }
          }
          dep.properties.setProperty(key,raw); T.yes(dep.properties.getProperty(key)===raw,'outbox_unconfirmed'); restored++;
        } catch(e) {conflicts++;}
      });
      return {restored:restored,conflicts:conflicts};
    }
    return {collect:collect,recover:recover};
  }
  return {create:create};
})();
