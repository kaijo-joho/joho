(function (root) {
  'use strict';

  function integer(value, min, max, name) {
    if (!Number.isInteger(value) || value < min || value > max) throw new RangeError(`${name}が範囲外です`);
    return value;
  }

  function levels(bits) {
    return 2 ** integer(bits, 1, 8, '量子化ビット数');
  }

  // 明るさ0以上256未満を等幅の区間へ分ける。境界は上側の段階へ含める。
  function quantize(brightness, bits) {
    const count = levels(bits);
    if (!Number.isFinite(brightness)) throw new RangeError('明るさは有限の数値で指定してください');
    return Math.min(count - 1, Math.floor(Math.max(0, brightness) * count / 256));
  }

  function tone(code, bits) {
    const count = levels(bits);
    return Math.round(integer(code, 0, count - 1, '段階値') * 255 / (count - 1));
  }

  function binary(code, bits) {
    integer(bits, 1, 24, 'ビット数');
    return integer(code, 0, 2 ** bits - 1, '段階値').toString(2).padStart(bits, '0');
  }

  function imageSize(width, height, bitsPerPixel, base = 1024) {
    integer(width, 1, 100000, '横の画素数');
    integer(height, 1, 100000, '縦の画素数');
    integer(bitsPerPixel, 1, 48, '1画素あたりのビット数');
    if (base !== 1000 && base !== 1024) throw new RangeError('換算基準は1000または1024です');
    const pixels = width * height;
    const bits = pixels * bitsPerPixel;
    return { pixels, bits, bytes: bits / 8, kilobytes: bits / 8 / base, megabytes: bits / 8 / base ** 2 };
  }

  // 原本56枚目の斜めの濃淡。各マス内の平均値から原本と同じ6〜0を得る。
  function grayscaleExample() {
    return Array.from({ length: 16 }, (_, index) => {
      const row = Math.floor(index / 4);
      const column = index % 4;
      const brightness = 255 * (1 - (row + column + 1) / 8);
      const code = quantize(brightness, 3);
      return { row, column, brightness, code, binary: binary(code, 3) };
    });
  }

  // 元画像の各領域を平均する。Canvasの縮小フィルタや端末の倍率へ依存させない。
  function sampleRgb(data, width, height, columns, rows) {
    integer(columns, 1, width, '横の分割数');
    integer(rows, 1, height, '縦の分割数');
    if (data.length !== width * height * 4) throw new RangeError('画像の大きさと画素データが一致しません');
    const samples = [];
    for (let row = 0; row < rows; row += 1) {
      for (let column = 0; column < columns; column += 1) {
        const startX = Math.floor(column * width / columns);
        const endX = Math.floor((column + 1) * width / columns);
        const startY = Math.floor(row * height / rows);
        const endY = Math.floor((row + 1) * height / rows);
        const sum = [0, 0, 0];
        for (let y = startY; y < endY; y += 1) {
          for (let x = startX; x < endX; x += 1) {
            const offset = (y * width + x) * 4;
            for (let channel = 0; channel < 3; channel += 1) sum[channel] += data[offset + channel];
          }
        }
        const count = (endX - startX) * (endY - startY);
        samples.push(sum.map(value => value / count));
      }
    }
    return samples;
  }

  root.ImageCore = Object.freeze({ levels, quantize, tone, binary, imageSize, grayscaleExample, sampleRgb });
})(globalThis);
