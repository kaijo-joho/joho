import { LIMITS, APP, FORMAT, questionKey, validId, validateCatalog, validateDraft, stdinLines, errorAdvice } from './core.mjs';
import { demoCatalog } from './demo.mjs';
import { DraftStore, exportDraft } from './storage.mjs';
import { PythonRunner } from './runner.mjs';
import { renderPrompt } from './prompt.mjs';
import { CloudPanel } from './cloud-ui.mjs';
import { cloudConfig } from './cloud-config.mjs';
const $ = id => document.getElementById(id);
const entries = new Map(), outputs = new Map(), docs = new Map();
let catalog, selectedSet, question, cm, store, runSnapshot, busy = false, pendingImport;
let saveFailed = false;
let cloudPanel;
let pendingRequested=false;
let editGeneration=0;
let catalogGeneration=0;
const params = new URLSearchParams(location.search);
const requested = { set: params.get('set'), question: params.get('question') || params.get('practice'), version: params.get('version') };
for (const value of Object.values(requested)) if (value && !validId(value)) showNotice('URLのIDが不正です。問題一覧から選んでください。', true);
pendingRequested=cloudConfig.enabled&&!!(requested.set||requested.question);
function showNotice(message, danger = false) { $('notice').textContent = message; $('notice').classList.toggle('danger', danger); }
function closeMenus(restoreFocus=false) {
  const focused=document.activeElement?.closest('.menu');
  for (const id of ['file-menu', 'settings-menu']) $(id).open = false;
  if(restoreFocus && focused) focused.querySelector('summary').focus();
}
function currentEntry(q = question) {
  const key = questionKey(q);
  if (!entries.has(key)) {
    let stored;
    try { stored = store?.read(q); } catch (e) { saveFailed = true; showNotice(e.message, true); }
    entries.set(key, stored || { questionId: q.questionId, version: q.version, code: q.templateCode, stdin: '', updatedAt: '', practiced: false });
  }
  return entries.get(key);
}
function codeValue() { return cm ? cm.getValue() : $('code').value; }
function setCode(value, q) {
  if (cm) {
    const key = questionKey(q);
    if (!docs.has(key)) docs.set(key, new CodeMirror.Doc(value, 'python'));
    cm.swapDoc(docs.get(key));
    if (cm.getValue() !== value) cm.setValue(value);
    cm.setOption('readOnly', q.kind === 'observation');
    cm.refresh();
  } else { $('code').value = value; $('code').readOnly = q.kind === 'observation'; }
}
function dirty() {
  if (busy || !question) return;
  editGeneration++;
  const e = currentEntry();
  e.code = codeValue(); e.stdin = $('stdin').value;
  e.updatedAt = new Date().toISOString(); e.practiced = false;
  saveAuto(e); updateProgress(); renderOutput();cloudPanel?.render();
}
function saveAuto(e) {
  try {
    if (!store) throw new Error('ブラウザ保存が利用できません。ファイルに保存してください。');
    store.write(e, 'auto'); saveFailed = false;
    $('save-status').textContent = 'ブラウザに自動保存済み';
  } catch (error) { saveFailed = true; $('save-status').textContent = '自動保存に失敗（コードは保持）'; showNotice(error.message, true); }
}
function stateLabel(q) {
  const e = currentEntry(q);
  if (q.kind === 'observation') return '確認問題';
  if (e.practiced) return '実行済み';
  return e.code !== q.templateCode || e.updatedAt ? '編集中' : '未入力';
}
function updateProgress() {
  if (!selectedSet) return;
  const count = selectedSet.questions.filter(q => q.kind !== 'observation' && currentEntry(q).practiced).length;
  const total = selectedSet.questions.filter(q => q.kind !== 'observation').length;
  $('progress').textContent = `実行済み ${count} / ${total} 問`;
  $('work-status').textContent = stateLabel(question);
  for (const button of $('question-list').querySelectorAll('button')) {
    const q = selectedSet.questions.find(q => questionKey(q) === button.dataset.key);
    button.querySelector('.question-item-state').textContent = stateLabel(q);
    button.setAttribute('aria-current', String(q === question));
  }
}
function selectQuestion(q, updateURL = true) {
  if (runner.active) runner.stop('問題を切り替えたため停止しました。');
  busy = true; question = q;
  const e = currentEntry();
  $('question-id').textContent = q.questionId; $('question-title').textContent = q.title;
  $('version').textContent = q.version;
  renderPrompt($('prompt'), q.prompt);
  $('setup').hidden = !q.setupCode; $('setup-code').textContent = q.setupCode;
  $('observation-note').hidden = q.kind !== 'observation';
  if (q.kind === 'observation') $('observation-note').textContent = 'この問題は確認用です。前の問題のコードを実行します。';
  const dependency = q.useExistingQuestionCode && selectedSet.questions.find(p => p.questionId === q.useExistingQuestionCode && p.version === q.version);
  setCode(dependency ? currentEntry(dependency).code : e.code, q);
  $('stdin').value = e.stdin;
  $('save-status').textContent = e.updatedAt ? 'ブラウザの下書きから再開' : '雛形を表示中';
  if (saveFailed) $('save-status').textContent = 'ブラウザ保存を確認してください';
  $('interactive-input').hidden = true;
  updateProgress(); renderOutput();
  const index = selectedSet.questions.indexOf(q);
  $('previous').disabled = index === 0; $('next').disabled = index === selectedSet.questions.length - 1;
  busy = false;
  if (updateURL && !pendingRequested) {
    const url = new URL(location.href); url.search = new URLSearchParams({set: q.setId, question: q.questionId, version: q.version}).toString();
    history.replaceState(null, '', url);
  }
  try { store?.last({ set: q.setId, question: q.questionId, version: q.version }); } catch (e) { showNotice('再開位置の保存に失敗しました。コードは画面に保持しています。', true); }
  cloudPanel?.render();
  cloudPanel?.refreshCurrent().catch(e=>cloudPanel.fail(e));
}
function selectSet(set, selected, preserveCurrent=false) {
  selectedSet = set; $('set-select').value = set.setId;
  $('question-list').replaceChildren();
  for (const [index, q] of set.questions.entries()) {
    const li = document.createElement('li'), button = document.createElement('button');
    button.type = 'button'; button.dataset.question = q.questionId;button.dataset.key=questionKey(q);
    const num = document.createElement('span'); num.className = 'question-number'; num.textContent = index + 1;
    const labels = document.createElement('span'), title = document.createElement('span'), state = document.createElement('span');
    title.className = 'question-item-title'; title.textContent = q.title+(set.questions.filter(p=>p.questionId===q.questionId).length>1?`（${q.version}）`:'');
    state.className = 'question-item-state'; state.textContent = stateLabel(q);
    labels.append(title, state); button.append(num, labels); li.append(button); $('question-list').append(li);
    button.addEventListener('click', () => {pendingRequested=false;selectQuestion(q);});
  }
  if(preserveCurrent){updateProgress();cloudPanel?.render();}else selectQuestion(selected || set.questions[0]);
}
function renderOutput() {
  const result = outputs.get(questionKey(question));
  $('output').textContent = result?.text || '';
  $('stderr-section').hidden = !result?.stderr; $('stderr').textContent = result?.stderr || '';
  $('error').hidden = !result?.error; $('error').textContent = result?.error || '';
  $('advice').hidden = !result?.error; $('advice').textContent = result?.error ? errorAdvice(result.error) : '';
  const changed = result && (result.code !== effectiveCode(question) || result.stdin !== currentEntry().stdin);
  $('output-status').textContent = changed ? 'コードまたは入力を変更しました。下は変更前の実行結果です。' : result?.status || 'ここに実行結果が表示されます。';
  $('run-status').textContent = result?.status || '未実行';
  $('run').disabled = !question;
  $('run').dataset.state = runner.active ? 'stop' : 'run';
  const action = runner.active ? '実行を停止' : 'コードを実行（⌘Enter）';
  $('run').setAttribute('aria-label', action); $('run').title = action;
  $('figures').replaceChildren();
  for (const [index, file] of (result?.files || []).entries()) {
    const figure = document.createElement('figure'), caption = document.createElement('figcaption');
    if (file.kind === 'figure') { const img = document.createElement('img'); img.src = `data:image/png;base64,${file.data}`; img.alt = `実行結果のグラフ ${index + 1}`; figure.append(img); }
    const label = document.createElement('span'); label.textContent = file.name;
    const button = document.createElement('button'); button.textContent = 'ファイルに保存'; button.type = 'button';
    button.addEventListener('click', () => {
      const bytes = Uint8Array.from(atob(file.data), c => c.charCodeAt(0));
      download(new Blob([bytes], { type: file.kind === 'figure' ? 'image/png' : 'application/octet-stream' }), file.name);
    });
    caption.append(label, button); figure.append(caption); $('figures').append(figure);
  }
}
function effectiveCode(q) {
  if (q.useExistingQuestionCode) {
    const p = selectedSet.questions.find(p => p.questionId === q.useExistingQuestionCode && p.version === q.version);
    return currentEntry(p).code;
  }
  return currentEntry(q).code;
}
const runner = new PythonRunner(event => {
  if (!runSnapshot) return;
  const result = outputs.get(runSnapshot.key);
  if (!result) return;
  if (event.type === 'text') { if(event.stream === 'stderr') result.stderr += event.text; else {result.text += event.text;if(event.stream==='input')result.inputEcho+=event.text;else result.stdout+=event.text;} }
  if (event.type === 'status') result.status = event.text;
  if (event.type === 'figure') result.files.push({ kind: 'figure', name: `graph-${result.files.length + 1}.png`, data: event.data });
  if (event.type === 'file') result.files.push({ kind: 'file', name: String(event.name).replace(/[^\p{L}\p{N}_.-]/gu, '_'), data: event.data });
  if (event.type === 'input') {
    result.status = '入力を待っています'; $('interactive-input').hidden = false; $('input-line').value = ''; $('input-line').focus();
  }
  if (event.type === 'done') {
    result.outcome='success';
    result.status = '実行が終了しました';
    const e = entries.get(runSnapshot.key);
    if (e && runSnapshot.code === effectiveCode(question) && e.stdin === runSnapshot.stdin) { e.practiced = true; saveAuto(e); }
  }
  if (event.type === 'error') { result.error = event.error; result.status = 'エラーで終了しました';result.outcome='error';result.truncated=event.error.includes('出力が上限'); }
  if (event.type === 'stopped') {result.status = event.text;result.outcome='stopped';}
  if (['done', 'error', 'stopped'].includes(event.type)) $('interactive-input').hidden = true;
  if (questionKey(question) === runSnapshot.key) { renderOutput(); updateProgress();cloudPanel?.render(); }
});
function run() {
  if (!question || runner.active) return;
  const e = currentEntry(), code = effectiveCode(question);
  if (code.length > LIMITS.code || e.stdin.length > LIMITS.code) return showNotice('コードまたは入力値が長すぎます。', true);
  runSnapshot = { key: questionKey(question), code, stdin: e.stdin };
  outputs.set(runSnapshot.key, { code, stdin: e.stdin, text: '', stdout:'',inputEcho:'',stderr: '', error: '', outcome:'not_run',truncated:false,status: '準備中', files: [] });
  runner.run({ code, setupCode: question.setupCode, stdin: stdinLines(e.stdin) });
  renderOutput();
  cloudPanel?.render();
}
function addCloudCatalog(incoming) {
  const existing=catalog?.sets.flatMap(s=>s.questions)||[];
  for(const q of incoming.sets.flatMap(s=>s.questions)) {
    const old=existing.find(p=>questionKey(p)===questionKey(q));
    if(old && ['prompt','templateCode','setupCode','kind','useExistingQuestionCode'].some(k=>old[k]!==q[k]))throw new Error('同じID・版で問題内容が異なります。編集中の内容は保持しています。新しい版で接続してください。');
  }
  catalogGeneration++;
  if(!catalog)catalog={schema:'python-editor-catalog-v1',label:incoming.label,sets:[]};
  for(const set of incoming.sets) {
    const prior=catalog.sets.find(s=>s.setId===set.setId);
    if(prior){for(const q of set.questions)if(!prior.questions.some(p=>questionKey(p)===questionKey(q)))prior.questions.push(q);}
    else catalog.sets.push(set);
  }
  $('set-select').replaceChildren();
  for(const set of catalog.sets){const option=document.createElement('option');option.value=set.setId;option.textContent=set.title;$('set-select').append(option);}
  const wanted=pendingRequested&&catalog.sets.find(s=>(!requested.set||s.setId===requested.set)&&s.questions.some(q=>(!requested.question||q.questionId===requested.question)&&(!requested.version||q.version===requested.version)));
  if(wanted&&!runner.active&&editGeneration===0) {
    pendingRequested=false;selectSet(wanted,wanted.questions.find(q=>(!requested.question||q.questionId===requested.question)&&(!requested.version||q.version===requested.version)));
  } else if(selectedSet)selectSet(selectedSet,question,true);else if(catalog.sets[0])selectSet(catalog.sets[0]);
}
function importCloudDraft(incoming) {
  pendingRequested=false;
  if(!store)throw new Error('取り込み前の控えを保存できません。コードをファイルに保存してください。');
  const set=catalog.sets.find(s=>s.questions.some(q=>questionKey(q)===questionKey(incoming))),q=set?.questions.find(q=>questionKey(q)===questionKey(incoming));
  if(!q)throw new Error('この問題・版を読み込めません。GSSの下書きは保持しています。');
  const validated=validateDraft({app:APP,version:FORMAT,entries:[incoming]}).entries[0],before={...currentEntry(q)};
  store.prepareImport(before,'GSSの続きの取り込み前');
  const entry={...validated,updatedAt:new Date().toISOString(),practiced:false};
  store.write(entry,'auto');entries.set(questionKey(q),entry);docs.delete(questionKey(q));outputs.delete(questionKey(q));
  if(runner.active)runner.stop('GSSの下書きを取り込むため停止しました。');
  selectSet(set,q);
}
function download(blob, name) {
  const url = URL.createObjectURL(blob), a = document.createElement('a'); a.href = url; a.download = name;
  a.click(); setTimeout(() => URL.revokeObjectURL(url), 60000);
}
function saveBrowser() {
  if (!question) return;
  try { if (!store) throw new Error('ブラウザ保存が利用できません。'); store.write({...currentEntry(), updatedAt: new Date().toISOString()}, 'manual'); $('save-status').textContent = 'ブラウザに明示保存済み'; }
  catch (e) { showNotice(e.message, true); }
  closeMenus(true);
}
function saveFile() {
  if (!question) return;
  download(new Blob([JSON.stringify(exportDraft(entries.values()), null, 2)], {type:'application/json'}), 'python-draft.json');
  closeMenus(true);
  showNotice('保存ファイルを作成しました。ダウンロード先を確認してください。ファイルメニューから取り込めます。');
}
function restoreDialog() {
  closeMenus(true);
  try {
    if (!store) throw new Error('ブラウザ保存が利用できません。');
    const candidates = store.candidates(question); $('restore-options').replaceChildren();
    if (!candidates.length) { const p = document.createElement('p'); p.textContent = '保存された内容がありません。'; $('restore-options').append(p); }
    for (const c of candidates) {
      const button = document.createElement('button'); button.textContent = `${c.label} / ${c.entry.updatedAt || '日時不明'}`; button.type = 'button';
      button.addEventListener('click', () => { $('restore-dialog').close(); prepareImport([c.entry], c.label); });
      $('restore-options').append(button);
    }
    openDialog($('restore-dialog'));
  } catch (e) { showNotice(e.message, true); }
}
function prepareImport(rawEntries, source) {
  const known = new Set(catalog.sets.flatMap(s => s.questions.map(questionKey)));
  const matching = rawEntries.filter(e => known.has(questionKey(e)));
  if (!matching.length) throw new Error('現在表示できる問題・版と一致するコードがありません。元のファイルは保持してください。');
  pendingImport = matching;
  $('import-description').textContent = `${source}から${matching.length}問を取り込みます。${rawEntries.length - matching.length}問は未読込の版のため取り込みません。`;
  $('import-preview').textContent = matching[0].code;
  openDialog($('import-dialog'));
}
function applyImport() {
  pendingRequested=false;
  if (runner.active) runner.stop('保存内容を取り込むため停止しました。');
  try {
    if (!store) throw new Error('取込み前の控えを保存できません。現在のコードをファイルへ保存してください。');
    const all = catalog.sets.flatMap(s => s.questions);
    // 全件の元内容を先に退避。退避失敗なら新コードを適用しない。
    for (const incoming of pendingImport) {
      const q=all.find(q => questionKey(q) === questionKey(incoming)),before={...currentEntry(q)};
      store.prepareImport(before, '保存内容の取込み前');
    }
    let anyFailure=false;
    for (const incoming of pendingImport) {
      const e = {...incoming, updatedAt: new Date().toISOString(), practiced: false};
      entries.set(questionKey(e), e); docs.delete(questionKey(e)); saveAuto(e);anyFailure ||= saveFailed;
    }
    saveFailed=anyFailure;$('import-dialog').close(); selectQuestion(question);
    showNotice(saveFailed ? 'コードを取り込みましたが、自動保存に失敗しました。ファイルに保存してください。' : '控えを残してコードを取り込みました。', saveFailed);
  } catch (e) { showNotice(e.message, true); }
}
function openDialog(dialog) {
  const opener = document.activeElement;
  dialog.addEventListener('close', () => {if(opener?.isConnected && opener.getClientRects().length) opener.focus();else if(cm) cm.focus();else $('code').focus();}, {once:true}); dialog.showModal();
}
async function init() {
  $('code').readOnly=true;$('run').disabled=true;
  try { store = new DraftStore(); } catch { showNotice('ブラウザ保存を利用できません。ファイルに保存してください。', true); }
  if (globalThis.CodeMirror) {
    cm = CodeMirror.fromTextArea($('code'), {mode:'python', readOnly:true, lineNumbers:true, indentUnit:4, tabSize:4, viewportMargin:20, lineWrapping:true, extraKeys:{Tab: cm => cm.somethingSelected() ? cm.indentSelection('add') : cm.replaceSelection(' '.repeat(4),'end'), 'Cmd-Enter':run, 'Ctrl-Enter':run, 'Shift-Enter':run}});
    cm.getWrapperElement().setAttribute('aria-label', 'Pythonコード');
    cm.getInputField().setAttribute('aria-label', 'Pythonコード');
    cm.on('change', dirty);
  }
  $('code').addEventListener('input', dirty); $('stdin').addEventListener('input', dirty);
  cloudPanel=new CloudPanel({question:()=>question,entry:q=>({...currentEntry(q)}),run:q=>outputs.get(questionKey(q)),running:()=>!!runner.active,
    notice:showNotice,closeMenus:()=>closeMenus(true),addCatalog:addCloudCatalog,importDraft:importCloudDraft,
    archive:(e,reason)=>{if(!store)throw new Error('ローカルの控えを保存できません。コードをファイルに保存してください。');store.archive(e,reason);}});
  try { JohoUI.theme({storageKey:'joho.pythoneditor.view.v1',themeSelect:$('theme'),sizeSelect:$('text-size')}); JohoUI.tooltip(); } catch {}
  let help;
  try { help = JohoToolHelp.create({root:$('operation-help'),opener:$('help-button'),title:'Pythonエディタの使い方',storageKey:'joho.pythoneditor.help.v1',returnToEditor:()=>cm ? cm.focus() : $('code').focus(),bounds:()=>({top:$('topbar')?.getBoundingClientRect().bottom || 50,bottom:innerHeight-10})}); } catch { $('help-button').disabled = true; }
  const interactive = typeof WebAssembly.Suspending === 'function' || (crossOriginIsolated && typeof SharedArrayBuffer !== 'undefined');
  $('input-mode').textContent = interactive ? '空欄のまま実行すると、出力欄からその都度入力できます。まとめて渡す場合は1回分ずつ改行してください。' : 'このブラウザでは、値を1回分ずつ改行して指定してください。出力欄での逐次入力にはGoogle Chromeを使用できます。';
  $('run').addEventListener('click', () => runner.active ? runner.stop() : run());
  $('save-browser').addEventListener('click', saveBrowser); $('save-file').addEventListener('click', saveFile);
  $('restore-browser').addEventListener('click', restoreDialog);
  $('open-file').addEventListener('click', () => {closeMenus(true); $('file-input').click();});
  $('file-input').addEventListener('change', async () => {
    const file = $('file-input').files[0], target=question ? {...currentEntry()} : null; $('file-input').value = ''; if (!file || !target) return;
    try {
      if (file.size > 6000000) throw new Error('保存ファイルが大きすぎます。');
      const text = await file.text();
      const imported = file.name.endsWith('.py') ? [{...target,code:text,practiced:false}] : validateDraft(JSON.parse(text)).entries;
      prepareImport(validateDraft({app:APP,version:FORMAT,entries:imported}).entries, file.name);
    } catch (e) { showNotice(e.message, true); }
  });
  for (const button of document.querySelectorAll('[data-close]')) button.addEventListener('click', () => button.closest('dialog').close());
  $('confirm-import').addEventListener('click', applyImport);
  $('interactive-input').addEventListener('submit', e => { e.preventDefault(); try { if (runner.input($('input-line').value)) $('interactive-input').hidden = true; } catch (error) { showNotice(error.message, true); } });
  $('input-eof').addEventListener('click', () => { runner.input('',true); $('interactive-input').hidden = true; });
  $('set-select').addEventListener('change', () => {pendingRequested=false;selectSet(catalog.sets.find(s => s.setId === $('set-select').value));});
  $('previous').addEventListener('click', () => selectQuestion(selectedSet.questions[selectedSet.questions.indexOf(question)-1]));
  $('next').addEventListener('click', () => selectQuestion(selectedSet.questions[selectedSet.questions.indexOf(question)+1]));
  $('list-toggle').addEventListener('click', () => { const hidden = !$('question-nav').hidden; $('question-nav').hidden = hidden; document.querySelector('.layout').classList.toggle('nav-hidden',hidden); $('list-toggle').setAttribute('aria-expanded',String(!hidden)); });
  document.addEventListener('keydown', e => {
    if (e.isComposing || help?.root.contains(e.target) || document.querySelector('dialog[open]')) return;
    if (e.key === 'Enter' && !e.altKey && (e.metaKey || e.ctrlKey || e.shiftKey) && !e.target.closest('#interactive-input')) {e.preventDefault();run();}
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {e.preventDefault();saveBrowser();}
    if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'o') {e.preventDefault();$('file-input').click();}
    if (e.key === 'Escape') closeMenus(true);
  });
  document.addEventListener('click', e => {if (!e.target.closest('.menu')) closeMenus();});
  addEventListener('beforeunload', e => {if (saveFailed) {e.preventDefault();e.returnValue='';}});
  addEventListener('pagehide', () => runner.dispose());
  // 固定した同一originの読取経路だけ。401/403や不正応答では別経路へ取得しない。
  const initialGeneration=catalogGeneration;
  try {
    const response = await fetch('/__pythoneditor/catalog', {cache:'no-store',credentials:'same-origin',signal:AbortSignal.timeout(60000)});
    if(initialGeneration!==catalogGeneration)return;
    if (response.status === 404) { catalog = validateCatalog(demoCatalog); showNotice('独立試作・動作確認サンプル。正式採点とクラウド保存は接続前です。'); }
    else {
      if (!response.ok) throw new Error(response.status === 401 || response.status === 403 ? '問題の取得には認証・権限の確認が必要です。' : '問題データを取得できませんでした。再読み込みしてください。');
      const raw=await response.json();if(initialGeneration!==catalogGeneration)return;
      catalog = validateCatalog(raw); showNotice('教員用の問題マスター確認。問題文は編集中です。今年度は旧版を使用します。');
    }
    if (!catalog.sets.length || !catalog.sets[0].questions.length) throw new Error('表示できる問題がありません。');
    $('catalog-label').textContent = catalog.label;
    for (const set of catalog.sets) { const option = document.createElement('option'); option.value = set.setId; option.textContent = set.title; $('set-select').append(option); }
    let last; try { last = store?.last(); } catch {}
    const selection = requested.set || requested.question ? requested : last || {};
    const matchesSelection = q => q.questionId === selection.question && (!selection.version || q.version === selection.version);
    const set = catalog.sets.find(s => s.setId === selection.set && (!selection.question || s.questions.some(matchesSelection)))
      || catalog.sets.find(s => s.questions.some(matchesSelection)) || catalog.sets.find(s => s.setId === selection.set) || catalog.sets[0];
    const selected = set.questions.find(q => q.questionId === selection.question && (!selection.version || q.version === selection.version));
    pendingRequested=cloudConfig.enabled&&!!(requested.set||requested.question)&&(!catalog.sets.some(s=>(!requested.set||s.setId===requested.set)&&s.questions.some(q=>(!requested.question||q.questionId===requested.question)&&(!requested.version||q.version===requested.version))));
    if ((selection.version || selection.question) && !selected) showNotice('指定した問題・版がありません。別版の下書きを上書きせず、一覧を表示します。',true);
    selectSet(set,selected);
  } catch (e) {if(initialGeneration!==catalogGeneration)return;showNotice(e.message || 'エディタを開始できませんでした。',true);$('run').disabled=true;}
}
init().catch(e => showNotice('エディタの初期化に失敗しました: ' + e.message,true));
