const slidesData = [
  {
    "section": "1. 条件分岐 IF関数"
  },
  {
    "title": "1.1 IF関数とは",
    "note": "**IF関数**は、指定した条件を判定し、その結果に応じて異なる値を表示させるときに使う関数です。\n```=IF(論理式, TRUE値, FALSE値)```\n**論理式**（条件式）の結果に基づいて、論理式が**真（ TRUE）**の場合の値、論理式が**偽（FALSE）**のときの値をそれぞれ返します。\nたとえば、【B1】に\n```=IF(A1>10, \"10より大きい\", \"10以下\")```\nと入力したら、【A1】の値が10より大きい場合に「10より大きい」、そうでない場合に「10以下」と表示します。\n**論理式**には*>*や*<*などの**比較演算子**を用いて表す。",
    "image": "img_slide/ss21_03.png"
  },
  {
    "title": "例題1. 合否判定①",
    "note": "**実習ファイル**の**例題1**に取り組みましょう。",
    "image": "img_slide/ss21_04.png"
  },
  {
    "title": "例題1. 合否判定②",
    "note": "",
    "image": "img_slide/ss21_05.png",
    "showInDetails": true
  },
  {
    "section": "2. 複雑な条件"
  },
  {
    "title": "2.1. AND関数・OR関数",
    "note": "複数の条件を組み合わせてIF関数の論理式を組み立てるときには、**AND関数**や**OR関数**を使います。\n**AND関数**はすべての条件を満たした場合に真（TRUE）となり、**OR関数**はいずれかの条件を満たす場合に真（TRUE）となります。",
    "image": "img_slide/ss21_07.png"
  },
  {
    "title": "例題2. 合否判定②",
    "note": "**実習ファイル**の**例題2**に取り組みましょう。",
    "image": "img_slide/ss21_08.png"
  },
  {
    "title": "例題2. 合否判定②",
    "note": "",
    "image": "img_slide/ss21_09.png",
    "showInDetails": true
  },
  {
    "title": "例題3. テーマパークのチケット料金①",
    "note": "**実習ファイル**の**例題3**に取り組みましょう。",
    "image": "img_slide/ss21_10.png"
  },
  {
    "title": "例題3. テーマパークのチケット料金①",
    "note": "",
    "image": "img_slide/ss21_11.png",
    "showInDetails": true
  },
  {
    "section": "3. IF関数のネストとIFS関数"
  },
  {
    "title": "3.1. IF関数のネスト",
    "note": "IF関数を**ネスト（入れ子）**にすると、複雑な条件を指定することができます。",
    "image": "img_slide/ss21_13.png"
  },
  {
    "title": "3.2. IFS関数",
    "note": "**IFS関数**を使うと、前ページのようにIF関数をネストする必要がないので便利です。",
    "image": "img_slide/ss21_14.png"
  },
  {
    "title": "例題4. テーマパークのチケット料金②",
    "note": "**実習ファイル**の**例題4**に取り組みましょう。",
    "image": "img_slide/ss21_15.png"
  },
  {
    "title": "例題4. テーマパークのチケット料金②",
    "note": "",
    "image": "img_slide/ss21_16.png",
    "showInDetails": true
  }
]
window.slidesData = slidesData;;