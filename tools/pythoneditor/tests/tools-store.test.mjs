import test from 'node:test';
import assert from 'node:assert/strict';
import { ToolsBridge, ToolsStoreClient, DraftAutosave, gasURL, validateConnection } from '../tools-store.mjs';
import { codeHash, CloudError } from '../cloud.mjs';

const q = { questionId: 'q1', version: 'v1', setId: 'practice', title: '問1', kind: 'code' };
const entry = (code = 'print(1)') => ({ ...q, code, stdin: '', updatedAt: '2026-10-15T00:00:00.000Z' });
const session = { account: 'student@example.invalid', actorKey: 'a'.repeat(64) };
class Storage {
  data = new Map(); getItem(k) { return this.data.get(k) || null; } setItem(k, v) { this.data.set(k, v); } removeItem(k) { this.data.delete(k); }
}
function server() {
  let draft = null, seq = 0, lose = false; const accepted = new Map(), calls = [];
  return {
    calls, get draft() { return draft; }, lose() { lose = true; },
    async rpc(action, input) {
      calls.push({ action, input: structuredClone(input) });
      if (action === 'getDraft') return { draft: draft && structuredClone(draft) };
      if (action === 'lookupSave') return accepted.has(input.requestId)?structuredClone(accepted.get(input.requestId)):{state:'missing'};
      if (action === 'saveDraft') {
        if (accepted.has(input.requestId)) return structuredClone(accepted.get(input.requestId));
        if ((draft?.revision || null) !== input.expectedRevision) return { state: 'conflict', draft: structuredClone(draft) };
        draft = { ...input, revision: (++seq).toString(16).padStart(32, '0'), seq, updatedAt: new Date().toISOString(), codeHash: await codeHash(input.code), stdinHash:await codeHash(input.stdin) };
        const result = { state: 'saved', draft: structuredClone(draft) }; accepted.set(input.requestId, result);
        if (lose) { lose = false; throw new CloudError('timeout', 'response lost'); } return result;
      }
      throw new Error(action);
    }
  };
}
class Clock {
  time = 1000; next = 0; tasks = new Map();
  now = () => this.time;
  set = (fn, ms) => { const id = ++this.next; this.tasks.set(id, { fn, at: this.time + ms }); return id; };
  clear = id => this.tasks.delete(id);
  async advance(ms) {
    const end = this.time + ms; let count = 0;
    while (true) {
      const next = [...this.tasks].filter(([, job]) => job.at <= end).sort((a, b) => a[1].at - b[1].at)[0]; if (!next) break;
      assert.ok(++count < 1000, 'timer loop'); this.time = next[1].at; this.tasks.delete(next[0]); await next[1].fn();
    }
    this.time = end;
  }
  options = () => ({ now: this.now, setTimer: this.set, clearTimer: this.clear, random: () => 0, idleMs: 40, minIntervalMs: 200, maxWaitMs: 300, jitterMs: 0 });
}

test('URLは固定したGAS execのみ、接続情報のIDを保存権限の代用にしない', () => {
  assert.match(gasURL('https://script.google.com/macros/s/EXAMPLE/exec', 'https://editor.test', 'b'.repeat(64), 'dist'), /type=toolsStore/);
  for (const url of ['https://evil.test/exec', 'https://script.google.com/macros/s/EXAMPLE/dev', 'https://script.google.com/macros/s/EXAMPLE/exec?target=other']) assert.throws(() => gasURL(url, '', '', 'store'));
  assert.throws(() => validateConnection({ ...session, schemaVersion: 1, spreadsheetId: 'arbitrary', binding: 'token', storeURL: 'https://evil.test' }));
});
test('応答消失後の再読み込みは同じ番号・全文を再送、後続の編集を混ぜない', async () => {
  const backend = server(), storage = new Storage(); let client = new ToolsStoreClient(backend.rpc.bind(backend), session, storage);
  backend.lose(); await assert.rejects(client.save(entry('first')));
  const first = backend.calls.find(c => c.action === 'saveDraft').input;
  client = new ToolsStoreClient(backend.rpc.bind(backend), session, storage);
  const result = await client.save(entry('later editing'));
  assert.equal(result.state,'conflict');assert.equal(result.sent.code, 'first'); assert.equal(result.sent.requestId, first.requestId); assert.equal(backend.draft.seq, 1);
  client.adopt(q,result.draft);
  await client.save(entry('later editing')); assert.equal(backend.draft.code, 'later editing'); assert.equal(backend.draft.seq, 2);
});
test('ブラウザ保存不能でもメモリの不変要求を保持してクラウドへ保存する', async () => {
  const backend = server(), storage = { getItem: () => null, setItem() { throw new Error('quota'); }, removeItem() { throw new Error('quota'); } }; let warnings = 0;
  const client = new ToolsStoreClient(backend.rpc.bind(backend), session, storage, { warn: () => warnings++ });
  backend.lose(); await assert.rejects(client.save(entry('memory')));
  const requestId = backend.calls.find(c => c.action === 'saveDraft').input.requestId;
  const result = await client.save(entry('next')); assert.equal(result.sent.requestId, requestId); assert.equal(result.sent.code, 'memory'); assert.ok(warnings);
  await client.save(entry('next')); assert.equal(backend.draft.code, 'next');
});
test('初見のクラウド差分は競合とし、CASで別端末の変更を上書きしない', async () => {
  const backend = server(), a = new ToolsStoreClient(backend.rpc.bind(backend), session, new Storage()), b = new ToolsStoreClient(backend.rpc.bind(backend), session, new Storage());
  await a.save(entry('home')); const inspection = await b.inspect(entry('loan'));
  assert.equal(inspection.state, 'conflict'); assert.equal(backend.draft.code, 'home');
  b.adopt(q, inspection.draft); await b.save(entry('loan'));
  const conflict = await a.save(entry('home continued')); assert.equal(conflict.state, 'conflict'); assert.equal(conflict.draft.code, 'loan');
  assert.equal(backend.calls.filter(c => c.action === 'saveDraft').length, 3);
});
test('本文保存だけ失敗して小さいbaseメタデータが残っても、再接続で古い本文を自動送信しない',async()=>{
  const backend=server(),storage=new Storage(),a=new ToolsStoreClient(backend.rpc.bind(backend),session,storage);
  await a.save(entry('cloud new'));
  const reloaded=new ToolsStoreClient(backend.rpc.bind(backend),session,storage);
  assert.equal((await reloaded.save(entry('browser old'))).state,'conflict');assert.equal(backend.draft.code,'cloud new');
});
test('CASの相手の下書きが消失した場合は要求を保持して停止する',async()=>{
  const backend=server(),storage=new Storage(),client=new ToolsStoreClient(backend.rpc.bind(backend),session,storage);
  client.adopt(q,{revision:'a'.repeat(32)});client.rpc=async(action,input)=>action==='saveDraft'?{state:'conflict',draft:null}:backend.rpc(action,input);
  await assert.rejects(client.save(entry()),e=>e.code==='draft_missing');assert.ok(client.pending(q));
});
test('入力中の連続編集をまとめ、送信間隔と最大待ち時間を守る', async () => {
  const backend = server(), client = new ToolsStoreClient(backend.rpc.bind(backend), session, new Storage()), clock = new Clock();
  const auto = new DraftAutosave(client, clock.options());
  auto.edit(q, entry('a')); await clock.advance(20); auto.edit(q, entry('ab')); await clock.advance(39); assert.equal(backend.draft, null);
  await clock.advance(1); assert.equal(backend.draft.code, 'ab');
  for (let i = 0; i < 20; i++) { auto.edit(q, entry(String(i))); await clock.advance(20); }
  assert.ok(backend.calls.filter(c => c.action === 'saveDraft').length <= 3); assert.notEqual(backend.draft.code, 'ab');
  auto.dispose();
});
test('遅れた保存応答は新しい編集を保存済みにせず、次の送信で追いつく', async () => {
  const clock = new Clock(); let resolve, calls = 0;
  const client = { session, async save(sent) { calls++; await new Promise(r => resolve = r); return { state: 'saved', sent }; } };
  const auto = new DraftAutosave(client, clock.options()); auto.edit(q, entry('before'));
  const first = auto.pump(true); await Promise.resolve(); auto.edit(q, entry('after')); resolve(); await first;
  assert.equal(auto.state(q).status, 'waiting'); assert.equal(auto.state(q).entry.code, 'after'); assert.equal(auto.state(q).ack.code, 'before'); assert.equal(calls, 1);
  const advancing = clock.advance(200); await Promise.resolve(); resolve(); await advancing;
  assert.equal(auto.state(q).status, 'saved'); assert.equal(auto.state(q).ack.code, 'after'); auto.dispose();
});
test('認証切れでは停止し、同じ本人への再接続後に同じ送信を再開する', async () => {
  const clock = new Clock(); let expired = true; const sent = [];
  const client = { session, async save(input) { sent.push(input.code); if (expired) throw new CloudError('binding_expired', 'expired'); return { state: 'saved', sent: input }; } };
  const auto = new DraftAutosave(client, clock.options()); auto.edit(q, entry('protected')); await auto.pump(true);
  assert.equal(auto.connected, false); await clock.advance(10000); assert.equal(sent.length, 1);
  assert.throws(() => auto.reconnect({ ...client, session: { actorKey: 'b'.repeat(64) } }));
  expired = false; auto.reconnect(client); await clock.advance(40); assert.equal(auto.state(q).status, 'saved'); assert.deepEqual(sent, ['protected', 'protected']); auto.dispose();
});
test('GSSの書込結果不明も自動で照会し、受理済み本文を重複登録しない',async()=>{
  const backend=server(),storage=new Storage(),clock=new Clock();backend.lose();
  const client=new ToolsStoreClient(async(...args)=>{try{return await backend.rpc(...args);}catch(e){throw new CloudError('storage_write_uncertain',e.message);}},session,storage);
  const auto=new DraftAutosave(client,clock.options());auto.edit(q,entry('uncertain write'));await auto.pump(true);
  assert.equal(auto.state(q).status,'retry');await clock.advance(2200);assert.equal(auto.state(q).status,'saved');assert.equal(backend.draft.seq,1);assert.ok(backend.calls.some(c=>c.action==='lookupSave'));auto.dispose();
});
test('二重iframeの子孫とnonce/origin/sourceを照合し、他のGAS枠を受け入れない', async () => {
  let listener, frame; const origin = 'https://script.googleusercontent.com', win = { location: { origin: 'https://editor.test' }, addEventListener(_t, fn) { listener = fn; }, removeEventListener() {} };
  const topFrame = { parent: null }; topFrame.parent = topFrame;
  const doc = { createElement: () => (frame = { contentWindow: topFrame, remove() {} }), body: { append() {} } };
  const bridge = new ToolsBridge('https://script.google.com/macros/s/EXAMPLE/exec', { mode: 'dist', win, doc, timeout: 100 });
  const pending = bridge.connect(); const channel = new URL(frame.src).searchParams.get('channel'); let requests = 0;
  const other = { parent: null }; other.parent = other;
  listener({ origin, source: other, data: { protocol: 'tools-store-rpc-v1', channel, type: 'ready' } }); assert.equal(bridge.peer, null);
  const child = { parent: topFrame, postMessage(data) { requests++; queueMicrotask(() => listener({ origin, source: child, data: { protocol: 'tools-store-rpc-v1', channel, type: 'response', id: data.id, result: { ok: true, value: session } } })); } };
  listener({ origin: 'https://evil.test', source: child, data: { protocol: 'tools-store-rpc-v1', channel, type: 'ready' } }); assert.equal(requests, 0);
  listener({ origin, source: child, data: { protocol: 'tools-store-rpc-v1', channel, type: 'ready' } }); assert.deepEqual(await pending, session); assert.equal(requests, 1); bridge.dispose();
});
test('生徒権限GASの受付時刻証明をエラーから引き継ぐ', async () => {
  let listener, frame;
  const origin='https://script.googleusercontent.com',win={location:{origin:'https://editor.test'},addEventListener(_t,fn){listener=fn;},removeEventListener(){}};
  const peer={parent:null,postMessage(data){
    queueMicrotask(()=>listener({origin,source:peer,data:{protocol:'tools-store-rpc-v1',channel:bridge.channel,type:'response',id:data.id,result:data.action==='session'?{ok:true,value:session}:{ok:false,error:{code:'lock_busy',message:'受付処理中',intakeTicket:'server-signed-arrival-proof'}}}}));
  }};peer.parent=peer;
  const doc={createElement:()=>frame={contentWindow:peer,remove(){}},body:{append(){}}};
  const bridge=new ToolsBridge('https://script.google.com/macros/s/EXAMPLE/exec',{win,doc,timeout:100});
  const connected=bridge.connect();listener({origin,source:peer,data:{protocol:'tools-store-rpc-v1',channel:bridge.channel,type:'ready'}});await connected;
  await assert.rejects(bridge.call('submit',{requestId:'a'.repeat(32)}),e=>e.code==='lock_busy'&&e.intakeTicket==='server-signed-arrival-proof');
  bridge.dispose();
});
