/* Small artwork previews shared by the layer and animation panels. */
(function (root) {
  'use strict';
  const cache = new WeakMap();
  function markup(page, ids) {
    let entry = cache.get(page);
    if (!entry) {
      entry = {previews: new Map(), objects: new Map(page.objects.map((object, index) => [object.id, {object, index}]))};
      cache.set(page, entry);
    }
    const previews = entry.previews;
    const key = JSON.stringify(ids);
    if (previews.has(key)) return previews.get(key);
    const chosen = [...new Set(ids)].map(id => entry.objects.get(id)).filter(Boolean).sort((a, b) => a.index - b.index);
    const objects = chosen.map(item => root.IlapoCore.clone(item.object));
    // A row must not copy every other image in a large document. Only include
    // attachment targets temporarily when resolving a connector thumbnail.
    const context = new Map(objects.map(object => [object.id, object]));
    for (const object of objects) if (object.type === 'connector') {
      for (const end of [object.from, object.to]) if (end.objectId && !context.has(end.objectId)) {
        const target = entry.objects.get(end.objectId)?.object;
        if (target) context.set(target.id, root.IlapoCore.clone(target));
      }
    }
    root.IlapoConnectors.sync({objects: [...context.values()]});
    const boxes = objects.map(object => root.IlapoGeometry.visualBounds(object));
    let extent = 1;
    if (boxes.length) extent = Math.max(1,
      Math.max(...boxes.map(b => b.x + b.width)) - Math.min(...boxes.map(b => b.x)),
      Math.max(...boxes.map(b => b.y + b.height)) - Math.min(...boxes.map(b => b.y)));
    // Visibility is deliberately ignored here: a hidden row still needs a
    // recognizable preview so its author can find and show the object again.
    const preview = {id: page.id, name: page.name, board: {...page.board, infinite: true}, objects};
    const svg = root.IlapoSVG.exportPage(preview, {includeHidden: true, includeReferences: true, padding: extent * .08})
      .replace(/^<\?xml[^>]*>/, '')
      .replace(/ width="[^"]*" height="[^"]*"/, ' width="32" height="32"')
      .replace('<svg ', '<svg class="object-preview" aria-hidden="true" focusable="false" ');
    previews.set(key, svg);
    return svg;
  }
  root.IlapoObjectPreview = Object.freeze({markup});
}(globalThis));
