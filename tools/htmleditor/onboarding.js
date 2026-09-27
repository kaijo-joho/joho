/* 導入課題のローカル操作確認。認証・提出の証明ではなく、この画面だけの案内。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlEditorOnboarding = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const target = 'html11-01', fileName = target + '.html', folderName = 'HTML実習';
  function assess({doc, source, connected, directory, directoryName, files, lessonId}) {
    const basename = doc ? String(doc.fileName).split('/').pop() : '';
    const active = basename === fileName || lessonId === 'html11' && !/^html\d{2}-\d{2}\.html$/.test(basename);
    const folder = Boolean(connected && directory && directoryName === folderName);
    const opened = Boolean(folder && files.includes(fileName) && doc?.fileName === fileName &&
      doc.openedFrom === directory && doc.binding === directory);
    const saved = Boolean(opened && doc.verifiedSave && doc.verifiedSave.directory === directory &&
      doc.verifiedSave.content === source && doc.savedContent === source);
    const steps = [
      {done:folder, text:'「HTML実習」フォルダを接続'},
      {done:opened, text:'その中の html11-01.html を開く'},
      {done:saved, text:'「保存」でMacのファイルへの保存を確認'}
    ];
    const message = !folder ? '「HTML実習」フォルダを作成し、本人用の html11-01.html を入れてからフォルダを接続してください。' :
      !opened ? '「ファイル」→「読み込んだファイル一覧…」から、HTML実習フォルダ直下の html11-01.html を開いてください。' :
      !saved ? 'コードの編集は不要です。「保存」を押して、Macのファイルへ保存できることを確認してください。' :
      '実習の準備ができました。「提出」から保存したHTMLを提出してください。';
    return {active, ready:saved, steps, message};
  }
  return Object.freeze({target, fileName, folderName, assess});
});
