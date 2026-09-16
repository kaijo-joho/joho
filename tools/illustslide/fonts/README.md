# 文字アウトライン用フォント

illustSlide の文字アウトライン化だけで使う、固定版の Noto CJK JP フォントです。編集時に選択された書体だけをブラウザ内で読み込みます。作品の通常表示には使わず、OS のフォントを取得・送信しません。

| 変換用書体 | 配付ファイル | 原本 | 原本 SHA-256 | WOFF SHA-256 |
| --- | --- | --- | --- | --- |
| ゴシック Regular | `NotoSansJP-Regular.woff` | `NotoSansJP-Regular.otf` | `dff723ba59d57d136764a04b9b2d03205544f7cd785a711442d6d2d085ac5073` | `5829ce8426f8bb9290af3b7afed0c6600b259c95ee6577020efc5f95ea9829e5` |
| ゴシック Bold | `NotoSansJP-Bold.woff` | `NotoSansJP-Bold.otf` | `1b0edfb500b73a4fa8a4fcaae1bbbd403994e08e73e3e0da37e70d3853f42c5f` | `7afbba53f7d8486026891c663671729002b2ae6da6037fcb43d4695240381133` |
| 明朝 Regular | `NotoSerifJP-Regular.woff` | `NotoSerifJP-Regular.otf` | `2c9a12dbd4f2408c4610c7ee84a108b62d7236c3775baed618c64d9cb44b2f04` | `d597646fea393df53983f8e9cd8aae713d5c9b0d0005066d29fa345ccf8d9a02` |
| 明朝 Bold | `NotoSerifJP-Bold.woff` | `NotoSerifJP-Bold.otf` | `1e03488a0d5e819f07fcd74f54703a7961ba466d3ae900f8a2a730541e6d4543` | `6e4e6b86cb6108ceae9c168d169c1af03ce625a2121c15ae99cf81bebd2592da` |

2026-09-16取得。Noto Sans JPはVersion 2.004、Noto Serif JPはVersion 2.003。著作権表示（元フォントのnameテーブルにも保持）：Sans © 2014–2021 Adobe、Serif © 2017–2024 Adobe。

原本は [Noto CJK の公式リポジトリ](https://github.com/notofonts/noto-cjk) の `main` にある `Sans/SubsetOTF/JP` および `Serif/SubsetOTF/JP` から取得した OpenType CFF です。`NotoSansJP-LICENSE.txt` と `NotoSerifJP-LICENSE.txt` は各公式ディレクトリの SIL Open Font License 1.1 本文です。

`../scripts/otf-to-woff1.mjs` は、SFNT 各テーブルを個別に zlib 圧縮するだけの無損失 WOFF1 ラッパーです。サブセット化・輪郭変更を行いません。変換時に圧縮済みテーブルを復元して原本テーブルとバイト比較し、テストでは WOFF と OTF の glyph index と advance width が一致することを確認します。WOFF1 は OpenType CFF の既存圧縮率を大きく上回れないため、4書体で約17.85 MiBです。

原本への参照（以下のGit blob IDと上表のSHA-256で取得内容を特定する）：

- [Sans Regular](https://github.com/notofonts/noto-cjk/blob/main/Sans/SubsetOTF/JP/NotoSansJP-Regular.otf): `4af556abb9cc42e585aab777b01857246a110746`
- [Sans Bold](https://github.com/notofonts/noto-cjk/blob/main/Sans/SubsetOTF/JP/NotoSansJP-Bold.otf): `40262777db707145a08795e0e62ab5956eafe4b6`
- [Serif Regular](https://github.com/notofonts/noto-cjk/blob/main/Serif/SubsetOTF/JP/NotoSerifJP-Regular.otf): `c8df42713ff38a06b34497f24ef38d8c72dbd02d`
- [Serif Bold](https://github.com/notofonts/noto-cjk/blob/main/Serif/SubsetOTF/JP/NotoSerifJP-Bold.otf): `289720117006228c5b1b34e78b733447ee16018d`

再生成例：`node tools/illustslide/scripts/otf-to-woff1.mjs /tmp/NotoSansJP-Regular.otf tools/illustslide/fonts/NotoSansJP-Regular.woff`。通常テストはWOFFだけで実行できる。原本との字形・送り幅の追加比較は、原本を置いたディレクトリを `ILAPO_OUTLINE_OTF_DIR` に指定して `tests/text-outline.test.cjs` を実行する。OTF原本はリポジトリへ二重登録しない。
