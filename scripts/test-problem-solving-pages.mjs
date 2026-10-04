import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
let checks=0;
const sceneKeys={is51:['is51-overdue-classroom','is51-measurable-goal','is51-check-records'],is52:['is52-brainstorm','is52-card-grouping','is52-compare-constraints'],is53:['is53-role-plan','is53-try-solution','is53-evaluate-records-voices']};
for(const id of ['is51','is52','is53']) {
  const html=await readFile(new URL(`${id}.html`,root),'utf8');
  assert.match(html,/<body[^>]+data-lesson-slide-deck/); checks++;
  assert.equal((html.match(/<section data-lesson-slide /g)||[]).length,7); checks++;
  assert.equal((html.match(/data-lesson-progress data-progress-count="3"/g)||[]).length,5); checks++;
  assert.equal((html.match(/data-progress-next/g)||[]).length,5); checks++;
  assert.ok(!/href="(?:\.\/)?(?:is\d|py\d|ss\d|il\d|id\d)/.test(html)); checks++;
  assert.ok(!/<details(?![^>]*open)[^>]*>/.test(html)); checks++;
  const scenes=[...html.matchAll(/<figure class="ps-scene">(<img [^>]+>)(<figcaption>[\s\S]*?<\/figcaption>)<\/figure>/g)];
  assert.equal(scenes.length,3,`${id}: three independent scene images`);checks++;
  for(const [index,scene] of scenes.entries()) {
    assert.ok(scene[1].includes(`scenes/${sceneKeys[id][index]}.webp`));checks++;
    assert.match(scene[1],/alt="[^"]{15,}"/);checks++;
    assert.match(scene[1],/width="1672" height="941" loading="lazy" decoding="async"/);checks++;
    assert.match(scene[2],/生成イメージ（架空の場面）/);checks++;
    assert.match(scene[2],/<\/span>[^<]{20,}/);checks++;
    const bytes=await readFile(new URL(`img/problem-solving/scenes/${sceneKeys[id][index]}.webp`,root));
    assert.equal(bytes.toString('ascii',0,4),'RIFF');assert.equal(bytes.toString('ascii',8,12),'WEBP');checks+=2;
    assert.ok(bytes.length<150_000,`${id}: lightweight scene`);checks++;
  }
  if(id==='is53') {assert.match(html,/紙面の図は場面表現で、人工ケースの数値・結果は下の図で確認する/);checks++;}
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
