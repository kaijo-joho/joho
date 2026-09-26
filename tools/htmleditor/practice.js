/* 通常HTMLの画面用照合。署名・本人・学年・期限の認証は配付/提出サーバーだけで行う。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlPracticeEditor = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  const MAP = Object.freeze({
    'sample1-2':'html12-01', 'sample1-3_1':'html13-01', 'sample1-3_2':'html13-02',
    'sample1-4':'html14-01', 'sample1-5_1':'html15-01', 'sample1-5_2':'html15-02',
    'sample1-6':'html16-01', 'sample1-7':'html17-01', 'sample2-2_1':'html22-01',
    'sample2-2_2':'html22-02', 'sample2-3':'html23-01', 'sample2-4':'html24-01'
  });
  const targets = Object.freeze(Object.values(MAP));
  const keys = ['v','issueId','issuedAt','fiscalYear','grade','assignmentId','submitBackend',
    'submitTargetId','fileName','templateVersion','templateSha256','keyId'];
  function lessons(legacy) {
    return legacy.map(lesson => ({...lesson,
      docUrl: lesson.docUrl + '?view=lesson',
      files: lesson.files.filter(file => MAP[file.id]).map(file =>
        ({id:MAP[file.id], fileName:MAP[file.id] + '.html', title:file.title}))
    }));
  }
  function taskForFile(fileName) {
    const name = String(fileName).split('/').pop();
    return targets.find(id => name === id + '.html') || null;
  }
  function resource(pages, id, links) {
    if (!targets.includes(id) || !links || typeof links.normalize !== 'function') return null;
    const page = pages && pages[id.slice(0,6)];
    if (!page || page.release !== true || !Array.isArray(page.practiceFile)) return null;
    const matches = page.practiceFile.filter(row => row && typeof row.id === 'string' && row.id.trim().toLowerCase() === id);
    return matches.length === 1 ? links.normalize(matches[0]) : null;
  }
  function inspect(source) {
    const markers = String(source).match(/joho-issued-html/g) || [];
    if (!markers.length) return null;
    const match = String(source).match(/<!-- joho-issued-html:v2:([A-Za-z0-9_-]{1,2048})\.([A-Za-z0-9_-]{43}) -->/);
    if (markers.length !== 1 || !match) throw Error('本人用の配付情報を読み取れません。編集内容は残して、先生に相談してください。');
    let data, json;
    try {
      json = new TextDecoder('utf-8', {fatal:true}).decode(Uint8Array.from(atob(match[1].replace(/-/g,'+').replace(/_/g,'/')), c => c.charCodeAt(0)));
      data = JSON.parse(json);
    } catch { throw Error('配付情報の形式が正しくありません。'); }
    const canonical = Object.fromEntries(keys.map(key => [key, data && data[key]]));
    if (!data || Object.keys(data).length !== keys.length || JSON.stringify(canonical) !== json ||
        data.v !== 2 || typeof data.issueId !== 'string' || !/^[a-f0-9]{32}$/.test(data.issueId) || typeof data.issuedAt !== 'string' ||
        !Number.isFinite(Date.parse(data.issuedAt)) || new Date(data.issuedAt).toISOString() !== data.issuedAt ||
        !Number.isInteger(data.fiscalYear) || data.fiscalYear < 2000 || data.fiscalYear > 2200 ||
        !Number.isInteger(data.grade) || data.grade < 1 || data.grade > 6 ||
        !targets.includes(data.assignmentId) || data.submitBackend !== 'grade' ||
        data.submitTargetId !== data.assignmentId || data.fileName !== data.assignmentId + '.html' ||
        typeof data.templateVersion !== 'string' || !/^[A-Za-z0-9._-]{1,64}$/.test(data.templateVersion) ||
        typeof data.templateSha256 !== 'string' || !/^[a-f0-9]{64}$/.test(data.templateSha256) ||
        typeof data.keyId !== 'string' || !/^[A-Za-z0-9_-]{1,40}$/.test(data.keyId)) {
      throw Error('本人用HTMLの課題情報が正しくありません。');
    }
    return Object.freeze({...canonical, marker:match[0]});
  }
  function submission(pages, fileName, source, links) {
    if (typeof source !== 'string' || new TextEncoder().encode(source).byteLength > 2 * 1024 * 1024) {
      throw Error('HTMLは2MiB以内で提出してください。画像はHTMLへ埋め込まず、相対パスで参照します。');
    }
    const id = taskForFile(fileName), item = resource(pages, id, links), proof = inspect(source);
    if (!item || !proof || proof.assignmentId !== id || proof.fileName !== String(fileName).split('/').pop()) {
      throw Error('本人用HTMLと提出先の対応を確認できません。ファイル名と配付情報を確認してください。');
    }
    // 年度/学年をURLで指定して認可しない。遷移先が学校アカウントと登録版を再検証する。
    return {url:item.submitUrl, fileName:item.fileName, proof};
  }
  function launch(href, catalog) {
    const url = new URL(href), lesson = url.searchParams.get('lesson'), task = url.searchParams.get('task');
    if ([...url.searchParams.keys()].some(key => !['lesson','task'].includes(key)) ||
        url.searchParams.getAll('lesson').length > 1 || url.searchParams.getAll('task').length > 1 ||
        (url.searchParams.has('lesson') && !catalog.some(row => row.id === lesson)) ||
        (url.searchParams.has('task') && !targets.includes(task)) ||
        (lesson && task && !task.startsWith(lesson + '-'))) throw Error('指定された教材と課題を確認できません。');
    const lessonId = lesson || (task && task.slice(0,6)) || 'html12';
    const row = catalog.find(row => row.id === lessonId);
    return {lessonId, taskId:task || row.files[0]?.id || '', hash:/^#[A-Za-z0-9_-]{1,100}$/.test(url.hash) ? url.hash : ''};
  }
  return Object.freeze({targets, lessons, taskForFile, resource, inspect, submission, launch});
});
