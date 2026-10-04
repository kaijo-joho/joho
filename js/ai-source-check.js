// IS63: compare a fictional draft with the supplied source; no AI request or storage.
(() => {
  'use strict';
  function initialize() {
    document.querySelectorAll('[data-ai-source-check]').forEach(host => {
      const rows = [...host.querySelectorAll('[data-ai-claim]')];
      const fields = [...host.querySelectorAll('select')];
      const feedback = host.querySelector('[data-ai-feedback]');
      const revision = host.querySelector('[data-ai-revision]');
      const printable = host.querySelector('[data-ai-revision-print]');
      const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
      const clear = () => {
        rows.forEach(row => { row.querySelector('[data-ai-row-feedback]').textContent = ''; });
        feedback.textContent = '各文の判断と根拠を選び、確かめましょう。';
      };
      host.classList.add('ai-source-ready');
      host.querySelectorAll('select, button').forEach(control => { control.disabled = false; });
      host.querySelector('[data-ai-check]').addEventListener('click', () => {
        const missing = fields.find(field => !field.value);
        if (missing) {
          feedback.textContent = 'まだ選んでいない欄があります。判断と、その根拠を選びましょう。';
          missing.focus();
          resize();
          return;
        }
        let correct = 0;
        rows.forEach(row => {
          const verdict = row.querySelector('[data-ai-verdict]').value === row.dataset.aiClaim;
          const evidence = row.querySelector('[data-ai-evidence]').value === row.dataset.aiSource;
          if (verdict && evidence) correct++;
          row.querySelector('[data-ai-row-feedback]').textContent = verdict && evidence
            ? row.dataset.aiClaim === 'unknown'
              ? '資料に記載がないと確認できました。誰に何を確かめるかを説明しましょう。'
              : '判断と根拠が一致しています。資料のどの言葉を使ったか説明しましょう。'
            : '判断と根拠の組合せを見直しましょう。「書かれていない」と「食い違う」は同じでしょうか。';
        });
        feedback.textContent = correct === rows.length
          ? '4文とも資料との関係を確認できました。食い違う内容を直し、未確認の情報をどう扱うかを書きましょう。'
          : `${rows.length}文中${correct}文で判断と根拠が一致しました。資料へ戻って直し、もう一度確かめられます。`;
        resize();
      });
      fields.forEach(field => field.addEventListener('change', () => { clear(); resize(); }));
      host.querySelector('[data-ai-reset]').addEventListener('click', () => {
        fields.forEach(field => { field.value = ''; });
        clear();
        feedback.textContent = '照合の選択を戻しました。修正版のメモは残しています。';
        resize();
      });
      const reflect = () => {
        printable.textContent = revision.value || '（修正版と、確認できない情報の扱いを記入）';
      };
      revision.addEventListener('input', reflect);
      reflect();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
