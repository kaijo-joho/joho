import { questionKey, validateCatalog } from './core.mjs';
import { GoogleBridge, bridgeURL, codeHash } from './cloud.mjs';
import { teacherPreviewConfig } from './teacher-preview-config.mjs?v=20261016-preview-disabled';

const $ = id => document.getElementById(id);
const invalid = () => new Error('配布検証として確認できない応答です。編集中のコードは保持しています。');

// 配布専用。CloudWorkspaceや保存用GSSへの接続を作らない。
export class TeacherPreviewPanel {
  constructor(host, config = teacherPreviewConfig) {
    this.host = host; this.config = config; this.bridge = new GoogleBridge(config);
    this.generation = 0; this.keys = new Set(); this.connected = false; this.working = false;
    $('cloud-connect').addEventListener('click', () => { host.closeMenus(); this.connect(); });
    if (config.enabled) {
      $('cloud-login').href = bridgeURL(config, location.origin, crypto.randomUUID().replaceAll('-', '') + crypto.randomUUID().replaceAll('-', ''));
      $('cloud-login').hidden = false;
    }
    this.render();
    addEventListener('pagehide', () => { this.generation++; this.bridge.dispose(); });
  }
  async connect() {
    if (this.working || !this.config.enabled) return;
    const generation = ++this.generation, started = performance.now();
    this.working = true; this.connected = false; this.render();
    try {
      const session = await this.bridge.connect();
      if (generation !== this.generation) return;
      if (typeof session?.teacher !== 'boolean' || session.preview?.readOnly !== true || session.preview.viewerRole !== (session.teacher ? 'teacher' : 'demo') || !Array.isArray(session.policies) || session.policies.length ||
          !Array.isArray(session.ratings) || session.ratings.length || !/^[a-f0-9]{32}$/.test(session.preview.generation) ||
          !/^[a-f0-9]{64}$/.test(session.preview.sourceDigest) || !Number.isFinite(Date.parse(session.preview.expiresAt)) ||
          !/^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(session.account || '') || await codeHash(session.account) !== session.actorKey) throw invalid();
      const catalog = validateCatalog(session.catalog);
      if (!catalog.sets.length || catalog.sets.some(s => !s.questions.length)) throw invalid();
      if (generation !== this.generation) return;
      this.host.addCatalog(catalog);
      this.keys = new Set(catalog.sets.flatMap(s => s.questions.map(questionKey)));
      this.connected = true; this.account = session.account; this.viewerRole = session.preview.viewerRole;
      const seconds = ((performance.now() - started) / 1000).toFixed(1);
      this.host.notice(`検証用の問題を取得しました：${catalog.sets.length}セット・${this.keys.size}項目（接続開始から${seconds}秒）。採用前の問題も含む配布検証です。`);
    } catch (e) { if (generation === this.generation) this.fail(e); }
    finally { if (generation === this.generation) { this.working = false; this.render(); } }
  }
  fail(error) {
    this.connected = false; this.bridge.dispose();
      this.host.notice(error.message || '検証用の問題を取得できません。学校アカウントを確認してください。', true);
  }
  render() {
    $('cloud-connect').disabled = this.working || !this.config.enabled;
    $('cloud-connect-label').textContent = this.working ? '検証アカウントを確認中…' : this.connected ? '検証アカウントを再確認' : '検証アカウントに接続';
    $('cloud-connect').title = this.config.enabled ? '検証用の問題配布を確認' : '検証用の接続先は設定待ちです';
    $('cloud-account').textContent = this.working ? '問題データを取得しています…' : this.connected ? `${this.account}（${this.viewerRole === 'teacher' ? '教員' : 'デモ'}・配布検証）` : '問題配布検証・未接続';
    for (const id of ['save-cloud', 'open-cloud', 'formal-submit', 'formal-query', 'formal-resume', 'submit-confirm']) $(id).disabled = true;
    $('cloud-save-status').textContent = 'コードはブラウザ保存・ローカルファイル保存で確認できます。';
    $('formal-status').textContent = '問題配布検証';
    $('formal-note').textContent = '今回の検証範囲は問題一覧・問題文・雛形の取得です。';
    this.host.renderRatings();
  }
  hasSchoolQuestion(q) { return this.keys.has(questionKey(q)); }
  rating() { return null; }
  navigationStatus() { return ''; }
  draftBadge() { return null; }
  edited() {}
  async refreshCurrent() {}
  async resume() {}
  unsaved() { return false; }
}
