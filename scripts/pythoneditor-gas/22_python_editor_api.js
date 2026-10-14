var PythonEditorService = (function () {
  function environment() {
    var actor = PythonEditorConfig.identity(false), c = PythonEditorConfig.config();
    PythonEditorConfig.active(c);
    return { actor: actor, config: c, store: PythonEditorStore.create(c), hash: PythonEditor.hashText, now: function () { return new Date().toISOString(); },
      intakeSecret: function () { return PropertiesService.getScriptProperties().getProperty('PYTHON_EDITOR_INTAKE_HMAC'); },
      authorize: function (snapshot, assignmentId, at, intake) { return PythonEditorConfig.authorize(c, actor, snapshot.body, assignmentId, at, intake); },
      recheck: function (snapshot, assignmentId, intakeAt, intake) {
        var freshActor = PythonEditorConfig.identity(false), fresh = PythonEditorConfig.config();
        PythonEditor.assert(freshActor.key === actor.key && freshActor.grade === actor.grade, 'not_allowed');
        PythonEditor.assert(fresh.hash === c.hash, 'config_changed');
        PythonEditorConfig.authorize(fresh, freshActor, snapshot.body, assignmentId, intakeAt, intake);
      } };
  }
  function snapshot(q, env) {
    var r = env.store.findSnapshot(q);
    PythonEditor.assert(r && r.payloadHash === env.hash(PythonEditor.canonical(r.body)) && r.body.schema === 1 &&
      PythonEditor.key(r.body.question) === PythonEditor.key(q), 'snapshot_missing');
    env.authorize(r, null, env.now(), false); return r;
  }
  function session(env) {
    var sets = {}, policies = [], seen = {};
    env.config.assignments.forEach(function (p) {
      if (!p.enabled || env.now() < p.startsAt || !env.actor.teacher && p.grades.indexOf(env.actor.grade) < 0) return;
      var rows = env.store.snapshots(p.setId, p.version);
      if (!rows.length) return;
      if (!sets[p.setId]) sets[p.setId] = { setId: p.setId, title: p.setId, questions: [] };
      rows.sort(function (a, b) { return a.body.question.order - b.body.question.order; }).forEach(function (r) {
        PythonEditor.assert(r.payloadHash === env.hash(PythonEditor.canonical(r.body)), 'snapshot_invalid');
        var q = r.body.question, key = PythonEditor.key(q);
        if (!seen[key]) { sets[p.setId].questions.push(PythonEditorMaster.publicQuestion(r)); seen[key] = true; }
        policies.push({ questionId: q.questionId, version: q.version, assignmentId: p.assignmentId, dueAt: p.dueAt,
          startsAt: p.startsAt, closesAt: p.closesAt, canSubmit: !env.actor.teacher && p.official && r.body.graded && env.now() >= p.startsAt && env.now() <= p.closesAt });
      });
    });
    return { actorKey: env.actor.key, account: env.actor.email, teacher: env.actor.teacher, limits: PythonEditor.LIMITS,
      catalog: { schema: 'python-editor-catalog-v1', label: '学校アカウント・採用版', sets: Object.keys(sets).map(function (k) { return sets[k]; }) }, policies: policies };
  }
  function saveDraft(input, env, at) {
    input = PythonEditor.draft(input);
    var frozen = snapshot(input, env);
    return env.store.saveDraft(env.actor.key, input, at, function () { env.recheck(frozen, null, at, false); });
  }
  function getDraft(input, env) {
    var q = PythonEditor.scope(input), frozen = snapshot(q, env);
    if (input.revision) {
      PythonEditor.assert(PythonEditor.REQUEST.test(input.revision), 'invalid_input');
      return { draft: PythonEditor.publicDraft(env.store.draftRevision(env.actor.key, q, input.revision)) };
    }
    var state = env.store.draft(env.actor.key, q);
    return { draft: PythonEditor.publicDraft(state.draft), history: state.rows.slice(0, 20).map(function (r) { return { revision: r.revision, updatedAt: r.at, seq: r.seq }; }) };
  }
  function listDrafts(env) {
    return env.store.listDrafts(env.actor.key).filter(function (r) {
      var frozen = env.store.findSnapshot(r);
      if (!frozen) return false;
      try { env.authorize(frozen, null, env.now(), false); return true; } catch (e) { if (e.pythonEditorCode === 'not_allowed') return false; throw e; }
    }).map(function (r) { return { questionId: r.questionId, version: r.version, revision: r.revision, updatedAt: r.at, seq: r.seq }; });
  }
  function response(receipt, env) {
    PythonEditor.assert(receipt && receipt.actorKey === env.actor.key, 'not_allowed');
    var result = env.store.findResult(env.actor.key, receipt.requestId), all = env.store.results(receipt.groupKey);
    var eligible = all.filter(function (r) { return r.actorKey === env.actor.key && r.eligible === true && r.receivedAt <= r.policy.dueAt; });
    var best = eligible.length ? Math.max.apply(null, eligible.map(function (r) { return r.body.score; })) : null;
    var completed = {}; all.forEach(function (r) { completed[r.requestId] = true; });
    var pending = env.store.requests(receipt.groupKey).filter(function (r) { return !completed[r.requestId]; }).sort(function (a, b) { return a.at.localeCompare(b.at) || a.seq - b.seq; })
      .map(function (r) { return { requestId: r.requestId, questionId: r.questionId, version: r.version, receivedAt: r.at }; });
    return { receipt: PythonEditor.receipt(receipt, result), bestScore: best, pending: pending, history: all.sort(function (a, b) { return b.receivedAt.localeCompare(a.receivedAt) || b.seq - a.seq; }).slice(0, 20).map(function (r) {
      return { requestId: r.requestId, version: r.version, receivedAt: r.receivedAt, gradedAt: r.at, score: r.body.score, late: !r.eligible };
    }) };
  }
  function process(receipt, env) {
    PythonEditor.assert(receipt && receipt.actorKey === env.actor.key, 'not_allowed');
    var prior = env.store.findResult(env.actor.key, receipt.requestId);
    if (prior) return response(receipt, env);
    var frozen = snapshot(receipt, env);
    PythonEditor.assert(frozen.payloadHash === receipt.snapshotHash && frozen.body.graded, 'snapshot_invalid');
    env.authorize(frozen, receipt.policy.assignmentId, receipt.at, false);
    var result = PythonEditorGraderV1.grade(frozen.body, receipt.body);
    env.store.finish(receipt, result, env.now(), function () { env.recheck(frozen, receipt.policy.assignmentId, receipt.at, false); });
    return response(receipt, env);
  }
  function submit(input, env, at) {
    var intakeTicket = input && input.intakeTicket;
    input = PythonEditor.submission(input, env.hash);
    // 再送の期間判定は元の受付時刻に固定する。今の締切を過ぎても同一要求を回復できる。
    var prior = env.store.findRequest(env.actor.key, input.requestId);
    if (prior) {
      PythonEditor.assert(prior.payloadHash === env.hash(PythonEditor.canonical(input)), 'request_conflict');
      return process(prior, env);
    }
    var frozen = snapshot(input, env);
    PythonEditor.assert(frozen.body.graded, 'not_allowed');
    var proof = intakeTicket ? PythonEditor.intakeVerify(intakeTicket, env.intakeSecret()) : null;
    var receivedAt = proof ? proof.receivedAt : at;
    var policy = env.authorize(frozen, input.assignmentId, receivedAt, true);
    var payload = { actorKey: env.actor.key, requestId: input.requestId, payloadHash: env.hash(PythonEditor.canonical(input)),
      snapshotHash: frozen.payloadHash, policyHash: env.hash(PythonEditor.canonical(policy)), receivedAt: receivedAt };
    if (proof) PythonEditor.assert(PythonEditor.canonical(proof) === PythonEditor.canonical(payload) && receivedAt <= at, 'request_conflict');
    else intakeTicket = PythonEditor.intakeIssue(payload, env.intakeSecret());
    var accepted;
    try { accepted = env.store.accept(env.actor.key, input, frozen, policy, receivedAt, function () { env.recheck(frozen, input.assignmentId, receivedAt, true); }); }
    catch (e) {
      // lock混雑/書込失敗でも応答が届けば、署名した元のサーバー到着時刻を再送に使える。
      // ブラウザ時計や任意の押下時刻は使用しない。鍵はサーバーのScriptPropertiesのみ。
      e.intakeTicket = intakeTicket; throw e;
    }
    return process(accepted, env);
  }
  function dispatch(action, input, env, at) {
    if (action === 'session') return session(env);
    if (action === 'saveDraft') return saveDraft(input, env, at);
    if (action === 'getDraft') return getDraft(input, env);
    if (action === 'listDrafts') return { drafts: listDrafts(env) };
    if (action === 'submit') return submit(input, env, at);
    if (action === 'getSubmission' || action === 'resumeSubmission') {
      PythonEditor.request(input);
      var r = env.store.findRequest(env.actor.key, input.requestId);
      if (!r) return { receipt: null, bestScore: null, history: [] };
      return action === 'resumeSubmission' ? process(r, env) : response(r, env);
    }
    if (action === 'questionStatus') {
      var q = PythonEditor.scope(input), frozen = snapshot(q, env);
      var policy = env.authorize(frozen, input.assignmentId, env.now(), false), group = PythonEditor.gradeGroup(env.actor.key, policy, q.questionId);
      var rows = env.store.requests(group).sort(function (a, b) { return b.at.localeCompare(a.at) || b.seq - a.seq; });
      if (!rows.length) return { receipt: null, bestScore: null, history: [] };
      return response(rows[0], env);
    }
    PythonEditor.fail('invalid_input');
  }
  return { environment: environment, dispatch: dispatch, snapshot: snapshot };
})();

function pythonEditorRpc(action, input, expectedActorKey) {
  var receivedAt = new Date().toISOString(); // 認証、正本読取、ScriptLock待ち、採点より先に確保。
  try {
    var env = PythonEditorService.environment();
    if (action !== 'session') PythonEditor.assert(PythonEditor.HASH.test(expectedActorKey) && expectedActorKey === env.actor.key, 'login_required');
    return { ok: true, value: PythonEditorService.dispatch(action, input || {}, env, receivedAt) };
  }
  catch (e) { var safe = PythonEditor.error(e); if (e.intakeTicket) safe.intakeTicket = e.intakeTicket; return { ok: false, error: safe }; }
}

function renderPythonEditorBridge_(e) {
  try {
    var c = PythonEditorConfig.config(), p = e && e.parameter || {};
    PythonEditorConfig.identity(false); PythonEditorConfig.active(c);
    PythonEditor.assert(p.origin === c.editorOrigin && PythonEditor.HASH.test(p.channel), 'not_allowed');
    var template = HtmlService.createTemplateFromFile('21_python_editor_bridge');
    template.bootJson = JSON.stringify({ origin: c.editorOrigin, channel: p.channel }).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return template.evaluate().setTitle('Pythonエディタ・学校アカウント接続')
      .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL).addMetaTag('viewport', 'width=device-width, initial-scale=1');
  } catch (e) {
    var msg = PythonEditor.error(e).message.replace(/&/g, '&amp;').replace(/</g, '&lt;');
    return HtmlService.createHtmlOutput('<p>' + msg + '</p>').setTitle('Pythonエディタ・接続確認');
  }
}
