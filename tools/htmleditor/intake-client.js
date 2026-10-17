/* 新しい受付用の接続前候補。index.htmlからは読み込まない。自動送信しない。 */
(function(root,factory){
  if(typeof module==='object'&&module.exports)module.exports=factory();
  else root.HtmlIntakeClient=factory();
})(typeof window==='undefined'?globalThis:window,function(){
  'use strict';
  const canonical = value => value===null||typeof value!=='object'?JSON.stringify(value):Array.isArray(value)?'['+value.map(canonical).join(',')+']':'{'+Object.keys(value).sort().map(k=>JSON.stringify(k)+':'+canonical(value[k])).join(',')+'}';
  const clone=value=>JSON.parse(JSON.stringify(value));
  function yes(value,code){if(!value)throw Error(code);}
  function create({storage,locks,rpc,session,sha256,randomId}){
    async function context(){
      const s=await session();
      yes(s&&/^[a-f0-9]{64}$/.test(s.actorKey)&&/^[a-f0-9]{32}$/.test(s.generation),'session_required');
      return {...s,key:'joho.html-intake.pending.v1.'+s.actorKey+'.'+s.generation};
    }
    function read(s){
      const raw=storage.getItem(s.key);if(raw===null)return null;
      let record;try{record=JSON.parse(raw);}catch{throw Error('pending_corrupt');}
      yes(record.actorKey===s.actorKey&&record.generation===s.generation&&record.kind==='html-intake-pending-v1'&&/^[a-f0-9]{32}$/.test(record.input?.submissionId),'pending_corrupt');
      return record;
    }
    function write(s,record){const raw=canonical(record);storage.setItem(s.key,raw);yes(storage.getItem(s.key)===raw,'pending_unconfirmed');}
    function locked(s,fn){yes(locks&&typeof locks.request==='function','cross_tab_lock_required');return locks.request(s.key,{mode:'exclusive'},fn);}
    async function prepare({source,fileName,assessment,hintUsage=null}){
      const s=await context();
      return locked(s,async()=>{
        const previous=read(s);yes(!previous||previous.state==='accepted','pending_exists');
        const targetId=fileName?.replace(/\.html$/,'');yes(/^html\d{2}-\d{2}$/.test(targetId)&&fileName===targetId+'.html'&&typeof source==='string'&&source.length>0&&new TextEncoder().encode(source).length<=2097152,'source_invalid');
        const sourceSha256=await sha256(source);
        yes(targetId==='html11-01'?assessment===null:assessment?.kind==='html-local-result-v1'&&assessment.sourceSha256===sourceSha256&&assessment.targetId===targetId,'assessment_invalid');
        const input=clone({submissionId:randomId(),targetId,fileName,source,assessment,hintUsage});
        yes(/^[a-f0-9]{32}$/.test(input.submissionId),'id_invalid');
        const record={kind:'html-intake-pending-v1',actorKey:s.actorKey,generation:s.generation,state:'prepared',input,
          sourceSha256,payloadSha256:await sha256(canonical(input))};
        write(s,record);return {submissionId:input.submissionId,sourceSha256};
      });
    }
    async function send({userInitiated=false}={}){
      yes(userInitiated===true,'user_action_required');
      const s=await context();
      return locked(s,async()=>{
        const record=read(s);yes(record,'pending_missing');
        yes(await sha256(canonical(record.input))===record.payloadSha256&&await sha256(record.input.source)===record.sourceSha256,'pending_corrupt');
        if(record.state==='accepted')return clone(record.receipt);
        async function current(){const now=await context();yes(now.key===s.key&&now.actorKey===s.actorKey&&now.generation===s.generation,'account_changed');return now;}
        function accepted(value){
          yes(value&&value.state==='accepted'&&value.submissionId===record.input.submissionId&&value.sourceSha256===record.sourceSha256&&value.targetId===record.input.targetId&&Number.isSafeInteger(value.receivedAt),'receipt_mismatch');
          record.state='accepted';record.receipt=clone(value);write(s,record);return clone(value);
        }
        // 応答消失後は先に照会。同じ本文/ID以外を送らず、通信失敗を受付成功にしない。
        if(record.state==='uncertain'){
          const lookup=await rpc('lookup',{submissionId:record.input.submissionId},await current());
          if(lookup?.state==='accepted'){await current();return accepted(lookup);}
          yes(lookup&&['not-found','incomplete'].includes(lookup.state),'receipt_uncertain');
        }
        record.state='uncertain';write(s,record);
        const response=await rpc('submit',clone(record.input),await current());
        await current();return accepted(response);
      });
    }
    return Object.freeze({prepare,send,async pending(){const s=await context();return locked(s,()=>clone(read(s)));}});
  }
  return Object.freeze({create});
});
