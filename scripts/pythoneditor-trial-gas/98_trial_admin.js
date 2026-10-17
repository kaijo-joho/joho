// 所有教員がエディタから実行する限定試用の準備。アカウントは既存allowlistだけを使う。
var ToolsSchoolTrialAdmin = (function () {
  'use strict';
  var SETUP = 'PYTHON_EDITOR_SCHOOL_TRIAL_SETUP_V1', URL = 'PYTHON_EDITOR_SCHOOL_TRIAL_URL_V1';
  var TRIGGER = 'PYTHON_EDITOR_SCHOOL_TRIAL_COLLECTION_TRIGGER_V1';
  function fail(code) { var error = new Error('試用の準備を安全に続けられません: ' + code); error.toolsTrialCode = code; throw error; }
  function assert(ok, code) { if (!ok) fail(code); }
  function create(env) {
    var T = ToolsStoreContract, C = T.constants, R = ToolsSchoolTrialRepository.constants;
    function owner(requireEnabled) {
      var preview = JSON.parse(env.properties.getProperty('TOOLS_TEACHER_PREVIEW_CONFIG')), who = env.identity();
      assert(preview && preview.schema === 1 && typeof preview.enabled === 'boolean' && (requireEnabled === false || preview.enabled) &&
        Array.isArray(preview.teacherAccounts) && preview.teacherAccounts.length === 2 && Array.isArray(preview.demoAccounts) && preview.demoAccounts.length === 1, 'preview_configuration');
      var accounts = preview.teacherAccounts.concat(preview.demoAccounts);
      assert(new Set(accounts).size === 3 && accounts.every(function (account) { return /^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(account); }), 'preview_configuration');
      assert(who.active === preview.teacherAccounts[0] && who.effective === who.active, 'owner_only');
      return preview;
    }
    function saveState(state) {
      var raw = T.canonical(state); assert(raw.length <= 8000, 'setup_capacity');
      env.properties.setProperty(SETUP, raw); assert(env.properties.getProperty(SETUP) === raw, 'setup_write_uncertain');
    }
    function current(preview) { assert(T.canonical(owner(false)) === T.canonical(preview), 'preview_changed'); }
    function load(preview) {
      var raw = env.properties.getProperty(SETUP); if (!raw) return null;
      var state = JSON.parse(raw);
      assert(state.schema === 1 && /^[a-f0-9]{32}$/.test(state.scopeId) && Array.isArray(state.entries) && state.entries.length === 4, 'setup_invalid');
      var accounts = preview.teacherAccounts.concat(preview.demoAccounts, [preview.teacherAccounts[0]]), ids = {}, generations = {}, nonces = {};
      state.entries.forEach(function (entry, index) {
        assert(entry && entry.account === accounts[index] && entry.role === (index === 3 ? 'central' : index === 2 ? 'demo' : 'teacherTrial') &&
          /^[a-f0-9]{32}$/.test(entry.generation) && !generations[entry.generation] && /^[a-f0-9]{32}$/.test(entry.nonce) && !nonces[entry.nonce] &&
          ['planned','creating','created','prepared'].indexOf(entry.state) >= 0, 'setup_invalid');
        generations[entry.generation] = true; nonces[entry.nonce] = true;
        if (entry.spreadsheetId) {
          assert(/^[A-Za-z0-9_-]{20,160}$/.test(entry.spreadsheetId) && !ids[entry.spreadsheetId] && ['created','prepared'].indexOf(entry.state) >= 0, 'setup_invalid');
          ids[entry.spreadsheetId] = true;
        } else assert(entry.state === 'planned' || entry.state === 'creating', 'setup_invalid');
      });
      return state;
    }
    function grid(sheet, rows, columns) {
      if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
      if (sheet.getMaxColumns() < columns) sheet.insertColumnsAfter(sheet.getMaxColumns(), columns - sheet.getMaxColumns());
    }
    function editors(book, ownerAccount) {
      return book.getEditors().map(function (user) { return user.getEmail(); }).filter(function (account) { return account !== ownerAccount; }).sort();
    }
    function protect(sheet, range, description, account) {
      var existing = sheet.getProtections(env.rangeProtectionType).filter(function (p) { return p.getDescription() === description; });
      assert(existing.length <= 1, 'protection_duplicate');
      var p = existing[0] || range.protect().setDescription(description);
      p.setRange(range).setWarningOnly(false).addEditor(account);
      var extra = p.getEditors().map(function (user) { return user.getEmail(); }).filter(function (account) { return account !== env.identity().active; });
      if (extra.length) p.removeEditors(extra);
      if (p.canDomainEdit()) p.setDomainEdit(false);
      assert(!p.isWarningOnly() && !p.canDomainEdit() && typeof p.getTargetAudiences === 'function' && p.getTargetAudiences().length === 0 &&
        p.getEditors().every(function (user) { return user.getEmail() === account; }), 'protection_mismatch');
    }
    function table(book, name, rows, header, account) {
      var sheet = book.getSheetByName(name) || book.insertSheet(name);
      grid(sheet, rows, header.length);
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, header.length).setValues([header.slice()]);
      assert(T.canonical(sheet.getRange(1, 1, 1, header.length).getValues()[0]) === T.canonical(header), 'schema_mismatch');
      assert(sheet.getRange(1, 1, 1, header.length).getFormulas()[0].every(function (v) { return v === ''; }), 'schema_mismatch');
      protect(sheet, sheet.getRange(1, 1, 1, header.length), 'school-trial:header:' + name + ':v1', account);
      sheet.setFrozenRows(1); sheet.hideSheet(); return sheet;
    }
    function prepareBook(entry, state, preview) {
      current(preview);
      if (entry.state === 'prepared') return verifyBook(entry, preview);
      var book = env.open(entry.spreadsheetId), account = preview.teacherAccounts[0];
      assert(book.getOwner() && book.getOwner().getEmail() === account, 'owner_mismatch');
      var guide = book.getSheetByName(C.GUIDE);
      if (!guide) {
        var sheets = book.getSheets();
        guide = sheets.length === 1 && sheets[0].getLastRow() === 0 ? sheets[0].setName(C.GUIDE) : book.insertSheet(C.GUIDE);
      }
      grid(guide, 20, 2); guide.showSheet();
      var expected = [['schemaVersion',1],['actorKey', entry.role === 'central' ? '' : T.actorKey(entry.account)],
        ['generation',entry.generation],['state','active'],['kind',entry.role === 'central' ? 'pythoneditor-school-trial-collection-v1' : C.KIND],['teacherOwner',account]];
      var original = guide.getRange(1, 1, 6, 2).getValues();
      assert(original.every(function (row) { return row.every(function (cell) { return cell === ''; }); }) || T.canonical(original) === T.canonical(expected), 'metadata_mismatch');
      guide.getRange(1, 1, 6, 2).setValues(expected);
      protect(guide, guide.getRange(1, 1, 6, 2), 'school-trial:metadata:v1', account);
      if (guide.getLastRow() <= 6) guide.getRange(8, 1, 7, 2).setValues([
        ['Pythonエディタ・3名限定試用','本番成績には反映しません。'],
        ['使い方','保存・復元・提出はPythonエディタから行ってください。'],
        ['ファイル保存','区切りや終了時にエディタのファイル保存を使ってください。'],
        ['クラウド保存','変更がある場合の10分ごと・問題切替・提出・保存して終了で保存します。'],
        ['提出','ローカル判定の受領内容を記録します。実行や正答の証明ではありません。'],
        ['記録','非表示シートはアプリが使用します。直接変更しないでください。'],
        ['問い合わせ','保存警告が出た場合はファイルへ保存し、教員へ知らせてください。']
      ]);
      if (entry.role === 'central') table(book, R.CENTRAL, R.CENTRAL_ROWS, R.HEADERS, account);
      else {
        table(book, C.SHEET, C.DRAFT_ROWS, C.HEADERS, account);
        table(book, C.HISTORY, C.HISTORY_ROWS, C.HEADERS, account);
        table(book, C.CONFIRMATION.SHEET, C.CONFIRMATION.ROWS, C.CONFIRMATION.HEADERS, account);
        table(book, C.CONFIRMATION.RECEIPTS, C.CONFIRMATION.RECEIPT_ROWS, C.CONFIRMATION.RECEIPT_HEADERS, account);
        table(book, R.SHEET, R.ROWS, R.HEADERS, account);
      }
      env.flush(); current(preview);
      // 作成済みファイルの予期しない共有は取り消さず停止する。追加するのは本人だけ。
      var allowed = entry.role === 'central' || entry.account === account ? [] : [entry.account];
      assert(editors(book, account).every(function (value) { return allowed.indexOf(value) >= 0; }) &&
        book.getViewers().every(function (user) { return user.getEmail() === account || allowed.indexOf(user.getEmail()) >= 0; }), 'unexpected_sharing');
      if (allowed.length && !book.getEditors().some(function (u) { return u.getEmail() === entry.account; })) book.addEditor(entry.account);
      assert(T.canonical(editors(book, account)) === T.canonical(allowed), 'sharing_incomplete');
      verifyBook(entry, preview);
      entry.state = 'prepared'; saveState(state);
      return book;
    }
    function verifyProtection(sheet, rows, columns, account) {
      var protectedRange = sheet.getProtections(env.rangeProtectionType).some(function (p) {
        var range = p.getRange();
        return !p.isWarningOnly() && !p.canDomainEdit() && typeof p.getTargetAudiences === 'function' && p.getTargetAudiences().length === 0 &&
          p.getEditors().every(function (u) { return u.getEmail() === account; }) &&
          range.getRow() === 1 && range.getColumn() === 1 && range.getLastRow() === rows && range.getLastColumn() === columns;
      });
      assert(protectedRange, 'protection_mismatch');
    }
    function verifyBook(entry, preview) {
      var book = env.open(entry.spreadsheetId), account = preview.teacherAccounts[0];
      var allowed = entry.role === 'central' || entry.account === account ? [] : [entry.account];
      assert(book.getOwner() && book.getOwner().getEmail() === account &&
        book.getViewers().every(function (user) { return user.getEmail() === account || allowed.indexOf(user.getEmail()) >= 0; }) &&
        T.canonical(editors(book, account)) === T.canonical(allowed), 'unexpected_sharing');
      var guide = book.getSheetByName(C.GUIDE), expected = [['schemaVersion',1],['actorKey',entry.role === 'central' ? '' : T.actorKey(entry.account)],
        ['generation',entry.generation],['state','active'],['kind',entry.role === 'central' ? 'pythoneditor-school-trial-collection-v1' : C.KIND],['teacherOwner',account]];
      assert(guide && !guide.isSheetHidden() && T.canonical(guide.getRange(1, 1, 6, 2).getValues()) === T.canonical(expected) &&
        guide.getRange(1, 1, 6, 2).getFormulas().every(function (row) { return row.every(function (v) { return v === ''; }); }), 'metadata_mismatch');
      verifyProtection(guide, 6, 2, account);
      var tables = entry.role === 'central' ? [[R.CENTRAL,R.CENTRAL_ROWS,R.HEADERS]] : [
        [C.SHEET,C.DRAFT_ROWS,C.HEADERS],[C.HISTORY,C.HISTORY_ROWS,C.HEADERS],[C.CONFIRMATION.SHEET,C.CONFIRMATION.ROWS,C.CONFIRMATION.HEADERS],
        [C.CONFIRMATION.RECEIPTS,C.CONFIRMATION.RECEIPT_ROWS,C.CONFIRMATION.RECEIPT_HEADERS],[R.SHEET,R.ROWS,R.HEADERS]];
      assert(book.getSheets().length === tables.length + 1, 'schema_mismatch');
      tables.forEach(function (spec) {
        var sheet = book.getSheetByName(spec[0]);
        assert(sheet && sheet.isSheetHidden() && sheet.getMaxRows() >= spec[1] && sheet.getMaxColumns() >= spec[2].length &&
          sheet.getLastRow() <= spec[1] && T.canonical(sheet.getRange(1, 1, 1, spec[2].length).getValues()[0]) === T.canonical(spec[2]) &&
          sheet.getRange(1, 1, 1, spec[2].length).getFormulas()[0].every(function (v) { return v === ''; }), 'schema_mismatch');
        verifyProtection(sheet, 1, spec[2].length, account);
      });
      return book;
    }
    function registryConfig(state, preview, centralId, enabled) {
      return { schema: 1, enabled: enabled, scopeId: state.scopeId, editorOrigin: preview.editorOrigin, ownerAccount: preview.teacherAccounts[0],
        centralId: centralId, participants: state.entries.slice(0, 3).map(function (entry) {
          return { account: entry.account, role: entry.role, spreadsheetId: entry.spreadsheetId, ownerAccount: preview.teacherAccounts[0], generation: entry.generation };
        }) };
    }
    function configured(state, preview) {
      var raw = env.properties.getProperty(ToolsSchoolTrial.keys.config); if (!raw) return null;
      var config = ToolsSchoolTrial.create(env.runtime()).configuration(false);
      assert(state.entries.slice(0, 3).every(function (entry) { return entry.state === 'prepared'; }), 'preparation_required');
      assert(config.centralId === null || state.entries[3].state === 'prepared' && config.centralId === state.entries[3].spreadsheetId, 'config_changed');
      assert(T.canonical(config) === T.canonical(registryConfig(state, preview, config.centralId, config.enabled)), 'config_changed');
      [ToolsSchoolTrial.keys.binding, ToolsSchoolTrial.keys.signing].forEach(function (key) {
        var secret = env.properties.getProperty(key); assert(typeof secret === 'string' && secret.length >= 32, 'key_configuration');
      });
      return { raw: raw, value: config };
    }
    function configure(state, preview, centralId, prior) {
      var config = registryConfig(state, preview, centralId, prior ? prior.value.enabled : false);
      if (prior) {
        assert(prior.value.centralId === centralId || prior.value.centralId === null && centralId === state.entries[3].spreadsheetId, 'config_changed');
        var previous = JSON.parse(prior.raw); previous.centralId = centralId;
        assert(T.canonical(previous) === T.canonical(config), 'config_changed');
      }
      current(preview);
      assert(env.properties.getProperty(ToolsSchoolTrial.keys.config) === (prior ? prior.raw : null), 'config_changed');
      [ToolsSchoolTrial.keys.binding, ToolsSchoolTrial.keys.signing].forEach(function (key) {
        var secret = env.properties.getProperty(key);
        // 設定済みの鍵を再生成すると既存の接続・受領署名が無効になるため停止する。
        assert(!prior || typeof secret === 'string' && secret.length >= 32, 'key_configuration');
        if (!secret) {
          secret = env.uuid() + env.uuid(); env.properties.setProperty(key, secret);
          assert(env.properties.getProperty(key) === secret, 'key_write_uncertain');
        }
        assert(typeof secret === 'string' && secret.length >= 32, 'key_configuration');
      });
      current(preview);
      assert(env.properties.getProperty(ToolsSchoolTrial.keys.config) === (prior ? prior.raw : null), 'config_changed');
      if (!prior || T.canonical(prior.value) !== T.canonical(config)) {
        if (prior) env.properties.setProperty('PYTHON_EDITOR_SCHOOL_TRIAL_LAST_CONFIG_V1', prior.raw);
        var raw = T.canonical(config); env.properties.setProperty(ToolsSchoolTrial.keys.config, raw);
        assert(env.properties.getProperty(ToolsSchoolTrial.keys.config) === raw, 'config_write_uncertain');
      }
      return inspect();
    }
    function configurePersonalOnly() {
      var preview = owner(), lock = env.lock(); assert(lock.tryLock(1000), 'busy');
      try {
        var state = load(preview); assert(state && state.entries.slice(0, 3).every(function (entry) { return entry.state === 'prepared'; }), 'preparation_required');
        var prior = configured(state, preview);
        assert(!prior || prior.value.centralId === null, 'config_changed');
        state.entries.slice(0, 3).forEach(function (entry) { verifyBook(entry, preview); });
        return configure(state, preview, null, prior);
      } finally { lock.releaseLock(); }
    }
    function prepare(personalOnly) {
      var preview = owner(), lock = env.lock(); assert(lock.tryLock(1000), 'busy');
      try {
        var state = load(preview);
        if (!state) {
          assert(!env.properties.getProperty(ToolsSchoolTrial.keys.config), 'existing_config_without_setup');
          state = { schema: 1, scopeId: env.uuid(), entries: preview.teacherAccounts.concat(preview.demoAccounts).map(function (account) {
            return { account: account, role: preview.teacherAccounts.indexOf(account) >= 0 ? 'teacherTrial' : 'demo', generation: env.uuid(), nonce: env.uuid(), state: 'planned' };
          }).concat([{ account: preview.teacherAccounts[0], role: 'central', generation: env.uuid(), nonce: env.uuid(), state: 'planned' }]) };
          saveState(state);
        }
        assert(T.canonical(state.entries.slice(0, 3).map(function (e) { return e.account; })) === T.canonical(preview.teacherAccounts.concat(preview.demoAccounts)), 'preview_changed');
        // 個人運用の後で中央だけを追加するときも、変更済みのregistryでは作成しない。
        var prior = configured(state, preview);
        state.entries.slice(0, personalOnly === true ? 3 : 4).forEach(function (entry) {
          current(preview);
          if (!entry.spreadsheetId) {
            assert(entry.state === 'planned', 'create_uncertain');
            entry.state = 'creating'; saveState(state);
            var title = entry.role === 'central' ? 'PythonEditor 試用提出回収' : 'PythonEditor 試用保存 ' + entry.account.split('@')[0];
            var book = env.make(title + ' [' + entry.nonce.slice(0, 8) + ']');
            // 先にIDを確定記録。作成応答が不明なときは再作成しない。
            entry.spreadsheetId = book.getId(); entry.url = book.getUrl(); entry.state = 'created'; saveState(state);
          }
          prepareBook(entry, state, preview);
        });
        if (personalOnly === true) return { trial: true, enabled: JSON.parse(env.properties.getProperty(ToolsSchoolTrial.keys.config) || '{"enabled":false}').enabled === true,
          personalOnly: true, files: state.entries.slice(0, 3).map(function (entry) {
          var book = verifyBook(entry, preview);
          return { account: entry.account, role: entry.role, spreadsheetId: entry.spreadsheetId, url: book.getUrl(), owner: book.getOwner().getEmail(),
            editors: editors(book, preview.teacherAccounts[0]), sheets: book.getSheets().length };
        }) };
        return configure(state, preview, state.entries[3].spreadsheetId, prior);
      } finally { lock.releaseLock(); }
    }
    function inspect() {
      var preview = owner(), state = load(preview); assert(state, 'preparation_required');
      var prior = configured(state, preview); assert(prior, 'preparation_required');
      var config = prior.value, entries = state.entries.slice(0, config.centralId === null ? 3 : 4);
      assert(entries.every(function (entry) { return entry.state === 'prepared'; }), 'preparation_required');
      var files = entries.map(function (entry) {
        var book = verifyBook(entry, preview), allowed = entry.role === 'central' || entry.account === config.ownerAccount ? [] : [entry.account];
        return { account: entry.account, role: entry.role, spreadsheetId: entry.spreadsheetId, url: book.getUrl(), owner: book.getOwner().getEmail(),
          editors: allowed, sheets: book.getSheets().length };
      });
      current(preview);
      return { trial: true, enabled: config.enabled, scopeId: config.scopeId, dueAt: null, files: files };
    }
    function enable(enabled) {
      var preview = owner(enabled), lock = env.lock(); assert(lock.tryLock(1000), 'busy');
      try {
        if (enabled) {
          inspect();
          assert(/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(env.properties.getProperty(URL) || ''), 'url_required');
        }
        var key = ToolsSchoolTrial.keys.config, raw = env.properties.getProperty(key), config = JSON.parse(raw);
        current(preview); env.properties.setProperty('PYTHON_EDITOR_SCHOOL_TRIAL_LAST_CONFIG_V1', raw);
        config.enabled = enabled; env.properties.setProperty(key, T.canonical(config));
        if (enabled && config.centralId !== null && !env.properties.getProperty(TRIGGER)) env.properties.setProperty(TRIGGER, T.canonical({ schema: 1, armed: true, triggerUid: null }));
        assert(env.properties.getProperty(key) === T.canonical(config), 'config_write_uncertain');
        if (enabled) assert(T.canonical(ToolsSchoolTrial.create(env.runtime()).configuration(false)) === T.canonical(config), 'config_write_uncertain');
        return { trial: true, enabled: enabled, accounts: config.participants.length };
      } finally { lock.releaseLock(); }
    }
    return Object.freeze({ prepare: prepare, configurePersonalOnly: configurePersonalOnly, inspect: inspect, enable: enable });
  }
  return Object.freeze({ create: create, keys: { setup: SETUP, url: URL, trigger: TRIGGER } });
}());

function schoolTrialAdminEnvironment_() {
  return { properties: PropertiesService.getScriptProperties(), identity: function () { return { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() }; },
    uuid: function () { return Utilities.getUuid().replace(/-/g, ''); }, open: function (id) { return SpreadsheetApp.openById(id); },
    make: function (title) { return SpreadsheetApp.create(title); }, flush: function () { SpreadsheetApp.flush(); },
    rangeProtectionType: SpreadsheetApp.ProtectionType.RANGE, lock: function () { return LockService.getScriptLock(); }, runtime: schoolTrialEnvironment_ };
}
function run_prepareSchoolTrial() { var result = ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).prepare(); console.log(JSON.stringify(result)); return result; }
function run_prepareSchoolTrialPersonalStores() { var result = ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).prepare(true); console.log(JSON.stringify(result)); return result; }
function run_configureSchoolTrialPersonalOnly() { var result = ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).configurePersonalOnly(); console.log(JSON.stringify(result)); return result; }
function run_inspectSchoolTrial() { var result = ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).inspect(); console.log(JSON.stringify(result)); return result; }
function run_enableSchoolTrial() { return ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).enable(true); }
function run_stopSchoolTrial() { return ToolsSchoolTrialAdmin.create(schoolTrialAdminEnvironment_()).enable(false); }
function run_collectSchoolTrial() { var result = collectSchoolTrial_(); console.log(JSON.stringify(result)); return result; }

// トリガーは所有教員がGASのUIから設置する。ScriptApp APIの追加scopeを利用者へ要求しない。
function schoolTrialCollectionTrigger(event) {
  var env = schoolTrialEnvironment_(), T = ToolsStoreContract, config = ToolsSchoolTrial.create(env).configuration();
  var who = env.identity(), properties = env.properties, key = ToolsSchoolTrialAdmin.keys.trigger;
  var uid = event && String(event.triggerUid || '');
  T.assert(/^[0-9]{10,40}$/.test(uid) && who.effective === config.ownerAccount && (!who.active || who.active === config.ownerAccount), 'account_denied');
  var lock = env.scriptLock(); T.assert(lock.tryLock(1000), 'busy');
  try {
    var state = JSON.parse(properties.getProperty(key));
    T.assert(state && state.schema === 1 && state.armed === true && (!state.triggerUid || state.triggerUid === uid), 'account_denied');
    if (!state.triggerUid) { state.triggerUid = uid; properties.setProperty(key, T.canonical(state)); }
    T.assert(properties.getProperty(key) === T.canonical(state), 'configuration_required');
  } finally { lock.releaseLock(); }
  env.identity = function () { return { active: config.ownerAccount, effective: config.ownerAccount }; };
  var result = ToolsSchoolTrial.create(env).collect(); console.log(JSON.stringify(result)); return result;
}
