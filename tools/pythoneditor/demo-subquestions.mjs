// Public, original examples of structures found in the Colab curriculum.
// No school problem text, answer, scoring rubric or source identifiers are copied.
export const subquestionDemo = {
  setId: 'demo-subquestions', title: '大問・小問の動作確認', questions: [
    {
      questionId: 'demo-temperature-01', version: 'demo-subquestions-v1', title: '問1 (1) 気温を2つの場合に分ける',
      prompt: `# 問1 気温の判定

整数の気温を入力し、条件に応じた文字列を表示します。動作確認用のコードが入っているので、条件や表示を変えて試してください。

## (1) 2つの場合に分ける

25℃以上なら「高い」、25℃未満なら「低い」と表示します。24と25を入力して境目を確認しましょう。

（2）へ移動してから戻り、こちらの編集内容が残ることも確認してください。`,
      templateCode: `temperature = int(input("気温（℃）: "))

#### 続きのプログラムを書きなさい ####
if temperature >= 25:
    print("高い")
else:
    print("低い")
#### ここまで ####
`, setupCode: ''
    },
    {
      questionId: 'demo-temperature-02', version: 'demo-subquestions-v1', title: '問1 (2) 気温を3つの場合に分ける',
      prompt: `# 問1 気温の判定

整数の気温を入力し、条件に応じた文字列を表示します。動作確認用のコードが入っています。

## (2) 3つの場合に分ける

25℃以上なら「高い」、15℃以上25℃未満なら「中くらい」、15℃未満なら「低い」と表示します。

14、15、24、25を入力して境目を確認しましょう。（1）とは別にコードを編集できます。`,
      templateCode: `temperature = int(input("気温（℃）: "))

#### 続きのプログラムを書きなさい ####
if temperature >= 25:
    print("高い")
elif temperature >= 15:
    print("中くらい")
else:
    print("低い")
#### ここまで ####
`, setupCode: ''
    },
    {
      questionId: 'demo-table-01', version: 'demo-subquestions-v1', title: '問2 (1) 表の作成と表示',
      prompt: `# 問2 2次元リストの表

## (1) 表の作成と表示

1から12までの整数を、3行4列の2次元リストに入れて表示します。コードには次の2つの部分があります。

1. 各行のデータを作る部分。
2. できた表を表示する部分。

両方を同じコード欄で編集し、▶で小問全体をまとめて実行します。動作確認用のコードを変更し、表示の変化を確かめましょう。`,
      templateCode: `table = []
for row in range(3):
    values = []
    #### (1) 続きのプログラムを書きなさい ####
    for col in range(4):
        values.append(row * 4 + col + 1)
    #### (1) ここまで ####
    table.append(values)

#### (2) 続きのプログラムを書きなさい ####
for values in table:
    print(*values)
#### (2) ここまで ####
`, setupCode: ''
    },
    {
      questionId: 'demo-boxes-01', version: 'demo-subquestions-v1', title: '問3 (1) 必要な箱の数',
      prompt: `# 問3 必要な箱の数

1箱に品物を4個まで入れます。品物の個数から、必要な箱の数を求めます。

## (1) 箱の数を求めるプログラム

繰り返しを使う動作確認用のコードが入っています。5個なら箱が2個必要です。

表示文や1箱に入る数を変えてから、（2）でも同じプログラムを実行してみましょう。`,
      templateCode: `items = int(input("品物の個数: "))
boxes = 0

#### 続きのプログラムを書きなさい ####
while items > 0:
    items -= 4
    boxes += 1
#### ここまで ####

print("必要な箱:", boxes)
`, setupCode: ''
    },
    {
      questionId: 'demo-boxes-02', version: 'demo-subquestions-v1', title: '問3 (2) 入力を変えて確認',
      prompt: `# 問3 必要な箱の数

1箱に品物を4個まで入れます。

## (2) 入力を変えて確認

（1）で作成したプログラムを使い、0、1、4、5、8、9個のときの箱の数を確かめましょう。

この小問は確認用です。コード欄には（1）の最新のコードを表示します。編集するときは（1）へ戻ってください。ここで▶を押すと、出力欄へ入力して確認できます。`,
      templateCode: '', setupCode: '', kind: 'observation', useExistingQuestionCode: 'demo-boxes-01'
    }
  ]
};
