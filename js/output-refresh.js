(function () {
  'use strict';

  const WINDOW_SECONDS = 0.1;
  const WING_PERIOD_SECONDS = 0.5;
  const DEFAULT_FPS = 60;
  const DEFAULT_HZ = 30;
  const DEFAULT_SPEED_INDEX = 2;
  const RATE_VALUES = [30, 60, 120];
  const SPEED_VALUES = [0.05, 0.1, 0.25, 0.5, 1];

  function svgElement(name, attributes = {}) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function element(name, className, text) {
    const node = document.createElement(name);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function formatSeconds(seconds) {
    return seconds.toLocaleString('ja-JP', { minimumFractionDigits: 3, maximumFractionDigits: 3 });
  }

  function initialize(host) {
    if (host.dataset.outputRefreshInitialized === 'true') return;
    const Core = globalThis.OutputCore;
    const Bird = globalThis.BirdFrames;
    if (!Core || !Bird?.createPose) return;

    const sourceFrames = host.querySelector('[data-output-refresh-source-frames]');
    const displayFrames = host.querySelector('[data-output-refresh-display-frames]');
    const sourceLabel = host.querySelector('[data-output-refresh-source-label]');
    const displayLabel = host.querySelector('[data-output-refresh-display-label]');
    const preview = host.querySelector('[data-output-refresh-bird]');
    const description = host.querySelector('[data-output-refresh-desc]');
    const current = host.querySelector('[data-output-refresh-current]');
    const note = host.querySelector('[data-output-refresh-note]');
    const windowLabel = host.querySelector('[data-output-refresh-window]');
    const play = host.querySelector('[data-output-refresh-play]');
    const reset = host.querySelector('[data-output-refresh-reset]');
    const fpsButtons = [...host.querySelectorAll('[data-output-refresh-fps] button')];
    const hzButtons = [...host.querySelectorAll('[data-output-refresh-hz] button')];
    const speed = host.querySelector('[data-output-refresh-speed]');
    const speedOutput = host.querySelector('[data-output-refresh-speed-output]');
    if (![sourceFrames, displayFrames, sourceLabel, displayLabel, preview, description, current, note, windowLabel, play, reset, speed, speedOutput].every(Boolean)) return;

    const slide = host.closest('[data-lesson-slide]');
    const media = window.matchMedia('(prefers-reduced-motion: reduce)');
    const poseCache = new Map();
    let fps = DEFAULT_FPS;
    let hz = DEFAULT_HZ;
    let speedIndex = DEFAULT_SPEED_INDEX;
    let playbackSpeed = SPEED_VALUES[speedIndex];
    let videoTime = 0;
    let startedAt = 0;
    let running = false;
    let animationFrame = 0;
    let userPaused = media.matches;
    let renderedWindow = -1;
    let renderedUpdate = -1;
    let plan = Core.refreshFrames(fps, hz, WINDOW_SECONDS);
    let updatesPerPeriod = Math.round(WING_PERIOD_SECONDS * hz);
    let updatesPerWindow = plan.updateCount;

    function active() {
      return !slide || slide.classList.contains('is-current');
    }

    function canPlay() {
      return active() && !document.hidden;
    }

    function elapsedVideoTime() {
      if (!running) return videoTime;
      return videoTime + ((performance.now() - startedAt) / 1000) * playbackSpeed;
    }

    function pause() {
      if (!running) return;
      videoTime = elapsedVideoTime();
      running = false;
      cancelAnimationFrame(animationFrame);
      updatePlayButton();
    }

    function poseFor(frame) {
      const key = `${fps}:${frame}`;
      if (!poseCache.has(key)) {
        const phase = ((frame - 1) / fps) / WING_PERIOD_SECONDS;
        poseCache.set(key, Bird.createPose(phase));
      }
      return poseCache.get(key);
    }

    function frameCell(frame, display) {
      const cell = element('span', 'or-frame');
      cell.dataset.frame = String(frame);
      const svg = svgElement('svg', { viewBox: '95 10 120 124', 'aria-hidden': 'true' });
      svg.append(poseFor(frame).cloneNode(true));
      const number = element('b', 'or-frame__number', String(frame));
      cell.append(svg, number);
      if (display) cell.classList.add('or-frame--display');
      return cell;
    }

    function updateRateButtons(buttons, value) {
      buttons.forEach(button => {
        const selected = Number(button.value) === value;
        button.classList.toggle('is-selected', selected);
        button.setAttribute('aria-pressed', String(selected));
      });
    }

    function updatePlayButton() {
      play.textContent = running ? '一時停止' : '再生';
      play.setAttribute('aria-pressed', String(running));
      play.setAttribute('aria-label', running ? '鳥の連続再生を一時停止' : '鳥の連続再生を開始');
    }

    function configurePlan() {
      plan = Core.refreshFrames(fps, hz, WINDOW_SECONDS);
      updatesPerPeriod = Math.round(WING_PERIOD_SECONDS * hz);
      updatesPerWindow = plan.updateCount;
    }

    function updatePosition(time) {
      const updateTick = Math.floor(time * hz + 1e-8) % updatesPerPeriod;
      return {
        windowIndex: Math.floor(updateTick / updatesPerWindow),
        updateIndex: updateTick % updatesPerWindow
      };
    }

    function renderWindow(windowIndex) {
      if (windowIndex === renderedWindow) return;
      renderedWindow = windowIndex;
      const start = windowIndex * WINDOW_SECONDS;
      const sourceStart = Math.round(start * fps) + 1;
      const source = Array.from({ length: plan.sourceCount }, (_, index) => sourceStart + index);
      const displayed = plan.frames.map(entry => sourceStart + entry.frame - 1);
      sourceFrames.replaceChildren(...source.map(frame => frameCell(frame, false)));
      displayFrames.replaceChildren(...displayed.map(frame => frameCell(frame, true)));
      sourceFrames.style.setProperty('--or-columns', plan.sourceCount);
      displayFrames.style.setProperty('--or-columns', plan.updateCount);
      sourceLabel.textContent = `動画 ${fps}fps：${formatSeconds(start)}秒〜${formatSeconds(start + WINDOW_SECONDS)}秒`;
      displayLabel.textContent = `画面 ${hz}Hz：この0.1秒に${plan.updateCount}回更新`;
      windowLabel.textContent = `表示中の区間：${formatSeconds(start)}秒〜${formatSeconds(start + WINDOW_SECONDS)}秒`;
      const relation = hz < fps
        ? `動画の${plan.sourceCount}枚から${plan.uniqueCount}枚を選びます。`
        : hz > fps
          ? '画面の更新のたび、同じ動画フレームをもう一度表示する場合があります。'
          : '動画の各フレームを1回ずつ画面へ渡します。';
      note.textContent = `${fps}fps・${hz}Hz：${displayed.join(' → ')}。${relation}`;
      renderedUpdate = -1;
    }

    function draw(time = elapsedVideoTime()) {
      const position = updatePosition(time);
      renderWindow(position.windowIndex);
      if (position.updateIndex === renderedUpdate) return;
      renderedUpdate = position.updateIndex;
      const windowStart = position.windowIndex * WINDOW_SECONDS;
      const sourceStart = Math.round(windowStart * fps) + 1;
      const displayedFrame = sourceStart + plan.frames[position.updateIndex].frame - 1;
      sourceFrames.querySelectorAll('.or-frame').forEach(cell => cell.classList.toggle('is-current', Number(cell.dataset.frame) === displayedFrame));
      displayFrames.querySelectorAll('.or-frame').forEach((cell, index) => cell.classList.toggle('is-current', index === position.updateIndex));
      preview.replaceChildren(poseFor(displayedFrame).cloneNode(true));
      description.textContent = `時刻${formatSeconds(windowStart + position.updateIndex / hz)}秒。フレーム${displayedFrame}の鳥を表示しています。`;
      current.textContent = `画面の更新 ${position.updateIndex + 1} / ${plan.updateCount}：フレーム${displayedFrame}を表示`;
    }

    function tick() {
      if (!running) return;
      draw();
      animationFrame = requestAnimationFrame(tick);
    }

    function start() {
      if (!canPlay() || running) return;
      startedAt = performance.now();
      running = true;
      updatePlayButton();
      tick();
    }

    function setRate(kind, value) {
      if (!RATE_VALUES.includes(value)) return;
      pause();
      if (kind === 'fps') fps = value;
      else hz = value;
      videoTime = 0;
      renderedWindow = -1;
      configurePlan();
      updateRateButtons(fpsButtons, fps);
      updateRateButtons(hzButtons, hz);
      draw(videoTime);
      if (!userPaused) start();
    }

    function speedLabel(value) {
      const labels = new Map([
        [0.05, '1/20の速さ'], [0.1, '1/10の速さ'], [0.25, '1/4の速さ'], [0.5, '1/2の速さ'], [1, '等速']
      ]);
      return `${value}×（${labels.get(value)}）`;
    }

    function setSpeed(index) {
      if (!Number.isInteger(index) || index < 0 || index >= SPEED_VALUES.length) return;
      const now = elapsedVideoTime();
      speedIndex = index;
      playbackSpeed = SPEED_VALUES[index];
      videoTime = now;
      startedAt = performance.now();
      speed.value = String(index);
      speedOutput.textContent = speedLabel(playbackSpeed);
      speed.setAttribute('aria-valuetext', `再生速度${speedLabel(playbackSpeed)}`);
      draw(now);
    }

    fpsButtons.forEach(button => button.addEventListener('click', () => setRate('fps', Number(button.value))));
    hzButtons.forEach(button => button.addEventListener('click', () => setRate('hz', Number(button.value))));
    speed.addEventListener('input', () => setSpeed(Number(speed.value)));
    play.addEventListener('click', () => {
      if (running) {
        userPaused = true;
        pause();
      } else {
        userPaused = false;
        start();
      }
    });
    reset.addEventListener('click', () => {
      pause();
      fps = DEFAULT_FPS;
      hz = DEFAULT_HZ;
      videoTime = 0;
      userPaused = media.matches;
      renderedWindow = -1;
      configurePlan();
      updateRateButtons(fpsButtons, fps);
      updateRateButtons(hzButtons, hz);
      setSpeed(DEFAULT_SPEED_INDEX);
      draw(0);
      if (!userPaused) start();
    });
    document.addEventListener('joho:lesson-slide-change', event => {
      if (event.detail.slide === slide) {
        if (!userPaused) start();
      } else pause();
    });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) pause();
      else if (!userPaused) start();
    });
    window.addEventListener('pagehide', pause);
    media.addEventListener('change', event => {
      if (event.matches) {
        userPaused = true;
        pause();
      }
      updatePlayButton();
    });

    host.dataset.outputRefreshInitialized = 'true';
    updateRateButtons(fpsButtons, fps);
    updateRateButtons(hzButtons, hz);
    setSpeed(speedIndex);
    draw(0);
    if (!userPaused) start();
    host.querySelectorAll('.op-enhancement').forEach(node => { node.hidden = false; });
  }

  globalThis.OutputRefresh = Object.freeze({ initialize });
}());
