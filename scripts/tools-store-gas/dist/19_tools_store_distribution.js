/**
 * dist専用追加。既存HTML/Colabの配付・認証・採点経路は呼び替えない。
 * ScriptPropertiesによる明示的な有効化までGSS/共有/構成を書き換えない。
 */
var ToolsStoreDistribution = (function () {
  'use strict';
  var LEDGER_SHEET = '個別フォルダ';
  var STORE_HEADER = 'tools保存用GSSID';
  var META_SHEET = '使い方';
  var PENDING_PREFIX = 'TOOLS_STORE_PENDING_';
  var ERROR_MESSAGES = {
    disabled: 'クラウド接続はまだ有効になっていません。',
    auth_required: '学校アカウントへログインして接続し直してください。',
    not_allowed: 'このアカウントでは接続できません。',
    invalid_request: '接続要求を確認できません。',
    invalid_config: '教員側の接続設定を確認してください。',
    roster_unavailable: '学校名簿を確認できません。教員へ連絡してください。',
    ledger_invalid: '保存先の登録を確認できません。教員へ連絡してください。',
    folder_unavailable: '個別フォルダを確認できません。教員へ連絡してください。',
    store_unavailable: '登録済みの保存先を開けません。教員へ連絡してください。',
    store_invalid: '保存先の構成を確認できません。教員へ連絡してください。',
    store_busy: '保存先を準備しています。少し待って接続し直してください。',
    store_retired: 'この保存先は停止されています。教員へ連絡してください。',
    preparation_required: '保存先の準備が必要です。教員へ連絡してください。',
    creation_uncertain: '保存先の作成状況を教員が確認する必要があります。',
    internal: '接続を完了できませんでした。しばらくして接続し直してください。'
  };

  function fail(code) {
    var error = new Error(ERROR_MESSAGES[code] || ERROR_MESSAGES.internal);
    error.code = code;
    throw error;
  }
  function assert(value, code) { if (!value) fail(code); }
  function text(value) { return String(value === undefined || value === null ? '' : value).trim(); }
  function email(value) { return text(value).toLowerCase(); }
  function validEmail(value) { return /^[a-z0-9.!#$%&'*+\/= ?^_`{|}~-]+@[a-z0-9.-]+\.[a-z]{2,}$/i.test(value) && value.indexOf(' ') < 0; }
  function keysOnly(value, keys) {
    return value && typeof value === 'object' && !Array.isArray(value) &&
      Object.keys(value).every(function (key) { return keys.indexOf(key) >= 0; });
  }
  function strictJSON(raw, fallback) {
    if (!raw) return fallback;
    try { return JSON.parse(raw); } catch (error) { fail('invalid_config'); }
  }
  function parseConfiguration(properties) {
    var get = function (name) { return properties.getProperty(name); };
    var c = {
      enabled: get('TOOLS_STORE_DIST_ENABLED') === 'true',
      provisioningEnabled: get('TOOLS_STORE_DIST_PROVISIONING_ENABLED') === 'true',
      adminEnabled: get('TOOLS_STORE_DIST_ADMIN_ENABLED') === 'true',
      confirmationEnabled: get('TOOLS_STORE_DIST_CONFIRMATION_ENABLED') === 'true',
      bindingKey: text(get('TOOLS_STORE_BINDING_KEY')),
      bindingLifetimeMs: 3600000,
      allowedOrigins: strictJSON(get('TOOLS_STORE_ALLOWED_ORIGINS'), []),
      teachers: strictJSON(get('TOOLS_STORE_TEACHERS'), []),
      storeURL: text(get('TOOLS_STORE_URL'))
    };
    assert(Array.isArray(c.allowedOrigins) && Array.isArray(c.teachers), 'invalid_config');
    c.teachers = c.teachers.map(email);
    assert(c.allowedOrigins.every(function (origin) {
      return /^https:\/\/[a-z0-9.-]+(?::[0-9]+)?$/i.test(origin);
    }) && c.teachers.every(validEmail), 'invalid_config');
    return c;
  }
  function validStoreURL(value) {
    return /^https:\/\/script\.google\.com\/(?:a\/(?:macros\/)?[a-z0-9.-]+\/)?macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(value) ||
      /^https:\/\/script\.google\.com\/a\/macros\/[a-z0-9.-]+\/s\/[A-Za-z0-9_-]+\/exec$/.test(value);
  }
  function assertConnectionConfig(c, requireEnabled) {
    if (requireEnabled !== false) assert(c.enabled, 'disabled');
    assert(c.bindingKey.length >= 32 && c.allowedOrigins.length > 0 && c.teachers.length > 0 && validStoreURL(c.storeURL), 'invalid_config');
  }
  function parseHeader(row) {
    var result = Object.create(null);
    row.forEach(function (value, index) {
      var key = text(value);
      if (!key) return;
      assert(result[key] === undefined, 'ledger_invalid');
      result[key] = index;
    });
    return result;
  }
  function readLedger(env, account, requireStoreColumn) {
    var sheet = env.ledger();
    assert(sheet, 'ledger_invalid');
    var values = sheet.getDataRange().getValues();
    var header = parseHeader(values[0] || []);
    ['userId', '個別フォルダID'].forEach(function (key) { assert(header[key] !== undefined, 'ledger_invalid'); });
    if (requireStoreColumn) assert(header[STORE_HEADER] !== undefined, 'preparation_required');
    var entry = null, users = Object.create(null), stores = Object.create(null);
    for (var index = 1; index < values.length; index++) {
      var row = values[index];
      var user = email(row[header.userId]);
      if (!user) continue;
      assert(!users[user], 'ledger_invalid');
      users[user] = true;
      var storeId = header[STORE_HEADER] === undefined ? '' : text(row[header[STORE_HEADER]]);
      if (storeId) { assert(!stores[storeId], 'ledger_invalid'); stores[storeId] = user; }
      if (user === account) {
        entry = { account: account, row: index + 1, folderId: text(row[header['個別フォルダID']]),
          spreadsheetId: storeId, storeColumn: header[STORE_HEADER] === undefined ? 0 : header[STORE_HEADER] + 1,
          sheet: sheet };
      }
    }
    assert(entry && /^[A-Za-z0-9_-]{10,}$/.test(entry.folderId), 'ledger_invalid');
    if (entry.spreadsheetId) assert(/^[A-Za-z0-9_-]{10,}$/.test(entry.spreadsheetId), 'ledger_invalid');
    return entry;
  }
  function assertRoster(env, account) {
    var record;
    try { record = env.roster(account); } catch (error) { fail('roster_unavailable'); }
    assert(record && email(record.userId) === account && Number(record['年']) > 0, 'not_allowed');
    return record;
  }
  function currentActor(env, c) {
    var account = email(env.activeAccount());
    assert(account && validEmail(account), 'auth_required');
    assert(c.teachers.indexOf(email(env.effectiveAccount())) >= 0, 'invalid_config');
    assertRoster(env, account);
    return account;
  }
  function assertAdmin(env, c, write) {
    var account = email(env.activeAccount());
    assert(account && c.teachers.indexOf(account) >= 0 && c.teachers.indexOf(email(env.effectiveAccount())) >= 0, 'not_allowed');
    if (write) assert(c.adminEnabled && c.provisioningEnabled, 'disabled');
  }
  function safeFile(env, id) {
    try {
      var file = env.file(id);
      assert(file && !file.isTrashed() && file.getMimeType() === 'application/vnd.google-apps.spreadsheet', 'store_unavailable');
      return file;
    } catch (error) { fail('store_unavailable'); }
  }
  function assertOwner(file, c) {
    var owner = file.getOwner();
    assert(owner && c.teachers.indexOf(email(owner.getEmail())) >= 0, 'store_invalid');
    return email(owner.getEmail());
  }
  function assertFolder(env, entry, c) {
    try {
      var folder = env.folder(entry.folderId);
      assert(folder && !folder.isTrashed(), 'folder_unavailable');
      var owner = folder.getOwner();
      assert(owner && c.teachers.indexOf(email(owner.getEmail())) >= 0, 'folder_unavailable');
      return folder;
    } catch (error) { fail('folder_unavailable'); }
  }
  function assertParent(file, folderId) {
    var parents = file.getParents(), found = false;
    while (parents.hasNext()) if (parents.next().getId() === folderId) found = true;
    assert(found, 'store_invalid');
  }
  function metadata(ss) {
    var sheet = ss.getSheetByName(META_SHEET);
    if (!sheet) return null;
    var rows = sheet.getRange(1, 1, 6, 2).getValues();
    var expected = ['schemaVersion', 'actorKey', 'generation', 'state', 'kind', 'teacherOwner'];
    var result = {};
    expected.forEach(function (key, index) {
      assert(rows[index][0] === key, 'store_invalid');
      result[key] = rows[index][1];
    });
    return result;
  }
  function assertMetadata(meta, account, teacherOwner, allowPreparing) {
    assert(meta && Number(meta.schemaVersion) === 1 && meta.actorKey === ToolsStoreContract.actorKey(account) &&
      /^[a-f0-9]{32}$/.test(meta.generation) && meta.kind === 'tools-store-v1' && email(meta.teacherOwner) === teacherOwner, 'store_invalid');
    if (meta.state === 'retired') fail('store_retired');
    if (meta.state !== 'active') {
      assert(allowPreparing && (meta.state === 'creating' || meta.state === 'upgrading'), 'store_busy');
    }
  }
  function assertHeader(sheet, expected) {
    expected = expected || ToolsStoreContract.constants.HEADERS;
    assert(sheet && sheet.getMaxColumns() >= expected.length, 'store_invalid');
    var actual = sheet.getRange(1, 1, 1, expected.length).getValues()[0];
    assert(actual.every(function (value, index) { return value === expected[index]; }), 'store_invalid');
    if (sheet.getLastColumn() > expected.length) {
      var extra = sheet.getRange(1, expected.length + 1, 1, sheet.getLastColumn() - expected.length).getValues()[0];
      assert(extra.every(function (value) { return !text(value); }), 'store_invalid');
    }
  }
  function assertLayout(ss) {
    var c = ToolsStoreContract.constants;
    var current = ss.getSheetByName('Python'), history = ss.getSheetByName('Python履歴');
    assertHeader(current); assertHeader(history);
    assert(current.getMaxRows() >= c.MIN_DRAFT_ROWS && history.getMaxRows() >= c.HISTORY_ROWS, 'store_invalid');
    assert(current.getLastRow() <= 1 + ToolsStoreContract.draftCapacity(current.getMaxRows()) * c.BLOCK && history.getLastRow() <= c.HISTORY_ROWS, 'store_invalid');
    assert(current.isSheetHidden() && history.isSheetHidden() && !ss.getSheetByName(META_SHEET).isSheetHidden(), 'store_invalid');
  }
  function assertConfirmationLayout(ss) {
    var c = ToolsStoreContract.constants.CONFIRMATION;
    [[c.SHEET, c.ROWS, c.HEADERS], [c.RECEIPTS, c.RECEIPT_ROWS, c.RECEIPT_HEADERS]].forEach(function (spec) {
      var sheet = ss.getSheetByName(spec[0]); assertHeader(sheet, spec[2]);
      assert(sheet.getMaxRows() >= spec[1] && sheet.isSheetHidden(), 'store_invalid');
    });
  }
  function getExisting(env, c, entry, allowPreparing) {
    var file = safeFile(env, entry.spreadsheetId);
    var owner = assertOwner(file, c);
    assertParent(file, entry.folderId);
    var ss;
    try { ss = env.open(entry.spreadsheetId); } catch (error) { fail('store_unavailable'); }
    var meta = metadata(ss);
    assertMetadata(meta, entry.account, owner, allowPreparing);
    return { spreadsheet: ss, file: file, metadata: meta, owner: owner };
  }
  function pendingKey(account) { return PENDING_PREFIX + ToolsStoreContract.actorKey(account); }
  function readPending(env, account) {
    var raw = env.properties.getProperty(pendingKey(account));
    if (!raw) return null;
    try {
      var value = JSON.parse(raw);
      assert(value && value.accountKey === ToolsStoreContract.actorKey(account) && value.folderId, 'creation_uncertain');
      return value;
    } catch (error) { fail('creation_uncertain'); }
  }
  function writePending(env, account, value) { env.properties.setProperty(pendingKey(account), JSON.stringify(value)); }
  function fileName(account) { return 'tools保存用_' + ToolsStoreContract.actorKey(account); }
  function uniqueRecoveryFile(env, c, pending, account) {
    var files = env.findFiles(fileName(account)), matches = [];
    while (files.hasNext()) {
      var file = files.next();
      if (file.isTrashed()) continue;
      var owner = file.getOwner();
      if (owner && c.teachers.indexOf(email(owner.getEmail())) >= 0 && file.getMimeType() === 'application/vnd.google-apps.spreadsheet') matches.push(file);
    }
    assert(matches.length === 1, 'creation_uncertain');
    return matches[0];
  }
  function ensureGrid(sheet, rows, cols) {
    if (sheet.getMaxRows() < rows) sheet.insertRowsAfter(sheet.getMaxRows(), rows - sheet.getMaxRows());
    if (sheet.getMaxColumns() < cols) sheet.insertColumnsAfter(sheet.getMaxColumns(), cols - sheet.getMaxColumns());
  }
  function protect(env, sheet, range, description, teachers) {
    var protections = sheet.getProtections(env.rangeProtectionType);
    var same = protections.filter(function (p) { return p.getDescription() === description; });
    assert(same.length <= 1, 'store_invalid');
    var protection = same.length ? same[0] : range.protect().setDescription(description);
    protection.setRange(range);
    protection.setWarningOnly(false);
    protection.addEditors(teachers);
    var removable = protection.getEditors().map(function (user) { return email(user.getEmail()); }).filter(function (value) { return teachers.indexOf(value) < 0; });
    if (removable.length) protection.removeEditors(removable);
    if (protection.canDomainEdit()) protection.setDomainEdit(false);
  }
  function assertBlankNewSpreadsheet(ss) {
    var sheets = ss.getSheets();
    assert(sheets.length === 1 && sheets[0].getLastRow() === 0 && sheets[0].getLastColumn() === 0, 'creation_uncertain');
  }
  function ensureStructure(env, c, ss, account, owner, isNew) {
    var constants = ToolsStoreContract.constants;
    var meta = metadata(ss), guide;
    if (!meta) {
      assert(isNew, 'store_invalid');
      assertBlankNewSpreadsheet(ss);
      guide = ss.getSheets()[0];
      guide.setName(META_SHEET);
      guide.getRange(1, 1, 6, 2).setValues([
        ['schemaVersion', 1], ['actorKey', ToolsStoreContract.actorKey(account)], ['generation', env.randomId()],
        ['state', 'creating'], ['kind', 'tools-store-v1'], ['teacherOwner', owner]
      ]);
      env.flush();
      meta = metadata(ss);
    } else {
      assertMetadata(meta, account, owner, true);
      guide = ss.getSheetByName(META_SHEET);
      guide.getRange(4, 2).setValue('upgrading');
      env.flush();
    }
    guide.showSheet();
    guide.getRange(8, 1, 5, 2).setValues([
      ['toolsの保存データ', 'このGSSはエディタのクラウド保存先です。'],
      ['操作', '編集・復元は各エディタから行ってください。'],
      ['提出', 'ここへの保存は正式提出ではありません。'],
      ['非表示シート', '保存データを含みます。直接変更すると復元できなくなる場合があります。'],
      ['困ったとき', '保存先を削除せず教員へ連絡してください。']
    ]);
    protect(env, guide, guide.getRange(1, 1, 6, 2), 'tools-store:metadata:v1', c.teachers);
    [ ['Python', constants.DRAFT_ROWS], ['Python履歴', constants.HISTORY_ROWS] ].forEach(function (spec) {
      var sheet = ss.getSheetByName(spec[0]);
      if (spec[0] === constants.SHEET && sheet && sheet.getMaxRows() < spec[1]) {
        // 既存位置を保って末尾だけ増設する。古いbindingの書込を先に止める。
        guide.getRange(3, 2).setValue(env.randomId());
        env.flush();
      }
      if (!sheet) sheet = ss.insertSheet(spec[0]);
      ensureGrid(sheet, spec[1], constants.HEADERS.length);
      assert(sheet.getMaxRows() >= spec[1], 'store_invalid');
      if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, constants.HEADERS.length).setValues([constants.HEADERS.slice()]);
      else assertHeader(sheet);
      sheet.setFrozenRows(1);
      protect(env, sheet, sheet.getRange(1, 1, 1, constants.HEADERS.length), 'tools-store:header:' + spec[0] + ':v1', c.teachers);
      sheet.hideSheet();
    });
    if (c.confirmationEnabled) {
      var ext = constants.CONFIRMATION, existed = !!ss.getSheetByName(ext.SHEET) && !!ss.getSheetByName(ext.RECEIPTS);
      [[ext.SHEET, ext.ROWS, ext.HEADERS], [ext.RECEIPTS, ext.RECEIPT_ROWS, ext.RECEIPT_HEADERS]].forEach(function (spec) {
        var sheet = ss.getSheetByName(spec[0]);
        if (!sheet) sheet = ss.insertSheet(spec[0]);
        ensureGrid(sheet, spec[1], spec[2].length);
        if (sheet.getLastRow() === 0) sheet.getRange(1, 1, 1, spec[2].length).setValues([spec[2].slice()]);
        else assertHeader(sheet, spec[2]);
        sheet.setFrozenRows(1);
        protect(env, sheet, sheet.getRange(1, 1, 1, spec[2].length), 'tools-store:confirmation:' + spec[0] + ':v1', c.teachers);
        sheet.hideSheet();
      });
      assertConfirmationLayout(ss);
      if (!existed) guide.getRange(3, 2).setValue(env.randomId());
    }
    env.flush();
    assertLayout(ss);
    guide.getRange(4, 2).setValue('active');
    env.flush();
    assertMetadata(metadata(ss), account, owner, false);
  }
  function assertEditors(file, c, account) {
    assert(String(file.getSharingAccess()) === 'PRIVATE', 'store_invalid');
    var editors = file.getEditors().map(function (user) { return email(user.getEmail()); });
    assert(editors.every(function (value) { return value === account || c.teachers.indexOf(value) >= 0; }), 'store_invalid');
    assert(editors.indexOf(account) >= 0, 'store_invalid');
  }
  function createOrResume(env, c, entry, folder) {
    var account = entry.account, pending = readPending(env, account), file, ss;
    if (pending) {
      assert(pending.folderId === entry.folderId, 'creation_uncertain');
      if (pending.spreadsheetId) file = safeFile(env, pending.spreadsheetId);
      else file = uniqueRecoveryFile(env, c, pending, account);
      assertOwner(file, c);
      pending.spreadsheetId = file.getId();
      writePending(env, account, pending);
      ss = env.open(file.getId());
    } else {
      var known = env.findFiles(fileName(account));
      while (known.hasNext()) {
        var candidate = known.next(), candidateOwner = candidate.getOwner();
        if (!candidate.isTrashed() && candidateOwner && c.teachers.indexOf(email(candidateOwner.getEmail())) >= 0) fail('creation_uncertain');
      }
      // 作成前に意図を永続化する。createの成否不明時は再作成せず教員確認へ進める。
      pending = { accountKey: ToolsStoreContract.actorKey(account), folderId: entry.folderId,
        startedAt: env.now().toISOString(), phase: 'creating', spreadsheetId: '' };
      writePending(env, account, pending);
      try {
        ss = env.create(fileName(account));
        pending.spreadsheetId = ss.getId();
        writePending(env, account, pending);
        file = safeFile(env, ss.getId());
      } catch (error) { fail('creation_uncertain'); }
    }
    var owner = assertOwner(file, c);
    // 移動・共有を再実行しても重複ファイルは作らない。
    file.moveTo(folder);
    ensureStructure(env, c, ss, account, owner, true);
    file.addEditor(account);
    file.setShareableByEditors(false);
    assertEditors(file, c, account);
    assertParent(file, entry.folderId);
    var beforeCommit = readLedger(env, account, true);
    assert(beforeCommit.folderId === entry.folderId && (!beforeCommit.spreadsheetId || beforeCommit.spreadsheetId === ss.getId()), 'ledger_invalid');
    beforeCommit.sheet.getRange(beforeCommit.row, beforeCommit.storeColumn).setValue(ss.getId());
    env.flush();
    var check = readLedger(env, account, true);
    assert(check.spreadsheetId === ss.getId() && check.folderId === entry.folderId, 'ledger_invalid');
    env.properties.deleteProperty(pendingKey(account));
    return getExisting(env, c, check, false);
  }
  function prepareOne(env, c, account, repair) {
    assertRoster(env, account);
    var entry = readLedger(env, account, true);
    var folder = assertFolder(env, entry, c);
    if (!entry.spreadsheetId) return createOrResume(env, c, entry, folder);
    var existing = getExisting(env, c, entry, repair);
    if (repair) {
      // active版の必須シート消失を空の新規シートで隠さない。作成途中だけ再開できる。
      if (existing.metadata.state === 'active') {
        assertLayout(existing.spreadsheet);
        var ext = ToolsStoreContract.constants.CONFIRMATION;
        if (existing.spreadsheet.getSheetByName(ext.SHEET) || existing.spreadsheet.getSheetByName(ext.RECEIPTS)) assertConfirmationLayout(existing.spreadsheet);
      }
      ensureStructure(env, c, existing.spreadsheet, account, existing.owner, false);
      existing.file.addEditor(account);
      existing.file.setShareableByEditors(false);
    }
    assertLayout(existing.spreadsheet);
    assertEditors(existing.file, c, account);
    var pending = readPending(env, account);
    if (pending) {
      assert(pending.folderId === entry.folderId && (!pending.spreadsheetId || pending.spreadsheetId === entry.spreadsheetId), 'creation_uncertain');
      env.properties.deleteProperty(pendingKey(account));
    }
    return existing;
  }
  function connection(env, input) {
    var c = env.configuration();
    assertConnectionConfig(c);
    assert(keysOnly(input, ['tool', 'origin']) && input.tool === 'python' && c.allowedOrigins.indexOf(input.origin) >= 0, 'invalid_request');
    var account = currentActor(env, c);
    var entry = readLedger(env, account, true), existing;
    assertFolder(env, entry, c);
    if (entry.spreadsheetId) {
      existing = getExisting(env, c, entry, false);
      assertLayout(existing.spreadsheet);
      assertEditors(existing.file, c, account);
    } else {
      assert(c.provisioningEnabled, 'preparation_required');
      var lock = env.lock();
      if (!lock.tryLock(5000)) fail('store_busy');
      try {
        // ロック取得後に本人・名簿・台帳を再照合する。
        assert(currentActor(env, c) === account, 'not_allowed');
        existing = prepareOne(env, c, account, false);
      } finally { lock.releaseLock(); }
    }
    var binding = ToolsStoreContract.issueBinding({ account: account, spreadsheetId: existing.spreadsheet.getId(),
      generation: existing.metadata.generation, tool: 'python', origin: input.origin }, c, env.now().getTime());
    return { account: account, actorKey: ToolsStoreContract.actorKey(account), binding: binding,
      spreadsheetId: existing.spreadsheet.getId(), storeURL: c.storeURL, schemaVersion: 1 };
  }
  function adminAccounts(input) {
    assert(keysOnly(input, ['accounts', 'confirmation']) && Array.isArray(input.accounts) && input.accounts.length > 0 && input.accounts.length <= 10, 'invalid_request');
    var accounts = input.accounts.map(email);
    assert(accounts.every(validEmail) && accounts.every(function (value, index) { return accounts.indexOf(value) === index; }), 'invalid_request');
    return accounts;
  }
  function preview(env, input) {
    var c = env.configuration();
    assertAdmin(env, c, false);
    var accounts = adminAccounts(input);
    return { readOnly: true, ledgerSheet: LEDGER_SHEET, ledgerHeader: STORE_HEADER,
      enabled: c.enabled, provisioningEnabled: c.provisioningEnabled, adminEnabled: c.adminEnabled,
      accounts: accounts.map(function (account) {
        try {
          assertRoster(env, account);
          var entry = readLedger(env, account, false);
          assertFolder(env, entry, c);
          var pending = readPending(env, account);
          if (entry.spreadsheetId) {
            var existing = getExisting(env, c, entry, true);
            assertLayout(existing.spreadsheet);
            var ext = ToolsStoreContract.constants.CONFIRMATION;
            var hasConfirmation = !!existing.spreadsheet.getSheetByName(ext.SHEET) && !!existing.spreadsheet.getSheetByName(ext.RECEIPTS);
            if (hasConfirmation) assertConfirmationLayout(existing.spreadsheet);
            return { account: account, state: existing.metadata.state === 'active' ? 'registered' : 'preparing',
              spreadsheetId: entry.spreadsheetId, pending: !!pending,
              confirmationJournal: hasConfirmation ? 'ready' : 'upgrade_required' };
          }
          return { account: account, state: entry.storeColumn ? (pending ? 'resume_required' : 'create_candidate') : 'ledger_column_required', pending: !!pending };
        } catch (error) { return { account: account, state: 'blocked', code: ERROR_MESSAGES[error.code] ? error.code : 'internal' }; }
      }) };
  }
  function ensureLedgerColumn(env) {
    var c = env.configuration();
    assertAdmin(env, c, true);
    var lock = env.lock();
    if (!lock.tryLock(5000)) fail('store_busy');
    try {
      var sheet = env.ledger();
      assert(sheet, 'ledger_invalid');
      var header = parseHeader(sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]);
      ['userId', '個別フォルダID'].forEach(function (key) { assert(header[key] !== undefined, 'ledger_invalid'); });
      if (header[STORE_HEADER] !== undefined) return { state: 'existing', column: header[STORE_HEADER] + 1 };
      var column = sheet.getLastColumn() + 1;
      ensureGrid(sheet, sheet.getMaxRows(), column);
      sheet.getRange(1, column).setValue(STORE_HEADER);
      env.flush();
      assert(sheet.getRange(1, column).getValue() === STORE_HEADER, 'ledger_invalid');
      return { state: 'created', column: column };
    } finally { lock.releaseLock(); }
  }
  function prepare(env, input) {
    var c = env.configuration();
    assertAdmin(env, c, true);
    assertConnectionConfig(c, false);
    var accounts = adminAccounts(input);
    assert(input.confirmation === 'PREPARE_TOOLS_STORES_V1', 'invalid_request');
    var results = [];
    accounts.forEach(function (account) {
      var lock = env.lock();
      if (!lock.tryLock(5000)) { results.push({ account: account, state: 'blocked', code: 'store_busy' }); return; }
      try {
        assertAdmin(env, c, true);
        var existing = prepareOne(env, c, account, true);
        results.push({ account: account, state: 'ready', spreadsheetId: existing.spreadsheet.getId() });
      } catch (error) { results.push({ account: account, state: 'blocked', code: ERROR_MESSAGES[error.code] ? error.code : 'internal' }); }
      finally { lock.releaseLock(); }
    });
    return { results: results };
  }
  function envelope(callback) {
    try { return { ok: true, value: callback() }; }
    catch (error) {
      var code = ERROR_MESSAGES[error.code] ? error.code : 'internal';
      return { ok: false, error: { code: code, message: ERROR_MESSAGES[code] } };
    }
  }
  function gasEnvironment() {
    var properties = PropertiesService.getScriptProperties();
    return {
      properties: properties,
      configuration: function () { return parseConfiguration(properties); },
      activeAccount: function () { return Session.getActiveUser().getEmail(); },
      effectiveAccount: function () { return Session.getEffectiveUser().getEmail(); },
      roster: function (account) {
        var result = getDistributionRosterUserRecord_(account, SpreadsheetApp.openById(SSID), ['年', '組', '番', '氏名']);
        return result && result.user;
      },
      ledger: function () { return SpreadsheetApp.openById(SSID).getSheetByName(LEDGER_SHEET); },
      folder: function (id) { return DriveApp.getFolderById(id); },
      file: function (id) { return DriveApp.getFileById(id); },
      open: function (id) { return SpreadsheetApp.openById(id); },
      create: function (name) { return SpreadsheetApp.create(name); },
      findFiles: function (name) { return DriveApp.getFilesByName(name); },
      rangeProtectionType: SpreadsheetApp.ProtectionType.RANGE,
      randomId: function () { return Utilities.getUuid().replace(/-/g, ''); },
      lock: function () { return LockService.getScriptLock(); },
      now: function () { return new Date(); },
      flush: function () { SpreadsheetApp.flush(); }
    };
  }
  function create(env) {
    return {
      connection: function (input) { return envelope(function () { return connection(env, input); }); },
      preview: function (input) { return envelope(function () { return preview(env, input); }); },
      ensureLedgerColumn: function () { return envelope(function () { return ensureLedgerColumn(env); }); },
      prepare: function (input) { return envelope(function () { return prepare(env, input); }); }
    };
  }
  function boot(input) {
    var c = parseConfiguration(PropertiesService.getScriptProperties());
    assertConnectionConfig(c);
    assert(input && c.allowedOrigins.indexOf(input.origin) >= 0 && /^[a-f0-9]{64}$/.test(input.channel), 'invalid_request');
    return { protocol: 'tools-store-rpc-v1', origin: input.origin, channel: input.channel };
  }
  return { create: create, gasEnvironment: gasEnvironment, boot: boot, parseConfiguration: parseConfiguration,
    constants: { LEDGER_SHEET: LEDGER_SHEET, STORE_HEADER: STORE_HEADER } };
})();

function getToolsStoreConnectionV1(input) {
  return ToolsStoreDistribution.create(ToolsStoreDistribution.gasEnvironment()).connection(input);
}
function previewToolsStorePreparationV1(input) {
  return ToolsStoreDistribution.create(ToolsStoreDistribution.gasEnvironment()).preview(input);
}
function initializeToolsStoreLedgerColumnV1() {
  return ToolsStoreDistribution.create(ToolsStoreDistribution.gasEnvironment()).ensureLedgerColumn();
}
function prepareToolsStoresV1(input) {
  return ToolsStoreDistribution.create(ToolsStoreDistribution.gasEnvironment()).prepare(input);
}
/** 既存doGetへtype=toolsStoreだけ追加するための、既存経路から独立した入口。 */
function renderToolsStoreConnectionV1_(event) {
  try {
    var boot = ToolsStoreDistribution.boot(event && event.parameter || {});
    var template = HtmlService.createTemplateFromFile('25_toolsStoreConnection');
    template.toolsStoreBootJson = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');
    return template.evaluate().setTitle('tools クラウド接続').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (error) {
    return HtmlService.createHtmlOutput('<!doctype html><html lang="ja"><meta charset="utf-8"><title>tools クラウド接続</title><p>クラウド接続はまだ利用できません。教員へ確認してください。</p></html>');
  }
}
