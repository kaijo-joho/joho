(() => {
  'use strict';

  function initializeColorSamples() {
    const slider = document.getElementById('s-slider');
    const valueOutput = document.getElementById('saturation');
    const captionValue = document.getElementById('caption-saturation');
    const tableBody = document.getElementById('color-samples-body');
    const colorCore = window.ColorStudyCore;

    if (!slider || !valueOutput || !captionValue || !tableBody || !colorCore) return;

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
        cell.appendChild(valueList);
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

        cell.style.backgroundColor = cssColor;
        cell.style.color = textColor;
        channels.forEach((channel, index) => {
          channel.textContent = `${channel.dataset.channel}: ${rgb[index]}`;
        });
        hexValue.textContent = hex;
        cell.setAttribute('aria-label', `色相${hue}度、明度${lightness}%、RGB ${rgb.join(' ')}、${hex}`);
        cell.title = `色相 ${hue}°、明度 ${lightness}%、彩度 ${formattedSaturation} / ${cssColor} / ${hex}`;
      });
    }

    slider.addEventListener('input', updateSamples);
    slider.disabled = false;
    updateSamples();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initializeColorSamples, { once: true });
  } else {
    initializeColorSamples();
  }
})();
