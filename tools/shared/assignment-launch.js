// fm2等の認証済み画面との一回限りの受け渡し。常設リスナーや自動起動はしない。
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.JohoAssignmentLaunch = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  function receive({ client, sourceWindow, sourceOrigin, eventTarget = globalThis.window,
    crypto = globalThis.crypto, timeoutMs = 15000, signal }) {
    return (async () => {
      let origin;
      try { origin = new URL(sourceOrigin); } catch (_) { throw new Error('fm2の送信元設定が不正です。'); }
      if (origin.protocol !== 'https:' || origin.origin !== sourceOrigin || !sourceWindow
        || typeof sourceWindow.postMessage !== 'function' || !eventTarget
        || !client || typeof client.prepareBrowser !== 'function' || typeof client.verifyGrant !== 'function'
        || !Number.isSafeInteger(timeoutMs) || timeoutMs < 500 || timeoutMs > 60000) {
        throw new Error('信頼する送信元・ウィンドウ・検証処理の設定が必要です。');
      }
      if (signal && signal.aborted) throw new Error('課題の開始を取り消しました。');
      const registration = await client.prepareBrowser();
      if (signal && signal.aborted) throw new Error('課題の開始を取り消しました。');
      const nonce = Array.from(crypto.getRandomValues(new Uint8Array(24)), value => value.toString(16).padStart(2, '0')).join('');
      return new Promise((resolve, reject) => {
        let finished = false, verifying = false;
        const cleanup = () => {
          clearTimeout(timer);
          eventTarget.removeEventListener('message', onMessage);
          if (signal) signal.removeEventListener('abort', onAbort);
        };
        const finish = (error, value) => {
          if (finished) return;
          finished = true; cleanup();
          if (error) reject(error); else resolve(value);
        };
        const onAbort = () => finish(new Error('課題の開始を取り消しました。'));
        const onMessage = async event => {
          // originだけでは、同じホスティングサービスの別アプリを排除できない。
          // 既知のWindow参照・nonce・署名・ブラウザ鍵との紐付けをすべて検査する。
          if (event.origin !== sourceOrigin || event.source !== sourceWindow || finished || verifying) return;
          const data = event.data;
          if (!data || data.type !== 'joho.assignment.launch' || data.nonce !== nonce) return;
          if (Array.isArray(data) || data.version !== 1 || Object.keys(data).sort().join(',') !== 'grant,nonce,type,version'
            || typeof data.grant !== 'string' || data.grant.length > 16384) {
            finish(new Error('課題の開始情報が不正です。')); return;
          }
          verifying = true;
          try {
            const claims = await client.verifyGrant(data.grant);
            if (claims.browserKeyId !== registration.browserKeyId) throw new Error('課題の開始情報がこのブラウザに対応していません。');
            finish(null, { grant: data.grant, claims });
          } catch (error) { finish(error); }
        };
        const timer = setTimeout(() => finish(new Error('fm2との接続を確認できません。fm2から開き直してください。')), timeoutMs);
        eventTarget.addEventListener('message', onMessage);
        if (signal) signal.addEventListener('abort', onAbort, { once: true });
        try {
          sourceWindow.postMessage({ type: 'joho.assignment.ready', version: 1, nonce, ...registration }, sourceOrigin);
        } catch (_) { finish(new Error('fm2へ開始情報を送れませんでした。')); }
      });
    })();
  }
  return Object.freeze({ receive });
});
