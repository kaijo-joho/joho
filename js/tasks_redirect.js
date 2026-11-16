// 生徒向けの固定入口。GAS URLの正本は既存の公開リンクデータに置く。
(() => {
  'use strict';

  const catalogURL = new URL('../data/links.json', document.currentScript.src);
  const status = document.getElementById('tasks-status');
  const fallback = document.getElementById('tasks-fallback');
  const link = document.getElementById('tasks-link');
  const recovery = document.getElementById('tasks-recovery');
  const retry = document.getElementById('tasks-retry');
  const autoRedirect = new URL(location.href).searchParams.get('redirect') !== '0';
  let loading = false;

  function resolveTarget(data) {
    if (data?.schemaVersion !== 1 || typeof data.generatedAt !== 'string' ||
        !Number.isFinite(Date.parse(data.generatedAt)) || new Date(data.generatedAt).toISOString() !== data.generatedAt ||
        !data.collections || Array.isArray(data.collections) ||
        !data.collections.urls || Array.isArray(data.collections.urls) ||
        !Object.hasOwn(data.collections.urls, 'taskstatus')) throw new Error('Invalid task catalog');
    const item = data.collections.urls.taskstatus;
    if (!item || typeof item.title !== 'string' || !item.title.trim() || typeof item.url !== 'string' ||
        /[\\\u0000-\u0020\u007f]/.test(item.url)) throw new Error('Invalid task entry');
    const url = new URL(item.url);
    if (url.origin !== 'https://script.google.com' || url.username || url.password || url.hash ||
        !/^\/(?:a\/macros\/gfe\.kaijo\.ed\.jp\/|macros\/)s\/[A-Za-z0-9_-]+\/exec$/.test(url.pathname)) {
      throw new Error('Invalid task destination');
    }
    return { title: item.title.trim(), url: url.href };
  }

  async function openTasks() {
    if (loading) return;
    loading = true;
    retry.disabled = true;
    recovery.hidden = true;
    fallback.hidden = true;
    link.removeAttribute('href');
    status.textContent = '課題の提出・回答状況を開いています…';
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10000);
    try {
      const response = await fetch(catalogURL.href, {
        cache: 'no-cache', credentials: 'omit', redirect: 'error', referrerPolicy: 'no-referrer', signal: controller.signal
      });
      if (!response.ok) throw new Error('Task catalog unavailable');
      const item = resolveTarget(await response.json());
      link.href = item.url;
      link.textContent = item.title + 'を開く';
      fallback.hidden = false;
      if (!autoRedirect) {
        status.textContent = '下のリンクから課題の提出・回答状況を開けます。';
        return;
      }
      // 入口URLのクエリ・ハッシュは渡さず、公開済みの行き先へ直接移動する。
      // replaceで、戻る操作による中継ページへの再入場を避ける。
      try { location.replace(item.url); }
      catch { status.textContent = '自動で移動できませんでした。下のリンクから開いてください。'; }
    } catch {
      status.textContent = '課題ページのリンクを確認できませんでした。時間をおいて、もう一度お試しください。';
      recovery.hidden = false;
    } finally {
      clearTimeout(timeout);
      loading = false;
      retry.disabled = false;
    }
  }

  retry.addEventListener('click', openTasks);
  void openTasks();
})();
