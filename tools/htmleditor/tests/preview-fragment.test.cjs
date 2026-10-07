const test = require('node:test');
const assert = require('node:assert/strict');
const HtmlPreview = require('../preview.js');

function setup() {
  const calls = {fragments:[], navigations:[]}, listeners = new Map();
  const location = {
    href:'about:srcdoc',
    set hash(value) { calls.fragments.push(value); this.href = 'about:srcdoc' + value; }
  };
  const iframe = {contentWindow:{location}, srcdoc:'', addEventListener:(name, fn) => listeners.set(name, fn)};
  const preview = new HtmlPreview({iframe, onNavigate:href => calls.navigations.push(href)});
  // ここではiframeのload境界を検査する。HTML変換は既存のプレビューテストで検査する。
  preview.transform = source => { preview.localLinks.clear(); return source; };
  return {preview, iframe, calls, load(href = 'about:srcdoc') { location.href = href; listeners.get('load')(); }};
}

test('別ファイルの位置指定はsrcdocの読込み後にネイティブ遷移する', () => {
  const h = setup(); h.preview.update('destination', 'second.html', '#topic-c');
  assert.deepEqual(h.calls.fragments, [], '以前のプレビューへ先に移動しない');
  h.load();
  assert.deepEqual(h.calls.fragments, ['#topic-c']);
  assert.equal(h.iframe.contentWindow.location.href, 'about:srcdoc#topic-c');
  assert.equal(h.preview.lastHtml, 'destination');
});

test('位置指定を伴わない更新は読込み待ちの指定を取り消す', () => {
  const h = setup(); h.preview.update('first', 'first.html', '#topic-c');
  h.preview.update('second', 'second.html'); h.load();
  assert.deepEqual(h.calls.fragments, []);
  assert.equal(h.iframe.srcdoc, 'second');
});

test('日本語・未知の位置指定もURLのフラグメントとして扱い、別URLを指定しない', () => {
  const h = setup();
  for (const fragment of ['#%E6%9C%AA%E6%9D%A5', '#missing']) {
    h.preview.update('destination', 'second.html', fragment); h.load();
    assert.equal(h.calls.fragments.at(-1), fragment);
  }
  const count = h.calls.fragments.length;
  h.preview.update('destination', 'second.html', 'https://example.com'); h.load();
  assert.equal(h.calls.fragments.length, count);
});

test('ファイルへのリンクは元のプレビューを戻してから位置指定込みで親へ通知する', () => {
  const h = setup(); h.preview.update('original', 'first.html');
  h.preview.localLinks.set('about:blank#html-editor-navigation', './second.html#topic-c');
  h.load('about:blank#html-editor-navigation');
  assert.equal(h.iframe.srcdoc, 'original');
  assert.equal(h.preview.basePath, 'first.html');
  assert.deepEqual(h.calls.navigations, ['./second.html#topic-c']);
  h.load(); // 親が移動を取り消した場合にも元のプレビューを維持する。
  assert.deepEqual(h.calls.fragments, []);
});

test('構文エラーの警告表示では直前の位置指定を使わない', () => {
  const h = setup(); h.preview.update('destination', 'second.html', '#topic-c');
  h.preview.showBlocked(); h.load();
  assert.deepEqual(h.calls.fragments, []);
  assert.match(h.iframe.srcdoc, /プレビューを表示していません/);
});
