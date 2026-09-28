/* Grade comes from teaching plans, never from a fallback number in ws_catalog. */
var WorksheetGradeSource = (function () {
  'use strict';
  function token(value) { return typeof value === 'string' && /^[A-Za-z0-9_-]{1,20}$/.test(value); }
  function config(rows) {
    var keys = new Set();
    if (!Array.isArray(rows) || !rows.length || rows.length > 30) throw new Error('INVALID_GRADE_SOURCES');
    rows.forEach(function (s) {
      if (!s || !token(s.subject) || !Number.isInteger(s.year) || s.year < 2000 || s.year > 9999 ||
          !['distributionId', 'scheduleId'].every(function (k) { return /^[A-Za-z0-9_-]{10,200}$/.test(s[k] || ''); }) ||
          !s.lectureAliases || typeof s.lectureAliases !== 'object' || Array.isArray(s.lectureAliases) ||
          Object.keys(s).sort().join(',') !== 'distributionId,lectureAliases,scheduleId,subject,year') throw new Error('INVALID_GRADE_SOURCES');
      var key = s.subject + '|' + s.year;
      if (keys.has(key)) throw new Error('DUPLICATE_GRADE_SOURCE');
      keys.add(key);
      Object.keys(s.lectureAliases).forEach(function (id) {
        var aliases = s.lectureAliases[id];
        if (!token(id) || !Array.isArray(aliases) || !aliases.length || !aliases.every(token)) throw new Error('INVALID_LECTURE_ALIAS');
      });
    });
    return rows;
  }
  function unresolved(material, issue) {
    return Object.assign({}, material, {grade: null, gradeIssue: issue, gradeEvidence: []});
  }
  function resolve(material, source, pages, plans) {
    if (!source) return unresolved(material, 'worksheet_grade_source_missing');
    if (source.subject !== material.subject || source.year !== material.year) throw new Error('GRADE_SOURCE_MISMATCH');
    var pageIds = pages.filter(function (p) { return p.worksheetApp === material.worksheetId; }).map(function (p) { return p.id; });
    if (!pageIds.length || !pageIds.every(token)) return unresolved(material, 'worksheet_page_unresolved');
    var keys = new Set(pageIds.concat(source.lectureAliases[material.worksheetId] || []));
    var evidence = [], invalid = false;
    plans.forEach(function (p) {
      var matches = String(p.lectureKeys || '').split(/[,，\s]+/).filter(function (k) { return keys.has(k); });
      if (!matches.length || p.status !== 'active') return;
      if (!Number.isInteger(Number(p.year)) || Number(p.year) < 2000 || Number(p.year) > 9999) { invalid = true; return; }
      if (Number(p.year) !== material.year) return;
      var grade = Number(p.grade);
      if (!Number.isInteger(grade) || grade < 1 || grade > 12 || !p.lessonPlanKey) { invalid = true; return; }
      evidence.push({lessonPlanKey: p.lessonPlanKey, lectureKeys: matches, grade: grade});
    });
    if (invalid) return unresolved(material, 'worksheet_grade_source_invalid');
    var grades = Array.from(new Set(evidence.map(function (p) { return p.grade; })));
    if (grades.length !== 1) return unresolved(material, grades.length ? 'worksheet_grade_ambiguous' : 'worksheet_grade_not_found');
    return Object.assign({}, material, {grade: grades[0], gradeIssue: '', gradeEvidence: evidence});
  }
  return {config: config, resolve: resolve, unresolved: unresolved};
})();

function worksheetGradeSourceRows_(book, name, headers, firstRow, maxRows) {
  var sheet = book.getSheetByName(name);
  if (!sheet || sheet.getLastRow() > maxRows || sheet.getLastColumn() > 100 || !sheet.getLastColumn()) throw new Error('INVALID_GRADE_SOURCE_TABLE');
  var names = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  var count = Math.max(0, sheet.getLastRow() - firstRow + 1), rows = [];
  for (var i = 0; i < count; i++) rows.push({});
  headers.forEach(function (key) {
    var col = names.indexOf(key);
    if (col < 0 || col !== names.lastIndexOf(key)) throw new Error('INVALID_GRADE_SOURCE_HEADER');
    if (count) sheet.getRange(firstRow, col + 1, count, 1).getValues().forEach(function (v, index) {
      rows[index][key] = typeof v[0] === 'string' ? v[0].trim() : v[0];
    });
  });
  return rows;
}

function worksheetGradeCatalog_(p, ss, writeCache) {
  var table = worksheetTable_(ss, 'ws_catalog', WorksheetReceipt.CATALOG_HEADERS, false);
  var catalog = worksheetRows_(table, WorksheetReceipt.CATALOG_HEADERS), snapshots = new Map();
  if (!catalog.length) throw new Error('EMPTY_CATALOG');
  var resolved = catalog.map(function (material) {
    var source = p.gradeSources.find(function (s) { return s.subject === material.subject && s.year === Number(material.year); });
    if (!source) return WorksheetGradeSource.unresolved(material, 'worksheet_grade_source_missing');
    var key = source.subject + '|' + source.year;
    if (!snapshots.has(key)) {
      try {
        var pages = worksheetGradeSourceRows_(SpreadsheetApp.openById(source.distributionId), 'ページ一覧', ['id', 'worksheetApp'], 2, 3000);
        var plans = worksheetGradeSourceRows_(SpreadsheetApp.openById(source.scheduleId), '授業進度',
          ['lessonPlanKey', 'year', 'grade', 'lectureKeys', 'status'], 3, 3000);
        snapshots.set(key, {pages: pages, plans: plans});
      } catch (error) {
        // No cached grade on access errors. Source errors contain no student data.
        snapshots.set(key, null);
      }
    }
    var snapshot = snapshots.get(key);
    return snapshot ? WorksheetGradeSource.resolve(material, source, snapshot.pages, snapshot.plans) :
      WorksheetGradeSource.unresolved(material, 'worksheet_grade_source_unavailable');
  });
  WorksheetReceipt.validateCatalog(resolved);
  // This column is a display cache, never an input to resolution. Other columns,
  // source books, committed attempts, and receipt rows are not changed here.
  if (writeCache) resolved.forEach(function (m, i) {
    var value = m.grade === null ? '' : m.grade;
    if (catalog[i].grade !== value) table.getRange(i + 2, 4, 1, 1).setValues([[value]]);
  });
  return resolved;
}

function previewWorksheetGrades() {
  var p = worksheetImportConfig_();
  var result = worksheetGradeCatalog_(p, SpreadsheetApp.openById(p.WS_LEDGER_ID), false);
  console.log(JSON.stringify(result));
  return result;
}

function refreshWorksheetGrades() {
  var p = worksheetImportConfig_(), lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('IMPORT_BUSY');
  try {
    var result = worksheetGradeCatalog_(p, SpreadsheetApp.openById(p.WS_LEDGER_ID), true);
    console.log(JSON.stringify(result));
    return result;
  } finally { lock.releaseLock(); }
}
