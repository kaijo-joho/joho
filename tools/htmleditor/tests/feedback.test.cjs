const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const F = require('../feedback.js');
const root = path.resolve(__dirname,'../../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'tools/htmleditor/grading/catalog.json')));
const realm = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'tools/htmleditor/grading/normal-engine.js'),'utf8'),realm);
function grade(id, source) {
  const rubric = Object.values(catalog.snapshots).find(s=>s.body.rubric.targetId===id).body.rubric;
  realm.json = JSON.stringify(rubric); realm.source = source;
  return JSON.parse(JSON.stringify(vm.runInContext('HtmlNormalConfiguredGrader.gradeConfigured(source,JSON.parse(json))',realm)));
}
const full = fs.readFileSync(path.join(root,'html/answer1-4.html'),'utf8');
const marks = view => view.groups.flatMap(g=>g.rows.map(r=>r.checks.map(c=>c.passed?'★':'☆').join('')));
function fixture(id, rules) {
  return {state:'graded',engineVersion:catalog.bindings.find(b=>b.targetId==='html14-01').engineVersion,rubricVersion:'2026-09-normal-gss-draft-1',rubricId:id,
    rules:Object.entries(rules).map(([ruleId,values])=>({ruleId,points:60,checks:values.map(v=>typeof v==='boolean'?{passed:v}:v)}))};
}
test('html14は正しい解答を写真5行・15星へ変換し、得点・判定を変更しない',()=>{
  const result = grade('html14-01',full), before = JSON.stringify(result), view = F.build(result);
  assert.equal(result.state,'graded'); assert.equal(result.score,1);
  assert.deepEqual(marks(view),Array(5).fill('★★★'));
  assert.deepEqual(view.groups[0].rows.map(r=>r.label),['写真01','写真02','写真03','写真04','写真05']);
  assert.equal(view.groups[0].rows.flatMap(r=>r.checks).length,15);
  assert.equal(JSON.stringify(result),before);
  assert.doesNotMatch(JSON.stringify(view),/"(?:points|earned|score|location|src|fileId)":/);
});
test('写真ごとの画像・サイズ・altは固定順であり、★を左へ詰めない',()=>{
  const wrongWidth = grade('html14-01',full.replace('width="300" height="200"','width="999" height="200"'));
  assert.deepEqual(marks(F.build(wrongWidth)),['★★★','★☆★','★★★','★★★','★★★']);
  const wrongAlt = grade('html14-01',full.replace('alt="写真04"','alt="写真02"'));
  assert.equal(marks(F.build(wrongAlt))[3],'★★☆');
  const missing = grade('html14-01',full.replace(/<img[^>]+photo05[^>]+>/,''));
  assert.equal(marks(F.build(missing))[4],'☆☆☆');
});
test('写真03・05のheight省略を確認し、widthとheightは同じ画像でともに正しい必要がある',()=>{
  for (const number of ['03','05']) {
    const edited = full.replace(new RegExp('(photo'+number+'\\.jpg"[^>]*?) alt='),'$1 height="200" alt=');
    const view = F.build(grade('html14-01',edited));
    assert.equal(marks(view)[Number(number)-1],'★☆★');
  }
  const crossed = full.replace('photo01.jpg','__swap__.jpg').replace('photo02.jpg','photo01.jpg').replace('__swap__.jpg','photo02.jpg');
  assert.deepEqual(marks(F.build(grade('html14-01',crossed))).slice(0,2),['★☆☆','★☆☆']);
  const duplicate = full.replace('</body>','<img src="images/photo01.jpg" width="480" height="320" alt="写真01"></body>');
  assert.equal(F.build(grade('html14-01',duplicate)),null);
});
test('未知の版・不明な構造・無効rule・確認待ち・過去の集計だけの記録から細かい星を推測しない',()=>{
  const r = grade('html14-01',full);
  for (const change of [x=>x.state='needs_review',x=>x.rubricVersion='future',x=>x.engineVersion='other',x=>delete x.rules[0].checks,x=>x.rules[0].checks.pop(),x=>x.rules[0].enabled=false,x=>x.rules.push({...x.rules[0]}),x=>x.rules[0].checks[0].passed=null]) {
    const value = structuredClone(r); change(value); assert.equal(F.build(value),null);
  }
  assert.equal(F.build(grade('html14-01',full.replace('alt="写真01"','alt="自由な説明"'))),null);
  assert.equal(F.build(fixture('html11-01',{})),null);
});
test('リンクとページ内リンクは対象ごとの順序と画像3条件のANDを保つ',()=>{
  const links = F.build(fixture('html15-01',{'relative-page-links':[true,false,true,true],'external-links':[true,true,false],'external-new-tab':[false,true,false]}));
  assert.deepEqual(marks(links),['★','☆','★','★','★☆','★★','☆☆']);
  const topics = F.build(fixture('html15-02',{'contents-heading':[true],'matching-fragment-links':[true,false,true],'topic-headings':[true,true,true],'topic-images':[true,false,true,true,true,true,true,true,false]}));
  assert.deepEqual(marks(topics),['★','★★☆','☆★★','★★☆']);
});
test('入れ子は第2階層3/3/2、第3階層3/0/5の順序を維持する',()=>{
  const r = fixture('html16-01',{'ingredients-list':Array(7).fill(true),'procedure-list':Array(9).fill(true),'nested-topics':[true,true,true],'nested-second-level':[true,true,true,false,true,true,true,false],'nested-third-level':[true,true,true,false,true,true,true,false]});
  const view = F.build(r);
  assert.deepEqual(view.groups.slice(2).map(g=>g.rows.length),[7,4,8]);
  assert.equal(view.groups[3].rows[1].label,'開示'); assert.equal(view.groups[3].rows[1].checks[0].passed,false);
  assert.equal(view.groups[4].rows[2].label,'匿名加工情報の利用'); assert.equal(view.groups[4].rows[2].checks[0].passed,false);
  const empty = grade('html16-01','<!doctype html><html lang="ja"><head><title>リスト</title></head><body></body></html>');
  assert.equal(empty.state,'graded'); assert(F.build(empty));
  assert(marks(F.build(empty)).every(s=>/^☆+$/.test(s)));
});
test('表の構造・行ごとのセル・結合・自作表は元の条件だけで確認する',()=>{
  const view = F.build(fixture('html17-01',{'ordinary-table':[true,true,true,false,true,true,true,true],'horizontal-spans':[true,false,true],'vertical-span':[true,true],'original-table':[true,false,true]}));
  assert.deepEqual(marks(view),['★★☆★','★☆★','★★','★☆★']);
});
test('指定CSSはプロパティ順×要素順の配列を使い、同じタグが複数ある場合も混同しない',()=>{
  const view = F.build(fixture('html22-01',{'specified-h1':[true,true,true,true,true,true],'specified-h2':[true,true,false,true,true,true],'specified-h3':[true,true,true],'specified-paragraph':[true,true,true,false],'specified-strong':[true,true],'specified-emphasis':[true]}));
  assert.deepEqual(marks(view),['★★★','★☆★','★★★','★☆','★★','★']);
});
test('自由CSSは対象ごとの既存配点から境界を復元し、色や具体値の条件を追加しない',()=>{
  const view = F.build(fixture('html22-02',{'free-targets':[{passed:true,points:5},{passed:false,points:5},...Array(5).fill({passed:true,points:10})],'free-color':[true],'free-size':[false],'free-family':[true],'free-emphasis':[true]}));
  assert.deepEqual(marks(view),['☆','★','★','★','★','★','★','☆','★','★']);
  assert.equal(F.build(fixture('html22-02',{'free-targets':Array(6).fill({passed:true,points:9}),'free-color':[true],'free-size':[true],'free-family':[true],'free-emphasis':[true]})),null);
});
test('クラスとブロックの書式を対象別に転置し、各星の位置を保持する',()=>{
  assert.deepEqual(marks(F.build(fixture('html23-01',{'class-paragraph1':[true,true],'class-paragraph2':[true,false],'class-paragraph3':[false,true],'class-paragraph4':[true,true]}))),['★★','★☆','☆★','★★']);
  assert.deepEqual(marks(F.build(fixture('html24-01',{'block-width':[true,false,true,true,true],'block-height':Array(5).fill(true),'block-padding':Array(5).fill(true),'block-margin':[true,true,false,true,true],'block-border':Array(5).fill(true)}))),['★★★★★','☆★★★★','★★★☆★','★★★★★','★★★★★']);
});
class Node {
  constructor(tag) { this.tagName = tag; this.children = []; this.attributes = {}; this.events = {}; this.value = ''; }
  append(...n) { this.children.push(...n); }
  set textContent(v) { this.value = v; this.children = []; } get textContent() { return this.value+this.children.map(n=>n.textContent).join(''); }
  setAttribute(k,v) { this.attributes[k] = v; }
  removeAttribute(k) { delete this.attributes[k]; }
  contains(node) { return this===node || this.children.some(child=>child.contains?.(node)); }
  getBoundingClientRect() { return this.rect || (this.className==='html-grade-tooltip' ? {width:260,height:60} : {left:330,top:700,bottom:732,width:32}); }
  addEventListener(k,fn) { this.events[k] = fn; }
}
function documentMock() {
  const events={},windowEvents={};
  return {events,windowEvents,createElement:t=>new Node(t),
    addEventListener(k,fn){events[k]=fn;},removeEventListener(k,fn){if(events[k]===fn)delete events[k];},
    defaultView:{innerWidth:390,innerHeight:760,addEventListener(k,fn){windowEvents[k]=fn;},removeEventListener(k,fn){if(windowEvents[k]===fn)delete windowEvents[k];}}};
}
test('表はテキストDOMだけで作り、ホバー・クリック・キーボードで固定配置の説明を示す',()=>{
  const view = F.build(grade('html14-01',full)); view.groups[0].rows[0].label = '<img onerror=alert(1)>';
  const doc = documentMock();
  const rendered = F.render(view,doc), section = rendered.children[0], table = section.children[1];
  const button = table.children[1].children[0].children[1].children[1], detail = rendered.children.at(-1);
  assert.equal(button.textContent,'★'); assert.equal(button.attributes['aria-label'],'<img onerror=alert(1)>：サイズ（width・height）：達成');
  assert.equal(button.events.mouseenter,undefined,'スクロール由来のmouseenterでは開かない');
  button.events.pointermove(); assert.equal(detail.hidden,false); assert.match(detail.textContent,/サイズ/);
  const positioned = detail.attributes.style; button.events.pointermove(); assert.equal(detail.attributes.style,positioned);
  assert.equal(detail.attributes.role,'tooltip'); assert.equal(button.attributes['aria-describedby'],detail.id);
  assert.equal(button.attributes['aria-expanded'],undefined); assert.equal(section.children.length,2,'表の下へ説明の段落を作らない');
  assert.match(detail.attributes.style,/left:122px;top:635px/); assert.equal(detail.attributes['data-placement'],'top');
  let stopped = 0, prevented = 0;
  const escape = {key:'Escape',preventDefault(){prevented++;},stopPropagation(){stopped++;}};
  doc.events.keydown(escape); assert.equal(detail.hidden,true); assert.equal(stopped,1); assert.equal(prevented,1);
  assert.equal(doc.events.keydown,undefined,'説明が閉じた後のEscapeは提出画面へ渡す');
  button.events.click(); assert.equal(detail.hidden,false); button.events.blur(); assert.equal(detail.hidden,true);
  assert.equal(button.attributes['aria-describedby'],undefined);
  const unsafe = structuredClone(view); unsafe.groups[0].rows[0].checks[0].passed='yes'; assert.equal(F.publicView(unsafe,view.targetId),null);
  F.dispose(rendered);
});
test('説明へのポインター移動は表示を保ち、外側タップ・スクロール・リサイズで閉じる',()=>{
  const doc=documentMock(),root=F.render(F.build(grade('html14-01',full)),doc),tip=root.children.at(-1);
  const buttons=root.children[0].children[1].children[1].children[0].children[1].children,button=buttons[0];
  button.events.pointermove();button.events.mouseleave({relatedTarget:tip});assert.equal(tip.hidden,false);
  tip.events.mouseleave({relatedTarget:new Node('p')});assert.equal(tip.hidden,true);
  button.events.click();doc.events.pointerdown({target:button});assert.equal(tip.hidden,false);
  doc.events.pointerdown({target:new Node('p')});assert.equal(tip.hidden,true);
  doc.activeElement=button;button.events.focus();button.events.mouseleave({relatedTarget:null});assert.equal(tip.hidden,false);
  doc.events.scroll({target:tip});assert.equal(tip.hidden,false);doc.activeElement=null;
  doc.events.scroll({target:new Node('div')});assert.equal(tip.hidden,true);
  button.events.focus();doc.windowEvents.resize();assert.equal(tip.hidden,true);
  button.events.focus();buttons[1].events.pointermove();assert.equal(button.attributes['aria-describedby'],undefined);
  assert.equal(buttons[1].attributes['aria-describedby'],tip.id);
  F.dispose(root);assert.equal(tip.hidden,true);assert.equal(Object.keys(doc.events).length,0);assert.equal(Object.keys(doc.windowEvents).length,0);
});
test('Tabのfocus後の自動スクロールでは見えている星に追随し、画面外へ出たら閉じる',()=>{
  const doc=documentMock(),root=F.render(F.build(grade('html14-01',full)),doc),tip=root.children.at(-1);
  const button=root.children[0].children[1].children[1].children[0].children[1].children[0];
  doc.activeElement=button;button.events.focus();doc.events.scroll({target:new Node('div')});assert.equal(tip.hidden,false);
  button.rect={left:100,top:300,bottom:332,width:32};doc.events.scroll({target:new Node('div')});
  assert.equal(tip.hidden,false);assert.match(tip.attributes.style,/top:337px/);
  button.rect={left:100,top:800,bottom:832,width:32};doc.events.scroll({target:new Node('div')});assert.equal(tip.hidden,true);
  F.dispose(root);
});
test('別の採点表を開くと旧説明を閉じ、モーダル終了・disposeでイベントを残さない',()=>{
  const doc=documentMock(),view=F.build(grade('html14-01',full)),a=F.render(view,doc),b=F.render(view,doc);
  const button=root=>root.children[0].children[1].children[1].children[0].children[1].children[0];
  button(a).events.focus();button(b).events.focus();assert.equal(a.children.at(-1).hidden,true);
  assert.equal(b.children.at(-1).hidden,false);doc.events.close();assert.equal(b.children.at(-1).hidden,true);
  button(b).events.focus();F.dispose({querySelectorAll:()=>[a,b]});assert.equal(Object.keys(doc.events).length,0);
});
test('ツールチップは通常レイアウト外、進捗バーは5秒後も完了前に留め、動きを減らす設定に従う',()=>{
  const css=fs.readFileSync(path.join(root,'tools/htmleditor/feedback.css'),'utf8');
  assert.match(css,/\.html-grade-tooltip\s*\{[^}]*position:\s*fixed/);assert.doesNotMatch(css,/html-grade-detail/);
  assert.match(css,/@keyframes local-grade-wait[^}]+scaleX\(0\)[\s\S]+scaleX\(\.95\)/);
  assert.match(css,/@media \(prefers-reduced-motion: reduce\)[^}]*animation:\s*none/);
});
test('長い採点表でも提出モーダルの本文がスクロールし、フォームを縮めて隠さない',()=>{
  const css = fs.readFileSync(path.join(root,'tools/htmleditor/editor.css'),'utf8');
  assert.match(css,/#actionDialog\.submission-open #actionBody\s*\{[^}]*overflow-y:\s*auto/);
  assert.match(css,/#actionDialog\.submission-open #actionBody > \*\s*\{[^}]*flex-shrink:\s*0/);
});
