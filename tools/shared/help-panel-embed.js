// 共通の非モーダル小窓に、公開ヘルプを読み込むための追加部品。
(() => {
  'use strict';

  const protocol = 'joho-help-desk-embed-v1';
  const instances = new WeakMap();
  const loadTimeout = 10000;
  const textScales = { small: 90, standard: 100, large: 115 };
  const sprite = new URL('ui-icons.svg?v=20261113', document.currentScript.src).href;
  const icons = {
    reset: [['use', {href:sprite + '#restart'}]],
    about: [['circle', {cx:12, cy:12, r:9}], ['path', {d:'M12 11v6M12 7h.01'}]],
    independent: [['path', {d:'M14 3h7v7M21 3 10 14M10 3H3v18h18v-7'}]],
    edit: [['path', {d:'M4 17.5V20h2.5L18 8.5 15.5 6 4 17.5Z M14.5 7l2.5 2.5'}]],
    textSize: [['path', {d:'m2 17 5-11 5 11M4 13h6M15 12a3 3 0 0 1 6 0v5m0-3a3 3 0 1 0 0 2'}]]
  };

  function createIcon(drawing) {
    const namespace = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(namespace, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('aria-hidden', 'true');
    svg.setAttribute('focusable', 'false');
    for (const [tag, attributes] of drawing) {
      const part = document.createElementNS(namespace, tag);
      for (const [name, value] of Object.entries(attributes)) part.setAttribute(name, value);
      svg.append(part);
    }
    return svg;
  }

  function iconAction(node, label, drawing) {
    node.classList.add('tool-help-desk__action');
    node.setAttribute('aria-label', label);
    node.dataset.tip = label;
    node.replaceChildren(createIcon(drawing));
    return node;
  }

  function element(tag, text, attributes = {}) {
    const node = document.createElement(tag);
    if (text) node.textContent = text;
    for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
    return node;
  }

  function create({ appId, mode, appVersion, guideRevision, about, fallback, createConsultation, ...options }) {
    const { root, opener, title = '使い方' } = options;
    if (!root?.id || !opener || !about?.matches?.('*') || about.contains(root) ||
        (fallback && (!fallback.matches?.('*') || fallback.contains(root) ||
          about.contains(fallback) || fallback.contains(about)))) {
      throw new TypeError('ヘルプの小窓・起点・アプリ情報を指定してください。');
    }
    if (instances.has(root)) return instances.get(root);
    if (appId !== 'htmleditor' || mode !== 'practice' ||
        typeof appVersion !== 'string' || !/^[0-9][0-9A-Za-z._ -]{0,39}$/.test(appVersion) ||
        !Number.isInteger(guideRevision) || guideRevision < 1 || guideRevision > 999999999 ||
        !/^https?:$/.test(location.protocol)) {
      throw new RangeError('公開ヘルプの対象・版が登録されていません。');
    }
    if (!window.JohoToolHelpResizable?.create || root.querySelector(':scope > .tool-help__header')) {
      throw new Error('共通ヘルプを読み込み、初期化前の小窓を指定してください。');
    }

    const originalChildren = [...root.childNodes];
    const restore = [];
    function moveContent(node, destination) {
      const placeholder = document.createComment('help content');
      const wasHidden = node.hidden;
      node.before(placeholder);
      destination.append(node);
      node.hidden = false;
      restore.push(() => { node.hidden = wasHidden; placeholder.replaceWith(node); });
    }

    const topic = element('section', '', { 'data-help-topic': 'desk', 'data-help-title': '情報科ヘルプデスク' });
    const view = element('div', '', { class: 'tool-help-desk__view' });
    const banner = element('div', '', { class: 'tool-help-desk__notice' });
    const status = element('p', 'ヘルプを読み込んでいます…', { role: 'status', tabindex: '-1' });
    const retry = element('button', '再試行', { type: 'button', hidden: '' });
    const fallbackContent = element('div', '', { hidden: '' });
    if (fallback) moveContent(fallback, fallbackContent);
    banner.append(status, retry, fallbackContent);
    view.append(banner);

    const aboutView = element('section', '', {
      id: root.id + '-desk-about', class: 'tool-help-desk__about', hidden: '',
      tabindex: '-1', 'aria-label': 'このアプリについて'
    });
    const back = element('button', 'ヘルプに戻る', { type: 'button' });
    moveContent(about, aboutView);
    aboutView.append(back);
    topic.append(view, aboutView);

    const standalone = new URL('/help-desk/preview/', location.origin);
    standalone.searchParams.set('app', appId);
    const independent = iconAction(element('a', '', {
      href: standalone.href, target: '_blank', rel: 'noopener noreferrer'
    }), '新しいタブで開く', icons.independent);
    const aboutButton = iconAction(element('button', '', {
      type: 'button', 'aria-controls': aboutView.id, 'aria-expanded': 'false'
    }), 'このアプリについて', icons.about);
    const sizeLabel = 'ヘルプの文字サイズ';
    const sizeControl = element('label', '', { class: 'tool-help-desk__action tool-help-desk__size' });
    const sizeSelect = element('select', '', { 'aria-label': sizeLabel, 'data-tip': sizeLabel });
    const sizeKey = options.storageKey && options.storageKey + '.text-size';
    for (const [value, label] of [['small', '小'], ['standard', '標準'], ['large', '大']]) {
      sizeSelect.append(element('option', label, { value }));
    }
    sizeSelect.value = 'standard';
    try {
      const stored = sizeKey && localStorage.getItem(sizeKey);
      if (Object.hasOwn(textScales, stored)) sizeSelect.value = stored;
    } catch { /* 文字サイズを記憶できなくても、小窓は使える。 */ }
    sizeControl.append(createIcon(icons.textSize), sizeSelect);
    function headerActions({reset, returnButton}) {
      const group = element('div', '', {
        class: 'tool-help-desk__actions', role: 'group', 'aria-label': 'ヘルプの操作'
      });
      group.append(iconAction(reset, '位置を戻す', icons.reset), aboutButton, independent,
        iconAction(returnButton, '編集へ戻る', icons.edit), sizeControl);
      return group;
    }

    function restoreContent() {
      restore.forEach(putBack => putBack());
      root.replaceChildren(...originalChildren);
    }
    let shell;
    try {
      root.replaceChildren(topic);
      shell = window.JohoToolHelpResizable.create({...options, title: 'ヘルプ', headerActions, frameResize: true});
    } catch (error) {
      restoreContent();
      throw error;
    }
    root.classList.add('tool-help--desk');
    root.querySelector('.tool-help__topic-label').hidden = true;
    root.querySelector('.tool-help__content').tabIndex = -1;

    let frame, port, token, timer, focusFrame;
    root.dataset.helpDeskState = 'idle';
    const active = () => !root.hidden && root.dataset.minimized !== 'true' && !view.hidden;
    const consultation = createConsultation?.({ view, guideRevision, isActive: active, onClose: shell.close,
      onVisibility(open) {
        if (frame) frame.hidden = open || root.dataset.helpDeskState !== 'ready';
        banner.hidden = open || root.dataset.helpDeskState === 'ready';
        if (!open) focusTab('focus-consultation');
      }
    });
    function cancelPendingFocus() { cancelAnimationFrame(focusFrame); }
    function focusTab(type = 'focus-tab') {
      cancelPendingFocus();
      if (!active()) return;
      if (consultation?.isOpen) {
        consultation.focus();
        return;
      }
      if (port) {
        // アプリ情報から戻るとき、iframeを表示する更新を先に反映する。
        const currentPort = port;
        const origin = document.activeElement;
        focusFrame = requestAnimationFrame(() => {
          const focused = document.activeElement;
          if (!active() || consultation?.isOpen || port !== currentPort ||
              (focused !== origin && focused !== document.body && focused !== frame)) return;
          frame.focus({ preventScroll: true });
          currentPort.postMessage({ type });
        });
      } else {
        (retry.hidden ? status : retry).focus({ preventScroll: true });
      }
    }
    function syncAppearance() {
      const scale = textScales[sizeSelect.value];
      root.style.setProperty('--tool-help-text-scale', scale / 100);
      if (!port) return;
      const { theme } = document.documentElement.dataset;
      port.postMessage({
        type: 'appearance',
        theme: theme === 'light' || theme === 'dark' ? theme : 'auto',
        textScale: scale
      });
    }
    function discardFrame() {
      clearTimeout(timer);
      port?.close();
      frame?.remove();
      frame = port = token = null;
    }
    function showFailure(message) {
      const focused = document.activeElement === status || document.activeElement === frame;
      discardFrame();
      root.dataset.helpDeskState = 'failed';
      status.textContent = message;
      banner.hidden = Boolean(consultation?.isOpen);
      retry.hidden = false;
      fallbackContent.hidden = !fallback;
      if (active() && focused) retry.focus({ preventScroll: true });
    }
    function load() {
      discardFrame();
      root.dataset.helpDeskState = 'loading';
      status.textContent = 'ヘルプを読み込んでいます…';
      banner.hidden = Boolean(consultation?.isOpen);
      retry.hidden = fallbackContent.hidden = true;
      try {
        token = Array.from(crypto.getRandomValues(new Uint8Array(16)),
          byte => byte.toString(16).padStart(2, '0')).join('');
        const url = new URL('/help-desk/preview/embed.html', location.origin);
        url.search = new URLSearchParams({ app: appId, mode, appVersion, guideRevision });
        url.hash = token;
        const nextFrame = element('iframe', '', {
          class: 'tool-help-desk__frame', title: title + '（情報科ヘルプデスク）', hidden: '',
          sandbox: 'allow-scripts allow-popups allow-popups-to-escape-sandbox',
          referrerpolicy: 'no-referrer', src: url.href
        });
        let loaded = false;
        nextFrame.addEventListener('load', () => {
          if (frame !== nextFrame) return;
          if (loaded && root.dataset.helpDeskState === 'ready') {
            showFailure('ヘルプの表示が切り替わりました。再試行するか、上の「新しいタブで開く」を押してください。');
          }
          loaded = true;
        });
        frame = nextFrame;
        view.prepend(frame);
        timer = setTimeout(() => {
          showFailure('ヘルプを読み込めませんでした。再試行するか、上の「新しいタブで開く」を押してください。');
        }, loadTimeout);
      } catch {
        showFailure('ヘルプを読み込めませんでした。上の「新しいタブで開く」を押してください。');
      }
    }

    function acceptReady(event) {
      if (root.dataset.helpDeskState !== 'loading' || event.origin !== 'null' ||
          !frame || event.source !== frame.contentWindow) return;
      const message = event.data;
      if (message?.type !== protocol || message.token !== token || message.appId !== appId ||
          message.mode !== mode || message.appVersion !== appVersion || message.guideRevision !== guideRevision) return;
      if (message.state === 'unavailable' && event.ports.length === 0) {
        showFailure('このアプリの版に対応するヘルプを表示できません。上の「新しいタブで開く」を押してください。');
        return;
      }
      if (message.state !== 'ready' || event.ports.length !== 1) return;
      clearTimeout(timer);
      port = event.ports[0];
      port.onmessage = ({ data }) => {
        if (!active() || consultation?.isOpen || document.activeElement !== frame) return;
        if (data?.type === 'close') shell.close();
        else if (data?.type === 'open-consultation') consultation?.open(data.url);
      };
      const wasWaiting = document.activeElement === status;
      root.dataset.helpDeskState = 'ready';
      frame.hidden = Boolean(consultation?.isOpen);
      banner.hidden = true;
      if (consultation) port.postMessage({ type: 'consultation-available' });
      syncAppearance();
      if (wasWaiting) focusTab();
    }

    function onOpen() {
      if (root.hidden || root.dataset.minimized === 'true') return;
      if (!aboutView.hidden) {
        aboutView.focus({ preventScroll: true });
        return;
      }
      if (root.dataset.helpDeskState === 'idle') load();
      focusTab();
    }
    function showAbout() {
      if (!aboutView.hidden) { returnToHelp(); return; }
      aboutButton.setAttribute('aria-expanded', 'true');
      view.hidden = true;
      aboutView.hidden = false;
      aboutView.focus({ preventScroll: true });
    }
    function returnToHelp() {
      aboutButton.setAttribute('aria-expanded', 'false');
      aboutView.hidden = true;
      view.hidden = false;
      focusTab();
    }
    function retryLoad() { load(); focusTab(); }
    sizeSelect.addEventListener('change', () => {
      syncAppearance();
      try { if (sizeKey) localStorage.setItem(sizeKey, sizeSelect.value); }
      catch { /* 今回の文字サイズはそのまま使える。 */ }
    });
    syncAppearance();

    const appearance = new MutationObserver(syncAppearance);
    appearance.observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });
    window.addEventListener('message', acceptReady);
    opener.addEventListener('click', onOpen);
    root.addEventListener('pointerdown', cancelPendingFocus, true);
    aboutButton.addEventListener('click', showAbout);
    back.addEventListener('click', returnToHelp);
    retry.addEventListener('click', retryLoad);

    const api = Object.freeze({
      root, close: shell.close, refresh: shell.refresh,
      open() { shell.open(); onOpen(); },
      get status() { return root.dataset.helpDeskState; },
      get interacting() { return shell.interacting; },
      destroy() {
        if (!instances.has(root)) return;
        instances.delete(root);
        appearance.disconnect();
        window.removeEventListener('message', acceptReady);
        opener.removeEventListener('click', onOpen);
        root.removeEventListener('pointerdown', cancelPendingFocus, true);
        cancelPendingFocus();
        consultation?.destroy();
        discardFrame();
        shell.destroy();
        root.classList.remove('tool-help--desk');
        root.style.removeProperty('--tool-help-text-scale');
        delete root.dataset.helpDeskState;
        restoreContent();
      }
    });
    instances.set(root, api);
    return api;
  }
  window.JohoToolHelpDesk = Object.freeze({ create });
})();
