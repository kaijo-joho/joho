// 課題用の共通基盤。読み込むだけでは保存・通信・課題モードの開始を行わない。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JohoAssignmentSecurity = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';

  const FORMAT = 'kaijo-assignment-encrypted';
  const WORK_FORMAT = 'kaijo-assignment-work';
  const VERSION = 1;
  const MAX_WORK_BYTES = 6 * 1024 * 1024;
  const MAX_FILE_BYTES = 10 * 1024 * 1024;
  const MAX_ENTRIES = 1000;
  const encoder = new TextEncoder();
  const decoder = new TextDecoder('utf-8', { fatal: true });
  const idPattern = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/;
  const fingerprintPattern = /^[A-Za-z0-9_-]{43}$/;
  const own = (object, key) => Object.prototype.hasOwnProperty.call(object, key);
  const plain = value => value !== null && typeof value === 'object' && !Array.isArray(value)
    && (Object.getPrototypeOf(value) === Object.prototype || Object.getPrototypeOf(value) === null);

  class AssignmentError extends Error {
    constructor(code, message) { super(message); this.name = 'AssignmentError'; this.code = code; }
  }
  function fail(code, message) { throw new AssignmentError(code, message); }
  function assert(condition, code, message) { if (!condition) fail(code, message); }
  function fields(value, expected, code = 'INVALID_DATA') {
    assert(plain(value) && Object.keys(value).length === expected.length
      && expected.every(key => own(value, key)), code, '課題データの項目が不正です。');
  }
  function validId(value) { return typeof value === 'string' && idPattern.test(value); }
  function validFingerprint(value) { return typeof value === 'string' && fingerprintPattern.test(value); }
  function validTime(value) {
    return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(value)
      && Number.isFinite(Date.parse(value)) && new Date(value).toISOString() === value;
  }

  // 独自暗号ではなく、AAD・比較用の制限付きJSON正規化。任意コードや型を復元しない。
  function canonical(value, limit = MAX_WORK_BYTES) {
    let nodes = 0, bytes = 0;
    function part(text) {
      bytes += encoder.encode(text).length;
      assert(bytes <= limit, 'SIZE_LIMIT', '課題データが保存上限を超えました。履歴は削除していません。');
      return text;
    }
    function walk(item, depth) {
      assert(++nodes <= 250000 && depth <= 48, 'SIZE_LIMIT', '課題データが大きすぎるか、深すぎます。');
      if (item === null || typeof item === 'boolean') return part(JSON.stringify(item));
      if (typeof item === 'number') {
        assert(Number.isFinite(item), 'INVALID_DATA', '数値が不正です。');
        return part(JSON.stringify(item));
      }
      if (typeof item === 'string') {
        assert(item.length <= limit, 'SIZE_LIMIT', '課題データが大きすぎます。');
        return part(JSON.stringify(item));
      }
      if (Array.isArray(item)) {
        assert(item.length <= 100000, 'SIZE_LIMIT', '課題データの項目数が多すぎます。');
        const parts = [part('[')];
        for (let i = 0; i < item.length; i++) {
          const descriptor = Object.getOwnPropertyDescriptor(item, i);
          assert(descriptor && own(descriptor, 'value'), 'INVALID_DATA', '配列の項目が欠けているか、アクセサーです。');
          if (i) parts.push(part(','));
          parts.push(walk(descriptor.value, depth + 1));
        }
        parts.push(part(']'));
        return parts.join('');
      }
      assert(plain(item), 'INVALID_DATA', 'JSONで保存できないデータが含まれています。');
      const parts = [part('{')];
      Object.keys(item).sort().forEach((key, index) => {
        assert(!['__proto__', 'prototype', 'constructor'].includes(key), 'INVALID_DATA', '使用できない項目名です。');
        const descriptor = Object.getOwnPropertyDescriptor(item, key);
        assert(descriptor && own(descriptor, 'value'), 'INVALID_DATA', 'アクセサーは保存できません。');
        if (index) parts.push(part(','));
        parts.push(part(JSON.stringify(key) + ':'), walk(descriptor.value, depth + 1));
      });
      parts.push(part('}'));
      return parts.join('');
    }
    const text = walk(value, 0);
    assert(encoder.encode(text).length <= limit, 'SIZE_LIMIT', '課題データが保存上限を超えました。履歴は削除していません。');
    return text;
  }
  function clone(value) { return JSON.parse(canonical(value)); }
  function parse(text, limit) {
    assert(typeof text === 'string' && text.length <= limit && encoder.encode(text).length <= limit,
      'SIZE_LIMIT', '課題ファイルの大きさが不正です。');
    try { return JSON.parse(text); }
    catch (_) { fail('INVALID_DATA', '課題ファイルを読み取れません。'); }
  }
  function base64url(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }
  function decode64(value, max, min = 1) {
    assert(typeof value === 'string' && value.length <= Math.ceil(max * 4 / 3)
      && /^[A-Za-z0-9_-]+$/.test(value), 'INVALID_DATA', '暗号化データの形式が不正です。');
    let bytes;
    try { bytes = Uint8Array.from(atob(value.replace(/-/g, '+').replace(/_/g, '/')), c => c.charCodeAt(0)); }
    catch (_) { fail('INVALID_DATA', '暗号化データを読み取れません。'); }
    assert(bytes.length >= min && bytes.length <= max && base64url(bytes) === value,
      'INVALID_DATA', '暗号化データの長さ・表記が不正です。');
    return bytes;
  }
  function publicJwk(jwk, algorithm) {
    assert(plain(jwk) && jwk.kty === 'RSA' && jwk.e === 'AQAB'
      && Object.keys(jwk).every(key => ['kty', 'n', 'e', 'alg', 'ext', 'key_ops'].includes(key))
      && (!own(jwk, 'alg') || jwk.alg === algorithm), 'INVALID_KEY', '信頼する公開鍵の形式が不正です。');
    const modulus = decode64(jwk.n, 512, 256);
    assert(modulus[0] >= 128, 'INVALID_KEY', 'RSA公開鍵は2048ビット以上が必要です。');
    return { kty: 'RSA', n: jwk.n, e: jwk.e };
  }
  function keyMap(value, algorithm) {
    assert(plain(value) && Object.keys(value).length > 0, 'TRUST_REQUIRED', 'fm2の信頼設定が未登録です。課題モードは開始できません。');
    const result = Object.create(null);
    Object.keys(value).forEach(key => {
      assert(validId(key), 'INVALID_KEY', '公開鍵IDが不正です。');
      result[key] = publicJwk(value[key], algorithm);
    });
    return result;
  }

  // 鍵はJSONやlocalStorageへ書き出さず、CryptoKeyのままIndexedDBに置く。
  // addの一意制約により、別タブが作った鍵を上書きしない。開くだけではDBも作らない。
  function createIndexedDBKeyStore(indexedDB = globalThis.indexedDB) {
    assert(indexedDB && typeof indexedDB.open === 'function', 'STORAGE_UNAVAILABLE', '暗号鍵をブラウザに保存できません。');
    function run(mode, action) {
      return new Promise((resolve, reject) => {
        let done = false;
        const rejectOnce = error => { if (!done) { done = true; reject(error); } };
        const request = indexedDB.open('joho.assignments.keys.v1', 1);
        request.onupgradeneeded = () => request.result.createObjectStore('keys', { keyPath: 'appId' });
        request.onerror = () => rejectOnce(request.error);
        request.onblocked = () => rejectOnce(new AssignmentError('STORAGE_UNAVAILABLE', '別のタブが暗号鍵の保存を妨げています。'));
        request.onsuccess = () => {
          const db = request.result;
          if (done) { db.close(); return; }
          db.onversionchange = () => db.close();
          let transaction, operation, result;
          try {
            transaction = db.transaction('keys', mode);
            operation = action(transaction.objectStore('keys'));
          } catch (error) { db.close(); rejectOnce(error); return; }
          operation.onsuccess = () => { result = operation.result; };
          transaction.oncomplete = () => { db.close(); done = true; resolve(result); };
          transaction.onabort = () => { db.close(); rejectOnce(transaction.error || operation.error); };
          transaction.onerror = () => { /* abortで一度だけ通知する。 */ };
        };
      });
    }
    return Object.freeze({
      read: appId => run('readonly', store => store.get(appId)),
      add: record => run('readwrite', store => store.add(record))
    });
  }

  function createClient(options) {
    assert(plain(options) && validId(options.appId) && validId(options.issuer), 'TRUST_REQUIRED', 'アプリと発行者の設定が必要です。');
    assert(typeof options.validateDocument === 'function', 'VALIDATOR_REQUIRED', '教材固有のデータ検証が未登録です。');
    const { appId, issuer, validateDocument } = options;
    const signingKeys = keyMap(options.signingKeys, 'RS256');
    const recoveryKeys = keyMap(options.recoveryKeys, 'RSA-OAEP-256');
    const crypto = options.crypto || globalThis.crypto;
    assert(crypto && crypto.subtle && typeof crypto.getRandomValues === 'function', 'UNSUPPORTED', 'この環境では課題ファイルの暗号化を利用できません。');
    const keyStore = options.keyStore || createIndexedDBKeyStore();
    assert(keyStore && typeof keyStore.read === 'function' && typeof keyStore.add === 'function',
      'STORAGE_UNAVAILABLE', '暗号鍵の保存先が未登録です。');
    const now = options.now || (() => Date.now());
    const rsaOaep = { name: 'RSA-OAEP', hash: 'SHA-256' };
    const rsaSign = { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' };
    const timestamp = () => new Date(now()).toISOString();
    const fingerprint = async jwk => base64url(new Uint8Array(await crypto.subtle.digest('SHA-256', encoder.encode(canonical(jwk)))));

    async function readKey() {
      let record;
      try { record = await keyStore.read(appId); }
      catch (_) { fail('STORAGE_UNAVAILABLE', '暗号鍵を読み込めません。保存データは変更していません。'); }
      if (record == null) return null;
      const jwk = publicJwk(record.publicJwk, 'RSA-OAEP-256');
      const key = record.privateKey;
      assert(record.appId === appId && record.keyId === await fingerprint(jwk)
        && key && key.type === 'private' && key.extractable === false
        && key.algorithm && key.algorithm.name === 'RSA-OAEP' && key.algorithm.hash && key.algorithm.hash.name === 'SHA-256'
        && key.algorithm.modulusLength >= 2048 && Array.isArray(key.usages) && key.usages.includes('unwrapKey'),
      'INVALID_KEY', '保存された暗号鍵が不正です。新しい鍵では上書きしません。');
      // 公開鍵だけがすり替わったレコードも、利用を始める前に検出する。
      const wrappingKey = await crypto.subtle.importKey('jwk', jwk, rsaOaep, false, ['wrapKey']);
      try {
        const probe = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
        const wrapped = await crypto.subtle.wrapKey('raw', probe, wrappingKey, 'RSA-OAEP');
        await crypto.subtle.unwrapKey('raw', wrapped, key, 'RSA-OAEP', { name: 'AES-GCM', length: 256 }, false, ['encrypt']);
      } catch (_) { fail('INVALID_KEY', '保存された暗号鍵が一致しません。新しい鍵では上書きしません。'); }
      return { appId, keyId: record.keyId, publicJwk: jwk, privateKey: key, wrappingKey };
    }

    async function prepareBrowser() {
      let record = await readKey();
      if (!record) {
        const pair = await crypto.subtle.generateKey({ ...rsaOaep, modulusLength: 3072,
          publicExponent: new Uint8Array([1, 0, 1]) }, false, ['wrapKey', 'unwrapKey']);
        const jwk = publicJwk(await crypto.subtle.exportKey('jwk', pair.publicKey), 'RSA-OAEP-256');
        const candidate = { appId, keyId: await fingerprint(jwk), publicJwk: jwk, privateKey: pair.privateKey };
        try { await keyStore.add(candidate); }
        catch (error) {
          if (!error || error.name !== 'ConstraintError') fail('STORAGE_UNAVAILABLE', '暗号鍵を保存できません。課題モードは開始していません。');
        }
        record = await readKey();
        assert(record, 'STORAGE_UNAVAILABLE', '暗号鍵の保存を確認できません。');
      }
      return { appId, browserKeyId: record.keyId, publicJwk: clone(record.publicJwk) };
    }

    async function verifyGrant(grant, { allowExpired = false } = {}) {
      assert(typeof grant === 'string' && grant.length <= 16384, 'INVALID_GRANT', '課題の配付情報が不正です。');
      const parts = grant.split('.');
      assert(parts.length === 3, 'INVALID_GRANT', '署名付きの課題情報が必要です。');
      let header, claims;
      try {
        header = parse(decoder.decode(decode64(parts[0], 1024)), 1024);
        claims = parse(decoder.decode(decode64(parts[1], 8192)), 8192);
      } catch (_) { fail('INVALID_GRANT', '課題の配付情報を読み取れません。'); }
      fields(header, ['alg', 'typ', 'kid'], 'INVALID_GRANT');
      assert(header.alg === 'RS256' && header.typ === 'joho-assignment+jwt'
        && validId(header.kid) && own(signingKeys, header.kid), 'INVALID_GRANT', '信頼できる発行者の署名ではありません。');
      const publicKey = await crypto.subtle.importKey('jwk', signingKeys[header.kid], rsaSign, false, ['verify']);
      const valid = await crypto.subtle.verify(rsaSign, publicKey, decode64(parts[2], 512, 256), encoder.encode(parts[0] + '.' + parts[1]));
      assert(valid, 'SIGNATURE_INVALID', '課題の配付情報の署名が一致しません。');
      fields(claims, ['v', 'iss', 'aud', 'sub', 'jti', 'assignmentId', 'iat', 'exp', 'browserKeyId', 'recoveryKeyId', 'allowImport'], 'INVALID_GRANT');
      assert(claims.v === 1 && claims.iss === issuer && claims.aud === appId,
        'WRONG_APP', 'このエディタ用の課題情報ではありません。');
      assert([claims.sub, claims.jti, claims.assignmentId, claims.recoveryKeyId].every(validId)
        && validFingerprint(claims.browserKeyId) && typeof claims.allowImport === 'boolean'
        && Number.isSafeInteger(claims.iat) && Number.isSafeInteger(claims.exp)
        && claims.iat >= 0 && claims.exp > claims.iat, 'INVALID_GRANT', '課題の配付情報の内容が不正です。');
      assert(own(recoveryKeys, claims.recoveryKeyId), 'RECOVERY_UNAVAILABLE', '教員用の復旧公開鍵が未登録です。');
      assert(allowExpired || (claims.iat <= now() / 1000 + 300 && now() / 1000 < claims.exp),
        'GRANT_EXPIRED', '課題の開始情報が期限外です。fm2から開き直してください。');
      return clone(claims);
    }

    async function boundKey(claims) {
      const record = await readKey();
      assert(record && record.keyId === claims.browserKeyId, 'WRONG_BROWSER',
        'この課題は別のブラウザで開始されています。元のブラウザを使うか、先生に復旧を依頼してください。');
      return record;
    }
    function validateWork(value, claims) {
      const work = clone(value);
      fields(work, ['format', 'version', 'appId', 'issueId', 'name', 'entries'], 'INVALID_WORK');
      assert(work.format === WORK_FORMAT && work.version === VERSION && work.appId === appId && work.issueId === claims.jti,
        'INVALID_WORK', '課題と作業データが一致しません。');
      assert(typeof work.name === 'string' && work.name.length <= 120 && Array.isArray(work.entries)
        && work.entries.length >= 1 && work.entries.length <= MAX_ENTRIES, 'INVALID_WORK', '作業名または変更履歴が不正です。');
      work.entries.forEach((entry, index) => {
        fields(entry, ['seq', 'action', 'detail', 'at', 'browserKeyId', 'document'], 'INVALID_WORK');
        assert(entry.seq === index && validTime(entry.at) && entry.browserKeyId === claims.browserKeyId
          && typeof entry.detail === 'string' && entry.detail.length <= 160
          && (index === 0 ? ['start', 'start-import'].includes(entry.action)
            : ['edit', 'undo', 'redo', 'import', 'checkpoint'].includes(entry.action)), 'INVALID_WORK', '変更履歴の順序・内容が不正です。');
        assert(claims.allowImport || !['start-import', 'import'].includes(entry.action), 'IMPORT_NOT_ALLOWED', 'この課題では既存の作品を読み込めません。');
        // 教材固有の意味・個数・接続等の検証はアダプターの責任。例外なら保存しない。
        const result = validateDocument(clone(entry.document), { index, action: entry.action });
        if (result && typeof result.then === 'function') {
          // 誤ってasync関数を渡した場合も、拒否したPromiseを未処理のまま残さない。
          Promise.resolve(result).catch(() => {});
          fail('INVALID_WORK', '教材のデータ検証は同期処理で行ってください。');
        }
        assert(result !== false, 'INVALID_WORK', '教材のデータ検証に失敗しました。');
      });
      return work;
    }

    async function start(grant, { document, name = '', imported = false }) {
      assert(typeof imported === 'boolean', 'INVALID_WORK', '読み込み元の指定が不正です。');
      const claims = await verifyGrant(grant);
      await boundKey(claims);
      const work = validateWork({ format: WORK_FORMAT, version: VERSION, appId, issueId: claims.jti, name,
        entries: [{ seq: 0, action: imported ? 'start-import' : 'start', detail: '', at: timestamp(),
          browserKeyId: claims.browserKeyId, document }] }, claims);
      return { grant, work };
    }
    async function record(session, document, { action = 'edit', detail = '' } = {}) {
      const claims = await verifyGrant(session.grant, { allowExpired: true });
      await boundKey(claims);
      const work = validateWork(session.work, claims);
      const data = clone(document);
      if (action === 'edit' && canonical(work.entries.at(-1).document) === canonical(data)) return { grant: session.grant, work };
      assert(work.entries.length < MAX_ENTRIES, 'HISTORY_LIMIT', '履歴の保存上限です。履歴は削除していません。先生に相談してください。');
      work.entries.push({ seq: work.entries.length, action, detail, at: timestamp(), browserKeyId: claims.browserKeyId, document: data });
      return { grant: session.grant, work: validateWork(work, claims) };
    }

    function readEnvelope(text) {
      const value = parse(text, MAX_FILE_BYTES);
      fields(value, ['format', 'version', 'grant', 'encryption'], 'INVALID_FILE');
      assert(value.format === FORMAT && value.version === VERSION, 'INVALID_FILE', '未対応の課題ファイルです。');
      fields(value.encryption, ['alg', 'wrap', 'iv', 'browser', 'recovery', 'ciphertext'], 'INVALID_FILE');
      const encryption = value.encryption;
      assert(encryption.alg === 'A256GCM' && encryption.wrap === 'RSA-OAEP-256', 'INVALID_FILE', '未対応の暗号化方式です。');
      decode64(encryption.iv, 12, 12);
      decode64(encryption.browser, 512, 256);
      decode64(encryption.recovery, 512, 256);
      decode64(encryption.ciphertext, MAX_WORK_BYTES + 16, 16);
      return value;
    }
    function additionalData(envelope) {
      const { ciphertext, ...header } = envelope.encryption;
      return encoder.encode(canonical({ format: envelope.format, version: envelope.version, grant: envelope.grant, encryption: header }));
    }

    async function seal(session) {
      // 開始期限切れでも既存作品の保存・閲覧は失わせない。提出可否はfm2が別に判定する。
      const claims = await verifyGrant(session.grant, { allowExpired: true });
      const record = await boundKey(claims);
      const work = validateWork(session.work, claims);
      const plaintext = encoder.encode(canonical(work));
      const recovery = await crypto.subtle.importKey('jwk', recoveryKeys[claims.recoveryKeyId], rsaOaep, false, ['wrapKey']);
      const contentKey = await crypto.subtle.generateKey({ name: 'AES-GCM', length: 256 }, true, ['encrypt']);
      const iv = crypto.getRandomValues(new Uint8Array(12));
      const [browserWrapped, recoveryWrapped] = await Promise.all([
        crypto.subtle.wrapKey('raw', contentKey, record.wrappingKey, 'RSA-OAEP'),
        crypto.subtle.wrapKey('raw', contentKey, recovery, 'RSA-OAEP')
      ]);
      const envelope = { format: FORMAT, version: VERSION, grant: session.grant, encryption: {
        alg: 'A256GCM', wrap: 'RSA-OAEP-256', iv: base64url(iv),
        browser: base64url(new Uint8Array(browserWrapped)), recovery: base64url(new Uint8Array(recoveryWrapped)), ciphertext: ''
      } };
      const ciphertext = await crypto.subtle.encrypt({ name: 'AES-GCM', iv, additionalData: additionalData(envelope), tagLength: 128 }, contentKey, plaintext);
      envelope.encryption.ciphertext = base64url(new Uint8Array(ciphertext));
      return canonical(envelope, MAX_FILE_BYTES);
    }
    async function decrypt(envelope, claims, privateKey, recipient) {
      const encryption = envelope.encryption;
      let plaintext;
      try {
        const contentKey = await crypto.subtle.unwrapKey('raw', decode64(encryption[recipient], 512, 256), privateKey,
          'RSA-OAEP', { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
        plaintext = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: decode64(encryption.iv, 12, 12),
          additionalData: additionalData(envelope), tagLength: 128 }, contentKey,
        decode64(encryption.ciphertext, MAX_WORK_BYTES + 16, 16));
      } catch (_) { fail('DECRYPT_FAILED', '課題ファイルを復号できません。鍵の不一致またはファイルの変更が考えられます。'); }
      let value;
      try { value = parse(decoder.decode(plaintext), MAX_WORK_BYTES); }
      catch (_) { fail('INVALID_WORK', '復号した作業データを読み取れません。'); }
      return { grant: envelope.grant, work: validateWork(value, claims) };
    }
    async function open(text) {
      const envelope = readEnvelope(text);
      const claims = await verifyGrant(envelope.grant, { allowExpired: true });
      const record = await boundKey(claims); // 読み込みで新しい鍵を作らない。
      return decrypt(envelope, claims, record.privateKey, 'browser');
    }
    async function openForRecovery(text, privateKey) {
      // 教員権限の検査を行うサーバー側アダプター用。秘密鍵・このAPIを生徒UIへ渡さない。
      const envelope = readEnvelope(text);
      const claims = await verifyGrant(envelope.grant, { allowExpired: true });
      return decrypt(envelope, claims, privateKey, 'recovery');
    }
    return Object.freeze({ prepareBrowser, verifyGrant, start, record, seal, open, openForRecovery });
  }

  return Object.freeze({ FORMAT, WORK_FORMAT, VERSION, MAX_WORK_BYTES, MAX_FILE_BYTES, MAX_ENTRIES,
    AssignmentError, canonical, createIndexedDBKeyStore, createClient });
});
