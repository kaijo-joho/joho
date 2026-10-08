/* 配付情報は保存・提出には保持し、編集画面からのコピーだけを抑止する。秘匿化ではない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlEditorClipboard = factory();
})(typeof globalThis === 'undefined' ? this : globalThis, function () {
  'use strict';
  function selectedText(cm, marker) {
    const protectedRange = marker?.find();
    if (!protectedRange) return null;
    const source = cm.getValue(), start = cm.indexFromPos(protectedRange.from), end = cm.indexFromPos(protectedRange.to);
    const selections = cm.listSelections();
    const hasSelection = selections.some(range => cm.indexFromPos(range.anchor) !== cm.indexFromPos(range.head));
    if (!hasSelection && !cm.getOption('lineWiseCopyCut')) return null;
    let protectedSelection = false;
    const text = selections.map(range => {
      let from = Math.min(cm.indexFromPos(range.anchor), cm.indexFromPos(range.head));
      let to = Math.max(cm.indexFromPos(range.anchor), cm.indexFromPos(range.head));
      if (!hasSelection) {
        from = cm.indexFromPos({line:range.head.line, ch:0});
        const newline = source.indexOf('\n', from);
        to = newline < 0 ? source.length : newline + 1;
      }
      if (from < end && to > start) {
        protectedSelection = true;
        return source.slice(from, Math.max(from, start)) + source.slice(Math.min(to, end), to);
      }
      return source.slice(from, to);
    }).join('\n');
    return protectedSelection ? text : null;
  }
  function install(cm, getMarker, notify) {
    const wrapper = cm.getWrapperElement();
    for (const type of ['copy','cut','dragstart']) wrapper.addEventListener(type, event => {
      const marker = getMarker();
      if (!marker) return;
      let text;
      try { text = selectedText(cm, marker); }
      catch { text = ''; }
      const widgetDrag = type === 'dragstart' && event.target?.closest?.('.issued-marker');
      if (text === null && !widgetDrag) return;
      // CodeMirrorの内部コピー・切り取り処理より先に止める。失敗時も原文へ戻さない。
      event.preventDefault(); event.stopImmediatePropagation();
      if (type === 'copy') {
        try {
          if (!event.clipboardData) throw Error('clipboard unavailable');
          event.clipboardData.clearData();
          event.clipboardData.setData('text/plain', text);
          notify('配付情報を除いてコピーしました。', 'info');
        } catch { notify('配付情報を含む範囲はコピーできません。本文だけを選択してください。', 'warning'); }
      } else {
        notify('配付情報を含む範囲は' + (type === 'cut' ? '切り取れません' : 'ドラッグできません') + '。本文だけを選択してください。', 'warning');
      }
    }, true);
  }
  return Object.freeze({selectedText, install});
});
