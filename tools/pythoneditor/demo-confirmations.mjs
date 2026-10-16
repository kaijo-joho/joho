// 独自作成した公開デモ。学校の課題・模範解答・正式採点基準を含めない。
const version = 'demo-confirmations-v1';
const reference = questionId => ({ questionId, version });
const code = (questionId, title, prompt, templateCode) => ({ questionId, version, title, prompt, templateCode, setupCode: '' });
const confirmation = (questionId, title, prompt, refs, checkType, checkConfig) => ({
  questionId, version, title, prompt, kind: 'confirmation', templateCode: '', setupCode: '',
  codeRefs: refs.map(reference), checkType, checkConfig
});
export const confirmationDemo = {
  setId: 'demo-confirmations', title: '試行を伴う確認問題のデモ', questions: [
    code('demo-confirm-input-code', '問1 (1) 箱の数を表示する', '# 問1 入力による分岐\n6個までなら1箱、それより多ければ2箱と表示するデモです。入力値を変えて動きを確認します。', 'items = int(input("品物の個数: "))\nif items <= 6:\n    print("1箱")\nelse:\n    print("2箱")\n'),
    confirmation('demo-confirm-input-check', '問1 (2) 3つの入力条件を試す', '# 問1 入力による分岐\n6より小さい整数、ちょうど6、6より大きい整数をそれぞれ入力して、分岐を確かめましょう。表示されるのは試行条件の確認状況です。', ['demo-confirm-input-code'], 'inputCases', {
      cases: [
        { id: 'below', label: '6より小さい整数を入力する', inputs: [{ index: 0, kind: 'integer', op: 'lt', value: 6 }] },
        { id: 'boundary', label: 'ちょうど6を入力する', inputs: [{ index: 0, kind: 'integer', op: 'eq', value: 6 }] },
        { id: 'above', label: '6より大きい整数を入力する', inputs: [{ index: 0, kind: 'integer', op: 'gt', value: 6 }] }
      ]
    }),
    code('demo-confirm-random-code', '問2 (1) 方角をランダムに表示する', '# 問2 乱数の結果\n実行するたびに4つの方角から1つを表示します。', 'import random\n\nprint(random.choice(["北", "東", "南", "西"]))\n'),
    confirmation('demo-confirm-random-check', '問2 (2) 異なる3種類を観察する', '# 問2 乱数の結果\n繰り返し実行して、北・東・南・西のうち異なる3種類を確認しましょう。同じ結果が続いても種類数は増えません。', ['demo-confirm-random-code'], 'resultCoverage', { results: ['北', '東', '南', '西'], requiredDistinct: 3, output: 'lastLine' }),
    code('demo-confirm-game-code', '問3 (1) 数当てのデモ', '# 問3 回数の目標\n**答えを42に固定した動作確認用デモです。** 1〜100の範囲で予想します。授業用の数当てゲームではありません。', 'target = 42\nwhile True:\n    guess = int(input("予想: "))\n    if guess == target:\n        print("正解")\n        break\n    elif guess < target:\n        print("もっと大きい")\n    else:\n        print("もっと小さい")\n'),
    confirmation('demo-confirm-game-check', '問3 (2) 7回以内に正解する', '# 問3 回数の目標\n固定答え42のデモを実行し、7回以内に正解しましょう。正解した回答も1回に数えます。範囲外や整数でない入力は達成の対象になりません。', ['demo-confirm-game-code'], 'attemptLimit', { range: { min: 1, max: 100 }, maxGuesses: 'theoretical', guessPrompt: '予想: ', successOutput: '正解', output: 'lastLine' }),
    code('demo-confirm-compare-a', '問4 (1) 繰り返しで合計する', '# 問4 方法を比較する\n1から入力した整数までの合計を、繰り返しで求めます。', 'n = int(input("上限: "))\ntotal = 0\nfor value in range(1, n + 1):\n    total += value\nprint(total)\n'),
    code('demo-confirm-compare-b', '問4 (2) 式で合計する', '# 問4 方法を比較する\n1から入力した整数までの合計を、式で求めます。', 'n = int(input("上限: "))\nprint(n * (n + 1) // 2)\n'),
    confirmation('demo-confirm-compare-check', '問4 (3) 2つの実行結果を選ぶ', '# 問4 方法を比較する\n参照元を切り替え、同じ上限で2つの方法を実行しましょう。それぞれの結果を選んで比較します。ここでは結果を選んだことを記録します。', ['demo-confirm-compare-a', 'demo-confirm-compare-b'], 'compareRuns', { conditions: [{ id: 'loop', label: '繰り返しによる結果' }, { id: 'formula', label: '式による結果' }], codePolicy: 'variants', question: '比較する2つの実行結果を選んでください。' }),
    confirmation('demo-confirm-answer-check', '問4 (4) 確認の観点を答える', '# 問4 方法を比較する\n2つの方法を比べるとき、まず何をそろえるとよいでしょうか。回答を記録するデモで、正誤の判定は行いません。', ['demo-confirm-compare-a'], 'answer', { format: 'choice', question: '比較する前にそろえるものを選んでください。', choices: [{ id: 'input', label: '入力する上限の値' }, { id: 'name', label: '変数名の文字数' }, { id: 'time', label: '実行した時刻' }] })
  ]
};
