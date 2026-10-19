const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.resolve(__dirname,'../../..');
const catalog = JSON.parse(fs.readFileSync(path.join(root,'tools/htmleditor/grading/catalog.json')));
const compiled = Object.values(catalog.snapshots).find(s=>s.body.rubric.targetId==='html14-01').body.rubric;
const realm = vm.createContext({});
vm.runInContext(fs.readFileSync(path.join(root,'tools/htmleditor/grading/normal-engine.js'),'utf8'),realm);
vm.runInContext(fs.readFileSync(path.join(root,'tools/htmleditor/grading/image-checkpoints.js'),'utf8'),realm);
const full = fs.readFileSync(path.join(root,'html/answer1-4.html'),'utf8');
const clone = v=>JSON.parse(JSON.stringify(v));
const marks = view=>view?.groups[0].rows.map(r=>r.checks.map(c=>c.passed?'★':'☆').join(''));
function inspect(source,rubric=compiled) {
  realm.input=JSON.stringify({source,rubric});
  return clone(vm.runInContext(`(()=>{const {source,rubric}=JSON.parse(input);const result=HtmlNormalConfiguredGrader.gradeConfigured(source,rubric);
    const before=JSON.stringify(result);const view=HtmlImageCheckpoints.inspect(source,rubric,result);
    if(JSON.stringify(result)!==before)throw Error('mutated');return view;})()`,realm));
}
test('写真02のsrcをphoto01にしても画像だけ☆、サイズとaltは★になる',()=>{
  const view=inspect(full.replace('photo02.jpg','photo01.jpg'));
  assert.deepEqual(marks(view),['★★★','☆★★','★★★','★★★','★★★']);
  assert.doesNotMatch(JSON.stringify(view),/"(?:source|score|earned|points|location|src)":/);
});
test('写真01〜05の各src・サイズ・altは他の写真や項目と独立する',()=>{
  for(let i=1;i<=5;i++) {
    const n=String(i).padStart(2,'0');
    for(const [source,expected] of [
      [full.replace('photo'+n+'.jpg','photo99.jpg'),'☆★★'],
      [full.replace(new RegExp('(photo'+n+'\\.jpg" width=")\\d+'),'$1999'),'★☆★'],
      [full.replace('alt="写真'+n+'"','alt="間違い"'),'★★☆'],
      [full.replace('photo'+n+'.jpg','photo99.jpg').replace('alt="写真'+n+'"','alt="間違い"'),'☆★☆']
    ]) {
      const expectedRows=Array(5).fill('★★★');expectedRows[i-1]=expected;
      assert.deepEqual(marks(inspect(source)),expectedRows,n+' '+expected);
    }
  }
});
test('タグ・属性の記述順、./省略、エンティティ、大文字、引用符をHTMLとして読む',()=>{
  const line='<IMG ALT=&#x5199;&#x771f;02 HEIGHT=200 WIDTH=300 SRC=images/photo01.jpg>';
  const source=full.replace(/<img[^>]+photo02[^>]+>/,line);
  assert.equal(marks(inspect(source))[1],'☆★★');
  const tags=[...full.matchAll(/<img[^>]+>/g)].map(m=>m[0]);
  const reordered='<!doctype html><html><head><title>画像</title></head><body>'+tags.reverse().join('')+'</body></html>';
  assert.deepEqual(marks(inspect(reordered)),Array(5).fill('★★★'));
});
test('height省略の指定と、同じタグ上のwidth/heightのANDを維持する',()=>{
  for(const n of ['03','05']) assert.equal(marks(inspect(full.replace(new RegExp('(photo'+n+'\\.jpg"[^>]*?) alt='),'$1 height="200" alt=')))[Number(n)-1],'★☆★');
  assert.equal(marks(inspect(full.replace('width="300" height="200"','width="300" height="999"')))[1],'★☆★');
});
test('欠落はその写真だけ☆☆☆、コメントやコード・template内の偽タグは採点しない',()=>{
  const missing=full.replace(/<img[^>]+photo02[^>]+>/,'');
  assert.deepEqual(marks(inspect(missing)),['★★★','☆☆☆','★★★','★★★','★★★']);
  for(const [open,close] of [['<!--','-->'],['<template>','</template>'],['<pre>','</pre>'],['<code>','</code>'],['<noscript>','</noscript>']]) {
    const tag='<img src="images/photo02.jpg" width="300" height="200" alt="写真02">';
    assert.equal(marks(inspect(missing.replace('</body>',open+tag+close+'</body>')))[1],'☆☆☆');
  }
});
test('曖昧な複数タグ・余分なタグ・構造エラー・隠し要素・CSS・base・レスポンシブは推測しない',()=>{
  for(const source of [
    full.replace('</body>','<img src="images/photo01.jpg" width="480" height="320" alt="写真01"></body>'),
    full.replace('photo01.jpg','unknown1.jpg').replace('photo02.jpg','unknown2.jpg').replace('alt="写真01"','alt="?"').replace('alt="写真02"','alt="?"'),
    full.replace('width="300"','width="300" width="300"'),
    full.replace('<body>','<body hidden>'),
    full.replace('<body>','<body style="display:none">'),
    full.replace('</head>','<base href="https://example.invalid/"></head>'),
    full.replace('alt="写真02"','alt="写真02" srcset="https://example.invalid/x 2x"'),
    full.replace('</body>','<!-- 閉じ忘れ')
  ]) assert.equal(inspect(source),null);
});
test('既知の凍結基準・4有効規則だけを対象にし、未知版や無効規則へ転用しない',()=>{
  for(const rubric of [{...compiled,version:'future'},{...compiled,targetId:'html15-01'},
    {...compiled,rules:compiled.rules.map((r,i)=>i ? r : {...r,enabled:false})}]) assert.equal(inspect(full,rubric),null);
});
