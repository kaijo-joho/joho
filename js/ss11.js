const slidesData = [
  {
    "section": "1. スプレッドシートの画面"
  },
  {
    "title": "1.1. スプレッドシートの画面",
    "note": "&lt;p&gt;スプレッドシートを開くと、次のような画面になります。&lt;/p&gt;<br>&lt;p&gt;中央の広いスペースにあるマスのことを&lt;strong&gt;セル&lt;/strong&gt;といいます。また、画面の各所には操作をするための機能が配置されています。&lt;/p&gt;<br><br>",
    "image": "img_slide/ss11_03.png"
  },
  {
    "title": "1.2. アクティブセル",
    "note": "&lt;p&gt;現在選択しているセルのことを&lt;strong&gt;アクティブセル&lt;/strong&gt;といいます。&lt;br&gt;<br>セルにはひとつずつ番地が決まっていて、列番号（A，B，C，・・・）と行番号（1，2，3，・・・）を組み合わせて、&lt;b&gt;A1&lt;/b&gt;や&lt;b&gt;B3&lt;/b&gt;のように表現します。&lt;br&gt;<br>教材中のセルは&lt;b&gt;【B3】&lt;/b&gt;のように隅付き括弧を用いて表します。&lt;br&gt;<br>次の左図では、アクティブセルの番地は&lt;b&gt;B3&lt;/b&gt;です。&lt;br&gt;<br>また、右図では、複数のセル範囲を選択しています。その場合、「&lt;b&gt;【B3:C5】&lt;/b&gt;」のように表します。<br>&lt;/p&gt;<br><br>",
    "image": "img_slide/ss11_04.png"
  },
  {
    "section": "2. 文字と数字の入力"
  },
  {
    "title": "2.1. 文字の入力",
    "note": "&lt;p&gt;入力モードを&lt;strong&gt;《全角》&lt;/strong&gt;にし、対象のセルを選択した状態で文字を入力します。&lt;/p&gt;<br>&lt;p&gt;&lt;strong&gt;〈タブ⇥〉&lt;/strong&gt;を押すと、ひとつ右のセルが選択されます。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_06.png"
  },
  {
    "title": "2.2. 数字の入力",
    "note": "&lt;p&gt;入力モードを&lt;strong&gt;《半角》&lt;/strong&gt;にし、対象のセルを選択した状態で数値を入力します。&lt;/p&gt;<br>&lt;p&gt;&lt;strong&gt;〈リターン⏎〉&lt;/strong&gt;を押すと、入力が確定され、ひとつ下のセルが選択されます。&lt;/p&gt;<br><br>",
    "image": "img_slide/ss11_07.png"
  },
  {
    "title": "2.3. セルの値の消去",
    "note": "&lt;p&gt;入力モードを&lt;strong&gt;《半角》&lt;/strong&gt;にし、対象のセルを選択した状態で数値を入力します。&lt;/p&gt;<br>&lt;p&gt;&lt;strong&gt;〈リターン⏎〉&lt;/strong&gt;を押すと、入力が確定され、ひとつ下のセルが選択されます。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_08.png"
  },
  {
    "title": "2.3. 元に戻す操作",
    "note": "&lt;p&gt;直前の操作を取り消すときは、次の方法で「元に戻す」操作をします。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_09.png"
  },
  {
    "title": "2.4. 版の復元",
    "note": "&lt;p&gt;《版の復元》をすると、以前の状態まで戻すことができます。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_10.png"
  },
  {
    "section": "3. 数式の入力"
  },
  {
    "title": "3.1. 数式の入力（加算）",
    "note": "&lt;p&gt;数式を入力するときは、〈&lt;b&gt;=&lt;/b&gt;〉から続けて半角数字を入力します。&lt;br&gt;<br>足し算をするときは、数学と同じく〈&lt;b&gt;+&lt;/b&gt;〉を用います。&lt;br&gt;<br>入力完了後、〈リターン⏎〉を押して確定すると、計算結果が表示されます。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_12.png"
  },
  {
    "title": "3.2. 数式の入力（乗算）",
    "note": "&lt;p&gt;かけ算をするときは、〈&lt;b&gt;*&lt;/b&gt;〉（アスタリスク）を用います。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_13.png"
  },
  {
    "title": "3.3. 演算子と演算の順序",
    "note": "&lt;p&gt;四則演算をするときに用いる〈+〉や〈*〉のような記号を&lt;strong&gt;演算子&lt;/strong&gt;といいます。&lt;/p&gt;<br>&lt;p&gt;数学での数式と同様に、四則演算の順序は次のようになります。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_14.png"
  },
  {
    "title": "3.4. 演算の順序",
    "note": "&lt;p&gt;演算の順序は、数学での数式と同様に演算の順序は カッコの中，累乗，乗算・除算，加算・減算 の順に実行されます。&lt;/p&gt;<br>&lt;p&gt;カッコを使う場合は、小括弧「(   )」だけを使います。&lt;/p&gt;<br>&lt;p&gt;カッコの中にカッコを入れるときた場合（カッコの&lt;strong&gt;ネスト&lt;/strong&gt;という）は、内側のカッコ内から順に演算されます。&lt;/p&gt;<br>",
    "image": "img_slide/ss11_15.png"
  },
  {
    "title": "3.5. 《練習》数式の入力",
    "note": "",
    "image": "img_slide/ss11_16.png"
  },
  {
    "title": "3.6. 《練習》数式の入力（解答）",
    "note": "<br>",
    "image": "img_slide/ss11_17.png",
    "showInDetails": true
  }
]
window.slidesData = slidesData;;