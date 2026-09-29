// 画像・動画教材の立式規則。値・単位・正解は各計算コアから導出する。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    require('./image-core.js');
    require('./video-core.js');
    module.exports = factory(globalThis.ImageCore, globalThis.VideoCore, require('./lesson-formula-grader.js'));
  } else root.MediaFormulas = factory(root.ImageCore, root.VideoCore, root.LessonFormulaGrader);
})(typeof globalThis !== 'undefined' ? globalThis : this, function (Image, Video, Grader) {
  'use strict';
  if (!Image || !Video || !Grader) throw new Error('画像・動画の計算に必要な共通処理を読み込めませんでした。');

  const value = (n, unit = '', symbol) => ({ kind: 'value', value: String(n), unit, ...(symbol ? { symbol } : {}) });
  const op = n => ({ kind: 'operator', value: n });
  const group = body => ({ kind: 'group', body });
  const power = (base, exponent) => ({ kind: 'power', base, exponent });
  const unit = (label, dimensions, extras = {}) => ({ label, dimensions, ...extras });

  // KB/MB/GB は自動換算しない独立単位である。換算数の向きも式として
  // 残すため、1000 と 1024 の取り違えを採点時に検出できる。
  const UNITS = Object.freeze({
    '': unit('単位なし', {}),
    // 画素数・フレーム数は数え上げ（無次元）として扱い、数量の取り違えは
    // dimensions ではなく source symbol で防ぐ。これで横×縦×bit/画素は bit。
    pixel: unit('画素', {}),
    'bit/pixel': unit('bit/画素', { bit: 1 }),
    bitCount: unit('bit（桁数）', {}),
    colorChannel: unit('RGBの成分', {}),
    colors: unit('色', {}), levels: unit('階調', {}),
    bit: unit('bit', { bit: 1 }), B: unit('B', { B: 1 }), KB: unit('KB', { KB: 1 }), MB: unit('MB', { MB: 1 }), GB: unit('GB', { GB: 1 }),
    s: unit('秒', { s: 1 }), frame: unit('枚', {}),
    'bit/B': unit('bit/B', { bit: 1, B: -1 }, { conversion: true, conversionLabel: 'bit→B', conversionOperation: '割る' }),
    'B/KB': unit('B/KB', { B: 1, KB: -1 }, { conversion: true, conversionLabel: 'B→KB', conversionOperation: '割る' }),
    'KB/MB': unit('KB/MB', { KB: 1, MB: -1 }, { conversion: true, conversionLabel: 'KB→MB', conversionOperation: '割る' }),
    'MB/GB': unit('MB/GB', { MB: 1, GB: -1 }, { conversion: true, conversionLabel: 'GB→MB', conversionOperation: '掛ける' }),
    'MB/frame': unit('MB/枚', { MB: 1 }),
    'frame/s': unit('枚/秒（fps）', { s: -1 })
  });
  const UNIT_LESS_CONVERSIONS = Object.freeze({
    '8': ['', 'bit/B'],
    '1000': ['', 'B/KB', 'KB/MB'],
    '1024': ['', 'B/KB', 'KB/MB', 'MB/GB']
  });

  function createDefinition(id) {
    const definition = { id, units: UNITS, unitlessConversionChoices: UNIT_LESS_CONVERSIONS, quantities: [], constants: [], sources: [], tasks: [] };
    function source(sourceId, label, number, unitId, options = {}) {
      const item = { id: sourceId, label, value: String(number), unit: unitId, symbol: options.symbol === false ? undefined : (options.symbol || sourceId) };
      definition.sources.push(item);
      if (!options.implicit) definition.quantities.push({ id: sourceId, label, value: String(number), unit: unitId });
      return value(number, unitId, item.symbol);
    }
    function constant(constantId, label, number, unitId = '') {
      definition.constants.push({ id: constantId, label, value: String(number), unit: unitId });
      return value(number, unitId);
    }
    function task(taskId, label, answerUnit, expected, expectedTokens, extras = {}) {
      definition.tasks.push({
        id: taskId, label, answerUnit, answerUnitLabel: UNITS[answerUnit].label, expected,
        tolerance: Math.max(1e-7, Math.abs(expected) * 1e-6), expectedTokens, ...extras
      });
    }
    return { definition, source, constant, task };
  }

  function imageDataTokens(width, height, bits, base, legacy = false) {
    const byte = legacy ? value(8, 'bit/B') : value(8);
    const kilo = legacy ? value(base, 'B/KB') : value(base);
    const mega = legacy ? value(base, 'KB/MB') : value(base);
    return [width, op('×'), height, op('×'), bits, op('÷'), byte, op('÷'), kilo, op('÷'), mega];
  }

  function defineImage(kind) {
    if (kind === 'full-color') {
      const { definition, source, constant, task } = createDefinition('image-full-color');
      const width = source('width', '横の画素数', 4096, 'pixel');
      const height = source('height', '縦の画素数', 3072, 'pixel');
      // 同じ24でも、階調では「RGB合計の桁数」、サイズでは「1画素あたり」と
      // 役割が違う。カードを分けて指数の無次元性とサイズの次元を保つ。
      const colorBits = source('color-bits', 'RGB全体のビット数', 24, 'bitCount');
      const bitsPerPixel = source('bits-per-pixel', '1画素あたりのビット数', 24, 'bit/pixel');
      constant('two', '2進数の基数', 2);
      const rgbChannels = constant('rgb-channels', 'RGBの成分数', 3, 'colorChannel');
      constant('bit-byte', '換算用の数', 8);
      constant('byte-kilo', '換算用の数', 1024);
      definition.taskPalettes = true;
      definition.quantities.forEach(item => { item.hideUnit = true; });
      definition.constants.forEach(item => { item.hideUnit = true; });
      const expectedSize = Image.imageSize(4096, 3072, 24, 1024).megabytes;
      task('levels', '(1) 各色の階調数を答えなさい。', 'levels', Image.levels(8), [power([value(2)], [group([colorBits, op('÷'), rgbChannels])])], {
        palette: { quantities: ['width', 'height', 'color-bits'], constants: ['two', 'rgb-channels', 'byte-kilo'] }
      });
      task('size', '(2) この画像のデータ量は何MBですか。', 'MB', expectedSize, imageDataTokens(width, height, bitsPerPixel, 1024), {
        palette: { quantities: ['width', 'height', 'bits-per-pixel'], constants: ['two', 'rgb-channels', 'bit-byte', 'byte-kilo'] },
        legacyExpectedTokens: imageDataTokens(width, height, bitsPerPixel, 1024, true)
      });
      return definition;
    }
    if (kind === 'color-count') {
      const { definition, source, constant, task } = createDefinition('image-color-count');
      definition.manualUnits = ['bit/pixel'];
      const width = source('width', '横の画素数', 1000, 'pixel');
      const height = source('height', '縦の画素数', 800, 'pixel');
      source('colors', '色数', 32768, 'colors');
      // 問題文の指数からbit数を直接記入し、その手入力をサイズ式で参照する。
      // 正解の15を数値パレットへ置かない。
      const bitsPerPixel = source('bits-per-pixel', '1画素あたりのビット数', 15, 'bit/pixel', { implicit: true });
      constant('two', '2進数の基数', 2);
      constant('bit-byte', '換算用の数', 8);
      constant('byte-kilo', '換算用の数', 1000);
      const expectedSize = Image.imageSize(1000, 800, 15, 1000).megabytes;
      task('bits', '1画素あたりのデータ量', 'bit/pixel', 15, [], {
        rule: 'given-value', answerUnitLabel: 'bit。',
        conclusionQuantity: { unit: 'bit/pixel', symbol: 'bits-per-pixel' },
        scaffold: { type: 'given-value', prompt: '問題文より、1画素あたりのデータ量は' }
      });
      task('size', '画像のデータ量', 'MB', expectedSize, imageDataTokens(width, height, bitsPerPixel, 1000), {
        legacyExpectedTokens: imageDataTokens(width, height, bitsPerPixel, 1000, true)
      });
      return definition;
    }
    throw new TypeError(`画像の問題種別が不正です: ${kind}`);
  }

  function defineVideo(kind) {
    if (kind === 'duration') {
      const { definition, source, constant, task } = createDefinition('video-duration');
      const total = source('total', '動画全体のデータ量', 1.5, 'GB');
      const frameSize = source('frame-size', '1フレームのデータ量', 1, 'MB/frame');
      const rate = source('rate', 'フレームレート', 24, 'frame/s');
      constant('mega-giga', '換算用の数', 1024);
      const expected = Video.playbackSeconds(1.5 * 1024 * (1024 ** 2), 1024 ** 2, 24);
      task('duration', '再生時間', 's', expected, [total, op('×'), value(1024), op('÷'), frameSize, op('÷'), rate], {
        legacyExpectedTokens: [total, op('×'), value(1024, 'MB/GB'), op('÷'), frameSize, op('÷'), rate]
      });
      return definition;
    }
    if (kind === 'size') {
      const { definition, source, constant, task } = createDefinition('video-size');
      const width = source('width', '横の画素数', 800, 'pixel');
      const height = source('height', '縦の画素数', 600, 'pixel');
      const bits = source('bits-per-pixel', '1画素あたりのビット数', 24, 'bit/pixel');
      const rate = source('rate', 'フレームレート', 30, 'frame/s');
      const duration = source('duration', '再生時間', 60, 's');
      constant('bit-byte', '換算用の数', 8);
      constant('byte-kilo', '換算用の数', 1000);
      const frameTokens = imageDataTokens(width, height, bits, 1000);
      const legacyFrameTokens = imageDataTokens(width, height, bits, 1000, true);
      const frameBytes = Image.imageSize(800, 600, 24, 1000).bytes;
      const frameMegabytes = Image.imageSize(800, 600, 24, 1000).megabytes;
      const totalMegabytes = Video.videoSize(frameBytes, 30, 60, 1000).megabytes;
      task('frame', '1フレームのデータ量', 'MB', frameMegabytes, frameTokens, { legacyExpectedTokens: legacyFrameTokens });
      task('total', '動画全体のデータ量', 'MB', totalMegabytes, [...frameTokens, op('×'), rate, op('×'), duration], {
        legacyExpectedTokens: [...legacyFrameTokens, op('×'), rate, op('×'), duration]
      });
      return definition;
    }
    throw new TypeError(`動画の問題種別が不正です: ${kind}`);
  }

  return Object.freeze({ defineImage, defineVideo, grade: Grader.grade, gradeRow: Grader.gradeRow });
});
