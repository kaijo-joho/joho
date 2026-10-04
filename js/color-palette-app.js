/* OKLCH palette UI. Requested OKLCH stays intact; previews and exports use the shared sRGB mapping. */
(() => {
  'use strict';
  const Core = window.ColorPaletteCore, Model = window.ColorPaletteModel;
  const $ = id => document.getElementById(id);
  const STORAGE_KEY = 'oklch-palette-v1', RECOVERY_KEY = `${STORAGE_KEY}-recovery`;
  const clone = value => JSON.parse(JSON.stringify(value));
  let palette = Model.defaults(), queue = Promise.resolve(), volatile = false;
  let history = [], future = [], selectedColor = null, gridColors = [], toastTimer, modalOpener;
  let gridSignature = '', stockSignature = '', gestureId = 0, historyEpoch = 0, traveling = false;
  const systemTheme = window.matchMedia('(prefers-color-scheme: dark)');
  const iconPaths = {
    undo: '<path d="M3 10h11a7 7 0 0 1 0 14"/><path d="m8 5-5 5 5 5"/>',
    redo: '<path d="M21 10H10a7 7 0 0 0 0 14"/><path d="m16 5 5 5-5 5"/>',
    save: '<path d="M5 3h12l4 4v14H3V3h2Z"/><path d="M7 3v6h10V3M7 21v-8h10v8"/>',
    open: '<path d="M3 7V4h7l3 3h8v3M3 7h18l-3 13H3Z"/>',
    auto: '<circle cx="12" cy="12" r="9"/><path d="M12 3v18" fill="currentColor"/><path d="M12 3a9 9 0 0 1 0 18Z" fill="currentColor"/>',
    sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l2 2m10 10 2 2M5 19l2-2M17 7l2-2"/>',
    moon: '<path d="M20 15A9 9 0 0 1 9 4a9 9 0 1 0 11 11Z"/>',
    copy: '<rect x="8" y="8" width="13" height="13" rx="2"/><path d="M16 8V3H3v13h5"/>',
    plus: '<path d="M12 4v16M4 12h16"/>', apply: '<path d="m8 7-5 5 5 5M3 12h12a6 6 0 0 0 6-6"/>',
    code: '<path d="m8 5-6 7 6 7m8-14 6 7-6 7m-3-16-2 18"/>', close: '<path d="m5 5 14 14M19 5 5 19"/>'
  };
  function icon(kind) { return `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${iconPaths[kind] || ''}</svg>`; }
  document.querySelectorAll('[data-icon]').forEach(el => { el.innerHTML = icon(el.dataset.icon); });
  function toast(message) {
    $('toast').textContent = message; $('toast').classList.add('visible');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => $('toast').classList.remove('visible'), 3500);
  }
  function storageWarning(message) {
    volatile = true; $('storage-warning').hidden = false; $('storage-warning').textContent = message;
    $('storage-status').textContent = '変更はこのタブ内だけに保持しています。JSON保存を利用してください。';
  }
  function readStored() {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw === null) return { document: Model.defaults(), repaired: false, raw: null };
    return { ...Model.normalizeDocument(raw), raw };
  }
  async function initStorage() {
    if (!navigator.locks?.request) {
      try { palette = readStored().document; } catch (_) { /* Defaults remain usable. */ }
      storageWarning('この環境ではタブ間の保存を保護できないため、自動保存を利用できません。JSON保存で変更を保管できます。');
      return;
    }
    await navigator.locks.request(`${STORAGE_KEY}-write`, () => {
      let loaded;
      try { loaded = readStored(); }
      catch (_) {
        try {
          const raw = localStorage.getItem(STORAGE_KEY);
          if (raw && !localStorage.getItem(RECOVERY_KEY)) localStorage.setItem(RECOVERY_KEY, raw);
          loaded = { document: Model.defaults(), repaired: true, raw };
        } catch (_) { storageWarning('ブラウザー内に保存できません。JSON保存で変更を保管してください。'); return; }
      }
      palette = loaded.document;
      try {
        if (loaded.repaired || loaded.raw === null) {
          if (loaded.repaired && loaded.raw && !localStorage.getItem(RECOVERY_KEY)) localStorage.setItem(RECOVERY_KEY, loaded.raw);
          localStorage.setItem(STORAGE_KEY, JSON.stringify(palette));
        }
        $('storage-status').textContent = loaded.repaired ? '保存形式を更新しました。元の保存データもブラウザー内に保管しています。' : 'このブラウザーに自動保存します。別タブの変更も反映します。';
      } catch (_) { storageWarning('ブラウザー内に保存できません。JSON保存で変更を保管してください。'); }
    });
  }
  function remember(result, options) {
    if (!result.changed || options.record === false) return;
    const previous = history.at(-1), now = Date.now(), group = options.group ? `${options.group}:${historyEpoch}` : null;
    if (group && previous?.group === group && now - previous.time < 1000
        && previous.command.type === 'state' && result.inverse.type === 'state') {
      // Keep the first pre-gesture values, but guard against the final values.
      for (const [key, value] of Object.entries(result.inverse.patch)) if (!(key in previous.command.patch)) previous.command.patch[key] = value;
      Object.assign(previous.command.expected, result.inverse.expected);
      previous.time = now;
    } else history.push({ command: result.inverse, group, time: now });
    if (history.length > 100) history.shift();
    future = [];
  }
  function transact(builder, options = {}) {
    const job = queue.then(async () => {
      const execute = () => {
        let latest = palette;
        if (!volatile) {
          try { latest = readStored().document; if (JSON.stringify(latest) !== JSON.stringify(palette)) historyEpoch++; }
          catch (_) { storageWarning('保存データを読み込めません。別タブへの書込みを止め、変更をこのタブに保持します。'); }
        }
        const command = typeof builder === 'function' ? builder(latest) : builder;
        const result = Model.applyCommand(latest, command);
        palette = result.document;
        if (result.changed && !volatile) {
          try { localStorage.setItem(STORAGE_KEY, JSON.stringify(palette)); }
          catch (_) { storageWarning('保存容量またはブラウザー設定により自動保存できません。JSON保存で変更を保管してください。'); }
        }
        remember(result, options); render(); return result;
      };
      return volatile ? execute() : navigator.locks.request(`${STORAGE_KEY}-write`, execute);
    });
    queue = job.catch(() => {});
    return job;
  }
  function run(builder, options = {}) {
    return transact(builder, options).catch(error => { toast(error.message); render(); return null; });
  }
  async function travel(from, to, label) {
    if (traveling) return;
    traveling = true;
    await queue;
    const entry = from.at(-1);
    if (!entry) { traveling = false; return; }
    try {
      const result = await transact(entry.command, { record: false });
      from.pop(); if (result.changed) to.push({ command: result.inverse, time: Date.now() });
      renderHistory(); toast(label);
    } catch (_) {
      from.pop(); renderHistory(); toast('別タブで対象が変更されたため、この操作を戻せません。現在の内容を確認してください。');
    } finally { traveling = false; }
  }
  function renderHistory() { $('btn-undo').disabled = !history.length; $('btn-redo').disabled = !future.length; }
  window.addEventListener('storage', event => {
    if (event.key !== STORAGE_KEY || !event.newValue || volatile) return;
    queue.then(() => {
      try {
        const latest = readStored().document;
        if (JSON.stringify(latest) !== JSON.stringify(palette)) {
          historyEpoch++; palette = latest; render(); $('storage-status').textContent = '別タブの変更を反映しました。';
        }
      } catch (_) { toast('別タブの保存データを読み込めませんでした。'); }
    });
  });
  const hex = rgb => `#${Core.rgbToHex(rgb.r, rgb.g, rgb.b)}`;
  const rgbCss = rgb => `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`;
  const mapped = color => Core.mapToSrgb(color.l, color.c, color.h);
  const readable = rgb => Model.contrastRatio(rgb, {r:255,g:255,b:255}) >= Model.contrastRatio(rgb, {r:0,g:0,b:0}) ? '#FFFFFF' : '#000000';
  function format(color, output = palette.state.outputFormat) {
    const rgb = mapped(color);
    if (output === 'oklch') return `oklch(${rgb.l.toFixed(8)} ${rgb.c.toFixed(8)} ${rgb.h.toFixed(6)})`;
    if (output === 'rgb') return rgbCss(rgb);
    if (output === 'hsl' || output === 'hsv') {
      const values = output === 'hsl' ? Model.rgbToHsl(rgb.r,rgb.g,rgb.b) : Model.rgbToHsv(rgb.r,rgb.g,rgb.b);
      return `${output}(${values.h.toFixed(3)}, ${values.s.toFixed(3)}%, ${(values.l ?? values.v).toFixed(3)}%)`;
    }
    return hex(rgb);
  }
  function syncValue(el, value) {
    if (document.activeElement !== el) { el.value = value; el.removeAttribute('aria-invalid'); }
  }
  function renderInputs() {
    const s = palette.state, color = mapped(s);
    $('base-swatch').style.backgroundColor = rgbCss(color);
    $('disp-oklch').textContent = `${s.l.toFixed(3)}, ${s.c.toFixed(3)}, ${s.h.toFixed(1)}°`;
    $('disp-oklch').title = format(s, 'oklch');
    $('disp-hex').textContent = hex(color);
    $('disp-rgb').textContent = `${color.r}, ${color.g}, ${color.b}`;
    $('disp-hsl').textContent = `${s.hsl.h.toFixed(1)}°, ${s.hsl.s.toFixed(1)}%, ${s.hsl.l.toFixed(1)}%`;
    $('disp-hsv').textContent = `${s.hsv.h.toFixed(1)}°, ${s.hsv.s.toFixed(1)}%, ${s.hsv.v.toFixed(1)}%`;
    document.querySelectorAll('[data-color-source]').forEach(el => {
      const source = el.dataset.colorSource, part = el.dataset.part;
      const value = source === 'hsl' || source === 'hsv' ? s[source][part] : s[part];
      syncValue(el, source === 'oklch' ? Number(value.toFixed(part === 'h' ? 1 : 3)) : source === 'rgb' ? value : Number(value.toFixed(1)));
      if (el.type === 'range') {
        const max = Number(el.max);
        const stops = Array.from({length:13}, (_, i) => {
          const patch = Model.colorPatch(s, source, {[part]: source === 'rgb' ? Math.round(max * i / 12) : max * i / 12});
          return rgbCss(patch);
        });
        el.style.background = `linear-gradient(to right, ${stops.join(',')})`;
      }
    });
    syncValue($('input-hex'), hex(color));
    syncValue($('input-count'), s.count);
    $('btn-dec').disabled = s.count <= 3; $('btn-inc').disabled = s.count >= 36;
    $('format-select').value = s.outputFormat;
    $('group-hsl').hidden = s.hsvMode !== 'hsl'; $('group-hsv').hidden = s.hsvMode !== 'hsv';
    ['hsl','hsv'].forEach(mode => $('btn-show-'+mode).setAttribute('aria-pressed', String(mode === s.hsvMode)));
    ['fill','light','dark'].forEach(mode => $('btn-mode-'+mode).setAttribute('aria-pressed', String(mode === 'fill' ? s.viewMode === 'fill' : s.viewMode === 'text' && s.bgTheme === mode)));
    $('gamut-notice').textContent = color.mapped ? 'sRGB外のため、見本と出力では明度・色相を保ち、彩度を下げています。入力したOKLCH値は保持します。' : '見本・コピー・CSSは同じsRGBの色です。';
  }
  function make(tag, className, text) {
    const el = document.createElement(tag); if (className) el.className = className;
    if (text !== undefined) el.textContent = text; return el;
  }
  function chosen() { return selectedColor || palette.state; }
  function renderSelection() {
    const color = chosen(); $('selected-swatch').style.backgroundColor = rgbCss(mapped(color));
    $('selected-label').textContent = `${selectedColor ? '選択色' : '基準色'} ${format(color, 'hex')} ／ L${(color.l*100).toFixed(1)} H${color.h.toFixed(1)}°`;
  }
  function renderGrid() {
    const s = palette.state;
    const signature = JSON.stringify([s.l,s.c,s.h,s.count,s.viewMode,s.bgTheme]);
    if (signature === gridSignature) return;
    gridSignature = signature;
    const focusIndex = document.activeElement?.classList.contains('grid-cell') ? Number(document.activeElement.dataset.index) : -1;
    const grid = $('main-grid'), fragment = document.createDocumentFragment();
    grid.style.gridTemplateColumns = `repeat(${s.count}, minmax(76px, 1fr))`;
    const hues = Array.from({length:s.count}, (_, i) => (s.h+i*360/s.count)%360);
    const names = resolveColorNames(hues, s.count), {steps, baseIndex} = Core.generateLightnessSteps(s.l);
    gridColors = [];
    names.forEach((name, col) => {
      const header = make('div','grid-header',name.ja);
      header.append(make('small','',name.en), make('small','',`${hues[col].toFixed(0)}°`)); fragment.append(header);
    });
    steps.forEach((l, row) => hues.forEach((h, col) => {
      const color = {l,c:s.c,h}, rgb = mapped(color), index = gridColors.length;
      gridColors.push(color);
      const cell = make('button','grid-cell'+(row === baseIndex && col === 0 ? ' base-cell' : ''));
      cell.type = 'button'; cell.dataset.index = index;
      cell.tabIndex = index === (focusIndex >= 0 ? Math.min(focusIndex, steps.length*s.count-1) : baseIndex*s.count) ? 0 : -1;
      cell.setAttribute('aria-label', `${names[col].ja}・明度${(l*100).toFixed(1)}% ${hex(rgb)}をコピー${rgb.mapped ? '（sRGBに調整）' : ''}`);
      cell.setAttribute('aria-pressed', String(selectedColor && ['l','c','h'].every(key => Math.abs(selectedColor[key]-color[key]) < 1e-8) || false));
      const background = s.viewMode === 'fill' ? rgbCss(rgb) : s.bgTheme === 'light' ? '#FFFFFF' : '#0F172A';
      cell.style.setProperty('--cell-bg',background); cell.style.backgroundColor = background;
      cell.style.color = s.viewMode === 'fill' ? readable(rgb) : rgbCss(rgb);
      if (s.viewMode === 'text') cell.append(make('span','sample-text','Ag'));
      if (col === 0) {
        const label = make('span','lightness-label',`L${(l*100).toFixed(0)}`);
        if (s.viewMode === 'text') label.style.color = s.bgTheme === 'light' ? '#475569' : '#CBD5E1';
        cell.append(label);
      }
      if (rgb.mapped) cell.append(make('span','gamut-tag','sRGB'));
      fragment.append(cell);
    }));
    grid.replaceChildren(fragment);
    if (focusIndex >= 0) grid.querySelector('[tabindex="0"]')?.focus({preventScroll:true});
  }
  function selectGrid(cell, copy) {
    const index = Number(cell.dataset.index);
    selectedColor = clone(gridColors[index]);
    $('main-grid').querySelectorAll('.grid-cell').forEach(el => { el.tabIndex = el === cell ? 0 : -1; el.setAttribute('aria-pressed', String(el === cell)); });
    renderSelection(); if (copy) { cell.focus({preventScroll:true}); copyText(format(selectedColor), '色をコピーしました。'); }
  }
  function defaultName(color) { return `${color.c < 1e-6 ? 'gray' : lookupName(color.h, hueAnchorsDetailed).p.en.toLowerCase()}-${Math.round(color.l*100)}`; }
  async function addStock(color, manual = false) {
    const result = await run(doc => { const value = color || doc.state; return {type:'addStock',color:{l:value.l,c:value.c,h:value.h,name:defaultName(value)}}; });
    if (result?.changed) { toast('ストックに追加しました。'); if (manual) $('manual-hex').value = ''; }
  }
  async function applyColor(color) {
    await run(doc => ({type:'state',patch:Model.colorPatch(doc.state,'oklch',color)}));
    activateTab('main-tab-editor'); $('num-l').scrollIntoView({block:'center'}); $('num-l').focus({preventScroll:true});
  }
  function renderStock() {
    const signature = JSON.stringify([palette.pinnedColors,palette.state.outputFormat]);
    if (signature === stockSignature) return;
    stockSignature = signature;
    const active = document.activeElement, focusId = active?.closest('.stock-card')?.dataset.id, focusField = active?.dataset.field;
    const fragment = document.createDocumentFragment();
    palette.pinnedColors.forEach(color => {
      const card = make('article','stock-card'); card.dataset.id = color.id;
      const rgb = mapped(color), surface = make('button','stock-swatch',hex(rgb));
      surface.type = 'button'; surface.style.setProperty('--cell-bg',rgbCss(rgb)); surface.style.backgroundColor = rgbCss(rgb); surface.style.color = readable(rgb);
      surface.setAttribute('aria-label',`${color.name}をコピー`); surface.addEventListener('click',() => copyText(format(color),'色をコピーしました。'));
      if (rgb.mapped) surface.append(make('span','gamut-tag','sRGB'));
      const fields = make('div','stock-fields');
      [['name','表示名'],['cssName','CSS変数名']].forEach(([key,label]) => {
        const id = `stock-${color.id}-${key}`, wrapper = make('label','',label), input = make('input');
        wrapper.htmlFor = id; input.id = id; input.value = color[key]; input.dataset.field = key;
        input.setAttribute('aria-label',`${color.name}の${label}`); input.spellcheck = false;
        input.addEventListener('change',async () => {
          const value = input.value;
          const result = await run({type:key === 'name' ? 'renameStock' : 'setCssName',id:color.id,[key]:value,expected:color[key]});
          if (!result) input.value = palette.pinnedColors.find(pin => pin.id === color.id)?.[key] ?? '';
        });
        wrapper.append(input); fields.append(wrapper);
      });
      fields.append(make('div','stock-value',format(color)));
      const actions = make('div','stock-actions'), apply = make('button','','基準色に適用'), remove = make('button','','削除');
      apply.type = remove.type = 'button'; apply.dataset.field = 'apply'; remove.dataset.field = 'remove';
      apply.setAttribute('aria-label',`${color.name}を基準色に適用`); remove.setAttribute('aria-label',`${color.name}をストックから削除`);
      apply.addEventListener('click',()=>applyColor(color));
      remove.addEventListener('click',async () => {
        const index = palette.pinnedColors.findIndex(pin => pin.id === color.id);
        const result = await run({type:'removeStock',id:color.id,expected:color});
        if (result?.changed) {
          const nextCard = $('stock-container').children[Math.min(index,palette.pinnedColors.length-1)];
          (nextCard?.querySelector('.stock-swatch') || $('manual-hex')).focus();
          toast('削除しました。「元に戻す」で復元できます。');
        }
      });
      actions.append(apply,remove); fields.append(actions); card.append(surface,fields); fragment.append(card);
    });
    $('stock-container').replaceChildren(fragment); $('stock-count').textContent = palette.pinnedColors.length;
    $('empty-stock-msg').hidden = Boolean(palette.pinnedColors.length);
    if (focusId && focusField) Array.from($('stock-container').querySelectorAll('.stock-card')).find(card => card.dataset.id === focusId)?.querySelector(`[data-field="${focusField}"]`)?.focus({preventScroll:true});
    ['fg','bg'].forEach(side => {
      const select = $('comparison-'+side+'-stock'), placeholder = make('option','','ストックから選ぶ'); placeholder.value = '';
      select.replaceChildren(placeholder);
      palette.pinnedColors.forEach(color => { const option = make('option','',`${color.name} ${hex(mapped(color))}`); option.value = color.id; select.append(option); });
    });
  }
  function renderComparison() {
    const s = palette.state, fg = Model.parseHex(s.comparisonFG), bg = Model.parseHex(s.comparisonBG), ratio = Model.contrastRatio(fg,bg);
    syncValue($('comparison-fg'),s.comparisonFG); syncValue($('comparison-bg'),s.comparisonBG);
    ['fg','bg'].forEach(side => $('btn-compare-'+side).setAttribute('aria-pressed',String(s.compareFollow === side)));
    $('comparison-preview').style.color = s.comparisonFG; $('comparison-preview').style.backgroundColor = s.comparisonBG;
    const nearThreshold = [3,4.5].some(threshold => Math.abs(ratio-threshold)<0.02);
    const shownRatio = nearThreshold ? (Math.floor(ratio * 10000) / 10000).toFixed(4) : ratio.toFixed(2);
    $('contrast-ratio').textContent = `コントラスト比 ${shownRatio} : 1`;
    [['contrast-normal',4.5,'通常の文字'],['contrast-large',3,'大きな文字']].forEach(([id,threshold,label]) => {
      $(id).textContent = `${label}：${ratio >= threshold ? 'AA基準を満たします' : 'AA基準に届きません'}（${threshold}:1以上）`;
      $(id).className = ratio >= threshold ? 'contrast-pass' : 'contrast-fail';
    });
  }
  function renderTheme() {
    const mode = palette.state.themeMode;
    document.documentElement.dataset.theme = mode === 'auto' ? systemTheme.matches ? 'dark' : 'light' : mode;
    $('theme-toggle').setAttribute('aria-label',`表示テーマ：${({auto:'自動',light:'ライト',dark:'ダーク'})[mode]}`);
    $('theme-icon').innerHTML = icon(({auto:'auto',light:'sun',dark:'moon'})[mode]);
    document.querySelectorAll('[data-theme-mode]').forEach(el => el.setAttribute('aria-checked',String(el.dataset.themeMode === mode)));
  }
  function render() { renderTheme(); renderInputs(); renderGrid(); renderSelection(); renderStock(); renderComparison(); renderHistory(); }
  async function copyText(text, message) {
    const status = $('css-modal').open ? $('css-copy-status') : $('toast');
    try {
      try {
        if (!navigator.clipboard?.writeText) throw new Error('Clipboard API unavailable');
        await navigator.clipboard.writeText(text);
      } catch (error) {
        const active = document.activeElement, field = make('textarea'); field.value = text; field.readOnly = true;
        field.style.cssText = 'position:fixed;left:-9999px;top:0';
        ($('css-modal').open ? $('css-modal') : document.body).append(field);
        let success;
        try { field.select(); success = document.execCommand('copy'); }
        finally { field.remove(); active?.focus({preventScroll:true}); }
        if (!success) throw error;
      }
      status.textContent = message; if (status === $('toast')) toast(message);
    } catch (_) {
      const message = 'コピーできませんでした。CSS出力の文字列を選択してコピーしてください。';
      status.textContent = message; if (status === $('toast')) toast(message);
    }
  }
  async function openCss(scope, opener = document.activeElement) {
    await queue;
    const s = palette.state, output = s.outputFormat === 'hsv' ? 'hex' : s.outputFormat;
    let css = ':root {\n';
    if (s.outputFormat === 'hsv') css += '  /* HSVはCSS色関数ではないため、HEXで出力します。 */\n';
    if (scope === 'stock') palette.pinnedColors.forEach(color => { css += `  --${color.cssName}: ${format(color,output)};\n`; });
    else {
      const hues = Array.from({length:s.count},(_,i)=>(s.h+i*360/s.count)%360), names = resolveColorNames(hues,s.count);
      const {steps,baseIndex} = Core.generateLightnessSteps(s.l);
      hues.forEach((h,col)=> {
        const name = Model.cssIdentifier(names[col].en);
        steps.forEach((l,row)=> { const value = format({l,c:s.c,h},output); css += `  --${name}-${9-row}: ${value};\n`; if (row === baseIndex) css += `  --${name}: ${value}; /* Base */\n`; }); css += '\n';
      });
    }
    css += '}'; $('css-output').value = css;
    $('css-modal-title').textContent = scope === 'stock' ? 'CSS出力（ストック）' : 'CSS出力（グリッド）';
    modalOpener = opener; $('css-copy-status').textContent = ''; if (!$('css-modal').open) $('css-modal').showModal(); $('css-output').focus();
  }
  function activateTab(id, focus = false) {
    const button = $(id), group = button.closest('[role="tablist"]');
    group.querySelectorAll('[role="tab"]').forEach(tab => {
      const selected = tab === button; tab.setAttribute('aria-selected',String(selected)); tab.tabIndex = selected ? 0 : -1;
      $(tab.getAttribute('aria-controls')).hidden = !selected;
    });
    if (focus) button.focus();
  }
  function bindTabs() {
    document.querySelectorAll('[role="tablist"]').forEach(group => {
      const tabs = Array.from(group.querySelectorAll('[role="tab"]'));
      tabs.forEach(tab => {
        tab.addEventListener('click',()=>activateTab(tab.id,true));
        tab.addEventListener('keydown',event=> {
          const index = tabs.indexOf(tab), offset = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
          if (offset || ['Home','End'].includes(event.key)) {
            event.preventDefault(); activateTab(tabs[event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length-1 : (index+offset+tabs.length)%tabs.length].id,true);
          }
        });
      });
    });
  }
  function invalid(el, condition) { if (condition) el.setAttribute('aria-invalid','true'); else el.removeAttribute('aria-invalid'); }
  function bind() {
    bindTabs();
    document.querySelectorAll('[data-color-source]').forEach(el => {
      el.addEventListener('focus',()=> { gestureId++; });
      el.addEventListener('input',()=> {
        const value = el.valueAsNumber, valid = Number.isFinite(value) && value >= Number(el.min) && value <= Number(el.max) && (el.dataset.colorSource !== 'rgb' || Number.isInteger(value));
        invalid(el,!valid); if (!valid) return;
        const source = el.dataset.colorSource, part = el.dataset.part;
        run(doc=>({type:'state',patch:Model.colorPatch(doc.state,source,{[part]:value})}),{group:`color-${gestureId}`});
      });
      el.addEventListener('blur',()=>queue.then(renderInputs));
    });
    $('input-hex').addEventListener('input',event=> {
      const rgb = Model.parseHex(event.target.value); invalid(event.target,!rgb);
      if (rgb) run(doc=>({type:'state',patch:Model.colorPatch(doc.state,'rgb',rgb)}),{group:`hex-${gestureId}`});
    });
    $('input-hex').addEventListener('focus',()=>gestureId++);
    $('input-hex').addEventListener('blur',()=>queue.then(renderInputs));
    $('input-count').addEventListener('input',event=> {
      const count = event.target.valueAsNumber, valid = Number.isInteger(count) && count>=3 && count<=36;
      invalid(event.target,!valid); if (valid) run({type:'state',patch:{count}},{group:'count'});
    });
    $('input-count').addEventListener('blur',()=>queue.then(renderInputs));
    ['dec','inc'].forEach(kind=>$('btn-'+kind).addEventListener('click',()=>run(doc=>({type:'state',patch:{count:Math.max(3,Math.min(36,doc.state.count+(kind==='inc'?1:-1)))}}))));
    $('format-select').addEventListener('change',event=>run({type:'state',patch:{outputFormat:event.target.value}},{record:false}));
    ['hsl','hsv'].forEach(mode=>$('btn-show-'+mode).addEventListener('click',()=>run({type:'state',patch:{hsvMode:mode}},{record:false})));
    ['fill','light','dark'].forEach(mode=>$('btn-mode-'+mode).addEventListener('click',()=>run({type:'state',patch:mode==='fill'?{viewMode:'fill'}:{viewMode:'text',bgTheme:mode}},{record:false})));
    $('btn-copy-base').addEventListener('click',async ()=> { await queue; copyText(format(palette.state),'色をコピーしました。'); });
    $('btn-stock-base').addEventListener('click',()=>addStock(null));
    $('btn-copy-selected').addEventListener('click',async ()=> { await queue; copyText(format(chosen()),'色をコピーしました。'); });
    $('btn-apply-selected').addEventListener('click',async ()=> { await queue; applyColor(clone(chosen())); });
    $('btn-stock-selected').addEventListener('click',()=>addStock(selectedColor ? clone(selectedColor) : null));
    $('btn-add-manual').addEventListener('click',()=> {
      const rgb = Model.parseHex($('manual-hex').value); invalid($('manual-hex'),!rgb);
      if (!rgb) { toast('HEXは3桁または6桁の16進数で入力してください。'); return; }
      addStock(Core.rgbToOklch(rgb.r,rgb.g,rgb.b),true);
    });
    $('manual-hex').addEventListener('keydown',event=> { if (event.key==='Enter') { event.preventDefault(); $('btn-add-manual').click(); } });
    $('main-grid').addEventListener('click',event=> { const cell=event.target.closest('.grid-cell'); if (cell) selectGrid(cell,true); });
    $('main-grid').addEventListener('keydown',event=> {
      const cell=event.target.closest('.grid-cell'); if (!cell) return;
      const index=Number(cell.dataset.index), count=palette.state.count;
      const moves={ArrowRight:1,ArrowLeft:-1,ArrowDown:count,ArrowUp:-count};
      if (event.key in moves || ['Home','End'].includes(event.key)) {
        event.preventDefault(); const target=event.key==='Home'?0:event.key==='End'?gridColors.length-1:Math.max(0,Math.min(gridColors.length-1,index+moves[event.key]));
        const next=$('main-grid').querySelector(`[data-index="${target}"]`); selectGrid(next,false); next.scrollIntoView({block:'nearest',inline:'nearest'}); next.focus({preventScroll:true});
      }
    });
    ['fg','bg'].forEach(side=> {
      const field = $('comparison-'+side), key = side === 'fg' ? 'comparisonFG' : 'comparisonBG';
      field.addEventListener('input',()=> { const rgb=Model.parseHex(field.value); invalid(field,!rgb); if (rgb) run({type:'state',patch:{[key]:hex(rgb),compareFollow:'none'}},{group:`compare-${side}-${gestureId}`}); });
      field.addEventListener('focus',()=>gestureId++); field.addEventListener('blur',()=>queue.then(renderComparison));
      $('btn-compare-'+side).addEventListener('click',()=>run(doc=>({type:'state',patch:{[key]:hex(doc.state),compareFollow:side}})));
      $('comparison-'+side+'-stock').addEventListener('change',event=> { const id=event.target.value; if (!id) return;
        run(doc=>{ const color=doc.pinnedColors.find(pin=>pin.id===id); if (!color) throw new Error('選んだストックがありません'); return {type:'state',patch:{[key]:hex(mapped(color)),compareFollow:'none'}}; });
      });
    });
    $('btn-swap-comparison').addEventListener('click',()=>run(doc=>({type:'state',patch:{comparisonFG:doc.state.comparisonBG,comparisonBG:doc.state.comparisonFG,compareFollow:doc.state.compareFollow==='fg'?'bg':doc.state.compareFollow==='bg'?'fg':'none'}})));
    $('btn-undo').addEventListener('click',()=>travel(history,future,'元に戻しました。'));
    $('btn-redo').addEventListener('click',()=>travel(future,history,'やり直しました。'));
    document.addEventListener('keydown',event=> {
      if (!(event.metaKey||event.ctrlKey) || event.altKey || event.key.toLowerCase()!=='z' || $('css-modal').open || event.target.closest('input,textarea,[contenteditable="true"]')) return;
      event.preventDefault(); event.shiftKey ? travel(future,history,'やり直しました。') : travel(history,future,'元に戻しました。');
    });
    $('btn-save-json').addEventListener('click',async ()=> {
      await queue; const blob=new Blob([JSON.stringify(palette,null,2)+'\n'],{type:'application/json'}), url=URL.createObjectURL(blob), link=make('a');
      link.href=url; link.download=`oklch-palette-${new Date().toISOString().slice(0,10)}.json`; document.body.append(link); link.click(); link.remove(); setTimeout(()=>URL.revokeObjectURL(url),1000);
    });
    $('btn-load-json').addEventListener('click',()=> $('json-file').click());
    $('json-file').addEventListener('change',async event=> {
      const file=event.target.files[0]; if (!file) return;
      try {
        if (file.size>2*1024*1024) throw new Error('JSONファイルは2MB以内にしてください。');
        const imported=Model.normalizeDocument(await file.text(),{strict:true}).document;
        const result=await run({type:'replace',document:imported}); if (result) toast('JSONを読み込みました。「元に戻す」で以前の内容に戻せます。');
      } catch (error) { toast(`読み込めませんでした。${error.message}`); }
      finally { event.target.value=''; }
    });
    function closeTheme(focus=false) { $('theme-menu').hidden=true; $('theme-toggle').setAttribute('aria-expanded','false'); if (focus) $('theme-toggle').focus(); }
    $('theme-toggle').addEventListener('click',()=> {
      const opening=$('theme-menu').hidden; $('theme-menu').hidden=!opening; $('theme-toggle').setAttribute('aria-expanded',String(opening));
      if (opening) $('theme-menu').querySelector('[aria-checked="true"]').focus();
    });
    const themeItems=Array.from(document.querySelectorAll('[data-theme-mode]'));
    themeItems.forEach(button=>button.addEventListener('click',()=> { run({type:'state',patch:{themeMode:button.dataset.themeMode}},{record:false}); closeTheme(true); }));
    $('theme-menu').addEventListener('keydown',event=> {
      if (event.key==='Escape') { event.preventDefault(); closeTheme(true); }
      const index=themeItems.indexOf(document.activeElement);
      if (['ArrowDown','ArrowUp','Home','End'].includes(event.key)) { event.preventDefault(); themeItems[event.key==='Home'?0:event.key==='End'?2:(index+(event.key==='ArrowDown'?1:2))%3].focus(); }
    });
    document.addEventListener('click',event=> { if (!event.target.closest('.theme-control')) closeTheme(); });
    systemTheme.addEventListener('change',()=>renderTheme());
    ['grid','stock'].forEach(scope=>$('btn-css-'+scope).addEventListener('click',event=>openCss(scope,event.currentTarget)));
    $('btn-close-css').addEventListener('click',()=> $('css-modal').close());
    $('btn-copy-css').addEventListener('click',()=>copyText($('css-output').value,'CSSをコピーしました。'));
    $('css-modal').addEventListener('close',()=>modalOpener?.focus({preventScroll:true}));
    $('css-modal').addEventListener('click',event=> {
      const rect=$('css-modal').getBoundingClientRect();
      if (event.target===$('css-modal')&&(event.clientX<rect.left||event.clientX>rect.right||event.clientY<rect.top||event.clientY>rect.bottom)) $('css-modal').close();
    });
  }
  // Naming of generated grid variables remains compatible with the previous tool.
        const hueAnchorsBasic = [
            { h: 20, ja: '赤', en: 'Red' }, { h: 45, ja: '橙', en: 'Orange' }, { h: 70, ja: '黄', en: 'Yellow' },
            { h: 130, ja: '緑', en: 'Green' }, { h: 195, ja: '水色', en: 'Cyan' }, { h: 250, ja: '青', en: 'Blue' },
            { h: 300, ja: '紫', en: 'Purple' }, { h: 340, ja: '桃', en: 'Pink' }
        ];
        const hueAnchorsDetailed = [
            { h: 5, ja: '赤', en: 'Red' }, { h: 30, ja: '橙', en: 'Orange' }, { h: 47.5, ja: '琥珀', en: 'Amber' },
            { h: 67.5, ja: '黄', en: 'Yellow' }, { h: 95, ja: 'ライム', en: 'Lime' }, { h: 125, ja: '緑', en: 'Green' },
            { h: 152.5, ja: 'ミント', en: 'Mint' }, { h: 177.5, ja: '青緑', en: 'Teal' }, { h: 200, ja: 'シアン', en: 'Cyan' },
            { h: 222.5, ja: '空色', en: 'Sky' }, { h: 250, ja: '青', en: 'Blue' }, { h: 275, ja: '藍', en: 'Indigo' },
            { h: 297.5, ja: '紫', en: 'Purple' }, { h: 320, ja: 'マゼンタ', en: 'Magenta' }, { h: 340, ja: '桃', en: 'Pink' }
        ];

        function getDistance(h1, h2) { const d = Math.abs(h1 - h2); return Math.min(d, 360 - d); }
        function lookupName(h, anchors) {
            let p=null, s=null, minD=360, minD2=360;
            for(let a of anchors){
                const d=getDistance(h, a.h);
                if(d<minD){ minD2=minD; s=p; minD=d; p=a; }
                else if(d<minD2){ minD2=d; s=a; }
            }
            return { p, s, minD };
        }

        function resolveColorNames(hues, count) {
            let initialLevel = 'basic';
            if (count > 15) initialLevel = 'hybrid';
            else if (count > 8) initialLevel = 'detailed';

            let names = hues.map(h => {
                let hh = h % 360; if(hh<0) hh+=360;
                let anchors = (initialLevel === 'basic') ? hueAnchorsBasic : hueAnchorsDetailed;
                let res = lookupName(hh, anchors);
                if (initialLevel === 'hybrid') {
                    if (res.minD < 8) return { ja: res.p.ja, en: res.p.en, hue: hh };
                    return { ja: `${res.p.ja}-${res.s.ja}`, en: `${res.p.en}-${res.s.en}`, hue: hh };
                }
                return { ja: res.p.ja, en: res.p.en, hue: hh };
            });

            const groups = {}; names.forEach((n, i) => { if(!groups[n.en]) groups[n.en]=[]; groups[n.en].push(i); });
            Object.keys(groups).forEach(k => { if(groups[k].length > 1) groups[k].forEach(i => {
                let res = lookupName(names[i].hue, hueAnchorsDetailed);
                names[i].en = res.p.en; names[i].ja = res.p.ja;
            })});
            const groups2 = {}; names.forEach((n, i) => { if(!groups2[n.en]) groups2[n.en]=[]; groups2[n.en].push(i); });
            Object.keys(groups2).forEach(k => { if(groups2[k].length > 1) groups2[k].forEach(i => {
                let res = lookupName(names[i].hue, hueAnchorsDetailed);
                names[i].en = `${res.p.en}-${res.s.en}`; names[i].ja = `${res.p.ja}-${res.s.ja}`;
            })});
            const groups3 = {}; names.forEach((n, i) => { if(!groups3[n.en]) groups3[n.en]=[]; groups3[n.en].push(i); });
            Object.keys(groups3).forEach(k => { if(groups3[k].length > 1) groups3[k].forEach(i => {
                names[i].en += `-${Math.round(names[i].hue)}`;
            })});
            return names;
        }


  async function start() {
    try {
      await initStorage(); bind(); render(); $('workspace').disabled = false;
      ['btn-save-json','btn-load-json','theme-toggle'].forEach(id => $(id).disabled = false);
    } catch (error) {
      $('storage-warning').hidden = false;
      $('storage-warning').textContent = '初期化できませんでした。再読み込みしてください。';
      console.error(error);
    }
  }
  start();
})();
