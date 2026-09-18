/* Open works own their history, browser slots and in-flight file writes. */
(function(root,factory){
  const Workspace=factory(typeof module==='object'&&module.exports?require('./core.js'):root.IlapoCore,typeof module==='object'&&module.exports?require('./local-autosave.js'):root.IlapoLocalAutosave);
  if(typeof module==='object'&&module.exports)module.exports=Workspace;
  root.IlapoDocumentWorkspace=Workspace;
}(typeof globalThis!=='undefined'?globalThis:this,function(C,AutoSave){
  'use strict';
  const snapshot=session=>JSON.stringify(session.history.document);
  const sameFile=async(a,b)=>a===b||!!(a&&b&&(typeof a.isSameEntry==='function'?await a.isSameEntry(b):typeof b.isSameEntry==='function'?await b.isSameEntry(a):false));
  const filename=name=>(name.replace(/[\x00-\x1f<>:"/\\|?*]/g,'_').slice(0,100)||'作品')+'.illustslide.zip';
  class Workspace{
    constructor(options={}){
      this.store=options.store;this.encode=options.encode;this._pickFile=options.pickFile;this.getPicker=options.getPicker;this.download=options.download;
      this.onChange=options.onChange||(()=>{});this.onNotice=options.onNotice||(()=>{});
      this.sessions=[];this.claims=[];this.handleTail=Promise.resolve();
    }
    get pickFile(){return this.getPicker?this.getPicker():this._pickFile;}
    add(value,options={}){
      const history=new C.History(value),storageId=options.storageId&&!this.sessions.some(s=>s.storageId===options.storageId)?options.storageId:C.uid('file');
      const session={id:C.uid('tab'),storageId,history,pageId:history.document.pages[0].id,selected:[],tool:'select',view:null,edited:!!options.edited,
        savedFingerprint:options.savedFingerprint===undefined?JSON.stringify(history.document):options.savedFingerprint,lastSave:options.lastSave||null,
        status:options.status||'新しい作品',saving:false,autoStarting:false,autoTimer:null,closed:false};
      session.localAuto=new AutoSave({encode:this.encode,onStatus:status=>{
        if(session.closed)return;
        if(status.state==='error'){session.status='ローカル自動保存に失敗';this.onNotice(session,status.message);}
        else if(status.state==='saved')session.status=this.dirty(session)?'自動保存済み · 明示保存後に変更':'自動保存済み';
        this.onChange();
      }});
      this.sessions.push(session);return session;
    }
    dirty(session){return !!session.edited&&snapshot(session)!==session.savedFingerprint;}
    changed(session){
      if(session.closed)return;
      session.edited=true;session.status='変更あり';clearTimeout(session.autoTimer);
      session.autoTimer=setTimeout(()=>{session.autoTimer=null;this.autosave(session);},450);
    }
    autosave(session){
      if(session.closed)return false;
      clearTimeout(session.autoTimer);session.autoTimer=null;
      const value=C.clone(session.history.document);let saved=false;
      try{
        if(!this.store)throw Error('ブラウザ保存を利用できません。');
        this.store.save(value,'auto',session.storageId);saved=true;
        session.status=this.dirty(session)?'自動保存済み · 明示保存後に変更':'自動保存済み';
      }catch(error){session.status='ブラウザ自動保存に失敗';this.onNotice(session,'ブラウザ自動保存に失敗しました。ファイルへの保存を利用できます。',error);}
      session.localAuto.schedule(value);this.onChange();return saved;
    }
    flush(session){if(session.autoTimer)this.autosave(session);}
    _saved(session,frozen,destination){
      session.savedFingerprint=JSON.stringify(frozen);session.lastSave=destination;
      session.status=(destination.kind==='browser'?'ブラウザ':'ローカル')+'に明示保存済み'+(this.dirty(session)?' · 保存後に変更':'');
      this.onChange();
    }
    saveBrowser(session){
      if(session.closed||session.saving)return false;
      const frozen=C.clone(session.history.document);
      try{
        if(!this.store)throw Error('ブラウザ保存を利用できません。');
        this.store.save(frozen,'saved',session.storageId);this._saved(session,frozen,{kind:'browser'});
        this.onNotice(session,'ブラウザに保存しました。自動保存とは別に保持します。');return true;
      }catch(error){session.status='ブラウザ保存に失敗';this.onNotice(session,'ブラウザに保存できませんでした。作品を保持しています。ファイルへの保存を利用できます。',error);this.onChange();return false;}
    }
    _claim(session,handle,kind){
      // Compare and reserve in one serial section, before either writer opens.
      const task=this.handleTail.then(async()=>{
        for(const claim of this.claims){
          if(!await sameFile(handle,claim.handle))continue;
          if(claim.session===session&&claim.kind===kind)return {claim,fresh:false};
          if(kind==='auto'||claim.kind==='auto')throw Error('自動保存と明示保存、別の作品には、それぞれ異なる保存先を選んでください。');
          if(!claim.session.closed)throw Error('別の作品で使用中の保存先です。別のファイルを選んでください。');
        }
        const claim={session,handle,kind};this.claims.push(claim);return {claim,fresh:true};
      });
      this.handleTail=task.catch(()=>{});return task;
    }
    _release(reservation){if(reservation?.fresh)this.claims=this.claims.filter(c=>c!==reservation.claim);}
    async saveLocal(session,reuse=false){
      if(session.closed||session.saving)return false;
      const frozen=C.clone(session.history.document);session.saving=true;session.status='ローカルに保存中…';this.onChange();
      let reservation,success=false;
      try{
        let handle=reuse&&session.lastSave?.kind==='local'?session.lastSave.handle:null;
        if(!handle&&this.pickFile){handle=await this.pickFile({suggestedName:filename(frozen.name),types:[{description:'イラストスライドの作品',accept:{'application/zip':['.zip']}}]});if(!handle)throw Error('保存先が選ばれていません。');}
        if(session.closed)return false;
        if(handle){
          reservation=await this._claim(session,handle,'explicit');await session.localAuto.protect(handle);
          const bytes=await this.encode(frozen),writer=await handle.createWritable();
          try{await writer.write(bytes);await writer.close();}catch(error){if(typeof writer.abort==='function')await writer.abort().catch(()=>{});throw error;}
          await session.localAuto.rememberExplicit(handle);
        }else{await this.download(await this.encode(frozen),filename(frozen.name),'application/zip');}
        this._saved(session,frozen,{kind:'local',handle:handle||null});success=true;
        this.onNotice(session,handle?'編集用ファイルを保存しました。':'編集用ファイルをダウンロードしました。');return true;
      }catch(error){
        session.status=error.name==='AbortError'?'保存をキャンセル':'ローカル保存に失敗';
        if(error.name!=='AbortError')this.onNotice(session,'ローカルに保存できませんでした。'+(error.message||'')+' ファイルメニューから保存先を選び直せます。',error);
        return false;
      }finally{if(!success)this._release(reservation);session.saving=false;this.onChange();}
    }
    async startAutosave(session){
      if(session.closed||session.autoStarting)return false;
      session.autoStarting=true;let reservation,success=false;
      try{
        if(!this.pickFile)throw Error('このブラウザはローカル自動保存に対応していません。');
        const handle=await this.pickFile({suggestedName:filename(session.history.document.name+'.autosave'),types:[{description:'イラストスライド自動保存',accept:{'application/zip':['.zip']}}]});
        if(session.closed)return false;
        reservation=await this._claim(session,handle,'auto');
        const initial=session.history.document;
        await session.localAuto.start(initial,handle);
        // Edits may arrive while the initial file permission/fingerprint check waits.
        if(session.localAuto.active&&snapshot(session)!==JSON.stringify(initial))await session.localAuto.schedule(session.history.document);
        success=session.localAuto.active;return success;
      }catch(error){if(error.name!=='AbortError')this.onNotice(session,'ローカル自動保存を開始できませんでした。'+(error.message||''),error);return false;}
      finally{if(!success)this._release(reservation);session.autoStarting=false;this.onChange();}
    }
    close(session){
      if(session.closed||session.saving||session.autoStarting)return false;
      this.flush(session);session.closed=true;clearTimeout(session.autoTimer);session.localAuto.stop();
      this.sessions=this.sessions.filter(s=>s!==session);return true;
    }
    get pending(){return this.sessions.some(s=>this.dirty(s)||s.saving||s.autoStarting||s.localAuto.pending);}
  }
  return Workspace;
}));
