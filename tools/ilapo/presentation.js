(function (root, factory) {
  'use strict';
  if (typeof module === 'object' && module.exports) {
    var core = require('./core.js');
    var svg = require('./svg.js');
    module.exports = factory(globalThis, core, svg);
  } else {
    root.IlapoPresentation = factory(root, root.IlapoCore, root.IlapoSVG);
  }
}(typeof globalThis !== 'undefined' ? globalThis : this, function (root, Core, SVG) {
  'use strict';

  var active = null;

  function clone(value) {
    if (Core && typeof Core.clone === 'function') return Core.clone(value);
    return JSON.parse(JSON.stringify(value));
  }

  function freeze(value) {
    if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
    Object.keys(value).forEach(function (key) { freeze(value[key]); });
    return Object.freeze(value);
  }

  function exportMarkup(page) {
    if (!SVG || typeof SVG.exportPage !== 'function') throw new Error('IlapoSVG.exportPage is required');
    return SVG.exportPage(page).replace(/^\s*<\?xml[^>]*>\s*/i, '');
  }

  function open(input, options) {
    options = options || {};
    if (!root.document || !root.document.body) throw new Error('IlapoPresentation.open requires a browser document');
    if (!Core || typeof Core.validateDocument !== 'function') throw new Error('IlapoCore.validateDocument is required');
    var documentValue = freeze(Core.validateDocument(clone(input)));
    var pages = documentValue.pages;
    var initial = options.pageId == null ? 0 : pages.findIndex(function (page) { return page.id === options.pageId; });
    if (initial < 0) throw new RangeError('Unknown page id: ' + options.pageId);
    if (active) active.close();

    var doc = root.document;
    var opener = options.opener && typeof options.opener.focus === 'function' ? options.opener : doc.activeElement;
    var bodyOverflow = doc.body.style.overflow;
    var dialog = doc.createElement('dialog');
    dialog.className = 'ilapo-present-dialog';
    dialog.id = 'ilapo-presentation';
    dialog.setAttribute('aria-modal', 'true');
    dialog.setAttribute('aria-label', '発表表示');

    var header = doc.createElement('header');
    header.className = 'ilapo-present-header';
    var heading = doc.createElement('h1');
    heading.className = 'ilapo-present-document';
    var status = doc.createElement('span');
    status.className = 'ilapo-present-status';
    status.setAttribute('aria-live', 'polite');
    status.setAttribute('aria-atomic', 'true');
    var closeButton = doc.createElement('button');
    closeButton.type = 'button';
    closeButton.className = 'ilapo-present-close';
    closeButton.setAttribute('aria-label', '発表表示を終了');
    closeButton.textContent = '終了';
    header.append(heading, status, closeButton);

    var viewport = doc.createElement('div');
    viewport.className = 'ilapo-present-viewport';
    viewport.setAttribute('role', 'presentation');
    var paper = doc.createElement('div');
    paper.className = 'ilapo-present-paper';
    paper.setAttribute('role', 'img');
    paper.setAttribute('aria-label', '現在のページ');
    viewport.append(paper);

    var controls = doc.createElement('nav');
    controls.className = 'ilapo-present-controls';
    controls.setAttribute('aria-label', '発表操作');
    var previousButton = doc.createElement('button');
    previousButton.type = 'button'; previousButton.className = 'ilapo-present-previous'; previousButton.textContent = '‹ 前へ';
    var nextButton = doc.createElement('button');
    nextButton.type = 'button'; nextButton.className = 'ilapo-present-next'; nextButton.textContent = '次へ ›';
    var fullscreenButton = doc.createElement('button');
    fullscreenButton.type = 'button'; fullscreenButton.className = 'ilapo-present-fullscreen'; fullscreenButton.textContent = '全画面';
    controls.append(previousButton, nextButton, fullscreenButton);

    dialog.append(header, viewport, controls);
    doc.body.appendChild(dialog);
    var index = initial;
    var pointerStart = null;
    var closed = false;
    var fullscreen = false;
    var ownsFullscreen=false,fullscreenTarget=doc.documentElement,suppressClick=false,pageRatio=1,exitingFullscreen=false;
    var previousActive = opener;

    function focusables() {
      return Array.prototype.slice.call(dialog.querySelectorAll('button,[href],[tabindex]:not([tabindex="-1"])'))
        .filter(function (el) { return !el.disabled && el.offsetParent !== null; });
    }

    function sizePaper() {
      if (closed) return;
      var computed=root.getComputedStyle(viewport),availableWidth=viewport.clientWidth-parseFloat(computed.paddingLeft)-parseFloat(computed.paddingRight),availableHeight=viewport.clientHeight-parseFloat(computed.paddingTop)-parseFloat(computed.paddingBottom);
      var ratio = pageRatio;
      var width = Math.min(availableWidth * 0.94, availableHeight * 0.84 * ratio);
      var height = width / ratio;
      paper.style.width = Math.max(1, width) + 'px';
      paper.style.height = Math.max(1, height) + 'px';
    }

    function render() {
      var page = pages[index];
      paper.innerHTML = exportMarkup(page);
      var svg = paper.querySelector('svg');
      if (svg) {
        var viewBox=svg.viewBox.baseVal;pageRatio=viewBox.width/viewBox.height;
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('aria-hidden', 'true');
        svg.removeAttribute('width'); svg.removeAttribute('height');
        svg.style.width = '100%'; svg.style.height = '100%';
        svg.setAttribute('focusable', 'false');
      }
      heading.textContent = documentValue.name || '無題';
      status.textContent = (index + 1) + ' / ' + pages.length + '　' + (page.name || 'ページ');
      paper.setAttribute('aria-label', page.name || '現在のページ');
      previousButton.disabled = index === 0;
      nextButton.disabled = index === pages.length - 1;
      previousButton.setAttribute('aria-label', index === 0 ? '前のページはありません' : '前のページ');
      nextButton.setAttribute('aria-label', index === pages.length - 1 ? '次のページはありません' : '次のページ');
      fullscreenButton.textContent = fullscreen ? '全画面を終了' : '全画面';
      sizePaper();
    }

    function state() {
      return { open: !closed, pageId: pages[index].id, currentPage: index + 1, index: index, total: pages.length,
        documentId: documentValue.id, documentName: documentValue.name, pageName: pages[index].name, fullscreen: fullscreen };
    }

    function next() { if (index < pages.length - 1) { index += 1; render(); } return state(); }
    function previous() { if (index > 0) { index -= 1; render(); } return state(); }

    function restore() {
      if (previousActive && previousActive.isConnected && typeof previousActive.focus === 'function') {
        try { previousActive.focus({ preventScroll: true }); } catch (_) { previousActive.focus(); }
      }
    }

    function exitFullscreen() {
      if (ownsFullscreen&&doc.fullscreenElement===fullscreenTarget&&typeof doc.exitFullscreen === 'function') {
        exitingFullscreen=true;
        var result = doc.exitFullscreen();
        if (result && typeof result.catch === 'function') result.catch(function () {});
      }
    }

    function cleanup() {
      if (closed) return;
      closed = true; fullscreen = false;
      root.removeEventListener('resize', sizePaper);
      if (root.ResizeObserver && observer) observer.disconnect();
      doc.removeEventListener('fullscreenchange', onFullscreenChange);
      doc.body.style.overflow = bodyOverflow;
      if (dialog.parentNode) dialog.parentNode.removeChild(dialog);
      if (active && active._dialog === dialog) active = null;
      restore();
    }

    function close() {
      if (closed) return;
      exitFullscreen();
      if (typeof dialog.close === 'function' && dialog.open) dialog.close();
      cleanup();
    }

    function onFullscreenChange() {
      var nativeExit=ownsFullscreen&&!doc.fullscreenElement&&!exitingFullscreen;
      fullscreen = ownsFullscreen&&doc.fullscreenElement === fullscreenTarget;
      if(!doc.fullscreenElement)ownsFullscreen=false;
      exitingFullscreen=false;
      fullscreenButton.textContent = fullscreen ? '全画面を終了' : '全画面';
      if(nativeExit&&!closed)close();
    }

    function requestFullscreen() {
      if (doc.fullscreenElement) { if(ownsFullscreen)exitFullscreen();return; }
      if (!fullscreenTarget.requestFullscreen) return;
      var result;
      try { ownsFullscreen=true;result = fullscreenTarget.requestFullscreen(); } catch (_) { ownsFullscreen=false;return; }
      if(result&&typeof result.then==='function')result.then(function(){if(closed)exitFullscreen();else onFullscreenChange();}).catch(function(){ownsFullscreen=false;});
    }

    function onKeydown(event) {
      event.stopPropagation();
      if (event.key === 'Escape') { event.preventDefault(); close(); return; }
      if (event.key === 'Tab') {
        var list = focusables(); if (!list.length) return;
        var current = list.indexOf(doc.activeElement);
        if (current < 0) current = 0;
        var nextFocus = event.shiftKey ? current - 1 : current + 1;
        if (nextFocus < 0) nextFocus = list.length - 1;
        if (nextFocus >= list.length) nextFocus = 0;
        event.preventDefault(); list[nextFocus].focus(); return;
      }
      if ([' ','Enter'].includes(event.key)&&event.target?.closest('button')) return;
      if (event.key === 'ArrowRight' || event.key === ' ' || event.key === 'Enter' || event.key === 'PageDown') { event.preventDefault(); next(); }
      else if (event.key === 'ArrowLeft' || event.key === 'PageUp') { event.preventDefault(); previous(); }
      else if (event.key === 'Home') { event.preventDefault(); if (index !== 0) { index = 0; render(); } }
      else if (event.key === 'End') { event.preventDefault(); if (index !== pages.length - 1) { index = pages.length - 1; render(); } }
    }

    function onClick(event) {
      if(suppressClick){suppressClick=false;event.preventDefault();return;}
      if (event.target.closest && event.target.closest('button')) return;
      if (event.target === dialog || event.target === viewport || event.target === paper || event.target.closest && event.target.closest('svg')) next();
    }

    function onPointerDown(event) { if(event.button>0)return;suppressClick=false;pointerStart = { x: event.clientX, y: event.clientY,id:event.pointerId };if(event.isTrusted)viewport.setPointerCapture?.(event.pointerId); }
    function onPointerUp(event) {
      if (!pointerStart||pointerStart.id!==event.pointerId) return;
      var dx = event.clientX - pointerStart.x, dy = event.clientY - pointerStart.y; pointerStart = null;
      if (Math.abs(dx) < 36 || Math.abs(dx) < Math.abs(dy)) return;
      suppressClick=true;
      if (dx < 0) next(); else previous();
    }

    closeButton.addEventListener('click', close);
    previousButton.addEventListener('click', previous);
    nextButton.addEventListener('click', next);
    fullscreenButton.addEventListener('click', requestFullscreen);
    dialog.addEventListener('keydown', onKeydown);
    dialog.addEventListener('click', onClick);
    viewport.addEventListener('pointerdown', onPointerDown);
    viewport.addEventListener('pointerup', onPointerUp);
    viewport.addEventListener('pointercancel', function(){pointerStart=null;suppressClick=false;});
    dialog.addEventListener('cancel', function (event) { event.preventDefault(); close(); });
    dialog.addEventListener('close', cleanup, { once: true });
    doc.addEventListener('fullscreenchange', onFullscreenChange);
    root.addEventListener('resize', sizePaper);
    var observer = root.ResizeObserver ? new root.ResizeObserver(sizePaper) : null;
    if (observer) observer.observe(viewport);
    doc.body.style.overflow = 'hidden';
    render();
    if (typeof dialog.showModal === 'function') dialog.showModal();
    else { dialog.setAttribute('open', ''); dialog.classList.add('ilapo-present-open'); }
    sizePaper();
    active = { _dialog: dialog, next: next, previous: previous, close: close, getState: state };
    var initialFocus = closeButton;
    root.setTimeout(function () { if (!closed && initialFocus.isConnected) initialFocus.focus(); }, 0);
    return active;
  }

  return { open: open };
}));
