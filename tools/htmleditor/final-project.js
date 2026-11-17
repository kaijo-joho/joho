/* 保存済みフォルダの固定コピーと静的作品ZIP。ネットワーク・書込みは行わない。 */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HtmlFinalProject = factory();
}(globalThis, function () {
  'use strict';
  const MiB = 1024 * 1024;
  const limits = Object.freeze({files:50, archive:10*MiB, total:50*MiB, file:20*MiB, depth:8, path:240, ratio:100});
  const allowed = /\.(?:html?|css|png|jpe?g|gif|webp|svg|ico)$/i;
  const encoder = new TextEncoder();
  const byteLength = value => encoder.encode(value).length;
  const metadata = path => path.split('/').some(part => part === '.DS_Store' || part === '__MACOSX' || part.startsWith('._'));
  function pathName(path) {
    if (typeof path !== 'string' || !path || path !== path.normalize('NFC') ||
        byteLength(path) > limits.path || /[\\\u0000-\u001f\u007f:%?#]/.test(path)) {
      throw Error('ファイル名・パスを確認してください。NFC形式、UTF-8で240バイト以内が対象です。');
    }
    const parts = path.split('/');
    if (parts.length > limits.depth || parts.some(part => !part || part.startsWith('.') || part === '__MACOSX')) {
      throw Error('使用できないフォルダ名・ファイル名、または8階層を超えるパスです。');
    }
    return path;
  }
  function inspectPaths(entries) {
    const paths = new Set(), spellings = new Map(), files = [], excluded = [], errors = [];
    let total = 0;
    for (const entry of entries) {
      if (metadata(entry.path)) { excluded.push(entry.path); continue; }
      try {
        pathName(entry.path);
        if (!allowed.test(entry.path)) throw Error('HTML・CSS・画像以外のファイルは同梱できません。');
        const key = entry.path.replace(/\u1e9e/g,'ß').toUpperCase().toLowerCase();
        if (paths.has(key)) throw Error('大文字・小文字の違いだけの同名パスがあります。');
        paths.add(key);
        const parts = entry.path.split('/');
        for (let length = 1; length <= parts.length; length++) {
          const prefix = parts.slice(0,length).join('/');
          const folded = prefix.replace(/\u1e9e/g,'ß').toUpperCase().toLowerCase();
          if (spellings.has(folded) && spellings.get(folded) !== prefix) throw Error('大文字・小文字が異なる同じフォルダ名があります。');
          spellings.set(folded,prefix);
        }
        for (const other of paths) {
          if (other !== key && (other.startsWith(key + '/') || key.startsWith(other + '/'))) throw Error('ファイル名とフォルダ名が重複しています。');
        }
        if (!Number.isSafeInteger(entry.size) || entry.size < 0 || entry.size > limits.file) throw Error('1ファイルは20MiB以内にしてください。');
        total += entry.size;
        files.push(entry);
      } catch (error) { errors.push(entry.path + ' — ' + error.message); }
    }
    if (!files.some(entry => entry.path === 'index.html')) errors.push('作品フォルダ直下に index.html が必要です。');
    if (files.length > limits.files) errors.push('HTML・CSS・画像を合わせて50ファイル以内にしてください。');
    if (total > limits.total) errors.push('展開後の合計を50MiB以内にしてください。');
    if (errors.length) {
      const error = Error('作品フォルダを確認してください。');
      error.details = errors;
      throw error;
    }
    return {files, excluded, total};
  }
  const digest = async raw => [...new Uint8Array(await crypto.subtle.digest('SHA-256', raw))].map(n => n.toString(16).padStart(2,'0')).join('');
  async function list(directory, imported) {
    const entries = [];
    async function walk(handle, prefix) {
      if (prefix.split('/').length > limits.depth + 1) throw Error('フォルダは8階層以内にしてください。');
      for await (const [name, child] of handle.entries()) {
        const path = prefix ? prefix + '/' + name : name;
        if (child.kind === 'directory') {
          if (metadata(path)) { entries.push({path, size:0, metadata:true}); continue; }
          pathName(path);
          await walk(child, path);
        } else if (child.kind === 'file') {
          const file = await child.getFile();
          entries.push({path, size:file.size, lastModified:file.lastModified, file, handle:child});
        } else throw Error(path + ' のファイル形式を確認できません。');
        if (entries.length > 250) throw Error('作品フォルダ内のファイルが多すぎます。');
      }
    }
    if (directory) await walk(directory, '');
    else for (const [path, entry] of imported || []) {
      entries.push({path, size:entry.file.size, lastModified:entry.file.lastModified, file:entry.file});
    }
    return entries.sort((a,b) => a.path < b.path ? -1 : a.path === b.path ? 0 : 1);
  }
  function localReference(value, page, externalLink = false) {
    value = value.trim();
    if (externalLink && /^(?:https?:|mailto:)/i.test(value)) return;
    if (/^data:image\/(?:png|jpeg|gif|webp);base64,[a-z0-9+/=]+$/i.test(value)) return;
    if (/^[a-z][\w+.-]*:|^\/|[\\\u0000-\u0020\u007f]/i.test(value)) throw Error('外部素材・埋込み、または使用できない参照があります。');
    const parts = page.split('/').slice(0,-1);
    const path = decodeURIComponent(value.split(/[?#]/)[0]);
    for (const part of path.split('/')) {
      if (!part || part === '.') continue;
      if (part === '..') { if (!parts.length) throw Error('作品フォルダの外への参照があります。'); parts.pop(); }
      else { if (part.startsWith('.') || /[\\:]/.test(part)) throw Error('使用できない参照パスです。'); parts.push(part); }
    }
  }
  function checkCss(value, page) {
    value = value.replace(/\\([0-9a-f]{1,6}\s?|.)/gi, (_, token) =>
      /^[0-9a-f]{1,6}\s?$/i.test(token) ? String.fromCodePoint(Number.parseInt(token,16) || 65533) : token);
    value = value.replace(/\/\*[\s\S]*?\*\//g,'');
    if (/expression\s*\(|-moz-binding|behavior\s*:/i.test(value)) throw Error('実行処理を含むCSSは使用できません。');
    for (const match of value.matchAll(/url\s*\(\s*(['"]?)(.*?)\1\s*\)|@import\s+(['"])(.*?)\3/gi)) localReference(match[2] ?? match[4],page);
  }
  function checkText(raw, path) {
    const value = new TextDecoder('utf-8',{fatal:true}).decode(raw);
    if (/\.css$/i.test(path)) { checkCss(value,path); return; }
    if (typeof DOMParser !== 'function') throw Error('この環境では提出内容を確認できません。');
    const svg = /\.svg$/i.test(path);
    if (svg && /<!\s*(?:doctype|entity)/i.test(value)) throw Error('SVGの外部宣言は使用できません。');
    const policy = '<meta http-equiv="Content-Security-Policy" content="default-src \'none\'">';
    const doc = new DOMParser().parseFromString(svg ? value : policy + value, svg ? 'image/svg+xml' : 'text/html');
    if (doc.querySelector('parsererror,script,iframe,object,embed,video,audio,form,base,foreignObject,animate,set,animateTransform')) throw Error('スクリプト・埋込み・動画・フォーム等は使用できません。');
    for (const node of doc.querySelectorAll('*')) {
      for (const attr of node.attributes) {
        const key = attr.localName.toLowerCase(), name = node.localName.toLowerCase(), text = attr.value;
        if (/^on/i.test(key) || ['srcdoc','srcset','ping'].includes(key) ||
            key === 'http-equiv' && text.toLowerCase() === 'refresh') throw Error('自動実行・外部埋込みの指定は使用できません。');
        if (['href','src','action','poster'].includes(key) && text) localReference(text,path,name === 'a' && key === 'href');
        if (key === 'style') checkCss(text,path);
      }
      if (node.localName.toLowerCase() === 'style') checkCss(node.textContent,path);
    }
  }
  function checkContent(raw, path) {
    if (/\.(?:html?|css|svg)$/i.test(path)) return checkText(raw,path);
    const starts = (...bytes) => bytes.every((n,i) => raw[i] === n);
    const type = path.split('.').pop().toLowerCase();
    const valid = {png:starts(137,80,78,71,13,10,26,10), jpg:starts(255,216,255), jpeg:starts(255,216,255),
      gif:['GIF87a','GIF89a'].includes(new TextDecoder().decode(raw.slice(0,6))),
      webp:starts(82,73,70,70) && new TextDecoder().decode(raw.slice(8,12)) === 'WEBP', ico:starts(0,0,1,0)};
    if (!valid[type]) throw Error('画像の内容と拡張子が一致しません。');
  }
  const crcTable = Uint32Array.from({length:256}, (_, n) => {
    for (let i=0;i<8;i++) n = n & 1 ? 0xedb88320 ^ n >>> 1 : n >>> 1;
    return n >>> 0;
  });
  function crc32(raw) {
    let crc = 0xffffffff;
    for (const byte of raw) crc = crcTable[(crc ^ byte) & 255] ^ crc >>> 8;
    return (crc ^ 0xffffffff) >>> 0;
  }
  async function pack(files) {
    const chunks = [], central = [];
    let offset = 0;
    for (const {path, raw} of files) {
      let compressed = raw, method = 0;
      if (typeof CompressionStream === 'function') {
        try {
          const stream = new Blob([raw]).stream().pipeThrough(new CompressionStream('deflate-raw'));
          const candidate = new Uint8Array(await new Response(stream).arrayBuffer());
          if (candidate.length < raw.length && raw.length <= candidate.length * limits.ratio) { compressed = candidate; method = 8; }
        } catch { /* 圧縮非対応時も同じZIP上限で無圧縮を使う。 */ }
      }
      const name = encoder.encode(path), crc = crc32(raw);
      const header = new Uint8Array(30 + name.length), view = new DataView(header.buffer);
      view.setUint32(0,0x04034b50,true); view.setUint16(4,20,true); view.setUint16(6,0x800,true);
      view.setUint16(8,method,true); view.setUint16(12,33,true); view.setUint32(14,crc,true);
      view.setUint32(18,compressed.length,true); view.setUint32(22,raw.length,true); view.setUint16(26,name.length,true); header.set(name,30);
      const record = new Uint8Array(46+name.length), cv = new DataView(record.buffer);
      cv.setUint32(0,0x02014b50,true); cv.setUint16(4,20,true); record.set(header.subarray(4,30),6);
      cv.setUint32(42,offset,true); record.set(name,46);
      chunks.push(header,compressed); central.push(record); offset += header.length + compressed.length;
      if (offset > limits.archive) throw Error('ZIPが10MiBを超えます。画像等の容量を見直してください。');
    }
    const centralSize = central.reduce((sum,entry)=>sum+entry.length,0), end = new Uint8Array(22), view = new DataView(end.buffer);
    view.setUint32(0,0x06054b50,true); view.setUint16(8,files.length,true); view.setUint16(10,files.length,true);
    view.setUint32(12,centralSize,true); view.setUint32(16,offset,true);
    const blob = new Blob([...chunks,...central,end],{type:'application/zip'});
    if (blob.size > limits.archive) throw Error('ZIPが10MiBを超えます。画像等の容量を見直してください。');
    return blob;
  }
  async function capture(fs) {
    const directory = fs.dirHandle, entries = fs.fileEntries;
    const initial = await list(directory,entries), plan = inspectPaths(initial);
    const files = [], hashes = new Map();
    for (const entry of plan.files) {
      const raw = new Uint8Array(await entry.file.arrayBuffer());
      if (raw.length !== entry.size) throw Error('読み込み中にファイルが変わりました。もう一度準備してください。');
      try { checkContent(raw,entry.path); } catch (error) { throw Error(entry.path + ' — ' + error.message); }
      hashes.set(entry.path,await digest(raw));
      files.push({path:entry.path,raw});
    }
    const after = await list(directory,entries);
    const fingerprint = values => JSON.stringify(values.map(({path,size,lastModified})=>[path,size,lastModified]));
    if (fs.dirHandle !== directory || fs.fileEntries !== entries || fingerprint(initial) !== fingerprint(after)) throw Error('準備中に作品フォルダが変わりました。もう一度準備してください。');
    for (const entry of after.filter(entry=>hashes.has(entry.path))) {
      if (await digest(await entry.file.arrayBuffer()) !== hashes.get(entry.path)) throw Error(entry.path + ' が変わりました。もう一度準備してください。');
    }
    const blob = await pack(files);
    if (fs.dirHandle !== directory || fs.fileEntries !== entries) throw Error('作品の接続先が変わりました。もう一度準備してください。');
    return Object.freeze({blob, sha256:await digest(await blob.arrayBuffer()), count:files.length,
      totalBytes:plan.total, files:Object.freeze(plan.files.map(({path,size})=>Object.freeze({path,size}))),
      excluded:Object.freeze(plan.excluded), name:'HTML最終課題.zip'});
  }
  return Object.freeze({limits, pathName, inspectPaths, capture, pack, crc32, digest, checkContent});
}));
