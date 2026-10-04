import assert from 'node:assert/strict';
import { readFile, access, readdir } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path, root), 'utf8');
const specs = { id11: 6, id12: 7, id13: 6, id14: 6, id15: 6 };
const context = { window: {} }; vm.runInNewContext(await read('js/pages.js'), context);
const index = JSON.parse(await read('data/search-index.json'));
let checks = 0;
for (const [id, count] of Object.entries(specs)) {
 const html = await read(`${id}.html`);
 assert.match(html, /<html lang="ja">/);
 assert.match(html, /<body[^>]+data-lesson-slide-deck/);
 assert.equal((html.match(/<section[^>]+data-lesson-slide /g) || []).length, count);
 assert.ok(!html.includes('id="page_header"'), 'cover belongs to shared layout');
 const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(m => m[1]);
 assert.equal(ids.length, new Set(ids).size, `${id}: unique IDs`);
 for (let n=1;n<=count;n++) assert.ok(ids.includes(`headline_${n}`));
 assert.match(html, /重要語句・ポイント/); assert.match(html, /問題演習/);
 assert.match(html, /data-lesson-progress/); assert.match(html, /data-lesson-stage-from="2"/);
 for (const m of html.matchAll(/<svg\b[^>]*aria-labelledby="([^"]+)"[^>]*>([\s\S]*?)<\/svg>/g)) {
  for (const key of m[1].split(/\s+/)) assert.ok(ids.includes(key), `${id}: valid SVG title/desc ref`);
  assert.ok(m[2].includes('<title') && m[2].includes('<desc'), `${id}: SVG has text alternatives`); checks++;
 }
 assert.ok(!/<[^>]*data-(?:is-panel|lesson-stage(?:-from)?)[^>]*\shidden/.test(html), `${id}: no-JS content readable`);
 for (const m of html.matchAll(/<(?:script|link|img)\b[^>]*(?:src|href)="\.\/([^"?#]+)"[^>]*>/g)) {
  await access(new URL(m[1],root));
  if (/information-(?:design|society)\.(?:css|js)$/.test(m[1])) {
   const hash = 'sha384-'+createHash('sha384').update(await readFile(new URL(m[1],root))).digest('base64');
   assert.equal(/integrity="([^"]+)"/.exec(m[0])?.[1],hash,`${id}: SRI ${m[1]}`);
  }
  checks++;
 }
 assert.ok(!/href="(?:\.\/)?(?:id\d|is\d|color|il\d|html\d|dr\d)/.test(html), 'no unpublished cross-page links');
 assert.ok(context.window.pages[id]?.release !== true, `${id}: not released`);
 assert.ok(!index.documents.some(doc => doc.id === id), `${id}: absent from search`);
 checks += 10;
}
for (const file of (await readdir(root)).filter(name => name.endsWith('.html') && !Object.hasOwn(specs,name.slice(0,-5)))) {
 const html = await read(file);
 assert.ok(!/href="(?:\.\/)?id1[1-5]\.html/.test(html), `${file}: no draft link`);
}
const color=await read('id12.html');
for(const phrase of ['HSLのL','補色だから','文化・経験','心理補色']) assert.ok(color.includes(phrase));
assert.ok((await read('id13.html')).includes('すべての人の色覚を再現するものではありません'));
console.log(`Information design: ${checks} structure, SVG, source-link, SRI and draft-exposure checks passed.`);
