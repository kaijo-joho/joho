// 通常HTMLの公開DTOだけを扱う。認証・発行・受領判定は各サーバーで行う。
(function (root) {
  'use strict';

  const TARGETS = new Set([
    'html12-01', 'html13-01', 'html13-02', 'html14-01',
    'html15-01', 'html15-02', 'html16-01', 'html17-01',
    'html22-01', 'html22-02', 'html23-01', 'html24-01'
  ]);
  const APP_BASE = 'https://script\\.google\\.com/(?:macros/s/|a/macros/gfe\\.kaijo\\.ed\\.jp/s/)[A-Za-z0-9_-]+/exec';
  const GUIDE = '取得したHTMLを編集して保存し、提出画面で選択してください。';

  // 不正な通常HTMLも旧Colabや通常DLへ流さないため、検出は検証より広くする。
  function claims(raw) {
    return Boolean(raw && (
      raw.distributionMode === 'personal-html-v2' ||
      (typeof raw.id === 'string' && /^html\d{2}-\d{2}$/i.test(raw.id.trim())) ||
      (typeof raw.fileName === 'string' && /^html\d{2}-\d{2}\.html$/i.test(raw.fileName.trim()))
    ));
  }

  function normalize(raw) {
    if (!raw || !TARGETS.has(raw.id) || raw.fileName !== raw.id + '.html' ||
        raw.distributionMode !== 'personal-html-v2' || raw.submitBackend !== 'grade' ||
        raw.release !== true || typeof raw.title !== 'string' ||
        !raw.title || raw.title !== raw.title.trim() || raw.title.length > 150 ||
        /[<>\u0000-\u001f]/.test(raw.title)) return null;

    // 生成側の正規ルートだけを許可。別課題・追加引数・旧提出先へは補完しない。
    const distribution = new RegExp('^' + APP_BASE + '\\?type=htmlPractice&target=' + raw.id + '$');
    const submission = new RegExp('^' + APP_BASE + '\\?kind=html&flow=normal&kadai=' + raw.id + '$');
    if (typeof raw.url !== 'string' || raw.url !== raw.url.trim() || !distribution.test(raw.url) ||
        typeof raw.submitUrl !== 'string' || raw.submitUrl !== raw.submitUrl.trim() || !submission.test(raw.submitUrl)) return null;

    return {
      id: raw.id, title: raw.title, text: raw.title, fileName: raw.fileName,
      release: true, url: raw.url, distributionMode: 'personal-html-v2',
      submitBackend: 'grade', submitUrl: raw.submitUrl
    };
  }

  function createEntry(raw) {
    const item = normalize(raw);
    if (!item) return null;
    const doc = root.document;
    const entry = doc.createElement('div');
    entry.className = 'html-practice-entry';
    const title = doc.createElement('span');
    title.className = 'html-practice-entry__title';
    title.textContent = item.title;
    const fileName = doc.createElement('code');
    fileName.className = 'html-practice-entry__filename';
    fileName.textContent = item.fileName;
    const actions = doc.createElement('span');
    actions.className = 'html-practice-entry__actions';
    [
      ['本人用HTMLを取得', item.url],
      ['提出する', item.submitUrl]
    ].forEach(([label, url]) => {
      const link = doc.createElement('a');
      link.className = 'html-practice-entry__link';
      link.href = url;
      link.target = '_blank';
      link.rel = 'noopener';
      link.tabIndex = 0; // Safariの標準設定でも、取得→提出をTabで辿れるようにする。
      link.textContent = label;
      link.setAttribute('aria-label', item.title + '：' + label);
      actions.appendChild(link);
    });
    entry.append(title, fileName, actions);
    return entry;
  }

  const api = Object.freeze({ claims, normalize, createEntry, guide: GUIDE });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.htmlPracticeLinks = api;
})(typeof window === 'undefined' ? globalThis : window);
