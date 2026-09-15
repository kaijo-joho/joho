/* TEST ONLY. 合成課題の通信相手。実fm2の認証・権限検証を代替しない。 */
(function (root) {
  const P = root.JohoAssignmentLite;
  class MockFm2 {
    constructor({ allowImport = false } = {}) { this.allowImport = allowImport; this.head = null; this.raw = null; this.calls = []; this.receipts = new Map(); this.challenges = new Set(); }
    async request(operation, data) {
      this.calls.push({ operation, data: P.clone(data) });
      if (operation === 'register-key') {
        P.assert(await P.sha(P.decode32(data.keyMaterial)) === data.browserKeyId);
        this.keys = await crypto.subtle.importKey('raw', P.decode32(data.keyMaterial), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
        return { ok: true, browserKeyId: data.browserKeyId, registered: true };
      }
      if (operation === 'challenge') {
        const challenge = [...P.random(32)].map(value => value.toString(16).padStart(2, '0')).join(''); this.challenges.add(challenge);
        return { ok: true, challenge, expiresInSeconds: 120 };
      }
      if (operation === 'prepare-submit') { this.prepared = P.clone(data); return { received: true, prepareId: data.prepareId, submitted: false }; }
      const purpose = operation;
      const payloadHash = purpose === 'checkpoint' ? await P.sha(data.workText) : await P.sha('');
      const expected = await P.sign(this.keys, { purpose, bookId: data.bookId, pid: data.pid, itemId: data.itemId,
        sessionId: purpose === 'start' ? '' : data.sessionId, browserKeyId: data.browserKeyId, requestId: data.requestId,
        revision: data.revision, payloadHash, challenge: data.challenge || '' });
      P.assert(data.mac === expected, 'mock HMAC mismatch');
      if (purpose === 'start' || purpose === 'resume') { P.assert(this.challenges.delete(data.challenge)); }
      if (purpose === 'start') {
        this.session ||= { sessionId: 'synthetic_session', appId: 'logic', browserKeyId: data.browserKeyId, allowImport: this.allowImport, recoveryOf: '', baselineHash: '' };
        P.assert(this.session.browserKeyId === data.browserKeyId);
        return { ok: true, session: P.clone(this.session), checkpoint: P.clone(this.head) };
      }
      if (purpose === 'resume') return { ok: true, session: P.clone(this.session), checkpoint: P.clone(this.head), work: this.raw ? JSON.parse(this.raw) : null,
        ...(this.recoveryDocument ? { recoveryDocument: this.recoveryDocument, recoveryName: '復旧の合成回路' } : {}) };
      const inspected = await P.inspectWork(data.workText, this.session); P.assertExtends(inspected, this.head);
      const prior = this.receipts.get(data.requestId);
      if (prior) { P.assert(prior.payloadHash === payloadHash); return P.clone(prior); }
      P.assert(data.revision === (this.head?.revision || 0), 'mock stale revision');
      this.raw = data.workText;
      this.head = { ok: true, checkpointId: 'synthetic_cp_' + (data.revision + 1), sessionId: this.session.sessionId, revision: data.revision + 1,
        payloadHash, historyCount: inspected.historyCount, historyHash: inspected.historyHash, savedAt: new Date().toISOString(), submitted: false };
      this.receipts.set(data.requestId, P.clone(this.head));
      if (this.loseNextResponse) { this.loseNextResponse = false; throw new Error('合成テスト：応答喪失'); }
      return P.clone(this.head);
    }
  }
  root.AssignmentLiteMock = MockFm2;
})(globalThis);
