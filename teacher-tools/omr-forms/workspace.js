/* Editor documents and save receipts. Independent of DOM, transport and the reader. */
(function(root){
 'use strict';var KEY='omr-editor-workspace/1';
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function problem(code,message){var e=new Error(message);e.code=code;return e;}
 function validate(doc){if(!doc||doc.schema!=='omr-editor-document/1'||!doc.metadata)throw problem('INVALID','用紙ファイルの形式が不正です');
  OMRDesigner.validate(doc.definition);var m=doc.metadata;
  if(!['worksheet','application','quiz','survey','record','other'].includes(m.usage)||['subject','classification','templateId'].some(function(k){return typeof m[k]!=='string'||m[k].length>500;})||!Array.isArray(m.tags)||m.tags.length>100||m.tags.some(function(t){return typeof t!=='string'||t.length>500;}))throw problem('INVALID','用紙の管理情報が不正です');
  if(new TextEncoder().encode(OMRDesigner.canonical(doc)).length>200000)throw problem('INVALID','用紙データが大きすぎます');return doc;
 }
 class Workspace{
  constructor(options){this.storage=options.storage;this.uuid=options.uuid;this.hash=options.hash;this.rpc=options.rpc;this.changed=options.changed||function(){};this.actor=null;this.storeConfigured=false;this.busy=false;this.generation=null;this.documents=[];this.currentId=null;this.error=null;this.writerId=this.uuid();this.restore();}
  restore(){var raw;try{raw=this.storage.getItem(KEY);if(!raw)return;var state=JSON.parse(raw);if(state.schema!==KEY||!Array.isArray(state.documents)||state.documents.length>30)throw Error();var ids=new Set();
    state.documents.forEach(function(d){if(typeof d.localId!=='string'||ids.has(d.localId)||!d.sync||!Number.isInteger(d.sync.revision)||d.sync.revision<0)throw Error();ids.add(d.localId);validate(d.document);if(d.pending){validate(d.pending.data.document);if(typeof d.pending.actor!=='string'||typeof d.pending.data.requestId!=='string')throw Error();}});
    if(!ids.has(state.currentId))throw Error();this.documents=state.documents;this.currentId=state.currentId;this.generation=state.generation;
   }catch(e){this.error=problem('LOCAL_READ','ブラウザ保存の内容を読み込めません。元データを保持し、新しく保存する前に控えを取得してください。');this.rawRecovery=raw;}
  }
  current(){return this.documents.find(function(d){return d.localId===this.currentId;},this);}
  persist(){if(this.error)throw this.error;
   var generation=this.uuid(),value={schema:KEY,generation:generation,savedAt:new Date().toISOString(),currentId:this.currentId,documents:this.documents};
   // Each browser window owns a different recovery slot. Even a simultaneous
   // head-pointer race cannot overwrite the other window's latest document/receipt.
   try{var serialized=JSON.stringify(value),slot=KEY+'/writers/'+this.writerId;this.storage.setItem(slot,serialized);if(this.storage.getItem(slot)!==serialized)throw Error();var previous=this.storage.getItem(KEY),different=false;if(previous){try{different=JSON.parse(previous).generation!==this.generation;}catch(e){if(previous!==this.repairHead)throw e;}}if(different)throw problem('LOCAL_CONFLICT','別の画面でブラウザ保存が変わりました。この画面の控えを残しました。「ブラウザの控えから開く」で選択できます。');this.storage.setItem(KEY,serialized);if(this.storage.getItem(KEY)!==serialized)throw Error();this.generation=generation;this.lastLocalError=null;}catch(e){this.lastLocalError=e.code==='LOCAL_CONFLICT'?e:problem('LOCAL_WRITE','ブラウザへ保存できません。用紙をファイルへ退避してください。');throw this.lastLocalError;}
  }
  recoveries(){var result=[];for(var i=0;i<this.storage.length;i++){var key=this.storage.key(i);if(key&&key.startsWith(KEY+'/writers/'))try{var s=JSON.parse(this.storage.getItem(key));if(s.schema===KEY&&Array.isArray(s.documents)&&s.documents.length)result.push({key:key,state:s});}catch(_){} }return result;}
  restoreRecovery(key){if(!key.startsWith(KEY+'/writers/'))throw problem('INVALID','控えが不正です');var state=JSON.parse(this.storage.getItem(key));if(state.schema!==KEY||!Array.isArray(state.documents)||state.documents.length>30)throw problem('INVALID','控えが不正です');state.documents.forEach(function(d){validate(d.document);if(!d.sync||!Number.isInteger(d.sync.revision)||d.sync.revision<0)throw problem('INVALID','控えが不正です');if(d.pending){validate(d.pending.data.document);if(typeof d.pending.actor!=='string'||typeof d.pending.data.requestId!=='string')throw problem('INVALID','保存要求の控えが不正です');}});if(!state.documents.some(function(d){return d.localId===state.currentId;}))throw problem('INVALID','控えの選択状態が不正です');
   // A new writer preserves the current window's previous recovery slot too.
   this.documents=copy(state.documents);this.currentId=state.currentId;this.writerId=this.uuid();this.error=null;var head=this.storage.getItem(KEY);try{this.generation=head?JSON.parse(head).generation:null;}catch(e){var backup=KEY+'/damaged/'+this.uuid();this.storage.setItem(backup,head);if(this.storage.getItem(backup)!==head)throw problem('LOCAL_WRITE','元の保存データを退避できません');this.repairHead=head;this.generation=null;}try{this.persist();}finally{this.repairHead=null;}this.notify();return this.current();}
  notify(){this.changed(this.current(),this);}
  add(document,record){validate(document);if(this.documents.length>=30)throw problem('LIMIT','このブラウザで開ける用紙は30件までです');var d={localId:this.uuid(),document:copy(document),sync:record?{formId:record.formId,revision:record.revision,versionId:record.versionId,documentSha256:record.documentSha256,ownerId:record.ownerId}:{formId:null,revision:0,versionId:null,documentSha256:null,ownerId:null},pending:null},previous=this.currentId;this.documents.push(d);this.currentId=d.localId;try{this.persist();}catch(e){this.documents.pop();this.currentId=previous;throw e;}this.notify();return d;}
  update(document){validate(document);var d=this.current();d.document=copy(document);this.persist();this.notify();}
  select(id){if(!this.documents.some(function(d){return d.localId===id;}))throw problem('INVALID','用紙が見つかりません');this.currentId=id;this.persist();this.notify();return this.current();}
  async connect(){var session=await this.rpc('session',{});if(!session||session.allowed!==true||typeof session.actorId!=='string'||!session.actorId||session.actorId!==session.email)throw problem('FORBIDDEN','利用する教員アカウントを確認できません');this.actor=session.actorId;this.storeConfigured=session.storeConfigured===true;this.notify();return session;}
  async list(){if(!this.actor)throw problem('DISCONNECTED','GASへ接続してください');if(!this.storeConfigured)throw problem('NOT_CONFIGURED','保存先のGSSは未設定です');return this.rpc('list',{});}
  async load(id){if(!this.actor)throw problem('DISCONNECTED','GASへ接続してください');if(!this.storeConfigured)throw problem('NOT_CONFIGURED','保存先のGSSは未設定です');var record=await this.rpc('load',{formId:id});await this.verify(record);if(record.formId!==id)throw problem('INTEGRITY','別の用紙が応答されました');
   // Open a new local document; preserve the existing local copy and unsent edits.
   return this.add(record.document,record);
  }
  async verify(record){if(!record||record.ownerId!==this.actor||typeof record.formId!=='string'||!Number.isInteger(record.revision)||record.revision<1||typeof record.versionId!=='string')throw problem('INTEGRITY','保存結果の対象を確認できません');validate(record.document);if(await this.hash(record.document)!==record.documentSha256)throw problem('INTEGRITY','保存内容の読戻しが一致しません');}
  async save(){if(this.busy)throw problem('BUSY','保存処理中です');if(!this.actor)throw problem('DISCONNECTED','GASへ接続してください');if(!this.storeConfigured)throw problem('NOT_CONFIGURED','保存先のGSSは未設定です');var d=this.current();validate(d.document);this.busy=true;this.notify();
   try{if(!d.pending){d.pending={actor:this.actor,data:{requestId:this.uuid(),formId:d.sync.formId,baseRevision:d.sync.revision,document:copy(d.document)}};this.persist();}
    if(d.pending.actor!==this.actor)throw problem('FORBIDDEN','前回の保存要求と接続アカウントが異なります');this.persist();var sent=copy(d.pending.data),record=await this.rpc('save',sent);await this.verify(record);
    if(record.requestId!==sent.requestId||record.revision!==sent.baseRevision+1||sent.formId!==null&&record.formId!==sent.formId||await this.hash(sent.document)!==record.documentSha256)throw problem('INTEGRITY','保存要求と応答が一致しません');
    var old=copy(d.sync);d.sync={formId:record.formId,revision:record.revision,versionId:record.versionId,documentSha256:record.documentSha256,ownerId:record.ownerId};var pending=d.pending;d.pending=null;
    try{this.persist();}catch(e){d.sync=old;d.pending=pending;throw e;}return record;
   }finally{this.busy=false;this.notify();}
  }
 }
 root.OMRWorkspace={Workspace:Workspace,validate:validate,key:KEY};
})(typeof window==='undefined'?globalThis:window);
