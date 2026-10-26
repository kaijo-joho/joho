/* Common viewing controls for highlighted HTML, CSS, and Python examples. */
(function () {
  'use strict';

  const SUPPORTED_LANGUAGES = new Set(['html', 'css', 'python']);
  const TOOLBAR_CLASS = 'code-example-tools';
  const DIALOG_ID = 'site-code-example-dialog';
  let activeExample = null;
  let activeMenu = null;
  let menuPointerDown = false;
  let menuSequence = 0;
  let positionFrame = 0;
  const resizeObserver = typeof ResizeObserver === 'function' ? new ResizeObserver(entries => {
    entries.forEach(({ target }) => {
      if (!target.isConnected) resizeObserver.unobserve(target);
      else positionControls(target);
    });
    if (activeMenu) positionMenu(activeMenu);
  }) : null;

  const getCode = pre => pre.querySelector('code') || pre;
  const notifyExpanded = (open, position) => document.dispatchEvent(new CustomEvent('joho:code-example-expanded', {
    detail: { open, scrollX: position.scrollX, scrollY: position.scrollY }
  }));

  function positionControls(pre) {
    const toolbar = pre._codeExampleToolbar;
    if (!pre.isConnected || !toolbar?.isConnected) return;
    const codeRect = pre.getBoundingClientRect();
    if (!codeRect.width) return;
    const anchorRect = toolbar.getBoundingClientRect();
    toolbar.style.setProperty('--code-menu-top', `${codeRect.top - anchorRect.top + 4}px`);
    toolbar.style.setProperty('--code-menu-right', `${anchorRect.right - codeRect.right + 4}px`);
  }

  function positionMenu(menu) {
    const width = document.documentElement.clientWidth;
    const height = window.innerHeight;
    menu.panel.style.maxHeight = `${Math.max(44, height - 16)}px`;
    const triggerRect = menu.trigger.getBoundingClientRect();
    const panelRect = menu.panel.getBoundingClientRect();
    const left = Math.max(8, Math.min(width - panelRect.width - 8, triggerRect.right - panelRect.width));
    const below = triggerRect.bottom + 4;
    const above = triggerRect.top - panelRect.height - 4;
    const top = below + panelRect.height <= height - 8 || above < 8 ? below : above;
    menu.panel.style.left = `${left}px`;
    menu.panel.style.top = `${Math.max(8, Math.min(height - panelRect.height - 8, top))}px`;
  }

  function schedulePositions() {
    if (positionFrame) return;
    positionFrame = requestAnimationFrame(() => {
      positionFrame = 0;
      document.querySelectorAll('pre[data-code-example-enhanced="true"]').forEach(positionControls);
      if (activeMenu) {
        const rect = activeMenu.trigger.getBoundingClientRect();
        if (rect.bottom < 0 || rect.top > innerHeight) closeMenu();
        else positionMenu(activeMenu);
      }
    });
  }

  function closeMenu({ restoreFocus = false } = {}) {
    if (!activeMenu) return;
    const menu = activeMenu;
    activeMenu = null;
    menuPointerDown = false;
    try {
      if (menu.panel.matches(':popover-open')) menu.panel.hidePopover();
    } catch (_) { /* 非対応ブラウザではhiddenと固定配置で開閉する。 */ }
    menu.panel.hidden = true;
    if (menu.panel.parentNode !== menu.toolbar) menu.toolbar.append(menu.panel);
    menu.trigger.setAttribute('aria-expanded', 'false');
    if (restoreFocus && menu.trigger.isConnected) menu.trigger.focus({ preventScroll: true });
  }

  function openMenu(pre, toolbar, { last = false } = {}) {
    closeMenu();
    // 既存dialog内では外側のdialogを閉じるoverlay通知を送らない。
    const enclosingDialog = pre.closest('dialog[open]');
    const panel = toolbar._codeExamplePanel;
    const trigger = toolbar.querySelector('[data-action="menu"]');
    const enlarge = panel.querySelector('[data-action="enlarge"]');
    enlarge.disabled = typeof HTMLDialogElement === 'undefined' || !HTMLDialogElement.prototype.showModal ||
      Boolean(enclosingDialog && activeExample?.pre !== pre);
    if (!enclosingDialog) document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: panel.id } }));
    activeMenu = { pre, toolbar, panel, trigger };
    panel.hidden = false;
    if (typeof panel.showPopover === 'function') {
      try { panel.showPopover(); }
      catch (_) { panel.removeAttribute('popover'); (enclosingDialog || document.body).append(panel); }
    } else {
      (enclosingDialog || document.body).append(panel);
    }
    trigger.setAttribute('aria-expanded', 'true');
    positionControls(pre);
    positionMenu(activeMenu);
    const buttons = panel.querySelectorAll('button:not(:disabled)');
    (last ? buttons[buttons.length - 1] : buttons[0])?.focus({ preventScroll: true });
  }

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
    const panel = pre._codeExampleToolbar?._codeExamplePanel;
    const scaleButton = panel?.querySelector('[data-action="reset"]');
    if (scaleButton) scaleButton.textContent = `${Math.round(state.scale * 100)}%`;
    const minusButton = panel?.querySelector('[data-action="decrease"]');
    const plusButton = panel?.querySelector('[data-action="increase"]');
    if (minusButton) minusButton.disabled = state.scale <= 0.5;
    if (plusButton) plusButton.disabled = state.scale >= 2;
    const wrapButton = panel?.querySelector('[data-action="wrap"]');
    if (wrapButton) {
      wrapButton.setAttribute('aria-pressed', String(state.wrap));
      wrapButton.textContent = state.wrap ? '折り返し ON' : '折り返し OFF';
    }
    positionControls(pre);
    if (activeMenu?.pre === pre) positionMenu(activeMenu);
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
    closeMenu();
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
        parent.insertBefore(current.toolbar, current.placeholder);
        parent.insertBefore(current.pre, current.placeholder);
        current.placeholder.remove();
      } else if (current.nextSibling?.parentNode === parent) {
        parent.insertBefore(current.toolbar, current.nextSibling);
        parent.insertBefore(current.pre, current.nextSibling);
      } else {
        parent.append(current.toolbar, current.pre);
      }
    } else {
      document.body.append(current.toolbar, current.pre);
    }
    document.documentElement.classList.remove('code-example-modal-open');
    current.enlargeButton.textContent = '拡大して読む';
    if (closeNative && dialog?.open) dialog.close();
    positionControls(current.pre);
    window.scrollTo(current.scrollX, current.scrollY);
    if (current.focusTarget?.isConnected) current.focusTarget.focus({ preventScroll: true });
    notifyExpanded(false, current);
  }

  function closeDialog() { restoreExample(); }

  function openDialog(pre, toolbar, focusTarget) {
    const dialog = ensureDialog();
    if (!dialog || typeof dialog.showModal !== 'function') return;
    closeMenu();
    if (activeExample) closeDialog();
    const parent = pre.parentNode;
    const placeholder = document.createElement('div');
    placeholder.className = 'code-example-placeholder';
    placeholder.setAttribute('aria-hidden', 'true');
    const nextSibling = pre.nextSibling;
    const code = getCode(pre);
    const scrollX = window.scrollX;
    const scrollY = window.scrollY;
    const computedPre = getComputedStyle(pre).userSelect;
    const computedCode = getComputedStyle(code).userSelect;
    // Leave the original footprint in the document so moving the nodes does not
    // shift the reading position through scroll anchoring or document clamping.
    placeholder.style.height = `${pre.getBoundingClientRect().height}px`;
    placeholder.style.marginTop = getComputedStyle(pre).marginTop;
    placeholder.style.marginBottom = getComputedStyle(pre).marginBottom;
    const userSelect = {
      pre: computedPre,
      preInline: pre.style.userSelect,
      code: computedCode,
      codeInline: code.style.userSelect
    };
    parent.insertBefore(placeholder, toolbar);
    const slot = dialog.querySelector('.code-example-dialog-content');
    slot.append(toolbar, pre);
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
    positionControls(pre);
    notifyExpanded(true, activeExample);
  }

  function buildToolbar(pre) {
    const toolbar = document.createElement('div');
    toolbar.className = TOOLBAR_CLASS;
    toolbar.setAttribute('role', 'group');
    toolbar.setAttribute('aria-label', 'コード例の表示操作');
    const trigger = makeButton('', 'menu', 'コードの表示設定');
    trigger.classList.add('code-example-menu-trigger');
    trigger.setAttribute('aria-label', 'コードの表示設定');
    trigger.setAttribute('aria-haspopup', 'dialog');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false"><path d="M5 7h14M5 12h14M5 17h14"/></svg>';
    const panel = document.createElement('div');
    panel.className = 'code-example-menu-panel';
    panel.id = `code-example-menu-${++menuSequence}`;
    panel.setAttribute('role', 'dialog');
    panel.setAttribute('aria-label', 'コードの表示設定');
    panel.hidden = true;
    if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
    trigger.setAttribute('aria-controls', panel.id);
    const label = document.createElement('div');
    label.className = 'code-example-menu-label';
    label.textContent = '文字サイズ';
    const sizeControls = document.createElement('div');
    sizeControls.className = 'code-example-menu-size';
    sizeControls.setAttribute('role', 'group');
    sizeControls.setAttribute('aria-label', 'このコードの文字サイズ');
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
    sizeControls.append(minus, reset, plus);
    panel.append(label, sizeControls, wrap, enlarge);
    toolbar.append(trigger, panel);
    toolbar._codeExamplePanel = panel;
    // pre+resultの隣接と、ハイライトの直下PRE走査を維持する。
    pre.insertAdjacentElement('beforebegin', toolbar);
    pre._codeExampleToolbar = toolbar;

    const initial = {
      scale: 1,
      wrap: Boolean(getState()?.codeWrap)
    };
    apply(pre, initial);
    trigger.addEventListener('click', () => {
      if (activeMenu?.toolbar === toolbar) closeMenu({ restoreFocus: true });
      else openMenu(pre, toolbar);
    });
    trigger.addEventListener('keydown', event => {
      if (!['ArrowDown', 'ArrowUp'].includes(event.key)) return;
      event.preventDefault();
      openMenu(pre, toolbar, { last: event.key === 'ArrowUp' });
    });
    panel.addEventListener('toggle', event => {
      if (event.newState === 'closed' && activeMenu?.panel === panel) closeMenu();
    });
    panel.addEventListener('click', event => {
      const button = event.target.closest('button[data-action]');
      if (!button || !panel.contains(button)) return;
      // WebKitではコピー禁止領域の操作時に一瞬mainへフォーカスが移る。
      // pointerdown中に部品を消さず、click後の操作対象へ明示的に戻す。
      button.focus({ preventScroll: true });
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
          else openDialog(pre, toolbar, trigger);
          break;
        case 'close': closeDialog(); break;
      }
    });
    resizeObserver?.observe(pre);
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
      if (code === pre) {
        // 旧形式のPREも同じスクロール領域に揃える。本文・トークンは移すだけで再生成しない。
        const content = document.createElement('code');
        content.append(...pre.childNodes);
        pre.append(content);
      }
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
    if (event.detail?.source !== activeMenu?.panel.id) closeMenu();
    if (event.detail?.source !== DIALOG_ID && activeExample) closeDialog();
  });

  document.addEventListener('pointerdown', event => {
    menuPointerDown = Boolean(activeMenu && (activeMenu.toolbar.contains(event.target) || activeMenu.panel.contains(event.target)));
    if (activeMenu && !menuPointerDown) closeMenu();
  });
  document.addEventListener('pointerup', () => { menuPointerDown = false; });
  document.addEventListener('pointercancel', () => { menuPointerDown = false; });
  document.addEventListener('focusin', event => {
    if (activeMenu && !menuPointerDown && !activeMenu.toolbar.contains(event.target) && !activeMenu.panel.contains(event.target)) closeMenu();
  });
  document.addEventListener('keydown', event => {
    if (event.key !== 'Escape' || !activeMenu) return;
    event.preventDefault();
    event.stopPropagation();
    closeMenu({ restoreFocus: true });
  });
  document.addEventListener('scroll', event => {
    if (activeMenu && event.target !== activeMenu.panel && !activeMenu.panel.contains(event.target)) {
      schedulePositions();
    }
  }, true);
  window.addEventListener('blur', () => closeMenu());
  window.addEventListener('resize', schedulePositions);
  document.fonts?.ready.then(schedulePositions);

  window.addEventListener('beforeprint', () => {
    closeMenu();
    if (activeExample) closeDialog();
  });

  window.siteCodeExamples = { enhance };
})();
