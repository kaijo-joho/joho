/* Authenticated GAS popup transport. No tokens, credentials or wildcard origins. */
(function(root){
 'use strict';
 var PROTOCOL='omr-editor-bridge/1', OPS=['session','list','load','save'];
 function error(code,message){var e=new Error(message);e.code=code;return e;}
 function nonce(w){return Array.from(w.crypto.getRandomValues(new Uint8Array(24))).map(function(n){return n.toString(16).padStart(2,'0');}).join('');}
 function origin(value){try{var u=new URL(value);return u.origin===value&&!value.includes('*')&&u.username===''&&u.password==='';}catch(_){return false;}}
 function belongs(source,popup){try{return source===popup||!!source&&source.top===popup;}catch(_){return false;}}
 class Client{
  constructor(config,w){this.config=config;this.w=w;this.pending=new Map();this.peer=null;this.popup=null;this.connectionNonce=null;this.connecting=null;this.onMessage=this.receive.bind(this);w.addEventListener('message',this.onMessage);}
  validate(){var c=this.config,w=this.w;if(!c.enabled)throw error('DISABLED','GAS接続は未設定です。用紙はブラウザ・ファイルに保存できます。');
   if(!origin(c.brokerOrigin))throw error('CONFIG','接続先の設定が不正です');var u=new URL(c.gasUrl);
   var local=c.localMock&&['127.0.0.1','localhost'].includes(w.location.hostname)&&['127.0.0.1','localhost'].includes(u.hostname)&&u.origin===c.brokerOrigin;
   if(!local&&(!/^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(c.gasUrl)||new URL(c.brokerOrigin).protocol!=='https:'||!new URL(c.brokerOrigin).hostname.endsWith('.googleusercontent.com')))throw error('CONFIG','実測したGAS接続先と完全一致originが必要です');
  }
  connect(){this.validate();if(this.peer)return this.call('session',{});if(this.connecting)return this.connecting.promise;
   var self=this,n=nonce(this.w),u=new URL(this.config.gasUrl);u.searchParams.set('cn',n);this.connectionNonce=n;
   var resolve,reject,promise=new Promise(function(a,b){resolve=a;reject=b;});this.connecting={promise:promise,resolve:resolve,reject:reject};
   this.popup=this.w.open(u.href,'_blank','width=520,height=400');if(!this.popup){this.disconnect(error('POPUP','接続画面を開けませんでした。ポップアップを許可して再接続してください。'));return promise;}
   this.connectionTimer=this.w.setTimeout(function(){self.disconnect(error('TIMEOUT','接続を確認できませんでした。編集中の内容は保持しています。'));},20000);return promise;
  }
  receive(event){var m=event.data;if(event.origin!==this.config.brokerOrigin||!m||m.protocol!==PROTOCOL||m.connectionNonce!==this.connectionNonce)return;
   if(m.type==='ready'&&this.connecting&&belongs(event.source,this.popup)){
    this.peer=event.source;this.w.clearTimeout(this.connectionTimer);var connection=this.connecting;this.connecting=null;
    this.call('session',{}).then(function(result){connection.resolve(result);},function(e){connection.reject(e);});return;
   }
   if(event.source===this.peer&&m.type==='closed'){this.disconnect(error('DISCONNECTED','保存先との接続を終了しました'));return;}
   if(event.source!==this.peer||m.type!=='response')return;var p=this.pending.get(m.requestId);if(!p||m.op!==p.op)return;
   this.pending.delete(m.requestId);this.w.clearTimeout(p.timer);if(m.ok===true)p.resolve(m.result);else p.reject(error(m.error&&m.error.code||'REMOTE',m.error&&m.error.message||'保存先で処理できませんでした'));
  }
  call(op,data){if(!OPS.includes(op))return Promise.reject(error('INVALID','操作が不正です'));if(!this.peer)return Promise.reject(error('DISCONNECTED','GASへ接続してください'));
   var self=this,id=nonce(this.w);return new Promise(function(resolve,reject){var timer=self.w.setTimeout(function(){self.pending.delete(id);reject(error('TIMEOUT','応答を確認できません。保存要求は保持されています。同じ要求で再確認してください。'));},30000);
    self.pending.set(id,{op:op,resolve:resolve,reject:reject,timer:timer});try{self.peer.postMessage({protocol:PROTOCOL,type:'request',connectionNonce:self.connectionNonce,requestId:id,op:op,data:data},self.config.brokerOrigin);}catch(e){self.pending.delete(id);self.w.clearTimeout(timer);reject(error('DISCONNECTED','接続が切れています。再接続してください'));}
   });
  }
  disconnect(reason){var e=reason||error('DISCONNECTED','接続を終了しました');this.w.clearTimeout(this.connectionTimer);if(this.connecting){this.connecting.reject(e);this.connecting=null;}this.pending.forEach(function(p){this.w.clearTimeout(p.timer);p.reject(e);},this);this.pending.clear();this.peer=null;this.connectionNonce=null;if(this.w.CustomEvent)this.w.dispatchEvent(new this.w.CustomEvent('omr-connection-closed',{detail:e.message}));}
  destroy(){this.disconnect();this.w.removeEventListener('message',this.onMessage);}
 }
 root.OMRBridge={Client:Client,protocol:PROTOCOL,belongs:belongs};
})(typeof window==='undefined'?globalThis:window);
