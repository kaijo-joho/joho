// distと利用者実行の保存用GASへ同じ内容を配置する。秘密鍵の実値は含めない。
var ToolsStoreContract = (function () {
  'use strict';
  var HEADERS = ['recordKey', 'recordKind', 'metaJson', 'フォルダ'];
  for (var i = 1; i <= 5; i++) HEADERS.push('code0' + i);
  for (var j = 1; j <= 5; j++) HEADERS.push('stdin0' + j);
  var C = Object.freeze({
    SCHEMA_VERSION: 1, KIND: 'tools-store-v1', AUDIENCE: 'tools-store-v1',
    GUIDE: '使い方', SHEET: 'Python', HISTORY: 'Python履歴',
    HEADERS: Object.freeze(HEADERS), DRAFTS: 1024, BLOCK: 4, DRAFT_ROWS: 4097,
    MIN_DRAFTS: 256, MIN_DRAFT_ROWS: 1025,
    HISTORY_ROWS: 2049, PARTS: 5, CHUNK: 45000, MAX_TEXT: 200000,
    RECENT: 16, CHECKPOINT_MS: 300000,
    CONFIRMATION: Object.freeze({ SCHEMA: 1, SHEET: 'Python確認', RECEIPTS: 'Python確認受付',
      HEADERS: Object.freeze(['confirmationKeyV1', 'recordKind', 'metaJson', 'payload']),
      RECEIPT_HEADERS: Object.freeze(['confirmationRequestV1', 'recordKind', 'metaJson', 'payload']),
      MAX_BYTES: 4194304, CHUNK: 32000, PARTS: 132, SLOTS: 8, BLOCK: 133, ROWS: 1067,
      RECEIPT_ROWS: 4097, READ_MS: 300000, UPLOAD_MS: 1200000 })
  });
  // 既存256問版のschema1も使う。物理的に存在する完全な4行だけを容量とする。
  function draftCapacity(rows) {
    return Number.isSafeInteger(rows) && rows >= 1 ? Math.min(C.DRAFTS, Math.floor((rows - 1) / C.BLOCK)) : 0;
  }
  function fail(code, message) {
    var error = new Error(message || 'クラウド保存を完了できませんでした。');
    error.toolsStoreCode = code; throw error;
  }
  function assert(condition, code, message) { if (!condition) fail(code, message); }
  function normalizeAccount(value) {
    assert(typeof value === 'string', 'account_required');
    var email = value.trim().toLowerCase();
    assert(/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) && email.length <= 254, 'account_required');
    return email;
  }
  function hex(bytes) { return bytes.map(function (v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); }).join(''); }
  function hash(value) {
    assert(typeof value === 'string', 'invalid_text');
    return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, value, Utilities.Charset.UTF_8));
  }
  function actorKey(account) { return hash(normalizeAccount(account)); }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function (key) { return JSON.stringify(key) + ':' + canonical(value[key]); }).join(',') + '}';
  }
  function b64(value) { return Utilities.base64EncodeWebSafe(value, Utilities.Charset.UTF_8).replace(/=+$/, ''); }
  function unb64(value) { return Utilities.newBlob(Utilities.base64DecodeWebSafe(value)).getDataAsString('UTF-8'); }
  function hmac(value, key) {
    assert(typeof key === 'string' && key.length >= 32, 'configuration_required');
    return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(value, key, Utilities.Charset.UTF_8)).replace(/=+$/, '');
  }
  function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var difference = 0;
    for (var k = 0; k < a.length; k++) difference |= a.charCodeAt(k) ^ b.charCodeAt(k);
    return difference === 0;
  }
  function configLifetime(config) {
    var value = config.bindingLifetimeMs || 3600000;
    assert(Number.isSafeInteger(value) && value >= 60000 && value <= 86400000, 'configuration_required');
    return value;
  }
  function validatePayload(payload, config, now) {
    assert(payload && payload.aud === C.AUDIENCE, 'binding_invalid');
    assert(payload.account === normalizeAccount(payload.account) && payload.actorKey === actorKey(payload.account), 'binding_invalid');
    assert(typeof payload.spreadsheetId === 'string' && /^[A-Za-z0-9_-]{20,160}$/.test(payload.spreadsheetId), 'binding_invalid');
    assert(typeof payload.generation === 'string' && /^[a-f0-9]{32}$/.test(payload.generation), 'binding_invalid');
    assert(payload.tool === 'python' && Array.isArray(config.allowedOrigins) && config.allowedOrigins.indexOf(payload.origin) >= 0, 'binding_invalid');
    assert(Number.isSafeInteger(payload.issuedAt) && Number.isSafeInteger(payload.expiresAt) && payload.expiresAt > payload.issuedAt && payload.expiresAt - payload.issuedAt <= configLifetime(config), 'binding_invalid');
    assert(payload.issuedAt <= now + 30000 && payload.expiresAt > now, 'binding_expired', '学校アカウントへ接続し直してください。');
    return payload;
  }
  function issueBinding(input, config, now) {
    now = now === undefined ? Date.now() : now;
    var account = normalizeAccount(input.account);
    var payload = { aud: C.AUDIENCE, account: account, actorKey: actorKey(account),
      spreadsheetId: input.spreadsheetId, generation: input.generation, tool: input.tool,
      origin: input.origin, issuedAt: now, expiresAt: now + configLifetime(config) };
    validatePayload(payload, config, now);
    var body = b64(canonical(payload));
    return body + '.' + hmac(body, config.bindingKey);
  }
  function verifyBinding(token, config, now) {
    now = now === undefined ? Date.now() : now;
    assert(typeof token === 'string' && token.length <= 4096 && /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token), 'binding_invalid');
    var pieces = token.split('.');
    assert(equal(hmac(pieces[0], config.bindingKey), pieces[1]), 'binding_invalid');
    var payload;
    try { payload = JSON.parse(unb64(pieces[0])); } catch (ignored) { fail('binding_invalid'); }
    return validatePayload(payload, config, now);
  }
  return Object.freeze({ constants: C, draftCapacity: draftCapacity, fail: fail, assert: assert, hash: hash, actorKey: actorKey,
    normalizeAccount: normalizeAccount, canonical: canonical, equal: equal,
    issueBinding: issueBinding, verifyBinding: verifyBinding });
}());
