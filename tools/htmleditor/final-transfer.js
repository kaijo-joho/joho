/* 未合意のfm2画面接続候補。実GASのorigin/Windowを確認するまで有効化しない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlFinalTransfer = factory();
}(globalThis, function () {
  'use strict';
  const CONTRACT = 'html-editor.fm2-zip.draft-2';
  const MAX_BYTES = 10 * 1024 * 1024;
  const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
  const hash = value => typeof value === 'string' && /^[0-9a-f]{64}$/.test(value);
  const id = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,100}$/.test(value);
  const positive = value => Number.isSafeInteger(value) && value > 0;
  function keys(value, required, optional = []) {
    return value && !Array.isArray(value) && typeof value === 'object' &&
      required.every(key => Object.hasOwn(value,key)) &&
      Reflect.ownKeys(value).every(key => required.includes(key) || optional.includes(key));
  }
  function utc(value) {
    if (typeof value !== 'string' || !/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{3})?Z$/.test(value)) return false;
    const ms = Date.parse(value);
    return Number.isFinite(ms) && new Date(ms).toISOString() === (value.includes('.') ? value : value.replace('Z','.000Z'));
  }
  function route(value) {
    if (!keys(value,['bookId','pid','itemId']) || Object.values(value).some(v => typeof v !== 'string' || !v || v.length > 160 || /[\u0000-\u001f\u007f]/.test(v))) throw Error('提出先を確認できません。');
    return Object.freeze({bookId:value.bookId,pid:value.pid,itemId:value.itemId});
  }
  function context(value) {
    if (!keys(value,['route','actorBinding']) || typeof value.actorBinding !== 'string' || !/^[A-Za-z0-9_-]{16,160}$/.test(value.actorBinding)) throw Error('当回の本人確認を完了してください。');
    return Object.freeze({route:route(value.route),actorBinding:value.actorBinding});
  }
  function formalReference(value) {
    if (!keys(value,['formRevision','formalRequestId'],['submissionFingerprint','attemptId','submittedAt']) ||
        !positive(value.formRevision) || !id(value.formalRequestId) ||
        Object.hasOwn(value,'submissionFingerprint') && !hash(value.submissionFingerprint) ||
        Object.hasOwn(value,'attemptId') !== Object.hasOwn(value,'submittedAt') ||
        Object.hasOwn(value,'attemptId') && (!hash(value.submissionFingerprint) || !id(value.attemptId) || !utc(value.submittedAt))) throw Error('正式提出の照合値を確認できません。');
    return Object.freeze({...value});
  }
  function formalReceipt(value) {
    if (!keys(value,['status','formalRequestId','attemptId','archiveSha256','submissionFingerprint','submittedAt']) ||
        value.status !== 'accepted' || !id(value.formalRequestId) || !id(value.attemptId) ||
        !hash(value.archiveSha256) || !hash(value.submissionFingerprint) || !utc(value.submittedAt)) throw Error('正式受付の結果を確認できません。');
    return Object.freeze({status:'accepted',formalRequestId:value.formalRequestId,attemptId:value.attemptId,archiveSha256:value.archiveSha256,submissionFingerprint:value.submissionFingerprint,submittedAt:value.submittedAt});
  }
  function archive(value) {
    if (!(value?.blob instanceof Blob) || !value.blob.size || value.blob.size > MAX_BYTES || !hash(value.sha256) ||
        typeof value.name !== 'string' || !/^[^/\\\u0000-\u001f\u007f]+\.zip$/i.test(value.name) || new TextEncoder().encode(value.name).length > 240) throw Error('固定ZIPを確認できません。');
    return Object.freeze({blob:value.blob,sha256:value.sha256,name:value.name});
  }
  async function digest(bytes, cryptoApi = globalThis.crypto) {
    return [...new Uint8Array(await cryptoApi.subtle.digest('SHA-256',bytes))].map(n=>n.toString(16).padStart(2,'0')).join('');
  }
  function create(options) {
    const {config,frame,snapshot,isCurrent,onState = () => {},host = globalThis.window,
      cryptoApi = globalThis.crypto,timeoutMs = 30000,timers = globalThis} = options;
    if (config?.enabled !== true || config.contractAgreed !== true || config.contract !== CONTRACT) throw Error('最終課題の提出接続は準備中です。');
    if (Object.hasOwn(options,'requestId') || !uuid(options.transferRequestId) || typeof isCurrent !== 'function' ||
        !host?.addEventListener || !host?.removeEventListener || typeof onState !== 'function' ||
        !timers?.setTimeout || !timers?.clearTimeout || !positive(timeoutMs) || timeoutMs > 120000) throw Error('提出接続の照合条件を確認できません。');
    const url = new URL(config.frameUrl), expected = new URL(config.origin), fixedContext = context(options.context), fixed = archive(snapshot);
    if (expected.protocol !== 'https:' || expected.origin !== config.origin || url.origin !== config.origin || url.username || url.password || url.hash || !frame?.contentWindow) throw Error('提出画面の接続先を確認できません。');
    const source = frame.contentWindow, expectedOrigin = config.origin, transferRequestId = options.transferRequestId, nonce = cryptoApi.randomUUID();
    let recovery = options.recovery ? formalReference(options.recovery) : null;
    if (recovery?.formalRequestId === transferRequestId) throw Error('ZIP受渡しと正式提出のIDを分けてください。');
    let phase = 'idle', timer = null, epoch = 0, disposed = false, archiveAttempted = Boolean(recovery), archiveSent = false, staged = false;
    let formRevision = 0, formal = null, receipt = null, history = null, publication = null, publicationRevision = 0, checkSequence = 0, query = null;
    const usedFormalIds = new Map();
    function notify(next,detail) { try { onState(next,detail); } catch (_) { /* 表示側の失敗で送信・受付を増やさない。 */ } }
    function change(next,detail) { phase = next; notify(next,detail); }
    function clear() { if (timer !== null) timers.clearTimeout(timer); timer = null; }
    function stop(reason) {
      if (disposed || phase === 'blocked') return false;
      clear(); epoch++; query = null; receipt = null; formal = null; publication = null;
      change('blocked',Object.freeze({reason})); return false;
    }
    function current() {
      if (disposed || phase === 'blocked') return false;
      try { if (frame.contentWindow === source && isCurrent() === true) return true; } catch (_) { /* 不明な状態は採用しない。 */ }
      return stop('editor-or-context-changed');
    }
    function unknown(reason) {
      clear(); epoch++; query = null;
      if (receipt) notify('receipt-check-unknown',Object.freeze({reason}));
      else change('unknown',Object.freeze({reason}));
    }
    function watch() { clear(); timer = timers.setTimeout(()=>unknown('timeout'),timeoutMs); }
    function send(operation,payload = {}) {
      if (!current()) return false;
      source.postMessage({contract:CONTRACT,operation,nonce,transferRequestId,route:fixedContext.route,
        actorBinding:fixedContext.actorBinding,archiveSha256:fixed.sha256,...payload},expectedOrigin);
      return true;
    }
    function accept(value) {
      if (value.formalRequestId !== formal?.formalRequestId || value.formalRequestId === transferRequestId || value.archiveSha256 !== fixed.sha256 ||
          formal.submissionFingerprint && formal.submissionFingerprint !== value.submissionFingerprint ||
          receipt && JSON.stringify(receipt) !== JSON.stringify(value)) return;
      clear(); epoch++; query = null; recovery = null; receipt = value; history = null;
      formal = formalReference({formRevision,formalRequestId:value.formalRequestId,submissionFingerprint:value.submissionFingerprint,
        attemptId:value.attemptId,submittedAt:value.submittedAt});
      change('accepted',receipt);
    }
    const baseKeys = ['contract','operation','nonce','transferRequestId','route','actorBinding','archiveSha256'];
    const fields = {ready:['formRevision'],'archive-staged':['formRevision'],'form-changed':['formRevision'],
      'formal-submitting':['formRevision','formalRequestId'],'formal-receipt':['formRevision','htmlSubmissionReceipt'],
      'status-result':['checkSequence','result'],publication:['formRevision','formalRequestId','submissionFingerprint','attemptId','status','publicationRevision'],error:['code'],'context-changed':[]};
    function receive(event) {
      const d = event.data;
      if (disposed || event.source !== source || event.origin !== expectedOrigin || !d || d.contract !== CONTRACT ||
          d.nonce !== nonce || d.transferRequestId !== transferRequestId || !Object.hasOwn(fields,d.operation) ||
          !keys(d,baseKeys.concat(fields[d.operation]))) return;
      if (!current()) return;
      if (d.actorBinding !== fixedContext.actorBinding) { stop('actor-changed'); return; }
      let r; try { r = route(d.route); } catch (_) { stop('route-changed'); return; }
      if (Object.keys(r).some(key=>r[key] !== fixedContext.route[key])) { stop('route-changed'); return; }
      if (d.archiveSha256 !== fixed.sha256) return;
      if (d.operation === 'context-changed') { stop('remote-context-changed'); return; }
      if (d.operation === 'ready' && phase === 'connecting' && positive(d.formRevision)) {
        clear(); formRevision = d.formRevision; change('ready');
      } else if (d.operation === 'archive-staged' && archiveSent && !staged && ['transferring','unknown'].includes(phase) && d.formRevision === formRevision) {
        clear(); staged = true; change('confirming');
      } else if (d.operation === 'form-changed' && staged && positive(d.formRevision) && d.formRevision > formRevision) {
        clear(); epoch++; query = null; formRevision = d.formRevision;
        if (receipt) history = Object.freeze({receipt,currentOfficial:null,matchesSubmittedContent:false,reason:'form-changed',matchesCurrent:false});
        formal = null; receipt = null; publication = null; publicationRevision = 0; change('confirming',Object.freeze({reason:'form-changed'}));
      } else if (d.operation === 'formal-submitting' && staged && d.formRevision === formRevision && id(d.formalRequestId) && d.formalRequestId !== transferRequestId &&
          (phase === 'confirming' || phase === 'unknown' && formal?.formalRequestId === d.formalRequestId)) {
        if (formal && formal.formalRequestId !== d.formalRequestId || usedFormalIds.has(d.formalRequestId) && usedFormalIds.get(d.formalRequestId) !== formRevision) return;
        formal = formalReference({formRevision,formalRequestId:d.formalRequestId}); usedFormalIds.set(d.formalRequestId,formRevision);
        change('submitting',formal); watch();
      } else if (d.operation === 'formal-receipt' && formal && d.formRevision === formRevision && ['submitting','checking','unknown','accepted','historical'].includes(phase)) {
        accept(formalReceipt(d.htmlSubmissionReceipt));
      } else if (d.operation === 'status-result' && query && d.checkSequence === query.sequence) {
        const q = query, value = d.result;
        if (value?.status === 'unknown' && keys(value,['ok','status','formalRequestId']) && value.ok === true && value.formalRequestId === q.formalRequestId) { unknown('server-unknown'); return; }
        if (!keys(value,['ok','status','formalRequestId','attemptId','archiveSha256','submissionFingerprint','submittedAt','currentOfficial','matchesSubmittedContent']) || value.ok !== true ||
            typeof value.currentOfficial !== 'boolean' || value.matchesSubmittedContent !== Boolean(q.submissionFingerprint)) return;
        const found = formalReceipt(Object.fromEntries(['status','formalRequestId','attemptId','archiveSha256','submissionFingerprint','submittedAt'].map(key=>[key,value[key]])));
        if (found.formalRequestId !== q.formalRequestId || found.archiveSha256 !== fixed.sha256 || q.submissionFingerprint && found.submissionFingerprint !== q.submissionFingerprint) return;
        clear(); query = null;
        if (q.current && formal?.formalRequestId === found.formalRequestId && q.formRevision === formRevision && q.submissionFingerprint && value.currentOfficial && value.matchesSubmittedContent) accept(found);
        else {
          receipt = null; publication = null;
          history = Object.freeze({receipt:found,currentOfficial:value.currentOfficial,matchesSubmittedContent:value.matchesSubmittedContent,reason:'lookup-only',matchesCurrent:false});
          change('historical',history);
        }
      } else if (d.operation === 'publication' && receipt && phase === 'accepted' && d.formRevision === formRevision && d.formalRequestId === receipt.formalRequestId &&
          d.submissionFingerprint === receipt.submissionFingerprint && d.attemptId === receipt.attemptId &&
          ['pending','published','failed','withdrawn'].includes(d.status) && positive(d.publicationRevision) && d.publicationRevision > publicationRevision) {
        publicationRevision = d.publicationRevision;
        publication = Object.freeze({status:d.status,attemptId:d.attemptId,formalRequestId:d.formalRequestId,publicationRevision});
        notify('publication',publication);
      } else if (d.operation === 'error' && typeof d.code === 'string' && /^[A-Z_]{1,80}$/.test(d.code)) unknown('remote-error');
    }
    const listener = event => { try { receive(event); } catch (_) { /* 不正・旧形式の通知は正式結果へ昇格しない。 */ } };
    if (!current()) throw Error('現在の作品と本人確認を照合できません。');
    host.addEventListener('message',listener);
    return Object.freeze({
      transferRequestId,context:fixedContext,
      get state() { current(); return disposed ? 'disposed' : phase; },
      get receipt() { return current() ? receipt : null; },
      get formalReference() { return current() ? formal : null; },
      get history() { return current() ? history : null; },
      get publication() { return current() ? publication : null; },
      connect() { if (!current() || phase !== 'idle') return false; change('connecting'); if (!send('hello',{archive:{name:fixed.name,sizeBytes:fixed.blob.size}})) return false; watch(); return true; },
      async sendArchive() {
        if (!current() || phase !== 'ready' || archiveAttempted) return false;
        archiveAttempted = true; const version = ++epoch; change('transferring'); watch();
        try {
          const bytes = await fixed.blob.arrayBuffer();
          if (bytes.byteLength !== fixed.blob.size || await digest(bytes,cryptoApi) !== fixed.sha256) throw Error('archive-mismatch');
          if (!current() || version !== epoch || phase !== 'transferring') return false;
          archiveSent = true;
          return send('prepare',{formRevision,archive:{name:fixed.name,sizeBytes:bytes.byteLength,sha256:fixed.sha256,bytes}});
        } catch (_) { if (current() && version === epoch) unknown('archive-mismatch'); return false; }
      },
      check() {
        if (!current() || !['ready','unknown','accepted','confirming','historical'].includes(phase)) return false;
        const ref = formal || recovery;
        if (!ref) { unknown('formal-id-unavailable'); return false; }
        query = {sequence:++checkSequence,formalRequestId:ref.formalRequestId,formRevision:ref.formRevision,current:Boolean(formal),
          ...(ref.submissionFingerprint ? {submissionFingerprint:ref.submissionFingerprint} : {})};
        const payload = {bookId:fixedContext.route.bookId,pid:fixedContext.route.pid,formalRequestId:ref.formalRequestId,archiveSha256:fixed.sha256,
          ...(ref.submissionFingerprint ? {submissionFingerprint:ref.submissionFingerprint} : {})};
        if (!receipt) change('checking');
        if (!send('status',{checkSequence,query:payload})) return false;
        watch(); return true;
      },
      invalidate() { stop('editor-invalidated'); },
      dispose() { disposed = true; epoch++; clear(); receipt = null; formal = null; publication = null; query = null; host.removeEventListener('message',listener); }
    });
  }
  return Object.freeze({CONTRACT,MAX_BYTES,uuid,hash,keys,context,formalReference,formalReceipt,archive,digest,create});
}));
