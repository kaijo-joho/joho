import { evaluateCheck, refKey } from './confirmation.mjs?v=20261016-confirmation1';
import { questionKey } from './core.mjs?v=20261016-confirmation1';

const outcomeLabels = { success: '実行終了', error: 'エラー', stopped: '停止', environment_error: '実行環境エラー' };
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function successful(trial) { return trial.outcome === 'success' && !trial.truncated; }
function shortOutput(trial) { return trial.stdout.trim().split('\n').at(-1)?.slice(0, 80) || '出力なし'; }

// Learning observations are separate from official grades. Every label comes from
// declared public conditions; this view never accepts or generates a score.
export class ConfirmationPanel {
  constructor(host, store, root) { this.host = host; this.store = store; this.root = root; this.selected = new Map(); this.answerDrafts = new Map(); }
  source(q) {
    if (q?.kind !== 'confirmation') return null;
    const selected = this.selected.get(questionKey(q));
    const ref = q.codeRefs.find(ref => refKey(ref) === selected) || q.codeRefs[0];
    return ref ? this.host.findSource(ref) : null;
  }
  progress(q) {
    const currentCode = {};
    for (const ref of q.codeRefs) {
      const source = this.host.findSource(ref);
      if (source) currentCode[refKey(ref)] = this.host.entry(source).code;
    }
    return evaluateCheck(q.checkType, q.checkConfig, this.store.trials(q.codeRefs), this.store.response(questionKey(q)), { currentCode });
  }
  label(q) {
    try { return this.progress(q).label; } catch { return '確認条件を読み込めません'; }
  }
  unrecorded(q) {
    const values = q ? [[questionKey(q), this.answerDrafts.get(questionKey(q))]] : [...this.answerDrafts];
    return values.some(([key, value]) => value !== undefined && value !== String(this.store.response(key)?.answer ?? ''));
  }
  async saveResponse(q, response) {
    const focusId = document.activeElement?.id;
    try {
      await this.store.setResponse(questionKey(q), response);
      if (this.store.lastError) this.host.warning(this.store.lastError.message);
      this.host.changed();
      if (focusId && this.host.question?.() === q) this.root.querySelector(`#${CSS.escape(focusId)}`)?.focus();
    } catch (error) { this.host.warning(error.message); }
  }
  render(q) {
    this.root.replaceChildren(); this.root.hidden = q?.kind !== 'confirmation';
    if (this.root.hidden) return;
    this.root.append(element('h3', '', '試行を伴う確認'));
    const source = this.source(q), sources = element('div', 'confirmation-source');
    if (q.codeRefs.length > 1) {
      const label = element('label', '', '実行するコード');
      const select = element('select'); select.id = 'confirmation-source';
      for (const ref of q.codeRefs) {
        const item = this.host.findSource(ref), option = element('option', '', item?.title || ref.questionId);
        option.value = refKey(ref); select.append(option);
      }
      select.value = source ? refKey(source) : '';
      select.disabled = this.host.running();
      select.addEventListener('change', () => { this.selected.set(questionKey(q), select.value); this.host.sourceChanged(q); this.root.querySelector('#confirmation-source')?.focus(); });
      label.append(select); sources.append(label);
    }
    if (source) {
      sources.append(element('span', 'muted', `${source.title}（${source.version}）のコードを使います。`));
      const open = element('button', '', '参照元のコードを編集'); open.type = 'button';
      open.addEventListener('click', () => this.host.openSource(source)); sources.append(open);
      sources.append(element('p', 'muted', '下のコードは参照用です。入力値を変えて実行できます。'));
    }
    if (sources.childNodes.length) this.root.append(sources);
    const progress = this.progress(q);
    const summary = element('p', 'confirmation-summary', progress.label); summary.id = 'confirmation-progress';
    summary.dataset.state = progress.state; summary.setAttribute('role', 'status'); this.root.append(summary);
    if (progress.details.length) {
      const list = element('ul', 'confirmation-checks');
      for (const item of progress.details) {
        const li = element('li', '', `${item.complete ? '✓' : '○'} ${item.label}`);
        li.dataset.check = item.id; li.dataset.complete = String(item.complete); list.append(li);
      }
      this.root.append(list);
    }
    if (q.checkType === 'compareRuns') this.renderComparison(q);
    if (q.checkType === 'answer') this.renderAnswer(q);
    this.root.append(element('p', 'muted confirmation-note', 'ここは学習用の確認記録です。正式な得点・提出済みの状態にはなりません。'));
    const failure = this.store.lastError;
    if (failure) this.root.append(element('p', 'danger', `${failure.message} この画面の記録は保持しています。ファイルに保存してください。`));
    this.renderHistory(q);
  }
  renderComparison(q) {
    const response = this.store.response(questionKey(q)) || {}, selections = { ...(response.selections || {}) };
    const rows = element('div', 'confirmation-comparison');
    if (q.checkConfig.question) rows.append(element('p', '', q.checkConfig.question));
    const trials = this.store.trials(q.codeRefs).filter(successful);
    for (const condition of q.checkConfig.conditions) {
      const label = element('label', '', condition.label), select = element('select');
      select.dataset.condition = condition.id; select.id = `confirmation-condition-${condition.id}`;
      const placeholder = element('option', '', '実行結果を選んでください'); placeholder.value = ''; select.append(placeholder);
      for (const [index, trial] of trials.entries()) {
        const inputs = trial.inputs.filter(input => !input.eof).map(input => input.value).join(' / ');
        const option = element('option', '', `試行${index + 1}${inputs ? `（入力 ${inputs.slice(0, 45)}）` : ''}：${shortOutput(trial)}`);
        option.value = trial.id; select.append(option);
      }
      select.value = selections[condition.id] || '';
      select.addEventListener('change', () => {
        if (select.value) selections[condition.id] = select.value; else delete selections[condition.id];
        this.saveResponse(q, { selections });
      });
      label.append(select); rows.append(label);
    }
    this.root.append(rows);
  }
  renderAnswer(q) {
    const config = q.checkConfig, response = this.store.response(questionKey(q)) || {};
    const draft = this.answerDrafts.get(questionKey(q)), value = draft ?? response.answer ?? '';
    const form = element('form', 'confirmation-answer'), label = element('label', '', config.question);
    let input;
    if (config.format === 'choice') {
      input = element('select');
      const option = element('option', '', '回答を選んでください'); option.value = ''; input.append(option);
      for (const choice of config.choices) { const option = element('option', '', choice.label); option.value = choice.id; input.append(option); }
      input.value = value;
    } else {
      input = element('input'); input.type = 'number'; input.step = 'any'; input.value = value;
    }
    const note = element('p', 'muted', '入力中の回答は未記録です。「回答を記録」を押してください。'); note.id = 'confirmation-answer-unsaved'; note.hidden = String(value) === String(response.answer ?? '');
    const remember = () => { this.answerDrafts.set(questionKey(q), input.value); note.hidden = !this.unrecorded(q); };
    input.addEventListener('input', remember); input.addEventListener('change', remember);
    input.id = 'confirmation-answer'; input.required = true; label.append(input); form.append(label);
    const save = element('button', '', '回答を記録'); save.type = 'submit'; save.id = 'confirmation-answer-save'; form.append(save);
    form.addEventListener('submit', event => {
      event.preventDefault();
      if (!input.value || !form.reportValidity()) return;
      const answer = config.format === 'number' ? Number(input.value) : input.value;
      if (config.format === 'number' && !Number.isFinite(answer)) return;
      const captured = input.value;
      this.saveResponse(q, { answer }).then(() => {
        if (this.store.response(questionKey(q))?.answer === answer && this.answerDrafts.get(questionKey(q)) === captured) this.answerDrafts.delete(questionKey(q));
      });
    });
    this.root.append(form, note);
  }
  renderHistory(q) {
    const trials = this.store.trials(q.codeRefs);
    if (!trials.length) return;
    const details = element('details', 'confirmation-history'), list = element('ol');
    details.append(element('summary', '', `試行履歴（${trials.length}回）`));
    for (const [index, trial] of trials.entries()) {
      const source = this.host.findSource(trial.source), changed = source && this.host.entry(source).code !== trial.code;
      const row = element('li'), content = element('details');
      content.append(element('summary', '', `試行${index + 1}：${outcomeLabels[trial.outcome]}${trial.truncated ? '・出力上限' : ''}${changed ? '・コード変更前' : ''}`));
      if (trial.inputs.length) content.append(element('p', '', `入力：${trial.inputs.map(input => input.eof ? `${input.prompt}入力終了` : input.prompt + input.value).join(' → ')}`));
      content.append(element('pre', '', trial.stdout || '（標準出力なし）'));
      if (trial.stderr) content.append(element('pre', 'error', trial.stderr));
      const code = element('details'); code.append(element('summary', '', 'この試行のコード'), element('pre', '', trial.code));
      content.append(code); row.append(content); list.append(row);
    }
    details.append(list); this.root.append(details);
  }
}
