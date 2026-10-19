/* 保存済みの固定テキストを端末内で確認する。受領・本人確認の代替にはしない。 */
(function (root, factory) {
  'use strict';
  const api = factory(typeof module === 'object' && module.exports ? require('./feedback.js') : root.HtmlGradingFeedback);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.HtmlEditorLocalGrading = api;
})(typeof window === 'undefined' ? globalThis : window, function (feedback) {
  'use strict';
  const MAX_BYTES = 2 * 1024 * 1024;
  const canonical = value => value === null || typeof value !== 'object' ? JSON.stringify(value) : Array.isArray(value) ? '[' + value.map(canonical).join(',') + ']' : '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonical(value[k])).join(',') + '}';
  const hex = bytes => Array.from(new Uint8Array(bytes), n => n.toString(16).padStart(2,'0')).join('');
  async function hash(text, crypto = globalThis.crypto) { return hex(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text))); }
  function select(catalog, proof) {
    if (!catalog || catalog.schema !== 1 || catalog.kind !== 'html-local-catalog-v1' || !Array.isArray(catalog.bindings) || !catalog.snapshots || !proof) throw Error('catalog_invalid');
    const bindings = catalog.bindings.filter(b => b.targetId === proof.assignmentId && b.templateVersion === proof.templateVersion && b.templateSha256 === proof.templateSha256);
    if (!bindings.length) throw Error('version_unavailable');
    if (bindings.some(b => canonical(b) !== canonical(bindings[0]))) throw Error('binding_ambiguous');
    const binding = bindings[0], snapshot = catalog.snapshots[binding.rubricSha256];
    if (!snapshot || snapshot.hash !== binding.rubricSha256 || snapshot.body.engineVersion !== binding.engineVersion || snapshot.body.engineSourceHash !== binding.engineSourceHash || snapshot.body.rubric.targetId !== binding.targetId || snapshot.body.rubric.version !== binding.rubricVersion) throw Error('binding_invalid');
    return {binding, snapshot};
  }
  // この関数だけをWorkerへ渡す。DOMもネットワークも使わず、HTMLを実行しない。
  function workerMain() {
    self.onmessage = event => {
      try {
        const input = event.data;
        if (input.engineVersion !== HtmlNormalConfiguredGrader.engineVersion || input.engineSourceHash !== HtmlNormalConfiguredGrader.engineSourceHash) throw Error('engine_mismatch');
        // gradeConfigured自身が凍結基準の構造を検査する（既存GASと同じ入口）。
        self.postMessage({ok:true,result:HtmlNormalConfiguredGrader.gradeConfigured(input.source, input.compiled)});
      } catch { self.postMessage({ok:false}); }
    };
  }
  function create(options = {}) {
    const env = options.env || globalThis, assets = options.assets || env.HtmlLocalGradingAssets;
    const base = options.base || new URL('.', env.location.href).href;
    let loading;
    async function load() {
      if (!assets || assets.schema !== 1) throw Error('assets_unavailable');
      if (!loading) loading = (async () => {
        async function read(path, expected, limit) {
          const url = new URL(path, base);
          if (url.origin !== new URL(base).origin) throw Error('asset_origin');
          const controller = new AbortController(), timer = setTimeout(() => controller.abort(), 12000);
          try {
            const r = await env.fetch(url.href, {signal:controller.signal,credentials:'omit',referrerPolicy:'no-referrer'});
            if (!r.ok || r.url !== url.href) throw Error('asset_unavailable');
            const text = await r.text();
            if (new TextEncoder().encode(text).length > limit || await hash(text, env.crypto) !== expected) throw Error('asset_changed');
            return text;
          } finally { clearTimeout(timer); }
        }
        const [json, engine] = await Promise.all([read(assets.catalog,assets.catalogSha256,300000),read(assets.engine,assets.engineSha256,1500000)]);
        return {catalog:JSON.parse(json),engine};
      })().catch(error => { loading = null; throw error; });
      return loading;
    }
    async function grade({source,fileName,proof,signal}) {
      if (typeof source !== 'string' || !source.length || new TextEncoder().encode(source).length > MAX_BYTES || fileName !== proof?.assignmentId + '.html') throw Error('source_invalid');
      if (signal?.aborted) throw Error('cancelled');
      const {catalog,engine} = await load();
      if (signal?.aborted) throw Error('cancelled');
      const {binding,snapshot} = select(catalog,proof);
      if (await hash(canonical(snapshot.body),env.crypto) !== snapshot.hash) throw Error('rubric_changed');
      const sourceSha256 = await hash(source,env.crypto);
      // 導入課題の★は「受領」の項目。ブラウザで先に合格させない。
      if (binding.targetId === 'html11-01') return {status:'receipt-only',sourceSha256};
      if (binding.engineVersion !== assets.engineVersion || binding.engineSourceHash !== assets.engineSourceHash) throw Error('engine_unavailable');
      const result = await new Promise((resolve,reject) => {
        let worker, url, timer, done = false;
        const finish = (error, value) => {
          if (done) return; done = true; clearTimeout(timer); worker?.terminate();
          if (url) env.URL.revokeObjectURL(url); signal?.removeEventListener('abort',cancel);
          if (error) reject(error); else resolve(value);
        };
        const cancel = () => finish(Error('cancelled'));
        try {
          url = env.URL.createObjectURL(new env.Blob([engine,'\n;(',workerMain.toString(),')();'],{type:'text/javascript'}));
          worker = new env.Worker(url);
          signal?.addEventListener('abort',cancel,{once:true});
          if (signal?.aborted) { cancel(); return; }
          timer = setTimeout(() => finish(Error('grading_timeout')), options.timeoutMs || 10000);
          worker.onmessage = e => e.data?.ok ? finish(null,e.data.result) : finish(Error('grading_failed'));
          worker.onerror = () => finish(Error('grading_failed'));
          worker.postMessage({source,compiled:snapshot.body.rubric,engineVersion:binding.engineVersion,engineSourceHash:binding.engineSourceHash});
        } catch (error) { finish(error); }
      });
      if (!result || !['graded','needs_review'].includes(result.state) || result.rubricId !== binding.targetId || result.rubricVersion !== binding.rubricVersion || result.engineVersion !== binding.engineVersion || !Array.isArray(result.rules) || result.rules.some(r => !snapshot.body.rubric.rules.some(rule => rule.ruleId === r.ruleId))) throw Error('result_invalid');
      return {status:'checked',receipt:{kind:'html-local-result-v1',...binding,sourceSha256,result}};
    }
    return Object.freeze({grade});
  }
  function panel(container, {grader,input,isCurrent,document = globalThis.document,timers = globalThis}) {
    const controller = new AbortController(); let disposed = false, finishDelay;
    // 採点・GASフォームの準備はすぐ始め、結果の表示だけを最低5秒待つ。
    const delay = new Promise(resolve => { finishDelay = resolve; });
    const timer = timers.setTimeout(finishDelay, 5000);
    const section = document.createElement('section'); section.className = 'local-grade-feedback';
    section.setAttribute('aria-busy','true');
    const heading = document.createElement('h3'); heading.textContent = 'このファイルの確認結果（端末内）';
    const status = document.createElement('p'); status.setAttribute('role','status');
    status.className = 'download-status';
    const spinner = document.createElement('span'); spinner.className = 'download-spinner'; spinner.setAttribute('aria-hidden','true');
    status.append(spinner,document.createTextNode('保存した内容を採点しています…'));
    const note = document.createElement('p'); note.className = 'note';
    note.textContent = 'この表示だけでは提出完了になりません。提出の完了はフォーム内の受領表示で確認してください。';
    section.append(heading,status,note); container.append(section);
    const completed = Promise.resolve().then(() => grader.grade({...input,signal:controller.signal})).then(async value => {
      await delay;
      if (disposed) return null;
      if (!isCurrent()) { status.textContent = '内容が変わりました。保存して提出を準備し直してください。'; return null; }
      if (value.status === 'receipt-only') { status.textContent = 'この課題は提出を受け付けた後に★がつきます。'; return value; }
      const result = value.receipt.result;
      status.textContent = result.state === 'graded' ? '保存した内容の確認が終わりました。' : '一部は自動確認できません。フォーム内の結果も確認してください。';
      const view = feedback?.build(result), table = view && feedback.render(view,document);
      const list = document.createElement('ul'); list.className = 'local-grade-rules';
      if (!table) result.rules.forEach(rule => {
        const li = document.createElement('li'), star = document.createElement('span');
        const graded = result.state === 'graded';
        star.className = graded && rule.passed ? 'local-grade-star correct' : 'local-grade-star';
        star.textContent = graded ? rule.passed ? '★ ' : '☆ ' : '';
        li.append(star, document.createTextNode((!graded ? '確認待ち：' : rule.passed ? '' : '要確認：') + rule.label)); list.append(li);
      });
      section.insertBefore(table || list,note); return value;
    }).catch(() => {
      if (!disposed) status.textContent = '端末内での確認を利用できません。下の提出フォームはそのまま使えます。';
      return null;
    }).finally(() => {
      timers.clearTimeout(timer); finishDelay();
      if (!disposed) section.setAttribute('aria-busy','false');
    });
    return {completed,dispose() { disposed = true; timers.clearTimeout(timer); finishDelay(); controller.abort(); section.remove(); }};
  }
  return Object.freeze({create,panel,select,canonical,hash,MAX_BYTES});
});
