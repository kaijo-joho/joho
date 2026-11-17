/* 固定ZIPと照会用識別子の回復専用。保存された値は受付・本人確認の証拠ではない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./final-transfer.js'));
  else root.HtmlFinalPending = factory(root.HtmlFinalTransfer);
}(globalThis, function (protocol) {
  'use strict';
  const DATABASE = 'joho.htmleditor.final-pending.v2';
  const STORE = 'requests', MAX_RECORDS = 10, MAX_REFERENCES = 10;
  function create(indexedDB, {cryptoApi = globalThis.crypto, timeoutMs = 3000, timers = globalThis} = {}) {
    if (!protocol || !Number.isSafeInteger(timeoutMs) || timeoutMs <= 0 || timeoutMs > 30000) throw Error('ZIP回復用の設定を確認できません。');
    const fail = () => Error('前回のZIP・本人・提出先を照合できません。再送せず授業担当者へ相談してください。');
    const equalBytes = (a,b) => { const left = new Uint8Array(a), right = new Uint8Array(b); return left.length === right.length && left.every((v,i)=>v === right[i]); };
    async function keyFor(context,archiveSha256) {
      return protocol.digest(new TextEncoder().encode(JSON.stringify({contract:protocol.CONTRACT,actorBinding:context.actorBinding,route:context.route,archiveSha256})),cryptoApi);
    }
    async function open() {
      if (!indexedDB) throw Error('ZIP回復用の記憶領域を利用できません。');
      return new Promise((resolve,reject)=>{
        const request = indexedDB.open(DATABASE,1); let done = false;
        const finish = error => { if (done) return; done = true; timers.clearTimeout(timer); reject(error); };
        const timer = timers.setTimeout(()=>finish(Error('ZIP回復用の記録を開く処理が時間切れになりました。')),timeoutMs);
        request.onupgradeneeded = () => { if (!done) request.result.createObjectStore(STORE,{keyPath:'key'}); };
        request.onsuccess = () => { if (done) request.result.close(); else { done = true; timers.clearTimeout(timer); resolve(request.result); } };
        request.onerror = () => finish(Error('ZIP回復用の記録を開けません。'));
        request.onblocked = () => finish(Error('他のタブのZIP回復処理を確認してください。'));
      });
    }
    async function transaction(mode,action) {
      const db = await open();
      try {
        return await new Promise((resolve,reject)=>{
          const tx = db.transaction(STORE,mode), store = tx.objectStore(STORE); let result, problem;
          const timer = timers.setTimeout(()=>{ problem = Error('ZIP回復用の記録処理が時間切れになりました。'); try { tx.abort(); } catch (_) {} },timeoutMs);
          const abort = error => { problem = error; try { tx.abort(); } catch (_) {} };
          tx.oncomplete = () => { timers.clearTimeout(timer); resolve(result); };
          tx.onabort = tx.onerror = () => { timers.clearTimeout(timer); reject(problem || Error('ZIP回復用の記録を保存できません。')); };
          try { action(store,value=>{ result = value; },abort); } catch (error) { abort(error); }
        });
      } finally { db.close(); }
    }
    function shape(saved,key,context) {
      if (!protocol.keys(saved,['v','key','contract','context','transferRequestId','archiveSha256','name','bytes','references']) ||
          saved.v !== 2 || saved.key !== key || saved.contract !== protocol.CONTRACT || !protocol.uuid(saved.transferRequestId) ||
          !protocol.hash(saved.archiveSha256) || !(saved.bytes instanceof ArrayBuffer) || !Array.isArray(saved.references) || saved.references.length > MAX_REFERENCES) throw fail();
      if (JSON.stringify(protocol.context(saved.context)) !== JSON.stringify(context)) throw fail();
      protocol.archive({blob:new Blob([saved.bytes]),sha256:saved.archiveSha256,name:saved.name});
      const ids = new Set();
      for (const value of saved.references) {
        const ref = protocol.formalReference(value);
        if (ref.formalRequestId === saved.transferRequestId || ids.has(ref.formalRequestId)) throw fail();
        ids.add(ref.formalRequestId);
      }
      return saved;
    }
    async function verified(saved,key,context) {
      shape(saved,key,context);
      if (key !== await keyFor(context,saved.archiveSha256) || await protocol.digest(saved.bytes,cryptoApi) !== saved.archiveSha256) throw fail();
      return Object.freeze({key,context,transferRequestId:saved.transferRequestId,
        snapshot:Object.freeze({blob:new Blob([saved.bytes],{type:'application/zip'}),sha256:saved.archiveSha256,name:saved.name}),
        references:Object.freeze(saved.references.map(protocol.formalReference)),receiptVerified:false});
    }
    async function recover(key,value) {
      if (!protocol.hash(key)) throw fail();
      const context = protocol.context(value);
      const saved = await transaction('readonly',(store,finish)=>{ const request = store.get(key); request.onsuccess = () => finish(request.result); });
      return verified(saved,key,context);
    }
    async function reserve(value,snapshot) {
      const context = protocol.context(value), fixed = protocol.archive(snapshot), bytes = await fixed.blob.arrayBuffer();
      if (bytes.byteLength !== fixed.blob.size || await protocol.digest(bytes,cryptoApi) !== fixed.sha256) throw fail();
      const key = await keyFor(context,fixed.sha256);
      const saved = await transaction('readwrite',(store,finish,abort)=>{
        const request = store.get(key);
        request.onsuccess = () => {
          if (request.result) { finish(request.result); return; }
          const count = store.count();
          count.onsuccess = () => {
            if (count.result >= MAX_RECORDS) { abort(Error('ZIP回復用の記録が上限に達しました。授業担当者へ相談してください。')); return; }
            const record = {v:2,key,contract:protocol.CONTRACT,context,transferRequestId:cryptoApi.randomUUID(),archiveSha256:fixed.sha256,name:fixed.name,bytes,references:[]};
            store.add(record); finish(record);
          };
        };
      });
      const result = await verified(saved,key,context);
      if (result.snapshot.sha256 !== fixed.sha256 || !equalBytes(await result.snapshot.blob.arrayBuffer(),bytes)) throw fail();
      return result;
    }
    async function rememberFormal(key,value,transferRequestId,reference) {
      const context = protocol.context(value), ref = protocol.formalReference(reference), prior = await recover(key,context);
      if (transferRequestId !== prior.transferRequestId || ref.formalRequestId === transferRequestId) throw fail();
      const bytes = await prior.snapshot.blob.arrayBuffer();
      await transaction('readwrite',(store,finish,abort)=>{
        const request = store.get(key);
        request.onsuccess = () => {
          try {
            const saved = shape(request.result,key,context);
            if (saved.transferRequestId !== transferRequestId || saved.archiveSha256 !== prior.snapshot.sha256 || !equalBytes(saved.bytes,bytes)) throw fail();
            const old = saved.references.find(v=>v.formalRequestId === ref.formalRequestId);
            if (old && (old.formRevision !== ref.formRevision || ['submissionFingerprint','attemptId','submittedAt'].some(k=>Object.hasOwn(old,k) && old[k] !== ref[k]))) throw fail();
            if (!old && saved.references.length >= MAX_REFERENCES) throw Error('受付確認用の識別子が上限に達しました。授業担当者へ相談してください。');
            saved.references = old ? saved.references.map(v=>v.formalRequestId === ref.formalRequestId ? {...ref} : v) : saved.references.concat([{...ref}]);
            store.put(saved); finish(null);
          } catch (error) { abort(error); }
        };
      });
      return recover(key,context);
    }
    return Object.freeze({reserve,recover,rememberFormal});
  }
  return Object.freeze({DATABASE,create});
}));
