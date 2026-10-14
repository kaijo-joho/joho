var PythonEditorConfig = (function () {
  function config() {
    var raw = PropertiesService.getScriptProperties().getProperty('PYTHON_EDITOR_CONFIG');
    PythonEditor.assert(raw && raw.length <= 8500, 'unavailable');
    var c;
    try { c = JSON.parse(raw); } catch (e) { PythonEditor.fail('unavailable'); }
    PythonEditor.assert(c && c.schema === 1 && typeof c.enabled === 'boolean' &&
      typeof c.editorOrigin === 'string' && /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(c.editorOrigin) &&
      /^[A-Za-z0-9_-]{20,150}$/.test(c.storageSpreadsheetId) && Array.isArray(c.assignmentIds) && c.assignmentIds.length <= 100 &&
      c.assignmentIds.every(function (id, i) { return PythonEditor.assignmentId(id) && c.assignmentIds.indexOf(id) === i; }), 'unavailable');
    c.assignments = loadAssignments(c.assignmentIds);
    var seen = {};
    c.assignments.forEach(function (p) {
      PythonEditor.assert(p && PythonEditor.assignmentId(p.assignmentId) && PythonEditor.id(p.setId) && PythonEditor.id(p.version) &&
        Number.isInteger(p.year) && p.year >= 2026 && p.year <= 2200 && Array.isArray(p.grades) && p.grades.length > 0 && p.grades.length <= 6 &&
        p.grades.every(function (g, i) { return Number.isInteger(g) && g >= 1 && g <= 6 && p.grades.indexOf(g) === i; }) &&
        PythonEditor.iso(p.startsAt) && PythonEditor.iso(p.dueAt) && PythonEditor.iso(p.closesAt) && p.startsAt <= p.dueAt && p.dueAt <= p.closesAt &&
        typeof p.enabled === 'boolean' && typeof p.official === 'boolean', 'unavailable');
      var key = [p.year, p.assignmentId, p.version].join('/');
      PythonEditor.assert(!seen[key], 'unavailable'); seen[key] = true;
    });
    c.hash = PythonEditor.hashText(PythonEditor.canonical({ property: raw, assignments: c.assignments })); return c;
  }
  function loadAssignments(ids) {
    if (!ids.length) return [];
    var sheet = SpreadsheetApp.openById(Common.SSID.fileList).getSheetByName('課題設定');
    PythonEditor.assert(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= 5001 && sheet.getLastColumn() <= 40, 'unavailable');
    var values = sheet.getRange(1, 1, sheet.getLastRow(), sheet.getLastColumn()).getValues(), header = values.shift().map(String);
    var required = ['id','status','year','grade','item','targetId','subTargetId','startAt','standardDueAt','finalDueAt','gradingMode'];
    PythonEditor.assert(required.every(function (k) { return header.indexOf(k) >= 0 && header.indexOf(k) === header.lastIndexOf(k); }), 'unavailable');
    var rows = values.map(function (row) { var r = {}; header.forEach(function (k, i) { r[k] = row[i]; }); return r; });
    return ids.map(function (id) {
      var matches = rows.filter(function (r) { return r.id === id; });
      PythonEditor.assert(matches.length === 1 && matches[0].item === 'pythoneditor', 'unavailable');
      var r = matches[0];
      PythonEditor.assert(['active','practice','closed'].indexOf(r.status) >= 0 && ['auto','closed'].indexOf(r.gradingMode) >= 0, 'unavailable');
      var toISO = function (v) {
        var s = Object.prototype.toString.call(v) === '[object Date]' && Number.isFinite(v.getTime()) ? v.toISOString() : v;
        PythonEditor.assert(PythonEditor.iso(s), 'unavailable'); return s;
      };
      return { assignmentId: id, year: Number(r.year), grades: [Number(r.grade)], setId: r.targetId, version: r.subTargetId,
        startsAt: toISO(r.startAt), dueAt: toISO(r.standardDueAt), closesAt: toISO(r.finalDueAt),
        enabled: r.status !== 'closed' && r.gradingMode !== 'closed', official: r.status === 'active' && r.gradingMode === 'auto' };
    });
  }
  function identity(teacherOnly) {
    var email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
    PythonEditor.assert(/^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(email), 'login_required');
    var teacher = Array.isArray(Common.TEACHERS) && Common.TEACHERS.some(function (v) { return String(v).toLowerCase() === email; });
    if (teacherOnly) { PythonEditor.assert(teacher, 'not_allowed'); return { email: email, key: PythonEditor.hashText(email), teacher: true, grade: null }; }
    var user = Common.getUser(email, SpreadsheetApp.openById(Common.SSID.fileList));
    // 名簿未登録の教員は採用版の検査のみ可能。生徒として提出する学年を推測しない。
    if (teacher && !user) return { email: email, key: PythonEditor.hashText(email), teacher: true, grade: null };
    PythonEditor.assert(user && String(user.userId || '').trim().toLowerCase() === email && Number.isInteger(Number(user['年'])) && Number(user['年']) >= 1 && Number(user['年']) <= 6, 'not_allowed');
    return { email: email, key: PythonEditor.hashText(email), teacher: teacher, grade: Number(user['年']) };
  }
  function active(c) {
    PythonEditor.assert(c.enabled, 'unavailable');
    // 既存gradeの停止条件を共用するが、その設定は変更しない。
    if (typeof GradeMaintenance !== 'undefined') PythonEditor.assert(!GradeMaintenance.shouldBlock({ parameter: { kind: 'pythoneditor' } }), 'maintenance');
  }
  function policies(c, actor, q, assignmentId) {
    return c.assignments.filter(function (p) {
      return p.enabled && p.version === q.version && (!q.setId || p.setId === q.setId) &&
        (!assignmentId || p.assignmentId === assignmentId) && (actor.teacher || p.grades.indexOf(actor.grade) >= 0);
    });
  }
  function authorize(c, actor, snapshot, assignmentId, at, intake) {
    active(c);
    var matches = policies(c, actor, snapshot.question, assignmentId).filter(function (p) { return intake || at >= p.startsAt; });
    PythonEditor.assert(assignmentId ? matches.length === 1 : matches.length >= 1, 'not_allowed');
    var p = matches[0];
    if (intake) {
      // 教員用の閲覧と、生徒としての成績提出を分離する。
      PythonEditor.assert(!actor.teacher && p.official && p.grades.indexOf(actor.grade) >= 0, 'not_allowed');
      PythonEditor.assert(at >= p.startsAt && at <= p.closesAt, 'outside_period');
    }
    return { assignmentId: p.assignmentId, year: p.year, grade: actor.grade, setId: p.setId,
      version: p.version, startsAt: p.startsAt, dueAt: p.dueAt, closesAt: p.closesAt };
  }
  return { config: config, identity: identity, active: active, policies: policies, authorize: authorize };
})();
