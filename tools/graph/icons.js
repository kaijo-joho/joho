(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.GraphIcons = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const NS = 'http://www.w3.org/2000/svg';
  const ICONS = {
    plus: [['path', { d: 'M12 4v16M4 12h16' }]],
    check: [['path', { d: 'm4 12 5 5L20 6' }]],
    link: [['path', { d: 'm9 15 6-6M8 16l-1 1a4 4 0 0 1-6-6l4-4a4 4 0 0 1 6 0m2 10a4 4 0 0 0 6 0l4-4a4 4 0 0 0-6-6l-1 1', transform:'translate(1 -1) scale(.92)' }]],
    range: [['path', { d: 'M4 6v12M20 6v12M4 12h16m-4-4 4 4-4 4M8 8l-4 4 4 4' }]],
    axes: [['path', { d: 'M5 3v16h16M2 6l3-3 3 3m10 10 3 3-3 3M9 17v4M14 17v4M3 9h4M3 14h4' }]],
    info: [['circle', { cx: 12, cy: 12, r: 9 }], ['path', { d: 'M12 11v6M12 7h.01' }]],
    download: [['path', { d: 'M12 3v12m-4-4 4 4 4-4M4 16v5h16v-5' }]],
    selectMultiple: [['rect', { x: 3, y: 3, width: 11, height: 11, rx: 1 }], ['rect', { x: 10, y: 10, width: 11, height: 11, rx: 1 }], ['path', { d: 'm12.5 15.5 2 2 4-4' }]],
    copyStyle: [['path', { d: 'M4 4h16v7H4zM7 11v4h5v6M8 4v4M12 4v4M16 4v4' }]],
    pasteStyle: [['path', { d: 'M8 5H5v16h14V5h-3M8 3h8v4H8zM8 13l3 3 5-6' }]],
    zoom: [['circle', { cx: 10, cy: 10, r: 6 }], ['path', { d: 'm15 15 6 6M7 10h6M10 7v6' }]],
    file: [['path', { d: 'M3 7V4h7l2 3h9v3M3 7v14h17l2-11H7L3 21' }]],
    undo: [['path', { d: 'M8 4 3 9l5 5M3 9h11a7 7 0 0 1 0 14' }]],
    redo: [['path', { d: 'm16 4 5 5-5 5m5-5H10a7 7 0 0 0 0 14' }]],
    edit: [['path', { d: 'M4 17.5V20h2.5L18 8.5 15.5 6 4 17.5Z' }], ['path', { d: 'm14.5 7 2.5 2.5' }]],
    palette: [['path', { d: 'M12 4a8 8 0 1 0 0 16h1.2a1.8 1.8 0 0 0 .4-3.6 1.8 1.8 0 0 1 1.4-2.9H17A3 3 0 0 0 20 10c0-3.3-3.6-6-8-6Z' }], ['circle', { cx: 7.5, cy: 11, r: .7 }], ['circle', { cx: 10, cy: 7.5, r: .7 }], ['circle', { cx: 14, cy: 7.5, r: .7 }]],
    label: [['path', { d: 'M4 6h11l5 6-5 6H4V6Z' }], ['circle', { cx: 8, cy: 12, r: 1 }]],
    show: [['path', { d: 'M3 12s3.2-5 9-5 9 5 9 5-3.2 5-9 5-9-5-9-5Z' }], ['circle', { cx: 12, cy: 12, r: 2.5 }]],
    hide: [['path', { d: 'M3 3 21 21' }], ['path', { d: 'M10.6 7.2A10.6 10.6 0 0 1 12 7c5.8 0 9 5 9 5a16.2 16.2 0 0 1-3.2 3.4M6.2 6.2A16.6 16.6 0 0 0 3 12s3.2 5 9 5c.6 0 1.2-.1 1.8-.2' }], ['path', { d: 'M10 10a2.8 2.8 0 0 0 4 4' }]],
    copy: [['rect', { x: 8, y: 8, width: 11, height: 11, rx: 1 }], ['path', { d: 'M5 15V5h10' }]],
    trash: [['path', { d: 'M5 7h14M9 7V4h6v3M7 7l1 13h8l1-13M10 11v5M14 11v5' }]],
    close: [['path', { d: 'm6 6 12 12M18 6 6 18' }]],
    more: [['circle', { cx: 5, cy: 12, r: .8 }], ['circle', { cx: 12, cy: 12, r: .8 }], ['circle', { cx: 19, cy: 12, r: .8 }]],
    moreVertical: [['circle', { cx: 12, cy: 5, r: .8 }], ['circle', { cx: 12, cy: 12, r: .8 }], ['circle', { cx: 12, cy: 19, r: .8 }]],
    point: [['path', { d: 'M12 3v3M12 18v3M3 12h3M18 12h3' }], ['circle', { cx: 12, cy: 12, r: 2.4, fill: 'currentColor' }]],
    tangent: [['path', { d: 'M3 12h18M4 20Q12 4 20 20' }], ['circle', { cx: 12, cy: 12, r: 1.5 }]],
    intersection: [['path', { d: 'M4 5 20 19M20 5 4 19' }], ['circle', { cx: 12, cy: 12, r: 1.7 }]],
    segment: [['path', { d: 'M5 17 19 7' }], ['circle', { cx: 5, cy: 17, r: 1.7 }], ['circle', { cx: 19, cy: 7, r: 1.7 }]],
    region: [['path', { d: 'm4 18 4-13 12 4-3 11-13-2Z', fill: 'currentColor', 'fill-opacity': .2 }], ['path', { d: 'm7 16 5-8m-1 10 5-8' }]],
    regression: [['path', { d: 'M4 4v16h16M7 16 20 6' }], ['circle', { cx: 8, cy: 12, r: 1 }], ['circle', { cx: 12, cy: 14, r: 1 }], ['circle', { cx: 17, cy: 7, r: 1 }]],
    statistics: [['path', { d: 'M4 20h16M6 17V11M12 17V4M18 17V8' }], ['path', { d: 'M4 8h4M10 2h4M16 5h4' }]],
    comparison: [['rect', { x: 3, y: 4, width: 8, height: 16, rx: 1 }], ['rect', { x: 14, y: 4, width: 7, height: 7, rx: 1 }], ['rect', { x: 14, y: 14, width: 7, height: 6, rx: 1 }]],
    residual: [['path', { d: 'M3 12h18M6 12V6m6 6v6m6-6V8' }], ['circle', { cx: 6, cy: 6, r: 1 }], ['circle', { cx: 12, cy: 18, r: 1 }], ['circle', { cx: 18, cy: 8, r: 1 }]],
    scatter: [['path', {d:'M4 3v17h17'}], ['circle',{cx:8,cy:15,r:1.2}], ['circle',{cx:11,cy:9,r:1.2}], ['circle',{cx:16,cy:12,r:1.2}], ['circle',{cx:19,cy:5,r:1.2}]],
    matrix: [['rect',{x:3,y:3,width:18,height:18,rx:1}], ['path',{d:'M3 9h18M3 15h18M9 3v18M15 3v18M5 6h2m4 6h2m4 6h2M5 12h.1M7 10.5h.1M11 18h.1M13 16.5h.1'}]],
    histogram: [['path',{d:'M3 20h18M5 20V12h5v8M10 20V5h5v15M15 20V9h5v11'}]],
    boxplot: [['rect',{x:8,y:6,width:8,height:12}], ['path',{d:'M3 12h5m8 0h5M3 9v6M21 9v6M12 6v12'}]],
    'line-solid': [['path',{d:'M2 12h20'}]],
    'line-dash': [['path',{d:'M2 12h20','stroke-dasharray':'5 4'}]],
    'line-dot': [['path',{d:'M2 12h20','stroke-dasharray':'.1 4','stroke-width':2.4}]],
    text: [['path', { d: 'M5 5h14M12 5v14M8 19h8' }]],
    guide: [['path', { d: 'M4 12h16M12 4v16' }], ['path', { d: 'M6 6h3M15 18h3' }]],
    continue: [['path', { d: 'M4 12h13' }], ['path', { d: 'm13 7 5 5-5 5' }], ['circle', { cx: 5, cy: 12, r: 1 }]],
    settings: [['path', { d: 'M4 6h3M11 6h9M4 12h9M17 12h3M4 18h3M11 18h9' }], ['circle', { cx: 9, cy: 6, r: 2 }], ['circle', { cx: 15, cy: 12, r: 2 }], ['circle', { cx: 9, cy: 18, r: 2 }]],
    table: [['rect', { x: 4, y: 5, width: 16, height: 14, rx: 1 }], ['path', { d: 'M4 10h16M4 15h16M9 5v14M15 5v14' }]],
    function: [['path', { d: 'M5 18c2-10 5-10 7-4s4 6 7-4' }], ['path', { d: 'M4 5h3M5.5 3.5v3' }]],
    upload: [['path', { d: 'M12 15V4M8 8l4-4 4 4M5 14v5h14v-5' }]],
    save: [['path', { d: 'M5 4h12l3 3v13H5V4Z' }], ['path', { d: 'M8 4v6h8V4M8 20v-6h8v6' }]],
    open: [['path', { d: 'M4 7h6l2 2h8v10H4V7Z' }], ['path', { d: 'M12 14V4M8 8l4-4 4 4' }]],
    fit: [['path', { d: 'M4 9V4h5M15 4h5v5M20 15v5h-5M9 20H4v-5' }], ['path', { d: 'M8 12h8M12 8v8' }]]
  };
  function create(name, document) {
    const doc = document || globalThis.document;
    if (!doc || typeof doc.createElementNS !== 'function') throw new Error('SVGを作成できません。');
    const svg = doc.createElementNS(NS, 'svg'), parts = ICONS[name] || ICONS.more;
    svg.setAttribute('viewBox', '0 0 24 24'); svg.setAttribute('width', '24'); svg.setAttribute('height', '24'); svg.setAttribute('fill', 'none'); svg.setAttribute('stroke', 'currentColor'); svg.setAttribute('stroke-width', '1.7'); svg.setAttribute('stroke-linecap', 'round'); svg.setAttribute('stroke-linejoin', 'round'); svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of parts) { const element = doc.createElementNS(NS, tag); for (const [key, value] of Object.entries(attributes)) element.setAttribute(key, String(value)); svg.appendChild(element); }
    return svg;
  }
  return { create };
}));
