/* cp11・cp12の教材用モデル。実機やファイルにはアクセスしない。 */
(function (root) {
  'use strict';
  const MEMORY_STEPS = [
    { title: '保存してある状態', ram: null, disk: 'こんにちは', direction: '', text: '文書はSSDに保存されています。ここでは自動保存を使わない文書を例にします。' },
    { title: '文書を開く', ram: 'こんにちは', disk: 'こんにちは', direction: 'read', text: 'SSDから主記憶装置へ文書を読み込み、CPUが扱えるようにします。' },
    { title: '文書を編集する', ram: 'こんにちは！', disk: 'こんにちは', direction: 'edit', text: '作業中の文書が変わりました。まだ保存していないので、SSD側の文書は変わりません。' },
    { title: '文書を保存する', ram: 'こんにちは！', disk: 'こんにちは！', direction: 'write', text: '編集した文書を主記憶装置からSSDへ書き込みます。' },
    { title: '電源を切った後', ram: null, disk: 'こんにちは！', direction: '', text: '主記憶装置の内容は失われますが、SSDに保存した文書は残ります。' }
  ];
  const PROGRAM = [
    { code: 'READ A, (10)', label: '10番地の3を読む', decode: '10番地のデータをレジスタAへ読み込む命令です。', execute: '3をレジスタAに読み込みます。', address: 10 },
    { code: 'ADD A, (11)', label: '11番地の5を足す', decode: 'レジスタAの値に、11番地のデータを加える命令です。', execute: '演算装置が3＋5を計算し、レジスタAの値を8にします。', address: 11 },
    { code: 'WRITE (12), A', label: '12番地へ結果を書く', decode: 'レジスタAの値を12番地へ書き込む命令です。', execute: '計算結果8を、主記憶装置の12番地へ書き込みます（ストア）。', address: 12 },
    { code: 'STOP', label: '処理を終える', decode: 'このプログラムの実行を終える命令です。', execute: 'このプログラムの実行を終了します。コンピュータの電源を切る意味ではありません。', address: null }
  ];
  function cpuTimeline() {
    const frames = [{ title: '実行前', stage: 'ready', pc: 1, instruction: null, register: null, result: null, address: null, text: '主記憶装置に命令とデータを用意しました。3＋5を計算し、結果を12番地に書き込みます。' }];
    let register = null, result = null;
    PROGRAM.forEach((instruction, index) => {
      const pc = index + 1;
      frames.push({ title: '命令の読み出し（フェッチ）', stage: 'fetch', pc, instruction: index, register, result, address: pc, text: `${pc}番地から「${instruction.label}」という命令をCPUへ読み出します。` });
      frames.push({ title: '命令の解読（デコード）', stage: 'decode', pc, instruction: index, register, result, address: null, text: instruction.decode });
      if (index === 0) register = 3;
      if (index === 1) register += 5;
      if (index === 2) result = register;
      frames.push({ title: '命令の実行（エグゼキュート）', stage: 'execute', pc: index < 3 ? pc + 1 : pc, instruction: index, register, result, address: instruction.address, text: instruction.execute, halted: index === 3 });
    });
    return frames;
  }
  const CPU_STEPS = cpuTimeline();
  function clockRate(ghz, cycles) {
    if (!Number.isFinite(ghz) || ghz <= 0 || !Number.isInteger(cycles) || cycles <= 0) throw new RangeError('周波数は正の数、クロック数は正の整数が必要です。');
    return ghz * 1e9 / cycles;
  }
  function parseNumber(raw) {
    const text = String(raw).normalize('NFKC').trim();
    if (!/^(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i.test(text)) return null;
    const value = Number(text);
    return Number.isFinite(value) ? value : null;
  }
  const FILE_TREE = { name: '授業', children: [
    { name: '情報', children: [
      { name: 'レポート', children: [{ name: '原稿.docx', kind: '文書' }, { name: '提出版.pdf', kind: '文書' }] },
      { name: '画像', children: [{ name: '校舎.png', kind: '画像' }] },
      { name: '集計.xlsx', kind: '表計算' }
    ] },
    { name: '英語', children: [
      { name: 'レポート', children: [{ name: '原稿.docx', kind: '文書' }] },
      { name: '発表.pptx', kind: 'プレゼンテーション' }
    ] },
    { name: '使い方.txt', kind: '文書' }
  ] };
  function fileAt(path) {
    return path.reduce((node, index) => node?.children?.[index], FILE_TREE);
  }
  const choice = (prompt, options, answer, explanation) => ({ type: 'choice', prompt, options, answer, explanation });
  const QUESTIONS = {
    devices: [
      choice('キーボードは、五大装置のどれに当たりますか？', ['入力装置', '出力装置', '演算装置'], 0, 'キーボードは文字などのデータをコンピュータへ入力します。'),
      choice('CPUを構成する装置の組み合わせはどれですか？', ['入力装置と出力装置', '制御装置と演算装置', '主記憶装置と補助記憶装置'], 1, 'CPU（中央処理装置）は、制御と演算の役割を担います。'),
      choice('作業中の命令やデータを置く、CPUが直接利用する記憶装置は？', ['SSD', '主記憶装置', 'プリンタ'], 1, '主記憶装置に、実行するプログラムや処理するデータを読み込みます。'),
      choice('電源を切った後も、保存した文書が残る場所はどれですか？', ['レジスタ', '主記憶装置（RAM）', '補助記憶装置（SSD）'], 2, 'SSDは電源を切っても内容を保持します。保存前の編集内容は別です。')
    ],
    execution: [
      { type: 'order', prompt: 'CPUが1つの命令を処理する基本の順序を選んでください。', options: ['命令の実行', '命令の読み出し', '命令の解読'], answer: [1, 2, 0], explanation: '読み出し（フェッチ）、解読（デコード）、実行（エグゼキュート）の順です。' },
      choice('「3＋5」を計算してレジスタAが8になりました。主記憶装置の12番地へ結果を残すには？', ['結果を書き込む命令を実行する', 'クロック周波数を変える', '電源を切る'], 0, 'WRITE命令で、レジスタAの8を主記憶装置へ書き込みます。SSDへのファイル保存とは別の処理です。'),
      choice('主記憶装置の「アドレス（番地）」は何を表しますか？', ['CPUの速さ', 'データや命令の置かれた場所', 'ファイルの種類'], 1, 'アドレスを指定することで、目的の命令やデータを読み書きできます。')
    ],
    clock: [[1.6, 4], [2.4, 6], [2, 4], [3, 5]].map(([ghz, cycles]) => ({ type: 'number', ghz, cycles, prompt: `クロック周波数${ghz} GHz、1命令に${cycles}クロック必要なCPUは、1秒間に何回の命令を実行できますか？（命令を重ねて実行せず、待ち時間はないものとします。）`, answer: clockRate(ghz, cycles), explanation: `${ghz}×10⁹÷${cycles}＝${clockRate(ghz, cycles).toLocaleString('ja-JP')}回／秒です。周波数をHzへ直してから、1命令のクロック数で割ります。` })),
    software: [
      choice('macOSはどれに分類されますか？', ['ハードウェア', '基本ソフトウェア（OS）', '応用ソフトウェア'], 1, 'macOSは、ハードウェアの利用やアプリの実行を支えるOSです。'),
      choice('Webブラウザはどれに分類されますか？', ['応用ソフトウェア', '基本ソフトウェア（OS）', '主記憶装置'], 0, 'Webページを見るという目的のためのアプリケーションです。'),
      choice('SSDはどれに分類されますか？', ['応用ソフトウェア', '基本ソフトウェア', 'ハードウェア'], 2, 'SSDはデータを保存する物理的な装置です。')
    ],
    os: [
      choice('複数のアプリへCPUを使う時間を割り当てるのは？', ['タスク管理', 'ファイル管理', 'ユーザー管理'], 0, 'OSは処理の実行順序やCPUの割り当てを管理します。'),
      choice('アプリが使う主記憶装置の領域を割り当てるのは？', ['入出力管理', 'メモリ管理', 'ユーザー管理'], 1, 'OSは、各アプリが使うメモリの領域を管理します。'),
      choice('周辺機器を動かすためのプログラムは？', ['拡張子', 'フォルダ', 'デバイスドライバ'], 2, 'デバイスドライバは、OSなどと周辺機器とのやり取りを支えます。'),
      choice('ログインする利用者やアクセスできる範囲を管理するのは？', ['ユーザー管理', 'タスク管理', '演算装置'], 0, 'OSはアカウントや利用権限などを管理します。')
    ],
    files: [
      choice('「写真.png」の拡張子はどれですか？', ['写真', 'png', '写真.png'], 1, '末尾のドットに続くpngが、画像形式の目印です。'),
      choice('写真.jpgを写真.pngに名前変更するとどうなりますか？', ['PNG形式に変換される', '画像の内容は変換されない', '必ず画質がよくなる'], 1, '形式変換には、対応するアプリでの変換や書き出しが必要です。'),
      choice('「授業／情報／レポート／原稿.docx」で、原稿.docxが直接入っているフォルダは？', ['授業', '情報', 'レポート'], 2, '外側から内側へ順にたどると、最後のフォルダがレポートです。'),
      choice('情報と英語の別々のフォルダにある「原稿.docx」は、同じファイルですか？', ['必ず同じファイル', '名前だけでは同じファイルと判断できない', '同じ名前は付けられない'], 1, 'ファイルは名前だけでなく、保存場所も合わせて区別します。')
    ]
  };
  function judge(question, answer, scale = 1) {
    if (question.type === 'number') {
      const value = parseNumber(answer);
      if (value === null || ![1, 1e4, 1e8].includes(scale)) return { valid: false, correct: false };
      return { valid: true, correct: Math.abs(value * scale - question.answer) <= Math.max(1, question.answer) * 1e-10 };
    }
    if (question.type === 'order') {
      const valid = Array.isArray(answer) && answer.length === 3 && answer.every(x => Number.isInteger(x) && x >= 0 && x < 3);
      return { valid, correct: valid && answer.every((x, i) => x === question.answer[i]) };
    }
    const valid = Number.isInteger(answer) && answer >= 0 && answer < question.options.length;
    return { valid, correct: valid && answer === question.answer };
  }
  root.ComputerCore = { MEMORY_STEPS, PROGRAM, CPU_STEPS, clockRate, parseNumber, FILE_TREE, fileAt, QUESTIONS, judge };
})(typeof window === 'object' ? window : globalThis);
