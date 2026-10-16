import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const source = new URL('../tools/pythoneditor/confirmation.mjs', import.meta.url);
const destination = new URL('./pythoneditor-gas/45_python_editor_confirmation.js', import.meta.url);
const names = ['CHECK_TYPES','refKey','parseCodeRefs','normalizeCheck','publicCheck','validateConfirmationQuestion','validateReferenceGraph','normalizeTrial','evaluateCheck'];
const body = (await readFile(source, 'utf8')).replace(/^export /gm, '');
const output = '// GENERATED: node scripts/build-pythoneditor-confirmation.mjs\n// 正本: tools/pythoneditor/confirmation.mjs。手で編集しない。\nvar PythonEditorConfirmation = (function () {\n\'use strict\';\n' + body + '\nreturn Object.freeze({ ' + names.join(', ') + ' });\n})();\n';
if (process.argv.includes('--check')) {
  if (await readFile(destination, 'utf8') !== output) throw new Error('確認問題のGAS生成物が正本と一致しません。');
  console.log('Python confirmation GAS: OK');
} else { await writeFile(destination, output); console.log(fileURLToPath(destination)); }
