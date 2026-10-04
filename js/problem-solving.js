// Artificial classroom cases. Learning state lives only in this document.
(() => {
  'use strict';
  const changed = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const setText = (host, selector, value) => { const el = host.querySelector(selector); if (el) el.textContent = value; };
  function initialize() {
    if (!document.body.classList.contains('ps-lesson')) return;
    document.body.classList.add('ps-ready');
    const terms = [...document.querySelectorAll('.is-terms details')];
    const sceneImages = [...document.querySelectorAll('.ps-scene img')];
    terms.forEach(el => { el.open = false; el.addEventListener('toggle', changed); });
    let printState = null;
    function printing(on) {
      if (on && printState === null) {
        printState = { terms: terms.map(el => el.open), images: sceneImages.map(el => el.getAttribute('loading')) };
        terms.forEach(el => { el.open = true; });
        // WebKit can leave an unvisited slide's lazy image unloaded in print.
        sceneImages.forEach(el => { el.loading = 'eager'; });
      } else if (!on && printState !== null) {
        terms.forEach((el, i) => { el.open = printState.terms[i]; });
        sceneImages.forEach((el, i) => {
          const loading = printState.images[i];
          if (loading === null) el.removeAttribute('loading');
          else el.setAttribute('loading', loading);
        });
        printState = null;
      }
    }
    window.addEventListener('beforeprint', () => printing(true));
    window.addEventListener('afterprint', () => printing(false));
    const media = matchMedia('print');
    if (media.addEventListener) media.addEventListener('change', e => printing(e.matches));
    else media.addListener(e => printing(e.matches));
    printing(media.matches);
    document.querySelectorAll('[data-ps-widget]').forEach(host => {
      const kind = host.dataset.psWidget;
      const feedback = value => { setText(host, '[data-ps-feedback]', value); changed(); };
      let reset = () => {};
      if (kind === 'goal') {
        const input = host.querySelector('[data-ps-target]');
        const update = () => {
          const n = Number(input.value), x = 100 + n * 50;
          host.querySelector('[data-ps-target-line]').setAttribute('d', `M${x} 175V50`);
          host.querySelector('[data-ps-target-dot]').setAttribute('cx', x);
          const label = host.querySelector('[data-ps-target-label]');
          label.setAttribute('x', x); label.textContent = `目標 ${n}件`;
          host.querySelector('[data-ps-gap-line]').setAttribute('d', `M${x} 150H500`);
          const gap = host.querySelector('[data-ps-gap-label]');
          gap.setAttribute('x', (x + 500) / 2); gap.textContent = `差 ${8 - n}件`;
          setText(host, '[data-ps-target-output]', `${n}件以下`);
          host.querySelector('svg desc').textContent = `同じ30件について、現状は期限を過ぎた記録8件、試す目標は${n}件以下。差は${8-n}件。`;
        };
        input.addEventListener('input', update);
        reset = () => { input.value = '2'; update(); };
      }
      if (kind === 'facts') {
        const fields = [...host.querySelectorAll('[data-ps-fact]')];
        const labels = { fact: '確認した事実', interpretation: '解釈・仮説', unknown: 'まだ未確認' };
        const clear = () => { host.querySelectorAll('[data-ps-row-feedback]').forEach(el => { el.textContent = ''; }); };
        host.querySelector('[data-ps-check]').addEventListener('click', () => {
          if (fields.some(el => !el.value)) { feedback('すべての項目を分類してから確かめましょう。'); return; }
          let correct = 0;
          fields.forEach(el => {
            const yes = el.value === el.dataset.psFact; if (yes) correct++;
            el.closest('li').querySelector('[data-ps-row-feedback]').textContent = yes ? '分類の考え方と一致しています。' : `見直す観点：この例では「${labels[el.dataset.psFact]}」として扱います。`;
          });
          feedback(`${fields.length}項目中${correct}項目が一致。言葉だけでなく、何を確かめたかに注目しましょう。`);
        });
        fields.forEach(el => el.addEventListener('change', () => { clear(); feedback('分類を変更しました。もう一度確かめられます。'); }));
        reset = () => { fields.forEach(el => { el.value = ''; }); clear(); feedback('分類してから確かめましょう。'); };
      }
      if (kind === 'brain') {
        const list = host.querySelector('[data-ps-ideas]'), input = host.querySelector('[data-ps-idea]');
        const add = () => {
          const value = input.value.trim();
          if (!value) { feedback('追加する案を短く書きましょう。'); input.focus(); return; }
          if (list.children.length >= 8) { feedback('8案になりました。内容を比べて、次の整理へ進みましょう。'); return; }
          const li = document.createElement('li'); li.textContent = value.slice(0, 80); li.dataset.psAdded = '';
          list.append(li); input.value = ''; feedback(`${list.children.length}案になりました。違う視点や組合せでも広げましょう。`); input.focus();
        };
        host.querySelector('[data-ps-add]').addEventListener('click', add);
        input.addEventListener('keydown', e => { if (e.key === 'Enter' && !e.isComposing) { e.preventDefault(); add(); } });
        reset = () => { list.querySelectorAll('[data-ps-added]').forEach(el => el.remove()); input.value = ''; feedback('効果の評価は、案を広げたあとに行います。最大8案。'); };
      }
      if (kind === 'cards') {
        const cards = [...host.querySelectorAll('[data-ps-card]')];
        const update = () => {
          const focused = document.activeElement;
          cards.forEach(card => {
            const field = card.querySelector('[data-ps-card-group]');
            const bucket = host.querySelector(`[data-ps-bucket="${field.value}"] ul`);
            if (card.parentElement !== bucket) bucket.append(card);
          });
          host.querySelectorAll('[data-ps-bucket]').forEach(bucket => setText(bucket, '[data-ps-count]', bucket.querySelectorAll('[data-ps-card]').length));
          if (host.contains(focused) && focused.matches('select')) focused.focus({ preventScroll: true });
          const remaining = host.querySelector('[data-ps-bucket="pool"] ul').children.length;
          feedback(remaining ? `未分類は${remaining}枚。内容の近さを考えて分類しましょう。` : '全6枚を分類しました。グループ名が内容を表しているか確かめ、グループ間の関係を説明しましょう。');
        };
        cards.forEach(card => card.querySelector('select').addEventListener('change', update));
        reset = () => { cards.forEach(card => { card.querySelector('select').value = 'pool'; }); update(); };
      }
      if (kind === 'rank') {
        const weights = [...host.querySelectorAll('[data-ps-weight]')], values = [[4,3,5],[5,3,3],[3,5,2]];
        const update = () => {
          const totals = values.map(row => row.reduce((sum, value, i) => sum + value * Number(weights[i].value), 0));
          totals.forEach((score, i) => {
            host.querySelector(`[data-ps-bar="${i}"]`).setAttribute('width', score * 10);
            const text = host.querySelector(`[data-ps-score="${i}"]`); text.setAttribute('x', 60 + score * 10); text.textContent = score;
          });
          const highest = Math.max(...totals), winners = totals.map((n,i) => n === highest ? 'ABC'[i] : '').filter(Boolean);
          const summary = totals.map((n,i) => `${'ABC'[i]}：${n}点`).join('、');
          feedback(`${summary}。現在は${winners.join('・')}が${winners.length > 1 ? '同点で' : ''}最上位です。選択の理由と、点数の根拠を確かめましょう。`);
          host.querySelector('svg desc').textContent = summary + '。各基準の点数に重みを掛けて足した仮の比較。';
        };
        weights.forEach(el => el.addEventListener('change', update));
        reset = () => { weights.forEach(el => { el.value = '1'; }); update(); };
      }
      if (kind === 'schedule') {
        const prep = host.querySelector('[data-ps-prep]'), trial = host.querySelector('[data-ps-trial]');
        const update = () => {
          const p = Number(prep.value), t = Number(trial.value);
          host.querySelector('[data-ps-prep-bar]').setAttribute('x', 155+(p-1)*85);
          host.querySelector('[data-ps-trial-bar]').setAttribute('x', 155+(t-1)*85);
          const message = `札作成は${p}日目、試行開始は${t}日目。` + (t > p ? '順序の条件を満たしています。' : '札作成が終わる前です。試行開始日か、準備の計画を見直しましょう。');
          feedback(message); host.querySelector('svg desc').textContent = message + ' 文面確認は1日目。札作成は1日かかり、終了した翌日以降に試行開始。';
        };
        [prep,trial].forEach(el => el.addEventListener('change', update));
        reset = () => { prep.value = '2'; trial.value = '3'; update(); };
      }
      if (kind === 'quiz') {
        const detail = host.querySelector('[data-ps-answer-text]');
        host.querySelector('[data-ps-check]').addEventListener('click', () => {
          const chosen = host.querySelector('input:checked');
          if (!chosen) { feedback('選択肢を選んでから確かめましょう。'); return; }
          const yes = chosen.value === host.dataset.psAnswer;
          feedback(yes ? '考え方と一致しています。理由を自分の言葉で説明しましょう。' : '判断の前提や、次の行動を見直しましょう。解説と比べて再度選べます。');
          detail.hidden = false;
        });
        host.querySelectorAll('input').forEach(el => el.addEventListener('change', () => { detail.hidden = true; feedback('選択しました。確かめる前に理由を考えましょう。'); }));
        reset = () => { host.querySelectorAll('input').forEach(el => { el.checked = false; }); detail.hidden = true; feedback('選んでから確かめましょう。'); };
      }
      host.querySelectorAll('[data-ps-reset]').forEach(button => button.addEventListener('click', () => { reset(); changed(); }));
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
