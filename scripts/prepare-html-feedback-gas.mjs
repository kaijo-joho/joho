// gradeの現行コピーから表示更新候補を作るだけ。push・公開・GSS操作は行わない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
const site = path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const [beforeArg,stageArg,controlArg,stamp] = process.argv.slice(2);
assert(beforeArg && stageArg && controlArg && /^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp || ''),'before stage .clasp.json timestamp required');
const before = path.resolve(beforeArg), stage = path.resolve(stageArg);
assert.notEqual(before,stage); assert(fs.existsSync(before+'/appsscript.json'));
fs.mkdirSync(stage,{recursive:true}); assert.equal(fs.readdirSync(stage).length,0,'stage must be empty');
for (const file of fs.readdirSync(before).filter(f=>/\.(?:js|gs|html)$/.test(f) || f==='appsscript.json')) fs.copyFileSync(path.join(before,file),path.join(stage,file));
function replace(file,old,next) {
  const text = fs.readFileSync(path.join(stage,file),'utf8');
  assert.equal(text.split(old).length,2,'unexpected source: '+file);
  fs.writeFileSync(path.join(stage,file),text.replace(old,next));
}
const js = fs.readFileSync(path.join(site,'tools/htmleditor/feedback.js'),'utf8');
const css = fs.readFileSync(path.join(site,'tools/htmleditor/feedback.css'),'utf8');
assert(!/<\/script/i.test(js) && !/<\/style/i.test(css));
fs.writeFileSync(stage+'/58_html_grading_feedback.js',js);
fs.writeFileSync(stage+'/23_html_grading_feedback.html','<!-- Generated from tools/htmleditor/feedback.{js,css}. -->\n<style>\n'+css+'</style>\n<script>\n'+js+'</script>\n');
replace('40_html_grade_store.js',
  '          write(t, columns(r), row._row);\n          return r;\n        });\n      },\n      retryRun:',
  '          // 採点値は不変。写真/対象別の表示要約だけを同じ受領行へ残し、追加のDrive読取は行わない。\n'+
  '          var feedback = HtmlGradingFeedback.build(result);\n          if (feedback) r.result.feedback = feedback;\n'+
  '          write(t, columns(r), row._row);\n          return r;\n        });\n      },\n      retryRun:');
replace('48_html_assignment_presenter.js',
  "      gradingState: text(record && record.gradingState), rules: sourceRules.map(function (rule) { return ruleView(rule, graded); })",
  "      gradingState: text(record && record.gradingState), rules: sourceRules.map(function (rule) { return ruleView(rule, graded); }),\n"+
  "      feedback: graded ? HtmlGradingFeedback.publicView(record && record.result && record.result.feedback, text(record && record.assignmentId)) : null");
replace('21_html_assignment_upload.html','<ul id="rules" class="stars"></ul>','<div id="checkpointResults"></div><ul id="rules" class="stars"></ul>');
replace('21_html_assignment_upload.html',"      (record.rules||[]).forEach(function(rule){",
  "      HtmlGradingFeedback.dispose($('checkpointResults'));\n      $('checkpointResults').replaceChildren();\n"+
  "      var feedback = record.gradingState==='graded' && HtmlGradingFeedback.publicView(record.feedback,record.targetId);\n"+
  "      var table = feedback && HtmlGradingFeedback.render(feedback,document);\n"+
  "      if(table)$('checkpointResults').append(table);\n"+
  "      if(!table)(record.rules||[]).forEach(function(rule){");
replace('21_html_assignment_upload.html','<script>\n  (function(){',"<?!= HtmlService.createHtmlOutputFromFile('23_html_grading_feedback').getContent() ?>\n<script>\n  (function(){");
for (const file of ['_CHANGELOG.html','_OVERVIEW.html']) {
  fs.appendFileSync(path.join(stage,file),'\n'+(file==='_CHANGELOG.html'?stamp+' | Codex | ':'')+'HTML対象別の星表を追加。凍結採点・配点・過去の採点結果は不変。新しい受領には位置や点数を含まない表示要約を残し、旧集計は従来表示を維持。\n');
}
const control = JSON.parse(fs.readFileSync(controlArg));
control.rootDir = '.'; control.skipSubdirectories = true;
// 取得時に空だった順序は既存ファイルをそのまま列挙し、新規表示部品だけ末尾へ加える。
const files = fs.readdirSync(stage).filter(f=>/\.(?:js|gs|html)$/.test(f)||f==='appsscript.json');
control.filePushOrder = control.filePushOrder?.length ? [...control.filePushOrder,...files.filter(f=>!control.filePushOrder.includes(f))] : files;
assert.deepEqual([...control.filePushOrder].sort(),files.sort());
fs.writeFileSync(stage+'/.clasp.json',JSON.stringify(control,null,2)+'\n');
console.log(JSON.stringify({stage,files:files.length,added:['58_html_grading_feedback.js','23_html_grading_feedback.html'],changed:['40_html_grade_store.js','48_html_assignment_presenter.js','21_html_assignment_upload.html','_CHANGELOG.html','_OVERVIEW.html'],manifestUnchanged:true,remoteWrites:false}));
