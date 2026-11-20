/* 学校用相談フォームをHTML実習のトップ画面で表示する。フォームの入力には触れない。 */
(function (root) {
  'use strict';

  const parentOrigin = 'https://joho.kaijo.ed.jp';
  // ヘルプデスクの handoff.mjs と同じ配備先と採用版を、親でも照合する。
  const endpoint = new URL('https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxWsiA-fXfrKWXop1mX0m6uzjNcZXHIDIY7Xt52m8M83LgWD-S3ys770ApNtxTx6jL0/exec');
  const release = '30fb542db4f917dba7c59b6aa95e00f6f9d76203d4191cc312f4e266345bdf6a';
  const guideIds = new Set(['start','account','renew','folder','get','open','edit','save','restore',
    'display','preview','hints','first-practice','submit','receipt'].map(id => 'htmleditor:op-' + id));
  const channel = 'joho-help-desk-consultation-v1';
  const incoming = new Set(['hello', 'ready', 'unavailable']);
  const loadTimeout = 20000;

  function validatedUrl(value, guideRevision) {
    if (typeof value !== 'string' || value.length > 512) return null;
    let url;
    try { url = new URL(value); } catch { return null; }
    if (url.origin !== endpoint.origin || url.pathname !== endpoint.pathname || url.username ||
        url.password || url.hash || url.searchParams.get('app') !== 'htmleditor') return null;
    const keys = [...url.searchParams.keys()];
    const canonical = new URL(endpoint);
    canonical.searchParams.set('app', 'htmleditor');
    if (keys.length === 1) return canonical;
    if (keys.length !== 4 || !guideIds.has(url.searchParams.get('guideId')) ||
        url.searchParams.get('guideRevision') !== String(guideRevision) ||
        url.searchParams.get('release') !== release) return null;
    for (const key of ['guideId','guideRevision','release']) canonical.searchParams.set(key, url.searchParams.get(key));
    return canonical;
  }

  function create({ view, guideRevision, isActive, onVisibility }) {
    const { gasOrigin, withinFrame } = root.HtmlEditorDownload || {};
    if (root.location.origin !== parentOrigin || root !== root.top ||
        !['/tools/htmleditor/', '/tools/htmleditor/index.html'].includes(root.location.pathname) ||
        !gasOrigin || !withinFrame) return null;
    const doc = view.ownerDocument;
    function node(tag, text, className = '') {
      const element = doc.createElement(tag);
      element.textContent = text;
      element.className = className;
      if (tag === 'button') element.type = 'button';
      if (tag === 'a') {
        element.target = '_blank';
        element.rel = 'noopener noreferrer';
      }
      return element;
    }
    const controls = node('div', '', 'tool-help-consultation__controls');
    const mainActions = node('div', '', 'tool-help-consultation__actions');
    const back = node('button', 'ヘルプに戻る');
    const standalone = node('a', '別タブで相談する');
    mainActions.append(back, standalone);
    const status = node('p', '', 'tool-help-consultation__status');
    status.setAttribute('role', 'status');
    status.tabIndex = -1;
    const spinner = node('span', '', 'download-spinner');
    spinner.setAttribute('aria-hidden', 'true');
    const label = node('span', '');
    status.append(spinner, label);
    const recovery = node('div', '', 'tool-help-consultation__actions');
    const signIn = node('a', '別タブで学校アカウントを確認する');
    signIn.href = 'https://accounts.google.com/';
    const retry = node('button', '小窓で再試行');
    recovery.append(signIn, retry);
    controls.append(mainActions, status, recovery);
    controls.hidden = true;
    view.append(controls);

    let url, frame, stopListening = () => {};
    function show(state, message = '') {
      controls.dataset.state = state;
      status.hidden = state === 'ready';
      spinner.hidden = state !== 'loading';
      recovery.hidden = state !== 'unavailable';
      label.textContent = message;
      if (frame) frame.hidden = state !== 'ready' || controls.hidden;
    }
    function focus() {
      if (controls.hidden || !isActive()) return;
      const target = controls.dataset.state === 'ready' ? frame : recovery.hidden ? status : retry;
      target?.focus({ preventScroll: true });
    }
    function discardFrame() {
      stopListening();
      frame?.remove();
      frame = null;
    }
    function start() {
      discardFrame();
      show('loading', '相談フォームを読み込んでいます…');
      let bridge;
      try {
        bridge = Array.from(root.crypto.getRandomValues(new Uint8Array(16)), byte => byte.toString(16).padStart(2, '0')).join('');
      } catch {
        show('unavailable', '相談フォームへの接続を準備できません。別タブで相談するか、小窓で再試行してください。');
        focus();
        return;
      }
      const frameUrl = new URL(url);
      frameUrl.searchParams.set('embed', 'help-desk');
      frameUrl.searchParams.set('bridge', bridge);
      frameUrl.searchParams.set('parent', 'site');
      const nextFrame = node('iframe', '', 'tool-help-consultation__frame');
      nextFrame.title = '学校用の相談フォーム';
      nextFrame.setAttribute('sandbox', 'allow-scripts allow-same-origin allow-forms');
      nextFrame.referrerPolicy = 'no-referrer';
      nextFrame.hidden = true;
      frame = nextFrame;
      let source, sourceOrigin;
      function finish(state, message) {
        const waiting = doc.activeElement === status;
        if (state === 'ready') stopListening();
        else discardFrame();
        show(state, message);
        if (waiting) focus();
      }
      function receive(event) {
        const data = event.data;
        if (frame !== nextFrame || !frame.isConnected || !frame.contentWindow ||
            !data || data.channel !== channel || data.bridge !== bridge || !incoming.has(data.type) ||
            Object.keys(data).length !== 3 || !gasOrigin(event.origin) ||
            !withinFrame(event.source, frame.contentWindow)) return;
        if (source && (event.source !== source || event.origin !== sourceOrigin)) return;
        if (data.type === 'hello') {
          source = event.source;
          sourceOrigin = event.origin;
          source.postMessage({ channel, type: 'connect', bridge }, sourceOrigin);
        } else if (source && data.type === 'ready') {
          finish('ready');
        } else if (source) {
          finish('unavailable', '相談フォームを表示できません。別タブで学校アカウントを確認し、小窓で再試行してください。');
        }
      }
      root.addEventListener('message', receive);
      const timer = root.setTimeout(() => finish('unavailable',
        '相談フォームの表示を確認できませんでした。別タブで学校アカウントを確認し、小窓で再試行してください。'), loadTimeout);
      stopListening = () => { root.clearTimeout(timer); root.removeEventListener('message', receive); };
      nextFrame.src = frameUrl.href;
      view.append(nextFrame);
      focus();
    }

    back.addEventListener('click', () => {
      controls.hidden = true;
      if (frame) frame.hidden = true;
      delete view.dataset.consultationOpen;
      onVisibility(false);
    });
    retry.addEventListener('click', start);
    return {
      open(value) {
        const checked = validatedUrl(value, guideRevision);
        if (!checked) return;
        const changed = url !== checked.href;
        url = checked.href;
        standalone.href = url;
        controls.hidden = false;
        view.dataset.consultationOpen = 'true';
        onVisibility(true);
        if (changed) start();
        else {
          if (frame) frame.hidden = controls.dataset.state !== 'ready';
          focus();
        }
      },
      get isOpen() { return !controls.hidden; },
      focus,
      destroy() {
        discardFrame();
        controls.remove();
        delete view.dataset.consultationOpen;
      }
    };
  }

  const api = Object.freeze({ create, validatedUrl });
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorHelpConsultation = api;
})(typeof window === 'undefined' ? globalThis : window);
