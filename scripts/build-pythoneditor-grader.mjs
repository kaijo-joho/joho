// 明示されたgrade原本から純粋な判定関数だけを固定版へ取り込む。旧GASは変更しない。
import { readFile, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { resolve } from 'node:path';
import vm from 'node:vm';
const arg = name => { const n = process.argv.indexOf(name); return n >= 0 ? process.argv[n + 1] : null; };
const source = arg('--source');
if (!source) throw new Error('--sourceで確認済みgrade原本のディレクトリを指定してください。');
const selected = {
  '02_check_common.js': ['parseKeywordString','normalizeKeywordText_','normalizeKeywordWhitespace_','compactKeywordText_','hasKeywordWhitespace_','escapeRegExpLiteral_'],
  '10_py_check.js': ['evaluatePyQuestionRule_','isPyScoredRuleCheck_','buildPyRuleHitMap_','normalizeOutput','loadScoringRulesFromValues_',
    'loadScoringRulesV2FromRows_','getPyRuleCell_','normalizePyRuleEnabled_','wordHit','outputWordHit_','joinOutputsSafe','calcScoreFromItems'],
  '12_formula_equivalence.js': null,
  '15_py_rule_engine.js': null
};
const hashes = {}, chunks = [];
for (const [file, names] of Object.entries(selected)) {
  const code = await readFile(resolve(source, file), 'utf8');
  hashes[file] = createHash('sha256').update(code).digest('hex');
  const functions = [...code.matchAll(/^function ([A-Za-z0-9_]+)\([^]*?^}/gm)];
  if (!functions.length || names?.some(name => !functions.some(f => f[1] === name))) throw new Error(`${file}の関数構造が変わっています。自動取込みを中止します。`);
  chunks.push(`// ${file}: 確認済み純粋関数\n` + functions.filter(f => !names || names.includes(f[1])).map(f => f[0]).join('\n\n'));
}
const adapter = await readFile(new URL('./pythoneditor-gas/grader-adapter.txt', import.meta.url), 'utf8');
const result = '// 固定された判定エンジン。旧版に影響するため、この版を上書き更新しない。\n' +
  '// 原本SHA-256: ' + JSON.stringify(hashes) + '\nvar PythonEditorGraderV1 = (function () {\n' + chunks.join('\n\n') + '\n' + adapter + '\n})();\n';
new vm.Script(result);
const output=arg('--output')||new URL('./pythoneditor-gas/13_python_editor_grader.js',import.meta.url);
let prior;try{prior=await readFile(output,'utf8');}catch(e){if(e.code!=='ENOENT')throw e;}
if(prior!==undefined&&prior!==result)throw new Error('固定版を異なる原本で上書きできません。エンジンID・namespaceを含む新しい版を別途用意してください。');
if(prior===undefined)await writeFile(output,result);
console.log(JSON.stringify({ sourceHashes: hashes, outputHash: createHash('sha256').update(result).digest('hex'), bytes: Buffer.byteLength(result) }));
