/* fm2の認証済み画面を介するクライアント。ネットワーク入口は注入した固定RPCだけ。 */
(function (root) {
  'use strict';
  const P = root.JohoAssignmentLite;
  class Client {
    constructor({ request, vault = new root.JohoAssignmentLiteStore.Vault(), onState = () => {} }) {
      this.request = request; this.vault = vault; this.onState = onState;
      this.queue = Promise.resolve(); this.token = null; this.pending = null; this.receipt = null;
      this.saving = 0; this.busy = false; this.frozen = null; this.submitted = false; this.localSavedAt = ''; this.localError = '';
    }
    get locked() { return this.busy || Boolean(this.preparing || this.pending || this.frozen || this.localError); }
    get document() { return P.clone(this.work.entries.at(-1).document); }
    get raw() { return P.canonical(this.work); }
    changed() { this.onState(this); }
    validateReceipt(receipt) {
      if (receipt === null) return null;
      P.exact(receipt, ['ok', 'checkpointId', 'sessionId', 'revision', 'payloadHash', 'historyCount', 'historyHash', 'savedAt', 'submitted']);
      P.assert(receipt.ok === true && receipt.submitted === false && receipt.sessionId === this.session.sessionId, '途中保存の受領情報が不正です。');
      P.id(receipt.checkpointId); P.integer(receipt.revision, 1, 1000000); P.integer(receipt.historyCount, 1, 1000);
      P.decode32(receipt.payloadHash); P.decode32(receipt.historyHash); P.text(receipt.savedAt, 64); P.assert(Number.isFinite(Date.parse(receipt.savedAt)));
      return P.clone(receipt);
    }
    async proof(purpose, requestId, revision, payloadHash, challenge = '') {
      return P.sign(this.keys.hmac, { ...this.route, purpose, requestId, revision, payloadHash, challenge,
        sessionId: purpose === 'start' ? '' : this.session.sessionId, browserKeyId: this.keys.browserKeyId });
    }
    async authenticate(purpose, revision = 0) {
      const requestId = P.requestId();
      const data = { ...this.route, browserKeyId: this.keys.browserKeyId, requestId, ...(purpose === 'resume' ? { sessionId: this.session.sessionId } : {}) };
      const response = await this.request('challenge', { ...data, purpose });
      P.assert(response?.ok === true && response.expiresInSeconds === 120 && /^[a-f0-9]{64}$/.test(response.challenge), '提出フォームでの確認に必要な情報を取得できません。');
      return this.request(purpose, { ...data, revision, challenge: response.challenge, mac: await this.proof(purpose, requestId, revision, await P.sha(''), response.challenge) });
    }
    async start(route, document, name = '課題の回路') {
      P.assert(!this.work, '課題は既に開始しています。'); this.busy = true; this.route = P.route(route); this.changed();
      this.token = null; this.pending = null;
      try {
        this.keys = await this.vault.identity();
        if (this.vault.material) {
          const registered = await this.request('register-key', { ...this.route, browserKeyId: this.keys.browserKeyId, keyMaterial: this.vault.material });
          P.assert(registered?.ok === true && registered.browserKeyId === this.keys.browserKeyId && typeof registered.registered === 'boolean', '鍵の登録結果を確認できません。');
          this.vault.forgetMaterial();
        }
        const started = await this.authenticate('start');
        P.assert(started?.ok === true, '課題を開始できません。');
        this.session = P.validateSession(started.session, this.keys.browserKeyId);
        this.receipt = this.validateReceipt(started.checkpoint);
        let remote = null, recoveryDocument = null, recoveryName = name;
        if (this.receipt || this.session.recoveryOf) {
          const resumed = await this.authenticate('resume', this.receipt?.revision || 0);
          P.assert(resumed?.ok === true && P.canonical(resumed.session) === P.canonical(this.session), '再開する課題が一致しません。');
          this.receipt = this.validateReceipt(resumed.checkpoint);
          if (resumed.work) {
            remote = await P.inspectWork(P.canonical(resumed.work), this.session); P.assertExtends(remote, this.receipt);
            P.assert(remote.historyCount === this.receipt.historyCount);
          } else { recoveryDocument = resumed.recoveryDocument; recoveryName = resumed.recoveryName; }
        }
        const stored = await this.vault.load(this.session.sessionId);
        if (stored) {
          const data = await this.readEnvelope(stored.envelope);
          const inspected = await P.inspectWork(data.workText, this.session); P.assertExtends(inspected, this.receipt);
          this.work = inspected.work; this.token = stored.token;
          if (data.pending) {
            // 応答を失っても、同じID・同じbyte列でのみ再送する。
            if (this.receipt?.revision === data.pending.revision + 1 && this.receipt.payloadHash === data.pending.payloadHash) this.pending = null;
            else {
              P.assert((this.receipt?.revision || 0) === data.pending.revision, '別の保存が先に進んでいます。教員に相談してください。');
              this.pending = data.pending;
            }
          }
        } else if (remote) this.work = remote.work;
        else {
          const first = this.session.recoveryOf ? recoveryDocument : document;
          P.validateLogic(first);
          this.work = { format: P.FORMAT, version: 1, appId: 'logic', sessionId: this.session.sessionId,
            name: this.session.recoveryOf ? recoveryName : name, entries: [] };
          this.work = P.append(this.work, this.session, this.session.recoveryOf ? 'recover' : 'start', first);
          await P.inspectWork(this.raw, this.session);
        }
        await this.persist();
      } catch (error) { this.work = null; throw error; }
      finally { this.busy = false; this.changed(); }
      return this.document;
    }
    data() { return { route: this.route, session: this.session, workText: this.raw, pending: this.pending }; }
    async readEnvelope(envelope) {
      const data = await P.decrypt(envelope, this.keys, this.session.sessionId);
      P.canonical(data); P.exact(data, ['route', 'session', 'workText', 'pending']);
      P.assert(P.canonical(data.route) === P.canonical(this.route) && P.canonical(data.session) === P.canonical(this.session), '保存された課題設定が一致しません。');
      const inspected = await P.inspectWork(data.workText, this.session);
      if (data.pending !== null) {
        P.exact(data.pending, ['requestId', 'revision', 'payloadHash']); P.id(data.pending.requestId); P.integer(data.pending.revision, 0, 999999);
        P.assert(inspected.payloadHash === data.pending.payloadHash, '再送待ちの内容が一致しません。');
      }
      return data;
    }
    persist() {
      const data = P.clone(this.data()); this.saving++; this.changed();
      const job = this.queue.catch(() => {}).then(async () => {
        const saved = await this.vault.save(data, this.keys, this.token);
        this.token = saved.token; this.localSavedAt = new Date().toISOString(); this.localError = ''; return saved.envelope;
      }).catch(error => { this.localError = error.message; throw error; }).finally(() => { this.saving--; this.changed(); });
      this.queue = job; return job;
    }
    record(action, document, detail = '') {
      P.assert(this.work && !this.locked, '送信・確認中です。途中保存の再試行、または提出待ちの解除後に編集してください。');
      if (action !== 'import' && P.canonical(document) === P.canonical(this.document)) return false;
      this.work = P.append(this.work, this.session, action, document, detail.slice(0, 256)); this.submitted = false;
      this.persist().catch(() => {}); this.changed(); return true;
    }
    async backup() {
      P.assert(this.work);
      // 容量不足・別タブ衝突時も、現在のメモリ内作品を暗号ファイルへ退避できる。
      // ブラウザ保存成功とは表示しない。平文へのフォールバックもしない。
      await this.queue.catch(() => {});
      return P.encrypt(this.data(), this.keys);
    }
    async importBackup(envelope) {
      P.assert(!this.locked); const data = await this.readEnvelope(envelope);
      // 過去のファイルを開いても、現在の履歴を巻き戻さず「読み込み」を1操作として追記。
      P.assertExtends(await P.inspectWork(data.workText, this.session), this.receipt);
      return this.record('edit', JSON.parse(data.workText).entries.at(-1).document, '同じ課題の保護ファイルから読み込み');
    }
    async checkpoint() {
      P.assert(this.work && !this.busy && !this.frozen, '送信・提出確認中です。'); this.busy = true; this.changed();
      try {
        const raw = this.raw, inspected = await P.inspectWork(raw, this.session); P.assertExtends(inspected, this.receipt);
        if (!this.pending) this.pending = { requestId: P.requestId(), revision: this.receipt?.revision || 0, payloadHash: inspected.payloadHash };
        P.assert(this.pending.payloadHash === inspected.payloadHash); await this.persist();
        const { requestId, revision } = this.pending;
        const result = await this.request('checkpoint', { ...this.route, sessionId: this.session.sessionId, browserKeyId: this.keys.browserKeyId,
          requestId, revision, workText: raw, mac: await this.proof('checkpoint', requestId, revision, inspected.payloadHash) });
        const receipt = this.validateReceipt(result);
        P.assert(receipt && receipt.revision === revision + 1 && receipt.payloadHash === inspected.payloadHash && receipt.historyHash === inspected.historyHash && receipt.historyCount === inspected.historyCount, '送った作品と受領情報が一致しません。');
        this.receipt = receipt; this.pending = null; await this.persist(); return receipt;
      } finally { this.busy = false; this.changed(); }
    }
    async prepareSubmit() {
      P.assert(!this.busy);
      this.preparing = true; this.changed();
      try {
        if (!this.frozen) {
          await this.checkpoint();
          const raw = this.raw;
          P.assert(await P.sha(raw) === this.receipt.payloadHash);
          this.submitted = false;
          this.frozen = { prepareId: P.requestId(), sessionId: this.session.sessionId, browserKeyId: this.keys.browserKeyId,
            revision: this.receipt.revision, receipt: P.clone(this.receipt), route: this.route,
            file: { itemId: this.route.itemId, name: 'circuit.assignment-lite.json', mimeType: 'application/json', size: P.utf8.encode(raw).length, base64: P.b64(P.utf8.encode(raw)) } };
          this.signatures = new Map();
        }
        this.busy = true; this.changed();
        const response = await this.request('prepare-submit', P.clone(this.frozen));
        P.assert(response?.received === true && response.prepareId === this.frozen.prepareId && response.submitted === false, '提出フォームへの受け渡しを確認できません。');
        return response;
      } finally { this.busy = false; this.preparing = false; this.changed(); }
    }
    cancelPrepare() { P.assert(!this.busy); this.frozen = null; this.signatures = new Map(); this.changed(); }
    async handle(operation, data) {
      if (operation === 'close') {
        // fm2から通常モードへ勝手に戻さず、暗号保存して接続状態だけを知らせる。
        await this.persist(); this.disconnected = true; this.changed(); return { closed: true };
      }
      const frozen = this.frozen;
      P.assert(frozen && data.prepareId === frozen.prepareId, '提出準備が一致しません。');
      if (operation === 'submission-result') {
        P.exact(data, ['prepareId', 'requestId', 'submitted', 'attemptId']); P.id(data.requestId);
        P.assert(this.signatures.get(data.requestId)?.proof, '確認していない提出結果です。');
        P.assert(typeof data.submitted === 'boolean');
        if (data.submitted) { P.id(data.attemptId); this.submitted = true; this.frozen = null; }
        else P.assert(data.attemptId === '');
        this.changed(); return { received: true };
      }
      P.assert(operation === 'sign-submit'); P.exact(data, ['prepareId', 'sessionId', 'revision', 'payload']);
      P.assert(data.sessionId === frozen.sessionId && data.revision === frozen.revision, '提出世代が一致しません。');
      const payload = P.clone(data.payload);
      P.assert(!Object.hasOwn(payload, 'editorProof') && payload.bookId === this.route.bookId && payload.pid === this.route.pid, '提出先が一致しません。');
      if (Object.hasOwn(payload, 'itemId')) P.assert(payload.itemId === this.route.itemId);
      P.id(payload.requestId); P.assert(Array.isArray(payload.files));
      const matches = payload.files.filter(file => file?.itemId === this.route.itemId);
      P.assert(matches.length === 1 && P.canonical(matches[0]) === P.canonical(frozen.file), '提出ファイルが途中保存した作品と一致しません。');
      const hash = await P.submissionHash(payload), previous = this.signatures.get(payload.requestId);
      P.assert(this.frozen === frozen && (!previous || previous.hash === hash), '同じ提出IDの内容が変わりました。');
      if (previous) return P.clone(await previous.promise);
      P.assert(this.signatures.size < 100, '提出確認の上限です。');
      const record = { hash };
      record.promise = this.proof('submit', payload.requestId, frozen.revision, hash).then(mac => {
        P.assert(this.frozen === frozen, '提出待ちが解除されました。');
        record.proof = { itemId: this.route.itemId, sessionId: frozen.sessionId, browserKeyId: this.keys.browserKeyId, revision: frozen.revision, mac };
        return record.proof;
      });
      this.signatures.set(payload.requestId, record); return P.clone(await record.promise);
    }
  }
  root.JohoAssignmentLiteClient = Object.freeze({ Client });
})(globalThis);
