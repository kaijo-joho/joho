// gradeの読取コピーに画面差分だけを適用する。push/deploy/GSS操作は行わない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export function updateSubmissionForm(source) {
  function replace(old,next) {
    assert.equal(source.split(old).length,2,'unexpected submission form source: '+old.slice(0,80));
    source=source.replace(old,next);
  }
  replace('<p id="progress" class="progress" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span id="progressText">提出フォームを準備しています。このままお待ちください。</span></p>',
    '<div id="formProgress"><p id="progress" class="progress" role="status" aria-live="polite"><span class="spinner" aria-hidden="true"></span><span id="progressText">提出フォームを準備しています。このままお待ちください。</span></p></div>');
  replace('</div></form><p id="message"','</div><div id="submitProgress"></div></form><p id="message"');
  replace("var integrated=false,transfer=false,editorFile=null,filePending='',fileTimer=null,fileEpoch=0,previousReceipt=false;",
    "var integrated=false,transfer=false,editorFile=null,filePending='',fileTimer=null,fileEpoch=0,previousReceipt=false,localFeedback=false,receiptNotice='';");
  replace('    function frameState(){\n      report(',
    '    // 端末内で全項目を表示済み、同じ固定ファイル、今回の受領だけ。HTML11/手動/前回の受領は従来表示。\n'+
    "    function compactReceipt(){return Boolean(integrated&&transfer&&localFeedback&&latest&&!previousReceipt&&boot.targetId!=='html11-01');}\n"+
    '    function frameState(){\n      report(');
  replace("checking?'checking':gradingPollChecking?'grading':downloading?'downloading':\n        latest?(previousReceipt?'previous-received':processing?'grading':'received')",
    "checking?'checking':gradingPollChecking&&!compactReceipt()?'grading':downloading?'downloading':\n        latest?(previousReceipt?'previous-received':processing&&!compactReceipt()?'grading':'received')");
  replace("      progressMode=mode;clearTimeout(progressTimer);$('progress').hidden=!mode;",
    "      progressMode=mode;clearTimeout(progressTimer);$('progress').hidden=!mode;\n"+
    "      // 読込は上、送信クリック後の案内は提出ボタンの直下へ。同じstatus要素を移す。\n"+
    "      var below=!$('uploadForm').hidden&&(mode==='sending'||mode==='checking'||mode==='preparing'&&filePending==='submit');\n"+
    "      $(below?'submitProgress':'formProgress').append($('progress'));");
  replace('    function gradingProgress(mode){\n      if(mode===gradingMode)return;',
    "    function gradingProgress(mode){\n      if(compactReceipt())mode='';\n      if(mode===gradingMode)return;");
  replace("      if(integrated)$('retry').hidden=!previousReceipt;",
    "      if(integrated)$('retry').hidden=!previousReceipt;\n"+
    "      var compact=compactReceipt();$('rules').hidden=compact;\n"+
    "      if(compact)$('state').textContent=receiptNotice||'提出は完了しています。編集へ戻ってかまいません。';\n"+
    "      $('refreshTip').textContent=compact?'この受領番号の受付状況を再確認します。ファイルは再送しません。修正したファイルを提出するときは、編集へ戻って提出し直してください。':'この受領番号の受付状況と採点結果を再確認します。修正したファイルの再提出にはなりません。';");
  replace("      latest=record;outcomeUnknown=false;","      latest=record;outcomeUnknown=false;receiptNotice='';");
  replace("      (record.rules||[]).forEach(function(rule){","      if(!compactReceipt())(record.rules||[]).forEach(function(rule){");
  replace("        if(latest)$('state').textContent='受領状況を更新できませんでした。表示中の提出は受け付けています。時間を置いて再確認してください。';",
    "        if(latest){receiptNotice='受領状況を更新できませんでした。表示中の提出は受け付けています。時間を置いて再確認してください。';$('state').textContent=receiptNotice;}");
  replace("      transfer=false;editorFile=null;clearTimeout(fileTimer);",
    "      transfer=false;localFeedback=false;editorFile=null;clearTimeout(fileTimer);\n"+
    "      if(connected)window.top.postMessage({channel:channel,type:'file-mode',bridge:boot.embedBridge,targetId:boot.targetId,mode:'manual'},editorOrigin);");
  replace("      if(connected){if(data.type==='saved-file'||data.type==='file-unavailable')receiveFile(data);return;}",
    "      if(connected){\n"+
    "        if(data.type==='saved-file'||data.type==='file-unavailable')receiveFile(data);\n"+
    "        else if(data.type==='local-feedback'&&integrated&&transfer&&(data.localFeedback===''||data.localFeedback==='complete-v1')){\n"+
    "          localFeedback=data.localFeedback==='complete-v1';controls();\n"+
    "        }\n        return;\n      }");
  replace("      integrated=data.layout==='integrated-v1';transfer=data.fileTransfer===transferProtocol;",
    "      integrated=data.layout==='integrated-v1';transfer=data.fileTransfer===transferProtocol;\n"+
    "      localFeedback=integrated&&transfer&&data.localFeedback==='complete-v1';");
  return source;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  const [beforeArg,stageArg,controlArg,stamp]=process.argv.slice(2);
  assert(beforeArg&&stageArg&&controlArg&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp||''),'before stage control timestamp required');
  const before=path.resolve(beforeArg),stage=path.resolve(stageArg);
  assert.notEqual(before,stage);assert(fs.existsSync(before+'/appsscript.json'));
  fs.mkdirSync(stage,{recursive:true});assert.equal(fs.readdirSync(stage).length,0,'stage must be empty');
  const files=fs.readdirSync(before).filter(n=>/\.(js|gs|html)$/.test(n)||n==='appsscript.json');
  for(const file of files)fs.copyFileSync(path.join(before,file),path.join(stage,file));
  const file='21_html_assignment_upload.html';
  fs.writeFileSync(path.join(stage,file),updateSubmissionForm(fs.readFileSync(path.join(before,file),'utf8')));
  for(const name of ['_CHANGELOG.html','_OVERVIEW.html']){
    fs.appendFileSync(path.join(stage,name),'\n'+(name==='_CHANGELOG.html'?stamp+' | Codex | ':'')+'HTMLの送信中案内を提出ボタン下へ移動。信頼済みエディタで同じ保存済みファイルの全項目を表示した場合のみ、受領後の星と採点待ちを重複表示しない。単独・手動選択・HTML11・前回の受領は従来表示。受付・採点・再試行は不変。\n');
  }
  const control=JSON.parse(fs.readFileSync(controlArg,'utf8'));
  control.rootDir='.';control.skipSubdirectories=true;
  const order=control.filePushOrder?.length?control.filePushOrder.map(n=>path.basename(n)):files;
  assert.deepEqual([...order].sort(),[...files].sort(),'file order must match read snapshot');
  control.filePushOrder=order;
  fs.writeFileSync(stage+'/.clasp.json',JSON.stringify(control,null,2)+'\n');
  console.log(JSON.stringify({stage,files:files.length,changed:[file,'_CHANGELOG.html','_OVERVIEW.html'],manifestUnchanged:true,remoteWrites:false}));
}
