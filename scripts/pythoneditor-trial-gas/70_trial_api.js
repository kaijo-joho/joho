// 指定3名だけの取組評価試用。通常の生徒名簿・dist・grade・成績へ接続しない。
var ToolsSchoolTrial = (function () {
  'use strict';
  var CONFIG = 'PYTHON_EDITOR_SCHOOL_TRIAL_CONFIG_V1';
  var BINDING = 'PYTHON_EDITOR_SCHOOL_TRIAL_BINDING_KEY_V1';
  var SIGNING = 'PYTHON_EDITOR_SCHOOL_TRIAL_SIGNING_KEY_V1';
  var SCOPE = 'pythoneditor-school-trial-v1', HEX = /^[a-f0-9]{64}$/, ID32 = /^[a-f0-9]{32}$/;
  var RECORD_FIELDS = ['state','scopeId','actorKey','storeKey','questionId','version','policyHash','codeHash','payloadHash','requestId','receivedAt','dueAt',
    'assessmentSource','trial','engineVersion','rubricVersion','score','earned','total','starEarned','starTotal','checks','signature'];
  function fail(code) { var error = new Error('限定試用の設定・保存内容を確認できません。'); error.toolsTrialCode = code; throw error; }
  function assert(value, code) { if (!value) fail(code || 'trial_invalid'); }
  function plain(value) { return value && Object.prototype.toString.call(value) === '[object Object]'; }
  function only(value, fields) { assert(plain(value) && Object.keys(value).every(function (key) { return fields.indexOf(key) >= 0; }), 'invalid_request'); }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function email(value) { return typeof value === 'string' ? value.trim().toLowerCase() : ''; }
  function sid(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{20,160}$/.test(value); }
  function finite(value, min, max) { return typeof value === 'number' && Number.isFinite(value) && value >= min && value <= max; }
  function text(value, max) { assert(typeof value === 'string' && value.length <= max, 'invalid_request'); return value; }
  function create(env) {
    var T = ToolsStoreContract, cachedSource;
    function configuration(requireEnabled) {
      var c, p;
      try { c = JSON.parse(env.properties.getProperty(CONFIG)); p = JSON.parse(env.properties.getProperty('TOOLS_TEACHER_PREVIEW_CONFIG')); }
      catch (ignored) { fail('trial_configuration'); }
      only(c, ['schema','enabled','scopeId','editorOrigin','ownerAccount','centralId','participants']);
      assert(c.schema === 1 && typeof c.enabled === 'boolean' && ID32.test(c.scopeId) && /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(c.editorOrigin) &&
        (c.centralId === null || sid(c.centralId)) && Array.isArray(c.participants) && c.participants.length === 3, 'trial_configuration');
      assert(p && p.schema === 1 && p.enabled === true && p.editorOrigin === c.editorOrigin && Array.isArray(p.teacherAccounts) && p.teacherAccounts.length === 2 &&
        Array.isArray(p.demoAccounts) && p.demoAccounts.length === 1 && c.ownerAccount === p.teacherAccounts[0], 'trial_configuration');
      var accounts = p.teacherAccounts.concat(p.demoAccounts), seen = {}, stores = {};
      assert(new Set(accounts).size === 3, 'trial_configuration');
      c.participants.forEach(function (entry) {
        only(entry, ['account','role','spreadsheetId','ownerAccount','generation']);
        assert(entry.account === email(entry.account) && accounts.indexOf(entry.account) >= 0 && !seen[entry.account] &&
          sid(entry.spreadsheetId) && entry.spreadsheetId !== c.centralId && !stores[entry.spreadsheetId] && ID32.test(entry.generation) &&
          entry.ownerAccount === c.ownerAccount && entry.role === (p.teacherAccounts.indexOf(entry.account) >= 0 ? 'teacherTrial' : 'demo'), 'trial_configuration');
        seen[entry.account] = true; stores[entry.spreadsheetId] = true;
      });
      if (requireEnabled !== false) assert(c.enabled, 'trial_disabled');
      return c;
    }
    function actor(c, expected, origin) {
      assert(origin === c.editorOrigin, 'origin_denied');
      var identity = env.identity(), account = email(identity.active);
      assert(account && account === email(identity.effective), 'account_denied');
      var entry = c.participants.filter(function (entry) { return entry.account === account; });
      assert(entry.length === 1, 'account_denied');
      var key = T.actorKey(account); if (expected !== null && expected !== undefined) assert(expected === key, 'account_mismatch');
      return { account: account, actorKey: key, entry: entry[0] };
    }
    function current(c, a) {
      assert(T.canonical(configuration()) === T.canonical(c), 'trial_changed');
      assert(actor(c, a.actorKey, c.editorOrigin).account === a.account, 'account_mismatch');
    }
    function secret(name) { var key = env.properties.getProperty(name); assert(typeof key === 'string' && key.length >= 32, 'trial_configuration'); return key; }
    function bindingConfig(c) { return { bindingKey: T.hash(secret(BINDING) + ':' + c.scopeId), allowedOrigins: [c.editorOrigin], bindingLifetimeMs: 3600000 }; }
    function sign(body) {
      var material = 'school-trial-local-report-v1:' + T.canonical(body);
      return env.hmac ? env.hmac(material, secret(SIGNING)) : Utilities.computeHmacSha256Signature(material, secret(SIGNING), Utilities.Charset.UTF_8)
        .map(function (byte) { return ('0' + ((byte + 256) % 256).toString(16)).slice(-2); }).join('');
    }
    function signedBody(receipt) { var body = clone(receipt); delete body.signature; return body; }
    function verifyReceipt(receipt, c, a) {
      try {
        only(receipt, RECORD_FIELDS);
        assert(receipt.state === 'submitted' && receipt.scopeId === c.scopeId && HEX.test(receipt.actorKey) && (!a || receipt.actorKey === a.actorKey) &&
          c.participants.some(function (entry) { return T.actorKey(entry.account) === receipt.actorKey && receipt.storeKey === T.hash(entry.spreadsheetId + ':' + entry.generation); }) &&
          PythonEditor.id(receipt.questionId) && PythonEditor.id(receipt.version) && ID32.test(receipt.requestId) && HEX.test(receipt.policyHash) &&
          HEX.test(receipt.payloadHash) && HEX.test(receipt.codeHash) && receipt.assessmentSource === 'local-report' && receipt.trial === true && receipt.dueAt === null &&
          typeof receipt.receivedAt === 'string' && new Date(receipt.receivedAt).toISOString() === receipt.receivedAt && HEX.test(receipt.signature), 'signature_invalid');
        assert(finite(receipt.score, 0, 1) && finite(receipt.earned, 0, 10000) && finite(receipt.total, receipt.earned, 10000) &&
          Number.isInteger(receipt.starEarned) && Number.isInteger(receipt.starTotal) && receipt.starEarned >= 0 && receipt.starEarned <= receipt.starTotal && receipt.starTotal <= 1000 &&
          Array.isArray(receipt.checks) && receipt.checks.length <= 1000, 'signature_invalid');
        return T.equal(sign(signedBody(receipt)), receipt.signature);
      } catch (ignored) { return false; }
    }
    function source(c, a) {
      if (!cachedSource) {
        var preview = env.previewSession(c.editorOrigin);
        assert(preview.catalog && preview.preview && ID32.test(preview.preview.generation), 'trial_configuration');
        var records = env.snapshots(preview.preview.generation);
        assert(Array.isArray(records), 'trial_configuration');
        var visible = {};
        preview.catalog.sets.forEach(function (set) { set.questions.forEach(function (q) { visible[q.version + '/' + q.questionId] = true; }); });
        cachedSource = { catalog: preview.catalog, records: records.filter(function (record) { var q = record.body.question; return visible[q.version + '/' + q.questionId]; }) };
      }
      current(c, a); return cachedSource;
    }
    function snapshot(c, a, q) {
      assert(PythonEditor.id(q.questionId) && PythonEditor.id(q.version), 'invalid_request');
      var matches = source(c, a).records.filter(function (record) { return record.questionId === q.questionId && record.version === q.version; });
      assert(matches.length === 1, 'question_denied'); return matches[0].body;
    }
    function policy(body) { assert(body.graded === true && body.question.kind !== 'confirmation', 'assessment_unavailable'); return PythonEditorLocalAssessment.compile(body); }
    function checkScope(c, input) { assert(input.scopeId === c.scopeId, 'scope_mismatch'); }
    function openBook(c, a) {
      current(c, a);
      var book = env.open(a.entry.spreadsheetId), owner = book.getOwner();
      assert(owner && email(owner.getEmail()) === a.entry.ownerAccount, 'owner_mismatch');
      assert(a.account === a.entry.ownerAccount && a.entry.role === 'teacherTrial' || book.getEditors().some(function (editor) { return email(editor.getEmail()) === a.account; }), 'permission_denied');
      var guide = book.getSheetByName(T.constants.GUIDE), rows = guide && guide.getRange(1, 1, 6, 2).getValues();
      assert(guide && !guide.isSheetHidden() && rows && T.canonical(rows.map(function (row) { return row[0]; })) ===
        T.canonical(['schemaVersion','actorKey','generation','state','kind','teacherOwner']) && rows[0][1] === 1 && rows[1][1] === a.actorKey && rows[2][1] === a.entry.generation && rows[3][1] === 'active' &&
        rows[4][1] === T.constants.KIND && rows[5][1] === a.entry.ownerAccount, 'store_inactive');
      fixedProtection(guide, 6, 2, a);
      var ledger = book.getSheetByName(ToolsSchoolTrialRepository.constants.SHEET);
      assert(ledger && ledger.isSheetHidden(), 'schema_mismatch'); fixedProtection(ledger, 1, ToolsSchoolTrialRepository.constants.HEADERS.length, a);
      ledger.getProtections(env.rangeProtectionType || SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
        var range = p.getRange();
        assert(p.isWarningOnly() || p.canEdit() || range.getLastRow() < 2 || range.getColumn() > ToolsSchoolTrialRepository.constants.HEADERS.length, 'body_not_editable');
      });
      assert(ledger.getProtections(env.sheetProtectionType || SpreadsheetApp.ProtectionType.SHEET).every(function (p) { return p.isWarningOnly() || p.canEdit(); }), 'body_not_editable');
      return book;
    }
    function fixedProtection(sheet, rows, columns, a) {
      var fixed = sheet.getRange(1, 1, rows, columns);
      assert(fixed.getFormulas().every(function (row) { return row.every(function (v) { return v === ''; }); }), 'schema_mismatch');
      assert(sheet.getProtections(env.rangeProtectionType || SpreadsheetApp.ProtectionType.RANGE).some(function (p) {
        var range = p.getRange();
        return !p.isWarningOnly() && typeof p.getTargetAudiences === 'function' && p.getTargetAudiences().length === 0 &&
          (a.entry.role === 'teacherTrial' || !p.canEdit()) && range.getRow() === 1 && range.getColumn() === 1 && range.getLastRow() >= rows && range.getLastColumn() >= columns;
      }), 'protection_mismatch');
    }
    function repository(c, a, central) {
      var book;
      if (central) {
        assert(a.account === c.ownerAccount, 'account_denied'); assert(c.centralId !== null, 'collection_not_configured'); current(c, a); book = env.open(c.centralId);
        assert(email(book.getOwner().getEmail()) === c.ownerAccount, 'owner_mismatch');
        assert(book.getEditors().every(function (u) { return email(u.getEmail()) === c.ownerAccount; }) &&
          (!book.getViewers || book.getViewers().every(function (u) { return email(u.getEmail()) === c.ownerAccount; })), 'central_permissions');
      } else book = openBook(c, a);
      var constants = ToolsSchoolTrialRepository.constants;
      return ToolsSchoolTrialRepository.create(book, { sheetName: central ? constants.CENTRAL : constants.SHEET, rows: central ? constants.CENTRAL_ROWS : constants.ROWS,
        verifyReceipt: function (receipt) { return verifyReceipt(receipt, c, central ? null : a); },
        recheck: function () { current(c, a); if (!central) openBook(c, a); } });
    }
    function connection(c, a) {
      openBook(c, a);
      return { account: a.account, actorKey: a.actorKey, binding: T.issueBinding({ account: a.account, spreadsheetId: a.entry.spreadsheetId,
        generation: a.entry.generation, tool: 'python', origin: c.editorOrigin }, bindingConfig(c), env.now()),
        spreadsheetId: a.entry.spreadsheetId, storeURL: env.storeURL(), schemaVersion: 1 };
    }
    function rating(receipts, q, max) {
      var matches = receipts.filter(function (r) { return r.questionId === q.questionId && (!q.version || r.version === q.version); });
      matches.sort(function (left, right) { return right.score - left.score || right.receivedAt.localeCompare(left.receivedAt); });
      var best = matches[0];
      return best ? { questionId: best.questionId, version: best.version, earned: best.starEarned, total: best.starTotal, trial: true, assessmentSource: 'local-report' } :
        max ? { questionId: q.questionId, version: q.version, earned: null, total: max, trial: true, assessmentSource: 'local-report' } : null;
    }
    function status(c, a, input, byRequest) {
      var repo = repository(c, a), all = repo.summaries(a.actorKey), record = byRequest ? repo.lookup(a.actorKey, input.requestId) : null;
      if (byRequest && !record) return { scopeId: c.scopeId, receipt: null, rating: null, history: [], bestScore: null };
      var q = record ? record.receipt : input, history = all.filter(function (r) { return r.questionId === q.questionId && r.version === q.version; })
        .sort(function (left, right) { return right.receivedAt.localeCompare(left.receivedAt) || right.requestId.localeCompare(left.requestId); });
      if (!byRequest && history[0]) record = repo.read(a.actorKey, history[0].requestId);
      return { scopeId: c.scopeId, questionId: q.questionId || null, version: q.version || null, receipt: record ? record.receipt : null,
        rating: rating(all, q), history: history.slice(0, 100), bestScore: history.length ? Math.max.apply(null, history.map(function (r) { return r.score; })) : null };
    }
    function report(raw, p, input) {
      only(raw, ['schema','engineVersion','rubricVersion','policyHash','questionId','version','codeHash','evidenceHash','score','earned','total','checks','diagnostics','starEarned','starTotal']);
      assert(raw.schema === 1 && raw.engineVersion === p.engineVersion && raw.rubricVersion === p.rubricVersion && raw.policyHash === p.policyHash &&
        raw.questionId === input.questionId && raw.version === input.version && raw.codeHash === T.hash(input.code) &&
        raw.evidenceHash === PythonEditorLocalAssessment.evidenceHash({ code: input.code, stdin: input.stdin, run: input.run, evidence: input.evidence === undefined ? null : input.evidence }), 'assessment_mismatch');
      assert(Array.isArray(raw.checks) && raw.checks.length === p.checks.length && Array.isArray(raw.diagnostics) && raw.diagnostics.length <= 20 &&
        raw.diagnostics.every(function (value) { return typeof value === 'string' && value.length <= 1000; }), 'assessment_mismatch');
      var seen = {}, earned = 0, total = 0, starEarned = 0, starTotal = 0;
      raw.checks.forEach(function (check) {
        only(check, ['id','passed','points','eligible']);
        var expected = p.checks.filter(function (spec) { return spec.id === check.id; });
        assert(expected.length === 1 && !seen[check.id] && check.points === expected[0].points && typeof check.eligible === 'boolean' &&
          (check.passed === true || check.passed === false || check.passed === null && !check.eligible) && (expected[0].kind === 'output' || check.eligible === true), 'assessment_mismatch');
        seen[check.id] = true;
        if (check.eligible) { total += check.points; if (check.passed) earned += check.points; }
        if (expected[0].kind === 'code') { starTotal++; if (check.passed) starEarned++; }
      });
      assert(raw.earned === earned && raw.total === total && raw.starEarned === starEarned && raw.starTotal === starTotal &&
        finite(raw.score, 0, 1) && Math.abs(raw.score - (total ? earned / total : 0)) < 1e-12, 'assessment_mismatch');
      return clone(raw);
    }
    function submit(c, a, input, receivedAt) {
      only(input, ['scopeId','requestId','questionId','version','policyHash','code','stdin','run','assessment','evidence']); checkScope(c, input);
      assert(ID32.test(input.requestId), 'invalid_request'); text(input.code, 200000); text(input.stdin, 200000);
      only(input.run, ['codeHash','outcome','truncated','outputText','stdout','inputEcho','stderr','errorText']);
      assert(input.run.codeHash === T.hash(input.code) && ['not_run','success','error','stopped','environment_error'].indexOf(input.run.outcome) >= 0 && typeof input.run.truncated === 'boolean', 'invalid_request');
      ['outputText','stdout','inputEcho','stderr','errorText'].forEach(function (name) { text(input.run[name], 100000); });
      if (input.evidence !== undefined && input.evidence !== null) ToolsConfirmationContract.validate(input.evidence);
      var hash = T.hash(T.canonical(input));
      var lock = env.userLock(); assert(lock.tryLock(5000), 'busy');
      try {
        current(c, a); var repo = repository(c, a), prior;
        try { prior = repo.lookup(a.actorKey, input.requestId); } catch (error) { if (error.toolsTrialCode !== 'storage_incomplete') throw error; }
        if (prior) { assert(prior.receipt.payloadHash === hash, 'request_reused'); return status(c, a, input, true); }
        var body = snapshot(c, a, input), p = policy(body); assert(input.policyHash === p.policyHash, 'policy_changed');
        var local = report(input.assessment, p, input);
        var counts = { line: 0, code: 0, output: 0 };
        var receipt = { state: 'submitted', scopeId: c.scopeId, actorKey: a.actorKey, storeKey: T.hash(a.entry.spreadsheetId + ':' + a.entry.generation), questionId: input.questionId, version: input.version, policyHash: p.policyHash,
          codeHash: local.codeHash, payloadHash: hash, requestId: input.requestId, receivedAt: new Date(receivedAt).toISOString(), dueAt: null,
          assessmentSource: 'local-report', trial: true, engineVersion: p.engineVersion, rubricVersion: p.rubricVersion,
          score: local.score, earned: local.earned, total: local.total, starEarned: local.starEarned, starTotal: local.starTotal,
          checks: local.checks.map(function (check) {
            var spec = p.checks.filter(function (item) { return item.id === check.id; })[0], kind = spec.kind; counts[kind]++;
            return Object.assign({}, check, { label: ({ line: 'コードの行数', code: 'コード条件', output: '出力条件' })[kind] + counts[kind], earned: check.eligible && check.passed ? check.points : 0 });
          }) };
        receipt.signature = sign(receipt); repo.append(input, receipt); current(c, a);
        return status(c, a, input, true);
      } finally { lock.releaseLock(); }
    }
    function call(action, input, expectedActorKey, origin) {
      var receivedAt = env.now(), c = configuration(), a = actor(c, action === 'session' ? expectedActorKey : (expectedActorKey || ''), origin);
      if (action === 'session') {
        only(input, []); var data = source(c, a), all = repository(c, a).summaries(a.actorKey), assessments = [], ratings = [];
        data.records.forEach(function (record) {
          if (!record.body.graded || record.body.question.kind === 'confirmation') return;
          var p = policy(record.body); assessments.push(p); ratings.push(rating(all, p, p.checks.filter(function (check) { return check.kind === 'code'; }).length));
        });
        return { scope: SCOPE, scopeId: c.scopeId, trial: true, account: a.account, actorKey: a.actorKey, viewerRole: a.entry.role,
          catalog: data.catalog, assessments: assessments, ratings: ratings.filter(Boolean), store: { connection: connection(c, a) } };
      }
      if (action === 'store') {
        only(input, ['binding','action','input']); var bc = bindingConfig(c), binding = T.verifyBinding(input.binding, bc, env.now());
        assert(binding.account === a.account && binding.actorKey === a.actorKey && binding.spreadsheetId === a.entry.spreadsheetId && binding.generation === a.entry.generation, 'account_mismatch');
        var config = { enabled: true, confirmationEnabled: true, bindingKey: bc.bindingKey, allowedOrigins: bc.allowedOrigins,
          allowedDomains: [a.account.split('@')[1]], teacherOwners: [c.ownerAccount], bindingLifetimeMs: bc.bindingLifetimeMs };
        var dep = { identity: env.identity, openBook: function (id) { assert(id === a.entry.spreadsheetId, 'account_mismatch'); return openBook(c, a); } };
        if (a.entry.role === 'teacherTrial') dep.teacherTrialAccess = function (access) {
          current(c, a); return access.account === a.account && access.owner === a.entry.ownerAccount && access.spreadsheetId === a.entry.spreadsheetId;
        };
        if (env.storeDependencies) Object.assign(dep, env.storeDependencies(a));
        var result = ToolsStoreService.create(config, dep).call(input.action, input.input, input.binding, origin); current(c, a); return result;
      }
      if (action === 'submit') return submit(c, a, input, receivedAt);
      if (action === 'lookup') { only(input, ['scopeId','requestId']); checkScope(c, input); assert(ID32.test(input.requestId), 'invalid_request'); return status(c, a, input, true); }
      if (action === 'questionStatus') { only(input, ['scopeId','questionId','version']); checkScope(c, input); snapshot(c, a, input); return status(c, a, input, false); }
      fail('invalid_action');
    }
    function collect() {
      var c = configuration(), a = actor(c, null, c.editorOrigin); assert(a.account === c.ownerAccount, 'account_denied');
      assert(c.centralId !== null, 'collection_not_configured');
      var lock = env.scriptLock(); assert(lock.tryLock(1000), 'busy');
      var copied = 0;
      try {
        var target = repository(c, a, true);
        c.participants.forEach(function (entry) {
          var person = { account: entry.account, actorKey: T.actorKey(entry.account), entry: entry }, book = env.open(entry.spreadsheetId);
          assert(email(book.getOwner().getEmail()) === c.ownerAccount, 'owner_mismatch');
          var constants = ToolsSchoolTrialRepository.constants, from = ToolsSchoolTrialRepository.create(book, { sheetName: constants.SHEET, rows: constants.ROWS,
            verifyReceipt: function (receipt) { return verifyReceipt(receipt, c, person); }, recheck: function () { current(c, a); } });
          from.summaries(person.actorKey).forEach(function (receipt) {
            if (copied >= 20) return;
            var known;
            try { known = target.lookup(person.actorKey, receipt.requestId); } catch (error) { if (error.toolsTrialCode !== 'storage_incomplete') throw error; }
            if (known) return;
            var record = from.read(person.actorKey, receipt.requestId); target.append(record.input, record.receipt); copied++;
          });
        });
        return { trial: true, copied: copied, at: new Date(env.now()).toISOString() };
      } finally { lock.releaseLock(); }
    }
    return Object.freeze({ call: call, collect: collect, configuration: configuration, verifyReceipt: verifyReceipt });
  }
  return Object.freeze({ create: create, keys: { config: CONFIG, binding: BINDING, signing: SIGNING }, scope: SCOPE });
}());

function schoolTrialEnvironment_() {
  var properties = PropertiesService.getScriptProperties(), previewEnv = toolsTeacherPreviewEnvironment_();
  return { properties: properties, now: function () { return Date.now(); }, identity: function () { return { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() }; },
    open: function (id) { return SpreadsheetApp.openById(id); }, storeURL: function () { return properties.getProperty('PYTHON_EDITOR_SCHOOL_TRIAL_URL_V1'); },
    userLock: function () { return LockService.getUserLock(); }, scriptLock: function () { return LockService.getScriptLock(); },
    previewSession: function (origin) { return ToolsTeacherPreview.create(previewEnv).session(origin); },
    snapshots: function (expectedGeneration) {
      var raw = properties.getProperty('TOOLS_TEACHER_PREVIEW_INDEX_V1'), index = JSON.parse(raw), packages = previewEnv.packages();
      PythonEditor.assert(index.generation === expectedGeneration, 'snapshot_changed');
      var opened = packages.open({ expectedGeneration: expectedGeneration });
      var records = index.groups.reduce(function (all, group) { return all.concat(opened.snapshots(group.setId, group.version)); }, []);
      PythonEditor.assert(raw === properties.getProperty('TOOLS_TEACHER_PREVIEW_INDEX_V1') && packages.head().generation === expectedGeneration, 'snapshot_changed');
      return records;
    } };
}
function schoolPythonTrialRpc(action, input, expectedActorKey, origin) {
  try { return { ok: true, value: ToolsSchoolTrial.create(schoolTrialEnvironment_()).call(action, input, expectedActorKey, origin) }; }
  catch (error) {
    var code = error.toolsTrialCode || error.toolsStoreCode || 'trial_unavailable';
    var messages = { account_denied: 'このアカウントは3名限定の試用対象ではありません。', account_mismatch: '接続した学校アカウントと保存先が一致しません。',
      trial_disabled: '限定試用は停止中です。', busy: '保存処理中です。同じ提出を結果照会してから再試行してください。',
      collection_not_configured: '中央の回収先は未設定です。個人の保存・試用提出は利用できます。',
      request_reused: '同じ提出番号に異なる内容が指定されました。元の提出は保持しています。', policy_changed: '判定条件の版が変わりました。ファイルへ保存してから再接続してください。',
      assessment_unavailable: 'この問題には試用評価が設定されていません。コードと確認記録は保存できます。',
      storage_full: '試用提出の保存上限に達しました。記録を削除せず、教員へ連絡してください。',
      signature_invalid: '試用提出の署名を確認できません。元の記録は保持しています。', storage_corrupt: '試用提出の保存内容を確認できません。元の記録は保持しています。',
      storage_incomplete: '試用提出の保存が未完了です。元の送信番号で照会・再送してください。' };
    return { ok: false, error: { code: code, message: messages[code] || '限定試用の接続・保存を完了できません。コードをファイルへ保存し、学校アカウントと通信状態を確認してください。' } };
  }
}
function renderSchoolTrial_(event) {
  try {
    var p = event && event.parameter || {}, service = ToolsSchoolTrial.create(schoolTrialEnvironment_()), c = service.configuration();
    if (p.kind !== 'schooltrial' || p.origin !== c.editorOrigin || !/^[a-f0-9]{64}$/.test(p.channel || '')) throw new Error('invalid');
    var template = HtmlService.createTemplateFromFile('23_school_trial_bridge');
    template.bootJson = JSON.stringify({ protocol: 'python-editor-trial-rpc-v1', origin: p.origin, channel: p.channel }).replace(/</g, '\\u003c');
    return template.evaluate().setTitle('Pythonエディタ・3名限定試用').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (ignored) { return HtmlService.createHtmlOutput('<p>限定試用へ接続できません。学校アカウントと試用設定を確認してください。</p>'); }
}
function collectSchoolTrial_() { return ToolsSchoolTrial.create(schoolTrialEnvironment_()).collect(); }
