import { questionKey, validateCatalog } from './core.mjs';
import { cloudConfig } from './cloud-config.mjs';
import { validateRating, ratingKey } from './navigation.mjs';
import { GoogleBridge, CloudWorkspace, CloudError, submissionText, codeHash, bridgeURL } from './cloud.mjs';
import { toolsStoreConfig } from './tools-store-config.mjs';
import { ToolsDraftPanel } from './tools-store-ui.mjs';
const $ = id => document.getElementById(id);
const score = n => n === null || n === undefined ? 'なし' : `${Math.round(n*1000)/10} 点`;
const date = value => new Date(value).toLocaleString('ja-JP');
export class CloudPanel {
  constructor(host) {
    this.host=host;this.bridge=new GoogleBridge(cloudConfig);this.states=new Map();this.ratings=new Map();this.schoolKeys=new Set();this.readRevisions=new Map();this.codeComparisons=new Map();this.working=false;this.opener=null;this.connectionGeneration=0;
    this.studentGrading=toolsStoreConfig.enabled&&toolsStoreConfig.studentGrading===true;
    if(toolsStoreConfig.enabled)this.drafts=new ToolsDraftPanel(host,()=>this.render(),{beforeAttach:connection=>this.beforeDraftAttach(connection)});
    $('cloud-connect').addEventListener('click',()=>{host.closeMenus();this.connect();});
    $('save-cloud').addEventListener('click',()=>{host.closeMenus();this.save();});
    $('open-cloud').addEventListener('click',()=>{host.closeMenus();this.restore();});
    $('formal-submit').addEventListener('click',()=>{host.closeMenus();this.prepareSubmit();});
    $('formal-query').addEventListener('click',()=>this.query(false));
    $('formal-resume').addEventListener('click',()=>this.query(true));
    $('submit-confirm').addEventListener('click',()=>this.submit());
    $('conflict-cloud').addEventListener('click',()=>this.resolveConflict('cloud'));
    $('conflict-local').addEventListener('click',()=>this.resolveConflict('local'));
    for(const dialog of [$('cloud-dialog'),$('cloud-conflict'),$('submit-dialog')])dialog.addEventListener('close',()=>{if(this.opener?.isConnected)this.opener.focus();});
    if(cloudConfig.enabled&&!this.studentGrading) {
      $('cloud-login').href=bridgeURL(cloudConfig,location.origin,crypto.randomUUID().replaceAll('-','')+crypto.randomUUID().replaceAll('-',''));
      $('cloud-login').hidden=false;
    }
    this.render();
    addEventListener('pagehide',()=>this.bridge.dispose());
  }
  open(dialog) {this.opener=document.activeElement;dialog.showModal();}
  fail(e) {
    this.host.notice(e.message||'通信を完了できませんでした。コードは保持しています。',true);
    if(this.drafts){this.drafts.fail(e);if(!this.drafts.connected)this.connected=false;return;}
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
      this.connectionGeneration++;
      if(this.drafts){await this.drafts.connect();if(!cloudConfig.enabled&&!this.studentGrading)return;}
      $('cloud-account').textContent='学校アカウントを確認しています…';
      await this.connectGrading();
    });
  }
  hasPendingSubmissions() {
    const journal=this.cloud?.journal;if(!journal)return false;
    for(let i=0;i<journal.storage.length;i++) {
      const key=journal.storage.key(i);
      if(key?.startsWith(journal.prefix+'submit.')){journal.read(key);return true;}
    }
    return false;
  }
  beforeDraftAttach(connection) {
    if(this.cloud&&this.cloud.session.actorKey!==connection.actorKey&&this.hasPendingSubmissions())
      throw new CloudError('pending_account','前のアカウントの未確認の提出があります。元の学校アカウントで結果を照会してください。コードと送信番号は保持しています。');
    this.connectionGeneration++;this.connected=false;this.submission=null;
  }
  ready() {return this.connected&&(!this.studentGrading||this.drafts?.connected===true);}
  current(cloud,generation) {return this.ready()&&this.cloud===cloud&&this.connectionGeneration===generation;}
  async connectGrading() {
    const generation=this.connectionGeneration, draftBridge=this.drafts?.bridge;
    let session,rpc;
    if(this.studentGrading) {
      if(!this.drafts?.connected||!draftBridge)throw new CloudError('disconnected','学校アカウントへ再接続してください。');
      const actorKey=this.drafts.client.session.actorKey;
      session=await draftBridge.call('gradingSession',{});
      if(generation!==this.connectionGeneration||draftBridge!==this.drafts.bridge)return;
      if(session.actorKey!==actorKey)throw new CloudError('actor_mismatch','保存用と採点用の本人確認が一致しません。再接続してください。');
      rpc=async(action,input,expectedActor)=>{
        if(generation!==this.connectionGeneration||draftBridge!==this.drafts.bridge||!this.drafts.connected||expectedActor!==actorKey)
          throw new CloudError('disconnected','提出時の学校アカウントへ再接続してください。送信控えは保持しています。');
        if(!['submit','getSubmission','resumeSubmission','questionStatus'].includes(action))throw new CloudError('action','提出用の操作を確認できません。');
        return draftBridge.call(action,input);
      };
    } else {
      session=await this.bridge.connect();
      if(generation!==this.connectionGeneration)return;
      rpc=(...args)=>this.bridge.call(...args);
    }
    if(this.drafts?.connected&&session.account!==this.drafts.client.session.account)throw new CloudError('actor_mismatch','保存用と提出用の学校アカウントが一致しません。再接続してください。');
    const catalog=validateCatalog(session.catalog);
    if(!Array.isArray(session.policies))throw new Error('受付設定の形式を確認できません。');
    const cloud=new CloudWorkspace(rpc,session,localStorage),schoolKeys=new Set(),ratings=new Map();
    for(const q of catalog.sets.flatMap(set=>set.questions))schoolKeys.add(questionKey(q));
    for(const item of session.ratings||[]) {
      const key=ratingKey(item),policy=session.policies.filter(p=>questionKey(p)===key);
      if(policy.length!==1||policy[0].assignmentId!==item.assignmentId||!schoolKeys.has(key))throw new Error('評価の対象を確認できません。');
      ratings.set(key,validateRating(item.rating));
    }
    if(generation!==this.connectionGeneration)return;
    this.cloud=cloud;this.schoolKeys=schoolKeys;this.ratings=ratings;
    this.states.clear();this.readRevisions.clear();this.codeComparisons.clear();this.submission=null;
    this.installingCatalog=true;
    try{this.host.addCatalog(catalog);}finally{this.installingCatalog=false;}
    this.connected=true;
    $('cloud-account').textContent=`${session.account}${session.teacher?'（教員閲覧）':''}`;
    this.host.notice(catalog.sets.length?'学校の採用版を問題一覧へ追加しました。クラウドへの下書き保存と正式提出は別です。':'学校アカウントに接続しました。現在、採用・受付設定された問題はありません。');
    await this.refreshCurrent();
  }
  hasSchoolQuestion(q) {return this.schoolKeys.has(questionKey(q));}
  rating(q) {return this.ready() ? this.ratings.get(questionKey(q)) || null : null;}
  acceptState(q,result) {
    this.states.set(questionKey(q),result);
    if(result.rating)this.ratings.set(questionKey(q),validateRating(result.rating));
  }
  revision(q) {const n=(this.readRevisions.get(q.questionId)||0)+1;this.readRevisions.set(q.questionId,n);return n;}
  compareCode(q,receipt) {
    const key=questionKey(q),code=this.host.entry(q).code,previous=this.codeComparisons.get(key);
    if(previous?.code===code&&previous.hash===receipt.codeHash)return previous;
    const comparison={code,hash:receipt.codeHash,changed:null};this.codeComparisons.set(key,comparison);
    codeHash(code).then(hash=>{
      // A delayed hash must not describe a later edit or a reconnected account.
      if(this.codeComparisons.get(key)!==comparison)return;
      comparison.changed=hash!==receipt.codeHash;this.render();
    }).catch(()=>{});
    return comparison;
  }
  navigationStatus(q) {
    const policy=this.cloud?.policy(q);
    if(!this.ready()||!policy)return '';
    const state=this.states.get(questionKey(q)),receipt=state?.receipt;
    let pending;
    try{pending=this.cloud.journal.pending({...q,assignmentId:policy.assignmentId},'submit');}catch{return '送信状態を確認';}
    if(pending&&pending.input.requestId!==receipt?.requestId)return '送信の完了未確認';
    if(receipt&&questionKey(q)!==questionKey(receipt))return receipt.state==='submitted'?'別の版で提出':'別の版で採点・保存待ち';
    if(receipt?.state==='pending'&&state?.provisional?.state==='graded_waiting_collection')return '採点済み・教員側記録待ち';
    if(receipt?.state==='pending'||state?.pending?.length)return '採点・保存待ち';
    if(receipt?.state!=='submitted')return '';
    return this.compareCode(q,receipt).changed?'提出後に変更':'';
  }
  render() {
    const q=this.host.question(), policy=q&&this.cloud?.policy(q), enabled=this.ready()&&!!policy;
    let pending,journalError;
    try{pending=q&&policy&&this.cloud?.journal.pending({...q,assignmentId:policy.assignmentId},'submit');}catch(e){journalError=e;}
    $('cloud-connect').disabled=this.working||!(cloudConfig.enabled||toolsStoreConfig.enabled);
    const connectionLabel=this.connected||this.drafts?.connected?'学校アカウントに再接続':'学校アカウントに接続';
    $('cloud-connect-label').textContent=connectionLabel;
    $('cloud-connect').setAttribute('aria-label',connectionLabel);
    $('cloud-connect').title=cloudConfig.enabled||toolsStoreConfig.enabled?connectionLabel:'学校アカウント接続は準備中です';
    $('save-cloud').disabled=this.working||!(this.drafts?this.drafts.connected:enabled);
    $('open-cloud').disabled=this.working||!(this.drafts?this.drafts.connected:this.connected);
    $('formal-submit').disabled=this.working||!enabled||this.cloud?.session.teacher===true||!!journalError||(!policy?.canSubmit&&!pending)||this.host.running();
    $('formal-query').disabled=this.working||!enabled;
    $('formal-resume').disabled=this.working||!enabled;
    if(!this.connected)$('cloud-account').textContent ||= cloudConfig.enabled?'未接続':'接続前・本番設定待ち';
    $('cloud-save-status').textContent=this.connected?'GSSへの保存・復元は「ファイル」メニューから行います。':'GSS下書きは別途保存';
    if(this.drafts)this.drafts.render();
    const state=q&&this.states.get(questionKey(q)), receipt=state?.receipt;
    const provisional=receipt?.state==='pending'&&state?.provisional?.state==='graded_waiting_collection'?state.provisional:null;
    if(journalError){$('formal-status').textContent=journalError.message;return;}
    $('formal-status').textContent=pending&&pending.input.requestId!==receipt?.requestId?'今回の送信は完了未確認':receipt?.state==='submitted'?'前回の提出：提出済み':provisional?'採点済み・教員側記録待ち':receipt?.state==='pending'?'受付済み・採点/結果保存待ち':pending?'送信の完了未確認':enabled?(state?'未提出':'未照会'):'接続前';
    $('formal-score').textContent=receipt?.state==='submitted'?`最新の得点 ${score(receipt.score)}${receipt.late?'（締切後・成績対象外）':''}`:provisional?`採点結果（教員側保存待ち） ${score(provisional.score)}${receipt.late?'（締切後・成績対象外）':''}`:'';
    $('formal-best').textContent=state?`この問題の締切内最高点 ${score(state.bestScore)}`:'';
    $('formal-time').textContent=receipt?`サーバー受付 ${date(receipt.receivedAt)} ／ 締切 ${date(receipt.dueAt)}`:policy?`締切 ${date(policy.dueAt)}`:'';
    $('formal-note').textContent=!enabled?'今年度は従来のColabで提出してください。':this.cloud?.session.teacher?'教員閲覧では生徒の成績として提出しません。':provisional?'採点は完了し、教員側への結果・履歴の記録を待っています。記録が完了するまで提出済みや正式な★評価にはなりません。「結果を照会」で確認できます。':receipt?.state==='pending'?'採点と結果保存が完了してから提出済みになります。「採点・保存を再試行」で続けられます。':'実行結果・ローカル進捗と、ここに表示する正式得点・提出履歴は別です。';
    $('formal-checks').replaceChildren();
    for(const check of provisional?.checks||receipt?.checks||[]){const li=document.createElement('li');li.textContent=`${check.passed?'✓':'×'} ${check.label}（${check.earned} / ${check.points}）`;$('formal-checks').append(li);}
    $('formal-diagnostics').textContent=(provisional?.diagnostics||receipt?.diagnostics||[]).join('\n');
    $('formal-history').replaceChildren();
    for(const h of state?.history||[]){const li=document.createElement('li');li.textContent=`${date(h.receivedAt)} ／ ${score(h.score)}${h.late?' ／ 締切後':''} ／ ${h.version}`;$('formal-history').append(li);}
    $('formal-history-details').hidden=!state?.history?.length;
    if(state?.pending?.length&&!provisional)$('formal-note').textContent+=` 未完了の受付が${state.pending.length}件あります。「採点・保存を再試行」で続けられます。`;
    this.host.renderRatings?.();
    $('formal-edited').textContent='';
    if(q&&receipt) {
      if(questionKey(q)!==questionKey(receipt))$('formal-edited').textContent='この結果は別の版での提出です。';
      else if(receipt.state==='submitted') {
        const comparison=this.compareCode(q,receipt);
        if(comparison.changed!==null)$('formal-edited').textContent=comparison.changed?'現在のコードは提出時から変更されています。再提出するまで得点は変わりません。':'現在のコードと提出時のコードは一致しています。';
      }
    }
  }
  async refreshCurrent() {
    if(this.installingCatalog)return;
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);
    if(q)await this.drafts?.selected(q);
    if(!this.ready()||!policy)return;
    const cloud=this.cloud,generation=this.connectionGeneration,revision=this.revision(q);let result;
    try{result=await cloud.recover(q,policy.assignmentId);}catch(e){if(!this.current(cloud,generation))return;throw e;}
    if(!this.current(cloud,generation)||revision!==this.readRevisions.get(q.questionId))return;
    this.acceptState(q,result);this.render();
  }
  async save() {
    if(this.drafts)return this.withWork(()=>this.drafts.save());
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
    if(this.drafts)return this.withWork(()=>this.drafts.resolveConflict(choice));
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
    if(this.drafts)return this.withWork(()=>this.drafts.restore());
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
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);if(!this.ready()||!policy||this.cloud.session.teacher)return;
    await this.withWork(async()=>{
      const cloud=this.cloud,generation=this.connectionGeneration,pending=cloud.journal.pending({...q,assignmentId:policy.assignmentId},'submit');
      // 最終受付後も以前の不変要求の再送は可能。新しい提出は現在の受付設定に従う。
      if(!policy.canSubmit&&!pending)return;
      const input=pending?.input||await submissionText({...this.host.entry(q)},policy,this.host.run(q));
      if(!this.current(cloud,generation)||questionKey(q)!==questionKey(this.host.question()))return;
      this.submission={q,input,cloud,generation};
      $('submit-description').textContent=`${q.title}（${q.version}）を提出します。${pending?'前回の未確認の送信を、同じ番号・同じ全文で再送します。':''}コード全文・入力値・実行の表示テキスト・標準エラーを学校のGSSへ送信します。受付時刻はサーバーで記録し、締切内のこの問題の最高点を成績に採用します。`;
      $('submit-preview').textContent=this.submission.input.code;
      $('submit-run-note').textContent=this.submission.input.run.outcome==='not_run'?'このコードの実行結果がないため、出力テキストは空で送信します。':'';
      this.open($('submit-dialog'));
    });
  }
  async submit() {
    if(!this.submission)return;
    const {q,input,cloud,generation}=this.submission;$('submit-dialog').close();this.submission=null;
    if(!this.current(cloud,generation)){this.host.notice('接続が変わったため送信を開始しませんでした。提出内容をもう一度確認してください。',true);return;}
    await this.withWork(async()=>{
      const result=await cloud.submit(input);if(!this.current(cloud,generation))return;
      this.revision(q);this.acceptState(q,result);
      this.host.notice(result.receipt?.state==='submitted'?`${q.title}の採点と結果・履歴の保存が完了しました。`:result.provisional?.state==='graded_waiting_collection'?'採点は完了しました。教員側への結果・履歴の記録待ちです。「結果を照会」で確認できます。':'受付記録を保持しています。結果保存を確認してください。');
    });
  }
  async query(resume) {
    const q=this.host.question(),policy=q&&this.cloud?.policy(q);if(!this.ready()||!policy)return;
    await this.withWork(async()=>{
      const cloud=this.cloud,generation=this.connectionGeneration,revision=this.revision(q);
      let result=await cloud.recover(q,policy.assignmentId,resume);
      if(!this.current(cloud,generation))return;
      if(resume&&result.receipt?.state==='pending'&&!result.collectionPending&&!result.pendingRequestId)result=await cloud.call('resumeSubmission',{requestId:result.receipt.requestId});
      else if(resume&&result.pending?.length&&!result.receipt)result=await cloud.call('resumeSubmission',{requestId:result.pending[0].requestId});
      if(!this.current(cloud,generation))return;
      if(resume)this.revision(q);else if(revision!==this.readRevisions.get(q.questionId))return;
      this.acceptState(q,result);
      this.host.notice(result.unreceived?'サーバーに受付記録が見つかりません。送信控えを保持しています。「正式提出」から同じ要求を再送できます。':result.receipt?.state==='submitted'?'提出済みの結果を確認しました。':result.provisional?.state==='graded_waiting_collection'?'採点は完了し、教員側への結果・履歴の記録を待っています。':result.receipt?.state==='pending'?'受付済みですが、採点・結果保存は未完了です。':'この問題の提出記録はありません。');
    });
  }
  edited(entry){this.drafts?.edited(entry);}
  draftBadge(q){return this.drafts?.badge(q);}
  async resume(){
    if(!this.drafts)return;
    if(!this.studentGrading)return this.drafts.resume();
    return this.withWork(async()=>{if(await this.drafts.resume())await this.connectGrading();});
  }
  unsaved(){return this.drafts?.auto?.unsaved()||false;}
}
