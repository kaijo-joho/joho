const slidesData = [
  {
    "section": "1. セルの参照と数式"
  },
  {
    "title": "1.1. 「合計」列の見出しの作成",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【E3】をクリック&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">「合計」と入力&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">⏎リターンキーを押す（【E3】の編集が確定する）。</span></span><br>&lt;/p&gt;<br><br>",
    "image": "img_slide/ss12_03.png"
  },
  {
    "title": "1.2. 合計を求める",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【E4】をクリックし「=」を入力する&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【C4】をクリック（【C4】が点線で囲まれる）</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">「+」を入力</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>④</strong></span><span class=\"circBody\">【D4】をクリック（【C4】と【D4】が点線で囲まれる）</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>⑤</strong></span><span class=\"circBody\">⏎リターンキーを押す。</span></span><br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_04.png"
  },
  {
    "title": "1.3. オートフィル（数式のコピー）",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【E4】を選択する&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【E4】セルの右下の &lt;span style=\"color: RGB(25,76,196);\"&gt;●&lt;/span&gt; にポインタを乗せ、ポインタの形を ＋ にする&lt;br&gt;</span></span><br>（セル右下の &lt;span style=\"color: RGB(25,76,196);\"&gt;●&lt;/span&gt;  を &lt;strong&gt;フィルハンドル&lt;/strong&gt; という）&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【E26】まで&lt;strong&gt;ドラッグ&lt;/strong&gt;する</span></span><br><br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_05.png"
  },
  {
    "title": "1.4. 《練習》「人口性比」列の作成",
    "note": "&lt;p&gt;<br>《練習》<br>「人口性比※」とは、女性人口100人に対する男性の人口のことである。&lt;br&gt;<br>※ 統計局ホームページ/ 人口の基本属性に関する用語&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【F3】に「人口性比」と入力しなさい。</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">【F4】に数式を入力し、千代田区の人口性比を求めなさい。</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">【F4】から【F26】までオートフィルし、各区の人口性比を求めなさい。</span></span>&lt;br&gt;<br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_06.png"
  },
  {
    "section": "2. セルの書式設定"
  },
  {
    "title": "2.1. 数値の表示形式",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【F4:F26】を選択（【F4】にポインタを乗せて【F26】までドラッグ）&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">メニューバーの《小数点以下の桁数を減らす》をクリック</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">《小数点以下の桁数を減らす》を何回かクリックして、小数第２位まで表示させる（他のデータの場合には有効数字などを考えて桁数を合わせる）</span></span>&lt;br&gt;<br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_08.png"
  },
  {
    "title": "2.2. 表の枠線",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B3:F26】を選択（【B3】にポインタを乗せて【F26】までドラッグ）&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">メニューバーの 《</span></span>田》 をクリックし、《すべての枠線》をクリック&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>③</strong></span><span class=\"circBody\">表に枠線が適用される。</span></span>&lt;br&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>④</strong></span><span class=\"circBody\">セル範囲の選択を解除するときは、他のセルをクリックする。</span></span>&lt;br&gt;<br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_09.png"
  },
  {
    "title": "2.3. セルのテキストの書式",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B3:F3】を選択&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">メニューバーの 《</span></span>B》 をクリックして《太字》を設定する。&lt;br&gt;<br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_10.png"
  },
  {
    "title": "2.4. セルの塗りつぶしの色",
    "note": "&lt;p&gt;<br><span class=\"circLine\"><span class=\"circHead\"><strong>①</strong></span><span class=\"circBody\">【B3:F3】を選択&lt;br&gt;</span></span><br><span class=\"circLine\"><span class=\"circHead\"><strong>②</strong></span><span class=\"circBody\">メニューバーの 《</span></span>塗りつぶしの色》をクリックして、塗りつぶしの色を《明るい緑 3》にする（他の色でもよい）。&lt;br&gt;<br>&lt;/p&gt;<br>",
    "image": "img_slide/ss12_11.png"
  }
]
window.slidesData = slidesData;;