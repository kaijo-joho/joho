import {mountCapture} from './20_capture.mjs?v=20261015-7';
const params=new URLSearchParams(location.hash.slice(1)),token=params.get('pair');
if(location.hash)history.replaceState(null,'',location.pathname+location.search);
const controller=await mountCapture(document.getElementById('capture-root'));
if(token){try{if(!/^[A-Za-z0-9_-]{24,160}$/.test(token))throw Error('INVALID_PAIR_QR');await controller.claimPair(token);}
  catch(e){document.querySelector('#send-message').textContent='一時受付QRを利用できません。期限・使用済み・取消をMacで確認し、新しいQRで接続してください。撮影内容は保持しています。';}}
window.addEventListener('pagehide',()=>controller.dispose());
window.addEventListener('pageshow',event=>{if(event.persisted)location.reload();});
