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

  // 一周分の歩行を静止画にする。再生時には、この絵を補間せず切り替える。
  function walkingPose(phase) {
    const bob = 2 * Math.cos(4 * Math.PI * phase);
    const hip = { x: 155, y: 78 + bob };
    const shoulder = { x: 160, y: 48 + bob };
    const point = p => `${p.x.toFixed(2)} ${p.y.toFixed(2)}`;
    const pose = svgNode('g', { class: 'vd-walker' });
    function leg(cycle, rear) {
      const swing = Math.max(0, (cycle - 0.5) * 2);
      const ankle = {
        x: cycle < 0.5 ? 175 - 80 * cycle : 135 + 20 * (1 - Math.cos(Math.PI * swing)),
        y: 122 - 13 * Math.sin(Math.PI * swing)
      };
      const dx = ankle.x - hip.x;
      const dy = ankle.y - hip.y;
      const distance = Math.hypot(dx, dy);
      const bend = Math.sqrt(25 ** 2 - (distance / 2) ** 2);
      const knee = { x: (hip.x + ankle.x) / 2 + dy / distance * bend, y: (hip.y + ankle.y) / 2 - dx / distance * bend };
      return svgNode('path', {
        class: rear ? 'vd-walker-rear' : 'vd-walker-front',
        d: `M${point(hip)} L${point(knee)} L${point(ankle)} M${point({ x: ankle.x - 4, y: ankle.y })} h12`
      });
    }
    function arm(cycle, rear) {
      const angle = -0.6 * Math.cos(2 * Math.PI * cycle);
      const elbow = { x: shoulder.x + 19 * Math.sin(angle), y: shoulder.y + 19 * Math.cos(angle) };
      const hand = { x: elbow.x + 18 * Math.sin(angle + 0.5), y: elbow.y + 18 * Math.cos(angle + 0.5) };
      return svgNode('path', { class: rear ? 'vd-walker-rear' : 'vd-walker-front', d: `M${point(shoulder)} L${point(elbow)} L${point(hand)}` });
    }
    const opposite = (phase + 0.5) % 1;
    pose.append(
      arm(opposite, true), leg(opposite, true),
      svgNode('path', { d: `M160 ${39 + bob} L${point(shoulder)} L${point(hip)}` }),
      svgNode('circle', { class: 'vd-walker-head', cx: 162, cy: 28 + bob, r: 11 }),
      svgNode('circle', { class: 'vd-walker-eye', cx: 166, cy: 26.5 + bob, r: 1.3 }),
      leg(phase, false), arm(phase, false)
    );
    return pose;
  }

  function onGround(pose) {
    const frame = svgNode('g', {});
    frame.append(svgNode('path', { class: 'vd-track', d: 'M104 125H216' }), pose);
    return frame;
  }

  function birdPose(phase) {
    const lift = Math.cos(2 * Math.PI * phase);
    const pose = svgNode('g', { class: 'vd-bird', transform: `translate(0 ${3 * Math.sin(2 * Math.PI * phase)})` });
    const wing = (rear) => svgNode('path', {
      class: rear ? 'vd-bird-wing vd-bird-wing--rear' : 'vd-bird-wing',
      d: `M158 75 Q146 ${72 - 18 * lift} 124 ${72 - 46 * lift} L143 ${82 - 22 * lift} Q154 82 168 77 Z`,
      transform: rear ? 'translate(8 -4)' : ''
    });
    pose.append(
      wing(true),
      svgNode('path', { class: 'vd-bird-body', d: 'M139 73 L113 62 L121 82 L140 82 Z' }),
      svgNode('ellipse', { class: 'vd-bird-body', cx: 155, cy: 77, rx: 26, ry: 12 }),
      svgNode('path', { class: 'vd-bird-beak', d: 'M185 62 L200 68 L186 72 Z' }),
      svgNode('circle', { class: 'vd-bird-body', cx: 180, cy: 67, r: 11 }),
      svgNode('circle', { class: 'vd-bird-eye', cx: 184, cy: 65, r: 1.8 }),
      wing(false)
    );
    return pose;
  }

  function jumpingPose(index) {
    // しゃがむ→踏み切る→上昇→下降→着地の12枚。
    const [crouch, height, arms] = [
      [0, 0, 0], [6, 0, 0.05], [13, 0, 0], [2, 12, 0.6],
      [0, 25, 1], [0, 34, 1], [0, 37, 0.9], [0, 34, 0.8],
      [0, 25, 0.6], [0, 10, 0.3], [11, 0, 0.1], [4, 0, 0]
    ][index];
    const hipY = 98 + crouch - height;
    const shoulderY = 74 + crouch - height;
    const headY = 52 + crouch - height;
    const ankleY = 122 - height;
    const pose = svgNode('g', { class: 'vd-walker vd-jumper' });
    for (const side of [-1, 1]) {
      const kneeX = 160 + side * (14 + crouch * 0.6);
      const kneeY = (hipY + ankleY) / 2;
      const ankleX = 160 + side * 14;
      pose.append(
        svgNode('path', { d: `M160 ${hipY} L${kneeX} ${kneeY} L${ankleX} ${ankleY} h${side * 7}` }),
        svgNode('path', { d: `M160 ${shoulderY} L${160 + side * 18} ${shoulderY + 14 - arms * 22} L${160 + side * 23} ${shoulderY + 27 - arms * 52}` })
      );
    }
    pose.append(
      svgNode('path', { d: `M160 ${headY + 10} V${hipY}` }),
      svgNode('circle', { class: 'vd-walker-head', cx: 160, cy: headY, r: 10 }),
      svgNode('circle', { class: 'vd-walker-eye', cx: 157, cy: headY - 1, r: 1 }),
      svgNode('circle', { class: 'vd-walker-eye', cx: 163, cy: headY - 1, r: 1 })
    );
    return pose;
  }

  function blocksPose(index) {
    const second = [[114, 102], [114, 76], [136, 68], [150, 82], [150, 82], [150, 82], [150, 82], [150, 82], [150, 82], [150, 82], [136, 68], [114, 76]][index];
    const third = [[186, 102], [186, 102], [186, 102], [186, 102], [186, 66], [168, 50], [150, 62], [168, 50], [186, 66], [186, 102], [186, 102], [186, 102]][index];
    const pose = svgNode('g', { class: 'vd-blocks' });
    [[150, 102], second, third].forEach(([x, y], i) => {
      const block = svgNode('g', { transform: `translate(${x} ${y})` });
      const number = svgNode('text', { class: 'vd-block-number', x: 10, y: 14 });
      number.textContent = String(i + 1);
      block.append(svgNode('rect', { class: `vd-block vd-block--${i + 1}`, width: 20, height: 20, rx: 1.5 }), number);
      pose.append(block);
    });
    return pose;
  }

  const frameExamples = {
    walk: { subject: '棒人間が歩く', change: '手足の姿勢', makeFrame: (phase) => onGround(walkingPose(phase)) },
    bird: { subject: '鳥が羽ばたく', change: '羽の角度', makeFrame: birdPose },
    jump: { subject: '棒人間がジャンプする', change: '体の高さと手足の姿勢', makeFrame: (_, index) => onGround(jumpingPose(index)) },
    blocks: { subject: '積み木を積み上げて元に戻す', change: '積み木の位置', makeFrame: (_, index) => onGround(blocksPose(index)) }
  };

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
    const fps = 6;
    const count = Core.frameCount(fps, clipSeconds);
    const artwork = host.querySelector('[data-video-artwork]');
    const caption = host.querySelector('[data-video-frame-caption]');
    const strip = host.querySelector('[data-video-filmstrip]');
    const frames = Object.fromEntries(Object.entries(frameExamples).map(([key, example]) => [
      key, Array.from({ length: count }, (_, index) => example.makeFrame(index / count, index))
    ]));
    let poses = frames.walk;
    const buttons = [];
    let currentFrame = -1;
    for (let index = 0; index < count; index += 1) {
      const button = document.createElement('button');
      button.type = 'button'; button.className = 'vd-frame';
      button.setAttribute('aria-label', `フレーム${index + 1}を表示`);
      const svg = svgNode('svg', { viewBox: '90 0 140 150', 'aria-hidden': 'true' });
      svg.append(poses[index].cloneNode(true));
      const label = document.createElement('span'); label.textContent = `${index + 1}`;
      button.append(svg, label); strip.append(button); buttons.push(button);
    }
    const player = createPlayer(host, seconds => {
      const index = Core.frameAt(seconds, fps, clipSeconds);
      if (index === currentFrame) return;
      currentFrame = index;
      artwork.replaceChildren(poses[index].cloneNode(true));
      caption.textContent = `フレーム${index + 1} / ${count}`;
      buttons.forEach((button, i) => button.setAttribute('aria-pressed', String(i === index)));
      // 一覧の中だけを横に送り、再生中も選択中のフレームを見える位置に保つ。
      if (strip.clientWidth) {
        const selected = buttons[index].getBoundingClientRect();
        const viewport = strip.getBoundingClientRect();
        if (selected.left < viewport.left + 4) strip.scrollLeft += selected.left - viewport.left - 4;
        else if (selected.right > viewport.right - 4) strip.scrollLeft += selected.right - viewport.right + 4;
      }
    }, '再生');
    buttons.forEach((button, index) => button.addEventListener('click', () => player.seek(index / fps)));
    host.querySelector('[data-video-frame-prev]').addEventListener('click', () => player.seek((Core.frameAt(player.time(), fps, clipSeconds) + count - 1) % count / fps));
    host.querySelector('[data-video-frame-next]').addEventListener('click', () => player.seek((Core.frameAt(player.time(), fps, clipSeconds) + 1) % count / fps));
    const exampleSelect = host.querySelector('[data-video-example]');
    exampleSelect.addEventListener('change', () => {
      const example = frameExamples[exampleSelect.value];
      if (!example) return;
      player.seek(0);
      poses = frames[exampleSelect.value];
      buttons.forEach((button, index) => button.querySelector('svg').replaceChildren(poses[index].cloneNode(true)));
      host.querySelector('[data-video-frame-intro]').textContent = `${example.subject}2秒間の動きを、${count}枚のフレームで表してみましょう。`;
      host.querySelector('#vd-frame-title').textContent = `${example.subject}動きを表すフレーム`;
      host.querySelector('#vd-frame-desc').textContent = `${example.change}を少しずつ変えた${count}枚の静止画を順に表示します。一覧の画像や前後のボタンで一枚ずつ確認できます。`;
      host.querySelector('[data-video-frame-hint]').textContent = `一枚ずつ見ると、${example.change}が異なる静止画です。「再生」で順に切り替えると、動きとして見えます。一覧の枠は現在のフレームを示します。`;
      currentFrame = -1;
      player.draw();
      resized();
    });
    // WebKitでも例の選択・コマ送り・再生へTabキーで移れるようにする。
    host.querySelectorAll('button, select').forEach(element => { element.tabIndex = 0; });
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

  function initializeCompression(host) {
    const timeline = host.querySelector('.vd-compression-timeline');
    const result = host.querySelector('[data-video-rebuild]');
    const pixels = host.querySelector('[data-video-rebuilt-pixels]');
    const outlines = host.querySelector('[data-video-rebuilt-outlines]');
    const next = host.querySelector('[data-video-rebuild-next]');
    const reset = host.querySelector('[data-video-rebuild-reset]');
    const count = host.querySelectorAll('[id^="vd-compression-frame-"]').length;
    let frame = 1;

    function update() {
      result.dataset.frame = String(frame);
      host.querySelector('[data-video-rebuilt-caption]').textContent = `復元したフレーム${frame}`;
      host.querySelector('#vd-rebuilt-title').textContent = `フレーム${frame}を復元した画像`;
      host.querySelector('#vd-rebuilt-desc').textContent = frame === 1
        ? '最初のフレームは、背景と鳥を含む画像全体を読み込みます。'
        : `直前のフレーム${frame - 1}へ2か所の変化部分を重ねた画像です。鳥の移動前の場所を背景に戻し、移動先に鳥を描いています。`;
      host.querySelector('[data-video-rebuild-status]').textContent = frame === 1
        ? '最初は、フレーム1の画像全体を読み込みます。'
        : `フレーム${frame - 1}に「${frame - 1}→${frame}の変化」を重ねました。鳥がいた場所を背景に戻し、移動先に鳥を描きます。`;
      next.setAttribute('aria-disabled', String(frame === count));
      next.textContent = frame === count ? '4枚の復元が完了' : '次のフレームを復元';
      next.setAttribute('aria-label', frame === count ? '4枚の復元が完了' : `次のフレーム${frame + 1}を復元`);
      host.querySelectorAll('[data-video-compression-frame]').forEach(figure => {
        figure.dataset.current = String(Number(figure.dataset.videoCompressionFrame) === frame);
      });
      // 上下2行の対応を保ち、比較表の中だけを横に送る。
      const selected = host.querySelector('[data-video-compression-frame][data-current="true"]').getBoundingClientRect();
      const viewport = timeline.getBoundingClientRect();
      if (selected.left < viewport.left + 4) timeline.scrollLeft += selected.left - viewport.left - 4;
      else if (selected.right > viewport.right - 4) timeline.scrollLeft += selected.right - viewport.right + 4;
      resized();
    }

    next.addEventListener('click', () => {
      if (frame >= count) return;
      frame += 1;
      // 全画像への差し替えではなく、前の復元画像へ変化範囲だけを重ねる。
      pixels.append(svgNode('use', { href: `#vd-compression-delta-${frame}` }));
      outlines.replaceChildren(...[...host.querySelectorAll(`#vd-compression-change-${frame} rect`)].map(rect => {
        const outline = rect.cloneNode(true);
        outline.setAttribute('class', 'vd-change-outline');
        return outline;
      }));
      update();
    });
    reset.addEventListener('click', () => {
      frame = 1;
      pixels.replaceChildren(svgNode('use', { href: '#vd-compression-frame-1' }));
      outlines.replaceChildren();
      update();
    });
    host.querySelectorAll('button').forEach(button => { button.tabIndex = 0; });
    reveal(host);
    update();
  }

  function initializeSize(host) {
    const resolution = host.querySelector('[data-video-size-resolution]');
    const bitsControl = host.querySelector('[data-video-size-bits]');
    const fpsControl = host.querySelector('[data-video-size-fps]');
    const secondsControl = host.querySelector('[data-video-size-seconds]');
    function update() {
      const [width, height] = resolution.value.split(',').map(Number);
      const bits = Number(bitsControl.value);
      const fps = Number(fpsControl.value);
      const seconds = Number(secondsControl.value);
      const frame = Images.imageSize(width, height, bits, 1000);
      const video = Core.videoSize(frame.bytes, fps, seconds, 1000);
      host.querySelector('[data-video-size-frame]').textContent = `${format(frame.megabytes)} MB`;
      host.querySelector('[data-video-size-count]').textContent = `${format(video.frames)} 枚`;
      host.querySelector('[data-video-size-total]').textContent = `${format(video.megabytes)} MB`;
      host.querySelector('[data-video-size-color-note]').textContent = `${format(2 ** bits)}色${bits === 24 ? '（24ビットフルカラー）' : ''}は、1画素あたり${bits}bitです。`;
      host.querySelector('[data-video-size-pixels-formula]').textContent = `${format(width)} × ${format(height)} ＝ ${format(frame.pixels)}画素`;
      host.querySelector('[data-video-size-frame-formula]').textContent = `${format(frame.pixels)} × ${bits}\n÷ 8 ÷ 1000 ÷ 1000`;
      host.querySelector('[data-video-size-count-formula]').textContent = `${fps}［枚/秒］× ${seconds}［秒］`;
      host.querySelector('[data-video-size-total-formula]').textContent = `${format(frame.megabytes)}［MB/枚］\n× ${format(video.frames)}［枚］`;
      resized();
    }
    [resolution, bitsControl, fpsControl, secondsControl].forEach(input => input.addEventListener('change', update));
    host.querySelector('[data-video-size-reset]').addEventListener('click', () => { resolution.value = '800,600'; bitsControl.value = '24'; fpsControl.value = '30'; secondsControl.value = '60'; update(); });
    host.querySelectorAll('select, button').forEach(control => { control.tabIndex = 0; });
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
      ['[data-video-compression]', initializeCompression],
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
