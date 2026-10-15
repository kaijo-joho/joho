import test from 'node:test';
import assert from 'node:assert/strict';
import {questionGroups,validateRating,setRating} from '../navigation.mjs';
import {validateCatalog} from '../core.mjs';
import {demoCatalog} from '../demo.mjs';
import {demoRatings} from '../demo-ratings.mjs';
test('大問見出しと小問ボタンに分け、1問だけの大問は小問番号を省く',()=>{
  const set=validateCatalog(demoCatalog).sets.find(s=>s.setId==='demo-subquestions'),groups=questionGroups(set.questions);
  assert.deepEqual(groups.map(g=>g.title),['問1 気温の判定','問2 2次元リストの表','問3 必要な箱の数']);
  assert.deepEqual(groups.flatMap(g=>g.items.map(i=>i.title)),['(1) 気温を2つの場合に分ける','(2) 気温を3つの場合に分ける','表の作成と表示','(1) 必要な箱の数','(2) 入力を変えて確認']);
});
test('Colab由来の太字見出しと番号なしのtitleから小問を復元する',()=>{
  const base={version:'v1',kind:'code'},questions=[{...base,questionId:'a',title:'比較',prompt:'#**単元**\n#**問1 基本**\n##**(1) 比較**'},{...base,questionId:'b',title:'分類',prompt:'#**単元**\n#**問1 基本**\n##**(2) 分類**'}];
  assert.deepEqual(questionGroups(questions).flatMap(g=>g.items.map(i=>i.title)),['(1) 比較','(2) 分類']);
  assert.equal(questionGroups([{...base,questionId:'c',title:'画面出力',prompt:'操作用'}])[0].title,'');
});
test('デモは表示例18/32、確認用小問を集計しない',()=>{
  const set=validateCatalog(demoCatalog).sets.find(s=>s.setId==='demo-subquestions');
  assert.deepEqual(setRating(set,q=>demoRatings.get(`${q.version}/${q.questionId}`)),{earned:18,total:32,example:true});
});
test('未取得の問題を0点として集計せず、旧版を二重に足さない',()=>{
  const q={questionId:'a',version:'v1',kind:'code'},set={questions:[q,{...q,version:'v2'},{...q,questionId:'b'}]};
  assert.equal(setRating(set,()=>null),null);
  assert.deepEqual(setRating(set,()=>({earned:2,total:3})),{earned:4,total:6,example:false});
  assert.deepEqual(setRating({questions:[q]},()=>({earned:null,total:3})),{earned:0,total:3,example:false});
});
test('星の不正な値や版を拒否する',()=>{
  for(const raw of [{earned:4,total:3},{earned:-1,total:3},{earned:1.5,total:3},{earned:1,total:10001},{earned:1,total:3,version:'<script>'}])assert.throws(()=>validateRating(raw));
  assert.deepEqual(validateRating({earned:null,total:3,version:'v1'}),{earned:null,total:3,version:'v1',example:false});
});
