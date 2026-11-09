/* HTMLエディタの読取ステージとFile System Access API。外部送信は行わない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlFileSystem = factory();
}(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DRAFT_STORAGE_KEY='joho.htmleditor.draft.v1', MAX_FILES=200, MAX_TOTAL_BYTES=50*1024*1024, MAX_TEXT_BYTES=2*1024*1024, MAX_IMAGE_BYTES=8*1024*1024, MAX_DEPTH=8, TEXT_RE=/\.(?:html?|css)$/i;
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
  function imageName(name){const clean=safePath(name);if(clean.includes('/')||!/\.(?:jpe?g|png|gif|webp)$/i.test(clean))throw new Error('画像のファイル名を確認してください。');return clean;}
  const sameBytes=(a,b)=>a.length===b.length&&a.every((value,index)=>value===b[index]);
  const sameEntry=async(a,b)=>a===b||Boolean(a&&b&&typeof a.isSameEntry==='function'&&await a.isSameEntry(b));
  // 既存の新規保存とも同じロックを使い、存在確認・競合確認から読戻しまで保護する。
  const FILE_WRITE_LOCK = 'joho.htmleditor.new-file';
  const IMAGE_RE = /\.(?:jpe?g|png|gif|svg|webp|ico)$/i;
  const CSS_RE = /\.css$/i;
  const blob=f=>{try{return typeof URL!=='undefined'&&typeof URL.createObjectURL==='function'?URL.createObjectURL(f):null}catch(_){return null}};
  function putFile(entries, blobs, path, handle, file, cssText) {
    entries.set(path, {handle, file, kind:'file', cssText});
    if (!IMAGE_RE.test(path)) return;
    const previous = blobs.get(path);
    if (previous) URL.revokeObjectURL(previous);
    const url = blob(file);
    if (url) blobs.set(path, url);
    else blobs.delete(path);
  }
  async function stageFile(entries, blobs, path, handle, file) {
    let cssText;
    if (CSS_RE.test(path) && file.size <= MAX_TEXT_BYTES) {
      try { cssText = decodeUtf8(new Uint8Array(await file.arrayBuffer())); }
      catch { /* 読めないCSSだけをプレビューの参照エラーとして扱う。 */ }
    }
    putFile(entries, blobs, path, handle, file, cssText);
  }
  function resourcePath(reference, base) {
    if (typeof reference !== 'string' || /%(?:2f|5c|00)/i.test(reference)) return null;
    try {
      const path = decodeURIComponent(reference.split(/[?#]/, 1)[0]);
      if (!path || /^\/|^[a-z][a-z0-9+.-]*:|[\u0000-\u001f\u007f\\]/i.test(path)) return null;
      const parts = base ? safePath(base).split('/').slice(0, -1) : [];
      for (const segment of path.split('/')) {
        if (!segment || segment === '.') continue;
        if (segment === '..') {
          if (!parts.length) return null;
          parts.pop();
        } else parts.push(segment);
      }
      return safePath(parts.join('/'));
    } catch { return null; }
  }
  class HtmlFileSystem{
    constructor(){this.dirHandle=null;this.dirName='';this.readOnly=false;this.fileEntries=new Map();this.blobUrlMap=new Map();this.currentFilePath='';this.listeners=new Set();this.newFileAttempts=new Map();}
    onChange(fn){this.listeners.add(fn);return()=>this.listeners.delete(fn)}
    _notify(e,d){for(const fn of this.listeners){try{fn(e,d)}catch(x){console.error(x)}}}
    isSupported(){return typeof window!=='undefined'&&'showDirectoryPicker'in window}
    isConnected(){return this.dirHandle!==null&&!this.readOnly}
    getDirectoryName(){return this.dirName||(this.isConnected()?'実習フォルダ':'')}
    getCurrentFilePath(){return this.currentFilePath}
    async openDirectory(){if(!this.isSupported())throw new Error('お使いのブラウザはフォルダ直接操作に対応していません。Google Chromeを推奨します。');const h=await window.showDirectoryPicker({mode:'readwrite'});const s=await this._stageDirectory(h);this._replace(s,h,h.name,false);this._notify('directory-opened',{dirName:this.dirName});return this.dirName}
    async reconnectDirectory(handle,{requestPermission=false}={}){
      if(!handle||handle.kind!=='directory'||typeof handle.name!=='string'||!handle.name||typeof handle.entries!=='function'||typeof handle.queryPermission!=='function')throw new Error('保存されたフォルダーハンドルを利用できません。フォルダーを選び直してください。');
      let permission;
      try{permission=await handle.queryPermission({mode:'readwrite'})}catch(error){throw new Error(`フォルダーの利用許可を確認できません: ${error.message||error}`)}
      if(permission!=='granted'&&requestPermission===true){
        if(typeof handle.requestPermission!=='function')throw new Error('このブラウザーではフォルダーの利用許可を再確認できません。');
        try{permission=await handle.requestPermission({mode:'readwrite'})}catch(error){throw new Error(`フォルダーの利用許可を再確認できません: ${error.message||error}`)}
      }
      if(permission!=='granted')return false;
      const s=await this._stageDirectory(handle);
      this._replace(s,handle,handle.name,false);
      this._notify('directory-opened',{dirName:this.dirName});
      return true;
    }
    async scanDirectory() {
      if (!this.isConnected()) return [];
      const directory = this.dirHandle, originalEntries = this.fileEntries;
      const staged = await this._stageDirectory(directory);
      if (this.dirHandle !== directory || this.fileEntries !== originalEntries) {
        this._revoke(staged.blobs);
        throw new Error('フォルダの接続先が変わりました。もう一度操作してください。');
      }
      const path = this.currentFilePath;
      this._replace(staged, directory, this.dirName, false);
      this.currentFilePath = path;
      const files = this.getFileList();
      this._notify('files-scanned', {files});
      return files;
    }
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
          await stageFile(entries, blobs, relative, entry, file);
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
      const paths = opt.relativePaths;
      if (paths && (directory || paths.length !== source.length)) throw new Error('ファイルの相対パスを確認できません。');
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
        for (const [index, file] of source.entries()) {
          let relative = String(paths ? paths[index] : file.webkitRelativePath || file.name || '');
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
          await stageFile(entries, blobs, relative, null, file);
        }
        if (!entries.size) throw new Error('読み込めるファイルがありません。');
      } catch (error) { this._revoke(blobs); throw error; }
      this._replace({entries, blobs}, null, directory ? root : '読み込みファイル', true);
      this._notify('files-imported', {files:this.getFileList(), readOnly:true});
      return this.getFileList();
    }
    resolveResourceUrl(reference, base = '') {
      const url = this.blobUrlMap.get(resourcePath(reference, base));
      if (!url) return null;
      const hash = reference.indexOf('#');
      if (hash < 0) return url;
      const withFragment = new URL(url);
      withFragment.hash = reference.slice(hash);
      return withFragment.href;
    }
    resolveStylesheet(reference, base = '') {
      const path = resourcePath(reference, base);
      const text = this.fileEntries.get(path)?.cssText;
      return typeof text === 'string' ? {path, text} : null;
    }
    async copyPreviewFiles(currentPath) {
      const files = [];
      for (const [path, {file}] of this.fileEntries) {
        if (path === currentPath || !file || (!TEXT_RE.test(path) && !IMAGE_RE.test(path))) continue;
        // 別タブで読める固定データを作る。ディスクのハンドルは渡さない。
        files.push({path, file:new File([await file.arrayBuffer()], file.name, {type:file.type})});
      }
      return files;
    }
    getFileList(){return Array.from(this.fileEntries.keys()).sort((a,b)=>a.localeCompare(b))}
    async readFile(path, {activate = true} = {}) {
      const rel = textPath(path);
      const entry = this.fileEntries.get(rel);
      if (!entry) throw new Error(`ファイル "${path}" が見つかりません。`);
      const file = entry.handle ? await entry.handle.getFile() : entry.file;
      if (Number(file.size) > MAX_TEXT_BYTES) throw new Error('読み込むファイルが大きすぎます。');
      const raw = new Uint8Array(await file.arrayBuffer());
      if (raw.byteLength > MAX_TEXT_BYTES) throw new Error('読み込むファイルが大きすぎます。');
      let text;
      try { text = decodeUtf8(raw); } catch (_) { throw new Error('UTF-8として読み込めないファイルです。'); }
      if (activate) {
        this.currentFilePath = rel;
        this._notify('file-loaded', {path:rel, text});
      }
      return text;
    }
    async withWriteLock(action) {
      const locks = typeof navigator === 'undefined' ? null : navigator.locks;
      if (typeof locks?.request !== 'function') throw new Error('タブ間の保存競合を確認できません。Google Chromeで開き直すか、「設定」の保存の補助操作からコピーをダウンロードしてください。');
      return locks.request(FILE_WRITE_LOCK, action);
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
      const file = await this._verifyWrittenFile(handle, content);
      putFile(this.fileEntries, this.blobUrlMap, rel, handle, file, CSS_RE.test(rel) ? content : undefined);
      this.currentFilePath = rel;
      this._notify('file-saved', {path:rel, lastModified:file.lastModified}); return {path:rel, lastModified:file.lastModified};
    }
    async _verifyWrittenFile(handle, content) {
      const file = await handle.getFile();
      if (Number(file.size) > MAX_TEXT_BYTES) throw new Error('保存後のファイルが大きすぎます。');
      const raw = new Uint8Array(await file.arrayBuffer());
      if (raw.byteLength > MAX_TEXT_BYTES) throw new Error('保存後のファイルが大きすぎます。');
      let actual;
      try { actual = decodeUtf8(raw); } catch (_) { throw new Error('保存後のファイルをUTF-8として確認できません。'); }
      if (actual !== content) throw new Error('保存後の内容が一致しません。');
      return file;
    }
    async requireWritePermission() {
      if (!this.isConnected()) throw new Error('先に「HTML実習」フォルダを接続してください。');
      const directory = this.dirHandle;
      let permission = await directory.queryPermission({mode:'readwrite'});
      if (permission !== 'granted') permission = await directory.requestPermission({mode:'readwrite'});
      if (permission !== 'granted') throw new Error('フォルダへの保存が許可されませんでした。もう一度操作して許可を確認してください。');
      if (this.dirHandle !== directory) throw new Error('接続先が変わりました。もう一度操作してください。');
      return directory;
    }
    async hasFile(path, directory = this.dirHandle) {
      const rel = textPath(path);
      if (rel.includes('/') || !directory) throw new Error('実習ファイルは接続フォルダの直下へ保存してください。');
      try { await directory.getFileHandle(rel, {create:false}); return true; }
      catch (error) { if (error.name === 'NotFoundError') return false; if (error.name === 'TypeMismatchError') return true; throw error; }
    }
    async writeNewFile(path, content, directory = this.dirHandle) {
      const rel = textPath(path);
      if (rel.includes('/') || typeof content !== 'string' || bytes(content).byteLength > MAX_TEXT_BYTES) throw new Error('新しい実習ファイルの名前または容量を確認してください。');
      return this._writeNewContent(rel, content, directory, directory, rel, handle=>this._verifyWrittenFile(handle,content));
    }
    async getImagesDirectory(directory = this.dirHandle, expected = null) {
      if (!this.isConnected() || this.dirHandle !== directory) throw new Error('接続先が変わりました。保存先を確認してもう一度操作してください。');
      let images;
      try { images = await directory.getDirectoryHandle('images', {create:false}); }
      catch (error) {
        if (error.name === 'NotFoundError' || error.name === 'TypeMismatchError') throw new Error('Finderで「HTML実習」の中に「images」フォルダを作成してください。フォルダは自動では作成しません。');
        throw error;
      }
      if (this.dirHandle !== directory || expected && !await sameEntry(images,expected)) throw new Error('imagesの保存先が変わりました。保存先を確認してもう一度操作してください。');
      return images;
    }
    async hasImage(name, images) {
      const clean=imageName(name);
      try { await images.getFileHandle(clean,{create:false}); return true; }
      catch(error) { if(error.name==='NotFoundError')return false;if(error.name==='TypeMismatchError')return true;throw error; }
    }
    async writeNewImage(name, raw, directory = this.dirHandle, images = null) {
      const clean=imageName(name);
      if (!(raw instanceof Uint8Array) || !raw.length || raw.length>MAX_IMAGE_BYTES) throw new Error('保存する画像の容量を確認してください（8MiB以下）。');
      const data=new Uint8Array(raw); // 呼出し元での変更から、保存・読戻しの候補を固定する。
      const destination=await this.getImagesDirectory(directory,images), rel='images/'+clean;
      const total=Array.from(this.fileEntries.values()).reduce((sum,entry)=>sum+(Number(entry.file.size)||0),0);
      if(total-(Number(this.fileEntries.get(rel)?.file.size)||0)+data.length>MAX_TOTAL_BYTES)throw new Error('フォルダの容量が上限を超えています。');
      return this._writeNewContent(rel,data,directory,destination,clean,async handle=>{
        const file=await handle.getFile();
        if(file.size>MAX_IMAGE_BYTES)throw new Error('保存後の画像が大きすぎます。');
        const actual=new Uint8Array(await file.arrayBuffer());
        if(!sameBytes(actual,data))throw new Error('保存後の画像の内容が一致しません。');
        return file;
      });
    }
    async _writeNewContent(rel, content, directory, destination, name, verify) {
      const image=rel.startsWith('images/');
      const existsError = () => { const error = new Error(image ? '同名の画像があります。上書きせず、保存済みの画像を使ってください。' : '同名ファイルがあります。上書きせず、上部の「開く」から保存済みファイルを開いてください。'); error.name = 'FileExistsError'; return error; };
      const connected = async () => {
        if (!this.isConnected() || this.dirHandle !== directory) throw new Error('接続先が変わりました。保存先を確認してもう一度操作してください。');
        if(image)await this.getImagesDirectory(directory,destination);
      };
      const accept = file => {
        putFile(this.fileEntries, this.blobUrlMap, rel, handle, file, CSS_RE.test(rel) ? content : undefined);
        this.newFileAttempts.delete(rel);
        this._notify('file-created', {path:rel}); return {path:rel, directory};
      };
      let handle = null;
      const write = async () => {
        await connected();
        if (await directory.queryPermission({mode:'readwrite'}) !== 'granted') throw new Error('保存の許可が必要です。もう一度操作して許可を確認してください。');
        await connected();
        try { handle = await destination.getFileHandle(name, {create:false}); }
        catch (error) { if (error.name === 'TypeMismatchError') throw existsError(); if (error.name !== 'NotFoundError') throw error; }
        let attempt = this.newFileAttempts.get(rel);
        if (handle) {
          if (!attempt || attempt.directory !== directory || !await sameEntry(attempt.destination,destination) ||
              !(image ? sameBytes(attempt.content,content) : attempt.content===content) || !await sameEntry(handle,attempt.handle)) throw existsError();
          const file = await handle.getFile();
          if (file.size) {
            const verified = await verify(handle).catch(() => { throw existsError(); });
            await connected();
            return accept(verified);
          }
        } else {
          if (this.fileEntries.size >= MAX_FILES) throw new Error('フォルダ内のファイル数が上限に達しています。');
          handle = await destination.getFileHandle(name, {create:true});
          // OS側で同名ファイルが追加された場合も、内容のあるファイルは上書きしない。
          if ((await handle.getFile()).size) throw existsError();
          attempt = {directory, destination, handle, content}; this.newFileAttempts.set(rel, attempt);
        }
        await connected();
        const writable = await handle.createWritable();
        let closed = false;
        try { await writable.write(content); await connected(); await writable.close(); closed = true; }
        catch (error) { try { if (!closed && writable.abort) await writable.abort(); } catch (_) {} throw error; }
        const file = await verify(handle);
        await connected();
        return accept(file);
      };
      // 同一サイトの複数タブからの新規保存も、存在確認と書込を直列化する。
      const locks = typeof navigator === 'undefined' ? null : navigator.locks;
      return locks?.request ? locks.request(FILE_WRITE_LOCK, write) : write();
    }
    async _getOrCreateFileHandle(path){const parts=path.split('/');let d=this.dirHandle;for(let i=0;i<parts.length-1;i++)d=await d.getDirectoryHandle(parts[i],{create:true});return d.getFileHandle(parts[parts.length-1],{create:true})}
    disconnect(){this._clearBlobUrls();this.dirHandle=null;this.dirName='';this.readOnly=false;this.fileEntries.clear();this.newFileAttempts.clear();this.currentFilePath='';this._notify('disconnected')}
    saveDraft(content,meta={}){try{localStorage.setItem(DRAFT_STORAGE_KEY,JSON.stringify({content,meta,updatedAt:Date.now()}))}catch(e){console.warn('一時保存に失敗しました:',e)}}
    loadDraft(){try{const raw=localStorage.getItem(DRAFT_STORAGE_KEY);return raw?JSON.parse(raw):null}catch(_){return null}}
    clearDraft(){try{localStorage.removeItem(DRAFT_STORAGE_KEY)}catch(_){} }
  }
  return HtmlFileSystem;
}));
