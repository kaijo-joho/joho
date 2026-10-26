const test = require('node:test');
const assert = require('node:assert/strict');
const layout = require('../layout.js');

class FixtureNode {
  constructor(id = '') {
    this.id = id;
    this.style = {};
    this.dataset = {};
    this.attributes = new Map();
    this.listeners = new Map();
    this.classNames = new Set();
    this.classList = {
      contains: name => this.classNames.has(name),
      add: name => this.classNames.add(name),
      remove: name => this.classNames.delete(name),
      toggle: (name, force) => {
        const enabled = force === undefined ? !this.classNames.has(name) : Boolean(force);
        if (enabled) this.classNames.add(name); else this.classNames.delete(name);
        return enabled;
      }
    };
    this.clientWidth = 0;
    this.width = 0;
    this.capture = new Set();
    this.focusCalls = 0;
  }
  addEventListener(type, fn) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(fn);
  }
  removeEventListener(type, fn) { this.listeners.get(type)?.delete(fn); }
  emit(type, values = {}) {
    const event = {type, currentTarget:this, target:this, preventDefault() { this.defaultPrevented = true; }, ...values};
    for (const fn of [...(this.listeners.get(type) || [])]) fn(event);
    return event;
  }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  querySelector() { return null; }
  contains(node) { return node === this; }
  focus() { this.focusCalls++; }
  setPointerCapture(id) { this.capture.add(id); }
  hasPointerCapture(id) { return this.capture.has(id); }
  releasePointerCapture(id) { this.capture.delete(id); }
  getBoundingClientRect() {
    const parsed = Number.parseFloat(this.style.width);
    return {width:Number.isFinite(parsed) ? parsed : this.width};
  }
}

function fixture({compact = false, hasDocument = true, stored = null, storageThrows = false} = {}) {
  const body = new FixtureNode('body');
  if (hasDocument) body.classList.add('has-document');
  const nodes = Object.fromEntries(['mainContainer','editingPanes','leftPane','rightPane','splitLeft','splitRight','toggleLessonBtn','togglePreviewBtn']
    .map(id => [id, new FixtureNode(id)]));
  nodes.mainContainer.clientWidth = 1400;
  nodes.editingPanes.clientWidth = 900;
  nodes.leftPane.width = 420;
  nodes.rightPane.width = 440;
  nodes.splitLeft.width = nodes.splitRight.width = 10;
  const documentEvents = new FixtureNode('document');
  const document = {
    body, activeElement:null,
    getElementById(id) { assert.ok(nodes[id], `missing fixture node: ${id}`); return nodes[id]; },
    addEventListener:(...args) => documentEvents.addEventListener(...args),
    removeEventListener:(...args) => documentEvents.removeEventListener(...args),
    emit:(...args) => documentEvents.emit(...args)
  };
  const window = new FixtureNode('window');
  window.matchMedia = () => ({matches:compact});
  window.requestAnimationFrame = callback => callback();
  window.ResizeObserver = null;
  window.MutationObserver = null;
  const data = new Map();
  if (stored) data.set(layout.storageKey, JSON.stringify(stored));
  const calls = {set:[], remove:[], storageErrors:0, changes:0};
  const storage = {
    getItem(key) { if (storageThrows) throw Error('read blocked'); return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { calls.set.push([key, value]); data.set(key, value); },
    removeItem(key) { calls.remove.push(key); data.delete(key); }
  };
  const instance = layout.mount({document, window, storage,
    onChange() { calls.changes++; }, onStorageError() { calls.storageErrors++; }});
  return {body, nodes, document, window, data, calls, instance, storage};
}

function pointer(node, type, {id = 7, x = 100, y = 0, button = 0, isPrimary = true} = {}) {
  return node.emit(type, {pointerId:id, clientX:x, clientY:y, button, isPrimary});
}
function pointerClick(h, side = 'left') {
  const bar = h.nodes[side === 'left' ? 'splitLeft' : 'splitRight'];
  pointer(bar, 'pointerdown');
  pointer(bar, 'pointerup');
  bar.emit('click', {detail:1});
}

test('parse accepts only version 1 schema with finite bounded ratios and boolean collapse flags', () => {
  const valid = {v:1,leftRatio:.42,rightRatio:.63,leftCollapsed:true,rightCollapsed:false,extra:'ignored'};
  assert.deepEqual(layout.parse(JSON.stringify(valid)), {v:1,leftRatio:.42,rightRatio:.63,leftCollapsed:true,rightCollapsed:false});
  for (const invalid of [null, {}, {v:2}, {v:'1'}, {v:1,leftRatio:NaN}, {v:1,leftRatio:Infinity},
    {v:1,leftRatio:.049}, {v:1,leftRatio:.951}, {v:1,rightRatio:'0.5'},
    {v:1,leftCollapsed:0}, {v:1,rightCollapsed:null}]) {
    assert.deepEqual(layout.parse(JSON.stringify(invalid)), {...layout.defaults});
  }
  for (const invalid of [undefined, '', '{', 'null', '[]']) assert.deepEqual(layout.parse(invalid), {...layout.defaults});
});

test('pointerup performs one click toggle; assistive-technology click and keyboard activation toggle', () => {
  const h = fixture();
  pointerClick(h, 'left');
  assert.equal(h.instance.state.leftCollapsed, true);
  assert.equal(h.calls.set.length, 1);
  h.nodes.splitLeft.emit('click', {detail:0});
  assert.equal(h.instance.state.leftCollapsed, false);
  for (const key of ['Enter',' ']) {
    h.nodes.splitLeft.emit('keydown', {key});
    assert.equal(h.instance.state.leftCollapsed, true);
    h.nodes.splitLeft.emit('keydown', {key});
    assert.equal(h.instance.state.leftCollapsed, false);
  }
});

test('arrow keys resize by 20px in the side-specific direction and Home collapses', () => {
  const h = fixture();
  const left = h.nodes.splitLeft;
  left.emit('keydown', {key:'ArrowRight'});
  assert.ok(h.instance.state.leftRatio > layout.defaults.leftRatio);
  left.emit('keydown', {key:'ArrowLeft'});
  assert.ok(Math.abs(h.instance.state.leftRatio - layout.defaults.leftRatio) < .02);
  left.emit('keydown', {key:'Home'});
  assert.equal(h.instance.state.leftCollapsed, true);
  h.nodes.splitRight.emit('keydown', {key:'ArrowLeft'});
  assert.ok(h.instance.state.rightRatio > layout.defaults.rightRatio);
});

test('iframe reading position survives collapse, but late restoration never scrolls a replaced document', () => {
  const h=fixture(), scrolls=[], frameDocument={}, frame={contentDocument:frameDocument,
    contentWindow:{scrollX:12,scrollY:700,scrollTo:options=>scrolls.push(options)}};
  h.nodes.leftPane.querySelector=selector=>selector==='iframe'?frame:null;
  pointerClick(h); frame.contentWindow.scrollY=0; pointerClick(h);
  assert.deepEqual(scrolls,[{left:12,top:700,behavior:'instant'}]);
  const queue=[];h.window.requestAnimationFrame=callback=>queue.push(callback);
  frame.contentWindow.scrollY=900;pointerClick(h);pointerClick(h);
  const flush=()=>{while(queue.length)queue.splice(0).forEach(callback=>callback());};
  frame.contentDocument={};flush();
  assert.equal(scrolls.length,1);
  frame.contentWindow.scrollY=400;pointerClick(h);pointerClick(h);h.instance.dispose();
  flush();assert.equal(scrolls.length,1);
});

test('sub-five-pixel pointer jitter toggles; five pixels starts resizing and persists on pointerup', () => {
  const h = fixture();
  const bar = h.nodes.splitLeft;
  pointer(bar, 'pointerdown', {x:100});
  pointer(bar, 'pointermove', {x:104});
  pointer(bar, 'pointerup', {x:104});
  assert.equal(h.instance.state.leftCollapsed, true);
  const resized = fixture();
  const resizedBar = resized.nodes.splitLeft;
  pointer(resizedBar, 'pointerdown', {id:8,x:100});
  pointer(resizedBar, 'pointermove', {id:8,x:105});
  assert.equal(resized.instance.state.leftCollapsed, false);
  pointer(resizedBar, 'pointerup', {id:8,x:105});
  assert.equal(resized.calls.set.length, 1);
  assert.ok(resized.instance.state.leftRatio > layout.defaults.leftRatio);
});

test('dragging to the edge collapses and dragging outward from collapsed restores the pane', () => {
  const h = fixture();
  const bar = h.nodes.splitLeft;
  pointer(bar, 'pointerdown', {x:500});
  pointer(bar, 'pointermove', {x:0});
  assert.equal(h.instance.state.leftCollapsed, true);
  pointer(bar, 'pointerup', {x:0});
  pointer(bar, 'pointerdown', {id:8,x:0});
  pointer(bar, 'pointermove', {id:8,x:250});
  assert.equal(h.instance.state.leftCollapsed, false);
  pointer(bar, 'pointerup', {id:8,x:250});
});

test('vertical or diagonal drag is never treated as a click and small horizontal jitter does not resize', () => {
  for (const [x,y] of [[100,60],[102,60],[104,4]]) {
    const h = fixture(), bar=h.nodes.splitLeft, before=h.instance.state;
    pointer(bar,'pointerdown',{x:100,y:0}); pointer(bar,'pointermove',{x,y}); pointer(bar,'pointerup',{x,y});
    assert.deepEqual(h.instance.state,before);
    assert.equal(h.instance.state.leftCollapsed,false);
  }
});
test('after a horizontal drag, returning within the initial threshold still applies the final pointer position', () => {
  for(const side of ['left','right']) {
    const h=fixture(),bar=h.nodes[side==='left'?'splitLeft':'splitRight'],pane=h.nodes[side+'Pane'];
    const before=pane.getBoundingClientRect().width,sign=side==='left'?1:-1;
    pointer(bar,'pointerdown',{x:100});pointer(bar,'pointermove',{x:180});pointer(bar,'pointermove',{x:102});pointer(bar,'pointerup',{x:102});
    assert.equal(h.instance.state[side+'Collapsed'],false);
    assert(Math.abs(pane.getBoundingClientRect().width-(before+2*sign))<.1);
    assert.equal(h.calls.set.length,1);
  }
});
test('Escape cancels an active drag without saving and aria-valuetext includes the current width', () => {
  const h=fixture(), bar=h.nodes.splitLeft, before=h.instance.state;
  const text=bar.getAttribute('aria-valuetext');
  pointer(bar,'pointerdown',{x:100}); pointer(bar,'pointermove',{x:250});
  assert.notEqual(bar.getAttribute('aria-valuetext'),text);
  assert.match(bar.getAttribute('aria-valuetext'),/\d+ピクセル/);
  h.document.emit('keydown',{key:'Escape'}); pointer(bar,'pointerup',{x:250});
  assert.deepEqual(h.instance.state,before); assert.equal(h.calls.set.length,0);
  assert.equal(h.body.classList.contains('pane-resizing'),false);
});

test('pointercancel, lost capture, blur, and resize cancel a gesture back to its starting state without storage writes', () => {
  for (const cancel of [
    (h, bar, id) => pointer(bar, 'pointercancel', {id,x:50}),
    (h, bar, id) => pointer(bar, 'lostpointercapture', {id,x:50}),
    (h) => h.window.emit('blur'),
    (h) => h.window.emit('resize')
  ]) {
    const h = fixture();
    const before = h.instance.state;
    const bar = h.nodes.splitLeft;
    pointer(bar, 'pointerdown', {id:12,x:100});
    pointer(bar, 'pointermove', {id:12,x:400});
    cancel(h, bar, 12);
    assert.deepEqual(h.instance.state, before);
    assert.equal(h.calls.set.length, 0);
    assert.equal(h.body.classList.contains('pane-resizing'), false);
  }
});

test('ratio and collapse state persist across remount; reset removes only the layout key', () => {
  const h = fixture();
  h.data.set('unrelated', 'keep');
  pointer(h.nodes.splitLeft, 'pointerdown', {id:20,x:100});
  pointer(h.nodes.splitLeft, 'pointermove', {id:20,x:180});
  pointer(h.nodes.splitLeft, 'pointerup', {id:20,x:180});
  h.instance.setCollapsed('right', true);
  const saved = JSON.parse(h.data.get(layout.storageKey));
  assert.ok(saved.leftRatio > layout.defaults.leftRatio);
  assert.equal(saved.rightCollapsed, true);
  h.instance.dispose();
  const second = layout.mount({document:h.document, window:h.window, storage:h.storage});
  assert.equal(second.state.leftRatio, saved.leftRatio);
  assert.equal(second.state.rightCollapsed, true);
  second.reset();
  assert.equal(h.data.has(layout.storageKey), false);
  assert.equal(h.data.get('unrelated'), 'keep');
  assert.deepEqual(h.calls.remove, [layout.storageKey]);
});

test('storage read/write failures report once and leave the layout operable', () => {
  const h = fixture({storageThrows:true});
  assert.equal(h.calls.storageErrors, 1);
  h.instance.toggle('left');
  assert.equal(h.instance.state.leftCollapsed, true);
  h.instance.toggle('left');
  assert.equal(h.calls.storageErrors, 1);
  const write = fixture();
  write.storage.setItem = () => { throw Error('write blocked'); };
  write.instance.toggle('left');
  assert.equal(write.instance.state.leftCollapsed, true);
  assert.equal(write.calls.storageErrors, 1);
});

test('dispose removes listeners and prevents later state changes', () => {
  const h = fixture();
  h.instance.dispose();
  h.nodes.splitLeft.emit('keydown', {key:'Enter'});
  pointerClick(h, 'left');
  assert.equal(h.instance.state.leftCollapsed, false);
  assert.equal(h.calls.set.length, 0);
});

test('compact viewport ignores pointer dragging while click and keyboard remain usable', () => {
  const h = fixture({compact:true});
  const before = h.instance.state;
  pointer(h.nodes.splitLeft, 'pointerdown', {id:30,x:100});
  pointer(h.nodes.splitLeft, 'pointermove', {id:30,x:300});
  pointer(h.nodes.splitLeft, 'pointerup', {id:30,x:300});
  assert.deepEqual(h.instance.state, before);
  assert.equal(h.calls.set.length, 0);
  h.nodes.splitLeft.emit('keydown', {key:'Enter'});
  assert.equal(h.instance.state.leftCollapsed, true);
});

test('mounting, dragging, collapsing, and reset do not mutate document, storage destination, or iframe content', () => {
  const h = fixture();
  const iframe = {srcdoc:'<p>preview sentinel</p>'};
  const storageKeys = [];
  const trackedStorage = {
    getItem(key) { storageKeys.push(['get',key]); return h.storage.getItem(key); },
    setItem(key,value) { storageKeys.push(['set',key]); h.storage.setItem(key,value); },
    removeItem(key) { storageKeys.push(['remove',key]); h.storage.removeItem(key); }
  };
  const textBefore = JSON.stringify({iframe:iframe.srcdoc, ids:Object.keys(h.nodes)});
  const instance = layout.mount({document:h.document, window:h.window, storage:trackedStorage});
  pointer(h.nodes.splitLeft, 'pointerdown', {id:40,x:100});
  pointer(h.nodes.splitLeft, 'pointermove', {id:40,x:180});
  pointer(h.nodes.splitLeft, 'pointerup', {id:40,x:180});
  instance.reset();
  assert.deepEqual(storageKeys.map(([,key]) => key), storageKeys.map(() => layout.storageKey));
  assert.equal(iframe.srcdoc, '<p>preview sentinel</p>');
  assert.equal(JSON.stringify({iframe:iframe.srcdoc, ids:Object.keys(h.nodes)}), textBefore);
});
