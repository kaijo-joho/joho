import {newDraft, editedDraft, checkPages, randomId, stateLabel, timeLabel, hashBlob} from './10_model.mjs';
import {processImage, loadImage, detectMarkers, snapMarker, layouts} from './11_vision.mjs?v=20261015-3';
import {getDraft, listDrafts, saveDraft, discardDraft, probeStorage, deviceId} from './12_store.mjs';
import {api, config, blobBase64, messageFor, loginUrl, openConnection, isNativeGas} from './13_api.mjs';
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
function imageError(code) {
  return {INPUT_TOO_LARGE:'入力画像は1枚10MiBまでです。画像を小さくして選び直してください。',
    INPUT_TOO_MANY_PIXELS:'入力画像は2400万画素までです。',
    INPUT_FORMAT_UNSUPPORTED:'JPEG・PNGに対応しています。HEIC等はJPEGへ変換してから選び直してください。',
    HEIC_BROWSER_UNSUPPORTED:'このブラウザーではHEIC写真を開けません。JPEG形式に変換してから選び直してください。元の写真は保存できます。',
    INVALID_CORNERS:'四隅の位置を確認できません。左上→右上→右下→左下の順に指定してください。',
    OUTPUT_TOO_LARGE:'補正画像が上限を超えました。原画像を保存して退避できます。'}[code] || '画像を読み取れません。画像を保存して退避するか、差し替えてください。';
}
export async function mountCapture(root, {mode = 'phone', owner = null, onSubmitted = () => {}} = {}) {
  const tabId = randomId(), key = 'ws-home-active-' + mode + '-' + (owner || 'anonymous');
  let draft = newDraft(owner), busy = false, conflict = false, storeOk = true, pairing = null, local = false, stopped = false;
  const sources = {}, urls = {}, manuals = {}, manualPoints = {}, manualSuggestions = {}, cleanup = [];
  let saveQueue=Promise.resolve();
  const channel = typeof BroadcastChannel === 'function' ? new BroadcastChannel('worksheet-home-drafts-v1') : null;
  root.innerHTML = '<ol class="capture-steps" aria-label="提出の手順"><li>表と裏を撮る</li><li>読取結果を確認</li><li>提出方法を選ぶ</li></ol>' +
    '<details class="draft-tools"><summary>保存した撮影・下書きの管理</summary><p id="storage-message" class="muted" role="status">端末内の画像保持を確認しています…</p>' +
    '<div class="actions"><button id="resume">保存した撮影下書きを開く</button><button id="new-draft">新しい撮影を始める</button><button id="discard">この撮影内容を破棄</button></div>' +
    '<p class="muted">共用端末では終了時に撮影内容を破棄してください。ブラウザー終了やOSによる保存領域の削除後の復元は保証できません。</p></details>' +
    '<div id="pages" class="pages"></div><div class="actions"><button id="swap">表裏を入れ替える</button></div>' +
    '<section class="card"><h2>画像・QR・組番号の確認</h2><div id="checks" role="status"></div>' +
    '<label class="confirmation"><input id="confirmed" type="checkbox" disabled><span>表裏の画像が自分のワークシートであり、表示された組・番号が正しいことを確認しました。</span></label></section>' +
    '<section id="routes" class="card" hidden><h2>提出方法を選ぶ</h2><div id="route-buttons" class="route-grid"></div><div id="route-detail"></div></section>' +
    '<section id="receipt-card" class="card"><h2>処理・受付状況</h2><p id="send-state" class="state">未送信</p><p id="send-message" role="status"></p><div id="receipt"></div>' +
    '<div class="actions"><button id="lookup" hidden>受付結果を確認して再試行</button><button id="cancel-send" hidden>送信セッションを取り消す</button></div></section>' +
    '<details id="demo" class="card" hidden><summary>架空用紙で試す（ローカル試作のみ）</summary><label>試験画像のケース <select id="fixture-kind"></select></label><label>用紙 <select id="fixture-paper"><option value="b5">B5</option><option value="a4">A4</option></select></label><div class="actions"><button id="load-fixture">架空の表裏を読み込む</button></div><p>実際に画像内のQRとマークを読み取ります。実物の用紙や本人認証の試験とは区別します。</p></details>';
  const q = selector => root.querySelector(selector), message = value => {q('#send-message').textContent = value;};
  function storageWarning(value) {q('.draft-tools').open=true;q('#storage-message').textContent = value; q('#storage-message').classList.add('notice','warning');}
  try {await probeStorage(); q('#storage-message').textContent = '撮影内容をこのブラウザー内に保持できます。念のため画像保存も利用してください。';}
  catch (e) {storeOk = false; storageWarning('端末内に画像を保存できません。画面を離れる前に「画像を保存」で退避してください。');}
  try {
    const active = sessionStorage.getItem(key), saved = active && await getDraft(active);
    if (saved && saved.owner === owner) draft = saved;
  } catch (e) {storeOk = false; storageWarning('保存した下書きを復元できません。新しい撮影内容は画像保存で退避してください。');}
  try {
    const savedPair = JSON.parse(sessionStorage.getItem('ws-home-pair') || 'null');
    if (savedPair && savedPair.deviceId === deviceId()) pairing = savedPair;
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
  function clearPreview(side) {if (urls[side]) URL.revokeObjectURL(urls[side]); delete urls[side];}
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
    q('#checks').replaceChildren();
    if (check.ok) {
      q('#checks').append(element('p', 'WS：' + check.qr.worksheetId + '（' + check.qr.year + '年度・' + check.qr.subject + '）'),
        element('p', '表裏一致：' + check.classNumber + '組 ' + String(check.number).padStart(2, '0') + '番', 'notice'));
      q('#checks').append(element('p', '提出対象かどうかと本人の名簿との照合は、ログイン／Mac接続後に行います。', 'muted'));
    } else check.errors.forEach(e => q('#checks').append(element('p', (e.side === 'F' ? '表面：' : '裏面：') + e.message, 'notice warning')));
    q('#confirmed').disabled = !check.ok || busy || conflict; q('#confirmed').checked = !!draft.confirmed && check.ok;
    q('#routes').hidden = !check.ok || !draft.confirmed; q('#send-state').textContent = stateLabel(draft.state);
    q('#send-state').className = 'state ' + draft.state;
    q('#lookup').hidden = !draft.requestId; q('#lookup').disabled = busy || conflict;
    q('#cancel-send').hidden = !draft.receipt && !pairing;
    q('#cancel-send').disabled = busy;
    for (const side of ['F', 'B']) {
      const section = q('[data-side="' + side + '"]'), p = draft.pages[side], result = section.querySelector('.result');
      section.querySelector('.corner-editor').hidden=!(p&&manuals[side]>=0&&manuals[side]<4);
      section.querySelector('.image-box').hidden = !p || !sources[side];
      section.querySelector('.controls').hidden = !p || !sources[side];
      section.querySelector('.save-page').disabled = !p || busy;
      if (!p) {
        result.textContent = '画像を選んでください。';
        const preview=section.querySelector('.corrected-preview');preview.hidden=true;preview.removeAttribute('src');clearPreview(side);
        section.querySelector('.header-detail').hidden=true;section.querySelector('.header-preview').width=0;section.querySelector('.image-box canvas').width=0;
        section.querySelector('.metrics').textContent='';continue;
      }
      const r = p.reading;
      section.querySelector('.auto-tone').checked=p.options?.autoTone!==false;
      section.querySelector('.brightness').value=p.options?.brightness||0;section.querySelector('.contrast').value=p.options?.contrast||0;
      result.textContent = r?.status === 'OK' ? (r.qr.side === 'F' ? '表面' : '裏面') + ' · ' + r.qr.worksheetId + ' · ' + r.classNumber + '組' + String(r.number).padStart(2,'0') + '番'
        : r?.message || '補正して再読取してください。';
      result.classList.toggle('bad', r?.status !== 'OK' || r?.qr?.side !== side);
      const preview = section.querySelector('.corrected-preview');
      if (p.correctedBlob) {
        clearPreview(side); urls[side] = URL.createObjectURL(p.correctedBlob);
        const header=section.querySelector('.header-preview');
        preview.onload=async()=>{
          if(stopped || draft.pages[side]!==p)return;
          const c=(await layouts()).find(c=>c.pageSize===r?.pageSize&&c.identity.side===r?.qr?.side);
          if(!c)return;
          const x=c.columns.middle.mm.x,y=Math.max(0,c.qr.region.mm.y-2),right=c.qr.region.mm.x+c.qr.region.mm.width+2,bottom=c.header.mm.y+c.header.mm.height+2;
          const sx=preview.naturalWidth/c.page.widthMm,sy=preview.naturalHeight/c.page.heightMm;
          header.width=Math.round((right-x)*sx);header.height=Math.round((bottom-y)*sy);
          header.getContext('2d').drawImage(preview,x*sx,y*sy,(right-x)*sx,(bottom-y)*sy,0,0,header.width,header.height);
        };
        preview.src = urls[side]; preview.hidden = false;section.querySelector('.header-detail').hidden=false;
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
    for(const id of ['new-draft','swap','load-fixture'])q('#'+id).disabled=busy || pending;
    q('#discard').disabled=busy;
    q('#pages').querySelectorAll('input[type=file],.apply,.rotate,.auto,.manual,input[type=range],.auto-tone').forEach(input=>{input.disabled=busy || conflict || pending;});
    q('#pages').querySelectorAll('.corner-editor button').forEach(input=>{input.disabled=busy||conflict||pending;});
    for(const side of ['F','B'])if(manuals[side]>=0&&manuals[side]<4){const section=sectionFor(side);section.querySelector('.apply').disabled=true;section.querySelectorAll('input[type=range],.auto-tone').forEach(input=>{input.disabled=true;});section.querySelector('.corner-previous').disabled=busy||conflict||pending||manuals[side]===0;q('#swap').disabled=true;}
  }
  async function readPage(side, file, options = {}) {
    if (busy || conflict || draft.requestId && !['ACCEPTED','RESUBMIT_REQUIRED','CANCELLED'].includes(draft.receipt?.state)) return;
    busy = true; draft = editedDraft(draft); message('画像を補正・読取しています…'); render(); sectionFor(side).querySelector('.result').textContent='自動補正・読取中…';await nextFrame();
    try {
      const result = await processImage(file, options);
      draft.pages[side] = {originalBlob:file, correctedBlob:result.correctedBlob || null, sha256:result.sha256 || null,
        reading:result.reading, options:{turns:options.turns || 0, brightness:options.brightness || 0, contrast:options.contrast || 0, autoTone:options.autoTone!==false,corners:result.corners,preciseCorners:!!options.preciseCorners}};
      sources[side] = result.source; manuals[side] = -1;sectionFor(side).querySelector('.manual-help').textContent='';
      await persist(); drawSource(side); message('表裏の画像と読取結果を確認してください。');
    } catch (e) {
      // Keep the selected file even on decode/read failure; it can be exported.
      draft.pages[side] = {originalBlob:file, correctedBlob:null, reading:{status:'REVIEW',message:imageError(e.message)}, options};
      delete sources[side];sectionFor(side).querySelector('.image-box canvas').width=0;
      await persist(); message(imageError(e.message));
    } finally {busy = false; render();}
  }
  function sectionFor(side){return q('[data-side="'+side+'"]');}
  async function download(side) {
    const p = draft.pages[side]; if (!p) return;
    const blob = p.correctedBlob || p.originalBlob, url = URL.createObjectURL(blob), a = element('a');
    const head=new Uint8Array(await blob.slice(0,4).arrayBuffer());
    const extension=head[0]===137&&head[1]===80?'.png':head[0]===255&&head[1]===216?'.jpg':blob.type==='image/heic'?'.heic':blob.type==='image/heif'?'.heif':'.original';
    a.href = url; a.download = 'worksheet-' + side + extension;
    document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(url), 30000);
    message(p.correctedBlob ? '補正画像を保存しました。表裏ともMacへ転送してください。' : '読取前の画像を退避しました。提出前に再確認が必要です。');
  }
  for (const side of ['F', 'B']) {
    const section = element('section', '', 'card page-card'); section.dataset.side = side;
    section.innerHTML = '<h2>' + (side === 'F' ? '表面' : '裏面') + '</h2><p class="muted">用紙全体を大きく写してください。傾き・明るさは自動で補正します。</p><div class="actions photo-actions"><label class="button primary upload-label">カメラで撮影<input class="camera-input" type="file" accept="image/*" capture="environment" hidden></label><label class="button upload-label">写真を選ぶ<input class="album-input" type="file" accept="image/*" hidden></label></div>' +
      '<p class="result" role="status"></p><p class="metrics muted"></p><img class="corrected-preview" alt="' + (side === 'F' ? '表面' : '裏面') + 'の補正画像" hidden><details class="header-detail" hidden><summary>QR・組番号を拡大して確認</summary><canvas class="header-preview" aria-label="QRとクラス・番号のマーク欄の拡大表示"></canvas></details>' +
      '<details class="controls" hidden><summary>調整する</summary><div class="adjustment-body"><p class="muted">自動補正で読めないときに調整します。撮り直す場合は上の「カメラで撮影」を押してください。</p><div class="actions"><button class="auto">自動でやり直す</button><button class="rotate">90度回転</button><button class="manual">黒いマーカーを指定</button></div>' +
      '<div class="image-box" hidden><p class="muted">元の写真（枠・数字は保存画像に入りません）</p><canvas tabindex="0" aria-label="補正前画像。四隅指定中はクリックまたは矢印キーとEnterでマーカーを指定"></canvas></div>' +
      '<p class="manual-help" role="status"></p><div class="corner-editor" hidden><p>紙の角ではなく、黒い■の中心を指定します。全体画像をタップして位置を選び、拡大画像を動かして十字に合わせてください。</p><canvas class="corner-zoom" width="280" height="280" tabindex="0" aria-label="黒いマーカーの拡大表示。ドラッグ・矢印キーで微調整し、Enterで確定"></canvas><div class="corner-nudges"><button type="button" data-dx="0" data-dy="-1" aria-label="位置を上へ微調整">↑</button><button type="button" data-dx="-1" data-dy="0" aria-label="位置を左へ微調整">←</button><button type="button" data-dx="1" data-dy="0" aria-label="位置を右へ微調整">→</button><button type="button" data-dx="0" data-dy="1" aria-label="位置を下へ微調整">↓</button></div><div class="actions"><button class="corner-previous" type="button">前のマーカーへ</button><button class="corner-confirm primary" type="button">この位置を確定して次へ</button><button class="corner-cancel" type="button">手動指定をやめる</button></div></div>' +
      '<details class="tone-controls"><summary>明るさ・コントラストを調整</summary><label class="auto-tone-label"><input class="auto-tone" type="checkbox" checked>明るさ・影を自動補正</label><label>明るさ<input class="brightness" type="range" min="-50" max="70" value="0"></label><label>コントラスト<input class="contrast" type="range" min="-50" max="100" value="0"></label><button class="apply">調整を反映して再読取</button></details></div></details>' +
      '<div class="actions"><button class="save-page" disabled>この面の画像を保存</button></div>';
    q('#pages').append(section);
    for (const input of section.querySelectorAll('input[type=file]')) input.addEventListener('change', async () => {if (input.files[0]) await readPage(side, input.files[0]); input.value = '';});
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
      section.querySelector('.corner-previous').disabled=manuals[side]===0;
      drawSource(side);
    }
    function setPosition(point,snap=false){if(!active())return;manualPoints[side]=snap?snapMarker(sources[side],point):point;showCorner();}
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
      manualSuggestions[side]=(previous?.length===4?previous:detectMarkers(source)||[{x:source.width*.05,y:source.height*.05},{x:source.width*.95,y:source.height*.05},{x:source.width*.95,y:source.height*.95},{x:source.width*.05,y:source.height*.95}]).map(p=>({...p}));
      draft=editedDraft(draft);manuals[side]=0;draft.pages[side].options.corners=[];
      draft.pages[side].reading={...draft.pages[side].reading,status:'REVIEW',message:'拡大表示で黒いマーカーの位置を確認してください。'};
      manualPoints[side]={...manualSuggestions[side][0]};render();showCorner();zoom.focus({preventScroll:true});zoom.scrollIntoView({block:'center',behavior:'smooth'});
    });
    image.addEventListener('click',e=>{if(!active())return;const r=image.getBoundingClientRect();setPosition({x:(e.clientX-r.left)*image.width/r.width,y:(e.clientY-r.top)*image.height/r.height},true);});
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
    section.querySelectorAll('.upload-label').forEach(label=>{label.tabIndex=0;label.setAttribute('role','button');label.addEventListener('keydown',event=>{if(['Enter',' '].includes(event.key)){event.preventDefault();const input=label.querySelector('input');if(!input.disabled)input.click();}});});
  }
  q('#confirmed').addEventListener('change', async () => {draft.confirmed=q('#confirmed').checked; await persist(); render();});
  q('#swap').addEventListener('click', async () => {
    if (busy) return; [draft.pages.F,draft.pages.B]=[draft.pages.B,draft.pages.F]; [sources.F,sources.B]=[sources.B,sources.F]; draft=editedDraft(draft);
    for (const side of ['F','B']) {if (!draft.pages[side]) delete draft.pages[side]; drawSource(side);}
    await persist(); render();
  });
  async function restore(id) {
    const saved = await getDraft(id); if (!saved || saved.owner !== owner) throw Error('STORAGE_READ_FAILED');
    draft=saved; conflict=false; sessionStorage.setItem(key,id);
    for(const side of ['F','B']) if(draft.pages[side]) {sources[side]=await loadImage(draft.pages[side].originalBlob,draft.pages[side].options.turns || 0); drawSource(side);}
    render(); message('撮影下書きを復元しました。画像と読取結果をもう一度確認してください。');
  }
  q('#resume').addEventListener('click', async () => {
    try {
      const drafts=await listDrafts(owner), detail=q('#route-detail'); detail.replaceChildren(); q('#routes').hidden=false;
      if(!drafts.length) {message('保存した撮影下書きはありません。');return;}
      detail.append(element('p','開く下書きを選んでください。'));
      for(const d of drafts) {const b=element('button',timeLabel(d.updatedAt)+' · '+Object.keys(d.pages).length+'面'); b.addEventListener('click',()=>restore(d.id).catch(e=>message(imageError(e.message)))); detail.append(b);}
    } catch(e) {storageWarning('下書きを取得できません。現在表示中の画像を保存して退避してください。');}
  });
  q('#new-draft').addEventListener('click', async () => {
    if(busy)return; draft=newDraft(owner); conflict=false; for(const side of ['F','B']){delete sources[side];clearPreview(side);} await persist(); render(); message('新しい撮影を開始しました。以前の下書きは「保存した撮影下書き」から開けます。');
  });
  q('#discard').addEventListener('click', async () => {
    if(!confirm('このブラウザーの今回の撮影下書きを破棄します。送信済みの提出記録は履歴に残ります。'))return;
    try {await saveQueue.catch(()=>{});await discardDraft(draft.id);draft=newDraft(owner);conflict=false;sessionStorage.removeItem(key);for(const side of ['F','B']){delete sources[side];clearPreview(side);} render();message('この撮影内容を破棄しました。送信済みの受付はログイン端末の履歴から確認できます。');}
    catch(e){storageWarning('保存領域からの破棄を完了できませんでした。ブラウザーのサイトデータ削除を確認してください。');}
  });
  function frozenPayload(route) {
    return Promise.all(['F','B'].map(async side => {
      const p=draft.pages[side], r=p.reading;
      return {side,mime:'image/png',data:await blobBase64(p.correctedBlob),sha256:p.sha256 || await hashBlob(p.correctedBlob),
        clientReading:{qr:r.qr,classNumber:r.classNumber,number:r.number}};
    })).then(pages=>({requestId:draft.requestId,route,pages,confirmed:true}));
  }
  async function submit(route) {
    if(busy || conflict || !draft.confirmed || !checkPages(draft.pages).ok)return;
    busy=true;draft.route=draft.route || route;draft.requestId=draft.requestId || randomId();draft.state='SENDING';render();
    try {
      let authContext=null;
      if(route!=='pair'){
        const current=await api('/api/me');
        if(!current.authenticated)throw Error('AUTH_REQUIRED');
        const expectedOwner=owner || draft.submissionOwner;
        if(expectedOwner && current.account.key!==expectedOwner)throw Error('AUTH_CHANGED');
        draft.submissionOwner=current.account.key;
        authContext={accountKey:current.account.key,sessionGeneration:current.sessionGeneration};
      }
      await persist(); message('同じ提出の受付結果を先に確認しています…');
      let existing=null;
      try {existing=await api('/api/submissions/by-request/'+draft.requestId,undefined,route==='pair'?pairing:null);}
      catch(e){if(e.status!==404)throw e;}
      const body=await frozenPayload(draft.route);
      if(authContext)body.expectedAuth=authContext;
      const result=existing || await api('/api/submissions',body,route==='pair'?pairing:null);
      draft.receipt=result.receipt || result;draft.state=draft.receipt.state;await persist();render();
      message('画像を受信しました。画像の再読取と本人照合の結果を確認します。');onSubmitted(draft.receipt);
    }catch(e){draft.state='RETRYABLE';await persist();message(messageFor(e.message));}
    finally{busy=false;render();}
  }
  q('#lookup').addEventListener('click',async()=>{
    if(busy || conflict || !draft.requestId)return;
    try{
      const result=await api('/api/submissions/by-request/'+draft.requestId,undefined,draft.route==='pair'?pairing:null);
      draft.receipt=result;draft.state=result.state;await persist();render();onSubmitted(result);
      message('既存の受付結果を確認しました。');
    }catch(error){
      if(error.status===404)await submit(draft.route || (mode==='mac'?'mac':'phone'));
      else message(messageFor(error.message));
    }
  });
  q('#cancel-send').addEventListener('click',async()=>{
    try {
      if(pairing){
        await api('/api/pairs/'+pairing.pairId+'/device-cancel',{},pairing);
        if(draft.receipt && draft.receipt.state!=='ACCEPTED'){draft.receipt={...draft.receipt,state:'CANCELLED'};draft.state='CANCELLED';}
        message('接続・送信セッションを取り消しました。撮影内容は保持しています。');
      } else if(draft.receipt && !['ACCEPTED','CANCELLED'].includes(draft.receipt.state)) {
        draft.receipt=await api('/api/submissions/'+draft.receipt.receiptId+'/cancel',{},draft.route==='pair'?pairing:null);draft.state=draft.receipt.state;
      }
      pairing=null;sessionStorage.removeItem('ws-home-pair');await persist();render();
    }catch(e){message(messageFor(e.message));}
  });
  function addRoute(label,description,handler) {
    const b=element('button');b.append(element('strong',label),element('span',description));b.addEventListener('click',handler);q('#route-buttons').append(b);
  }
  if(mode==='mac') addRoute('このMacから提出','ログイン済みの本人と画像の組・番号を照合して受け付けます。',()=>submit('mac'));
  else {
    addRoute('スマホでログインして送信','撮影内容を保持したまま学校アカウントでログインします。',async()=>{
      if(isNativeGas){await submit('phone');return;}
      const detail=q('#route-detail');detail.replaceChildren(element('p','学校アカウントで接続を確認し、元の撮影タブへ戻って送信します。画像はこのタブに保持しています。'));
      const link=element('a','学校アカウントでログイン・接続確認','button');link.href=loginUrl;link.target='_blank';link.rel='noopener';detail.append(link);
      link.addEventListener('click',event=>{event.preventDefault();if(!openConnection())message('接続画面を開けません。ブラウザーのポップアップを確認するか、接続確認リンクから保存画像を提出してください。');});
      const send=element('button','ログイン完了後に送信');send.addEventListener('click',()=>submit('phone'));detail.append(send);
      const history=element('a','今回までの受付を確認','button');history.href=loginUrl;history.target='_blank';history.rel='noopener';detail.append(history);
    });
    addRoute('Macと接続して提出（準備中）','一時受付QRの経路は今回の限定公開では未開放です。',()=>{
      message('一時受付QRの経路は今回の限定公開では未開放です。「スマホでログインして送信」を利用してください。');return;
      const detail=q('#route-detail');detail.replaceChildren(element('p','Macのダッシュボードで一時受付QRを発行します。カメラでQRのリンクを開くか、QRの画像を選んで読み取ってください。'));
      const label=element('label','一時受付QRの画像を選択','button upload-label'),input=element('input');input.type='file';input.accept='image/*';input.hidden=true;label.append(input);detail.append(label);
      input.addEventListener('change',async()=>{
        try{if(!input.files[0])return;const {parsePairingQr}=await import('./10_model.mjs'),image=await loadImage(input.files[0]),id=image.getContext('2d').getImageData(0,0,image.width,image.height),
          found=window.jsQR(id.data,image.width,image.height,{inversionAttempts:'attemptBoth'});if(!found)throw Error('PAIR_QR_INVALID');await claimPair(parsePairingQr(found.data,location.origin));}
        catch(e){message(messageFor(e.message));}finally{input.value='';}
      });
      showPairControls();
    });
    addRoute('画像を保存','表裏を保存し、自分でMacへ転送して提出します。',()=>{
      const detail=q('#route-detail');detail.replaceChildren(element('p','表面と裏面をそれぞれ保存してください。保存だけでは提出されません。'));
      for(const side of ['F','B']){const b=element('button',side==='F'?'表面画像を保存':'裏面画像を保存');b.addEventListener('click',()=>download(side));detail.append(b);}
      if(navigator.canShare){const share=element('button','表裏をまとめて共有');share.addEventListener('click',async()=>{
        const files=['F','B'].map(side=>new File([draft.pages[side].correctedBlob],'worksheet-'+side+'.png',{type:'image/png'}));
        if(!navigator.canShare({files})){message('このブラウザーは画像の一括共有に対応していません。各面を保存してください。');return;}
        try{await navigator.share({files});message('共有操作を完了しました。Macで提出するまで、提出は未送信です。');}catch(e){message('共有を中断しました。撮影画像は保持しています。');}
      });detail.append(share);}
    });
  }
  function showPairControls(){
    const detail=q('#route-detail');
    if(!pairing)return;
    detail.append(element('p','Macの承認後、スマートフォンで送信できます。接続ID：'+pairing.pairId.slice(-6)));
    const send=element('button','接続の承認を確認して送信');send.addEventListener('click',async()=>{
      try{const status=await api('/api/pairs/'+pairing.pairId+'/status',undefined,pairing);if(!['APPROVED','USED','SUBMITTED'].includes(status.status))throw Error('PAIR_NOT_APPROVED');await submit('pair');}
      catch(e){message(messageFor(e.message));}
    });detail.append(send);
  }
  async function claimPair(qrToken){
    const identity=deviceId(),result=await api('/api/pairs/claim',{qrToken,deviceId:identity});
    pairing={...result,deviceId:identity};sessionStorage.setItem('ws-home-pair',JSON.stringify(pairing));
    message('接続要求を送信しました。Macで承認してください。撮影内容は保持しています。');
    q('#route-detail').replaceChildren();showPairControls();
  }
  async function poll(){
    if(stopped)return;
    try {
      if(draft.receipt && ['RECEIVED','VERIFYING'].includes(draft.receipt.state) && !busy && !conflict) {
        const previousId=draft.id,previousReceipt=draft.receipt.receiptId;
        const result=await api('/api/submissions/'+draft.receipt.receiptId,undefined,draft.route==='pair'?pairing:null);
        if(draft.id===previousId && draft.receipt?.receiptId===previousReceipt && result.state!==draft.receipt.state){draft.receipt=result;draft.state=result.state;await persist();render();onSubmitted(result);}
      }
    }catch(e){if(e.status===401 || e.status===403)message('受付結果の確認には再ログインまたは接続の確認が必要です。画像は保持しています。');}
    const timeout=setTimeout(poll,2500);cleanup.length=0;cleanup.push(()=>clearTimeout(timeout));
  }
  local=false;
  for(const side of ['F','B'])if(draft.pages[side]){try{sources[side]=await loadImage(draft.pages[side].originalBlob,draft.pages[side].options.turns || 0);drawSource(side);}catch(e){draft.pages[side].reading={status:'REVIEW',message:'原画像を復元できません。保持された補正画像を保存して退避してください。'};}}
  render();poll();
  return {claimPair,dispose(){stopped=true;cleanup.forEach(f=>f());channel?.close();for(const side of ['F','B'])clearPreview(side);}};
}
