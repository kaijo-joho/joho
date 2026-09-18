/* illustSlide: 右側インスペクタ。入力の即時反映と、実行操作のプレビューを扱う。 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kaijo-ilapo:inspector';

  function create(options) {
    const settings = options || {};
    const byId = id => document.getElementById(settings.prefix && id.startsWith('inspector-') ? settings.prefix + id : id);
    const storageKey = settings.prefix ? STORAGE_KEY + ':' + settings.prefix : STORAGE_KEY;
    const panel = byId('inspector-panel');
    const form = byId('inspector-form');
    const title = byId('inspector-title');
    const body = byId('inspector-body');
    const error = byId('inspector-error');
    const submit = byId('inspector-submit');
    const resetButton = byId('inspector-reset');
    const closeButton = byId('inspector-close');
    const canvasButton = byId('inspector-canvas');
    const resizeButton = byId('inspector-resize');
    const tabs = byId('inspector-tabs');
    const app = byId('app');
    const canvas = byId('canvas');
    const exportPanel = byId('export-panel');

    if (!panel || !form || !title || !body || !error || !submit || !resetButton || !closeButton || !canvasButton || !resizeButton || !tabs || !app || !canvas) {
      throw new Error('インスペクタの必要な要素が見つかりません。');
    }

    let current = null;
    let inputGroup = null, groupTarget = null, applyingGroup = null, pendingAuto = null, autoQueued = false;
    let opener = null;
    let composing = false;
    let refreshPromise = null;
    let syncPending = false;
    let syncFrame = 0;
    let resize = null;
    let keyboardResizeOrigin = null;
    let width = loadWidth();

    panel.style.setProperty('--inspector-width', width + 'px');
    app.style.setProperty('--inspector-width', width + 'px');
    resizeButton.setAttribute('role', 'separator');
    resizeButton.setAttribute('tabindex', '0');
    resizeButton.setAttribute('aria-orientation', 'vertical');
    updateResizeValue();

    function loadWidth() {
      try {
        const raw = localStorage.getItem(storageKey);
        const stored = raw === null ? NaN : Number(raw);
        if (Number.isFinite(stored)) return Math.round(Math.max(220, Math.min(520, stored)));
      } catch (_) {}
      return 320;
    }

    function persistWidth() {
      try { localStorage.setItem(storageKey, String(width)); } catch (_) {}
    }

    function maxWidth() {
      if (settings.maxWidth) return settings.maxWidth();
      if (panel.hidden) return 520;
      const stage = byId('stage');
      const panelBounds = panel.getBoundingClientRect();
      const stageBounds = stage?.getBoundingClientRect();
      const available = stageBounds ? panelBounds.right - stageBounds.left - 220 : 520;
      return Math.max(220, Math.min(520, Math.floor(available || 520)));
    }

    function setWidth(next, save) {
      width = Math.round(Math.max(220, Math.min(maxWidth(), Number(next) || 320)));
      reflow();
      updateResizeValue();
      if (save) persistWidth();
      layout();
    }

    function reflow() {
      panel.style.setProperty('--inspector-width', Math.min(width, maxWidth()) + 'px');
      if (!settings.managed) app.style.setProperty('--inspector-width', width + 'px');
      updateResizeValue();
    }

    function updateResizeValue() {
      const max = maxWidth();
      resizeButton.setAttribute('aria-valuemin', '220');
      resizeButton.setAttribute('aria-valuemax', String(max));
      resizeButton.setAttribute('aria-valuenow', String(Math.min(width, max)));
      resizeButton.setAttribute('aria-valuetext', Math.min(width, max) + ' px');
    }

    function layout() {
      try { settings.onLayout?.(); } catch (exception) { console.warn('Inspector layout unavailable', exception); }
    }

    function clearPreview() {
      try { return settings.clearPreview?.(); } catch (exception) { console.warn('Inspector preview could not be cleared', exception); return undefined; }
    }

    function busy() {
      try { return Boolean(settings.isBusy?.()); } catch (_) { return false; }
    }

    function scopeOf(request) {
      try { return request?.scope ? String(request.scope()) : ''; } catch (_) { return '__scope_error__'; }
    }

    function setError(exception) {
      const message = exception?.message || String(exception || '設定を更新できませんでした。');
      error.textContent = message;
      error.hidden = false;
    }

    function clearError() {
      error.textContent = '';
      error.hidden = true;
    }

    function hideExport() {
      if (settings.managed) return;
      if (exportPanel) exportPanel.hidden = true;
      document.querySelectorAll('.side-tab [data-action="export-toggle"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    function updateTabs() {
      if (settings.managed) return;
      for (const section of ['pages', 'objects', 'assets', 'board', 'view', 'animation']) {
        byId(section + '-toggle')?.setAttribute('aria-expanded', String(Boolean(current && current.section === section)));
      }
      tabs.querySelectorAll('button').forEach(button => {
        const selected = Boolean(current && button.dataset.inspectorSection === current.section);
        button.classList.toggle('on', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function formFooter() {
      return submit.closest('footer');
    }

    function isSameRequest(request) {
      return Boolean(current && request && current.token === request.token);
    }

    function focusKey(element) {
      if (!element || !body.contains(element)) return null;
      if (element.id) return '#' + CSS.escape(element.id);
      if (element.name) return '[name="' + CSS.escape(element.name) + '"]';
      const keyed = element.closest('[data-inspector-focus]');
      return keyed ? '[data-inspector-focus="' + CSS.escape(keyed.dataset.inspectorFocus) + '"]' : null;
    }

    function keepState() {
      const active = document.activeElement;
      const details = [...body.querySelectorAll('details')].map((element, index) => ({ index, open: element.open }));
      return {
        key: focusKey(active),
        hadFocus: panel.contains(active),
        start: typeof active?.selectionStart === 'number' ? active.selectionStart : null,
        end: typeof active?.selectionEnd === 'number' ? active.selectionEnd : null,
        scrollTop: body.scrollTop,
        details
      };
    }

    function restoreState(snapshot, focusTitle) {
      if (!snapshot) return;
      body.scrollTop = snapshot.scrollTop;
      snapshot.details.forEach(item => {
        const detail = body.querySelectorAll('details')[item.index];
        if (detail) detail.open = item.open;
      });
      const target = snapshot.key && body.querySelector(snapshot.key);
      if (target && document.activeElement !== target) {
        target.focus({ preventScroll: true });
        if (snapshot.start !== null && typeof target.setSelectionRange === 'function') { try { target.setSelectionRange(snapshot.start, snapshot.end); } catch (_) {} }
      } else if (focusTitle && snapshot.hadFocus) {
        title.focus({ preventScroll: true });
      }
    }

    function render(request, preserve, initialFocus) {
      const snapshot = preserve ? keepState() : null;
      current = request;
      title.textContent = request.title || '';
      body.innerHTML = request.html || '';
      clearError();
      const hasApply = request.label != null && !request.auto;
      const liveNote = byId('inspector-live-note');
      if (liveNote) {
        liveNote.hidden = !request.auto;
        liveNote.textContent = request.section === 'view' ? '変更はすぐに反映・保存されます' : '変更はすぐ反映 · ⌘Zで元に戻す';
      }
      submit.hidden = !hasApply;
      resetButton.hidden = !hasApply;
      submit.textContent = hasApply ? request.label : '';
      const footer = formFooter();
      if (footer) footer.hidden = !hasApply && !request.auto;
      panel.hidden = false;
      if (!settings.managed) app.classList.add('inspector-open');
      reflow();
      hideExport();
      updateTabs();
      layout();
      if (initialFocus && !settings.background?.()) title.focus({ preventScroll: true });
      else restoreState(snapshot, false);
    }

    function show(request) {
      if (!request || typeof request !== 'object') throw new Error('インスペクタの設定が不正です。');
      const normalized = {
        section: request.section || '',
        title: request.title || '',
        html: request.html || '',
        label: request.label,
        apply: request.apply,
        auto: Boolean(request.auto && request.apply),
        preview: request.preview,
        scope: request.scope,
        refresh: request.refresh,
        opener: request.opener,
        token: Symbol('inspector'),
        signature: scopeOf(request)
      };
      const wasOpen = Boolean(current);
      const requestedOpener = request.opener instanceof HTMLElement ? request.opener : document.activeElement;
      if (requestedOpener instanceof HTMLElement && requestedOpener.isConnected && !panel.contains(requestedOpener)) opener = requestedOpener;
      inputGroup = groupTarget = pendingAuto = null;
      composing = false;
      render(normalized, wasOpen, !wasOpen);
    }

    async function rebuild(reason) {
      if (!current || refreshPromise) return refreshPromise;
      const request = current;
      const preserve = reason !== 'reset';
      clearPreview();
      const pending = Promise.resolve().then(async () => {
        if (!isSameRequest(request)) return;
        try {
          const result = request.refresh?.();
          const resolved = result && typeof result.then === 'function' ? await result : result;
          if (!isSameRequest(request)) return;
          if (resolved && typeof resolved === 'object' && ('html' in resolved || 'title' in resolved)) {
            show({ ...request, ...resolved, opener });
          } else if (!request.refresh) {
            render({ ...request, token: Symbol('inspector'), signature: scopeOf(request) }, preserve, false);
          }
        } catch (exception) {
          if (isSameRequest(request)) setError(exception);
        }
      });
      refreshPromise = pending;
      pending.finally(() => {
        if (refreshPromise === pending) refreshPromise = null;
      });
      return pending;
    }

    function scheduleSync() {
      if (!syncPending || syncFrame) return;
      syncFrame = requestAnimationFrame(() => {
        syncFrame = 0;
        sync();
      });
    }

    function sync() {
      if (!current) return;
      if (busy()) {
        syncPending = true;
        scheduleSync();
        return;
      }
      syncPending = false;
      if (scopeOf(current) !== current.signature) rebuild('scope');
    }

    function checkScope(request) {
      if (!isSameRequest(request)) return false;
      if (scopeOf(request) === request.signature) return true;
      rebuild('scope');
      return false;
    }

    function valid(report = false) {
      if (form.checkValidity()) return true;
      clearPreview();
      if (report) form.reportValidity?.();
      return false;
    }

    function preview() {
      const request = current;
      if (!request || !request.preview || composing || busy() || !valid() || !checkScope(request)) return;
      try {
        const result = request.preview();
        clearError();
        if (result?.catch) result.catch(exception => {
          if (isSameRequest(request)) {
            clearPreview();
            setError(exception);
          }
        });
      } catch (exception) {
        if (isSameRequest(request)) {
          clearPreview();
          setError(exception);
        }
      }
    }

    function queuePreview(event) {
      const request = current;
      if (!request) return;
      if (!request.auto) { queueMicrotask(() => { if (isSameRequest(request)) preview(); }); return; }
      if (composing || body.querySelector('[data-rich-composing="true"]') || event?.isComposing) return;
      const target = event?.target || document.activeElement;
      const discrete = event?.type === 'click' || target?.matches('select,input[type=checkbox],input[type=radio]');
      if (!inputGroup || groupTarget !== target || discrete) { inputGroup = Symbol('inspector-input'); groupTarget = target; }
      pendingAuto = { request, group: inputGroup, event };
      if (autoQueued) return;
      autoQueued = true;
      queueMicrotask(() => {
        autoQueued = false;
        const pending = pendingAuto; pendingAuto = null;
        if (!pending || !isSameRequest(pending.request) || composing || body.querySelector('[data-rich-composing="true"]') || busy() || !valid() || !checkScope(pending.request)) return;
        clearError(); clearPreview(); applyingGroup = pending.group;
        try {
          pending.request.apply(pending.event);
          // 自分の変更によるrevision更新でフォームを作り直さない。入力位置とIMEを保つ。
          if (isSameRequest(pending.request)) pending.request.signature = scopeOf(pending.request);
        } catch (exception) { if (isSameRequest(pending.request)) setError(exception); }
        finally { applyingGroup = null; }
      });
    }

    async function apply(event) {
      event.preventDefault();
      const request = current;
      if (request?.auto) { queuePreview(event); return; }
      if (!request || !request.apply || !valid(true) || !checkScope(request)) return;
      clearError();
      clearPreview();
      try {
        const result = request.apply();
        if (result?.then) await result;
        if (isSameRequest(request)) await rebuild('apply');
      } catch (exception) {
        if (isSameRequest(request)) setError(exception);
      }
    }

    function close(options = true) {
      const returnFocus = typeof options === 'object' ? options.focus !== false : options !== false;
      if (!current && panel.hidden) return;
      clearPreview();
      current = null;
      inputGroup = groupTarget = pendingAuto = null;
      composing = false;
      syncPending = false;
      if (syncFrame) cancelAnimationFrame(syncFrame);
      syncFrame = 0;
      body.replaceChildren();
      clearError();
      panel.hidden = true;
      if (!settings.managed) app.classList.remove('inspector-open');
      updateTabs();
      layout();
      if (returnFocus) {
        if (opener?.isConnected && opener.getClientRects().length && !opener.closest('[inert]')) opener.focus();
        else canvas.focus();
      }
    }

    function reset() {
      if (!current) return;
      clearPreview();
      rebuild('reset');
    }

    function startResize(event) {
      if (settings.beforeResize) settings.beforeResize();
      if (window.matchMedia('(max-width: 850px)').matches || event.button !== 0) return;
      event.preventDefault();
      resize = { pointerId: event.pointerId, original: width };
      resizeButton.setPointerCapture?.(event.pointerId);
      document.documentElement.classList.add('inspector-resizing');
    }

    function moveResize(event) {
      if (!resize || event.pointerId !== resize.pointerId) return;
      const bounds = panel.getBoundingClientRect();
      setWidth(bounds.right - event.clientX, false);
    }

    function finishResize(event, cancelled) {
      if (!resize || (event?.pointerId != null && event.pointerId !== resize.pointerId)) return;
      if (cancelled) setWidth(resize.original, false);
      else persistWidth();
      resizeButton.releasePointerCapture?.(resize.pointerId);
      resize = null;
      document.documentElement.classList.remove('inspector-resizing');
    }

    form.addEventListener('submit', apply);
    form.addEventListener('input', queuePreview);
    form.addEventListener('change', queuePreview);
    form.addEventListener('pointerdown', event => {
      // Each slider drag is one undo step, even when the same slider keeps focus.
      if (event.target.matches('input[type=range]')) inputGroup = groupTarget = null;
    });
    body.addEventListener('click', event => {
      if (event.target.closest('button:not(:disabled)')) queuePreview(event);
    });
    form.addEventListener('compositionstart', () => { composing = true; });
    form.addEventListener('compositionend', event => { composing = false; queuePreview(event); });
    form.addEventListener('focusout', () => { inputGroup = groupTarget = null; });
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
      if (event.defaultPrevented) return;
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'z' && !composing && !event.isComposing && (current?.auto || !event.target.closest('input,textarea,select,[contenteditable=true]'))) {
        event.preventDefault(); inputGroup = groupTarget = pendingAuto = null; settings.onHistory?.(event.shiftKey); return;
      }
      if (event.key === 'Escape') {
        if (composing || event.isComposing) return;
        if (resize) {
          event.preventDefault();
          finishResize(null, true);
          return;
        }
        if (keyboardResizeOrigin !== null && event.target === resizeButton) {
          event.preventDefault();
          setWidth(keyboardResizeOrigin, true);
          keyboardResizeOrigin = null;
          return;
        }
        event.preventDefault();
        close(true);
      }
    });
    closeButton.addEventListener('click', () => close(true));
    canvasButton.addEventListener('click', () => canvas.focus());
    resetButton.addEventListener('click', reset);
    resizeButton.addEventListener('pointerdown', startResize);
    resizeButton.addEventListener('pointermove', moveResize);
    resizeButton.addEventListener('pointerup', event => finishResize(event, false));
    resizeButton.addEventListener('pointercancel', event => finishResize(event, true));
    resizeButton.addEventListener('lostpointercapture', event => finishResize(event, true));
    resizeButton.addEventListener('keydown', event => {
      if (window.matchMedia('(max-width: 850px)').matches) return;
      const key = event.key;
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(key)) return;
      event.preventDefault();
      if (keyboardResizeOrigin === null) keyboardResizeOrigin = width;
      if (key === 'Home') setWidth(220, true);
      else if (key === 'End') setWidth(maxWidth(), true);
      else setWidth(width + (key === 'ArrowLeft' ? 20 : -20), true);
    });
    resizeButton.addEventListener('blur', () => { keyboardResizeOrigin = null; });
    window.addEventListener('blur', () => { if (resize) finishResize(null, true); });
    window.addEventListener('resize', () => {
      reflow();
    });
    document.addEventListener('click', event => {
      if (settings.managed || !current || !event.target.closest('.side-tab [data-action="export-toggle"], #export-panel [data-action="export-toggle"]')) return;
      close(false);
    }, true);

    return Object.freeze({
      show,
      close,
      sync,
      reset,
      reflow,
      element: byId,
      get request() { return current; },
      get width() { return width; },
      get changeGroup() { return applyingGroup; },
      get section() { return current?.section || null; },
      get isOpen() { return Boolean(current); },
      get root() { return panel; }
    });
  }

  window.IlapoInspector = Object.freeze({ create });
}());
