import assert from 'node:assert/strict';
import { readFile, readdir, access } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFile(new URL(path,root),'utf8');
const expected = {is21:5,is22:6,is23:7};
const pageContext = {window:{}};
vm.runInNewContext(await read('js/pages.js'),pageContext);
const search = JSON.parse(await read('data/search-index.json'));
// Shared series assets must match every consumer, including pages outside this test's content scope.
const seriesAssets = new Map();
for (const asset of ['css/information-society.css','js/information-society.js','css/personal-information.css','js/personal-information.js']) {
  seriesAssets.set(asset,'sha384-'+createHash('sha384').update(await readFile(new URL(asset,root))).digest('base64'));
}
const seriesReferences = [];
for (const file of (await readdir(root)).filter(file=>file.endsWith('.html'))) {
  const html = await read(file);
  for (const match of html.matchAll(/<(?:link|script)\b[^>]*(?:href|src)="\.\/([^"?#]+)"[^>]*>/g)) {
    if (!seriesAssets.has(match[1])) continue;
    assert.equal(/integrity="([^"]+)"/.exec(match[0])?.[1],seriesAssets.get(match[1]),`${file}: ${match[1]} SRI`);
    seriesReferences.push({file,asset:match[1]});
  }
}
for (const id of ['is21','is22','is23','is31','is32']) assert.ok(seriesReferences.some(ref=>ref.file===`${id}.html` && ref.asset==='css/information-society.css'),`${id}: shared stylesheet included in SRI verification`);
for(const [id,count] of Object.entries(expected)) {
  const html=await read(`${id}.html`);
  assert.equal((html.match(/<section\b[^>]*data-lesson-slide\s/g)||[]).length,count,`${id}: lesson scope`);
  assert.match(html,/<body\b[^>]*data-lesson-slide-deck/);
  assert.ok(html.includes('./js/lesson-slide-deck.js'));
  assert.ok(!html.includes('id="page_header"'),`${id}: common cover only`);
  const ids=[...html.matchAll(/\bid="([^"]+)"/g)].map(x=>x[1]);
  assert.equal(new Set(ids).size,ids.length,`${id}: unique IDs`);
  for(let n=1;n<=count;n++) assert.ok(ids.includes(`headline_${n}`));
  assert.ok(!/<[^>]*data-is-panel[^>]*\shidden/.test(html),`${id}: no-JS comparison readable`);
  assert.ok(!/href="[^"#]*is3[12]/.test(html),`${id}: no unbuilt page links`);
  assert.ok(!/(?:src|href)="(?:\.\/)?(?:img_slide|data\/slides)\//.test(html),`${id}: no source-deck asset reuse`);
  assert.ok(!/data-is-(?:score|verdict)/.test(html),`${id}: observation model, not legal verdict`);
  assert.match(html,/2026-10-02確認/);
  for(const match of html.matchAll(/<(?:script|link)\b[^>]*(?:src|href)="(\.\/[^"?#]+)"[^>]*>/g)) {
    const [,path]=match;
    await access(new URL(path,root));
    if(!path.includes('information-society.')) continue;
    const sri=/integrity="(sha384-[^"]+)"/.exec(match[0])?.[1];
    const expectedHash='sha384-'+createHash('sha384').update(await readFile(new URL(path,root))).digest('base64');
    assert.equal(sri,expectedHash,`${id} ${path}: SRI`);
  }
  for(const [,fragment] of html.matchAll(/href="#([^"]+)"/g)) assert.ok(ids.includes(fragment),`${id}: valid internal fragment ${fragment}`);
  if(pageContext.window.pages[id]?.release !== true) assert.ok(!search.documents.some(p=>p.id===id),`${id}: draft is absent from published search`);
}
const ip = await read('is21.html');
for(const phrase of ['20年','10年','25年','出願','設定登録','2020年4月1日','更新']) assert.ok(ip.includes(phrase),`industrial terms: ${phrase}`);
const rights = await read('is22.html');
assert.match(rights,/複製権だけ/); assert.match(rights,/翌年.*1月1日/);
assert.match(rights,/譲渡できず|譲渡できない/);
const use=await read('is23.html');
for(const phrase of ['公表','公正','正当','改変物の共有','ライセンス','一般公開','補償金']) assert.ok(use.includes(phrase),`use conditions: ${phrase}`);
console.log(`information-society: 3 page structure, draft exposure, local links, ${seriesReferences.length} series CSS/JS references, SRI and key teaching conditions passed`);
