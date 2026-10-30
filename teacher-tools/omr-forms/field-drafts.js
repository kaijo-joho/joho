/* Unapplied field controls are local UI drafts, separate from the paper definition. */
var OMRFieldDrafts=(function(){
  'use strict';var $=function(id){return document.getElementById(id);},active=null,rows=null;
  var fields=['field-label','required','field-layout','min-select','max-select','digits','min-value','max-value'];
  function status(value){$('field-draft-status').textContent=value;}
  function snapshot(){var result={values:{},options:[]};fields.forEach(function(k){result.values[k]=$(k).type==='checkbox'?$(k).checked:$(k).value;});result.options=Array.from($('options-list').children).map(function(row){return{label:row.querySelector('.choice-label').value,code:row.querySelector('.choice-code').value};});return result;}
  function valid(v){return v&&v.values&&fields.every(function(k){return k==='required'?typeof v.values[k]==='boolean':typeof v.values[k]==='string'&&v.values[k].length<=180;})&&Array.isArray(v.options)&&v.options.length<=12&&v.options.every(function(o){return typeof o.label==='string'&&o.label.length<=180&&typeof o.code==='string'&&o.code.length<=32;});}
  function save(){if(!active)return;try{var value=snapshot();if(!valid(value))throw Error();var raw=JSON.stringify(value);localStorage.setItem(active,raw);if(localStorage.getItem(active)!==raw)throw Error();status('未適用の入力をブラウザへ保存しました。適用で紙面に反映します。');}catch(e){status('設定入力の控えを保存できません。適用して紙面へ反映してください。');OMRUI.notice('設定入力の控えをブラウザに保存できません。',true);}}
  function restore(key,makeRows){active='omr-editor-field-drafts/1/'+key;rows=makeRows;try{var raw=localStorage.getItem(active);if(!raw){status('設定を適用すると紙面に反映します。');return;}var value=JSON.parse(raw);if(!valid(value))throw Error();fields.forEach(function(k){if($(k).type==='checkbox')$(k).checked=value.values[k];else $(k).value=value.values[k];});$('options-list').replaceChildren();value.options.forEach(rows);status('未適用の入力を復元しました。適用で紙面に反映します。');}catch(e){status('設定入力の控えを復元できません。元の控えは保持しています。');}}
  function clear(){if(active)try{localStorage.removeItem(active);status('設定を紙面へ反映しました。');}catch(e){status('紙面へ適用しましたが、古い入力の控えを削除できません。');}active=null;}
  $('omr-properties').addEventListener('input',function(e){if(!e.isComposing)save();});$('omr-properties').addEventListener('change',save);$('omr-properties').addEventListener('compositionend',save);
  return{restore:restore,save:save,clear:clear};
})();
