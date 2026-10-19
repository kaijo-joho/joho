// Executes the exact client in a synthetic DOM/RPC/clock. No browser, network or accounts.
import vm from 'node:vm';

export const id = n => String(n).padStart(32, '0');
export const info = n => ({targetId:'html12-01', fileName:'html12-01.html', title:'合成課題', requestId:id(n)});
export const receipt = (n, extra = {}) => ({submissionId:id(n), targetId:'html12-01', fileName:'html12-01.html', title:'合成課題',
  receivedAt:'2026-09-26T06:00:00Z', gradingState:'graded', rules:[{label:'見出し',mark:'★'},{label:'段落',mark:'☆'}], ...extra});

export function setup(html, options = {}) {
  let time = Date.parse('2026-09-26T06:00:00Z'), serial = 0, focused = '';
  const calls = [], timers = new Map(), timerRecords = new Map(), storage = options.storage || new Map(), downloads = [], blobs = [], objectUrls = [], revoked = [];
  class Element {
    constructor(name) {
      this.id = name; this.tagName = name === 'a' ? 'A' : name.toUpperCase(); this.textContent = ''; this.hidden = false;
      this.disabled = false; this.inert = false; this.value = ''; this.files = []; this.events = {}; this.attributes = {};
      this.children = []; this.dataset = {}; this.style = {};
      const classes = new Set();
      this.classList = {add: (...names) => names.forEach(n => classes.add(n)), remove: (...names) => names.forEach(n => classes.delete(n)),
        contains: name => classes.has(name), toggle: (name, force) => { const on = force === undefined ? !classes.has(name) : force; on ? classes.add(name) : classes.delete(name); return on; }};
    }
    addEventListener(name, fn) { (this.events[name] ||= []).push(fn); }
    setAttribute(k, v) { this.attributes[k] = String(v); }
    getAttribute(k) { return this.attributes[k] ?? null; }
    append(...nodes) { this.children.push(...nodes); }
    replaceChildren(...nodes) { this.children = nodes; }
    focus() { focused = this.id; }
    remove() { this.removed = true; }
    click() {
      if (this.tagName === 'A') {
        if (options.throwAnchorClick) throw Error('anchor click');
        downloads.push({download:this.download, href:this.href}); return;
      }
      if (!this.disabled) fire(this.id, 'click');
    }
  }
  const elements = {};
  for (const match of html.matchAll(/<[^>]*\bid="([A-Za-z0-9]+)"[^>]*>/g)) {
    const node = new Element(match[1]), tag = match[0];
    for (const attr of tag.matchAll(/\s([A-Za-z_:][A-Za-z0-9_:.-]*)(?:="([^"]*)")?/g)) {
      node.attributes[attr[1]] = attr[2] ?? '';
      if (attr[1] === 'hidden') node.hidden = true;
      if (attr[1] === 'disabled') node.disabled = true;
      if (attr[1] === 'inert') node.inert = true;
      if (attr[1] === 'required') node.required = true;
    }
    elements[node.id] = node;
  }
  for (const name of ['fileGuide', 'uploadForm', 'retryInfo', 'receipt']) if (elements[name]) elements[name].hidden = true;
  const boot = options.boot || {targetId:'html12-01', submissionId:''};
  elements.assignmentBoot.textContent = JSON.stringify(boot);
  function fire(name, type = 'click') {
    const event = {prevented:false, preventDefault() { this.prevented = true; }};
    for (const fn of elements[name].events[type] || []) fn(event);
    return event;
  }
  function dispatchMessage(event) { for (const fn of windowEvents.message || []) fn(event); }
  function runner(ok, fail) {
    const api = {withSuccessHandler:fn => runner(fn, fail), withFailureHandler:fn => runner(ok, fn)};
    const names = {getHtmlAssignmentInfo:'info', submitHtmlAssignment:'submit', submitHtmlAssignmentSavedFile:'submitSaved', getHtmlAssignmentReceipt:'receipt',
      processHtmlAssignmentSubmission:'process', downloadHtmlAssignmentReceipt:'download'};
    for (const [name, kind] of Object.entries(names)) api[name] = arg => {
      if (options.throwRpc === kind) throw Error('transport');
      calls.push({kind, arg, ok, fail, requestId:kind === 'submit' ? elements.requestId.value : null});
    };
    return api;
  }
  class ClockDate extends Date { constructor(...args) { super(...(args.length ? args : [time])); } static now() { return time; } }
  class TestBlob {
    constructor(parts, init = {}) {
      if (options.throwBlob) throw Error('Blob');
      this.parts = parts; this.type = init.type || '';
      blobs.push(this);
    }
  }
  const URLApi = {
    createObjectURL(blob) { if (options.throwObjectUrl) throw Error('object URL'); const url = 'blob:synthetic-' + (objectUrls.length + 1); objectUrls.push({url, blob}); return url; },
    revokeObjectURL(url) { revoked.push(url); }
  };
  const messages = [], windowEvents = {};
  const top = {postMessage:(data, origin) => messages.push({data, origin})};
  const context = {console, Date:ClockDate, Number, String, JSON, Object, Array, Uint8Array, TextEncoder, Blob:TestBlob,
    top, addEventListener:(name, fn) => { (windowEvents[name] ||= []).push(fn); },
    document:{getElementById:name => elements[name], createElement:name => new Element(name), body:new Element('body'),
      addEventListener() {}, documentElement:{dataset:{}}},
    sessionStorage:{getItem:k => storage.get(k), setItem:(k,v) => storage.set(k,v)}, confirm:() => options.confirm !== false,
    URL:URLApi,
    setTimeout:(fn, delay) => { const key = ++serial, record = {key, fn, delay, at:time + delay, cleared:false}; timers.set(key, record); timerRecords.set(key, record); return key; },
    clearTimeout:key => { if (timers.has(key)) timerRecords.get(key).cleared = true; timers.delete(key); }};
  context.window = context;
  context.setInterval = context.setTimeout;
  context.clearInterval = context.clearTimeout;
  if (!options.noService) context.google = {script:{run:runner(() => {}, () => {})}};
  const source = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!source) throw Error('client inline script not found');
  vm.runInNewContext(source, context);
  function advance(ms) {
    const end = time + ms;
    while (true) {
      const next = [...timers].filter(([, v]) => v.at <= end).sort((a, b) => a[1].at - b[1].at)[0];
      if (!next) break;
      time = next[1].at; timers.delete(next[0]); next[1].fn();
    }
    time = end;
  }
  const call = (kind, n = 0) => calls.filter(c => c.kind === kind)[n];
  function choose() { elements.htmlFile.files = [{name:'html12-01.html', size:100}]; }
  function connect({localFeedback='', layout='integrated-v1', fileTransfer='saved-html-v1', origin='https://joho.kaijo.ed.jp', source=top,
    bridge=boot.embedBridge, targetId=boot.targetId} = {}) {
    dispatchMessage({source, origin, data:{channel:'joho-html-submission-v1',type:'connect',bridge,targetId,layout,fileTransfer,localFeedback}});
  }
  function replyFile(data = {}, {origin='https://joho.kaijo.ed.jp', source=top} = {}) {
    const request = messages.filter(entry => entry.data.type === 'file-request').at(-1)?.data;
    dispatchMessage({source,origin,data:{channel:'joho-html-submission-v1',type:'saved-file',bridge:boot.embedBridge,
      targetId:boot.targetId,requestId:request?.requestId,transferId:request?.transferId,fileName:'html12-01.html',text:'<h1>saved</h1>',...data}});
  }
  return {elements, calls, call, fire, advance, choose, storage, downloads, blobs, objectUrls, revoked, options,
    messages, top, root:context.document.documentElement,
    message:dispatchMessage,
    timerRecords, runTimer:key => timerRecords.get(key)?.fn(),
    disableService:() => { context.google = undefined; },
    focused:() => focused, ready:() => call('info').ok(info(1)), click:name => elements[name].click(), connect, replyFile};
}
