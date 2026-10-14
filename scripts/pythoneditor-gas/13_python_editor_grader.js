// 固定された判定エンジン。旧版に影響するため、この版を上書き更新しない。
// 原本SHA-256: {"02_check_common.js":"9a3b3bf7d9edcea4e15b401a6e475bc36fb72627bab521d3dafd68deb0557fb6","10_py_check.js":"4e0a456b2706335171c232221081004be603028478ca14089002c74abb27efec","12_formula_equivalence.js":"73d16e7e1c2e38c9efd0082ef9457bd988c6d4fed50a7524f7b86c63ef5dad86","15_py_rule_engine.js":"ea95467a5f9a61f7a7ce14e0acfc7c6acbbd112e447955d641d9ef001aa8c510"}
var PythonEditorGraderV1 = (function () {
// 02_check_common.js: 確認済み純粋関数
function parseKeywordString(str){
  if (!str) return [];

  return str.split('||').map(v => v.trim()).filter(Boolean)        // 外側 OR
            .map(v =>
              v.split('&').map(b => b.trim()).filter(Boolean)      // 中間 AND
               .map(b => b.split('|').map(w => w.trim())
                           .filter(Boolean))                       // 内側 OR
            );
}

function normalizeKeywordText_(s){
  return String(s ?? '')
    .normalize('NFKC')
    .replace(/\u00A0/g, ' ')
    .replace(/\u3000/g, ' ');
}

function normalizeKeywordWhitespace_(s){
  return normalizeKeywordText_(s)
    .replace(/[\r\n\t]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function compactKeywordText_(s){
  return normalizeKeywordText_(s).replace(/[\s\u00A0\u3000]+/g, '');
}

function hasKeywordWhitespace_(s){
  return /[\s\u00A0\u3000]/.test(s);
}

function escapeRegExpLiteral_(s){
  return String(s).replace(/[\\^$.*+?()[\]{}|]/g, '\\$&');
}

// 10_py_check.js: 確認済み純粋関数
function evaluatePyQuestionRule_(questionId, rule, entry){
  const stuC = entry?.cell || null;
  const title = rule.title || (entry?.title || '');
  const codeSrc = stuC ? (stuC.source || []) : [];
  const codeBody = codeSrc.join('');
  const outputStr = joinOutputsSafe(stuC);
  const rawCodeLines = stuC ? (stuC.whole || codeSrc) : [];
  const rawOutput = (stuC?.outputs && stuC.outputs[0]?.text) || null;
  const lineCount = codeBody.split('\n').filter(line => line.trim()).length;
  const minLinesRequired = rule.minLines || 1;
  const codeOk = lineCount >= minLinesRequired;
  const execOk = !!(stuC && stuC.execution_count !== null);
  const randomRe = /\bimport\s+random\b|\brandom\./i;
  const usesRandom = randomRe.test(codeSrc.join(''));

  if (rule.schemaVersion === 2) {
    const ruleChecks = evaluatePyRuleGroups_(rule.rules || [], {
      codeBody,
      outputText: normalizeOutput(outputStr),
      usesRandom,
    });
    const codeRuleChecks = ruleChecks.filter(check =>
      check.target === 'code' && isPyScoredRuleCheck_(check)
    );
    const outputRuleChecks = ruleChecks.filter(check =>
      check.target === 'output' && isPyScoredRuleCheck_(check)
    );

    return {
      id: questionId,
      title,
      codeOk,
      execOk,
      outOk: usesRandom || outputRuleChecks.length === 0
        ? null
        : outputRuleChecks.every(check => check.passed),
      outKwHits: buildPyRuleHitMap_(outputRuleChecks),
      kwHits: buildPyRuleHitMap_(codeRuleChecks),
      ruleChecks,
      scoreModel: 'rulesV2',
      codeBody,
      lineCount,
      minLinesRequired,
      outputText: outputStr,
      code: rawCodeLines,
      output: rawOutput,
    };
  }

  let outOk = null;
  const outKwHits = {};
  if (!usesRandom) {
    const studentOut = normalizeOutput(outputStr);
    if (rule.outKeywordsArr && rule.outKeywordsArr.length > 0) {
      outOk = false;
      rule.outKeywordsArr.forEach(ruleStr => {
        const variants = parseKeywordString(ruleStr);
        const ok = variants.some(andBlocks =>
          andBlocks.every(orBlock =>
            orBlock.some(keyword => outputWordHit_(studentOut, keyword))
          )
        );
        outKwHits[ruleStr] = ok;
        if (ok) outOk = true;
      });
    }
  }

  const kwHits = {};
  (rule.keywordsArr || []).forEach(ruleStr => {
    const variants = parseKeywordString(ruleStr);
    kwHits[ruleStr] = variants.some(blocks =>
      blocks.every(words =>
        words.some(keyword => wordHit(codeBody, keyword))
      )
    );
  });

  return {
    id: questionId,
    title,
    codeOk,
    execOk,
    outOk,
    outKwHits,
    kwHits,
    codeBody,
    lineCount,
    minLinesRequired,
    outputText: outputStr,
    code: rawCodeLines,
    output: rawOutput,
  };
}

function isPyScoredRuleCheck_(check){
  return !!(check && check.eligible && Number(check.points || 0) > 0);
}

function buildPyRuleHitMap_(checks){
  const hits = {};
  (checks || []).forEach(check => {
    let label = String(check.label || check.ruleId || 'rule');
    let suffix = 2;
    while (Object.prototype.hasOwnProperty.call(hits, label)) {
      label = `${check.label || check.ruleId || 'rule'} (${suffix})`;
      suffix++;
    }
    hits[label] = !!check.passed;
  });
  return hits;
}

function normalizeOutput(str){
  if (!str) return '';
  return normalizeKeywordWhitespace_(str);
}

function loadScoringRulesFromValues_(rows){
  if (!rows || rows.length < 2) return {};

  const data = rows.map(row => row.slice());
  const header = data.shift().map(h => String(h || '').trim());
  const col    = {};                                   // 列名 → idx
  header.forEach((h,i)=> col[h.toLowerCase()] = i);

  if (col['ruleid'] !== undefined) {
    return loadScoringRulesV2FromRows_(data, col);
  }

  const kwCols = header
    .map((h,i)=> h.toLowerCase().startsWith('keywords') ? i : -1)
    .filter(i => i !== -1);


  // outKeywords列
  const outKwCols = header
    .map((h,i)=> h.toLowerCase().startsWith('outkeywords') ? i : -1)
    .filter(i => i !== -1);


  const map = {};
  data.forEach(r=>{
    const qid = r[col['questionid']];
    if (!qid) return;

    const keywordsArr = kwCols
      .map(i => (r[i] || '').toString().trim())
      .filter(Boolean);

    // keywords
    const outKeywordsArr = outKwCols
      .map(i => (r[i] || '').toString().trim())
      .filter(Boolean);

    map[qid] = {
      schemaVersion: 1,
      keywordsArr,
      outKeywordsArr,
      minLines   : Number(r[col['minlines']]   || 0),
      expectOut  : (r[col['output']]           || '').toString().trim(),
      title      : (r[col['questiontitle']]    || '').toString().trim()
    };
  });

  return map;      // { qid:{keywordsArr,minLines,expectOut,title}, … }
}

function loadScoringRulesV2FromRows_(rows, col){
  const map = {};

  (rows || []).forEach((row, index) => {
    const qid = getPyRuleCell_(row, col, 'questionid');
    if (!qid) return;
    if (!map[qid]) {
      map[qid] = {
        schemaVersion: 2,
        keywordsArr: [],
        outKeywordsArr: [],
        minLines: 0,
        expectOut: '',
        title: '',
        rules: [],
      };
    }

    const question = map[qid];
    const title = getPyRuleCell_(row, col, 'questiontitle');
    const minLines = getPyRuleCell_(row, col, 'minlines');
    const expectOut = getPyRuleCell_(row, col, 'output');
    if (!question.title && title !== '') question.title = String(title).trim();
    if (!question.minLines && minLines !== '') question.minLines = Number(minLines || 0);
    if (!question.expectOut && expectOut !== '') question.expectOut = String(expectOut);

    const keyword = String(getPyRuleCell_(row, col, 'keyword') || '').trim();
    if (!keyword) return;
    const enabled = normalizePyRuleEnabled_(
      getPyRuleCell_(row, col, 'enabled')
    );
    question.rules.push({
      ruleId: String(getPyRuleCell_(row, col, 'ruleid') || `rule-${index + 2}`).trim(),
      target: normalizePyRuleTarget_(getPyRuleCell_(row, col, 'target')),
      ruleType: normalizePyRuleType_(getPyRuleCell_(row, col, 'ruletype')),
      stepNo: normalizePyRuleStepNo_(getPyRuleCell_(row, col, 'stepno')),
      stepMode: normalizePyRuleStepMode_(getPyRuleCell_(row, col, 'stepmode')),
      keyword,
      points: normalizePyRulePoints_(getPyRuleCell_(row, col, 'points')),
      enabled,
      note: String(getPyRuleCell_(row, col, 'note') || '').trim(),
      rowNumber: index + 2,
    });
  });

  return map;
}

function getPyRuleCell_(row, col, key){
  const index = col[key];
  return index === undefined ? '' : row[index];
}

function normalizePyRuleEnabled_(value){
  if (value === false || value === 0) return false;
  const normalized = String(value === null || value === undefined ? '' : value)
    .trim()
    .toLowerCase();
  return ['false', '0', 'off', 'no', 'disabled'].indexOf(normalized) === -1;
}

function wordHit(body, raw){
  const bodyText = normalizeKeywordWhitespace_(body);
  const word = normalizeKeywordWhitespace_(raw);
  if (!word) return false;

  /* --- 1. 正規表現プレフィックス ------------------------------ */
  if (word.startsWith('re:')){
    try{
      return new RegExp(word.slice(3), 's').test(normalizeKeywordText_(body));  // dotAll
    }catch(e){
      console.error('RegExp error:', word, e);
      return false;
    }
  }

  return matchKeywordWithEquivalence_(bodyText, word, body);
}

function outputWordHit_(body, raw){
  const word = normalizeKeywordWhitespace_(raw);
  if (!word) return false;
  // re: の明示指定だけは従来の正規表現処理を維持する。
  if (word.startsWith('re:')) return wordHit(body, word);

  const bodyText = normalizeKeywordWhitespace_(body);
  const wordCompact = compactKeywordText_(word);
  // a=7 等の数値ラベルは、aa=7・a=70・a=7.5 等を部分一致させない。
  const numericLabel = wordCompact.match(/^([A-Za-z_]\w*)=([+-]?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?)$/);
  if (numericLabel) {
    const pattern = '(?:^|[^A-Za-z0-9_])' +
      escapeRegExpLiteral_(numericLabel[1]) + '\\s*=\\s*' +
      escapeRegExpLiteral_(numericLabel[2]) + '(?![A-Za-z0-9_.])';
    return new RegExp(pattern).test(bodyText);
  }

  return compactKeywordText_(bodyText).includes(wordCompact);
}

function joinOutputsSafe(cell) {
  const outs = cell?.outputs || [];
  return outs.map(o => {
    // stream: o.text, execute_result/display_data: o.data['text/plain']
    const t = (o.text != null) ? o.text
            : (o.data && o.data['text/plain']) || '';
    if (Array.isArray(t)) return t.join('');
    if (typeof t === 'string') return t;
    return '';
  }).join('').trim();
}

function calcScoreFromItems(items){
  if (!Array.isArray(items) || items.length === 0) {
    return null;
  }

  let trueCount  = 0;
  let totalCount = 0;

  items.forEach(it => {
    if (it.scoreModel === 'rulesV2') {
      if (typeof it.codeOk === 'boolean') {
        totalCount++;
        if (it.codeOk) trueCount++;
      }
      (it.ruleChecks || []).forEach(check => {
        if (!check.eligible) return;
        const points = Number(check.points || 0);
        if (!(points > 0)) return;
        totalCount += points;
        if (check.passed) trueCount += points;
      });
      return;
    }

    // execOkも採点に含める場合は ['codeOk','execOk','outOk']
    ['codeOk','outOk'].forEach(k => {
      if (typeof it[k] === 'boolean') {
        totalCount++;
        if (it[k]) trueCount++;
      }
    });

    if (it.kwHits){
      Object.values(it.kwHits).forEach(v => {
        totalCount++;
        if (v) trueCount++;
      });
    }
  });

  if (totalCount === 0) {
    return null;
  }

  return trueCount / totalCount;  // 0〜1
}

// 12_formula_equivalence.js: 確認済み純粋関数
function matchKeywordWithEquivalence_(bodyText, word, originalBody){
  const equivalenceBody = arguments.length >= 3 ? originalBody : bodyText;
  const structuredPrint = matchStructuredPrintKeyword_(equivalenceBody, word);
  if (structuredPrint.handled) return structuredPrint.matched;

  if (matchLiteralKeyword_(bodyText, word)) return true;

  return matchEquivalentKeyword_(equivalenceBody, word);
}

function matchLiteralKeyword_(bodyText, word){
  const assignment = parseSimpleAssignment_(word);
  if (assignment) {
    return matchExactSimpleAssignmentInBody_(bodyText, assignment);
  }

  const bodyCompact = compactKeywordText_(bodyText);
  const wordCompact = compactKeywordText_(word);
  if (!wordCompact) return false;

  /* --- 2. キーワードに空白がある場合は空白ゆれを許容 ---------- */
  if (hasKeywordWhitespace_(word)) {
    const pattern = word.split(/[\s\u00A0\u3000]+/)
      .filter(Boolean)
      .map(escapeRegExpLiteral_)
      .join('[\\s\\u00A0\\u3000]+');

    if (pattern && new RegExp(pattern, 's').test(bodyText)) {
      return true;
    }

    // print (x) と print(x) のような空白差も拾う。
    if (hasSimpleStringLiteralWhitespace_(word)) return false;
    return bodyCompact.includes(wordCompact);
  }

  /* --- 3. 空白を含まない語 → 記号も含めてリテラル比較 -------- */
  return bodyCompact.includes(wordCompact);
}

function matchEquivalentKeyword_(bodyText, word){
  return matchEquivalentKeywordDetail_(bodyText, word).matched;
}

function matchEquivalentKeywordDetail_(bodyText, word){
  const normalizedWord = normalizeKeywordWhitespace_(word);
  if (!normalizedWord || normalizedWord.startsWith('re:')) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const directVariants = buildEquivalentKeywordVariants_(normalizedWord);
  const directMatch = matchKeywordVariantsInBody_(bodyText, directVariants);
  if (directMatch.matched) {
    return {
      matched: true,
      rule: directMatch.rule || 'keywordVariant',
      matchedVariant: directMatch.matchedVariant
    };
  }

  const matchers = [
    { rule: 'augmentedAssignment', fn: matchAugmentedAssignment_ },
    { rule: 'reversedComparison', fn: matchReversedComparison_ },
    { rule: 'comparisonOperandEquivalent', fn: matchEquivalentComparisonOperands_ },
    { rule: 'stringLiteralQuote', fn: matchSimpleStringLiteralQuote_ },
    { rule: 'printMultiplication', fn: matchPrintMultiplicationOrder_ },
    { rule: 'functionArgumentEquivalent', fn: matchFunctionArgumentEquivalent_ },
    { rule: 'limitedDeMorgan', fn: matchLimitedDeMorgan_ },
    { rule: 'commutativeAssignment', fn: matchCommutativeAssignment_ },
    { rule: 'distributiveAssignment', fn: matchDistributiveAssignment_ }
  ];

  for (const matcher of matchers) {
    const result = matcher.fn(bodyText, normalizedWord);
    if (result === true) {
      return { matched: true, rule: matcher.rule, matchedVariant: '' };
    }
    if (result && result.matched) {
      return {
        matched: true,
        rule: result.rule || matcher.rule,
        matchedVariant: result.matchedVariant || ''
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function buildEquivalentKeywordVariants_(word){
  const variants = [];
  addUniqueKeywordVariant_(variants, normalizePowerNotation_(word), word, 'powerNotation');
  addUniqueKeywordVariant_(variants, expandIntegerPowerNotation_(word), word, 'integerPower');

  buildAugmentedAssignmentVariants_(word).forEach(v =>
    addUniqueKeywordVariant_(variants, v, word, 'augmentedAssignment')
  );

  buildReversedComparisonVariants_(word).forEach(v =>
    addUniqueKeywordVariant_(variants, v, word, 'reversedComparison')
  );

  buildAssignmentOuterParenVariants_(word).forEach(v =>
    addUniqueKeywordVariant_(variants, v, word, 'rhsOuterParens')
  );

  buildDistributiveAssignmentVariants_(word).forEach(v =>
    addUniqueKeywordVariant_(variants, v, word, 'distributiveAssignment')
  );

  return variants;
}

function addUniqueKeywordVariant_(variants, variant, original, rule){
  const compactVariant = compactKeywordText_(variant);
  if (!compactVariant || compactVariant === compactKeywordText_(original)) return;
  if (variants.some(v => compactKeywordText_(v.value) === compactVariant)) return;
  variants.push({ value: variant, rule });
}

function matchKeywordVariantsInBody_(bodyText, variants){
  const bodyCompact = compactKeywordText_(normalizeKeywordWhitespace_(bodyText));

  for (const variant of variants) {
    const value = variant && variant.value !== undefined ? variant.value : variant;
    const assignment = parseSimpleAssignment_(value);
    if (assignment && matchExactSimpleAssignmentInBody_(bodyText, assignment)) {
      return {
        matched: true,
        rule: variant.rule || 'keywordVariant',
        matchedVariant: value
      };
    }

    const compactVariant = compactKeywordText_(value);
    if (!assignment && compactVariant && bodyCompact.includes(compactVariant)) {
      return {
        matched: true,
        rule: variant.rule || 'keywordVariant',
        matchedVariant: value
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function matchAugmentedAssignment_(bodyText, word){
  return matchKeywordVariantsInBody_(bodyText, buildAugmentedAssignmentVariants_(word));
}

function buildAugmentedAssignmentVariants_(word){
  const variants = [];
  const assignment = parseSimpleAssignment_(word);
  if (!assignment || !/^[A-Za-z_]\w*$/.test(assignment.lhs)) return variants;

  const lhs = assignment.lhs;
  const rhs = stripOuterParens_(assignment.rhs);

  if (assignment.op === '=') {
    [
      { op: '+', assignOp: '+=' },
      { op: '-', assignOp: '-=' },
      { op: '*', assignOp: '*=' }
    ].forEach(rule => {
      const parts = splitTopLevel_(rhs, rule.op);
      if (parts.length !== 2) return;
      if (parts[0] !== lhs) return;
      variants.push({ value: `${lhs}${rule.assignOp}${parts[1]}`, rule: 'augmentedAssignment' });
    });
  } else if (assignment.op === '+=') {
    variants.push({ value: `${lhs}=${lhs}+${rhs}`, rule: 'augmentedAssignment' });
  } else if (assignment.op === '-=') {
    variants.push({ value: `${lhs}=${lhs}-${rhs}`, rule: 'augmentedAssignment' });
  } else if (assignment.op === '*=') {
    variants.push({ value: `${lhs}=${lhs}*${rhs}`, rule: 'augmentedAssignment' });
  }

  return variants;
}

function matchReversedComparison_(bodyText, word){
  return matchKeywordVariantsInBody_(bodyText, buildReversedComparisonVariants_(word));
}

function buildReversedComparisonVariants_(word){
  const parsed = parseComparisonKeywordExpression_(word);
  if (!parsed) return [];

  const comparison = parsed.comparison;

  const reverseOps = {
    '<': '>',
    '<=': '>=',
    '>': '<',
    '>=': '<=',
    '==': '==',
    '!=': '!='
  };

  const reversed = `${comparison.right}${reverseOps[comparison.op]}${comparison.left}`;
  const variants = [{
    value: `${parsed.prefix}${reversed}${parsed.suffix}`,
    rule: 'reversedComparison'
  }];

  if (parsed.prefix && parsed.suffix) {
    variants.push({
      value: `${parsed.prefix}${reversed}`,
      rule: 'reversedComparison'
    });
  }

  return variants;
}

function parseComparisonKeywordExpression_(expr){
  const condition = extractIfConditionExpression_(expr) || compactKeywordText_(expr);
  const comparison = parseSimpleComparison_(condition.value);
  if (!comparison) return null;

  return {
    comparison,
    prefix: condition.prefix,
    suffix: condition.suffix
  };
}

function extractIfConditionExpression_(expr){
  let s = compactKeywordText_(normalizeKeywordWhitespace_(expr));
  const controlPrefixes = ['elif', 'while', 'if'];
  const prefix = controlPrefixes.find(p => s.startsWith(p) && s.length > p.length);

  if (!prefix) {
    return { value: s, prefix: '', suffix: '' };
  }

  let suffix = '';
  let condition = s.slice(prefix.length);
  if (condition.endsWith(':')) {
    suffix = ':';
    condition = condition.slice(0, -1);
  }

  if (!condition) return null;

  return {
    value: condition,
    prefix,
    suffix
  };
}

function matchEquivalentComparisonOperands_(bodyText, word){
  const keywordComparison = parseComparisonForOperandEquivalence_(word);
  if (!keywordComparison) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const candidates = extractConditionExpressionCandidates_(bodyText);
  for (const candidate of candidates) {
    const bodyComparison = parseComparisonForOperandEquivalence_(candidate);
    if (!bodyComparison) continue;

    if (sameComparisonExpression_(bodyComparison, keywordComparison)) {
      return {
        matched: true,
        rule: 'comparisonOperandEquivalent',
        matchedVariant: candidate
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function parseComparisonForOperandEquivalence_(expr){
  const condition = extractIfConditionExpression_(expr);
  const s = condition ? condition.value : compactCodeOutsideStringLiterals_(expr);
  const comparison = splitComparisonForOperandEquivalence_(s);
  if (!comparison) return null;
  if (!isComparableOperandForEquivalence_(comparison.left) ||
      !isComparableOperandForEquivalence_(comparison.right)) {
    return null;
  }
  return comparison;
}

function splitComparisonForOperandEquivalence_(expr){
  const s = compactCodeOutsideStringLiterals_(expr);
  const ops = ['<=', '>=', '==', '!=', '<', '>'];
  const found = [];
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0) continue;

    for (const op of ops) {
      if (s.slice(i, i + op.length) === op) {
        found.push({ index: i, op });
        i += op.length - 1;
        break;
      }
    }
  }

  if (found.length !== 1) return null;

  const hit = found[0];
  const left = s.slice(0, hit.index);
  const right = s.slice(hit.index + hit.op.length);
  if (!left || !right) return null;

  return { left, op: hit.op, right };
}

function sameComparisonExpression_(bodyComparison, keywordComparison){
  if (bodyComparison.op === keywordComparison.op &&
      sameComparisonOperandExpression_(bodyComparison.left, keywordComparison.left) &&
      sameComparisonOperandExpression_(bodyComparison.right, keywordComparison.right)) {
    return true;
  }

  const reversedOp = reverseComparisonOp_(keywordComparison.op);
  return bodyComparison.op === reversedOp &&
    sameComparisonOperandExpression_(bodyComparison.left, keywordComparison.right) &&
    sameComparisonOperandExpression_(bodyComparison.right, keywordComparison.left);
}

function sameComparisonOperandExpression_(bodyOperand, keywordOperand){
  return sameCommutativeExpression_(bodyOperand, keywordOperand);
}

function isComparableOperandForEquivalence_(expr){
  const s = compactCodeOutsideStringLiterals_(expr);
  if (!s || /[{}]/.test(s)) return false;
  if (hasTopLevelComparisonOperator_(s)) return false;
  return true;
}

function hasTopLevelComparisonOperator_(expr){
  return !!splitComparisonForOperandEquivalence_(expr);
}

function matchSimpleStringLiteralQuote_(bodyText, word){
  const wordCompact = compactCodeOutsideStringLiterals_(word);
  if (!hasSimpleStringLiteral_(wordCompact)) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const canonicalWord = normalizeSimpleStringLiterals_(wordCompact);
  const canonicalBody = normalizeSimpleStringLiterals_(compactCodeOutsideStringLiterals_(bodyText));

  if (canonicalWord && canonicalBody.includes(canonicalWord)) {
    return {
      matched: true,
      rule: 'stringLiteralQuote',
      matchedVariant: word
    };
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function normalizeSimpleStringLiterals_(expr){
  return String(expr || '').replace(/"([^"\\]*)"|'([^'\\]*)'/g, (_, dq, sq) =>
    `__STR(${normalizeKeywordStringLiteralValue_(dq !== undefined ? dq : sq)})__`
  );
}

function hasSimpleStringLiteral_(expr){
  return /"[^"\\]*"|'[^'\\]*'/.test(String(expr || ''));
}

function hasSimpleStringLiteralWhitespace_(expr){
  let found = false;
  String(expr || '').replace(/"([^"\\]*)"|'([^'\\]*)'/g, (_, dq, sq) => {
    const value = dq !== undefined ? dq : sq;
    if (/[\s\u00A0\u3000\u2423]/.test(value)) found = true;
    return _;
  });
  return found;
}

function normalizeKeywordStringLiteralValue_(value){
  return String(value ?? '').replace(/\u2423/g, ' ');
}

function matchPrintMultiplicationOrder_(bodyText, word){
  const keywordCalls = extractPrintCallSignatures_(word);
  if (keywordCalls.length !== 1) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const keywordCall = keywordCalls[0];
  const bodyCalls = extractPrintCallSignatures_(bodyText);

  for (const bodyCall of bodyCalls) {
    if (samePrintCallByMultiplicationOrder_(bodyCall, keywordCall)) {
      return {
        matched: true,
        rule: 'printMultiplication',
        matchedVariant: bodyCall.raw
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function matchStructuredPrintKeyword_(bodyText, word){
  if (compactCodeOutsideStringLiterals_(word).indexOf('print(') === -1) {
    return { handled: false, matched: false };
  }

  const result = matchPrintMultiplicationOrder_(bodyText, word);
  if (result && result.matched) {
    return { handled: true, matched: true };
  }

  const keywordCalls = extractPrintCallSignatures_(word);
  const requiresEnd = keywordCalls.length === 1 && keywordCalls[0].hasEnd;
  return {
    handled: requiresEnd,
    matched: false
  };
}

function extractPrintCallSignatures_(text){
  const s = compactCodeOutsideStringLiterals_(text);
  const calls = [];
  let pos = 0;

  while (pos < s.length) {
    const start = s.indexOf('print(', pos);
    if (start === -1) break;

    const open = start + 'print'.length;
    const close = findMatchingParenIndexIgnoringStrings_(s, open);
    const end = close === -1 ? s.length : close + 1;
    const inside = close === -1 ? s.slice(open + 1) : s.slice(open + 1, close);
    const args = splitTopLevelComma_(inside).map(arg => arg.trim()).filter(arg => arg !== '');
    const endArg = parsePrintEndArg_(args);

    calls.push({
      raw: s.slice(start, end),
      args,
      firstArg: firstPrintPositionalArg_(args),
      hasEnd: endArg.present,
      endRaw: endArg.raw,
      endValue: endArg.value
    });

    pos = end;
  }

  return calls;
}

function compactCodeOutsideStringLiterals_(text){
  const s = String(text ?? '');
  let out = '';
  let quote = '';
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (quote) {
      out += ch;
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      out += ch;
      continue;
    }

    const normalized = ch.normalize ? ch.normalize('NFKC') : ch;
    if (/[\s\u00A0\u3000]/.test(normalized)) continue;
    out += normalized;
  }

  return out;
}

function splitTopLevelComma_(expr){
  const parts = [];
  let depth = 0;
  let quote = '';
  let escaped = false;
  let start = 0;
  const s = String(expr || '');

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];

    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0 || ch !== ',') continue;

    parts.push(s.slice(start, i));
    start = i + 1;
  }

  parts.push(s.slice(start));
  return parts;
}

function findMatchingParenIndexIgnoringStrings_(s, openIndex){
  const open = s[openIndex];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[open];
  if (!close) return -1;

  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = openIndex; i < s.length; i++) {
    const ch = s[i];

    if (quote) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === quote) quote = '';
      continue;
    }

    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === open) depth++;
    if (ch === close) depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function firstPrintPositionalArg_(args){
  for (const arg of args || []) {
    if (!/^end=/.test(arg)) return arg;
  }
  return '';
}

function parsePrintEndArg_(args){
  for (const arg of args || []) {
    const m = String(arg || '').match(/^end=(.*)$/);
    if (!m) continue;
    return {
      present: true,
      raw: arg,
      value: parseSimplePrintStringLiteralValue_(m[1])
    };
  }

  return {
    present: false,
    raw: '',
    value: null
  };
}

function parseSimplePrintStringLiteralValue_(expr){
  const s = String(expr ?? '');
  const dq = s.match(/^"([^"\\]*)"$/);
  if (dq) return normalizeKeywordStringLiteralValue_(dq[1]);
  const sq = s.match(/^'([^'\\]*)'$/);
  if (sq) return normalizeKeywordStringLiteralValue_(sq[1]);
  return null;
}

function samePrintCallByMultiplicationOrder_(bodyCall, keywordCall){
  if (!bodyCall || !keywordCall) return false;
  if (!bodyCall.firstArg || !keywordCall.firstArg) return false;
  if (!samePrintFirstArgument_(bodyCall.firstArg, keywordCall.firstArg)) return false;

  if (!keywordCall.hasEnd) return true;
  if (!bodyCall.hasEnd) return false;
  if (keywordCall.endValue !== null || bodyCall.endValue !== null) {
    return keywordCall.endValue !== null &&
      bodyCall.endValue !== null &&
      keywordCall.endValue === bodyCall.endValue;
  }

  return normalizeSimpleStringLiterals_(bodyCall.endRaw) ===
    normalizeSimpleStringLiterals_(keywordCall.endRaw);
}

function samePrintFirstArgument_(bodyArg, keywordArg){
  const bodyCompact = compactCodeOutsideStringLiterals_(bodyArg);
  const keywordCompact = compactCodeOutsideStringLiterals_(keywordArg);
  const bodyCanonical = normalizeSimpleStringLiterals_(bodyCompact);
  const keywordCanonical = normalizeSimpleStringLiterals_(keywordCompact);

  if (bodyCanonical === keywordCanonical) return true;
  if (hasSimpleStringLiteral_(bodyCompact) || hasSimpleStringLiteral_(keywordCompact)) {
    return false;
  }

  return sameMultiplicationOnlyExpression_(bodyArg, keywordArg);
}

function sameMultiplicationOnlyExpression_(aExpr, bExpr){
  const a = normalizeSimpleStringLiterals_(normalizePowerNotation_(stripOuterParens_(aExpr)));
  const b = normalizeSimpleStringLiterals_(normalizePowerNotation_(stripOuterParens_(bExpr)));
  if (a === b) return true;
  if (hasTopLevelOperator_(a, '+') || hasTopLevelOperator_(b, '+')) return false;
  if (findSingleTopLevelMinus_(a) !== -1 || findSingleTopLevelMinus_(b) !== -1) return false;

  const aFactors = multiplicationFactorTerms_(a);
  const bFactors = multiplicationFactorTerms_(b);
  if (aFactors.length < 2 && bFactors.length < 2) return false;

  return sameTermMultiset_(aFactors, bFactors);
}

function matchFunctionArgumentEquivalent_(bodyText, word){
  const keywordCalls = extractFunctionArgumentEquivalenceCalls_(word);
  if (keywordCalls.length !== 1) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const keywordCall = keywordCalls[0];
  const bodyCalls = extractFunctionArgumentEquivalenceCalls_(bodyText);

  for (const bodyCall of bodyCalls) {
    if (sameFunctionArgumentCall_(bodyCall, keywordCall)) {
      return {
        matched: true,
        rule: 'functionArgumentEquivalent',
        matchedVariant: bodyCall.raw
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function extractFunctionArgumentEquivalenceCalls_(text){
  const s = compactCodeOutsideStringLiterals_(text);
  const calls = [];

  for (let open = 0; open < s.length; open++) {
    if (s[open] !== '(') continue;

    const close = findMatchingParenIndexIgnoringStrings_(s, open);
    if (close === -1) continue;

    const parsedName = parseFunctionCallNameForEquivalence_(s, open);
    if (!parsedName) continue;

    const inside = s.slice(open + 1, close);
    const args = splitFunctionArgumentsTopLevel_(inside);
    if (args.length === 0) continue;

    calls.push({
      raw: s.slice(parsedName.start, close + 1),
      kind: parsedName.kind,
      name: parsedName.name,
      receiver: parsedName.receiver,
      args
    });
  }

  return calls;
}

function parseFunctionCallNameForEquivalence_(s, openIndex){
  let start = openIndex - 1;
  while (start >= 0 && /[A-Za-z0-9_.\[\]]/.test(s[start])) start--;
  start++;

  const token = s.slice(start, openIndex);
  if (token === 'int' || token === 'round') {
    return {
      start,
      kind: 'function',
      name: token,
      receiver: ''
    };
  }

  const appendSuffix = '.append';
  if (!token.endsWith(appendSuffix)) return null;

  const receiver = token.slice(0, -appendSuffix.length);
  if (!/^[A-Za-z_]\w*(?:\.[A-Za-z_]\w*)*(?:\[[^\[\]]+\])?$/.test(receiver)) return null;

  return {
    start,
    kind: 'append',
    name: 'append',
    receiver
  };
}

function splitFunctionArgumentsTopLevel_(argsText){
  return splitTopLevelComma_(argsText)
    .map(arg => arg.trim())
    .filter(arg => arg !== '');
}

function sameFunctionArgumentCall_(bodyCall, keywordCall){
  if (!bodyCall || !keywordCall) return false;
  if (bodyCall.kind !== keywordCall.kind || bodyCall.name !== keywordCall.name) return false;
  if (keywordCall.kind === 'append' && bodyCall.receiver !== keywordCall.receiver) return false;
  if (bodyCall.args.length !== keywordCall.args.length) return false;
  if (!sameFunctionArgumentExpression_(bodyCall.args[0], keywordCall.args[0])) return false;

  for (let i = 1; i < bodyCall.args.length; i++) {
    if (normalizeSimpleStringLiterals_(compactCodeOutsideStringLiterals_(bodyCall.args[i])) !==
        normalizeSimpleStringLiterals_(compactCodeOutsideStringLiterals_(keywordCall.args[i]))) {
      return false;
    }
  }

  return true;
}

function sameFunctionArgumentExpression_(bodyArg, keywordArg){
  const bodyCompact = compactCodeOutsideStringLiterals_(bodyArg);
  const keywordCompact = compactCodeOutsideStringLiterals_(keywordArg);
  const bodyCanonical = normalizeSimpleStringLiterals_(bodyCompact);
  const keywordCanonical = normalizeSimpleStringLiterals_(keywordCompact);

  if (bodyCanonical === keywordCanonical) return true;
  if (!isSimpleCommutativeFunctionArgument_(bodyCompact) ||
      !isSimpleCommutativeFunctionArgument_(keywordCompact)) {
    return false;
  }

  return sameCommutativeExpression_(bodyCompact, keywordCompact);
}

function isSimpleCommutativeFunctionArgument_(expr){
  const s = compactCodeOutsideStringLiterals_(expr);
  if (!s || hasSimpleStringLiteral_(s)) return false;
  if (/[(){}]/.test(s) || s.includes('**')) return false;
  if (findSingleTopLevelMinus_(s) !== -1) return false;

  const plusParts = splitTopLevel_(s, '+');
  if (plusParts.length > 1) return plusParts.every(isSimpleFunctionArgumentTerm_);

  const mulParts = splitTopLevel_(s, '*');
  if (mulParts.length > 1) return mulParts.every(isSimpleFunctionArgumentTerm_);

  return isSimpleFunctionArgumentTerm_(s);
}

function isSimpleFunctionArgumentTerm_(expr){
  return /^(?:[A-Za-z_]\w*(?:\[[^\[\]]+\])?(?:\.[A-Za-z_]\w*(?:\[[^\[\]]+\])?)*|-?\d+(?:\.\d+)?|\.\d+)$/.test(expr);
}

function matchLimitedDeMorgan_(bodyText, word){
  const keywordCanonical = canonicalLimitedBooleanCondition_(word);
  if (!keywordCanonical) {
    return { matched: false, rule: '', matchedVariant: '' };
  }

  const candidates = extractConditionExpressionCandidates_(bodyText);
  for (const candidate of candidates) {
    const bodyCanonical = canonicalLimitedBooleanCondition_(candidate);
    if (bodyCanonical && bodyCanonical === keywordCanonical) {
      return {
        matched: true,
        rule: 'limitedDeMorgan',
        matchedVariant: candidate
      };
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function extractConditionExpressionCandidates_(text){
  const out = [];
  const add = value => {
    const s = compactKeywordText_(normalizeKeywordWhitespace_(value));
    if (s && !out.includes(s)) out.push(s);
  };

  add(text);

  normalizeKeywordText_(text)
    .split(/[\r\n;]+/)
    .map(stripPythonCommentChunk_)
    .forEach(chunk => {
      add(chunk);
      const ifCondition = extractIfConditionExpression_(chunk);
      if (ifCondition && ifCondition.prefix) {
        add(ifCondition.value);
      }
    });

  return out;
}

function canonicalLimitedBooleanCondition_(expr){
  const ifCondition = extractIfConditionExpression_(expr);
  const s = ifCondition ? ifCondition.value : compactKeywordText_(expr);
  if (!s) return '';

  const negatedGroup = parseNegatedBooleanGroup_(s);
  if (negatedGroup) {
    return canonicalBooleanParts_(
      oppositeBooleanOp_(negatedGroup.op),
      [
        negateComparison_(negatedGroup.left),
        negateComparison_(negatedGroup.right)
      ]
    );
  }

  const binary = parseBooleanBinary_(s, parseMaybeNotComparison_);
  if (!binary) return '';

  return canonicalBooleanParts_(
    binary.op,
    [
      binary.left,
      binary.right
    ]
  );
}

function parseNegatedBooleanGroup_(expr){
  const s = compactKeywordText_(expr);
  if (!s.startsWith('not(') || !s.endsWith(')')) return null;

  const open = 'not'.length;
  const close = findMatchingParenIndex_(s, open);
  if (close !== s.length - 1) return null;

  return parseBooleanBinary_(s.slice(open + 1, close), parseSimpleComparison_);
}

function parseBooleanBinary_(expr, sideParser){
  const andBinary = findBooleanBinaryByOp_(expr, 'and', sideParser);
  const orBinary = findBooleanBinaryByOp_(expr, 'or', sideParser);

  if (andBinary && orBinary) return null;
  return andBinary || orBinary;
}

function findBooleanBinaryByOp_(expr, op, sideParser){
  const s = compactKeywordText_(expr);
  const matches = [];
  let depth = 0;

  for (let i = 0; i <= s.length - op.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0 || s.slice(i, i + op.length) !== op) continue;

    const left = sideParser(s.slice(0, i));
    const right = sideParser(s.slice(i + op.length));
    if (left && right) {
      matches.push({ op, left, right });
    }
  }

  return matches.length === 1 ? matches[0] : null;
}

function parseMaybeNotComparison_(expr){
  const s = compactKeywordText_(expr);
  if (s.startsWith('not')) {
    const comparison = parseSimpleComparison_(s.slice(3));
    return comparison ? negateComparison_(comparison) : null;
  }

  return parseSimpleComparison_(s);
}

function negateComparison_(comparison){
  const negateOps = {
    '==': '!=',
    '!=': '==',
    '<': '>=',
    '<=': '>',
    '>': '<=',
    '>=': '<'
  };

  return {
    left: comparison.left,
    op: negateOps[comparison.op],
    right: comparison.right
  };
}

function oppositeBooleanOp_(op){
  return op === 'and' ? 'or' : 'and';
}

function canonicalBooleanParts_(op, comparisons){
  const parts = comparisons
    .map(canonicalComparisonFromObject_)
    .filter(Boolean)
    .sort();

  if (parts.length !== 2) return '';
  return `${op}:${parts.join('|')}`;
}

function canonicalComparisonFromObject_(comparison){
  if (!comparison || !comparison.op) return '';

  const original = `${comparison.left}${comparison.op}${comparison.right}`;
  const reversed = `${comparison.right}${reverseComparisonOp_(comparison.op)}${comparison.left}`;
  return [original, reversed].sort()[0];
}

function reverseComparisonOp_(op){
  const reverseOps = {
    '<': '>',
    '<=': '>=',
    '>': '<',
    '>=': '<=',
    '==': '==',
    '!=': '!='
  };

  return reverseOps[op] || op;
}

function matchCommutativeAssignment_(bodyText, word){
  const keywordAssignments = getEquivalentPlainAssignments_(word);

  for (const keywordAssignment of keywordAssignments) {
    const bodyAssignments = extractSimpleAssignments_(bodyText, keywordAssignment.lhs);
    for (const bodyAssignment of bodyAssignments) {
      if (bodyAssignment.op !== '=') continue;
      if (sameCommutativeExpression_(bodyAssignment.rhs, keywordAssignment.rhs)) {
        return {
          matched: true,
          rule: 'commutativeAssignment',
          matchedVariant: `${bodyAssignment.lhs}=${bodyAssignment.rhs}`
        };
      }
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function getEquivalentPlainAssignments_(word){
  const candidates = [word]
    .concat(buildAugmentedAssignmentVariants_(word).map(v => v.value))
    .concat(buildAssignmentOuterParenVariants_(word).map(v => v.value))
    .concat([normalizePowerNotation_(word), expandIntegerPowerNotation_(word)]);
  const assignments = [];

  candidates.forEach(candidate => {
    const assignment = parseSimpleAssignment_(candidate);
    if (!assignment || assignment.op !== '=') return;
    const rhs = stripOuterParens_(assignment.rhs);
    const key = `${assignment.lhs}=${rhs}`;
    if (assignments.some(a => `${a.lhs}=${a.rhs}` === key)) return;
    assignments.push({ lhs: assignment.lhs, op: '=', rhs });
  });

  return assignments;
}

function matchDistributiveAssignment_(bodyText, word){
  const keywordAssignments = getEquivalentPlainAssignments_(word);

  for (const keywordAssignment of keywordAssignments) {
    const keywordForms = buildExpandedRhsForms_(keywordAssignment.rhs);
    if (keywordForms.length === 1) continue;

    const bodyAssignments = extractSimpleAssignments_(bodyText, keywordAssignment.lhs);
    for (const bodyAssignment of bodyAssignments) {
      if (bodyAssignment.op !== '=') continue;
      const bodyForms = buildExpandedRhsForms_(bodyAssignment.rhs);

      for (const keywordForm of keywordForms) {
        for (const bodyForm of bodyForms) {
          if (!keywordForm.expanded && !bodyForm.expanded) continue;
          if (sameExpandedExpression_(bodyForm.value, keywordForm.value)) {
            return {
              matched: true,
              rule: 'distributiveAssignment',
              matchedVariant: `${bodyAssignment.lhs}=${bodyForm.value}`
            };
          }
        }
      }
    }
  }

  return { matched: false, rule: '', matchedVariant: '' };
}

function buildDistributiveAssignmentVariants_(word){
  const assignment = parseSimpleAssignment_(word);
  if (!assignment || assignment.op !== '=') return [];

  return expandSingleBinomialProduct_(assignment.rhs).map(rhs => ({
    value: `${assignment.lhs}=${rhs}`,
    rule: 'distributiveAssignment'
  }));
}

function buildExpandedRhsForms_(rhs){
  const forms = [{ value: normalizePowerNotation_(stripOuterParens_(rhs)), expanded: false }];
  expandSingleBinomialProduct_(rhs).forEach(expanded => {
    const normalizedExpanded = normalizePowerNotation_(expanded);
    if (!forms.some(f => f.value === normalizedExpanded)) {
      forms.push({ value: normalizedExpanded, expanded: true });
    }
  });
  return forms;
}

function buildAssignmentOuterParenVariants_(word){
  const assignment = parseSimpleAssignment_(word);
  if (!assignment || assignment.op !== '=') return [];

  const rhs = stripOuterParens_(assignment.rhs);
  const variants = [];
  if (rhs !== assignment.rhs) {
    variants.push({ value: `${assignment.lhs}=${rhs}`, rule: 'rhsOuterParens' });
  } else {
    variants.push({ value: `${assignment.lhs}=(${assignment.rhs})`, rule: 'rhsOuterParens' });
  }
  return variants;
}

function normalizePowerNotation_(expr){
  let s = compactKeywordText_(expr);
  let changed = true;

  while (changed) {
    changed = false;

    for (let i = 0; i < s.length - 1; i++) {
      if (s[i] !== '*' || s[i + 1] !== '*') continue;

      const baseStart = findPowerBaseStart_(s, i);
      const exponent = parsePowerExponent_(s, i + 2);
      if (baseStart === -1 || !exponent || !isSqrtExponentText_(exponent.text)) continue;

      const replaced = `${s.slice(0, baseStart)}${s.slice(baseStart, i)}**(1/2)${s.slice(exponent.end)}`;
      if (replaced === s) continue;

      s = replaced;
      changed = true;
      break;
    }
  }

  return s;
}

function expandIntegerPowerNotation_(expr){
  return compactKeywordText_(expr).replace(/\b([A-Za-z_]\w*)\*\*([2-4])\b/g, (_, base, power) =>
    Array(Number(power)).fill(base).join('*')
  );
}

function findPowerBaseStart_(s, powerIndex){
  const before = powerIndex - 1;
  if (before < 0) return -1;

  if (s[before] === ')') {
    return findMatchingOpenParenIndex_(s, before);
  }

  let i = before;
  while (i >= 0 && /[A-Za-z0-9_]/.test(s[i])) i--;
  const start = i + 1;
  return /^[A-Za-z_]\w*$/.test(s.slice(start, powerIndex)) ? start : -1;
}

function parsePowerExponent_(s, start){
  if (start >= s.length) return null;

  if (s[start] === '(') {
    const end = findMatchingParenIndex_(s, start);
    if (end === -1) return null;
    return { text: s.slice(start + 1, end), end: end + 1 };
  }

  if (s.slice(start, start + 3) === '0.5') return { text: '0.5', end: start + 3 };
  if (s.slice(start, start + 2) === '.5') return { text: '.5', end: start + 2 };
  return null;
}

function isSqrtExponentText_(text){
  return ['0.5', '.5', '1/2'].includes(compactKeywordText_(text));
}

function splitTopLevel_(expr, operator){
  const s = compactKeywordText_(expr);
  const parts = [];
  let depth = 0;
  let start = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0 || ch !== operator) continue;
    if (operator === '*' && (s[i - 1] === '*' || s[i + 1] === '*')) continue;
    if (i === start) continue;

    parts.push(s.slice(start, i));
    start = i + 1;
  }

  parts.push(s.slice(start));
  return parts.filter(part => part !== '');
}

function stripOuterParens_(expr){
  let s = compactKeywordText_(expr);

  while (s.startsWith('(') && s.endsWith(')')) {
    const close = findMatchingParenIndex_(s, 0);
    if (close !== s.length - 1) break;
    s = s.slice(1, -1);
  }

  return s;
}

function parseSimpleAssignment_(expr){
  const s = compactKeywordText_(expr);
  const assignmentOp = findTopLevelAssignmentOperator_(s);
  if (!assignmentOp) return null;

  const lhs = s.slice(0, assignmentOp.index);
  const rhs = s.slice(assignmentOp.index + assignmentOp.op.length);
  if (!/^[A-Za-z_]\w*$/.test(lhs) || !rhs) return null;

  return {
    lhs,
    op: assignmentOp.op,
    rhs
  };
}

function findTopLevelAssignmentOperator_(s){
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0) continue;

    if ((ch === '+' || ch === '-' || ch === '*') && s[i + 1] === '=') {
      return { index: i, op: `${ch}=` };
    }

    if (ch === '=') {
      const prev = s[i - 1] || '';
      const next = s[i + 1] || '';
      if (!/[<>=!+\-*\/]/.test(prev) && next !== '=') {
        return { index: i, op: '=' };
      }
    }
  }

  return null;
}

function parseSimpleComparison_(expr){
  const s = compactKeywordText_(expr);
  const ops = ['<=', '>=', '==', '!=', '<', '>'];
  const found = [];
  let depth = 0;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0) continue;

    for (const op of ops) {
      if (s.slice(i, i + op.length) === op) {
        found.push({ index: i, op });
        i += op.length - 1;
        break;
      }
    }
  }

  if (found.length !== 1) return null;

  const hit = found[0];
  const left = s.slice(0, hit.index);
  const right = s.slice(hit.index + hit.op.length);
  if (!isSimpleComparableOperand_(left) || !isSimpleComparableOperand_(right)) return null;

  return { left, op: hit.op, right };
}

function isSimpleComparableOperand_(s){
  const atom = '(?:[A-Za-z_]\\w*(?:\\[[^\\[\\]]+\\])?(?:\\.[A-Za-z_]\\w*(?:\\[[^\\[\\]]+\\])?)*|-?\\d+(?:\\.\\d+)?|\\.\\d+)';
  return new RegExp(`^${atom}(?:%${atom})*$`).test(s);
}

function extractSimpleAssignments_(bodyText, lhs){
  const chunks = normalizeKeywordText_(bodyText)
    .split(/[\r\n;]+/)
    .flatMap(line => line.split(':'))
    .map(stripPythonCommentChunk_);
  const assignments = [];

  chunks.forEach(chunk => {
    const assignment = parseSimpleAssignment_(chunk);
    if (assignment && assignment.lhs === lhs) assignments.push(assignment);
  });

  return assignments;
}

function matchExactSimpleAssignmentInBody_(bodyText, keywordAssignment){
  const rhs = normalizeExactAssignmentRhs_(keywordAssignment.rhs);
  return extractSimpleAssignments_(bodyText, keywordAssignment.lhs).some(bodyAssignment =>
    bodyAssignment.op === keywordAssignment.op &&
    normalizeExactAssignmentRhs_(bodyAssignment.rhs) === rhs
  );
}

function normalizeExactAssignmentRhs_(expr){
  return normalizeSimpleStringLiterals_(normalizePowerNotation_(stripOuterParens_(expr)));
}

function stripPythonCommentChunk_(chunk){
  const s = String(chunk || '');
  let quote = '';
  let escaped = false;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') return s.slice(0, i);
  }

  return s;
}

function sameCommutativeExpression_(aExpr, bExpr){
  const a = normalizePowerNotation_(stripOuterParens_(aExpr));
  const b = normalizePowerNotation_(stripOuterParens_(bExpr));
  if (a === b) return true;

  if (normalizeSimpleStringLiterals_(a) === normalizeSimpleStringLiterals_(b)) return true;
  if (hasSimpleStringLiteral_(a) || hasSimpleStringLiteral_(b)) return false;

  if (!hasTopLevelOperator_(a, '-') && !hasTopLevelOperator_(b, '-')) {
    const aAdd = splitTopLevel_(a, '+');
    const bAdd = splitTopLevel_(b, '+');
    if (aAdd.length > 1 || bAdd.length > 1) {
      return aAdd.length === bAdd.length &&
        sameTermMultiset_(aAdd.map(canonicalExpressionTerm_), bAdd.map(canonicalExpressionTerm_));
    }
  }

  const aMul = multiplicationFactorTerms_(a);
  const bMul = multiplicationFactorTerms_(b);
  if (aMul.length > 1 || bMul.length > 1) {
    return sameTermMultiset_(aMul, bMul);
  }

  return false;
}

function sameExpandedExpression_(aExpr, bExpr){
  if (sameCommutativeExpression_(aExpr, bExpr)) return true;

  const aTerms = splitTopLevelAddSub_(aExpr);
  const bTerms = splitTopLevelAddSub_(bExpr);
  if (aTerms.length < 2 || bTerms.length < 2 || aTerms.length !== bTerms.length) return false;

  return sameTermMultiset_(
    aTerms.map(term => `${term.sign}:${canonicalProductTerm_(term.expr)}`),
    bTerms.map(term => `${term.sign}:${canonicalProductTerm_(term.expr)}`)
  );
}

function splitTopLevelAddSub_(expr){
  const s = compactKeywordText_(expr);
  const terms = [];
  let depth = 0;
  let start = 0;
  let sign = 1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0 || (ch !== '+' && ch !== '-')) continue;
    if (i === 0) continue;

    terms.push({ sign, expr: s.slice(start, i) });
    sign = ch === '-' ? -1 : 1;
    start = i + 1;
  }

  terms.push({ sign, expr: s.slice(start) });
  return terms.filter(term => term.expr !== '');
}

function canonicalExpressionTerm_(expr){
  const addTerms = splitTopLevel_(expr, '+');
  if (addTerms.length > 1 && !hasTopLevelOperator_(expr, '-')) {
    return addTerms.map(canonicalExpressionTerm_).sort().join('+');
  }
  return canonicalProductTerm_(expr);
}

function canonicalProductTerm_(expr){
  const factors = multiplicationFactorTerms_(expr);
  return factors.length > 0 ? factors.join('*') : normalizePowerNotation_(stripOuterParens_(expr));
}

function multiplicationFactorTerms_(expr){
  const parts = splitTopLevel_(expr, '*');
  const expanded = [];

  parts.forEach(part => {
    expandSimpleIntegerPowerFactor_(part).forEach(factor => {
      expanded.push(canonicalFactor_(factor));
    });
  });

  return expanded.sort();
}

function expandSimpleIntegerPowerFactor_(factor){
  const normalized = normalizePowerNotation_(stripOuterParens_(factor));
  const m = normalized.match(/^([A-Za-z_]\w*)\*\*([2-4])$/);
  if (!m) return [normalized];
  return Array(Number(m[2])).fill(m[1]);
}

function canonicalFactor_(factor){
  const original = compactKeywordText_(factor);
  const stripped = stripOuterParens_(original);
  const binomial = parseParenBinomial_(original);
  if (binomial && binomial.op === '+') {
    return `(${[canonicalProductTerm_(binomial.left), canonicalProductTerm_(binomial.right)].sort().join('+')})`;
  }
  if (binomial && binomial.op === '-') {
    return `(${canonicalProductTerm_(binomial.left)}-${canonicalProductTerm_(binomial.right)})`;
  }
  return normalizePowerNotation_(stripped);
}

function sameTermMultiset_(aTerms, bTerms){
  if (aTerms.length !== bTerms.length) return false;

  const counts = {};
  aTerms.forEach(term => {
    counts[term] = (counts[term] || 0) + 1;
  });

  for (const term of bTerms) {
    if (!counts[term]) return false;
    counts[term]--;
  }

  return Object.values(counts).every(count => count === 0);
}

function hasTopLevelOperator_(expr, operator){
  return splitTopLevel_(expr, operator).length > 1;
}

function expandSingleBinomialProduct_(rhs){
  const s = stripOuterParens_(rhs);
  const factors = splitTopLevel_(s, '*');
  if (factors.length < 2) return [];

  const binomialIndexes = [];
  const binomials = {};
  factors.forEach((factor, index) => {
    const binomial = parseParenBinomial_(factor);
    if (binomial) {
      binomialIndexes.push(index);
      binomials[index] = binomial;
    }
  });

  if (binomialIndexes.length !== 1) return [];

  const binomialIndex = binomialIndexes[0];
  const binomial = binomials[binomialIndex];
  const leftFactors = factors.slice();
  const rightFactors = factors.slice();
  leftFactors[binomialIndex] = binomial.left;
  rightFactors[binomialIndex] = binomial.right;

  const leftTerm = leftFactors.join('*');
  const rightTerm = rightFactors.join('*');

  return [`${leftTerm}${binomial.op}${rightTerm}`];
}

function parseParenBinomial_(factor){
  let s = compactKeywordText_(factor);
  if (!s.startsWith('(') || !s.endsWith(')')) return null;

  while (s.startsWith('(') && s.endsWith(')')) {
    const close = findMatchingParenIndex_(s, 0);
    if (close !== s.length - 1) break;
    const inner = s.slice(1, -1);
    if (!inner.startsWith('(') || findMatchingParenIndex_(inner, 0) !== inner.length - 1) {
      s = `(${inner})`;
      break;
    }
    s = inner;
  }

  if (!s.startsWith('(') || findMatchingParenIndex_(s, 0) !== s.length - 1) return null;

  const inner = s.slice(1, -1);
  const plusParts = splitTopLevel_(inner, '+');
  if (plusParts.length === 2) {
    return { op: '+', left: plusParts[0], right: plusParts[1] };
  }
  if (plusParts.length > 2) return null;

  const minusIndex = findSingleTopLevelMinus_(inner);
  if (minusIndex === -1) return null;

  return {
    op: '-',
    left: inner.slice(0, minusIndex),
    right: inner.slice(minusIndex + 1)
  };
}

function findSingleTopLevelMinus_(expr){
  const s = compactKeywordText_(expr);
  let depth = 0;
  let found = -1;

  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (ch === '(' || ch === '[' || ch === '{') {
      depth++;
      continue;
    }
    if (ch === ')' || ch === ']' || ch === '}') {
      depth--;
      continue;
    }
    if (depth !== 0 || ch !== '-' || i === 0) continue;
    if (found !== -1) return -1;
    found = i;
  }

  return found;
}

function findMatchingParenIndex_(s, openIndex){
  const open = s[openIndex];
  const pairs = { '(': ')', '[': ']', '{': '}' };
  const close = pairs[open];
  if (!close) return -1;

  let depth = 0;
  for (let i = openIndex; i < s.length; i++) {
    if (s[i] === open) depth++;
    if (s[i] === close) depth--;
    if (depth === 0) return i;
  }

  return -1;
}

function findMatchingOpenParenIndex_(s, closeIndex){
  const close = s[closeIndex];
  const pairs = { ')': '(', ']': '[', '}': '{' };
  const open = pairs[close];
  if (!open) return -1;

  let depth = 0;
  for (let i = closeIndex; i >= 0; i--) {
    if (s[i] === close) depth++;
    if (s[i] === open) depth--;
    if (depth === 0) return i;
  }

  return -1;
}

// 15_py_rule_engine.js: 確認済み純粋関数
function evaluatePyRuleGroups_(rules, context) {
  const groups = groupPyRulesById_(rules);
  return groups.map(group => {
    const target = group.target === 'output' ? 'output' : 'code';
    if (target === 'output' && context.usesRandom) {
      return buildPyRuleCheck_(group, {
        passed: null,
        eligible: false,
        reason: 'random_output_skipped',
        steps: [],
      });
    }

    const source = target === 'output'
      ? String(context.outputText || '')
      : String(context.codeBody || '');
    const ruleType = normalizePyRuleType_(group.ruleType);
    let result;

    if (ruleType === 'sequence') {
      result = evaluatePySequenceRule_(group, source);
    } else if (ruleType === 'nesting') {
      result = evaluatePyNestingRule_(group, source);
    } else if (ruleType === 'branch') {
      result = evaluatePyBranchRule_(group, source);
    } else {
      result = evaluatePyMatchRule_(group, source);
    }

    return buildPyRuleCheck_(group, result);
  });
}

function groupPyRulesById_(rules) {
  const groups = [];
  const byKey = {};

  (rules || []).forEach((rule, index) => {
    if (!rule || rule.enabled === false || !String(rule.keyword || '').trim()) return;
    const target = normalizePyRuleTarget_(rule.target);
    const ruleId = String(rule.ruleId || `rule-${index + 1}`).trim();
    const key = `${target}\u0000${ruleId}`;
    if (!byKey[key]) {
      byKey[key] = {
        ruleId,
        target,
        ruleType: normalizePyRuleType_(rule.ruleType),
        rows: [],
        order: index,
      };
      groups.push(byKey[key]);
    }
    byKey[key].rows.push({
      ruleId,
      target,
      ruleType: normalizePyRuleType_(rule.ruleType),
      stepNo: normalizePyRuleStepNo_(rule.stepNo),
      stepMode: normalizePyRuleStepMode_(rule.stepMode),
      keyword: String(rule.keyword || '').trim(),
      points: normalizePyRulePoints_(rule.points),
      note: String(rule.note || '').trim(),
      rowNumber: Number(rule.rowNumber || 0),
    });
  });

  return groups.sort((a, b) => a.order - b.order);
}

function evaluatePyMatchRule_(group, source) {
  const steps = groupPyRuleRowsByStep_(group.rows);
  const stepResults = steps.map(step => {
    const matches = step.rows.map(row => ({
      keyword: row.keyword,
      passed: matchPyKeywordCondition_(source, row.keyword, group.target),
    }));
    return {
      stepNo: step.stepNo,
      stepMode: step.stepMode,
      passed: combinePyRuleMatches_(matches, step.stepMode),
      matches,
    };
  });
  return {
    passed: stepResults.every(step => step.passed),
    eligible: true,
    reason: 'match',
    steps: stepResults,
  };
}

function matchPyKeywordCondition_(source, ruleString, target) {
  const variants = parseKeywordString(ruleString);
  const hit = target === 'output' ? outputWordHit_ : wordHit;
  return variants.some(andBlocks =>
    andBlocks.every(orBlock =>
      orBlock.some(keyword => hit(source, keyword))
    )
  );
}

function evaluatePySequenceRule_(group, source) {
  if (group.target === 'output') {
    return evaluatePyTextSequenceRule_(group, source);
  }

  const structure = parsePyStructure_(source);
  const steps = groupPyRuleRowsByStep_(group.rows);
  const stepResults = [];
  let cursor = 0;
  let passed = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const match = findPySequenceStep_(structure.nodes, step, cursor);
    stepResults.push({
      stepNo: step.stepNo,
      stepMode: step.stepMode,
      passed: match.passed,
      matches: match.matches,
      statementIndexes: match.statementIndexes,
      lineNumbers: match.lineNumbers,
    });
    if (!match.passed) {
      passed = false;
      break;
    }
    cursor = match.nextIndex;
  }

  return {
    passed,
    eligible: true,
    reason: 'sequence',
    steps: stepResults,
  };
}

function evaluatePyTextSequenceRule_(group, source) {
  const normalized = normalizeKeywordText_(source);
  const steps = groupPyRuleRowsByStep_(group.rows);
  const stepResults = [];
  let cursor = 0;
  let passed = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const candidates = step.rows.map(row => {
      const raw = normalizeKeywordText_(row.keyword);
      const index = raw && !raw.startsWith('re:')
        ? normalized.indexOf(raw, cursor)
        : -1;
      return {
        keyword: row.keyword,
        passed: index >= 0,
        index,
      };
    });
    const stepPassed = combinePyRuleMatches_(candidates, step.stepMode);
    stepResults.push({
      stepNo: step.stepNo,
      stepMode: step.stepMode,
      passed: stepPassed,
      matches: candidates,
    });
    if (!stepPassed) {
      passed = false;
      break;
    }
    const indexes = candidates.filter(item => item.passed).map(item => item.index);
    cursor = indexes.length > 0 ? Math.max.apply(null, indexes) + 1 : cursor;
  }

  return {
    passed,
    eligible: true,
    reason: 'sequence_output',
    steps: stepResults,
  };
}

function findPySequenceStep_(nodes, step, startIndex) {
  const mode = step.stepMode;
  if (mode === 'all') {
    const matches = [];
    const statementIndexes = [];
    const lineNumbers = [];

    step.rows.forEach(row => {
      let foundIndex = -1;
      for (let i = startIndex; i < nodes.length; i++) {
        if (wordHit(nodes[i].text, row.keyword)) {
          foundIndex = i;
          break;
        }
      }
      matches.push({
        keyword: row.keyword,
        passed: foundIndex >= 0,
        statementIndex: foundIndex,
        lineNumber: foundIndex >= 0 ? nodes[foundIndex].startLine : null,
      });
      if (foundIndex >= 0) {
        statementIndexes.push(foundIndex);
        lineNumbers.push(nodes[foundIndex].startLine);
      }
    });

    const passed = matches.every(match => match.passed);
    return {
      passed,
      matches,
      statementIndexes,
      lineNumbers,
      nextIndex: passed && statementIndexes.length > 0
        ? Math.max.apply(null, statementIndexes) + 1
        : startIndex,
    };
  }

  for (let i = startIndex; i < nodes.length; i++) {
    const matches = step.rows.map(row => ({
      keyword: row.keyword,
      passed: wordHit(nodes[i].text, row.keyword),
      statementIndex: i,
      lineNumber: nodes[i].startLine,
    }));
    if (combinePyRuleMatches_(matches, mode)) {
      return {
        passed: true,
        matches,
        statementIndexes: [i],
        lineNumbers: [nodes[i].startLine],
        nextIndex: i + 1,
      };
    }
  }

  return {
    passed: false,
    matches: step.rows.map(row => ({
      keyword: row.keyword,
      passed: false,
      statementIndex: -1,
      lineNumber: null,
    })),
    statementIndexes: [],
    lineNumbers: [],
    nextIndex: startIndex,
  };
}

function evaluatePyNestingRule_(group, source) {
  if (group.target === 'output') {
    return {
      passed: false,
      eligible: true,
      reason: 'nesting_requires_code_target',
      steps: [],
    };
  }

  const structure = parsePyStructure_(source);
  const steps = groupPyRuleRowsByStep_(group.rows);
  const stepResults = [];
  let parentNodeIndex = null;
  let passed = true;

  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const candidates = structure.nodes.filter(node =>
      parentNodeIndex === null
        ? true
        : isPyNodeDescendantOf_(structure.nodes, node.index, parentNodeIndex)
    );
    const match = findPyNestingStep_(candidates, step);
    stepResults.push({
      stepNo: step.stepNo,
      stepMode: step.stepMode,
      passed: match.passed,
      matches: match.matches,
      nodeIndex: match.node ? match.node.index : null,
      lineNumber: match.node ? match.node.startLine : null,
      depth: match.node ? match.node.depth : null,
    });
    if (!match.passed) {
      passed = false;
      break;
    }
    parentNodeIndex = match.node.index;
  }

  return {
    passed,
    eligible: true,
    reason: 'nesting',
    steps: stepResults,
  };
}

function findPyNestingStep_(candidateNodes, step) {
  for (let i = 0; i < candidateNodes.length; i++) {
    const node = candidateNodes[i];
    const matches = step.rows.map(row => {
      const headerMatched = matchPyStructuralKeyword_(node, row.keyword);
      const scopeMatched = headerMatched || wordHit(node.scopeText, row.keyword);
      return {
        keyword: row.keyword,
        passed: scopeMatched,
        headerMatched,
      };
    });
    const hasHeaderAnchor = matches.some(match => match.headerMatched);
    if (hasHeaderAnchor && combinePyRuleMatches_(matches, step.stepMode)) {
      return { passed: true, node, matches };
    }
  }

  return {
    passed: false,
    node: null,
    matches: step.rows.map(row => ({
      keyword: row.keyword,
      passed: false,
      headerMatched: false,
    })),
  };
}

function evaluatePyBranchRule_(group, source) {
  if (group.target === 'output') {
    return {
      passed: false,
      eligible: true,
      reason: 'branch_requires_code_target',
      steps: [],
    };
  }

  const structure = parsePyStructure_(source);
  const expectedSteps = groupPyRuleRowsByStep_(group.rows);
  let bestFailure = null;

  for (let i = 0; i < structure.branchChains.length; i++) {
    const chain = structure.branchChains[i];
    if (chain.clauses.length !== expectedSteps.length) {
      bestFailure = bestFailure || {
        passed: false,
        eligible: true,
        reason: 'branch_clause_count_mismatch',
        steps: [],
        expectedClauseCount: expectedSteps.length,
        actualClauseCount: chain.clauses.length,
      };
      continue;
    }

    const matched = matchPyBranchStepsToClauses_(
      expectedSteps,
      chain.clauses,
      structure.nodes
    );
    if (matched.passed) {
      return {
        passed: true,
        eligible: true,
        reason: 'branch',
        steps: matched.steps,
        expectedClauseCount: expectedSteps.length,
        actualClauseCount: chain.clauses.length,
        chainStartLine: chain.startLine,
      };
    }
    bestFailure = matched;
  }

  return bestFailure || {
    passed: false,
    eligible: true,
    reason: 'branch_chain_not_found',
    steps: expectedSteps.map(step => ({
      stepNo: step.stepNo,
      stepMode: step.stepMode,
      passed: false,
      clauseType: null,
      lineNumber: null,
      matches: step.rows.map(row => ({
        keyword: row.keyword,
        passed: false,
      })),
    })),
    expectedClauseCount: expectedSteps.length,
    actualClauseCount: 0,
  };
}

function matchPyBranchStepsToClauses_(steps, clauses, nodes) {
  const candidates = steps.map(step =>
    clauses.map(clause => evaluatePyBranchStepForClause_(step, clause, nodes))
  );
  const assignment = findPyDistinctBranchAssignment_(candidates, 0, {});

  if (!assignment) {
    return {
      passed: false,
      eligible: true,
      reason: 'branch_clause_mapping_failed',
      steps: steps.map((step, index) => {
        const closest = candidates[index].find(candidate => candidate.passed) ||
          candidates[index][0] || null;
        return {
          stepNo: step.stepNo,
          stepMode: step.stepMode,
          passed: false,
          clauseType: closest ? closest.clauseType : null,
          lineNumber: closest ? closest.lineNumber : null,
          matches: closest ? closest.matches : [],
        };
      }),
      expectedClauseCount: steps.length,
      actualClauseCount: clauses.length,
    };
  }

  return {
    passed: true,
    eligible: true,
    reason: 'branch',
    steps: steps.map((step, index) => {
      const candidate = candidates[index][assignment[index]];
      return {
        stepNo: step.stepNo,
        stepMode: step.stepMode,
        passed: true,
        clauseType: candidate.clauseType,
        lineNumber: candidate.lineNumber,
        matches: candidate.matches,
      };
    }),
  };
}

function evaluatePyBranchStepForClause_(step, clause, nodes) {
  const node = nodes[clause.nodeIndex];
  const scopeText = node.scopeText;
  const matches = step.rows.map(row => {
    const structural = matchPyBranchClauseKeyword_(clause, row.keyword);
    const headerMatched = structural || wordHit(node.text, row.keyword);
    const passed = headerMatched || wordHit(scopeText, row.keyword);
    return {
      keyword: row.keyword,
      passed,
      headerMatched,
      structural,
    };
  });
  const hasHeaderAnchor = matches.some(match => match.headerMatched);
  return {
    passed: hasHeaderAnchor && combinePyRuleMatches_(matches, step.stepMode),
    clauseType: clause.type,
    lineNumber: node.startLine,
    matches,
  };
}

function findPyDistinctBranchAssignment_(candidateMatrix, stepIndex, usedClauses) {
  if (stepIndex >= candidateMatrix.length) return {};
  const row = candidateMatrix[stepIndex] || [];

  for (let clauseIndex = 0; clauseIndex < row.length; clauseIndex++) {
    if (usedClauses[clauseIndex] || !row[clauseIndex].passed) continue;
    const nextUsed = Object.assign({}, usedClauses, { [clauseIndex]: true });
    const rest = findPyDistinctBranchAssignment_(
      candidateMatrix,
      stepIndex + 1,
      nextUsed
    );
    if (rest) {
      rest[stepIndex] = clauseIndex;
      return rest;
    }
  }
  return null;
}

function matchPyBranchClauseKeyword_(clause, keyword) {
  const normalized = compactKeywordText_(keyword).toLowerCase().replace(/:$/, '');
  if (normalized === 'else') return clause.type === 'else';
  if (normalized === 'elif') return clause.type === 'elif';
  if (normalized === 'if') return clause.type === 'if';
  return false;
}

function matchPyStructuralKeyword_(node, keyword) {
  const normalized = compactKeywordText_(keyword).toLowerCase().replace(/:$/, '');
  if ([
    'if', 'elif', 'else', 'for', 'while', 'try', 'except', 'finally',
    'with', 'def', 'class', 'match', 'case'
  ].indexOf(normalized) >= 0) {
    return node.type === normalized;
  }
  return wordHit(node.text, keyword);
}

function buildPyRuleCheck_(group, result) {
  const points = getPyRuleGroupPoints_(group.rows);
  const eligible = result.eligible !== false;
  const passed = eligible ? !!result.passed : null;
  return {
    ruleId: group.ruleId,
    target: group.target,
    ruleType: group.ruleType,
    passed,
    eligible,
    points,
    earnedPoints: eligible && passed ? points : 0,
    label: buildPyRuleLabel_(group),
    keywords: group.rows.map(row => row.keyword),
    reason: result.reason || '',
    steps: result.steps || [],
    expectedClauseCount: result.expectedClauseCount,
    actualClauseCount: result.actualClauseCount,
    chainStartLine: result.chainStartLine,
  };
}

function buildPyRuleLabel_(group) {
  const keywords = group.rows.map(row => row.keyword);
  if (keywords.length === 1) return keywords[0];
  return `[${group.ruleId}] ${keywords.join(' / ')}`;
}

function getPyRuleGroupPoints_(rows) {
  const values = (rows || []).map(row => normalizePyRulePoints_(row.points));
  return values.length > 0 ? Math.max.apply(null, values) : 1;
}

function groupPyRuleRowsByStep_(rows) {
  const byStep = {};
  const steps = [];
  (rows || []).forEach(row => {
    const stepNo = normalizePyRuleStepNo_(row.stepNo);
    if (!byStep[stepNo]) {
      byStep[stepNo] = {
        stepNo,
        stepMode: normalizePyRuleStepMode_(row.stepMode),
        rows: [],
      };
      steps.push(byStep[stepNo]);
    }
    byStep[stepNo].rows.push(row);
  });
  return steps.sort((a, b) => a.stepNo - b.stepNo);
}

function combinePyRuleMatches_(matches, mode) {
  if (!matches || matches.length === 0) return false;
  const normalizedMode = normalizePyRuleStepMode_(mode);
  if (normalizedMode === 'any') return matches.some(match => match.passed);
  if (normalizedMode === 'all') return matches.every(match => match.passed);
  return matches.length === 1 && matches[0].passed;
}

function normalizePyRuleTarget_(value) {
  return String(value || '').trim().toLowerCase() === 'output' ? 'output' : 'code';
}

function normalizePyRuleType_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['match', 'sequence', 'nesting', 'branch'].indexOf(normalized) >= 0
    ? normalized
    : 'match';
}

function normalizePyRuleStepMode_(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return ['single', 'any', 'all'].indexOf(normalized) >= 0
    ? normalized
    : 'single';
}

function normalizePyRuleStepNo_(value) {
  const number = Number(value);
  return Number.isFinite(number) && number >= 1 ? Math.floor(number) : 1;
}

function normalizePyRulePoints_(value) {
  if (value === '' || value === null || value === undefined) return 1;
  const number = Number(value);
  return Number.isFinite(number) && number >= 0 ? number : 1;
}

function parsePyStructure_(source) {
  const physicalLines = String(source || '').replace(/\r\n?/g, '\n').split('\n');
  const statements = buildPyLogicalStatements_(physicalLines);
  const nodes = [];
  const blockStack = [];

  statements.forEach(statement => {
    while (
      blockStack.length > 0 &&
      nodes[blockStack[blockStack.length - 1]].indent >= statement.indent
    ) {
      blockStack.pop();
    }

    const parentIndex = blockStack.length > 0
      ? blockStack[blockStack.length - 1]
      : null;
    const type = getPyStatementType_(statement.text);
    const node = {
      index: nodes.length,
      text: statement.text,
      indent: statement.indent,
      startLine: statement.startLine,
      endLine: statement.endLine,
      scopeEndLine: statement.endLine,
      parentIndex,
      children: [],
      type,
      isBlock: isPyBlockStatement_(statement.text),
      depth: parentIndex === null ? 0 : nodes[parentIndex].depth + 1,
      scopeText: statement.text,
    };
    nodes.push(node);
    if (parentIndex !== null) nodes[parentIndex].children.push(node.index);
    if (node.isBlock) blockStack.push(node.index);
  });

  nodes.forEach((node, index) => {
    let scopeEndLine = physicalLines.length;
    for (let i = index + 1; i < nodes.length; i++) {
      if (nodes[i].indent <= node.indent) {
        scopeEndLine = nodes[i].startLine - 1;
        break;
      }
    }
    node.scopeEndLine = Math.max(scopeEndLine, node.endLine);
    const scopeNodes = nodes.filter(candidate =>
      candidate.index === node.index ||
      isPyNodeDescendantOf_(nodes, candidate.index, node.index)
    );
    node.scopeText = scopeNodes.map(candidate => candidate.text).join('\n');
  });

  return {
    physicalLines,
    nodes,
    branchChains: buildPyBranchChains_(nodes),
  };
}

function buildPyLogicalStatements_(physicalLines) {
  const statements = [];
  let buffer = '';
  let startLine = 0;
  let indent = 0;
  let bracketDepth = 0;
  let continued = false;

  (physicalLines || []).forEach((rawLine, index) => {
    const lineNumber = index + 1;
    const clean = stripPyComment_(String(rawLine || ''));
    if (!buffer && !clean.trim()) return;

    if (!buffer) {
      startLine = lineNumber;
      indent = getPyIndentWidth_(clean);
    }

    const trimmed = clean.trim();
    buffer = buffer ? `${buffer} ${trimmed}` : trimmed;
    bracketDepth += getPyBracketDelta_(trimmed);
    continued = /\\\s*$/.test(trimmed);
    if (continued) buffer = buffer.replace(/\\\s*$/, '').trim();

    if (bracketDepth > 0 || continued) return;
    splitPyTopLevelSemicolon_(buffer).forEach(part => {
      if (!part) return;
      statements.push({
        text: part,
        indent,
        startLine,
        endLine: lineNumber,
      });
    });
    buffer = '';
    bracketDepth = 0;
    continued = false;
  });

  if (buffer.trim()) {
    statements.push({
      text: buffer.trim(),
      indent,
      startLine,
      endLine: physicalLines.length,
    });
  }
  return statements;
}

function stripPyComment_(line) {
  const source = String(line || '');
  let quote = '';
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '#') return source.slice(0, i);
  }
  return source;
}

function getPyBracketDelta_(text) {
  const source = String(text || '');
  let delta = 0;
  let quote = '';
  let escaped = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') delta++;
    if (ch === ')' || ch === ']' || ch === '}') delta--;
  }
  return delta;
}

function splitPyTopLevelSemicolon_(text) {
  const source = String(text || '');
  const parts = [];
  let start = 0;
  let depth = 0;
  let quote = '';
  let escaped = false;

  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (escaped) {
      escaped = false;
      continue;
    }
    if (ch === '\\') {
      escaped = true;
      continue;
    }
    if (quote) {
      if (ch === quote) quote = '';
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      continue;
    }
    if (ch === '(' || ch === '[' || ch === '{') depth++;
    if (ch === ')' || ch === ']' || ch === '}') depth--;
    if (ch === ';' && depth === 0) {
      parts.push(source.slice(start, i).trim());
      start = i + 1;
    }
  }
  parts.push(source.slice(start).trim());
  return parts.filter(Boolean);
}

function getPyIndentWidth_(line) {
  const match = String(line || '').match(/^[ \t]*/);
  return String(match ? match[0] : '').replace(/\t/g, '    ').length;
}

function getPyStatementType_(text) {
  const normalized = String(text || '').trim().toLowerCase();
  const match = normalized.match(
    /^(if|elif|else|for|while|try|except|finally|with|def|class|match|case)\b/
  );
  return match ? match[1] : 'statement';
}

function isPyBlockStatement_(text) {
  return /:\s*$/.test(String(text || '').trim());
}

function isPyNodeDescendantOf_(nodes, nodeIndex, ancestorIndex) {
  let parentIndex = nodes[nodeIndex] ? nodes[nodeIndex].parentIndex : null;
  while (parentIndex !== null && parentIndex !== undefined) {
    if (parentIndex === ancestorIndex) return true;
    parentIndex = nodes[parentIndex] ? nodes[parentIndex].parentIndex : null;
  }
  return false;
}

function buildPyBranchChains_(nodes) {
  const childrenByParent = {};
  (nodes || []).forEach(node => {
    const key = node.parentIndex === null ? 'root' : String(node.parentIndex);
    if (!childrenByParent[key]) childrenByParent[key] = [];
    childrenByParent[key].push(node.index);
  });

  const chains = [];
  Object.keys(childrenByParent).forEach(key => {
    const siblings = childrenByParent[key];
    for (let i = 0; i < siblings.length; i++) {
      const first = nodes[siblings[i]];
      if (!first || first.type !== 'if') continue;
      const clauses = [{ nodeIndex: first.index, type: 'if' }];
      let j = i + 1;
      while (j < siblings.length) {
        const next = nodes[siblings[j]];
        if (!next || (next.type !== 'elif' && next.type !== 'else')) break;
        clauses.push({ nodeIndex: next.index, type: next.type });
        j++;
        if (next.type === 'else') break;
      }
      chains.push({
        startLine: first.startLine,
        parentIndex: first.parentIndex,
        clauses,
      });
    }
  });
  return chains;
}
  var ENGINE = 'legacy-python-text-20261014-v1';
  function grade(snapshot, input) {
    PythonEditor.assert(snapshot.engineVersion === ENGINE && snapshot.rules && Array.isArray(snapshot.ranges), 'snapshot_invalid');
    var regions;
    try { regions = PythonEditor.extract(input.code, snapshot.ranges); }
    catch (e) {
      if (e.pythonEditorCode !== 'markers_invalid') throw e;
      return { score: 0, engineVersion: ENGINE, checks: [{ label: '採点区間のマーカー', passed: false, points: 1, earned: 0 }], diagnostics: ['採点区間のマーカーを雛形どおりに残してください。'] };
    }
    var usableOutput = ['success', 'error'].indexOf(input.run.outcome) >= 0 && !input.run.truncated;
    var items = snapshot.ranges.map(function (r) {
      PythonEditor.assert(Object.prototype.hasOwnProperty.call(snapshot.rules, r.scoringId), 'snapshot_invalid');
      return evaluatePyQuestionRule_(r.scoringId, snapshot.rules[r.scoringId], { title: '', cell: {
        source: [regions[r.scoringId]], whole: [input.code], execution_count: usableOutput ? 1 : null,
        outputs: [{ output_type: 'stream', text: usableOutput ? input.run.outputText : '' }]
      } });
    });
    var score = calcScoreFromItems(items), checks = [];
    PythonEditor.assert(typeof score === 'number' && Number.isFinite(score), 'snapshot_invalid');
    items.forEach(function (item, index) {
      var prefix = items.length > 1 ? '区間' + (index + 1) + '・' : '';
      checks.push({ label: prefix + 'コードの行数', passed: item.codeOk, points: 1, earned: item.codeOk ? 1 : 0 });
      if (item.scoreModel === 'rulesV2') {
        var counts = { code: 0, output: 0 };
        (item.ruleChecks || []).forEach(function (check) {
          if (!check.eligible || !(check.points > 0)) return;
          counts[check.target]++;
          // keyword、模範コード、教員メモ、実際の基準名は公開しない。
          checks.push({ label: prefix + (check.target === 'output' ? '出力条件' : 'コード条件') + counts[check.target],
            passed: check.passed, points: check.points, earned: check.earnedPoints });
        });
      } else {
        if (typeof item.outOk === 'boolean') checks.push({ label: prefix + '出力条件', passed: item.outOk, points: 1, earned: item.outOk ? 1 : 0 });
        Object.keys(item.kwHits || {}).forEach(function (kw, i) {
          checks.push({ label: prefix + 'コード条件' + (i + 1), passed: item.kwHits[kw], points: 1, earned: item.kwHits[kw] ? 1 : 0 });
        });
      }
    });
    return { score: score, engineVersion: ENGINE, checks: checks,
      diagnostics: usableOutput ? [] : ['実行結果が未確定、または上限を超えたため、出力テキストを採点へ使用していません。'] };
  }
  return { engineVersion: ENGINE, parseRules: loadScoringRulesFromValues_, grade: grade };

})();
