// 設定パネルの共通部品。開閉・配置は呼出側の既存メニューへ委ねる。
(() => {
  'use strict';
  let sequence = 0;
  function createPanel({idPrefix = 'site-display-settings', controller = window.siteDisplaySettings} = {}) {
    const api = controller;
    if (!api?.getState || !api?.setPreferences) return null;
    const panel = document.createElement('div');
    panel.className = 'site-display-settings__panel';
    panel.id = idPrefix + '-' + (++sequence);
    const title = document.createElement('div');
    title.id = panel.id + '-title';
    title.className = 'site-display-settings__title';
    title.setAttribute('role', 'heading');
    title.setAttribute('aria-level', '2');
    title.textContent = '表示設定';
    panel.setAttribute('aria-labelledby', title.id);
    panel.append(title);

    const field = label => {
      const group = document.createElement('fieldset');
      group.className = 'site-display-settings__field';
      const legend = document.createElement('legend');
      legend.textContent = label;
      group.append(legend);
      panel.append(group);
      return group;
    };
    const sizeField = field('全体の文字サイズ');
    const value = document.createElement('output');
    value.className = 'site-display-settings__value';
    const slider = document.createElement('input');
    slider.type = 'range';
    slider.min = '90'; slider.max = '150'; slider.step = '1';
    slider.className = 'site-display-settings__scale';
    slider.setAttribute('aria-label', '全体の文字サイズ');
    sizeField.append(value, slider);
    const ticks = document.createElement('div');
    ticks.className = 'site-display-settings__ticks';
    const marks = document.createElement('datalist');
    marks.id = panel.id + '-marks';
    slider.setAttribute('list', marks.id);
    const tickButtons = [ ['標準',100], ['大',110], ['特大',120] ].map(([label, scale]) => {
      const button = document.createElement('button');
      button.type = 'button';
      button.className = 'site-display-settings__tick';
      button.textContent = label;
      button.dataset.scale = String(scale);
      button.setAttribute('aria-label', label + '：' + scale + '%');
      button.addEventListener('click', () => api.setPreferences({textScale:scale}, {source:'ui'}));
      const mark = document.createElement('option');
      mark.value = String(scale); mark.label = label;
      marks.append(mark);
      ticks.append(button);
      return button;
    });
    sizeField.append(marks, ticks);
    let pointerAdjust = false;
    slider.addEventListener('keydown', () => { pointerAdjust = false; });
    slider.addEventListener('blur', () => { pointerAdjust = false; });
    slider.addEventListener('pointerdown', () => { pointerAdjust = true; });
    slider.addEventListener('pointerup', () => { pointerAdjust = false; });
    slider.addEventListener('pointercancel', () => { pointerAdjust = false; });
    slider.addEventListener('input', () => {
      let scale = Number(slider.value);
      if (pointerAdjust) {
        const anchor = [100,110,120].find(mark => Math.abs(mark - scale) <= 2);
        if (anchor !== undefined) scale = anchor;
      }
      api.setPreferences({textScale:scale}, {source:'ui'});
    });

    const wrapField = field('コード例');
    const wrapLabel = document.createElement('label');
    wrapLabel.className = 'site-display-settings__check';
    const wrap = document.createElement('input');
    wrap.type = 'checkbox';
    wrapLabel.append(wrap, document.createTextNode('長い行を折り返す'));
    wrapField.append(wrapLabel);
    wrap.addEventListener('change', () => api.setPreferences({codeWrap:wrap.checked}, {source:'ui'}));

    const optionGroup = (label, items, key) => {
      const group = field(label);
      const row = document.createElement('div');
      row.className = 'site-display-settings__choices';
      const buttons = items.map(([preference, text, icon]) => {
        const button = document.createElement('button');
        button.type = 'button';
        button.dataset.value = preference;
        button.className = 'site-display-settings__choice';
        if (icon) button.innerHTML = icon;
        button.append(document.createTextNode(text));
        button.addEventListener('click', () => api.setPreferences({[key]:preference}, {source:'ui'}));
        row.append(button);
        return button;
      });
      row.addEventListener('keydown', event => {
        const index = buttons.indexOf(document.activeElement);
        if (index < 0 || !['ArrowLeft','ArrowRight','Home','End'].includes(event.key)) return;
        event.preventDefault();
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1
          : (index + (event.key === 'ArrowLeft' ? -1 : 1) + buttons.length) % buttons.length;
        buttons[next].focus();
        buttons[next].click();
      });
      group.append(row);
      return buttons;
    };
    const spacingButtons = optionGroup('行間', [['standard','標準'],['relaxed','ゆったり']], 'lineSpacing');
    const icon = path => '<svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">' + path + '</svg>';
    const themeButtons = optionGroup('テーマ', [
      ['system','自動',icon('<rect x="3" y="4" width="18" height="13" rx="2"/><path d="M8 21h8M12 17v4"/>')],
      ['light','ライト',icon('<circle cx="12" cy="12" r="3.5"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2M5 5l1.5 1.5M17.5 17.5L19 19M5 19l1.5-1.5M17.5 6.5L19 5"/>')],
      ['dark','ダーク',icon('<path d="M20 15.2A8 8 0 0 1 8.8 4 8 8 0 1 0 20 15.2Z"/>')]
    ], 'theme');
    const reset = document.createElement('button');
    reset.type = 'button';
    reset.className = 'site-display-settings__reset';
    reset.textContent = '表示設定を初期値に戻す';
    reset.addEventListener('click', () => api.reset());
    panel.append(reset);

    const sync = () => {
      if (!api) return;
      const state = api.getState();
      slider.value = String(state.textScale);
      slider.setAttribute('aria-valuetext', state.textScale + '%');
      value.value = state.textScale + '%';
      tickButtons.forEach(button => button.setAttribute('aria-pressed', String(Number(button.dataset.scale) === state.textScale)));
      wrap.checked = state.codeWrap;
      spacingButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === state.lineSpacing)));
      themeButtons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.value === state.theme)));
    };
    sync();
    document.addEventListener('joho:display-settings-change', sync);
    return { element: panel, sync, destroy() { document.removeEventListener('joho:display-settings-change', sync); panel.remove(); } };
  }
  window.siteDisplaySettingsUI = {version:1, createPanel};
})();
