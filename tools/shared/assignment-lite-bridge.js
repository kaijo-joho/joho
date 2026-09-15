/* 信頼先は配付コードで固定する。URLにあるoriginや任意のpostMessageを信用しない。 */
(function (root) {
  'use strict';
  const P = root.JohoAssignmentLite;
  const TO_FM2 = Object.freeze(['register-key', 'challenge', 'start', 'checkpoint', 'resume', 'prepare-submit']);
  const TO_EDITOR = Object.freeze(['sign-submit', 'submission-result', 'close']);
  const REQUEST = 'joho.assignment-lite.request', RESPONSE = 'joho.assignment-lite.response';
  function create({ peer, origin, trustedOrigins, nonce, role = 'editor', host = root, timeout = 20000, onRequest = async () => { throw new Error(); } }) {
    P.assert(peer && peer !== host && typeof peer.postMessage === 'function', '接続元の画面を確認できません。');
    P.assert(Array.isArray(trustedOrigins) && trustedOrigins.includes(origin) && new URL(origin).origin === origin && new URL(origin).protocol === 'https:', '信頼済みのHTTPS接続先ではありません。');
    P.assert(P.decode(nonce, true, 32).length === 24, '接続確認値が不正です。');
    P.assert(['editor', 'fm2'].includes(role));
    const outbound = role === 'editor' ? TO_FM2 : TO_EDITOR, inbound = role === 'editor' ? TO_EDITOR : TO_FM2;
    const pending = new Map(), received = new Map(); let closed = false;
    function send(value) { peer.postMessage(value, origin); }
    async function listener(event) {
      if (closed || event.source !== peer || event.origin !== origin) return;
      const data = event.data;
      if (!data || data.nonce !== nonce || data.version !== 1 || ![REQUEST, RESPONSE].includes(data.type)) return;
      try {
        P.id(data.requestId); P.assert(P.utf8.encode(P.canonical(data)).length <= P.LIMITS.bytes * 2 + 8192);
        if (data.type === RESPONSE) {
          P.exact(data, ['type', 'version', 'nonce', 'requestId', 'operation', 'ok', ...(data.ok === true ? ['result'] : ['error'])]);
          P.assert(typeof data.ok === 'boolean');
          const match = pending.get(data.requestId); if (!match || data.operation !== match.operation) return;
          clearTimeout(match.timer); pending.delete(data.requestId);
          if (data.ok) match.resolve(data.result);
          else match.reject(new Error('提出フォームで操作を完了できませんでした。提出フォームの画面を確認し、同じ操作を再試行してください。'));
          return;
        }
        P.exact(data, ['type', 'version', 'nonce', 'requestId', 'operation', 'payload']); P.assert(inbound.includes(data.operation));
        // 登録用の鍵素材や本文を応答キャッシュへ平文で保持しない。
        const fingerprint = await P.sha(P.canonical([data.operation, data.payload]));
        const previous = received.get(data.requestId);
        if (previous) { if (previous.fingerprint === fingerprint) send(await previous.response); return; }
        // セッション内の応答キャッシュを制限。古い要求を再実行するためには捨てない。
        P.assert(received.size < 1200, '接続要求の上限です。再接続してください。');
        const response = Promise.resolve().then(() => onRequest(data.operation, P.clone(data.payload), data.requestId)).then(result => ({
          type: RESPONSE, version: 1, nonce, requestId: data.requestId, operation: data.operation, ok: true, result
        }), () => ({ type: RESPONSE, version: 1, nonce, requestId: data.requestId, operation: data.operation, ok: false, error: { message: '操作を確認できません。エディタと提出フォームの表示を確認してください。' } }));
        received.set(data.requestId, { fingerprint, response }); send(await response);
      } catch (_) { /* 不正・他画面・相関しない要求には応答しない。 */ }
    }
    host.addEventListener('message', listener);
    return Object.freeze({
      request(operation, payload) {
        P.assert(!closed && outbound.includes(operation), '許可されていない通信です。');
        const data = { type: REQUEST, version: 1, nonce, requestId: P.requestId(), operation, payload: P.clone(payload) };
        P.assert(P.utf8.encode(P.canonical(data)).length <= P.LIMITS.bytes * 2 + 8192, '通信内容が大きすぎます。');
        return new Promise((resolve, reject) => {
          const timer = setTimeout(() => { pending.delete(data.requestId); reject(new Error('提出フォームの応答を確認できません。送信内容を保持しています。同じ操作を再試行してください。')); }, timeout);
          pending.set(data.requestId, { operation, resolve, reject, timer }); send(data);
        });
      },
      close() { closed = true; host.removeEventListener('message', listener); pending.forEach(value => { clearTimeout(value.timer); value.reject(new Error('提出フォームとの接続を閉じました。')); }); pending.clear(); received.clear(); }
    });
  }
  root.JohoAssignmentLiteBridge = Object.freeze({ create, TO_FM2, TO_EDITOR });
})(globalThis);
