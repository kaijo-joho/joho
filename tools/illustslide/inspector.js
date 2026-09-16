/* illustSlide: 右側インスペクタ。編集内容の確定と一時プレビューを分けて扱う。 */
(function () {
  'use strict';

  const STORAGE_KEY = 'kaijo-ilapo:inspector';

  function create(options) {
    const settings = options || {};
    const byId = id => document.getElementById(id);
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
    const toggle = byId('inspector-toggle');
    const app = byId('app');
    const canvas = byId('canvas');
    const exportPanel = byId('export-panel');

    if (!panel || !form || !title || !body || !error || !submit || !resetButton || !closeButton || !canvasButton || !resizeButton || !tabs || !toggle || !app || !canvas) {
      throw new Error('インスペクタの必要な要素が見つかりません。');
    }

    let current = null;
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
        const raw = localStorage.getItem(STORAGE_KEY);
        const stored = raw === null ? NaN : Number(raw);
        if (Number.isFinite(stored)) return Math.round(Math.max(220, Math.min(520, stored)));
      } catch (_) {}
      return 320;
    }

    function persistWidth() {
      try { localStorage.setItem(STORAGE_KEY, String(width)); } catch (_) {}
    }

    function maxWidth() {
      if (panel.hidden) return 520;
      const stage = byId('stage');
      const panelBounds = panel.getBoundingClientRect();
      const stageBounds = stage?.getBoundingClientRect();
      const available = stageBounds ? panelBounds.right - stageBounds.left - 220 : 520;
      return Math.max(220, Math.min(520, Math.floor(available || 520)));
    }

    function setWidth(next, save) {
      width = Math.round(Math.max(220, Math.min(maxWidth(), Number(next) || 320)));
      panel.style.setProperty('--inspector-width', width + 'px');
      app.style.setProperty('--inspector-width', width + 'px');
      updateResizeValue();
      if (save) persistWidth();
      layout();
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
      if (exportPanel) exportPanel.hidden = true;
      document.querySelectorAll('.side-tab [data-action="export-toggle"]').forEach(button => button.setAttribute('aria-expanded', 'false'));
    }

    function updateTabs() {
      toggle.setAttribute('aria-expanded', String(Boolean(current)));
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
      if (element.id) return '#' + element.id;
      if (element.name) return '[name="' + CSS.escape(element.name) + '"]';
      const keyed = element.closest('[data-inspector-focus]');
      return keyed ? '[data-inspector-focus="' + CSS.escape(keyed.dataset.inspectorFocus) + '"]' : null;
    }

    function keepState() {
      const active = document.activeElement;
      const details = [...body.querySelectorAll('details')].map((element, index) => ({ index, open: element.open }));
      return {
        key: focusKey(active),
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
        if (snapshot.start !== null && typeof target.setSelectionRange === 'function') target.setSelectionRange(snapshot.start, snapshot.end);
      } else if (focusTitle) {
        title.focus({ preventScroll: true });
      }
    }

    function render(request, preserve, initialFocus) {
      const snapshot = preserve ? keepState() : null;
      current = request;
      title.textContent = request.title || '';
      body.innerHTML = request.html || '';
      clearError();
      const hasApply = request.label != null;
      submit.hidden = !hasApply;
      resetButton.hidden = !hasApply;
      submit.textContent = hasApply ? request.label : '';
      const footer = formFooter();
      if (footer) footer.hidden = !hasApply;
      panel.hidden = false;
      app.classList.add('inspector-open');
      if (!window.matchMedia('(max-width: 850px)').matches && width > maxWidth()) setWidth(width, false);
      else updateResizeValue();
      hideExport();
      updateTabs();
      layout();
      if (initialFocus) title.focus({ preventScroll: true });
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

    function queuePreview() {
      queueMicrotask(() => preview());
    }

    async function apply(event) {
      event.preventDefault();
      const request = current;
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
      syncPending = false;
      if (syncFrame) cancelAnimationFrame(syncFrame);
      syncFrame = 0;
      body.replaceChildren();
      clearError();
      panel.hidden = true;
      app.classList.remove('inspector-open');
      updateTabs();
      layout();
      if (returnFocus) {
        if (opener?.isConnected) opener.focus();
        else canvas.focus();
      }
    }

    function reset() {
      if (!current) return;
      clearPreview();
      rebuild('reset');
    }

    function startResize(event) {
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
    body.addEventListener('click', event => {
      if (event.target.closest('button:not(:disabled)')) queuePreview();
    });
    form.addEventListener('compositionstart', () => { composing = true; });
    form.addEventListener('compositionend', () => { composing = false; queuePreview(); });
    panel.addEventListener('pointerdown', event => event.stopPropagation());
    panel.addEventListener('keydown', event => {
      event.stopPropagation();
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
      if (!window.matchMedia('(max-width: 850px)').matches && width > maxWidth()) setWidth(width, false);
      else updateResizeValue();
    });
    document.addEventListener('click', event => {
      if (!current || !event.target.closest('.side-tab [data-action="export-toggle"], #export-panel [data-action="export-toggle"]')) return;
      close(false);
    }, true);

    return Object.freeze({
      show,
      close,
      sync,
      reset,
      get section() { return current?.section || null; },
      get isOpen() { return Boolean(current); },
      get root() { return panel; }
    });
  }

  window.IlapoInspector = Object.freeze({ create });
}());
