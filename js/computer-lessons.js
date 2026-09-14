/* cp11・cp12固有の教材操作。スライド・タブ・dialogは共通基盤に任せる。 */
(function () {
  'use strict';
  const core = window.ComputerCore;
  if (!core) return;
  function element(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }
  function button(text, action, className = 'cp-button') {
    const node = element('button', className, text);
    node.type = 'button';
    node.addEventListener('click', action);
    return node;
  }
  function machine(root) {
    const svg = root.querySelector('.cp-machine-arrows');
    const nodes = Object.fromEntries(['input', 'control', 'arithmetic', 'memory', 'output'].map(name => [name, root.querySelector(`[data-lesson-view="${name}"]`)]));
    const paths = Object.fromEntries([...svg.querySelectorAll('[data-cp-flow]')].map(path => [path.dataset.cpFlow, path]));
    let pending = 0;
    function draw() {
      pending = 0;
      const frame = root.getBoundingClientRect();
      // 表紙や他のスライドを表示中は計測せず、再表示時に実寸へ合わせる。
      if (!frame.width || !frame.height) return;
      svg.setAttribute('viewBox', `0 0 ${frame.width} ${frame.height}`);
      const boxes = Object.fromEntries(Object.entries(nodes).map(([name, node]) => {
        const b = node.getBoundingClientRect();
        return [name, { left: b.left - frame.left, right: b.right - frame.left, top: b.top - frame.top, bottom: b.bottom - frame.top, x: b.left + b.width / 2 - frame.left, y: b.top + b.height / 2 - frame.top, width: b.width }];
      }));
      const { input: i, control: c, arithmetic: a, memory: m, output: o } = boxes;
      const setPath = (name, points) => paths[name].setAttribute('d', points.map(([x, y], index) => `${index ? 'L' : 'M'}${x.toFixed(2)} ${y.toFixed(2)}`).join(' '));
      const dataX = c.left + c.width * .12;
      const controlX = c.left + c.width * .29;
      setPath('input-memory', [[i.right, i.y], [(i.right + m.left) / 2, i.y], [(i.right + m.left) / 2, m.y], [m.left, m.y]]);
      setPath('memory-output', [[m.right, m.y], [(m.right + o.left) / 2, m.y], [(m.right + o.left) / 2, o.y], [o.left, o.y]]);
      setPath('memory-control', [[dataX, m.top], [dataX, c.bottom]]);
      setPath('memory-arithmetic', [[a.x, m.top], [a.x, a.bottom]]);
      setPath('control-input', [[c.left, c.y], [i.x, c.y], [i.x, i.top]]);
      setPath('control-output', [[c.right, c.y], [o.x, c.y], [o.x, o.top]]);
      setPath('control-memory', [[controlX, c.bottom], [controlX, m.top]]);
      setPath('control-arithmetic', [[a.x, c.bottom], [a.x, a.top]]);
    }
    const schedule = () => { if (!pending) pending = requestAnimationFrame(draw); };
    if (typeof ResizeObserver === 'function') {
      const observer = new ResizeObserver(schedule);
      [root, ...Object.values(nodes)].forEach(node => observer.observe(node));
    }
    window.addEventListener('resize', schedule);
    window.addEventListener('beforeprint', draw);
    window.addEventListener('afterprint', schedule);
    document.addEventListener('joho:lesson-slide-change', schedule);
    document.addEventListener('joho:lesson-content-resize', schedule);
    document.fonts?.ready.then(schedule);
    schedule();
  }
  function stepper(root, steps, render) {
    let index = 0;
    const controls = element('div', 'cp-stepper');
    const position = element('span', 'cp-stepper__position');
    const previous = button('戻る', () => update(index - 1));
    const next = button('次へ', () => update(index + 1));
    const reset = button('最初から', () => update(0));
    controls.append(previous, position, next, reset);
    const explanation = element('div', 'cp-step-description');
    const heading = element('h3');
    const text = element('p');
    explanation.append(heading, text);
    root.append(explanation, controls);
    function update(value) {
      index = Math.max(0, Math.min(steps.length - 1, value));
      const frame = steps[index];
      position.textContent = `${index + 1} / ${steps.length}`;
      heading.textContent = frame.title;
      text.textContent = frame.text;
      previous.disabled = index === 0;
      next.disabled = index === steps.length - 1;
      reset.disabled = index === 0;
      root.dataset.step = String(index);
      render(frame, index);
    }
    update(0);
  }
  function memory(root) {
    root.replaceChildren();
    const diagram = element('div', 'cp-memory-flow');
    const ram = element('div', 'cp-memory-box');
    const disk = element('div', 'cp-memory-box');
    const ramValue = element('strong', 'cp-memory-value');
    const diskValue = element('strong', 'cp-memory-value');
    ram.append(element('span', 'cp-eyebrow', 'CPUが作業に使う'), element('h3', '', '主記憶装置（RAM）'), ramValue);
    disk.append(element('span', 'cp-eyebrow', '電源を切っても保持する'), element('h3', '', '補助記憶装置（SSD）'), diskValue);
    const arrow = element('div', 'cp-memory-arrow');
    diagram.append(ram, arrow, disk);
    root.append(diagram);
    stepper(root, core.MEMORY_STEPS, frame => {
      ramValue.textContent = frame.ram === null ? '文書なし' : `「${frame.ram}」`;
      diskValue.textContent = `「${frame.disk}」`;
      ram.classList.toggle('is-active', ['read', 'edit'].includes(frame.direction));
      disk.classList.toggle('is-active', frame.direction === 'write');
      arrow.textContent = frame.direction === 'read' ? '読み込む' : frame.direction === 'write' ? '保存する' : frame.direction === 'edit' ? 'まだ未保存' : 'データの移動';
      diagram.dataset.direction = frame.direction;
    });
  }
  function cpu(root) {
    const detailed = root.hasAttribute('data-cp-detail');
    root.replaceChildren();
    const diagram = element('div', 'cp-cpu-diagram');
    const memoryBox = element('div', 'cp-cpu-memory');
    const table = element('table', 'cp-memory-table');
    table.append(element('caption', '', '主記憶装置：命令とデータ'));
    const head = element('thead'), headRow = element('tr');
    ['番地', '内容'].forEach(label => { const th = element('th', '', label); th.scope = 'col'; headRow.append(th); });
    head.append(headRow);
    const body = element('tbody');
    const rows = new Map();
    [...core.PROGRAM.map((item, i) => [i + 1, detailed ? item.code : item.label]), [10, '3'], [11, '5'], [12, '—']].forEach(([address, label]) => {
      const row = element('tr');
      row.dataset.address = String(address);
      const th = element('th', '', String(address)); th.scope = 'row';
      const cell = element('td', detailed && address <= 4 ? 'cp-code' : '', label);
      row.append(th, cell); body.append(row); rows.set(address, row);
    });
    table.append(head, body); memoryBox.append(table);
    const processor = element('div', 'cp-processor');
    processor.append(element('h3', '', 'CPU'));
    const phases = element('ol', 'cp-phases');
    const stages = ['fetch', 'decode', 'execute'];
    ['読み出し', '解読', '実行'].forEach(label => phases.append(element('li', '', label)));
    processor.append(phases);
    const instruction = element('p', 'cp-instruction');
    const register = element('strong', 'cp-register-value');
    const registerBox = element('div', 'cp-register');
    registerBox.append(element('span', '', 'レジスタA'), register);
    processor.append(instruction, registerBox);
    const pc = element('span'), ir = element('span', 'cp-code');
    if (detailed) {
      const registers = element('dl', 'cp-special-registers');
      registers.append(element('dt', '', 'PC（次の番地）'), pc, element('dt', '', 'IR（命令）'), ir);
      // ddを使い、補足の値にも用語との対応を持たせる。
      [pc, ir].forEach(value => { const dd = element('dd'); value.replaceWith(dd); dd.append(value); });
      processor.append(registers);
    }
    const exchange = element('div', 'cp-cpu-exchange', '↔');
    exchange.setAttribute('aria-hidden', 'true');
    diagram.append(memoryBox, exchange, processor);
    root.append(diagram);
    stepper(root, core.CPU_STEPS, frame => {
      for (const [address, row] of rows) {
        const active = frame.address === address;
        row.classList.toggle('is-active', active);
        if (active) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
      }
      rows.get(12).lastElementChild.textContent = frame.result === null ? '—' : String(frame.result);
      instruction.textContent = frame.instruction === null ? '命令を待っています' : core.PROGRAM[frame.instruction].label;
      register.textContent = frame.register === null ? '—' : String(frame.register);
      pc.textContent = String(frame.pc);
      ir.textContent = frame.instruction === null ? '—' : core.PROGRAM[frame.instruction].code;
      [...phases.children].forEach((item, i) => {
        item.classList.toggle('is-active', stages[i] === frame.stage);
        if (stages[i] === frame.stage) item.setAttribute('aria-current', 'step'); else item.removeAttribute('aria-current');
      });
    });
  }
  function clock(root) {
    root.replaceChildren();
    const formula = element('div', 'cp-clock-formula');
    root.append(formula);
    const frames = [
      { title: '例題：1秒間に何回の命令を実行できる？', text: '1.6 GHz、1命令に4クロック必要なCPUを考えます。命令を重ねて実行せず、待ち時間はないとします。', formula: '1.6 GHz　／　1命令に4クロック' },
      { title: '① 周波数をHzへ直す', text: 'G（ギガ）は10⁹です。1秒間に1.6×10⁹回のクロックがあります。', formula: '1.6 GHz ＝ 1.6 × 10⁹ Hz' },
      { title: '② 1命令に必要なクロック数で割る', text: '4クロックで1命令を実行するので、1秒間のクロック数を4で割ります。', formula: '（1.6 × 10⁹）÷ 4' },
      { title: '③ 計算して、単位を付ける', text: '1秒間に4億回の命令を実行できると求められます。', formula: '4 × 10⁸ 回／秒 ＝ 4億回／秒' }
    ];
    stepper(root, frames, frame => { formula.textContent = frame.formula; });
  }
  function files(root) {
    let path = [];
    root.replaceChildren();
    const toolbar = element('div', 'cp-file-toolbar');
    const crumbs = element('nav', 'cp-breadcrumbs'); crumbs.setAttribute('aria-label', '現在のフォルダの階層');
    const up = button('↑ 上の階層', () => navigate(path.slice(0, -1)));
    // Safari/WebKitでもフォルダ操作をTabでたどれるよう明示する。
    up.tabIndex = 0;
    toolbar.append(up, crumbs);
    const list = element('ul', 'cp-file-list');
    const selection = element('div', 'cp-file-selection');
    const selectionTitle = element('strong');
    const location = element('p');
    selection.append(selectionTitle, location);
    const browser = element('div', 'cp-file-browser');
    const tree = element('nav', 'cp-folder-tree');
    tree.setAttribute('aria-label', 'フォルダツリー');
    tree.append(element('h3', '', 'フォルダツリー'));
    const treeItems = [];
    const folderPath = part => [core.FILE_TREE.name, ...part.map((_, i) => core.fileAt(part.slice(0, i + 1)).name)].join(' ／ ');
    function treeBranch(folder, part) {
      const row = element('li');
      // ネイティブのリストとボタンで階層を表す。独自のtreeキー操作は要求しない。
      const item = button('', () => navigate(part, false), 'cp-button cp-folder-tree__item');
      item.tabIndex = 0;
      const icon = element('span', 'cp-folder-icon');
      icon.setAttribute('aria-hidden', 'true');
      item.append(icon, element('span', '', folder.name));
      item.setAttribute('aria-label', `${folderPath(part)}を開く`);
      row.append(item);
      treeItems.push({ item, part });
      const children = element('ul');
      folder.children.forEach((entry, index) => { if (entry.children) children.append(treeBranch(entry, [...part, index])); });
      if (children.childElementCount) row.append(children);
      return row;
    }
    const branches = element('ul');
    branches.append(treeBranch(core.FILE_TREE, []));
    tree.append(branches);
    const pane = element('div', 'cp-file-pane');
    pane.append(toolbar, list, selection);
    browser.append(tree, pane);
    root.append(browser);
    function navigate(next, focus = true) {
      path = [...next];
      const folder = core.fileAt(path);
      treeItems.forEach(({ item, part }) => {
        const ancestor = part.every((index, depth) => index === path[depth]);
        if (ancestor && part.length === path.length) item.setAttribute('aria-current', 'location');
        else item.removeAttribute('aria-current');
        item.toggleAttribute('data-current-ancestor', ancestor && part.length < path.length);
      });
      crumbs.replaceChildren(); list.replaceChildren();
      [[], ...path.map((_, i) => path.slice(0, i + 1))].forEach((part, i) => {
        if (i > 0) crumbs.append(element('span', 'cp-breadcrumb-separator', '›'));
        const item = button(core.fileAt(part).name, () => navigate(part));
        item.tabIndex = 0;
        if (i === path.length) item.setAttribute('aria-current', 'location');
        crumbs.append(item);
      });
      up.disabled = !path.length;
      folder.children.forEach((entry, index) => {
        const row = element('li');
        const item = button('', () => {
          if (entry.children) navigate([...path, index]);
          else {
            list.querySelectorAll('[aria-pressed]').forEach(node => node.setAttribute('aria-pressed', 'false'));
            item.setAttribute('aria-pressed', 'true');
            selectionTitle.textContent = `${entry.name}（${entry.kind}）`;
            location.textContent = `保存場所：${folderPath(path)} ／ ${entry.name}`;
          }
        }, 'cp-file-entry');
        item.tabIndex = 0;
        const icon = element('span', entry.children ? 'cp-folder-icon' : 'cp-file-icon');
        icon.setAttribute('aria-hidden', 'true');
        item.append(icon, element('span', '', entry.name), element('small', '', entry.children ? 'フォルダを開く' : entry.kind));
        if (!entry.children) item.setAttribute('aria-pressed', 'false');
        row.append(item); list.append(row);
      });
      selectionTitle.textContent = 'フォルダやファイルを選んでみましょう';
      location.textContent = `現在の場所：${folderPath(path)}`;
      if (focus) list.querySelector('button')?.focus({ preventScroll: true });
    }
    navigate([], false);
  }
  function quiz(root) {
    const bank = core.QUESTIONS[root.dataset.cpQuiz];
    if (!bank) return;
    let questionIndex = 0;
    function render(focus = false) {
      const question = bank[questionIndex];
      root.replaceChildren();
      const form = element('form', 'cp-quiz');
      form.setAttribute('data-lesson-slide-navigation-lock', '');
      const heading = element('h3', 'cp-quiz-heading', `確認 ${questionIndex + 1} / ${bank.length}`);
      heading.tabIndex = -1;
      const fieldset = element('fieldset');
      fieldset.append(element('legend', '', question.prompt));
      let readAnswer;
      let scale;
      if (question.type === 'choice') {
        const choices = element('div', 'cp-quiz-choices');
        question.options.forEach((text, index) => {
          const label = element('label', 'cp-choice');
          const input = element('input'); input.type = 'radio'; input.name = 'answer'; input.value = String(index);
          label.append(input, element('span', '', text)); choices.append(label);
        });
        fieldset.append(choices);
        readAnswer = () => { const selected = form.querySelector('input:checked'); return selected ? Number(selected.value) : null; };
      } else if (question.type === 'order') {
        const fields = element('div', 'cp-order-fields');
        const selects = question.answer.map((_, i) => {
          const label = element('label', '', `${i + 1}番目`);
          const select = element('select');
          const blank = element('option', '', '選んでください'); blank.value = ''; select.append(blank);
          question.options.forEach((text, index) => { const item = element('option', '', text); item.value = String(index); select.append(item); });
          label.append(select); fields.append(label); return select;
        });
        fieldset.append(fields);
        readAnswer = () => selects.map(select => select.value === '' ? null : Number(select.value));
      } else {
        const controls = element('div', 'cp-number-fields');
        const label = element('label', '', '1秒間の命令の実行回数');
        const input = element('input'); input.type = 'text'; input.inputMode = 'decimal'; input.autocomplete = 'off'; input.placeholder = '数値を入力';
        label.append(input);
        const unitLabel = element('label', '', '単位'); scale = element('select');
        [[1, '回／秒'], [1e4, '万回／秒'], [1e8, '億回／秒']].forEach(([value, text]) => { const item = element('option', '', text); item.value = String(value); scale.append(item); });
        unitLabel.append(scale); controls.append(label, unitLabel); fieldset.append(controls);
        readAnswer = () => input.value;
      }
      const feedback = element('div', 'cp-feedback');
      feedback.setAttribute('role', 'status');
      const actions = element('div', 'cp-quiz-actions');
      const submit = element('button', 'cp-button cp-button--primary', '答え合わせ'); submit.type = 'submit';
      const next = button(questionIndex === bank.length - 1 ? '最初の問題へ' : '次の問題', () => { questionIndex = (questionIndex + 1) % bank.length; render(true); });
      actions.append(submit, next);
      form.append(heading, fieldset, actions, feedback); root.append(form);
      const clear = () => { feedback.replaceChildren(); delete feedback.dataset.result; };
      form.addEventListener('input', clear);
      form.addEventListener('change', clear);
      form.addEventListener('submit', event => {
        event.preventDefault();
        const result = core.judge(question, readAnswer(), scale ? Number(scale.value) : 1);
        feedback.replaceChildren();
        feedback.dataset.result = !result.valid ? 'empty' : result.correct ? 'correct' : 'incorrect';
        feedback.append(element('strong', '', !result.valid ? '解答を入力・選択してください。' : result.correct ? '正解です。' : 'もう一度考えてみましょう。'));
        if (result.valid) feedback.append(element('p', '', question.explanation));
      });
      if (focus) heading.focus({ preventScroll: true });
    }
    render();
  }
  function initialize() {
    const demos = { memory, cpu, clock };
    // 機能ごとに独立させ、失敗時にも静的本文と他の教材操作を残す。
    const enhance = (root, init) => {
      const original = [...root.childNodes].map(node => node.cloneNode(true));
      try { init(root); } catch (error) { root.replaceChildren(...original); console.error('CP教材の初期化に失敗しました。', error); }
    };
    document.querySelectorAll('[data-cp-demo]').forEach(root => { if (demos[root.dataset.cpDemo]) enhance(root, demos[root.dataset.cpDemo]); });
    document.querySelectorAll('[data-cp-machine]').forEach(root => enhance(root, machine));
    document.querySelectorAll('[data-cp-files]').forEach(root => enhance(root, files));
    document.querySelectorAll('[data-cp-quiz]').forEach(root => enhance(root, quiz));
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
