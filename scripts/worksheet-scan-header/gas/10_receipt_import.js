/* Standalone GAS importer. Requires Drive advanced service v3. No Web endpoint. */
function worksheetImportConfig_() {
  var p = PropertiesService.getScriptProperties().getProperties();
  var required = ['WS_ARTIFACT_FOLDER_ID', 'WS_RECEIPT_FOLDER_ID', 'WS_LEDGER_ID',
    'WS_ROSTER_ID', 'WS_ROSTER_SHEET', 'WS_ROSTER_YEAR', 'WS_ROSTER_COLUMNS'];
  required.forEach(function (key) { if (!p[key]) throw new Error('MISSING_PROPERTY_' + key); });
  ['WS_ARTIFACT_FOLDER_ID', 'WS_RECEIPT_FOLDER_ID', 'WS_LEDGER_ID', 'WS_ROSTER_ID'].forEach(function (key) {
    if (!/^[A-Za-z0-9_-]{10,200}$/.test(p[key])) throw new Error('INVALID_PROPERTY_' + key);
  });
  if (p.WS_ARTIFACT_FOLDER_ID === p.WS_RECEIPT_FOLDER_ID || p.WS_LEDGER_ID === p.WS_ROSTER_ID) throw new Error('USE_DEDICATED_DESTINATIONS');
  p.columns = JSON.parse(p.WS_ROSTER_COLUMNS);
  if (Object.keys(p.columns).sort().join(',') !== 'classNumber,grade,number,studentKey' ||
      Object.keys(p.columns).some(function (k) { return typeof p.columns[k] !== 'string' || !p.columns[k]; }) ||
      new Set(Object.keys(p.columns).map(function (k) { return p.columns[k]; })).size !== 4) throw new Error('INVALID_ROSTER_COLUMNS');
  p.year = Number(p.WS_ROSTER_YEAR);
  if (!Number.isInteger(p.year) || p.year < 2000 || p.year > 9999) throw new Error('INVALID_ROSTER_YEAR');
  p.limit = Number(p.WS_IMPORT_LIMIT || 20);
  if (!Number.isInteger(p.limit) || p.limit < 1 || p.limit > 50) throw new Error('INVALID_IMPORT_LIMIT');
  return p;
}

function worksheetTable_(ss, name, headers, create) {
  var sheet = ss.getSheetByName(name);
  if (!sheet && create) sheet = ss.insertSheet(name);
  if (!sheet) throw new Error('MISSING_TABLE_' + name);
  if (!sheet.getLastRow() && create) sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
  if (sheet.getLastColumn() !== headers.length ||
      JSON.stringify(sheet.getRange(1, 1, 1, headers.length).getValues()[0]) !== JSON.stringify(headers)) throw new Error('TABLE_SCHEMA_MISMATCH_' + name);
  return sheet;
}

function worksheetRows_(sheet, headers) {
  var count = sheet.getLastRow() - 1;
  if (count < 0 || count > 20000) throw new Error('TABLE_ROW_LIMIT');
  if (!count) return [];
  return sheet.getRange(2, 1, count, headers.length).getValues().map(function (row) {
    var result = {};
    headers.forEach(function (h, i) { result[h] = row[i]; });
    return result;
  });
}

function worksheetRoster_(p) {
  var sheet = SpreadsheetApp.openById(p.WS_ROSTER_ID).getSheetByName(p.WS_ROSTER_SHEET);
  if (!sheet || sheet.getLastRow() < 2 || sheet.getLastRow() > 5000 || sheet.getLastColumn() > 100) throw new Error('INVALID_ROSTER_TABLE');
  var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var values = {};
  Object.keys(p.columns).forEach(function (key) {
    var column = header.indexOf(p.columns[key]);
    if (column < 0 || header.lastIndexOf(p.columns[key]) !== column) throw new Error('ROSTER_COLUMN_NOT_UNIQUE');
    // Read only the four necessary columns, never names or other roster fields.
    values[key] = sheet.getRange(2, column + 1, sheet.getLastRow() - 1, 1).getDisplayValues().map(function (v) { return String(v[0]).trim(); });
  });
  var result = [];
  values.studentKey.forEach(function (key, i) {
    if (!key && !values.grade[i] && !values.classNumber[i] && !values.number[i]) return;
    result.push({studentKey: key, grade: Number(values.grade[i]), classNumber: Number(values.classNumber[i]), number: Number(values.number[i])});
  });
  return result;
}

function worksheetRemote_(id) {
  return Drive.Files.get(id, {supportsAllDrives: true,
    fields: 'id,mimeType,size,md5Checksum,parents,trashed,properties'});
}

function worksheetImportOne_(file, p, tables, catalog, roster, importedAt) {
  if (file.mimeType !== 'application/json' || Number(file.size) > 524288 || !file.properties ||
      file.properties.worksheetRole !== 'receipt' || !file.parents || file.parents.length !== 1 ||
      file.parents[0] !== p.WS_RECEIPT_FOLDER_ID || file.trashed) throw new Error('INVALID_MANIFEST_FILE');
  var raw = DriveApp.getFileById(file.id).getBlob();
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw.getBytes()).map(function (v) {
    return ('0' + ((v + 256) % 256).toString(16)).slice(-2);
  }).join('');
  if (digest !== file.md5Checksum) throw new Error('MANIFEST_CHANGED');
  var m = WorksheetReceipt.validate(JSON.parse(raw.getDataAsString('UTF-8')));
  if (file.properties.worksheetReceipt !== m.receiptId) throw new Error('MANIFEST_ID_MISMATCH');
  var receipts = worksheetRows_(tables.receipts, WorksheetReceipt.RECEIPT_HEADERS);
  var existing = receipts.filter(function (r) { return r.receiptId === m.receiptId; });
  if (existing.length > 1) throw new Error('DUPLICATE_RECEIPT_ROWS');
  WorksheetReceipt.verifyRemote(worksheetRemote_(m.original.fileId), m.original,
    p.WS_ARTIFACT_FOLDER_ID, m.receiptId, 'original');
  m.items.forEach(function (item) {
    if (item.pdf) WorksheetReceipt.verifyRemote(worksheetRemote_(item.pdf.fileId), item.pdf,
      p.WS_ARTIFACT_FOLDER_ID, m.receiptId, 'sheet-' + item.sheetIndex);
  });
  if (existing.length) {
    if (existing[0].manifestFileId !== file.id || existing[0].manifestMd5 !== digest || existing[0].originalSha256 !== m.originalSha256) throw new Error('RECEIPT_CONFLICT');
    var committed = worksheetRows_(tables.attempts, WorksheetReceipt.ATTEMPT_HEADERS).filter(function (a) { return a.receiptId === m.receiptId; });
    if (committed.length !== m.items.length || m.items.some(function (item) {
      var rows = committed.filter(function (a) { return a.attemptId === item.attemptId; });
      return rows.length !== 1 || rows[0].sourcePages !== JSON.stringify(item.sourcePages) || rows[0].pdfFileId !== (item.pdf ? item.pdf.fileId : '');
    })) throw new Error('COMMITTED_RECEIPT_INCOMPLETE');
    return {receiptId: m.receiptId, duplicate: true, count: 0};
  }
  var attempts = WorksheetReceipt.match(m, catalog, roster, p.year);
  var prior = worksheetRows_(tables.attempts, WorksheetReceipt.ATTEMPT_HEADERS);
  var additions = [];
  attempts.forEach(function (a) {
    var rows = prior.filter(function (r) { return r.attemptId === a.attemptId; });
    if (rows.length > 1) throw new Error('DUPLICATE_ATTEMPT_ROWS');
    if (rows.length) {
      // Recover an interrupted append without replacing later writing results.
      if (WorksheetReceipt.ATTEMPT_HEADERS.filter(function (h) { return h !== 'writingStatus'; }).some(function (h) {
        return String(rows[0][h]) !== String(a[h]);
      })) throw new Error('PARTIAL_RECEIPT_CONFLICT');
    } else additions.push(WorksheetReceipt.ATTEMPT_HEADERS.map(function (h) { return a[h]; }));
  });
  if (additions.length) {
    var range = tables.attempts.getRange(tables.attempts.getLastRow() + 1, 1, additions.length, WorksheetReceipt.ATTEMPT_HEADERS.length);
    range.setNumberFormat('@');
    range.setValues(additions);
  }
  SpreadsheetApp.flush();
  var receipt = {receiptId: m.receiptId, originalSha256: m.originalSha256, stationId: m.stationId,
    receivedAt: m.receivedAt, importedAt: importedAt, readingStatus: m.readingStatus,
    pairingIntegrity: m.pairingIntegrity, pageCount: m.pageCount, originalFileId: m.original.fileId,
    manifestFileId: file.id, manifestMd5: digest, issueCodes: JSON.stringify(m.issues), writingStatus: 'NOT_STARTED'};
  // Receipt is the commit marker. Readers must ignore attempts without this row.
  var receiptRange = tables.receipts.getRange(tables.receipts.getLastRow() + 1, 1, 1, WorksheetReceipt.RECEIPT_HEADERS.length);
  receiptRange.setNumberFormat('@');
  receiptRange.setValues([WorksheetReceipt.RECEIPT_HEADERS.map(function (h) { return receipt[h]; })]);
  SpreadsheetApp.flush();
  return {receiptId: m.receiptId, duplicate: false, count: attempts.length};
}

function setupWorksheetReceiptTables() {
  var p = worksheetImportConfig_();
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('IMPORT_BUSY');
  try {
    var ss = SpreadsheetApp.openById(p.WS_LEDGER_ID);
    // Validate every existing target BEFORE adding any missing table.
    [['ws_receipts', WorksheetReceipt.RECEIPT_HEADERS], ['ws_attempts', WorksheetReceipt.ATTEMPT_HEADERS],
      ['ws_catalog', WorksheetReceipt.CATALOG_HEADERS]].forEach(function (pair) {
      if (ss.getSheetByName(pair[0])) worksheetTable_(ss, pair[0], pair[1], false);
    });
    worksheetTable_(ss, 'ws_receipts', WorksheetReceipt.RECEIPT_HEADERS, true);
    worksheetTable_(ss, 'ws_attempts', WorksheetReceipt.ATTEMPT_HEADERS, true);
    worksheetTable_(ss, 'ws_catalog', WorksheetReceipt.CATALOG_HEADERS, true);
    return {createdOrVerified: true, triggersInstalled: false};
  } finally { lock.releaseLock(); }
}

function importWorksheetReceipts() {
  var p = worksheetImportConfig_(), lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return {busy: true};
  try {
    var ss = SpreadsheetApp.openById(p.WS_LEDGER_ID);
    var tables = {receipts: worksheetTable_(ss, 'ws_receipts', WorksheetReceipt.RECEIPT_HEADERS, false),
      attempts: worksheetTable_(ss, 'ws_attempts', WorksheetReceipt.ATTEMPT_HEADERS, false)};
    var catalog = worksheetRows_(worksheetTable_(ss, 'ws_catalog', WorksheetReceipt.CATALOG_HEADERS, false), WorksheetReceipt.CATALOG_HEADERS);
    if (!catalog.length) throw new Error('EMPTY_CATALOG');
    var roster = worksheetRoster_(p), results = [], errors = [], start = Date.now();
    var properties = PropertiesService.getScriptProperties();
    var cursorKey = 'WS_IMPORT_CURSOR', cursor = properties.getProperty(cursorKey);
    var query = "'" + p.WS_RECEIPT_FOLDER_ID + "' in parents and trashed = false and mimeType = 'application/json'" +
      " and properties has { key='worksheetRole' and value='receipt' }" +
      " and not properties has { key='worksheetImport' and value='registered' }";
    var args = {q: query, pageSize: p.limit, supportsAllDrives: true, includeItemsFromAllDrives: true,
      fields: 'nextPageToken,files(id,mimeType,size,md5Checksum,parents,trashed,properties)'};
    if (cursor) args.pageToken = cursor;
    var page;
    try { page = Drive.Files.list(args); }
    catch (e) { properties.deleteProperty(cursorKey); throw new Error('DRIVE_LIST_FAILED_RETRY'); }
    var completedPage = true;
    (page.files || []).some(function (file) {
      if (Date.now() - start > 210000) { completedPage = false; return true; }
      try {
        results.push(worksheetImportOne_(file, p, tables, catalog, roster, new Date().toISOString()));
        var nextProperties = Object.assign({}, file.properties, {worksheetImport: 'registered'});
        Drive.Files.update({properties: nextProperties}, file.id, null, {supportsAllDrives: true, fields: 'id'});
      } catch (e) {
        // Never log roster values, raw SDK messages, PDF contents or credentials.
        errors.push({manifestFileId: file.id, code: /^[A-Z_]+$/.test(e.message || '') ? e.message : 'IMPORT_FAILED_RETRY'});
      }
      return false;
    });
    if (completedPage && page.nextPageToken) properties.setProperty(cursorKey, page.nextPageToken);
    else properties.deleteProperty(cursorKey);
    var result = {registered: results, pendingErrors: errors, gradingEnabled: false};
    console.log(JSON.stringify(result));
    return result;
  } finally { lock.releaseLock(); }
}

function worksheetCommittedAttempts_(receipts, attempts) {
  var ids = new Set(receipts.map(function (r) { return r.receiptId; }));
  return attempts.filter(function (a) { return ids.has(a.receiptId); });
}
