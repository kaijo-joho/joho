const slidesData = [
  {
    "section": "1. 絶対参照"
  },
  {
    "title": "1.1. 人口の割合",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【C30】に各区の人口の合計値はすでに入力されている。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【C7】に「=C7/C30」を入力し、確定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【C7】から【C29】までオートフィルをして、数式をコピーする。</span></span><br>",
    "image": "img_slide/ss14_03.png"
  },
  {
    "title": "1.2. オートフィルの結果の確認",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">オートフィルの結果【D8:D29】は「<span style=\"color:rgb(227, 59, 53);\">#DIV/0!</span>」となる。</span></span><br>※「<span style=\"color:rgb(227, 59, 53);\">#DIV/0!</span>」はゼロ除算エラー（ 0 または 値なし（空白のセル）で除算した場合のエラー）<br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【D8】を選択すると「=C8/C31」が入力されている。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">これは、オートフィルをすると、<strong>オートフィルの方向にセルの参照先も自動的に移動する</strong>からである。</span></span><br>",
    "image": "img_slide/ss14_04.png"
  },
  {
    "title": "1.3. 絶対参照のオートフィル",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【D7】に「=C7/C\\$30」を入力する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【D7】から【D29】にオートフィルする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【D8】を選択すると「=C8/C<span style=\"color:rgb(227, 59, 53);\">\\$30</span>」が入力されていることが確認できる。オートフィルをするときに、セルの参照先を行方向に移動させたくないので、行番号の前に「<span style=\"color:rgb(227, 59, 53);\">\\$</span>」をつける。</span></span><br><br><blockquote><strong>相対参照と絶対参照</strong></blockquote><blockquote>オートフィルをするときに、セルの参照先を自動的に移動させたくない場合、数式を入力するときに移動させたくない行または列番号の前に「<span style=\"color:rgb(227, 59, 53);\">\\$</span>」をつけて表す。このようなセル参照を<strong>絶対参照</strong>という。</blockquote><blockquote>これに対して、オートフィルをするときにセルの参照先が自動的に移動するセル参照を<strong>相対参照</strong>という。</blockquote><blockquote>・行方向に移動させたくない場合「A\\$1」</blockquote><blockquote>・列方向に移動させたくない場合「\\$A1」</blockquote><blockquote>・行方向にも列方向にも移動させたくない場合「\\$A\\$1」</blockquote><br>",
    "image": "img_slide/ss14_05.png"
  },
  {
    "title": "1.4. 表示形式をパーセントに設定",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【D7:D29】を選択し、メニューバーの《%》 をクリックし、《表示形式をパーセントに設定》する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">パーセント表示が適用される。</span></span><br><br>",
    "image": "img_slide/ss14_06.png"
  },
  {
    "title": "1.5. 表の書式設定",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【C30】に人口の割合の合計値を求める。（【C30】から右方向にオートフィルするか、「=SUM(D7:D29)」を入力する）</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【B6:D30】を選択し、表の枠線を設定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【B6:D6】を選択し、太字，下の枠線を太線，塗りつぶしの色を設定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>④</strong></span><span class=\"circBody\">【B7:B30】を選択し、太字を設定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>⑤</strong></span><span class=\"circBody\">【B29:B29】を選択し、下の枠線を二重線に設定する。</span></span><br><br>",
    "image": "img_slide/ss14_07.png"
  },
  {
    "section": "2. 絶対参照と関数"
  },
  {
    "title": "2.1. 順位を求める",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【D7】に「=RANK(C7, C7:C29)」と入力し、確定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【D7】から【D29】までオートフィルする。</span></span><br><br>",
    "image": "img_slide/ss14_09.png"
  },
  {
    "title": "2.2. 関数の絶対参照",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">絶対参照せずにオートフィルしたので、参照先のセルがひとつずつ下にずれている。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">行方向に移動させたくないので、行番号の前に「\\$」をつけて、オートフィルする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">値は１つ下にずれているが、セル範囲は固定されている。</span></span><br><br>",
    "image": "img_slide/ss14_10.png"
  },
  {
    "title": "2.3. 表の書式設定",
    "note": "書式設定をして完成させる（自分で好きな書式設定にしてよい）<br><br>",
    "image": "img_slide/ss14_11.png"
  },
  {
    "section": "3. 絶対参照の方向"
  },
  {
    "title": "3.1. 外貨換算表の作成（完成イメージ）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">為替レート表：各外貨１単位あたりの日本円で表されている（USD: 米ドル，EUR: ユーロ，AUD: 豪ドル）。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">換算表：日本円で100〜2000円のものを各外貨に換算したときに、いくらになるかを表す。各値は小数第２位になるように四捨五入する。</span></span><br>",
    "image": "img_slide/ss14_13.png"
  },
  {
    "title": "3.2. オートフィル（連続値）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B12】に「100」，【B13】に「200」と入力する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【B12:B13】を選択し、下方向に【B31】までオートフィルする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【B12:B31】に100, 200, 300, …, 2000の連続値が入力される。このように、オートフィルは数式のコピーだけではなく、連続値（規則性のある数列）も自動的に入力することができる。</span></span><br><br>",
    "image": "img_slide/ss14_14.png"
  },
  {
    "title": "3.3. 換算表の作成（やりたいこと）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">為替レート表は、各外貨１単位あたりの日本円で表されている（USD: 米ドル，EUR: ユーロ，AUD: 豪ドル）。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【C12】に数式を入力し、100円のものはUSDでいくらになるかを小数第２位になるように四捨五入する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【C12】を右方向にオートフィルして、日本円で100円をEUR，AUDに換算した値を求める。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>④</strong></span><span class=\"circBody\">【C12:E12】を下方向に【C31:E31】までオートフィルして換算表を作成する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>⑤</strong></span><span class=\"circBody\">【C12】に入力する数式を考えてみましょう。</span></span><br><br>",
    "image": "img_slide/ss14_15.png"
  },
  {
    "title": "3.4. 換算表の作成（入力すべき数式）",
    "note": "<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【C12】に「=ROUND(\\$B12/C\\$7, 2)」を入力する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">右方向、下方向にオートフィルする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">途中のセルで、参照先を確認する。</span></span><br>",
    "image": "img_slide/ss14_16.png",
    "showInDetails": true
  },
  {
    "title": "3.5. 参照元の値の更新",
    "note": "【C7】の値を「155」に変更すると、【C12:C31】の値も更新される。<br><br>",
    "image": "img_slide/ss14_17.png"
  },
  {
    "title": "3.6. 書式設定",
    "note": "書式設定をして完成させる（自分で好きな書式設定にしてよい）。<br><br>",
    "image": "img_slide/ss14_18.png"
  }
]
window.slidesData = slidesData;;