// 問題の編集正本は従来の配付ファイル一覧にある一枚。採用版は私有保存GSSへ固定する。
var PythonEditorMaster = (function () {
  var MASTER_HEADERS = ['questionId','setId','order','version','title','prompt','templateCode','setupCode','answerCode','explanation',
    'gradingVersion','scoringIds','status','sourceFileId','sourceCellIds','sourceHash','runtimeConfig','note'];
  function bounded(sheet, columns, maxRows, ignoredFormulaColumn) {
    PythonEditor.assert(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= maxRows && sheet.getLastColumn() === columns, 'snapshot_invalid');
    var range = sheet.getRange(1, 1, sheet.getLastRow(), columns);
    // 既存採点表のN列URLは配付用の数式。判定に使う列と見出しは数式を許可しない。
    PythonEditor.assert(range.getFormulas().every(function (r, row) { return r.every(function (v, column) { return !v || row > 0 && column === ignoredFormulaColumn; }); }), 'snapshot_invalid');
    return range.getValues();
  }
  function build(rows, rubricRows, spec) {
    PythonEditor.assert(spec && PythonEditor.id(spec.setId) && PythonEditor.id(spec.version) && /^採点設定py(?:_[A-Za-z0-9_-]+)?$/.test(spec.gradingSheet), 'invalid_input');
    PythonEditor.assert(rows.length > 1 && MASTER_HEADERS.every(function (v, i) { return rows[0][i] === v; }), 'snapshot_invalid');
    var rules = PythonEditorGraderV1.parseRules(rubricRows), seen = {}, records = [];
    var selected = rows.slice(1).filter(function (r) { return r[1] === spec.setId && r[3] === spec.version; });
    PythonEditor.assert(selected.length > 0 && selected.length <= 300, 'snapshot_invalid');
    selected.sort(function (a, b) { return Number(a[2]) - Number(b[2]); }).forEach(function (r) {
      PythonEditor.assert(r.length === MASTER_HEADERS.length && PythonEditor.id(r[0]) && !seen[r[0]] && Number.isInteger(Number(r[2])) &&
        ['編集中','採用済み','旧版'].indexOf(r[12]) >= 0, 'snapshot_invalid'); seen[r[0]] = true;
      var runtime;
      try { runtime = JSON.parse(r[16] || '{}'); } catch (e) { PythonEditor.fail('snapshot_invalid'); }
      var ranges = (runtime.scoringRanges || []).map(function (p) {
        PythonEditor.assert(p && PythonEditor.id(p.regionId) && PythonEditor.id(p.scoringId) &&
          (p.startMarker === null || typeof p.startMarker === 'string' && p.startMarker.length > 0 && p.startMarker.length <= 300) &&
          (p.endMarker === null || typeof p.endMarker === 'string' && p.endMarker.length > 0 && p.endMarker.length <= 300), 'snapshot_invalid');
        return { regionId: p.regionId, scoringId: p.scoringId, startMarker: p.startMarker, endMarker: p.endMarker };
      });
      var grading = String(r[10] || ''), scoringIds = String(r[11] || '').split(',').map(function (v) { return v.trim(); }).filter(Boolean);
      PythonEditor.assert(scoringIds.every(function (s, i) { return PythonEditor.id(s) && scoringIds.indexOf(s) === i; }), 'snapshot_invalid');
      PythonEditor.assert(scoringIds.length === 0 || grading && scoringIds.length === ranges.length && scoringIds.every(function (s) { return ranges.some(function (p) { return p.scoringId === s; }) && Object.prototype.hasOwnProperty.call(rules, s); }), 'snapshot_invalid');
      var q = { questionId: r[0], setId: r[1], version: r[3], order: Number(r[2]), title: PythonEditor.text(String(r[4] || ''), 300),
        prompt: PythonEditor.text(String(r[5] || ''), 200000), templateCode: PythonEditor.text(String(r[6] || ''), 200000),
        setupCode: PythonEditor.text(String(r[7] || ''), 200000), kind: runtime.hasOriginalInputCell === false ? 'observation' : 'code' };
      if (runtime.useExistingQuestionCode) { PythonEditor.assert(PythonEditor.id(runtime.useExistingQuestionCode), 'snapshot_invalid'); q.useExistingQuestionCode = runtime.useExistingQuestionCode; }
      if (ranges.length) PythonEditor.extract(q.templateCode, ranges);
      var chosen = {};
      scoringIds.forEach(function (id) { chosen[id] = rules[id]; });
      var body = { schema: 1, question: q, gradingVersion: grading, engineVersion: PythonEditorGraderV1.engineVersion,
        ranges: ranges, rules: chosen, graded: scoringIds.length > 0 && q.kind !== 'observation', sourceHash: String(r[15] || '') };
      records.push({ body: body, sourceStatus: r[12], payloadHash: PythonEditor.hashText(PythonEditor.canonical(body)) });
    });
    records.forEach(function (r) {
      var q = r.body.question;
      if (q.useExistingQuestionCode) PythonEditor.assert(records.some(function (p) { return p.body.question.questionId === q.useExistingQuestionCode; }), 'snapshot_invalid');
    });
    return { records: records, digest: PythonEditor.hashText(PythonEditor.canonical(records)), canAdopt: records.every(function (r) { return ['採用済み','旧版'].indexOf(r.sourceStatus) >= 0; }) };
  }
  function read(spec, options) {
    var book = SpreadsheetApp.openById(options && options.fileListId || Common.SSID.fileList);
    return build(bounded(book.getSheetByName('Python問題マスター'), 18, 5001), bounded(book.getSheetByName(spec.gradingSheet), 15, 10001, 13), spec);
  }
  function preview(spec) {
    PythonEditorConfig.identity(true);
    var built = read(spec);
    return { setId: spec.setId, version: spec.version, digest: built.digest, canAdopt: built.canAdopt,
      questions: built.records.map(function (r) { return { questionId: r.body.question.questionId, sourceStatus: r.sourceStatus, graded: r.body.graded, ranges: r.body.ranges.length }; }) };
  }
  function adopt(spec, expectedDigest) {
    var actor = PythonEditorConfig.identity(true), c = PythonEditorConfig.config(), built = read(spec);
    PythonEditor.assert(built.digest === expectedDigest && PythonEditor.HASH.test(expectedDigest), 'config_changed');
    PythonEditor.assert(built.canAdopt, 'adoption_required');
    var at = new Date().toISOString();
    var records = built.records.map(function (r) {
      var q = r.body.question;
      return { recordKey: PythonEditor.key(q), groupKey: q.version + '/' + q.setId, actorKey: '', questionId: q.questionId,
        version: q.version, requestId: '', seq: 0, at: at, payloadHash: r.payloadHash, adoptedBy: actor.key, body: r.body };
    });
    var saved = PythonEditorStore.create(c).putSnapshots(records, function () {
      PythonEditorConfig.identity(true);
      PythonEditor.assert(PythonEditorConfig.config().hash === c.hash && read(spec).digest === expectedDigest, 'config_changed');
    });
    return { setId: spec.setId, version: spec.version, questions: saved.length, digest: built.digest };
  }
  function publicQuestion(r) {
    var q = r.body.question;
    return { questionId: q.questionId, setId: q.setId, version: q.version, title: q.title, prompt: q.prompt,
      templateCode: q.templateCode, setupCode: q.setupCode, kind: q.kind,
      ...(q.useExistingQuestionCode ? { useExistingQuestionCode: q.useExistingQuestionCode } : {}) };
  }
  return { headers: MASTER_HEADERS, build: build, read: read, preview: preview, adopt: adopt, publicQuestion: publicQuestion };
})();
