const test = require('node:test'), assert = require('node:assert/strict'), vm = require('node:vm'), fs = require('node:fs');
const Routing = require('../routing.js');
const source = fs.readFileSync(require.resolve('../navigation.js'), 'utf8');
const defaults = {version:1,textScale:100,textSize:'standard',codeWrap:false,codeWrapExplicit:false,lineSpacing:'standard',theme:'system',resolvedTheme:'light'};
function events(target = {}) {
  const listeners = {};
  target.addEventListener = (type, listener) => (listeners[type] ||= []).push(listener);
  target.emit = (type, detail) => (listeners[type] || []).forEach(listener => listener({detail}));
  return target;
}
function controller(document, initial = {}) {
  let state = {...defaults,...initial}, embedded = false;
  const calls = [];
  const publish = (source, changed = []) => document.emit('joho:display-settings-change', {state:{...state},source,changed});
  return {version:1,calls,getState:() => ({...state}),
    setContext({embeddedLesson}) { embedded = embeddedLesson; if (!state.codeWrapExplicit) state.codeWrap = embedded; },
    setPreferences(patch, options = {}) {
      calls.push({patch:{...patch},options:{...options}});
      for (const [key,value] of Object.entries(patch)) {
        if (key === 'codeWrap') { state.codeWrapExplicit = value !== null; state.codeWrap = value ?? embedded; }
        else state[key] = value;
      }
      publish(options.source || 'api', Object.keys(patch));
    },
    reset(options = {}) { calls.push({reset:true,options}); state = {...defaults,codeWrap:embedded}; publish('reset',['reset']); },
    malformed() { state.textScale = '120'; publish('ui',['textScale']); }
  };
}
function setup(parentState = {}, childState = {}, options = {}) {
  const document = events({documentElement:{dataset:{theme:'dark',textSize:'largest'}},getElementById:() => ({})});
  const frameDocument = events({URL:'https://joho.kaijo.ed.jp/html14.html?view=lesson', readyState:'complete',
    querySelector:() => ({}),getElementById:() => null,getElementsByName:() => []});
  const parent = controller(document,parentState), child = controller(frameDocument,childState);
  const frameWindow = events({location:{href:frameDocument.URL,replace(value) { this.href = value; }},scrollY:0,scrollTo() {},siteDisplaySettings:child,
    siteTheme:{setPreference() { throw Error('legacy theme must not overwrite shared preferences'); }},
    siteTextSize:{setPreference() { throw Error('legacy text size must not round a fine scale'); }}});
  frameDocument.defaultView = frameWindow;
  const iframe = events({contentDocument:frameDocument,contentWindow:frameWindow,hasAttribute:() => false});
  const location = {href:'https://joho.kaijo.ed.jp/tools/htmleditor/index.html?lesson=html14'};
  const context = events({URL,location,document,HtmlEditorRouting:Routing,siteDisplaySettings:parent,
    history:{replaceState:(_,__,value) => location.href=value,pushState:(_,__,value) => location.href=value},
    MutationObserver:class { observe() {} },setTimeout:() => 1,clearTimeout() {}});
  context.window = context;
  vm.runInNewContext(source,context);
  const navigation = context.HtmlEditorNavigationMount({iframe,onSelect() {},onError(message) { throw Error(message); },...options});
  iframe.emit('load');
  return {document,frameDocument,frameWindow,iframe,parent,child,navigation};
}
test('shared parent preferences retain exact fine scale and implicit embedded wrapping without legacy rounding', () => {
  const h = setup({textScale:117,lineSpacing:'relaxed',theme:'dark'});
  assert.equal(h.child.getState().textScale,117);
  assert.equal(h.child.getState().lineSpacing,'relaxed');
  assert.equal(h.child.getState().codeWrap,true);
  assert.equal(h.child.getState().codeWrapExplicit,false);
  assert.equal(h.child.calls[0].options.persist,false);
  const count = h.child.calls.length;
  h.iframe.emit('load'); assert.equal(h.child.calls.length,count,'equal values never echo');
});
test('child UI changes synchronize back once without storage writes or recursive echo', () => {
  const h = setup(); h.parent.calls.length=0; h.child.calls.length=0;
  h.child.setPreferences({textScale:137,codeWrap:false,lineSpacing:'relaxed',theme:'light'}, {source:'ui'});
  assert.equal(h.parent.getState().textScale,137); assert.equal(h.parent.getState().codeWrap,false);
  assert.equal(h.parent.calls.length,1); assert.equal(h.parent.calls[0].options.persist,false);
  assert.equal(h.child.calls.length,1);
});
test('a same-value global UI action still reaches the lesson to reset individual example overrides', () => {
  const h = setup(); h.child.calls.length=0;
  h.parent.setPreferences({textScale:100}, {source:'ui'});
  assert.equal(h.child.calls.length,1); assert.equal(h.child.calls[0].patch.textScale,100);
  assert.equal(h.child.calls[0].options.source,'ui'); assert.equal(h.child.calls[0].options.persist,false);
});
test('reset crosses each direction exactly once, including when all values already match defaults', () => {
  const h = setup(); h.child.calls.length=0; h.parent.calls.length=0;
  h.parent.reset();
  assert.equal(h.child.calls.length,1); assert.equal(h.child.calls[0].reset,true); assert.equal(h.child.calls[0].options.persist,false);
  assert.equal(h.parent.calls.length,1);
  h.child.calls.length=0; h.parent.calls.length=0; h.child.reset();
  assert.equal(h.parent.calls.length,1); assert.equal(h.parent.calls[0].reset,true); assert.equal(h.parent.calls[0].options.persist,false);
  assert.equal(h.child.calls.length,1);
});
test('late events from the former document, malformed values and non-lesson frames cannot change parent settings', () => {
  const stale = setup(); stale.parent.calls.length=0; stale.iframe.contentDocument={};
  stale.child.setPreferences({textScale:145},{source:'ui'}); assert.equal(stale.parent.calls.length,0);
  const invalid=setup(); invalid.parent.calls.length=0; invalid.child.malformed(); assert.equal(invalid.parent.calls.length,0);
  const outside=setup(); outside.child.calls.length=0; outside.frameWindow.location.href='https://joho.kaijo.ed.jp/py11.html';
  outside.parent.setPreferences({textScale:115},{source:'ui'}); assert.equal(outside.child.calls.length,0);
});
test('only the current owned lesson can request temporary example expansion and navigation closes it', () => {
  const calls=[],h=setup({}, {}, {onExampleExpanded:value => calls.push(value)}); calls.length=0;
  h.frameDocument.emit('joho:code-example-expanded',{open:true,scrollX:0,scrollY:370});
  assert.equal(calls.length,1); assert.equal(calls[0].open,true); assert.equal(calls[0].scrollY,370);
  h.frameDocument.emit('joho:code-example-expanded',{open:'true',scrollX:0,scrollY:370});
  h.frameDocument.emit('joho:code-example-expanded',{open:true,scrollX:0,scrollY:Infinity});
  assert.equal(calls.length,1);
  h.iframe.contentDocument={};
  h.frameDocument.emit('joho:code-example-expanded',{open:true,scrollX:0,scrollY:370});
  assert.equal(calls.length,1);
  h.navigation.navigate({lessonId:'html15'});
  assert.equal(calls.at(-1).open,false);
});
