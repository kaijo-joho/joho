import assert from 'node:assert/strict';
import core from '../js/digital-errors-core.js';

const binary = core.roundBinaryFraction('0.3');
assert.deepEqual(binary, { original: '0.3', stored: '0.296875', error: '0.003125', bits: '01001100', fractionBits: 8, exact: false });
assert.deepEqual(core.roundBinaryFraction('0.25', 2, 'nearest'), { original: '0.25', stored: '0.25', error: '0', bits: '01', fractionBits: 2, exact: true });
// 0.125 は 2bit の目盛りのちょうど中間。0（偶数）へ丸める。
assert.equal(core.roundBinaryFraction('0.125', 2, 'nearest').stored, '0');
assert.equal(core.roundBinaryFraction('0.375', 2, 'nearest').stored, '0.5');
assert.throws(() => core.roundBinaryFraction('1'), RangeError);
assert.throws(() => core.roundBinaryFraction('0.1234567'), TypeError);

assert.deepEqual(core.geometricPartial(3), { count: 3, denominator: '8', sum: '0.875', remainder: '0.125', terms: ['0.5', '0.25', '0.125'] });
assert.equal(core.geometricPartial(16).remainder, '0.0000152587890625');
assert.throws(() => core.geometricPartial(0), RangeError);

const loss = core.informationLoss(-4, 4);
assert.equal(loss.large, '1.234');
assert.equal(loss.small, '0.0001234');
assert.equal(loss.exactSum, '1.2341234');
assert.equal(loss.storedSum, '1.234');
assert.equal(loss.lost, true);
assert.equal(core.informationLoss(-6, 8).lost, false);
assert.throws(() => core.informationLoss(-7), RangeError);

assert.deepEqual(core.cancellation(), { left: '0.0316069', right: '0.0315753', difference: '0.0000316', uncertainty: '0.0000001', low: '0.0000315', high: '0.0000317' });

assert.deepEqual(core.signedAddition(70, 63), { left: 70, right: 63, sum: 133, min: -128, max: 127, overflow: true, bits: '10000101', wrapped: -123 });
assert.equal(core.signedAddition(-128, -1).wrapped, 127);
assert.throws(() => core.signedAddition(128, 0), RangeError);
assert.throws(() => core.signedAddition(1.5, 0), TypeError);
assert.throws(() => core.signedAddition(1, 1, 16), RangeError);

assert.equal(core.underflow(14).kind, 'normal');
assert.equal(core.underflow(14).exact, true);
assert.equal(core.underflow(15).kind, 'subnormal');
assert.equal(core.underflow(15).stored, '0.000030517578125');
assert.equal(core.underflow(24).stored, '0.000000059604644775390625');
assert.equal(core.underflow(25).kind, 'subnormal');
assert.equal(core.underflow(26).kind, 'zero');
assert.throws(() => core.underflow(27), RangeError);

assert.deepEqual(core.summationOrder(10, 4), { exact: '1.001', largeFirst: '1', smallFirst: '1.001', smallSubtotal: '0.001' });
assert.equal(core.summationOrder(1000, 4).largeFirst, '1');
assert.equal(core.summationOrder(1000, 8).largeFirst, '1.1');
assert.throws(() => core.summationOrder(11), RangeError);

console.log('digital-errors-core: ok');
