/* URLで決まる編集用途。本人確認・配付・提出の許可を与えるものではない。 */
(function (root, factory) {
  'use strict';
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorModes = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const labels = Object.freeze({lesson:'実習', final:'最終課題', free:'自由編集'});
  function resolve(href) {
    const url = new URL(href), params = url.searchParams;
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw Error('エディタのURLを確認してください。');
    const allowed = ['mode','lesson','task'];
    for (const key of params.keys()) {
      if (!allowed.includes(key) || params.getAll(key).length !== 1 || !params.get(key)) throw Error('エディタのURL指定を確認してください。');
    }
    const mode = params.get('mode') || (params.has('lesson') || params.has('task') ? 'lesson' : 'free');
    if (!Object.hasOwn(labels, mode)) throw Error('編集モードを確認してください。');
    if (mode !== 'lesson' && (params.has('lesson') || params.has('task') || url.hash)) throw Error('このモードでは教材・課題を指定しません。');
    return mode;
  }
  function link(href, mode) {
    if (!['free','final'].includes(mode)) throw Error('開くモードを確認してください。');
    const url = new URL(href);
    if (!/^https?:$/.test(url.protocol) || url.username || url.password) throw Error('エディタのURLを確認してください。');
    url.search = ''; url.hash = '';
    if (mode === 'final') url.searchParams.set('mode','final');
    return url.href;
  }
  function lessonLocation(href) {
    if (resolve(href) !== 'lesson') throw Error('実習モードのURLを確認してください。');
    const url = new URL(href); url.searchParams.delete('mode'); return url.href;
  }
  function documentUrls(value) {
    try {
      const url = new URL(value);
      const match = /^\/document\/d\/([A-Za-z0-9_-]{20,150})\/(?:edit|view|preview)\/?$/.exec(url.pathname);
      if (url.origin !== 'https://docs.google.com' || url.username || url.password || !match) return null;
      const frame = new URL('https://docs.google.com/document/d/' + match[1] + '/preview');
      const tab = url.searchParams.get('tab');
      if (tab && /^t\.[A-Za-z0-9_-]+$/.test(tab)) frame.searchParams.set('tab',tab);
      // 元URLの見出しは別タブ用に保持する。iframeは文書の全体を表示する。
      return Object.freeze({open:url.href, frame:frame.href});
    } catch { return null; }
  }
  function initialSource(name) {
    if (/\.css$/i.test(name)) return '';
    return '<!doctype html>\n<html lang="ja">\n<head>\n  <meta charset="UTF-8">\n  <meta name="viewport" content="width=device-width, initial-scale=1">\n  <title></title>\n</head>\n<body>\n\n</body>\n</html>\n';
  }
  function fileName(value) {
    if (typeof value !== 'string' || !/^(?!\.)(?!.*(?:^|\/)\.\.\/)[^\\\u0000-\u001f\u007f:?#%]+\.(?:html?|css)$/i.test(value) || value.split('/').some(v=>!v || v==='.' || v==='..') || new TextEncoder().encode(value).length>240) return null;
    return value.normalize('NFC');
  }
  return Object.freeze({labels, resolve, link, lessonLocation, documentUrls, initialSource, fileName});
});
