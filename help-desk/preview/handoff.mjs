// Only public document identifiers cross the Google sign-in boundary.
export const LIVE_DESK = true;
export const DESK_URL = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbxWsiA-fXfrKWXop1mX0m6uzjNcZXHIDIY7Xt52m8M83LgWD-S3ys770ApNtxTx6jL0/exec';
export const KNOWLEDGE_RELEASE = '30fb542db4f917dba7c59b6aa95e00f6f9d76203d4191cc312f4e266345bdf6a';
const targets = new Set(['htmleditor', 'pythoneditor', 'logic', 'graph', 'illustslide', 'flowchart',
  'worksheet-submission', 'google-drive', 'classroom', 'class-apps', 'course:dr', 'course:ss', 'course:il', 'course:py', 'course:html']);

export function deskHandoffUrl({ targetId = '', guideId = '', guideRevision = '' } = {}) {
  const url = new URL(DESK_URL);
  if (!targets.has(targetId)) return url.href;
  url.searchParams.set('app', targetId);
  const prefix = targetId.startsWith('course:') ? 'faq:' : targetId + ':op-';
  if (typeof guideId === 'string' && guideId.startsWith(prefix) && /^[a-z0-9:-]{1,120}$/.test(guideId)
    && /^[a-zA-Z0-9._-]{1,64}$/.test(String(guideRevision))) {
    url.searchParams.set('guideId', guideId);
    url.searchParams.set('guideRevision', String(guideRevision));
    url.searchParams.set('release', KNOWLEDGE_RELEASE);
  }
  return url.href;
}

export function deskCasesUrl() { return DESK_URL + '?view=cases'; }
