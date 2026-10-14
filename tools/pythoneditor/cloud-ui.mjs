import { questionKey, validateCatalog } from './core.mjs';
import { cloudConfig } from './cloud-config.mjs';
import { GoogleBridge, CloudWorkspace, submissionText, codeHash, bridgeURL } from './cloud.mjs';
const $ = id => document.getElementById(id);
const score = n => n === null || n === undefined ? 'なし' : `${Math.round(n*1000)/10} 点`;
const date = value => new Date(value).toLocaleString('ja-JP');
export class CloudPanel {
  constructor(host) {
    this.host=host;this.bridge=new GoogleBridge(cloudConfig);this.states=new Map();this.readRevisions=new Map();this.generation=0;this.working=false;this.opener=null;
    $('cloud-connect').addEventListener('click',()=>this.connect());
    $('save-cloud').addEventListener('click',()=>{host.closeMenus();this.save();});
    $('open-cloud').addEventListener('click',()=>{host.closeMenus();this.restore();});
    $('formal-submit').addEventListener('click',()=>this.prepareSubmit());
    $('formal-query').addEventListener('click',()=>this.query(false));
    $('formal-resume').addEventListener('click',()=>this.query(true));
    $('submit-confirm').addEventListener('click',()=>this.submit());
    $('conflict-cloud').addEventListener('click',()=>this.resolveConflict('cloud'));
    $('conflict-local').addEventListener('click',()=>this.resolveConflict('local'));
    for(const dialog of [$('cloud-dialog'),$('cloud-conflict'),$('submit-dialog')])dialog.addEventListener('close',()=>{if(this.opener?.isConnected)this.opener.focus();});
    if(cloudConfig.enabled) {
      $('cloud-login').href=bridgeURL(cloudConfig,location.origin,crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''));
      $('cloud-login').hidden=false;
    }
    this.render();
    addEventListener('pagehide',()=>this.bridge.dispose());
  }
  open(dialog) {this.opener=document.activeElement;dialog.showModal();}
  fail(e) {
    this.host.notice(e.message||'通信を完了できませんでした。コードは保持しています。',true);
    if(['login_required','not_allowed','unavailable','maintenance','transport','disconnected'].includes(e.code)) {
      this.connected=false;$('cloud-account').textContent='接続を確認してください（コードと送信番号は保持）';
    }
    if(!this.connected)$('cloud-account').textContent=e.code==='disabled'?'接続前・本番設定待ち':'未接続（コードと送信番号は保持）';
  }
  async withWork(fn) {
    if(this.working)return;
    this.working=true;this.render();
    try {await fn();}catch(e){this.fail(e);}finally{this.working=false;this.render();}
  }
  async connect() {
    await this.withWork(async()=>{
      this.connected=false;
      $('cloud-account').textContent='学校アカウントを確認しています…';
      const session=await this.bridge.connect(), catalog=validateCatalog(session.catalog);
      if(!Array.isArray(session.policies))throw new Error('受付設定の形式を確認できません。');
      this.cloud=new CloudWorkspace((...args)=>this.bridge.call(...args),session,localStorage);
      this.host.addCatalog(catalog);
      this.connected=true;this.states.clear();this.readRevisions.clear();
      $('cloud-account').textContent=`${session.account}${session.teacher?'（教員閲覧）':''}`;
      this.host.notice(catalog.sets.length ? '学校の採用版を問題一覧へ追加しました。GSS保存と正式提出はそれぞれの操作で行います。' : '学校アカウントに接続しました。現在、採用・受付設定された問題はありません。');
      await this.refreshCurrent();
    });
  }
  revision(q) {const n=(this.readRevisions.get(q.questionId)||0)+1;this.readRevisions.set(q.questionId,n);return n;}
  render() {
    const q=this.host.question(), policy=q&&this.cloud?.policy(q), enabled=this.connected&&!!policy;
    $('cloud-connect').disabled=this.working;
    $('cloud-connect').textContent=this.connected?'再接続':'学校アカウントに接続';
    $('save-cloud').disabled=this.working||!enabled;
    $('open-cloud').disabled=this.working||!this.connected;
    $('formal-submit').disabled=this.working||!enabled||!policy?.canSubmit||this.host.running();
    $('formal-query').disabled=this.working||!enabled;
    $('formal-resume').disabled=this.working||!enabled;
    if(!this.connected)$('cloud-account').textContent ||= cloudConfig.enabled?'未接続':'接続前・本番設定待ち';
    $('cloud-save-status').textContent=q&&this.cloud?.bases.has(questionKey(q))?'GSS下書きの更新番号を保持':'GSS下書きは別途保存';
    const state=q&&this.states.get(questionKey(q)), receipt=state?.receipt;
    let pending;
    try{pending=q&&this.cloud?.journal.pending({...q,assignmentId:policy?.assignmentId},'submit');}catch(e){$('formal-status').textContent=e.message;return;}
    $('formal-status').textContent=pending&&pending.input.requestId!==receipt?.requestId?'今回の送信は完了未確認':receipt?.state==='submitted'?'前回の提出：提出済み':receipt?.state==='pending'?'受付済み・採点/結果保存待ち':pending?'送信の完了未確認':enabled?(state?'未提出':'未照会'):'接続前';
    $('formal-score').textContent=receipt?.state==='submitted'?`最新の得点 ${score(receipt.score)}${receipt.late?'（締切後・成績対象外）':''}`:'';
    $('formal-best').textContent=state?`この問題の締切内最高点 ${score(state.bestScore)}`:'';
    $('formal-time').textContent=receipt?`サーバー受付 ${date(receipt.receivedAt)} ／ 締切 ${date(receipt.dueAt)}`:policy?`締切 ${date(policy.dueAt)}`:'';
    $('formal-note').textContent=!enabled?'今年度は従来のColabで提出してください。':this.cloud?.session.teacher?'教員閲覧では生徒の成績として提出しません。':receipt?.state==='pending'?'採点と結果保存が完了してから提出済みになります。「採点・保存を再試行」で続けられます。':'実行結果・ローカル進捗と、下の正式得点・提出履歴は別です。';
    $('formal-checks').replaceChildren();
    for(const check of receipt?.checks||[]){const li=document.createElement('li');li.textContent=`${check.passed?'✓':'×'} ${check.label}（${check.earned} / ${check.points}）`;$('formal-checks').append(li);}
    $('formal-diagnostics').textContent=(receipt?.diagnostics||[]).join('\n');
    $('formal-history').replaceChildren();
    for(const h of state?.history||[]){const li=document.createElement('li');li.textContent=`${date(h.receivedAt)} ／ ${score(h.score)}${h.late?' ／ 締切後':''} ／ ${h.version}`;$('formal-history').append(li);}
    $('formal-history-details').hidden=!state?.history?.length;
    if(state?.pending?.length)$('formal-note').textContent+=` 未完了の受付が${state.pending.length}件あります。「採点・保存を再試行」で続けられます。`;
    for(const button of $('question-list').querySelectorAll('button')) {
      let label=button.querySelector('.question-item-formal');
      if(!label){label=document.createElement('span');label.className='question-item-state question-item-formal';button.querySelector('.question-item-title').parentElement.append(label);}
      const formal=this.states.get(button.dataset.key)?.receipt;
      label.textContent=formal?.state==='submitted'?'正式：前回提出済み':formal?.state==='pending'?'正式：処理待ち':'';
    }
    const generation=++this.generation;
    $('formal-edited').textContent='';
    if(q&&receipt?.state==='submitted') {
      const entry=this.host.entry(q);
      codeHash(entry.code).then(hash=>{
        if(generation!==this.generation)return;
        $('formal-edited').textContent=questionKey(q)!==questionKey(receipt)?'この結果は別の版での提出です。':hash!==receipt.codeHash?'現在のコードは提出時から変更されています。再提出するまで得点は変わりません。':'現在のコードと提出時のコードは一致しています。';
      }).catch(()=>{});
    }
  }
  async refreshCurrent() {
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);
    if(!this.connected||!policy)return;
    const cloud=this.cloud,revision=this.revision(q);let result;
    try{result=await cloud.recover(q,policy.assignmentId);}catch(e){if(cloud!==this.cloud)return;throw e;}
    if(cloud!==this.cloud||revision!==this.readRevisions.get(q.questionId))return;
    this.states.set(questionKey(q),result);this.render();
  }
  async save() {
    const q=this.host.question();if(!q||!this.connected)return;
    const entry={...this.host.entry(q)};
    await this.withWork(async()=>{
      const result=await this.cloud.save(entry);
      if(result.state==='conflict'){if(!result.draft)throw new Error('GSSの下書き履歴を確認できません。ローカル内容は保持しています。教員へ連絡してください。');this.conflict={q,draft:result.draft};$('conflict-title').textContent=`${q.title}（${q.version}）の保存内容を選ぶ`;
        $('conflict-preview').textContent=result.draft.code;this.open($('cloud-conflict'));return;}
      const changed=this.host.entry(q).code!==result.sent?.code||this.host.entry(q).stdin!==result.sent?.stdin;
      this.host.notice(`${q.title}をGSSに保存しました。${changed?'保存したのは送信開始時の内容です。現在の編集内容はブラウザに保持しています。':''}`);
    });
  }
  async resolveConflict(choice) {
    const conflict=this.conflict;if(!conflict)return;
    await this.withWork(async()=>{
      const {q,draft}=conflict;
      if(choice==='cloud') {
        this.host.importDraft(draft);this.cloud.adoptRevision(q,draft.revision);$('cloud-conflict').close();
        this.host.notice('取り込み前のローカル内容を控えに残し、GSSの下書きを取り込みました。');
      } else {
        // 最新版を消す前に履歴へ退避する処理はサーバーCASの一部。ローカルにも選択内容の控えを残す。
        this.host.archive({...draft,updatedAt:draft.updatedAt,practiced:false},'GSS競合時の相手の下書き');
        this.host.archive({...this.host.entry(q)},'GSS競合時のローカル下書き');
        this.cloud.adoptRevision(q,draft.revision);$('cloud-conflict').close();await this.saveAfterConflict(q);
      }
    });
  }
  async saveAfterConflict(q) {
    const result=await this.cloud.save({...this.host.entry(q)});
    if(result.state==='conflict'){this.conflict={q,draft:result.draft};$('conflict-preview').textContent=result.draft.code;this.open($('cloud-conflict'));}
    else this.host.notice('両方の内容を保護し、ローカルの続きをGSSに保存しました。');
  }
  async restore() {
    if(!this.connected)return;
    await this.withWork(async()=>{
      const {drafts}=await this.cloud.call('listDrafts',{});$('cloud-options').replaceChildren();
      if(!drafts.length){const p=document.createElement('p');p.textContent='GSSに下書きがありません。';$('cloud-options').append(p);}
      for(const d of drafts){const button=document.createElement('button');button.type='button';button.textContent=`${d.questionId} ／ ${d.version} ／ ${date(d.updatedAt)}`;
        button.addEventListener('click',()=>this.chooseDraft(d));$('cloud-options').append(button);}
      $('cloud-preview').textContent='';$('cloud-import').disabled=true;$('cloud-revisions').replaceChildren();$('cloud-revisions').disabled=true;this.incoming=null;this.open($('cloud-dialog'));
    });
  }
  async chooseDraft(item,revision) {
    await this.withWork(async()=>{
      $('cloud-import').disabled=true;$('cloud-revisions').disabled=true;this.incoming=null;$('cloud-preview').textContent='保存内容を読み込んでいます…';
      const state=await this.cloud.draft(item),selected=revision||item.revision;
      const draft=state.draft?.revision===selected?state.draft:(await this.cloud.draft(item,selected)).draft;if(!draft)throw new Error('選択した下書きを取得できませんでした。');
      $('cloud-revisions').replaceChildren();
      for(const h of state.history||[]){const option=document.createElement('option');option.value=h.revision;option.textContent=`${date(h.updatedAt)}（更新${h.seq}）`;$('cloud-revisions').append(option);}
      $('cloud-revisions').value=draft.revision;$('cloud-revisions').disabled=false;$('cloud-revisions').onchange=()=>this.chooseDraft(item,$('cloud-revisions').value);
      this.incoming=draft;$('cloud-preview').textContent=draft.code;$('cloud-import').disabled=false;
      $('cloud-import').onclick=()=>{try{this.host.importDraft(this.incoming);this.cloud.adoptRevision(this.incoming,this.incoming.revision);$('cloud-dialog').close();this.host.notice('ローカルの控えを残してGSSの続きを取り込みました。');this.render();}catch(e){this.fail(e);}};
    });
  }
  async prepareSubmit() {
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);if(!this.connected||!policy?.canSubmit)return;
    await this.withWork(async()=>{
      const pending=this.cloud.journal.pending({...q,assignmentId:policy.assignmentId},'submit');
      this.submission={q,input:pending?.input||await submissionText({...this.host.entry(q)},policy,this.host.run(q))};
      $('submit-description').textContent=`${q.title}（${q.version}）を提出します。${pending?'前回の未確認の送信を、同じ番号・同じ全文で再送します。':''}コード全文・入力値・実行の表示テキスト・標準エラーを学校のGSSへ送信します。受付時刻はサーバーで記録し、締切内のこの問題の最高点を成績に採用します。`;
      $('submit-preview').textContent=this.submission.input.code;
      $('submit-run-note').textContent=this.submission.input.run.outcome==='not_run'?'このコードの実行結果がないため、出力テキストは空で送信します。':'';
      this.open($('submit-dialog'));
    });
  }
  async submit() {
    if(!this.submission)return;
    const {q,input}=this.submission;$('submit-dialog').close();
    await this.withWork(async()=>{
      const result=await this.cloud.submit(input);this.revision(q);this.states.set(questionKey(q),result);
      this.host.notice(result.receipt?.state==='submitted'?`${q.title}の採点と結果・履歴の保存が完了しました。`:'受付記録を保持しています。結果保存を確認してください。');
    });
  }
  async query(resume) {
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);if(!this.connected||!policy)return;
    await this.withWork(async()=>{
      const revision=this.revision(q);
      let result=await this.cloud.recover(q,policy.assignmentId,resume);
      if(resume&&result.receipt?.state==='pending')result=await this.cloud.call('resumeSubmission',{requestId:result.receipt.requestId});
      else if(resume&&result.pending?.length)result=await this.cloud.call('resumeSubmission',{requestId:result.pending[0].requestId});
      if(resume)this.revision(q);else if(revision!==this.readRevisions.get(q.questionId))return;
      this.states.set(questionKey(q),result);
      this.host.notice(result.unreceived?'サーバーに受付記録が見つかりません。送信控えを保持しています。「正式提出」から同じ要求を再送できます。':result.receipt?.state==='submitted'?'提出済みの結果を確認しました。':result.receipt?.state==='pending'?'受付済みですが、採点・結果保存は未完了です。':'この問題の提出記録はありません。');
    });
  }
}
