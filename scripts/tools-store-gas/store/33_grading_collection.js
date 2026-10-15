// 教員実行だけが本人GSSの署名済み採点を中央へ集約し、正式完了ackを発行する。
var ToolsGradingCollection = (function () {
  'use strict';
  var CURSOR = 'TOOLS_GRADING_COLLECTOR_CURSOR_V1';
  var LAST_RUN = 'TOOLS_GRADING_COLLECTION_LAST_RUN_V1';
  function create(rootConfig, dependencies) {
    var dep = dependencies || {}, H = ToolsStudentGrading.helpers;
    function teacher(c, approvedTrigger) {
      var identity = dep.identity ? dep.identity() : { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() };
      var effective = H.normalized(identity.effective), allowed = c.teacherAccounts.map(H.normalized);
      H.assert(allowed.indexOf(effective) >= 0 && (identity.active ? H.normalized(identity.active) === effective : approvedTrigger && approvedTrigger.account === effective), 'collector_not_allowed');
      return effective;
    }
    function syncEnvironment(c) {
      return dep.syncEnvironment || {
        properties: dep.properties || PropertiesService.getScriptProperties(),
        lock: dep.lock || function () { return LockService.getScriptLock(); },
        identity: dep.identity || function () { return { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() }; },
        teacherOwners: function () { return c.teacherAccounts; },
        allowedDomains: function () { return rootConfig.allowedDomains || c.teacherAccounts.map(function (a) { return a.split('@')[1]; }).filter(function (v, i, a) { return a.indexOf(v) === i; }); },
        commonTeachers: function () { return typeof Common !== 'undefined' && Array.isArray(Common.TEACHERS) ? Common.TEACHERS : null; },
        triggers: dep.triggers || function () { return ScriptApp.getProjectTriggers(); },
        createTrigger: dep.createTrigger || function (handler, minutes) { var clock = ScriptApp.newTrigger(handler).timeBased(); return (minutes === 60 ? clock.everyHours(1) : clock.everyMinutes(minutes)).create(); },
        deleteTrigger: dep.deleteTrigger || function (trigger) { ScriptApp.deleteTrigger(trigger); }
      };
    }
    function ownedBook(id, c) {
      var book = dep.openBook ? dep.openBook(id) : SpreadsheetApp.openById(id);
      var owner = dep.owner ? dep.owner(id, book) : book.getOwner();
      owner = typeof owner === 'string' ? owner : owner && owner.getEmail();
      H.assert(book.getId() === id && owner && c.teacherAccounts.map(H.normalized).indexOf(H.normalized(owner)) >= 0, 'collector_owner_mismatch');
      return book;
    }
    function assertStudentBook(book, account) {
      H.verifyTables(book, dep, false);
      var guide = book.getSheetByName('使い方');
      H.assert(guide && !guide.isSheetHidden(), 'collector_store_invalid');
      var cells = guide.getRange(1, 1, 6, 2), rows = cells.getValues();
      var labels = ['schemaVersion', 'actorKey', 'generation', 'state', 'kind', 'teacherOwner'];
      H.assert(rows.every(function (r, i) { return r[0] === labels[i]; }) && Number(rows[0][1]) === 1 &&
        rows[1][1] === ToolsStoreContract.actorKey(account) && /^[a-f0-9]{32}$/.test(rows[2][1]) && rows[3][1] === 'active' && rows[4][1] === 'tools-store-v1' &&
        cells.getFormulas().every(function (r) { return r.every(function (v) { return v === ''; }); }), 'collector_store_invalid');
    }
    function requestIds(book, actorKey) {
      var table = book.getSheetByName(ToolsStudentGrading.names.requests), count = table.getLastRow() - 1;
      H.assert(count >= 0 && count <= ToolsStudentGrading.rows - 1, 'collector_store_invalid');
      if (!count) return [];
      var rows = table.getRange(2, 3, count, 4).getValues(), found = Object.create(null), result = [];
      rows.forEach(function (r) {
        // これは索引だけ。採用前に必ずStoreで行全文/HMACを検証する。
        if (r[0] !== actorKey || !/^[a-f0-9]{32}$/.test(r[3])) return;
        H.assert(!found[r[3]], 'collector_record_invalid'); found[r[3]] = true; result.push(r[3]);
      });
      return result;
    }
    function validateReceipt(receipt, actor, adopted) {
      H.assert(receipt && receipt.actorKey === actor.key && receipt.body && receipt.recordKey === PythonEditor.hashText(actor.key + '/' + receipt.requestId) &&
        PythonEditor.iso(receipt.at) && Date.parse(receipt.at) <= H.nowMs(dep) + 30000, 'collector_record_invalid');
      var input = PythonEditor.submission(receipt.body, PythonEditor.hashText), p = receipt.policy;
      H.assert(PythonEditor.canonical(input) === PythonEditor.canonical(receipt.body) && receipt.requestId === input.requestId && PythonEditor.key(input) === PythonEditor.key(receipt) &&
        receipt.payloadHash === PythonEditor.hashText(PythonEditor.canonical(input)), 'collector_record_invalid');
      var frozen = adopted.findSnapshot(receipt);
      H.assert(frozen && frozen.body && frozen.body.graded && frozen.payloadHash === receipt.snapshotHash &&
        frozen.payloadHash === PythonEditor.hashText(PythonEditor.canonical(frozen.body)), 'collector_snapshot_mismatch');
      H.assert(p && p.assignmentId === input.assignmentId && Number.isInteger(p.year) && p.year >= 2026 && Number.isInteger(p.grade) && p.grade >= 1 && p.grade <= 6 &&
        p.setId === frozen.body.question.setId && p.version === receipt.version && PythonEditor.iso(p.startsAt) && PythonEditor.iso(p.dueAt) && PythonEditor.iso(p.closesAt) &&
        p.startsAt <= p.dueAt && p.dueAt <= p.closesAt && receipt.at >= p.startsAt && receipt.at <= p.closesAt &&
        receipt.groupKey === PythonEditor.gradeGroup(actor.key, p, receipt.questionId), 'collector_policy_invalid');
      return frozen;
    }
    function centralStore(c) {
      var book = ownedBook(c.centralSpreadsheetId, c), teachers = c.teacherAccounts.map(H.normalized);
      H.assert(typeof book.getEditors === 'function' && typeof book.getViewers === 'function', 'collector_central_acl_unverified');
      var access = book.getEditors().concat(book.getViewers());
      H.assert(access.every(function (user) { return user && teachers.indexOf(H.normalized(user.getEmail())) >= 0; }), 'collector_central_acl_unverified');
      // Spreadsheet APIはリンク/ドメイン共有を列挙できないため、その実設定確認は配備前の別工程。
      if (dep.central) return dep.central;
      // 正式点数の原本は既存の教員専用4表。旧grade/Colab用の一般ログは使用しない。
      return PythonEditorStore.create({ storageSpreadsheetId: c.centralSpreadsheetId }, { book: book,
        lock: function () { return { tryLock: function () { return true; }, releaseLock: function () {} }; }, flush: dep.flush });
    }
    function identicalAcceptance(central, local) {
      ['recordKey', 'groupKey', 'actorKey', 'questionId', 'version', 'requestId', 'at', 'snapshotHash', 'payloadHash'].forEach(function (key) {
        H.assert(central[key] === local[key], 'collector_central_conflict');
      });
      H.assert(PythonEditor.canonical(central.policy) === PythonEditor.canonical(local.policy) && PythonEditor.canonical(central.body) === PythonEditor.canonical(local.body), 'collector_central_conflict');
    }
    function collectOne(c, adopted, service, central, entry, actor, own, requestId, recheck) {
      var receipt = own.local.findRequest(actor.key, requestId);
      var frozen = validateReceipt(receipt, actor, adopted);
      var result = own.local.findResult(actor.key, requestId);
      if (!result) return { state: 'waiting_grade', requestId: requestId };
      H.checkResult(result, receipt);
      var ack = own.ack.findResult(actor.key, requestId);
      if (ack) {
        H.checkResult(ack, receipt);
        H.assert(ack.body.collection && ack.body.collection.keyId === c.keyId && ack.body.collection.recordKey === receipt.recordKey, 'collector_ack_invalid');
        return { state: 'completed', requestId: requestId, duplicate: true };
      }
      recheck();
      var master = central.findSnapshot(receipt);
      H.assert(master && master.payloadHash === frozen.payloadHash && master.payloadHash === PythonEditor.hashText(PythonEditor.canonical(master.body)), 'collector_snapshot_mismatch');
      var accepted = central.accept(actor.key, receipt.body, master, receipt.policy, receipt.at, recheck);
      identicalAcceptance(accepted, receipt);
      var recorded = central.finish(accepted, result.body, result.at, recheck);
      H.checkResult(recorded, accepted);
      H.assert(PythonEditor.canonical(recorded.body) === PythonEditor.canonical(result.body), 'collector_central_conflict');
      // 中央の受付・結果・再提出履歴を別の読戻しで確認してから正式ackを署名する。
      var readRequest = central.findRequest(actor.key, requestId), readResult = central.findResult(actor.key, requestId);
      identicalAcceptance(readRequest, receipt); H.checkResult(readResult, readRequest);
      H.assert(PythonEditor.canonical(readResult) === PythonEditor.canonical(recorded), 'collector_central_conflict');
      var history = central.results(receipt.groupKey);
      H.assert(history.filter(function (row) { return row.requestId === requestId && row.recordKey === receipt.recordKey && PythonEditor.canonical(row) === PythonEditor.canonical(recorded); }).length === 1, 'collector_central_conflict');
      recheck();
      var body = Object.assign({}, recorded.body, { collection: { keyId: c.keyId, recordKey: recorded.recordKey,
        resultHash: PythonEditor.hashText(PythonEditor.canonical(recorded)), collectedAt: H.nowISO(dep) } });
      var saved = own.ack.finish(receipt, body, recorded.at, recheck);
      H.checkResult(saved, receipt);
      H.assert(saved.body.collection && saved.body.collection.resultHash === PythonEditor.hashText(PythonEditor.canonical(recorded)), 'collector_ack_invalid');
      return { state: 'completed', requestId: requestId, duplicate: false };
    }
    function statusCode(error) {
      var value = error && (error.toolsStoreCode || error.pythonEditorCode) || 'collector_failed';
      return typeof value === 'string' && /^[A-Za-z0-9_]{1,60}$/.test(value) ? value : 'collector_failed';
    }
    function summary(reports, adopted, next, started, fatal) {
      var codes = Object.create(null), completed = 0, waiting = 0, failed = 0;
      function add(code) {
        if (!codes[code] && Object.keys(codes).length >= 19) code = 'other';
        codes[code] = (codes[code] || 0) + 1;
      }
      reports.forEach(function (r) {
        completed += r.completed; waiting += r.waitingGrade; if (r.errors.length) failed++;
        r.errors.forEach(function (e) { add(statusCode({ toolsStoreCode: e.code })); });
      });
      if (fatal) add(statusCode(fatal));
      return { schema: 1, at: H.nowISO(dep), state: fatal ? 'failed' : failed ? 'partial_error' : 'ok',
        generation: adopted ? adopted.meta.generation : null, processedStudents: reports.length, completed: completed, waitingGrade: waiting,
        failedStudents: failed, errorCodes: codes, nextCursor: next || 0, registryCount: adopted ? adopted.registry.length : 0,
        durationMs: Math.max(0, Math.floor(H.nowMs(dep) - started)) };
    }
    function writeSummary(properties, value) {
      // 固定ASCIIキー/コード・数値だけ。本文、メール、個人ID、鍵は記録しない。
      var raw = JSON.stringify(value);
      try {
        H.assert(raw.length < 8000, 'collector_status_write_failed');
        properties.setProperty(LAST_RUN, raw);
        H.assert(properties.getProperty(LAST_RUN) === raw, 'collector_status_write_failed');
      } catch (error) {
        H.assert(false, 'collector_status_write_failed', '採点・提出の記録は保持していますが、集約処理の状態記録を確認できません。教員側の実行履歴を確認してください。');
      }
    }
    function inspect() {
      var c = H.settings(rootConfig);
      ToolsGradingSync.create(syncEnvironment(c)).authorizeTeacher(null, { handler: 'runToolsGradingCollectionV1_', triggerKey: 'TOOLS_GRADING_COLLECTION_TRIGGER_V1' });
      var properties = dep.properties || PropertiesService.getScriptProperties(), raw = properties.getProperty(LAST_RUN), value = null;
      if (raw) {
        H.assert(raw.length < 8000, 'collector_status_invalid');
        try { value = JSON.parse(raw); } catch (error) { H.assert(false, 'collector_status_invalid'); }
        var fields = ['schema', 'at', 'state', 'generation', 'processedStudents', 'completed', 'waitingGrade', 'failedStudents', 'errorCodes', 'nextCursor', 'registryCount', 'durationMs'];
        H.assert(value && Object.keys(value).every(function (key) { return fields.indexOf(key) >= 0; }) && value.schema === 1 && PythonEditor.iso(value.at) &&
          ['ok', 'partial_error', 'failed'].indexOf(value.state) >= 0 && (value.generation === null || /^[a-f0-9]{32}$/.test(value.generation)) &&
          ['processedStudents', 'completed', 'waitingGrade', 'failedStudents', 'nextCursor', 'registryCount', 'durationMs'].every(function (key) { return Number.isSafeInteger(value[key]) && value[key] >= 0; }) &&
          value.errorCodes && Object.keys(value.errorCodes).length <= 20 && Object.keys(value.errorCodes).every(function (key) { return /^[A-Za-z0-9_]{1,60}$/.test(key) && Number.isSafeInteger(value.errorCodes[key]) && value.errorCodes[key] >= 0; }), 'collector_status_invalid');
      }
      return { enabled: c.enabled, collectorEnabled: c.collectorEnabled, lastRun: value };
    }
    function run(input, event) {
      var c = H.settings(rootConfig); H.assertSettings(c);
      H.assert(c.collectorEnabled && Array.isArray(c.teacherAccounts) && c.teacherAccounts.length > 0 && /^[A-Za-z0-9_-]{20,160}$/.test(c.centralSpreadsheetId), 'collector_disabled');
      var approvedTrigger = ToolsGradingSync.create(syncEnvironment(c)).authorizeTeacher(event || null, {
        handler: 'runToolsGradingCollectionV1_', triggerKey: 'TOOLS_GRADING_COLLECTION_TRIGGER_V1'
      });
      teacher(c, approvedTrigger);
      input = input || {};
      H.assert(typeof input === 'object' && !Array.isArray(input) && Object.keys(input).every(function (key) { return ['maxStudents', 'maxReceiptsPerStudent'].indexOf(key) >= 0; }), 'invalid_request');
      var studentsLimit = input.maxStudents || c.maxStudentsPerRun, receiptsLimit = input.maxReceiptsPerStudent || c.maxReceiptsPerStudent;
      H.assert(Number.isInteger(studentsLimit) && studentsLimit >= 1 && studentsLimit <= 10 && Number.isInteger(receiptsLimit) && receiptsLimit >= 1 && receiptsLimit <= 50, 'invalid_request');
      var lock = dep.lock ? dep.lock() : LockService.getScriptLock();
      H.assert(lock.tryLock(1000), 'collector_busy');
      var started = H.nowMs(dep), properties = dep.properties || PropertiesService.getScriptProperties(), reports = [], adopted, next = 0;
      try {
        var service = H.packages(dep); adopted = H.openPackage(service, dep); var central = centralStore(c);
        var savedCursor;
        try { savedCursor = JSON.parse(properties.getProperty(CURSOR) || 'null'); } catch (ignored) { savedCursor = null; }
        var cursor = savedCursor && savedCursor.generation === adopted.meta.generation && Number.isInteger(savedCursor.next) ? savedCursor.next : 0;
        H.assert(cursor >= 0 && cursor <= adopted.registry.length, 'collector_cursor_invalid');
        var processed = 0; next = cursor;
        while (processed < studentsLimit && adopted.registry.length && H.nowMs(dep) - started < 240000) {
          if (next >= adopted.registry.length) next = 0;
          var entry = adopted.registry[next], account = H.normalized(entry.account), actorKey = ToolsStoreContract.actorKey(account);
          var report = { actorKey: actorKey, completed: 0, waitingGrade: 0, errors: [] };
          try {
            teacher(c, approvedTrigger);
            var actor = H.actorFrom(adopted, account, entry.spreadsheetId);
            H.assert(!actor.teacher, 'collector_not_student');
            var book = ownedBook(entry.spreadsheetId, c); assertStudentBook(book, account);
            var own = H.stores(c, dep, book, actorKey), ids = requestIds(book, actorKey), examined = 0;
            var offsetKey = 'TOOLS_GRADING_COLLECTOR_OFFSET_V1_' + actorKey;
            var offset = Number(properties.getProperty(offsetKey) || 0);
            if (!Number.isInteger(offset) || offset < 0 || offset >= ids.length) offset = 0;
            var nextOffset = offset;
            function recheck() {
              teacher(c, approvedTrigger); H.openPackage(service, dep, adopted.meta.generation); assertStudentBook(book, account);
            }
            for (var step = 0; step < ids.length && examined < receiptsLimit && H.nowMs(dep) - started < 240000; step++) {
              var index = (offset + step) % ids.length, counted = false;
              nextOffset = (index + 1) % ids.length;
              try {
                // 完了済みは上限を消費しない。個人内の未採点/破損行でも後続提出を永久に詰まらせない。
                var knownAck = own.ack.findResult(actorKey, ids[index]);
                if (knownAck) continue;
                examined++; counted = true;
                var result = collectOne(c, adopted, service, central, entry, actor, own, ids[index], recheck);
                if (result.state === 'completed') report.completed++; else report.waitingGrade++;
              } catch (error) { report.errors.push({ requestId: ids[index], code: error.toolsStoreCode || error.pythonEditorCode || 'collector_failed' }); if (!counted) examined++; }
            }
            properties.setProperty(offsetKey, String(nextOffset));
          } catch (error) { report.errors.push({ code: error.toolsStoreCode || error.pythonEditorCode || 'collector_failed' }); }
          reports.push(report); processed++; next++;
          properties.setProperty(CURSOR, JSON.stringify({ generation: adopted.meta.generation, next: next >= adopted.registry.length ? 0 : next }));
          if (next >= adopted.registry.length) break; // 同じ実行内で先頭へ周回しない。
        }
        var result = { generation: adopted.meta.generation, students: reports, next: next >= adopted.registry.length ? 0 : next, registryCount: adopted.registry.length };
        writeSummary(properties, summary(reports, adopted, result.next, started, null));
        return result;
      } catch (error) {
        if (error.toolsStoreCode !== 'collector_status_write_failed') {
          try { writeSummary(properties, summary(reports, adopted, adopted && next >= adopted.registry.length ? 0 : next, started, error)); }
          catch (statusError) { error.collectorStatusWarning = 'collector_status_write_failed'; }
        }
        throw error;
      } finally { lock.releaseLock(); }
    }
    function install(input) {
      var c = H.settings(rootConfig); H.assertSettings(c);
      H.assert(c.collectorEnabled, 'collector_disabled');
      input = input || {};
      H.assert(Object.keys(input).every(function (key) { return ['minutes', 'confirmation'].indexOf(key) >= 0; }), 'invalid_request');
      return ToolsGradingSync.create(syncEnvironment(c)).installTeacherTask({
        handler: 'runToolsGradingCollectionV1_', triggerKey: 'TOOLS_GRADING_COLLECTION_TRIGGER_V1',
        minutes: input.minutes || 1, confirmation: input.confirmation
      }, true);
    }
    return Object.freeze({ run: run, installTrigger: install, inspect: inspect });
  }
  return Object.freeze({ create: create, cursorProperty: CURSOR, statusProperty: LAST_RUN });
}());

// GAS editor/承認後の教員trigger用。末尾_なのでgoogle.script.runからは呼べない。
function runToolsGradingCollectionV1_(input) {
  var service = ToolsGradingCollection.create(toolsStoreConfig_());
  return input && input.triggerUid ? service.run({}, input) : service.run(input || {});
}
// 承認後の候補。明示confirmationと教員本人確認が必要。今回の実装では呼び出さない。
function installToolsGradingCollectionTriggerV1_(input) {
  return ToolsGradingCollection.create(toolsStoreConfig_()).installTrigger(input || {});
}

// 教員本人だけが集約の最終実行状態を読める。生徒RPCへは公開しない。
function inspectToolsGradingCollectionV1_() {
  return ToolsGradingCollection.create(toolsStoreConfig_()).inspect();
}
