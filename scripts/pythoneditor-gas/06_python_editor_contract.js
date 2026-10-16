// 新版専用。旧Colab/HTML/SSの関数・定数・ログへ書き込まない。
var PythonEditor = (function () {
  var LIMITS = { code: 200000, input: 200000, output: 100000, payload: 960000, chunk: 40000, parts: 24 };
  var ID = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
  var REQUEST = /^[a-f0-9]{32}$/;
  var HASH = /^[a-f0-9]{64}$/;
  function fail(code) { var e = new Error(code); e.pythonEditorCode = code; throw e; }
  function assert(ok, code) { if (!ok) fail(code); }
  function id(value) { return typeof value === 'string' && ID.test(value); }
  function assignmentId(value) { return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,119}$/.test(value); }
  function iso(value) { return typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value; }
  function text(value, max) { assert(typeof value === 'string' && value.length <= max, 'invalid_input'); return value; }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
  }
  function hashText(value) {
    return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(value), Utilities.Charset.UTF_8)
      .map(function (v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function uuid() { return Utilities.getUuid().replace(/-/g, '').toLowerCase(); }
  function intakeSignature(payload, secret) {
    assert(HASH.test(secret), 'storage_not_ready');
    return Utilities.computeHmacSha256Signature(canonical(payload), secret, Utilities.Charset.UTF_8)
      .map(function (v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); }).join('');
  }
  function intakeIssue(payload, secret) { return { payload: payload, signature: intakeSignature(payload, secret) }; }
  function intakeVerify(ticket, secret) {
    assert(ticket && ticket.payload && canonical(ticket).length < 8000 && HASH.test(ticket.signature), 'invalid_input');
    var expected = intakeSignature(ticket.payload, secret), different = 0;
    for (var i = 0; i < expected.length; i++) different |= expected.charCodeAt(i) ^ ticket.signature.charCodeAt(i);
    assert(different === 0 && iso(ticket.payload.receivedAt), 'invalid_input'); return ticket.payload;
  }
  function scope(input) {
    assert(input && id(input.questionId) && id(input.version), 'invalid_input');
    return { questionId: input.questionId, version: input.version };
  }
  function key(q) { return q.version + '/' + q.questionId; }
  function request(input) { assert(input && REQUEST.test(input.requestId), 'invalid_input'); return input.requestId; }
  function draft(input) {
    var q = scope(input);
    request(input);
    assert(input.expectedRevision === null || REQUEST.test(input.expectedRevision), 'invalid_input');
    return { questionId: q.questionId, version: q.version, requestId: input.requestId, expectedRevision: input.expectedRevision,
      code: text(input.code, LIMITS.code), stdin: text(input.stdin, LIMITS.input) };
  }
  function submission(input, hash) {
    if (input && Object.prototype.hasOwnProperty.call(input, 'kind')) assert(input.kind === 'confirmation-v1', 'invalid_input');
    if (input && input.kind === 'confirmation-v1') return confirmationSubmission(input, hash);
    var q = scope(input);
    request(input);
    assert(assignmentId(input.assignmentId), 'invalid_input');
    var r = input.run;
    assert(r && HASH.test(r.codeHash) && ['success', 'error', 'stopped', 'not_run'].indexOf(r.outcome) >= 0 && typeof r.truncated === 'boolean', 'invalid_input');
    var value = { questionId: q.questionId, version: q.version, assignmentId: input.assignmentId, requestId: input.requestId,
      code: text(input.code, LIMITS.code), stdin: text(input.stdin, LIMITS.input), run: {
        codeHash: r.codeHash, outcome: r.outcome, truncated: r.truncated,
        outputText: text(r.outputText, LIMITS.output), stdout: text(r.stdout, LIMITS.output),
        inputEcho: text(r.inputEcho, LIMITS.output), stderr: text(r.stderr, LIMITS.output), errorText: text(r.errorText, LIMITS.output)
      } };
    // hashは版の結合/古い出力の検出用。クライアント実行の真正性を証明するものではない。
    assert(r.codeHash === hash(value.code), 'stale_output');
    assert(canonical(value).length <= LIMITS.payload, 'payload_too_large');
    return value;
  }
  function exact(value, fields) {
    assert(value && Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value).every(function (name) { return fields.indexOf(name) >= 0; }), 'invalid_input');
  }
  function confirmationSubmission(input, hash) {
    exact(input, ['kind','questionId','version','assignmentId','requestId','sources','journal','intakeTicket']);
    var q = scope(input); request(input);
    assert(input.kind === 'confirmation-v1' && assignmentId(input.assignmentId) && Array.isArray(input.sources) && input.sources.length >= 1 && input.sources.length <= 8, 'invalid_input');
    var sourceKeys = Object.create(null), sources = input.sources.map(function (source) {
      exact(source, ['questionId','version','code']); var ref = scope(source), key = PythonEditor.key(ref);
      assert(!sourceKeys[key], 'invalid_input'); sourceKeys[key] = true;
      return { questionId: ref.questionId, version: ref.version, code: text(source.code, LIMITS.code) };
    });
    exact(input.journal, ['schema','trials','responses']);
    assert(input.journal.schema === 1 && Array.isArray(input.journal.trials) && input.journal.trials.length <= 1000, 'invalid_input');
    var trialIds = Object.create(null), trials = input.journal.trials.map(function (trial) {
      var normalized;
      try { normalized = PythonEditorConfirmation.normalizeTrial(trial); } catch (_) { fail('invalid_input'); }
      assert(sourceKeys[key(normalized.source)] && !trialIds[normalized.id], 'invalid_input'); trialIds[normalized.id] = true;
      // 実行の証明ではなく、送信された本文とhashの整合性だけを検査する。
      assert(normalized.codeHash === hash(normalized.code), 'stale_output'); return normalized;
    });
    var responseKey = key(q), responses = {};
    exact(input.journal.responses, [responseKey]);
    if (Object.prototype.hasOwnProperty.call(input.journal.responses, responseKey)) {
      var raw = input.journal.responses[responseKey], response = {}; exact(raw, ['answer','selections']);
      if (Object.prototype.hasOwnProperty.call(raw, 'answer')) {
        assert(typeof raw.answer === 'string' && raw.answer.length <= 20000 || typeof raw.answer === 'number' && Number.isFinite(raw.answer), 'invalid_input');
        response.answer = raw.answer;
      }
      if (Object.prototype.hasOwnProperty.call(raw, 'selections')) {
        exact(raw.selections, Object.keys(raw.selections || {})); var names = Object.keys(raw.selections);
        assert(names.length <= 100, 'invalid_input'); response.selections = {};
        names.forEach(function (name) { assert(id(name) && typeof raw.selections[name] === 'string' && trialIds[raw.selections[name]], 'invalid_input'); response.selections[name] = raw.selections[name]; });
      }
      responses[responseKey] = response;
    }
    var value = { kind: 'confirmation-v1', questionId: q.questionId, version: q.version, assignmentId: input.assignmentId,
      requestId: input.requestId, sources: sources, journal: { schema: 1, trials: trials, responses: responses } };
    value.evidenceHash = confirmationEvidenceHash(value, hash);
    assert(canonical(value).length <= LIMITS.payload, 'payload_too_large'); return value;
  }
  function confirmationEvidenceHash(value, hash) {
    return hash(canonical({ questionId: value.questionId, version: value.version, sources: value.sources, journal: value.journal }));
  }
  function extract(code, ranges) {
    var lines = code.replace(/\r\n?/g, '\n').split('\n'), used = [], result = {};
    assert(Array.isArray(ranges) && ranges.length > 0 && ranges.length <= 30, 'snapshot_invalid');
    ranges.forEach(function (r) {
      assert(r && id(r.regionId) && id(r.scoringId) && !Object.prototype.hasOwnProperty.call(result, r.scoringId), 'snapshot_invalid');
      var start = 0, end = lines.length;
      if (r.startMarker !== null) {
        var starts = lines.map(function (l, i) { return l.trim() === r.startMarker.trim() ? i : -1; }).filter(function (i) { return i >= 0; });
        assert(starts.length === 1, 'markers_invalid'); start = starts[0] + 1;
      }
      if (r.endMarker !== null) {
        var ends = lines.map(function (l, i) { return l.trim() === r.endMarker.trim() ? i : -1; }).filter(function (i) { return i >= 0; });
        assert(ends.length === 1, 'markers_invalid'); end = ends[0];
      }
      assert(start <= end && !used.some(function (p) { return start < p.end && end > p.start; }), 'markers_invalid');
      used.push({ start: start, end: end }); result[r.scoringId] = lines.slice(start, end).join('\n');
    });
    return result;
  }
  function draftGroup(actorKey, q) { return actorKey + '/' + key(q); }
  function gradeGroup(actorKey, policy, questionId) { return [actorKey, policy.year, policy.setId, questionId].join('/'); }
  function publicDraft(r) { return r ? { questionId: r.questionId, version: r.version, revision: r.revision, seq: r.seq, updatedAt: r.at, code: r.body.code, stdin: r.body.stdin } : null; }
  function receipt(r, result) {
    var value = { requestId: r.requestId, questionId: r.questionId, version: r.version, assignmentId: r.policy.assignmentId,
      receivedAt: r.at, dueAt: r.policy.dueAt, late: r.at > r.policy.dueAt,
      state: result ? 'submitted' : 'pending', score: result ? result.body.score : null,
      gradedAt: result ? result.at : null, checks: result ? result.body.checks : [], diagnostics: result ? result.body.diagnostics : [] };
    if (r.body.kind === 'confirmation-v1') { value.kind = 'confirmation-v1'; value.evidenceHash = r.body.evidenceHash; }
    else value.codeHash = r.body.run.codeHash;
    return value;
  }
  var messages = {
    login_required: '学校アカウントで再接続してください。コードは保持しています。',
    not_allowed: 'この問題・版の利用権限を確認できません。',
    unavailable: 'GSS保存・正式提出は準備中、または受付を停止しています。',
    maintenance: '現在は保存・提出を停止しています。コードは保持しています。',
    outside_period: 'この課題は受付期間外です。',
    invalid_input: '送信内容の形式・長さを確認してください。',
    payload_too_large: '送信内容が保存上限を超えています。コードをファイルに保護して教員へ相談してください。',
    stale_output: '現在のコードと実行結果が一致しません。再実行してください。',
    request_conflict: '同じ送信番号の内容が変わっています。元の送信結果を確認してください。',
    storage_not_ready: '保存先の準備を確認できません。コードは保持しています。',
    storage_full: '保存先の容量を確認できません。コードは保持しています。',
    storage_ambiguous: '保存記録の整合性を確認できません。教員へ連絡してください。',
    storage_write_failed: '保存の完了を確認できません。同じ送信番号で結果を照会してください。',
    busy: '保存処理が混み合っています。同じ送信番号で再試行してください。',
    snapshot_missing: 'この問題・版は正式採用前です。',
    snapshot_invalid: '採用版の整合性を確認できません。教員へ連絡してください。',
    snapshot_conflict: '同じ版に異なる問題・採点基準を登録できません。新しい版を用意してください。',
    adoption_required: '問題マスターが採用済みではありません。採用状態は自動変更しません。',
    config_changed: '受付設定が変更されました。送信結果を確認してから再接続してください。',
    grading_failed: '採点・結果保存が完了していません。同じ提出を再処理できます。'
  };
  function error(error) {
    var code = error && error.pythonEditorCode;
    return { code: Object.prototype.hasOwnProperty.call(messages, code) ? code : 'grading_failed',
      message: messages[code] || messages.grading_failed };
  }
  return { LIMITS: LIMITS, ID: ID, REQUEST: REQUEST, HASH: HASH, fail: fail, assert: assert, id: id, assignmentId: assignmentId, iso: iso, text: text,
    canonical: canonical, hashText: hashText, uuid: uuid, intakeIssue: intakeIssue, intakeVerify: intakeVerify, scope: scope, key: key, request: request, draft: draft, submission: submission,
    confirmationEvidenceHash: confirmationEvidenceHash,
    extract: extract, draftGroup: draftGroup, gradeGroup: gradeGroup, publicDraft: publicDraft, receipt: receipt, error: error };
})();
