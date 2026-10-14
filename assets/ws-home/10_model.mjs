// Respect the existing site's display choices without loading lesson navigation.
try { const root=document.documentElement, theme=localStorage.getItem('joho.siteTheme'), size=localStorage.getItem('joho.textSize'); if(['light','dark'].includes(theme))root.dataset.theme=theme; if(['standard','large','xlarge'].includes(size))root.dataset.textSize=size; } catch {}
export const states = Object.freeze({
  UNSENT: '未送信', SENDING: '送信中', RECEIVED: '受信済み', VERIFYING: '検証待ち',
  ACCEPTED: '受理済み', RESUBMIT_REQUIRED: '再提出が必要', RETRYABLE: '送信失敗・再試行可能',
  CANCELLED: '送信を取り消しました'
});
export const dashboardUrl = 'https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzypkAyvoQEHOEvtl3wSob3H6pcheKQQTWGygKP539w1NqNO8lsInO9aQ0uypx3QyVS/exec';
export const worksheetUrl = 'https://script.google.com/macros/s/AKfycbxtFZbgO-jXlvg5NcgS75GhwoC_608hl5ze9FxQQou26SmopWJYVl7ToenIbTTYJOXX4g/exec';
export const legacyWorksheetIds = Object.freeze(['dr31', 'dr32', 'dr41', 'dr42', 'dr43']);
export const provisionalLimits = Object.freeze({maxInputBytes: 10 * 1024 * 1024, maxPixels: 24000000,
  maxImageBytes: 5 * 1024 * 1024, maxTotalBytes: 10 * 1024 * 1024, normalizedWidth: 1600});
export function randomId() {
  if (crypto.randomUUID) return crypto.randomUUID();
  const b = crypto.getRandomValues(new Uint8Array(16)); b[6] = (b[6] & 15) | 64; b[8] = (b[8] & 63) | 128;
  const h = Array.from(b, x => x.toString(16).padStart(2, '0')).join('');
  return [h.slice(0, 8), h.slice(8, 12), h.slice(12, 16), h.slice(16, 20), h.slice(20)].join('-');
}
export function parseWorksheetQr(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,20}\|\d{4}\|[A-Za-z0-9_-]{1,20}\|[FB]$/.test(value)) {
    throw Error('WS_QR_REQUIRED');
  }
  const [subject, year, worksheetId, side] = value.split('|');
  return {subject, year: Number(year), worksheetId, side, payload: value};
}
export function parsePairingQr(value, origin) {
  const u = new URL(value);
  if (u.origin !== origin || u.pathname !== '/ws-capture.html' || u.search) throw Error('PAIR_QR_INVALID');
  const params = new URLSearchParams(u.hash.slice(1));
  const token = params.get('pair');
  if (Array.from(params.keys()).join(',') !== 'pair' || !/^[A-Za-z0-9_-]{24,160}$/.test(token || '')) throw Error('PAIR_QR_INVALID');
  return token;
}
export function checkPages(pages) {
  const errors = [];
  for (const side of ['F', 'B']) {
    const p = pages[side];
    if (!p || !p.correctedBlob || !p.reading) errors.push({side, message: (side === 'F' ? '表面' : '裏面') + 'を撮影・読取してください。'});
    else if (p.reading.status !== 'OK') errors.push({side, message: p.reading.message || '読取結果を確認できません。'});
    else if (p.reading.qr.side !== side) errors.push({side, message: '表裏が逆です。「表裏を入れ替える」か、画像を差し替えてください。'});
  }
  if (errors.length) return {ok: false, errors};
  const a = pages.F.reading, b = pages.B.reading;
  if (a.qr.subject !== b.qr.subject || a.qr.year !== b.qr.year || a.qr.worksheetId !== b.qr.worksheetId) {
    errors.push({side: 'B', message: '表面と裏面のWS識別QRが一致しません。両面を確認して差し替えてください。'});
  }
  if (a.classNumber !== b.classNumber || a.number !== b.number) {
    errors.push({side: 'B', message: '表面と裏面の組・番号が一致しません。紙のマークを修正して撮り直してください。'});
  }
  return {ok: !errors.length, errors, qr: a.qr, classNumber: a.classNumber, number: a.number};
}
export function newDraft(owner = null) {
  return {id: randomId(), owner, revision: 0, updatedAt: new Date().toISOString(), pages: {}, confirmed: false,
    requestId: null, receipt: null, route: null, state: 'UNSENT'};
}
export function editedDraft(draft) {
  return {...draft, confirmed: false, requestId: null, receipt: null, route: null, state: 'UNSENT'};
}
export function stateLabel(value) { return states[value] || '状態を確認中'; }
export function timeLabel(value) {
  return value ? new Intl.DateTimeFormat('ja-JP', {dateStyle: 'short', timeStyle: 'medium', timeZone: 'Asia/Tokyo'}).format(new Date(value)) : '—';
}
export async function hashBlob(blob) {
  const h = new Uint8Array(await crypto.subtle.digest('SHA-256', await blob.arrayBuffer()));
  return Array.from(h, x => x.toString(16).padStart(2, '0')).join('');
}
