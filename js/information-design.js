// Information Design examples. Shared IS models select states; the common deck/progress owns navigation.
(() => {
  'use strict';
  const resize = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const observeState = (model, render) => {
    if (!model) return;
    render(model.dataset.isState || model.dataset.isDefault);
    new MutationObserver(() => render(model.dataset.isState || model.dataset.isDefault))
      .observe(model, { attributes: true, attributeFilter: ['data-is-state'] });
  };
  const node = (tag, text, className) => {
    const el = document.createElement(tag);
    if (text) el.textContent = text;
    if (className) el.className = className;
    return el;
  };
  function initialize() {
    // Keep source details open for no-JS reading; normal summary/exercise answers start closed.
    const details = [...document.querySelectorAll('.id-lesson .is-terms details')];
    details.forEach(el => { el.open = false; el.addEventListener('toggle', resize); });
    let printState = null;
    const printing = on => {
      if (on && printState === null) {
        printState = details.map(el => el.open); details.forEach(el => { el.open = true; });
      } else if (!on && printState !== null) {
        details.forEach((el, i) => { el.open = printState[i]; }); printState = null;
      }
    };
    window.addEventListener('beforeprint', () => printing(true));
    window.addEventListener('afterprint', () => printing(false));
    const media = matchMedia('print');
    if (media.addEventListener) media.addEventListener('change', e => printing(e.matches));
    else media.addListener(e => printing(e.matches));
    printing(media.matches);

    const events = [
      { name: 'アート展示', reading: 'ああと', location: '1階', time: '10:00', category: '展示' },
      { name: '囲碁体験', reading: 'いご', location: '2階', time: '11:00', category: '体験' },
      { name: '演劇', reading: 'えんげき', location: '講堂', time: '13:00', category: '公演' },
      { name: '科学展示', reading: 'かがく', location: '2階', time: '09:30', category: '展示' },
      { name: '総合案内', reading: 'そうごう', location: '1階', time: '09:00', category: '案内', priority: true },
      { name: '音楽演奏', reading: 'おんがく', location: '講堂', time: '10:30', category: '公演' }
    ];
    const eventList = list => {
      const ul = node('ul', '', 'id-events');
      list.forEach(event => {
        const li = node('li'); li.dataset.idEvent = event.name;
        li.append(node('strong', event.name), node('span', `${event.location} ／ ${event.time} ／ ${event.category}`)); ul.append(li);
      });
      return ul;
    };
    const latch = document.querySelector('[data-is-model="id11-latch"]');
    observeState(latch, state => {
      const output = latch.querySelector('[data-id-latch-output]');
      const fragment = document.createDocumentFragment();
      const group = (title, list, parent = fragment) => {
        const box = node('div', '', 'id-latch-group'); box.append(node('h3', title), eventList(list)); parent.append(box);
      };
      if (state === 'location') ['1階', '2階', '講堂'].forEach(key => group(key, events.filter(e => e.location === key)));
      if (state === 'category') ['案内', '展示', '体験', '公演'].forEach(key => group(key, events.filter(e => e.category === key)));
      if (state === 'alphabet') { fragment.append(node('h3', '企画名の読み：五十音順'), eventList([...events].sort((a,b) => a.reading.localeCompare(b.reading, 'ja')))); }
      if (state === 'time') { fragment.append(node('h3', '開始時刻順'), eventList([...events].sort((a,b) => a.time.localeCompare(b.time)))); }
      if (state === 'hierarchy') {
        group('まず確認：総合案内', events.filter(e => e.priority));
        const tree = node('div', '', 'id-latch-hierarchy'); tree.append(node('h3', '各企画 → 場所 → 企画名'));
        ['1階', '2階', '講堂'].forEach(key => group(key, events.filter(e => !e.priority && e.location === key), tree)); fragment.append(tree);
      }
      output.replaceChildren(fragment); resize();
    });

    function checklist(selector, sampleSelector, statusSelector, resetSelector, names, update) {
      document.querySelectorAll(selector).forEach(container => {
        const checks = [...container.querySelectorAll('input[type="checkbox"]')];
        const sample = container.querySelector(sampleSelector);
        const render = () => {
          checks.forEach(input => sample.classList.toggle(`has-${input.name}`, input.checked));
          const selected = checks.filter(el => el.checked).map(el => names[el.name]);
          container.querySelector(statusSelector).textContent = selected.length ? `加えた工夫：${selected.join('・')}` : 'Before：工夫を加えて比較します。';
          if (update) update(container, checks); resize();
        };
        checks.forEach(el => el.addEventListener('change', render));
        container.querySelector(resetSelector).addEventListener('click', () => { checks.forEach(el => { el.checked = false; }); render(); });
        render();
      });
    }
    checklist('[data-id-layout]', '.id-layout-sample', '[data-id-layout-status]', '[data-id-layout-reset]', { hierarchy: '見出しの階層', alignment: '整列', space: '余白' });
    checklist('[data-id-redesign]', '.id-redesign-sample', '[data-id-redesign-status]', '[data-id-redesign-reset]', { structure: '構造', alignment: '整列', space: '余白', palette: '配色', chart: '図表' }, (container, checks) => {
      const show = checks.find(el => el.name === 'chart').checked;
      container.querySelector('[data-id-chart-figure]').hidden = !show;
      // Retain textual data even when the chart is shown; the diagram is not the only way to obtain it.
    });
    document.querySelectorAll('[data-id-color]').forEach(container => {
      const inputs = [...container.querySelectorAll('input[type="range"]')];
      const render = () => {
        const values = Object.fromEntries(inputs.map(el => [el.name, Number(el.value)]));
        inputs.forEach(el => { container.querySelector(`[data-id-value="${el.name}"]`).textContent = el.value + (el.name === 'h' ? '°' : '%'); });
        container.querySelector('[data-id-swatch]').setAttribute('fill', `hsl(${values.h} ${values.s}% ${values.l}%)`);
        container.querySelector('[data-id-color-description]').textContent = `H ${values.h}°・S ${values.s}%・L ${values.l}%（HSLの設定値）`;
      };
      inputs.forEach(el => el.addEventListener('input', render));
      container.querySelector('[data-id-color-reset]').addEventListener('click', () => { inputs.forEach(el => { el.value = el.defaultValue; }); render(); }); render();
    });
    document.querySelectorAll('[data-id-gray]').forEach(container => {
      const checkbox = container.querySelector('[data-id-grayscale]');
      checkbox.addEventListener('change', () => container.classList.toggle('is-gray', checkbox.checked));
    });
    document.querySelectorAll('[data-id-alt]').forEach(container => {
      const image = container.querySelector('[data-id-alt-image]');
      const checkbox = container.querySelector('[data-id-alt-hide]');
      const text = container.querySelector('[data-id-alt-text]');
      const model = container.querySelector('[data-is-model]');
      const descriptions = { info: '図書館入口の右側に受付がある', action: '図書館の入口案内を開く', decorative: '' };
      const render = state => {
        image.alt = descriptions[state] ?? descriptions.info;
        image.hidden = checkbox.checked;
        text.hidden = !checkbox.checked;
        text.textContent = image.alt ? `代替テキストの例：${image.alt}` : '空のalt：画像は情報として読み上げず、本文の内容を利用します。'; resize();
      };
      observeState(model, render); checkbox.addEventListener('change', () => render(model.dataset.isState));
    });
    document.querySelectorAll('[data-id-keyboard]').forEach(form => {
      const result = form.querySelector('[data-id-keyboard-result]');
      form.addEventListener('submit', e => {
        e.preventDefault();
        result.textContent = form.elements.place.value === '講堂' ? '講堂：1階入口から廊下をまっすぐ進みます。' : '科学室：2階へ上がり、右へ進みます。'; resize();
      });
      form.querySelector('[data-id-keyboard-reset]').addEventListener('click', () => { form.reset(); result.textContent = '会場を選び、案内を表示してください。'; });
    });
    document.querySelectorAll('[data-id-ui-action]').forEach(button => button.addEventListener('click', () => {
      button.parentElement.querySelector('[data-id-ui-status]').textContent = '講堂への道順：1階入口から廊下をまっすぐ進みます。'; resize();
    }));
    document.querySelectorAll('[data-id-undo]').forEach(container => {
      const list = container.querySelector('[data-id-undo-list]');
      const deleteButton = container.querySelector('[data-id-delete]');
      const undoButton = container.querySelector('[data-id-undo-button]');
      const result = container.querySelector('[data-id-undo-status]');
      const apply = (deleted, message) => {
        list.replaceChildren(node('li', deleted ? '案内はありません。' : '音楽演奏　10:30　講堂'));
        deleteButton.disabled = deleted; undoButton.disabled = !deleted; result.textContent = message; resize();
      };
      deleteButton.addEventListener('click', () => { apply(true, '音楽演奏の案内を削除しました。「削除を取り消す」で戻せます。'); undoButton.focus(); });
      undoButton.addEventListener('click', () => { apply(false, '削除を取り消し、音楽演奏の案内を戻しました。'); deleteButton.focus(); });
      container.querySelector('[data-id-undo-reset]').addEventListener('click', () => apply(false, '見本を戻しました。案内が1件あります。'));
    });
    document.querySelectorAll('[data-id-criteria]').forEach(container => {
      const audience = container.querySelector('select');
      const checks = [...container.querySelectorAll('input[type="checkbox"]')];
      const descriptions = { place: '音楽公演の会場を見つける', time: '音楽公演の開始時刻を読み取る', help: '変更があったときの相談先を探す' };
      const render = () => {
        const output = container.querySelector('[data-id-criteria-output]');
        const selected = checks.filter(el => el.checked);
        output.replaceChildren(node('h3', '確かめる課題の例'), node('p', `${audience.value === 'first' ? '初めて来る人' : '案内係'}に、次の課題を試してもらいます。`));
        if (selected.length) { const ul = node('ul'); selected.forEach(el => ul.append(node('li', descriptions[el.value]))); output.append(ul); }
        else output.append(node('p', '目的を確かめる課題を1つ以上選んでください。'));
        resize();
      };
      audience.addEventListener('change', render); checks.forEach(el => el.addEventListener('change', render));
      container.querySelector('[data-id-criteria-reset]').addEventListener('click', () => { audience.selectedIndex = 0; checks.forEach(el => { el.checked = el.defaultChecked; }); render(); }); render();
    });
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
