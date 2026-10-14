# Pythonエディタ 0.1 BETA

独立したエディタの試作。問題 → コード → 出力の縦並び、問題一覧・進捗、Python実行、停止・再実行、入力、エラー案内、グラフ、ブラウザ自動保存と復元を実装した。

今年度のColab、旧grade、原本、教材サイトのリンクを継続する。GSS下書き保存・正式採点/提出・学校認証ブリッジのソースと合成検証を追加した。gradeのHEADへの専用コード配置と提出ログGSSの4シート追加まで実施し、接続設定は無効。配置確認と有効化前の課題は[PLACEMENT.md](PLACEMENT.md)に記録した。エディタ単体を公開する。教材への埋込みや、他ページからのリンク追加・切替は行わない。

## 公開と起動

公開URLは `https://joho.kaijo.ed.jp/tools/pythoneditor/`。公開画面には独自作成の動作確認サンプル3問だけを表示する。学校の問題マスター、模範解答、採点基準、署名鍵は含めない。GSS接続と正式提出は無効で、今年度のColab運用を継続する。ページ一覧、アプリ一覧、検索索引、既存教材のリンクは変更しない。


リポジトリのルートで、開発者用サーバーを起動する。生徒がTerminalを使う運用ではない。

```sh
node scripts/serve-pythoneditor.mjs --port 8768
```

`http://127.0.0.1:8768/tools/pythoneditor/` に独自作成の公開可能なサンプル3問を表示する。

教員が認証済みのコネクタで取得した「Python問題マスター」の読取スナップショットを確認する場合:

```sh
node scripts/serve-pythoneditor.mjs --port 8768 --master /private/tmp/pythoneditor-master-live-20261014.json
```

指定ファイルは、Sheets APIのA1:R範囲のCellData、または前工程の18列の`import-rows.json`形式。解答を含む正本ファイルを公開ディレクトリへ置かない。サーバーは127.0.0.1に限定し、表示用に許可した項目だけへ投影する。元JSON・模範解答・採点基準を配信しない。編集中の問題を教員が確認するための経路であり、本番の認証・権限確認を代行しない。ブラウザからGoogleのCookieやOAuthトークンを取得する仕組みはない。

URLは`?set=<setId>&question=<questionId>&version=<version>`。将来の写経入口向けに`practice=<questionId>`も読み取る。URLは選択の指定であり、権限ではない。指定版がなければ案内し、別版の下書きを変換・上書きしない。

## 実装と再利用

- `editor.mjs` / `editor.css` / `index.html`: 縦並びの問題・コード・出力、選択、進捗、復元、表示。
- `runner.mjs` / `worker.mjs` / `runtime.mjs`: PyodideのWorker実行、世代照合、停止、入力、ライブラリ準備、Colab互換処理。
- `storage.mjs` / `core.mjs`: 問題・版ごとの保存、競合検知、形式・上限の検査。
- `cloud.mjs` / `cloud-ui.mjs`: 学校アカウント接続、GSS保存/復元/競合、送信控え、正式提出と結果照会。
- `scripts/pythoneditor-gas/`: gradeへ追加する専用8ファイル。版固定、GSSの追記保存、現行Python判定コードの独立コピー。配置・保存契約は[CLOUD.md](CLOUD.md)。
- `prompt.mjs`: Markdown、ヒント、表、数式の表示。DOMPurifyでタグ・属性を限定し、外部画像・iframe・スクリプトを通さない。
- `scripts/pythoneditor-master.mjs`: GSS読取データから生徒向け項目だけを取り出す。
- `scripts/serve-pythoneditor.mjs`: ローカル確認用の配信。固定パス、同一origin、GET/HEADのみ。
- 既存HTMLエディタのCodeMirror 5.65.18、`tools/shared/ui-kit`、非モーダルの`help-panel`を参照する。共通ファイルや別アプリは変更していない。校章のパスも既存アイコンから再利用する。

問題選択を作業単位にするため、作図アプリの複数ファイルタブは追加していない。問題を切り替えても、各問題のコード・入力・CodeMirrorのUndoをページ内で保持する。再読込みでコード・入力・直前の選択を復元する。出力画像とUndoは再読込みを越えて保存しない。

## 実行の挙動

実行ごとに新しい変数の辞書で、共通準備 → 当該問題を実行する。直前の問題の変数を暗黙に引き継がない。原本にある確認問題`py42a_2-02`は、明示された前問の最新コードを使用する。複数の解答区間を含む入力セルを1問のコード全文として保持する。

末尾が式だけなら、その値も表示する。`print()`の`sep`・`end`、日本語、標準エラー、Pythonの例外を扱う。コード・入力の変更後には、出力が変更前の結果であることを表示する。

入力は実行前に1回分ずつ改行して指定できる。crossOriginIsolatedとSharedArrayBufferを使える環境では、不足時に出力セルで逐次入力できる。「入力を終了」はEOFを渡す。利用できない環境では事前入力を使用し、不足時にEOFErrorを表示する。GitHub Pagesで逐次入力が使えるとは確認していない。停止は共有メモリの有無に依存せずWorkerを終了し、コードを残す。

NumPyとmatplotlibは必要時に取得する。グラフはAggでPNG化し、複数図と画像保存に対応する。japanize-matplotlib 1.1.3の原版とIPAexゴシックをライセンス付きで同梱した。Python新版で廃止されたdistutilsは、実行時にpackagingのVersionへ接続する。原版ファイルは保持する。既知の`!pip install japanize-matplotlib`を同じ行数のコメントへ置換し、自動準備する。その他の`!`/`%`行は未対応として止める。

`google.colab.files.download()`は、実行中に作成したファイルを出力セルの保存ボタンへ接続する。前回の一時ファイルを次回の出力に混ぜないため、実行ごとに作業ディレクトリを初期化する。`files.upload()`は今回の使用教材に存在せず、未対応とする。py35/py54と自由課題は保留のまま。

試作の上限はコード・入力各20万文字、標準出力/標準エラー合計10万文字、図・保存ファイル合計12件、1件4MB、準備を含む実行120秒。授業実測を経た確定値ではない。Wasmのメモリ割当てによる端末全体の負荷は学校Macで確認が必要。

## 保存

自動保存と明示保存は別キー。問題ID・版をキーにしてコード全文、事前入力、更新日時、端末内の実行済み表示だけを保存する。問題文、解答、採点基準、正式得点、氏名、認証情報を保存形式へ入れない。実行済みは学習上の進捗であり、正答・提出済みの証明ではない。

復元前のローカルコードを控えへ保存する。別タブの保存内容が異なる場合も控えを残す。競合が発生したタブは自動保存を止め、現在のコードを保持する。容量不足・破損・保存拒否では成功表示しない。ファイル取込みは検証・確認後に反映し、別版のデータは破棄・変換せず元ファイルに残す。

GSSの下書きと貸出機からの復元、競合時の両内容保護、正式採点・提出・照会を実装した。本番未接続の間は任意のJSONファイル保存・取込みを使える。クラウド側の実装と反映前の確認は[CLOUD.md](CLOUD.md)、全体契約は[CONTRACT.md](CONTRACT.md)を参照する。

## 検証

[全授業対応表](CURRICULUM.md)、[実装・検証の区分](VERIFICATION.md)を参照する。

```sh
node --test tools/pythoneditor/tests/*.test.mjs
node scripts/test-pythoneditor-browser.mjs
node scripts/test-pythoneditor-cloud-browser.mjs
```

ブラウザ検証にはPlaywrightとChromeが必要。`NODE_PATH`で既存の依存パッケージを指定できる。`PYTHONEDITOR_ENGINE=webkit`でPlaywright WebKitを使用する。

私有の原本コードによる全授業検証は、問題・解答を公開ディレクトリに書かず、外部の一時領域へケースを作る:

```sh
python3 scripts/build-pythoneditor-cases.py \
  --rows /Users/takashi/Documents/Colab/docs/python-master-colab-import-20261014/import-rows.json \
  --inputs /private/tmp/pythoneditor-inputs-20261014.json \
  --lessons /Users/takashi/.codex/worktrees/pythoneditor-prototype/joho \
  --out /private/tmp/pythoneditor-cases-20261014.json

PYTHONEDITOR_MASTER=/private/tmp/pythoneditor-master-live-20261014.json \
PYTHONEDITOR_CASES=/private/tmp/pythoneditor-cases-20261014.json \
node scripts/test-pythoneditor-browser.mjs
```

`--inputs`は教員確認用の入力fixture。再取得した正本に合わせて確認する。原本の保存出力が現在のコードと一致するとは限らず、正式得点として使用しない。検証時だけ固定した乱数seedを使用し、通常画面では固定しない。

## 依存と復元

Pyodideは試作で検証した固定版v314.0.7をjsDelivrから読み込む。採用・配信先の本番確定は学校Macでの検証後。ローカル同梱ライブラリの取得先・SHA-256は`vendor/manifest.json`と日本語化パッケージのmanifest、ライセンスは各同梱ファイルに記録した。IPAexゴシック約6MBはグラフの日本語表示に必要。Pyodideの全配布物をリポジトリへ複製していない。

同梱のライセンス・旧READMEだけは、本文を変えずにUTF-8・LFと末尾空白へ正規化した。取得原文のハッシュと文字コードもmanifestに併記する。Pythonライブラリ本体とフォントのバイトは原版のまま。GitHub Pagesでアンダースコアから始まるファイルが除外されるため、配信用のinit.pyを実行時に元の__init__.pyへ配置する。取得原本のファイル名とハッシュはmanifestに残す。

変更は新規の`tools/pythoneditor/`と専用スクリプト/GAS追加パッケージだけ。隔離worktreeでコミットし、元の未コミット作業は保持する。復元は試作コミットのrevert、または新規ファイルだけの撤去で可能。ブラウザ保存・送信控えは個別に保護し、既存教材・原本・GAS・GSS・リンクを巻き戻す操作を行わない。接続有効化・授業への導線追加は別途確認する。
