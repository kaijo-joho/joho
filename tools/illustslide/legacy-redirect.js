/* Keep the old entry point usable, including file:// browser-save recovery. */
(function () {
  'use strict';
  const destination = new URL('../illustslide/index.html', location.href);
  destination.search = location.search;
  destination.hash = location.hash;
  document.getElementById('destination').href = destination.href;
  if (location.protocol !== 'file:') {
    location.replace(destination.href);
    return;
  }
  try {
    const theme = JSON.parse(localStorage.getItem('kaijo-ilapo:settings') || '{}').theme;
    if (['light', 'dark'].includes(theme)) document.documentElement.dataset.theme = theme;
  } catch (_) { /* Settings must not prevent recovery. */ }
  try {
    const records = new window.IlapoCore.Store(localStorage).list();
    for (const record of records) {
      const button = document.createElement('button');
      const method = record.kind === 'auto' ? '自動保存' : '明示保存';
      button.textContent = method + '：' + record.document.name + ' を保存';
      button.onclick = () => {
        const url = URL.createObjectURL(new Blob([JSON.stringify(record.document)], { type: 'application/json' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = (record.document.name || '作品').replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_').slice(0, 100) + '_' + method + '.illustslide.json';
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(url), 5000);
      };
      document.getElementById('saved-files').append(button);
    }
    document.getElementById('old-storage').hidden = !records.length;
    if (['auto', 'saved'].some(kind => localStorage.getItem('kaijo-ilapo:' + kind) && !records.some(record => record.kind === kind))) {
      document.getElementById('message').textContent = '以前の保存内容を読み取れないものがあります。保存データは消していません。';
    }
  } catch (_) {
    document.getElementById('message').textContent = '以前のブラウザ保存を確認できませんでした。手元の再編集ファイルは、新しいエディタで開けます。';
  }
}());
