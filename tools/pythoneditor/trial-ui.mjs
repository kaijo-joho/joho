import { questionKey } from './core.mjs';
import { GoogleBridge, bridgeURL, codeHash, submissionText, confirmationSubmission } from './cloud.mjs?v=20261017-confirmation-sync1';
import { ToolsDraftPanel } from './tools-store-ui.mjs?v=20261017-school-trial1';
import { TrialClient, TrialStorage, validateTrialSession, TRIAL_PROTOCOL, TRIAL_KIND } from './trial.mjs?v=20261017-school-trial1';
import { trialConfig } from './trial-config.mjs?v=20261017-school-trial1';
import { validateAssessmentPolicy, evaluateAssessment } from './local-assessment.mjs?v=20261017-local-assessment1';

const $ = id => document.getElementById(id);
const date = value => new Date(value).toLocaleString('ja-JP');
const score = value => value === null || value === undefined ? 'なし' : `${Math.round(value * 1000) / 10} 点`;

// 本番成績と分けた対象者限定の試用。下書き・確認journalは既存保存UIを共用する。
export class TrialPanel {
  constructor(host, { config = trialConfig, validatePolicy = validateAssessmentPolicy, evaluate = evaluateAssessment } = {}) {
    Object.assign(this, { host, config, validatePolicy, evaluateAssessment: evaluate });
    this.bridge = new GoogleBridge(config, { protocol: TRIAL_PROTOCOL, kind: TRIAL_KIND, title: 'Pythonエディタの限定試用' });
    this.connected = false; this.working = false; this.generation = 0; this.keys = new Set(); this.states = new Map(); this.ratings = new Map(); this.readEpochs = new Map(); this.comparisons = new Map();
    $('cloud-connect').addEventListener('click', () => { host.closeMenus(); this.connect(); });
    $('save-cloud').addEventListener('click', () => { host.closeMenus(); this.withWork(() => this.drafts?.save()); });
    $('open-cloud').addEventListener('click', () => { host.closeMenus(); this.withWork(() => this.drafts?.restore()); });
    $('formal-submit').addEventListener('click', () => { host.closeMenus(); this.prepareSubmit(); });
    $('submit-confirm').addEventListener('click', () => this.submit());
    $('formal-query').addEventListener('click', () => this.query(false));
    $('formal-resume').addEventListener('click', () => this.query(true));
    $('conflict-cloud').addEventListener('click', () => this.withWork(() => this.drafts?.resolveConflict('cloud')));
    $('conflict-local').addEventListener('click', () => this.withWork(() => this.drafts?.resolveConflict('local')));
    $('submit-dialog').addEventListener('close', () => { if (this.opener?.isConnected) this.opener.focus(); });
    if (config.enabled) { $('cloud-login').href = bridgeURL(config, location.origin, crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''), { kind: TRIAL_KIND }); $('cloud-login').hidden = false; }
    $('trial-mode-note').hidden = false; $('formal-title').textContent = '試用評価・提出'; $('submit-title').textContent = '試用提出の確認';
    $('submit-confirm').textContent = 'この内容を試用提出'; $('formal-resume').textContent = '同じ試用提出を再送';
    $('formal-submit').setAttribute('aria-label', '試用提出（取組評価）'); $('formal-submit').title = '試用提出（取組評価）'; $('formal-submit-label').textContent = '試用提出';
    this.render();
    addEventListener('pagehide', () => { this.generation++; this.bridge.dispose(); });
  }
  async withWork(fn) {
    if (this.working) return;
    this.working = true; this.render();
    try { return await fn(); } catch (error) { this.fail(error); } finally { this.working = false; this.render(); }
  }
  fail(error) {
    this.drafts?.fail(error);
    if (['login_required', 'auth_required', 'not_allowed', 'actor_mismatch', 'account_mismatch', 'account_denied', 'binding_invalid', 'binding_expired', 'binding_stale', 'permission_denied', 'disconnected'].includes(error.code)) this.connected = false;
    this.host.notice(error.message || '試用の通信を確認できません。コードと送信控えは保持しています。', true); this.render();
  }
  async connect() {
    if (!this.config.enabled) return;
    return this.withWork(async () => {
      const generation = ++this.generation; this.connected = false;
      if (this.drafts?.auto) this.drafts.auto.connected = false;
      this.drafts?.confirmation?.dispose(); this.render();
      const session = await validateTrialSession(await this.bridge.connect(), { validatePolicy: this.validatePolicy });
      if (generation !== this.generation) return;
      let storage; try { storage = localStorage; } catch {}
      const scoped = new TrialStorage(storage, session.scopeId); let previousActor;
      try { previousActor = scoped.getItem('joho.pythoneditor.tools-connection.v1.last'); } catch {}
      const priorActor = this.client?.session.actorKey || previousActor;
      const changedAccount = priorActor && priorActor !== session.actorKey;
      const changedScope = this.client && this.client.session.scopeId !== session.scopeId;
      if ((changedAccount || changedScope) && this.drafts?.unsaved()) throw new Error('以前の試用に未保存の記録があります。元のアカウントへ接続して保存してください。送信控えは保持しています。');
      if (changedAccount) {
        if (!confirm('学校アカウントが変わります。現在のコード・試行・回答を、新しい試用アカウントへ引き継ぎますか？')) throw new Error('アカウント切り替えを中止しました。記録は保持しています。');
        this.host.archiveEntries('試用アカウント切り替え前'); this.host.confirmationStore.backup('試用アカウント切り替え前');
      }
      const client = new TrialClient((...args) => this.bridge.call(...args), session, scoped);
      if (changedScope && this.drafts) {
        this.drafts.auto?.dispose(); this.drafts.confirmation?.dispose(); this.drafts.bridge?.dispose(); this.drafts.connected = false;
        this.drafts.auto = null; this.drafts.confirmation = null; this.drafts.client = null; this.drafts.options.storage = scoped; this.drafts.loads.clear();
      }
      this.client = client; this.states.clear(); this.ratings.clear(); this.readEpochs.clear(); this.comparisons.clear();
      this.keys = new Set(session.catalog.sets.flatMap(set => set.questions.map(questionKey)));
      for (const item of session.ratings) this.ratings.set(questionKey(item), item.rating);
      if (!this.drafts) this.drafts = new ToolsDraftPanel(this.host, () => this.render(), { storage: scoped, bridgeFactory: connection => this.client.storeBridge(connection) });
      this.host.addCatalog(session.catalog);
      const attached = await this.drafts.attach(session.store.connection);
      if (generation !== this.generation || !attached) return;
      this.connected = true; this.render(); await this.refreshCurrent();
      this.host.notice('限定試用に接続しました。保存・復元・試用提出を確認できます。試用評価は本番成績へ反映しません。');
    });
  }
  hasSchoolQuestion(q) { return this.keys.has(questionKey(q)); }
  rating(q) {
    if (!this.connected) return null;
    const known = this.ratings.get(questionKey(q)); if (known) return known;
    const policy = this.client?.policy(q);
    if (this.hasSchoolQuestion(q) && !policy) return { earned: 0, total: 0, version: q.version, trial: true };
    return policy && policy.checks.every(check => check.kind !== 'code') ? { earned: null, total: 0, version: q.version, trial: true } : null;
  }
  acceptState(q, result) { this.states.set(questionKey(q), result); if (result.rating) this.ratings.set(questionKey(q), result.rating); }
  compareCode(q, receipt) {
    if (q.kind !== 'code' || !receipt?.codeHash) return null;
    const key = questionKey(q), code = this.host.entry(q).code, prior = this.comparisons.get(key);
    if (prior?.code === code && prior.hash === receipt.codeHash) return prior.changed;
    const item = { code, hash: receipt.codeHash, changed: null }; this.comparisons.set(key, item);
    codeHash(code).then(hash => { if (this.comparisons.get(key) !== item) return; item.changed = hash !== receipt.codeHash; this.render(); }).catch(() => {});
    return null;
  }
  navigationStatus(q) {
    if (!this.connected || !this.client?.policy(q)) return '';
    try { if (this.client.pending(q)) return '試用提出の完了未確認'; } catch { return '試用の送信控えを確認'; }
    const receipt = this.states.get(questionKey(q))?.receipt;
    return receipt && this.compareCode(q, receipt) ? '試用提出後に変更' : '';
  }
  render() {
    const q = this.host.question(), policy = q && this.client?.policy(q), enabled = this.connected && !!policy;
    this.drafts?.render();
    $('cloud-connect').disabled = this.working || !this.config.enabled;
    $('cloud-connect-label').textContent = this.working ? '試用アカウントを確認中…' : this.connected ? '試用アカウントに再接続' : '試用アカウントに接続';
    $('cloud-connect').title = this.config.enabled ? '対象者限定の保存・提出試用' : '試用の接続先は設定待ちです';
    $('cloud-account').textContent = this.connected ? `${this.client.session.account}（${this.client.session.viewerRole === 'teacherTrial' ? '教員試用' : '生徒権限試用'}）` : '限定試用・未接続';
    $('save-cloud').disabled = this.working || !this.drafts?.connected; $('open-cloud').disabled = this.working || !this.drafts?.connected;
    $('formal-submit').disabled = this.working || !enabled || q?.kind === 'observation' || this.host.running();
    $('formal-query').disabled = this.working || !enabled; $('formal-resume').disabled = this.working || !enabled;
    const state = q && this.states.get(questionKey(q)), receipt = state?.receipt; let pending;
    try { pending = q && this.client?.pending(q); } catch (error) { $('formal-status').textContent = error.message; return; }
    $('formal-status').textContent = pending ? '試用提出の完了未確認' : receipt ? '試用提出済み' : enabled ? '試用・未提出' : this.connected ? '試用・取組評価は未設定' : '試用・接続前';
    $('formal-note').textContent = `${this.connected && q?.kind === 'confirmation' && !policy ? 'この確認問題は配点が未設定です。試行・回答のクラウド保存と復元は確認できます。' : ''}公開された取組条件を端末で判定し、受付結果を試用保存します。正答の証明や本番成績には使いません。`;
    $('formal-score').textContent = receipt ? `最新の試用評価 ${score(receipt.score)}` : '';
    $('formal-best').textContent = state ? `試用の最高点 ${score(state.bestScore)}` : '';
    $('formal-time').textContent = receipt ? `サーバー受付 ${date(receipt.receivedAt)} ／ 締切なし（試用）` : '';
    $('formal-edited').textContent = receipt && this.compareCode(q, receipt) ? '現在のコードは試用提出時から変更されています。再提出まで試用評価は変わりません。' : '';
    $('formal-checks').replaceChildren();
    for (const check of receipt?.checks || []) { const li = document.createElement('li'); li.textContent = check.eligible === false ? `— ${check.label}（今回は点数の対象外）` : `${check.passed ? '✓' : '×'} ${check.label}（${check.earned} / ${check.points}）`; $('formal-checks').append(li); }
    $('formal-diagnostics').textContent = receipt ? '受付時の署名は教員側の回収で検証します。ローカル判定の再採点は行っていません。' : '';
    $('formal-history').replaceChildren();
    for (const history of (state?.history || []).slice(0, 20)) { const li = document.createElement('li'); li.textContent = `${date(history.receivedAt)} ／ 試用 ${score(history.score)} ／ ${history.version}`; $('formal-history').append(li); }
    $('formal-history-details').hidden = !state?.history?.length; this.host.renderRatings?.();
  }
  async refreshCurrent() {
    const q = this.host.question(); if (q) await this.drafts?.selected(q);
    if (!this.connected || !this.client?.policy(q)) return;
    const client = this.client, generation = this.generation, key = questionKey(q), epoch = (this.readEpochs.get(key) || 0) + 1; this.readEpochs.set(key, epoch);
    let result;
    try { result = await client.recover(q); } catch (error) { if (client !== this.client || generation !== this.generation) return; throw error; }
    if (client !== this.client || generation !== this.generation || this.readEpochs.get(key) !== epoch) return;
    this.acceptState(q, result); this.render();
  }
  async prepareSubmit() {
    const q = this.host.question(), policy = q && this.client?.policy(q); if (!this.connected || !policy || q.kind === 'observation') return;
    return this.withWork(async () => {
      const client = this.client; await this.host.pendingRecords?.();
      if (q.kind === 'confirmation' && this.host.unrecordedConfirmation?.(q)) throw new Error('入力中の回答があります。「回答を記録」を押してから試用提出してください。');
      const pending = client.pending(q); let input = pending?.input;
      if (!input) {
        const entry = this.host.entry(q), normalized = await submissionText(entry, { assignmentId: 'trial' }, this.host.run(q));
        input = { questionId: q.questionId, version: q.version, policyHash: policy.policyHash, code: normalized.code, stdin: normalized.stdin, run: normalized.run };
        if (q.kind === 'confirmation') {
          const sources = q.codeRefs.map(ref => { const source = this.host.findQuestion(ref); if (!source) throw new Error('参照元の問題・版を読み込んでください。'); return this.host.entry(source); });
          const evidence = await confirmationSubmission(q, { assignmentId: 'trial' }, sources, this.host.confirmationStore.snapshot());
          input.evidence = { sources: evidence.sources, journal: evidence.journal };
        }
        if (typeof this.evaluateAssessment !== 'function') throw new Error('試用の取組判定を読み込めません。コードは保持しています。');
        input.assessment = await this.evaluateAssessment(policy, input);
      }
      if (client !== this.client) return;
      this.submission = { q, input, client };
      $('submit-description').textContent = `${q.title}（${q.version}）を試用提出します。コード・実行記録${input.evidence ? '・確認の試行と回答' : ''}・端末で判定した取組結果を送信します。${pending ? '前回と同じ番号・同じ内容で再送します。' : ''}本番成績へ反映しません。`;
      $('submit-run-note').textContent = 'サーバーは再採点せず、受け取った取組記録へ受付時刻と署名を付けて保存します。';
      $('submit-preview').textContent = JSON.stringify(input, null, 2); this.opener = document.activeElement; $('submit-dialog').showModal();
    });
  }
  async submit() {
    const prepared = this.submission; if (!prepared || prepared.client !== this.client) return; $('submit-dialog').close();
    return this.withWork(async () => {
      this.flushDrafts().catch(error => this.host.notice(error.message, true));
      const result = await prepared.client.submit(prepared.input); if (prepared.client !== this.client) return;
      this.acceptState(prepared.q, result); this.host.notice('本人の試用保存先で、提出結果と履歴の保存を確認しました。本番成績へは反映しません。');
    });
  }
  async query(resend) {
    const q = this.host.question(), client = this.client; if (!this.connected || !client?.policy(q)) return;
    return this.withWork(async () => {
      const result = await client.recover(q, { resend }); if (client !== this.client) return;
      this.acceptState(q, result); this.host.notice(result.unreceived ? 'この番号の受付は見つかりません。控えを保持しています。「同じ試用提出を再送」で再試行できます。' : result.receipt ? '試用提出の結果を確認しました。' : 'この問題の試用提出はありません。');
    });
  }
  edited(entry) { if (this.host.findQuestion(entry)?.kind !== 'confirmation') this.drafts?.edited(entry); }
  confirmationsEdited() { this.drafts?.confirmationsEdited(); }
  draftBadge(q) { return this.drafts?.badge(q); }
  async resume() {}
  unsaved() { return this.drafts?.unsaved() || false; }
  flushDrafts(q, entry) { return this.drafts?.saveAll(q, entry) || Promise.resolve({ connected: false, saved: false }); }
}
