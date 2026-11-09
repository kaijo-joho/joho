const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../preview.js'), 'utf8');

function setup(title = '実習のページ', options = {}) {
  const calls = {titles:[], parsed:[], diagnostics:[], notices:[]}, iframe = {addEventListener() {}}, context = {
    HtmlEditorDiagnostics:require('../diagnostics.js'),
    DOMParser:class {
      parseFromString(html, type) {
        assert.equal(type, 'text/html'); calls.parsed.push(html);
        return {title, querySelectorAll:() => [], querySelector:() => null,
          head:{prepend() {}}, createElement:() => ({}),
          documentElement:{outerHTML:'<html><head></head><body>実習</body></html>'}};
      }
    },
    crypto:{randomUUID:() => 'synthetic-preview'}
  };
  vm.runInNewContext(source, context);
  const preview = new context.HtmlPreview({iframe, onTitle:value => calls.titles.push(value),onDiagnostics:value=>calls.diagnostics.push(value),onNotice:value=>calls.notices.push(value), ...options});
  return {preview, iframe, calls};
}

test('プレビュー更新時にDOMのtitleを通知し、元のHTMLは書き換えない', () => {
  const h = setup('海城 & 情報');
  const html = '<html><head><title>海城 &amp; 情報</title></head><body>実習</body></html>';
  h.preview.update(html, 'lesson.html');
  assert.deepEqual(h.calls.titles, ['海城 & 情報']);
  assert.ok(h.calls.parsed[0].endsWith(html));
  assert.match(h.calls.parsed[0], /^<meta http-equiv="Content-Security-Policy"/);
});

test('リンク先の診断は編集元へ付けず、プレビュー内での移動と更新の戻り先を案内する', () => {
  const h = setup(); h.preview.update('<html><body>編集中</body></html>', 'first.html');
  assert.equal(h.calls.diagnostics.length, 1);
  h.preview.update('<html><body>リンク先</body></html>', 'second.html', '', true);
  assert.equal(h.calls.diagnostics.length, 1); assert.match(h.calls.notices.at(-1), /リンク先をプレビューしています：second.html/);
  h.preview.update('<html><body>閉じ忘れ', 'broken.html', '', true);
  assert.equal(h.calls.diagnostics.length, 1); assert.match(h.iframe.srcdoc, /リンク先のコードに問題/);
  assert.doesNotMatch(h.iframe.srcdoc, /エラーを探す/);
  h.preview.update('<html><body>編集中</body></html>', 'first.html');
  assert.equal(h.calls.diagnostics.length, 2); assert.equal(h.calls.notices.at(-1), '');
});

test('構造が不足したHTMLは題名を消して警告し、title未設定は空文字を通知する', () => {
  const h = setup(); h.preview.update('<html><body>実習</body></html>');
  h.preview.update('<title>不完全な文書</title><p>実習</p>');
  assert.deepEqual(h.calls.titles, ['実習のページ', null]);
  assert.match(h.iframe.srcdoc, /プレビューを表示していません/);
  const empty = setup(''); empty.preview.update('<html><body>実習</body></html>');
  assert.deepEqual(empty.calls.titles, ['']);
});

test('作品プレビューはリンク移動と構文エラーでエディタ専用の操作を案内しない', () => {
  const h = setup('作品', {projectView:true});
  h.preview.update('<html><body>リンク先</body></html>', 'second.html', '', true);
  assert.equal(h.calls.notices.at(-1), '');
  h.preview.update('<html><body>閉じ忘れ', 'broken.html', '', true);
  assert.match(h.iframe.srcdoc, /このページのコードをエディタで見直してください/);
});
