// 読取済みgradeのコピーへ表示差分だけを適用する。push/deploy/GSS操作は行わない。
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';

export function updateSubmissionTable(source) {
  function replace(before,after) {
    assert.equal(source.split(before).length,2,'unexpected submission table source: '+before.slice(0,80));
    source=source.replace(before,after);
  }
  replace("localFeedback=false,receiptNotice='';","localFeedback=false,receiptNotice='',receiptOnly=false;");
  replace("function compactReceipt(){return Boolean(integrated&&transfer&&localFeedback&&latest&&!previousReceipt&&boot.targetId!=='html11-01');}",
    "function compactReceipt(){return Boolean(integrated&&latest&&(receiptOnly||transfer&&localFeedback&&!previousReceipt&&boot.targetId!=='html11-01'));}");
  replace("      localFeedback=integrated&&transfer&&data.localFeedback==='complete-v1';",
    "      localFeedback=integrated&&transfer&&data.localFeedback==='complete-v1';\n"+
    "      // 表示の希望だけ。採点完了・受領・本人確認・受付許可の根拠には使わない。\n"+
    "      receiptOnly=integrated&&data.receiptDisplay==='receipt-only-v1';");
  replace("layout:'integrated-v1'},editorOrigin);",
    "layout:'integrated-v1',receiptDisplay:receiptOnly?'receipt-only-v1':''},editorOrigin);");
  replace("if(compact)$('state').textContent=receiptNotice||'提出は完了しています。この画面を閉じてかまいません。';",
    "if(compact)$('state').textContent=receiptNotice||(previousReceipt?'前回の提出は受け付けています。今回のファイルはまだ提出していません。':'提出は完了しています。この画面を閉じてかまいません。');");
  return source;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  const [beforeArg,stageArg,stamp]=process.argv.slice(2);
  assert(beforeArg&&stageArg&&/^\d{4}-\d\d-\d\d \d\d:\d\d:\d\d$/.test(stamp||''),'before stage timestamp required');
  const before=path.resolve(beforeArg),stage=path.resolve(stageArg);
  assert.notEqual(before,stage);assert(fs.existsSync(before+'/appsscript.json'));
  fs.mkdirSync(stage,{recursive:true});assert.equal(fs.readdirSync(stage).length,0,'stage must be empty');
  const control=JSON.parse(fs.readFileSync(before+'/.clasp.json','utf8'));
  const files=control.filePushOrder;assert(Array.isArray(files)&&files.length);
  for(const file of files){assert.equal(path.basename(file),file);fs.copyFileSync(before+'/'+file,stage+'/'+file);}
  fs.writeFileSync(stage+'/21_html_assignment_upload.html',updateSubmissionTable(fs.readFileSync(before+'/21_html_assignment_upload.html','utf8')));
  for(const name of ['_CHANGELOG.html','_OVERVIEW.html'])fs.appendFileSync(stage+'/'+name,'\n'+(name==='_CHANGELOG.html'?stamp+' | Codex | ':'')+
    'HTMLエディタの新しい受領情報表示指定では、確認待ち・手動選択・HTML11も受領情報のみ表示。旧親・単独表示、採点本体・保存・受付条件・不明受領の復旧は維持。\n');
  fs.writeFileSync(stage+'/.clasp.json',JSON.stringify(control,null,2)+'\n');
  console.log(JSON.stringify({stage,files:files.length,changed:['21_html_assignment_upload.html','_CHANGELOG.html','_OVERVIEW.html'],remoteWrites:false}));
}
