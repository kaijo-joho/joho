// ブラウザの取組評価。署名済み受付は実行・正答の真正性を証明しない。
import { legacyAssessmentHelpers as H } from './local-assessment-helpers.mjs?v=20261017-local-assessment1';
export const LOCAL_ASSESSMENT_ENGINE = 'python-local-rules-hash-20261017-v1';
const HASH = /^[a-f0-9]{64}$/, ID = /^[A-Za-z][A-Za-z0-9_.-]{0,119}$/;
const SUBSTRINGS = ['text', 'compact', 'quoted'];
const FEATURES = [...SUBSTRINGS, 'assignmentExact', 'assignmentCommutative', 'assignmentExpanded', 'comparison', 'boolean', 'printAny', 'printEnd', 'function', 'numericOutput'];
const plain = x => x && Object.prototype.toString.call(x) === '[object Object]';
function need(test, message) { if (!test) throw new Error('ローカル評価: ' + message); }
function only(value, fields) { need(plain(value) && Object.keys(value).every(key => fields.includes(key)), '形式を確認してください。'); }
function boundedText(value, limit = 200000) { need(typeof value === 'string' && value.length <= limit, '本文の長さを確認してください。'); return value; }
function safeId(value) { need(typeof value === 'string' && ID.test(value), '問題・版のIDを確認してください。'); return value; }
function clone(value) { return JSON.parse(JSON.stringify(value)); }
export function assessmentCanonical(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(assessmentCanonical).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + assessmentCanonical(value[key])).join(',') + '}';
}
function utf8(text) {
  const bytes = [];
  for (let i = 0; i < text.length; i++) {
    let cp = text.codePointAt(i); if (cp > 0xffff) i++; else if (cp >= 0xd800 && cp <= 0xdfff) cp = 0xfffd;
    if (cp < 0x80) bytes.push(cp);
    else if (cp < 0x800) bytes.push(0xc0 | cp >>> 6, 0x80 | cp & 63);
    else if (cp < 0x10000) bytes.push(0xe0 | cp >>> 12, 0x80 | cp >>> 6 & 63, 0x80 | cp & 63);
    else bytes.push(0xf0 | cp >>> 18, 0x80 | cp >>> 12 & 63, 0x80 | cp >>> 6 & 63, 0x80 | cp & 63);
  }
  return bytes;
}
// 同じ実装をGASにも生成する。substringの候補だけをSHA-256で照合し、秘密鍵は使わない。
export function assessmentCodeHash(text) {
  boundedText(text, 4000000);
  const bytes = utf8(text), bitLength = bytes.length * 8, K = [
    0x428a2f98,0x71374491,0xb5c0fbcf,0xe9b5dba5,0x3956c25b,0x59f111f1,0x923f82a4,0xab1c5ed5,
    0xd807aa98,0x12835b01,0x243185be,0x550c7dc3,0x72be5d74,0x80deb1fe,0x9bdc06a7,0xc19bf174,
    0xe49b69c1,0xefbe4786,0x0fc19dc6,0x240ca1cc,0x2de92c6f,0x4a7484aa,0x5cb0a9dc,0x76f988da,
    0x983e5152,0xa831c66d,0xb00327c8,0xbf597fc7,0xc6e00bf3,0xd5a79147,0x06ca6351,0x14292967,
    0x27b70a85,0x2e1b2138,0x4d2c6dfc,0x53380d13,0x650a7354,0x766a0abb,0x81c2c92e,0x92722c85,
    0xa2bfe8a1,0xa81a664b,0xc24b8b70,0xc76c51a3,0xd192e819,0xd6990624,0xf40e3585,0x106aa070,
    0x19a4c116,0x1e376c08,0x2748774c,0x34b0bcb5,0x391c0cb3,0x4ed8aa4a,0x5b9cca4f,0x682e6ff3,
    0x748f82ee,0x78a5636f,0x84c87814,0x8cc70208,0x90befffa,0xa4506ceb,0xbef9a3f7,0xc67178f2];
  const state = [0x6a09e667,0xbb67ae85,0x3c6ef372,0xa54ff53a,0x510e527f,0x9b05688c,0x1f83d9ab,0x5be0cd19];
  bytes.push(128); while (bytes.length % 64 !== 56) bytes.push(0);
  const high = Math.floor(bitLength / 4294967296), low = bitLength >>> 0;
  for (let i = 3; i >= 0; i--) bytes.push(high >>> (i * 8) & 255);
  for (let i = 3; i >= 0; i--) bytes.push(low >>> (i * 8) & 255);
  const rotate = (x, n) => x >>> n | x << (32 - n), w = Array(64);
  for (let offset = 0; offset < bytes.length; offset += 64) {
    for (let i = 0; i < 16; i++) w[i] = (bytes[offset+i*4] << 24 | bytes[offset+i*4+1] << 16 | bytes[offset+i*4+2] << 8 | bytes[offset+i*4+3]) >>> 0;
    for (let i = 16; i < 64; i++) {
      const a = w[i-15], b = w[i-2], s0 = rotate(a,7) ^ rotate(a,18) ^ a >>> 3, s1 = rotate(b,17) ^ rotate(b,19) ^ b >>> 10;
      w[i] = (w[i-16] + s0 + w[i-7] + s1) >>> 0;
    }
    let [a,b,c,d,e,f,g,h] = state;
    for (let i = 0; i < 64; i++) {
      const s1 = rotate(e,6) ^ rotate(e,11) ^ rotate(e,25), ch = e & f ^ ~e & g;
      const t1 = (h + s1 + ch + K[i] + w[i]) >>> 0, s0 = rotate(a,2) ^ rotate(a,13) ^ rotate(a,22), maj = a & b ^ a & c ^ b & c, t2 = (s0 + maj) >>> 0;
      h=g; g=f; f=e; e=(d+t1)>>>0; d=c; c=b; b=a; a=(t1+t2)>>>0;
    }
    for (const [i,value] of [a,b,c,d,e,f,g,h].entries()) state[i]=(state[i]+value)>>>0;
  }
  return state.map(value => value.toString(16).padStart(8,'0')).join('');
}
export function assessmentEvidenceHash(input) {
  need(plain(input) && plain(input.run), '実行記録を確認してください。');
  const value = { code: boundedText(input.code), stdin: boundedText(input.stdin ?? ''), run: clone(input.run), evidence: clone(input.evidence ?? null) };
  const text = assessmentCanonical(value); boundedText(text, 3000000); return assessmentCodeHash(text);
}
function filterHash(value) { let hash = 0; for (let i=0;i<value.length;i++) hash = (Math.imul(hash,257)+value.charCodeAt(i))>>>0; return hash; }
function fingerprint(kind, value) {
  const text = typeof value === 'string' ? value : assessmentCanonical(value);
  return { kind, digest: assessmentCodeHash(kind+'\0'+text), ...(SUBSTRINGS.includes(kind) ? { length: text.length, filter: filterHash(text) } : {}) };
}
function expressionForms(value) {
  const raw = H.normalizePowerNotation_(H.stripOuterParens_(value)), out = [['raw',raw],['quote',H.normalizeSimpleStringLiterals_(raw)]];
  if (!H.hasSimpleStringLiteral_(raw)) {
    const terms = H.splitTopLevel_(raw,'+');
    if (!H.hasTopLevelOperator_(raw,'-') && terms.length>1) out.push(['sum',terms.map(H.canonicalExpressionTerm_).sort()]);
    const factors = H.multiplicationFactorTerms_(raw); if (factors.length>1) out.push(['mul',factors]);
  }
  return out;
}
function expandedForms(value) {
  const out = expressionForms(value), terms = H.splitTopLevelAddSub_(value);
  if (terms.length>=2) out.push(['signed',terms.map(term=>term.sign+':'+H.canonicalProductTerm_(term.expr)).sort()]);
  return out;
}
function printForms(call) {
  if (!call.firstArg) return [];
  const raw = H.compactCodeOutsideStringLiterals_(call.firstArg), out = [['raw',H.normalizeSimpleStringLiterals_(raw)]];
  if (!H.hasSimpleStringLiteral_(raw)) out.push(['mul',H.multiplicationFactorTerms_(H.normalizePowerNotation_(H.stripOuterParens_(raw)))]);
  return out;
}
function endValue(call) { return call.endValue !== null ? ['value',call.endValue] : ['raw',H.normalizeSimpleStringLiterals_(call.endRaw)]; }
function functionForms(call) {
  const raw = H.compactCodeOutsideStringLiterals_(call.args[0]);
  const forms = [['quote',H.normalizeSimpleStringLiterals_(raw)], ...(H.isSimpleCommutativeFunctionArgument_(raw) ? expressionForms(raw).map(form=>['equivalent',form]) : [])];
  return forms.map(form=>[call.kind,call.name,call.receiver,call.args.length,form,call.args.slice(1).map(arg=>H.normalizeSimpleStringLiterals_(H.compactCodeOutsideStringLiterals_(arg)))]);
}
function comparisonForms(comparison) {
  const out=[];
  for(const left of expressionForms(comparison.left)) for(const right of expressionForms(comparison.right)) {
    const a=assessmentCanonical([left,comparison.op,right]), b=assessmentCanonical([right,H.reverseComparisonOp_(comparison.op),left]);out.push(a<b?a:b);
  }
  return out;
}
function add(features, kind, value) { features.push(fingerprint(kind,value)); }
function addLiteral(features, word) {
  const assignment=H.parseSimpleAssignment_(word);
  if(assignment) add(features,'assignmentExact',[assignment.lhs,assignment.op,H.normalizeExactAssignmentRhs_(assignment.rhs)]);
  else { if(H.hasKeywordWhitespace_(word)) add(features,'text',H.normalizeKeywordWhitespace_(word));
    if(!H.hasKeywordWhitespace_(word)||!H.hasSimpleStringLiteralWhitespace_(word)) add(features,'compact',H.compactKeywordText_(word)); }
}
function compileAtom(raw, target) {
  const word=H.normalizeKeywordWhitespace_(raw), features=[];
  need(word && !word.startsWith('re:'), '正規表現の非公開条件はこのローカル判定版に対応していません。');
  if(target==='output') {
    const compact=H.compactKeywordText_(word), numeric=compact.match(/^([A-Za-z_]\w*)=([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
    if(numeric)add(features,'numericOutput',[numeric[1],numeric[2]]);else add(features,'compact',compact);
  } else {
    const calls=H.extractPrintCallSignatures_(word), print=calls.length===1?calls[0]:null;
    if(print) for(const form of printForms(print)) add(features,print.hasEnd?'printEnd':'printAny',print.hasEnd?[form,endValue(print)]:form);
    if(!(print&&print.hasEnd)) {
      addLiteral(features,word);
      const variants=[...H.buildEquivalentKeywordVariants_(word),...H.buildAugmentedAssignmentVariants_(word),...H.buildReversedComparisonVariants_(word)];
      for(const variant of variants) { const value=variant.value??variant, assignment=H.parseSimpleAssignment_(value);
        if(assignment)add(features,'assignmentExact',[assignment.lhs,assignment.op,H.normalizeExactAssignmentRhs_(assignment.rhs)]); else add(features,'compact',H.compactKeywordText_(value)); }
      if(H.hasSimpleStringLiteral_(H.compactCodeOutsideStringLiterals_(word))) add(features,'quoted',H.normalizeSimpleStringLiterals_(H.compactCodeOutsideStringLiterals_(word)));
      const comparison=H.parseComparisonForOperandEquivalence_(word);if(comparison)for(const form of comparisonForms(comparison))add(features,'comparison',form);
      const boolean=H.canonicalLimitedBooleanCondition_(word);if(boolean)add(features,'boolean',boolean);
      for(const assignment of H.getEquivalentPlainAssignments_(word)) {
        for(const form of expressionForms(assignment.rhs))add(features,'assignmentCommutative',[assignment.lhs,form]);
        const forms=H.buildExpandedRhsForms_(assignment.rhs);if(forms.length>1)for(const candidate of forms)for(const form of expandedForms(candidate.value))add(features,'assignmentExpanded',[assignment.lhs,form]);
      }
      const functions=H.extractFunctionArgumentEquivalenceCalls_(word);if(functions.length===1)for(const form of functionForms(functions[0]))add(features,'function',form);
    }
  }
  return [...new Map(features.map(feature=>[assessmentCanonical(feature),feature])).values()];
}
function compileExpression(keyword,target) { return H.parseKeywordString(keyword).map(andBlocks=>andBlocks.map(orBlock=>orBlock.map(atom=>compileAtom(atom,target)))); }
function policyDigest(policy) { const copy={...policy};delete copy.policyHash;return assessmentCodeHash(assessmentCanonical(copy)); }
export function compileAssessment(snapshot) {
  need(plain(snapshot)&&snapshot.schema===1&&plain(snapshot.question)&&snapshot.question.kind==='code'&&snapshot.graded===true, 'この問題には既存のコード採点設定がありません。');
  const q=snapshot.question; safeId(q.questionId);safeId(q.version);safeId(snapshot.gradingVersion);
  need(Array.isArray(snapshot.ranges)&&snapshot.ranges.length>0&&snapshot.ranges.length<=30&&plain(snapshot.rules), '採点区間を確認してください。');
  const checks=[],ranges=[];
  for(const [index,range] of snapshot.ranges.entries()) {
    const rule=snapshot.rules[range.scoringId];need(rule&&rule.schemaVersion===2,'このローカル判定版はv2の既存テキスト基準だけに対応しています。');
    const regionId=safeId(range.regionId), lineId='r'+(index+1)+'-line';checks.push({id:lineId,kind:'line',points:1});const conditions=[];
    for(const [groupIndex,group] of H.groupPyRulesById_(rule.rules||[]).entries()) {
      const points=Math.max(...group.rows.map(row=>row.points));if(!(points>0))continue;
      need(group.ruleType==='match','得点付き構造条件はこのローカル判定版に対応していません。');
      const id='r'+(index+1)+'-c'+(groupIndex+1), target=group.target==='output'?'output':'code';checks.push({id,kind:target,points});
      conditions.push({id,target,steps:H.groupPyRuleRowsByStep_(group.rows).map(step=>({mode:step.stepMode,expressions:step.rows.map(row=>compileExpression(row.keyword,target))}))});
    }
    need(range.startMarker===null||typeof range.startMarker==='string'&&range.startMarker.length>0&&range.startMarker.length<=300,'開始マーカーを確認してください。');
    need(range.endMarker===null||typeof range.endMarker==='string'&&range.endMarker.length>0&&range.endMarker.length<=300,'終了マーカーを確認してください。');
    ranges.push({regionId,startMarker:range.startMarker,endMarker:range.endMarker,minLines:Number(rule.minLines)||1,lineId,conditions});
  }
  const policy={schema:1,engineVersion:LOCAL_ASSESSMENT_ENGINE,rubricVersion:snapshot.gradingVersion,questionId:q.questionId,version:q.version,kind:'code',checks,ranges};
  policy.policyHash=policyDigest(policy);return validateAssessmentPolicy(policy);
}
function validateFeatures(raw) {
  need(Array.isArray(raw)&&raw.length<=1000,'照合条件の件数を確認してください。');
  return raw.map(feature=>{only(feature,['kind','digest','length','filter']);need(FEATURES.includes(feature.kind)&&HASH.test(feature.digest),'照合条件を確認してください。');
    if(SUBSTRINGS.includes(feature.kind))need(Number.isInteger(feature.length)&&feature.length>0&&feature.length<=400000&&Number.isInteger(feature.filter)&&feature.filter>=0&&feature.filter<=4294967295,'文字列条件を確認してください。');
    else need(feature.length===undefined&&feature.filter===undefined,'照合条件の形式を確認してください。');return clone(feature);});
}
function validateExpression(raw) {
  need(Array.isArray(raw)&&raw.length<=100,'照合式を確認してください。');
  return raw.map(block=>{need(Array.isArray(block)&&block.length<=100,'照合式を確認してください。');return block.map(or=>{need(Array.isArray(or)&&or.length<=100,'照合式を確認してください。');return or.map(validateFeatures);});});
}
export function validateAssessmentPolicy(raw) {
  only(raw,['schema','engineVersion','rubricVersion','policyHash','questionId','version','kind','checks','ranges']);
  need(raw.schema===1&&raw.engineVersion===LOCAL_ASSESSMENT_ENGINE&&raw.kind==='code'&&HASH.test(raw.policyHash),'判定版を確認してください。');
  safeId(raw.questionId);safeId(raw.version);safeId(raw.rubricVersion);
  need(Array.isArray(raw.checks)&&raw.checks.length>0&&raw.checks.length<=2000&&Array.isArray(raw.ranges)&&raw.ranges.length>0&&raw.ranges.length<=30,'評価項目を確認してください。');
  const seen=new Set(), checks=raw.checks.map(check=>{only(check,['id','kind','points']);safeId(check.id);need(!seen.has(check.id)&&['line','code','output'].includes(check.kind)&&Number.isFinite(check.points)&&check.points>0&&check.points<=1000,'配点を確認してください。');seen.add(check.id);return clone(check);});
  const used=new Set(), regionIds=new Set(), ranges=raw.ranges.map(range=>{
    only(range,['regionId','startMarker','endMarker','minLines','lineId','conditions']);safeId(range.regionId);need(!regionIds.has(range.regionId),'区間が重複しています。');regionIds.add(range.regionId);
    for(const marker of [range.startMarker,range.endMarker])need(marker===null||typeof marker==='string'&&marker.length>0&&marker.length<=300,'採点マーカーを確認してください。');
    need(Number.isInteger(range.minLines)&&range.minLines>=1&&range.minLines<=200000&&Array.isArray(range.conditions)&&range.conditions.length<=2000,'区間条件を確認してください。');
    const line=checks.find(check=>check.id===range.lineId);need(line&&line.kind==='line'&&line.points===1&&!used.has(line.id),'行数項目を確認してください。');used.add(line.id);
    const conditions=range.conditions.map(condition=>{only(condition,['id','target','steps']);const check=checks.find(check=>check.id===condition.id);need(check&&check.kind===condition.target&&check.kind!=='line'&&!used.has(check.id),'照合対象を確認してください。');used.add(check.id);
      need(Array.isArray(condition.steps)&&condition.steps.length>0&&condition.steps.length<=100,'確認段階を確認してください。');
      return {id:condition.id,target:condition.target,steps:condition.steps.map(step=>{only(step,['mode','expressions']);need(['single','any','all'].includes(step.mode)&&Array.isArray(step.expressions)&&step.expressions.length>0&&step.expressions.length<=100,'確認段階の条件を確認してください。');return {mode:step.mode,expressions:step.expressions.map(validateExpression)};})};});
    return {regionId:range.regionId,startMarker:range.startMarker,endMarker:range.endMarker,minLines:range.minLines,lineId:range.lineId,conditions};
  });
  need(used.size===checks.length&&checks.reduce((sum,check)=>sum+check.points,0)<=100000,'評価項目の対応を確認してください。');
  const policy={schema:1,engineVersion:raw.engineVersion,rubricVersion:raw.rubricVersion,policyHash:raw.policyHash,questionId:raw.questionId,version:raw.version,kind:'code',checks,ranges};
  need(policyDigest(policy)===raw.policyHash,'判定設定のhashが一致しません。');return policy;
}
function allFeatures(conditions) { return conditions.flatMap(c=>c.steps.flatMap(s=>s.expressions.flatMap(e=>e.flatMap(a=>a.flatMap(o=>o.flatMap(f=>f)))))); }
function assignments(source) { return H.normalizeKeywordText_(source).split(/[\r\n;]+/).flatMap(line=>line.split(':')).map(H.stripPythonCommentChunk_).map(H.parseSimpleAssignment_).filter(Boolean); }
function featureCandidates(kind,source) {
  const out=[];
  if(kind==='assignmentExact')for(const a of assignments(source))out.push([a.lhs,a.op,H.normalizeExactAssignmentRhs_(a.rhs)]);
  else if(kind==='assignmentCommutative')for(const a of assignments(source).filter(a=>a.op==='='))for(const form of expressionForms(a.rhs))out.push([a.lhs,form]);
  else if(kind==='assignmentExpanded')for(const a of assignments(source).filter(a=>a.op==='='))for(const candidate of H.buildExpandedRhsForms_(a.rhs))for(const form of expandedForms(candidate.value))out.push([a.lhs,form]);
  else if(kind==='comparison')for(const candidate of H.extractConditionExpressionCandidates_(source)){const c=H.parseComparisonForOperandEquivalence_(candidate);if(c)out.push(...comparisonForms(c));}
  else if(kind==='boolean')for(const candidate of H.extractConditionExpressionCandidates_(source)){const c=H.canonicalLimitedBooleanCondition_(candidate);if(c)out.push(c);}
  else if(kind==='printAny'||kind==='printEnd')for(const call of H.extractPrintCallSignatures_(source))for(const form of printForms(call)){if(kind==='printAny')out.push(form);else if(call.hasEnd)out.push([form,endValue(call)]);}
  else if(kind==='function')for(const call of H.extractFunctionArgumentEquivalenceCalls_(source))out.push(...functionForms(call));
  else if(kind==='numericOutput') {const pattern=/(?:^|[^A-Za-z0-9_])([A-Za-z_]\w*)\s*=\s*([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)(?![A-Za-z0-9_.])/g;let match;while((match=pattern.exec(H.normalizeKeywordWhitespace_(source))))out.push([match[1],match[2]]);}
  return out;
}
function matcher(source,features) {
  const cache=new Map(), groups=new Map();
  for(const f of features.filter(f=>SUBSTRINGS.includes(f.kind))){const key=f.kind+'/'+f.length;if(!groups.has(key))groups.set(key,new Set());groups.get(key).add(f.filter);}
  return feature=>{
    if(SUBSTRINGS.includes(feature.kind)) {
      const key=feature.kind+'/'+feature.length;
      if(!cache.has(key)) {
        const text=feature.kind==='text'?H.normalizeKeywordWhitespace_(source):feature.kind==='compact'?H.compactKeywordText_(source):H.normalizeSimpleStringLiterals_(H.compactCodeOutsideStringLiterals_(source));
        const length=feature.length,filters=groups.get(key),digests=new Set();let rolling=0,power=1;
        if(length<=text.length){for(let i=0;i<length;i++){rolling=(Math.imul(rolling,257)+text.charCodeAt(i))>>>0;if(i<length-1)power=Math.imul(power,257)>>>0;}
          for(let i=0;i<=text.length-length;i++){if(filters.has(rolling))digests.add(assessmentCodeHash(feature.kind+'\0'+text.slice(i,i+length)));
            if(i<text.length-length)rolling=(Math.imul((rolling-Math.imul(text.charCodeAt(i),power))>>>0,257)+text.charCodeAt(i+length))>>>0;}}
        cache.set(key,digests);
      }
      return cache.get(key).has(feature.digest);
    }
    if(!cache.has(feature.kind))cache.set(feature.kind,new Set(featureCandidates(feature.kind,source).map(value=>fingerprint(feature.kind,value).digest)));
    return cache.get(feature.kind).has(feature.digest);
  };
}
function expressionPass(expression,hit){return expression.some(andBlocks=>andBlocks.every(orBlock=>orBlock.some(features=>features.some(hit))));}
function conditionPass(condition,hit){return condition.steps.every(step=>{const values=step.expressions.map(expression=>expressionPass(expression,hit));return step.mode==='any'?values.some(Boolean):step.mode==='all'?values.every(Boolean):values.length===1&&values[0];});}
function extractRanges(code,ranges) {
  const lines=code.replace(/\r\n?/g,'\n').split('\n'),used=[],out=[];
  for(const range of ranges){let start=0,end=lines.length;
    if(range.startMarker!==null){const positions=lines.flatMap((line,i)=>line.trim()===range.startMarker.trim()?[i]:[]);need(positions.length===1,'markers_invalid');start=positions[0]+1;}
    if(range.endMarker!==null){const positions=lines.flatMap((line,i)=>line.trim()===range.endMarker.trim()?[i]:[]);need(positions.length===1,'markers_invalid');end=positions[0];}
    need(start<=end&&!used.some(previous=>start<previous.end&&end>previous.start),'markers_invalid');used.push({start,end});out.push(lines.slice(start,end).join('\n'));}
  return out;
}
export function evaluateAssessment(rawPolicy,input) {
  const policy=validateAssessmentPolicy(rawPolicy);need(plain(input)&&plain(input.run),'実行記録を確認してください。');
  const code=boundedText(input.code),codeHash=assessmentCodeHash(code),run=input.run;
  need(['success','error','stopped','not_run','environment_error'].includes(run.outcome)&&typeof run.truncated==='boolean','実行状態を確認してください。');boundedText(run.outputText??'',100000);
  const usable=['success','error'].includes(run.outcome)&&!run.truncated&&run.codeHash===codeHash, diagnostics=[], statuses=new Map();let parts;
  try{parts=extractRanges(code,policy.ranges);}catch(error){if(!error.message.endsWith('markers_invalid'))throw error;diagnostics.push('markers_invalid');}
  if(!usable)diagnostics.push(run.codeHash&&run.codeHash!==codeHash?'stale_output':'output_unavailable');
  for(const [index,range] of policy.ranges.entries()) {
    const source=parts?.[index]??'',random=/\bimport\s+random\b|\brandom\./i.test(source),output=usable?run.outputText??'':'';
    statuses.set(range.lineId,{passed:!!parts&&source.split('\n').filter(line=>line.trim()).length>=range.minLines,eligible:true});
    const codeConditions=range.conditions.filter(c=>c.target==='code'),outputConditions=range.conditions.filter(c=>c.target==='output');
    const codeHit=matcher(source,allFeatures(codeConditions)),outputHit=matcher(H.normalizeKeywordWhitespace_(output),allFeatures(outputConditions));
    for(const condition of range.conditions){const eligible=!(condition.target==='output'&&random);statuses.set(condition.id,{passed:eligible?!!parts&&conditionPass(condition,condition.target==='output'?outputHit:codeHit):null,eligible});}
  }
  const checks=policy.checks.map(check=>({id:check.id,passed:statuses.get(check.id).passed,points:check.points,eligible:statuses.get(check.id).eligible}));
  const total=checks.reduce((sum,check)=>sum+(check.eligible?check.points:0),0),earned=checks.reduce((sum,check)=>sum+(check.eligible&&check.passed?check.points:0),0);
  const stars=policy.checks.filter(check=>check.kind==='code'),starEarned=stars.filter(check=>statuses.get(check.id).passed).length;
  return {schema:1,engineVersion:policy.engineVersion,rubricVersion:policy.rubricVersion,policyHash:policy.policyHash,questionId:policy.questionId,version:policy.version,
    codeHash,evidenceHash:assessmentEvidenceHash(input),score:total?earned/total:0,earned,total,checks,diagnostics,starEarned,starTotal:stars.length};
}
