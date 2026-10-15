// 教員専用。末尾_のentryのみ。学生RPCから呼ばず、未採用マスターを採用しない。
var ToolsGradingSync = (function () {
  'use strict';
  var CONFIG = 'TOOLS_GRADING_SYNC_CONFIG', TRIGGER = 'TOOLS_GRADING_SYNC_TRIGGER_V1', HANDLER = 'syncToolsGradingPackages_';
  function create(environment) {
    var env = environment, T = ToolsStoreContract, properties = env.properties;
    function assert(value, code) { T.assert(value, code || 'sync_invalid_source', '採用版同期の設定または授業権限を確認してください。'); }
    function canonical(value) { return T.canonical(value); }
    function parse(raw, fallback) { try { return raw ? JSON.parse(raw) : fallback; } catch (ignored) { T.fail('sync_invalid_config', '同期設定を確認してください。'); } }
    function configuration() {
      var c = parse(properties.getProperty(CONFIG), { schema: 1, enabled: false, triggerEnabled: false, ttlMinutes: 120, triggerMinutes: 60, sourceFileListId: '' });
      assert(c && Object.keys(c).every(function (key) { return ['schema', 'enabled', 'triggerEnabled', 'ttlMinutes', 'triggerMinutes', 'sourceFileListId'].indexOf(key) >= 0; }) && c.schema === 1 && typeof c.enabled === 'boolean' && typeof c.triggerEnabled === 'boolean' &&
        Number.isInteger(c.ttlMinutes) && c.ttlMinutes >= 15 && c.ttlMinutes <= 1440 && [15, 30, 60].indexOf(c.triggerMinutes) >= 0 && typeof c.sourceFileListId === 'string', 'sync_invalid_config');
      return c;
    }
    function owners() {
      var values = env.teacherOwners();
      assert(Array.isArray(values) && values.length > 0, 'sync_not_allowed');
      return values.map(T.normalizeAccount);
    }
    function domains() {
      var values = env.allowedDomains();
      assert(Array.isArray(values) && values.length > 0 && values.every(function (value) { return typeof value === 'string' && /^[a-z0-9.-]+\.[a-z]+$/.test(value); }), 'sync_invalid_config');
      return values;
    }
    function commonTeachers() {
      var values = env.commonTeachers ? env.commonTeachers() : null;
      assert(values === null || values === undefined || Array.isArray(values), 'sync_invalid_config');
      return values ? values.map(T.normalizeAccount) : null;
    }
    function identity(event, task) {
      task = task || { handler: HANDLER, triggerKey: TRIGGER };
      assert(task && typeof task.handler === 'string' && /^[A-Za-z][A-Za-z0-9_]*_$/.test(task.handler) && typeof task.triggerKey === 'string' && /^TOOLS_GRADING_[A-Z0-9_]+$/.test(task.triggerKey), 'sync_invalid_config');
      var identity = env.identity(), effective = T.normalizeAccount(identity.effective), active = identity.active ? T.normalizeAccount(identity.active) : '';
      var allowed = owners(), extra = commonTeachers();
      assert(allowed.indexOf(effective) >= 0 && (!extra || extra.indexOf(effective) >= 0) && domains().indexOf(effective.split('@')[1]) >= 0, 'sync_not_allowed');
      if (event && event.triggerUid) {
        var registered = parse(properties.getProperty(task.triggerKey), null);
        assert(registered && registered.handler === task.handler && registered.owner === effective && registered.uid === String(event.triggerUid) &&
          env.triggers().some(function (trigger) { return trigger.getUniqueId() === registered.uid && trigger.getHandlerFunction() === task.handler; }) && (!active || active === effective), 'sync_not_allowed');
      } else assert(active === effective, 'sync_not_allowed');
      return { account: effective };
    }
    function rows(values, required) {
      assert(Array.isArray(values) && values.length >= 1 && values.length <= 10001 && Array.isArray(values[0]) && values[0].length <= 100);
      var header = values[0], map = Object.create(null);
      header.forEach(function (value, i) { if (value === '') return; assert(typeof value === 'string' && map[value] === undefined); map[value] = i; });
      required.forEach(function (key) { assert(map[key] !== undefined); });
      return values.slice(1).map(function (r) { var value = {}; required.forEach(function (key) { value[key] = r[map[key]]; }); return value; });
    }
    function authorization(c) {
      var allowedDomains = domains(), actors = Object.create(null), seen = Object.create(null);
      rows(env.rosterRows(c.sourceFileListId), ['userId', '年']).forEach(function (r) {
        if (r.userId === '' || r.userId === null || r.userId === undefined) { assert(r['年'] === '' || r['年'] === null || r['年'] === undefined); return; }
        var account = T.normalizeAccount(r.userId), grade = Number(r['年']);
        assert(!seen[account] && allowedDomains.indexOf(account.split('@')[1]) >= 0 && Number.isInteger(grade) && grade >= 1 && grade <= 6);
        seen[account] = true; actors[T.actorKey(account)] = { grade: grade, teacher: false };
      });
      var teachers = owners().concat(commonTeachers() || []);
      teachers.forEach(function (account) {
        if (allowedDomains.indexOf(account.split('@')[1]) < 0) return;
        var key = T.actorKey(account); actors[key] = { grade: actors[key] ? actors[key].grade : null, teacher: true };
      });
      var accounts = Object.create(null), stores = Object.create(null), registry = [];
      rows(env.registryRows(c.sourceFileListId), ['userId', 'tools保存用GSSID']).forEach(function (r) {
        if (r.userId === '' || r.userId === null || r.userId === undefined) { assert(!r.tools保存用GSSID); return; }
        var account = T.normalizeAccount(r.userId); assert(!accounts[account]); accounts[account] = true;
        if (r.tools保存用GSSID === '' || r.tools保存用GSSID === null || r.tools保存用GSSID === undefined) return;
        assert(typeof r.tools保存用GSSID === 'string' && /^[A-Za-z0-9_-]{20,160}$/.test(r.tools保存用GSSID) && !stores[r.tools保存用GSSID] && actors[T.actorKey(account)]);
        stores[r.tools保存用GSSID] = true; registry.push({ account: account, spreadsheetId: r.tools保存用GSSID });
      });
      registry.sort(function (a, b) { return a.account < b.account ? -1 : a.account > b.account ? 1 : 0; });
      // 全校名簿の整合性は上で検査する。保存先未登録の生徒は学生APIを利用できないため、
      // 授業権限パッケージには本人の保存先が登録済みの生徒と明示教員だけを含める。
      var eligible = Object.create(null);
      registry.forEach(function (entry) { var key = T.actorKey(entry.account); eligible[key] = actors[key]; });
      teachers.forEach(function (account) {
        if (allowedDomains.indexOf(account.split('@')[1]) < 0) return;
        var key = T.actorKey(account); eligible[key] = actors[key];
      });
      return { actors: eligible, registry: registry };
    }
    function source(c) {
      assert(/^[A-Za-z0-9_-]{20,160}$/.test(c.sourceFileListId), 'sync_invalid_config');
      var config = env.sourceConfig(c.sourceFileListId);
      assert(config && typeof config.hash === 'string' && /^[a-f0-9]{64}$/.test(config.hash) && Array.isArray(config.assignments) && config.assignments.length <= 100);
      var store = env.sourceStore(config), seen = Object.create(null), snapshots = [];
      config.assignments.forEach(function (policy) {
        var group = policy.version + '/' + policy.setId;
        if (seen[group]) return; seen[group] = true;
        var adopted = store.snapshots(policy.setId, policy.version);
        assert(Array.isArray(adopted) && adopted.length > 0 && adopted.length <= 300, 'sync_snapshot_missing');
        adopted.forEach(function (record) {
          assert(record && record.body && record.body.question && record.body.question.setId === policy.setId && record.body.question.version === policy.version && record.payloadHash === T.hash(canonical(record.body)), 'sync_invalid_source');
          snapshots.push(record);
        });
      });
      snapshots.sort(function (a, b) { return a.recordKey < b.recordKey ? -1 : a.recordKey > b.recordKey ? 1 : 0; });
      var auth = authorization(c), input = { snapshots: snapshots, assignments: config.assignments, actors: auth.actors, registry: auth.registry };
      return { input: input, fingerprint: T.hash(canonical({ configHash: config.hash, input: input })) };
    }
    function plan(event, write) {
      var c = configuration();
      if (write) assert(c.enabled, 'sync_disabled');
      if (event && event.triggerUid) assert(c.triggerEnabled, 'sync_trigger_disabled');
      var actor = identity(event), packages = env.packages(), head = packages.head(), expected = head ? head.generation : null;
      var built = source(c);
      function recheck() {
        assert(canonical(configuration()) === canonical(c), 'sync_source_changed');
        assert(identity(event).account === actor.account, 'sync_not_allowed');
        assert(source(c).fingerprint === built.fingerprint, 'sync_source_changed');
      }
      recheck();
      return { config: c, packages: packages, expected: expected, built: built, recheck: recheck };
    }
    function preview() {
      var p = plan(null, false);
      return { state: p.config.enabled ? 'ready' : 'disabled', expectedGeneration: p.expected, sourceHash: p.built.fingerprint,
        counts: { snapshots: p.built.input.snapshots.length, assignments: p.built.input.assignments.length, actors: Object.keys(p.built.input.actors).length, stores: p.built.input.registry.length }, ttlMinutes: p.config.ttlMinutes };
    }
    function sync(event) {
      var p = plan(event, true);
      var meta = p.packages.publish(p.built.input, { expectedGeneration: p.expected, expiresAt: env.now() + p.config.ttlMinutes * 60000, beforeCommit: p.recheck });
      return { state: 'published', meta: meta, sourceHash: p.built.fingerprint };
    }
    function adoptionSpec(spec) {
      assert(spec && Object.keys(spec).every(function (key) { return ['setId', 'version', 'gradingSheet'].indexOf(key) >= 0; }) && typeof spec.setId === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(spec.setId) &&
        typeof spec.version === 'string' && /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/.test(spec.version) && typeof spec.gradingSheet === 'string' && /^採点設定py(?:_[A-Za-z0-9_-]+)?$/.test(spec.gradingSheet), 'sync_invalid_source');
      return spec;
    }
    function readAdoption(spec, c) {
      assert(/^[A-Za-z0-9_-]{20,160}$/.test(c.sourceFileListId), 'sync_invalid_config');
      var built = env.readAdoption(adoptionSpec(spec), c.sourceFileListId);
      assert(built && Array.isArray(built.records) && built.records.length > 0 && built.records.length <= 300 && typeof built.digest === 'string' && /^[a-f0-9]{64}$/.test(built.digest) && typeof built.canAdopt === 'boolean');
      return built;
    }
    function previewAdoption(spec) {
      var c = configuration(); identity(null);
      var built = readAdoption(spec, c);
      return { setId: spec.setId, version: spec.version, digest: built.digest, canAdopt: built.canAdopt,
        questions: built.records.map(function (r) { return { questionId: r.body.question.questionId, sourceStatus: r.sourceStatus, graded: r.body.graded, ranges: r.body.ranges.length }; }) };
    }
    function adoptVersion(input) {
      var c = configuration(); assert(c.enabled, 'sync_disabled'); var actor = identity(null);
      assert(input && Object.keys(input).every(function (key) { return ['spec', 'expectedDigest', 'confirmation', 'syncAfter'].indexOf(key) >= 0; }) &&
        input.confirmation === 'ADOPT_TOOLS_GRADING_VERSION_V1' && /^[a-f0-9]{64}$/.test(input.expectedDigest) && (input.syncAfter === undefined || typeof input.syncAfter === 'boolean'), 'sync_invalid_source');
      var built = readAdoption(input.spec, c);
      assert(built.canAdopt && built.records.every(function (r) { return ['採用済み', '旧版'].indexOf(r.sourceStatus) >= 0; }), 'adoption_required');
      assert(built.digest === input.expectedDigest, 'sync_source_changed');
      var at = new Date(env.now()).toISOString();
      var records = built.records.map(function (r) {
        var q = r.body.question;
        assert(q.setId === input.spec.setId && q.version === input.spec.version && r.payloadHash === T.hash(canonical(r.body)), 'sync_invalid_source');
        return { recordKey: q.version + '/' + q.questionId, groupKey: q.version + '/' + q.setId, actorKey: '', questionId: q.questionId, version: q.version,
          requestId: '', seq: 0, at: at, payloadHash: r.payloadHash, adoptedBy: T.actorKey(actor.account), body: r.body };
      });
      var sourceConfig = env.sourceConfig(c.sourceFileListId);
      var saved = env.sourceStore(sourceConfig).putSnapshots(records, function () {
        assert(identity(null).account === actor.account && canonical(configuration()) === canonical(c), 'sync_not_allowed');
        var fresh = readAdoption(input.spec, c);
        assert(fresh.canAdopt && fresh.digest === input.expectedDigest, 'sync_source_changed');
        assert(env.sourceConfig(c.sourceFileListId).hash === sourceConfig.hash, 'sync_source_changed');
      });
      var result = { state: 'adopted', setId: input.spec.setId, version: input.spec.version, digest: built.digest, questions: saved.length };
      if (input.syncAfter) {
        try { result.sync = sync(null); }
        catch (error) { result.sync = { state: 'not_published', code: error.toolsStoreCode || error.pythonEditorCode || 'sync_unavailable' }; }
      }
      return result;
    }
    function install(input) {
      var c = configuration();
      assert(c.enabled && c.triggerEnabled, 'sync_trigger_disabled');
      assert(input && input.confirmation === 'INSTALL_TOOLS_GRADING_SYNC_V1' && Object.keys(input).length === 1, 'sync_invalid_config');
      return installTeacherTask({ handler: HANDLER, triggerKey: TRIGGER, minutes: c.triggerMinutes, confirmation: 'INSTALL_' + TRIGGER }, true);
    }
    function installTeacherTask(task, permitted) {
      assert(permitted === true, 'sync_trigger_disabled');
      assert(task && Object.keys(task).every(function (key) { return ['handler', 'triggerKey', 'minutes', 'confirmation'].indexOf(key) >= 0; }) && task.confirmation === 'INSTALL_' + task.triggerKey && [1, 5, 10, 15, 30, 60].indexOf(task.minutes) >= 0, 'sync_invalid_config');
      var lock = env.lock ? env.lock() : LockService.getScriptLock(); assert(lock.tryLock(5000), 'packages_busy');
      try {
      var actor = identity(null, task), existing = parse(properties.getProperty(task.triggerKey), null), triggers = env.triggers();
      if (existing) {
        assert(existing.owner === actor.account && existing.handler === task.handler && existing.minutes === task.minutes && triggers.some(function (t) { return t.getUniqueId() === existing.uid && t.getHandlerFunction() === task.handler; }), 'sync_trigger_invalid');
        return { state: 'existing', uid: existing.uid };
      }
      assert(!triggers.some(function (t) { return t.getHandlerFunction() === task.handler; }), 'sync_trigger_invalid');
      var trigger = env.createTrigger(task.handler, task.minutes), record = { owner: actor.account, handler: task.handler, uid: String(trigger.getUniqueId()), minutes: task.minutes };
      try {
        properties.setProperty(task.triggerKey, JSON.stringify(record));
        assert(properties.getProperty(task.triggerKey) === JSON.stringify(record), 'sync_trigger_invalid');
      } catch (error) {
        var observed;
        try { observed = properties.getProperty(task.triggerKey); } catch (ignored) { /* 成否不明はUIDの確認まで保留する。 */ }
        if (observed === JSON.stringify(record)) return { state: 'installed', uid: record.uid };
        if (observed === null) env.deleteTrigger(trigger);
        throw error;
      }
      return { state: 'installed', uid: record.uid };
      } finally { lock.releaseLock(); }
    }
    return Object.freeze({ preview: preview, sync: sync, install: install, authorizeTeacher: identity, installTeacherTask: installTeacherTask, previewAdoption: previewAdoption, adoptVersion: adoptVersion });
  }
  return Object.freeze({ create: create, keys: Object.freeze({ config: CONFIG, trigger: TRIGGER }), handler: HANDLER });
}());

function toolsGradingSyncEnvironment_() {
  var properties = PropertiesService.getScriptProperties();
  function storedList(name) { var value; try { value = JSON.parse(properties.getProperty(name) || '[]'); } catch (ignored) { value = null; } return value; }
  function readRows(bookId, name) {
    var sheet = SpreadsheetApp.openById(bookId).getSheetByName(name);
    ToolsStoreContract.assert(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= 10001 && sheet.getLastColumn() <= 100, 'sync_invalid_source');
    return sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues();
  }
  return {
    properties: properties, now: function () { return Date.now(); },
    teacherOwners: function () { return storedList('TOOLS_STORE_TEACHER_OWNERS'); },
    allowedDomains: function () { return storedList('TOOLS_STORE_ALLOWED_DOMAINS'); },
    commonTeachers: function () { return typeof Common !== 'undefined' && Array.isArray(Common.TEACHERS) ? Common.TEACHERS : null; },
    identity: function () { return { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() }; },
    sourceConfig: function (fileListId) { return PythonEditorConfig.config({ fileListId: fileListId }); },
    sourceStore: function (config) { return PythonEditorStore.create(config); },
    readAdoption: function (spec, fileListId) { return PythonEditorMaster.read(spec, { fileListId: fileListId }); },
    rosterRows: function (id) { return readRows(id, '生徒名簿'); },
    registryRows: function (id) { return readRows(id, '個別フォルダ'); },
    packages: function () { return ToolsGradingPackages.create({ properties: properties }); },
    triggers: function () { return ScriptApp.getProjectTriggers(); },
    createTrigger: function (handler, minutes) { var clock = ScriptApp.newTrigger(handler).timeBased(); return (minutes === 60 ? clock.everyHours(1) : clock.everyMinutes(minutes)).create(); },
    deleteTrigger: function (trigger) { ScriptApp.deleteTrigger(trigger); },
    lock: function () { return LockService.getScriptLock(); }
  };
}
function previewToolsGradingSync_() { return ToolsGradingSync.create(toolsGradingSyncEnvironment_()).preview(); }
function syncToolsGradingPackages_(event) { return ToolsGradingSync.create(toolsGradingSyncEnvironment_()).sync(event); }
function installToolsGradingSyncTrigger_(input) { return ToolsGradingSync.create(toolsGradingSyncEnvironment_()).install(input); }
function previewToolsGradingAdoption_(spec) { return ToolsGradingSync.create(toolsGradingSyncEnvironment_()).previewAdoption(spec); }
function adoptToolsGradingVersion_(input) { return ToolsGradingSync.create(toolsGradingSyncEnvironment_()).adoptVersion(input); }
