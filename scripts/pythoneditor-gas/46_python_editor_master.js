// 問題の編集正本は従来の配付ファイル一覧にある一枚。採用版は私有保存GSSへ固定する。
var PythonEditorMaster = (function () {
  var LEGACY_HEADERS = ['questionId','setId','order','version','title','prompt','templateCode','setupCode','answerCode','explanation',
    'gradingVersion','scoringIds','status','sourceFileId','sourceCellIds','sourceHash','runtimeConfig','note'];
  var MASTER_HEADERS = LEGACY_HEADERS.concat(['kind','codeRefs','checkType','checkConfig']);
  function masterError(message, row, index) {
    var error = new Error('Python問題マスター' + (index ? ' ' + index + '行目' : '') +
      (row && row[0] ? ' [' + row[0] + '@' + row[3] + ']' : '') + ': ' + message);
    error.pythonEditorCode = 'snapshot_invalid'; throw error;
  }
  function headerWidth(header) {
    var expected = header && header.length === LEGACY_HEADERS.length ? LEGACY_HEADERS : MASTER_HEADERS;
    if (!header || header.length !== expected.length || !expected.every(function (value, i) { return header[i] === value; }))
      masterError('列は従来のA:R、または末尾に kind / codeRefs / checkType / checkConfig を加えたA:Vにしてください。');
    return expected.length;
  }
  function masterValues(sheet, maxRows) {
    if (!sheet || sheet.getLastRow() < 1 || sheet.getLastRow() > maxRows || [18, 22].indexOf(sheet.getLastColumn()) < 0)
      masterError('列数は18列または22列、行数は1〜' + maxRows + 'にしてください。');
    var rows = bounded(sheet, sheet.getLastColumn(), maxRows); headerWidth(rows[0]); return rows;
  }
  function rowKind(row, runtime, index) {
    var value = row.length === MASTER_HEADERS.length ? row[18] : '';
    var explicit = typeof value === 'string' ? value.trim() : value === null || value === undefined ? '' : null;
    if (['', 'code', 'confirmation'].indexOf(explicit) < 0) masterError('kind は空欄・code・confirmation のいずれかにしてください。', row, index);
    if (explicit !== 'confirmation') {
      if (row.slice(19, 22).some(function (value) { return value !== '' && value !== null && value !== undefined; }))
        masterError('codeRefs / checkType / checkConfig は kind=confirmation の行だけに設定してください。', row, index);
      return runtime.hasOriginalInputCell === false ? 'observation' : 'code';
    }
    return 'confirmation';
  }
  function bounded(sheet, columns, maxRows) {
    PythonEditor.assert(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= maxRows && sheet.getLastColumn() === columns, 'snapshot_invalid');
    var range = sheet.getRange(1, 1, sheet.getLastRow(), columns);
    PythonEditor.assert(range.getFormulas().every(function (r) { return r.every(function (v) { return !v; }); }), 'snapshot_invalid');
    return range.getValues();
  }
  function build(rows, rubricRows, spec) {
    PythonEditor.assert(spec && PythonEditor.id(spec.setId) && PythonEditor.id(spec.version) && /^採点設定py(?:_[A-Za-z0-9_-]+)?$/.test(spec.gradingSheet), 'invalid_input');
    PythonEditor.assert(rows.length > 1, 'snapshot_invalid');
    var width = headerWidth(rows[0]);
    var rules = PythonEditorGraderV1.parseRules(rubricRows), seen = {}, records = [];
    var selected = rows.slice(1).filter(function (r) { return r[1] === spec.setId && r[3] === spec.version; });
    PythonEditor.assert(selected.length > 0 && selected.length <= 300, 'snapshot_invalid');
    selected.sort(function (a, b) { return Number(a[2]) - Number(b[2]); }).forEach(function (r) {
      PythonEditor.assert(r.length === width && PythonEditor.id(r[0]) && !seen[r[0]] && Number.isInteger(Number(r[2])) &&
        ['編集中','採用済み','旧版'].indexOf(r[12]) >= 0, 'snapshot_invalid'); seen[r[0]] = true;
      var runtime;
      try { runtime = JSON.parse(r[16] || '{}'); } catch (e) { PythonEditor.fail('snapshot_invalid'); }
      var index = rows.indexOf(r) + 1, kind = rowKind(r, runtime, index), confirmation = null;
      if (kind === 'confirmation') {
        try {
          var checkType = String(r[20] || '').trim(), checkConfig = PythonEditorConfirmation.normalizeCheck(checkType, r[21]);
          confirmation = { codeRefs: PythonEditorConfirmation.parseCodeRefs(r[19]), checkType: checkType, checkConfig: checkConfig };
          PythonEditorConfirmation.validateConfirmationQuestion({ kind: kind, codeRefs: confirmation.codeRefs, checkType: checkType,
            checkConfig: PythonEditorConfirmation.publicCheck(checkType, checkConfig) });
        } catch (error) { masterError(error.message || '確認条件を確認してください。', r, index); }
        if (String(r[6] || '') || String(r[7] || '') || String(r[10] || '') || String(r[11] || '') ||
            runtime.useExistingQuestionCode || runtime.scoringRanges && runtime.scoringRanges.length)
          masterError('確認問題のコード・準備コード・採点版・採点ID・採点範囲は空欄にし、コードは codeRefs で参照してください。', r, index);
      }
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
        setupCode: PythonEditor.text(String(r[7] || ''), 200000), kind: kind };
      if (confirmation) {
        q.codeRefs = confirmation.codeRefs; q.checkType = confirmation.checkType;
        q.checkConfig = PythonEditorConfirmation.publicCheck(confirmation.checkType, confirmation.checkConfig);
      }
      if (runtime.useExistingQuestionCode) { PythonEditor.assert(PythonEditor.id(runtime.useExistingQuestionCode), 'snapshot_invalid'); q.useExistingQuestionCode = runtime.useExistingQuestionCode; }
      if (ranges.length) PythonEditor.extract(q.templateCode, ranges);
      var chosen = {};
      scoringIds.forEach(function (id) { chosen[id] = rules[id]; });
      var body = { schema: 1, question: q, gradingVersion: grading, engineVersion: PythonEditorGraderV1.engineVersion,
        ranges: ranges, rules: chosen, graded: scoringIds.length > 0 && q.kind !== 'observation' && q.kind !== 'confirmation', sourceHash: String(r[15] || '') };
      if (confirmation) body.confirmation = confirmation;
      if (Object.prototype.hasOwnProperty.call(runtime, 'confirmationGrading')) {
        if (!confirmation) masterError('confirmationGrading は kind=confirmation だけに指定してください。', r, index);
        try { body.confirmationGrading = PythonEditorConfirmationGraderV1.normalize(confirmation.checkType, confirmation.checkConfig, runtime.confirmationGrading); }
        catch (error) { masterError('確認問題の正式採点定義を確認してください。配点・条件・必要なprivate正答を明示してください。', r, index); }
        body.engineVersion = PythonEditorConfirmationGraderV1.engineVersion; body.graded = true;
      }
      records.push({ body: body, sourceStatus: r[12], payloadHash: PythonEditor.hashText(PythonEditor.canonical(body)) });
    });
    records.forEach(function (r) {
      var q = r.body.question;
      if (q.useExistingQuestionCode) PythonEditor.assert(records.some(function (p) { return p.body.question.questionId === q.useExistingQuestionCode; }), 'snapshot_invalid');
    });
    if (records.some(function (record) { return record.body.question.kind === 'confirmation'; })) {
      var questions = records.map(function (record) { return record.body.question; }), references = [];
      records.forEach(function (record) {
        var q = record.body.question;
        if (q.kind !== 'confirmation') return;
        q.codeRefs.forEach(function (ref) {
          var matches = rows.slice(1).filter(function (row) { return row[0] === ref.questionId && row[3] === ref.version; });
          if (matches.length !== 1 || matches[0].length !== width) masterError('参照先 ' + ref.questionId + '@' + ref.version + ' が一意に見つかりません。', [q.questionId, q.setId, '', q.version]);
          var source = matches[0], sourceRuntime;
          try { sourceRuntime = JSON.parse(source[16] || '{}'); } catch (error) { masterError('参照先の runtimeConfig が不正です。', source); }
          var sourceKind = rowKind(source, sourceRuntime, rows.indexOf(source) + 1);
          if (sourceKind !== 'code' || source[1] !== q.setId || source[0] === q.questionId && source[3] === q.version)
            masterError('codeRefs の参照先 ' + ref.questionId + '@' + ref.version + ' は同じ問題セットのコード問題にしてください。', [q.questionId, q.setId, '', q.version]);
          if (questions.some(function (other) { return other.questionId === ref.questionId && other.version === ref.version; })) return;
          references.push({ questionId: source[0], setId: source[1], version: source[3], kind: sourceKind });
        });
      });
      try { PythonEditorConfirmation.validateReferenceGraph(questions.concat(references.filter(function (ref, i) {
        return references.findIndex(function (other) { return other.questionId === ref.questionId && other.version === ref.version; }) === i;
      }))); }
      catch (error) { masterError(error.message || 'コード参照を確認してください。'); }
    }
    return { records: records, digest: PythonEditor.hashText(PythonEditor.canonical(records)), canAdopt: records.every(function (r) { return ['採用済み','旧版'].indexOf(r.sourceStatus) >= 0; }) };
  }
  function read(spec) {
    var book = SpreadsheetApp.openById(Common.SSID.fileList);
    return build(masterValues(book.getSheetByName('Python問題マスター'), 5001), bounded(book.getSheetByName(spec.gradingSheet), 15, 10001), spec);
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
    var store = PythonEditorStore.create(c);
    // 確認問題だけを先に採用して、参照元が未固定のまま正式提出を開かない。
    records.filter(function (record) { return record.body.graded && record.body.question.kind === 'confirmation'; }).forEach(function (record) {
      record.body.confirmation.codeRefs.forEach(function (ref) {
        var source = records.find(function (candidate) { return PythonEditor.key(candidate) === PythonEditor.key(ref); }) || store.findSnapshot(ref);
        PythonEditor.assert(source && source.body && source.payloadHash === PythonEditor.hashText(PythonEditor.canonical(source.body)) &&
          PythonEditor.key(source.body.question) === PythonEditor.key(ref) && source.body.question.kind === 'code' && source.body.question.setId === record.body.question.setId, 'snapshot_missing');
      });
    });
    var saved = store.putSnapshots(records, function () {
      PythonEditorConfig.identity(true);
      PythonEditor.assert(PythonEditorConfig.config().hash === c.hash && read(spec).digest === expectedDigest, 'config_changed');
    });
    return { setId: spec.setId, version: spec.version, questions: saved.length, digest: built.digest };
  }
  function publicQuestion(r) {
    var q = r.body.question;
    if (q.kind === 'confirmation') {
      var confirmation = PythonEditorConfirmation.validateConfirmationQuestion(q);
      if (r.body.graded === true) PythonEditorConfirmationGraderV1.starTotal(r.body);
      else PythonEditor.assert(r.body.graded === false && !Object.prototype.hasOwnProperty.call(r.body, 'confirmationGrading'), 'snapshot_invalid');
      return { questionId: q.questionId, setId: q.setId, version: q.version, title: q.title, prompt: q.prompt,
        templateCode: '', setupCode: '', kind: q.kind, codeRefs: confirmation.codeRefs,
        checkType: confirmation.checkType, checkConfig: confirmation.checkConfig };
    }
    return { questionId: q.questionId, setId: q.setId, version: q.version, title: q.title, prompt: q.prompt,
      templateCode: q.templateCode, setupCode: q.setupCode, kind: q.kind,
      ...(q.useExistingQuestionCode ? { useExistingQuestionCode: q.useExistingQuestionCode } : {}) };
  }
  return { headers: MASTER_HEADERS, legacyHeaders: LEGACY_HEADERS, headerWidth: headerWidth, masterValues: masterValues,
    build: build, read: read, preview: preview, adopt: adopt, publicQuestion: publicQuestion };
})();
