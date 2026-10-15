// 利用者実行GAS専用。本人GSS内の署名済み採点は仮結果、中央保存済みackだけが正式結果。
var ToolsStudentGrading = (function () {
  'use strict';
  var NAMES = { requests: 'Python提出受付', results: 'Python提出結果', completed: 'Python提出完了' };
  var ROWS = 2049;
  function fail(code, message) { ToolsStoreContract.fail(code, message || '提出・採点の設定を確認できません。教員へ連絡してください。'); }
  function assert(ok, code, message) { if (!ok) fail(code, message); }
  function settings(root) {
    var c = root && root.studentGrading || root || {};
    return { enabled: c.enabled === true, collectorEnabled: c.collectorEnabled === true,
      signingKey: c.signingKey || '', keyId: c.keyId || '', centralSpreadsheetId: c.centralSpreadsheetId || '',
      teacherAccounts: c.teacherAccounts || root && root.teacherOwners || [],
      maxStudentsPerRun: c.maxStudentsPerRun || 5, maxReceiptsPerStudent: c.maxReceiptsPerStudent || 20 };
  }
  function assertSettings(c) {
    assert(c.enabled, 'grading_disabled', '新版の正式採点はまだ有効になっていません。今年度は従来のColabで提出してください。');
    assert(/^[a-f0-9]{64}$/.test(c.signingKey) && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,59}$/.test(c.keyId), 'grading_configuration');
  }
  function normalized(value) { return ToolsStoreContract.normalizeAccount(value); }
  function nowMs(dep) { return dep.now ? Number(dep.now()) : Date.now(); }
  function nowISO(dep) { return new Date(nowMs(dep)).toISOString(); }
  function mac(text, key) {
    return Utilities.computeHmacSha256Signature(text, key, Utilities.Charset.UTF_8)
      .map(function (v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function derived(c, domain, actorKey, spreadsheetId) {
    return mac(PythonEditor.canonical(['tools-student-grading-v1', c.keyId, domain, actorKey, spreadsheetId]), c.signingKey);
  }
  function integrity(c, actorKey, spreadsheetId, acknowledged) {
    return function (text, table) {
      var domain = table === 'requests' ? 'receipt' : table === 'results' ? (acknowledged ? 'collector-ack' : 'local-result') : null;
      assert(domain, 'grading_configuration');
      return mac(text, derived(c, domain, actorKey, spreadsheetId));
    };
  }
  function noLock() { return { tryLock: function () { return true; }, releaseLock: function () {} }; }
  function stores(c, dep, book, actorKey) {
    var spreadsheetId = book.getId();
    var make = dep.makeStore || function (target, options) { return PythonEditorStore.create({ storageSpreadsheetId: target.getId() }, Object.assign({ book: target }, options)); };
    var options = function (acknowledged) { return { names: { requests: NAMES.requests, results: acknowledged ? NAMES.completed : NAMES.results },
      allowGrow: false, integrityHash: integrity(c, actorKey, spreadsheetId, acknowledged), hash: PythonEditor.hashText,
      lock: noLock, flush: dep.flush }; };
    function bounded(store, completed) {
      var resultName = completed ? NAMES.completed : NAMES.results;
      return Object.assign({}, store, {
        accept: function (actor, input) {
          assert(store.findRequest(actor, input.requestId) || book.getSheetByName(NAMES.requests).getLastRow() < ROWS, 'grading_storage_full');
          return store.accept.apply(store, arguments);
        },
        finish: function (receipt) {
          assert(store.findResult(receipt.actorKey, receipt.requestId) || book.getSheetByName(resultName).getLastRow() < ROWS, 'grading_storage_full');
          return store.finish.apply(store, arguments);
        }
      });
    }
    return { local: bounded(make(book, options(false)), false), ack: bounded(make(book, options(true)), true) };
  }
  function packages(dep) {
    if (dep.packages && typeof dep.packages.open === 'function') return dep.packages;
    if (dep.packages && dep.packages.meta) return { open: function (options) {
      assert(!options || !options.expectedGeneration || options.expectedGeneration === dep.packages.meta.generation, 'packages_stale');
      return dep.packages;
    } };
    return ToolsGradingPackages.create({ properties: dep.properties || PropertiesService.getScriptProperties(), now: function () { return nowMs(dep); } });
  }
  function openPackage(service, dep, generation) {
    var value = service.open(generation ? { expectedGeneration: generation } : {}), m = value && value.meta, at = nowMs(dep);
    assert(m && m.schema === 1 && /^[a-f0-9]{32}$/.test(m.generation) && /^[a-f0-9]{64}$/.test(m.payloadHash) &&
      Number.isSafeInteger(m.issuedAt) && Number.isSafeInteger(m.expiresAt) && m.issuedAt <= at + 30000 && m.expiresAt > at &&
      Array.isArray(value.assignments) && value.actors && Array.isArray(value.registry), 'packages_stale', '採点用の学校設定を更新する必要があります。教員へ連絡してください。');
    if (generation) assert(m.generation === generation, 'packages_stale');
    return value;
  }
  function protectedHeader(sheet, rows, columns, dep, student) {
    var types = dep.protectionType || (typeof SpreadsheetApp !== 'undefined' && SpreadsheetApp.ProtectionType.RANGE) || 'RANGE';
    return sheet.getProtections(types).some(function (p) {
      var r = p.getRange();
      return !p.isWarningOnly() && (!student || !p.canEdit()) && r.getRow() <= 1 && r.getColumn() <= 1 && r.getLastRow() >= rows && r.getLastColumn() >= columns;
    });
  }
  function verifyTables(book, dep, student) {
    var headers = PythonEditorStore.headers;
    Object.keys(NAMES).forEach(function (key) {
      var sheet = book.getSheetByName(NAMES[key]);
      assert(sheet && sheet.getMaxRows() >= ROWS && sheet.getMaxColumns() >= headers.length && sheet.getLastRow() <= ROWS, 'grading_storage_not_ready');
      var header = sheet.getRange(1, 1, 1, headers.length);
      assert(PythonEditor.canonical(header.getValues()[0]) === PythonEditor.canonical(headers) &&
        header.getFormulas()[0].every(function (v) { return v === ''; }) && protectedHeader(sheet, 1, headers.length, dep, student) && sheet.isSheetHidden(), 'grading_storage_not_ready');
    });
  }
  function actorFrom(value, account, spreadsheetId) {
    var key = ToolsStoreContract.actorKey(account), actor = value.actors[key];
    assert(actor && typeof actor.teacher === 'boolean' && (actor.teacher || Number.isInteger(actor.grade) && actor.grade >= 1 && actor.grade <= 6), 'grading_not_allowed');
    var matches = value.registry.filter(function (r) { return normalized(r.account) === account; });
    assert(matches.length === 1 && matches[0].spreadsheetId === spreadsheetId, 'grading_registry_mismatch');
    return { email: account, key: key, grade: actor.grade, teacher: actor.teacher };
  }
  function checkResult(result, receipt) {
    assert(result && result.recordKey === receipt.recordKey && result.actorKey === receipt.actorKey && result.questionId === receipt.questionId && result.version === receipt.version &&
      result.requestId === receipt.requestId && result.payloadHash === receipt.payloadHash && result.snapshotHash === receipt.snapshotHash && result.receivedAt === receipt.at &&
      PythonEditor.canonical(result.policy) === PythonEditor.canonical(receipt.policy) && result.groupKey === receipt.groupKey &&
      result.eligible === (receipt.at <= receipt.policy.dueAt) && result.body && Number.isFinite(result.body.score) && result.body.score >= 0 && result.body.score <= 1 &&
      Array.isArray(result.body.checks) && Array.isArray(result.body.diagnostics), 'grading_record_invalid');
    return result;
  }
  function cleanInput(action, input) {
    var fields = {
      gradingSession: [], submit: ['questionId', 'version', 'assignmentId', 'requestId', 'code', 'stdin', 'run', 'intakeTicket'],
      getSubmission: ['requestId'], resumeSubmission: ['requestId'], questionStatus: ['questionId', 'version', 'assignmentId']
    };
    assert(fields[action] && input && typeof input === 'object' && !Array.isArray(input) &&
      Object.keys(input).every(function (key) { return key === 'tool' || fields[action].indexOf(key) >= 0; }) && (input.tool === undefined || input.tool === 'python'), 'invalid_request');
    var result = Object.assign({}, input); delete result.tool;
    if (typeof result.intakeTicket === 'string') {
      assert(result.intakeTicket.length < 8000, 'invalid_request');
      try { result.intakeTicket = JSON.parse(result.intakeTicket); } catch (error) { fail('invalid_request'); }
    }
    if (action === 'submit' && result.run) {
      assert(Object.keys(result.run).every(function (key) { return ['codeHash', 'outcome', 'truncated', 'outputText', 'stdout', 'inputEcho', 'stderr', 'errorText'].indexOf(key) >= 0; }), 'invalid_request');
    }
    return result;
  }
  function contextActor(context, value) {
    var account = normalized(context.account), key = ToolsStoreContract.actorKey(account), binding = context.binding;
    assert(context.book && typeof context.book.getId === 'function' && binding && binding.account === account && binding.actorKey === key &&
      context.actorKey === key && binding.spreadsheetId === context.book.getId() && PythonEditor.iso(context.receivedAt) && typeof context.recheck === 'function', 'grading_context_invalid');
    return actorFrom(value, account, context.book.getId());
  }
  function create(rootConfig, dependencies) {
    var dep = dependencies || {};
    function prepareIntake(raw, context) {
      var c = settings(rootConfig); assertSettings(c);
      var originalTicket = raw && typeof raw.intakeTicket === 'string' ? raw.intakeTicket : null;
      var input = cleanInput('submit', raw || {}), normalizedInput = PythonEditor.submission(input, PythonEditor.hashText);
      var service = packages(dep), adopted = openPackage(service, dep), actor = contextActor(context, adopted);
      assert(Date.parse(context.receivedAt) <= nowMs(dep) + 30000, 'grading_context_invalid');
      context.recheck(); verifyTables(context.book, dep, true);
      var own = stores(c, dep, context.book, actor.key), prior = own.local.findRequest(actor.key, normalizedInput.requestId);
      var frozen = adopted.findSnapshot(normalizedInput);
      assert(frozen && frozen.body && frozen.body.graded && frozen.payloadHash === PythonEditor.hashText(PythonEditor.canonical(frozen.body)) &&
        PythonEditor.key(frozen.body.question) === PythonEditor.key(normalizedInput), 'snapshot_missing');
      var secret = derived(c, 'intake', actor.key, context.book.getId());
      var proof = input.intakeTicket ? PythonEditor.intakeVerify(input.intakeTicket, secret) : null;
      var at = prior ? prior.at : proof ? proof.receivedAt : context.receivedAt;
      var policy;
      if (prior) {
        assert(prior.payloadHash === PythonEditor.hashText(PythonEditor.canonical(normalizedInput)) && prior.snapshotHash === frozen.payloadHash &&
          prior.actorKey === actor.key && PythonEditor.key(prior) === PythonEditor.key(normalizedInput) && prior.policy.assignmentId === normalizedInput.assignmentId, 'request_conflict');
        policy = prior.policy;
      } else policy = PythonEditorConfig.authorize({ enabled: true, assignments: adopted.assignments }, actor, frozen.body, normalizedInput.assignmentId, at, true);
      var payload = { actorKey: actor.key, requestId: normalizedInput.requestId, payloadHash: PythonEditor.hashText(PythonEditor.canonical(normalizedInput)),
        snapshotHash: frozen.payloadHash, policyHash: PythonEditor.hashText(PythonEditor.canonical(policy)), receivedAt: at };
      assert(PythonEditor.iso(at) && at <= context.receivedAt, 'request_conflict');
      if (proof) assert(PythonEditor.canonical(proof) === PythonEditor.canonical(payload), 'request_conflict');
      context.recheck(); openPackage(service, dep, adopted.meta.generation);
      return originalTicket || JSON.stringify(proof ? input.intakeTicket : PythonEditor.intakeIssue(payload, secret));
    }
    function call(action, input, context) {
      var c = settings(rootConfig); assertSettings(c);
      input = cleanInput(action, input || {});
      var service = packages(dep), adopted = openPackage(service, dep), actor = contextActor(context, adopted);
      assert(Date.parse(context.receivedAt) <= nowMs(dep) + 30000, 'grading_context_invalid');
      context.recheck(); verifyTables(context.book, dep, true);
      var own = stores(c, dep, context.book, actor.key);
      var prior = input.requestId ? own.local.findRequest(actor.key, input.requestId) : null;
      function fresh() {
        context.recheck();
        var next = openPackage(service, dep, adopted.meta.generation), nextActor = actorFrom(next, actor.email, context.book.getId());
        assert(nextActor.grade === actor.grade && nextActor.teacher === actor.teacher, 'packages_stale');
      }
      function authorize(record, assignmentId, at, intake) {
        // 署名済みの旧受付は、当時の問題・期限を固定したまま再処理する。
        if (prior && PythonEditor.key(record.body.question) === PythonEditor.key(prior) && (!assignmentId || assignmentId === prior.policy.assignmentId)) {
          assert(record.payloadHash === prior.snapshotHash && prior.actorKey === actor.key && prior.policy.version === prior.version, 'grading_record_invalid');
          return prior.policy;
        }
        return PythonEditorConfig.authorize({ enabled: true, assignments: adopted.assignments }, actor, record.body, assignmentId, at, intake);
      }
      var facade = {
        findSnapshot: adopted.findSnapshot, snapshots: adopted.snapshots,
        findRequest: function (key, id) { assert(key === actor.key, 'grading_not_allowed'); return own.local.findRequest(key, id); },
        accept: function () { return own.local.accept.apply(own.local, arguments); },
        finish: function () { return own.local.finish.apply(own.local, arguments); },
        requests: function (group) { assert(group.indexOf(actor.key + '/') === 0, 'grading_not_allowed'); return own.local.requests(group); },
        findResult: function (key, id) { assert(key === actor.key, 'grading_not_allowed'); return own.ack.findResult(key, id); },
        results: function (group) { assert(group.indexOf(actor.key + '/') === 0, 'grading_not_allowed'); return own.ack.results(group); },
        resultsForActor: function (key) { assert(key === actor.key, 'grading_not_allowed'); return own.ack.resultsForActor(key); }
      };
      var env = { actor: actor, config: { enabled: true, assignments: adopted.assignments }, store: facade, hash: PythonEditor.hashText,
        now: function () { return nowISO(dep); }, intakeSecret: function () { return derived(c, 'intake', actor.key, context.book.getId()); },
        authorize: authorize,
        recheck: function (record, assignmentId, receivedAt, intake) { fresh(); return authorize(record, assignmentId, receivedAt, intake); },
        grade: function (frozen, receipt) {
          var cached = own.local.findResult(actor.key, receipt.requestId);
          if (cached) return checkResult(cached, receipt).body;
          return dep.grade ? dep.grade(frozen.body, receipt.body) : PythonEditorGraderV1.grade(frozen.body, receipt.body);
        }
      };
      var result = PythonEditorService.dispatch(action === 'gradingSession' ? 'session' : action, input, env, context.receivedAt);
      fresh();
      if (result.receipt && result.receipt.state !== 'submitted') {
        var accepted = own.local.findRequest(actor.key, result.receipt.requestId), graded = own.local.findResult(actor.key, result.receipt.requestId);
        if (graded) {
          checkResult(graded, accepted);
          result.provisional = { state: 'graded_waiting_collection', score: graded.body.score, checks: graded.body.checks, diagnostics: graded.body.diagnostics, gradedAt: graded.at };
          result.collectionPending = true;
        }
      }
      return result;
    }
    function safe(fn) {
      try { return fn(); }
      catch (error) {
        if (error.pythonEditorCode) { error.toolsStoreCode = error.pythonEditorCode; error.message = PythonEditor.error(error).message; }
        if (error.intakeTicket && typeof error.intakeTicket !== 'string') error.intakeTicket = JSON.stringify(error.intakeTicket);
        throw error;
      }
    }
    return Object.freeze({
      prepareIntake: function (input, context) { return safe(function () { return prepareIntake(input, context); }); },
      call: function (action, input, context) { return safe(function () { return call(action, input, context); }); }
    });
  }
  return Object.freeze({ create: create, names: Object.freeze(NAMES), rows: ROWS,
    helpers: Object.freeze({ assert: assert, settings: settings, assertSettings: assertSettings, normalized: normalized, nowMs: nowMs, nowISO: nowISO,
      derived: derived, integrity: integrity, stores: stores, packages: packages, openPackage: openPackage, verifyTables: verifyTables,
      actorFrom: actorFrom, checkResult: checkResult }) });
}());
