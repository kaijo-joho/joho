# 共通ファイルメニュー

`file-menu.js`・`file-menu.css` は共通仕様2.1の項目名・並び順・SVG・余白・ショートカット表示を提供します。文書の読み書きはアプリが行い、この部品自体は保存領域や外部サービスへアクセスしません。

```js
const menu = JohoFileMenu.mount(document.getElementById('file-menu'), {
  busy: () => editingGesture,
  onAction: (id, opener) => performFileAction(id, opener)
});
menu.update({ autosaving: false, disabled: false });
```

JavaScriptとCSSを読み込み、空のdetails要素へmountしてください。IDは順に `new`、`rename`、`save`、`browserSave`、`fileSave`、`browserOpen`、`fileOpen`、`auto` です。`auto` は同じ1行を開始／停止へ切り替えます。⌘/Ctrlの表示は環境に合わせます。ショートカットの実行はアプリ側で処理してください。

ホバー、クリック／タップ、Enter、上下キー、Home/End、Escapeに対応します。閉じる際のフォーカス復帰先は `menu.summary` です。操作を開始するとメニューを閉じ、`onAction` へIDと入口を渡します。非同期処理の対象文書固定、失敗・キャンセル時の保持、ファイルへの自動保存との分離はアプリの責務です。

2026-10-15に論理回路エディタへ適用。他アプリの本体は変更していません。
