var ToolsStoreService = (function () {
  'use strict';
  function create(config, dependencies) {
    var dep = dependencies || {}, T = ToolsStoreContract, C = T.constants;
    function assertion(condition, code, message) { T.assert(condition, code, message); }
    function only(input, fields) {
      assertion(input && Object.prototype.toString.call(input) === '[object Object]' && Object.keys(input).every(function (key) { return fields.indexOf(key) >= 0; }), 'invalid_request');
    }
    function text(value, limit, empty) {
      assertion(typeof value === 'string' && value.length <= limit && (empty || value.length > 0), 'invalid_request'); return value;
    }
    function label(value, limit, empty) {
      value = text(value, limit, empty); assertion(!/[\u0000-\u001f\u007f]/.test(value), 'invalid_request'); return value;
    }
    function id(value) { assertion(typeof value === 'string' && /^[a-f0-9]{32}$/.test(value), 'invalid_request'); return value; }
    function query(input) {
      assertion(input && input.tool === 'python', 'invalid_tool');
      return { tool: 'python', questionId: label(input.questionId, 180, false), version: label(input.version, 180, false) };
    }
    function saveInput(input) {
      only(input, ['tool', 'questionId', 'version', 'setId', 'title', 'folder', 'requestId', 'expectedRevision', 'code', 'stdin', 'clientId', 'preserveRevision', 'baseCode', 'baseStdin']);
      var q = query(input);
      assertion(input.expectedRevision === null || typeof input.expectedRevision === 'string' && /^[a-f0-9]{32}$/.test(input.expectedRevision), 'invalid_request');
      Object.assign(q, { setId: label(input.setId === undefined ? '' : input.setId, 180, true), title: label(input.title === undefined ? '' : input.title, 500, true), folder: label(input.folder === undefined ? '' : input.folder, 300, true),
        requestId: id(input.requestId), expectedRevision: input.expectedRevision, code: text(input.code, C.MAX_TEXT, true),
        stdin: text(input.stdin, C.MAX_TEXT, true), clientId: id(input.clientId) });
      if (input.preserveRevision !== undefined && input.preserveRevision !== null) {
        q.preserveRevision = id(input.preserveRevision); assertion(q.preserveRevision === q.expectedRevision, 'invalid_request');
      }
      if (input.baseCode !== undefined) q.baseCode = text(input.baseCode, C.MAX_TEXT, true);
      if (input.baseStdin !== undefined) q.baseStdin = text(input.baseStdin, C.MAX_TEXT, true);
      return q;
    }
    function protectedRange(sheet, row, column, rows, columns) {
      return sheet.getProtections(dep.protectionType || SpreadsheetApp.ProtectionType.RANGE).some(function (protection) {
        var range = protection.getRange();
        return !protection.isWarningOnly() && !protection.canEdit() && range.getRow() <= row && range.getColumn() <= column &&
          range.getLastRow() >= row + rows - 1 && range.getLastColumn() >= column + columns - 1;
      });
    }
    function verifyTable(sheet, rows) {
      assertion(sheet && sheet.getMaxRows() >= rows && sheet.getMaxColumns() >= C.HEADERS.length && sheet.getLastRow() <= rows, 'schema_mismatch');
      var header = sheet.getRange(1, 1, 1, C.HEADERS.length);
      assertion(T.canonical(header.getValues()[0]) === T.canonical(C.HEADERS) && header.getFormulas()[0].every(function (v) { return v === ''; }), 'schema_mismatch');
      if (sheet.getMaxColumns() > C.HEADERS.length) {
        var extra = sheet.getRange(1, C.HEADERS.length + 1, 1, sheet.getMaxColumns() - C.HEADERS.length);
        assertion(extra.getValues()[0].every(function (v) { return v === ''; }) && extra.getFormulas()[0].every(function (v) { return v === ''; }), 'schema_mismatch');
      }
      assertion(protectedRange(sheet, 1, 1, 1, C.HEADERS.length), 'protection_mismatch');
      assertion(sheet.isSheetHidden(), 'schema_mismatch');
      sheet.getProtections(dep.protectionType || SpreadsheetApp.ProtectionType.RANGE).forEach(function (p) {
        var range = p.getRange();
        assertion(p.isWarningOnly() || p.canEdit() || range.getLastRow() < 2 || range.getColumn() > C.HEADERS.length, 'body_not_editable');
      });
      var sheetProtection = sheet.getProtections(dep.sheetProtectionType || SpreadsheetApp.ProtectionType.SHEET);
      assertion(sheetProtection.every(function (p) { return p.isWarningOnly() || p.canEdit(); }), 'body_not_editable');
    }
    function open(binding, account) {
      var book = dep.openBook ? dep.openBook(binding.spreadsheetId) : SpreadsheetApp.openById(binding.spreadsheetId);
      var owner = dep.owner ? dep.owner(binding.spreadsheetId) : book.getOwner();
      owner = typeof owner === 'string' ? owner : owner && owner.getEmail();
      owner = owner ? T.normalizeAccount(owner) : '';
      assertion(owner && config.teacherOwners.map(T.normalizeAccount).indexOf(owner) >= 0 && owner !== account, 'owner_mismatch');
      var editable = dep.canEdit ? dep.canEdit(binding.spreadsheetId, account) : book.getEditors().some(function (user) { return T.normalizeAccount(user.getEmail()) === account; });
      assertion(editable === true, 'permission_denied', '保存先の編集権限を確認できません。先生へ連絡してください。');
      var guide = book.getSheetByName(C.GUIDE);
      assertion(guide && !guide.isSheetHidden(), 'schema_mismatch');
      var range = guide.getRange(1, 1, 6, 2), values = range.getValues();
      assertion(range.getFormulas().every(function (r) { return r.every(function (v) { return v === ''; }); }), 'schema_mismatch');
      var labels = ['schemaVersion', 'actorKey', 'generation', 'state', 'kind', 'teacherOwner'];
      assertion(values.every(function (r, i) { return r[0] === labels[i]; }) && Number(values[0][1]) === C.SCHEMA_VERSION && values[4][1] === C.KIND && values[5][1] === owner, 'schema_mismatch');
      assertion(values[1][1] === binding.actorKey, 'account_mismatch');
      assertion(values[2][1] === binding.generation, 'binding_stale', '保存先の構成が変わりました。学校アカウントへ接続し直してください。');
      assertion(values[3][1] === 'active', 'store_inactive', '保存先を更新中か利用停止中です。');
      assertion(protectedRange(guide, 1, 1, 6, 2), 'protection_mismatch');
      verifyTable(book.getSheetByName(C.SHEET), C.DRAFT_ROWS);
      verifyTable(book.getSheetByName(C.HISTORY), C.HISTORY_ROWS);
      return book;
    }
    function call(action, input, token, origin) {
      assertion(config.enabled === true, 'disabled', 'クラウド保存は準備中です。');
      assertion(Array.isArray(config.teacherOwners) && config.teacherOwners.length > 0 && Array.isArray(config.allowedDomains) && config.allowedDomains.length > 0, 'configuration_required');
      var time = dep.now ? dep.now() : Date.now();
      var binding = T.verifyBinding(token, config, time);
      assertion(typeof origin === 'string' && binding.origin === origin && config.allowedOrigins.indexOf(origin) >= 0, 'origin_denied');
      var identity = dep.identity ? dep.identity() : { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() };
      var account = T.normalizeAccount(identity.active);
      assertion(account === T.normalizeAccount(identity.effective), 'execution_mode_mismatch');
      assertion(config.allowedDomains.indexOf(account.split('@')[1]) >= 0, 'account_denied');
      assertion(account === binding.account && T.actorKey(account) === binding.actorKey, 'account_mismatch', '接続した学校アカウントが異なります。');
      assertion(['session', 'listDrafts', 'getDraft', 'saveDraft', 'lookupSave'].indexOf(action) >= 0, 'invalid_action');
      var normalized;
      if (action === 'session') { only(input, []); normalized = {}; }
      if (action === 'listDrafts') { only(input, ['tool']); assertion(input.tool === 'python', 'invalid_tool'); normalized = { tool: 'python' }; }
      if (action === 'getDraft') { only(input, ['tool', 'questionId', 'version', 'revision']); normalized = query(input); if (input.revision !== undefined) normalized.revision = id(input.revision); }
      if (action === 'saveDraft') normalized = saveInput(input);
      if (action === 'lookupSave') { only(input, ['tool', 'requestId']); assertion(input.tool === 'python', 'invalid_tool'); normalized = { tool: 'python', requestId: id(input.requestId) }; }
      var lock = dep.lock ? dep.lock() : LockService.getUserLock();
      assertion(lock.tryLock(5000), 'busy', '保存処理中です。少し待って再試行してください。');
      try {
        // ロック取得後にも構成・世代・所有者・保護を確認する。教員による更新中は書き込まない。
        var book = open(binding, account);
        if (action === 'session') return { account: account, actorKey: binding.actorKey, spreadsheetId: binding.spreadsheetId, schemaVersion: C.SCHEMA_VERSION };
        function recheck() {
          var values = book.getSheetByName(C.GUIDE).getRange(1, 1, 6, 2).getValues();
          assertion(Number(values[0][1]) === C.SCHEMA_VERSION && values[4][1] === C.KIND, 'schema_mismatch');
          assertion(values[1][1] === binding.actorKey, 'account_mismatch');
          assertion(values[2][1] === binding.generation, 'binding_stale');
          assertion(values[3][1] === 'active', 'store_inactive');
        }
        var repository = ToolsStoreRepository.create(book, Object.assign({}, dep, { recheck: recheck }));
        var value = repository[action](normalized);
        recheck(); return value;
      } finally { lock.releaseLock(); }
    }
    return Object.freeze({ call: call });
  }
  return Object.freeze({ create: create });
}());

function toolsStoreRpc(action, input, binding, origin) {
  try { return { ok: true, value: ToolsStoreService.create(toolsStoreConfig_()).call(action, input, binding, origin) }; }
  catch (error) {
    return { ok: false, error: { code: error.toolsStoreCode || 'service_unavailable', message: error.toolsStoreCode ? error.message : 'クラウドへ接続できません。学校アカウントと通信状況を確認してください。' } };
  }
}

function doGet(e) {
  var T = ToolsStoreContract, c = toolsStoreConfig_(), p = e && e.parameter || {};
  if (!c.enabled || p.kind !== 'toolsstore' || c.allowedOrigins.indexOf(p.origin) < 0 || !/^[a-f0-9]{64}$/.test(p.channel || '')) return HtmlService.createHtmlOutput('クラウド保存は準備中です。');
  var template = HtmlService.createTemplateFromFile('20_tools_store_bridge');
  template.bootJson = JSON.stringify({ protocol: 'tools-store-rpc-v1', origin: p.origin, channel: p.channel }).replace(/</g, '\\u003c');
  return template.evaluate().setTitle('学校アカウントのクラウド保存').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
}
