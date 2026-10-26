/* Common viewing controls for highlighted HTML, CSS, and Python examples. */
(function () {
  'use strict';

  const SUPPORTED_LANGUAGES = new Set(['html', 'css', 'python']);
  const TOOLBAR_CLASS = 'code-example-tools';
  const DIALOG_ID = 'site-code-example-dialog';
  let activeExample = null;

  const getCode = pre => pre.querySelector('code') || pre;
  const notifyExpanded = (open, position) => document.dispatchEvent(new CustomEvent('joho:code-example-expanded', {
    detail: { open, scrollX: position.scrollX, scrollY: position.scrollY }
  }));

  function getLanguage(pre, code) {
    const names = `${pre.className || ''} ${code.className || ''}`.toLowerCase();
    for (const language of SUPPORTED_LANGUAGES) {
      if (new RegExp(`(?:^|\\s)(?:language-)?${language}(?:\\s|$)`).test(names)) return language;
    }
    return '';
  }

  function getState() {
    try {
      return window.siteDisplaySettings?.getState?.() || null;
    } catch (_) {
      return null;
    }
  }

  function apply(pre, state) {
    if (!pre?.isConnected) return;
    if (state.scale === 1) pre.style.removeProperty('--code-example-scale');
    else pre.style.setProperty('--code-example-scale', String(state.scale));
    const settings = getState();
    pre.style.setProperty('--code-example-line-height', settings?.lineSpacing === 'relaxed' ? '2' : '1.7');
    pre.dataset.codeExampleWrap = String(state.wrap);
    pre.dataset.codeExampleScale = String(state.scale);
    const scaleButton = pre._codeExampleToolbar?.querySelector('[data-action="reset"]');
    if (scaleButton) scaleButton.textContent = `${Math.round(state.scale * 100)}%`;
    const minusButton = pre._codeExampleToolbar?.querySelector('[data-action="decrease"]');
    const plusButton = pre._codeExampleToolbar?.querySelector('[data-action="increase"]');
    if (minusButton) minusButton.disabled = state.scale <= 0.5;
    if (plusButton) plusButton.disabled = state.scale >= 2;
    const wrapButton = pre._codeExampleToolbar?.querySelector('[data-action="wrap"]');
    if (wrapButton) {
      wrapButton.setAttribute('aria-pressed', String(state.wrap));
      wrapButton.textContent = state.wrap ? '折り返し ON' : '折り返し OFF';
    }
  }

  function makeButton(label, action, title = label) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'code-example-button';
    button.dataset.action = action;
    button.textContent = label;
    button.title = title;
    if (action === 'wrap') button.setAttribute('aria-pressed', 'false');
    return button;
  }

  function ensureDialog() {
    let dialog = document.getElementById(DIALOG_ID);
    if (dialog || typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) return dialog;
    dialog = document.createElement('dialog');
    dialog.id = DIALOG_ID;
    dialog.className = 'code-example-dialog';
    dialog.setAttribute('aria-label', 'コード例を拡大して表示');
    const panel = document.createElement('div');
    panel.className = 'code-example-dialog-panel';
    const heading = document.createElement('div');
    heading.className = 'code-example-dialog-heading';
    heading.textContent = 'コード例';
    const close = makeButton('閉じる', 'close');
    close.classList.add('code-example-close');
    heading.append(close);
    const slot = document.createElement('div');
    slot.className = 'code-example-dialog-content';
    panel.append(heading, slot);
    dialog.append(panel);
    document.body.append(dialog);
    dialog.addEventListener('cancel', event => {
      event.preventDefault();
      closeDialog();
    });
    dialog.addEventListener('click', event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) closeDialog();
    });
    dialog.addEventListener('close', () => restoreExample({ closeNative: false }));
    close.addEventListener('click', closeDialog);
    return dialog;
  }

  function restoreExample({ closeNative = true } = {}) {
    if (!activeExample) return;
    const current = activeExample;
    activeExample = null;
    const dialog = document.getElementById(DIALOG_ID);
    current.pre.removeAttribute('data-code-example-dialog');
    current.toolbar.removeAttribute('data-code-example-dialog');
    current.pre.style.userSelect = current.userSelect.preInline;
    if (current.code !== current.pre) current.code.style.userSelect = current.userSelect.codeInline;
    const parent = current.parent;
    if (parent) {
      if (current.placeholder?.parentNode === parent) {
        parent.insertBefore(current.pre, current.placeholder);
        parent.insertBefore(current.toolbar, current.placeholder);
        current.placeholder.remove();
      } else if (current.nextSibling?.parentNode === parent) {
        parent.insertBefore(current.pre, current.nextSibling);
        parent.insertBefore(current.toolbar, current.nextSibling);
      } else {
        parent.append(current.pre, current.toolbar);
      }
    } else {
      document.body.append(current.pre, current.toolbar);
    }
    document.documentElement.classList.remove('code-example-modal-open');
    current.enlargeButton.textContent = '拡大して読む';
    if (closeNative && dialog?.open) dialog.close();
    window.scrollTo(current.scrollX, current.scrollY);
    if (current.focusTarget?.isConnected) current.focusTarget.focus({ preventScroll: true });
    notifyExpanded(false, current);
  }

  function closeDialog() { restoreExample(); }

  function openDialog(pre, toolbar, focusTarget) {
    const dialog = ensureDialog();
    if (!dialog || typeof dialog.showModal !== 'function') return;
    if (activeExample) closeDialog();
    const parent = pre.parentNode;
    const placeholder = document.createElement('div');
    placeholder.className = 'code-example-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    const nextSibling = toolbar.nextSibling;
    const code = getCode(pre);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const computedPre = getComputedStyle(pre).userSelect;
    const computedCode = getComputedStyle(code).userSelect;
    // Leave the original footprint in the document so moving the nodes does not
    // shift the reading position through scroll anchoring or document clamping.
    placeholder.style.height = `${toolbar.getBoundingClientRect().bottom - pre.getBoundingClientRect().top}px`;
    placeholder.style.marginTop = getComputedStyle(pre).marginTop;
    placeholder.style.marginBottom = getComputedStyle(toolbar).marginBottom;
    const userSelect = {
      pre: computedPre,
      preInline: pre.style.userSelect,
      code: computedCode,
      codeInline: code.style.userSelect
    };
    parent.insertBefore(placeholder, pre);
    const slot = dialog.querySelector('.code-example-dialog-content');
    slot.append(pre, toolbar);
    if (computedPre === 'none') pre.style.userSelect = 'none';
    if (computedCode === 'none') code.style.userSelect = 'none';
    pre.dataset.codeExampleDialog = 'true';
    toolbar.dataset.codeExampleDialog = 'true';
    const enlargeButton = toolbar.querySelector('[data-action="enlarge"]');
    enlargeButton.textContent = '元の表示へ戻す';
    activeExample = { pre, code, toolbar, parent, placeholder, nextSibling, focusTarget, enlargeButton, scrollX, scrollY, userSelect };
    document.documentElement.classList.add('code-example-modal-open');
    document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: DIALOG_ID } }));
    try {
      dialog.showModal();
    } catch (error) {
      restoreExample({ closeNative: false });
      console.warn('[code_examples] Could not open the code dialog:', error);
      return;
    }
    notifyExpanded(true, activeExample);
  }

  function buildToolbar(pre) {
    const toolbar = document.createElement('div');
    toolbar.className = TOOLBAR_CLASS;
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'コード例の表示操作');
    const minus = makeButton('−', 'decrease', 'このコード例を5%小さくする');
    minus.setAttribute('aria-label', 'このコード例を5%小さくする');
    const reset = makeButton('100%', 'reset', 'クリックして全体の文字サイズへ戻す');
    reset.setAttribute('aria-label', '全体の文字サイズへ戻す');
    const plus = makeButton('+', 'increase', 'このコード例を5%大きくする');
    plus.setAttribute('aria-label', 'このコード例を5%大きくする');
    const wrap = makeButton('折り返し OFF', 'wrap');
    const enlarge = makeButton('拡大して読む', 'enlarge');
    if (typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal) {
      enlarge.disabled = true;
      enlarge.title = 'このブラウザーでは拡大表示を利用できません';
      enlarge.setAttribute('aria-label', 'このブラウザーでは拡大表示を利用できません');
    }
    if (pre.closest('dialog[open]')) {
      enlarge.disabled = true;
      enlarge.title = '別のダイアログ内では拡大表示できません';
      enlarge.setAttribute('aria-label', '別のダイアログ内では拡大表示できません');
    }
    toolbar.append(minus, reset, plus, wrap, enlarge);
    pre.insertAdjacentElement('afterend', toolbar);
    pre._codeExampleToolbar = toolbar;

    const initial = {
      scale: 1,
      wrap: Boolean(getState()?.codeWrap)
    };
    apply(pre, initial);
    toolbar.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || !toolbar.contains(button)) return;
      const state = {
        scale: Number(pre.dataset.codeExampleScale) || 1,
        wrap: pre.dataset.codeExampleWrap === 'true'
      };
      switch (button.dataset.action) {
        case 'decrease': state.scale = Math.max(0.5, Math.round((state.scale - 0.05) * 100) / 100); apply(pre, state); break;
        case 'increase': state.scale = Math.min(2, Math.round((state.scale + 0.05) * 100) / 100); apply(pre, state); break;
        case 'reset': apply(pre, { scale: 1, wrap: state.wrap }); break;
        case 'wrap': apply(pre, { scale: state.scale, wrap: !state.wrap }); break;
        case 'enlarge':
          if (activeExample?.pre === pre) closeDialog();
          else openDialog(pre, toolbar, button);
          break;
        case 'close': closeDialog(); break;
      }
    });
    return toolbar;
  }

  function enhance(root = document) {
    if (!root?.querySelectorAll) return;
    const blocks = [];
    if (root.matches?.('pre')) blocks.push(root);
    blocks.push(...root.querySelectorAll('pre'));
    [...new Set(blocks)].forEach(pre => {
      if (pre.dataset.codeExampleEnhanced === 'true') return;
      const code = getCode(pre);
      if (!SUPPORTED_LANGUAGES.has(getLanguage(pre, code))) return;
      if (pre.dataset.syntaxHighlighted !== 'true') return;
      pre.dataset.codeExampleEnhanced = 'true';
      buildToolbar(pre);
    });
  }

  document.addEventListener('joho:display-settings-change', event => {
    const changed = event.detail?.changed;
    const changedValues = Array.isArray(changed) ? changed : Object.keys(changed || {});
    const state = getState();
    if (!state) return;
    const blocks = document.querySelectorAll('pre[data-code-example-enhanced="true"]');
    if (changedValues.some(value => ['textScale', 'codeWrap', 'codeWrapExplicit', 'reset'].includes(value))) {
      blocks.forEach(pre => apply(pre, { scale: 1, wrap: Boolean(state.codeWrap) }));
    } else if (changedValues.includes('lineSpacing')) {
      blocks.forEach(pre => pre.style.setProperty('--code-example-line-height', state.lineSpacing === 'relaxed' ? '2' : '1.7'));
    }
  });

  document.addEventListener('joho:overlay-open', event => {
    if (event.detail?.source !== DIALOG_ID && activeExample) closeDialog();
  });

  window.addEventListener('beforeprint', () => {
    if (activeExample) closeDialog();
  });

  window.siteCodeExamples = { enhance };
})();
