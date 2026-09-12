(function () {
  'use strict';

  const Core = globalThis.VideoCore;
  const Images = globalThis.ImageCore;
  const clipSeconds = 2;
  const format = value => value.toLocaleString('ja-JP', { maximumFractionDigits: 6 });
  const resized = () => document.dispatchEvent(new CustomEvent('joho:lesson-content-resize'));
  const reveal = host => host.querySelectorAll('.vd-enhancement').forEach(element => { element.hidden = false; });

  function svgNode(name, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  // どのfpsでも、同じ2秒の往復運動から各時刻の位置を取り出す。
  function ballX(seconds) {
    return 160 - 128 * Math.cos(2 * Math.PI * seconds / clipSeconds);
  }

  function createPlayer(host, render, startLabel) {
    const button = host.querySelector('[data-video-play]');
    let elapsed = 0;
    let startedAt = 0;
    let running = false;
    let animation = 0;
    const time = () => (elapsed + (running ? (performance.now() - startedAt) / 1000 : 0)) % clipSeconds;
    function draw() { render(time()); }
    function tick() {
      if (!running) return;
      draw();
      animation = requestAnimationFrame(tick);
    }
    function pause() {
      elapsed = time();
      running = false;
      cancelAnimationFrame(animation);
      button.textContent = startLabel;
      button.setAttribute('aria-pressed', 'false');
      draw();
    }
    function seek(seconds) {
      pause();
      elapsed = seconds % clipSeconds;
      draw();
    }
    button.addEventListener('click', () => {
      if (running) pause();
      else {
        startedAt = performance.now();
        running = true;
        button.textContent = '一時停止';
        button.setAttribute('aria-pressed', 'true');
        tick();
      }
    });
    host.querySelector('[data-video-reset]').addEventListener('click', () => seek(0));
    document.addEventListener('joho:lesson-slide-change', event => {
      if (event.detail.slide !== host.closest('[data-lesson-slide]')) pause();
    });
    document.addEventListener('visibilitychange', () => { if (document.hidden) pause(); });
    window.addEventListener('pagehide', pause);
    window.matchMedia('(prefers-reduced-motion: reduce)').addEventListener('change', event => { if (event.matches) pause(); });
    draw();
    return { time, draw, seek };
  }

  function initializeFrames(host) {
    const fps = 3;
    const count = Core.frameCount(fps, clipSeconds);
    const ball = host.querySelector('[data-video-ball]');
    const caption = host.querySelector('[data-video-frame-caption]');
    const strip = host.querySelector('[data-video-filmstrip]');
    const buttons = [];
    let currentFrame = -1;
    for (let index = 0; index < count; index += 1) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'vd-frame';
      button.setAttribute('aria-label', `フレーム${index + 1}を表示`);
      const svg = svgNode('svg', { viewBox: '0 0 320 150', 'aria-hidden': 'true' });
      svg.append(svgNode('path', { class: 'vd-track', d: 'M32 106H288' }), svgNode('circle', { class: 'vd-ball', cx: ballX(index / fps), cy: 77, r: 22 }));
      const label = document.createElement('span'); label.textContent = `${index + 1}`;
      button.append(svg, label); strip.append(button); buttons.push(button);
    }
    const player = createPlayer(host, seconds => {
      const index = Core.frameAt(seconds, fps, clipSeconds);
      if (index === currentFrame) return;
      currentFrame = index;
      ball.setAttribute('cx', ballX(index / fps));
      caption.textContent = `フレーム${index + 1} / ${count}`;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
    }, '再生');
    buttons.forEach((button, index) => button.addEventListener('click', () => player.seek(index / fps)));
    host.querySelector('[data-video-frame-prev]').addEventListener('click', () => player.seek((Core.frameAt(player.time(), fps, clipSeconds) + count - 1) % count / fps));
    host.querySelector('[data-video-frame-next]').addEventListener('click', () => player.seek((Core.frameAt(player.time(), fps, clipSeconds) + 1) % count / fps));
    reveal(host);
  }

  function initializeRate(host) {
    const input = host.querySelector('[data-video-rate-input]');
    const variable = host.querySelector('[data-video-ball="variable"]');
    const reference = host.querySelector('[data-video-ball="reference"]');
    let fps = Number(input.value);
    let lastVariable = -1;
    let lastReference = -1;
    const player = createPlayer(host, seconds => {
      const variableFrame = Core.frameAt(seconds, fps, clipSeconds);
      const referenceFrame = Core.frameAt(seconds, 30, clipSeconds);
      if (lastVariable !== variableFrame) variable.setAttribute('cx', ballX(variableFrame / fps));
      if (lastReference !== referenceFrame) reference.setAttribute('cx', ballX(referenceFrame / 30));
      lastVariable = variableFrame; lastReference = referenceFrame;
    }, '同時に再生');
    function update() {
      fps = Number(input.value);
      host.querySelector('[data-video-rate-output]').textContent = `${fps}fps`;
      host.querySelector('[data-video-rate-label]').textContent = `${fps}fps`;
      host.querySelector('[data-video-rate-count]').textContent = `1秒間に${fps}枚`;
      host.querySelector('[data-video-rate-interval]').textContent = `1フレームの表示時間：${fps === 1 ? '1秒' : `約${(1 / fps).toFixed(3)}秒`}`;
      input.setAttribute('aria-valuetext', `${fps}fps、1秒間に${fps}枚`);
      lastVariable = -1;
      player.draw();
    }
    input.addEventListener('input', update);
    reveal(host); update();
  }

  function initializeSize(host) {
    const resolution = host.querySelector('[data-video-size-resolution]');
    const fpsControl = host.querySelector('[data-video-size-fps]');
    const secondsControl = host.querySelector('[data-video-size-seconds]');
    function update() {
      const [width, height] = resolution.value.split(',').map(Number);
      const fps = Number(fpsControl.value);
      const seconds = Number(secondsControl.value);
      const frame = Images.imageSize(width, height, 24, 1000);
      const video = Core.videoSize(frame.bytes, fps, seconds, 1000);
      host.querySelector('[data-video-size-frame]').textContent = `${format(frame.megabytes)} MB`;
      host.querySelector('[data-video-size-count]').textContent = `${format(video.frames)} 枚`;
      host.querySelector('[data-video-size-total]').textContent = `${format(video.megabytes)} MB`;
      host.querySelector('[data-video-size-frame-formula]').textContent = `${width}×${height}［画素］×24［bit/画素］÷8÷1000÷1000＝${format(frame.megabytes)}［MB/枚］`;
      host.querySelector('[data-video-size-total-formula]').textContent = `${format(frame.megabytes)}［MB/枚］×${fps}［枚/秒］×${seconds}［秒］＝${format(video.megabytes)}［MB］`;
      resized();
    }
    [resolution, fpsControl, secondsControl].forEach(input => input.addEventListener('change', update));
    host.querySelector('[data-video-size-reset]').addEventListener('click', () => { resolution.value = '800,600'; fpsControl.value = '30'; secondsControl.value = '60'; update(); });
    reveal(host); update();
  }

  function numericAnswer(text) {
    const normalized = text.normalize('NFKC').trim();
    if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d+)?$/.test(normalized)) return NaN;
    return Number(normalized.replaceAll(',', ''));
  }

  function initializeQuiz(host) {
    const frame = Images.imageSize(800, 600, 24, 1000);
    const expected = host.dataset.videoQuiz === 'duration'
      ? { duration: Core.playbackSeconds(1.5 * 1024, 1, 24) }
      : { frame: frame.megabytes, total: Core.videoSize(frame.bytes, 30, 60, 1000).megabytes };
    const labels = { duration: '再生時間', frame: '1フレーム', total: '動画全体' };
    const inputs = [...host.querySelectorAll('input')];
    const feedback = host.querySelector('[data-video-feedback]');
    inputs.forEach(input => input.addEventListener('input', () => { input.removeAttribute('aria-invalid'); feedback.textContent = ''; }));
    host.addEventListener('submit', event => {
      event.preventDefault();
      feedback.textContent = inputs.map(input => {
        const correct = numericAnswer(input.value) === expected[input.name];
        input.setAttribute('aria-invalid', String(!correct));
        return `${labels[input.name]}：${correct ? '○ 正解' : input.value.trim() ? 'もう一度確認' : '未入力'}`;
      }).join(' ／ ');
      resized();
    });
    host.addEventListener('reset', () => { inputs.forEach(input => input.removeAttribute('aria-invalid')); feedback.textContent = ''; resized(); });
    const solution = host.querySelector('[data-video-solution]');
    const steps = [...solution.querySelectorAll('ol > li')];
    const next = solution.querySelector('[data-video-solution-next]');
    let count = 1;
    function updateSolution() {
      steps.forEach((step, index) => { step.hidden = index >= count; });
      next.disabled = count === steps.length;
      next.textContent = next.disabled ? '解説はここまで' : '次へ';
      next.setAttribute('aria-label', next.disabled ? '解説はここまで' : `解説の次の段階を表示（${count + 1} / ${steps.length}）`);
      resized();
    }
    next.addEventListener('click', () => { count = Math.min(steps.length, count + 1); updateSolution(); });
    solution.querySelector('[data-video-solution-reset]').addEventListener('click', () => { count = 1; updateSolution(); });
    host.querySelector('details').addEventListener('toggle', resized);
    reveal(host); updateSolution();
  }

  function initialize() {
    if (!Core || !Images) return;
    for (const [selector, setup] of [
      ['[data-video-frames]', initializeFrames], ['[data-video-rate]', initializeRate],
      ['[data-video-size]', initializeSize], ['[data-video-quiz]', initializeQuiz]
    ]) {
      document.querySelectorAll(selector).forEach(host => {
        try { setup(host); }
        catch (error) { console.error('動画教材の初期化に失敗しました', error); }
      });
    }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', initialize, { once: true });
  else initialize();
})();
