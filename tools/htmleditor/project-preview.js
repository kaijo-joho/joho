/* 同じサイトの別タブへ、プレビューに必要なファイルの控えだけを渡す。 */
(function () {
  'use strict';
  const CHANNEL_PREFIX = 'joho.htmleditor.project-preview.';
  const WAIT_MS = 30000;
  const retry = 'プレビューを開けませんでした。エディタから別タブを開き直してください。';

  async function open(prepare, onError) {
    if (typeof BroadcastChannel !== 'function') {
      onError('このブラウザでは別タブの作品プレビューを利用できません。');
      return;
    }
    const key = crypto.randomUUID();
    const channel = new BroadcastChannel(CHANNEL_PREFIX + key);
    let timer;
    try {
      const ready = new Promise((resolve, reject) => {
        channel.onmessage = ({data}) => { if (data?.type === 'ready') resolve(); };
        timer = setTimeout(() => reject(new Error('別タブが開きませんでした。ブラウザのポップアップ設定を確認してください。')), WAIT_MS);
      });
      const url = new URL('project-preview.html?v=1', location.href);
      url.hash = key;
      // 素材の読み直しを待たず、ボタンを押した操作の中でタブを開く。
      window.open(url.href, '_blank', 'noopener,noreferrer');
      const result = Promise.resolve().then(prepare).catch(() => null);
      await ready;
      clearTimeout(timer);
      channel.postMessage({type:'project', snapshot:await result});
    } catch (error) { onError(error.message || retry); }
    finally { clearTimeout(timer); channel.close(); }
  }

  async function renderProject(snapshot, iframe, showNotice) {
    const {path, source, files, unsaved} = snapshot || {};
    if (!/\.html?$/i.test(path || '') || typeof source !== 'string' || !Array.isArray(files) ||
        files.some(item => typeof item?.path !== 'string' || !(item.file instanceof File))) throw new Error(retry);
    const fs = new HtmlFileSystem();
    const current = new File([source], path.split('/').pop(), {type:'text/html'});
    await fs.importFiles([current, ...files.map(item => item.file)], {relativePaths:[path, ...files.map(item => item.path)]});
    document.getElementById('projectPreviewUnsaved').hidden = unsaved !== true;
    const fileLabel = document.getElementById('projectPreviewFile');
    const preview = new HtmlPreview({iframe, fs, projectView:true, onNotice:showNotice,
      onTitle:title => {
        fileLabel.textContent = preview.basePath;
        document.title = title ? title + ' — 作品プレビュー' : '作品プレビュー';
      }});
    preview.update(source, path);
  }

  function receive(iframe) {
    const notice = document.getElementById('projectPreviewNotice');
    const showNotice = message => { notice.textContent = message; notice.hidden = !message; };
    const key = location.hash.slice(1);
    if (!/^[0-9a-f-]{36}$/i.test(key) || typeof BroadcastChannel !== 'function') { showNotice(retry); return; }
    history.replaceState(null, '', location.pathname + location.search);
    const channel = new BroadcastChannel(CHANNEL_PREFIX + key);
    const timer = setTimeout(() => { channel.close(); showNotice(retry); }, WAIT_MS);
    channel.onmessage = ({data}) => {
      if (data?.type !== 'project') return;
      clearTimeout(timer);
      channel.close();
      renderProject(data.snapshot, iframe, showNotice).catch(() => showNotice(retry));
    };
    channel.postMessage({type:'ready'});
  }

  const iframe = document.getElementById('projectPreviewFrame');
  if (iframe) receive(iframe);
  else window.HtmlProjectPreview = Object.freeze({open});
}());
