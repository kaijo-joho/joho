/* Original PDF bytes are retained in IndexedDB before the server commit. */
(function(root){
  'use strict';
  async function sha(bytes){
    return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes))).map(function(n){return n.toString(16).padStart(2,'0');}).join('');
  }
  function create(scope){
    var database;
    function open(){
      if(database)return database;
      database=new Promise(function(resolve,reject){
        if(!root.indexedDB){reject(Error('登録PDFを保管できません。このブラウザの保存機能を確認してください'));return;}
        var request=indexedDB.open('omr-registered-pdf/1',1);
        request.onupgradeneeded=function(){request.result.createObjectStore('artifacts');};
        request.onsuccess=function(){resolve(request.result);};
        request.onerror=function(){reject(Error('登録PDFの保管先を開けません'));};
        request.onblocked=function(){reject(Error('他のタブを閉じてから登録を再開してください'));};
      });database.catch(function(){database=null;});return database;
    }
    async function operation(id,value){
      var db=await open();return new Promise(function(resolve,reject){
        var tx=db.transaction('artifacts',value?'readwrite':'readonly'),store=tx.objectStore('artifacts'),key=scope+'|'+id,request=store.get(key),result;
        request.onsuccess=function(){
          result=request.result;
          // Another tab may have retained an original while this tab rendered.
          // The first retained PDF is immutable, even before server completion.
          if(value&&!result){store.add(value,key);result=value;}
        };
        tx.oncomplete=function(){resolve(result||null);};
        tx.onabort=tx.onerror=function(){reject(Error('登録PDFを保管できません。元の登録要求を保持しました'));};
      });
    }
    return {get:function(id){return operation(id);},put:async function(id,value){
      await operation(id,value);var stored=await operation(id);
      if(!stored||stored.pdfSha256!==value.pdfSha256)throw Error('別のタブで先にPDFが保管されました。同じ登録を再開して原本を確認してください');
      if(await sha(await stored.pdf.arrayBuffer())!==value.pdfSha256)throw Error('登録PDFの保管内容が一致しません');return stored;
    }};
  }
  root.OMRArtifacts={create:create,sha:sha};
})(window);
