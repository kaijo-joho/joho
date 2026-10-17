const test = require('node:test');
const assert = require('node:assert/strict');
const HtmlPreview = require('../preview.js');
const flush = async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); };
function setup() {
  const files = new Map([['first.html','original'],['pages/second.html','second'],['pages/third.html','third']]);
  const calls = {reads:[],notices:[],transforms:0}, listeners = new Map();
  const iframe = {contentWindow:{location:{href:'about:srcdoc'}},addEventListener:(name, fn) => listeners.set(name, fn)};
  const fs = {fileEntries:files,async readFile(path, options) { calls.reads.push({path,options}); return files.get(path); }};
  const preview = new HtmlPreview({iframe,fs,onNotice:message => calls.notices.push(message)});
  preview.transform = source => { calls.transforms++; preview.localLinks.clear(); return 'preview:' + source; };
  preview.update('unsaved original', 'first.html');
  return {preview,iframe,fs,calls,files,async load(href) { iframe.contentWindow.location.href = href; listeners.get('load')(); await flush(); }};
}
test('ローカルリンクはプレビューだけを切り替え、相対パスの基準もリンク先へ移す', async () => {
  const h = setup(); await h.preview.navigate('pages/second.html#topic');
  assert.equal(h.iframe.srcdoc, 'preview:second'); assert.equal(h.preview.basePath, 'pages/second.html');
  assert.equal(h.preview.fragment, '#topic'); assert.equal(h.preview.linked, true);
  assert.deepEqual(h.calls.reads[0], {path:'pages/second.html',options:{activate:false}});
  await h.preview.navigate('./third.html'); assert.equal(h.iframe.srcdoc, 'preview:third');
  await h.preview.navigate('../first.html'); assert.equal(h.iframe.srcdoc, 'preview:original');
  h.preview.update('unsaved original', 'first.html');
  assert.equal(h.iframe.srcdoc, 'preview:unsaved original'); assert.equal(h.preview.linked, false);
});
test('ネイティブなリンク移動からも編集用コールバックを使わず、プレビューだけで読む', async () => {
  const h = setup(), destination = 'about:blank#html-editor-test';
  h.preview.localLinks.set(destination, 'pages/second.html'); await h.load(destination);
  assert.equal(h.iframe.srcdoc, 'preview:second'); assert.equal(h.calls.reads.length, 1);
  assert.equal(h.calls.transforms, 2, '移動前の表示復元では編集元を再検査しない');
});
test('未読込ファイル・フォルダ外・外部URL・不正パスは遷移せず、元の表示を残す', async () => {
  const h = setup();
  for (const href of ['missing.html','../first.html','/first.html','https://example.com','javascript:alert(1)','pages%2fsecond.html','pages\\second.html','pages/second.html?q=1']) {
    await h.preview.navigate(href); assert.equal(h.iframe.srcdoc, 'preview:unsaved original');
  }
  assert.equal(h.calls.reads.length, 0); assert.equal(h.calls.notices.length, 8);
});
test('読み取り失敗・途中の更新・フォルダ変更・連続クリックで古い結果を表示しない', async () => {
  for (const change of ['failure','update','folder','directory','entries','second-link','disconnect','blocked']) {
    const h = setup(); let finish;
    h.fs.readFile = async () => new Promise((resolve, reject) => { finish = change === 'failure' ? () => reject(Error('read failed')) : () => resolve('late'); });
    const pending = h.preview.navigate('pages/second.html');
    if (change === 'update') h.preview.update('latest edit', 'first.html');
    if (change === 'folder') h.preview.fs = {};
    if (change === 'directory') h.fs.dirHandle = {};
    if (change === 'entries') h.fs.fileEntries = new Map(h.files);
    if (change === 'second-link') { h.fs.readFile = async () => 'new destination'; await h.preview.navigate('pages/third.html'); }
    if (change === 'disconnect') h.files.clear();
    if (change === 'blocked') h.preview.showBlocked();
    const visible = h.iframe.srcdoc; finish(); await pending;
    assert.equal(h.iframe.srcdoc, visible, change);
    if (change === 'failure') assert.deepEqual(h.calls.notices, ['read failed']);
  }
});
