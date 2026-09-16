'use strict';
const assert = require('assert');
const IlapoLocalAutosave = require('../local-autosave.js');

function handle(name) {
  let bytes = new Uint8Array(0), modified = 1, writes = 0;
  return {
    name,
    async isSameEntry(other) { return !!other && other.name === name; },
    async getFile() { return { size: bytes.length, lastModified: modified }; },
    async createWritable() { return { async write(value) { bytes = value; writes += 1; modified += 1; }, async close() {}, async abort() {} }; },
    externalChange() { bytes = new Uint8Array([9]); modified += 1; },
    get writes() { return writes; }
  };
}

(async () => {
  const events = [], first = handle('first'), explicit = handle('explicit');
  const auto = new IlapoLocalAutosave({ encode: doc => new Uint8Array([doc.value]), onStatus: event => events.push(event) });
  await auto.start({ value: 1 }, first);
  assert.equal(auto.active, true);
  assert.equal(first.writes, 1);
  assert.equal(auto.pending, false);
  await assert.rejects(() => auto.protect(first), /自動保存先/);
  await auto.rememberExplicit(explicit);
  await auto.stop();
  await assert.rejects(() => auto.start({ value: 2 }, explicit), /明示保存先/);

  const changed = handle('changed');
  const guarded = new IlapoLocalAutosave({ encode: doc => new Uint8Array([doc.value]), onStatus: event => events.push(event) });
  await guarded.start({ value: 1 }, changed);
  changed.externalChange();
  assert.equal(await guarded.schedule({ value: 2 }), false);
  assert.equal(guarded.active, false);

  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const oldTarget = handle('old'), newTarget = handle('new');
  let blocked = false;
  const generations = new IlapoLocalAutosave({ encode: async doc => { if (blocked) await gate; return new Uint8Array([doc.value]); } });
  await generations.start({ value: 1 }, oldTarget);
  blocked = true;
  const stale = generations.schedule({ value: 2 });
  generations.stop();
  blocked = false;
  const restarted = generations.start({ value: 3 }, newTarget);
  release();
  await Promise.all([stale, restarted]);
  assert.equal(oldTarget.writes, 1);
  assert.equal(newTarget.writes, 1);
  assert(events.some(event => event.state === 'saving') && events.some(event => event.state === 'saved'));
  console.log('IlapoLocalAutosave tests passed');
})().catch(error => { console.error(error); process.exitCode = 1; });
