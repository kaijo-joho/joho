import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

function inlineCodeTexts(note) {
  return Array.from(String(note).matchAll(/<code\b[^>]*>([\s\S]*?)<\/code\s*>/gi), match =>
    match[1].replace(/<[^>]*>/g, '')
  );
}

const expected = new Map([
  ['1.3. 絶対参照のオートフィル', ['=C7/C$30', '=C8/C$30', '$', '$', 'A$1', '$A1', '$A$1']],
  ['2.2. 関数の絶対参照', ['$']],
  ['3.4. 換算表の作成（入力すべき数式）', ['=ROUND($B12/C$7, 2)']]
]);

const slides = JSON.parse(await readFile(path.join(root, 'data/slides/ss14.json'), 'utf8')).slides;
for (const [title, formulas] of expected) {
  const slide = slides.find(entry => entry.title === title);
  assert.ok(slide, `${title}のスライドがある`);
  assert.deepEqual(inlineCodeTexts(slide.note), formulas, `${title}のinline code`);
}

const index = JSON.parse(await readFile(path.join(root, 'data/search-index.json'), 'utf8'));
const document = index.documents.find(entry => entry.id === 'ss14');
assert.ok(document, '検索索引にss14がある');
for (const [title, formulas] of expected) {
  const section = document.sections.find(entry => entry.heading === title);
  assert.ok(section, `検索索引に「${title}」節がある`);
  assert.equal(section.code.includes('\\$'), false, `検索索引の「${title}」に余分なエスケープがない`);
  // 索引は装飾タグの境界も空白へ変換する既存仕様。表示側は上で空白も含め厳密に検査する。
  assert.equal(section.code.replace(/\s/g, ''), formulas.join('').replace(/\s/g, ''), `検索索引の「${title}」code`);
}

console.log('スプレッドシートのスライド数式: OK');
