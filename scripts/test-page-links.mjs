import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';

const source = await readFile(new URL('../js/script.js', import.meta.url), 'utf8');
const baseURI = 'https://example.test/joho/nw11.html';
const pages = {
  index: { id: 'index', fileName: 'index.html', release: true },
  nw11: { id: 'nw11', fileName: 'nw11.html', release: true },
  nw12: { id: 'nw12', fileName: 'nw12.html', release: false },
  nw13: { id: 'nw13', fileName: 'nw13.html', release: true },
  nw00: { id: 'nw00', fileName: 'nw00.html', release: true, show: false },
  renamed: { id: 'renamed', fileName: 'draft-network.html', release: false },
};
const context = {
  URL,
  window: { pages },
  location: new URL(baseURI),
  document: {
    baseURI,
    currentScript: { src: 'https://example.test/joho/js/script.js' },
    readyState: 'loading',
    addEventListener() {},
  },
};
vm.runInNewContext(source, context, { filename: 'js/script.js', timeout: 1000 });
const allowed = context.window.isPageLinkReleased;

for (const value of [
  'nw12.html', './nw12.html#headline_2', '/joho/nw12.html?preview=1',
  'https://example.test/joho/nw12.html#title', './%6Ew12.html',
  'draft-network.html',
  { id: 'nw12', url: 'nw12.html', release: true },
  { id: 'nw13', url: 'nw12.html', release: true },
  { id: 'nw12', url: 'nw13.html', release: true },
  { url: 'nw13.html', release: false },
  false, null, {}, '',
]) {
  assert.equal(allowed(value), false, `未掲載・無効なページ参照をリンクにしない: ${JSON.stringify(value)}`);
}
for (const value of [
  'nw13.html', './nw13.html#headline_2', '/joho/nw13.html?preview=1',
  { id: 'nw13', url: 'nw13.html', release: true },
  pages.nw00, './', '#headline_2',
  'https://other.test/joho/nw12.html', './helper.html',
]) {
  assert.equal(allowed(value), true, `公開ページ・補助リンクを維持する: ${JSON.stringify(value)}`);
}

pages.nw11.release = false;
assert.equal(allowed('#headline_2'), true, '直接開いた未掲載ページ内のハッシュ移動を維持する');
assert.equal(allowed({ id: 'nw11', url: 'nw11.html' }), false, '未掲載ページ自身も検索対象から除外する');
pages.nw12.release = true;
assert.equal(allowed('nw12.html'), true, '公開状態を変更すると同じURLをリンクにできる');
assert.equal(allowed({ url: 'nw12.html', release: false }), false, 'リンク側の未掲載指定も守る');
console.log('page-links: 公開判定・URL表記・直接プレビューの検証に合格');
