(() => {
  'use strict';
  const core = window.ColorStudyCore;
  if (!core) return;
  document.querySelectorAll('.color-panel [disabled]').forEach(control => { control.disabled = false; });

  const attributes = document.querySelector('[data-color-attributes]');
  if (attributes) {
    const inputs = [...attributes.querySelectorAll('[data-hsl]')];
    const initial = [0, 100, 50];
    let reference = [...initial];
    const current = () => inputs.map(input => Number(input.value));
    function paint(kind, values) {
      const rgb = core.hslToRgb(...values);
      const swatch = attributes.querySelector(`[data-hsl-${kind}]`);
      const label = attributes.querySelector(`[data-hsl-${kind}-values]`);
      swatch.style.backgroundColor = core.toHex(rgb);
      label.replaceChildren(
        document.createTextNode(`色相 ${values[0]}° ／ 彩度 ${values[1]}% ／ 明度 ${values[2]}%`),
        document.createElement('br'),
        document.createTextNode(`RGB(${rgb.join(', ')}) ／ ${core.toHex(rgb)}`)
      );
    }
    function update() {
      inputs.forEach(input => {
        const output = attributes.querySelector(`[data-hsl-output="${input.dataset.hsl}"]`);
        output.value = `${input.value}${input.dataset.hsl === 'h' ? '°' : '%'}`;
      });
      paint('reference', reference);
      paint('current', current());
    }
    inputs.forEach(input => input.addEventListener('input', update));
    attributes.querySelector('[data-hsl-save]').addEventListener('click', () => {
      reference = current();
      update();
    });
    attributes.querySelector('[data-hsl-reset]').addEventListener('click', () => {
      inputs.forEach((input, index) => { input.value = initial[index]; });
      reference = [...initial];
      update();
    });
    update();
  }

  const contrast = document.querySelector('[data-color-contrast]');
  if (contrast) {
    const mode = contrast.querySelector('select');
    const swap = contrast.querySelector('[data-contrast-swap]');
    const reveal = contrast.querySelector('[data-contrast-reveal]');
    const answer = contrast.querySelector('#contrast-answer');
    let reversed = false;
    const pairs = {
      lightness: [['#FFFFFF', '白い背景'], ['#202020', '黒い背景']],
      hue: [['#FFD080', '暖色の背景'], ['#80C0FF', '寒色の背景']]
    };
    function update() {
      const pair = pairs[mode.value];
      contrast.querySelectorAll('[data-contrast-sample]').forEach((sample, index) => {
        const [color, label] = pair[reversed ? 1 - index : index];
        sample.style.backgroundColor = color;
        contrast.querySelector(`[data-contrast-label="${index}"]`).textContent = label;
      });
      swap.setAttribute('aria-pressed', String(reversed));
    }
    mode.addEventListener('change', () => { reversed = false; update(); });
    swap.addEventListener('click', () => { reversed = !reversed; update(); });
    reveal.addEventListener('click', () => {
      answer.hidden = !answer.hidden;
      reveal.setAttribute('aria-expanded', String(!answer.hidden));
      reveal.textContent = answer.hidden ? '文字色を確認' : '説明を隠す';
    });
    update();
  }

  const afterimage = document.querySelector('[data-color-afterimage]');
  if (afterimage) {
    const choices = [...afterimage.querySelectorAll('[data-afterimage-color]')];
    const circle = afterimage.querySelector('[data-afterimage-circle]');
    const next = afterimage.querySelector('[data-afterimage-next]');
    const instruction = afterimage.querySelector('[data-afterimage-instruction]');
    let selected = choices[0];
    let phase = 'idle';
    function update() {
      afterimage.dataset.phase = phase;
      choices.forEach(choice => choice.setAttribute('aria-pressed', String(choice === selected)));
      circle.style.backgroundColor = phase === 'view' ? selected.dataset.value : '#FFFFFF';
      if (phase === 'view') {
        next.textContent = '白に切り替える';
        circle.setAttribute('aria-label', `${selected.dataset.label}の円を白に切り替える`);
        instruction.textContent = '中央の＋をしばらく見つめてから、「白に切り替える」または円を押してください。';
      } else if (phase === 'white') {
        next.textContent = 'もう一度';
        circle.setAttribute('aria-label', `${selected.dataset.label}の円をもう一度見る`);
        instruction.textContent = '白いところを見続け、残像の色を観察しましょう。';
      } else {
        next.textContent = '開始';
        circle.setAttribute('aria-label', `${selected.dataset.label}の円を見る実験を開始する`);
        instruction.textContent = '色を選んで「開始」を押してください。';
      }
    }
    const advance = () => { phase = phase === 'view' ? 'white' : 'view'; update(); };
    next.addEventListener('click', advance);
    circle.addEventListener('click', advance);
    choices.forEach(choice => choice.addEventListener('click', () => {
      selected = choice;
      phase = 'idle';
      update();
    }));
    update();
  }

  // 本文の対比実験では文字色を固定する。数値の見出しだけを読みやすくする。
  document.querySelectorAll('.cc-tile p:not([style])').forEach(label => {
    const values = getComputedStyle(label.parentElement).backgroundColor.match(/[\d.]+/g);
    if (values && values.length >= 3) label.style.color = core.readableText(values.slice(0, 3).map(Number).map(Math.round));
  });
  document.querySelectorAll('.color-strip').forEach(strip => {
    if (strip.querySelector(':scope > .cc-tile-col11, :scope > .cc-tile-col12')) {
      strip.tabIndex = 0;
      strip.setAttribute('role', 'region');
      strip.setAttribute('aria-label', '横に並ぶ色の見本');
    }
  });
})();
