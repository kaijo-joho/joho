/* 標準操作の名前だけを対応付ける。図柄は tools/shared/ui-icons.svg を参照。 */
(function (root) {
  'use strict';
  const sprite = new URL('../shared/ui-icons.svg?v=20261113', document.currentScript.src).href;
  const ids = new Set(('undo redo settings help file new rename save open copy paste duplicate delete view fit export theme-auto theme-light theme-dark more close zoom-in zoom-out fullscreen-enter fullscreen-exit play pause stop refresh restart select pan align-left align-center align-right align-top align-middle align-bottom distribute-horizontal distribute-vertical flip-horizontal flip-vertical group ungroup lock unlock').split(' '));
  const aliases = {plus:'new',edit:'rename',arrange:'align-left','align-distribute-x':'distribute-horizontal','align-distribute-y':'distribute-vertical','flip-h':'flip-horizontal','flip-v':'flip-vertical'};
  const standard = name => aliases[name] || name;
  function svg(name) {
    const id = standard(name);
    if (!ids.has(id)) return '';
    if (root.JohoIcons) return root.JohoIcons.svg(id);
    // 共通JSを読めない場合も操作できるよう、同じ公開SVGへ参照する。
    // 図柄のコピーは持たない。
    return `<svg class="joho-icon" data-joho-icon="${id}" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true" focusable="false" style="fill:none;stroke:currentColor;stroke-width:1.7;stroke-linecap:round;stroke-linejoin:round"><use href="${sprite}#${id}"/></svg>`;
  }
  root.IlapoIcons = Object.freeze({has:name=>ids.has(standard(name)),svg});
}(window));
