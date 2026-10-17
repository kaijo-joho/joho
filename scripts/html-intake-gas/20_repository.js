// 準備済みの本人用GSSだけを使用する。新規作成・共有・見出し変更はしない。
var HtmlIntakeRepository = (function () {
  'use strict';
  function create(sheet,dep) {
    var T=HtmlIntakeContract,C=T.constants;
    var encode=dep.encode || function(s){return Utilities.base64Encode(s,Utilities.Charset.UTF_8);};
    var decode=dep.decode || function(s){return Utilities.newBlob(Utilities.base64Decode(s)).getDataAsString('UTF-8');};
    var header=sheet.getRange(1,1,1,C.headers.length);
    T.yes(T.canonical(header.getValues()[0])===T.canonical(C.headers) && header.getFormulas()[0].every(function(v){return v==='';}),'schema_mismatch');
    function indices(id) {
      var last=sheet.getLastRow(); if(last<2)return [];
      return sheet.getRange(2,1,last-1,1).getValues().map(function(r,i){return r[0]===id?i+2:0;}).filter(Boolean);
    }
    function read(id) {
      var rows=indices(id); if(!rows.length)return null;
      var runs=[];rows.forEach(function(row){var last=runs[runs.length-1];if(last && row===last[last.length-1]+1)last.push(row);else runs.push([row]);});
      var blocks=[];
      runs.forEach(function(run){
        var range=sheet.getRange(run[0],1,run.length,4),values=range.getValues();
        T.yes(range.getFormulas().every(function(row){return row.every(function(v){return v==='';});}),'backup_corrupt');
        values.forEach(function(row){if(row[1]==='prepared')blocks.push([row]);else {T.yes(blocks.length>0,'backup_corrupt');blocks[blocks.length-1].push(row);}});
      });
      T.yes(blocks.length>0,'backup_corrupt');
      var envelope;try{envelope=JSON.parse(blocks[0][0][2]);}catch(e){T.fail('backup_corrupt');}
      var body=envelope && envelope.body;T.yes(body && body.submissionId===id && T.digest(body.sourceSha256),'backup_corrupt');
      var source=null,complete=false;
      blocks.forEach(function(values){
        T.yes(values[0][2]===blocks[0][0][2],'request_conflict');
        if(values[values.length-1][1]!=='receipt')return;
        T.yes(values[values.length-1][2]===values[0][2],'backup_corrupt');
        var encoded='';values.slice(1,-1).forEach(function(row,i){T.yes(row[1]==='body' && row[2]===String(i) && typeof row[3]==='string' && row[3].slice(0,2)==='b:' && row[3].length<=C.chunk+2,'backup_corrupt');encoded+=row[3].slice(2);});
        var restored;try{restored=decode(encoded);}catch(e){T.fail('backup_corrupt');}
        T.yes(dep.sha(restored)===body.sourceSha256 && dep.bytes(restored)===body.byteLength && (!complete || source===restored),'backup_corrupt');
        source=restored;complete=true;
      });
      return {envelope:envelope,source:source,complete:complete};
    }
    function save(id,source,envelope) {
      dep.recheck();
      var serialized=T.canonical(envelope), chunks=[],encoded=encode(source),existing=read(id);
      if(existing) {T.yes(T.canonical(existing.envelope)===serialized,'request_conflict');if(existing.complete){T.yes(existing.source===source,'request_conflict');return;}}
      for(var i=0;i<encoded.length;i+=C.chunk) chunks.push(encoded.slice(i,i+C.chunk));
      var values=[[id,'prepared',serialized,'']].concat(chunks.map(function(s,i){return [id,'body',String(i),'b:'+s];}),[[id,'receipt',serialized,'']]);
      T.yes(serialized.length<=40000 && values.length<=74,'backup_too_large');
      // 中断したブロックは保持。別課題の提出が後にあっても、同じ署名で追記再開できる。
      var start=sheet.getLastRow()+1;
      T.yes(start+values.length-1<=sheet.getMaxRows(),'backup_full');
      // 先頭の署名付きpreparedを先に残し、応答消失後も初回時刻を保持する。
      sheet.getRange(start,1,1,4).setValues([values[0]]); dep.flush();
      T.yes(T.canonical(sheet.getRange(start,1,1,4).getValues()[0])===T.canonical(values[0]),'backup_unconfirmed');
      sheet.getRange(start,1,values.length,4).setValues(values); dep.flush(); dep.recheck();
      T.yes(T.canonical(sheet.getRange(start,1,values.length,4).getValues())===T.canonical(values),'backup_unconfirmed');
    }
    function lastReceivedAt(targetId) {
      var last=sheet.getLastRow(); if(last<2)return null;
      var latest=null;
      sheet.getRange(2,2,last-1,2).getValues().forEach(function(row){
        // preparedも同じ受付。中途半端な記録を別IDの新規送信で追い越さない。
        if(row[0]!=='prepared')return;
        var envelope;try{envelope=JSON.parse(row[1]);}catch(e){T.fail('backup_corrupt');}
        var body=dep.verify(envelope);
        if(body.targetId===targetId) latest=latest===null?body.receivedAt:Math.max(latest,body.receivedAt);
      }); return latest;
    }
    return {read:read,save:save,lastReceivedAt:lastReceivedAt};
  }
  return {create:create};
})();
