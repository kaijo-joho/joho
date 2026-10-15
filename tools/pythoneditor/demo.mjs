import { subquestionDemo } from './demo-subquestions.mjs';
// 動作確認用に独自作成した公開可能なサンプル。学校の問題マスターを含めない。
export const demoCatalog = { schema: 'python-editor-catalog-v1', label: '動作確認サンプル', sets: [
  { setId: 'demo', title: '動作確認', questions: [
    { questionId: 'demo-print', version: 'demo-v1', title: '画面出力', prompt: '文字列や計算結果をprint()で表示し、表示する順序を確かめましょう。', templateCode: 'print("こんにちは、Python")\nprint(12 * 3)\n', setupCode: '' },
    { questionId: 'demo-input', version: 'demo-v1', title: '入力と条件分岐', prompt: '名前と整数を入力します。実行すると出力欄で名前、整数の順に入力を待ちます。値を入力してEnterを押し、条件を変えて実行してみましょう。', templateCode: 'name = input("名前: ")\nn = int(input("整数: "))\nif n > 10:\n    print(name, "さん、10より大きいです")\nelse:\n    print(name, "さん、10以下です")\n', setupCode: '' },
    { questionId: 'demo-plot', version: 'demo-v2', title: '日本語のグラフ', prompt: 'グラフの点やタイトルを変えて実行し、表示を確かめましょう。表示した画像を保存できます。', templateCode: 'import matplotlib.pyplot as plt\nimport japanize_matplotlib\n\nplt.plot([1, 2, 3], [2, 4, 3], marker="o")\nplt.title("日ごとの変化")\nplt.xlabel("日")\nplt.ylabel("値")\nplt.show()\n', setupCode: '' }
  ] },
  subquestionDemo,
  { setId: 'demo-previous', title: '以前の動作確認（保存内容用）', questions: [
    { questionId: 'demo-plot', version: 'demo-v1', title: '日本語のグラフ', prompt: 'グラフの点やタイトルを変えて実行し、表示を確かめましょう。表示した画像を保存できます。', templateCode: 'plt.plot([1, 2, 3], [2, 4, 3], marker="o")\nplt.title("日ごとの変化")\nplt.xlabel("日")\nplt.ylabel("値")\nplt.show()\n', setupCode: 'import matplotlib.pyplot as plt\nimport japanize_matplotlib\n' }
  ] }
] };
