import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import vm from 'node:vm';

const read = path => readFileSync(new URL('../' + path, import.meta.url), 'utf8');
const extract = text => [...text.matchAll(/<symbol\s+id="([^"]+)"\s+viewBox="0 0 24 24">([\s\S]*?)<\/symbol>/g)].map(([, id, children]) => [id, children]);
const source = read('tools/shared/ui-icons.svg');
const symbols = extract(source);
assert.equal(symbols.length, 46);
assert.equal(new Set(symbols.map(([id]) => id)).size, 46);
// 承認済み46種のID・子要素・座標を固定する。表示用の見出しや注釈は含めない。
assert.equal(createHash('sha256').update(JSON.stringify(symbols)).digest('hex'),
  '2284c2dbaaadc0a176341311a2bfe39bad4341a1f5e0ccd25ca631b26aaeb298');
if (process.argv[2]) assert.deepEqual(symbols, extract(readFileSync(process.argv[2], 'utf8')));
assert.doesNotMatch(source, /<(?:metadata|text|script|style|image|foreignObject)\b|\/Users\/|docs\/assets/);
for (const [, children] of symbols) {
  assert.match(children, /^<(?:path|circle|rect)\b/);
  assert.doesNotMatch(children, /(?:stroke|fill|style|href|onload)=/);
}

const context = { URL, window: {}, document: { currentScript: { src: 'https://example.invalid/tools/shared/ui-icons.js?v=test' } } };
vm.runInNewContext(read('tools/shared/ui-icons.js'), context);
const icons = context.window.JohoIcons;
assert.deepEqual([...icons.ids], symbols.map(([id]) => id));
assert.ok(Object.isFrozen(icons) && Object.isFrozen(icons.ids));
for (const [id] of symbols) {
  assert.ok(icons.has(id));
  assert.equal(icons.url(id), 'https://example.invalid/tools/shared/ui-icons.svg?v=20261113#' + id);
  const svg = icons.svg(id);
  assert.match(svg, /viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false"/);
  assert.match(svg, /fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round/);
  assert.match(svg, /<use href="https:\/\/example.invalid\/tools\/shared\/ui-icons.svg\?v=20261113#[a-z-]+"\/>/);
}
assert.equal(icons.has('__proto__'), false);
assert.throws(() => icons.svg('not-defined'), /未定義/);
assert.throws(() => icons.svg('save', { size: Infinity }), /大きさ/);
assert.match(icons.svg('save', { className: '"<>&\'', size: 18 }), /class="&quot;&lt;&gt;&amp;&#39;"/);
assert.throws(() => icons.apply(null, 'save'), /SVG/);

// 共通ヘルプの既存ファイルはSRI固定の利用側でも引き続き読み込める。
const html = read('tools/htmleditor/index.html');
for (const match of html.matchAll(/(?:src|href)="(\.\.\/shared\/help-panel\.(?:js|css))[^\"]*" integrity="([^"]+)"/g)) {
  const file = readFileSync(new URL('../tools/shared/' + match[1].split('/').at(-1), import.meta.url));
  assert.equal('sha384-' + createHash('sha384').update(file).digest('base64'), match[2]);
}
console.log('Shared icons: 46 approved definitions, URL/API contract, escaping, and existing help SRI: OK');
