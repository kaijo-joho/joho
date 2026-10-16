import {newDraft, editedDraft, checkPages, randomId, stateLabel, timeLabel, hashBlob, parsePairingQr} from './10_model.mjs?v=20261015-5';
import {processImage, loadImage, detectMarkers, layouts} from './11_vision.mjs?v=20261016-1';
import {getDraft, saveDraft, probeStorage, deviceId} from './12_store.mjs';
import {api, config, blobBase64, messageFor, loginUrl, openConnection, isNativeGas} from './13_api.mjs?v=20261016-2';
const nextFrame = () => new Promise(resolve => requestAnimationFrame(resolve));
const reasonText = {
  WORKSHEET_MISMATCH:'表裏のWS識別QRが一致しません。', STUDENT_MARK_MISMATCH:'表裏の組・番号が一致しません。',
  BACK_OMR_REQUIRED:'裏面にも組・番号のマークが必要です。', QR_OMR_REVIEW:'画像のQRまたはマークを再確認できません。',
  STUDENT_MISMATCH:'画像の組・番号と、ログインした本人の名簿情報が一致しません。',
  IDENTITY_MISMATCH:'画像の組・番号と、ログインした本人の名簿情報が一致しません。',
  WORKSHEET_NOT_ELIGIBLE:'このWSはログインした本人の提出対象として確認できません。',
  INELIGIBLE_WORKSHEET:'このWSはログインした本人の提出対象として確認できません。',
  PAIR_EXPIRED:'接続の期限を過ぎました。', PAIR_SESSION_ENDED:'Macのログインまたは接続が終了しました。',
  IMAGE_QUALITY:'画像品質を再確認できません。'
};
function element(tag, text, className) {const e = document.createElement(tag); if (text) e.textContent = text; if (className) e.className = className; return e;}
const iconPaths = {
  image:'<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8" cy="8" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  refresh:'<path d="M20 3v6h-6M4 21v-6h6M19 9a7 7 0 0 0-12-4L4 8M5 15a7 7 0 0 0 12 4l3-3"/>',
  sparkle:'<path d="m12 3 2.3 6.7L21 12l-6.7 2.3L12 21l-2.3-6.7L3 12l6.7-2.3L12 3ZM20 2v4m-2-2h4"/>',
  rotate:'<path d="M20 3v6h-6M19 9a7 7 0 1 0 0 6"/>',
  scan:'<path d="M8 3H3v5m13-5h5v5m0 8v5h-5m-8 0H3v-5M8 8h8v8H8z"/>',
  download:'<path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5"/>',
  check:'<path d="m5 12 4 4L19 6"/>',
  close:'<path d="m6 6 12 12M6 18 18 6"/>',
  back:'<path d="M20 12H4m7-7-7 7 7 7"/>',
  laptop:'<path d="M4 4h16v12H4zM2 20h20l-2-4H4l-2 4"/>',
  phone:'<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 18h4"/>',
  login:'<path d="M14 4h6v16h-6M3 12h12m-5-5 5 5-5 5"/>',
  send:'<path d="m3 3 18 9-18 9 4-9-4-9Zm4 9h14"/>',
  history:'<path d="M3 4v6h6M4 10a8 8 0 1 1 0 6M12 7v5l3 2"/>',
  share:'<path d="M12 16V3m-5 5 5-5 5 5M5 13H3v8h18v-8h-2"/>'
};
function setIcon(node,name){
  if(!node)return;
  const old=node.querySelector(':scope > .ws-icon');if(old?.dataset.icon===name)return;
  const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');
  for(const [key,value] of Object.entries({class:'ws-icon',viewBox:'0 0 24 24',fill:'none',stroke:'currentColor','stroke-width':'1.8','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true',focusable:'false'}))svg.setAttribute(key,value);
  svg.dataset.icon=name;svg.innerHTML=iconPaths[name]||iconPaths.image;
  if(old)old.replaceWith(svg);else node.prepend(svg);
}
function imageError(code) {
  return {INPUT_TOO_LARGE:'写真は1枚32MiBまで取り込めます。これより大きい場合はJPEG形式で保存して選び直してください。',
    INPUT_TOO_MANY_PIXELS:'写真が大きすぎます。8000万画素以下の写真を選んでください。2400万・4800万画素の写真は自動で縮小して読み取れます。',
    INPUT_FORMAT_UNSUPPORTED:'JPEG・PNGに対応しています。HEIC等はJPEGへ変換してから選び直してください。',
    HEIC_BROWSER_UNSUPPORTED:'このブラウザーではHEIC写真を開けません。JPEG形式に変換してから選び直してください。元の写真は保存できます。',
    INVALID_CORNERS:'四隅の位置を確認できません。左上→右上→右下→左下の順に指定してください。',
    OUTPUT_TOO_LARGE:'補正画像が上限を超えました。原画像を保存して退避できます。'}[code] || '画像を読み取れません。画像を保存して退避するか、差し替えてください。';
}
export async function mountCapture(root, {mode = 'phone', owner = null, onSubmitted = () => {}} = {}) {
  const tabId = randomId(), key = 'ws-home-active-' + mode + '-' + (owner || 'anonymous');
  let draft = newDraft(owner), busy = false, conflict = false, storeOk = true, pairing = null, local = false, stopped = false, readingSlot = null, activeSlot = 'F', statusMessage = '';
  // Keep the old draft keys as photo positions; QR determines the actual side.
  const slots = ['F', 'B'], photoNumber = slot => slot === 'F' ? 1 : 2;
  const sources = {}, urls = {}, previewBlobs = {}, manuals = {}, manualPoints = {}, manualSuggestions = {}, cleanup = [];
  let stopPairCamera=()=>{},lastPairCheck=0,selectedRoute=null,pairView=null,pairBusy=false,pairMessage='',pollTimer,pollRunning=false,pendingPairClaim=null;
  let saveQueue=Promise.resolve();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('worksheet-home-drafts-v1') : null;
  root.innerHTML = '<section id="photo-step" class="card capture-step photo-picker" aria-labelledby="photo-picker-title"><h2 id="photo-picker-title">①写真を2枚追加</h2>' +
    '<p id="pair-connection" class="notice" role="status" hidden></p><div id="initial-photo" class="actions"><label id="capture-photo-label" class="button primary upload-label">写真<input id="capture-photo" type="file" accept="image/*" multiple hidden></label></div>' +
    '<div id="photo-tabs" class="photo-tabs" role="tablist" aria-label="表示する写真" hidden><button id="photo-tab-F" type="button" role="tab" aria-controls="photo-panel-F" aria-selected="true">写真1</button><button id="photo-tab-B" type="button" role="tab" aria-controls="photo-panel-B" aria-selected="false" tabindex="-1">写真2</button></div>' +
    '<div id="pages" hidden></div><p id="photo-progress" role="status"></p><p id="photo-error" class="notice warning" role="status" hidden></p><div id="read-warnings" role="status" hidden></div><p id="capture-message" class="muted" role="status"></p><p id="storage-message" class="notice warning" role="status" hidden></p></section>' +
    '<section id="review-step" class="card capture-step is-locked" aria-labelledby="review-title" aria-disabled="true"><h2 id="review-title">②読み取り結果を確認</h2><p id="review-hint" class="muted">①で表面と裏面を読み取ると確認できます。</p><div id="review-content" hidden><div id="checks" role="status"></div>' +
    '<label class="confirmation"><input id="confirmed" type="checkbox" disabled><span>表示された組・番号が自分のものであり、表裏の画像が自分のワークシートであることを確認しました。</span></label></div></section>' +
    '<section id="routes" class="card capture-step is-locked" aria-labelledby="routes-title" aria-disabled="true"><h2 id="routes-title">③提出方法を選ぶ</h2><p id="route-hint" class="muted">②で読み取り結果を確認すると選べます。</p><div id="route-content" hidden><div id="route-buttons" class="route-grid"></div><div id="route-selection" hidden><h3 id="selected-route-title"></h3><button id="change-route" type="button">提出方法を選び直す</button></div><div id="route-detail" tabindex="-1"></div>' +
    '<div id="receipt-card" class="receipt-status" tabindex="-1" hidden><h3>処理・受付状況</h3><p id="send-state" class="state" role="status">未送信</p><progress id="send-progress" aria-label="画像の送信・照合処理中" hidden></progress><p id="send-message" role="status"></p><div id="receipt"></div>' +
    '<div class="actions"><button id="lookup" hidden>受付結果を確認して再試行</button><button id="cancel-send" hidden>送信セッションを取り消す</button></div></div></div></section>' +
    '<details id="demo" class="card" hidden><summary>架空用紙で試す（ローカル試作のみ）</summary><label>試験画像のケース <select id="fixture-kind"></select></label><label>用紙 <select id="fixture-paper"><option value="b5">B5</option><option value="a4">A4</option></select></label><div class="actions"><button id="load-fixture">架空の表裏を読み込む</button></div><p>実際に画像内のQRとマークを読み取ります。実物の用紙や本人認証の試験とは区別します。</p></details>';
  const q = selector => root.querySelector(selector), message = value => {statusMessage=value;renderMessage();};
  function renderMessage(){
    const ready=!!draft.confirmed&&checkPages(draft.pages).ok;
    q('#capture-message').textContent=ready?'':statusMessage;
    q('#send-message').textContent=ready?statusMessage:'';
    q('#receipt-card').hidden=!ready||!(draft.requestId||draft.receipt||statusMessage);
  }
  function storageWarning(value) {q('#storage-message').textContent = value;q('#storage-message').hidden=false;}
  function reveal(node){requestAnimationFrame(()=>{if(!node.isConnected||node.hidden)return;node.focus({preventScroll:true});node.scrollIntoView({block:'start',behavior:'auto'});});}
  try {await probeStorage();}
  catch (e) {storeOk = false; storageWarning('端末内に画像を保持できません。この画面を開いたまま進めてください。');}
  try {
    const active = sessionStorage.getItem(key), saved = active && await getDraft(active);
    if (saved && saved.owner === owner) draft = saved;
  } catch (e) {storeOk = false; storageWarning('撮影内容を再表示できません。写真を選び直してください。');}
  try {
    pendingPairClaim=JSON.parse(sessionStorage.getItem('ws-home-pair-claim')||'null');
    const savedPair = JSON.parse(sessionStorage.getItem('ws-home-pair') || 'null');
    if (savedPair && savedPair.deviceId === deviceId() && /^[a-f0-9]{64}$/.test(savedPair.capability||'')) pairing = savedPair;
  } catch (e) {}
  async function persistSnapshot(snapshot) {
    if (conflict) throw Error('DRAFT_CONFLICT');
    try {
      sessionStorage.setItem(key, snapshot.id);
      if (storeOk) {
        const expected=snapshot.id===draft.id?draft.revision:snapshot.revision;
        const saved=await saveDraft(snapshot,expected);
        if(draft.id===snapshot.id)draft={...draft,revision:saved.revision,updatedAt:saved.updatedAt};
        if (channel) channel.postMessage({id:saved.id, revision:saved.revision, sender:tabId});
      }
    } catch (e) {
      if (e.message === 'DRAFT_CONFLICT') {conflict = true; message(messageFor(e.message)); render(); throw e;}
      storeOk = false; storageWarning('画像保持に失敗しました。画面を離れる前に画像を保存してください。撮影内容は現在の画面内に残っています。');
    }
  }
  function persist(){
    const snapshot=structuredClone(draft);
    const result=saveQueue.catch(()=>{}).then(()=>persistSnapshot(snapshot));
    saveQueue=result;return result;
  }
  if (channel) channel.onmessage = e => {
    if (e.data && e.data.id === draft.id && e.data.sender !== tabId && e.data.revision > draft.revision) {
      conflict = true; message(messageFor('DRAFT_CONFLICT')); render();
    }
  };
  function clearPreview(side) {if (urls[side]) URL.revokeObjectURL(urls[side]); delete urls[side];delete previewBlobs[side];}
  function drawSource(side) {
    const destination = q('[data-side="' + side + '"] .image-box canvas'), source = sources[side];
    if (!source) return;
    destination.width = source.width; destination.height = source.height;
    const ctx = destination.getContext('2d'); ctx.drawImage(source, 0, 0);
    const corners = draft.pages[side]?.options?.corners || [];
    for (const [i, p] of corners.entries()) {ctx.beginPath(); ctx.arc(p.x, p.y, Math.max(8, source.width / 100), 0, Math.PI * 2); ctx.strokeStyle = '#ea7a00'; ctx.lineWidth = Math.max(3, source.width / 400); ctx.stroke(); ctx.fillStyle = '#c45d00'; ctx.font = 'bold ' + Math.max(18, source.width / 45) + 'px sans-serif'; ctx.fillText(String(i + 1), p.x + 15, p.y + 10);}
    if(manuals[side]>=0&&manuals[side]<4&&manualPoints[side]){const p=manualPoints[side],r=source.width/60;ctx.strokeStyle='#d94d00';ctx.lineWidth=Math.max(2,source.width/500);ctx.strokeRect(p.x-r,p.y-r,r*2,r*2);}
  }
  function render() {
    root.setAttribute('aria-busy',String(busy));
    const check = checkPages(draft.pages);
    const pending=!!draft.requestId && !['ACCEPTED','RESUBMIT_REQUIRED','CANCELLED'].includes(draft.receipt?.state);
    const count=slots.filter(slot=>draft.pages[slot]?.originalBlob).length;
    const readingComplete=count===2&&!readingSlot&&slots.every(slot=>draft.pages[slot]?.reading&&!draft.pages[slot].reading.pending);
    const reviewReady=readingComplete&&check.ok;
    const routeReady=reviewReady&&!!draft.confirmed;
    q('#initial-photo').hidden=count>0;
    q('#photo-tabs').hidden=q('#pages').hidden=count===0;
    q('#photo-progress').textContent=readingSlot?'写真'+photoNumber(readingSlot)+'を自動補正・読取中…':count===0?'0/2枚':count===1?'1/2枚 · 写真'+photoNumber(slots.find(s=>!draft.pages[s]?.originalBlob))+'を開いて、もう1枚追加してください。':!readingComplete?'2/2枚 · 自動で読み取っています…':reviewReady?'2/2枚 · ②で組・番号を確認してください。':'2/2枚 · ①の警告を確認してください。';
    q('#read-warnings').replaceChildren();q('#read-warnings').hidden=!readingComplete||check.ok;
    if(readingComplete&&!check.ok)check.errors.forEach(e=>q('#read-warnings').append(element('p','写真'+photoNumber(e.side)+'：'+e.message,'notice warning')));
    q('#review-step').classList.toggle('is-locked',!reviewReady);q('#review-step').setAttribute('aria-disabled',String(!reviewReady));
    q('#review-content').hidden=!reviewReady;q('#review-hint').hidden=reviewReady;
    q('#review-hint').textContent=readingComplete?'①の警告を確認して、写真を撮り直すか調整してください。':count===2?'①で写真を読み取っています。完了までお待ちください。':'①で表面と裏面を読み取ると確認できます。';
    q('#routes').classList.toggle('is-locked',!routeReady);q('#routes').setAttribute('aria-disabled',String(!routeReady));
    q('#route-content').hidden=!routeReady;q('#route-hint').hidden=routeReady;
    if(!routeReady){stopPairCamera();q('#route-detail').replaceChildren();selectedRoute=null;pairView=null;}
    q('#route-buttons').hidden=!!selectedRoute;q('#route-selection').hidden=!selectedRoute;
    q('#selected-route-title').textContent={phone:'スマホでログインして送信',pair:'Macと接続して提出',save:'画像を保存',mac:'このMacから提出'}[selectedRoute]||'';
    q('#change-route').hidden=!!draft.requestId;q('#change-route').disabled=busy||conflict||pairBusy;
    q('#checks').replaceChildren();
    if (reviewReady) {
      const identity=element('p',check.classNumber+'組 '+String(check.number).padStart(2,'0')+'番','notice read-identity');identity.id='read-identity';
      q('#checks').append(element('p','読み取ったクラス・番号','muted'),identity,
        element('p','この組・番号はあなたのものですか？'),
        element('p', 'WS：' + check.qr.worksheetId + '（' + check.qr.year + '年度・' + check.qr.subject + '）','muted'));
      q('#checks').append(element('p', '提出対象かどうかと本人の名簿との照合は、ログイン／Mac接続後に行います。', 'muted'));
    }
    q('#confirmed').disabled = !reviewReady || busy || conflict || pending; q('#confirmed').checked = !!draft.confirmed && reviewReady;
    q('#send-state').textContent = draft.state==='RETRYABLE'?(draft.errorCode==='NETWORK_RETRYABLE'?'通信が途切れました・送信結果は未確認':'送信結果を確認してください'):stateLabel(draft.state);
    q('#send-state').className = 'state ' + draft.state;
    q('#lookup').hidden = !draft.requestId; q('#lookup').disabled = busy || conflict;
    q('#cancel-send').hidden = draft.receipt?.state==='ACCEPTED'||!draft.receipt&&!pairing;
    q('#cancel-send').disabled = busy;
    q('#send-progress').hidden=!busy&&!['RECEIVED','VERIFYING'].includes(draft.state);
    for (const side of ['F', 'B']) {
      const section = q('[data-side="' + side + '"]'), p = draft.pages[side], result = section.querySelector('.result');
      const detected=p?.reading?.qr?.side, title='写真'+photoNumber(side)+(detected==='F'?'（表面）':detected==='B'?'（裏面）':'');
      section.hidden=count===0||side!==activeSlot;
      section.querySelector('h3').textContent=title;
      section.querySelector('.photo-input-text').textContent=p?'撮り直す／選び直す':'写真（'+photoNumber(side)+'枚目）';
      setIcon(section.querySelector('.photo-actions .upload-label'),p?'refresh':'image');
      const tab=q('#photo-tab-'+side);tab.setAttribute('aria-selected',String(side===activeSlot));tab.tabIndex=side===activeSlot?0:-1;
      section.querySelector('.photo-save').hidden=!p;
      section.querySelector('.corner-editor').hidden=!(p&&manuals[side]>=0&&manuals[side]<4);
      section.querySelector('.image-box').hidden = !p || !sources[side];
      section.querySelector('.controls').hidden = !p || !sources[side] || !!p.reading?.pending;
      section.querySelector('.save-page').disabled = !p || busy;
      if (!p) {
        result.textContent = 'この写真はまだありません。';result.classList.remove('bad');
        const preview=section.querySelector('.corrected-preview');preview.hidden=true;preview.removeAttribute('src');clearPreview(side);
        section.querySelector('.header-detail').hidden=true;section.querySelector('.header-preview').width=0;section.querySelector('.image-box canvas').width=0;
        section.querySelector('.metrics').textContent='';continue;
      }
      const r = p.reading;
      section.querySelector('.auto-tone').checked=p.options?.autoTone!==false;
      section.querySelector('.brightness').value=p.options?.brightness||0;section.querySelector('.contrast').value=p.options?.contrast||0;
      result.textContent = r?.status === 'OK' ? (r.qr.side === 'F' ? '表面' : '裏面') + ' · ' + r.qr.worksheetId + ' · ' + r.classNumber + '組' + String(r.number).padStart(2,'0') + '番'
        : r?.message || '補正して再読取してください。';
      result.classList.toggle('bad', r?.status !== 'OK' && !r?.pending);
      const preview = section.querySelector('.corrected-preview');
      if (p.correctedBlob || p.originalBlob) {
        const blob=p.correctedBlob||p.originalBlob;
        if(previewBlobs[side]!==blob){clearPreview(side);urls[side]=URL.createObjectURL(blob);previewBlobs[side]=blob;}
        preview.alt=title+(p.correctedBlob?'の補正画像':'の読取前の写真');
        const header=section.querySelector('.header-preview');
        preview.onload=async()=>{
          if(stopped || draft.pages[side]!==p || !p.correctedBlob)return;
          const c=(await layouts()).find(c=>c.pageSize===r?.pageSize&&c.identity.side===r?.qr?.side);
          if(!c)return;
          const x=c.columns.middle.mm.x,y=Math.max(0,c.qr.region.mm.y-2),right=c.qr.region.mm.x+c.qr.region.mm.width+2,bottom=c.header.mm.y+c.header.mm.height+2;
          const sx=preview.naturalWidth/c.page.widthMm,sy=preview.naturalHeight/c.page.heightMm;
          header.width=Math.round((right-x)*sx);header.height=Math.round((bottom-y)*sy);
          header.getContext('2d').drawImage(preview,x*sx,y*sy,(right-x)*sx,(bottom-y)*sy,0,0,header.width,header.height);
        };
        if(preview.src!==urls[side])preview.src=urls[side];preview.hidden = false;section.querySelector('.header-detail').hidden=!p.correctedBlob;
      } else {preview.hidden = true;preview.removeAttribute('src');section.querySelector('.header-detail').hidden=true;clearPreview(side);}
      section.querySelector('.metrics').textContent = r?.elapsedMs ? (r.autoTone?'明るさ・影を自動補正。':'')+(r.restoredMarkers?'欠けた■を補正しました。':'')+(r.grayscaleExport?'保存サイズを抑えるため白黒にしました。':'') : '';
    }
    q('#receipt').replaceChildren();
    if (draft.receipt) {
      const r = draft.receipt;
      q('#receipt').append(element('p', '受付ID：' + r.receiptId), element('p', '受付時刻：' + timeLabel(r.receivedAt)),
        element('p', r.reason ? reasonText[r.reason] || '画像・本人照合を通過しませんでした。紙とログイン先を確認してください。' : r.state === 'ACCEPTED' ? '画像の再読取と本人照合を通過しました。' : '受信後の画像検証を待っています。'));
    }
    q('#route-buttons').querySelectorAll('button').forEach(b => {b.disabled = busy || conflict || !draft.confirmed;});
    q('#load-fixture').disabled=busy || pending;
    q('#pages').querySelectorAll('input[type=file],.apply,.rotate,.auto,.manual,input[type=range],.auto-tone').forEach(input=>{input.disabled=busy || conflict || pending;});
    q('#capture-photo').disabled=busy || conflict || pending;
    q('#pages').querySelectorAll('.corner-editor button').forEach(input=>{input.disabled=busy||conflict||pending;});
    for(const side of ['F','B'])if(draft.pages[side]&&manuals[side]>=0&&manuals[side]<4){const section=sectionFor(side);section.querySelector('.apply').disabled=true;section.querySelectorAll('input[type=range],.auto-tone').forEach(input=>{input.disabled=true;});section.querySelector('.corner-previous').disabled=busy||conflict||pending||manuals[side]===0;root.querySelectorAll('input[type=file]').forEach(input=>{input.disabled=true;});}
    root.querySelectorAll('.upload-label').forEach(label=>{const disabled=label.querySelector('input').disabled;label.setAttribute('aria-disabled',String(disabled));label.tabIndex=disabled?-1:0;});
    renderMessage();
    updatePairControls();
  }
  function photoError(value){q('#photo-error').textContent=value;q('#photo-error').hidden=!value;if(value)message(value);}
  async function readPendingPages() {
    for(const slot of slots){
      if(stopped || conflict)return;
      const p=draft.pages[slot];
      if(p?.reading?.pending)await readPage(slot,p.originalBlob,p.options || {});
    }
  }
  async function addPhotos(files, slot = null) {
    if(stopped || busy || conflict || draft.requestId && !['ACCEPTED','RESUBMIT_REQUIRED','CANCELLED'].includes(draft.receipt?.state))return;
    const selected=Array.from(files);if(!selected.length)return;
    if(selected.length>(slot?1:2)){photoError(slot?'差し替える写真を1枚選んでください。':'一度に選べる写真は2枚までです。写真を選び直してください。');return;}
    const targets=slot?[slot]:selected.length===2?slots:[slots.find(s=>!draft.pages[s]?.originalBlob)];
    if(!targets[0]){photoError('差し替える写真を開き、「撮り直す／選び直す」を押してください。');return;}
    photoError('');busy=true;draft=editedDraft(draft);activeSlot=targets[0];
    try{
      selected.forEach((file,i)=>{
        const target=targets[i];clearPreview(target);delete sources[target];manuals[target]=-1;
        draft.pages[target]={originalBlob:file,correctedBlob:null,reading:{status:'PENDING',pending:true,message:'自動補正・読取を待っています。'},options:{autoTone:true}};
        sectionFor(target).querySelector('.manual-help').textContent='';
      });
      render();await persist();
    }catch(e){message(messageFor(e.message));return;}
    finally{busy=false;render();}
    await readPendingPages();
  }
  async function readPage(side, file, options = {}) {
    if (stopped || busy || conflict || draft.requestId && !['ACCEPTED','RESUBMIT_REQUIRED','CANCELLED'].includes(draft.receipt?.state)) return;
    busy = true; readingSlot=side; draft = editedDraft(draft); message('写真'+photoNumber(side)+'を補正・読取しています…'); render(); sectionFor(side).querySelector('.result').textContent='自動補正・読取中…';await nextFrame();
    try {
      const result = await processImage(file, options);
      draft.pages[side] = {originalBlob:file, correctedBlob:result.correctedBlob || null, sha256:result.sha256 || null,
        reading:result.reading, options:{turns:options.turns || 0, brightness:options.brightness || 0, contrast:options.contrast || 0, autoTone:options.autoTone!==false,corners:result.corners,preciseCorners:!!options.preciseCorners}};
      sources[side] = result.source; manuals[side] = -1;sectionFor(side).querySelector('.manual-help').textContent='';
      await persist(); drawSource(side); message(checkPages(draft.pages).ok?'読み取った組・番号を②で確認してください。':'');
    } catch (e) {
      // Keep the selected file even on decode/read failure; it can be exported.
      draft.pages[side] = {originalBlob:file, correctedBlob:null, reading:{status:'REVIEW',message:imageError(e.message)}, options};
      delete sources[side];sectionFor(side).querySelector('.image-box canvas').width=0;
      await persist(); message(imageError(e.message));
    } finally {busy = false; readingSlot=null; render();}
  }
  function sectionFor(side){return q('[data-side="'+side+'"]');}
  async function download(side) {
    const p = draft.pages[side]; if (!p) return;
    const blob = p.correctedBlob || p.originalBlob, url = URL.createObjectURL(blob), a = element('a');
    const head=new Uint8Array(await blob.slice(0,4).arrayBuffer());
    const extension=head[0]===137&&head[1]===80?'.png':head[0]===255&&head[1]===216?'.jpg':blob.type==='image/heic'?'.heic':blob.type==='image/heif'?'.heif':'.original';
    a.href = url; a.download = 'worksheet-' + (p.reading?.qr?.side || 'photo-'+photoNumber(side)) + extension;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    message(p.correctedBlob ? '補正画像を保存しました。表裏ともMacへ転送してください。' : '読取前の画像を退避しました。提出前に再確認が必要です。');
  }
  for (const side of ['F', 'B']) {
    const section = element('section', '', 'page-card'); section.dataset.side = side;section.id='photo-panel-'+side;section.setAttribute('role','tabpanel');section.setAttribute('aria-labelledby','photo-tab-'+side);
    section.innerHTML = '<h3>写真'+photoNumber(side)+'</h3><div class="actions photo-actions"><label class="button primary upload-label"><span class="photo-input-text">写真（'+photoNumber(side)+'枚目）</span><input class="photo-input" type="file" accept="image/*" hidden></label></div>' +
      '<p class="result" role="status"></p><p class="metrics muted"></p><img class="corrected-preview" alt="読取前の写真" hidden><details class="header-detail" hidden><summary>QR・組番号を拡大して確認</summary><canvas class="header-preview" aria-label="QRとクラス・番号のマーク欄の拡大表示"></canvas></details>' +
      '<details class="controls" hidden><summary>調整する</summary><div class="adjustment-body"><p class="muted">自動補正で読めないときに調整します。撮り直す場合は「撮り直す／選び直す」を押してください。</p><div class="actions"><button class="auto">自動でやり直す</button><button class="rotate">90度回転</button><button class="manual">黒いマーカーを指定</button></div>' +
      '<div class="image-box" hidden><p class="muted">元の写真（枠・数字は保存画像に入りません）</p><canvas tabindex="0" aria-label="補正前画像。四隅指定中はクリックまたは矢印キーとEnterでマーカーを指定"></canvas></div>' +
      '<p class="manual-help" role="status"></p><div class="corner-editor" hidden><p>紙の角ではなく、黒い■の中心を指定します。全体画像をタップして位置を選び、拡大画像を動かして十字に合わせてください。</p><canvas class="corner-zoom" width="280" height="280" tabindex="0" aria-label="黒いマーカーの拡大表示。ドラッグ・矢印キーで微調整し、Enterで確定"></canvas><div class="corner-nudges"><button type="button" data-dx="0" data-dy="-1" aria-label="位置を上へ微調整">↑</button><button type="button" data-dx="-1" data-dy="0" aria-label="位置を左へ微調整">←</button><button type="button" data-dx="1" data-dy="0" aria-label="位置を右へ微調整">→</button><button type="button" data-dx="0" data-dy="1" aria-label="位置を下へ微調整">↓</button></div><div class="actions"><button class="corner-previous" type="button">前のマーカーへ</button><button class="corner-confirm primary" type="button">この位置を確定して次へ</button><button class="corner-cancel" type="button">手動指定をやめる</button></div></div>' +
      '<details class="tone-controls"><summary>明るさ・コントラストを調整</summary><label class="auto-tone-label"><input class="auto-tone" type="checkbox" checked>明るさ・影を自動補正</label><label>明るさ<input class="brightness" type="range" min="-50" max="70" value="0"></label><label>コントラスト<input class="contrast" type="range" min="-50" max="100" value="0"></label><button class="apply">調整を反映して再読取</button></details></div></details>' +
      '<div class="actions photo-save" hidden><button class="save-page" disabled>この写真を保存</button></div>';
    q('#pages').append(section);
    for(const [selector,name] of Object.entries({'.auto':'sparkle','.rotate':'rotate','.manual':'scan','.apply':'check','.save-page':'download','.corner-confirm':'check','.corner-previous':'back','.corner-cancel':'close'}))setIcon(section.querySelector(selector),name);
    for (const input of section.querySelectorAll('input[type=file]')) input.addEventListener('change', async () => {try{await addPhotos(input.files,side);}catch(e){message(messageFor(e.message));}finally{input.value='';}});
    section.querySelector('.save-page').addEventListener('click', () => download(side));
    section.querySelector('.auto-tone').addEventListener('change',()=>{const p=draft.pages[side];if(p){p.options.autoTone=section.querySelector('.auto-tone').checked;readPage(side,p.originalBlob,{...p.options,corners:p.options.preciseCorners?p.options.corners:null});}});
    section.querySelector('.corner-cancel').addEventListener('click',()=>{const p=draft.pages[side];if(p)readPage(side,p.originalBlob,{...p.options,corners:null,preciseCorners:false});});
    section.querySelector('.apply').addEventListener('click', () => {
      const p = draft.pages[side]; if (p) readPage(side,p.originalBlob,{...p.options,corners:p.options.preciseCorners?p.options.corners:null,autoTone:section.querySelector('.auto-tone').checked,brightness:Number(section.querySelector('.brightness').value),contrast:Number(section.querySelector('.contrast').value)});
    });
    section.querySelector('.rotate').addEventListener('click', () => {
      const p = draft.pages[side]; if (p) readPage(side,p.originalBlob,{...p.options,turns:((p.options.turns || 0) + 1) % 4,corners:null,preciseCorners:false});
    });
    section.querySelector('.auto').addEventListener('click', () => {
      const p = draft.pages[side]; if (p) readPage(side,p.originalBlob,{...p.options,corners:null,preciseCorners:false,autoTone:true,brightness:0,contrast:0});
    });
    const image = section.querySelector('.image-box canvas'),zoom=section.querySelector('.corner-zoom');
    const names=['左上','右上','右下','左下'];
    let zoomScale=3,drag=null;
    const active=()=>manuals[side]>=0&&manuals[side]<4;
    function showCorner(){
      if(!active()||!sources[side]||!manualPoints[side])return;
      const source=sources[side],p=manualPoints[side],ctx=zoom.getContext('2d');
      p.x=Math.max(0,Math.min(source.width-1,p.x));p.y=Math.max(0,Math.min(source.height-1,p.y));
      zoomScale=Math.max(2,Math.min(7,zoom.width/(source.width*.055)));
      const span=zoom.width/zoomScale;ctx.fillStyle='#fff';ctx.fillRect(0,0,zoom.width,zoom.height);ctx.imageSmoothingEnabled=false;
      ctx.drawImage(source,p.x-span/2,p.y-span/2,span,span,0,0,zoom.width,zoom.height);
      const mid=zoom.width/2;
      for(const [color,width] of [['white',5],['#c74900',2]]){ctx.strokeStyle=color;ctx.lineWidth=width;ctx.beginPath();ctx.moveTo(mid-24,mid);ctx.lineTo(mid-5,mid);ctx.moveTo(mid+5,mid);ctx.lineTo(mid+24,mid);ctx.moveTo(mid,mid-24);ctx.lineTo(mid,mid-5);ctx.moveTo(mid,mid+5);ctx.lineTo(mid,mid+24);ctx.stroke();}
      section.querySelector('.manual-help').textContent=(manuals[side]+1)+'/4 '+names[manuals[side]]+'の黒い■の中心を指定します。';
      section.querySelector('.corner-confirm').textContent=manuals[side]===3?'この位置で補正・再読取':'この位置を確定して次へ';
      setIcon(section.querySelector('.corner-confirm'),'check');
      section.querySelector('.corner-previous').disabled=manuals[side]===0;
      drawSource(side);
    }
    function setPosition(point){if(!active())return;manualPoints[side]=point;showCorner();}
    async function confirmCorner(){
      if(!active()||busy)return;
      const n=manuals[side];draft.pages[side].options.corners[n]={...manualPoints[side]};manuals[side]++;
      if(manuals[side]===4){
        const p=draft.pages[side];manuals[side]=-1;section.querySelector('.corner-editor').hidden=true;
        await readPage(side,p.originalBlob,{...p.options,preciseCorners:true});
      }else{manualPoints[side]={...manualSuggestions[side][n+1]};render();showCorner();zoom.focus({preventScroll:true});}
    }
    section.querySelector('.manual').addEventListener('click',()=>{
      if(!draft.pages[side]||!sources[side]||busy)return;
      const source=sources[side],previous=draft.pages[side].options.corners;
      const keepPrevious=previous?.length===4&&(draft.pages[side].options.preciseCorners||draft.pages[side].reading?.status==='OK');
      manualSuggestions[side]=(keepPrevious?previous:detectMarkers(source)||[{x:source.width*.05,y:source.height*.05},{x:source.width*.95,y:source.height*.05},{x:source.width*.95,y:source.height*.95},{x:source.width*.05,y:source.height*.95}]).map(p=>({...p}));
      draft=editedDraft(draft);manuals[side]=0;draft.pages[side].options.corners=[];
      draft.pages[side].reading={...draft.pages[side].reading,status:'REVIEW',message:'拡大表示で黒いマーカーの位置を確認してください。'};
      manualPoints[side]={...manualSuggestions[side][0]};render();showCorner();zoom.focus({preventScroll:true});zoom.scrollIntoView({block:'center',behavior:'smooth'});
    });
    image.addEventListener('click',e=>{
      if(!active())return;
      const r=image.getBoundingClientRect(),style=getComputedStyle(image),left=parseFloat(style.borderLeftWidth)||0,top=parseFloat(style.borderTopWidth)||0;
      const width=r.width-left-(parseFloat(style.borderRightWidth)||0),height=r.height-top-(parseFloat(style.borderBottomWidth)||0);
      setPosition({x:(e.clientX-r.left-left)*image.width/width,y:(e.clientY-r.top-top)*image.height/height});
    });
    function nudge(dx,dy){if(!active())return;const p=manualPoints[side];setPosition({x:p.x+dx,y:p.y+dy});}
    function handleKey(e){
      if(!active())return;
      if(e.key==='Enter'){e.preventDefault();confirmCorner();return;}
      const delta={ArrowLeft:[-1,0],ArrowRight:[1,0],ArrowUp:[0,-1],ArrowDown:[0,1]}[e.key];
      if(delta){e.preventDefault();const step=e.shiftKey?10:1;nudge(delta[0]*step,delta[1]*step);}
    }
    image.addEventListener('keydown',handleKey);zoom.addEventListener('keydown',handleKey);
    zoom.addEventListener('pointerdown',e=>{
      if(!active())return;e.preventDefault();zoom.setPointerCapture(e.pointerId);const r=zoom.getBoundingClientRect();
      drag={id:e.pointerId,x:e.clientX,y:e.clientY,point:{...manualPoints[side]},scale:zoomScale*r.width/zoom.width};
    });
    zoom.addEventListener('pointermove',e=>{if(drag?.id===e.pointerId){e.preventDefault();setPosition({x:drag.point.x-(e.clientX-drag.x)/drag.scale,y:drag.point.y-(e.clientY-drag.y)/drag.scale});}});
    zoom.addEventListener('pointerup',e=>{if(drag?.id!==e.pointerId)return;
      if(Math.hypot(e.clientX-drag.x,e.clientY-drag.y)<4){const r=zoom.getBoundingClientRect();setPosition({x:drag.point.x+(e.clientX-r.left-r.width/2)/drag.scale,y:drag.point.y+(e.clientY-r.top-r.height/2)/drag.scale});}
      drag=null;
    });
    zoom.addEventListener('pointercancel',()=>{drag=null;});
    section.querySelectorAll('[data-dx]').forEach(button=>button.addEventListener('click',()=>nudge(Number(button.dataset.dx),Number(button.dataset.dy))));
    section.querySelector('.corner-confirm').addEventListener('click',confirmCorner);
    section.querySelector('.corner-previous').addEventListener('click',()=>{if(!active()||manuals[side]===0)return;manuals[side]--;manualPoints[side]={...(draft.pages[side].options.corners[manuals[side]]||manualSuggestions[side][manuals[side]])};draft.pages[side].options.corners.length=manuals[side];showCorner();});
    section.querySelectorAll('input[type=range]').forEach(input => input.addEventListener('input', () => {draft.pages[side].options[input.className]=Number(input.value);draft.confirmed=false; draft.pages[side].reading={...draft.pages[side].reading,status:'REVIEW',message:'明るさ・コントラストを変更しました。「調整を反映して再読取」を押してください。'}; render();}));
  }
  function selectPhoto(slot,focus=false){activeSlot=slot;render();if(focus)q('#photo-tab-'+slot).focus();}
  for(const slot of slots){
    const tab=q('#photo-tab-'+slot);
    tab.addEventListener('click',()=>selectPhoto(slot));
    tab.addEventListener('keydown',event=>{
      const target=event.key==='Home'?'F':event.key==='End'?'B':['ArrowLeft','ArrowRight'].includes(event.key)?(slot==='F'?'B':'F'):null;
      if(target){event.preventDefault();selectPhoto(target,true);}
    });
  }
  q('#capture-photo').addEventListener('change',async event=>{
    const input=event.target;try{await addPhotos(input.files);}catch(e){message(messageFor(e.message));}finally{input.value='';}
  });
  for(const [id,name] of Object.entries({'capture-photo-label':'image','photo-tab-F':'image','photo-tab-B':'image',lookup:'refresh','cancel-send':'close','load-fixture':'scan'}))setIcon(q('#'+id),name);
  root.querySelectorAll('.upload-label').forEach(label=>{label.tabIndex=0;label.setAttribute('role','button');label.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();const input=label.querySelector('input');if(!input.disabled)input.click();}});});
  q('#confirmed').addEventListener('change', async () => {draft.confirmed=q('#confirmed').checked;message('');await persist();render();if(draft.confirmed&&pairing)chooseRoute('pair');});
  function frozenPayload(route) {
    const checked=checkPages(draft.pages);
    if(!checked.ok)throw Error('QR_OMR_REVIEW');
    return Promise.all(['F','B'].map(async side => {
      const p=checked.pages[side], r=p.reading;
      return {side,mime:'image/png',data:await blobBase64(p.correctedBlob),sha256:p.sha256 || await hashBlob(p.correctedBlob),
        clientReading:{qr:r.qr,classNumber:r.classNumber,number:r.number}};
    })).then(pages=>({requestId:draft.requestId,route,pages,confirmed:true}));
  }
  function receiptMessage(receipt){
    return receipt.state==='ACCEPTED'?'提出を受理しました。Mac側の一覧でも確認できます。':receipt.state==='RESUBMIT_REQUIRED'?'再提出が必要です。下の理由を確認してください。':receipt.state==='CANCELLED'?'提出は取り消されています。':'画像を受信しました。画像の再読取と本人照合を待っています。';
  }
  async function receiveReceipt(result){
    const receipt=result?.receipt||result;if(!receipt?.receiptId)throw Error('NETWORK_RETRYABLE');
    draft.receipt=receipt;draft.state=receipt.state;draft.errorCode=null;await persist();render();message(receiptMessage(receipt));onSubmitted(receipt);
  }
  async function recoverReceipt(){
    try{await receiveReceipt(await api('/api/submissions/by-request/'+draft.requestId,undefined,draft.route==='pair'?pairing:null));return true;}
    catch(e){if(e.status===404)return false;throw e;}
  }
  let automaticLookups=0,lastRecoveryCheck=0;
  async function submit(route) {
    if(busy||pairBusy||conflict||!draft.confirmed||!checkPages(draft.pages).ok)return;
    if(draft.requestId&&draft.route&&draft.route!==route){message('別の提出方法で送信を開始しています。先に受付結果を確認してください。');return;}
    busy=true;draft.route=draft.route||route;draft.requestId=draft.requestId||randomId();draft.state='SENDING';draft.errorCode=null;automaticLookups=0;render();
    message('接続と受付状況を確認しています…');reveal(q('#receipt-card'));await nextFrame();
    try {
      let authContext=null;
      if(route!=='pair'){
        const current=await api('/api/me');if(!current.authenticated)throw Error('AUTH_REQUIRED');
        const expectedOwner=owner||draft.submissionOwner;if(expectedOwner&&current.account.key!==expectedOwner)throw Error('AUTH_CHANGED');
        draft.submissionOwner=current.account.key;authContext={accountKey:current.account.key,sessionGeneration:current.sessionGeneration};
      }
      await persist();
      if(await recoverReceipt())return;
      message('提出画像を準備しています…');await nextFrame();
      const body=await frozenPayload(draft.route);if(authContext)body.expectedAuth=authContext;
      message('画像を送信しています。この画面を開いたままお待ちください。');await nextFrame();
      await receiveReceipt(await api('/api/submissions',body,route==='pair'?pairing:null));
    }catch(e){
      draft.state='RETRYABLE';draft.errorCode=e.message;await persist();render();message(messageFor(e.message));
      if(route==='pair'&&['NETWORK_RETRYABLE','BUSY'].includes(e.message)){
        message('送信の応答が途切れたため、同じ提出の受付結果を確認しています…');
        try{if(!await recoverReceipt())message('送信結果はまだ確認できません。画像は保持しています。「受付結果を確認して再試行」で同じ提出を確認できます。');}
        catch{message('受付結果を確認できませんでした。画像は保持しています。通信が戻ったら「受付結果を確認して再試行」を押してください。');}
      }
    }finally{busy=false;render();}
  }
  q('#lookup').addEventListener('click',async()=>{
    if(busy||pairBusy||conflict||!draft.requestId)return;
    let resend=false;busy=true;message('同じ提出の受付結果を確認しています…');render();reveal(q('#receipt-card'));
    try{resend=!await recoverReceipt();if(resend)message('受付はまだ確認できません。同じ提出番号で再試行します…');}
    catch(e){message(messageFor(e.message));}
    finally{busy=false;render();}
    if(resend)await submit(draft.route||(mode==='mac'?'mac':'phone'));
  });
  q('#cancel-send').addEventListener('click',async()=>{
    if(busy||pairBusy)return;busy=true;render();
    try {
      if(pairing){
        const cancelled=await api('/api/pairs/'+pairing.pairId+'/device-cancel',{},pairing);
        if(cancelled.receipt){draft.receipt=cancelled.receipt;draft.state=cancelled.receipt.state;}
        else{draft.requestId=null;draft.route=null;draft.state='UNSENT';}
      }else if(draft.receipt&&!['ACCEPTED','CANCELLED'].includes(draft.receipt.state)){
        draft.receipt=await api('/api/submissions/'+draft.receipt.receiptId+'/cancel',{},draft.route==='pair'?pairing:null);draft.state=draft.receipt.state;
      }
      pairing=null;pendingPairClaim=null;sessionStorage.removeItem('ws-home-pair');sessionStorage.removeItem('ws-home-pair-claim');selectedRoute=null;pairView=null;q('#route-detail').replaceChildren();updatePairBanner();await persist();message('接続・送信セッションを取り消しました。撮影内容は保持しています。');
    }catch(e){message(messageFor(e.message));}
    finally{busy=false;render();}
  });
  const routeHandlers=new Map();
  function chooseRoute(kind,focus=true){
    if(busy||(pairBusy&&kind!=='pair')||conflict||!draft.confirmed||!checkPages(draft.pages).ok)return;
    stopPairCamera();selectedRoute=kind;pairView=null;q('#route-detail').replaceChildren();message('');render();routeHandlers.get(kind)?.();
    if(focus)reveal(q('#route-detail'));
  }
  q('#change-route').addEventListener('click',()=>{
    if(busy||pairBusy||draft.requestId)return;
    stopPairCamera();const previous=selectedRoute;selectedRoute=null;pairView=null;q('#route-detail').replaceChildren();message('');render();
    q('#route-buttons [data-route="'+previous+'"]')?.focus();q('#route-buttons').scrollIntoView({block:'start'});
  });setIcon(q('#change-route'),'back');
  function addRoute(kind,label,description,handler,iconName='send') {
    routeHandlers.set(kind,handler);const b=element('button'),title=element('strong',label);b.dataset.route=kind;setIcon(title,iconName);b.append(title,element('span',description));b.addEventListener('click',()=>chooseRoute(kind));q('#route-buttons').append(b);
  }
  if(mode==='mac')addRoute('mac','このMacから提出','ログイン済みの本人と画像の組・番号を照合して受け付けます。',()=>submit('mac'),'laptop');
  else {
    addRoute('phone','スマホでログインして送信','撮影内容を保持したまま学校アカウントでログインします。',async()=>{
      if(isNativeGas){await submit('phone');return;}
      const detail=q('#route-detail');detail.replaceChildren(element('p','学校アカウントで接続を確認し、元の撮影タブへ戻って送信します。画像はこのタブに保持しています。'));
      const link=element('a','学校アカウントでログイン・接続確認','button');setIcon(link,'login');link.href=loginUrl;link.target='_blank';link.rel='noopener';detail.append(link);
      link.addEventListener('click',event=>{event.preventDefault();if(!openConnection())message('接続画面を開けません。ブラウザーのポップアップを確認してください。');});
      const send=element('button','ログイン完了後に送信');setIcon(send,'send');send.addEventListener('click',()=>submit('phone'));detail.append(send);
      const history=element('a','今回までの受付を確認','button');setIcon(history,'history');history.href=loginUrl;history.target='_blank';history.rel='noopener';detail.append(history);
    },'phone');
    addRoute('pair','Macと接続して提出','ログイン済みMacのQRを読み取ります。スマホのログインは不要です。',showPairControls,'laptop');
    addRoute('save','画像を保存','表裏を保存し、自分でMacへ転送して提出します。',()=>{
      const detail=q('#route-detail');detail.replaceChildren(element('p','表面と裏面をそれぞれ保存してください。保存だけでは提出されません。'));
      for(const side of ['F','B']){const b=element('button',side==='F'?'表面画像を保存':'裏面画像を保存');setIcon(b,'download');b.addEventListener('click',()=>{const checked=checkPages(draft.pages);if(checked.ok)download(slots.find(slot=>draft.pages[slot]===checked.pages[side]));});detail.append(b);}
      if(navigator.canShare){const share=element('button','表裏をまとめて共有');setIcon(share,'share');share.addEventListener('click',async()=>{
        const checked=checkPages(draft.pages);if(!checked.ok)return;
        const files=['F','B'].map(side=>new File([checked.pages[side].correctedBlob],'worksheet-'+side+'.png',{type:'image/png'}));
        if(!navigator.canShare({files})){message('このブラウザーは画像の一括共有に対応していません。各面を保存してください。');return;}
        try{await navigator.share({files});message('共有操作を完了しました。Macで提出するまで、提出は未送信です。');}catch(e){message('共有を中断しました。撮影画像は保持しています。');}
      });detail.append(share);}
    },'download');
  }
  function rememberPair(){try{sessionStorage.setItem('ws-home-pair',JSON.stringify(pairing));}catch{storageWarning('接続情報を保持できません。この画面を開いたまま進めてください。');}}
  function updatePairBanner(){
    const banner=q('#pair-connection');banner.hidden=!pairing||!!draft.confirmed&&checkPages(draft.pages).ok;
    if(pairing)banner.textContent=pairing.verificationCode?'Macとの確認コード '+pairing.verificationCode+'。写真の確認後、③で接続状態を確認できます。':'Macとの接続を確認しています。写真はそのまま追加できます。';
    updatePairControls();
  }
  function updatePairControls(){
    q('#lookup').disabled=busy||pairBusy||conflict;q('#cancel-send').disabled=busy||pairBusy;q('#change-route').disabled=busy||pairBusy||conflict;
    q('#route-buttons').querySelectorAll('button').forEach(button=>{button.disabled=busy||conflict||!draft.confirmed||(pairBusy&&button.dataset.route!=='pair');});
    if(!pairView?.panel.isConnected)return;
    const state=pairing?.status;
    pairView.intro.hidden=!!pairing;pairView.scan.hidden=!!pairing&&!['CONNECTING','EXPIRED','CANCELLED','INVALID'].includes(state);pairView.scan.disabled=pairBusy||busy;
    pairView.codeBox.hidden=!pairing?.verificationCode;pairView.code.textContent=pairing?.verificationCode||'';
    const labels={CONNECTING:'Macとの接続結果を確認しています…',AWAITING_APPROVAL:'Macにも同じコードが表示されていることを確認して、Macで承認してください。',APPROVED:'Macで承認されました。「画像を送信」を押してください。',SUBMITTING:'画像の受信結果を確認しています。',SUBMITTED:'この接続で画像を送信済みです。下の受付状況を確認してください。',EXPIRED:'接続の期限を過ぎました。Macで新しいQRを発行してください。',CANCELLED:'接続は取り消されました。',MAC_OFFLINE:'Macの接続画面を開いたまま、接続状態を確認してください。'};
    pairView.status.textContent=pairMessage||labels[state]||'MacのダッシュボードでQRを発行してください。';
    pairView.send.hidden=!pairing||!!draft.requestId;pairView.send.disabled=busy||pairBusy||conflict||state!=='APPROVED';
    pairView.refresh.hidden=!pairing;pairView.refresh.disabled=busy||pairBusy;
    pairView.disconnect.hidden=!pairing||!!draft.requestId;pairView.disconnect.disabled=busy||pairBusy;
    pairView.scan.textContent=pairing?'別のQRを読み取る':'MacのQRをカメラで読み取る';setIcon(pairView.scan,'scan');
  }
  function showPairControls(){
    if(pairView?.panel.isConnected){updatePairControls();return;}
    const detail=q('#route-detail'),panel=element('div','', 'pair-controls'),intro=element('p','Macのダッシュボードから「スマホ提出用QRを表示」を開き、QRを発行してください。'),scan=element('button','MacのQRをカメラで読み取る');
    scan.id='pair-scan';setIcon(scan,'scan');scan.addEventListener('click',startPairScan);
    const codeBox=element('div','', 'pair-code-box'),code=element('strong','','pair-verification-code');codeBox.tabIndex=-1;codeBox.setAttribute('aria-label','Macとスマホの確認コード');code.id='phone-pair-code';code.tabIndex=-1;
    codeBox.append(element('p','Macとスマホの確認コード'),code);const status=element('p');status.id='pair-status';status.setAttribute('role','status');
    const send=element('button','画像を送信','primary');send.id='pair-send';setIcon(send,'send');send.addEventListener('click',async()=>{if(await refreshPairStatus()&&pairing?.status==='APPROVED')await submit('pair');});
    const refresh=element('button','接続状態を確認');setIcon(refresh,'refresh');refresh.addEventListener('click',()=>refreshPairStatus());
    const disconnect=element('button','Macとの接続を取り消す');setIcon(disconnect,'close');disconnect.addEventListener('click',()=>q('#cancel-send').click());
    const actions=element('div','','actions');actions.append(send,refresh,disconnect);panel.append(intro,scan,codeBox,status,actions);detail.append(panel);pairView={panel,intro,scan,codeBox,code,status,send,refresh,disconnect};updatePairControls();
  }
  async function startPairScan(){
    if(pairBusy||busy)return;stopPairCamera();
    const dialog=element('dialog','','pair-camera-dialog'),title=element('h3','MacのQRを読み取る'),hint=element('p','Macに表示したQRをカメラに写してください。'),video=element('video'),stop=element('button','QRの読み取りを中止');title.id='pair-camera-title';dialog.setAttribute('aria-labelledby',title.id);hint.setAttribute('role','status');setIcon(stop,'close');
    video.autoplay=true;video.muted=true;video.playsInline=true;dialog.append(title,hint,video,stop);root.append(dialog);
    let stream,active=true,timer;
    stopPairCamera=()=>{if(!active)return;active=false;clearTimeout(timer);stream?.getTracks().forEach(t=>t.stop());video.srcObject=null;dialog.close();dialog.remove();};
    const cancel=()=>{stopPairCamera();pairView?.scan.focus({preventScroll:true});};stop.addEventListener('click',cancel);dialog.addEventListener('cancel',event=>{event.preventDefault();cancel();});dialog.showModal();
    try{
      if(!navigator.mediaDevices?.getUserMedia)throw Error('CAMERA_UNAVAILABLE');
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'},width:{ideal:1280}},audio:false});
      if(!active){stream.getTracks().forEach(t=>t.stop());return;}video.srcObject=stream;await video.play();
      const canvas=document.createElement('canvas'),ctx=canvas.getContext('2d',{willReadFrequently:true});
      const read=async()=>{
        if(!active)return;
        try{
          if(video.videoWidth){canvas.width=Math.min(1280,video.videoWidth);canvas.height=Math.round(video.videoHeight*canvas.width/video.videoWidth);ctx.drawImage(video,0,0,canvas.width,canvas.height);const pixels=ctx.getImageData(0,0,canvas.width,canvas.height),found=window.jsQR(pixels.data,pixels.width,pixels.height,{inversionAttempts:'attemptBoth'});
            if(found){let token;try{token=parsePairingQr(found.data,'https://joho.kaijo.ed.jp');}catch{hint.textContent='Macで発行したスマホ提出用QRを写してください。';}
              if(token){stopPairCamera();await claimPair(token);return;}
            }
          }
        }catch{hint.textContent='QRを確認できません。QR全体が明るく写るように合わせてください。';}
        if(active)timer=setTimeout(read,450);
      };read();
    }catch{stopPairCamera();pairMessage='カメラを利用できません。ブラウザーのカメラ使用を許可して、もう一度読み取ってください。写真は保持しています。';updatePairControls();reveal(q('#route-detail'));}
  }
  async function claimPair(qrToken){
    if(pairBusy)return;pairBusy=true;pairMessage='Macとの接続結果を確認しています…';
    const identity=deviceId(),same=pairing?.pairId===qrToken.slice(0,36),capability=same?pairing.capability:pendingPairClaim?.qrToken===qrToken?pendingPairClaim.capability:randomId().replaceAll('-','')+randomId().replaceAll('-','');
    pendingPairClaim={qrToken,capability};pairing={...(same?pairing:{}),pairId:qrToken.slice(0,36),deviceId:identity,capability,status:'CONNECTING'};
    try{sessionStorage.setItem('ws-home-pair-claim',JSON.stringify(pendingPairClaim));}catch{}rememberPair();updatePairBanner();
    if(draft.confirmed&&checkPages(draft.pages).ok&&selectedRoute!=='pair'){selectedRoute='pair';pairView=null;q('#route-detail').replaceChildren();render();showPairControls();}
    updatePairControls();reveal(q('#route-detail'));
    try{
      const result=await api('/api/pairs/claim',{qrToken,deviceId:identity,capability});
      pairing={...result,deviceId:identity,capability};rememberPair();pendingPairClaim=null;sessionStorage.removeItem('ws-home-pair-claim');pairMessage='';updatePairBanner();
      if(pairView?.codeBox.isConnected)reveal(pairView.codeBox);
    }catch(e){pairMessage=e.message==='NETWORK_RETRYABLE'?'Macへの接続結果がまだ確認できません。「接続状態を確認」で同じ接続を確認してください。':messageFor(e.message);pairing.status={PAIR_EXPIRED:'EXPIRED',PAIR_CANCELLED:'CANCELLED',PAIR_INVALID:'INVALID',PAIR_ALREADY_CLAIMED:'INVALID'}[e.message]||pairing.status;rememberPair();updatePairBanner();}
    finally{pairBusy=false;render();}
  }
  async function refreshPairStatus(){
    if(!pairing||pairBusy||busy)return false;
    if(pairing.status==='CONNECTING'&&pendingPairClaim){await claimPair(pendingPairClaim.qrToken);return pairing.status!=='CONNECTING';}
    pairBusy=true;pairMessage='接続状態を確認しています…';updatePairControls();
    try{const status=await api('/api/pairs/'+pairing.pairId+'/status',undefined,pairing);pairing={...pairing,...status};pairMessage='';rememberPair();updatePairBanner();return true;}
    catch(e){pairMessage=messageFor(e.message);pairing.status={PAIR_EXPIRED:'EXPIRED',PAIR_CANCELLED:'CANCELLED',PAIR_INVALID:'INVALID'}[e.message]||pairing.status;rememberPair();return false;}
    finally{pairBusy=false;updatePairControls();}
  }
  async function poll(){
    clearTimeout(pollTimer);if(stopped||pollRunning)return;pollRunning=true;
    try {
      const terminal=['ACCEPTED','RESUBMIT_REQUIRED','CANCELLED'].includes(draft.receipt?.state);
      if(!document.hidden&&!terminal){
        if(pairing&&pairing.status!=='CONNECTING'&&!busy&&!pairBusy&&Date.now()-lastPairCheck>5000){lastPairCheck=Date.now();await refreshPairStatus();}
        if(draft.receipt&&['RECEIVED','VERIFYING'].includes(draft.receipt.state)&&!busy&&!conflict){
          const previousId=draft.id,previousReceipt=draft.receipt.receiptId,result=await api('/api/submissions/'+draft.receipt.receiptId,undefined,draft.route==='pair'?pairing:null);
          if(draft.id===previousId&&draft.receipt?.receiptId===previousReceipt&&result.state!==draft.receipt.state)await receiveReceipt(result);
        }else if(draft.requestId&&!draft.receipt&&draft.state==='RETRYABLE'&&draft.route==='pair'&&!busy&&!pairBusy&&automaticLookups<3&&Date.now()-lastRecoveryCheck>10000){automaticLookups++;lastRecoveryCheck=Date.now();await recoverReceipt();}
      }
    }catch(e){if(e.status===401||e.status===403)message('受付結果の確認には再ログインまたは接続の確認が必要です。画像は保持しています。');}
    finally{pollRunning=false;if(!stopped)pollTimer=setTimeout(poll,2500);}
  }
  const resume=()=>{if(!document.hidden){lastPairCheck=0;poll();}};document.addEventListener('visibilitychange',resume);
  const leave=()=>stopPairCamera();window.addEventListener('pagehide',leave);
  cleanup.push(()=>{clearTimeout(pollTimer);document.removeEventListener('visibilitychange',resume);window.removeEventListener('pagehide',leave);});
  local=false;
  for(const side of ['F','B'])if(draft.pages[side]){try{sources[side]=await loadImage(draft.pages[side].originalBlob,draft.pages[side].options?.turns || 0);drawSource(side);}catch(e){if(!draft.pages[side].reading?.pending)draft.pages[side].reading={status:'REVIEW',message:'原画像を復元できません。保持された補正画像を保存して退避してください。'};}}
  activeSlot=slots.find(slot=>draft.pages[slot]?.originalBlob)||'F';
  render();updatePairBanner();await readPendingPages();if(draft.confirmed&&(draft.route||pairing))chooseRoute(draft.route||(pairing?'pair':null),false);
  if(pairing?.status==='CONNECTING')pairMessage='前回の接続結果を確認できていません。「接続状態を確認」を押してください。';updatePairControls();poll();
  return {claimPair,dispose(){stopped=true;stopPairCamera();cleanup.forEach(f=>f());channel?.close();for(const side of ['F','B'])clearPreview(side);}};
}
