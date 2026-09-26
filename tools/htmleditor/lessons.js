/**
 * HTML実習教材定義およびサンプルファイル・提出先マッピング
 * 海城中学高等学校 情報科
 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.HtmlLessons = factory();
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const SUBMIT_BASE_URL = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxBumMkcK31LENmqOX15neY8ZF09nkwD7lIUUzzdhbxtbEt_TYFr_QS32Zs_3Zb6Ba45g/exec';

  function buildSubmitUrl(pid, variant) {
    const url = new URL(SUBMIT_BASE_URL);
    url.searchParams.set('pid', pid);
    url.searchParams.set('mode', 'submit');
    if (variant) url.searchParams.set('variant', variant);
    return url.href;
  }

  const DEFAULT_HTML = `<!doctype html>
<html lang="ja">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>Webページ作成</title>
    <style>
      body {
        font-family: -apple-system, BlinkMacSystemFont, "Hiragino Sans", sans-serif;
        line-height: 1.6;
        margin: 24px;
      }
      h1 { color: #00548a; }
    </style>
  </head>
  <body>
    <h1>見出し１</h1>
    <p>ここに段落の文章を記述します。</p>
  </body>
</html>`;

  const LESSONS = [
    {
      id: 'html11',
      title: '1-1. HTMLとは・実習の進め方',
      category: '1. HTMLの基本',
      docUrl: '../../html11.html',
      files: []
    },
    {
      id: 'html12',
      title: '1-2. HTMLファイルの構成',
      category: '1. HTMLの基本',
      docUrl: '../../html12.html',
      files: [
        {
          id: 'sample1-2',
          fileName: 'sample1-2.html',
          title: 'HTMLファイルの構成',
          fileUrl: '../../html/sample1-2.html',
          pid: 'htmlp',
          variant: 'sample1-2',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-2')
        }
      ]
    },
    {
      id: 'html13',
      title: '1-3. 見出し・段落・文字の強調',
      category: '1. HTMLの基本',
      docUrl: '../../html13.html',
      files: [
        {
          id: 'sample1-3_1',
          fileName: 'sample1-3_1.html',
          title: '見出し・段落・強調',
          fileUrl: '../../html/sample1-3_1.html',
          pid: 'htmlp',
          variant: 'sample1-3_1',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-3_1')
        },
        {
          id: 'sample1-3_2',
          fileName: 'sample1-3_2.html',
          title: 'ページの構成',
          fileUrl: '../../html/sample1-3_2.html',
          pid: 'htmlp',
          variant: 'sample1-3_2',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-3_2')
        }
      ]
    },
    {
      id: 'html14',
      title: '1-4. 画像',
      category: '1. HTMLの基本',
      docUrl: '../../html14.html',
      files: [
        {
          id: 'sample1-4',
          fileName: 'sample1-4.html',
          title: '画像',
          fileUrl: '../../html/sample1-4.html',
          pid: 'htmlp',
          variant: 'sample1-4',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-4')
        }
      ]
    },
    {
      id: 'html15',
      title: '1-5. リンク',
      category: '1. HTMLの基本',
      docUrl: '../../html15.html',
      files: [
        {
          id: 'sample1-5_1',
          fileName: 'sample1-5_1.html',
          title: 'リンク1',
          fileUrl: '../../html/sample1-5_1.html',
          pid: 'htmlp',
          variant: 'sample1-5_1',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-5_1')
        },
        {
          id: 'sample1-5_2',
          fileName: 'sample1-5_2.html',
          title: 'リンク2',
          fileUrl: '../../html/sample1-5_2.html',
          pid: 'htmlp',
          variant: 'sample1-5_2',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-5_2')
        }
      ]
    },
    {
      id: 'html16',
      title: '1-6. リスト',
      category: '1. HTMLの基本',
      docUrl: '../../html16.html',
      files: [
        {
          id: 'sample1-6',
          fileName: 'sample1-6.html',
          title: 'リスト',
          fileUrl: '../../html/sample1-6.html',
          pid: 'htmlp',
          variant: 'sample1-6',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-6')
        }
      ]
    },
    {
      id: 'html17',
      title: '1-7. テーブル（表）',
      category: '1. HTMLの基本',
      docUrl: '../../html17.html',
      files: [
        {
          id: 'sample1-7',
          fileName: 'sample1-7.html',
          title: 'テーブル',
          fileUrl: '../../html/sample1-7.html',
          pid: 'htmlp',
          variant: 'sample1-7',
          submitUrl: buildSubmitUrl('htmlp', 'sample1-7')
        }
      ]
    },
    {
      id: 'html18',
      title: '1-8. HTMLの応用',
      category: '1. HTMLの基本',
      docUrl: '../../html18.html',
      files: []
    },
    {
      id: 'html21',
      title: '2-1. CSSとは',
      category: '2. CSSの基本',
      docUrl: '../../html21.html',
      files: [
        {
          id: 'sample2-1',
          fileName: 'sample2-1.html',
          title: 'CSSの基本',
          fileUrl: '../../html/sample2-1.html',
          pid: 'htmlp',
          variant: 'sample2-1',
          submitUrl: buildSubmitUrl('htmlp', 'sample2-1')
        }
      ]
    },
    {
      id: 'html22',
      title: '2-2. フォントの書式',
      category: '2. CSSの基本',
      docUrl: '../../html22.html',
      files: [
        {
          id: 'sample2-2_1',
          fileName: 'sample2-2_1.html',
          title: 'テキストのスタイル例題',
          fileUrl: '../../html/sample2-2_1.html',
          pid: 'htmlp',
          variant: 'sample2-2_1',
          submitUrl: buildSubmitUrl('htmlp', 'sample2-2_1')
        },
        {
          id: 'sample2-2_2',
          fileName: 'sample2-2_2.html',
          title: 'テキストのスタイル実践',
          fileUrl: '../../html/sample2-2_2.html',
          pid: 'htmlp',
          variant: 'sample2-2_2',
          submitUrl: buildSubmitUrl('htmlp', 'sample2-2_2')
        }
      ]
    },
    {
      id: 'html23',
      title: '2-3. IDとクラス',
      category: '2. CSSの基本',
      docUrl: '../../html23.html',
      files: [
        {
          id: 'sample2-3',
          fileName: 'sample2-3.html',
          title: 'IDとクラス',
          fileUrl: '../../html/sample2-3.html',
          pid: 'htmlp',
          variant: 'sample2-3',
          submitUrl: buildSubmitUrl('htmlp', 'sample2-3')
        }
      ]
    },
    {
      id: 'html24',
      title: '2-4. ブロック要素の書式',
      category: '2. CSSの基本',
      docUrl: '../../html24.html',
      files: [
        {
          id: 'sample2-4',
          fileName: 'sample2-4.html',
          title: 'ブロック要素の書式',
          fileUrl: '../../html/sample2-4.html',
          pid: 'htmlp',
          variant: 'sample2-4',
          submitUrl: buildSubmitUrl('htmlp', 'sample2-4')
        }
      ]
    },
    {
      id: 'html25',
      title: '2-5. CSSの応用',
      category: '2. CSSの基本',
      docUrl: '../../html25.html',
      files: []
    }
  ];

  function getLesson(id) {
    return LESSONS.find(lesson => lesson.id === id) || null;
  }

  function findFileByName(fileName) {
    const target = (fileName || '').toLowerCase();
    for (const lesson of LESSONS) {
      for (const file of lesson.files) {
        if (file.fileName.toLowerCase() === target) {
          return { lesson, file };
        }
      }
    }
    return null;
  }

  return Object.freeze({
    DEFAULT_HTML,
    LESSONS,
    getLesson,
    findFileByName,
    buildSubmitUrl
  });
}));
