import { questionKey } from './core.mjs';
import { toolsStoreConfig } from './tools-store-config.mjs?v=20261017-save-events1';
import { ToolsBridge, ToolsStoreClient, DraftAutosave, validateConnection, gasURL, authErrors } from './tools-store.mjs?v=20261017-save-events1';
import { ConfirmationCloudClient, ConfirmationSync } from './confirmation-cloud.mjs?v=20261017-save-events1';
const $ = id => document.getElementById(id);
const date = value => new Date(value).toLocaleString('ja-JP');
const CACHE = 'joho.pythoneditor.tools-connection.v1.';

export class ToolsDraftPanel {
  constructor(host, render, options = {}) {
    this.host = host; this.update = render; this.options = options; this.loads = new Map(); this.conflicts = new Map(); this.generation = 0;
    $('tools-connect-retry').addEventListener('click', () => $('cloud-connect').click());
    $('tools-connect-dialog').addEventListener('cancel', () => this.connectBridge?.dispose());
    $('tools-connect-dialog').addEventListener('close', () => { this.connectBridge?.dispose(); $('cloud-connect').focus(); this.showConflict(); });
    $('cloud-conflict').addEventListener('close', () => { this.conflict = null; });
    $('confirmation-cloud-local').addEventListener('click', () => this.resolveConfirmation('local'));
    $('confirmation-cloud-remote').addEventListener('click', () => this.resolveConfirmation('cloud'));
    $('confirmation-cloud-conflict').addEventListener('close', () => { if (this.confirmationOpener?.isConnected) this.confirmationOpener.focus(); });
    for(const id of ['cloud-dialog','cloud-conflict'])$(id).addEventListener('close',()=>{if(this.opener?.isConnected)this.opener.focus();});
    addEventListener('online', () => { if (this.auto?.connected) { for (const s of this.auto.slots.values()) if (s.status === 'retry') s.retryAt = 0; this.auto.schedule(); } if (this.confirmation?.connected) this.confirmation.flush().catch(e => this.fail(e)); });
    addEventListener('pagehide', () => { this.auto?.dispose(); this.confirmation?.dispose(); this.bridge?.dispose(); this.connectBridge?.dispose(); });
  }
  storageWarning() { this.localWarning = true; this.update(); }
  storage() { return this.options?.storage || localStorage; }
  cache(connection) {
    try { const storage = this.storage(); storage.setItem(CACHE + connection.actorKey, JSON.stringify(connection)); storage.setItem(CACHE + 'last', connection.actorKey); }
    catch { this.storageWarning(); }
  }
  async resume() {
    let cached;
    try { const storage = this.storage(), key = storage.getItem(CACHE + 'last'); if (key) cached = validateConnection(JSON.parse(storage.getItem(CACHE + key))); } catch { return; }
    if (!cached) return;
    try { await this.attach(cached); } catch (e) { this.fail(e); }
  }
  async connect() {
    const dialog = $('tools-connect-dialog'); if (!dialog.open) dialog.showModal();
    $('tools-connect-status').textContent = '学校アカウントと保存先を確認しています…';
    $('tools-connect-frame').replaceChildren(); $('tools-connect-retry').disabled = true;
    const channel = crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', '');
    $('tools-login').href = gasURL(toolsStoreConfig.distURL, location.origin, channel, 'dist');
    this.connectBridge?.dispose();
    this.connectBridge = new ToolsBridge(toolsStoreConfig.distURL, { mode: 'dist' });
    try {
      const connection = validateConnection(await this.connectBridge.connect($('tools-connect-frame')));
      $('tools-store-login').href=gasURL(connection.storeURL,location.origin,channel,'store');$('tools-store-login').hidden=false;
      if (this.client && this.client.session.actorKey !== connection.actorKey && this.unsaved())
        throw new Error('前のアカウントの未保存内容があります。元の学校アカウントへ再接続して保存してください。コードと送信番号は保持しています。');
      let previous;
      try { previous = this.storage().getItem(CACHE + 'last'); } catch {}
      if (previous && previous !== connection.actorKey) {
        if (!confirm('接続する学校アカウントが変わります。ブラウザのコード・試行・回答を、新しいアカウントの保存先へ引き継ぎますか？')) throw new Error('アカウントの切り替えを中止しました。記録は保持しています。');
        this.host.archiveEntries('学校アカウント切り替え前');
        this.host.confirmationStore.backup('学校アカウント切り替え前');
      }
      if (!await this.attach(connection)) return; dialog.close();
      this.host.notice('学校アカウントに接続しました。対応する保存先では、コードと確認記録をクラウドへ自動保存します。正式提出は別の操作です。');
    } catch (e) { $('tools-connect-status').textContent = e.message; throw e; }
    finally { $('tools-connect-retry').disabled = false; }
  }
  async attach(connection) {
    const generation = ++this.generation;
    this.connected = false; if (this.auto) this.auto.connected = false; this.confirmation?.dispose(); this.update();
    const bridge = this.options?.bridgeFactory ? this.options.bridgeFactory(connection) : new ToolsBridge(connection.storeURL, { binding: connection.binding });
    let session;
    try { session = await bridge.connect(); } catch (e) { bridge.dispose(); if (generation !== this.generation) return false; throw e; }
    if (generation !== this.generation) { bridge.dispose(); return false; }
    if (session.account !== connection.account || session.actorKey !== connection.actorKey || session.spreadsheetId !== connection.spreadsheetId || session.schemaVersion !== 1) {
      bridge.dispose(); throw new Error('学校アカウントと保存先が一致しません。再接続してください。');
    }
    if (this.client && this.client.session.actorKey !== session.actorKey) {
      for (const {draft} of this.conflicts.values()) this.host.archive({ ...draft, practiced: false }, '学校アカウント切り替え前のクラウド競合');
      this.conflicts.clear(); this.conflict = null;
      $('cloud-conflict').close(); $('confirmation-cloud-conflict').close();
    }
    this.bridge?.dispose(); this.bridge = bridge;
    let storage;try{storage=this.storage();}catch{this.storageWarning();}
    // コードと確認記録のRPCを同じ列で送る。1人の保存処理を重ねない。
    let rpcQueue = Promise.resolve();
    const rpc = (...args) => { const task = rpcQueue.then(() => bridge.call(...args)); rpcQueue = task.catch(() => {}); return task; };
    const client = new ToolsStoreClient(rpc, session, storage, { warn: () => this.storageWarning() });
    if (this.auto && this.client.session.actorKey === client.session.actorKey) this.auto.reconnect(client);
    else {
      this.auto?.dispose();
      this.auto = new DraftAutosave(client, { ...toolsStoreConfig.autosave, changed: () => this.update(),
        conflict: (q, draft) => { this.conflicts.set(questionKey(q), { q, draft }); this.showConflict(); }, failed: e => this.fail(e) });
    }
    this.client = client; this.connected = true; this.loads.clear(); this.cache(connection); this.update();
    if (session.confirmationJournal?.enabled) {
      const confirmationClient = new ConfirmationCloudClient((...args) => client.call(...args), session, storage, { warn: () => this.storageWarning() });
      try {
        if (this.confirmation && this.confirmation.client.session.actorKey === session.actorKey && this.confirmation.client.session.spreadsheetId === session.spreadsheetId) await this.confirmation.reconnect(confirmationClient);
        else {
          this.confirmation?.dispose();
          this.confirmation = new ConfirmationSync(this.host.confirmationStore, confirmationClient, { ...toolsStoreConfig.autosave,
            changed: () => this.update(), conflict: () => this.showConfirmationConflict(), failed: e => this.fail(e) });
          await this.confirmation.connect();
        }
      } catch (e) { if (generation === this.generation) this.fail(e); }
    } else { this.confirmation?.dispose(); this.confirmationUnavailable = true; }
    if (session.confirmationJournal?.enabled) this.confirmationUnavailable = false;
    if (generation !== this.generation) return false;
    for (const { q, entry } of this.host.draftEntries()) if (entry.updatedAt) this.auto.edit(q, entry);
    if (generation === this.generation && this.host.question()) await this.selected(this.host.question());
    return generation === this.generation;
  }
  fail(e) {
    if (authErrors.has(e.code) || e.code === 'disconnected') { this.connected = false; if (this.auto) this.auto.connected = false; }
    this.lastError = e.message; this.update();
  }
  edited(entry) {
    if (!this.connected || this.importing) return;
    const q = this.host.findQuestion(entry); if (q) this.auto.edit(q, entry);
  }
  selected(q) {
    if (!this.connected || this.importing || q.kind === 'observation' || q.kind === 'confirmation') return Promise.resolve();
    const key = questionKey(q); if (this.loads.has(key)) return this.loads.get(key);
    const generation = this.generation;
    const task = this.auto.inspect(q, this.host.entry(q)).catch(e => { if (generation === this.generation) this.fail(e); }).finally(() => { if (this.loads.get(key) === task) this.loads.delete(key); });
    this.loads.set(key, task); return task;
  }
  async save() {
    const q = this.host.question(); if (!q || !this.connected) return;
    return this.saveAll(q, this.host.entry(q));
  }
  async saveAll(q, entry) {
    const generation = this.generation;
    if (!this.connected) return { connected: false, saved: false };
    // 切替元は呼出側が固定する。待機後の選択中の問題で差し替えない。
    if (q?.kind === 'code' && entry?.updatedAt) this.auto.edit(q, entry);
    await this.host.pendingRecords?.();
    await Promise.all([...this.loads.values()]);
    if (generation !== this.generation || !this.connected) return { connected: false, saved: false };
    const code = await this.auto.flush();
    if (generation !== this.generation || !this.connected) return { connected: false, saved: false };
    let confirmation;
    if (this.confirmation) confirmation = await this.confirmation.flush({ force: true });
    this.update(); this.showConflict(); this.showConfirmationConflict();
    const journal = this.host.confirmationStore?.snapshot();
    const missingConfirmation = this.confirmationUnavailable && journal && (journal.trials.length || Object.keys(journal.responses).length);
    const blocked = status => ['conflict', 'auth', 'error', 'retry', 'loading', 'saving'].includes(status);
    const saved = generation === this.generation && this.connected && code.saved && !this.auto.unsaved() &&
      !code.statuses.some(state => blocked(state.status)) && !missingConfirmation &&
      (!this.confirmation || !this.confirmation.unsaved() && !blocked(confirmation?.status));
    return { connected: this.connected && generation === this.generation, saved: !!saved };
  }
  confirmationsEdited() { this.confirmation?.edit(); }
  unsaved() { return this.auto?.unsaved() || this.confirmation?.unsaved() || false; }
  status(q) { return q?.kind === 'confirmation' ? this.confirmation?.state() : q && this.auto?.state(q); }
  badge(q) {
    const state = this.status(q);
    if (['conflict', 'auth', 'error', 'retry'].includes(state?.status)) return { text: '⚠', label: state.status === 'conflict' ? 'クラウドの続きと競合しています' : 'クラウドへの保存を確認してください' };
    return null;
  }
  render() {
    const q = this.host.question(), state = this.status(q);
    $('cloud-account').textContent = this.connected ? this.client.session.account : this.client ? '学校アカウントへ再接続してください' : '未接続';
    const messages = { waiting: 'クラウド保存待ち', saving: 'クラウドに保存中…', saved: 'クラウドに保存済み', conflict: '⚠ 続きを選んでください', retry: '⚠ 通信を確認して自動再試行', auth: '⚠ 学校アカウントへ再接続', error: '⚠ クラウド保存を確認してください', new: 'クラウドに未保存' };
    messages.loading='確認記録をクラウドと照合中…';
    $('cloud-save-status').textContent = this.connected ? messages[state?.status] || 'クラウドへ自動保存します' : this.client ? (this.lastError||'接続を確認できません。')+' 学校アカウントへ再接続してください。' : this.lastError || '学校アカウントに接続するとクラウドへ自動保存します';
    if (q?.kind === 'confirmation' && (!this.confirmation || this.confirmationUnavailable)) $('cloud-save-status').textContent = this.connected ? 'この保存先は確認記録の保存準備待ちです。試行・回答はブラウザと保存ファイルに保持します。' : '試行・回答はブラウザと保存ファイルに保持します。';
    const confirmation = this.confirmation?.state();
    if (q?.kind !== 'confirmation' && confirmation?.dirty) $('cloud-save-status').textContent += ` ／ 確認記録：${messages[confirmation.status] || '保存を確認してください'}`;
    const danger = !!state?.paused || ['retry','error','auth','conflict'].includes(state?.status) || !!confirmation?.dirty && ['retry','error','auth','conflict'].includes(confirmation.status);
    $('cloud-save-status').classList.toggle('danger', danger);
    $('cloud-inline-status').hidden=false;$('cloud-inline-status').textContent=$('cloud-save-status').textContent;
    $('cloud-inline-status').classList.toggle('danger', danger);
    $('cloud-storage-warning').hidden = !this.localWarning;
    $('cloud-pending').textContent = this.unsaved() ? '送信待ちのコードまたは確認記録があります。作業終了時は「クラウドに保存済み」を確認してください。' : '';
  }
  showConflict() {
    if (this.confirmation?.state().status === 'conflict') { this.showConfirmationConflict(); return; }
    if (this.conflict || !$('tools-connect-dialog').open && document.querySelector('dialog[open]')) return;
    const conflict = this.conflicts.values().next().value; if (!conflict) return;
    if ($('tools-connect-dialog').open) return;
    this.conflict = conflict;
    $('conflict-title').textContent = `${conflict.q.title}（${conflict.q.version}）の続きを選ぶ`;
    $('conflict-preview').textContent = conflict.draft.code;
    this.opener=document.activeElement;$('cloud-conflict').showModal();
  }
  showConfirmationConflict() {
    const state = this.confirmation?.state(), dialog = $('confirmation-cloud-conflict');
    if (!state?.conflict || dialog.open || document.querySelector('dialog[open]')) return;
    const { local, remote, keys } = state.conflict;
    $('confirmation-cloud-summary').textContent = `${keys.length}件の確認問題に異なる回答があります。試行履歴は両方を残します。回答を選ぶ前に、両方の内容をブラウザの控えに保存します。`;
    const describe = journal => keys.map(key => `${key}\n${JSON.stringify(journal.responses[key], null, 2)}`).join('\n\n');
    $('confirmation-cloud-local-preview').textContent = describe(local);
    $('confirmation-cloud-remote-preview').textContent = describe(remote);
    this.confirmationOpener = document.activeElement; dialog.showModal();
  }
  async resolveConfirmation(choice) {
    const buttons = ['confirmation-cloud-local', 'confirmation-cloud-remote'].map($); buttons.forEach(button => { button.disabled = true; });
    try {
      await this.confirmation.resolve(choice, { backup: async ({local, remote}) => {
        this.host.confirmationStore.backup('確認記録の競合：このブラウザ', local);
        this.host.confirmationStore.backup('確認記録の競合：クラウド', remote); return true;
      } });
      $('confirmation-cloud-conflict').close(); this.host.notice('両方の確認記録を控えに残して回答を選びました。保存状態を確認してください。'); this.update(); this.showConflict();
    } catch (e) { this.host.notice(e.message, true); }
    finally { buttons.forEach(button => { button.disabled = false; }); }
  }
  async resolveConflict(choice) {
    const conflict = this.conflict; if (!conflict) return;
    const { q, draft } = conflict;
    if (choice === 'cloud') {
      this.importing = true; try { this.host.importDraft(draft); } finally { this.importing = false; }
    } else {
      this.host.archive({ ...draft, practiced: false }, 'クラウド競合時の相手の下書き');
      this.host.archive(this.host.entry(q), 'クラウド競合時のローカル下書き');
    }
    this.auto.resolve(q, draft, this.host.entry(q));
    this.conflicts.delete(questionKey(q)); this.conflict = null; $('cloud-conflict').close();
    this.host.notice('両方の内容を保護して続きを選びました。クラウドへの保存状態は下部で確認できます。'); this.update(); this.showConflict();
  }
  async restore() {
    if (!this.connected) return;
    if (this.host.question()?.kind === 'confirmation') {
      if (!this.confirmation || this.confirmationUnavailable) throw new Error('この保存先は確認記録の保存準備待ちです。ブラウザまたは保存ファイルの記録を使用してください。');
      await this.confirmation.connect(); this.update(); this.showConfirmationConflict();
      this.host.notice(this.confirmation.state().status === 'conflict' ? '確認記録の回答が競合しています。両方を保護して続きを選んでください。' : 'クラウドと確認記録を照合しました。試行と回答は現在の内容を保護して取り込みます。'); return;
    }
    const { drafts } = await this.client.call('listDrafts', {}); $('cloud-options').replaceChildren();
    if (!drafts.length) { const p = document.createElement('p'); p.textContent = 'クラウドに下書きがありません。'; $('cloud-options').append(p); }
    for (const draft of drafts) {
      const button = document.createElement('button'); button.type = 'button'; button.textContent = `${draft.folder ? draft.folder + ' ／ ' : ''}${draft.title || draft.questionId} ／ ${draft.version} ／ ${date(draft.updatedAt)}`;
      button.addEventListener('click', () => this.choose(draft).catch(e => this.host.notice(e.message, true))); $('cloud-options').append(button);
    }
    $('cloud-import').disabled = true; $('cloud-revisions').replaceChildren(); $('cloud-revisions').disabled = true; $('cloud-preview').textContent = '';
    this.opener=document.activeElement;$('cloud-dialog').showModal();
  }
  async choose(item, revision) {
    const generation = this.previewGeneration = (this.previewGeneration || 0) + 1;
    $('cloud-import').disabled = true; $('cloud-revisions').disabled = true;
    const latest = await this.client.call('getDraft', { questionId: item.questionId, version: item.version });
    const draft = revision && revision !== latest.draft?.revision ? (await this.client.call('getDraft', { questionId: item.questionId, version: item.version, revision })).draft : latest.draft;
    if (generation !== this.previewGeneration || !$('cloud-dialog').open) return;
    if (!draft || !latest.draft) throw new Error('下書きを取得できませんでした。元のコードは保持しています。');
    $('cloud-revisions').replaceChildren();
    const versions = new Map([latest.draft, ...(latest.history || [])].map(d => [d.revision, d]));
    for (const value of versions.values()) { const option = document.createElement('option'); option.value = value.revision; option.textContent = `${date(value.updatedAt)}（更新${value.seq}）`;$('cloud-revisions').append(option); }
    $('cloud-revisions').value = draft.revision; $('cloud-revisions').disabled = false; $('cloud-revisions').onchange = () => this.choose(item, $('cloud-revisions').value).catch(e => this.host.notice(e.message, true));
    $('cloud-preview').textContent = draft.code; $('cloud-import').disabled = false;
    $('cloud-import').onclick = () => {
      try {
        this.importing = true; try { this.host.importDraft(draft); } finally { this.importing = false; }
        const q = this.host.findQuestion(draft); this.auto.resolve(q, latest.draft, this.host.entry(q));
        $('cloud-dialog').close(); this.host.notice('取り込み前のコードを控えに残し、クラウドの続きを取り込みました。'); this.update();
      } catch (e) { this.host.notice(e.message, true); }
    };
  }
}
