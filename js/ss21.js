const slidesData = [
  {
    "section": "1. 条件分岐 IF関数"
  },
  {
    "title": "1.1 IF関数とは",
    "note": "<strong>IF関数</strong>は、指定した条件を判定し、その結果に応じて異なる値を表示させるときに使う関数です。<br><pre class=\"codeInDescription\"><code>=IF(論理式, TRUE値, FALSE値)</code></pre><br><strong>論理式</strong>（条件式）の結果に基づいて、論理式が<strong>真（ TRUE）</strong>の場合の値、論理式が<strong>偽（FALSE）</strong>のときの値をそれぞれ返します。<br>たとえば、【B1】に<br><pre class=\"codeInDescription\"><code>=IF(A1&gt;10, \"10より大きい\", \"10以下\")</code></pre><br>と入力したら、【A1】の値が10より大きい場合に「10より大きい」、そうでない場合に「10以下」と表示します。<br><strong>論理式</strong>には<em>&gt;</em>や<em>&lt;</em>などの<strong>比較演算子</strong>を用いて表す。<br>",
    "image": "img_slide/ss21_03.png"
  },
  {
    "title": "例題1. 合否判定①",
    "note": "<strong>実習ファイル</strong>の<strong>例題1</strong>に取り組みましょう。<br>",
    "image": "img_slide/ss21_04.png"
  },
  {
    "title": "例題1. 合否判定②",
    "note": "<br><br>",
    "image": "img_slide/ss21_05.png",
    "showInDetails": true
  },
  {
    "section": "2. 複雑な条件"
  },
  {
    "title": "2.1. AND関数・OR関数",
    "note": "複数の条件を組み合わせてIF関数の論理式を組み立てるときには、<strong>AND関数</strong>や<strong>OR関数</strong>を使います。<br><strong>AND関数</strong>はすべての条件を満たした場合に真（TRUE）となり、<strong>OR関数</strong>はいずれかの条件を満たす場合に真（TRUE）となります。<br>",
    "image": "img_slide/ss21_07.png"
  },
  {
    "title": "例題2. 合否判定②",
    "note": "<strong>実習ファイル</strong>の<strong>例題2</strong>に取り組みましょう。<br><br>",
    "image": "img_slide/ss21_08.png"
  },
  {
    "title": "例題2. 合否判定②",
    "note": "<br><br>",
    "image": "img_slide/ss21_09.png",
    "showInDetails": true
  },
  {
    "title": "例題3. テーマパークのチケット料金①",
    "note": "<strong>実習ファイル</strong>の<strong>例題3</strong>に取り組みましょう。<br><br>",
    "image": "img_slide/ss21_10.png"
  },
  {
    "title": "例題3. テーマパークのチケット料金①",
    "note": "<br><br>",
    "image": "img_slide/ss21_11.png",
    "showInDetails": true
  },
  {
    "section": "3. IF関数のネストとIFS関数"
  },
  {
    "title": "3.1. IF関数のネスト",
    "note": "IF関数を<strong>ネスト（入れ子）</strong>にすると、複雑な条件を指定することができます。<br>",
    "image": "img_slide/ss21_13.png"
  },
  {
    "title": "3.2. IFS関数",
    "note": "<strong>IFS関数</strong>を使うと、前ページのようにIF関数をネストする必要がないので便利です。<br>",
    "image": "img_slide/ss21_14.png"
  },
  {
    "title": "例題4. テーマパークのチケット料金②",
    "note": "<strong>実習ファイル</strong>の<strong>例題4</strong>に取り組みましょう。<br><br>",
    "image": "img_slide/ss21_15.png"
  },
  {
    "title": "例題4. テーマパークのチケット料金②",
    "note": "<br><br>",
    "image": "img_slide/ss21_16.png",
    "showInDetails": true
  }
]
window.slidesData = slidesData;;