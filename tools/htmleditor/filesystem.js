/* HTMLエディタの読取ステージとFile System Access API。外部送信は行わない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlFileSystem = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DRAFT_STORAGE_KEY='joho.htmleditor.draft.v1', MAX_FILES=200, MAX_TOTAL_BYTES=50*1024*1024, MAX_TEXT_BYTES=2*1024*1024, MAX_DEPTH=8, TEXT_RE=/\.(?:html?|css)$/i;
  const bytes=s=>typeof TextEncoder!=='undefined'?new TextEncoder().encode(s):Uint8Array.from(Buffer.from(s,'utf8'));
  const decodeUtf8 = raw => new TextDecoder('utf-8', {fatal:true, ignoreBOM:true}).decode(raw);
  const excluded = path => path.split('/').some(part => (part.startsWith('.') && part !== '..') || part === 'node_modules');
  function safePath(path){
    if(typeof path!=='string'||!path||/[\u0000-\u001f\u007f]/.test(path)||path.includes('\\')||path.startsWith('/')||/^[A-Za-z]:/.test(path)||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)||/%(?:2f|2F|5c|5C|00)/.test(path))throw new Error('ファイルパスが安全ではありません。');
    let decoded;try{decoded=decodeURIComponent(path);}catch(_){throw new Error('ファイルパスを読み取れません。');}
    if(decoded!==path||/[\u0000-\u001f\u007f\\]/.test(decoded)||decoded.startsWith('/')||/^[A-Za-z]:/.test(decoded))throw new Error('ファイルパスが安全ではありません。');
    const parts=path.split('/');if(parts.some(p=>!p||p==='.'||p==='..'))throw new Error('ファイルパスが安全ではありません。');return path;
  }
  function textPath(path){const clean=safePath(path);if(!TEXT_RE.test(clean))throw new Error('HTML、HTM、CSSファイルだけを読み込めます。');return clean;}
  const media=n=>/\.(?:jpg|jpeg|png|gif|svg|webp|mp3|mp4|woff2?|ttf|ico)$/i.test(n);
  const blob=f=>{try{return typeof URL!=='undefined'&&typeof URL.createObjectURL==='function'?URL.createObjectURL(f):null}catch(_){return null}};
  class HtmlFileSystem{
    constructor(){this.dirHandle=null;this.dirName='';this.readOnly=false;this.fileEntries=new Map();this.blobUrlMap=new Map();this.currentFilePath='';this.listeners=new Set();}
    onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
    _notify(e,d){for(const fn of this.listeners){try{fn(e,d)}catch(x){console.error(x)}}}
    isSupported(){return typeof window!=='undefined'&&'showDirectoryPicker'in window}
    isConnected(){return this.dirHandle!==null&&!this.readOnly}
    getDirectoryName(){return this.dirName||(this.isConnected()?'実習フォルダ':'')}
    getCurrentFilePath(){return this.currentFilePath}
    async openDirectory(){if(!this.isSupported())throw new Error('お使いのブラウザはフォルダ直接操作に対応していません。Google Chromeを推奨します。');const h=await window.showDirectoryPicker({mode:'readwrite'});const s=await this._stageDirectory(h);this._replace(s,h,h.name,false);this._notify('directory-opened',{dirName:this.dirName});return this.dirName}
    async scanDirectory(){if(!this.dirHandle||this.readOnly)return[];const s=await this._stageDirectory(this.dirHandle);this._replace(s,this.dirHandle,this.dirName,false);const files=this.getFileList();this._notify('files-scanned',{files});return files}
    async _stageDirectory(root) {
      const entries = new Map();
      const blobs = new Map();
      let total = 0;
      const walk = async (dir, prefix, depth) => {
        if (depth > MAX_DEPTH) throw new Error('フォルダの深さが上限を超えています。');
        for await (const [name, entry] of dir.entries()) {
          if (name.startsWith('.') || name === 'node_modules') continue;
          const relative = prefix ? `${prefix}/${name}` : name;
          safePath(relative);
          if (entry.kind === 'directory') { await walk(entry, relative, depth + 1); continue; }
          if (entry.kind !== 'file') continue;
          if (entries.size >= MAX_FILES) throw new Error('ファイル数が上限を超えています。');
          const file = await entry.getFile();
          total += Number(file.size) || 0;
          if (total > MAX_TOTAL_BYTES) throw new Error('フォルダの容量が上限を超えています。');
          entries.set(relative, {handle:entry, file, kind:'file'});
          if (media(name) || /\.css$/i.test(name)) { const url = blob(file); if (url) blobs.set(relative, url); }
        }
      };
      try { await walk(root, '', 0); } catch (error) { this._revoke(blobs); throw error; }
      return {entries, blobs};
    }
    _replace(s,h,name,ro){const old=this.blobUrlMap;this.fileEntries=s.entries;this.blobUrlMap=s.blobs;this.dirHandle=h;this.dirName=name||'';this.readOnly=ro;this.currentFilePath='';this._revoke(old)}
    _revoke(m){for(const u of m.values()){try{URL.revokeObjectURL(u)}catch(_){}}}
    _clearBlobUrls(){this._revoke(this.blobUrlMap);this.blobUrlMap.clear()}
    async importFiles(files, opt = {}) {
      const source = Array.from(files || []);
      if (!source.length) throw new Error('読み込むファイルがありません。');
      const directory = opt.directory === true;
      const entries = new Map();
      const blobs = new Map();
      let root = '';
      let total = 0;
      try {
        if (directory) {
          const first = String(source[0].webkitRelativePath || '');
          const parts = first.split('/');
          if (parts.length < 2 || !parts[0]) throw new Error('フォルダ選択の相対パスを確認できません。');
          root = parts[0];
        }
        for (const file of source) {
          let relative = String(file.webkitRelativePath || file.name || '');
          if (directory) {
            const prefix = root + '/';
            if (!relative.startsWith(prefix)) throw new Error('複数のフォルダを同時に読み込めません。');
            relative = relative.slice(prefix.length);
          }
          if (excluded(relative)) continue;
          if (relative.split('/').length > MAX_DEPTH + 1) throw new Error('フォルダの深さが上限を超えています。');
          relative = safePath(relative);
          if (entries.has(relative)) throw new Error(`同名ファイルが重複しています: ${relative}`);
          if (entries.size >= MAX_FILES) throw new Error('ファイル数が上限を超えています。');
          total += Number(file.size) || 0;
          if (total > MAX_TOTAL_BYTES) throw new Error('ファイル容量が上限を超えています。');
          entries.set(relative, {handle:null, file, kind:'file'});
          if (media(relative) || /\.css$/i.test(relative)) { const url = blob(file); if (url) blobs.set(relative, url); }
        }
        if (!entries.size) throw new Error('読み込めるファイルがありません。');
      } catch (error) { this._revoke(blobs); throw error; }
      this._replace({entries, blobs}, null, directory ? root : '読み込みファイル', true);
      this._notify('files-imported', {files:this.getFileList(), readOnly:true});
      return this.getFileList();
    }
    resolveResourceUrl(path,base=''){if(typeof path!=='string'||!path||path.startsWith('#')||path.startsWith('/')||/^[A-Za-z][A-Za-z0-9+.-]*:/.test(path)||path.startsWith('//')||/[\u0000-\u001f\u007f\\]/.test(path)||/%(?:2f|2F|5c|5C|00)/.test(path))return null;try{const b=base?safePath(base):'';const combined=b?b.split('/').slice(0,-1).concat(path.split('/')).join('/'):path;const stack=[];for(const p of combined.split('/')){if(!p||p==='.')continue;if(p==='..'){if(!stack.length)return null;stack.pop()}else stack.push(p)}const normalized=safePath(stack.join('/'));return this.blobUrlMap.get(normalized)||null}catch(_){return null}}
    getFileList(){return Array.from(this.fileEntries.keys()).sort((a,b)=>a.localeCompare(b))}
    async readFile(path) {
      const rel = textPath(path);
      const entry = this.fileEntries.get(rel);
      if (!entry) throw new Error(`ファイル "${path}" が見つかりません。`);
      const file = entry.handle ? await entry.handle.getFile() : entry.file;
      if (Number(file.size) > MAX_TEXT_BYTES) throw new Error('読み込むファイルが大きすぎます。');
      const raw = new Uint8Array(await file.arrayBuffer());
      if (raw.byteLength > MAX_TEXT_BYTES) throw new Error('読み込むファイルが大きすぎます。');
      let text;
      try { text = decodeUtf8(raw); } catch (_) { throw new Error('UTF-8として読み込めないファイルです。'); }
      this.currentFilePath = rel;
      this._notify('file-loaded', {path:rel, text});
      return text;
    }
    async writeFile(path, content) {
      if (!this.isConnected()) throw new Error('書込可能なフォルダが接続されていません。');
      const rel = textPath(path || this.currentFilePath);
      if (typeof content !== 'string' || bytes(content).byteLength > MAX_TEXT_BYTES) throw new Error('保存するファイルが大きすぎます。');
      const entry = this.fileEntries.get(rel);
      const handle = entry && entry.handle ? entry.handle : await this._getOrCreateFileHandle(rel);
      const writable = await handle.createWritable();
      let closed = false;
      try { await writable.write(content); await writable.close(); closed = true; }
      catch (error) { try { if (!closed && writable.abort) await writable.abort(); } catch (_) {} throw error; }
      const file = await handle.getFile();
      if (Number(file.size) > MAX_TEXT_BYTES) throw new Error('保存後のファイルが大きすぎます。');
      const raw = new Uint8Array(await file.arrayBuffer());
      if (raw.byteLength > MAX_TEXT_BYTES) throw new Error('保存後のファイルが大きすぎます。');
      let actual;
      try { actual = decodeUtf8(raw); } catch (_) { throw new Error('保存後のファイルをUTF-8として確認できません。'); }
      if (actual !== content) throw new Error('保存後の内容が一致しません。');
      this.fileEntries.set(rel, {handle, file, kind:'file'}); this.currentFilePath = rel;
      const old = this.blobUrlMap.get(rel); if (old) { try { URL.revokeObjectURL(old); } catch (_) {} this.blobUrlMap.delete(rel); }
      if (media(rel) || /\.css$/i.test(rel)) { const url = blob(file); if (url) this.blobUrlMap.set(rel, url); }
      this._notify('file-saved', {path:rel, lastModified:file.lastModified}); return {path:rel, lastModified:file.lastModified};
    }
    async _getOrCreateFileHandle(path){const parts=path.split('/');let d=this.dirHandle;for(let i=0;i<parts.length-1;i++)d=await d.getDirectoryHandle(parts[i],{create:true});return d.getFileHandle(parts[parts.length-1],{create:true})}
    disconnect(){this._clearBlobUrls();this.dirHandle=null;this.dirName='';this.readOnly=false;this.fileEntries.clear();this.currentFilePath='';this._notify('disconnected')}
    saveDraft(content,meta={}){try{localStorage.setItem(DRAFT_STORAGE_KEY,JSON.stringify({content,meta,updatedAt:Date.now()}))}catch(e){console.warn('一時保存に失敗しました:',e)}}
    loadDraft(){try{const raw=localStorage.getItem(DRAFT_STORAGE_KEY);return raw?JSON.parse(raw):null}catch(_){return null}}
    clearDraft(){try{localStorage.removeItem(DRAFT_STORAGE_KEY)}catch(_){} }
  }
  return HtmlFileSystem;
}));
