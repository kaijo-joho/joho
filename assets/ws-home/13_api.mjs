export const loginUrl='https://script.google.com/a/macros/gfe.kaijo.ed.jp/s/AKfycbzypkAyvoQEHOEvtl3wSob3H6pcheKQQTWGygKP539w1NqNO8lsInO9aQ0uypx3QyVS/exec?home=1';
let frame,popup,peer,peerOrigin,channel,readyPromise,readyResolve,readyTimer;const pending=new Map();
export const isNativeGas=!!globalThis.google?.script?.run;
const googleOrigin=value=>{try{const u=new URL(value);return u.protocol==='https:'&&(u.hostname==='script.googleusercontent.com'||/^[a-z0-9-]+-script\.googleusercontent\.com$/.test(u.hostname));}catch{return false;}};
export async function config(){return {mode:'LIMITED_HOME_PILOT',productionAdaptersEnabled:true,loginUrl};}
export function resetConnection(){clearTimeout(readyTimer);frame?.remove();frame=peer=null;readyPromise=readyResolve=null;for(const p of pending.values()){clearTimeout(p.timer);p.reject(Error('NETWORK_RETRYABLE'));}pending.clear();}
export function openConnection(){resetConnection();channel=crypto.randomUUID();popup=window.open(loginUrl+'&channel='+channel+'&popup=1','ws-home-school-login');return popup;}
window.addEventListener('message',event=>{
  const v=event.data;if(!v||v.channel!==channel||!googleOrigin(event.origin))return;
  if(v.type==='WS_HOME_READY'&&(frame||popup)&&!peer){try{if(popup&&event.source.top!==popup)return;}catch{return;}peer=event.source;peerOrigin=event.origin;clearTimeout(readyTimer);readyResolve?.();frame?._ready?.();return;}
  if(v.type!=='WS_HOME_RESPONSE'||event.source!==peer||event.origin!==peerOrigin||typeof v.id!=='string')return;
  const entry=pending.get(v.id);if(!entry)return;clearTimeout(entry.timer);pending.delete(v.id);
  if(!v.result?.ok){const error=Error(v.result?.code||'HOME_UNAVAILABLE');error.status=error.message==='NOT_FOUND'?404:error.message==='HOME_FORBIDDEN'?403:400;entry.reject(error);}else entry.resolve(v.result.data||v.result);
});
async function ready(){
  if(peer)return;
  if(location.origin!=='https://joho.kaijo.ed.jp')throw Error('HOME_ORIGIN_REQUIRED');
  if(popup&&!popup.closed){if(!readyPromise)readyPromise=new Promise((resolve,reject)=>{readyResolve=resolve;readyTimer=setTimeout(()=>{readyPromise=null;reject(Error('AUTH_REQUIRED'));},30000);});return readyPromise;}
  if(!readyPromise){channel=crypto.randomUUID();readyPromise=new Promise((resolve,reject)=>{
    frame=document.createElement('iframe');frame.title='学校アカウントで提出';frame.hidden=true;frame.referrerPolicy='no-referrer';
    const timer=setTimeout(()=>{resetConnection();reject(Error('AUTH_REQUIRED'));},12000);
    frame._ready=()=>{clearTimeout(timer);resolve();};frame.src=loginUrl+'&channel='+encodeURIComponent(channel);document.body.append(frame);
  });}return readyPromise;
}
export async function api(path,body,pairing=null){
  if(pairing||path.startsWith('/api/pairs'))throw Error('PAIR_NOT_OPEN');
  if(!/^\/api\/(me|submissions(?:\/(?:by-request\/)?(?:home-)?[a-f0-9-]{36}(?:\/cancel)?)?)$/.test(path))throw Error('HOME_INVALID');
  if(isNativeGas)return new Promise((resolve,reject)=>google.script.run.withSuccessHandler(r=>{if(r?.ok)resolve(r.data||r);else {const e=Error(r?.code||'HOME_UNAVAILABLE');e.status=e.message==='NOT_FOUND'?404:e.message==='HOME_FORBIDDEN'?403:400;reject(e);}}).withFailureHandler(()=>reject(Error('NETWORK_RETRYABLE'))).worksheetHomeRpc(path,body));
  await ready();const id=crypto.randomUUID();return new Promise((resolve,reject)=>{
    const timer=setTimeout(()=>{pending.delete(id);reject(Error('NETWORK_RETRYABLE'));},60000);pending.set(id,{resolve,reject,timer});
    peer.postMessage({type:'WS_HOME_REQUEST',channel,id,path,body},peerOrigin);
  });
}
export async function blobBase64(blob){const bytes=new Uint8Array(await blob.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=16384)binary+=String.fromCharCode(...bytes.subarray(i,i+16384));return btoa(binary);}
export function messageFor(code){return {
  AUTH_REQUIRED:'学校アカウントでログインし、元の撮影画面で送信してください。画像は保持しています。',
  AUTH_CHANGED:'アカウントが変わりました。元の本人でログインし直してください。',
  HOME_FORBIDDEN:'現在、スマホ提出は指定された管理者・生徒デモアカウントだけに開放しています。',
  HOME_NOT_READY:'管理者による保存先の準備が必要です。画像は保持しています。',
  HOME_ROSTER_SCOPE:'対象の年度・学年・名簿情報を確認できません。',
  ACCOUNT_NOT_REGISTERED:'このアカウントの名簿情報を確認できません。',
  HOME_TASK_NOT_ELIGIBLE:'この用紙はログインした本人の提出対象として確認できません。',
  HOME_IMAGE_INVALID:'画像の形式・ハッシュを確認できません。補正して再試行してください。',
  HOME_OPERATION_CONFLICT:'同じ受付の画像が変更されています。画像を保持し、受付を確認してください。',
  HOME_PRIVATE_STORAGE:'非公開保存先を確認できません。管理者へお知らせください。',
  HOME_ORIGIN_REQUIRED:'学校教材サイトの撮影ページから開いてください。',
  HOME_LIMIT:'限定試験の受付上限に達しました。管理者へお知らせください。',
  HOME_FINALIZING:'最終登録を確認しています。受付結果を確認してから、必要なら取消をやり直してください。',
  PAIR_NOT_OPEN:'今回の限定公開はスマホでログインして送信する経路です。',
  DRAFT_CONFLICT:'別のタブで撮影内容が更新されました。必要な画像を保存してから、このページを再読み込みしてください。',
  NETWORK_RETRYABLE:'通信結果を確認できません。受付照会後に同じ提出を再試行できます。',
  BUSY:'受付が混み合っています。画像を保持して再試行してください。'
}[code]||'操作を完了できません。撮影画像を保持しています。接続と受付状態を確認してください。';}
