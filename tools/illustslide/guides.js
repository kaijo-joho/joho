/* illustSlide: 図形全体の移動・サイズ変更で使う位置合わせ。作品は変更しない。 */
(function (root) {
  'use strict';
  const EPS = 1e-6;
  const axes = { x: { size: 'width', cross: 'y', crossSize: 'height' }, y: { size: 'height', cross: 'x', crossSize: 'width' } };
  const end = (box, axis) => box[axis] + box[axes[axis].size];
  const anchors = (box, axis) => [box[axis], box[axis] + box[axes[axis].size] / 2, end(box, axis)];
  const shifted = (box, delta) => ({ ...box, x: box.x + delta.x, y: box.y + delta.y });
  const tolerance = options => 7 / Math.max(.005, Number(options.zoom) || 1);
  const union = boxes => {
    if (!boxes.length) return null;
    const x = Math.min(...boxes.map(box => box.x)), y = Math.min(...boxes.map(box => box.y));
    return { x, y, width: Math.max(...boxes.map(box => end(box, 'x'))) - x, height: Math.max(...boxes.map(box => end(box, 'y'))) - y };
  };
  const intersects = (a, b) => end(a, 'x') >= b.x && a.x <= end(b, 'x') && end(a, 'y') >= b.y && a.y <= end(b, 'y');

  function prepare(page, selected, getBounds, viewport) {
    const ids = new Set(selected), groups = new Map();
    const box = union(page.objects.filter(object => ids.has(object.id)).map(getBounds));
    for (const object of page.objects) {
      if (ids.has(object.id) || object.type === 'connector' || object.type === 'image' && object.reference) continue;
      const key = object.group || object.id;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(getBounds(object));
    }
    const targets = [...groups].map(([id, boxes]) => ({ id, box: union(boxes), board: false })).filter(target => !viewport || intersects(target.box, viewport));
    if (!page.board.infinite) targets.push({ id: page.id, board: true, box: { x: 0, y: 0, width: page.board.width, height: page.board.height } });
    return { box, targets };
  }

  function alignmentCandidates(box, targets, axis, threshold, edge) {
    const candidates = [], values = anchors(box, axis);
    const sources = edge == null ? [0, 1, 2] : [edge === 'start' ? 0 : 2];
    for (const target of targets) for (const [index, value] of anchors(target.box, axis).entries()) for (const source of sources) {
      const delta = value - values[source];
      if (Math.abs(delta) <= threshold) candidates.push({ axis, delta, kind: 'align', target, value, priority: source === index ? 0 : 1 });
    }
    return candidates;
  }

  function sameRow(a, b, axis) {
    const cross = axes[axis].cross, overlap = Math.min(end(a, cross), end(b, cross)) - Math.max(a[cross], b[cross]);
    return overlap >= Math.min(a[axes[axis].crossSize], b[axes[axis].crossSize]) * .2 && overlap > EPS;
  }

  function neighbors(box, targets, axis) {
    const row = targets.filter(target => !target.board && sameRow(box, target.box, axis));
    return {
      before: row.filter(target => end(target.box, axis) <= box[axis] + EPS).sort((a, b) => end(b.box, axis) - end(a.box, axis)),
      after: row.filter(target => target.box[axis] >= end(box, axis) - EPS).sort((a, b) => a.box[axis] - b.box[axis])
    };
  }

  function spacingCandidates(box, targets, axis, threshold) {
    const { before, after } = neighbors(box, targets, axis), candidates = [], size = axes[axis].size;
    const add = (position, relation, first, second) => {
      const delta = position - box[axis];
      if (Math.abs(delta) <= threshold) candidates.push({ axis, delta, relation, first: first.box, second: second.box, kind: 'gap', priority: 2 });
    };
    if (before[0] && after[0] && after[0].box[axis] - end(before[0].box, axis) >= box[size]) add((end(before[0].box, axis) + after[0].box[axis] - box[size]) / 2, 'between', before[0], after[0]);
    if (before[0]) {
      const previous = before.slice(1).find(target => end(target.box, axis) <= before[0].box[axis] && sameRow(target.box, before[0].box, axis));
      if (previous) add(end(before[0].box, axis) + before[0].box[axis] - end(previous.box, axis), 'after', previous, before[0]);
    }
    if (after[0]) {
      const next = after.slice(1).find(target => target.box[axis] >= end(after[0].box, axis) && sameRow(target.box, after[0].box, axis));
      if (next) add(after[0].box[axis] - (next.box[axis] - end(after[0].box, axis)) - box[size], 'before', after[0], next);
    }
    return candidates;
  }

  function closest(candidates) {
    return candidates.sort((a, b) => Math.abs(a.delta) - Math.abs(b.delta) || a.priority - b.priority)[0] || null;
  }

  function decorations(box, targets, winners, zoom) {
    const lines = [], distances = [], seen = new Set();
    const addDistance = (a, b, axis, force = false) => {
      const value = b[axis] - end(a, axis), cross = axes[axis].cross;
      if (value <= EPS || !force && value * zoom > 240) return;
      const position = (Math.max(a[cross], b[cross]) + Math.min(end(a, cross), end(b, cross))) / 2;
      const start = end(a, axis), finish = b[axis], key = [axis, start, finish, position].map(value => typeof value === 'number' ? value.toFixed(5) : value).join(':');
      if (seen.has(key)) return;
      seen.add(key); distances.push({ axis, start, end: finish, position, value });
    };
    for (const axis of ['x', 'y']) {
      const winner = winners[axis], cross = axes[axis].cross;
      if (winner?.kind === 'align') lines.push({ axis, position: winner.value, start: Math.min(box[cross], winner.target.box[cross]) - 12 / zoom, end: Math.max(end(box, cross), end(winner.target.box, cross)) + 12 / zoom });
      if (winner?.kind === 'gap') {
        if (winner.relation === 'between') { addDistance(winner.first, box, axis, true); addDistance(box, winner.second, axis, true); }
        if (winner.relation === 'after') { addDistance(winner.first, winner.second, axis, true); addDistance(winner.second, box, axis, true); }
        if (winner.relation === 'before') { addDistance(box, winner.first, axis, true); addDistance(winner.first, winner.second, axis, true); }
      } else {
        const { before, after } = neighbors(box, targets, axis);
        if (before[0]) addDistance(before[0].box, box, axis);
        if (after[0]) addDistance(box, after[0].box, axis);
      }
    }
    return { lines, distances };
  }

  function move(session, delta, options = {}) {
    const raw = shifted(session.box, delta), fallback = options.fallback || delta;
    if (options.alt || options.enabled === false) return { delta: { ...(options.alt ? delta : fallback) }, box: shifted(session.box, options.alt ? delta : fallback), lines: [], distances: [] };
    const threshold = tolerance(options), winners = {};
    for (const axis of ['x', 'y']) winners[axis] = closest([...alignmentCandidates(raw, session.targets, axis, threshold), ...spacingCandidates(raw, session.targets, axis, threshold)]);
    const adjusted = { x: winners.x ? delta.x + winners.x.delta : fallback.x, y: winners.y ? delta.y + winners.y.delta : fallback.y };
    const box = shifted(session.box, adjusted);
    return { delta: adjusted, box, ...decorations(box, session.targets, winners, Number(options.zoom) || 1) };
  }

  function resize(session, proposed, options = {}) {
    if (options.alt || options.enabled === false) return { box: { ...proposed }, lines: [], distances: [] };
    const original = session.box, threshold = tolerance(options), winners = {};
    for (const axis of ['x', 'y']) {
      const edge = options[axis];
      winners[axis] = edge && original[axes[axis].size] > EPS ? closest(alignmentCandidates(proposed, session.targets, axis, threshold, edge)) : null;
    }
    let box = { ...proposed };
    if (options.uniform) {
      const winner = closest(Object.values(winners).filter(Boolean));
      winners.x = winners.y = null;
      if (winner) {
        const axis = winner.axis, size = axes[axis].size, amount = options[axis] === 'start' ? -winner.delta : winner.delta;
        const scale = (box[size] + amount) / original[size];
        if (scale >= .01) {
          box.width = original.width * scale; box.height = original.height * scale;
          for (const key of ['x', 'y']) box[key] = options[key] === 'start' ? end(original, key) - box[axes[key].size] : options[key] === 'end' ? original[key] : original[key] + (original[axes[key].size] - box[axes[key].size]) / 2;
          winners[axis] = winner;
        }
      }
    } else for (const axis of ['x', 'y']) {
      const winner = winners[axis], size = axes[axis].size;
      if (!winner) continue;
      const nextSize = box[size] + (options[axis] === 'start' ? -winner.delta : winner.delta);
      if (nextSize < original[size] * .01) { winners[axis] = null; continue; }
      if (options[axis] === 'start') box[axis] += winner.delta;
      box[size] = nextSize;
    }
    return { box, ...decorations(box, session.targets, winners, Number(options.zoom) || 1) };
  }

  function markup(result, zoom, unit = 'px') {
    if (!result) return '';
    const z = Math.max(.005, Number(zoom) || 1), lines = result.lines || [], distances = result.distances || [];
    const segment = (axis, position, start, finish) => axis === 'x' ? `M${position} ${start}V${finish}` : `M${start} ${position}H${finish}`;
    const format = value => {
      const divisor = unit === 'mm' ? 96 / 25.4 : unit === 'pt' ? 96 / 72 : 1;
      return Number((value / divisor).toFixed(2)) + ' ' + (['mm', 'pt'].includes(unit) ? unit : 'px');
    };
    return lines.map(line => `<path class="alignment-line" d="${segment(line.axis, line.position, line.start, line.end)}" stroke-width="${1 / z}" stroke-dasharray="${4 / z} ${3 / z}"/>`).join('') + distances.map(distance => {
      const horizontal = distance.axis === 'x', middle = (distance.start + distance.end) / 2;
      const x = horizontal ? middle : distance.position, y = horizontal ? distance.position : middle;
      const label = format(distance.value), width = (label.length * 6.4 + 10) / z, height = 18 / z;
      const tick = position => segment(distance.axis, position, distance.position - 3 / z, distance.position + 3 / z);
      return `<g class="alignment-distance"><path d="${segment(horizontal ? 'y' : 'x', distance.position, distance.start, distance.end)}${tick(distance.start)}${tick(distance.end)}" stroke-width="${1 / z}"/><rect x="${x - width / 2}" y="${y - height / 2}" width="${width}" height="${height}" rx="${3 / z}"/><text x="${x}" y="${y}" font-size="${11 / z}" text-anchor="middle" dominant-baseline="central">${label}</text></g>`;
    }).join('');
  }

  const api = Object.freeze({ prepare, move, resize, markup });
  root.IlapoGuides = api;
  if (typeof module === 'object' && module.exports) module.exports = api;
}(typeof globalThis === 'undefined' ? this : globalThis));
