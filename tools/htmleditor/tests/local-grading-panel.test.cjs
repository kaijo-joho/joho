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
  addEventListener() {}
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
test('採点は即時に始め、最低5秒は％なしの進捗バーを表示して結果・点数を先出ししない', async () => {
  const h = setup(), section = h.parent.children[0], status = section.children[1];
  await flush(); assert.equal(h.calls, 1);
  assert.equal(h.panel.hasCompleteResult(),false);
  assert.equal(section.attributes['aria-busy'], 'true');
  assert.equal(status.children[1].className, 'local-grade-progress');
  assert.equal(status.children[1].attributes.role, 'progressbar');
  assert.equal(status.children[1].attributes['aria-valuenow'], undefined,'実際の採点進度を架空の％で示さない');
  assert.match(status.children[1].attributes.style,/5000ms/);
  assert.equal(status.children[1].children[0].attributes['aria-hidden'],'true');
  assert.doesNotMatch(h.parent.textContent,/%|％/);
  assert.match(h.parent.textContent, /保存した内容を採点しています/);
  await h.advance(4999); assert.doesNotMatch(h.parent.textContent, /★|確認が終わりました|10/);
  await h.advance(1); assert.equal(await h.panel.completed, result);
  assert.equal(section.attributes['aria-busy'], 'false');
  assert.match(h.parent.textContent, /確認が終わりました/); assert.match(h.parent.textContent, /★ 見出し/);
  assert.equal(h.panel.hasCompleteResult(),true);
  assert.equal(status.children.length, 0); assert.equal(h.pending.size, 0);
});
test('採点に5秒以上かかった場合は、完了後にさらに5秒待たせない', async () => {
  let finish; const h = setup(() => new Promise(resolve => { finish = resolve; }));
  await flush(); await h.advance(7000); assert.doesNotMatch(h.parent.textContent, /★/);
  assert.match(h.parent.textContent,/採点が続いています/);
  assert.equal(h.parent.children[0].attributes['aria-busy'],'true');
  assert.equal(h.parent.children[0].children[1].children[1].attributes.role,'progressbar');
  finish(result); await flush(); assert.equal(await h.panel.completed, result);
  assert.match(h.parent.textContent, /★ 見出し/);
});
test('モーダルを閉じると待機を解除し、遅い結果を表示しない', async () => {
  const h = setup(); await flush(); h.panel.dispose();
  assert.equal(h.pending.size, 0); assert.equal(h.signal.aborted, true);
  assert.equal(await h.panel.completed, null); assert.equal(h.parent.children[0].removed, true);
  assert.equal(h.panel.hasCompleteResult(),false);
  await h.advance(5000); assert.doesNotMatch(h.parent.textContent, /★/);
});
test('5秒の待機中に本文が変わったら旧結果を表示しない', async () => {
  const h = setup(); await flush(); h.stale(); await h.advance(5000);
  assert.equal(await h.panel.completed, null); assert.doesNotMatch(h.parent.textContent, /★/);
  assert.equal(h.panel.hasCompleteResult(),false);
  assert.match(h.parent.textContent, /内容が変わりました/);
});
test('採点失敗は待機せず案内し、旧GASフォームの利用を妨げない', async () => {
  const h = setup(async () => { throw Error('synthetic failure'); });
  assert.equal(await h.panel.completed, null); assert.equal(h.pending.size, 0);
  assert.equal(h.panel.hasCompleteResult(),false);
  assert.match(h.parent.textContent, /下の提出フォームはそのまま使えます/);
  assert.equal(h.parent.children[0].attributes['aria-busy'], 'false');
});
test('HTML11では5秒後にも未受領の★を付けない', async () => {
  const h = setup(async () => ({status:'receipt-only'})); await flush(); await h.advance(5000);
  await h.panel.completed; assert.match(h.parent.textContent, /受け付けた後に★がつきます/);
  assert.equal(h.panel.hasCompleteResult(),false);
  assert.equal(h.parent.children[0].children.some(node => node.className === 'local-grade-rules'), false);
});

test('HTML14の独立チェック表を5秒後に表示し、旧採点の確認待ちを表へ混ぜない', async () => {
  const value={status:'checked',receipt:{targetId:'html14-01',result:{state:'needs_review',rules:[{label:'画像ファイルの指定'}]}},
    feedback:{schema:'html-checkpoints-1',targetId:'html14-01',groups:[{title:'',legend:['画像','サイズ','代替テキスト'],
      rows:[{label:'写真02',checks:[{label:'画像',passed:false},{label:'サイズ',passed:true},{label:'alt',passed:true}]}]}]}};
  const h=setup(async()=>value);await flush();await h.advance(4999);assert.doesNotMatch(h.parent.textContent,/写真02/);
  await h.advance(1);await h.panel.completed;
  assert.equal(h.panel.hasCompleteResult(),true);
  assert.match(h.parent.textContent,/確認が終わりました/);assert.match(h.parent.textContent,/写真02☆★★/);
  assert.doesNotMatch(h.parent.textContent,/確認待ち|自動確認できません/);
  assert.match(h.parent.textContent,/この表示だけでは提出完了になりません/);
});
test('確認待ちの項目が残る従来表示では、GAS側の採点結果を省略しない',async()=>{
  const h=setup(async()=>({status:'checked',receipt:{result:{state:'needs_review',rules:[{label:'画像',passed:false}]}}}));
  await flush();await h.advance(5000);await h.panel.completed;
  assert.equal(h.panel.hasCompleteResult(),false);
  assert.match(h.parent.textContent,/フォーム内の結果も確認/);
});
test('結果の表示に失敗した場合も、表示済み扱いにせずGASの結果を残す',async()=>{
  const h=setup();h.parent.children[0].insertBefore=()=>{throw Error('synthetic DOM failure');};
  await flush();await h.advance(5000);assert.equal(await h.panel.completed,null);
  assert.equal(h.panel.hasCompleteResult(),false);assert.match(h.parent.textContent,/端末内での確認を利用できません/);
});
