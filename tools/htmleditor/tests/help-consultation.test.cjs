const assert = require('node:assert/strict');
const test = require('node:test');
const {validatedUrl} = require('../help-consultation.js');

const handoff = import('../../../help-desk/preview/handoff.mjs');

test('accepts the existing school consultation link and known guide routes', async () => {
  const {deskHandoffUrl} = await handoff;
  const targetId = 'htmleditor';
  const noGuide = deskHandoffUrl({targetId});
  const guide = deskHandoffUrl({targetId, guideId:'htmleditor:op-open', guideRevision:3});
  assert.equal(validatedUrl(noGuide, 3).href, noGuide);
  assert.equal(validatedUrl(guide, 3).href, guide);
  assert.equal(validatedUrl(guide, 2), null);
});

test('rejects unapproved hosts, paths, accounts, fragments and query parameters', async () => {
  const {deskHandoffUrl} = await handoff;
  const valid = deskHandoffUrl({targetId:'htmleditor', guideId:'htmleditor:op-open', guideRevision:3});
  for (const value of [
    valid.replace('script.google.com', 'example.invalid'), valid.replace('/exec?', '/dev?'),
    valid.replace('https://', 'https://user@'), valid.replace('https://', 'http://'),
    valid.replace('app=htmleditor', 'app=pythoneditor'), valid.replace('op-open', 'op-unknown'),
    valid.replace(/release=[0-9a-f]+$/, 'release=' + '0'.repeat(64)), valid + '#value',
    valid + '&app=htmleditor', valid + '&text=local', valid + '&embed=help-desk',
    valid + '&parent=site',
    valid.replace('&guideRevision=3', ''), new URL(valid), null,
  ]) assert.equal(validatedUrl(value, 3), null, String(value));
});
