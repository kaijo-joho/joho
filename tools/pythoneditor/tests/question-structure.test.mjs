import test from 'node:test';
import assert from 'node:assert/strict';
import { questionStructure, promptHeadings, normalizePromptMarkdown } from '../question-structure.mjs';
import { questionGroups } from '../navigation.mjs';

const make = (title, prompt) => Object.freeze({ questionId: 'example-1', setId: 'example', version: 'v1', title, prompt, templateCode: 'print(1)' });
test('冒頭の単元・大問・重複する小問は表示から分け、共通説明と入出力例を残す', () => {
  const q = make('表示を確かめる', '#**9-1. 表示** 基本問題\n\n#**問1 表示の確認**\n\n共通の注意です。\n\n##**(1) 表示を確かめる**\n\n問題の本文です。\n\n#### 入出力例\n> 表示例\n\n提出時の注意です。');
  const original = JSON.stringify(q), view = questionStructure(q);
  assert.equal(view.title, '問1 (1) 表示を確かめる'); assert.equal(view.groupTitle, '問1 表示の確認');
  assert.equal(view.prompt, '共通の注意です。\n\n\n\n問題の本文です。\n\n#### 入出力例\n> 表示例\n\n提出時の注意です。');
  assert.equal(JSON.stringify(q), original);
});
test('小問見出しにしかない解法・条件は本文に残す', () => {
  const q = make('解法A', '#**9-1. 表示**\n#**問1 繰り返し**\n\n##**(1) range(a)を使う場合**\n\n本文');
  const view = questionStructure(q);
  assert.equal(view.title, '問1 (1) 解法A'); assert.match(view.prompt, /range\(a\)を使う場合/);
});
test('タイトルに含まれる小問の短い見出しは重複させない', () => {
  const view = questionStructure(make('問2 (3) 名前を表示する', '# 問2 出力\n\n## (3) 表示する\n\n本文'));
  assert.equal(view.title, '問2 (3) 名前を表示する'); assert.equal(view.prompt, '本文');
});
test('コードフェンス内のコメントを見出しとして読まず、表示用の正規化でも書き換えない', () => {
  const code = '```python\n#**問99 サンプル内のコメント**\n##(9) 同じくコメント\nprint("value")\n```';
  const prompt = '#**問1 表示**\n\n##**(1) 確認**\n\n' + code + '\n\n###入出力例\n表示';
  const view = questionStructure(make('確認', prompt));
  assert.equal(view.groupKey, '問1'); assert.ok(view.prompt.includes(code));
  assert.equal(promptHeadings(code).length, 0); assert.equal(normalizePromptMarkdown(code), code);
  assert.match(normalizePromptMarkdown(view.prompt), /### 入出力例/);
});
test('長さの異なる閉じフェンス・波形フェンス・字下げコードを区別する', () => {
  const prompt = '~~~~python\n#**問99**\n~~~\n#**問98**\n~~~~\n\n    #**問97**\n\n#**問2 本当の見出し**';
  assert.deepEqual(promptHeadings(prompt).map(h => h.text), ['問2 本当の見出し']);
});
test('太字・全角番号・インラインコードを表示名として読み、コードのべき乗記号を保持する', () => {
  const view = questionStructure(make('問１ （２） a**b', '#**問１ 計算**\n\n##**（２） `a**b`**\n\n本文'));
  assert.equal(view.title, '問1 (2) a**b'); assert.equal(view.prompt, '本文');
});
test('発展問題を通常の問と別にまとめ、採点対象外の注記を大問見出しへ保持する', () => {
  const q = make('探索の回数', '#**9-1. 探索**\n\n#**発展問題1 比較（採点対象外）**\n\n共通説明\n\n##**(1) 探索の回数**\n\n本文');
  const view = questionStructure(q);
  assert.equal(view.title, '発展問題1 (1) 探索の回数'); assert.equal(view.groupTitle, '発展問題1 比較（採点対象外）');
  assert.equal(questionGroups([q])[0].title, view.groupTitle); assert.match(view.prompt, /共通説明/);
});
test('構造と確認できない見出し・途中の章見出し・箇条書きはそのまま残す', () => {
  const prompt = '# 手順\n\n本文\n\n# 9-2. 本文内の補足\n\n- 条件を確認する';
  const view = questionStructure(make('表示', prompt));
  assert.equal(view.title, '表示'); assert.equal(view.prompt, prompt);
});

test('箇条書き内のフェンスとraw HTMLのコードコメントを本文から削らない', () => {
  for (const code of ['- ```python\n  #**問99 コード内コメント**\n  print(1)\n  ```', '<pre><code>\n#**問99 コード内コメント**\nprint(1)\n</code></pre>']) {
    const prompt = code + '\n\n# 問1 本文\n\n本文です。';
    const view = questionStructure(make('確認', prompt));
    assert.equal(view.groupKey, '問1'); assert.ok(view.prompt.includes(code));
    assert.equal(normalizePromptMarkdown(code), code);
  }
});
test('titleの小問番号と同じ後続見出しを選び、他の小問の本文は残す', () => {
  const q = make('問1 (2) 分類', '# 問1 基本\n\n## (1) 比較\n\n比較の説明\n\n## (2) 分類\n\n分類の説明');
  const view = questionStructure(q);
  assert.match(view.prompt, /## \(1\) 比較/); assert.doesNotMatch(view.prompt, /## \(2\) 分類/);
  assert.match(view.prompt, /比較の説明/); assert.match(view.prompt, /分類の説明/);
});
test('title内に既にある小問番号を、表示タイトルと一覧で重複させない', () => {
  const q = make('比較 (1) 手順A', '# 問1 比較\n\n## (1) 手順A\n\n本文');
  const view = questionStructure(q); assert.equal(view.title, '問1 比較 (1) 手順A');
  const other = { ...q, questionId: 'example-2', title: '比較 (2) 手順B', prompt: '# 問1 比較\n\n## (2) 手順B\n\n本文' };
  assert.deepEqual(questionGroups([q,other])[0].items.map(i => i.title), ['比較 (1) 手順A','比較 (2) 手順B']);
});

test('本文のコード字下げと末尾のMarkdown改行用空白を保持する', () => {
  const body = '    print(1)\n\n注意です。  \n';
  assert.equal(questionStructure(make('表示', '# 問1 表示\n\n' + body)).prompt, body);
});
test('同じ番号の大問で条件が異なるときは、一覧にない見出しを本文へ残す', () => {
  const first = make('問1 (1) 比較', '# 問1 整数の比較（0以上の値）\n\n## (1) 比較\n\n本文');
  const second = { ...make('問1 (2) 比較', '# 問1 整数の比較（10以上の値）\n\n## (2) 比較\n\n本文'), questionId: 'example-2' };
  const group = questionGroups([first, second])[0];
  assert.equal(group.title, '問1 整数の比較（0以上の値）');
  assert.doesNotMatch(questionStructure(first, { groupTitle: group.title }).prompt, /0以上/);
  assert.match(questionStructure(second, { groupTitle: group.title }).prompt, /10以上の値/);
});
