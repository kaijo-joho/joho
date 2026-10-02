/* Candidate: same-origin identity cache only; originals are fetched anew for every download. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-protocol.js'));
  else root.HtmlIdentityCache = factory(root.HtmlLocalProtocol);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (protocol) {
  'use strict';
  const DB_NAME = 'joho.htmleditor.identity-cache.v3', STORE = 'state', KEY = 'current';
  function fail(code) { throw new Error(code); }
  function empty() { return {revision:0, identity:null}; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function stateShape(state, codec) {
    if (!state || Object.keys(state).sort().join(',') !== 'identity,revision' ||
      !Number.isSafeInteger(state.revision) || state.revision < 0) fail('cache_invalid');
    if (state.identity) {
      if (Object.keys(state.identity).sort().join(',') !== 'label,token' ||
        typeof state.identity.label !== 'string' || state.identity.label.length > 64 ||
        /[\r\n<>]/.test(state.identity.label)) fail('cache_invalid');
      protocol.inspectIdentity(state.identity.token, codec);
    }
    if (protocol.bytes(JSON.stringify(state)) > 20000) fail('cache_full');
    return state;
  }
  function indexedDBStorage(indexedDB) {
    if (!indexedDB || typeof indexedDB.open !== 'function') fail('storage_unavailable');
    let connection = null, pending = null;
    function open() {
      if (connection) return Promise.resolve(connection);
      if (pending) return pending;
      pending = new Promise((resolve,reject) => {
        let settled=false, request;
        const timer=setTimeout(() => finish(new Error('storage_timeout')),2000);
        function finish(error, db) {
          if (settled) { if (db) db.close(); return; }
          settled=true; clearTimeout(timer); pending=null;
          if (error) reject(error); else { connection=db; db.onversionchange=() => {db.close(); connection=null;}; resolve(db); }
        }
        try { request=indexedDB.open(DB_NAME,1); } catch(e) { finish(e); return; }
        request.onupgradeneeded=() => {if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);};
        request.onblocked=() => finish(new Error('storage_blocked'));
        request.onerror=() => finish(request.error || new Error('storage_failed'));
        request.onsuccess=() => finish(null,request.result);
      }); return pending;
    }
    async function transact(revision, next) {
      const db=await open();
      return new Promise((resolve,reject) => {
        let tx, result, settled=false;
        const timer=setTimeout(() => {finish(new Error('storage_timeout')); try {tx.abort();} catch(_) {}},2000);
        function finish(error) {if (settled) return; settled=true; clearTimeout(timer); error ? reject(error) : resolve(result);}
        try {
          tx=db.transaction(STORE, next ? 'readwrite' : 'readonly');
          const store=tx.objectStore(STORE), request=store.get(KEY);
          request.onsuccess=() => {
            const current=request.result === undefined ? empty() : request.result;
            if (!next) {result=current; return;}
            if (!current || current.revision !== revision) {result=false; return;}
            store.put(next,KEY); result=true;
          };
          tx.oncomplete=() => finish();
          tx.onabort=() => finish(tx.error || new Error('storage_aborted'));
          tx.onerror=() => finish(tx.error || new Error('storage_failed'));
        } catch(e) {finish(e);}
      });
    }
    return {read:() => transact(), compareAndSwap:(revision,next) => transact(revision,next),
      close:() => {if(connection) connection.close(); connection=null;}};
  }
  function create(options) {
    if (!options || options.origin !== protocol.ORIGIN || options.secure !== true) fail('origin_not_allowed');
    const storage=options.storage || indexedDBStorage(options.indexedDB), codec=options.codec;
    let generation=0, queue=Promise.resolve(), activeTicket=null;
    function serial(action) {const result=queue.then(action); queue=result.catch(() => {}); return result;}
    async function read() {return stateShape(copy(await storage.read()),codec);}
    function usable(identity) {
      if (!identity) return false;
      const p=protocol.inspectIdentity(identity.token,codec), now=options.now();
      return p.issuedAt <= now && now < p.expiresAt;
    }
    async function save(previous,next) {
      next.revision=previous.revision+1; stateShape(next,codec);
      if (!(await storage.compareAndSwap(previous.revision,next))) fail('cache_changed');
      return next;
    }
    return {
      load:() => serial(async () => {
        const state=await read();
        return {status:!state.identity ? 'missing' : usable(state.identity) ? 'ready' : 'expired',
          label:state.identity && state.identity.label || '', revision:state.revision};
      }),
      identityForGeneration:() => serial(async () => {
        const state=await read();
        if (!usable(state.identity)) fail('identity_confirmation_needed');
        return copy(state.identity);
      }),
      beginConfirmation:(request={}) => serial(async () => {
        const state=await read();
        if (usable(state.identity) && request.switchAccount !== true && !(request.refreshForFile===true && request.safeToSwitch===true)) fail('confirmation_not_needed');
        if (request.switchAccount === true && request.safeToSwitch !== true) fail('switch_blocked');
        const nonce=options.randomId();
        if (!/^[a-f0-9]{32}$/.test(nonce)) fail('nonce_invalid');
        activeTicket={nonce, generation:++generation, revision:state.revision, switchAccount:request.switchAccount === true};
        return copy(activeTicket);
      }),
      // Called only after the trusted bridge validates exact origin/source/nonce and response type.
      // Browser validation is UX/shape only. It never authenticates a submission.
      acceptConfirmation:(ticket, response) => serial(async () => {
        if (!activeTicket || protocol.canonical(ticket) !== protocol.canonical(activeTicket)) fail('confirmation_stale');
        const state=await read();
        if (state.revision !== ticket.revision || generation !== ticket.generation) fail('cache_changed');
        if (!response || Object.keys(response).sort().join(',') !== 'label,nonce,token' || response.nonce !== ticket.nonce) fail('confirmation_invalid');
        const identity={token:response.token,label:response.label};
        if (!usable(identity)) fail('identity_expired');
        const before=state.identity && protocol.inspectIdentity(state.identity.token,codec);
        const after=protocol.inspectIdentity(identity.token,codec);
        if (before && before.identityId !== after.identityId && !ticket.switchAccount) fail('switch_confirmation_required');
        const next=await save(state,{revision:state.revision,identity});
        activeTicket=null;
        return {status:'ready',label:next.identity.label};
      }),
      cancelConfirmation:() => {generation++; activeTicket=null;},
      forget:(request={}) => serial(async () => {
        if (request.confirmed !== true || request.safeToSwitch !== true) fail('switch_blocked');
        generation++; activeTicket=null;
        const state=await read(); await save(state,{revision:state.revision,identity:null});
        return {status:'missing'};
      })
    };
  }
  return {create,indexedDBStorage,DB_NAME};
}));
