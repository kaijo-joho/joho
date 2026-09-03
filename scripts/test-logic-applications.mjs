import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectRoot = path.resolve(scriptDirectory, '..');
const source = await readFile(path.join(projectRoot, 'js', 'logic-applications.js'), 'utf8');

const context = vm.createContext({
  console,
  document: {
    readyState: 'loading',
    addEventListener() {}
  }
});
vm.runInContext(source, context, { filename: 'logic-applications.js' });

const applications = context.LogicApplications;
assert.ok(applications, 'LogicApplicationsが公開されている');
assert.deepEqual(
  Array.from(applications.CIRCUITS, circuit => circuit.name),
  ['多数決回路', '比較回路', '半加算回路', '全加算回路']
);

const expected = {
  majority: { F: '00010111' },
  comparator: { G: '0010', E: '1001', L: '0100' },
  halfAdder: { S: '0110', C: '0001' },
  fullAdder: { S: '01101001', Cout: '00010111' }
};

for (const circuit of applications.CIRCUITS) {
  const rows = applications.makeRows(circuit);
  assert.equal(rows.length, 2 ** circuit.inputs.length, `${circuit.id}の行数`);
  for (const output of circuit.outputs) {
    const code = rows.map(row => row.outputs[output]).join('');
    assert.equal(code, expected[circuit.id][output], `${circuit.id}.${output}の真理値`);
  }
}

const gateNames = Array.from(source.matchAll(/gate:\s*'([^']+)'/g), match => match[1]);
assert.ok(gateNames.length > 0, '回路図にゲートが定義されている');
assert.equal(gateNames.every(name => ['AND', 'OR', 'NOT'].includes(name)), true, '回路図はAND・OR・NOTだけを使用する');

console.log(`logic-applications: ${applications.CIRCUITS.length}回路の真理値と基本ゲート構成を検証`);
