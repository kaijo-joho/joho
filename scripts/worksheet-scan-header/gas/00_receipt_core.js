/* Pure validation/matching. No Google services and no grading or pupil UI. */
var WorksheetReceipt = (function () {
  'use strict';
  var RECEIPT_HEADERS = ['receiptId', 'originalSha256', 'stationId', 'receivedAt', 'importedAt',
    'readingStatus', 'pairingIntegrity', 'pageCount', 'originalFileId', 'manifestFileId',
    'manifestMd5', 'issueCodes', 'writingStatus'];
  var ATTEMPT_HEADERS = ['attemptId', 'receiptId', 'sourcePages', 'subject', 'year', 'worksheetId',
    'grade', 'studentIdentifier', 'studentKey', 'readingStatus', 'intakeStatus', 'confidence',
    'pdfFileId', 'flags', 'writingStatus'];
  var CATALOG_HEADERS = ['subject', 'year', 'worksheetId', 'grade', 'enabled'];
  function fail(code) { throw new Error(code); }
  function text(value, pattern) { return typeof value === 'string' && pattern.test(value); }
  function integer(value, low, high) { return Number.isInteger(value) && value >= low && value <= high; }
  function id(value) { return text(value, /^[A-Za-z0-9_-]{10,200}$/); }
  function status(value) { return ['OK', 'REVIEW', 'ERROR'].indexOf(value) >= 0; }
  function codes(value) {
    return Array.isArray(value) && value.length <= 1000 && value.every(function (v) {
      return text(v, /^[A-Za-z0-9_:.-]{1,160}$/);
    });
  }
  function artifact(value) {
    if (!value || !id(value.fileId) || !integer(value.size, 0, 524288000) ||
        !text(value.md5, /^[a-f0-9]{32}$/) || !text(value.sha256, /^[a-f0-9]{64}$/) ||
        ['application/pdf', 'image/png', 'image/jpeg'].indexOf(value.mimeType) < 0) fail('INVALID_ARTIFACT');
  }
  function worksheet(value) {
    return value && text(value.subject, /^[A-Za-z0-9_-]{1,20}$/) &&
      text(value.worksheetId, /^[A-Za-z0-9_-]{1,20}$/) && integer(value.year, 2000, 9999);
  }
  function validate(m) {
    if (!m || m.schemaVersion !== 'worksheet-cloud-receipt/1' ||
        !text(m.originalSha256, /^[a-f0-9]{64}$/) || m.receiptId !== 'ws-' + m.originalSha256 ||
        !text(m.stationId, /^[A-Za-z0-9_-]{1,64}$/) || !status(m.readingStatus) ||
        ['consistent', 'uncertain', 'unknown'].indexOf(m.pairingIntegrity) < 0 ||
        !integer(m.pageCount, 0, 200) || !Array.isArray(m.items) || m.items.length > 100 ||
        !codes(m.issues) || m.gradingEnabled !== false || m.requiresStudentConfirmation !== false ||
        !text(m.receivedAt, /^\d{4}-\d\d-\d\dT[0-9:.]+(?:Z|[+-]\d\d:\d\d)$/) || !Number.isFinite(Date.parse(m.receivedAt))) fail('INVALID_RECEIPT');
    artifact(m.original);
    if (m.original.sha256 !== m.originalSha256) fail('ORIGINAL_HASH_MISMATCH');
    if (!m.analysis || !text(m.analysis.configSha256, /^[a-f0-9]{64}$/) ||
        !text(m.analysis.coordinatesSha256, /^[a-f0-9]{64}$/)) fail('INVALID_ANALYSIS');
    var expectedPage = 1, fileIds = new Set([m.original.fileId]);
    m.items.forEach(function (item, index) {
      if (!item || item.sheetIndex !== index + 1 || item.attemptId !== m.receiptId + ':' + (index + 1) ||
          !status(item.readingStatus) || !Number.isFinite(item.confidence) || item.confidence < 0 || item.confidence > 1 ||
          typeof item.pairValid !== 'boolean' || typeof item.reversedPages !== 'boolean' || !codes(item.issues) ||
          !Array.isArray(item.sourcePages) || item.sourcePages.length < 1 || item.sourcePages.length > 2) fail('INVALID_ITEM');
      item.sourcePages.forEach(function (page) {
        if (page !== expectedPage++ || page > m.pageCount) fail('INVALID_PAGE_BOUNDARY');
      });
      if (item.worksheet !== null && !worksheet(item.worksheet)) fail('INVALID_WORKSHEET');
      if (item.studentIdentifier !== null && (!text(item.studentIdentifier, /^[1-9][0-9]{2}$/) || item.studentIdentifier.slice(1) === '00')) fail('INVALID_STUDENT_IDENTIFIER');
      if (item.pdf !== null) {
        artifact(item.pdf);
        if (item.pdf.mimeType !== 'application/pdf' || fileIds.has(item.pdf.fileId)) fail('INVALID_SPLIT_FILE');
        fileIds.add(item.pdf.fileId);
      }
      if (m.pairingIntegrity === 'consistent' && (item.sourcePages.length !== 2 || !item.pairValid || !item.pdf || !item.worksheet)) fail('INVALID_PAIRING_CLAIM');
      if (item.studentIdentifier !== null && (m.pairingIntegrity !== 'consistent' || !item.pairValid || item.readingStatus !== 'OK')) fail('UNSAFE_STUDENT_CLAIM');
    });
    if (m.pairingIntegrity === 'consistent' && (!m.items.length || m.pageCount !== m.items.length * 2)) fail('INCOMPLETE_RECEIPT');
    if (m.readingStatus === 'OK' && (m.pairingIntegrity !== 'consistent' || m.items.some(function (i) { return i.readingStatus !== 'OK'; }))) fail('INVALID_OK_CLAIM');
    return m;
  }
  function catalogKey(w) { return [w.subject, w.year, w.worksheetId].join('|'); }
  function validateCatalog(rows) {
    var map = new Map();
    rows.forEach(function (w) {
      if (!worksheet(w) || !integer(w.grade, 1, 12) || typeof w.enabled !== 'boolean') fail('INVALID_CATALOG');
      var key = catalogKey(w);
      if (map.has(key)) fail('AMBIGUOUS_CATALOG');
      map.set(key, w);
    });
    return map;
  }
  function validateRoster(rows, year) {
    if (!integer(year, 2000, 9999)) fail('INVALID_ROSTER_YEAR');
    var map = new Map(), studentKeys = new Set();
    rows.forEach(function (p) {
      if (!integer(p.grade, 1, 12) || !integer(p.classNumber, 1, 9) || !integer(p.number, 1, 99) ||
          !text(p.studentKey, /^[A-Za-z0-9_@.+-]{1,254}$/)) fail('INVALID_ROSTER');
      var key = [year, p.grade, p.classNumber, p.number].join('|');
      if (map.has(key) || studentKeys.has(p.studentKey)) fail('AMBIGUOUS_ROSTER');
      map.set(key, p);
      studentKeys.add(p.studentKey);
    });
    if (!rows.length) fail('EMPTY_ROSTER');
    return map;
  }
  function match(m, catalog, roster, rosterYear) {
    validate(m);
    var materials = validateCatalog(catalog), pupils = validateRoster(roster, rosterYear);
    return m.items.map(function (item) {
      var flags = [], w = item.worksheet, material = w && materials.get(catalogKey(w));
      if (m.pairingIntegrity !== 'consistent' || !item.pairValid) flags.push('pairing_uncertain');
      if (item.readingStatus !== 'OK' || !item.studentIdentifier) flags.push('reading_unresolved');
      if (!material) flags.push('worksheet_not_registered');
      else if (!material.enabled) flags.push('worksheet_disabled');
      if (w && w.year !== rosterYear) flags.push('roster_year_mismatch');
      var person = null;
      if (material && item.studentIdentifier && w.year === rosterYear) {
        person = pupils.get([w.year, material.grade, Number(item.studentIdentifier[0]), Number(item.studentIdentifier.slice(1))].join('|'));
        if (!person) flags.push('roster_not_found');
      }
      return {attemptId: item.attemptId, receiptId: m.receiptId, sourcePages: JSON.stringify(item.sourcePages),
        subject: w ? w.subject : '', year: w ? w.year : '', worksheetId: w ? w.worksheetId : '',
        grade: material ? material.grade : '', studentIdentifier: item.studentIdentifier || '',
        studentKey: !flags.length && person ? person.studentKey : '', readingStatus: item.readingStatus,
        intakeStatus: item.readingStatus === 'ERROR' ? 'ERROR' : flags.length ? 'REVIEW' : 'OK',
        confidence: item.confidence, pdfFileId: item.pdf ? item.pdf.fileId : '',
        flags: JSON.stringify(flags), writingStatus: 'NOT_STARTED'};
    });
  }
  function verifyRemote(remote, expected, folderId, receiptId, role) {
    if (!remote || remote.id !== expected.fileId || remote.trashed || remote.mimeType !== expected.mimeType ||
        String(remote.size) !== String(expected.size) || remote.md5Checksum !== expected.md5 ||
        !remote.parents || remote.parents.length !== 1 || remote.parents[0] !== folderId ||
        !remote.properties || remote.properties.worksheetReceipt !== receiptId || remote.properties.worksheetRole !== role) fail('REMOTE_ARTIFACT_MISMATCH');
  }
  function groups(attempts) {
    var found = new Map();
    attempts.filter(function (a) { return a.intakeStatus === 'OK' && a.studentKey; }).forEach(function (a) {
      var key = [a.subject, a.year, a.worksheetId, a.grade, a.studentKey].join('|');
      if (!found.has(key)) found.set(key, {groupKey: key, attemptIds: []});
      found.get(key).attemptIds.push(a.attemptId);
    });
    return Array.from(found.values()).map(function (g) {
      g.selectedAttemptId = g.attemptIds.length === 1 ? g.attemptIds[0] : null;
      g.flags = g.attemptIds.length > 1 ? ['duplicate_submission'] : [];
      return g;
    });
  }
  return {RECEIPT_HEADERS: RECEIPT_HEADERS, ATTEMPT_HEADERS: ATTEMPT_HEADERS,
    CATALOG_HEADERS: CATALOG_HEADERS, validate: validate, match: match,
    verifyRemote: verifyRemote, groups: groups};
})();
