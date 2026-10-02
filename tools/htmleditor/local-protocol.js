/* Non-production v3 contract candidate. No RPC, properties, Drive or network access. */
var HtmlLocalProtocol = (function () {
  'use strict';
  const ORIGIN = 'https://joho.kaijo.ed.jp';
  const ID_DOMAIN = 'joho-html-identity:v3:';
  const SUBJECT_DOMAIN = 'joho-html-subject:v3:';
  const LOCAL_MARKER = 'joho-html-local';
  function fail(code) { const e = new Error(code); e.htmlCode = code; throw e; }
  function yes(value, code) { if (!value) fail(code); }
  function exact(value, keys) {
    yes(value && Object.getPrototypeOf(value) === Object.prototype &&
      Object.keys(value).sort().join(',') === keys.slice().sort().join(','), 'shape_invalid');
  }
  function canonical(value) {
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
    yes(value === null || ['string', 'boolean', 'number'].includes(typeof value), 'shape_invalid');
    yes(typeof value !== 'number' || Number.isFinite(value), 'shape_invalid');
    return JSON.stringify(value);
  }
  function bytes(text) {
    yes(typeof text === 'string', 'file_invalid');
    let size = 0;
    for (let i = 0; i < text.length; i++) {
      const c = text.charCodeAt(i);
      if (c >= 0xd800 && c <= 0xdbff) {
        const d = text.charCodeAt(++i);
        yes(d >= 0xdc00 && d <= 0xdfff, 'utf8_invalid'); size += 4;
      } else { yes(c < 0xdc00 || c > 0xdfff, 'utf8_invalid'); size += c < 128 ? 1 : c < 2048 ? 2 : 3; }
    }
    return size;
  }
  const tokenName = v => typeof v === 'string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(v);
  const hexId = v => typeof v === 'string' && /^[a-f0-9]{32}$/.test(v);
  const hash = v => typeof v === 'string' && /^[a-f0-9]{64}$/.test(v);
  function identityShape(p) {
    exact(p, ['v','kind','issuer','audience','identityId','proofId','issuedAt','expiresAt','keyId','epoch']);
    yes(p.v === 3 && p.kind === 'identity' && p.issuer === 'kaijo-html' && p.audience === ORIGIN &&
      /^[A-Za-z0-9_-]{43}$/.test(p.identityId) && hexId(p.proofId) && tokenName(p.keyId) &&
      Number.isSafeInteger(p.issuedAt) && Number.isSafeInteger(p.expiresAt) && p.issuedAt >= 0 &&
      p.expiresAt > p.issuedAt && Number.isSafeInteger(p.epoch) && p.epoch >= 0, 'identity_invalid');
    return p;
  }
  function encode(value, codec) { return codec.encode(canonical(value)); }
  function decode(part, codec) {
    yes(typeof part === 'string' && /^[A-Za-z0-9_-]+$/.test(part) && part.length <= 16384, 'proof_invalid');
    let parsed; try { parsed = JSON.parse(codec.decode(part)); } catch (_) { fail('proof_invalid'); }
    yes(encode(parsed, codec) === part, 'proof_invalid'); return parsed;
  }
  function inspectIdentity(token, codec) {
    yes(typeof token === 'string' && token.length < 16384, 'identity_invalid');
    const split = token.split('.');
    yes(split.length === 2 && /^[A-Za-z0-9_-]{43}$/.test(split[1]), 'identity_invalid');
    return identityShape(decode(split[0], codec));
  }
  function rosterActor(email, table) {
    yes(typeof email === 'string' && /^[a-z0-9._+-]+@gfe\.kaijo\.ed\.jp$/.test(email), 'not_allowed');
    yes(Array.isArray(table) && Array.isArray(table[0]), 'roster_invalid');
    const headers = table[0];
    yes(headers.filter(h => h === 'userId').length === 1 && headers.filter(h => h === '年').length === 1, 'roster_invalid');
    const uid = headers.indexOf('userId'), grade = headers.indexOf('年');
    const matches = table.slice(1).filter(row => Array.isArray(row) && typeof row[uid] === 'string' && row[uid].trim().toLowerCase() === email);
    yes(matches.length === 1, 'not_allowed');
    const g = Number(matches[0][grade]);
    yes(Number.isInteger(g) && g >= 1 && g <= 6, 'not_allowed');
    return {userId: email, email: email, grade: g};
  }
  function settings(config) {
    yes(config && config.enabled === true && tokenName(config.activeKeyId) &&
      Number.isSafeInteger(config.epoch) && config.epoch >= 0 &&
      Number.isSafeInteger(config.lifetimeMs) && config.lifetimeMs > 0 && config.lifetimeMs <= 366 * 86400000 &&
      Array.isArray(config.revokedProofIds) && config.revokedProofIds.every(hexId), 'config_invalid');
    return config;
  }
  function key(config, keyId, env) {
    yes(Array.isArray(config.allowedKeyIds) && config.allowedKeyIds.includes(keyId), 'proof_invalid');
    const k = env.key(keyId);
    yes(typeof k === 'string' && /^[A-Za-z0-9_-]{43,128}$/.test(k), 'proof_invalid'); return k;
  }
  // Server-only adapter: currentEmail/readRoster/key/hmac are never supplied by a client request.
  function issueIdentity(env) {
    const c = settings(env.config()), now = env.now();
    yes(Number.isSafeInteger(now) && now >= 0, 'clock_invalid');
    const actor = rosterActor(env.currentEmail(), env.readRoster()), k = key(c, c.activeKeyId, env);
    const p = identityShape({v:3, kind:'identity', issuer:'kaijo-html', audience:ORIGIN,
      identityId:env.hmac(SUBJECT_DOMAIN + actor.userId, k), proofId:env.randomId(),
      issuedAt:now, expiresAt:now+c.lifetimeMs, keyId:c.activeKeyId, epoch:c.epoch});
    const body = encode(p, env.codec), signature = env.hmac(ID_DOMAIN + body, k);
    yes(/^[A-Za-z0-9_-]{43}$/.test(signature), 'proof_invalid');
    return {token:body+'.'+signature, payload:p};
  }
  function equal(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    let d = 0; for (let i=0; i<a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i); return d === 0;
  }
  function verifyIdentityInternal(token, env, allowExpired) {
    const c = settings(env.config()), p = inspectIdentity(token, env.codec), now = env.now();
    yes(Number.isSafeInteger(now), 'clock_invalid');
    const k = key(c, p.keyId, env), parts = token.split('.');
    yes(equal(env.hmac(ID_DOMAIN + parts[0], k), parts[1]), 'proof_invalid');
    // lifetimeMs controls future issuance, not implicit revocation of already signed proofs.
    // Explicit epoch/proof-ID/key revocation remains independent and authoritative.
    yes(p.issuedAt <= now && (allowExpired || now < p.expiresAt) &&
      p.expiresAt-p.issuedAt <= 366 * 86400000, 'identity_expired');
    yes(p.epoch === c.epoch && !c.revokedProofIds.includes(p.proofId), 'identity_revoked');
    const actor = rosterActor(env.currentEmail(), env.readRoster());
    yes(equal(p.identityId, env.hmac(SUBJECT_DOMAIN + actor.userId, k)), 'owner_mismatch');
    return {identity:p, actor:actor};
  }
  function verifyIdentity(token,env) {return verifyIdentityInternal(token,env,false);}
  function renewIdentityForFile(oldToken,env) {
    // Expiration alone may renew; bad signature, wrong Google owner and explicit revocation may not.
    verifyIdentityInternal(oldToken,env,true);
    const fresh=issueIdentity(env);
    return {token:fresh.token,replacesTokenSha256:env.codec.hash(oldToken)};
  }
  function envelopeShape(p) {
    exact(p, ['v','identity','assignmentId','fileName','templateVersion','templateSha256','localFileId']);
    yes(p.v === 3 && typeof p.identity === 'string' && tokenName(p.assignmentId) &&
      p.fileName === p.assignmentId+'.html' && tokenName(p.templateVersion) &&
      hash(p.templateSha256) && hexId(p.localFileId), 'file_invalid'); return p;
  }
  function templateShape(t, codec) {
    const keys=['assignmentId','fileName','templateVersion','templateSha256','source','editableRegions'];
    if (t && Object.prototype.hasOwnProperty.call(t,'rubricVersion')) keys.push('rubricVersion');
    exact(t, keys);
    yes(tokenName(t.assignmentId) && t.fileName === t.assignmentId+'.html' && tokenName(t.templateVersion) &&
      (!('rubricVersion' in t) || tokenName(t.rubricVersion)) && hash(t.templateSha256) && bytes(t.source) <= 512*1024 &&
      !/joho-issued-html|joho-html-local/.test(t.source) && Array.isArray(t.editableRegions) &&
      t.editableRegions.length > 0 && t.editableRegions.length <= 20 &&
      new Set(t.editableRegions).size === t.editableRegions.length && t.editableRegions.every(tokenName), 'template_invalid');
    yes(codec.hash(t.source) === t.templateSha256, 'template_changed');
    segments(t.source, t.editableRegions, wholeDocument(t)); return t;
  }
  // Mode comes only from the hash-checked adopted original, never from submitted code.
  // Plain current lessons permit replacing the entire editable document after the identity line.
  function wholeDocument(t) {
    return t.editableRegions.length === 1 && t.editableRegions[0] === 'document' &&
      !/joho-edit-(?:start|end):/.test(t.source);
  }
  function segments(source, regions, fullDocument) {
    if (fullDocument) return [];
    const fixed = []; let rest = source;
    for (const name of regions) {
      const start = '<!-- joho-edit-start:'+name+' -->', end = '<!-- joho-edit-end:'+name+' -->';
      yes(source.split(start).length === 2 && source.split(end).length === 2, 'fixed_region_invalid');
      const a = rest.indexOf(start), b = rest.indexOf(end);
      yes(a >= 0 && b > a, 'fixed_region_invalid');
      const content = rest.slice(a+start.length,b);
      yes(!/joho-edit-(?:start|end):/.test(content), 'fixed_region_invalid');
      fixed.push(rest.slice(0,a+start.length)); rest = rest.slice(b);
    }
    yes(!/joho-edit-start:/.test(rest), 'fixed_region_invalid'); fixed.push(rest); return fixed;
  }
  function generate(identityToken, trustedTemplate, localFileId, codec) {
    inspectIdentity(identityToken, codec); templateShape(trustedTemplate, codec);
    const p = envelopeShape({v:3, identity:identityToken, assignmentId:trustedTemplate.assignmentId,
      fileName:trustedTemplate.fileName, templateVersion:trustedTemplate.templateVersion,
      templateSha256:trustedTemplate.templateSha256, localFileId:localFileId});
    return '<!-- '+LOCAL_MARKER+':v3:'+encode(p,codec)+' -->\n'+trustedTemplate.source;
  }
  function parseLocal(source, codec) {
    yes(bytes(source) <= 2*1024*1024 && source.split(LOCAL_MARKER).length === 2 &&
      source.indexOf('joho-issued-html') < 0, 'file_invalid');
    const marker = source.match(/^<!-- joho-html-local:v3:([A-Za-z0-9_-]+) -->\n/);
    yes(marker, 'proof_invalid'); return {envelope:envelopeShape(decode(marker[1],codec)), source:source.slice(marker[0].length)};
  }
  function replaceIdentityForFile(source, trustedResponse, codec) {
    const parsed=parseLocal(source,codec), p=parsed.envelope;
    exact(trustedResponse,['token','replacesTokenSha256']);
    yes(trustedResponse.replacesTokenSha256===codec.hash(p.identity),'renewal_mismatch');
    inspectIdentity(trustedResponse.token,codec);
    // Only an authenticated bridge's renewal response belongs here. No template regeneration.
    const replacement=envelopeShape({...p,identity:trustedResponse.token});
    return '<!-- '+LOCAL_MARKER+':v3:'+encode(replacement,codec)+' -->\n'+parsed.source;
  }
  function verifySubmission(source, env) {
    const parsed = parseLocal(source, env.codec), p = parsed.envelope;
    const identity = verifyIdentity(p.identity, env);
    // Existing policy adapter still checks year, roster grade, task, deadlines and maintenance.
    const decision = env.authorize(identity.actor);
    yes(decision && decision.allowed === true && decision.targetId === p.assignmentId &&
      decision.fileName === p.fileName && decision.grade === identity.actor.grade &&
      Number.isInteger(decision.year) && Array.isArray(decision.acceptedTemplateVersions) &&
      decision.acceptedTemplateVersions.includes(p.templateVersion), 'not_allowed');
    // Adapter reads server-owned bindings and exact adopted bytes, never client-provided originals.
    const t = templateShape(env.allowedTemplate(p.assignmentId,p.templateVersion,decision), env.codec);
    yes(t.assignmentId === p.assignmentId && t.fileName === p.fileName && t.templateVersion === p.templateVersion &&
      t.templateSha256 === p.templateSha256 && tokenName(t.rubricVersion), 'template_changed');
    const fullDocument = wholeDocument(t);
    yes(canonical(segments(parsed.source,t.editableRegions,fullDocument)) ===
      canonical(segments(t.source,t.editableRegions,fullDocument)), 'fixed_region_invalid');
    return {status:'verified_v3', protocolVersion:3, verifiedUserId:identity.actor.userId,
      identityProofId:identity.identity.proofId, identityId:identity.identity.identityId,
      assignmentId:p.assignmentId, fileName:p.fileName, fiscalYear:decision.year, grade:identity.actor.grade,
      templateVersion:t.templateVersion, templateSha256:t.templateSha256, rubricVersion:t.rubricVersion,
      localFileId:p.localFileId, tokenSha256:env.codec.hash(p.identity), source:parsed.source};
  }
  function dispatch(source, routes) {
    yes(typeof source === 'string', 'file_invalid');
    const old = source.includes('joho-issued-html'), local = source.includes(LOCAL_MARKER);
    yes(!(old && local), 'protocol_ambiguous');
    if (old) return routes.v2(source); // Bad v2 HMAC throws here; no v3 fallback.
    if (local) return routes.v3(source); // Unknown/malformed v3 fails closed in parseLocal.
    return routes.missing(source);
  }
  return {ORIGIN, canonical, bytes, inspectIdentity, rosterActor, issueIdentity, verifyIdentity,renewIdentityForFile,replaceIdentityForFile,
    templateShape, generate, parseLocal, verifySubmission, dispatch};
})();
if (typeof module === 'object' && module.exports) module.exports = HtmlLocalProtocol;
