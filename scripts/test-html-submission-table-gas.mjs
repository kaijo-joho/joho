// 固定したGAS候補のclientを合成DOM/RPCで検証する。通信・生徒データ操作はしない。
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import test from 'node:test';
import assert from 'node:assert/strict';
import {setup,id,info,receipt} from './fixtures/html-submission-client.mjs';
import {updateSubmissionTable} from './prepare-html-submission-table-gas.mjs';
const stage=process.argv[2];assert(stage,'prepared grade directory required');
const html=fs.readFileSync(path.join(stage,'21_html_assignment_upload.html'),'utf8');
const boot={targetId:'html15-01',embedBridge:'b'.repeat(48)};
function connected(target=boot.targetId,more={}) {
  const h=setup(html,{boot:{...boot,targetId:target},...more});
  h.connect({localFeedback:'',receiptDisplay:'receipt-only-v1'});
  h.call('info').ok({...info(1),targetId:target,fileName:target+'.html'});h.replyFile({fileName:target+'.html'});return h;
}
function submit(h,target=boot.targetId,extra={}) {
  h.fire('uploadForm','submit');h.replyFile({fileName:target+'.html'});
  h.call('submitSaved').ok(receipt(7,{targetId:target,fileName:target+'.html',...extra}));return h;
}
test('確認待ちを含む4課題とHTML11でも、受領後は採点の星・リスト・待機を表示しない',()=>{
  for(const target of ['html11-01','html15-01','html15-02','html16-01','html17-01']){
    for(const gradingState of ['graded','needs_review','queued']){
      const h=submit(connected(target),target,{gradingState});
      assert.equal(h.elements.rules.hidden,true);assert.equal(h.elements.rules.children.length,0);
      assert.equal(h.elements.gradingProgress.hidden,true);assert.match(h.elements.state.textContent,/提出は完了/);
      assert.equal(h.elements.receipt.hidden,false);assert.equal(h.messages.filter(m=>m.data.type==='state').at(-1).data.phase,'received');
      if(gradingState==='queued')assert(h.call('process'),'表示を変えても従来のサーバー採点を止めない');
    }
  }
});
test('新指定なしの旧親・単独表示は従来の結果表示を保持する',()=>{
  const h=setup(html,{boot:{...boot,targetId:'html12-01'}});h.connect({localFeedback:''});h.ready();h.replyFile();h.fire('uploadForm','submit');h.replyFile();h.call('submitSaved').ok(receipt(7));
  assert.equal(h.elements.rules.hidden,false);assert(h.elements.rules.children.length);
  const standalone=setup(html);standalone.ready();standalone.choose();standalone.fire('uploadForm','submit');standalone.call('submit').ok(receipt(7));
  assert.equal(standalone.elements.rules.hidden,false);assert(standalone.elements.rules.children.length);
});
test('フォーム内で手動選択へ変えても、受領情報だけの表示指定を維持する',()=>{
  const h=setup(html,{boot});h.connect({receiptDisplay:'receipt-only-v1',fileTransfer:''});
  h.call('info').ok({...info(1),targetId:boot.targetId,fileName:boot.targetId+'.html'});h.choose(boot.targetId+'.html');h.fire('uploadForm','submit');
  h.call('submit').ok(receipt(7));assert.equal(h.elements.rules.hidden,true);assert.equal(h.elements.rules.children.length,0);
});
test('受領確定前の通信不明は完了扱いにせず、同じ要求IDの照会を残す',()=>{
  const h=connected();h.fire('uploadForm','submit');h.replyFile({fileName:boot.targetId+'.html'});h.call('submitSaved').fail({message:'synthetic network'});
  h.advance(300001);assert.equal(h.elements.receipt.hidden,true);assert.equal(h.elements.check.hidden,false);
  assert.equal(h.call('receipt').arg.requestId,id(1));assert.equal(h.call('submitSaved',1),undefined);
});
test('前回の不明受領は採点を見せず、今回の未提出案内と準備・再確認を残す',()=>{
  const storage=new Map([['joho.html.assignment.html15-01',JSON.stringify({requestId:id(8),submissionId:id(9),pending:true,embedBridge:'a'.repeat(48)})]]);
  const h=setup(html,{boot,storage});h.connect({localFeedback:'',receiptDisplay:'receipt-only-v1'});
  h.call('info').ok({...info(1),targetId:boot.targetId,fileName:boot.targetId+'.html'});h.call('receipt').ok(receipt(9,{targetId:boot.targetId}));
  assert.equal(h.elements.rules.hidden,true);assert.match(h.elements.state.textContent,/今回のファイルはまだ提出していません/);
  assert.equal(h.elements.prepareCurrent.hidden,false);assert.equal(h.elements.refresh.hidden,false);
});
test('受領後の採点応答が無応答なら、結果を隠したまま20秒後に同じ受領の再確認を残す',()=>{
  const h=submit(connected(),boot.targetId,{gradingState:'queued'});h.advance(19999);assert.equal(h.elements.refresh.hidden,true);
  h.advance(1);assert.equal(h.elements.gradingProgress.hidden,true);assert.equal(h.elements.refresh.hidden,false);
  assert.equal(h.elements.receipt.hidden,false);h.click('refresh');assert.equal(h.call('receipt').arg.submissionId,id(7));
  h.call('receipt').ok(receipt(7));assert.equal(h.elements.refresh.hidden,true);assert.equal(h.elements.rules.hidden,true);
  assert.equal(h.call('submitSaved',1),undefined);
});
test('受領後の自動照会が失敗して止まった場合も、同じ受領の再確認へ進める',()=>{
  const h=submit(connected(),boot.targetId,{gradingState:'queued'});h.call('process').fail({message:'synthetic'});
  h.advance(1000);h.call('receipt').fail({code:'receipt_missing'});
  assert.equal(h.elements.refresh.hidden,false);assert.equal(h.elements.gradingProgress.hidden,true);assert.equal(h.elements.rules.hidden,true);
  h.click('refresh');assert.equal(h.call('receipt',1).arg.submissionId,id(7));assert.equal(h.call('submitSaved',1),undefined);
});
test('再適用・未知のコピーを拒否し、採点用のサーバーコードも構文確認する',()=>{
  assert.throws(()=>updateSubmissionTable(html),/unexpected/);assert.throws(()=>updateSubmissionTable('<html></html>'),/unexpected/);
  for(const file of fs.readdirSync(stage).filter(n=>/\.(?:gs|js)$/.test(n)))new vm.Script(fs.readFileSync(path.join(stage,file),'utf8'),{filename:file});
  new vm.Script(html.match(/<script>([\s\S]*?)<\/script>/)[1]);
});
