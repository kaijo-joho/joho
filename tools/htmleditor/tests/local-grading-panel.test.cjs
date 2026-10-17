const test = require('node:test');
const assert = require('node:assert/strict');
const G = require('../local-grading.js');
class Node {
  constructor() { this.children = []; this.attributes = {}; this.value = ''; }
  set textContent(value) { this.value = value; this.children = []; }
  get textContent() { return this.value + this.children.map(node => node.textContent).join(''); }
  append(...nodes) { this.children.push(...nodes); }
  insertBefore(node, before) { this.children.splice(this.children.indexOf(before), 0, node); }
  setAttribute(name, value) { this.attributes[name] = value; }
  remove() { this.removed = true; }
}
const flush = async () => { for (let i = 0; i < 12; i++) await Promise.resolve(); };
const result = {status:'checked',receipt:{result:{state:'graded',rules:[{passed:true,label:'見出し',points:10,earned:10}]}}};
function setup(grade = async () => result) {
  let now = 0, next = 0, current = true, calls = 0, signal;
  const pending = new Map(), parent = new Node();
  const document = {createElement:() => new Node(),createTextNode:text => ({textContent:text})};
  const timers = {
    setTimeout(fn, ms) { pending.set(++next, {fn,at:now + ms}); return next; },
    clearTimeout(id) { pending.delete(id); }
  };
  const panel = G.panel(parent,{document,timers,input:{},isCurrent:() => current,grader:{grade(input) { calls++; signal = input.signal; return grade(input); }}});
  return {parent,panel,pending,get calls() { return calls; },get signal() { return signal; },
    stale() { current = false; },async advance(ms) {
      now += ms;
      for (const [id, task] of pending) if (task.at <= now) { pending.delete(id); task.fn(); }
      await flush();
    }};
}
test('採点は即時に始め、最低5秒はスピナーを表示して結果・点数を先出ししない', async () => {
  const h = setup(), section = h.parent.children[0], status = section.children[1];
  await flush(); assert.equal(h.calls, 1);
  assert.equal(section.attributes['aria-busy'], 'true');
  assert.equal(status.children[0].className, 'download-spinner');
  assert.equal(status.children[0].attributes['aria-hidden'], 'true');
  assert.match(h.parent.textContent, /保存した内容を採点しています/);
  await h.advance(4999); assert.doesNotMatch(h.parent.textContent, /★|確認が終わりました|10/);
  await h.advance(1); assert.equal(await h.panel.completed, result);
  assert.equal(section.attributes['aria-busy'], 'false');
  assert.match(h.parent.textContent, /確認が終わりました/); assert.match(h.parent.textContent, /★ 見出し/);
  assert.equal(status.children.length, 0); assert.equal(h.pending.size, 0);
});
test('採点に5秒以上かかった場合は、完了後にさらに5秒待たせない', async () => {
  let finish; const h = setup(() => new Promise(resolve => { finish = resolve; }));
  await flush(); await h.advance(7000); assert.doesNotMatch(h.parent.textContent, /★/);
  finish(result); await flush(); assert.equal(await h.panel.completed, result);
  assert.match(h.parent.textContent, /★ 見出し/);
});
test('モーダルを閉じると待機を解除し、遅い結果を表示しない', async () => {
  const h = setup(); await flush(); h.panel.dispose();
  assert.equal(h.pending.size, 0); assert.equal(h.signal.aborted, true);
  assert.equal(await h.panel.completed, null); assert.equal(h.parent.children[0].removed, true);
  await h.advance(5000); assert.doesNotMatch(h.parent.textContent, /★/);
});
test('5秒の待機中に本文が変わったら旧結果を表示しない', async () => {
  const h = setup(); await flush(); h.stale(); await h.advance(5000);
  assert.equal(await h.panel.completed, null); assert.doesNotMatch(h.parent.textContent, /★/);
  assert.match(h.parent.textContent, /内容が変わりました/);
});
test('採点失敗は待機せず案内し、旧GASフォームの利用を妨げない', async () => {
  const h = setup(async () => { throw Error('synthetic failure'); });
  assert.equal(await h.panel.completed, null); assert.equal(h.pending.size, 0);
  assert.match(h.parent.textContent, /下の提出フォームはそのまま使えます/);
  assert.equal(h.parent.children[0].attributes['aria-busy'], 'false');
});
test('HTML11では5秒後にも未受領の★を付けない', async () => {
  const h = setup(async () => ({status:'receipt-only'})); await flush(); await h.advance(5000);
  await h.panel.completed; assert.match(h.parent.textContent, /受け付けた後に★がつきます/);
  assert.equal(h.parent.children[0].children.some(node => node.className === 'local-grade-rules'), false);
});
