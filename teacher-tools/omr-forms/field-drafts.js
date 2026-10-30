/* Pending component edits are local UI state, separate from committed paper data. */
var OMRFieldDrafts=(function(){
 'use strict';var active=null,memory=new Map();
 function copy(v){return JSON.parse(JSON.stringify(v));}
 function valid(v){if(!v||!v.values||!Array.isArray(v.options)||v.options.length>12||!Array.isArray(v.runs)||v.runs.length>1000)return false;var count=0;
  if(Object.keys(v.values).some(function(k){return typeof v.values[k]!=='boolean'&&(typeof v.values[k]!=='string'||v.values[k].length>500);}))return false;
  if(v.options.some(function(o){return !o||typeof o.label!=='string'||o.label.length>180||typeof o.code!=='string'||o.code.length>32;}))return false;
  if(v.runs.some(function(r){if(r&&typeof r.text==='string')count+=r.text.length;return !r||typeof r.text!=='string'||!Number.isFinite(r.font_size)||r.font_size<6||r.font_size>48||!/^#[0-9a-f]{6}$/i.test(r.color)||['bold','italic','underline'].some(function(k){return typeof r[k]!=='boolean';});}))return false;return count<=20000;
 }
 function open(scope,base){var key='omr-editor-field-drafts/1/'+scope,legacy='omr-editor-rich-drafts/1/'+scope,result=copy(base),pending=false,error=null;active={key:key,legacy:legacy,base:copy(base)};
  try{var cached=memory.get(key),raw=cached?JSON.stringify(cached.data):localStorage.getItem(key),saved=null;if(raw){saved=JSON.parse(raw);var old=saved.schema==='omr-component-draft/2'?saved.value:saved;if(!old.runs)old.runs=copy(base.runs);if(!valid(old))throw Error();Object.keys(base.values).forEach(function(k){if(Object.prototype.hasOwnProperty.call(old.values,k)&&typeof old.values[k]===typeof base.values[k]){var unchanged=saved.base&&saved.base.values&&old.values[k]===saved.base.values[k];result.values[k]=unchanged?base.values[k]:old.values[k];}});['options','runs'].forEach(function(k){result[k]=saved.base&&JSON.stringify(old[k])===JSON.stringify(saved.base[k])?copy(base[k]):copy(old[k]);});pending=true;if(cached&&!cached.persisted)error='入力の控えをブラウザへ保存できません。画面内に保持しています。再読込前にコピーしてください。';}
   var rich=(!saved||saved.schema!=='omr-component-draft/2')?localStorage.getItem(legacy):null;if(rich){var candidate=copy(result);candidate.runs=JSON.parse(rich);if(!valid(candidate))throw Error();result=candidate;pending=true;}
  }catch(e){error='入力の控えを復元できません。元の控えは保持しています。';}
  return{value:result,pending:pending,error:error};
 }
 function save(value){if(!active||!valid(value))return false;var data={schema:'omr-component-draft/2',base:copy(active.base),value:copy(value)},cached={data:data,persisted:false};memory.set(active.key,cached);try{var raw=JSON.stringify(data);localStorage.setItem(active.key,raw);if(localStorage.getItem(active.key)!==raw)throw Error();cached.persisted=true;return true;}catch(e){return false;}}
 function clear(){if(!active)return true;try{localStorage.removeItem(active.legacy);localStorage.removeItem(active.key);memory.delete(active.key);return true;}catch(e){return false;}}
 return{open:open,save:save,clear:clear};
})();
