const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const source = fs.readFileSync(require.resolve('../editor.js'), 'utf8');
const ids = [...new Set([...source.matchAll(/\$\('([^']+)'\)/g)].map(match => match[1]))];
const htmlIds = new Set([...fs.readFileSync(require.resolve('../index.html'), 'utf8').matchAll(/\bid="([^"]+)"/g)].map(match => match[1]));
for (const id of ids) assert.ok(htmlIds.has(id), `editor.js が index.html にない #${id} を参照しています`);
const tick = () => new Promise(resolve => setTimeout(resolve, 0));

class Node {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.children = []; this.listeners = new Map();
    this.style = {display:'', setProperty() {}}; this.dataset = {}; this.hidden = false;
    this.disabled = false; this.open = false; this.value = ''; this.textContent = '';
    this.className = ''; this.files = []; this.isConnected = true;
    this.classList = {toggle() {}, add() {}, remove() {}};
  }
  append(...nodes) { this.children.push(...nodes); }
  after(node) { this.afterNode=node; }
  appendChild(node) { this.children.push(node); return node; }
  replaceChildren(...nodes) { this.children = nodes; }
  addEventListener(name, fn) { (this.listeners.get(name) || this.listeners.set(name, []).get(name)).push(fn); }
  removeEventListener(name, fn) { this.listeners.set(name, (this.listeners.get(name) || []).filter(listener => listener !== fn)); }
  dispatch(name, extra = {}) { for (const fn of this.listeners.get(name) || []) fn({currentTarget:this, target:this, preventDefault() {}, ...extra}); }
  click() { this.clicked = (this.clicked || 0) + 1; this.dispatch('click'); }
  focus() { this.focused = true; }
  remove() { this.removed = true; }
  setAttribute() {}
  removeAttribute() {}
  querySelector() { return null; }
  querySelectorAll() { return []; }
  closest() { return null; }
  cloneNode() { return new Node(this.tagName); }
  getBoundingClientRect() { return {bottom:0}; }
  setPointerCapture() {}
  showModal() { this.open = true; }
  close() { this.open = false; }
}

function makeHarness({permission = 'granted', remembered = true, readOnly = false, recoveryItems = [], memoryFails = false, v3=false, localDownloads=null, failWrite=false, failReadAfterWrite=false} = {}) {
  const nodes = Object.fromEntries([...htmlIds].map(id => [id, new Node()]));
  nodes.app = new Node(); nodes.actionDialog = new Node('dialog');
  const documentEvents = new Map();
  const document = {
    body:new Node('body'), activeElement:null,
    getElementById:id => {
      if (!nodes[id]) throw Error(`index.html にない #${id} が参照されました`);
      return nodes[id];
    },
    createElement:tag => new Node(tag), createTextNode:text => ({textContent:text}),
    addEventListener:(name, fn) => { (documentEvents.get(name) || documentEvents.set(name, []).get(name)).push(fn); },
    dispatch(name) { for (const fn of documentEvents.get(name) || []) fn({target:null}); },
    querySelector:() => null, querySelectorAll:() => []
  };
  const windowEvents = new Map();
  const handle = {kind:'directory', name:'HTML実習', async entries() {}, async queryPermission() { return permission; }, async requestPermission() { this.requests = (this.requests || 0) + 1; return 'granted'; }};
  const calls = {reconnect:[], scan:0, openDirectory:0, disconnect:0, forget:0, downloads:0, writes:0};
  const disk=new Map([['sample.html','old saved content']]);
  class FakeFs {
    constructor() { this.dirHandle = null; this.readOnly = readOnly; this.files = readOnly ? ['sample.html'] : []; this.fileEntries=disk; }
    isSupported() { return true; }
    isConnected() { return Boolean(this.dirHandle) && !this.readOnly; }
    getDirectoryName() { return this.dirHandle ? this.dirHandle.name : ''; }
    getFileList() { return this.files; }
    async reconnectDirectory(folder, options = {}) {
      calls.reconnect.push(options);
      if (permission !== 'granted' && !options.requestPermission) return false;
      if (options.requestPermission) await folder.requestPermission();
      this.dirHandle = folder; this.readOnly = false; this.files = ['sample.html']; return true;
    }
    async openDirectory() { calls.openDirectory++; this.dirHandle = handle; this.readOnly = false; this.files = ['sample.html']; return handle.name; }
    async scanDirectory() { calls.scan++; return this.files; }
    async importFiles(files) {
      const first = [...files][0];
      this.files = [...files].map(file => file.name); this.imported = first;
      this.readOnly = true; this.dirHandle = null; return this.files;
    }
    async readFile(path) { if(failReadAfterWrite&&calls.writes)throw Error('synthetic read failure');return this.imported ? Buffer.from(await this.imported.arrayBuffer()).toString('utf8') : disk.get(path); }
    async writeFile(path,value) { if(failWrite)throw Error('synthetic write failure');disk.set(path,value);calls.writes++; }
    disconnect() { calls.disconnect++; this.dirHandle = null; this.files = []; this.readOnly = false; }
    onChange() { return () => {}; }
  }
  const cm = {value:'', setOption() {}, setValue(value) { this.value = value; }, getValue() { return this.value; }, clearHistory() {}, on() {}, refresh() {}, markText() {}, posFromIndex() { return {}; }, replaceSelection() {}, clearGutter() {}, setGutterMarker() {}};
  const memory = {async load() { return remembered ? handle : null; }, async save() {}, async forget() { calls.forget++; }};
  const testTimeout = (fn, delay) => {
    const timer = setTimeout(fn, delay);
    if (delay >= 1000) timer.unref();
    return timer;
  };
  const context = {
    window:null, document, console, confirm:()=>true, setTimeout:testTimeout, clearTimeout, requestAnimationFrame:fn => fn(),
    crypto:{randomUUID:() => 'test-document'}, indexedDB:{}, localStorage:{}, Blob:class {}, URL:{createObjectURL() { calls.downloads++; return 'blob:test'; }, revokeObjectURL() {}},
    CodeMirror:{fromTextArea:() => cm}, HtmlFileSystem:FakeFs,
    HtmlEditorFolderMemory:{create:() => { if (memoryFails) throw Error('IndexedDB unavailable'); return memory; }},
    HtmlEditorRecovery:{create:() => ({save() {}, list:() => ({items:recoveryItems, errors:[]})})},
    HtmlPreview:class { constructor(options) { this.fs = options.fs; calls.previewOptions = options; calls.previewUpdates = []; } update(...args) { calls.previewUpdates.push(args); } openInNewTab() {} },
    HtmlEditorDiagnostics:require('../diagnostics.js'), HtmlEditorHintUsage:require('../hint-usage.js'), CSS:{supports:() => true},
    HtmlPracticeEditor:{lessons:() => [{id:'html11', title:'HTML', files:[]}], taskForFile:() => null, inspect:() => null, submission() {}},
    HtmlEditorWorkflow:{distribution:() => ({message:'', kind:'ready'}), submission:() => ({ready:false, message:''})},
    HtmlEditorOnboarding:{assess:() => ({active:false, ready:false, steps:[], message:''})},
    HtmlEditorStartup:{ready:() => true, catalogState:() => 'ready', fail() { throw Error('startup failed'); }},
    HtmlEditorNavigationMount:options => {
      options.onSelect({lessonId:'html11', taskId:'', hash:''});
      return {selection:{lessonId:'html11', taskId:''}, navigate(value) { options.onSelect(value); }, request:async () => {}};
    },
    HtmlLessons:{LESSONS:[]}, pages:{}, htmlPracticeLinks:{},
    JohoUI:{theme() {}, tooltip() {}}, JohoToolHelp:{create() {}},
    addEventListener:(name, fn) => { (windowEvents.get(name) || windowEvents.set(name, []).get(name)).push(fn); }
  };
  context.window = context;
  context.HTML_LOCAL_V3_CONFIG={enabled:v3,identityUrl:'https://script.google.com/macros/s/SYNTHETIC/exec'};
  context.HtmlEditorLocalDownloads=localDownloads;
  vm.runInNewContext(source, context, {filename:'editor.js'});
  for (const fn of windowEvents.get('DOMContentLoaded') || []) fn();
  return {nodes, handle, calls, cm, tick, disk, windowEvents};
}

test('プレビューのtitleはテキスト表示し、未設定・構造不足・CSS切替で古い題名を残さない', async () => {
  const app = makeHarness({remembered:false});
  await app.tick();
  app.calls.previewOptions.onTitle('海城 & <img src=x>');
  assert.equal(app.nodes.previewTitle.textContent, '海城 & <img src=x>');
  assert.equal(app.nodes.previewTitle.hidden, false);
  assert.equal(app.nodes.previewTitle.dataset.tip, 'HTMLのtitleタグ：海城 & <img src=x>');
  app.calls.previewOptions.onTitle('');
  assert.equal(app.nodes.previewTitle.textContent, 'タイトル未設定');
  app.calls.previewOptions.onTitle(null);
  assert.equal(app.nodes.previewTitle.textContent, '');
  assert.equal(app.nodes.previewTitle.hidden, true);
  app.nodes.fileInput.files = [{name:'style.css', size:0, async arrayBuffer() { return Buffer.from(''); }}];
  app.nodes.fileInput.dispatch('change'); await app.tick();
  app.calls.previewOptions.onTitle('');
  assert.equal(app.nodes.previewTitle.textContent, '');
  assert.equal(app.nodes.previewTitle.hidden, true);
});

test('起動時は許可済みフォルダだけを再接続し、文書・復旧候補は自動で開かない', async () => {
  const app = makeHarness({permission:'granted', recoveryItems:[{fileName:'old.html', content:'old'}]});
  await app.tick(); await app.tick();
  assert.equal(app.calls.reconnect.length, 1);
  assert.equal(Object.keys(app.calls.reconnect[0]).length, 0);
  assert.equal(app.nodes.emptyState.hidden, false);
  assert.equal(app.nodes.folderAlert.hidden, true);
  assert.equal(app.nodes.currentFileLabel.textContent, '');
  assert.equal(app.nodes.actionDialog.open, false);
  assert.equal(app.nodes.restoreBtn.clicked, undefined);
});

test('prompt の起動時は要求せず、明示的な再接続だけが requestPermission を行う', async () => {
  const app = makeHarness({permission:'prompt'});
  await app.tick();
  assert.equal(app.calls.reconnect.length, 1);
  assert.equal(Object.keys(app.calls.reconnect[0]).length, 0);
  assert.equal(app.handle.requests, undefined);
  app.nodes.reconnectFolderBtn.dispatch('click');
  await app.tick();
  assert.equal(app.calls.reconnect.length, 2);
  assert.equal(app.calls.reconnect[1].requestPermission, true);
  assert.equal(app.handle.requests, 1);
});

test('開くは接続済みフォルダを再走査し、解除は記憶を忘れる', async () => {
  const app = makeHarness();
  await app.tick(); await app.tick();
  app.nodes.openFilesBtn.dispatch('click');
  await app.tick();
  assert.equal(app.calls.scan, 1);
  const separate = makeHarness();
  await separate.tick(); await separate.tick();
  separate.nodes.disconnectBtn.dispatch('click');
  await separate.tick();
  assert.equal(separate.calls.forget, 1);
  assert.equal(separate.calls.disconnect, 1);
});

test('フォルダ記憶が使えない環境でも、今回だけの接続を解除できる', async () => {
  const app = makeHarness({remembered:false, memoryFails:true});
  await app.tick();
  app.nodes.settingsFolderBtn.dispatch('click');
  await app.tick();
  assert.equal(app.calls.openDirectory, 1);
  app.nodes.actionButtons.children.at(-1).click(); // ファイル一覧の「閉じる」
  await app.tick();
  app.nodes.disconnectBtn.dispatch('click');
  await app.tick();
  assert.equal(app.calls.disconnect, 1);
  assert.match(app.nodes.folderMemoryNotice.textContent, /今回の接続だけを解除/);
});

test('読取専用の保存と復旧候補はMacへ書込・自動ダウンロードを行わない', async () => {
  const app = makeHarness({remembered:false, readOnly:true});
  await app.tick();
  app.nodes.fileInput.files = [{name:'sample.html', size:9, async arrayBuffer() { return Buffer.from('<p>ok</p>'); }}];
  app.nodes.fileInput.dispatch('change');
  await app.tick(); await app.tick();
  assert.equal(app.nodes.currentFileLabel.textContent, 'sample.html');
  app.nodes.saveBtn.dispatch('click');
  await app.tick();
  assert.equal(app.calls.downloads, 0);
  assert.equal(app.calls.writes, 0);
  assert.equal(app.nodes.actionDialog.open, true, '保存方法を選ぶまでコピーをダウンロードしない');

  const recovery = makeHarness({remembered:false, recoveryItems:[{fileName:'old.html', content:'old', kind:'auto', savedAt:0}]});
  await recovery.tick();
  recovery.nodes.restoreBtn.dispatch('click');
  await recovery.tick();
  assert.equal(recovery.calls.writes, 0);
  assert.equal(recovery.calls.downloads, 0);
  assert.equal(recovery.nodes.currentFileLabel.textContent, '', '候補を表示するだけでは復旧しない');
  const list = recovery.nodes.actionBody.children.find(node => node.className === 'recovery-list');
  assert.ok(list, '復旧候補を表示する');
  list.children[0].click();
  await recovery.tick(); await recovery.tick();
  assert.equal(recovery.cm.getValue(), 'old');
  assert.equal(recovery.nodes.currentFileLabel.textContent, 'old.html');
  assert.equal(recovery.calls.writes, 0, '復旧はMacへ書き込まない');
});
test('v3実エディタ起動は既存proofを読むだけ。確認・切替・最新取得は明示操作のみ',async()=>{
 const calls={load:0,register:0,panel:0};let state={status:'missing',label:''};
 const localDownloads={create:()=>({load:async()=>{calls.load++;return state;},register:async()=>{calls.register++;state={status:'ready',label:'synthetic'};},
  createPanel(){calls.panel++;return {canClose:()=>true,dispose(){}};}})};
 const h=makeHarness({v3:true,localDownloads});await h.tick();await h.tick();
 const box=h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar'),confirm=box.children[1].children[1].children.find(n=>n.textContent==='学校アカウントを確認する');
 assert(box);assert.equal(calls.load,1);assert.equal(calls.register,0);assert.equal(calls.panel,0);
 assert.equal(box.children[1].children[0].textContent,'⚠️未接続','未確認時はユーザーIDを表示しない');
 const warning=h.nodes.toolbar.afterNode;assert.equal(warning.className,'identity-alert');assert.equal(warning.hidden,false);assert.match(warning.children[0].textContent,/未確認/);
 assert.equal(h.nodes.currentFileLabel.textContent,'');assert.equal(h.calls.downloads,0);assert.equal(h.calls.writes,0);
 confirm.click();await h.tick();assert.equal(calls.register,1);assert.equal(confirm.hidden,true);
 assert.equal(box.children[1].children[0].textContent,'synthetic');
 assert.equal(box.children[0].textContent,'確認済み');
 assert.equal(warning.hidden,true,'本人確認済みなら赤い警告を消す');
 const second=makeHarness({v3:true,localDownloads});await second.tick();assert.equal(calls.register,1);
 assert.equal(second.nodes.currentFileLabel.textContent,'');
 assert.equal(second.nodes.toolbar.afterNode.hidden,true,'再読み込みでも有効な本人確認は警告しない');
 assert.equal(second.nodes.toolbar.children.find(n=>n.className==='identity-toolbar').children[1].children[0].textContent,'synthetic','氏名のない旧キャッシュはIDへフォールバック');
});
test('学校アカウントのユーザーIDは文字列として表示し、切替成功時だけ更新する',async()=>{
 let state={status:'ready',label:'synthetic_3'},fail=false,requested;
 const h=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>state,register:async options=>{
  requested=options;if(fail)throw Error('identity_confirmation_canceled');state={status:'ready',label:'synthetic_4'};
 }})}});await h.tick();
 const box=h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar'),summary=box.children[1].children[0],change=box.children[1].children[1].children.find(n=>n.textContent==='利用するアカウントを変更');
 assert.equal(summary.textContent,'synthetic_3');assert.match(summary.dataset.tip,/確認済み/);
 fail=true;change.click();await h.tick();assert.equal(summary.textContent,'synthetic_3','中止では登録済みIDを失わない');
 fail=false;change.click();await h.tick();assert.equal(summary.textContent,'synthetic_4');assert.equal(requested.switchAccount,true);
 assert.equal(h.calls.downloads,0);assert.equal(h.calls.writes,0,'アカウント表示でファイルを変更しない');
 const literal=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>({status:'ready',label:'<img src=x onerror=alert(1)>'})})}});await literal.tick();
 const label=literal.nodes.toolbar.children.find(n=>n.className==='identity-toolbar').children[1].children[0];
 assert.equal(label.textContent,'<img src=x onerror=alert(1)>');assert.equal(label.children.length,0,'表示層でもHTMLとして解釈しない');
});
for(const status of ['missing','expired'])test(status+' の学校アカウントは保存済みのユーザーIDを確認済みとして表示しない',async()=>{
 const h=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>({status,label:'old_synthetic_user'})})}});await h.tick();
 const box=h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar');
 assert.equal(box.children[1].children[0].textContent,'⚠️未接続');assert.doesNotMatch(box.children[0].textContent,/確認済み/);
 assert.equal(h.nodes.toolbar.afterNode.hidden,false);assert.match(box.children[1].children[0].dataset.tip,/本人確認/);
});
test('本人確認の期限切れは赤い警告から明示確認でき、失敗時も警告を残す',async()=>{
 let registrations=0;const h=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>({status:'expired'}),register:async()=>{registrations++;throw Error('synthetic');}})}});await h.tick();
 const warning=h.nodes.toolbar.afterNode;assert.match(warning.children[0].textContent,/期限/);assert.equal(warning.hidden,false);assert.equal(registrations,0);
 warning.children[1].click();await h.tick();assert.equal(registrations,1);assert.equal(warning.hidden,false);assert.equal(warning.children[1].disabled,false);
});
test('v3モジュール準備失敗でも実エディタと既存ファイルを保持し旧配付の入口を維持',async()=>{
 const h=makeHarness({v3:true,localDownloads:{create(){throw Error('synthetic_storage_error');}}});await h.tick();
 assert.match(h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar').children[0].textContent,/既存の配付/);
 assert.equal(h.nodes.emptyState.hidden,false);assert.equal(h.calls.writes,0);
});
async function chooseSample(app){app.nodes.openFilesBtn.dispatch('click');await app.tick();app.nodes.actionBody.children.find(n=>n.textContent==='sample.html').click();await app.tick();}
test('同じファイルを保存して開くと、Mac上とエディタの双方が新しい内容になる',async()=>{
 const h=makeHarness();await h.tick();await chooseSample(h);h.cm.setValue('edited content');await chooseSample(h);
 h.nodes.actionButtons.children.find(n=>n.dataset.choice==='save').click();await h.tick();await h.tick();
 assert.equal(h.disk.get('sample.html'),'edited content');assert.equal(h.cm.getValue(),'edited content');assert.equal(h.nodes.dirtyMark.hidden,true);
 h.nodes.saveBtn.click();await h.tick();assert.equal(h.calls.writes,2,'直後の保存で不要な外部変更エラーにしない');
});
for(const mode of ['cancel','discard','writeFailure','readFailure'])test('同じファイルを開く際の '+mode+' でも編集内容・保存失敗を取り違えない',async()=>{
 const h=makeHarness({failWrite:mode==='writeFailure',failReadAfterWrite:mode==='readFailure'});await h.tick();await chooseSample(h);h.cm.setValue('edited content');await chooseSample(h);
 h.nodes.actionButtons.children.find(n=>n.dataset.choice===(mode==='cancel'?'cancel':mode==='discard'?'discard':'save')).click();await h.tick();await h.tick();
 assert.equal(h.cm.getValue(),mode==='discard'?'old saved content':'edited content');
 assert.equal(h.disk.get('sample.html'),mode==='readFailure'?'edited content':'old saved content');
});
test('期限切れでも別アカウントへの明示切替を選べる。通常の再確認と区別',async()=>{
 const calls=[];const h=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>({status:'expired'}),register:async r=>calls.push(r)})}});await h.tick();
 const box=h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar'),button=box.children[1].children[1].children.find(n=>n.textContent==='利用するアカウントを変更');
 assert.equal(button.hidden,false);button.click();await h.tick();assert.equal(calls[0].switchAccount,true);assert.equal(calls[0].safeToSwitch,true);
});
test('氏名だけをボタンへ、氏名とIDをメニューへ表示。再読込・再確認・切替中止を保持',async()=>{
 let state={status:'ready',label:'synthetic',displayName:''},cancel=false,registrations=0;
 const localDownloads={create:()=>({load:async()=>state,register:async()=>{registrations++;if(cancel)throw Error('identity_confirmation_canceled');state={...state,displayName:'検証 太郎'};}})};
 const h=makeHarness({v3:true,localDownloads});await h.tick();
 const menu=h.nodes.toolbar.children.find(n=>n.className==='identity-toolbar').children[1],actions=menu.children[1],profile=actions.children[0];
 const recheck=actions.children.find(n=>n.textContent==='氏名を取得して再確認');
 assert.equal(menu.children[0].textContent,'synthetic');assert.equal(recheck.hidden,false);assert.equal(registrations,0);
 recheck.click();await h.tick();assert.equal(menu.children[0].textContent,'検証 太郎');assert.equal(recheck.hidden,true);
 assert.equal(profile.children[0].textContent,'氏名：検証 太郎');assert.equal(profile.children[1].textContent,'ユーザーID：synthetic');
 cancel=true;actions.children.find(n=>n.textContent==='利用するアカウントを変更').click();await h.tick();assert.equal(menu.children[0].textContent,'検証 太郎');
 const h2=makeHarness({v3:true,localDownloads});await h2.tick();assert.equal(h2.nodes.toolbar.children.find(n=>n.className==='identity-toolbar').children[1].children[0].textContent,'検証 太郎');
 assert.equal(h.calls.downloads,0);assert.equal(h.calls.writes,0);
 state={status:'expired',label:'synthetic',displayName:'検証 太郎'};h.windowEvents.get('focus')[0]();await h.tick();
 assert.equal(menu.children[0].textContent,'⚠️未接続');assert.equal(profile.hidden,true);
});
test('本人情報の不一致は編集中に警告するだけ。キャッシュ切替と不明状態を反映しファイルは変えない',async()=>{
 let state={status:'ready',label:'synthetic',displayName:'検証 太郎'},verdict='mismatch';
 const h=makeHarness({v3:true,localDownloads:{create:()=>({load:async()=>state,compareFileIdentity:(s,source)=>s?.status==='ready'&&source?verdict:'unknown'})}});await h.tick();
 assert.equal(h.nodes.fileIdentityWarning.hidden,true);await chooseSample(h);assert.equal(h.nodes.fileIdentityWarning.hidden,false);
 verdict='match';h.windowEvents.get('focus')[0]();await h.tick();assert.equal(h.nodes.fileIdentityWarning.hidden,true);
 verdict='unknown';h.windowEvents.get('focus')[0]();await h.tick();assert.equal(h.nodes.fileIdentityWarning.hidden,true);
 assert.equal(h.cm.getValue(),'old saved content');assert.equal(h.calls.writes,0);assert.equal(h.calls.downloads,0);
});


for (const fragment of ['#topic-c', '#%E6%9C%AA%E6%9D%A5', '#topic#c', '']) {
  test('別ファイルへのリンクは保存先と位置を引き継ぐ: ' + (fragment || '位置指定なし'), async () => {
    const h = makeHarness(); await h.tick(); await chooseSample(h);
    h.disk.set('second.html', '<html><body><h2 id="topic-c">未来</h2></body></html>');
    await h.calls.previewOptions.onNavigate('./second.html' + fragment);
    assert.equal(h.nodes.currentFileLabel.textContent, 'second.html');
    assert.equal(h.cm.getValue(), h.disk.get('second.html'));
    assert.equal(h.calls.previewUpdates.at(-1)[1], 'second.html');
    assert.equal(h.calls.previewUpdates.at(-1)[2], fragment);
    assert.equal(h.calls.writes, 0);
  });
}

test('位置指定付きのリンクもフォルダ外・外部URL・クエリ指定を開かない', async () => {
  const h = makeHarness(); await h.tick(); await chooseSample(h);
  h.disk.set('second.html', 'destination');
  const updates = h.calls.previewUpdates.length;
  for (const href of ['../second.html#topic-c', '%2e%2e/second.html#topic-c', '/second.html#topic-c',
    'https://example.com/second.html#topic-c', 'second.html?query=1#topic-c', '%2fsecond.html#topic-c']) {
    await h.calls.previewOptions.onNavigate(href);
    assert.equal(h.nodes.currentFileLabel.textContent, 'sample.html');
    assert.equal(h.cm.getValue(), 'old saved content');
  }
  assert.equal(h.calls.previewUpdates.length, updates);
});

for (const mode of ['save', 'discard', 'cancel', 'writeFailure', 'readFailure']) {
  test('位置指定付きのファイル移動で未保存確認を維持する: ' + mode, async () => {
    const h = makeHarness({failWrite:mode === 'writeFailure', failReadAfterWrite:mode === 'readFailure'});
    await h.tick(); await chooseSample(h);
    h.disk.set('second.html', 'destination'); h.cm.setValue('edited content');
    const updates = h.calls.previewUpdates.length;
    const navigation = h.calls.previewOptions.onNavigate('second.html#topic-c'); await h.tick();
    assert.equal(h.calls.previewUpdates.length, updates, '確認が済むまで移動しない');
    h.nodes.actionButtons.children.find(n => n.dataset.choice ===
      (mode === 'cancel' ? 'cancel' : mode === 'discard' ? 'discard' : 'save')).click();
    await h.tick();
    await navigation;
    const moved = mode === 'save' || mode === 'discard';
    assert.equal(h.nodes.currentFileLabel.textContent, moved ? 'second.html' : 'sample.html');
    assert.equal(h.cm.getValue(), moved ? 'destination' : 'edited content');
    assert.equal(h.calls.previewUpdates.length, updates + Number(moved));
    if (moved) assert.equal(h.calls.previewUpdates.at(-1)[2], '#topic-c');
    assert.equal(h.disk.get('sample.html'), mode === 'save' || mode === 'readFailure' ? 'edited content' : 'old saved content');
  });
}
