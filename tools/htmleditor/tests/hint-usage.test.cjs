const test = require('node:test');
const assert = require('node:assert/strict');
const Usage = require('../hint-usage.js');
function memory(initial = {}) {
  const values = new Map(Object.entries(initial));
  return {values, get length() { return values.size; }, key:i => [...values.keys()][i],
    getItem:k => values.get(k) || null, setItem:(k,v) => values.set(k,v), removeItem:k => values.delete(k)};
}
const config = {fileKey:'a'.repeat(32), targetId:'html12-01', fileName:'html12-01.html', validatorVersion:'classroom-html-css-1', now:() => 1700000000000};
test('同意前や自動検査では記録を作らず、実際に開いたヒントだけ記録する', () => {
  const storage = memory(), tracker = Usage.create(storage, config);
  assert.equal(storage.length, 0);
  assert.deepEqual(tracker.snapshot(), {v:1,status:'not-recorded'});
  assert.equal(tracker.record('locations'), false);
  assert.equal(storage.length, 0);
  tracker.consent(); tracker.record('locations'); tracker.record('detail', {line:5,code:'html-unclosed-tag',message:'本文は記録しない'});
  const result = tracker.snapshot();
  assert.equal(result.locationRequests, 1); assert.equal(result.detailRequests, 1);
  assert.deepEqual(result.events[1], {kind:'detail',at:1700000000000,line:5,code:'html-unclosed-tag'});
  assert.equal(JSON.stringify(result).includes('本文'), false);
});
test('同じファイルの再読込で継続し、再取得した別ファイルとは混ざらない', () => {
  const storage = memory(), first = Usage.create(storage, config);
  first.consent(); first.record('locations');
  const reopened = Usage.create(storage, config);
  assert.equal(reopened.hasConsent(), true); reopened.record('detail',{line:2,code:'html-tag-name'});
  assert.equal(reopened.snapshot().locationRequests, 1);
  assert.deepEqual(Usage.create(storage,{...config,fileKey:'b'.repeat(32)}).snapshot(), {v:1,status:'not-recorded'});
});
test('保存失敗・破損・未記録を0回や未使用の証明としない', () => {
  assert.deepEqual(Usage.normalize(null,config.targetId,config.fileName),{v:1,status:'not-recorded'});
  const fail = {getItem() { throw Error(); },setItem() { throw Error(); }};
  const tracker = Usage.create(fail,config); tracker.consent(); tracker.record('locations');
  assert.equal(tracker.snapshot().status, 'partial'); assert.equal(tracker.snapshot().locationRequests, 1);
  const storage = memory({['joho.htmleditor.hints.v1:html12-01:'+'a'.repeat(32)]:'bad'});
  const corrupt = Usage.create(storage,config);
  assert.deepEqual(corrupt.snapshot(), {v:1,status:'not-recorded'});
  corrupt.consent(); corrupt.record('locations');
  assert.equal(corrupt.snapshot().status, 'partial');
});
test('サーバー用正規化は宛先・件数・時刻・行・コード・サイズを検証し、余計な情報を捨てる', () => {
  const tracker = Usage.create(memory(),config); tracker.consent(); tracker.record('locations');
  const good = tracker.snapshot();
  const withExtra = {...good,name:'private',source:'secret',absolutePath:'/Users/private'};
  assert.deepEqual(Usage.normalize(withExtra,config.targetId,config.fileName),good);
  for (const changed of [
    {...good,targetId:'html13-01'}, {...good,locationRequests:-1}, {...good,locationRequests:2},
    {...good,events:[{kind:'detail',at:1700000000000,line:0,code:'<script>'}]},
    {...good,events:[{kind:'locations',at:Infinity}]}, {...good,extra:'x'.repeat(24000)}
  ]) assert.equal(Usage.normalize(changed,config.targetId,config.fileName).status,'unavailable');
  const circular = {}; circular.self = circular;
  assert.equal(Usage.normalize(circular,config.targetId,config.fileName).status,'unavailable');
});
test('記録は最大100イベント、25ファイルに制限し、別の保存領域を消さない', () => {
  const storage = memory({draft:'keep'}), tracker = Usage.create(storage, config); tracker.consent();
  for(let i=0;i<120;i++)tracker.record('locations');
  assert.equal(tracker.snapshot().events.length, 100); assert.equal(tracker.snapshot().locationRequests, 120); assert.equal(tracker.snapshot().truncated, true);
  for(let i=0;i<30;i++) { const item = Usage.create(storage,{...config,fileKey:i.toString(16).padStart(32,'0')}); item.consent(); }
  assert.equal(storage.getItem('draft'), 'keep'); assert.equal(storage.length, 26);
});
