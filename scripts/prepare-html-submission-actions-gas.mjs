// 読取済みgradeの隔離コピーへ、提出画面と記録だけを適用する。外部への書込みは行わない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export function updateSubmissionActions(source) {
  function replace(before,after) {
    assert.equal(source.split(before).length,2,'unexpected submission actions source: '+before.slice(0,80));
    source=source.replace(before,after);
  }
  replace('    .star.correct{color:#ffc107}',
    '    .star.correct{color:#ffc107}\n'+
    '    #receiptMore{margin-top:1rem;border-top:1px solid var(--line);padding-top:.4rem}\n'+
    '    #receiptMore>summary{width:fit-content;min-height:44px;padding:.45rem 0;cursor:pointer;color:var(--muted)}');
  replace('<div class="actions"><button id="again"', '<div id="receiptActions" class="actions"><button id="again"');
  replace('<button id="download" type="button">控えを保存</button></div>\n    <p id="downloadStatus"',
    '</div>\n    <details id="receiptMore"><summary>詳細</summary><dl id="receiptMeta"></dl>'+
    '<p class="note">必要なときは、提出した時点の実習ファイルを取り戻せます。</p>'+
    '<div class="actions"><button id="download" type="button">控えを保存</button></div>\n    <p id="downloadStatus"');
  replace('  </section><noscript>', '    </details>\n  </section><noscript>');
  replace("var gradingTimer=null,gradingMode='',gradingEpoch=0,downloadTimer=null,downloadEpoch=0;",
    "var gradingTimer=null,gradingMode='',gradingEpoch=0,downloadTimer=null,downloadEpoch=0,gradingRecovery=false;");
  replace("確認に時間がかかっています。提出は受け付けていますので、再提出せずこのままお待ちください。",
    "確認に時間がかかっています。提出は受け付けています。「受領状況を再確認」で確認できます。ファイルは再送しません。");
  replace("      },20000);\n    }\n    function downloadStatus(mode){",
    "        // 採点要求が無応答でも、同じ受領の照会だけは利用できるようにする。\n"+
    "        gradingRecovery=true;controls();\n"+
    "      },20000);\n    }\n    function downloadStatus(mode){");
  replace("      $('manualSelect').disabled=busy||Boolean(latest)||outcomeUnknown;",
    "      $('manualSelect').disabled=busy||Boolean(latest)||outcomeUnknown;\n"+
    "      // 同じ保存済みファイルを使う通常連携では、別ファイルへの選び直しを置かない。\n"+
    "      $('manualSelect').hidden=integrated&&transfer;\n"+
    "      $('again').hidden=integrated;");
  replace("      $('refresh').disabled=busy||checking||!latest;",
    "      $('refresh').disabled=busy||checking||!latest;\n"+
    "      // 正常受領後は外側の閉じるだけ。旧受領・照会失敗・自動採点確認の中断には復旧を残す。\n"+
    "      var receiptRecovery=previousReceipt||Boolean(receiptNotice)||Boolean(latest&&!compact&&pending(latest)&&(gradingRecovery||!processing&&!gradingPolling&&!gradingPollChecking));\n"+
    "      $('refresh').hidden=integrated&&!receiptRecovery;\n"+
    "      $('receiptActions').hidden=$('again').hidden&&$('refresh').hidden;");
  replace("      if(integrated){$('intake').hidden=Boolean(latest);$('check').hidden=!outcomeUnknown;$('newRequest').hidden=!outcomeUnknown;}",
    "      if(integrated){\n"+
    "        $('intake').hidden=Boolean(latest);\n"+
    "        // 送信・自動照会中には復旧ボタンを並べず、手動確認が必要になったときだけ出す。\n"+
    "        var submissionRecovery=outcomeUnknown&&!busy;\n"+
    "        $('check').hidden=!submissionRecovery;$('newRequest').hidden=!submissionRecovery;\n"+
    "      }");
  replace("if(compact)$('state').textContent=receiptNotice||'提出は完了しています。編集へ戻ってかまいません。';",
    "if(compact)$('state').textContent=receiptNotice||'提出は完了しています。この画面を閉じてかまいません。';");
  replace('    function field(label,value){', '    function field(label,value,container){');
  replace("dt.textContent=label;dd.textContent=value||'—';$('receiptDetails').append(dt,dd);",
    "dt.textContent=label;dd.textContent=value||'—';$(container||'receiptDetails').append(dt,dd);");
  replace("      latest=record;outcomeUnknown=false;receiptNotice='';",
    "      if(!latest||latest.submissionId!==record.submissionId){$('receiptMore').open=false;gradingRecovery=false;}\n"+
    "      latest=record;outcomeUnknown=false;receiptNotice='';");
  replace("      $('receipt').hidden=false;$('receiptDetails').replaceChildren();",
    "      $('receipt').hidden=false;$('receiptDetails').replaceChildren();$('receiptMeta').replaceChildren();");
  replace("      field('受領番号',record.submissionId);", "      field('受領番号',record.submissionId,'receiptMeta');");
  return source;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [beforeArg,stageArg,controlArg,stamp]=process.argv.slice(2);
  assert(beforeArg&&stageArg&&controlArg&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp||''),'before stage control timestamp required');
  const before=path.resolve(beforeArg),stage=path.resolve(stageArg);
  assert.notEqual(before,stage);assert(fs.existsSync(before+'/appsscript.json'));
  fs.mkdirSync(stage,{recursive:true});assert.equal(fs.readdirSync(stage).length,0,'stage must be empty');
  const files=fs.readdirSync(before).filter(n=>/\.(js|gs|html)$/.test(n)||n==='appsscript.json');
  for(const file of files)fs.copyFileSync(path.join(before,file),path.join(stage,file));
  const file='21_html_assignment_upload.html';
  fs.writeFileSync(stage+'/'+file,updateSubmissionActions(fs.readFileSync(before+'/'+file,'utf8')));
  for(const name of ['_CHANGELOG.html','_OVERVIEW.html']) {
    fs.appendFileSync(stage+'/'+name,'\n'+(name==='_CHANGELOG.html'?stamp+' | Codex | ':'')+
      'HTML提出画面の通常連携ではファイル選び直しと内側の編集へ戻るを非表示、正常受領後の再確認を必要時だけ表示。受領番号と控え保存を詳細へ集約。別タブ・手動選択・通信不明・従来採点の復旧操作と受付/採点/転記は保持。\n');
  }
  const control=JSON.parse(fs.readFileSync(controlArg,'utf8'));
  control.rootDir='.';control.skipSubdirectories=true;
  assert(control.filePushOrder?.length,'verified remote file order required');
  control.filePushOrder=control.filePushOrder.map(n=>path.basename(n));
  assert.deepEqual([...control.filePushOrder].sort(),[...files].sort(),'file order must match read snapshot');
  fs.writeFileSync(stage+'/.clasp.json',JSON.stringify(control,null,2)+'\n');
  console.log(JSON.stringify({stage,files:files.length,changed:[file,'_CHANGELOG.html','_OVERVIEW.html'],manifestUnchanged:true,remoteWrites:false}));
}
