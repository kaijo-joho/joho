/* 数値を自分で組み立てるための UI。計算・採点・保存は呼び出し側の責務。 */
(function () {
  'use strict';

  var MAX_ROWS = 16;
  var uid = 0;
  function makeId() { uid += 1; return 'formula-row-' + uid; }
  function copy(value) { return JSON.parse(JSON.stringify(value)); }
  function el(name, options) {
    var node = document.createElement(name);
    options = options || {};
    if (options.className) node.className = options.className;
    if (options.text != null) node.textContent = options.text;
    if (options.type) node.type = options.type;
    if (options.value != null) node.value = options.value;
    if (options.label) node.setAttribute('aria-label', options.label);
    if (options.dataset) Object.keys(options.dataset).forEach(function (key) { node.dataset[key] = options.dataset[key]; });
    return node;
  }
  function button(text, options) {
    var node = el('button', options);
    node.type = 'button';
    node.textContent = text;
    return node;
  }
  function isToken(value) { return value && typeof value === 'object' && typeof value.kind === 'string'; }
  function normalToken(token) {
    if (!isToken(token)) return null;
    if (token.kind === 'fraction') return { kind: 'fraction', numerator: normalTokens(token.numerator), denominator: normalTokens(token.denominator) };
    if (token.kind === 'power') return { kind: 'power', base: normalTokens(token.base), exponent: normalTokens(token.exponent) };
    if (token.kind === 'group') return { kind: 'group', body: normalTokens(token.body) };
    if (token.kind === 'reference') return { kind: 'reference', rowId: String(token.rowId || '') };
    if (token.kind === 'operator') return { kind: 'operator', value: String(token.value || '') };
    if (token.kind === 'value') return { kind: 'value', value: String(token.value || ''), unit: String(token.unit || ''), label: token.label == null ? undefined : String(token.label) };
    return null;
  }
  function normalTokens(tokens) { return Array.isArray(tokens) ? tokens.map(normalToken).filter(Boolean) : []; }

  function mount(host, definition, options) {
    if (!host || !host.appendChild) throw new TypeError('LessonFormulaBuilder.mount: host が必要です。');
    options = options || {};
    var config = definition || {};
    var quantities = Array.isArray(config.quantities) ? config.quantities : [];
    var constants = Array.isArray(config.constants) ? config.constants : [];
    var tasks = Array.isArray(config.tasks) ? config.tasks : [];
    var units = config.units && typeof config.units === 'object' ? config.units : {};
    var disabled = false;
    var active = null;
    var caretVisible = false;
    var currentRowId = null;
    var selected = null;
    var dragPayload = null;
    var feedback = null;
    var feedbackAnnouncement = '';
    var moving = null;
    var manualOpen = false;
    var pendingReference = null;
    var openPopup = null;
    var popupTimers = [];
    var popupSource = 'formula-popup-' + makeId();
    var manualValue = '';
    var manualUnit = '';
    var scaffoldActive = null;
    var state = { rows: initialRows(), answers: {}, targets: {} };

    host.classList.add('lesson-formula-builder');
    host.dataset.formulaBuilder = 'true';
    host.setAttribute('data-lesson-slide-navigation-lock', '');
    host.addEventListener('keydown', lockSlideKeys);
    document.addEventListener('pointerdown', clearInactiveSelection);
    document.addEventListener('focusin', clearInactiveSelection);
    window.addEventListener('blur', clearInactiveSelection);
    document.addEventListener('dragend', endDrag);
    document.addEventListener('pointerdown', dismissPopup);
    document.addEventListener('keydown', popupEscape, true);
    document.addEventListener('joho:overlay-open', dismissOtherOverlay);
    document.addEventListener('joho:lesson-slide-change', closePopup);
    document.addEventListener('fullscreenchange', closePopup);
    window.addEventListener('resize', positionPopup);
    document.addEventListener('scroll', positionPopup, true);

    function closePopup(restore) {
      popupTimers.forEach(clearTimeout); popupTimers = [];
      if (!openPopup) return;
      var previous = openPopup; openPopup = null;
      if (typeof previous.panel.hidePopover === 'function' && previous.panel.matches(':popover-open')) previous.panel.hidePopover();
      previous.panel.hidden = true;
      previous.trigger.setAttribute('aria-expanded', 'false');
      if (restore === true) previous.trigger.focus({ preventScroll: true });
    }
    function dismissPopup(event) {
      if (openPopup && !openPopup.wrapper.contains(event.target)) closePopup();
    }
    function popupEscape(event) {
      // ホバーだけで開いたときはフォーカスがビルダー外にあっても閉じる。
      if (openPopup && event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); closePopup(true); }
    }
    function dismissOtherOverlay(event) {
      if (!event.detail || event.detail.source !== popupSource) closePopup();
    }
    function positionPopup() {
      if (!openPopup) return;
      var panel = openPopup.panel;
      var anchor = openPopup.trigger.getBoundingClientRect();
      var width = panel.getBoundingClientRect().width;
      var height = panel.getBoundingClientRect().height;
      var gap = 6;
      var top = anchor.bottom + gap;
      if (top + height > window.innerHeight - 8) top = Math.max(8, anchor.top - height - gap);
      panel.style.left = Math.max(8, Math.min(anchor.left, window.innerWidth - width - 8)) + 'px';
      panel.style.top = top + 'px';
    }
    // Top layerを使ってスライドのスクロール枠に切られないポップアップにする。
    // 未対応ブラウザではfixed配置へフォールバック。ホバーは補助操作で、
    // 同じ入口をタップ・Enter・Escapeでも操作できる。
    function popup(name, label, contents) {
      var wrapper = el('span', { className: 'formula-popup formula-' + name });
      var trigger = button(label, { className: 'formula-popup-trigger', dataset: { formulaPopupTrigger: name } });
      var panel = el('div', { className: 'formula-popup-panel', label: label, dataset: { formulaPopup: name } });
      panel.id = popupSource + '-' + name;
      panel.hidden = true; panel.tabIndex = -1; panel.setAttribute('role', 'dialog');
      if (typeof panel.showPopover === 'function') panel.setAttribute('popover', 'manual');
      trigger.setAttribute('aria-haspopup', 'dialog');
      trigger.setAttribute('aria-controls', panel.id); trigger.setAttribute('aria-expanded', 'false');
      trigger.disabled = disabled && name !== 'help';
      panel.append(contents); wrapper.append(trigger, panel);
      var record = { wrapper: wrapper, trigger: trigger, panel: panel, pinned: false };
      function show(pinned) {
        popupTimers.forEach(clearTimeout); popupTimers = [];
        if (openPopup === record) { if (pinned) record.pinned = true; return; }
        closePopup();
        document.dispatchEvent(new CustomEvent('joho:overlay-open', { detail: { source: popupSource } }));
        openPopup = record; record.pinned = !!pinned;
        panel.hidden = false; trigger.setAttribute('aria-expanded', 'true');
        if (panel.hasAttribute('popover')) panel.showPopover();
        positionPopup();
      }
      function scheduleClose() {
        popupTimers.push(setTimeout(function () {
          if (openPopup !== record || dragPayload || record.pinned || wrapper.contains(document.activeElement) || trigger.matches(':hover') || panel.matches(':hover')) return;
          closePopup();
        }, 180));
      }
      trigger.addEventListener('pointerenter', function (event) { if (event.pointerType === 'mouse' && !trigger.disabled) show(false); });
      trigger.addEventListener('pointerleave', scheduleClose);
      panel.addEventListener('pointerenter', function () { popupTimers.forEach(clearTimeout); popupTimers = []; });
      panel.addEventListener('pointerleave', scheduleClose);
      wrapper.addEventListener('focusout', scheduleClose);
      trigger.addEventListener('click', function () { if (openPopup === record && record.pinned) closePopup(); else show(true); });
      trigger.addEventListener('keydown', function (event) {
        if (event.key !== 'ArrowDown') return;
        event.preventDefault(); event.stopPropagation(); show(true);
        (panel.querySelector('button:not(:disabled), input:not(:disabled), select:not(:disabled)') || panel).focus();
      });
      return wrapper;
    }

    function initialRows() {
      var count = Math.max(1, Math.min(MAX_ROWS, tasks.length || 1));
      return Array.from({ length: count }, function (_, index) { return { id: makeId(), taskId: tasks[index] ? taskIdFor(tasks[index], index) : '', tokens: initialTokens(tasks[index]), result: '', resultUnit: '', answerOpen: isScaffold(tasks[index]) }; });
    }
    function isScaffold(task) { return !!(task && task.scaffold && task.scaffold.type === 'power-bounds'); }
    function initialTokens(task, previous) {
      if (!isScaffold(task)) return [];
      previous = previous || [];
      function field(value, unit) { return { kind: 'value', value: String(value == null ? '' : value), unit: unit || '' }; }
      function power(exponent) { return { kind: 'power', base: [field(task.scaffold.base || 2)], exponent: [field(exponent)] }; }
      // 固定部分だけを生成する。空欄・結論は生徒入力を保持し、正解から補完しない。
      return [power(previous[0]?.exponent?.[0]?.value), { kind: 'operator', value: '<' },
        field(previous[2]?.value, task.boundUnit || 'levels'), { kind: 'operator', value: '<=' },
        power(previous[4]?.exponent?.[0]?.value)];
    }
    function taskIdFor(task, index) { return String(task.id == null ? index : task.id); }
    function taskForRow(row) { return tasks.find(function (task, index) { return state.targets[taskIdFor(task, index)] === row.id; }); }
    function rowsForTask(taskId) { return state.rows.filter(function (row) { return row.taskId === taskId; }); }
    function ensureTaskRows() {
      tasks.forEach(function (task, index) {
        var taskId = taskIdFor(task, index);
        var rows = rowsForTask(taskId);
        if (!rows.length) {
          var row = { id: makeId(), taskId: taskId, tokens: initialTokens(task), result: '', resultUnit: '', answerOpen: isScaffold(task) };
          state.rows.push(row); rows = [row];
        }
        if (!rows.some(function (row) { return row.id === state.targets[taskId]; })) state.targets[taskId] = rows[rows.length - 1].id;
      });
    }
    function rowById(id) { return state.rows.find(function (row) { return row.id === id; }); }
    function makeSlot(rowId, path, index) { return { rowId: rowId, path: path.slice(), index: index }; }
    function encode(value) { return JSON.stringify(value); }
    function decode(value) { try { return JSON.parse(value); } catch (_) { return null; } }
    function arrayFor(row, path) {
      if (!row || !Array.isArray(path)) return null;
      var here = row.tokens;
      for (var i = 0; i < path.length; i += 1) {
        if (!here || typeof here !== 'object') return null;
        here = here[path[i]];
      }
      return Array.isArray(here) ? here : null;
    }
    function samePath(a, b) { return JSON.stringify(a) === JSON.stringify(b); }
    function clearInactiveSelection(event) {
      var target = event.target;
      var inside = target instanceof Element && host.contains(target);
      var rowElement = inside && target.closest('[data-formula-row]');
      if (rowElement) {
        var rowId = rowElement.dataset.formulaRow;
        // 別行や答え欄を選んだ後に、以前の行・入れ子の挿入位置を使わない。
        var expressionTarget = target.closest('[data-formula-slot], [data-formula-token]');
        if (!expressionTarget && (currentRowId !== rowId || target.closest('[data-formula-result-source]'))) {
          active = makeSlot(rowId, [], rowById(rowId).tokens.length);
          selected = null; moving = null;
          host.querySelectorAll('.is-selected, .is-move-target').forEach(function (node) { node.classList.remove('is-selected', 'is-move-target'); });
          host.querySelectorAll('.formula-token-remove, [data-formula-action="move"]').forEach(function (node) { node.remove(); });
        }
        currentRowId = rowId;
        if (!target.closest('[data-formula-blank]')) scaffoldActive = null;
      }
      if (inside && target.closest('[data-formula-slot], [data-formula-token]')) return;
      // 挿入先の記憶と見た目のカーソルを分離する。再描画しないので、
      // pointerdown 中に押そうとしたボタンや入力欄を消してしまわない。
      caretVisible = false;
      host.querySelectorAll('.formula-slot.is-active').forEach(function (node) { node.classList.remove('is-active'); });
      // Safari/WebKit はボタン押下時に一度外側の main へフォーカスを
      // 移すことがある。focusin で部品を消すと続く click が失われる。
      if (!inside && event.type !== 'focusin') {
        scaffoldActive = null;
        cancelReference(); closePopup();
        active = null; selected = null; moving = null;
        host.querySelectorAll('.is-selected, .is-move-target').forEach(function (node) { node.classList.remove('is-selected', 'is-move-target'); });
        host.querySelectorAll('.formula-token-remove, [data-formula-action="move"]').forEach(function (node) { node.remove(); });
      }
    }
    function descendant(source, destination) {
      if (source.rowId !== destination.rowId) return false;
      var root = source.path.concat(source.index);
      return destination.path.length >= root.length && root.every(function (part, index) { return destination.path[index] === part; });
    }
    function inputChanged() {
      feedback = null; feedbackAnnouncement = '';
      host.querySelectorAll('.formula-feedback, .formula-feedback-announcement').forEach(function (node) { node.remove(); });
      if (typeof options.onChange === 'function') options.onChange(getDraft());
    }
    function slotIsValid(slot) {
      var list = slot && rowById(slot.rowId) && arrayFor(rowById(slot.rowId), slot.path);
      return !!list && Number.isInteger(slot.index) && slot.index >= 0 && slot.index <= list.length;
    }
    function tokenIsValid(location) {
      var list = location && rowById(location.rowId) && arrayFor(rowById(location.rowId), location.path);
      return !!list && Number.isInteger(location.index) && location.index >= 0 && location.index < list.length;
    }
    function normalizeLocations() {
      if (!slotIsValid(active)) active = null;
      if (!tokenIsValid(selected)) selected = null;
      if (!tokenIsValid(moving)) moving = null;
    }
    function changed(focusTarget) {
      normalizeLocations();
      render(focusTarget || (active ? { kind: 'slot', location: active } : selected ? { kind: 'token', location: selected } : { kind: 'slot', location: makeSlot(state.rows[0].id, [], 0) }));
      if (typeof options.onChange === 'function') options.onChange(getDraft());
    }
    function update(mutator, focusTarget) { if (disabled) return; mutator(); feedback = null; feedbackAnnouncement = ''; changed(focusTarget); }
    function referencesTo(rowId) {
      function contains(tokens) {
        return tokens.some(function (token) {
          if (token.kind === 'reference') return token.rowId === rowId;
          if (token.kind === 'fraction') return contains(token.numerator) || contains(token.denominator);
          if (token.kind === 'power') return contains(token.base) || contains(token.exponent);
          return token.kind === 'group' && contains(token.body);
        });
      }
      return state.rows.some(function (row) { return contains(row.tokens); });
    }
    function updateReferenceLabels(rowId) {
      var source = rowById(rowId);
      host.querySelectorAll('[data-formula-reference]').forEach(function (node) {
        if (node.dataset.formulaReference === rowId) renderReferenceValue(node.querySelector('.formula-reference-value'), source);
      });
    }
    function enteredResult(row) {
      if (!row) return { result: '', resultUnit: '' };
      var task = taskForRow(row);
      if (!task) return row;
      // 小問の答えは一度だけ入力する。数値の最終回答を前式の結果として
      // 使う場合も、その手入力を読むだけで計算・正解の補完はしない。
      if (task.answerIsResult === false && !task.conclusionQuantity) return { result: '', resultUnit: '' };
      if (task.conclusionQuantity) return { result: state.answers[taskIdFor(task, tasks.indexOf(task))] || '', resultUnit: task.conclusionQuantity.unit };
      return { result: state.answers[taskIdFor(task, tasks.indexOf(task))] || '', resultUnit: task.answerUnit || '' };
    }
    function renderReferenceValue(node, row) {
      var source = enteredResult(row);
      node.replaceChildren();
      if (!source.result) node.append(document.createTextNode('前の式の答え'));
      else appendAmount(node, source.result, source.resultUnit);
    }
    function validReference(rowId, targetId) {
      var sourceIndex = state.rows.findIndex(function (row) { return row.id === rowId; });
      var targetIndex = state.rows.findIndex(function (row) { return row.id === targetId; });
      return targetIndex >= 0 && targetIndex < sourceIndex;
    }
    function referencesAreValidInRow(token, destinationRowId) {
      if (token.kind === 'reference') return validReference(destinationRowId, token.rowId);
      if (token.kind === 'fraction') return token.numerator.every(function (item) { return referencesAreValidInRow(item, destinationRowId); }) && token.denominator.every(function (item) { return referencesAreValidInRow(item, destinationRowId); });
      if (token.kind === 'power') return token.base.every(function (item) { return referencesAreValidInRow(item, destinationRowId); }) && token.exponent.every(function (item) { return referencesAreValidInRow(item, destinationRowId); });
      return token.kind !== 'group' || token.body.every(function (item) { return referencesAreValidInRow(item, destinationRowId); });
    }
    function insertToken(slot, token) {
      if (!slot || disabled) return;
      var row = rowById(slot.rowId);
      var task = taskForRow(row);
      if (isScaffold(task)) {
        if (token.kind !== 'value') return;
        var field = scaffoldActive && scaffoldActive.rowId === row.id ? scaffoldActive.field : 'bound';
        var input = Array.from(host.querySelectorAll('[data-formula-blank]')).find(function (node) { return node.dataset.formulaBlank === field && node.closest('[data-formula-row]').dataset.formulaRow === row.id; });
        if (input) { input.value = token.value; input.dispatchEvent(new Event('input', { bubbles: true })); input.focus({ preventScroll: true }); }
        return;
      }
      var target = row && arrayFor(row, slot.path);
      if (!target) return;
      if (token.kind === 'answer') {
        cancelReference();
        // 通常の＝は手入力結果の区切りであり、採点する式そのものではない。
        if (row.answerOpen) { restoreFocus({ kind: 'answer', rowId: row.id }); return; }
        update(function () { row.answerOpen = true; currentRowId = row.id; caretVisible = false; selected = null; }, { kind: 'answer', rowId: row.id });
        return;
      }
      if (!referencesAreValidInRow(token, slot.rowId)) return;
      cancelReference();
      update(function () { target.splice(slot.index, 0, copy(token)); active = makeSlot(slot.rowId, slot.path, slot.index + 1); currentRowId = row.id; caretVisible = false; selected = null; });
    }
    function moveToken(source, destination) {
      if (!source || !destination || disabled || descendant(source, destination)) return;
      var fromRow = rowById(source.rowId);
      var toRow = rowById(destination.rowId);
      var from = fromRow && arrayFor(fromRow, source.path);
      var to = toRow && arrayFor(toRow, destination.path);
      if (!from || !to || !from[source.index]) return false;
      var token = from[source.index];
      if (!referencesAreValidInRow(token, destination.rowId)) return false;
      update(function () {
        var destinationPath = destination.path.slice();
        if (source.rowId === destination.rowId && destinationPath.length > source.path.length && source.path.every(function (part, index) { return destinationPath[index] === part; }) && typeof destinationPath[source.path.length] === 'number' && destinationPath[source.path.length] > source.index) destinationPath[source.path.length] -= 1;
        from.splice(source.index, 1);
        var insertAt = destination.index;
        if (source.rowId === destination.rowId && samePath(source.path, destination.path) && source.index < insertAt) insertAt -= 1;
        to.splice(Math.max(0, insertAt), 0, token);
        active = makeSlot(destination.rowId, destinationPath, Math.max(0, insertAt) + 1);
        currentRowId = destination.rowId; caretVisible = false;
        selected = null;
      });
      return true;
    }
    function removeToken(location) {
      var row = location && rowById(location.rowId);
      var list = row && arrayFor(row, location.path);
      if (!list || !list[location.index] || disabled) return;
      update(function () { list.splice(location.index, 1); selected = null; active = makeSlot(location.rowId, location.path, location.index); currentRowId = row.id; caretVisible = false; });
    }
    function lockSlideKeys(event) {
      var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '];
      if (keys.indexOf(event.key) >= 0 || (event.key === 'Delete' && selected)) event.stopPropagation();
      if (event.key === 'Delete' && selected && !disabled && !event.target.closest('input, select, textarea')) { event.preventDefault(); removeToken(selected); }
      if (event.key === 'Escape' && openPopup) { event.preventDefault(); event.stopPropagation(); closePopup(true); }
      else if (event.key === 'Escape' && pendingReference) { event.preventDefault(); event.stopPropagation(); cancelReference(true); }
      else if (event.key === 'Escape' && moving) { event.preventDefault(); event.stopPropagation(); selected = moving; moving = null; render({ kind: 'token', location: selected }); }
      else if (event.key === 'Escape' && selected) { event.preventDefault(); event.stopPropagation(); var previous = selected; selected = null; render({ kind: 'token', location: previous }); }
    }
    function activeOrDefault() {
      if (slotIsValid(active) && (!currentRowId || active.rowId === currentRowId)) return active;
      if (tokenIsValid(selected) && (!currentRowId || selected.rowId === currentRowId)) return makeSlot(selected.rowId, selected.path, selected.index + 1);
      var row = rowById(currentRowId) || state.rows[0];
      return makeSlot(row.id, [], row.tokens.length);
    }
    function displayUnit(unit) { return units[unit] && units[unit].label ? units[unit].label : unit || '単位なし'; }
    function appendAmount(node, value, unit) {
      node.append(el('span', { className: 'formula-number', text: displayNumber(value) }));
      if (!unit) return;
      node.append(el('small', { className: 'formula-unit', text: displayUnit(unit) }));
    }
    function displayNumber(value) {
      var raw = String(value == null ? '' : value);
      if (!/^[+-]?(?:\d+(?:\.\d+)?|\.\d+)$/.test(raw.replace(/,/g, ''))) return raw;
      var number = Number(raw.replace(/,/g, ''));
      return Number.isFinite(number) ? new Intl.NumberFormat('ja-JP', { maximumFractionDigits: 12 }).format(number) : raw;
    }
    function tokenLabel(token) {
      if (token.kind === 'value') return displayNumber(token.value) + (token.unit ? ' ' + displayUnit(token.unit) : '');
      if (token.kind === 'reference') return '前の行の結果';
      if (token.kind === 'fraction') return '分数';
      if (token.kind === 'power') return '指数';
      if (token.kind === 'group') return '括弧';
      return token.value;
    }
    function dispatchResize() { host.dispatchEvent(new CustomEvent('joho:lesson-content-resize', { bubbles: true })); }
    function findFormulaNode(kind, location) {
      var attr = kind === 'slot' ? 'formulaSlot' : kind === 'exponent' ? 'formulaExponent' : 'formulaToken';
      var selector = kind === 'slot' ? '[data-formula-slot]' : kind === 'exponent' ? '[data-formula-exponent]' : '[data-formula-token]';
      return Array.from(host.querySelectorAll(selector)).find(function (node) {
        var candidate = decode(node.dataset[attr]);
        return candidate && candidate.rowId === location.rowId && candidate.index === location.index && samePath(candidate.path, location.path);
      });
    }
    function restoreFocus(target) {
      if (!target) return;
      var node = target.kind === 'answer' ? Array.from(host.querySelectorAll('[data-formula-row]')).find(function (row) { return row.dataset.formulaRow === target.rowId; }) : findFormulaNode(target.kind, target.location);
      if (node && target.kind === 'answer') node = node.querySelector('[data-formula-answer], [data-formula-result]');
      if (node) {
        try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); }
        if (target.kind === 'answer') node.scrollIntoView({ block: 'nearest', inline: 'nearest' });
      }
    }
    function makePaletteDraggable(node, token) {
      node.draggable = !disabled;
      node.addEventListener('dragstart', function (event) {
        if (disabled) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-lesson-formula-new', encode(token));
        beginDrag({ token: token });
      });
    }

    function referenceIsReady(row) {
      var raw = String(enteredResult(row).result || '').normalize('NFKC').replace(/[,_\s]/g, '');
      return !!raw && Number.isFinite(Number(raw));
    }
    function cancelReference(restore) {
      var rowId = pendingReference;
      pendingReference = null;
      host.classList.remove('is-picking-reference');
      host.querySelectorAll('[data-formula-result-grip]').forEach(function (grip) { grip.setAttribute('aria-pressed', 'false'); });
      host.querySelectorAll('.formula-reference-guide').forEach(function (node) { node.remove(); });
      clearDropHints();
      if (restore && rowId) {
        var grip = Array.from(host.querySelectorAll('[data-formula-result-grip]')).find(function (node) { return node.dataset.formulaResultGrip === rowId; });
        if (grip) grip.focus({ preventScroll: true });
      }
    }
    function pickReference(rowId) {
      if (disabled || !referenceIsReady(rowById(rowId))) return;
      if (pendingReference === rowId) { cancelReference(); return; }
      pendingReference = rowId; caretVisible = false; selected = null; moving = null;
      render();
      var first = host.querySelector('.formula-slot.is-drop-target');
      if (first) { first.focus({ preventScroll: true }); first.scrollIntoView({ block: 'nearest', inline: 'nearest' }); }
      else {
        var grip = Array.from(host.querySelectorAll('[data-formula-result-grip]')).find(function (node) { return node.dataset.formulaResultGrip === rowId; });
        if (grip) grip.focus({ preventScroll: true });
      }
    }
    function currentPayload() { return dragPayload || (pendingReference ? { token: { kind: 'reference', rowId: pendingReference } } : null); }
    function payloadToken(payload) { return payload.token || (tokenIsValid(payload.source) && arrayFor(rowById(payload.source.rowId), payload.source.path)[payload.source.index]); }
    function operandStart(token) { return !!token && (token.kind !== 'operator' || token.value === '('); }
    function operandEnd(token) { return !!token && (token.kind !== 'operator' || token.value === ')'); }
    // 濃淡は構文上の挿入候補であり、正解の演算や数値を推測しない。
    // 不自然な位置も淡い候補として残し、入力後の修正を妨げない。
    function preferredSlot(slot, payload) {
      var list = arrayFor(rowById(slot.rowId), slot.path);
      var left = list[slot.index - 1]; var right = list[slot.index];
      var source = payload.source;
      if (source && source.rowId === slot.rowId && samePath(source.path, slot.path)) {
        if (source.index === slot.index - 1) left = list[slot.index - 2];
        if (source.index === slot.index) right = list[slot.index + 1];
      }
      var token = payloadToken(payload);
      if (!token) return false;
      if (token.kind === 'answer') return !slot.path.length && slot.index === list.length && operandEnd(left);
      if (token.kind !== 'operator') return !operandEnd(left) && !operandStart(right);
      if (token.value === '(') return !operandEnd(left);
      if (token.value === ')') return operandEnd(left) && !operandStart(right);
      if (operandEnd(left) && operandStart(right)) return true;
      return ['+', '-'].indexOf(token.value) >= 0 && !operandEnd(left) && operandStart(right);
    }
    function canAddExponent(location, payload) {
      if (disabled || !tokenIsValid(location)) return false;
      var base = arrayFor(rowById(location.rowId), location.path)[location.index];
      if (['value', 'reference', 'fraction', 'group'].indexOf(base.kind) < 0) return false;
      if (!payload) return true;
      var token = payloadToken(payload);
      if (!token || token.kind === 'operator' || token.kind === 'answer' || !referencesAreValidInRow(token, location.rowId)) return false;
      var source = payload.source;
      return !source || !((source.rowId === location.rowId && source.index === location.index && samePath(source.path, location.path)) || descendant(source, location) || descendant(location, source));
    }
    function addExponent(location, payload) {
      if (!canAddExponent(location, payload)) return;
      var target = arrayFor(rowById(location.rowId), location.path);
      var base = target[location.index];
      var exponent = payload ? payloadToken(payload) : null;
      cancelReference();
      update(function () {
        var path = location.path.slice();
        if (payload && payload.source) {
          var source = payload.source;
          arrayFor(rowById(source.rowId), source.path).splice(source.index, 1);
          if (source.rowId === location.rowId && path.length > source.path.length && source.path.every(function (part, index) { return path[index] === part; }) && path[source.path.length] > source.index) path[source.path.length] -= 1;
        }
        var index = target.indexOf(base);
        target[index] = { kind: 'power', base: [base], exponent: exponent ? [copy(exponent)] : [] };
        active = makeSlot(location.rowId, path.concat(index, 'exponent'), exponent ? 1 : 0);
        currentRowId = location.rowId; caretVisible = !exponent; selected = null; moving = null;
      });
    }

    function canDropAt(slot) {
      var payload = currentPayload();
      if (disabled || !payload || !slot) return false;
      if (slot.exponent) return canAddExponent(slot, payload);
      if (!slotIsValid(slot)) return false;
      if (payload.token) return referencesAreValidInRow(payload.token, slot.rowId);
      var source = payload.source;
      if (!tokenIsValid(source) || descendant(source, slot)) return false;
      return referencesAreValidInRow(arrayFor(rowById(source.rowId), source.path)[source.index], slot.rowId);
    }
    function beginDrag(payload) {
      cancelReference();
      dragPayload = payload;
      host.classList.add('is-dragging');
      refreshDropHints();
    }
    function clearDropHints() {
      host.querySelectorAll('.is-drop-target, .is-drop-preferred, .is-dragover').forEach(function (node) { node.classList.remove('is-drop-target', 'is-drop-preferred', 'is-dragover'); });
      host.querySelectorAll('.formula-drop-guide').forEach(function (node) { node.hidden = true; });
    }
    function refreshDropHints() {
      var payload = currentPayload();
      if (!payload) return;
      host.querySelectorAll('[data-formula-slot]').forEach(function (node) {
        var slot = decode(node.dataset.formulaSlot); var allowed = canDropAt(slot);
        node.classList.toggle('is-drop-target', allowed);
        node.classList.toggle('is-drop-preferred', allowed && preferredSlot(slot, payload));
      });
      host.querySelectorAll('[data-formula-exponent]').forEach(function (node) {
        var allowed = canAddExponent(decode(node.dataset.formulaExponent), payload);
        node.classList.toggle('is-drop-target', allowed);
        node.classList.toggle('is-drop-preferred', allowed);
      });
      host.querySelectorAll('[data-formula-blank]').forEach(function (node) {
        var token = payloadToken(payload);
        var allowed = !disabled && token && token.kind === 'value';
        node.classList.toggle('is-drop-target', !!allowed);
        node.classList.toggle('is-drop-preferred', !!allowed);
      });
    }
    function endDrag() {
      dragPayload = null;
      host.classList.remove('is-dragging');
      clearDropHints();
      if (openPopup) closePopup();
    }
    function dropSlot(event, formula, row) {
      var target = event.target instanceof Element ? event.target : null;
      var exponent = target && target.closest('[data-formula-exponent]');
      if (exponent && formula.contains(exponent)) return Object.assign(decode(exponent.dataset.formulaExponent), { exponent: true });
      var direct = target && target.closest('[data-formula-slot]');
      if (direct && formula.contains(direct)) return decode(direct.dataset.formulaSlot);
      var token = target && target.closest('[data-formula-token]');
      if (token && formula.contains(token)) {
        var location = decode(token.dataset.formulaToken);
        var bounds = token.getBoundingClientRect();
        return makeSlot(location.rowId, location.path, location.index + (event.clientX >= bounds.left + bounds.width / 2 ? 1 : 0));
      }
      // 部品の間だけでなく式の余白も受け付ける。分数・指数の内側は
      // 上の直接slot/token判定を優先し、外側への二重挿入を防ぐ。
      var slots = Array.from(formula.querySelectorAll('[data-formula-slot]')).filter(function (node) { return !decode(node.dataset.formulaSlot).path.length; });
      slots.sort(function (a, b) {
        var ar = a.getBoundingClientRect(); var br = b.getBoundingClientRect();
        return Math.abs(event.clientX - (ar.left + ar.width / 2)) - Math.abs(event.clientX - (br.left + br.width / 2));
      });
      return slots.length ? decode(slots[0].dataset.formulaSlot) : makeSlot(row.id, [], row.tokens.length);
    }
    function wireDropArea(formula, row) {
      var guide = el('span', { className: 'formula-drop-guide', text: 'ここへ挿入' });
      guide.hidden = true; guide.setAttribute('aria-hidden', 'true'); formula.append(guide);
      formula.addEventListener('dragover', function (event) {
        if (!dragPayload) return;
        var slot = dropSlot(event, formula, row);
        host.querySelectorAll('.is-dragover').forEach(function (node) { node.classList.remove('is-dragover'); });
        host.querySelectorAll('.formula-drop-guide').forEach(function (node) { node.hidden = true; });
        if (!canDropAt(slot)) return;
        event.preventDefault(); event.stopPropagation();
        event.dataTransfer.dropEffect = dragPayload.source ? 'move' : 'copy';
        var node = findFormulaNode(slot.exponent ? 'exponent' : 'slot', slot);
        if (node) node.classList.add('is-dragover');
        guide.hidden = false;
      });
      formula.addEventListener('dragleave', function (event) {
        if (event.relatedTarget instanceof Node && formula.contains(event.relatedTarget)) return;
        formula.querySelectorAll('.is-dragover').forEach(function (node) { node.classList.remove('is-dragover'); });
        guide.hidden = true;
      });
      formula.addEventListener('drop', function (event) {
        if (!dragPayload) return;
        event.preventDefault(); event.stopPropagation();
        var slot = dropSlot(event, formula, row);
        var payload = dragPayload;
        var allowed = canDropAt(slot);
        endDrag();
        if (!allowed) return;
        if (slot.exponent) addExponent(slot, payload);
        else if (payload.token) insertToken(slot, payload.token); else moveToken(payload.source, slot);
      });
    }

    function slotNode(slot, text) {
      var node = button(text || '', { className: 'formula-slot' + (text ? ' is-empty' : ''), label: 'この位置へ挿入', dataset: { formulaSlot: encode(slot) } });
      node.disabled = disabled;
      if (caretVisible && active && active.rowId === slot.rowId && samePath(active.path, slot.path) && active.index === slot.index) node.classList.add('is-active');
      if (moving) { node.classList.add('is-move-target'); node.setAttribute('aria-label', '選択した部品をこの位置へ移動'); }
      node.addEventListener('click', function (event) {
        event.stopPropagation();
        if (pendingReference) {
          if (canDropAt(slot)) insertToken(slot, { kind: 'reference', rowId: pendingReference });
          return;
        }
        if (moving) {
          var source = moving;
          moving = null;
          if (!moveToken(source, slot)) moving = source;
          return;
        }
        active = slot; currentRowId = slot.rowId; caretVisible = true; selected = null; render({ kind: 'slot', location: slot });
      });
      node.addEventListener('keydown', function (event) {
        var delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
        if (!delta) return;
        event.preventDefault(); event.stopPropagation();
        var slots = Array.from(host.querySelectorAll('[data-formula-slot]')).filter(function (entry) { return !pendingReference || entry.classList.contains('is-drop-target'); });
        var next = slots[slots.indexOf(node) + delta];
        if (next) {
          active = decode(next.dataset.formulaSlot); currentRowId = active.rowId; caretVisible = true; selected = null;
          render({ kind: 'slot', location: active });
        }
      });
      return node;
    }
    function tokenNode(token, location, row) {
      var node;
      if (token.kind === 'fraction') {
        node = el('span', { className: 'formula-token formula-fraction', label: '分数。クリックで選択' });
        node.append(renderTokenList(row, token.numerator, location.path.concat(location.index, 'numerator'), '分子'));
        node.append(el('span', { className: 'formula-fraction-bar', text: '―', label: '分数線' }));
        node.append(renderTokenList(row, token.denominator, location.path.concat(location.index, 'denominator'), '分母'));
      } else if (token.kind === 'power') {
        node = el('span', { className: 'formula-token formula-power', label: '指数。クリックで選択' });
        node.append(renderTokenList(row, token.base, location.path.concat(location.index, 'base'), '底'));
        var sup = el('sup', { className: 'formula-power-exponent' });
        sup.append(renderTokenList(row, token.exponent, location.path.concat(location.index, 'exponent'), '指数'));
        node.append(sup);
      } else if (token.kind === 'group') {
        node = el('span', { className: 'formula-token formula-group', label: '括弧。クリックで選択' });
        node.append(el('span', { text: '(' }));
        node.append(renderTokenList(row, token.body, location.path.concat(location.index, 'body'), '括弧内'));
        node.append(el('span', { text: ')' }));
      } else if (token.kind === 'reference') {
        var refRow = rowById(token.rowId);
        node = el('span', { className: 'formula-token formula-reference', label: '前の式の手入力結果を参照' });
        var referenceValue = el('span', { className: 'formula-reference-value' });
        renderReferenceValue(referenceValue, refRow); node.append(referenceValue);
        node.dataset.formulaReference = token.rowId;
      } else {
        var visible = tokenLabel(token);
        var accessible = token.kind === 'value' && token.label ? token.label + '：' + visible : visible;
        node = el('span', { className: 'formula-token formula-' + token.kind, label: accessible + '。クリックで選択' });
        if (token.kind === 'value') appendAmount(node, token.value, token.unit);
        else node.textContent = visible;
        if (token.kind === 'value' && token.label) node.title = token.label;
      }
      node.tabIndex = disabled ? -1 : 0;
      node.setAttribute('role', 'group');
      node.draggable = !disabled;
      node.dataset.formulaToken = encode(location);
      // 既存の数値等を底として使える右上の入力先。底を選び直したり
      // 指数テンプレートへ移し替えたりする必要はない。
      if (canAddExponent(location) && location.path[location.path.length - 1] !== 'base') {
        var exponent = button('□', { className: 'formula-exponent-target', label: tokenLabel(token) + ' の右上に指数を入力', dataset: { formulaExponent: encode(location) } });
        exponent.title = '右上に指数を入力'; exponent.disabled = disabled; exponent.draggable = false;
        exponent.addEventListener('click', function (event) { event.stopPropagation(); addExponent(location, pendingReference ? currentPayload() : null); });
        exponent.addEventListener('dragstart', function (event) { event.preventDefault(); event.stopPropagation(); });
        node.append(exponent); node.classList.add('has-exponent-target');
      }
      if (!disabled && selected && selected.rowId === location.rowId && samePath(selected.path, location.path) && selected.index === location.index) {
        node.classList.add('is-selected');
        var remove = button('×', { className: 'formula-token-remove', label: tokenLabel(token) + 'を削除' });
        remove.draggable = false;
        remove.addEventListener('click', function (event) { event.stopPropagation(); removeToken(location); });
        remove.addEventListener('dragstart', function (event) { event.preventDefault(); event.stopPropagation(); });
        node.append(remove);
      }
      node.addEventListener('click', function (event) { event.stopPropagation(); if (disabled) return; cancelReference(); selected = location; currentRowId = row.id; caretVisible = false; active = null; render({ kind: 'token', location: location }); });
      node.addEventListener('keydown', function (event) {
        if (event.target !== node || disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation(); event.preventDefault(); cancelReference(); selected = location; currentRowId = row.id; caretVisible = false; active = null; render({ kind: 'token', location: location });
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.stopPropagation(); event.preventDefault(); removeToken(location);
        }
      });
      node.addEventListener('dragstart', function (event) { if (disabled) { event.preventDefault(); return; } event.stopPropagation(); event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-lesson-formula', encode(location)); beginDrag({ source: location }); });
      return node;
    }
    function renderTokenList(row, list, path, name) {
      var group = el('span', { className: 'formula-token-list', label: name || '式' });
      if (!path.length && !list.length) group.classList.add('is-empty-expression');
      group.append(slotNode(makeSlot(row.id, path, 0), list.length ? '' : path.length ? name : 'ここに式を組み立てる'));
      list.forEach(function (token, index) {
        group.append(tokenNode(token, { rowId: row.id, path: path.slice(), index: index }, row));
        group.append(slotNode(makeSlot(row.id, path, index + 1)));
      });
      return group;
    }
    function paletteCard(item, type) {
      var label = item.label || item.id || item.value;
      var amount = (item.value != null ? displayNumber(item.value) : '') + (item.unit ? ' ' + displayUnit(item.unit) : '');
      var text = label + (amount ? ' ' + amount : '');
      var card = button('', { className: 'formula-palette-card', label: text + 'を式へ挿入', dataset: type === 'quantity' ? { formulaQuantity: item.id } : { formulaConstant: item.id } });
      card.append(dragDots());
      var value = el('span', { className: 'formula-card-value' });
      appendAmount(value, item.value, item.unit); card.append(value);
      card.disabled = disabled;
      var token = { kind: 'value', value: String(item.value == null ? '' : item.value), unit: String(item.unit || ''), label: item.label };
      card.addEventListener('click', function () { insertToken(activeOrDefault(), token); });
      makePaletteDraggable(card, token);
      return card;
    }
    function dragDots() {
      var dots = el('span', { className: 'formula-drag-dots', text: '⠿' });
      dots.setAttribute('aria-hidden', 'true');
      return dots;
    }
    function operatorCard(operator, relation) {
      var labels = { '+': '＋', '-': '－', '×': '×', '÷': '÷', '=': '＝', '(': '(', ')': ')', '<': '<', '<=': '≤', '>': '>', '>=': '≥' };
      var opensAnswer = operator === '=' && !relation;
      var card = button(relation ? '等式の＝' : labels[operator], { className: 'formula-operator', label: opensAnswer ? '＝ 答えの入力欄を開く' : labels[operator] + 'を式へ挿入', dataset: { formulaOperator: relation ? 'relation=' : operator } });
      card.disabled = disabled;
      var token = opensAnswer ? { kind: 'answer' } : { kind: 'operator', value: operator };
      card.addEventListener('click', function () { insertToken(activeOrDefault(), token); });
      makePaletteDraggable(card, token);
      return card;
    }
    function unitSelect(value, label, dataset, limited) {
      var select = el('select', { label: label, dataset: dataset });
      select.append(el('option', { value: '', text: displayUnit('') }));
      var used = quantities.concat(constants).map(function (item) { return item.unit; }).concat(tasks.map(function (task) { return task.answerUnit; }), config.manualUnits || []);
      if (used.some(function (id) { return /^(bit|B|KB|MB|KiB|MiB)/.test(id); })) used = used.concat(['bit', 'B', 'B/sample', 'B/s']);
      var ordinary = Object.keys(units).filter(function (id) { return id && !units[id].conversion && (!limited || id === value || used.indexOf(id) >= 0); });
      ordinary.forEach(function (id) { select.append(el('option', { value: id, text: displayUnit(id) })); });
      // 換算値は単位なしで入力し、方向・桁数は教材側の立式採点で確認する。
      // 旧draftの明示単位だけは編集できるよう残す。
      if (value && ordinary.indexOf(value) < 0) select.append(el('option', { value: value, text: displayUnit(value) }));
      select.value = value || '';
      return select;
    }
    function controlButton(text, action, label) {
      var node = button(text, { className: 'formula-control', label: label || text, dataset: { formulaAction: action } });
      node.disabled = disabled || !selected;
      node.addEventListener('click', function () {
        if (action === 'move' && selected) { moving = selected; selected = null; active = null; render(); }
      });
      return node;
    }
    function feedbackFor(items, id) { return (items || []).find(function (entry) { return String(entry.id) === String(id); }); }
    function statusNode(item, fallback) {
      if (!item) return null;
      var messages = Array.isArray(item.messages) ? item.messages.slice() : item.message ? [item.message] : [];
      if (item.formulaCorrect != null || item.answerCorrect != null) messages.unshift('立式：' + (item.formulaCorrect ? '○' : '×') + '　答え：' + (item.answerCorrect ? '○' : '×'));
      if (!messages.length && item.calculationCorrect != null) messages.push(item.calculationCorrect ? '✓ 式を確認しました。' : '△ 式を見直してください。');
      if (!messages.length) return null;
      var status = item.calculationCorrect === false || item.formulaCorrect === false || item.answerCorrect === false ? 'is-error' : item.calculationCorrect === true || item.formulaCorrect === true || item.answerCorrect === true ? 'is-ok' : 'is-pending';
      return el('p', { className: 'formula-feedback ' + status, text: messages.join(' ') || fallback });
    }
    function renderScaffold(row, task, index) {
      var box = el('section', { className: 'formula-row formula-scaffold', dataset: { formulaRow: row.id } });
      var expression = el('div', { className: 'formula-scaffold-expression', label: '2の累乗で必要な最小ビット数を確かめる比較式' });
      var comparison = el('div', { className: 'formula-scaffold-comparison' });
      var taskFeedback = feedbackFor(feedback && feedback.tasks, taskIdFor(task, tasks.indexOf(task)));
      function blank(name, token, label) {
        var input = el('input', { type: 'text', value: token.value, className: 'formula-scaffold-blank', label: label,
          dataset: { formulaBlank: name } });
        input.inputMode = 'numeric'; input.placeholder = '□'; input.disabled = disabled;
        if (taskFeedback && taskFeedback.fields && taskFeedback.fields[name] === false) input.setAttribute('aria-invalid', 'true');
        input.addEventListener('focus', function () {
          scaffoldActive = { rowId: row.id, field: name }; currentRowId = row.id;
          active = makeSlot(row.id, [], 0); selected = null; caretVisible = false;
        });
        input.addEventListener('input', function () {
          token.value = input.value; input.removeAttribute('aria-invalid'); inputChanged();
        });
        input.addEventListener('dragover', function (event) {
          var token = dragPayload && payloadToken(dragPayload);
          if (disabled || !token || token.kind !== 'value') return;
          event.preventDefault(); event.stopPropagation();
          event.dataTransfer.dropEffect = 'copy'; input.classList.add('is-dragover');
        });
        input.addEventListener('dragleave', function () { input.classList.remove('is-dragover'); });
        input.addEventListener('drop', function (event) {
          var token = dragPayload && payloadToken(dragPayload);
          if (disabled || !token || token.kind !== 'value') return;
          event.preventDefault(); event.stopPropagation();
          input.value = token.value; input.dispatchEvent(new Event('input', { bubbles: true }));
          endDrag(); input.focus({ preventScroll: true });
        });
        return input;
      }
      function boundedPower(name, token, label) {
        var power = el('span', { className: 'formula-scaffold-power' });
        power.append(el('span', { className: 'formula-scaffold-base', text: task.scaffold.base || 2 }), blank(name, token, label));
        return power;
      }
      comparison.append(boundedPower('lower', row.tokens[0].exponent[0], '足りない側の指数'),
        el('span', { className: 'formula-scaffold-relation', text: '＜' }),
        blank('bound', row.tokens[2], task.boundLabel || '問題の段階数・色数'),
        el('span', { className: 'formula-scaffold-relation', text: '≦' }),
        boundedPower('upper', row.tokens[4].exponent[0], '足りる側の指数'));
      expression.append(comparison, renderResult(row, task, index));
      box.append(expression);
      var rowMessage = statusNode(feedbackFor(feedback && feedback.rows, row.id));
      if (rowMessage) box.append(rowMessage);
      var message = statusNode(taskFeedback);
      if (message) box.append(message);
      return box;
    }
    function renderRow(row, index) {
      var task = taskForRow(row);
      if (isScaffold(task)) return renderScaffold(row, task, index);
      var box = el('section', { className: 'formula-row', dataset: { formulaRow: row.id } });
      var heading = el('div', { className: 'formula-row-heading' });
      heading.append(el('span', { className: 'formula-row-label', text: (task ? '式 ' : '途中式 ') + (index + 1) }));
      if (rowsForTask(row.taskId).length > 1) {
        var remove = button('×', { className: 'formula-row-remove', label: '式 ' + (index + 1) + ' を削除' });
        remove.disabled = disabled || state.rows.length === 1 || referencesTo(row.id);
        if (referencesTo(row.id)) remove.title = 'この行を参照している式があるため削除できません。';
        remove.addEventListener('click', function () {
          update(function () {
            if (task) {
              var remaining = rowsForTask(row.taskId).filter(function (entry) { return entry.id !== row.id; });
              var previous = remaining[remaining.length - 1];
              state.targets[row.taskId] = previous.id;
              state.answers[row.taskId] = previous.result;
              previous.result = ''; previous.resultUnit = '';
              currentRowId = previous.id;
            }
            state.rows = state.rows.filter(function (entry) { return entry.id !== row.id; });
          });
        });
        heading.append(remove);
      }
      box.append(heading);
      var formula = el('div', { className: 'formula-expression', label: '式 ' + (index + 1) + '。挿入位置を選択して部品を追加します。' });
      var line = el('div', { className: 'formula-expression-line' });
      line.append(renderTokenList(row, row.tokens, [], '式 ' + (index + 1)));
      if (row.answerOpen) line.append(renderResult(row, task, index));
      formula.append(line); wireDropArea(formula, row);
      box.append(formula);
      if (selected && selected.rowId === row.id && !disabled) box.append(controlButton('選択を移動', 'move'));
      var rowFeedback = feedbackFor(feedback && feedback.rows, row.id);
      var message = statusNode(rowFeedback);
      if (message) box.append(message);
      if (task) {
        var taskMessage = statusNode(feedbackFor(feedback && feedback.tasks, taskIdFor(task, tasks.indexOf(task))));
        if (taskMessage) box.append(taskMessage);
      }
      return box;
    }
    function renderResult(row, task, index) {
      var item = el('div', { className: task ? 'formula-answer-item' : 'formula-row-result' });
      var taskId = task ? taskIdFor(task, tasks.indexOf(task)) : row.taskId;
      var source = el('span', { className: 'formula-result-source', dataset: { formulaResultSource: row.id } });
      var answer = el('input', { type: 'text', value: task ? state.answers[taskId] || '' : row.result, label: task ? (task.label || '小問') + ' の最終回答' : '式 ' + (index + 1) + ' の手入力結果', dataset: task ? { formulaAnswer: taskId } : { formulaResult: row.id } });
      answer.placeholder = '自分で計算して入力'; answer.disabled = disabled; answer.inputMode = 'decimal';
      var separator = el('span', { className: 'formula-answer-equals', text: isScaffold(task) ? '∴' : task && task.answerIsResult === false ? '⇒ 答え' : '＝' });
      if (isScaffold(task)) {
        separator.append(el('small', { className: 'formula-therefore-label', text: 'したがって' }));
        answer.placeholder = '□'; answer.inputMode = 'numeric';
        answer.classList.add('formula-scaffold-answer');
        var judgedTask = feedbackFor(feedback && feedback.tasks, taskId);
        if (judgedTask && judgedTask.answerCorrect === false) answer.setAttribute('aria-invalid', 'true');
      }
      item.append(separator);
      var inputBox = el('span', { className: 'formula-result-input' });
      inputBox.append(answer); source.append(inputBox);
      // inputの文字選択ドラッグをブラウザが優先する場合も、答え部分の
      // 専用つまみから確実に「前式参照」をドラッグできるようにする。
      var grip = button('', { className: 'formula-result-grip', label: 'この答えを参照：ドラッグ、または選んで後の式へ挿入', dataset: { formulaResultGrip: row.id } });
      grip.append(dragDots());
      grip.title = 'ドラッグ、またはクリックして後の式へ挿入';
      grip.setAttribute('aria-pressed', String(pendingReference === row.id));
      grip.addEventListener('click', function () { pickReference(row.id); });
      inputBox.append(grip);
      if (task) source.append(el('small', { className: 'formula-unit formula-answer-unit', text: task.answerUnitLabel || task.answerUnit || '単位なし' }));
      else {
        var unit = unitSelect(row.resultUnit, '式 ' + (index + 1) + ' の結果の単位', { formulaResultUnit: row.id }, true);
        unit.disabled = disabled;
        unit.addEventListener('change', function () { row.resultUnit = unit.value; updateReferenceLabels(row.id); inputChanged(); });
        source.append(unit);
      }
      item.append(source);
      var judge = button('判定', { className: 'formula-judge', label: task ? (task.label || '小問') + ' を判定' : '途中式 ' + (index + 1) + ' の計算を判定', dataset: { formulaJudge: row.id } });
      function refreshEntryControls() {
        judge.disabled = disabled || !answer.value.trim();
        // 全角数字や桁区切りも採点時の数値入力と同様に扱う。
        var canDrag = referenceIsReady(row);
        source.draggable = canDrag && !disabled; answer.draggable = canDrag && !disabled;
        grip.draggable = canDrag && !disabled; grip.hidden = !grip.draggable; grip.disabled = disabled;
        source.classList.toggle('is-draggable', source.draggable);
        inputBox.classList.toggle('has-grip', source.draggable);
        source.title = source.draggable ? 'この答えを後の式へドラッグして使えます' : '';
      }
      answer.addEventListener('input', function () {
        cancelReference();
        answer.removeAttribute('aria-invalid');
        if (task) state.answers[taskId] = answer.value; else row.result = answer.value;
        refreshEntryControls(); updateReferenceLabels(row.id); inputChanged();
      });
      source.addEventListener('dragstart', function (event) {
        if (!source.draggable || event.target.closest('select')) { event.preventDefault(); return; }
        event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-lesson-formula-new', encode({ kind: 'reference', rowId: row.id }));
        beginDrag({ token: { kind: 'reference', rowId: row.id } });
      });
      judge.addEventListener('click', function () {
        if (!disabled && typeof options.onJudge === 'function') options.onJudge({ rowId: row.id, taskId: taskId, intermediate: !task, draft: getDraft() });
      });
      refreshEntryControls(); item.append(judge);
      return item;
    }
    function addRowButton(taskId) {
      var add = button('途中式を追加', { className: 'formula-add-row', label: '式の行を追加', dataset: { formulaAddRow: taskId } });
      add.disabled = disabled || state.rows.length >= MAX_ROWS;
      add.addEventListener('click', function () {
        if (state.rows.length >= MAX_ROWS) return;
        update(function () {
          var row = { id: makeId(), taskId: taskId, tokens: [], result: '', resultUnit: '', answerOpen: false };
          var priorRows = rowsForTask(taskId);
          var previous = priorRows[priorRows.length - 1];
          var targetIndex = state.rows.indexOf(previous);
          if (previous) {
            var source = enteredResult(previous);
            previous.result = source.result; previous.resultUnit = source.resultUnit;
          }
          // 既存の式と手入力結果をその位置に残し、次の計算用の行を下へ
          // 増やす。行IDを保つので、別小問からの参照も切れない。
          state.rows.splice(targetIndex < 0 ? state.rows.length : targetIndex + 1, 0, row);
          state.targets[taskId] = row.id; state.answers[taskId] = '';
          active = makeSlot(row.id, [], 0); currentRowId = row.id; caretVisible = true; selected = null;
        });
      });
      return add;
    }
    function renderTasks() {
      var groups = el('div', { className: 'formula-tasks' });
      var entries = tasks.length ? tasks : [{ id: '', label: '式を組み立てる' }];
      entries.forEach(function (task, taskIndex) {
        var taskId = taskIdFor(task, taskIndex);
        var group = el('section', { className: 'formula-task', dataset: { formulaTask: taskId } });
        group.append(el('h4', { text: task.label || '小問 ' + (taskIndex + 1) }));
        var rows = el('div', { className: 'formula-rows' });
        rowsForTask(taskId).forEach(function (row) { rows.append(renderRow(row, state.rows.indexOf(row))); });
        group.append(rows);
        if (!isScaffold(task)) group.append(addRowButton(taskId));
        groups.append(group);
      });
      host.append(groups);
    }
    function render(focusTarget) {
      ensureTaskRows();
      closePopup();
      host.replaceChildren();
      host.classList.toggle('is-disabled', disabled);
      var guidedOnly = tasks.length > 0 && tasks.every(isScaffold);
      host.classList.toggle('is-guided-only', guidedOnly);
      var palette = el('section', { className: 'formula-palette' });
      palette.append(el('h4', { text: '問題の数値' }));
      var cards = el('div', { className: 'formula-palette-cards' });
      quantities.forEach(function (item) { cards.append(paletteCard(item, 'quantity')); });
      palette.append(cards);
      var constantCards = null;
      var uniqueConstants = (guidedOnly ? [] : constants).filter(function (item, index) {
        function same(candidate) { return String(candidate.value) === String(item.value) && (candidate.unit || '') === (item.unit || ''); }
        return !quantities.some(same) && constants.findIndex(same) === index;
      });
      if (uniqueConstants.length) {
        constantCards = el('div', { className: 'formula-palette-cards formula-constant-cards', label: '補助定数・換算値' });
        uniqueConstants.forEach(function (item) { constantCards.append(paletteCard(item, 'constant')); });
        // 問題の値と合わせて8個までなら、探すための開閉操作を省く。
        if (quantities.length + uniqueConstants.length <= 8) {
          constantCards.classList.add('is-inline'); cards.append(constantCards); constantCards = null;
        }
      }
      if (config.hint) palette.append(el('p', { className: 'formula-hint', text: 'ヒント：' + config.hint }));
      var manual = el('div', { className: 'formula-manual-value' });
      var manualInput = el('input', { type: 'text', value: manualValue, label: '自由入力の数値' }); manualInput.placeholder = '数値を入力'; manualInput.disabled = disabled; manualInput.inputMode = 'decimal';
      manual.append(manualInput);
      var manualOptions = el('div', { className: 'formula-manual-options' });
      manualOptions.hidden = !manualOpen && !manualValue;
      manualInput.setAttribute('aria-expanded', String(!manualOptions.hidden));
      manualInput.addEventListener('focus', function () { manualOpen = true; manualOptions.hidden = false; manualInput.setAttribute('aria-expanded', 'true'); dispatchResize(); });
      manual.addEventListener('focusout', function (event) {
        if (!manualValue && !manual.contains(event.relatedTarget)) { manualOpen = false; manualOptions.hidden = true; manualInput.setAttribute('aria-expanded', 'false'); dispatchResize(); }
      });
      var manualUnitInput = unitSelect(manualUnit, '自由入力の単位', { formulaManualUnit: 'true' }, true); manualUnitInput.disabled = disabled;
      manualUnitInput.addEventListener('change', function () { manualUnit = manualUnitInput.value; }); manualOptions.append(manualUnitInput);
      var insertManual = button('挿入', { className: 'formula-palette-card formula-manual-insert', label: '自由入力の数値を式へ挿入' }); insertManual.disabled = disabled || !manualValue;
      manualInput.addEventListener('input', function () { manualValue = manualInput.value; insertManual.disabled = disabled || !manualValue; });
      function insertManualValue() {
        if (!manualValue || disabled) return;
        var token = { kind: 'value', value: manualValue, unit: manualUnit };
        manualValue = ''; manualOpen = false;
        insertToken(activeOrDefault(), token);
      }
      insertManual.addEventListener('click', insertManualValue);
      manualInput.addEventListener('keydown', function (event) { if (event.key === 'Enter') { event.preventDefault(); event.stopPropagation(); insertManualValue(); } });
      insertManual.draggable = !disabled;
      insertManual.addEventListener('dragstart', function (event) {
        if (disabled || !manualValue) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-lesson-formula-new', encode({ kind: 'value', value: manualValue, unit: manualUnit }));
        beginDrag({ token: { kind: 'value', value: manualValue, unit: manualUnit } });
      });
      manualOptions.append(insertManual); manual.append(manualOptions);
      if (!guidedOnly) cards.append(manual);
      var ops = el('div', { className: 'formula-operators', label: '演算子' });
      ['+', '-', '×', '÷', '='].forEach(function (operator) { ops.append(operatorCard(operator)); });
      var extraOps = el('div', { className: 'formula-operators' });
      ['(', ')', '<', '<=', '>', '>='].forEach(function (operator) { extraOps.append(operatorCard(operator)); });
      extraOps.append(operatorCard('=', true));
      var fractionToken = { kind: 'fraction', numerator: [], denominator: [] };
      var fraction = button('分数', { className: 'formula-operator', label: '分数を式へ挿入' }); fraction.disabled = disabled; fraction.addEventListener('click', function () { insertToken(activeOrDefault(), fractionToken); }); makePaletteDraggable(fraction, fractionToken); extraOps.append(fraction);
      var powerToken = { kind: 'power', base: [], exponent: [] };
      var power = button('指数', { className: 'formula-operator', label: '指数を式へ挿入' }); power.disabled = disabled; power.addEventListener('click', function () { insertToken(activeOrDefault(), powerToken); }); makePaletteDraggable(power, powerToken); extraOps.append(power);
      var groupToken = { kind: 'group', body: [] };
      var group = button('括弧グループ', { className: 'formula-operator', label: '括弧グループを式へ挿入' }); group.disabled = disabled; group.addEventListener('click', function () { insertToken(activeOrDefault(), groupToken); }); makePaletteDraggable(group, groupToken); extraOps.append(group);
      ops.append(popup('operators', 'その他の記号', extraOps));
      if (constantCards) ops.append(popup('constants', '補助定数・換算値', constantCards));
      if (!guidedOnly) palette.append(ops);
      host.append(palette);
      renderTasks();
      if (feedback && feedback.message) host.append(el('p', { className: 'formula-feedback formula-feedback-summary', text: feedback.message }));
      if (feedbackAnnouncement) {
        var announcement = el('p', { className: 'formula-feedback-announcement', text: feedbackAnnouncement });
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        host.append(announcement);
        feedbackAnnouncement = '';
      }
      host.append(popup('help', guidedOnly ? '空欄の埋め方' : '式の組み立て方', el('p', { text: guidedOnly
        ? '左の指数には1つ少ないビット数、中央には問題の段階数、右の指数には足りるビット数を入力します。「∴」は「したがって」の意味です。最後の空欄に必要な最小ビット数を入れて「判定」を押してください。数値は直接入力するほか、空欄を選んでカードを押すか、カードをドラッグして入れられます。'
        : '空欄や部品の間を選び、数値や記号をクリックして挿入します。ドラッグ中は自然な挿入先を濃く、修正用の候補を淡く示します。部品を選ぶと右上の×で削除でき、「選択を移動」で挿入先を選べます。数値をドラッグすると右上に指数の入力先が現れます。タップ・キーボードで指数を入れる場合は「その他の記号」の「指数」を使います。＝で答え欄を開き、自分で計算して入力してから隣の「判定」を押します。答え欄のつまみは、ドラッグのほか、クリック・タップ・Enterで選んでから後の式の挿入位置を選ぶ操作でも使えます。Tabと矢印で位置を選び、Enterで操作、Deleteで削除、Escで取り消します。分数や式の途中の等号は「その他の記号」から開きます。' })));
      host.classList.toggle('is-picking-reference', !!pendingReference);
      if (pendingReference) {
        host.append(el('p', { className: 'formula-reference-guide', text: '後の式の挿入位置を選択してください。Escで取り消せます。行がない場合は「途中式を追加」で増やせます。' }));
        refreshDropHints();
      }
      dispatchResize();
      restoreFocus(focusTarget);
      if (moving && !focusTarget) { var firstSlot = host.querySelector('[data-formula-slot]'); if (firstSlot) { try { firstSlot.focus({ preventScroll: true }); } catch (_) { firstSlot.focus(); } } }
    }
    function getDraft() {
      var draft = copy(state);
      draft.rows.forEach(function (row) {
        if (!taskForRow(row)) return;
        var source = enteredResult(row);
        // 採点APIとの互換性を保つため、参照される最終回答だけを投影する。
        // 比較式自体の真偽は投影しない。教材側で宣言した結論数量は
        // 手入力値として投影し、その根拠の妥当性を判定時に検証する。
        row.result = referencesTo(row.id) ? source.result : '';
        row.resultUnit = referencesTo(row.id) ? source.resultUnit : '';
      });
      return draft;
    }
    function setDraft(draft) {
      var incoming = draft && typeof draft === 'object' ? draft : {};
      state.rows = Array.isArray(incoming.rows) && incoming.rows.length ? incoming.rows.slice(0, MAX_ROWS).map(function (row) { return { id: String(row.id || makeId()), taskId: row.taskId == null ? null : String(row.taskId), tokens: normalTokens(row.tokens), result: String(row.result == null ? '' : row.result), resultUnit: String(row.resultUnit || ''), answerOpen: !!row.answerOpen }; }) : initialRows();
      state.answers = incoming.answers && typeof incoming.answers === 'object' ? copy(incoming.answers) : {};
      state.targets = incoming.targets && typeof incoming.targets === 'object' ? copy(incoming.targets) : {};
      // 旧draftにはtaskIdがないため、各小問の最終式までを同じ欄へ割り当てる。
      state.rows.forEach(function (row, rowIndex) {
        if (row.taskId != null) return;
        var task = tasks.find(function (entry, index) { return state.rows.findIndex(function (candidate) { return candidate.id === state.targets[taskIdFor(entry, index)]; }) >= rowIndex; }) || tasks[tasks.length - 1];
        row.taskId = task ? taskIdFor(task, tasks.indexOf(task)) : '';
      });
      ensureTaskRows();
      state.rows.forEach(function (row) {
        var task = taskForRow(row);
        if (isScaffold(task)) { row.tokens = initialTokens(task, row.tokens); row.answerOpen = true; }
        if (row.result || (task && state.answers[taskIdFor(task, tasks.indexOf(task))])) row.answerOpen = true;
      });
      cancelReference(); endDrag(); scaffoldActive = null; active = null; currentRowId = null; caretVisible = false; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function reset(nextDefinition) {
      if (nextDefinition) { config = nextDefinition; quantities = Array.isArray(config.quantities) ? config.quantities : []; constants = Array.isArray(config.constants) ? config.constants : []; tasks = Array.isArray(config.tasks) ? config.tasks : []; units = config.units || {}; }
      cancelReference(); endDrag(); scaffoldActive = null; state = { rows: initialRows(), answers: {}, targets: {} }; manualValue = ''; manualUnit = ''; manualOpen = false; active = null; currentRowId = null; caretVisible = false; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function setFeedback(nextFeedback) {
      var focusedRow = document.activeElement && document.activeElement.closest('[data-formula-row]');
      var judgedRowId = focusedRow && host.contains(focusedRow) ? focusedRow.dataset.formulaRow : null;
      // 小問別判定でも、直前に確認した別小問の表示を残す。式を編集した
      // 場合はinputChanged/updateで全解除し、古い判定を使い回さない。
      if (nextFeedback && feedback) {
        var previous = feedback;
        feedback = Object.assign({}, nextFeedback);
        ['tasks', 'rows'].forEach(function (key) {
          var merged = new Map((previous[key] || []).map(function (item) { return [String(item.id), item]; }));
          (nextFeedback[key] || []).forEach(function (item) { merged.set(String(item.id), item); });
          feedback[key] = Array.from(merged.values());
        });
      } else feedback = nextFeedback || null;
      feedbackAnnouncement = feedback ? (feedback.status === 'judged' ? '立式と答えの判定結果を表示しました。' : '式の確認結果を表示しました。') : '';
      render();
      if (judgedRowId) {
        var judge = Array.from(host.querySelectorAll('[data-formula-judge]')).find(function (node) { return node.dataset.formulaJudge === judgedRowId; });
        if (judge) judge.focus({ preventScroll: true });
      }
    }
    function setDisabled(nextDisabled) { disabled = !!nextDisabled; cancelReference(); endDrag(); render(); }
    function destroy() {
      cancelReference(); endDrag(); closePopup();
      host.removeEventListener('keydown', lockSlideKeys);
      document.removeEventListener('pointerdown', clearInactiveSelection); document.removeEventListener('focusin', clearInactiveSelection);
      document.removeEventListener('dragend', endDrag); window.removeEventListener('blur', clearInactiveSelection);
      document.removeEventListener('pointerdown', dismissPopup); document.removeEventListener('joho:overlay-open', dismissOtherOverlay);
      document.removeEventListener('keydown', popupEscape, true);
      document.removeEventListener('joho:lesson-slide-change', closePopup); document.removeEventListener('fullscreenchange', closePopup);
      window.removeEventListener('resize', positionPopup); document.removeEventListener('scroll', positionPopup, true);
      host.replaceChildren(); host.classList.remove('lesson-formula-builder', 'is-disabled'); delete host.dataset.formulaBuilder; delete host.dataset.lessonSlideNavigationLock;
    }
    render();
    return { getDraft: getDraft, setDraft: setDraft, reset: reset, setFeedback: setFeedback, setDisabled: setDisabled, destroy: destroy };
  }
  window.LessonFormulaBuilder = { mount: mount };
}());
