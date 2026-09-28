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
    var selected = null;
    var drag = null;
    var feedback = null;
    var feedbackAnnouncement = '';
    var undo = [];
    var redo = [];
    var moving = null;
    var constantsOpen = false;
    var referenceChoices = {};
    var manualValue = '';
    var manualUnit = '';
    var state = { rows: initialRows(), answers: {}, targets: {} };

    host.classList.add('lesson-formula-builder');
    host.dataset.formulaBuilder = 'true';
    host.setAttribute('data-lesson-slide-navigation-lock', '');
    host.addEventListener('keydown', lockSlideKeys);

    function initialRows() {
      var count = Math.max(1, Math.min(2, tasks.length || 1));
      return Array.from({ length: count }, function () { return { id: makeId(), tokens: [], result: '', resultUnit: '' }; });
    }
    function cloneDraft() { return copy(state); }
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
    function descendant(source, destination) {
      if (source.rowId !== destination.rowId) return false;
      var root = source.path.concat(source.index);
      return destination.path.length >= root.length && root.every(function (part, index) { return destination.path[index] === part; });
    }
    function pushHistory() { undo.push(cloneDraft()); if (undo.length > 80) undo.shift(); redo = []; }
    function inputChanged() {
      feedback = null; feedbackAnnouncement = '';
      host.querySelectorAll('.formula-feedback, .formula-feedback-announcement').forEach(function (node) { node.remove(); });
      var back = host.querySelector('[data-formula-action="undo"]');
      var forward = host.querySelector('[data-formula-action="redo"]');
      if (back) back.disabled = disabled || !undo.length;
      if (forward) forward.disabled = disabled || !redo.length;
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
    function changed() {
      normalizeLocations();
      render(active ? { kind: 'slot', location: active } : selected ? { kind: 'token', location: selected } : { kind: 'slot', location: makeSlot(state.rows[0].id, [], 0) });
      if (typeof options.onChange === 'function') options.onChange(getDraft());
    }
    function update(mutator) { if (disabled) return; pushHistory(); mutator(); feedback = null; feedbackAnnouncement = ''; changed(); }
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
      var label = '↳ ' + (source && source.result ? displayNumber(source.result) : '前の行の結果') + (source && source.resultUnit ? ' ' + displayUnit(source.resultUnit) : '');
      host.querySelectorAll('[data-formula-reference]').forEach(function (node) { if (node.dataset.formulaReference === rowId) node.textContent = label; });
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
      if (!referencesAreValidInRow(token, slot.rowId)) return;
      update(function () { target.splice(slot.index, 0, copy(token)); active = makeSlot(slot.rowId, slot.path, slot.index + 1); selected = null; });
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
        selected = null;
      });
      return true;
    }
    function removeToken(location) {
      var row = location && rowById(location.rowId);
      var list = row && arrayFor(row, location.path);
      if (!list || !list[location.index] || disabled) return;
      update(function () { list.splice(location.index, 1); selected = null; active = makeSlot(location.rowId, location.path, location.index); });
    }
    function lockSlideKeys(event) {
      var keys = ['ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'PageUp', 'PageDown', ' '];
      if (keys.indexOf(event.key) >= 0 || (event.key === 'Delete' && selected)) event.stopPropagation();
      if (event.key === 'Delete' && selected && !disabled) { event.preventDefault(); removeToken(selected); }
      if (event.key === 'Escape' && moving) { event.preventDefault(); event.stopPropagation(); selected = moving; moving = null; render({ kind: 'token', location: selected }); }
      else if (event.key === 'Escape' && selected) { var previous = selected; selected = null; render({ kind: 'token', location: previous }); }
    }
    function activeOrDefault() {
      if (slotIsValid(active)) return active;
      var row = state.rows[state.rows.length - 1];
      return makeSlot(row.id, [], row.tokens.length);
    }
    function displayUnit(unit) { return units[unit] && units[unit].label ? units[unit].label : unit || '単位なし'; }
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
      var node = findFormulaNode(target.kind, target.location);
      if (node) { try { node.focus({ preventScroll: true }); } catch (_) { node.focus(); } }
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
      var node = button(text || 'ここへ挿入', { className: 'formula-slot', label: 'この位置へ挿入', dataset: { formulaSlot: encode(slot) } });
      if (active && active.rowId === slot.rowId && samePath(active.path, slot.path) && active.index === slot.index) node.classList.add('is-active');
      if (moving) { node.classList.add('is-move-target'); node.setAttribute('aria-label', '選択した部品をこの位置へ移動'); }
      node.addEventListener('click', function (event) {
        event.stopPropagation();
        if (moving) {
          var source = moving;
          moving = null;
          if (!moveToken(source, slot)) moving = source;
          return;
        }
        active = slot; selected = null; render({ kind: 'slot', location: slot });
      });
      node.addEventListener('keydown', function (event) {
        var delta = event.key === 'ArrowLeft' || event.key === 'ArrowUp' ? -1 : event.key === 'ArrowRight' || event.key === 'ArrowDown' ? 1 : 0;
        if (!delta) return;
        event.preventDefault(); event.stopPropagation();
        var slots = Array.from(host.querySelectorAll('[data-formula-slot]'));
        var next = slots[slots.indexOf(node) + delta];
        if (next) {
          active = decode(next.dataset.formulaSlot); selected = null;
          host.querySelectorAll('.formula-slot.is-active').forEach(function (item) { item.classList.remove('is-active'); });
          next.classList.add('is-active');
          try { next.focus({ preventScroll: true }); } catch (_) { next.focus(); }
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
        node = el('span', { className: 'formula-token formula-reference', text: refRow ? '↳ ' + (refRow.result ? displayNumber(refRow.result) : '前の行の結果') + (refRow.resultUnit ? ' ' + displayUnit(refRow.resultUnit) : '') : '↳ 前の行の結果', label: '前の行の手入力結果を参照' });
        node.dataset.formulaReference = token.rowId;
      } else {
        var visible = tokenLabel(token);
        var accessible = token.kind === 'value' && token.label ? token.label + '：' + visible : visible;
        node = el('span', { className: 'formula-token formula-' + token.kind, text: visible, label: accessible + '。クリックで選択' });
        if (token.kind === 'value' && token.label) node.title = token.label;
      }
      node.tabIndex = disabled ? -1 : 0;
      node.setAttribute('role', ['fraction', 'power', 'group'].indexOf(token.kind) >= 0 ? 'group' : 'button');
      node.draggable = !disabled;
      node.dataset.formulaToken = encode(location);
      if (selected && selected.rowId === location.rowId && samePath(selected.path, location.path) && selected.index === location.index) node.classList.add('is-selected');
      node.addEventListener('click', function (event) { event.stopPropagation(); selected = location; active = null; render({ kind: 'token', location: location }); });
      node.addEventListener('keydown', function (event) {
        if (event.target !== node || disabled) return;
        if (event.key === 'Enter' || event.key === ' ') {
          event.stopPropagation(); event.preventDefault(); selected = location; active = null; render({ kind: 'token', location: location });
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
      group.append(slotNode(makeSlot(row.id, path, 0), '＋'));
      list.forEach(function (token, index) {
        group.append(tokenNode(token, { rowId: row.id, path: path.slice(), index: index }, row));
        group.append(slotNode(makeSlot(row.id, path, index + 1), '＋'));
      });
      return group;
    }
    function paletteCard(item, type) {
      var label = item.label || item.id || item.value;
      var amount = (item.value != null ? displayNumber(item.value) : '') + (item.unit ? ' ' + displayUnit(item.unit) : '');
      var text = label + (amount ? ' ' + amount : '');
      var card = button('', { className: 'formula-palette-card', label: text + 'を式へ挿入', dataset: type === 'quantity' ? { formulaQuantity: item.id } : { formulaConstant: item.id } });
      card.append(el('span', { className: 'formula-card-label', text: label }));
      card.append(el('span', { className: 'formula-card-value', text: amount }));
      card.disabled = disabled;
      var token = { kind: 'value', value: String(item.value == null ? '' : item.value), unit: String(item.unit || ''), label: item.label };
      card.addEventListener('click', function () { insertToken(activeOrDefault(), token); });
      makePaletteDraggable(card, token);
      return card;
    }
    function operatorCard(operator) {
      var labels = { '+': '＋', '-': '－', '×': '×', '÷': '÷', '=': '＝', '(': '(', ')': ')', '<': '<', '<=': '≤', '>': '>', '>=': '≥' };
      var card = button(labels[operator], { className: 'formula-operator', label: labels[operator] + 'を式へ挿入', dataset: { formulaOperator: operator } });
      card.disabled = disabled;
      var token = { kind: 'operator', value: operator };
      card.addEventListener('click', function () { insertToken(activeOrDefault(), token); });
      makePaletteDraggable(card, token);
      return card;
    }
    function unitSelect(value, label, dataset) {
      var select = el('select', { label: label, dataset: dataset });
      select.append(el('option', { value: '', text: displayUnit('') }));
      Object.keys(units).filter(function (id) { return id !== ''; }).forEach(function (id) { select.append(el('option', { value: id, text: displayUnit(id) })); });
      if (value && !units[value]) select.append(el('option', { value: value, text: value }));
      select.value = value || '';
      return select;
    }
    function controlButton(text, action, label) {
      var node = button(text, { className: 'formula-control', label: label || text, dataset: { formulaAction: action } });
      node.disabled = disabled || (action === 'undo' && !undo.length) || (action === 'redo' && !redo.length) || (action === 'move' && !selected);
      node.addEventListener('click', function () {
        if (action === 'undo' && undo.length) { redo.push(cloneDraft()); state = undo.pop(); feedback = null; feedbackAnnouncement = ''; changed(); }
        if (action === 'redo' && redo.length) { undo.push(cloneDraft()); state = redo.pop(); feedback = null; feedbackAnnouncement = ''; changed(); }
        if (action === 'delete' && selected) removeToken(selected);
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
      return el('p', { className: 'formula-feedback ' + (item.calculationCorrect === false || item.formulaCorrect === false || item.answerCorrect === false ? 'is-error' : 'is-ok'), text: messages.join(' ') || fallback });
    }
    function renderRow(row, index) {
      var box = el('section', { className: 'formula-row', dataset: { formulaRow: row.id } });
      var heading = el('div', { className: 'formula-row-heading' });
      heading.append(el('h4', { text: '式 ' + (index + 1) }));
      var remove = button('行を削除', { className: 'formula-row-remove', label: '式 ' + (index + 1) + ' を削除' });
      remove.disabled = disabled || state.rows.length === 1 || referencesTo(row.id);
      if (referencesTo(row.id)) remove.title = 'この行を参照している式があるため削除できません。';
      remove.addEventListener('click', function () { update(function () { state.rows = state.rows.filter(function (entry) { return entry.id !== row.id; }); Object.keys(state.targets).forEach(function (taskId) { if (state.targets[taskId] === row.id) state.targets[taskId] = state.rows[0].id; }); }); });
      heading.append(remove);
      box.append(heading);
      var formula = el('div', { className: 'formula-expression', label: '式 ' + (index + 1) + '。挿入位置を選択して部品を追加します。' });
      formula.append(renderTokenList(row, row.tokens, [], '式 ' + (index + 1)));
      box.append(formula);
      var result = el('div', { className: 'formula-row-result' });
      result.append(el('label', { text: '式の結果（手入力・次の式で使う場合）' }));
      var value = el('input', { type: 'text', value: row.result, label: '式 ' + (index + 1) + ' の手入力結果', dataset: { formulaResult: row.id } });
      value.disabled = disabled;
      value.addEventListener('focus', function () { if (!disabled) pushHistory(); });
      value.inputMode = 'decimal';
      value.addEventListener('input', function () { row.result = value.value; updateReferenceLabels(row.id); inputChanged(); });
      result.append(value);
      var unit = unitSelect(row.resultUnit, '式 ' + (index + 1) + ' の結果の単位', { formulaResultUnit: row.id });
      unit.disabled = disabled;
      unit.addEventListener('focus', function () { if (!disabled) pushHistory(); });
      unit.addEventListener('change', function () { row.resultUnit = unit.value; updateReferenceLabels(row.id); inputChanged(); });
      result.append(unit);
      if (index > 0) {
        var referenceSource = el('select', { label: '参照する前の式', dataset: { formulaReferenceSource: row.id } });
        state.rows.slice(0, index).forEach(function (prior, priorIndex) { referenceSource.append(el('option', { value: prior.id, text: '式 ' + (priorIndex + 1) + ' の結果' })); });
        referenceSource.value = validReference(row.id, referenceChoices[row.id]) ? referenceChoices[row.id] : state.rows[index - 1].id;
        referenceSource.addEventListener('change', function () { referenceChoices[row.id] = referenceSource.value; });
        referenceSource.disabled = disabled;
        result.append(el('label', { className: 'formula-reference-label', text: '参照する式' }));
        result.append(referenceSource);
        var reference = button('選んだ式の結果を挿入', { className: 'formula-reference-card', label: '選んだ前の式の手入力結果を参照として挿入' });
        reference.disabled = disabled;
        reference.addEventListener('click', function () {
          var destination = active && active.rowId === row.id && slotIsValid(active) ? active : makeSlot(row.id, [], row.tokens.length);
          insertToken(destination, { kind: 'reference', rowId: referenceSource.value });
        });
        result.append(reference);
      }
      box.append(result);
      var rowFeedback = feedbackFor(feedback && feedback.rows, row.id);
      var message = statusNode(rowFeedback);
      if (message) box.append(message);
      return box;
    }
    function renderAnswers(root) {
      if (!tasks.length) return;
      var section = el('section', { className: 'formula-answers' });
      section.append(el('h4', { text: '小問の最終回答（手入力）' }));
      tasks.forEach(function (task, index) {
        var item = el('div', { className: 'formula-answer-item' });
        var taskId = String(task.id || index);
        item.append(el('label', { text: task.label || '小問 ' + (index + 1) }));
        var answer = el('input', { type: 'text', value: state.answers[taskId] || '', label: (task.label || '小問') + ' の最終回答', dataset: { formulaAnswer: taskId } });
        answer.disabled = disabled;
        answer.addEventListener('focus', function () { if (!disabled) pushHistory(); });
        answer.inputMode = 'decimal';
        answer.addEventListener('input', function () { state.answers[taskId] = answer.value; inputChanged(); });
        item.append(answer);
        item.append(el('span', { className: 'formula-answer-unit', text: task.answerUnitLabel || task.answerUnit || '単位なし' }));
        var target = el('select', { label: (task.label || '小問') + ' の採点対象の式' });
        state.rows.forEach(function (row, rowIndex) { var option = el('option', { value: row.id, text: '式 ' + (rowIndex + 1) }); target.append(option); });
        if (!state.targets[taskId] || !rowById(state.targets[taskId])) state.targets[taskId] = state.rows[Math.min(index, state.rows.length - 1)].id;
        target.value = state.targets[taskId]; target.disabled = disabled;
        target.addEventListener('change', function () { if (disabled) return; pushHistory(); state.targets[taskId] = target.value; inputChanged(); });
        item.append(el('label', { className: 'formula-target-label', text: '採点対象の式' })); item.append(target);
        var itemFeedback = feedbackFor(feedback && feedback.tasks, taskId);
        var note = statusNode(itemFeedback);
        if (note) item.append(note);
        section.append(item);
      });
      root.append(section);
    }
    function render(focusTarget) {
      host.replaceChildren();
      host.classList.toggle('is-disabled', disabled);
      var toolbar = el('div', { className: 'formula-toolbar' });
      toolbar.append(controlButton('↶ 元に戻す', 'undo'));
      toolbar.append(controlButton('↷ やり直す', 'redo'));
      toolbar.append(controlButton('選択を移動', 'move'));
      toolbar.append(controlButton('選択を削除', 'delete'));
      host.append(toolbar);
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
      manual.append(el('label', { text: '自由入力の数値' }));
      var manualInput = el('input', { type: 'text', value: manualValue, label: '自由入力の数値' }); manualInput.placeholder = '例: 8'; manualInput.disabled = disabled; manualInput.inputMode = 'decimal';
      manual.append(manualInput);
      var manualUnitInput = unitSelect(manualUnit, '自由入力の単位', { formulaManualUnit: 'true' }); manualUnitInput.disabled = disabled;
      manualUnitInput.addEventListener('change', function () { manualUnit = manualUnitInput.value; }); manual.append(manualUnitInput);
      var insertManual = button('数値を挿入', { className: 'formula-palette-card', label: '自由入力の数値を式へ挿入' }); insertManual.disabled = disabled || !manualValue;
      manualInput.addEventListener('input', function () { manualValue = manualInput.value; insertManual.disabled = disabled || !manualValue; });
      insertManual.addEventListener('click', function () { if (manualValue) insertToken(activeOrDefault(), { kind: 'value', value: manualValue, unit: manualUnit }); });
      insertManual.draggable = !disabled;
      insertManual.addEventListener('dragstart', function (event) {
        if (disabled || !manualValue) { event.preventDefault(); return; }
        event.dataTransfer.effectAllowed = 'copy';
        event.dataTransfer.setData('application/x-lesson-formula-new', encode({ kind: 'value', value: manualValue, unit: manualUnit }));
      });
      manual.append(insertManual); palette.append(manual);
      var ops = el('div', { className: 'formula-operators', label: '演算子' });
      ['+', '-', '×', '÷', '=', '(', ')', '<', '<=', '>', '>='].forEach(function (operator) { ops.append(operatorCard(operator)); });
      var fractionToken = { kind: 'fraction', numerator: [], denominator: [] };
      var fraction = button('分数', { className: 'formula-operator', label: '分数を式へ挿入' }); fraction.disabled = disabled; fraction.addEventListener('click', function () { insertToken(activeOrDefault(), fractionToken); }); makePaletteDraggable(fraction, fractionToken); ops.append(fraction);
      var powerToken = { kind: 'power', base: [], exponent: [] };
      var power = button('指数', { className: 'formula-operator', label: '指数を式へ挿入' }); power.disabled = disabled; power.addEventListener('click', function () { insertToken(activeOrDefault(), powerToken); }); makePaletteDraggable(power, powerToken); ops.append(power);
      var groupToken = { kind: 'group', body: [] };
      var group = button('括弧グループ', { className: 'formula-operator', label: '括弧グループを式へ挿入' }); group.disabled = disabled; group.addEventListener('click', function () { insertToken(activeOrDefault(), groupToken); }); makePaletteDraggable(group, groupToken); ops.append(group);
      palette.append(ops); host.append(palette);
      var rows = el('div', { className: 'formula-rows' }); state.rows.forEach(function (row, index) { rows.append(renderRow(row, index)); }); host.append(rows);
      var add = button('＋ 式の行を追加', { className: 'formula-add-row', label: '式の行を追加', dataset: { formulaAddRow: 'true' } }); add.disabled = disabled || state.rows.length >= MAX_ROWS;
      add.addEventListener('click', function () { if (state.rows.length >= MAX_ROWS) return; update(function () { state.rows.push({ id: makeId(), tokens: [], result: '', resultUnit: '' }); active = makeSlot(state.rows[state.rows.length - 1].id, [], 0); }); }); host.append(add);
      renderAnswers(host);
      if (feedback && feedback.message) host.append(el('p', { className: 'formula-feedback formula-feedback-summary', text: feedback.message }));
      if (feedbackAnnouncement) {
        var announcement = el('p', { className: 'formula-feedback-announcement', text: feedbackAnnouncement });
        announcement.setAttribute('role', 'status');
        announcement.setAttribute('aria-live', 'polite');
        announcement.setAttribute('aria-atomic', 'true');
        host.append(announcement);
        feedbackAnnouncement = '';
      }
      var help = el('details', { className: 'formula-help' }); help.append(el('summary', { text: '式の組み立て方' })); help.append(el('p', { text: '＋の位置を選び、カードをクリックして挿入します。式の部品はドラッグで移動できます。分数・指数・括弧の中にも式を入れられます。計算結果と最終回答は自分で入力します。' })); host.append(help);
      dispatchResize();
      restoreFocus(focusTarget);
      if (moving && !focusTarget) { var firstSlot = host.querySelector('[data-formula-slot]'); if (firstSlot) { try { firstSlot.focus({ preventScroll: true }); } catch (_) { firstSlot.focus(); } } }
    }
    function getDraft() { return copy(state); }
    function setDraft(draft) {
      var incoming = draft && typeof draft === 'object' ? draft : {};
      state.rows = Array.isArray(incoming.rows) && incoming.rows.length ? incoming.rows.map(function (row) { return { id: String(row.id || makeId()), tokens: normalTokens(row.tokens), result: String(row.result || ''), resultUnit: String(row.resultUnit || '') }; }) : initialRows();
      state.answers = incoming.answers && typeof incoming.answers === 'object' ? copy(incoming.answers) : {};
      state.targets = incoming.targets && typeof incoming.targets === 'object' ? copy(incoming.targets) : {};
      undo = []; redo = []; active = null; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function reset(nextDefinition) {
      if (nextDefinition) { config = nextDefinition; quantities = Array.isArray(config.quantities) ? config.quantities : []; constants = Array.isArray(config.constants) ? config.constants : []; tasks = Array.isArray(config.tasks) ? config.tasks : []; units = config.units || {}; }
      state = { rows: initialRows(), answers: {}, targets: {} }; undo = []; redo = []; manualValue = ''; manualUnit = ''; constantsOpen = false; referenceChoices = {}; active = null; selected = null; moving = null; feedback = null; feedbackAnnouncement = ''; render();
    }
    function setFeedback(nextFeedback) { feedback = nextFeedback || null; feedbackAnnouncement = feedback ? (feedback.status === 'judged' ? '立式と答えの判定結果を表示しました。' : '式の確認結果を表示しました。') : ''; render(); }
    function setDisabled(nextDisabled) { disabled = !!nextDisabled; render(); }
    function destroy() { host.removeEventListener('keydown', lockSlideKeys); host.replaceChildren(); host.classList.remove('lesson-formula-builder', 'is-disabled'); delete host.dataset.formulaBuilder; delete host.dataset.lessonSlideNavigationLock; }
    render();
    return { getDraft: getDraft, setDraft: setDraft, reset: reset, setFeedback: setFeedback, setDisabled: setDisabled, destroy: destroy };
  }
  window.LessonFormulaBuilder = { mount: mount };
}());
