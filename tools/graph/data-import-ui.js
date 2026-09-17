/* global GraphDataImport, GraphDataFetch, GraphOpenDataCatalog, GraphTables */
(function () {
  'use strict';
  const D = window.GraphDataImport;
  const make = (tag, text, attrs = {}) => {
    const el = document.createElement(tag);
    if (text != null) el.textContent = text;
    for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, value);
    return el;
  };
  function input(parent, label, value = '', type = 'text', attrs = {}) {
    const wrap = make('label', label), control = make('input', null, {type, ...attrs});
    control.value = value; wrap.append(control); parent.append(wrap); return control;
  }
  function select(parent, label, options, value) {
    const wrap = make('label', label), control = make('select', null, {'aria-label': label});
    setOptions(control, options, value); wrap.append(control); parent.append(wrap); return control;
  }
  function setOptions(control, options, value) {
    control.replaceChildren(...options.map(([v, text]) => make('option', text, {value: String(v)})));
    if (value != null) control.value = String(value);
  }
  function button(parent, label, action, attrs = {}) {
    const el = make('button', label, {type: 'button', ...attrs});
    el.addEventListener('click', action); parent.append(el); return el;
  }
  function checkbox(parent, label, value = false) {
    const wrap = make('label', null, {class: 'check'}), el = make('input', null, {type: 'checkbox'});
    el.checked = value; wrap.append(el, document.createTextNode(label)); parent.append(wrap); return el;
  }
  function link(parent, text, url) {
    const el = make('a', text, {href: url, target: '_blank', rel: 'noopener noreferrer'});
    parent.append(el); return el;
  }
  function mount(parent, options = {}) {
    const kind = options.kind || 'data2d', is3 = kind === 'data3d';
    let disposed = false, ticket = 0, controller, bytes, text = '', inspection, result;
    let source = {kind: 'user', title: '', url: '', notes: ''}, acquired = '', loadedName = '', loadedCatalog;
    let encodingName = '', mode = 'catalog', originURL = '', parsed;
    const root = make('div', null, {class: 'data-import'}); parent.append(root);
    const sourceChooser = make('details', null, {class: 'data-import-source'}), chooserLabel = make('summary', '読み込み元を選ぶ');
    sourceChooser.open = true; sourceChooser.append(chooserLabel); root.append(sourceChooser);
    const tabs = make('div', null, {class: 'data-import-tabs', role: 'group', 'aria-label': '取り込み方法'});
    sourceChooser.append(tabs);
    const panels = {}, tabButtons = {};
    for (const [id, label] of [['catalog', '用意済み'], ['url', 'URL'], ['file', 'ファイル']]) {
      tabButtons[id] = button(tabs, label, () => switchMode(id), {'aria-pressed': id === mode ? 'true' : 'false', 'aria-controls': 'data-import-' + id});
      panels[id] = make('section', null, {id: 'data-import-' + id, 'aria-label': label});
      panels[id].hidden = id !== mode; sourceChooser.append(panels[id]);
    }
    const catalogSearch = input(panels.catalog, 'データを検索', '', 'search', {placeholder: '札幌、気象、惑星…'});
    const catalogCards = make('div', null, {class: 'data-import-catalog'}); panels.catalog.append(catalogCards);
    panels.catalog.append(make('p', '出典と利用条件を確認した、授業で使えるデータです。読み込み時のネット接続は不要です。', {class: 'small muted'}));
    const catalog = GraphOpenDataCatalog.list();
    function renderCatalog() {
      const query = catalogSearch.value.trim().toLowerCase();
      catalogCards.replaceChildren();
      for (const item of catalog) {
        if (query && !(item.title + item.description + (item.category || '')).toLowerCase().includes(query)) continue;
        const card = button(catalogCards, null, () => loadCatalog(item), {class: 'data-import-card', 'data-catalog-id': item.id});
        card.append(make('strong', item.title), make('small', item.description));
      }
      if (!catalogCards.children.length) catalogCards.append(make('p', '一致するデータがありません。', {class: 'small muted'}));
    }
    catalogSearch.addEventListener('input', renderCatalog); renderCatalog();
    const urlRow = make('div', null, {class: 'data-import-url'}); panels.url.append(urlRow);
    const urlInput = input(urlRow, '公開CSVのURL', '', 'url', {placeholder: 'https://…/data.csv', maxlength: 2000, autocomplete: 'off', spellcheck: 'false'});
    const fetchButton = button(urlRow, '読み込む', fetchURL, {class: 'primary'});
    urlInput.addEventListener('keydown', event => { if (event.key === 'Enter') { event.preventDefault(); fetchURL(); } });
    panels.url.append(make('p', 'ログイン不要のCSV・TSVを指定します。公開元が直接読み込みに対応していない場合は、ファイルを選んで取り込めます。', {class: 'small muted'}));
    const providers = make('details', null, {class: 'data-import-providers'});
    providers.append(make('summary', '気象庁・e-Statからダウンロードする'));
    const jma = make('p'); link(jma, '気象庁：過去の気象データ・ダウンロード', 'https://www.data.jma.go.jp/risk/obsdl/');
    jma.append(document.createTextNode('で地点・項目・期間を選び、CSVを保存します。年月日や品質情報がある場合は、読み込み後に列を確認してください。'));
    const estat = make('p'); link(estat, 'e-Stat：政府統計の総合窓口', 'https://www.e-stat.go.jp/');
    estat.append(document.createTextNode('で統計表を選び、CSV形式で保存します。Excel形式しかない場合は、表計算アプリで必要な表をCSVに書き出します。'));
    providers.append(jma, estat, make('p', '保存後、この画面の「ファイル」から選びます。選んだファイルをサーバーへアップロードすることはありません。', {class: 'small muted'}));
    panels.url.append(providers);
    const fileInput = make('input', null, {type: 'file', accept: '.csv,.tsv,.txt,text/csv,text/tab-separated-values', 'data-import-file': ''});
    fileInput.hidden = true; root.append(fileInput);
    button(panels.file, 'CSV・TSVファイルを選ぶ', () => fileInput.click(), {class: 'primary full-button'});
    panels.file.append(make('p', 'CSV・TSV／1MB以内。UTF-8・Shift_JISを自動判別します。表計算や公開元から保存したファイルを使えます。', {class: 'small muted'}));
    fileInput.addEventListener('change', () => { const file = fileInput.files[0]; fileInput.value = ''; if (file) loadFile(file); });

    const notice = make('p', '', {class: 'small muted', role: 'status'});
    const error = make('p', '', {class: 'error', role: 'alert'}); error.hidden = true;
    const fallback = make('div', null, {class: 'source-info data-import-fallback'}); fallback.hidden = true;
    root.append(notice, error, fallback);
    const preview = make('section', null, {class: 'data-import-preview', 'aria-label': '取り込みのプレビュー'}); preview.hidden = true; root.append(preview);
    const name = input(preview, 'データ名', '', 'text', {maxlength: 160});
    const axes = make('div', null, {class: is3 ? 'field-grid three' : 'field-grid'}); preview.append(axes);
    const x = select(axes, '横軸の列', []), y = select(axes, '縦軸の列', []);
    const z = is3 ? select(axes, '高さの列', []) : null;
    const dateMode = select(preview, '日付の扱い', [['retain', '日付として保持'], ['days', '最初の日付からの経過日数'], ['year', '年'], ['month', '月']], 'retain');
    dateMode.parentElement.hidden = true;
    const plotOptions = make('div', null, {class: 'field-grid'}); preview.append(plotOptions);
    const lines = checkbox(plotOptions, '入力順に点を結ぶ', false);
    const fit = checkbox(plotOptions, 'このデータに表示範囲を合わせる', true);
    const labels = checkbox(preview, '選んだ列名を軸名に使う', !!options.empty);
    const summary = make('p', '', {class: 'small', 'data-import-summary': ''}); preview.append(summary);
    const rawSave = button(preview, '元のCSVを保存', () => {
      const blob = new Blob([bytes || new TextEncoder().encode(text)], {type: 'text/csv'});
      const url = URL.createObjectURL(blob), anchor = make('a', '', {href: url, download: loadedName.replace(/[\x00-\x1f\\/:*?"<>|]/g, '_').replace(/\.(?:csv|tsv|txt)$/i, '') + '.csv'});
      root.append(anchor); anchor.click(); anchor.remove(); setTimeout(() => URL.revokeObjectURL(url), 1000);
    });
    const tableWrap = make('div', null, {class: 'data-import-table', tabindex: '0', role: 'region', 'aria-label': '元データの先頭8行'}); preview.append(tableWrap);

    const details = make('details', null, {class: 'data-import-settings'}); details.append(make('summary', '列・読み取りの詳細')); preview.append(details);
    const parseFields = make('div', null, {class: 'field-grid'}); details.append(parseFields);
    const encoding = select(parseFields, '文字コード', [['auto', '自動'], ['utf-8', 'UTF-8'], ['shift_jis', 'Shift_JIS'], ['utf-16le', 'UTF-16 LE'], ['utf-16be', 'UTF-16 BE']], 'auto');
    const delimiter = select(parseFields, '区切り文字', [['auto', '自動'], [',', 'カンマ'], ['\t', 'タブ'], [';', 'セミコロン']], 'auto');
    const header = input(parseFields, '見出し行（0ならなし）', '', 'number', {min: 0, max: 10050, step: 1});
    const start = input(parseFields, 'データ開始行', '', 'number', {min: 1, max: 10050, step: 1});
    details.append(make('p', '行番号はCSVのレコード単位です。複数行の表題や単位行があるときは、開始行を調整します。', {class: 'small muted'}));
    const filterFields = make('div', null, {class: 'field-grid'}); details.append(filterFields);
    const filterColumn = select(filterFields, '地域などで絞り込む列', [['', '絞り込まない']], '');
    const filterValue = select(filterFields, '残す値（完全一致）', []); filterValue.disabled = true;
    const extra = make('fieldset', null, {class: 'data-import-columns'}); extra.append(make('legend', '表へ取り込む列（軸を含め20列まで）')); details.append(extra);
    const extraFields = make('div', null, {class: 'data-import-column-choices'}); extra.append(extraFields);
    const errors = make('div', null, {class: 'field-grid'}); details.append(errors);
    const errorX = select(errors, '横誤差の列', [['', 'なし']], ''), errorY = select(errors, '縦誤差の列', [['', 'なし']], ''); errors.hidden = is3;
    const invalid = checkbox(details, '数値にできない値を欠測として取り込む', false);
    details.append(make('p', '空欄・NA・---などの欠測は0にしません。日付とカテゴリは元の値を保存します。注記付きの数値を欠測にする場合は上のチェックを使います。', {class: 'small muted'}));
    const sourceDetails = make('details'); sourceDetails.append(make('summary', '出典・利用条件')); preview.append(sourceDetails);
    const sourceTitle = input(sourceDetails, '資料名', '', 'text', {maxlength: 300});
    const sourceURL = input(sourceDetails, '出典URL（https）', '', 'url', {maxlength: 2000});
    const licenseURL = input(sourceDetails, '利用条件URL（任意）', '', 'url', {maxlength: 2000});
    const sourceNote = input(sourceDetails, '期間・地域・補足（任意）', '', 'text', {maxlength: 700});
    sourceDetails.append(make('p', '再配布できる範囲は公開元の利用条件に従います。資料名・出典URL・加工内容は作品に保存されます。', {class: 'small muted'}));
    const citation = make('div', null, {class: 'small muted data-import-citation'}); preview.append(citation);

    function ready(value) { options.onReady?.(value); }
    function fail(reason) { error.textContent = reason?.message || String(reason); error.hidden = false; result = null; ready(false); }
    function clearError() { error.hidden = true; error.textContent = ''; }
    function cancelRequest() { ticket++; controller?.abort(); controller = null; fetchButton.disabled = false; }
    function switchMode(next, preserve = false) {
      if (mode !== next && !preserve) { cancelRequest(); clearPreview(); }
      mode = next;
      for (const id of Object.keys(panels)) { panels[id].hidden = id !== next; tabButtons[id].setAttribute('aria-pressed', String(id === next)); }
    }
    function clearPreview() {
      ready(false); result = null; inspection = null; preview.hidden = true; notice.textContent = ''; clearError(); fallback.hidden = true;
      sourceChooser.open = true; chooserLabel.textContent = '読み込み元を選ぶ';
    }
    function begin() { cancelRequest(); clearPreview(); return ticket; }
    function resetSettings() {
      encoding.value = delimiter.value = 'auto'; header.value = start.value = ''; invalid.checked = false;
      filterColumn.value = ''; errorX.value = errorY.value = ''; details.open = false;
    }
    function showFallback(url) {
      fallback.replaceChildren(make('strong', 'ダウンロードして取り込む'));
      const steps = make('ol'), first = make('li');
      if (url) { link(first, '公開元を開く', url); first.append(document.createTextNode('からCSV・TSVを保存します。')); }
      else first.textContent = '公開元のダウンロード機能でCSV・TSVを保存します。';
      const second = make('li', '下のボタンで保存したファイルを選びます。'); steps.append(first, second); fallback.append(steps);
      button(fallback, 'ダウンロードしたファイルを選ぶ', () => fileInput.click(), {class: 'full-button'}); fallback.hidden = false;
    }
    async function fetchURL() {
      const id = begin(); let url;
      try { url = GraphDataFetch.validateURL(urlInput.value); } catch (e) { fail(e); return; }
      originURL = url; source = {kind: 'reference', title: '', url, notes: ''};
      controller = new AbortController(); fetchButton.disabled = true; notice.textContent = '公開元から読み込んでいます…';
      try {
        const response = await GraphDataFetch.fetchCSV(url, {signal: controller.signal});
        if (disposed || id !== ticket) return;
        bytes = response.bytes; loadedCatalog = null; loadedName = fileName(response.url); acquired = new Date().toISOString();
        source.url = response.url; resetSettings();
        try { parseData(true); } catch (e) { fail(e); showFallback(url); }
      } catch (e) {
        if (disposed || id !== ticket) return;
        notice.textContent = ''; fail(e); if (e.code !== 'ABORT') showFallback(url);
      } finally { if (!disposed && id === ticket) fetchButton.disabled = false; }
    }
    function fileName(url) { try { return decodeURIComponent(new URL(url).pathname.split('/').pop()) || '公開データ'; } catch (_) { return '公開データ'; } }
    async function loadFile(file) {
      const keepSource = !fallback.hidden && originURL;
      const id = begin(); switchMode('file', true); notice.textContent = file.name + ' を読み込んでいます…';
      try {
        if (file.size > 1024 * 1024) throw new Error('CSVは1MB以内にしてください。公開元で期間や項目を絞って保存してください。');
        const nextBytes = new Uint8Array(await file.arrayBuffer());
        if (disposed || id !== ticket) return;
        bytes = nextBytes; loadedCatalog = null; loadedName = file.name; acquired = new Date().toISOString();
        source = {kind: keepSource ? 'reference' : 'user', title: '', url: keepSource ? originURL : '', notes: ''};
        resetSettings(); parseData(true);
      } catch (e) { if (!disposed && id === ticket) { notice.textContent = ''; fail(e); } }
    }
    function loadCatalog(item) {
      begin(); loadedCatalog = item; loadedName = item.title; source = {...item.source}; acquired = new Date().toISOString();
      originURL = source.url; bytes = null; text = item.csv; resetSettings();
      try { parseData(true); } catch (e) { fail(e); }
    }
    function parseData(initial = false) {
      clearError(); ready(false); result = null; inspection = null;
      if (bytes) { const decoded = D.decode(bytes, encoding.value); text = decoded.text; encodingName = decoded.encoding; }
      else encodingName = 'UTF-8';
      parsed = D.parse(text, {delimiter: delimiter.value});
      const settings = initial ? {} : {headerRow: Number(header.value), startRow: Number(start.value)};
      inspection = D.inspect(parsed, settings);
      header.value = inspection.headerRow; start.value = inspection.startRow;
      if (initial) {
        name.value = loadedName.replace(/\.(?:csv|tsv|txt)$/i, '').slice(0, 160);
        sourceTitle.value = source.title || name.value; sourceURL.value = source.url;
        licenseURL.value = loadedCatalog?.license.url || ''; sourceNote.value = '';
        lines.checked = !!loadedCatalog?.lines; dateMode.value = 'retain';
      }
      const axisOptions = inspection.columns.map(c => [c.index, c.name + (c.type === 'date' ? '（日付）' : c.type === 'text' ? '（カテゴリ）' : c.quality ? '（品質情報）' : '')]);
      const suggested = inspection.suggested;
      setOptions(x, axisOptions, initial && loadedCatalog ? loadedCatalog.x : suggested.x);
      setOptions(y, axisOptions, initial && loadedCatalog ? loadedCatalog.y : suggested.y);
      if (z) setOptions(z, axisOptions, suggested.z);
      const filterOptions = inspection.columns.filter(c => c.type !== 'empty').map(c => [c.index, c.name]);
      setOptions(filterColumn, [['', '絞り込まない'], ...filterOptions], ''); updateFilterValues();
      extraFields.replaceChildren();
      const defaults = new Set([x.value, y.value, z?.value].filter(value => value !== undefined && value !== '').map(Number));
      for (const c of inspection.columns) if (defaults.size < 20 && c.type !== 'empty' && !c.quality) defaults.add(c.index);
      for (const c of inspection.columns) {
        if (c.type === 'empty') continue;
        const box = checkbox(extraFields, c.name + (c.quality ? '（品質情報）' : ''), defaults.has(c.index));
        box.dataset.importColumn = c.index; box.addEventListener('change', refresh);
      }
      const errorOptions = [['', 'なし'], ...inspection.columns.filter(c => c.type === 'number').map(c => [c.index, c.name])];
      setOptions(errorX, errorOptions, ''); setOptions(errorY, errorOptions, '');
      preview.hidden = false; notice.textContent = '読み込み済み · ' + encodingName;
      rawSave.hidden = mode === 'file';
      refresh();
      if (initial) { sourceChooser.open = false; chooserLabel.textContent = 'データを選び直す'; x.focus({preventScroll: true}); }
    }
    function updateFilterValues() {
      filterValue.disabled = filterColumn.value === '';
      const values = filterValue.disabled || !inspection ? [] : [...new Set(inspection.rows.map(row => row[Number(filterColumn.value)] || ''))];
      setOptions(filterValue, values.map(value => [value, value || '（空欄）']), values[0]);
    }
    function projection() {
      const columns = [...extraFields.querySelectorAll('input:checked')].map(el => Number(el.dataset.importColumn));
      for (const control of [x, y, z, !is3 && errorX, !is3 && errorY].filter(Boolean)) if (control.value !== '') columns.push(Number(control.value));
      const selectedColumns = [...new Set(columns)].sort((a, b) => a - b);
      const projected = D.project(inspection, {
        kind, x: Number(x.value), y: Number(y.value), ...(z ? {z: Number(z.value)} : {}), columns: selectedColumns,
        dateMode: dateMode.value, invalidAsMissing: invalid.checked,
        ...(filterColumn.value !== '' ? {filter: {column: Number(filterColumn.value), value: filterValue.value}} : {})
      });
      if (!is3) {
        projected.table.mapping.errorX = errorX.value === '' ? null : selectedColumns.indexOf(Number(errorX.value));
        projected.table.mapping.errorY = errorY.value === '' ? null : selectedColumns.indexOf(Number(errorY.value));
        projected.table = GraphTables.validate(projected.table, kind);
      }
      if (!projected.table.rows.some(row => [projected.table.mapping.x, projected.table.mapping.y, ...(is3 ? [projected.table.mapping.z] : [])].every(c => row[c] !== null))) throw new Error('選んだ軸で描画できる行がありません。列や欠測の扱いを確認してください。');
      return projected;
    }
    function refresh() {
      if (!inspection || disposed) return;
      clearError(); result = null;
      dateMode.parentElement.hidden = inspection.columns[Number(x.value)]?.type !== 'date';
      for (const el of extraFields.querySelectorAll('input')) {
        const used = [x.value, y.value, z?.value, errorX.value, errorY.value].includes(el.dataset.importColumn);
        el.disabled = used; if (used) el.checked = true;
      }
      renderTable();
      try {
        result = projection();
        const {rows, missing, invalid: invalidCount, filteredRows} = result.summary;
        summary.textContent = rows + '行 · ' + result.table.columns.length + '列を取り込み' + (missing ? ' · 欠測 ' + missing + '個' : '') + (invalidCount ? ' · 数値にできない値 ' + invalidCount + '個' : '') + (filteredRows ? ' · 絞り込みで対象外 ' + filteredRows + '行' : '');
        const omitted = result.summary.omittedColumns;
        if (omitted.length) summary.textContent += '。取り込まない列：' + omitted.join('、');
        if (inspection.columns.some(c => c.quality)) summary.textContent += '。品質情報による自動除外は行いません。必要な値は「列・読み取りの詳細」で絞り込めます。';
        ready(true);
      } catch (e) { summary.textContent = '元データ ' + inspection.rows.length + '行。列・読み取りの詳細で調整できます。'; fail(e); }
      citation.replaceChildren();
      if (loadedCatalog) {
        const p = make('p', loadedCatalog.source.title + ' · ' + loadedCatalog.coverage + ' · 確認日 ' + loadedCatalog.checkedAt); citation.append(p);
        link(citation, '出典', loadedCatalog.source.url); citation.append(document.createTextNode(' ／ ')); link(citation, loadedCatalog.license.title, loadedCatalog.license.url);
        citation.append(make('p', '公開値を選択・転記した固定データです。最新値への自動更新は行いません。'));
      }
    }
    function renderTable() {
      const table = make('table'), caption = make('caption', '元データの先頭8行（取り込み前の値）'); table.append(caption);
      const head = make('tr'); head.append(make('th', '行', {scope: 'col'}));
      for (const c of inspection.columns) {
        const th = make('th', c.name, {scope: 'col'});
        if ([x.value, y.value, z?.value].includes(String(c.index))) th.className = 'data-import-axis';
        head.append(th);
      }
      const thead = make('thead'); thead.append(head); table.append(thead);
      const tbody = make('tbody');
      inspection.rows.slice(0, 8).forEach((row, index) => {
        const tr = make('tr'); tr.append(make('th', String(inspection.startRow + index), {scope: 'row'}));
        for (let i = 0; i < inspection.columns.length; i++) tr.append(make('td', row[i] || '—'));
        tbody.append(tr);
      });
      table.append(tbody); tableWrap.replaceChildren(table);
    }
    for (const control of [x, y, z, dateMode, invalid, errorX, errorY, filterValue].filter(Boolean)) control.addEventListener('change', refresh);
    for (const control of [encoding, delimiter, header, start]) control.addEventListener('change', () => { try { parseData(); } catch (e) { fail(e); } });
    filterColumn.addEventListener('change', () => { updateFilterValues(); refresh(); });
    function read() {
      if (!result || disposed) throw new Error('先にデータを読み込み、列を確認してください。');
      const projected = projection(), urls = [sourceURL.value.trim(), licenseURL.value.trim()];
      for (const url of urls.filter(Boolean)) GraphDataFetch.validateURL(url);
      const notes = [source.notes, '取り込み日時：' + acquired, '元データ：' + loadedName,
        '読み取り：' + encodingName + '／' + (parsed.delimiter === '\t' ? 'タブ' : parsed.delimiter === ';' ? 'セミコロン' : 'カンマ') + '／見出し ' + inspection.headerRow + '行目・データ開始 ' + inspection.startRow + '行目',
        ...projected.notes, ...(urls[1] && urls[1] !== loadedCatalog?.license.url ? ['利用条件：' + urls[1]] : []), sourceNote.value.trim()].filter(Boolean).join('\n');
      if (notes.length > 3000) throw new Error('出典・読み取りの記録が長すぎます。補足または取り込む列数を減らしてください。');
      const axisNames = {};
      for (const key of is3 ? ['x', 'y', 'z'] : ['x', 'y']) {
        const column = projected.table.columns[projected.table.mapping[key]], match = column.match(/^(.*?)\s*[（(]([^()（）]+)[）)]$/);
        axisNames[key] = match ? {label: match[1].trim().slice(0, 80), unit: match[2].slice(0, 80)} : {label: column.slice(0, 80), unit: ''};
      }
      return {table: projected.table, name: name.value.trim() || '取り込んだデータ', source: {kind: urls[0] ? 'reference' : source.kind, title: sourceTitle.value.trim(), url: urls[0], notes}, lines: lines.checked, fit: fit.checked, axes: labels.checked ? axisNames : null};
    }
    ready(false);
    if (options.file) loadFile(options.file);
    return {read, loadFile, destroy() { disposed = true; cancelRequest(); }};
  }
  window.GraphDataImportUI = {mount};
})();
