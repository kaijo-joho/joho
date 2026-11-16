export const apps = [
  { id: 'htmleditor', name: 'HTMLエディタ' },
  { id: 'pythoneditor', name: 'Pythonエディタ' },
  { id: 'logic', name: '論理回路エディタ' },
  { id: 'graph', name: 'グラフエディタ' },
  { id: 'illustslide', name: 'イラストスライド' },
  { id: 'flowchart', name: 'フローチャート' },
  { id: 'worksheet-submission', name: 'ワークシートの提出・確認' },
  { id: 'google-drive', name: 'Google Drive' },
  { id: 'classroom', name: 'Google Classroom' },
  { id: 'class-apps', name: '授業で使うアプリ（その他）' },
];

// 実際の各アプリの原稿を取り込んだものではない。画面・分岐検証専用。
const fallback = [
  { id: 'other', label: '選択肢にない・文章で説明する', next: 'handoff', ref: '-' },
  { id: 'unknown', label: '分からない', next: 'handoff', ref: '-' },
  { id: 'unavailable', label: '今は確認できない', next: 'handoff', ref: '-' },
];

export const guide = {
  format_version: 2,
  guide_revision: 1,
  app_version: 'prototype',
  operations: {
    'op-demo-help': {
      title: '操作の説明を確認する（サンプル）',
      steps: ['元のアプリでヘルプを開きます。', '目的の操作の説明と、実際の画面を見比べます。'],
      caution: 'これは画面確認用の例です。各アプリの実際の手順は、担当者の原稿を確認してから採用します。',
    },
  },
  nodes: {
    'tr-demo-start': {
      entry: true,
      question: 'どんなことで困っていますか？',
      choices: [
        { id: 'operation', label: '画面は開くが、操作方法が分からない', next: 'question', ref: 'tr-demo-help' },
        { id: 'cannot-open', label: 'アプリの画面を開けない', next: 'handoff', ref: '-' },
        ...fallback,
      ],
    },
    'tr-demo-help': {
      entry: false,
      question: 'アプリのヘルプは確認できましたか？',
      choices: [
        { id: 'not-yet', label: 'まだ確認していない', next: 'guide', ref: 'op-demo-help' },
        { id: 'still-unclear', label: '確認したが、分からなかった', next: 'handoff', ref: '-' },
        ...fallback,
      ],
    },
  },
};

export const sampleCases = [
  {
    id: 'HD-DEMO-001', appId: 'logic', title: '説明を読んでも操作が分かりません', status: '教員判断待ち',
    messages: [{ role: 'student', text: 'ヘルプを確認しましたが、どの操作を選べばよいか分かりません。' }],
    internal: ['資料内の案内で足りるか、確認する場面の表示例です。'],
  },
  {
    id: 'HD-DEMO-002', appId: 'graph', title: '操作の説明をもう一度確認したいです', status: '再確認待ち',
    messages: [
      { role: 'student', text: '説明を確認したので、もう一度試してみます。' },
      { role: 'desk', text: '案内した操作を試し、解決したか教えてください。（サンプル回答）' },
    ],
    internal: [],
  },
];
