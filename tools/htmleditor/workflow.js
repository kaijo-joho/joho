/* 画面の案内だけを決める。ログイン状態・署名の正否・提出受領は判定しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory;
  else root.HtmlEditorWorkflow = factory(root.HtmlPracticeEditor);
})(typeof globalThis === 'undefined' ? this : globalThis, function (practice) {
  'use strict';
  const keepEditing = '編集と保存は続けられます。';
  function catalogMessage(state) {
    if (state === 'loading') return '学校課題の配付設定を読み込んでいます。' + keepEditing;
    if (state === 'timeout') return '学校課題の配付設定の読込みを完了できませんでした。編集内容を保存してから再読み込みしてください。';
    return '学校課題の配付設定を読み込めませんでした。' + keepEditing + '保存後に再読み込みしてください。';
  }
  function distribution(pages, taskId, links, state) {
    if (!taskId) return {kind:'no-task', item:null, message:'この単元には配付課題がありません。解説と基本編集を利用できます。'};
    if (state !== 'ready') return {kind:state, item:null, message:catalogMessage(state)};
    const item = practice.resource(pages, taskId, links);
    return item ? {kind:'ready', item, message:'取得・提出は海城の学校アカウント専用です。'} :
      {kind:'unavailable', item:null, message:'この課題の配付リンクは現在利用できません。授業では先生の案内を確認してください。'};
  }
  function submission(pages, fileName, source, links, state) {
    const unavailable = (kind, message) => ({kind, ready:false, message});
    const id = practice.taskForFile(fileName);
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024) {
      return unavailable('size', '学校へ提出できるHTMLは2MiB以内です。編集内容はファイルに保存できます。');
    }
    let proof;
    try { proof = practice.inspect(source); }
    catch { return unavailable('proof-invalid', '配付情報を読み取れないため提出準備はできません。内容を保存し、授業では先生に相談してください。'); }
    if (!proof) return unavailable(id ? 'proof-missing' : 'local', id ?
      'このファイルには本人用の配付情報がありません。内容を保存し、授業では本人用HTMLを確認してください。' :
      '通常のファイルです。編集・保存はログイン不要です。学校への提出は本人用HTMLが対象です。');
    if (!id || proof.assignmentId !== id || proof.fileName !== String(fileName).split('/').pop()) {
      return unavailable('name-mismatch', 'ファイル名と配付情報が一致しません。内容を保存して、配付時のファイル名を確認してください。');
    }
    if (state !== 'ready') return unavailable('catalog-' + state, catalogMessage(state));
    try {
      const receipt = practice.submission(pages, fileName, source, links);
      return {kind:'ready', ready:true, receipt, message:'学校への提出対象：' + receipt.fileName + '。本人・学年・受付期間は提出画面で確認します。'};
    } catch {
      return unavailable('unavailable', 'このファイルの提出先を現在確認できません。内容は保存できます。授業では先生の案内を確認してください。');
    }
  }
  function newFileName(value) {
    const name = typeof value === 'string' ? value.trim() : '';
    if (!name || name.length > 100 || name.startsWith('.') ||
        /[\u0000-\u001f\u007f/\\:%?*"<>|]/.test(name) || !/\.(html?|css)$/i.test(name) ||
        /^(?:con|prn|aux|nul|com[0-9]|lpt[0-9])\./i.test(name)) {
      throw Error('フォルダを含めず、.html、.htm、.cssで終わるファイル名を入力してください。');
    }
    return name;
  }
  return Object.freeze({distribution, submission, newFileName});
});
