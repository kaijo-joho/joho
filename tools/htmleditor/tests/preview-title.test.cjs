const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync(require.resolve('../preview.js'), 'utf8');

function setup(title = '実習のページ') {
  const calls = {titles:[], parsed:[], opened:[], blobs:[]}, iframe = {addEventListener() {}}, context = {
    DOMParser:class {
      parseFromString(html, type) {
        assert.equal(type, 'text/html'); calls.parsed.push(html);
        return {title, querySelectorAll:() => [], querySelector:() => null,
          head:{prepend() {}}, createElement:() => ({}),
          documentElement:{outerHTML:'<html><head></head><body>実習</body></html>'}};
      }
    },
    crypto:{randomUUID:() => 'synthetic-preview'}, Blob,
    URL:{createObjectURL:blob => { calls.blobs.push(blob); return 'blob:synthetic'; }, revokeObjectURL() {}},
    window:{open:(...args) => calls.opened.push(args)}, setTimeout:() => 1
  };
  vm.runInNewContext(source, context);
  const preview = new context.HtmlPreview({iframe, onTitle:value => calls.titles.push(value)});
  return {preview, iframe, calls};
}

test('プレビュー更新時にDOMのtitleを通知し、元のHTMLは書き換えない', () => {
  const h = setup('海城 & 情報');
  const html = '<html><head><title>海城 &amp; 情報</title></head><body>実習</body></html>';
  h.preview.update(html, 'lesson.html');
  assert.equal(h.preview.lastHtml, html);
  assert.equal(h.preview.pageTitle, '海城 & 情報');
  assert.deepEqual(h.calls.titles, ['海城 & 情報']);
  assert.ok(h.calls.parsed[0].endsWith(html));
  assert.match(h.calls.parsed[0], /^<meta http-equiv="Content-Security-Policy"/);
  h.preview.transform(html, true);
  assert.equal(h.calls.titles.length, 1, '別タブ用の変換では元の表示を更新しない');
});

test('構造が不足したHTMLは題名を消して警告し、title未設定は空文字を通知する', () => {
  const h = setup(); h.preview.update('<html><body>実習</body></html>');
  h.preview.update('<title>不完全な文書</title><p>実習</p>');
  assert.equal(h.preview.pageTitle, '');
  assert.deepEqual(h.calls.titles, ['実習のページ', null]);
  assert.match(h.iframe.srcdoc, /プレビューを表示していません/);
  const empty = setup(''); empty.preview.update('<html><body>実習</body></html>');
  assert.deepEqual(empty.calls.titles, ['']);
});

test('別タブのタイトルも同じ題名を安全に表示し、未設定は既定の題名を使う', async () => {
  const title = '海城 & </title><script>危険</script>';
  const h = setup(title); h.preview.update('<html><body>実習</body></html>'); h.preview.openInNewTab();
  const wrapper = await h.calls.blobs[0].text();
  assert.match(wrapper, /<title>海城 &amp; &lt;\/title&gt;&lt;script&gt;危険&lt;\/script&gt;<\/title>/);
  assert.equal(wrapper.includes('<script>'), false);
  assert.match(wrapper, /sandbox="allow-popups allow-popups-to-escape-sandbox"/);
  assert.deepEqual(h.calls.opened[0], ['blob:synthetic', '_blank', 'noopener,noreferrer']);
  const empty = setup(''); empty.preview.update('<html><body></body></html>'); empty.preview.openInNewTab();
  assert.match(await empty.calls.blobs[0].text(), /<title>HTMLプレビュー<\/title>/);
});
