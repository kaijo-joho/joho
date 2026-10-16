// 確認問題専用。送信された記録を固定基準で判定する。Pythonの実行証明ではない。
var PythonEditorConfirmationGraderV1 = (function () {
  'use strict';
  var ENGINE = 'confirmation-records-20261017-v1';
  function need(value) { PythonEditor.assert(value, 'snapshot_invalid'); }
  function only(value, fields) {
    need(value && Object.prototype.toString.call(value) === '[object Object]' && Object.keys(value).every(function (key) { return fields.indexOf(key) >= 0; }));
  }
  function matcher(value) {
    only(value, ['mode','text']); need(['exact','lastLine','contains'].indexOf(value.mode) >= 0 && typeof value.text === 'string' && value.text.length <= 10000);
    return { mode: value.mode, text: value.text };
  }
  function predicates(value) {
    try { return PythonEditorConfirmation.normalizeCheck('inputCases', { cases: [{ id: 'criterion', label: 'criterion', inputs: value }] }).cases[0].inputs; }
    catch (_) { PythonEditor.fail('snapshot_invalid'); }
  }
  function normalize(type, config, raw) {
    var c;
    try { c = PythonEditorConfirmation.normalizeCheck(type, config); } catch (_) { PythonEditor.fail('snapshot_invalid'); }
    only(raw, ['schema','version','checks']);
    need(raw.schema === 1 && PythonEditor.id(raw.version) && Array.isArray(raw.checks) && raw.checks.length >= 1 && raw.checks.length <= 100);
    var ids = Object.create(null), thresholds = Object.create(null), total = 0;
    var checks = raw.checks.map(function (check) {
      need(check && PythonEditor.id(check.id) && !ids[check.id] && typeof check.points === 'number' && Number.isFinite(check.points) && check.points >= 0 && check.points <= 1000);
      ids[check.id] = true; total += check.points;
      var result = { id: check.id, points: check.points };
      if (type === 'inputCases') {
        only(check, ['id','points','require']);
        need(c.cases.some(function (item) { return item.id === check.id; }) && ['input','inputAndOutput'].indexOf(check.require) >= 0);
        if (check.require === 'inputAndOutput') need(c.private && c.private.expectedOutputs && c.private.expectedOutputs[check.id]);
        result.require = check.require;
      } else if (type === 'resultCoverage') {
        only(check, ['id','points','distinctAtLeast']);
        need(Number.isInteger(check.distinctAtLeast) && check.distinctAtLeast >= 1 && check.distinctAtLeast <= c.requiredDistinct && !thresholds[check.distinctAtLeast]);
        thresholds[check.distinctAtLeast] = true; result.distinctAtLeast = check.distinctAtLeast;
      } else if (type === 'attemptLimit') {
        only(check, ['id','points','require']); need(raw.checks.length === 1 && check.require === 'withinLimit'); result.require = check.require;
      } else if (type === 'compareRuns') {
        only(check, ['id','points','require','inputs','output']);
        need(c.conditions.some(function (item) { return item.id === check.id; }) && ['selection','input','output','inputAndOutput'].indexOf(check.require) >= 0);
        result.require = check.require;
        var input = ['input','inputAndOutput'].indexOf(check.require) >= 0, output = ['output','inputAndOutput'].indexOf(check.require) >= 0;
        if (input) result.inputs = predicates(check.inputs); else need(check.inputs === undefined);
        if (output) result.output = matcher(check.output); else need(check.output === undefined);
      } else {
        only(check, ['id','points','require','absoluteTolerance','relativeTolerance']);
        need(raw.checks.length === 1 && check.require === 'correct' && c.private && Object.prototype.hasOwnProperty.call(c.private, 'expectedAnswer'));
        result.require = check.require;
        if (c.format === 'number') {
          ['absoluteTolerance','relativeTolerance'].forEach(function (name) { need(typeof check[name] === 'number' && Number.isFinite(check[name]) && check[name] >= 0 && check[name] <= 1000000000); result[name] = check[name]; });
        } else need(check.absoluteTolerance === undefined && check.relativeTolerance === undefined);
      }
      return result;
    });
    need(total > 0 && Number.isFinite(total));
    if (type === 'inputCases') need(c.cases.length === checks.length && c.cases.every(function (item) { return ids[item.id]; }));
    if (type === 'compareRuns') need(c.conditions.length === checks.length && c.conditions.every(function (item) { return ids[item.id]; }));
    if (type === 'resultCoverage') need(thresholds[c.requiredDistinct]);
    return { schema: 1, version: raw.version, checks: checks };
  }
  function output(value, mode) {
    var text = String(value).replace(/\r\n?/g, '\n').replace(/\n+$/, '');
    return mode === 'lastLine' ? text.split('\n').slice(-1)[0] : text;
  }
  function matchesOutput(stdout, rule) {
    var value = output(stdout, rule.mode); return rule.mode === 'contains' ? value.indexOf(rule.text) >= 0 : value === rule.text;
  }
  function matchesInputs(trial, conditions) {
    // 公開判定器と同じ数値/入力規則を共用し、クライアントの達成結果は受け取らない。
    return PythonEditorConfirmation.evaluateCheck('inputCases', { cases: [{ id: 'criterion', label: 'criterion', inputs: conditions }] }, [trial], null,
      { currentCode: (function () { var result = {}; result[PythonEditor.key(trial.source)] = trial.code; return result; })() }).completed;
  }
  function bind(snapshot, input, sourceSnapshots) {
    need(snapshot && snapshot.question && snapshot.question.kind === 'confirmation' && snapshot.confirmation && input.kind === 'confirmation-v1');
    var refs = snapshot.confirmation.codeRefs, sourceMap = Object.create(null), snapshots = sourceSnapshots || [];
    PythonEditor.assert(Array.isArray(input.sources) && input.sources.length === refs.length && snapshots.length === refs.length, 'invalid_input');
    input.sources.forEach(function (source) {
      var key = PythonEditor.key(source);
      PythonEditor.assert(refs.some(function (ref) { return PythonEditor.key(ref) === key; }) && !sourceMap[key], 'invalid_input');
      sourceMap[key] = { code: source.code, codeHash: PythonEditor.hashText(source.code) };
    });
    refs.forEach(function (ref) {
      var key = PythonEditor.key(ref), frozen = snapshots.find(function (record) { return record && PythonEditor.key(record) === key; });
      need(frozen && frozen.body && frozen.payloadHash === PythonEditor.hashText(PythonEditor.canonical(frozen.body)) &&
        PythonEditor.key(frozen.body.question) === key && frozen.body.question.kind === 'code' && frozen.body.question.setId === snapshot.question.setId && sourceMap[key]);
    });
    input.journal.trials.forEach(function (trial) {
      PythonEditor.assert(sourceMap[PythonEditor.key(trial.source)] && trial.codeHash === PythonEditor.hashText(trial.code), 'stale_output');
    });
    var response = input.journal.responses[PythonEditor.key(snapshot.question)] || {};
    if (snapshot.confirmation.checkType === 'answer') {
      PythonEditor.assert(response.selections === undefined, 'invalid_input');
      if (response.answer !== undefined) {
        var c = snapshot.confirmation.checkConfig;
        PythonEditor.assert(c.format === 'number' ? typeof response.answer === 'number' && Number.isFinite(response.answer) : typeof response.answer === 'string' && c.choices.some(function (choice) { return choice.id === response.answer; }), 'invalid_input');
      }
    } else if (snapshot.confirmation.checkType === 'compareRuns') {
      PythonEditor.assert(response.answer === undefined, 'invalid_input');
      Object.keys(response.selections || {}).forEach(function (id) { PythonEditor.assert(snapshot.confirmation.checkConfig.conditions.some(function (condition) { return condition.id === id; }), 'invalid_input'); });
    } else PythonEditor.assert(Object.keys(response).length === 0, 'invalid_input');
    return sourceMap;
  }
  function grade(snapshot, input, sourceSnapshots) {
    need(snapshot.engineVersion === ENGINE && snapshot.graded === true);
    var type = snapshot.confirmation.checkType, c = PythonEditorConfirmation.normalizeCheck(type, snapshot.confirmation.checkConfig), grading = normalize(type, c, snapshot.confirmationGrading);
    var current = bind(snapshot, input, sourceSnapshots), response = input.journal.responses[PythonEditor.key(snapshot.question)] || {};
    var ok = input.journal.trials.filter(function (trial) {
      return trial.outcome === 'success' && !trial.truncated && (type === 'compareRuns' && c.codePolicy === 'variants' ||
        current[PythonEditor.key(trial.source)].code === trial.code && current[PythonEditor.key(trial.source)].codeHash === trial.codeHash);
    });
    var covered = new Set(type === 'resultCoverage' ? ok.map(function (trial) { return output(trial.stdout, c.output); }).filter(function (value) { return c.results.indexOf(value) >= 0; }) : []);
    var selected = Object.create(null), used = Object.create(null);
    if (type === 'compareRuns') c.conditions.forEach(function (condition) {
      var trial = ok.find(function (item) { return item.id === (response.selections || {})[condition.id]; });
      if (trial && !used[trial.id]) { selected[condition.id] = trial; used[trial.id] = true; }
    });
    var checks = grading.checks.map(function (rule, index) {
      var passed = false;
      if (type === 'inputCases') {
        var condition = c.cases.find(function (item) { return item.id === rule.id; });
        passed = ok.some(function (trial) { return matchesInputs(trial, condition.inputs) && (rule.require === 'input' || matchesOutput(trial.stdout, c.private.expectedOutputs[rule.id])); });
      } else if (type === 'resultCoverage') passed = covered.size >= rule.distinctAtLeast;
      else if (type === 'attemptLimit') passed = PythonEditorConfirmation.evaluateCheck(type, PythonEditorConfirmation.publicCheck(type, c), ok, null,
        { currentCode: (function () { var values = {}; Object.keys(current).forEach(function (key) { values[key] = current[key].code; }); return values; })() }).completed;
      else if (type === 'compareRuns') {
        var trial = selected[rule.id];
        passed = !!trial && (!rule.inputs || matchesInputs(trial, rule.inputs)) && (!rule.output || matchesOutput(trial.stdout, rule.output));
      } else if (response.answer !== undefined) {
        var expected = c.private.expectedAnswer;
        if (c.format === 'choice') passed = response.answer === expected;
        else passed = Math.abs(response.answer - expected) <= Math.max(rule.absoluteTolerance, rule.relativeTolerance * Math.abs(expected));
      }
      // 判定条件・private正答は返さず、固定順の一般名だけを返す。
      return { label: '確認条件' + (index + 1), passed: passed, points: rule.points, earned: passed ? rule.points : 0 };
    });
    var total = checks.reduce(function (sum, check) { return sum + check.points; }, 0), earned = checks.reduce(function (sum, check) { return sum + check.earned; }, 0);
    return { score: earned / total, engineVersion: ENGINE, checks: checks,
      diagnostics: ['送信された試行記録と回答を採用版の基準で判定しています。端末内のPython実行を証明するものではありません。'] };
  }
  function starTotal(snapshot) {
    need(snapshot && snapshot.confirmation && snapshot.engineVersion === ENGINE && snapshot.graded === true);
    return normalize(snapshot.confirmation.checkType, snapshot.confirmation.checkConfig, snapshot.confirmationGrading).checks.filter(function (check) { return check.points > 0; }).length;
  }
  return Object.freeze({ engineVersion: ENGINE, normalize: normalize, bind: bind, grade: grade, starTotal: starTotal });
})();
