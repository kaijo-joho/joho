/* Registration orchestration, separate from editor state and the transport. */
(function(root){
  'use strict';var M=OMRDesigner,R=OMRRegistration;
  function assert(ok,message){if(!ok)throw Error(message);}
  class Controller{
    constructor(options){Object.assign(this,options);}
    async registerDocument(workspace,localId,expectedSha256,progress){
      var actor=workspace.actor,document=workspace.current();
      assert(actor&&workspace.storeConfigured,'用紙管理にログインしてからPDFを作成してください');
      assert(workspace.registrationEnabled!==false,'印刷用PDFの登録は一時停止中です');
      assert(!workspace.busy,'保存処理の完了後にPDFを作成してください');
      assert(document&&document.localId===localId&&workspace.currentId===localId,'作成する用紙を選び直してください');
      assert(!document.sync.ownerId||document.sync.ownerId===actor,'保存先の所有者が異なります。保存先を確認してください');
      var maxSaves=document.pending?2:1;
      async function check(hash){
        assert(workspace.current()===document&&workspace.currentId===localId,'用紙が切り替わりました。保存結果を保持したので、作成する用紙を選び直してください');
        assert(workspace.actor===actor&&workspace.storeConfigured,'ログイン状態が変わりました。ログインを確認してから再開してください');
        assert(workspace.registrationEnabled!==false,'印刷用PDFの登録は一時停止中です');
        assert(await hash(document.document)===expectedSha256,'作成中に内容が変わりました。現在の内容でPDF作成をやり直してください');
        assert(workspace.current()===document&&workspace.currentId===localId&&workspace.actor===actor&&workspace.storeConfigured,'用紙またはログイン状態が変わりました。PDF作成をやり直してください');
      }
      await check(this.hash);
      for(var attempt=0;attempt<maxSaves&&(document.pending||document.sync.documentSha256!==expectedSha256);attempt++){
        if(progress)progress(document.pending?'前回の保存結果を確認しています…':'現在の編集内容を保存しています…');
        await workspace.save();await check(this.hash);
      }
      assert(!document.pending&&document.sync.documentSha256===expectedSha256&&document.sync.formId&&document.sync.versionId&&document.sync.ownerId===actor,'保存版を照合できません。下書きの保存結果を確認してください');
      await check(this.hash);
      return this.register(M.clone(document.sync),progress);
    }
    async verify(packet,source){
      assert(packet&&packet.schema==='omr-registration/1','登録結果の形式が不正です');
      var r=packet.reservation,c=packet.candidate,complete=packet.completion;
      assert(r&&c&&r.formId===source.formId&&r.paperNumber===source.paperNumber&&r.sourceVersionId===source.versionId&&r.documentSha256===source.documentSha256&&r.ownerId===source.ownerId,'登録先・保存版が一致しません');
      assert(c.schema==='omr-registration-candidate/1','登録本文の形式が不正です');
      assert(await this.hash(c.document)===r.documentSha256&&c.documentSha256===r.documentSha256,'登録本文の照合に失敗しました（用紙本文）');
      assert(await this.hash(c.readerDefinition)===r.readerDefinitionSha256&&c.readerDefinitionSha256===r.readerDefinitionSha256,'登録本文の照合に失敗しました（読み取り設定）');
      assert(await this.hash(c)===r.candidateSha256,'登録本文の照合に失敗しました（登録全体）');
      R.validate(c.readerDefinition,c.document);
      assert(c.readerDefinition.paperNumber===r.paperNumber&&c.readerDefinition.academicYear===r.academicYear&&c.readerDefinition.releaseVersion===r.releaseVersion&&M.canonical(c.readerDefinition.pages.map(function(p){return p.qr.payload;}))===M.canonical(r.qrPayloads),'登録番号と読み取り設定が一致しません');
      if(packet.status==='registered'){
        assert(complete&&complete.registrationId===r.registrationId&&complete.ownerId===r.ownerId&&complete.candidateSha256===r.candidateSha256&&complete.readerDefinitionSha256===r.readerDefinitionSha256&&/^[a-f0-9]{64}$/.test(complete.pdfSha256),'確定登録の照合に失敗しました');
        R.validateProof(complete.proof,c.readerDefinition);
        assert(complete.proof.documentSha256===r.documentSha256&&complete.proof.readerDefinitionSha256===r.readerDefinitionSha256&&complete.commitHash===await this.hash({registrationId:r.registrationId,candidateSha256:r.candidateSha256,pdfSha256:complete.pdfSha256,proof:complete.proof}),'確定記録とPDFが一致しません');
      }else assert(packet.status==='reserved'&&!complete,'登録状態が不正です');
      return packet;
    }
    async list(formId){var value=await this.rpc('registrationList',{formId:formId});assert(value&&Array.isArray(value.registrations),'登録履歴が不正です');return value.registrations;}
    async load(id,source){return this.verify(await this.rpc('registrationLoad',{registrationId:id}),source);}
    async artifact(packet){
      var value=await this.artifacts.get(packet.reservation.registrationId);if(!value)return null;
      assert(value.candidateSha256===packet.reservation.candidateSha256&&value.proof.documentSha256===packet.reservation.documentSha256&&value.proof.readerDefinitionSha256===packet.reservation.readerDefinitionSha256,'保管PDFと登録候補が一致しません');
      R.validateProof(value.proof,packet.candidate.readerDefinition);
      assert(await this.sha(await value.pdf.arrayBuffer())===value.pdfSha256,'保管PDFが破損しています。原本を確認してください');
      if(packet.completion)assert(value.pdfSha256===packet.completion.pdfSha256&&M.canonical(value.proof)===M.canonical(packet.completion.proof),'確定PDFと保管PDFが一致しません');return value;
    }
    async pdf(packet,progress){
      assert(packet&&packet.status==='registered','確定済みの版からPDFを出力してください');
      var r=packet.reservation,c=packet.candidate;
      await this.verify(packet,{formId:r.formId,paperNumber:r.paperNumber,versionId:r.sourceVersionId,documentSha256:r.documentSha256,ownerId:r.ownerId});
      var original=await this.artifact(packet);if(original)return original;
      var key='regenerated:'+r.registrationId,value=await this.artifacts.get(key);
      async function inspect(controller,value){
        assert(value&&value.regeneratedFrom&&value.regeneratedFrom.schema==='omr-regenerated-pdf/1'&&value.regeneratedFrom.registrationId===r.registrationId&&value.regeneratedFrom.sourcePdfSha256===packet.completion.pdfSha256,'再生成PDFの確定版との対応が不正です');
        assert(value.candidateSha256===r.candidateSha256&&value.proof.documentSha256===r.documentSha256&&value.proof.readerDefinitionSha256===r.readerDefinitionSha256,'再生成PDFの用紙定義が一致しません');
        R.validateProof(value.proof,c.readerDefinition);
        assert(await controller.sha(await value.pdf.arrayBuffer())===value.pdfSha256,'再生成PDFが破損しています');return value;
      }
      if(value)return inspect(this,value);
      if(progress)progress('確定版の定義からPDFを再生成・検査しています…');
      value=await this.generate(packet,progress);
      value.regeneratedFrom={schema:'omr-regenerated-pdf/1',registrationId:r.registrationId,sourcePdfSha256:packet.completion.pdfSha256};
      await inspect(this,value);value=await this.artifacts.put(key,value);return inspect(this,value);
    }
    async catalog(workspace){
      assert(workspace.actor&&workspace.storeConfigured,'用紙管理にログインしてください');
      var actor=workspace.actor,forms=(await workspace.list()).forms,result=[];
      assert(Array.isArray(forms),'クラウドの用紙一覧が不正です');
      for(var i=0;i<forms.length;i++){
        assert(workspace.actor===actor,'ログイン状態が変わりました');
        var form=forms[i],versions=await this.list(form.formId);
        versions.filter(function(v){return v.status==='registered';}).forEach(function(v){result.push({form:form,version:v});});
      }
      assert(workspace.actor===actor,'ログイン状態が変わりました');return result;
    }
    async openVersion(workspace,entry){
      var actor=workspace.actor,form=entry.form,v=entry.version;
      assert(actor&&workspace.storeConfigured&&v.status==='registered','確定済みの版を選んでください');
      var packet=await this.load(v.registrationId,{formId:form.formId,paperNumber:v.paperNumber,versionId:v.sourceVersionId,documentSha256:v.documentSha256,ownerId:actor});
      var latest=await workspace.rpc('load',{formId:form.formId});await workspace.verify(latest);
      assert(workspace.actor===actor&&latest.formId===form.formId&&latest.paperNumber===v.paperNumber&&latest.editorFormId===packet.candidate.document.definition.form_id,'確定版と現在の保存先が一致しません');
      // The frozen body stays intact. Subsequent edits branch from the latest
      // revision, preserving all earlier registered versions and local tabs.
      var document=workspace.add(M.clone(packet.candidate.document),latest);return {document:document,packet:packet};
    }
    async register(source,progress){
      var key=this.scope+'/'+source.formId+'/'+source.versionId,request,prior;
      try{prior=JSON.parse(this.storage.getItem(key)||'null');}catch(e){throw Error('登録要求の控えを読めません。登録履歴から確認してください');}
      var history=await this.list(source.formId),existing=history.find(function(r){return r.sourceVersionId===source.versionId;});
      request={requestId:existing?existing.requestId:prior?prior.requestId:this.uuid(),formId:source.formId,versionId:source.versionId,documentSha256:source.documentSha256};
      var serialized=JSON.stringify(request);this.storage.setItem(key,serialized);assert(this.storage.getItem(key)===serialized,'登録要求をブラウザへ保管できません');
      var packet;
      try{packet=await this.rpc('registrationPrepare',request);}catch(e){
        if(e.code!=='ALREADY_REGISTERED')throw e;
        existing=(await this.list(source.formId)).find(function(r){return r.sourceVersionId===source.versionId;});if(!existing)throw e;
        request.requestId=existing.requestId;this.storage.setItem(key,JSON.stringify(request));packet=await this.rpc('registrationPrepare',request);
      }
      await this.verify(packet,source);var artifact=await this.artifact(packet);
      if(packet.status==='registered')return {packet:packet,artifact:artifact};
      if(!artifact){artifact=await this.generate(packet,progress);artifact=await this.artifacts.put(packet.reservation.registrationId,artifact);await this.artifact(packet);}
      if(progress)progress('PDFと読み取り設定を登録しています…');
      var complete=await this.rpc('registrationCommit',{registrationId:packet.reservation.registrationId,candidateSha256:packet.reservation.candidateSha256,pdfSha256:artifact.pdfSha256,proof:artifact.proof});
      await this.verify(complete,source);assert(complete.status==='registered','登録確定を確認できません');
      var readback=await this.load(packet.reservation.registrationId,source);assert(M.canonical(readback)===M.canonical(complete),'登録結果の読戻しが一致しません');
      await this.artifact(readback);return {packet:readback,artifact:artifact};
    }
    bundle(packet){
      assert(packet.status==='registered','確定済みの読み取り設定だけを書き出せます');
      return {schema:'omr-registered-reader/1',registrationId:packet.reservation.registrationId,registeredAt:packet.completion.registeredAt,sourceVersionId:packet.reservation.sourceVersionId,documentSha256:packet.reservation.documentSha256,candidateSha256:packet.reservation.candidateSha256,pdfSha256:packet.completion.pdfSha256,readerDefinitionSha256:packet.reservation.readerDefinitionSha256,readerDefinition:packet.candidate.readerDefinition};
    }
  }
  root.OMRRelease={Controller:Controller};
})(typeof window!=='undefined'?window:globalThis);
