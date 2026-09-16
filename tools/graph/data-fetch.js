/* 公開されたCSV/TSVだけを、認証情報を送らずに取得するための小さな層。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphDataFetch = api;
}(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';

  const DEFAULT_TIMEOUT = 15000;
  const DEFAULT_MAX_BYTES = 1024 * 1024;
  const allowedTypes = new Set(['text/plain', 'text/csv', 'text/x-csv', 'text/tsv', 'text/tab-separated-values', 'application/octet-stream']);
  const forbiddenTypes = /(?:html|json|xml|pdf|zip|excel|spreadsheet|ms-excel|officedocument|gzip|7z|rar)/i;
  const secretKeys = new Set(['appid', 'apikey', 'accesstoken', 'token', 'password', 'secret', 'clientsecret', 'clientid', 'authorization', 'auth', 'xamzcredential', 'xamzsignature', 'signature', 'sig']);

  function failure(code, message, status) {
    const error = new Error(message);
    error.code = code;
    if (status !== undefined) error.status = status;
    return error;
  }

  function validateURL(value) {
    if (typeof value !== 'string') throw failure('INVALID_URL', '公開CSVのHTTPS URLを入力してください。');
    const text = value.trim();
    if (!text || text.length > 2000) throw failure('INVALID_URL', 'URLは2000文字以内のHTTPS URLを入力してください。');
    let url;
    try { url = new URL(text); }
    catch (_) { throw failure('INVALID_URL', 'URLの形式を確認してください。'); }
    if (url.protocol !== 'https:') throw failure('INVALID_URL', 'HTTPSで公開されたCSV/TSVのURLだけを読み込めます。');
    if (url.username || url.password) throw failure('INVALID_URL', '認証情報を含むURLは読み込めません。CSVファイルをダウンロードしてから読み込んでください。');
    for (const [key] of url.searchParams) {
      if (secretKeys.has(key.toLowerCase().replace(/[^a-z0-9]/g, ''))) {
        throw failure('INVALID_URL', '認証情報を含むURLは読み込めません。CSVファイルをダウンロードしてから読み込んでください。');
      }
    }
    url.hash = '';
    return url.href;
  }

  function contentInfo(headers) {
    const raw = headers && typeof headers.get === 'function' ? (headers.get('content-type') || '') : '';
    const contentType = raw.split(';', 1)[0].trim().toLowerCase();
    const match = /(?:^|;)\s*charset\s*=\s*["']?([^;"'\s]+)/i.exec(raw);
    return { contentType, charset: match ? match[1].toLowerCase() : '' };
  }

  function contentLength(headers) {
    const raw = headers && typeof headers.get === 'function' ? headers.get('content-length') : null;
    if (raw === null || raw === undefined || raw === '') return null;
    return /^\d+$/.test(String(raw).trim()) ? Number(raw) : null;
  }

  function cancelBody(response) {
    try {
      if (response && response.body && typeof response.body.cancel === 'function' && !response.body.locked) Promise.resolve(response.body.cancel()).catch(function () {});
    } catch (_) { /* 取消失敗は元のエラーを隠さない */ }
  }

  function finishReader(reader, cancel) {
    if (!reader) return;
    if (cancel) try { Promise.resolve(reader.cancel()).catch(function () {}); } catch (_) { /* 元のエラーを維持 */ }
    try { if (typeof reader.releaseLock === 'function') reader.releaseLock(); } catch (_) { /* 元のエラーを維持 */ }
  }

  function tooLarge() { return failure('TOO_LARGE', 'データは1MB以内にしてください。'); }

  function normalizedChunk(value) {
    if (value instanceof Uint8Array) return value;
    if (value instanceof ArrayBuffer) return new Uint8Array(value);
    if (ArrayBuffer.isView(value)) return new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    throw failure('NETWORK', '公開元からのデータ読込中に通信エラーが発生しました。');
  }

  async function fetchCSV(value, options) {
    options = options || {};
    const url = validateURL(value);
    const timeoutMs = options.timeoutMs === undefined ? DEFAULT_TIMEOUT : options.timeoutMs;
    const maxBytes = options.maxBytes === undefined ? DEFAULT_MAX_BYTES : options.maxBytes;
    const fetchImpl = options.fetchImpl === undefined ? globalThis.fetch : options.fetchImpl;
    if (!Number.isFinite(timeoutMs) || timeoutMs <= 0 || !Number.isFinite(maxBytes) || maxBytes < 0 || typeof fetchImpl !== 'function') {
      throw failure('NETWORK', '読込の設定が不正です。');
    }
    if (options.signal && options.signal.aborted) throw failure('ABORT', '読込を中止しました。');

    const controller = new AbortController();
    let timedOut = false;
    let externalAborted = false;
    const onExternalAbort = () => { externalAborted = true; controller.abort(); };
    if (options.signal) options.signal.addEventListener('abort', onExternalAbort, { once:true });
    const timeoutId = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
    let rejectAbort;
    const aborted = new Promise((_, reject) => { rejectAbort = reject; });
    const onAbort = () => rejectAbort(failure(timedOut ? 'TIMEOUT' : 'ABORT', timedOut ? '公開データの読込が時間切れになりました。' : '読込を中止しました。'));
    controller.signal.addEventListener('abort', onAbort, { once:true });
    const guarded = promise => Promise.race([Promise.resolve(promise), aborted]);
    let reader;
    let response;
    try {
      try {
        const request = Promise.resolve().then(() => fetchImpl(url, { method:'GET', mode:'cors', credentials:'omit', referrerPolicy:'no-referrer', signal:controller.signal }));
        request.then(lateResponse => { if (controller.signal.aborted) cancelBody(lateResponse); }, function () {});
        response = await guarded(request);
      } catch (error) {
        if (error && error.code) throw error;
        if (controller.signal.aborted) throw failure(timedOut ? 'TIMEOUT' : 'ABORT', timedOut ? '公開データの読込が時間切れになりました。' : '読込を中止しました。');
        throw failure('NETWORK', '公開元の読込許可または通信状態を確認してください。');
      }
      if (!response || response.type === 'opaque') throw failure('NETWORK', '公開元の読込許可または通信状態を確認してください。');
      if (!response.ok) throw failure('HTTP', '公開元がデータを返しませんでした（HTTP ' + response.status + '）。', response.status);
      const finalURL = validateURL(response.url || url);
      const info = contentInfo(response.headers);
      if (forbiddenTypes.test(info.contentType) || (info.contentType && !allowedTypes.has(info.contentType))) {
        cancelBody(response);
        throw failure('FORMAT', 'CSVまたはTSVとして公開されたデータを指定してください。');
      }
      const declaredLength = contentLength(response.headers);
      if (declaredLength !== null && declaredLength > maxBytes) {
        cancelBody(response);
        throw tooLarge();
      }
      const chunks = [];
      let length = 0;
      if (response.body && typeof response.body.getReader === 'function') {
        reader = response.body.getReader();
        while (true) {
          let part;
          try { part = await guarded(reader.read()); }
          catch (error) {
            if (error && error.code) throw error;
            if (controller.signal.aborted) throw failure(timedOut ? 'TIMEOUT' : 'ABORT', timedOut ? '公開データの読込が時間切れになりました。' : '読込を中止しました。');
            throw failure('NETWORK', '公開元からのデータ読込中に通信エラーが発生しました。');
          }
          if (part.done) break;
          const chunk = normalizedChunk(part.value);
          length += chunk.byteLength;
          if (length > maxBytes) throw tooLarge();
          chunks.push(chunk);
        }
      } else if (typeof response.arrayBuffer === 'function') {
        const chunk = normalizedChunk(await guarded(response.arrayBuffer()));
        length = chunk.byteLength;
        if (length > maxBytes) throw tooLarge();
        chunks.push(chunk);
      } else throw failure('NETWORK', '公開元からのデータ読込中に通信エラーが発生しました。');
      const bytes = new Uint8Array(length);
      let at = 0;
      for (const chunk of chunks) { bytes.set(chunk, at); at += chunk.byteLength; }
      finishReader(reader, false);
      reader = null;
      return { bytes, url:finalURL, contentType:info.contentType, charset:info.charset };
    } catch (error) {
      finishReader(reader, true);
      reader = null;
      cancelBody(response);
      if (!controller.signal.aborted) controller.abort();
      if (error && error.code) throw error;
      if (controller.signal.aborted || externalAborted) throw failure(timedOut ? 'TIMEOUT' : 'ABORT', timedOut ? '公開データの読込が時間切れになりました。' : '読込を中止しました。');
      throw failure('NETWORK', '公開元の読込許可または通信状態を確認してください。');
    } finally {
      clearTimeout(timeoutId);
      controller.signal.removeEventListener('abort', onAbort);
      if (options.signal) options.signal.removeEventListener('abort', onExternalAbort);
    }
  }

  return { validateURL, fetchCSV };
}));
