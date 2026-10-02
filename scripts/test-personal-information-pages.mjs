import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
const root=new URL('../',import.meta.url);
for(const [id,count] of [['is31',6],['is32',7]]){
 const html=await readFile(new URL(`${id}.html`,root),'utf8');
 assert.equal((html.match(/<section\b[^>]*data-lesson-slide\s/g)||[]).length,count,`${id}: slide count`);
 assert.match(html,/<body\b[^>]*is-personal[^>]*data-lesson-slide-deck/);
 assert.ok(!html.includes('id="page_header"'),`${id}: common cover`);
 const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(m=>m[1]);
 assert.equal(new Set(ids).size,ids.length,`${id}: unique IDs`);
 for(let n=1;n<=count;n++)assert.ok(ids.includes(`headline_${n}`));
 for(const [,target] of html.matchAll(/href="#([^"]+)"/g))assert.ok(ids.includes(target),`${id}: fragment ${target}`);
 assert.ok(!/<[^>]*data-is-panel[^>]*\shidden/.test(html),`${id}: no-JS explanations`);
 assert.ok(!/(?:src|href)="(?:\.\/)?(?:img_slide|data\/slides)\//.test(html),`${id}: no source figure reuse`);
 assert.ok(!/<(?:form|textarea)\b/.test(html),`${id}: no student data collection`);
 for(const [,tag] of html.matchAll(/(<input\b[^>]*>)/g))assert.match(tag,/type="checkbox"/);
 for(const m of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="(\.\/[^"?#]+)"[^>]*>/g)){
  await access(new URL(m[1],root));
  if(!/information-society|personal-information/.test(m[1]))continue;
  const sri=/integrity="([^"]+)"/.exec(m[0])?.[1];
  assert.equal(sri,'sha384-'+createHash('sha384').update(await readFile(new URL(m[1],root))).digest('base64'),`${id} ${m[1]} SRI`);
 }
 assert.match(html,/2026-10-02確認/);
}
const js=await readFile(new URL('js/personal-information.js',root),'utf8');
assert.ok(!/\b(?:fetch|XMLHttpRequest|sendBeacon|localStorage|sessionStorage|WebSocket)\b/.test(js),'filter has no transmission or persistence');
const html=await readFile(new URL('is31.html',root),'utf8');
const people=[...html.matchAll(/data-is-features="([^"]+)"/g)].map(m=>new Set(m[1].split(/\s+/)));
assert.equal(people.length,12,'fixed artificial population');
const choices=[...html.matchAll(/<input\b[^>]*data-is-attribute[^>]*>/g)].map(m=>/value="([^"]+)"/.exec(m[0])?.[1]);
assert.equal(choices.length,3,'three independent attributes');
const expected=[12,4,6,2,6,2,3,1];
for(let mask=0;mask<8;mask++){
 const selected=choices.filter((_,i)=>mask&(1<<i));
 assert.equal(people.filter(p=>selected.every(f=>p.has(f))).length,expected[mask],`synthetic intersection ${mask}`);
}
console.log('personal-information: 2 pages, SRI, static fallbacks, 8 artificial intersections and no data submission passed');
