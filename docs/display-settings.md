# 表示設定とコード例の共通操作

2026-10-26。教材サイトの表示だけを扱う。実習ファイル、生徒プレビューのCSS、本人情報、フォルダ接続、学習データは変更しない。

## 親子接続API（version 1）

`js/display_settings.js`が`window.siteDisplaySettings`を用意する。通常教材では`js/main.js`が読み込み、専用エディタでは同ファイルだけを直接読み込める。エディタ側は同一originかつ所有を確認した解説iframeだけに適用する。

```js
const state = frame.contentWindow.siteDisplaySettings.getState();
frame.contentWindow.siteDisplaySettings.setPreferences({
  textScale: 110,
  codeWrap: true,
  lineSpacing: 'relaxed',
  theme: 'dark'
}, {persist: false});
frame.contentWindow.siteDisplaySettings.setContext({embeddedLesson: true});
```

- `getState()` / `state`は`{version:1,textScale,textSize,codeWrap,codeWrapExplicit,lineSpacing,theme,resolvedTheme}`のコピーを返す。
- `textScale`は90〜150の整数。目盛り100/110/120は従来の標準/大/特大のCSS値に対応する。`textSize`は従来API向けの最寄りの名前。
- `codeWrap`は実際のON/OFF。`codeWrapExplicit`は明示設定があるか。`setPreferences`の`codeWrap:null`は明示設定を解除する。明示設定なしでは単独教材OFF、所有確認済みの埋込解説ON。
- `lineSpacing`は`standard` / `relaxed`、`theme`は`system` / `light` / `dark`。テーマの解決値は`resolvedTheme`。
- `setPreferences(partial, {persist=true, source='api'})`は指定した項目だけを更新する。`persist:false`は記憶領域を書き換えない。
- `reset({persist=true})`は表示だけを初期値へ戻す。`setContext({embeddedLesson})`は現在の文書の既定値だけを変え、保存しない。
- `hasStoredPreferences()`は利用可能な共通表示設定の保存値があるかを返す。壊れたJSONや未対応versionだけではtrueにしない。専用エディタの旧表示値を初回移行する場合の判定に使い、新しい保存形式をエディタ側へ複製しない。
- `document`の`joho:display-settings-change`で`event.detail={state,changed,source}`を通知する。親子間で再送する場合は値を比較し、変更済みの状態を送り返し続けない。
- `source:'ui'`の文字サイズ・折り返し操作は同じ値でも`changed`へ操作対象を含め、例文の個別調整を全体へ揃える。ホストがこの操作を別documentへ伝える場合は、同期中フラグで再帰を防ぎ、同値の対象キーと`source:'ui'`も渡す。`source:'reset'`は`reset({persist:false})`で伝える。

既存の`siteTextSize.preference`、`setPreference('standard'|'large'|'xlarge', {persist:false})`、`joho:text-size-change`を維持する。追加の`siteTextSize.scale` / `setScale(number, options)`で微調整できる。旧イベントのdetailは`{preference,scale}`。既存の`siteTheme`と`joho:theme-change`も維持する。

保存先は既存の`joho.textSize`・`joho.siteTheme`と、新規の`joho.displaySettings`。新規キーはversion 1の表示値だけを持つ。他用途の保存データはリセット対象にしない。

旧版タブが旧文字サイズキーだけを別段階へ変更した場合も、再読込時にその段階を優先する。同じ段階の再選択は保存値自体が変わらず区別できないため、同じ段階内の微調整値は維持する。

## 専用エディタで設定パネルを共用する

`main.js`や教材のレイアウト処理は不要。次の2スクリプトと1CSSを、エディタの正規の資産読込手順で読み込む。

- `js/display_settings.js`: 設定と保存・旧API。
- `js/display_settings_ui.js`: スライダー、吸着、選択肢、リセットを含む共通パネル。
- `css/display-settings.css`: パネル内の表示だけ。本文・エディタ・生徒プレビューのCSSへ作用しない。

```js
const widget = window.siteDisplaySettingsUI.createPanel({idPrefix:'html-editor-display'});
settingsContainer.append(widget.element);
// 開閉・フォーカス復帰は、エディタの既存の設定パネルで行う。
// 破棄時は widget.destroy()。widget.sync() は表示値の再同期。
```

`createPanel`は`{element,sync,destroy}`を返す。`controller`オプションの既定値は`siteDisplaySettings`。ポップアップの開閉・配置は含まず、ホストの既存部品へ組み込む。通常教材のヘッダーも同じ生成APIを使用する。

HTMLエディタの`JohoUI.theme`との接続は、同エディタ担当が以下の境界で行う。

1. 新APIの状態を先に保持し、共通保存値がなければ旧`joho.htmleditor.ui.v1`の表示値を一度だけ読み、旧APIの`siteTheme.setPreference(...,{persist:false})`・`siteTextSize.setPreference(...,{persist:false})`で初期値として取り込む。`auto→system`、`largest→xlarge`だけを変換する。本人情報等は移行しない。
2. `JohoUI.theme`自体と既存の`set/apply`等を維持する場合、共通APIが使える経路では`storageKey:''`で作成し、保存の窓口を共通APIへまとめる。初期化中・共通値の反映中はフラグでlegacyの`onChange`からの書戻しを抑止する。
3. 共通イベントでは、上記の名前の逆変換で旧UI/CodeMirrorの再描画へ反映する。旧UI側から本当にテーマ・段階が変更された場合だけ共通APIへ返す。微調整値を最寄りの3段階で毎回上書きしない。親のシェルCSSには`--site-text-scale`（100%=1）の数値変数を利用できる。実習ファイル・生徒プレビューへ書き込まない。
4. 所有するiframeのload後に`setContext({embeddedLesson:true})`を行い、`textScale`・`lineSpacing`・`theme`を`setPreferences(...,{persist:false,source:'editor-parent'})`で送る。`codeWrapExplicit`がfalseなら`codeWrap:null`を渡して埋込既定ONを生かす。明示設定がある場合だけそのbooleanを送る。
5. 子の`joho:display-settings-change`を受けて親も同期する場合は、`source:'editor-parent'`を送り返さず、状態を比較して異なる項目だけを適用する。子の未指定折り返しをfalseとして親へ保存しない。既存の`siteTextSize`呼出は、新APIが存在しない旧配備へのfallback時だけ使う。
6. 表示リセットを親で扱う場合、残した旧エディタ表示キーも標準/自動へ揃えるか、その表示キーだけを削除して次回の再移行を防ぐ。列幅・開閉状態の初期配置復帰は別の操作とし、本人情報・文書・フォルダ接続・学習データには触れない。

この接続では`tools/shared/ui-kit.js`を変更する必要はない。共有パネルのイベント・保存形式・吸着処理をエディタ内へ再実装しない。

## コード例

HTML/CSS/Pythonの`pre`に、文字サイズ−/倍率（全体設定へ戻す）/＋、折り返し、閲覧用拡大の操作を添える。操作はコードの外へ置き、元のテキスト・改行・インデント・選択/コピー制限を維持する。例文ごとの倍率と折り返しは文書内だけに保持し、全体の文字サイズ・折り返し変更または表示リセット時に揃える。

`js/code_examples.js`の`window.siteCodeExamples.enhance(root=document)`は、ハイライト後の対応`pre`へ操作を追加する。再実行で重複しない。設定は`siteDisplaySettings.getState()`と変更イベントを使い、表示設定がない場合も通常のコード閲覧を妨げない。

拡大はネイティブdialog内に同じコード要素を一時移動し、同じ操作を使う。閉じる/Escapeで元の場所・読んでいたスクロール位置・フォーカスへ戻し、表示上の折り返しだけを変更する。拡大中もコピー許可を増やさない。別のdialog内の例文では拡大を無効にし、元のdialogを勝手に閉じない。

拡大状態は`document`の`joho:code-example-expanded`で通知する。detailは`{open:boolean,scrollX:number,scrollY:number}`で、座標は拡大前に保持した読み取り位置。`open:true`は`showModal()`成功後、`open:false`は元のDOM位置・表示位置への復帰後に通知する。開く際の例外でも復帰してfalseを通知する。通常教材では受信者なしでも動作する。

HTMLエディタ側は、所有確認済みの現在の解説iframeからの通知だけを購読し、拡大中だけiframeの外枠を広げ、外側の操作をinertにしてよい。終了時の列幅・外側のフォーカス・iframe内読書位置の復帰はホスト側が行う。コードや操作部品を別documentへ移動・複製せず、保存済みの列配置や実習内容を変更しない。

## 検証

設定の旧値読込、保存できない環境、persist:false、初期化対象の限定、文字サイズ目盛りとキーボード微調整、例文の内容保持、動的追加、dialogの復帰、390px・半画面・デスクトップ、テーマと行間を確認する。ChromeとPlaywright WebKitの結果はSafari実機確認と区別する。

共通`main.js`・`css/css.css`を変更するときは、HTML実習ページの該当script/linkのSRIとキャッシュ識別子も更新する。教材本文・配付原本はこの表示改修では変更しない。

```sh
node --check js/display_settings.js
node --check js/display_settings_ui.js
node --check js/code_examples.js
JOHO_TEST_URL=http://127.0.0.1:8894/ node scripts/test-display-settings-browser.mjs
JOHO_TEST_URL=http://127.0.0.1:8894/ node scripts/test-header-navigation.mjs
```
