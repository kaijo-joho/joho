// FAQ expansion regression checks. The GSS/GAS generator remains the source of truth.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = fileURLToPath(new URL('../', import.meta.url));
const context = { window: {} };
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/faq.js'), 'utf8'), context);
vm.runInNewContext(fs.readFileSync(path.join(root, 'js/pages.js'), 'utf8'), context);
const rows = process.argv[2]
  ? JSON.parse(fs.readFileSync(process.argv[2], 'utf8')).after.map(q => ({ ...q,
    displayPages: q.displayPages.split(',').filter(Boolean), relatedFaq: q.relatedFaq.split(',').filter(Boolean) }))
  : context.window.FAQ_DATA;
const byId = new Map(rows.map(q => [q.faqId, q]));
assert.equal(byId.size, rows.length, 'FAQ IDが重複しない');
assert.ok(rows.every(q => q.status === '公開' && !Object.hasOwn(q, 'noteTeacher')), '下書き・教員メモを公開しない');

const addedIds = ['ss01', ...Array.from({ length: 23 }, (_, i) => `ss-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 10 }, (_, i) => `html-${String(i + 59).padStart(3, '0')}`),
  ...Array.from({ length: 7 }, (_, i) => `dr-${String(i + 1).padStart(3, '0')}`),
  ...Array.from({ length: 4 }, (_, i) => `dr-${String(i + 35).padStart(3, '0')}`)];
const checkedIds = [...new Set([...addedIds, ...rows.filter(q => q.course === 'dr').map(q => q.faqId)])];
for (const id of checkedIds) {
  const faq = byId.get(id);
  assert.ok(faq, `追加・見直しFAQがある: ${id}`);
  assert.ok(faq.question && faq.shortAnswer && (faq.bodyHtml || faq.bodyMd), `${id}: 回答がある`);
  assert.ok(faq.updatedAt, `${id}: 更新日がある`);
  assert.ok(faq.displayPages.length, `${id}: 表示ページを明示する`);
  for (const page of faq.displayPages) {
    // Context matching is not a link or a publication setting (e.g. dr-001 on dr01).
    assert.ok(context.window.pages[page], `${id}: 表示対象の教材が存在する ${page}`);
    assert.ok(page.startsWith(faq.course), `${id}: 講座が一致する`);
  }
  for (const target of faq.relatedFaq) assert.ok(byId.has(target), `${id}: 関連FAQ ${target}`);
  const [file, anchor] = faq.relatedPage.split('#');
  assert.equal(context.window.pages[file.replace(/\.html$/, '')]?.release, true, `${id}: 関連リンク先は公開教材`);
  const html = fs.readFileSync(path.join(root, file), 'utf8');
  if (anchor && !html.includes(`id="${anchor}"`)) {
    const source = html.match(/data-slide-source="([^"]+)"/)?.[1];
    assert.ok(source, `${id}: 関連ページのアンカーが存在する`);
    const slides = JSON.parse(fs.readFileSync(path.join(root, `data/slides/${source}.json`), 'utf8'));
    const count = slides.slides.filter(s => s.section && !s.slideTitle).length;
    assert.match(anchor, /^headline_[1-9]\d*$/);
    assert.ok(Number(anchor.split('_')[1]) <= count, `${id}: 生成見出しが存在する`);
  }
}
const ssPages = ['ss11', 'ss12', 'ss13', 'ss14', 'ss15', 'ss21', 'ss22', 'ss31', 'ss32', 'ss33', 'ss34', 'ss41'];
for (const page of ssPages) assert.ok(rows.some(q => q.course === 'ss' && q.faqId !== 'ss01' && q.displayPages.includes(page)), `${page}: 専用FAQがある`);
for (const page of ['html18', 'html25']) assert.ok(rows.some(q => q.displayPages.includes(page)), `${page}: 関連FAQがある`);
const dr = rows.filter(q => q.course === 'dr');
for (let i = 1; i <= 7; i++) {
  const faq = byId.get(`dr-${String(i).padStart(3, '0')}`);
  assert.ok(faq.displayPages.includes('dr31') && faq.relatedPage.startsWith('dr31.html#'), '既存dr31の関連付けを保持する');
}
for (const page of ['dr31', 'dr32']) assert.ok(dr.some(q => q.displayPages.includes(page)), `${page}: 公開FAQがある`);
assert.match(byId.get('ss01').shortAnswer, /1枚目.*課題メニュー/);
assert.doesNotMatch(byId.get('ss01').question, /メニューバーに/);
assert.match(byId.get('dr-007').shortAnswer, /2倍より大きい/);
for (const [id, page] of [['html-015', 'html18'], ['html-016', 'html18'], ['html-021', 'html18'], ['html-053', 'html25']]) {
  assert.ok(byId.get(id).displayPages.includes(page), `${id}: 既存FAQを新ページでも表示する`);
}
console.log(`FAQ内容検証: OK (公開${rows.length}件、見直し・追加${checkedIds.length}件、DR公開${dr.length}件)`);
