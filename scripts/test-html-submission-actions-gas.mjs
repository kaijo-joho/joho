// node scripts/test-html-submission-actions-gas.mjs <prepared-grade-directory>
// Executes the exact candidate client with synthetic DOM/RPC/clock; no network or student records.
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,id,info,receipt} from './fixtures/html-submission-client.mjs';
import {updateSubmissionActions} from './prepare-html-submission-actions-gas.mjs';
const stage=process.argv[2];assert(stage,'prepared grade directory required');
const html=fs.readFileSync(path.join(stage,'21_html_assignment_upload.html'),'utf8');
const boot={targetId:'html12-01',embedBridge:'b'.repeat(48)};
function embedded(flag='complete-v1',options={}) {
  const h=setup(html,{boot,...options});h.connect({localFeedback:flag});h.ready();h.replyFile();return h;
}
function submit(h) { h.fire('uploadForm','submit');h.replyFile();return h.call('submitSaved'); }
function accept(h,extra={}) { submit(h).ok(receipt(7,extra));return h; }

test('保存済みファイル連携では選び直しを隠し、同じファイルの確認と送信は保持',()=>{
  const h=embedded();assert.equal(h.elements.manualSelect.hidden,true);
  assert.equal(h.elements.manualFile.hidden,true);assert.equal(h.elements.preparedFile.hidden,false);
  assert.equal(h.elements.preparedName.textContent,'html12-01.html');
  assert.equal(h.call('submitSaved'),undefined);assert.equal(h.call('submit'),undefined);
  assert.equal(submit(h).arg.text,'<h1>saved</h1>');
});
test('受渡しなし・単独ではOSのファイル選択と従来の提出経路を残す',()=>{
  const h=setup(html,{boot});h.connect({fileTransfer:''});h.ready();
  assert.equal(h.elements.manualFile.hidden,false);assert.equal(h.elements.htmlFile.required,true);
  h.choose();h.fire('uploadForm','submit');assert(h.call('submit'));assert.equal(h.call('submitSaved'),undefined);
  const standalone=setup(html);standalone.ready();standalone.choose();standalone.fire('uploadForm','submit');
  standalone.call('submit').ok(receipt(1));assert.equal(standalone.elements.again.hidden,false);
  assert.equal(standalone.elements.refresh.hidden,false);assert.equal(standalone.elements.receiptActions.hidden,false);
});
test('正常な連携受領後は内側の戻る・再確認を隠す。再提出待機と外側の閉じるを混同しない',()=>{
  const h=accept(embedded(),{nextSubmissionAt:'2026-09-26T06:01:00Z'});
  assert.equal(h.elements.again.hidden,true);assert.equal(h.elements.refresh.hidden,true);
  assert.equal(h.elements.refreshHelp.hidden,true);assert.equal(h.elements.receiptActions.hidden,true);
  assert.match(h.elements.state.textContent,/この画面を閉じてかまいません/);
  assert.equal(h.messages.filter(m=>m.data.type==='state').at(-1).data.phase,'received');
  assert.equal(h.call('download'),undefined);assert.equal(h.elements.receiptMore.open,false);
});
test('受領番号は詳細へ分離し、通常の情報は課題・ファイル・提出日時の3件だけ',()=>{
  const h=accept(embedded());
  assert.deepEqual(h.elements.receiptDetails.children.filter((_,i)=>i%2===0).map(n=>n.textContent),['課題名','ファイル名','提出日時']);
  assert.deepEqual(h.elements.receiptMeta.children.map(n=>n.textContent),['受領番号',id(7)]);
  assert.match(html,/<details id="receiptMore"><summary>詳細<\/summary><dl id="receiptMeta">/);
  const more=html.slice(html.indexOf('<details id="receiptMore">'),html.indexOf('</details>'));
  assert.match(more,/id="download"/);assert.match(more,/id="downloadStatus"/);
  assert.equal(html.match(/id="download"/g).length,1);
});
test('詳細は自動で開かず、同じ受領の非同期更新でも開閉状態を保持',()=>{
  const h=accept(embedded(),{gradingState:'queued'});h.elements.receiptMore.open=true;
  h.call('process').ok(receipt(7));assert.equal(h.elements.receiptMore.open,true);
  assert.equal(h.elements.receiptMeta.children.length,2);
  assert.equal(h.elements.rules.hidden,true);assert.equal(h.elements.refresh.hidden,true);
});
test('詳細の控え保存は自動実行せず、明示クリックの取得と失敗案内を残す',()=>{
  const h=accept(embedded());assert.equal(h.call('download'),undefined);
  h.elements.receiptMore.open=true;h.click('download');assert.equal(h.call('download').arg,id(7));
  assert.equal(h.elements.downloadStatus.hidden,false);h.call('download').fail({message:'synthetic'});
  assert.match(h.elements.downloadText.textContent,/提出は受け付けています/);
  assert.equal(h.elements.receipt.hidden,false);assert.equal(h.elements.receiptMore.open,true);
});
test('送信結果不明では確認操作と同じ要求IDを維持し、受付済みにしない',()=>{
  const h=embedded(),attempt=submit(h);
  assert.equal(h.elements.check.hidden,true);assert.equal(h.elements.newRequest.hidden,true);
  attempt.fail({message:'network'});assert.equal(h.elements.check.hidden,true);
  h.advance(300001);
  assert.equal(h.elements.receipt.hidden,true);assert.equal(h.elements.check.hidden,false);
  assert.equal(h.elements.newRequest.hidden,false);assert.equal(h.call('receipt').arg.requestId,id(1));
  assert.equal(h.elements.submit.disabled,true);assert.equal(h.call('submitSaved',1),undefined);
});
test('前回の不明受領を確認した場合は、今回の提出と混ぜず復旧操作を残す',()=>{
  const storage=new Map([['joho.html.assignment.html12-01',JSON.stringify({requestId:id(8),submissionId:id(9),pending:true,embedBridge:'a'.repeat(48)})]]);
  const h=embedded('complete-v1',{storage});h.call('receipt').ok(receipt(9));
  assert.equal(h.elements.previousNotice.hidden,false);assert.equal(h.elements.prepareCurrent.hidden,false);
  assert.equal(h.elements.refresh.hidden,false);assert.equal(h.elements.again.hidden,true);
  assert.equal(h.call('submitSaved'),undefined);
});
test('ローカル採点がない場合も従来の星を維持し、サーバー確認中断時は再確認を表示',()=>{
  const h=accept(embedded(''),{gradingState:'queued'});h.call('process').fail({message:'synthetic'});
  assert.equal(h.elements.refresh.hidden,true);h.advance(1000);
  h.call('receipt').fail({code:'receipt_missing'});
  assert.equal(h.elements.refresh.hidden,false);assert.equal(h.elements.refreshHelp.hidden,false);
  assert.equal(h.elements.receiptActions.hidden,false);h.click('refresh');
  h.call('receipt',1).ok(receipt(7));assert.equal(h.elements.rules.hidden,false);
  assert(h.elements.rules.children.length);assert.equal(h.elements.refresh.hidden,true);
});
test('サーバー採点要求が無応答でも20秒後に照会を表示し、遅い採点応答で確定結果を戻さない',()=>{
  const h=accept(embedded(''),{gradingState:'queued'});assert(h.call('process'));
  h.advance(19999);assert.equal(h.elements.refresh.hidden,true);
  h.advance(1);assert.equal(h.elements.refresh.hidden,false);assert.equal(h.elements.refresh.disabled,false);
  assert.equal(h.elements.receipt.hidden,false);h.click('refresh');
  assert.equal(h.call('receipt').arg.submissionId,id(7));h.call('receipt').ok(receipt(7));
  h.call('process').ok(receipt(7,{gradingState:'queued'}));
  assert(h.elements.rules.children.length);assert.equal(h.elements.gradingProgress.hidden,true);
  assert.equal(h.elements.refresh.hidden,true);assert.equal(h.call('submitSaved',1),undefined);
});
test('完全な端末内結果を表示済みなら、サーバー採点が無応答でも通常の簡潔な受領を維持',()=>{
  const h=accept(embedded(),{gradingState:'queued'});h.advance(300001);
  assert.equal(h.elements.refresh.hidden,true);assert.equal(h.elements.again.hidden,true);
  assert.equal(h.elements.gradingProgress.hidden,true);assert.equal(h.elements.receipt.hidden,false);
  assert.equal(h.messages.filter(m=>m.data.type==='state').at(-1).data.phase,'received');
});
test('HTML11の受領後だけの星と、HTML11のファイル選択なし連携を保持',()=>{
  const b={...boot,targetId:'html11-01'},h=setup(html,{boot:b});h.connect({localFeedback:''});
  h.call('info').ok({...info(1),targetId:b.targetId,fileName:b.targetId+'.html'});
  h.replyFile({fileName:b.targetId+'.html'});assert.equal(h.elements.manualSelect.hidden,true);
  h.fire('uploadForm','submit');h.replyFile({fileName:b.targetId+'.html'});
  h.call('submitSaved').ok(receipt(7,{targetId:b.targetId,fileName:b.targetId+'.html'}));
  assert.equal(h.elements.rules.hidden,false);assert(h.elements.rules.children.length);
  assert.equal(h.elements.again.hidden,true);assert.equal(h.elements.refresh.hidden,true);
});
test('再適用・未知のコピーを停止し、全サーバーとclientの構文を確認',()=>{
  assert.throws(()=>updateSubmissionActions(html),/unexpected/);
  assert.throws(()=>updateSubmissionActions('<html></html>'),/unexpected/);
  const files=fs.readdirSync(stage).filter(n=>/\.(js|gs)$/.test(n));
  for(const file of files)new vm.Script(fs.readFileSync(path.join(stage,file),'utf8'),{filename:file});
  new vm.Script(files.map(n=>fs.readFileSync(path.join(stage,n),'utf8')).join('\n;\n'));
  new vm.Script(html.match(/<script>\s*([\s\S]*?)<\/script>/)[1]);
  console.log('GAS JavaScript syntax passed: '+files.length);
});
