import { AdviceBridge, AdviceJournal, prepareConsultation, sourceSnapshot,
  consultationResult, contextNotice, historyRecords } from './advice.mjs?v=20261017-advice1';
import { adviceConfig } from './advice-config.mjs?v=20261017-advice1';
const $ = id => document.getElementById(id);
const element = (tag, text, className) => {
  const node = document.createElement(tag); if (text) node.textContent = text;
  if (className) node.className = className; return node;
};
const date = value => new Date(value).toLocaleString('ja-JP');

export class AdvicePanel {
  constructor(host, { config = adviceConfig, bridge, storage } = {}) {
    this.host = host; this.config = config; this.bridge = bridge || new AdviceBridge(config);
    try { this.storage = storage === undefined ? globalThis.localStorage : storage; } catch { this.storage = null; }
    this.root = $('advice-panel'); this.records = []; this.epoch = 0;
    this.historyRevision = 0; this.tab = 'compose';
    $('open-advice').addEventListener('click', event => this.open(event.currentTarget));
    $('advice-close').addEventListener('click', () => this.close());
    $('advice-connect').addEventListener('click', () => this.connect());
    $('advice-disconnect').addEventListener('click', () => this.disconnect());
    $('advice-new').addEventListener('click', () => this.composeCurrent());
    $('advice-send').addEventListener('click', () => this.send());
    $('advice-query').addEventListener('click', () => this.query());
    $('advice-recent').addEventListener('change', () => this.select($('advice-recent').value));
    $('advice-refresh-history').addEventListener('click', () => this.loadTypes());
    $('advice-history-type').addEventListener('change', () => this.search());
    for (const tab of ['compose', 'history']) $('advice-tab-' + tab).addEventListener('click', () => this.showTab(tab));
    for (const id of ['advice-code', 'advice-setup', 'advice-error', 'advice-question', 'advice-share'])
      $(id).addEventListener('input', () => this.render());
    this.root.addEventListener('keydown', event => {
      if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); this.close(); }
      // The question field must not run the Python cell via its global shortcuts.
      if ((event.metaKey || event.ctrlKey || event.shiftKey) && event.key === 'Enter') event.stopPropagation();
    });
    this.render();
  }
  open(opener = document.activeElement) {
    this.opener = opener?.matches('button,a[href],input,textarea,select,[tabindex]') ? opener : $('open-advice'); this.host.closeMenus?.();
    this.root.hidden = false; $('open-advice').setAttribute('aria-expanded', 'true');
    if (!this.compose && !this.selected) this.composeCurrent();
    this.render(); $('advice-title').focus();
  }
  close() {
    this.root.hidden = true; $('open-advice').setAttribute('aria-expanded', 'false');
    if (this.opener?.isConnected && this.opener.getClientRects().length) this.opener.focus();
    else $('open-advice').focus();
  }
  composeCurrent() {
    const snapshot = this.host.snapshot();
    if (!snapshot) return this.message('相談する問題を選択してください。', true);
    try { this.compose = { ...sourceSnapshot(snapshot), title: snapshot.title || snapshot.questionId }; }
    catch (error) { this.message(error.message, true); return; }
    this.selected = null; this.showTab('compose');
    $('advice-code').value = this.compose.code; $('advice-setup').value = this.compose.setupCode;
    $('advice-error').value = this.compose.errorText; $('advice-question').value = '';
    $('advice-share').checked = false;
    this.message('送信するコピーを確認してください。必要な部分に絞って編集できます。');
    this.render();
  }
  message(text, danger = false) {
    $('advice-status').textContent = text; $('advice-status').classList.toggle('danger', danger);
  }
  showTab(tab) { this.tab = tab; this.render(); }
  record() { return this.records.find(r => r.payload.requestId === this.selected); }
  select(id) { this.selected = id || null; this.showTab('compose'); this.render(); }
  persist() { this.records = this.journal.write(this.records); }
  async connect() {
    if (this.working || !this.config.enabled || !this.storage) return;
    this.disconnect(false); const epoch = this.epoch;
    this.working = true; this.message('学校アカウントを確認しています…'); this.render();
    try {
      const session = await this.bridge.connect(); if (epoch !== this.epoch) return;
      if (!/^[a-f0-9]{64}$/.test(session?.actorKey) || !Number.isInteger(session.maxInputLength) || session.maxInputLength < 1)
        throw new Error('相談室の接続情報を確認できません。');
      const journal = new AdviceJournal(this.storage, session.actorKey), records = journal.read();
      this.session = session; this.journal = journal; this.records = records;
      this.message('相談室に接続しました。送信内容と共有について確認してから送ってください。');
    } catch (error) { if (epoch === this.epoch) { this.bridge.dispose(); this.message(error.message, true); } }
    finally { if (epoch === this.epoch) { this.working = false; this.render(); } }
  }
  disconnect(announce = true) {
    this.epoch++; this.historyRevision++; this.bridge.dispose(); this.session = null; this.journal = null;
    this.records = []; this.selected = null; this.working = false;
    $('advice-history-results').replaceChildren(); $('advice-history-type').replaceChildren();
    if (announce) this.message('相談室との接続を終了しました。送信控えは、この端末の同じ学校アカウントで再接続すると確認できます。');
    this.render();
  }
  async rpc(action, input) { return this.bridge.call(action, input, this.session.actorKey); }
  async send() {
    if (!this.session || !this.compose || this.working || this.selected || !$('advice-share').checked) return;
    const epoch = this.epoch, source = { ...this.compose, code: $('advice-code').value,
      setupCode: $('advice-setup').value, errorText: $('advice-error').value };
    this.working = true; this.render(); let record;
    try {
      const payload = await prepareConsultation(source, $('advice-question').value);
      if (epoch !== this.epoch) return;
      if (payload.code.length + payload.setupCode.length + payload.errorText.length + payload.questionText.length > this.session.maxInputLength)
        throw new Error(`相談内容を合計${this.session.maxInputLength}文字以内に絞ってください。`);
      record = { payload, title: source.title, state: 'pending' };
      this.records.push(record);
      try { this.persist(); } catch (error) { this.records = this.records.filter(r => r !== record); throw error; }
      this.selected = payload.requestId; $('advice-share').checked = false;
      this.message('相談を送信しました。回答を待つ間もコードを編集できます。'); this.render();
      this.accept(record, await this.rpc('consult', payload), epoch);
    } catch (error) { if (epoch === this.epoch) this.failure(record, error); }
    finally { if (epoch === this.epoch) { this.working = false; this.render(); } }
  }
  accept(record, raw, epoch) {
    if (epoch !== this.epoch) return;
    const response = consultationResult(raw, record.payload);
    record.state = response.state; record.response = response; this.persist();
    this.message(response.state === 'complete' ? '回答を受け取りました。元のコードを見ながら修正を考えてください。'
      : '相談を処理しています。少し待ってから「結果を照会」で確認してください。');
  }
  failure(record, error) {
    if (record) {
      record.state = ['result_unavailable', 'expired'].includes(error.code) ? 'unavailable' : 'unknown';
      try { this.persist(); } catch (saveError) { this.message(saveError.message, true); return; }
    }
    if (['actor_changed', 'forbidden', 'login_required', 'not_allowed'].includes(error.code)) this.disconnect(false);
    this.message(error.message + (record && record.state !== 'unavailable' ? ' 「結果を照会」で同じ相談を確認できます。' : ''), true);
  }
  async query() {
    const record = this.record(); if (!record || !this.session || this.working || record.state === 'complete') return;
    const epoch = this.epoch; this.working = true; this.message('同じ送信番号の結果を照会しています…'); this.render();
    try { this.accept(record, await this.rpc('getConsultation', { requestId: record.payload.requestId }), epoch); }
    catch (error) { if (epoch === this.epoch) this.failure(record, error); }
    finally { if (epoch === this.epoch) { this.working = false; this.render(); } }
  }
  async loadTypes() {
    if (!this.session || this.working) return;
    const epoch = this.epoch, revision = ++this.historyRevision;
    this.working = true; this.message('共有されている相談を調べています…'); this.render();
    try {
      const raw = await this.rpc('errorTypes', {}); if (epoch !== this.epoch || revision !== this.historyRevision) return;
      if (!Array.isArray(raw.errorTypes) || raw.errorTypes.length > 1000) throw new Error('相談分類の形式を確認できません。');
      const options = raw.errorTypes.map(item => {
        if (typeof item.errorKey !== 'string' || item.errorKey.length > 120 || !Number.isInteger(item.count) || item.count < 0)
          throw new Error('相談分類の形式を確認できません。');
        const option = element('option', `${item.errorKey}（${item.count}件）`); option.value = item.errorKey; return option;
      });
      $('advice-history-type').replaceChildren(...options); $('advice-history-results').replaceChildren();
      this.message(options.length ? '分類を選ぶと過去の相談を表示します。' : '共有されている相談はまだありません。');
    } catch (error) { if (epoch === this.epoch) this.failure(null, error); }
    finally { if (epoch === this.epoch) { this.working = false; this.render(); } }
    if (epoch === this.epoch && $('advice-history-type').options.length) await this.search();
  }
  async search() {
    if (!this.session || this.working || !$('advice-history-type').value) return;
    const epoch = this.epoch, revision = ++this.historyRevision; this.working = true; this.render();
    try {
      const records = historyRecords(await this.rpc('searchHistory', { errorKey: $('advice-history-type').value, limit: 10 }));
      if (epoch !== this.epoch || revision !== this.historyRevision) return;
      $('advice-history-results').replaceChildren(...records.map(record => {
        const details = element('details'), summary = element('summary', `${record.timestamp} ${record.errorType || record.errorKey}`);
        details.append(summary); this.addDetails(details, record); this.addAnswer(details, record); return details;
      }));
      this.message(`${records.length}件の相談例を表示しています。`);
    } catch (error) { if (epoch === this.epoch) this.failure(null, error); }
    finally { if (epoch === this.epoch) { this.working = false; this.render(); } }
  }
  addDetails(parent, data) {
    for (const [key, label] of [['code', '送信したコード'], ['setupCode', '準備コード'], ['errorText', 'エラー'], ['questionText', '相談文']]) {
      if (!data[key]) continue;
      const details = element('details'); details.append(element('summary', label), element('pre', data[key])); parent.append(details);
    }
  }
  addAnswer(parent, data) {
    for (const [label, value] of [['エラーの種類', data.errorType || data.errorKey], ['原因', data.cause], ['修正を考えるヒント', data.advice]])
      if (value) parent.append(element('h3', label), element('p', value, 'advice-answer-text'));
  }
  contextChanged() { this.renderContext(); $('open-advice').disabled = !this.host.snapshot(); }
  renderContext() {
    const source = this.record()?.payload || (this.compose && { ...this.compose,
      code: $('advice-code').value, setupCode: $('advice-setup').value, errorText: $('advice-error').value });
    $('advice-context-note').textContent = source ? contextNotice(source, this.host.snapshot()) : '';
  }
  render() {
    const record = this.record(); this.renderContext();
    $('open-advice').disabled = !this.host.snapshot();
    for (const tab of ['compose', 'history']) {
      $('advice-tab-' + tab).setAttribute('aria-pressed', String(this.tab === tab));
      $('advice-' + tab + '-panel').hidden = tab !== this.tab;
    }
    $('advice-connection').textContent = !this.storage ? 'ブラウザに送信控えを保存できないため、相談の送信は無効です。' : this.session ? '学校アカウント接続済み' : this.config.enabled ? '相談室は未接続です。' : 'エラー相談室は接続準備中です。送信は無効です。';
    $('advice-connect').disabled = !this.config.enabled || this.working || !this.storage;
    $('advice-connect').textContent = this.session ? '学校アカウントに再接続' : '学校アカウントに接続';
    $('advice-disconnect').hidden = !this.session; $('advice-new').disabled = !this.host.snapshot() || this.working;
    $('advice-compose-form').hidden = !!record; $('advice-response').hidden = !record;
    $('advice-source-title').textContent = this.compose ? `${this.compose.title} ／ ${this.compose.version}` : '';
    const options = [element('option', '送信した相談を選択')]; options[0].value = '';
    for (const r of [...this.records].reverse()) {
      const label = r.state === 'complete' ? '回答あり' : r.state === 'unavailable' ? '取得期限終了' : '結果未確認';
      const option = element('option', `${r.title} ／ ${label}`); option.value = r.payload.requestId; options.push(option);
    }
    $('advice-recent').replaceChildren(...options); $('advice-recent').value = this.selected || '';
    $('advice-recent').disabled = !this.records.length;
    $('advice-send').disabled = !this.session || !this.compose || !!record || this.working || !$('advice-share').checked;
    for (const id of ['advice-code', 'advice-setup', 'advice-error', 'advice-question', 'advice-share']) $(id).disabled = this.working;
    $('advice-query').hidden = !record || ['complete', 'unavailable'].includes(record.state);
    $('advice-query').disabled = !this.session || this.working;
    $('advice-response-body').replaceChildren();
    if (record) {
      $('advice-response-title').textContent = `${record.title} ／ ${record.payload.version}`;
      $('advice-request-id').textContent = `送信番号 ${record.payload.requestId}`;
      this.addDetails($('advice-response-body'), record.payload);
      if (record.state === 'complete') {
        $('advice-response-body').append(element('p', `回答日時 ${date(record.response.completedAt)}`, 'muted'));
        this.addAnswer($('advice-response-body'), record.response.result);
      } else $('advice-response-body').append(element('p', record.state === 'unavailable'
        ? 'この送信番号の回答は取得できません。過去の相談から探してください。自動で再問い合わせは行いません。'
        : '回答はまだ確認できていません。照会は同じ送信番号を使い、新たなAI問い合わせは行いません。'));
    }
    $('advice-refresh-history').disabled = !this.session || this.working;
    $('advice-history-type').disabled = !this.session || this.working || !$('advice-history-type').options.length;
  }
  dispose() { this.epoch++; this.bridge.dispose(); }
}
