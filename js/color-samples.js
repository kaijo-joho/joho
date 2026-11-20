(() => {
  'use strict';

  const byId = id => document.getElementById(id);

  function bindHex(field, error, core, accept) {
    let composing = false;
    const help = field.getAttribute('aria-describedby');
    function setError(show) {
      error.hidden = !show;
      if (show) {
        field.setAttribute('aria-invalid', 'true');
        field.setAttribute('aria-describedby', `${help} ${error.id}`);
      } else {
        field.removeAttribute('aria-invalid');
        field.setAttribute('aria-describedby', help);
      }
    }
    function read(reportError) {
      if (composing) return;
      const color = core.parseHex(field.value);
      setError(reportError && !color);
      if (color) accept(color);
    }
    field.addEventListener('compositionstart', () => { composing = true; });
    field.addEventListener('compositionend', () => { composing = false; read(false); });
    field.addEventListener('input', event => { if (!event.isComposing) read(false); });
    field.addEventListener('blur', () => read(true));
    field.addEventListener('keydown', event => {
      if (event.key === 'Enter' && !event.isComposing && event.keyCode !== 229) read(true);
    });
    return setError;
  }

  function initializeMixer(core) {
    const controls = byId('rgb-mix-controls');
    if (!controls) return;
    const ranges = Array.from(controls.querySelectorAll('[data-mix-channel]'));
    const readings = controls.querySelectorAll('[data-mix-value]');
    const field = byId('mix-hex');
    const swatch = byId('mix-swatch');
    const rgbValue = byId('mix-rgb-value');
    const hexValue = byId('mix-hex-value');

    function render(color) {
      swatch.style.setProperty('--mix-color', color.hex);
      rgbValue.textContent = color.css;
      hexValue.textContent = color.hex;
      color.channels.forEach((value, index) => {
        ranges[index].value = value;
        readings[index].textContent = value;
      });
    }

    const setError = bindHex(field, byId('mix-hex-error'), core, render);
    function refreshFromRanges() {
      const color = core.rgb(...ranges.map(input => Number(input.value)));
      field.value = color.hex;
      setError(false);
      render(color);
    }
    ranges.forEach(input => input.addEventListener('input', refreshFromRanges));
    refreshFromRanges();
    controls.disabled = false;
  }

  function initializePair(core, onChange) {
    const controls = byId('pair-controls');
    if (!controls) return null;
    const sample = byId('pair-sample');
    const pair = {};
    for (const channel of ['background', 'foreground']) {
      const input = byId(`pair-${channel}`);
      const output = byId(`pair-${channel}-value`);
      function render(color) {
        pair[channel] = color.hex;
        sample.style.setProperty(`--pair-${channel}`, color.hex);
        output.textContent = color.hex;
      }
      render(core.parseHex(input.value));
      bindHex(input, byId(`pair-${channel}-error`), core, color => {
        render(color);
        onChange();
      });
    }
    controls.disabled = false;
    return pair;
  }

  function initializeColorSamples() {
    const slider = document.getElementById('s-slider');
    const valueOutput = document.getElementById('saturation');
    const captionValue = document.getElementById('caption-saturation');
    const tableBody = document.getElementById('color-samples-body');
    const colorCore = window.ColorStudyCore;
    const rgbCore = window.DigitalColorCore;

    if (!slider || !valueOutput || !captionValue || !tableBody || !colorCore || !rgbCore) return;

    const table = tableBody.closest('table');
    const mode = byId('sample-mode');
    const modeCaption = byId('sample-caption-mode');
    initializeMixer(rgbCore);
    const pair = initializePair(rgbCore, updateMode);

    function updateMode() {
      if (!mode || !modeCaption || !pair) return;
      table.dataset.previewMode = mode.value;
      table.style.setProperty('--fixed-text', pair.foreground);
      table.style.setProperty('--fixed-background', pair.background);
      if (mode.value === 'fixed-text') {
        modeCaption.textContent = `文字色 ${pair.foreground} を固定。各セルは背景色の候補です。`;
      } else if (mode.value === 'fixed-background') {
        modeCaption.textContent = `背景色 ${pair.background} を固定。各セルは文字色の候補です。`;
      } else {
        modeCaption.textContent = '色相は列、明度は行で示します。';
      }
    }

    const sampleCells = [];
    const hueValues = Array.from({ length: 12 }, (_, index) => index * 30);

    for (let rowIndex = 0; rowIndex <= 20; rowIndex += 1) {
      const lightness = 100 - rowIndex * 5;
      const row = document.createElement('tr');
      const lightnessHeader = document.createElement('th');
      lightnessHeader.scope = 'row';
      lightnessHeader.className = 'color-samples__lightness';
      lightnessHeader.textContent = `${lightness}%`;
      row.appendChild(lightnessHeader);

      hueValues.forEach(hue => {
        const cell = document.createElement('td');
        const preview = document.createElement('span');
        preview.className = 'color-samples__table-text';
        // 内容は各セルで同じ。読み上げには見本の色を示す値を残す。
        preview.setAttribute('aria-hidden', 'true');
        preview.textContent = '文字の見本';
        const valueList = document.createElement('span');
        valueList.className = 'color-samples__values';
        const channels = ['R', 'G', 'B'].map(channel => {
          const line = document.createElement('span');
          line.className = 'color-samples__channel';
          line.dataset.channel = channel;
          valueList.appendChild(line);
          return line;
        });
        const hexValue = document.createElement('strong');
        hexValue.className = 'color-samples__hex';
        valueList.appendChild(hexValue);
        cell.append(preview, valueList);
        row.appendChild(cell);
        sampleCells.push({ cell, channels, hexValue, hue, lightness });
      });

      tableBody.appendChild(row);
    }

    function updateSamples() {
      const saturation = Number(slider.value);
      const formattedSaturation = `${saturation}%`;
      valueOutput.value = formattedSaturation;
      valueOutput.textContent = formattedSaturation;
      captionValue.textContent = formattedSaturation;

      sampleCells.forEach(({ cell, channels, hexValue, hue, lightness }) => {
        const rgb = colorCore.hslToRgb(hue, saturation, lightness);
        const hex = colorCore.toHex(rgb);
        const textColor = colorCore.readableText(rgb);
        const cssColor = `rgb(${rgb[0]}, ${rgb[1]}, ${rgb[2]})`;

        cell.style.setProperty('--sample-color', cssColor);
        cell.style.setProperty('--sample-label-color', textColor);
        channels.forEach((channel, index) => {
          channel.textContent = `${channel.dataset.channel}: ${rgb[index]}`;
        });
        hexValue.textContent = hex;
        cell.setAttribute('aria-label', `色相${hue}度、明度${lightness}%、RGB ${rgb.join(' ')}、${hex}`);
        cell.title = `色相 ${hue}°、明度 ${lightness}%、彩度 ${formattedSaturation} / ${cssColor} / ${hex}`;
      });
    }

    slider.addEventListener('input', updateSamples);
    updateSamples();
    slider.disabled = false;
    if (mode && modeCaption && pair) {
      mode.addEventListener('change', updateMode);
      updateMode();
      mode.disabled = false;
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeColorSamples, { once: true });
  } else {
    initializeColorSamples();
  }
})();
