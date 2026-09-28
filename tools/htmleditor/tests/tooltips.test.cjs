const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../../shared/ui-kit.js'), 'utf8');

class Target {
  constructor() { this.listeners = new Map(); }
  addEventListener(type, fn, capture = false) {
    const list = this.listeners.get(type) || [];
    list.push({fn, capture}); this.listeners.set(type, list);
  }
  removeEventListener(type, fn, capture = false) {
    this.listeners.set(type, (this.listeners.get(type) || []).filter(x => x.fn !== fn || x.capture !== capture));
  }
  dispatch(type, event = {}) {
    for (const listener of [...(this.listeners.get(type) || [])]) listener.fn({type, target:this, ...event});
  }
  count(type) { return (this.listeners.get(type) || []).length; }
}

class Element extends Target {
  constructor(tagName = 'div') {
    super(); this.tagName = tagName.toUpperCase(); this.attributes = new Map(); this.dataset = {};
    this.style = {}; this.textContent = ''; this.parentNode = null; this.removed = false;
    this.classes = new Set();
    this.classList = {add:name => this.classes.add(name), remove:name => this.classes.delete(name), contains:name => this.classes.has(name)};
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); }
  getAttribute(name) { return this.attributes.has(name) ? this.attributes.get(name) : null; }
  hasAttribute(name) { return this.attributes.has(name); }
  removeAttribute(name) { this.attributes.delete(name); }
  closest(selector) {
    if (selector === '[title],[data-tip]' && (this.hasAttribute('title') || Object.hasOwn(this.dataset, 'tip'))) return this;
    return null;
  }
  contains(node) { return node === this; }
  getBoundingClientRect() { return {left:20, top:20, bottom:40, width:80}; }
  remove() { this.removed = true; if (this.parentNode) this.parentNode.children = this.parentNode.children.filter(node => node !== this); }
}

function setup() {
  const document = new Target();
  document.body = {children:[], appendChild(node) { node.parentNode = this; this.children.push(node); }};
  document.createElement = tag => new Element(tag);
  const window = new Target();
  const context = {window, document, innerWidth:800, innerHeight:600, Math, Set};
  vm.runInNewContext(source, context, {filename:'ui-kit.js'});
  return {ui:window.JohoUI, document, window};
}

test('keyboard tooltip responds immediately to mouseover and focusin, then Escape, pointerdown, scroll hide it', () => {
  const {ui, document, window} = setup();
  const target = new Element('button'); target.dataset.tip = '説明';
  const tip = ui.tooltip({keyboard:true});
  document.dispatch('mouseover', {target});
  assert.equal(tip.el.textContent, '説明');
  assert.equal(tip.el.classList.contains('show'), true);
  assert.equal(target.getAttribute('aria-describedby'), tip.el.id);

  tip.hide();
  document.dispatch('focusin', {target});
  assert.equal(tip.el.classList.contains('show'), true);
  document.dispatch('keydown', {key:'Escape'});
  assert.equal(tip.el.classList.contains('show'), false);
  assert.equal(target.getAttribute('aria-describedby'), null);

  document.dispatch('focusin', {target});
  document.dispatch('pointerdown', {target:new Element('div')});
  assert.equal(tip.el.classList.contains('show'), false);
  document.dispatch('mouseover', {target});
  window.dispatch('scroll');
  assert.equal(tip.el.classList.contains('show'), false);
});

test('既存aria-describedbyを表示中だけ追加し、hideとdestroyで元に戻す', () => {
  const {ui, document, window} = setup();
  const target = new Element('button'); target.dataset.tip = '補足';
  target.setAttribute('aria-describedby', 'help-note status-note');
  const tip = ui.tooltip({keyboard:true});
  document.dispatch('focusin', {target});
  const during = target.getAttribute('aria-describedby').split(/\s+/);
  assert.deepEqual(during.slice(0, 2), ['help-note', 'status-note']);
  assert.equal(during.length, 3);
  assert.equal(during[2], tip.el.id);
  tip.hide();
  assert.equal(target.getAttribute('aria-describedby'), 'help-note status-note');

  document.dispatch('mouseover', {target});
  tip.destroy();
  assert.equal(target.getAttribute('aria-describedby'), 'help-note status-note');
  assert.equal(tip.el.removed, true);
  for (const event of ['mouseover','mouseout','pointerdown','focusin','focusout','keydown']) assert.equal(document.count(event), 0, event);
  assert.equal(window.count('scroll'), 0);
  assert.equal(window.count('resize'), 0);
});

test('keyboard指定なしでは従来どおりhoverのみで、キーボード系リスナを追加しない', () => {
  const {ui, document, window} = setup();
  const target = new Element('button'); target.dataset.tip = '従来表示';
  const tip = ui.tooltip();
  document.dispatch('focusin', {target});
  assert.equal(tip.el.classList.contains('show'), false);
  assert.equal(target.getAttribute('aria-describedby'), null);
  document.dispatch('mouseover', {target});
  assert.equal(tip.el.classList.contains('show'), true);
  assert.equal(target.getAttribute('aria-describedby'), null);
  for (const event of ['focusin','focusout','keydown']) assert.equal(document.count(event), 0, event);
  assert.equal(window.count('scroll'), 0);
  assert.equal(window.count('resize'), 0);
  tip.destroy();
});
