# 本文内の段階進行

`js/lesson-progress.js`と`css/lesson-progress.css`は、予想・操作・説明や図解の段階を進める共通部品。ページ内スライド移動は既存`lesson-slide-deck.js`へ任せる。

`data-lesson-progress`をコンテナに付け、段階は0から数える。`data-lesson-stage="1"`はその段階だけ表示し、`data-lesson-stage-from="1"`は以後も表示する。任意の`data-progress-count`がなければ最大段階番号＋1を段階数とする。入れ子の別コンテナの要素を数えない。

ボタンは`data-progress-next`（Next）、`data-progress-prev`、`data-progress-reset`。任意の`data-progress-status`へ現在段階/総段階を表示する。操作部は`data-progress-controls`で囲む。末尾Nextと先頭Prevは無効、リセットは0に戻る。native buttonによりEnter/Space/Tabを利用でき、矢印キーを奪わない。

コンテナから`joho:lesson-progress`が出て、`detail`は`{step,total,id}`。固有操作はこのイベントまたは`window.JohoLessonProgress.get/set/reset(container)`を利用できる。自動遷移や入力の外部送信はない。

JavaScript初期化前には本文全段階が表示される。印刷直前には最後の段階まで図を表示し、全説明HTML段階を印刷する。印刷終了後は元の段階へ戻り、入力値や固有比較の選択は変更しない。説明をSVGの見えない段階だけに閉じ込めずHTMLにも記載する。段階の可視化だけを使って学習結果を代行せず、予想・操作・自分の説明を別々に行う。
