// 未接続の移行候補。鍵・保存先・本人情報を公開コードへ置かない。
var HtmlIntakeContract = (function () {
  'use strict';
  var C = Object.freeze({kind:'html-local-receipt-v1', summaryKind:'html-local-outbox-v1',
    sheet:'HTML提出', headers:['submissionId','recordKind','metaJson','payload'],
    chunk:40000, maxBytes:2097152, maxSummaryBytes:8000, prefix:'html.outbox.v1.'});
  function fail(code) { var e = new Error(code); e.htmlIntakeCode = code; throw e; }
  function yes(value, code) { if (!value) fail(code); }
  function canonical(value) {
    if (value === null || typeof value !== 'object') return JSON.stringify(value);
    if (Array.isArray(value)) return '[' + value.map(canonical).join(',') + ']';
    return '{' + Object.keys(value).sort().map(function(k) { return JSON.stringify(k) + ':' + canonical(value[k]); }).join(',') + '}';
  }
  function clone(value) { return JSON.parse(JSON.stringify(value)); }
  function hex(bytes) { return bytes.map(function(v) { return ('0' + ((v + 256) % 256).toString(16)).slice(-2); }).join(''); }
  function sha(text) { return hex(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,text,Utilities.Charset.UTF_8)); }
  function bytes(text) { return Utilities.newBlob(text).getBytes().length; }
  function hmac(text,key) { return Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(text,key,Utilities.Charset.UTF_8)).replace(/=+$/,''); }
  function equal(a,b) {
    if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) return false;
    var difference=0; for(var i=0;i<a.length;i++) difference |= a.charCodeAt(i)^b.charCodeAt(i); return difference===0;
  }
  function id(value) { return typeof value==='string' && /^[a-f0-9]{32}$/.test(value); }
  function digest(value) { return typeof value==='string' && /^[a-f0-9]{64}$/.test(value); }
  function token(value) { return typeof value==='string' && /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/.test(value); }
  function account(value) { return typeof value==='string' && value===value.toLowerCase() && /^[a-z0-9._+-]+@[a-z0-9.-]+$/.test(value) && value.length<=254; }
  function signing(config, crypto) {
    crypto=crypto || {sha:sha,hmac:hmac,bytes:bytes};
    function key(id) { var value=config.receiptKeys && config.receiptKeys[id]; yes(token(id) && typeof value==='string' && value.length>=32,'signing_unavailable'); return value; }
    function sign(body, keyId) { keyId=keyId || config.activeKeyId;var copy=clone(body);return {keyId:keyId,body:copy,signature:crypto.hmac(canonical(copy),key(keyId))}; }
    function verify(envelope) {
      yes(envelope && Object.keys(envelope).sort().join(',')==='body,keyId,signature' && envelope.body && equal(crypto.hmac(canonical(envelope.body),key(envelope.keyId)),envelope.signature),'signature_invalid');
      return clone(envelope.body);
    }
    return {sign:sign,verify:verify,sha:crypto.sha,bytes:crypto.bytes};
  }
  // 値を採点し直さず、固定基準・項目順・配点・合計・★との対応を検査する。
  function assessment(input, binding) {
    var rubric=binding.snapshot.body.rubric;
    if(binding.targetId==='html11-01') {
      yes(input===null,'intro_result_not_local');
      return {state:'graded',score:1,rules:[{ruleId:rubric.rules[0].ruleId,label:rubric.rules[0].label,points:100,earned:100,passed:true}],diagnostics:[]};
    }
    yes(input && input.kind==='html-local-result-v1','assessment_required');
    ['targetId','templateVersion','templateSha256','rubricVersion','rubricSha256','engineVersion','engineSourceHash'].forEach(function(k) { yes(input[k]===binding[k],'version_mismatch'); });
    var r=input.result;
    yes(r && ['graded','needs_review'].indexOf(r.state)>=0 && r.rubricId===binding.targetId && r.rubricVersion===binding.rubricVersion && r.engineVersion===binding.engineVersion &&
      Array.isArray(r.rules) && Array.isArray(r.diagnostics) && r.diagnostics.length<=200,'result_invalid');
    var rules=[];
    if(r.rules.length) {
      yes(r.rules.length===rubric.rules.length,'rules_invalid');
      rules=r.rules.map(function(rule,i) {
        var expected=rubric.rules[i], points=expected.enabled===false ? 0 : expected.points;
        yes(rule.ruleId===expected.ruleId && rule.points===points && Number.isFinite(rule.earned) && rule.earned>=0 && rule.earned<=points &&
          typeof rule.passed==='boolean' && rule.passed===(expected.enabled!==false && Math.abs(rule.earned-points)<1e-8),'rules_invalid');
        return {ruleId:expected.ruleId,label:expected.message,points:points,earned:rule.earned,passed:rule.passed};
      });
    }
    var score=rules.reduce(function(n,rule) { return n+rule.earned; },0)/100;
    if(r.state==='graded') yes(rules.length===rubric.rules.length && r.diagnostics.length===0 && typeof r.score==='number' && Math.abs(score-r.score)<1e-8 && Math.abs(rules.reduce(function(n,rule){return n+rule.points;},0)-100)<1e-8,'score_invalid');
    else yes(r.score===null && r.diagnostics.length>0,'score_invalid');
    var diagnostics=r.diagnostics.map(function(d) { yes(d && token(d.code),'diagnostics_invalid'); return {code:d.code}; });
    return {state:r.state,score:r.state==='graded'?score:null,rules:rules,diagnostics:diagnostics};
  }
  function sheetName(userId) { return userId[0]==='1' ? userId.slice(0,3)+'_html' : userId.slice(0,5)==='kaijo' ? 'kaijo' : 'other'; }
  function summary(receipt) {
    var keys=['kind','account','actorKey','spreadsheetId','generation','submissionId','requestHash','targetId','fileName','sourceSha256','byteLength',
      'templateVersion','templateSha256','rubricVersion','rubricSha256','engineVersion','engineSourceHash','receivedAt','fiscalYear','grade','finalDueAt','result'];
    var result={}; keys.forEach(function(k) { result[k]=receipt[k]; }); result.kind=C.summaryKind;
    return result;
  }
  function outboxKey(body) { yes(digest(body.actorKey) && id(body.submissionId),'receipt_invalid'); return C.prefix+body.actorKey+'.'+body.submissionId; }
  return Object.freeze({constants:C,fail:fail,yes:yes,canonical:canonical,clone:clone,sha:sha,bytes:bytes,id:id,digest:digest,token:token,account:account,signing:signing,assessment:assessment,sheetName:sheetName,summary:summary,outboxKey:outboxKey});
})();
