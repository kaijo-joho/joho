// HTML v3の新規取得専用。可否だけを読み、原本・本人情報の発行や記録は行わない。
var HtmlDownloadAvailability = (function () {
  'use strict';
  var DISTRIBUTION_KEYS = ['id','status','release','g1','g2','g3','g4','g5','g6','distributionMode','submitBackend'];
  var TASK_KEYS = ['year','grade','item','targetId','status','startAt'];
  function fail(code) { var error = new Error(code); error.htmlDownloadCode = code; throw error; }
  function yes(value, code) { if (!value) fail(code || 'availability_unavailable'); }
  function exact(value, keys) {
    yes(value && Object.prototype.toString.call(value) === '[object Object]' &&
      Object.keys(value).sort().join(',') === keys.slice().sort().join(','), 'request_invalid');
  }
  function noFormulas(row, keys) {
    yes(!(row._formulaKeys || []).some(function (key) { return keys.indexOf(key) >= 0; }));
  }
  function date(value) {
    if (Object.prototype.toString.call(value) === '[object Date]') {
      yes(Number.isFinite(value.getTime())); return value.toISOString();
    }
    yes(typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/.test(value) &&
      Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value);
    return value;
  }
  function year(at) {
    var d = new Date(Date.parse(at) + 9 * 3600000);
    return d.getUTCFullYear() - (d.getUTCMonth() < 3 ? 1 : 0);
  }
  function assess(input, context) {
    try {
      var c = context || {}, actor = c.actor;
      yes(HtmlPracticeCatalog.targets.indexOf(c.targetId) >= 0, 'request_invalid');
      yes(actor && /^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(actor.email) &&
        Number.isInteger(actor.grade) && actor.grade >= 1 && actor.grade <= 6, 'not_allowed');
      yes(c.maintenanceBlocked === false, 'maintenance_blocked');
      yes(input && input.config && typeof input.config.enabled === 'boolean' && typeof input.config.distributionEnabled === 'boolean');
      var teacher = c.teacherPreview === true && actor.email === 'informatics@gfe.kaijo.ed.jp';
      yes(teacher || input.config.enabled && input.config.distributionEnabled, 'distribution_disabled');
      yes(Array.isArray(input.distributions) && input.distributions.length <= 2000 && Array.isArray(input.tasks) && input.tasks.length <= 2000);
      var now = date(c.now), fiscalYear = year(now);
      var distributions = input.distributions.filter(function (row) { return row.id === c.targetId; });
      yes(distributions.length === 1);
      var d = distributions[0]; noFormulas(d, DISTRIBUTION_KEYS);
      yes(['draft','inactive','active','retired'].indexOf(d.status) >= 0 && typeof d.release === 'boolean' &&
        d.distributionMode === 'personal-html-v2' && d.submitBackend === 'grade');
      for (var i = 1; i <= 6; i++) yes(d['g' + i] === false || d['g' + i] === 'TASK');
      yes(teacher || d.status === 'active' && d.release === true && d['g' + actor.grade] === 'TASK', 'not_released');
      var tasks = input.tasks.filter(function (row) {
        return row.item === 'html' && row.targetId === c.targetId && row.year === fiscalYear && (teacher || row.grade === actor.grade);
      });
      yes(tasks.length === 1, 'not_configured');
      var task = tasks[0]; noFormulas(task, TASK_KEYS);
      yes(Number.isInteger(task.year) && Number.isInteger(task.grade) && task.grade >= 1 && task.grade <= 6 &&
        ['active','practice','closed','draft'].indexOf(task.status) >= 0);
      var start = date(task.startAt); yes(year(start) === fiscalYear);
      yes(teacher || task.status === 'active' || task.status === 'practice', 'task_closed');
      if (!teacher && now < start) return {v:1,targetId:c.targetId,allowed:false,reason:'before_start',startAt:start};
      // Colab等のTASK配付と同じ開始判定。提出フラグ・採点モード・提出期限は使わない。
      return {v:1,targetId:c.targetId,allowed:true};
    } catch (error) {
      if (!error.htmlDownloadCode) throw error;
      return {v:1,targetId:context && context.targetId,allowed:false,reason:error.htmlDownloadCode};
    }
  }
  function readSettings() {
    var config = HtmlAssignmentRuntime.config(), book = SpreadsheetApp.openById(Common.SSID.fileList);
    function rows(name, keys) {
      var sheet = book.getSheetByName(name);
      yes(sheet && sheet.getLastRow() >= 1 && sheet.getLastRow() <= 2001 && sheet.getLastColumn() >= 1 && sheet.getLastColumn() <= 64);
      var range = sheet.getRange(1,1,sheet.getLastRow(),sheet.getLastColumn());
      return HtmlAssignmentPolicy.records(range.getValues(), keys, range.getFormulas());
    }
    return {config:config,distributions:rows('配布設定一覧',DISTRIBUTION_KEYS),tasks:rows('課題設定',TASK_KEYS)};
  }
  function request(value) {
    exact(value,['bridge','nonce','identity','targetId']);
    yes(typeof value.bridge === 'string' && /^[a-f0-9]{48}$/.test(value.bridge) &&
      typeof value.nonce === 'string' && /^[a-f0-9]{32}$/.test(value.nonce) &&
      typeof value.identity === 'string' && value.identity.length < 16384 && HtmlPracticeCatalog.targets.indexOf(value.targetId) >= 0, 'request_invalid');
    return value;
  }
  function check(value, dependencies) {
    var q = request(value), env = dependencies || {
      verify: function (identity) { return HtmlLocalProtocol.verifyIdentity(identity, HtmlIdentityRuntime.env()); },
      teacher: function (actor) {
        return actor.email === 'informatics@gfe.kaijo.ed.jp' && HtmlPracticeTeacher.allowed(HtmlPracticeTeacher.identity());
      },
      read: readSettings, now: function () { return new Date().toISOString(); },
      maintenance: function () { return DistMaintenance.shouldBlock({parameter:{}}) !== false; }
    };
    var verified = env.verify(q.identity), actor = verified.actor;
    var result = assess(env.read(), {actor:actor,targetId:q.targetId,now:env.now(),
      teacherPreview:env.teacher(actor),maintenanceBlocked:env.maintenance()});
    return {nonce:q.nonce,result:result};
  }
  function render(parameters) {
    yes(parameters && parameters.type === 'htmlDownload' && parameters.embed === 'html-editor' &&
      typeof parameters.bridge === 'string' && /^[a-f0-9]{48}$/.test(parameters.bridge) && !parameters.target && !parameters.fileId && !parameters.ans, 'request_invalid');
    var page = HtmlService.createTemplateFromFile('25_htmlDownloadAvailability');
    page.bootJson = serializeForInlineScript_({bridge:parameters.bridge});
    return page.evaluate().setTitle('実習ファイルの配付確認').setFaviconUrl(Common.FAVICON_URL)
      .addMetaTag('viewport','width=device-width,initial-scale=1').setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL);
  }
  return {assess:assess,check:check,render:render};
})();

function getHtmlDownloadAvailabilityV3(request) {
  try { return HtmlDownloadAvailability.check(request); }
  catch (error) {
    // GSS例外、本人情報、ID、署名・鍵を画面やログへ出さない。
    throw new Error('availability_unavailable');
  }
}
