// 共通操作アイコン。図柄は同じディレクトリの SVG シンボルから参照する。
(() => {
  'use strict';
  const namespace = 'http://www.w3.org/2000/svg';
  const sprite = new URL('ui-icons.svg?v=20261113', document.currentScript.src).href;
  const ids = Object.freeze([
    'undo', 'redo', 'settings', 'help', 'file', 'new', 'rename', 'save', 'open',
    'copy', 'paste', 'duplicate', 'delete', 'view', 'fit', 'export',
    'theme-auto', 'theme-light', 'theme-dark', 'more', 'close', 'zoom-in', 'zoom-out',
    'fullscreen-enter', 'fullscreen-exit', 'play', 'pause', 'stop', 'refresh', 'restart',
    'select', 'pan', 'align-left', 'align-center', 'align-right', 'align-top', 'align-middle',
    'align-bottom', 'distribute-horizontal', 'distribute-vertical', 'flip-horizontal',
    'flip-vertical', 'group', 'ungroup', 'lock', 'unlock'
  ]);
  const known = new Set(ids);
  const paint = 'fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round';
  const escape = value => String(value).replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[c]);
  function url(id) {
    if (!known.has(id)) throw new RangeError('未定義の共通アイコン: ' + id);
    return sprite + '#' + id;
  }
  function svg(id, { className = 'joho-icon', size = 22 } = {}) {
    const href = url(id);
    if (!Number.isFinite(size) || size <= 0) throw new RangeError('アイコンの大きさは正の数で指定してください。');
    return `<svg xmlns="${namespace}" class="${escape(className)}" data-joho-icon="${id}" viewBox="0 0 24 24" width="${size}" height="${size}" aria-hidden="true" focusable="false" style="${paint}"><use href="${escape(href)}"/></svg>`;
  }
  function apply(node, id) {
    const href = url(id);
    if (node?.namespaceURI !== namespace || node.localName !== 'svg') throw new TypeError('SVG要素を指定してください。');
    node.setAttribute('viewBox', '0 0 24 24');
    node.setAttribute('aria-hidden', 'true'); node.setAttribute('focusable', 'false');
    node.setAttribute('data-joho-icon', id);
    if (!node.hasAttribute('width')) node.setAttribute('width', '22');
    if (!node.hasAttribute('height')) node.setAttribute('height', '22');
    for (const entry of paint.split(';')) {
      const [name, value] = entry.split(':'); node.style.setProperty(name, value);
    }
    const use = node.ownerDocument.createElementNS(namespace, 'use');
    use.setAttribute('href', href); node.replaceChildren(use);
    return node;
  }
  function create(id, { className = 'joho-icon', size = 22 } = {}) {
    if (!Number.isFinite(size) || size <= 0) throw new RangeError('アイコンの大きさは正の数で指定してください。');
    const node = document.createElementNS(namespace, 'svg');
    node.setAttribute('class', className); node.setAttribute('width', String(size)); node.setAttribute('height', String(size));
    return apply(node, id);
  }
  window.JohoIcons = Object.freeze({ ids, has: id => known.has(id), url, svg, create, apply });
})();
