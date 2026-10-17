import test from 'node:test';
import assert from 'node:assert/strict';
import { TrialPanel } from '../trial-ui.mjs';
import { compileAssessment, evaluateAssessment } from '../local-assessment.mjs';
import { setRating } from '../navigation.mjs';
const q = { questionId: 'q1', version: 'v1', setId: 'test', title: '問1', kind: 'code' };
function policy() { return compileAssessment({ schema: 1, question: q, gradingVersion: 'grade-v1', graded: true, ranges: [{ regionId: 'whole', scoringId: 'q1', startMarker: null, endMarker: null }], rules: { q1: { schemaVersion: 2, minLines: 1, rules: [{ ruleId: 'print', target: 'code', ruleType: 'match', stepNo: 1, stepMode: 'single', keyword: 'print', points: 1, enabled: true }] } } }); }
class Element {
  textContent = ''; hidden = false; disabled = false; open = false; children = []; attributes = {}; listeners = new Map(); classList = { toggle() {} };
  addEventListener(type, fn) { this.listeners.set(type, fn); }
  setAttribute(key, value) { this.attributes[key] = value; }
  replaceChildren(...children) { this.children = children; }
  append(...children) { this.children.push(...children); }
  showModal() { this.open = true; }
  close() { this.open = false; }
}
async function dom(task) {
  const names = ['window', 'document', 'location', 'addEventListener'], previous = new Map(names.map(name => [name, Object.getOwnPropertyDescriptor(globalThis, name)])), elements = new Map();
  const element = id => { if (!elements.has(id)) elements.set(id, new Element()); return elements.get(id); };
  Object.assign(globalThis, { window: {}, document: { activeElement: null, getElementById: element, createElement: () => new Element() }, location: { origin: 'https://editor.example.test' }, addEventListener() {} });
  try { await task(element); } finally { for (const [name, descriptor] of previous) { if (descriptor) Object.defineProperty(globalThis, name, descriptor); else delete globalThis[name]; } }
}
const host = () => ({ question: () => q, entry: () => ({ ...q, code: 'print(1)', stdin: '' }), run: () => null, running: () => false, closeMenus() {}, notice() {}, renderRatings() {} });
function panel(overrides = {}) { return Object.assign(Object.create(TrialPanel.prototype), { host: host(), client: { policy: () => policy(), pending: () => null }, config: { enabled: false }, connected: true, working: false, generation: 1,
  states: new Map(), ratings: new Map(), readEpochs: new Map(), comparisons: new Map(), keys: new Set(['v1/q1']), withWork: async fn => fn(), ...overrides }); }

test('trial constructor labels the separate flow and leaves a disabled endpoint disconnected', async () => dom(element => {
  const p = new TrialPanel(host(), { config: { enabled: false, bridgeURL: '' } });
  assert.equal(element('trial-mode-note').hidden, false); assert.match(element('formal-title').textContent, /試用/); assert.match(element('formal-submit-label').textContent, /試用/);
  assert.equal(element('cloud-connect').disabled, true); assert.equal(element('formal-submit').disabled, true); assert.equal(p.rating(q), null);
  assert.match(element('formal-note').textContent, /正答の証明や本番成績には使いません/);
}));
test('preview freezes code, normalized run and local assessment without turning it into accepted stars', async () => dom(async element => {
  const p = panel({ evaluateAssessment }); await p.prepareSubmit();
  const preview = JSON.parse(element('submit-preview').textContent);
  assert.equal(preview.code, 'print(1)'); assert.equal(preview.run.outcome, 'not_run'); assert.equal(preview.assessment.starEarned, 1);
  assert.equal(p.ratings.size, 0); assert.equal(p.states.size, 0); assert.equal(element('submit-dialog').open, true); assert.match(element('submit-description').textContent, /本番成績へ反映しません/);
}));
test('a pending immutable request is previewed unchanged after subsequent edits', async () => dom(async element => {
  const input = { questionId: 'q1', version: 'v1', requestId: 'a'.repeat(32), code: 'old code', assessment: { old: true } };
  const p = panel({ client: { policy, pending: () => ({ input }) }, evaluateAssessment: () => { throw new Error('must not re-evaluate pending request'); } });
  await p.prepareSubmit(); assert.deepEqual(JSON.parse(element('submit-preview').textContent), input); assert.match(element('submit-description').textContent, /同じ番号/);
}));
test('only an accepted trial response updates ratings and history; a draft flush stays independent', async () => dom(async element => {
  const events = [], result = { receipt: { state: 'submitted' }, rating: { earned: 1, total: 2, version: 'v1', trial: true }, history: [{ score: 0.5 }] };
  const client = { policy, pending: () => null, submit: async input => { events.push(['submit', input.code]); return result; } };
  const p = panel({ client, flushDrafts: async () => { events.push(['draft']); return { saved: false }; } });
  p.submission = { q, client, input: { code: 'snapshot' } }; await p.submit();
  assert.deepEqual(events, [['draft'], ['submit', 'snapshot']]); assert.equal(p.rating(q).trial, true); assert.equal(p.states.get('v1/q1').history.length, 1); assert.equal(element('submit-dialog').open, false);
}));
test('an ungraded confirmation stays cloud-saveable but its submission is disabled', async () => dom(element => {
  const confirmation = { ...q, kind: 'confirmation' }, h = host(); h.question = () => confirmation;
  const p = panel({ host: h, client: { policy: () => null, pending: () => null, session: { account: 'synthetic', viewerRole: 'demo' } }, drafts: { connected: true, render() {} } });
  p.render(); assert.equal(element('formal-submit').disabled, true); assert.equal(element('save-cloud').disabled, false); assert.equal(p.ratings.size, 0);
}));
test('ungraded catalog items contribute no invented stars and do not hide the scored trial aggregate', () => {
  const ungraded = { ...q, questionId: 'ungraded' }, p = panel({ client: { policy: item => item.questionId === q.questionId ? policy() : null } });
  p.keys.add('v1/ungraded'); p.ratings.set('v1/q1', { earned: 1, total: 1, version: 'v1', trial: true });
  assert.deepEqual(p.rating(ungraded), { earned: 0, total: 0, version: 'v1', trial: true });
  assert.deepEqual(setRating({ questions: [q, ungraded] }, item => p.rating(item)), { earned: 1, total: 1, example: false, trial: true });
  assert.equal(p.rating({ ...ungraded, questionId: 'outside-catalog' }), null);
});
test('a delayed response or failure from an earlier session never updates the newer session', async () => dom(async () => {
  let reject; const delayed = new Promise((_yes, no) => { reject = no; });
  const p = panel({ client: { policy, pending: () => null, recover: () => delayed }, render() {} }); const old = p.refreshCurrent(); await Promise.resolve();
  p.generation++; p.client = { policy, pending: () => null }; reject(new Error('old session disconnected')); await old; assert.equal(p.states.size, 0);
}));
