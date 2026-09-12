(function (root) {
  'use strict';

  const MAX_SAFE = Number.MAX_SAFE_INTEGER;

  function positiveInteger(value, name) {
    if (!Number.isSafeInteger(value) || value < 1) throw new RangeError(`${name}は正の整数で指定してください`);
    return value;
  }

  function positiveFinite(value, name) {
    if (!Number.isFinite(value) || value <= 0) throw new RangeError(`${name}は0より大きい有限の数値で指定してください`);
    return value;
  }

  function nonnegativeFinite(value, name) {
    if (!Number.isFinite(value) || value < 0 || value > MAX_SAFE) throw new RangeError(`${name}は0以上の有限の数値で指定してください`);
    return value;
  }

  function conversionBase(base) {
    if (base !== 1000 && base !== 1024) throw new RangeError('換算基準は1000または1024です');
    return base;
  }

  function frameCount(fps, seconds) {
    const frames = positiveInteger(fps, 'フレームレート') * positiveFinite(seconds, '時間');
    if (!Number.isSafeInteger(frames)) throw new RangeError('フレーム数は正の安全な整数になるように指定してください');
    return frames;
  }

  // 浮動小数点の丸めで、ちょうどフレーム境界の時刻が1コマ前にならないようにする。
  function framePosition(elapsedSeconds, fps) {
    const position = nonnegativeFinite(elapsedSeconds, '経過時間') * positiveInteger(fps, 'フレームレート');
    if (!Number.isSafeInteger(position) && position > MAX_SAFE) throw new RangeError('経過時間が大きすぎます');
    const nearest = Math.round(position);
    const tolerance = Number.EPSILON * Math.max(1, Math.abs(position)) * 8;
    return Math.abs(position - nearest) <= tolerance ? nearest : Math.floor(position);
  }

  function frameAt(elapsedSeconds, fps, durationSeconds) {
    const frames = frameCount(fps, durationSeconds);
    return framePosition(elapsedSeconds, fps) % frames;
  }

  function videoSize(frameBytes, fps, seconds, base = 1000) {
    const frames = frameCount(fps, seconds);
    const bytesPerFrame = positiveFinite(frameBytes, '1フレームのデータ量');
    if (bytesPerFrame > MAX_SAFE || frames * bytesPerFrame > MAX_SAFE) throw new RangeError('動画のデータ量が大きすぎます');
    const unit = conversionBase(base);
    const bytes = frames * bytesPerFrame;
    return { frames, bytes, kilobytes: bytes / unit, megabytes: bytes / unit ** 2 };
  }

  function playbackSeconds(totalBytes, frameBytes, fps) {
    const bytes = nonnegativeFinite(totalBytes, '全データ量');
    const bytesPerSecond = positiveFinite(frameBytes, '1フレームのデータ量') * positiveInteger(fps, 'フレームレート');
    if (bytesPerSecond > MAX_SAFE) throw new RangeError('1秒あたりのデータ量が大きすぎます');
    return bytes / bytesPerSecond;
  }

  root.VideoCore = Object.freeze({ frameCount, frameAt, videoSize, playbackSeconds });
})(globalThis);
