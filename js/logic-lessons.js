(function () {
  'use strict';

  let vennSerial = 0;

  const VENN_DESCRIPTIONS = Object.freeze({
    AND: 'AとBの共通部分だけに色を付けたベン図です。',
    OR: 'AまたはBに含まれる範囲に色を付けたベン図です。',
    NOT: '全体からAを除いた範囲に色を付けたベン図です。',
    NAND: '全体からAとBの共通部分を除いた範囲に色を付けたベン図です。',
    NOR: 'AにもBにも含まれない範囲に色を付けたベン図です。',
    XOR: 'AとBの一方だけに含まれる範囲に色を付けたベン図です。'
  });

  function renderGateIcons(scope) {
    const Renderer = window.LogicRenderer;
    scope.querySelectorAll('[data-logic-gate-icon]').forEach(target => {
      const gate = String(target.dataset.logicGateIcon || '').toUpperCase();
      const geometry = Renderer.gateGeometry(gate);
      const center = { x: 55, y: 35 };
      const svg = Renderer.svgElement('svg', {
        class: 'logic-gate-icon',
        viewBox: '0 0 110 70',
        role: 'img',
        'aria-label': `${gate}ゲートの回路記号`,
        preserveAspectRatio: 'xMidYMid meet'
      });
      geometry.inputYs.forEach(offsetY => {
        svg.appendChild(Renderer.svgElement('line', {
          class: 'logic-gate-icon__wire',
          x1: 5,
          y1: center.y + offsetY,
          x2: center.x + geometry.inputX,
          y2: center.y + offsetY
        }));
      });
      svg.appendChild(Renderer.svgElement('line', {
        class: 'logic-gate-icon__wire',
        x1: center.x + geometry.outputX,
        y1: center.y,
        x2: 105,
        y2: center.y
      }));
      const symbol = Renderer.createGateSymbol(gate, center.x, center.y);
      symbol.querySelector('title')?.remove();
      symbol.setAttribute('aria-hidden', 'true');
      svg.appendChild(symbol);
      target.replaceChildren(svg);
    });
  }

  function renderVennDiagram(target) {
    const Renderer = window.LogicRenderer;
    const operation = String(target.dataset.logicVenn || '').toUpperCase();
    if (!VENN_DESCRIPTIONS[operation]) return;

    const id = `logic-venn-mask-${++vennSerial}`;
    const clipId = `${id}-intersection`;
    const binary = operation !== 'NOT';
    const frame = { x: 7, y: 7, width: 266, height: 176 };
    const circleA = binary
      ? { cx: 108, cy: 92, r: 58 }
      : { cx: 140, cy: 92, r: 60 };
    const circleB = { cx: 172, cy: 92, r: 58 };
    const svg = Renderer.svgElement('svg', {
      class: 'logic-venn',
      viewBox: '0 0 280 190',
      role: 'img',
      'aria-labelledby': `${id}-title`,
      'aria-describedby': `${id}-description`,
      preserveAspectRatio: 'xMidYMid meet'
    });
    const defs = Renderer.svgElement('defs');
    const clip = Renderer.svgElement('clipPath', { id: clipId });
    clip.appendChild(Renderer.svgElement('circle', circleB));
    const mask = Renderer.svgElement('mask', {
      id,
      x: frame.x,
      y: frame.y,
      width: frame.width,
      height: frame.height,
      maskUnits: 'userSpaceOnUse',
      style: 'mask-type: luminance'
    });
    const addRect = fill => mask.appendChild(Renderer.svgElement('rect', { ...frame, rx: 12, fill }));
    const addCircle = (circle, fill, clipped = false) => mask.appendChild(Renderer.svgElement('circle', {
      ...circle,
      fill,
      'clip-path': clipped ? `url(#${clipId})` : null
    }));

    if (operation === 'AND') {
      addCircle(circleA, '#fff', true);
    } else if (operation === 'OR') {
      addCircle(circleA, '#fff');
      addCircle(circleB, '#fff');
    } else if (operation === 'NOT') {
      addRect('#fff');
      addCircle(circleA, '#000');
    } else if (operation === 'NAND') {
      addRect('#fff');
      addCircle(circleA, '#000', true);
    } else if (operation === 'NOR') {
      addRect('#fff');
      addCircle(circleA, '#000');
      addCircle(circleB, '#000');
    } else if (operation === 'XOR') {
      addCircle(circleA, '#fff');
      addCircle(circleB, '#fff');
      addCircle(circleA, '#000', true);
    }

    defs.append(clip, mask);
    svg.append(
      Renderer.svgElement('title', { id: `${id}-title` }, `${operation}のベン図`),
      Renderer.svgElement('desc', { id: `${id}-description` }, VENN_DESCRIPTIONS[operation]),
      defs,
      Renderer.svgElement('rect', { class: 'logic-venn__frame', ...frame, rx: 12 }),
      Renderer.svgElement('rect', {
        class: 'logic-venn__active',
        ...frame,
        rx: 12,
        mask: `url(#${id})`
      }),
      Renderer.svgElement('circle', { class: 'logic-venn__set', ...circleA })
    );
    if (binary) svg.appendChild(Renderer.svgElement('circle', { class: 'logic-venn__set', ...circleB }));
    svg.appendChild(Renderer.svgElement('text', {
      class: 'logic-venn__label',
      x: binary ? 88 : 140,
      y: 100,
      'text-anchor': 'middle'
    }, 'A'));
    if (binary) {
      svg.appendChild(Renderer.svgElement('text', {
        class: 'logic-venn__label',
        x: 192,
        y: 100,
        'text-anchor': 'middle'
      }, 'B'));
    }

    const caption = document.createElement('figcaption');
    caption.textContent = `色の部分（F = 1）：${target.dataset.caption || operation}`;
    target.replaceChildren(svg, caption);
  }

  function renderVennDiagrams(scope) {
    scope.querySelectorAll('[data-logic-venn]').forEach(renderVennDiagram);
  }

  function initialize() {
    if (!window.LogicWidgets || !window.LogicRenderer) return;
    renderGateIcons(document);
    renderVennDiagrams(document);
    window.logicLessonExplorers = window.LogicWidgets.initializeExplorers(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initialize, { once: true });
  } else {
    initialize();
  }
})();
