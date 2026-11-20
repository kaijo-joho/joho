const protocol = 'joho-help-desk-embed-v1';
const requestKeys = ['app', 'mode', 'appVersion', 'guideRevision'];

export function readEmbedRequest(url) {
  const keys = [...url.searchParams.keys()];
  if (keys.length !== requestKeys.length || !requestKeys.every(key => url.searchParams.has(key))) return null;
  const [appId, mode, appVersion, revision] = requestKeys.map(key => url.searchParams.get(key));
  const token = url.hash.slice(1);
  if (appId !== 'htmleditor' || mode !== 'practice' || !/^[0-9][0-9A-Za-z._ -]{0,39}$/.test(appVersion) ||
      !/^[1-9][0-9]{0,8}$/.test(revision) || !/^[0-9a-f]{32}$/.test(token)) return null;
  return { appId, mode, appVersion, guideRevision: Number(revision), token };
}

export function embedGuide(request, guide) {
  if (!request || !guide || guide.format_version !== 2 || request.appId !== guide.app_id ||
      request.appVersion !== guide.app_version || request.guideRevision !== guide.guide_revision) return null;
  const entries = Object.entries(guide.operations);
  if (entries.some(([, op]) => typeof op.in_app_help !== 'boolean')) return null;
  const operationIds = new Set(entries.filter(([, op]) => op.in_app_help).map(([id]) => id));
  return operationIds.size ? { modeLabel: '実習モード', operationIds } : null;
}

export function connectEmbed(request, ready) {
  if (!request || window.parent === window || window.origin !== 'null') return;
  const channel = ready ? new MessageChannel() : null;
  const parentOrigin = new URL(location.href).origin;
  const { token, appId, mode, appVersion, guideRevision } = request;
  let consultationAvailable = false;
  let consultationControl;
  if (channel) {
    channel.port1.onmessage = ({ data }) => {
      if (data?.type === 'focus-tab' || data?.type === 'focus-consultation') {
        const control = data.type === 'focus-consultation' && consultationControl?.isConnected
          ? consultationControl : document.querySelector('[role="tab"][aria-selected="true"]');
        control?.focus({ preventScroll: true });
      } else if (data?.type === 'consultation-available') {
        consultationAvailable = true;
      } else if (data?.type === 'appearance' && ['auto', 'light', 'dark'].includes(data.theme) &&
                 Number.isInteger(data.textScale) && data.textScale >= 90 && data.textScale <= 150) {
        document.documentElement.dataset.theme = data.theme;
        document.documentElement.style.setProperty('--site-text-scale', data.textScale / 100);
      }
    };
    document.addEventListener('keydown', event => {
      if (event.key !== 'Escape' || event.defaultPrevented || event.isComposing || event.keyCode === 229) return;
      const detail = event.target.closest('details[open]');
      event.preventDefault();
      if (detail) {
        detail.open = false;
        detail.querySelector(':scope > summary')?.focus();
      } else channel.port1.postMessage({ type: 'close' });
    });
  }
  window.parent.postMessage({
    type: protocol, state: ready ? 'ready' : 'unavailable', token, appId, mode, appVersion, guideRevision
  }, parentOrigin, channel ? [channel.port2] : []);
  if (!channel) return null;
  return {
    get consultationAvailable() { return consultationAvailable; },
    openConsultation(url, control) {
      if (!consultationAvailable) return false;
      consultationControl = control;
      channel.port1.postMessage({ type: 'open-consultation', url });
      return true;
    }
  };
}
