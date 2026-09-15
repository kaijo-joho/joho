const assert = require('assert');
const Symbols = require('../symbols.js');
const doc = { axes: { x: { symbol: 'ξ' }, y: { symbol: '高さ' }, z: { symbol: 'ζ' } } };

assert.equal(Symbols.validateAxes(doc.axes, [{ name: 'a' }]), true);
for (const axes of [
  { x: { symbol: 'x' }, y: { symbol: 'x' }, z: { symbol: 'z' } },
  { x: { symbol: 'sin' }, y: { symbol: 'y' }, z: { symbol: 'z' } },
  { x: { symbol: 'π' }, y: { symbol: 'y' }, z: { symbol: 'z' } },
  { x: { symbol: 'a' }, y: { symbol: 'y' }, z: { symbol: 'z' } },
  { x: { symbol: 'x+' }, y: { symbol: 'y' }, z: { symbol: 'z' } }
]) assert.throws(() => Symbols.validateAxes(axes, [{ name: 'a' }]), /軸記号/);

assert.equal(Symbols.toCanonical('高さ=sin(ξ)+a+1e3+xy+π', doc, 'function'), 'y=sin(x)+a+1e3+xy+pi');
assert.equal(Symbols.toDisplay('y=sin(x)+a+1e3+xy+pi', doc, 'function'), '高さ=sin(ξ)+a+1e3+xy+π');
assert.equal(Symbols.toCanonical('z=x*y', doc, 'surface'), 'z=x*y');
assert.equal(Symbols.toDisplay('x^2+y^2=9', doc, 'implicit'), 'ξ^2+高さ^2=9');
assert.equal(Symbols.toCanonical('cos(t)+theta+π+ξ', doc, 'parametric'), 'cos(t)+theta+pi+ξ');
assert.equal(Symbols.toCanonical('2*cos(θ)+π+ξ', doc, 'polar'), '2*cos(theta)+pi+ξ');
assert.equal(Symbols.toDisplay('2*cos(theta)+pi+ξ', doc, 'polar'), '2*cos(θ)+π+ξ');
const swapped = { axes: { x: { symbol: 'y' }, y: { symbol: 'x' }, z: { symbol: 'z' } } };
assert.equal(Symbols.toCanonical('y=x+oldx+1e3', swapped, 'function'), 'x=y+oldx+1e3');
assert.equal(Symbols.toDisplay('x=y+oldx+1e3', swapped, 'function'), 'y=x+oldx+1e3');

assert.equal(Symbols.richText('<b>m^2</b>\nv_{max} + a_1'), '&lt;b&gt;m<sup>2</sup>&lt;/b&gt;<br>v<sub>max</sub> + a<sub>1</sub>');
assert(!Symbols.richText('x^{<img>}').includes('<img>'));
assert.equal(Symbols.formatTick(Math.PI / 2, 'pi'), 'π/2');
assert.equal(Symbols.formatTick(-2 * Math.PI, 'pi'), '-2π');
assert.equal(Symbols.formatTick(.75, 'fraction'), '3/4');
assert.equal(Symbols.formatTick(1.25, 'decimal'), '1.25');
assert.notEqual(Symbols.formatTick(1e-13, 'decimal'), '0');
assert.notEqual(Symbols.formatTick(1e-13, 'fraction'), '0');
assert.notEqual(Symbols.formatTick(1e-13, 'pi'), '0');

assert.deepEqual(Symbols.ticksFor({ min: -Math.PI, max: Math.PI, scale: 'linear', ticks: { step: Math.PI / 2, format: 'pi' } }).ticktext, ['-π', '-π/2', '0', 'π/2', 'π']);
const many = Symbols.ticksFor({ min: 0, max: 1000, scale: 'linear', ticks: { step: 1, format: 'decimal' } });
assert(many.tickvals.length <= 200 && many.tickvals.length > 1);
assert.deepEqual(Symbols.ticksFor({ min: 1, max: 1000, scale: 'log', ticks: { step: 1, format: 'decimal' } }), {});
assert.deepEqual(Symbols.ticksFor({ min: 0, max: 10, scale: 'linear', ticks: { step: null, format: 'auto' } }), {});
const automatic = Symbols.ticksFor({ min: -5, max: 5, scale: 'linear', ticks: { step: Math.PI / 2, format: 'auto' } });
assert(automatic.tickvals.includes(0) && automatic.tickvals.every((value, index) => index === 0 || value > automatic.tickvals[index - 1]), 'auto書式でも手動stepを使う');
const piAutoStep = Symbols.ticksFor({ min: -5, max: 5, scale: 'linear', ticks: { step: null, format: 'pi' } });
assert(piAutoStep.tickvals.includes(0) && piAutoStep.ticktext.some(value => value.includes('π')));
const sparsePi = Symbols.ticksFor({ min: 0, max: 1000, scale: 'linear', ticks: { step: Math.PI / 2, format: 'pi' } });
assert(sparsePi.tickvals.length <= 200 && sparsePi.tickvals.slice(1).every((value, index) => Math.abs((value - sparsePi.tickvals[index]) / (Math.PI / 2) - Math.round((value - sparsePi.tickvals[index]) / (Math.PI / 2))) < 1e-9));
assert(Symbols.ticksFor({ min: 0, max: 10, scale: 'linear', ticks: { step: null, format: 'decimal' } }).tickvals.length > 1);
const extreme = Symbols.ticksFor({ min: 0, max: 1e300, scale: 'linear', ticks: { step: 1e-300, format: 'decimal' } });
assert(extreme.tickvals.length > 1 && extreme.tickvals.length <= 200 && extreme.tickvals.every(Number.isFinite));
console.log('symbols.test.cjs: ok');
