(function(){
  'use strict';var $=function(id){return document.getElementById(id);},controller,busy=false,packets=new Map(),historyKey='',sequence=0,lastPreview='';
  function ui(){return window.OMRWorkspaceUI;}
  function tell(message,error){OMRUI.notice(message,error);}
  function source(doc){return Object.assign({},doc.sync);}
  function currentPacket(){var u=ui(),doc=u&&u.store.current(),p=doc&&packets.get(doc.localId);return p&&p.reservation.ownerId===u.store.actor&&OMRDesigner.canonical(p.candidate.document)===OMRDesigner.canonical(doc.document)?p:null;}
  function preview(definition,index){var p=currentPacket();return p&&p.status==='registered'&&OMRDesigner.canonical(definition)===OMRDesigner.canonical(p.candidate.document.definition)?p.candidate.readerDefinition.pages[index].qr.payload:null;}
  function focusExport(id){if(window.OMRUI)window.OMRUI.openPanel('export');var target=$(id);if(target&&!target.disabled){if(target.tabIndex<0)target.setAttribute('tabindex','-1');target.focus();}else{var status=$('registration-status');status.setAttribute('tabindex','-1');status.focus();}}
  function routeToRegistration(){var u=ui(),doc=u&&u.store.current();if(!doc)return;var enabled=u.store.registrationEnabled!==false,connected=!!(u.store.actor&&u.store.storeConfigured),target;
    if(!enabled){$('registration-status').textContent='OMR用紙登録は一時停止中です。下書き保存・登録履歴・既登録PDFは利用できます。';focusExport('registration-history');return;}
    if(!connected)target='connect';else if(doc.pending&&doc.pending.rejected)target='cloud-bind';else target='register-form';
    focusExport(target);
  }
  function openRegisteredPdf(){if(busy){tell('処理中のため登録済みPDFを開けません。処理完了後にもう一度お試しください。',true);return;}var p=currentPacket();if(!p||p.status!=='registered'){routeToRegistration();return;}var popup=window.open('about:blank','_blank');if(!popup){tell('PDFプレビュー用のポップアップを開けませんでした。PDF出力メニューからPDFを出力してください。',true);if($('pdf-menu-button'))$('pdf-menu-button').focus();else focusExport('registered-pdf');return;}
    run(async function(){try{var artifact=await controller.pdf(p,function(message){$('registration-status').textContent=message;});if(!artifact){popup.close();throw Error('確定版PDFを用意できませんでした。保存済みの定義とブラウザの保存領域を確認してください。');}if(currentPacket()!==p)throw Error('編集中の用紙が変わりました。登録済みPDFの対象を確認してください。');var url=URL.createObjectURL(artifact.pdf);try{popup.location.href=url;}catch(e){URL.revokeObjectURL(url);throw Error('登録済みPDFを開けませんでした。PDF出力メニューからPDFを出力してください。');}setTimeout(function(){URL.revokeObjectURL(url);},300000);tell('確定版PDFを別画面で開きました。PDFが表示されない場合はPDF出力メニューからPCに保存してください。');}catch(e){if(!popup.closed)popup.close();throw e;}});
  }
  function requestPrint(printPreview){var p=currentPacket();if(p&&p.status==='registered'){openRegisteredPdf();return;}var dialog=$('print-warning-dialog');if(dialog.open)return;var origin=document.activeElement;dialog.showModal();dialog.addEventListener('close',function(){if(dialog.returnValue!=='issue'&&origin&&origin.isConnected)origin.focus();},{once:true});
    $('print-warning-issue').onclick=function(){dialog.close('issue');finalizeVersion({exportPdf:true});};
    $('print-warning-noqr').onclick=function(){dialog.close('print-unregistered');try{Promise.resolve(printPreview()).catch(function(e){tell(e.message||String(e),true);});}catch(e){tell(e.message||String(e),true);}};
    $('print-warning-cancel').onclick=function(){dialog.close('cancel');};
  }
  function refreshCanvas(){if(window.OMREditorAPI)window.OMREditorAPI.refresh();}
  async function run(fn){if(busy)return;busy=true;try{render();await fn();}catch(e){tell(e.message,true);$('registration-status').textContent=e.message+' 同じ保存版で再開できます。';}finally{busy=false;render();}}
  function download(name,blob){var url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.append(a);a.click();a.remove();setTimeout(function(){URL.revokeObjectURL(url);},2000);}
  function setup(){var u=ui();if(!u||controller)return;controller=new OMRRelease.Controller({rpc:function(op,data){return u.client.call(op,data);},storage:localStorage,scope:'omr-registration-requests/1/'+encodeURIComponent(OMRCloudConfig.gasUrl),hash:OMRDesigner.hash,sha:OMRArtifacts.sha,uuid:function(){return crypto.randomUUID();},artifacts:OMRArtifacts.create(OMRCloudConfig.gasUrl),generate:OMRRegistrationPDF.build});}
  async function render(){
    setup();var u=ui();if(!u||!u.store.current())return;var own=++sequence,d=u.store.current(),p=currentPacket(),connected=!!(u.store.actor&&u.store.storeConfigured),registrationEnabled=u.store.registrationEnabled!==false,savedCurrent=false,currentHash=null,previous=packets.get(d.localId),edited=!!(previous&&previous.status==='registered'&&previous.reservation.ownerId===u.store.actor&&!p);
    if(busy){['register-form','registration-history','registered-pdf','registered-reader','qr-action','cloud-save-menu'].forEach(function(id){if($(id))$(id).disabled=true;});return;}
    if(connected&&d.sync.versionId&&!d.pending){try{currentHash=await OMRDesigner.hash(d.document);savedCurrent=currentHash===d.sync.documentSha256;}catch(_){savedCurrent=false;}}
    if(own!==sequence||!u.store.current()||u.store.current().localId!==d.localId)return;p=currentPacket();
    $('register-form').disabled=busy||u.store.busy||!connected||!registrationEnabled||!!(d.pending&&d.pending.rejected)||!!(p&&p.status==='registered');
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
    $('register-form').textContent=p&&p.status==='registered'?'この版は確定済みです':'版を確定して保存（クラウド）';
    if(p&&p.status==='registered')$('registration-note').textContent='この版はクラウドに確定保存済みです。PDFはPDF出力からPCへ保存できます。';
    else if(!registrationEnabled)$('registration-note').textContent='OMR用紙登録は一時停止中です。下書き保存・登録履歴・既登録PDFは利用できます。';
    else if(!connected)$('registration-note').textContent='下書きはこのブラウザに保存します。用紙管理にログイン後、「版を確定して保存」でQR発行と読み取り設定登録を行います。';
    else if(edited)$('registration-note').textContent='編集中の下書きです。次の版確定で新しいQRを発行します。以前の確定版は履歴に保持します。';
    else $('registration-note').textContent='「版を確定して保存」でQR発行・読み取り設定登録をまとめて行います。PDFはブラウザ内で保管し、PDF出力からPCへ保存できます。';
    // Reconcile after login/reload. Only a verified remote receipt may enable QR.
    var key=connected&&d.sync.versionId?u.store.actor+'|'+d.localId+'|'+d.sync.versionId:'';
    if(key&&key!==historyKey&&!packets.has(d.localId)){historyKey=key;try{var list=await controller.list(d.sync.formId);var entry=list.find(function(r){return r.documentSha256===currentHash&&r.status==='registered';});if(entry){var selected=Object.assign({},source(d),{versionId:entry.sourceVersionId,documentSha256:entry.documentSha256});packets.set(d.localId,await controller.load(entry.registrationId,selected));if(u.store.currentId===d.localId){refreshCanvas();render();}}}catch(e){historyKey='';$('registration-status').textContent='登録履歴を確認できません · '+e.message;}}
  }
  function finalizeVersion(options){
    options=options||{};
    var u=ui(),doc=u&&u.store.current(),current=currentPacket();
    if(!doc)return;
    if(current&&current.status==='registered'){if(options.exportPdf)exportPdf();else{focusExport('registration-status');tell('現在の内容は確定済みです。同じQRを使用します。');}return;}
    if(!u.store.actor||!u.store.storeConfigured||u.store.registrationEnabled===false||doc.pending&&doc.pending.rejected){routeToRegistration();return;}
    if(u.store.busy){tell('保存処理の完了後にPDFを作成してください。',true);return;}
    return run(async function(){
      if(OMREditorAPI.isComposing())throw Error('日本語入力を確定してください');
      OMRDesigner.validate(doc.document.definition);
      var id=doc.localId,expected=await OMRDesigner.hash(doc.document),previous=packets.get(id),modal=$('registration-dialog');
      if(u.store.current()!==doc)throw Error('作成する用紙を選び直してください');
      var revisionNote=previous&&previous.status==='registered'?'以前のPDFとQRは履歴に残し、今回は新しい版として登録します。':'変更のない登録済み版があれば、そのPDFとQRを利用します。';
      $('registration-summary').textContent='「'+doc.document.definition.title+'」の現在の内容で版を確定します。'+doc.document.definition.academic_year+'年度・'+doc.document.definition.pages.length+'ページ。必要な保存・識別QR発行・読み取り設定登録を自動で行い、PDF検査後にクラウドの確定版として保存します。PDFはローカルのみで保管します。'+revisionNote;
      modal.showModal();var accepted=await new Promise(function(resolve){modal.addEventListener('close',function(){resolve(modal.returnValue==='register');},{once:true});});if(!accepted)return;
      var result=await controller.registerDocument(u.store,id,expected,function(message){$('registration-status').textContent=message;});packets.set(id,result.packet);
      if(u.store.currentId===id){refreshCanvas();if(await OMRDesigner.hash(doc.document)===expected)OMREditorAPI.markClean();}
      if(options.exportPdf){var output=result.artifact||await controller.pdf(result.packet);download(result.packet.reservation.registrationId+'.pdf',output.pdf);}
      var unchanged=u.store.current()===doc&&await OMRDesigner.hash(doc.document)===expected;
      tell(unchanged?(options.exportPdf?'版を確定し、PDFのダウンロードを開始しました。':'クラウドに版を確定して保存し、QRを発行しました。PDF出力からPCへ保存できます。'):'確認時点の版を確定しました。現在の編集内容は未確定の下書きです。');
    });
  }
  $('register-form').addEventListener('click',function(){finalizeVersion();});
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
  window.OMRRegistrationUI={preview:preview,requestPrint:requestPrint,finalize:finalizeVersion,exportPdf:exportPdf,catalog:function(){setup();return controller.catalog(ui().store);},openVersion:async function(entry){setup();var result=await controller.openVersion(ui().store,entry);packets.set(result.document.localId,result.packet);return result;}};
  window.addEventListener('omr-workspace-state',render);
  window.addEventListener('omr-connection-closed',function(){historyKey='';packets.clear();refreshCanvas();render();});
})();
