/* 発表するページと配布する内容の境界。編集用の文書は変更しない。 */
(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./core.js'), require('./layers.js'));
  else root.IlapoPresentationData = factory(root.IlapoCore, root.IlapoLayers);
}(globalThis, function (C, L) {
  'use strict';
  function pages(document) {
    const result = document.pages.filter(page => page.skip !== true);
    if (!result.length) throw new Error('すべてのページが発表スキップになっています。ページ一覧でスキップを解除してください。');
    return result;
  }
  function startIndex(document, pageId) {
    const included = pages(document);
    if (pageId == null) return 0;
    const sourceIndex = document.pages.findIndex(page => page.id === pageId);
    if (sourceIndex < 0) throw new RangeError('指定されたページがありません。');
    const next = document.pages.slice(sourceIndex).find(page => page.skip !== true);
    return next ? included.findIndex(page => page.id === next.id) : included.length - 1;
  }
  function outputDocument(input) {
    const document = C.validateDocument(input);
    document.pages = pages(document).map(source => {
      const page = L.forOutput(source);
      delete page.notes; delete page.skip;
      page.objects = page.objects.filter(object => !(object.type === 'image' && object.reference));
      const ids = new Set(page.objects.map(object => object.id));
      for (const object of page.objects) if (object.type === 'connector') {
        for (const end of [object.from, object.to]) if (end.objectId && !ids.has(end.objectId)) end.objectId = null;
      }
      L.reconcile(page); C.pruneAnimations(page);
      return page;
    });
    return C.validateDocument(document);
  }
  return Object.freeze({pages, startIndex, outputDocument});
}));
