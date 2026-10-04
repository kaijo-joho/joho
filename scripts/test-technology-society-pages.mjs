import assert from 'node:assert/strict';
import { readFile, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
const root = new URL('../',import.meta.url);
const files = ['is61','is62','is63','is64'];
const modelCounts = [5,5,5,6];
for (const [index,id] of files.entries()) {
  const html = await readFile(new URL(`${id}.html`,root),'utf8');
  assert.equal((html.match(/<section\b[^>]*data-lesson-slide\s/g)||[]).length,7,`${id}: seven lesson slides`);
  assert.equal((html.match(/data-is-model=/g)||[]).length,modelCounts[index]);
  assert.match(html,/<body\b[^>]*data-lesson-slide-deck/);
  assert.ok(!html.includes('id="page_header"'),'shared cover only');
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match=>match[1]);
  assert.equal(ids.length,new Set(ids).size,`${id}: unique IDs`);
  for(let n=1;n<=7;n++) assert.ok(ids.includes(`headline_${n}`));
  assert.ok(!/<[^>]*\bhidden\b/.test(html),'source contains all fallback states');
  assert.ok(!/href="(?:\.\/)?(?:is|id|cp|nw|dr)[0-9][^"#]*\.html/.test(html),'no lesson-to-lesson links');
  for (const [,source] of html.matchAll(/(?:src|href)="(\.\/[^"?#]+)"/g)) await access(new URL(source,root));
  for (const [tag,path] of [...html.matchAll(/(<(?:link|script)\b[^>]*(?:href|src)="\.\/((?:css|js)\/[^"?#]+)"[^>]*>)/g)].map(match=>[match[1],match[2]])) {
    const integrity = /integrity="([^"]+)"/.exec(tag)?.[1];
    if(integrity) assert.equal(integrity,'sha384-'+createHash('sha384').update(await readFile(new URL(path,root))).digest('base64'),`${id}: ${path} SRI`);
  }
  for(const [,contents] of html.matchAll(/<svg\b[^>]*>([\s\S]*?)<\/svg>/g)) {
    assert.match(contents,/<title id=/); assert.match(contents,/<desc id=/);
  }
  assert.equal((html.match(/data-lesson-progress\s/g)||[]).length,modelCounts[index],'each model uses shared Next');
  assert.equal((html.match(/<textarea\b/g)||[]).length,2,'two original explanation exercises');
  for(const phrase of ['語句まとめ','ポイントまとめ','予想する','説明する','2026-10-04確認']) assert.ok(html.includes(phrase),`${id}: ${phrase}`);
}
const ai=await readFile(new URL('is63.html',root),'utf8');
for(const phrase of ['昨日','通信が止まる','例にない','正答率を示す図ではありません','外部への送信は行いません']) assert.ok(ai.includes(phrase));
const society=await readFile(new URL('is64.html',root),'utf8');
for(const phrase of ['情報格差','匿名性','フィルターバブル','エコーチェンバー','必ず本人が特定できるとは断定しません']) assert.ok(society.includes(phrase));
console.log('technology-society: 4 pages / 28 slides / 21 models, SVG accessibility, local assets, SRI, fallback and lesson scope passed');
