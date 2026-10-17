// 明示した教員・デモ用アカウントの配布検証。管理操作は所有教員だけ。
var ToolsTeacherPreview = (function () {
  'use strict';
  var CONFIG = 'TOOLS_TEACHER_PREVIEW_CONFIG', INDEX = 'TOOLS_TEACHER_PREVIEW_INDEX_V1';
  function assert(ok, code) {
    if (!ok) {
      var error = new Error(code === 'preview_disabled' ? '教員用の問題配布検証は停止中です。' :
        code === 'preview_not_allowed' ? 'このアカウントでは配布検証できません。指定された学校アカウントを確認してください。' :
        code === 'preview_expired' ? '検証用の問題データの有効期限が切れました。教員側で再配信してください。' :
        '問題配布の検証設定を確認できません。編集中のコードは保持しています。');
      error.previewCode = code || 'preview_invalid'; error.toolsStoreCode = error.previewCode; throw error;
    }
  }
  function plain(value) { return value && Object.prototype.toString.call(value) === '[object Object]'; }
  function parse(text) { try { return JSON.parse(text); } catch (ignored) { assert(false); } }
  function account(value) { return String(value || '').trim().toLowerCase(); }
  function validTitle(value) { return typeof value === 'string' && value.trim().length > 0 && value.length <= 300 && !/[\u0000-\u001f\u007f]/.test(value); }
  function setTitle(setId, pageTitles) {
    var match = /^(py[0-9]+)([ab]?)$/.exec(setId);
    assert(match && plain(pageTitles) && validTitle(pageTitles[match[1]]));
    var title = pageTitles[match[1]].trim().replace(/^(\d+-\d+)\.\s*/, '$1_') + ' ' +
      ({ a: 'A基本問題', b: 'B応用問題', '': '演習問題' })[match[2]];
    assert(validTitle(title)); return title;
  }
  function create(env) {
    var T = ToolsStoreContract;
    function configuration() {
      var c = parse(env.properties.getProperty(CONFIG));
      assert(plain(c) && Object.keys(c).every(function (k) { return ['schema', 'enabled', 'editorOrigin', 'sourceFileListId', 'teacherAccounts', 'demoAccounts', 'gradingSheet'].indexOf(k) >= 0; }) &&
        c.schema === 1 && typeof c.enabled === 'boolean' && /^https:\/\/[A-Za-z0-9.-]+(?::\d+)?$/.test(c.editorOrigin) &&
        /^[A-Za-z0-9_-]{20,160}$/.test(c.sourceFileListId) && /^採点設定py(?:_[A-Za-z0-9_-]+)?$/.test(c.gradingSheet) &&
        Array.isArray(c.teacherAccounts) && c.teacherAccounts.length >= 1 && c.teacherAccounts.length <= 2 &&
        c.teacherAccounts.every(function (v, i, values) { return typeof v === 'string' && /^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(v) && values.indexOf(v) === i; }) &&
        Array.isArray(c.demoAccounts) && c.demoAccounts.length <= 1 && c.demoAccounts.every(function (v) {
          return typeof v === 'string' && /^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(v) && c.teacherAccounts.indexOf(v) < 0;
        }));
      return c;
    }
    function identity(c, ownerOnly) {
      var who = env.identity(), active = account(who.active), effective = account(who.effective);
      var teacher = c.teacherAccounts.indexOf(active) >= 0;
      assert(active && active === effective && (ownerOnly ? active === c.teacherAccounts[0] : teacher || c.demoAccounts.indexOf(active) >= 0), 'preview_not_allowed');
      return { email: active, key: T.actorKey(active), teacher: teacher };
    }
    function current(c, actor) {
      assert(T.canonical(configuration()) === T.canonical(c), 'preview_changed');
      assert(identity(c).key === actor.key, 'preview_not_allowed');
    }
    function index() {
      var raw = env.properties.getProperty(INDEX), value = parse(raw);
      assert(plain(value) && Object.keys(value).every(function (k) { return ['schema', 'generation', 'sourceDigest', 'groups'].indexOf(k) >= 0; }) &&
        value.schema === 1 && /^[a-f0-9]{32}$/.test(value.generation) && /^[a-f0-9]{64}$/.test(value.sourceDigest) &&
        Array.isArray(value.groups) && value.groups.length > 0 && value.groups.length <= 100);
      var seen = {};
      value.groups.forEach(function (g) {
        assert(plain(g) && Object.keys(g).every(function (k) { return ['setId', 'version', 'title'].indexOf(k) >= 0; }) &&
          PythonEditor.id(g.setId) && PythonEditor.id(g.version) && (!Object.prototype.hasOwnProperty.call(g, 'title') || validTitle(g.title)) && !seen[g.version + '/' + g.setId]);
        seen[g.version + '/' + g.setId] = true;
      });
      return { raw: raw, value: value };
    }
    function preview() {
      var c = configuration(), actor = identity(c, true), source = env.readSource(c);
      current(c, actor);
      assert(source && /^[a-f0-9]{64}$/.test(source.digest) && Array.isArray(source.groups) && source.groups.length > 0 && source.groups.length <= 100);
      return { digest: source.digest, sets: source.groups.map(function (g) { return { setId: g.setId, version: g.version, title: g.title, questions: g.records.length }; }),
        questions: source.groups.reduce(function (sum, g) { return sum + g.records.length; }, 0), enabled: c.enabled };
    }
    function publish(input) {
      var c = configuration(), actor = identity(c, true);
      assert(plain(input) && Object.keys(input).length === 2 && input.confirmation === 'PUBLISH_TEACHER_CATALOG_PREVIEW_V1' && /^[a-f0-9]{64}$/.test(input.expectedDigest));
      var source = env.readSource(c); assert(source.digest === input.expectedDigest, 'preview_changed');
      var snapshots = [], groups = [], at = new Date(env.now()).toISOString();
      source.groups.forEach(function (g) {
        assert(validTitle(g.title));
        groups.push({ setId: g.setId, version: g.version, title: g.title });
        g.records.forEach(function (r) {
          var q = r.body.question;
          snapshots.push({ recordKey: PythonEditor.key(q), groupKey: q.version + '/' + q.setId, actorKey: '', questionId: q.questionId, version: q.version,
            requestId: '', seq: 0, at: at, payloadHash: r.payloadHash, adoptedBy: actor.key, body: r.body });
        });
      });
      assert(env.bytes(T.canonical({ schema: 1, generation: new Array(33).join('0'), sourceDigest: source.digest, groups: groups })) < 8000, 'preview_capacity');
      var actors = {}; actors[actor.key] = { grade: null, teacher: true };
      var packages = env.packages(), prior = packages.head();
      var meta = packages.publish({ snapshots: snapshots, assignments: [], actors: actors, registry: [] }, {
        expectedGeneration: prior ? prior.generation : null, expiresAt: null,
        beforeCommit: function () { current(c, actor); assert(env.readSource(c).digest === source.digest, 'preview_changed'); }
      });
      current(c, actor); assert(packages.head().generation === meta.generation, 'preview_changed');
      var next = T.canonical({ schema: 1, generation: meta.generation, sourceDigest: source.digest, groups: groups });
      assert(env.bytes(next) < 8000);
      var all = env.properties.getProperties(); all[INDEX] = next;
      assert(Object.keys(all).reduce(function (sum, k) { return sum + env.bytes(k) + env.bytes(String(all[k])); }, 0) <= 450000, 'preview_capacity');
      env.properties.setProperty(INDEX, next);
      assert(index().raw === next && packages.head().generation === meta.generation, 'preview_changed');
      return { generation: meta.generation, sourceDigest: source.digest, questions: snapshots.length, sets: groups.length, expiresAt: meta.expiresAt === null ? null : new Date(meta.expiresAt).toISOString() };
    }
    function setEnabled(enabled, expectedGeneration) {
      var c = configuration(), actor = identity(c, true);
      if (enabled) {
        var i = index(), opened = env.packages().open({ expectedGeneration: i.value.generation });
        assert(expectedGeneration === opened.meta.generation, 'preview_changed');
      }
      current(c, actor); c.enabled = enabled;
      env.properties.setProperty(CONFIG, T.canonical(c));
      assert(T.canonical(configuration()) === T.canonical(c), 'preview_changed');
      return { enabled: c.enabled };
    }
    function session(origin) {
      var c = configuration(), actor = identity(c);
      assert(c.enabled, 'preview_disabled'); assert(origin === c.editorOrigin, 'preview_not_allowed');
      var i = index(), packages = env.packages(), opened;
      try { opened = packages.open({ expectedGeneration: i.value.generation }); }
      catch (e) { if (e.toolsStoreCode === 'packages_expired') assert(false, 'preview_expired'); throw e; }
      var publisherKey = T.actorKey(c.teacherAccounts[0]);
      assert(opened.actors[publisherKey] && opened.actors[publisherKey].teacher === true);
      var sets = {};
      i.value.groups.forEach(function (g) {
        var rows = opened.snapshots(g.setId, g.version); assert(rows.length > 0);
        if (!sets[g.setId]) sets[g.setId] = { setId: g.setId, title: g.title || g.setId, questions: [] };
        rows.sort(function (a, b) { return a.body.question.order - b.body.question.order; }).forEach(function (r) {
          sets[g.setId].questions.push(PythonEditorMaster.publicQuestion(r));
        });
      });
      current(c, actor); assert(index().raw === i.raw && packages.head().generation === opened.meta.generation, 'preview_changed');
      return { actorKey: actor.key, account: actor.email, teacher: actor.teacher, policies: [], ratings: [],
        preview: { readOnly: true, viewerRole: actor.teacher ? 'teacher' : 'demo', generation: opened.meta.generation, sourceDigest: i.value.sourceDigest, expiresAt: opened.meta.expiresAt === null ? null : new Date(opened.meta.expiresAt).toISOString() },
        catalog: { schema: Object.keys(sets).some(function (key) { return sets[key].questions.some(function (q) { return q.kind === 'confirmation'; }); }) ? 'python-editor-catalog-v2' : 'python-editor-catalog-v1',
          label: '問題配布検証（採用前を含む）', sets: Object.keys(sets).map(function (k) { return sets[k]; }) } };
    }
    function rpc(action, input, origin) {
      var c = configuration(); identity(c);
      assert(action === 'session' && plain(input) && Object.keys(input).length === 0, 'preview_action_denied');
      return session(origin);
    }
    function boot(parameters) {
      var c = configuration(); identity(c); assert(c.enabled, 'preview_disabled');
      assert(parameters && parameters.kind === 'pythoneditor' && parameters.origin === c.editorOrigin && /^[a-f0-9]{64}$/.test(parameters.channel || ''), 'preview_not_allowed');
      return { origin: c.editorOrigin, channel: parameters.channel };
    }
    return Object.freeze({ preview: preview, publish: publish, session: session, rpc: rpc, boot: boot, setEnabled: setEnabled });
  }
  return Object.freeze({ create: create, setTitle: setTitle, keys: Object.freeze({ config: CONFIG, index: INDEX }) });
}());

function toolsTeacherPreviewEnvironment_() {
  function bounded(sheet, columns, rows, ignoredFormulaColumn) {
    PythonEditor.assert(sheet && sheet.getLastRow() > 0 && sheet.getLastRow() <= rows && sheet.getLastColumn() === columns, 'snapshot_invalid');
    var range = sheet.getRange(1, 1, sheet.getLastRow(), columns);
    PythonEditor.assert(range.getFormulas().every(function (r, row) { return r.every(function (v, col) { return !v || row > 0 && col === ignoredFormulaColumn; }); }), 'snapshot_invalid');
    return range.getValues();
  }
  function pageTitles(sheet) {
    PythonEditor.assert(sheet && sheet.getLastRow() > 1 && sheet.getLastRow() <= 5001 && sheet.getLastColumn() >= 2 && sheet.getLastColumn() <= 100, 'snapshot_invalid');
    var header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0], id = header.indexOf('id'), title = header.indexOf('title');
    PythonEditor.assert(id >= 0 && title >= 0 && header.lastIndexOf('id') === id && header.lastIndexOf('title') === title, 'snapshot_invalid');
    var count = sheet.getLastRow() - 1, ids = sheet.getRange(2, id + 1, count, 1).getValues(),
      titles = sheet.getRange(2, title + 1, count, 1).getValues(), result = {};
    ids.forEach(function (row, i) {
      if (!/^py[0-9]+$/.test(row[0])) return;
      PythonEditor.assert(!Object.prototype.hasOwnProperty.call(result, row[0]), 'snapshot_invalid');
      result[row[0]] = titles[i][0];
    });
    return result;
  }
  return { properties: PropertiesService.getScriptProperties(), now: function () { return Date.now(); },
    identity: function () { return { active: Session.getActiveUser().getEmail(), effective: Session.getEffectiveUser().getEmail() }; },
    bytes: function (text) { return Utilities.newBlob(text).getBytes().length; },
    packages: function () { return ToolsGradingPackages.create({ allowNoExpiry: true }); },
    readSource: function (c) {
      var book = SpreadsheetApp.openById(c.sourceFileListId), master = PythonEditorMaster.masterValues(book.getSheetByName('Python問題マスター'), 5001),
        rules = bounded(book.getSheetByName(c.gradingSheet), 15, 10001, 13), titles = pageTitles(book.getSheetByName('ページ一覧')), seen = {}, groups = [];
      master.slice(1).forEach(function (row) {
        if (row.every(function (v) { return v === ''; })) return;
        var key = row[3] + '/' + row[1]; if (seen[key]) return; seen[key] = true;
        var built = PythonEditorMaster.build(master, rules, { setId: row[1], version: row[3], gradingSheet: c.gradingSheet });
        groups.push({ setId: row[1], version: row[3], title: ToolsTeacherPreview.setTitle(row[1], titles), records: built.records, digest: built.digest });
      });
      groups.sort(function (a, b) { return (a.version + '/' + a.setId).localeCompare(b.version + '/' + b.setId); });
      return { groups: groups, digest: ToolsStoreContract.hash(ToolsStoreContract.canonical(groups.map(function (g) { return [g.setId, g.version, g.title, g.digest]; }))) };
    }
  };
}

function teacherPythonPreviewRpc(action, input, expectedActorKey, origin) {
  try { return { ok: true, value: ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).rpc(action, input, origin) }; }
  catch (e) { return { ok: false, error: { code: e.previewCode || 'preview_unavailable', message: e.previewCode ? e.message : '問題データを取得できません。教員側の検証設定を確認してください。' } }; }
}
function doGet(e) {
  if (e && e.parameter && e.parameter.kind === 'schooltrial' && typeof renderSchoolTrial_ === 'function') return renderSchoolTrial_(e);
  try {
    var boot = ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).boot(e && e.parameter), template = HtmlService.createTemplateFromFile('21_python_editor_bridge');
    template.bootJson = JSON.stringify(boot).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029');
    return template.evaluate().setTitle('Pythonエディタ・教員用配布検証').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  } catch (e) { return HtmlService.createHtmlOutput('<p>教員用の問題配布検証へ接続できません。学校アカウントと検証設定を確認してください。</p>'); }
}
function previewToolsTeacherCatalog_() { return ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).preview(); }
function publishToolsTeacherCatalog_(input) { return ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).publish(input); }
function enableToolsTeacherPreview_(generation) { return ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).setEnabled(true, generation); }
function stopToolsTeacherPreview_() { return ToolsTeacherPreview.create(toolsTeacherPreviewEnvironment_()).setEnabled(false); }
