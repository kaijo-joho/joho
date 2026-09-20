(function () {
  'use strict';

  function svgNode(name, attributes) {
    const element = document.createElementNS('http://www.w3.org/2000/svg', name);
    Object.entries(attributes).forEach(([key, value]) => element.setAttribute(key, String(value)));
    return element;
  }

  function createPose(phase) {
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

  globalThis.BirdFrames = { createPose };
}());
