import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
import vm from 'node:vm';
const root = new URL('../', import.meta.url);
const read = path => readFileSync(new URL(path, root), 'utf8');
const ctx = vm.createContext({ window: {} }); vm.runInContext(`${read('js/pages.js')}\nglobalThis.registry = pages;`, ctx);
for (const id of ['cp11', 'cp12']) {
  const html = read(`${id}.html`);
  assert.equal((html.match(/data-lesson-slide-title=/g) || []).length, 6, `${id}: 本文6枚`);
  assert.ok(html.includes('data-lesson-slide-deck'));
  for (let i = 1; i <= 6; i++) assert.ok(html.includes(`id="headline_${i}"`));
  for (const file of ['css/lesson-slide-deck.css', 'js/lesson-slide-deck.js', 'css/computer-lessons.css', 'js/computer-core.js', 'js/computer-lessons.js']) {
    assert.ok(html.includes(`./${file}`)); assert.ok(existsSync(new URL(file, root)));
  }
  assert.equal((html.match(/data-cp-quiz=/g) || []).length, 3);
  assert.equal(ctx.registry[id].release, false);
  assert.equal(ctx.registry[id].mainTitle, 'コンピュータのしくみ');
  assert.ok(html.includes('語句まとめ・ポイントまとめ'));
  assert.ok(!/<details\b[^>]*\bopen\b/.test(html));
  assert.ok(!html.includes('data-slide-section'));
  const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map(match => match[1]);
  assert.equal(ids.length, new Set(ids).size, `${id}: ID一意`);
  for (const match of html.matchAll(/data-lesson-supplement-open="([^"]+)"/g)) assert.ok(ids.includes(match[1]));
}
for (const [a, b] of [['cp00', 'cp11'], ['cp11', 'cp12'], ['cp12', 'cp21'], ['cp21', 'cp22']]) {
  assert.equal(ctx.registry[a].next[0].id, b);
  assert.equal(ctx.registry[b].back, a);
}
console.log('computer-pages: 共通基盤・6枚構成・教材登録・補足リンク OK');
