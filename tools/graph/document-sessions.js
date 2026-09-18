/* 文書ごとの履歴・保存先。タブ管理情報は再編集ファイルへ混ぜない。 */
(function (root, factory) {
  const C = typeof module === 'object' && module.exports ? require('./core.js') : root.GraphCore;
  const api = factory(C);
  if (typeof module === 'object' && module.exports) module.exports = api;
  root.GraphDocumentSessions = api;
}(typeof globalThis !== 'undefined' ? globalThis : this, function (C) {
  'use strict';
  let serial = 0;
  function ranges(doc) {return {equalScale:doc.equalScale,axes:Object.fromEntries(Object.entries(doc.axes).map(([key,axis])=>[key,{min:axis.min,max:axis.max}]))};}
  function copyRanges(value, fallback) {
    if(value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.equalScale==='boolean'&&value.axes&&typeof value.axes==='object'&&!Array.isArray(value.axes)){
      const axes={};
      for(const key of ['x','y','z']){
        const axis=value.axes[key];
        if(!axis||typeof axis!=='object'||Array.isArray(axis)||!Number.isFinite(axis.min)||!Number.isFinite(axis.max)||axis.min<-1e9||axis.max>1e9||axis.min>=axis.max)return C.clone(fallback);
        axes[key]={min:axis.min,max:axis.max};
      }
      return {equalScale:value.equalScale,axes};
    }
    return C.clone(fallback);
  }
  class History extends C.History {
    constructor(doc, editRanges) {super(doc);this.editRanges=copyRanges(editRanges,ranges(this.document));this.rangeUndo=[];this.rangeRedo=[];}
    replace(doc,viewOnly=false) {
      const before=this.document,previous=C.clone(this.editRanges),result=super.replace(doc);
      if(result===before)return result;
      this.rangeUndo.push(previous);if(this.rangeUndo.length>100)this.rangeUndo.shift();this.rangeRedo=[];
      if(!viewOnly){
        for(const key of Object.keys(result.axes))for(const part of ['min','max'])if(before.axes[key][part]!==result.axes[key][part])this.editRanges.axes[key][part]=result.axes[key][part];
        if(before.equalScale!==result.equalScale)this.editRanges.equalScale=result.equalScale;
      }
      return result;
    }
    changeView(mutator) {const next=C.clone(this.document);mutator(next);return this.replace(next,true);}
    undo() {if(!this.canUndo)return this.document;this.rangeRedo.push(C.clone(this.editRanges));this.editRanges=this.rangeUndo.pop();return super.undo();}
    redo() {if(!this.canRedo)return this.document;this.rangeUndo.push(C.clone(this.editRanges));this.editRanges=this.rangeRedo.pop();return super.redo();}
  }
  function contentKey(doc) {
    const value = C.clone(doc);
    // 表示操作で変わる範囲を除き、座標設定で確定した範囲は別に比較する。
    for (const axis of Object.values(value.axes)) { delete axis.min; delete axis.max; }
    delete value.equalScale;
    return JSON.stringify(value);
  }
  function create(document, options = {}) {
    options=options&&typeof options==='object'&&!Array.isArray(options)?options:{};
    const history = new History(document, options.editRanges);
    const baseline=options.savedDocument||history.document;
    const baselineRanges=options.savedDocument
      ? copyRanges(options.savedEditRanges,ranges(baseline))
      : C.clone(history.editRanges);
    return {id: 'doc-' + Date.now().toString(36) + '-' + (++serial).toString(36) + '-' + Math.random().toString(36).slice(2, 10), history,
      savedKey: options.dirty ? null : contentKey(baseline)+JSON.stringify(baselineRanges), saveTarget: null,
      fileHandle: null, autoHandle: null, localAuto: null, busy: false, status: '', view: null, plotViews: {}, closed: false};
  }
  function key(tab) {return contentKey(tab.history.document)+JSON.stringify(tab.history.editRanges);}
  function checkpoint(tab) {return {document:C.clone(tab.history.document),key:key(tab),editRanges:C.clone(tab.history.editRanges)};}
  function dirty(tab) { return tab.savedKey !== key(tab); }
  function saved(tab, snapshot, target) { tab.savedKey = snapshot.key; tab.saveTarget = target; }
  function describe(tab) { return {id: tab.id, name: tab.history.document.name || '無題のグラフ', dirty: dirty(tab), busy: tab.busy}; }
  return {create, dirty, saved, describe, contentKey, checkpoint};
}));
