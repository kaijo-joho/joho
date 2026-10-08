import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import test from 'node:test';

const html = readFileSync(new URL('../html14.html', import.meta.url), 'utf8');
const css = readFileSync(new URL('../css/html-file-tree.css', import.meta.url), 'utf8');
const diagrams = [...html.matchAll(/<svg\b[^>]*class="concept-diagram"[\s\S]*?<\/svg>/g)].map(m => m[0]);
const photos = Array.from({ length: 5 }, (_, i) => `photo0${i + 1}.jpg`);
const labels = svg => [...svg.matchAll(/<text\b[^>]*x="(\d+)"[^>]*>([^<]+)<\/text>/g)]
  .map(m => ({ x: Number(m[1]), name: m[2] }));

test('保存先と相対パスの構成図3点をSVGで表示する', () => {
  assert.equal(diagrams.length, 3);
  assert.doesNotMatch(html, /<pre\b[^>]*class="html-practice-tree"|src="\.\/img\/html14_00[23]\.png"/);
  for (const svg of diagrams) {
    assert.match(svg, /role="img"/);
    assert.doesNotMatch(svg, /<(?:script|image|foreignObject)\b|\bon\w+\s*=/i);
  }
});

test('階層とファイル名を保存先・同一フォルダ・images内で区別する', () => {
  const expected = [
    [{ x: 60, name: 'HTML実習' }, { x: 108, name: 'html14-01.html' }, { x: 108, name: 'images' },
      ...photos.map(name => ({ x: 156, name }))],
    [{ x: 60, name: 'HTML実習' }, { x: 108, name: '呼び出し元.html' },
      ...photos.map(name => ({ x: 108, name }))],
    [{ x: 60, name: 'HTML実習' }, { x: 108, name: '呼び出し元.html' }, { x: 108, name: 'images' },
      ...photos.map(name => ({ x: 156, name }))]
  ];
  diagrams.forEach((svg, index) => assert.deepEqual(labels(svg), expected[index]));
  assert.match(diagrams[1], /相対パスは\.\/photo01\.jpgです/);
  assert.match(diagrams[2], /相対パスは\.\/images\/photo01\.jpgです/);
});

test('読み上げ用の題名と説明、共用アイコンの参照先が存在する', () => {
  const ids = diagrams.flatMap(svg => [...svg.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]));
  assert.equal(new Set(ids).size, ids.length);
  for (const svg of diagrams) {
    const referenced = svg.match(/aria-labelledby="([^"]+)"/)[1].split(' ');
    assert.equal(referenced.length, 2);
    for (const id of referenced) {
      assert.match(svg, new RegExp(`<(?:title|desc) id="${id}">[^<]+</(?:title|desc)>`));
    }
    const uses = [...svg.matchAll(/<use\b[^>]*href="#([^"]+)"/g)].map(m => m[1]);
    assert.equal(uses.length, labels(svg).length);
    uses.forEach(id => assert(ids.includes(id), id));
    assert(uses.includes('html-tree-folder-icon'));
    assert(uses.includes('html-tree-html-icon'));
    assert(uses.includes('html-tree-image-icon'));
  }
});

test('専用CSSのSRIを合わせ、配色にはサイト共通のテーマ変数を使う', () => {
  const link = html.match(/<link\b[^>]*href="\.\/css\/html-file-tree\.css[^>]+>/)[0];
  const expected = 'sha384-' + createHash('sha384').update(css).digest('base64');
  assert.equal(link.match(/integrity="([^"]+)"/)[1], expected);
  assert.match(link, /crossorigin="anonymous"/);
  for (const variable of ['text', 'muted', 'active', 'line', 'surface-strong']) {
    assert(css.includes(`var(--diagram-${variable})`));
  }
});
