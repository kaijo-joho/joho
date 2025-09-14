const slidesData = [
  {
    "section": "1. 関数とは"
  },
  {
    "title": "1.1. 合計値を求める関数",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【C30】をクリックし「=SUM(」を入力する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【C7:C29】を選択する。（【C7:C29】が点線で囲まれる）</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">「)」を入力する。（関数の入力が終了する）</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>④</strong></span><span class=\"circBody\">⏎リターンキーを押す。（セルの数式の編集が確定し、合計値が表示される）</span></span><br><br>**関数とは**<br>特定の演算をする機能を**関数**といい、カッコ内に入れる値のことを**引数**（ひきすう）といいます。<br>また、関数によって得られた値のことを**戻り値**（もどりち）といいます。<br><br>",
    "image": "img_slide/ss13_03.png"
  },
  {
    "title": "1.2. 平均値・最大値・最小値を求める関数",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【C31】に「=AVERAGE(C7:C29)」を入力すると平均値を求められる。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【C32】に「=MAX(C7:C29)」を入力すると最大値を求められる。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【C33】に「=MIN(C7:C29)」を入力すると最小値を求められる。</span></span><br><br>",
    "image": "img_slide/ss13_04.png"
  },
  {
    "title": "1.3. 《練習》各区の面積の合計値・平均値・最大値・最小値",
    "note": "《練習》<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【D30】に各区の面積の合計値を求めなさい。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【D31】に各区の面積の平均値を求めなさい。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【D32】に各区の面積の最大値を求めなさい。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【D33】に各区の面積の最小値を求めなさい。</span></span><br>",
    "image": "img_slide/ss13_05.png"
  },
  {
    "section": "2. 引数が複数ある関数"
  },
  {
    "title": "2.1. 四捨五入",
    "note": "【E7】をクリックし「=ROUND(C7/D7, 0)」を入力すると、C7/D7 の値を四捨五入した値が求められる。（【C7】や【D7】は、各セルをクリックして選んでもよい）<br><br>",
    "image": "img_slide/ss13_07.png"
  },
  {
    "title": "2.2. 関数のオートフィル（１）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【E7】を選択しする【E29】までオートフィルして数式をコピーする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【E7:E29】まで同様に求めることができる。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【E29】をクリックし、数式が正しく適用できているか確認する。</span></span><br>",
    "image": "img_slide/ss13_08.png"
  },
  {
    "title": "2.2. 関数のオートフィル（２）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【D30:D33】を選択し、右に１列オートフィルして数式をコピーする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【E30:E33】の数式が正しくコピーされているかを確認する。</span></span><br><br>",
    "image": "img_slide/ss13_09.png"
  },
  {
    "section": "3. 表の書式設定"
  },
  {
    "title": "3.1. 表の書式設定（１）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B6:E33】を選択し、メニューバーの 《田》 をクリックし、「すべての枠線」をクリックし、枠線を設定する。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【B6:E6】と【B7:B33】を選択し、メニューバーの《B》をクリックして 太字 を設定する。</span></span><br><br>",
    "image": "img_slide/ss13_11.png"
  },
  {
    "title": "3.2. 表の書式設定（２）",
    "note": "<span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B6:E6】を選択し、表のタイトルの塗りつぶしの色を《明るいオレンジ 3》に変更する（他の色でもよい）。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【B6:E6】を選択し、下の枠線を《太線》にする。</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【B29:E29】を選択し、下の枠線を《二重線》にする。</span></span><br><br>",
    "image": "img_slide/ss13_12.png"
  }
]
window.slidesData = slidesData;;