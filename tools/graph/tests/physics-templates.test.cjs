const assert = require('assert');
const Core = require('../core.js');
const Expression = require('../expression.js');
const Physics = require('../physics-templates.js');

const templates = Physics.list();
assert.strictEqual(templates.length, 6);
assert.strictEqual(new Set(templates.map(template => template.id)).size, 6);
function parameterExtremes(parameters, index = 0, scope = {}) {
  if (index === parameters.length) return [scope];
  const parameter = parameters[index], next = [];
  for (const value of [parameter.min, parameter.max]) next.push(...parameterExtremes(parameters, index + 1, { ...scope, [parameter.name]: value }));
  return next;
}
for (const template of templates) {
  assert.strictEqual(template.category, '物理');
  assert.ok(template.name && template.description);
  const document = Core.validateDocument(template.document);
  assert.strictEqual(document.version, 10, template.id);
  assert.strictEqual(document.format, 'kaijo-graph');
  for (const item of document.series) {
    assert.strictEqual(item.source.kind, 'model');
    assert.match(item.source.notes, /実測値ではありません/);
    assert.ok(item.source.url.startsWith('https://openstax.org/'));
    const scopes = parameterExtremes(document.parameters);
    if (item.kind === 'function') {
      const samples = [item.domain.x[0], (item.domain.x[0] + item.domain.x[1]) / 2, item.domain.x[1]];
      const compiled = Expression.compile(item.expression, { variables: ['x', ...document.parameters.map(parameter => parameter.name)], angle: document.angle });
      for (const scope of scopes) for (const x of samples) assert.ok(Number.isFinite(compiled.evaluate({ ...scope, x })), `${template.id}: ${item.id} x=${x}`);
    }
    if (item.kind === 'parametric') {
      const compiledX = Expression.compile(item.components.x, { variables: ['t', ...document.parameters.map(parameter => parameter.name)], angle: document.angle });
      const compiledY = Expression.compile(item.components.y, { variables: ['t', ...document.parameters.map(parameter => parameter.name)], angle: document.angle });
      for (const scope of scopes) for (const t of [item.interval[0], (item.interval[0] + item.interval[1]) / 2, item.interval[1]]) {
        assert.ok(Number.isFinite(compiledX.evaluate({ ...scope, t })), `${template.id}: ${item.id} x(t=${t})`);
        assert.ok(Number.isFinite(compiledY.evaluate({ ...scope, t })), `${template.id}: ${item.id} y(t=${t})`);
      }
    }
  }
}

function evaluate(expression, document, scope) {
  return Expression.compile(expression, { variables: ['x', ...document.parameters.map(parameter => parameter.name)], angle: document.angle }).evaluate(scope);
}
const acceleration = templates.find(template => template.id === 'physics-uniform-acceleration-position').document;
const accelerationSeries = acceleration.series[0];
assert.strictEqual(evaluate(accelerationSeries.expression, acceleration, { x: 0, s0: 3, v0: 9, a: -2 }), 3);
assert.strictEqual(evaluate(accelerationSeries.expression, acceleration, { x: 2, s0: 3, v0: 9, a: -2 }), 17);

const projectile = templates.find(template => template.id === 'physics-projectile-trajectory').document;
const path = projectile.series[0];
assert.strictEqual(projectile.angle, 'deg');
assert.deepStrictEqual(path.interval, [0, 1]);
for (const v0 of [10, 35]) for (const theta of [15, 45, 75]) {
  const scope = { v0, theta, t: 1 };
  const y = Expression.compile(path.components.y, { variables: ['t', 'v0', 'theta'], angle: projectile.angle }).evaluate(scope);
  const x = Expression.compile(path.components.x, { variables: ['t', 'v0', 'theta'], angle: projectile.angle }).evaluate(scope);
  assert.ok(Math.abs(y) < 1e-9, `着地点 y=${y}`);
  assert.ok(x > 0, `到達距離 x=${x}`);
}

const harmonic = templates.find(template => template.id === 'physics-simple-harmonic-motion').document;
assert.strictEqual(evaluate(harmonic.series[0].expression, harmonic, { x: 0, A: 2, f: 1, phi: 0 }), 2);
assert.ok(Math.abs(evaluate(harmonic.series[0].expression, harmonic, { x: .25, A: 2, f: 1, phi: 0 })) < 1e-12);

const waves = templates.find(template => template.id === 'physics-wave-superposition-beats').document;
assert.strictEqual(evaluate(waves.series[2].expression, waves, { x: 0, A: 1, f1: 4, f2: 4.5 }), 0);

const ohm = templates.find(template => template.id === 'physics-ohms-law').document;
assert.strictEqual(evaluate(ohm.series[0].expression, ohm, { x: 12, R: 100 }), 120);
assert.strictEqual(ohm.axes.y.unit, 'mA');

const rc = templates.find(template => template.id === 'physics-rc-charging').document;
assert.strictEqual(evaluate(rc.series[0].expression, rc, { x: 0, E: 5, R: 1, C: 1000 }), 0);
assert.ok(Math.abs(evaluate(rc.series[0].expression, rc, { x: 1, E: 5, R: 1, C: 1000 }) - 5 * (1 - Math.exp(-1))) < 1e-12);
for (const R of [.1, 5]) for (const C of [10, 1000]) {
  const atEnd = evaluate(rc.series[0].expression, rc, { x: 15, E: 12, R, C });
  assert.ok(Number.isFinite(atEnd) && atEnd >= 0 && atEnd <= 12);
}

const copy = Physics.list();
copy[0].document.name = '変更';
copy[0].document.parameters[0].value = 99;
assert.notStrictEqual(Physics.list()[0].document.name, '変更');
assert.notStrictEqual(Physics.list()[0].document.parameters[0].value, 99);
console.log('physics templates tests passed');
