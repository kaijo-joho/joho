(function () {
  'use strict';

  const Core = window.CompressionCore;
  if (!Core) return;

  const one = (root, selector) => root.querySelector(selector);
  const text = (tag, value, className) => {
    const node = document.createElement(tag);
    if (className) node.className = className;
    node.textContent = value;
    return node;
  };
  const showControls = root => root.querySelectorAll('.cp-enhancement').forEach(node => { node.hidden = false; });
  const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const predictionText = root => {
    const chosen = root.querySelector('input[type=radio]:checked');
    return !chosen ? '予想を選ぶと結果と比べられます。' : chosen.value === 'clustered' ? '予想どおり、まとまった方が小さくなりました。' : '予想と結果を比べましょう。まとまった方が小さくなりました。';
  };
  const format = value => Number.isInteger(value) ? String(value) : String(Number(value.toFixed(2)));

  function setupStringCompare(root) {
    const pairs = [
      { label: 'まとまった並び', value: 'AAAAAAAABBBBBBBB' },
      { label: '交互の並び', value: 'ABABABABABABABAB' }
    ];
    const results = one(root, '[data-cp-string-compare-results]');
    one(root, '[data-cp-string-compare-run]').addEventListener('click', () => {
      results.replaceChildren();
      const list = document.createElement('ul');
      pairs.forEach(pair => {
        const encoded = Core.encodeRle(pair.value);
        const item = document.createElement('li');
        item.append(text('strong', `${pair.label}：`), document.createTextNode(`${pair.value.length}文字 → ${encoded.encoded}（${encoded.after}文字、圧縮率${format(Core.compressionRate(encoded.before, encoded.after))}%）`));
        list.append(item);
      });
      results.append(list);
      one(root, '[data-cp-string-compare-status]').textContent = '同じA・B各8個でも、まとまりは4文字（25%）、交互は32文字（200%）です。連続する同じ文字が多いほど、RLEで短くなります。';
      results.hidden = false;
      const status = root.querySelector('.cp-feedback');
      status.textContent = predictionText(root) + ' ' + status.textContent; resized();
    });
    showControls(root);
  }

  function setupRlePractice(root) {
    const image = root.dataset.cpRlePractice === 'image';
    const source = image
      ? [...root.dataset.cpPracticeSource].map(value => value === '1' ? '黒' : '白').join('')
      : root.dataset.cpPracticeSource;
    const result = Core.encodeRle(source);
    const input = one(root, '[data-cp-practice-answer]');
    const feedback = one(root, '[data-cp-practice-feedback]');
    const solution = one(root, '[data-cp-practice-solution]');
    const clear = () => {
      input.removeAttribute('aria-invalid');
      feedback.textContent = '';
      solution.hidden = true;
      resized();
    };
    root.addEventListener('submit', event => {
      event.preventDefault();
      const answer = input.value.normalize('NFKC').replace(/\s/g, '').toUpperCase();
      if (!answer) {
        input.setAttribute('aria-invalid', 'true');
        feedback.textContent = '圧縮後の文字列を入力してください。';
        solution.hidden = true;
        input.focus();
      } else {
        const correct = answer === result.encoded;
        input.setAttribute('aria-invalid', String(!correct));
        feedback.textContent = correct ? '正解です。' : '同じ文字が続くまとまりと回数を確認しましょう。';
        solution.replaceChildren(
          text('p', `解答：${result.encoded}`, 'cp-practice-answer'),
          text('p', result.runs.map(run => `${run.value.repeat(run.count)} → ${run.encoded}`).join('、')),
          text('p', `元${result.before}${image ? '画素' : '文字'} → 圧縮後${result.after}文字。回数1も省略しません。`)
        );
        solution.hidden = false;
      }
      resized();
    });
    root.addEventListener('input', clear);
    root.addEventListener('reset', clear);
    showControls(root);
  }

  function setupImageCompare(root) {
    const clustered = ['11111', '11111', '11100', '00000', '00000'].join('');
    const checker = Array.from({ length: 25 }, (_, index) => index % 2 === 0 ? '1' : '0').join('');
    const render = (host, pixels) => {
      host.replaceChildren();
      [...pixels].forEach((pixel, index) => {
        const cell = text('span', pixel === '1' ? '黒' : '白', `cp-compare-cell ${pixel === '1' ? 'cp-compare-cell--black' : 'cp-compare-cell--white'}`);
        cell.setAttribute('aria-label', `${Math.floor(index / 5) + 1}行${index % 5 + 1}列、${pixel === '1' ? '黒' : '白'}`);
        host.append(cell);
      });
    };
    render(one(root, '[data-cp-cluster-grid]'), clustered);
    render(one(root, '[data-cp-checker-grid]'), checker);
    const results = one(root, '[data-cp-image-compare-results]');
    one(root, '[data-cp-image-compare-run]').addEventListener('click', () => {
      results.replaceChildren();
      const list = document.createElement('ul');
      [
        { label: 'まとまった配置', pixels: clustered },
        { label: '市松配置', pixels: checker }
      ].forEach(example => {
        const source = [...example.pixels].map(value => value === '1' ? '黒' : '白').join('');
        const encoded = Core.encodeRle(source);
        const restored = Core.decodeRle(encoded.encoded);
        const item = document.createElement('li');
        item.append(text('strong', `${example.label}：`), document.createTextNode(`${encoded.runs.length}まとまり、${encoded.encoded}（${encoded.after}文字、圧縮率${format(Core.compressionRate(encoded.before, encoded.after))}%、復元一致${restored === source ? '25/25画素' : 'なし'}）`));
        list.append(item);
      });
      results.append(list);
      one(root, '[data-cp-image-compare-status]').textContent = '黒13画素・白12画素の数は同じです。行末をまたいで読むと、まとまった配置は黒13白12の6文字（24%）、市松配置は25回のまとまりをすべて記録して50文字（200%）になります。各記録では回数1も省略していません。';
      results.hidden = false;
      const status = root.querySelector('.cp-feedback');
      status.textContent = predictionText(root) + ' ' + status.textContent; resized();
    });
    showControls(root);
  }

  function initialize() {
    [
      ['[data-cp-rle-practice]', setupRlePractice],
      ['[data-cp-string-compare]', setupStringCompare],
      ['[data-cp-image-compare]', setupImageCompare]
    ].forEach(([selector, setup]) => document.querySelectorAll(selector).forEach(root => {
      try { setup(root); } catch (error) { console.error('圧縮比較の操作を初期化できませんでした。', error); }
    }));
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
