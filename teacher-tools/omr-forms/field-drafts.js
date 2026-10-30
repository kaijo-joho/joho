/* Pending component edits are local UI state, separate from committed paper data. */
var OMRFieldDrafts=(function(){
 'use strict';var active=null,memory=new Map(),PREFIX='omr-editor-field-drafts/1/',LEGACY='omr-editor-rich-drafts/1/',SCHEMA='omr-component-draft/2';
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function key(scope){return PREFIX+scope;}
 function legacyKey(scope){return LEGACY+scope;}
 function aliases(values,exclude){var seen=new Set(),out=[];(values||[]).forEach(function(k){if(typeof k==='string'&&(k.indexOf(PREFIX)===0||k.indexOf(LEGACY)===0)&&k!==exclude&&!seen.has(k)){seen.add(k);out.push(k);}});return out;}
 function valid(v){if(!v||!v.values||!Array.isArray(v.options)||v.options.length>12||!Array.isArray(v.runs)||v.runs.length>1000)return false;var count=0;
  if(Object.keys(v.values).some(function(k){return typeof v.values[k]!=='boolean'&&(typeof v.values[k]!=='string'||v.values[k].length>500);}))return false;
  if(v.options.some(function(o){return !o||typeof o.label!=='string'||o.label.length>180||typeof o.code!=='string'||o.code.length>32;}))return false;
  if(v.runs.some(function(r){if(r&&typeof r.text==='string')count+=r.text.length;return !r||typeof r.text!=='string'||!Number.isFinite(r.font_size)||r.font_size<6||r.font_size>48||!/^#[0-9a-f]{6}$/i.test(r.color)||['bold','italic','underline'].some(function(k){return typeof r[k]!=='boolean';});}))return false;return count<=20000;
 }
 function getRaw(k){var cached=memory.get(k);if(cached)return{raw:JSON.stringify(cached.data),cached:cached};return{raw:localStorage.getItem(k),cached:null};}
 function decode(raw){if(raw===null)return null;var parsed=JSON.parse(raw);if(parsed&&parsed.schema===SCHEMA){if(!valid(parsed.value)||parsed.base!==null&&parsed.base!==undefined&&!valid(parsed.base))throw Error('invalid combined draft');return{data:{schema:SCHEMA,base:parsed.base===undefined?null:parsed.base,value:parsed.value,supersededKeys:aliases(parsed.supersededKeys),richOnly:parsed.richOnly===true}};}if(valid(parsed))return{data:{schema:SCHEMA,base:null,value:parsed,supersededKeys:[],richOnly:false}};throw Error('invalid draft');}
 function open(scope,base){var currentKey=key(scope),oldRich=legacyKey(scope),result=copy(base),pending=false,error=null,saved=null;active={key:currentKey,legacy:oldRich,aliases:[],base:copy(base)};
  try{var source=getRaw(currentKey);saved=decode(source.raw);if(saved){var old=saved.data.value;
    active.aliases=aliases(saved.data.supersededKeys,currentKey);
    if(saved.data.richOnly){result.runs=copy(old.runs);}
    else{
     Object.keys(base.values).forEach(function(k){if(Object.prototype.hasOwnProperty.call(old.values,k)&&typeof old.values[k]===typeof base.values[k]){var unchanged=saved.data.base&&saved.data.base.values&&old.values[k]===saved.data.base.values[k];result.values[k]=unchanged?base.values[k]:old.values[k];}});
     ['options','runs'].forEach(function(k){result[k]=saved.data.base&&JSON.stringify(old[k])===JSON.stringify(saved.data.base[k])?copy(base[k]):copy(old[k]);});
    }
    pending=true;if(source.cached&&!source.cached.persisted)error='入力の控えをブラウザへ保存できません。画面内に保持しています。再読込前にコピーしてください。';
   }
   if(!saved){var rich=localStorage.getItem(oldRich);if(rich){var candidate=copy(result);candidate.runs=JSON.parse(rich);if(!valid(candidate))throw Error();result=candidate;pending=true;}}
  }catch(e){error='入力の控えを復元できません。元の控えは保持しています。';}
  return{value:result,pending:pending,error:error};
 }
 function save(value){if(!active||!valid(value))return false;var data={schema:SCHEMA,base:copy(active.base),value:copy(value),supersededKeys:aliases(active.aliases,active.key)},cached={data:data,persisted:false};memory.set(active.key,cached);try{var raw=JSON.stringify(data);localStorage.setItem(active.key,raw);if(localStorage.getItem(active.key)!==raw)throw Error();cached.persisted=true;return true;}catch(e){return false;}}
 function removeVerified(k){localStorage.removeItem(k);if(localStorage.getItem(k)!==null)throw Error('remove readback mismatch');}
 function clear(){if(!active)return true;var oldAliases=aliases(active.aliases,active.key),all=oldAliases.concat([active.legacy,active.key]);try{all.forEach(removeVerified);all.forEach(function(k){memory.delete(k);});return true;}catch(e){return false;}}
 function migrateScope(fromScope,toScope){
  if(typeof fromScope!=='string'||typeof toScope!=='string'||!fromScope||!toScope)return{ok:false,error:'控えの移行先を確認できません'};
  var sourceKey=key(fromScope),sourceLegacy=legacyKey(fromScope),targetKey=key(toScope);if(sourceKey===targetKey)return{ok:true};
  try{
   var targetRead=getRaw(targetKey),target=decode(targetRead.raw),sourceRead=getRaw(sourceKey),source=decode(sourceRead.raw),sourceRich=localStorage.getItem(sourceLegacy);
   var names=aliases((target?target.data.supersededKeys:[]).concat([sourceKey,sourceLegacy]),targetKey),next;
   if(target){next=copy(target.data);}
   else if(source){next=copy(source.data);}
   else if(sourceRich!==null){var runs=JSON.parse(sourceRich),richValue={values:{},options:[],runs:runs};if(!valid(richValue))throw Error('旧本文控えの形式が不正です');next={schema:SCHEMA,base:null,value:richValue,richOnly:true,supersededKeys:[]};}
   else if(targetRead.cached){next=copy(targetRead.cached.data);}
   else return{ok:true};
   next.schema=SCHEMA;next.supersededKeys=aliases((next.supersededKeys||[]).concat(names),targetKey);
   if(!valid(next.value))throw Error('移行控えの形式が不正です');
   var serialized=JSON.stringify(next);memory.set(targetKey,{data:copy(next),persisted:false});localStorage.setItem(targetKey,serialized);if(localStorage.getItem(targetKey)!==serialized)throw Error('移行先の読戻しが一致しません');
   memory.set(targetKey,{data:copy(next),persisted:true});if(active&&active.key===targetKey)active.aliases=aliases(next.supersededKeys,targetKey);
   // Keep the source and its runtime copy until the durable destination is verified.
   [sourceKey,sourceLegacy].forEach(function(k){if(k===targetKey)return;removeVerified(k);});
   memory.delete(sourceKey);return{ok:true};
  }catch(e){return{ok:false,error:'未適用の入力を移行できません。元の控えを保持しました。'};}
 }
 return{open:open,save:save,clear:clear,migrateScope:migrateScope};
})();
