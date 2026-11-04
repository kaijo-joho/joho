(function(){
  'use strict';var $=function(id){return document.getElementById(id);},controller,busy=false,packets=new Map(),historyKey='',sequence=0,lastPreview='';
  function ui(){return window.OMRWorkspaceUI;}
  function tell(message,error){OMRUI.notice(message,error);}
  function source(doc){return Object.assign({},doc.sync);}
  function currentPacket(){var u=ui(),doc=u&&u.store.current(),p=doc&&packets.get(doc.localId);return p&&p.reservation.ownerId===u.store.actor&&OMRDesigner.canonical(p.candidate.document)===OMRDesigner.canonical(doc.document)?p:null;}
  function preview(definition,index){var p=currentPacket();return p&&p.status==='registered'&&OMRDesigner.canonical(definition)===OMRDesigner.canonical(p.candidate.document.definition)?p.candidate.readerDefinition.pages[index].qr.payload:null;}
  function requestPrint(){finalizeVersion();}
  function refreshCanvas(){if(window.OMREditorAPI)window.OMREditorAPI.refresh();}
  async function run(fn){if(busy)return;busy=true;try{render();await fn();}catch(e){tell(e.message,true);$('registration-status').textContent=e.message+' 同じ対象を確認して再開できます。';if(flow.active){flowStatus(flow.stage,e.message,'error');if(flow.stage==='login')$('qr-flow-login-help').hidden=false;}}finally{busy=false;render();updateFlowButtons();}}
  function download(name,blob){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);}
  function setup(){var u=ui();if(!u||controller)return;controller=new OMRRelease.Controller({rpc:function(op,data){return u.client.call(op,data);},storage:localStorage,scope:'omr-registration-requests/1/'+encodeURIComponent(OMRCloudConfig.gasUrl),hash:OMRDesigner.hash,sha:OMRArtifacts.sha,uuid:function(){return crypto.randomUUID();},artifacts:OMRArtifacts.create(OMRCloudConfig.gasUrl),generate:OMRRegistrationPDF.build});}
  async function render(){
    setup();var u=ui();if(!u||!u.store.current())return;var own=++sequence,d=u.store.current(),p=currentPacket(),connected=!!(u.store.actor&&u.store.storeConfigured),registrationEnabled=u.store.registrationEnabled!==false,savedCurrent=false,currentHash=null,previous=packets.get(d.localId),edited=!!(previous&&previous.status==='registered'&&previous.reservation.ownerId===u.store.actor&&!p);
    if(busy){['register-form','registration-history','registered-pdf','registered-reader','qr-action','cloud-save-menu','confirm-registration','qr-flow-print','qr-flow-pdf'].forEach(function(id){if($(id))$(id).disabled=true;});['qr-flow-close','qr-flow-back'].forEach(function(id){if($(id))$(id).disabled=flow.stage!=='login';});return;}
    if(connected&&d.sync.versionId&&!d.pending){try{currentHash=await OMRDesigner.hash(d.document);savedCurrent=currentHash===d.sync.documentSha256;}catch(_){savedCurrent=false;}}
    if(own!==sequence||!u.store.current()||u.store.current().localId!==d.localId)return;p=currentPacket();
    $('register-form').disabled=busy;
    $('register-form').title=!connected?'Googleログイン確認とQR発行の手順を開く':p&&p.status==='registered'?'登録済み版と出力方法を確認する':'保存・QR発行・読み取り設定登録の手順を開く';
    if($('confirm-registration'))$('confirm-registration').disabled=busy||(flow.active&&u.store.registrationEnabled===false&&!flow.packet);
    if($('qr-flow-close'))$('qr-flow-close').disabled=busy&&flow.stage!=='login';
    if($('qr-flow-back'))$('qr-flow-back').disabled=busy&&flow.stage!=='login';
    $('registration-history').disabled=busy||!connected||!d.sync.formId;
    $('registered-pdf').disabled=busy||u.store.busy;$('registered-reader').disabled=busy||!p||p.status!=='registered';
    if($('cloud-save-menu'))$('cloud-save-menu').disabled=busy||u.store.busy;
    var top=$('qr-action'),topLabel=top.querySelector('span');top.disabled=busy||!d;
    if(p&&p.status==='registered'){topLabel.textContent='QR発行済み';top.title='現在の内容に対応する確定済みの版を確認';top.setAttribute('aria-label','QR発行済みの版を確認');}
    else if(!registrationEnabled){topLabel.textContent='登録受付停止中';top.title='登録は一時停止中です。下書き保存と登録履歴は利用できます';top.setAttribute('aria-label','登録受付停止中。登録履歴を開く');}
    else if(p&&p.status==='reserved'){topLabel.textContent='登録を再開';top.title='中断したOMR用紙登録を再開する';top.setAttribute('aria-label','OMR用紙登録を再開');}
    else{topLabel.textContent='QR発行（版確定）';top.title='版を確定してクラウドへ保存';top.setAttribute('aria-label','QR発行（版を確定して保存）');}
    var previewKey=p&&p.status==='registered'?p.reservation.registrationId:'unissued';if(previewKey!==lastPreview){lastPreview=previewKey;refreshCanvas();}
    if(p)$('cloud-status').textContent='用紙番号 '+p.reservation.paperNumber+' · クラウドに確定保存済み';
    if(busy)return;
    $('registration-status').textContent=p&&p.status==='registered'?'OMR用紙登録済み · '+p.reservation.academicYear+'年度 版'+p.reservation.releaseVersion+' · '+p.candidate.readerDefinition.pages.length+'ページ':!registrationEnabled?'OMR用紙登録は一時停止中 · 下書き保存と登録履歴は利用できます':edited?'編集後の用紙 · 未登録・QR未発行（元の登録版は履歴に保持）':'OMR用紙未登録 · QR未発行';
    $('register-form').textContent=p&&p.status==='registered'?'確定済みの版を印刷・PDF保存…':'QR発行・印刷…';
    if(p&&p.status==='registered')$('registration-note').textContent='この版はクラウドに確定保存済みです。PDFはPDF出力からPCへ保存できます。';
    else if(!registrationEnabled)$('registration-note').textContent='OMR用紙登録は一時停止中です。下書き保存・登録履歴・既登録PDFは利用できます。';
    else if(!connected)$('registration-note').textContent='下書きはこのブラウザに保存します。「QR発行」ではGoogleログイン確認から版の確定保存・印刷へ進めます。';
    else if(edited)$('registration-note').textContent='編集中の下書きです。次の版確定で新しいQRを発行します。以前の確定版は履歴に保持します。';
    else $('registration-note').textContent='「版を確定して保存」でQR発行・読み取り設定登録をまとめて行います。PDFはブラウザ内で保管し、PDF出力からPCへ保存できます。';
    // Reconcile after login/reload. Only a verified remote receipt may enable QR.
    var key=connected&&d.sync.versionId?u.store.actor+'|'+d.localId+'|'+d.sync.versionId:'';
    if(key&&key!==historyKey&&!packets.has(d.localId)&&!flow.active){historyKey=key;try{var list=await controller.list(d.sync.formId);var entry=list.find(function(r){return r.documentSha256===currentHash&&r.status==='registered';});if(entry){var selected=Object.assign({},source(d),{versionId:entry.sourceVersionId,documentSha256:entry.documentSha256});packets.set(d.localId,await controller.load(entry.registrationId,selected));if(u.store.currentId===d.localId){refreshCanvas();render();}}}catch(e){historyKey='';$('registration-status').textContent='登録履歴を確認できません · '+e.message;}}
  }
  var flow={active:false,stage:'login',doc:null,id:'',hash:'',packet:null,connection:null,attempt:0,origin:null,actor:null};
  function flowStatus(stage,message,state){var el=$('qr-flow-'+stage+'-status');if(el){el.textContent=message||'';el.dataset.state=state||'';}}
  function setFlowStage(stage,message,state){flow.stage=stage;flowStatus(stage,message,state);updateFlowButtons();}
  function packetMatches(packet){return !!(packet&&packet.status==='registered'&&flow.active&&flow.doc&&ui().store.current()===flow.doc&&ui().store.currentId===flow.id&&ui().store.actor===packet.reservation.ownerId&&packet.reservation.documentSha256===flow.hash&&OMRDesigner.canonical(flow.doc.document)===OMRDesigner.canonical(packet.candidate.document));}
  function updateFlowButtons(){var valid=packetMatches(flow.packet),stopped=flow.active&&flow.doc&&ui().store.registrationEnabled===false&&!valid;if($('qr-flow-print'))$('qr-flow-print').disabled=busy||!valid;if($('qr-flow-pdf'))$('qr-flow-pdf').disabled=busy||!valid;if($('confirm-registration'))$('confirm-registration').disabled=busy||stopped;['qr-flow-close','qr-flow-back'].forEach(function(id){if($(id))$(id).disabled=busy&&flow.stage!=='login';});}
  function outputReady(packet){flow.packet=packet;setFlowStage('output','確定版を確認しました。登録済みのPDFと同じQRを印刷または保存できます。','done');}
  function resetFlow(doc){var u=ui(),login=$('qr-flow-login');flow.active=true;flow.attempt++;flow.doc=doc;flow.id=doc.localId;flow.hash='';flow.packet=null;flow.connection=null;flow.origin=document.activeElement;flow.actor=u.store.actor||null;
    ['login','save','output'].forEach(function(stage){flowStatus(stage,'未確認','pending');});
    $('qr-flow-login-help').hidden=!!(u.store.actor&&u.store.storeConfigured);
    if(login){login.href=OMRCloudConfig.gasUrl+(OMRCloudConfig.gasUrl.indexOf('?')<0?'?':'&')+'view=login';login.target='_blank';login.rel='noopener noreferrer';}
    $('qr-flow-print').disabled=true;$('qr-flow-pdf').disabled=true;updateFlowButtons();
  }
  async function checkFlowSession(attempt,doc,id,priorPacket){var u=ui(),expected,modal=$('registration-dialog'),domAlive=function(){return !!(modal.ownerDocument&&modal.ownerDocument.defaultView&&modal.ownerDocument.defaultView.document);};
    if(busy||!flow.active||attempt!==flow.attempt)return;busy=true;setFlowStage('login','モーダル内でGoogleログイン状態を確認しています…','busy');
    try{
      if(u.store.busy)throw Error('前回の保存結果を確認してから再試行してください');
      if(u.store.current()!==doc||u.store.currentId!==id)throw Error('選択中の用紙が変わりました。対象を確認して開き直してください。');
      expected=await OMRDesigner.hash(doc.document);assertFlow(attempt,doc,id);flow.hash=expected;
      flow.connection=await u.ensureConnected({host:$('qr-flow-frame-host'),onStatus:function(message,state){if(flow.active&&flow.attempt===attempt)flowStatus('login',message,state);}});
      assertFlow(attempt,doc,id);
      if(u.store.current()!==doc||u.store.currentId!==id||await OMRDesigner.hash(doc.document)!==expected)throw Error('確認中に対象または用紙内容が変わりました。登録は開始していません。');
      if(!u.store.actor||!u.store.storeConfigured)throw Error('Googleログインを確認できませんでした。別タブでログイン後、再確認してください。');
      if(flow.actor&&flow.actor!==u.store.actor)throw Error('ログインアカウントが変わりました。対象を確認してください。');
      flow.actor=u.store.actor;$('qr-flow-login-help').hidden=true;
      if(priorPacket&&priorPacket.status==='registered'&&priorPacket.reservation.ownerId===flow.actor&&priorPacket.reservation.documentSha256===expected&&OMRDesigner.canonical(doc.document)===OMRDesigner.canonical(priorPacket.candidate.document)){packets.set(id,priorPacket);refreshCanvas();outputReady(priorPacket);flowStatus('save',priorPacket.reservation.academicYear+'年度 版'+priorPacket.reservation.releaseVersion+'は確定済みです。同じQRを使います。','done');}
      else if(priorPacket&&priorPacket.status==='registered'){flow.packet=null;flowStatus('output','ログインアカウントまたは用紙内容が登録済み版と一致しないため、出力できません。','error');}
      else{setFlowStage('login','Googleログインを確認しました。登録を始めるには「QRを発行して登録」を押してください。','connected');}
    }catch(e){if(domAlive()&&flow.active&&flow.attempt===attempt){flowStatus('login',e.message,'error');$('qr-flow-login-help').hidden=false;}}
    finally{flow.connection=null;busy=false;if(domAlive()){updateFlowButtons();render();}}
  }
  function openFlow(){if(busy)return;var u=ui(),doc=u&&u.store.current(),modal=$('registration-dialog');if(!doc)return;if(modal.open)return;
    resetFlow(doc);var p=currentPacket(),attempt=flow.attempt,id=doc.localId;
    if(p&&p.status==='registered'){flow.hash=p.reservation.documentSha256;flowStatus('save',p.reservation.academicYear+'年度 版'+p.reservation.releaseVersion+'を照合しています。','busy');}
    else{flowStatus('output','QR未発行です。Googleログイン確認後、「QRを発行して登録」を押すと版の保存と読み取り設定登録を開始します。','pending');if(u.store.registrationEnabled===false)flowStatus('save','OMR用紙登録は一時停止中です。既登録の版は印刷・PDF保存できます。','blocked');}
    $('registration-summary').textContent='「'+doc.document.definition.title+'」 '+doc.document.definition.academic_year+'年度・'+doc.document.definition.pages.length+'ページ。Googleログイン状態を確認します。登録は「QRを発行して登録」を押した後に始まります。確定版は識別QRと読み取り設定を登録し、以前の版は履歴に保持します。';modal.showModal();flow.sessionCheck=checkFlowSession(attempt,doc,id,p);
  }
  function finalizeVersion(){openFlow();}
  function assertFlow(attempt,doc,id){if(!flow.active||flow.attempt!==attempt||flow.doc!==doc||flow.id!==id||!$('registration-dialog').open)throw Error('接続または登録を取り消しました。保存・登録は開始していません。');}
  async function confirmFlow(){if(busy||!flow.active)return;var u=ui(),doc=flow.doc,id=flow.id,attempt=flow.attempt;if(!doc)return;
    return run(async function(){assertFlow(attempt,doc,id);if(u.store.current()!==doc||u.store.currentId!==id)throw Error('選択中の用紙が変わりました。対象を確認してから開き直してください。');if(OMREditorAPI.isComposing())throw Error('日本語入力を確定してください');
      var expected=await OMRDesigner.hash(doc.document);assertFlow(attempt,doc,id);if(flow.hash&&flow.hash!==expected)throw Error('対象の用紙内容が変わりました。閉じて対象を確認し、最初から開き直してください。');if(!flow.hash)flow.hash=expected;OMRDesigner.validate(doc.document.definition);
      var registered=currentPacket();if(registered&&registered.status==='registered'){if(packetMatches(registered)){outputReady(registered);return;}throw Error('登録済み版の内容を照合できません。');}
      if(u.store.registrationEnabled===false)throw Error('OMR用紙登録は一時停止中です。既登録の版は出力できます。');if(doc.pending&&doc.pending.rejected)throw Error('保存結果を確認できません。保存済みの版を確認してから再開してください。');
      setFlowStage('login','Googleログインと用紙管理の接続を確認しています…','busy');
      try{flow.connection=await u.ensureConnected({host:$('qr-flow-frame-host'),onStatus:function(message,state){if(flow.attempt===attempt&&flow.active)flowStatus('login',message,state);}});}finally{flow.connection=null;}
      assertFlow(attempt,doc,id);if(u.store.current()!==doc||u.store.currentId!==id)throw Error('接続中に用紙が切り替わりました。登録を停止しました。');if(!u.store.actor||!u.store.storeConfigured)throw Error('Googleログインを確認できませんでした。ログイン後にこのボタンをもう一度押してください。');if(flow.actor&&u.store.actor!==flow.actor)throw Error('ログインアカウントが変わりました。対象を確認し、この画面を開き直してください。');flow.actor=u.store.actor;$('qr-flow-login-help').hidden=true;
      if(OMREditorAPI.isComposing())throw Error('日本語入力を確定してください');if(await OMRDesigner.hash(doc.document)!==expected)throw Error('認証中に用紙内容が変わりました。保存・登録を停止しました。');OMRDesigner.validate(doc.document.definition);
      setFlowStage('save','ページを描画して実画素の配置検査を行っています…','busy');await OMREditorAPI.validateLayout(doc.document.definition);assertFlow(attempt,doc,id);
      if(await OMRDesigner.hash(doc.document)!==expected||u.store.current()!==doc||u.store.currentId!==id)throw Error('検査中に内容または対象が変わりました。保存・登録を停止しました。');if(u.store.registrationEnabled===false)throw Error('登録受付が停止されました。既登録の版は出力できます。');if(u.store.actor!==flow.actor||!u.store.storeConfigured)throw Error('ログイン状態が変わりました。保存・登録を停止しました。');
      setFlowStage('save','保存版の確認、QR発行、読み取り設定登録を進めています…','busy');var result=await controller.registerDocument(u.store,id,expected,function(message){if(flow.active&&flow.attempt===attempt)flowStatus('save',message,'busy');});
      packets.set(id,result.packet);historyKey='';
      var same=flow.active&&flow.attempt===attempt&&flow.doc===doc&&flow.id===id&&u.store.current()===doc&&u.store.currentId===id&&u.store.actor===flow.actor&&u.store.storeConfigured&&await OMRDesigner.hash(doc.document)===expected;
      if(same){OMREditorAPI.markClean();refreshCanvas();flow.packet=result.packet;outputReady(result.packet);flowStatus('save','保存・識別QR発行・読み取り設定登録を確認しました。','done');tell('版を確定し、QRと読み取り設定を登録しました。印刷またはPDF保存を選べます。');}
      else{flowStatus('save','登録結果は履歴に保持しました。現在の用紙と異なるため、この画面から出力できません。対象を確認して開き直してください。','error');}
    });
  }
  function cancelFlow(){if(flow.stage==='login'&&busy){flow.attempt++;flow.active=false;if(ui().cancelConnectionAttempt)ui().cancelConnectionAttempt();flowStatus('login','接続を取り消しました。Googleログイン後にもう一度開いてください。','cancelled');if($('registration-dialog').open)$('registration-dialog').close();return;}if(busy){flowStatus(flow.stage,'処理中です。結果を確認してから同じ対象で再開してください。','busy');return;}flow.active=false;flow.attempt++;if($('registration-dialog').open)$('registration-dialog').close();updateFlowButtons();}
  function flowOutput(kind){var p=flow.packet;if(!packetMatches(p)){flowStatus('output','出力対象の版またはログイン状態が変わりました。対象を確認してください。','error');updateFlowButtons();return;}
    var popup=kind==='print'?window.open('about:blank','_blank'):null;if(kind==='print'&&!popup){flowStatus('output','印刷画面を開けませんでした。PDF保存を選んでください。','error');return;}
    run(async function(){try{if(!packetMatches(p)||await OMRDesigner.hash(flow.doc.document)!==flow.hash)throw Error('出力対象の用紙内容が変わりました。');var artifact=await controller.pdf(p,function(message){flowStatus('output',message,'busy');});if(!artifact||!artifact.pdf)throw Error('確定版PDFを用意できませんでした。保存済みの版とブラウザの保存領域を確認してください。');if(!packetMatches(p)||await OMRDesigner.hash(flow.doc.document)!==flow.hash)throw Error('PDF検査中に出力対象が変わりました。');if(kind==='pdf')download(p.reservation.registrationId+'.pdf',artifact.pdf);else{var url=URL.createObjectURL(artifact.pdf);try{popup.location.href=url;}catch(e){URL.revokeObjectURL(url);throw Error('PDF印刷画面を開けませんでした。');}setTimeout(function(){URL.revokeObjectURL(url);},300000);}flowStatus('output',kind==='pdf'?'確定版PDFのダウンロードを開始しました。QRと版は同じです。':'確定版PDFを別画面で開きました。ブラウザの印刷を選んでください。','done');}catch(e){if(popup&&!popup.closed)popup.close();flowStatus('output',e.message,'error');throw e;}});
  }
  $('register-form').addEventListener('click',function(){finalizeVersion();});
  $('confirm-registration').addEventListener('click',confirmFlow);
  $('qr-flow-close').addEventListener('click',cancelFlow);$('qr-flow-back').addEventListener('click',cancelFlow);
  $('qr-flow-print').addEventListener('click',function(){flowOutput('print');});$('qr-flow-pdf').addEventListener('click',function(){flowOutput('pdf');});
  $('registration-dialog').addEventListener('cancel',function(e){e.preventDefault();cancelFlow();});
  $('registration-dialog').addEventListener('close',function(){if(flow.active){flow.active=false;flow.attempt++;if(flow.stage==='login'&&ui().cancelConnectionAttempt)ui().cancelConnectionAttempt();}if(flow.origin&&flow.origin.isConnected)flow.origin.focus();});
  $('qr-flow-login').addEventListener('click',function(){if(busy&&flow.stage==='login')cancelFlow();});
  function exportPdf(){var p=currentPacket();if(!p||p.status!=='registered'){finalizeVersion({exportPdf:true});return;}return run(async function(){var artifact=await controller.pdf(p,function(message){$('registration-status').textContent=message;});download(p.reservation.registrationId+'.pdf',artifact.pdf);tell(artifact.regeneratedFrom?'確定版の定義からPDFを再生成・検査して出力しました。QRと版は同じです。':'確定版PDFのダウンロードを開始しました。');});}
  $('registered-pdf').addEventListener('click',exportPdf);
  if($('proof-print'))$('proof-print').addEventListener('click',function(){if(window.OMREditorAPI)OMREditorAPI.printPreview();});
  $('registered-reader').addEventListener('click',function(){run(async function(){var p=currentPacket();if(!p)throw Error('この編集内容は未登録です');download(p.reservation.registrationId+'-reader.json',new Blob([JSON.stringify(controller.bundle(p),null,2)+'\n'],{type:'application/json'}));});});
  $('registration-history').addEventListener('click',function(){run(async function(){
    var u=ui(),doc=u.store.current(),id=doc.localId,list=await controller.list(doc.sync.formId),host=$('registration-history-list');host.replaceChildren();
    if(!list.length)host.textContent='登録履歴はありません。';
    list.forEach(function(entry){var row=document.createElement('div'),description=document.createElement('p'),b=document.createElement('button');description.textContent=entry.academicYear+'年度 版'+entry.releaseVersion+' · '+(entry.status==='registered'?'登録済み':'登録準備中');b.textContent=entry.status==='registered'?'登録済みPDF・設定を確認':'登録を再開';b.addEventListener('click',function(){run(async function(){
      var saved=Object.assign({},doc.sync,{versionId:entry.sourceVersionId,documentSha256:entry.documentSha256}),result;
      if(entry.status==='reserved')result=await controller.register(saved,function(message){$('registration-status').textContent=message;});
      else{var p=await controller.load(entry.registrationId,saved);result={packet:p,artifact:await controller.pdf(p,function(message){$('registration-status').textContent=message;})};}
      if(OMRDesigner.canonical(result.packet.candidate.document)===OMRDesigner.canonical(doc.document)){packets.set(id,result.packet);refreshCanvas();}
      row.replaceChildren(description);var pdf=document.createElement('button');pdf.textContent=result.artifact?'確定PDFをダウンロード':'PDF原本は登録時のブラウザを確認';pdf.disabled=!result.artifact;pdf.addEventListener('click',function(){download(entry.registrationId+'.pdf',result.artifact.pdf);});var reader=document.createElement('button');reader.textContent='登録済み読み取り設定';reader.addEventListener('click',function(){download(entry.registrationId+'-reader.json',new Blob([JSON.stringify(controller.bundle(result.packet),null,2)+'\n'],{type:'application/json'}));});row.append(pdf,reader);
    });});row.append(description,b);host.append(row);});
  });});
  $('qr-action').addEventListener('click',function(){finalizeVersion();});
  window.OMRRegistrationUI={preview:preview,requestPrint:requestPrint,finalize:finalizeVersion,exportPdf:exportPdf,isBusy:function(){return busy;},isOpen:function(){return flow.active&&$('registration-dialog').open;},catalog:function(){setup();return controller.catalog(ui().store);},openVersion:async function(entry){setup();var result=await controller.openVersion(ui().store,entry);packets.set(result.document.localId,result.packet);return result;}};
  window.addEventListener('omr-workspace-state',render);
  window.addEventListener('omr-connection-closed',function(){historyKey='';packets.clear();refreshCanvas();render();});
})();
