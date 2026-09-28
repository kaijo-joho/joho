import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {readFileSync} from 'node:fs';
import {test} from 'node:test';
import vm from 'node:vm';

const coreSource = readFileSync(new URL('../gas/00_receipt_core.js', import.meta.url), 'utf8');
const importerSource = readFileSync(new URL('../gas/10_receipt_import.js', import.meta.url), 'utf8');
const copy = value => JSON.parse(JSON.stringify(value));
const context = vm.createContext({});
vm.runInContext(coreSource, context);
const core = context.WorksheetReceipt;
const sha = 'a'.repeat(64), receiptId = 'ws-' + sha;
const asset = (fileId, mimeType = 'application/pdf') => ({fileId, mimeType, size: 123, md5: 'b'.repeat(32), sha256: sha});
const catalog = [{subject: 'INFO1', year: 2026, worksheetId: 'WS05', grade: 1, enabled: true}];
const roster = [{studentKey: 'fake-307', grade: 1, classNumber: 3, number: 7},
  {studentKey: 'fake-408', grade: 1, classNumber: 4, number: 8}];
function fixture() {
  return {schemaVersion: 'worksheet-cloud-receipt/1', receiptId, originalSha256: sha,
    receivedAt: '2026-09-27T10:00:00+09:00', stationId: 'mini', readingStatus: 'OK', pairingIntegrity: 'consistent',
    pageCount: 2, issues: [], original: asset('original-file-0001'),
    analysis: {configSha256: sha, coordinatesSha256: sha}, gradingEnabled: false, requiresStudentConfirmation: false,
    items: [{attemptId: receiptId + ':1', sheetIndex: 1, sourcePages: [1, 2], readingStatus: 'OK', confidence: .9,
      worksheet: {subject: 'INFO1', year: 2026, worksheetId: 'WS05'}, studentIdentifier: '307', pairValid: true,
      reversedPages: false, issues: [], pdf: asset('split-file-00001')}]};
}

test('QR plus three digits matches one roster entry without any local roster', () => {
  const [a] = core.match(fixture(), catalog, roster, 2026);
  assert.equal(a.studentKey, 'fake-307');
  assert.equal(a.intakeStatus, 'OK');
  assert.equal(a.writingStatus, 'NOT_STARTED');
});

test('roster, material and year mismatches are review, never guessed', () => {
  const cases = [
    [m => {m.items[0].studentIdentifier = '399';}, catalog, 'roster_not_found'],
    [m => {m.items[0].worksheet.worksheetId = 'UNKNOWN';}, catalog, 'worksheet_not_registered'],
    [m => {m.items[0].worksheet.year = 2025;}, [{...catalog[0], year: 2025}], 'roster_year_mismatch'],
    [() => {}, [{...catalog[0], enabled: false}], 'worksheet_disabled']
  ];
  for (const [change, settings, reason] of cases) {
    const m = fixture(); change(m);
    const [a] = core.match(m, settings, roster, 2026);
    assert.equal(a.intakeStatus, 'REVIEW');
    assert.equal(a.studentKey, '');
    assert.ok(JSON.parse(a.flags).includes(reason));
  }
});

test('uncertain OMR is retained without a student assignment', () => {
  const m = fixture();
  m.readingStatus = m.items[0].readingStatus = 'REVIEW';
  m.items[0].studentIdentifier = null;
  const [a] = core.match(m, catalog, roster, 2026);
  assert.equal(a.studentKey, '');
  assert.equal(a.intakeStatus, 'REVIEW');
});

test('invalid pairing claims, guessed digits and formula-like identifiers are rejected', () => {
  for (const mutate of [
    m => {m.pageCount = 3;}, m => {m.items[0].pairValid = false;},
    m => {m.items[0].sourcePages = [2, 1];}, m => {m.items[0].studentIdentifier = '300';},
    m => {m.pairingIntegrity = 'uncertain';}, m => {m.items[0].readingStatus = 'REVIEW';},
    m => {m.items[0].worksheet.subject = '=formula';}, m => {m.items[0].pdf.fileId = m.original.fileId;},
    m => {m.requiresStudentConfirmation = true;}, m => {m.gradingEnabled = true;}
  ]) {
    const m = fixture(); mutate(m);
    assert.throws(() => core.validate(m));
  }
});

test('ambiguous roster or QR-to-grade configuration stops matching', () => {
  assert.throws(() => core.match(fixture(), [...catalog, {...catalog[0], grade: 2}], roster, 2026), /AMBIGUOUS_CATALOG/);
  assert.throws(() => core.match(fixture(), catalog, [...roster, {...roster[0], studentKey: 'another'}], 2026), /AMBIGUOUS_ROSTER/);
  assert.throws(() => core.match(fixture(), catalog, [{...roster[0], studentKey: '=evil()'}], 2026), /INVALID_ROSTER/);
});

test('duplicate submissions do not silently select the latest candidate', () => {
  const a = core.match(fixture(), catalog, roster, 2026)[0];
  const only = core.groups([a])[0];
  assert.equal(only.selectedAttemptId, a.attemptId);
  const duplicate = core.groups([a, {...a, attemptId: 'different-original:1'}])[0];
  assert.equal(duplicate.selectedAttemptId, null);
  assert.deepEqual(copy(duplicate.flags), ['duplicate_submission']);
  assert.equal(core.groups([a, {...a, attemptId: 'unreadable:1', studentKey: '', intakeStatus: 'ERROR'}])[0].selectedAttemptId, a.attemptId);
});

class Sheet {
  constructor(name, rows = []) { this.name = name; this.rows = copy(rows); this.writes = 0; this.reads = []; this.failWrite = false; }
  getLastRow() { return this.rows.length; }
  getLastColumn() { return this.rows[0]?.length || 0; }
  getRange(row, col, height, width) {
    this.reads.push({row, col, height, width});
    return {
      setNumberFormat: format => {assert.equal(format, '@');},
      getValues: () => Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => this.rows[row + r - 1]?.[col + c - 1] ?? '')),
      getDisplayValues: () => Array.from({length: height}, (_, r) => Array.from({length: width}, (_, c) => String(this.rows[row + r - 1]?.[col + c - 1] ?? ''))),
      setValues: values => {
        if (this.failWrite) {this.failWrite = false; throw new Error('simulated sheet write failure');}
        this.writes++;
        values.forEach((valuesRow, r) => {
          const output = this.rows[row + r - 1] ||= [];
          valuesRow.forEach((v, c) => {output[col + c - 1] = v;});
        });
      }
    };
  }
}
function harness(m = fixture()) {
  const properties = {WS_ARTIFACT_FOLDER_ID: 'artifact-folder-0001', WS_RECEIPT_FOLDER_ID: 'receipt-folder-00001',
    WS_LEDGER_ID: 'ledger-file-0001', WS_ROSTER_ID: 'roster-file-0001', WS_ROSTER_SHEET: 'roster', WS_ROSTER_YEAR: '2026',
    WS_ROSTER_COLUMNS: JSON.stringify({studentKey: 'account', grade: '年', classNumber: '組', number: '番'})};
  const sheets = {
    ws_receipts: new Sheet('ws_receipts', [copy(core.RECEIPT_HEADERS)]),
    ws_attempts: new Sheet('ws_attempts', [copy(core.ATTEMPT_HEADERS)]),
    ws_catalog: new Sheet('ws_catalog', [copy(core.CATALOG_HEADERS), ['INFO1', 2026, 'WS05', 1, true]]),
    roster: new Sheet('roster', [['account', 'unused-name', '年', '組', '番'], ['fake-307', 'never read', 1, 3, 7]])
  };
  const bytes = Buffer.from(JSON.stringify(m));
  const md5 = createHash('md5').update(bytes).digest('hex');
  const manifest = {id: 'manifest-file-0001', mimeType: 'application/json', size: bytes.length, md5Checksum: md5,
    parents: [properties.WS_RECEIPT_FOLDER_ID], properties: {worksheetReceipt: m.receiptId, worksheetRole: 'receipt'}};
  const remotes = new Map([['manifest-file-0001', manifest]]);
  const add = (description, role) => remotes.set(description.fileId, {id: description.fileId, mimeType: description.mimeType,
    size: description.size, md5Checksum: description.md5, parents: [properties.WS_ARTIFACT_FOLDER_ID],
    properties: {worksheetReceipt: m.receiptId, worksheetRole: role}});
  add(m.original, 'original');
  m.items.forEach(i => {if (i.pdf) add(i.pdf, 'sheet-' + i.sheetIndex);});
  const state = {releases: 0, updates: 0, failUpdate: false, busy: false, triggers: []};
  const pservice = {getProperties: () => copy(properties), getProperty: k => properties[k],
    setProperty: (k, v) => {properties[k] = v;}, deleteProperty: k => {delete properties[k];}};
  const book = {getSheetByName: name => sheets[name], insertSheet: name => (sheets[name] = new Sheet(name))};
  const c = vm.createContext({console: {log() {}}, PropertiesService: {getScriptProperties: () => pservice},
    LockService: {getScriptLock: () => ({tryLock: () => !state.busy, releaseLock: () => {state.releases++;}})},
    ScriptApp: {getProjectTriggers: () => state.triggers.map(name => ({getHandlerFunction: () => name})),
      newTrigger: name => ({timeBased: () => ({everyMinutes: minutes => {
        assert.equal(minutes, 1); return {create: () => {state.triggers.push(name);}};
      }})})},
    SpreadsheetApp: {openById: id => {
      assert.ok([properties.WS_LEDGER_ID, properties.WS_ROSTER_ID].includes(id)); return book;
    }, flush() {}},
    DriveApp: {getFileById: id => {assert.equal(id, manifest.id); return {getBlob: () => ({getBytes: () => [...bytes], getDataAsString: () => bytes.toString()})};}},
    Utilities: {DigestAlgorithm: {MD5: 'md5'}, computeDigest: (algo, data) => [...createHash(algo).update(Buffer.from(data)).digest()]},
    Drive: {Files: {get: id => copy(remotes.get(id)), list: () => ({files: manifest.properties.worksheetImport === 'registered' ? [] : [copy(manifest)]}),
      update: (body, id, media, options) => {
        assert.equal(id, manifest.id);
        assert.equal(media, null);
        assert.equal(options.supportsAllDrives, true);
        if (state.failUpdate) {state.failUpdate = false; throw new Error('lost property update');}
        state.updates++; manifest.properties = body.properties;
      }}}});
  vm.runInContext(coreSource + '\n' + importerSource, c);
  return {c, sheets, manifest, state, properties, remotes};
}

test('GAS import appends one receipt and candidate; roster stays read-only', () => {
  const h = harness(), result = h.c.importWorksheetReceipts();
  assert.equal(result.registered.length, 1);
  assert.equal(result.pendingErrors.length, 0);
  assert.equal(h.sheets.ws_receipts.rows.length, 2);
  assert.equal(h.sheets.ws_attempts.rows.length, 2);
  assert.equal(h.sheets.roster.writes, 0);
  assert.equal(h.manifest.properties.worksheetLedger, h.properties.WS_LEDGER_ID);
  assert.equal(h.manifest.properties.worksheetArchiveStatus, 'OK');
  assert.ok(h.sheets.roster.reads.filter(r => r.row === 2).every(r => r.width === 1 && r.col !== 2));
  const reads = h.sheets.roster.reads.length;
  assert.equal(h.c.importWorksheetReceipts().registered.length, 0);
  assert.equal(h.sheets.roster.reads.length, reads);
  assert.equal(h.state.releases, 2);
});

test('GAS recovers after candidate append but before receipt commit', () => {
  const h = harness(); h.sheets.ws_receipts.failWrite = true;
  const first = h.c.importWorksheetReceipts();
  assert.equal(first.pendingErrors.length, 1);
  assert.equal(h.sheets.ws_attempts.rows.length, 2);
  assert.equal(h.sheets.ws_receipts.rows.length, 1);
  assert.equal(h.c.worksheetCommittedAttempts_([], [{receiptId}]).length, 0);
  assert.equal(h.c.importWorksheetReceipts().registered.length, 1);
  assert.equal(h.sheets.ws_attempts.rows.length, 2);
  assert.equal(h.sheets.ws_receipts.rows.length, 2);
  assert.equal(h.manifest.properties.worksheetArchiveStatus, 'OK');
});

test('archive acknowledgement reflects roster REVIEW, not just readable marks', () => {
  const m = fixture(); m.items[0].studentIdentifier = '999';
  const h = harness(m);
  h.state.failUpdate = true;
  h.c.importWorksheetReceipts();
  assert.equal(h.manifest.properties.worksheetImport, undefined);
  h.c.importWorksheetReceipts();
  assert.equal(h.manifest.properties.worksheetArchiveStatus, 'REVIEW');
});

test('invalid committed status cannot be acknowledged', () => {
  const h = harness(); h.state.failUpdate = true;
  h.c.importWorksheetReceipts();
  h.sheets.ws_attempts.rows[1][core.ATTEMPT_HEADERS.indexOf('intakeStatus')] = 'UNKNOWN';
  assert.equal(h.c.importWorksheetReceipts().pendingErrors[0].code, 'INVALID_COMMITTED_STATUS');
  assert.equal(h.manifest.properties.worksheetImport, undefined);
});

test('lost Drive completion update does not duplicate GSS registration', () => {
  const h = harness(); h.state.failUpdate = true;
  assert.equal(h.c.importWorksheetReceipts().pendingErrors.length, 1);
  const next = h.c.importWorksheetReceipts();
  assert.equal(next.registered[0].duplicate, true);
  assert.equal(h.sheets.ws_attempts.rows.length, 2);
  assert.equal(h.sheets.ws_receipts.rows.length, 2);
});

test('a committed receipt with a missing candidate is not silently accepted on retry', () => {
  const h = harness(); h.state.failUpdate = true;
  h.c.importWorksheetReceipts();
  h.sheets.ws_attempts.rows.pop();
  const next = h.c.importWorksheetReceipts();
  assert.equal(next.pendingErrors[0].code, 'COMMITTED_RECEIPT_INCOMPLETE');
  assert.equal(h.manifest.properties.worksheetImport, undefined);
});

test('corrupt original with no readable sheets still has an ERROR receipt', () => {
  const m = fixture();
  m.readingStatus = 'ERROR'; m.pairingIntegrity = 'uncertain'; m.pageCount = 0; m.items = [];
  m.issues = ['input_or_split_error'];
  const h = harness(m);
  const result = h.c.importWorksheetReceipts();
  assert.equal(result.registered.length, 1);
  assert.equal(result.registered[0].count, 0);
  assert.equal(h.sheets.ws_receipts.rows.length, 2);
  assert.equal(h.sheets.ws_attempts.rows.length, 1);
});

test('missing or altered remote PDF cannot be registered', () => {
  for (const kind of ['checksum', 'parent', 'missing']) {
    const h = harness();
    const asset = h.remotes.get('split-file-00001');
    if (kind === 'checksum') asset.md5Checksum = 'c'.repeat(32);
    if (kind === 'parent') asset.parents = ['unexpected-folder'];
    if (kind === 'missing') h.remotes.delete('split-file-00001');
    assert.equal(h.c.importWorksheetReceipts().pendingErrors.length, 1);
    assert.equal(h.sheets.ws_attempts.rows.length, 1);
    assert.equal(h.sheets.ws_receipts.rows.length, 1);
  }
});

test('busy lock and invalid destinations make no writes', () => {
  const h = harness(); h.state.busy = true;
  assert.equal(h.c.importWorksheetReceipts().busy, true);
  assert.equal(h.sheets.ws_attempts.writes, 0);
  h.state.busy = false;
  h.properties.WS_LEDGER_ID = h.properties.WS_ROSTER_ID;
  assert.throws(() => h.c.setupWorksheetReceiptTables(), /USE_DEDICATED_DESTINATIONS/);
  assert.equal(h.sheets.roster.writes, 0);
});

test('only catalog grades participate; staff and unrelated grades stay untouched', () => {
  const h = harness();
  h.sheets.roster.rows.push(['staff', 'private name', 0, 9, 99], ['staff', 'private name', 4, 9, 99]);
  assert.equal(h.c.importWorksheetReceipts().pendingErrors.length, 0);
  assert.equal(h.manifest.properties.worksheetArchiveStatus, 'OK');
  assert.equal(h.sheets.roster.writes, 0);
});

test('trigger setup is idempotent and preserves unrelated triggers', () => {
  const h = harness(); h.state.triggers.push('otherFunction');
  h.c.installWorksheetReceiptTrigger();
  h.c.installWorksheetReceiptTrigger();
  assert.deepEqual(h.state.triggers, ['otherFunction', 'importWorksheetReceipts']);
  h.state.triggers.push('importWorksheetReceipts');
  assert.throws(() => h.c.installWorksheetReceiptTrigger(), /DUPLICATE_IMPORT_TRIGGERS/);
});

test('schema mismatch does not modify existing sheets or create others', () => {
  const h = harness();
  h.sheets.ws_attempts.rows[0][0] = 'unrelated-table';
  delete h.sheets.ws_catalog;
  assert.throws(() => h.c.setupWorksheetReceiptTables(), /TABLE_SCHEMA_MISMATCH/);
  assert.equal(h.sheets.ws_catalog, undefined);
  assert.equal(h.sheets.ws_attempts.writes, 0);
});
