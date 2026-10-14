// 管理操作は教員のみ。通常の接続/保存/提出からシート・権限・採用状態を変更しない。
function inspectPythonEditorStorage() {
  PythonEditorConfig.identity(true);
  var c = PythonEditorConfig.config(), book = SpreadsheetApp.openById(c.storageSpreadsheetId);
  assertPythonEditorPrivateStorage_(c);
  var names = PythonEditorStore.names, plan = { schema: 1, spreadsheetId: c.storageSpreadsheetId, enabled: c.enabled,
    hasIntakeKey: PythonEditor.HASH.test(PropertiesService.getScriptProperties().getProperty('PYTHON_EDITOR_INTAKE_HMAC')), tables: [] };
  Object.keys(names).forEach(function (key) {
    var sheet = book.getSheetByName(names[key]);
    if (sheet) {
      PythonEditor.assert(sheet.getLastColumn() === PythonEditorStore.headers.length &&
        sheet.getRange(1, 1, 1, PythonEditorStore.headers.length).getValues()[0].every(function (v, i) { return v === PythonEditorStore.headers[i]; }), 'storage_not_ready');
    }
    plan.tables.push({ name: names[key], exists: !!sheet, rows: sheet ? sheet.getLastRow() : 0 });
  });
  plan.hash = PythonEditor.hashText(PythonEditor.canonical(plan)); return plan;
}
function assertPythonEditorPrivateStorage_(c) {
  var file = DriveApp.getFileById(c.storageSpreadsheetId), deployer = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  PythonEditor.assert(file.getMimeType() === 'application/vnd.google-apps.spreadsheet' && file.getSharingAccess() === DriveApp.Access.PRIVATE, 'storage_not_ready');
  var permitted = function (u) { var email = String(u.getEmail()).toLowerCase(); return email === deployer || Common.TEACHERS.some(function (e) { return String(e).toLowerCase() === email; }); };
  PythonEditor.assert(file.getEditors().concat(file.getViewers()).every(permitted), 'storage_not_ready');
}
function initializePythonEditorStorage(expectedPlanHash) {
  PythonEditorConfig.identity(true);
  var plan = inspectPythonEditorStorage(), c = PythonEditorConfig.config();
  PythonEditor.assert(!c.enabled && plan.hash === expectedPlanHash, 'config_changed');
  var lock = LockService.getScriptLock();
  PythonEditor.assert(lock.tryLock(20000), 'busy');
  try {
    var fresh = inspectPythonEditorStorage();
    PythonEditor.assert(fresh.hash === expectedPlanHash, 'config_changed');
    var book = SpreadsheetApp.openById(c.storageSpreadsheetId);
    plan.tables.forEach(function (item) {
      if (item.exists) return;
      var sheet = book.insertSheet(item.name);
      if (sheet.getMaxColumns() < PythonEditorStore.headers.length) sheet.insertColumnsAfter(sheet.getMaxColumns(), PythonEditorStore.headers.length - sheet.getMaxColumns());
      sheet.getRange(1, 1, 1, PythonEditorStore.headers.length).setValues([PythonEditorStore.headers]).setFontWeight('bold').setBackground('#e3ecff');
      sheet.setFrozenRows(1); sheet.setFrozenColumns(4);
      sheet.setColumnWidths(1, 9, 150); sheet.setColumnWidth(10, 250);
      sheet.hideColumns(11, PythonEditorStore.headers.length - 10);
    });
    var properties = PropertiesService.getScriptProperties();
    if (!properties.getProperty('PYTHON_EDITOR_INTAKE_HMAC')) properties.setProperty('PYTHON_EDITOR_INTAKE_HMAC', PythonEditor.uuid() + PythonEditor.uuid());
    PythonEditor.assert(PythonEditor.HASH.test(properties.getProperty('PYTHON_EDITOR_INTAKE_HMAC')), 'storage_not_ready');
    SpreadsheetApp.flush(); return inspectPythonEditorStorage();
  } finally { lock.releaseLock(); }
}
function previewPythonEditorVersion(spec) { return PythonEditorMaster.preview(spec); }
function adoptPythonEditorVersion(spec, expectedDigest) { return PythonEditorMaster.adopt(spec, expectedDigest); }
