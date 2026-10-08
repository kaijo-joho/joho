const test = require('node:test');
const assert = require('node:assert/strict');
const Clipboard = require('../clipboard.js');

function fixture(prefix = '') {
  const secret = '<!-- joho-issued-html:SECRET -->';
  const cm = {value:prefix + secret + '\n<h1>本文</h1>', ranges:[], lineWise:true, getValue() { return this.value; },
    indexFromPos(pos) { return this.value.split('\n').slice(0, pos.line).reduce((n, line) => n + line.length + 1, 0) + pos.ch; },
    posFromIndex(index) { const lines = this.value.slice(0, index).split('\n'); return {line:lines.length - 1, ch:lines.at(-1).length}; },
    listSelections() { return this.ranges; }, getOption() { return this.lineWise; }};
  const listeners = new Map(), notices = [];
  const wrapper = {addEventListener(type, listener, capture) { assert.equal(capture, true); listeners.set(type, listener); }};
  cm.getWrapperElement = () => wrapper;
  const marker = {find:() => ({from:cm.posFromIndex(prefix.length), to:cm.posFromIndex(prefix.length + secret.length)})};
  const select = (...ranges) => { cm.ranges = ranges.map(([from, to]) => ({anchor:cm.posFromIndex(from), head:cm.posFromIndex(to)})); };
  select([0, cm.value.length]);
  let currentMarker = marker;
  Clipboard.install(cm, () => currentMarker, (...message) => notices.push(message));
  function dispatch(type, {unavailable = false, throws = false, widget = false} = {}) {
    const data = new Map([['text/html', 'stale data']]);
    const event = {prevented:false, stopped:false, target:{closest:() => widget},
      preventDefault() { this.prevented = true; }, stopImmediatePropagation() { this.stopped = true; },
      clipboardData:unavailable ? null : {clearData() { data.clear(); }, setData(key, value) { if (throws) throw Error('synthetic denied'); data.set(key, value); }}};
    listeners.get(type)(event);
    return {event, data};
  }
  return {cm, marker, select, dispatch, notices, secret, setMarker:value => { currentMarker = value; }};
}

test('全選択のコピーでは配付情報だけを除去し、HTML原文は保存・提出用に保持する', () => {
  const h = fixture(), original = h.cm.value;
  const {event, data} = h.dispatch('copy');
  assert.equal(event.prevented, true); assert.equal(event.stopped, true);
  assert.equal(data.get('text/plain'), '\n<h1>本文</h1>'); assert.equal(data.has('text/html'), false);
  assert.equal(h.cm.value, original); assert.match(h.cm.value, /SECRET/);
});
test('配付情報だけ・部分選択・逆向き選択でも生の情報を出さない', () => {
  const h = fixture('前置き\n'), start = 4, end = start + h.secret.length;
  for (const range of [[start, end], [start + 3, end - 2], [end, start], [0, end - 2], [end - 2, h.cm.value.length]]) {
    h.select(range); const {event, data} = h.dispatch('copy');
    assert.equal(event.prevented, true); assert.doesNotMatch(data.get('text/plain'), /SECRET|joho-issued/);
  }
});
test('本文だけのコピー・切り取り・ドラッグは元のCodeMirror処理を変えない', () => {
  const h = fixture(); h.select([h.secret.length + 1, h.cm.value.length]);
  for (const type of ['copy','cut','dragstart']) assert.equal(h.dispatch(type).event.prevented, false);
  assert.equal(h.notices.length, 0);
});
test('選択なしの行コピーでも配付情報を除く。通常の行・lineWise無効は変更しない', () => {
  const h = fixture(); h.select([h.secret.length, h.secret.length]);
  assert.equal(h.dispatch('copy').data.get('text/plain'), '\n');
  h.cm.lineWise = false; assert.equal(h.dispatch('copy').event.prevented, false);
  h.cm.lineWise = true; h.select([h.secret.length + 2, h.secret.length + 2]);
  assert.equal(h.dispatch('copy').event.prevented, false);
});
test('複数の選択範囲にも配付情報を混ぜない', () => {
  const h = fixture('前置き\n'); h.select([0, 4], [4, 4 + h.secret.length], [4 + h.secret.length + 1, h.cm.value.length]);
  assert.equal(h.dispatch('copy').data.get('text/plain'), '前置き\n\n\n<h1>本文</h1>');
});
test('保護範囲の切り取りとドラッグは中止し、本文も勝手に削除しない', () => {
  const h = fixture(), original = h.cm.value;
  for (const type of ['cut','dragstart']) {
    const {event} = h.dispatch(type); assert.equal(event.prevented, true); assert.equal(event.stopped, true);
    assert.equal(h.cm.value, original); assert.equal(h.notices.at(-1)[1], 'warning');
  }
  h.select([h.cm.value.length, h.cm.value.length]);
  assert.equal(h.dispatch('dragstart', {widget:true}).event.prevented, true);
});
test('クリップボード拒否・取得失敗でも元の配付情報をコピーしない', () => {
  const h = fixture();
  for (const options of [{unavailable:true}, {throws:true}]) {
    const {event} = h.dispatch('copy', options); assert.equal(event.prevented, true); assert.equal(event.stopped, true);
    assert.equal(h.notices.at(-1)[1], 'warning');
  }
  h.cm.listSelections = () => { throw Error('synthetic selection failure'); };
  assert.equal(h.dispatch('copy').data.get('text/plain'), '');
});
test('最新のマーカーを使い、通常ファイルへ切替後はコピーを妨げない', () => {
  const h = fixture();
  h.setMarker({find:() => ({from:h.cm.posFromIndex(0), to:h.cm.posFromIndex(h.secret.length + 1)})});
  assert.equal(h.dispatch('copy').data.get('text/plain'), '<h1>本文</h1>');
  h.setMarker(null); assert.equal(h.dispatch('copy').event.prevented, false);
});
