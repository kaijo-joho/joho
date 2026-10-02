/* Public source provider candidate: each download fetches a manifest and exact version anew. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory(require('./local-protocol.js'));
  else root.HtmlPublicOriginal = factory(root.HtmlLocalProtocol);
}(typeof globalThis !== 'undefined' ? globalThis : this, function (protocol) {
  'use strict';
  const MANIFEST_PATH='/data/html-practice-templates-v3.json';
  const token=v=>typeof v==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v);
  function fail(code) {throw new Error(code);}
  function exact(value,keys) {
    if (!value || Object.getPrototypeOf(value)!==Object.prototype ||
      Object.keys(value).sort().join(',')!==keys.slice().sort().join(',')) fail('public_manifest_invalid');
  }
  function manifestShape(manifest) {
    exact(manifest,['v','revision','templates']);
    if (manifest.v!==3 || !token(manifest.revision) || !Array.isArray(manifest.templates) || manifest.templates.length>30) fail('public_manifest_invalid');
    const seen=new Set();
    for (const t of manifest.templates) {
      exact(t,['assignmentId','fileName','templateVersion','templateSha256','sourcePath','editableRegions']);
      if (!/^html\d{2}-\d{2}$/.test(t.assignmentId) || t.fileName!==t.assignmentId+'.html' || !token(t.templateVersion) ||
        !/^[a-f0-9]{64}$/.test(t.templateSha256) ||
        t.sourcePath!=='/html/templates/v3/'+t.assignmentId+'/'+t.templateVersion+'.html' ||
        !Array.isArray(t.editableRegions) || t.editableRegions.length<1 || t.editableRegions.length>20 ||
        !t.editableRegions.every(token) || new Set(t.editableRegions).size!==t.editableRegions.length || seen.has(t.assignmentId)) fail('public_manifest_invalid');
      seen.add(t.assignmentId);
    }
    return manifest;
  }
  // Only an explicit teacher-reviewed export DTO belongs in the public manifest.
  // Do not pass the private rubric/binding manifest to this exporter.
  function buildManifest(revision, reviewedTemplates) {
    if (!Array.isArray(reviewedTemplates)) fail('public_manifest_invalid');
    const output={v:3,revision,templates:reviewedTemplates.map(t=>{
      exact(t,['assignmentId','fileName','templateVersion','templateSha256','sourcePath','editableRegions']);
      return JSON.parse(JSON.stringify(t));
    })}; return manifestShape(output);
  }
  function create(options) {
    if (!options || options.origin!==protocol.ORIGIN || typeof options.fetch!=='function' || typeof options.sha256!=='function') fail('origin_not_allowed');
    async function get(path, limit, signal) {
      const url=new URL(path,protocol.ORIGIN).href;
      const response=await options.fetch(url,{cache:'no-store',credentials:'omit',redirect:'error',mode:'same-origin',signal});
      if (!response || response.ok!==true || response.url!==url) fail('original_fetch_failed');
      const length=response.headers && response.headers.get('content-length');
      if (length && (!/^\d+$/.test(length) || Number(length)>limit)) fail('original_too_large');
      // Bound the actual bytes before UTF-8 decoding, including a chunked response.
      if (!response.body || typeof response.body.getReader!=='function') fail('stream_unavailable');
      const reader=response.body.getReader(), chunks=[]; let total=0;
      try {
        while (true) {
          const result=await reader.read(); if (result.done) break;
          if (!(result.value instanceof Uint8Array)) fail('original_fetch_failed');
          total+=result.value.byteLength;
          if (total>limit) {await reader.cancel();fail('original_too_large');}
          chunks.push(result.value);
        }
      } finally {reader.releaseLock();}
      const bytes=new Uint8Array(total);let offset=0;
      for (const chunk of chunks) {bytes.set(chunk,offset);offset+=chunk.byteLength;}
      try {return new TextDecoder('utf-8',{fatal:true,ignoreBOM:true}).decode(bytes);} catch(_) {fail('utf8_invalid');}
    }
    async function obtain(assignmentId,signal) {
      if (!/^html\d{2}-\d{2}$/.test(assignmentId)) fail('assignment_invalid');
      const raw=await get(MANIFEST_PATH,65536,signal);
      let manifest;try {manifest=JSON.parse(raw);} catch(_) {fail('public_manifest_invalid');}
      manifestShape(manifest);
      const matches=manifest.templates.filter(t=>t.assignmentId===assignmentId);
      if (matches.length!==1) fail('assignment_not_published');
      const record=matches[0], source=await get(record.sourcePath,512*1024,signal);
      const actual=await options.sha256(source);
      if (actual!==record.templateSha256) fail('template_changed');
      const t={assignmentId:record.assignmentId,fileName:record.fileName,templateVersion:record.templateVersion,
        templateSha256:record.templateSha256,editableRegions:record.editableRegions.slice(),source};
      const codec={...options.codec,hash:text=>{if(text!==source)fail('template_changed');return actual;}};
      protocol.templateShape(t,codec);
      return {template:t,revision:manifest.revision,codec};
    }
    return {
      obtain,
      // Returns a new download candidate, never touches the current document or a filesystem handle.
      generateFresh:async(assignmentId,identityCache,signal)=>{
        const identity=await identityCache.identityForGeneration();
        const original=await obtain(assignmentId,signal);
        const freshIdentity=await identityCache.identityForGeneration();
        if (freshIdentity.token!==identity.token) fail('identity_changed');
        const localFileId=options.randomId();
        return {fileName:original.template.fileName,templateVersion:original.template.templateVersion,
          manifestRevision:original.revision,html:protocol.generate(identity.token,original.template,localFileId,original.codec)};
      }
    };
  }
  return {MANIFEST_PATH,manifestShape,buildManifest,create};
}));

