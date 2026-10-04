import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
let checks=0;
for(const id of ['is51','is52','is53']) {
  const html=await readFile(new URL(`${id}.html`,root),'utf8');
  assert.match(html,/<body[^>]+data-lesson-slide-deck/); checks++;
  assert.equal((html.match(/<section data-lesson-slide /g)||[]).length,7); checks++;
  assert.equal((html.match(/data-lesson-progress data-progress-count="3"/g)||[]).length,5); checks++;
  assert.equal((html.match(/data-progress-next/g)||[]).length,5); checks++;
  assert.ok(!/href="(?:\.\/)?(?:is\d|py\d|ss\d|il\d|id\d)/.test(html)); checks++;
  assert.ok(!/<details(?![^>]*open)[^>]*>/.test(html)); checks++;
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
  assert.equal(ids.length,new Set(ids).size,`${id}: unique element IDs`); checks++;
  for(const match of html.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)) {
    assert.match(match[1],/<title[^>]*>.+?<\/title>/); assert.match(match[1],/<desc[^>]*>.+?<\/desc>/); checks+=2;
  }
  for(const match of html.matchAll(/(?:href|src)="\.\/([^"#?]+)"/g)) {await readFile(new URL(match[1],root));checks++;}
  for(const match of html.matchAll(/(?:href|src)="\.\/([^"]+)" integrity="sha384-([^"]+)"/g)) {
    assert.equal(createHash('sha384').update(await readFile(new URL(match[1],root))).digest('base64'),match[2]); checks++;
  }
}
const js=await readFile(new URL('js/problem-solving.js',root),'utf8');
assert.ok(!/localStorage|sessionStorage|fetch\(|XMLHttpRequest|innerHTML/.test(js));checks++;
assert.match(js,/e\.isComposing/);checks++;
console.log(`problem-solving-pages: ${checks} checks passed`);
