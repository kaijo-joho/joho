const test = require('node:test');
const assert = require('node:assert/strict');
const Modes = require('../modes.js');
const Recovery = require('../recovery.js');
const base = 'https://joho.kaijo.ed.jp/tools/htmleditor/';

test('通常URLは自由編集、既存教材URLは実習、専用URLは最終課題に決まる',()=>{
  for (const href of [base,base+'index.html',base+'?mode=free']) assert.equal(Modes.resolve(href),'free');
  for (const query of ['lesson=html16','task=html16-01','mode=lesson&lesson=html16']) assert.equal(Modes.resolve(base+'?'+query),'lesson');
  assert.equal(Modes.resolve(base+'?mode=final'),'final');
  assert.equal(Modes.lessonLocation(base+'?mode=lesson&lesson=html16#top'),base+'?lesson=html16#top');
});
test('不明・重複・混在のモード指定では別課題を推測して起動しない',()=>{
  for(const query of ['mode=other','mode=','mode=final&mode=free','mode=final&lesson=html16','mode=free&task=html16-01','mode=final&document=https://example.com','mode=final#top']) assert.throws(()=>Modes.resolve(base+'?'+query),query);
  assert.throws(()=>Modes.resolve('javascript:alert(1)'));
});
test('別タブ入口には元の教材・課題・ハッシュ・URL入力の送信先を持ち込まない',()=>{
  const href=base+'index.html?lesson=html16&task=html16-01#top';
  assert.equal(Modes.link(href,'final'),base+'index.html?mode=final');
  assert.equal(Modes.link(href,'free'),base+'index.html');
});
test('要項の表示先はGoogleドキュメントに限定し、元の見出しリンクとタブを保つ',()=>{
  const id='x'.repeat(30),url='https://docs.google.com/document/d/'+id+'/edit?tab=t.0#heading=h.test';
  assert.deepEqual(Modes.documentUrls(url),{open:url,frame:'https://docs.google.com/document/d/'+id+'/preview?tab=t.0'});
  for(const bad of ['javascript:alert(1)','https://docs.google.com.evil.invalid/document/d/'+id+'/edit','https://user@docs.google.com/document/d/'+id+'/edit','https://example.com', 'http://docs.google.com/document/d/'+id+'/edit']) assert.equal(Modes.documentUrls(bad),null);
});
test('新規作成はHTML・CSSの相対名のみ。教材番号を含んでも課題の許可を生成しない',()=>{
  for(const name of ['index.html','style.css','pages/紹介.htm','html16-01.html']) assert.equal(Modes.fileName(name),name);
  for(const bad of ['/index.html','../x.html','pages/../x.html','a\\b.html','https://x/a.html','x.html?foo','a.js','.hidden.html','a//b.html']) assert.equal(Modes.fileName(bad),null,bad);
  assert.equal(Modes.initialSource('style.css'),'');
  assert.match(Modes.initialSource('index.html'),/<html lang="ja">/);
  assert.doesNotMatch(Modes.initialSource('index.html'),/joho-issued|identity|assignment/);
});
test('復旧形式は実習を保持し、最終課題・自由編集を別モードとして保存・選択できる',()=>{
  const data=new Map(); const storage={get length(){return data.size},key:i=>[...data.keys()][i],getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
  const r=Recovery.create(storage,{now:()=>1});
  for(const mode of ['lesson','final','free'])r.save({docId:'document-'+mode,fileName:'index.html',lessonId:mode==='lesson'?'html16':'',mode,kind:'auto',destination:'browser',content:'<html><body>'+mode+'</body></html>'});
  const result=r.list();assert.equal(result.errors.length,0);assert.equal(result.items.length,3);
  for(const mode of ['lesson','final','free'])assert.equal(result.items.filter(v=>v.mode===mode).length,1);
});
