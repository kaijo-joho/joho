/* Package the same playback code with artwork in a single, offline HTML file. */
(function (root) {
  'use strict';
  const runtimeURL = new URL(document.currentScript.src), base = new URL('.', runtimeURL);
  const scripts = ['vendor/paper-core-0.12.18.min.js', 'core.js', 'geometry.js', 'connectors.js', 'svg.js', 'animation.js', 'animation-player.js', 'presentation.js'];
  let bundlePromise;
  function bundle() {
    if (!bundlePromise) bundlePromise = Promise.all([...scripts, 'presentation.css', 'vendor/PAPER-LICENSE.txt'].map(async file => {
      const url = new URL(file, base); url.search = runtimeURL.search;
      const response = await fetch(url, {credentials:'omit'});
      if (!response.ok) throw Error('再生用ファイルを取得できませんでした。接続を確認してもう一度お試しください。');
      return response.text();
    })).catch(error => { bundlePromise = null; throw error; });
    return bundlePromise;
  }
  const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  function json(value) { return JSON.stringify(value).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029'); }
  async function buildHTML(input) {
    const C = root.IlapoCore, doc = C.validateDocument(input);
    // Do not distribute hidden reference images in a playback artifact.
    for (const page of doc.pages) {
      root.IlapoConnectors.sync(page);
      page.objects = page.objects.filter(o => !(o.type === 'image' && o.reference));
      root.IlapoConnectors.sync(page); C.pruneAnimations(page);
    }
    const checked = C.validateDocument(doc), source = await bundle();
    const js = source.slice(0, scripts.length).join('\n;\n').replace(/<\/script/gi, '<\\/script');
    const css = source[scripts.length].replace(/<\/style/gi, '<\\/style');
    const license = esc(source[scripts.length + 1]);
    return `<!doctype html>
<html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="referrer" content="no-referrer"><title>${esc(checked.name)} — 発表</title><link rel="icon" href="data:,">
<style>html,body{margin:0;background:#05070b;color:#f5f7fb;font:16px/1.6 system-ui,sans-serif}main{max-width:720px;padding:32px;margin:auto}h1{overflow-wrap:anywhere}button{font:inherit;padding:12px 22px;cursor:pointer}summary{cursor:pointer}pre{white-space:pre-wrap;overflow-wrap:anywhere}a{color:#8db7ff}[hidden]{display:none!important}${css}</style></head>
<body><main><h1>${esc(checked.name)}</h1><p>クリック・Space・→で次へ、←で前へ、Rでこのページをやり直します。Escapeで終了します。</p><button type="button" id="restart">先頭から再生</button><p id="error" role="alert" hidden></p><p>イラストスライド illustSlideで作成 · このファイルだけで再生できます。</p><details><summary>再生ライブラリの利用条件</summary><pre>${license}</pre></details></main><noscript>再生にはJavaScriptを有効にしてください。</noscript>
<script type="application/json" id="ilapo-playback-data">${json(checked)}</script>
<script>${js}</script><script>(function(){'use strict';const button=document.getElementById('restart');function start(){try{window.ilapoPlayback=IlapoPresentation.open(JSON.parse(document.getElementById('ilapo-playback-data').textContent),{opener:button});}catch(error){const el=document.getElementById('error');el.hidden=false;el.textContent='再生できませんでした。'+error.message;}}button.addEventListener('click',start);start();}());</script></body></html>`;
  }
  root.IlapoPlaybackExport = {buildHTML};
}(globalThis));
