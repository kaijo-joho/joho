/* editor-lite v1: JSON検証と暗号。通常起動では鍵も保存領域も作らない。 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JohoAssignmentLite = api;
})(typeof globalThis === 'object' ? globalThis : this, function () {
  'use strict';
  const FORMAT = 'kaijo-assignment-lite-work';
  const LOCAL = 'kaijo-assignment-lite-local';
  const LIMITS = Object.freeze({ bytes: 6 * 1024 * 1024, entries: 1000, nodes: 250000, depth: 48 });
  const utf8 = new TextEncoder();
  const own = (value, key) => Object.prototype.hasOwnProperty.call(value, key);
  const forbidden = key => ['__proto__', 'prototype', 'constructor'].includes(key);
  function assert(ok, message = 'データの形式が不正です。') { if (!ok) throw new Error(message); }
  function object(value) { return value !== null && typeof value === 'object' && !Array.isArray(value); }
  function exact(value, keys) {
    assert(object(value) && Object.keys(value).length === keys.length && keys.every(key => own(value, key)), '未知の項目・不足した項目があります。');
  }
  function text(value, max) {
    assert(typeof value === 'string' && value.length <= max, '文字列が不正です。');
    for (let i = 0; i < value.length; i++) {
      const code = value.charCodeAt(i);
      if (code >= 0xd800 && code <= 0xdbff) {
        const next = value.charCodeAt(++i); assert(next >= 0xdc00 && next <= 0xdfff, '文字コードが不正です。');
      } else assert(code < 0xdc00 || code > 0xdfff, '文字コードが不正です。');
    }
    return value;
  }
  function id(value) { assert(typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/.test(value), 'IDが不正です。'); return value; }
  function integer(value, min, max) { assert(Number.isInteger(value) && value >= min && value <= max, '整数値が不正です。'); return value; }
  function canonical(value) {
    let count = 0;
    function visit(entry, depth) {
      assert(++count <= LIMITS.nodes && depth <= LIMITS.depth, '履歴の構造が保存上限に達しました。提出フォームへ保存し、教員に相談してください。');
      if (entry === null || typeof entry === 'boolean') return JSON.stringify(entry);
      if (typeof entry === 'string') return JSON.stringify(text(entry, LIMITS.bytes * 2));
      if (typeof entry === 'number') { assert(Number.isFinite(entry)); return JSON.stringify(entry); }
      if (Array.isArray(entry)) {
        assert(Object.keys(entry).length === entry.length && Array.from({ length: entry.length }, (_, i) => own(entry, i)).every(Boolean), '疎な配列は使えません。');
        return '[' + entry.map(child => visit(child, depth + 1)).join(',') + ']';
      }
      assert(object(entry) && [Object.prototype, null].includes(Object.getPrototypeOf(entry)), 'JSON以外の値は使えません。');
      assert(Reflect.ownKeys(entry).length === Object.keys(entry).length, 'JSON以外の項目は使えません。');
      return '{' + Object.keys(entry).sort().map(key => {
        assert(!forbidden(key) && own(Object.getOwnPropertyDescriptor(entry, key), 'value'), '使用できない項目名・値です。');
        return JSON.stringify(text(key, 256)) + ':' + visit(entry[key], depth + 1);
      }).join(',') + '}';
    }
    return visit(value, 0);
  }
  const clone = value => JSON.parse(canonical(value));
  function b64(bytes) {
    let binary = '';
    for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
    return btoa(binary);
  }
  const b64url = bytes => b64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  function decode(value, url = true, max = LIMITS.bytes * 2) {
    assert(typeof value === 'string' && value.length <= max && (url ? /^[A-Za-z0-9_-]+$/ : /^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/).test(value), 'base64の形式が不正です。');
    const decoded = Uint8Array.from(atob(url ? value.replace(/-/g, '+').replace(/_/g, '/') : value), char => char.charCodeAt(0));
    assert((url ? b64url(decoded) : b64(decoded)) === value, 'base64の形式が不正です。');
    return decoded;
  }
  function decode32(value) { const bytes = decode(value, true, 43); assert(bytes.length === 32); return bytes; }
  const cryptoAPI = () => { assert(globalThis.crypto?.subtle, '安全な暗号処理を利用できません。HTTPSとブラウザ設定を確認してください。'); return globalThis.crypto; };
  const random = size => cryptoAPI().getRandomValues(new Uint8Array(size));
  const requestId = () => 'r_' + b64url(random(24));
  async function sha(value) { return b64url(new Uint8Array(await cryptoAPI().subtle.digest('SHA-256', typeof value === 'string' ? utf8.encode(text(value, LIMITS.bytes * 2)) : value))); }
  function route(value) { exact(value, ['bookId', 'pid', 'itemId']); id(value.bookId); id(value.pid); assert(text(value.itemId, 128).length > 0); return clone(value); }
  function transcript(input) {
    exact(input, ['purpose', 'bookId', 'pid', 'itemId', 'sessionId', 'browserKeyId', 'requestId', 'revision', 'payloadHash', 'challenge']);
    assert(['start', 'resume', 'checkpoint', 'submit'].includes(input.purpose));
    route({ bookId: input.bookId, pid: input.pid, itemId: input.itemId }); id(input.requestId);
    if (input.purpose === 'start') assert(input.sessionId === ''); else id(input.sessionId);
    decode32(input.browserKeyId); decode32(input.payloadHash); integer(input.revision, 0, 1000000);
    if (['start', 'resume'].includes(input.purpose)) assert(/^[a-f0-9]{64}$/.test(input.challenge)); else assert(input.challenge === '');
    return 'fm2.editor-lite.v1\n' + canonical(input);
  }
  async function sign(key, input) { return b64url(new Uint8Array(await cryptoAPI().subtle.sign('HMAC', key, utf8.encode(transcript(input))))); }
  async function createKeys() {
    const raw = random(32);
    try {
      return { browserKeyId: await sha(raw), keyMaterial: b64url(raw),
        hmac: await cryptoAPI().subtle.importKey('raw', raw, { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']),
        aes: await cryptoAPI().subtle.generateKey({ name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']) };
    } finally { raw.fill(0); }
  }
  function validateLogic(snapshot) {
    exact(snapshot, ['graph', 'inputNames', 'inputValues']); exact(snapshot.graph, ['nodes', 'wires']);
    const { nodes, wires } = snapshot.graph;
    assert(Array.isArray(nodes) && nodes.length <= 200 && Array.isArray(wires) && wires.length <= 500);
    const nodeMap = new Map(), inputs = new Set(), wireIds = new Set(), ports = new Set(), outgoing = new Map();
    let outputs = 0;
    const graphId = value => { assert(text(value, 120).length > 0 && !forbidden(value)); };
    const position = point => assert(Number.isFinite(point.x) && point.x >= 0 && point.x <= 900 && Number.isFinite(point.y) && point.y >= 0 && point.y <= 520, '回路の座標が範囲外です。');
    for (const node of nodes) {
      assert(object(node) && ['input', 'output', 'AND', 'OR', 'NOT'].includes(node.type));
      exact(node, ['id', 'type', 'x', 'y', ...(['input', 'output'].includes(node.type) ? ['name'] : [])]);
      graphId(node.id); position(node); assert(!nodeMap.has(node.id)); nodeMap.set(node.id, node);
      if (node.type === 'input') { assert(['A', 'B', 'C', 'D'].includes(node.name) && !inputs.has(node.name)); inputs.add(node.name); }
      if (node.type === 'output') { text(node.name, 32); outputs++; }
    }
    assert(outputs && object(snapshot.inputValues) && Array.isArray(snapshot.inputNames));
    const names = ['A', 'B', 'C', 'D'].filter(name => inputs.has(name));
    assert(canonical(snapshot.inputNames) === canonical(names) && canonical(Object.keys(snapshot.inputValues).sort()) === canonical(names));
    names.forEach(name => assert([0, 1].includes(snapshot.inputValues[name])));
    for (const wire of wires) {
      exact(wire, ['id', 'from', 'to', 'port', ...(own(wire || {}, 'bends') ? ['bends'] : [])]);
      [wire.id, wire.from, wire.to].forEach(graphId); assert(!wireIds.has(wire.id)); wireIds.add(wire.id);
      const from = nodeMap.get(wire.from), to = nodeMap.get(wire.to);
      assert(from && to && from.type !== 'output' && to.type !== 'input'); integer(wire.port, 0, ['AND', 'OR'].includes(to.type) ? 1 : 0);
      const key = canonical([wire.to, wire.port]); assert(!ports.has(key)); ports.add(key);
      if (own(wire, 'bends')) {
        assert(Array.isArray(wire.bends) && wire.bends.length >= 2 && wire.bends.length <= 16 && wire.bends.length % 2 === 0);
        wire.bends.forEach((point, i) => { exact(point, ['x', 'y']); position(point); if (i) assert(i % 2 ? point.x === wire.bends[i - 1].x : point.y === wire.bends[i - 1].y); });
      }
      if (!outgoing.has(wire.from)) outgoing.set(wire.from, []); outgoing.get(wire.from).push(wire.to);
    }
    const visiting = new Set(), visited = new Set();
    function visit(key) { assert(!visiting.has(key), '循環する回路は保存できません。'); if (visited.has(key)) return; visiting.add(key); (outgoing.get(key) || []).forEach(visit); visiting.delete(key); visited.add(key); }
    nodeMap.forEach((_, key) => visit(key));
    return snapshot;
  }
  function validateSession(value, keyId) {
    exact(value, ['sessionId', 'appId', 'browserKeyId', 'allowImport', 'recoveryOf', 'baselineHash']);
    id(value.sessionId); assert(value.appId === 'logic' && value.browserKeyId === keyId && typeof value.allowImport === 'boolean', '課題または登録鍵が一致しません。'); decode32(value.browserKeyId);
    if (value.recoveryOf) { id(value.recoveryOf); decode32(value.baselineHash); } else assert(value.recoveryOf === '' && value.baselineHash === '');
    return clone(value);
  }
  function validateWork(work, session, validateDocument = validateLogic) {
    const encoded = canonical(work);
    assert(utf8.encode(encoded).length <= LIMITS.bytes, '履歴を含む作品が6MiBに達しました。提出フォームへ保存し、教員に相談してください。');
    exact(work, ['format', 'version', 'appId', 'sessionId', 'name', 'entries']);
    assert(work.format === FORMAT && work.version === 1 && work.appId === session.appId && work.sessionId === session.sessionId, '別の課題の作品です。');
    assert(text(work.name, 60).trim().length > 0); assert(Array.isArray(work.entries) && work.entries.length >= 1 && work.entries.length <= LIMITS.entries, '履歴は1000件までです。提出フォームへ保存し、教員に相談してください。');
    work.entries.forEach((entry, i) => {
      exact(entry, ['seq', 'action', 'detail', 'at', 'document']); assert(entry.seq === i + 1); text(entry.detail, 256); text(entry.at, 32);
      assert(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(entry.at) && Number.isFinite(Date.parse(entry.at)) && new Date(entry.at).toISOString() === entry.at);
      if (!i) assert(entry.action === (session.recoveryOf ? 'recover' : 'start') || (!session.recoveryOf && session.allowImport && entry.action === 'start-import'));
      else assert(['edit', 'undo', 'redo', 'checkpoint'].includes(entry.action) || (entry.action === 'import' && session.allowImport));
      validateDocument(entry.document);
    });
    return encoded;
  }
  async function inspectWork(raw, session, validator) {
    assert(typeof raw === 'string' && utf8.encode(raw).length <= LIMITS.bytes, '作品は6MiB以内にしてください。');
    const work = JSON.parse(raw); validateWork(work, session, validator);
    if (session.recoveryOf) assert(await sha(canonical(work.entries[0].document)) === session.baselineHash, '復旧元が一致しません。');
    let chain = await sha(canonical(['fm2.editor-lite.history.v1', work.sessionId])); const prefixHashes = [];
    for (const entry of work.entries) { chain = await sha(canonical([chain, entry])); prefixHashes.push(chain); }
    return { work, payloadHash: await sha(raw), historyHash: chain, historyCount: prefixHashes.length, prefixHashes };
  }
  function assertExtends(inspected, head) {
    if (!head) return;
    integer(head.historyCount, 1, LIMITS.entries);
    assert(inspected.historyCount >= head.historyCount && inspected.prefixHashes[head.historyCount - 1] === head.historyHash, '保存済みの履歴と一致しません。元データを保持して教員に相談してください。');
  }
  function append(work, session, action, document, detail = '') {
    const next = { ...work, entries: [...work.entries, { seq: work.entries.length + 1, action, detail, at: new Date().toISOString(), document: clone(document) }] };
    validateWork(next, session); return next;
  }
  function aad(envelope) { return utf8.encode(canonical(['joho.assignment-lite.local.v1', envelope.appId, envelope.sessionId, envelope.browserKeyId])); }
  async function encrypt(data, keys) {
    const envelope = { format: LOCAL, version: 1, appId: 'logic', sessionId: id(data.session.sessionId), browserKeyId: keys.browserKeyId, iv: b64url(random(12)) };
    envelope.ciphertext = b64url(new Uint8Array(await cryptoAPI().subtle.encrypt({ name: 'AES-GCM', iv: decode(envelope.iv), additionalData: aad(envelope), tagLength: 128 }, keys.aes, utf8.encode(canonical(data)))));
    return envelope;
  }
  async function decrypt(envelope, keys, sessionId) {
    canonical(envelope); exact(envelope, ['format', 'version', 'appId', 'sessionId', 'browserKeyId', 'iv', 'ciphertext']);
    assert(envelope.format === LOCAL && envelope.version === 1 && envelope.appId === 'logic' && envelope.sessionId === sessionId && envelope.browserKeyId === keys.browserKeyId, 'この課題・ブラウザの保護ファイルではありません。');
    const iv = decode(envelope.iv, true, 16); assert(iv.length === 12);
    let plain;
    try { plain = await cryptoAPI().subtle.decrypt({ name: 'AES-GCM', iv, additionalData: aad(envelope), tagLength: 128 }, keys.aes, decode(envelope.ciphertext)); }
    catch (_) { throw new Error('保護ファイルを開けません。鍵の消失・別ブラウザ・データ破損の可能性があります。'); }
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(plain));
  }
  async function submissionHash(payload) {
    canonical(payload); const body = Object.fromEntries(Object.entries(payload).filter(([key]) => key !== 'editorProof'));
    const raw = canonical(body); assert(utf8.encode(raw).length <= LIMITS.bytes * 2, '提出フォーム全体は12MiB以内にしてください。'); return sha(raw);
  }
  return Object.freeze({ FORMAT, LOCAL, LIMITS, assert, exact, text, id, integer, canonical, clone, b64, b64url, decode, decode32, utf8, random, requestId,
    sha, route, transcript, sign, createKeys, validateLogic, validateSession, validateWork, inspectWork, assertExtends, append, encrypt, decrypt, submissionHash });
});
