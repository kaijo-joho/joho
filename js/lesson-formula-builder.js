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
    var drag = null;
    var feedback = null;
    var feedbackAnnouncement = '';
    var moving = null;
    var constantsOpen = false;
    var operatorsOpen = false;
    var manualOpen = false;
    var referenceChoices = {};
    var manualValue = '';
    var manualUnit = '';
    var state = { rows: initialRows(), answers: {}, targets: {} };

    host.classList.add('lesson-formula-builder');
    host.dataset.formulaBuilder = 'true';
    host.setAttribute('data-lesson-slide-navigation-lock', '');
    host.addEventListener('keydown', lockSlideKeys);
    document.addEventListener('pointerdown', clearInactiveSelection);
    document.addEventListener('focusin', clearInactiveSelection);
    window.addEventListener('blur', clearInactiveSelection);

    function initialRows() {
      var count = Math.max(1, Math.min(MAX_ROWS, tasks.length || 1));
      return Array.from({ length: count }, function (_, index) { return { id: makeId(), taskId: tasks[index] ? taskIdFor(tasks[index], index) : '', tokens: [], result: '', resultUnit: '', answerOpen: false }; });
    }
    function taskIdFor(task, index) { return String(task.id == null ? index : task.id); }
    function taskForRow(row) { return tasks.find(function (task, index) { return state.targets[taskIdFor(task, index)] === row.id; }); }
    function rowsForTask(taskId) { return state.rows.filter(function (row) { return row.taskId === taskId; }); }
    function ensureTaskRows() {
      tasks.forEach(function (task, index) {
        var taskId = taskIdFor(task, index);
        var rows = rowsForTask(taskId);
        if (!rows.length) {
          var row = { id: makeId(), taskId: taskId, tokens: [], result: '', resultUnit: '', answerOpen: false };
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
      if (inside && target.closest('[data-formula-row]')) currentRowId = target.closest('[data-formula-row]').dataset.formulaRow;
      if (inside && target.closest('[data-formula-slot], [data-formula-token]')) return;
      // 挿入先の記憶と見た目のカーソルを分離する。再描画しないので、
      // pointerdown 中に押そうとしたボタンや入力欄を消してしまわない。
      caretVisible = false;
      host.querySelectorAll('.formula-slot.is-active').forEach(function (node) { node.classList.remove('is-active'); });
      // Safari/WebKit はボタン押下時に一度外側の main へフォーカスを
      // 移すことがある。focusin で部品を消すと続く click が失われる。
      if (!inside && event.type !== 'focusin') {
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
      if (task.answerIsResult === false) return { result: '', resultUnit: '' };
      return { result: state.answers[taskIdFor(task, tasks.indexOf(task))] || '', resultUnit: task.answerUnit || '' };
    }
    function renderReferenceValue(node, row) {
      var source = enteredResult(row);
      node.replaceChildren(document.createTextNode('↳ '));
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
      var target = row && arrayFor(row, slot.path);
      if (!target) return;
      if (token.kind === 'answer') {
        // 通常の＝は手入力結果の区切りであり、採点する式そのものではない。
        if (row.answerOpen) { restoreFocus({ kind: 'answer', rowId: row.id }); return; }
        update(function () { row.answerOpen = true; currentRowId = row.id; caretVisible = false; selected = null; }, { kind: 'answer', rowId: row.id });
        return;
      }
      if (!referencesAreValidInRow(token, slot.rowId)) return;
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
      if (event.key === 'Escape' && moving) { event.preventDefault(); event.stopPropagation(); selected = moving; moving = null; render({ kind: 'token', location: selected }); }
      else if (event.key === 'Escape' && selected) { event.preventDefault(); event.stopPropagation(); var previous = selected; selected = null; render({ kind: 'token', location: previous }); }
    }
    function activeOrDefault() {
      if (slotIsValid(active)) return active;
      if (tokenIsValid(selected)) return makeSlot(selected.rowId, selected.path, selected.index + 1);
      var row = rowById(currentRowId) || state.rows[0];
      return makeSlot(row.id, [], row.tokens.length);
    }
    function displayUnit(unit) { return units[unit] && units[unit].label ? units[unit].label : unit || '単位なし'; }
    function appendAmount(node, value, unit) {
      node.append(el('span', { className: 'formula-number', text: displayNumber(value) }));
      if (!unit) return;
      var info = units[unit] || {};
      // 換算方向は構造化データに保持し、画面では複雑な比の単位を省略。
      if (info.conversion) {
        node.title = info.conversionLabel || displayUnit(unit);
        node.append(el('small', { className: 'formula-conversion-label', text: info.conversionLabel || '' }));
      } else node.append(el('small', { className: 'formula-unit', text: displayUnit(unit) }));
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
      var selector = kind === 'slot' ? '[data-formula-slot]' : '[data-formula-token]';
      return Array.from(host.querySelectorAll(selector)).find(function (node) {
        var candidate = decode(kind === 'slot' ? node.dataset.formulaSlot : node.dataset.formulaToken);
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
      });
    }

    function slotNode(slot, text) {
      var node = button(text || '', { className: 'formula-slot' + (text ? ' is-empty' : ''), label: 'この位置へ挿入', dataset: { formulaSlot: encode(slot) } });
      node.disabled = disabled;
      if (caretVisible && active && active.rowId === slot.rowId && samePath(active.path, slot.path) && active.index === slot.index) node.classList.add('is-active');
      if (moving) { node.classList.add('is-move-target'); node.setAttribute('aria-label', '選択した部品をこの位置へ移動'); }
      node.addEventListener('click', function (event) {
        event.stopPropagation();
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
        var slots = Array.from(host.querySelectorAll('[data-formula-slot]'));
        var next = slots[slots.indexOf(node) + delta];
        if (next) {
          active = decode(next.dataset.formulaSlot); currentRowId = active.rowId; caretVisible = true; selected = null;
          render({ kind: 'slot', location: active });
        }
      });
      node.addEventListener('dragover', function (event) { if (!disabled) { event.preventDefault(); node.classList.add('is-dragover'); } });
      node.addEventListener('dragleave', function () { node.classList.remove('is-dragover'); });
      node.addEventListener('drop', function (event) { event.preventDefault(); event.stopPropagation(); node.classList.remove('is-dragover'); var fresh = decode(event.dataTransfer.getData('application/x-lesson-formula-new')); var source = decode(event.dataTransfer.getData('application/x-lesson-formula')); if (fresh) insertToken(slot, fresh); else moveToken(source || drag, slot); drag = null; });
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
      if (!disabled && selected && selected.rowId === location.rowId && samePath(selected.path, location.path) && selected.index === location.index) {
        node.classList.add('is-selected');
        var remove = button('×', { className: 'formula-token-remove', label: tokenLabel(token) + 'を削除' });
        remove.draggable = false;
        remove.addEventListener('click', function (event) { event.stopPropagation(); removeToken(location); });
        remove.addEventListener('dragstart', function (event) { event.preventDefault(); event.stopPropagation(); });
        node.append(remove);
      }
      node.addEventListener('click', function (event) { event.stopPropagation(); if (disabled) return; selected = location; currentRowId = row.id; caretVisible = false; active = null; render({ kind: 'token', location: location }); });
      node.addEventListener('keydown', function (event) {
        if (event.target !== node || disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation(); event.preventDefault(); selected = location; currentRowId = row.id; caretVisible = false; active = null; render({ kind: 'token', location: location });
        } else if (event.key === 'Delete' || event.key === 'Backspace') {
          event.stopPropagation(); event.preventDefault(); removeToken(location);
        }
      });
      node.addEventListener('dragstart', function (event) { event.stopPropagation(); drag = location; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('application/x-lesson-formula', encode(location)); });
      node.addEventListener('dragend', function (event) { event.stopPropagation(); drag = null; });
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
      var value = el('span', { className: 'formula-card-value' });
      appendAmount(value, item.value, item.unit); card.append(value);
      card.disabled = disabled;
      var token = { kind: 'value', value: String(item.value == null ? '' : item.value), unit: String(item.unit || ''), label: item.label };
      card.addEventListener('click', function () { insertToken(activeOrDefault(), token); });
      makePaletteDraggable(card, token);
      return card;
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
      var used = quantities.concat(constants).map(function (item) { return item.unit; }).concat(tasks.map(function (task) { return task.answerUnit; }));
      if (used.some(function (id) { return /^(bit|B|KB|MB|KiB|MiB)/.test(id); })) used = used.concat(['bit', 'B', 'B/sample', 'B/s']);
      if (used.indexOf('MB') >= 0) used.push('B/MB');
      var ordinary = Object.keys(units).filter(function (id) { return id && !units[id].conversion && (!limited || id === value || used.indexOf(id) >= 0); });
      ordinary.forEach(function (id) { select.append(el('option', { value: id, text: displayUnit(id) })); });
      var directions = used.map(function (id) { return units[id] && units[id].conversionLabel; }).filter(Boolean);
      // ÷1000 と ×(1/1000) のような逆数表現も、単位候補を絞ることで
      // 入力不能にしない。同じ換算方向の掛ける値・割る値を残す。
      var conversions = Object.keys(units).filter(function (id) { return units[id].conversion && (!limited || id === value || used.indexOf(id) >= 0 || directions.indexOf(units[id].conversionLabel) >= 0); });
      if (conversions.length) {
        var group = el('optgroup'); group.label = '換算として使う';
        conversions.forEach(function (id) {
          group.append(el('option', { value: id, text: (units[id].conversionLabel || displayUnit(id)) + (units[id].conversionOperation ? '（' + units[id].conversionOperation + '値）' : '') }));
        });
        select.append(group);
      }
      if (value && !units[value]) select.append(el('option', { value: value, text: value }));
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
    function renderRow(row, index) {
      var task = taskForRow(row);
      var box = el('section', { className: 'formula-row', dataset: { formulaRow: row.id } });
      var heading = el('div', { className: 'formula-row-heading' });
      heading.append(el('span', { className: 'formula-row-label', text: (task ? '式 ' : '途中式 ') + (index + 1) }));
      if (!task) {
        var remove = button('×', { className: 'formula-row-remove', label: '式 ' + (index + 1) + ' を削除' });
        remove.disabled = disabled || state.rows.length === 1 || referencesTo(row.id);
        if (referencesTo(row.id)) remove.title = 'この行を参照している式があるため削除できません。';
        remove.addEventListener('click', function () { update(function () { state.rows = state.rows.filter(function (entry) { return entry.id !== row.id; }); }); });
        heading.append(remove);
      }
      box.append(heading);
      var formula = el('div', { className: 'formula-expression', label: '式 ' + (index + 1) + '。挿入位置を選択して部品を追加します。' });
      formula.append(renderTokenList(row, row.tokens, [], '式 ' + (index + 1)));
      box.append(formula);
      if (row.answerOpen) box.append(renderResult(row, task, index));
      if (selected && selected.rowId === row.id && !disabled) box.append(controlButton('選択を移動', 'move'));
      if (index > 0) {
        var references = el('div', { className: 'formula-row-references' });
        var referenceSource = el('select', { label: '参照する前の式', dataset: { formulaReferenceSource: row.id } });
        state.rows.slice(0, index).forEach(function (prior, priorIndex) { referenceSource.append(el('option', { value: prior.id, text: '式 ' + (priorIndex + 1) + ' の結果' })); });
        referenceSource.value = validReference(row.id, referenceChoices[row.id]) ? referenceChoices[row.id] : state.rows[index - 1].id;
        referenceSource.addEventListener('change', function () { referenceChoices[row.id] = referenceSource.value; });
        referenceSource.disabled = disabled;
        references.append(referenceSource);
        var reference = button('この結果を使う', { className: 'formula-reference-card', label: '選んだ前の式の手入力結果を参照として挿入' });
        reference.disabled = disabled;
        reference.addEventListener('click', function () {
          var destination = active && active.rowId === row.id && slotIsValid(active) ? active : makeSlot(row.id, [], row.tokens.length);
          insertToken(destination, { kind: 'reference', rowId: referenceSource.value });
        });
        references.append(reference);
        box.append(references);
      }
      var rowFeedback = feedbackFor(feedback && feedback.rows, row.id);
      var message = statusNode(rowFeedback);
      if (message) box.append(message);
      return box;
    }
    function renderResult(row, task, index) {
      var item = el('div', { className: task ? 'formula-answer-item' : 'formula-row-result' });
      var taskId = task ? taskIdFor(task, tasks.indexOf(task)) : row.taskId;
      var source = el('span', { className: 'formula-result-source', dataset: { formulaResultSource: row.id } });
      var answer = el('input', { type: 'text', value: task ? state.answers[taskId] || '' : row.result, label: task ? (task.label || '小問') + ' の最終回答' : '式 ' + (index + 1) + ' の手入力結果', dataset: task ? { formulaAnswer: taskId } : { formulaResult: row.id } });
      answer.placeholder = '自分で計算して入力'; answer.disabled = disabled; answer.inputMode = 'decimal';
      item.append(el('span', { className: 'formula-answer-equals', text: task && task.answerIsResult === false ? '⇒ 答え' : '＝' }));
      source.append(answer);
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
        var canDrag = (!task || task.answerIsResult !== false) && !!answer.value.trim() && Number.isFinite(Number(answer.value.replace(/,/g, '')));
        source.draggable = canDrag; answer.draggable = canDrag;
        source.classList.toggle('is-draggable', canDrag);
        source.title = canDrag ? 'この答えを後の式へドラッグして使えます' : '';
      }
      answer.addEventListener('input', function () {
        if (task) state.answers[taskId] = answer.value; else row.result = answer.value;
        refreshEntryControls(); updateReferenceLabels(row.id); inputChanged();
      });
      source.addEventListener('dragstart', function (event) {
        if (!source.draggable || event.target.closest('select')) { event.preventDefault(); return; }
        event.stopPropagation(); event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-lesson-formula-new', encode({ kind: 'reference', rowId: row.id }));
      });
      judge.addEventListener('click', function () {
        if (!disabled && typeof options.onJudge === 'function') options.onJudge({ rowId: row.id, taskId: taskId, intermediate: !task, draft: getDraft() });
      });
      refreshEntryControls(); item.append(judge);
      if (task) {
        var note = statusNode(feedbackFor(feedback && feedback.tasks, taskId));
        if (note) item.append(note);
      }
      return item;
    }
    function addRowButton(taskId) {
      var add = button('途中式を追加', { className: 'formula-add-row', label: '式の行を追加', dataset: { formulaAddRow: taskId } });
      add.disabled = disabled || state.rows.length >= MAX_ROWS;
      add.addEventListener('click', function () {
        if (state.rows.length >= MAX_ROWS) return;
        update(function () {
          var row = { id: makeId(), taskId: taskId, tokens: [], result: '', resultUnit: '', answerOpen: false };
          var targetIndex = state.rows.findIndex(function (entry) { return entry.id === state.targets[taskId]; });
          state.rows.splice(targetIndex < 0 ? state.rows.length : targetIndex, 0, row);
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
        group.append(rows); group.append(addRowButton(taskId)); groups.append(group);
      });
      host.append(groups);
    }
    function render(focusTarget) {
      ensureTaskRows();
      host.replaceChildren();
      host.classList.toggle('is-disabled', disabled);
      var palette = el('section', { className: 'formula-palette' });
      palette.append(el('h4', { text: '問題の数値' }));
      var cards = el('div', { className: 'formula-palette-cards' });
      quantities.forEach(function (item) { cards.append(paletteCard(item, 'quantity')); });
      palette.append(cards);
      if (constants.length) {
        var constantDetails = el('details', { className: 'formula-constants' });
        constantDetails.open = constantsOpen;
        constantDetails.addEventListener('toggle', function () { constantsOpen = constantDetails.open; });
        constantDetails.append(el('summary', { text: '補助定数・換算値を開く' }));
        var constantCards = el('div', { className: 'formula-palette-cards formula-constant-cards' });
        constants.forEach(function (item) { constantCards.append(paletteCard(item, 'constant')); });
        constantDetails.append(constantCards);
        palette.append(constantDetails);
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
      var manualUnitInput = unitSelect(manualUnit, '自由入力の単位・換算方向', { formulaManualUnit: 'true' }, true); manualUnitInput.disabled = disabled;
      manualUnitInput.addEventListener('change', function () { manualUnit = manualUnitInput.value; }); manualOptions.append(manualUnitInput);
      var insertManual = button('数値を挿入', { className: 'formula-palette-card', label: '自由入力の数値を式へ挿入' }); insertManual.disabled = disabled || !manualValue;
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
      });
      manualOptions.append(insertManual); manual.append(manualOptions); cards.append(manual);
      var ops = el('div', { className: 'formula-operators', label: '演算子' });
      ['+', '-', '×', '÷', '='].forEach(function (operator) { ops.append(operatorCard(operator)); });
      var more = el('details', { className: 'formula-more-operators' });
      more.open = operatorsOpen;
      more.addEventListener('toggle', function () { operatorsOpen = more.open; dispatchResize(); });
      more.append(el('summary', { text: 'その他の記号' }));
      var extraOps = el('div', { className: 'formula-operators' });
      ['(', ')', '<', '<=', '>', '>='].forEach(function (operator) { extraOps.append(operatorCard(operator)); });
      extraOps.append(operatorCard('=', true));
      var fractionToken = { kind: 'fraction', numerator: [], denominator: [] };
      var fraction = button('分数', { className: 'formula-operator', label: '分数を式へ挿入' }); fraction.disabled = disabled; fraction.addEventListener('click', function () { insertToken(activeOrDefault(), fractionToken); }); makePaletteDraggable(fraction, fractionToken); extraOps.append(fraction);
      var powerToken = { kind: 'power', base: [], exponent: [] };
      var power = button('指数', { className: 'formula-operator', label: '指数を式へ挿入' }); power.disabled = disabled; power.addEventListener('click', function () { insertToken(activeOrDefault(), powerToken); }); makePaletteDraggable(power, powerToken); extraOps.append(power);
      var groupToken = { kind: 'group', body: [] };
      var group = button('括弧グループ', { className: 'formula-operator', label: '括弧グループを式へ挿入' }); group.disabled = disabled; group.addEventListener('click', function () { insertToken(activeOrDefault(), groupToken); }); makePaletteDraggable(group, groupToken); extraOps.append(group);
      more.append(extraOps); ops.append(more); palette.append(ops); host.append(palette);
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
      var help = el('details', { className: 'formula-help' }); help.append(el('summary', { text: '式の組み立て方' })); help.append(el('p', { text: '空欄や部品の間を選び、数値や記号をクリックして挿入します。ドラッグでも挿入・移動できます。部品を選ぶと右上の×で削除でき、「選択を移動」で挿入先を選べます。Tabと矢印で位置を選び、Enterで操作、Deleteで削除、Escで選択を解除できます。＝で答え欄を開き、自分で計算して入力してから隣の「判定」を押します。入力した答えは後の式へドラッグして使えます（タップ・キーボードでは「この結果を使う」）。分数・指数や式の途中の等号は「その他の記号」から開きます。' })); host.append(help);
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
        // 比較式の答えは式自体の数値結果ではないので投影しない。
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
        if (row.result || (task && state.answers[taskIdFor(task, tasks.indexOf(task))])) row.answerOpen = true;
      });
      active = null; currentRowId = null; caretVisible = false; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function reset(nextDefinition) {
      if (nextDefinition) { config = nextDefinition; quantities = Array.isArray(config.quantities) ? config.quantities : []; constants = Array.isArray(config.constants) ? config.constants : []; tasks = Array.isArray(config.tasks) ? config.tasks : []; units = config.units || {}; }
      state = { rows: initialRows(), answers: {}, targets: {} }; manualValue = ''; manualUnit = ''; manualOpen = false; constantsOpen = false; operatorsOpen = false; referenceChoices = {}; active = null; currentRowId = null; caretVisible = false; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function setFeedback(nextFeedback) {
      var focusedRow = document.activeElement && document.activeElement.closest('[data-formula-row]');
      var judgedRowId = focusedRow && host.contains(focusedRow) ? focusedRow.dataset.formulaRow : null;
      feedback = nextFeedback || null;
      feedbackAnnouncement = feedback ? (feedback.status === 'judged' ? '立式と答えの判定結果を表示しました。' : '式の確認結果を表示しました。') : '';
      render();
      if (judgedRowId) {
        var judge = Array.from(host.querySelectorAll('[data-formula-judge]')).find(function (node) { return node.dataset.formulaJudge === judgedRowId; });
        if (judge) judge.focus({ preventScroll: true });
      }
    }
    function setDisabled(nextDisabled) { disabled = !!nextDisabled; render(); }
    function destroy() { host.removeEventListener('keydown', lockSlideKeys); document.removeEventListener('pointerdown', clearInactiveSelection); document.removeEventListener('focusin', clearInactiveSelection); window.removeEventListener('blur', clearInactiveSelection); host.replaceChildren(); host.classList.remove('lesson-formula-builder', 'is-disabled'); delete host.dataset.formulaBuilder; delete host.dataset.lessonSlideNavigationLock; }
    render();
    return { getDraft: getDraft, setDraft: setDraft, reset: reset, setFeedback: setFeedback, setDisabled: setDisabled, destroy: destroy };
  }
  window.LessonFormulaBuilder = { mount: mount };
}());
