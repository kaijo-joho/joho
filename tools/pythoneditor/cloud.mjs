import { questionKey, validId, LIMITS } from './core.mjs';
const PROTOCOL = 'python-editor-rpc-v1';
const uuid = () => crypto.randomUUID().replaceAll('-', '');
const hex = bytes => [...bytes].map(n => n.toString(16).padStart(2,'0')).join('');
export async function codeHash(code) { return hex(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode(code)))); }
export class CloudError extends Error { constructor(code,message) { super(message);this.code=code; } }
const error = (code,message) => new CloudError(code,message);
export function bridgeURL(config, origin, channel) {
  if (!config.enabled) throw error('disabled','GSS接続は準備中です。今年度の提出は従来のColabを使用してください。');
  const url = new URL(config.bridgeURL);
  if(url.origin !== 'https://script.google.com' || !/^\/(?:a\/macros\/[A-Za-z0-9.-]+\/s|macros\/s)\/[-A-Za-z0-9_]+\/exec$/.test(url.pathname) || url.username || url.password || url.search || url.hash)
    throw error('config','学校アカウントの接続先を確認できません。');
  url.search = new URLSearchParams({kind:'pythoneditor',origin,channel}).toString();return url.href;
}
export function googleOrigin(origin) {
  try {const u=new URL(origin);return u.protocol==='https:' && !u.port && (/^(?:script|[a-z0-9-]+-script)\.googleusercontent\.com$/.test(u.hostname)||u.hostname.endsWith('.script.googleusercontent.com'));} catch {return false;}
}
export class GoogleBridge {
  constructor(config,{timeout=60000,win=window,doc=document}={}) {this.config=config;this.timeout=timeout;this.win=win;this.doc=doc;this.requests=new Map();this.generation=0;}
  async connect() {
    this.dispose();const generation=++this.generation;
    this.channel=hex(crypto.getRandomValues(new Uint8Array(32)));
    const url=bridgeURL(this.config,this.win.location.origin,this.channel);
    this.frame=this.doc.createElement('iframe');this.frame.hidden=true;this.frame.title='学校アカウント接続';this.frame.src=url;
    this.frame.referrerPolicy='no-referrer';
    const ready=new Promise((resolve,reject)=>{
      this.ready={resolve,reject};
      this.readyTimer=setTimeout(()=>reject(error('timeout','接続の応答を確認できません。学校アカウントでログインしてから再接続してください。コードは保持しています。')),this.timeout);
    });
    this.listener=event=>{
      const d=event.data;
      if(generation!==this.generation||d?.protocol!==PROTOCOL||d.channel!==this.channel||!googleOrigin(event.origin))return;
      if(d.type==='ready' && !this.peer) {this.peer=event.source;this.origin=event.origin;clearTimeout(this.readyTimer);this.ready.resolve();return;}
      if(event.source!==this.peer||event.origin!==this.origin||d.type!=='response')return;
      const pending=this.requests.get(d.id);if(!pending)return;
      clearTimeout(pending.timer);this.requests.delete(d.id);
      if(d.result?.ok===true)pending.resolve(d.result.value);
      else {const e=error(d.result?.error?.code||'transport',d.result?.error?.message||'接続の応答を確認できません。コードは保持しています。');if(d.result?.error?.intakeTicket)e.intakeTicket=d.result.error.intakeTicket;pending.reject(e);}
    };
    this.win.addEventListener('message',this.listener);this.doc.body.append(this.frame);
    try {await ready;return await this.call('session',{});} catch(e) {this.dispose();throw e;}
  }
  call(action,input,actorKey) {
    if(!this.peer) return Promise.reject(error('disconnected','学校アカウントへ接続してください。'));
    if(this.requests.size>=8)return Promise.reject(error('busy','通信処理が混み合っています。'));
    const id=uuid();
    return new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>{this.requests.delete(id);reject(error('timeout','応答を確認できません。保存・提出の送信番号は保持しています。結果を照会するか同じ要求で再試行してください。'));},this.timeout);
      this.requests.set(id,{resolve,reject,timer});
      this.peer.postMessage({protocol:PROTOCOL,channel:this.channel,type:'request',id,action,input,actorKey:actorKey||null},this.origin);
    });
  }
  dispose() {
    this.generation++;clearTimeout(this.readyTimer);
    if(this.listener)this.win.removeEventListener('message',this.listener);
    this.ready?.reject(error('disconnected','接続を終了しました。コードと送信番号は保持しています。'));
    for(const p of this.requests.values()){clearTimeout(p.timer);p.reject(error('disconnected','接続を終了しました。コードと送信番号は保持しています。'));}
    this.requests.clear();this.frame?.remove();this.frame=null;this.peer=null;this.origin=null;this.ready=null;
  }
}
// ローカルの不変送信控え。応答消失・再認証・再読み込み後にも同じID/全文を再送する。
export class CloudJournal {
  constructor(storage,actorKey) {
    if(!/^[a-f0-9]{64}$/.test(actorKey))throw error('session','接続した本人を確認できません。');
    this.storage=storage;this.actorKey=actorKey;this.prefix=`joho.pythoneditor.cloud.v1.${actorKey}.`;
  }
  read(key) {
    const r=JSON.parse(this.storage.getItem(key));
    if(!r||r.actorKey!==this.actorKey||!['saveDraft','submit'].includes(r.action)||!validId(r.input?.questionId)||!validId(r.input?.version)||
      !/^[a-f0-9]{32}$/.test(r.input?.requestId)||key!==this.prefix+r.action+'.'+r.input.requestId)throw error('journal','送信控えの形式を確認できません。元データは保持しています。');
    return r;
  }
  pending(q,action) {
    const rows=[];
    for(let i=0;i<this.storage.length;i++){const key=this.storage.key(i);if(key?.startsWith(this.prefix+action+'.')){const r=this.read(key);if(questionKey(r.input)===questionKey(q)&&(!q.assignmentId||r.input.assignmentId===q.assignmentId))rows.push(r);}}
    return rows.sort((a,b)=>a.createdAt.localeCompare(b.createdAt))[0]||null;
  }
  put(action,input) {
    const record={actorKey:this.actorKey,action,input:structuredClone(input),createdAt:new Date().toISOString()};
    const key=this.prefix+action+'.'+input.requestId;
    try {this.storage.setItem(key,JSON.stringify(record));if(JSON.stringify(this.read(key).input)!==JSON.stringify(record.input))throw new Error();}
    catch{throw error('journal','再送用の控えをブラウザに保存できません。コードをファイルに保存してから再試行してください。送信は開始していません。');}
    return record;
  }
  remove(record) {
    const key=this.prefix+record.action+'.'+record.input.requestId;
    if(this.storage.getItem(key)!==null){const r=this.read(key);if(JSON.stringify(r.input)!==JSON.stringify(record.input))throw error('journal','送信控えが変更されました。元の結果を照会してください。');this.storage.removeItem(key);}
  }
  ticket(record,ticket) {
    const key=this.prefix+record.action+'.'+record.input.requestId,current=this.read(key);
    if(JSON.stringify(current.input)!==JSON.stringify(record.input))throw error('journal','送信控えが変更されました。');
    this.storage.setItem(key,JSON.stringify({...current,intakeTicket:ticket}));
  }
}
export class CloudWorkspace {
  constructor(rpc,session,storage) {this.rpc=rpc;this.session=session;this.journal=new CloudJournal(storage,session.actorKey);this.bases=new Map();}
  call(action,input) {return this.rpc(action,input,this.session.actorKey);}
  policy(q) {const rows=this.session.policies.filter(p=>questionKey(p)===questionKey(q));return rows.length===1?rows[0]:null;}
  async draft(q,revision) {return this.call('getDraft',{questionId:q.questionId,version:q.version,...(revision?{revision}:{})});}
  adoptRevision(q,revision) {this.bases.set(questionKey(q),revision);}
  async save(entry) {
    const pending=this.journal.pending(entry,'saveDraft');
    if(pending)return this.sendDraft(pending);
    const key=questionKey(entry);
    if(!this.bases.has(key)) {
      const {draft}=await this.draft(entry);
      if(draft && (draft.code!==entry.code||draft.stdin!==entry.stdin))return {state:'conflict',draft};
      this.bases.set(key,draft?.revision||null);
    }
    const input={questionId:entry.questionId,version:entry.version,requestId:uuid(),expectedRevision:this.bases.get(key),code:entry.code,stdin:entry.stdin};
    return this.sendDraft(this.journal.put('saveDraft',input));
  }
  async sendDraft(record) {
    const result=await this.call('saveDraft',record.input);
    if(result.state==='saved')this.bases.set(questionKey(record.input),result.draft.revision);
    if(['saved','conflict'].includes(result.state))this.journal.remove(record);
    return {...result,sent:record.input};
  }
  async submit(input) {
    const prior=this.journal.pending(input,'submit');
    const record=prior||this.journal.put('submit',{...input,requestId:uuid()});
    let result;
    try{result=await this.call('submit',{...record.input,...(record.intakeTicket?{intakeTicket:record.intakeTicket}:{})});}
    catch(e){if(e.intakeTicket)this.journal.ticket(record,e.intakeTicket);throw e;}
    if(result.receipt?.state==='submitted')this.journal.remove(record);
    return result;
  }
  async recover(q,assignmentId,resume=false) {
    const pending=this.journal.pending({...q,assignmentId},'submit');
    if(!pending)return this.call('questionStatus',{questionId:q.questionId,version:q.version,assignmentId});
    const result=await this.call(resume?'resumeSubmission':'getSubmission',{requestId:pending.input.requestId});
    if(result.receipt?.state==='submitted')this.journal.remove(pending);
    return {...result,unreceived:!result.receipt,pendingRequestId:pending.input.requestId};
  }
}
export async function submissionText(entry,policy,run) {
  const matching=run && run.code===entry.code && run.stdin===entry.stdin;
  const result={questionId:entry.questionId,version:entry.version,assignmentId:policy.assignmentId,code:entry.code,stdin:entry.stdin,
    run:{codeHash:await codeHash(entry.code),outcome:matching?run.outcome:'not_run',truncated:matching?run.truncated===true:false,
      outputText:matching?run.text:'',stdout:matching?run.stdout:'',inputEcho:matching?run.inputEcho:'',stderr:matching?run.stderr:'',errorText:matching?run.error:''}};
  for(const name of ['outputText','stdout','inputEcho','stderr','errorText'])if(result.run[name].length>LIMITS.output)throw error('output','実行テキストが長すぎます。再実行して出力を確認してください。');
  return result;
}
